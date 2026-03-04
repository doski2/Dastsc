from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import os
import time
import glob
import json
from typing import List
from core.parser import parse_telemetry_line
from core.profiles import ProfileManager
from core.scenarios import ScenarioManager
from physics.engine import PhysicsEngine

app = FastAPI(title="Dastsc V2 Backend")

# Solución definitiva para 403 Forbidden en WebSockets:
# FastAPI/Starlette bloquean WebSockets si el header 'Origin' no coincide con el host.
# Usamos un middleware manual para saltar esta verificación.

@app.middleware("http")
async def add_cors_header(request, call_next):
    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ... resto del código ...

@app.get("/debug")
async def get_debug():
    perfil = manager.current_profile
    return {
        "profiles_loaded": len(manager.profile_manager.profiles),
        "profiles_path": manager.profiles_path,
        "current_profile": perfil.get("name") if perfil else "None",
        "active_connections": len(manager.active_connections)
    }

@app.get("/scenarios")
async def get_scenarios_list():
    """Obtiene la lista de los escenarios disponibles en RailWorks."""
    print("DEBUG: Solicitud recibida en /scenarios")
    try:
        data = manager.scenario_manager.get_available_scenarios()
        print(f"DEBUG: Enviando {len(data)} escenarios")
        return data
    except Exception as e:
        print(f"ERROR en /scenarios: {e}")
        return []

@app.get("/scenarios/stops")
async def api_get_scenario_stops(path: str):
    """Obtiene las paradas de un escenario específico."""
    return manager.scenario_manager.get_scenario_stops(path)

@app.get("/scenarios/detect")
async def detect_scenario(rv: str):
    """Detecta el escenario activo basándose en el número del tren (RV)."""
    return manager.scenario_manager.find_active_scenario_by_rv(rv)

@app.get("/scenarios/live")
async def get_live_timetable(route_id: str, scenario_path: str, x: float, z: float):
    """Obtiene el horario enriquecido con distancias calculadas."""
    return manager.scenario_manager.get_full_live_timetable(
        route_id, 
        scenario_path, 
        {"x": x, "z": z}
    )

# Configuración de rutas (Detección dinámica)
GETDATA_PATH = r"C:\Program Files (x86)\Steam\steamapps\common\RailWorks\plugins\GetData.txt"
ALT_PATH = r"C:\Program Files (x86)\Steam\steamapps\common\RailWorks\GetData.txt"
# Ruta absoluta corregida para los perfiles
PROFILES_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "profiles"))
print(f"DEBUG: Buscando perfiles en: {PROFILES_PATH}")

class TelemetryManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.last_data = {}
        
        # Estrategia de búsqueda de perfiles más agresiva
        posibles_rutas = [
            r"C:\Users\doski\Dastsc\profiles",
            os.path.normpath(os.path.join(os.getcwd(), "profiles")),
            os.path.normpath(os.path.join(os.getcwd(), "..", "profiles")),
            os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "profiles"))
        ]
        
        self.profiles_path = posibles_rutas[0]
        for ruta in posibles_rutas:
            if os.path.exists(ruta) and glob.glob(os.path.join(ruta, "*.json")):
                self.profiles_path = ruta
                break
                
        print(f"DEBUG: NEXUS CORE seleccionó ruta: {self.profiles_path}")
        self.profile_manager = ProfileManager(self.profiles_path)
        self.scenario_manager = ScenarioManager()
        self.current_profile = None
        self.last_payload = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        
        # LOG de depuración masiva
        profiles = self.profile_manager.get_all_profiles()
        folder_exists = os.path.exists(self.profiles_path)
        
        print("--- NUEVA CONEXIÓN ---")
        print(f"Carpeta perfiles: {self.profiles_path} (Existe: {folder_exists})")
        print(f"Perfiles cargados en memoria: {len(self.profile_manager.profiles)}")
        
        initial_data = {
            "type": "INIT",
            "profiles": profiles,
            "available_profiles": profiles,
            "active_profile": self.current_profile,
            "isConnected": True,
            "debug_path": self.profiles_path,
            "debug_count": len(profiles),
            **self.last_payload
        }
        print(f"DEBUG: Enviando {len(profiles)} perfiles al cliente bajo campos 'profiles' y 'available_profiles'")
        await websocket.send_json(initial_data)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        self.last_payload.update(message) # Mantener track del estado global
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

manager = TelemetryManager()

