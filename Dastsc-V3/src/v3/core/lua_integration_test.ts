
/**
 * TEST: LUA SIMULATOR (Denoising & Consistency)
 * Escenario: Validamos que el Normalizador maneje correctamente 
 * los datos que envía el script Lua.
 */
import { DataNormalizer } from './DataNormalizer';

export function testLuaConsistency() {
  console.log("\n--- TEST: CONSISTENCIA LUA (DataNormalizer) ---");
  const normalizer = new DataNormalizer();
  
  // 1. Mock de datos brutos EXACTAMENTE como los envía el Lua (attachment GetData.txt)
  const rawData = {
    SimulationTime: 59.00,
    SpeedoType: 1, // MPH
    CurrentSpeed: 7.6995, // MPS
    CurrentSpeedLimit: 20.0, // MPH
    TrainLength: 144.20,
    NextLimit0Speed: 30.0,
    NextLimit0Dist: 199,
    // ... otros campos
  };

  // Primera pasada para inicializar estado
  normalizer.normalize(rawData, {} as any, null);

  // 2. Simulamos un "glitch" de Lua (Salto de velocidad absurdo en 1 tick)
  const glitchData = {
    ...rawData,
    SimulationTime: 59.1,
    CurrentSpeed: 50.0, // Un salto imposible de 7.7 a 50 m/s en 0.1s
  };

  const cleanResult = normalizer.normalize(glitchData, {} as any, null);
  
  console.log(`Velocidad tras Glitch: ${cleanResult.Speed?.toFixed(2)} m/s (Esperado filtrado cerca de 7.7)`);

  if (cleanResult.Speed! < 10) {
    console.log("✅ CORRECTO: El normalizador filtró el ruido del script Lua");
  } else {
    console.error("❌ ERROR: El normalizador aceptó un valor basura del script Lua");
  }

  // 3. Test de Cambio de Unidades (KPH en Lua)
  const kphData = {
    ...rawData,
    SpeedoType: 2, // KPH
    CurrentSpeed: 10.0, 
    CurrentSpeedLimit: 100.0, // 100 KPH
    SimulationTime: 65.0 
  };

  // 4. Test de Señalización (SigState 3 -> Verde)
  const signalData = {
    ...rawData,
    SigRes: 1,
    SigState: 3, // CLEAR
    SigDist: 0.1, // 100m (en el normalizer se multiplica por 1000 si está en km, o se mapea directo)
    SimulationTime: 70.0
  };

  const signalRes = normalizer.normalize(signalData, {} as any, null);
  console.log(`Aspecto detectado: ${signalRes.NextSignalAspect}, Distancia: ${signalRes.DistToNextSignal}m`);

  if (signalRes.NextSignalAspect === 'CLEAR') {
    console.log("✅ CORRECTO: Sincronización de señales con Lua OK");
  } else {
    console.error(`❌ ERROR: Fallo en la detección de señales de Lua. Obtenido: ${signalRes.NextSignalAspect} (Esperaba CLEAR)`);
  }
}

// Nota: No se puede testear el archivo .lua físicamente sin Railworks, 
// pero este test protege la integración contra cambios en el formato de salida del Lua.
