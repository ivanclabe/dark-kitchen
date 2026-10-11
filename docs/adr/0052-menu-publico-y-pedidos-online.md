# ADR 0052: Menú Público Digital y Pedidos Online

## Estado
**Aprobada e implementada (2026-10-11).** Falta un pedido de prueba con tu sesión (ver Validación).

**Pedido:** un módulo nuevo, **Menú Público**, con estas condiciones:
- cada negocio publica su **menú del día** en una página web pública, con un enlace único para compartir por WhatsApp (por ejemplo `quanela.com/menu/nombre-del-negocio`);
- la página sale del **planificador existente** (solo los platos programados y disponibles hoy), con sus precios y su disponibilidad;
- tiene categorías, carrito y totales correctos, en una interfaz moderna y pensada para el celular;
- lo que se pide **entra solo a cocina**: un **canal de ventas real**, no una página bonita;
- sin tablas ni planificadores duplicados.

---

## 1. Auditoría
| Área | Hoy | Consecuencia |
|---|---|---|
| Planificador | `dk_menu_plan_items` es la **única** fuente del menú del día: plato, fecha, agotado (`is_active`), horario (desde y hasta), precio promocional, límite de unidades y «hasta agotar existencias». Las tablas `dk_menus`, `dk_daily_availability` y `dk_weekly_menu_items` están en desuso | La página pública lee **esta** tabla. No se crea otra |
| Menú de hoy | La vista `dk_today_menu` (para n8n y WhatsApp) solo filtra hoy, activo y precio. **No respeta el horario ni el límite de unidades**. Solo la puede usar personal con sesión | Hay que aplicar todas las reglas, y para alguien sin sesión |
| Quanela Consumer | `dk_storefronts` (publicado, frase, ubicación, WhatsApp) y `dk_storefront_products` (etiquetas). La dirección pública es `dk_kitchens.slug`, única en la plataforma. La búsqueda pública `dk_public_search_dishes` calcula la disponibilidad (agotado, cerrado, más tarde, terminó). El horario de la cocina se resuelve en `dk_storefront_open_state`. Los pedidos directos se **diseñaron** (ADR 0042, fase 8: canal, dirección, idempotencia) pero **no se hicieron**. La app de clientes es iOS y aún no salió | Se reutilizan la vitrina (identidad, WhatsApp, frase), la dirección pública, el horario y las reglas de disponibilidad. La fase 8 de 0042 se concreta aquí para la web |
| Pedidos | Todo pedido nace con sesión de personal. `customer_id` es obligatorio. Canales: Mostrador, WhatsApp y Teléfono. **No hay dirección de entrega en el pedido, ni «recoger», ni idempotencia.** El precio se congela en cada línea. Número de pedido por cuenta | Hacen falta un canal **Menú web**, la forma de entrega en el pedido y una función pública segura que cree el pedido con **precios del servidor** |
| Cocina | Un pedido NUEVO **no llega a Cocina** hasta que alguien lo confirma (`dk_confirm_order`: congela la receta, revisa y reserva stock, crea la comanda). No hay confirmación automática. Aviso: el tablero consulta cada 15 s, la campana cada 60 s, y suena un pitido | Para que «entre solo a cocina» hace falta **confirmar automáticamente** con las mismas reglas de siempre |
| Clientes | Se busca o crea el cliente por teléfono (normalizado a E.164). Hay historial de direcciones del cliente | Se reutilizan: el cliente web queda en Clientes con su dirección |
| Lo público y la seguridad | No hay **ninguna página pública** de menú. Solo 4 funciones abiertas a anónimos. **No hay límite de intentos** (salvo el de IA de Consumer). Supabase da permiso a anónimos por defecto en funciones nuevas: hay que quitarlo a mano | Nueva ruta pública fuera del inicio de sesión. Funciones anónimas mínimas, con límites de intentos e idempotencia |
| Interfaz | No hay carrito. Constructor de pedidos con totales, `PhoneInput`, `formatMoney` y fotos públicas de los platos. Enlaces de WhatsApp sueltos, sin un ayudante común. **No hay librería de QR** | Se reutilizan los componentes. Se agrega un ayudante de WhatsApp |

