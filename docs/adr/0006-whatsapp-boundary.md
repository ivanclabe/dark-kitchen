# ADR 0006 — Límite de integración con WhatsApp en esta fase

## Estado
Aceptado (propuesto para aprobación del usuario)

## Contexto
El negocio recibe pedidos hoy principalmente por WhatsApp (manual, un humano lee el chat y digita el pedido en el sistema). La integración directa (webhook/API de WhatsApp) es explícitamente Fase 9, fuera de alcance ahora — pero el esquema y los servicios deben poder recibir esa integración sin una reescritura del núcleo de pedidos.

## Decisión
No se implementa ninguna integración de WhatsApp ahora. Se reservan, desde ya, los puntos de extensión de bajo costo:

- `dk_orders.channel` (`MANUAL` | `WHATSAPP` | `PHONE`) y `dk_orders.external_reference`.
- `dk_customers.whatsapp_id` (único, nullable).
- El servicio de pedidos (`OrderService`) se diseña con una interfaz agnóstica al canal desde la Fase 5 (Pedidos), no se retrofitea después.

No se crean tablas `dk_whatsapp_*` todavía: se diseñarán en Fase 9 cuando se conozca el proveedor exacto (WhatsApp Business API directa vs. un proveedor como Twilio/360dialog), porque el modelo de conversación/mensaje depende de esa elección.

## Consecuencias
- (+) Cero deuda técnica de esquema cuando llegue la Fase 9.
- (+) El core de pedidos no necesita cambios de código, solo un nuevo "adaptador" de entrada.
- (−) Se agregan 2-3 columnas hoy que no se usan hasta Fase 9 (costo mínimo, justificado).
