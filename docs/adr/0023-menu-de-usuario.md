# ADR 0023: Menú de usuario con submenús, Apariencia y Ayuda

## Estado
**Aprobada (2026-10-02) con las recomendaciones D1–D6, y ejecutada.** Resultados en la sección 7. Sin contacto de soporte por ahora: esas opciones quedan ocultas (D3).

Referencia: el menú de cuenta de Snowflake. Arriba quién eres; luego el **rol** y la **cuenta**, cada uno con su submenú lateral; después las opciones y, al final, los detalles de la sesión y cerrar sesión.

---

## 1. Auditoría (2026-10-02)
| Hoy | Problema |
|---|---|
| `src/app/UserMenu.tsx` con `Popover`: cambiar de rol, de cuenta o de organización **reemplaza el contenido** del mismo panel («← Volver») | No hay submenús laterales como en la referencia |
| El centro de administración tiene **otro menú** (`OrgUserMenu` en `OrgAdminLayout.tsx`) | Dos menús distintos para lo mismo |
| La app es **solo oscura**: unas 1.300 clases `neutral-*` fijas y ningún tema claro | «Apariencia» con tema claro no existe |
| Las preferencias de este equipo (sonido, tamaño de Cocina, voz) viven en `localStorage` por dispositivo | Mismo patrón para Apariencia |
| No hay un contacto de soporte configurado (correo o WhatsApp) | No hay a dónde llevar «Contactar soporte» |

## 2. El menú nuevo
```
┌───────────────────────────────┐
│ (A)  Ana Ruiz                 │
│      ana@correo.com           │
├───────────────────────────────┤
│ Cambiar de rol                │
│ 👤 Administrador            › │──► Administrador ✓ · Cocina · Caja
├───────────────────────────────┤
│ Cuenta                        │
│ 🏪 Brasa Centro             › │──► DARK KITCHEN · FR3RK6
│                               │    🏪 Brasa Centro ✓   Administrador
│                               │    🏪 Brasa Norte      Cocina
│                               │    ───────────────
│                               │    Ver detalles de la cuenta
│                               │    Cambiar de organización ›  ──► orgs con su código
│                               │    Tus cuentas
├───────────────────────────────┤
│ 👤 Mi perfil                  │
│ 🗓 Mis turnos                 │
│ ⚙ Configuración               │   (con permiso)
│ 👥 Equipo de la cuenta        │   (con permiso)
│ 🏢 Administración de la org.  │   (con permiso)
│ ◐ Apariencia                › │──► Tema: Oscuro · Claro · Según el sistema
│                               │    Tamaño del texto: Normal · Grande
│ ⓘ Ayuda y soporte           › │──► Atajos de teclado
│                               │    Preguntar a Copilot (si está disponible)
│                               │    Reportar un problema
│                               │    Contactar soporte ↗ (si está configurado)
│                               │    Centro de ayuda ↗ (si está configurado)
├───────────────────────────────┤
│ ◷ Detalles de la sesión       │──► ventana con usuario, organización y código,
│ ⇥ Cerrar sesión               │    cuenta, rol, permisos, dispositivo, versión
└───────────────────────────────┘
```
- **Submenús laterales en escritorio.** Se abren con un toque o al pasar el cursor; con el teclado, → abre, ← cierra, ↑/↓ recorren y Esc cierra.
- **En el celular, en el mismo panel** con «‹ Volver», porque un submenú lateral no cabe.
- **El mismo componente en las dos partes.** En la cuenta y en el centro de administración; allí la sección «Cuenta» muestra la organización.
- **Opciones según permisos.** Lo que tu rol no puede usar no aparece.

### 2.1 Apariencia (en este equipo)
- **Tema: Oscuro (como hoy), Claro o Según el sistema.**
  - El tema claro se hace **en un solo lugar**: el CSS redefine la escala `neutral` invertida bajo `[data-theme=light]`. La app ya usa esa escala para todo, así que no hay que tocar 1.300 clases.
  - Los colores de marca, estados y gráficos se mantienen.
  - Se publica como **«Claro (beta)»**, y se ajustan a mano los pocos lugares que no usen la escala (fondos de imagen, sombras, el QR).
- **Tamaño del texto: Normal o Grande** (escala de la raíz), útil en tablets de cocina.
- **Se aplica antes del primer pintado**, con un script mínimo en `index.html` que evita el destello.
- **Se guarda por dispositivo,** igual que el sonido y el tamaño de Cocina.