async def telemetry_reader():
    """Bucle principal de lectura de telemetría (5Hz)."""
    last_mtime = 0
    prev_speed = 0.0
    last_processed_time = time.time()
    sync_counter = 0
    
    while True:
        try:
            # Determinamos cuál es la ruta activa
            active_path = GETDATA_PATH if os.path.exists(GETDATA_PATH) else ALT_PATH
            
            if os.path.exists(active_path):
                current_mtime = os.path.getmtime(active_path)
                if current_mtime != last_mtime:
                    with open(active_path, "r", encoding="utf-8") as f:
                        line = f.readline()
                        if line:
                            data = parse_telemetry_line(line)
                            manager.last_data = data # Guardar para detección manual posterior
                            
                            # Detección de Perfil desactivada por petición: Solo manual
                            # profile = manager.profile_manager.detect_profile(data)
                            # if profile:
                            #     manager.current_profile = profile
                            
                            current_time = time.time()
                            dt = current_time - last_processed_time
                            speed = float(data.get("Speed", 0))
                            curvature = float(data.get("CurvatureActual", 0))
                            physics = PhysicsEngine.calculate_g_forces(speed, curvature, prev_speed, dt)
                            
                            payload = {
                                "type": "TELEMETRY",
                                **data, 
                                **physics, 
                                "RVNumber": data.get("RVNumber") or data.get("RV"),
                                "RouteID": data.get("RouteID"),
                                "ScenarioPath": data.get("ScenarioPath"),
                                "X": data.get("X"),
                                "Z": data.get("Z"),
                                "timestamp": current_time, 
                                "source": "simulator",
                                "active_profile": manager.current_profile,
                                "active_profile_id": manager.current_profile.get("id") if manager.current_profile else None
                            }
                            
                            # Limpiar valores no serializables como Infinity o NaN para evitar errores en JavaScript
                            def clean_json(obj):
                                if isinstance(obj, dict):
                                    return {str(k): clean_json(v) for k, v in obj.items()}
                                elif isinstance(obj, list):
                                    return [clean_json(x) for x in obj]
                                elif isinstance(obj, float):
                                    if obj == float('inf') or obj == float('-inf') or obj != obj:
                                        return 0.0
                                return obj

                            clean_payload = clean_json(payload)

                            # Enviar la lista de perfiles periódicamente para asegurar sincronización
                            sync_counter += 1
                            if sync_counter % 25 == 0: # Cada 5 segundos aprox (5Hz * 25)
                                if isinstance(clean_payload, dict):
                                    # Forzar una nueva copia para evitar errores de tipo en el broadcast
                                    profiles_list = manager.profile_manager.get_all_profiles()
                                    clean_payload = {**clean_payload, "available_profiles": profiles_list}
                            
                            if isinstance(clean_payload, dict):
                                await manager.broadcast(clean_payload)
                            
                            prev_speed = speed
                            last_processed_time = current_time
                            last_mtime = current_mtime
        except Exception as e:
            print(f"Error reading telemetry: {e}")
        
        await asyncio.sleep(0.2)

@app.on_event("startup")
async def startup_event():
    # Iniciar el lector de telemetría en segundo plano
    print("DEBUG: Iniciando bucle de telemetría...")
    asyncio.create_task(telemetry_reader())

@app.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    # Forzar la aceptación de la conexión ignorando el origen (Fix 403 Forbidden)
    print("DEBUG: Intento de conexión WebSocket recibido...")
    try:
        # Importante: manager.connect ya llama a await websocket.accept()
        await manager.connect(websocket)
        print("DEBUG: WebSocket aceptado y sincronizado con INIT")
        
        while True:
            try:
                # Usar receive_text para evitar fallos si el mensaje no es JSON válido
                data = await websocket.receive_text()
                try:
                    cmd = json.loads(data)
                except json.JSONDecodeError:
                    print(f"DEBUG: Mensaje no JSON recibido: {data}")
                    continue

                print(f"DEBUG: Comando recibido -> {cmd}")
                
                if cmd.get("type") in ["SELECT_PROFILE", "SET_PROFILE"]:
                    profile_id = cmd.get("profile_id") or cmd.get("profile")
                    print(f"DEBUG: Frontend solicitó perfil ID -> [{profile_id}]")
                    
                    if manager.profile_manager.select_manual_profile(profile_id):
                        manager.current_profile = manager.profile_manager.manual_profile
                        perfil_nombre = manager.current_profile.get("name") if manager.current_profile else "None"
                        perfil_id = manager.current_profile.get("id") if manager.current_profile else "None"
                        print(f"DEBUG: ÉXITO. Perfil activado: {perfil_nombre} (ID: {perfil_id})")
                        
                        # Forzar broadcast inmediato del cambio
                        await manager.broadcast({
                            "type": "PROFILE_CHANGED",
                            "active_profile": manager.current_profile,
                            "active_profile_id": perfil_id,
                            "timestamp": time.time()
                        })
                    else:
                        print(f"DEBUG: FALLO. El ID [{profile_id}] no existe.")
            except WebSocketDisconnect:
                print("DEBUG: WebSocket desconectado por el cliente")
                if websocket in manager.active_connections:
                    manager.active_connections.remove(websocket)
                break
            except Exception as e:
                print(f"DEBUG: Error procesando comando: {e}")
                # No romper el bucle para permitir intentos posteriores
    except Exception as e:
        print(f"DEBUG: Error crítico en WebSocket: {e}")
        if websocket in manager.active_connections:
            manager.active_connections.remove(websocket)

if __name__ == "__main__":
    import uvicorn
    # Aumentamos el log_level y configuramos uvicorn correctamente
    print("DEBUG: Arrancando Servidor NEXUS en puerto 8000...")
    uvicorn.run(app, host="0.0.0.0", port=8000, ws_ping_interval=20, ws_ping_timeout=20, log_level="debug")
