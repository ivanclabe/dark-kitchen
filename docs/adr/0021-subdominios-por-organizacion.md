# ADR 0021: Un subdominio por organización (`{organización}.quanela.com`)

## Estado
> **Modificada por la [ADR 0022](./0022-codigo-de-tenant.md):** el subdominio es un código de 6 caracteres (`{código}.quanela.com`), no el `slug`; ya no hay cambio de subdominio ni alias. El resto sigue vigente.

**Aprobada (2026-10-01) con las recomendaciones D1–D10, y ejecutada.** Resultados en la sección 12; lo que falta de tu parte, en la 11.

Reglas que se mantienen:
- código y URL en inglés; textos de la interfaz en español;
- el manual no se toca;
- no se borran datos, no se duplican usuarios y no se reescribe Quanela.

El pedido dice «cuanela.com». La marca y el dominio de producción son **quanela.com**, y el dominio raíz sale de una variable de entorno: nada queda fijo en el código.

---

## 1. Auditoría (2026-10-01)

### 1.1 Lo que ya cumple el pedido
| Pedido | Hoy |
|---|---|
| Una identidad por persona | `auth.users` → `dk_users` (1:1, sin duplicados) |
| Varias organizaciones por persona | `dk_organization_members (organization_id, user_id)` con clave primaria compuesta (única) y `status`. Cada cuenta tiene además `dk_kitchen_members` y roles por cuenta (`dk_member_roles`) |
| Rol y permisos en la relación, no en el usuario | Sí: roles por cuenta y permisos de organización por membresía (ADR 0008 y 0012) |
| Aislamiento en la base | **Las 60 tablas tienen RLS.** Las operativas (pedidos, cocina, catálogo, menús, insumos, stock, compras, proveedores, clientes, despacho, turnos, IA, auditoría) son de una **cuenta** (`kitchen_id`) y se filtran con `dk_current_kitchen_id()`, que valida el encabezado de cuenta contra la membresía; un encabezado ajeno no da acceso. Las de organización (roles, menús maestros, suscripción, funciones, facturas, activaciones) usan `dk_has_org_permission`. Las globales son catálogos (permisos, funciones, planes, unidades, modelos y voces). La suite `multikitchen_isolation` (72 pruebas) lo verifica |
| Copilot aislado | Sus herramientas corren con la sesión y la cuenta activa; la RLS no deja salir de la cuenta (`copilot_tools` lo prueba) |
| Identificador público estable | `dk_organizations.slug`: único, `[a-z0-9-]`, de 3 a 60 caracteres (cabe en un subdominio), separado del `id` interno y del `name`. **No cambia cuando se renombra la organización:** se genera una sola vez al crearla |
| DNS | `quanela.com` ya usa los nameservers de Vercel (requisito para un dominio comodín con certificado). `admin.quanela.com` es el portal, en su propio proyecto |

### 1.2 Lo que falta o hay que corregir
| Hallazgo | Riesgo |
|---|---|
| **El `slug` se puede cambiar por API.** Quien tiene `organization.manage` puede hacer UPDATE de la columna; el guardián protege dueño, activo y tope de cuentas, pero no el `slug` | Con subdominios, cambiaría la dirección de la organización y rompería sus enlaces |
| No hay palabras reservadas | Una organización podría llamarse `admin`, `www` o `api` |
| `*.quanela.com` no está asignado en Vercel | Hoy un subdominio inventado resuelve el DNS pero falla el TLS |
| **La sesión vive en `localStorage`, que es por origen** | En cada subdominio habría que volver a iniciar sesión, y cambiar de organización obligaría a hacerlo de nuevo |
| El contexto se resuelve **por ruta** (`/k/{cuenta}`, `/o/{organización}`), no por dominio | Una persona puede abrir una cuenta de otra organización desde cualquier dirección. No es un hueco de datos (la RLS manda), pero el dominio no significa nada |
| Supuestos de «una organización»: `dk_create_kitchen` sin organización usa `dk_default_organization_id()`, y la «última cuenta» es global (`last_account_id`), no por organización | Al entrar a B podría proponer una cuenta de A |
| `dk_ai_insights` no tiene `organization_id` (se deduce por la cuenta) | El portal lo calcula con uniones; el pedido quiere el dato explícito |
| Regla vigente: una persona puede ser **dueña** de una sola organización (`owner_user_id` único, ADR 0008), aunque sea **miembro** de muchas | Se mantiene (lógica de negocio existente) |

