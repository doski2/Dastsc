def parse_telemetry_line(line: str) -> dict:
    """
    Parses TSC output (key:val|key:val) into a typed dict.
    Updated for v3: Strict types and safety checks.
    """
    data = {}
    if not line or "|" not in line:
        return data
        
    tokens = line.strip().split("|")
    for token in tokens:
        if ":" in token:
            try:
                key, val = token.split(":", 1)
                # Numeric conversion
                if val.replace('.', '', 1).replace('-', '', 1).isdigit():
                    data[key] = float(val)
                else:
                    data[key] = val
            except ValueError:
                continue
    return data
