# Nexus V4 — Arquitectura y diseño

**Estado:** Fase 323 cerrada · Class 390 en prueba · UI DriveHudBar · agosto 2026
**Relación con V3:** V3 = motor de telemetría + PILOT legacy (BrakingCurve, gauges). V4 = producto
AI-first con agente protagonista.

**Foco actual:** validar **modo AUTO** de frenado (323) en ruta real.
**Siguiente gran fase (documentada, no implementada):** **tracción / aceleración** cuando el frenado
esté completo en AUTO.

---

## 1. Principio rector

> **La pantalla principal no es el velocímetro: es el Agente.**

El maquinista abre Nexus y ve primero **qué hacer ahora**, **por qué**, y **cuánto margen queda** —
no un grid de widgets.

| V3                    | V4                                        |
| --------------------- | ----------------------------------------- |
| HUD PILOT como home   | **Agent Panel** como home                 |
| IA = pestaña vacía    | IA = capa `nexus-agent` + UI protagonista |
| Lógica + UI mezcladas | Kernel puro → Agente → UI delgada         |
| Crecimiento orgánico  | Contratos fijos desde el día 1            |

---

## 2. Personas y modos

| Modo                  | Usuario                         | Comportamiento                                                                |
| --------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| **SUGGEST** (default) | Conductor humano                | Texto + horizonte + barra fija (velocidad, límites, cola). Sin mandos al sim. |
| **ARM**               | Conductor avanzado              | Sugiere acción; un clic confirma envío a `SendCommand.txt`. ✅                |
| **AUTO**              | Entrenamiento / rutas conocidas | Frenado + OFF automático vía `SendCommand.txt`. Sin tracción v1. ✅           |

La política (`SUGGEST` / `ARM` / `AUTO`) se elige en **CONFIG V4** y persiste en `localStorage`.
Perfil de tren: **AUTO** (detección DLL) recomendado; selección manual opcional.

---

## 3. Arquitectura en capas

```text
```

**Regla:** `nexus-agent` y `nexus-kernel` no importan React. Tests unitarios sin navegador.

---

## 4. Contratos de datos

Tipos en `nexus-kernel/src/types.ts`.

### 4.1 `TelemetrySnapshot`

Salida estable del kernel (`TelemetryHub` + `toTelemetrySnapshot`).

Campos clave: velocidad, límites, señalización, estación (OCR), freno, cola, seguridad, tren
(masa, longitud, `consistType`), gradiente (‰).

### 4.2 `HorizonEvent`

Cola ordenada de lo que viene delante (máx. 5): señal, límite, estación, cola, seguridad.

### 4.3 `AgentTick` (salida del agente → UI)

`headline`, `detail`, `urgency`, `marginM` / `marginS`, `horizon[]`, `brakePlan?`, `brakeContext?`,
`suggestedAction?`, `mode`, `blockedReason?`.

### 4.4 Prioridad de objetivo de frenado (`planBrake`)

Cuando compiten varios planes (señal, límite, estación), `selectUrgentBrakePlan()` aplica:

1. **Cluster límite + estación** (< 350 m): se excluye el plan de **estación** del pool (un solo

   plan
   urgente al cartel).

2. **Señal vs límite** en el mismo bloque: gana la **señal** si está a la distancia del límite o

   antes.

3. **Desempate por tipo**: **Señal (0) → Límite (1) → Estación (2)**.
4. **Desempate fino**: menor `brakePlanUrgencyScore` o menor distancia al objetivo.

El headline y el horizonte reflejan el mismo orden (señal antes que límite antes que estación).

---

## 5. Diseño de pantallas

### 5.1 Home — **AGENT** (protagonista)

```text
```

**En V4 actual:**

| Bloque       | Componente        | Notas                                                                                        |
| ------------ | ----------------- | -------------------------------------------------------------------------------------------- |
| Barra fija   | `DriveHudBar.tsx` | Velocidad actual, límite efectivo, próximo límite (+ distancia), cola (+ s). No hace scroll. |
| Protagonista | `AgentHeadline`   | Headline + urgencia desde `tickAgent` / `planBrake`                                          |
| Mandos       | `ArmActionBar`    | ARM confirma; AUTO vía `useAutoCommand`                                                      |
| Plan         | `BrakePlanPanel`  | Pasos de muesca; lista desplegable con scroll interno (`max-h-52`)                           |
| Horizonte    | `HorizonStrip`    | Próximos eventos (señal, límite, estación, cola, seguridad)                                  |
| Layout       | `AppShell.tsx`    | Header + `driveHud` + `main` con scroll independiente + footer                               |

