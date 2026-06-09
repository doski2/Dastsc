import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest
import sqlite3
import tempfile
import shutil
import xml.etree.ElementTree as ET
from core import scenario_index

class TestScenarioIndex(unittest.TestCase):
    def test_secs_to_hhmm(self):
        self.assertEqual(scenario_index._secs_to_hhmm("3600"), "01:00")
        self.assertEqual(scenario_index._secs_to_hhmm("0"), "N/A")
        self.assertEqual(scenario_index._secs_to_hhmm(None), "N/A")
        self.assertEqual(scenario_index._secs_to_hhmm("7260"), "02:01")

    def test_extract_from_xml_root(self):
        xml_data = """
        <Scenario>
            <cDriver>
                <PlayerDriver>1</PlayerDriver>
                <ServiceName>
                    <Localisation-cUserLocalisedString>
                        <English>Test Service</English>
                    </Localisation-cUserLocalisedString>
                </ServiceName>
                <InitialRV>
                    <e>Loco1</e>
                    <e>Loco2</e>
                </InitialRV>
                <cDriverInstructionContainer>
                    <cPickUpPassengers>
                        <cDriverInstructionTarget>
                            <DisplayName>Station A</DisplayName>
                            <DueTime>3600</DueTime>
                            <Duration>60</Duration>
                        </cDriverInstructionTarget>
                    </cPickUpPassengers>
                    <cStopAtDestinations>
                        <cDriverInstructionTarget>
                            <DisplayName>Waypoint B</DisplayName>
                            <Waypoint>1</Waypoint>
                            <DueTime>4200</DueTime>
                        </cDriverInstructionTarget>
                    </cStopAtDestinations>
                </cDriverInstructionContainer>
            </cDriver>
        </Scenario>
        """
        root = ET.fromstring(xml_data)
        # Assuming start_secs = 0 for simplicity
        result = scenario_index._extract_from_xml_root(root, start_secs=0)
        
        self.assertEqual(result["service"], "Test Service")
        self.assertEqual(result["initial_rv"], ["Loco1", "Loco2"])
        self.assertEqual(len(result["stops"]), 2)
        
        self.assertEqual(result["stops"][0]["name"], "Station A")
        self.assertEqual(result["stops"][0]["type"], "STOP")
        self.assertEqual(result["stops"][0]["due_time"], "01:00")
        
        self.assertEqual(result["stops"][1]["name"], "Waypoint B")
        self.assertEqual(result["stops"][1]["type"], "WAYPOINT")

    def test_db_operations(self):
        # Use a temporary directory for the DB
        test_dir = tempfile.mkdtemp()
        db_path = os.path.join(test_dir, "test_scenarios.db")
        
        # Patch the DB_PATH
        original_db_path = scenario_index.DB_PATH
        original_db_dir = scenario_index._DB_DIR
        scenario_index.DB_PATH = db_path
        scenario_index._DB_DIR = test_dir
        
        try:
            conn = scenario_index._get_conn()
            scenario_index._init_db(conn)
            
            # Test insertion
            conn.execute("INSERT INTO scenarios (id, name, scenario_dir) VALUES (?,?,?)", 
                         ("guid1", "Test Scenario", "/path/to/scenario"))
            conn.commit()
            conn.close() # Close connection here
            
            scenarios = scenario_index.list_scenarios()
            self.assertEqual(len(scenarios), 1)
            self.assertEqual(scenarios[0]["id"], "guid1")
            self.assertEqual(scenarios[0]["name"], "Test Scenario")
            
        finally:
            scenario_index.DB_PATH = original_db_path
            scenario_index._DB_DIR = original_db_dir
            shutil.rmtree(test_dir)

if __name__ == '__main__':
    unittest.main()
