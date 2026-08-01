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

# Mandos genéricos permitidos sin mirar perfil.
_ALLOWED_CONTROLS = frozenset({
    "ThrottleAndBrake",
    "Regulator",
    "TrainBrakeControl",
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


def write_send_command(path: str, control: str, value: float) -> bool:
    """Escribe SendCommand.txt de forma atómica. Devuelve False si falla validación o I/O."""
    if not path:
        return False
    line = format_send_command_line(control, value)
    directory = os.path.dirname(path) or "."
    try:
        os.makedirs(directory, exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(dir=directory, prefix=".sendcmd_", text=True)
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as tmp:
                tmp.write(line + "\n")
            os.replace(tmp_path, path)
        except OSError:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise
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
    if not write_send_command(path, control, value):
        return {"ok": False, "error": "write_failed", "command": control}
    return {
        "ok": True,
        "command": control,
        "value": _clamp(value),
        "line": format_send_command_line(control, value),
    }
