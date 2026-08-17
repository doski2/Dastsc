# Documentación del proyecto — índice

**Producto activo:** Nexus V4 (`Dastsc-V4` + `nexus-agent` + `nexus-kernel`)
**Backend compartido:** `Dastsc-V3/backend` (FastAPI, OCR, WebSocket, perfiles)
**Legacy visual:** V3 PILOT (`Dastsc-V3/src`, puerto 5173) — referencia, no fuente de verdad del
agente

**Última revisión:** 17 de agosto de 2026

---

## Documentos canónicos (leer en este orden)

| Documento                                                | Contenido                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| [NEXUS_V4_ARQUITECTURA.md](./NEXUS_V4_ARQUITECTURA.md)   | Capas, modos SUGGEST/ARM/AUTO, contratos, perfiles, puertos        |
| [PENDIENTES_V4.md](./PENDIENTES_V4.md)                   | Backlog priorizado (P0–P3) y orden de ejecución                    |
| [debug/README.md](./debug/README.md)                     | Depuración semanal en TSC, logs de sesión, checklist               |
| [METRICAS_TELEMETRIA_V3.md](./METRICAS_TELEMETRIA_V3.md) | Campos GetData, OCR, convenciones de signo (referencia telemetría) |
| [GUIA_TECNICA_IPC.md](./GUIA_TECNICA_IPC.md)             | Lua, GetData.txt, SendCommand.txt, RailDriver                      |
| [GUIA_PERFILES_V3.md](./GUIA_PERFILES_V3.md)             | Crear perfiles JSON, captura de mandos                             |

---

## Referencia por capa

| Capa         | Ruta principal                                                             |
| ------------ | -------------------------------------------------------------------------- |
| Lua TSC      | `lua/Railworks_GetData_Script.lua`                                         |
| Backend      | `Dastsc-V3/backend/main.py`, `core/station_distance.py`, `core/ocr_hud.py` |
| Kernel       | `nexus-kernel/`                                                            |
| Agente       | `nexus-agent/`                                                             |
| UI V4        | `Dastsc-V4/` (puerto **5175**)                                             |
| Perfiles     | `profiles/` + `profiles/nexus/genres/` + `profiles/nexus/trains/`          |
| Herramientas | `nexus-profile-wizard.py`, `nexus-debug.py`                                |

---

## Perfiles y géneros operativos

Jerarquía actual (comportamiento AUTO, **sin** mezclar muescas):

```text
```

Detalle: [NEXUS_V4_ARQUITECTURA.md §8.5](./NEXUS_V4_ARQUITECTURA.md).

---

## Logs de sesión V4

- Carpeta: `logs/nexus-v4/session_*.json`
- Log **sano** (objetivo): `meta.source: v4_session`, eventos `tick` / `tick_change`, bloques

  `agent.*`, `limits.upcoming`

- Por tick: `gradient` (‰), `gradientPct` (%), `brake.tractiveKn` / `effortKn` / `cylinder`
- Cambio signo gradiente: evento `gradient_sign` (no repetir por tick)
- Respaldo si V4 no conecta: `backend_tick` + `ocr_capture` (ver P0.1 en

  [PENDIENTES_V4.md](./PENDIENTES_V4.md))

- OCR: `door_anchor`, `initial_anchor`, `mid_leg_correction`, `near_correction`, **`manual_anchor`**

  (botón UI en `DriveHudBar`)

Detalle de campos: [NEXUS_V4_ARQUITECTURA.md §4.6](./NEXUS_V4_ARQUITECTURA.md).

---

## Deprecado / no duplicar aquí

- **Curva de frenado v5 / BrakingCurve.tsx** — lógica migrada a `nexus-agent` (`planBrake.ts`); V3

  PILOT solo comparación visual.

- **`core/station_tracker.py`** — renombrado a `core/station_distance.py`.
- **Checklists «Fase 5» / hitos 2025–2026** — sustituidos por

  [PENDIENTES_V4.md](./PENDIENTES_V4.md).

- **[ESPECIFICACION_ULTRA_CORE_V4.md](./ESPECIFICACION_ULTRA_CORE_V4.md)** — solo campos del plugin

  Lua; arquitectura de producto en NEXUS V4.

---

## Puertos

| Servicio          | Puerto |
| ----------------- | ------ |
| Backend FastAPI   | 8000   |
| Nexus V4          | 5175   |
| V3 PILOT (legacy) | 5173   |
