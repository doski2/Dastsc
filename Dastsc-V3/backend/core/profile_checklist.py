"""
profile_checklist.py — Lista de comprobación detallada para completar perfiles.
"""
from __future__ import annotations

from typing import Any, Callable, Collection, Dict, List, Optional, Set

from core.profile_auto import enrich_profile, resolve_profile_chain
from core.profile_completeness import assess_profile_completeness

Profile = Dict[str, Any]
GetById = Callable[[str], Optional[Profile]]

STATUS_OK = "ok"
STATUS_WARN = "warn"
STATUS_MISSING = "missing"
STATUS_INHERITED = "inherited"

RECOMMENDED_MAPPINGS: list[tuple[str, str, bool]] = [
    ("combined_control", "Mando combinado acelerador/freno (UK)", True),
    ("throttle", "Acelerador (Regulator)", False),
    ("brake", "Freno independiente (TrainBrakeControl)", False),
    ("reverser", "Reversora", True),
    ("aws", "AWS", False),
    ("dsd", "DSD / alarma vigilancia", False),
    ("dra", "DRA", False),
    ("doors_left", "Puertas izquierda", False),
    ("doors_right", "Puertas derecha", False),
    ("brake_cylinder", "Presión cilindro freno", False),
    ("brake_pipe", "Presión tubo freno", False),
]


def _item(
    key: str,
    label: str,
    status: str,
    detail: str,
    *,
    required: bool = True,
    action: str = "manual",
) -> Dict[str, Any]:
    return {
        "key": key,
        "label": label,
        "status": status,
        "detail": detail,
        "required": required,
        "action": action,
    }


def _mapping_layout(mappings: Dict[str, Any]) -> str:
    if mappings.get("combined_control"):
        return "combined"
    has_throttle = bool(mappings.get("throttle") or mappings.get("regulator"))
    has_brake = bool(mappings.get("brake") or mappings.get("train_brake"))
    if has_throttle and has_brake:
        return "split"
    return "unknown"


def _inherits(extends: Optional[str], get_by_id: Optional[GetById]) -> bool:
    return bool(extends and get_by_id and get_by_id(str(extends)) is not None)


