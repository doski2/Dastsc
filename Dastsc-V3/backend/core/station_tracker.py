"""
station_tracker.py — Opción 2: Odómetro + base de datos de estaciones.

Calcula la distancia a la siguiente parada usando:
1. Un odometro propio (integra CurrentSpeed x delta_t del backend).
2. Las distancias entre estaciones del perfil de ruta (birmingham_xc_profile.json).
3. Deteccion autonoma de paradas — PRIMARIA por puertas, FALLBACK por velocidad.

Deteccion de paradas (prioridad):
  MODO PUERTAS (si el tren tiene DoorsOpenCloseLeft/Right):
    - Puertas abiertas (DoorL > 0.5 OR DoorR > 0.5) -> "en parada"
    - Puertas cerradas + velocidad > DEPART_SPEED_MS -> "partida"
  MODO VELOCIDAD (fallback si DoorL=DoorR=0 siempre):
    - velocidad < DWELL_SPEED_MS durante >= DWELL_MIN_SECS -> "en parada"
    - velocidad > DEPART_SPEED_MS tras dwell -> "partida"

Flujo:
  tracker.update(speed_ms, delta_t, stops, door_l, door_r) -> float (metros, -1 si desconocido)

Los stops se usan SOLO como lista ordenada de nombres. NO se lee el campo 'satisfied'.
"""

import json
import os
import re
from typing import Dict, List, Optional, Tuple


_PROFILE_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "birmingham_xc_profile.json")
_STATE_PATH  = os.path.join(os.path.dirname(__file__), "..", "data", "tracker_state.json")

DWELL_SPEED_MS = 0.5       # m/s: por debajo de este valor se considera "en parada" (modo velocidad)
DWELL_MIN_SECS = 10.0      # segundos minimos en parada para confirmar detencion (modo velocidad)
DEPART_SPEED_MS = 2.0      # m/s: por encima de este valor se considera partida
DOOR_OPEN_THRESHOLD = 0.5  # valor minimo de DoorL/DoorR para considerar puerta abierta
# Nº de frames consecutivos con puerta abierta para confirmar que es una parada real
# (evita detectar apertura momentanea en maniobra)
DOOR_CONFIRM_SECS = 2.0    # segundos con puerta abierta para confirmar parada


