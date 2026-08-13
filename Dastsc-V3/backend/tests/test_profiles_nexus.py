import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.profile_auto import resolve_auto_profile, resolve_profile_chain
from core.profiles import ProfileManager


class TestNexusProfiles(unittest.TestCase):
    def setUp(self):
        self.repo_profiles = os.path.normpath(
            os.path.join(os.path.dirname(__file__), "..", "..", "..", "profiles"),
        )
        self.manager = ProfileManager(self.repo_profiles)

    def test_loads_nexus_train_profiles(self):
        ids = {p["id"] for p in self.manager.profiles}
        self.assertIn("class323", ids)
        self.assertIn("icet", ids)
        self.assertIn("passenger", ids)
        self.assertIn("generic", ids)

    def test_ui_lists_detectable_profiles_from_full_folder(self):
        visible = self.manager.get_all_profiles()
        visible_ids = {p["id"] for p in visible}
        self.assertIn("class323", visible_ids)
        self.assertIn("icet", visible_ids)
        self.assertIn("generic", visible_ids)
        self.assertIn("class390_expert", visible_ids)
        self.assertNotIn("passenger", visible_ids)

    def test_auto_selects_class390_expert_from_legacy(self):
        resolved = resolve_auto_profile(
            self.manager.profiles,
            ["[WCML-S] Class 390 A 692 Avanti"],
            [
                "ThrottleAndBrake",
                "Regulator",
                "TrainBrakeControl",
                "DRA",
                "DSDAlarm",
                "AWS",
                "UserVirtualReverser",
                "Reverser",
            ],
        )
        self.assertIsNotNone(resolved)
        assert resolved is not None
        self.assertEqual(resolved["id"], "class390_expert")

    def test_class323_extends_passenger(self):
        base = self.manager.get_by_id("class323")
        self.assertIsNotNone(base)
        assert base is not None
        self.assertEqual(base.get("extends"), "passenger")
        resolved = resolve_profile_chain(base, self.manager.get_by_id)
        self.assertTrue(resolved["specs"]["notches_throttle_brake"])
        self.assertEqual(resolved["physics_config"]["station_reaction_time_s"], 0.9)
        self.assertEqual(resolved["physics_config"]["max_braking_decel"], 1.1)

    def test_icet_extends_passenger_with_german_notches(self):
        base = self.manager.get_by_id("icet")
        self.assertIsNotNone(base)
        assert base is not None
        resolved = resolve_profile_chain(base, self.manager.get_by_id)
        labels = [n["label"] for n in resolved["specs"]["notches_throttle_brake"]]
        self.assertIn("NEU", labels)
        self.assertIn("S7", labels)
        self.assertEqual(resolved["mappings"]["brake"], "VirtualBrake")
        self.assertEqual(
            resolved["agent_config"]["station"]["release_block_speed_ms"],
            2.5,
        )

    def test_passenger_agent_config_inherited_by_class323(self):
        base = self.manager.get_by_id("class323")
        self.assertIsNotNone(base)
        assert base is not None
        resolved = resolve_profile_chain(base, self.manager.get_by_id)
        self.assertEqual(resolved["agent_config"]["station"]["plan_horizon_m"], 1500)
        self.assertEqual(resolved["agent_config"]["brake"]["release_margin_kmh"], 3)

    def test_auto_prefers_icet_over_generic(self):
        resolved = resolve_auto_profile(
            self.manager.profiles,
            ["[LR] ICE T CabCar 411.0"],
            [
                "VirtualBrake",
                "SimpleThrottle",
                "TrainBrakeControl",
                "AFB",
                "LZBActive",
                "VigilAlarm",
                "PantographControl",
                "EmergencyBrake",
                "Reverser",
            ],
        )
        self.assertIsNotNone(resolved)
        assert resolved is not None
        self.assertEqual(resolved["id"], "icet")

    def test_auto_falls_back_to_generic_for_unknown_passenger(self):
        resolved = resolve_auto_profile(
            self.manager.profiles,
            ["Random EMU"],
            ["Regulator", "TrainBrakeControl", "Reverser"],
        )
        self.assertIsNotNone(resolved)
        assert resolved is not None
        self.assertEqual(resolved["id"], "generic")


class TestNexusProfilesIsolated(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        nexus = os.path.join(self.tmp, "nexus", "genres")
        os.makedirs(nexus)
        with open(os.path.join(nexus, "passenger.json"), "w", encoding="utf-8") as f:
            json.dump({
                "name": "Pasajeros",
                "nexus": {"tier": "genre", "genre": "passenger", "hidden": True},
                "specs": {"notches_throttle_brake": [{"value": 0, "label": "OFF"}]},
            }, f)
        trains = os.path.join(self.tmp, "nexus", "trains")
        os.makedirs(trains)
        with open(os.path.join(trains, "alpha.json"), "w", encoding="utf-8") as f:
            json.dump({
                "name": "Alpha",
                "extends": "passenger",
                "nexus": {"tier": "train", "genre": "passenger"},
            }, f)
        with open(os.path.join(self.tmp, "legacy.json"), "w", encoding="utf-8") as f:
            json.dump({"name": "Legacy"}, f)
        self.manager = ProfileManager(self.tmp)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def test_nexus_overrides_same_id_at_root(self):
        with open(os.path.join(self.tmp, "alpha.json"), "w", encoding="utf-8") as f:
            json.dump({"name": "Legacy Alpha"}, f)
        self.manager.load_profiles()
        alpha = self.manager.get_by_id("alpha")
        self.assertIsNotNone(alpha)
        assert alpha is not None
        self.assertEqual(alpha["name"], "Alpha")
        self.assertEqual((alpha.get("nexus") or {}).get("tier"), "train")


if __name__ == "__main__":
    unittest.main()
