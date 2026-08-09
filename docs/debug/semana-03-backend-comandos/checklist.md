# Checklist — Semana 3 Backend

## Pre-vuelo

- [ ] `python -m pytest Dastsc-V3/backend/tests/test_command_bus.py -q`
- [ ] `python -m pytest Dastsc-V3/backend/tests/test_profiles_nexus.py -q`

## Funcional

- [ ] Perfil AUTO detecta ICE T vs 323 vs genérico
- [ ] Selector V4 muestra solo 3 perfiles Nexus
- [ ] Ack ICE T al frenar: 3 líneas (`SimpleThrottle:0`, `VirtualBrake`, `TrainBrakeControl`)
- [ ] Ack 323: una línea `ThrottleAndBrake`
- [ ] Purge WebSocket al pasar a SUGGEST
- [ ] Flag `NexusApplyCommands.flag` solo con ARM/AUTO

## Regresión

- [ ] `EmergencyBrake` nunca se envía sin policy explícita

## Cierre

- [ ] Sesión en `sesiones/`
