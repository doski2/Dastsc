"""
POC RailDriver64.dll — lista controles en vivo y busca distancia a parada.

Requisitos:
  - Train Simulator Classic en escenario, conduciendo (no menu).
  - RailWorks64.exe en marcha.

Uso:
  python raildriver-poc.py
  python raildriver-poc.py --watch 30
"""
from __future__ import annotations

import argparse
import ctypes
import os
import sys
import time
from pathlib import Path

VALUE_CURRENT = 0
VALUE_MIN = 1
VALUE_MAX = 2

DLL_PATH = Path(
    os.environ.get(
        "RAILDRIVER_DLL",
        r"C:\Program Files (x86)\Steam\steamapps\common\RailWorks\plugins\RailDriver64.dll",
    ),
)

# Indices 400-408 existen en la DLL (lat/lon/fuel/heading/time) pero no se usan en el dashboard.
# Ver docs/COMPARATIVA_LUA_RAILDRIVER.md §3.7.

KEYWORDS = (
    "station", "distance", "stop", "next", "mile", "km", "eta",
    "limit", "speed", "target", "remaining", "approach", "platform",
)


def load_api():
    if not DLL_PATH.is_file():
        print(f"[!] No encuentro DLL: {DLL_PATH}")
        sys.exit(1)

    dll = ctypes.CDLL(str(DLL_PATH))

    dll.SetRailDriverConnected.argtypes = [ctypes.c_bool]
    dll.SetRailDriverConnected.restype = None

    dll.GetLocoName.restype = ctypes.c_char_p
    dll.GetLocoName.argtypes = []

    dll.GetControllerList.restype = ctypes.c_char_p
    dll.GetControllerList.argtypes = []

    dll.GetControllerValue.argtypes = [ctypes.c_int, ctypes.c_int]
    dll.GetControllerValue.restype = ctypes.c_float

    return dll


def decode_name(raw: bytes | None) -> str:
    if not raw:
        return ""
    return raw.decode("utf-8", errors="replace")


def get_loco(dll) -> list[str]:
    raw = decode_name(dll.GetLocoName())
    if not raw:
        return []
    return raw.split(".:.")


def get_controllers(dll) -> list[tuple[int, str]]:
    raw = decode_name(dll.GetControllerList())
    if not raw:
        return []
    return list(enumerate(raw.split("::")))


def try_ocr_miles() -> float | None:
    backend = Path(__file__).resolve().parent / "Dastsc-V3" / "backend"
    sys.path.insert(0, str(backend))
    try:
        from core import ocr_hud
        if not ocr_hud.is_available():
            return None
        r = ocr_hud.capture_next_stop()
        if r and r.get("distance_m"):
            return float(r["distance_m"]) / 1609.344
    except Exception:
        return None
    return None


def print_snapshot(dll, controllers: list[tuple[int, str]], ocr_mi: float | None) -> None:
    loco = get_loco(dll)
    print("\n" + "=" * 60)
    if loco:
        print(f"Locomotora: {' / '.join(loco)}")
    else:
        print("Locomotora: (sin datos — estas en menu o sin tren activo?)")

    if ocr_mi is not None:
        print(f"OCR HUD:      {ocr_mi:.3f} mi")

    print(f"Controles:    {len(controllers)}")
    print("-" * 60)

    interesting: list[str] = []
    for idx, name in controllers:
        try:
            val = dll.GetControllerValue(idx, VALUE_CURRENT)
        except Exception:
            continue
        line = f"  [{idx:3d}] {name:<40} = {val:.4f}"
        if any(k in name.lower() for k in KEYWORDS):
            interesting.append(line)
            print(line + "  <--")

    if interesting:
        print("\n--- Controles con palabras clave ---")
        for line in interesting:
            print(line)
    else:
        print("(ningun control con nombre station/distance/stop/next)")


def watch_loop(dll, seconds: float) -> None:
    controllers = get_controllers(dll)
    if not controllers:
        print("[!] Sin lista de controles. Entra en escenario conduciendo.")
        return

    prev = {idx: dll.GetControllerValue(idx, VALUE_CURRENT) for idx, _ in controllers}
    ocr_prev = try_ocr_miles()
    print(f"\nVigilando {seconds:.0f}s — CONDUCE (compara con HUD)...\n")
    print(f"{'CTRL':<35} {'VALOR':>12} {'DELTA':>10}")
    print("-" * 60)

    t0 = time.time()
    while time.time() - t0 < seconds:
        dll.SetRailDriverConnected(True)
        for idx, name in controllers:
            cur = dll.GetControllerValue(idx, VALUE_CURRENT)
            old = prev.get(idx, cur)
            if abs(cur - old) > 0.01:
                print(f"{name:<35} {cur:12.4f} {cur-old:+10.4f}")
                prev[idx] = cur
        ocr = try_ocr_miles()
        if ocr is not None and (ocr_prev is None or abs(ocr - ocr_prev) > 0.01):
            print(f"{'[OCR HUD]':<35} {ocr:12.3f} mi")
            ocr_prev = ocr
        time.sleep(0.5)


def main() -> None:
    parser = argparse.ArgumentParser(description="POC RailDriver64.dll")
    parser.add_argument("--watch", type=float, metavar="SEC", help="Vigilar cambios N segundos")
    args = parser.parse_args()

    print(f"DLL: {DLL_PATH}")
    dll = load_api()
    dll.SetRailDriverConnected(True)
    time.sleep(0.1)

    controllers = get_controllers(dll)
    ocr_mi = try_ocr_miles()
    print_snapshot(dll, controllers, ocr_mi)

    if args.watch:
        watch_loop(dll, args.watch)
    else:
        print("\nTip: .\\.venv\\Scripts\\python.exe raildriver-poc.py --watch 30")


if __name__ == "__main__":
    main()
