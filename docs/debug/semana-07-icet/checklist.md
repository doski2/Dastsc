# Checklist — Semana 7 ICE T

## Frenado

- [ ] Acelerador a 0 al frenar (ack 3 líneas)
- [ ] NEU en límite cuando velocidad OK
- [ ] `isBrakeApplied` por posición palanca

## Estación

- [ ] Aproximación mantiene freno (no apply+release instantáneo)
- [ ] Parada 1 y 2 sin NEU en bucle
- [ ] Salida sin frenar espurio

## Perfil JSON (antes de tocar código)

- [ ] `physics_config.station_reaction_time_s`
- [ ] `agent_config.station.*`
- [ ] Muescas S1–S7 / NEU

## Cierre

- [ ] Valores finales copiados en notas de `sesiones/`
