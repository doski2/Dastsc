# Semana 5 — Agente: estación

**Objetivo**: parar, mantener freno, salir sin NEU espurio, distancia OCR coherente.

## Planificación estación (`brake/`)

| Archivo                                 | Rol                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| `nexus-agent/src/brake/planBrake.ts`    | `planBrakeForStation`, `planStationFinalStop`, `shouldSuppressStationBrakingForDeparture` |
| `nexus-agent/src/brake/agentConfig.ts`  | `dwell_max_distance_m`, `final_stop_max_distance_m`, …                                    |
| `nexus-agent/src/brake/schedule.ts`     | ETA → coast / reaction en parada                                                          |
| `nexus-agent/src/command/commandBus.ts` | `shouldBlockAutoReleaseForStation`, hold andén                                            |

## Distancia estación (backend, no en `brake/`)

| Archivo                                      | Rol                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `Dastsc-V3/backend/core/station_distance.py` | OCR + odómetro, giro cabina, `mid_leg` / `near_correction`, tolerancia deriva al alza |
| `Dastsc-V3/backend/core/ocr_hud.py`          | Captura HUD próxima parada                                                            |

Guía completa plan + escenarios:
[semana-04/brake-module.md](../semana-04-agente-frenado/brake-module.md).

## Perfiles

| Archivo                                | Rol                                             |
| -------------------------------------- | ----------------------------------------------- |
| `profiles/nexus/genres/passenger.json` | `agent_config` base                             |
| `profiles/nexus/trains/class323.json`  | Overrides 323 (`final_stop_max_distance_m: 35`) |
| `profiles/class390_expert.json`        | Class 390 legacy + muescas capturadas (WCML)    |
| `profiles/nexus/trains/icet.json`      | Overrides ICE T                                 |

## Checklist → [checklist.md](./checklist.md)
