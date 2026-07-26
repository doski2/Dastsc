"""
POC: distancia a parada desde archivos de escenario/ruta (sin OCR ni memoria).

Lee TemplateStartDestMapping de ScenarioProperties.xml:
  - DestinationNameUIDs + DestinationDistance (metros por vía desde el origen del mapping)
  - Lat/Lon del punto de inicio de cada mapping

Combina con GetData.txt (velocidad, NX/NZ, RV) para estimar cadena y distancia restante.

Uso:
  python route-distance-poc.py
  python route-distance-poc.py --route cross-city --anchor-miles 6.49
  python route-distance-poc.py --watch 30 --anchor-miles 6.49
  python route-distance-poc.py --lat 52.52 --lon -1.86
"""
from __future__ import annotations

import argparse
import math
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_GETDATA = Path(
    r"C:\Program Files (x86)\Steam\steamapps\common\RailWorks\plugins\GetData.txt"
)
DEFAULT_RW = Path(r"C:\Program Files (x86)\Steam\steamapps\common\RailWorks")

MILES_TO_M = 1609.344

ROUTE_ALIASES = {
    "cross-city": "00000098-0000-0000-0000-000000002021",
    "birmingham": "00000098-0000-0000-0000-000000002021",
}


@dataclass(frozen=True)
class RouteStop:
    name: str
    guid: str
    distance_m: float  # metros desde el origen del mapping
    lat: float | None = None
    lon: float | None = None


@dataclass(frozen=True)
class RouteMapping:
    start_name: str
    start_guid: str
    start_lat: float | None
    start_lon: float | None
    stops: list[RouteStop]


@dataclass
class RouteProfile:
    route_id: str
    route_name: str
    scenario_name: str
    scenario_path: Path
    mappings: list[RouteMapping]


def parse_getdata_line(line: str) -> dict[str, float | str]:
    data: dict[str, float | str] = {}
    string_keys = {"RV", "StationName", "RouteID", "ScenarioPath", "location", "Location"}
    for token in line.strip().split("|"):
        if ":" not in token:
            continue
        key, val = token.split(":", 1)
        key = key.strip()
        if not key:
            continue
        if key in string_keys:
            data[key] = val.strip()
            continue
        try:
            num = float(val)
            data[key] = num if math.isfinite(num) else 0.0
        except ValueError:
            data[key] = val.strip()
    return data


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _extract_blocks(xml: str, tag: str) -> list[str]:
  pattern = re.compile(rf"<{tag}\b[^>]*>.*?</{tag}>", re.DOTALL)
  return pattern.findall(xml)


def _first_float(block: str, tag: str) -> float | None:
    m = re.search(rf"<{tag}[^>]*d:precision=\"string\">([^<]+)</{tag}>", block)
    if not m:
        return None
    try:
        return float(m.group(1))
    except ValueError:
        return None


def _first_guid(block: str, tag: str) -> str | None:
    m = re.search(rf"<{tag}>.*?<DevString[^>]*>([^<]+)</DevString>", block, re.DOTALL)
    return m.group(1).strip() if m else None


def _all_guids(block: str, tag: str) -> list[str]:
    section = re.search(rf"<{tag}>(.*?)</{tag}>", block, re.DOTALL)
    if not section:
        return []
    return re.findall(r"<DevString[^>]*>([^<]+)</DevString>", section.group(1))


def _all_floats(block: str, tag: str) -> list[float]:
    section = re.search(rf"<{tag}>(.*?)</{tag}>", block, re.DOTALL)
    if not section:
        return []
    vals: list[float] = []
    for raw in re.findall(r'd:precision="string">([^<]+)</e>', section.group(1)):
        try:
            vals.append(float(raw))
        except ValueError:
            pass
    return vals


def parse_station_names(xml: str) -> dict[str, str]:
    names: dict[str, str] = {}
    for block in _extract_blocks(xml, "Localisation-cUserLocalisedString"):
        key_m = re.search(r"<Key[^>]*>([^<]+)</Key>", block)
        eng_m = re.search(r"<English[^>]*>([^<]+)</English>", block)
        if not key_m or not eng_m:
            continue
        name = eng_m.group(1).strip()
        if not name or name.startswith("<supply"):
            continue
        names[key_m.group(1).strip().lower()] = name
    return names


