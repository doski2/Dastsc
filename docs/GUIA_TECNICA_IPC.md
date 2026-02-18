# Arquitectura de Comunicación TSC <-> Dashboard (IPC)

Este documento explica el funcionamiento técnico de los scripts utilizados en el proyecto **Dastsc** para la extracción de telemetría y el sistema de control.

## 1. El Script Lua: `Railworks_GetData_Script.lua`

Este script actúa como el "Plugin de Datos". Se carga automáticamente por Train Simulator Classic al iniciar cualquier escenario si se encuentra en la carpeta `plugins/`.

### Estructura Principal

* **Ciclo de Actualización (`Update`)**: Ejecuta el motor principal de datos. Para no saturar el simulador, utiliza un contador (`delay = 5`) que limita la ejecución a aproximadamente 5Hz (5 veces por segundo).
* **Gestión de Archivos (IPC)**:
  * **Salida (`GetData.txt`)**: Escribe todas las variables recolectadas en un formato legible para Python.
  * **Entrada (`SendCommand.txt`)**: Lee comandos enviados por Python para interactuar con los controles del tren (Fase 4).

### Funciones Clave

1. **`GetSignalInfo()`**:
    * Utiliza la API de alta fidelidad `GetNextRestrictiveSignal`.
    * Prioriza el `proState` para identificar señales profesionales (Doble amarillo, destellos).
    * Implementa un sistema de "salvaguarda" que detecta cambios rápidos mediante mensajes reactivos.
2. **`GetControlData()`**:
    * Escanea de forma masiva los controles del tren: Seguridad (AWS, DRA, DSD), Presiones, y Métricas de potencia.
    * Extrae metadatos del escenario y del tren para la identificación automática.
3. **`OnSignalMessage(...)`**:
    * Es un "Hook" reactivo. A diferencia de las consultas periódicas, esta función es llamada por el simulador *en el mismo instante* en que una señal envía un mensaje al tren, capturando eventos que el ciclo de 5Hz podría perderse.

---

## 2. El Dashboard Python: `tsc_dashboard_proto.py`

Es el cerebro del sistema. Procesa los datos crudos del archivo de texto y los transforma en una interfaz visual inteligente.

### Lógica de Inteligencia

* **Detección de Perfiles**: Compara los controles disponibles en el juego con los archivos `.json` en `profiles/` para saber qué tren se está conduciendo y cómo interpretar sus palancas.
* **Odrómetro Virtual (Cola de Tren)**: Calcula la distancia recorrida basándose en la velocidad y el tiempo de simulación. Esto permite saber exactamente cuándo el último vagón ha superado una señal de límite de velocidad.
* **Sistema de Alertas Inmersivas**:
  * Monitoriza los sistemas de seguridad.
  * Activa efectos visuales de "flash" en toda la interfaz para alertas críticas (Hombre muerto).

---

## 3. Flujo de Datos para Control (Fase 4: Automatización)

Para que Python controle el tren, el flujo es el siguiente:

1. **Python** calcula la potencia necesaria (ej: para mantener 60 MPH).
2. **Python** escribe en `plugins/SendCommand.txt` la línea: `Regulator:0.75`.
3. **Lua (`SendData`)** lee el archivo, detecta el cambio y ejecuta:
    `Call("SetControlValue", "Regulator", 0, 0.75)`
4. El simulador mueve la palanca física en la cabina del tren.

---

## 4. Comparativa con Estándar (Manual del Desarrollador)

| Característica | Implementación Estándar | Nuestra Implementación | Ventaja |
| :--- | :--- | :--- | :--- |
| **Recolección** | Polling simple (`GetSpeed`) | Multicapa (Polling + OnSignalMessage) | Evita la "ceguera" en señales Pro. |
| **Alertas** | Lámparas estáticas | HUD Parpadeante e Inmersivo | Mayor seguridad y visibilidad. |
| **Cola de Tren** | Manual (Vía libre visual) | Odrómetro Automático | Permite acelerar al momento exacto. |
| **Configuración** | Fija por script | Dinámica por Perfiles JSON | Compatible con cualquier tren de TSC. |

---

## 5. Diccionario de Controles Comunes

Para facilitar la creación de perfiles (`profiles/*.json`), a continuación se listan los controles más frecuentes y su función típica:

### Tracción y Movimiento

* **`ThrottleAndBrake`**: Mando combinado (Típico en trenes modernos como Class 323/375). >0 Tracción, <0 Freno.
* **`Regulator` / `TrainBrakeControl`**: Controles separados (Típico en locomotoras antiguas o alemanas).
* **`Reverser`**: Inversor de marcha (-1 Atrás, 0 Neutro, 1 Adelante).

### Seguridad e Interlocks

* **`AWS` / `AWSReset`**: Sistema de aviso de señales (Requerido para evitar frenado de emergencia).
* **`DRA`**: Driver Reminder Appliance (Si está activo, bloquea la salida en estaciones).
* **`DSD` / `Vigilance`**: Hombre muerto. Si se activa, requiere intervención inmediata (parpadeo rojo en HUD).
* **`DoorInterlock`**: Si es 0, las puertas están abiertas o desbloqueadas. Generalmente impide la tracción.

### Frenado (Medido en BAR)

* **`TrainBrakeCylinderPressureBAR`**: Presión real en los frenos. 0 = Sueltos.
* **`BrakePipePressureBAR`**: Presión en la tubería. 5.0 = Cargada (Suelto), <5.0 = Aplicando freno.
* **`MainReservoirPressureBAR`**: Reserva de aire. Debe estar cargada por encima de 6-7 BAR.

### Métricas de Rendimiento

* **`Current` / `Ammeter`**: Consumo eléctrico en Amperios.
* **`TrackMPH`**: Límite de velocidad detectado por la vía.
* **`TrainAbsoluteSpeedMPH`**: Velocidad real calculada del convoy.
