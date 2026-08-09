import os
import sys
import shutil
import tempfile
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

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
        flag_path = command_bus.apply_flag_path(self.path)
        self.assertTrue(os.path.exists(flag_path))

    def test_purge_lua_commands(self):
        command_bus.write_send_command(self.path, "ThrottleAndBrake", 0.0)
        self.assertTrue(command_bus.purge_lua_commands(self.path))
        self.assertFalse(os.path.exists(self.path))
        self.assertFalse(os.path.exists(command_bus.apply_flag_path(self.path)))

    def test_dispatch_command(self):
        result = command_bus.dispatch_command(self.path, "ThrottleAndBrake", -0.25, self.profile)
        self.assertTrue(result["ok"])
        self.assertEqual(result["value"], -0.25)

    def test_dispatch_rejects_blocked(self):
        result = command_bus.dispatch_command(self.path, "EmergencyBrake", 1.0, self.profile)
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"], "command_not_allowed")

    def test_dispatch_split_brake_cuts_throttle(self):
        profile = {
            "mappings": {
                "throttle": "SimpleThrottle",
                "brake": "VirtualBrake",
                "train_brake": "TrainBrakeControl",
            },
        }
        result = command_bus.dispatch_command(self.path, "VirtualBrake", 0.5, profile)
        self.assertTrue(result["ok"])
        with open(self.path, encoding="utf-8") as f:
            content = f.read().strip().splitlines()
        self.assertEqual(content[0], "SimpleThrottle:0.0000")
        self.assertEqual(content[1], "VirtualBrake:0.5000")
        self.assertEqual(content[2], "TrainBrakeControl:0.5000")

    def test_dispatch_split_brake_release_neu_zeros_all(self):
        profile = {
            "mappings": {
                "throttle": "SimpleThrottle",
                "brake": "VirtualBrake",
                "train_brake": "TrainBrakeControl",
            },
        }
        result = command_bus.dispatch_command(self.path, "VirtualBrake", 0.0, profile)
        self.assertTrue(result["ok"])
        with open(self.path, encoding="utf-8") as f:
            content = f.read().strip().splitlines()
        self.assertEqual(content[0], "SimpleThrottle:0.0000")
        self.assertEqual(content[1], "VirtualBrake:0.0000")
        self.assertEqual(content[2], "TrainBrakeControl:0.0000")

    def test_split_brake_always_zeros_throttle_on_apply_and_release(self):
        profile = {
            "mappings": {
                "throttle": "SimpleThrottle",
                "brake": "VirtualBrake",
                "train_brake": "TrainBrakeControl",
            },
        }
        for value in (0.5, 0.0):
            lines = command_bus._command_lines("VirtualBrake", value, profile)
            self.assertEqual(lines[0], "SimpleThrottle:0.0000")

    def test_dispatch_combined_brake_release_off(self):
        result = command_bus.dispatch_command(self.path, "ThrottleAndBrake", 0.0, self.profile)
        self.assertTrue(result["ok"])
        with open(self.path, encoding="utf-8") as f:
            self.assertEqual(f.read().strip(), "ThrottleAndBrake:0.0000")

    def test_clamp_value(self):
        line = command_bus.format_send_command_line("ThrottleAndBrake", -9)
        self.assertEqual(line, "ThrottleAndBrake:-1.0000")


if __name__ == "__main__":
    unittest.main()
