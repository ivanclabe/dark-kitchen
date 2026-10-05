# ADR 0025: Registro del dueño con Google, Instagram o teléfono

## Estado
**Aprobada (2026-10-05) con D1–D5 e implementada** (resultados en la sección 8). Falta activar los proveedores (sección 2.5). El pedido llegó cortado en la sección 7 («usuarios invitados»).

**Reglas:**
- Código y URL en inglés; los textos, en español.
- La marca es **Quanela** (el proyecto se llama Dark Kitchen).
- No se tocan el manual, las tablas ni los datos existentes.
- No guardo claves ni configuro proveedores: eso lo haces tú en Supabase, Google y Meta.

---

## 1. Auditoría (2026-10-05)

### 1.1 Cómo se crea hoy una cuenta (registro con correo)

```
/registro → Paso 1 «Crea tu usuario» (nombre, correo, contraseña)
          → Paso 2 plan → Paso 3 negocio y primera cuenta
          → supabase.auth.signUp(email, password, metadata {full_name, pending_organization, plan}, captcha Turnstile)
          → «Revisa tu correo» → enlace → /registro/confirmado
          → rpc dk_create_organization(...)  (idempotente)
               ├─ exige auth.users.email_confirmed_at
               ├─ crea dk_users si no existe (auth_user_id)
               └─ dk_provision_organization: organización (owner_user_id único), suscripción,
                  primera cuenta, roles, dk_organization_members (is_super_admin), tenant_code
          → «Tu cuenta ha sido creada · Código · Tu espacio» → {código}.quanela.com
```

| Pieza | Hallazgo |
|---|---|
| **Supabase Auth** | Hoy solo hay identidades `email` (3 usuarios). `config.toml`: `[auth.sms] enable_signup = false`, sin `[auth.external.*]`. La configuración real de producción está en el panel de Supabase |
| **Perfil** | `dk_users(auth_user_id, email, full_name)`. `email` puede ser nulo si hay `auth_user_id`. Hay índices únicos parciales por correo: uno para activos y otro para pendientes (invitados sin activar) |
| **Owner** | `dk_organizations.owner_user_id` es único (una organización por dueño), y el dueño es `is_super_admin` en `dk_organization_members` |
| **Duplicados** | `dk_create_organization` es idempotente: si ya eres dueño, devuelve tu primera cuenta |
| **Invitados** | El administrador crea `dk_users` con el correo y sin `auth_user_id` (pendiente). La persona activa su usuario con `/activar/:token` (verifyOtp invite/magiclink), crea su contraseña y entra con correo y contraseña. `/set-password` sirve para crear o cambiar la contraseña (ADR 0019) |
| **RBAC y RLS** | No dependen del método de autenticación: todo cuelga de `dk_users.id`, las membresías y `x-dk-kitchen-id` |
| **Login** | `/login` usa `signInWithPassword` y sirve para todos (dueños e invitados) |

### 1.2 Riesgos que el cambio debe cubrir
| Riesgo | Por qué |
|---|---|
| **Un dueño con Google o teléfono no puede volver a entrar** | `/login` solo acepta correo y contraseña |
| **`dk_create_organization` rechaza a quien no tiene correo confirmado** | Un usuario por teléfono no tiene correo; Instagram no entrega correo |
| **Invitación pendiente huérfana** | Si alguien con una invitación pendiente se registra con Google usando ese mismo correo, quedarían dos `dk_users` con el mismo correo y la invitación ya no se podría activar |
| **Vinculación automática de Supabase** | Supabase vincula un inicio con Google a un usuario existente con el mismo correo verificado. Un invitado podría entrar con Google sin que nosotros lo ofrezcamos |
| **Los datos del negocio se pierden con OAuth** | Google e Instagram redirigen fuera de la app: lo escrito antes de autenticarse no viaja |

