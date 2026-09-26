# ADR 0010 — Planes, precios públicos y onboarding con plan

## Estado
**Aprobada (2026-09-25) con las recomendaciones de la sección 10 e implementada completa** en `dark-kitchen` (`cqfzcwpqisaohcjaevxf`). D4: queda el contacto provisional `mailto:ventas@darkkitchen.co` (se cambia en `dk_plans.contact_url` del plan Enterprise).

| Fase | Estado |
|---|---|
| 1. Planes y suscripciones | ✅ `20260927100000_dk_plans_subscriptions`: `dk_plans`, `dk_plan_features`, `dk_subscriptions`, lectura pública de catálogos, disparador que da suscripción a toda organización nueva, Dark Kitchen en Enterprise activo, `dk_my_subscription`, `dk_set_subscription`, `dk_subscription_is_current`. |
| 2. Landing | ✅ Navegación (escritorio y menú en celular), `#producto`, `#funcionalidades`, `#precios` (tarjetas + comparativa desde la base), `#faq`; `/precios` → `/landing#precios`. |
| 3. Registro | ✅ `20260927110000_dk_plan_enforcement` + registro en 3 pasos (`useSelectedPlan`: URL + pestaña), *Cambiar plan*, primera Cuenta con nombre e icono, confirmación con plan y recuperación si el plan dejó de estar disponible. |
| 4. Organización y plataforma | ✅ Pestaña **Plan** (estado, prueba, límites y uso), candado "Incluida en X" en *Funciones*, límite visible al crear Cuentas; en `/admin`, *Organizaciones y planes*. Edge Function con motivo `plan`. |
| 5–6. Pruebas y validación | ✅ SQL **336/336** (nueva `plans` 39; actualizadas `accounts`, `signup`). App **128/128**, `tsc`, `oxlint` sin avisos nuevos, `build`. Visual: landing y precios (datos reales, sin sesión), recorridos A y B del registro con el interruptor encendido solo durante la prueba (sin enviar), C (*Hablar con ventas*), registro apagado (D6), pestaña Plan y candados (arnés temporal). |
| 7. Documentación | ✅ Manual 3.2 + PDF, este ADR, arquitectura y ERD. |

**Diferencias con el plan (decididas al implementar):**
- **Toda organización tiene suscripción** por un disparador (nace en Standard, en prueba). Así ninguna queda sin plan, ni siquiera las creadas por la plataforma o en pruebas; `dk_create_organization` la ajusta al plan elegido en la misma transacción.
- **Tope de usuarios** en una guardia de `dk_organization_members`: cuentan los miembros activos y pendientes. Las altas y reactivaciones se validan; desactivar a alguien libera su puesto.
- **La tarjeta de plan muestra las viñetas del catálogo**; los límites exactos están en la comparativa, que se calcula desde `limits`.
- **Vista de compatibilidad `dk_ai_features`**: también respeta el plan.

---

*Propuesta original (para referencia):*

Continúa los ADR [0008](./0008-organizaciones-y-cuentas.md) (Organización → Cuenta → Usuario → Rol → Permiso) y [0009](./0009-iconos-avatares-y-funciones.md) (funciones por Organización y Cuenta).

---

## 1. Estado actual (auditoría)

| Área | Hoy |
|---|---|
| Landing (`src/modules/landing`) | Encabezado solo con logo e *Iniciar sesión*. Hero con un CTA (*Crear mi negocio* si el registro está abierto) y una sección de 4 funcionalidades. **No hay Precios, FAQ ni navegación por secciones.** |
| Registro (`src/modules/signup`) | `/registro` en 2 pasos: usuario y datos del negocio. `supabase.auth.signUp` guarda los datos del negocio en los metadatos del usuario (`pending_organization`) y pide confirmar el correo. **Hasta confirmar no se crea nada.** `/registro/confirmado` llama a `dk_create_organization`, que en una transacción e idempotente crea la organización, el SUPER_ADMIN, la primera Cuenta (con el nombre del negocio), ADMIN (ADR 0009) y entra a la Cuenta. Si la persona confirma y no termina, al volver a entrar `NoProfilePage` la lleva a terminar. |
| Interruptor | `VITE_PUBLIC_SIGNUP=false` (el registro muestra "El registro abre pronto") hasta configurar SMTP, confirmación de correo y Turnstile (ADR 0008 D8). |
| Planes | **No existen.** `dk_organizations.max_accounts` es un tope manual (null = sin tope) que respeta `dk_create_kitchen`. No hay tope de usuarios. |
| Funciones | Catálogo `dk_features` (ADR 0009): usable = ofrecida por la organización ∧ activada en la Cuenta ∧ permiso. Encaja con "funciones por plan". |
| Organizaciones por persona | Una persona es dueña de **una** organización (ADR 0008); `dk_create_organization` es idempotente. |

