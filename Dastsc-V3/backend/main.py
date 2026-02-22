from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import os
import time
from typing import List

# These will be copied next
from core.parser import parse_telemetry_line
from core.profiles import ProfileManager
# from physics.engine import PhysicsEngine

app = FastAPI(title="Nexus v3 Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths
GETDATA_PATH = r"C:\Program Files (x86)\Steam\steamapps\common\RailWorks\plugins\GetData.txt"
PROFILES_PATH = r"c:\Users\doski\Dastsc\profiles"

class TelemetryManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.profile_manager = ProfileManager(PROFILES_PATH)
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
    """Main polling loop (Higher frequency for v3)."""
    last_mtime = 0
    while True:
        try:
            if os.path.exists(GETDATA_PATH):
                mtime = os.path.getmtime(GETDATA_PATH)
                if mtime != last_mtime:
                    last_mtime = mtime
                    with open(GETDATA_PATH, "r") as f:
                        line = f.readline()
                        if line:
                            data = parse_telemetry_line(line)
                            
                            # Profile auto-detection logic
                            loco_name = data.get("LocoName", "")
                            if loco_name and (not manager.current_profile or manager.current_profile['name'] != loco_name):
                                profile = manager.profile_manager.get_profile_for_loco(loco_name)
                                manager.current_profile = profile
                                await manager.broadcast({"type": "PROFILE_CHANGE", "active_profile": profile})
                            
                            await manager.broadcast({
                                "type": "DATA",
                                "data": data,
                                "timestamp": time.time()
                            })
            
            # Polling at 20Hz instead of 5Hz to catch all file updates
            await asyncio.sleep(0.05)
        except Exception as e:
            print(f"Error in telemetry_reader: {e}")
            await asyncio.sleep(1)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(telemetry_reader())

@app.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            _data = await websocket.receive_text()
            # Handle incoming commands (SendCommand.txt logic)
    except WebSocketDisconnect:
        manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
