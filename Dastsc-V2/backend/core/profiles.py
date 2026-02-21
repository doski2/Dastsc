import os
import json
import glob

class ProfileManager:
    def __init__(self, profiles_dir: str):
        self.profiles_dir = profiles_dir
        self.profiles = []
        self.manual_profile = None  # Perfil forzado por el usuario
        self.load_profiles()

    def load_profiles(self):
        self.profiles = []
        if not os.path.exists(self.profiles_dir):
            print(f"ERROR: La carpeta de perfiles no existe: {self.profiles_dir}")
            return

        pattern = os.path.join(self.profiles_dir, "*.json")
        json_files = glob.glob(pattern)
        print(f"DEBUG: Encontrados {len(json_files)} archivos JSON en {self.profiles_dir}")

        for file_path in json_files:
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    profile = json.load(f)
                    # Usar el nombre del archivo como fallback si no tiene nombre
                    if "name" not in profile:
                        profile["name"] = os.path.basename(file_path).replace(".json", "")
                    
                    # Guardar el ID (nombre de archivo) para poder seleccionarlo
                    profile["id"] = os.path.basename(file_path).replace(".json", "")
                    self.profiles.append(profile)
            except Exception as e:
                print(f"Error loading profile {file_path}: {e}")
        print(f"SUCCESS: Cargados {len(self.profiles)} perfiles.")

    def get_all_profiles(self):
        """Retorna lista simplificada para el selector UI."""
        return [{"id": p["id"], "name": p["name"]} for p in self.profiles]

    def select_manual_profile(self, profile_id: str):
        """Fuerza un perfil manualmente."""
        if profile_id == "AUTO":
            self.manual_profile = None
            return True
            
        for p in self.profiles:
            if p["id"] == profile_id:
                self.manual_profile = p
                return True
        return False

    def detect_profile(self, telemetry_data: dict):
        # Si el usuario ha seleccionado uno manualmente, ese manda
        if self.manual_profile:
            return self.manual_profile

        # 1. Intentar por LocoName si existe
        best_match = None
        max_required = -1

        for profile in self.profiles:
            fingerprint = profile.get("fingerprint", {})
            required = fingerprint.get("required_controls", [])
            
            if not required:
                continue
                
            # Comprobar si todos los controles requeridos están en la telemetría
            if all(control in telemetry_data for control in required):
                # Si hay múltiples coincidencias, nos quedamos con la que tenga más controles requeridos
                if len(required) > max_required:
                    max_required = len(required)
                    best_match = profile
                    
        return best_match