def parse_route_profile(scenario_xml: Path, route_id: str, route_name: str) -> RouteProfile:
    xml = scenario_xml.read_text(encoding="utf-8", errors="replace")
    names = parse_station_names(xml)

    title_m = re.search(
        r"<DisplayName>.*?<English[^>]*>([^<]+)</English>",
        xml,
        re.DOTALL,
    )
    scenario_name = title_m.group(1).strip() if title_m else scenario_xml.parent.name

    mappings: list[RouteMapping] = []

    for block in _extract_blocks(xml, "sTemplateStartDestMapping"):
        start_guid = _first_guid(block, "StartNameUID")
        lat = _first_float(block, "Latitude")
        lon = _first_float(block, "Longitude")
        dest_guids = _all_guids(block, "DestinationNameUIDs")
        dest_dists = _all_floats(block, "DestinationDistance")

        if not start_guid or not dest_guids or not dest_dists:
            continue
        if len(dest_guids) != len(dest_dists):
            continue

        start_name = names.get(start_guid.lower(), start_guid)
        stops = [
            RouteStop(
                name=names.get(guid.lower(), guid),
                guid=guid,
                distance_m=dist,
            )
            for guid, dist in zip(dest_guids, dest_dists)
        ]

        mappings.append(
            RouteMapping(
                start_name=start_name,
                start_guid=start_guid,
                start_lat=lat,
                start_lon=lon,
                stops=stops,
            )
        )

    if not mappings:
        raise ValueError(f"Sin mappings en {scenario_xml}")

    return RouteProfile(
        route_id=route_id,
        route_name=route_name,
        scenario_name=scenario_name,
        scenario_path=scenario_xml,
        mappings=mappings,
    )


def find_route_dir(rw_root: Path, route_hint: str | None) -> tuple[str, str, Path]:
    routes = rw_root / "Content" / "Routes"
    if route_hint:
        rid = ROUTE_ALIASES.get(route_hint.lower(), route_hint)
        route_dir = routes / rid
        if not route_dir.is_dir():
            raise FileNotFoundError(f"Ruta no encontrada: {route_dir}")
        props = route_dir / "RouteProperties.xml"
        name = rid
        if props.is_file():
            m = re.search(r"<English[^>]*>([^<]+)</English>", props.read_text(encoding="utf-8", errors="replace"))
            if m:
                name = m.group(1).strip()
        return rid, name, route_dir

    # Heurística: Class 323 / RV 323* → Birmingham Cross City
    rid = ROUTE_ALIASES["cross-city"]
    route_dir = routes / rid
    props = route_dir / "RouteProperties.xml"
    name = "Birmingham Cross City"
    if props.is_file():
        m = re.search(r"<English[^>]*>([^<]+)</English>", props.read_text(encoding="utf-8", errors="replace"))
        if m:
            name = m.group(1).strip()
    return rid, name, route_dir


def pick_scenario(route_dir: Path, prefer: str | None = None) -> Path:
    scenarios = list(route_dir.glob("Scenarios/*/ScenarioProperties.xml"))
    if not scenarios:
        raise FileNotFoundError(f"Sin escenarios en {route_dir}")

    if prefer:
        for path in scenarios:
            xml = path.read_text(encoding="utf-8", errors="replace")
            if prefer.lower() in xml.lower():
                return path

    # Quick Drive con más DestinationDistance (perfil completo de línea)
    best: Path | None = None
    best_count = -1
    for path in scenarios:
        xml = path.read_text(encoding="utf-8", errors="replace")
        count = len(_all_floats(xml, "DestinationDistance"))
        if count > best_count:
            best_count = count
            best = path
    assert best is not None
    return best


@dataclass
class ActiveRoute:
    mapping: RouteMapping
    chainage_m: float


