import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import math
import unittest
from core import parser


class TestParser(unittest.TestCase):
    def test_parse_telemetry_line(self):
        line = "Speed:45.5|Distance:1200|Signal:Red|Empty:|Inf:inf"
        result = parser.parse_telemetry_line(line)

        self.assertEqual(result["Speed"], 45.5)
        self.assertEqual(result["Distance"], 1200.0)
        self.assertEqual(result["Signal"], "Red")
        self.assertEqual(result["Empty"], "")
        self.assertEqual(result["Inf"], 0.0)

    def test_empty_line(self):
        self.assertEqual(parser.parse_telemetry_line(""), {})
        self.assertEqual(parser.parse_telemetry_line("no_pipe_here"), {})

    def test_malformed_token(self):
        line = "Valid:1|Malformed|AlsoValid:2"
        result = parser.parse_telemetry_line(line)
        self.assertEqual(result["Valid"], 1.0)
        self.assertEqual(result["AlsoValid"], 2.0)
        self.assertNotIn("Malformed", result)

    def test_nan_becomes_zero(self):
        result = parser.parse_telemetry_line("Limit:nan|Speed:10")
        self.assertEqual(result["Limit"], 0.0)
        self.assertEqual(result["Speed"], 10.0)

    def test_negative_and_integer(self):
        result = parser.parse_telemetry_line("ThrottleAndBrake:-0.5|DoorL:0")
        self.assertEqual(result["ThrottleAndBrake"], -0.5)
        self.assertEqual(result["DoorL"], 0.0)

    def test_rv_with_suffix(self):
        result = parser.parse_telemetry_line("Speed:10|RV:323241_65041;Dest=53")
        self.assertEqual(result["RV"], "323241_65041;Dest=53")

    def test_value_with_extra_colon_stays_string(self):
        result = parser.parse_telemetry_line("Meta:1:2|Speed:5")
        self.assertEqual(result["Meta"], "1:2")
        self.assertEqual(result["Speed"], 5.0)

    def test_coerce_value(self):
        self.assertEqual(parser._coerce_value("42"), 42.0)
        self.assertEqual(parser._coerce_value("inf"), 0.0)
        self.assertTrue(math.isnan(float("nan")) and parser._coerce_value("nan") == 0.0)
        self.assertEqual(parser._coerce_value("Red"), "Red")

    def test_strips_outer_whitespace(self):
        result = parser.parse_telemetry_line("  Speed:10|Signal:Green  ")
        self.assertEqual(result["Speed"], 10.0)
        self.assertEqual(result["Signal"], "Green")


if __name__ == "__main__":
    unittest.main()
