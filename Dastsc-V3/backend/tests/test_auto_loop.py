import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import time
import unittest
from unittest.mock import patch

from core.auto_loop import BackendAutoLoop, BRAKE_STATS_TTL_S


class TestBackendAutoLoop(unittest.TestCase):
    def setUp(self):
        self.loop = BackendAutoLoop()

    def test_set_policy_validates(self):
        self.assertTrue(self.loop.set_policy("AUTO"))
        self.assertTrue(self.loop.backend_auto_active)
        self.assertTrue(self.loop.set_policy("SUGGEST"))
        self.assertFalse(self.loop.backend_auto_active)
        self.assertFalse(self.loop.set_policy("INVALID"))

    def test_set_gradient_sign_validates(self):
        self.assertTrue(self.loop.set_gradient_sign("+"))
        self.assertFalse(self.loop.set_gradient_sign("x"))

    def test_should_dispatch_apply_immediately(self):
        action_b3 = {"command": "ThrottleAndBrake", "value": -0.75}
        self.assertTrue(self.loop.should_dispatch(action_b3, False))
        action_b2 = {"command": "ThrottleAndBrake", "value": -0.5}
        self.assertTrue(self.loop.should_dispatch(action_b2, False))

    def test_should_dispatch_dedup_apply_when_brake_confirmed(self):
        action = {"command": "ThrottleAndBrake", "value": -0.75}
        self.assertTrue(self.loop.should_dispatch(action, False))
        self.assertFalse(self.loop.should_dispatch(action, True))

    def test_should_dispatch_retries_apply_until_brake_confirmed(self):
        action = {"command": "ThrottleAndBrake", "value": -0.75}
        self.assertTrue(self.loop.should_dispatch(action, False))
        self.assertFalse(self.loop.should_dispatch(action, False))
        self.loop._last_sent_at -= 0.6
        self.assertTrue(self.loop.should_dispatch(action, False))

    def test_should_dispatch_release_retries_while_braking(self):
        release = {"command": "VirtualBrake", "value": 0.0}
        self.assertTrue(self.loop.should_dispatch(release, True))
        self.assertFalse(self.loop.should_dispatch(release, True))

    @patch("core.auto_loop.brake_log.get_stats")
    def test_brake_stats_cache_reloads_after_invalidate(self, mock_get_stats):
        mock_get_stats.return_value = {"by_notch": {"B3": {"avg_decel_ms2": 0.5}}}
        first = self.loop._brake_stats_for("acela")
        second = self.loop._brake_stats_for("acela")
        self.assertEqual(first, second)
        self.assertEqual(mock_get_stats.call_count, 1)

        self.loop.invalidate_brake_stats("acela")
        third = self.loop._brake_stats_for("acela")
        self.assertEqual(third, first)
        self.assertEqual(mock_get_stats.call_count, 2)

    @patch("core.auto_loop.brake_log.get_stats")
    def test_brake_stats_cache_ttl(self, mock_get_stats):
        mock_get_stats.return_value = {"by_notch": {}}
        self.loop._brake_stats_for("train_a")
        self.loop._brake_stats_loaded_at = time.time() - BRAKE_STATS_TTL_S - 1
        self.loop._brake_stats_for("train_a")
        self.assertEqual(mock_get_stats.call_count, 2)

    @patch("core.auto_loop.brake_log.get_stats")
    def test_invalidate_ignores_other_profile(self, mock_get_stats):
        mock_get_stats.return_value = {"by_notch": {}}
        self.loop._brake_stats_for("train_a")
        self.loop.invalidate_brake_stats("train_b")
        self.loop._brake_stats_for("train_a")
        self.assertEqual(mock_get_stats.call_count, 1)

    @patch("core.auto_loop.command_bus.dispatch_command")
    @patch("core.auto_loop.session_log.log_auto_command")
    def test_dispatch_action_logs_command(self, mock_log, mock_dispatch):
        mock_dispatch.return_value = {"ok": True, "command": "VirtualBrake", "value": 0.75}
        action = {"command": "VirtualBrake", "value": 0.75, "reason": "plan:apply:B3"}
        result = self.loop.dispatch_action(action, "/tmp/SendCommand.txt", {"id": "acela"})
        self.assertTrue(result.get("ok"))
        mock_log.assert_called_once_with(
            "VirtualBrake",
            0.75,
            reason="plan:apply:B3",
        )

    @patch("core.auto_loop.command_bus.dispatch_command")
    @patch("core.auto_loop.session_log.log_auto_command")
    def test_dispatch_action_skips_log_on_failure(self, mock_log, mock_dispatch):
        mock_dispatch.return_value = {"ok": False, "error": "ipc_failed"}
        action = {"command": "VirtualBrake", "value": 0.75}
        self.loop.dispatch_action(action, None, None)
        mock_log.assert_not_called()


if __name__ == "__main__":
    unittest.main()
