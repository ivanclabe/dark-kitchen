# ADR 0066: Suscripciones con pago (Wompi) y acceso solo con pago confirmado

## Estado
**Implementada (2026-10-16), sin desplegar.** Rama `feat/suscripciones`, creada desde `design/premium-ui`. Plan aprobado en la conversación. Los pagos en línea y el bloqueo quedan apagados hasta que se encienden desde el portal admin (ver «Cómo activarlo»).

Se pidió en la conversación: desde la landing pública, el visitante se informa, crea su cuenta y registra el negocio. El acceso a las funciones depende de una suscripción activa.

Flujo pedido: elegir plan → crear cuenta → confirmar correo → configurar negocio → checkout → pago confirmado → acceso.

Reemplaza dos decisiones del ADR 0010:
- **D2** (14 días de prueba, sin bloquear nada al vencer).
- **D7** (solo la plataforma cambia el plan, porque no había pagos).

## Decisiones del usuario
| Tema | Decisión |
|---|---|
| Acceso antes del pago | Se puede crear la cuenta, configurar el negocio y elegir el plan. La plataforma queda **bloqueada** hasta que el pago se confirme. Sin prueba gratis |
| Pasarela | **Wompi** (Bancolombia) |
| Planes y precios | Los actuales, **mensuales y anuales**. Siguen en la base de datos (`dk_plans`), una sola fuente para la landing, el registro y el checkout |
| Transferencias bancarias | **Solo Enterprise, manual**: un admin global registra el pago con su soporte. El autoservicio va solo por Wompi |

## Lo que ya existe y se reutiliza
- `dk_plans`, `dk_plan_features` y `dk_features`: la landing ya los lee sin sesión. Ya admiten `price_yearly` y un selector mensual/anual.
- `dk_subscriptions`:
  - estados `trialing`, `active`, `past_due`, `canceled`, `expired`;
  - columnas `provider*` vacías.
- `dk_invoices`: existe, vacía.
- Pantalla `settings/billing` con el permiso `billing.view`.
- Registro en tres pasos y `dk_create_organization`, que crea la organización, la suscripción y la primera Cuenta.
- `dk_can`: la función central de permisos, usada en unas 380 políticas y RPC.
- Panel de admin con `dk_set_subscription`.

## Lo que Wompi permite (verificado en su documentación)
- **Tarjeta y Nequi** se pueden guardar como *fuente de pago* y cobrarse otra vez sin el cliente. Para eso hacen falta dos cosas:
  - los dos tokens de aceptación que exige la ley colombiana (política de privacidad y tratamiento de datos), aceptados de forma explícita;
  - la llave privada, que solo se usa en el servidor.
- **PSE y el botón Bancolombia** no se pueden guardar. Quien paga así recibe, antes de cada período, un enlace para pagar.
- **Wompi no programa cobros recurrentes**: Quanela los agenda (pg_cron) y los cobra con la fuente guardada.
- **Eventos (`transaction.updated`)**:
  - Firma: SHA-256 de los valores de `signature.properties` (en su orden), más `timestamp`, más el secreto de eventos. Las propiedades se leen del propio evento, nunca se fijan en el código.
  - Un evento con firma inválida se rechaza.

## Diseño

### 1. Estados de la suscripción
Se agrega el estado `incomplete`: la organización existe y eligió plan, pero todavía no paga.

| Estado | Acceso | Cómo se llega |
|---|---|---|
| `incomplete` | Solo la pantalla de pago y la configuración del negocio | Registro nuevo |
| `active` | Completo | Pago confirmado por Wompi, o transferencia registrada por un admin (Enterprise) |
| `past_due` | Completo durante el período de gracia (3 días, configurable), con aviso | Falló la renovación |
| `expired` | Bloqueado (solo la pantalla de pago) | Se acabó la gracia sin pago |
| `canceled` | Completo hasta el fin del período pagado; después, bloqueado | El dueño canceló |
| `trialing` | Se mantiene solo para las pruebas que ya existen hasta su fecha; después pasan a `expired` | No se crean nuevas |

