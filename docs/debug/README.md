# Depuración semanal — Nexus V4

Índice de sesiones de depuración en TSC. **Una semana = un subsistema.** No mezclar capas en la
misma sesión.

## Cómo usar

1. Abre la carpeta de la semana (`semana-NN-…`).
2. Copia `_plantillas/sesion.md` → `sesiones/AAAA-MM-DD.md` y rellena al probar.
3. Marca el `checklist.md` de la semana.
4. Si encuentras un bug, anótalo en `issues.md` de esa semana (no en chat suelto).

## Mapa rápido del repo

| Capa         | Ruta                                                                | Semanas   |
| ------------ | ------------------------------------------------------------------- | --------- |
| Lua TSC      | `lua/Railworks_GetData_Script.lua`                                  | 01        |
| Backend IPC  | `Dastsc-V3/backend/`                                                | 01, 02    |
| Kernel       | `nexus-kernel/`                                                     | 02, 03    |
| Agente       | `nexus-agent/`                                                      | 04, 05    |
| UI V4        | `Dastsc-V4/`                                                        | 06        |
| Perfiles     | `profiles/` (legacy + `profiles/nexus/`)                            | 07, 08    |
| Herramientas | `nexus-debug.py`, `nexus-profile-wizard.py`, `Asistente_Perfil.bat` | 07        |

## Calendario sugerido

| Semana   | Carpeta                                                         | Objetivo                                 |
| -------- | --------------------------------------------------------------- | ---------------------------------------- |
| 1        | [semana-01-lua-ipc](./semana-01-lua-ipc/)                       | Enlace TSC estable, Lua v11 congelado    |
| 2        | [semana-02-telemetria-kernel](./semana-02-telemetria-kernel/)   | Snapshot correcto (cab, freno, estación) |
| 3        | [semana-03-backend-comandos](./semana-03-backend-comandos/)     | SendCommand, perfiles, WebSocket         |
| 4        | [semana-04-agente-frenado](./semana-04-agente-frenado/)         | Plan límite, muescas, calibración        |
| 5        | [semana-05-agente-estacion](./semana-05-agente-estacion/)       | Parada, dwell, salida, NEU               |
| 6        | [semana-06-auto-v4](./semana-06-auto-v4/)                       | AUTO end-to-end en UI                    |
| 7        | [semana-07-icet](./semana-07-icet/)                             | ICE T (split brake) completo             |
| 8        | [semana-08-class323](./semana-08-class323/)                     | Class 323 (combinado) completo           |
| 9        | [semana-09-generico-nuevos](./semana-09-generico-nuevos/)       | Genérico + alta de tren nuevo            |
| 10       | [semana-10-aceleracion-futuro](./semana-10-aceleracion-futuro/) | Reservado: AUTO acelerador               |

## Tests antes de cada sesión TSC

```bash
```

Guía detallada módulo frenado:
[semana-04-agente-frenado/brake-module.md](./semana-04-agente-frenado/brake-module.md).

## Logs automáticos de sesión V4

Cada vez que abres Nexus V4 con el backend activo se guarda un log en `logs/nexus-v4/`
(rotación: **últimos 5**). Incluye telemetría, plan del agente, comandos y acks.

- Descarga desde **Config → Logs de sesión** en la UI, o copia `logs/nexus-v4/session_*.json`.
- Pásale el JSON al asistente para análisis comparativo entre sesiones.
- Eventos **`ocr_capture`**: lectura OCR bajo demanda (no hay intervalo fijo). Se registran en

`door_anchor` (cierre de puertas), `initial_anchor` (inicio de tramo en señal/siding, OCR ≥ 400 m),
  `mid_leg_correction` (tramos > 5 km, hasta 3 checkpoints) y
  `near_correction` (≤ 400 m). Incluyen texto parseado, distancia en metros y estado del tracker.
  Tras cada intento (éxito o rechazo) hay **cooldown 60 s**. En tramos largos se acepta OCR **por
  encima** del odómetro hasta ~250 m / 8 % restante (`rejected_jump` = fuera de margen).

- **UI Agent (V4):** barra fija `DriveHudBar` bajo el header (velocidad, límite, próximo límite,

cola). El plan de frenada desplegado hace scroll interno — no empuja la telemetría fuera de
pantalla.

- Eventos **`backend_tick`**: respaldo cada ~2.5 s desde GetData si V4 no vuelca ticks (freno,

  velocidad, señal).

- En cada tick V4, bloque **`station`**: `source` (`lua` vs `ocr_tracker`), `nameOcr`, `anchorM`,

  `driftM`, `luaDistanceM`.

## Reglas de oro

- **Lua**: no refactor; solo fix mínimo con `NexusLuaVersion` incrementado.
- **Perfil ICE T**: `profiles/nexus/trains/icet.json` (+ `agent_config` / `physics_config`).
- **Perfil 323**: `profiles/nexus/trains/class323.json`.
- **Comportamiento común pasajeros**: `profiles/nexus/genres/passenger.json`.
- Si el bug es solo de un tren, no tocar `commandBus.ts` — ajustar `agent_config` primero.
