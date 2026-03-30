# Análisis de Datos: Escenarios de Train Simulator Classic

## Táctica de Extracción para NEXUS Dashboard

**Escenario analizado:** `7bcd853e-fcd8-4d20-9e37-e9a41de1eb57`  
**Nombre:** *2. [323] Morning Rush Hour* — Birmingham Cross-City Line  
**Ruta:** `00000098-0000-0000-0000-000000002021`  
**Fecha análisis:** 29/03/2026

---

## 1. Inventario de Archivos

| Archivo | Tamaño | Naturaleza | Se actualiza en juego? |
|---|---|---|---|
| `ScenarioProperties.xml` | 56 KB | Metadatos del escenario (nombre, duración, medallas) | ❌ Estático |
| `Scenario.xml` | 2.3 MB | **Timetable del jugador** (paradas, horarios, tiempos de parada) | ❌ Estático |
| `Scenario.bin` | 380 KB | Versión binaria del anterior (mismos datos) | ❌ Estático |
| `InitialSave.xml` / `.bin` | 71 KB | Estado inicial de agujas y posiciones | ❌ Estático |
| `CurrentSave.xml` | ~140 KB | **Autosave continuo del motor** | ✅ **~1.5s automático** |
| `*.lan` (en/de/es/fr...) | 4-5 KB | Textos localizados en binario | ❌ Estático |

> **Clave sobre `CurrentSave.xml`:** **No es un guardado manual del jugador.** El motor de TSC lo sobreescribe automáticamente cada ~1.5 segundos durante el juego, sin intervención del usuario. Por eso podemos leer `DistanceTraveled`, `ProgressCode` y estadísticas en tiempo real. Es la fuente de datos vivos del sistema.

---

## 2. Lo Que Ya Extraemos (Situación Actual)

### Del `CurrentSave.xml` en tiempo real

```
current_progress.simulation_time   → Tiempo transcurrido en la simulación (HH:MM)
current_progress.distance_meters   → Odómetro del escenario desde cOperationMonitor (metros, exacto)
```

### Del `Scenario.xml/.bin` al cargar el escenario

> ⚠️ **Aclaración importante:** `Scenario.xml` contiene el **timetable** (horario del servicio del jugador): qué estaciones parar, a qué hora, cuánto tiempo. No contiene la posición física de cada estación en el mapa — eso viene de la base de datos de la ruta (`Tracks.bin` / SQLite), que ya indexamos en `scenario_index.py`.

```
stops[]                → Lista de paradas del timetable del jugador:
  .station_name        → DisplayName del cDriverInstructionTarget
  .type                → STOP (parada comercial) o WAYPOINT (punto de paso)
  .status              → INSTRUCTION_STATE_{ACTIVE|SUCCEEDED|INACTIVE} via ProgressCode
  .due_time            → Hora de llegada objetivo (HH:MM) — convertida desde segundos
  .departure_time      → Hora de salida objetivo (si está definida)
  .dwell_secs          → Tiempo mínimo de permanencia en andén (EarliestDepartureTime)
  .distance            → Distancia euclídea al tren (solo si getFarPosition funciona)
```

**Qué NO está en Scenario.xml:**

- La posición GPS/mapa de cada estación → viene de `Tracks.bin` (SQLite, ya indexado)
- Los otros trenes de IA/tráfico (servicios 2P14, 2P15...) → **no nos interesa, nos adaptamos al tráfico real**

---

## 3. Datos NUEVOS Disponibles y No Extraídos

### 3.1 — `CurrentSave.xml/cPlayerScenarioStatistics` ⭐ PRIORIDAD ALTA

Este objeto se escribe en el save y se actualiza al ir completando el escenario. Contiene:

