# Opciones para obtener StationDistance en Dastsc V3

Fecha de análisis: 12 de abril de 2026  
Contexto: Birmingham Cross-City Line, Class 323, TS Classic (RailWorks)

---

## Estado actual

El Lua plugin (`plugins/Railworks_GetData_Script.lua`) ya está operativo y genera `GetData.txt` correctamente.  
El campo `StationDistance` devuelve `-1` / `StationName:N/A` en todos los escenarios probados.

---

## Opción 1 — `GetNextStation` (API nativa del motor)

### Descripción

Llamar a la función Lua nativa `GetNextStation()` que devuelve `(nombre, distancia_m, longitud_andén)`.

### Estado actual

Ya implementado en el Lua. El código funciona sin errores.

### Por qué no funciona aún

`GetNextStation` **solo devuelve datos cuando hay un servicio activo con paradas programadas**.  
No funciona en Quick Drive. Solo funciona en escenarios tipo Career o Timetable donde el juego tiene una lista de stops asignada al tren.

### Código actual en el Lua

```lua
local ok_sta, sn, sd, sl = pcall(Call, "GetNextStation", 0)
if not ok_sta or sn == nil then
    ok_sta, sn, sd, sl = pcall(Call, "GetNextStation")
end
if ok_sta and sn ~= nil then
    stationName = tostring(sn)
    stationDist = tonumber(sd) or -1
    platformLength = tonumber(sl) or 0
end
```

### Pros

- Solución más precisa posible — el juego calcula la distancia sobre el track real
- Sin mantenimiento posterior
- Incluye `PlatformLength`

### Contras

- Solo funciona en escenarios con servicio activo (Career/Timetable)
- No funciona en Quick Drive (modo de práctica habitual)

### Pendiente

~~Probar en un escenario Career/Timetable de Birmingham Cross-City para confirmar si funciona~~  
**DESCARTADA** — Probado en modo Carrera el 13/04/2026. `GetNextStation` devuelve N/A en **todos los modos** (Quick Drive y Career). Confirmado que la función no está disponible en el contexto de plugin global (`plugins/`), solo en scripts de escenario. **Opción definitivamente no viable.**

---

## Opción 2 — Base de datos de estaciones + Odómetro

### Descripción

Crear un archivo `route_profile.json` con las distancias reales entre estaciones de la línea.  
Usar el odómetro de `PhysicsNormalizer.ts` (ya operativo) para calcular la distancia a la siguiente parada del service sheet.

### Arquitectura

```
route_profile.json
  └─ Lista ordenada: [Redditch, Alvechurch, Barnt Green, ..., Lichfield TV]
     con distancias entre paradas en metros (datos reales Network Rail)

PhysicsNormalizer.ts  →  odometer_m (acumulado desde último reset)
TelemetryContext.tsx   →  detecta parada completada (speed≈0 durante N seg)
                        →  resetea odómetro
StationDistance        =  dist_hasta_proxima_parada - odometer_desde_ultima_parada
```

### Fuente para el nombre de la parada actual

El `service sheet` que ya tiene Dastsc (los stops del servicio cargado) — no depende del juego.

### Datos necesarios

Distancias reales entre estaciones Birmingham Cross-City (34 estaciones, línea lineal).  
Fuente: Network Rail open data / Wikipedia / manual desde el juego.

### Pros

- Funciona en Quick Drive y en escenarios
- Independiente de la API del juego
- Control total sobre los datos

### Contras

- Requiere construir y mantener `route_profile.json` manualmente
- El odómetro acumula error si hay maniobras, cambios de cab, o el tren retrocede
- Requiere detección fiable de "parada completada" para resetear el odómetro

### Estado de implementación

- Odómetro: **operativo** — integrado en `backend/core/station_tracker.py` (velocidad × Δt en el backend)
- Perfil de ruta: **creado** — `backend/data/birmingham_xc_profile.json` (23 estaciones con km_post)
- StationTracker: **implementado** — `backend/core/station_tracker.py`
- Integración backend: **activa** — `main.py` sobreescribe `StationDistance` del Lua por el valor calculado
- Auto-calibración: **activa** — aprende distancias reales de segmentos completados en sesión

---

## Opción 3 — OCR (Optical Character Recognition)

### Descripción

Capturar la pantalla del juego y leer visualmente la distancia a la próxima estación desde el HUD.

### Herramientas posibles

- `pytesseract` + OpenCV (Python)
- `mss` para captura de pantalla rápida

### Pros

- Funciona con cualquier escenario, ruta y tren
- No depende de la API del juego ni de archivos externos

### Contras

