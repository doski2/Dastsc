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
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent / "Dastsc-V3" / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from core.raildriver import RailDriverClient, get_raildriver_client  # noqa: E402

# Controles frecuentes para sugerir mappings / fingerprint en borrador de perfil.
_PROFILE_HINTS: dict[str, list[str]] = {
    "combined_control": [
        "ThrottleAndBrake",
    ],
    "regulator": ["Regulator", "SimpleThrottle"],
    "train_brake": ["TrainBrakeControl", "DynamicBrake"],
    "reverser": ["Reverser", "UserVirtualReverser", "SimpleChangeDirection"],
    "brake_cylinder": ["TrainBrakeCylinderPressureBAR"],
    "main_reservoir": ["MainReservoirPressureBAR"],
    "brake_pipe": ["BrakePipePressureBAR", "TrainBrakePipePressureBAR"],
    "ammeter": ["Ammeter"],
    "current": ["Current"],
    "effort": ["TractiveEffort"],
    "aws": ["AWS"],
    "aws_warning": ["AWSWarnCount", "AWSClearCount"],
    "aws_reset": ["AWSReset"],
    "dsd": ["DSD", "DSDAlarm", "DVDAlarm"],
    "dra": ["DRA", "DRAButton"],
    "doors_left": ["DoorsOpenCloseLeft"],
    "doors_right": ["DoorsOpenCloseRight"],
    "emergency_brake": ["EmergencyBrake"],
    "master_key": ["MasterKey"],
    "pantograph": ["Pantograph", "PantographControl"],
}

_FINGERPRINT_PRIORITY = [
    "ThrottleAndBrake",
    "Regulator",
    "TrainBrakeControl",
    "DRA",
    "DRAButton",
    "DSD",
    "DSDAlarm",
    "DVDAlarm",
    "AWS",
    "UserVirtualReverser",
    "Reverser",
    "RegenBrakesSwitch",
    "EmergencyBrake",
]


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


def _pick_mapping(available: set[str], candidates: list[str]) -> str | None:
    for name in candidates:
        if name in available:
            return name
    return None


def build_profile_draft(snapshot, profile_id: str) -> dict:
    names = {c.name for c in snapshot.controllers}
    by_name = {c.name: c for c in snapshot.controllers}

    mappings: dict[str, str] = {}
    for key, candidates in _PROFILE_HINTS.items():
        picked = _pick_mapping(names, candidates)
        if picked:
            mappings[key] = picked

    fingerprint = [n for n in _FINGERPRINT_PRIORITY if n in names][:8]
    if not fingerprint:
        fingerprint = sorted(names)[:6]

    specs: dict = {}
    if "TrainBrakeCylinderPressureBAR" in by_name:
        specs["max_brake_cyl"] = by_name["TrainBrakeCylinderPressureBAR"].max_value
    if "MainReservoirPressureBAR" in by_name:
        specs["max_main_res"] = by_name["MainReservoirPressureBAR"].max_value
    if "Ammeter" in by_name:
        specs["max_ammeter"] = abs(by_name["Ammeter"].max_value)
    if "Current" in by_name:
        specs["max_current"] = abs(by_name["Current"].max_value)

    combined = mappings.get("combined_control")
    notches: list[dict] = []
    if combined and combined in by_name:
        c = by_name[combined]
        if c.min_value <= -0.5:
            notches.extend([
                {"value": -1.0, "label": "EMG"},
                {"value": -0.75, "label": "B3"},
                {"value": -0.5, "label": "B2"},
                {"value": -0.25, "label": "B1"},
                {"value": 0.0, "label": "OFF"},
                {"value": 0.25, "label": "P1"},
                {"value": 0.5, "label": "P2"},
                {"value": 0.75, "label": "P3"},
                {"value": 1.0, "label": "P4"},
            ])
    elif "Regulator" in by_name and "TrainBrakeControl" in by_name:
        notches = [
            {"value": 0.0, "label": "OFF"},
            {"value": 0.25, "label": "P1"},
            {"value": 0.5, "label": "P2"},
            {"value": 0.75, "label": "P3"},
            {"value": 1.0, "label": "P4"},
        ]

    if notches:
        specs["notches_throttle_brake"] = notches

    aliases = list(snapshot.loco_names)
    for match in re.finditer(r"\d{3,6}", " ".join(snapshot.loco_names)):
        aliases.append(match.group(0))
        if len(match.group(0)) >= 6:
            aliases.append(match.group(0)[:3])

    return {
        "name": profile_id.replace("_", " ").title(),
        "aliases": sorted(set(aliases)),
        "extends": "class323",
        "fingerprint": {"required_controls": fingerprint},
        "mappings": mappings,
        "specs": specs,
        "physics_config": {
            "max_braking_decel": 1.0,
            "brake_fill_time_s": 5,
        },
        "visuals": {"unit": "MPH", "color": "#3498db"},
        "_draft_note": "Revisar extends, notches y physics_config antes de usar en producción.",
    }


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
        draft_path = Path(f"profiles/{args.profile_draft}_draft.json")
        draft_path.parent.mkdir(parents=True, exist_ok=True)
        draft_path.write_text(json.dumps(draft, indent=4, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"[OK] Borrador perfil: {draft_path.resolve()}")

    if args.watch:
        watch_changes(args.watch)


if __name__ == "__main__":
    main()
