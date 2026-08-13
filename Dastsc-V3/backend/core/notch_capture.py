"""
notch_capture.py — Lectura manual de muescas desde RailDriver (GetControllerValue).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Set

from core.raildriver import ControllerInfo, RailDriverClient, RailDriverSnapshot

Profile = Dict[str, Any]
NotchEntry = Dict[str, Any]

BRAKE_CONTROL_CANDIDATES = (
    "ThrottleAndBrake",
    "TrainBrakeControl",
    "VirtualBrake",
    "DynamicBrake",
)

NOTCH_VALUE_TOLERANCE = 0.05

PRESET_LABELS = (
    "EMG",
    "B6", "B5", "B4", "B3", "B2", "B1",
    "OFF",
    "P1", "P2", "P3", "P4", "PMAX",
    "S7", "S6", "S5", "S4", "S3", "S2", "S1", "NEU",
)


def _controller_by_name(snapshot: RailDriverSnapshot, name: str) -> Optional[ControllerInfo]:
    for ctrl in snapshot.controllers:
        if ctrl.name == name:
            return ctrl
    return None


def brake_control_candidates(
    snapshot: RailDriverSnapshot,
    profile: Optional[Profile] = None,
) -> List[str]:
    """Controles de freno presentes en cabina, priorizando mappings del perfil."""
    available = {c.name for c in snapshot.controllers}
    ordered: List[str] = []

    if profile:
        mappings = profile.get("mappings") or {}
        for key in ("combined_control", "train_brake", "brake"):
            mapped = mappings.get(key)
            if mapped and mapped in available and mapped not in ordered:
                ordered.append(mapped)

    for name in BRAKE_CONTROL_CANDIDATES:
        if name in available and name not in ordered:
            ordered.append(name)

    for name in sorted(available):
        if "brake" in name.lower() and name not in ordered:
            ordered.append(name)

    return ordered


def default_brake_control(
    snapshot: RailDriverSnapshot,
    profile: Optional[Profile] = None,
) -> Optional[str]:
    candidates = brake_control_candidates(snapshot, profile)
    return candidates[0] if candidates else None


def is_combined_lever(ctrl: ControllerInfo) -> bool:
    return ctrl.min_value <= -0.5 and ctrl.max_value >= 0.5


def normalize_captured_notch_value(raw: float, ctrl: ControllerInfo) -> float:
    """
    Normaliza el valor leído de RailDriver al formato notches_throttle_brake.

    - Mando combinado (-1…1): se guarda tal cual.
    - Palanca independiente (0…1): se guarda negativo (convención split / abs al mandar).
    """
    rounded = round(float(raw), 4)
    if abs(rounded) < 0.001:
        return 0.0
    if is_combined_lever(ctrl):
        return rounded
    if ctrl.min_value >= -0.01 and ctrl.max_value > 0.01 and rounded > 0:
        return -rounded
    return rounded


def read_brake_control_value(
    client: RailDriverClient,
    control_name: str,
    snapshot: Optional[RailDriverSnapshot] = None,
) -> tuple[float, ControllerInfo]:
    snap = snapshot or client.snapshot()
    if snap is None:
        raise RuntimeError("Sin telemetría RailDriver — entra en cabina.")
    ctrl = _controller_by_name(snap, control_name)
    if ctrl is None:
        raise RuntimeError(f"Control «{control_name}» no encontrado en cabina.")

    current = client.get_value(control_name)
    if current is None:
        current = ctrl.current

    return normalize_captured_notch_value(current, ctrl), ctrl


def capture_notch(
    label: str,
    value: float,
    control_name: str,
    existing: Sequence[NotchEntry],
) -> List[NotchEntry]:
    """Añade o sustituye una muesca por etiqueta; descarta duplicados de valor."""
    clean_label = str(label).strip().upper()
    if not clean_label:
        raise ValueError("Indica una etiqueta (B1, OFF, EMG…).")

    rounded = round(float(value), 4)
    merged: List[NotchEntry] = []
    for entry in existing:
        entry_label = str(entry.get("label", "")).strip().upper()
        entry_value = round(float(entry.get("value", 0)), 4)
        if entry_label == clean_label:
            continue
        if abs(entry_value - rounded) <= NOTCH_VALUE_TOLERANCE:
            continue
        merged.append({"value": entry_value, "label": str(entry.get("label", "")).strip()})

    merged.append({"value": rounded, "label": clean_label})
    return sort_notches(merged)


def sort_notches(notches: Sequence[NotchEntry]) -> List[NotchEntry]:
    return sorted(
        ({"value": round(float(n["value"]), 4), "label": str(n["label"]).strip()} for n in notches),
        key=lambda n: n["value"],
    )


def existing_labels(notches: Sequence[NotchEntry]) -> Set[str]:
    return {str(n.get("label", "")).strip().upper() for n in notches if n.get("label")}


def suggest_next_label(notches: Sequence[NotchEntry]) -> str:
    used = existing_labels(notches)
    for preset in PRESET_LABELS:
        if preset not in used:
            return preset
    brake_count = sum(
        1 for n in notches
        if float(n.get("value", 0)) < -NOTCH_VALUE_TOLERANCE
        and float(n.get("value", 0)) > -0.99
    )
    return f"B{brake_count + 1}"


def apply_notches_to_profile(
    profile: Profile,
    notches: Sequence[NotchEntry],
    brake_control: Optional[str] = None,
) -> Profile:
    """Escribe muescas en specs y refuerza mapping del mando capturado."""
    updated = dict(profile)
    specs = dict(updated.get("specs") or {})
    specs["notches_throttle_brake"] = sort_notches(notches)
    updated["specs"] = specs

    if brake_control:
        mappings = dict(updated.get("mappings") or {})
        ctrl = _controller_by_name_from_mappings(brake_control, mappings)
        if ctrl == brake_control:
            pass
        elif brake_control == "ThrottleAndBrake":
            mappings["combined_control"] = brake_control
        elif brake_control in ("TrainBrakeControl", "VirtualBrake", "DynamicBrake"):
            mappings["train_brake"] = brake_control
        updated["mappings"] = mappings

    return updated


def _controller_by_name_from_mappings(control_name: str, mappings: Dict[str, str]) -> Optional[str]:
    for mapped in mappings.values():
        if mapped == control_name:
            return control_name
    return None
