@echo off
setlocal
title DASTSC V3 - Manual Test Runner

echo.
echo ==========================================
echo    DASTSC V3 - EJECUTOR DE TESTS
echo ==========================================
echo.

cd /d "%~dp0"

echo [1/2] Verificando dependencias...
if not exist "node_modules\tsx" (
    echo [!] tsx no encontrado. Instalando temporalmente...
    call npm install tsx --no-save
)

echo [2/2] Ejecutando Bateria Completa de Tests de Integracion (Core, Lua, Fisica)...
echo.

set TSX_CMD=npx tsx src/v3/core/manual_tests.ts

call %TSX_CMD%

echo.
echo ==========================================
echo    PRUEBAS FINALIZADAS
echo ==========================================
echo.
pause
