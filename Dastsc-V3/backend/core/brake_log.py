"""
brake_log.py — Registro persistente de eventos de frenado.

Cada evento captura las condiciones físicas reales de una frenada:
velocidad inicial/final, muesca aplicada, deceleración medida, gradiente,
masa, longitud y perfil. Con el tiempo esto permite calibrar las recomendaciones
de frenado con datos reales en lugar de físicas genéricas.
"""
import json
import os
import time
from typing import Any, Dict, List, Optional

_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
_LOG_FILE = os.path.join(_DATA_DIR, "brake_events.json")
_MAX_EVENTS = 500  # límite para no crecer indefinidamente


def _load() -> List[Dict[str, Any]]:
    if not os.path.exists(_LOG_FILE):
        return []
    try:
        with open(_LOG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return []


def _save(events: List[Dict[str, Any]]) -> None:
    os.makedirs(_DATA_DIR, exist_ok=True)
    with open(_LOG_FILE, "w", encoding="utf-8") as f:
        json.dump(events, f, ensure_ascii=False, indent=2)


_MAX_DURATION_S = 300   # eventos más largos son bugs del detector (tracker atascado)

def _is_valid(event: Dict[str, Any]) -> bool:
    """Descarta eventos que no aportan información útil para el autopilot."""
    if event.get("notch", "?") == "?":
        return False
    if float(event.get("duration_s", 0)) > _MAX_DURATION_S:
        return False
    if float(event.get("avg_decel_ms2", 0)) < 0.10:
        return False
    return True


def append_event(event: Dict[str, Any]) -> None:
    """Añade un evento al log si pasa validación. Mantiene como máximo _MAX_EVENTS entradas."""
    if not _is_valid(event):
        return
    events = _load()
    events.append(event)
    if len(events) > _MAX_EVENTS:
        events = events[-_MAX_EVENTS:]
    _save(events)


def get_events(limit: int = 100, profile: Optional[str] = None) -> List[Dict[str, Any]]:
    """Devuelve los últimos `limit` eventos, opcionalmente filtrados por perfil."""
    events = _load()
    if profile:
        events = [e for e in events if e.get("profile") == profile]
    return events[-limit:]


def get_stats(profile: Optional[str] = None) -> Dict[str, Any]:
    """
    Calcula estadísticas agregadas por muesca para calibración futura.
    Devuelve para cada muesca conocida: avg_decel, max_decel, sample_count.
    """
    events = get_events(limit=_MAX_EVENTS, profile=profile)
    if not events:
        return {"total_events": 0, "by_notch": {}}

    by_notch: Dict[str, List[float]] = {}
    for e in events:
        notch = e.get("notch", "?")
        decel = e.get("avg_decel_ms2", 0)
        # Ignorar entradas sin notch identificado o con deceleración irrisoria (ruido)
        if notch and notch != "?" and decel >= 0.1:
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
