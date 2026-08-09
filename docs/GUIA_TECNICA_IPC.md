# Arquitectura de Comunicación TSC <-> Dashboard (IPC)

Este documento explica el funcionamiento técnico de los scripts utilizados en el proyecto **Dastsc**
para la extracción de telemetría y el sistema de control.

## 1. El Script Lua: `Railworks_GetData_Script.lua`

Este script actúa como el "Plugin de Datos". Se carga automáticamente por Train Simulator Classic al
iniciar cualquier escenario si se encuentra en la carpeta `plugins/`.

### Estructura Principal

* **Ciclo de Actualización (`Update`)**: Ejecuta el motor principal de datos. Para no saturar el

  simulador, utiliza un contador (`delay = 5`) que limita la ejecución a aproximadamente 5Hz (5
  veces por segundo).

* **Gestión de Archivos (IPC)**:
  * **Salida (`GetData.txt`)**: Escribe todas las variables recolectadas en un formato legible para

      Python.

  * **Entrada (`SendCommand.txt`)**: Lee comandos enviados por Python para interactuar con los

      controles del tren (Fase 4).

### Funciones Clave

1. **`GetSignalInfo()`**:
    * Utiliza la API de alta fidelidad `GetNextRestrictiveSignal`.
    * Prioriza el `proState` para identificar señales profesionales (Doble amarillo, destellos).
    * Implementa un sistema de "salvaguarda" que detecta cambios rápidos mediante mensajes

          reactivos.

2. **`GetControlData()`**:
    * Escanea de forma masiva los controles del tren: Seguridad (AWS, DRA, DSD), Presiones, y

          Métricas de potencia.

    * Extrae metadatos del escenario y del tren para la identificación automática.
3. **`OnSignalMessage(...)`**:
    * Es un "Hook" reactivo. A diferencia de las consultas periódicas, esta función es llamada por

          el simulador *en el mismo instante* en que una señal envía un mensaje al tren, capturando
          eventos que el ciclo de 5Hz podría perderse.

---

## 2. El Dashboard Python: `tsc_dashboard_proto.py`

Es el cerebro del sistema. Procesa los datos crudos del archivo de texto y los transforma en una
interfaz visual inteligente.

### Lógica de Inteligencia

* **Detección de Perfiles**: Compara los controles disponibles en el juego con los archivos `.json`

  en `profiles/` para saber qué tren se está conduciendo y cómo interpretar sus palancas.

* **Odrómetro Virtual (Cola de Tren)**: Calcula la distancia recorrida basándose en la velocidad y

  el tiempo de simulación. Esto permite saber exactamente cuándo el último vagón ha superado una
  señal de límite de velocidad.

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

> **Importante:** usar solo `SetControlValue`. No llamar `SetControlTargetValue` — fija el mando y
> el jugador no puede mover la palanca hasta reiniciar escenario.

---

## 3.1 Problemas frecuentes con `SendCommand.txt` (mandos bloqueados)

| Síntoma                                      | Causa                                                                      | Solución                                                                   |
| -------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Palanca/freno bloqueados **sin abrir Nexus** | `SendCommand.txt` huérfano en `plugins/` de una sesión AUTO/ARM anterior   | Borrar `SendCommand.txt` + `NexusApplyCommands.flag`, o copiar Lua v10+    |
| Mandos bloqueados tras un mando IA           | `SetControlTargetValue` en versiones antiguas del script                   | Actualizar Lua (solo `SetControlValue`; **nunca** `SetControlTargetValue`) |
| Freno a 0 al primer mando tras cargar        | `dataread == 0` en el primer lote de `SendCommand` fuerza 0 (solo una vez) | Comportamiento heredado; NEU explícito usa valor 0 del backend             |
| Mandos en menú/pausa                         | `SendData()` corría fuera de cabina                                        | Solo se procesa con `GetIsEngineWithKey == 1`                              |
| `GetData_Error.txt` viejo (meses)            | Error pasado, no el actual                                                 | Borrar el archivo; si vuelve a aparecer, leer el texto nuevo               |

**Comprobación rápida:** con TSC cerrado, mira si existe
`RailWorks\plugins\SendCommand.txt`. Si hay líneas (`VirtualBrake:0.5`, etc.) y no estás en AUTO,
bórralo manualmente.

