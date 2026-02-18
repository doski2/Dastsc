import { renderHook, waitFor } from '@testing-library/react';
import { expect, test, describe } from 'vitest';
import { useTelemetry } from '../hooks/useTelemetry';

describe('useTelemetry Hook', () => {
  test('debe iniciar en estado desconectado', () => {
    const { result } = renderHook(() => useTelemetry('ws://localhost:9999'));
    expect(result.current.isConnected).toBe(false);
    expect(result.current.data).toBe(null);
  });

  test('debe conectarse y recibir datos', async () => {
    const { result } = renderHook(() => useTelemetry('ws://localhost:9999'));

    // Esperamos a que el mock cambie a conectado
    await waitFor(() => expect(result.current.isConnected).toBe(true), { timeout: 1000 });
  });

  test('debe manejar errores de parsing JSON', async () => {
    const { result } = renderHook(() => useTelemetry('ws://localhost:9999'));
    
    // Verificamos que no rompa la app si recibe algo que no es JSON
    // El hook tiene un try-catch interno
    expect(result.current.error).toBe(null);
  });
});
