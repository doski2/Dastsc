# Nexus Dash v3 - Reinventando la Telemetría TSC (Desde Cero)

Este documento define la arquitectura **v3**, un motor de dashboard modular y dinámico que sustituye el diseño estático de la v2.

---

## 1. Filosofía de Diseño v3: "The Modular Engine"

A diferencia de versiones anteriores, la v3 no es un solo panel estático, sino un ecosistema de módulos que se ensamblan en tiempo real.

### Pilares Clave

* **Grid Layout Dinámico:** Los componentes se posicionan según el perfil del tren (ej: Cinta a la izquierda o derecha, dial central o lateral).* **Sistema Multi-Pestaña (Views):** El dashboard se organiza en vistas especializadas:
  * **PILOT:** Conducción pura (Velocidad, Vía, HUD de Seguridad).
  * **IA & TECH:** Telemetría avanzada, Gráficos de rendimiento y curvas de frenado.
  * **SYSTEM:** Selección de perfil, configuración y Log de eventos de sistema.* **Interpolación de Movimiento:** Aunque el simulador envíe datos a 5Hz, la UI interpola los valores para que el movimiento de agujas y cintas sea fluido (60 FPS constantes).
* **Normalización Proactiva:** El motor "entiende" el contexto de la ruta (señalización, unidades) y limpia el ruido de los datos antes de pintar la interfaz.

### Relación con Versiones Anteriores (Legacy v2)

La arquitectura v3 no descarta el trabajo realizado en la v2. Se establece una política de **"Ingeniería de Transición"**:

* **Base de Conocimiento:** El código de la v2 (específicamente `NexusDashboard.tsx`) se usará como referencia constante para los mapeos de sensores y lógica de seguridad (AWS, DSD, DRA).
* **Validación Cruzada:** Durante la fase de prototipado, los datos procesados por el nuevo `TelemetryHub v3` se compararán con los resultados de la v2 para asegurar que no hay regresiones en la precisión.
* **Refactorización Selectiva:** Solo se portará la lógica que haya demostrado ser estable, traduciéndola de un enfoque basado en DOM (v2) a un enfoque basado en Datos y Canvas (v3).

---

## 2. Nueva Estructura de Directorios

```text
src/v3/
 ├── core/              # Motor de telemetría, lógica de física y estados globales.
 ├── components/
 │    ├── atoms/        # LEDs, Labels, ProgressBars, Iconos (Piezas atómicas).
 │    ├── modules/      # Componentes complejos (SpeedoDial, LinearTape, PhysicsBox).
 │    └── layouts/      # Plantillas de montaje (Pilot Mode, ETCS-style, Classic).
 ├── hooks/             # useV3Telemetry (limpieza de datos), useSmoothValue.
 └── profiles/          # Nuevos Blueprints JSON con definición de UI.
```

---

## 3. Telemetry Hub v3 (El Corazón)

El `TelemetryProvider` se encarga de:

1. **Limpieza de Datos (Denoising):** Eliminar saltos bruscos en la velocidad/aceleración causados por el motor de TSC.
2. **Cálculos de Física Avanzada:** Cálculo de Masa Total real, estimación de curva de frenado y **Projected Speed** (predicción de velocidad en 10s).
3. **Normalización Métricas:** Todo cálculo interno se hace en metros y m/s². La conversión a MPH/KPH es solo una capa visual final.

---

## 4. Sistema de Blueprints (Perfiles v3)

El JSON deja de ser solo una lista de variables y pasa a definir la **interfaz**:

```json
{
  "train_id": "Class465_Expert",
  "blueprint": "Modern_Pilot",
  "modules": {
    "center": "CircularOrbitDial",
    "right": "LinearTape_8km_NonLinear",
    "left": "TractionBrake_Vertical",
    "bottom": "LogFeed_Minimal"
  },
  "physics_config": {
    "braking_curve_assist": true,
    "max_effort_kn": 240
  }
}
```

---

## 5. Estaciones y Operación Inteligente (IA Context)

La v3 no solo observa, sino que anticipa y prepara el terreno para la automatización futura.

### A. Módulo de Estaciones (Station Landing Assist)

* **Detección de Plataforma:** Identificación de la próxima parada, longitud del andén y lado de apertura de puertas.
* **Braking Glide Slope:** Una guía visual en el velocímetro que muestra el "punto de no retorno" para frenar y clavarse en el hito de parada.
* **Countdown Dinámico:** Tiempo estimado de llegada (ETA) y distancia precisa al punto de detención.

### B. Capa de Integración IA (The Command Dispatcher)

La estructura v3 está diseñada para ser bidireccional mediante el sistema `SendCommand.txt`:

* **Virtual Co-Pilot:** Sistema que puede reconocer y confirmar AWS/DSD automáticamente si se activa en el perfil.
* **Smart Cruise Control:** Mantenimiento de velocidad objetivo basado en los límites detectados en la Planning Tape.
* **Energy Optimizer:** IA que sugiere puntos de inercia (coasting) para ahorrar energía/combustible basándose en el gradiente de la vía.