```xml
<cPlayerScenarioStatistics>
  <Scenario-ScenarioStatistics>
    
    <!-- Estado general -->
    <ScenarioSuccess>1</ScenarioSuccess>          <!-- bool: escenario completado / fallado -->
    <GameOverErrorCode>NoError</GameOverErrorCode>  <!-- string: motivo de game-over si ocurrió -->
    <ExcellentTime>466.68</ExcellentTime>           <!-- float: tiempo umbralar para "Excellent" -->
    
    <!-- Errores operacionales -->
    <NumOperationalErrors>1</NumOperationalErrors>  <!-- int: total de infracciones cometidas -->
    
    <!-- Objetivos de destino (paradas completadas) -->
    <TargetsAchieved>0</TargetsAchieved>
    <NumTargets>0</NumTargets>
    
    <!-- Objetivos de tiempo (puntualidad en paradas) -->
    <TimeTargetsAchieved>0</TimeTargetsAchieved>
    <NumTimeTargets>0</NumTimeTargets>
    
    <!-- Info de IA -->
    <NumAITrainsLate>0</NumAITrainsLate>
    <NumAITrains>0</NumAITrains>
    
    <!-- ⚠️ INCIDENTES DE EXCESO DE VELOCIDAD — muy valioso -->
    <SpeedingStats>
      <Scenario-SpeedingStatistics>
        <StartTime>342.767</StartTime>   <!-- segundos desde inicio escenario -->
        <StartHour>5</StartHour>         <!-- hora del juego al inicio del exceso -->
        <StartMin>52</StartMin>          <!-- minuto del juego -->
        <MaxVelocity>51.065</MaxVelocity> <!-- velocidad máxima alcanzada (m/s → × 3.6 = km/h) -->
        <DistanceTravelled>41.44</DistanceTravelled> <!-- metros recorridos en exceso -->
        <Milepost>44</Milepost>          <!-- poste kilométrico -->
        <SpeedLimit>50</SpeedLimit>      <!-- límite vigente (m/s o mph?) -->
      </Scenario-SpeedingStatistics>
    </SpeedingStats>

  </Scenario-ScenarioStatistics>
</cPlayerScenarioStatistics>
```

**Qué podemos mostrar con esto:**

- 🔴 Número de infracciones del turno en tiempo real
- 🚨 Incidentes de velocidad: dónde, cuándo, cuánto te excediste, cuántos metros
- ✅ Progresos: X/N paradas completadas con tiempo objetivo

---

### 3.2 — `CurrentSave.xml/cOperationMonitor` — Datos ya leídos + extras

```xml
<cOperationMonitor>
  <EnginesExperienced>
    <Type>Electric</Type>
    <Name>Class 323</Name>
    <Number>323211_65011</Number>    ← número de unidad específico
    <SimTime>0</SimTime>
    <Seconds>0</Seconds>
    <Ticking>1</Ticking>
  </EnginesExperienced>
  <LastEngineName>Class 323</LastEngineName>
  <DistanceTraveled>5751.76</DistanceTraveled>    ← YA LO LEEMOS
  <LastStatDistanceTrav>5120.43</LastStatDistanceTrav>  ← delta desde último stat checkpoint
  <PassengersTransferred>
    <Added>0</Added>
    <Removed>0</Removed>
  </PassengersTransferred>
</cOperationMonitor>
```

**Campos nuevos interesantes:**

- `Number` → número concreto de la unidad traccionada (ej: `323211_65011`)
- `LastStatDistanceTrav` → permite calcular distancia del segmento actual
- `PassengersTransferred.Added/Removed` → pasajeros totales embarcados/desembarcados (si aplica)

---

### 3.3 — `CurrentSave.xml/cCareerRules` — Sistema de Puntuación ⏸️ APLAZADO

> **Decisión:** Aplazado para cuando tengamos una IA semiautónoma que pueda usar estas reglas activamente. Los campos están documentados y accesibles cuando sea necesario.

Datos disponibles cuando se retome:

- `medal_thresholds` → Bronce 500 / Plata 750 / Oro 900 pts
- `PointsPerMPHPerInterval`, `MissedStopPoints`, `ArrivalPoints`, etc.
- Estrategia: calcular penalización estimada en tiempo real usando datos del plugin Lua

---

### 3.4 — `ScenarioProperties.xml/FrontEndDriverList` — Tráfico IA ❌ DESCARTADO

> **Decisión:** No nos interesa. Los otros trenes (2P14, 2P15...) son tráfico del escenario y no aportan valor al dashboard. Nos adaptamos al tráfico real en pista.

---

### 3.5 — `CurrentSave.xml/cDriverInstruction per stop` — ArrivalTime Tras Completar

Cuando una parada se marca como SUCCEEDED en el XML, los campos dentro del `cDriverInstructionTarget` se actualizan:

```xml
<ArrivalTime>29.73</ArrivalTime>       <!-- segundos reales de llegada tras inicio escenario -->
<DepartureTime>125.0</DepartureTime>   <!-- segundos reales de salida -->
```

Esto permite calcular **retraso real vs objetivo**:

```
retraso_segundos = ArrivalTime_real - DueTime_objetivo
```

> ⚠️ Actualmente no leemos `ArrivalTime` per-stop desde el `CurrentSave.xml`. Solo leemos los del `Scenario.xml` que siempre son 0 (planificados). Hay que leerlos del `CurrentSave.xml` post-SUCCEEDED.

---

### 3.6 — `CurrentSave.xml/WheelSlip y EmergencyBrake` per-vehicle

```xml
<TriggerWheelSlip d:type="bool">0</TriggerWheelSlip>
<WheelSlipDuration d:type="sInt16">-14335</WheelSlipDuration>
<EmergencyBrakeTriggerRate>10</EmergencyBrakeTriggerRate>
```

