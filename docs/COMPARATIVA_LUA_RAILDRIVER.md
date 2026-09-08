# Comparativa Lua vs RailDriver64.dll — Telemetría y control

Referencia para decidir qué canal usa Nexus/Dastsc y cómo plantear **mandos de IA** al tren.

**Última revisión:** julio 2026
**POC RailDriver:** [`raildriver-poc.py`](../raildriver-poc.py)
**Telemetría Lua:** [`METRICAS_TELEMETRIA_V3.md`](METRICAS_TELEMETRIA_V3.md) ·
[`GUIA_TECNICA_IPC.md`](GUIA_TECNICA_IPC.md)

---

## 1. Resumen ejecutivo

|                           | **Lua (plugin global)**                                | **RailDriver64.dll**                          |
| ------------------------- | ------------------------------------------------------ | --------------------------------------------- |
| **Canal**                 | `GetData.txt` / `SendCommand.txt`                      | API C (`ctypes`)                              |
| **Alcance**               | Simulador + tren activo                                | Solo cabina de la loco activa                 |
| **Dashboard (lectura)**   | ✅ **Fuente principal** — todo el HUD                  | ❌ No duplicar telemetría                     |
| **Escritura IA (futuro)** | Mandos genéricos (`SendCommand`) — ARM/AUTO frenado ✅ | Mandos finos de cabina (`SetControllerValue`) |
| **Identificación tren**   | `LocoName` (fallback)                                  | ✅ `GetLocoName()` (canónico para perfil)     |

**Regla:** Lua = mundo y física del tren. DLL = nombre de loco + mandos de cabina + actuación IA
avanzada.

---

## 2. Arquitectura de canales

```mermaid
```

---

## 3. Lua — todo lo del dashboard

Inventario completo en [`METRICAS_TELEMETRIA_V3.md`](METRICAS_TELEMETRIA_V3.md). Resumen por
dominio:

| Dominio            | Campos clave                                                | Uso en Nexus             |
| ------------------ | ----------------------------------------------------------- | ------------------------ |
| Velocidad / cabina | `CurrentSpeed`, `SpeedoType`, `ActiveCab`, `Reversal`       | HUD, física, frenado     |
| Tracción / freno   | `Throttle`, `TrainBrake`, `Combined`, `BC/BP/MR/ER`         | BrakingCurve, gauges     |
| Señales / límites  | `SigState`, `SigDist`, `NextLimitDist`, `CurrentSpeedLimit` | Horizon, agente          |
| Física             | `Gradient`, `Curvature`, `Mass`, `TrainLength`              | TrackProfile, frenado    |
| Posición           | `NX/NY/NZ`, `FarXT/FarZO`                                   | Odómetro, cola           |
| Seguridad UK       | `AWS`, `DSD`, `DRA`, `DoorL/R`, `Sander`                    | Alertas inmersivas       |
| Escenario          | `RV`, `RouteID`, `ScenarioPath`, `location`                 | Perfil, contexto         |
| Estación           | `StationDistance` = `-1`                                    | Backend/OCR lo sustituye |

> **Horizon, braking curve y señales:** solo Lua. La DLL no expone estos datos.

---

## 4. RailDriver — solo lo que usamos

La DLL expone índices virtuales 400–408 (lat, lon, fuel, gradient, heading, hora, túnel). **No se
integran en Nexus** — la telemetría equivalente (o mejor) ya viene por Lua.

### 4.1 Funciones que sí usamos (o usaremos)

| Función                         | Modo         | Para qué                                                       |
| ------------------------------- | ------------ | -------------------------------------------------------------- |
| `SetRailDriverConnected(True)`  | Setup        | Activar enlace antes de leer/escribir                          |
| `GetLocoName()`                 | Lectura      | **Autodetectar perfil** (`profiles/*.json`) al cambiar de tren |
| `GetControllerList()`           | Lectura      | Listar mandos de la cabina activa (nombres separados por `::`) |
| `GetControllerValue(id, 0)`     | Lectura      | Valor actual de un mando de cabina                             |
| `GetControllerValue(id, 1/2)`   | Lectura      | Min/máx del mando — escalar bien al mandar (no todo es 0–1)    |
| `SetControllerValue(id, valor)` | Escritura 🔜 | **IA copiloto:** muescas, ETCS, mandos que Lua no reenvía      |

