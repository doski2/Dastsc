# Pendientes Nexus V4 — priorizados

**Origen:** análisis log `session_2026-08-15_23-27-32.json`, duplicación código V3/kernel,
cadena de límites UK, captura perfiles Expert, auditoría duplicación Python/TS (ago 2026).

**Criterio de prioridad:**

| Nivel  | Significado                                                |
| ------ | ---------------------------------------------------------- |
| **P0** | Bloquea depuración o AUTO en ruta real — hacer ya          |
| **P1** | Mejora fiable la conducción AUTO o reduce bugs silenciosos |
| **P2** | Deuda técnica / mantenibilidad — evita regresiones         |
| **P3** | Calidad de vida, logs más limpios, documentación           |

Actualizar este archivo al cerrar ítems (marcar `[x]` y fecha).

---

## P0 — Diagnóstico y observabilidad

### P0.1 Conectar V4 al log de sesión (agente ausente)

**Problema:** en sesiones recientes solo aparecen `backend_tick` (314) y `ocr_capture` (3);
**cero** eventos `tick` / `tick_change` del frontend. `meta.source` queda en
`backend_telemetry` → no hay headline, horizon, plan de frenada ni límites en el JSON.

**Estado (2026-08-15):** fix aplicado — **sigue sin validar** (log 2026-08-16_17-05-31).

**Causa raíz (depuración 2026-08-16):**

1. Backend abre sesión `backend_telemetry` antes que V4; `POST /session/start` creaba otra sesión o
   pisaba eventos si compartían el mismo segundo.
2. `updateMeta` no promocionaba `source` → `v4_session` (meta quedaba en `backend_telemetry`).
3. El hook reiniciaba sesión (`end`) al cambiar perfil/modo (deps del efecto de arranque).

**Fix (2026-08-16):**

- [x] Backend `open_or_attach()` — V4 se acopla a la sesión activa del backend sin borrar ticks.
- [x] `_merge_session_meta` — promoción `backend_telemetry` → `v4_session`.
- [x] `start()` mismo segundo — no vacía eventos existentes.
- [x] `useSessionDiagnostic` — una sesión por conexión WS; reintento `bindWebSocket` cada 1 s.
- [x] `updateMeta` / flush — incluye `source: v4_session` + `console.warn` en fallos.
- [x] **`SESSION_EVENTS` por WebSocket** — flush de ticks por el mismo WS que telemetría (2026-08-16).

**Validación OK (`session_2026-08-16_23-12-34.json`, ~13 min Acela AUTO):**

- [x] `meta.source: v4_session`
- [x] **2976** eventos V4: `tick_change` 2209, `tick` 767, `connection` 4
- [x] Solo **3** `backend_tick` (silenciado tras V4 activo)
- [x] `agent.headline`, `agent.horizon`, `limits.upcoming` presentes en ticks
- [ ] **Tamaño:** 8.3 MB / **334k líneas** — JSON `indent=2` + ~3 eventos/s; ver compactación **P2.7**

**Histórico (sesiones anteriores):**

| Log | Resultado |
| --- | --------- |
| `17-05-31` | Fallido — solo `backend_tick`, `meta.backend_telemetry` |
| `17-48-02`, `18-14-24` | Parcial — meta v4, sin ticks V4 (REST fallaba) |
| `23-12-34` | **OK P0.1** — ticks V4 + WS; tamaño excesivo → P2.7 |

**Acción:**

- [x] `ensureStarted` + `bindWebSocket` — registro WS tras crear sesión (sin race).
- [x] Buffer de eventos antes de que exista `sessionId`.
- [x] Backend: no degradar `meta.source` v4 → backend_telemetry.
- [x] Backend: silenciar `backend_tick` si V4 envió tick reciente (<25 s).
- [x] Verificar en juego: log con `tick`/`tick_change`, `meta.source: v4_session`,

  bloque `agent.headline` y `agent.horizon` (log `23-12-34`, 2026-08-16).

**Archivos:** `Dastsc-V4/src/hooks/useSessionDiagnostic.ts`,
`Dastsc-V3/backend/main.py` (adopt_session), `docs/debug/README.md` (checklist sesión).

**Criterio de éxito:** nuevo log con ≥1 `tick_change` y horizon con límites durante marcha.

---

### P0.2 Registrar `limits.upcoming` en diagnóstico

**Problema:** `buildDiagnosticTick()` solo guardaba `limits.next`. Las cadenas UK (90→75→25)
no se pueden revisar post-mortem.

**Estado (2026-08-15):** `upcoming` + `frontal` añadidos a `buildDiagnosticTick`.

**Acción:**

