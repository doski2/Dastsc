"""
command_bus.py — Escritura de mandos al simulador vía SendCommand.txt (Lua).

Formato: `NombreControl:valor` (una línea). Ver docs/GUIA_TECNICA_IPC.md.
"""
from __future__ import annotations

import os
import tempfile
from typing import Any, Dict, Optional

_MIN_COMBINED = -1.0
_MAX_COMBINED = 1.0
_SENDCOMMAND_FILENAME = "SendCommand.txt"
_APPLY_FLAG_FILENAME = "NexusApplyCommands.flag"

# Mandos genéricos permitidos sin mirar perfil.
_ALLOWED_CONTROLS = frozenset({
    "ThrottleAndBrake",
    "Regulator",
    "SimpleThrottle",
    "VirtualThrottle",
    "TrainBrakeControl",
    "VirtualBrake",
    "TrainBrake",
    "Throttle",
    "AWSReset",
})

# Nunca enviar sin policy explícita futura.
_BLOCKED_CONTROLS = frozenset({
    "EmergencyBrake",
    "emergency_brake",
    "Reverser",
    "UserVirtualReverser",
    "MasterKey",
})


def _clamp(value: float) -> float:
    return max(_MIN_COMBINED, min(_MAX_COMBINED, float(value)))


def apply_flag_path(send_command_path: str) -> str:
    return os.path.join(os.path.dirname(send_command_path), _APPLY_FLAG_FILENAME)


def enable_lua_commands(send_command_path: str) -> None:
    """Lua solo aplica SendCommand.txt si existe este flag (evita bloquear mandos manuales)."""
    directory = os.path.dirname(send_command_path) or "."
    os.makedirs(directory, exist_ok=True)
    with open(apply_flag_path(send_command_path), "w", encoding="utf-8", newline="\n") as flag:
        flag.write("1\n")


def purge_lua_commands(send_command_path: Optional[str]) -> bool:
    """Elimina SendCommand + flag huérfanos en plugins/ de TSC."""
    if not send_command_path:
        return False
    removed = False
    directory = os.path.dirname(send_command_path) or "."
    for name in (_SENDCOMMAND_FILENAME, _APPLY_FLAG_FILENAME):
        path = os.path.join(directory, name)
        if os.path.exists(path):
            try:
                os.remove(path)
                removed = True
            except OSError:
                pass
    return removed


def is_allowed_command(control: str, profile: Optional[Dict[str, Any]] = None) -> bool:
    name = str(control or "").strip()
    if not name or name in _BLOCKED_CONTROLS:
        return False
    if name in _ALLOWED_CONTROLS:
        return True
    if profile:
        mappings = profile.get("mappings") or {}
        if name in mappings.values():
            return True
    return False


def format_send_command_line(control: str, value: float) -> str:
    return f"{control.strip()}:{_clamp(value):.4f}"


def _split_throttle_control(profile: Optional[Dict[str, Any]]) -> Optional[str]:
    if not profile:
        return None
    mappings = profile.get("mappings") or {}
    if mappings.get("combined_control"):
        return None
    brake = mappings.get("brake") or mappings.get("train_brake")
    if not brake:
        return None
    return mappings.get("throttle") or mappings.get("regulator")


def _command_lines(
    control: str,
    value: float,
    profile: Optional[Dict[str, Any]] = None,
) -> list[str]:
    mappings = (profile or {}).get("mappings") or {}
    primary_brake = mappings.get("brake") or mappings.get("train_brake")
    secondary_brake = mappings.get("train_brake")
    if secondary_brake == primary_brake:
        secondary_brake = None

    is_brake_cmd = control == primary_brake or (secondary_brake and control == secondary_brake)
    throttle = _split_throttle_control(profile)

    lines: list[str] = []
    # NEU / soltar freno: acelerador a 0 igual que al frenar (ICE T split).
    if throttle and primary_brake and is_brake_cmd:
        lines.append(format_send_command_line(throttle, 0.0))
    lines.append(format_send_command_line(control, value))

    if (
        secondary_brake
        and primary_brake
        and control == primary_brake
        and value > 0.01
    ):
        lines.append(format_send_command_line(secondary_brake, value))
    elif (
        secondary_brake
        and primary_brake
        and control == primary_brake
        and value <= 0.01
    ):
        lines.append(format_send_command_line(secondary_brake, 0.0))

    return lines


def write_send_command(path: str, control: str, value: float, profile: Optional[Dict[str, Any]] = None) -> bool:
    """Escribe SendCommand.txt de forma atómica. Devuelve False si falla validación o I/O."""
    if not path:
        return False
    lines = _command_lines(control, value, profile)
    directory = os.path.dirname(path) or "."
    try:
        os.makedirs(directory, exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(dir=directory, prefix=".sendcmd_", text=True)
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as tmp:
                tmp.write("\n".join(lines) + "\n")
            os.replace(tmp_path, path)
        except OSError:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise
        enable_lua_commands(path)
        return True
    except OSError:
        return False


def dispatch_command(
    path: Optional[str],
    control: str,
    value: float,
    profile: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Valida y escribe un mando. Devuelve payload de ack para el frontend."""
    if not path:
        return {"ok": False, "error": "send_command_path_unavailable"}
    if not is_allowed_command(control, profile):
        return {"ok": False, "error": "command_not_allowed", "command": control}
    if not write_send_command(path, control, value, profile):
        return {"ok": False, "error": "write_failed", "command": control}
    lines = _command_lines(control, value, profile)
    return {
        "ok": True,
        "command": control,
        "value": _clamp(value),
        "line": "\n".join(lines),
    }
