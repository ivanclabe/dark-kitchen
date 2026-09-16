# Integración conversacional (WhatsApp → n8n → Supabase → Dark Kitchen)

Este documento describe cómo el futuro workflow de n8n debe consumir esta aplicación. **Nada de WhatsApp ni de Anthropic vive dentro de React** — esta app y Supabase son la fuente de verdad operacional; n8n es quien orquesta la conversación.

Ver también: `docs/adr/0006-whatsapp-boundary.md` (decisión original que reservó `channel`/`external_reference`/`whatsapp_id`) y `docs/audit/menu-semanal-n8n-integration-audit-2026-09.md` (auditoría de esta iteración).

## 1. Arquitectura

```
CLIENTE → WHATSAPP → N8N
                       ├── WhatsApp nodes
                       ├── Anthropic API
                       ├── Supabase (lectura del menú, RPCs de pedido)
                       └── lógica de conversación / contexto
                       ↓
                    SUPABASE (fuente de verdad)
                       ↓
              DARK KITCHEN APP (React) → KDS / COCINA
```

React **nunca** llama a WhatsApp ni a Anthropic. n8n **nunca** guarda su propia copia de productos/precios/disponibilidad — siempre consulta Supabase en el momento.

## 2. Responsabilidades por componente

| Componente | Responsable de |
|---|---|
| **React + Supabase** (esta app) | Catálogo, precios, menú semanal, clientes, pedidos, inventario, cocina/KDS, reportes — **fuente de verdad operacional única** |
| **n8n** | Orquestación, integración WhatsApp, contexto de conversación, llamadas a Supabase y a Anthropic, coordinación del flujo del pedido |
| **Anthropic** | Comprensión de lenguaje natural, conversación, extracción estructurada, generación de respuestas — **nunca** fuente de verdad |
| **WhatsApp** | Canal de comunicación con el cliente |
| **Supabase** | Persistencia, disponibilidad real, precios reales, clientes, pedidos |

## 3. Credenciales que necesita n8n

**No usar la service role key.** Siguiendo `docs/adr/0005-rls-strategy.md` ("un futuro cliente API queda sujeto a las mismas reglas si actúa como un rol de servicio bien definido"), n8n se autentica como **un usuario más**, con rol `CASHIER` (ya tiene exactamente los permisos necesarios: pedidos RW, clientes RW, menú R — nada de inventario, recetas, reportes ni usuarios).

**Pasos de configuración (manuales, fuera de esta tarea):**
1. Crear una cuenta en el módulo Usuarios de la app (ej. "Asistente WhatsApp"), rol `CASHIER`, con un email y contraseña dedicados.
2. En n8n: credencial Supabase con `SUPABASE_URL` + **anon/publishable key** (no es secreta, ya está en el bundle de React) + email/contraseña de esa cuenta. n8n llama `supabase.auth.signInWithPassword()` una vez y reutiliza la sesión (renovándola cuando expire).
3. Ninguna key administrativa ni de service role sale de n8n. Ninguna credencial de WhatsApp/Anthropic vive en React.

## 4. Qué consulta n8n — `dk_today_menu` (vista)

Una sola llamada `GET`, sin lógica adicional del lado de n8n:

```
GET {SUPABASE_URL}/rest/v1/dk_today_menu?select=*&order=display_order
```

Respuesta (ejemplo, un martes):

```json
[
  { "product_id": "…", "product": "Arroz con pollo", "price": 18000, "description": "…", "category": "Fuertes", "display_order": 0, "available": true },
  { "product_id": "…", "product": "Pescado", "price": 22000, "description": null, "category": "Fuertes", "display_order": 1, "available": true }
]
```

Se recalcula sola en cada consulta (usa `CURRENT_DATE` del lado del servidor) — **nunca** hay que hardcodear qué día es ni qué hay cada día dentro de n8n o del prompt de Anthropic. Si un producto no aparece acá, no está disponible hoy — punto. No existe (ni debe inventarse) ningún camino para que Anthropic recomiende algo que no esté en esta lista.

**Nota importante**: esta vista es independiente del sistema de "Menú del día" que ya existía (`/menus/dia`, apagar un plato puntualmente para hoy). Ambos sistemas coexisten sin fusionarse en esta iteración — ver sección 2 de la auditoría. Si el negocio quiere que ambos se sincronicen, es un cambio de una próxima fase.

