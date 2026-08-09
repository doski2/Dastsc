# Semana 9 — Genérico y trenes nuevos

**Objetivo**: AUTO con `generic.json` y alta de un tren nuevo.

## Archivos

| Archivo                       | Rol                        |
| ----------------------------- | -------------------------- |
| `profiles/nexus/generic.json` | Fallback pasajeros         |
| `nexus-debug.py`              | Volcado DLL                |
| `nexus-profile-wizard.py`     | Crear JSON                 |
| `profiles/nexus/trains/`      | Nuevo `class375.json` etc. |

## Flujo nuevo tren

1. `python nexus-debug.py --profile-draft class375`
2. Crear `profiles/nexus/trains/class375.json` con `extends: passenger`
3. Fingerprint mínimo + aliases
4. Probar AUTO → si falla, cae en genérico

## Checklist → [checklist.md](./checklist.md)