### 2.2 Ayuda y soporte
| Opción | Qué hace |
|---|---|
| **Atajos de teclado** | Ventana con todos: `N` nuevo pedido, `/` buscar, `Ctrl/⌘ + J` Copilot, `Esc` cerrar, flechas en menús |
| **Preguntar a Copilot** | Abre Copilot (si la cuenta lo tiene) |
| **Reportar un problema** | Formulario corto (qué pasó). Arma un correo a soporte con datos técnicos útiles: organización y código, cuenta, rol, pantalla, navegador y versión. **Nunca** incluye contraseñas, tokens ni datos de clientes |
| **Contactar soporte** | Correo o WhatsApp de soporte; solo aparece si está configurado (D3) |
| **Centro de ayuda** | Enlace externo; solo aparece si está configurado (D4) |

### 2.3 Detalles de la sesión
Ventana de solo lectura que sirve cuando soporte pregunta «¿dónde estás?»:
- **Quién y dónde:** usuario y correo; organización y código; cuenta; rol activo y número de permisos.
- **Sesión:** inicio de sesión y vencimiento del token.
- **Equipo y versión:** dispositivo (navegador), versión de la app (commit del despliegue) y zona horaria.

Tiene un botón «Copiar» que copia el texto sin secretos.

## 3. Archivos
- `src/shared/ui/MenuPanel.tsx`: menú con submenús, accesible (`role=menu`), lateral en escritorio y desplegado en el mismo panel en el celular. Reemplaza el uso de `Popover` en el menú de usuario.
- `src/app/UserMenu.tsx` reescrito con las secciones de la sección 2. `OrgAdminLayout` lo usa en lugar de `OrgUserMenu`, que se elimina.
- `src/shared/appearance/` (`useAppearance`, aplicación del tema y del tamaño) y su script en `index.html`. Tema claro en `src/index.css`.
- `src/app/help/` con las ventanas de atajos, reportar problema y detalles de la sesión.
- Variables opcionales: `VITE_SUPPORT_EMAIL`, `VITE_SUPPORT_WHATSAPP` y `VITE_HELP_URL`. Versión: `VITE_APP_VERSION`, que toma el commit de Vercel si existe.
- Pruebas (vitest):
  - teclado y submenús de `MenuPanel`;
  - opciones según permisos;
  - preferencias de apariencia (guardar y aplicar, «según el sistema»);
  - correo de «Reportar un problema» sin datos sensibles;
  - detalles de la sesión.
- Verificación en el navegador:
  - el menú en escritorio y en el celular;
  - el tema claro en las pantallas principales (Pedidos, Cocina, Abastecimiento y Copilot) y su contraste.

## 4. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Tema claro | **Sí, como «Claro (beta)»**, invirtiendo la escala `neutral` en un solo lugar. Un tema claro diseñado pantalla por pantalla sería otro proyecto |
| **D2** | ¿Dónde se guarda Apariencia? | **Por dispositivo**: las tablets de cocina son compartidas y cada equipo tiene su luz |
| **D3** | Contacto de soporte | **Variables `VITE_SUPPORT_EMAIL` y `VITE_SUPPORT_WHATSAPP`**: sin ellas la opción no aparece. Necesito el correo o el número que quieras usar |
| **D4** | Centro de ayuda | **Enlace `VITE_HELP_URL`**, oculto si no está. El manual no se toca ni se publica |
| **D5** | Celular | **Submenús dentro del mismo panel** (‹ Volver) |
| **D6** | Un solo menú | **Sí**: el mismo en la cuenta y en el centro de administración |

## 5. Orden de ejecución
| Fase | Qué |
|---|---|
| 1 | `MenuPanel` con submenús y teclado, con sus pruebas |
| 2 | Menú de usuario nuevo y reemplazo en el centro de administración |
| 3 | Apariencia: tema (claro beta) y tamaño del texto, sin destello |
| 4 | Ayuda y soporte, y detalles de la sesión |
| 5 | Validación: vitest, `tsc`, `oxlint`, build, navegador (escritorio, celular y claro u oscuro) |
| 6 | Documentación: esta ADR con resultados y la arquitectura (el manual no) |

