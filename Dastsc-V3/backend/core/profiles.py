import os
import json
import glob

class ProfileManager:
    def __init__(self, profiles_dir: str):
        self.profiles_dir = profiles_dir
        self.profiles = []
        self.load_profiles()

    def load_profiles(self):
        self.profiles = []
        if not os.path.exists(self.profiles_dir):
            return

        pattern = os.path.join(self.profiles_dir, "*.json")
        json_files = glob.glob(pattern)

        for file_path in json_files:
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    profile = json.load(f)
                    profile["id"] = os.path.basename(file_path).replace(".json", "")
                    if "name" not in profile:
                        profile["name"] = profile["id"]
                    self.profiles.append(profile)
            except Exception:
                continue

    def get_all_profiles(self):
        return [{"id": p["id"], "name": p["name"]} for p in self.profiles]

    def get_profile_for_loco(self, loco_name: str):
        """
        Attempts to find the best matching profile for a given loco name.
        LocoName in TSC is usually the filename of the .bin without extension.
        """
        loco_name_lower = loco_name.lower()
        
        # 1. Exact match by ID
        for p in self.profiles:
            if p["id"].lower() == loco_name_lower:
                return p
        
        # 2. Contains match
        for p in self.profiles:
            if p["id"].lower() in loco_name_lower or loco_name_lower in p["id"].lower():
                return p
        
        # 3. Default fallback
        for p in self.profiles:
            if p["id"] == "default_expert":
                return p
                
        return self.profiles[0] if self.profiles else None