- [x] Añadir `upcoming`, `frontal` al payload `limits` del tick de sesión.
- [x] Documentar campos en `docs/NEXUS_V4_ARQUITECTURA.md` §4.1 y §4.6 (2026-08-17).
- [ ] Confirmar en log real con 2 cartéles Lua (`NextLimit2`).

---

## P1 — Frenado AUTO y mapas UK

### P1.1 Validar cadena de límites en ruta real (Class 350 WCML)

**Problema:** mapas ingleses encadenan cartéles a pocos metros; frenar solo al intermedio
(75) no da tiempo antes del 25.

**Estado código:** implementado en kernel (`limitUtils`), horizon, HUD, `planBrakeForLimit`,
`commandBus.targetSpeedDisplay`.

**Acción:**

- [ ] Sesión con V4 conectado (P0.1) en tramo con 90→75→25.
- [ ] Comprobar HUD: «Próx. límite» + línea ámbar `→ 25 MPH en +Xm`.
- [ ] Comprobar headline: «Reducir a 25 MPH (cadena de límites)».
- [ ] Comprobar que AUTO no suelta freno en 75 cuando el 25 está a ≤350 m.

**Archivos:** ya en repo; validación en juego.

---

### P1.2 Perfil Class 350 Expert — muescas `TrainBrakeControl`

**Problema:** perfil sin muescas capturadas; AUTO usa convenciones genéricas.

**Estado (2026-08-16):** perfil con muescas INIT/30%…/S4 capturadas; en log Hampton se ve
freno `position≈0.25` (= INIT del perfil).

**Acción:**

- [x] Muescas en `class350_expert_wcml.json` (INIT, %, tracción S1–S4).
- [ ] Validar que `brakeStats` aprendidos no mezclen tracción simple vs consist doble.
- [ ] Repetir P1.1 con muescas reales en ruta.

---

### P1.3 Estación + límite cluster (regresión Leighton / similar)

**Problema histórico:** estación 500 m + cartel 90 m → `targetsAreClustered` eliminaba plan
estación; tracción plena.

**Estado:** fix en `shouldMergeLimitAndStationPlans` / `planBrake.ts` (revisar en log V4).

**Acción:**

- [ ] Caso de prueba en ruta WCML con estación y cartel <350 m.
- [ ] Log debe mostrar plan estación activo o detalle cluster explícito.

---

### P1.4 Consist doble tras acoplar — parada corta / freno pronto

**Log:** `session_2026-08-16_00-44-29.json` (Class 350 WCML, AUTO, acoplar otro 350).

**Síntoma:** última parada (Hampton-in-Arden) para **~300 m antes** del andén (OCR residual
306 m al quedar parado). Marston y Birmingham International quedaron en **~16 m**.

**Evidencia del log (`backend_tick`):**

| Parada           | Ancla OCR | 1.er freno (dist / vel)  | Parado en (OCR) |
| ---------------- | --------- | ------------------------ | --------------- |
| Marston Green    | 10 541 m  | ~2 486 m @ 85 mph        | ~16 m           |
| Birmingham Int.  | 2 816 m   | ~1 414 m @ 70 mph        | ~16 m           |
| Hampton-in-Arden | 2 993 m   | ~1 536 m @ 70 mph        | **~306 m**      |

**Hipótesis (orden de probabilidad):**

1. **`TrainMass` / `TrainLength` no reflejados en el plan** tras acoplar → `planBrake` calcula

   menos distancia de parada de la real → frena demasiado pronto (parada corta).

2. **`brakeStats` de unidad simple** aplicados al consist doble → deceleración efectiva distinta.
3. Tramo corto hasta Hampton (ancla 2 993 m vs 10 541 m Marston) → máx ~70 mph; no explica

   solo los 306 m residuales.

4. Este log **sigue sin ticks V4** (`meta.source: backend_telemetry`) → no hay `agent.headline`

   ni masa en JSON; difícil confirmar causa raíz (ver P0.1).

**Acción:**

- [x] Incluir `massT`, `lengthM`, `consistType` en `backend_tick` (diagnóstico).
- [ ] Detectar salto de masa (>25 %) y reiniciar / escalar `brakeStats` o avisar en UI.
- [ ] Tras acoplar, comparar `TrainMass` Lua vs distancia real de parada en log V4.
- [ ] Test: `planBrake` con massT×2 debe iniciar freno más lejos, no parar 300 m antes

  (ajustar si masa Lua es correcta y el plan aún corta → learning/notch).

**Archivos:** `planBrake.ts`, `useBrakeLearning.ts`, `main.py`, `sessionDiagnostic.ts`.

---

### P1.5 Acela WB — arranque OCR, pasos por y `near_correction` en 0 m

