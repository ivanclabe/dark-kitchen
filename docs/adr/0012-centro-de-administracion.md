# ADR 0012 — Centro de administración de la organización, observabilidad y bitácora

## Estado
**Aceptada e implementada (2026-09-28).** Aprobada una sola vez con las recomendaciones D1–D8 y ejecutada completa (fases 1–9). La sección 24 resume la implementación, las diferencias con el plan y lo pendiente.

Continúa los ADR 0008 (organizaciones y RBAC), 0009 (funciones), 0010 (planes) y 0011 (endurecimiento). Se mantiene Organización → Cuentas → Usuarios → Roles → Permisos, con aislamiento por `organization_id`/`kitchen_id` (Cuenta), RBAC y RLS.

> **Nota:** los cambios de los ADR 0011 y 0012 están aplicados en la base y en el código, pero **sin commit**. No se hacen commits salvo que se pidan.

---

## 1. Arquitectura actual (auditoría del 2026-09-28)

### 1.1 Navegación
| Lugar | Qué hay | Problema |
|---|---|---|
| **Rail de la Cuenta** (`/k/:cuenta`) | Dashboard, Cocina, Catálogo, Abastecimiento, Clientes, Reportes. | Correcto: es operación. |
| **Menú de usuario** (dentro de una Cuenta) | Mi perfil, Cambiar de rol, Configuración (de la Cuenta), Cambiar de cuenta, **Usuarios y permisos**, **Configuración de la organización**, Plataforma. | La administración de la organización vive **dentro de una Cuenta** (`/k/:cuenta/users`, `/k/:cuenta/organizacion`): para cambiar algo de toda la organización hay que entrar a una Cocina. Se mezclan los contextos. |
| **Tus cuentas** (`/cuentas`) | Selector de Cuentas para todos, agrupado por organización; *Nueva cuenta* para el SUPER_ADMIN. | Sirve para elegir, no para administrar. |
| **Configuración de la organización** (`/k/:cuenta/organizacion`) | Pestañas General, Plan, Cuentas, Funciones, Menús maestros, SUPER_ADMIN. | Ya es "de organización" pero cuelga de una Cuenta. |
| **Plataforma** (`/admin`) | Cuentas de todas las organizaciones, planes por organización. | Es de la plataforma (otro nivel); se mantiene. |

### 1.2 Configuraciones existentes
Inventario completo en la sección 3.

### 1.3 Seguridad y datos
- **Base:** 55 tablas `dk_*`, todas con RLS (ninguna sin RLS). Datos de operación con `kitchen_id` y la Cuenta activa validada (`dk_current_kitchen_id`, `dk_can`). Datos de organización con `organization_id` y `dk_has_org_permission`.
- **RBAC:** 57 permisos (47 de Cuenta, 10 de organización). Roles de organización: SUPER_ADMIN o Miembro. Roles de Cuenta: plantillas y roles propios, varios por Cuenta, con rol activo.
- **Funciones efectivas:** una sola fuente en la base (`dk_my_features`, `dk_can_use_feature`): plan ∧ organización ∧ Cuenta ∧ permiso. En la app, `useAppContext().canUseFeature`.
- **Plan:** `dk_subscriptions`, una por organización; `dk_plans` y `dk_plan_features` son públicos. Sin pagos.
- **Contexto en la app:** `useAppContext` (usuario, organización, Cuenta, rol de organización, roles de Cuenta, rol activo, permisos, funciones). La base valida Cuenta y rol en cada petición (`x-dk-kitchen-id`, `x-dk-role-id`). Hoy **no existe** un contexto de "organización sin Cuenta".

### 1.4 Bitácora actual: `dk_audit_log`
| Aspecto | Hoy |
|---|---|
| Captura | Disparador genérico `dk_audit_row` en 23 tablas: fila completa antes y después, quién (`changed_by`), Cuenta y organización. **Confiable**: está en la base, no en la app. |
| Volumen | 516 filas: `dk_orders` 180, `dk_users` 141 (casi todas por cambiar la "última cuenta" al entrar), `dk_role_permissions` 118… |
| Lectura | Solo filas **de la Cuenta activa** con `audit.view`. **Nadie puede ver las filas de organización** (`kitchen_id` nulo: organización, miembros, roles, funciones, suscripción). **No hay pantalla**. |
| Integridad | Sin políticas de escritura, así que RLS impide cambiar filas. Pero `authenticated`/`anon` tienen `INSERT/UPDATE/DELETE/TRUNCATE` concedidos (lo que Supabase da por defecto), y no hay ninguna guardia que la haga de solo agregar (append-only). |
| Semántica | Solo "tabla + INSERT/UPDATE/DELETE". No hay tipo de evento ("cuenta creada"), resumen, resultado ni fuente. |
| Faltan | Inicios de sesión, errores (IA, integraciones), fallos. |

