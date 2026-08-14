# Semana 3 — Backend y comandos

**Objetivo**: mandos llegan al simulador con el perfil correcto.

## Archivos

| Archivo                                       | Rol                                            |
| --------------------------------------------- | ---------------------------------------------- |
| `Dastsc-V3/backend/core/command_bus.py`       | SendCommand, split throttle:0                  |
| `Dastsc-V3/backend/core/profiles.py`          | Carga `profiles/` legacy + `profiles/nexus/**` |
| `Dastsc-V3/backend/core/profile_auto.py`      | AUTO por fingerprint; pool legacy detectables  |
| `Dastsc-V3/backend/tests/test_command_bus.py` | Tests NEU split                                |

## Checklist → [checklist.md](./checklist.md)
