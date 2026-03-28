import axios from 'axios';

export interface ScenarioStop {
  name: string;
  entity_name: string;
  type: 'STOP' | 'WAYPOINT';
  is_waypoint: boolean;
  is_active: boolean;
  satisfied: boolean;
  is_platform: boolean;
  due_time: string | null;       // deadline/horario de llegada (HH:MM)
  departure_time: string | null; // horario de salida programado (HH:MM)
  arrival_time: string | null;   // hora de llegada real (si disponible)
  raw_due: number;
  stop_duration: number;         // tiempo de parada en segundos
  x?: number;
  z?: number;
  distance_m: number;
}

export interface ScenarioListItem {
  id: string;
  route_id: string;
  name: string;
  loco: string;
  service: string;
  start_time: string;
  start_location: string;
  briefing: string;
  duration_mins: number;
  rating: number;
  /** Lista de RV codes del tren del jugador (InitialRV) */
  initial_rv: string[];
  /** True si el escenario tiene CurrentSave.xml (fue jugado al menos una vez) */
  has_save: boolean;
  save_path: string | null;
  is_active: boolean;
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

  /** Lista todos los escenarios instalados con CurrentSave.xml */
  async getScenarioList(): Promise<ScenarioListItem[]> {
    try {
      const response = await axios.get(`${API_BASE}/scenarios/list`);
      return response.data as ScenarioListItem[];
    } catch (error) {
      console.error('Error fetching scenario list:', error);
      return [];
    }
  }

  /** Selecciona manualmente un escenario por su ID (GUID) */
  async selectScenario(scenarioId: string): Promise<boolean> {
    try {
      const response = await axios.post(`${API_BASE}/scenarios/select`, { scenario_id: scenarioId });
      return response.data?.ok === true;
    } catch (error: any) {
      console.error('[ScenarioService] Error selecting scenario:', error?.response?.status, error?.response?.data || error);
      return false;
    }
  }

  /** Vuelve al modo autodetección (el más reciente) */
  async setAutoScenario(): Promise<void> {
    try {
      await axios.post(`${API_BASE}/scenarios/select`, { auto: true });
    } catch (error) {
      console.error('Error resetting to auto scenario:', error);
    }
  }

  async getLiveTimetable(): Promise<ScenarioStop[]> {
    try {
      const response = await axios.get(`${API_BASE}/scenarios/live`);

      if (response.data && response.data.stops) {
        const mappedStops: ScenarioStop[] = response.data.stops.map((s: any) => ({
          name: s.station_name,
          entity_name: s.station_name,
          type: (s.type === 'STOP' || s.type === 'WAYPOINT' ? s.type : 'STOP') as 'STOP' | 'WAYPOINT',
          is_waypoint: s.type === 'WAYPOINT',
          is_active: s.status === 'ACTIVE',
          satisfied: s.status === 'SUCCEEDED',
          is_platform: s.type !== 'WAYPOINT',
          due_time: s.due_time !== 'N/A' ? s.due_time
                  : s.arrival_time !== 'N/A' ? s.arrival_time
                  : null,
          departure_time: s.departure_time !== 'N/A' ? s.departure_time : null,
          arrival_time: null,
          raw_due: 0,
          stop_duration: s.dwell_secs || 0,
          distance_m: s.distance || 0,
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

  getNextStop(): ScenarioStop | null {
    return this.stops.find(s => !s.satisfied) || null;
  }
}

export const scenarioService = new ScenarioService();