**Log:** `session_2026-08-16_17-05-31.json` (Washington → BWI → Baltimore Penn, AUTO).

**Síntomas:**

1. **~9 min sin tracker** al salir de Washington Union: `station.source: none`, dist `-1`.
   - `initial_anchor` rechazado (`rejected_platform_residual`, 48 m en andén).
   - Segundo intento sin distancia parseada.
   - En ruta hay **dos pasos por** (~1 mi y ~5 mi) antes de BWI — el HUD no tiene un solo destino
     claro al arrancar.
   - Ancla válida solo tras **`manual_anchor`** (36 242 m → BWI).

2. **Primera parada (BWI):** frenado razonable (1.er freno ~20 494 m @ 125 mph; residual **~25 m**),
   pero `near_correction` aceptó **dist=0** con OCR corrupto (`y 4 4sé`) → odómetro salta a 0 m
   en parada (ruido HUD). **En juego no provocó frenada extra** (ver análisis abajo).

3. **Baltimore Penn:** ancla 17 027 m, parada con residual **~16 m** (aceptable).

#### Decisión: pasos por → anclaje manual (no clasificar OCR)

**Estado (2026-08-17):** acordado — **no** modificar OCR para distinguir parada vs paso por.

- Acela WB: paso 1 ~**1 milla**, paso 2 ~**5 millas**, destino real BWI ~22 mi.
- Auto-anclar en el primer OCR ≥ 400 m fijaría el objetivo equivocado (peor que sin ancla).
- El botón **«Anclar OCR»** (`manual_anchor`) es el flujo previsto para cabeceras, waypoints y
  **mercancías** (más frecuente que en pasajeros).
- Mejora futura opcional (P3): perfil de ruta con estaciones a ignorar — no heurística OCR.

#### Análisis: `near_correction` dist=0 — no es detector de parada

**Estado (2026-08-17):** revisado en código — comportamiento **aceptable en juego**; hardening
backend **opcional** (baja prioridad).

| Capa | Qué hace con dist=0 | Archivo |
| ---- | ------------------- | ------- |
| **Backend OCR** | `near_correction` **acepta** OCR ≤ odómetro (`0 ≤ ~25 m`) — corrige deriva a la baja | `station_distance.py` → `should_accept_ocr_distance` |
| **Agente frenada** | `planBrakeForStation`: si `distanceM <= 0` → **sin plan** de aproximación | `planBrake.ts` L819 |
| **Parada final** | `planStationFinalStop` solo en **0–20 m** con velocidad > 0,2 m/s — parado en andén no dispara | `planBrake.ts` L769–799 |
| **Andén** | `isAtStationPlatform`: 0 m parado mantiene freno, no manda frenar de nuevo | `commandBus.ts` |

El frenado a BWI usó el **odómetro integrado** desde el ancla (contando hacia abajo), no el OCR
dist=0. El salto a 0 m es **ruido de telemetría/HUD** tras la parada; el agente lo ignora para
planificar. No es un “detector de parada por OCR=0” — eso **no está implementado** ni deseado.

Spikes al alza en andén sí se rechazan (`test_rejects_platform_near_correction_spike`, 97 m).

**Acción:**

- [ ] Tras salida de andén: reintentar `initial_anchor` cuando OCR ≥ 400 m (reduce manual en casos
  fáciles; **no** sustituye manual en pasos por).
- [x] Documentar pasos por → `manual_anchor` (2026-08-17).
- [x] Documentar `near_correction` dist=0: agente protege, backend acepta por diseño (2026-08-17).
- [ ] ~~Guard `near_correction` dist=0~~ — **diferido**: mejora cosmética de log/HUD; no afecta AUTO
  hoy. Reabrir solo si dist=0 en marcha confunde salida de andén.
- [ ] Validar con log V4 (P0.1) que el agente ve la misma distancia que `backend_tick` (P2.6).

**Archivos:** `station_distance.py`, `ocr_hud.py`, `main.py`, `planBrake.ts`, `commandBus.ts`.

---

### P1.6 Acela — zona 100 MPH: soltó freno y no replanificó (log 2026-08-17_00-23-21)

**Log:** `session_2026-08-17_00-23-21.json` (Acela WB, AUTO, cadena 110→100 MPH).

**Estado (2026-08-17):** fix aplicado en `planBrake.ts` + `commandBus.ts` + tests.

**Síntoma:** al entrar en zona **100 MPH** a **104,6 MPH**, AUTO soltó freno (OFF) y no volvió a
frenar; ~13 s por encima del límite hasta ~100,8 MPH.

**Cronología (UTC log):**

