from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import Any, List
import asyncio
import json
import math
import os
import sys
import time

# Fix del event loop de Windows a NIVEL DE MÓDULO: con reload=True, uvicorn lanza
# un subproceso worker que importa este módulo pero NO ejecuta __main__, así que
# la policy debe fijarse aquí para que también aplique en el worker recargado.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from core.parser import parse_telemetry_line
from core.profiles import ProfileManager
import core.ocr_hud as ocr_hud
import core.brake_log as brake_log

def _sanitize(obj: Any) -> Any:
    """Reemplaza float no-finitos (Infinity, -Infinity, NaN) por 0 recursivamente.
    Evita que JSON.parse falle en el frontend cuando el plugin emite valores
    indefinidos (señales sin leer, límites fuera de rango, etc.).
    """
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else 0.0
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj


_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("--------------------------------------------------")
    print("   NEXUS V3 ENGINE - CORE UPDATED (JSON FIX)      ")
    print("--------------------------------------------------")
    # Suprimir ConnectionResetError [WinError 10054] del ProactorEventLoop en Windows.
    # Ocurre cuando el navegador cierra el WebSocket con un RST en vez de FIN.
    # 'source_traceback' es un StackSummary (objeto), no un string — usar 'handle'.
    loop = asyncio.get_event_loop()
    _orig_handler = loop.get_exception_handler()  # puede ser None
    def _suppress_win_reset(lp, context):
        exc = context.get('exception')
        handle_str = str(context.get('handle', '') or '')
        if isinstance(exc, (ConnectionResetError, OSError)) and '_call_connection_lost' in handle_str:
            return  # ruido de Windows — ignorar
        if _orig_handler is not None:
            _orig_handler(lp, context)
        else:
            lp.default_exception_handler(context)
    loop.set_exception_handler(_suppress_win_reset)
    asyncio.create_task(telemetry_reader())
    yield