## 2. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Módulo y relación con Consumer | Un módulo nuevo en el menú, **«Menú público»** (`/public-menu`), con el permiso que ya existe para la vitrina (`storefront.manage`).<br>**Reutiliza la misma vitrina de la cuenta** (`dk_storefronts`): un solo nombre, frase, WhatsApp y dirección pública para la web y la app. Se le agregan solo las opciones de la web (D5).<br>«Publicar en la web» y «Publicar en Quanela Consumer» son **interruptores separados** (la app aún no sale) |
| **D2** | El enlace | **`quanela.com/menu/{identificador de la cuenta}`**, por ejemplo `quanela.com/menu/sopa-donde-carmen`. Es la dirección pública que ya existe (Configuración → General), única en la plataforma. Funciona en cualquier dominio de la app; en desarrollo, `localhost:5173/menu/…`.<br>Cambiar el identificador cambia el enlace: la pantalla lo advierte |
| **D3** | Qué se muestra | Sale **solo** del planificador de **hoy**, en la zona horaria de la cuenta:<br>• platos programados hoy, activos, y que no estén agotados ese día;<br>• precio = el promocional del día o, si no hay, el normal, con el normal tachado si hay promoción;<br>• **horario** del plato: «Desde las 12:00», o «Hasta las 3:00 p. m.» y luego «Terminó»;<br>• **límite**: «Quedan 3», y agotado al llegar al límite (cuentan los pedidos del día no cancelados);<br>• foto, descripción y categoría del plato; las categorías en el orden en que el planificador ordena los platos;<br>• estado del negocio: **Abierto** (cierra a las …), **Cerrado** (abre a las …) o sin horario configurado.<br>**Nunca** el costo, las recetas ni datos internos. Si hoy no hay menú: «Hoy no hay menú publicado» |
| **D4** | Pedir: un canal real | Una función pública, **`dk_public_place_order`**, que crea un pedido de verdad:<br>• **canal nuevo «Menú web»** (`WEB`);<br>• **precios recalculados en el servidor** (lo que diga el navegador no cuenta);<br>• respeta el horario de cada plato, el límite de unidades (con un bloqueo para no vender de más entre dos pedidos simultáneos), el **stock** si el plato descuenta inventario, el **horario de la cocina** (cerrada = no recibe pedidos y dice cuándo abre) y el pedido mínimo;<br>• **busca o crea el cliente** por teléfono y guarda su dirección en su historial, así queda en Clientes;<br>• costo de domicilio de la configuración;<br>• **idempotencia**: el mismo envío dos veces crea un solo pedido.<br>Si algo cambió (precio, se agotó, cerró), no se crea el pedido y la página muestra exactamente qué cambió |
| **D5** | Opciones de la web | En el módulo:<br>• **Publicar en la web** y **Recibir pedidos** (apagado = solo menú, con el botón «Pedir por WhatsApp»);<br>• **Domicilio** y/o **Recoger**;<br>• **costo del domicilio** fijo y **pedido mínimo**;<br>• **formas de pago** aceptadas (efectivo contra entrega, transferencia con las instrucciones que escribas, por ejemplo tu Nequi);<br>• **confirmar automáticamente** (D6);<br>• un mensaje para el cliente (opcional).<br>Columnas nuevas en `dk_storefronts`: es la misma vitrina, sin tabla nueva |
| **D6** | «Entra solo a cocina» | **Confirmar automáticamente**, encendido por defecto: el pedido pasa por la **misma** confirmación de siempre (congela recetas, revisa y reserva stock, crea la comanda) y aparece en **Cocina** al instante.<br>Si no se puede confirmar (por ejemplo, falta stock que no se vio a tiempo), queda **Por confirmar**, marcado para revisar y con aviso, y al cliente se le dice «Recibido, te confirmamos».<br>Apagado: todos llegan a **Por confirmar**, como los de WhatsApp.<br>Para esto, la confirmación se separa en dos: la revisión de permisos (igual que hoy) y el paso interno, que reutilizan la confirmación manual y la automática. **Una sola lógica de confirmación** |
| **D7** | El pedido: entrega y dirección | Columnas nuevas en `dk_orders`: **forma de entrega** (domicilio o recoger), **dirección**, **referencia** y un **código de seguimiento** público e imposible de adivinar. Las ve el personal en el pedido, en el tablero y en Despacho. Quien recoge no pasa por Despacho |
| **D8** | Seguimiento del cliente | Al pedir: pantalla de **«¡Pedido recibido!»** con el número, el resumen, el total, cómo pagar y un botón para escribirle al negocio por WhatsApp con el número del pedido.<br>Un enlace de **seguimiento** (`/menu/{cuenta}/pedido/{código}`) muestra el estado en vivo (Recibido → En preparación → Listo → En camino → Entregado; o Cancelado), consultando cada 15 s. Muestra solo el estado y el resumen del pedido |
| **D9** | La página pública | **Tema claro**, pensada para el celular, rápida:<br>• encabezado con el ícono y el nombre del negocio, la frase, el estado (abierto o cerrado) y **Compartir**;<br>• **categorías** en una barra fija;<br>• tarjetas de plato con foto, precio y estado, y «Agregar» con contador;<br>• **barra del carrito** fija («Ver pedido · 3 · $45.000»);<br>• carrito con notas por plato, subtotal, domicilio y **total**;<br>• formulario corto: nombre, celular, domicilio o recoger, dirección, pago y notas.<br>El carrito se guarda en el navegador (por cuenta y por día). Los totales son los mismos que calcula el servidor |
| **D10** | Compartir | En el módulo: el enlace con **Copiar**, **Compartir por WhatsApp** (mensaje listo con el menú del día y el enlace), **Ver la página** y un **código QR** para imprimir en el local o los empaques. El QR necesita una librería pequeña (`qrcode`, sin dependencias).<br>En la página pública, «Compartir» usa el compartir del celular o, si no hay, WhatsApp.<br>Al pegar el enlace en WhatsApp, la vista previa es la general de Quanela: una por negocio exige un servidor que hoy no tenemos y queda para después |
| **D11** | Seguridad | Funciones públicas mínimas (`dk_public_menu`, `dk_public_place_order`, `dk_public_order_status`), con permisos dados **a mano** y todo lo demás cerrado.<br>**Límites:** por teléfono (5 pedidos por hora), por dirección de red (20 por hora, con la IP que llega en la petición) y por cuenta (300 por hora). Un campo trampa contra robots, tamaños máximos (30 líneas, 50 unidades por línea, textos cortos) y teléfono válido.<br>Si hay abuso, se agrega Cloudflare Turnstile (ya se usa en el registro) |
| **D12** | Personal | El canal «Menú web» con su etiqueta en el tablero, la lista, el detalle y los filtros. Domicilio o recoger, y la dirección, en la tarjeta y en Despacho. Los pedidos web cuentan en Insights, Finanzas y Clientes como cualquier venta |
| **D13** | Ayuda | Artículo nuevo del Menú público, cambios en pedidos y despacho, y notas de versión. Copilot ya distingue ventas por canal. El manual no se toca |

