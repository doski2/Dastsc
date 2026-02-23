@echo off
title Nexus v3 Runner
set WORKSPACE_ROOT=%~dp0
set VENV_PATH=%WORKSPACE_ROOT%.venv\Scripts\python.exe
set BACKEND_DIR=%WORKSPACE_ROOT%Dastsc-V3\backend
set FRONTEND_DIR=%WORKSPACE_ROOT%Dastsc-V3

echo ====================================================
echo    NEXUS V3 - SISTEMA DE CONTROL DE TELEMETRIA
echo ====================================================
echo.

echo [1/2] Iniciando Backend (FastAPI + Websockets)...
start "NEXUS_V3_BACKEND" cmd /k "cd /d %BACKEND_DIR% && %VENV_PATH% main.py"

echo [2/2] Iniciando Frontend (Vite + React 19)...
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
