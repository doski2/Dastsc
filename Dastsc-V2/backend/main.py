from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import os
import time
from typing import List
from core.parser import parse_telemetry_line
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

class TelemetryManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.last_data = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
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
                            current_time = time.time()
                            dt = current_time - last_processed_time
                            speed = float(data.get("Speed", 0))
                            curvature = float(data.get("CurvatureActual", 0))
                            physics = PhysicsEngine.calculate_g_forces(speed, curvature, prev_speed, dt)
                            payload = {**data, **physics, "timestamp": current_time, "source": "simulator"}
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

@app.get("/")
async def get_status():
    return {"status": "online", "simulator_path": GETDATA_PATH}

@app.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Mantener la conexión abierta
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