## 2. Problemas encontrados
| # | Problema |
|---|---|
| P1 | No se pueden consultar precios ni comparar planes. |
| P2 | El registro no pide plan y la organización no tiene plan ni suscripción. |
| P3 | Los límites (Cuentas, usuarios) no dependen de nada; solo hay un tope manual de Cuentas. |
| P4 | Las funciones no dependen del plan: no hay forma de que Standard no incluya IA. |
| P5 | La navegación de la landing no lleva a Producto, Funcionalidades, Precios ni FAQ. |
| P6 | Los metadatos del registro los puede editar la propia persona: **el plan elegido no es confiable por sí solo** y hay que validarlo en la base. |

**Lo que ya está bien y se conserva:** no se crean organizaciones huérfanas. Hasta confirmar el correo solo existe el usuario de Auth con metadatos. Organización, suscripción, Cuenta y roles se crean juntos en una transacción.

---

## 3. Arquitectura objetivo
```
PLAN (catálogo)            standard · business · enterprise: precio, periodicidad, límites, funciones incluidas, CTA
   ↓
ORGANIZACIÓN ── SUSCRIPCIÓN   plan, estado (trial/activa/…), fechas, periodicidad, proveedor de pago (futuro)
   ↓
CUENTA ── FUNCIONES           usable = plan incluye ∧ organización ofrece ∧ Cuenta activa ∧ permiso del rol
   ↓
USUARIO                       el plan NUNCA va en el usuario
```

### 3.1 Catálogo de planes (fuente central)
Tabla `dk_plans`. La landing, el registro, la organización y la base leen de ella; nada de precios ni funciones en los componentes.

| Campo | Uso |
|---|---|
| `key` | `standard`, `business`, `enterprise` |
| `name`, `description`, `badge` | "Business", "Para varios establecimientos", "Más popular" |
| `price_monthly`, `price_yearly`, `currency` | 49 900 / 99 900 / 249 900 COP. `price_yearly` null = sin anual (el selector mensual/anual aparece solo si algún plan lo tiene). |
| `trial_days` | Días de prueba al empezar gratis. |
| `limits` | `{ "accounts": n \| null, "users": n \| null }` (null = ilimitado). |
| `highlights` | Viñetas de la tarjeta de precio. |
| `cta` | `signup` (Comenzar gratis) o `contact_sales` (Hablar con ventas). |
| `self_serve` | Si se puede elegir en el registro. |
| `status` | `public` (se muestra), `hidden` (se puede asignar, no se muestra), `retired`. |
| `sort_order` | Orden en pantalla. |

`dk_plan_features (plan_key, feature_key → dk_features)`: qué funciones incluye cada plan. La tabla comparativa se arma con esto y con los límites, sin textos fijos en el código.

**Lectura pública:** `dk_plans` (con `status = 'public'`), `dk_plan_features` y `dk_features` se pueden leer sin sesión (rol `anon`, solo lectura). No hay datos sensibles. Así la landing muestra precios sin registro y un cambio de precio es un `UPDATE`, sin reconstruir la landing.

### 3.2 Suscripción de la organización
Tabla `dk_subscriptions`, **una por organización** (el plan es de la organización, nunca del usuario):

