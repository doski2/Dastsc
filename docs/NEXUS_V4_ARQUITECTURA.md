# Nexus V4 — Arquitectura y diseño

**Estado:** MVP en curso · julio 2026
**Relación con V3:** V3 = motor de telemetría + PILOT legacy (BrakingCurve, gauges). V4 = producto
AI-first con agente protagonista.

**Foco actual:** perfeccionar el flujo completo con **Class 323** como único perfil de referencia.
El resto de trenes y perfiles queda documentado para fases posteriores.

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

La política (`SUGGEST` / `ARM` / `AUTO`) vivirá en el **perfil del tren**; hoy solo está cableado
**SUGGEST** en UI.

---

## 3. Arquitectura en capas

```text
```

**Regla:** `nexus-agent` y `nexus-kernel` no importan React. Tests unitarios sin navegador.

---

## 4. Contratos de datos

Tipos en `nexus-kernel/src/types.ts`.

### 4.1 `TelemetrySnapshot`

Salida estable del kernel (`TelemetryHub` + `toTelemetrySnapshot`).

Campos clave: velocidad, límites, señalización, estación (OCR), freno, cola, seguridad, tren
(masa, longitud, `consistType`), gradiente (‰).

### 4.2 `HorizonEvent`

Cola ordenada de lo que viene delante (máx. 5): señal, límite, estación, cola, seguridad.

### 4.3 `AgentTick` (salida del agente → UI)

`headline`, `detail`, `urgency`, `marginM` / `marginS`, `horizon[]`, `brakePlan?`, `mode`,
`blockedReason?`.

---

## 5. Diseño de pantallas

### 5.1 Home — **AGENT** (protagonista)

```text
```

**En MVP actual:** headline con `planBrake` (muesca B1/B2/B3), horizonte, mini-HUD, enlace PILOT V3.

**No en MVP:** gráficos pesados, ETCS skin, CONFIG UI, grid 3 columnas.

### 5.2 **PILOT** — vista legacy (V3)

`http://localhost:5173` — Speedometer + TrackProfile + BrakingCurve. Referencia visual mientras se
afina el agente V4.

### 5.3 **CONFIG** (más adelante)

Perfil manual, modo ARM/AUTO, unidades, diagnóstico WS.

---

## 6. Agentes (módulos `nexus-agent`)

| Módulo                | Estado | Notas                                                     |
| --------------------- | ------ | --------------------------------------------------------- |
| `buildHorizon()`      | ✅     | Señal, límite, estación, cola, AWS/DSD                    |
| `planBrake()`         | ✅     | Port física V3; gradiente ‰ corregido; golden tests vs V3 |
| `tickAgent()`         | ✅     | Headline con muesca; perfil + brakeStats desde backend    |
| `evaluateVigilance()` | ⏳     | Solo vía horizon SAFETY hoy                               |
| `evaluateCruise()`    | ⏳     | —                                                         |
| `mergeTicks()`        | ⏳     | Un solo tick por ahora                                    |
| `CommandBus`          | ⏳     | ARM/AUTO; Lua `SendCommand` + DLL complemento             |

**v1 = reglas + física + brake learning.** Sin LLM en el loop de telemetría.

---

## 7. Estructura de repositorio

```text
```

---

## 8. Perfiles de tren — estrategia

### 8.1 Fase actual: solo Class 323

Hasta validar frenado, headlines y aprendizaje en ruta real (p. ej. Birmingham Cross City):

| Qué usamos              | Archivo / mecanismo                                                 |
| ----------------------- | ------------------------------------------------------------------- |
| Perfil completo         | `profiles/class323.json`                                            |
| Variantes expert/simple | `extends: "class323"` en `xc_class323_expert`, `cc_class323_simple` |
| Detección AUTO          | Backend: `GetLocoName()` + fingerprint DLL                          |
| Decel por muesca        | `brake_events.json` → `/api/brake/stats`                            |
| Física agente           | `planBrake` + `physics_config` del 323                              |

**Criterio para salir de “solo 323”:** headlines fiables en 3 escenarios (plano, subida, bajada) y
≥3 muestras aprendidas por muesca en `brakeStats`.

### 8.2 Plantilla gold (`class323.json`)

Bloques que todo perfil futuro debería tener (ver `docs/GUIA_PERFILES_V3.md`):

- `aliases` — matching RV / nombre DLL
- `fingerprint.required_controls` — variante de cabina
- `mappings` — nombres exactos de controles (desde `nexus-debug.py`)
- `specs.notches_throttle_brake` — muescas normalizadas
- `physics_config` — decel, fill time, effort
- `brakes` / `visuals`

### 8.3 Más adelante — multi-tren

