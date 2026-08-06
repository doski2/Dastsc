@echo off
title Nexus - Asistente de Perfil de Tren
set WORKSPACE_ROOT=%~dp0
set VENV_PYTHON=%WORKSPACE_ROOT%.venv\Scripts\python.exe

echo ====================================================
echo    NEXUS - ASISTENTE DE PERFIL DE TREN
echo ====================================================
echo.
echo Requisitos: TSC abierto en cabina para capturar mandos.
echo.

if exist "%VENV_PYTHON%" (
    "%VENV_PYTHON%" "%WORKSPACE_ROOT%nexus-profile-wizard.py"
) else (
    python "%WORKSPACE_ROOT%nexus-profile-wizard.py"
)

if errorlevel 1 (
    echo.
    echo Error al iniciar el asistente.
    pause
)