## 6. Qué necesito de ti
1. **Aprobar esta ADR**, con D1 a D6 confirmadas o corregidas.
2. **El correo o WhatsApp de soporte** (D3). Si no lo tienes aún, la opción queda oculta hasta configurarla en Vercel.
3. **Para verlo con datos:** iniciar sesión en el panel de vista previa (`fr3rk6.localhost:5173`).

---

## 7. Resultados (2026-10-02)

### 7.1 Lo construido
- **`src/shared/ui/MenuPanel.tsx`.**
  - Menú descrito como datos, con submenús laterales en escritorio. Se renderizan en un portal con posición fija, junto al elemento, y se corren para no salirse de la pantalla.
  - En el celular, los submenús se abren dentro de la misma hoja con «‹ Volver».
  - Teclado: ↑/↓ recorren, → y Enter abren, ← vuelve, Esc cierra todo y devuelve el foco al botón. Un clic afuera también cierra.
- **`src/app/UserMenu.tsx`.**
  - Arriba, nombre y correo.
  - **Rol:** «Cambiar de rol» con submenú (qué permite cada rol). Si hay un solo rol, se ve sin flecha.
  - **Cuenta:** la cuenta activa con su organización y código. Su submenú muestra «ORGANIZACIÓN · CÓDIGO», las cuentas de esa organización con su rol, «Ver detalles de la cuenta» (Configuración si hay permiso; si no, los detalles de la sesión), «Cambiar de organización» (cambia el subdominio) y «Tus cuentas».
  - **Lo propio:** Mi perfil y Mis turnos. Configuración, Equipo de la cuenta y Administración de la organización aparecen según los permisos.
  - **Al final:** Apariencia, Ayuda y soporte, Detalles de la sesión y Cerrar sesión.
- **`OrgUserMenu`.** El mismo menú en el centro de administración, con «Organización» en lugar de la cuenta. Se eliminó el menú propio de `OrgAdminLayout`.
- **Apariencia** (`src/shared/appearance`, CSS en `src/index.css` y un script en `index.html`).
  - Tema Oscuro, Claro (beta) o Según el sistema; texto Normal o Grande (112,5 %).
  - Se aplica antes del primer pintado y se guarda en este equipo.
- **Ayuda y soporte** (`src/app/help`).
  - Atajos de teclado y «Preguntar a Copilot» (si la cuenta lo tiene).
  - Reportar un problema: la descripción más los detalles de la sesión, con «Copiar reporte» y, si hay correo configurado, «Enviar por correo».
  - Escribir a soporte, WhatsApp y Centro de ayuda aparecen solo con `VITE_SUPPORT_EMAIL`, `VITE_SUPPORT_WHATSAPP` y `VITE_HELP_URL`.
- **Detalles de la sesión.**
  - Muestra usuario, organización con su código, cuenta, rol, permisos, pantalla (solo la ruta, sin consultas que puedan llevar tokens), inicio y vencimiento de la sesión, dispositivo, zona horaria y versión.
  - La versión es el commit del despliegue (`VERCEL_GIT_COMMIT_SHA`).
  - Tiene botón Copiar.

### 7.2 Ajustes durante la ejecución
| Ajuste | Motivo |
|---|---|
| Apariencia también se guarda en una cookie de `.quanela.com` | `localStorage` es por origen y cada organización tiene su subdominio. Sin la cookie, el tema elegido en `quanela.com` no se vería en `fr3rk6.quanela.com` (lo detecté al probar en el navegador) |
| Los submenús van en un portal con posición fija | El panel raíz hace scroll en pantallas bajas y habría recortado un submenú absoluto |

### 7.3 Validación
- **Vitest: 294/294.** Las nuevas cubren:
  - `MenuPanel`: submenú con clic y con teclado, ←, Esc, clic afuera y modo celular;
  - `UserMenu`: código de la organización, opciones según permisos, tema sin cerrar el menú, atajos, soporte oculto sin configurar, detalles de la sesión sin secretos;
  - Apariencia: valores por defecto, valores inválidos, «según el sistema», guardar y aplicar, la cookie compartida gana;
  - diagnóstico: datos útiles y sin tokens, correo del reporte, navegador.
- **Resto:** `tsc` sin errores; `oxlint` con 17 avisos (igual que antes); ambos builds compilan.
- **Navegador:**
  - el login de `fr3rk6.localhost` y la landing en tema claro con texto grande (18 px), sin destello y sin errores en la consola;
  - **el menú con datos necesita tu sesión**: es solo para personas que entraron.

