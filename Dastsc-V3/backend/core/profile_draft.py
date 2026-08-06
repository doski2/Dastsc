"""
profile_draft.py — Borrador de perfil desde snapshot RailDriver.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Set

Profile = Dict[str, Any]

PROFILE_HINTS: dict[str, list[str]] = {
    "combined_control": ["ThrottleAndBrake"],
    "throttle": ["Regulator", "SimpleThrottle", "VirtualThrottle"],
    "brake": ["VirtualBrake", "TrainBrakeControl"],
    "regulator": ["Regulator", "SimpleThrottle"],
    "train_brake": ["TrainBrakeControl", "DynamicBrake"],
    "reverser": ["Reverser", "UserVirtualReverser", "SimpleChangeDirection"],
    "brake_cylinder": ["TrainBrakeCylinderPressureBAR"],
    "main_reservoir": ["MainReservoirPressureBAR"],
    "brake_pipe": ["BrakePipePressureBAR", "TrainBrakePipePressureBAR"],
    "ammeter": ["Ammeter"],
    "current": ["Current"],
    "effort": ["TractiveEffort"],
    "aws": ["AWS"],
    "aws_warning": ["AWSWarnCount", "AWSClearCount"],
    "aws_reset": ["AWSReset"],
    "dsd": ["DSD", "DSDAlarm", "DVDAlarm"],
    "dra": ["DRA", "DRAButton"],
    "doors_left": ["DoorsOpenCloseLeft"],
    "doors_right": ["DoorsOpenCloseRight"],
    "emergency_brake": ["EmergencyBrake"],
    "master_key": ["MasterKey"],
    "pantograph": ["Pantograph", "PantographControl"],
    "afb": ["AFB"],
    "vigil_alarm": ["VigilAlarm"],
    "lzb_active": ["LZBActive"],
}

GERMAN_FINGERPRINT_PRIORITY = [
    "VirtualBrake",
    "SimpleThrottle",
    "Regulator",
    "TrainBrakeControl",
    "AFB",
    "LZBActive",
    "VigilAlarm",
    "PantographControl",
    "EmergencyBrake",
    "Reverser",
]

GERMAN_SERVICE_NOTCHES: list[dict[str, Any]] = [
    {"value": -1.0, "label": "EMG"},
    {"value": -0.7, "label": "S7"},
    {"value": -0.6, "label": "S6"},
    {"value": -0.5, "label": "S5"},
    {"value": -0.4, "label": "S4"},
    {"value": -0.3, "label": "S3"},
    {"value": -0.2, "label": "S2"},
    {"value": -0.1, "label": "S1"},
    {"value": 0.0, "label": "NEU"},
    {"value": 0.2, "label": "P1"},
    {"value": 0.4, "label": "P2"},
    {"value": 0.6, "label": "P3"},
    {"value": 0.8, "label": "P4"},
    {"value": 1.0, "label": "PMAX"},
]

FINGERPRINT_PRIORITY = [
    "ThrottleAndBrake",
    "Regulator",
    "TrainBrakeControl",
    "DRA",
    "DRAButton",
    "DSD",
    "DSDAlarm",
    "DVDAlarm",
    "AWS",
    "UserVirtualReverser",
    "Reverser",
    "RegenBrakesSwitch",
    "EmergencyBrake",
]

UK_EMU_CONTROLS = frozenset({
    "ThrottleAndBrake",
    "DRA",
    "DVDAlarm",
    "DSD",
    "AWS",
    "UserVirtualReverser",
})


def pick_mapping(available: set[str], candidates: list[str]) -> str | None:
    for name in candidates:
        if name in available:
            return name
    return None


def suggest_extends_base(available_controls: set[str]) -> Optional[str]:
    """Sugiere un perfil base si el tren parece EMU UK con mando combinado."""
    if "ThrottleAndBrake" not in available_controls:
        return None
    if len(available_controls & UK_EMU_CONTROLS) >= 2:
        return "class323"
    return None


def control_layout(available_controls: set[str]) -> str:
    if "ThrottleAndBrake" in available_controls:
        return "combined"
    if "Regulator" in available_controls and "TrainBrakeControl" in available_controls:
        return "split"
    return "unknown"


def suggest_profile_template(available_controls: set[str]) -> Optional[str]:
    """Perfil existente a usar como plantilla (sin extends)."""
    if control_layout(available_controls) == "split":
        if "LZBActive" in available_controls and "AFB" in available_controls:
            return "icet"
        if "AFB" in available_controls:
            return "german_expert"
    return None


def build_profile_draft(snapshot, profile_id: str, extends: Optional[str] = None) -> Profile:
    names = {c.name for c in snapshot.controllers}
    by_name = {c.name: c for c in snapshot.controllers}
    layout = control_layout(names)

    mappings: dict[str, str] = {}
    if layout == "split":
        throttle = pick_mapping(names, PROFILE_HINTS["throttle"])
        brake = pick_mapping(names, PROFILE_HINTS["brake"])
        if throttle:
            mappings["throttle"] = throttle
        if brake:
            mappings["brake"] = brake
        for key, candidates in PROFILE_HINTS.items():
            if key in ("combined_control", "throttle", "brake", "regulator", "train_brake"):
                continue
            picked = pick_mapping(names, candidates)
            if picked:
                mappings[key] = picked
    else:
        for key, candidates in PROFILE_HINTS.items():
            if key in ("throttle", "brake"):
                continue
            picked = pick_mapping(names, candidates)
            if picked:
                mappings[key] = picked

    if layout == "split":
        fingerprint = [n for n in GERMAN_FINGERPRINT_PRIORITY if n in names][:8]
    else:
        fingerprint = [n for n in FINGERPRINT_PRIORITY if n in names][:8]
    if not fingerprint:
        fingerprint = sorted(names)[:6]

    specs: dict[str, Any] = {}
    if "TrainBrakeCylinderPressureBAR" in by_name:
        specs["max_brake_cyl"] = by_name["TrainBrakeCylinderPressureBAR"].max_value
    if "MainReservoirPressureBAR" in by_name:
        specs["max_main_res"] = by_name["MainReservoirPressureBAR"].max_value
    if "Ammeter" in by_name:
        specs["max_ammeter"] = abs(by_name["Ammeter"].max_value)
    if "Current" in by_name:
        specs["max_current"] = abs(by_name["Current"].max_value)

    combined = mappings.get("combined_control")
    notches: list[dict[str, Any]] = []
    if layout == "split" and ("AFB" in names or "LZBActive" in names):
        notches = list(GERMAN_SERVICE_NOTCHES)
    elif combined and combined in by_name:
        c = by_name[combined]
        if c.min_value <= -0.5:
            notches.extend([
                {"value": -1.0, "label": "EMG"},
                {"value": -0.75, "label": "B3"},
                {"value": -0.5, "label": "B2"},
                {"value": -0.25, "label": "B1"},
                {"value": 0.0, "label": "OFF"},
                {"value": 0.25, "label": "P1"},
                {"value": 0.5, "label": "P2"},
                {"value": 0.75, "label": "P3"},
                {"value": 1.0, "label": "P4"},
            ])
    elif layout == "split":
        notches = list(GERMAN_SERVICE_NOTCHES)
    elif "Regulator" in by_name and "TrainBrakeControl" in by_name:
        notches = [
            {"value": 0.0, "label": "OFF"},
            {"value": 0.25, "label": "P1"},
            {"value": 0.5, "label": "P2"},
            {"value": 0.75, "label": "P3"},
            {"value": 1.0, "label": "P4"},
        ]

    if notches:
        specs["notches_throttle_brake"] = notches

    aliases = list(snapshot.loco_names)
    for match in re.finditer(r"\d{3,6}", " ".join(snapshot.loco_names)):
        aliases.append(match.group(0))
        if len(match.group(0)) >= 6:
            aliases.append(match.group(0)[:3])

    speed_unit = "KPH" if "SpeedometerKPH" in names else "MPH"
    draft: Profile = {
        "name": profile_id.replace("_", " ").title(),
        "aliases": sorted(set(aliases)),
        "fingerprint": {"required_controls": fingerprint},
        "mappings": mappings,
        "specs": specs,
        "visuals": {"unit": speed_unit, "color": "#c0392b" if layout == "split" else "#3498db"},
    }

    suggested = extends or suggest_extends_base(names)
    if suggested:
        draft["extends"] = suggested
    elif layout != "split":
        draft["physics_config"] = {
            "max_braking_decel": 1.0,
            "brake_fill_time_s": 5,
            "station_reaction_time_s": 1.2,
        }
        draft["brakes"] = {
            "type": "COMBINED_BLENDED",
            "control": mappings.get("combined_control", "ThrottleAndBrake"),
            "has_dynamic": "RegenBrakesSwitch" in names,
            "system": "AIR_BRITISH",
        }
    else:
        draft["physics_config"] = {
            "max_braking_decel": 1.2,
            "brake_fill_time_s": 4,
            "dynamic_brake_ratio": 0.9,
            "station_reaction_time_s": 1.0,
        }
        draft["brakes"] = {
            "type": "SPLIT",
            "throttle": mappings.get("throttle", "Regulator"),
            "brake": mappings.get("brake", "TrainBrakeControl"),
            "system": "AIR_GERMAN",
            "has_dynamic": "DynamicBrake" in names,
        }
        template = suggest_profile_template(names)
        if template:
            draft["_suggested_template"] = template

    return draft


def merge_draft_into_profile(existing: Profile, draft: Profile) -> Profile:
    """Fusiona borrador capturado sin pisar campos ya completados manualmente."""
    merged = dict(existing)

    draft_aliases = draft.get("aliases") or []
    existing_aliases = set(merged.get("aliases") or [])
    merged["aliases"] = sorted(existing_aliases | set(draft_aliases))

    if draft.get("fingerprint"):
        merged["fingerprint"] = draft["fingerprint"]

    mappings = dict(merged.get("mappings") or {})
    for key, value in (draft.get("mappings") or {}).items():
        mappings.setdefault(key, value)
    merged["mappings"] = mappings

    specs = dict(merged.get("specs") or {})
    for key, value in (draft.get("specs") or {}).items():
        if key == "notches_throttle_brake" and specs.get("notches_throttle_brake"):
            continue
        specs[key] = value
    merged["specs"] = specs

    if not merged.get("extends") and draft.get("extends"):
        merged["extends"] = draft["extends"]

    if not merged.get("name"):
        merged["name"] = draft.get("name")

    if not merged.get("visuals"):
        merged["visuals"] = draft.get("visuals")

    if not merged.get("extends"):
        if not merged.get("physics_config") and draft.get("physics_config"):
            merged["physics_config"] = draft["physics_config"]
        if not merged.get("brakes") and draft.get("brakes"):
            merged["brakes"] = draft["brakes"]

    return merged


def apply_extends_template(profile: Profile, base_id: str) -> Profile:
    """Deja solo detección/mappings en el hijo; el resto lo hereda el base."""
    slim = dict(profile)
    slim["extends"] = base_id
    for key in ("physics_config", "brakes"):
        slim.pop(key, None)
    specs = dict(slim.get("specs") or {})
    specs.pop("notches_throttle_brake", None)
    if specs:
        slim["specs"] = specs
    else:
        slim.pop("specs", None)
    return slim
