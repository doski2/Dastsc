# Guía de Creación de Perfiles Nexus V3 (Gold Standard)

Esta guía documenta la estructura necesaria para crear nuevos perfiles de trenes compatibles con el motor de física de alta fidelidad y el HUD dinámico de la V3.

## 1. Estructura Base (JSON)

El archivo debe guardarse en `/profiles/[nombre_del_tren].json`.

```json
{
    "name": "Nombre Comercial del Tren",
    "fingerprint": {
        "required_controls": [
            "ThrottleAndBrake",
            "DRA",
            "DVDAlarm"
        ]
    },
    "mappings": {
        "combined_control": "ThrottleAndBrake",
        "reverser": "UserVirtualReverser",
        "brake_pipe": "BrakePipePressureBAR",
        "brake_cylinder": "TrainBrakeCylinderPressureBAR",
        "main_reservoir": "MainReservoirPressureBAR",
        "ammeter": "Ammeter",
        "effort": "TractiveEffort",
        "vcb_light": "VCB Light",
        "regen_switch": "RegBrakeSwitch",
        "dra": "DRA",
        "aws": "AWS",
        "dsd": "DVDAlarm"
    },
    "specs": {
        "max_ammeter": 1400.0,
        "max_brake_cyl": 7.0,
        "max_main_res": 10.0,
        "max_speed": 100,
        "notches_throttle_brake": [
            {"value": -1.0, "label": "EMG"},
            {"value": -0.75, "label": "B3"},
            {"value": 0.0, "label": "OFF"},
            {"value": 1.0, "label": "P4"}
        ]
    },
    "physics_config": {
        "max_braking_kn": 250,
        "max_braking_decel": 1.1,
        "dynamic_brake_ratio": 0.8
    }
}
```

## 2. Parámetros Críticos (Cómo obtenerlos)

Para cada tren nuevo, abre el archivo `debug.txt` del simulador y busca:

### A. Límites de Presión (`specs`)

Busca el control `TrainBrakeCylinderPressureBAR` o similar.

- **max_brake_cyl**: Usa el valor `Max` que aparezca en el log (ej. 7 o 5).
- **max_main_res**: Usa el valor `Max` del `MainReservoirPressureBAR` (ej. 10).

### B. Límites Eléctricos (`max_ammeter` y `max_current`)

Busca el control `Ammeter` y `Current` en el archivo de `FullEngineData`.

- **max_ammeter**: Usa el valor `Max` (ej. 1400). Escala el gauge principal.
- **max_current**: Usa el valor `Max` (ej. 1500). Define la capacidad térmica o de bus si está presente.

### C. Configuración Física (`physics_config`)

- **max_braking_kn**: Fuerza total en kilonewtons.
  - *Referencia:* 250-300 para trenes modernos, 400-600 para locomotoras pesadas.
- **max_braking_decel**: Deceleración de servicio (m/s²).
  - *Referencia:* 1.0 (Media), 1.2 (Alta/Pasajeros), 0.7 (Pesado/Mercancías).
- **dynamic_brake_ratio**: Qué porcentaje de la frenada es eléctrica.
  - *Referencia:* 0.8 para trenes con mucho freno regenerativo, 0.2 para diesel antiguos.

## 3. Mappings de Seguridad

Asegúrate de que `aws`, `dsd` (Vigilancia) y `dra` apunten a los nombres exactos que aparecen en el `debug.txt`. Si el tren usa controles personalizados (ej. `MyCustomAWS`), cámbialos en la sección `mappings`.

## 4. Notas del HUD V3

- El HUD asume que si `ammeter` es negativo, el tren está en frenada regenerativa.
- El HUD calcula automáticamente el `Traction %` dividiendo el `Ammeter` actual entre el `max_ammeter`.
