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
                key, val = token.split(":", 1)
                # Intentar convertir a float si parece un número
                if val.replace('.', '', 1).replace('-', '', 1).isdigit():
                    data[key] = float(val)
                else:
                    data[key] = val
            except ValueError:
                continue
    return data
