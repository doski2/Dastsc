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
# Ancla OCR al inicio de tramo (señal / siding), sin GetNextStation en Lua.
INITIAL_ANCHOR_MAX_SPEED_MS = 1.0
INITIAL_ANCHOR_STATIONARY_S = 5.0
OCR_REJECT_JUMP_M = 40.0
# Odómetro adelantado vs millas HUD en tramos largos (WCML, etc.).
MID_LEG_MAX_UPWARD_M = 250.0
MID_LEG_MAX_UPWARD_RATIO = 0.08
MID_LEG_MIN_UPWARD_M = 40.0
# Tras parada en andén: OCR < 200 m con distancia calculada ~0 es lectura residual (giro de cabina).
PLATFORM_RESIDUAL_MAX_M = 50.0
TURNAROUND_SUSPICIOUS_OCR_MAX_M = 200.0
# Al cambiar cabina o reverser cerca del andén, limpiar ancla OCR.
TURNAROUND_CLEAR_MAX_DIST_M = 150.0
TURNAROUND_CLEAR_MAX_SPEED_MS = 3.0
# Salida en cabecera tras parada: distancia casi 0 y velocidad baja — no confundir con aproximación.
DEPARTURE_CLEAR_MAX_DIST_M = 35.0
DEPARTURE_CLEAR_MAX_SPEED_MS = 5.0
# Tras giro/clear, el HUD suele leer la parada anterior (~80–130 m) — exigir ancla larga.
MIN_NEW_LEG_ANCHOR_M = 400.0
NEAR_CORRECTION_MAX_UPWARD_M = 15.0
NEAR_CORRECTION_MAX_UPWARD_APPROACH_M = 30.0
NEAR_CORRECTION_MAX_UPWARD_RATIO = 0.30
NEAR_CORRECTION_RETRY_MAX_UPWARD_M = 120.0
NEAR_CORRECTION_MIN_INTERVAL_S = 15.0
SHORT_STOP_RETRY_MIN_M = 40.0
SHORT_STOP_RETRY_MAX_M = 120.0
SHORT_STOP_MAX_UPWARD_M = 120.0
PLATFORM_NEAR_CORRECTION_MAX_M = 80.0
REV_FORWARD = 0.05
REV_REVERSE = -0.05


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
    "initial_anchor",
    "mid_leg_correction",
    "near_correction",
    "manual_anchor",
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


def should_clear_on_turnaround(
    *,
    speed_ms: float,
    tracked_dist_m: Optional[float],
    active_cab: int,
    reversal: float,
    last_active_cab: Optional[int],
    last_reversal: Optional[float],
) -> bool:
    """Limpia ancla OCR al girar en cabecera (cambio de cabina o reverser)."""
    if last_active_cab is None and last_reversal is None:
        return False
    if speed_ms > TURNAROUND_CLEAR_MAX_SPEED_MS:
        return False
    if tracked_dist_m is not None and tracked_dist_m > TURNAROUND_CLEAR_MAX_DIST_M:
        return False

    cab_flipped = (
        last_active_cab is not None
        and active_cab in (1, 2)
        and last_active_cab in (1, 2)
        and active_cab != last_active_cab
    )
    rev_flipped = False
    if last_reversal is not None:
        was_fwd = last_reversal > REV_FORWARD
        was_rev = last_reversal < REV_REVERSE
        now_fwd = reversal > REV_FORWARD
        now_rev = reversal < REV_REVERSE
        rev_flipped = (was_fwd and now_rev) or (was_rev and now_fwd)

    return cab_flipped or rev_flipped


