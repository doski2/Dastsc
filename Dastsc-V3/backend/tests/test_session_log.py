import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core import session_log


class TestSessionLog(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self._prev = os.environ.get("NEXUS_V4_LOG_DIR")
        os.environ["NEXUS_V4_LOG_DIR"] = self.tmp
        self.store = session_log.SessionLogStore(max_files=5)

    def tearDown(self):
        if self._prev is None:
            os.environ.pop("NEXUS_V4_LOG_DIR", None)
        else:
            os.environ["NEXUS_V4_LOG_DIR"] = self._prev
        shutil.rmtree(self.tmp)

    def test_start_append_end(self):
        sid = self.store.start({"profile": "icet"})
        self.assertTrue(self.store.append(sid, [{"type": "tick", "speed": 40}]))
        self.assertTrue(self.store.end(sid, {"note": "ok"}))
        path = session_log._session_path(sid)
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data["meta"]["profile"], "icet")
        self.assertEqual(len(data["events"]), 1)
        self.assertIsNotNone(data["ended_at"])

    def test_prune_keeps_last_five(self):
        ids = [self.store.start({"n": i}) for i in range(7)]
        for sid in ids:
            self.store.end(sid)
        listed = self.store.list_sessions()
        self.assertLessEqual(len(listed), 5)
        on_disk = [n for n in os.listdir(self.tmp) if n.endswith(".json")]
        self.assertLessEqual(len(on_disk), 5)

    def test_append_active(self):
        sid = self.store.start({"profile": "icet"})
        self.assertTrue(self.store.append_active([{"type": "ocr_capture", "event": "door_anchor"}]))
        self.store.end(sid)
        with open(session_log._session_path(sid), encoding="utf-8") as f:
            data = json.load(f)
        types = [e["type"] for e in data["events"]]
        self.assertIn("ocr_capture", types)

    def test_ensure_active_session(self):
        sid = self.store.ensure_active_session({"source": "backend"})
        self.assertTrue(sid)
        self.assertTrue(self.store.append_active([{"type": "backend_tick", "speed": 1}]))

    def test_adopt_session(self):
        sid = self.store.start({"profile": "class323"})
        self.store.end(sid)
        self.assertTrue(self.store.adopt_session(sid, {"policy": "AUTO"}))
        path = session_log._session_path(sid)
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data["meta"].get("policy"), "AUTO")

    def test_meta_merge_preserves_v4_source(self):
        sid = self.store.start({"source": "v4_session", "policyMode": "AUTO"})
        self.store.ensure_active_session({"source": "backend_telemetry"})
        with open(session_log._session_path(sid), encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data["meta"].get("source"), "v4_session")

    def test_meta_merge_promotes_backend_to_v4(self):
        sid = self.store.start({"source": "backend_telemetry"})
        self.store.open_or_attach({
            "source": "v4_session",
            "profileSelection": "AUTO",
            "policyMode": "AUTO",
        })
        with open(session_log._session_path(sid), encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data["meta"].get("source"), "v4_session")
        self.assertEqual(data["meta"].get("profileSelection"), "AUTO")

    def test_open_or_attach_keeps_backend_events(self):
        sid = self.store.ensure_active_session({"source": "backend_telemetry"})
        self.store.append_active([{"type": "backend_tick", "speed": 40}])
        attached = self.store.open_or_attach({"source": "v4_session", "policyMode": "AUTO"})
        self.assertEqual(attached, sid)
        self.store.append(attached, [{"type": "tick", "headline": "test"}])
        with open(session_log._session_path(sid), encoding="utf-8") as f:
            data = json.load(f)
        types = [e["type"] for e in data["events"]]
        self.assertIn("backend_tick", types)
        self.assertIn("tick", types)
        self.assertEqual(data["meta"].get("source"), "v4_session")

    def test_start_same_second_does_not_wipe_events(self):
        sid = self.store.start({"source": "backend_telemetry"})
        self.store.append(sid, [{"type": "backend_tick", "n": 1}])
        sid2 = self.store.start({"source": "v4_session", "policyMode": "ARM"})
        self.assertEqual(sid2, sid)
        with open(session_log._session_path(sid), encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(len(data["events"]), 1)
        self.assertEqual(data["meta"].get("source"), "v4_session")
        self.assertEqual(data["meta"].get("policyMode"), "ARM")

    def test_v4_recently_active_after_tick(self):
        sid = self.store.start({"source": "v4_session"})
        self.assertFalse(self.store.v4_recently_active())
        self.store.append(sid, [{"type": "tick", "headline": "test"}])
        self.assertTrue(self.store.v4_recently_active())


if __name__ == "__main__":
    unittest.main()
