# Checklist — Semana 4 Frenado (`nexus-agent/src/brake`)

Ver [brake-module.md](./brake-module.md) para escenarios detallados.

## Pre-vuelo

- [ ] `cd nexus-agent && npm test -- --run` (78 tests agente)
- [ ] Perfil activo conocido (`class323` / `icet`)
- [ ] Log V4 activo (`logs/nexus-v4/session_*.json` con ticks, no solo `backend_tick`)

## Límite de velocidad

- [ ] AUTO frena antes del cartel (B3/B2 según tren)
- [ ] NEU/OFF al alcanzar velocidad objetivo + margen
- [ ] No re-frena en coast tras OFF correcto (latch límite en `commandBus`)
- [ ] Límite + estación < 350 m: un plan urgente (no doble frenada contradictoria)

## Estación (plan `brake/` — ejecución en sem. 5)

- [ ] No suelta OFF a 30–40 m solo porque el límite de línea ya se cumple
- [ ] B3 en últimos ~50 m si aún hay velocidad
- [ ] Parada final hasta `final_stop_max_distance_m` (323: 35 m)
- [ ] Giro cabina: `shouldSuppressStationBrakingForDeparture` — sin plan estación fantasma

## Calibración

- [ ] Stats aprendidas mejoran plan (`brakeLearning`, backend `profile=` en sesión)
- [ ] Ajustes de `physics_config` / `agent_config` en JSON del tren antes de tocar TS

## Por perfil

- [ ] ICE T: split, `isBrakeApplied` por `position` — [semana-07](../semana-07-icet/)
- [ ] 323: combined negativo — [semana-08](../semana-08-class323/)

## Cierre

- [ ] Sesión en `sesiones/AAAA-MM-DD.md`
- [ ] Bugs en [issues.md](./issues.md)
