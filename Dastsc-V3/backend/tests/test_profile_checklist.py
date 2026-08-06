import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest

from core.profile_checklist import STATUS_MISSING, STATUS_OK, build_profile_checklist
from core.profile_draft import apply_extends_template, merge_draft_into_profile, suggest_extends_base


class TestProfileChecklist(unittest.TestCase):
    def setUp(self):
        self.base = {
            "id": "class323",
            "physics_config": {"station_reaction_time_s": 1.2, "max_braking_decel": 1.1},
            "brakes": {"type": "COMBINED_BLENDED"},
            "specs": {"notches_throttle_brake": [{"value": 0, "label": "OFF"}]},
        }

        def get_by_id(profile_id: str):
            return self.base if profile_id == "class323" else None

        self.get_by_id = get_by_id

    def test_stub_flags_missing_physics(self):
        picked = {
            "id": "class375",
            "aliases": ["Class375"],
            "fingerprint": {"required_controls": ["ThrottleAndBrake"]},
            "mappings": {"combined_control": "ThrottleAndBrake"},
        }
        result = build_profile_checklist(picked, get_by_id=self.get_by_id)
        self.assertEqual(result["completeness"]["level"], "stub")
        keys = {item["key"] for item in result["items"] if item["status"] == STATUS_MISSING}
        self.assertIn("brakes", keys)

    def test_inherited_variant_ready(self):
        picked = {
            "id": "xc_class323_expert",
            "extends": "class323",
            "aliases": ["323211", "RV:323211"],
            "fingerprint": {"required_controls": ["ThrottleAndBrake", "DRA", "DVDAlarm"]},
            "mappings": {
                "combined_control": "ThrottleAndBrake",
                "reverser": "UserVirtualReverser",
            },
        }
        result = build_profile_checklist(picked, get_by_id=self.get_by_id)
        self.assertEqual(result["completeness"]["level"], "inherited")
        self.assertTrue(result["ready_to_save"])

    def test_suggest_extends_uk_emu(self):
        controls = {"ThrottleAndBrake", "DRA", "DVDAlarm", "AWS"}
        self.assertEqual(suggest_extends_base(controls), "class323")

    def test_apply_extends_strips_physics(self):
        profile = {
            "id": "class375",
            "physics_config": {"max_braking_decel": 0.8},
            "brakes": {"type": "X"},
            "specs": {"notches_throttle_brake": [], "max_speed": 100},
        }
        slim = apply_extends_template(profile, "class323")
        self.assertEqual(slim["extends"], "class323")
        self.assertNotIn("physics_config", slim)
        self.assertNotIn("brakes", slim)
        self.assertIn("max_speed", slim["specs"])

    def test_split_layout_checklist(self):
        picked = {
            "id": "icet",
            "aliases": ["ICE T", "411"],
            "fingerprint": {
                "required_controls": ["Regulator", "TrainBrakeControl", "AFB", "LZBActive"],
            },
            "mappings": {
                "throttle": "Regulator",
                "brake": "TrainBrakeControl",
                "reverser": "Reverser",
            },
            "specs": {"notches_throttle_brake": [{"value": -0.3, "label": "S3"}, {"value": 0, "label": "NEU"}]},
            "physics_config": {"max_braking_decel": 1.2, "station_reaction_time_s": 1.0},
            "brakes": {"type": "SPLIT"},
        }
        result = build_profile_checklist(picked, get_by_id=self.get_by_id)
        layout = next(i for i in result["items"] if i["key"] == "control_layout")
        self.assertEqual(layout["status"], STATUS_OK)
        self.assertIn("Separado", layout["detail"])
        self.assertTrue(result["ready_to_save"])


if __name__ == "__main__":
    unittest.main()
