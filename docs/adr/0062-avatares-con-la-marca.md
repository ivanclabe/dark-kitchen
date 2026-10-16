# ADR 0062: Avatares e íconos con la marca

## Estado
**Aceptada e implementada (2026-10-15).** Registro a posteriori: los cambios se pidieron y se aprobaron en la conversación (opción B).

## Decisiones
- Los 20 íconos de cuenta y los avatares de persona usan seis tonos de la familia de Quanela: brasa, terracota, café, crema, salvia y cielo. Tienen volumen (brillo, sombra) y un borde sutil para el tema claro. El renderizador es `src/shared/avatars/Avatar.tsx` y la paleta está en `art/palette.ts`.
- Cada persona tiene su propia expresión (ojos y boca), definida en `art/personParts.tsx` → `Face`.
- El avatar «robot» es la mascota, y se suman 5 caras del robot: `robot-wink`, `robot-love`, `robot-idea`, `robot-surprised` y `robot-sleepy`. Por eso la galería pasa de 20 a 25.
- **Migración** `20261015120000_dk_avatar_robots.sql`:
  - solo amplía el CHECK de `dk_users.avatar_key`;
  - no cambia ni borra valores;
  - está aplicada en producción.
- **Avatar por defecto:** el de quien nunca eligió se sigue derivando de los 20 originales (`Gallery.derivedFrom`), así que no cambia la cara de nadie. Lo verifica `catalog.test.ts`.

Las capturas están en `docs/qa/avatares/`.
