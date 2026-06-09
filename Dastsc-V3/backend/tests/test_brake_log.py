import sys
import os
# Añadir el directorio backend al path para que core sea importable
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
import json
import shutil
import tempfile
from core import brake_log

class TestBrakeLog(unittest.TestCase):
    def setUp(self):
        # Create a temporary directory for tests
        self.test_dir = tempfile.mkdtemp()
        self.patch_log_file = os.path.join(self.test_dir, "brake_events.json")
        self.patch_data_dir = self.test_dir
        
        # Patch the constants in brake_log
        self.original_log_file = brake_log._LOG_FILE
        self.original_data_dir = brake_log._DATA_DIR
        brake_log._LOG_FILE = self.patch_log_file
        brake_log._DATA_DIR = self.patch_data_dir

    def tearDown(self):
        # Restore original constants
        brake_log._LOG_FILE = self.original_log_file
        brake_log._DATA_DIR = self.original_data_dir
        # Remove temporary directory
        shutil.rmtree(self.test_dir)

    def test_append_and_get_events(self):
        event = {
            "profile": "test_train",
            "notch": "B2",
            "avg_decel_ms2": 0.5,
            "timestamp": 123456789
        }
        brake_log.append_event(event)
        
        events = brake_log.get_events()
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["profile"], "test_train")

    def test_get_events_limit(self):
        for i in range(10):
            brake_log.append_event({"val": i})
        
        events = brake_log.get_events(limit=5)
        self.assertEqual(len(events), 5)
        self.assertEqual(events[-1]["val"], 9)

    def test_get_stats(self):
        events = [
            {"notch": "B1", "avg_decel_ms2": 0.2, "profile": "p1"},
            {"notch": "B1", "avg_decel_ms2": 0.4, "profile": "p1"},
            {"notch": "B2", "avg_decel_ms2": 0.6, "profile": "p1"},
            {"notch": "B1", "avg_decel_ms2": 0.5, "profile": "p2"}, # Different profile
        ]
        for e in events:
            brake_log.append_event(e)
            
        stats = brake_log.get_stats(profile="p1")
        self.assertEqual(stats["total_events"], 3)
        self.assertIn("B1", stats["by_notch"])
        self.assertIn("B2", stats["by_notch"])
        
        # B1 avg: (0.2 + 0.4) / 2 = 0.3
        self.assertEqual(stats["by_notch"]["B1"]["avg_decel"], 0.3)
        self.assertEqual(stats["by_notch"]["B1"]["samples"], 2)

if __name__ == '__main__':
    unittest.main()
