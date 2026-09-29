# ADR 0013 — Código y URLs en inglés

## Estado
**Propuesta (2026-09-28), pendiente de aprobación única.** Al aprobarse se ejecuta completa (sección 9) sin aprobaciones intermedias. Las decisiones de la sección 7 llevan recomendación: si apruebas sin comentarios, se aplica la recomendación.

**Regla nueva:** todo el código y todas las URL van en inglés. Esto incluye rutas, parámetros, identificadores, nombres de archivo, objetos y valores de la base, claves JSON y comentarios. **Lo que ve el usuario sigue en español**: textos de pantalla, mensajes de error, resúmenes de la bitácora, respuestas de la IA, comandos de voz y documentación (manual y ADR).

---

## 1. Auditoría (2026-09-28)

| Área | Estado | En español |
|---|---|---|
| Nombres de archivos y carpetas | Casi todo en inglés | La carpeta `src/modules/cartera/` (7 importaciones) |
| Tablas y funciones SQL | En inglés (`dk_*`) | — |
| Columnas | En inglés salvo 3 | `dk_kitchen_sla_settings.confirmado_alert_min`, `en_preparacion_alert_min`, `listo_alert_min` |
| **Valores de enum** | 4 en inglés | **7 enums**: `dk_order_status`, `dk_kitchen_item_status`, `dk_delivery_status`, `dk_movement_type`, `dk_purchase_status`, `dk_waste_reason` y `dk_day_of_week`. Se usan en **26 funciones SQL** activas, **~270 lugares en 32 archivos** del frontend y en 20 archivos de migraciones y pruebas. |
| Claves JSON de RPC | Casi todas en inglés | `dk_dashboard_summary`: `ordersNuevo`, `ordersConfirmado`, `ordersEnPreparacion`, `ordersListo`, `ordersDespachado` |
| Claves de acciones de IA | En español | `agrupar_preparacion`, `crear_borrador_compra`, `despachar`, `no_recomprar`, `priorizar_pedido`, `registrar_merma`, `revisar_plato`, `revisar_proveedor`, `revisar_receta`. Se guardan en `dk_ai_insights.output`. |
| Datos que la Edge Function envía al modelo | En español | `cantidad_lote_mas_antiguo`, `consumo_diario_30d`, `dias_sin_consumo`, `merma_proyectada`, `minutos_en_estado`, `domiciliarios_activos`… (~15 claves) |
| **Rutas** | Mezcladas | `/cuentas`, `/cocinas`, `/precios`, `/registro`, `/registro/confirmado`, `/activar/:token`, `/invitacion/:token`, `/k/:c/perfil`, `/k/:c/organizacion`, `/k/:c/inventory/movimientos`, `/k/:c/supply/compras`, `/k/:c/supply/proveedores`, `/o/:org/{cuentas, observabilidad, equipos, facturacion, configuracion, menus-maestros}` |
| **Parámetros de URL** | Mezclados | `?cuenta=`, `?pedido=`, `?bienvenida=`. Valores de pestaña: `tab=bitacora`, `operacion`, `funciones`, `integraciones`. Anclas del landing: `#producto`, `#funcionalidades`, `#precios`. |
| Identificadores TS | Casi todo en inglés | `CarteraCard`, `CarteraRows`, `isNuevo`, `listoRows`, `listoError`, variables `nuevo`/`listo`, campos `confirmadoAlertMin`… |
| Comentarios | En español | ~1.700 líneas en `src/`, 38 en la Edge Function, ~200 en las pruebas SQL, 190 descripciones de pruebas de la app y 71 comentarios de objetos en la base (`comment on …`) |
| Claves de `localStorage` | En inglés (`dk-kitchen-view`…) | — |

**No se tocan (son textos o datos del usuario):**
- etiquetas y mensajes de pantalla;
- mensajes de error de la base (`RAISE`, que la app muestra);
- resúmenes de la bitácora;
- respuestas y lenguaje del modelo de IA;
- patrones de reconocimiento de voz (`commandParser`: el usuario habla en español);
- el manual y las ADR.

