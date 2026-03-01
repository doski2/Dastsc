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
            tree = ET.parse(scenario_path)
            root = tree.getroot()
            
            # En TS, los servicios están en Consist Control
            # Buscamos el cDriver que tenga el RailVehicle con ese número
            for driver in root.findall(".//cDriver"):
                # El RVNumber suele ser una combinación de Number y Name en el XML
                # Buscamos si el número de unidad coincide
                found_rv = False
                for rv in driver.findall(".//cRailVehicle"):
                    num_node = rv.find(".//Number")
                    if num_node is not None and num_node.text is not None and num_node.text in rv_number:
                        found_rv = True
                        break
                
                if found_rv:
                    # Este es nuestro servicio, extraemos sus paradas
                    name_node = driver.find(".//Name")
                    driver_name = name_node.text if name_node is not None else "Jugador"
                    return {
                        "driver_name": driver_name,
                        "stops": self.get_driver_stops(driver)
                    }
        except Exception as e:
            print(f"Error vinculando RV {rv_number}: {e}")
        return None

    def get_driver_stops(self, driver_node: ET.Element) -> List[Dict]:
        """Extrae paradas de un nodo cDriver específico."""
        stops = []
        for stop in driver_node.findall(".//cStopAtDestinations") + driver_node.findall(".//cPickUpPassengers"):
            target = stop.find(".//DeltaTarget/cDriverInstructionTarget")
            if target is not None:
                name_node = target.find("DisplayName")
                satisfied_node = stop.find("Satisfied")
                stops.append({
                    "name": name_node.text if name_node is not None else "Unknown",
                    "satisfied": (satisfied_node is not None and satisfied_node.text == "1"),
                    "is_platform": "cPickUpPassengers" in stop.tag
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
        Escanea el archivo ScenarioProperties.xml (scenario_path) para obtener todas
        las paradas/destinos del jugador (Driver del player).
        Llamado por la API de FastAPI.
        """
        try:
            tree = ET.parse(scenario_path)
            root = tree.getroot()
            
            # Buscamos el cDriver que tenga IsPlayerDriver = 1
            for driver in root.findall(".//cDriver"):
                player_node = driver.find(".//IsPlayerDriver")
                if player_node is not None and (player_node.text == "1" or player_node.text == "true"):
                    # Extraer sus instrucciones de parada
                    return self.get_driver_stops(driver)
            
            # Si no hay PlayerDriver marcado, buscamos el primero con paradas
            for driver in root.findall(".//cDriver"):
                stops = self.get_driver_stops(driver)
                if stops:
                    return stops
                    
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