**No en esta fase:** ETCS skin, grid 3 columnas, tracción automática. `MiniHud.tsx` sustituido por
`DriveHudBar` (barra superior fija).

### 5.2 **PILOT** — vista legacy (V3)

`http://localhost:5173` — Speedometer + TrackProfile + BrakingCurve. Referencia visual mientras se
afina el agente V4.

### 5.3 **CONFIG**

Pestaña **Config** en V4 (`localhost:5175`):

| Bloque           | Función                                              |
| ---------------- | ---------------------------------------------------- |
| Modo agente      | SUGGEST / ARM / AUTO (frenado + OFF; sin tracción)   |
| Sistema          | Telemetría LIVE, perfil AUTO/activo, tren DLL        |
| Perfil de tren   | AUTO (recomendado) o manual → `SELECT_PROFILE` WS    |

---

## 6. Agentes (módulos `nexus-agent`)

| Módulo                | Estado | Notas                                                                                    |
| --------------------- | ------ | ---------------------------------------------------------------------------------------- |
| `buildHorizon()`      | ✅     | Señal, límite, estación, cola, AWS/DSD                                                   |
| `planBrake()`         | ✅     | Port física V3; gradiente ‰; prioridad **Señal → Límite → Estación**; golden tests vs V3 |
| `tickAgent()`         | ✅     | Headline + `suggestedAction` en ARM/AUTO                                                 |
| `commandBus`          | ✅     | Muesca + OFF; EMG bloqueado; AUTO suspende en SAFETY                                     |
| `useAutoCommand`      | ✅     | V4: rate limit 2 s, fallback a SUGGEST si ack falla                                      |
| `useBrakeLearning`    | ✅     | V4 → `POST /api/brake/event`                                                             |
| `evaluateVigilance()` | ⏳     | Solo vía horizon SAFETY hoy                                                              |
| `evaluateCruise()`    | ⏳     | **Fase tracción** — ver §8.4                                                             |
| `planThrottle()`      | ⏳     | **Fase tracción** — después de frenado completo                                          |
| `mergeTicks()`        | ⏳     | Un solo tick por ahora                                                                   |

**v1 = reglas + física + brake learning + ARM.** Sin LLM en el loop de telemetría.

---

## 7. Estructura de repositorio

```text
```

---

## 8. Perfiles de tren — estrategia

### 8.1 Fase 323 — frenado (cerrada)

Validado en juego con Class 323 (Birmingham Cross City):

| Qué usamos              | Archivo / mecanismo                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------- |
| Perfil completo         | `profiles/class323.json`                                                                |
| Variantes expert/simple | `extends: "class323"` en `xc_class323_expert`, `cc_class323_simple`                     |
| Detección AUTO          | Backend: `GetLocoName()` + fingerprint DLL; pool **legacy + Nexus** (`profile_auto.py`) |
| Decel por muesca        | `brake_events.json` → `/api/brake/stats`                                                |
| Física agente           | `planBrake` + `reaction_time_s: 3` + blend avg/max aprendido                            |
| Aprendizaje en juego    | `useBrakeLearning` en V4                                                                |
| Comandos ARM / AUTO     | `command_bus.py` → `SendCommand.txt` (Lua)                                              |

**Calibración 323 (`physics_config`):**

- `reaction_time_s: 3.0` — margen de anticipación (antes 4 s efectivos)
- Decel de planificación: `65%` media + `35%` máximo aprendido por muesca
- `brake_fill_time_s: 2.5` — referencia documental; el margen real lo marca `reaction_time_s`

- Ciclo frenado: aplicar muesca → llegar a límite → **soltar OFF** (`resolveReleaseAction`)

### 8.2 Plantilla gold (`class323.json`)

Bloques que todo perfil futuro debería tener (ver `docs/GUIA_PERFILES_V3.md`):

