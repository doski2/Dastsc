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

  async getLiveTimetable(routeId?: string, scenarioPath?: string, x?: number, z?: number): Promise<ScenarioStop[]> {
    try {
      // Intentamos usar el nuevo endpoint simplificado del backend
      const response = await axios.get(`${API_BASE}/scenarios/live`);
      
      if (response.data && response.data.stops) {
        // Mapear el formato del backend al frontend
        const mappedStops: ScenarioStop[] = response.data.stops.map((s: any) => ({
          name: s.station_name,
          entity_name: s.station_name,
          type: s.type || 'STOP',
          is_waypoint: s.type === 'WAYPOINT',
          satisfied: s.satisfied || false,
          is_platform: true,
          due_time: s.arrival_time,
          arrival_time: s.actual_arrival || null,
          raw_due: 0,
          stop_duration: 0,
          distance_m: s.distance || 0
        }));
        this.stops = mappedStops;
        return this.stops;
      }
      return [];
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
