# ADR 0043: Elegir la cuenta al iniciar sesión

## Estado
**Aprobada e implementada (2026-10-08).** D1: toda persona con 2 o más cuentas activas.

**Pedido:** cuando el SUPER_ADMIN inicia sesión y tiene varias cuentas, que pueda elegir con cuál entrar.

---

## 1. Auditoría
| Hoy | Problema |
|---|---|
| Después del login la app va a `/app` → `KitchenEntryRedirect` → `defaultKitchen()`: la **última cuenta usada** (guardada en el perfil o en este equipo) o la única activa | Con varias cuentas, **entra directo a la última** y nunca pregunta. Para trabajar en otra hay que entrar y luego cambiar desde el menú |
| «Tus cuentas» (`/cuentas`, `KitchenSelectorPage`) ya existe: tarjetas con icono, rol y dirección; las de otro negocio se abren en su subdominio; «Nueva cuenta» para quien puede crear | Solo aparece si no hay una cuenta recordada, o desde el menú. No dice cuál usaste la última vez |
| Se inicia sesión por varios caminos: correo y contraseña (`useAuth.signIn`), Google e Instagram (`continueWithProvider`, que vuelve por `/registro?continuar=1`) y teléfono (`verifyPhoneCode`) | La app no distingue «acabo de iniciar sesión» de «abrí `/app` con la sesión ya abierta»: hoy no lo necesitaba |
| `/login?next=…` lleva a una página concreta (por ejemplo, un enlace guardado) | Quien llega por un enlace no debería pasar por el selector |

## 2. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | ¿A quién se le muestra? | **A toda persona con 2 o más cuentas activas**, no solo al SUPER_ADMIN. Un gerente o un cajero que trabaja en dos sedes tiene la misma necesidad. Quien tiene una sola cuenta entra directo, como hoy. *Alternativa: solo el SUPER_ADMIN.* |
| **D2** | ¿Cuándo? | **Solo justo después de iniciar sesión**, por cualquier camino (correo, Google, Instagram, teléfono). No al recargar la página, ni al abrir «Ir a mi cuenta» con la sesión ya abierta, ni cuando el login venía de un enlace (`?next=`), que lleva a su página como hoy |
| **D3** | ¿Qué cuentas cuentan? | En el **subdominio de un negocio** (`fr3rk6.quanela.com`), las de ese negocio, como ya hace la entrada. En **quanela.com**, todas. La pantalla muestra todas, las de ese negocio primero (como hoy) |
| **D4** | La pantalla | La misma **«Tus cuentas»**. La última cuenta que usaste va primera con la marca **«Última que usaste»**, así entrar a la de siempre sigue siendo un clic. El resto no cambia (rol, dirección, «Nueva cuenta», «Cerrar sesión») |
| **D5** | Cómo sabe la app que acabas de iniciar sesión | Una marca en `sessionStorage` (esta pestaña), puesta al iniciar sesión, que vence a los 10 minutos y se borra al pasar por la entrada. No hay nada nuevo en la base: elegir la cuenta guarda la última usada como hoy |
| **D6** | Ayuda | El artículo «Cambiar de cuenta y Mi perfil» y las notas de versión. El manual no se toca |

## 3. Fases
| Fase | Qué |
|---|---|
| 1 · Marca de inicio de sesión | `src/shared/auth/accountChoice.ts`: `markAccountChoice()`, `pendingAccountChoice()` y `clearAccountChoice()`, con vencimiento. Se marca en el login con correo (solo si no hay `?next=`), antes de ir a Google o Instagram y al validar el código del teléfono |
| 2 · Entrada | `KitchenEntryRedirect`: con la marca y 2 o más cuentas usables (D3) → `/cuentas`; si no, como hoy. La marca se borra en ambos casos |
| 3 · «Tus cuentas» | La última usada, primera y marcada |
| 4 · Ayuda | El artículo, las notas de versión, `npm run help` y desplegar `dk-copilot` (su base de conocimiento cambia) |
| — | **Validación:** Vitest (la marca y su vencimiento; la entrada con 1, 2 cuentas, sin marca, con `?next=` y en un subdominio; el orden y la marca en «Tus cuentas»), `tsc`, `oxlint` y build. En el navegador, con la sesión que inicies tú |

## 4. Riesgos
| Riesgo | Mitigación |
|---|---|
| Un paso más para quien siempre usa la misma cuenta | Solo al iniciar sesión, no en cada visita, y la última usada va primera |
| La marca queda puesta si el login falla o se abandona | Vence a los 10 minutos y solo se pone en un login exitoso, o justo antes de ir a Google o Instagram |
| Varias pestañas | `sessionStorage` es por pestaña: otra pestaña ya abierta no cambia |

## 5. Resultados (2026-10-08)
| Fase | Qué quedó |
|---|---|
| 1 · Marca | `src/shared/kitchen/accountChoice.ts` (`dk-choose-account` en `sessionStorage`, 10 min). Se pone:<br>• en `LoginPage` antes de `signIn`, solo sin `?next=`; se borra si la contraseña falla;<br>• en `OwnerMethods` antes de ir a Google o Instagram y antes de validar el código del teléfono; se borra si falla |
| 2 · Entrada | `KitchenEntryRedirect`: con la marca y 2 o más cuentas usables → `/cuentas`; la marca se borra cuando ya hay contexto. Las funciones puras (`defaultKitchen`, `usableKitchens` y la nueva `lastUsedKitchenId`) pasaron a `src/app/accountEntry.ts`, así que el lint tiene un aviso menos |
| 3 · «Tus cuentas» | Orden: las de este negocio primero y, entre ellas, la última usada, con la marca «Última que usaste» (solo si hay más de una) |
| 4 · Ayuda | «Entrar a Quanela y cambiar de cuenta o de rol» (paso 4 y una pregunta nueva) y notas de versión del 8 de octubre. `npm run help` y `dk-copilot` desplegada |

**Validación:**
- Vitest: **641** (99 archivos). Nuevas: la marca y su vencimiento; la entrada (varias cuentas, sin marca, una sola, subdominio, cuenta desactivada); el login (marca, `?next=`, contraseña errada); el orden y la marca de «Tus cuentas».
- `tsc`, `oxlint` (13 avisos) y los dos builds correctos.
- En el navegador, con una sesión guardada:
  - sin marca, `/app` lleva a la cuenta de siempre;
  - recién iniciada la sesión, lleva a «Tus cuentas», con Sopa donde Carmen marcada y la marca ya borrada;
  - al recargar, otra vez a la cuenta de siempre.