---

## 2. Arquitectura

```
quanela.com (raíz)                         {slug}.quanela.com (organización)
  landing · registro · login general         login con el nombre de la organización
  activación · crear contraseña              /            → tu cuenta en esta organización
  «Tus organizaciones» (enlaces a cada una)  /k/{cuenta}/… → operación (como hoy)
                                             /o/…          → centro de administración
admin.quanela.com → portal Global Admin (proyecto aparte, sin cambios)
```

**Un dominio comodín (`*.quanela.com`) en el proyecto de Quanela:**
- un solo despliegue y una sola aplicación;
- cada organización nueva funciona al instante, sin tocar Vercel ni el DNS.

Los dominios explícitos (`quanela.com`, `www`, `admin`) tienen prioridad sobre el comodín.

### 2.1 Resolución del tenant (`resolveOrganizationFromHost`)
Hay un solo módulo, `src/shared/tenant/`:
1. Lee el `hostname` y el dominio raíz (`VITE_TENANT_ROOT_DOMAIN`).
2. Lo clasifica:
   - `quanela.com` o `www` → host raíz;
   - `{etiqueta}.quanela.com` → tenant;
   - cualquier otro host (vistas previas de Vercel, IP) → modo actual por ruta, como respaldo.
3. Si es un tenant, consulta `dk_tenant_public(slug)`, una función pública que solo devuelve si existe, el nombre, si está activa y, si el `slug` cambió, el nuevo.
4. Con sesión, cruza el tenant con tus membresías (`dk_my_context`): tu membresía en **esa** organización, sus cuentas y tus roles y permisos.

**Un solo contexto, `TenantProvider` (`useTenant()`):**
- da `organization`, `membership`, `accounts`, `role` y `permissions`;
- `KitchenScope` (cuenta) y `OrgScope` (organización) leen de él;
- ningún módulo resuelve la organización por su cuenta;
- el hostname es la fuente de verdad, no `localStorage`.

### 2.2 Puerta de entrada (`TenantGate`)
Corre antes de montar cualquier ruta del tenant:
```
host → ¿existe la organización? → ¿está activa? → ¿hay sesión? → ¿eres miembro activo? → ¿tienes alguna cuenta o permiso? → app
          no: «No existe»           no: «Desactivada»   no: login de la organización   no: «No tienes acceso a X» (con tus organizaciones)
```
- **Una cuenta o organización de otro tenant** en la ruta lleva al subdominio que le corresponde, misma ruta.
- **Rutas cortas.** `/orders` o `/kitchen` en un tenant llevan a `/k/{tu cuenta en esta organización}/orders`, con la regla de «inicio por rol» de la ADR 0020.

### 2.3 Sesión compartida entre subdominios
- La sesión de Supabase pasa a una **cookie de primer nivel en `.quanela.com`**: Secure, SameSite=Lax y repartida en partes por el límite de 4 KB.
- Con un inicio de sesión entras a todas tus organizaciones; cambiar de organización es solo navegar al otro subdominio.
- **Migración sin cerrar sesiones.** Si hay una sesión en `localStorage`, se copia a la cookie la primera vez.
- **Cerrar sesión** cierra en todos los subdominios, porque es la misma sesión.
- **El portal Global Admin sigue aparte:** su propio almacenamiento y su propia clave (ADR 0019).
- **En desarrollo (`*.localhost`)** la cookie no se puede compartir, así que cada subdominio inicia sesión por separado (sección 6).

### 2.4 Cambio de organización
- El menú de usuario muestra «Organización actual» y la lista de tus organizaciones.
- Elegir otra **navega a `https://{slug}.quanela.com`**: no se cambia nada en memoria.
- El selector de cuentas también lleva al subdominio cuando la cuenta es de otra organización.

