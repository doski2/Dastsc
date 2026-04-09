"""
ScenarioIndex — Base de datos SQLite de todos los escenarios RailWorks instalados.

Flujo:
  1. `build_index()` escanea todos los Scenario.bin usando serz.exe para convertirlos
     a XML temporal, extrae paradas + metadatos y los guarda en SQLite.
  2. El índice se construye una sola vez (o se refresca manualmente).
  3. `list_scenarios()` lee de la BD → instantáneo, sin scans de disco.
  4. `get_stops(scenario_id)` devuelve paradas del jugador desde la BD.

Estructura BD:
  scenarios (id, route_id, name, loco, service, start_time, start_location,
             briefing, duration_mins, rating, initial_rv_json, has_current_save,
             scenario_dir, indexed_at)
  stops     (id, scenario_id, stop_order, name, type, hidden,
             due_time, arrive_time, depart_time, duration_secs)
"""

import glob
import json
import math
import os
import sqlite3
import subprocess
import tempfile
import time
import xml.etree.ElementTree as ET
import zipfile
from datetime import timedelta
from typing import Any, Dict, List, Optional

# ──────────────────────────────────────────────────────────────────────────────
# Constantes
# ──────────────────────────────────────────────────────────────────────────────

RW_BASE = r"C:\Program Files (x86)\Steam\steamapps\common\RailWorks"
SERZ_EXE = os.path.join(RW_BASE, "serz.exe")
ROUTES_PATH = os.path.join(RW_BASE, "Content", "Routes")

_DB_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
DB_PATH = os.path.join(_DB_DIR, "scenarios.db")

# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _secs_to_hhmm(secs_str: Optional[str]) -> str:
    if not secs_str:
        return "N/A"
    try:
        s = float(secs_str)
        if s <= 0:
            return "N/A"
        td = timedelta(seconds=int(s))
        t = int(td.total_seconds()) // 60
        return f"{t // 60:02d}:{t % 60:02d}"
    except (ValueError, TypeError):
        return "N/A"


def _en(node, xpath: str) -> str:
    """Extrae el texto del nodo English bajo xpath."""
    n = node.find(xpath + "/Localisation-cUserLocalisedString/English")
    return (n.text or "").strip() if n is not None else ""


def _txt(node, tag: str) -> str:
    n = node.find(tag)
    return (n.text or "").strip() if n is not None else ""


# ──────────────────────────────────────────────────────────────────────────────
# Conversión serz.exe
# ──────────────────────────────────────────────────────────────────────────────

def _convert_bin_to_xml(bin_path: str) -> Optional[str]:
    """
    Convierte un .bin de RailWorks a XML temporal usando serz.exe.
    Devuelve la ruta del fichero XML temporal, o None si falla.
    El llamador debe eliminar el archivo cuando termine.
    """
    if not os.path.exists(SERZ_EXE):
        return None
    try:
        fd, tmp_path = tempfile.mkstemp(suffix=".xml", prefix="dastsc_serz_")
        os.close(fd)
        result = subprocess.run(
            [SERZ_EXE, bin_path, f"/xml:{tmp_path}"],
            capture_output=True,
            timeout=30,
        )
        if result.returncode == 0 and os.path.exists(tmp_path):
            return tmp_path
        os.unlink(tmp_path)
        return None
    except Exception:
        return None


# ──────────────────────────────────────────────────────────────────────────────
# Extracción desde Scenario.bin (vía serz) o CurrentSave.xml
# ──────────────────────────────────────────────────────────────────────────────

