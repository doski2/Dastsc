import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { DataNormalizer } from './DataNormalizer';
import {
  extractRawTelemetry,
  isTelemetryMessage,
  mergeTelemetryUpdate,
  ProfileSummary,
  profileIdsEqual,
  resolveIncomingProfile,
  TELEMETRY_WS_URL,
  toSimulatorRawInput,
  WS_RECONNECT_MS,
  type WsMessage,
} from './telemetryHubUtils';
import type { NormalizerProfile } from './dataNormalizerUtils';

export type { ProfileSummary };

export interface TelemetryData {
  Speed: number;
  SpeedDisplay: number;
  SpeedUnit: 'MPH' | 'km/h';
  ProjectedSpeed: number;
  Acceleration: number;
  GForce: number;
  LateralG: number;
  SpeedLimit: number;
  TrackLimit: number;
  SignalLimit: number;
  FrontalSpeedLimit: number;
  Gradient: number;
  RawGradient: number;
  DistToNextSignal: number;
  NextSignalAspect: string;
  NextSpeedLimit: number;
  DistToNextSpeedLimit: number;
  NextLimit2Speed: number;
  DistToNextLimit2: number;
  UpcomingLimits: { speed: number; distance: number }[];
  StationDistance: number;
  StationName: string;
  StationLength: number;
  StationNameOCR: string;
  StationETA: string;
  StationScheduled: string;
  Throttle: number;
  TrainBrake: number;
  CombinedControl: number;
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
  TractionPercent: number;
  BrakingEffort: number;
  BrakingPercent: number;
  TrainLength: number;
  TrainMass: number;
  ConsistType: number;
  TrainType: number;
  ActiveCab: number;
  ProjectedBrakingDistance: number;
  TripDistance: number;
  TailDistanceRemaining: number;
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
  activeProfile: ProfileSummary | null;
  availableProfiles: ProfileSummary[];
  sendCommand: (cmd: string, val: number) => void;
  setProfile: (profileId: string) => void;
  resetLocalState: () => void;
}

export const DEFAULT_TELEMETRY_DATA: TelemetryData = {
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
  const [data, setData] = useState<TelemetryData>(DEFAULT_TELEMETRY_DATA);
  const prevDataRef = useRef<TelemetryData>(DEFAULT_TELEMETRY_DATA);
  const [isConnected, setIsConnected] = useState(false);
  const [activeProfile, setActiveProfile] = useState<ProfileSummary | null>(null);
  const [availableProfiles, setAvailableProfiles] = useState<ProfileSummary[]>([]);
  const [lastMessageTime, setLastMessageTime] = useState(0);

  const activeProfileRef = useRef<ProfileSummary | null>(null);
  const availableProfilesRef = useRef<ProfileSummary[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);
  const normalizerRef = useRef(new DataNormalizer());

  const applyProfiles = useCallback((profiles: ProfileSummary[]) => {
    setAvailableProfiles(profiles);
    availableProfilesRef.current = profiles;
  }, []);

  const applyActiveProfile = useCallback((profile: ProfileSummary | null) => {
    setActiveProfile(profile);
    activeProfileRef.current = profile;
  }, []);

  const syncActiveProfile = useCallback((message: WsMessage) => {
    if (message.active_profile === undefined && message.active_profile_id === undefined) {
      return;
    }

    const incomingId = message.active_profile_id ?? message.active_profile?.id ?? null;
    const currentId = activeProfileRef.current?.id ?? null;
    if (profileIdsEqual(incomingId, currentId) && message.active_profile === undefined) {
      return;
    }

    const resolved = resolveIncomingProfile(message, availableProfilesRef.current);
    if (!profileIdsEqual(incomingId, currentId)) {
      applyActiveProfile(resolved);
    }
  }, [applyActiveProfile]);

  const handleMessage = useCallback((event: MessageEvent) => {
    if (!isMounted.current) return;

    try {
      const message = JSON.parse(event.data) as WsMessage;
      if (!message?.type) return;

      if (Array.isArray(message.available_profiles)) {
        applyProfiles(message.available_profiles);
      }

      if (message.type === 'INIT' || message.type === 'PROFILE_CHANGED') {
        if (Array.isArray(message.available_profiles)) {
          applyProfiles(message.available_profiles);
        }
        applyActiveProfile(resolveIncomingProfile(message, availableProfilesRef.current));
        return;
      }

      syncActiveProfile(message);

      if (!isTelemetryMessage(message)) return;

      const raw = extractRawTelemetry(message);
      if (!raw) return;

      const now = Date.now();
      const normalized = normalizerRef.current.normalize(
        toSimulatorRawInput(raw),
        prevDataRef.current,
        activeProfileRef.current as NormalizerProfile | null,
      );
      const next = mergeTelemetryUpdate(raw, normalized, prevDataRef.current, now);
      prevDataRef.current = next;
      setData(next);
      setLastMessageTime(now);
    } catch (err) {
      console.error('[Telemetry] Parse error:', err);
    }
  }, [applyActiveProfile, applyProfiles, syncActiveProfile]);

  const connect = useCallback(() => {
    if (!isMounted.current) return;
    if (
      socketRef.current?.readyState === WebSocket.OPEN ||
      socketRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);

    const ws = new WebSocket(TELEMETRY_WS_URL);
    socketRef.current = ws;

    ws.onopen = () => {
      if (!isMounted.current) {
        ws.close();
        return;
      }
      setIsConnected(true);
    };

    ws.onmessage = handleMessage;

    ws.onclose = (event) => {
      if (!isMounted.current) return;
      setIsConnected(false);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        if (isMounted.current) connect();
      }, WS_RECONNECT_MS);
      void event;
    };

    ws.onerror = () => {
      if (isMounted.current) ws.close();
    };
  }, [handleMessage]);

  const sendCommand = useCallback((cmd: string, val: number) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'COMMAND', command: cmd, value: val }));
    }
  }, []);

  const setProfile = useCallback((profileId: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'SELECT_PROFILE',
        profile_id: profileId,
      }));
    }
  }, []);

  const resetLocalState = useCallback(() => {
    normalizerRef.current.reset();
    prevDataRef.current = DEFAULT_TELEMETRY_DATA;
    setData(DEFAULT_TELEMETRY_DATA);
    setLastMessageTime(0);
  }, []);

  useEffect(() => {
    activeProfileRef.current = activeProfile;
  }, [activeProfile]);

  useEffect(() => {
    availableProfilesRef.current = availableProfiles;
  }, [availableProfiles]);

  useEffect(() => {
    isMounted.current = true;
    const initTimeout = setTimeout(() => {
      if (isMounted.current) connect();
    }, 0);

    return () => {
      isMounted.current = false;
      clearTimeout(initTimeout);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      socketRef.current?.close();
      socketRef.current = null;
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
      resetLocalState,
    }}
    >
      {children}
    </TelemetryContext.Provider>
  );
};

export const useTelemetry = () => {
  const context = useContext(TelemetryContext);
  if (!context) throw new Error('useTelemetry must be used within TelemetryProvider');
  return context;
};
