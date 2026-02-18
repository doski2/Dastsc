import os
import json

# Rutas
ORIGIN_DIR = r"C:\Users\doski\Documents\TSClassic Raildriver and Joystick Interface V3.3.0.9\InputMapper"
DEST_DIR = r"c:\Users\doski\Dastsc\profiles"

def parse_original_mapper(file_path):
    controls = set()
    try:
        with open(file_path, 'r', encoding='latin-1') as f:
            for line in f:
                # El formato original es: CONTROL, KEY, EXTRA, FUNCTION, STATE
                # Buscamos la primera palabra que suele ser el nombre del control
                parts = line.split(',')
                if len(parts) >= 2:
                    control_name = parts[0].strip()
                    if control_name and control_name != "CONTROL":
                        controls.add(control_name)
    except Exception as e:
        print(f"Error leyendo {file_path}: {e}")
    return list(controls)

def migrate():
    if not os.path.exists(DEST_DIR):
        os.makedirs(DEST_DIR)

    count = 0
    for root, dirs, files in os.walk(ORIGIN_DIR):
        for file in files:
            if file.endswith(".txt"):
                full_path = os.path.join(root, file)
                controls = parse_original_mapper(full_path)
                
                if not controls:
                    continue

                # Crear el perfil JSON
                profile_name = file.replace(".txt", "").replace("_", " ")
                
                # Intentamos adivinar el tipo de controles
                mappings = {}
                fingerprint = []
                
                # Lógica de detección de controles clave
                if "ThrottleAndBrake" in controls:
                    mappings["combined_control"] = "ThrottleAndBrake"
                    fingerprint.append("ThrottleAndBrake")
                else:
                    if "Regulator" in controls:
                        mappings["throttle"] = "Regulator"
                        fingerprint.append("Regulator")
                    if "TrainBrakeControl" in controls:
                        mappings["brake"] = "TrainBrakeControl"
                        fingerprint.append("TrainBrakeControl")
                
                if "TractiveEffort" in controls:
                    mappings["effort"] = "TractiveEffort"
                elif "Acceleration" in controls:
                    mappings["effort"] = "Acceleration"
                elif "Traction" in controls:
                    mappings["effort"] = "Traction"

                if "Ammeter" in controls:
                    mappings["ammeter"] = "Ammeter"
                if "Current" in controls:
                    mappings["current"] = "Current"

                if "UserVirtualReverser" in controls:
                    mappings["reverser"] = "UserVirtualReverser"
                elif "Reverser" in controls:
                    mappings["reverser"] = "Reverser"

                # Metadatos del perfil
                new_profile = {
                    "name": profile_name,
                    "source_file": file,
                    "fingerprint": {
                        "required_controls": fingerprint
                    },
                    "mappings": mappings,
                    "visuals": {
                        "unit": "KPH" if any(x in profile_name.upper() for x in ["BR", "DB", "GERMAN"]) else "MPH",
                        "color": "#3498db"
                    }
                }

                # Guardar JSON
                dest_file = os.path.join(DEST_DIR, file.replace(".txt", ".json").lower())
                with open(dest_file, "w") as jf:
                    json.dump(new_profile, jf, indent=4)
                count += 1

    print(f"Migración completada. Se han creado {count} perfiles en {DEST_DIR}")

if __name__ == "__main__":
    migrate()