## 2. Diseño

### 2.1 Enums de la base (renombrar valores, sin perder datos)
`ALTER TYPE … RENAME VALUE` cambia la etiqueta **sin reescribir filas**: todo lo guardado conserva su valor. Lo que se guarda compilado (restricciones, índices parciales, valores por defecto y políticas) apunta al valor interno y se ajusta solo. **Lo que no se ajusta solo son los cuerpos de las funciones** (texto): en la misma migración se regeneran las 26 funciones desde `pg_get_functiondef`, reemplazando solo los literales entre comillas. La migración falla si queda algún literal en español.

| Enum | Mapeo |
|---|---|
| `dk_order_status` | NUEVO→`NEW`, CONFIRMADO→`CONFIRMED`, EN_PREPARACION→`PREPARING`, LISTO→`READY`, DESPACHADO→`DISPATCHED`, ENTREGADO→`DELIVERED`, CANCELADO→`CANCELED` |
| `dk_kitchen_item_status` | PENDIENTE→`PENDING`, EN_PREPARACION→`PREPARING`, LISTO→`READY` |
| `dk_delivery_status` | EN_RUTA→`OUT_FOR_DELIVERY`, ENTREGADO→`DELIVERED`, FALLIDO→`FAILED` |
| `dk_movement_type` | COMPRA→`PURCHASE`, MERMA→`WASTE`, AJUSTE→`ADJUSTMENT`, CONSUMO→`CONSUMPTION`, DEVOLUCION→`RETURN` |
| `dk_purchase_status` | BORRADOR→`DRAFT`, CONFIRMADA→`CONFIRMED`, ANULADA→`VOIDED` |
| `dk_waste_reason` | VENCIMIENTO→`EXPIRED`, DANO→`DAMAGED`, ERROR_PREPARACION→`PREPARATION_ERROR`, OTRO→`OTHER` |
| `dk_day_of_week` | LUNES…DOMINGO→`MONDAY`…`SUNDAY` |

Otros cambios en la base:
- **Columnas:** `confirmado_alert_min`→`confirmed_alert_min`, `en_preparacion_alert_min`→`preparing_alert_min`, `listo_alert_min`→`ready_alert_min`.
- **Claves de `dk_dashboard_summary`:** `ordersNew`, `ordersConfirmed`, `ordersPreparing`, `ordersReady`, `ordersDispatched`.
- **Comentarios de objetos:** los 71 `comment on` pasan a inglés.

**Historial:** `dk_audit_log` es de solo agregar y no se reescribe (D3), así que sus filas viejas guardan valores en español dentro de `old_data`/`new_data`. Las etiquetas de la app aceptan ambos valores (`LEGACY_ENUM_VALUES`), para que "Ver cambios" siga diciendo "Cancelado". Lo mismo aplica a las claves de IA de `dk_ai_insights.output` que ya existen.

### 2.2 URLs
| Antes | Después |
|---|---|
| `/cuentas` (`/cocinas` ya redirigía) | `/accounts` |
| `/precios`, `#precios` | `/pricing`, `#pricing` (anclas: `#product`, `#features`, `#pricing`, `#faq`) |
| `/registro`, `/registro/confirmado` | `/signup`, `/signup/confirmed` |
| `/activar/:token` | `/activate/:token` |
| `/invitacion/:token` | se mantiene como redirección antigua → `/login` |
| `/k/:c/perfil` | `/k/:c/profile` |
| `/k/:c/organizacion` | `/k/:c/organization` → `/o/:org/settings` |
| `/k/:c/supply/compras`, `/supply/proveedores` | `/k/:c/supply/purchases`, `/supply/suppliers` |
| `/k/:c/inventory/movimientos` | se elimina (ya era una redirección antigua a `/supply/stock`) |
| `/o/:org/cuentas`, `observabilidad`, `equipos`, `facturacion`, `configuracion`, `menus-maestros` | `/o/:org/accounts`, `observability`, `teams`, `billing`, `settings`, `master-menus` |
| `?cuenta=`, `?pedido=`, `?bienvenida=` | `?account=`, `?order=`, `?welcome=` |
| `tab=operacion`, `bitacora`, `general`, `funciones`, `integraciones` | `tab=operations`, `event-log`, `general`, `features`, `integrations` |