| Hora     | Vel   | Límite eff | Agente / mando                                      |
| -------- | ----- | ---------- | --------------------------------------------------- |
| 22:31:27 | 122,9 | 125        | Plan hacia cadena **110→100** (dist objetivo ~2,6 km) |
| 22:31:55 | 117,4 | 125        | UI «20% — aplicar ahora» — **sin mando AUTO aún**   |
| 22:32:04 | 116,3 | 125        | **`VirtualBrake 0.8`** (80%) — objetivo 100 @ 649 m |
| 22:32:17 | 104,6 | **100**    | **`VirtualBrake 0` OFF** — «objetivo alcanzado»      |
| 22:32:17–30 | 104→100 | 100    | Headline «Reducir a **125** MPH» — **sin plan**      |

**Causa raíz (código):**

1. **`resolveReleaseAction`**: comparaba con **next** (125 MPH) en lugar de **effective** (100).
2. **`planBrakeForLimit`**: sin frenada de cumplimiento cuando `speedDisplay > limits.effective`.
3. **Coast latch**: podía inhibir re-frenada tras OFF erróneo.

**Fix:**

- [x] `planBrakeForLimit`: si `speedDisplay > effective` → plan inmediato hacia límite de zona.
- [x] `resolveReleaseAction`: no soltar si `speedDisplay > effective` (estricto).
- [x] `shouldInhibitLimitRebrake`: no inhibir si aún por encima de `effective`.
- [x] Tests regresión Acela 104,6 mph / eff 100 / next 125.
- [x] Validado en ruta real — log `session_2026-08-17_00-39-13.json` (2026-08-17).

**Validación post-fix** (`session_2026-08-17_00-39-13.json`, ~35 min, Washington → Baltimore):

| Métrica                         | Log pre-fix `00-23-21` | Log post-fix `00-39-13` |
| ------------------------------- | ---------------------- | ----------------------- |
| Velocidad al entrar en zona 100 | **104,6 mph**          | **99,7 mph**            |
| Máx. en zona 100 (15 ticks)     | 104,6 mph              | 99,7 mph (0 ticks >101) |
| OFF con eff≈100 y spd>100       | Sí (22:32:17)          | **No** (0 casos)        |
| Frenada previa                  | 80% @ 649 m            | 20% @ 1019 m → 80% @ 337 m |
| OFF antes del cartel 100        | —                      | 22:48:12 @ 101,9 mph (zona 110, OK) |

Sesión larga adicional: cadena 110→100 OK, parada BWI (`near_correction` 370 m), Baltimore Penn;
arranque sigue necesitando **`manual_anchor`** (P1.5 — pasos por Washington).

**Archivos:** `commandBus.ts`, `planBrake.ts`, `commandBus.test.ts`, `planBrake.test.ts`.

---

### P1.7 `near_correction` repetido en andén (OCR ~80 m)

**Log:** `session_2026-08-17_01-20-35.json` (Acela, otro escenario mismo mapa).

**Síntoma:** cinco capturas `near_correction` con **80 m** en ~60 s — HUD en indicaciones de
**pasar vía** (no parada de servicio), mismo caso que P1.5 (pasos por / waypoints).

**Decisión (2026-08-17):** **no actuar** — no es bug de parada ni de AUTO. El OCR escanea texto
de vía intermedia; el flujo correcto es **`manual_anchor`** cuando el HUD muestra la parada real.
Los reintentos automáticos en ese contexto son ruido de log, no afectan frenada.

**Acción:**

- [x] Documentar como variante P1.5 (paso por / vía, no parada) — 2026-08-17.
- [ ] ~~Guards anti-spam en andén~~ — **cancelado** (no prioridad; usuario usa captura manual).

**Archivos:** — (solo documentación).

---

## P2 — Deuda técnica y duplicación

### P2.0 Géneros operativos `regional_commuter` / `high_speed_express`

**Estado (2026-08-16):** implementado.

- [x] `profiles/nexus/genres/regional_commuter.json` — plan 1500 m, paradas cortas.
- [x] `profiles/nexus/genres/high_speed_express.json` — plan 2500 m, gradiente conductor, SPLIT.
- [x] Migrados: `class323` → regional; `icet`, `class350_expert_wcml`, `acelaexpressexpert` →

  high_speed.

- [ ] Migrar legacy (`class377`, `class390_expert`, `generic`) cuando entren en foco AUTO.

**Archivos:** `docs/NEXUS_V4_ARQUITECTURA.md` §8.5.

---

### P2.1 Unificar texto de cadena de límites

**Problema:** `formatLimitChainHint()` (kernel) vs strings manuales en `tick.ts` y
`DriveHudBar.tsx` — tres fuentes de verdad.