> Los datos de patinaje y freno de emergencia están en el XML pero son históricos del estado del escenario anterior (carry-over del InitialSave). El valor en tiempo real lo da el plugin Lua directamente. No hay razón para leerlos del XML.

---

## 4. Datos CONFIRMADOS como NO Disponibles en el XML

| Dato | Por qué no está |
|---|---|
| **Score actual en tiempo real** | El motor de TSC calcula el score en memoria; NO lo escribe en el XML mientras juegas |
| **Distancia a la próxima parada** | No hay campos de distancia por parada; solo coordenadas mundiales en Scenario.xml |
| **Puntualidad en tiempo real (retraso acumulado)** | Se calcula en el motor, no se guarda hasta SUCCEEDED |
| **Histórico de frenadas** | No hay log de frenadas en el XML |
| **Posición GPS exacta** | Solo coordenadas Far (tiles+offset) que fallan en Class 323 |

---

## 5. Problema de DueTime: Dos Formatos Detectados

Se detectaron **dos formatos de DueTime** en el mismo escenario:

### Formato A — Segundos desde medianoche (Scenario.xml Early Bird)

```
DueTime: 18900 → 05:15:00 medianoche → 05:15 AM game time
```

### Formato B — Segundos desde inicio del escenario (Scenario.xml Rush Hour, algunos campos)

```
DueTime: 319  → 5 min 19 seg después del inicio del turno
DueTime: 2830 → 47 min 10 seg → coincide con la duración del escenario (47 min)
```

> ⚠️ **Riesgo de confusión:** El mismo XML puede tener DueTimes en segundos-desde-medianoche para la hora del tren (paradas de servicio) y en segundos-desde-inicio para waypoints o condiciones especiales. Necesitamos un heurístico: si DueTime > 3600, es hora absoluta; si < 3600, es tiempo relativo al inicio.

### Regla propuesta de interpretación

```python
if due_time > 3600:
    # Es hora absoluta desde medianoche → convertir a HH:MM
    hora = int(due_time // 3600)
    minuto = int((due_time % 3600) // 60)
elif due_time > 0:
    # Es tiempo relativo al inicio → hora_inicio + due_time
    pass  # Necesitamos la hora de inicio del escenario
else:
    # Sin tiempo asignado
    pass
```

---

## 6. Datos de `ScenarioProperties.xml` Que Debemos Cargar una Vez

```python
scenario_meta = {
    "name": "2. [323] Morning Rush Hour",        # DisplayName.English
    "briefing": "Drive the Rush Hour 2G10...",    # Briefing.English
    "description": "...",                         # long Description.English
    "duration_mins": 47,                          # DurationMins
    # medal_thresholds + scoring_rules → APLAZADO (para IA futura)
}
```

> Actualmente `_read_scenario_properties()` existe en `scenarios.py` pero solo devuelve `name`, `loco`, `description`, `xml_path`. Por ahora es suficiente — las reglas de scoring se añadirán cuando se implemente la IA semiautónoma.

---

## 7. Plan de Táctica — Qué Implementar

### FASE 1 — Quick Wins (cambios en `scenarios.py`)

| # | Qué extraer | Archivo fuente | Impacto en dashboard | Estado |
|---|---|---|---|---|
| 1 | `ArrivalTime` real por parada (post-SUCCEEDED) | `CurrentSave.xml` | Muestra "+2min TARDE" / "1min ANTES" | 🔜 Pendiente |
| 2 | `NumOperationalErrors` | `CurrentSave.xml` | Contador de infracciones del turno | 🔜 Pendiente |
| 3 | `SpeedingStats[]` | `CurrentSave.xml` | Log de excesos: hora, ubicación, velocidad | 🔜 Pendiente |
| 4 | Unidad traccionada `Number` | `CurrentSave.xml` > cOperationMonitor | Mostrar "Unidad: 323211_65011" | 🔜 Pendiente |

### FASE 2 — Scoring Estimado ⏸️ APLAZADO

> Requiere IA semiautónoma + reimplementar lógica del motor. Aplazado.

### FASE 3 — Tráfico IA ❌ DESCARTADO

> No nos interesa. Nos adaptamos al tráfico real.

---

## 8. Diagrama de Fuentes de Datos

