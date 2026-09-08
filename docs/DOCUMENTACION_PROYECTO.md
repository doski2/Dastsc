# Documentación del proyecto — índice

**Producto activo:** Nexus V4 (`Dastsc-V4` + `nexus-agent` + `nexus-kernel`)
**Backend compartido:** `Dastsc-V3/backend` (FastAPI, OCR, WebSocket, perfiles, AUTO sidecar)
**V3 PILOT retirado (2026-09-08):** `Dastsc-V3/src` puerto 5173 — **no arrancar ni mantener**;
código conservado en repo solo como archivo. Fuente de verdad: V4 + `nexus-agent`.

**Última revisión:** 2026-09-08

---

## AUTO — flujo directo (prioridad)

Menos pasos entre telemetría y mando en TSC. Documento maestro:

| Documento | Contenido |
| --- | --- |
| [FLUJO_DIRECTO_V4.md](./FLUJO_DIRECTO_V4.md) | Objetivo 4 pasos, fases, criterios de éxito |
| [flujo_directo_v4.svg](./flujo_directo_v4.svg) | Diagrama corto (loop caliente AUTO) |
| [FLUJO_FRENOS_V4.md](./FLUJO_FRENOS_V4.md) | Árbol completo actual (15 pasos, análisis) |

**Fase 1 (2026-08-25):** muescas APPLY sin espera 2 s — escalado B3→B2 inmediato; reintento NEU 2 s.

**Dedup apply (2026-08-25):** reassert 500 ms hasta `isBrakeApplied` — `autoCommandDispatch.ts` +
`auto_loop.py` (SendCommand one-shot). Ver [FLUJO_FRENOS_V4.md](./FLUJO_FRENOS_V4.md) § paso 13 SVG.

**Fase 2 (2026-08-25):** `tickAgent` + mando en `telemetry_reader` cuando modo AUTO y sidecar OK.

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
| [TIPOS_DE_FRENOS.md](./TIPOS_DE_FRENOS.md)               | `brakes.type`, mandos SPLIT/blended, relación con AUTO V4          |
| [FLUJO_DIRECTO_V4.md](./FLUJO_DIRECTO_V4.md)             | AUTO: camino corto decisión → SendCommand                          |
| [FLUJO_FRENOS_V4.md](./FLUJO_FRENOS_V4.md)               | Árbol cronológico completo (análisis detallado)                    |
| [flujo_directo_v4.svg](./flujo_directo_v4.svg)           | Diagrama 4 pasos (objetivo AUTO)                                   |
| [flujo_frenos_v4.svg](./flujo_frenos_v4.svg)             | Diagrama 15 pasos (flujo actual)                                   |

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

## V3 PILOT — retirado (2026-09-08)

Decisión: **abandonar el frontend V3 PILOT** (`Dastsc-V3/src`, puerto 5173). Motivos:

- Duplicación con `nexus-kernel` (DataNormalizer) y `nexus-agent` (`planBrake`) sin alineación.
- Curva `brakingCurveUtils.ts` y learning V3 sin bandas H/M/B — stats distintas al agente V4.
- Esfuerzo de mantenimiento mejor invertido en V4 + validación AUTO en ruta.

**Qué sigue activo** (no confundir con “V3”):

| Sigue | No es PILOT |
| --- | --- |
| `Dastsc-V3/backend/` | Motor FastAPI de V4 (nombre histórico de carpeta) |
| `profiles/`, `lua/`, herramientas | Compartidos |
| `Dastsc-V4/` puerto **5175** | Única UI de producto |

**Arranque recomendado:** backend `:8000` + Nexus V4 `:5175`. No levantar `:5173`.

Pendientes P2.4 / P2.5 cerrados como *N/A — PILOT retirado* en [PENDIENTES_V4.md](./PENDIENTES_V4.md).

---

## Deprecado / no duplicar aquí

- **V3 PILOT** (`Dastsc-V3/src`, BrakingCurve, gauges) — retirado 2026-09-08; ver § arriba.
- **`core/station_tracker.py`** — renombrado a `core/station_distance.py`.
- **Checklists «Fase 5» / hitos 2025–2026** — sustituidos por

  [PENDIENTES_V4.md](./PENDIENTES_V4.md).

- **[ESPECIFICACION_ULTRA_CORE_V4.md](./ESPECIFICACION_ULTRA_CORE_V4.md)** — solo campos del plugin

  Lua; arquitectura de producto en NEXUS V4.

---

## Puertos

| Servicio                 | Puerto | Notas                          |
| ------------------------ | ------ | ------------------------------ |
| Backend FastAPI          | 8000   | Obligatorio                    |
| Nexus V4                 | 5175   | UI producto (SUGGEST/ARM/AUTO) |
| ~~V3 PILOT~~ (retirado)  | ~~5173~~ | No usar — código archivado   |