| Campo | Uso |
|---|---|
| `organization_id` (único), `plan_key` | Plan vigente. |
| `status` | `trialing`, `active`, `past_due`, `canceled`, `expired`. |
| `billing_period` | `monthly` / `annual`. |
| `trial_ends_at`, `started_at`, `current_period_start`, `current_period_end` (renovación) | Fechas. |
| `cancel_at_period_end`, `canceled_at` | Cancelación. |
| `provider`, `provider_customer_id`, `provider_subscription_id` | Vacíos hasta integrar pagos. |

- Historial en `dk_audit_log` (disparador de auditoría existente): cada alta, cambio de plan (upgrade/downgrade) y cancelación queda registrada.
- **Sin pagos en esta entrega.** El cambio de plan lo hace la plataforma con `dk_set_subscription` (solo administrador de la plataforma). La organización ve su plan, estado, fin de la prueba, límites y uso.
- Si Juan tuviera otra organización, tendría su propia suscripción. Hoy una persona es dueña de una sola organización (ADR 0008) y eso no cambia; el modelo ya lo soporta.

### 3.3 Qué aplica el plan (en la base)
- **Funciones:** `dk_feature_available(org, clave)` suma "el plan de la organización la incluye". Queda `usable = plan ∧ organización ∧ Cuenta ∧ permiso`: una sola fórmula, la de ADR 0009. En *Funciones* de la organización, lo que el plan no incluye aparece con candado ("Incluido en Business"), y `dk_set_org_feature` no deja ofrecerlo.
- **Cuentas:** `dk_create_kitchen` usa el límite del plan. `dk_organizations.max_accounts` queda como ajuste manual de la plataforma y, si existe, manda.
- **Usuarios:** una guardia en `dk_organization_members` (alta o reactivación) respeta `limits.users` para miembros activos y pendientes. Un solo punto: cubre crear usuario, activación y asignaciones.
- **Bajar de plan:** no borra nada. Lo que excede el nuevo límite se conserva, pero no se puede crear más. Las funciones que el nuevo plan no incluye quedan apagadas, con la configuración de cada Cuenta guardada (misma regla de conservación del ADR 0009).
- **Prueba vencida:** sin pagos no se bloquea nada (decisión D2); solo se muestra el aviso. La función `dk_subscription_is_current(org)` queda lista para el día que se cobre.

### 3.4 Onboarding
```
Landing ─┬─ Precios → [Comenzar gratis: Standard | Business] ──→ /registro?plan=business ─┐
         ├─ Crear cuenta ─────────────────────────────────────→ /registro ───────────────┤
         └─ Precios → Enterprise → [Hablar con ventas] → contacto de ventas (D4)          │
                                                                                          ↓
  1. Tu usuario (nombre, correo, contraseña)
  2. Tu plan ── con plan en la URL: resumen "Plan seleccionado: Business — $99.900 COP/mes [Cambiar plan]"
             └─ sin plan: selector "Elige el plan para tu negocio" (obligatorio para continuar)
  3. Tu negocio (organización) y tu primera cuenta (nombre, por defecto el del negocio, e icono sugerido)
  → Crear: Auth guarda { negocio, primera cuenta, plan } en los metadatos y pide confirmar el correo
  → Confirmar correo → /registro/confirmado → dk_create_organization(…, plan):
       una transacción: organización + suscripción (prueba) + SUPER_ADMIN + primera Cuenta + ADMIN
  → Entra a la Cuenta ("bienvenida")
```
- El plan elegido viaja en la URL (`?plan=`) y se guarda en `sessionStorage` (sobrevive a recargar). En todos los pasos se ve el resumen del plan con **Cambiar plan**.
- La base **valida el plan** al crear la organización: debe existir, estar público o disponible y ser `self_serve`. Uno inválido o manipulado se rechaza con un mensaje claro y la opción de elegir otro. Nada queda creado a medias.
- **Abandono:** antes de confirmar el correo no existe organización. Si confirma y no termina, al iniciar sesión se retoma `/registro/confirmado` (ya existe). No hay organizaciones huérfanas ni pasos intermedios en la base.
- Con sesión iniciada, los CTA de precios dicen *Ir a mi cuenta* (una organización por persona).