**Acción:**

- [ ] `tick.ts`: usar `formatLimitChainHint` para `chainDetail` / headline.
- [ ] `DriveHudBar.tsx`: reutilizar helper de kernel o exportar `formatLimitChainSecondLine`.
- [ ] Test: mismo texto en horizon, headline y HUD para el mismo snapshot.

**Archivos:** `nexus-kernel/src/limitUtils.ts`, `nexus-agent/src/tick.ts`,
`Dastsc-V4/src/components/DriveHudBar.tsx`.

---

### P2.2 Deduplicar `backend_tick` en backend Python

**Problema:** ticks idénticos en parada inflan logs.

**Estado:** resuelto en práctica — con V4 activo solo **3** `backend_tick` en log `23-12-34`.

**Acción:**

- [x] Silenciar `backend_tick` si `v4_recently_active` (<25 s).
- [ ] Firma compacta + dedup explícito cuando V4 no conecta (solo backend).
- [ ] Opcional: evento `backend_tick_heartbeat` cada N minutos en parada.

**Archivos:** `Dastsc-V3/backend/main.py`.

---

### P2.7 Compactar logs V4 (tamaño / líneas)

**Problema:** log `23-12-34` — **3007 eventos**, **8.3 MB**, **334k líneas** en ~13 min.
Causas: JSON `indent=2` (~110 líneas/evento), `tick` cada 1 s + `tick_change` ~3/s,
payload con `brakePlan` completo repetido.

**Estado (2026-08-16):** compactación aplicada.

**Acción:**

- [x] JSON compacto en disco (`separators=(',', ':')`); pretty con env `NEXUS_V4_LOG_PRETTY=1`.
- [x] `tick_change` throttle 1/s; firma con distancia a estación en cubos de 10 m.
- [x] Heartbeat `tick` cada **30 s** (antes 1 s).
- [x] Payload reducido: sin `brakePlan` completo / `brakeStats`; solo `activeStep` + resumen.
- [ ] Objetivo post-fix: &lt;500 KB / &lt;5k líneas por 15 min de sesión AUTO.

**Archivos:** `session_log.py`, `sessionDiagnostic.ts`, `useSessionDiagnostic.ts`.

---

### P2.3 Unificar pipeline de logging (backend vs V4)

**Problema:** dos writers solapados — `backend_tick` (subset) y `tick`/`tick_change` (completo).

**Estado (log 23-12-34):** V4 domina (99.9% eventos); backend casi silenciado.

**Acción:**

- [x] Silenciar `backend_tick` si V4 activo (`v4_recently_active`).
- [x] `SESSION_EVENTS` por WebSocket como canal principal V4.
- [ ] Documentar flujo en `docs/debug/README.md`.
- [ ] Si solo backend (sin V4): mantener `backend_tick` enriquecido (P0.2 campos mínimos).

**Archivos:** `main.py`, `session_log.py`, `useSessionDiagnostic.ts`.

---

### P2.4 Deprecar fork V3 `DataNormalizer`

**Problema:** `Dastsc-V3/src/v3/core/DataNormalizer*` ~85–94% duplicado vs `nexus-kernel`.

**Acción:**

- [ ] Inventario: qué importa V3 PILOT aún del normalizer local.
- [ ] V3 PILOT → consumir `@nexus/kernel` (o re-export temporal).
- [ ] Eliminar copia cuando tests V3 sigan verdes.
- [ ] Actualizar mapa §10 en `NEXUS_V4_ARQUITECTURA.md`.

**Riesgo:** medio — hacer en rama dedicada, no mezclar con fixes AUTO.

---

### P2.5 Alinear `buildServicePhases` (V3 UI vs agente)

**Problema:** lógica similar en `brakingCurveUtils.ts` (V3) y `planBrake.ts` (agente); cambios
en uno no propagan al otro.

**Acción:**

- [ ] Extraer fases compartidas a `nexus-agent` y exportar para V3 PILOT, **o**
- [ ] Documentar V3 PILOT como solo comparación visual (no fuente de verdad).

**Prioridad dentro de P2:** después de P2.4.

---

### P2.6 Bypass `stickyStationDistance` cuando el backend es autoritativo

**Problema:** `station_distance.py` ya calcula distancia OCR + odómetro y marca
`StationDistanceSource: ocr_tracker|lua`; el kernel volvía a suavizar con `stickyStationDistance`
→ doble pipeline y posible deriva (paradas cortas, mid_leg).

**Estado (2026-08-16):** implementado en kernel.

**Validación parcial (`session_2026-08-16_17-05-31.json`):**

