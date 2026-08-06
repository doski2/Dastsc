#!/usr/bin/env python3
"""
nexus-debug.py — Volcado FullEngineData propio vía RailDriver64.dll (sin tools de terceros).

Equivalente al debug.txt de "TSClassic Raildriver and Joystick Interface":
  I = N, enginecontrols[i].controlNumber = N, Name = Foo, Min = X, Max = Y value = Z

Requisitos:
  - Train Simulator Classic en escenario, conduciendo en cabina.
  - RailDriver64.dll en plugins del juego.

Uso:
  python nexus-debug.py
  python nexus-debug.py --out debug_class375.txt
  python nexus-debug.py --profile-draft class375
  python nexus-debug.py --watch 30
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent / "Dastsc-V3" / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from core.raildriver import RailDriverClient, get_raildriver_client  # noqa: E402
from core.profile_draft import build_profile_draft  # noqa: E402

# Controles frecuentes — ver core/profile_draft.py (PROFILE_HINTS).


def format_engine_line(index: int, name: str, min_v: float, max_v: float, value: float) -> str:
    return (
        f"I = {index}, enginecontrols[i].controlNumber = {index}, "
        f"Name = {name}, Min = {min_v:g}, Max = {max_v:g} value = {value:g}"
    )


def render_debug_text(snapshot) -> str:
    lines: list[str] = [
        f"# Nexus debug dump — {datetime.now(timezone.utc).isoformat()}",
        f"# Loco: {' / '.join(snapshot.loco_names) or '(unknown)'}",
        f"# Controllers: {len(snapshot.controllers)}",
        "",
    ]
    for ctrl in snapshot.controllers:
        lines.append(
            format_engine_line(ctrl.index, ctrl.name, ctrl.min_value, ctrl.max_value, ctrl.current),
        )
    return "\n".join(lines) + "\n"


def capture(client: RailDriverClient | None = None):
    rd = client or get_raildriver_client()
    if not rd.available:
        print(f"[!] No encuentro RailDriver64.dll: {rd.dll_path}", file=sys.stderr)
        sys.exit(1)
    snap = rd.snapshot()
    if snap is None or not snap.controllers:
        print("[!] Sin controles. Entra en escenario conduciendo en cabina.", file=sys.stderr)
        sys.exit(1)
    return snap


def watch_changes(seconds: float) -> None:
    rd = get_raildriver_client()
    snap = capture(rd)
    prev = {c.index: c.current for c in snap.controllers}
    print(f"\nVigilando {seconds:.0f}s — mueve mandos en cabina...\n")
    print(f"{'NAME':<42} {'VALUE':>12} {'DELTA':>10}")
    print("-" * 68)
    t0 = time.time()
    while time.time() - t0 < seconds:
        snap = rd.snapshot()
        if not snap:
            time.sleep(0.5)
            continue
        for ctrl in snap.controllers:
            old = prev.get(ctrl.index, ctrl.current)
            if abs(ctrl.current - old) > 0.01:
                print(f"{ctrl.name:<42} {ctrl.current:12.4f} {ctrl.current - old:+10.4f}")
                prev[ctrl.index] = ctrl.current
        time.sleep(0.4)


def main() -> None:
    parser = argparse.ArgumentParser(description="Nexus FullEngineData debug dump (RailDriver64.dll)")
    parser.add_argument("--out", "-o", help="Guardar debug.txt en esta ruta")
    parser.add_argument("--profile-draft", metavar="ID", help="Emitir borrador JSON de perfil (ej. class375)")
    parser.add_argument("--watch", type=float, metavar="SEC", help="Vigilar cambios de valor N segundos")
    args = parser.parse_args()

    snap = capture()
    text = render_debug_text(snap)

    if args.out:
        out_path = Path(args.out)
        out_path.write_text(text, encoding="utf-8")
        print(f"[OK] Guardado: {out_path.resolve()}")
    else:
        print(text)

    if args.profile_draft:
        draft = build_profile_draft(snap, args.profile_draft)
        draft["_draft_note"] = "Revisar extends, notches y physics_config antes de usar en producción."
        draft_path = Path(f"profiles/{args.profile_draft}_draft.json")
        draft_path.parent.mkdir(parents=True, exist_ok=True)
        draft_path.write_text(json.dumps(draft, indent=4, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"[OK] Borrador perfil: {draft_path.resolve()}")

    if args.watch:
        watch_changes(args.watch)


if __name__ == "__main__":
    main()
