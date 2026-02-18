@echo off
title DASTSC V2 - Invocador de Telemetria Profesional
color 0B
echo ====================================================
echo    INICIANDO DASTSC V2 (ELECTRON + FASTAPI)
echo    Design Motor: Nexus v3.1 (Telefarming Engine)
echo ====================================================
echo.

set BASE_DIR=%~dp0
set APP_DIR=%BASE_DIR%Dastsc-V2
set BACKEND_DIR=%BASE_DIR%Dastsc-V2\backend
set PYTHON_EXE=%BASE_DIR%.venv\Scripts\python.exe

:: 1. Verificar entorno Python
if not exist "%PYTHON_EXE%" (
    echo [!] No se encuentra el entorno virtual de Python en %PYTHON_EXE%
    echo [!] Por favor, crea el venv antes de continuar.
    pause
    exit
)

:: 2. Instalar dependencias si faltan
if not exist "%APP_DIR%\node_modules" (
    echo [!] Detectada primera ejecucion. Instalando dependencias del motor...
    cd /d "%APP_DIR%"
    call npm install
)

:: 3. Lanzar Backend en una nueva ventana
echo [+] Iniciando Servidor de Telemetria (FastAPI)...
start /min "DASTSC V2 Backend" cmd /k "cd /d %BACKEND_DIR% && %PYTHON_EXE% -m uvicorn main:app --reload --port 8000"

:: 4. Autoactualizar y Lanzar (Nexus DMI nativo o emergencia)
echo [+] Sincronizando Interfaz (Por favor, espera unos segundos)...
cd /d "%APP_DIR%"
call npm run sync:dist

echo [+] Arrancando Interfaz de Usuario...
set EXE_PATH=%APP_DIR%\dist\win-unpacked\Dastsc Nexus DMI.exe

if not exist "%EXE_PATH%" goto :LanzarBridge

echo [+] Lanzando ejecutable optimizado...
pushd "%APP_DIR%\dist\win-unpacked"
start "" "Dastsc Nexus DMI.exe"
popd
goto :Fin

:LanzarBridge
echo [!] Ejecutable nativo no encontrado.
echo [!] Iniciando modo BRIDGE (Desarrollo)...
cd /d "%APP_DIR%"
start /min "DASTSC UI BRIDGE" cmd /c "npm run electron"

:Fin
echo.
echo [✓] Todo listo. El Dashboard deberia aparecer en breve.
timeout /t 5
exit