- `aliases` — matching RV / nombre DLL
- `fingerprint.required_controls` — variante de cabina
- `mappings` — nombres exactos de controles (desde `nexus-debug.py`)
- `specs.notches_throttle_brake` — muescas normalizadas
- `physics_config` — decel, fill time, effort
- `brakes` / `visuals`

### 8.3 Fase AUTO — frenado v1 (implementado)

Los comandos ARM funcionan en ruta real. **AUTO v1** envía sin confirmación con salvaguardas:

| Regla | Descripción                                         | Estado                         |
| ----- | --------------------------------------------------- | ------------------------------ |
| R1    | Solo mandos permitidos (sin EMG, sin reverser)      | ✅                             |
| R2    | Rate limit 2 s; mismo `command:value` no se reenvía | ✅ `useAutoCommand`            |
| R3    | Sin mandos si `horizon` tiene `SAFETY`              | ✅                             |
| R4    | Vuelve a SUGGEST si `COMMAND_ACK` falla             | ✅                             |
| R5    | Solo frenado B1–B3 + OFF; sin tracción              | ✅                             |
| R6    | Log backend de comandos                             | ✅ `logging.info` en `main.py` |

**Código:**

- `nexus-agent/command/commandBus.ts` — `resolveSuggestedAction` (ARM + AUTO),

  `resolveReleaseAction`

- `Dastsc-V4/hooks/useAutoCommand.ts` — dispatch automático
- `Dastsc-V4/PolicyModeSelector` — AUTO habilitado en CONFIG
- Sin DLL escritura en AUTO v1 (solo Lua)

### 8.4 Fase tracción / aceleración — después del frenado

**No empezar hasta:** frenado 323 cerrado (incl. soltar OFF) + AUTO de frenado estable.

Objetivo: cuando el tren va por debajo del límite y freno en OFF, sugerir o aplicar **P1–P4**
(`ThrottleAndBrake` > 0) para mantener velocidad o recuperar margen antes del siguiente límite.

| Módulo (futuro)     | Función                                                            |
| ------------------- | ------------------------------------------------------------------ |
| `planThrottle()`    | Muesca de tracción según déficit de velocidad y gradiente          |
| `evaluateCruise()`  | Mantener banda alrededor del límite efectivo                       |
| `throttle_learning` | Opcional: stats de aceleración por muesca (análogo a `brakeStats`) |

**Dependencias:** `specs.notches_throttle_brake` del perfil, `physics_config` de esfuerzo/masa,
mismo `CommandBus` (Lua primero).

### 8.5 Más adelante — multi-tren

| Tarea                        | Herramienta                                        | Prioridad |
| ---------------------------- | -------------------------------------------------- | --------- |
| Class 375, 390, …            | `nexus-profile-wizard.py` + captura muescas manual | P2        |
| Class 390 expert             | `profiles/class390_expert.json` (6 muescas B1–B6)  | En prueba |
| Herencia sin duplicar        | `"extends": "class323"` o perfil base por familia  | P2        |
| Aliases RV automáticos       | Ampliar al detectar nombre nuevo                   | P3        |
| Perfil en disco desde sesión | Export explícito (no auto-write en juego)          | P3        |
| UI selector AUTO / manual    | CONFIG V4                                          | ✅        |
| Tablas decel ERA / XML TSC   | Calibración `max_braking_decel`                    | P4        |

---

## 9. Herramientas de diagnóstico (propias)

Sin depender de “TSClassic Raildriver and Joystick Interface” u otros terceros:

```bash
```

Ver también `docs/COMPARATIVA_LUA_RAILDRIVER.md`, `docs/GUIA_TECNICA_IPC.md`.

---

## 10. Mapa de extracción V3 → V4

