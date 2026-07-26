# Nexus V4 — Arquitectura y diseño (borrador)

**Estado:** diseño · junio 2026
**Relación con V3:** V3 se congela como motor de telemetría + vista PILOT legacy. V4 es producto
nuevo AI-first.

---

## 1. Principio rector

> **La pantalla principal no es el velocímetro: es el Agente.**

El maquinista abre Nexus y ve primero **qué hacer ahora**, **por qué**, y **cuánto margen queda** —
no un grid de widgets.

| V3                    | V4                                        |
| --------------------- | ----------------------------------------- |
| HUD PILOT como home   | **Agent Panel** como home                 |
| IA = pestaña vacía    | IA = capa `nexus-agent` + UI protagonista |
| Lógica + UI mezcladas | Kernel puro → Agente → UI delgada         |
| Crecimiento orgánico  | Contratos fijos desde el día 1            |

---

## 2. Personas y modos

| Modo                  | Usuario                         | Comportamiento                                              |
| --------------------- | ------------------------------- | ----------------------------------------------------------- |
| **SUGGEST** (default) | Conductor humano                | Texto + horizonte + mini-HUD. Sin comandos al sim.          |
| **ARM**               | Conductor avanzado              | Sugiere acción; un clic confirma envío a `SendCommand.txt`. |
| **AUTO**              | Entrenamiento / rutas conocidas | Agente envía comandos con límites de seguridad estrictos.   |

La política (`SUGGEST` / `ARM` / `AUTO`) vive en el **perfil del tren**, no hardcodeada en la UI.

---

## 3. Arquitectura en capas

```text
```

**Regla:** `nexus-agent` y `nexus-kernel` no importan React. Tests unitarios sin navegador.

---

## 4. Contratos de datos

### 4.1 `TelemetrySnapshot`

Salida estable del kernel (equivalente a `TelemetryData` V3, posiblemente renombrado).

```typescript
```

### 4.2 `HorizonEvent`

Cola ordenada de lo que viene delante (máx. 5 eventos).

```typescript
```

### 4.3 `AgentTick` (salida del agente → UI)

```typescript
```

---

## 5. Diseño de pantallas

### 5.1 Home — **AGENT** (protagonista)

```text
```

**Elementos obligatorios MVP:**

- Headline + detail (texto claro)
- Barra de margen (m / s)
- Lista horizonte (3 eventos)
- Mini-HUD (3 números, no dial grande)
- Indicador de modo y conexión

**No en MVP:** gráficos pesados, ETCS skin, grid 3 columnas.

### 5.2 **PILOT** — vista legacy (port desde V3)

Vista opcional para quien quiera el HUD clásico: Speedometer + TrackProfile + BrakingCurve.

Importación selectiva desde V3; no bloquea el lanzamiento de V4.

### 5.3 **CONFIG**

- Perfil de tren
- Modo por defecto (SUGGEST / ARM)
- Unidades
- Enlace backend / diagnóstico

---

## 6. Agentes (módulos `nexus-agent`)

| Módulo                                | Entrada              | Salida                    |
| ------------------------------------- | -------------------- | ------------------------- |
| `buildHorizon(snapshot)`              | TelemetrySnapshot    | `HorizonEvent[]`          |
| `planBrake(snapshot, stats, profile)` | + brake stats API    | `BrakePlanStep[]`         |
| `evaluateVigilance(snapshot)`         | safety flags         | `AgentAction?`            |
| `evaluateCruise(snapshot)`            | limits + tail        | headline opcional         |
| `mergeTicks(...)`                     | ticks parciales      | `AgentTick` final         |
| `CommandBus`                          | AgentAction + policy | escribe `SendCommand.txt` |

**v1 del agente = reglas + física + brake learning.** Sin LLM en el loop de 10 Hz.

LLM opcional en v2 solo para: explicaciones largas, briefing de ruta, análisis post-sesión.

---

## 7. Estructura de repositorio (objetivo)

```text
```

---

## 8. Mapa de extracción V3 → kernel

| Origen V3                                 | Destino kernel                         |
| ----------------------------------------- | -------------------------------------- |
| `core/normalizers/*`                      | `nexus-kernel/normalizers/`            |
| `core/dataNormalizerUtils.ts`             | `nexus-kernel/utils/`                  |
| `core/DataNormalizer.ts`                  | `nexus-kernel/normalize.ts`            |
| `services/tailProtectionUtils.ts`         | `nexus-kernel/tail/`                   |
| `hooks/brakeLearningUtils.ts`             | tipos compartidos agent                |
| `components/display/brakingCurveUtils.ts` | `nexus-agent/brake/`                   |
| `core/TelemetryContext.tsx`               | queda en V4 UI (WS); kernel solo tipos |

**No extraer aún:** shell/, Speedometer, BrakingCurve UI, index.css temas.

---

## 9. MVP — 2 semanas

### Semana 1 — Kernel + Agente sin UI

- [ ] Crear `nexus-kernel` con tests (port normalizers)
- [ ] `buildHorizon()` + `planBrake()` mínimo
- [ ] `mergeTicks()` → `AgentTick` con reglas simples
- [ ] Mock snapshot para tests (sin TSC)

### Semana 2 — UI V4

- [ ] `Dastsc-V4` app Vite + React
- [ ] `AgentView` (headline + horizon + mini-HUD)
- [ ] WebSocket → kernel → agent → `useAgent()`
- [ ] CONFIG: perfil + modo SUGGEST
- [ ] PILOT: enlace “abrir V3” o port mínimo después

**Criterio de éxito MVP:** con TSC en marcha, el headline coincide con lo que BrakingCurve V3 ya
sugiere, pero en una pantalla limpia de una sola columna.

---

## 10. Fuera de alcance V4.0

- LLM en tiempo real
- ETCS DMI skin completo
- AUTO sin confirmación humana
- Grid dinámico por blueprint JSON
- Mock mode / black box (v4.1)

---

## 11. Decisiones cerradas (defaults junio 2026)

| #   | Decisión        | Valor adoptado                                                          |
| --- | --------------- | ----------------------------------------------------------------------- |
| D1  | Monorepo        | **npm workspaces** en raíz `Dastsc/package.json`                        |
| D2  | Backend         | **`Dastsc-V3/backend/`** por ahora; mover a `Dastsc/backend/` en fase 2 |
| D3  | V3 en paralelo  | **Sí** hasta MVP V4 estable (`npm run dev:v3`)                          |
| D4  | Puertos         | **V4 → 5175**, V3 → 5173, backend **8000**                              |
| D5  | Modo agente MVP | **SUGGEST** únicamente                                                  |

### Comandos

```bash
```

---

## 12. Estado del scaffold

- [x] `nexus-kernel` — tipos + `createMockSnapshot()`
- [x] `nexus-agent` — `buildHorizon()` + `tickAgent()` (reglas)
- [x] `Dastsc-V4` — AgentView mock (headline + horizonte + mini-HUD)
- [ ] Port normalizadores V3 → kernel
- [ ] WebSocket V4 → kernel → agent
- [ ] Tag `v3-stable`

---

*Documento vivo.*
