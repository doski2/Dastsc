# Depuración — `nexus-agent/src/brake`

Mapa del módulo de planificación de frenado. Usar con [checklist.md](./checklist.md) y logs
`logs/nexus-v4/session_*.json`.

## Flujo de datos

```text
TelemetrySnapshot (kernel)
        │
        ▼
  tick.ts ── resolveActiveBrakePlan()
        │      ├─ planBrakeForLimit()
        │      ├─ planBrakeForStation()
        │      └─ planBrakeForSignal()
        │      └─ selectUrgentBrakePlan()  ← límite + estación juntos (< 350 m)
        ▼
  commandBus.ts ── resolveSuggestedAction()  ← apply / release / hold
        │
        ▼
  backend SendCommand → TSC
```

**Regla**: `brake/` solo **planifica** muescas y distancias. **Ejecutar** mando (OFF, B2…) es
`command/commandBus.ts`.

---

## Archivos

| Archivo | Rol | Depurar cuando… |
| ------- | --- | ---------------- |
| `planBrake.ts` | Plan cinemático (límite, estación, señal), cluster, giro cabina | Muesca incorrecta, frena tarde/pronto, parada final |
| `physics.ts` | Constantes globales (márgenes, horizontes, zonas apply) | Cambiar defaults sin tocar lógica |
| `agentConfig.ts` | Resuelve `agent_config` del perfil JSON | Umbrales por tren (dwell, final stop, terminal) |
| `schedule.ts` | Holgura ETA → coast / reaction scale | Frena demasiado pronto con horario holgado |
| `signalUtils.ts` | Aspectos que exigen parada (DANGER…) | Frenada ante señal roja |
| `brakeLearning.ts` | Decel aprendida por muesca (stats backend) | Plan no coincide con frenada real |
| `types.ts` | Tipos plan, perfil, `agent_config` | — |

### Tests (ejecutar por área)

```bash
cd nexus-agent
npm test -- --run src/brake/planBrake.test.ts      # límite, cluster, urgencia
npm test -- --run src/brake/stationBrake.test.ts   # estación, horario, giro
npm test -- --run src/brake/signalBrake.test.ts    # señal roja
npm test -- --run src/brake/planBrake.golden.test.ts
npm test -- --run src/command/commandBus.test.ts   # OFF / hold / release
```

---

## Constantes clave (`physics.ts`)

| Constante | Valor | Efecto |
| --------- | ----- | ------ |
| `LIMIT_PLANNING_HORIZON_M` | 2500 | Máx. distancia para planificar límite |
| `TARGET_CLUSTER_GAP_M` | 350 | Límite + estación a < 350 m → un solo plan urgente |
| `STATION_DWELL_MAX_DISTANCE_M` | 80 | Zona andén (hold, release block) |
| `STATION_FINAL_STOP_MAX_DISTANCE_M` | 20 | Parada final applyNow (default código) |
| `STATION_TERMINAL_APPROACH_M` | 80 | Reduce margen reacción al acercarse |
| `STATION_COAST_CUTOFF_M` | 100 | Sin holgura horario bajo 100 m |
| `STATION_DEPARTURE_SPEED_MS` | 5 | Por encima = salida clara del andén |

Overrides por tren en `profiles/nexus/trains/*.json` → `agent_config.station` (ver
`class323.json`: `final_stop_max_distance_m: 35`).

---

## Funciones críticas (`planBrake.ts`)

| Función | Qué decide |
| ------- | ---------- |
| `planBrake()` | Distancia de frenado + margen + pasos B3/B2/B1 |
| `planBrakeForLimit()` | Objetivo = velocidad del cartel |
| `planBrakeForStation()` | Supresión giro → parada final → plan servicio |
| `planStationFinalStop()` | Últimos metros, `applyNow` |
| `shouldSuppressStationBrakingForDeparture()` | Giro cabina, ancla corta, salida con tracción |
| `isStalePlatformDeparture()` | OCR residual 20–80 m al salir lento |
| `selectUrgentBrakePlan()` | Elige estación vs límite si están juntos |
| `selectStationActiveStep()` | B3 terminal < 50 m; B2/B3 según horario |

---

## Escenarios de depuración TSC

### 1. Límite de velocidad

