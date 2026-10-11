# ADR 0055: WhatsApp e Integraciones — notificaciones de pedidos y pedidos por WhatsApp

## Estado
**Aprobado e implementado (2026-10-11).**

**Pedido:** un módulo **WhatsApp e Integraciones** en el que cada cuenta conecte **su propio número oficial** (WhatsApp Business Platform, Cloud API de Meta) y gestione mensajes y notificaciones, sin interferir con la arquitectura actual.
- **Primero:** avisos salientes cuando cambia el estado de un pedido, probados de extremo a extremo.
- **Después y opcional:** recibir pedidos por WhatsApp con IA que **interpreta pero no inventa**, con contexto de la conversación, integrado con **n8n** y reutilizando el modelo actual de pedidos.

---

## 1. Auditoría
| Hoy | Consecuencia |
|---|---|
| **Pedidos:**<br>• estados `NUEVO → CONFIRMADO → EN_PREPARACION → LISTO → DESPACHADO → ENTREGADO` y `CANCELADO`; canales `MANUAL`, `WHATSAPP` (reservado desde ADR 0006), `PHONE` y `WEB`;<br>• **cada** RPC que cambia el estado (confirmar, cocina, revertir, despachar, entregar, entregar en local, cancelar) escribe una fila en **`dk_order_status_history`**;<br>• no hay disparador sobre el estado | **Un solo punto de enganche:** un disparador `AFTER INSERT` en `dk_order_status_history`. Ningún RPC de pedidos ni de cocina cambia |
| **Clientes:**<br>• `dk_customers.phone` y `whatsapp_id`, normalizados a E.164 y únicos por cuenta;<br>• **no hay consentimiento** para recibir mensajes | WhatsApp exige **aceptación** (opt-in) para mensajes que inicia el negocio. Hay que guardarla, junto con la baja (opt-out) |
| **Pedidos públicos:**<br>• `dk_public_place_order` (ADR 0052) es el camino seguro: precios del servidor, disponibilidad, límites, stock, horario, mínimo, idempotencia, límite de intentos y autoconfirmación;<br>• está **fijo al canal WEB**;<br>• el seguimiento (`dk_public_order_status`) solo funciona para WEB | Los pedidos por WhatsApp **reutilizan ese mismo núcleo**, extraído a una función interna con el canal como parámetro. El seguimiento se abre a todo pedido que reciba avisos |
| **Ruta anterior de n8n** (documentada, sin construir):<br>• `dk_create_conversational_order` con un usuario de servicio Caja;<br>• no aplica franjas horarias, límites ni domicilio | Se mantiene, pero **no** es la ruta de pedidos de la IA. n8n usará el núcleo nuevo (abajo) |
| **Cocina** consulta pedidos cada 15 s (sin realtime) | Un pedido de WhatsApp es un pedido más (canal WhatsApp): la cocina **no cambia** |
| **Infraestructura:**<br>• `pg_cron` ya se usa;<br>• `pg_net` está **disponible pero apagado**;<br>• **`supabase_vault` está instalado** (sin uso);<br>• no hay cola, outbox ni webhooks;<br>• ninguna Edge Function es pública (`verify_jwt`) | Hace falta una **cola de salida (outbox)**, un **despachador**, un **webhook** público con firma y **Vault** para las credenciales de cada cuenta |
| **IA** (ADR 0014 y 0054): Anthropic, modelo del catálogo, cuota con `dk_ai_run_reserve`, que depende del **usuario** que llama | Un mensaje de WhatsApp no tiene usuario: hace falta una variante de reserva **para el sistema**, solo para el rol de servicio, con la misma cuota del plan |
| **Asistente de Consumer** (ADR 0042 y 0046): `runTurn` con estado de conversación e intención por IA (solo búsqueda; sin carrito ni pedido) | Se reutiliza su enfoque (la IA devuelve una **intención estructurada** y nunca ve precios para inventarlos) y sus piezas de texto. El carrito y el pedido son nuevos |
| **Permisos:** no existe `integrations.*`. **Configuración → Integraciones** solo muestra el ID de la cuenta | Permisos nuevos y un **módulo propio** en el menú. Configuración → Integraciones enlaza al módulo |

