import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.station_distance import (
    StationDistanceTracker,
    mid_leg_checkpoint_count,
    normalize_lua_station_distance,
    speed_ms_from_telemetry,
)


class TestStationDistanceTracker(unittest.TestCase):
    def _advance(self, tracker: StationDistanceTracker, speed: float, seconds: float) -> None:
        steps = int(seconds / 0.05)
        now = 0.0
        tracker.integrate(0.0, now)
        for _ in range(steps):
            now += 0.05
            tracker.integrate(speed, now)

    def test_distance_decreases_with_travel(self):
        tracker = StationDistanceTracker()
        tracker.integrate(0.0, 0.0)
        tracker.anchor_from_ocr(1609.34, event="door_anchor", now=0.0)
        self._advance(tracker, 20.0, 10.0)
        dist = tracker.distance_m()
        self.assertIsNotNone(dist)
        assert dist is not None
        self.assertAlmostEqual(dist, 1609.34 - 20.0 * 10.0, delta=2.0)

    def test_new_ocr_resets_anchor(self):
        tracker = StationDistanceTracker()
        tracker.integrate(0.0, 0.0)
        tracker.anchor_from_ocr(1000.0, event="door_anchor", now=0.0)
        self._advance(tracker, 10.0, 5.0)
        tracker.anchor_from_ocr(800.0, event="near_correction", now=5.0)
        dist = tracker.distance_m()
        self.assertIsNotNone(dist)
        assert dist is not None
        self.assertAlmostEqual(dist, 800.0, delta=0.1)

    def test_records_samples(self):
        tracker = StationDistanceTracker()
        tracker.integrate(0.0, 0.0)
        tracker.anchor_from_ocr(1000.0, event="door_anchor", now=0.0)
        tracker.maybe_record_sample(6.0, 15.0)
        self.assertEqual(len(tracker.debug_payload()["samples"]), 2)

    def test_near_correction_request(self):
        tracker = StationDistanceTracker()
        tracker.integrate(0.0, 0.0)
        tracker.anchor_from_ocr(500.0, event="door_anchor", now=0.0)
        self._advance(tracker, 15.0, 15.0)
        self.assertTrue(tracker.should_request_near_correction())

    def test_speed_ms_prefers_current_speed(self):
        data = {"CurrentSpeed": 25.0, "Speed": 60.0, "SpeedoType": 1}
        self.assertAlmostEqual(speed_ms_from_telemetry(data), 25.0)

    def test_normalize_lua_km_value(self):
        self.assertEqual(normalize_lua_station_distance(3.95), 3950)

    def test_normalize_lua_meters_value(self):
        self.assertEqual(normalize_lua_station_distance(3950.0), 3950)

    def test_sync_lua_reanchors_on_drift(self):
        tracker = StationDistanceTracker()
        tracker.integrate(0.0, 0.0)
        tracker.anchor_from_ocr(4300.0, event="door_anchor", now=0.0)
        self.assertTrue(tracker.sync_lua_distance(3950.0, now=1.0))
        dist = tracker.distance_m()
        self.assertIsNotNone(dist)
        assert dist is not None
        self.assertAlmostEqual(dist, 3950.0, delta=0.1)

    def test_mid_leg_checkpoint_count(self):
        self.assertEqual(mid_leg_checkpoint_count(4000.0), 0)
        self.assertEqual(mid_leg_checkpoint_count(6000.0), 1)
        self.assertEqual(mid_leg_checkpoint_count(10000.0), 1)
        self.assertEqual(mid_leg_checkpoint_count(15000.0), 2)
        self.assertEqual(mid_leg_checkpoint_count(20000.0), 3)
        self.assertEqual(mid_leg_checkpoint_count(50000.0), 3)

    def test_mid_leg_not_requested_for_short_leg(self):
        tracker = StationDistanceTracker()
        tracker.integrate(0.0, 0.0)
        tracker.anchor_from_ocr(4000.0, event="door_anchor", now=0.0)
        self._advance(tracker, 20.0, 100.0)
        self.assertFalse(tracker.should_request_mid_leg_correction(15.0, 200.0))

    def test_mid_leg_requested_at_milestone(self):
        tracker = StationDistanceTracker()
        tracker.integrate(0.0, 0.0)
        tracker.anchor_from_ocr(20000.0, event="door_anchor", now=0.0)
        self._advance(tracker, 25.0, 199.0)
        self.assertFalse(tracker.should_request_mid_leg_correction(15.0, 70.0))
        self._advance(tracker, 25.0, 1.0)
        self.assertTrue(tracker.should_request_mid_leg_correction(15.0, 70.0))

    def test_mid_leg_rejects_distance_jump(self):
        tracker = StationDistanceTracker()
        tracker.integrate(0.0, 0.0)
        tracker.anchor_from_ocr(10000.0, event="door_anchor", now=0.0)
        self._advance(tracker, 20.0, 250.0)
        accepted = tracker.anchor_from_ocr(
            4980.0,
            event="mid_leg_correction",
            now=250.0,
        )
        self.assertTrue(accepted)
        rejected = tracker.anchor_from_ocr(
            9900.0,
            event="mid_leg_correction",
            now=251.0,
        )
        self.assertFalse(rejected)


if __name__ == "__main__":
    unittest.main()
