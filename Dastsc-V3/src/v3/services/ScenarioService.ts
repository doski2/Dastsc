import axios from 'axios';

export interface ScenarioStop {
  name: string;
  entity_name: string;
  type: 'STOP' | 'WAYPOINT';
  is_waypoint: boolean;
  satisfied: boolean;
  is_platform: boolean;
  due_time: string | null;
  arrival_time: string | null;
  raw_due: number;
  stop_duration: number;
  x?: number;
  z?: number;
  distance_m: number;
}

export interface Scenario {
  id: string;
  route_id: string;
  name: string;
  path: string;
}

const API_BASE = 'http://localhost:8000';

class ScenarioService {
  private currentScenario: Scenario | null = null;
  private stops: ScenarioStop[] = [];
  private lastUpdate = 0;

  async getAvailableScenarios(): Promise<Scenario[]> {
    try {
      const response = await axios.get(`${API_BASE}/scenarios`);
      return response.data;
    } catch (error) {
      console.error('Error fetching scenarios:', error);
      return [];
    }
  }

  async detectActiveScenario(rvNumber: string): Promise<Scenario | null> {
    try {
      const response = await axios.get(`${API_BASE}/scenarios/detect`, {
        params: { rv: rvNumber }
      });
      if (response.data) {
        // Adaptar respuesta del backend al formato del frontend
        this.currentScenario = {
          id: response.data.scenario_id,
          route_id: response.data.route_id,
          name: "Escenario Detectado", // El backend no devuelve el nombre aquí aún
          path: response.data.xml_path
        };
        return this.currentScenario;
      }
      return null;
    } catch (error) {
      console.error('Error detecting active scenario:', error);
      return null;
    }
  }

  async getLiveTimetable(routeId: string, scenarioPath: string, x: number, z: number): Promise<ScenarioStop[]> {
    try {
      const response = await axios.get(`${API_BASE}/scenarios/live`, {
        params: { route_id: routeId, scenario_path: scenarioPath, x, z }
      });
      this.stops = response.data;
      return this.stops;
    } catch (error) {
      console.error('Error fetching live timetable:', error);
      return [];
    }
  }

  // Helper para obtener la siguiente parada relevante
  getNextStop(): ScenarioStop | null {
    return this.stops.find(s => !s.satisfied) || null;
  }
}

export const scenarioService = new ScenarioService();
