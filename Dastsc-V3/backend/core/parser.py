"""
parser.py — Convierte la línea de telemetría del plugin TSC (GetData.txt)
en un diccionario listo para el WebSocket.
"""
import math
from typing import Any, Dict, Union

TelemetryValue = Union[float, str]
TelemetryDict = Dict[str, TelemetryValue]


def _coerce_value(raw: str) -> TelemetryValue:
    """Convierte a float si es numérico; Inf/NaN → 0.0 para JSON seguro."""
    try:
        numeric = float(raw)
        return numeric if math.isfinite(numeric) else 0.0
    except ValueError:
        return raw


def parse_telemetry_line(line: str) -> TelemetryDict:
    """
    Parsea `clave:valor|clave:valor` en un diccionario tipado.

    - Valores numéricos → float (enteros incluidos)
    - Inf / NaN → 0.0 (el plugin los emite sin señal asignada)
    - Resto → string
    - Tokens sin ':' o clave vacía → ignorados
    """
    if not line or "|" not in line:
        return {}

    data: TelemetryDict = {}
    for token in line.strip().split("|"):
        if ":" not in token:
            continue
        key, val = token.split(":", 1)
        key = key.strip()
        if not key:
            continue
        data[key] = _coerce_value(val)
    return data
