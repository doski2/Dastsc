# Checklist — Semana 5 Estación

## Pre-vuelo

- [ ] Revisar `agent_config.station` en perfil activo

## Funcional

- [ ] 1ª parada: freno se mantiene hasta parar
- [ ] 2ª parada: no NEU en bucle en andén
- [ ] Salida: NEU una vez al superar `departure_speed_ms`
- [ ] `StationDistance` salta a siguiente estación (50 km+) sin quedarse en 0
- [ ] Horario: no frena demasiado pronto si ETA holgado

## Ajuste sin código

- [ ] Probar `release_block_speed_ms` / `dwell_max_distance_m` en `icet.json`

## Cierre

- [ ] Documentar valores finales en notas de sesión
