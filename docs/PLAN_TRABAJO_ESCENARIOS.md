# Plan de Trabajo: Implementación de Escenarios Nexus V3

Este documento define la estrategia para extraer datos en tiempo real de los escenarios de RailWorks y mostrarlos en el Dashboard.

## 1. Identificación del Escenario Activo

Para saber qué escenario estamos jugando sin intervención del usuario, utilizaremos el **RVNumber** (Rail Vehicle Number) extraído por el Core V4.

- **Dato de entrada:** `RV:323211_65011`
- **Estrategia:**
    1. El motor busca en todos los archivos `ScenarioProperties.xml` y `CurrentSave.xml` de la carpeta `Content/Routes`.
    2. Identifica el `<cDriver>` que contiene un `<cRailVehicle>` cuyo `<Number>` coincida con `323211` o `65011`.
    3. Una vez encontrado el vehículo, el archivo padre nos da el **GUID del Escenario** y la **Ruta**.

## 2. Extracción de Hoja de Ruta (Timetable)

Utilizaremos el archivo `CurrentSave.xml` del escenario activo porque contiene el estado dinámico (tiempos reales vs programados).

### Campos Críticos a Extraer (basado en XML)

| Campo XML | Significado Nexus | Uso en UI |
|-----------|-------------------|
| `DisplayName` | Nombre de la Parada | Título de la siguiente estación. |
| `Timetabled` | Es parada comercial | Filtra paradas técnicas (0) de comerciales (1). |
| `ArrivalTime` | Hora de llegada real | Para calcular el retraso/adelanto. |
| `DueTime` | Hora programada | El "horario impreso" en el HUD. |
| `Duration` | Tiempo de parada | Cuenta atrás para el cierre de puertas (segundos). |
| `ProgressCode` | Estado de la instrucción | Cambia el color visual (Pendiente, En curso, Cumplido). |

## 3. Integración con Coordenadas (GPS Interno)

Para mostrar la distancia a la siguiente parada en el Dashboard:

1. Extraemos los marcadores de `ScenarioNetworkProperties.xml` de la ruta.
2. Buscamos el marcador que coincida con el `EntityName` de la instrucción actual (ej. "Duddeston Platform 2").
3. Calculamos la distancia euclidiana entre la posición actual del tren (X, Z) y la del marcador.

## 4. Pipeline de Datos

1. **Lua Core V4:** Envía `RVNumber` + `PosX` + `PosZ`.
2. **Python Backend:**
   - Localiza el archivo `CurrentSave.xml` correspondiente.
   - Parsea las `cDriverInstructionTarget`.
   - Busca coordenadas del `EntityName`.
3. **React Frontend:**
   - Muestra el listado de estaciones.
   - Actualiza la barra de progreso de llegada.

## 5. Próximos Pasos (Tareas)

- [ ] Implementar `find_active_scenario_by_rv(rv_number)` en `scenarios.py`.
- [ ] Crear el parser para `CurrentSave.xml` que extraiga `DueTime` y `ArrivalTime`.
- [ ] Vincular el `TailProtectionService` para que sepa cuándo "limpiar" la estación actual al pasar el final del andén.
