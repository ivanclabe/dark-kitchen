# ADR 0047: Quanela Consumer hereda la identidad de la cuenta

## Estado
**Aprobada e implementada (2026-10-09)**, incluida la eliminación de las columnas (D4).

**Pedido:**
1. En Quanela Consumer, la «Identidad» debe heredar los datos de la cuenta, no duplicarlos.
2. «Tipo de cocina» debe pasar a Configuración → General.

---

## 1. Auditoría
| Dato | Hoy | Problema |
|---|---|---|
| Nombre | La cuenta tiene `dk_kitchens.name` («Nombre» en Configuración → General). Consumer guarda su propia copia en `dk_storefronts.display_name` | Dos nombres que se pueden contradecir. Cambiar el de la cuenta no cambia el de la app |
| Dirección pública | La cuenta tiene `dk_kitchens.slug` («Identificador (URL)»): **único en toda la plataforma** y con el mismo formato. Consumer guarda `dk_storefronts.public_slug` (único) | El mismo identificador, escrito dos veces |
| Tipo de cocina | La organización tiene `dk_organizations.category` («Categoría» en General → Tu negocio), con **la misma lista** de valores. Consumer guarda `dk_storefronts.cuisine`, y solo usa la categoría como sugerencia inicial | Dos listas iguales en dos lugares. Además, la categoría es de toda la organización, y cada cuenta puede ser una marca distinta (Sopa donde Carmen: típica; Hamburgesas del Norte: hamburguesas) |
| Frase corta, ubicación, WhatsApp, compartir tiempos | Solo existen en Consumer | Son de Consumer: se quedan |
| Lectura pública | `dk_public_search_dishes` y `dk_storefront_get` leen nombre, dirección y cocina de `dk_storefronts` | Hay que cambiarlas para que lean de la cuenta. La respuesta mantiene las mismas claves (`name`, `slug`, `cuisine`), así que la app de iOS no cambia |
| Datos en producción | Una sola fila en `dk_storefronts` (Sopa donde Carmen, sin publicar y sin platos). Su nombre y su dirección son iguales a los de la cuenta, y su cocina está vacía | No se pierde nada al heredar |

## 2. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Nombre y dirección pública | **Se heredan de la cuenta:** el «Nombre» y el «Identificador (URL)» de Configuración → General. En Consumer se ven en solo lectura, con «Cambiar en Configuración → General». Al publicar, el identificador de la cuenta pasa a ser público (sirve de dirección en la app). En General, su ayuda lo dice |
| **D2** | Tipo de cocina | Un campo nuevo de la **cuenta**, `dk_kitchens.cuisine`, en Configuración → General → **Esta cuenta**: «Tipo de cocina», cuya primera opción es **«Como el negocio (Típica)»**. Vacío significa la categoría de la organización. Así una organización con varias marcas pone una cocina por cuenta. La lista es la misma (`burgers`, `pizza`…) |
| **D3** | Lo que queda en Consumer | **Frase corta**, ubicación, WhatsApp para pedidos y compartir tiempos (lo propio de la app). La tarjeta «Identidad» muestra lo heredado y deja editar solo la frase corta |
| **D4** | Las copias en la base | **Se eliminan** las columnas `dk_storefronts.display_name`, `public_slug` y `cuisine`, para que no vuelvan a desincronizarse. Antes, la cocina que tuviera algún storefront se copia a su cuenta (hoy está vacía). **Esto borra columnas: necesita tu aprobación** |
| **D5** | Funciones | Se recrean `dk_public_search_dishes` (nombre de la cuenta, identificador y cocina efectiva = la de la cuenta o, si no, la de la organización), `dk_storefront_get` (devuelve lo heredado con las mismas claves) y `dk_storefront_save` (deja de recibir nombre, dirección y cocina). La búsqueda por dirección usa el identificador de la cuenta |
| **D6** | Ayuda | El artículo de Consumer y notas de versión. El manual no se toca |

