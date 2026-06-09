import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { DataNormalizer } from './DataNormalizer';

export interface TelemetryData {
  Speed: number;            // m/s (internal)
  SpeedDisplay: number;     // MPH or KPH per profile
  SpeedUnit: 'MPH' | 'km/h';
  ProjectedSpeed: number;
  Acceleration: number;
  GForce: number;
  LateralG: number;
  SpeedLimit: number;       // effective limit (m/s)
  TrackLimit: number;
  SignalLimit: number;
  FrontalSpeedLimit: number;
  Gradient: number;
  RawGradient: number; // valor original del juego (positivo=bajada en cab1)
  DistToNextSignal: number;
  NextSignalAspect: string;
  NextSpeedLimit: number;
  DistToNextSpeedLimit: number;
  NextLimit2Speed: number;
  DistToNextLimit2: number;
  UpcomingLimits: { speed: number, distance: number }[];
  StationDistance: number;
  StationName: string;
  StationLength: number;
  StationNameOCR: string;    // nombre detectado por OCR del HUD del juego
  StationETA: string;        // ETA calculada por el juego (HH:MM:SS)
  StationScheduled: string;  // hora programada del juego (HH:MM:SS)
  Throttle: number;
  TrainBrake: number;
  CombinedControl: number;  // -1 to 1 (Brake to Power)
  Reverser: number;
  BrakeCylinderPressure: number;
  BrakePipePressure: number;
  MainResPressure: number;
  EqResPressure: number;
  PressureUnit: 'BAR' | 'PSI';
  Amperage: number;
  AmperageUnit: string;
  Ammeter: number;
  TractiveEffort: number;
  TractionPercent: number;  // -100 to 100
  BrakingEffort: number;
  BrakingPercent: number;
  TrainLength: number;
  TrainMass: number;
  ConsistType: number;
  TrainType: number;        // 0:Freight 1:Passenger 2:Postal 3:Light
  ActiveCab: number;        // 1=Front 2=Back
  ProjectedBrakingDistance: number;
  TripDistance: number;     // total meters in session
  TailDistanceRemaining: number; // 0 = safe to accelerate
  TailSecondsRemaining: number;
  TailIsActive: boolean;
  LocoName: string;
  RVNumber: string;
  RouteID: string;
  ScenarioPath: string;
  X: number;
  Z: number;
  location: string;
  IsEmergency: boolean;
  Timestamp: number;
  AWS: number;
  AWSState: number;
  AWSReset: number;
  AWSWarning: number;
  AWSWarnCount: number;
  DSD: number;
  VigilAlarm: number;
  Vigilance: number;
  DVDAlarm: number;
  DRA: boolean;
  Sander: boolean;
  DoorsOpen: { left: boolean; right: boolean };
  TimeOfDay: string;
}

interface TelemetryContextType {
  data: TelemetryData;
  isConnected: boolean;
  lastMessageTime: number;
  activeProfile: any;
  availableProfiles: any[];
  sendCommand: (cmd: string, val: number) => void;
  setProfile: (profileName: string) => void;
  resetLocalState: () => void;
}

export interface SpeedingIncident {
  start_time: number;
  hour: number;
  minute: number;
  max_velocity_ms: number;
  distance_m: number;
  milepost: string;
  speed_limit: number;
}

export interface ScenarioProgress {
  simulation_time?: string;
  distance_meters?: number;
  unit_number?: string;
  operational_errors?: number;
  speeding_incidents?: SpeedingIncident[];
}

const DefaultData: TelemetryData = {
  Speed: 0,
  SpeedDisplay: 0,
  SpeedUnit: 'MPH',
  ProjectedSpeed: 0,
  Acceleration: 0,
  GForce: 0,
  LateralG: 0,
  SpeedLimit: 0,
  TrackLimit: 0,
  SignalLimit: 0,
  FrontalSpeedLimit: 0,
  Gradient: 0,
  RawGradient: 0,
  DistToNextSignal: 0,
  NextSignalAspect: 'CLEAR',
  NextSpeedLimit: 0,
  DistToNextSpeedLimit: 0,
  NextLimit2Speed: 0,
  DistToNextLimit2: 0,
  UpcomingLimits: [],
  StationDistance: -1,
  StationName: '',
  StationLength: 200,
  StationNameOCR: '',
  StationETA: '',
  StationScheduled: '',
  Throttle: 0,
  CombinedControl: 0,
  TrainBrake: 0,
  Reverser: 0,
  BrakeCylinderPressure: 0,
  BrakePipePressure: 0,
  MainResPressure: 0,
  EqResPressure: 0,
  PressureUnit: 'BAR',
  Amperage: 0,
  AmperageUnit: 'A',
  Ammeter: 0,
  TractiveEffort: 0,
  TractionPercent: 0,
  BrakingEffort: 0,
  BrakingPercent: 0,
  TripDistance: 0,
  TrainLength: 0,
  TrainMass: 0,
  ConsistType: 0,
  TrainType: 1,
  ActiveCab: 1,
  ProjectedBrakingDistance: 0,
  TailDistanceRemaining: 0,
  TailSecondsRemaining: 0,
  TailIsActive: false,
  LocoName: 'DETECTING...',
  RVNumber: '',
  RouteID: '',
  ScenarioPath: '',
  X: 0,
  Z: 0,
  location: 'UNKNOWN',
  IsEmergency: false,
  Timestamp: 0,
  AWS: 0,
  AWSState: 0,
  AWSReset: 0,
  AWSWarning: 0,
  AWSWarnCount: 0,
  DSD: 0,
  VigilAlarm: 0,
  Vigilance: 0,
  DVDAlarm: 0,
  DRA: false,
  Sander: false,
  DoorsOpen: { left: false, right: false },
  TimeOfDay: '00:00:00',
};

