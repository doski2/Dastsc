# Roadmap de Desarrollo: Dastsc V2 (FastAPI + React) 🚆

Este documento detalla la hoja de ruta para la migración del prototipo Tkinter a una arquitectura moderna de alto rendimiento. Trabajaremos de forma modular para asegurar la estabilidad en cada paso.

---

## Fase 0: Preparación de la Estructura V2

*Antes de escribir código, estableceremos el nuevo esqueleto del proyecto para separar el motor de datos de la interfaz.*

1. **Creación del Workspace V2:**
    * Generar carpeta raíz `Dastsc-V2/`.
    * Inicializar repositorio Git.
    * Configurar entorno virtual de Python (`.venv`) con dependencias iniciales: `fastapi`, `uvicorn`, `websockets`, `pywebview`.
2. **Scaffolding del Frontend:**
    * Crear proyecto React usando **Vite** (`npm create vite@latest frontend -- --template react`).
    * Instalar Tailwind CSS para estilos rápidos y profesionales.
    * Instalar `framer-motion` (animaciones) y `recharts` (gráficos).

---

## Fase 1: El Cerebro (Backend Fast API)

*El objetivo aquí es transformar el archivo de texto estático de Lua en una corriente de datos (stream) continua.*

1. **Motor de Ingesta (Core):**
    * Migrar la lógica de lectura de `GetData.txt` a una clase de Python asíncrona.
    * Implementar un "Buffer" que guarde los últimos estados para cálculos de tendencias.
2. **Servidor de WebSockets:**
    * Crear un endpoint `/ws/telemetry`.
    * Frecuencia de envío: 5Hz (coincidente con el script Lua).
    * Estructura de JSON optimizada para reducir el ancho de banda.
3. **Lógica de Físicas Avanzada:**
    * **Cálculo G-Lateral:** Implementar la fórmula $G_l = \frac{v^2}{R \cdot 9.81}$ usando la curvatura capturada.
    * **Predictor de Frenado:** Algoritmo que calcule la distancia de parada basada en la masa actual (`GetConsistTotalMass`) y la presión de cilindros.

---

## Fase 2: Comunicaciones y Hooks (Frontend)

*Establecer la conexión entre el simulador y la interfaz.*

1. **Hook `useTelemetry`:**
    * Crear un Custom Hook en React para gestionar la conexión WebSocket.
    * Manejo de estados de reconexión automática si el simulador se cierra/abre.
2. **Contexto Global del Tren:**
    * Uso de React Context para que cualquier componente (velocímetro, mapa, etc.) pueda acceder a la velocidad o señales sin "prop-drilling".

---

## Fase 3: UI - Componentes de Cabina (VisualV)

*Aquí es donde el dashboard cobra vida visualmente.*

1. **Kit de Componentes (Atomic Design):**
    * **Gauge:** Componente base para velocímetros y manómetros analógicos.
    * **DigitalStrip:** Barras de esfuerzo de tracción/frenado (estilo Siemens/Bombardier).
    * **SignalCard:** Visualización dinámica de la próxima señal (cambio de color y distancia).
2. **Sistema de Temas (Skins):**
    * Definir estilos por país/fabricante (ej: "German ICE style", "UK Modern style").
3. **Alertas Inmersivas:**
    * Efectos de parpadeo de pantalla total usando `AnimatePresence` de Framer Motion.

---

## Fase 4: Perfiles V2 y Radar de Vía

*Inteligencia geográfica y de material rodante.*

1. **JSON Extendido:**
    * Añadir parámetros de "confort de frenado" y límites de G-Force por perfil.
2. **Rolling Map (Radar):**
    * Una línea de tiempo horizontal que se desliza mostrando:
        * Próximos cambios de pendiente.
        * Curvas peligrosas.
        * Balizas AWS/TPWS.

---

## Fase 5: Integración y "Always on Top"

*El paso final para que el dashboard sea útil mientras juegas.*

1. **Contenedor PyWebView:**
    * Script `launcher.py` que arranca el backend de FastAPI y abre una ventana nativa de Windows que carga `localhost:5173`.
    * Propiedad `always_on_top` activada.
2. **Bucle de Control IA (Opcional/Fase 6):**
    * Integración de `SendCommand.txt` para que el Dashboard pueda tomar control del tren (Smart Cruise Control).

---

**¿Empezamos con el paso 1 de la Fase 0 (Creación de la estructura base)?**
