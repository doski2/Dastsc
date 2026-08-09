# Semana 2 — Telemetría (kernel)

**Objetivo**: snapshot fiable para frenado y estación.

## Archivos

| Archivo                                    | Rol                               |
| ------------------------------------------ | --------------------------------- |
| `nexus-kernel/src/DataNormalizer.ts`       | Normalización raw → TelemetryData |
| `nexus-kernel/src/dataNormalizerUtils.ts`  | `stickyStationDistance`, combined |
| `nexus-kernel/src/toSnapshot.ts`           | `brake.position`, estación        |
| `nexus-kernel/src/tests/normalize.test.ts` | Tests                             |

## Checklist → [checklist.md](./checklist.md)