const TelemetryContext = createContext<TelemetryContextType | undefined>(undefined);

export const TelemetryProvider = ({ children }: { children: ReactNode }) => {
  const [data, setData] = useState<TelemetryData>(DefaultData);
  const prevDataRef = useRef<TelemetryData>(DefaultData);
  const [isConnected, setIsConnected] = useState(false);
  const [activeProfile, setActiveProfile] = useState<any>(null);
  const [availableProfiles, setAvailableProfiles] = useState<any[]>([]);
  const [lastMessageTime, setLastMessageTime] = useState(0);
  
  const activeProfileRef = useRef<any>(null);
  const availableProfilesRef = useRef<any[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const isMounted = useRef(true);
  const normalizerRef = useRef(new DataNormalizer());

  // Sincronizar refs con el estado para que el closure del socket los vea
  useEffect(() => {
    activeProfileRef.current = activeProfile;
  }, [activeProfile]);

  useEffect(() => {
    availableProfilesRef.current = availableProfiles;
  }, [availableProfiles]);

  const connect = useCallback(() => {
    if (!isMounted.current) return;
    if (socketRef.current?.readyState === WebSocket.OPEN || socketRef.current?.readyState === WebSocket.CONNECTING) return;

    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    console.log('Nexus v3 Hub: Connecting...');
    const ws = new WebSocket('ws://localhost:8000/ws/telemetry');
    socketRef.current = ws;

    ws.onopen = () => {
      if (!isMounted.current) {
        ws.close();
        return;
      }
      console.log('Nexus v3 Hub Connected');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      if (!isMounted.current) return;
      try {
        const message = JSON.parse(event.data);
        if (!message) return;
        const now = Date.now();
        
        // 1. Actualización de Perfiles Disponibles (Siempre que vengan)
        if (message.available_profiles && Array.isArray(message.available_profiles)) {
          setAvailableProfiles(message.available_profiles);
          availableProfilesRef.current = message.available_profiles;
        }

        // 2. Sincronización del Perfil Activo
        if (message.active_profile !== undefined || message.active_profile_id !== undefined) {
          let incomingProfile = message.active_profile;
          const incomingId = message.active_profile_id || message.active_profile?.id || null;
          const currentId = activeProfileRef.current?.id || null;

          // Si el mensaje solo trae el ID, buscar en la lista local
          if (!incomingProfile && incomingId && Array.isArray(availableProfilesRef.current)) {
            incomingProfile = availableProfilesRef.current.find(p => p.id === incomingId);
          }

          if (incomingId !== currentId) {
            console.log("Hub: Profile Sync [%s -> %s]", currentId, incomingId, incomingProfile?.name);
            setActiveProfile(incomingProfile || null);
            activeProfileRef.current = incomingProfile || null;
          }
        }

        // 3. Procesamiento de Telemetría
        if (message.type === 'DATA' || message.type === 'TELEMETRY') {
          const raw = message.type === 'DATA' ? message.data : message;
          if (!raw) return;

          const currentProfile = activeProfileRef.current;
          const normalized = normalizerRef.current.normalize(raw, prevDataRef.current, currentProfile);
          const next: TelemetryData = {
            ...prevDataRef.current,
            ...normalized,
            LocoName: raw.LocoName || normalized.LocoName || prevDataRef.current.LocoName,
            location: raw.location || raw.Location || normalized.location || prevDataRef.current.location,
            Timestamp: now,
          };
          prevDataRef.current = next;
          setData(next);
          setLastMessageTime(now);
        } else if (message.type === 'INIT') {
          if (message.available_profiles && Array.isArray(message.available_profiles)) {
            setAvailableProfiles(message.available_profiles);
            availableProfilesRef.current = message.available_profiles;
          }
          setActiveProfile(message.active_profile || null);
          activeProfileRef.current = message.active_profile || null;
        }
      } catch (err) {
        console.error('Telemetry parse error:', err);
      }
    };

    ws.onclose = (event) => {
      // Si el componente está desmontado (como en StrictMode), cerramos silenciosamente
      if (!isMounted.current) return;

      setIsConnected(false);
      console.log(`Hub: Connection closed (${event.code}). Reconnecting in 500ms...`);
      
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        if (isMounted.current) connect();
      }, 500);
    };

    ws.onerror = (err) => {
      // Solo logeamos el error si no es un cierre intencionado por desmontaje
      if (isMounted.current) {
        console.error('Hub WebSocket Error:', err);
      }
      ws.close();
    };
  }, []);

  const sendCommand = useCallback((cmd: string, val: number) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'COMMAND', command: cmd, value: val }));
    }
  }, []);

  const setProfile = useCallback((profileId: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      console.log('Hub: Sending SELECT_PROFILE ->', profileId);
      socketRef.current.send(JSON.stringify({ 
        type: 'SELECT_PROFILE', 
        profile_id: profileId 
      }));
    } else {
      console.warn('Hub: Cannot select profile, socket closed');
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    // Defer 1 tick to avoid StrictMode double-mount WebSocket race condition
    const initTimeout = setTimeout(() => {
      if (isMounted.current) connect();
    }, 0);
    return () => {
      isMounted.current = false;
      clearTimeout(initTimeout);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [connect]);

  return (
    <TelemetryContext.Provider value={{ 
      data, 
      isConnected, 
      lastMessageTime, 
      activeProfile, 
      availableProfiles,
      sendCommand,
      setProfile,
      resetLocalState: () => {},
    }}>
      {children}
    </TelemetryContext.Provider>
  );
};

export const useTelemetry = () => {
  const context = useContext(TelemetryContext);
  if (!context) throw new Error('useTelemetry must be used within TelemetryProvider');
  return context;
};
