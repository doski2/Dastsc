# Checklist — Semana 8 Class 323

Perfil: `profiles/nexus/trains/class323.json` · plan:
[brake-module.md](../semana-04-agente-frenado/brake-module.md).

## Pre-vuelo

- [ ] `npm test -- --run` agente + `test_station_distance` backend
- [ ] `agent_config` 323: `final_stop_max_distance_m: 35`, `terminal_approach_distance_m: 90`

## Frenado línea

- [ ] B3/B2/B1/OFF en línea (combined `ThrottleAndBrake`)
- [ ] `isBrakeApplied` por `combined` negativo
- [ ] Calibración `profile=class323` en backend
- [ ] No OFF a ~35 m en aproximación estación con límite 45 mph cumplido

## Estación Cross City

- [ ] Parada habitual: ≤ 35 m residual (no ~27 m sistemático)
- [ ] Mantiene freno en andén (OFF no prematuro)
- [ ] Cabecera: giro cabina → salida sin frenada fantasma
- [ ] OCR: ancla siguiente estación solo si HUD > ~400 m

## Comparar con ICE T

- [ ] Mismo `agent_config` base pasajeros; solo difiere mando combinado
- [ ] Tests ICE T siguen verdes

## Cierre

- [ ] Log `session_*.json` archivado · no romper ICE T