def _extract_from_xml_root(root: ET.Element, start_secs: float = 0.0) -> Dict[str, Any]:
    """
    Extrae del XML (ya sea CurrentSave o Scenario convertido):
    - El cDriver con PlayerDriver=1 (o PlayerControlled=1)
    - Su ServiceName, InitialRV, y todas sus paradas
    Soporta cStopAtDestinations (waypoints y paradas) y cPickUpPassengers (paradas de pasajeros).
    start_secs: tiempo de inicio del escenario en segundos desde medianoche (para DueTimes relativas).
    """
    _STOP_TAGS = {"cStopAtDestinations", "cPickUpPassengers"}
    result: Dict[str, Any] = {
        "service": "",
        "initial_rv": [],
        "stops": [],
    }

    # Encontrar el cDriver del jugador
    player_driver = None
    for drv in root.iter("cDriver"):
        pd = drv.find("PlayerDriver")
        pc = drv.find("PlayerControlled")
        if (pd is not None and (pd.text or "").strip() == "1") or \
           (pc is not None and (pc.text or "").strip() == "1"):
            player_driver = drv
            break

    if player_driver is None:
        return result

    # ServiceName
    svc = player_driver.find("ServiceName/Localisation-cUserLocalisedString/English")
    if svc is not None and svc.text:
        result["service"] = svc.text.strip()

    # InitialRV
    for e in player_driver.findall("InitialRV/e"):
        if e.text:
            result["initial_rv"].append(e.text.strip())

    # Paradas: iterar cStopAtDestinations y cPickUpPassengers dentro del cDriverInstructionContainer
    dic = player_driver.find(".//cDriverInstructionContainer")
    if dic is None:
        return result

    order = 0
    for instr_node in dic.iter():
        if instr_node.tag not in _STOP_TAGS:
            continue

        target = instr_node.find("cDriverInstructionTarget")
        if target is None:
            target = instr_node.find("DeltaTarget/cDriverInstructionTarget")
        if target is None:
            continue

        hidden = _txt(target, "Hidden") == "1"
        if hidden:
            continue

        display_name = _txt(target, "DisplayName")
        if not display_name:
            continue

        # Tipo: cPickUpPassengers siempre es STOP; cStopAtDestinations respeta el flag Waypoint
        if instr_node.tag == "cPickUpPassengers":
            stop_type = "STOP"
        else:
            stop_type = "WAYPOINT" if _txt(target, "Waypoint") == "1" else "STOP"

        # DueTime — en Scenario.bin es relativa al inicio; en CurrentSave.xml es absoluta/0
        due_raw = _txt(target, "DueTime")
        due_time = "N/A"
        due_abs_secs = 0.0
        try:
            due_val = float(due_raw) if due_raw else 0.0
            if due_val > 0:
                # Comprobar si dueTime parece relativa (< 3600s = 1h) o absoluta (> 3600s)
                if due_val < 3600 and start_secs > 0:
                    due_abs_secs = start_secs + due_val
                else:
                    due_abs_secs = due_val
                due_time = _secs_to_hhmm(str(due_abs_secs))
        except (ValueError, TypeError):
            pass

        dur_secs_str = _txt(target, "Duration")
        try:
            dur_secs = int(float(dur_secs_str)) if dur_secs_str else 0
        except ValueError:
            dur_secs = 0

        # ArriveTime / DepartTime desde XML (usado en CurrentSave.xml)
        arrive_h = instr_node.find(".//ArriveTime/sTimeOfDay/_iHour")
        arrive_m = instr_node.find(".//ArriveTime/sTimeOfDay/_iMinute")
        depart_h = instr_node.find(".//DepartTime/sTimeOfDay/_iHour")
        depart_m = instr_node.find(".//DepartTime/sTimeOfDay/_iMinute")

        def _tod(h_node, m_node) -> str:
            if h_node is None or m_node is None:
                return "N/A"
            try:
                h, m = int(h_node.text or 0), int(m_node.text or 0)
                return f"{h:02d}:{m:02d}" if (h or m) else "N/A"
            except (ValueError, TypeError):
                return "N/A"

        arrive_time = _tod(arrive_h, arrive_m)
        depart_time = _tod(depart_h, depart_m)

        # Si no hay horarios XML pero tenemos due_abs_secs, calcular arrive desde due - dur
        if arrive_time == "N/A" and due_abs_secs > 0 and dur_secs > 0:
            arrive_time = _secs_to_hhmm(str(due_abs_secs - dur_secs))
        if depart_time == "N/A" and due_abs_secs > 0:
            depart_time = due_time

        result["stops"].append({
            "order": order,
            "name": display_name,
            "type": stop_type,
            "due_time": due_time,
            "arrive_time": arrive_time,
            "depart_time": depart_time,
            "duration_secs": dur_secs,
        })
        order += 1

    return result


