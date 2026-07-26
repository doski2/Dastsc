@echo off
title Nexus v4 Runner
set WORKSPACE_ROOT=%~dp0
set VENV_PATH=%WORKSPACE_ROOT%.venv\Scripts\python.exe
set BACKEND_DIR=%WORKSPACE_ROOT%Dastsc-V3\backend

echo ====================================================
echo    NEXUS V4 - AGENTE + TELEMETRIA (KERNEL / AGENT)
echo ====================================================
echo.

echo [0/3] Limpiando procesos en puertos 8000 y 5175...
taskkill /F /IM python.exe /T 2>nul
taskkill /F /IM uvicorn.exe /T 2>nul
powershell -Command "$ports = 8000,5175; foreach($port in $ports) { $p = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue; if($p) { Stop-Process -Id ($p.OwningProcess | Select-Object -First 1) -Force -ErrorAction SilentlyContinue } }"
echo [OK] Limpieza completada.

echo [1/3] Iniciando Backend de Telemetria (puerto 8000)...
start "V4_BACKEND" /min cmd /k "cd /d %BACKEND_DIR% && %VENV_PATH% main.py"

echo [2/3] Iniciando Frontend Nexus V4 (puerto 5175)...
start "NEXUS_V4_FRONTEND" cmd /k "cd /d %WORKSPACE_ROOT% && npm run dev:v4"

echo.
echo [3/3] Abriendo navegador...
timeout /t 5 /nobreak > nul
start "" "http://localhost:5175"

echo.
echo ----------------------------------------------------
echo SISTEMA INICIADO:
echo Frontend V4: http://localhost:5175
echo Backend:     http://localhost:8000/docs
echo WebSocket:   ws://localhost:8000/ws/telemetry
echo ----------------------------------------------------
echo.
echo Presiona cualquier tecla para cerrar esta ventana...
pause > nul
