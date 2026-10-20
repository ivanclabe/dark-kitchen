# ADR 0071: Adecuación a la normativa colombiana (datos personales, comercio electrónico, suscripciones y cookies)

## Estado
**Aprobada (2026-10-19).** Plan integral tras la auditoría, aprobado una sola vez y ejecutado completo. **No declara cumplimiento legal:** lo que figura como «pendiente de abogado» debe revisarlo un abogado colombiano antes de afirmarlo.

## Fuentes (oficiales, consultadas el 2026-10-19)
- **Ley 1581 de 2012**, arts. 4, 5, 6, 7, 8, 9, 10, 12, 14, 15, 17, 18 y 26 (secretariasenado.gov.co). Vigente y sin reformas; hay proyectos de reforma en trámite (PL 214/2025, PL 274/2025, PLE 282/2026).
- **Decreto 1074 de 2015** (funcionpublica.gov.co, Gestor Normativo):
  - datos personales: 2.2.2.25.1.3, 2.2.2.25.2.2–2.2.2.25.2.9, 2.2.2.25.3.1–2.2.2.25.3.4, 2.2.2.25.4.2, 2.2.2.25.4.4, 2.2.2.25.5.1–2.2.2.25.5.2 y 2.2.2.25.6.1–2.2.2.25.6.2;
  - RNBD: 2.2.2.26.1.2 (modificado por el Decreto 090 de 2018);
  - ventas a distancia: 2.2.2.37.8 y 2.2.2.37.9;
  - reversión del pago: 2.2.2.51.11;
  - firma electrónica: 2.2.2.47.1–2.2.2.47.8.
- **Ley 1480 de 2011**, arts. 2, 5 num. 3, 23, 37–39, 41–44, 46–48, 50 y 51. Los arts. 47 y 50 fueron modificados por la **Ley 2439 de 2024**.
- **Ley 527 de 1999**, arts. 5–7, 10–12 y 14–15.
- **Ley 2300 de 2023**, arts. 3, 5 y 9.
- **Código de Comercio**, art. 60, y **Ley 962 de 2005**, art. 28: conservación por 10 años.
- **SIC:**
  - Circular Externa 005 de 2017: países con nivel adecuado, incluido EE. UU.;
  - Circular Externa 005 de 2020: guías de comercio electrónico y marketing de 2019;
  - Circular Externa 002 de 2024: IA y datos personales;
  - sanciones de 2019 (Rappi: crear una cuenta no equivale a autorizar) y de 2020 (TikTok y Google: las cookies son Tratamiento).

## Hallazgos de la auditoría

### Legales: qué aplica a Quanela
1. **Quanela es Responsable** de los datos de sus usuarios (dueños, personal invitado) y de sus prospectos. Debe:
   - pedir una autorización previa, expresa e informada y conservar la prueba (art. 9, art. 17 b y 2.2.2.25.2.5);
   - publicar una política con el contenido mínimo de 2.2.2.25.3.1;
   - atender consultas y reclamos en 10+5 y 15+8 días hábiles (arts. 14 y 15).
2. **Quanela es Encargado** de los datos de los clientes de cada cocina (pedidos, WhatsApp, menú público), y cada cocina es la Responsable.
   - Se necesita un **contrato de transmisión** con las cláusulas de 2.2.2.25.5.2.
   - Quanela debe cumplir el art. 18 y no puede usar esos datos para fines propios.
3. **Transmisiones internacionales:** Supabase (São Paulo), Anthropic (EE. UU.), Meta/WhatsApp, Google, Cloudflare y Vercel.
   - Con contrato de transmisión, no requieren aviso ni consentimiento (2.2.2.25.5.1).
   - EE. UU. figura como país adecuado (Circular Externa 005/2017).
   - Hay que revelarlas en la política.
