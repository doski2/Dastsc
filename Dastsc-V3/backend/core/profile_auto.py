"""
profile_auto.py — Autoselección de perfil por GetLocoName + fingerprint de mandos DLL.
"""
from __future__ import annotations

import re
from copy import deepcopy
from typing import Any, Dict, List, Optional

Profile = Dict[str, Any]

_DEFAULT_PHYSICS = {
    "max_braking_decel": 0.8,
    "brake_fill_time_s": 2.5,
    "max_braking_kn": 250,
}


def _deep_merge_dict(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    """Combina dos perfiles; override gana en conflictos de hoja."""
    merged = deepcopy(base)
    for key, value in override.items():
        if key == "extends":
            continue
        if (
            key in merged
            and isinstance(merged[key], dict)
            and isinstance(value, dict)
        ):
            merged[key] = _deep_merge_dict(merged[key], value)
        else:
            merged[key] = deepcopy(value)
    return merged


def resolve_profile_chain(
    profile: Profile,
    get_by_id,
    _visited: Optional[set[str]] = None,
) -> Profile:
    """
    Resuelve `extends` (ej. xc_class323_expert → class323).
    El hijo conserva fingerprint/aliases propios; hereda specs, physics, brakes…
    """
    visited = _visited or set()
    profile_id = str(profile.get("id", "")).lower()
    if profile_id:
        if profile_id in visited:
            return deepcopy(profile)
        visited.add(profile_id)

    extends = profile.get("extends")
    if not extends:
        return deepcopy(profile)

    base = get_by_id(str(extends))
    if base is None:
        return deepcopy(profile)

    merged_base = resolve_profile_chain(base, get_by_id, visited)
    return _deep_merge_dict(merged_base, profile)


def normalize_token(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def _profile_tokens(profile: Profile) -> List[str]:
    tokens = [profile.get("id", ""), profile.get("name", "")]
    for alias in profile.get("aliases", []):
        tokens.append(str(alias))
    return [normalize_token(t) for t in tokens if t]


def _loco_tokens(loco_names: List[str]) -> List[str]:
    tokens: List[str] = []
    seen: set[str] = set()

    def add(value: str) -> None:
        norm = normalize_token(value)
        if norm and norm not in seen:
            seen.add(norm)
            tokens.append(norm)

    for name in loco_names:
        if not name:
            continue
        add(name)
        for match in re.finditer(r"\d{3,6}", name):
            digits = match.group(0)
            add(digits)
            if len(digits) >= 6:
                add(digits[:3])

    return tokens


def _fingerprint_fully_matches(profile: Profile, controller_names: List[str]) -> bool:
    required = profile.get("fingerprint", {}).get("required_controls", [])
    if not required:
        return True
    ctrl_set = set(controller_names)
    return all(ctrl in ctrl_set for ctrl in required)


def score_profile(profile: Profile, loco_names: List[str], controller_names: List[str]) -> int:
    score = 0
    loco_tokens = _loco_tokens(loco_names)
    profile_tokens = _profile_tokens(profile)

    for loco in loco_tokens:
        for token in profile_tokens:
            if not token or not loco:
                continue
            if loco == token or loco in token or token in loco:
                score += 12

    required = profile.get("fingerprint", {}).get("required_controls", [])
    if required:
        ctrl_set = set(controller_names)
        matched = sum(1 for ctrl in required if ctrl in ctrl_set)
        if matched == len(required):
            score += matched * 8
            score += len(required) * 2
        else:
            score -= (len(required) - matched) * 10

    return score


def resolve_auto_profile(
    profiles: List[Profile],
    loco_names: List[str],
    controller_names: List[str],
) -> Optional[Profile]:
    if not profiles:
        return None

    candidates = [p for p in profiles if _fingerprint_fully_matches(p, controller_names)]
    if not candidates:
        candidates = profiles

    ranked = sorted(
        ((score_profile(p, loco_names, controller_names), p) for p in candidates),
        key=lambda item: item[0],
        reverse=True,
    )
    best_score, best = ranked[0]
    if best_score > 0:
        return best

    if loco_names:
        target = normalize_token(loco_names[0])
        for profile in profiles:
            for token in _profile_tokens(profile):
                if token and (target in token or token in target):
                    return profile

    return profiles[0]


def _mapped_controller_limits(profile: Profile, limits_by_name: Dict[str, Dict[str, float]]) -> Dict[str, Dict[str, float]]:
    mapped: Dict[str, Dict[str, float]] = {}
    mappings = profile.get("mappings", {})
    for key, controller_name in mappings.items():
        if controller_name in limits_by_name:
            mapped[key] = limits_by_name[controller_name]
    return mapped


def enrich_profile(
    profile: Profile,
    limits_by_name: Optional[Dict[str, Dict[str, float]]] = None,
    loco_names: Optional[List[str]] = None,
) -> Profile:
    enriched = deepcopy(profile)
    physics = enriched.setdefault("physics_config", {})
    for key, value in _DEFAULT_PHYSICS.items():
        physics.setdefault(key, value)

    specs = enriched.setdefault("specs", {})
    specs.setdefault(
        "notches_throttle_brake",
        [
            {"value": -0.75, "label": "B3"},
            {"value": -0.5, "label": "B2"},
            {"value": -0.25, "label": "B1"},
            {"value": 0.0, "label": "OFF"},
            {"value": 0.25, "label": "P1"},
        ],
    )

    runtime = enriched.setdefault("runtime", {})
    if loco_names:
        runtime["loco_names"] = loco_names
    if limits_by_name:
        runtime["controller_limits"] = limits_by_name
        runtime["mapped_controller_limits"] = _mapped_controller_limits(enriched, limits_by_name)

        combined = mappings.get("combined_control") if (mappings := enriched.get("mappings")) else None
        if combined and combined in limits_by_name:
            limits = limits_by_name[combined]
            runtime["combined_control_range"] = limits
            # La DLL expone min/max del eje combinado, no por muesca individual.
            # Las muescas discretas siguen viniendo del JSON del perfil.

    return enriched