### 1.3 Instagram en Supabase (verificado el 2026-10-05)
- **Supabase no trae Instagram como proveedor propio.** Desde 2026 permite **proveedores OAuth2/OIDC personalizados** (`custom:<nombre>`), configurables en el panel; el plan Free admite 3 ([docs](https://supabase.com/docs/guides/auth/custom-oauth-providers)).
- **Instagram ofrece «Business Login for Instagram» (OAuth2)** ([Meta](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login)):
  - autorización `https://www.instagram.com/oauth/authorize`;
  - token `https://api.instagram.com/oauth/access_token`;
  - perfil `https://graph.instagram.com/me?fields=id,username`;
  - permiso `instagram_business_basic`.
- **Limitaciones:**
  - solo funciona con cuentas **profesionales** (Business/Creator); la API para cuentas personales se retiró en diciembre de 2024;
  - **no entrega correo**, así que el proveedor necesita `email_optional: true`;
  - para el público general exige la revisión de la app por Meta;
  - el mapeo del perfil de Instagram (`id` y `username`) con el proveedor genérico de Supabase **no está documentado**: hay que probarlo con una app de Meta real.

## 2. Diseño

### 2.1 Crear cuenta: elegir el método primero
```
/registro  Paso 1 «Crea tu usuario»
  [ Continuar con Google ]      → OAuth → vuelve a /registro?continue=1 con sesión
  [ Continuar con Instagram ]   → OAuth (custom:instagram) → igual
  [ Continuar con teléfono ]    → número (+57 por defecto, formato E.164) → OTP por SMS → código → sesión
  [ Continuar con email ]       → el formulario de hoy (nombre, correo, contraseña) — SIN CAMBIOS
            │
  Con sesión nueva (sin perfil) → Tu nombre (prellenado de Google/Instagram) → Plan → Negocio y primera cuenta
            → rpc dk_create_organization (directo, sin «Revisa tu correo»)
            → «Tu cuenta ha sido creada · Código · Tu espacio» → entrar
  Email → igual que hoy: Plan → Negocio → signUp → «Revisa tu correo» → /registro/confirmado
```
- **Cada botón se muestra solo si su método está configurado** (`VITE_AUTH_GOOGLE`, `VITE_AUTH_INSTAGRAM`, `VITE_AUTH_PHONE`). Así producción nunca ofrece un botón roto. Email sigue siempre visible.
- **Autenticación antes que los datos** con Google, Instagram y teléfono. Lo que escribes después ya tiene sesión, y nada se pierde en la redirección.
- **Sin duplicados.** Supabase identifica a la persona por proveedor: la misma cuenta de Google es el mismo usuario. Además, `dk_create_organization` sigue siendo idempotente.
- **Errores claros.** Proveedor no habilitado, cancelación, código vencido o incorrecto, demasiados intentos y número inválido se muestran como mensajes en español; nunca se muestra el error crudo.
- **Captcha.** Turnstile protege también la solicitud del código por SMS: cada mensaje cuesta y es un blanco de abuso.

### 2.2 Volver a entrar (dueños) — `/login`
- **El formulario de correo y contraseña no cambia**: es el de todos, invitados incluidos.
- **Debajo, «¿Creaste tu negocio con Google, Instagram o teléfono?»**, con los mismos botones (según configuración).
- **En el teléfono, el login usa `shouldCreateUser: false`**: no crea usuarios.
- **Si Google o Instagram devuelven a alguien sin perfil**, se le lleva a terminar el registro y no a un error.

### 2.3 Los invitados no cambian (regla del pedido)
- La invitación, la activación (`/activar/:token`), `/set-password` y el login con correo y contraseña quedan **exactamente igual**.
- **Guardia en la app (D3).** Si alguien entra con Google, Instagram o teléfono y ya tiene perfil pero **no es dueño de ningún negocio**, la app cierra esa sesión y le pide entrar con su correo y su contraseña. Así los métodos nuevos solo sirven a los dueños, aunque Supabase vincule identidades por correo.
- **Guardia en la base.** Si existe una invitación **pendiente** con el mismo correo, `dk_create_organization` no crea un segundo perfil. Responde «Tienes una invitación pendiente: actívala con el enlace que te enviaron».

### 2.4 Base de datos (1 migración, sin borrar nada)
`dk_create_organization` cambia en tres puntos:

1. **Quién puede crear un negocio.** Acepta a quien tenga el **correo confirmado**, el **teléfono confirmado** (`phone_confirmed_at`) o una **identidad de un proveedor permitido** (`auth.identities.provider in ('google', 'custom:instagram')`). Antes solo aceptaba el correo confirmado.
2. **Nombre.** Toma `p_full_name` (que ahora siempre se pide), luego el `full_name` o `name` del proveedor, y si no hay ninguno usa «Dueño». Ya no sale del correo, que puede no existir.
3. **Invitación pendiente.** Si hay una invitación pendiente con el mismo correo, lo rechaza (sección 2.3).

Todo lo demás no cambia: el owner, la membresía, los roles, el plan, `tenant_code`, RBAC y RLS.

### 2.5 Configuración externa (la haces tú; queda documentada en `docs/integrations/auth-providers.md`)
| Proveedor | Dónde | Qué |
|---|---|---|
| **Todos** | Supabase → Auth → URL Configuration | Redirect URLs: `https://quanela.com/registro`, `https://quanela.com/login` y `https://*.quanela.com/**` (la última ya pendiente) |
| **Google** | Google Cloud Console → OAuth client (Web) | URI autorizada: `https://cqfzcwpqisaohcjaevxf.supabase.co/auth/v1/callback`; origen `https://quanela.com` |
| **Google** | Supabase → Auth → Providers → Google | Client ID y Client Secret; activar |
| **Google** | Vercel | `VITE_AUTH_GOOGLE=true` |
| **Instagram** | Meta for Developers → app tipo Business → producto Instagram → «API setup with Instagram login» | Redirect `https://cqfzcwpqisaohcjaevxf.supabase.co/auth/v1/callback`; permiso `instagram_business_basic`; App Review para uso público |
| **Instagram** | Supabase → Auth → Providers → Custom → OAuth2 | id `custom:instagram`; el App ID y el App Secret de Instagram; los endpoints de 1.3; scopes `instagram_business_basic`; **email optional** |
| **Instagram** | Vercel | `VITE_AUTH_INSTAGRAM=true` |
| **Teléfono** | Supabase → Auth → Providers → Phone | Activar; proveedor de SMS (Twilio, Twilio Verify, MessageBird, Vonage o Textlocal) con sus credenciales; plantilla en español; límite de SMS por hora |
| **Teléfono** | Vercel | `VITE_AUTH_PHONE=true` |

Ninguna clave va al código ni al repositorio. Las variables `VITE_AUTH_*` solo encienden los botones.

## 3. Pruebas
- **SQL (suite nueva `owner_signup`):**
  - crea el negocio un usuario con teléfono confirmado sin correo, uno con identidad `google` y uno con `custom:instagram`;
  - rechaza a quien tiene correo o teléfono sin confirmar;
  - no duplica: la segunda llamada devuelve la misma cuenta y hay un solo perfil;
  - bloquea a quien tiene una invitación pendiente con su mismo correo;
  - el dueño queda como `owner_user_id`, `is_super_admin` y ADMIN de la primera cuenta, con `tenant_code`;
  - todas las suites existentes siguen verdes.
- **Vitest:**
  - el selector muestra solo los métodos configurados y email siempre;
  - el número de teléfono se valida y se convierte a E.164;
  - el flujo del código (pedirlo, verificarlo, errores, reenvío con espera);
  - quien vuelve de OAuth sin perfil sigue el onboarding, y quien ya tiene perfil va a su cuenta;
  - la guardia de invitados;
  - `/login` conserva el formulario de correo intacto y muestra la sección de dueños solo si hay métodos;
  - el email sigue siendo idéntico.
- **Resto:** `tsc`, `oxlint`, ambos builds, y el navegador con los botones sin configurar, más Google cuando lo actives.

## 4. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Instagram | **Proveedor OAuth2 personalizado de Supabase (`custom:instagram`) con Business Login for Instagram**, detrás de `VITE_AUTH_INSTAGRAM`, marcado «beta» hasta probarlo con tu app de Meta. Si el mapeo del perfil no funciona, la alternativa oficial es **Facebook** (proveedor propio de Supabase, de Meta) |
| **D2** | Login de los dueños que no usan correo | **Una sección aparte en `/login`** con los mismos botones (2.2), sin tocar el formulario de correo y contraseña |
| **D3** | Un invitado que entra con Google porque Supabase vinculó su correo | **La app lo bloquea y le pide correo y contraseña** (2.3): los métodos nuevos quedan solo para dueños |
| **D4** | Quien ya tiene usuario en Quanela (por ejemplo, un invitado) y quiere crear su propio negocio con Google o teléfono | **Igual que hoy con correo: no se crea desde el registro.** Va a su cuenta. Es un caso para soporte, que crea el negocio desde el portal Global Admin |
| **D5** | País por defecto del teléfono | **Colombia (+57)**, con selector de los mismos países del registro |

## 5. Riesgos
| Riesgo | Mitigación |
|---|---|
| Costo y abuso de SMS | Turnstile antes de pedir el código, límite de SMS por hora en Supabase y espera de 60 s para reenviar |
| Instagram no entrega correo y solo funciona con cuentas profesionales | Se avisa en el botón («cuenta profesional de Instagram»); el nombre se pide en el onboarding |
| Un botón visible sin proveedor configurado | Cada botón depende de su variable; si Supabase responde «provider not enabled», el mensaje lo explica |
| Dueños sin correo: la recuperación de contraseña y los avisos por correo no les llegan | Entran con su método. El correo se puede agregar después en Mi perfil (fuera de este cambio) |

## 6. Orden de ejecución
| Fase | Qué |
|---|---|
| 1 | Migración de `dk_create_organization` y suite `owner_signup` |
| 2 | `api` de autenticación del dueño: OAuth, OTP por SMS, mensajes de error y opciones habilitadas |
| 3 | `/registro`: selector de método, teléfono con su código, regreso de OAuth y onboarding con sesión |
| 4 | `/login`: sección para dueños y guardia de invitados |
| 5 | Pruebas (vitest), `tsc`, `oxlint`, builds y navegador |
| 6 | Documentación: `docs/integrations/auth-providers.md`, esta ADR con resultados y la arquitectura |

## 7. Qué necesito de ti
1. **Aprobar esta ADR**, con D1 a D5 confirmadas o corregidas.
2. **Confirmar si el pedido seguía después de la sección 7** («usuarios invitados»): llegó cortado en el ejemplo del Owner.
3. **Después, para activarlo**, la configuración de la sección 2.5: Google, la app de Meta y el proveedor de SMS. Sin ella, los botones no aparecen y todo sigue funcionando como hoy.

## 8. Resultados (2026-10-05)

### 8.1 Base de datos
`20261005100000_dk_owner_signup_methods` reemplaza `dk_create_organization` (misma firma y mismos permisos) y agrega `dk_owner_signup_verified(auth.users)`, interna y sin acceso desde la API. Acepta correo confirmado, teléfono confirmado o una identidad `google` o `custom:instagram`. El nombre se toma del onboarding o del proveedor, nunca del correo. Si hay una invitación pendiente con el mismo correo, responde `PENDING_INVITATION`. No cambia nada más: owner, membresía, roles, plan y `tenant_code`.

### 8.2 App
- **`src/modules/signup/ownerAuth.ts`:**
  - métodos habilitados según `VITE_AUTH_*`;
  - OAuth: `google` y `custom:instagram`, con regreso a `/registro?continuar=1`;
  - código por SMS: `signInWithOtp` y `verifyOtp`; en el registro crea el usuario y en el login no (`shouldCreateUser`);
  - `toE164` y mensajes de error en español, también los que vuelven en la URL.
- **`src/modules/signup/ownerSession.ts`:** marca de «entró con un método de dueño» y la guardia D3, que comprueba con `dk_my_context` si la persona es dueña.
- **`components/OwnerMethods.tsx`:**
  - botones de Google (logo oficial), Instagram (beta, «cuenta profesional»), teléfono y email;
  - `PhoneSignIn` con país, número, Turnstile, código, reenvío a los 60 s y «Cambiar el número».
- **`/registro`:**
  - **Paso 1:** el selector de método. Con «Continuar con email» se abre el formulario de siempre; si no hay métodos configurados, se ve ese formulario directamente, igual que antes.
  - **Regreso con sesión y sin perfil:** plan, luego negocio con «Tu nombre» (prellenado del proveedor) y «Entraste como … · Usar otra cuenta».
  - **Crear el negocio:** `savePendingBusiness` guarda los datos en el usuario y `/registro/confirmado` crea todo (reutilizado sin cambios).
  - **Quien ya tiene usuario** va a su cuenta. Si entró con un método de dueño y no es dueño, se cierra la sesión y se le pide correo y contraseña.
- **`/login`:**
  - el formulario de correo y contraseña no cambia;
  - debajo, «¿Creaste tu negocio con …?» con los métodos configurados;
  - se muestra el aviso de la guardia;
  - quien vuelve de un método de dueño pasa por el registro, que decide.

### 8.3 Validación
| Prueba | Resultado |
|---|---|
| SQL | **733/733** (nueva `owner_signup` 13/13; `signup` 13/13 sin cambios) |
| Vitest | **327/327**: `ownerAuth` 13, registro del dueño 8, login 5 |
| `tsc` | limpio |
| oxlint | 16 avisos, sin nuevos |
| Builds de la app y del portal | pasan |
| Navegador | `/login` y `/registro` sin errores con los métodos apagados; se ven igual que antes |

**`owner_signup` verifica:**
- teléfono confirmado sin correo, Google e Instagram sin correo crean el negocio;
- el teléfono sin confirmar y un proveedor no permitido quedan bloqueados;
- el dueño queda como SUPER_ADMIN y ADMIN de la primera cuenta, con `tenant_code`;
- la segunda llamada devuelve la misma cuenta con un solo perfil;
- una invitación pendiente con el mismo correo queda intacta.

### 8.4 Pendiente
- **Activación:** la configuración de 2.5. El paso a paso está en `docs/integrations/auth-providers.md`. Requiere `VITE_PUBLIC_SIGNUP=true`.
- **Instagram:** probar el proveedor personalizado con una cuenta profesional de prueba antes de encender `VITE_AUTH_INSTAGRAM` (D1).
- **Navegador:** ver los botones encendidos cuando configures al menos Google.