def build_profile_checklist(
    picked: Profile,
    get_by_id: Optional[GetById] = None,
    brake_stats: Optional[Dict[str, Any]] = None,
    available_controls: Optional[Collection[str]] = None,
) -> Dict[str, Any]:
    """Devuelve checklist, resumen y perfil resuelto/enriquecido."""
    picked = dict(picked)
    if picked.get("id"):
        picked["id"] = str(picked["id"])

    resolved = resolve_profile_chain(picked, get_by_id) if get_by_id else picked
    enriched = enrich_profile(resolved)
    extends = picked.get("extends")
    inherits = _inherits(extends, get_by_id)
    ctrl_set: Set[str] = set(available_controls or [])

    items: List[Dict[str, Any]] = []

    profile_id = str(picked.get("id") or "").strip()
    items.append(_item(
        "id",
        "ID de perfil (nombre del archivo)",
        STATUS_OK if profile_id else STATUS_MISSING,
        profile_id or "Ej.: class375",
        action="manual",
    ))

    name = str(picked.get("name") or "").strip()
    items.append(_item(
        "name",
        "Nombre legible",
        STATUS_OK if name else STATUS_WARN,
        name or "Opcional pero recomendado",
        required=False,
    ))

    aliases = picked.get("aliases") or []
    alias_status = STATUS_OK if len(aliases) >= 2 else (STATUS_WARN if aliases else STATUS_MISSING)
    items.append(_item(
        "aliases",
        "Aliases para detección AUTO",
        alias_status,
        f"{len(aliases)} alias(es)" if aliases else "Captura en cabina (RV:…, Class …)",
        action="capture",
    ))

    if extends:
        base_ok = get_by_id is None or get_by_id(str(extends)) is not None
        items.append(_item(
            "extends",
            f"Hereda de «{extends}»",
            STATUS_OK if base_ok else STATUS_MISSING,
            "Base encontrado" if base_ok else f"No existe profiles/{extends}.json",
            action="manual",
        ))
    else:
        items.append(_item(
            "extends",
            "Perfil base (extends)",
            STATUS_WARN,
            "Opcional — usa class323 para EMU UK con ThrottleAndBrake",
            required=False,
            action="extends",
        ))

    fingerprint = (picked.get("fingerprint") or {}).get("required_controls") or []
    if inherits:
        fp_status = STATUS_OK if fingerprint else STATUS_WARN
        fp_detail = f"{len(fingerprint)} controles (detección variante)"
    elif len(fingerprint) >= 3:
        fp_status = STATUS_OK
        fp_detail = f"{len(fingerprint)} controles"
    elif fingerprint:
        fp_status = STATUS_WARN
        fp_detail = f"Solo {len(fingerprint)} — añade DRA/AWS/DSD para distinguir variantes"
    else:
        fp_status = STATUS_MISSING
        fp_detail = "Captura en cabina o copia de otro perfil similar"

    missing_in_dll = [c for c in fingerprint if ctrl_set and c not in ctrl_set]
    if missing_in_dll:
        fp_status = STATUS_WARN
        fp_detail += f" · No en DLL: {', '.join(missing_in_dll[:4])}"

    items.append(_item(
        "fingerprint",
        "Fingerprint (mandos únicos)",
        fp_status,
        fp_detail,
        action="capture",
    ))

    mappings = picked.get("mappings") or {}
    layout = _mapping_layout(mappings)
    items.append(_item(
        "control_layout",
        "Layout de mandos",
        STATUS_OK if layout != "unknown" else STATUS_MISSING,
        "Combinado (UK)" if layout == "combined"
        else "Separado Regulator + TrainBrakeControl" if layout == "split"
        else "Falta combined_control o throttle+brake",
        action="capture",
    ))

    for map_key, map_label, map_required in RECOMMENDED_MAPPINGS:
        if map_key == "combined_control" and layout == "split":
            items.append(_item(
                "mapping.combined_control",
                map_label,
                STATUS_INHERITED,
                f"No aplica — throttle={mappings.get('throttle', '?')} · brake={mappings.get('brake', '?')}",
                required=False,
                action="capture",
            ))
            continue
        if map_key in ("throttle", "brake") and layout == "combined":
            continue
        if map_key == "throttle" and layout == "split":
            value = mappings.get("throttle") or mappings.get("regulator")
            items.append(_item(
                "mapping.throttle",
                map_label,
                STATUS_OK if value else STATUS_MISSING,
                value or "Regulator",
                required=True,
                action="capture",
            ))
            continue
        if map_key == "brake" and layout == "split":
            value = mappings.get("brake") or mappings.get("train_brake")
            items.append(_item(
                "mapping.brake",
                map_label,
                STATUS_OK if value else STATUS_MISSING,
                value or "TrainBrakeControl",
                required=True,
                action="capture",
            ))
            continue
        if inherits and map_key not in ("combined_control", "reverser"):
            if mappings.get(map_key):
                st = STATUS_OK
                det = mappings[map_key]
            else:
                st = STATUS_INHERITED
                det = "Opcional — puede heredarse del base si existe"
            items.append(_item(
                f"mapping.{map_key}",
                map_label,
                st,
                det,
                required=False,
                action="capture",
            ))
            continue

        value = mappings.get(map_key)
        if value:
            st = STATUS_OK
            det = value
            if ctrl_set and value not in ctrl_set:
                st = STATUS_WARN
                det += " (no detectado en DLL actual)"
        elif map_required:
            st = STATUS_MISSING
            det = "Captura en cabina"
        else:
            st = STATUS_WARN
            det = "Recomendado para mandos AUTO"
        items.append(_item(
            f"mapping.{map_key}",
            map_label,
            st,
            det,
            required=map_required and not inherits,
            action="capture",
        ))

    notches = (enriched.get("specs") or {}).get("notches_throttle_brake") or []
    if inherits:
        notch_status = STATUS_INHERITED
        notch_detail = f"Heredadas del base ({len(notches)} muescas tras merge)"
    elif len(notches) >= 5:
        notch_status = STATUS_OK
        notch_detail = f"{len(notches)} muescas definidas"
    elif notches:
        notch_status = STATUS_WARN
        notch_detail = f"Solo {len(notches)} muescas — revisa valores del mando"
    else:
        notch_status = STATUS_MISSING
        notch_detail = "Define specs.notches_throttle_brake o usa extends"

    items.append(_item(
        "notches",
        "Muescas acelerador/freno",
        notch_status,
        notch_detail,
        required=not inherits,
        action="capture",
    ))

    brakes = enriched.get("brakes")
    if inherits:
        items.append(_item(
            "brakes",
            "Bloque brakes",
            STATUS_INHERITED,
            "Heredado del perfil base",
            required=False,
        ))
    elif brakes:
        items.append(_item(
            "brakes",
            "Bloque brakes",
            STATUS_OK,
            str(brakes.get("type", "definido")),
        ))
    else:
        items.append(_item(
            "brakes",
            "Bloque brakes",
            STATUS_MISSING,
            "Añade type/system o extends: class323",
        ))

    physics = enriched.get("physics_config") or {}
    if inherits:
        items.append(_item(
            "physics",
            "physics_config",
            STATUS_INHERITED,
            f"max_decel {physics.get('max_braking_decel', '?')} (del base)",
            required=False,
        ))
    else:
        decel = physics.get("max_braking_decel")
        station_rt = physics.get("station_reaction_time_s")
        if station_rt is not None and decel and decel != 0.8:
            phys_status = STATUS_OK
            phys_detail = f"decel={decel}, estación={station_rt}s"
        elif decel and decel != 0.8:
            phys_status = STATUS_WARN
            phys_detail = f"decel={decel} — falta station_reaction_time_s"
        else:
            phys_status = STATUS_MISSING
            phys_detail = "Valores genéricos — ajusta max_braking_decel y station_reaction_time_s"
        items.append(_item(
            "physics",
            "physics_config",
            phys_status,
            phys_detail,
        ))

    completeness = assess_profile_completeness(picked, enriched, get_by_id, brake_stats)
    samples = completeness.get("brake_samples", 0)
    cal_status = STATUS_OK if completeness.get("calibrated") else STATUS_WARN
    items.append(_item(
        "calibration",
        "Calibración de frenado (en juego)",
        cal_status,
        f"{samples} muestras — conduce y frena en LIVE (≥9 recomendado)",
        required=False,
        action="drive",
    ))

    required_items = [i for i in items if i["required"]]
    blocking = [i for i in required_items if i["status"] == STATUS_MISSING]
    ready = len(blocking) == 0 and completeness.get("level") != "broken"

    return {
        "items": items,
        "completeness": completeness,
        "resolved_profile": enriched,
        "ready_to_save": ready,
        "blocking_count": len(blocking),
        "blocking_labels": [i["label"] for i in blocking],
    }
