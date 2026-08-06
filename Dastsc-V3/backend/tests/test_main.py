import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import json
import math
import shutil
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

import main
from main import (
    TelemetryManager,
    _apply_ocr_metadata,
    _apply_station_distance,
    _doors_open,
    _resolve_getdata_path,
    _resolve_profiles_dir,
    _sanitize,
)
from core.station_distance import StationDistanceTracker


class TestMainHelpers(unittest.TestCase):
    def test_sanitize_finite_float(self):
        self.assertEqual(_sanitize(3.14), 3.14)

    def test_sanitize_non_finite(self):
        self.assertEqual(_sanitize(float("inf")), 0.0)
        self.assertEqual(_sanitize(float("-inf")), 0.0)
        self.assertEqual(_sanitize(float("nan")), 0.0)

    def test_sanitize_nested(self):
        payload = {"speed": float("inf"), "nested": [{"x": float("nan")}]}
        out = _sanitize(payload)
        self.assertEqual(out["speed"], 0.0)
        self.assertEqual(out["nested"][0]["x"], 0.0)
        self.assertTrue(math.isfinite(out["speed"]))

    def test_resolve_profiles_dir_first_match(self):
        base = tempfile.mkdtemp()
        try:
            profiles = os.path.join(base, "profiles")
            os.makedirs(profiles)
            missing = os.path.join(base, "missing")
            resolved = _resolve_profiles_dir([missing, profiles, "/nonexistent"])
            self.assertEqual(resolved, profiles)
        finally:
            shutil.rmtree(base)

    def test_resolve_profiles_dir_fallback(self):
        resolved = _resolve_profiles_dir(["/nonexistent/path/xyz"])
        self.assertEqual(resolved, main._DEFAULT_PROFILES_DIR)

    def test_resolve_getdata_path(self):
        base = tempfile.mkdtemp()
        try:
            plugin = os.path.join(base, "plugin.txt")
            alt = os.path.join(base, "alt.txt")
            with open(plugin, "w", encoding="utf-8") as f:
                f.write("test")
            self.assertEqual(_resolve_getdata_path(plugin, alt), plugin)
            os.remove(plugin)
            with open(alt, "w", encoding="utf-8") as f:
                f.write("test")
            self.assertEqual(_resolve_getdata_path(plugin, alt), alt)
            os.remove(alt)
            self.assertIsNone(_resolve_getdata_path(plugin, alt))
        finally:
            shutil.rmtree(base)

    def test_doors_open(self):
        self.assertFalse(_doors_open(0.0, 0.0))
        self.assertTrue(_doors_open(0.6, 0.0))
        self.assertTrue(_doors_open(0.0, 0.6))

    def test_apply_ocr_metadata_and_station_distance(self):
        data: dict = {}
        _apply_ocr_metadata(data, {
            "distance_m": 1234.56,
            "station_name": "Birmingham",
            "eta": "12:34",
            "scheduled_time": "12:30",
        })
        self.assertNotIn("StationDistance", data)
        self.assertEqual(data["StationNameOCR"], "Birmingham")
        self.assertEqual(data["StationETA"], "12:34")
        self.assertEqual(data["StationScheduled"], "12:30")

        tracker = StationDistanceTracker()
        tracker.integrate(0.0, 0.0)
        tracker.anchor_from_ocr(1234.56, event="door_anchor", now=0.0)
        _apply_station_distance(data, tracker)
        self.assertEqual(data["StationDistance"], 1234.6)
        self.assertEqual(data["StationAnchorM"], 1234.6)
        now = 0.0
        for _ in range(100):
            now += 0.05
            tracker.integrate(20.0, now)
        _apply_station_distance(data, tracker)
        self.assertLess(data["StationDistance"], 1234.6)
        self.assertGreater(data["StationTraveledM"], 0)


class TestTelemetryManager(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        with open(os.path.join(self.test_dir, "test.json"), "w", encoding="utf-8") as f:
            json.dump({"name": "Test Loco"}, f)
        self.manager = TelemetryManager(profiles_dir=self.test_dir)

    def tearDown(self):
        shutil.rmtree(self.test_dir)

    def test_init_payload(self):
        payload = self.manager._build_init_payload()
        self.assertEqual(payload["type"], "INIT")
        self.assertEqual(len(payload["available_profiles"]), 1)
        self.assertIsNone(payload["active_profile_id"])

    async def _test_select_profile(self):
        await self.manager.handle_command({"type": "SELECT_PROFILE", "profile_id": "test"})
        profile = self.manager.current_profile
        self.assertIsNotNone(profile)
        assert profile is not None
        self.assertEqual(profile["id"], "test")
        payload = self.manager._build_init_payload()
        self.assertEqual(payload["active_profile_id"], "test")

    def test_handle_select_profile(self):
        import asyncio
        asyncio.run(self._test_select_profile())

    def test_handle_invalid_profile(self):
        import asyncio
        asyncio.run(self.manager.handle_command({"type": "SELECT_PROFILE", "profile_id": "missing"}))
        self.assertIsNone(self.manager.current_profile)


def _suppress_create_task(coro):
    if hasattr(coro, "close"):
        coro.close()
    return MagicMock()


class TestBrakeApi(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.original_log = main.brake_log._LOG_FILE
        self.original_data_dir = main.brake_log._DATA_DIR
        main.brake_log._LOG_FILE = os.path.join(self.test_dir, "brake_events.json")
        main.brake_log._DATA_DIR = self.test_dir

    def tearDown(self):
        main.brake_log._LOG_FILE = self.original_log
        main.brake_log._DATA_DIR = self.original_data_dir
        shutil.rmtree(self.test_dir)

    @patch("main.asyncio.create_task", side_effect=_suppress_create_task)
    def test_brake_event_endpoint(self, _mock_task):
        with TestClient(main.app) as client:
            res = client.post("/api/brake/event", json={
                "profile": "class323",
                "notch": "B2",
                "avg_decel_ms2": 0.6,
                "duration_s": 20.0,
            })
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body["ok"])
        self.assertFalse(body["rejected"])

    @patch("main.asyncio.create_task", side_effect=_suppress_create_task)
    def test_brake_rejects_invalid(self, _mock_task):
        with TestClient(main.app) as client:
            res = client.post("/api/brake/event", json={
                "profile": "class323",
                "notch": "?",
                "avg_decel_ms2": 0.6,
                "duration_s": 20.0,
            })
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertFalse(body["ok"])
        self.assertTrue(body["rejected"])


if __name__ == "__main__":
    unittest.main()
