# Roadmap de Ejecución: Nexus Dash v3

Este documento sirve para el seguimiento de tareas, hitos y decisiones tomadas durante la construcción del motor v3. Es un documento **vivo** que permite registrar cambios de rumbo sobre el plan original (`PLAN_ARQUITECTURA_STD.md`).

---

## 📊 Estado Actual del Proyecto

- **Fase Actual:** 3 - Modularidad y UI Blueprint (En Progreso)
- **Último Hito:** Estabilización de Telemetría v3 (Multi-Checkpoint) y Batería de Tests de Integración Unificada.
- **Próximo Paso:** Gestión de Perfiles de Tren y Refinamiento de Andenes 2D/3D.

---

## 🛠️ Desglose de Fases y Tareas

### Fase 1: Infraestructura y Telemetría Core

*El objetivo es procesar los datos brutos del simulador antes de que lleguen a la UI, asegurando limpieza y fluidez.*

- [x] **1.1 Setup de Entorno v3:** Configuración de Vite 7, Tailwind 4 y React 19. Estructura de carpetas modular creada.
- [x] **1.2 El Telemetry Hub:** Creación del `TelemetryProvider` optimizado. Centraliza los datos en un único punto.
- [x] **1.3 El Interpolador (Smooth Engine):** Hook `useSmoothValue` para 60fps constantes. Rellena los huecos entre actualizaciones.
- [x] **1.4 Lanzador Automatizado:** Creado `Iniciar_Nexus_V3.bat` para despliegue rápido.
- [x] **1.5 Lógica de Frenado Proyectiva:** Implementación visual de la parábola de frenado en el bloque central e integración de datos base.
- [x] **1.6 Normalizador de Datos:** Refinamiento de filtrado de "ruido" y normalización avanzada de sensores.
- [x] **1.7 Servicio de Protección de Cola (v3.11):** Implementación de odómetro multi-checkpoint para cambios de velocidad secuenciales (40->60->80) con prioridad de seguridad en reducciones.
- [x] **1.8 Suite de Validación Unificada:** Creación de `EJECUTAR_TESTS_V3.bat` que integra pruebas de Core, Lua (Denoising), Seguridad y Métricas.

### Fase 2: El Motor de Renderizado (Canvas Engine)

*Aquí es donde ocurre la magia del rendimiento, integrando el diseño visual de las propuestas de IA.*

- [x] **2.1 Contenedor de Capas Canvas:** Setup del lienzo base con soporte para sombras y glows (`CanvasLayer.tsx`).
- [x] **2.2 Transformación de Coordenadas de Vía:** Implementada vista horizontal con curvatura sinusoidal y gradiente visual.
- [x] **2.3 Renderizado de Elementos Críticos:**
  - [x] Dibujo de **Speed Limit Circles** proyectivos con código de colores.
  - [x] Visualización de **Señales** estilo semáforo con glow dinámico.
  - [ ] **Andenes Dinámicos:** Representación del largo del andén frente al tren.

### Fase 3: Modularidad y UI Blueprint

*Montaje final fusionando los datos del juego original con la estética moderna (3 bloques inferiores).*

- [x] **3.1 Sistema de Slots:** Layout de 3 bloques inferiores + Barra de información (Info Bar) interactiva.
- [x] **3.2 Atomic Library:**
  - [x] **Velocímetro Proyectivo:** Dial circular con aguja cian y **Esfera de Fuerza G** funcional.
  - [x] **Dynamic Graph Widget:** Implementado `BrakingCurve` con rejilla técnica y relleno degradado.
  - [x] **Adaptive Telemetry:** Bloque de datos secundarios con estado de señales e inputs de control.
- [ ] **3.3 Navegación y Vistas:** Expandir las pestañas de IA Selection, Config y Logs (actualmente placeholders).
- [ ] **3.4 Perfiles de Tren (Blueprints):** Integración total del Parser JSON para auto-configuración de rangos (máx. amperaje, frenos, etc.).

---

## 🧭 Registro de Decisiones y Cambios de Rumbo

*En esta sección anotaremos los cambios realizados sobre el plan original y por qué se tomaron.*

| Fecha | Decisión / Cambio | Motivo |
| :--- | :--- | :--- |
| 22/02/26 | **Inicio de Documentación** | Se crea este Roadmap para separar el "Diseño" del "Seguimiento". |
| 22/02/26 | **Fusión de Diseño (Gemini + ChatGPT)** | Se adopta el layout de 3 bloques inferiores con gráfico de frenado y perfil de vía superior curvo para maximizar datos esenciales. |
| 23/02/26 | **Cambio a Vista Horizontal de Vía** | Se abandona la vista vertical para clonar fielmente el boceto "Aeronáutico/Cyberpunk" con escala métrica. |
| 23/02/26 | **Implementación de Info Bar** | Se añade una barra de estado central para centralizar avisos de señales y ETAs, liberando espacio en los widgets inferiores. |
| 27/02/26 | **Core: Protección Multi-Checkpoint** | Se migra a un sistema de cola de odómetros para soportar secuencias de señales (ej: 40-60-80). |
| 27/02/26 | **Seguridad: Override de Límite** | Se decide que cualquier reducción de límite de vía anule inmediatamente la protección de cola por seguridad ferroviaria. |
| 27/02/26 | **Testing: Suite de Validación Core** | Creación de `EJECUTAR_TESTS_V3.bat` para asegurar la integridad de la lógica matemática sin necesidad de abrir el simulador. |

---

## 🧠 Notas de Desarrollo

- *Prioridad Máxima:* **Fluidez y Precisión de Datos.** El rendimiento del PC no es la prioridad; el objetivo es que el dashboard se mueva como una interfaz real de 60FPS sin tirones (Interpolación agresiva).
- *Referencia v2 (Legacy):* La carpeta `v2` se mantendrá como base de conocimiento y código estable. Se realizarán revisiones periódicas de su lógica (especialmente mapeos de trenes y normalizaciones de sensores) para portar lo que ya funciona a la v3, mejorando su implementación.
- *IA Context:* Mantener los buffers de datos de señales siempre listos para el futuro `CommandDispatcher`.
- *Visuales:* Se permite el uso de sombras, efectos de blur y capas complejas en el Canvas si mejoran la legibilidad y el realismo.
