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
from core.scenarios import ScenarioManager
from core.station_tracker import StationTracker, _normalize_name as _nn_name
import core.scenario_index as scenario_index
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
        self.scenario_manager = ScenarioManager()
        self.current_profile = None
        self.last_payload = {}
        self.last_scenario_data: dict = {}  # scenario_data cacheado del loop de telemetría (con distancias GPS vivas)

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
_station_tracker = StationTracker()

if ocr_hud.is_available():
    print("[OCR] Sistema de captura HUD disponible (mss + pytesseract)")
else:
    print("[OCR] No disponible — instalar mss, pytesseract y Tesseract binary")


async def telemetry_reader():
    """Bucle principal de sondeo (mayor frecuencia para v3)."""
    sync_counter = 0
    last_mtime = 0
    last_scenario_check = 0
    last_scenario_path = ""   # Ruta del save usado en el último parse
    last_scenario_mtime = 0.0  # mtime del save en el último parse
    scenario_data = {}
    last_rv: str = ""  # RV del tren del jugador, actualizado con cada trama de telemetría
    last_telemetry_time: float = 0.0  # timestamp del último frame de telemetría
    # Variables de estado OCR (locales al bucle)
    ocr_last_result: dict = {}
    ocr_last_capture_time: float = 0.0
    ocr_door_was_open: bool = False
    ocr_is_capturing: bool = False # Flag to avoid multiple concurrent captures
    last_tracker_idx: int = -1
    ocr_anchor_dist: float = -1.0
    ocr_anchor_odo: float = 0.0
    last_scenario_sent_time = 0.0

    async def run_ocr_capture(odo_at_capture: float):
        nonlocal ocr_last_result, ocr_anchor_dist, ocr_anchor_odo, ocr_is_capturing
        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, ocr_hud.capture_next_stop)
            if result:
                ocr_last_result = result
                if result.get("distance_m") is not None:
                    ocr_anchor_dist = result["distance_m"]
                    ocr_anchor_odo = odo_at_capture
        except Exception as e:
            print(f"[OCR] Error: {e}")
        finally:
            ocr_is_capturing = False

    while True:
        try:
            now = time.time()
            # Detectar ruta activa de telemetría
            active_path = GETDATA_PATH if os.path.exists(GETDATA_PATH) else ALT_PATH

            # Chequeo de escenario cada 1.5 segundos para detectar rápido cambios de parada
            # (ACTIVE → SUCCEEDED cuando el tren parte de una estación)
            if now - last_scenario_check > 1.5:
                last_scenario_check = now
                active_info = manager.scenario_manager.find_active_scenario()
                if active_info:
                    new_path = active_info.get("save_path") or ""
                    new_mtime = float(active_info.get("mtime") or 0)
                    # Solo re-parsear si el fichero cambió o si aún no tenemos datos.
                    # Evita parsear Scenario.xml (2.4 MB) en cada ciclo cuando no hay cambios.
                    # Se ejecuta en un hilo para no bloquear el event loop (~300ms de I/O).
                    if (new_path != last_scenario_path or new_mtime > last_scenario_mtime or not scenario_data):
                        last_scenario_path = new_path
                        last_scenario_mtime = new_mtime
                        _rv_snap = last_rv or None
                        loop = asyncio.get_event_loop()
                        scenario_data = await loop.run_in_executor(
                            None,
                            lambda: manager.scenario_manager.get_detailed_scenario_data(player_rv=_rv_snap),
                        )

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

                            # Actualizar StationTracker (Opción 2: odómetro + perfil de ruta)
                            now_t = time.time()
                            delta_t = now_t - last_telemetry_time if last_telemetry_time > 0 else 0.0
                            last_telemetry_time = now_t
                            speed_ms = float(data.get("CurrentSpeed") or 0.0)
                            door_l = float(data.get("DoorL") or 0.0)
                            door_r = float(data.get("DoorR") or 0.0)
                            stops_for_tracker = scenario_data.get("stops", []) if scenario_data else []
                            computed_station_dist = _station_tracker.update(speed_ms, delta_t, stops_for_tracker, door_l, door_r)
                            # Persistir estado del tracker en executor (evita bloquear el event loop
                            # con I/O de disco en el momento de detección de partida).
                            if _station_tracker._pending_save:
                                _station_tracker._pending_save = False
                                loop = asyncio.get_event_loop()
                                loop.run_in_executor(None, _station_tracker.save_state)
                            # Sobreescribir StationDistance del Lua (siempre -1) con el valor calculado.
                            # Si existe un anchor OCR, usarlo como base y decrementar con el odómetro:
                            # esto da la precisión del juego + la suavidad del odómetro entre capturas.
                            if ocr_anchor_dist >= 0:
                                odo_delta = _station_tracker._odometer_m - ocr_anchor_odo
                                ocr_corrected = max(0.0, ocr_anchor_dist - odo_delta)
                                data["StationDistance"] = round(ocr_corrected, 1)
                            elif computed_station_dist >= 0:
                                data["StationDistance"] = round(computed_station_dist, 1)

                            # ── Detección de cierre de puertas (compartida con OCR y tracker) ─
                            doors_open_now = (door_l > 0.5) or (door_r > 0.5)
                            # Las puertas en TSC solo se abren/cierran con el tren parado.
                            # No se necesita filtro de velocidad — basta con detectar la transicion abierto->cerrado.
                            door_just_closed = ocr_door_was_open and not doors_open_now
                            ocr_door_was_open = doors_open_now
                            # Nombre OCR capturado en este frame al cerrar puertas (para override)
                            _ocr_name_on_close: str = ""

                            # ── OCR: captura del display de próxima parada ─────────────────────
                            # Trigger 1: cierre de puertas (TSC: puertas solo operables con tren parado)
                            # Trigger 2: polling cada 5-10s según la distancia actual
                            if ocr_hud.is_available() and not ocr_is_capturing:
                                ocr_interval = 30.0  # sin datos — esperar más
                                if ocr_last_result.get("distance_m") is not None:
                                    d = ocr_last_result["distance_m"]
                                    ocr_interval = 5.0 if d < 1000 else 10.0

                                if (door_just_closed or (now - ocr_last_capture_time) >= ocr_interval):
                                    ocr_last_capture_time = now
                                    ocr_is_capturing = True
                                    asyncio.create_task(run_ocr_capture(_station_tracker._odometer_m))

                            # Aplicar resultados del OCR si existen (pueden venir de capturas anteriores)
                            if ocr_last_result:
                                if ocr_last_result.get("station_name"):
                                    data["StationNameOCR"] = ocr_last_result["station_name"]
                                if ocr_last_result.get("eta"):
                                    data["StationETA"] = ocr_last_result["eta"]
                                if ocr_last_result.get("scheduled_time"):
                                    data["StationScheduled"] = ocr_last_result["scheduled_time"]
                            # ──────────────────────────────────────────────────────────────────

                            if data.get("RV"):
                                last_rv = str(data["RV"])
                                manager.scenario_manager.update_player_rv(last_rv)

                            # Tracker: actualizar status de paradas (ACTIVE/SUCCEEDED)
                            # Nota: se ejecuta aunque computed_station_dist sea -1 (sin perfil de ruta)
                            # para que SUCCEEDED/ACTIVE se actualicen siempre que el tracker avance.
                            if scenario_data:
                                tracker_idx = _station_tracker.next_stop_index
                                tracker_stops = [
                                    s for s in stops_for_tracker
                                    if s.get("type") != "WAYPOINT" and s.get("station_name")
                                    and s.get("station_name") != "Unknown"
                                ]
                                completed_names = {
                                    ts.get("station_name", "")
                                    for ts in tracker_stops[:tracker_idx]
                                }
                                active_name = (
                                    tracker_stops[tracker_idx].get("station_name", "")
                                    if tracker_idx < len(tracker_stops) else ""
                                )
                                for stop in scenario_data.get("stops", []):
                                    sname = stop.get("station_name", "")
                                    if sname in completed_names:
                                        stop["status"] = "SUCCEEDED"
                                    elif sname == active_name and stop.get("status") != "SUCCEEDED":
                                        stop["status"] = "ACTIVE"
                                        if computed_station_dist >= 0:
                                            stop["distance"] = round(computed_station_dist, 1)
                                # Cuando el tracker avanza de parada: invalidar anchor de distancia
                                # pero conservar nombres/ETA hasta que el OCR los sobreescriba.
                                if last_tracker_idx >= 0 and tracker_idx > last_tracker_idx:
                                    ocr_anchor_dist = -1.0
                                    ocr_anchor_odo = 0.0
                                    ocr_last_capture_time = 0.0  # Forzar captura inmediata del nuevo objetivo
                                last_tracker_idx = tracker_idx

                            # ── Override OCR al cerrar puertas ────────────────────────────────
                            # Cuando el OCR confirma el nombre de la siguiente parada en el
                            # momento exacto del cierre de puertas, forzar ese stop a ACTIVE
                            # y todos los anteriores a SUCCEEDED. Esto corrige el lag del
                            # tracker (que avanza solo cuando speed > 2 m/s) y garantiza
                            # que el Service Sheet refleje la parada correcta de inmediato.
                            if _ocr_name_on_close and scenario_data:
                                ocr_norm = _nn_name(_ocr_name_on_close)
                                stops_list = scenario_data.get("stops", [])
                                matched_idx = None
                                for i, st in enumerate(stops_list):
                                    if _nn_name(st.get("station_name", "")) == ocr_norm:
                                        matched_idx = i
                                        break
                                if matched_idx is not None:
                                    for i, st in enumerate(stops_list):
                                        if i < matched_idx and st.get("status") != "SUCCEEDED":
                                            st["status"] = "SUCCEEDED"
                                        elif i == matched_idx and st.get("status") != "SUCCEEDED":
                                            st["status"] = "ACTIVE"
                            # ─────────────────────────────────────────────────────────────────

                            if scenario_data:
                                manager.last_scenario_data = scenario_data

                            payload = {
                                "type": "TELEMETRY",
                                **data,
                                "timestamp": time.time(),
                            }

                            # Solo enviar el escenario completo si ha cambiado o ha pasado 1s
                            # Esto reduce el tráfico de red de ~50KB/frame a ~1KB/frame.
                            if scenario_data and (now - last_scenario_sent_time > 1.0):
                                payload["scenario"] = scenario_data
                                last_scenario_sent_time = now

                            sync_counter += 1
                            if sync_counter % 250 == 0:  # Cada 5 segundos aprox.
                                # Enviar un pequeño keep-alive si no hay telemetría activa
                                # (aunque aquí hay telemetría porque estamos dentro del loop mtime)
                                pass

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