**Las organizaciones existentes no cambian.** Las que quedaron como Enterprise `active` en el ADR 0010 siguen igual. Antes de encender el bloqueo se cuentan las que estén en `trialing` y te las muestro.

### 2. Bloqueo de acceso en el servidor, no solo en la pantalla
- `dk_can`, `dk_has_org_permission`, `dk_has_kitchen_permission` y `dk_can_use_feature` exigen además `dk_subscription_is_current(org)`.
- Excepciones para que se pueda pagar sin dejar ver ni usar nada más:
  - `billing.*`;
  - la configuración básica del negocio (nombre, sector, logo);
  - la lectura de la propia suscripción.
- El admin global no se bloquea.
- **Interruptor de plataforma `billing_enforced`**, apagado por defecto. Todo se despliega y prueba en sandbox; el bloqueo se enciende cuando confirmes que Wompi en producción funciona.

En la app, una guarda de suscripción muestra la pantalla «Activa tu suscripción» (plan, período, total y botón de pago) en lugar de la app.

### 3. Precios
- Se completa `price_yearly`. Por defecto son **10 × el precio mensual** (dos meses gratis):
  - Standard: $499.000 al año;
  - Business: $999.000 al año.
  Se editan después en la base de datos sin tocar código.
- `trial_days = 0` en los planes de autoservicio.
- Enterprise sigue siendo «Hablar con ventas».
- En la landing:
  - se quita «14 días gratis» de los textos;
  - el llamado a la acción pasa a «Crear cuenta y suscribirme».

### 4. Registro → pago
1. **Landing:** el visitante elige plan y período. Van en `/registro?plan=…&periodo=…`.
2. **Registro:** usuario, plan y negocio (como hoy). Se confirma el correo, el teléfono o Google.
3. **Confirmación:** `dk_create_organization` crea la organización con la suscripción en `incomplete`, y la persona pasa a la pantalla «Activa tu suscripción».
4. **Checkout:** la edge function `dk-billing-checkout`:
   - crea una factura `open` con una **referencia única** (`QNL-<código del tenant>-<AAAAMM>-<n>`) y el monto tomado de `dk_plans`, nunca del navegador;
   - devuelve los datos del Widget de Wompi con la **firma de integridad** calculada en el servidor.
   Con tarjeta o Nequi, la persona acepta los dos tokens de aceptación y se guarda la fuente de pago para renovar.
5. **Confirmación del pago:** la edge function `dk-billing-webhook` (sin JWT, con validación del checksum) procesa el evento.
   - Si la transacción es `APPROVED` y el monto y la referencia coinciden con la factura, la factura pasa a `paid` y la suscripción a `active`, con un período de un mes o un año.
   - Es idempotente: cada transacción se procesa una sola vez.
   - La página de retorno no activa nada: consulta el estado. Si el evento se demora, el servidor consulta la transacción en Wompi (`GET /transactions/:id`) antes de responder.
6. Las funciones se habilitan según el plan, con la regla que ya existe (`dk_plan_includes`).

### 5. Renovaciones, fallos, cancelaciones y reembolsos
- **Renovación:** un pg_cron diario llama a la función de renovación (`dk-billing-renew`).
  - Las suscripciones que vencen hoy, tienen fuente guardada y no están marcadas para cancelar se cobran con esa fuente.
  - Sin fuente guardada (PSE o botón Bancolombia), se crea la factura y se avisa 5 días antes con el enlace de pago.
- **Fallo:**
  - pasa a `past_due`;
  - se reintenta a los días 1 y 3;
  - aviso dentro de la app (campana y banner);
  - al terminar la gracia, pasa a `expired`.