### 1.5 Observabilidad: qué datos existen de verdad
| Dato | Fuente | ¿Sirve hoy? |
|---|---|---|
| Pedidos por estado, ventas, canal (`channel`: incluye los de integraciones), atrasos | `dk_orders`, SLA de la Cuenta | Sí |
| Tiempos entre estados | `dk_order_status_history` (77 filas) | Sí |
| Movimientos de inventario (compras, consumo, mermas, ajustes), bajo mínimo | `dk_inventory_movements`, `dk_ingredient_stock` | Sí |
| Compras y facturas de proveedores, cobros a clientes | `dk_purchases`, `dk_attachments`, pagos de pedidos | Sí |
| Análisis de IA ok/error y cuota | `dk_ai_insights`, `dk_ai_run_allowed` | Sí |
| Estado de Cuentas y funciones | `dk_kitchens.active`, `dk_my_features` y matriz | Sí |
| Cambios de configuración | `dk_audit_log` | Sí |
| Último inicio de sesión | `auth.users.last_sign_in_at` (solo con `SECURITY DEFINER`) | Sí |
| "Usuarios activos" en tiempo real, sesiones | — | **No existe**: no hay latido de actividad |
| Errores de integraciones (n8n) y de la app | — | **No existe**: las llamadas fallidas no dejan rastro |
| Errores de la base (permiso denegado) | — | **No capturable**: el rechazo deshace la transacción, incluido cualquier registro |

**Índices faltantes para ventanas de tiempo por Cuenta:** `dk_orders`, `dk_order_status_history` y `dk_inventory_movements` solo tienen índice por `kitchen_id`, sin `created_at`.

### 1.6 Hallazgos
| # | Hallazgo | Severidad |
|---|---|---|
| A1 | La administración de la organización está dentro de una Cuenta. | Alta (producto) |
| A2 | La bitácora existe pero es invisible a nivel organización y no es de solo agregar (append-only). | Alta (auditoría) |
| A3 | `dk_my_subscription` la puede leer **cualquier miembro** (usa `organization.view`): plan, uso y límites visibles para roles operativos. | Media (datos de facturación) |
| A4 | Ruido en la bitácora: cada entrada a una Cuenta escribe una fila completa de `dk_users`, y las actualizaciones guardan la fila entera dos veces. | Media (volumen y costo) |
| A5 | "Ventas de hoy" y las métricas por día usan la fecha UTC: los pedidos de 7 p. m. a 12 a. m. (hora de Bogotá) caen en el día siguiente. Hay 2 de 19 pedidos afectados. | Media (métricas erróneas) |
| A6 | No hay índices por tiempo para consultas de observabilidad. | Media (escala) |
| A7 | Sin registro de inicios de sesión ni de errores de IA en la bitácora. | Media |

---

## 2. Arquitectura propuesta
```
/o/:organización   CENTRO DE ADMINISTRACIÓN (solo quien tiene permisos de organización)
  ├─ Resumen            ← observabilidad: vista general de la organización
  ├─ Cuentas            ← "Todas mis cuentas" administrable: buscar, filtrar, estado, crear, editar, entrar, configurar
  ├─ Observabilidad     ← Operación (por Cuenta) | Bitácora (quién hizo qué)
  ├─ Equipos            ← Usuarios | Roles (y permisos efectivos)
  ├─ Facturación        ← plan, estado, límites, uso, facturas (estructura), método de pago (futuro)
  ├─ Configuración      ← General | Funciones (IA y voz) | Integraciones
  └─ Menús maestros

/k/:cuenta         OPERACIÓN DE UNA CUENTA (sin cambios en el rail)
  ├─ Dashboard · Cocina · Catálogo · Abastecimiento · Clientes · Reportes
  └─ Menú de usuario: Mi perfil · Rol · Cambiar de cuenta · Configuración de la cuenta
                      · Equipo de la cuenta (ADMIN) · Administración de la organización (SUPER_ADMIN)

/cuentas           Selector "Tus cuentas" (todos) + botón "Administrar organización" (SUPER_ADMIN)
/admin             Plataforma (sin cambios)
```
- **Dos contextos que no se mezclan.** En `/o/…` no hay Cuenta activa: no se envía `x-dk-kitchen-id` y la caché se separa por organización. Todo se pide con el `organization_id` de la URL y **la base lo valida** con `dk_has_org_permission` en cada RPC. En `/k/…` sigue todo igual.
- **Contexto de organización** (`useOrgContext`): usuario, organización activa (resuelta contra `dk_my_context`: un slug ajeno lleva a "Tus cuentas"), permisos de organización, plan y funciones de la organización.
- **Sin duplicar pantallas:** se **mueven** los componentes actuales (`GeneralForm`, `AccountsPanel`, `FeaturesPanel`, `PlanPanel`, `UsersPanel`, `RolesPanel`, `MasterMenusPanel`) al centro. Las rutas viejas redirigen.

---

## 3. Inventario de configuraciones y clasificación

