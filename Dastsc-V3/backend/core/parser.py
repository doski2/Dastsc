import math


def parse_telemetry_line(line: str) -> dict:
    """
    Parsea la salida de TSC (clave:valor|clave:valor) en un diccionario tipado.
    Actualizado para v3: Tipos estrictos y comprobaciones de seguridad.
    """
    data = {}
    if not line or "|" not in line:
        return data
        
    tokens = line.strip().split("|")
    for token in tokens:
        if ":" in token:
            try:
                key, val = token.split(":", 1)
                # Intenta conversión numérica (float handles int, decimals, negatives, exponents)
                try:
                    numeric = float(val)
                    # Infinity y NaN no son JSON válido; el plugin los emite cuando
                    # una señal o límite no tiene valor asignado.
                    data[key] = numeric if math.isfinite(numeric) else 0.0
                except ValueError:
                    data[key] = val
            except ValueError:
                continue
    return data
