# ADR 0024: La Cuenta como único nivel visible (se retira la interfaz de Organización)

## Estado
**Aprobada (2026-10-02) con las recomendaciones D1–D7 e implementada** (fases 1–7; resultados en la sección 10). Falta la validación en el navegador con sesión.

Reglas: código y URL en inglés; textos en español; el manual no se toca; **no se borran tablas ni datos**; RBAC, membresías, RLS y tenant/subdominio se mantienen. El pedido dice «Cuanela»; la marca es **Quanela**.

---

## 1. Auditoría (2026-10-02)

### 1.1 El modelo de datos (se mantiene)
```
auth.users → dk_users ─┬─ dk_organization_members ─► dk_organizations   (tenant: código {código}.quanela.com, plan, roles propios, IA)
                       └─ dk_kitchen_members + dk_member_roles ─► dk_kitchens (= «Cuenta»: un local o marca)
```
- **Una organización puede tener varias cuentas.** Hoy Dark Kitchen tiene 2 y Julian Hamburguesas 1.
- **Los datos operativos son de la cuenta.** Pedidos, inventario, clientes, turnos, IA y bitácora llevan `kitchen_id`, y la RLS los filtra por la cuenta activa (`dk_current_kitchen_id`) y la membresía.
- **Lo compartido vive en la organización.** El plan y la facturación, los roles personalizados (definiciones), la configuración de IA (ADR 0018), los menús maestros y los datos legales del negocio.
- **Conclusión:** `Organization` **sigue siendo necesaria internamente** (tenant, plan, roles y IA). Lo que se retira es la **interfaz**, no la entidad.

### 1.2 La interfaz de Organización que se retira
| Hoy (`/o/{slug}/…`, ADR 0012) | Componentes | Alcance de sus datos |
|---|---|---|
| Resumen | `OrgOverviewPage`, `AlertList` | **Todas** las cuentas (comparativo) |
| Cuentas | `OrgAccountsPanel`, `AccountEditDrawer` | Todas las cuentas |
| Observabilidad y bitácora | `OrgObservabilityPage`, `EventLog` | Todas las cuentas, con filtro por cuenta |
| Equipos (usuarios y roles) | `TeamView` (compartido con «Equipo de la cuenta») | **Todos** los usuarios de la organización |
| Facturación | `PlanPanel`, facturas | Plan del negocio |
| IA y voz | `FeaturesPanel`, `OrgVoicePanel`, `OrgAiStatusPanel` | Matriz función × **todas las cuentas** |
| Configuración e integraciones | `OrgGeneralForm` | Datos del negocio; IDs de **todas** las cuentas |
| Menús maestros | `MasterMenusPanel` | Platos que se copian a **varias** cuentas |
| Marco | `OrgScope`, `OrgAdminLayout`, `OrgUserMenu`, `orgNavigation`, `orgRedirects` | — |

**Accesos a esa interfaz:**
- en el menú de usuario, «Administración de la organización» y «Cambiar de organización»;
- en «Tus cuentas», agrupación por organización y «Administrar organización»;
- desde «Equipo de la cuenta», que redirige al centro si hay permiso de organización;
- en `KitchenEntryRedirect`, que lleva al centro a quien no tiene cuentas;
- en `FeaturesSettingsPage`;
- en los textos del registro y del login («Tu organización…»).

### 1.3 Riesgos de aislamiento hallados
| Dónde | Problema |
|---|---|
| `dk_org_users` | Con `team.view` en **varias** cuentas de la organización, devuelve los usuarios de **todas** esas cuentas, aunque estés trabajando en una |
| Bitácora, observabilidad, matriz de IA, lista de cuentas, IDs de integración | Muestran **todas** las cuentas de la organización |
| Filtros de cuenta en Equipos y Bitácora | Permiten elegir **otras** cuentas |

Los datos **operativos** ya están aislados por cuenta (la suite `multikitchen_isolation` lo verifica). Las fugas están solo en estas vistas de organización, que este cambio retira o acota.

## 2. La estructura visible nueva
```
Quanela  ·  {código}.quanela.com
   └── Cuenta actual (selector «Tus cuentas» si tienes varias)
         Rail: Dashboard · Pedidos · Cocina · Catálogo · Abastecimiento · Clientes · Personal · Reportes
               ──────────
               Usuarios ─────────► Usuarios · Roles y permisos
               Configuración ────► General · Facturación · IA y voz · Integraciones · Actividad
```
Todo pasa a vivir **dentro de `/k/{cuenta}/…`**, con un único contexto: la cuenta activa.

