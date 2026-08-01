import os
import shutil
import tempfile
import unittest

from core import command_bus


class TestCommandBus(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.path = os.path.join(self.tmp, "SendCommand.txt")
        self.profile = {
            "mappings": {"combined_control": "ThrottleAndBrake"},
        }

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def test_allowed_throttle_and_brake(self):
        self.assertTrue(command_bus.is_allowed_command("ThrottleAndBrake", self.profile))

    def test_blocks_emergency(self):
        self.assertFalse(command_bus.is_allowed_command("EmergencyBrake", self.profile))

    def test_profile_mapping_allowed(self):
        self.assertTrue(command_bus.is_allowed_command("ThrottleAndBrake", self.profile))

    def test_write_send_command(self):
        ok = command_bus.write_send_command(self.path, "ThrottleAndBrake", -0.5)
        self.assertTrue(ok)
        with open(self.path, encoding="utf-8") as f:
            self.assertEqual(f.read().strip(), "ThrottleAndBrake:-0.5000")

    def test_dispatch_command(self):
        result = command_bus.dispatch_command(self.path, "ThrottleAndBrake", -0.25, self.profile)
        self.assertTrue(result["ok"])
        self.assertEqual(result["value"], -0.25)

    def test_dispatch_rejects_blocked(self):
        result = command_bus.dispatch_command(self.path, "EmergencyBrake", 1.0, self.profile)
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"], "command_not_allowed")

    def test_clamp_value(self):
        line = command_bus.format_send_command_line("ThrottleAndBrake", -9)
        self.assertEqual(line, "ThrottleAndBrake:-1.0000")


if __name__ == "__main__":
    unittest.main()
