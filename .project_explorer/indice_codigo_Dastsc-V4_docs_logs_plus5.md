# Índice de código — Dastsc — `Dastsc-V4 | docs | logs (+5 más)`

- **Archivos indexados:** 138
- **Líneas de código:** 10,806

## Carpetas incluidas

- `Dastsc-V4`
- `docs`
- `logs`
- `lua`
- `nexus-agent`
- `nexus-kernel`
- `profiles/nexus`
- `scripts`

## Flujo de datos entre módulos

- `Dastsc-V4/src/` → `Dastsc-V4/src/components/` (8) — App.tsx→AgentHeadline.tsx, App.tsx→ArmActionBar.tsx, App.tsx→AppShell.tsx, App.tsx→BrakePlanPanel.tsx
- `nexus-kernel/src/` → `nexus-kernel/src/normalizers/` (8) — DataNormalizer.ts→Constants.ts, DataNormalizer.ts→PhysicsNormalizer.ts, DataNormalizer.ts→SignalingNormalizer.ts, DataNormalizer.ts→BrakeNormalizer.ts
- `nexus-agent/src/` → `nexus-agent/src/brake/` (5) — horizon.ts→signalUtils.ts, tick.ts→agentConfig.ts, tick.ts→physics.ts, tick.ts→signalUtils.ts
- `Dastsc-V4/src/` → `Dastsc-V4/src/hooks/` (3) — App.tsx→useManualOcrCapture.ts, App.tsx→useAgent.ts, App.tsx→useStationDistanceDebug.ts
- `nexus-agent/src/` → `nexus-agent/src/command/` (1) — tick.ts→commandBus.ts

## Puntos de entrada

- `Dastsc-V4/package.json`
- `docs/debug/README.md`
- `docs/debug/semana-01-lua-ipc/README.md`
- `docs/debug/semana-02-telemetria-kernel/README.md`
- `docs/debug/semana-03-backend-comandos/README.md`
- `docs/debug/semana-04-agente-frenado/README.md`
- `docs/debug/semana-05-agente-estacion/README.md`
- `docs/debug/semana-06-auto-v4/README.md`
- `docs/debug/semana-07-icet/README.md`
- `docs/debug/semana-08-class323/README.md`
- `docs/debug/semana-09-generico-nuevos/README.md`
- `docs/debug/semana-10-aceleracion-futuro/README.md`
- `nexus-agent/package.json`
- `nexus-agent/src/index.ts`
- `nexus-kernel/package.json`
- `nexus-kernel/src/index.ts`

## Por carpeta

### `Dastsc-V4/` — 76 L

- `Dastsc-V4/package.json` (27 L)
- `Dastsc-V4/tsconfig.json` (18 L)
- `Dastsc-V4/vite.config.ts` (18 L)
- `Dastsc-V4/tsconfig.node.json` (13 L)

### `docs/` — 2,462 L

- `docs/PENDIENTES_V4.md` (722 L)
- `docs/NEXUS_V4_ARQUITECTURA.md` (444 L)
- `docs/METRICAS_TELEMETRIA_V3.md` (370 L)
- `docs/GUIA_TECNICA_IPC.md` (259 L)
- `docs/COMPARATIVA_LUA_RAILDRIVER.md` (207 L)
- `docs/TIPOS_DE_FRENOS.md` (132 L)
- `docs/ESPECIFICACION_ULTRA_CORE_V4.md` (120 L)
- `docs/GUIA_PERFILES_V3.md` (113 L)
- `docs/DOCUMENTACION_PROYECTO.md` (95 L)

### `lua/` — 518 L

- `lua/Railworks_GetData_Script.lua` (518 L)

### `nexus-agent/` — 43 L

- `nexus-agent/package.json` (22 L)
- `nexus-agent/tsconfig.json` (14 L)
- `nexus-agent/vitest.config.ts` (7 L)

### `nexus-kernel/` — 31 L

- `nexus-kernel/package.json` (18 L)
- `nexus-kernel/tsconfig.json` (13 L)

### `src/` — 128 L
- **→ hacia:** `src/components/`, `src/hooks/`

- `Dastsc-V4/src/App.tsx` (117 L)
- `Dastsc-V4/src/main.tsx` (10 L)
- `Dastsc-V4/src/vite-env.d.ts` (1 L)

### `debug/` — 107 L

- `docs/debug/README.md` (107 L)

### `ETCS/` — 107 L

- `docs/ETCS/INVESTIGACION_ETCS.md` (107 L)

### `nexus-v4/` — 2 L

- `logs/nexus-v4/session_2026-08-17_02-52-08.json` (1 L)
- `logs/nexus-v4/session_2026-08-17_02-54-49.json` (1 L)

### `src/` — 501 L
- **→ hacia:** `src/brake/`, `src/command/`

- `nexus-agent/src/tick.ts` (331 L)
- `nexus-agent/src/horizon.ts` (88 L)
- `nexus-agent/src/index.ts` (56 L)
- `nexus-agent/src/horizon.test.ts` (26 L)

