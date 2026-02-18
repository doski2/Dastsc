# Documentación de Avances - Dashboard Inteligente TSC

## Estado del Proyecto: Fase 4 Iniciada - Control y Automatización

Este documento resume las capacidades técnicas implementadas en el sistema de telemetría y asistencia para Train Simulator Classic.

---

### Última Actualización: 15 de Febrero de 2026

* **Fases 2 y 3 Completadas:** La extracción de datos avanzada y la lógica de dashboard (físicas, cola de tren, seguridad) han sido validadas con éxito.
* **Soporte de Señalización (Semáforos):** ✅ Integrada detección con la API `GetNextRestrictiveSignal`, permitiendo ver aspectos Pro (Double Yellow, Flashing Yellow) y distancia real en rutas complejas como Birmingham Cross City.
* **Sensores Geométricos y Físicos:** ✅ Implementada detección de **Curvatura de vía** (Radio en metros) con anticipación y cálculo de **Masa Total del Tren** (Toneladas) para IA de frenado.
* **Alertas Inmersivas:** ✅ Sistema de parpadeo dinámico para AWS, DRA y DSD (Hombre Muerto), incluyendo un "flash" de pantalla completa para máxima urgencia.
* **Optimización de Código:** ✅ Script Lua simplificado y refactorizado para mayor estabilidad y menor consumo de recursos.

---

### 1. Sistema de Telemetría (Lua Engine)

* **Archivo:** [lua/Railworks_GetData_Script.lua](../lua/Railworks_GetData_Script.lua)
* **Frecuencia:** 5Hz (actualización cada 200ms).
* **Innovaciones en Señalización:**
  * Uso de `GetNextRestrictiveSignal` para obtener [Estado, Distancia, ProState].
  * Mapeo de estados: 0:Rojo, 1:Y, 2:YY, 3:Verde, 4, 10, 11: Destellos.
* **Control Externo:** Implementada función `SendData()` para lectura de `plugins/SendCommand.txt`.

### 2. Dashboard Inteligente (Python Wrapper)

* **Archivo:** [src/tsc_dashboard_proto.py](../src/tsc_dashboard_proto.py)
* **Interfaz:** GUI basada en Tkinter con atributo "Always on Top".
* **Alertas Inmersivas:** ✅ Pantalla completa parpadeante en rojo para Hombre Muerto (DSD).
* **Sistema de Perfiles (JSON):** Cargados dinámicamente desde `profiles/` con detección por "fingerprint".

---

### 3. Estructura Organizada (Carpeta Raíz)

* **`src/`**: Fuente Python (Dashboard, Tests, Migración).
* **`lua/`**: Script de integración para el simulador.
* **`docs/`**: Documentación técnica y manuales.
* **`profiles/`**: Archivos de configuración de locomotoras.

---

### 3. Hitos Técnicos Alcanzados

#### A. Lógica de "Cola de Tren" (Tail Clearance)

... (mantener igual)

#### B. Sistema de Alertas de Seguridad - **¡MEJORADO!**

* **Inmersión total:** Las alertas críticas ahora afectan a toda la interfaz, no solo a una lámpara pequeña.

#### C. Señalización Pro (Anti-Ceguera API)

* **Solución al error -2:** Se ha superado la limitación de la API estándar de TSC que devolvía "Ciego" en señales profesionales. Ahora el sistema "ve" a través de la API restrictiva nativa.

---

* **Visualización Unificada:** Barra de progreso que muestra tanto la potencia aplicada como el nivel de frenado en una sola vista (optimizado para el mando combinado de la Class 323).

---

### 4. Configuración del Tren

* **Longitud predefinida:** Botones de acceso rápido para Class 323 (3 coches / 61m y 6 coches / 122m).
* **Detección Automática:** Si el script Lua detecta la longitud real desde la API del juego, el dashboard se actualiza automáticamente.

---

### Próximos Pasos (Fase 4 - Hacia la IA)

* [in-progress] Implementar sistema de envío de comandos (`SendCommand.txt`) para controlar el tren desde Python.
* [not-started] Desarrollar lógica de mantenimiento de velocidad automática (Crucero inteligente).
* [not-started] Implementar respuesta automática a AWS y DSD (Modo Vigilante IA).
* [not-started] Añadir base de datos de paradas de estación con cálculo de distancia de frenado óptima.