- Frágil: depende de resolución, configuración de pantalla, overlays activos
- Latencia añadida (captura + procesado)
- Requiere calibrar la región de captura manualmente
- Si el HUD cambia de posición o estilo, se rompe
- Aumenta el consumo de CPU/GPU

### Estado de implementación — **ACTIVA (Mayo 2026)**

Implementado en `backend/core/ocr_hud.py`. Funciona como ancla de precisión para el odómetro:

- Captura el HUD al cerrar puertas con tren en movimiento, o cada 5-30 s según distancia.
- Cuando OCR lee una distancia, establece un **anchor**: `ocr_anchor_dist` + `ocr_anchor_odo`.
- Entre capturas OCR, el odómetro decrementa desde ese anchor: `ocr_corrected = anchor_dist - (odo_now - anchor_odo)`.
- Resultado: precisión del juego en el momento de la captura + suavidad del odómetro entre capturas.
- Endpoint de debug: `GET /api/ocr/debug` para verificar el estado del anchor en tiempo real.

---

## Opción 4 — Lua de escenario (`.lua` dentro del escenario)

### Descripción

TS Classic permite incluir scripts Lua dentro de los escenarios (no solo en `plugins/`).  
Un Lua de escenario tiene acceso a datos de servicio que el plugin global no tiene.

### Limitación clave

El Lua de escenario solo se ejecuta durante ese escenario específico.  
Habría que modificar cada escenario individualmente.  
No viable para uso general.

### Estado

Descartada como solución general.

---

## Opción 5 — NearPosition acumulada + mapa de tiles

### Descripción

`NX/NZ` del Lua son coordenadas locales dentro del tile actual (se reinician cada 1024m en X y Z).  
Con el campo `tile` (deducible de los cambios bruscos en NX/NZ) se podría reconstruir una posición absoluta aproximada.

### Por qué no se implementó

`getFarPosition` devuelve `0,0,0,0` en este tren — la API no está disponible para la Class 323 en esta ruta.  
Sin FarPosition, reconstruir posición absoluta desde NX/NZ + detección de cambio de tile es complejo y propenso a errores.

### Estado

Descartada por ahora. Revisar si en otras rutas/trenes `getFarPosition` funciona.

---

## Recomendación de prioridad — **Revisada Mayo 2026**

| Prioridad | Opción | Estado |
|-----------|--------|--------|
| ~~1~~ | ~~Opción 1 (GetNextStation)~~ | **DESCARTADA** — No disponible en plugin global |
| 1 | Opción 2 (Odómetro + BD) | **IMPLEMENTADA** — Activa como base desde 13/04/2026 |
| 2 | Opción 3 (OCR) | **IMPLEMENTADA** — Activa como ancla de precisión desde Mayo 2026 |

### Solución final adoptada (Mayo 2026): Opción 2 + 3 combinadas

El sistema usa **Opción 2 como esqueleto** (odómetro + perfil de ruta) y **Opción 3 como ancla** (OCR periódico):

```
StationDistance final = OCR_anchor - (odo_actual - odo_en_momento_OCR)
```

- Cuando no hay OCR disponible, usa solo el odómetro del tracker.
- El frontend siempre recibe `StationDistance >= 0` (el `-1` del Lua nunca llega al frontend en condiciones normales).
- En `BrakingCurve.tsx`, `effectiveDist` en modo `DYNAMIC` usa directamente `raw.StationDistance` sin RAF ni estado local adicional.

---

## Archivos clave relacionados

| Archivo | Descripción |
|---------|-------------|
| `C:\Program Files (x86)\Steam\steamapps\common\RailWorks\plugins\Railworks_GetData_Script.lua` | Plugin Lua activo |
| `Dastsc-V3/backend/core/station_tracker.py` | StationTracker — odómetro + matching de perfil |
| `Dastsc-V3/backend/data/birmingham_xc_profile.json` | Perfil de ruta: 23 estaciones con km_post |
| `Dastsc-V3/backend/main.py` | Integra StationTracker, sobreescribe StationDistance |
| `Dastsc-V3/src/v3/core/normalizers/PhysicsNormalizer.ts` | Odómetro cliente (no usado para esta función) |
| `Dastsc-V3/src/v3/core/TelemetryContext.tsx` | Detección de paradas completadas (frontend) |
| `Dastsc-V3/src/v3/core/DataNormalizer.ts` | Mapeo de campos crudos a tipos |
| `Dastsc-V3/src/v3/hooks/useTelemetrySmoothing.ts` | Suavizado de StationDistance |
| `Dastsc-V3/src/v3/components/display/TrackProfile.tsx` | Visualización de distancia en track |
