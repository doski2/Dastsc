@echo off
set UNPACKED_PATH=dist\win-unpacked\resources
set APP_PATH=%UNPACKED_PATH%\app

echo --- Iniciando Sincronizacion de Dastsc Nexus ---

echo 1. Cerrando procesos de Dastsc y Node...
taskkill /F /IM "Dastsc Nexus DMI.exe" /T 2>nul
taskkill /F /IM "electron.exe" /T 2>nul
taskkill /F /IM node.exe /T 2>nul

echo 2. Construyendo Interfaz (Vite)...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Fallo la construccion de la UI.
    pause
    exit /b %ERRORLEVEL%
)

echo 3. Sincronizando archivos con el binario...
if not exist "dist\win-unpacked" (
    echo [!] Folder dist\win-unpacked no existe. Creando binarios...
    call npm run electron:build
)

if not exist "%APP_PATH%" mkdir "%APP_PATH%"
if not exist "%APP_PATH%\dist" mkdir "%APP_PATH%\dist"
if not exist "%APP_PATH%\backend" mkdir "%APP_PATH%\backend"

echo [+] Copiando dist a %APP_PATH%\dist
xcopy /S /E /Y /Q dist\assets "%APP_PATH%\dist\assets"
copy /Y dist\index.html "%APP_PATH%\dist\index.html"
echo [+] Copiando backend a %APP_PATH%\backend
xcopy /S /E /Y /Q backend "%APP_PATH%\backend"
echo [+] Copiando main.cjs y package.json
copy /Y main.cjs "%APP_PATH%\main.cjs"
copy /Y package.json "%APP_PATH%\package.json"

echo --- Sincronizacion Completada ---
if exist "%APP_DIR%\dist\win-unpacked\Dastsc Nexus DMI.exe" (
    echo El binario en "dist\win-unpacked" esta actualizado.
) else (
    echo [!] No se encontro el ejecutable nativo, se usara el lanzador de emergencia.
)