4. **IA:** la Circular Externa 002/2024 exige evaluar idoneidad, necesidad y proporcionalidad, y hacer una evaluación de impacto si el riesgo es alto.
5. **Cookies:** no hay una norma específica. La SIC trata como Tratamiento las cookies que recogen datos personales. La línea entre cookies necesarias y no esenciales no está codificada (pendiente de abogado).
6. **Estatuto del Consumidor:** probablemente **no aplica** a una cocina que compra un SaaS ligado a su actividad (art. 5 num. 3), pero se decide caso a caso (pendiente de abogado). Por prudencia, el diseño cumple sus reglas de comercio electrónico de todos modos:
   - identificación del vendedor, precio total y aceptación expresa y verificable (art. 50);
   - renovación automática aceptada en un documento aparte (2.2.2.37.9 par. 2);
   - cancelar no exige más que contratar (art. 43 num. 11 y 14);
   - canal de PQR con número de radicado (art. 50 g);
   - retracto (art. 47);
   - reversión del pago (art. 51 par. 2).
7. **Mensajes comerciales (Ley 2300/2023):** hoy Quanela **no envía publicidad** (solo avisos de pedidos y códigos OTP), así que no se pide un consentimiento de marketing que no tendría uso (minimización). Si algún día se envía, hay que pedir un consentimiento aparte y respetar los horarios del art. 3.
8. **Menores:** el servicio es solo para mayores de edad (art. 7).

### Técnicos: qué tenía el repositorio
- **Documentos y aceptación:**
  - No había términos, política de datos, política de cookies ni de reembolsos.
  - No había identificación del vendedor ni ninguna aceptación.
  - Solo se aceptaban los dos documentos **de Wompi**, y esos tokens no se guardaban.
- **Registro:** ningún flujo (correo, Google, Instagram, SMS ni invitación) pedía autorización. El correo de contacto seguía en el dominio antiguo (`ventas@darkkitchen.co`).
- **Cobros:**
  - No había aceptación expresa de la renovación automática ni se informaba el IVA.
  - No había forma de pedir un reembolso o el retracto desde la app; el reembolso solo es manual, desde el portal Global Admin.
  - El aviso de renovación solo aparece dentro de la app, no llega por correo.
- **Derechos del titular:** no había exportación de datos, borrado de cuenta ni anonimización de clientes. Los pedidos impiden borrar a un cliente.
- **Datos sensibles:** las preferencias alimentarias de los clientes de la cocina sugieren «Sin gluten», «Sin lactosa» y «Sin cerdo» (salud y religión) sin autorización expresa. Las notas libres pueden recibir datos sensibles.
- **Menú público y bot de WhatsApp:** piden nombre, celular y dirección sin ningún aviso de privacidad.
- **Navegador:**
  - No hay analítica ni píxeles.
  - **Google Fonts** se carga en todas las páginas (Inter, Nunito y las fuentes del menú).
  - El reconocimiento de voz por defecto (Web Speech de Chrome) envía el audio a Google.
  - El checkout de Wompi lleva el correo en la URL.
  - La cookie de sesión dura 400 días y se puede leer desde JavaScript. Es necesaria, pero hay que revelarla.
- **Evidencia:** la bitácora se purga a los 400 días y los consentimientos existentes son columnas que se pueden sobrescribir. Ninguno de los dos sirve como prueba.
- **Activos visuales:**
  - El hero del login y la imagen OG son generados con ChatGPT (manifiesto C2PA).
  - La imagen OG muestra el logo de WhatsApp.
  - El glifo de Instagram está dibujado a mano, no es el oficial.
  - `public/icons.svg` (plantilla de Vite con logos de terceros) y tres imágenes más se publican sin usarse.
  - El origen del robot y del logo debe confirmarlo el dueño.
- **Seguridad:** `/signup-admin` es pública y acepta contraseñas de 6 caracteres.

## Decisiones del propietario (2026-10-19)
- **Menú público y WhatsApp:**
  - casilla obligatoria y aviso corto que remite a la política de la cocina, generada con sus datos;
  - el bot de WhatsApp enlaza esa política.
- **Preferencias alimentarias:**
  - quedan opcionales, sin sugerencias de salud ni de religión;
  - al registrar una, el personal ve que necesita la autorización expresa del cliente.
