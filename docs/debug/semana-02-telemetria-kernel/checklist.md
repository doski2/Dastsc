# Checklist — Semana 2 Kernel

## Pre-vuelo

- [ ] `npm run test -w @nexus/kernel`

## Funcional

- [ ] ICE T: `brake.position` sigue palanca (VirtualBrake), no solo `combined`
- [ ] 323: `brake.combined` negativo al frenar
- [ ] Salida estación: salto 0 → 50 km aceptado (`stickyStationDistance`)
- [ ] Cabina activa correcta (1/2/Auto en V4)
- [ ] Gradiente ICE T con `gradient_sign_flip` coherente en UI

## Regresión

- [ ] OCR estación no salta +40 m en aproximación (rechazo de salto)

## Cierre

- [ ] Sesión en `sesiones/`
