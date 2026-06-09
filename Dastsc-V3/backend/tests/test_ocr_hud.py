import sys
import os
# Añadir el directorio backend al path para que core sea importable
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
from core import ocr_hud

class TestOCRHud(unittest.TestCase):
    def test_parse_full_info(self):
        # Simulación de texto OCR típico de TS Classic
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
        # 2.45 miles * 1609.34 = 3942.883
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

    def test_parse_with_junk(self):
        # Simulación con artefactos OCR del icono (el "muñequito" caminando)
        raw_text = """
        15:45:10
        |  London Victoria
        0.5 miles
        """
        result = ocr_hud._parse(raw_text)
        self.assertEqual(result["station_name"], "London Victoria")
        self.assertAlmostEqual(result["distance_m"], 804.7, places=1)

    def test_invalid_text(self):
        raw_text = "..." # Too short to be a station name
        result = ocr_hud._parse(raw_text)
        self.assertIsNone(result)

    def test_pure_time_is_not_station(self):
        raw_text = "12:34:56"
        result = ocr_hud._parse(raw_text)
        self.assertIsNone(result)

if __name__ == '__main__':
    unittest.main()