---

## 6. Motor Visual y Estilización (The Visual Engine)

El diseño visual definitivo se basa en un **Dashboard Tecnológico de Alta Densidad** (basado en el Mockup v3.5) con las siguientes especificaciones:

* **Estética "Muted Tech":** Se prioriza la legibilidad bajando la intensidad de los brillos y neones (menos glow en los LEDs) para evitar la fatiga visual en sesiones largas. Estilo profesional y serio.
* **Sistema de Navegación por Pestañas:** Organización modular en 4 vistas principales: `PILOT`, `IA ASSIST`, `SYSTEM LOG`, `CONFIG`.

### A. Componentes Clave del Layout

1. **Track Profile Canvas (Superior):**
    * Perfil de vía con gradientes reales y curvatura visual.
    * Señalización inteligente y contador de ETA / Hora Local.
    * Zoom dinámico (Efecto Lente) en el horizonte de 8km.
2. **Speed & G-Force Module (Inferior Izq.):**
    * Dial circular con aguja proyectiva (predicción de velocidad a 10s).
    * **Esfera de Inercia 3D** para visualización de fuerzas G y balanceo.
    * Indicadores laterales de muescas (Notches) y estado de puertas.
3. **Adaptive Telemetry (Inferior Central):**
    * Panel dinámico para Amperaje, Presión (PSI/BAR), Masa y Esfuerzo de tracción.
    * Soporte para scroll/paginación para métricas técnicas secundarias.
4. **Switchable IA Graph (Inferior Der.):**
    * Ventana de gráficos intercambiables (Curva de Frenado, Eficiencia, Energía).
    * Botón de estado y activación del sistema **Auto-Dispatch**.

---

## 7. Control de Calidad y Puntos Ciegos (Revisión v3.1)

Para garantizar la estabilidad, hemos identificado y añadido los siguientes controles:

1. **Capa de Simulación Inversa (Mock Mode):**
    * El motor v3 incluirá un modo `DEV_MOCK` que genera telemetría sintética. Esto permite diseñar la UI y probar la IA sin necesidad de ocupar recursos ejecutando el TSC en paralelo.
2. **Gestor de Interrupciones (Alert Priority):**
    * Un sistema de "Capas de Pánico". Si ocurre un evento crítico (AWS no confirmado, Overspeed > 5mph), el HUD debe poder "secuestrar" el foco visual de todos los módulos.
3. **Normalización de Unidades Dual:**
    * Aunque el motor interno es métrico 100%, la visualización debe ser conmutable entre MPH/KPH en tiempo real sin reiniciar el dashboard.
4. **Logger de Sesión (Black Box):**
    * Registro de los últimos 5 minutos de telemetría en memoria para poder analizar errores de la IA o de renderizado Canvas "post-mortem".

---

## 8. Hoja de Roadmap Inmediata (Detallada)

### Fase 1: Infraestructura (Semana 1)

1. **Setup de Directorios:** Crear `src/v3/` y sus subcarpetas.
2. **Telemetry Provider v3:** Migrar la lógica de conexión actual a un Context de React optimizado con `useMemo`.
3. **Capa de Smoothing:** Implementar el hook `useSmoothValue(raw, duration)`.

### Fase 2: El Motor Visual (Semana 2)

1. **Canvas Base:** Crear el componente contenedor del perfil de vía.
2. **Grid System:** Definir los 5 "Slots" principales del dashboard (Left, Center, Right, Top, Bottom).
3. **Módulo de Cinta (MVP):** Dibujar los límites de velocidad mediante Canvas.

### Fase 3: Inteligencia (Semana 3)

1. **Predictor de Frenado:** Primera versión del algoritmo de "Distancia de Parada Segura".
2. **Command Center:** Interfaz para enviar comandos al simulador.

---

## 9. Estructura de Datos "IA-Ready"

Para que la IA pueda tomar decisiones en el futuro, los módulos enviarán los datos en un formato estándar (Buffer):

* **Horizonte de Eventos:** El sistema mantiene una lista de los próximos 3 eventos (Señal -> Límite -> Estación).
* **Vectores de Decisión:** Cada evento incluye una distancia y una "acción requerida" (ej: `REDUCE_TO_40`, `STOP_AT_PLATFORM`).
* **Métrica de Margen:** Cálculo constante de cuántos metros de margen le quedan al tren antes de que el frenado deba ser máximo para cumplir con el siguiente hito.

---

## 8. Hoja de Roadmap Inmediata

1. **Sandbox de Telemetría:** Construir el motor de procesamiento fuera de la UI actual para probar la estabilidad.
2. **Librería de Átomos:** Crear los componentes visuales básicos con Tailwind y Framer Motion perfectamente optimizados.
3. **Módulo de Cinta v3:** Implementar la escala no lineal real (0-3km zoom) como un módulo independiente.
4. **Layout Switching:** Conseguir que el dashboard cambie de aspecto instantáneamente al detectar un perfil diferente.
