# Auditoría — Menú semanal + preparación para integración con n8n/WhatsApp

## 1. Diagnóstico técnico (cómo está todo hoy, verificado en código y migraciones)

**Productos** (`dk_products`, migración `dk_products_schema.sql`): catálogo único — `id, code, name, description, category_id, price, active_recipe_id, estimated_cost, active`. El precio vive **acá, una sola vez**. No hay concepto de "opciones/modificadores" por producto en la base de datos: las personalizaciones ("sin cebolla") son texto libre en `dk_order_items.observation`, y `OBSERVATION_SUGGESTIONS` en `OrderBuilder.tsx` es solo una lista de sugerencias del lado cliente, no algo persistido por producto.

**Menús — el hallazgo más importante de esta auditoría**: ya existe un módulo "Menús" (`dk_menus`, `dk_menu_items`, `dk_daily_availability`), pero **no tiene nada que ver con días de la semana**. Es un sistema distinto:
- `dk_menus`: agrupaciones con nombre (ej. "Almuerzo Ejecutivo"), sin fecha ni día.
- `dk_menu_items`: qué productos pertenecen a cada agrupación, con precio especial opcional y horario opcional (`start_time`/`end_time`).
- `dk_daily_availability`: excepciones puntuales por **fecha exacta** (`menu_date date`) — "hoy se acabó tal plato". Ya tiene su propia página (`/menus/dia`, `TodayMenuPage.tsx`) donde cocina/admin marca algo agotado *solo por hoy*.
- El `getTodayMenu()` que ya existe (`src/modules/menus/api/todayMenu.ts`) es una función **del lado del cliente** (dos queries + merge en JS), no algo consultable directamente por n8n en una sola llamada.

**No existe ningún concepto de recurrencia semanal (Lunes/Martes/…) en ningún lado del esquema.** Lo que pides es un eje nuevo, no una corrección del sistema actual.

**Pedidos** (`dk_orders`/`dk_order_items`): el modelo **ya está preparado para WhatsApp**, literalmente — encontré `docs/adr/0006-whatsapp-boundary.md` (ya aceptado):
- `dk_orders.channel`: enum `MANUAL | WHATSAPP | PHONE`, ya insertable.
- `dk_orders.external_reference`: reservado para el id de conversación/mensaje.
- `dk_customers.whatsapp_id`: columna única, nullable, reservada para esto.
- `dk_order_items.observation`: exactamente donde ya persisten las personalizaciones ("sin ensalada"). El KDS (`TicketCard`/`ItemRow`) ya la muestra con ícono de advertencia — no hay que tocar cocina para nada de esto.
- Estado `NUEVO` de un pedido **ya es** el "borrador": mientras el pedido está en `NUEVO`, sus ítems son editables (trigger `dk_order_items_guard_editable`); `dk_confirm_order()` (RPC ya existente) es exactamente la acción "confirmar" que lo vuelve visible para Cocina. No hace falta un estado `DRAFT` nuevo — ya existe y ya se llama `NUEVO`.
- `dk_cancel_order()` ya permite cancelar un pedido `NUEVO` (si el cliente se arrepiente antes de confirmar).

**Clientes** (`dk_customers`): `phone` (único) + `whatsapp_id` (único, sin usar todavía). Buscar-o-crear por teléfono no existe como función, pero la tabla ya soporta la operación tal cual.

**Hallazgo de seguridad, ya existente, no introducido por esta tarea**: en varios RPC (`dk_confirm_order`, `dk_cancel_order`, `dk_advance_kitchen_item`, etc.) la autorización es `if dk_current_role() not in (...) then raise exception`. En PL/pgSQL, **una condición `NULL` en un `IF` se trata como `false`** — es decir, si `dk_current_role()` devuelve `NULL` (un usuario autenticado sin fila en `dk_users`, ej. recién registrado y aún no aprobado por un ADMIN), la excepción **no se lanza** y la función continúa como si estuviera autorizada. Es un bug preexistente, independiente de esta tarea — lo dejo documentado y lo reporto aparte (no lo arreglo acá para no mezclar alcance), pero es relevante: **mis RPC nuevos no van a depender de este patrón para bloquear a quien no corresponda** más allá de lo que ya hace el resto del código (ver sección 3).

