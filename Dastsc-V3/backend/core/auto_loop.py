"""
auto_loop.py — Bucle AUTO en backend (Fase 2): tickAgent sidecar + command_bus.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, Optional, Tuple

import core.brake_log as brake_log
import core.command_bus as command_bus
from core.agent_sidecar import get_agent_sidecar

logger = logging.getLogger(__name__)

AUTO_RELEASE_RETRY_S = 2.0
AUTO_APPLY_RETRY_S = 0.5
_VALID_POLICY = frozenset({"SUGGEST", "ARM", "AUTO"})
_VALID_GRADIENT_SIGN = frozenset({"auto", "+", "-"})


class BackendAutoLoop:
    def __init__(self) -> None:
        self.policy_mode: str = "SUGGEST"
        self.gradient_sign: str = "auto"
        self._last_sent_key: Optional[str] = None
        self._last_sent_at: float = 0.0
        self._sidecar_config_key: Optional[str] = None
        self._brake_stats_profile: Optional[str] = None
        self._brake_stats_cache: Dict[str, Any] = {}

    @property
    def backend_auto_active(self) -> bool:
        return self.policy_mode == "AUTO"

    def set_policy(self, mode: str) -> bool:
        if mode not in _VALID_POLICY:
            return False
        if mode != self.policy_mode:
            self._last_sent_key = None
            if mode == "SUGGEST":
                get_agent_sidecar().request({"op": "reset"})
        self.policy_mode = mode
        return True

    def set_gradient_sign(self, sign: str) -> bool:
        if sign not in _VALID_GRADIENT_SIGN:
            return False
        self.gradient_sign = sign
        self._sidecar_config_key = None
        return True

    def _brake_stats_for(self, profile_id: Optional[str]) -> Dict[str, Any]:
        if not profile_id:
            return {}
        if profile_id == self._brake_stats_profile:
            return self._brake_stats_cache
        self._brake_stats_profile = profile_id
        self._brake_stats_cache = brake_log.get_stats(profile=profile_id)
        return self._brake_stats_cache

    def _sync_sidecar_config(self, profile: Optional[Dict[str, Any]]) -> None:
        profile_id = str(profile.get("id") or "") if profile else ""
        config_key = f"{profile_id}|{self.gradient_sign}"
        if config_key == self._sidecar_config_key:
            return
        get_agent_sidecar().request({
            "op": "config",
            "profile": profile,
            "gradientSign": self.gradient_sign,
        })
        self._sidecar_config_key = config_key

    def run_tick(
        self,
        telemetry: Dict[str, Any],
        *,
        game_linked: bool,
        profile: Optional[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        if self.policy_mode != "AUTO":
            return None
        if not profile or not profile.get("specs"):
            return None

        self._sync_sidecar_config(profile)
        profile_id = str(profile.get("id") or "")
        response = get_agent_sidecar().request({
            "op": "tick",
            "telemetry": telemetry,
            "policyMode": "AUTO",
            "gameLinked": game_linked,
            "profile": profile,
            "brakeStats": self._brake_stats_for(profile_id),
        })
        if not response.get("ok"):
            logger.debug("[BackendAuto] tick failed: %s", response.get("error"))
            return None
        return response

    def should_dispatch(
        self,
        action: Optional[Dict[str, Any]],
        still_braking: bool,
    ) -> bool:
        if not action:
            return False
        command = str(action.get("command") or "").strip()
        if not command:
            return False
        try:
            value = float(action.get("value", 0))
        except (TypeError, ValueError):
            return False

        key = f"{command}:{value:.4f}"
        now = time.time()
        is_release = abs(value) < 0.01

        if self._last_sent_key == key:
            if is_release:
                if not still_braking:
                    return False
                if now - self._last_sent_at < AUTO_RELEASE_RETRY_S:
                    return False
            elif still_braking:
                # Misma muesca y freno ya confirmado en telemetría.
                return False
            elif now - self._last_sent_at < AUTO_APPLY_RETRY_S:
                # IPC one-shot: reassert hasta que el sim responda (fill / lag).
                return False
        self._last_sent_key = key
        self._last_sent_at = now
        return True

    def dispatch_action(
        self,
        action: Dict[str, Any],
        send_command_path: Optional[str],
        profile: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        command = str(action.get("command") or "").strip()
        try:
            value = float(action.get("value", 0))
        except (TypeError, ValueError):
            return {"type": "AUTO_COMMAND_ACK", "ok": False, "error": "invalid_value"}
        result = command_bus.dispatch_command(
            send_command_path,
            command,
            value,
            profile,
        )
        payload = {"type": "AUTO_COMMAND_ACK", **result}
        if result.get("ok"):
            logger.info(
                "[BackendAuto] %s=%s (%s)",
                command,
                result.get("value"),
                action.get("reason"),
            )
        return payload

    def process_telemetry(
        self,
        telemetry: Dict[str, Any],
        *,
        game_linked: bool,
        profile: Optional[Dict[str, Any]],
        send_command_path: Optional[str],
    ) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
        """
        Returns (agent_tick_broadcast, command_ack_broadcast).
        """
        tick_result = self.run_tick(
            telemetry,
            game_linked=game_linked,
            profile=profile,
        )
        if not tick_result:
            return None, None

        agent = tick_result.get("agent")
        if not isinstance(agent, dict):
            return None, None

        agent_msg: Dict[str, Any] = {
            "type": "AGENT_TICK",
            "agent": agent,
            "backendAutoActive": True,
            "policyMode": self.policy_mode,
        }

        if agent.get("blockedReason"):
            return agent_msg, None
        if any(
            isinstance(e, dict) and e.get("kind") == "SAFETY"
            for e in (agent.get("horizon") or [])
        ):
            return agent_msg, None

        raw_action = agent.get("suggestedAction")
        if not isinstance(raw_action, dict):
            return agent_msg, None
        action: Dict[str, Any] = raw_action
        still_braking = bool(tick_result.get("stillBraking"))
        if not self.should_dispatch(action, still_braking):
            return agent_msg, None

        ack = self.dispatch_action(action, send_command_path, profile)
        return agent_msg, ack


_auto_loop: Optional[BackendAutoLoop] = None


def get_auto_loop() -> BackendAutoLoop:
    global _auto_loop
    if _auto_loop is None:
        _auto_loop = BackendAutoLoop()
    return _auto_loop