| Observar en log V4 | Esperado |
| ------------------ | -------- |
| `targetKind: SPEED_LIMIT` | Plan activo antes del cartel |
| `brake.combined` → negativo en zona apply | B2/B3 aplicado |
| Tras OFF, no re-frena hasta coast latch | `commandBus` latch límite |

**Sospecha**: `planBrakeForLimit` null → velocidad ya bajo objetivo o distancia > 2500 m.

### 2. Estación — parada corta (~25–30 m)

| Observar | Esperado (post-fix) |
| -------- | ------------------- |
| A 35 m, freno no pasa a OFF | `resolveReleaseAction` usa objetivo **0**, no límite |
| < 50 m, muesca B3 | `selectStationActiveStep` terminal |
| 29 m + velocidad | `planStationFinalStop` si `final_stop_max_distance_m ≥ 35` |

**Ajuste sin código**: `class323.json` → `final_stop_max_distance_m`, `terminal_approach_distance_m`,
`station_reaction_time_s`.

### 3. Giro de cabina (cabecera)

| Observar | Esperado |
| -------- | -------- |
| Tras salir, `station.source: none` un tiempo | Backend `should_clear_on_departure_intent` |
| `door_anchor` < 400 m rechazado | `_awaiting_far_anchor` en backend |
| AUTO no planifica estación con `anchorM < 200` | `shouldSuppressStationBrakingForDeparture` |
| Salida dist 0 + tracción | Sin `planStationFinalStop` |

**Backend acoplado**: `Dastsc-V3/backend/core/station_distance.py` (no está en `brake/` pero alimenta
`snapshot.station`).

### 4. Límite + estación juntos

| Observar | Esperado |
| -------- | -------- |
| UI detail “clustered” | `formatClusteredBrakeDetail` |
| Un solo plan, el más urgente | `selectUrgentBrakePlan` |

### 5. Horario (ETA OCR)

| Observar | Esperado |
| -------- | -------- |
| Llegada pronto, holgado | Coast allowance > 0 lejos del andén |
| < 100 m del andén | `scheduleCoastAllowanceM` = 0 |
| Tarde vs ETA | Reaction scale > 1, B3 antes |

---

## Campos de log útiles

En tick V4 / `session_*.json`:

```json
{
  "station": { "distanceM", "anchorM", "traveledM", "source", "eta" },
  "brake": { "combined", "position" },
  "limits": { "next": { "speed", "distanceM" } },
  "brakePlan": { "targetKind", "activeStep": { "notch", "distStart", "applyNow" } }
}
```

Si solo hay `backend_tick` (sin ticks V4): revisar `station.distanceM`, `brake.combined`; el plan
del agente no quedó registrado — activar telemetría V4 o reproducir con tests.

---

## Árbol de decisión rápido

```text
¿Frena cuando no debería?
├─ En andén / giro cabina → shouldSuppressStationBrakingForDeparture / planStationFinalStop
├─ Suelta OFF en aproximación → commandBus resolveReleaseAction (objetivo estación = 0)
└─ Re-frena tras OFF en límite → coast latch commandBus

¿No frena cuando debería?
├─ station.distanceM < 0 o null → backend tracker / OCR
├─ plan null, speed baja → planBrake guard speedMs < 0.5
└─ ETA holgado lejos → scheduleCoastAllowanceM / selectStationActiveStep coasting

¿Para corto del andén (~30 m)?
├─ OFF a 30–40 mph límite → release fix (plan STATION)
├─ B2 en vez de B3 cerca → selectStationActiveStep terminal < 50 m
└─ OCR residual → backend near_correction + agent final_stop_max
```

---

## Perfiles JSON (ajuste preferido)

```json
"agent_config": {
  "station": {
    "dwell_max_distance_m": 80,
    "final_stop_max_distance_m": 35,
    "terminal_approach_distance_m": 90,
    "departure_speed_ms": 5
  }
},
"physics_config": {
  "max_braking_decel": 1.1,
  "brake_fill_time_s": 2.5,
  "station_reaction_time_s": 0.9
}
```

Base pasajeros: `profiles/nexus/genres/passenger.json`. Overrides tren:
`profiles/nexus/trains/class323.json`.

---

## Relación con otras semanas

| Semana | Enfoque |
| ------ | ------- |
| [04](./README.md) | Límites, muescas, calibración |
| [05](../semana-05-agente-estacion/) | Dwell, salida, NEU en andén |
| [08](../semana-08-class323/) | Validación 323 end-to-end |
