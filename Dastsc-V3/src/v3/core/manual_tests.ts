
import { TailProtectionService } from './TailProtectionService';

/**
 * TEST: COLA LIMPIADORA (TailProtectionService)
 * Escenario: El tren mide 100m. El límite es 40 km/h.
 * Pasamos por una señal de 60 km/h. El límite debe seguir en 40 km/h 
 * hasta que el tren recorra 100m.
 */
export function testTailProtection() {
  const service = new TailProtectionService();
  const trainLength = 100;
  const initialLimitMS = 40 / 3.6; // 11.11 m/s
  const targetLimitMS = 60 / 3.6;  // 16.66 m/s
  const speedMS = 10 / 3.6;        // Vamos a 10 km/h (2.77 m/s)
  const dt = 1.0;                  // 1 segundo por tick

  console.log("--- TEST: COLA LIMPIADORA ---");

  // 1. Disparamos la protección
  service.trigger(targetLimitMS, initialLimitMS, trainLength, 0);
  console.log(`Trigger: Objetivo ${targetLimitMS * 3.6} km/h, Tren ${trainLength}m`);

  // 2. Simulamos movimiento (10 ticks de 1s a 10 km/h = 27.7m)
  for (let i = 1; i <= 5; i++) {
    const res = service.update(speedMS, dt, trainLength, initialLimitMS);
    console.log(`Etapa ${i} (${Math.round(i * speedMS)}m): Límite Efectivo: ${Math.round(res.effectiveLimit * 3.6)} km/h, Cola: ${Math.round(res.tailDist)}m`);
  }

  // 3. Verificamos que el límite no ha subido aún
  const midRes = service.update(speedMS, dt, trainLength, initialLimitMS);
  if (Math.abs(midRes.effectiveLimit - initialLimitMS) < 0.1) {
    console.log("✅ CORRECTO: Límite sigue protegido a 40 km/h");
  } else {
    console.error("❌ ERROR: El límite subió antes de tiempo");
  }

  // 4. Saltamos al final (Simulamos que ya pasaron los 100m)
  // Para el test, forzamos un dt grande para completar la distancia
  const finalRes = service.update(speedMS, 100, trainLength, initialLimitMS);
  console.log(`Final: Límite Efectivo: ${Math.round(finalRes.effectiveLimit * 3.6)} km/h, Cola: ${Math.round(finalRes.tailDist)}m`);

  if (Math.abs(finalRes.effectiveLimit - targetLimitMS) < 0.1) {
    console.log("✅ CORRECTO: Límite subió a 60 km/h tras 100m");
  } else {
    console.error("❌ ERROR: El límite no subió al completar la distancia");
  }
}

/**
 * TEST: SECUENCIA RÁPIDA (40 -> 60 -> 80)
 * Escenario: Pasamos dos señales de aumento antes de que la cola limpie la primera.
 * El sistema debe encolar ambos saltos y no liberar el 80 hasta recorrer la distancia total.
 */
export function testMultiCheckpoint() {
  console.log("\n--- TEST: SECUENCIA RÁPIDA (40 -> 60 -> 80) ---");
  const service = new TailProtectionService();
  const trainLength = 100;
  const speedMS = 10; // 10 m/s
  const dt = 1.0;

  // 1. Cabina pasa señal de 60
  service.trigger(60/3.6, 40/3.6, trainLength, 0);
  console.log("Señal 1 (60 km/h) detectada. Cola: 100m");

  // 2. Avanzamos 50m (Cola a mitad)
  for(let i=0; i<5; i++) service.update(speedMS, dt, trainLength, 40/3.6);
  
  // 3. Cabina pasa señal de 80 (Aún no hemos limpiado la de 60)
  service.trigger(80/3.6, 60/3.6, trainLength, 0);
  console.log("Señal 2 (80 km/h) detectada ANTES de limpiar la primera. Cola: 100m (nueva)");

  // 4. Verificamos que el límite sigue siendo 40 (El más restrictivo de la cola)
  const resMid = service.update(speedMS, dt, trainLength, 40/3.6);
  console.log(`Estado Intermedio: Límite: ${Math.round(resMid.effectiveLimit * 3.6)} km/h, Cola: ${Math.round(resMid.tailDist)}m`);
  
  if (Math.round(resMid.effectiveLimit * 3.6) === 40) {
    console.log("✅ CORRECTO: Mantiene 40 km/h (protección en cadena)");
  } else {
    console.error("❌ ERROR: ¡Saltó el límite prematuramente!");
  }

  // 5. Avanzamos 60m más (Total 110m). Debería haber limpiado la de 60 y estar protegiendo la de 80.
  for(let i=0; i<6; i++) service.update(speedMS, dt, trainLength, 40/3.6);
  const resStep2 = service.update(speedMS, dt, trainLength, 40/3.6);
  console.log(`Estado Paso 2: Límite: ${Math.round(resStep2.effectiveLimit * 3.6)} km/h, Cola: ${Math.round(resStep2.tailDist)}m`);

  if (Math.round(resStep2.effectiveLimit * 3.6) === 60) {
    console.log("✅ CORRECTO: Subió a 60 km/h (primera señal limpia)");
  }

  // 6. Avanzamos 50m finales (Total 160m). Todo libre.
  service.update(speedMS, 50, trainLength, 40/3.6);
  const resFinal = service.update(speedMS, 1, trainLength, 40/3.6);
  console.log(`Estado Final: Límite: ${Math.round(resFinal.effectiveLimit * 3.6)} km/h`);

  if (Math.round(resFinal.effectiveLimit * 3.6) === 80) {
    console.log("✅ CORRECTO: Tren libre a 80 km/h");
  }
}