**Si no hay `SendCommand.txt` y los mandos siguen bloqueados**, el Lua actual del repo **no escribe
mandos** (solo lee `GetData`). Abre `plugins\GetData.txt` en cabina y busca `NexusLuaVersion:6`. Si
no aparece, TSC sigue cargando un **script viejo** en `plugins\`. Copia
`lua/Railworks_GetData_Script.lua` del repo y reinicia escenario.

**v11:** restaurada la estructura de la copia `Documents\Railworks_GetData_Script.lua`
(`SendData` tras `WriteData`, mismo bucle `io.lines`). Cambios respecto a esa copia:
sin `SetControlTargetValue`, flag `NexusApplyCommands.flag`, purga de `plugins/SendCommand.txt`
en `deleteFiles` (la copia solo borraba `Plugins/sendcommand.txt`).

**Si no hay telemetría:** comprueba que `SimulationTime` en `GetData.txt` sube en cabina. Si no
cambia, mira `GetData_Error.txt` (error de sintaxis en el Lua). No uses refactorings con
`local function` ni muevas `SendData` fuera del bloque `GetIsEngineWithKey` — el motor TSC es
sensible a eso.

**Al cerrar Nexus / terminar sesión AUTO:** el backend no borra el archivo; el Lua lo purga al
**iniciar un escenario nuevo** (`deleteFiles` al arranque del plugin).

---

## 3.2 Caso real: regresión telemetría + mandos (junio 2026)

### Síntomas reportados

| Síntoma                           | Contexto                                                |
| --------------------------------- | ------------------------------------------------------- |
| Sin telemetría en Nexus/V4        | Tras copiar un Lua refactorizado al `plugins/` de TSC   |
| Mandos bloqueados sin abrir Nexus | Palanca/freno no responde al jugador                    |
| NEU / soltar freno no vuelve a 0  | AUTO/ARM enviaba mando pero la palanca se quedaba en S3 |
| `GetData_Error.txt` de abril      | Archivo viejo — **no** indicaba el fallo actual         |

### Causa raíz (Lua)

Un refactor del script rompió la estructura que Train Simulator Classic espera:

1. **`SendData()` movido fuera** del bloque `if isEngineWithKey == 1` (junto a `WriteData()` en el

   backup que funcionaba).

2. Uso de **`local function`** y helpers nuevos — el runtime Lua del motor es sensible; el script

   deja de ejecutarse y `SimulationTime` en `GetData.txt` no avanza.

3. **`SetControlTargetValue`** en versiones anteriores — fija el mando y bloquea la palanca del

   jugador aunque no exista `SendCommand.txt`.

4. **`SendCommand.txt` huérfano** de sesiones AUTO anteriores — se aplicaba al cargar escenario.

### Solución aplicada (versión repo `NexusLuaVersion:6`)

- Restaurar el **mismo esqueleto** que la copia de respaldo del usuario

  (`Documents\Railworks_GetData_Script.lua`).

- `SendData()` **dentro** de `GetIsEngineWithKey == 1`, después de `WriteData()`.
- Solo **`SetControlValue`** (sin `SetControlTargetValue`).
- Purga de `SendCommand.txt` en `deleteFiles()` al iniciar escenario.
- Marca `NexusLuaVersion:11` en `GetData.txt` para verificar qué script carga TSC.

### Causa raíz (Nexus — NEU / tecla N)

| Capa                | Problema                                                           | Fix                                                                               |
| ------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `command_bus.py`    | Al soltar solo mandaba `VirtualBrake:0`                            | NEU escribe 3 líneas: `SimpleThrottle:0`, `VirtualBrake:0`, `TrainBrakeControl:0` |
| `commandBus.ts`     | `buildReleaseCommand` → valor 0 en `VirtualBrake`                  | Tests agente + perfil ICE T                                                       |
| `useAutoCommand.ts` | No reenviaba `VirtualBrake:0` si el juego no soltó a la primera    | Reintento cada 2 s mientras `brake.combined < -0.05`                              |
| V4                  | “Sin enlace” bloqueaba ARM aunque el backend podía escribir mandos | Separar `isBackendConnected` vs `isGameLinked`                                    |

### Verificación

1. Copiar `lua/Railworks_GetData_Script.lua` → `RailWorks\plugins\`.
2. **Nuevo escenario**, entrar en cabina.
3. `GetData.txt` debe mostrar `NexusLuaVersion:8` y `SimulationTime` creciendo.
4. Tests automatizados (ver §3.3).

### Qué no tocar sin probar en TSC

- No mover `SendData` fuera del bloque de cabina con llave.
- No introducir `local function` ni refactor grande en el plugin global.
- No volver a añadir `SetControlTargetValue`.

---

## 3.3 Tests automatizados — freno NEU / vuelta a 0

| Test                                              | Archivo                                       | Qué garantiza                                  |
| ------------------------------------------------- | --------------------------------------------- | ---------------------------------------------- |
| `test_dispatch_split_brake_release_neu_zeros_all` | `Dastsc-V3/backend/tests/test_command_bus.py` | Backend escribe las 3 líneas NEU para ICE T    |
| `test_dispatch_split_brake_cuts_throttle`         | idem                                          | Al frenar (S3) corta `SimpleThrottle`          |
| `maps German split brake S3…` / release ICE T     | `nexus-agent/src/command/commandBus.test.ts`  | Agente mapea S3→0.3 y NEU→`VirtualBrake:0`     |
| `releases NEU for ICE T at speed limit`           | idem (añadido)                                | AUTO sugiere soltar freno al alcanzar objetivo |

Ejecutar:

```bash
```

---

## 4. Lua vs RailDriver64.dll

Para una tabla completa de qué lee/escribe cada canal (telemetría, mandos futuros de IA, huecos
entre ambos), ver **[COMPARATIVA_LUA_RAILDRIVER.md](COMPARATIVA_LUA_RAILDRIVER.md)**.

---

## 5. Comparativa con Estándar (Manual del Desarrollador)

| Característica    | Implementación Estándar     | Nuestra Implementación                | Ventaja                               |
| ----------------- | --------------------------- | ------------------------------------- | ------------------------------------- |
| **Recolección**   | Polling simple (`GetSpeed`) | Multicapa (Polling + OnSignalMessage) | Evita la "ceguera" en señales Pro.    |
| **Alertas**       | Lámparas estáticas          | HUD Parpadeante e Inmersivo           | Mayor seguridad y visibilidad.        |
| **Cola de Tren**  | Manual (Vía libre visual)   | Odrómetro Automático                  | Permite acelerar al momento exacto.   |
| **Configuración** | Fija por script             | Dinámica por Perfiles JSON            | Compatible con cualquier tren de TSC. |

---

## 6. Diccionario de Controles Comunes

Para facilitar la creación de perfiles (`profiles/*.json`), a continuación se listan los controles
más frecuentes y su función típica:

### Tracción y Movimiento

* **`ThrottleAndBrake`**: Mando combinado (Típico en trenes modernos como Class 323/375). >0

  Tracción, <0 Freno.

* **`Regulator` / `TrainBrakeControl`**: Controles separados (Típico en locomotoras antiguas o

  alemanas).

* **`Reverser`**: Inversor de marcha (-1 Atrás, 0 Neutro, 1 Adelante).

### Seguridad e Interlocks

* **`AWS` / `AWSReset`**: Sistema de aviso de señales (Requerido para evitar frenado de emergencia).
* **`DRA`**: Driver Reminder Appliance (Si está activo, bloquea la salida en estaciones).
* **`DSD` / `Vigilance`**: Hombre muerto. Si se activa, requiere intervención inmediata (parpadeo

  rojo en HUD).

* **`DoorInterlock`**: Si es 0, las puertas están abiertas o desbloqueadas. Generalmente impide la

  tracción.

### Frenado (Medido en BAR)

* **`TrainBrakeCylinderPressureBAR`**: Presión real en los frenos. 0 = Sueltos.
* **`BrakePipePressureBAR`**: Presión en la tubería. 5.0 = Cargada (Suelto), <5.0 = Aplicando freno.
* **`MainReservoirPressureBAR`**: Reserva de aire. Debe estar cargada por encima de 6-7 BAR.

### Métricas de Rendimiento

* **`Current` / `Ammeter`**: Consumo eléctrico en Amperios.
* **`TrackMPH`**: Límite de velocidad detectado por la vía.
* **`TrainAbsoluteSpeedMPH`**: Velocidad real calculada del convoy.