def _read_scenario_props(scenario_dir: str) -> Dict[str, Any]:
    """Lee ScenarioProperties.xml para metadatos estáticos."""
    prop_path = os.path.join(scenario_dir, "ScenarioProperties.xml")
    result: Dict[str, Any] = {}
    if not os.path.exists(prop_path):
        return result
    try:
        root = ET.parse(prop_path).getroot()
        result["name"] = _en(root, ".//DisplayName") or ""
        result["start_location"] = _en(root, ".//StartLocation") or ""
        result["briefing"] = _en(root, ".//Briefing") or _en(root, ".//Description") or ""
        start_time_text = _txt(root, "StartTime")
        result["start_time"] = _secs_to_hhmm(start_time_text or None)
        try:
            result["start_time_secs"] = float(start_time_text) if start_time_text else 0.0
        except ValueError:
            result["start_time_secs"] = 0.0
        try:
            result["duration_mins"] = int(_txt(root, "DurationMins") or 0)
        except ValueError:
            result["duration_mins"] = 0
        try:
            result["rating"] = int(_txt(root, "Rating") or 0)
        except ValueError:
            result["rating"] = 0

        # Conductor jugador
        player_drv = None
        for drv in root.findall(".//FrontEndDriverList/sDriverFrontEndDetails"):
            pd = drv.find("PlayerDriver")
            if pd is not None and (pd.text or "").strip() == "1":
                player_drv = drv
                break
        if player_drv is None:
            drivers = root.findall(".//FrontEndDriverList/sDriverFrontEndDetails")
            if drivers:
                player_drv = drivers[0]

        if player_drv is not None:
            loco = player_drv.find("LocoName/Localisation-cUserLocalisedString/English")
            if loco is not None and loco.text:
                result["loco"] = loco.text.strip()
            ploc = player_drv.find("StartLocation/Localisation-cUserLocalisedString/English")
            if ploc is not None and ploc.text:
                result["start_location"] = ploc.text.strip()
    except Exception as exc:
        result["error"] = str(exc)
    return result


# ──────────────────────────────────────────────────────────────────────────────
# Base de datos
# ──────────────────────────────────────────────────────────────────────────────

