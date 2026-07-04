"""
ocr_hud.py — Captura OCR del display de próxima parada del juego (TS Classic).

El juego renderiza la información de la siguiente estación (nombre, distancia real
de vía, hora programada, ETA) en el HUD inferior izquierdo. Esta información es
imposible de obtener via el plugin Lua en contexto global, pero el motor del juego
ya la calcula. OCR sobre esa región es la fuente más precisa disponible.

Dependencias:
  pip install mss pytesseract pillow
  + Tesseract binary (https://github.com/UB-Mannheim/tesseract/wiki)
"""

from __future__ import annotations

import os
import re
from typing import Dict, Optional

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

# ── Región de captura (referencia 2560×1440) ──────────────────────────────────
_REF_W, _REF_H = 2560, 1440
_REGION_FRACTIONS = {
    "left": 440 / _REF_W,
    "top": 1115 / _REF_H,
    "width": 430 / _REF_W,
    "height": 175 / _REF_H,
}
_DEFAULT_REGION: Dict[str, int] = {"left": 440, "top": 1115, "width": 430, "height": 175}

# Se rellena en el primer uso (evita detectar monitores al importar el módulo).
OCR_REGION: Dict[str, int] = dict(_DEFAULT_REGION)
_region_initialized = False

TESSERACT_CMD = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# ── Patrones de parseo ────────────────────────────────────────────────────────
_RE_DIST = re.compile(r"(\d+[.,]?\d*)\s*(millas?|miles?|km|m)\b", re.IGNORECASE)
_RE_ETA = re.compile(r"ETA[:\s]+(\d{1,2}:\d{2}(?::\d{2})?)", re.IGNORECASE)
_RE_SCHED = re.compile(r"@\s*(\d{1,2}:\d{2}(?::\d{2})?)", re.IGNORECASE)
_RE_PURE_TIME = re.compile(r"^\d{1,2}:\d{2}(?::\d{2})?$")
_RE_LEADING_JUNK = re.compile(r"^[^A-Za-zÀ-ÿ0-9]+", re.UNICODE)

_MILES_TO_M = 1609.34


def _setup_tesseract() -> None:
    if not PIL_OK:
        return
    if os.path.exists(TESSERACT_CMD):
        pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD


_setup_tesseract()


def _detect_region() -> Dict[str, int]:
    """
    Escala la región calibrada a la resolución del monitor de juego.
    Prioriza el monitor 2560×1440; si no existe, usa el de mayor área.
    """
    if not MSS_OK:
        return dict(_DEFAULT_REGION)
    try:
        with _mss.mss() as sct:
            physical = sct.monitors[1:]
            if not physical:
                raise RuntimeError("No se detectaron monitores")
            exact = next(
                (m for m in physical if m["width"] == _REF_W and m["height"] == _REF_H),
                None,
            )
            target = exact or max(physical, key=lambda m: m["width"] * m["height"])
            sw, sh = target["width"], target["height"]
            base_left, base_top = target.get("left", 0), target.get("top", 0)
        return {
            "left": base_left + int(_REGION_FRACTIONS["left"] * sw),
            "top": base_top + int(_REGION_FRACTIONS["top"] * sh),
            "width": int(_REGION_FRACTIONS["width"] * sw),
            "height": int(_REGION_FRACTIONS["height"] * sh),
        }
    except Exception as exc:
        print(f"[OCR] No se pudo detectar resolución, usando referencia 1440p: {exc}")
        return dict(_DEFAULT_REGION)


def get_ocr_region() -> Dict[str, int]:
    """Devuelve la región OCR, detectándola en el primer acceso."""
    global OCR_REGION, _region_initialized
    if not _region_initialized:
        OCR_REGION = _detect_region()
        _region_initialized = True
        print(f"[OCR] Región de captura calibrada: {OCR_REGION}")
    return OCR_REGION


def refresh_ocr_region() -> Dict[str, int]:
    """Fuerza recalibración (p. ej. tras cambiar de monitor o resolución)."""
    global OCR_REGION, _region_initialized
    OCR_REGION = _detect_region()
    _region_initialized = True
    print(f"[OCR] Región recalibrada: {OCR_REGION}")
    return OCR_REGION


def _distance_to_meters(value: str, unit: str) -> float:
    val = float(value.replace(",", "."))
    unit_l = unit.lower()
    if "milla" in unit_l or "mile" in unit_l:
        return round(val * _MILES_TO_M, 1)
    if unit_l == "km":
        return round(val * 1000.0, 1)
    return round(val, 1)


def _ocr_image(image) -> str:
    w, h = image.size
    scaled = image.resize((w * 2, h * 2), Image.Resampling.LANCZOS).convert("L")
    return pytesseract.image_to_string(scaled, lang="spa+eng", config="--psm 11")


def _run_ocr_pipeline(img: Image.Image) -> str:
    gray = img.convert("L")
    auto = ImageOps.autocontrast(gray, cutoff=2)
    w, h = auto.size

    lut = [0] * 140 + [255] * 116
    text_bin = _ocr_image(auto.point(lut))
    text_gray = _ocr_image(auto)

    bottom = gray.crop((0, int(h * 0.62), w, h))
    bottom_ac = ImageOps.autocontrast(bottom, cutoff=0)
    bottom_bin = bottom_ac.point([0] * 200 + [255] * 56)
    bottom_inv = ImageOps.invert(bottom_bin)
    bw, bh = bottom_inv.size
    bottom_scaled = bottom_inv.resize((bw * 4, bh * 4), Image.Resampling.LANCZOS).convert("L")
    text_bottom = pytesseract.image_to_string(bottom_scaled, lang="spa+eng", config="--psm 6")

    return text_bin + "\n" + text_gray + "\n" + text_bottom


def capture_next_stop() -> Optional[Dict]:
    """
    Captura la región del HUD y devuelve campos parseados, o None si falla.

    Retorno:
        station_name, distance_m, scheduled_time, eta, raw_text
    """
    if not AVAILABLE:
        return None
    try:
        region = get_ocr_region()
        with _mss.mss() as sct:
            shot = sct.grab(region)
            img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
        return _parse(_run_ocr_pipeline(img))
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
        m = _RE_DIST.search(line)
        if m and result["distance_m"] is None:
            result["distance_m"] = _distance_to_meters(m.group(1), m.group(2))

        m_eta = _RE_ETA.search(line)
        if m_eta and result["eta"] is None:
            result["eta"] = m_eta.group(1)

        m_sched = _RE_SCHED.search(line)
        if m_sched and result["scheduled_time"] is None:
            result["scheduled_time"] = m_sched.group(1)

    for line in lines:
        if (
            not _RE_DIST.search(line)
            and "@" not in line
            and "eta" not in line.lower()
            and not _RE_PURE_TIME.match(line)
            and len(line) > 3
        ):
            clean = _RE_LEADING_JUNK.sub("", line).strip()
            if len(clean) > 3:
                result["station_name"] = clean
            break

    if result["station_name"] or result["distance_m"] is not None:
        return result
    return None


def is_available() -> bool:
    """Devuelve True si las dependencias OCR están instaladas."""
    return AVAILABLE
