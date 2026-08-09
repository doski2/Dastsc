# Checklist — Semana 4 Frenado

## Pre-vuelo

- [ ] `npm run test -w @nexus/agent`

## Funcional

- [ ] AUTO frena antes de cartel (S7/S3 o B3/B2 según tren)
- [ ] NEU/OFF al alcanzar velocidad objetivo + margen
- [ ] No re-frena en coast tras OFF correcto (latch límite)
- [ ] Calibración aprendida mejora plan (stats en backend por `profile=icet`)

## Por perfil (probar ambos)

- [ ] ICE T: split, `isBrakeApplied` por `position`
- [ ] 323: combined negativo

## Cierre

- [ ] Ajustes de `physics_config` solo en JSON del tren si aplica
