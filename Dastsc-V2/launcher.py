import webview
import subprocess
import threading
import time
import os
import sys

# Configuración de rutas
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

def start_backend():
    """Inicia el servidor FastAPI de forma separada."""
    print("Iniciando Backend...")
    # Usamos el python del venv si existe
    venv_python = os.path.join(BACKEND_DIR, ".venv", "Scripts", "python.exe")
    if not os.path.exists(venv_python):
        venv_python = sys.executable

    subprocess.Popen(
        [venv_python, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=BACKEND_DIR
    )

def start_frontend_dev():
    """Inicia el servidor de desarrollo de Vite (opcional)."""
    print("Iniciando Frontend Dev Server...")
    subprocess.Popen(
        ["npm.cmd", "run", "dev"],
        cwd=FRONTEND_DIR,
        shell=True
    )

def main():
    # 1. Iniciamos el backend
    backend_thread = threading.Thread(target=start_backend, daemon=True)
    backend_thread.start()

    # 2. Iniciamos el frontend (esto asume que el usuario tiene Node instalado)
    # Lo iniciamos solo si queremos que sea automático
    start_frontend_dev()

    # 3. Esperamos un poco a que Vite arranque (normalmente tarda 1-2s)
    print("Esperando a que los servicios estén listos...")
    time.sleep(3)

    # 4. Creamos la ventana de PyWebView
    print("Abriendo panel de telemetría...")
    webview.create_window(
        'DASTSC V2 - Professional Telemetry HUD',
        'http://localhost:5173', # URL por defecto de Vite
        width=1200,
        height=800,
        on_top=True, # Siempre encima como pedía la Fase 5
        resizable=True
    )
    
    webview.start()

if __name__ == "__main__":
    main()