**Precio no se re-valida en el flujo humano actual**: `OrderBuilder.tsx` permite editar `unitPrice` a mano al agregar un plato (`addOrderItem` inserta lo que el formulario mande, sin comparar contra `dk_products.price`). Es aceptable para un cajero humano (descuentos puntuales), pero es exactamente lo que el punto 18 de tu instrucción prohíbe para el flujo automático — mis RPC nuevos **nunca** aceptan un precio como parámetro; siempre lo resuelven ellos mismos desde `dk_products.price`.

**Realtime**: reconfirmado, no hay `supabase.channel`/`postgres_changes` en ningún módulo — el KDS sigue funcionando por polling (15s). No cambia nada acá.

**Qué reutilizo tal cual, sin tocar:**
- `dk_confirm_order()` y `dk_cancel_order()` — el paso "confirmar"/"cancelar" del pedido de WhatsApp usa exactamente estas funciones, sin duplicar su lógica de reservas de inventario.
- El esquema de `dk_orders`/`dk_order_items`/`dk_customers` — cero tablas nuevas para pedidos.
- El trigger `dk_recalc_order_subtotal` — el subtotal se recalcula solo, como ya pasa hoy.
- El Design System: `Tabs` (ya construido para Cocina), `Combobox`, `Chip`, `Modal` — nada nuevo de UI.

## 2. Decisión de arquitectura — el menú semanal es una tabla nueva, separada del sistema de Menús actual

Dado que `dk_menus`/`dk_menu_items`/`dk_daily_availability` resuelven un problema distinto (agrupaciones con nombre + horario + excepciones por fecha exacta), forzar la recurrencia semanal dentro de ese modelo sería un hack (¿qué `menu_id` usaría una fila semanal? ¿qué pasa con el horario?). Creo una tabla nueva y dedicada, tal como sugeriste:

```
dk_weekly_menu_items
  id, product_id (→ dk_products), day_of_week (enum), display_order, is_active, created_at, updated_at
  unique (product_id, day_of_week)
```

`day_of_week` como **enum nuevo** `dk_day_of_week` (`LUNES`…`DOMINGO`) — sigue la misma convención en español del resto del esquema (`dk_order_status`, `dk_role`), evita aritmética de índices 0-6/1-7 propensa a errores, y hace el código (y las consultas desde n8n) directamente legibles.

**Las dos "fuentes de disponibilidad de hoy" van a coexistir, sin fusionarse, en esta iteración**: el sistema viejo (`/menus/dia`, apagar un plato puntualmente hoy) sigue funcionando exactamente igual, sin tocarlo. El nuevo `dk_today_menu` (sección 3) es el que va a usar n8n y el que se vuelve la fuente de verdad "qué vendemos hoy por rotación semanal". Si más adelante quieres que apagar algo en el sistema viejo también lo oculte del `dk_today_menu`, es un cambio razonable para una próxima iteración — no lo hago ahora porque exigiría puentear dos modelos distintos (`menu_item_id` vs `product_id`) y tu punto 24 pide explícitamente mantener v1 simple. Lo marco en la documentación de integración para que quede visible, no lo escondo.

## 3. `dk_today_menu` — fuente de verdad consultable en una sola llamada

Una **vista** de Postgres (no una función del lado del cliente): se recalcula sola en cada consulta (usa `CURRENT_DATE`), y n8n puede leerla con un `GET` simple a PostgREST sin necesitar lógica adicional.

```sql
create view dk_today_menu as
  select p.id as product_id, p.name as product, p.price, p.description,
         pc.name as category, w.display_order, true as available
  from dk_weekly_menu_items w
  join dk_products p on p.id = w.product_id
  left join dk_product_categories pc on pc.id = p.category_id
  where w.day_of_week = dk_today_day_of_week() and w.is_active and p.active
  order by w.display_order, p.name;
```

