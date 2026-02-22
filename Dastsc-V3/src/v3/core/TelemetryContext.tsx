import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';

/**
 * Esquema de Telemetría Nexus v3
 * Refinado para renderizado de alta densidad y automatización por IA.
 */
export interface TelemetryData {
  // Dinámica de Velocidad
  Speed: number;           
  ProjectedSpeed: number;  
  Acceleration: number;    
  SpeedLimit: number;      
  
  // Geografía de la Vía
  Gradient: number;        
  DistToNextSignal: number;
  NextSignalAspect: string;
  NextSpeedLimit: number;
  DistToNextSpeedLimit: number;
  
  // Física y Mecánica
  Throttle: number;        
  TrainBrake: number;      
  Reverser: number;        
  BrakeCylinderPressure: number; 
  BrakePipePressure: number;     
  MainResPressure: number;       
  Amperage: number;        
  
  // IA / Predictivo
  ProjectedBrakingDistance: number; 
  
  // Estado del sistema
  LocoName: string;
  IsEmergency: boolean;
  Timestamp: number;
}

interface TelemetryContextType {
  data: TelemetryData;
  isConnected: boolean;
  lastMessageTime: number;
  activeProfile: any;
  availableProfiles: any[];
  sendCommand: (cmd: string, val: number) => void;
}

const DefaultData: TelemetryData = {
  Speed: 0,
  ProjectedSpeed: 0,
  Acceleration: 0,
  SpeedLimit: 0,
  Gradient: 0,
  DistToNextSignal: 0,
  NextSignalAspect: 'CLEAR',
  NextSpeedLimit: 0,
  DistToNextSpeedLimit: 0,
  Throttle: 0,
  TrainBrake: 0,
  Reverser: 0,
  BrakeCylinderPressure: 0,
  BrakePipePressure: 0,
  MainResPressure: 0,
  Amperage: 0,
  ProjectedBrakingDistance: 0,
  LocoName: 'DETECTING...',
  IsEmergency: false,
  Timestamp: 0,
};

const TelemetryContext = createContext<TelemetryContextType | undefined>(undefined);

export const TelemetryProvider = ({ children }: { children: ReactNode }) => {
  const [data, setData] = useState<TelemetryData>(DefaultData);
  const [isConnected, setIsConnected] = useState(false);
  const [activeProfile, setActiveProfile] = useState<any>(null);
  const [availableProfiles, setAvailableProfiles] = useState<any[]>([]);
  const [lastMessageTime, setLastMessageTime] = useState(0);
  
  const socketRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket('ws://localhost:8000/ws/telemetry');
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('Nexus v3 Hub Connected');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const now = Date.now();
        
        if (message.type === 'DATA') {
          const raw = message.data;
          setData(prev => {
            const speed = raw.Speed || 0;
            const acceleration = raw.Acceleration || 0;
            const projectedSpeed = Math.max(0, speed + (acceleration * 2.23694 * 10)); 

            return {
              ...prev,
              Speed: speed,
              Acceleration: acceleration,
              ProjectedSpeed: projectedSpeed,
              SpeedLimit: parseFloat(raw.CurrentSpeedLimit) || 0,
              Gradient: raw.Gradient || 0,
              DistToNextSignal: raw.NextSignalDistance || 0,
              NextSignalAspect: raw.NextSignalAspect || 'DEBUG',
              NextSpeedLimit: parseFloat(raw.NextSpeedLimitSpeed) || 0,
              DistToNextSpeedLimit: raw.NextSpeedLimitDistance || 0,
              
              Throttle: raw.Regulator || 0,
              TrainBrake: raw.TrainBrakeControl || 0,
              Reverser: raw.Reverser || 0,
              BrakeCylinderPressure: raw.TrainBrakeCylinderPressureBAR || raw.EngineBrakeCylinderPressureBAR || 0,
              BrakePipePressure: raw.TrainBrakePipePressureBAR || 0,
              MainResPressure: raw.MainResPressureBAR || 0,
              Amperage: raw.Ammeter || raw.TractiveEffort || 0,
              
              ProjectedBrakingDistance: (speed * speed) / (2 * 0.5),
              
              LocoName: raw.LocoName || prev.LocoName,
              IsEmergency: raw.EmergencyBrake === 1,
              Timestamp: now
            };
          });
          setLastMessageTime(now);
        } else if (message.type === 'INIT') {
          setAvailableProfiles(message.available_profiles || []);
          setActiveProfile(message.active_profile);
        } else if (message.type === 'PROFILE_CHANGE') {
          setActiveProfile(message.active_profile);
        }
      } catch (err) {
        console.error('Telemetry parse error:', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setTimeout(connect, 2000); // Robust reconnection
    };
  }, []);

  const sendCommand = useCallback((cmd: string, val: number) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'COMMAND', command: cmd, value: val }));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => socketRef.current?.close();
  }, [connect]);

  return (
    <TelemetryContext.Provider value={{ 
      data, 
      isConnected, 
      lastMessageTime, 
      activeProfile, 
      availableProfiles,
      sendCommand 
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