### 3.5 Landing
- Navegación: **Producto · Funcionalidades · Precios · FAQ · Iniciar sesión · Crear cuenta**, con anclas (`#producto`, `#funcionalidades`, `#precios`, `#faq`) y desplazamiento suave. En el celular, un menú desplegable.
- `/precios` redirige a `/#precios` (enlace para compartir).
- **Precios:** 3 tarjetas (nombre, precio mensual en COP, descripción, viñetas, límites, CTA, "Más popular" en Business) y una **tabla comparativa** (límites y funciones por plan, desde la base). El selector mensual/anual aparece solo cuando exista precio anual.
- **FAQ:** preguntas sobre prueba gratis, cambio de plan, límites, datos y soporte.
- Carga: esqueleto mientras llegan los planes; si fallan, mensaje y *Reintentar*.
- Los componentes de precios (`PlanCard`, `PlanComparison`) se comparten entre la landing y el paso 2 del registro: una sola experiencia en los caminos A, B y C.

---

## 4. Cambios necesarios

### 4.1 Base de datos
| Objeto | Cambio |
|---|---|
| `dk_plans`, `dk_plan_features` | **Nuevas** (catálogo + semillas de la sección 10, D1). RLS: SELECT para `anon` y `authenticated` (planes públicos); sin escrituras desde la API. |
| `dk_subscriptions` | **Nueva**. RLS: SELECT para miembros activos de la organización (`organization.view`) y plataforma. Escritura solo por RPC. Auditoría. |
| `dk_features` | SELECT también para `anon` (lo necesita la comparativa). |
| `dk_feature_available` | + plan incluye la función. |
| `dk_set_org_feature` | Rechaza ofrecer una función que el plan no incluye. |
| `dk_org_feature_matrix`, `dk_my_features` | + `includedInPlan` por función (para el candado). |
| `dk_create_kitchen` | Límite de Cuentas = `max_accounts` manual o el del plan. |
| Guardia de miembros | Límite de usuarios del plan. |
| `dk_create_organization` | + `p_plan`, `p_account_name`, `p_account_icon`. Valida el plan y crea la suscripción en la misma transacción. Sigue idempotente. |
| RPC nuevas | `dk_my_subscription(org)` (plan, estado, fechas, límites y uso), `dk_set_subscription(org, plan, estado, periodicidad)` (solo plataforma: upgrade, downgrade, cancelación), `dk_subscription_is_current(org)`. |
| Datos | La organización existente recibe su suscripción (D5). |

### 4.2 RLS
- Lectura anónima **solo** de los catálogos (`dk_plans` públicos, `dk_plan_features`, `dk_features`). Ningún dato de organizaciones, Cuentas ni usuarios se abre.
- `dk_subscriptions`: nadie escribe directo. La crean `dk_create_organization` y la plataforma con `dk_set_subscription`. La ve la propia organización.
- Las funciones de límites y plan se usan dentro de RPC `SECURITY DEFINER` y guardias, como el resto del esquema.

### 4.3 Frontend
| Área | Cambio |
|---|---|
| `src/shared/plans/` | Tipos, `fetchPublicPlans()`, `formatPlanPrice()`, `useSelectedPlan()` (URL + `sessionStorage`), `PlanCard`, `PlanComparison`, `PlanSummary` (resumen con *Cambiar plan*). |
| Landing | Navegación completa (escritorio y celular), secciones `#producto`, `#funcionalidades`, `#precios` (tarjetas + comparativa), `#faq`, CTA *Crear cuenta*. Ruta `/precios` → `/#precios`. |
| Registro | 3 pasos (usuario → plan → negocio y primera Cuenta), plan preseleccionado o selector obligatorio, *Cambiar plan*, envío del plan con el registro. Enterprise en el selector según D3. |
| Confirmación | Envía plan, nombre e icono de la primera Cuenta a `dk_create_organization`; si el plan ya no es válido, ofrece elegir otro sin perder los datos. |
| Organización | Pestaña **Plan**: plan, estado, prueba hasta, límites y uso (Cuentas x/y, usuarios x/y), qué incluye; *Hablar con ventas* para cambiar. En *Funciones*, candado "Incluido en X" para lo que el plan no trae. Crear Cuenta y crear usuario explican el límite si se alcanzó. |
| Plataforma (`/admin`) | Cambiar el plan y el estado de una organización. |

