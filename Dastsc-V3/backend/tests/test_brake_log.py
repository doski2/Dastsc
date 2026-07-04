import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
import shutil
import tempfile
from core import brake_log


def _valid_event(**overrides):
  base = {
      "profile": "class323",
      "notch": "B2",
      "avg_decel_ms2": 0.6,
      "duration_s": 20.0,
      "timestamp": 123456789,
  }
  base.update(overrides)
  return base


class TestBrakeLog(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.patch_log_file = os.path.join(self.test_dir, "brake_events.json")
        self.original_log_file = brake_log._LOG_FILE
        self.original_data_dir = brake_log._DATA_DIR
        brake_log._LOG_FILE = self.patch_log_file
        brake_log._DATA_DIR = self.test_dir

    def tearDown(self):
        brake_log._LOG_FILE = self.original_log_file
        brake_log._DATA_DIR = self.original_data_dir
        shutil.rmtree(self.test_dir)

    def test_append_and_get_events(self):
        self.assertTrue(brake_log.append_event(_valid_event(profile="test_train")))
        events = brake_log.get_events()
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["profile"], "test_train")

    def test_rejects_invalid_events(self):
        self.assertFalse(brake_log.append_event({"notch": "?", "avg_decel_ms2": 0.5, "duration_s": 10}))
        self.assertFalse(brake_log.append_event(_valid_event(notch="B1", avg_decel_ms2=0.05)))
        self.assertFalse(brake_log.append_event(_valid_event(duration_s=400)))
        self.assertEqual(len(brake_log.get_events()), 0)

    def test_get_events_limit(self):
        for i in range(10):
            brake_log.append_event(_valid_event(notch="B1", avg_decel_ms2=0.2 + i * 0.01, val=i))

        events = brake_log.get_events(limit=5)
        self.assertEqual(len(events), 5)
        self.assertEqual(events[-1]["val"], 9)

    def test_max_events_cap(self):
        original_max = brake_log._MAX_EVENTS
        try:
            brake_log._MAX_EVENTS = 3
            for i in range(5):
                brake_log.append_event(_valid_event(val=i))
            events = brake_log.get_events(limit=10)
            self.assertEqual(len(events), 3)
            self.assertEqual(events[0]["val"], 2)
            self.assertEqual(events[-1]["val"], 4)
        finally:
            brake_log._MAX_EVENTS = original_max

    def test_get_stats(self):
        events = [
            _valid_event(notch="B1", avg_decel_ms2=0.2, profile="p1"),
            _valid_event(notch="B1", avg_decel_ms2=0.4, profile="p1"),
            _valid_event(notch="B2", avg_decel_ms2=0.6, profile="p1"),
            _valid_event(notch="B1", avg_decel_ms2=0.5, profile="p2"),
        ]
        for e in events:
            brake_log.append_event(e)

        stats = brake_log.get_stats(profile="p1")
        self.assertEqual(stats["total_events"], 3)
        self.assertIn("B1", stats["by_notch"])
        self.assertIn("B2", stats["by_notch"])
        self.assertEqual(stats["by_notch"]["B1"]["avg_decel"], 0.3)
        self.assertEqual(stats["by_notch"]["B1"]["samples"], 2)

    def test_purge_invalid(self):
        brake_log._save([
            _valid_event(notch="B2"),
            {"notch": "?", "avg_decel_ms2": 0.5, "duration_s": 10},
            _valid_event(notch="B1", avg_decel_ms2=0.05),
        ])
        removed = brake_log.purge_invalid()
        self.assertEqual(removed, 2)
        self.assertEqual(len(brake_log.get_events()), 1)


if __name__ == '__main__':
    unittest.main()
