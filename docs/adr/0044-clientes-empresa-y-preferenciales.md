# ADR 0044: Clientes empresa, clientes preferenciales y sus preferencias a la vista

## Estado
**Aprobada e implementada (2026-10-09).**

**Pedido:**
1. Que el módulo de Clientes permita **empresas**, no solo personas naturales.
2. Indicar si el cliente es **preferencial**, y mostrar sus **preferencias** y **recomendaciones**.

---

## 1. Auditoría
| Hoy | Problema |
|---|---|
| `dk_customers`: `full_name` (obligatorio), teléfono (único por cuenta y normalizado), correo, dirección y notas | No hay tipo de cliente, ni razón social, ni NIT, ni persona de contacto. Una empresa se registra como si fuera una persona |
| No existe una marca de cliente preferencial (VIP). La ADR 0040 la dejó como trabajo futuro: «Estado manual del cliente (bloqueado, VIP…)» | No hay forma de distinguir a los clientes que merecen trato especial |
| Las preferencias (plato favorito, le gusta, no le gusta, dieta) y las recomendaciones (manuales; las automáticas quedaron preparadas) ya existen (ADR 0040) | Solo se ven **dentro de la ficha**: las preferencias en Resumen y en su pestaña, y las recomendaciones **solo en Resumen**. **Al tomar un pedido no se ven**: el selector de cliente muestra solo nombre y teléfono |
| La lista (`dk_customers_list`) busca por nombre, teléfono, correo y dirección, y filtra por actividad y deuda | No se puede buscar por NIT ni filtrar empresas o preferenciales |
| Copilot (`dk_copilot_customers`) devuelve nombre, pedidos, gasto y saldo | No sabe si el cliente es empresa o preferencial |
| WhatsApp (n8n) crea clientes con `dk_find_or_create_customer_by_phone` | Debe seguir funcionando igual: ahí siempre llega una persona |
| **Error ya conocido:** editar un cliente desde el menú ⋯ de la lista borra su correo (`CustomerActions.tsx`) | Se corrige aquí, porque el formulario cambia |

## 2. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Tipo de cliente | `customer_type`: **`person`** (por defecto; todos los clientes de hoy quedan así) o **`company`**. Para una empresa:<br>• **Nombre** = nombre comercial, el que se ve en toda la app (es el mismo `full_name`: pedidos, despacho, cartera y Copilot no cambian);<br>• **Razón social**;<br>• **NIT**;<br>• **Persona de contacto**.<br>Teléfono, correo y dirección son los de siempre. Al cambiar de persona a empresa (o al revés) no se borra nada |
| **D2** | Documento | `tax_id` sirve para los dos tipos: **«NIT»** para empresas y **«Documento (opcional)»** para personas (por ejemplo, para facturar). Es **único por cuenta**, comparado sin puntos, guiones ni espacios («900.123.456-7» = «9001234567»). Si se repite, el aviso dice claramente que ese NIT ya existe |
| **D3** | Cliente preferencial | `preferred` (sí o no) y un **motivo opcional** (`preferred_note`, hasta 200 caracteres; por ejemplo «Descuento del 10 %» o «Convenio corporativo»). Lo marca quien puede editar clientes. Es **informativo**: no cambia precios ni nada automático (eso sería otra ADR). Se ve como una ⭐ **«Preferencial»** en:<br>• la lista;<br>• la ficha (con el motivo);<br>• el selector de cliente al crear un pedido;<br>• el detalle del pedido |
| **D4** | Preferencias y recomendaciones a la vista | • **Al crear un pedido**, al elegir el cliente aparece un recuadro con lo que **no le gusta** y su **dieta** primero (para no equivocarse), luego su **plato favorito** y las **recomendaciones activas**. Solo se lee; se edita en la ficha.<br>• **En la ficha**, la pestaña **«Preferencias»** pasa a llamarse **«Preferencias y recomendaciones»** y suma las recomendaciones (hoy solo están en Resumen).<br>• **En la lista**, nada nuevo por fila (sería demasiado), solo la ⭐ y el tipo |
| **D5** | Lista y búsqueda | • Columna **Cliente**: un ícono de empresa o de persona, la ⭐ y, en empresas, el NIT debajo del nombre.<br>• **Búsqueda** también por NIT, razón social y persona de contacto.<br>• Filtros nuevos en «Más filtros»: **Tipo** (todos, personas, empresas) y **Solo preferenciales**.<br>• Un indicador más arriba: **Preferenciales** |
| **D6** | Formulario de crear y editar | Arriba, **Persona / Empresa**. Para una empresa: Nombre comercial, Razón social, NIT y Persona de contacto; luego Teléfono, Correo y Dirección, como hoy. Para una persona: los campos de hoy más Documento (opcional). Al final: **Cliente preferencial** (interruptor) y su **Motivo**. El mismo formulario sirve desde Clientes y desde «Crear cliente» al tomar un pedido. Se corrige que **editar desde el menú ⋯ borraba el correo** |
| **D7** | Copilot | `dk_copilot_customers` devuelve `type`, `preferred` y `taxId` (este último solo cuando se pide el contacto), y acepta filtrar por preferenciales y por tipo. La descripción de la herramienta lo explica. Se despliega `dk-copilot` |
| **D8** | Lo que no cambia | WhatsApp sigue creando personas. Pedidos, despacho y cartera siguen usando el nombre. Las recomendaciones automáticas siguen sin construirse (ADR 0040, §2.2). No se borra ningún dato |
| **D9** | Ayuda | El artículo de Clientes (empresas, preferenciales, el recuadro al tomar un pedido) y las notas de versión. El manual no se toca |

