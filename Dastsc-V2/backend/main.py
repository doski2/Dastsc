from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import os
import time
import glob
from typing import List
from core.parser import parse_telemetry_line
from core.profiles import ProfileManager
from core.scenarios import ScenarioManager
from physics.engine import PhysicsEngine

app = FastAPI(title="Dastsc V2 Backend")

# Habilitar CORS para el frontend de React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
            "available_profiles": profiles,
            "active_profile": self.current_profile,
            "isConnected": True,
            "debug_path": self.profiles_path,
            "debug_count": len(profiles),
            **self.last_payload
        }
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
                                "timestamp": current_time, 
                                "source": "simulator",
                                "active_profile": manager.current_profile,
                                "active_profile_id": manager.current_profile.get("id") if manager.current_profile else None
                            }
                            # Enviar la lista de perfiles periódicamente para asegurar sincronización
                            sync_counter += 1
                            if sync_counter % 25 == 0: # Cada 5 segundos aprox (5Hz * 25)
                                payload["available_profiles"] = manager.profile_manager.get_all_profiles()
                                
                            await manager.broadcast(payload)
                            prev_speed = speed
                            last_processed_time = current_time
                            last_mtime = current_mtime
        except Exception as e:
            print(f"Error reading telemetry: {e}")
        
        await asyncio.sleep(0.2)

@app.on_event("startup")
async def startup_event():
    # Iniciar el lector de telemetría en segundo plano
    asyncio.create_task(telemetry_reader())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

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
async def get_scenarios():
    """Obtiene la lista de los escenarios disponibles en RailWorks."""
    return manager.scenario_manager.get_available_scenarios()

@app.get("/scenarios/stops")
async def get_scenario_stops(path: str):
    """Obtiene las paradas de un escenario específico."""
    return manager.scenario_manager.get_scenario_stops(path)

@app.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Recibir comandos del frontend usando receive_json para mayor seguridad
            try:
                cmd = await websocket.receive_json()
                print(f"DEBUG: Comando recibido -> {cmd}")
                
                if cmd.get("type") == "SELECT_PROFILE" or cmd.get("type") == "SET_PROFILE":
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
                            "active_profile_id": perfil_id
                        })
                    else:
                        print(f"DEBUG: FALLO. El ID [{profile_id}] no existe en los {len(manager.profile_manager.profiles)} perfiles cargados.")
                        # Registrar IDs disponibles para depuración
                        ids_disponibles = [p['id'] for p in manager.profile_manager.profiles[:5]]
                        print(f"DEBUG: IDs ejemplo: {ids_disponibles}...")
            except Exception as e:
                print(f"DEBUG: Error procesando comando: {e}") 
    except WebSocketDisconnect:
        manager.disconnect(websocket)