### `src/` — 1,546 L
- **→ hacia:** `src/normalizers/`

- `nexus-kernel/src/dataNormalizerUtils.ts` (526 L)
- `nexus-kernel/src/DataNormalizer.ts` (254 L)
- `nexus-kernel/src/telemetryTypes.ts` (160 L)
- `nexus-kernel/src/types.ts` (131 L)
- `nexus-kernel/src/telemetryHubUtils.ts` (88 L)
- `nexus-kernel/src/toSnapshot.ts` (79 L)
- `nexus-kernel/src/limitUtils.ts` (77 L)
- `nexus-kernel/src/TelemetryHub.ts` (64 L)
- `nexus-kernel/src/mock.ts` (61 L)
- `nexus-kernel/src/index.ts` (53 L)
- `nexus-kernel/src/safetyUtils.ts` (31 L)
- `nexus-kernel/src/format.ts` (22 L)

### `nexus/` — 46 L

- `profiles/nexus/generic.json` (46 L)

### `debug/` — 13 L

- `scripts/debug/pre-vuelo-tests.bat` (13 L)

### `src/components/` — 1,345 L
- **← desde:** `src/`

- `Dastsc-V4/src/components/BrakePlanPanel.tsx` (377 L)
- `Dastsc-V4/src/components/DriveHudBar.tsx` (174 L)
- `Dastsc-V4/src/components/ProfileSelector.tsx` (136 L)
- `Dastsc-V4/src/components/ConfigView.tsx` (114 L)
- `Dastsc-V4/src/components/ProfileCompletenessPanel.tsx` (96 L)
- `Dastsc-V4/src/components/ArmActionBar.tsx` (95 L)
- `Dastsc-V4/src/components/SessionLogsPanel.tsx` (85 L)
- `Dastsc-V4/src/components/AppShell.tsx` (83 L)
- `Dastsc-V4/src/components/PolicyModeSelector.tsx` (60 L)
- `Dastsc-V4/src/components/HorizonStrip.tsx` (50 L)
- `Dastsc-V4/src/components/AgentHeadline.tsx` (39 L)
- `Dastsc-V4/src/components/MiniHud.tsx` (36 L)

### `src/hooks/` — 998 L
- **← desde:** `src/`

- `Dastsc-V4/src/hooks/useAgent.ts` (382 L)
- `Dastsc-V4/src/hooks/useSessionDiagnostic.ts` (274 L)
- `Dastsc-V4/src/hooks/useAutoCommand.ts` (77 L)
- `Dastsc-V4/src/hooks/useBrakeLearning.ts` (73 L)
- `Dastsc-V4/src/hooks/useStationDistanceDebug.ts` (60 L)
- `Dastsc-V4/src/hooks/useManualOcrCapture.ts` (51 L)
- `Dastsc-V4/src/hooks/useTrainProfile.ts` (41 L)
- `Dastsc-V4/src/hooks/useBrakeStats.ts` (40 L)

### `src/lib/` — 940 L

- `Dastsc-V4/src/lib/sessionDiagnostic.ts` (377 L)
- `Dastsc-V4/src/lib/brakeLearningUtils.ts` (259 L)
- `Dastsc-V4/src/lib/profileCompleteness.ts` (191 L)
- `Dastsc-V4/src/lib/profileBrake.ts` (65 L)
- `Dastsc-V4/src/lib/agentSettings.ts` (41 L)
- `Dastsc-V4/src/lib/commandTypes.ts` (7 L)

### `debug/_plantillas/` — 96 L

- `docs/debug/_plantillas/sesion.md` (40 L)
- `docs/debug/_plantillas/issue.md` (35 L)
- `docs/debug/_plantillas/checklist-semana.md` (21 L)

### `debug/semana-01-lua-ipc/` — 51 L

- `docs/debug/semana-01-lua-ipc/checklist.md` (24 L)
- `docs/debug/semana-01-lua-ipc/README.md` (17 L)
- `docs/debug/semana-01-lua-ipc/issues.md` (10 L)

### `debug/semana-02-telemetria-kernel/` — 44 L

- `docs/debug/semana-02-telemetria-kernel/README.md` (22 L)
- `docs/debug/semana-02-telemetria-kernel/checklist.md` (21 L)
- `docs/debug/semana-02-telemetria-kernel/issues.md` (1 L)

### `debug/semana-03-backend-comandos/` — 38 L

- `docs/debug/semana-03-backend-comandos/checklist.md` (23 L)
- `docs/debug/semana-03-backend-comandos/README.md` (14 L)
- `docs/debug/semana-03-backend-comandos/issues.md` (1 L)

### `debug/semana-04-agente-frenado/` — 260 L

- `docs/debug/semana-04-agente-frenado/brake-module.md` (179 L)
- `docs/debug/semana-04-agente-frenado/checklist.md` (38 L)
- `docs/debug/semana-04-agente-frenado/README.md` (29 L)
- `docs/debug/semana-04-agente-frenado/issues.md` (14 L)

