import xml.etree.ElementTree as ET
import os
import glob
import time
from typing import Dict, Optional, Any
from datetime import timedelta


class ScenarioManager:
    """
    Gestiona la extracción de datos de escenarios de RailWorks (TS Classic).
    Soporta la lectura de ScenarioProperties.xml y CurrentSave.xml para datos en tiempo real.
    """

    def __init__(
        self, rw_path: str = r"C:\Program Files (x86)\Steam\steamapps\common\RailWorks"
    ):
        self.rw_path = rw_path
        self.content_path = os.path.join(rw_path, "Content", "Routes")
        self._cached_save_path = None
        self._last_search_time = 0

    def find_active_scenario(self) -> Optional[Dict[str, Any]]:
        """
        Detecta el escenario que se está ejecutando actualmente buscando el CurrentSave.xml más reciente.
        """
        now = time.time()
        
        # OPTIMIZACIÓN V3: Si ya tenemos un path y han pasado < 10s, solo check mtime del cacheado
        if self._cached_save_path and (now - self._last_search_time < 10.0):
            try:
                mtime = os.path.getmtime(self._cached_save_path)
                return {
                    "save_path": self._cached_save_path,
                    "mtime": mtime
                }
            except OSError:
                pass # El archivo pudo ser borrado, forzar búsqueda

        self._last_search_time = now
        search_pattern = os.path.join(
            self.content_path, "*", "Scenarios", "*", "CurrentSave.xml"
        )
        save_files = glob.glob(search_pattern)

        if not save_files:
            return None

        # Ordenar por fecha de modificación (el más reciente es el activo)
        latest_save = max(save_files, key=os.path.getmtime)
        self._cached_save_path = latest_save
        
        mtime = os.path.getmtime(latest_save)
        return {
            "save_path": latest_save,
            "mtime": mtime,
        }

    def parse_time(self, seconds: float) -> str:
        """Convierte segundos desde medianoche a formato HH:MM:SS."""
        return str(timedelta(seconds=int(seconds)))

    def get_detailed_scenario_data(self, player_rv: Optional[str] = None) -> Dict[str, Any]:
        """
        Extrae información detallada del escenario activo: paradas, horarios y progreso.
        Intenta leer de ScenarioProperties.xml (estático) y CurrentSave.xml (dinámico).
        """
        active = self.find_active_scenario()
        if not active:
            return {"error": "No active scenario found"}

        data = {"scenario_info": {}, "stops": [], "current_progress": {}}

        # 1. Leer Estado en Tiempo Real (CurrentSave.xml) - FUENTE PRINCIPAL DE VERDAD
        try:
            tree = ET.parse(active["save_path"])
            root = tree.getroot()

            # Tiempo actual en el escenario
            time_node = root.find(".//SimulationTime")
            if time_node is not None and time_node.text is not None:
                data["current_progress"]["simulation_time"] = self.parse_time(
                    float(time_node.text)
                )

            # Distancia recorrida (Global)
            dist_node = root.find(".//DistanceTraveled")
            if dist_node is not None and dist_node.text is not None:
                data["current_progress"]["distance_meters"] = float(dist_node.text)

            # Buscar paradas basadas en el conductor del jugador (PlayerDriver=1)
            # o por el RVNumber si se proporciona
            player_driver = None
            for driver in root.findall(".//cDriver"):
                is_player = False
                p_node = driver.find("PlayerDriver")
                if p_node is not None and p_node.text == "1":
                    is_player = True
                
                # Si tenemos RV, validamos coincidencia
                if player_rv:
                    rv_nodes = driver.findall(".//RVNumber")
                    for rv in rv_nodes:
                        if rv.text and player_rv in rv.text:
                            is_player = True
                            break
                
                if is_player:
                    player_driver = driver
                    break

            if player_driver is not None:
                # Extraer nombre del servicio
                svc_node = player_driver.find(".//ServiceName/Localisation-cUserLocalisedString/English")
                if svc_node is not None:
                    data["scenario_info"]["service_name"] = svc_node.text

                # Extraer paradas dinámicas de cStopAtDestinations
                for stop in player_driver.findall(".//cStopAtDestinations"):
                    stop_data = {
                        "station_name": "Unknown",
                        "arrival_time": "N/A",
                        "departure_time": "N/A",
                        "status": "INACTIVE",
                        "type": "Stop"
                    }

                    # Nombre visual
                    disp_node = stop.find(".//DisplayName")
                    if disp_node is not None and disp_node.text:
                        stop_data["station_name"] = disp_node.text

                    # Estado de progreso
                    prog_node = stop.find(".//ProgressCode")
                    if prog_node is not None and prog_node.text:
                        # Limpiar el prefijo INSTRUCTION_STATE_
                        stop_data["status"] = prog_node.text.replace("INSTRUCTION_STATE_", "")

                    # Horarios (si están presentes en el save, suelen ser 0 si son dinámicos)
                    # En TS Classic, las paradas de paso no suelen tener horario en el Save
                    # pero algunas paradas de pasajeros sí.
                    
                    data["stops"].append(stop_data)

        except Exception as e:
            data["error_save"] = str(e)

        # 2. Leer Propiedades Estáticas (Fallback para horarios)
        if not data["stops"]:
            prop_path = os.path.join(active["scenario_dir"], "ScenarioProperties.xml")
            if os.path.exists(prop_path):
                # ... (lógica anterior de ScenarioProperties si fallara el save)
                pass

        return data


if __name__ == "__main__":
    # Test rápido
    mgr = ScenarioManager()
    print("Buscando escenario activo...")
    detail = mgr.get_detailed_scenario_data()
    import json

    print(json.dumps(detail, indent=2))
