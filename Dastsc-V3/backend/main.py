"""
main.py — Nexus V3 API: WebSocket de telemetría y REST auxiliar.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import Any, Dict, List, Optional
import asyncio
import json
import logging
import math
import os
import sys
import time
from datetime import datetime, timezone

# Con reload=True, uvicorn importa este módulo en un worker sin ejecutar __main__.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from core.parser import parse_telemetry_line
from core.profiles import ProfileManager
from core.raildriver import get_raildriver_client
import core.ocr_hud as ocr_hud
import core.brake_log as brake_log
import core.session_log as session_log
import core.command_bus as command_bus
import core.station_distance as station_distance
from core.cab_inference import CabInferenceState, enrich_cab_telemetry

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_PROFILES_DIR = os.path.normpath(os.path.join(_BACKEND_DIR, "..", "..", "profiles"))

_GETDATA_PLUGIN_PATH = (
    r"C:\Program Files (x86)\Steam\steamapps\common\RailWorks\plugins\GetData.txt"
)
_GETDATA_ALT_PATH = r"C:\Program Files (x86)\Steam\steamapps\common\RailWorks\GetData.txt"
_SENDCOMMAND_FILENAME = "SendCommand.txt"


def _telemetry_int(data: Dict[str, Any], key: str, default: int = 1) -> int:
    try:
        return int(float(data.get(key) or default))
    except (TypeError, ValueError):
        return default


def _telemetry_float_from_keys(data: Dict[str, Any], *keys: str, default: float = 0.0) -> float:
    for key in keys:
        if key in data:
            try:
                return float(data[key])
            except (TypeError, ValueError):
                pass
    return default

_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5175",
]

_POLL_INTERVAL_S = 0.01
_HEARTBEAT_EVERY_N = 200  # a 100 Hz → keep-alive cada ~2 s si GetData no cambia
_GAME_LINK_STALE_S = 4.0
_DOOR_OPEN_THRESHOLD = 0.5
_PROFILE_SYNC_INTERVAL_S = 2.0


def _sanitize(obj: Any) -> Any:
    """Reemplaza float no finitos por 0 para que JSON.parse no falle en el frontend."""
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else 0.0
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj


def _resolve_profiles_dir(candidates: Optional[List[str]] = None) -> str:
    """Primera carpeta de perfiles existente; fallback al path por defecto del repo."""
    if candidates is None:
        env_dir = os.environ.get("NEXUS_PROFILES_DIR", "").strip()
        candidates = [
            env_dir,
            os.path.normpath(os.path.join(os.getcwd(), "profiles")),
            os.path.normpath(os.path.join(os.getcwd(), "..", "profiles")),
            os.path.normpath(os.path.join(os.getcwd(), "..", "..", "profiles")),
            _DEFAULT_PROFILES_DIR,
        ]
    for path in candidates:
        if path and os.path.isdir(path):
            return path
    return _DEFAULT_PROFILES_DIR


def _resolve_getdata_path(
    plugin_path: str = _GETDATA_PLUGIN_PATH,
    alt_path: str = _GETDATA_ALT_PATH,
) -> Optional[str]:
    """Ruta activa de GetData.txt del plugin TSC, o None si no existe."""
    if os.path.exists(plugin_path):
        return plugin_path
    if os.path.exists(alt_path):
        return alt_path
    return None


def _resolve_send_command_path(
    plugin_path: str = _GETDATA_PLUGIN_PATH,
    alt_path: str = _GETDATA_ALT_PATH,
) -> Optional[str]:
    """Ruta de SendCommand.txt junto a GetData.txt del plugin TSC."""
    getdata = _resolve_getdata_path(plugin_path, alt_path)
    if not getdata:
        return None
    return os.path.join(os.path.dirname(getdata), _SENDCOMMAND_FILENAME)


def _doors_open(door_l: float, door_r: float, threshold: float = _DOOR_OPEN_THRESHOLD) -> bool:
    return door_l > threshold or door_r > threshold


def _apply_ocr_metadata(data: Dict[str, Any], ocr_result: Dict[str, Any]) -> None:
    """Metadatos OCR (sin distancia — la distancia la calcula StationDistanceTracker)."""
    if ocr_result.get("station_name"):
        data["StationNameOCR"] = ocr_result["station_name"]
    if ocr_result.get("eta"):
        data["StationETA"] = ocr_result["eta"]
    if ocr_result.get("scheduled_time"):
        data["StationScheduled"] = ocr_result["scheduled_time"]


def _log_ocr_session_event(
    event: str,
    tracker: station_distance.StationDistanceTracker,
    result: Optional[Dict[str, Any]] = None,
    error: Optional[str] = None,
) -> None:
    """Registra captura OCR en el log de sesión V4 activo."""
    session_log._store.ensure_active_session({"source": "backend_ocr"})
    payload: Dict[str, Any] = {
        "type": "ocr_capture",
        "t": time.time(),
        "wall": datetime.now(timezone.utc).isoformat(),
        "event": event,
    }
    if result:
        raw_text = result.get("raw_text")
        payload["parsed"] = {
            "station_name": result.get("station_name"),
            "distance_m": result.get("distance_m"),
            "eta": result.get("eta"),
            "scheduled_time": result.get("scheduled_time"),
            "distance_unit_raw": result.get("distance_unit_raw"),
            "distance_value_raw": result.get("distance_value_raw"),
            "raw_text": (raw_text[:500] + "…") if isinstance(raw_text, str) and len(raw_text) > 500 else raw_text,
        }
    if error:
        payload["error"] = error
    payload["tracker"] = tracker.debug_payload()
    session_log._store.append_active([payload])


_BACKEND_TICK_INTERVAL_S = 2.5
_last_backend_tick_at = 0.0


def _log_backend_telemetry_tick(data: Dict[str, Any], profile_id: Optional[str]) -> None:
    """Tick de respaldo desde GetData cuando V4 no vuelca eventos."""
    global _last_backend_tick_at
    now = time.time()
    if now - _last_backend_tick_at < _BACKEND_TICK_INTERVAL_S:
        return
    _last_backend_tick_at = now

    session_log._store.ensure_active_session({"source": "backend_telemetry"})
    speed_ms = station_distance.speed_ms_from_telemetry(data)
    payload: Dict[str, Any] = {
        "type": "backend_tick",
        "t": now,
        "wall": datetime.now(timezone.utc).isoformat(),
        "profileId": profile_id,
        "speed": {
            "ms": round(speed_ms, 4),
            "display": data.get("SpeedDisplay") or data.get("Speed"),
            "unit": "MPH" if int(float(data.get("SpeedoType") or 1)) == 1 else "km/h",
        },
        "brake": {
            "combined": data.get("CombinedControl") or data.get("Combined"),
            "position": data.get("TrainBrake") or data.get("VirtualBrake"),
        },
        "station": {
            "distanceM": data.get("StationDistance"),
            "nameOcr": data.get("StationNameOCR"),
            "source": data.get("StationDistanceSource"),
        },
        "signaling": {
            "aspect": data.get("NextSignalAspect"),
            "distanceM": data.get("DistToNextSignal"),
        },
        "train": {"name": data.get("LocoName"), "profileId": profile_id},
    }
    session_log._store.append_active([payload])


# Referencia al tracker activo (telemetry_reader) para API de depuración.
_active_station_tracker: Optional[station_distance.StationDistanceTracker] = None
_cab_inference_state = CabInferenceState()


def get_station_tracker() -> Optional[station_distance.StationDistanceTracker]:
    return _active_station_tracker


def _apply_station_distance(
    data: Dict[str, Any],
    tracker: station_distance.StationDistanceTracker,
) -> None:
    lua_dist = station_distance.normalize_lua_station_distance(
        float(data.get("StationDistance") or -1),
    )
    tracked = tracker.distance_m()

    if lua_dist is not None:
        data["StationDistanceLuaM"] = lua_dist
        data["StationDistance"] = float(lua_dist)
        data["StationDistanceSource"] = "lua"
    elif tracked is not None:
        data["StationDistance"] = round(tracked, 1)
        data["StationDistanceSource"] = "ocr_tracker"
    else:
        data["StationDistanceSource"] = "none"

    for key, value in tracker.telemetry_fields().items():
        data[key] = value


def _win_reset_exception_handler(loop: asyncio.AbstractEventLoop) -> None:
    """Suprime ConnectionResetError al cerrar WebSockets en Windows."""
    original = loop.get_exception_handler()

    def handler(lp: asyncio.AbstractEventLoop, context: dict) -> None:
        exc = context.get("exception")
        handle_str = str(context.get("handle", "") or "")
        if isinstance(exc, (ConnectionResetError, OSError)) and "_call_connection_lost" in handle_str:
            return
        if original is not None:
            original(lp, context)
        else:
            lp.default_exception_handler(context)

    loop.set_exception_handler(handler)


class TelemetryManager:
    def __init__(self, profiles_dir: Optional[str] = None):
        self.active_connections: List[WebSocket] = []
        self.active_profiles_path = profiles_dir or _resolve_profiles_dir()
        self.profile_manager = ProfileManager(self.active_profiles_path)
        self.current_profile: Optional[Dict[str, Any]] = None
        self.last_payload: Dict[str, Any] = {}
        self._profile_sync_key: str = ""
        self._last_profile_sync_at: float = 0.0

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)
        await websocket.send_json(self._build_init_payload())

    def _build_init_payload(self) -> Dict[str, Any]:
        return {
            "type": "INIT",
            "available_profiles": self.profile_manager.get_all_profiles(),
            "active_profile": self.current_profile,
            "active_profile_id": self.current_profile.get("id") if self.current_profile else None,
            "isConnected": True,
            **self.last_payload,
        }

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict) -> None:
        safe = _sanitize(message)
        self.last_payload.update(safe)
        for connection in list(self.active_connections):
            asyncio.create_task(self._safe_send(connection, safe))

    async def _safe_send(self, ws: WebSocket, data: dict) -> None:
        try:
            await ws.send_json(data)
        except Exception:
            pass

    async def handle_command(self, cmd: dict) -> dict:
        cmd_type = cmd.get("type")
        if cmd_type == "SELECT_PROFILE":
            profile_id = cmd.get("profile_id")
            if not self.profile_manager.select_manual_profile(profile_id):
                return {"type": "COMMAND_ACK", "ok": False, "error": "profile_not_found"}
            self.current_profile = self.profile_manager.manual_profile
            await self._broadcast_profile_change()
            return {"type": "COMMAND_ACK", "ok": True, "action": "profile_changed"}

        if cmd_type == "COMMAND":
            control = str(cmd.get("command") or "").strip()
            try:
                value = float(cmd.get("value", 0))
            except (TypeError, ValueError):
                return {"type": "COMMAND_ACK", "ok": False, "error": "invalid_value"}
            result = command_bus.dispatch_command(
                _resolve_send_command_path(),
                control,
                value,
                self.current_profile,
            )
            if result.get("ok"):
                logging.info("COMMAND sent %s=%s", control, result.get("value"))
            else:
                logging.warning("COMMAND rejected %s: %s", control, result.get("error"))
            return {"type": "COMMAND_ACK", **result}

        if cmd_type == "PURGE_SEND_COMMAND":
            purged = _purge_send_command_file()
            return {"type": "COMMAND_ACK", "ok": True, "action": "purged" if purged else "no_file"}

        if cmd_type == "SESSION_REGISTER":
            meta = cmd.get("meta") if isinstance(cmd.get("meta"), dict) else {}
            session_id = cmd.get("session_id")
            if session_id and isinstance(session_id, str):
                session_log._store.adopt_session(session_id, meta)
            else:
                session_id = session_log._store.ensure_active_session(meta)
            return {
                "type": "SESSION_ACK",
                "ok": True,
                "session_id": session_id,
            }

        return {"type": "COMMAND_ACK", "ok": False, "error": "unknown_command_type"}

    async def _broadcast_profile_change(self) -> None:
        await self.broadcast({
            "type": "PROFILE_CHANGED",
            "active_profile": self.current_profile,
            "active_profile_id": self.current_profile.get("id") if self.current_profile else None,
        })

    async def sync_auto_profile(self, lua_loco_name: str = "") -> None:
        now = time.time()
        if now - self._last_profile_sync_at < _PROFILE_SYNC_INTERVAL_S:
            return
        self._last_profile_sync_at = now

        rd = get_raildriver_client()
        snapshot = rd.snapshot() if rd.available else None
        loco_names = snapshot.loco_names if snapshot else []
        if not loco_names and lua_loco_name:
            loco_names = [lua_loco_name]

        controller_names = snapshot.controller_names if snapshot else []
        limits = snapshot.limits_by_name() if snapshot else None
        sync_key = "|".join(loco_names + controller_names[:8])
        if sync_key == self._profile_sync_key and self.current_profile is not None:
            return

        resolved = self.profile_manager.resolve_active_profile(
            loco_names=loco_names,
            controller_names=controller_names,
            limits_by_name=limits,
        )
        if resolved is None:
            return

        profile_id = resolved.get("id")
        current_id = self.current_profile.get("id") if self.current_profile else None
        if profile_id == current_id and sync_key == self._profile_sync_key:
            return

        self._profile_sync_key = sync_key
        self.current_profile = resolved
        await self._broadcast_profile_change()


manager = TelemetryManager()


def _purge_send_command_file() -> bool:
    """Elimina SendCommand.txt + flag huérfanos (bloquean mandos del jugador en TSC)."""
    purged = command_bus.purge_lua_commands(_resolve_send_command_path())
    if purged:
        logging.info("Purged stale SendCommand / NexusApplyCommands.flag")
    return purged


@asynccontextmanager
async def lifespan(app: FastAPI):
    _win_reset_exception_handler(asyncio.get_running_loop())
    profile_count = len(manager.profile_manager.profiles)
    ocr_status = "disponible" if ocr_hud.is_available() else "no disponible"
    print(f"[Nexus] Perfiles: {manager.active_profiles_path} ({profile_count} cargados)")
    print(f"[Nexus] OCR: {ocr_status}")
    if _purge_send_command_file():
        print("[Nexus] SendCommand.txt huérfano eliminado al arranque")
    asyncio.create_task(telemetry_reader())
    yield


app = FastAPI(title="Nexus v3 Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


async def telemetry_reader() -> None:
    """Bucle de sondeo de GetData.txt; OCR al cerrar puertas y corrección única cerca de estación."""
    global _active_station_tracker
    sync_counter = 0
    last_mtime = 0.0
    last_game_telemetry_at = 0.0
    ocr_last_result: Dict[str, Any] = {}
    ocr_door_was_open = False
    ocr_is_capturing = False
    station_tracker = station_distance.StationDistanceTracker()
    _active_station_tracker = station_tracker
    last_active_cab: Optional[int] = None
    last_reversal: Optional[float] = None

    async def run_ocr_capture(
        event: station_distance.SampleEvent = "door_anchor",
        capture_speed_ms: float = 0.0,
        capture_time: float = 0.0,
    ) -> None:
        nonlocal ocr_last_result, ocr_is_capturing
        anchored = False
        result = None
        try:
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(None, ocr_hud.capture_next_stop)
            if result and result.get("distance_m") is not None:
                ocr_last_result = result
                anchored = station_tracker.anchor_from_ocr(
                    float(result["distance_m"]),
                    event=event,
                    now=capture_time or time.time(),
                    speed_ms=capture_speed_ms,
                    ocr_raw_m=float(result["distance_m"]),
                )
                if anchored:
                    _log_ocr_session_event(event, station_tracker, result=result)
                else:
                    _log_ocr_session_event(
                        event,
                        station_tracker,
                        result=result,
                        error="rejected_jump",
                    )
            else:
                _log_ocr_session_event(
                    event,
                    station_tracker,
                    result=result,
                    error="no_distance_parsed",
                )
        except Exception as exc:
            print(f"[OCR] Error ({event}): {exc}")
            _log_ocr_session_event(event, station_tracker, error=str(exc))
        finally:
            attempt_time = capture_time or time.time()
            station_tracker.mark_ocr_capture_attempted(attempt_time)
            if event == "near_correction" and not anchored:
                ocr_m = result.get("distance_m") if result else None
                if ocr_m is None or not station_tracker.should_retry_near_correction(
                    float(ocr_m), capture_speed_ms,
                ):
                    station_tracker.mark_near_correction_attempted(attempt_time)
            ocr_is_capturing = False

    while True:
        try:
            now = time.time()
            active_path = _resolve_getdata_path()

            if active_path and os.path.exists(active_path):
                mtime = os.path.getmtime(active_path)
                if mtime > last_mtime:
                    last_mtime = mtime
                    with open(active_path, "r", encoding="utf-8") as f:
                        line = f.readline()
                    if line:
                        last_game_telemetry_at = now
                        data = parse_telemetry_line(line)
                        door_l = float(data.get("DoorL") or 0.0)
                        door_r = float(data.get("DoorR") or 0.0)

                        doors_open_now = _doors_open(door_l, door_r)
                        door_just_closed = ocr_door_was_open and not doors_open_now
                        ocr_door_was_open = doors_open_now

                        speed_ms = station_distance.speed_ms_from_telemetry(data)
                        lua_station_raw = float(data.get("StationDistance") or -1)
                        station_tracker.integrate(speed_ms, now)
                        if lua_station_raw > 0:
                            station_tracker.sync_lua_distance(
                                lua_station_raw,
                                now=now,
                                speed_ms=speed_ms,
                            )
                        station_tracker.maybe_record_sample(now, speed_ms)

                        enrich_cab_telemetry(data, _cab_inference_state)

                        active_cab = _telemetry_int(data, "ActiveCab", default=1)
                        reversal = _telemetry_float_from_keys(data, "Reversal", "Reverser")
                        if station_distance.should_clear_on_turnaround(
                            speed_ms=speed_ms,
                            tracked_dist_m=station_tracker.distance_m(),
                            active_cab=active_cab,
                            reversal=reversal,
                            last_active_cab=last_active_cab,
                            last_reversal=last_reversal,
                        ):
                            station_tracker.clear()
                        last_active_cab = active_cab
                        last_reversal = reversal

                        combined_control = _telemetry_float_from_keys(
                            data, "CombinedControl", "Combined",
                        )
                        if station_distance.should_clear_on_departure_intent(
                            speed_ms=speed_ms,
                            tracked_dist_m=station_tracker.distance_m(),
                            combined_control=combined_control,
                        ):
                            station_tracker.clear()

                        if ocr_hud.is_available() and not ocr_is_capturing:
                            if door_just_closed:
                                ocr_is_capturing = True
                                asyncio.create_task(
                                    run_ocr_capture("door_anchor", speed_ms, now),
                                )
                            elif station_tracker.should_request_near_correction(speed_ms, now):
                                ocr_is_capturing = True
                                asyncio.create_task(
                                    run_ocr_capture("near_correction", speed_ms, now),
                                )
                            elif (
                                not doors_open_now
                                and station_tracker.should_request_mid_leg_correction(speed_ms, now)
                            ):
                                ocr_is_capturing = True
                                asyncio.create_task(
                                    run_ocr_capture("mid_leg_correction", speed_ms, now),
                                )

                        _apply_ocr_metadata(data, ocr_last_result)
                        _apply_station_distance(data, station_tracker)

                        profile_id = (
                            manager.current_profile.get("id")
                            if manager.current_profile else None
                        )
                        _log_backend_telemetry_tick(data, profile_id)

                        await manager.sync_auto_profile(str(data.get("LocoName") or ""))

                        await manager.broadcast({
                            "type": "TELEMETRY",
                            **data,
                            "timestamp": time.time(),
                            "gameLinked": True,
                        })
                    sync_counter += 1
                elif sync_counter % _HEARTBEAT_EVERY_N == 0:
                    game_linked = (now - last_game_telemetry_at) <= _GAME_LINK_STALE_S
                    await manager.broadcast({
                        "type": "HEARTBEAT",
                        "timestamp": now,
                        "gameLinked": game_linked,
                    })
                    sync_counter += 1
                else:
                    sync_counter += 1
            elif sync_counter % _HEARTBEAT_EVERY_N == 0:
                await manager.broadcast({
                    "type": "HEARTBEAT",
                    "timestamp": now,
                    "gameLinked": False,
                })
                sync_counter += 1
            else:
                sync_counter += 1

            await asyncio.sleep(_POLL_INTERVAL_S)
        except Exception as exc:
            print(f"[Nexus] Error en telemetry_reader: {exc}")
            await asyncio.sleep(0.5)


@app.get("/api/station/distance-debug")
async def station_distance_debug():
    """Muestras temporales de distancia a estación (ancla, ticks, corrección)."""
    tracker = get_station_tracker()
    if tracker is None:
        return {"has_anchor": False, "samples": []}
    return tracker.debug_payload()


@app.get("/api/ocr/debug")
async def ocr_debug():
    """Captura la región OCR y devuelve imágenes de depuración + resultado parseado."""
    if not ocr_hud.is_available():
        return {"error": "OCR no disponible (mss/pytesseract no instalados)"}

    try:
        import mss as _mss
        from PIL import Image, ImageOps as _ImgOps
        from core.ocr_hud import get_ocr_region

        region = get_ocr_region()
        with _mss.mss() as sct:
            shot = sct.grab(region)
            img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")

        debug_path = os.path.join(_BACKEND_DIR, "ocr_debug.png")
        img.save(debug_path)

        gray = img.convert("L")
        auto = _ImgOps.autocontrast(gray, cutoff=2)
        lut = [0] * 140 + [255] * 116
        thresh = auto.point(lut)
        w, h = thresh.size
        scaled = thresh.resize((w * 2, h * 2), Image.Resampling.LANCZOS).convert("L")
        proc_path = os.path.join(_BACKEND_DIR, "ocr_debug_processed.png")
        scaled.save(proc_path)

        result = ocr_hud.capture_next_stop()
        return {
            "ok": True,
            "saved_to": debug_path,
            "processed_to": proc_path,
            "region": region,
            "parsed": result,
        }
    except Exception as exc:
        return {"error": str(exc)}


@app.post("/api/brake/event")
async def post_brake_event(request: Request):
    """Registra un evento de frenado real capturado por el frontend."""
    try:
        raw_body = await request.body()
        body = json.loads(raw_body.decode("utf-8"))
        body["timestamp"] = body.get("timestamp") or time.time()
        saved = brake_log.append_event(body)
        return {"ok": saved, "rejected": not saved}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@app.get("/api/profiles/{profile_id}")
async def get_profile(profile_id: str):
    profile = manager.profile_manager.get_by_id(profile_id)
    if profile is None:
        return {"error": "not_found"}
    return profile


@app.get("/api/brake/events")
async def get_brake_events(limit: int = 50, profile: str = ""):
    events = brake_log.get_events(limit=limit, profile=profile or None)
    return {"events": events, "count": len(events)}


@app.get("/api/brake/stats")
async def get_brake_stats(profile: str = ""):
    return brake_log.get_stats(profile=profile or None)


@app.post("/api/debug/session/start")
async def debug_session_start(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}
    meta = body.get("meta") if isinstance(body.get("meta"), dict) else {}
    if not meta:
        meta = {k: v for k, v in body.items() if k not in ("meta", "session_id")}
    session_id = session_log._store.start(meta if isinstance(meta, dict) else {})
    return {"ok": True, "session_id": session_id}


@app.patch("/api/debug/session/{session_id}/meta")
async def debug_session_meta(session_id: str, request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    patch = body if isinstance(body, dict) else {}
    saved = session_log._store.update_meta(session_id, patch)
    return {"ok": saved}


@app.post("/api/debug/session/{session_id}/events")
async def debug_session_events(session_id: str, request: Request):
    try:
        body = await request.json()
        events = body.get("events") if isinstance(body, dict) else []
        if not isinstance(events, list):
            events = []
        saved = session_log._store.append(session_id, events)
        return {"ok": saved}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@app.post("/api/debug/session/{session_id}/end")
async def debug_session_end(session_id: str, request: Request):
    try:
        body = await request.json()
        summary = body.get("summary") if isinstance(body, dict) else None
        saved = session_log._store.end(session_id, summary if isinstance(summary, dict) else None)
        return {"ok": saved}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@app.get("/api/debug/sessions")
async def debug_sessions_list():
    return {"sessions": session_log._store.list_sessions()}


@app.get("/api/debug/sessions/{session_id}")
async def debug_session_get(session_id: str):
    data = session_log._store.get(session_id)
    if data is None:
        return {"error": "not_found"}
    return data


@app.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            try:
                cmd = await websocket.receive_json()
                ack = await manager.handle_command(cmd)
                if ack:
                    await websocket.send_json(_sanitize(ack))
            except WebSocketDisconnect:
                break
            except Exception:
                continue
    finally:
        manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=["."],
        loop="asyncio",
        ws_ping_interval=20,
        ws_ping_timeout=20,
        timeout_keep_alive=30,
    )
