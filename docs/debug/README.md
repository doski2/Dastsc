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
| 1        | [semana-01-lua-ipc](./semana-01-lua-ipc/)                       | Enlace TSC estable, Lua v12 (Effort/BC Acela) |
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
- Eventos **`ocr_capture`**: lectura OCR bajo demanda (no hay intervalo fijo). Tipos:

  - `door_anchor` — cierre de puertas
  - `initial_anchor` — inicio de tramo (OCR ≥ 400 m)
  - `mid_leg_correction` — tramos > 5 km (hasta 3 checkpoints)
  - `near_correction` — ≤ 400 m (una vez por tramo)
  - **`manual_anchor`** — botón «Anclar OCR» en V4: waypoints, pasos por (~1 mi / ~5 mi en Acela WB),
    cambio de destino HUD; flujo previsto en mercancías (más común que en pasajeros)

  Tras cada intento (éxito o rechazo) hay **cooldown 60 s**. En tramos largos se acepta OCR **por
  encima** del odómetro hasta ~250 m / 8 % restante (`rejected_jump` = fuera de margen).

- **Backlog y prioridades:** [PENDIENTES_V4.md](../PENDIENTES_V4.md)

- **UI Agent (V4):** barra fija `DriveHudBar` bajo el header (velocidad, límite, cadena de
  cartéles, cola, **Anclar OCR**). Layout `xl`: agente + horizonte a la izquierda;
  `BrakePlanPanel` a la derecha (gradiente +/−, raw vs plan, telemetría freno, muescas H/M/B).

- Eventos **`backend_tick`**: respaldo cada ~2.5 s desde GetData si V4 no vuelca ticks (freno,

  velocidad, señal).

### Campos clave en `tick_change` (log sano)

| Campo | Uso |
| ----- | --- |
| `gradient` | ‰ que usa el agente (`TelemetrySnapshot.gradient`) |
| `gradientPct` | % legible (‰ / 10) — suficiente para analizar pendiente en sesión |
| `limits.upcoming` | Cadena UK 90→75→25 post-mortem |
| `brake.tractiveKn`, `brake.effortKn`, `brake.cylinder` | Respuesta freno (Acela / UK) |
| `agent.headline`, `agent.horizon`, `agent.activeStep` | Plan urgente (sin duplicar `brakePlan` completo) |

Evento **`gradient_sign`**: solo al pulsar **+ directo** / **− invertir** en `BrakePlanPanel`
(campo `from` / `to`). No se registra `rawGradient` ni ratio UK por tick.

- En cada tick V4, bloque **`station`**: `source` (`lua` vs `ocr_tracker`), `nameOcr`, `anchorM`,

  `driftM`, `luaDistanceM`.

## Reglas de oro

- **Lua**: no refactor; solo fix mínimo con `NexusLuaVersion` incrementado.
- **Géneros operativos:** `profiles/nexus/genres/regional_commuter.json`, `high_speed_express.json`

  (ver [NEXUS_V4_ARQUITECTURA.md §8.5](../NEXUS_V4_ARQUITECTURA.md)).

- **Base pasajeros:** `profiles/nexus/genres/passenger.json` (oculto en selector).
- **Perfil ICE T:** `profiles/nexus/trains/icet.json` → extiende `high_speed_express`.
- **Perfil 323:** `profiles/nexus/trains/class323.json` → extiende `regional_commuter`.
- Si el bug es solo de un tren, no tocar `commandBus.ts` — ajustar `agent_config` o perfil primero.