**Redirecciones de lo antiguo (D2):** una sola tabla `LEGACY_ROUTES` (español → inglés, conserva parámetros y ancla) para lo que puede estar afuera:
- enlaces de activación enviados (vencen en 7 días);
- correos de confirmación en camino;
- favoritos.

Todo lo nuevo se genera en inglés.

### 2.3 Código
- `src/modules/cartera/` → `src/modules/receivables/`; `CarteraCard`/`CarteraRows` → `ReceivablesCard`/`ReceivablesRows`.
- Campos y variables en español → inglés (`isNew`, `readyRows`, `confirmedAlertMin`…).
- **Claves de IA:**

  | Antes | Después |
  |---|---|
  | `agrupar_preparacion` | `group_preparation` |
  | `crear_borrador_compra` | `create_purchase_draft` |
  | `despachar` | `dispatch` |
  | `no_recomprar` | `skip_reorder` |
  | `priorizar_pedido` | `prioritize_order` |
  | `registrar_merma` | `record_waste` |
  | `revisar_plato` | `review_dish` |
  | `revisar_proveedor` | `review_supplier` |
  | `revisar_receta` | `review_recipe` |

  Las claves de entrada al modelo también pasan a inglés; el prompt sigue pidiendo la respuesta en español. Se redespliega `dk-ai-insights`.
- **Comentarios (D1):** a inglés en `src/`, la Edge Function, las pruebas SQL y las descripciones de pruebas. Las migraciones **ya aplicadas no se editan** (son historia inmutable); todas las nuevas van en inglés.

### 2.4 Aparte (lo ofrecí antes)
Los errores de Supabase Auth se muestran hoy en inglés ("Invalid login credentials"). Se agrega un mapa por código de error a español ("Correo o contraseña incorrectos"). Es texto de pantalla; el código sigue en inglés (D5).

## 3. Migraciones
| Migración | Contenido |
|---|---|
| `20260930100000_dk_english_enums` | Renombra los 28 valores de los 7 enums y regenera las 26 funciones afectadas en la misma transacción. Verifica que no queden literales en español. |
| `20260930110000_dk_english_columns_and_keys` | Columnas de SLA, claves de `dk_dashboard_summary` y funciones que leen las columnas de SLA (`dk_late_orders_count`…). |
| `20260930120000_dk_english_db_comments` | Los 71 `comment on` en inglés. |

Cada una se ensaya antes con `run.py --with …` contra todas las suites; después `db push`, tipos y asesores.

## 4. Riesgos
| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Queda una función con un literal viejo y falla al ejecutarse (no al compilar). | Barrido de `pg_proc.prosrc` dentro de la migración: si queda alguno, no se aplica. Las 400 pruebas SQL recorren todas las RPC de pedidos, compras, inventario y reportes. |
| R2 | Una app abierta con la versión anterior envía `'CANCELADO'` y falla. | Hoy solo hay entornos locales (no hay `VITE_SITE_URL` desplegado). Base y frontend se publican juntos; basta recargar la pestaña. |
| R3 | Enlaces viejos rotos. | `LEGACY_ROUTES` y pruebas de cada redirección. |
| R4 | Supabase Auth rechaza la nueva URL de confirmación. | **Acción manual:** agregar `…/signup/confirmed` en *Authentication → URL Configuration → Redirect URLs*, sin quitar la vieja todavía. |
| R5 | Un cambio de identificadores de este tamaño rompe algo silencioso. | `tsc` estricto, 149 pruebas de la app, verificación en el navegador de cada ruta y del tablero de Cocina (arrastrar, confirmar, despachar, cancelar). |
| R6 | n8n/WhatsApp dependen de los valores. | Todavía no hay integración activa (quedó para después). El contrato nuevo (`channel`, estados en inglés) se documenta en la arquitectura. |