## 3. Fases
| Fase | Qué |
|---|---|
| 1 · Base | Migración `dk_public_menu`:<br>• `WEB` en el tipo de canal;<br>• columnas de entrega y seguimiento en `dk_orders`;<br>• opciones de la web en `dk_storefronts`;<br>• `dk_public_menu_items(cocina)`: el menú de hoy con todas las reglas, una sola vez, usado por la página y por el pedido;<br>• `dk_public_menu`, `dk_public_place_order` y `dk_public_order_status`;<br>• la confirmación separada en revisión y paso interno;<br>• tabla de intentos (para los límites) con limpieza;<br>• permisos para anónimos, puestos a mano |
| 2 · Página pública | Rutas `/menu/:slug` y `/menu/:slug/pedido/:codigo`, fuera del inicio de sesión. Menú, categorías, carrito, pedido, confirmación y seguimiento. Lógica pura (carrito, totales, disponibilidad) en `lib/` con pruebas |
| 3 · Módulo y personal | **Menú público** en el menú: vista previa de hoy, publicar, recibir pedidos, opciones, enlace, QR y compartir. El canal y la entrega en el tablero, la lista, el detalle y Despacho |
| 4 · Ayuda | Artículo, notas y despliegue de `dk-copilot` (ayuda) |
| — | **Validación:**<br>• **SQL:** solo los platos de hoy; precio promocional; horario; límite (incluido el de dos pedidos casi al mismo tiempo); agotado; cuenta sin publicar o sin pedidos; cocina cerrada; pedido mínimo; domicilio; precios del navegador ignorados; idempotencia; límites por teléfono y por red; cliente encontrado o creado con su dirección; confirmación automática → **comanda en Cocina**, reserva y número; sin stock → por confirmar y marcado; seguimiento; un anónimo no lee nada más; aislamiento entre cuentas.<br>**Vitest:** carrito y totales.<br>**Navegador:** la página pública sin sesión (en celular), un pedido de prueba que aparece en Cocina (con tu sesión) y su seguimiento.<br>**Además:** `tsc`, `oxlint` y builds |

