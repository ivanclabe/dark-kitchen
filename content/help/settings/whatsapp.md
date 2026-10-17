---
id: whatsapp
section: settings
title: WhatsApp e Integraciones
summary: Conecta el número oficial de WhatsApp de tu negocio para avisarles a tus clientes el estado de su pedido, recibir pedidos por WhatsApp (con tu equipo, el asistente de Quanela o n8n) y conectar tus automatizaciones.
audience: [owner, admin, manager]
permissions: [integrations.view]
appPath: /integrations
questions:
  - ¿Cómo conecto mi número de WhatsApp?
  - ¿Cómo les aviso a mis clientes que su pedido está listo?
  - ¿Puedo recibir pedidos por WhatsApp?
  - ¿La IA puede tomar pedidos por WhatsApp?
  - ¿Cómo respondo los mensajes de WhatsApp desde Quanela?
  - ¿Cómo conecto n8n?
  - ¿Por qué un cliente no recibió el aviso?
keywords: [whatsapp, meta, número oficial, avisos, notificaciones, estado del pedido, plantillas, bandeja, mensajes, pedidos por whatsapp, asistente, ia, n8n, webhook, integraciones, baja]
related: [public-menu, create-order, dispatch-deliver]
updated: 2026-10-11
order: 6
---

En **WhatsApp e Integraciones** (menú lateral) conectas el **número oficial** de WhatsApp de tu negocio. Usa WhatsApp Business Platform de Meta, con tu propio número y tu propia cuenta de Meta.

## Conectar tu número

1. En Meta (developers.facebook.com):
   - crea una app de tipo Empresa con el producto WhatsApp y agrega tu número;
   - copia el **Phone Number ID** y el **WhatsApp Business Account ID**;
   - genera un **token permanente** de un usuario del sistema;
   - copia el **App Secret**.
2. En **Conexión**, pega esos cuatro datos y toca **Conectar**. Quanela verifica el número.
3. En Meta, configura el **webhook** con la URL y el **token de verificación** que te muestra Quanela, y suscríbete a `messages`.

> **Bueno saber:** el token y el App Secret se guardan cifrados y nunca se vuelven a mostrar. Empieza en modo **Prueba**: solo les llegan mensajes a los números que autorices. Cuando todo funcione, cambia a **Producción**.

## Avisos de pedidos

En **Avisos** eliges qué cambios de estado se le avisan al cliente:
- confirmado;
- en preparación;
- listo para recoger;
- listo para domicilio;
- en camino;
- entregado;
- cancelado, con el motivo.

1. Toca **Crear plantillas en Meta**. Fuera de una conversación, WhatsApp solo permite plantillas aprobadas, y Quanela trae las suyas listas.
2. Cuando Meta las apruebe (unos minutos), toca **Actualizar estado**.
3. Con **Probar** envías un ejemplo a un número.

El aviso sale solo cuando el pedido cambia de estado, desde Pedidos, Cocina o Despacho, sin que nadie haga nada más. Lleva el **enlace de seguimiento** del pedido.

> **Cuidado:** solo se avisa a clientes que **aceptaron**. Aceptan de tres maneras:
> - con la casilla «Recibir el estado de mi pedido por WhatsApp» del menú público;
> - escribiéndote por WhatsApp;
> - porque tú lo marcaste en su ficha, cuando te lo pidió.
>
> Si escriben **BAJA**, dejan de recibir avisos al instante.

En **Registro** ves cada aviso: enviado, entregado, leído, o por qué falló o no se envió. Los fallidos se pueden **reintentar**.

## Pedidos por WhatsApp

En **Pedidos por WhatsApp** eliges quién atiende los mensajes:
- **Tu equipo:** los mensajes llegan a **Mensajes** y respondes desde ahí.
- **Asistente de Quanela:**
  - entiende el pedido y lo busca en el **menú de hoy**;
  - muestra el resumen con el **total real** y lo crea cuando el cliente responde **SÍ**;
  - el pedido entra a cocina como cualquier otro, con el canal WhatsApp y las reglas de tu Menú público.
- **Tu flujo de n8n:** los mensajes van a tu n8n.

> **Bueno saber:** el asistente **nunca inventa** platos ni precios. Solo puede elegir platos de tu menú de hoy, y los precios, el domicilio y el total los calcula Quanela. Si no entiende dos veces, si el cliente pide hablar con una persona o si hace una pregunta, la conversación pasa a **Mensajes** con la marca «Necesita atención». El asistente tiene su propio cupo diario de IA.

En **Mensajes** ves las conversaciones:
- al responder, **tomas** la conversación y el asistente deja de contestar;
- con **Devolver al asistente** se la regresas.

WhatsApp solo deja escribir texto libre durante las 24 horas siguientes al último mensaje del cliente.

## n8n

En **n8n**:
1. Pega la URL de tu Webhook de n8n y elige los eventos: cambios de estado de los pedidos y mensajes recibidos.
2. Copia el **secreto de firma**: se muestra una vez.

Cada evento llega firmado, con `X-Quanela-Signature`. Tu flujo responde por WhatsApp y crea pedidos a través de Quanela, con un usuario de servicio con rol Caja, sin tener nunca el token de Meta. Hay flujos de ejemplo listos para importar.