- Backend: **635** ticks `station.source: ocr_tracker` (coherente tras `manual_anchor`).
- **205** ticks `source: none` (arranque Washington Union, antes de anclar).
- Sin ticks V4 → **no** se puede confirmar passthrough kernel vs `backend_tick`.

**Acción:**

- [x] `resolveStationDistance()` — passthrough si `StationDistanceSource` es `ocr_tracker` o `lua`.
- [x] Tests en `nexus-kernel/src/tests/normalize.test.ts`.
- [ ] Validar en log V4: `station.source` coherente con backend y sin deriva extra vs `backend_tick`.
- [x] Documentar passthrough estación en `NEXUS_V4_ARQUITECTURA.md` §4.1 (`station.source`) (2026-08-17).

**Archivos:** `nexus-kernel/src/dataNormalizerUtils.ts`, `DataNormalizer.ts`.

---

## P3 — Calidad y mantenimiento

### P3.1 Reducir payload OCR en logs

**Problema:** cada `ocr_capture` incluye hasta 40 muestras del tracker; `sample_count: 120`.

**Acción:**

- [ ] En `_log_ocr_session_event`: incluir solo última muestra + resumen (anchor, drift).
- [ ] Flag `?full_tracker=1` en API debug para sesiones de desarrollo.

**Archivos:** `main.py`, `station_distance.py` (`debug_payload`).

---

### P3.2 Golden test cadena límites end-to-end

**Acción:**

- [ ] Snapshot mock 90/75/25 → `buildHorizon` + `tickAgent` + `planBrakeForLimit` en un test.
- [ ] Evitar regresión al refactor P2.1.

**Archivos:** `nexus-agent/src/*.test.ts`.

---

### P3.3 Documentar checklist sesión debug

**Acción:**

- [x] Añadir a `docs/debug/README.md`: campos `tick_change`, `gradient_sign`, log sano (2026-08-17).
- [x] §4.6 en `NEXUS_V4_ARQUITECTURA.md` — contrato log sesión V4.

---

### P3.4 Class 390 Expert — captura muescas (paridad 350)

**Acción:**

- [ ] Misma secuencia y validación que P1.2 si AUTO 390 en WCML entra en foco.

---

### P3.5 Acela — telemetría `Effort` (frenado real, dinámico automático)

**Contexto (2026-08-17):** en Acela Expert el **freno dinámico no es una palanca** — el sim mezcla
regenerativo + neumático al mover **`VirtualBrake`**. El control **`Effort`** (RailDriver / cabina)
es esfuerzo neto en **kN** (− = frenar, + = tracción; rango ~−80…+160).

**Dump `nexus-debug.py` (parado, 40 % freno):** `Effort = −28`, `DynamicBrake = 0`,
`TrainBrakeCylinderPressurePSI ≈ 63`, `AirBrakePipePressurePSI ≈ 45` → en andén manda el **aire**,
no el dinámico.

**Estado hoy (revisado GetData.txt Acela, 2026-08-17):**

- AUTO solo manda `VirtualBrake` — **correcto**; no hace falta controlar `DynamicBrake`.
- **GetData ya exporta** `TractiveEffort`, `BC`, `BP`, `MR`, `ER` en cada línea — el pipeline
  Nexus los parsea (`BrakingEffort`, cilindro, etc.).
- En Acela los valores llegan **en 0** porque Lua busca **nombres de control distintos** a los
  que usa el PowerCar:

| Campo GetData | Control que lee Lua hoy | Control real Acela (dump) |
| ------------- | ----------------------- | ------------------------- |
| `TractiveEffort` | `TractiveEffort` | **`Effort`** |
| `BC` | `BrakeCylinderPressurePSI` | **`TrainBrakeCylinderPressurePSI`** |
| `BP` | `BrakePipePressurePSI` | **`AirBrakePipePressurePSI`** |
| `MR` | `MainResPressurePSI` | **`MainReservoirPressurePSI`** ✓ (nombre distinto pero MR en dump 138 PSI) |

Ejemplo vivo (`GetData.txt` con 40 % freno): `VirtualBrake:0.4000` pero `TractiveEffort:0.00`,
`BC:0.00`, `BP:0.00` — palanca sí, esfuerzo/presión **no**.

**¿`Effort` = `TractiveEffort`?** Mismo **concepto** (esfuerzo tractivo/frenado en kN, − = frenar),
**distinto nombre de control** según locomotora. En GetData seguimos escribiendo la clave
`TractiveEffort:`; solo hay que leer el control `Effort` en Lua cuando no exista `TractiveEffort`.
Con tren **parado**, el valor puede ser bajo (p. ej. −28 kN con ~40 % freno) — no confundir con
«sin lectura»; sin el alias `Effort`, el campo salía **0** aunque el sim sí tuviera esfuerzo.