| Tarea                        | Herramienta                                       | Prioridad |
| ---------------------------- | ------------------------------------------------- | --------- |
| Class 375, 390, …            | `nexus-debug.py --profile-draft <id>`             | P2        |
| Herencia sin duplicar        | `"extends": "class323"` o perfil base por familia | P2        |
| Aliases RV automáticos       | Ampliar al detectar nombre nuevo                  | P3        |
| Perfil en disco desde sesión | Export explícito (no auto-write en juego)         | P3        |
| UI selector AUTO / manual    | CONFIG V4                                         | P3        |
| Tablas decel ERA / XML TSC   | Calibración `max_braking_decel`                   | P4        |

---

## 9. Herramientas de diagnóstico (propias)

Sin depender de “TSClassic Raildriver and Joystick Interface” u otros terceros:

```bash
```

Ver también `docs/COMPARATIVA_LUA_RAILDRIVER.md`, `docs/GUIA_TECNICA_IPC.md`.

---

## 10. Mapa de extracción V3 → V4

| Origen V3                              | Destino                            | Estado                |
| -------------------------------------- | ---------------------------------- | --------------------- |
| `core/normalizers/*`                   | `nexus-kernel/normalizers/`        | ✅                    |
| `DataNormalizer` + utils               | `nexus-kernel/`                    | ✅                    |
| `brakingCurveUtils.computeBrakeParams` | `nexus-agent/brake/planBrake.ts`   | ✅ (+ fix gradiente ‰)|
| `useBrakeStats`                        | `Dastsc-V4/hooks/useBrakeStats.ts` | ✅                    |
| BrakingCurve UI                        | V3 PILOT                           | Sin port (referencia) |
| `CommandBus` / ARM                     | —                                  | ⏳                    |

---

## 11. MVP — criterios de éxito

1. WebSocket live → `TelemetrySnapshot` → `tickAgent` → UI V4.
2. Headline de frenado con **muesca real** del 323 (no default genérico).
3. Paridad física V3/V4 en `planBrake` (golden tests).
4. PILOT V3 disponible para comparar curva vs agente.

**Comandos:**

```bash
```

---

## 12. Fuera de alcance (V4.0 / hasta perfeccionar 323)

- LLM en tiempo real
- ETCS DMI skin completo
- AUTO sin confirmación humana
- Perfiles completos para toda la flota `profiles/*.json`
- Integración distancia estación vía XML de ruta (POC existe: `route-distance-poc.py`)
- Grid dinámico por blueprint JSON

---

## 13. Decisiones cerradas

| #   | Decisión          | Valor                                      |
| --- | ----------------- | ------------------------------------------ |
| D1  | Monorepo          | npm workspaces en raíz                     |
| D2  | Backend           | `Dastsc-V3/backend/` :8000                 |
| D3  | V3 en paralelo    | Sí (`dev:v3` PILOT)                        |
| D4  | Puertos           | V4 **5175**, V3 **5173**, backend **8000** |
| D5  | Modo agente       | **SUGGEST**                                |
| D6  | Perfil referencia | **`class323.json`** hasta validar MVP      |
| D7  | Debug controles   | **`nexus-debug.py`** (RailDriver oficial)  |
| D8  | Telemetría mundo  | **Lua** `GetData.txt` (no DLL 400–408)     |

---

## 14. Estado del scaffold (julio 2026)

### Hecho

- [x] `nexus-kernel` — normalizers, `TelemetryHub`, `toSnapshot`, tests
- [x] `nexus-agent` — `buildHorizon`, `planBrake`, `tickAgent`, 18 tests (+ golden V3)
- [x] `Dastsc-V4` — `useAgent`, WebSocket, `AgentHeadline`, `HorizonStrip`, `MiniHud`
- [x] Perfil 323 en agente — `useTrainProfile`, `useBrakeStats`, perfil desde backend
- [x] Backend — autoperfil DLL, `extends`, `GET /api/profiles/{id}`
- [x] `nexus-debug.py`, `Iniciar_Nexus_V4.bat`
- [x] Corrección gradiente ‰ en física de frenado (V3 + V4)

### En curso (323)

- [ ] Validación en juego: headline vs sensación real (plano / pendiente)
- [ ] Acumular `brakeStats` por muesca en sesiones reales
- [ ] Ajuste fino `physics_config` del 323 si hace falta

### Más adelante

- [ ] CONFIG UI (perfil manual, modo ARM)
- [ ] `CommandBus` + `SendCommand` / DLL escritura
- [ ] Segundo tren gold (p. ej. Class 375 vía `nexus-debug.py`)
- [ ] Tag `v3-stable`
- [ ] Mover backend a `Dastsc/backend/`
- [ ] Actualizar §12 de este doc al cerrar fase 323

---

*Documento vivo — última revisión alineada con foco Class 323.*
