# Métricas de telemetría — Nexus V3

Inventario de datos que leemos del juego (Train Simulator Classic), cómo llegan al HUD y qué
transformaciones aplicamos.

**Última revisión:** junio 2026 · código base `Dastsc-V3`

---

## 1. Pipeline de datos

```text
```

| Etapa              | Archivo clave                   | Frecuencia                            |
| ------------------ | ------------------------------- | ------------------------------------- |
| Juego → archivo    | `Railworks_GetData_Script.lua`  | ~10–20 Hz (delay 5 ticks)             |
| Archivo → backend  | `backend/main.py`               | ~100 Hz (poll 10 ms)                  |
| Backend → frontend | WebSocket `TELEMETRY`           | Solo si cambia `mtime` de GetData.txt |
| Normalización      | `src/v3/core/DataNormalizer.ts` | Cada mensaje WS                       |

---

## 2. Formato bruto (`GetData.txt`)

Una sola línea por frame:

```text
```

| Regla                 | Comportamiento                                        |     |
| --------------------- | ----------------------------------------------------- | --- |
| Separador de pares    | `\                                                    | `   |
| Separador clave/valor | `:` (solo el primero; el resto forma parte del valor) |     |
| Números               | `float` en JSON                                       |     |
| `Inf` / `NaN`         | → `0.0` (parser seguro)                               |     |
| Texto                 | Se conserva como `string`                             |     |

Implementación: `backend/core/parser.py` → `parse_telemetry_line()`.

---

## 3. Campos leídos del juego (raw)

Agrupados por función. Los nombres son los que espera el frontend en `SimulatorRawInput` y
normalizadores. Muchos trenes usan alias (ej. `BC` vs `TrainBrakeCylinderPressureBAR`).

### 3.1 Velocidad y cabina

| Campo Lua / GetData     | Tipo   | Unidad / rango                             | Uso                                               |
| ----------------------- | ------ | ------------------------------------------ | ------------------------------------------------- |
| `SpeedoType`            | int    | `1` = MPH, `2` = km/h                      | Define unidad del simulador                       |
| `CurrentSpeed`          | float  | m/s (convención TSC)                       | Velocidad principal                               |
| `Speed`                 | float  | Unidad del tren (si no hay `CurrentSpeed`) | Fallback de velocidad                             |
| `CabSpeed`              | float  | Unidad del tren                            | Prioridad si ≠ 0                                  |
| `Acceleration`          | float  | G del juego                                | **No usado para física** (signo invertido en TSC) |
| `SimulationTime`        | float  | s (tiempo de sim)                          | Delta entre frames (`dt`)                         |
| `TimeOfDay`             | float  | s desde medianoche                         | Reloj HUD (`HH:MM:SS`)                            |
| `ActiveCab`             | int    | `1` delantera, `2` trasera                 | Invierte gradiente en cab 2                       |
| `Reversal` / `Reverser` | float  | `-1` / `0` / `1`                           | Marcha atrás / neutro / adelante                  |

### 3.2 Controles de tracción y freno

| Campo              | Tipo   | Rango        | Alias / notas                  |
| ------------------ | ------ | ------------ | ------------------------------ |
| `Throttle`         | float  | 0–1          | `Regulator` en trenes antiguos |
| `TrainBrake`       | float  | 0–1          | `TrainBrakeControl`            |
| `Combined`         | float  | −1…+1        | Mando combinado                |
| `ThrottleAndBrake` | float  | −1…+1        | >0 tracción, <0 freno          |
| `EmergencyBrake`   | int    | `1` = activo | `IsEmergency` en HUD           |

**`CombinedControl` (HUD):** `Combined` → `ThrottleAndBrake` → `Throttle − TrainBrake`.

### 3.3 Límites de velocidad y señales

| Campo                | Tipo   | Unidad             | Uso                                   |
| -------------------- | ------ | ------------------ | ------------------------------------- |
| `CurrentSpeedLimit`  | float  | Unidad del tren    | Límite vigente en la cabina           |
| `NextLimitSpeed`     | float  | Unidad del tren    | Próximo límite                        |
| `NextLimitDist`      | float  | m                  | Distancia al próximo límite           |
| `NextLimit2Speed`    | float  | Unidad del tren    | Segundo límite adelante               |
| `NextLimit2Dist`     | float  | m                  | Distancia al segundo límite           |
| `TrackLimit`         | float  | Unidad del tren    | Límite de vía (opcional)              |
| `SignalLimit`        | float  | Unidad del tren    | Límite por señal (opcional)           |
| `SigRes`             | int    | >0 = señal cercana | Activa lectura `SigState` / `SigDist` |
| `SigState`           | int    | 0–11               | Aspecto → `NextSignalAspect`          |
| `SigDist`            | float  | m                  | Distancia a señal cercana             |
| `NextSignalState`    | int    | —                  | Fallback si no hay `SigRes`           |
| `InternalAspect`     | int    | —                  | Otro fallback de aspecto              |
| `NextSignalDistance` | float  | m                  | Distancia si no hay `SigRes`          |

