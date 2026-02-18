# Guía de Tipos de Frenos en TSC Advanced Dashboard

Para la Fase 4 (Automatización), el sistema distingue entre varios tipos de frenado para aplicar la fuerza de forma realista.

## 1. COMBINED_BLENDED (Mando Único Inteligente)

* **Trenes típicos:** Class 323, Class 375, Class 450.
* **Funcionamiento:** Una sola palanca controla tracción y freno. El tren decide automáticamente cuánta fuerza eléctrica (dinámica) y cuánta de aire (neumática) usar.
* **En el Dashboard:** Aparecerá como `FRENADO (COMBINED_BLENDED)`.

## 2. DISCRETE_AIR (Frenos Neumáticos Independientes)

* **Trenes típicos:** Locomotoras de carga (BR189, Class 66).
* **Funcionamiento:** Palancas separadas para el regulador y el freno de tren. El freno de aire tiene un retardo natural (llenado de tubería).
* **En el Dashboard:** Aparecerá como `FRENADO (DISCRETE_AIR)`.

## 3. COMBINED_EP (Electro-Pneumatic)

* **Trenes típicos:** Class 390 Pendolino, Clase 319.
* **Funcionamiento:** Respuesta casi instantánea gracias a válvulas eléctricas en cada vagón.
* **En el Dashboard:** Aparecerá como `FRENADO (COMBINED_EP)`.

## 4. COMBINED_PZB (Sistema Alemán)

* **Trenes típicos:** BR442 Talent 2, BR407 ICE.
* **Funcionamiento:** Similar al blended pero con integración en los sistemas de seguridad PZB/LZB alemanes.

---

### Cómo actualizar un perfil manualmente

Añade este bloque a cualquier archivo `.json` en la carpeta `profiles/`:

```json
"brakes": {
    "type": "NOMBRE_DEL_TIPO",
    "control": "NombreDelControl",
    "has_dynamic": true/false,
    "system": "SistemaFisico"
}
```
