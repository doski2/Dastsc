# Issues — Semana 5

| ID    | Síntoma                                                                                          | Causa                                                               | Estado                                                                               |
| ----- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| B5-01 | Parada adelantada ~140 m (390 → Watford); log con ráfaga `rejected_jump` en `mid_leg_correction` | Odómetro adelantado vs millas HUD; rechazo ciego OCR > computed+5 m | **Corregido** — `_max_upward_drift_m`, cooldown 60 s tras cualquier OCR (`ago 2026`) |
