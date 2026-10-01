# ADR 0019: Portal Global Admin

## Estado
**Aprobada (2026-09-30), con las recomendaciones D1–D7, y ejecutada.** Los resultados están en la sección 11 y la guía de despliegue en la 12. Queda pendiente lo que depende de ti (sección 10): SMTP, el proyecto de Vercel con su dominio, y entrar al portal para la prueba en el navegador.

---

## 1. Auditoría (2026-09-30)

### 1.1 Lo que ya existe y se reutiliza
| Pieza | Fuente de verdad actual |
|---|---|
| **Administrador de plataforma** | `dk_users.platform_role = 'SUPERADMIN'`. Hoy solo `ivanclabe@gmail.com`. `dk_is_superadmin()` y `dk_require_platform_admin()` lo validan; 10 políticas RLS le dan acceso de soporte a datos de cualquier cuenta. |
| **Usuarios** | `auth.users` (Supabase Auth, con `last_sign_in_at`) y `dk_users` (perfil, `email`, `active`, `created_at`) |
| **Organizaciones** | `dk_organizations` (`active`, `owner_user_id`, `created_by`, `created_at`) y `dk_subscriptions` (plan, estado y prueba gratis) |
| **Membresías y roles** | `dk_organization_members` (`is_super_admin` = Organization Admin, `status` pending/active), `dk_kitchen_members`, `dk_member_roles`, `dk_roles`, `dk_permissions` |
| **Alta de organizaciones** | `dk_create_organization` (registro público): crea la organización, la primera cuenta y la suscripción. Exige que quien llama sea el dueño. |
| **Invitación y activación** | `dk_user_activations` (token con hash y vencimiento), `dk_new_activation`, `dk_accept_activation` y `/activar/:token`. **El enlace hoy se copia a mano: no se envía correo.** |
| **Actividad** | `dk_audit_log`, clasificado: `event_type`, `category`, `summary`, `organization_id`, `kitchen_id`, `changed_by`, `source`, `result` (ADR 0012) |
| **IA** | `dk_ai_insights` (cada análisis: función, cuenta, `created_by`, tokens, latencia y estado), `dk_features`, `dk_organization_features`, `dk_kitchen_features` y `dk_ai_models` |
| **Panel de plataforma actual** | `/admin` **dentro de la app principal**: cuentas, activar o desactivar, y el control de IA de la ADR 0014 (modelos, límites por plan, catálogo de voces, uso). **Hay un enlace en el menú de usuario.** |
| **Gráficas** | `recharts` ya instalado |
| **Storage** | `dk-attachments` (privado), `dk-voice-models` y `dk-product-images` (públicos) |

### 1.2 Lo que choca con el pedido
1. **El panel de plataforma vive dentro de Quanela** y tiene un enlace en el menú de usuario. El pedido exige un portal aparte, sin enlaces desde Quanela.
2. **Cerrar sesión en Quanela cierra todas las sesiones del usuario** (`supabase.auth.signOut()`, alcance global). Cerraría también el portal.
3. **No se envían correos de invitación;** el enlace se comparte a mano.
4. **No hay registro de uso de la voz:** la voz corre en el equipo. No hay métricas de voz que mostrar; se marcarán como «no disponible».
5. **El registro público exige que el dueño cree su organización con su propia sesión.** El portal necesita crearla para otra persona que todavía no existe.

## 2. Arquitectura

### 2.1 Una aplicación aparte, en su propio dominio
- **Proyecto Vite propio** en `admin/`, en el mismo repositorio. Usa las mismas dependencias y reutiliza los componentes base de `src/shared/ui` (botones, tablas, tarjetas, tokens de diseño), pero tiene **su propio punto de entrada, rutas, cliente de Supabase y build** (`npm run build:admin` → `dist-admin`).
- **Se publica como un proyecto de Vercel aparte** en **`admin.quanela.com`** (sección 8, D3).
- **Otro dominio implica otro almacenamiento del navegador.** La sesión del portal nunca se mezcla con la de Quanela.
- **El cliente del portal usa además su propia clave de sesión** (`storageKey: 'quanela-global-admin'`).
- **Quanela no enlaza al portal** en ningún lugar. El portal tiene `noindex` y no aparece en el sitemap.

