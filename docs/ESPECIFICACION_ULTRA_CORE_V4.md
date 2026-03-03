# Documentación Técnica: Dastsc Ultra Core V4 (Lua Engine)

## Resumen

El motor de telemetría **Ultra Core V4** ha sido rediseñado para maximizar los FPS en Train Simulator Classic, eliminando el cuello de botella que suponía el formato vertical de la V2 y las búsquedas con comodines (`*:`).

## Estructura de Datos (Protocolo Horizontal)

A diferencia de versiones anteriores, los datos se empaquetan en una sola cadena de texto plana utilizando el delimitador de tubería (`|`).

**Formato:**
`Key1:Value1|Key2:Value2|...|KeyN:ValueN`

**Ventajas:**

- **Lectura Atómica**: El backend de Python lee una sola línea, reduciendo las operaciones de E/S.
- **Sin Saltos**: El uso de variables locales en Lua y la eliminación de metadatos redundantes garantiza una latencia < 1ms.
- **Precisión Controlada**: Valores flotantes limitados a 2-4 decimales según la necesidad (`string.format`).

## Ciclo de Ejecución (Tick Rate)

- **Delay Actual**: 5 iterraciones (aprox. 10-20Hz dependiendo de los FPS del juego).
- **Control de Foco**: Solo extrae datos si `GetIsEngineWithKey == 1` (ahorro de CPU en trenes IA).

## Campos Implementados (Base v4.1)

1. `SpeedoType`: (0=None, 1=MPH, 2=KPH).
2. `CurrentSpeed`: Velocidad en m/s.
3. `TimeOfDay`: Hora del simulador.
4. `Acceleration`: G-Force / Aceleración lineal.
5. `Gradient`: Pendiente de la vía.
6. `CurrentSpeedLimit`: Límite actual (ajustado a la unidad del tren).
7. `NextLimitType/Speed/Dist`: Información del próximo cambio de velocidad.
8. `SimulationTime`: El "heartbeat" del script.
9. `RVNumber`: Identificador de servicio del tren.
10. `Mass`: Masa total del consist en toneladas métricas.
11. `Length`: Longitud total del consist en metros.
12. `Curvature`: Radio de curvatura actual (6 decimales para precisión de G-lateral).
13. `BC / BP / MR / ER`: Presiones de frenado (Cilindro, Tubería, Depósito Principal, Ecualizador).
14. `Ammeter / TractiveEffort / Current`: Datos de potencia real extraídos de `FullEngineData`.
15. `TailDistance / TailSeconds / TailActive`: Estado del sistema de Protección de Cola V6.

## Integración de Perfiles Dinámicos (Master Template V4/V3)

El **Ultra Core V4** ahora utiliza los datos de los perfiles JSON (`profiles/`) para normalizar las señales de RailWorks:

- **Escalado Amperaje**: Usa `max_ammeter` (de `FullEngineData`) para representar el 100% de potencia en el HUD.
- **Física de Frenado**: El `max_brake_cyl` define el rango de operación (ej. 7.0 BAR vs 5.0 BAR).
- **Protección de Cola V6**: La lógica odómetro-basada utiliza el `Length` del tren y el `totalDistance` para calcular el punto exacto de liberación de velocidad.

## Roadmap de Implementación

Para mantener la estabilidad actual ("Sin lag"), todas las nuevas métricas deben:

1. Usar `pcall` si es posible para evitar cierres del script.
2. Formatearse como `Key:Value|`.
3. Evitar el uso de `Call("*:...")` prefiriendo el acceso directo al control si se conoce el nombre exacto.
