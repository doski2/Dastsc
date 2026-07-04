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


def append_event(event: Dict[str, Any]) -> bool:
    """Añade un evento al log si pasa validación. Devuelve True si se guardó."""
    if not _is_valid(event):
        return False
    events = _load()
    events.append(event)
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
    Calcula estadísticas agregadas por muesca para calibración futura.
    Devuelve para cada muesca: avg_decel, max_decel, min_decel, samples.
    """
    events = get_events(limit=_MAX_EVENTS, profile=profile)
    if not events:
        return {"total_events": 0, "by_notch": {}}

    by_notch: Dict[str, List[float]] = {}
    for e in events:
        notch = e.get("notch", "?")
        decel = _as_float(e.get("avg_decel_ms2"))
        if notch and notch != "?" and decel >= _MIN_DECEL_MS2:
            by_notch.setdefault(notch, []).append(decel)

    stats_by_notch = {
        notch: {
            "avg_decel": round(sum(vals) / len(vals), 3),
            "max_decel": round(max(vals), 3),
            "min_decel": round(min(vals), 3),
            "samples": len(vals),
        }
        for notch, vals in by_notch.items()
    }

    return {
        "total_events": len(events),
        "by_notch": stats_by_notch,
    }
