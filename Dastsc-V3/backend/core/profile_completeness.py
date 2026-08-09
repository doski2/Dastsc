"""
profile_completeness.py — Evalúa si un perfil detectado es gold, heredado, stub o roto.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

Profile = Dict[str, Any]
GetById = Callable[[str], Optional[Profile]]

GOLD_BASE_IDS = frozenset({"passenger", "class323", "icet"})
_DEFAULT_DECEL = 0.8
_MIN_GOLD_FINGERPRINT = 3
_MIN_GOLD_MAPPINGS = 5
_MIN_CALIBRATED_SAMPLES = 9


def _total_brake_samples(brake_stats: Optional[Dict[str, Any]]) -> int:
    if not brake_stats:
        return 0
    by_notch = brake_stats.get("by_notch")
    if isinstance(by_notch, dict):
        total = 0
        for entry in by_notch.values():
            if isinstance(entry, dict):
                total += int(entry.get("samples") or 0)
        return total
    total = 0
    for entry in brake_stats.values():
        if isinstance(entry, dict):
            total += int(entry.get("samples") or 0)
    return total


def _is_self_contained_gold(profile: Profile) -> bool:
    physics = profile.get("physics_config") or {}
    fingerprint = (profile.get("fingerprint") or {}).get("required_controls") or []
    mappings = profile.get("mappings") or {}
    return (
        physics.get("station_reaction_time_s") is not None
        and bool(profile.get("brakes"))
        and len(fingerprint) >= _MIN_GOLD_FINGERPRINT
        and len(mappings) >= _MIN_GOLD_MAPPINGS
    )


def _score_level(level: str, resolved: Profile, calibrated: bool) -> int:
    if level == "broken":
        return 10
    if level == "gold":
        return 98 if calibrated else 92
    if level == "inherited":
        return 88 if calibrated else 76
    physics = resolved.get("physics_config") or {}
    mappings = resolved.get("mappings") or {}
    custom_physics = physics.get("max_braking_decel", _DEFAULT_DECEL) != _DEFAULT_DECEL
    score = 30
    score += min(20, len(mappings) * 4)
    if custom_physics:
        score += 12
    if resolved.get("brakes"):
        score += 8
    if calibrated:
        score += 15
    return min(65, score)


def assess_profile_completeness(
    picked: Profile,
    resolved: Profile,
    get_by_id: Optional[GetById] = None,
    brake_stats: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Devuelve nivel, puntuación y avisos para UI."""
    warnings: List[str] = []
    picked_id = str(picked.get("id") or "unknown")
    extends = picked.get("extends")
    calibrated = _total_brake_samples(brake_stats) >= _MIN_CALIBRATED_SAMPLES
    brake_samples = _total_brake_samples(brake_stats)

    if extends:
        base_exists = get_by_id is None or get_by_id(str(extends)) is not None
        if not base_exists:
            return {
                "level": "broken",
                "score": 10,
                "warnings": [f"extends '{extends}' no existe en profiles/"],
                "picked_id": picked_id,
                "extends": str(extends),
                "calibrated": False,
                "brake_samples": brake_samples,
            }
        level = "inherited"
        if str(extends) in GOLD_BASE_IDS:
            warnings.append(f"Variante de '{extends}' — hereda muescas y física calibrada")
        else:
            warnings.append(f"Hereda de '{extends}' — verifica que el perfil base esté completo")
    elif _is_self_contained_gold(resolved):
        level = "gold"
    else:
        level = "stub"

    physics = resolved.get("physics_config") or {}
    fingerprint = (resolved.get("fingerprint") or {}).get("required_controls") or []
    mappings = resolved.get("mappings") or {}

    if level == "stub":
        if physics.get("max_braking_decel", _DEFAULT_DECEL) == _DEFAULT_DECEL:
            warnings.append("Física genérica — el plan de frenado puede ser conservador o impreciso")
        if not resolved.get("brakes"):
            warnings.append("Sin bloque brakes — tipo de freno no definido")
        if len(mappings) < 4:
            warnings.append("Mappings mínimos — mandos extra (AWS, DSD…) pueden no enviarse")
        if len(fingerprint) <= 1:
            warnings.append("Fingerprint débil — riesgo de detectar el tren equivocado")

    if not calibrated:
        warnings.append(
            "Sin calibración de frenado (pocas muestras) — el plan usa deceleración teórica",
        )

    return {
        "level": level,
        "score": _score_level(level, resolved, calibrated),
        "warnings": warnings,
        "picked_id": picked_id,
        "extends": str(extends) if extends else None,
        "calibrated": calibrated,
        "brake_samples": brake_samples,
    }
