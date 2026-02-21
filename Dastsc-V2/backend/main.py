from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import os
import time
import json
import glob
from typing import List
from core.parser import parse_telemetry_line
from core.profiles import ProfileManager
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
            os.path.normpath(os.path.join(os.getcwd(), "profiles")),
            os.path.normpath(os.path.join(os.getcwd(), "..", "profiles")),
            r"C:\Users\doski\Dastsc\profiles"
        ]
        
        self.profiles_path = posibles_rutas[0]
        for ruta in posibles_rutas:
            if os.path.exists(ruta) and glob.glob(os.path.join(ruta, "*.json")):
                self.profiles_path = ruta
                break
                
        print(f"DEBUG: NEXUS CORE seleccionó ruta: {self.profiles_path}")
        self.profile_manager = ProfileManager(self.profiles_path)
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
                            
                            # Detección de Perfil automática
                            profile = manager.profile_manager.detect_profile(data)
                            if profile:
                                manager.current_profile = profile
                            
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
                                "active_profile": manager.current_profile
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

@app.get("/debug")
async def get_debug():
    return {
        "profiles_loaded": len(manager.profile_manager.profiles),
        "profiles_path": PROFILES_PATH,
        "current_profile": manager.current_profile["name"] if manager.current_profile else "None",
        "active_connections": len(manager.active_connections)
    }

@app.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Recibir comandos del frontend
            message = await websocket.receive_text()
            try:
                cmd = json.loads(message)
                if cmd.get("type") == "SELECT_PROFILE":
                    profile_id = cmd.get("profile_id")
                    if manager.profile_manager.select_manual_profile(profile_id):
                        if profile_id == "AUTO":
                            manager.current_profile = manager.profile_manager.detect_profile(manager.last_data)
                        else:
                            manager.current_profile = manager.profile_manager.manual_profile
                        
                        # Notificar el cambio inmediatamente
                        await manager.broadcast({
                            "type": "PROFILE_CHANGED",
                            "active_profile": manager.current_profile,
                            "available_profiles": manager.profile_manager.get_all_profiles() # Re-enviar para asegurar
                        })
            except Exception:
                pass 
    except WebSocketDisconnect:
        manager.disconnect(websocket)