def next_stop_in_mapping(mapping: RouteMapping, chainage_m: float) -> tuple[RouteStop | None, float]:
    for stop in mapping.stops:
        if stop.distance_m > chainage_m + 1.0:
            return stop, stop.distance_m - chainage_m
    return None, 0.0


def pick_mapping_by_latlon(profile: RouteProfile, lat: float, lon: float) -> RouteMapping:
    best = profile.mappings[0]
    best_dist = float("inf")
    for mapping in profile.mappings:
        if mapping.start_lat is None or mapping.start_lon is None:
            continue
        d = haversine_m(lat, lon, mapping.start_lat, mapping.start_lon)
        if d < best_dist:
            best_dist = d
            best = mapping
    return best


def pick_mapping_by_anchor(profile: RouteProfile, hud_distance_m: float) -> tuple[RouteMapping, float]:
    """Elige mapping+cadena donde la siguiente parada está exactamente a hud_distance_m."""
    candidates: list[tuple[RouteMapping, float, RouteStop, float]] = []

    for mapping in profile.mappings:
        for stop in mapping.stops:
            chainage = stop.distance_m - hud_distance_m
            if chainage < -50:
                continue
            next_stop, dist = next_stop_in_mapping(mapping, chainage)
            if next_stop is None:
                continue
            if next_stop.guid != stop.guid:
                continue
            err = abs(dist - hud_distance_m)
            candidates.append((mapping, chainage, stop, err))

    if not candidates:
        # Fallback: mínimo error
        best_mapping = profile.mappings[0]
        best_chainage = 0.0
        best_err = float("inf")
        for mapping in profile.mappings:
            for stop in mapping.stops:
                chainage = stop.distance_m - hud_distance_m
                if chainage < -200:
                    continue
                _, dist = next_stop_in_mapping(mapping, chainage)
                if dist <= 0:
                    continue
                err = abs(dist - hud_distance_m)
                if err < best_err:
                    best_err = err
                    best_chainage = chainage
                    best_mapping = mapping
        return best_mapping, best_chainage

    # Preferir mapping con más paradas (servicio largo) si hay empate
    candidates.sort(key=lambda c: (c[3], -len(c[0].stops)))
    return candidates[0][0], candidates[0][1]


def resolve_active_route(
    profile: RouteProfile,
    chainage_m: float | None,
    anchor_miles: float | None,
    lat: float | None,
    lon: float | None,
) -> tuple[ActiveRoute, str]:
    if chainage_m is not None:
        # Mantener el mapping con más paradas como default al integrar odómetro
        mapping = max(profile.mappings, key=lambda m: len(m.stops))
        return ActiveRoute(mapping, chainage_m), "odómetro"

    if lat is not None and lon is not None:
        mapping = pick_mapping_by_latlon(profile, lat, lon)
        # Sin grafo de vía: aproximar cadena por distancia al origen del mapping
        assert mapping.start_lat is not None and mapping.start_lon is not None
        chainage = haversine_m(lat, lon, mapping.start_lat, mapping.start_lon)
        return ActiveRoute(mapping, chainage), "lat/lon"

    if anchor_miles is not None:
        mapping, chainage = pick_mapping_by_anchor(profile, anchor_miles * MILES_TO_M)
        return ActiveRoute(mapping, chainage), f"ancla HUD {anchor_miles} mi"

    mapping = max(profile.mappings, key=lambda m: len(m.stops))
    return ActiveRoute(mapping, 0.0), "sin calibrar"


def format_distance(m: float, mph: bool = True) -> str:
    if mph:
        return f"{m / MILES_TO_M:.2f} mi ({m:.0f} m)"
    return f"{m / 1000:.2f} km ({m:.0f} m)"