## 2. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Proveedor | **WhatsApp Business Platform, Cloud API de Meta, directa:** sin intermediarios, al costo de Meta y con el número oficial del negocio. Las llamadas a Graph van en un adaptador (`_whatsapp/meta.ts`) con la versión en una variable (`DK_META_GRAPH_VERSION`), para cambiar de proveedor sin tocar el resto |
| **D2** | Cómo conecta cada cuenta su número | **v1 «App propia»:** la cuenta pega, en el módulo:<br>• **Phone Number ID**;<br>• **WABA ID**;<br>• **token permanente** de un usuario del sistema;<br>• **App Secret** de su app de Meta.<br>Quanela le da la **URL del webhook** (una sola para todas las cuentas) y un **token de verificación** propio. Los secretos se guardan en **Supabase Vault**; la app y el navegador **nunca** los vuelven a leer (se muestra «Configurado · …1234»). El botón **Probar conexión** lee el número en Graph y muestra nombre, calidad y estado.<br>**Después (fuera de esta entrega):** registro integrado de Meta (Embedded Signup) con una app de Quanela, que requiere que Quanela sea Tech Provider |
| **D3** | Seguridad de credenciales | • **Vault:** cada secreto es un `vault.secrets`, y la cuenta guarda solo su id.<br>• **Lectura:** solo funciones `SECURITY DEFINER` que se otorgan **únicamente** al rol de servicio, para el despachador y el webhook.<br>• **Navegador:** ninguna RPC del navegador devuelve secretos.<br>• **Cambios:** cambiar o desconectar reemplaza o borra el secreto, y queda en auditoría.<br>• **Yo no escribo ninguna credencial:** la ingresa el dueño en la app, o tú, en las variables de la plataforma |
| **D4** | Avisos salientes (fase A) | **Disparador** en `dk_order_status_history` → **`dk_wa_outbox`**, una fila por aviso, en la misma transacción. Encola solo si:<br>• la cuenta tiene WhatsApp **conectado** y el aviso de ese estado **activo**;<br>• el cliente tiene celular y **aceptó** recibir avisos;<br>• no hay ya un aviso de ese pedido y ese estado (no duplica).<br>Después del commit, **`pg_net`** avisa al **despachador** (`dk-whatsapp-dispatch`), que envía la plantilla con Graph. `pg_cron` revisa cada minuto los pendientes y reintenta con espera creciente (5 intentos). Los estados `en cola → enviado → entregado → leído` o `fallido` (con el código de Meta) llegan por el webhook.<br>**El cambio de estado del pedido nunca espera a WhatsApp ni falla por WhatsApp** |
| **D5** | Qué avisos y con qué texto | Por estado, cada uno activable:<br>• **Confirmado** («recibimos tu pedido #123…»);<br>• **En preparación** (apagado por defecto);<br>• **Listo**, con un texto para recoger y otro para domicilio;<br>• **En camino**;<br>• **Entregado** (apagado por defecto);<br>• **Cancelado**, con el motivo si se escribió.<br>Fuera de las 24 h de conversación, Meta solo permite **plantillas aprobadas** (categoría «utilidad»). El módulo trae las **plantillas sugeridas** en español, con variables (nombre, número de pedido, negocio y enlace de seguimiento), y el botón **Crear plantillas en Meta**, que las envía a la WABA con su token y luego sincroniza si quedaron **aprobadas**. También se puede asignar a cada estado una plantilla propia ya aprobada |
| **D6** | Consentimiento | Columnas nuevas en `dk_customers`: `whatsapp_opt_in`, `whatsapp_opt_in_at`, `whatsapp_opt_out_at` y `whatsapp_opt_in_source` (`web`, `whatsapp`, `staff`).<br>• **Menú público:** casilla «Recibir el estado de mi pedido por WhatsApp», que el cliente marca.<br>• **Quien escribe al WhatsApp del negocio** acepta implícitamente para ese pedido.<br>• **El personal** puede marcarlo en la ficha del cliente («el cliente lo pidió»).<br>• **«BAJA» o «STOP»** por WhatsApp lo da de baja al instante, y queda registrado |
| **D7** | Seguimiento | Los avisos llevan el enlace de **seguimiento** de ADR 0052 (`/menu/{cuenta}/pedido/{token}`). Hoy solo existe para pedidos WEB: se crea el token al primer aviso y `dk_public_order_status` acepta cualquier pedido con token. El resto no cambia |
| **D8** | Webhook único | **`dk-whatsapp-webhook`**, público (`verify_jwt = false`):<br>• `GET`: verificación de Meta, con el token de verificación de la cuenta (guardado como hash);<br>• `POST`: valida la firma **`X-Hub-Signature-256`** con el App Secret de la cuenta dueña del `phone_number_id`, y procesa los estados de los mensajes y los mensajes entrantes.<br>Responde 200 enseguida. Es idempotente por `wamid`. Lo que no es de una cuenta conectada se ignora y se registra |
| **D9** | n8n | Tres puntos, todos **opcionales** y por cuenta:<br>1. **Eventos a n8n:** la cuenta registra la URL de su webhook de n8n. Quanela le envía, firmados con **HMAC-SHA256** (secreto que genera la base y se muestra una vez), `order.status_changed`, `whatsapp.message.received` y `whatsapp.message.status`. Usa la misma cola, con reintentos.<br>2. **n8n envía WhatsApp sin tener el token de Meta:** el usuario de servicio Caja (ruta documentada) llama `dk_wa_send_text` y `dk_wa_send_template`; Quanela envía con la credencial de la cuenta y deja registro.<br>3. **n8n atiende los pedidos:** en modo «n8n», los mensajes entrantes van a n8n en lugar de a la IA de Quanela, y n8n crea el pedido con **`dk_wa_place_order`**, el mismo núcleo validado de la fase B.<br>Se entregan **workflows de ejemplo importables** (JSON) y la guía actualizada |
| **D10** | Pedidos por WhatsApp (fase B, opcional) | Modo por cuenta: **Apagado** (los mensajes llegan a la bandeja), **IA de Quanela** o **n8n**.<br>**La IA interpreta y no inventa:**<br>• devuelve solo **intenciones estructuradas** (agregar, quitar, cantidad, nota, domicilio o recoger, dirección, pago, confirmar, cancelar, hablar con una persona, pregunta);<br>• cada plato se busca en el **menú real de hoy** (`dk_public_menu_items`: disponibilidad, horario y límite), y si no hay coincidencia clara **pregunta**, nunca supone;<br>• **los precios, el total, el domicilio y el mínimo los calcula la base**;<br>• antes de crear el pedido envía el **resumen con el total del servidor** y pide un **«sí»** explícito;<br>• el pedido se crea con `dk_wa_place_order`, que es **el mismo núcleo de `dk_public_place_order`** (extraído a `dk_place_order_internal(kitchen, payload, channel)`) con canal `WHATSAPP`, idempotente por `wamid`, el cliente identificado por su número y las mismas reglas de domicilio, pago, horario y autoconfirmación de la cuenta.<br>**Contexto:** `dk_wa_conversations` (una por cliente y cuenta: carrito, paso, dirección y ventana de 24 h) más los últimos mensajes de `dk_wa_messages`. La conversación expira a las 4 h sin actividad.<br>**Persona humana:** si el cliente lo pide, si la IA duda dos veces o si hay un problema, la conversación pasa a **«Necesita atención»**, la IA calla y el personal responde desde la **bandeja** del módulo |
| **D11** | Cupo de IA | Función nueva **`whatsapp_ordering`** en el catálogo (IA, Haiku 5.5 por defecto, por velocidad y costo; la plataforma la cambia). La reserva de cuota para el sistema es `dk_ai_run_reserve_system(kitchen, feature)`, solo para el rol de servicio, con el **mismo cupo diario del plan**. Si se acaba, la conversación pasa a una persona con un mensaje amable |
| **D12** | Datos y RLS | Tablas nuevas `dk_wa_accounts`, `dk_wa_templates`, `dk_wa_outbox`, `dk_wa_messages`, `dk_wa_conversations` y `dk_integration_endpoints` (n8n), todas por cuenta.<br>• **Lectura:** RLS con `integrations.view`.<br>• **Escritura:** solo por RPC (`integrations.manage`) o por el rol de servicio.<br>• **Mensajes:** se guardan sus textos (para la bandeja y el contexto), y la base borra sola los que tienen más de **90 días**.<br>• **Aislamiento:** pruebas con dos cuentas |
| **D13** | Permisos y función | **Permisos nuevos:**<br>• `integrations.view`: ver el módulo, los mensajes y el registro;<br>• `integrations.manage`: conectar, configurar plantillas, avisos y n8n;<br>• `whatsapp.reply`: responder desde la bandeja.<br>ADMIN y MANAGER los tienen; Caja tiene `whatsapp.reply`.<br>**Funciones del catálogo:** `whatsapp_notifications` (general) y `whatsapp_ordering` (IA), en los planes Business y Enterprise (el Enterprise ya promete «Integraciones (pedidos por WhatsApp con n8n)») |
| **D14** | Interfaz | Módulo **WhatsApp e Integraciones** en el menú, con pestañas:<br>• **Conexión:** pasos guiados, con la URL del webhook, el token de verificación, *Probar conexión* y un modo **Prueba** que envía solo a números autorizados;<br>• **Avisos:** cada estado con su plantilla, el estado de aprobación en Meta, una vista del mensaje y *Enviar prueba*;<br>• **Mensajes:** la bandeja de conversaciones, con «Necesita atención» y respuesta dentro de las 24 h;<br>• **Registro:** cada aviso con su estado y su error;<br>• **Pedidos por WhatsApp:** modo, horario y reglas;<br>• **n8n:** webhook, eventos, secreto, prueba y guía.<br>Configuración → Integraciones enlaza aquí, y la ficha del cliente muestra y cambia su consentimiento |
| **D15** | Pruebas de extremo a extremo | Contra **Meta no puedo probar sin tus credenciales**. Por eso:<br>• **Pila local:** levanto **Supabase local en Docker** (`supabase start`) solo durante las pruebas, con:<br>&nbsp;&nbsp;– un **simulador de Graph de Meta** (servidor local que recibe los envíos y devuelve los webhooks de estado firmados);<br>&nbsp;&nbsp;– un **simulador de n8n** (recibe y verifica la firma);<br>&nbsp;&nbsp;– un **simulador del modelo de IA**.<br>• **Flujo:** cambio de estado → disparador → `pg_net` → despachador → «Meta» → webhook de estado → «entregado» en la base. Lo mismo para un pedido entrante completo por WhatsApp.<br>• **Al terminar,** apago la pila local; tu base real no recibe datos de prueba.<br>• **La prueba real con Meta,** con tu número de prueba, queda como lista de pasos para ti |

## 3. Fases
| Fase | Qué |
|---|---|
| **A1 · Conexión y avisos (base)** | Migración `dk_whatsapp_notifications`:<br>• permisos y funciones del catálogo;<br>• `pg_net`;<br>• `dk_wa_accounts` con Vault;<br>• consentimiento en clientes;<br>• `dk_wa_templates`, `dk_wa_outbox` y `dk_wa_messages` (solo salientes por ahora);<br>• disparador del historial;<br>• token de seguimiento para todos los avisados;<br>• RPC de conexión y configuración;<br>• `pg_cron` de reintentos y limpieza.<br>Pruebas SQL: encolado por estado, sin duplicar, consentimiento, baja, aislamiento, permisos, secretos no legibles y los pedidos y la cocina sin cambios |
| **A2 · Despachador y webhook** | `_whatsapp/` (adaptador de Meta, firma y plantillas), `dk-whatsapp-dispatch` y `dk-whatsapp-webhook` (estados). Pruebas Vitest del contrato |
| **A3 · Interfaz** | Módulo con las pestañas Conexión, Avisos y Registro; casilla de aceptación en el menú público; consentimiento en la ficha del cliente |
| **A4 · Extremo a extremo** | Pila local con los simuladores y el flujo completo de un pedido de punta a punta. **Hasta aquí, la recepción de pedidos actual no cambia** |
| **B1 · Recepción** | Migración `dk_whatsapp_ordering`:<br>• `dk_place_order_internal` (extraído **sin cambiar el comportamiento** de `dk_public_place_order`: sus 50 pruebas deben seguir pasando);<br>• `dk_wa_place_order`;<br>• `dk_wa_conversations`;<br>• entrantes en `dk_wa_messages`;<br>• `dk_ai_run_reserve_system`;<br>• bandeja y respuesta;<br>• `dk_integration_endpoints`.<br>Pruebas SQL |
| **B2 · IA conversacional** | `_whatsapp/agent.ts` (intenciones estructuradas con la herramienta y la búsqueda en el menú real, sin inventar), el carrito y la confirmación; el modo n8n (reenviar), y `dk_wa_send_text` / `dk_wa_send_template` para n8n. Pruebas Vitest con el modelo simulado: plato inexistente → pregunta; precio inventado → ignorado; «sí» → pedido; «BAJA» → baja; «hablar con alguien» → bandeja |
| **B3 · Interfaz y n8n** | Pestañas Mensajes, Pedidos por WhatsApp y n8n; workflows de ejemplo y guía `docs/integrations/` |
| **B4 · Extremo a extremo** | La pila local con la conversación completa hasta el pedido en cocina, y el modo n8n |
| **C · Cierre** | Artículo de ayuda, notas de versión, `dk-copilot` y la guía de **configuración de Meta y n8n**: variables de entorno, URL del webhook, permisos de la app de Meta (`whatsapp_business_messaging`, `whatsapp_business_management`) y suscripción a `messages`. Resultados en este ADR |

## 4. Variables de entorno (las configuras tú; yo no escribo secretos)
| Variable | Dónde | Para qué |
|---|---|---|
| `DK_META_GRAPH_VERSION` | Edge Functions (opcional, por defecto `v23.0`) | La versión de Graph |
| `DK_ANTHROPIC_API_KEY` | Ya existe | IA de pedidos (fase B) |
| `SUPABASE_SERVICE_ROLE_KEY` | Ya la tienen las funciones | El despachador y el webhook (no hay usuario) |
| Por cuenta, en la app | Vault | Token de Meta, App Secret y secreto de n8n |

`pg_net` llama al despachador con la clave **pública** del proyecto (la misma del navegador). El despachador solo procesa la cola, es idempotente y bloquea filas, así que no hace falta otro secreto.

## 5. Riesgos
| Riesgo | Mitigación |
|---|---|
| Romper pedidos o cocina | • Ningún RPC de pedidos cambia en la fase A, solo un disparador en el historial que **nunca** lanza errores (si algo falla, el aviso queda «fallido»).<br>• En la fase B, el núcleo extraído se valida con las 50 pruebas actuales.<br>• La cocina no se toca |
| Mensajes no deseados o bloqueo del número por Meta | Consentimiento explícito, baja inmediata, solo plantillas «utilidad» aprobadas, sin duplicados y modo Prueba |
| Filtración de tokens | Vault, solo rol de servicio, nunca devueltos al navegador, firma del webhook y auditoría |
| La IA inventa platos o precios | Intenciones estructuradas, búsqueda en el menú real, precios del servidor, confirmación con el total real y paso a una persona ante dudas |
| Costos (Meta y la IA) | Avisos configurables por estado, cupo de IA del plan y Haiku por defecto |
| Meta cambia la API | Adaptador único y versión en una variable |

## 6. Resultados (2026-10-11)

### Migraciones (aplicadas, en orden)
| Migración | Qué |
|---|---|
| `20261011180000_dk_whatsapp_notifications` | **Avisos y base:**<br>• `pg_net`;<br>• permisos `integrations.view`, `integrations.manage` y `whatsapp.reply`;<br>• función `whatsapp_notifications`;<br>• `dk_platform_settings`;<br>• consentimiento en `dk_customers`;<br>• tablas `dk_wa_accounts` (secretos en Vault), `dk_wa_templates` (catálogo de 7 plantillas de utilidad) y `dk_wa_outbox`;<br>• disparador en `dk_order_status_history`;<br>• `dk_wa_kick`, `claim`, `mark`, `apply_status`, webhook, credenciales y RPC de configuración;<br>• `dk_place_order_internal` (el núcleo de `dk_public_place_order`, extraído con el canal como parámetro y `whatsappOptIn`);<br>• seguimiento para todo pedido con código;<br>• `pg_cron` |
| `20261011180100_dk_public_menu_whatsapp_notices` | El menú público dice si el negocio avisa por WhatsApp, para mostrar la casilla de aceptación |
| `20261011190000_dk_whatsapp_ordering` | **Pedidos y n8n:**<br>• función `whatsapp_ordering` (Haiku 5.5), con **cupo propio** (`wa_ai_turns_per_day`, 400 por defecto; 20 turnos cada 10 min por conversación) y fuera del cupo general;<br>• tablas `dk_wa_conversations` y `dk_wa_messages`;<br>• `dk_integration_endpoints` (secreto en Vault) y eventos firmados en la misma cola;<br>• `dk_wa_receive` (BAJA y ALTA), `dk_wa_ai_context`, `dk_wa_place_order` (núcleo con canal WhatsApp, idempotente por wamid) y `dk_wa_reply_internal` (ventana de 24 h);<br>• para el equipo y n8n: `dk_wa_send_text`, `dk_wa_set_conversation`, `dk_wa_place_order_for` y `dk_wa_send_template`;<br>• `dk_integration_*`;<br>• índice de idempotencia WhatsApp;<br>• limpieza a los 90 días |
| `20261011190100_dk_place_order_repeated_totals` | El pedido repetido responde con su total real (lo encontró la prueba de extremo a extremo) |

### Funciones (desplegadas)
| Función | Qué hace |
|---|---|
| `_whatsapp/meta.ts` | Adaptador de Graph: mensajes, errores, firma, webhook y plantillas |
| `_whatsapp/agent.ts` | El asistente: herramienta con los platos como lista cerrada, `cleanIntents`, el turno completo y los textos |
| `_whatsapp/llm.ts` | La llamada a Anthropic |
| `dk-whatsapp-dispatch` | Envía la cola: WhatsApp y n8n |
| `dk-whatsapp-webhook` | Verifica la firma, aplica los recibos, recibe los mensajes y ejecuta el asistente con `waitUntil` y espera para juntar mensajes |
| `dk-whatsapp-admin` | Probar la conexión, crear y sincronizar plantillas |

### Interfaz
• Módulo **WhatsApp** (`/integrations`) con las pestañas Mensajes, Conexión, Avisos, Pedidos por WhatsApp, n8n y Registro. Caja solo ve Mensajes.<br>• Casilla de aceptación en el carrito del menú público.<br>• Consentimiento en la ficha del cliente.<br>• Enlace desde Configuración → Integraciones.

### Pruebas
- **SQL:** 1401/1401 en total. Nuevas: `whatsapp_notifications` 51 y `whatsapp_ordering` 60. `public_menu` sigue 50/50 con el núcleo extraído.
- **Vitest:** 797/797. Nuevas: adaptador de Meta (7) y asistente (10, con modelo simulado).
- **De extremo a extremo** (Supabase local y simuladores de Meta, del modelo y de n8n; arnés en `supabase/e2e/whatsapp/`):
  - **Fase A:** 18/18.
  - **Fase B:** 21/21.
- **Navegador:** el módulo con datos locales; capturas en `docs/qa/whatsapp/`.
- **Además:** `tsc`, typecheck de Deno, `oxlint` (13, los de siempre), builds. Las funciones desplegadas rechazan peticiones sin firma (403) y sin sesión (401).

### Guías
`docs/integrations/whatsapp-meta-n8n.md` (Meta, n8n, variables y pruebas) y flujos de ejemplo `docs/integrations/n8n/*.json`. El artículo de ayuda `whatsapp` y las notas de versión.

### Pendiente con credenciales reales
- **Meta:** conectar un número, aprobar las plantillas, hacer un pedido con aceptación y una conversación real con el asistente. Los pasos están en la guía.
- **Tu n8n:** importar los flujos. El MCP de n8n quedó registrado, pero no estaba cargado en esta sesión.
