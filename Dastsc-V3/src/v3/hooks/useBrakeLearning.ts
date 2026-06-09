/**
 * useBrakeLearning — Monitorización pasiva de frenadas.
 *
 * Sin botones ni intervención del usuario. Detecta automáticamente cada
 * evento de frenado (inicio, máximo, fin) y lo envía al backend para
 * registrarlo en brake_events.json. Con el tiempo el sistema aprende las
 * características reales de frenado de cada perfil.
 *
 * Criterios de detección:
 *   - INICIO: velocidad > 2 m/s Y deceleración > 0.05 m/s² sostenida 1.5s
 *   - FIN: velocidad < 0.5 m/s O deceleración cae a ≤ 0 por más de 3s
 *
 * Datos registrados por evento:
 *   start_speed, end_speed, avg_decel, max_decel, notch (mejor estimación),
 *   gradient, train_mass, train_length, profile, duration, distance_covered
 */
import { useEffect, useRef, useCallback } from 'react';
import { TelemetryData } from '../core/TelemetryContext';

const API = 'http://localhost:8000';
const MIN_SPEED_TO_START_MS = 2.0;      // m/s mínimo para considerar una frenada real
const DECEL_THRESHOLD_MS2 = 0.05;       // m/s² para confirmar inicio de frenado
const CONFIRM_SECS = 1.5;               // segundos continuos de deceleración para confirmar
const RELEASE_SECS = 3.0;               // segundos sin deceleración para cerrar el evento
const MIN_DURATION_SECS = 5.0;          // descartar frenadas muy cortas (ruido)
const MIN_DECEL_AVG_MS2 = 0.10;         // descartar eventos con deceleración media irrisoria
const MAX_DURATION_SECS = 240;          // forzar cierre de eventos atascados (>4 min = bug)

interface BrakeSample {
  speed: number;       // m/s
  decel: number;       // m/s² (positivo = decelerando)
  trip: number;        // metros totales de viaje
  notch: string;       // muesca estimada en ese instante
  t: number;           // timestamp ms
}

interface ActiveEvent {
  confirmStartT: number;        // primer momento con decel > threshold
  confirmed: boolean;           // true tras CONFIRM_SECS seguidos
  startSpeed: number;
  startTrip: number;
  samples: BrakeSample[];
  lastDecelT: number;           // último timestamp con decel > 0
}

function estimateNotch(raw: TelemetryData, profile: any): string {
  // CombinedControl: posición del mando combinado, −1 (freno máx) a +1 (tracción máx).
  // Coincide directamente con la escala de notches_throttle_brake del perfil.
  const val = raw.CombinedControl ?? 0;

  // Preferir notches del perfil si están definidos
  const notches = profile?.specs?.notches_throttle_brake;
  if (notches) {
    const brakeNotches = notches
      .filter((n: any) => n.value < 0)
      .sort((a: any, b: any) => a.value - b.value);   // ascendente: más negativo primero
    for (const n of brakeNotches) {
      if (val <= n.value + 0.05) return n.label;
    }
    if (brakeNotches.length && val < -0.05) return brakeNotches[brakeNotches.length - 1].label;
  }

  // Fallback: porcentaje del mando como texto
  if (val < -0.05) return `B${Math.round(Math.abs(val) * 100)}%`;
  return '?';
}