### `debug/semana-05-agente-estacion/` — 80 L

- `docs/debug/semana-05-agente-estacion/checklist.md` (42 L)
- `docs/debug/semana-05-agente-estacion/README.md` (33 L)
- `docs/debug/semana-05-agente-estacion/issues.md` (5 L)

### `debug/semana-06-auto-v4/` — 38 L

- `docs/debug/semana-06-auto-v4/checklist.md` (19 L)
- `docs/debug/semana-06-auto-v4/README.md` (18 L)
- `docs/debug/semana-06-auto-v4/issues.md` (1 L)

### `debug/semana-07-icet/` — 38 L

- `docs/debug/semana-07-icet/checklist.md` (23 L)
- `docs/debug/semana-07-icet/README.md` (14 L)
- `docs/debug/semana-07-icet/issues.md` (1 L)

### `debug/semana-08-class323/` — 42 L

- `docs/debug/semana-08-class323/checklist.md` (32 L)
- `docs/debug/semana-08-class323/README.md` (9 L)
- `docs/debug/semana-08-class323/issues.md` (1 L)

### `debug/semana-09-generico-nuevos/` — 40 L

- `docs/debug/semana-09-generico-nuevos/README.md` (21 L)
- `docs/debug/semana-09-generico-nuevos/checklist.md` (18 L)
- `docs/debug/semana-09-generico-nuevos/issues.md` (1 L)

### `debug/semana-10-aceleracion-futuro/` — 23 L

- `docs/debug/semana-10-aceleracion-futuro/README.md` (17 L)
- `docs/debug/semana-10-aceleracion-futuro/checklist.md` (5 L)
- `docs/debug/semana-10-aceleracion-futuro/issues.md` (1 L)

### `src/brake/` — 2,641 L
- **← desde:** `src/`

- `nexus-agent/src/brake/planBrake.ts` (918 L)
- `nexus-agent/src/brake/planBrake.test.ts` (479 L)
- `nexus-agent/src/brake/stationBrake.test.ts` (289 L)
- `nexus-agent/src/brake/planBrake.golden.test.ts` (242 L)
- `nexus-agent/src/brake/types.ts` (123 L)
- `nexus-agent/src/brake/agentConfig.ts` (107 L)
- `nexus-agent/src/brake/signalBrake.test.ts` (83 L)
- `nexus-agent/src/brake/brakeLearning.ts` (82 L)
- `nexus-agent/src/brake/schedule.ts` (82 L)
- `nexus-agent/src/brake/physics.ts` (77 L)
- `nexus-agent/src/brake/brakeLearning.test.ts` (60 L)
- `nexus-agent/src/brake/brakeStats.ts` (37 L)
- `nexus-agent/src/brake/brakeStats.test.ts` (33 L)
- `nexus-agent/src/brake/agentConfig.test.ts` (25 L)
- `nexus-agent/src/brake/signalUtils.ts` (4 L)

### `src/command/` — 1,052 L
- **← desde:** `src/`

- `nexus-agent/src/command/commandBus.test.ts` (649 L)
- `nexus-agent/src/command/commandBus.ts` (403 L)

### `src/normalizers/` — 455 L
- **← desde:** `src/`

- `nexus-kernel/src/normalizers/PhysicsNormalizer.ts` (169 L)
- `nexus-kernel/src/normalizers/BrakeNormalizer.ts` (141 L)
- `nexus-kernel/src/normalizers/SignalingNormalizer.ts` (128 L)
- `nexus-kernel/src/normalizers/Constants.ts` (17 L)

### `src/tail/` — 175 L

- `nexus-kernel/src/tail/tailProtectionUtils.ts` (136 L)
- `nexus-kernel/src/tail/TailProtectionService.ts` (39 L)

### `src/tests/` — 469 L

- `nexus-kernel/src/tests/normalize.test.ts` (297 L)
- `nexus-kernel/src/tests/inferActiveCab.test.ts` (74 L)
- `nexus-kernel/src/tests/limitUtils.test.ts` (59 L)
- `nexus-kernel/src/tests/safety.test.ts` (39 L)

### `genres/` — 117 L

- `profiles/nexus/genres/passenger.json` (59 L)
- `profiles/nexus/genres/high_speed_express.json` (33 L)
- `profiles/nexus/genres/regional_commuter.json` (25 L)

### `trains/` — 176 L

- `profiles/nexus/trains/icet.json` (94 L)
- `profiles/nexus/trains/class323.json` (82 L)

### `debug/semana-01-lua-ipc/sesiones/` — 51 L

- `docs/debug/semana-01-lua-ipc/sesiones/2026-08-08.md` (51 L)

### `debug/semana-02-telemetria-kernel/sesiones/` — 55 L

- `docs/debug/semana-02-telemetria-kernel/sesiones/2026-08-09.md` (55 L)