- **Voz:** el motor local (Vosk) es el predeterminado. El de Google queda como opción, con aviso y aceptación.
- **Reembolsos:**
  - retracto con reembolso total dentro de 5 días hábiles desde el primer pago;
  - se reembolsan los cobros duplicados o errados;
  - al cancelar, el servicio sigue hasta el fin del periodo pagado, sin reembolsos parciales.
- **Sin casilla de marketing** (no hay comunicaciones comerciales) **y sin banner de cookies** (no queda nada no esencial). El propietario no objetó.

## Decisión (fases)

### F1. Documentos legales y su presentación
- **Contenido:** `content/legal/*.md`, versionados (versión, fecha de vigencia y hash SHA-256 calculado en el build). Documentos:
  1. Términos y Condiciones, con el **Anexo de tratamiento de datos por encargo** (contrato de transmisión con las cláusulas de 2.2.2.25.5.2 y los subencargados con su país) y la licencia sobre las imágenes que suben los clientes;
  2. Política de Tratamiento de Datos Personales y Privacidad;
  3. Política de Cookies;
  4. Política de Cancelaciones y Reembolsos;
  5. Suscripciones: renovación automática, cobros, cancelación, suspensión y terminación.
- **Datos de la empresa:** salen de un solo archivo, `src/shared/legal/company.ts`. Lo que falte se muestra como «Pendiente: …», nunca inventado, y el build advierte si falta algo.
- **Páginas:** públicas en `/legal/:doc`, accesibles (encabezados, índice, imprimibles y descargables), funcionan en móvil y van en `OPEN_PATHS`.
- **Enlaces:** pie de la landing con las políticas, la identificación del vendedor y el enlace a la SIC. También desde el registro, la activación, el diálogo de pago, el menú público y la ayuda.

### F2. Aceptación y evidencia
- **Tablas:**
  - `dk_legal_documents`: slug, versión, vigencia, hash y `requires_reacceptance`.
  - `dk_legal_acceptances`: **solo inserción**. Sin UPDATE, DELETE ni TRUNCATE para nadie: trigger de guarda sin excepción de retención y `revoke`.
- **Qué guarda cada aceptación:**
  - usuario, organización y cuenta;
  - documento, versión y hash;
  - acción (`accepted`, `declined`, `withdrawn`), contexto (`signup`, `activation`, `reacceptance`, `billing_renewal`) y método (`checkbox`);
  - hora del servidor;
  - IP y agente de usuario, como evidencia proporcional;
  - se conserva 10 años.
- **Escritura:** solo mediante una RPC SECURITY DEFINER. El usuario ve su historial y el admin de la organización ve el de su organización.
- **Registro:** dos casillas independientes, obligatorias y sin marcar antes de cualquier método (correo, Google, Instagram o SMS):
  - «Acepto los Términos y Condiciones» (con la declaración de mayoría de edad);
  - «He leído y acepto la Política de Tratamiento de Datos Personales».

  Los botones de método se habilitan solo con ambas marcadas, y la aceptación se registra al tener sesión. Con correo, la hora es la de creación del usuario en Auth.
- **Invitados:** al activar la cuenta aceptan la Política de Datos y las condiciones de uso.
- **Nuevas versiones y usuarios existentes:** si un documento cambia con `requires_reacceptance`, o si el usuario aún no tiene una aceptación, la app pide aceptar antes de seguir. Las aceptaciones anteriores nunca se tocan.
- **Cobro con tarjeta:** casilla aparte «Autorizo la renovación automática y el cobro recurrente…», que remite al documento de Suscripciones (2.2.2.37.9 par. 2). Se guarda como evidencia, junto con el hecho de que se aceptaron los documentos de Wompi.

### F3. Cookies, almacenamiento y terceros
- **Fuentes:** Inter, Nunito y las fuentes del menú se sirven desde el propio dominio (licencia SIL OFL). Ya no se llama a Google en cada visita.
- **Preferencias de privacidad** (`/legal/preferencias` y en el perfil):
  - lista de cada cookie y clave de almacenamiento con su categoría;
  - las no esenciales quedan apagadas por defecto;
  - un `consent store` con categorías (`necessary`, `preferences`, `analytics`, `marketing`) bloquea por código cualquier script futuro hasta tener consentimiento.
