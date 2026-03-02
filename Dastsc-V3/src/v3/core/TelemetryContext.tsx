import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { DataNormalizer } from './DataNormalizer';

/**
 * Esquema de Telemetría Nexus v3
 * Refinado para renderizado de alta densidad y automatización por IA.
 */
export interface TelemetryData {
  // Dinámica de Velocidad
  Speed: number;           // Siempre en m/s (Interno)
  SpeedDisplay: number;    // Convertido a MPH/KPH según perfil
  SpeedUnit: 'MPH' | 'KPH';
  ProjectedSpeed: number;  
  Acceleration: number;    
  GForce: number;          
  LateralG: number;        // Fuerza lateral estimada (G)
  SpeedLimit: number;      // Límite efectivo (m/s)
  FrontalSpeedLimit: number; // Límite en la cabina
  
  // Geografía de la Vía
  Gradient: number;        
  DistToNextSignal: number;
  NextSignalAspect: string;
  NextSpeedLimit: number;
  DistToNextSpeedLimit: number;
  UpcomingLimits: { speed: number, distance: number }[];
  
  // Estaciones (Fase 2.3)
  StationDistance: number;
  StationName: string;
  StationLength: number;
  
  // Física y Mecánica
  Throttle: number;        
  TrainBrake: number;      
  CombinedControl: number; // -1 to 1 (Brake to Power)
  Reverser: number;        
  BrakeCylinderPressure: number; 
  BrakePipePressure: number;     
  MainResPressure: number;       
  EqResPressure: number;         
  PressureUnit: 'BAR' | 'PSI';
  Amperage: number;        
  AmperageUnit: string;
  TractionPercent: number; // -100 to 100
  BrakingEffort: number;   // kN o Lbf
  BrakingPercent: number;  // 0-100% de aplicación real
  
  TrainLength: number;
  TrainMass: number;
  ActiveCab: number; // 1 = Front, 2 = Back

  // IA / Predictivo
  ProjectedBrakingDistance: number; 
  TripDistance: number;    // Metros totales recorridos en la sesión
  
  // Protección de Cola (Tail Protection)
  TailDistanceRemaining: number;  // Metros de cola pendiente (0 = seguro acelerar)
  TailSecondsRemaining: number;  // Segundos estimados de cola
  TailIsActive: boolean;          // ¿Está activa la protección de cola?
  
  // Estado del sistema
  LocoName: string;
  location: string;
  IsEmergency: boolean;
  Timestamp: number;
  
  // Sistemas de Seguridad y Auxiliares (Nuevos)
  AWS: number; 
  DSD: number;
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
  FrontalSpeedLimit: 0,
  Gradient: 0,
  DistToNextSignal: 0,
  NextSignalAspect: 'CLEAR',
  NextSpeedLimit: 0,
  DistToNextSpeedLimit: 0,
  UpcomingLimits: [],
  StationDistance: -1,
  StationName: '',
  StationLength: 200,
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
  TractionPercent: 0,
  BrakingEffort: 0,
  BrakingPercent: 0,
  TripDistance: 0,
  TrainLength: 0,
  TrainMass: 0,
  ActiveCab: 1,
  ProjectedBrakingDistance: 0,
  TailDistanceRemaining: 0,
  TailSecondsRemaining: 0,
  TailIsActive: false,
  LocoName: 'DETECTING...',
  location: 'UNKNOWN',
  IsEmergency: false,
  Timestamp: 0,
  AWS: 0,
  DSD: 0,
  DRA: false,
  Sander: false,
  DoorsOpen: { left: false, right: false },
  TimeOfDay: '00:00:00',
};

const TelemetryContext = createContext<TelemetryContextType | undefined>(undefined);

export const TelemetryProvider = ({ children }: { children: ReactNode }) => {
  const [data, setData] = useState<TelemetryData>(DefaultData);
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

    // Limpiar cualquier timeout previo
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

          // Solo actualizar si hay un cambio real para evitar re-renders infinitos
          if (incomingId !== currentId) {
            console.log(`Hub: Profile Sync [${currentId} -> ${incomingId}]`, incomingProfile?.name);
            setActiveProfile(incomingProfile || null);
            activeProfileRef.current = incomingProfile || null;
          }
        }

        // 3. Procesamiento de Telemetría
        if (message.type === 'DATA' || message.type === 'TELEMETRY') {
          const raw = message.type === 'DATA' ? message.data : message;
          if (!raw) return;

          setData(prev => {
            if (!isMounted.current) return prev;
            const currentProfile = activeProfileRef.current;
            const normalized = normalizerRef.current.normalize(raw, prev, currentProfile);

            return {
              ...prev,
              ...normalized,
              LocoName: raw.LocoName || normalized.LocoName || prev.LocoName,
              location: raw.location || raw.Location || normalized.location || prev.location, 
              Timestamp: now
            };
          });
          setLastMessageTime(now);
        } else if (message.type === 'INIT') {
          console.log('INIT received:', message);
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
      console.log(`Hub: Connection closed (${event.code}). Reconnecting in 3s...`);
      
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        if (isMounted.current) connect();
      }, 3000);
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
    connect();
    return () => {
      isMounted.current = false;
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
      setProfile 
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
