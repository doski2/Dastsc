import xml.etree.ElementTree as ET
import os
import glob
from typing import List, Dict, Optional

class ScenarioManager:
    def __init__(self, rw_path: str = r"C:\Program Files (x86)\Steam\steamapps\common\RailWorks"):
        self.rw_path = rw_path
        self.content_path = os.path.join(rw_path, "Content", "Routes")

    def get_available_scenarios(self, route_guid: Optional[str] = None) -> List[Dict]:
        """
        Escanea las rutas y escenarios para listar los disponibles.
        Si route_guid es None, intenta buscar en todas las rutas.
        """
        scenarios = []
        search_pattern = os.path.join(self.content_path, "*", "Scenarios", "*", "ScenarioProperties.xml")
        
        for prop_path in glob.glob(search_pattern):
            try:
                tree = ET.parse(prop_path)
                root = tree.getroot()
                
                # Buscar el nombre del escenario
                display_node = root.find(".//DisplayName/Localisation-cUserLocalisedString/Spanish")
                if display_node is None or not display_node.text:
                    display_node = root.find(".//DisplayName/Localisation-cUserLocalisedString/English")
                
                name = display_node.text if display_node is not None else "Escenario Desconocido"
                
                # ID y Carpeta
                scenario_id = os.path.basename(os.path.dirname(prop_path))
                route_id = os.path.basename(os.path.dirname(os.path.dirname(os.path.dirname(prop_path))))
                
                scenarios.append({
                    "id": scenario_id,
                    "route_id": route_id,
                    "name": name,
                    "path": prop_path
                })
            except Exception as e:
                print(f"Error parseando {prop_path}: {e}")
                
        return scenarios

    def get_service_by_rv(self, scenario_path: str, rv_number: str) -> Optional[Dict]:
        """
        Busca el servicio específico (consist) que maneja el tren con rv_number
        dentro de un escenario.
        """
        try:
            # Limpiar el RV Number por si viene con prefijos como "RV:323211_65011" -> "323211"
            clean_rv = rv_number.replace("RV:", "").split("_")[0]
            
            tree = ET.parse(scenario_path)
            root = tree.getroot()
            
            # En TS, los servicios están en Consist Control
            # Buscamos el cDriver que tenga el RailVehicle con ese número
            for driver in root.findall(".//cDriver"):
                found_rv = False
                for rv in driver.findall(".//cRailVehicle"):
                    num_node = rv.find(".//Number")
                    if num_node is not None and num_node.text is not None and clean_rv in num_node.text:
                        found_rv = True
                        break
                
                if found_rv:
                    name_node = driver.find(".//Name")
                    driver_name = name_node.text if name_node is not None else "Jugador"
                    return {
                        "driver_name": driver_name,
                        "stops": self.get_driver_stops(driver)
                    }
        except Exception as e:
            print(f"Error vinculando RV {rv_number}: {e}")
        return None

    def find_active_scenario_by_rv(self, rv_number: str) -> Optional[Dict]:
        """
        Paso 1: Escanea todos los escenarios en busca del que contiene el RVNumber actual.
        Retorna la ruta del archivo CurrentSave.xml o ScenarioProperties.xml activo.
        """
        clean_rv = rv_number.replace("RV:", "").split("_")[0]
        print(f"DEBUG: Buscando RV [{clean_rv}] en todos los escenarios...")

        search_patterns = [
            os.path.join(self.content_path, "*", "Scenarios", "*", "CurrentSave.xml"),
            os.path.join(self.content_path, "*", "Scenarios", "*", "ScenarioProperties.xml")
        ]

        for pattern in search_patterns:
            for xml_path in glob.glob(pattern):
                try:
                    # Usamos iterparse para mayor eficiencia
                    context = ET.iterparse(xml_path, events=("start", "end"))
                    for event, elem in context:
                        # En CurrentSave.xml los RV suelen estar en cRailVehicle o Dispatcher nodes
                        if event == "end" and elem.tag in ["cRailVehicle", "RailVehicle", "Number"]:
                            text = elem.text
                            if text and clean_rv in text:
                                scenario_dir = os.path.dirname(xml_path)
                                print(f"DEBUG: ¡ENCONTRADO! en {xml_path}")
                                return {
                                    "xml_path": xml_path,
                                    "scenario_id": os.path.basename(scenario_dir),
                                    "route_id": os.path.basename(os.path.dirname(os.path.dirname(scenario_dir)))
                                }
                        
                        # Limpieza agresiva de memoria para archivos de 300k+ líneas
                        if event == "end":
                            elem.clear()
                except Exception as e:
                    continue
        print(f"DEBUG: No se encontró el RV [{clean_rv}] en ninguna ruta.")
        return None

    def get_driver_stops(self, driver_node: ET.Element) -> List[Dict]:
        """Extrae paradas de un nodo cDriver específico."""
        stops = []
        for stop in driver_node.findall(".//cStopAtDestinations") + driver_node.findall(".//cPickUpPassengers"):
            target = stop.find(".//DeltaTarget/cDriverInstructionTarget")
            if target is not None:
                name_node = target.find("DisplayName")
                satisfied_node = stop.find("Satisfied")
                
                # Extraer tiempos y tipos de instrucción
                due_time = target.find("DueTime")
                arrival_time = target.find("ArrivalTime")
                duration = target.find("Duration")
                
                # Identificar si es un punto de paso (Waypoint) o parada comercial
                is_waypoint_node = target.find("Waypoint")
                is_waypoint = (is_waypoint_node is not None and is_waypoint_node.text == "1")
                
                # En TS, si Timetabled es 0 y PickingUp es 0, suele ser un punto de paso técnico
                timetabled_node = target.find("Timetabled")
                is_timetabled = (timetabled_node is not None and timetabled_node.text == "1")
                
                # Determinar el tipo para el HUD
                instruction_type = "WAYPOINT" if is_waypoint or not is_timetabled else "STOP"
                
                # Conversión de segundos a HH:MM:SS
                def format_time(seconds_node):
                    if seconds_node is not None and seconds_node.text:
                        try:
                            s = float(seconds_node.text)
                            if s <= 0:
                                return None
                            import time
                            return time.strftime('%H:%M:%S', time.gmtime(s))
                        except Exception:
                            return None
                    return None

                # Extraer nodos de forma segura
                entity_node = target.find("EntityName") if target is not None else None
                entity_name = entity_node.text if entity_node is not None else ""

                stops.append({
                    "name": name_node.text if name_node is not None else "Unknown",
                    "entity_name": entity_name,
                    "type": instruction_type,
                    "is_waypoint": is_waypoint,
                    "satisfied": (satisfied_node is not None and satisfied_node.text == "1"),
                    "is_platform": "cPickUpPassengers" in stop.tag,
                    "due_time": format_time(due_time),
                    "arrival_time": format_time(arrival_time),
                    "raw_due": (float(due_time.text) if due_time is not None and due_time.text is not None else 0.0),
                    "stop_duration": (int(duration.text) if duration is not None and duration.text is not None else 0 if instruction_type == "WAYPOINT" else 35)
                })
        return stops

    def get_track_markers(self, route_id: str) -> Dict[str, Dict]:
        """
        Escanea ScenarioNetworkProperties.xml de la ruta para obtener coordenadas
        reales de andenes y marcadores.
        """
        markers = {}
        target_path = os.path.join(self.content_path, route_id, "ScenarioNetworkProperties.xml")
        
        if not os.path.exists(target_path):
            return markers

        try:
            tree = ET.parse(target_path)
            root = tree.getroot()
            
            # Buscar plataformas (Platforms) y Marcadores (TrackMarkers)
            for marker in root.findall(".//cPlatformProperties") + root.findall(".//cTrackMarkerProperties"):
                name_node = marker.find(".//Name")
                if name_node is not None and name_node.text:
                    name = name_node.text
                    
                    # Extraer coordenada relativa del nodo (Position/FarMatrix)
                    matrix = marker.find(".//FarMatrix/cHMatrix")
                    if matrix is not None:
                        # Extraemos X, Y, Z de la matriz de transformación
                        # En TS: [m03=X, m13=Y, m23=Z]
                        pos_node = matrix.find("Position/cVector3")
                        if pos_node is not None:
                            x_node = pos_node.find("X")
                            y_node = pos_node.find("Y")
                            z_node = pos_node.find("Z")
                            
                            x = float(x_node.text) if x_node is not None and x_node.text is not None else 0.0
                            y = float(y_node.text) if y_node is not None and y_node.text is not None else 0.0
                            z = float(z_node.text) if z_node is not None and z_node.text is not None else 0.0
                            
                            markers[name] = {
                                "x": x, "y": y, "z": z,
                                "type": "platform" if "Platform" in marker.tag else "marker"
                            }
        except Exception as e:
            print(f"Error extrayendo marcadores de ruta {route_id}: {e}")
            
        return markers

    def get_full_live_timetable(self, route_id: str, scenario_path: str, current_pos: Dict) -> List[Dict]:
        """
        Combina la lista de paradas del escenario con las coordenadas reales
        de la ruta para calcular distancias en tiempo real.
        """
        stops = self.get_scenario_stops(scenario_path)
        route_markers = self.get_track_markers(route_id)
        
        enriched_stops = []
        for stop in stops:
            # Intentar encontrar la ubicación exacta en el mundo
            location = route_markers.get(stop['name'])
            
            distance = -1 # -1 indica que no se encontró el marcador en la ruta
            if location:
                stop.update({
                    "x": location['x'],
                    "z": location['z'],
                    "type": location['type'] # 'platform' o 'marker'
                })
                # Calcular distancia actual
                distance = self.calculate_distance_to_stop(current_pos, location)
            
            stop["distance_m"] = round(distance, 2)
            enriched_stops.append(stop)
            
        return enriched_stops

    def calculate_distance_to_stop(self, current_pos: Dict, target_marker: Dict) -> float:
        """
        Calcula la distancia euclidiana 2D (X, Z) entre la posición del tren
        y las coordenadas del marcador.
        """
        import math
        dx = current_pos['x'] - target_marker['x']
        dz = current_pos['z'] - target_marker['z']
        return math.sqrt(dx*dx + dz*dz)

    def get_scenario_stops(self, scenario_path: str) -> List[Dict]:
        """
        Escanea el archivo ScenarioProperties.xml o CurrentSave.xml para obtener todas
        las paradas/destinos del jugador.
        """
        try:
            tree = ET.parse(scenario_path)
            root = tree.getroot()
            
            # 1. Intentar buscar en cDriver (Escenarios normales)
            for driver in root.findall(".//cDriver"):
                player_node = driver.find(".//IsPlayerDriver")
                if player_node is not None and (player_node.text == "1" or player_node.text == "true"):
                    return self.get_driver_stops(driver)
            
            # 2. Soporte específico para CurrentSave.xml
            # En los saves, las instrucciones del jugador suelen estar bajo DispatcherV1-cDeltaSerializedPathRequestChain
            # Buscamos destinos con DisplayName
            stops = []
            for path_request in root.findall(".//DispatcherV1-cDeltaSerializedPathRequest"):
                destinations = path_request.findall(".//DispatcherV1-cDeltaSerializedDestination")
                driver_state = path_request.find(".//DispatcherV1-cDeltaSerializedDriverState")
                
                for dest in destinations:
                    name_node = dest.find("DisplayName")
                    if name_node is not None and name_node.text:
                        # Extraer duración (si existe en DriverState)
                        duration_val = 35
                        if driver_state is not None:
                            dur_node = driver_state.find("InstructionDuration")
                            if dur_node is not None and dur_node.text:
                                try:
                                    duration_val = int(float(dur_node.text))
                                except:
                                    pass

                        stops.append({
                            "name": name_node.text,
                            "entity_name": name_node.text,
                            "type": "STOP" if duration_val > 0 else "WAYPOINT",
                            "is_waypoint": duration_val == 0,
                            "satisfied": False, # En CurrentSave tendríamos que ver si ya se pasó
                            "is_platform": "Platform" in name_node.text,
                            "due_time": None,
                            "arrival_time": None,
                            "raw_due": 0.0,
                            "stop_duration": duration_val
                        })
            
            if stops:
                return stops

            # 3. Último recurso: cualquier cDriver con paradas
            for driver in root.findall(".//cDriver"):
                s = self.get_driver_stops(driver)
                if s: return s

        except Exception as e:
            print(f"Error extrayendo paradas de {scenario_path}: {e}")
        return []

if __name__ == "__main__":
    # Prueba rápida
    sm = ScenarioManager()
    print("Buscando escenarios...")
    scenarios = sm.get_available_scenarios()
    for s in scenarios[:5]: # Mostrar los primeros 5
        print(f" - {s['name']} ({s['id']})")
