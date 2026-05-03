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
    from PIL import Image, ImageOps
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
_RE_DIST      = re.compile(r'(\d+[.,]?\d*)\s*(millas?|miles?|km|m)\b', re.IGNORECASE)
_RE_ETA       = re.compile(r'ETA[:\s]+(\d{1,2}:\d{2}(?::\d{2})?)', re.IGNORECASE)
_RE_TIME      = re.compile(r'\b(\d{1,2}:\d{2}(?::\d{2})?)\b')
_RE_SCHED     = re.compile(r'@\s*(\d{1,2}:\d{2}(?::\d{2})?)', re.IGNORECASE)
# Línea que es SOLO una hora (p.ej. "08:16:06") → no es nombre de estación
_RE_PURE_TIME = re.compile(r'^\d{1,2}:\d{2}(?::\d{2})?$')
# Caracteres iniciales que no son letras ni dígitos (artefactos OCR del icono)
_RE_LEADING_JUNK = re.compile(r'^[^A-Za-zÀ-ÿ0-9]+', re.UNICODE)


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
        # El HUD tiene un gradiente: zona superior oscura (icono + reloj) y zona
        # inferior gris claro (nombre estación, distancia, ETA). Invertir la
        # imagen completa deja la zona inferior con texto claro sobre gris
        # oscuro → Tesseract no lo lee. Solución: autocontrast + umbral fijo,
        # que funciona bien tanto para texto oscuro-sobre-claro como al revés.
        gray = img.convert("L")
        auto = ImageOps.autocontrast(gray, cutoff=2)
        # Umbral: píxeles < 140 → negro (texto), ≥ 140 → blanco (fondo)
        # Tabla de lookup (256 entradas) — más rápido y compatible con Pillow typing
        lut = [0] * 140 + [255] * 116
        thresh = auto.point(lut)
        # Escalar 2× para que Tesseract trabaje mejor con fuentes pequeñas
        w, h = thresh.size
        scaled = thresh.resize((w * 2, h * 2), Image.Resampling.LANCZOS)

        # Guardar la imagen procesada como L (no "1") para compatibilidad
        scaled = scaled.convert("L")

        # ── OCR ──────────────────────────────────────────────────────────────
        # --psm 11: texto disperso — no asume layout uniforme, lee cada línea
        # independientemente. Más robusto con HUDs de fondo gradiente.
        # Sin whitelist: dejamos que Tesseract use su modelo completo para
        # evitar que suprima líneas con caracteres de baja confianza.
        text = pytesseract.image_to_string(
            scaled,
            lang="spa+eng",
            config="--psm 11",
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
    # Primera línea que no sea hora pura, no contenga distancia, '@' ni 'ETA'
    for line in lines:
        if (
            not _RE_DIST.search(line)
            and "@" not in line
            and "eta" not in line.lower()
            and not _RE_PURE_TIME.match(line)   # excluir el reloj "08:16:06"
            and len(line) > 3
        ):
            # Limpiar artefactos del icono caminante al inicio ("R ", "| ", etc.)
            clean = _RE_LEADING_JUNK.sub("", line).strip()
            if len(clean) > 3:
                result["station_name"] = clean
            break

    # Considerar válido solo si obtuvimos al menos nombre o distancia
    if result["station_name"] or result["distance_m"] is not None:
        return result
    return None


def is_available() -> bool:
    """Devuelve True si las dependencias OCR están instaladas."""
    return AVAILABLE
