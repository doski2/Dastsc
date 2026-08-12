# Semana 4 — Agente: frenado en línea

**Objetivo**: límites de velocidad, muescas, calibración aprendida, plan estación/señal.

## Guía del módulo `brake/`

→ **[brake-module.md](./brake-module.md)** — mapa de archivos, flujo, escenarios TSC, árbol de decisión.

## Archivos

| Archivo | Rol |
| ------- | --- |
| `nexus-agent/src/brake/planBrake.ts` | Plan cinemático, estación, cluster límite+estación |
| `nexus-agent/src/brake/physics.ts` | Constantes de planificación |
| `nexus-agent/src/brake/agentConfig.ts` | Umbrales `agent_config` |
| `nexus-agent/src/brake/schedule.ts` | Holgura ETA / coast |
| `nexus-agent/src/brake/signalUtils.ts` | Señal roja → parada |
| `nexus-agent/src/brake/brakeLearning.ts` | Decel aprendida por muesca |
| `nexus-agent/src/tick.ts` | Orquesta plan + UI agente |
| `nexus-agent/src/command/commandBus.ts` | Apply / release / hold (no está en `brake/` pero acoplado) |
| `profiles/nexus/trains/*.json` | `physics_config`, `agent_config`, muescas |

## Tests pre-vuelo

```bash
cd nexus-agent && npm test -- --run
```

## Checklist → [checklist.md](./checklist.md)