### 4.2 Qué controles de cabina nos interesan

Dependen de cada locomotora (`GetControllerList()`). Candidatos típicos en UK EMU (ej. Class 323):

| Control (nombre en DLL)          | Lectura                | Escritura IA    | Notas                                                |
| -------------------------------- | ---------------------- | --------------- | ---------------------------------------------------- |
| `ThrottleAndBrake` / `Regulator` | Solo si no basta Lua   | 🔜              | Preferir `SendCommand` para tracción/freno genérico  |
| `TrainBrakeControl`              | Idem                   | 🔜              | Idem                                                 |
| `Reverser`                       | Idem                   | 🔜              | Whitelist estricta                                   |
| `AWSReset`                       | Opcional               | 🔜              | Ack AWS si SendCommand no alcanza                    |
| Pantallas ETCS / DMI             | Si existen en la loco  | 🔜              | Solo trenes equipados; requiere perfil JSON          |
| Luces, pantógrafo, arena         | Si no están en GetData | 🔜              | Baja prioridad                                       |

**No leer de la DLL** lo que ya está en GetData con el mismo fin: velocidad, presiones BC/BP/MR,
gradiente, hora, posición.

### 4.2.1 ¿Lua y DLL a la vez para mandar comandos?

**Sí, los dos canales pueden estar activos en la misma sesión**, pero el `CommandBus` debe elegir
**un solo canal por acción** — nunca mandar el mismo control por Lua y DLL en el mismo tick.

| Pregunta                  | Respuesta                                                                        |
| ------------------------- | -------------------------------------------------------------------------------- |
| ¿Solo DLL para comandos?  | **No.** Lua (`SendCommand`) es el **default** (P3). DLL (P4) es **complemento**. |
| ¿Pueden coexistir?        | **Sí.** Ej.: Lua mueve freno; DLL pulsa un botón ETCS que Lua no reenvía.        |
| ¿Mismo mando por los dos? | **No.** Compiten por la misma palanca → valor impredecible o “lucha”.            |

**Qué nos influye al elegir canal:**

| Factor                    | Lua `SendCommand`                                  | DLL `SetControllerValue`                                 |
| ------------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| **Controles disponibles** | Solo los que el script Lua reenvía en `SendData()` | Cualquier entrada de `GetControllerList()`               |
| **Nombres vs índices**    | Semánticos (`Regulator`, `TrainBrakeControl`)      | Índice entero; **cambia por locomotora**                 |
| **Perfil JSON**           | Opcional (alias de nombres)                        | **Obligatorio** para mapear índice↔mando                 |
| **Latencia**              | Archivo → ~1 tick de juego                         | Llamada directa (más rápida)                             |
| **Sin DLL instalada**     | ✅ Funciona                                        | ❌ No funciona                                           |
| **Menú / pausa**          | Escribe pero el tren no responde igual             | 0 controles — no mandar                                  |
| **Trenes UK EMU (323)**   | Suficiente para tracción/freno/AWS/puertas         | Solo si hace falta cabina extra (ETCS, etc.)             |
| **Auditoría / whitelist** | Un archivo, fácil de revisar                       | Log por índice + valor + perfil                          |
| **Hardware RailDriver**   | No interfiere                                      | `SetRailDriverConnected` enlaza volante físico si existe |

**Regla práctica para la IA:**

```text
```

Ambos acaban en `SetControlValue` **dentro del simulador**; la diferencia es **cómo llega** el
orden (archivo + plugin global vs API de cabina) y **qué mandos** puedes alcanzar.

### 4.3 Requisitos operativos

