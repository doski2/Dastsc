# Checklist — Semana 2 Kernel

## Pre-vuelo

- [x] `npm run test -w @nexus/kernel`

## Funcional

- [x] ICE T: `brake.position` sigue palanca (VirtualBrake), no solo `combined`
- [x] 323: `brake.combined` negativo al frenar
- [x] Salida estación: salto 0 → 50 km aceptado (`stickyStationDistance`)
- [x] Cabina activa correcta (1/2/Auto en V4)
- [x] Gradiente ICE T con `gradient_sign_flip` coherente en UI

## Regresión

- [x] OCR estación no salta +40 m en aproximación (rechazo de salto)

## Cierre

- [x] Sesión en `sesiones/`