### 2.2 Sesiones separadas
- Iniciar sesión en Quanela no inicia sesión en el portal (otro dominio).
- **Cerrar sesión pasa a ser local en las dos apps** (`signOut({ scope: 'local' })`): cerrar una no revoca la otra. Es un cambio de una línea en Quanela, justificado por este requisito.
- **El portal exige una sesión con MFA** (segundo factor) para cualquier dato. La sesión normal de Quanela no lo tiene, así que aunque alguien reutilizara un token de Quanela, el portal no respondería.

### 2.3 Autorización en la base (no en la interfaz)
- **Rol Global Admin = `dk_users.platform_role = 'SUPERADMIN'`.** Se reutiliza la fuente actual; ya admite varios administradores.
- **`dk_require_global_admin()`** exige las dos cosas: rol `SUPERADMIN`, activo, **y** sesión `aal2` (MFA: `auth.jwt() ->> 'aal'`). Si falta algo, error 42501.
- **Todas las funciones del portal** (`dk_ga_*`) son `security definer` y empiezan con esa verificación.
  - Se revoca `EXECUTE` a `anon`.
  - Ninguna tabla nueva es legible por usuarios comunes.
  - Las funciones de plataforma existentes (`dk_platform_*`) pasan a exigir también `aal2`.
- **Otorgar o quitar el rol** se hace con `dk_ga_set_global_admin(email, on)`. Solo un Global Admin lo puede hacer, nunca a sí mismo, y queda auditado. La interfaz de esto queda para después (sección 8, D6). Ahora solo queda tu correo.
- **Nunca se expone la `service_role`:** vive solo dentro de la Edge Function, como secreto de Supabase.

### 2.4 Login del portal
- **Pantalla propia** con estilo de consola: correo y contraseña de Supabase, y luego **código TOTP** de una app autenticadora (Google Authenticator, 1Password…).
- **La primera vez,** el portal muestra el QR para enrolar el factor.
- **Sin el rol, el portal muestra «Acceso restringido»** y cierra su sesión local, aunque las credenciales sean válidas en Quanela.
- **El portal no guarda ni maneja contraseñas:**
  - quien olvida la suya usa el flujo de Supabase;
  - los usuarios invitados crean la suya al activar su cuenta.

### 2.5 Altas desde el portal: las mismas reglas que el registro público
- **Una sola función de negocio, `dk_provision_organization` (interna):** crea la organización, el perfil del administrador, la membresía Organization Admin (`is_super_admin`), la primera cuenta y la suscripción (plan y prueba).
  - El registro público (`dk_create_organization`) pasa a llamarla para quien llama.
  - El portal (`dk_ga_create_organization`) la llama para un perfil **pendiente**, con su correo.
- **Antes de crear,** `dk_ga_check_new_organization(nombre, correo)` revisa:
  - el formato del correo;
  - si ya existe un usuario o perfil con ese correo y si ya es dueño de una organización (bloquea, porque la regla actual es un dueño por organización);
  - si hay organizaciones con nombre o NIT parecido (avisa y pide confirmar).
- **Invitación (Edge Function `dk-global-admin`):**
  1. Verifica el rol y el MFA.
  2. Llama a `dk_ga_create_organization`, que genera el token de activación.
  3. Envía el correo con Supabase Auth:
     - usuario nuevo: `auth.admin.inviteUserByEmail`, con redirección a `quanela.com/activar/<token>`;
     - si ya tenía cuenta en Quanela: un enlace mágico al mismo destino.
  4. Si el correo falla, el portal muestra el enlace para copiarlo, como hoy, y lo dice claramente.
- **Activación:** `/activar/:token` (Quanela) ya liga el usuario a la organización. Se agrega un paso «Crea tu contraseña» para quien llega desde la invitación sin contraseña (`auth.updateUser`). Es otro cambio pequeño y necesario en Quanela.
- **Auditoría:** «Organización creada desde Global Admin», «Invitación enviada» y «Usuario activado», con quién y cuándo, en `dk_audit_log` (`source = 'global_admin'`).

## 3. Secciones del portal
**Barra lateral:** Dashboard · Organizations · Users · AI Monitoring · Activity · Administration. Los nombres van en inglés, como pediste; el contenido, en español.