---

## 3. Base de datos
1. **`slug` inmutable.** El guardián de `dk_organizations` rechaza cambiarlo. Solo el portal lo hace con `dk_ga_set_organization_slug`: exige rol y MFA, pide confirmación y deja auditoría.
2. **Alias.** El `slug` anterior queda en `dk_organization_slug_aliases`; el subdominio viejo redirige al nuevo y ninguna organización nueva puede tomarlo.
3. **Reservados.** `www`, `admin`, `app`, `api`, `auth`, `login`, `mail`, `static`, `assets`, `cdn`, `status`, `help`, `soporte`, `blog`, `docs`, `dev`, `staging`, `preview`, `cuentas`, `quanela` y similares:
   - `dk_unique_slug` los salta, igual que los alias;
   - una restricción impide guardarlos;
   - las organizaciones existentes (`dark-kitchen`, `julian-hamburguesas`) ya son válidas y conservan su `slug`, así que su subdominio queda listo sin migrar nada.
4. **`dk_tenant_public(slug)`.** Es la única lectura anónima: devuelve `{exists, name, active, redirectTo}`, sin ids ni otros datos.
5. **`dk_create_kitchen`.** La interfaz siempre pasa la organización del tenant. El valor por defecto queda solo como respaldo.
6. **Última cuenta por organización.** Se guarda para cada organización, no una sola global, para entrar a B con tu última cuenta de B.
7. **`dk_ai_insights.organization_id`.** Se llena desde la cuenta con un trigger, se completan las filas existentes y lleva índice. El registro de IA queda con organización, persona (`created_by`), función y fecha, y el monitoreo del portal lo usa directamente.

## 4. Flujos de alta
- **Registro (landing).**
  - Al terminar, muestra «Tu espacio Quanela: **{slug}.quanela.com**» con botón para entrar, que te lleva ahí.
  - El correo de confirmación sigue llegando a `quanela.com`, que redirige a tu subdominio.
- **Portal Global Admin.**
  - La lista y el detalle muestran el subdominio, con botones **Abrir** y **Copiar**.
  - El resumen del alta incluye la URL.
  - La activación del administrador invitado lo lleva a su subdominio.
  - Desde el detalle se puede **cambiar el subdominio** (con confirmación y alias).
- **Invitaciones y enlaces de contraseña.** Se quedan en `quanela.com/activar/...` y `/set-password` (un solo lugar). Al terminar, llevan al subdominio de la organización.

## 5. Copilot e IA
- **Copilot.** Ya está aislado por cuenta; desde `a.quanela.com` solo hay cuentas de A en el contexto.
- **Registro de cada uso.** Lleva `organization_id`, `kitchen_id`, `created_by`, `feature_key` y `created_at`.
- **Configuración.** La de IA sigue siendo de la organización (ADR 0018).

## 6. Despliegue y desarrollo local
| Dónde | Configuración |
|---|---|
| **Vercel (proyecto Quanela)** | Dominios `quanela.com`, `www.quanela.com` y **`*.quanela.com`** (una sola vez). El certificado comodín lo emite Vercel porque el DNS ya está en Vercel |
| **DNS** | Nada nuevo: Vercel crea el registro comodín al agregar el dominio |
| **Vercel (proyecto portal)** | Sin cambios (`admin.quanela.com` gana sobre el comodín) |
| **Variables** | `VITE_TENANT_ROOT_DOMAIN=quanela.com` y `VITE_SITE_URL=https://quanela.com`. En el portal, `VITE_TENANT_ROOT_DOMAIN` para armar los enlaces |
| **Supabase Auth → Redirect URLs** | Agregar `https://*.quanela.com/**` |
| **Edge Functions** | Sin cambios de CORS (`*`); `QUANELA_APP_URL` sigue en `https://quanela.com` |
| **Local** | `http://{slug}.localhost:5173`: Chrome, Edge y Firefox resuelven `*.localhost` sin tocar `/etc/hosts`. Con `VITE_TENANT_ROOT_DOMAIN=localhost`, la raíz es `localhost:5173`. La sesión no se comparte entre subdominios en local |

