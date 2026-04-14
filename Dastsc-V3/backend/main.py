from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import Any, List
import asyncio
import json
import math
import os
import time
import traceback

from core.parser import parse_telemetry_line
from core.profiles import ProfileManager
from core.scenarios import ScenarioManager
from core.station_tracker import StationTracker
import core.scenario_index as scenario_index

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
        for connection in self.active_connections:
            try:
                await connection.send_json(safe)
            except Exception:
                pass


manager = TelemetryManager()
_station_tracker = StationTracker()


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
                    if new_path != last_scenario_path or new_mtime != last_scenario_mtime or not scenario_data:
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
                            # Sobreescribir StationDistance del Lua (siempre -1) con el valor calculado
                            if computed_station_dist >= 0:
                                data["StationDistance"] = round(computed_station_dist, 1)

                            if data.get("RV"):
                                last_rv = str(data["RV"])
                                manager.scenario_manager.update_player_rv(last_rv)

                            # Actualizar posición mundial del tren desde getFarPosition
                            try:
                                far_xt = float(data.get("FarXT") or 0)
                                far_xo = float(data.get("FarXO") or 0)
                                far_zt = float(data.get("FarZT") or 0)
                                far_zo = float(data.get("FarZO") or 0)
                                # Solo actualizar si Lua emitió valores no-nulos
                                if far_xt != 0 or far_xo != 0:
                                    world_x = far_xt * 1024.0 + far_xo
                                    world_z = far_zt * 1024.0 + far_zo
                                    manager.scenario_manager.update_train_position(world_x, world_z)
                                else:
                                    # Fallback: getFarPosition no disponible en este plugin.
                                    # Inferir tile usando NX/NZ (tile-local 0-1024) y snap
                                    # a la entidad de mapa más cercana de la ruta activa.
                                    nx = float(data.get("NX") or 0)
                                    nz = float(data.get("NZ") or 0)
                                    if nx != 0 or nz != 0:
                                        manager.scenario_manager.update_train_position_near(nx, nz)
                            except (TypeError, ValueError):
                                pass

                            # Refrescar distancias cada frame (sin I/O: solo matemáticas)
                            if scenario_data:
                                manager.scenario_manager.refresh_distances(
                                    scenario_data.get("stops", [])
                                )

                            payload = {
                                "type": "TELEMETRY",
                                **data,
                                "active_profile": manager.current_profile,
                                "active_profile_id": manager.current_profile.get("id")
                                if manager.current_profile
                                else None,
                                "scenario": scenario_data,
                                "timestamp": time.time(),
                            }

                            sync_counter += 1
                            if sync_counter % 250 == 0:  # Cada 5 segundos aprox.
                                payload["available_profiles"] = (
                                    manager.profile_manager.get_all_profiles()
                                )

                            await manager.broadcast(payload)

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
    """Endpoint para que el frontend obtenga los datos del escenario detectado."""
    return manager.scenario_manager.get_detailed_scenario_data()


@app.get("/debug/pos")
async def debug_position():
    """Diagnóstico en vivo: posición actual del tren y distancias a cada parada."""
    sm = manager.scenario_manager
    stops_cache = sm._stop_entity_cache
    cache_distances = []
    for ex, ez in stops_cache:
        d = sm._distance_to_entity(ex, ez)
        cache_distances.append(round(d, 1) if d >= 0 else None)
    return {
        "train_x": round(sm._last_train_x, 2) if sm._last_train_x is not None else None,
        "train_z": round(sm._last_train_z, 2) if sm._last_train_z is not None else None,
        "cached_route_id": sm._cached_route_id,
        "stop_entity_cache_len": len(stops_cache),
        "distances_m": cache_distances,
        "forced_scenario_id": sm._forced_scenario_id,
    }


@app.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Usar receive_json() de FastAPI para evitar dependencias directas de 'json' en este punto
            try:
                cmd = await websocket.receive_json()
                if cmd.get("type") == "SELECT_PROFILE":
                    profile_id = cmd.get("profile_id")
                    print(f"DEBUG V3: Solicitud de perfil -> {profile_id}")
                    if manager.profile_manager.select_manual_profile(profile_id):
                        manager.current_profile = manager.profile_manager.manual_profile
                        perfil_nombre = (
                            manager.current_profile.get("name")
                            if manager.current_profile
                            else "None"
                        )
                        perfil_id = (
                            manager.current_profile.get("id")
                            if manager.current_profile
                            else "None"
                        )
                        print(f"DEBUG V3: Perfil activo cambiado a -> {perfil_nombre}")

                        await manager.broadcast(
                            {
                                "type": "PROFILE_CHANGED",
                                "active_profile": manager.current_profile,
                                "active_profile_id": perfil_id,
                            }
                        )
            except Exception as e:
                # Si el mensaje no es JSON válido, receive_json lanzará error
                print(f"Error procesando comando: {e}")
                traceback.print_exc()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
