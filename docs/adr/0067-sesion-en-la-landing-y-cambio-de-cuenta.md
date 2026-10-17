# ADR 0067: Sesión en la landing y cambio de cuenta

## Estado
**Implementada (2026-10-17).** Se pidió en la conversación. La causa era que, con una sesión guardada en el navegador, la landing solo ofrecía «Ir a mi cuenta» y no había forma de entrar con otra cuenta ni de registrar a alguien nuevo sin borrar el navegador.

Revisa la decisión D4 del ADR 0025 («quien ya tiene usuario va a su cuenta»).

## Causa raíz
1. **La sesión se guarda en el navegador y la landing solo miraba `session`.** En producción está en una cookie de `.quanela.com` (ADR 0021); en desarrollo, en `localStorage`. La barra, el hero, el pie y los botones de precios mostraban solo «Ir a mi cuenta»: no había «Cerrar sesión» ni «Crear cuenta».
2. **`/login` redirigía siempre que había sesión.** No había cómo entrar con otra cuenta.
3. **`/registro` mandaba a la app a quien ya tenía usuario.** Registrar un negocio nuevo exigía borrar el navegador.
4. **La sesión no se verificaba.** Venía de `getSession()`, que solo lee el equipo: una sesión revocada o de un usuario borrado se veía como válida. Además, al cerrar sesión no se limpiaba la caché de datos (React Query) ni la cuenta y el rol activos en memoria, así que al cambiar de cuenta podían asomarse datos de la anterior.

## Decisión
- **`AuthProvider` verifica la sesión guardada con Supabase Auth (`getUser`) antes de mostrarla como válida.** El perfil se lee al mismo tiempo, así que el inicio no es más lento.
  - Si el servidor la rechaza (revocada, usuario borrado, sin sesión), se cierra en este equipo.
  - Sin conexión, se conserva, como antes.
- **Cerrar sesión** (solo esta app en este equipo; el portal admin conserva la suya):
  - limpia la caché de datos, la cuenta y el rol activos y la marca de «elegir cuenta»;
  - no borra preferencias del navegador (tema, última cuenta).
  - Si no se pudo cerrar, lo dice y la sesión sigue.
  - Lo mismo pasa cuando la sesión se cierra en otra pestaña o entra otra persona.
- **Landing:**
  - sin sesión: «Iniciar sesión» y «Crear cuenta»;
  - con sesión: «Ir a mi cuenta» y «Cerrar sesión», con confirmación o error en un aviso;
  - mientras se confirma la sesión, un indicador de carga del mismo ancho;
  - los botones de los planes siempre llevan al registro.
- **`/login` con sesión abierta:** «Ya iniciaste sesión como …», con «Continuar con esta cuenta» o «Usar otra cuenta».
  - Quien acaba de iniciar sesión ahí entra directo.
  - Siguen entrando directo: la vuelta de Google, Instagram o el teléfono, y un enlace con `?next=` (por ejemplo, una invitación).
- **`/registro` con sesión abierta:** «Ir a mi cuenta» o «Cerrar sesión y crear cuenta». Se queda en el registro y conserva el plan elegido.
  - La regla D3 del ADR 0025 no cambia: quien vuelve de Google, Instagram o el teléfono sin negocio entra con correo.
- **Lo que no cambia:** rutas privadas, RLS y aislamiento entre negocios. `ProtectedRoute` sigue pidiendo sesión y perfil, ahora con la sesión ya verificada.

## Verificación
- **Vitest:** 935 pruebas, con las nuevas de:
  - `useAuth`: verificación, sesión rechazada, sin conexión, limpieza al salir y otra persona en otra pestaña;
  - la barra de la landing en sus tres estados y el error al salir;
  - `/login` y `/registro` con sesión abierta.
- **Navegador, en el stack local:**
  - landing sin sesión y con sesión;
  - iniciar sesión;
  - `/login` con sesión, y cambiar de Laura a Mateo;
  - `/registro` con sesión, cerrando sesión y conservando el plan;
  - cerrar sesión desde la landing, con su confirmación;
  - `/app` sin sesión lleva al login;
  - la sesión guardada de un usuario borrado en el servidor deja de mostrarse y se limpia.
