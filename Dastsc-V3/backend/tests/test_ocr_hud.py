import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
from core import ocr_hud


class TestOCRHud(unittest.TestCase):
    def _parse_result(self, raw_text: str) -> dict:
        result = ocr_hud._parse(raw_text)
        self.assertIsNotNone(result)
        assert result is not None
        return result

    def test_parse_full_info(self):
        raw_text = """
        08:16:06
        Brighton
        2.45 miles
        @ 08:20:00
        ETA 08:19:45
        """
        result = self._parse_result(raw_text)

        self.assertEqual(result["station_name"], "Brighton")
        self.assertAlmostEqual(result["distance_m"], 3943, places=0)
        self.assertEqual(result["scheduled_time"], "08:20:00")
        self.assertEqual(result["eta"], "08:19:45")

    def test_parse_km(self):
        raw_text = """
        Paris Nord
        12.5 km
        @ 10:30
        """
        result = self._parse_result(raw_text)
        self.assertEqual(result["station_name"], "Paris Nord")
        self.assertEqual(result["distance_m"], 12500.0)
        self.assertEqual(result["scheduled_time"], "10:30")

    def test_parse_spanish_millas(self):
        raw_text = """
        Birmingham New Street
        1,2 millas
        @ 14:05
        """
        result = self._parse_result(raw_text)
        self.assertEqual(result["station_name"], "Birmingham New Street")
        self.assertAlmostEqual(result["distance_m"], 1931.2, places=0)

    def test_parse_meters(self):
        raw_text = """
        Stop A
        850 m
        """
        result = self._parse_result(raw_text)
        self.assertEqual(result["station_name"], "Stop A")
        self.assertEqual(result["distance_m"], 850.0)

    def test_parse_with_junk(self):
        raw_text = """
        15:45:10
        |  London Victoria
        0.5 miles
        """
        result = self._parse_result(raw_text)
        self.assertEqual(result["station_name"], "London Victoria")
        self.assertAlmostEqual(result["distance_m"], 805, places=0)

    def test_distance_only_is_valid(self):
        result = self._parse_result("3.2 miles")
        self.assertIsNone(result["station_name"])
        self.assertAlmostEqual(result["distance_m"], 5150, places=0)

    def test_invalid_text(self):
        self.assertIsNone(ocr_hud._parse("..."))

    def test_pure_time_is_not_station(self):
        self.assertIsNone(ocr_hud._parse("12:34:56"))

    def test_distance_to_meters(self):
        self.assertEqual(ocr_hud._distance_to_meters("2", "miles"), 3219)
        self.assertEqual(ocr_hud._distance_to_meters("1,5", "km"), 1500.0)
        self.assertEqual(ocr_hud._distance_to_meters("400", "m"), 400.0)
        self.assertEqual(ocr_hud._distance_to_meters("4,27", "km"), 4270.0)

    def test_parse_dropped_decimal_km(self):
        """OCR sin coma: 4,27 km leído como 427 km."""
        result = self._parse_result("Leipzig Hbf\n427 km\n@ 12:34")
        self.assertAlmostEqual(result["distance_m"], 4270.0, places=0)

    def test_parse_space_decimal_km(self):
        result = self._parse_result("Leipzig Hbf\n4 27 km\n@ 12:34")
        self.assertEqual(result["distance_m"], 4270)

    def test_parse_exact_decimal_km(self):
        result = self._parse_result("Leipzig Hbf\n4,27 km\n@ 12:34")
        self.assertEqual(result["distance_m"], 4270)

    def test_prefers_closer_distance_when_multiple(self):
        result = self._parse_result("Leipzig Hbf\n4,3 km\n3,95 km\n@ 12:34")
        self.assertEqual(result["distance_m"], 3950)

    def test_parse_kilometros_spanish(self):
        result = self._parse_result("Berlin\n12,5 kilómetros\nETA 14:00")
        self.assertEqual(result["distance_m"], 12500.0)

    def test_reject_implausible_distance(self):
        result = self._parse_result("Far Station\n9999 km")
        self.assertIsNone(result["distance_m"])

    def test_parse_leading_x_icon_as_station_prefix(self):
        raw_text = """
        13:49:55
        x Lichfield, andén 2
        1.16 millas
        @ 13:53:00
        """
        result = self._parse_result(raw_text)
        self.assertEqual(result["station_name"], "Lichfield, andén 2")

    def test_no_side_effects_on_import(self):
        self.assertFalse(ocr_hud._region_initialized)


if __name__ == "__main__":
    unittest.main()