app = FastAPI(title="Nexus v3 Engine", lifespan=lifespan)
print("DEBUG: V3 ENGINE STARTING")
print(f"DEBUG: PATH: {os.path.abspath(__file__)}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Rutas
GETDATA_PATH = (
    r"C:\Program Files (x86)\Steam\steamapps\common\RailWorks\plugins\GetData.txt"
)
ALT_PATH = r"C:\Program Files (x86)\Steam\steamapps\common\RailWorks\GetData.txt"
PROFILES_PATH = r"c:\Users\doski\Dastsc\profiles"


class TelemetryManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

        # Búsqueda dinámica de la carpeta de perfiles
        posibles_rutas = [
            PROFILES_PATH,
            os.path.normpath(os.path.join(os.getcwd(), "profiles")),
            os.path.normpath(os.path.join(os.getcwd(), "..", "profiles")),
            os.path.normpath(os.path.join(os.getcwd(), "..", "..", "profiles")),
        ]

        self.active_profiles_path = posibles_rutas[0]
        for ruta in posibles_rutas:
            if os.path.exists(ruta):
                self.active_profiles_path = ruta
                break

        print(f"DEBUG: NEXUS V3 Engine usando perfiles en: {self.active_profiles_path}")
        self.profile_manager = ProfileManager(self.active_profiles_path)
        self.current_profile = None
        self.last_payload = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        profiles = self.profile_manager.get_all_profiles()

        initial_data = {
            "type": "INIT",
            "available_profiles": profiles,
            "active_profile": self.current_profile,
            "active_profile_id": self.current_profile.get("id")
            if self.current_profile
            else None,
            "isConnected": True,
            **self.last_payload,
        }
        await websocket.send_json(initial_data)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        safe = _sanitize(message)
        self.last_payload.update(safe)
        
        # Enviar de forma asíncrona y no bloqueante para cada cliente
        for connection in self.active_connections:
            asyncio.create_task(self._safe_send(connection, safe))

    async def _safe_send(self, ws: WebSocket, data: dict):
        try:
            await ws.send_json(data)
        except Exception:
            # Si falla el envío, no hacemos nada aquí; el websocket_endpoint
            # se encargará de la desconexión si el socket está roto.
            pass


manager = TelemetryManager()

if ocr_hud.is_available():
    print("[OCR] Sistema de captura HUD disponible (mss + pytesseract)")
else:
    print("[OCR] No disponible — instalar mss, pytesseract y Tesseract binary")


async def telemetry_reader():
    """Bucle principal de sondeo (mayor frecuencia para v3)."""
    sync_counter = 0
    last_mtime = 0
    ocr_last_result: dict = {}
    ocr_last_capture_time: float = 0.0
    ocr_door_was_open: bool = False
    ocr_is_capturing: bool = False

    async def run_ocr_capture():
        nonlocal ocr_last_result, ocr_is_capturing
        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, ocr_hud.capture_next_stop)
            if result:
                ocr_last_result = result
        except Exception as e:
            print(f"[OCR] Error: {e}")
        finally:
            ocr_is_capturing = False

    while True:
        try:
            now = time.time()
            active_path = GETDATA_PATH if os.path.exists(GETDATA_PATH) else ALT_PATH

            if os.path.exists(active_path):
                # OPTIMIZACIÓN V3: Comprobar el tiempo de modificación del archivo (mtime)
                # Solo leemos y enviamos si el archivo ha sido actualizado por el plugin.
                # Esto reduce drásticamente el uso de CPU y el tráfico de red innecesario.
                mtime = os.path.getmtime(active_path)
                if mtime > last_mtime:
                    last_mtime = mtime
                    with open(active_path, "r", encoding="utf-8") as f:
                        line = f.readline()
                        if line:
                            data = parse_telemetry_line(line)

                            door_l = float(data.get("DoorL") or 0.0)
                            door_r = float(data.get("DoorR") or 0.0)

                            # Distancia desde el último resultado OCR
                            if ocr_last_result.get("distance_m") is not None:
                                data["StationDistance"] = round(ocr_last_result["distance_m"], 1)

                            # ── Detección de cierre de puertas ───────────────────────────────
                            doors_open_now = (door_l > 0.5) or (door_r > 0.5)
                            door_just_closed = ocr_door_was_open and not doors_open_now
                            ocr_door_was_open = doors_open_now

                            # ── OCR: captura del display de próxima parada ─────────────────────
                            if ocr_hud.is_available() and not ocr_is_capturing:
                                ocr_interval = 30.0
                                if ocr_last_result.get("distance_m") is not None:
                                    d = ocr_last_result["distance_m"]
                                    ocr_interval = 5.0 if d < 1000 else 10.0
                                if door_just_closed or (now - ocr_last_capture_time) >= ocr_interval:
                                    ocr_last_capture_time = now
                                    ocr_is_capturing = True
                                    asyncio.create_task(run_ocr_capture())

                            # Aplicar resultados del OCR
                            if ocr_last_result:
                                if ocr_last_result.get("station_name"):
                                    data["StationNameOCR"] = ocr_last_result["station_name"]
                                if ocr_last_result.get("eta"):
                                    data["StationETA"] = ocr_last_result["eta"]
                                if ocr_last_result.get("scheduled_time"):
                                    data["StationScheduled"] = ocr_last_result["scheduled_time"]

                            payload = {
                                "type": "TELEMETRY",
                                **data,
                                "timestamp": time.time(),
                            }

                            sync_counter += 1
                            await manager.broadcast(payload)
                else:
                    # Si el archivo no ha cambiado (ej. juego pausado), enviar keep-alive cada 2s
                    if sync_counter % 200 == 0:
                        await manager.broadcast({"type": "HEARTBEAT", "timestamp": now})
                    sync_counter += 1

            # Sondeo a 100Hz (0.01s) para latencia ultra-baja una vez detectado el cambio
            await asyncio.sleep(0.01)
        except Exception as e:
            print(f"Error en telemetry_reader: {e}")
            await asyncio.sleep(0.5)