Filtra productos inactivos, respeta `display_order`, y solo devuelve lo que hoy realmente se puede vender — exactamente la lista de tu punto 7. La reutilizo también dentro de la app: la nueva función `getTodayMenu()` (reemplazo del lado del cliente, mismo nombre, mismo módulo `menus`) pasa a ser un simple `select * from dk_today_menu`.

## 4. Credenciales para n8n — decisión de seguridad (la más importante de esta auditoría)

Evalué dos caminos:

**A) Service role key en n8n, bypass de RLS.** Es lo más simple de configurar, pero contradice el propio ADR 0005 ya aceptado en este proyecto ("un futuro cliente API queda automáticamente sujeto a las mismas reglas *si actúa como un rol de servicio bien definido*") y es más peligroso: una key filtrada da acceso total e irrestricto a toda la base de datos, sin excepción.

**B) Cuenta de servicio real (recomendado, lo que implemento).** Un usuario más en `dk_users`, con rol **CASHIER** — no creo un rol nuevo en esta iteración: CASHIER ya tiene exactamente los permisos que un pedido por WhatsApp necesita (`Pedidos: RW`, `Clientes: RW`, `Menú: R`) y nada de lo que no necesita (inventario, recetas, reportes, usuarios). n8n inicia sesión con ese usuario (email + contraseña) igual que lo haría un cajero humano desde el navegador, usando la **anon/publishable key** (la misma que ya usa React, no es secreta) para el login, y queda sujeto a las mismas políticas RLS que cualquier cajero. Ninguna credencial administrativa sale de n8n.

**Credenciales que necesita n8n** (para documentar, no las creo yo — es un paso de configuración tuyo):
1. `SUPABASE_URL` y la **anon/publishable key** (no son secretas, ya están en el bundle de React).
2. Email + contraseña de una cuenta `dk_users` dedicada, rol `CASHIER`, nombre sugerido "Asistente WhatsApp" — creada como cualquier otro usuario desde el módulo Usuarios de la app. n8n usa `supabase.auth.signInWithPassword()` una vez y reutiliza la sesión.

Si en el futuro (Fase 9 real) quieres permisos más finos para el bot que para un cajero humano (ej. que no pueda aplicar descuentos), ahí sí conviene un rol `dk_role` nuevo — lo dejo anotado como mejora futura, no bloqueante.

## 5. RPC nuevos (todos `SECURITY DEFINER`, autorizados a `ADMIN, MANAGER, CASHIER` — mismo patrón que el resto del proyecto)

- **`dk_find_or_create_customer_by_phone(p_phone, p_full_name)`** → `uuid`. Busca por `phone` o `whatsapp_id`; si existe, rellena `whatsapp_id` si faltaba y devuelve el id; si no existe, crea el cliente. Nunca duplica.
- **`dk_create_conversational_order(p_phone, p_customer_name, p_channel default 'WHATSAPP', p_external_reference, p_notes, p_items jsonb)`** → `uuid` (id del pedido). Resuelve el cliente (llama a la función anterior), crea el pedido en `NUEVO`, y por cada ítem del jsonb (`{product_id, quantity, observation}`) valida: el producto existe y está activo, **está en `dk_today_menu` de hoy** (si no, error — nunca se vende algo que no está en la rotación de hoy), cantidad > 0 — y **siempre resuelve el precio desde `dk_products.price` en ese momento**, ignorando cualquier precio que llegara en el payload (de hecho el parámetro ni siquiera acepta uno). Deja el pedido en `NUEVO` — borrador — sin tocar `dk_confirm_order`.
- **`dk_copy_weekly_menu_day(p_from_day, p_to_day)`** → reemplaza por completo la configuración de `p_to_day` con la de `p_from_day` (borra y reinserta las asociaciones, nunca duplica productos). Autorizado a `ADMIN, MANAGER` — esta es para el admin humano desde la app, no para n8n.

