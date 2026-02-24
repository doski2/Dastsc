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
        return [
            {
                "id": p["id"], 
                "name": p["name"],
                "visuals": p.get("visuals", {"unit": "MPH", "color": "#3498db"})
            } for p in self.profiles
        ]

    def select_manual_profile(self, profile_id: str):
        """Fuerza un perfil manualmente."""
        print(f"DEBUG Core: Seleccionando perfil [{profile_id}]")
        if not profile_id:
            self.manual_profile = None
            return True
            
        if str(profile_id).upper() == "AUTO":
            self.manual_profile = None
            return True
            
        # Búsqueda robusta (ignorando mayúsculas y espacios laterales)
        target = str(profile_id).strip().lower()
        for p in self.profiles:
            if str(p["id"]).strip().lower() == target:
                self.manual_profile = p
                print(f"DEBUG Core: Perfil encontrado: {p['name']}")
                return True
        
        print(f"DEBUG Core: No se encontró coincidencia para [{target}]")
        return False

    def get_profile_for_loco(self, loco_name: str):
        # ... preservado para compatibilidad si se usa autodetección ...
        loco_name_lower = loco_name.lower()
        for p in self.profiles:
            if p["id"].lower() == loco_name_lower:
                return p
        return self.profiles[0] if self.profiles else None
