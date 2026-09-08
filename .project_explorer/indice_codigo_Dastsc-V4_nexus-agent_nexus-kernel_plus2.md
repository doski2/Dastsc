# Índice de código — Dastsc — `Dastsc-V4 | scripts | node_modules (+2 más)`

- **Archivos indexados:** 82
- **Líneas de código:** 10,288

## Carpetas incluidas

- `Dastsc-V4`
- `scripts`
- `node_modules`
- `nexus-kernel`
- `nexus-agent`

## Flujo de datos entre módulos

- `Dastsc-V4/src/` → `Dastsc-V4/src/components/` (8) — App.tsx→AgentHeadline.tsx, App.tsx→ArmActionBar.tsx, App.tsx→AppShell.tsx, App.tsx→BrakePlanPanel.tsx
- `nexus-kernel/src/` → `nexus-kernel/src/normalizers/` (8) — DataNormalizer.ts→Constants.ts, DataNormalizer.ts→PhysicsNormalizer.ts, DataNormalizer.ts→SignalingNormalizer.ts, DataNormalizer.ts→BrakeNormalizer.ts
- `nexus-agent/src/` → `nexus-agent/src/brake/` (5) — horizon.ts→signalUtils.ts, tick.ts→agentConfig.ts, tick.ts→physics.ts, tick.ts→signalUtils.ts
- `Dastsc-V4/src/` → `Dastsc-V4/src/hooks/` (3) — App.tsx→useManualOcrCapture.ts, App.tsx→useAgent.ts, App.tsx→useStationDistanceDebug.ts
- `nexus-agent/src/` → `nexus-agent/src/command/` (1) — tick.ts→commandBus.ts

## Puntos de entrada

- `Dastsc-V4/package.json`
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
