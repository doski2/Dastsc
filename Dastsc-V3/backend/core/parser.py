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
                # Conversión numérica
                if val.replace('.', '', 1).replace('-', '', 1).isdigit():
                    data[key] = float(val)
                else:
                    data[key] = val
            except ValueError:
                continue
    return data
