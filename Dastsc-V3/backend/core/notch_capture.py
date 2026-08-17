"""
notch_capture.py — Lectura manual de muescas desde RailDriver (GetControllerValue).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
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

# Class 350 Expert (TrainBrakeControl): release → initial → % → máximo → emergencia
CLASS350_EXPERT_CAPTURE_ORDER = (
    "OFF",
    "INIT",
    "10%",
    "20%",
    "30%",
    "40%",
    "50%",
    "60%",
    "70%",
    "80%",
    "90%",
    "100%",
    "EMG",
)


def _percent_notch_labels(step: int = 10) -> tuple[str, ...]:
    return tuple(f"{i}%" for i in range(step, 101, step))


# Acela Express Expert (VirtualBrake): detentes RailDriver 0, 0.2 … 0.8, 0.99, 1
ACELA_EXPERT_BRAKE_CAPTURE_ORDER = (
    "OFF",
    "20%",
    "40%",
    "60%",
    "80%",
    "99%",
    "EMG",
)

# VirtualBrake genérico sin detentes fijos conocidos (captura 10 %…100 %)
VIRTUAL_GRADUATED_PERCENT_CAPTURE_ORDER = (
    "OFF",
) + _percent_notch_labels() + (
    "EMG",
)

PROFILE_CAPTURE_SEQUENCES: Dict[str, tuple[str, ...]] = {
    "class350_expert_wcml": CLASS350_EXPERT_CAPTURE_ORDER,
    "class350_expert": CLASS350_EXPERT_CAPTURE_ORDER,
    "acelaexpress_expert": ACELA_EXPERT_BRAKE_CAPTURE_ORDER,
    "graduated_percent_virtual": VIRTUAL_GRADUATED_PERCENT_CAPTURE_ORDER,
}

EXPERT_FIXED_LABELS = frozenset({"OFF", "INIT", "EMG"})
_PERCENT_LABEL_RE = re.compile(r"^(\d+)\s*%?$", re.IGNORECASE)


def _profile_match_key(profile: Optional[Profile]) -> Optional[str]:
    if not profile:
        return None
    pid = str(profile.get("id") or "").lower().replace(" ", "_")
    name = str(profile.get("name") or "").lower()
    haystack = f"{pid} {name}"
    for key in PROFILE_CAPTURE_SEQUENCES:
        if key in haystack or key.replace("_", " ") in haystack:
            return key
    if "350" in haystack and "expert" in haystack:
        return "class350_expert_wcml"
    if "acela" in haystack and "expert" in haystack:
        return "acelaexpress_expert"

    brakes = profile.get("brakes") or {}
    if str(brakes.get("response_speed", "")).upper() == "GRADUATED_PERCENT":
        mappings = profile.get("mappings") or {}
        brake_ctrl = str(
            brakes.get("train_control")
            or mappings.get("train_brake")
            or mappings.get("brake")
            or ""
        )
        if brake_ctrl == "VirtualBrake":
            return "graduated_percent_virtual"
        if brake_ctrl == "TrainBrakeControl" or "350" in haystack:
            return "class350_expert_wcml"
        return "graduated_percent_virtual"
    return None


def describe_graduated_capture(profile: Optional[Profile] = None) -> Optional[Dict[str, str]]:
    """Texto de ayuda para el asistente de captura (control + pasos)."""
    key = _profile_match_key(profile)
    if not key:
        return None
    mappings = (profile or {}).get("mappings") or {}
    brakes = (profile or {}).get("brakes") or {}
    control = str(
        brakes.get("train_control")
        or mappings.get("train_brake")
        or mappings.get("brake")
        or ("TrainBrakeControl" if "350" in key else "VirtualBrake")
    )
    if key in ("class350_expert", "class350_expert_wcml"):
        title = "Class 350 Expert"
        steps = "OFF/release → INIT → 10%…100% → EMG"
    elif key == "acelaexpress_expert":
        title = "Acela Express Expert"
        steps = "OFF/release → 20% → 40% → 60% → 80% → 99% → EMG (VirtualBrake)"
    else:
        title = "Freno gradual %"
        steps = "OFF/release → 10%…100% → EMG"
    return {
        "title": title,
        "control": control,
        "steps": steps,
        "sequence": " → ".join(capture_sequence_for_profile(profile)),
    }


def capture_sequence_for_profile(profile: Optional[Profile] = None) -> tuple[str, ...]:
    key = _profile_match_key(profile)
    if key and key in PROFILE_CAPTURE_SEQUENCES:
        return PROFILE_CAPTURE_SEQUENCES[key]
    return PRESET_LABELS


def preset_labels_for_profile(profile: Optional[Profile] = None) -> tuple[str, ...]:
    """Etiquetas sugeridas en el combo del asistente (secuencia + presets genéricos)."""
    seq = capture_sequence_for_profile(profile)
    merged: List[str] = []
    seen: set[str] = set()
    for label in seq + PRESET_LABELS:
        upper = label.upper()
        if upper in seen:
            continue
        seen.add(upper)
        merged.append(label)
    return tuple(merged)


def is_expert_percent_brake_profile(profile: Optional[Profile] = None) -> bool:
    """Perfiles con captura OFF/INIT o % y sin deduplicar por valor RailDriver."""
    return _profile_match_key(profile) is not None


def normalize_notch_label(label: str, profile: Optional[Profile] = None) -> str:
    """
    Canonicaliza etiquetas de muesca.

    Perfiles graduados %: 10 / 10% → «10%»; OFF, INIT, EMG en mayúsculas.
    Resto: mayúsculas estándar (B1, OFF, EMG…).
    """
    raw = str(label).strip()
    if not raw:
        return raw
    if not is_expert_percent_brake_profile(profile):
        return raw.upper()
    upper = raw.upper()
    if upper in EXPERT_FIXED_LABELS:
        return upper
    match = _PERCENT_LABEL_RE.fullmatch(raw)
    if match:
        return f"{int(match.group(1))}%"
    return upper


def canonicalize_notches(
    notches: Sequence[NotchEntry],
    profile: Optional[Profile] = None,
) -> List[NotchEntry]:
    """Reescribe etiquetas al formato canónico del perfil (p. ej. añade %)."""
    return sort_notches([
        {
            "value": round(float(n.get("value", 0)), 4),
            "label": normalize_notch_label(str(n.get("label", "")), profile),
        }
        for n in notches
        if str(n.get("label", "")).strip()
    ])


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
    if is_expert_percent_brake_profile(profile):
        for preferred in ("TrainBrakeControl", "VirtualBrake"):
            if preferred in candidates:
                return preferred
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


@dataclass(frozen=True)
class CaptureNotchResult:
    notches: List[NotchEntry]
    evicted_labels: tuple[str, ...] = ()
    duplicate_value_labels: tuple[str, ...] = ()


def capture_notch(
    label: str,
    value: float,
    control_name: str,
    existing: Sequence[NotchEntry],
    profile: Optional[Profile] = None,
) -> CaptureNotchResult:
    """
    Añade o sustituye una muesca por etiqueta.

    Perfiles genéricos: descarta otras muescas con valor muy parecido (±NOTCH_VALUE_TOLERANCE).
    Class 350 Expert: conserva todas las etiquetas aunque RailDriver repita el mismo valor
    (el simulador puede exponer ~8 detentes aunque la cabina muestre más posiciones).
    """
    clean_label = normalize_notch_label(label, profile)
    if not clean_label:
        raise ValueError("Indica una etiqueta (B1, OFF, EMG…).")

    rounded = round(float(value), 4)
    dedupe_by_value = not is_expert_percent_brake_profile(profile)
    merged: List[NotchEntry] = []
    evicted: List[str] = []
    duplicate_labels: List[str] = []
    for entry in existing:
        entry_label = normalize_notch_label(str(entry.get("label", "")), profile)
        entry_value = round(float(entry.get("value", 0)), 4)
        if entry_label == clean_label:
            continue
        if abs(entry_value - rounded) <= NOTCH_VALUE_TOLERANCE:
            if dedupe_by_value:
                evicted.append(entry_label)
                continue
            duplicate_labels.append(entry_label)
        merged.append({"value": entry_value, "label": entry_label})

    merged.append({"value": rounded, "label": clean_label})
    return CaptureNotchResult(
        notches=sort_notches(merged),
        evicted_labels=tuple(evicted),
        duplicate_value_labels=tuple(duplicate_labels),
    )


def sort_notches(notches: Sequence[NotchEntry]) -> List[NotchEntry]:
    return sorted(
        ({"value": round(float(n["value"]), 4), "label": str(n["label"]).strip()} for n in notches),
        key=lambda n: n["value"],
    )


def existing_labels(
    notches: Sequence[NotchEntry],
    profile: Optional[Profile] = None,
) -> Set[str]:
    return {
        normalize_notch_label(str(n.get("label", "")), profile)
        for n in notches
        if str(n.get("label", "")).strip()
    }


def suggest_next_label(
    notches: Sequence[NotchEntry],
    profile: Optional[Profile] = None,
) -> str:
    used = existing_labels(notches, profile)
    for preset in capture_sequence_for_profile(profile):
        canonical = normalize_notch_label(preset, profile)
        if canonical not in used:
            return canonical
    if is_expert_percent_brake_profile(profile):
        return ""
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
    specs["notches_throttle_brake"] = canonicalize_notches(notches, updated)
    updated["specs"] = specs

    if brake_control:
        mappings = dict(updated.get("mappings") or {})
        if brake_control == "ThrottleAndBrake":
            mappings["combined_control"] = brake_control
        elif brake_control in ("TrainBrakeControl", "VirtualBrake", "DynamicBrake"):
            mappings["train_brake"] = brake_control
            brakes = dict(updated.get("brakes") or {})
            brakes["train_control"] = brake_control
            brakes.setdefault("system", "AIR_SERVICE")
            brakes.setdefault("response_speed", "GRADUATED_PERCENT")
            updated["brakes"] = brakes
        else:
            mappings["brake"] = brake_control
        updated["mappings"] = mappings

    return updated


def _controller_by_name_from_mappings(control_name: str, mappings: Dict[str, str]) -> Optional[str]:
    for mapped in mappings.values():
        if mapped == control_name:
            return control_name
    return None
