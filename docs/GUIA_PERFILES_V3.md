# Guía de Creación de Perfiles Nexus V3 (Gold Standard)

> **V4 / AUTO:** muescas y mandos siguen en el JSON del tren; comportamiento de parada y horizonte
> de plan → géneros `regional_commuter` / `high_speed_express` ([NEXUS
> §8.5](./NEXUS_V4_ARQUITECTURA.md)).
> Captura de muescas: `nexus-profile-wizard.py`. Backlog: [PENDIENTES_V4.md](./PENDIENTES_V4.md).

Esta guía documenta la estructura necesaria para crear nuevos perfiles de trenes compatibles con el
motor de física de alta fidelidad y el HUD dinámico de la V3.

## 1. Estructura Base (JSON)

El archivo debe guardarse en `/profiles/[nombre_del_tren].json`.

```json
```

## 2. Parámetros Críticos (Cómo obtenerlos)

Para cada tren nuevo, genera un volcado propio (sin herramientas de terceros):

```bash
```

Requisito: TSC en cabina + `RailDriver64.dll`. El formato es compatible con el antiguo
`debug.txt` de interfaces joystick de terceros (`Name`, `Min`, `Max`, `value`).

También puedes abrir un `debug.txt` externo si ya lo tienes y buscar:

### A. Límites de Presión (`specs`)

Busca el control `TrainBrakeCylinderPressureBAR` o similar.

- **max_brake_cyl**: Usa el valor `Max` que aparezca en el log (ej. 7 o 5).
- **max_main_res**: Usa el valor `Max` del `MainReservoirPressureBAR` (ej. 10).

### B. Límites Eléctricos (`max_ammeter` y `max_current`)

Busca el control `Ammeter` y `Current` en el archivo de `FullEngineData`.

- **max_ammeter**: Usa el valor `Max` (ej. 1400). Escala el gauge principal.
- **max_current**: Usa el valor `Max` (ej. 1500). Define la capacidad térmica o de bus si está

  presente.

### C. Configuración Física (`physics_config`)

- **max_braking_kn**: Fuerza total en kilonewtons.
  - *Referencia:* 250-300 para trenes modernos, 400-600 para locomotoras pesadas.
- **max_braking_decel**: Deceleración de servicio máxima (m/s²).
  - *Referencia:* 1.0 (Media), 1.2 (Alta/Pasajeros), 0.7 (Pesado/Mercancías).
- **dynamic_brake_ratio**: Qué porcentaje de la frenada es eléctrica.
  - *Referencia:* 0.8 para trenes con mucho freno regenerativo, 0.2 para diesel antiguos.
- **brake_fill_time_s**: Tiempo en segundos hasta que el freno alcanza presión de servicio plena.
  - *Cómo calcularlo:* `MaxCylinderPressure / MaxApplicationRate` (del XML del tren).
  - *Class 323:* 10 BAR ÷ 2 BAR/s = **5 s** ← confirmado del XML.
  - *Referencia general:* 3-5 s (trenes de pasajeros modernos), 6-10 s (mercancías/locomotoras

      antiguas).

  - *Si no se especifica, el sistema usa 5 s por defecto.*

### D. Muescas de freno (`notches_throttle_brake`)

- Listar **todas** las posiciones del mando combinado (o palanca de freno) en orden de valor.
- `value`: posición normalizada (-1.0 a 1.0). Valores negativos = freno, positivos = tracción.
- `label`: etiqueta que aparece en la secuencia de frenado del HUD.
- La muesca `EMG` (`value: -1.0`) se **excluye** del cálculo automático de secuencias de servicio;

  solo aparece en el panel de emergencia.

- Con ≥1 muesca de servicio definida, el sistema de aprendizaje (`brakeStats`) calibra la

  deceleración real medida en sesión.

### E. Captura manual de muescas (asistente de perfil)

Para trenes nuevos (p. ej. Class 390) cuando el volcado `debug.txt` no basta:

1. Ejecutar `Asistente_Perfil.bat` o `python nexus-profile-wizard.py`.
2. Cargar o crear el perfil JSON en `profiles/`.
3. Pulsar **«Capturar muescas…»** — abre `NotchCaptureDialog`.
4. Con TSC en cabina y RailDriver activo, mover el mando muesca a muesca; el backend lee

   `GetControllerValue` vía `core/notch_capture.py` y escribe `notches_throttle_brake`.

Las muescas capturadas se guardan en el JSON del perfil (EMG, OFF, P1–P4, B1–B6, etc.). El agente
V4 y el aprendizaje `brakeStats` usan esas posiciones normalizadas — no se leen discretas desde la
DLL en tiempo real.

---

## 3. Mappings de Seguridad

Asegúrate de que `aws`, `dsd` (Vigilancia) y `dra` apunten a los nombres exactos que aparecen en el
`debug.txt`. Si el tren usa controles personalizados (ej. `MyCustomAWS`), cámbialos en la sección
`mappings`.

## 4. Notas del HUD V3

- El HUD asume que si `ammeter` es negativo, el tren está en frenada regenerativa.
- El HUD calcula automáticamente el `Traction %` dividiendo el `Ammeter` actual entre el

  `max_ammeter`.

- La **Brake Sequence** usa las muescas de `notches_throttle_brake` (excluyendo EMG) para mostrar en

  qué km/mi del odómetro aplicar cada notch. Con datos aprendidos (≥3 frenadas), muestra `✦N`; con
  estimado del perfil, muestra `~est`.

- `brake_fill_time_s` afecta directamente al margen de anticipación: `Speed × (1.5 +

  brake_fill_time_s)`. Un valor incorrecto aquí desplaza todas las muescas de la secuencia.
