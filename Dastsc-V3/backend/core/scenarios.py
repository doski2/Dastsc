import xml.etree.ElementTree as ET
import os
import glob
import time
from typing import Dict, Optional, Any
from datetime import timedelta


def _parse_time_of_day(node) -> str:
    """Convierte un nodo sTimeOfDay {_iHour, _iMinute, _iSeconds} a 'HH:MM'."""
    if node is None:
        return "N/A"
    h_node = node.find("_iHour")
    m_node = node.find("_iMinute")
    if h_node is None or m_node is None:
        return "N/A"
    try:
        h = int(h_node.text or 0)
        m = int(m_node.text or 0)
    except ValueError:
        return "N/A"
    if h == 0 and m == 0:
        return "N/A"
    return f"{h:02d}:{m:02d}"


def _parse_seconds(node) -> str:
    """Convierte un nodo con segundos desde medianoche a 'HH:MM'. Devuelve N/A si es 0."""
    if node is None or not node.text:
        return "N/A"
    try:
        secs = float(node.text)
    except ValueError:
        return "N/A"
    if secs <= 0:
        return "N/A"
    td = timedelta(seconds=int(secs))
    total_minutes = int(td.total_seconds()) // 60
    return f"{total_minutes // 60:02d}:{total_minutes % 60:02d}"