**Aspectos mapeados (`SigState`):**

| Valor   | Aspecto HUD      |
| ------- | ---------------- |
| 0       | `DANGER`         |
| 1       | `CAUTION`        |
| 2       | `ADV_CAUTION`    |
| 3       | `CLEAR`          |
| 4       | `PROCEED`        |
| 10      | `FL_CAUTION`     |
| 11      | `FL_ADV_CAUTION` |
| otro    | `UNKNOWN`        |

### 3.4 Frenos neumáticos y eléctricos

| Campo corto      | Campo largo (BAR)               | Uso                                              |
| ---------------- | ------------------------------- | ------------------------------------------------ |
| `BC`             | `TrainBrakeCylinderPressureBAR` | Cilindro de freno                                |
| `BP`             | `TrainBrakePipePressureBAR`     | Tubo principal                                   |
| `MR`             | `MainResPressureBAR`            | Depósito principal                               |
| `ER`             | `EqResPressureBAR`              | Reservorio ecualizador                           |
| `Ammeter`        | —                               | Amperios (eléctricos)                            |
| `TractiveEffort` | —                               | kN (diesel/hidráulico)                           |
| `Pantograph`     | —                               | Detecta locomotora eléctrica                     |
| `LineVolts`      | —                               | Detecta locomotora eléctrica                     |
| `ConsistType`    | int 0–11                        | Eficiencia de freno por tipo de material rodante |

Presión en HUD: BAR o PSI según perfil (`visuals.pressure_unit`) o heurística (`BC > 15` → PSI).

### 3.5 Física, geometría y consist

| Campo                    | Tipo   | Unidad                    | Uso                                      |
| ------------------------ | ------ | ------------------------- | ---------------------------------------- |
| `Gradient`               | float  | ‰ (conv. TSC: + = subida) | Perfil de vía; signo ajustado por cabina |
| `Curvature`              | float  | 1/m                       | G lateral (si ≠ 0)                       |
| `Mass`                   | float  | t                         | Masa del tren; frenado proyectado        |
| `TrainLength` / `Length` | float  | m                         | Protección de cola, tail bar             |
| `FarXT` / `FarXO`        | float  | tile + offset             | Posición mundial X                       |
| `FarZT` / `FarZO`        | float  | tile + offset             | Posición mundial Z                       |

### 3.6 Estación y viaje (Lua)

| Campo                              | Valor típico desde Lua                | Notas                                   |
| ---------------------------------- | ------------------------------------- | --------------------------------------- |
| `StationDistance`                  | `-1` (no disponible en plugin global) | Backend/OCR lo sustituye                |
| `StationName`                      | `N/A` o vacío                         | Nombre escenario                        |
| `PlatformLength` / `StationLength` | m                                     | Longitud de andén                       |
| `TripDistance`                     | m (si el script lo emite)             | **No** se usa directo en HUD V3; ver §5 |

### 3.7 Protección de cola (opcional desde Lua)

| Campo          | Tipo    | Uso                                        |
| -------------- | ------- | ------------------------------------------ |
| `TailDistance` | float m | Si viene del juego, anula cálculo frontend |
| `TailSeconds`  | float s | Countdown de cola                          |
| `TailActive`   | int `1` | Indicador “Tail Clearing”                  |

Si no vienen del Lua, el frontend calcula cola con `TailProtectionService` (lógica V2 portada).

### 3.8 Seguridad e interlocks

| Campo                                   | Uso en HUD                                       |
| --------------------------------------- | ------------------------------------------------ |
| `AWS`                                   | Alerta amarilla (con lógica de reset)            |
| `AWSState`                              | Estado AWS                                       |
| `AWSReset` / `AWSResetButton`           | Cancela alerta AWS si > 0                        |
| `AWSWarning` / `AWSWarnAudio`           | Aviso sonoro                                     |
| `AWSWarnCount`                          | Contador de advertencias                         |
| `DSD`                                   | Hombre muerto (rojo)                             |
| `VigilAlarm` / `Vigilance` / `DVDAlarm` | Fallbacks de vigilancia                          |
| `DRA`                                   | Driver Reminder Appliance                        |
| `Sander`                                | Arena                                            |
| `DoorL` / `DoorR`                       | Puertas (> 0.5 = abierta); dispara OCR al cerrar |

### 3.9 Identificación del escenario