| Antes (Organización) | Después (Cuenta) | Qué ve, siempre acotado a la cuenta actual |
|---|---|---|
| Resumen | **Se retira** (no hay dos dashboards). Sus alertas pasan al **Dashboard** de la cuenta | Alertas de **esta** cuenta (`dk_account_observability`) |
| Cuentas | **«Tus cuentas»** (selector) y **Configuración → General** (editar la cuenta actual). Crear una cuenta, desde «Tus cuentas», para quien tiene permiso | La cuenta actual; la lista de cuentas es solo la tuya |
| Observabilidad y bitácora | **Configuración → Actividad** | Operación y bitácora de **esta** cuenta, sin filtro por otras |
| Equipos | **Usuarios** (rail) → pestañas **Usuarios** y **Roles y permisos** | Solo los miembros de **esta** cuenta; invitar y asignar roles **en esta** cuenta |
| Facturación | **Configuración → Facturación** | El plan (que cubre las cuentas del negocio, sin datos de otras) |
| IA y voz | **Configuración → IA y voz** | Funciones y ajustes **de esta cuenta**; sin la matriz de otras cuentas |
| Configuración e integraciones | **Configuración → General** (datos de la cuenta y del negocio) e **Integraciones** | El ID de **esta** cuenta |
| Menús maestros | **Catálogo → «Platos compartidos»** (D4) | Solo lo que llega a esta cuenta |

**Menú de usuario:**
- **Se quitan** «Cambiar de organización», «Administración de la organización» y el bloque «ORGANIZACIÓN · CÓDIGO».
- **Quedan, según permisos:** Mi perfil, Mis turnos, Configuración de la cuenta, Usuarios, Roles y permisos, Facturación, IA y voz, Integraciones, Actividad, Apariencia, Ayuda y soporte, Detalles de la sesión y Cerrar sesión.
- **Las cuentas de otros negocios** aparecen en «Tus cuentas»; al elegirlas, cambia el subdominio (ADR 0021/0022). Así cambias de cuenta sin que exista la palabra «organización».

## 3. Rutas
| Antes | Después |
|---|---|
| `/o/{slug}` | Redirige a la cuenta por defecto de esa organización (`/k/{cuenta}/`) |
| `/o/{slug}/equipos` | `/k/{cuenta}/users` |
| `/o/{slug}/facturacion` | `/k/{cuenta}/settings/billing` |
| `/o/{slug}/ai` | `/k/{cuenta}/settings/ai` |
| `/o/{slug}/configuracion` | `/k/{cuenta}/settings/general` |
| `/o/{slug}/observabilidad` | `/k/{cuenta}/settings/activity` |
| `/o/{slug}/cuentas` | `/cuentas` |
| `/o/{slug}/menus-maestros` | `/k/{cuenta}/menu-planner?view=shared` |

- Las rutas `/o/…` solo redirigen: no queda ninguna página de organización.
- Se eliminan `OrgScope`, `OrgAdminLayout`, `orgNavigation`, `orgRedirects`, `OrgUserMenu` y las páginas `Org*Page`. Los paneles reutilizables (`TeamView`, `PlanPanel`, `FeatureSettings`, `OrgGeneralForm` y `EventLog`) se reubican bajo la cuenta.

## 4. Base de datos (sin borrar nada)
| Cambio | Para qué |
|---|---|
| `dk_account_users()`: miembros de la **cuenta activa** (incluye a quienes tienen acceso total a ella), con sus roles **en esta cuenta** | Usuarios sin fuga a otras cuentas. `dk_org_users` queda para el portal |
| La bitácora y la observabilidad se piden **con la cuenta activa** (`dk_org_events` con `p_kitchen_id` obligatorio en la interfaz y `dk_account_observability`) | Actividad solo de esta cuenta |
| Permisos de organización (`users.manage`, `roles.manage`, `billing.view`, `features.manage`, `organization.manage`…) | **Sin cambios**, y se siguen exigiendo en la base. La interfaz los evalúa **dentro de la cuenta**: quien los tiene ve esas secciones en Configuración y Usuarios, siempre acotadas a la cuenta actual |
| Tablas, relaciones, RLS, roles y membresías | **Sin cambios** |