def _load_profile() -> List[Dict]:
    try:
        with open(_PROFILE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("stations", [])
    except Exception:
        return []


def _normalize_name(name: str) -> str:
    # Eliminar sufijos de andén: "Platform 3", "Platform 01A", "Plat 2B", "Platform 01A Up"
    n = re.sub(r"\s+platform\s+[0-9A-Za-z]+(?:\s+[A-Za-z]+)?", "", name, flags=re.IGNORECASE)
    n = re.sub(r"\s+plat\s+[0-9A-Za-z]+(?:\s+[A-Za-z]+)?", "", n, flags=re.IGNORECASE)
    n = re.sub(r"\s+\(.*?\)", "", n)
    n = re.sub(r"\s+\d+$", "", n)
    # Abreviaturas comunes del juego
    n = re.sub(r"\bNew St\b", "New Street", n, flags=re.IGNORECASE)
    n = re.sub(r"\bSt\b(?=\s|$)", "Street", n, flags=re.IGNORECASE)
    n = re.sub(r"\bJn\b", "Junction", n, flags=re.IGNORECASE)
    return n.strip().lower()


def _profile_distance_m(stations: List[Dict], name_a: Optional[str], name_b: str) -> float:
    if not stations:
        return -1.0

    def _find_km(name: str) -> Optional[float]:
        norm = _normalize_name(name)
        for s in stations:
            if _normalize_name(s["name"]) == norm:
                return s["km_post"]
        for s in stations:
            pn = _normalize_name(s["name"])
            if pn in norm or norm in pn:
                return s["km_post"]
        return None

    km_b = _find_km(name_b)
    if km_b is None:
        return -1.0
    if name_a is None:
        return -1.0
    km_a = _find_km(name_a)
    if km_a is None:
        return -1.0
    dist_m = abs(km_b - km_a) * 1000.0
    return dist_m if dist_m > 50 else -1.0


class StationTracker:

    def __init__(self):
        self._profile: List[Dict] = _load_profile()
        self._odometer_m: float = 0.0
        self._odometer_at_last_departure: float = 0.0
        self._completed_stops: int = 0
        self._last_departed_name: Optional[str] = None
        self._segment_dist: float = -1.0
        self._learned: Dict[Tuple[str, str], float] = {}
        # Modo velocidad (fallback)
        self._dwell_time: float = 0.0
        self._is_dwelling: bool = False
        # Modo puertas (primario)
        self._door_open_time: float = 0.0   # cuánto tiempo llevan las puertas abiertas
        self._door_was_open: bool = False    # puertas estaban abiertas en el frame anterior
        self._at_station_by_door: bool = False  # parada confirmada por puertas
        self._has_doors: bool = False        # el tren tiene controles de puerta
        self._door_checks: int = 0           # frames procesados para detección automática
        self._last_stops_key: tuple = ()
        self._last_stop_names: List[str] = []
        self._pending_save: bool = False  # set True cuando hay estado nuevo que persistir
        self.load_state()  # recuperar estado de la última sesión si existe

    def reset(self) -> None:
        self._odometer_m = 0.0
        self._odometer_at_last_departure = 0.0
        self._completed_stops = 0
        self._last_departed_name = None
        self._segment_dist = -1.0
        self._learned = {}
        self._dwell_time = 0.0
        self._is_dwelling = False
        self._door_open_time = 0.0
        self._door_was_open = False
        self._at_station_by_door = False
        self._has_doors = False
        self._door_checks = 0
        self._last_stops_key = ()
        self._last_stop_names = []
        self._pending_save = False
        self.save_state()

    def save_state(self) -> None:
        """Persiste el estado mínimo en disco para sobrevivir reinicios del backend."""
        try:
            state = {
                "completed_stops": self._completed_stops,
                "odometer_m": round(self._odometer_m, 1),
                "odometer_at_last_departure": round(self._odometer_at_last_departure, 1),
                "last_departed_name": self._last_departed_name,
                "segment_dist": round(self._segment_dist, 1) if self._segment_dist >= 0 else -1.0,
                "has_doors": self._has_doors,
                "stops_key": list(self._last_stops_key),
                "learned": {f"{k[0]}|||{k[1]}": round(v, 1) for k, v in self._learned.items()},
            }
            os.makedirs(os.path.dirname(_STATE_PATH), exist_ok=True)
            with open(_STATE_PATH, "w", encoding="utf-8") as f:
                json.dump(state, f, indent=2)
        except Exception:
            pass

    def load_state(self) -> None:
        """Recupera el estado del disco. Si la lista de paradas cambió (escenario diferente)
        ignora el estado guardado para evitar contadores desfasados."""
        if not os.path.exists(_STATE_PATH):
            return
        try:
            with open(_STATE_PATH, "r", encoding="utf-8") as f:
                state = json.load(f)
            self._completed_stops = int(state.get("completed_stops", 0))
            self._odometer_m = float(state.get("odometer_m", 0.0))
            self._odometer_at_last_departure = float(state.get("odometer_at_last_departure", 0.0))
            self._last_departed_name = state.get("last_departed_name")
            self._segment_dist = float(state.get("segment_dist", -1.0))
            self._has_doors = bool(state.get("has_doors", False))
            self._last_stops_key = tuple(state.get("stops_key", []))
            self._last_stop_names = list(self._last_stops_key)
            learned_raw = state.get("learned", {})
            self._learned = {}
            for k_str, v in learned_raw.items():
                parts = k_str.split("|||", 1)
                if len(parts) == 2:
                    self._learned[(parts[0], parts[1])] = float(v)
        except Exception:
            pass

    def _get_stop_names(self, stops: List[Dict]) -> List[str]:
        names = []
        for s in stops:
            name = s.get("station_name") or s.get("name") or ""
            if not name or name == "Unknown":
                continue
            if s.get("type") == "WAYPOINT":
                continue
            if s.get("hidden"):
                continue
            names.append(name)
        return names

    def _update_segment(self, stop_names: List[str]) -> None:
        next_idx = self._completed_stops
        if next_idx >= len(stop_names):
            self._segment_dist = -1.0
            return
        next_name = stop_names[next_idx]
        self._segment_dist = self._get_segment_distance(self._last_departed_name, next_name)

    def _get_segment_distance(self, from_name: Optional[str], to_name: str) -> float:
        if not to_name:
            return -1.0
        if from_name:
            key = (_normalize_name(from_name), _normalize_name(to_name))
            if key in self._learned:
                return self._learned[key]
        dist = _profile_distance_m(self._profile, from_name, to_name)
        return dist

    def update(
        self,
        speed_ms: float,
        delta_t: float,
        stops: List[Dict],
        door_l: float = 0.0,
        door_r: float = 0.0,
    ) -> float:
        if delta_t <= 0 or delta_t > 10.0:
            delta_t = 0.0

        speed_abs = abs(speed_ms)

        if speed_abs > 0.1 and delta_t > 0:
            self._odometer_m += speed_abs * delta_t

        stop_names = self._get_stop_names(stops)
        new_key = tuple(stop_names)
        if new_key != self._last_stops_key and new_key:
            # Escenario diferente al guardado → resetear contadores pero conservar learned
            if self._last_stops_key and new_key != self._last_stops_key:
                self._completed_stops = 0
                self._odometer_m = 0.0
                self._odometer_at_last_departure = 0.0
                self._last_departed_name = None
                self._segment_dist = -1.0
            self._last_stops_key = new_key
            self._last_stop_names = stop_names
            self._update_segment(stop_names)
        else:
            stop_names = self._last_stop_names

        if not stop_names:
            return -1.0

        doors_open = (door_l > DOOR_OPEN_THRESHOLD) or (door_r > DOOR_OPEN_THRESHOLD)

        # Auto-detectar si el tren tiene puertas (primeros 200 frames con doors != 0)
        if not self._has_doors and self._door_checks < 200:
            self._door_checks += 1
            if doors_open:
                self._has_doors = True

        if self._has_doors:
            # --- Modo PUERTAS (primario) ---
            if doors_open:
                self._door_open_time += delta_t
                if self._door_open_time >= DOOR_CONFIRM_SECS:
                    self._at_station_by_door = True
                self._door_was_open = True
            else:
                # Puertas cerradas: reset del contador pero mantener _at_station_by_door
                # hasta que el tren alcance velocidad de partida
                self._door_open_time = 0.0
                self._door_was_open = False
                if self._at_station_by_door:
                    # Parada confirmada, esperando que el tren arranque
                    if speed_abs > DEPART_SPEED_MS:
                        self._on_departure(stop_names)
                        self._at_station_by_door = False
        else:
            # --- Modo VELOCIDAD (fallback) ---
            if speed_abs < DWELL_SPEED_MS:
                self._dwell_time += delta_t
                if self._dwell_time >= DWELL_MIN_SECS:
                    self._is_dwelling = True
            else:
                if self._is_dwelling and speed_abs > DEPART_SPEED_MS:
                    self._on_departure(stop_names)
                self._dwell_time = 0.0
                self._is_dwelling = False

        next_idx = self._completed_stops
        if next_idx >= len(stop_names):
            return -1.0

        # Parada confirmada por puertas abiertas → distancia 0 (estamos en la parada)
        if self._at_station_by_door:
            return 0.0

        if self._segment_dist < 0:
            self._update_segment(stop_names)

        if self._segment_dist < 0:
            return -1.0

        dist_in_segment = self._odometer_m - self._odometer_at_last_departure
        remaining = self._segment_dist - dist_in_segment
        return max(0.0, remaining)

    @property
    def next_stop_index(self) -> int:
        """Índice del siguiente stop no completado en la lista de paradas."""
        return self._completed_stops

    def _on_departure(self, stop_names: List[str]) -> None:
        if self._completed_stops < len(stop_names):
            departed_name = stop_names[self._completed_stops]

            if self._last_departed_name:
                dist_traveled = self._odometer_m - self._odometer_at_last_departure
                if dist_traveled > 100:
                    key = (_normalize_name(self._last_departed_name), _normalize_name(departed_name))
                    self._learned[key] = dist_traveled

            self._last_departed_name = departed_name
            self._completed_stops += 1
            self._odometer_at_last_departure = self._odometer_m
            self._update_segment(stop_names)
            self._pending_save = True  # El bucle async lo persiste en executor
