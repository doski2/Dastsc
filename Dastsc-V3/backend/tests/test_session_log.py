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


if __name__ == "__main__":
    unittest.main()
