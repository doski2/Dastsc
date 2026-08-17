"""
brake_log.py — Registro persistente de eventos de frenado.

Cada evento captura las condiciones físicas reales de una frenada:
velocidad inicial/final, muesca aplicada, deceleración medida, gradiente,
masa, longitud y perfil. Con el tiempo esto permite calibrar las recomendaciones
de frenado con datos reales en lugar de físicas genéricas.
"""
import json
import os
from typing import Any, Dict, List, Optional

_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
_LOG_FILE = os.path.join(_DATA_DIR, "brake_events.json")
_MAX_EVENTS = 500
_MIN_DECEL_MS2 = 0.10
_MAX_DURATION_S = 300.0

# Plan A (P3.7): bandas alineadas con nexus-agent/src/brake/brakeStats.ts
SPEED_BAND_HIGH_MS = 35.0   # ~78 mph
SPEED_BAND_MED_MS = 8.0     # ~18 mph


def speed_band_from_ms(speed_ms: float) -> str:
    """Devuelve 'high' | 'med' | 'low' según velocidad inicial de la frenada."""
    if speed_ms >= SPEED_BAND_HIGH_MS:
        return "high"
    if speed_ms >= SPEED_BAND_MED_MS:
        return "med"
    return "low"


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _load() -> List[Dict[str, Any]]:
    if not os.path.exists(_LOG_FILE):
        return []
    try:
        with open(_LOG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def _save(events: List[Dict[str, Any]]) -> None:
    os.makedirs(_DATA_DIR, exist_ok=True)
    with open(_LOG_FILE, "w", encoding="utf-8") as f:
        json.dump(events, f, ensure_ascii=False, indent=2)


def _is_valid(event: Dict[str, Any]) -> bool:
    """Descarta eventos sin muesca identificada, demasiado largos o con decel irrisoria."""
    if event.get("notch", "?") == "?":
        return False
    if _as_float(event.get("duration_s")) > _MAX_DURATION_S:
        return False
    if _as_float(event.get("avg_decel_ms2")) < _MIN_DECEL_MS2:
        return False
    return True


def _aggregate_decel(values: List[float], include_min: bool = True) -> Dict[str, Any]:
    entry: Dict[str, Any] = {
        "avg_decel": round(sum(values) / len(values), 3),
        "max_decel": round(max(values), 3),
        "samples": len(values),
    }
    if include_min:
        entry["min_decel"] = round(min(values), 3)
    return entry


def append_event(event: Dict[str, Any]) -> bool:
    """Añade un evento al log si pasa validación. Devuelve True si se guardó."""
    if not _is_valid(event):
        return False
    enriched = dict(event)
    start_ms = _as_float(enriched.get("start_speed_ms"))
    if start_ms > 0 and "speed_band" not in enriched:
        enriched["speed_band"] = speed_band_from_ms(start_ms)
    events = _load()
    events.append(enriched)
    if len(events) > _MAX_EVENTS:
        events = events[-_MAX_EVENTS:]
    _save(events)
    return True


def purge_invalid() -> int:
    """Elimina del disco eventos inválidos. Devuelve cuántos se quitaron."""
    events = _load()
    clean = [e for e in events if _is_valid(e)]
    removed = len(events) - len(clean)
    if removed:
        _save(clean)
    return removed


def get_events(limit: int = 100, profile: Optional[str] = None) -> List[Dict[str, Any]]:
    """Devuelve los últimos `limit` eventos, opcionalmente filtrados por perfil."""
    events = _load()
    if profile:
        events = [e for e in events if e.get("profile") == profile]
    return events[-limit:]


def get_stats(profile: Optional[str] = None) -> Dict[str, Any]:
    """
    Estadísticas por muesca: promedio global + bandas de velocidad (high/med/low).
    Cada banda requiere ≥3 muestras en el agente para usarse al planificar.
    """
    events = get_events(limit=_MAX_EVENTS, profile=profile)
    if not events:
        return {"total_events": 0, "by_notch": {}}

    by_notch: Dict[str, List[float]] = {}
    by_notch_band: Dict[str, Dict[str, List[float]]] = {}

    for e in events:
        notch = e.get("notch", "?")
        decel = _as_float(e.get("avg_decel_ms2"))
        if not notch or notch == "?" or decel < _MIN_DECEL_MS2:
            continue

        by_notch.setdefault(notch, []).append(decel)

        start_ms = _as_float(e.get("start_speed_ms"))
        if start_ms > 0:
            band = e.get("speed_band") or speed_band_from_ms(start_ms)
            by_notch_band.setdefault(notch, {}).setdefault(str(band), []).append(decel)

    stats_by_notch: Dict[str, Any] = {}
    for notch, vals in by_notch.items():
        entry = _aggregate_decel(vals, include_min=True)
        bands = by_notch_band.get(notch)
        if bands:
            entry["by_speed"] = {
                band: _aggregate_decel(bvals, include_min=False)
                for band, bvals in bands.items()
            }
        stats_by_notch[notch] = entry

    return {
        "total_events": len(events),
        "by_notch": stats_by_notch,
    }
