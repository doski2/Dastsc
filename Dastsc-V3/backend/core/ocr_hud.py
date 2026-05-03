"""
ocr_hud.py — Captura OCR del display de próxima parada del juego (TS Classic).

El juego renderiza la información de la siguiente estación (nombre, distancia real
de vía, hora programada, ETA) en el HUD inferior izquierdo. Esta información es
imposible de obtener via el plugin Lua en contexto global, pero el motor del juego
ya la calcula. OCR sobre esa región es la fuente más precisa disponible.

Dependencias (instalar con install_ocr_deps.bat):
  pip install mss pytesseract pillow
  + Tesseract binary (https://github.com/UB-Mannheim/tesseract/wiki)

La región de captura está calibrada para 2560×1440 (ajustar OCR_REGION si cambia).
"""

from __future__ import annotations

import re
import os
from typing import Optional, Dict

# ── Comprobación de dependencias opcionales ───────────────────────────────────
try:
    import mss as _mss
    MSS_OK = True
except ImportError:
    MSS_OK = False

try:
    import pytesseract
    from PIL import Image, ImageOps, ImageEnhance
    PIL_OK = True
except ImportError:
    PIL_OK = False

AVAILABLE = MSS_OK and PIL_OK

# ── Región de captura (2560×1440) ─────────────────────────────────────────────
# El display aparece en la esquina inferior izquierda.
# Ajustar si la resolución o la posición del HUD son diferentes.
OCR_REGION = {
    "left":   440,   # medido: 468 − margen pequeño
    "top":    1115,  # medido: 1136 − margen pequeño
    "width":  430,   # medido: 387 + margen pequeño
    "height": 175,   # medido: 140 + margen pequeño
}

# Ruta a Tesseract — dejar vacío para usar el PATH del sistema
TESSERACT_CMD = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# ── Patrones de parseo ────────────────────────────────────────────────────────
_RE_DIST   = re.compile(r'(\d+[.,]?\d*)\s*(millas?|miles?|km|m)\b', re.IGNORECASE)
_RE_ETA    = re.compile(r'ETA[:\s]+(\d{1,2}:\d{2}(?::\d{2})?)', re.IGNORECASE)
_RE_TIME   = re.compile(r'\b(\d{1,2}:\d{2}(?::\d{2})?)\b')
_RE_SCHED  = re.compile(r'@\s*(\d{1,2}:\d{2}(?::\d{2})?)', re.IGNORECASE)


def _setup_tesseract() -> None:
    """Configura la ruta al binario de Tesseract si existe."""
    if not PIL_OK:
        return
    if os.path.exists(TESSERACT_CMD):
        pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD


_setup_tesseract()


def capture_next_stop() -> Optional[Dict]:
    """
    Captura la región del HUD y devuelve un dict con los campos parseados,
    o None si OCR no está disponible o no se detecta información útil.

    Retorno:
        {
            "station_name": str | None,
            "distance_m": float | None,     # distancia real de vía en metros
            "scheduled_time": str | None,   # hora programada "HH:MM:SS"
            "eta": str | None,              # ETA calculada por el juego "HH:MM:SS"
            "raw_text": str,                # texto OCR en bruto (para debug)
        }
    """
    if not AVAILABLE:
        return None
    try:
        with _mss.mss() as sct:
            shot = sct.grab(OCR_REGION)
            img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")

        # ── Preprocesamiento ─────────────────────────────────────────────────
        # El HUD tiene texto blanco/claro sobre fondo oscuro.
        # Convertir a escala de grises, invertir (texto negro sobre blanco)
        # y aumentar contraste para mejorar la tasa de reconocimiento.
        gray = img.convert("L")
        inverted = ImageOps.invert(gray)
        enhanced = ImageEnhance.Contrast(inverted).enhance(2.5)
        # Escalar 2× para que Tesseract trabaje mejor con fuentes pequeñas
        w, h = enhanced.size
        scaled = enhanced.resize((w * 2, h * 2), Image.Resampling.LANCZOS)

        # ── OCR ──────────────────────────────────────────────────────────────
        # --psm 6: bloque de texto uniforme; lang spa para acentos correctos
        text = pytesseract.image_to_string(
            scaled,
            lang="spa+eng",
            config="--psm 6 -c tessedit_char_whitelist='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzáéíóúüñÁÉÍÓÚÜÑ0123456789:.,@ ()'",
        )
        return _parse(text)

    except Exception as exc:
        print(f"[OCR] Error de captura: {exc}")
        return None


def _parse(text: str) -> Optional[Dict]:
    """Parsea el texto OCR y extrae los campos del display de próxima parada."""
    result: Dict = {
        "station_name": None,
        "distance_m": None,
        "scheduled_time": None,
        "eta": None,
        "raw_text": text,
    }

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        return None

    for line in lines:
        # ── Distancia ────────────────────────────────────────────────────────
        m = _RE_DIST.search(line)
        if m and result["distance_m"] is None:
            val = float(m.group(1).replace(",", "."))
            unit = m.group(2).lower()
            if "milla" in unit or "mile" in unit:
                result["distance_m"] = round(val * 1609.34, 1)
            elif unit == "km":
                result["distance_m"] = round(val * 1000.0, 1)
            else:
                result["distance_m"] = round(val, 1)

        # ── ETA ──────────────────────────────────────────────────────────────
        m_eta = _RE_ETA.search(line)
        if m_eta and result["eta"] is None:
            result["eta"] = m_eta.group(1)

        # ── Hora programada (línea con @) ─────────────────────────────────────
        m_sched = _RE_SCHED.search(line)
        if m_sched and result["scheduled_time"] is None:
            result["scheduled_time"] = m_sched.group(1)

    # ── Nombre de estación ────────────────────────────────────────────────────
    # Primera línea que no contiene distancia, '@' ni 'ETA'
    for line in lines:
        if (
            not _RE_DIST.search(line)
            and "@" not in line
            and "eta" not in line.lower()
            and len(line) > 3
        ):
            result["station_name"] = line
            break

    # Considerar válido solo si obtuvimos al menos nombre o distancia
    if result["station_name"] or result["distance_m"] is not None:
        return result
    return None


def is_available() -> bool:
    """Devuelve True si las dependencias OCR están instaladas."""
    return AVAILABLE