- Tren activo en cabina (en menú/pausa → 0 controles).
- `RailDriver64.dll` en `RailWorks\plugins\`.
- Mapa índice↔nombre por loco en `profiles/` (los índices **cambian** entre locomotoras).

---

## 5. Comparativa rápida

| Necesidad                              | Canal                        | Motivo                                    |
| -------------------------------------- | ---------------------------- | ----------------------------------------- |
| HUD, agente, horizon, frenado          | **Lua**                      | Única fuente de señales, límites y física |
| Perfil automático del tren             | **DLL** `GetLocoName()`      | Más fiable que `LocoName` Lua             |
| Mandos genéricos (tracción/freno/AWS)  | **Lua** `SendCommand.txt`    | Nombres semánticos, ya diseñado           |
| Mandos finos de cabina (ETCS, muescas) | **DLL** `SetControllerValue` | Acceso directo; requiere perfil           |
| Distancia a parada / ETA               | **OCR + escenario**          | Ni Lua ni DLL lo exponen                  |

---

## 6. Control del tren (IA futuro)

### 6.1 Lua — `SendCommand.txt`

| Aspecto   | Detalle                                                                |
| --------- | ---------------------------------------------------------------------- |
| **API**   | `ControlName:valor` → Lua `SendData()` → `SetControlValue` en el juego |
| **Uso**   | Tracción, freno, reverser, AWS reset, puertas                          |
| **Doc**   | [`GUIA_TECNICA_IPC.md`](GUIA_TECNICA_IPC.md) §3                        |

```text
```

### 6.2 RailDriver — `SetControllerValue`

| Aspecto         | Detalle                                                      |
| --------------- | ------------------------------------------------------------ |
| **API**         | `SetControllerValue(index, float)` tras mapeo en perfil JSON |
| **Uso**         | Cabina avanzada cuando SendCommand no alcanza                |
| **POC lectura** | [`raildriver-poc.py`](../raildriver-poc.py)                  |

### 6.3 CommandBus (implementado)

```text
```

**Reglas:**

1. Modo ARM: IA solo actúa tras confirmación del usuario.
2. Modo AUTO: `useAutoCommand` envía con rate limit; fallback a SUGGEST si falla ack.
3. Whitelist: sin emergencia ni reverser sin policy explícita.
4. Sin perfil DLL → siempre SendCommand Lua.
5. Tras cada comando, verificar respuesta en GetData (`BC`, `Speed`).

---

## 7. Roadmap de integración

| Prioridad   | Canal         | Acción                                                      |               |
| ----------- | ------------- | ----------------------------------------------------------- | ------------- |
| P0          | Lua           | Mantener todo GetData (dashboard completo)                  |               |
| P1          | DLL lectura   | `GetLocoName()` → selección automática de perfil            |               |
| P2          | DLL lectura   | Dump `GetControllerList()` por loco → ampliar perfiles JSON |               |
| P3          | Lua escritura | `SendCommand.txt` en CommandBus                             | ✅ ARM + AUTO |
| P4          | DLL escritura | `SetControllerValue` para mandos no cubiertos por Lua       |               |

---

## 8. Limitaciones

|                               | Lua                                       | RailDriver                                   |
| ----------------------------- | ----------------------------------------- | -------------------------------------------- |
| Menú / pausa                  | GetData puede venir vacío                 | 0 controles — **no procesar SendCommand**    |
| SendCommand.txt huérfano      | Aplica freno/tracción al cargar escenario | Borrar archivo o Lua nuevo (purga al inicio) |
| `SetControlTargetValue`       | Bloquea palanca del jugador               | Solo `SetControlValue` (script Nexus actual) |
| Señales / límites / escenario | ✅                                        | ❌                                           |
| Esquema unificado             | ✅                                        | ❌ (por loco)                                |
| Requiere DLL en plugins       | No                                        | Sí                                           |

---

## 9. Referencias

| Recurso                      | Ruta                                                     |
| ---------------------------- | -------------------------------------------------------- |
| Inventario Lua               | [`METRICAS_TELEMETRIA_V3.md`](METRICAS_TELEMETRIA_V3.md) |
| IPC GetData / SendCommand    | [`GUIA_TECNICA_IPC.md`](GUIA_TECNICA_IPC.md)             |
| Arquitectura V4 + CommandBus | [`NEXUS_V4_ARQUITECTURA.md`](NEXUS_V4_ARQUITECTURA.md)   |
| POC DLL                      | [`raildriver-poc.py`](../raildriver-poc.py)              |