**Middleware.** Quanela es una SPA estática de Vite, sin servidor por petición. La resolución corre en el arranque de la app (`TenantGate`), antes de cualquier ruta, y la autoridad es la base. Un middleware en el borde de Vercel no agregaría seguridad, porque la RLS ya decide. Queda como opción futura para responder 404 sin cargar la app (D5).

## 7. Pruebas
- **SQL (suite `tenants`):**
  - `slug` inmutable para el administrador de la organización, y su cambio por el portal con alias;
  - reservados bloqueados, también en el registro y en el alta del portal;
  - `dk_tenant_public` (existe, inactiva, alias, sin datos sensibles; funciona como anónimo);
  - una persona con membresía en A (Admin) y B (rol limitado): permisos distintos según la cuenta, datos de A invisibles desde B y al revés, encabezado de cuenta ajena rechazado;
  - un usuario sin membresía en B no ve nada;
  - `dk_ai_insights.organization_id` correcto.
- **Vitest:**
  - lectura del host (raíz, `www`, tenant, reservado, `localhost`, vista previa);
  - URL de tenant;
  - almacenamiento en cookie repartida en partes (leer, escribir, borrar, migrar);
  - decisiones de `TenantGate` (no existe, inactiva, sin sesión, sin membresía, ok);
  - redirección de cuenta ajena al host correcto.
- **Navegador (local, `*.localhost`):** dos organizaciones y una persona con ambas membresías; necesita tu sesión.
- **Producción:** después de que agregues `*.quanela.com`, comprobar que `dark-kitchen.quanela.com` y `julian-hamburguesas.quanela.com` responden con TLS.
- **Regresión:** todas las suites, `tsc`, `oxlint` y ambos builds.

## 8. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Identificador del subdominio | **El `slug` actual de la organización**: único, estable, legible, ya existe para todas y está separado del `id` y del `name`. El UUID es feo y largo; un código corto no dice nada |
| **D2** | ¿La cuenta va en la ruta? | **Sí: `/k/{cuenta}/…` bajo el subdominio**, porque una organización puede tener varias cuentas. Las rutas cortas (`/orders`) llevan a tu cuenta |
| **D3** | Sesión entre subdominios | **Compartida (cookie en `.quanela.com`)**: un inicio de sesión para todas tus organizaciones y un cambio de organización sin volver a entrar |
| **D4** | Raíz `quanela.com` | **Landing, registro, login general, activación y «Tus organizaciones».** Una ruta de la app en la raíz lleva al subdominio que corresponde |
| **D5** | Middleware en el borde | **No por ahora.** La resolución corre en el arranque de la app y la base es la autoridad |
| **D6** | Desarrollo local | **`*.localhost`**, con sesión por subdominio |
| **D7** | Cambiar el subdominio | **Solo el Global Admin**, con alias y redirección |
| **D8** | `organization_id` en el registro de IA | **Sí**, con trigger y relleno de las filas existentes |
| **D9** | Hosts sin tenant (vistas previas de Vercel) | **Modo actual por ruta**, para no romper vistas previas ni pruebas |
| **D10** | Dueño de varias organizaciones | **Se mantiene la regla actual:** dueño de una, miembro de muchas |

## 9. Orden de ejecución
| Fase | Qué |
|---|---|
| 1 | Base: guardián del `slug`, reservados, alias, `dk_tenant_public`, `dk_ga_set_organization_slug`, `dk_create_kitchen` con organización explícita, última cuenta por organización, `organization_id` en `dk_ai_insights`; suite `tenants` |
| 2 | Núcleo del tenant: `src/shared/tenant` (host, resolución, URL), `TenantProvider`/`useTenant`, sesión en cookie compartida con migración desde `localStorage`, variables de entorno |
| 3 | Rutas: `TenantGate` (login de la organización, «no existe», «desactivada», «sin acceso»), redirecciones al host correcto, rutas cortas, raíz con «Tus organizaciones», selector de organización y de cuentas entre hosts |
| 4 | Altas: resultado del registro con la URL; portal con subdominio, Abrir, Copiar y cambio de subdominio; activación e invitaciones llevan al subdominio |
| 5 | IA: `organization_id` en el registro y en el monitoreo del portal |
| 6 | Validación: SQL, vitest, `tsc`, `oxlint`, ambos builds, navegador con `*.localhost` |
| 7 | Documentación: esta ADR con resultados, la arquitectura y la guía de dominio, DNS y Vercel (el manual no) |