| Sección | Qué muestra o permite | Fuente |
|---|---|---|
| **Dashboard** | **Tarjetas:**<ul><li>organizaciones (total, activas, inactivas, nuevas en el rango);</li><li>usuarios (total, activos en 30 días, nuevos);</li><li>organizaciones con IA;</li><li>funciones de IA activas;</li><li>análisis de IA en el rango.</li></ul>**Gráficas:** altas por día y uso de IA por día.<br>**Además:** actividad reciente, **alertas** (análisis de IA con error, invitaciones vencidas, organizaciones sin actividad en 30 días, pruebas gratis por vencer) y filtro de rango de fechas. | `dk_organizations`, `auth.users`, `dk_ai_insights`, `dk_audit_log`, `dk_user_activations`, `dk_subscriptions` |
| **Organizations** | **Tabla** con nombre, estado, plan, fecha, administrador principal, usuarios, última actividad, funciones e IA activas; búsqueda, filtros y orden.<br>**Detalle:** resumen, usuarios, actividad y configuración relevante (plan, funciones ofrecidas, ajustes de IA de la organización), **en solo lectura**.<br>**Acciones:** crear organización; desactivar o reactivar, con confirmación escrita; reenviar invitación. | Ídem |
| **Users** | **Tabla** con usuario, correo, organizaciones, rol, estado (activo, pendiente, desactivado), alta, último ingreso y funciones usadas (IA); filtros por organización, rol y estado.<br>**Detalle y actividad del usuario.** | `dk_users`, `auth.users`, membresías, `dk_audit_log`, `dk_ai_insights` |
| **AI Monitoring** | Por función de IA: activa o no en la plataforma, organizaciones que la ofrecen, cuentas donde está activa, usuarios distintos que la usaron, análisis por día (tendencia), errores, tokens y latencia; reparto por organización. **La voz y «Oye Quanela» corren en el equipo y no se registran:** se muestra «No disponible». | `dk_ai_insights`, tablas de funciones |
| **Activity** | Línea de tiempo con fecha y hora, usuario, organización, acción y tipo; filtros por organización, usuario, tipo y fechas; paginada | `dk_audit_log` |
| **Administration** | **Tres bloques separados:**<ul><li>**Plataforma:** Global Admins (solo lectura por ahora), planes y límites.</li><li>**IA:** lo que hoy está en `/admin` de Quanela (interruptor global por función, modelos y costo, límites por plan, catálogo de voces, uso con costo).</li><li>**Organizaciones:** solo un enlace explicativo; cada organización configura lo suyo en Quanela (ADR 0018).</li></ul> | Funciones `dk_platform_*` existentes |

**Diseño:**
- Consola SaaS sobria: fondo grafito y acento brasa de Quanela, con su propio logo «Q» de líneas y la etiqueta **GLOBAL ADMIN**.
- Tarjetas de métricas, tablas con búsqueda, gráficas `recharts`, estados con color.
- Confirmación escribiendo el nombre para acciones críticas.
- Responsive.
- **Nada inventado:** si un dato no existe, «No disponible».

## 4. Cambios en Quanela (los mínimos, y por qué)
| Cambio | Motivo |
|---|---|
| Se retira `/admin` y su enlace del menú de usuario; la ruta redirige a inicio. Su contenido pasa al portal. | Requisito: ningún enlace ni menú global en Quanela |
| `signOut({ scope: 'local' })` | Sesiones independientes |
| Paso «Crea tu contraseña» en `/activar/:token` | Activación segura de los invitados |
| `dk_create_organization` usa la lógica compartida | Mismas reglas en los dos caminos, sin duplicar |

El registro público sigue igual para quien lo usa.

## 5. Datos nuevos
- **Sin tablas nuevas para métricas:** todo se calcula de las fuentes actuales.
- **Funciones `dk_ga_*`:** `overview`, `organizations`, `organization_detail`, `users`, `user_detail`, `ai_monitoring`, `activity`, `check_new_organization`, `create_organization`, `set_organization_active`, `resend_invitation` y `set_global_admin`.
- **Clasificación de auditoría** para los eventos nuevos del portal.
- **Un índice en `dk_audit_log (created_at)`,** si hace falta, para las consultas por fecha.

## 6. Pruebas
- **SQL (suite `global_admin`):**
  - sin rol → bloqueado;
  - con rol pero sin MFA (`aal1`) → bloqueado;
  - con rol y `aal2` → funciona;
  - un usuario común y `anon` no ven nada;
  - alta: duplicados de correo y de dueño, aviso de nombre parecido, organización + perfil pendiente + membresía + cuenta + suscripción + token;
  - el registro público sigue funcionando;
  - auditoría registrada;
  - `dk_platform_*` exige `aal2`.