| Campo                   | Uso                                 |
| ----------------------- | ----------------------------------- |
| `LocoName`              | Título del HUD si no hay perfil     |
| `RVNumber` / `RvNumber` | Número de servicio                  |
| `RouteID` / `RouteId`   | Ruta                                |
| `ScenarioPath`          | Ruta del escenario                  |
| `location` / `Location` | Texto de ubicación (barra inferior) |

---

## 4. Campos añadidos por el backend (no vienen del Lua)

El backend enriquece el dict antes del WebSocket (`backend/main.py` → `_apply_ocr_to_telemetry`).

| Campo              | Origen                                | Descripción                    |
| ------------------ | ------------------------------------- | ------------------------------ |
| `StationDistance`  | OCR HUD (`ocr_hud.capture_next_stop`) | Metros hasta próxima parada    |
| `StationNameOCR`   | OCR                                   | Nombre leído del HUD del juego |
| `StationETA`       | OCR                                   | ETA mostrada en pantalla       |
| `StationScheduled` | OCR                                   | Hora programada                |
| `timestamp`        | `time.time()`                         | Marca del mensaje WS           |

#### OCR:** no hay captura periódica por timer. El backend sondea `GetData.txt` cada **10 ms
(`_POLL_INTERVAL_S`) y dispara `ocr_hud.capture_next_stop` solo en estos casos:

| Evento               | Cuándo                                                                                                                                                                        | Frecuencia típica                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `door_anchor`        | Puertas pasan de abiertas a cerradas (`DoorL`/`DoorR` > 0.5 → ≤ 0.5)                                                                                                          | **1× por parada**                |
| `mid_leg_correction` | Tramo inicial **> 5 km**: checkpoints al recorrer fracciones del tramo (máx. **3**; p. ej. 20 km → ~5 km, 10 km, 15 km). Velocidad ≥ 10 km/h, puertas cerradas, cooldown 60 s | **0–3× por tramo**               |
| `near_correction`    | Distancia estimada ≤ **400 m**, recorrido ≥ **200 m** desde el ancla, y aún no corregido en ese tramo                                                                         | **0–1× por tramo** entre paradas |
| Debug manual         | `GET /api/ocr/debug`                                                                                                                                                          | Bajo demanda                     |

Entre capturas, `StationDistance` se integra con odómetro (velocidad × Δt) en
`core/station_distance.py`. El tracker guarda muestras internas cada **5 s** (`SAMPLE_INTERVAL_S`;
eventos `tick`/`arrival` en debug), pero **no** vuelve a leer pantalla.

Solo una captura OCR a la vez (`ocr_is_capturing`). Requiere `mss` + `pytesseract` en el backend.

---

## 5. Campos del HUD (`TelemetryData`)

Salida de `DataNormalizer.ts` — lo que consumen los componentes React.

### 5.1 Derivados de velocidad

| Campo HUD        | Origen                       | Unidad             |
| ---------------- | ---------------------------- | ------------------ |
| `Speed`          | Normalizado a m/s            | m/s                |
| `SpeedDisplay`   | `Speed` × unidad display     | MPH o km/h         |
| `SpeedUnit`      | Perfil o `SpeedoType`        | `"MPH"` / `"km/h"` |
| `Acceleration`   | EMA de Δv/Δt                 | m/s²               |
| `GForce`         | `Acceleration / g`           | g                  |
| `LateralG`       | Curvatura o Δ rumbo          | g (suavizado)      |
| `ProjectedSpeed` | `Speed + Acceleration × 5 s` | unidad display     |

### 5.2 Límites y señalización

| Campo HUD                                 | Descripción                                  |
| ----------------------------------------- | -------------------------------------------- |
| `SpeedLimit`                              | Límite **efectivo** (con protección de cola) |
| `FrontalSpeedLimit`                       | Límite de vía sin esperar cola               |
| `TrackLimit` / `SignalLimit`              | Si vienen del raw; si no, límite actual      |
| `NextSpeedLimit` / `DistToNextSpeedLimit` | Próximo límite (lista `UpcomingLimits`)      |
| `NextLimit2Speed` / `DistToNextLimit2`    | Segundo límite                               |
| `UpcomingLimits`                          | Hasta 3 marcadores `{ speed, distance }`     |
| `NextSignalAspect`                        | `DANGER`, `CAUTION`, `CLEAR`, …              |
| `DistToNextSignal`                        | m (−1 si no hay señal)                       |

### 5.3 Freno y tracción