**Confirmar/cancelar el pedido de WhatsApp reutiliza `dk_confirm_order`/`dk_cancel_order` sin cambios.**

## 6. Cómo llega un pedido de WhatsApp al KDS (para que quede explícito)

```
n8n arma el pedido (conversación + Anthropic)
  → dk_create_conversational_order()   [NUEVO / borrador]
  → cliente confirma por WhatsApp
  → dk_confirm_order()                 [CONFIRMADO — reserva inventario]
  → aparece en Cocina/Kanban exactamente igual que cualquier pedido manual
    (mismo query, mismo KDS, cero código nuevo en el módulo Cocina)
```

Nada en el módulo Cocina cambia — un pedido `channel=WHATSAPP` es indistinguible para el KDS de uno manual, que es exactamente lo que pediste.

## 7. Interfaz del menú semanal (nueva sección dentro de Menús)

Nueva página `/menus/semanal`, enlazada desde `MenusPage.tsx` junto al enlace ya existente "Menú del día" (no toco esa página). Reutilizo el `Tabs` genérico que ya construimos para Cocina (7 pestañas, una por día) + `Combobox` (ya usado en `OrderBuilder`) para buscar y agregar productos + una lista compacta con botones ↑/↓ para reordenar (decido no usar drag & drop aquí: `@dnd-kit/core` ya está instalado pero reordenar una lista necesita `@dnd-kit/sortable`, una dependencia que no existe todavía; para listas de ~4-10 productos por día, ↑/↓ es igual de rápido, no agrega dependencias, y es accesible por teclado de fábrica). Un selector "Copiar desde…" + botón, que llama a `dk_copy_weekly_menu_day`. Persistencia inmediata por acción (agregar/quitar/reordenar), sin botón "Guardar" grande — mismo patrón que ya usa el resto de la app (ej. `setMenuActive`).

## 8. Documentación a entregar

Un documento nuevo `docs/integrations/n8n-whatsapp-integration.md` con: diagrama de arquitectura, tabla de responsabilidades por componente (React+Supabase / n8n / Anthropic / WhatsApp, tal como la sección 27 de tu mensaje), qué consulta n8n (`dk_today_menu`) y qué ejecuta (los 2 RPC nuevos + los 2 existentes), ejemplos de payload/respuesta JSON, las credenciales de la sección 4, el esqueleto conceptual del workflow (sección 22 de tu mensaje) y la nota sobre las dos fuentes de disponibilidad coexistiendo (sección 2 de esta auditoría).

## 9. Fuera de alcance (confirmado, no lo implemento)

Pagos, feriados/fechas especiales, tablas `dk_whatsapp_*`, nodos de n8n reales, Anthropic/WhatsApp dentro de React, modificadores/opciones estructuradas por producto (sigue siendo texto libre en `observation`), y el arreglo del bug de `dk_current_role()` con roles nulos (lo reporto aparte).

## 10. Plan de implementación

1. Migración SQL: enum `dk_day_of_week`, tabla `dk_weekly_menu_items` + RLS, vista `dk_today_menu`, y los 3 RPC nuevos.
2. Regenerar tipos TS.
3. `src/modules/menus`: tipos + api + hooks para el menú semanal; `getTodayMenu()` pasa a leer la vista nueva.
4. Página `/menus/semanal` (Tabs por día + Combobox + reorder + copiar).
5. `docs/integrations/n8n-whatsapp-integration.md`.
6. Verificación: crear productos en distintos días, confirmar que `dk_today_menu` solo muestra los de hoy, probar `dk_create_conversational_order` con un teléfono nuevo y uno existente, confirmar el pedido resultante y verlo aparecer en el Kanban de Cocina sin cambios. tsc/lint/test/build.

Quedo pendiente de tu aprobación, en particular sobre la sección 4 (cuenta de servicio CASHIER vs. service role key) y la sección 2 (dejar coexistiendo el sistema de Menús viejo sin fusionarlo).
