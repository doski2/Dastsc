import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
from core import ocr_hud


class TestOCRHud(unittest.TestCase):
    def test_parse_full_info(self):
        raw_text = """
        08:16:06
        Brighton
        2.45 miles
        @ 08:20:00
        ETA 08:19:45
        """
        result = ocr_hud._parse(raw_text)

        self.assertIsNotNone(result)
        self.assertEqual(result["station_name"], "Brighton")
        self.assertAlmostEqual(result["distance_m"], 3942.9, places=1)
        self.assertEqual(result["scheduled_time"], "08:20:00")
        self.assertEqual(result["eta"], "08:19:45")

    def test_parse_km(self):
        raw_text = """
        Paris Nord
        12.5 km
        @ 10:30
        """
        result = ocr_hud._parse(raw_text)
        self.assertEqual(result["station_name"], "Paris Nord")
        self.assertEqual(result["distance_m"], 12500.0)
        self.assertEqual(result["scheduled_time"], "10:30")

    def test_parse_spanish_millas(self):
        raw_text = """
        Birmingham New Street
        1,2 millas
        @ 14:05
        """
        result = ocr_hud._parse(raw_text)
        self.assertEqual(result["station_name"], "Birmingham New Street")
        self.assertAlmostEqual(result["distance_m"], 1931.2, places=0)

    def test_parse_meters(self):
        raw_text = """
        Stop A
        850 m
        """
        result = ocr_hud._parse(raw_text)
        self.assertEqual(result["station_name"], "Stop A")
        self.assertEqual(result["distance_m"], 850.0)

    def test_parse_with_junk(self):
        raw_text = """
        15:45:10
        |  London Victoria
        0.5 miles
        """
        result = ocr_hud._parse(raw_text)
        self.assertEqual(result["station_name"], "London Victoria")
        self.assertAlmostEqual(result["distance_m"], 804.7, places=1)

    def test_distance_only_is_valid(self):
        result = ocr_hud._parse("3.2 miles")
        self.assertIsNotNone(result)
        self.assertIsNone(result["station_name"])
        self.assertAlmostEqual(result["distance_m"], 5149.9, places=0)

    def test_invalid_text(self):
        self.assertIsNone(ocr_hud._parse("..."))

    def test_pure_time_is_not_station(self):
        self.assertIsNone(ocr_hud._parse("12:34:56"))

    def test_distance_to_meters(self):
        self.assertEqual(ocr_hud._distance_to_meters("2", "miles"), 3218.7)
        self.assertEqual(ocr_hud._distance_to_meters("1,5", "km"), 1500.0)
        self.assertEqual(ocr_hud._distance_to_meters("400", "m"), 400.0)

    def test_no_side_effects_on_import(self):
        self.assertFalse(ocr_hud._region_initialized)


if __name__ == "__main__":
    unittest.main()
