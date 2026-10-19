# ADR 0070: Bienvenida animada al iniciar sesión

## Estado
**Implementada (2026-10-19).** Pedida en la conversación, con la intro de ElevenLabs como referencia.

## Contexto
Al iniciar sesión, la app pasaba del login al tablero de golpe, con un cargador en medio mientras llegaban los datos de la cocina.

## Decisión

### Cuándo aparece
- **Solo justo después de iniciar sesión en esta página**: con contraseña, código SMS, registro o invitación.
- `useAuth` la pide cuando llega `SIGNED_IN` y antes no había sesión.
- **No aparece** en estos casos:
  - abrir la app con la sesión ya abierta;
  - recargar;
  - refrescar el token;
  - volver a la pestaña;
  - que otra persona inicie sesión en otra pestaña.
- **Volver de Google o Instagram** recarga la página con la sesión ya en la URL, así que hoy no la muestra.
- El estado (`brandIntroState.ts`) es de una sola vez y solo vive en memoria.

### Qué muestra (`BrandIntro`, unos 3 s)
Se monta sobre toda la app, que carga debajo mientras tanto.
1. **El robot aparece** con un borde de luz de colores: una banda cónica difuminada y recortada con su silueta.
2. **Crece un degradado vivo detrás:** cuatro orbes que giran cada uno alrededor de su propio pivote.
   - Tema claro: colores pastel.
   - Tema oscuro: los orbes suman luz (`screen`).
   - Mientras tanto, el robot se corre y aparece «Quanela» a su lado.
3. **El robot guiña** y todo se desvanece con un leve acercamiento.

### Interacción
- **Puntero:** el degradado se inclina hacia él y el robot lo sigue con la cabeza. Solo con mouse o trackpad.
- **Saltarla:** un clic, un toque, Escape, Enter o espacio.
- **Foco:** nunca lo toma.
- **Lectores de pantalla:** la parte visual va con `aria-hidden` y un estado anuncia «Entrando a Quanela».

### Movimiento
- **Lo predeterminado va en CSS:** sigue fluido aunque la app esté cargando.
  - Usa `transform`, `opacity` y `clip-path`.
  - Curvas: `--ease-snappy` y una ease-in-out fuerte para el desplazamiento.
- **El seguimiento del puntero va en JS:** se suaviza en cada cuadro, en envoltorios que las animaciones de CSS no tocan.
- **Movimiento reducido:** todo aparece ya en su lugar, con solo un fundido de entrada y salida, en unos 1,1 s.

## Verificación
- **Pruebas:**
  - la pide un inicio de sesión real, y no una sesión guardada, un refresco del token ni la misma persona otra vez;
  - se va sola;
  - se salta con clic o Escape.
- **Navegador (stack local):**
  - tema oscuro, tema claro y teléfono;
  - el puntero mueve el degradado;
  - un clic y Escape la saltan;
  - al recargar no vuelve;
  - una contraseña equivocada no la muestra;
  - movimiento reducido.
