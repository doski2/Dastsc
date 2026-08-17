# Checklist — Semana 6 V4 AUTO

## Funcional

- [ ] `isBackendConnected` vs `isGameLinked` correctos
- [ ] AUTO pausa sin telemetría TSC
- [ ] AUTO vuelve a SUGGEST si ack falla
- [ ] Reintento NEU cada 2 s mientras `stillBraking`
- [ ] Headline / plan de frenado coherente con acción
- [ ] Gradiente: **Raw juego** vs **Plan freno** coherentes con rampa (+ subida → plan positivo)
- [ ] Botón **+ directo / − invertir** persiste tras recargar V4
- [ ] Tabla muescas muestra bandas Alta / Media / Baja (`brakeStats`)
- [ ] `DriveHudBar` visible fija: velocidad, límite, próximo límite, cola, Anclar OCR
- [ ] Layout `xl`: columna frenado no oculta headline ni horizonte
- [ ] Selector perfil: AUTO (legacy + Nexus) + manual

## Cierre

- [ ] Sesión en `sesiones/`