def run_once(
    profile: RouteProfile,
    telemetry: dict[str, float | str],
    chainage_m: float | None,
    active_mapping: RouteMapping | None,
    anchor_miles: float | None,
    lat: float | None,
    lon: float | None,
) -> tuple[float, RouteMapping]:
    speed = float(telemetry.get("CurrentSpeed", telemetry.get("Speed", 0)) or 0)
    rv = str(telemetry.get("RV", ""))
    nx = telemetry.get("NX")
    nz = telemetry.get("NZ")
    next_limit = telemetry.get("NextLimitDist")

    if active_mapping is not None and chainage_m is not None:
        active = ActiveRoute(active_mapping, chainage_m)
        mode = "odómetro"
    else:
        active, mode = resolve_active_route(profile, chainage_m, anchor_miles, lat, lon)

    stop, dist_m = next_stop_in_mapping(active.mapping, active.chainage_m)

    print(f"\nRuta:     {profile.route_name} ({profile.route_id})")
    print(f"Escenario: {profile.scenario_name}")
    print(f"Origen:   {active.mapping.start_name}")
    print(f"RV:       {rv or '(vacío)'}")
    if nx is not None and nz is not None:
        print(f"Pos NX/Z: {float(nx):.2f}, {float(nz):.2f}")
    print(f"Velocidad: {speed:.1f} m/s ({speed * 2.23694:.0f} mph)")
    if next_limit is not None:
        print(f"NextLimitDist (Lua): {float(next_limit):.0f} m")
    print(f"Cadena:   {active.chainage_m:.0f} m ({mode})")

    if stop:
        print(f"Próxima:  {stop.name}")
        print(f"Distancia: {format_distance(dist_m)}")
    else:
        print("Próxima:  (fin de ruta / sin parada)")

    return active.chainage_m, active.mapping


def main() -> None:
    parser = argparse.ArgumentParser(description="POC distancia a parada desde escenario TSC")
    parser.add_argument("--rw-root", type=Path, default=DEFAULT_RW)
    parser.add_argument("--getdata", type=Path, default=DEFAULT_GETDATA)
    parser.add_argument("--route", default="cross-city", help="alias o UUID de ruta")
    parser.add_argument("--scenario", default=None, help="filtro nombre escenario (ej. northbound)")
    parser.add_argument("--anchor-miles", type=float, default=None, help="calibrar con distancia HUD")
    parser.add_argument("--lat", type=float, default=None)
    parser.add_argument("--lon", type=float, default=None)
    parser.add_argument("--list-stops", action="store_true")
    parser.add_argument("--watch", type=float, default=0, help="segundos de seguimiento (odómetro)")
    args = parser.parse_args()

    _, route_name, route_dir = find_route_dir(args.rw_root, args.route)
    scenario_xml = pick_scenario(route_dir, args.scenario or "northbound")
    profile = parse_route_profile(scenario_xml, args.route, route_name)

    if args.list_stops:
        print(f"Mappings ({len(profile.mappings)}) — {profile.scenario_name}")
        for i, mapping in enumerate(profile.mappings, 1):
            geo = ""
            if mapping.start_lat is not None and mapping.start_lon is not None:
                geo = f" ({mapping.start_lat:.4f}, {mapping.start_lon:.4f})"
            print(f"\n[{i}] Desde: {mapping.start_name}{geo}")
            for stop in mapping.stops:
                print(f"      {stop.distance_m:8.0f} m  {stop.name}")
        return

    if not args.getdata.is_file():
        print(f"[!] No hay GetData: {args.getdata}")
        sys.exit(1)

    chainage: float | None = None
    active_mapping: RouteMapping | None = None
    last_sim_time: float | None = None
    end = time.time() + args.watch if args.watch > 0 else time.time()

    while True:
        line = args.getdata.read_text(encoding="utf-8", errors="replace").strip()
        telemetry = parse_getdata_line(line)

        sim_time = float(telemetry.get("SimulationTime", 0) or 0)
        speed = float(telemetry.get("CurrentSpeed", 0) or 0)

        if chainage is not None and last_sim_time is not None and sim_time > last_sim_time:
            dt = min(sim_time - last_sim_time, 2.0)
            chainage += speed * dt

        chainage, active_mapping = run_once(
            profile,
            telemetry,
            chainage,
            active_mapping,
            args.anchor_miles if chainage is None else None,
            args.lat,
            args.lon,
        )
        last_sim_time = sim_time

        if time.time() >= end:
            break
        time.sleep(0.5)


if __name__ == "__main__":
    main()