- Perfil `acelaexpressexpert` **no** mapea `effort` (kernel ya usa `TractiveEffort` del parseo).
- `dynamic_brake_ratio` en género **no** lo usa `planBrake` (solo documentación).

**Para qué serviría `Effort` (feedback, no planificar mezcla dinámico/aire):**

| Uso | Prioridad |
| --- | --------- |
| Confirmar respuesta tras mando AUTO (`\|Effort\|` sube tras `VirtualBrake`) | Alta |
| No soltar OFF si `\|Effort\|` sigue alto aunque la velocidad baje | Media |
| Decel real ≈ `\|Effort\| / masa` (complemento a `brakeStats`) | Media (futuro) |
| Planificar % dinámico vs aire por velocidad | **No** — lo hace el sim |

**Acción:**

- [x] Lua (`Railworks_GetData_Script.lua`): alias `Effort`, `TrainBrakeCylinderPressurePSI`,
  `AirBrakePipePressurePSI`, `MainReservoirPressurePSI`, `EqReservoirPressurePSI`; campo debug
  `EffortSource` (`TractiveEffort` / `Effort` / `none`). **`NexusLuaVersion:12`**.
- [ ] Validar GetData: con 40 % freno parado, `TractiveEffort ≈ −28`, `EffortSource:Effort`,
  `BC ≈ 63`, `BP ≈ 45` (PSI).
- [x] Log V4 `tick_change`: `brake.effortKn`, `brake.tractiveKn`, `brake.cylinder` (muesca vs respuesta).
- [ ] Perfil Acela: `"effort": "TractiveEffort"` (campo parseado) + `specs.max_effort` (~160 kN).
- [ ] Agente (opcional): guard «freno efectivo» — no OFF si `\|effortKn\| > umbral` con freno aplicado.
- [x] ~~Log V4: incluir `effortKn`, `cylinder` en `tick_change`~~ — ver arriba.

**`EffortSource`:** mantener solo en **GetData** (debug Lua: confirma qué control se leyó). No hace
falta en log de sesión ni en kernel — el valor útil es `TractiveEffort` / `brake.tractiveKn`.

**Recalibración `brakeStats`:** no hace falta re-capturar muescas del perfil (son posiciones de
palanca). Sí conviene **re-aprender deceleraciones** si antes BC/Effort llegaban en 0. Ver **P3.7**
(stats por banda de velocidad — implementado).

**Nota P3.6:** al arreglar BC/BP en Lua para Acela, los guards neumáticos de P3.6 reciben datos
sin duplicar el pipeline — solo falta leer los nombres correctos del control.

**Archivos:** `lua/Railworks_GetData_Script.lua`, `profiles/acelaexpressexpert.json`,
`nexus-kernel`, `commandBus.ts`, `sessionDiagnostic.ts`.

---

### P3.7 `brakeStats` por banda de velocidad (Plan A)

**Problema:** un solo `avg_decel` por muesca mezcla frenadas a 100 mph (dinámico Acela) con
andén (~20 mph, aire). El plan elige muesca igual; la **decel estimada** era incorrecta.

**Solución (2026-08-17):** agregar stats por banda según `start_speed_ms` del evento de learning.

| Banda | Velocidad inicial | Uso típico |
| ----- | ----------------- | ---------- |
| `high` | ≥ 35 m/s (~78 mph) | Dinámico dominante (Acela alta v) |
| `med` | 8–35 m/s (~18–78 mph) | Transición / UK interurbano |
| `low` | < 8 m/s (~18 mph) | Andén, aproximación final |

**Resolución al planificar** (`decelForNotch`):

1. Stats de la banda actual con ≥ 3 muestras → usar esa decel.
2. Si no → fallback al `avg_decel` global de la muesca (≥ 3 muestras).
3. Si no → física del perfil × fracción de muesca.

**Implementado:**

- [x] `brake_log.py`: `speed_band_from_ms`, `get_stats` → `by_notch[].by_speed`.
- [x] Eventos: `speed_band` auto en `append_event`; V4 envía `speed_band` en payload.
- [x] `nexus-agent/brakeStats.ts`: `speedBandFromMs`, `resolveLearnedEntry`.
- [x] `planBrake.ts`: `decelForNotch(..., speedMs)` usa banda actual.
- [x] Tests Python + Vitest.

**Aprendizaje:** ≥ 3 eventos válidos por `(muesca, banda)` para usar esa banda; el global sigue
acumulándose en paralelo. Conducción normal en live — capturar cada muesca en al menos 2 bandas
(~100 mph y ~40 mph) acelera la calibración Acela.