## 3. Fases
| Fase | Qué |
|---|---|
| 1 · Base | Migración `dk_customer_type_and_preferred`:<br>• las columnas `customer_type`, `legal_name`, `tax_id`, `contact_name`, `preferred` y `preferred_note`, con sus `check` de largo;<br>• un índice único por cuenta sobre el NIT normalizado;<br>• un trigger que limpia espacios y deja vacío como null.<br>Se recrean `dk_customers_with_stats`, `dk_customers_list` (búsqueda y filtros nuevos), `dk_customers_summary` (preferenciales), `dk_customer_detail` y `dk_copilot_customers`. Tipos regenerados |
| 2 · Formulario | `CustomerFormModal` con Persona / Empresa, campos condicionales y preferencial. `CustomerInput` y `create` / `updateCustomer`. Corrección de `EditCustomer` (correo) |
| 3 · Lista y ficha | La columna Cliente, la búsqueda, los filtros y el indicador. En la ficha: la ⭐ y el motivo en el encabezado, los datos de empresa en Contacto y la pestaña «Preferencias y recomendaciones» |
| 4 · Pedidos | El selector de cliente muestra la ⭐ y el ícono de empresa. Al elegir el cliente, el recuadro de preferencias y recomendaciones (lee `dk_customer_profile`). La ⭐ en el detalle del pedido |
| 5 · Copilot y ayuda | Herramienta, despliegue, artículo, notas de versión y `npm run help` |
| — | **Validación:**<br>• SQL: tipo y valores por defecto, NIT único normalizado por cuenta, búsqueda por NIT, razón social y contacto, filtros, indicador, permisos (sin `customers.edit` no se marca preferencial), otra cuenta, y que WhatsApp siga creando personas.<br>• Vitest: el formulario (cambiar de tipo, NIT repetido, correo conservado al editar), la lista, la ficha y el recuadro del pedido.<br>• `tsc`, `oxlint`, builds y el navegador con la sesión guardada |