### 4.4 Backend / autenticación
- Auth sin cambios: mismo `signUp` con confirmación de correo. Los metadatos llevan además `plan` y la primera Cuenta.
- Sin pagos ni proveedor de cobro. La estructura (`provider_*`, estados, fechas y periodicidad) queda lista.

---

## 5. Orden de ejecución y dependencias
```
1 M1 catálogo de planes + suscripciones + lectura pública ─┬─→ 2 Landing (precios, comparativa, FAQ, navegación)
                                                            ├─→ 3 Registro con plan (depende de 2: comparte PlanCard)
2 M2 plan aplicado (funciones, límites, crear organización) ┴─→ 4 Organización: pestaña Plan, candados, límites; plataforma
5 Pruebas SQL/app → 6 Validación integral y visual → 7 Documentación
```
M1 va antes que todo (la landing lee de ahí). M2 redefine `dk_create_organization` en su forma final, así que el registro y la confirmación se prueban después de M2.

## 6. Migraciones
| Migración | Contenido | Reversible |
|---|---|---|
| `20260927100000_dk_plans_subscriptions` | `dk_plans`, `dk_plan_features`, `dk_subscriptions`, semillas, lectura pública, suscripción de la organización existente, `dk_my_subscription`, `dk_set_subscription`, `dk_subscription_is_current`. | Sí (tablas nuevas). |
| `20260927110000_dk_plan_enforcement` | Plan en `dk_feature_available`, `dk_set_org_feature`, matriz y `dk_my_features`; límites de Cuentas y usuarios; `dk_create_organization` final con plan y primera Cuenta. | Sí. |

Cada una se ensaya antes con `run.py --with …` (transacción revertida), después `db push`, tipos y asesores.

## 7. Compatibilidad
- **Nada cambia para la organización existente**: D5 le asigna un plan que incluye todo, sin límite práctico.
- El registro sigue apagado mientras `VITE_PUBLIC_SIGNUP=false` (D6). La landing muestra precios igual.
- `dk_create_organization` cambia de firma. Los llamadores anteriores (la página de confirmación) se actualizan en la misma entrega, y a quien no envíe plan se le exige elegirlo.
- `max_accounts` manual se sigue respetando.

## 8. Validaciones
**SQL (suite nueva `plans.sql` y actualizaciones):**
- Se leen planes sin sesión y **no** se leen organizaciones ni suscripciones.
- Crear organización con Business deja la suscripción en prueba, con fechas, y el SUPER_ADMIN + ADMIN en la primera Cuenta con su nombre e icono.
- Se rechazan un plan inexistente, uno no `self_serve` (Enterprise) y uno retirado, sin crear nada.
- Es idempotente.
- Standard no puede ofrecer IA de modelo; Business sí. Los límites de Cuentas y usuarios se respetan, y la reactivación también cuenta.
- Bajar de plan conserva los datos y apaga lo no incluido; volver a subir restaura.
- Solo la plataforma cambia el plan; la organización no puede cambiarse de plan ni leer la suscripción de otra.

**App:** comparativa y precios desde los datos, formato COP, `useSelectedPlan` (URL → almacenamiento → cambiar), validaciones del registro. Todo con `tsc`, `oxlint`, `vitest` y `build`.

**Visual:** landing (navegación, precios, comparativa, FAQ) en escritorio y celular, y los 3 pasos del registro con y sin plan preseleccionado (arnés temporal para las pantallas con sesión).

**Recorridos A, B y C** verificados en el navegador integrado hasta donde lo permite el correo de confirmación. Si el registro está apagado se prueba con el interruptor encendido en local.

