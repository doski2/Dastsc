"""
agent_sidecar.py — Proceso Node (nexus-agent) para tickAgent + TelemetryHub en backend AUTO.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import threading
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

_REPO_ROOT = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."),
)
_SIDECAR_SCRIPT = os.path.join(_REPO_ROOT, "nexus-agent", "scripts", "backend-sidecar.ts")


class AgentSidecar:
    """NDJSON stdin/stdout bridge to nexus-agent backend-sidecar.ts."""

    def __init__(self) -> None:
        self._proc: Optional[subprocess.Popen] = None
        self._lock = threading.Lock()

    @property
    def available(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    def start(self) -> bool:
        if self.available:
            return True
        npx = shutil.which("npx")
        if not npx:
            logger.warning("[AgentSidecar] npx not found — backend AUTO disabled")
            return False
        if not os.path.isfile(_SIDECAR_SCRIPT):
            logger.warning("[AgentSidecar] sidecar script missing: %s", _SIDECAR_SCRIPT)
            return False
        try:
            self._proc = subprocess.Popen(
                [npx, "tsx", _SIDECAR_SCRIPT],
                cwd=_REPO_ROOT,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                bufsize=1,
            )
            logger.info("[AgentSidecar] started pid=%s", self._proc.pid)
            return True
        except OSError as exc:
            logger.warning("[AgentSidecar] failed to start: %s", exc)
            self._proc = None
            return False

    def stop(self) -> None:
        proc = self._proc
        self._proc = None
        if proc is None:
            return
        try:
            proc.terminate()
            proc.wait(timeout=3)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass

    def request(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not self.available:
            if not self.start():
                return {"ok": False, "error": "sidecar_unavailable"}
        assert self._proc is not None
        assert self._proc.stdin is not None
        assert self._proc.stdout is not None

        with self._lock:
            try:
                line = json.dumps(payload, ensure_ascii=False) + "\n"
                self._proc.stdin.write(line)
                self._proc.stdin.flush()
                response_line = self._proc.stdout.readline()
                if not response_line:
                    err = self._proc.stderr.read() if self._proc.stderr else ""
                    logger.warning("[AgentSidecar] empty response stderr=%s", err[:500])
                    self.stop()
                    return {"ok": False, "error": "sidecar_closed"}
                return json.loads(response_line)
            except (json.JSONDecodeError, OSError) as exc:
                logger.warning("[AgentSidecar] request failed: %s", exc)
                self.stop()
                return {"ok": False, "error": str(exc)}


_sidecar: Optional[AgentSidecar] = None


def get_agent_sidecar() -> AgentSidecar:
    global _sidecar
    if _sidecar is None:
        _sidecar = AgentSidecar()
    return _sidecar