- **Edge Function:** rechaza sin rol o sin MFA; si la invitación falla, devuelve el enlace.
- **App del portal (vitest):**
  - guardia de sesión y rol;
  - formulario de alta con validaciones;
  - tablas y filtros;
  - estados «No disponible».
- **Navegador:** los 20 puntos de validación de la solicitud.
- **Regresión:** todas las suites de Quanela, `tsc`, `oxlint` y `build` de ambas apps.

## 7. Riesgos
| Riesgo | Mitigación |
|---|---|
| Correos de invitación que no llegan (el SMTP por defecto de Supabase es muy limitado) | SMTP propio (sección 10); mientras tanto, el enlace se muestra para copiarlo |
| Perder el segundo factor | Códigos de recuperación del autenticador; como último recurso, se quita el factor desde el panel de Supabase (lo haces tú) |
| Un Global Admin ve datos de todas las organizaciones | Solo lectura en el portal (salvo crear, desactivar o reactivar y reenviar), todo auditado y con MFA |
| Mezclar configuraciones de plataforma y de organización | Bloques separados en Administration; la organización sigue siendo dueña de lo suyo (ADR 0018) |

## 8. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Nombre | **«Quanela Global Admin»**, para ser coherente con la marca, que ya es Quanela. El texto decía «Cuanela». |
| **D2** | Correo autorizado (`[CORREO_DEL_ADMIN]` vino vacío) | **`ivanclabe@gmail.com`**, el único Super Admin actual |
| **D3** | Dónde vive | **`admin.quanela.com`**, un proyecto de Vercel aparte del mismo repositorio. El dominio propio separa las sesiones de verdad. |
| **D4** | Segundo factor | **TOTP obligatorio** para entrar al portal y para toda función de plataforma |
| **D5** | El `/admin` actual de Quanela | **Retirarlo** y llevar su contenido al portal |
| **D6** | Varios Global Admins | **La base ya los admite;** la pantalla para otorgar el rol queda para después, para no exponerla antes de tiempo |
| **D7** | Acceso de soporte del Super Admin dentro de Quanela (políticas existentes) | **Se mantiene** (sirve para soporte y ya queda auditado); el portal no enlaza a él |

## 9. Orden de ejecución
| Fase | Qué |
|---|---|
| 1 | Base de datos: `dk_require_global_admin` (rol + `aal2`), `dk_platform_*` con `aal2`, `dk_provision_organization` compartida, funciones `dk_ga_*`, auditoría y suite `global_admin` |
| 2 | Edge Function `dk-global-admin` (alta + invitación por correo, con respaldo de enlace) |
| 3 | App `admin/`: build y entrada propios, cliente con su propia sesión, login con TOTP y enrolamiento, guardia de acceso, layout con barra lateral y branding |
| 4 | Secciones: Dashboard, Organizations (con alta y resumen), Users, AI Monitoring, Activity y Administration (lo de `/admin` actual) |
| 5 | Cambios mínimos en Quanela: quitar `/admin`, cierre de sesión local, «Crea tu contraseña» al activar |
| 6 | Validación: SQL, pruebas, lint y build de ambas apps; los 20 puntos en el navegador |
| 7 | Documentación: esta ADR con resultados, la arquitectura y la guía de despliegue del portal (el manual no) |

## 10. Qué necesito de ti
1. **Aprobar esta ADR**, con D1 y D2 confirmadas o corregidas.
2. **Correos de invitación:** configurar un SMTP propio en Supabase (por ejemplo Resend: *Authentication → SMTP Settings*) y personalizar la plantilla «Invite user». Te dejo los pasos. Sin esto, el portal funciona igual, pero el enlace se copia a mano.
3. **Despliegue:**
   - crear en Vercel un segundo proyecto desde el mismo repositorio (te dejo la configuración exacta);
   - apuntar `admin.quanela.com`;
   - agregar `https://admin.quanela.com` en *Supabase → Auth → URL Configuration*.
4. **Al primer ingreso al portal,** escanear el QR con tu app autenticadora.
5. **Para probar en el navegador:** iniciar sesión tú mismo, porque yo no escribo contraseñas ni códigos.

---