class ScenarioManager:
    """
    Gestiona la extracción de datos de escenarios de RailWorks (TS Classic).
    Lee CurrentSave.xml (estado en tiempo real) y ScenarioProperties.xml (metadatos).

    Estructura XML clave de CurrentSave.xml:
      cDriver [PlayerDriver=1]
        ServiceName/Localisation-cUserLocalisedString/English  → nombre del servicio
        StartTime                                               → segundos desde medianoche
        DriverInstructionContainer/cDriverInstructionContainer/DriverInstruction/
          cStopAtDestinations                                   → cada parada/waypoint
            Active                  → 1 si es la parada actual
            Started                 → 1 si se inició
            Satisfied               → 1 si se completó
            ArriveTime/sTimeOfDay   → hora de llegada programada (HH:MM, puede ser 0)
            DepartTime/sTimeOfDay   → hora de salida programada (HH:MM, puede ser 0)
            DeltaTarget/cDriverInstructionTarget/
              DisplayName           → nombre de la estación
              Waypoint              → 1 = waypoint, 0 = parada real
              Hidden                → 1 = oculto (no mostrar)
              ProgressCode          → INSTRUCTION_STATE_{INACTIVE|ACTIVE|SUCCEEDED|FAILED}
              DueTime               → segundos hasta el deadline (0 si no aplica)
              Duration              → tiempo de parada en segundos
    """

    def __init__(
        self, rw_path: str = r"C:\Program Files (x86)\Steam\steamapps\common\RailWorks"
    ):
        self.rw_path = rw_path
        self.content_path = os.path.join(rw_path, "Content", "Routes")
        self._cached_save_path: Optional[str] = None
        self._last_search_time = 0
        # Selección manual: cuando está activa, se ignora la autodetección por mtime
        self._forced_save_path: Optional[str] = None
        # Selección por ID (soporta escenarios sin CurrentSave.xml)
        self._forced_scenario_id: Optional[str] = None
        self._forced_scenario_dir: Optional[str] = None
        # Último RV del jugador recibido desde la telemetría (ej: "323241_65041;Dest=53")
        self._last_player_rv: Optional[str] = None

    def update_player_rv(self, rv: str) -> None:
        """Actualiza el RV del tren del jugador desde la telemetría en tiempo real."""
        if rv:
            self._last_player_rv = rv

    def select_manual_scenario(self, save_path: str) -> bool:
        """Fija manualmente el CurrentSave.xml a usar. Devuelve False si no existe."""
        if not os.path.exists(save_path):
            return False
        self._forced_save_path = save_path
        self._cached_save_path = save_path
        self._forced_scenario_id = None
        self._forced_scenario_dir = None
        return True

    def select_by_id(self, scenario_id: str, scenario_dir: str) -> bool:
        """
        Selecciona un escenario por su GUID. Funciona tanto con escenarios jugados
        (que tienen CurrentSave.xml) como con escenarios no jugados (datos del índice).
        """
        self._forced_scenario_id = scenario_id
        self._forced_scenario_dir = scenario_dir
        save_path = os.path.join(scenario_dir, "CurrentSave.xml")
        if os.path.exists(save_path):
            self._forced_save_path = save_path
            self._cached_save_path = save_path
        else:
            self._forced_save_path = None
        return True

    def clear_manual_scenario(self):
        """Vuelve al modo autodetección."""
        self._forced_save_path = None
        self._forced_scenario_id = None
        self._forced_scenario_dir = None
        self._cached_save_path = None
        self._last_search_time = 0

    def list_all_scenarios(self):
        """
        Devuelve todos los escenarios instalados con CurrentSave.xml, leyendo
        el nombre del escenario desde ScenarioProperties.xml.
        """
        pattern = os.path.join(self.content_path, "*", "Scenarios", "*", "CurrentSave.xml")
        save_files = glob.glob(pattern)
        results = []
        for save_path in save_files:
            scenario_dir = os.path.dirname(save_path)
            scenario_guid = os.path.basename(scenario_dir)
            route_guid = os.path.basename(os.path.dirname(os.path.dirname(scenario_dir)))
            props = self._read_scenario_properties(scenario_dir)
            name = props.get("scenario_name") or props.get("service_name") or scenario_guid
            results.append({
                "id": scenario_guid,
                "route_id": route_guid,
                "name": name,
                "loco": props.get("loco_name", ""),
                "service": props.get("service_name", ""),
                "start_time": props.get("start_time", ""),
                "start_location": props.get("player_start_location") or props.get("start_location", ""),
                "briefing": props.get("briefing", ""),
                "duration_mins": props.get("duration_mins", 0),
                "rating": props.get("rating", 0),
                "save_path": save_path,
                "is_active": self._forced_save_path == save_path
                             or (not self._forced_save_path and self._cached_save_path == save_path),
            })
        # Ordenar: activo primero, luego por nombre
        results.sort(key=lambda s: (not s["is_active"], s["name"].lower()))
        return results

    def find_active_scenario(self) -> Optional[Dict[str, Any]]:
        """
        Detecta el escenario activo. Si hay selección manual la usa directamente;
        si no, busca el CurrentSave.xml modificado más recientemente.
        Cachea el resultado 10 segundos para evitar scans de disco continuos.
        """
        # Selección manual con CurrentSave.xml tiene prioridad absoluta
        if self._forced_save_path:
            try:
                mtime = os.path.getmtime(self._forced_save_path)
                return {"save_path": self._forced_save_path, "mtime": mtime}
            except OSError:
                self._forced_save_path = None  # roto → fallback

        # Selección por ID sin CurrentSave.xml (escenario no jugado aún)
        if self._forced_scenario_id and self._forced_scenario_dir and not self._forced_save_path:
            return {
                "save_path": None,
                "scenario_id": self._forced_scenario_id,
                "scenario_dir": self._forced_scenario_dir,
                "has_save": False,
            }

        now = time.time()

        if self._cached_save_path and (now - self._last_search_time < 10.0):
            try:
                mtime = os.path.getmtime(self._cached_save_path)
                return {"save_path": self._cached_save_path, "mtime": mtime}
            except OSError:
                pass

        self._last_search_time = now

        # Intentar primero por RV del jugador (más preciso que mtime)
        if self._last_player_rv:
            try:
                import core.scenario_index as _si
                matched = _si.find_scenario_by_rv(self._last_player_rv)
                if matched:
                    scenario_dir = matched["scenario_dir"]
                    save_path = os.path.join(scenario_dir, "CurrentSave.xml")
                    if os.path.exists(save_path):
                        mtime = os.path.getmtime(save_path)
                        self._cached_save_path = save_path
                        return {"save_path": save_path, "mtime": mtime}
                    else:
                        # Escenario recién empezado sin save — usar datos del índice
                        return {
                            "save_path": None,
                            "scenario_id": matched["id"],
                            "scenario_dir": scenario_dir,
                            "has_save": False,
                        }
            except Exception:
                pass

        search_pattern = os.path.join(
            self.content_path, "*", "Scenarios", "*", "CurrentSave.xml"
        )
        save_files = glob.glob(search_pattern)

        if not save_files:
            self._cached_save_path = None
            return None

        latest_save = max(save_files, key=os.path.getmtime)
        self._cached_save_path = latest_save
        return {"save_path": latest_save, "mtime": os.path.getmtime(latest_save)}

    def _read_scenario_properties(self, scenario_dir: str) -> Dict[str, Any]:
        """
        Lee ScenarioProperties.xml para obtener metadatos estáticos del escenario:
        nombre, descripción, servicio del jugador, hora de inicio, duración, rating.
        """
        prop_path = os.path.join(scenario_dir, "ScenarioProperties.xml")
        result = {}
        if not os.path.exists(prop_path):
            return result
        try:
            tree = ET.parse(prop_path)
            root = tree.getroot()

            def _en(xpath):
                node = root.find(xpath + "/Localisation-cUserLocalisedString/English")
                return (node.text or "").strip() if node is not None else ""

            result["scenario_name"] = _en(".//DisplayName") or ""
            result["start_location"] = _en(".//StartLocation") or ""

            briefing = _en(".//Briefing")
            description = _en(".//Description")
            result["briefing"] = briefing or description

            start_time_node = root.find("StartTime")
            if start_time_node is not None:
                result["start_time"] = _parse_seconds(start_time_node)

            dur_node = root.find("DurationMins")
            if dur_node is not None and dur_node.text:
                try:
                    result["duration_mins"] = int(dur_node.text.strip())
                except ValueError:
                    pass

            rating_node = root.find("Rating")
            if rating_node is not None and rating_node.text:
                try:
                    result["rating"] = int(rating_node.text.strip())
                except ValueError:
                    pass

            # Buscar el conductor del jugador (PlayerDriver=1) para servicio y loco
            player_driver = None
            for drv in root.findall(".//FrontEndDriverList/sDriverFrontEndDetails"):
                pd_node = drv.find("PlayerDriver")
                if pd_node is not None and (pd_node.text or "").strip() == "1":
                    player_driver = drv
                    break
            # Si ninguno tiene PlayerDriver=1, tomar el primero
            if player_driver is None:
                drivers = root.findall(".//FrontEndDriverList/sDriverFrontEndDetails")
                if drivers:
                    player_driver = drivers[0]

            if player_driver is not None:
                svc_node = player_driver.find("ServiceName/Localisation-cUserLocalisedString/English")
                if svc_node is not None and svc_node.text:
                    result["service_name"] = svc_node.text.strip()
                loco_node = player_driver.find("LocoName/Localisation-cUserLocalisedString/English")
                if loco_node is not None and loco_node.text:
                    result["loco_name"] = loco_node.text.strip()
                ploc_node = player_driver.find("StartLocation/Localisation-cUserLocalisedString/English")
                if ploc_node is not None and ploc_node.text:
                    result["player_start_location"] = ploc_node.text.strip()

        except Exception as e:
            result["error_props"] = str(e)

        return result

    def get_detailed_scenario_data(self, player_rv: Optional[str] = None) -> Dict[str, Any]:
        """
        Extrae paradas, horarios y progreso del escenario activo.

        Fuentes (en orden de prioridad):
        1. CurrentSave.xml — estado dinámico: paradas, estados, tiempos reales.
        2. ScenarioProperties.xml — metadatos estáticos: nombre, loco, hora de inicio.
        """
        # Usar RV pasado explícitamente o el cacheado desde la última trama de telemetría
        effective_rv = player_rv or self._last_player_rv
        active = self.find_active_scenario()
        if not active:
            return {"error": "No active scenario found"}

        save_path = active.get("save_path")
        data: Dict[str, Any] = {
            "scenario_info": {},
            "stops": [],
            "current_progress": {},
        }

        # Calcular scenario_dir y scenario_id
        if save_path:
            scenario_dir = os.path.dirname(save_path)
            scenario_id = os.path.basename(scenario_dir)
        else:
            scenario_dir = active.get("scenario_dir", "")
            scenario_id = active.get("scenario_id") or os.path.basename(scenario_dir)

        # Sin CurrentSave.xml → datos estáticos del índice SQLite + ScenarioProperties
        if not save_path:
            props = self._read_scenario_properties(scenario_dir)
            for key in ("scenario_name", "service_name", "start_location", "start_time", "loco_name"):
                if key in props:
                    data["scenario_info"][key] = props[key]
            if scenario_id:
                try:
                    import core.scenario_index as _si
                    for s in _si.get_stops(scenario_id):
                        data["stops"].append({
                            "station_name": s["name"],
                            "arrival_time": s["arrive_time"],
                            "departure_time": s["depart_time"],
                            "due_time": s["due_time"],
                            "dwell_secs": s["duration_secs"],
                            "status": "INACTIVE",
                            "type": s["type"],
                        })
                except Exception as exc:
                    data["error_index"] = str(exc)
            return data

        # --- 1. CurrentSave.xml (estado en tiempo real) ---
        try:
            tree = ET.parse(save_path)
            root = tree.getroot()

            # Tiempo de simulación actual
            time_node = root.find(".//SimulationTime")
            if time_node is not None and time_node.text:
                data["current_progress"]["simulation_time"] = _parse_seconds(time_node)

            # Distancia total recorrida
            dist_node = root.find(".//DistanceTraveled")
            if dist_node is not None and dist_node.text:
                try:
                    data["current_progress"]["distance_meters"] = float(dist_node.text)
                except ValueError:
                    pass

            # Localizar el cDriver del jugador
            # Prioridad: coincidencia por RV (más específico) → PlayerDriver=1 (fallback)
            player_driver = None
            rv_match: Any = None
            pd_match: Any = None

            # Base del RV eliminando el sufijo ;Dest=XX (ej: "323241_65041;Dest=53" → "323241_65041")
            rv_base = effective_rv.split(";")[0].strip() if effective_rv else ""

            for driver in root.findall(".//cDriver"):
                # 1) Coincidencia por RV: comparación bidireccional para cubrir rutas largas
                if rv_base and rv_match is None:
                    for rv_node in driver.findall(".//InitialRV/e"):
                        txt = (rv_node.text or "").strip()
                        if txt and (rv_base in txt or txt in rv_base):
                            rv_match = driver
                            break

                # 2) Fallback: PlayerDriver=1
                if pd_match is None:
                    pd_node = driver.find("PlayerDriver")
                    if pd_node is not None and (pd_node.text or "").strip() == "1":
                        pd_match = driver

            player_driver = rv_match or pd_match

            if player_driver is not None:
                # Nombre y hora de inicio del servicio
                svc_node = player_driver.find(
                    "ServiceName/Localisation-cUserLocalisedString/English"
                )
                if svc_node is not None and svc_node.text:
                    data["scenario_info"]["service_name"] = svc_node.text

                start_node = player_driver.find("StartTime")
                if start_node is not None and start_node.text:
                    data["scenario_info"]["service_start_time"] = _parse_seconds(start_node)

                # Iterar sobre TODAS las instrucciones cStopAtDestinations
                for stop in player_driver.findall(".//cStopAtDestinations"):

                    # Obtener el cDriverInstructionTarget dentro de DeltaTarget
                    target = stop.find("DeltaTarget/cDriverInstructionTarget")
                    if target is None:
                        continue

                    # Saltar paradas ocultas
                    hidden_node = target.find("Hidden")
                    if hidden_node is not None and hidden_node.text == "1":
                        continue

                    # Nombre de la estación/destino
                    disp_node = target.find("DisplayName")
                    station_name = "Unknown"
                    if disp_node is not None and disp_node.text:
                        station_name = disp_node.text

                    # Tipo: waypoint de paso o parada real
                    wp_node = target.find("Waypoint")
                    stop_type = "WAYPOINT" if (wp_node is not None and wp_node.text == "1") else "STOP"

                    # Estado: usar Satisfied/Active del nivel superior + ProgressCode en target
                    satisfied = stop.find("Satisfied")
                    active_flag = stop.find("Active")
                    prog_node = target.find("ProgressCode")

                    raw_prog = prog_node.text if prog_node is not None else ""
                    progress_code = raw_prog.replace("INSTRUCTION_STATE_", "") if raw_prog else "INACTIVE"

                    # Normalizar estado: dar prioridad a flags booleanos del save
                    if satisfied is not None and satisfied.text == "1":
                        status = "SUCCEEDED"
                    elif active_flag is not None and active_flag.text == "1":
                        status = "ACTIVE"
                    else:
                        status = progress_code if progress_code else "INACTIVE"

                    # Horarios programados (nivel superior del cStopAtDestinations)
                    arr_tod = stop.find("ArriveTime/sTimeOfDay")
                    dep_tod = stop.find("DepartTime/sTimeOfDay")
                    arrival_time = _parse_time_of_day(arr_tod)
                    departure_time = _parse_time_of_day(dep_tod)

                    # Fallback: DueTime en segundos (deadline de la instrucción)
                    due_node = target.find("DueTime")
                    due_time = _parse_seconds(due_node) if due_node is not None else "N/A"

                    # Tiempo de parada programado (segundos)
                    dur_node = target.find("Duration")
                    dwell_secs = 0
                    if dur_node is not None and dur_node.text:
                        try:
                            dwell_secs = int(dur_node.text)
                        except ValueError:
                            pass

                    data["stops"].append({
                        "station_name": station_name,
                        "arrival_time": arrival_time,
                        "departure_time": departure_time,
                        "due_time": due_time,
                        "dwell_secs": dwell_secs,
                        "status": status,
                        "type": stop_type,
                    })

        except Exception as e:
            data["error_save"] = str(e)

        # --- 2. ScenarioProperties.xml (metadatos estáticos como fallback) ---
        props = self._read_scenario_properties(scenario_dir)
        # Completar scenario_info con datos estáticos que no estén ya presentes
        for key in ("scenario_name", "start_location", "start_time", "loco_name"):
            if key in props and key not in data["scenario_info"]:
                data["scenario_info"][key] = props[key]
        # service_name del Properties solo si el save no lo aportó
        if "service_name" in props and "service_name" not in data["scenario_info"]:
            data["scenario_info"]["service_name"] = props["service_name"]
        if "error_props" in props:
            data["error_props"] = props["error_props"]

        return data


if __name__ == "__main__":
    mgr = ScenarioManager()
    print("Buscando escenario activo...")
    detail = mgr.get_detailed_scenario_data()
    import json
    print(json.dumps(detail, indent=2))