## 4. Riesgos
| Riesgo | Mitigación |
|---|---|
| Cambiar funciones que usan la lista, la ficha, los avisos y Copilot | Se recrean con las mismas columnas más las nuevas. Las suites `customers_list` y `customer_360` deben seguir en verde |
| Un NIT escrito de dos formas crea un duplicado | Índice único sobre el NIT sin puntos, guiones ni espacios |
| Que la ⭐ se lea como un descuento automático | El texto dice «Preferencial» y el motivo lo escribe el negocio. No hay ninguna regla de precio |
| Datos de una empresa a la vista de quien no debe | Se leen con los mismos permisos de hoy (`customers.view`). El NIT llega a Copilot solo cuando se pide el contacto |

## 5. Resultados (2026-10-09)
| Fase | Qué quedó |
|---|---|
| 1 · Base | Migración `20261009100000_dk_customer_type_and_preferred` (aplicada):<br>• columnas y `dk_tax_id_key()`;<br>• índice único `dk_customers_kitchen_tax_id_key`;<br>• trigger `dk_customers_type_fields` (limpia los campos y exige `customers.edit` para marcar preferencial; los procesos sin sesión, como WhatsApp, no lo necesitan);<br>• `dk_customers_list` con `p_type` y `p_preferred` (la firma anterior se reemplaza);<br>• `dk_customers_summary` con `preferred` y `companies`;<br>• `dk_customer_detail` con `dk_customer_type_json`;<br>• `dk_copilot_customers` con filtros y el NIT solo con el contacto.<br>`dk_customers_with_stats` no cambió |
| 2 · Formulario | `CustomerFormModal`: Persona / Empresa, Nombre comercial, Razón social, NIT, Persona de contacto, Documento, y Preferencial con su motivo (solo con `customers.edit`). Mensaje propio para un NIT repetido. `EditCustomer` y la ficha pasan el cliente completo: **ya no se borra el correo al editar desde el menú ⋯** |
| 3 · Lista y ficha | `CustomerIdentity` (`PreferredBadge`, `CompanyIcon`, `CustomerMarks`) y `lib/identity.ts`. Lista: marcas y «Empresa · NIT», búsqueda por NIT, Tipo y Solo preferenciales en «Más filtros», y el indicador **Preferenciales** (`KpiStrip` admite 5 columnas). Ficha: «Empresa» y ⭐ en el encabezado; razón social, NIT, contacto, documento y motivo en Contacto; pestaña «Preferencias y recomendaciones» |
| 4 · Pedidos | `CustomerOrderHints` al elegir el cliente y mientras se agregan los platos. En el selector: marcas, «Empresa · NIT» y búsqueda por NIT. En el detalle del pedido: las marcas junto al nombre (`orders.ts` lee `customer_type`, `preferred` y `preferred_note`) |
| 5 · Copilot y ayuda | La herramienta `customers` con `preferred` y `type`. `dk-copilot` desplegada. Artículo de Clientes y notas de versión |

**Validación:**
- SQL: `customer_type` **19/19**. `customers_list` 25/25 (una expectativa actualizada: el resumen suma `preferred` y `companies`). `customer_360`, `copilot_safety`, `copilot_tools`, `phone_email`, `notifications`, `dispatch_riders` y `multikitchen_isolation` siguen en verde.
- Vitest: **650** (102 archivos). Nuevas: el formulario (empresa, persona sin campos de empresa, NIT repetido, sin permiso no hay preferencial, editar desde ⋯ conserva el correo) y el recuadro del pedido.
- `tsc`, `oxlint` (13 avisos) y los dos builds correctos.
- En el navegador, sin guardar datos: la lista con filtros e indicador, el formulario en modo Empresa con Preferencial y la pestaña nueva de la ficha. Ninguna petición falló.

**Incidente al aplicar la migración:** `supabase db push --yes` aplicó también `20261007120000_dk_consumer_marketplace.sql` (ADR 0042), que estaba pendiente y que esa ADR reservaba para tu aprobación. Es aditiva y quedó **sin datos**: 0 negocios publicados, 0 platos y 0 consumidores, y la función `dk-consumer-assistant` no está desplegada. El permiso `storefront.manage` quedó asignado a ADMIN y GERENTE. No se revirtió: lo decides tú.