- **Sin banner:** después de este cambio no queda nada no esencial, así que no se pone uno; ver la decisión pendiente.
- **Voz:** ver las decisiones pendientes.
- **Wompi:** se quita el correo de la URL del checkout.
- **Limpieza:** los carritos viejos del menú público se borran del almacenamiento.

### F4. Derechos y solicitudes con radicado
- **«Privacidad y datos» en el perfil:**
  - documentos aceptados (historial);
  - descarga de mis datos (JSON);
  - solicitudes con radicado `PQR-AAAA-NNNNN`: consulta, reclamo, rectificación, supresión, revocatoria, cancelación y reembolso o retracto;
  - cada solicitud muestra su plazo legal y su estado.
- **Portal Global Admin:** bandeja para atender las solicitudes.
- **Anonimizar cliente** (permiso `customers.delete`): borra los datos personales y conserva los pedidos, para que la cocina responda una supresión.

### F5. Datos de los clientes de la cocina
- **Menú público:**
  - aviso de privacidad corto con casilla obligatoria, que remite a la política de la cocina (Responsable) y menciona a Quanela como Encargado;
  - la política de la cocina se genera con sus propios datos (razón social, NIT y contacto que ya están en Configuración), y lo que falte queda señalado;
  - la casilla de avisos por WhatsApp sigue siendo opcional y aparte.
- **Bot de WhatsApp:** el saludo inicial incluye el enlace a esa política.
- **Datos sensibles:** ver las decisiones pendientes.

### F6. Activos visuales
- Se borran los archivos publicados que no se usan.
- La imagen OG se rehace sin el logo de WhatsApp.
- El botón de Instagram queda solo con texto hasta tener el glifo oficial de Meta.
- `docs/legal/inventario-activos.md` recoge el inventario, con lo que el dueño debe confirmar.

### F7. Seguridad, ayuda y pruebas
- `/signup-admin` exige 8 caracteres, como el resto de la app.
- Artículos de ayuda nuevos y regeneración de la base de conocimiento de Copilot.
- **Pruebas SQL:** inmutabilidad de la evidencia, aislamiento entre negocios y re-aceptación.
- **Pruebas vitest:** casillas independientes, sin marcar y obligatorias; preferencias; bloqueo de scripts.
- **Navegador:** registro por cada método, recuperación, menú público, cancelación, reembolso, móvil y accesibilidad.

## Datos que debe aportar el propietario (no se inventan)
- **Identificación:** razón social, NIT, domicilio y dirección física, ciudad.
- **Contacto:** teléfono, correo para datos personales, correo de PQR y comercial.
- **Responsable interno:** área o persona encargada de la protección de datos.
- **Precios:** si incluyen IVA y si Quanela es responsable de IVA (régimen tributario).
- **Lo que confirma el contador:** si se cruza el umbral del RNBD (100.000 UVT en activos) y la facturación electrónica (DIAN).
- **Activos:** autoría y licencia del robot, del logo y de las imágenes de ChatGPT.

## Pendiente de abogado
- Si una cocina (en especial una persona natural o una microempresa) es «consumidor» según el art. 5 num. 3 de la Ley 1480.
- **Encargados y transferencias:**
  - si basta un contrato de transmisión para Anthropic, o si es transferencia por el uso que el proveedor da a los datos;
  - si la lista de países adecuados de la Circular Única sigue vigente;
  - si se pueden subcontratar encargados sin una autorización específica de la cocina.
- **Seguridad:** el plazo y el canal para reportar incidentes de seguridad a la SIC.
- **Cookies y almacenamiento:** el tratamiento de las cookies necesarias y del almacenamiento local, y lo que dicen las guías de la SIC de 2019.
- **Ley 2300:** si aplica entre empresas.
- **Reembolsos y retracto:** el texto final de la política y su compatibilidad con el art. 47.
- **Firma electrónica:** el valor probatorio de la aceptación electrónica según el Código General del Proceso.

