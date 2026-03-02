// PhysicsNormalizer.ts
import { EMA_ALPHA, G_CONSTANT } from './Constants.ts';

export class PhysicsNormalizer {
  private state = {
    lastSpeedMS: 0,
    totalDistance: 0,
    emaAcceleration: 0,
    gForce: 0,
    posX: 0,
    posZ: 0,
    lastHeading: 999,
    emaLateralG: 0,
  };

  normalize(raw: any, dtSim: number, speedMS: number) {
    // 1. Odómetro
    if (dtSim > 0 && dtSim < 2) {
      this.state.totalDistance += speedMS * dtSim;
    }

    // 2. Filtrado de picos de velocidad
    const speedDelta = Math.abs(speedMS - this.state.lastSpeedMS);
    let finalSpeedMS = speedMS;
    if (this.state.lastSpeedMS > 0 && speedDelta > 20 && dtSim < 0.5) {
      finalSpeedMS = this.state.lastSpeedMS;
    }
    this.state.lastSpeedMS = finalSpeedMS;

    // 3. Aceleración y G-Force
    const rawAcc = raw.Acceleration || 0;
    this.state.emaAcceleration = (rawAcc * EMA_ALPHA) + (this.state.emaAcceleration * (1 - EMA_ALPHA));
    this.state.gForce = this.state.emaAcceleration / G_CONSTANT;

    // 4. G-Lateral
    const rawCurvature = Number(raw.Curvature || 0);
    const currX = Number(raw.PosX || 0);
    const currZ = Number(raw.PosZ || 0);
    let lateralG = 0;

    if (Math.abs(rawCurvature) > 0.00001) {
      lateralG = (finalSpeedMS * finalSpeedMS * rawCurvature) / G_CONSTANT;
    } else {
      let currentHeading = 0;
      let validHeading = false;
      if (this.state.posX !== 0 && (currX !== this.state.posX || currZ !== this.state.posZ)) {
        currentHeading = Math.atan2(currX - this.state.posX, currZ - this.state.posZ);
        validHeading = true;
      }
      if (validHeading && dtSim > 0 && finalSpeedMS > 1 && this.state.lastHeading !== 999) {
        let deltaHeading = currentHeading - this.state.lastHeading;
        while (deltaHeading > Math.PI) deltaHeading -= 2 * Math.PI;
        while (deltaHeading < -Math.PI) deltaHeading += 2 * Math.PI;
        lateralG = -(finalSpeedMS * (deltaHeading / dtSim)) / G_CONSTANT;
      }
      if (validHeading) this.state.lastHeading = currentHeading;
    }
    this.state.emaLateralG = (lateralG * 0.15) + (this.state.emaLateralG * 0.85);

    this.state.posX = currX;
    this.state.posZ = currZ;

    return {
      speedMS: finalSpeedMS,
      totalDistance: this.state.totalDistance,
      acceleration: this.state.emaAcceleration,
      gForce: this.state.gForce,
      lateralG: this.state.emaLateralG
    };
  }
}
