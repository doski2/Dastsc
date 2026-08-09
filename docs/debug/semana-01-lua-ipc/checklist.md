# Checklist — Semana 1 Lua + IPC

## Pre-vuelo

- [x] `npm run test -w @nexus/kernel` (normalize, cab)
- [x] Lua en `RailWorks/plugins/` = copia de `lua/Railworks_GetData_Script.lua`

## Funcional

- [x] Nuevo escenario → `GetData.txt` con `NexusLuaVersion:11`
- [x] `SimulationTime` aumenta cada segundo
- [x] Mandos manuales libres sin AUTO (sin `NexusApplyCommands.flag` huérfano)
- [x] Purge al arrancar backend borra `SendCommand.txt` viejo
- [x] V4 muestra enlace backend + telemetría TSC en <10 s

## Regresión

- [x] No usar `SetControlTargetValue` ni `local function` masivo en Lua
- [x] `SendData()` dentro del bloque cabina con llave (`GetIsEngineWithKey == 1`)

## Cierre

- [x] Sesión documentada en `sesiones/2026-08-08.md`
- [x] Issues en `issues.md` (ninguno abierto — semana cerrada)
