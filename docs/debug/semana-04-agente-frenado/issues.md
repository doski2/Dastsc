# Issues — Semana 4 (`brake/`)

| ID | Síntoma | Área | Estado |
| -- | ------- | ---- | ------ |
| B4-01 | OFF en aproximación estación porque objetivo release = límite mph | `commandBus` | **Corregido** — objetivo 0 con plan STATION |
| B4-02 | Parada ~27–29 m, freno suelto a 35 m | `planBrake` + `commandBus` | **Corregido** — terminal B3, final_stop 35 m (323) |
| B4-03 | Giro cabina: plan estación con ancla 97–129 m | `planBrake` + backend OCR | **Corregido** — suppress + reject door_anchor corto |
| B4-04 | Límite + estación juntos frenan mal | `selectUrgentBrakePlan` | **Corregido** — cluster 350 m |
| B4-05 | Holgura ETA frena demasiado pronto cerca andén | `schedule.ts` | **Corregido** — coast cutoff 100 m |

## Plantilla nuevo issue

```markdown
### B4-XX — título corto

- **Archivo(s)**:
- **Repro**:
- **Log** (`session_…json`, timestamp):
- **Esperado / real**:
```