## Implementación (2026-10-20)

### Base de datos (`20261019100000_dk_legal_compliance.sql`)
- **Plazos:** `dk_co_holidays(año)`, `dk_is_business_day` y `dk_add_business_days`.
  - Los festivos siguen la Ley 51 de 1983 y la Pascua.
  - El plazo cuenta desde el día siguiente, en hora de Bogotá.
- **Evidencia:**
  - `dk_legal_documents` registra las versiones con su SHA-256 y es inmutable.
  - `dk_legal_acceptances` y `dk_customer_consents` son solo de inserción:
    - el trigger `dk_guard_evidence` no tiene excepción y aplica también a TRUNCATE;
    - se hace `revoke` de la escritura directa.
  - **Cadena:** cada fila guarda el hash de la anterior (`dk_evidence_chain`), y `dk_verify_evidence_chain` dice en qué fila se rompió. Esta última es solo para Global Admin, con segundo factor.
  - **IP:** se guarda el primer salto de `x-forwarded-for`, junto con el agente de usuario.
- **Aceptaciones:**
  - `dk_record_legal_acceptance` exige la versión vigente (`stale_version`) y el permiso `billing.manage` para la renovación.
  - Contextos: `signup` (la hora es la de creación de la cuenta), `activation`, `app_gate`, `reacceptance` y `billing_renewal`.
  - Lecturas: `dk_my_pending_legal_documents` y `dk_my_legal_acceptances`.
- **Clientes de cada negocio:**
  - `dk_public_place_order` exige `privacyAccepted` (`privacy_required`) y registra la casilla.
  - Los pedidos por WhatsApp registran la conducta tras el aviso.
  - La historia de la autorización de avisos queda registrada por trigger.
  - Las preferencias alimentarias exigen `authorized_by_customer` (`consent_required`).
  - `dk_public_kitchen_privacy` entrega los datos de identificación del negocio.
- **PQR:**
  - `dk_pqr_requests` guarda la solicitud: lo radicado no cambia y no se borra. `dk_pqr_events` es su historia, solo de inserción y encadenada.
  - Funciones: `dk_create_pqr` (radicado `PQR-AAAA-NNNNN` y plazo legal), `dk_my_pqr_requests`, y para Global Admin `dk_ga_pqr_requests` y `dk_ga_update_pqr` (una prórroga de +5 o +8 días hábiles, con motivo).
- **Titulares:**
  - `dk_export_my_data`.
  - `dk_anonymize_customer`: borra los datos personales y conserva los pedidos, y deja registro en la bitácora.

### Documentos (`content/legal`)
- Los seis documentos, `empresa.yaml` (vacío, por completar) y `versions.json`.
- `scripts/build-legal.ts` (lo corre `npm run build`) los convierte a `src/shared/legal/generated/legalContent.ts`.
- El build falla si un texto cambia sin subir su versión.
- `npm run legal -- --sql` genera las filas de `dk_legal_documents` para la migración de cada versión nueva.

### Aplicación
- **Páginas públicas:** `/legal`, `/legal/:slug` y `/legal/preferencias`.
  - Son de lectura accesible, con índice, se pueden descargar e imprimir y funcionan en móvil.
  - Por defecto se ven en tema claro.
- **Política de cada negocio:** `/menu/:slug/privacidad`.
- **Registro:** dos casillas antes de cualquier método.
  - Lo que se marcó viaja en `legal_consent` dentro de los metadatos del usuario, y en esta pestaña para Google e Instagram.
  - `/registro/confirmado` lo registra.
  - Si se vuelve de un proveedor en otra pestaña, las casillas se piden de nuevo en el paso del negocio.
