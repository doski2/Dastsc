# Checklist — Semana 5 Estación

Plan en `brake/` · distancia en backend · mando en `commandBus`. Ver
[brake-module.md](../semana-04-agente-frenado/brake-module.md).

## Pre-vuelo

- [ ] `agent_config.station` del perfil activo (`passenger.json` + override tren)
- [ ] `npm test -- --run src/brake/stationBrake.test.ts`
- [ ] Backend: `python -m unittest tests.test_station_distance -v`

## Llegada

- [ ] 1ª parada: freno se mantiene hasta parar (no OFF prematuro)
- [ ] Parada ≤ 35 m del marcador (323 con `final_stop_max_distance_m: 35`)
- [ ] `near_correction` acepta OCR más corto que odómetro (log `ocr_capture`)
- [ ] Horario holgado: no frena demasiado pronto lejos; sin coast < 100 m

## Dwell (andén)

- [ ] 2ª parada: no NEU en bucle en andén
- [ ] `shouldBlockAutoReleaseForStation` con freno aplicado en zona andén

## Giro de cabina (cabecera)

- [ ] Tras giro: distancia `none` o ancla larga (> 400 m) al cerrar puertas
- [ ] Rechazo `door_anchor` 80–130 m residual (log `rejected_jump`)
- [ ] Salida con tracción: sin plan estación / parada final espuria
- [ ] Cabina 1↔2 o reverser: tracker clear si < 150 m

## Salida

- [ ] NEU/OFF solo al superar `departure_speed_ms` con distancia válida
- [ ] `StationDistance` siguiente tramo (km+) sin quedarse en 0

## Ajuste sin código

- [ ] Probar en JSON: `release_block_speed_ms`, `dwell_max_distance_m`, `final_stop_max_distance_m`

## Cierre

- [ ] Sesión `sesiones/AAAA-MM-DD.md` + valores finales documentados