| Origen V3                              | Destino                                    | Estado                 |
| -------------------------------------- | ------------------------------------------ | ---------------------- |
| `core/normalizers/*`                   | `nexus-kernel/normalizers/`                | ✅                     |
| `DataNormalizer` + utils               | `nexus-kernel/`                            | ✅                     |
| `brakingCurveUtils.computeBrakeParams` | `nexus-agent/brake/planBrake.ts`           | ✅ (+ fix gradiente ‰) |
| `useBrakeLearning`                     | `Dastsc-V4/hooks/useBrakeLearning.ts`      | ✅                     |
| `CommandBus` / ARM                     | `command_bus.py` + `command/commandBus.ts` | ✅ validado en juego   |
| `CommandBus` / AUTO                    | `useAutoCommand.ts` + reglas R1–R5         | ✅ v1 frenado          |
| `planThrottle` / tracción              | —                                          | ⏳ §8.4                |

---

## 11. MVP — criterios de éxito

1. WebSocket live → `TelemetrySnapshot` → `tickAgent` → UI V4.
2. Headline de frenado con **muesca real** del 323 (no default genérico).
3. Paridad física V3/V4 en `planBrake` (golden tests).
4. PILOT V3 disponible para comparar curva vs agente.
5. ARM envía mando real a TSC vía `SendCommand.txt` (validado Class 323).

**Comandos:**

```bash
```

---

## 12. Fuera de alcance (ahora)

- LLM en tiempo real
- ETCS DMI skin completo
- Tracción / aceleración automática (ver §8.4 — después de frenado)
- Perfiles completos para toda la flota `profiles/*.json`
- Integración distancia estación vía XML de ruta (POC: `route-distance-poc.py`)
- Grid dinámico por blueprint JSON
- Escritura DLL en AUTO v1 (solo Lua `SendCommand`)

---

## 13. Decisiones cerradas

| #   | Decisión            | Valor                                                    |
| --- | ------------------- | -------------------------------------------------------- |
| D1  | Monorepo            | npm workspaces en raíz                                   |
| D2  | Backend             | `Dastsc-V3/backend/` :8000                               |
| D3  | V3 en paralelo      | Sí (`dev:v3` PILOT)                                      |
| D4  | Puertos             | V4 **5175**, V3 **5173**, backend **8000**               |
| D5  | Modo agente default | **SUGGEST**; **ARM** + **AUTO** frenado v1 operativos    |
| D6  | Perfil referencia   | **`class323.json`** — gold hasta multi-tren              |
| D9  | Canal de mando      | **Lua** `SendCommand.txt` primero; DLL escritura después |
| D7  | Debug controles     | **`nexus-debug.py`** (RailDriver oficial)                |
| D8  | Telemetría mundo    | **Lua** `GetData.txt` (no DLL 400–408)                   |

---

## 14. Estado del scaffold (agosto 2026)

### Hecho — fase 323

- [x] `nexus-kernel` — normalizers, `TelemetryHub`, `toSnapshot`, safety AWS, tests
- [x] `nexus-agent` — `planBrake`, `tickAgent`, `commandBus`, tests (+ golden V3); prioridad frenado

  señal → límite → estación

- [x] `Dastsc-V4` — Agent, `DriveHudBar`, `BrakePlanPanel`, CONFIG, `useBrakeLearning`,

  `ArmActionBar`

- [x] OCR estación — tolerancia deriva al alza en `mid_leg_correction` (WCML / tramos largos)
- [x] Perfil 390 — `class390_expert.json`; asistente con captura manual de muescas

  (`notch_capture.py`)

- [x] Perfil 323 — autoperfil AUTO, `brakeStats`, calibración `reaction_time_s` + blend decel
- [x] Backend — `command_bus.py`, `COMMAND` WS + `COMMAND_ACK`, `brake_log`
- [x] `nexus-debug.py`, `Iniciar_Nexus_V4.bat`
- [x] ARM validado en juego (Class 323, `ThrottleAndBrake`)

### En curso

- [x] Validación AUTO v1 en ruta real (Class 323 + Class 390 WCML)
- [x] Parada estación tras fix OCR (`mid_leg_correction` aceptada, no ráfaga `rejected_jump`)

### Roadmap

- [ ] **Tracción / aceleración** — `planThrottle`, `evaluateCruise` (§8.4)
- [ ] Segundo tren gold (Class 375)
- [ ] Tag `v3-stable`, mover backend a `Dastsc/backend/`
- [ ] DLL `SetControllerValue` para mandos no cubiertos por Lua

---

*Documento vivo — última revisión: agosto 2026.*