## 5. Pruebas
- **SQL:** todas las suites se actualizan a los valores en inglés, más una suite nueva `english_contract`:
  - no queda ningún valor de enum en español;
  - no queda ningún literal en español en `pg_proc`;
  - los datos anteriores conservan su valor renombrado (un pedido `CANCELADO` ahora es `CANCELED`);
  - el SLA funciona con las columnas nuevas.
- **App:**
  - `LEGACY_ROUTES` (cada ruta vieja lleva a la nueva, con parámetros);
  - etiquetas que aceptan valores viejos y nuevos;
  - mapa de errores de Auth;
  - las pruebas existentes actualizadas.
- **Barrido final automatizado** (el mismo de esta auditoría): sin rutas, parámetros ni identificadores en español en `src/` y `supabase/functions`.
- **Visual:**
  - cada ruta del centro y de la Cuenta;
  - el landing con sus anclas;
  - `/activate/:token` y la ruta vieja;
  - el tablero de Cocina con el ciclo completo de un pedido.

## 6. Criterios de aceptación
1. Ninguna ruta, parámetro, ancla, identificador, archivo, valor de enum, columna ni clave JSON en español. Lo verifica el barrido automático y la suite `english_contract`.
2. Todos los enlaces viejos redirigen a su equivalente en inglés.
3. Ningún dato se pierde: los registros existentes conservan su estado con el nombre nuevo.
4. La interfaz se ve igual, en español; los mensajes de Auth también en español.
5. Todas las pruebas en verde; manual, ADR, arquitectura y ERD actualizados.

## 7. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | ¿Los comentarios también? | **Sí**, en `src/`, la Edge Function y las pruebas. **No** en las migraciones ya aplicadas, porque son historia inmutable; las nuevas, en inglés. |
| **D2** | Redirecciones de las URL en español | **Mantenerlas** en `LEGACY_ROUTES` (activaciones y correos en camino, favoritos). Se pueden retirar más adelante con un cambio de una línea. |
| **D3** | Historial de la bitácora y de la IA con valores en español | **No reescribirlo** (es de solo agregar); la app entiende ambos valores. |
| **D4** | Nombres de los enums | Los de la tabla 2.1 (`CANCELED` como en `dk_subscriptions`; `PREPARING`; `OUT_FOR_DELIVERY`). |
| **D5** | Errores de Auth en español | **Sí**, en esta misma ejecución. |

## 8. Compatibilidad
- Mismas pantallas y mismos textos; solo cambian las direcciones, que redirigen desde las viejas.
- Los datos se conservan todos, con sus valores renombrados.
- **Acción manual:** la URL de redirección de Supabase Auth (R4).

## 9. Orden de ejecución
| Fase | Qué | Depende de |
|---|---|---|
| 1 | Migración de enums + regeneración de funciones + suite `english_contract` + pruebas SQL actualizadas | — |
| 2 | Migración de columnas y claves de SLA y del dashboard; comentarios de la base | 1 |
| 3 | Tipos generados; frontend y Edge Function con los valores y claves nuevos; etiquetas que aceptan valores viejos | 1, 2 |
| 4 | Rutas, parámetros, anclas, `LEGACY_ROUTES`, `CONFIRMED_PATH` y enlace de activación | — |
| 5 | Renombres de código (`cartera` → `receivables`, identificadores) | 3 |
| 6 | Comentarios y descripciones de pruebas a inglés | 3–5 |
| 7 | Errores de Auth en español | 4 |
| 8 | Despliegue de la Edge Function; validación integral (SQL, `tsc`, `oxlint`, `vitest`, `build`, asesores, barrido, navegador) | 1–7 |
| 9 | Documentación: manual (URL), esta ADR, arquitectura (contrato de valores), ERD | 8 |
