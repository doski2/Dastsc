import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
import json
import shutil
import tempfile
from core.profiles import ProfileManager

class TestProfiles(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        # Create some mock profiles
        self.profile1 = {"name": "Class 323", "visuals": {"unit": "MPH"}}
        self.profile2 = {"name": "Class 390"}
        
        with open(os.path.join(self.test_dir, "class323.json"), "w") as f:
            json.dump(self.profile1, f)
        with open(os.path.join(self.test_dir, "class390.json"), "w") as f:
            json.dump(self.profile2, f)
            
        self.manager = ProfileManager(self.test_dir)

    def tearDown(self):
        shutil.rmtree(self.test_dir)

    def test_load_profiles(self):
        self.assertEqual(len(self.manager.profiles), 2)
        ids = [p["id"] for p in self.manager.profiles]
        self.assertIn("class323", ids)
        self.assertIn("class390", ids)

    def test_get_all_profiles(self):
        profiles = self.manager.get_all_profiles()
        self.assertEqual(len(profiles), 2)
        self.assertEqual(profiles[0]["name"], "Class 323")

    def test_select_manual_profile(self):
        # Select by ID
        success = self.manager.select_manual_profile("class323")
        self.assertTrue(success)
        self.assertEqual(self.manager.manual_profile["name"], "Class 323")
        
        # Select AUTO
        success = self.manager.select_manual_profile("AUTO")
        self.assertTrue(success)
        self.assertIsNone(self.manager.manual_profile)
        
        # Select non-existent
        success = self.manager.select_manual_profile("non_existent")
        self.assertFalse(success)

    def test_get_profile_for_loco(self):
        p = self.manager.get_profile_for_loco("class390")
        self.assertEqual(p["name"], "Class 390")
        
        # Fallback if not found
        p = self.manager.get_profile_for_loco("unknown")
        self.assertIsNotNone(p) # Returns first profile as fallback

if __name__ == '__main__':
    unittest.main()