## 10. Riesgos
| Riesgo | Mitigación |
|---|---|
| Cookie de sesión legible por JavaScript (igual que hoy `localStorage`) | La misma exposición que hoy; Secure y SameSite=Lax; solo subdominios propios |
| Un `slug` cambiado rompe enlaces guardados | Inmutable por defecto; alias con redirección si el Global Admin lo cambia |
| Subdominios ofensivos o confusos (`admin-quanela`, `soporte`) | Lista de reservados y revisión en el alta del portal |
| Vistas previas de Vercel sin comodín | Modo por ruta como respaldo (D9) |

## 11. Qué necesito de ti
1. **Aprobar esta ADR**, con D1 a D10 confirmadas o corregidas.
2. **En Vercel (proyecto Quanela), cuando yo termine:**
   - agregar el dominio `*.quanela.com`;
   - definir `VITE_TENANT_ROOT_DOMAIN=quanela.com` (y `VITE_SITE_URL=https://quanela.com` si falta).

   En el portal, `VITE_TENANT_ROOT_DOMAIN=quanela.com`.
3. **En Supabase Auth → Redirect URLs:** agregar `https://*.quanela.com/**`.
4. **Probar:** iniciar sesión en el panel de vista previa (`*.localhost`) y, después del despliegue, en producción.

---

## 12. Resultados (2026-10-01)

### 12.1 Lo construido
| Fase | Resultado |
|---|---|
| 1 | Migración `20261001160000_dk_tenant_subdomains.sql` (aplicada): `dk_is_reserved_slug` y restricción; guardián del `slug` (solo `dk_ga_set_organization_slug`, con rol y MFA, lo cambia); alias `dk_organization_slug_aliases`; `dk_unique_slug` que salta reservados y alias; `dk_tenant_public` (anónima, sin ids); `dk_ai_insights.organization_id` con trigger, relleno e índice; AI Monitoring del portal agrupa por esa columna. Suite `tenants` (32 pruebas) |
| 2 | `src/shared/tenant`: `host.ts` (`parseHost`, `tenantUrl`, `rootUrl`, `sharedCookieDomain`), `resolve.ts` (`resolveOrganizationFromHost`, `tenantAccess`), `navigation.ts` (`hostRedirectFor`, `goToOrganization`), `TenantProvider` y `useTenant()` como contexto único. Sesión en cookie de `.quanela.com` (`sharedSessionStorage.ts`, repartida en partes, con migración desde `localStorage`) |
| 3 | `TenantGate` es la ruta de diseño de todas las rutas: «no existe», «desactivada», «sin acceso» (con tus otras organizaciones) y redirección de subdominios renombrados. Login con el nombre de la organización. `/` y las rutas cortas llevan a tu cuenta **de esa organización**. `KitchenScope` y `OrgScope` llevan al subdominio correcto si la cuenta u organización es de otra. «Cambiar de organización» en el menú de usuario cambia el host. «Tus cuentas» en un subdominio muestra solo las de esa organización y enlaces a las demás |
| 4 | Registro: al terminar muestra «Tu espacio Quanela: {slug}.quanela.com» con Copiar y Entrar. Portal: columna Subdominio en Organizations; en el detalle, barra con Abrir, Copiar y Cambiar (con alias); el resumen del alta muestra el subdominio. Activación y enlaces de contraseña terminan en el subdominio (la redirección de `KitchenScope`) |
| 5 | Cada uso de IA (Copilot incluido) queda con `organization_id`, `kitchen_id`, `created_by`, `feature_key` y `created_at` |

