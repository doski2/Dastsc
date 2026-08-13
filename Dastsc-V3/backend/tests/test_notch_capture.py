import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.notch_capture import (  # noqa: E402
    apply_notches_to_profile,
    capture_notch,
    normalize_captured_notch_value,
    sort_notches,
    suggest_next_label,
)
from core.raildriver import ControllerInfo  # noqa: E402


class TestNotchCapture(unittest.TestCase):
    def test_normalize_combined_lever(self):
        ctrl = ControllerInfo(0, "ThrottleAndBrake", -0.286, -1.0, 1.0)
        self.assertEqual(normalize_captured_notch_value(-0.286, ctrl), -0.286)

    def test_normalize_independent_brake(self):
        ctrl = ControllerInfo(0, "TrainBrakeControl", 0.5, 0.0, 1.0)
        self.assertEqual(normalize_captured_notch_value(0.5, ctrl), -0.5)

    def test_capture_replaces_same_label(self):
        existing = [{"value": -0.25, "label": "B1"}]
        merged = capture_notch("B1", -0.14, "ThrottleAndBrake", existing)
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["value"], -0.14)

    def test_capture_dedupes_near_value(self):
        existing = [{"value": -0.25, "label": "B1"}]
        merged = capture_notch("B2", -0.26, "ThrottleAndBrake", existing)
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["label"], "B2")

    def test_sort_notches(self):
        items = [{"value": 0.0, "label": "OFF"}, {"value": -1.0, "label": "EMG"}]
        self.assertEqual(sort_notches(items)[0]["label"], "EMG")

    def test_suggest_next_label(self):
        self.assertEqual(suggest_next_label([]), "EMG")
        self.assertEqual(
            suggest_next_label([{"value": -1.0, "label": "EMG"}]),
            "B6",
        )

    def test_apply_notches_to_profile(self):
        profile = {"mappings": {"combined_control": "ThrottleAndBrake"}}
        updated = apply_notches_to_profile(
            profile,
            [{"value": -0.5, "label": "B2"}, {"value": 0.0, "label": "OFF"}],
            "ThrottleAndBrake",
        )
        self.assertEqual(len(updated["specs"]["notches_throttle_brake"]), 2)


if __name__ == "__main__":
    unittest.main()