| Configuración | Dónde está hoy | Nivel correcto | Motivo | Ubicación nueva |
|---|---|---|---|---|
| Datos del negocio (nombre, sector, categoría, legales, contacto) | Org → General | **Organización** | Es el negocio | Centro → Configuración → General |
| Moneda y zona horaria por defecto de Cuentas nuevas | Org → General | **Organización** | Afecta a Cuentas futuras | Centro → Configuración → General |
| Plan, suscripción, límites | Org → Plan | **Organización** | El plan es de la organización | Centro → Facturación |
| Crear, editar (nombre, icono), activar/desactivar Cuentas | Org → Cuentas | **Organización** | Afecta al conjunto | Centro → Cuentas |
| Qué funciones ofrece la organización (IA, voz) | Org → Funciones | **Organización** | Techo para todas las Cuentas | Centro → Configuración → Funciones |
| Activación de funciones por Cuenta | Org → Funciones (matriz) y Cuenta → Funciones | **Cuenta** (dato), con dos vistas | El SUPER_ADMIN la ve para todas; el ADMIN, para la suya. Es el mismo dato, sin duplicar | Centro → Funciones (matriz) + Cuenta → Configuración → Funciones |
| Parámetros de IA (umbrales, frecuencia) | Cuenta → Funciones | **Cuenta** | Dependen de la operación del local | Se queda |
| Cuota de IA | Plan (`limits`) | **Plan/Plataforma** | Comercial | Visible en Facturación (solo lectura) |
| Usuarios y asignaciones | `/k/…/users` | **Organización** (quién trabaja en el negocio) | Una persona trabaja en varias Cuentas | Centro → Equipos; el ADMIN de Cuenta ve "Equipo de la cuenta" (mismo componente, alcance de su Cuenta) |
| Roles propios y permisos | `/k/…/users` → Roles | **Organización** | Sirven en todas las Cuentas | Centro → Equipos → Roles |
| Menús maestros | Org → Menús maestros | **Organización** | Se comparten entre Cuentas | Centro → Menús maestros |
| SUPER_ADMIN (creador) | Org → SUPER_ADMIN | **Organización** | Informativo | Centro → Equipos (etiqueta) y Resumen |
| Datos de la Cuenta (nombre, identificador, legales, zona horaria, icono) | Cuenta → General | **Cuenta** | Propios del local | Se queda (nombre e icono también desde Centro → Cuentas → Editar) |
| Horario de atención y excepciones | Cocina → Configuración | **Cuenta** | Operación del local | Se queda |
| Alertas de tiempo (SLA) | Cocina → Configuración | **Cuenta** | Operación del local | Se queda |
| Domiciliarios | Cocina → ⋯ | **Cuenta** | Operación del local | Se queda |
| Integraciones: ID de la Cuenta (`x-dk-kitchen-id`) | Cuenta → General | **Cuenta** (dato); consulta central | Cada integración apunta a una Cuenta | Se queda + Centro → Configuración → Integraciones (lista de todas las Cuentas, canal y última actividad) |
| Preferencias del equipo (sonido, respuesta hablada, tamaño, vista) | Dispositivo (`localStorage`) | **Dispositivo/Usuario** | Personales | Se quedan |
| Perfil y avatar | Mi perfil | **Usuario** | Personales | Se queda |
| Políticas globales | — | — | **No existen hoy**; no se inventan | — |

---

## 4. Diseño de Observabilidad
Responde **"¿cómo está funcionando mi organización?"**. Solo métricas que se calculan con datos reales (sección 1.5). Todo por RPC con **ventanas acotadas** (hoy, 7 días) y los índices nuevos, **en la zona horaria de cada Cuenta**.

**Resumen (organización):**
- **Tarjetas:** Cuentas activas/inactivas; usuarios activos, es decir, con inicio de sesión o actividad en 7 días; pedidos hoy; ventas hoy; pedidos atrasados ahora.
- **Tabla por Cuenta:** icono, estado, pedidos hoy y 7 días, ventas, atrasados ahora, en curso, bajo mínimo, análisis de IA con error en 24 h, última actividad.
- **Alertas reales:**
  - Cuenta activa sin actividad en 7 días.
  - Pedidos atrasados.
  - Insumos bajo mínimo.
  - Errores de IA en 24 h.
  - Cuota de IA cerca del tope.
  - Prueba por vencer o vencida.
  - Límite del plan alcanzado.
- **Actividad reciente:** los 10 últimos eventos importantes de la bitácora.

**Por Cuenta** (se elige una):
| Bloque | Datos |
|---|---|
| Pedidos | Creados, entregados y cancelados (hoy y 7 días); en curso y atrasados ahora; tiempo medio de confirmado a listo; por canal (manual o integración) |
| Inventario | Movimientos de 7 días por tipo; bajo mínimo ahora |
| Compras y cobros | Compras confirmadas y borradores; cobros a clientes (7 días) |
| IA | Análisis ok/error (24 h), cuota restante, funciones usables |
| Equipo | Miembros, activos en 7 días, último inicio de sesión |
| Estado de módulos | Cuenta activa, funciones (plan, organización, Cuenta), horario configurado, SLA configurado |
| Cambios | Últimos eventos de configuración de la Cuenta (enlace a Bitácora filtrada) |

**Qué no existe y qué habría que capturar** (queda documentado, no se inventa):
- **Usuarios conectados ahora:** requiere un latido (`dk_user_heartbeats`).
- **Errores de integraciones:** requiere que la integración registre sus fallos (`dk_integration_runs`).
- **Errores de la app:** requiere reporte desde el navegador.
- **Rechazos de la base:** no son registrables en la misma transacción.

---

## 5. Diseño de la bitácora (Event Log / Auditoría)
Responde **"¿quién hizo qué, cuándo, dónde y sobre qué?"**. **Se extiende `dk_audit_log`** (no se crea otra tabla):

