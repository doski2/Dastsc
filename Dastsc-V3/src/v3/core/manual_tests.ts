
import { testLuaConsistency } from './lua_integration_test';

/**
 * DASTSC V3 - Manual Test Runner
 * Este archivo centraliza los tests de integración para ser ejecutados
 * desde el archivo .bat en el entorno de desarrollo.
 */

async function runAllTests() {
  console.log("==================================================");
  console.log("   DASTSC V3 - INTEGRATION TEST SUITE (DEVELOPMENT)");
  console.log("==================================================");

  try {
    // 1. Ejecutar tests de consistencia de LUA
    await testLuaConsistency();

    // 2. Aquí añadiremos más tests conforme los desarrollemos (Física, Scenarios, etc.)
    console.log("\n--- TEST: PENDING (Scenarios, Physics) ---");
    console.log("Skipping pending tests (under construction)...");

    console.log("\n==================================================");
    console.log("   TODOS LOS TESTS COMPLETADOS EXITOSAMENTE");
    console.log("==================================================");
    process.exit(0);
  } catch (error) {
    console.error("\n[FATAL ERROR] Fallo crítico durante la ejecución de tests:");
    console.error(error);
    process.exit(1);
  }
}

// Iniciar ejecución
runAllTests();