**No incluye (Plan B/C futuro):** filtrar eventos por BC/`tractiveKn`; guards OFF por presión.

**Archivos:** `brake_log.py`, `brakeLearningUtils.ts`, `brakeStats.ts`, `planBrake.ts`, `types.ts`.

---

### P3.6 Frenos neumáticos — guards BC/BP (apply / release)

**Contexto (2026-08-17):** el agente planifica con **`brake_fill_time_s` fijo** + **`brakeStats`**
(learning por muesca). **No** cierra el bucle con presión de cilindro ni tubo principal.

**Prioridad por tipo de tren:**

| Tipo | Presión crítica para AUTO | Notas |
| ---- | ------------------------- | ----- |
| Acela / SPLIT % | Baja | Sim mezcla dinámico+aire vía `VirtualBrake`; P3.5 basta como feedback |
| EMU UK aire (323, 350) | Media | `release_pressure` en perfil; confirmar BC al soltar OFF |
| Mercancías / consist largo | **Alta** (futuro) | Propagación BP; no confiar solo en fill time |

**Guards propuestos (incrementales, sin simular tubo completo):**

1. **Apply:** considerar freno aplicado cuando **BC > umbral** (o sube tras mando), no solo
   `VirtualBrake` / `position`.
2. **Release:** no OFF hasta **BC ≤ release_pressure + margen** (perfil `brakes.release_pressure`,
   p. ej. 323 → 5 bar).
3. **Coast latch:** no inhibir re-frenada si BC sigue alta aunque la velocidad baje al cartel.
4. **Freight (futuro):** escalar `brake_fill_time_s` / margen con `ConsistType` + longitud.

**Decisión:** no modelar clasificación parada vs paso por en OCR (P1.5); no duplicar mezcla
dinámico/aire del Acela (P3.5). Esto es **cerrar el bucle palanca → presión → efecto**.

**Acción:**

- [ ] `commandBus.ts`: `isBrakeApplied()` opcional con BC% si telemetría disponible.
- [ ] `resolveReleaseAction`: bloquear OFF si BC > `release_pressure` del perfil.
- [ ] Documentar en `METRICAS_TELEMETRIA_V3.md` § freno qué perfiles exponen BC/BP.
- [ ] Tests con snapshot mock BC alto + velocidad baja → no OFF.

**Archivos:** `commandBus.ts`, `planBrake.ts`, `agentConfig.ts`, perfiles con
`brakes.release_pressure`, `BrakeNormalizer.ts`.

---

## Orden de ejecución recomendado

```text
P0.1 (log V4) → P1.5 (OCR Acela) → P1.6 (validado) → P1.7 (paso vía — cerrado)
→ P0.2 → P2.6 (validar con V4) → P1.4 (masa consist) → P1.1 (cadena UK)
→ P1.2/P1.3 → P3.5 (aliases Lua Effort/BC/BP Acela) → P3.7 (stats banda velocidad) → P3.6 (guards aire) → P2.1–P2.5
```

**Regla:** no cerrar fase «AUTO UK fiable» hasta P0 + P1 completos con log verificable.

---

## Referencias

- Log analizado: `logs/nexus-v4/session_2026-08-15_23-27-32.json`,

  `logs/nexus-v4/session_2026-08-16_00-44-29.json`,

  `logs/nexus-v4/session_2026-08-16_17-05-31.json` (Acela WB — P0.1 fallido, P1.5),

  `logs/nexus-v4/session_2026-08-16_17-48-02.json` (P0.1 parcial: meta v4, sin ticks),

  `logs/nexus-v4/session_2026-08-16_18-14-24.json` (P0.1: rest_start OK, sin ticks V4),

  `logs/nexus-v4/session_2026-08-16_23-12-34.json` (**P0.1 OK** — 334k líneas, ver P2.7),

  `logs/nexus-v4/session_2026-08-17_00-23-21.json` (P1.6 pre-fix — OFF en zona 100),

  `logs/nexus-v4/session_2026-08-17_00-39-13.json` (**P1.6 validado** — cadena 110→100),

  `logs/nexus-v4/session_2026-08-17_01-20-35.json` (otro escenario — P1.5 manual_anchor;

  P1.7 paso vía / near_correction 80 m — **no actuar**, manual OK)

- Arquitectura: `docs/NEXUS_V4_ARQUITECTURA.md`
- Cadena límites: `nexus-kernel/src/limitUtils.ts`
- Sesiones debug: `docs/debug/README.md`
- Dump controles cabina: `nexus-debug.py` (RailDriver — `Effort`, presiones PSI)

*Última revisión: 2026-08-17.*