| Columna | Nuevo | Uso |
|---|---|---|
| `created_at`, `changed_by` (usuario), `organization_id`, `kitchen_id` (Cuenta), `table_name`, `record_id`/`record_key` | existentes | Cuándo, quién, dónde, recurso |
| `action` | existente | INSERT/UPDATE/DELETE o `EVENT` |
| `event_type` | **sí** | `account.created`, `account.updated`, `account.deactivated`, `user.added`, `user.deactivated`, `user.removed`, `role.assigned`, `role.removed`, `role.created`, `role.permissions_changed`, `feature.org_changed`, `feature.account_changed`, `ai.settings_changed`, `plan.changed`, `organization.updated`, `master_menu.*`, `order.*`, `auth.signed_in`, `ai.run_failed`… (genérico si no aplica) |
| `category` | **sí** | `accounts`, `team`, `roles`, `features`, `ai`, `billing`, `settings`, `catalog`, `operations`, `auth`, `integrations` |
| `summary` | **sí** | Texto legible generado en la base ("Asignó ADMIN a Ana en Centro") |
| `result` | **sí** | `success` \| `failure` |
| `source` | **sí** | `db` (disparadores), `edge` (Edge Function), `app` (inicio de sesión) |
| `context` | **sí** | Datos puntuales (rol, función, plan anterior y nuevo) |

- **Clasificación en la base:** un disparador `BEFORE INSERT` en `dk_audit_log` completa `event_type`, `category` y `summary` según la tabla, la acción y los cambios. Nunca falla: si no reconoce el caso, deja uno genérico.
- **Solo cambios en las actualizaciones:** `old_data`/`new_data` guardan únicamente las columnas que cambiaron (A4), y se omite la actualización que solo cambia la "última cuenta" del usuario.
- **Eventos que no son filas:**
  - `ai.run_failed`: un disparador en `dk_ai_insights` (estado `error`); confiable, porque vive en la base.
  - `auth.signed_in`: la app llama `dk_log_sign_in()` al iniciar sesión. Solo registra a quien llama, con un tope de 1 por minuto. Auth no permite disparadores propios (D6).
- **Solo agregar (append-only):** se revocan `INSERT/UPDATE/DELETE/TRUNCATE` a `anon`/`authenticated`. Una guardia impide `UPDATE`/`DELETE` salvo desde la función de retención.
- **Lectura:**
  - Cuenta: igual que hoy, `audit.view` en la Cuenta activa.
  - Organización: permiso nuevo `observability.view`, que da todas las filas de su organización, incluidas las de nivel organización.
  - Por RPC `dk_org_events(org, filtros, cursor)`: paginación por cursor (`created_at`, `id`), 50 por página, con filtros por Cuenta, categoría, persona, fechas y texto del resumen.
- **Retención (D2):** 400 días. `dk_purge_audit_log()` se ejecuta cada noche con `pg_cron`.

## 6. Diseño de Equipos
Centro → Equipos, con pestañas **Usuarios** y **Roles**; se reutilizan `UsersPanel`, `UserDrawer` y `RolesPanel`.
- **Columnas nuevas:** estado, rol de organización, roles por Cuenta, Cuentas asignadas, **fecha de incorporación** (`dk_organization_members.created_at`) y **última actividad** (el máximo entre el último inicio de sesión y el último evento en la bitácora de la organización).
- **Filtros y búsqueda:** por Cuenta, rol y estado; búsqueda por nombre o correo.
- **Acciones según permisos:** crear/invitar (enlace de activación), asignar o quitar roles y Cuentas, activar/desactivar, ver permisos efectivos.
- **Las mismas RPC y reglas de siempre:** `dk_set_member_roles`, las guardias contra el escalamiento, el SUPER_ADMIN intransferible y los topes del plan. **Equipos no crea ningún atajo.**
- **ADMIN de Cuenta:** ve *Equipo de la cuenta* dentro de su Cuenta, con el mismo componente limitado a su Cuenta, como hoy.

## 7. Diseño de Facturación
Centro → Facturación. Lo exige un permiso nuevo de organización, `billing.view`.
- **Hoy, con datos reales:**
  - plan, precio, periodicidad, estado;
  - inicio, fin de prueba y renovación (`current_period_end`);
  - límites y uso (Cuentas, usuarios, análisis de IA en 24 h);
  - funciones incluidas.
- **Estructura preparada:**
  - Tabla **`dk_invoices`**, vacía hasta que haya pagos: número, período, monto, moneda, estado, fechas, IDs del proveedor y PDF.
  - La pantalla muestra "Aún no hay facturas: los pagos no están activos". **No se inventan facturas.**
  - Métodos de pago: no se guardan en la base; vivirán en el proveedor (`provider_customer_id`).
  - Cambio de plan: el botón es contactar a ventas (la plataforma cambia el plan).
- **Seguridad (A3):** `dk_my_subscription` y la política de `dk_subscriptions` pasan a exigir `billing.view`. Los roles operativos siguen viendo qué funciones pueden usar (`dk_my_features`), no el plan ni la facturación.

## 8. Plan y suscripción
Sin cambios de modelo (ADR 0010): Usuario → pertenece a → Organización → tiene → Suscripción → usa → Plan.
- Una persona ya puede **ser miembro** de varias organizaciones, cada una con su suscripción.
- Ser **dueña** de más de una sigue limitado a una (ADR 0008); el modelo no lo impide.

