import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

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
        self.assertEqual(result["Inf"], 0.0) # Inf should be converted to 0.0

    def test_empty_line(self):
        self.assertEqual(parser.parse_telemetry_line(""), {})
        self.assertEqual(parser.parse_telemetry_line("no_pipe_here"), {})

    def test_malformed_token(self):
        line = "Valid:1|Malformed|AlsoValid:2"
        result = parser.parse_telemetry_line(line)
        self.assertEqual(result["Valid"], 1.0)
        self.assertEqual(result["AlsoValid"], 2.0)
        self.assertNotIn("Malformed", result)

if __name__ == '__main__':
    unittest.main()
