# Semana 6 — AUTO en V4

**Objetivo**: flujo SUGGEST → ARM → AUTO estable en UI.

## Archivos

| Archivo                                       | Rol                                    |
| --------------------------------------------- | -------------------------------------- |
| `Dastsc-V4/src/hooks/useAgent.ts`             | Tick, perfil, WS                       |
| `Dastsc-V4/src/hooks/useAutoCommand.ts`       | Reintento NEU                          |
| `Dastsc-V4/src/components/AppShell.tsx`       | Layout fijo + scroll en `main`         |
| `Dastsc-V4/src/components/DriveHudBar.tsx`    | Barra fija: velocidad, límites, cola   |
| `Dastsc-V4/src/components/BrakePlanPanel.tsx` | Plan frenada; gradiente +/−; muescas H/M/B; telemetría freno |
| `Dastsc-V4/src/components/ConfigView.tsx`     | Perfil, política                       |
| `Dastsc-V4/src/lib/agentSettings.ts`          | Persistencia local (política, gradient sign) |
| `Dastsc-V4/src/lib/sessionDiagnostic.ts`      | Payload `tick_change` (gradient, brake) |

## Checklist → [checklist.md](./checklist.md)