## 11. Resultados (2026-09-30)

### 11.1 Lo construido
- **Base de datos.** Tres migraciones aplicadas:
  - `20260930300000_dk_global_admin.sql`: rol + `aal2`, `dk_provision_organization` compartida y funciones `dk_ga_*`.
  - `20260930310000_dk_global_admin_platform_guards.sql`: `dk_admin_kitchens` y `dk_set_subscription` exigen `aal2`.
  - `20260930320000_dk_login_needs_password.sql`: le dice a la página de activación si la sesión, que viene de una invitación, todavía no tiene contraseña.
- **Edge Function `dk-global-admin`** (desplegada). Crea la organización e invita, o reenvía la invitación. Responde 401 sin sesión y rechaza a quien no es Global Admin.
- **App `admin/`.** Login propio con TOTP, guardia de sesión y seis secciones:
  - **Dashboard;**
  - **Organizations:** lista con filtros, detalle con pestañas y alta en 4 pasos;
  - **Users:** con su ficha;
  - **AI Monitoring;**
  - **Activity:** paginada;
  - **Administration:** Plataforma, IA y voz, Organizaciones.

  Las secciones menos usadas cargan bajo demanda.
- **Quanela:**
  - se retiraron `/admin` (ahora redirige a inicio), sus tres enlaces (menú de usuario, selector de cuentas y menú del centro de administración) y `PlatformAdminPage`;
  - el cierre de sesión es local;
  - `/activar/:token` pide **«Crea tu contraseña»** cuando la sesión viene de la invitación;
  - si la persona ya tiene usuario pero no contraseña, puede pedir un enlace nuevo.

### 11.2 Ajustes durante la ejecución
| Ajuste | Motivo |
|---|---|
| Administration → Plataforma incluye la tabla de **Cuentas** (activar o desactivar en lote) | Era parte del `/admin` retirado; sin ella se perdía la función |
| Global Admins **en solo lectura** | D6: el rol se otorga desde la base por ahora |
| Botón «Aún no tengo contraseña: envíame un enlace» en la activación | Si el enlace de invitación de Supabase vence (24 h) antes que el de activación (7 días), la persona no queda bloqueada |
| `dist-admin` en `.gitignore` | Salida del build local del portal |
| Si el correo falla, el enlace para copiar es un **enlace de acceso de un solo uso** (`generateLink`, no envía correo) que lleva a «Crea tu contraseña», en vez de `/activar/…` | Sin sesión, `/activar/…` pedía otro correo y chocaba con el límite de Supabase. Solo lo ve el Global Admin (rol + MFA) y el fallo queda auditado |
| Botón **«Enlace para crear contraseña»** (detalle de organización, su pestaña Usuarios y ficha en Users): `dk_ga_password_link_target` decide activación (`/activar/{token}`) o cambio (`/set-password`, página nueva en Quanela); se copia o se comparte por WhatsApp, sin correo | Pedido del usuario: compartir el enlace a mano mientras no hay SMTP. No aplica a Global Admins ni a usuarios desactivados; cada enlace nuevo invalida el anterior y queda auditado (`global_admin.password_link_created`) |