# startup movido al asynccontextmanager lifespan (ver arriba)


@app.get("/scenarios/list")
async def list_scenarios():
    """Devuelve todos los escenarios. Usa el índice SQLite si existe, si no hace fallback al método clásico."""
    if not scenario_index.index_needs_rebuild():
        forced = manager.scenario_manager._forced_save_path
        forced_id = manager.scenario_manager._forced_scenario_id
        active = manager.scenario_manager.find_active_scenario()
        active_sp = active.get("save_path") if active else None
        return scenario_index.list_scenarios(
            active_save_path=active_sp,
            forced_save_path=forced,
            forced_scenario_id=forced_id,
        )
    return manager.scenario_manager.list_all_scenarios()


@app.get("/scenarios/index/stats")
async def get_index_stats():
    """Devuelve estadísticas del índice SQLite de escenarios."""
    return scenario_index.get_index_stats()


@app.post("/scenarios/reindex")
async def reindex_scenarios(request: Request):
    """
    Reconstruye el índice SQLite de escenarios usando serz.exe.
    Body opcional: { "route_filter": "<GUID>" } para indexar solo una ruta.
    Nota: la indexación de 350 escenarios puede tardar 2-3 minutos.
    """
    try:
        raw = await request.body()
        body: dict = json.loads(raw.decode("utf-8")) if raw else {}
    except Exception:
        body = {}
    route_filter = body.get("route_filter") or None
    loop = asyncio.get_running_loop()
    stats = await loop.run_in_executor(
        None,
        lambda: scenario_index.build_index(route_filter=route_filter),
    )
    return stats


