import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import unittest

from core.auto_loop import BackendAutoLoop


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


if __name__ == "__main__":
    unittest.main()
