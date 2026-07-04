import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import json
import shutil
import tempfile
import unittest
from core.profiles import ProfileManager, _load_profile_file


class TestProfiles(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.profile1 = {"name": "Class 323", "visuals": {"unit": "MPH"}}
        self.profile2 = {"name": "Class 390"}

        with open(os.path.join(self.test_dir, "class323.json"), "w", encoding="utf-8") as f:
            json.dump(self.profile1, f)
        with open(os.path.join(self.test_dir, "class390.json"), "w", encoding="utf-8") as f:
            json.dump(self.profile2, f)

        self.manager = ProfileManager(self.test_dir)

    def tearDown(self):
        shutil.rmtree(self.test_dir)

    def test_load_profiles(self):
        self.assertEqual(len(self.manager.profiles), 2)
        ids = {p["id"] for p in self.manager.profiles}
        self.assertEqual(ids, {"class323", "class390"})

    def test_profiles_sorted_by_name(self):
        names = [p["name"] for p in self.manager.profiles]
        self.assertEqual(names, sorted(names, key=str.lower))

    def test_get_all_profiles(self):
        profiles = self.manager.get_all_profiles()
        self.assertEqual(len(profiles), 2)
        names = {p["name"] for p in profiles}
        self.assertEqual(names, {"Class 323", "Class 390"})
        by_id = {p["id"]: p for p in profiles}
        self.assertEqual(by_id["class390"]["visuals"], {"unit": "MPH", "color": "#3498db"})

    def test_select_manual_profile(self):
        self.assertTrue(self.manager.select_manual_profile("class323"))
        self.assertEqual(self.manager.manual_profile["name"], "Class 323")

        self.assertTrue(self.manager.select_manual_profile("AUTO"))
        self.assertIsNone(self.manager.manual_profile)

        self.assertFalse(self.manager.select_manual_profile("non_existent"))

    def test_select_case_insensitive(self):
        self.assertTrue(self.manager.select_manual_profile("Class323"))
        self.assertEqual(self.manager.manual_profile["id"], "class323")

    def test_clear_with_empty_id(self):
        self.manager.select_manual_profile("class323")
        self.assertTrue(self.manager.select_manual_profile(""))
        self.assertIsNone(self.manager.manual_profile)

    def test_get_profile_for_loco(self):
        p = self.manager.get_profile_for_loco("class390")
        self.assertEqual(p["name"], "Class 390")

        p = self.manager.get_profile_for_loco("unknown")
        self.assertIsNotNone(p)

    def test_missing_directory(self):
        manager = ProfileManager(os.path.join(self.test_dir, "missing"))
        self.assertEqual(manager.profiles, [])
        self.assertEqual(manager.get_all_profiles(), [])

    def test_invalid_json_skipped(self):
        with open(os.path.join(self.test_dir, "broken.json"), "w", encoding="utf-8") as f:
            f.write("{not json")
        count = self.manager.load_profiles()
        self.assertEqual(count, 2)

    def test_profile_without_name_uses_id(self):
        path = os.path.join(self.test_dir, "hst.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"visuals": {"unit": "MPH"}}, f)
        profile = _load_profile_file(path)
        self.assertEqual(profile["id"], "hst")
        self.assertEqual(profile["name"], "hst")


if __name__ == "__main__":
    unittest.main()
