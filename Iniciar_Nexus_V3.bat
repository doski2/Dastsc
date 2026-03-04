@echo off
title Nexus v3 Runner
set WORKSPACE_ROOT=%~dp0
set VENV_PATH=%WORKSPACE_ROOT%.venv\Scripts\python.exe
set BACKEND_DIR=%WORKSPACE_ROOT%Dastsc-V2\backend
set FRONTEND_DIR=%WORKSPACE_ROOT%Dastsc-V3

echo ====================================================
echo    NEXUS V3 - SISTEMA DE CONTROL DE TELEMETRIA
echo ====================================================
echo.

echo [0/2] Limpiando procesos antiguos en puerto 8000...
taskkill /F /IM python.exe /T 2>nul
taskkill /F /IM uvicorn.exe /T 2>nul
powershell -Command "$p = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue; if($p) { Stop-Process -Id ($p.OwningProcess | Select-Object -First 1) -Force -ErrorAction SilentlyContinue }"
echo [✓] Limpieza completada.

echo [1/2] Iniciando Backend de Telemetria (V2 Core)...
start "V3_BACKEND" /min cmd /k "cd /d %BACKEND_DIR% && %VENV_PATH% main.py"

echo [2/2] Iniciando Frontend de Usuario (V3 UI)...
start "NEXUS_V3_FRONTEND" cmd /k "cd /d %FRONTEND_DIR% && npm run dev"

echo.
echo ----------------------------------------------------
echo SISTEMA INICIADO:
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:8000/docs
echo ----------------------------------------------------
echo.
echo Presiona cualquier tecla para cerrar esta ventana...
pause > nul