## 5. Qué puede ejecutar n8n — RPCs (todos vía `POST {SUPABASE_URL}/rest/v1/rpc/<nombre>`)

### `dk_find_or_create_customer_by_phone(p_phone, p_full_name)` → `uuid`
Busca por `phone` o `whatsapp_id`; crea si no existe. Nunca duplica. Útil al inicio de la conversación ("Hola María, ¿lo de siempre?").

### `dk_create_conversational_order(p_phone, p_customer_name, p_channel, p_external_reference, p_notes, p_items)` → `uuid` (id del pedido)
Crea el pedido en **borrador** (`NUEVO`). Resuelve/crea el cliente, y por cada ítem valida producto activo + disponible **hoy** (contra `dk_today_menu`) + cantidad > 0. **El precio siempre se resuelve del lado del servidor** desde `dk_products.price` — el payload no acepta un precio, aunque Anthropic lo mencione en la conversación.

```json
{
  "p_phone": "573001234567",
  "p_customer_name": "María González",
  "p_external_reference": "wamid.HBg...",
  "p_items": [
    { "product_id": "1e2b…", "quantity": 1, "observation": "sin ensalada" },
    { "product_id": "9ac0…", "quantity": 2 }
  ]
}
```
Devuelve el `uuid` del pedido. n8n debe volver a leer el pedido (`GET dk_orders?id=eq.<uuid>&select=*,dk_order_items(*)`, ya expuesto por PostgREST con RLS de `CASHIER`) para presentarle el resumen y el total al cliente antes de pedir confirmación — **nunca** confiar en el total que Anthropic haya calculado en la conversación.

### `dk_confirm_order(p_order_id)` — **ya existe, sin cambios**
Solo cuando el cliente dice "sí, confirmar". `NUEVO → CONFIRMADO`: reserva inventario (rechaza si no hay stock) y el pedido aparece de inmediato en el Kanban de Cocina — mismo flujo que un pedido manual, cero código nuevo en el KDS.

### `dk_cancel_order(p_order_id, p_reason)` — **ya existe, sin cambios**
Si el cliente se arrepiente antes de confirmar (o después).

## 6. Esqueleto conceptual del workflow (a construir en una fase posterior, no en esta tarea)

```
[WhatsApp Trigger]
        ↓
[Identify Customer]              → dk_find_or_create_customer_by_phone
        ↓
[Load Conversation Context]      → memoria de n8n (no Supabase)
        ↓
[Supabase — Get Today Menu]      → GET dk_today_menu
        ↓
[Anthropic Agent]                → conversa, recomienda SOLO del menú recibido
        ↓
[Build Order] (en memoria de n8n, mientras el cliente decide)
        ↓
[Ask Customer Confirmation]
        ↓ (cliente confirma)
[Supabase — Create Order]        → dk_create_conversational_order
        ↓
[Supabase — Confirm Order]       → dk_confirm_order
        ↓
[WhatsApp Confirmation]
```

## 7. Reglas que no se negocian

1. **Anthropic nunca inventa** productos, precios, disponibilidad ni promociones. Si no viene en la respuesta de `dk_today_menu`, no se ofrece.
2. **El precio nunca viaja desde n8n/Anthropic hacia la base de datos** — `dk_create_conversational_order` lo resuelve siempre del lado del servidor.
3. **n8n valida contra Supabase antes de crear**, aunque Anthropic ya haya "entendido" el pedido — el RPC es quien tiene la última palabra (producto existe, está activo, está disponible hoy).
4. **Un pedido de WhatsApp usa exactamente el mismo modelo** que uno manual (`dk_orders`/`dk_order_items`, `channel = 'WHATSAPP'`) — nunca una tabla paralela.
5. **No se crean clientes duplicados** — siempre buscar por teléfono primero.

## 8. Hallazgo de seguridad relacionado (no corregido en esta tarea)

Durante esta auditoría se encontró que varios RPC existentes (`dk_confirm_order`, `dk_cancel_order`, `dk_advance_kitchen_item`, etc.) usan `if dk_current_role() not in (...) then raise exception`, y en PL/pgSQL una condición `NULL` en un `IF` se trata como `false` — un usuario autenticado sin fila en `dk_users` bypasea la autorización silenciosamente. Es un problema preexistente, no introducido por esta tarea, y no bloquea la integración descrita acá (la cuenta de servicio `CASHIER` sí tiene una fila válida en `dk_users`). Se dejó como tarea aparte para corregirlo sin mezclar alcance.
