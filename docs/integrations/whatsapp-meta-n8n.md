# WhatsApp e Integraciones: configuración de Meta y n8n (ADR 0055)

Cada **cuenta** de Quanela conecta su **propio número oficial** de WhatsApp Business Platform, la Cloud API de Meta. Quanela se encarga de dos cosas:

- envía los **avisos de estado** de los pedidos;
- recibe los mensajes, que atiende el **equipo**, el **asistente de Quanela** o el **n8n** de la cuenta.

Los tokens de Meta y los secretos de firma se guardan en **Supabase Vault**. El navegador nunca los vuelve a ver.

> Antes había una integración solo documentada (`n8n-whatsapp-integration.md`), en la que n8n hablaba con WhatsApp directamente. **Esta la reemplaza:**
> - el número y el token viven en Quanela;
> - n8n recibe eventos firmados;
> - n8n actúa a través de Quanela (`dk_wa_send_text`, `dk_wa_place_order_for`), con las mismas reglas que el menú público.

---

## 1. Plataforma: variables de entorno (Supabase → Edge Functions → Secrets)

| Variable | Obligatoria | Para qué |
|---|---|---|
| `DK_ANTHROPIC_API_KEY` | Ya existe | El asistente de pedidos (fase B) |
| `QUANELA_APP_URL` | Recomendada (`https://quanela.com` si no está) | Base del enlace de seguimiento que llevan los avisos |
| `DK_META_GRAPH_VERSION` | No (`v23.0` por defecto) | Versión de la API Graph de Meta |
| `DK_META_GRAPH_TEST_URL` | No | Solo para pruebas: un simulador de Graph para cuentas en modo **Simulador** |
| `DK_ANTHROPIC_BASE_URL` | No | Solo para pruebas: un simulador del modelo |
| `DK_WA_DEBOUNCE_MS` | No (1500) | Tiempo para juntar mensajes seguidos antes de responder |

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya están en las funciones. **No hay otro secreto de plataforma:** `pg_net` despierta al despachador sin credenciales, porque el despachador solo vacía la cola.

**Funciones desplegadas:**

| Función | `verify_jwt` | Qué hace |
|---|---|---|
| `dk-whatsapp-webhook` | `false` | Recibe a Meta y verifica la firma `X-Hub-Signature-256` |
| `dk-whatsapp-dispatch` | `false` | Envía la cola: WhatsApp y eventos de n8n |
| `dk-whatsapp-admin` | `true` | Probar la conexión, crear y sincronizar plantillas |

**Tareas programadas (`pg_cron`):**
- `dk-wa-dispatch`: cada minuto, reintentos;
- `dk-wa-purge` y `dk-wa-purge-messages`: limpian lo que tiene más de 90 días.

## 2. Meta: lo que hace cada negocio, una vez

1. En **developers.facebook.com**, crea una app de tipo **Empresa** y agrégale el producto **WhatsApp**.
2. Agrega y verifica el número de WhatsApp Business. Copia el **Phone Number ID** y el **WhatsApp Business Account ID** (WABA).
3. En el **Business Manager** (Configuración del negocio → Usuarios del sistema):
   - crea un usuario del sistema;
   - asígnale la app y la WABA;
   - genera un **token permanente** con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`.
4. En la app, **Configuración → Básica**, copia la **clave secreta** (App Secret).
5. En Quanela, ve a **WhatsApp → Conexión**:
   - pega los cuatro datos y toca **Conectar**. Quanela verifica el número con Graph;
   - copia el **token de verificación**: se muestra una sola vez y se puede regenerar.
6. En Meta, ve a WhatsApp → Configuración → **Webhook**:
   - **URL:** `https://<proyecto>.supabase.co/functions/v1/dk-whatsapp-webhook`;
   - **Token de verificación:** el de Quanela;
   - **Campo:** suscríbete a **`messages`**.
7. En Quanela, ve a **WhatsApp → Avisos**:
   - toca **Crear plantillas en Meta**: son 7 plantillas de utilidad, en español, con ejemplos;
   - espera a que Meta las apruebe (minutos) y toca **Actualizar estado**.
8. Empieza en modo **Prueba**: solo les llegan avisos a los números autorizados. Cuando todo funcione, pasa a **Producción**.

**Errores frecuentes**