**Super Admin:**
- **Organización:** dentro de la cuenta A tiene acceso total a A, igual que hoy; nada de la interfaz le muestra B. Si quiere ir a B, cambia de cuenta.
- **Plataforma:** el Global Admin sigue en su portal aparte (`admin.quanela.com`), fuera de Quanela.

## 5. Pruebas
- **SQL (nueva suite `account_scope`):**
  - `dk_account_users` devuelve solo miembros de la cuenta activa, también para alguien con `team.view` en dos cuentas y para el Super Admin;
  - la bitácora con la cuenta activa no trae eventos de otra;
  - RLS y roles sin regresión (todas las suites).
- **Vitest:**
  - navegación: no hay rutas `/o`, cada una redirige a su equivalente y el rail y Configuración cambian según los permisos;
  - menú de usuario: sin «organización», con opciones según el rol;
  - Usuarios: sin filtro de otras cuentas;
  - textos sin «organización».
- **Navegador (con tu sesión):**
  - cuenta A y cuenta B (Dark Kitchen tiene 2);
  - el Super Admin en A no ve nada de B;
  - las URL directas a `/o/…` redirigen;
  - el cambio de cuenta funciona;
  - el subdominio y el tenant siguen funcionando.
- **Resto:** `tsc`, `oxlint` y ambos builds.

## 6. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Nombre de lo compartido (plan, roles e IA, que son de la organización) | **Hablar siempre de «tu cuenta»** y, cuando algo aplica a todas tus cuentas, decir «Aplica a todas tus cuentas» (sin la palabra «organización») |
| **D2** | Roles personalizados (son compartidos entre las cuentas del negocio) | **Se editan desde Usuarios → Roles y permisos.** Un aviso indica en cuántas de tus cuentas se usa el rol. No se duplican por cuenta |
| **D3** | IA y voz (ADR 0018: los valores son del negocio y cada cuenta puede tener su excepción) | **Configuración → IA y voz muestra y ajusta lo de esta cuenta.** Cambiar un valor general avisa «Aplica a todas tus cuentas» |
| **D4** | Menús maestros (platos copiados a varias cuentas) | **Catálogo → «Platos compartidos»**, para quien tenga `master_menus.manage`, mostrando solo lo de esta cuenta |
| **D5** | «Resumen» comparativo de todas las cuentas | **Se retira.** Sus alertas pasan al Dashboard de la cuenta |
| **D6** | Portal Global Admin (`admin.quanela.com`) | **No cambia**: es la consola de la plataforma, no la interfaz de Quanela |
| **D7** | Textos del registro y del login («Tu organización ha sido creada…») | **Pasan a «Tu cuenta ha sido creada · Código · Tu espacio»** |

## 7. Riesgos
| Riesgo | Mitigación |
|---|---|
| Quien administraba varias cuentas pierde la vista comparativa | Se cambia de cuenta desde «Tus cuentas»; el portal Global Admin sigue teniendo la vista global para la plataforma |
| Un rol o un ajuste de IA editado en A afecta a B (son compartidos) | Aviso explícito («Aplica a todas tus cuentas», «Usado en 2 cuentas») |
| Enlaces guardados a `/o/…` | Redirigen a su equivalente |

## 8. Orden de ejecución
| Fase | Qué |
|---|---|
| 1 | Base: `dk_account_users` y bitácora por cuenta; suite `account_scope` |
| 2 | Configuración con secciones General, Facturación, IA y voz, Integraciones y Actividad, reutilizando los paneles |
| 3 | Usuarios con Usuarios y Roles y permisos, acotado a la cuenta |
| 4 | Rail, menú de usuario, «Tus cuentas» sin agrupar por organización, Dashboard con alertas, Catálogo con platos compartidos |
| 5 | Retiro: rutas `/o` como redirecciones; borrar `OrgScope`, `OrgAdminLayout`, las páginas `Org*` y los textos con «organización» |
| 6 | Validación: SQL, vitest, `tsc`, `oxlint`, builds y navegador |
| 7 | Documentación: esta ADR con resultados, la ADR 0012 marcada como reemplazada en su interfaz y la arquitectura (el manual no) |

## 9. Qué necesito de ti
1. **Aprobar esta ADR**, con D1 a D7 confirmadas o corregidas.
2. **Para validar en el navegador:** iniciar sesión en el panel de vista previa (`fr3rk6.localhost:5173`, que tiene 2 cuentas).

## 10. Resultados (2026-10-02)

