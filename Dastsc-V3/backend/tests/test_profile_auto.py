import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
from core.profile_auto import (
    enrich_profile,
    resolve_auto_profile,
    resolve_profile_chain,
    score_profile,
)


class TestProfileAuto(unittest.TestCase):
    def setUp(self):
        self.profiles = [
            {
                "id": "class323",
                "name": "Class 323 DMS(B) CrossCity",
                "aliases": ["323211", "323", "RV:323211", "Class 323"],
                "fingerprint": {"required_controls": ["ThrottleAndBrake", "DRA"]},
                "mappings": {"combined_control": "ThrottleAndBrake"},
                "physics_config": {"max_braking_decel": 1.1},
            },
            {
                "id": "class390_expert",
                "name": "Class 390 Pendolino",
                "fingerprint": {"required_controls": ["Regulator", "TrainBrakeControl"]},
            },
        ]

    def test_score_prefers_fingerprint_match(self):
        score = score_profile(
            self.profiles[0],
            ["Class 323"],
            ["ThrottleAndBrake", "DRA", "AWS"],
        )
        self.assertGreater(score, 20)

    def test_resolve_auto_profile_by_loco_and_controls(self):
        resolved = resolve_auto_profile(
            self.profiles,
            ["Class 323 DMS"],
            ["ThrottleAndBrake", "DRA"],
        )
        self.assertIsNotNone(resolved)
        assert resolved is not None
        self.assertEqual(resolved["id"], "class323")

    def test_resolve_rv_loco_name(self):
        resolved = resolve_auto_profile(
            self.profiles,
            ["RV:323211_65011"],
            ["ThrottleAndBrake", "DRA", "DVDAlarm", "RegenBrakesSwitch", "UserVirtualReverser"],
        )
        self.assertIsNotNone(resolved)
        assert resolved is not None
        self.assertEqual(resolved["id"], "class323")

    def test_resolve_rv_loco_expert_fingerprint(self):
        profiles = self.profiles + [
            {
                "id": "xc_class323_expert",
                "name": "XC Class323 Expert",
                "aliases": ["323211", "323"],
                "fingerprint": {"required_controls": ["ThrottleAndBrake"]},
            },
        ]
        resolved = resolve_auto_profile(
            profiles,
            ["RV:323211_65011"],
            ["ThrottleAndBrake"],
        )
        self.assertIsNotNone(resolved)
        assert resolved is not None
        self.assertEqual(resolved["id"], "xc_class323_expert")

    def test_extends_inherits_physics_and_notches(self):
        base = {
            "id": "class323",
            "physics_config": {"max_braking_decel": 1.1, "brake_fill_time_s": 5},
            "specs": {
                "notches_throttle_brake": [
                    {"value": -0.5, "label": "B2"},
                    {"value": 0.0, "label": "OFF"},
                ],
            },
        }
        child = {
            "id": "xc_class323_expert",
            "extends": "class323",
            "fingerprint": {"required_controls": ["ThrottleAndBrake"]},
            "visuals": {"color": "#3498db"},
        }

        def get_by_id(profile_id: str):
            return base if profile_id == "class323" else None

        merged = resolve_profile_chain(child, get_by_id)
        self.assertEqual(merged["physics_config"]["max_braking_decel"], 1.1)
        self.assertEqual(len(merged["specs"]["notches_throttle_brake"]), 2)
        self.assertEqual(merged["visuals"]["color"], "#3498db")
        self.assertEqual(merged["fingerprint"]["required_controls"], ["ThrottleAndBrake"])

    def test_enrich_profile_fills_defaults_and_runtime_limits(self):
        enriched = enrich_profile(
            {"id": "test", "mappings": {"combined_control": "ThrottleAndBrake"}},
            limits_by_name={
                "ThrottleAndBrake": {"min": -1.0, "max": 1.0, "current": 0.0},
            },
            loco_names=["Test Loco"],
        )
        self.assertIn("max_braking_decel", enriched["physics_config"])
        self.assertTrue(enriched["specs"]["notches_throttle_brake"])
        self.assertEqual(enriched["runtime"]["combined_control_range"]["min"], -1.0)


if __name__ == "__main__":
    unittest.main()