- **Cancelación:** el dueño la pide desde Facturación. Queda `cancel_at_period_end` y conserva el acceso hasta el fin del período. Puede reactivarla antes de que termine.
- **Cambio de plan:**
  - Subir de plan aplica de inmediato y cobra la diferencia prorrateada.
  - Bajar de plan aplica al renovar, y solo si el uso cabe en los límites del plan nuevo (cuentas y usuarios). Si no cabe, se dice qué sobra.
- **Reembolsos:** manuales. El admin global los hace en el panel de Wompi y los registra en Quanela.
  - La factura queda `void`.
  - Si es total, la suscripción pasa a `canceled`.
  - No se automatizan: son pocos y requieren criterio.

### 6. Enterprise por transferencia
- En el panel de admin, «Registrar pago» pide el monto, la fecha y el soporte (archivo privado en Storage).
- Al registrarlo, la factura queda `paid` con método `transfer` y la suscripción `active` por el período.
- Queda en la auditoría.

### 7. Admin global
- Por organización:
  - estado de la suscripción;
  - facturas e intentos de cobro (con el estado de Wompi);
  - reintentar un cobro;
  - registrar una transferencia o un reembolso.
- En el tablero:
  - renovaciones fallidas;
  - suscripciones `past_due` y `expired`;
  - eventos de Wompi rechazados por firma.

## Datos (migraciones, solo agregar)
- `dk_subscriptions`:
  - se agrega `incomplete` al CHECK de estados;
  - nuevas columnas: `payment_source_id`, `payment_method_type`, `grace_ends_at`, `pending_plan_key` (bajada de plan al renovar).
- `dk_invoices`: nuevas columnas `reference` (única), `method`, `provider_transaction_id` (única) y `attempts`.
- Tabla nueva `dk_billing_events`:
  - guarda cada evento de Wompi crudo, con su id, el resultado de la firma y si ya se procesó;
  - sirve para la idempotencia y la auditoría;
  - la escribe solo el servicio.
- `dk_platform_settings`: `billing_enforced`, `billing_grace_days` y `billing_renewal_notice_days`.
- RPC nuevas de escritura (solo servicio o admin global): `dk_billing_*`.
- Nada se borra. Se puede volver atrás apagando `billing_enforced`, con lo que la app vuelve a comportarse como hoy.

## Secretos (los configuras tú, nunca van al código ni al chat)
Primero sandbox, después producción. Se configuran con `supabase secrets set`:
- `WOMPI_PRIVATE_KEY`
- `WOMPI_EVENTS_SECRET`
- `WOMPI_INTEGRITY_SECRET`
- `WOMPI_ENV` (sandbox/production)

En las variables de Vite va `VITE_WOMPI_PUBLIC_KEY`, que es pública. En el panel de Wompi configuras la URL de eventos `…/functions/v1/dk-billing-webhook`.

## Fases (se ejecutan seguidas tras una sola aprobación)
1. **Datos y bloqueo:**
   - migraciones;
   - `dk_can` y las demás funciones con la suscripción y el interruptor;
   - pruebas SQL en el stack local: el bloqueo, las excepciones de facturación, que las organizaciones existentes no cambien y que el admin no se bloquee.
2. **Checkout y webhook:** las edge functions `dk-billing-checkout` y `dk-billing-webhook`, la pantalla «Activa tu suscripción», la página de retorno y la guarda. Pruebas:
   - firma de integridad y checksum (Vitest);
   - idempotencia;
   - monto o referencia que no coinciden;
   - firma inválida.
3. **Renovaciones:** `dk-billing-renew`, el pg_cron, la gracia, los avisos, la cancelación y el cambio de plan.
4. **Admin:** transferencia Enterprise, reembolsos, reintentos y tablero.
5. **Landing y registro:** precios anuales, textos sin prueba gratis, CTA, el período en el registro y la redirección al checkout.
6. **Verificación:**
   - `npm run lint`, `npm test`, ambos builds;
   - el flujo completo en el stack local con las llaves sandbox de Wompi, si las configuras (tarjeta aprobada, rechazada, PSE);
   - capturas en escritorio y en celular.

