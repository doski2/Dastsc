import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
import xml.etree.ElementTree as ET
import tempfile
import shutil
from core.scenarios import ScenarioManager, _parse_time_of_day, _parse_seconds, _secs_to_hhmm

class TestScenarios(unittest.TestCase):
    def test_parse_time_of_day(self):
        xml = "<sTimeOfDay><_iHour>8</_iHour><_iMinute>15</_iMinute></sTimeOfDay>"
        node = ET.fromstring(xml)
        self.assertEqual(_parse_time_of_day(node), "08:15")
        
        self.assertEqual(_parse_time_of_day(None), "N/A")
        
        xml_zero = "<sTimeOfDay><_iHour>0</_iHour><_iMinute>0</_iMinute></sTimeOfDay>"
        node_zero = ET.fromstring(xml_zero)
        self.assertEqual(_parse_time_of_day(node_zero), "N/A")

    def test_parse_seconds(self):
        xml = "<Time>3660</Time>"
        node = ET.fromstring(xml)
        self.assertEqual(_parse_seconds(node), "01:01")
        
        self.assertEqual(_parse_seconds(None), "N/A")

    def test_secs_to_hhmm(self):
        self.assertEqual(_secs_to_hhmm(3660), "01:01")
        self.assertEqual(_secs_to_hhmm(86400 + 3600), "01:00") # Over 24h

    def test_scenario_manager_selection(self):
        test_dir = tempfile.mkdtemp()
        save_path = os.path.join(test_dir, "CurrentSave.xml")
        with open(save_path, "w") as f:
            f.write("<root></root>")
            
        manager = ScenarioManager(rw_path=test_dir)
        
        # Test manual selection
        success = manager.select_manual_scenario(save_path)
        self.assertTrue(success)
        self.assertEqual(manager._forced_save_path, save_path)
        
        # Test clear
        manager.clear_manual_scenario()
        self.assertIsNone(manager._forced_save_path)
        
        shutil.rmtree(test_dir)

if __name__ == '__main__':
    unittest.main()
