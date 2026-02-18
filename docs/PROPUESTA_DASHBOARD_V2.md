# Propuesta de Evolución: Dashboard TSC V2 🚀

El prototipo actual ha servido para validar la telemetría y el sistema de alertas, pero para soportar análisis de fuerzas G, curvas de frenado y gráficos en tiempo real, necesitamos una arquitectura más robusta. Aquí presento 3 opciones para el "Siguiente Nivel".

---

## 1. Arquitectura Elegida: Dashboard Web Moderno (FastAPI + React) 🌐

Hemos seleccionado la **Opción B** para aprovechar tu experiencia previa en `telefarming` y la potencia de las tecnologías web para visualización de datos. Esta arquitectura nos permitirá escalar desde un simple HUD hasta un sistema de gestión ferroviaria completo.

### 🛠️ Stack Tecnológico Detallado

* **Backend (Motor de Telemetría):** Python + FastAPI.
  * Se encarga de leer el bridge de Lua (GetData.txt/SendCommand.txt).
  * Procesa las físicas (Fuerzas G, Distancias) en tiempo real.
  * **WebSockets:** Comunicación bidireccional de baja latencia (5Hz) con el frontend.
* **Frontend (Cabina Digital):** React + Tailwind CSS.
  * **Framer Motion:** Para animaciones ultra-suaves de agujas y barras de control.
  * **Recharts / D3.js:** Para gráficos de esfuerzo de tracción y curvas de frenado.
  * **Context API:** Gestión de estado global del tren (velocidad, señales, frenos).
* **Encapsulación (Ventana de Juego):** PyWebView.
  * Permite ejecutar la App React dentro de una ventana de Python con la propiedad `always_on_top=True`.
  * Soporte para transparencia (opcional) para superponer el HUD al simulador.

---

### 📡 Flujo de Datos y Rendimiento

1. **Captura (Python):** Lee el archivo cada 200ms.
2. **Procesado (Python):** Calcula G-Lateral ($\frac{v^2}{R}$) y G-Longitudinal.
3. **Broadcast (WebSocket):** Envía un JSON compacto al frontend.
4. **Render (React):** Los componentes se actualizan de forma reactiva sin refrescar la página.

---

## 2. Renovación de Perfiles de Tren y Ampliación

En la V2, los perfiles ya no serán solo "mapeos de nombres", sino **especificaciones técnicas** que definen cómo se ve y cómo se comporta la interfaz:

### 📂 Estructura de Perfil V2 (JSON dinámico)

```json
{
  "id": "br189_expert",
  "name": "Siemens ES64F4 (BR 189)",
  "ui": {
    "theme": "german-ebula",
    "components": ["Speedo", "Amps", "BrakeGauge", "G-Force-Ball"]
  },
  "physics": {
    "max_tractive_force": 300,
    "brake_response_delay": 0.8,
    "weight_tons": 87
  }
}
```

### 📈 Funcionalidades de Siguiente Nivel

#### 1. Análisis de Confort y Seguridad (G-Force)

* **G-Lateral:** Si superamos $0.15G$ en una curva (basado en `CurvatureActual`), el dashboard marcará un aviso de "Confort de Pasajeros superado".
* **G-Longitudinal:** Monitoriza si tus frenazos son demasiado bruscos, ideal para conducción profesional.

#### 2. Radar de Vía Inteligente

* Visualización tipo "EbuLa" o "Rolling Map".
* Predicción de punto de parada: React calculará el metro exacto donde se detendrá el tren según el frenado actual.

#### 3. Modo Modular

* **Dashboard Compacto:** Solo alertas y velocidad (para jugar en una sola pantalla).
* **Cabina Full (Tablet):** Un panel completo con todos los indicadores para usar en una tablet externa vía WiFi local.

---

## 3. Estructura del Nuevo Repositorio V2

``
Dastsc-V2/
  ├── backend/          # FastAPI + Lógica de Físicas
  │     ├── main.py
  │     ├── core/       # Parser de GetData.txt
  │     └── physics/    # Algoritmos G-Force y Frenado
  ├── frontend/         # Proyecto React (Vite)
  │     ├── src/components/
  │     ├── src/hooks/  # useTelemetry (WebSocket)
  │     └── src/styles/ # Temas Tailwind
  └── profiles/         # JSONs de trenes extendidos
``

---

**¿Qué te parece este enfoque? ¿Hacia qué tecnología te inclinas para empezar a diseñar la V2?**