### 11.3 Validación de los 20 puntos
| # | Punto | Estado | Cómo se comprobó |
|---|---|---|---|
| 1 | Login independiente | ✅ | App y dominio propios, cliente con `storageKey` propio; la pantalla carga en `localhost:5174` sin errores |
| 2 | Acceso solo para el autorizado | ✅ | `dk_require_global_admin` (rol + `aal2`); suite `global_admin` |
| 3 | Un usuario normal no entra | ✅ | Suite SQL (con y sin `aal2`); el portal cierra su sesión local y muestra «Acceso restringido»; vitest de la guardia |
| 4 | Sin enlaces públicos | ✅ | Se quitaron los 3 enlaces a `/admin`; `robots.txt` bloquea todo y la página lleva `noindex` |
| 5 | Dashboard con datos reales | ✅ código / ⏳ navegador | `dk_ga_overview` calcula sobre las tablas reales; falta verlo con tu sesión |
| 6 | Organizaciones | ✅ código / ⏳ navegador | `dk_ga_organizations` y `dk_ga_organization_detail` (suite) |
| 7 | Usuarios | ✅ código / ⏳ navegador | `dk_ga_users` y `dk_ga_user_detail` (suite) |
| 8 | Crear organizaciones | ✅ código / ⏳ navegador | `dk_ga_create_organization` (suite: organización, cuenta, suscripción, membresía y token) |
| 9 | Crear el Organization Admin | ✅ | Perfil pendiente o existente como dueño y ADMIN de la primera cuenta (suite) |
| 10 | La invitación funciona | ⏳ | Función desplegada y probada sin sesión y sin rol; el envío real depende del SMTP (sección 10). Si falla, el portal muestra el enlace para copiarlo |
| 11 | Sin contraseñas manuales | ✅ | El portal nunca pide ni guarda contraseñas; la persona crea la suya al activar |
| 12 | Sin duplicados | ✅ | Correo dueño de otra organización → bloqueado; nombre o NIT parecido → hay que confirmar (suite y paso «Revisión») |
| 13 | AI Monitoring con datos reales | ✅ código / ⏳ navegador | `dk_ai_insights`; la voz dice «No disponible» porque no se registra (vitest) |
| 14 | Activity registra lo importante | ✅ | Eventos `global_admin.*`, `user.invited` y `user.invitation_failed` (suite `audit_events` y `global_admin`) |
| 15 | RLS y autorización | ✅ | Todo pasa por funciones con rol + `aal2`; `anon` sin permisos; `dk_platform_*` con `aal2` (suites) |
| 16 | Sesiones separadas | ✅ | Origen y `storageKey` distintos, cierre de sesión local en ambas apps |
| 17 | La configuración sigue en la organización | ✅ | El portal solo la consulta (pestaña Configuración); IA de plataforma aparte |
| 18 | Registro público intacto | ✅ | Suites `signup` y `organizations` (usa la misma `dk_provision_organization`) |
| 19 | Lint, tests y build | ✅ | Ver abajo |
| 20 | Sin regresiones | ✅ | Todas las suites de Quanela pasan |

**Números:**
- SQL: **564/564** (22 suites, incluidas `global_admin` 42 y `login_needs_password` 3).
- Vitest: **233/233** (37 archivos, incluidos guardia del portal, validación del alta, «No disponible» y confirmación por nombre).
- `tsc`: sin errores.
- `oxlint`: 18 avisos (los 17 de antes, más uno igual en `admin/src/auth/session.tsx`).
- `npm run build` y `npm run build:admin`: correctos.

**Pendiente en el navegador (necesita tu sesión):**
- entrar con contraseña;
- enrolar el TOTP;
- recorrer las seis secciones;
- crear una organización de prueba y revisar el correo o el enlace;
- activar como el invitado.

Yo no escribo contraseñas ni códigos. Corre con `npm run dev:admin` (puerto 5174; en el panel de vista previa se llama «quanela-admin»).

## 12. Guía de despliegue del portal
1. **Vercel: segundo proyecto** desde el mismo repositorio.
   - Variables:
     - `QUANELA_APP=admin` (el build usa `scripts/vercel-build.mjs`, que compila el portal con `ADMIN_OUT_DIR=dist`);
     - `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` (las mismas de Quanela).
   - Build command: el de `vercel.json` (`node scripts/vercel-build.mjs`). Output directory: `dist`.
   - Dominio: `admin.quanela.com`.
2. **Supabase → Authentication → URL Configuration:** agregar `https://admin.quanela.com` y la URL de Quanela con `/activar/*` en *Redirect URLs*.
3. **Supabase → Authentication → Multi-Factor:** TOTP habilitado (viene activo por defecto).
4. **SMTP propio** (por ejemplo Resend) en *Authentication → SMTP Settings*, y la plantilla *Invite user* en español con el botón hacia `{{ .ConfirmationURL }}`.
5. **Secretos de la Edge Function** (`supabase secrets set`, los pones tú):
   - `QUANELA_APP_URL`: la URL pública de Quanela, adonde llevan los enlaces de activación;
   - `GLOBAL_ADMIN_ORIGINS`: `https://admin.quanela.com` (más `http://localhost:5174` para desarrollo).
6. **Primer ingreso:** correo y contraseña de tu usuario de Quanela, escaneas el QR con tu app autenticadora y escribes el código. Desde entonces, el portal siempre pide el código.
7. **Si pierdes el autenticador:** desde el panel de Supabase (*Authentication → Users → tu usuario → MFA*) eliminas el factor y lo vuelves a enrolar.

