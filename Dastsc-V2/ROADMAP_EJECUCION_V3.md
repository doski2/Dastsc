# Roadmap de Ejecución: Nexus Dash v3

Este documento sirve para el seguimiento de tareas, hitos y decisiones tomadas durante la construcción del motor v3. Es un documento **vivo** que permite registrar cambios de rumbo sobre el plan original (`PLAN_ARQUITECTURA_STD.md`).

---

## 📊 Estado Actual del Proyecto

- **Fase Actual:** 0 - Preparación
- **Último Hito:** Arquitectura Base v3 Definida.
- **Próximo Paso:** Inicialización de directorios y Telemetry Hub.

---

## 🛠️ Desglose de Fases y Tareas

### Fase 1: Infraestructura y Telemetría Core

*El objetivo es procesar los datos brutos del simulador antes de que lleguen a la UI, asegurando limpieza y fluidez.*

- [ ] **1.1 Setup de Entorno v3:** Creación de carpetas `src/v3/` (core, components, hooks, profiles). *Aísla la v3 de la v2 para evitar regresiones.*
- [ ] **1.2 El Telemetry Hub:** Creación del `TelemetryProvider` optimizado. *Centraliza los datos en un único punto para ahorrar CPU y memoria.*
- [ ] **1.3 Normalizador de Datos:** Lógica de filtrado de "ruido" y normalización a metros (KM -> m). *Asegura que todas las distancias en el sistema sean consistentes.*
- [ ] **1.4 El Interpolador (Smooth Engine):** Hook de interpolación para 60fps constantes. *Rellena los huecos entre los 5Hz del simulador para lograr un movimiento líquido.*

### Fase 2: El Motor de Renderizado (Canvas Engine)

*Aquí es donde ocurre la magia del rendimiento, integrando el diseño visual de las propuestas de IA.*

- [ ] **2.1 Contenedor de Capas Canvas:** Setup del lienzo base con soporte para sombras y glows.
- [ ] **2.2 Transformación de Coordenadas de Vía:** Implementar la escala no lineal y la **línea de gradiente** (curvatura visual de la vía).
- [ ] **2.3 Renderizado de Elementos Críticos:**
  - Dibujo de **Speed Limit Circles** (estilo propuesta inicial).
  - Visualización de **Señales** con glow según su aspecto.
  - **Andenes Dinámicos:** Representación del largo del andén frente al tren.

### Fase 3: Modularidad y UI Blueprint

*Montaje final fusionando los datos del juego original con la estética moderna (3 bloques inferiores).*

- [ ] **3.1 Sistema de Slots:** Recrear el layout de 3 bloques inferiores + Barra superior ancha.
- [ ] **3.2 Atomic Library:**
  - **Velocímetro Proyectivo:** Con aguja de inercia y **Esfera de Fuerza G** (G-Force Sphere).
  - **Dynamic Graph Widget:** Gráfico intercambiable (Curva de frenado, Eficiencia, Energía).
  - **Adaptive Telemetry:** Bloque de datos con scroll o paginación para métricas secundarias.
- [ ] **3.3 Navegación y Vistas:** Implementar pestañas para Pilot, IA Selection, Config y Logs.
- [ ] **3.4 Perfiles de Tren (Blueprints):** Parser de JSON para auto-configuración de UI.

---

## 🧭 Registro de Decisiones y Cambios de Rumbo

*En esta sección anotaremos los cambios realizados sobre el plan original y por qué se tomaron.*

| Fecha | Decisión / Cambio | Motivo |
| :--- | :--- | :--- |
| 22/02/26 | **Inicio de Documentación** | Se crea este Roadmap para separar el "Diseño" del "Seguimiento". |
| 22/02/26 | **Fusión de Diseño (Gemini + ChatGPT)** | Se adopta el layout de 3 bloques inferiores con gráfico de frenado y perfil de vía superior curvo para maximizar datos esenciales. |

---

## 🧠 Notas de Desarrollo

- *Prioridad Máxima:* **Fluidez y Precisión de Datos.** El rendimiento del PC no es la prioridad; el objetivo es que el dashboard se mueva como una interfaz real de 60FPS sin tirones (Interpolación agresiva).
- *Referencia v2 (Legacy):* La carpeta `v2` se mantendrá como base de conocimiento y código estable. Se realizarán revisiones periódicas de su lógica (especialmente mapeos de trenes y normalizaciones de sensores) para portar lo que ya funciona a la v3, mejorando su implementación.
- *IA Context:* Mantener los buffers de datos de señales siempre listos para el futuro `CommandDispatcher`.
- *Visuales:* Se permite el uso de sombras, efectos de blur y capas complejas en el Canvas si mejoran la legibilidad y el realismo.