## 4. Riesgos
| Riesgo | Mitigación |
|---|---|
| Pedidos falsos que llegan a cocina | Límites por teléfono, por red y por cuenta; campo trampa; confirmación automática apagable; Turnstile si hace falta. Cada pedido queda con su cliente y su teléfono, y se puede cancelar como cualquier otro |
| Vender de más (límite, stock) | Las reglas se aplican en el servidor, con bloqueo por cuenta al crear. El stock se reserva al confirmar, como siempre |
| Precios manipulados | El servidor calcula todo. Lo que manda el navegador solo dice qué plato y cuántos |
| Una función pública expone datos | Solo lo del menú (nombre, precio, foto, descripción, categoría) y el estado del propio pedido con su código. Nada de costos, clientes ni otros pedidos. Pruebas de lo que un anónimo puede y no puede leer |
| Cambiar el identificador rompe enlaces compartidos | La pantalla lo advierte en General y en Menú público |
| La vista previa en WhatsApp es genérica | Documentado. Una por negocio queda para después (requiere servidor) |

## 5. Resultados (2026-10-11)
| Fase | Qué quedó |
|---|---|
| 1 · Base | Cuatro migraciones aplicadas; antes de cada una se revisó que fuera la única pendiente.<br>**`20261011130000_dk_order_channel_web`:** el valor `WEB`, solo, porque un valor nuevo de enum no se puede usar en la misma transacción.<br>**`20261011140000_dk_public_menu`:**<br>• opciones `web_*` en `dk_storefronts` (la misma vitrina de Consumer);<br>• `fulfillment`, `delivery_address`, `delivery_reference` y `public_token` en `dk_orders`, con índice de idempotencia;<br>• `dk_public_order_attempts`, para los límites;<br>• **una sola confirmación:** `dk_confirm_order_internal`, que usan la confirmación del personal (`dk_confirm_order`, con sus permisos) y la automática;<br>• `dk_public_menu_items`: el menú de hoy con todas las reglas, usado por la página **y** por el pedido;<br>• `dk_public_menu`, `dk_public_place_order` (precios del servidor, horario del plato, límite con bloqueo por cuenta, stock, horario de la cocina, mínimo, cliente y dirección, idempotencia, límites, campo trampa y confirmación automática con caída a «Por confirmar» marcado) y `dk_public_order_status`;<br>• `dk_public_menu_settings` y `dk_public_menu_settings_save` para el personal.<br>**`20261011150000_dk_order_pickup`:** `dk_mark_picked_up`, de LISTO a ENTREGADO, solo para recoger.<br>(La aplicación de esta última se quedó colgada: se comprobó en la base que quedó registrada y se detuvo el proceso.)<br>**Datos reales:** nada publicado, 0 pedidos web y 0 intentos |
| 2 · Página pública | Rutas `/menu/:slug` y `/menu/:slug/pedido/:token`, fuera del inicio de sesión, abiertas en los subdominios (`OPEN_PATHS`) y en su propio paquete (19 kB).<br>• Tema claro: encabezado con ícono, frase, estado y Compartir; categorías fijas; tarjetas con foto, promoción tachada, «Quedan 3», «Desde las 3:00 p. m.» y «Agotado»;<br>• barra «Ver pedido»; carrito con notas por plato, subtotal, domicilio y total; formulario corto;<br>• errores con qué cambió;<br>• sin pedidos habilitados, «Pedir por WhatsApp»;<br>• seguimiento en vivo cada 15 s.<br>Lógica pura en `lib/cart.ts`. Ayudante común `shared/utils/whatsapp.ts` |
| 3 · Módulo y personal | **Menú público** en el menú (`/public-menu`, `storefront.manage`):<br>• publicar o despublicar;<br>• enlace con Copiar, Compartir por WhatsApp (mensaje con los platos de hoy) y Ver la página;<br>• **QR** con `qrcode-generator@2.0.4` (sin dependencias), descargable en SVG;<br>• opciones de pedido;<br>• «Hoy en tu página»;<br>• avisos de lo que falta (WhatsApp, horario, menú de hoy).<br>**Pedidos:** canal «Menú web»; `orderAddress()` en la tarjeta, el detalle, el diálogo de despacho y Despacho; «Entregar (recoge)» en lugar de «Despachar» |
| 4 · Ayuda | Artículo `public-menu`, cambios en `create-order` y notas de versión. `dk-copilot` desplegada. El manual no se tocó |

