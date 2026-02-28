
/**
 * TailProtectionService.ts
 * Gestiona el odómetro de cola para asegurar que el límite de velocidad 
 * solo aumente cuando el último vagón haya superado el hito.
 */

interface ProtectionCheckpoint {
  targetLimitMS: number;
  remainingDist: number;
}

export class TailProtectionService {
  private checkpoints: ProtectionCheckpoint[] = [];
  private currentTailAllowanceMS: number = 0;
  private isProtecting: boolean = false;

  /**
   * Actualiza el progreso del odómetro para todos los hitos pendientes.
   * @returns { effectiveLimit: number, tailDist: number } 
   */
  update(speedMS: number, dtSim: number, trainLength: number, currentTrackLimitMS: number): { effectiveLimit: number, tailDist: number } {
    // V3.11: PRIORIDAD DE SEGURIDAD
    // Si la vía baja (señal restrictiva inmediata), ignoramos la protección de cola.
    if (this.isProtecting && currentTrackLimitMS < (this.currentTailAllowanceMS - 0.1)) {
       this.reset();
       return { effectiveLimit: currentTrackLimitMS, tailDist: 0 };
    }

    if (!this.isProtecting) {
      this.currentTailAllowanceMS = currentTrackLimitMS;
      return { effectiveLimit: currentTrackLimitMS, tailDist: 0 };
    }

    // Progresión del odómetro para todos los puntos de control
    // V3.10: El test de tsx detectó que dtSim < 2 ignoraba incrementos grandes en simulaciones de test.
    // Relajamos a dtSim < 120 para permitir saltos de distancia manuales en tests y carga de mapa.
    const distDelta = (dtSim > 0 && dtSim < 120 && speedMS > 0.01) ? speedMS * dtSim : 0;
    
    if (distDelta > 0) {
      for (const cp of this.checkpoints) {
        cp.remainingDist -= distDelta;
      }
    }

    // Limpiamos los puntos que ya han pasado la cola
    while (this.checkpoints.length > 0 && this.checkpoints[0].remainingDist <= 0) {
      const finished = this.checkpoints.shift()!;
      this.currentTailAllowanceMS = finished.targetLimitMS;
    }

    // Si no quedan más protecciones, el tren es libre
    if (this.checkpoints.length === 0) {
      const finalLimit = this.currentTailAllowanceMS;
      this.reset();

      return { effectiveLimit: finalLimit, tailDist: 0 };
    }

    // Devolvemos el límite que la cola permite actualmente y la distancia al hito más lejano
    const maxRemainingDist = Math.max(...this.checkpoints.map(c => c.remainingDist));
    
    // SIEMPRE devolvemos un número en effectiveLimit (el límite de la cola)
    return { 
      effectiveLimit: this.currentTailAllowanceMS, 
      tailDist: Math.max(0, maxRemainingDist) 
    };
  }

  /**
   * Añade un nuevo hito a la lista de protección de cola.
   */
  trigger(targetLimitMS: number, currentAllowanceMS: number, trainLength: number, initialOffset: number = 0) {
    // Si ya estamos protegiendo este mismo límite exacto o superior, no lo duplicamos.
    // Esto es crucial para evitar que el odómetro se reinicie si el evento firea varias veces.
    if (this.checkpoints.some(c => (Math.abs(c.targetLimitMS - targetLimitMS) < 0.1 || c.targetLimitMS >= targetLimitMS) && c.remainingDist > (trainLength - 30))) {
        return;
    }

    // Tampoco activamos si el objetivo ya es igual o menor a lo que ya limpiamos
    if (!this.isProtecting && targetLimitMS <= (currentAllowanceMS + 0.1)) {
        return;
    }

    this.checkpoints.push({ 
      targetLimitMS, 
      remainingDist: trainLength - initialOffset 
    });
    
    // Si es la primera protección, guardamos de dónde veníamos
    if (!this.isProtecting) {
        this.currentTailAllowanceMS = currentAllowanceMS;
    }
    
    this.isProtecting = true;
  }

  reset() {
    this.checkpoints = [];
    this.isProtecting = false;
  }

  getIsProtecting() { return this.isProtecting; }
  
  /** Devuelve el objetivo del último hito añadido */
  getCleaningTarget() { 
    if (this.checkpoints.length > 0) {
        return this.checkpoints[this.checkpoints.length - 1].targetLimitMS;
    }
    return this.currentTailAllowanceMS; 
  }
}