### 12.2 Ajustes durante la ejecución
| Ajuste | Motivo |
|---|---|
| La última cuenta por organización no necesitó cambios en la base | `localStorage` ya es por origen (por subdominio), y la última cuenta del perfil solo se usa si es de esa organización |
| `dk_create_kitchen` no cambió | La interfaz ya le pasaba la organización |
| Las pruebas corren sin dominio raíz (`test.env` en `vite.config.ts`) | Vitest lee `.env.local`; cada prueba de subdominios fija el suyo |
| Agregué `VITE_TENANT_ROOT_DOMAIN=localhost` a tu `.env.local` | Para probar `*.localhost` en local. No existía `.env.example` |

### 12.3 Validación de los 20 puntos
| # | Punto | Estado | Cómo se comprobó |
|---|---|---|---|
| 1–3 | La misma identidad entra a A y a B | ✅ base · ⏳ navegador con sesión | Suite `tenants`: el mismo usuario es ADMIN en A y KITCHEN en B; `tenantAccess` (vitest) |
| 4 | El rol cambia según la organización | ✅ | `tenants`: `settings.manage` sí en A y no en B; `kitchen.prepare` en B |
| 5–6 | Los datos de A no aparecen en B, ni al revés | ✅ | `tenants` y `multikitchen_isolation` (72) |
| 7 | Cambiar de organización cambia el subdominio | ✅ código · ⏳ con sesión | `goToOrganization` y `hostRedirectFor` (vitest con `org-a.quanela.com`) |
| 8 | Sin membresía no se entra | ✅ | `tenantAccess` (correo existente sin membresía, pendiente, desactivada) y la pantalla «No tienes acceso» |
| 9–10 | No se pueden manipular datos de B; la RLS bloquea | ✅ | `tenants`: encabezado de B sin membresía → sin cuenta, sin pedidos, no escribe, no renombra |
| 11 | El registro genera el tenant | ✅ | El `slug` nace en `dk_provision_organization`; la pantalla final muestra la URL |
| 12 | El portal genera el tenant | ✅ | El mismo `dk_provision_organization`; el resumen y la lista muestran el subdominio |
| 13–14 | Sin subdominios manuales ni código por organización | ✅ diseño · ⏳ tu paso en Vercel | Un dominio comodín (sección 6). Local: `dark-kitchen.localhost` y `julian-hamburguesas.localhost` funcionan sin configurar nada |
| 15–16 | Funciona al recargar y en una sesión nueva | ✅ | El tenant sale del host en cada carga (nada en memoria); la sesión vive en cookie |
| 17 | Las organizaciones existentes tienen subdominio | ✅ | `dark-kitchen` y `julian-hamburguesas` son válidos y no reservados (prueba) y se ven en el navegador local |
| 18 | El Global Admin ve el subdominio | ✅ | Columna, barra con Abrir/Copiar/Cambiar y resumen del alta |
| 19 | IA aislada por organización | ✅ | Herramientas por cuenta (`copilot_tools`) y `organization_id` en cada uso (`tenants`) |
| 20 | Lint, pruebas y build | ✅ | SQL **685/685** (28 suites). Vitest **274/274**, con las nuevas de host, sesión en cookie, acceso al tenant y navegación entre subdominios. `tsc` sin errores. `oxlint` con 17 avisos (igual que antes). Ambos builds |

**Navegador local (sin sesión):**
- `dark-kitchen.localhost:5173` y `julian-hamburguesas.localhost:5173` muestran el login con el nombre de cada organización.
- `no-existe-esta.localhost:5173/orders` muestra «Esta dirección no existe».
- `localhost:5173` muestra la landing.
- `dark-kitchen.localhost:5173/kitchen` lleva al login de esa organización.
- No hay errores en la consola.

**Pendiente con tu sesión:**
- entrar a cada subdominio;
- cambiar de organización;
- en producción, después de agregar `*.quanela.com`.