## 9. Diseño de funciones
Se mantiene la fuente única: `usable = plan ∧ organización ∧ Cuenta ∧ permiso`.
- En la base: `dk_feature_available`, `dk_my_features`, `dk_org_feature_matrix`.
- En la app: `canUseFeature`.
- No se agregan condiciones sueltas. La matriz del centro es la misma de hoy, con candados por plan.

## 10. Diseño de IA
- **Organización:** disponibilidad (en Funciones).
- **Cuenta:** activación y parámetros (en la Cuenta).
- **Plan:** cuota.
- **Plataforma:** clave del modelo.

En Observabilidad: análisis ok/error y cuota por Cuenta. En la bitácora: `ai.settings_changed` y `ai.run_failed`.

## 11. Modelo RBAC
| Nivel | Roles | Permisos nuevos |
|---|---|---|
| Organización | SUPER_ADMIN (creador) · Miembro | `observability.view`, `billing.view` (solo SUPER_ADMIN y plataforma; el catálogo queda en 59 permisos: 47 de Cuenta y 12 de organización) |
| Cuenta | ADMIN, GERENTE, CAJA, COCINA, INVENTARIO, DOMICILIARIO + propios | — (`audit.view` de Cuenta se mantiene) |

Ejemplo: Ana es SUPER_ADMIN de la organización, ADMIN en la Cuenta A, COCINA en la B y sin acceso a la C.
- En el centro ve todo por ser SUPER_ADMIN.
- Al entrar a la B trabaja con el rol que elija entre sus roles (incluido el de acceso total por ser SUPER_ADMIN).
- Un Miembro no ve el centro.

## 12. Modelo RLS
| Tabla | Política nueva o cambio |
|---|---|
| `dk_audit_log` | + SELECT por organización con `observability.view`. Sin escrituras desde la API (revocadas). Guardia de solo agregar (append-only). |
| `dk_subscriptions` | SELECT: `organization.view` → **`billing.view`**. |
| `dk_invoices` (nueva) | SELECT con `billing.view` de su organización. Sin escrituras desde la API (las hará el proveedor de pagos o la plataforma). |
| Consultas de observabilidad | RPC `SECURITY DEFINER` que **primero** verifican `observability.view` en la organización y que la Cuenta pedida pertenece a ella. El ID de otra organización devuelve error. |
| Equipos | Las RPC de siempre (`dk_org_users` amplía columnas con el mismo permiso `users.view`). |

## 13. Modelo de datos
| Tabla | Acción | Detalle |
|---|---|---|
| `dk_audit_log` | **Modifica** | + `event_type`, `category`, `summary`, `result`, `source`, `context`. Índices `(organization_id, category, created_at desc)` y `(changed_by, created_at desc)`. Reclasifica las 516 filas existentes. |
| `dk_invoices` | **Crea** | `id`, `organization_id` (FK), `subscription_id` (FK), `number`, `period_start/end`, `amount`, `currency`, `status` (`draft`, `open`, `paid`, `void`, `uncollectible`), `issued_at`, `paid_at`, `provider`, `provider_invoice_id`, `pdf_url`, `created_at`. Índice `(organization_id, issued_at desc)`. Retención: indefinida (contable). |
| `dk_permissions` | **Modifica (datos)** | + `observability.view`, `billing.view`. |
| `dk_orders`, `dk_order_status_history`, `dk_inventory_movements` | **Índices** | `(kitchen_id, created_at desc)` (en historial, su columna de fecha). |
| `dk_dashboard_summary` | **Corrige** | Días y semanas en la zona horaria de la Cuenta (A5). |
| `dk_organizations`, `dk_subscriptions`, `dk_plans`, `dk_features`… | Se mantienen | — |
| Tablas nuevas de latido o integraciones | **No se crean** | Documentadas como futuras (sección 4). |

## 14. Migraciones
| Migración | Contenido |
|---|---|
| `20260929100000_dk_audit_events` | Columnas y clasificación, cambios compactos, filtro de ruido, reclasificación de lo existente, solo agregar (append-only) + revocaciones, índices, política de organización, `dk_org_events`, eventos `ai.run_failed` y `auth.signed_in`, retención con `pg_cron` (D2). |
| `20260929110000_dk_org_admin_billing` | Permisos `observability.view` y `billing.view`, `dk_invoices`, `dk_subscriptions` y `dk_my_subscription` con `billing.view`, `dk_org_users` con incorporación y última actividad. |
| `20260929120000_dk_observability` | Índices por tiempo, `dk_org_observability(org)`, `dk_account_observability(org, cuenta)`, corrección de zona horaria en `dk_dashboard_summary` (D5). |

Cada una se ensaya antes con `run.py --with …` contra todas las suites; después `db push`, tipos y asesores.