@app.post("/scenarios/select")
async def select_scenario(request: Request):
    """
    Fija manualmente el escenario activo.
    - { "auto": true }              → vuelve a autodetección
    - { "scenario_id": "<GUID>" }   → selecciona por ID (soporta jugados y no jugados)
    - { "save_path": "..." }         → legacy: selecciona por ruta de CurrentSave.xml
    """
    try:
        raw = await request.body()
        body: dict = json.loads(raw.decode("utf-8")) if raw else {}
    except Exception as _exc:
        print(f"BODY PARSE ERROR: {_exc!r}")
        body = {}

    if body.get("auto"):
        manager.scenario_manager.clear_manual_scenario()
        return {"ok": True, "mode": "auto"}

    scenario_id = (body.get("scenario_id") or "").strip()
    if scenario_id:
        scenario_dir = scenario_index.get_scenario_dir(scenario_id)
        if not scenario_dir:
            return {"ok": False, "error": "Scenario not in index. Try POST /scenarios/reindex first."}
        manager.scenario_manager.select_by_id(scenario_id, scenario_dir)
        return {"ok": True, "mode": "manual_id", "scenario_id": scenario_id}

    # Legacy: save_path directo
    save_path = (body.get("save_path") or "").strip()
    if save_path:
        ok = manager.scenario_manager.select_manual_scenario(save_path)
        if not ok:
            return {"ok": False, "error": f"Path not found: {save_path}"}
        return {"ok": True, "mode": "manual", "save_path": save_path}

    return {"ok": False, "error": "Provide scenario_id, save_path, or auto=true"}



@app.get("/scenarios/live")
async def get_live_scenario():
    """Endpoint para que el frontend obtenga los datos del escenario detectado.
    Usa el scenario_data cacheado del loop de telemetría.
    Si aún no hay cache, parsea de disco."""
    cached = manager.last_scenario_data
    if cached:
        return cached
    return manager.scenario_manager.get_detailed_scenario_data()


@app.post("/api/tracker/reset")
async def reset_tracker():
    """Resetea el StationTracker y borra el estado persistido en disco.
    Usar al empezar una nueva sesión de juego o cuando el estado se desincroniza."""
    _station_tracker.reset()
    return {"ok": True, "message": "Tracker reseteado"}


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
