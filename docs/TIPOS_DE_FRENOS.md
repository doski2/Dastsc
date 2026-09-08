# Tipos de freno en perfiles Nexus

**Alcance:** campo `brakes.type` y mandos asociados en `profiles/*.json`. Comportamiento AUTO
(física, learning, guards) → [NEXUS_V4_ARQUITECTURA.md](./NEXUS_V4_ARQUITECTURA.md),
[PENDIENTES_V4.md](./PENDIENTES_V4.md) (P3.5–P3.7).

**Última revisión:** 2026-08-17

---

## Qué hace hoy `brakes.type`

| Capa | Usa `brakes.type` |
| ---- | ----------------- |
| Checklist de perfil (`profile_checklist.py`) | Sí — avisa si falta el bloque |
| `planBrake` / `commandBus` (V4 AUTO) | **No** — mandan según `mappings` + muescas del perfil |
| HUD V3 PILOT | ~~Referencia visual legacy~~ — retirado 2026-09-08; usar `BrakePlanPanel` V4 |

Para AUTO importa más:

- **`mappings.brake` / `train_brake`** — control que escribe `SendCommand.txt` (p. ej.

  `VirtualBrake`,
  `TrainBrakeControl`, `ThrottleAndBrake`).

- **`specs.notches_throttle_brake`** — posiciones normalizadas 0–1 por muesca.
- **`physics_config`** — `max_braking_decel`, `brake_fill_time_s`, `reaction_time_s`.
- **`brakeStats`** — decel aprendida por muesca y **banda de velocidad** (Alta / Media / Baja).
- **`ConsistType`** (Lua) — factor de retardo en física (`lagFactor`), no el `type` del JSON.

---

## Tipos en perfiles del repo

### 1. `COMBINED_BLENDED` — mando único tracción/freno

| | |
| --- | --- |
| **Trenes** | Class 323, 375, 450 |
| **Mando típico** | `ThrottleAndBrake` (una palanca) |
| **Sim** | Mezcla dinámico + aire según velocidad/carga |
| **Perfil ejemplo** | `profiles/nexus/trains/class323.json` |
| **AUTO v1** | Muescas B1–B3 + OFF vía el control mapeado; guards BC previstos (P3.6) con `release_pressure` |

### 2. `DISCRETE_AIR` — palancas separadas (mercancías)

| | |
| --- | --- |
| **Trenes** | BR189, Class 66 |
| **Mandos** | Regulador + `TrainBrakeControl` / `EngineBrakeControl` / `DynamicBrake` |
| **Sim** | Retardo de tubo; propagación BP en consists largos |
| **Perfil ejemplo** | `profiles/br189expert.json` |
| **AUTO v1** | Frenado básico posible; **prioridad baja** — P3.6 (propagación aire) crítico en futuro |

### 3. `COMBINED_EP` — electro-neumático rápido

| | |
| --- | --- |
| **Trenes** | Class 390 Pendolino, 319 |
| **Sim** | Respuesta rápida válvulas eléctricas por vagón |
| **Notas** | Algunos perfiles UK usan `TrainBrakeControl` % sin declarar `type` explícito (350 WCML) |

### 4. `COMBINED_PZB` — integración PZB/LZB (Alemania)

| | |
| --- | --- |
| **Trenes** | BR442 Talent 2 |
| **Perfil ejemplo** | `profiles/br442_mapper_expert.json` |
| **Notas** | Similar a blended; `gradient_mode: driver` + `gradient_sign_flip` en género ICE/alta v |

### 5. `SPLIT` — acelerador y freno en controles distintos

| | |
| --- | --- |
| **Trenes** | Acela, ICE T, genérico Nexus |
| **Mandos** | `VirtualThrottle` + `VirtualBrake` (o `SimpleThrottle` + `TrainBrakeControl` en ICE T) |
| **Género** | `high_speed_express` → `"type": "SPLIT"` por defecto |
| **Perfiles** | `acelaexpressexpert.json`, `nexus/trains/icet.json` |
| **AUTO v1** | Solo **`VirtualBrake`** (porcentaje); el sim reparte dinámico/aire internamente |
| **Telemetría** | `Effort` / `TractiveEffort` (kN), BC/BP PSI — ver P3.5; **no** planificar mezcla % dinámico |

**Acela (caso especial):** no hay palanca de freno dinámico. Con ~40 % freno parado suele mandar
**aire** (`BC ≈ 63 PSI`, `Effort ≈ −28 kN`). A alta velocidad domina el **dinámico** — por eso
`brakeStats` se aprende por **banda de velocidad**, no un solo `avg_decel` por muesca.

---

## Bloque `brakes` en el JSON

Plantilla mínima (adaptar mandos con `nexus-debug.py`):

```json
```

Ejemplo **SPLIT** (Acela / alta velocidad):

```json
```

Campos útiles además de `type`:

| Campo | Uso |
| ----- | --- |
| `control` / `train_control` | Nombre del control de servicio en `mappings` |
| `release_pressure` | Umbral BC para soltar OFF (323 → 5 bar) — P3.6 |
| `system` | Etiqueta documental (`AIR_BRITISH`, `AIR_GERMAN`, …) |
| `has_dynamic` | Documentación; no activa lógica dinámica en el agente |
| `response_speed` | Documentación (`FAST`, `GRADUATED_PERCENT`, …) |

`dynamic_brake_ratio` en género **no** lo usa `planBrake` — solo referencia de diseño.

---

## Relación con telemetría y UI V4

| Tipo | Feedback en `BrakePlanPanel` | Notas |
| ---- | ------------------------------ | ----- |
| UK blended (323) | `cylinder`, `effortKn`, palanca % | BC en bar/PSI según perfil |
| SPLIT (Acela) | `tractiveKn`, `cylinder`, banda v H/M/B | Alias Lua `Effort` → `TractiveEffort` (v12) |
| Mercancías | BC/BP críticos | Guards P3.6 prioritarios cuando haya AUTO freight |

El agente **no** simula el llenado de tubo ni la mezcla dinámico/aire del sim — planifica con
`brake_fill_time_s` + stats aprendidas; el cierre del bucle con presión es trabajo incremental
(P3.6).

---

## Referencias

- Perfiles y captura de muescas: [GUIA_PERFILES_V3.md](./GUIA_PERFILES_V3.md)
- Campos GetData (BC, Effort): [METRICAS_TELEMETRIA_V3.md](./METRICAS_TELEMETRIA_V3.md)
- Backlog guards aire / Acela: [PENDIENTES_V4.md](./PENDIENTES_V4.md) § P3.5–P3.7
