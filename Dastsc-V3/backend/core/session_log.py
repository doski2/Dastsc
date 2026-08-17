"""
session_log.py — Logs de sesión Nexus V4 (diagnóstico TSC).
Mantiene los últimos N archivos JSON en logs/nexus-v4/.
"""
from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Dict, List, Optional

_V4_SOURCES = frozenset({"v4_session", "v4_websocket"})
_V4_TICK_TYPES = frozenset({"tick", "tick_change", "session_start", "connection"})


def _merge_session_meta(existing: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
    """No degradar source V4; permitir promoción backend → v4_session."""
    merged = dict(existing)
    patch = dict(patch)
    if merged.get("source") in _V4_SOURCES and patch.get("source") == "backend_telemetry":
        patch.pop("source", None)
    if patch.get("source") in _V4_SOURCES:
        merged["source"] = patch.pop("source")
    merged.update(patch)
    return merged

_MAX_SESSION_FILES = 5
_SESSION_ID_RE = re.compile(r"^[\w\-]+$")

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DEFAULT_LOG_DIR = os.path.normpath(os.path.join(_BACKEND_DIR, "..", "..", "logs", "nexus-v4"))


def _session_dir() -> str:
    env = os.environ.get("NEXUS_V4_LOG_DIR", "").strip()
    return env or _DEFAULT_LOG_DIR


def _log_json_pretty() -> bool:
    return os.environ.get("NEXUS_V4_LOG_PRETTY", "").strip().lower() in ("1", "true", "yes")


def _session_path(session_id: str) -> str:
    safe = session_id.replace(":", "-")
    return os.path.join(_session_dir(), f"session_{safe}.json")


class SessionLogStore:
    def __init__(self, max_files: int = _MAX_SESSION_FILES):
        self.max_files = max_files
        self._lock = Lock()
        self._open: Dict[str, Dict[str, Any]] = {}
        self._latest_session_id: Optional[str] = None
        self._v4_tick_at: float = 0.0

    def _ensure_dir(self) -> str:
        directory = _session_dir()
        os.makedirs(directory, exist_ok=True)
        return directory

    def _list_session_files(self) -> List[str]:
        directory = self._ensure_dir()
        files = [
            os.path.join(directory, name)
            for name in os.listdir(directory)
            if name.startswith("session_") and name.endswith(".json")
        ]
        files.sort(key=lambda p: os.path.getmtime(p), reverse=True)
        return files

    def _prune_old_sessions(self) -> None:
        files = self._list_session_files()
        for path in files[self.max_files:]:
            try:
                os.remove(path)
            except OSError:
                pass

    def _load(self, session_id: str) -> Dict[str, Any]:
        path = _session_path(session_id)
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        return {
            "id": session_id,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "ended_at": None,
            "meta": {},
            "events": [],
        }

    def _save(self, session_id: str, data: Dict[str, Any]) -> None:
        self._ensure_dir()
        path = _session_path(session_id)
        with open(path, "w", encoding="utf-8") as f:
            if _log_json_pretty():
                json.dump(data, f, ensure_ascii=False, indent=2)
            else:
                json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

    def start(self, meta: Optional[Dict[str, Any]] = None) -> str:
        session_id = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        with self._lock:
            existing = self._open.get(session_id)
            if existing is None and os.path.exists(_session_path(session_id)):
                existing = self._load(session_id)
            if existing and not existing.get("ended_at"):
                if meta:
                    existing["meta"] = _merge_session_meta(
                        existing.get("meta") or {},
                        meta,
                    )
                self._open[session_id] = existing
                self._latest_session_id = session_id
                self._save(session_id, existing)
                self._prune_old_sessions()
                return session_id
        payload = {
            "id": session_id,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "ended_at": None,
            "meta": meta or {},
            "events": [],
        }
        with self._lock:
            self._open[session_id] = payload
            self._latest_session_id = session_id
            self._save(session_id, payload)
            self._prune_old_sessions()
        return session_id

    def open_or_attach(self, meta: Optional[Dict[str, Any]] = None) -> str:
        """Reutiliza sesión activa (p. ej. backend ya escribió backend_tick) o abre una nueva."""
        with self._lock:
            session_id = self._latest_session_id
            if session_id:
                if session_id not in self._open:
                    loaded = self._load(session_id)
                    if loaded.get("ended_at"):
                        session_id = None
                    else:
                        self._open[session_id] = loaded
            if session_id and session_id in self._open:
                if meta:
                    cur = self._open[session_id].setdefault("meta", {})
                    self._open[session_id]["meta"] = _merge_session_meta(cur, meta)
                    self._save(session_id, self._open[session_id])
                return session_id
        return self.start(meta or {"source": "v4_session"})

    def _note_v4_activity(self, events: List[Dict[str, Any]]) -> None:
        for event in events:
            if event.get("type") in _V4_TICK_TYPES:
                self._v4_tick_at = time.time()
                return

    def v4_recently_active(self, within_s: float = 20.0) -> bool:
        if self._v4_tick_at <= 0:
            return False
        return (time.time() - self._v4_tick_at) < within_s

    def append(self, session_id: str, events: List[Dict[str, Any]]) -> bool:
        if not session_id or not _SESSION_ID_RE.match(session_id):
            return False
        if not events:
            return True
        with self._lock:
            data = self._open.get(session_id) or self._load(session_id)
            data.setdefault("events", []).extend(events)
            self._open[session_id] = data
            self._save(session_id, data)
            self._note_v4_activity(events)
        return True

    def adopt_session(self, session_id: str, meta: Optional[Dict[str, Any]] = None) -> bool:
        if not session_id or not _SESSION_ID_RE.match(session_id):
            return False
        with self._lock:
            data = self._load(session_id)
            if meta:
                data["meta"] = _merge_session_meta(data.get("meta") or {}, meta)
            self._open[session_id] = data
            self._latest_session_id = session_id
            self._save(session_id, data)
        return True

    def ensure_active_session(self, meta: Optional[Dict[str, Any]] = None) -> str:
        """Abre sesión si no hay una activa (p. ej. solo backend + TSC)."""
        with self._lock:
            session_id = self._latest_session_id
            if session_id:
                if session_id not in self._open:
                    self._open[session_id] = self._load(session_id)
                if meta:
                    cur = self._open[session_id].setdefault("meta", {})
                    self._open[session_id]["meta"] = _merge_session_meta(cur, meta)
                    self._save(session_id, self._open[session_id])
                return session_id
        return self.start(meta or {"source": "backend_auto"})

    def update_meta(self, session_id: str, patch: Dict[str, Any]) -> bool:
        if not session_id or not _SESSION_ID_RE.match(session_id) or not patch:
            return False
        with self._lock:
            data = self._open.get(session_id) or self._load(session_id)
            data["meta"] = _merge_session_meta(data.get("meta") or {}, patch)
            self._open[session_id] = data
            self._save(session_id, data)
        return True

    def append_active(self, events: List[Dict[str, Any]]) -> bool:
        """Añade eventos a la sesión V4 abierta más reciente (p. ej. OCR en backend)."""
        if not events:
            return True
        with self._lock:
            session_id = self._latest_session_id
            if not session_id:
                return False
            if session_id not in self._open:
                loaded = self._load(session_id)
                if not loaded.get("events") and not os.path.exists(_session_path(session_id)):
                    return False
                self._open[session_id] = loaded
            data = self._open[session_id]
            data.setdefault("events", []).extend(events)
            self._save(session_id, data)
        return True

    def end(self, session_id: str, summary: Optional[Dict[str, Any]] = None) -> bool:
        if not session_id or not _SESSION_ID_RE.match(session_id):
            return False
        with self._lock:
            data = self._open.pop(session_id, None) or self._load(session_id)
            data["ended_at"] = datetime.now(timezone.utc).isoformat()
            if summary:
                data["summary"] = summary
            self._save(session_id, data)
            if self._latest_session_id == session_id:
                self._latest_session_id = None
            self._prune_old_sessions()
        return True

    def get(self, session_id: str) -> Optional[Dict[str, Any]]:
        if not session_id or not _SESSION_ID_RE.match(session_id):
            return None
        with self._lock:
            if session_id in self._open:
                return dict(self._open[session_id])
            path = _session_path(session_id)
            if not os.path.exists(path):
                return None
            with open(path, encoding="utf-8") as f:
                return json.load(f)

    def list_sessions(self) -> List[Dict[str, Any]]:
        result: List[Dict[str, Any]] = []
        for path in self._list_session_files()[: self.max_files]:
            try:
                with open(path, encoding="utf-8") as f:
                    data = json.load(f)
                result.append({
                    "id": data.get("id", os.path.basename(path)),
                    "started_at": data.get("started_at"),
                    "ended_at": data.get("ended_at"),
                    "event_count": len(data.get("events") or []),
                    "meta": data.get("meta") or {},
                })
            except (json.JSONDecodeError, OSError):
                continue
        return result


_store = SessionLogStore()
