# Investigación ETCS (European Train Control System) para Dastsc V2

Este documento recopila información técnica basada en el **Generic ETCS Driver’s Handbook (Version 2, 2025)** de la Agencia de Ferrocarriles de la Unión Europea (ERA), cubriendo especificaciones Baseline 3 y Baseline 4.

## 🏗️ Estructura de Niveles (B4 Update)

| Nivel | Comunicación | Infraestructura | Capacidad |
|-------|--------------|-----------------|
| **Nivel 0** | Ninguna | Vía no equipada o avería | Mínima (Monitorización pasiva) |
| **Nivel 1** | Puntual (Eurobalizas) | Balizas + Señales laterales | Media (Hasta 300 km/h) |
| **Nivel 2** | Continua (GSM-R) | Balizas de posición + Cantón fijo | Alta (Hasta 350 km/h) |
| **Nivel 3** | Continua (GSM-R/Sat) | Cantón móvil (Train Integrity) | Máxima (Hasta 500 km/h) |

---

## 🖥️ DMI (Driver Machine Interface - ERA Standard)

El DMI es el corazón visual del sistema. Un componente `ETCSPanel.tsx` en Dastsc V2 debería respetar las **5 zonas oficiales**:

### 1. Zonas de la Pantalla

- **Zona A (Velocímetro - Dial Circular)**:
  - **Arco de Velocidad**: Cambia de color según el estado (Gris: Normal, Amarillo: Warning, Naranja: Over speed, Rojo: Intervención).
  - **Speed Hook**: Indicador de la velocidad máxima permitida.
  - **Target Speed**: Indicador de la velocidad objetivo en la próxima restricción.
- **Zona B (Indicadores de Supervisión)**:
  - Muestra el **Modo** (FS, LS, OS, SR, SH) y el **Nivel** actual.
  - Iconos de anuncio (Ej: cambios de nivel, transiciones).
- **Zona C (Monitor de Distancia y Planning)**:
  - **Barra de Distancia Objetivo**: Indica cuánto falta para el próximo cambio de velocidad o señal de parada.
  - **Área de Planning**: Vista tipo "radar" de los próximos kilómetros (restricciones, pendientes, puentes).
- **Zona D (Información de Texto/Estado)**:
  - Mensajes de texto, estado del freno, hora y conexión GSM-R.
- **Zona E (Entrada de Datos)**:
  - Botonera lateral (virtual) para meter el ID del conductor, número de tren y datos del convoy.

### 2. Modos de Operación Críticos

| Modo | Descripción | Supervisión |
|------|-------------|-------------|-------------|
| **FS (Full Supervision)** | El sistema tiene datos completos de la vía. | Total |
| **LS (Limited Supervision)** | Supervisión parcial, señales laterales mandan. | Parcial |
| **OS (On Sight)** | Permite entrar en cantón ocupado a baja velocidad. | Velocidad Máx. |
| **SR (Staff Responsible)** | Responsabilidad total del conductor (tras fallo). | Límite SR |
| **SH (Shunting)** | Modo maniobras en estaciones/talleres. | Límite SH |

---

## 📈 Lógica de Supervisión (Braking Curves)

El sistema calcula múltiples curvas de frenado para proteger al tren:

1. **Permitted Speed (V_perm)**: La velocidad que el conductor debe mantener.
2. **Indication (I)**: Aviso visual/sonoro de que viene una reducción.
3. **Warning (W)**: Aviso crítico de exceso de velocidad.
4. **Service Brake Intervention (SBI)**: Aplicación automática de freno de servicio.
5. **Emergency Brake Intervention (EBI)**: Aplicación de freno de emergencia.

---

### Implementación de Código (Referencia: cesarBLG/ETCS)

Tras revisar implementaciones open-source como la de César Benito, se observan patrones clave para la lógica del sistema:

- **Egestión de Mensajes**: Uso de colas (`deque<string>`) para gestionar las alertas de texto en la Zona D.
- **Cálculo de Curvas**: Implementación de conversiones constantes como `METERS_TO_FEET` (3.2808) y `KMH_TO_MPH` (0.621) para compatibilidad con sistemas imperiales (UK/USA).
- **Manejo de Paquetes**: Estructuras de datos para variables específicas (`Q_SCALE`, `D_GRADIENT`, `V_STATIC`) que definen el perfil de velocidad.

## 🚀 Implementación en Dastsc V2 (Propuesta Técnico-Visual)

### Detección de Eurobalizas Virtuales

... (resto del contenido) ...

En Train Simulator, podemos usar la distancia a la siguiente señal o hito (obtenida mediante `GetNextSignalDistance()`) para simular la "lectura de baliza" y actualizar el DMI.

### Componentes Sugeridos

- `ETCS_SpeedDial`: Con arco de color dinámico (SVG/Framer Motion).
- `ETCS_PlanningArea`: Una barra vertical que se desplaza según la posición del tren.
- `ETCS_IconGrid`: Para representar fielmente los iconos de la ERA.

---
*Documento basado en el Generic ETCS Driver's Handbook de la ERA. Referencia: [era.europa.eu](https://www.era.europa.eu/)*