Cada fase va en commits pequeños, sin push.

**Despliegue:**
- Para `supabase db push` listo las migraciones pendientes y subo solo las de esta tarea.
- Despliego las edge functions con `billing_enforced` apagado.
- Encender el bloqueo es tu decisión, después de probar en producción.

## Lo que cambió respecto al plan
- **Intentos de pago:** van en una tabla aparte, `dk_billing_payments`, cada uno con su propia referencia (`QNL-<código>-0001-1`, `-2`…). Wompi no acepta repetir una referencia. La factura (`dk_invoices`) es una sola por período y suma columnas de tipo, plan, período, medio, intentos, reembolso y soporte.
- **Dos interruptores en lugar de uno:**
  - `billing_payments_active` muestra el checkout;
  - `billing_enforced` bloquea.
  Así se prueban los pagos reales antes de bloquear a nadie.
- **Modo de cobro por organización** (`billing_mode`):
  - `online` (Wompi);
  - `manual` (transferencia; es el modo por defecto de las organizaciones que crea el admin);
  - `exempt` (nunca se bloquea ni se cobra). Las organizaciones que existían y estaban activas quedaron exentas; las que estaban en prueba pasaron a `online` y vencen en su fecha.
- **Renovación automática:** solo con **tarjeta**. Nequi se paga desde el checkout de Wompi en cada período, como PSE y el botón Bancolombia, porque tokenizar Nequi exige que la persona apruebe en su app cada vez que se guarda.
- **Llave pública:** no hay `VITE_WOMPI_PUBLIC_KEY`. El navegador la recibe de `dk-billing` (acción `config`), así todas las llaves viven en un solo lugar.
- **Funciones:** `dk-billing-checkout` quedó como una sola función, `dk-billing`, con cuatro acciones: `config`, `checkout`, `pay_with_card` y `status`.
- **Tarjeta rechazada en el primer cobro:** no se guarda.
- **Subir de plan cuando faltan pocos días:** si la diferencia prorrateada es menor a $1.000, el cambio se aplica sin cobro.
- **Bajar de plan:** la base lo rechaza si el negocio no cabe en el plan nuevo (cuentas o usuarios) y dice qué sobra.
- **Permiso nuevo `billing.manage`:** pagar, guardar tarjeta, cambiar de plan y cancelar. Lo tiene el Super Admin de la organización.

## Cómo quedó
- **Base de datos:** `supabase/migrations/20261016100000_dk_subscription_billing.sql`.
  - El bloqueo vive en `dk_effective_role`, de la que dependen todas las reglas por cuenta: sin suscripción vigente nadie tiene rol en ninguna cuenta.
  - `dk_has_org_permission` deja pasar solo `organization.view`, `organization.manage`, `billing.view` y `billing.manage`.
  - El admin global no se bloquea.
- **Funciones:**
  - `dk-billing` (con JWT);
  - `dk-billing-webhook` y `dk-billing-renew` (sin JWT: la confianza viene de la firma de Wompi y de que la base decide qué se cobra);
  - lo compartido está en `_shared/wompi.ts` (firmas, puro y probado) y `_shared/wompiApi.ts`.
- **App:**
  - pantalla «Activa tu suscripción» (`SubscriptionGate`) en lugar de la cuenta cuando está bloqueada;
  - tarjeta de suscripción en Facturación (pagar, renovar con tarjeta, cambiar de plan, cancelar o reactivar);
  - aviso arriba de la app para quien paga;
  - avisos en la campana;
  - el período elegido viaja de la landing al registro.
- **Portal admin:**
  - pestaña Facturación en cada organización (modo de cobro, facturas con cada intento, transferencia con soporte, reembolso, cobrar de nuevo);
  - panel «Suscripciones y cobros» en Administration (los dos interruptores, días de gracia y de aviso, conteos, organizaciones que requieren atención, últimos eventos);
  - alertas en el tablero.