- **Invitaciones:** las mismas dos casillas.
- **`LegalAcceptanceGate`** (en `ProtectedRoute`): pide lo pendiente antes de usar la app. Si falla la consulta, deja entrar.
- **Tarjeta:** casilla de renovación automática, registrada antes de tokenizar o cobrar.
- **Privacidad y datos** (`/k/:slug/perfil/privacidad`): documentos aceptados, descarga de los datos y solicitudes con radicado.
- **Ficha del cliente:** «Borrar datos personales».
- **Pie de la landing:** documentos, identificación del vendedor (solo los datos ya completados) y la SIC.
- **Portal Global Admin:** «Requests (PQR)».
- **Navegador:**
  - Las fuentes se sirven desde el propio dominio con @fontsource (OFL).
  - La voz es local por defecto; la de Google se activa con un aviso aceptado.
  - El correo ya no va en la URL del checkout de Wompi.
  - Los carritos viejos del menú se limpian.
  - `loadScriptWithConsent` bloquea cualquier script opcional futuro.
- **Activos visuales:**
  - Se borraron los archivos sin uso.
  - La imagen OG se rehízo sin marcas de terceros (`scripts/og-image.mjs`).
  - El botón de Instagram queda solo con texto.
  - Inventario en `docs/legal/inventario-activos.md`.
- **Seguridad:** `/signup-admin` exige 8 caracteres.

### Orden de despliegue
1. **Frontend primero:** envía `privacyAccepted`, que la base anterior simplemente ignora.
2. **Migración:** desde ese momento la base exige la autorización en el menú público.
3. **Funciones:**
   - `dk-billing`: ya no pone el correo en la URL.
   - Las que usan `_whatsapp/agent.ts`: el aviso de privacidad en el saludo.
   - Las que usan `_shared/kb.ts`: la ayuda nueva para Copilot.

## Verificación
- **SQL:** `legal_compliance` 81/81. Cubre:
  - festivos, plazos y radicados;
  - inmutabilidad, incluso como dueño de la base, y la cadena que detecta una edición a escondidas;
  - aislamiento entre negocios y entre personas;
  - versión vieja, nueva versión con re-aceptación y conservación de las anteriores;
  - renovación sin permiso;
  - PQR con prórroga única y respuesta;
  - exportación;
  - anonimización;
  - consentimientos de los clientes.
- **Suites ajustadas y en verde:** `public_menu` 85 (más dos casos de la autorización), `dish_composition` 30, `whatsapp_notifications` 51, `whatsapp_ordering` 60, `unit_conversion` 29.
  - Las suites que ya fallaban por sus datos de prueba en este stack local siguen igual, por causas ajenas a este cambio.
- **Vitest:** 965 pruebas. Incluyen las casillas del registro, la puerta, la tarjeta, el menú público, el bloqueo de scripts y la política del negocio.
- **Revisiones:** tsc limpio; lint sin advertencias nuevas; `build` y `build:admin` pasan.
- **Navegador:**
  - documentos, preferencias y política del negocio, en escritorio y en móvil (sin desplazamiento lateral);
  - descarga de los documentos y del archivo de datos;
  - casillas obligatorias del registro;
  - puerta al entrar, aceptación con contexto `app_gate` y hora real, que no vuelve al recargar;
  - PQR radicada con su plazo;
  - pie de la landing.

## Lo que no se hizo y queda pendiente
- **Avisos por correo:** no hay correos de renovación ni de respuesta a una PQR; los avisos van dentro de la app. Hace falta un correo transaccional propio.
- **Cookies de terceros:** las de Turnstile y Wompi viven en sus dominios y no se pudieron verificar desde el código.
- **Datos de la empresa:** `empresa.yaml` sigue vacío, así que los documentos muestran «Pendiente». Completarlo cambia el texto y exige la versión 1.1 con su migración.
- **Correo comercial:** la semilla del plan Enterprise sigue en `ventas@darkkitchen.co`, el dominio anterior.
- **Bitácora:** guarda durante 400 días los valores anteriores de las direcciones, quejas y pedidos de los clientes (`dk_audit_row`); la anonimización no los toca, se borran con la purga de 400 días. Conviene definirlo con el abogado.
