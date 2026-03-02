/**
 * TailProtectionService.ts
 * 
 * Basado en la lógica "Proactiva" de V2 (tsc_dashboard_proto.py).
 * Se dispara al pasar el frente de la locomotora por una señal si el próximo límite es mayor.
 */

export interface TailProtectionState {
  waitingForClearance: boolean;
  distanceTravelledSinceLimit: number;
  effectiveShowLimit: number;
  lastNextDist: number;
  pendingLimit: number;
  trainLength: number;
}

export class TailProtectionService {
  private state: TailProtectionState = {
    waitingForClearance: false,
    distanceTravelledSinceLimit: 0,
    effectiveShowLimit: 0,
    lastNextDist: 0,
    pendingLimit: 0,
    trainLength: 100
  };

  /**
   * Procesa la lógica de cola calqueando el comportamiento de V2
   */
  update(
    currentLimit: number,
    nextLimitSpeed: number,
    nextLimitDist: number,
    speedMS: number,
    dt: number,
    trainLength: number
  ) {
    this.state.trainLength = trainLength > 0 ? trainLength : 100;

    // --- Lógica Proactiva (V2) ---
    // Detectamos si acabamos de cruzar una señal (el salto de distancia de pequeña a grande)
    if (this.state.lastNextDist < 15.0 && nextLimitDist > 100.0) {
      // Si el límite que íbamos a alcanzar es mayor que el actual (SUBIDA)
      if (this.state.pendingLimit > currentLimit) {
        this.state.waitingForClearance = true;
        this.state.distanceTravelledSinceLimit = 0.0;
        // En V2 el effective_show_limit no se actualizaba aquí, se mantenía el viejo
      } else {
        // Bajada: Aplicamos inmediatamente
        this.state.waitingForClearance = false;
        this.state.effectiveShowLimit = currentLimit;
      }
    }

    // Si el límite de la vía baja de repente (prioridad seguridad)
    if (currentLimit < this.state.effectiveShowLimit) {
      this.state.waitingForClearance = false;
      this.state.effectiveShowLimit = currentLimit;
      this.state.distanceTravelledSinceLimit = 0.0;
    }

    // Si no estamos esperando cola, el límite efectivo es el de la vía
    if (!this.state.waitingForClearance) {
      this.state.effectiveShowLimit = currentLimit;
    }

    // Guardamos estado para el siguiente frame
    this.state.lastNextDist = nextLimitDist;
    this.state.pendingLimit = nextLimitSpeed;

    // Procesamos el odómetro si estamos en espera
    if (this.state.waitingForClearance) {
      this.state.distanceTravelledSinceLimit += Math.abs(speedMS) * dt;
      
      if (this.state.distanceTravelledSinceLimit >= this.state.trainLength) {
        this.state.waitingForClearance = false;
        this.state.effectiveShowLimit = this.state.pendingLimit || currentLimit;
      }
    }

    return {
      isActive: this.state.waitingForClearance,
      distanceRemaining: Math.max(0, this.state.trainLength - this.state.distanceTravelledSinceLimit),
      effectiveLimit: this.state.effectiveShowLimit,
      progress: Math.min(100, (this.state.distanceTravelledSinceLimit / this.state.trainLength) * 100)
    };
  }

  reset() {
    this.state.waitingForClearance = false;
    this.state.distanceTravelledSinceLimit = 0;
  }
}
