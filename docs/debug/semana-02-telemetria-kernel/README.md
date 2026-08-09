# Semana 2 — Telemetría (kernel)

**Objetivo**: snapshot fiable para frenado y estación.

**Estado**: ✅ Cerrada (2026-08-09) — ver [sesiones/2026-08-09.md](./sesiones/2026-08-09.md).

## Archivos

| Archivo                                      | Rol                                |
| -------------------------------------------- | ---------------------------------- |
| `nexus-kernel/src/DataNormalizer.ts`         | Normalización raw → TelemetryData  |
| `nexus-kernel/src/dataNormalizerUtils.ts`    | `stickyStationDistance`, combined  |
| `nexus-kernel/src/toSnapshot.ts`             | `brake.position`, estación         |
| `nexus-kernel/src/tests/normalize.test.ts`   | Tests                              |
| `Dastsc-V3/backend/core/station_distance.py` | OCR tracker + `mid_leg_correction` |
| `Dastsc-V3/backend/core/cab_inference.py`    | Cabina activa + latch              |

## Checklist → [checklist.md](./checklist.md)

## Siguiente semana

→ [Semana 3 — Backend y comandos](../semana-03-backend-comandos/)
