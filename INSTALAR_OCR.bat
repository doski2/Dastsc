@echo off
title Instalar dependencias OCR - Nexus V3
color 0B
echo ================================================
echo   NEXUS V3 - Instalacion OCR (mss + tesseract)
echo ================================================
echo.

set VENV_PIP=%~dp0.venv\Scripts\pip.exe

:: 1. Instalar paquetes Python
echo [1/3] Instalando paquetes Python (mss, pytesseract, Pillow)...
"%VENV_PIP%" install mss pytesseract Pillow
if errorlevel 1 (
    echo [!] Error instalando paquetes Python.
    pause
    exit /b 1
)
echo [OK] Paquetes Python instalados.
echo.

:: 2. Verificar si Tesseract ya esta instalado
set TESS_PATH=C:\Program Files\Tesseract-OCR\tesseract.exe
if exist "%TESS_PATH%" (
    echo [OK] Tesseract ya instalado en: %TESS_PATH%
    goto verify
)

:: 3. Descargar e instalar Tesseract
echo [2/3] Tesseract no encontrado. Descargando instalador...
echo      (Repositorio oficial: https://github.com/UB-Mannheim/tesseract/wiki)
echo.

set TESS_INSTALLER=%TEMP%\tesseract-installer.exe
set TESS_URL=https://digi.bib.uni-mannheim.de/tesseract/tesseract-ocr-w64-setup-5.5.0.20241111.exe

powershell -Command "Invoke-WebRequest -Uri '%TESS_URL%' -OutFile '%TESS_INSTALLER%'"
if errorlevel 1 (
    echo [!] No se pudo descargar Tesseract automaticamente.
    echo     Por favor descargalo manualmente desde:
    echo     https://github.com/UB-Mannheim/tesseract/wiki
    echo     e instalalo en: C:\Program Files\Tesseract-OCR\
    pause
    exit /b 1
)

echo [2/3] Instalando Tesseract (acepta la instalacion cuando aparezca)...
"%TESS_INSTALLER%" /S
timeout /t 5 /nobreak > nul

:verify
:: 4. Verificar instalacion completa
echo [3/3] Verificando instalacion...

if not exist "%TESS_PATH%" (
    echo [!] Tesseract no encontrado en %TESS_PATH%
    echo     Asegurate de instalarlo en la ruta predeterminada.
    pause
    exit /b 1
)

"%~dp0.venv\Scripts\python.exe" -c "import mss, pytesseract, PIL; print('[OK] Todas las dependencias OCR disponibles')"
if errorlevel 1 (
    echo [!] Alguna dependencia Python no se instalo correctamente.
    pause
    exit /b 1
)

echo.
echo ================================================
echo   OCR listo. Reinicia el backend para activarlo.
echo ================================================
echo.
pause
