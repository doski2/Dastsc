import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.notch_capture import (  # noqa: E402
    apply_notches_to_profile,
    capture_notch,
    default_brake_control,
    normalize_captured_notch_value,
    normalize_notch_label,
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
        merged = capture_notch("B1", -0.14, "ThrottleAndBrake", existing).notches
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["value"], -0.14)

    def test_capture_dedupes_near_value(self):
        existing = [{"value": -0.25, "label": "B1"}]
        result = capture_notch("B2", -0.26, "ThrottleAndBrake", existing)
        self.assertEqual(len(result.notches), 1)
        self.assertEqual(result.notches[0]["label"], "B2")
        self.assertEqual(result.evicted_labels, ("B1",))

    def test_expert_profile_keeps_all_labels_with_same_value(self):
        profile = {"id": "class350_expert_wcml"}
        existing = [{"value": -0.3, "label": "20%"}]
        result = capture_notch("30%", -0.31, "TrainBrakeControl", existing, profile)
        self.assertEqual(len(result.notches), 2)
        self.assertEqual(result.evicted_labels, ())
        self.assertIn("20%", result.duplicate_value_labels)

    def test_normalize_expert_percent_label(self):
        profile = {"name": "Class 350 Expert WCML"}
        self.assertEqual(normalize_notch_label("10", profile), "10%")
        self.assertEqual(normalize_notch_label("100%", profile), "100%")
        self.assertEqual(normalize_notch_label("init", profile), "INIT")
        self.assertEqual(normalize_notch_label("B1", profile), "B1")

    def test_capture_expert_adds_percent_to_numeric_label(self):
        profile = {"id": "class350_expert_wcml"}
        result = capture_notch("50", -0.5, "TrainBrakeControl", [], profile)
        self.assertEqual(result.notches[0]["label"], "50%")

    def test_sort_notches(self):
        items = [{"value": 0.0, "label": "OFF"}, {"value": -1.0, "label": "EMG"}]
        self.assertEqual(sort_notches(items)[0]["label"], "EMG")

    def test_suggest_next_label(self):
        self.assertEqual(suggest_next_label([]), "EMG")
        self.assertEqual(
            suggest_next_label([{"value": -1.0, "label": "EMG"}]),
            "B6",
        )

    def test_suggest_next_label_class350_expert(self):
        profile = {"id": "class350_expert_wcml", "name": "Class350 Expert WCML"}
        self.assertEqual(suggest_next_label([], profile), "OFF")
        captured = [{"value": 0.0, "label": "OFF"}, {"value": -0.05, "label": "INIT"}]
        self.assertEqual(suggest_next_label(captured, profile), "10%")

    def test_default_brake_control_prefers_train_brake_for_350_expert(self):
        from core.raildriver import ControllerInfo, RailDriverSnapshot

        snap = RailDriverSnapshot(
            loco_names=["350"],
            controllers=[
                ControllerInfo(0, "ThrottleAndBrake", 0.0, -1.0, 1.0),
                ControllerInfo(1, "TrainBrakeControl", 0.0, 0.0, 1.0),
            ],
        )
        profile = {"id": "class350_expert_wcml"}
        self.assertEqual(default_brake_control(snap, profile), "TrainBrakeControl")

    def test_apply_notches_to_profile(self):
        profile = {"mappings": {"combined_control": "ThrottleAndBrake"}}
        updated = apply_notches_to_profile(
            profile,
            [{"value": -0.5, "label": "B2"}, {"value": 0.0, "label": "OFF"}],
            "ThrottleAndBrake",
        )
        self.assertEqual(len(updated["specs"]["notches_throttle_brake"]), 2)

    def test_apply_train_brake_notches_sets_brakes_block(self):
        profile = {"mappings": {"combined_control": "ThrottleAndBrake"}}
        updated = apply_notches_to_profile(
            profile,
            [
                {"value": -1.0, "label": "EMG"},
                {"value": -0.5, "label": "50%"},
                {"value": -0.05, "label": "INIT"},
                {"value": 0.0, "label": "OFF"},
            ],
            "TrainBrakeControl",
        )
        self.assertEqual(updated["mappings"]["train_brake"], "TrainBrakeControl")
        self.assertEqual(updated["brakes"]["train_control"], "TrainBrakeControl")
        self.assertEqual(len(updated["specs"]["notches_throttle_brake"]), 4)


if __name__ == "__main__":
    unittest.main()
