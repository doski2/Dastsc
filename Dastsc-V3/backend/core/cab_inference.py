"""
cab_inference.py — Enriquece telemetría Lua con RailDriver y latch de cabina activa.

OnCameraEnter no funciona en plugins globales; WheelSpeedAbsMS solo sirve en marcha.
El latch recuerda la última cabina inferida al parar (cab 2 sigue en Auto).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from core.raildriver import RailDriverClient, get_raildriver_client

MIN_SPEED_MS = 0.5
WHEEL_CAB2_MS = 0.15
TRACK_CAB2_MPH = 0.3
REV_FORWARD = 0.05
REV_REVERSE = -0.05


@dataclass
class CabInferenceState:
    latched_cab: int = 0  # 0 = sin latch, 1 o 2


def _speed_ms(data: Dict[str, Any]) -> float:
    try:
        return abs(float(data.get("CurrentSpeed") or data.get("Speed") or 0.0))
    except (TypeError, ValueError):
        return 0.0


def _reversal(data: Dict[str, Any], rd: RailDriverClient) -> float:
    for key in ("Reversal", "Reverser"):
        if key in data:
            try:
                return float(data[key])
            except (TypeError, ValueError):
                pass
    val = rd.get_value("UserVirtualReverser")
    if val is not None:
        return float(val)
    val = rd.get_value("Reverser")
    return float(val) if val is not None else 0.0


def _infer_from_motion(
    reversal: float,
    speed_ms: float,
    wheel_ms: Optional[float],
    track_mph: Optional[float],
) -> Optional[int]:
    if speed_ms <= MIN_SPEED_MS:
        return None

    forward = reversal > REV_FORWARD
    reverse = reversal < REV_REVERSE

    if wheel_ms is not None:
        if forward and wheel_ms < -WHEEL_CAB2_MS:
            return 2
        if reverse and wheel_ms > WHEEL_CAB2_MS:
            return 2
        if forward and wheel_ms > WHEEL_CAB2_MS:
            return 1
        if reverse and wheel_ms < -WHEEL_CAB2_MS:
            return 1

    if track_mph is not None:
        if forward and track_mph < -TRACK_CAB2_MPH:
            return 2
        if reverse and track_mph > TRACK_CAB2_MPH:
            return 2
        if forward and track_mph > TRACK_CAB2_MPH:
            return 1
        if reverse and track_mph < -TRACK_CAB2_MPH:
            return 1

    return None


def enrich_cab_telemetry(
    data: Dict[str, Any],
    state: CabInferenceState,
    client: Optional[RailDriverClient] = None,
) -> None:
    """Añade WheelSpeedMS/TrackMPH y corrige ActiveCab in-place."""
    rd = client or get_raildriver_client()
    if not rd.available:
        return

    loco = rd.get_loco_names()
    if loco:
        data["LocoName"] = " / ".join(loco)

    wheel_ms = rd.get_value("WheelSpeedAbsMS")
    track_mph = rd.get_value("TrackMPH")
    if wheel_ms is not None:
        data["WheelSpeedMS"] = wheel_ms
    if track_mph is not None:
        data["TrackMPH"] = track_mph

    try:
        reported = int(float(data.get("ActiveCab") or 1))
    except (TypeError, ValueError):
        reported = 1

    if reported == 2:
        state.latched_cab = 2
        data["ActiveCab"] = 2
        return

    reversal = _reversal(data, rd)
    speed_ms = _speed_ms(data)
    motion_cab = _infer_from_motion(reversal, speed_ms, wheel_ms, track_mph)

    if motion_cab is not None:
        state.latched_cab = motion_cab
        data["ActiveCab"] = motion_cab
        return

    if state.latched_cab in (1, 2):
        data["ActiveCab"] = state.latched_cab