**Validación:**
- SQL `public_menu` **50/50**:
  - solo los 6 platos programados hoy;
  - promoción con el precio normal;
  - disponibilidad: agotado, más tarde, quedan 2;
  - categorías en el orden del planificador;
  - **nunca el costo ni la receta**;
  - cuenta sin publicar o dirección inexistente;
  - **precios del navegador ignorados** (13.000 = 2 × 5.000 + 3.000);
  - confirmado solo, con **comanda en Cocina**;
  - idempotencia;
  - límite (más de los que quedan, los que quedan, ya no quedan), horario del plato, agotado y plato fuera del menú;
  - stock: 450 g contra 400; 2 sí; reserva de 300 g;
  - mínimo, dirección, forma de pago, celular inválido y campo trampa;
  - recoger sin domicilio;
  - sin receta: queda en Por confirmar, marcado;
  - cliente creado una vez con su dirección;
  - nota del plato para la cocina;
  - seguimiento con código (un código inventado no muestra nada);
  - límite de 5 por celular;
  - cocina cerrada (no recibe y la página lo dice);
  - sin pedidos;
  - sin confirmación automática;
  - entregar para recoger, y uno a domicilio que no;
  - un anónimo no lee pedidos, clientes ni vitrinas ni usa las funciones internas;
  - otra cuenta no confirma.
- Con las migraciones siguen en verde: `dishes_without_recipe`, `finance`, `multikitchen_isolation`, `consumer_public`, `orders_search`, `copilot_tools`, `insights`, `order_payments`, `notifications`, `customer_360` y `customers_list`.
- Vitest **738**:
  - `cart.test` (carrito, totales, qué cambió, etiquetas, horario, mensaje, enlace de WhatsApp);
  - `PublicMenuPage.test` (página, pedido de punta a punta, plato agotado entretanto, sin pedidos por WhatsApp, sin publicar).
- `tsc`, `oxlint` (13 avisos, los mismos) y los dos builds.
- **Navegador:**
  - en celular (iPhone 13) con las 3 funciones públicas simuladas, sin tocar la base: menú, carrito, datos, pedido y seguimiento, sin errores ni desplazamiento lateral;
  - con la base real y sin sesión, `/menu/dark-kitchen-1` dice «Este menú no está disponible» (no está publicado).
- **Pendiente:** publicar y hacer un pedido de prueba real que aparezca en Cocina. Es una acción sobre tus datos y no se hizo sin tu permiso.

