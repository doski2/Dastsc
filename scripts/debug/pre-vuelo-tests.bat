@echo off
REM Ejecutar tests rapidos antes de sesion TSC
cd /d "%~dp0.."
echo === Nexus Kernel ===
call npm run test -w @nexus/kernel
if errorlevel 1 exit /b 1
echo === Nexus Agent ===
call npm run test -w @nexus/agent
if errorlevel 1 exit /b 1
echo === Backend ===
cd Dastsc-V3\backend
python -m pytest tests/test_command_bus.py tests/test_profiles_nexus.py tests/test_profile_auto.py -q
exit /b %errorlevel%