- **pg_cron:** `dk-billing-daily`, a las 08:10 de Bogotá, mueve los estados y despierta la renovación.

## Verificación
- **SQL:** `supabase/tests/subscriptions.sql`, 32/32. Cubre:
  - registro sin pagar;
  - interruptor apagado y encendido;
  - qué queda permitido bloqueado;
  - exentas;
  - checkout;
  - monto falso;
  - rechazo y aprobación;
  - idempotencia;
  - subir y bajar de plan;
  - renovación con tarjeta una sola vez;
  - gracia y vencimiento;
  - pago tardío;
  - cancelar y reactivar;
  - transferencia y reembolso con segundo factor;
  - eventos repetidos.
- **Todas las migraciones desde cero, incluida esta:** se reprodujeron en local y se aplican limpias. Para eso se parcheó, solo en una copia local, la migración antigua «Fase C» (20260925120000), que no se puede reproducir en una base vacía, y se dieron los permisos por defecto del proyecto alojado.
- **Suites SQL existentes:** se compararon con y sin esta migración y dan el mismo resultado. 23 de ellas ya fallaban antes en una base nueva (por ejemplo, llaman funciones de admin global sin segundo factor); quedan pendientes aparte.
- **Vitest:** 922 pruebas, con las nuevas de firmas de Wompi, ayudantes de facturación, pantalla de bloqueo y ruta del registro.
- **`npm run lint`:** sin avisos nuevos.
- **Builds:** pasan los de la app y del admin.
- **De punta a punta en local, con un Wompi simulado que firma los eventos igual que el real:**
  - pantalla de bloqueo en escritorio y celular;
  - pago con tarjeta: activa y guarda la tarjeta;
  - tarjeta rechazada: sigue bloqueada y no guarda la tarjeta;
  - checkout con redirección: el regreso confirma consultando a Wompi y el evento firmado llega después sin duplicar;
  - renovación automática con `dk-billing-renew`: cobra una sola vez aunque se llame dos veces;
  - evento falsificado: 401 y queda registrado;
  - cambio de plan al renovar y bajada rechazada por límites;
  - cancelación con su aviso.
- **Sin probar:** contra el sandbox real de Wompi, porque no hay llaves todavía. Hay que confirmar que la tokenización desde el navegador funciona (CORS) y los nombres exactos de campos.

## Cómo activarlo (en orden)
1. **Desplegar** con `supabase db push` (solo esta migración) y `supabase functions deploy dk-billing dk-billing-webhook dk-billing-renew`.
2. **Configurar las llaves de sandbox** con `supabase secrets set`: `WOMPI_ENV=sandbox`, `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_INTEGRITY_SECRET` y `WOMPI_EVENTS_SECRET`. Opcional: `BILLING_RETURN_HOSTS`, que por defecto es `quanela.com`.
3. **Registrar la URL de eventos** en el panel de Wompi: `https://cqfzcwpqisaohcjaevxf.supabase.co/functions/v1/dk-billing-webhook`.
4. **Probar en sandbox:** en el portal admin, encender «Pagos en línea» y pagar con una organización de prueba (tarjeta aprobada, tarjeta rechazada y PSE).
5. **Pasar a producción:** cambiar las llaves (`WOMPI_ENV=production`; la función rechaza mezclar una llave de producción con sandbox) y hacer un pago real pequeño.
6. **Encender el bloqueo:** «Bloquear sin suscripción vigente», solo entonces.

Las variables `WOMPI_API_URL`, `WOMPI_BROWSER_API_URL` y `WOMPI_CHECKOUT_URL` existen solo para las pruebas locales con el Wompi simulado. En producción no se configuran.

## Fuera de alcance
- Factura electrónica DIAN.
- Correos transaccionales propios (los avisos van en la app). Se pueden agregar después.
- Cupones y descuentos.
- Artículos del centro de ayuda (solo si los pides).
