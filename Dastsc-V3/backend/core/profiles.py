"""
profiles.py — Carga y selección de perfiles de tren (JSON en /profiles).
"""
import glob
import json
import os
from typing import Any, Dict, List, Optional

import core.brake_log as brake_log
from core.profile_auto import is_auto_detectable_profile
from core.profile_completeness import assess_profile_completeness

Profile = Dict[str, Any]
ProfileSummary = Dict[str, Any]

_DEFAULT_VISUALS = {"unit": "MPH", "color": "#3498db"}
_NEXUS_SUBDIR = "nexus"
_NEXUS_MANIFEST = "manifest.json"


def _profile_id_from_path(file_path: str) -> str:
    return os.path.splitext(os.path.basename(file_path))[0]


def _load_profile_file(file_path: str) -> Optional[Profile]:
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        return None
    profile_id = _profile_id_from_path(file_path)
    profile = dict(data)
    profile.setdefault("name", profile_id)
    profile["id"] = profile_id
    return profile


def _iter_profile_files(profiles_dir: str) -> List[str]:
    """Raíz legacy + árbol Nexus (nexus/**). Los de Nexus sobrescriben mismo id."""
    paths: List[str] = []
    if not os.path.isdir(profiles_dir):
        return paths

    root_pattern = os.path.join(profiles_dir, "*.json")
    paths.extend(sorted(glob.glob(root_pattern)))

    nexus_root = os.path.join(profiles_dir, _NEXUS_SUBDIR)
    if os.path.isdir(nexus_root):
        nexus_pattern = os.path.join(nexus_root, "**", "*.json")
        for file_path in sorted(glob.glob(nexus_pattern, recursive=True)):
            if os.path.basename(file_path) == _NEXUS_MANIFEST:
                continue
            paths.append(file_path)

    return paths


class ProfileManager:
    def __init__(self, profiles_dir: str):
        self.profiles_dir = profiles_dir
        self.profiles: List[Profile] = []
        self.manual_profile: Optional[Profile] = None
        self.load_profiles()

    def load_profiles(self) -> int:
        """Recarga perfiles desde disco. Devuelve cuántos se cargaron."""
        if not os.path.isdir(self.profiles_dir):
            self.profiles = []
            return 0

        by_id: Dict[str, Profile] = {}
        for file_path in _iter_profile_files(self.profiles_dir):
            try:
                profile = _load_profile_file(file_path)
                if profile:
                    by_id[profile["id"]] = profile
            except (json.JSONDecodeError, OSError):
                continue

        self.profiles = sorted(by_id.values(), key=lambda p: p.get("name", p["id"]).lower())
        return len(self.profiles)

    def has_nexus_profiles(self) -> bool:
        return any(p.get("nexus") for p in self.profiles)

    def get_all_profiles(self) -> List[ProfileSummary]:
        """Lista simplificada para el selector de la UI (legacy + nexus detectables)."""
        sources = [p for p in self.profiles if is_auto_detectable_profile(p)]
        if not sources:
            sources = self.profiles
        return [
            {
                "id": p["id"],
                "name": p["name"],
                "visuals": p.get("visuals", dict(_DEFAULT_VISUALS)),
                "nexus": p.get("nexus"),
            }
            for p in sources
        ]

    def get_by_id(self, profile_id: str) -> Optional[Profile]:
        target = str(profile_id).strip().lower()
        for profile in self.profiles:
            if str(profile["id"]).strip().lower() == target:
                return profile
        return None

    def select_manual_profile(self, profile_id: Optional[str]) -> bool:
        """
        Fija un perfil manualmente.
        - None / '' / 'AUTO' → modo automático
        - id existente → perfil forzado
        """
        if not profile_id or str(profile_id).strip().upper() == "AUTO":
            self.manual_profile = None
            return True

        profile = self.get_by_id(profile_id)
        if profile is None:
            return False

        self.manual_profile = profile
        return True

    def get_profile_for_loco(self, loco_name: str) -> Optional[Profile]:
        """Autodetección simple por id/nombre (legacy)."""
        if not loco_name:
            return self.profiles[0] if self.profiles else None
        target = loco_name.strip().lower()
        for profile in self.profiles:
            if str(profile["id"]).lower() == target:
                return profile
            if str(profile.get("name", "")).lower() == target:
                return profile
        return self.profiles[0] if self.profiles else None

    def resolve_active_profile(
        self,
        loco_names: Optional[List[str]] = None,
        controller_names: Optional[List[str]] = None,
        limits_by_name: Optional[Dict[str, Dict[str, float]]] = None,
    ) -> Optional[Profile]:
        from core.profile_auto import enrich_profile, resolve_auto_profile, resolve_profile_chain

        loco_names = loco_names or []
        controller_names = controller_names or []

        if self.manual_profile is not None:
            picked = self.manual_profile
        else:
            picked = resolve_auto_profile(self.profiles, loco_names, controller_names)
            if picked is None:
                return None

        resolved = resolve_profile_chain(picked, self.get_by_id)
        enriched = enrich_profile(
            resolved,
            limits_by_name=limits_by_name,
            loco_names=loco_names,
        )
        stats = brake_log.get_stats(str(picked.get("id", "")))
        runtime = enriched.setdefault("runtime", {})
        runtime["profile_completeness"] = assess_profile_completeness(
            picked,
            enriched,
            self.get_by_id,
            stats,
        )
        return enriched
