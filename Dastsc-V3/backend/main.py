from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import os
import time
import json
import traceback
from typing import List

# Estos se copiarán a continuación
from core.parser import parse_telemetry_line
from core.profiles import ProfileManager
# from physics.engine import PhysicsEngine

app = FastAPI(title="Nexus v3 Engine")
print(f"DEBUG: V3 ENGINE STARTING")
print(f"DEBUG: PATH: {os.path.abspath(__file__)}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rutas
GETDATA_PATH = r"C:\Program Files (x86)\Steam\steamapps\common\RailWorks\plugins\GetData.txt"
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
            os.path.normpath(os.path.join(os.getcwd(), "..", "..", "profiles"))
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
            "active_profile_id": self.current_profile.get("id") if self.current_profile else None,
            "isConnected": True,
            **self.last_payload
        }
        await websocket.send_json(initial_data)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        self.last_payload.update(message)
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

manager = TelemetryManager()

async def telemetry_reader():
    """Bucle principal de sondeo (mayor frecuencia para v3)."""
    last_mtime = 0
    sync_counter = 0
    while True:
        try:
            # Detectar ruta activa de telemetría
            active_path = GETDATA_PATH if os.path.exists(GETDATA_PATH) else ALT_PATH
            
            if os.path.exists(active_path):
                mtime = os.path.getmtime(active_path)
                if mtime != last_mtime:
                    last_mtime = mtime
                    with open(active_path, "r", encoding="utf-8") as f:
                        line = f.readline()
                        if line:
                            data = parse_telemetry_line(line)
                            
                            # La autodetección está desactivada en favor del sistema manual de v3
                            # Pero mantenemos la sincronización del perfil actual en cada tick
                            
                            payload = {
                                "type": "TELEMETRY", 
                                **data,
                                "active_profile": manager.current_profile,
                                "active_profile_id": manager.current_profile.get("id") if manager.current_profile else None,
                                "timestamp": time.time()
                            }

                            # Enviar lista de perfiles cada 5 segundos (10Hz * 50) para asegurar que la UI tenga los datos
                            sync_counter += 1
                            if sync_counter % 50 == 0:
                                payload["available_profiles"] = manager.profile_manager.get_all_profiles()

                            await manager.broadcast(payload)
            
            # Sondeo a 10Hz (0.1s) es suficiente para el interpolador SmoothEngine
            await asyncio.sleep(0.1)
        except Exception as e:
            print(f"Error en telemetry_reader: {e}")
            await asyncio.sleep(1)

@app.on_event("startup")
async def startup_event():
    print("--------------------------------------------------")
    print("   NEXUS V3 ENGINE - CORE UPDATED (JSON FIX)      ")
    print("--------------------------------------------------")
    asyncio.create_task(telemetry_reader())

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
                        perfil_nombre = manager.current_profile.get("name") if manager.current_profile else "None"
                        perfil_id = manager.current_profile.get("id") if manager.current_profile else "None"
                        print(f"DEBUG V3: Perfil activo cambiado a -> {perfil_nombre}")
                        
                        await manager.broadcast({
                            "type": "PROFILE_CHANGED",
                            "active_profile": manager.current_profile,
                            "active_profile_id": perfil_id
                        })
            except Exception as e:
                # Si el mensaje no es JSON válido, receive_json lanzará error
                print(f"Error procesando comando: {e}")
                import traceback
                traceback.print_exc()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