@app.get("/api/ocr/debug")
async def ocr_debug():
    """
    Captura la región OCR ahora mismo y devuelve:
    - La imagen guardada en backend/ocr_debug.png (para ver qué está capturando)
    - El texto OCR en bruto
    - El resultado parseado
    """
    if not ocr_hud.is_available():
        return {"error": "OCR no disponible (mss/pytesseract no instalados)"}

    try:
        import mss as _mss
        from PIL import Image
        from core.ocr_hud import OCR_REGION

        with _mss.mss() as sct:
            shot = sct.grab(OCR_REGION)
            img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")

        # Guardar imagen original en disco para inspección
        debug_path = os.path.join(os.path.dirname(__file__), "ocr_debug.png")
        img.save(debug_path)

        # También procesar como lo hace el OCR real (mismo pipeline)
        gray = img.convert("L")
        from PIL import ImageOps as _ImgOps
        auto = _ImgOps.autocontrast(gray, cutoff=2)
        lut = [0] * 140 + [255] * 116
        thresh = auto.point(lut)
        w, h = thresh.size
        scaled = thresh.resize((w * 2, h * 2), Image.Resampling.LANCZOS)
        scaled = scaled.convert("L")
        proc_path = os.path.join(os.path.dirname(__file__), "ocr_debug_processed.png")
        scaled.save(proc_path)

        # OCR
        result = ocr_hud.capture_next_stop()

        return {
            "ok": True,
            "saved_to": debug_path,
            "processed_to": proc_path,
            "region": OCR_REGION,
            "parsed": result,
        }
    except Exception as exc:
        return {"error": str(exc)}


# ── Aprendizaje de Frenado ────────────────────────────────────────────────────

@app.post("/api/brake/event")
async def post_brake_event(request: Request):
    """Registra un evento de frenado real capturado por el frontend."""
    try:
        raw_body = await request.body()
        body = json.loads(raw_body.decode("utf-8"))
        body["timestamp"] = body.get("timestamp") or time.time()
        brake_log.append_event(body)
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/api/brake/events")
async def get_brake_events(limit: int = 50, profile: str = ""):
    """Devuelve los últimos eventos de frenado, opcionalmente filtrados por perfil."""
    events = brake_log.get_events(limit=limit, profile=profile or None)
    return {"events": events, "count": len(events)}


@app.get("/api/brake/stats")
async def get_brake_stats(profile: str = ""):
    """Estadísticas agregadas por muesca para calibrar las recomendaciones."""
    stats = brake_log.get_stats(profile=profile or None)
    return stats

# ─────────────────────────────────────────────────────────────────────────────


@app.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    client_host = websocket.client.host if websocket.client else "unknown"
    print(f"WS: New connection from {client_host}")
    await manager.connect(websocket)
    try:
        while True:
            try:
                # Esperar comandos del cliente (opcional)
                cmd = await websocket.receive_json()
                if cmd.get("type") == "SELECT_PROFILE":
                    profile_id = cmd.get("profile_id")
                    print(f"WS: Request profile -> {profile_id}")
                    if manager.profile_manager.select_manual_profile(profile_id):
                        manager.current_profile = manager.profile_manager.manual_profile
                        perfil_id = manager.current_profile.get("id") if manager.current_profile else "None"
                        await manager.broadcast({
                            "type": "PROFILE_CHANGED",
                            "active_profile": manager.current_profile,
                            "active_profile_id": perfil_id,
                        })
            except WebSocketDisconnect:
                print(f"WS: Client {client_host} disconnected (clean)")
                break
            except Exception as e:
                # Error en receive_json (ej. no es JSON), ignorar
                continue
    except Exception as e:
        print(f"WS: Error in connection {client_host}: {e}")
    finally:
        print(f"WS: Closing connection for {client_host}")
        manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn
    # reload=True requiere pasar la app como string de importación ("main:app")
    # para que el reloader pueda reimportar el módulo en el worker. Así los cambios
    # en el backend (incl. ocr_hud) se recargan sin reiniciar manualmente.
    uvicorn.run(
        "main:app",
        host="0.0.0.0", 
        port=8000, 
        reload=True,
        reload_dirs=["."],
        loop="asyncio",
        ws_ping_interval=20,
        ws_ping_timeout=20,
        timeout_keep_alive=30
    )
