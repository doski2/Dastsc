import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
import json
import shutil
import tempfile
from core.station_tracker import StationTracker, _normalize_name

class TestStationTracker(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.patch_profile_path = os.path.join(self.test_dir, "profile.json")
        self.patch_state_path = os.path.join(self.test_dir, "state.json")
        
        # Mock profile
        self.profile_data = {
            "stations": [
                {"name": "station a", "km_post": 0.0},
                {"name": "station b", "km_post": 10.0},
                {"name": "station c", "km_post": 25.0}
            ]
        }
        with open(self.patch_profile_path, "w", encoding="utf-8") as f:
            json.dump(self.profile_data, f)
            
        import core.station_tracker
        self.original_profile_path = core.station_tracker._PROFILE_PATH
        self.original_state_path = core.station_tracker._STATE_PATH
        core.station_tracker._PROFILE_PATH = self.patch_profile_path
        core.station_tracker._STATE_PATH = self.patch_state_path
        
        self.tracker = StationTracker()

    def tearDown(self):
        import core.station_tracker
        core.station_tracker._PROFILE_PATH = self.original_profile_path
        core.station_tracker._STATE_PATH = self.original_state_path
        shutil.rmtree(self.test_dir)

    def test_normalize_name(self):
        self.assertEqual(_normalize_name("London Victoria Platform 2"), "london victoria")
        self.assertEqual(_normalize_name("Birmingham New St"), "birmingham new street")
        self.assertEqual(_normalize_name("Station (Stop)"), "station")

    def test_odometer_integration(self):
        stops = [{"station_name": "Station A"}, {"station_name": "Station B"}]
        # Initial update to set stops
        self.tracker.update(0, 1, stops)
        
        # Manually simulate having departed from Station A
        self.tracker._last_departed_name = "Station A"
        self.tracker._completed_stops = 1
        self.tracker._odometer_at_last_departure = 0.0
        self.tracker._odometer_m = 0.0
        self.tracker._update_segment(self.tracker._get_stop_names(stops))
        
        # Segment dist should be 10000m
        self.assertEqual(self.tracker._segment_dist, 10000.0)
        
        # Move at 10m/s for 5 seconds = 50m
        dist = self.tracker.update(10, 5, stops)
        self.assertEqual(self.tracker._odometer_m, 50.0)
        # Remaining: 10000 - 50 = 9950
        self.assertAlmostEqual(dist, 9950.0)

    def test_stop_detection_speed_mode(self):
        stops = [{"station_name": "Station A"}, {"station_name": "Station B"}, {"station_name": "Station C"}]
        self.tracker.update(10, 1, stops) # Set initial stops
        
        # Stop for 15 seconds (more than DWELL_MIN_SECS=10)
        # Must use steps < 10s due to delta_t cap
        self.tracker.update(0, 8, stops)
        self.tracker.update(0, 8, stops)
        self.assertTrue(self.tracker._is_dwelling)
        
        # Depart
        self.tracker.update(5, 1, stops)
        self.assertEqual(self.tracker._completed_stops, 1)
        self.assertEqual(self.tracker._last_departed_name, "Station A")

    def test_stop_detection_door_mode(self):
        stops = [{"station_name": "Station A"}, {"station_name": "Station B"}]
        self.tracker.update(0, 1, stops)
        
        # Open doors for 3 seconds (more than DOOR_CONFIRM_SECS=2)
        self.tracker.update(0, 3, stops, door_l=1.0)
        self.assertTrue(self.tracker._has_doors)
        self.assertTrue(self.tracker._at_station_by_door)
        
        # Close doors and depart
        self.tracker.update(0, 1, stops, door_l=0.0)
        self.tracker.update(5, 1, stops)
        self.assertEqual(self.tracker._completed_stops, 1)

if __name__ == '__main__':
    unittest.main()
