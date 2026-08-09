"""
station_distance.py — Distancia a estación sin saltos de OCR.

Tras una captura OCR (al cerrar puertas), ancla la distancia y la reduce con el
odómetro integrado (velocidad × dt). Muestras temporales para verificar deriva;
corrección única al acercarse a la estación.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Literal, Optional

_MAX_INTEGRATION_DT_S = 2.0
_MPH_TO_MS = 0.44704
_KMH_TO_MS = 0.27778

SAMPLE_INTERVAL_S = 5.0
MAX_SAMPLES = 120
NEAR_CORRECTION_M = 400.0
MIN_TRAVELED_FOR_CORRECTION_M = 200.0
LUA_SYNC_MIN_DRIFT_M = 120.0
LUA_SYNC_MIN_DRIFT_RATIO = 0.05

# Corrección OCR en tramos largos (> 5 km): checkpoints cada fracción del tramo.
LONG_LEG_MIN_M = 5000.0
MID_LEG_INTERVAL_M = 5000.0
MID_LEG_MAX_CAPTURES = 3
MID_LEG_MIN_SPEED_MS = 10.0 / 3.6  # ~10 km/h
MID_LEG_COOLDOWN_S = 60.0
OCR_REJECT_JUMP_M = 40.0


def mid_leg_checkpoint_count(anchor_m: float) -> int:
    """Número de capturas intermedias según distancia inicial del tramo."""
    if anchor_m <= LONG_LEG_MIN_M:
        return 0
    return min(MID_LEG_MAX_CAPTURES, max(1, int(anchor_m / MID_LEG_INTERVAL_M) - 1))


def normalize_lua_station_distance(raw: float) -> Optional[float]:
    """GetNextStation devuelve metros; valores < 50 suelen ser km (p. ej. 3.95)."""
    if raw <= 0:
        return None
    if raw < 50:
        return round(raw * 1000.0)
    return round(raw)

SampleEvent = Literal[
    "door_anchor",
    "mid_leg_correction",
    "near_correction",
    "lua_sync",
    "tick",
    "arrival",
]


@dataclass
class StationDistanceSample:
    t: float
    event: SampleEvent
    distance_m: float
    traveled_m: float
    speed_ms: float
    anchor_m: Optional[float] = None
    ocr_raw_m: Optional[float] = None
    computed_before_m: Optional[float] = None
    drift_m: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def speed_ms_from_telemetry(data: Dict[str, Any]) -> float:
    """Velocidad en m/s alineada con nexus-kernel resolveSpeedMS."""
    speedo = int(float(data.get("SpeedoType") or 1))
    sim_to_ms = _KMH_TO_MS if speedo == 2 else _MPH_TO_MS

    cab = data.get("CabSpeed")
    if cab is not None:
        try:
            cab_f = float(cab)
            if cab_f != 0:
                return abs(cab_f) * sim_to_ms
        except (TypeError, ValueError):
            pass

    current = data.get("CurrentSpeed")
    if current is not None:
        try:
            return abs(float(current))
        except (TypeError, ValueError):
            pass

    speed = data.get("Speed")
    if speed is not None:
        try:
            return abs(float(speed)) * sim_to_ms
        except (TypeError, ValueError):
            pass

    return 0.0


class StationDistanceTracker:
    """Ancla OCR + odómetro para distancia monótona a la próxima estación."""

    def __init__(self) -> None:
        self._anchor_distance_m: Optional[float] = None
        self._anchor_odometer_m: float = 0.0
        self._odometer_m: float = 0.0
        self._last_tick_time: Optional[float] = None
        self._samples: List[StationDistanceSample] = []
        self._last_sample_time: float = 0.0
        self._near_correction_done = False
        self._last_drift_m: Optional[float] = None
        self._leg_initial_anchor_m: Optional[float] = None
        self._mid_leg_captures_done = 0
        self._last_ocr_capture_at: float = 0.0

    @property
    def has_anchor(self) -> bool:
        return self._anchor_distance_m is not None

    def traveled_m(self) -> float:
        if not self.has_anchor:
            return 0.0
        return max(0.0, self._odometer_m - self._anchor_odometer_m)

    def anchor_distance_m(self) -> Optional[float]:
        return self._anchor_distance_m

    def integrate(self, speed_ms: float, now: float) -> None:
        if self._last_tick_time is not None:
            dt = now - self._last_tick_time
            if 0.0 < dt < _MAX_INTEGRATION_DT_S:
                self._odometer_m += max(0.0, speed_ms) * dt
        self._last_tick_time = now

    def _append_sample(self, sample: StationDistanceSample) -> None:
        self._samples.append(sample)
        if len(self._samples) > MAX_SAMPLES:
            self._samples = self._samples[-MAX_SAMPLES:]

    def _mid_leg_milestones_m(self) -> List[float]:
        """Distancias recorridas (m) en las que pedir corrección intermedia."""
        if self._leg_initial_anchor_m is None or self._leg_initial_anchor_m <= LONG_LEG_MIN_M:
            return []
        count = mid_leg_checkpoint_count(self._leg_initial_anchor_m)
        if count <= 0:
            return []
        leg = self._leg_initial_anchor_m
        return [leg * k / (count + 1) for k in range(1, count + 1)]

    def should_accept_ocr_distance(self, ocr_distance_m: float, event: SampleEvent) -> bool:
        """Rechaza lecturas que suben la distancia de forma implausible."""
        if event == "door_anchor":
            return True
        computed = self.distance_m()
        if computed is None:
            return True
        ocr_value = max(0.0, float(ocr_distance_m))
        if ocr_value > computed + OCR_REJECT_JUMP_M:
            return False
        if event in ("mid_leg_correction", "near_correction") and ocr_value > computed + 5.0:
            return False
        return True

    def anchor_from_ocr(
        self,
        distance_m: float,
        *,
        event: SampleEvent = "door_anchor",
        now: float,
        speed_ms: float = 0.0,
        ocr_raw_m: Optional[float] = None,
    ) -> bool:
        ocr_value = max(0.0, float(distance_m))
        if not self.should_accept_ocr_distance(ocr_value, event):
            return False

        computed_before = self.distance_m()
        drift = None
        if computed_before is not None and event in ("near_correction", "mid_leg_correction"):
            drift = ocr_value - computed_before
            self._last_drift_m = drift
            if event == "near_correction":
                self._near_correction_done = True

        self._anchor_distance_m = ocr_value
        self._anchor_odometer_m = self._odometer_m

        if event == "door_anchor":
            self._near_correction_done = False
            self._last_drift_m = None
            self._leg_initial_anchor_m = ocr_value
            self._mid_leg_captures_done = 0
        elif event == "mid_leg_correction":
            self._mid_leg_captures_done += 1

        self._last_ocr_capture_at = now

        dist = self.distance_m() or ocr_value
        self._append_sample(StationDistanceSample(
            t=now,
            event=event,
            distance_m=dist,
            traveled_m=self.traveled_m(),
            speed_ms=speed_ms,
            anchor_m=self._anchor_distance_m,
            ocr_raw_m=ocr_raw_m if ocr_raw_m is not None else ocr_value,
            computed_before_m=computed_before,
            drift_m=drift,
        ))
        self._last_sample_time = now
        return True

    def sync_lua_distance(
        self,
        lua_distance_m: float,
        *,
        now: float,
        speed_ms: float = 0.0,
    ) -> bool:
        """Alinea el odómetro con GetNextStation cuando hay desviación clara."""
        normalized = normalize_lua_station_distance(lua_distance_m)
        if normalized is None:
            return False

        computed = self.distance_m()
        if not self.has_anchor:
            self.anchor_from_ocr(
                normalized,
                event="lua_sync",
                now=now,
                speed_ms=speed_ms,
            )
            return True

        if computed is None:
            return False

        drift = abs(normalized - computed)
        threshold = max(LUA_SYNC_MIN_DRIFT_M, computed * LUA_SYNC_MIN_DRIFT_RATIO)
        if drift < threshold:
            return False

        self.anchor_from_ocr(
            normalized,
            event="lua_sync",
            now=now,
            speed_ms=speed_ms,
            ocr_raw_m=normalized,
        )
        return True

    def distance_m(self) -> Optional[float]:
        if self._anchor_distance_m is None:
            return None
        return max(0.0, self._anchor_distance_m - self.traveled_m())

    def should_request_mid_leg_correction(self, speed_ms: float, now: float) -> bool:
        if not self.has_anchor or self._leg_initial_anchor_m is None:
            return False
        if self._leg_initial_anchor_m <= LONG_LEG_MIN_M:
            return False
        milestones = self._mid_leg_milestones_m()
        if self._mid_leg_captures_done >= len(milestones):
            return False
        if speed_ms < MID_LEG_MIN_SPEED_MS:
            return False
        if now - self._last_ocr_capture_at < MID_LEG_COOLDOWN_S:
            return False
        dist = self.distance_m()
        if dist is None or dist <= NEAR_CORRECTION_M:
            return False
        return self.traveled_m() >= milestones[self._mid_leg_captures_done]

    def should_request_near_correction(self) -> bool:
        if not self.has_anchor or self._near_correction_done:
            return False
        dist = self.distance_m()
        if dist is None:
            return False
        return (
            dist <= NEAR_CORRECTION_M
            and self.traveled_m() >= MIN_TRAVELED_FOR_CORRECTION_M
        )

    def maybe_record_sample(self, now: float, speed_ms: float) -> None:
        if not self.has_anchor:
            return
        if now - self._last_sample_time < SAMPLE_INTERVAL_S:
            return
        dist = self.distance_m()
        if dist is None:
            return

        event: SampleEvent = "arrival" if dist <= 30.0 and speed_ms < 1.0 else "tick"
        self._append_sample(StationDistanceSample(
            t=now,
            event=event,
            distance_m=dist,
            traveled_m=self.traveled_m(),
            speed_ms=speed_ms,
            anchor_m=self._anchor_distance_m,
        ))
        self._last_sample_time = now

    def debug_payload(self) -> Dict[str, Any]:
        dist = self.distance_m()
        return {
            "has_anchor": self.has_anchor,
            "anchor_distance_m": self._anchor_distance_m,
            "traveled_m": round(self.traveled_m(), 1),
            "current_distance_m": round(dist, 1) if dist is not None else None,
            "near_correction_done": self._near_correction_done,
            "leg_initial_anchor_m": self._leg_initial_anchor_m,
            "mid_leg_captures_done": self._mid_leg_captures_done,
            "mid_leg_milestones_m": [round(m, 1) for m in self._mid_leg_milestones_m()],
            "last_drift_m": self._last_drift_m,
            "sample_count": len(self._samples),
            "samples": [s.to_dict() for s in self._samples[-40:]],
        }

    def last_drift_m(self) -> Optional[float]:
        return self._last_drift_m

    @property
    def near_correction_done(self) -> bool:
        return self._near_correction_done

    def telemetry_fields(self) -> Dict[str, float]:
        """Campos opcionales para enriquecer telemetría WS."""
        if not self.has_anchor:
            return {}
        fields: Dict[str, float] = {
            "StationAnchorM": round(float(self._anchor_distance_m or 0), 1),
            "StationTraveledM": round(self.traveled_m(), 1),
            "StationNearCorrected": 1.0 if self._near_correction_done else 0.0,
        }
        if self._last_drift_m is not None:
            fields["StationDriftM"] = round(self._last_drift_m, 1)
        return fields

    def clear(self) -> None:
        self._anchor_distance_m = None
        self._anchor_odometer_m = 0.0
        self._last_tick_time = None
        self._samples = []
        self._last_sample_time = 0.0
        self._near_correction_done = False
        self._last_drift_m = None
        self._leg_initial_anchor_m = None
        self._mid_leg_captures_done = 0
        self._last_ocr_capture_at = 0.0
