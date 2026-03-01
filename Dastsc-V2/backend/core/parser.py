def parse_telemetry_line(line: str) -> dict:
    """
    Convierte una cadena formateada de TSC (key:val|key:val)
    en un diccionario de Python con tipos convertidos.
    """
    data = {}
    if not line or "|" not in line:
        return data
        
    tokens = line.strip().split("|")
    for token in tokens:
        if ":" in token:
            try:
                # Partir solo por el primer dos puntos
                parts = token.split(":", 1)
                if len(parts) == 2:
                    key, val = parts
                    # Verificación más robusta de números (soporta notación científica, .5, etc)
                    try:
                        data[key] = float(val)
                    except ValueError:
                        data[key] = val
            except Exception:
                continue
    return data