```
┌─────────────────────────────────────────────────────────────┐
│                  NEXUS Dashboard Data Flow                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ESTÁTICOS (leer 1 vez al detectar escenario)               │
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │ ScenarioProperties  │  │    Scenario.xml/.bin │          │
│  │ .xml                │  │                      │          │
│  │ • Nombre/Desc       │  │ • Lista de paradas   │          │
│  │ • Duración          │  │ • DueTime por parada │          │
│  │ • Reglas scoring    │  │ • AI timetable       │          │
│  │ • Medal thresholds  │  │ • EarliestDeparture  │          │
│  └─────────────────────┘  └─────────────────────┘          │
│                                                             │
│  DINÁMICO (leer cada ~1.5s)                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                  CurrentSave.xml                        ││
│  │                                                         ││
│  │  cScenarioProperties   → nombre, GUID confirmación      ││
│  │  cPlayerProfile        → GameplayScored (¿tiene score?) ││
│  │  cDriverInstruction[]  → ProgressCode (ACTIVE/SUCCEEDED)││
│  │                          ArrivalTime real post-parada   ││
│  │  cPlayerScenarioStatistics                              ││
│  │    SpeedingStats[]     → cada exceso: hora, lugar, vel  ││
│  │    NumOperationalErrors→ infracciones totales           ││
│  │    GameOverErrorCode   → si el juego terminó mal        ││
│  │  cOperationMonitor                                      ││
│  │    DistanceTraveled    → odómetro exacto (YA SE LEE)    ││
│  │    Number              → ID de unidad traccionada       ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  TIEMPO REAL (<100ms, vía Lua plugin)                       │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Railworks_GetData_Script.lua → WebSocket               ││
│  │  Speed, Throttle, Brakes, Signals, NX/NZ, ...          ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Dudas Pendientes a Investigar

### Duda A: ¿DueTime es absoluto o relativo?

- **Investigar:** En el Morning Rush Hour, DueTime=319 (¿5min19s de escenario?) vs DueTime=2830 (¿47min, duración total?). Necesitamos la hora de INICIO del escenario para contextualizar.
- **Buscar en:** `CurrentSave.xml` → campo de hora de simulación al inicio, o `Scenario.xml` → hora inicial del scenario engine.

### Duda B: ¿ArrivalTime realmente se actualiza en CurrentSave al completar una parada?

- Lo vimos con valor `0` en todos los stops. Pendiente confirmar que cambia a valor real una vez la parada es SUCCEEDED.
- **Cómo verificar:** Completar una parada en juego y releer el CurrentSave.xml inmediatamente.

### Duda C: ¿Qué contiene `ErrorCodeData` (array de 11 floats)?

- Tiene valores como `1.85336` en índice 5. ¿Qué tipo de error es cada índice?
- Probablemente: velocidad, señal roja, colisión, descarrilamiento, etc.
- **Buscar en:** foros de modding TSC o binario del motor.

### Duda D: ¿`SpeedLimit` en `SpeedingStats` es m/s o mph?

- `MaxVelocity: 51.065` (m/s → 183 km/h, irrazonable) o (mph → extrañamente alto)
- Si es m/s: 51.065 * 3.6 = 183 km/h — imposible en Class 323
- Si es el mismo valor raw del plugin (unidad del juego): probablemente m/s internal
- `SpeedLimit: 50` — si es mph ≈ 80 km/h: tiene sentido para la Cross-City Line
- **Conclusión probable:** MaxVelocity en m/s (51.065 m/s = 183 km/h = ¡ERROR! imposible) → o es en mph/10 o algo distinto. Necesita más análisis.

### Duda E: ¿Por qué `ScenarioSuccess: 1` si el juego está activo?

- Un valor de 1 en `ScenarioSuccess` cuando la partida aún está en curso sugiere que se escribe con el valor de la ÚLTIMA sesión completada (o que 1 = "aún no fallado"). Confirmar.

---

## 10. Conclusión y Decisiones del Debate

### Decisiones tomadas

| Área | Decisión |
|---|---|
| Scoring / medallas / cCareerRules | ⏸️ **Aplazado** — para IA semiautónoma futura |
| Tráfico IA (FrontEndDriverList) | ❌ **Descartado** — nos adaptamos al tráfico real |
| Timetable del jugador (Scenario.xml) | ✅ **Ya se extrae** — paradas, horarios, estado |
| `CurrentSave.xml` = autosave continuo | ✅ **Confirmado** — el motor lo escribe cada ~1.5s automáticamente, no es un guardado manual |
| Posición de estaciones | ✅ **Ya indexada** — viene de `Tracks.bin` (SQLite), no de `Scenario.xml` |

### Próximos pasos concretos (solo FASE 1)

1. **`SpeedingStats[]`** → log de excesos con hora, ubicación y velocidad
2. **`NumOperationalErrors`** → contador de infracciones del turno
3. **`ArrivalTime` real por parada** → puntualidad post-SUCCEEDED (+2min TARDE / a tiempo)
4. **Número de unidad** (`323211_65011`) → detalle de tracción

La gran limitación confirmada: **la puntuación acumulada en tiempo real NO está en el XML** — el motor la calcula en RAM y solo la escribe al finalizar el escenario.