## 3. Fases
| Fase | Qué |
|---|---|
| 1 · Base | Migración `dk_consumer_inherits_account`: `dk_kitchens.cuisine` con la misma lista, copia de la cocina, recrear las tres funciones y eliminar las tres columnas. Ensayo con `consumer_public` y `voice`/`customer` sin cambios; tipos regenerados |
| 2 · General | «Tipo de cocina» en Esta cuenta (`KitchenGeneralPage`, `getKitchenDetails` / `updateKitchenDetails`) y la ayuda del identificador |
| 3 · Consumer | Identidad heredada (solo lectura con enlace) y la frase editable. En el Resumen, «Tipo de cocina» lleva a General y el perfil muestra lo heredado. La vista previa no cambia |
| 4 · Ayuda | Artículo y notas, `npm run help` y desplegar `dk-copilot` |
| — | **Validación:** `consumer_public` actualizado (la dirección y el nombre vienen de la cuenta, cambiar el nombre de la cuenta cambia el de la búsqueda, una cuenta sin publicar sigue sin verse), Vitest, `tsc`, `oxlint`, builds y el navegador sin publicar nada |

## 4. Riesgos
| Riesgo | Mitigación |
|---|---|
| El identificador de la cuenta queda público al publicar | Ya es la dirección de la cuenta dentro de la app y no da acceso a nada. La ayuda de General lo dice |
| Cambiar el identificador de la cuenta cambia la dirección en la app | Es lo esperado: una sola fuente. La ayuda de General lo advierte |
| Eliminar columnas | Los datos de hoy son iguales a los de la cuenta o están vacíos, y la cocina se copia antes. Se revisa que no haya diferencias antes de eliminar |

## 5. Resultados (2026-10-09)
| Fase | Qué quedó |
|---|---|
| 1 · Base | Migración `20261009120000_dk_consumer_inherits_account` (aplicada):<br>• `dk_kitchens.cuisine`, con la misma lista;<br>• un bloque que detiene la migración si alguna copia difería de su cuenta (no difería: Sopa donde Carmen, el mismo nombre y el mismo identificador, y la cocina vacía);<br>• copia de la cocina;<br>• **eliminación** de `dk_storefronts.display_name`, `public_slug` y `cuisine`;<br>• recreación de `dk_public_search_dishes` (lista intermedia `stores`: el nombre y el identificador son los de la cuenta, y la cocina es la de la cuenta o, si no, la de la organización), `dk_storefront_get` (las mismas claves, más `account`) y `dk_storefront_save` (sin nombre, dirección ni cocina).<br>Al aplicarla, el CLI siguió corriendo después de terminar. Se comprobó en la base que quedó registrada y aplicada, y se detuvo el proceso |
| 2 · General | «Tipo de cocina» en Esta cuenta, con la primera opción «Como el negocio (…)», en `KitchenDetails` y en `getKitchenDetails` / `updateKitchenDetails`. La ayuda del identificador avisa que también es la dirección pública. `useOrganizationDetails` ya no consulta sin organización |
| 3 · Consumer | `CUISINES` es la lista `CATEGORIES` del negocio: una sola lista.<br>• Tipos `StorefrontData` (lo que se guarda) y `StorefrontRead` (lo que se lee, con lo heredado).<br>• Perfil: tarjeta Identidad en solo lectura, con «Cambiar en General», y la frase corta editable.<br>• Lista para publicar: «Nombre y dirección pública» (de la cuenta, obligatorio y siempre listo); «Tipo de cocina» lleva a General y dice «(como el negocio)».<br>• Platos ya no exige guardar el perfil antes: el primer guardado crea la publicación **sin publicar**. Resumen ofrece «Elegir platos» |
| 4 · Ayuda | Artículos `quanela-consumer` y `settings`, notas de versión y `dk-copilot` desplegada |

**Validación:**
- SQL: `consumer_public` **52/52**. Se sumaron pruebas de identidad:
  - el nombre, la dirección y la cocina vienen de la cuenta, y la cocina es la de la organización si la cuenta no tiene;
  - la dirección de la cuenta encuentra el negocio;
  - renombrar la cuenta o elegir su cocina se ve de inmediato, y la cocina se puede buscar;
  - guardar no cambia el nombre ni la dirección.
- `accounts`, `multikitchen_admin` y `organizations` siguen en verde con la migración. Los datos de demostración locales (`fixtures/consumer_demo.sql`) se ajustaron.
- Vitest: **665**. Se actualizaron `readiness` y `ConsumerPage`, con dos casos nuevos:
  - el perfil muestra la identidad heredada y solo deja editar la frase;
  - el primer guardado de platos crea la publicación sin publicar.
- `tsc`, `oxlint` (13 avisos) y los dos builds correctos.
- Navegador, sin guardar nada: General muestra «Tipo de cocina: Como el negocio (sin definir)» y la nueva ayuda del identificador; el perfil de Consumer muestra la identidad heredada; el Resumen dice «Apareces como «Sopa donde Carmen» (dark-kitchen-1)». Ninguna petición falló.
