import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.station_distance import (
    StationDistanceTracker,
    mid_leg_checkpoint_count,
    normalize_lua_station_distance,
    should_clear_on_departure_intent,
    should_clear_on_turnaround,
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

    def test_near_correction_marks_attempted(self):
        tracker = StationDistanceTracker()
        tracker.integrate(0.0, 0.0)
        tracker.anchor_from_ocr(500.0, event="door_anchor", now=0.0)
        self._advance(tracker, 15.0, 15.0)
        tracker.mark_near_correction_attempted(10.0)
        self.assertFalse(tracker.should_request_near_correction())

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

    def test_mid_leg_accepts_upward_odometer_drift(self):
        """Sesión WCML 390: HUD ~13 mi vs odómetro ~13.0 mi (+150 m en tramo largo)."""
        tracker = StationDistanceTracker()
        tracker.integrate(0.0, 0.0)
        tracker.anchor_from_ocr(27825.0, event="door_anchor", now=0.0)
        self._advance(tracker, 25.0, 300.0)
        computed = tracker.distance_m()
        assert computed is not None
        ocr_reading = computed + 146.0
        self.assertTrue(
            tracker.should_accept_ocr_distance(
                ocr_reading,
                "mid_leg_correction",
                speed_ms=25.0,
            ),
        )
        accepted = tracker.anchor_from_ocr(
            ocr_reading,
            event="mid_leg_correction",
            now=300.0,
            speed_ms=25.0,
        )
        self.assertTrue(accepted)
        self.assertAlmostEqual(tracker.distance_m() or 0, ocr_reading, delta=0.5)

    def test_mid_leg_rejects_excessive_upward_spike(self):
        tracker = StationDistanceTracker()
        tracker.integrate(0.0, 0.0)
        tracker.anchor_from_ocr(20000.0, event="door_anchor", now=0.0)
        self._advance(tracker, 20.0, 500.0)
        computed = tracker.distance_m()
        assert computed is not None
        self.assertFalse(
            tracker.should_accept_ocr_distance(
                computed + 800.0,
                "mid_leg_correction",
                speed_ms=20.0,
            ),
        )

    def test_watford_leg_simulation_reduces_late_drift(self):
        """Corrección mid-leg al alza recupera metros que el odómetro adelantó."""
        tracker = StationDistanceTracker()
        tracker.integrate(0.0, 0.0)
        tracker.anchor_from_ocr(27825.0, event="door_anchor", now=0.0)
        self._advance(tracker, 25.0, 280.0)
        before = tracker.distance_m()
        assert before is not None
        tracker.anchor_from_ocr(
            before + 120.0,
            event="mid_leg_correction",
            now=280.0,
            speed_ms=25.0,
        )
        after = tracker.distance_m()
        assert after is not None
        self.assertAlmostEqual(after - before, 120.0, delta=0.5)

    def test_rejects_turnaround_door_anchor_at_platform(self):
        tracker = StationDistanceTracker()
        tracker.integrate(0.0, 0.0)
        tracker.anchor_from_ocr(0.0, event="door_anchor", now=0.0)
        self._advance(tracker, 0.0, 5.0)
        accepted = tracker.anchor_from_ocr(97.0, event="door_anchor", now=5.0)
        self.assertFalse(accepted)
        dist = tracker.distance_m()
        self.assertIsNotNone(dist)
        assert dist is not None
        self.assertAlmostEqual(dist, 0.0, delta=0.1)

    def test_accepts_door_anchor_after_platform_when_next_leg_is_far(self):
        tracker = StationDistanceTracker()
        tracker.integrate(0.0, 0.0)
        tracker.anchor_from_ocr(0.0, event="door_anchor", now=0.0)
        accepted = tracker.anchor_from_ocr(850.0, event="door_anchor", now=1.0)
        self.assertTrue(accepted)
        dist = tracker.distance_m()
        self.assertIsNotNone(dist)
        assert dist is not None
        self.assertAlmostEqual(dist, 850.0, delta=0.1)

    def test_should_clear_on_cab_flip_near_platform(self):
        self.assertTrue(
            should_clear_on_turnaround(
                speed_ms=0.5,
                tracked_dist_m=97.0,
                active_cab=2,
                reversal=1.0,
                last_active_cab=1,
                last_reversal=1.0,
            ),
        )

    def test_should_not_clear_on_cab_flip_at_speed(self):
        self.assertFalse(
            should_clear_on_turnaround(
                speed_ms=8.0,
                tracked_dist_m=97.0,
                active_cab=2,
                reversal=1.0,
                last_active_cab=1,
                last_reversal=1.0,
            ),
        )

    def test_should_clear_on_departure_intent_at_terminus(self):
        self.assertTrue(
            should_clear_on_departure_intent(
                speed_ms=1.35,
                tracked_dist_m=0.0,
                combined_control=0.25,
            ),
        )
        self.assertTrue(
            should_clear_on_departure_intent(
                speed_ms=1.35,
                tracked_dist_m=26.0,
                combined_control=0.25,
            ),
        )
        self.assertFalse(
            should_clear_on_departure_intent(
                speed_ms=0.0,
                tracked_dist_m=0.0,
                combined_control=0.25,
            ),
        )

    def test_should_not_clear_on_departure_during_approach(self):
        """Tracción ligera a >35 m no debe borrar ancla (sesión 2026-08-13)."""
        self.assertFalse(
            should_clear_on_departure_intent(
                speed_ms=9.15,
                tracked_dist_m=134.0,
                combined_control=0.25,
            ),
        )
        self.assertFalse(
            should_clear_on_departure_intent(
                speed_ms=1.35,
                tracked_dist_m=80.0,
                combined_control=0.25,
            ),
        )

    def test_accepts_near_correction_moderate_upward_drift(self):
        tracker = StationDistanceTracker()
        tracker.integrate(0.0, 0.0)
        tracker.anchor_from_ocr(1867.0, event="door_anchor", now=0.0)
        self._advance(tracker, 15.0, 98.0)
        computed = tracker.distance_m()
        assert computed is not None
        accepted = tracker.anchor_from_ocr(computed + 24.3, event="near_correction", now=98.0)
        self.assertTrue(accepted)

    def test_accepts_near_correction_brincliffe_session_drift(self):
        """Sesión 2026-08-13: OCR 499 m vs odómetro 385 m (+114 m)."""
        tracker = StationDistanceTracker()
        tracker.integrate(0.0, 0.0)
        tracker.anchor_from_ocr(1287.0, event="door_anchor", now=0.0)
        self._advance(tracker, 20.0, 45.0)
        computed = tracker.distance_m()
        assert computed is not None
        self.assertAlmostEqual(computed, 387.0, delta=5.0)
        accepted = tracker.anchor_from_ocr(499.0, event="near_correction", now=45.0, speed_ms=20.0)
        self.assertTrue(accepted)
        self.assertAlmostEqual(tracker.distance_m() or 0, 499.0, delta=0.5)

    def test_accepts_near_correction_when_stopped_short(self):
        tracker = StationDistanceTracker()
        tracker.integrate(0.0, 0.0)
        tracker.anchor_from_ocr(1287.0, event="door_anchor", now=0.0)
        self._advance(tracker, 20.0, 61.0)
        computed = tracker.distance_m()
        assert computed is not None
        self.assertTrue(
            tracker.should_accept_ocr_distance(161.0, "near_correction", speed_ms=0.0),
        )

    def test_should_retry_near_correction_on_moderate_rejection(self):
        tracker = StationDistanceTracker()
        tracker.integrate(0.0, 0.0)
        tracker.anchor_from_ocr(500.0, event="door_anchor", now=0.0)
        self._advance(tracker, 15.0, 7.7)
        computed = tracker.distance_m()
        assert computed is not None
        self.assertAlmostEqual(computed, 385.0, delta=5.0)
        self.assertTrue(tracker.should_retry_near_correction(computed + 24.0))
        self.assertTrue(tracker.should_retry_near_correction(computed + 114.0, speed_ms=20.0))
        self.assertFalse(tracker.should_retry_near_correction(computed + 130.0, speed_ms=20.0))

    def test_rejects_platform_near_correction_spike(self):
        tracker = StationDistanceTracker()
        tracker.integrate(0.0, 0.0)
        tracker.anchor_from_ocr(500.0, event="door_anchor", now=0.0)
        self._advance(tracker, 15.0, 31.0)
        self.assertFalse(tracker.should_accept_ocr_distance(97.0, "near_correction", speed_ms=0.5))

    def test_short_stop_requests_near_correction(self):
        tracker = StationDistanceTracker()
        tracker.integrate(0.0, 0.0)
        tracker.anchor_from_ocr(1287.0, event="door_anchor", now=0.0)
        self._advance(tracker, 20.0, 61.0)
        tracker.mark_near_correction_attempted(61.0)
        self.assertTrue(tracker.should_request_near_correction(speed_ms=0.0, now=80.0))

    def test_rejects_short_door_anchor_after_turnaround_clear(self):
        tracker = StationDistanceTracker()
        tracker.clear()
        self.assertTrue(tracker._awaiting_far_anchor)
        accepted = tracker.anchor_from_ocr(129.0, event="door_anchor", now=1.0)
        self.assertFalse(accepted)
        accepted_far = tracker.anchor_from_ocr(850.0, event="door_anchor", now=2.0)
        self.assertTrue(accepted_far)
        self.assertFalse(tracker._awaiting_far_anchor)

    def test_accepts_near_correction_when_ocr_is_closer(self):
        tracker = StationDistanceTracker()
        tracker.integrate(0.0, 0.0)
        tracker.anchor_from_ocr(500.0, event="door_anchor", now=0.0)
        self._advance(tracker, 15.0, 20.0)
        computed = tracker.distance_m()
        assert computed is not None
        accepted = tracker.anchor_from_ocr(computed - 20.0, event="near_correction", now=20.0)
        self.assertTrue(accepted)
        dist = tracker.distance_m()
        assert dist is not None
        self.assertAlmostEqual(dist, computed - 20.0, delta=0.1)

    def test_arrival_resets_near_correction_when_stopped_short(self):
        tracker = StationDistanceTracker()
        tracker.integrate(0.0, 0.0)
        tracker.anchor_from_ocr(500.0, event="door_anchor", now=0.0)
        self._advance(tracker, 15.0, 31.0)
        self._advance(tracker, 1.0, 10.0)
        tracker.mark_near_correction_attempted(41.0)
        self.assertFalse(tracker.should_request_near_correction())
        tracker.maybe_record_sample(47.0, 0.0)
        self.assertTrue(tracker.should_request_near_correction())


if __name__ == "__main__":
    unittest.main()
