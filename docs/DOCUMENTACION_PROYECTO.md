# Documentación de Avances - Dashboard Inteligente TSC

## Estado del Proyecto: Fase 5 Activa — Física de Frenado Calibrada

Este documento resume las capacidades técnicas implementadas en el sistema de telemetría y
asistencia para Train Simulator Classic.

---

### Última Actualización: 14 de Agosto de 2026

* **Nexus V4 — barra fija de marcha:** `DriveHudBar` muestra velocidad, límite efectivo, próximo

  límite y cola bajo el header (siempre visible). El contenido central hace scroll aparte.

* **Prioridad de frenado agente:** Señal → Límite → Estación (`selectUrgentBrakePlan`); en cluster

  límite+estación gana el cartel.

* **OCR estación — deriva en tramos largos:** `mid_leg_correction` acepta OCR por encima del

  odómetro (hasta 250 m / 8 %); cooldown 60 s tras cualquier intento OCR.

* **Perfiles AUTO ampliado:** detección incluye JSON legacy en `profiles/` además de

  `profiles/nexus/`.

* **Asistente de perfil:** botón «Capturar muescas…» (`notch_capture.py`) para perfiles como Class 390.

* **Fases 2, 3 y 4 Completadas:** Extracción avanzada, lógica de dashboard, físicas, cola de tren,

  seguridad, sistema de aprendizaje automático de frenado y calibración de curva de frenado
  validadas con éxito.

* **Soporte de Señalización (Semáforos):** ✅ Integrada detección con la API

  `GetNextRestrictiveSignal`, permitiendo ver aspectos Pro (Double Yellow, Flashing Yellow) y
  distancia real en rutas complejas como Birmingham Cross City.

* **Sensores Geométricos y Físicos:** ✅ Implementada detección de **Curvatura de vía** (Radio en

  metros) con anticipación y cálculo de **Masa Total del Tren** (Toneladas) para IA de frenado.

* **Alertas Inmersivas:** ✅ Sistema de parpadeo dinámico para AWS, DRA y DSD (Hombre Muerto),

  incluyendo un "flash" de pantalla completa para máxima urgencia.

* **Gradiente Corregido:** ✅ `DataNormalizer` calcula el signo real del gradiente según la cabina

  activa. Cab 1 = signo original del juego, Cab 2 = invertido. Campo `RawGradient` adicional para
  visualización cruda.

* **GForce / Aceleración:** ✅ Calculado desde delta de velocidad real (`emaAccelMS2`), no desde

  `raw.Acceleration` del juego (que tiene signo invertido).

* **Sistema de Aprendizaje de Frenado:** ✅ `useBrakeLearning` detecta frenadas reales y las envía al

  backend. `brakeStats` se actualiza cada 60 s durante la sesión.

* **Curva de Frenado Refactorizada (v5):** ✅ Sin RAF ni estado local — `effectiveDist` usa

  `raw.StationDistance` (OCR+tracker) directamente. Muescas de freno desde perfil real.
  `reactionMargin` preciso por `brake_fill_time_s`. Ver sección 5.

* **OCR de Distancia:** ✅ Backend captura el HUD del juego para anclar la distancia a la próxima

  parada con precisión del juego. **No es periódico:** captura al cerrar puertas (`door_anchor`),
  checkpoints en tramos **> 5 km** (`mid_leg_correction`, máx. 3) y al acercarse a ≤ 400 m
  (`near_correction`). Entre capturas, el odómetro integra la distancia.

---

### 1. Sistema de Telemetría (Lua Engine)

* **Archivo:** [lua/Railworks_GetData_Script.lua](../lua/Railworks_GetData_Script.lua)
* **Frecuencia:** 5Hz (actualización cada 200ms).
* **Campos clave en `GetData.txt`**: `StationDistance` siempre `-1` desde Lua (el backend lo

  sobreescribe). `Gradient` con signo positivo = subida según convención TS Classic.

* **Innovaciones en Señalización:**
  * Uso de `GetNextRestrictiveSignal` para obtener [Estado, Distancia, ProState].
  * Mapeo de estados: 0:Rojo, 1:Y, 2:YY, 3:Verde, 4, 10, 11: Destellos.
* **Control Externo:** Implementada función `SendData()` para lectura de `plugins/SendCommand.txt`.

### 2. Backend FastAPI (Python 3.13)

* **Archivo:** `Dastsc-V3/backend/main.py` — puerto 8000.
* **Módulos clave:**
  * `core/station_tracker.py` — odómetro + calibración automática por segmento.
  * `core/ocr_hud.py` — captura OCR del HUD del juego para anclar `StationDistance`.
  * `core/brake_log.py` — almacena eventos de frenado en `data/brake_events.json` (máx 500).
* **Endpoints de frenado:**
  * `POST /api/brake/event` — registra un evento de frenada real.
  * `GET /api/brake/events` — historial de frenadas (últimas 20 por perfil).
  * `GET /api/brake/stats` — estadísticas promedio por muesca de freno.
* **Lógica `StationDistance`:** OCR ancla el valor en `door_anchor` (cierre de puertas),

  opcionalmente
  en `mid_leg_correction` (tramos > 5 km) y en `near_correction` (≤ 400 m, una vez por tramo); el