def _get_conn() -> sqlite3.Connection:
    os.makedirs(_DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db(conn: sqlite3.Connection):
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS scenarios (
        id                TEXT PRIMARY KEY,
        route_id          TEXT,
        name              TEXT,
        loco              TEXT DEFAULT '',
        service           TEXT DEFAULT '',
        start_time        TEXT DEFAULT '',
        start_location    TEXT DEFAULT '',
        briefing          TEXT DEFAULT '',
        duration_mins     INTEGER DEFAULT 0,
        rating            INTEGER DEFAULT 0,
        initial_rv_json   TEXT DEFAULT '[]',
        has_current_save  INTEGER DEFAULT 0,
        scenario_dir      TEXT,
        indexed_at        REAL
    );

    CREATE TABLE IF NOT EXISTS stops (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        scenario_id   TEXT NOT NULL,
        stop_order    INTEGER,
        name          TEXT,
        type          TEXT DEFAULT 'STOP',
        due_time      TEXT DEFAULT 'N/A',
        arrive_time   TEXT DEFAULT 'N/A',
        depart_time   TEXT DEFAULT 'N/A',
        duration_secs INTEGER DEFAULT 0,
        entity_x      REAL DEFAULT NULL,
        entity_z      REAL DEFAULT NULL,
        FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_stops_scenario ON stops(scenario_id);

    CREATE TABLE IF NOT EXISTS route_entities (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        route_id   TEXT NOT NULL,
        name       TEXT NOT NULL,
        world_x    REAL NOT NULL,
        world_z    REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_route_entities_route ON route_entities(route_id);
    CREATE INDEX IF NOT EXISTS idx_route_entities_name  ON route_entities(route_id, name);
    """)
    # Migración: agregar columnas entity_x/z si no existen (BD antigua)
    try:
        conn.execute("ALTER TABLE stops ADD COLUMN entity_x REAL DEFAULT NULL")
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE stops ADD COLUMN entity_z REAL DEFAULT NULL")
    except Exception:
        pass
    conn.commit()


# ──────────────────────────────────────────────────────────────────────────────
# Extracción de posiciones de entidades desde Networks/Tracks.bin del AP file
# ──────────────────────────────────────────────────────────────────────────────

def _extract_far_coord(fc_elem: ET.Element):
    """
    Extrae el valor numérico de un cFarCoordinate.
    world = route_tile_index * 1024 + tile_local_offset
    """
    route_dist = None
    tile_dist = None
    rc = fc_elem.find(".//cRouteCoordinate/Distance")
    if rc is not None and rc.text:
        try:
            route_dist = float(rc.text.strip())
        except ValueError:
            pass
    tc = fc_elem.find(".//cTileCoordinate/Distance")
    if tc is not None and tc.text:
        try:
            tile_dist = float(tc.text.strip())
        except ValueError:
            pass
    if route_dist is not None and tile_dist is not None:
        return route_dist * 1024.0 + tile_dist
    if tile_dist is not None:
        return tile_dist
    return None


def _build_route_entity_index(route_id: str, conn: sqlite3.Connection) -> int:
    """
    Parsea Networks/Tracks.bin del MainContent.ap de una ruta y almacena en
    route_entities las posiciones mundiales de todos los cTrackMarkerComponent.
    Retorna el número de entidades indexadas.
    """
    ap_path = os.path.join(ROUTES_PATH, route_id, "MainContent.ap")
    if not os.path.exists(ap_path):
        return 0
    if not zipfile.is_zipfile(ap_path):
        return 0

    # Borrar entidades anteriores de esta ruta
    conn.execute("DELETE FROM route_entities WHERE route_id = ?", (route_id,))

    tracks_bin_data: bytes = b""
    try:
        with zipfile.ZipFile(ap_path, "r") as zf:
            if "Networks/Tracks.bin" in zf.namelist():
                tracks_bin_data = zf.read("Networks/Tracks.bin")
    except Exception:
        return 0

    if not tracks_bin_data:
        return 0

    # Escribir a temporal y convertir con serz
    fd, tmp_bin = tempfile.mkstemp(suffix=".bin", prefix="dastsc_tracks_")
    os.close(fd)
    fd2, tmp_xml = tempfile.mkstemp(suffix=".xml", prefix="dastsc_tracks_")
    os.close(fd2)
    try:
        with open(tmp_bin, "wb") as f:
            f.write(tracks_bin_data)
        result = subprocess.run(
            [SERZ_EXE, tmp_bin, f"/xml:{tmp_xml}"],
            capture_output=True,
            timeout=60,
        )
        if result.returncode != 0 or not os.path.exists(tmp_xml):
            return 0

        root = ET.parse(tmp_xml).getroot()
        count = 0
        for entity in root.findall(".//cOwnedEntity"):
            # Buscar el DisplayName del marker
            dn_elem = entity.find(".//Network-cTrackMarkerComponent/DisplayName")
            if dn_elem is None:
                continue
            dn = (dn_elem.text or "").strip()
            if not dn:
                continue

            # Extraer posición mundial desde cFarMatrix dentro de cPosOri
            far_matrix = entity.find(".//cPosOri/RFarMatrix/cFarMatrix")
            if far_matrix is None:
                continue

            x_fc = far_matrix.find("RFarPosition/cFarVector2/X/cFarCoordinate")
            z_fc = far_matrix.find("RFarPosition/cFarVector2/Z/cFarCoordinate")
            if x_fc is None or z_fc is None:
                continue

            world_x = _extract_far_coord(x_fc)
            world_z = _extract_far_coord(z_fc)
            if world_x is None or world_z is None:
                continue

            conn.execute(
                "INSERT INTO route_entities (route_id, name, world_x, world_z) VALUES (?,?,?,?)",
                (route_id, dn, world_x, world_z),
            )
            count += 1
        return count
    except Exception as exc:
        print(f"[ScenarioIndex] Error extrayendo entidades de {route_id}: {exc}")
        return 0
    finally:
        for p in (tmp_bin, tmp_xml):
            try:
                if os.path.exists(p):
                    os.unlink(p)
            except OSError:
                pass


def get_entity_position(route_id: str, entity_name: str, conn: sqlite3.Connection):
    """
    Devuelve (world_x, world_z) de la entidad más cercana al nombre dado,
    o (None, None) si no existe en el índice.
    """
    row = conn.execute(
        "SELECT world_x, world_z FROM route_entities "
        "WHERE route_id = ? AND name = ? LIMIT 1",
        (route_id, entity_name),
    ).fetchone()
    if row:
        return row["world_x"], row["world_z"]
    # Búsqueda parcial si no hay coincidencia exacta
    row = conn.execute(
        "SELECT world_x, world_z FROM route_entities "
        "WHERE route_id = ? AND name LIKE ? LIMIT 1",
        (route_id, f"%{entity_name}%"),
    ).fetchone()
    if row:
        return row["world_x"], row["world_z"]
    return None, None


def lookup_entity_position(route_id: str, entity_name: str):
    """
    Versión standalone de get_entity_position: abre y cierra su propio conn.
    Devuelve (world_x, world_z) o (None, None).
    """
    if not os.path.exists(DB_PATH):
        return None, None
    try:
        conn = _get_conn()
        result = get_entity_position(route_id, entity_name, conn)
        conn.close()
        return result
    except Exception:
        return None, None


def infer_world_position(route_id: str, nx: float, nz: float):
    """
    Infiere la posición mundial del tren usando NX/NZ (coordenadas tile-local,
    rango 0-1024) y snap al tile de la entidad más cercana de la ruta.

    Para cada entidad (ex, ez) de la ruta:
      tile_x = floor(ex / 1024), tile_z = floor(ez / 1024)
      candidato = (tile_x * 1024 + nx, tile_z * 1024 + nz)
      d = distancia(candidato, entidad)

    El tile cuya entidad minimiza 'd' es el tile actual del tren.
    Devuelve (world_x, world_z) o (None, None).
    """
    if not os.path.exists(DB_PATH):
        return None, None
    try:
        conn = _get_conn()
        rows = conn.execute(
            "SELECT world_x, world_z FROM route_entities WHERE route_id = ?",
            (route_id,)
        ).fetchall()
        conn.close()
        if not rows:
            return None, None

        best_dist = None
        best_tile_x = None
        best_tile_z = None
        for row in rows:
            ex = row["world_x"]
            ez = row["world_z"]
            tile_x = math.floor(ex / 1024)
            tile_z = math.floor(ez / 1024)
            cand_x = tile_x * 1024.0 + nx
            cand_z = tile_z * 1024.0 + nz
            d = math.sqrt((cand_x - ex) ** 2 + (cand_z - ez) ** 2)
            if best_dist is None or d < best_dist:
                best_dist = d
                best_tile_x = tile_x
                best_tile_z = tile_z

        if best_tile_x is None or best_tile_z is None:
            return None, None

        return best_tile_x * 1024.0 + nx, best_tile_z * 1024.0 + nz
    except Exception:
        return None, None


# ──────────────────────────────────────────────────────────────────────────────
# Indexación
# ──────────────────────────────────────────────────────────────────────────────

def _index_one(scenario_dir: str, conn: sqlite3.Connection) -> bool:
    """
    Indexa un escenario. Devuelve True si se procesó correctamente.
    Prioridad: CurrentSave.xml > Scenario.bin (via serz).
    """
    scenario_guid = os.path.basename(scenario_dir)
    route_guid = os.path.basename(os.path.dirname(os.path.dirname(scenario_dir)))

    props = _read_scenario_props(scenario_dir)
    name = props.get("name") or scenario_guid

    current_save = os.path.join(scenario_dir, "CurrentSave.xml")
    scenario_bin = os.path.join(scenario_dir, "Scenario.bin")
    has_current_save = os.path.exists(current_save)

    now = time.time()
    dynamic: Dict[str, Any] = {"service": "", "initial_rv": [], "stops": []}

    xml_source = None
    tmp_file = None
    start_secs = props.get("start_time_secs", 0.0)
    try:
        if has_current_save:
            xml_source = current_save
        elif os.path.exists(scenario_bin):
            tmp_file = _convert_bin_to_xml(scenario_bin)
            xml_source = tmp_file

        if xml_source:
            root = ET.parse(xml_source).getroot()
            dynamic = _extract_from_xml_root(root, start_secs=start_secs)
    except Exception:
        pass
    finally:
        if tmp_file and os.path.exists(tmp_file):
            try:
                os.unlink(tmp_file)
            except OSError:
                pass
    conn.execute("""
        INSERT OR REPLACE INTO scenarios
            (id, route_id, name, loco, service, start_time, start_location,
             briefing, duration_mins, rating, initial_rv_json, has_current_save,
             scenario_dir, indexed_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (
        scenario_guid, route_guid,
        name,
        props.get("loco", ""),
        dynamic.get("service") or "",
        props.get("start_time", ""),
        props.get("start_location", ""),
        props.get("briefing", ""),
        props.get("duration_mins", 0),
        props.get("rating", 0),
        json.dumps(dynamic.get("initial_rv", [])),
        1 if has_current_save else 0,
        scenario_dir,
        now,
    ))

    # Reemplazar paradas y añadir entity_x/z desde route_entities
    conn.execute("DELETE FROM stops WHERE scenario_id = ?", (scenario_guid,))
    for stop in dynamic.get("stops", []):
        entity_name = stop.get("name", "")
        ex, ez = get_entity_position(route_guid, entity_name, conn)
        conn.execute("""
            INSERT INTO stops (scenario_id, stop_order, name, type,
                               due_time, arrive_time, depart_time, duration_secs,
                               entity_x, entity_z)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        """, (
            scenario_guid,
            stop["order"], stop["name"], stop["type"],
            stop["due_time"], stop["arrive_time"],
            stop["depart_time"], stop["duration_secs"],
            ex, ez,
        ))

    return True


def build_index(
    progress_callback=None,
    route_filter: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Construye (o reconstruye) el índice completo de escenarios.
    
    Args:
        progress_callback: callable(current, total, name) para reportar progreso
        route_filter: si se especifica, solo indexa esa ruta (GUID de ruta)
    
    Returns:
        {"total": N, "ok": M, "failed": K, "elapsed": T}
    """
    if route_filter:
        pattern = os.path.join(ROUTES_PATH, route_filter, "Scenarios", "*")
    else:
        pattern = os.path.join(ROUTES_PATH, "*", "Scenarios", "*")

    scenario_dirs = [
        d for d in glob.glob(pattern)
        if os.path.isdir(d) and os.path.exists(os.path.join(d, "ScenarioProperties.xml"))
    ]

    total = len(scenario_dirs)
    ok = 0
    failed = 0
    start = time.time()

    conn = _get_conn()
    _init_db(conn)

    # Indexar entidades de ruta (Tracks.bin) para las rutas implicadas
    route_ids = set()
    for sdir in scenario_dirs:
        # Estructura: ROUTES_PATH / route_id / Scenarios / scenario_guid
        parts = sdir.replace("\\", "/").split("/")
        # Buscar 'Scenarios' en el path para encontrar el route_id
        try:
            sc_idx = parts.index("Scenarios")
            route_ids.add(parts[sc_idx - 1])
        except ValueError:
            pass
    for rid in route_ids:
        count = _build_route_entity_index(rid, conn)
        if count > 0:
            print(f"[ScenarioIndex] Ruta {rid}: {count} entidades indexadas")
    conn.commit()

    for i, sdir in enumerate(scenario_dirs):
        name = os.path.basename(sdir)
        if progress_callback:
            progress_callback(i + 1, total, name)
        try:
            _index_one(sdir, conn)
            ok += 1
        except Exception as exc:
            print(f"[ScenarioIndex] Error indexando {sdir}: {exc}")
            failed += 1
        # Commit cada 20 escenarios para no mantener todo en memoria
        if (i + 1) % 20 == 0:
            conn.commit()

    conn.commit()
    conn.close()

    elapsed = time.time() - start
    print(f"[ScenarioIndex] Indexación completa: {ok}/{total} OK, {failed} errores, {elapsed:.1f}s")
    return {"total": total, "ok": ok, "failed": failed, "elapsed": round(elapsed, 1)}


def index_needs_rebuild() -> bool:
    """True si la BD no existe o está vacía."""
    if not os.path.exists(DB_PATH):
        return True
    try:
        conn = _get_conn()
        _init_db(conn)
        count = conn.execute("SELECT COUNT(*) FROM scenarios").fetchone()[0]
        conn.close()
        return count == 0
    except Exception:
        return True


# ──────────────────────────────────────────────────────────────────────────────
# Consultas
# ──────────────────────────────────────────────────────────────────────────────

def list_scenarios(
    active_save_path: Optional[str] = None,
    forced_save_path: Optional[str] = None,
    forced_scenario_id: Optional[str] = None,
) -> List[Dict]:
    """
    Devuelve todos los escenarios indexados.
    Marca is_active según el forced_save_path o active_save_path.
    """
    if not os.path.exists(DB_PATH):
        return []
    try:
        conn = _get_conn()
        rows = conn.execute("""
            SELECT id, route_id, name, loco, service, start_time, start_location,
                   briefing, duration_mins, rating, initial_rv_json,
                   has_current_save, scenario_dir
            FROM scenarios
            ORDER BY name COLLATE NOCASE
        """).fetchall()
        conn.close()
    except Exception:
        return []

    result = []
    for row in rows:
        sdir = row["scenario_dir"]
        save_path = os.path.join(sdir, "CurrentSave.xml") if row["has_current_save"] else None

        is_active = False
        if forced_scenario_id:
            is_active = row["id"] == forced_scenario_id
        elif forced_save_path and save_path:
            is_active = os.path.normcase(forced_save_path) == os.path.normcase(save_path)
        elif not forced_save_path and not forced_scenario_id and active_save_path and save_path:
            is_active = os.path.normcase(active_save_path) == os.path.normcase(save_path)

        result.append({
            "id": row["id"],
            "route_id": row["route_id"],
            "name": row["name"],
            "loco": row["loco"],
            "service": row["service"],
            "start_time": row["start_time"],
            "start_location": row["start_location"],
            "briefing": row["briefing"],
            "duration_mins": row["duration_mins"],
            "rating": row["rating"],
            "initial_rv": json.loads(row["initial_rv_json"] or "[]"),
            "has_save": bool(row["has_current_save"]),
            "save_path": save_path,
            "is_active": is_active,
        })

    return result


def get_stops(scenario_id: str) -> List[Dict]:
    """Devuelve las paradas de un escenario desde la BD (incluye entity_x/z)."""
    if not os.path.exists(DB_PATH):
        return []
    try:
        conn = _get_conn()
        rows = conn.execute("""
            SELECT name, type, due_time, arrive_time, depart_time, duration_secs,
                   entity_x, entity_z
            FROM stops
            WHERE scenario_id = ?
            ORDER BY stop_order
        """, (scenario_id,)).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception:
        return []


def find_scenario_by_rv(rv: str) -> Optional[Dict[str, Any]]:
    """
    Busca en el índice el escenario cuyo initial_rv_json contiene el RV del jugador.
    El RV del telemetry tiene formato 'XXXXXX_YYYYY;Dest=ZZ' — se compara por la
    parte base antes del ';' para mayor robustez.
    Devuelve el dict del escenario o None si no se encuentra.
    """
    if not rv or not os.path.exists(DB_PATH):
        return None
    rv_base = rv.split(";")[0].strip()  # e.g., "323241_65041"
    try:
        conn = _get_conn()
        # LIKE search para una preselección rápida antes de comparar exactamente
        rows = conn.execute(
            "SELECT id, name, scenario_dir, has_current_save, initial_rv_json "
            "FROM scenarios WHERE initial_rv_json LIKE ?",
            (f"%{rv_base}%",),
        ).fetchall()
        conn.close()
        for row in rows:
            stored_rvs = json.loads(row["initial_rv_json"] or "[]")
            for stored_rv in stored_rvs:
                stored_base = stored_rv.split(";")[0].strip()
                if rv_base == stored_base or rv_base in stored_rv or stored_base in rv_base:
                    return dict(row)
    except Exception:
        pass
    return None


def get_scenario_dir(scenario_id: str) -> Optional[str]:
    """Devuelve scenario_dir para un GUID dado, o None si no está en el índice."""
    if not os.path.exists(DB_PATH):
        return None
    try:
        conn = _get_conn()
        row = conn.execute(
            "SELECT scenario_dir FROM scenarios WHERE id = ?", (scenario_id,)
        ).fetchone()
        conn.close()
        return row["scenario_dir"] if row else None
    except Exception:
        return None


def get_index_stats() -> Dict[str, Any]:
    """Estadísticas del índice actual."""
    if not os.path.exists(DB_PATH):
        return {"status": "not_built", "total": 0, "with_save": 0, "with_stops": 0}
    try:
        conn = _get_conn()
        _init_db(conn)
        total = conn.execute("SELECT COUNT(*) FROM scenarios").fetchone()[0]
        with_save = conn.execute(
            "SELECT COUNT(*) FROM scenarios WHERE has_current_save=1"
        ).fetchone()[0]
        with_stops = conn.execute(
            "SELECT COUNT(DISTINCT scenario_id) FROM stops"
        ).fetchone()[0]
        db_size = os.path.getsize(DB_PATH)
        conn.close()
        return {
            "status": "ready",
            "total": total,
            "with_save": with_save,
            "with_stops": with_stops,
            "db_size_kb": round(db_size / 1024),
        }
    except Exception as exc:
        return {"status": "error", "error": str(exc)}