export function useBrakeLearning(
  raw: TelemetryData,
  activeProfile: any,
  enabled = true
) {
  const activeEventRef = useRef<ActiveEvent | null>(null);
  const prevSpeedRef = useRef<number>(raw.Speed);
  const prevTimeRef = useRef<number>(Date.now());
  // Tiempo del último cambio real de velocidad (evita dt=10ms cuando TripDistance dispara el effect
  // pero Speed no ha cambiado — cuantización del simulador)
  const prevSpeedChangeTimeRef = useRef<number>(Date.now());
  // Refs para valores que cambian cada frame — evitan recrear submitEvent continuamente
  const gradientRef = useRef(raw.Gradient);
  const trainMassRef = useRef(raw.TrainMass);
  const trainLengthRef = useRef(raw.TrainLength);
  const locoNameRef = useRef(raw.LocoName);
  gradientRef.current = raw.Gradient;
  trainMassRef.current = raw.TrainMass;
  trainLengthRef.current = raw.TrainLength;
  locoNameRef.current = raw.LocoName;

  const submitEvent = useCallback(async (event: ActiveEvent, endSpeed: number) => {
    const samples = event.samples;
    if (!samples.length) return;

    const duration = (samples[samples.length - 1].t - samples[0].t) / 1000;
    if (duration < MIN_DURATION_SECS) return;

    // Filtrar spikes por cuantización del simulador (límite físico real ~3 m/s² en freno de emergencia)
    const MAX_PHYSICAL_DECEL = 3.5; // m/s²
    const decels = samples.map(s => s.decel).filter(d => d > 0 && d <= MAX_PHYSICAL_DECEL);
    if (!decels.length) return;
    const avgDecel = decels.reduce((a, b) => a + b, 0) / decels.length;
    if (avgDecel < MIN_DECEL_AVG_MS2) return;
    const maxDecel = Math.max(...decels);

    // Muesca dominante: contar solo muestras donde el freno estaba activo (notch != '?')
    // para no contaminar el resultado con frames en posición OFF.
    const notchCount: Record<string, number> = {};
    samples
      .filter(s => s.notch !== '?' && s.decel >= DECEL_THRESHOLD_MS2)
      .forEach(s => { notchCount[s.notch] = (notchCount[s.notch] ?? 0) + 1; });
    const dominantNotch = Object.entries(notchCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '?';
    // Sin muesca identificada → no guardar (evento sin información útil para el autopilot)
    if (dominantNotch === '?') return;

    const distanceCovered = Math.abs(
      (samples[samples.length - 1].trip ?? 0) - (event.startTrip ?? 0)
    );

    const payload = {
      start_speed_ms: parseFloat(event.startSpeed.toFixed(2)),
      end_speed_ms: parseFloat(endSpeed.toFixed(2)),
      avg_decel_ms2: parseFloat(avgDecel.toFixed(3)),
      max_decel_ms2: parseFloat(maxDecel.toFixed(3)),
      notch: dominantNotch,
      duration_s: parseFloat(duration.toFixed(1)),
      distance_m: parseFloat(distanceCovered.toFixed(0)),
      gradient: parseFloat(((gradientRef.current) ?? 0).toFixed(2)),
      train_mass: trainMassRef.current ?? 0,
      train_length: trainLengthRef.current ?? 0,
      profile: activeProfile?.id ?? activeProfile?.name ?? 'unknown',
      loco: locoNameRef.current ?? '',
    };

    try {
      const res = await fetch(`${API}/api/brake/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        console.log('[BrakeLearning] ✓ Evento guardado', payload);
      } else {
        console.warn('[BrakeLearning] POST fallido', res.status, data);
      }
    } catch (err) {
      console.error('[BrakeLearning] Error de red:', err);
    }
  }, [activeProfile]);  // ya no depende de raw.* que cambian cada frame

  useEffect(() => {
    if (!enabled) return;

    const now = Date.now();
    prevTimeRef.current = now;

    const speed = raw.Speed;
    let decel = 0;
    if (speed !== prevSpeedRef.current) {
      // Solo calculamos decel cuando la velocidad realmente cambió (evita dt=10ms por TripDistance)
      const dt = Math.max(0.016, (now - prevSpeedChangeTimeRef.current) / 1000);
      decel = (prevSpeedRef.current - speed) / dt;
      prevSpeedChangeTimeRef.current = now;
      prevSpeedRef.current = speed;
    }

    const notch = estimateNotch(raw, activeProfile);
    const sample: BrakeSample = { speed, decel, trip: raw.TripDistance ?? 0, notch, t: now };

    const ev = activeEventRef.current;

    if (!ev) {
      // Sin evento activo — detectar inicio de frenada
      if (speed > MIN_SPEED_TO_START_MS && decel >= DECEL_THRESHOLD_MS2) {
        console.debug('[BrakeLearning] Evento iniciado', { speed: speed.toFixed(2), decel: decel.toFixed(3) });
        activeEventRef.current = {
          confirmStartT: now,
          confirmed: false,
          startSpeed: speed,
          startTrip: raw.TripDistance ?? 0,
          samples: [sample],
          lastDecelT: now,
        };
      }
    } else {
      // Evento activo
      if (decel > 0) ev.lastDecelT = now;
      ev.samples.push(sample);

      // Confirmar si llevamos CONFIRM_SECS seguidos con decel > threshold
      if (!ev.confirmed && (now - ev.confirmStartT) / 1000 >= CONFIRM_SECS) {
        ev.confirmed = true;
        console.debug('[BrakeLearning] Evento confirmado', { startSpeed: ev.startSpeed.toFixed(2), samples: ev.samples.length });
      }

      // Cerrar evento si:
      const stopped = speed < 0.5;
      const releasedTooLong = (now - ev.lastDecelT) / 1000 > RELEASE_SECS;
      const tooLong = (now - ev.samples[0].t) / 1000 > MAX_DURATION_SECS;

      if (stopped || releasedTooLong || tooLong) {
        if (ev.confirmed) {
          console.debug('[BrakeLearning] Enviando evento', { stopped, releasedTooLong, endSpeed: speed.toFixed(2) });
          submitEvent(ev, speed);
        } else {
          console.debug('[BrakeLearning] Evento descartado (no confirmado)');
        }
        activeEventRef.current = null;
      }
    }
  }, [raw.Speed, raw.TripDistance, raw.TractionPercent, enabled, activeProfile, submitEvent]);

  return null; // hook solo de efecto lateral
}