odómetro lo decrementa entre capturas; el backend sobreescribe el `-1` del Lua antes de enviarlo al
  frontend. Tras cada intento OCR, cooldown **60 s**. Correcciones intermedias toleran odómetro
  adelantado vs HUD (ver `METRICAS_TELEMETRIA_V3.md` §4).

### 3b. Frontend Nexus V4 (Vite, puerto 5175)

* **`AppShell.tsx`** — layout de pantalla completa: header fijo, `driveHud`, área central con

  scroll,
  footer de navegación.

* **`DriveHudBar.tsx`** — telemetría en marcha: velocidad, límite, próximo límite (+ distancia),

  cola.

* **`BrakePlanPanel.tsx`** — plan de frenada del agente; pasos con scroll interno al desplegar.
* **`useAgent.ts` / `useAutoCommand.ts`** — tick del agente, política SUGGEST/ARM/AUTO, mandos WS.
* Documentación de arquitectura: `docs/NEXUS_V4_ARQUITECTURA.md`.

### 3. Frontend React + TypeScript (Vite, puerto 5173)

* **`DataNormalizer.ts`** — normalización central de todos los campos de telemetría:
  * `Gradient` (normalizado por cabina): `cabSign × gameRawGrad`. Positivo = subida.
  * `RawGradient`: valor crudo del juego para visualización.
  * `emaAccelMS2`: aceleración EMA desde delta de velocidad real (no del campo `Acceleration` del

      Lua).

  * `GForce`: `emaAccelMS2 / 9.80665` — negativo al frenar (convención estándar).
  * `ProjectedSpeed`: proyección a 5 segundos.
* **`BrakingCurve.tsx`** — curva de frenado + panel de secuencia + log de frenadas:
  * `effectiveDist`: `useMemo` limpio sin RAF — fuente directa según modo (ver sección 5).
  * `reactionMargin`: `Speed × (1.5 + brake_fill_time_s)`.
  * Muescas desde perfil real (`notches_throttle_brake`), descartando EMG.
  * `brakeStats` con refresco automático cada 60 s.
* **`useBrakeLearning.ts`** — detección pasiva de frenadas; submite al backend silenciosamente.
* **`Speedometer.tsx`** — usa `raw.GForce` con signo correcto; `ProjectedSpeed` correcto.
* **`TrackProfile.tsx`** — sin doble negación de gradiente; `DataNormalizer` es única fuente de

  verdad.

### 4. Estructura de Archivos

* **`Dastsc-V3/src/`**: Frontend React/TS.
* **`Dastsc-V3/backend/`**: FastAPI + módulos core.
* **`docs/`**: Documentación técnica.
* **`profiles/`**: Perfiles JSON de locomotoras.
* **`Dastsc-V3/backend/data/`**: Datos persistentes (brake_events.json, birmingham_xc_profile.json,

  station_tracker_state.json).

---

### 5. Curva de Frenado — Arquitectura v5 (Mayo 2026)

#### Fuente de distancia (`effectiveDist`)

| Modo                   | Fuente                                          |
| ---------------------- | ----------------------------------------------- |
| `DYNAMIC` (automático) | `raw.StationDistance` (OCR+tracker del backend) |
| `DYNAMIC` (manual mi)  | `inputMiles × 1609.34`                          |
| `SIGNAL`               | `raw.DistToNextSignal`                          |
| `LIMIT`                | `raw.DistToNextSpeedLimit`                      |

**Sin RAF, sin `remainingDist` local.** El backend actualiza `StationDistance` cada frame.

#### Margen de reacción

```text
```

Para Class 323 a 80 km/h (22.2 m/s): `22.2 × (1.5 + 5) = 144 m`

#### Muescas de freno

Se toman de `notches_throttle_brake` del perfil JSON, excluyendo EMG (`value = -1.0`).
Si hay N muescas de servicio: se seleccionan 3 espaciadas (primera, media, última).
El auto-aprendizaje (`brakeStats`) calibra la deceleración real por muesca con ≥3 muestras.

---

### 6. Hitos Técnicos Alcanzados

#### A. Lógica de "Cola de Tren" (Tail Clearance)

... (mantener igual)

#### B. Sistema de Alertas de Seguridad

* **Inmersión total:** Las alertas críticas ahora afectan a toda la interfaz, no solo a una lámpara

  pequeña.

#### C. Señalización Pro (Anti-Ceguera API)

* **Solución al error -2:** Se ha superado la limitación de la API estándar de TSC que devolvía

  "Ciego" en señales profesionales.

#### D. Auto-Aprendizaje de Frenado (Mayo 2026)

* El sistema detecta frenadas en sesión y aprende la deceleración real por muesca.
* Con ≥3 muestras, sustituye el estimado del perfil por datos medidos.
* Indicadores visuales en la secuencia: `✦N` (aprendido, N muestras) vs `~est` (estimado).
* Historial accesible desde el botón "Brake Log".

---

### Próximos Pasos

* [not-started] Añadir `brake_fill_time_s` a todos los perfiles (actualmente solo Class 323).
* [not-started] Panel de ajuste fino de `brake_fill_time_s` desde la UI.
* [not-started] Crucero inteligente (mantenimiento de velocidad automático).
* [not-started] Respuesta automática a AWS/DSD (Modo Vigilante IA).