## 15. Cambios de frontend
| Área | Cambio |
|---|---|
| `src/modules/orgAdmin/` (nuevo) | `OrgScope` (resuelve `/o/:org` contra la base, sin Cuenta activa), `OrgAdminLayout` (barra lateral propia con el encabezado "Administración · Grupo XYZ" y "Ir a una cuenta"), páginas Resumen, Cuentas, Observabilidad (Operación \| Bitácora), Equipos, Facturación, Configuración (General \| Funciones \| Integraciones) y Menús maestros. |
| Reutilización | `GeneralForm`, `AccountsPanel` (+ búsqueda, filtros por estado y plan, *Configurar* → configuración de esa Cuenta), `FeaturesPanel`, `PlanPanel`, `UsersPanel`/`RolesPanel`/`UserDrawer`, `MasterMenusPanel`, `DataTable`, `Tabs`, `Badge`, `EmptyState`, gráficos que ya usa Reportes. |
| Bitácora | Línea de tiempo con filtros y "cargar más" (cursor). Cada evento muestra quién, qué, dónde, cuándo y el resultado, y se expande para ver los cambios. |
| Contexto | `useOrgContext` (organización, permisos, plan). La caché de React Query se separa por organización en `/o/…`. |
| Cuenta | Menú de usuario: *Administración de la organización* (SUPER_ADMIN) y *Equipo de la cuenta* (con `team.view`/`team.manage`), en lugar de "Usuarios y permisos" y "Configuración de la organización". |
| Redirecciones | `/k/:c/organizacion` → `/o/:org/configuracion`; `/k/:c/users` → `/o/:org/equipos` para el SUPER_ADMIN, o *Equipo de la cuenta* para el ADMIN. |
| Tus cuentas | Botón *Administrar organización* (SUPER_ADMIN). |
| Inicio de sesión | Llama a `dk_log_sign_in()` una vez por sesión. |
| Ventas | "Ventas de hoy" se refresca al crear, confirmar o cancelar un pedido (además de cada minuto). |

## 16. Cambios de backend
- Las RPC de las secciones 5, 7 y 12: `dk_org_events`, `dk_org_observability`, `dk_account_observability`, `dk_log_sign_in` y `dk_org_users` ampliada.
- Edge Function de IA: sin cambios (los errores ya quedan en `dk_ai_insights`, y el disparador los lleva a la bitácora).
- `pg_cron` para la retención (D2).

## 17. Cambios de navegación
Detallados en las secciones 2 y 15. El rail de operación no cambia. Lo administrativo sale de la Cuenta. En el celular, la barra lateral del centro se vuelve un menú, igual que el rail actual.

## 18. Riesgos
| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Un error en la clasificación rompe escrituras (el disparador está en la ruta de 23 tablas). | Clasificación con captura de excepciones: nunca lanza y, ante cualquier fallo, queda un evento genérico. Las suites existentes cubren todas las escrituras. |
| R2 | Enlaces guardados a `/k/…/organizacion` o `/users`. | Redirecciones. |
| R3 | Restringir la suscripción rompe pantallas de roles operativos. | Solo `PlanPanel` y el aviso de tope de *Nueva cuenta* la leen, y son del SUPER_ADMIN. Las funciones usan `dk_my_features`. Hay prueba. |
| R4 | Crecimiento de la bitácora. | Cambios compactos, filtro de ruido, índices y retención de 400 días. Estimación: con 300 pedidos/día por Cuenta, unas 2.500 filas/día (~0,4 KB compactas) ≈ 350 MB/año por Cuenta **antes** de la retención. No hace falta particionar a esta escala; se revisa por encima de unos 50 millones de filas. |
| R5 | Consultas pesadas de observabilidad. | Ventanas acotadas + índices + `EXPLAIN` en la validación. Nada recorre la bitácora completa: cursor y `limit`. |
| R6 | Contexto sin Cuenta en `/o/…` envía encabezados de una Cuenta anterior. | `OrgScope` limpia la Cuenta y el rol activos antes de pedir datos (el mismo patrón de `KitchenScope`), con prueba. |
| R7 | `pg_cron` es una extensión nueva. | Si no se aprueba (D2), la retención queda como función para ejecutar a mano. |

## 19. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Dirección del centro | `/o/:organización` (p. ej. `/o/dark-kitchen/cuentas`). |
| **D2** | Retención de la bitácora | 400 días, purga nocturna con `pg_cron` (se habilita la extensión en tu proyecto). |
| **D3** | Tamaño de la bitácora | Guardar solo las columnas que cambian y omitir el cambio de "última cuenta". Los pedidos se siguen auditando. |
| **D4** | Permisos nuevos | `observability.view` y `billing.view` (de organización, solo SUPER_ADMIN y plataforma). |
| **D5** | Zona horaria de ventas y métricas (A5) | Corregirla ahora; afecta a "Ventas de hoy", semana y mes, y a toda la observabilidad. |
| **D6** | Inicios de sesión | Registrados por la app al iniciar sesión (Auth no admite disparadores propios), con tope de frecuencia. |
| **D7** | Facturas y pagos | Tabla `dk_invoices` vacía y estructura lista. Los métodos de pago no se guardan (vivirán en el proveedor). |
| **D8** | Equipo para el ADMIN de una Cuenta | *Equipo de la cuenta* dentro de la Cuenta (mismo componente, alcance de su Cuenta). |

## 20. Compatibilidad
- La operación de las Cuentas y el rail no cambian. Las pantallas de organización se mueven (mismos componentes), con redirecciones.
- La bitácora conserva sus 516 filas (se reclasifican). La lectura por Cuenta sigue igual.
- Las funciones, los planes, los topes y la cuota no cambian de comportamiento.
- Un miembro que hoy lee `dk_my_subscription` deja de poder hacerlo (A3, intencional).