## 9. Riesgos
| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Manipular el plan en los metadatos o en la URL. | La base valida el plan (existe, se puede elegir, `self_serve`). Enterprise solo por ventas. |
| R2 | Abrir datos a `anon`. | Solo catálogos sin datos de clientes, y prueba de que lo demás sigue cerrado. |
| R3 | Bajar de plan "rompe" una Cuenta. | Nada se borra: solo se limita crear más y se apagan funciones, conservando su configuración. |
| R4 | La prueba vence sin pagos. | D2: sin bloqueo, solo aviso. La función de vigencia queda lista. |
| R5 | Límite de usuarios que bloquea la activación de alguien ya invitado. | Los pendientes cuentan al invitar, no al activar. Reactivar sí cuenta. |
| R6 | Precios desactualizados en la landing. | Vienen de la base: un `UPDATE` los cambia en todas partes. |

---

## 10. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Contenido de cada plan | **Standard** ($49.900/mes): 1 cuenta, 5 usuarios, todos los módulos, voz y alertas de pedidos detenidos. **Business** ($99.900/mes, *Más popular*): 3 cuentas, 15 usuarios, todo Standard + IA (sugerencias de compra, perecederos, poco movimiento, sugerencias de Cocina) + menús maestros entre cuentas. **Enterprise** ($249.900/mes): cuentas y usuarios ilimitados, todo Business + acompañamiento en la puesta en marcha e integraciones (WhatsApp/n8n) con soporte prioritario. Se ajusta después con un `UPDATE`. |
| **D2** | Prueba gratis | 14 días en Standard y Business. Al vencer **no se bloquea nada** (no hay pagos): solo el aviso "Tu prueba terminó". |
| **D3** | Enterprise en el selector del registro | Se muestra (para comparar) con **Hablar con ventas**, no seleccionable. |
| **D4** | Destino de *Hablar con ventas* | Un enlace configurable (correo `mailto:` o WhatsApp `wa.me`) guardado en el catálogo del plan Enterprise. **Necesito el correo o el número.** Si no lo das, queda un marcador `ventas@darkkitchen.co` para reemplazar. |
| **D5** | Organización existente (Dark Kitchen) | Enterprise, estado `active`, sin prueba. |
| **D6** | Registro apagado (`VITE_PUBLIC_SIGNUP=false`) | Precios siempre visibles. *Comenzar gratis* lleva a `/registro?plan=…`, que muestra "El registro abre pronto" con el plan elegido y *Hablar con ventas*. Se enciende cuando SMTP, confirmación y Turnstile estén listos. |
| **D7** | Cambio de plan | Sin autoservicio mientras no haya pagos. Lo hace la plataforma. La organización ve su plan y *Hablar con ventas*. |

## 11. Plan de ejecución (una sola aprobación)
| Fase | Qué |
|---|---|
| 1 | M1: planes, suscripciones, lectura pública, suscripción de la organización existente. |
| 2 | Landing: navegación, precios, comparativa, FAQ, `/precios`. |
| 3 | M2 + registro en 3 pasos con plan + confirmación. |
| 4 | Organización (pestaña Plan, candados, límites) y plataforma (cambiar plan). |
| 5 | Pruebas SQL y de la app nuevas y actualizadas. |
| 6 | Validación integral y visual (caminos A, B y C; escritorio y celular). |
| 7 | Documentación: manual, este ADR, arquitectura y ERD. |

## 12. Criterios de terminado
1. Se consultan y comparan los 3 planes sin registrarse; cada uno con precio mensual, límites, qué incluye y su CTA.
2. *Comenzar gratis* en Standard o Business inicia el registro con ese plan, que se conserva en todos los pasos y se puede cambiar antes de terminar.
3. *Crear cuenta* sin plan exige elegirlo durante el registro.
4. Al terminar, el plan queda en la **suscripción de la organización** (nunca en el usuario); la primera Cuenta pertenece a la organización; el SUPER_ADMIN y ADMIN quedan asignados; la persona entra a Dark Kitchen.
5. Abandonar antes de terminar no deja organizaciones; retomar funciona.
6. Funciones y límites dependen del plan desde una sola fuente, aplicados por la base.
7. Estructura lista para pagos (estados, fechas, periodicidad, proveedor) sin implementarlos.
8. Todas las pruebas en verde; documentación actualizada.