/**
 * TEST: REDUCCIÓN PRIORITARIA (Emergency/Reset)
 * Escenario: Estamos protegiendo un aumento pero el límite de la vía BAJA de golpe.
 * La seguridad manda: el límite efectivo debe bajar a la velocidad de la vía inmediatamente.
 */
export function testSafetyOverride() {
  console.log("\n--- TEST: SEGURIDAD (Override por Reducción) ---");
  const service = new TailProtectionService();
  const trainLength = 100;

  // 1. Iniciamos protección de 40 -> 60
  service.trigger(60/3.6, 40/3.6, trainLength, 0);
  
  // 2. Simulamos que el límite nominal de la vía baja a 20 (Señal de peligro/restricción)
  // El servicio debe detectar que el currentTrackLimitMS es menor que su protección
  const res = service.update(10, 1, trainLength, 20/3.6);
  console.log(`Vía: 20 km/h, Protección Activa: 40 km/h. Resultado: ${Math.round(res.effectiveLimit * 3.6)} km/h`);

  if (Math.round(res.effectiveLimit * 3.6) === 20) {
    console.log("✅ CORRECTO: La reducción de la vía ignoró la protección de cola");
  } else {
    console.error("❌ ERROR: La cola mantuvo un límite superior al de la vía");
  }
}

/**
 * TEST: MÉTRICAS (KM, MILLAS, YARDAS)
 * Basado en las conversiones de DataNormalizer
 */
export function testMetrics() {
  console.log("\n--- TEST: MÉTRICAS (KM/MPH/YARDS) ---");
  
  const toMS_MPH = 0.44704;
  const toMS_KPH = 0.277778;
  const metersInYard = 0.9144;

  // Escenario 1: 60 MPH a MS
  const mph60InMS = 60 * toMS_MPH;
  console.log(`60 MPH -> ${mph60InMS.toFixed(2)} m/s (Esperado ~26.82)`);
  if (Math.abs(mph60InMS - 26.82) < 0.05) console.log("✅ MPH OK");

  // Escenario 2: 100 KPH a MS
  const kph100InMS = 100 * toMS_KPH;
  console.log(`100 KPH -> ${kph100InMS.toFixed(2)} m/s (Esperado ~27.78)`);
  if (Math.abs(kph100InMS - 27.78) < 0.05) console.log("✅ KPH OK");

  // Escenario 3: Yardas a Metros (Distancia de señales)
  const yards500InMeters = 500 * metersInYard;
  console.log(`500 Yardas -> ${yards500InMeters.toFixed(2)} metros (Esperado ~457.2)`);
  if (Math.abs(yards500InMeters - 457.2) < 0.1) console.log("✅ YARDAS OK");
}

import { testLuaConsistency } from './lua_integration_test';

// Ejecución manual si se corre este archivo
console.log("Iniciando pruebas manuales...");
testTailProtection();
testMultiCheckpoint();
testSafetyOverride();
testLuaConsistency();
testMetrics();
console.log("Pruebas finalizadas.");
