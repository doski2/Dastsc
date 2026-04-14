import xml.etree.ElementTree as ET
import math
import os
import glob
import time
from typing import Dict, List, Optional, Any
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


def _secs_to_hhmm(total_secs: float) -> str:
    """Convierte segundos absolutos desde medianoche a 'HH:MM'."""
    s = int(total_secs)
    return f"{(s // 3600) % 24:02d}:{(s % 3600) // 60:02d}"


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
        self._forced_save_path: Optional[str] = None   # manual override (ignores mtime autodetect)
        self._forced_scenario_id: Optional[str] = None # by GUID (supports unplayed scenarios)
        self._forced_scenario_dir: Optional[str] = None
        self._last_player_rv: Optional[str] = None     # e.g. "323241_65041;Dest=53"
        self._last_train_x: Optional[float] = None     # world coords (tile*1024 + offset)
        self._last_train_z: Optional[float] = None
        self._cached_route_id: Optional[str] = None    # avoids find_active_scenario() every frame
        self._stop_entity_cache: List[tuple] = []      # entity positions for per-frame distance refresh

    def update_player_rv(self, rv: str) -> None:
        """Actualiza el RV del tren del jugador desde la telemetría en tiempo real."""
        if rv:
            self._last_player_rv = rv

    def update_train_position(self, world_x: float, world_z: float) -> None:
        """Actualiza la posición mundial del tren desde las coordenadas far de la telemetría."""
        self._last_train_x = world_x
        self._last_train_z = world_z

    def refresh_distances(self, stops: List[dict]) -> None:
        """
        Actualiza en-lugar la clave 'distance' de cada parada usando la posición
        actual del tren y las posiciones de entidad cacheadas.
        Coste: solo matemáticas, sin I/O. Se puede llamar cada frame.
        """
        if self._last_train_x is None or not self._stop_entity_cache:
            return
        for i, stop in enumerate(stops):
            if i < len(self._stop_entity_cache):
                ex, ez = self._stop_entity_cache[i]
                stop["distance"] = self._distance_to_entity(ex, ez)

    def update_train_position_near(self, nx: float, nz: float) -> None:
        """
        Fallback cuando getFarPosition devuelve 0: infiere la posición mundial
        haciendo tile-snapping sobre las entidades de la ruta activa.
        NX/NZ son coordenadas tile-local (0-1024) de getNearPosition.
        Incluye filtro anti-salto: rechaza actualizaciones que impliquen
        un desplazamiento >400 m en un solo frame (tile-crossing noise).
        """
        try:
            import core.scenario_index as _si
            import math as _math
            route_id = self._cached_route_id
            if not route_id:
                active = self.find_active_scenario()
                if not active:
                    return
                sdir = (os.path.dirname(active["save_path"])
                        if active.get("save_path") else active.get("scenario_dir", ""))
                route_id = os.path.basename(os.path.dirname(os.path.dirname(sdir)))
                self._cached_route_id = route_id
            if not route_id:
                return
            wx, wz = _si.infer_world_position(route_id, nx, nz)
            if wx is not None and wz is not None:
                wx_f: float = float(wx)
                wz_f: float = float(wz)
                # Filtro anti-salto: rechaza si la nueva posición está >400m de la última.
                # Esto ocurre al cruzar fronteras de tile con el snapping.
                if self._last_train_x is not None:
                    dx = wx_f - self._last_train_x
                    dz = wz_f - (self._last_train_z or 0.0)
                    if _math.sqrt(dx * dx + dz * dz) > 400:
                        return  # salto imposible → ignorar
                self._last_train_x = wx_f
                self._last_train_z = wz_f
        except Exception:
            pass

    def _distance_to_entity(self, entity_x: Optional[float], entity_z: Optional[float]) -> int:
        """Distancia euclidiana en metros entre el tren y la entidad. Devuelve -1 si no disponible."""
        if (
            entity_x is None or entity_z is None
            or self._last_train_x is None or self._last_train_z is None
        ):
            return -1
        dx = entity_x - self._last_train_x
        dz = entity_z - self._last_train_z
        dist = math.sqrt(dx * dx + dz * dz)
        return max(0, int(round(dist)))

    def select_manual_scenario(self, save_path: str) -> bool:
        """Fija manualmente el CurrentSave.xml a usar. Devuelve False si no existe."""
        if not os.path.exists(save_path):
            return False
        self._forced_save_path = save_path
        self._cached_save_path = save_path
        self._forced_scenario_id = None
        self._forced_scenario_dir = None
        self._cached_route_id = None
        return True

    def select_by_id(self, scenario_id: str, scenario_dir: str) -> bool:
        """
        Selecciona un escenario por su GUID. Funciona tanto con escenarios jugados
        (que tienen CurrentSave.xml) como con escenarios no jugados (datos del índice).
        """
        self._forced_scenario_id = scenario_id
        self._forced_scenario_dir = scenario_dir
        self._cached_route_id = None
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
        self._cached_route_id = None

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

        # Selección por ID: usar InitialSave.xml si existe (tiene instrucciones reales en orden)
        if self._forced_scenario_id and self._forced_scenario_dir and not self._forced_save_path:
            initial_save = os.path.join(self._forced_scenario_dir, "InitialSave.xml")
            current_save = os.path.join(self._forced_scenario_dir, "CurrentSave.xml")
            for xml_path in (current_save, initial_save):
                if os.path.exists(xml_path):
                    return {"save_path": xml_path, "mtime": os.path.getmtime(xml_path)}
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
                    # Preferir InitialSave.xml al SQLite estático: tiene instrucciones reales
                    initial_save = os.path.join(scenario_dir, "InitialSave.xml")
                    if os.path.exists(initial_save):
                        self._cached_save_path = initial_save
                        return {"save_path": initial_save, "mtime": os.path.getmtime(initial_save)}
                    return {
                        "save_path": None,
                        "scenario_id": matched["id"],
                        "scenario_dir": scenario_dir,
                        "has_save": False,
                    }
            except Exception:
                pass

        # Buscar CurrentSave.xml (existe tras el primer guardado/checkpoint)
        save_files = glob.glob(os.path.join(
            self.content_path, "*", "Scenarios", "*", "CurrentSave.xml"
        ))

        # Fallback: InitialSave.xml — TS Classic lo sobreescribe cada vez que
        # se carga un escenario, incluso antes del primer guardado manual.
        if not save_files:
            save_files = glob.glob(os.path.join(
                self.content_path, "*", "Scenarios", "*", "InitialSave.xml"
            ))

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

        # Calcular scenario_dir
        if save_path:
            scenario_dir = os.path.dirname(save_path)
        else:
            scenario_dir = active.get("scenario_dir", "")
            scenario_id = active.get("scenario_id") or os.path.basename(scenario_dir)

        # route_id para búsqueda de posiciones de entidades
        route_id = ""
        try:
            route_id = os.path.basename(os.path.dirname(os.path.dirname(scenario_dir)))
        except Exception:
            pass

        # Sin CurrentSave.xml → datos estáticos del índice SQLite + ScenarioProperties
        if not save_path:
            props = self._read_scenario_properties(scenario_dir)
            for key in ("scenario_name", "service_name", "start_location", "start_time", "loco_name"):
                if key in props:
                    data["scenario_info"][key] = props[key]
            if scenario_id:
                try:
                    import core.scenario_index as _si
                    entity_cache: List[tuple] = []
                    for s in _si.get_stops(scenario_id):
                        ex, ez = s.get("entity_x"), s.get("entity_z")
                        entity_cache.append((ex, ez))
                        dist = self._distance_to_entity(ex, ez)
                        data["stops"].append({
                            "station_name": s["name"],
                            "arrival_time": s["arrive_time"],
                            "departure_time": s["depart_time"],
                            "due_time": s["due_time"],
                            "dwell_secs": s["duration_secs"],
                            "status": "INACTIVE",
                            "type": s["type"],
                            "distance": dist,
                        })
                    self._stop_entity_cache = entity_cache
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

            # Número de unidad traccionada (ej: "323211_65011")
            unit_node = root.find(".//cOperationMonitor/EnginesExperienced/Number")
            if unit_node is not None and unit_node.text:
                data["current_progress"]["unit_number"] = unit_node.text.strip()

            # Estadísticas del escenario: errores operacionales + excesos de velocidad
            stats_node = root.find(".//cPlayerScenarioStatistics/Scenario-ScenarioStatistics")
            if stats_node is not None:
                err_node = stats_node.find("NumOperationalErrors")
                if err_node is not None:
                    try:
                        data["current_progress"]["operational_errors"] = int(float(err_node.text or 0))
                    except ValueError:
                        pass
                speeding: List[Dict[str, Any]] = []
                for sp in stats_node.findall("SpeedingStats/Scenario-SpeedingStatistics"):
                    try:
                        speeding.append({
                            "start_time": float(sp.findtext("StartTime") or 0),
                            "hour": int(sp.findtext("StartHour") or 0),
                            "minute": int(sp.findtext("StartMin") or 0),
                            "max_velocity_ms": float(sp.findtext("MaxVelocity") or 0),
                            "distance_m": float(sp.findtext("DistanceTravelled") or 0),
                            "milepost": sp.findtext("Milepost") or "",
                            "speed_limit": float(sp.findtext("SpeedLimit") or 0),
                        })
                    except (ValueError, TypeError):
                        pass
                data["current_progress"]["speeding_incidents"] = speeding

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
            _entity_cache_save: List[tuple] = []

            if player_driver is not None:
                # Nombre y hora de inicio del servicio
                svc_node = player_driver.find(
                    "ServiceName/Localisation-cUserLocalisedString/English"
                )
                if svc_node is not None and svc_node.text:
                    data["scenario_info"]["service_name"] = svc_node.text

                start_node = player_driver.find("StartTime")
                start_secs_raw = 0.0
                if start_node is not None and start_node.text:
                    data["scenario_info"]["service_start_time"] = _parse_seconds(start_node)
                    try:
                        start_secs_raw = float(start_node.text)
                    except ValueError:
                        pass

                # Iterar sobre TODOS los tipos de instrucción de parada
                _STOP_INSTR_TAGS = {"cStopAtDestinations", "cPickUpPassengers"}
                import core.scenario_index as _si
                for stop in player_driver.iter():
                    if stop.tag not in _STOP_INSTR_TAGS:
                        continue

                    # Obtener el cDriverInstructionTarget dentro de DeltaTarget
                    target = stop.find("DeltaTarget/cDriverInstructionTarget")
                    if target is None:
                        target = stop.find("cDriverInstructionTarget")
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

                    # Tipo: cPickUpPassengers siempre es STOP; cStopAtDestinations respeta Waypoint
                    if stop.tag == "cPickUpPassengers":
                        stop_type = "STOP"
                    else:
                        wp_node = target.find("Waypoint")
                        stop_type = "WAYPOINT" if (wp_node is not None and wp_node.text == "1") else "STOP"

                    # Estado: ProgressCode es la fuente de verdad.
                    # El campo Active=1 está en TODOS los stops (flag global del
                    # cDriverInstructionContainer) — NO indica el stop actual.
                    # ProgressCode muestra: INSTRUCTION_STATE_{ACTIVE|INACTIVE|SUCCEEDED}
                    satisfied = stop.find("Satisfied")
                    prog_node = target.find("ProgressCode")

                    raw_prog = prog_node.text if prog_node is not None else ""
                    progress_code = raw_prog.replace("INSTRUCTION_STATE_", "") if raw_prog else "INACTIVE"

                    if satisfied is not None and satisfied.text == "1":
                        status = "SUCCEEDED"
                    elif progress_code == "SUCCEEDED":
                        status = "SUCCEEDED"
                    elif progress_code == "ACTIVE":
                        status = "ACTIVE"
                    else:
                        status = "INACTIVE"

                    # Horarios programados
                    arr_tod = stop.find("ArriveTime/sTimeOfDay")
                    dep_tod = stop.find("DepartTime/sTimeOfDay")
                    scheduled_arrival = _parse_time_of_day(arr_tod)
                    departure_time = _parse_time_of_day(dep_tod)

                    # DueTime es relativo al StartTime del servicio (segundos desde inicio)
                    # → convertir a hora real HH:MM sumando start_secs_raw
                    due_node = target.find("DueTime")
                    due_time = "N/A"
                    if due_node is not None and due_node.text:
                        try:
                            due_secs = float(due_node.text)
                            if due_secs > 0 and start_secs_raw > 0:
                                due_time = _secs_to_hhmm(start_secs_raw + due_secs)
                            elif due_secs > 0:
                                due_time = _parse_seconds(due_node)
                        except ValueError:
                            pass

                    # Si ArriveTime/DepartTime son 0:0 (N/A) usar DueTime como horario programado
                    if scheduled_arrival == "N/A" and due_time != "N/A":
                        scheduled_arrival = due_time
                    if departure_time == "N/A" and due_time != "N/A":
                        departure_time = due_time

                    # Tiempo real de llegada: ArrivalTime (seg desde inicio escenario), solo SUCCEEDED
                    arr_real_node = target.find("ArrivalTime")
                    if status == "SUCCEEDED" and arr_real_node is not None and arr_real_node.text:
                        try:
                            real_arr_secs = float(arr_real_node.text)
                            arrival_time = _secs_to_hhmm(start_secs_raw + real_arr_secs) if real_arr_secs > 0 and start_secs_raw > 0 else scheduled_arrival
                        except ValueError:
                            arrival_time = scheduled_arrival
                    else:
                        arrival_time = scheduled_arrival

                    # Tiempo de parada
                    dur_node = target.find("Duration")
                    dwell_secs = 0
                    if dur_node is not None and dur_node.text:
                        try:
                            dwell_secs = int(float(dur_node.text))
                        except ValueError:
                            pass

                    # Distancia desde posición del tren hasta la entidad
                    ex, ez = _si.lookup_entity_position(route_id, station_name)
                    dist = self._distance_to_entity(ex, ez)
                    _entity_cache_save.append((ex, ez))

                    data["stops"].append({
                        "station_name": station_name,
                        "scheduled_arrival": scheduled_arrival,  # siempre hora programada de ArriveTime
                        "arrival_time": arrival_time,            # real (SUCCEEDED+ArrivalTime válido) o programada
                        "departure_time": departure_time,
                        "due_time": due_time,
                        "dwell_secs": dwell_secs,
                        "status": status,
                        "type": stop_type,
                        "distance": dist,
                    })

        except Exception as e:
            data["error_save"] = str(e)
        self._stop_entity_cache = _entity_cache_save

        # --- 1b. Scenario.xml — fallback cuando el save no tiene datos de conductor ---
        # InitialSave.xml en escenarios no iniciados solo contiene junctions; las instrucciones
        # reales (paradas, horarios) viven en Scenario.xml.
        if not data["stops"]:
            scenario_xml_path = os.path.join(scenario_dir, "Scenario.xml")
            if os.path.exists(scenario_xml_path):
                try:
                    stree = ET.parse(scenario_xml_path)
                    sroot = stree.getroot()
                    import core.scenario_index as _si2

                    s_player_driver = None
                    s_rv_match = None
                    s_pd_match = None
                    rv_base = effective_rv.split(";")[0].strip() if effective_rv else ""

                    for driver in sroot.findall(".//cDriver"):
                        if rv_base and s_rv_match is None:
                            for rv_node in driver.findall(".//InitialRV/e"):
                                txt = (rv_node.text or "").strip()
                                if txt and (rv_base in txt or txt in rv_base):
                                    s_rv_match = driver
                                    break
                        if s_pd_match is None:
                            pd_node = driver.find("PlayerDriver")
                            if pd_node is not None and (pd_node.text or "").strip() == "1":
                                s_pd_match = driver

                    s_player_driver = s_rv_match or s_pd_match
                    _entity_cache_scenario: List[tuple] = []

                    if s_player_driver is not None:
                        svc_node = s_player_driver.find(
                            "ServiceName/Localisation-cUserLocalisedString/English"
                        )
                        if svc_node is not None and svc_node.text:
                            data["scenario_info"]["service_name"] = svc_node.text

                        s_start_node = s_player_driver.find("StartTime")
                        s_start_secs = 0.0
                        if s_start_node is not None and s_start_node.text:
                            if "service_start_time" not in data["scenario_info"]:
                                data["scenario_info"]["service_start_time"] = _parse_seconds(s_start_node)
                            try:
                                s_start_secs = float(s_start_node.text)
                            except ValueError:
                                pass

                        _STOP_TAGS = {"cStopAtDestinations", "cPickUpPassengers"}
                        for stop in s_player_driver.iter():
                            if stop.tag not in _STOP_TAGS:
                                continue
                            target = stop.find("DeltaTarget/cDriverInstructionTarget")
                            if target is None:
                                target = stop.find("cDriverInstructionTarget")
                            if target is None:
                                continue
                            hidden_node = target.find("Hidden")
                            if hidden_node is not None and hidden_node.text == "1":
                                continue

                            disp_node = target.find("DisplayName")
                            station_name = disp_node.text if disp_node is not None and disp_node.text else "Unknown"

                            if stop.tag == "cPickUpPassengers":
                                stop_type = "STOP"
                            else:
                                wp_node = target.find("Waypoint")
                                stop_type = "WAYPOINT" if (wp_node is not None and wp_node.text == "1") else "STOP"

                            # Scenario.xml no tiene estado de ejecución → todos INACTIVE
                            # DueTime relativo a StartTime → hora real HH:MM
                            due_node = target.find("DueTime")
                            due_time = "N/A"
                            if due_node is not None and due_node.text:
                                try:
                                    due_secs_v = float(due_node.text)
                                    if due_secs_v > 0 and s_start_secs > 0:
                                        due_time = _secs_to_hhmm(s_start_secs + due_secs_v)
                                    elif due_secs_v > 0:
                                        due_time = _parse_seconds(due_node)
                                except ValueError:
                                    pass

                            arr_tod = stop.find("ArriveTime/sTimeOfDay")
                            dep_tod = stop.find("DepartTime/sTimeOfDay")
                            scheduled_arrival = _parse_time_of_day(arr_tod)
                            departure_time = _parse_time_of_day(dep_tod)
                            if scheduled_arrival == "N/A" and due_time != "N/A":
                                scheduled_arrival = due_time
                            if departure_time == "N/A" and due_time != "N/A":
                                departure_time = due_time

                            dur_node = target.find("Duration")
                            dwell_secs = 0
                            if dur_node is not None and dur_node.text:
                                try:
                                    dwell_secs = int(float(dur_node.text))
                                except ValueError:
                                    pass

                            ex, ez = _si2.lookup_entity_position(route_id, station_name)
                            dist = self._distance_to_entity(ex, ez)
                            _entity_cache_scenario.append((ex, ez))

                            data["stops"].append({
                                "station_name": station_name,
                                "scheduled_arrival": scheduled_arrival,
                                "arrival_time": scheduled_arrival,
                                "departure_time": departure_time,
                                "due_time": due_time,
                                "dwell_secs": dwell_secs,
                                "status": "INACTIVE",
                                "type": stop_type,
                                "distance": dist,
                            })

                        if _entity_cache_scenario:
                            self._stop_entity_cache = _entity_cache_scenario
                except Exception as e_sc:
                    data["error_scenario_xml"] = str(e_sc)

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