| Código de Meta | Qué significa |
|---|---|
| `131047` | Pasaron más de 24 h desde el último mensaje del cliente: solo se puede enviar una plantilla |
| `132001` | La plantilla no existe o no está aprobada en ese idioma |
| `131026` | El número no tiene WhatsApp |
| `190` | El token venció o fue revocado |
| `131030` | En la app de prueba de Meta, el destinatario no está en la lista permitida |

El **Registro** del módulo muestra el código y una explicación.

## 3. n8n (opcional)

1. Importa un flujo de ejemplo de `docs/integrations/n8n/`:
   - **`quanela-eventos.json`:** un Webhook con «Raw Body», que verifica la firma y separa los eventos;
   - **`quanela-pedidos-whatsapp.json`** (modo n8n): responde al cliente con el menú de hoy. La nota del flujo explica cómo crear el pedido.
2. En el nodo **Configuración**, pega:
   - el secreto `qns_…`;
   - la URL de Supabase;
   - la *publishable key*;
   - el ID de la cuenta;
   - el identificador del menú.
3. Para responder y crear pedidos, el flujo entra como un **usuario de servicio con rol Caja**, solo en esa cuenta (Usuarios y permisos). Guarda su correo y contraseña como credenciales de n8n.
4. En Quanela, ve a **WhatsApp → n8n**:
   - pega la URL de producción del Webhook y elige los eventos;
   - toca **Guardar**: el secreto se muestra una vez;
   - toca **Probar**: llega un evento `integration.test`.
5. Si n8n va a atender los pedidos, en **WhatsApp → Pedidos por WhatsApp** elige **Tu flujo de n8n**.

**Lo que recibe n8n**

Los eventos llegan con `POST` y estos encabezados:
- `X-Quanela-Event`
- `X-Quanela-Delivery`
- `X-Quanela-Signature: sha256=<HMAC-SHA256(secreto, cuerpo)>`

El cuerpo tiene esta forma:

```json
{ "id": "…", "event": "order.status_changed", "accountId": "…", "occurredAt": "…",
  "data": { "orderId": "…", "orderNumber": 1042, "status": "LISTO", "previousStatus": "EN_PREPARACION", "note": null,
            "channel": "WHATSAPP", "fulfillment": "pickup", "total": 24000,
            "customer": { "name": "Laura Gómez", "phone": "+573001110003" }, "trackingPath": "/menu/…/pedido/…" } }
```

En `whatsapp.message.received`, `data` trae `conversationId`, `wamid`, `from`, `name`, `text`, `type`, `mode` y `handled`.

- Si n8n no responde 2xx, Quanela reintenta: a 1, 5 y 15 minutos y a 1 hora, en 5 intentos.
- Un 4xx que no sea 429 queda como **fallido** en el Registro.

**Lo que n8n puede llamar**

Va como usuario de servicio, con `apikey`, `Authorization: Bearer <sesión>` y `x-dk-kitchen-id`:

| RPC | Para qué |
|---|---|
| `dk_wa_send_text(p_conversation_id, p_text, p_take_over := false)` | Responder dentro de las 24 h |
| `dk_wa_place_order_for(p_conversation_id, p_order)` | Crear el pedido. Usa el mismo núcleo que el menú público: precios, domicilio, mínimo, horario, stock y autoconfirmación. Es obligatorio `idempotencyKey`, que es el wamid |
| `dk_wa_send_template(p_to, p_template, p_language, p_params)` | Enviar una plantilla aprobada a un cliente que aceptó |
| `dk_public_menu(p_slug)` | El menú de hoy |

## 4. Pruebas de extremo a extremo (como en el ADR)

Sin credenciales de Meta, la prueba completa corre sobre un **Supabase local** con tres simuladores: Graph de Meta (envíos y recibos firmados), el modelo de IA y n8n (verifica firmas).

- **Fase A** (avisos salientes): 18 pasos.
- **Fase B** (pedidos por WhatsApp, bandeja, BAJA y n8n): 21 pasos.

**Con tu número real**, para la prueba final:
1. Conecta la cuenta en modo **Prueba**, con tu número entre los autorizados.
2. Crea y aprueba las plantillas.
3. Haz un pedido en tu menú público marcando «Recibir el estado de mi pedido por WhatsApp».
4. Avánzalo en cocina: deben llegarte «confirmado» y «listo» o «en camino».
5. Para la recepción: elige **Asistente de Quanela**, escríbele a tu número «Hola» y luego «2 sopas para recoger» (con un plato de tu menú de hoy) y «sí». El pedido aparece en cocina.
