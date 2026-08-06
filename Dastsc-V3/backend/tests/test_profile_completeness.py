import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest

from core.profile_completeness import assess_profile_completeness


class TestProfileCompleteness(unittest.TestCase):
    def test_gold_class323(self):
        picked = {"id": "class323"}
        resolved = {
            "id": "class323",
            "physics_config": {
                "max_braking_decel": 1.1,
                "station_reaction_time_s": 1.2,
            },
            "brakes": {"type": "air"},
            "fingerprint": {"required_controls": ["A", "B", "C"]},
            "mappings": {"a": "1", "b": "2", "c": "3", "d": "4", "e": "5"},
        }
        result = assess_profile_completeness(picked, resolved)
        self.assertEqual(result["level"], "gold")
        self.assertGreaterEqual(result["score"], 90)

    def test_inherited_variant(self):
        base = {"id": "class323", "physics_config": {"station_reaction_time_s": 1.0}}
        picked = {"id": "xc_class323_expert", "extends": "class323"}
        resolved = {
            "id": "xc_class323_expert",
            "physics_config": {"station_reaction_time_s": 1.0},
            "brakes": {"type": "air"},
            "fingerprint": {"required_controls": ["ThrottleAndBrake"]},
            "mappings": {"combined_control": "ThrottleAndBrake"},
        }

        def get_by_id(profile_id: str):
            return base if profile_id == "class323" else None

        result = assess_profile_completeness(picked, resolved, get_by_id)
        self.assertEqual(result["level"], "inherited")
        self.assertEqual(result["extends"], "class323")

    def test_broken_extends(self):
        picked = {"id": "bad_child", "extends": "missing_base"}
        resolved = {"id": "bad_child", "physics_config": {}}

        def get_by_id(_profile_id: str):
            return None

        result = assess_profile_completeness(picked, resolved, get_by_id)
        self.assertEqual(result["level"], "broken")
        self.assertTrue(any("no existe" in w for w in result["warnings"]))

    def test_stub_generic_physics(self):
        picked = {"id": "class375"}
        resolved = {
            "id": "class375",
            "physics_config": {"max_braking_decel": 0.8},
            "fingerprint": {"required_controls": ["ThrottleAndBrake"]},
            "mappings": {"combined_control": "ThrottleAndBrake"},
        }
        result = assess_profile_completeness(picked, resolved)
        self.assertEqual(result["level"], "stub")
        self.assertTrue(any("genérica" in w for w in result["warnings"]))


if __name__ == "__main__":
    unittest.main()