## 21. Estrategia de pruebas
**SQL** (suites nuevas y actualizadas, siempre con rollback):
- **`audit_events`:**
  - clasificación de cada tipo de evento;
  - cambios compactos y filtro de ruido;
  - solo agregar: `UPDATE`/`DELETE`/`TRUNCATE` bloqueados, incluso para el dueño de la base fuera de la retención;
  - lectura por organización con `observability.view`: otra organización ve 0;
  - paginación por cursor y filtros;
  - `ai.run_failed` y `auth.signed_in` con su tope;
  - retención.
- **`observability`:**
  - métricas contra datos preparados (incluido un pedido a las 11 p. m. hora local);
  - aislamiento: una Cuenta de otra organización o un ID manipulado dan error;
  - un Miembro no accede.
- **`billing`:** `dk_invoices` y `dk_subscriptions` solo con `billing.view`; un Miembro y otra organización ven 0.
- **Actualizadas:** `permission_catalog` (59), `plans` (suscripción con `billing.view`) y las que lean la bitácora.

**App (Testing Library):**
- `OrgScope`: un slug ajeno redirige y no queda Cuenta activa.
- Guardas del centro según permisos.
- Bitácora: filtros y "cargar más".
- Equipos: filtros y columnas nuevas.
- Resumen: alertas a partir de los datos.
- Redirecciones de las rutas viejas.

**Visual:** arnés temporal para Resumen, Cuentas, Observabilidad, Bitácora, Equipos, Facturación y Configuración, en escritorio y celular. Landing y rutas públicas en el navegador.

**Regresión:** todas las suites SQL (348), las de la app (140), `tsc`, `oxlint` sin avisos nuevos, `build` y asesores.

## 22. Criterios de aceptación
1. Existe `/o/:org` con Resumen, Cuentas, Observabilidad (Operación y Bitácora), Equipos, Facturación, Configuración (General, Funciones, Integraciones) y Menús maestros. Nada administrativo de la organización queda dentro de una Cuenta, y las rutas viejas redirigen.
2. Cuentas: buscar, filtrar, estado, icono, crear, editar, entrar y configurar.
3. Observabilidad: solo métricas reales, por organización y por Cuenta, en la zona horaria de cada Cuenta, sin recorrer tablas completas (verificado con `EXPLAIN`). Lo que no existe está documentado.
4. Bitácora: quién, qué, cuándo, dónde, recurso, resultado y fuente. Solo agregar, con retención, visible solo para quien corresponde y con otra organización en 0.
5. Equipos: vista central con columnas, filtros y acciones según RBAC, sin atajos a las reglas.
6. Facturación: datos reales del plan, estructura de facturas vacía, solo con `billing.view`.
7. La regla de funciones sigue en una sola fuente; ninguna condición suelta nueva.
8. Contexto validado por la base en `/o/…` y `/k/…`; ningún dato de otra organización por manipular IDs (probado).
9. "Ventas de hoy" y las métricas usan la zona de la Cuenta (prueba de las 11 p. m.).
10. Todas las pruebas en verde; manual, ADR, arquitectura y ERD actualizados.

## 23. Orden completo de ejecución
| Fase | Qué | Depende de |
|---|---|---|
| 1 | M1 bitácora (+ suite `audit_events`) | — |
| 2 | M2 permisos, facturación, equipos (+ suite `billing`) | 1 |
| 3 | M3 observabilidad y zona horaria (+ suite `observability`) | 1, 2 |
| 4 | `OrgScope`, `useOrgContext`, `OrgAdminLayout`, rutas y redirecciones, menú de usuario, *Tus cuentas* | 2 |
| 5 | Páginas del centro: Cuentas, Configuración, Menús maestros, Equipos, Facturación (reutilizando componentes) | 4 |
| 6 | Resumen, Observabilidad y Bitácora | 3, 4 |
| 7 | Inicio de sesión en la bitácora; refresco de "Ventas de hoy" | 1 |
| 8 | Pruebas de la app, validación integral y visual, correcciones | 1–7 |
| 9 | Documentación (manual, este ADR, arquitectura, ERD) | 8 |

---

## 24. Implementación (2026-09-28)

### 24.1 Estado por fase
| Fase | Estado | Resultado |
|---|---|---|
| 1 | ✅ | `20260929100000_dk_audit_events` aplicada. Suite `audit_events` 29/29. |
| 2 | ✅ | `20260929110000_dk_org_admin_billing` aplicada. Suite `billing` 10/10. |
| 3 | ✅ | `20260929120000_dk_observability` aplicada. Suite `observability` 13/13 (incluido el pedido de las 11:30 p. m. hora local). |
| 4 | ✅ | `OrgScope`, `OrgAdminLayout`, rutas `/o/:orgSlug/*`, redirección de `/k/:c/organizacion`, menú de usuario y *Administrar organización* en *Tus cuentas*. |
| 5 | ✅ | Cuentas, Configuración (General, Funciones, Integraciones), Menús maestros, Equipos y Facturación. |
| 6 | ✅ | Resumen, Observabilidad (Operación) y Bitácora. |
| 7 | ✅ | `dk_log_sign_in()` en el evento `SIGNED_IN`; "Ventas de hoy" se invalida tras cualquier mutación. |
| 8 | ✅ | SQL 400/400 en la base real; app 149/149 (23 archivos); `tsc` sin errores; `oxlint` 0 errores y los 17 avisos previos; `build` correcto; asesores sin hallazgos nuevos de riesgo; `EXPLAIN` con índices en todas las ventanas; verificación visual en 1024 px y 375 px. |
| 9 | ✅ | Manual 3.4 (capítulo 11 nuevo, 3, 9, 10, FAQ y glosario) y PDF; este ADR; `00-architecture.md`; `01-database-erd.md`. |

