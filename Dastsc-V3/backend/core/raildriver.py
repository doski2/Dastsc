"""
raildriver.py — Acceso mínimo a RailDriver64.dll para autodetección de tren.
"""
from __future__ import annotations

import ctypes
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

VALUE_CURRENT = 0
VALUE_MIN = 1
VALUE_MAX = 2

DEFAULT_DLL = Path(
    os.environ.get(
        "RAILDRIVER_DLL",
        r"C:\Program Files (x86)\Steam\steamapps\common\RailWorks\plugins\RailDriver64.dll",
    ),
)


@dataclass
class ControllerInfo:
    index: int
    name: str
    current: float
    min_value: float
    max_value: float


@dataclass
class RailDriverSnapshot:
    loco_names: List[str]
    controllers: List[ControllerInfo]

    @property
    def controller_names(self) -> List[str]:
        return [c.name for c in self.controllers]

    def limits_by_name(self) -> Dict[str, Dict[str, float]]:
        return {
            c.name: {"min": c.min_value, "max": c.max_value, "current": c.current}
            for c in self.controllers
        }


class RailDriverClient:
    def __init__(self, dll_path: Optional[Path] = None):
        self.dll_path = dll_path or DEFAULT_DLL
        self._dll = None
        self._connected = False
        self._name_to_index: Dict[str, int] = {}
        self._list_key = ""

    @property
    def available(self) -> bool:
        return self.dll_path.is_file()

    def connect(self) -> bool:
        if not self.available:
            return False
        if self._dll is None:
            self._dll = ctypes.CDLL(str(self.dll_path))
            self._dll.SetRailDriverConnected.argtypes = [ctypes.c_bool]
            self._dll.SetRailDriverConnected.restype = None
            self._dll.GetLocoName.restype = ctypes.c_char_p
            self._dll.GetLocoName.argtypes = []
            self._dll.GetControllerList.restype = ctypes.c_char_p
            self._dll.GetControllerList.argtypes = []
            self._dll.GetControllerValue.argtypes = [ctypes.c_int, ctypes.c_int]
            self._dll.GetControllerValue.restype = ctypes.c_float
        if not self._connected:
            dll = self._dll
            if dll is None:
                return False
            dll.SetRailDriverConnected(True)
            self._connected = True
        return True

    def _dll_handle(self) -> Optional[ctypes.CDLL]:
        if not self.connect():
            return None
        return self._dll

    def _ensure_indices(self) -> bool:
        dll = self._dll_handle()
        if dll is None:
            return False
        ctrl_raw = self._decode(dll.GetControllerList())
        if ctrl_raw != self._list_key:
            self._list_key = ctrl_raw
            names = ctrl_raw.split("::") if ctrl_raw else []
            self._name_to_index = {name: index for index, name in enumerate(names) if name}
        return bool(self._name_to_index)

    def get_value(self, name: str) -> Optional[float]:
        dll = self._dll_handle()
        if dll is None or not self._ensure_indices():
            return None
        index = self._name_to_index.get(name)
        if index is None:
            return None
        return float(dll.GetControllerValue(index, VALUE_CURRENT))

    def get_loco_names(self) -> List[str]:
        dll = self._dll_handle()
        if dll is None:
            return []
        loco_raw = self._decode(dll.GetLocoName())
        if not loco_raw:
            return []
        return [part.strip() for part in loco_raw.split(".:.") if part.strip()]

    def snapshot(self) -> Optional[RailDriverSnapshot]:
        dll = self._dll_handle()
        if dll is None:
            return None

        loco_names = self.get_loco_names()

        if not self._ensure_indices():
            return RailDriverSnapshot(loco_names=loco_names, controllers=[])

        controllers: List[ControllerInfo] = []
        for index, name in sorted((idx, nm) for nm, idx in self._name_to_index.items()):
            controllers.append(
                ControllerInfo(
                    index=index,
                    name=name,
                    current=float(dll.GetControllerValue(index, VALUE_CURRENT)),
                    min_value=float(dll.GetControllerValue(index, VALUE_MIN)),
                    max_value=float(dll.GetControllerValue(index, VALUE_MAX)),
                ),
            )

        return RailDriverSnapshot(loco_names=loco_names, controllers=controllers)

    @staticmethod
    def _decode(raw: Optional[bytes]) -> str:
        if not raw:
            return ""
        return raw.decode("utf-8", errors="replace")


_client: Optional[RailDriverClient] = None


def get_raildriver_client() -> RailDriverClient:
    global _client
    if _client is None:
        _client = RailDriverClient()
    return _client
