import { useState, useEffect, useCallback, useRef } from 'react';

export interface TelemetryData {
  Speed?: number;
  CurvatureActual?: number;
  CurvatureAhead?: number;
  Gradient?: number;
  g_lateral?: number;
  g_longitudinal?: number;
  timestamp?: number;
  status?: string;
  active_profile?: {
    id?: string;
    name: string;
    mappings?: Record<string, string>;
    [key: string]: any;
  };
  available_profiles?: Array<{id: string, name: string}>;
  [key: string]: any; // Para soportar métricas adicionales dinámicas
}

export const useTelemetry = (url: string = 'ws://localhost:8000/ws/telemetry') => {
  const [data, setData] = useState<TelemetryData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const sendMessage = useCallback((msg: any) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) return;

    console.log('Intentando conectar a:', url);
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log('Conexión establecida con el Backend');
      setIsConnected(true);
      setError(null);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    socket.onmessage = (event) => {
      try {
        const parsedData = JSON.parse(event.data);
        setData(prev => {
          // Lógica de persistencia ultra-robusta para la lista de perfiles
          // Solo actualizamos la lista si el nuevo mensaje trae datos reales (!= vacío)
          const validNewProfiles = parsedData.available_profiles && parsedData.available_profiles.length > 0;
          const available_profiles = validNewProfiles ? parsedData.available_profiles : prev?.available_profiles;
          
          return {
            ...prev,
            ...parsedData,
            available_profiles 
          };
        });
      } catch (err) {
        console.error('Error parseando datos de telemetría:', err);
      }
    };

    socket.onclose = () => {
      console.log('Conexión cerrada. Intentando reconectar en 3s...');
      setIsConnected(false);
      // Intentar reconectar después de 3 segundos
      reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
    };

    socket.onerror = (err) => {
      console.error('Error en WebSocket:', err);
      setError('Error de conexión con el servidor de telemetría');
      socket.close();
    };
  }, [url]);

  useEffect(() => {
    connect();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  return { data, isConnected, error, sendMessage };
};