| Campo HUD                                 | Descripción                                          |
| ----------------------------------------- | ---------------------------------------------------- |
| `Throttle` / `TrainBrake`                 | 0–1                                                  |
| `CombinedControl`                         | Mando unificado para muescas                         |
| `Reverser`                                | Valor bruto                                          |
| `BrakeCylinderPressure` … `EqResPressure` | Presiones (BAR o PSI)                                |
| `PressureUnit`                            | `"BAR"` / `"PSI"`                                    |
| `Amperage` / `AmperageUnit`               | A o kN según tipo de loco                            |
| `Ammeter`                                 | Valor crudo del juego                                |
| `TractiveEffort`                          | kN                                                   |
| `TractionPercent`                         | % respecto a `max_ammeter` o `max_effort` del perfil |
| `BrakingEffort`                           | kN (neumático + dinámico)                            |
| `BrakingPercent`                          | % del cilindro                                       |
| `ProjectedBrakingDistance`                | m (física simplificada + gradiente)                  |

### 5.4 Estación y cola

| Campo HUD                                            | Origen                                     |
| ---------------------------------------------------- | ------------------------------------------ |
| `StationDistance`                                    | OCR/backend; sticky si Lua manda −1        |
| `StationName` / `StationLength`                      | Lua                                        |
| `StationNameOCR` / `StationETA` / `StationScheduled` | OCR (sticky)                               |
| `TailIsActive`                                       | Lua `TailActive` o `TailProtectionService` |
| `TailDistanceRemaining`                              | Lua o odómetro de cola                     |
| `TailSecondsRemaining`                               | `distancia / velocidad`                    |

### 5.5 Tren y escenario

| Campo HUD                                                         | Origen                                         |
| ----------------------------------------------------------------- | ---------------------------------------------- |
| `TrainLength`                                                     | `TrainLength` / `Length`                       |
| `TrainMass`                                                       | `Mass`                                         |
| `ConsistType` / `TrainType`                                       | `ConsistType`                                  |
| `ActiveCab`                                                       | `ActiveCab` (+ inferencia por `Reverser`)      |
| `TripDistance`                                                    | **Odómetro frontend** (integra velocidad × dt) |
| `X` / `Z`                                                         | `FarXT/O`, `FarZT/O`                           |
| `LocoName` / `RVNumber` / `RouteID` / `ScenarioPath` / `location` | Metadatos Lua                                  |
| `Gradient` / `RawGradient`                                        | Con / sin corrección de cabina                 |

### 5.6 Seguridad (passthrough)

`AWS*`, `DSD`, `VigilAlarm`, `Vigilance`, `DVDAlarm`, `DRA`, `Sander`, `DoorsOpen`, `IsEmergency`,
`TimeOfDay`.

---

## 6. Convenciones importantes

| Tema                | Detalle                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------- |
| **Gradiente**       | Lua: + = subida. HUD: `Gradient` corregido por cabina; `RawGradient` = valor del juego       |
| **Velocidad**       | Internamente todo en m/s; display según perfil o `SpeedoType`                                |
| **Límite efectivo** | Al subir límite tras una señal, se mantiene el viejo hasta que la cola recorre `TrainLength` |
| **TripDistance**    | El odómetro del HUD **no** lee el campo Lua homónimo; se acumula en `PhysicsNormalizer`      |
| **Perfiles JSON**   | `profiles/*.json` ajustan unidades, `max_ammeter`, muescas, `brake_fill_time_s`, etc.        |

---

## 7. Referencia rápida de archivos

| Archivo                                | Responsabilidad                                      |
| -------------------------------------- | ---------------------------------------------------- |
| `lua/Railworks_GetData_Script.lua`     | Extracción en el juego (fuera de repo o en ruta TSC) |
| `backend/core/parser.py`               | Parseo `GetData.txt`                                 |
| `backend/main.py`                      | Poll, OCR, WebSocket                                 |
| `backend/core/ocr_hud.py`              | Captura HUD estación                                 |
| `src/v3/core/dataNormalizerUtils.ts`   | Tipos raw + helpers                                  |
| `src/v3/core/normalizers/*.ts`         | Física, frenos, señales, cola                        |
| `src/v3/core/DataNormalizer.ts`        | Ensambla `TelemetryData`                             |
| `src/v3/core/TelemetryContext.tsx`     | Tipo `TelemetryData` + WebSocket                     |
| `docs/ESPECIFICACION_ULTRA_CORE_V4.md` | Especificación del plugin Lua                        |
| `docs/GUIA_TECNICA_IPC.md`             | IPC y diccionario de controles                       |

---

## 8. Mensajes WebSocket (no telemetría)

| `type`            | Contenido                            |
| ----------------- | ------------------------------------ |
| `INIT`            | Perfiles disponibles + perfil activo |
| `TELEMETRY`       | Dict completo raw + campos OCR       |
| `HEARTBEAT`       | Keep-alive si GetData no cambia      |
| `PROFILE_CHANGED` | Nuevo perfil seleccionado            |

Comandos salientes (frontend → backend): `SELECT_PROFILE`, `COMMAND` (futuro control vía
`SendCommand.txt`).