### 10.1 Base de datos (4 migraciones, sin borrar nada)
| Migración | Qué agrega |
|---|---|
| `20261002100000_dk_account_scope` | `dk_account_users()` (miembros de la cuenta activa) y `dk_account_events(…)` (bitácora de la cuenta activa) |
| `20261002110000_dk_account_settings_scope` | `dk_account_feature_matrix()`, `dk_account_ai_usage(días)` y `dk_account_alerts()`, todas de la cuenta activa |
| `20261002120000_dk_account_set_feature` | `dk_account_set_feature(función, activa)`: activar aquí nunca enciende otra cuenta |
| `20261002130000_dk_account_team` | `dk_account_remove_member(persona)` (solo de esta cuenta; una invitación sin cuentas se cancela) y `dk_account_role_usage()` (D2: en cuántas cuentas se usa cada rol, solo el número) |

Todas son `SECURITY DEFINER`, toman la cuenta de `x-dk-kitchen-id` y exigen los mismos permisos de antes. `dk_org_users`, `dk_org_events` y las demás funciones de organización siguen para el portal.

### 10.2 Interfaz
- **Rail.** La operación queda arriba; debajo de una línea, **Usuarios** y **Configuración**.
- **Configuración** (`/k/{cuenta}/settings/…`):
  - **General:** la cuenta, «Tu negocio · Aplica a todas tus cuentas» y desactivar la cuenta.
  - **Facturación:** el plan («Tu plan aplica a todas tus cuentas») y las facturas.
  - **IA y voz:** Funciones, Voz de cocina, En este equipo, Uso y Estado. Cada ajuste se guarda para todas tus cuentas o solo para esta.
  - **Integraciones:** solo el ID de esta cuenta.
  - **Actividad:** Operación y Bitácora de esta cuenta, sin filtro de otras.
- **Usuarios** (`/k/{cuenta}/users`, pestañas Usuarios y Roles y permisos):
  - solo las personas de esta cuenta, sin filtro por cuenta;
  - «Quitar de esta cuenta»;
  - los roles propios dicen en cuántas de tus cuentas se usan.
- **Menú de usuario:**
  - todas tus cuentas en una lista;
  - «Configuración de la cuenta» (con sus secciones), Usuarios y Roles y permisos;
  - sin «organización».
- **Tus cuentas:**
  - una sola lista, sin grupos;
  - las de otro negocio abren su subdominio;
  - «Nueva cuenta» para quien tiene `accounts.create`;
  - «Activar» para las desactivadas, con `accounts.manage`.
- **Dashboard:** alertas de esta cuenta. Las del plan se muestran solo a quien ve la facturación.
- **Catálogo → Platos compartidos** (`?view=shared`, `master_menus.manage`): cada menú se activa o se quita en esta cuenta. De las otras cuentas solo se muestra cuántas lo usan.
- **Textos (D1, D7):**
  - «Tu cuenta ha sido creada», «tu espacio» y «Código»;
  - la pantalla del tenant habla de «espacio»;
  - el portal Global Admin no cambia (D6).

### 10.3 Retirado
- **Archivos:**
  - `src/modules/orgAdmin/` completo;
  - `OrgScope`, `orgRedirects`, `OrganizationSwitcher`;
  - `shared/org/orgContext`;
  - `OrgAccountsPanel`, `AccountEditDrawer`;
  - `FeaturesSettingsPage`.
- **Rutas:** `/o/{slug}/…` solo redirige (`src/app/legacyOrgRoutes.ts`), y `/k/{cuenta}/organizacion` va a Configuración → General.

### 10.4 Validación
| Prueba | Resultado |
|---|---|
| SQL, todas las suites | **720/720**; `account_scope` 29/29 |
| Vitest | **301/301** |
| `tsc` | sin errores |
| oxlint | 16 avisos, uno menos que la línea base de 17 |
| Builds de la app y del portal | pasan |
| Navegador sin sesión | `/o/…` lleva al login sin errores en la consola |

**`account_scope` verifica:**
- A no ve a la gente ni la bitácora de B, ni siquiera el SUPER_ADMIN;
- la matriz de IA, el uso y las alertas son solo de A;
- activar una función en A no la enciende en B;
- quitar a alguien de A no lo quita de B;
- los roles sin permiso y los anónimos quedan bloqueados.

**Pendiente con tu sesión:**
- probar con las cuentas A y B de Dark Kitchen;
- cambio de cuenta y de subdominio;
- Configuración y Usuarios en el celular.