def should_clear_on_departure_intent(
    *,
    speed_ms: float,
    tracked_dist_m: Optional[float],
    combined_control: float,
) -> bool:
    """En cabecera (dist ~0), tracción lenta = salida tras giro — borrar ancla."""
    if tracked_dist_m is None or tracked_dist_m > DEPARTURE_CLEAR_MAX_DIST_M:
        return False
    if combined_control <= 0.05:
        return False
    if speed_ms > DEPARTURE_CLEAR_MAX_SPEED_MS:
        return False
    return speed_ms > 0.5


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
        self._awaiting_far_anchor = False
        self._near_correction_arrival_reset_used = False
        self._doors_opened_since_clear = False

    def note_doors_opened(self) -> None:
        """Puertas abiertas al menos una vez desde el último clear (ciclo andén)."""
        self._doors_opened_since_clear = True

    def _near_correction_max_upward(self, computed: float, speed_ms: float = 0.0) -> float:
        if computed <= PLATFORM_NEAR_CORRECTION_MAX_M:
            return NEAR_CORRECTION_MAX_UPWARD_M
        limit = max(
            NEAR_CORRECTION_MAX_UPWARD_APPROACH_M,
            computed * NEAR_CORRECTION_MAX_UPWARD_RATIO,
        )
        if speed_ms < 1.0 and computed >= SHORT_STOP_RETRY_MIN_M:
            limit = max(limit, SHORT_STOP_MAX_UPWARD_M)
        return min(limit, NEAR_CORRECTION_RETRY_MAX_UPWARD_M)

    def _max_upward_drift_m(
        self,
        computed: float,
        speed_ms: float,
        event: SampleEvent,
    ) -> float:
        """Cuánto puede OCR superar al odómetro (HUD más conservador que integración)."""
        if event == "mid_leg_correction":
            leg = self._leg_initial_anchor_m or computed
            if leg > LONG_LEG_MIN_M:
                return min(
                    MID_LEG_MAX_UPWARD_M,
                    max(MID_LEG_MIN_UPWARD_M, computed * MID_LEG_MAX_UPWARD_RATIO),
                )
        return self._near_correction_max_upward(computed, speed_ms)

    def _accept_upward_drift(
        self,
        ocr_value: float,
        computed: float,
        event: SampleEvent,
        speed_ms: float,
    ) -> bool:
        upward = ocr_value - computed
        if upward <= 0:
            return True
        if computed <= PLATFORM_NEAR_CORRECTION_MAX_M and upward <= NEAR_CORRECTION_MAX_UPWARD_M:
            return True
        if upward <= self._max_upward_drift_m(computed, speed_ms, event):
            return True
        if (
            event == "near_correction"
            and speed_ms < 1.0
            and SHORT_STOP_RETRY_MIN_M <= computed <= SHORT_STOP_RETRY_MAX_M
            and upward <= SHORT_STOP_MAX_UPWARD_M
        ):
            return True
        return False

    @property
    def has_anchor(self) -> bool:
        return self._anchor_distance_m is not None

    def traveled_m(self) -> float:
        if not self.has_anchor:
            return 0.0
        return max(0.0, self._odometer_m - self._anchor_odometer_m)

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

    def should_accept_ocr_distance(
        self,
        ocr_distance_m: float,
        event: SampleEvent,
        speed_ms: float = 0.0,
    ) -> bool:
        """Rechaza lecturas que suben la distancia de forma implausible."""
        ocr_value = max(0.0, float(ocr_distance_m))
        if event == "manual_anchor":
            return ocr_value > 0
        if event == "initial_anchor":
            # Andén con puertas cerradas sin abrir: HUD ~0.08 mi (residual) — no anclar aquí.
            return ocr_value >= MIN_NEW_LEG_ANCHOR_M
        if event == "door_anchor":
            computed = self.distance_m()
            if self._awaiting_far_anchor and ocr_value < MIN_NEW_LEG_ANCHOR_M:
                return False
            # Tras parada en andén, OCR residual (~50–150 m) no es la siguiente estación.
            if computed is not None and computed < PLATFORM_RESIDUAL_MAX_M:
                if ocr_value < TURNAROUND_SUSPICIOUS_OCR_MAX_M:
                    return False
            return True
        computed = self.distance_m()
        if computed is None:
            return True
        if event in ("near_correction", "mid_leg_correction"):
            if ocr_value <= computed:
                return True
            return self._accept_upward_drift(ocr_value, computed, event, speed_ms)
        if ocr_value > computed + OCR_REJECT_JUMP_M:
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
        if not self.should_accept_ocr_distance(ocr_value, event, speed_ms):
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

        if event in ("door_anchor", "initial_anchor", "manual_anchor"):
            self._near_correction_done = False
            self._last_drift_m = None
            self._leg_initial_anchor_m = ocr_value
            self._mid_leg_captures_done = 0
            self._near_correction_arrival_reset_used = False
            if ocr_value >= MIN_NEW_LEG_ANCHOR_M:
                self._awaiting_far_anchor = False
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

    def should_request_initial_anchor(
        self,
        speed_ms: float,
        now: float,
        *,
        doors_open: bool,
        stationary_since: Optional[float],
    ) -> bool:
        """
        Primera ancla del tramo vía OCR (escenario en señal/siding, sin parada previa).

        No sustituye door_anchor: en andén con ~0.08 mi y puertas cerradas, el OCR corto
        se rechaza en should_accept_ocr_distance; la distancia buena llega al cerrar tras abrir.
        """
        if self.has_anchor:
            return False
        if doors_open:
            return False
        if speed_ms >= INITIAL_ANCHOR_MAX_SPEED_MS:
            return False
        if stationary_since is None or now - stationary_since < INITIAL_ANCHOR_STATIONARY_S:
            return False
        if (
            self._last_ocr_capture_at > 0
            and now - self._last_ocr_capture_at < MID_LEG_COOLDOWN_S
        ):
            return False
        return True

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

    def should_request_near_correction(self, speed_ms: float = 0.0, now: float = 0.0) -> bool:
        if not self.has_anchor:
            return False
        dist = self.distance_m()
        if dist is None:
            return False
        if now > 0 and now - self._last_ocr_capture_at < NEAR_CORRECTION_MIN_INTERVAL_S:
            return False
        if (
            SHORT_STOP_RETRY_MIN_M < dist <= SHORT_STOP_RETRY_MAX_M
            and speed_ms < 1.0
        ):
            return True
        if self._near_correction_done:
            return False
        return (
            dist <= NEAR_CORRECTION_M
            and self.traveled_m() >= MIN_TRAVELED_FOR_CORRECTION_M
        )

    def mark_near_correction_attempted(self, now: float) -> None:
        """Un intento por tramo (aunque falle el OCR) — evita spam de capturas."""
        self._near_correction_done = True
        self._last_ocr_capture_at = now

    def mark_ocr_capture_attempted(self, now: float) -> None:
        """Cooldown tras cualquier captura OCR (éxito o rechazo)."""
        self._last_ocr_capture_at = now

    def should_retry_near_correction(self, ocr_distance_m: float, speed_ms: float = 0.0) -> bool:
        """Reintento si el OCR rechazado corrige deriva moderada al alza."""
        computed = self.distance_m()
        if computed is None:
            return False
        ocr_value = max(0.0, float(ocr_distance_m))
        if ocr_value <= computed:
            return True
        upward = ocr_value - computed
        return upward <= self._max_upward_drift_m(computed, speed_ms, "near_correction")

    def maybe_record_sample(self, now: float, speed_ms: float) -> None:
        if not self.has_anchor:
            return
        if now - self._last_sample_time < SAMPLE_INTERVAL_S:
            return
        dist = self.distance_m()
        if dist is None:
            return

        event: SampleEvent = "arrival" if dist <= 30.0 and speed_ms < 1.0 else "tick"
        if event == "arrival":
            self._awaiting_far_anchor = True
            if (
                15.0 < dist <= PLATFORM_NEAR_CORRECTION_MAX_M
                and not self._near_correction_arrival_reset_used
            ):
                self._near_correction_done = False
                self._near_correction_arrival_reset_used = True
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
            "doors_opened_since_clear": self._doors_opened_since_clear,
            "sample_count": len(self._samples),
            "samples": [s.to_dict() for s in self._samples[-40:]],
        }

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
        self._awaiting_far_anchor = True
        self._doors_opened_since_clear = False
        self._near_correction_arrival_reset_used = False
