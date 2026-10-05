# Registro del dueño: Google, Instagram y teléfono (ADR 0025)

Quien **crea un negocio** en Quanela puede registrarse con Google, Instagram o su número de teléfono (código por SMS), además de correo y contraseña. La configuración está en tres lugares:

- **Supabase:** los proveedores y sus secretos.
- **Google y Meta:** las apps OAuth.
- **Vercel:** las variables que encienden los botones.

**Ninguna clave va al código ni al repositorio.**

Los usuarios **invitados** no cambian: invitación → activación (`/activar/:token`) → correo y contraseña.

## Requisito previo
- **Registro público:** `VITE_PUBLIC_SIGNUP=true` (ADR 0008 D8). Si está apagado, `/registro` muestra «El registro abre pronto» y no hay ningún método.
- **Turnstile:** si `VITE_TURNSTILE_SITE_KEY` está puesto, protege el registro con correo y la solicitud del código por SMS. Requiere que Supabase → Auth → Bot and Abuse Protection tenga Turnstile activado con la misma clave.

## Variables de Vercel (solo encienden los botones)
| Variable | Valor | Botón |
|---|---|---|
| `VITE_AUTH_GOOGLE` | `true` | «Continuar con Google» |
| `VITE_AUTH_INSTAGRAM` | `true` | «Continuar con Instagram» (beta) |
| `VITE_AUTH_PHONE` | `true` | «Continuar con teléfono» |

- Sin la variable, el botón no aparece.
- Si el botón está encendido pero el proveedor no está activo en Supabase, la persona ve «Este método todavía no está disponible. Usa otro.».
- Después de cambiar una variable hay que volver a desplegar.

## Supabase → Authentication → URL Configuration
- **Site URL:** `https://quanela.com`.
- **Redirect URLs:** agrega `https://quanela.com/registro`, `https://quanela.com/registro?continuar=1` y `https://*.quanela.com/**`.
  - Google e Instagram devuelven a `/registro?continuar=1` en el mismo origen donde se pulsó el botón, también desde `/login`.
  - En desarrollo agrega también `http://localhost:5173/**` y `http://*.localhost:5173/**`.

## Google
1. **Google Cloud Console → APIs & Services → OAuth consent screen.**
   - Tipo *External* y nombre «Quanela».
   - Scopes `email`, `profile` y `openid`.
   - Publica la app para que cualquiera pueda usarla.
2. **Credentials → Create credentials → OAuth client ID → Web application.**
   - Authorized JavaScript origins: `https://quanela.com`.
   - Authorized redirect URIs: `https://cqfzcwpqisaohcjaevxf.supabase.co/auth/v1/callback`.
3. **Supabase → Authentication → Sign In / Providers → Google:** activa el proveedor y pega el **Client ID** y el **Client Secret**.
4. **Vercel:** `VITE_AUTH_GOOGLE=true` y vuelve a desplegar.

Supabase identifica a la persona por su cuenta de Google, así que la misma cuenta siempre es el mismo usuario. Google verifica el correo, y ese correo queda en el perfil.

## Instagram (beta)
Supabase **no trae Instagram como proveedor propio**. Se configura como **proveedor OAuth2 personalizado** con *Business Login for Instagram*. Hay cuatro limitaciones:
- Solo funciona con cuentas **profesionales** de Instagram (Business o Creator).
- **No entrega correo:** el nombre se pide durante el registro.
- Para que cualquiera lo use, Meta exige la **revisión de la app** (App Review).
- El mapeo del perfil de Instagram con el proveedor genérico de Supabase **no está documentado**. Hay que probarlo con una cuenta de prueba antes de encender el botón. Si no funciona, la alternativa oficial es **Facebook**, proveedor propio de Supabase y también de Meta.

1. **Meta for Developers → Create app** (tipo *Business*).
2. **Agrega el producto Instagram → «API setup with Instagram login».**
   - Business login settings → OAuth redirect URIs: `https://cqfzcwpqisaohcjaevxf.supabase.co/auth/v1/callback`.
   - Anota el **Instagram App ID** y el **Instagram App Secret**.
   - Permiso: `instagram_business_basic`.
3. **Supabase → Authentication → Sign In / Providers → Add provider → Manual configuration (OAuth2):**

   | Campo | Valor |
   |---|---|
   | Identificador | `custom:instagram` (exactamente así: la app y la base lo usan) |
   | Client ID / Secret | Instagram App ID / Instagram App Secret |
   | Authorization URL | `https://www.instagram.com/oauth/authorize` |
   | Token URL | `https://api.instagram.com/oauth/access_token` |
   | UserInfo URL | `https://graph.instagram.com/me?fields=id,username` |
   | Scopes | `instagram_business_basic` |
   | Email optional | **activado** (Instagram no entrega correo) |
4. **Prueba con una cuenta profesional** agregada como *tester* en la app de Meta.
5. **Vercel:** `VITE_AUTH_INSTAGRAM=true` y vuelve a desplegar.

## Teléfono (código por SMS)
1. **Supabase → Authentication → Sign In / Providers → Phone:** activa *Enable phone provider* y *Enable phone signup*.
2. **Elige el proveedor de SMS** (Twilio, Twilio Verify, MessageBird, Vonage o Textlocal) y pega sus credenciales.
   - Con **Twilio:** Account SID, Auth Token y Message Service SID.
   - Revisa que el proveedor pueda enviar SMS a los países que atiendes (Colombia, México…).
3. **Plantilla del SMS:** `Tu código de Quanela es {{ .Code }}`.
4. **Supabase → Authentication → Rate Limits:** limita los SMS por hora. Cada SMS cuesta, y la app ya pide Turnstile y espera 60 s entre reenvíos.
5. **Vercel:** `VITE_AUTH_PHONE=true` y vuelve a desplegar.

**Cómo funciona en la app:**
- El número se valida y se convierte a E.164; por defecto el país es Colombia (+57).
- Supabase envía y verifica el código; la app nunca lo guarda.
- En `/login` el teléfono **no crea usuarios** (`shouldCreateUser: false`).

## Qué hace la base
`dk_create_organization` acepta a quien tenga **una** de estas tres cosas:
- el correo confirmado;
- el teléfono confirmado;
- una identidad de `google` o `custom:instagram`.

Dos reglas más:
- **Sin duplicados:** si la persona ya es dueña, devuelve su primera cuenta.
- **Invitaciones pendientes:** si existe una invitación **pendiente** con el mismo correo, no crea un segundo perfil y pide activar la invitación.

La suite `supabase/tests/owner_signup.sql` lo verifica.

## Errores que ve la persona
| Situación | Mensaje |
|---|---|
| Proveedor sin activar | «Este método todavía no está disponible. Usa otro.» |
| Canceló en Google o Instagram | «Cancelaste el inicio de sesión.» |
| Código incorrecto o vencido | «El código no es correcto o ya venció. Pide uno nuevo.» |
| Demasiados intentos | «Demasiados intentos. Espera un momento y vuelve a intentarlo.» |
| Número sin negocio (en el login) | «No encontramos un negocio creado con ese número…» |
| Un invitado entra con Google | Se cierra esa sesión: «Esa forma de entrar es para quien creó su negocio en Quanela. Entra con tu correo y tu contraseña.» |
