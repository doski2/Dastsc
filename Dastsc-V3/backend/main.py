"""
main.py — Nexus V3 API: WebSocket de telemetría y REST auxiliar.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import Any, Dict, List, Optional
import asyncio
import json
import math
import os
import sys
import time

# Con reload=True, uvicorn importa este módulo en un worker sin ejecutar __main__.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from core.parser import parse_telemetry_line
from core.profiles import ProfileManager
from core.raildriver import get_raildriver_client
import core.ocr_hud as ocr_hud
import core.brake_log as brake_log

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_PROFILES_DIR = os.path.normpath(os.path.join(_BACKEND_DIR, "..", "..", "profiles"))

_GETDATA_PLUGIN_PATH = (
    r"C:\Program Files (x86)\Steam\steamapps\common\RailWorks\plugins\GetData.txt"
)
_GETDATA_ALT_PATH = r"C:\Program Files (x86)\Steam\steamapps\common\RailWorks\GetData.txt"

_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5175",
]

_POLL_INTERVAL_S = 0.01
_HEARTBEAT_EVERY_N = 200  # a 100 Hz → keep-alive cada ~2 s si GetData no cambia
_DOOR_OPEN_THRESHOLD = 0.5
_OCR_INTERVAL_DEFAULT_S = 30.0
_OCR_INTERVAL_NEAR_S = 5.0
_OCR_INTERVAL_MID_S = 10.0
_OCR_NEAR_DISTANCE_M = 1000.0
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


def _doors_open(door_l: float, door_r: float, threshold: float = _DOOR_OPEN_THRESHOLD) -> bool:
    return door_l > threshold or door_r > threshold


def _ocr_capture_interval(distance_m: Optional[float]) -> float:
    if distance_m is None:
        return _OCR_INTERVAL_DEFAULT_S
    if distance_m < _OCR_NEAR_DISTANCE_M:
        return _OCR_INTERVAL_NEAR_S
    return _OCR_INTERVAL_MID_S


def _apply_ocr_to_telemetry(data: Dict[str, Any], ocr_result: Dict[str, Any]) -> None:
    """Enriquece el dict de telemetría con campos derivados del OCR."""
    if ocr_result.get("distance_m") is not None:
        data["StationDistance"] = round(float(ocr_result["distance_m"]), 1)
    if ocr_result.get("station_name"):
        data["StationNameOCR"] = ocr_result["station_name"]
    if ocr_result.get("eta"):
        data["StationETA"] = ocr_result["eta"]
    if ocr_result.get("scheduled_time"):
        data["StationScheduled"] = ocr_result["scheduled_time"]


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

    async def handle_command(self, cmd: dict) -> None:
        if cmd.get("type") != "SELECT_PROFILE":
            return
        profile_id = cmd.get("profile_id")
        if not self.profile_manager.select_manual_profile(profile_id):
            return
        self.current_profile = self.profile_manager.manual_profile
        await self._broadcast_profile_change()

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    _win_reset_exception_handler(asyncio.get_running_loop())
    profile_count = len(manager.profile_manager.profiles)
    ocr_status = "disponible" if ocr_hud.is_available() else "no disponible"
    print(f"[Nexus] Perfiles: {manager.active_profiles_path} ({profile_count} cargados)")
    print(f"[Nexus] OCR: {ocr_status}")
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
    """Bucle de sondeo de GetData.txt y captura OCR periódica."""
    sync_counter = 0
    last_mtime = 0.0
    ocr_last_result: Dict[str, Any] = {}
    ocr_last_capture_time = 0.0
    ocr_door_was_open = False
    ocr_is_capturing = False

    async def run_ocr_capture() -> None:
        nonlocal ocr_last_result, ocr_is_capturing
        try:
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(None, ocr_hud.capture_next_stop)
            if result:
                ocr_last_result = result
        except Exception as exc:
            print(f"[OCR] Error: {exc}")
        finally:
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
                        data = parse_telemetry_line(line)
                        door_l = float(data.get("DoorL") or 0.0)
                        door_r = float(data.get("DoorR") or 0.0)

                        doors_open_now = _doors_open(door_l, door_r)
                        door_just_closed = ocr_door_was_open and not doors_open_now
                        ocr_door_was_open = doors_open_now

                        if ocr_hud.is_available() and not ocr_is_capturing:
                            interval = _ocr_capture_interval(ocr_last_result.get("distance_m"))
                            if door_just_closed or (now - ocr_last_capture_time) >= interval:
                                ocr_last_capture_time = now
                                ocr_is_capturing = True
                                asyncio.create_task(run_ocr_capture())

                        _apply_ocr_to_telemetry(data, ocr_last_result)

                        await manager.sync_auto_profile(str(data.get("LocoName") or ""))

                        await manager.broadcast({
                            "type": "TELEMETRY",
                            **data,
                            "timestamp": time.time(),
                        })
                    sync_counter += 1
                elif sync_counter % _HEARTBEAT_EVERY_N == 0:
                    await manager.broadcast({"type": "HEARTBEAT", "timestamp": now})
                    sync_counter += 1
                else:
                    sync_counter += 1

            await asyncio.sleep(_POLL_INTERVAL_S)
        except Exception as exc:
            print(f"[Nexus] Error en telemetry_reader: {exc}")
            await asyncio.sleep(0.5)


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


@app.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            try:
                cmd = await websocket.receive_json()
                await manager.handle_command(cmd)
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