### 24.2 Diferencias con el plan
- **Contexto de organización:** se llama `useOrgAdmin()` (`src/shared/org/orgContext.ts`), no `useOrgContext`. Expone `organization`, `can(perm)`, `path(to)`, `accounts` e `isPlatformAdmin`. `canOpenAdminCenter` exige al menos un permiso de administración: `organization.view` solo no basta.
- **Código nuevo en `/o/…`:** las consultas usan claves `['org', orgId, …]` sin Cuenta activa. `OrgScope` limpia la Cuenta y el rol activos al renderizar, antes de cualquier consulta (R6).
- **`/k/:c/users`:** no redirige por ruta. La pantalla *Equipo de la cuenta* redirige a `/o/:org/equipos` si la persona tiene `users.view` de organización. Así el ADMIN de Cuenta conserva su vista (D8).
- **Equipos:** se reutiliza `TeamView`, extraído de `UsersAndPermissionsPage`, con filtros de estado y rol, y la columna Actividad (última actividad e incorporación).
- **Resumen:** incluye `activeUsers7d` (inicio de sesión o evento en 7 días). La "última actividad" de una persona solo se devuelve a quien tiene `users.view`.
- **Corrección de zona horaria (D5):** además de `dk_dashboard_summary`, se corrigieron los 6 `dk_report_*`, que tenían el mismo error. Lo hace una reescritura mecánica con verificación: la migración falla si queda algún `created_at::date` o `current_date`.
- **Alertas "atrasados":** `dk_late_orders_count` usa las alertas de tiempo (SLA) de la Cuenta y el tiempo desde que el pedido entró a su estado actual.
- **Ajuste visual encontrado en la validación:** `tableWrapperClass` ahora es `relative`. El encabezado `sr-only` de las tablas estaba en posición absoluta sin ancestro posicionado y ensanchaba toda la página. Además, las acciones de *Cuentas* ahora pasan a otra línea.
- **Datos reales del usuario en las pruebas:** `master_menus` usa el código `CARNE-PRB-01` y `audit_events` usa el nombre dinámico de la Cuenta, para no chocar con datos creados por el usuario.

### 24.3 Seguridad verificada
- La bitácora es de solo agregar (append-only):
  - `anon`/`authenticated` sin `INSERT/UPDATE/DELETE/TRUNCATE`;
  - una guardia de fila y de sentencia bloquea `UPDATE`/`DELETE`/`TRUNCATE`, incluso para el dueño de la base, salvo con `dk.audit_retention = on` dentro de `dk_purge_audit_log`.
- `dk_log_event`, `dk_audit_classify` y `dk_purge_audit_log` no son invocables desde la API (confirmado por los asesores).
- Las RPC `dk_org_events`, `dk_org_observability` y `dk_account_observability`:
  - son `SECURITY DEFINER`, con `search_path` fijo;
  - exigen `observability.view` en la organización;
  - verifican que la Cuenta pertenece a esa organización.

  Con el ID de otra organización se obtiene error o 0 filas (probado).
- `dk_subscriptions`, `dk_my_subscription` y `dk_invoices` exigen `billing.view`: un Miembro ve 0 (probado).
- `dk_kitchen_tz` queda ejecutable por `authenticated` a propósito: la usan `dk_dashboard_summary` y los reportes, que son `SECURITY INVOKER`. Solo devuelve el nombre de una zona horaria dado un UUID.

### 24.4 Pendiente (fuera de alcance, documentado)
- **Qué no se mide todavía:** personas conectadas ahora (latido), errores de integraciones (`dk_integration_runs`), errores de la app (reporte desde el navegador) y rechazos de la base.
- **Pagos:** `dk_invoices` está vacía hasta que se conecte un proveedor, y los métodos de pago no se guardan.
- **Índice redundante:** `dk_orders_kitchen_idx (kitchen_id)` quedó redundante con `dk_orders_kitchen_created_idx`. Se puede eliminar más adelante; no afecta la corrección.

### 24.5 Acciones manuales
- **`pg_cron` quedó habilitado** con el trabajo `dk-purge-audit-log` (08:30 UTC diario, 400 días). Verifícalo en *Database → Cron*.
- **Siguen pendientes de ADR anteriores:**
  - protección de contraseñas filtradas (Auth);
  - SMTP propio;
  - Turnstile;
  - `VITE_SITE_URL` en el despliegue;
  - contacto real de ventas (hoy `ventas@darkkitchen.co`).
- Commits: pendientes, cuando se pidan.
