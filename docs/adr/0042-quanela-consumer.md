# ADR 0042: Quanela Consumer, el asistente para el cliente final

## Estado
**v1 implementada y validada en local (2026-10-07). No aplicada en producción.** **El cliente es una app nativa de iOS (SwiftUI) en su propio repo, `~/Workspace/quanela-ios`** (decisión del 2026-10-07 que reemplaza la primera versión web en `consumer/`, que se retiró de este repo). Aquí queda el backend que la app consume. La migración `20261007120000_dk_consumer_marketplace.sql` y la Edge Function `dk-consumer-assistant` solo corren en un Supabase local. Para llevarlas a producción hace falta tu aprobación y los pasos de la §11.4. El pedido directo desde la app (Fase 8) queda diseñado, no implementado: necesita las decisiones de la §8.

**Pedido:** una app nueva para el cliente final, distinta de la app operativa. El cliente dice qué quiere comer, Quanela busca entre todos los negocios que usan Quanela, recomienda la mejor opción y explica por qué. **Nunca inventa datos.**

**Visión:** el usuario no busca restaurantes. Le dice a Quanela qué quiere comer y Quanela encuentra la mejor opción.

---

## 1. Auditoría (Fase 1)

### 1.1 Cómo está modelado hoy

| Concepto | Dónde vive | Notas para Consumer |
|---|---|---|
| Negocio que ve el cliente | `dk_kitchens` (la Cuenta), dentro de `dk_organizations` | Menú, precios, horario y pedidos son por Cuenta. El tipo de cocina (`burgers`, `pizza`, `healthy`…) está en `dk_organizations.category` |
| Platos | `dk_products` (`name`, `description`, `price`, `image_path`, `category_id`, `active`) | **Incluye `estimated_cost`**: cualquier vista o política pública sobre la tabla filtraría el costo |
| Categorías | `dk_product_categories` (solo `name`, texto libre por Cuenta) | «Hamburguesas», «Burgers»… no hay taxonomía común |
| Fotos | `dk_product_images` (máx. 2) + bucket **público** `dk-product-images` | La ruta incluye `kitchen_id` y `product_id` |
| Ingredientes | `dk_recipes` → `dk_recipe_items` → `dk_ingredients` | Es know-how del negocio (cantidades, costos). Solo los **nombres** se pueden publicar, y solo si el negocio quiere |
| Menú del día | `dk_menu_plan_items` (`plan_date`, `is_active`, `start_time`, `end_time`, `special_price`, `unit_limit`) | `is_active = false` es «agotado». Hoy nadie aplica en SQL la ventana horaria ni el límite de unidades |
| Horario | `dk_kitchen_hours` + `dk_kitchen_hour_exceptions` | «Abierto ahora» solo se calcula en el cliente (`src/modules/kitchen/lib/schedule.ts`) |
| Pedidos | `dk_orders`, `dk_order_items`, `dk_order_status_history`, `dk_deliveries` | Canales: `MANUAL`, `WHATSAPP`, `PHONE`. No hay dirección por pedido, tipo de entrega ni modificadores (solo la `observation` de cada línea) |
| Clientes | `dk_customers` (por Cuenta, único por teléfono E.164) + 360 (`dk_customer_preferences`, direcciones) | No hay identidad global ni vínculo con `auth.users`. No hay consentimientos |
| Autenticación | Supabase Auth compartido; personal = `dk_users` + membresías | Todo el acceso pasa por `x-dk-kitchen-id` + `dk_effective_role`. Un usuario sin `dk_users` no ve nada |
| Acceso anónimo | Solo `dk_tenant_public`, `dk_activation_preview` y los planes | **No hay ningún catálogo público** |
| IA | `dk-copilot` (Anthropic por `fetch`, contrato `answer`, cupos por Cuenta) | Los cupos y permisos son de personal. No sirven para consumidores tal como están |
| Búsqueda | `ilike` | No hay pgvector, tsvector, pg_trgm ni unaccent |

### 1.2 Qué existe de la lista pedida

| Dato | Estado | Fuente real |
|---|---|---|
| Nombre del negocio, platos, categorías, precio, fotos, horario | **Existe** | Tablas de arriba |
| Ingredientes | **Existe** (privado) | Receta activa del plato; se publica solo el nombre, si el negocio lo autoriza |
| Disponibilidad | **Parcial** | Menú del día (`is_active`, ventana, límite) + horario. No hay «cuántos puedo hacer» por stock |
| Promociones | **Parcial** | `special_price` del menú del día |
| Tiempo de preparación | **Derivable** | `dk_order_status_history` (CONFIRMADO → LISTO), por Cuenta, no por plato |
| Tiempo de respuesta | **Derivable** | NUEVO → CONFIRMADO |
| Historial de cumplimiento | **Derivable** | Pedidos entregados o listos vs. cancelados |
| Popularidad | **Derivable** | Unidades vendidas por plato |
| Tiempo de entrega | **Derivable** (solo domicilios) | `dk_deliveries.dispatched_at → delivered_at` |
| Carga actual | **Derivable** | Pedidos activos de la Cuenta |
| Rating, número de reseñas | **No existe** | — |
| Distancia / ubicación | **No existe** | Direcciones en texto libre |
| Adiciones / eliminaciones con precio | **No existe** | — |

**Regla que sale de aquí:** lo que **no existe** no se muestra y no pesa en el ranking. Lo que es **derivable** solo se muestra si el negocio decide compartirlo (§3).

### 1.3 Riesgos encontrados

1. **El costo viaja con el plato.** La política de lectura de `dk_products` deja ver todas las columnas a cualquier miembro. Nada público puede leer esa tabla «tal cual».
2. **`anon` conserva los privilegios por defecto de Supabase** sobre casi todas las tablas, y las funciones nuevas quedan ejecutables por `anon` si no se revocan. Solo RLS separa.
3. **Los RPC de pedido suponen personal** con rol en la Cuenta. La vía manual confía en el `unit_price` que manda el cliente. Ninguna sirve para consumidores.
4. **Auth compartido.** Un consumidor con correo confirmado puede llamar `dk_create_organization` y volverse dueño de un negocio. No es una fuga de datos, pero hay que tenerlo en cuenta (§7).
5. **El MCP de Supabase de esta sesión apunta a otro proyecto** (`iosxchnwfvimfgozumqh`, el de las otras apps), no al de Quanela (`cqfzcwpqisaohcjaevxf`). No se usa para Quanela.
6. **`supabase/tests/run.py` corre contra el proyecto enlazado** (producción, en una transacción que se revierte). Consumer se prueba en local: se agrega `--local` al runner.

---

## 2. Arquitectura general

```
┌─────────────────────────────┐        ┌───────────────────────────────┐
│ quanela-ios (SwiftUI)       │        │ App operativa (src/)          │
│ Chat + cards + detalle      │        │ Configuración → Quanela       │
│ Estado de la conversación   │        │ Consumer: publicar negocio y  │
└──────────────┬──────────────┘        │ platos                         │
               │ { message, state }     └───────────────┬───────────────┘
┌──────────────▼──────────────────────────────┐        │ dk_storefront_* (RPC con permiso)
│ Edge Function dk-consumer-assistant          │        │
│  1 Intent (reglas + Claude opcional)         │        │
│  2 Retrieval  → dk_public_search_dishes      │        │
│  3 Availability (viene del SQL)              │        │
│  4 Ranking (factores modulares)              │        │
│  5 Personalization (perfil con permiso)      │        │
│  6 Response (determinista, con datos reales) │        │
│  Lógica pura en supabase/functions/_consumer │        │
└──────────────┬──────────────────────────────┘        │
               │ JWT del consumidor (anónimo o con cuenta)
┌──────────────▼────────────────────────────────────────▼─────────────┐
│ Postgres                                                             │
│  Privado (sin cambios): dk_products, dk_recipes, dk_orders…          │
│  Publicado (nuevo, opt-in): dk_storefronts, dk_storefront_products   │
│  Lectura pública: dk_public_* (SECURITY DEFINER, columnas en lista   │
│  blanca, solo lo publicado)                                          │
│  Consumidor: dk_consumers, dk_consumer_preferences (RLS por auth.uid)│
└──────────────────────────────────────────────────────────────────────┘
```

**Principios**

- **La UI no decide nada.** El chat solo pinta lo que devuelve el pipeline. La misma lógica servirá mañana para WhatsApp.
- **El LLM interpreta, no informa.** Claude solo convierte la frase en filtros estructurados. Los datos de la respuesta (precios, tiempos, disponibilidad) salen del SQL y se escriben con plantillas, así no hay forma de que invente cifras. Sin clave de Anthropic, el parser de reglas cubre las frases comunes.
- **Lo público es una proyección explícita**, no una vista sobre tablas privadas.

---

## 3. Modelo de datos (Fase 2)

### 3.1 Lo que se reutiliza, sin duplicar

Nombre, descripción, precio, foto y categoría del plato; menú del día; horario; tipo de cocina de la organización; historial de estados (métricas); recetas (solo nombres de ingredientes). **Nada de esto se copia**: las funciones públicas lo leen en vivo, así un cambio de precio o un «agotado» se ve al instante.

### 3.2 Lo nuevo: la capa publicada (opt-in)

**`dk_storefronts`**: una fila por Cuenta que decide aparecer en Quanela Consumer.

| Columna | Para qué |
|---|---|
| `kitchen_id` (PK) | La Cuenta |
| `published` (default **false**) | Interruptor general |
| `public_slug` | Identificador público estable. No expone ids internos del negocio |
| `display_name`, `tagline` | Lo que ve el cliente (por defecto, el nombre de la Cuenta) |
| `cuisine` | Tipo de cocina (por defecto, el de la organización) |
| `latitude`, `longitude` | Opcionales. Sin ellas, la distancia es «desconocida» |
| `whatsapp_phone` | Opcional. Si existe, el carrito se puede enviar por WhatsApp (canal que ya existe) |
| `share_metrics` (default **false**) | Si el negocio comparte sus tiempos reales y su cumplimiento |
| `published_at`, `updated_at`, `updated_by` | Auditoría |

**`dk_storefront_products`**: qué platos se publican y cómo.

| Columna | Para qué |
|---|---|
| `kitchen_id`, `product_id` (PK) | El plato |
| `published` (default **false**) | Opt-in por plato |
| `dietary_tags text[]` | Declarados por el negocio: `vegetarian`, `vegan`, `gluten_free`, `spicy`, `healthy`. **No se infieren** de los ingredientes |
| `show_ingredients` (default false) | Si se muestran los **nombres** de los ingredientes de la receta activa |

Permiso nuevo: **`storefront.manage`** («Publicar en Quanela Consumer»). Se da a los roles de sistema ADMIN y GERENTE. Toda escritura pasa por RPC con `dk_require('storefront.manage')` y queda en la auditoría.

### 3.3 Lo que se calcula en vivo (nunca se inventa)

| Señal | Cálculo | Cuándo es «desconocida» |
|---|---|---|
| Disponible | Menú de hoy (hora local de la Cuenta): `is_active`, dentro de `start_time`–`end_time`, unidades vendidas < `unit_limit` | Si la Cuenta no tiene menú para hoy: `unknown` («sin confirmar») |
| Abierto ahora | `dk_kitchen_hours` + excepciones, en la zona horaria de la Cuenta | Sin horario configurado |
| Precio | `coalesce(special_price, price)`; `promo = special_price < price` | Nunca |
| Preparación | Mediana CONFIRMADO → LISTO, 30 días | `share_metrics = false` o menos de 10 pedidos |
| Respuesta | Mediana NUEVO → CONFIRMADO, 30 días | Igual |
| Entrega | Mediana despacho → entrega, 30 días | Igual |
| Cumplimiento | 1 − cancelados / pedidos cerrados, 30 días | Igual |
| Popularidad | Unidades del plato, 30 días (percentil dentro de la búsqueda) | `share_metrics = false` |
| Carga actual | Pedidos activos ahora | `share_metrics = false` |
| Distancia | Haversine entre el negocio y el cliente | Falta cualquiera de las dos ubicaciones |
| Rating / reseñas | **No existe**: siempre `null` | Siempre |

### 3.4 El cliente

- **Sesión:** la app entra con **sesión anónima de Supabase** (`signInAnonymously`) para tener un `auth.uid()` estable sin pedir datos. Luego se puede vincular a correo o teléfono sin perder el perfil.
- **`dk_consumers`** (`id = auth.uid()`): `display_name`, `phone`, `email`, **`profile_consent`** + `consent_at`.
- **`dk_consumer_preferences`**: `kind` (`avoid_ingredient`, `like_ingredient`, `dietary`, `favorite_storefront`, `favorite_product`, `max_price`, `max_minutes`) + `value`. **Solo se guardan con `profile_consent = true`.**
- RLS por `auth.uid()`, sin encabezados de Cuenta. **Ningún negocio puede leer estas tablas.** Los clientes por Cuenta (`dk_customers`) siguen igual; el vínculo consumidor → cliente de cada Cuenta llega con el pedido (§8).
- **Historial de pedidos:** hoy no existen pedidos de consumidores, así que «algo parecido a mi último pedido» responde con honestidad que no hay historial.

---

## 4. Discovery engine (Fase 3)

La lógica vive en **`supabase/functions/_consumer/`**: TypeScript puro, sin Deno, importable desde la Edge Function y desde vitest (como `dk-copilot/contract.ts`).

| Etapa | Módulo | Contrato |
|---|---|---|
| Intent | `intent.ts` (reglas es-CO) + `llmIntent.ts` (Claude, opcional) | `frase + estado → IntentDelta` (consulta, categoría, filtros, orden, referencia al plato en foco, pregunta) |
| Estado | `state.ts` | `estado + IntentDelta → estado` (reducer puro: «la más rápida» cambia el orden; «sin cebolla» suma un filtro; «nueva búsqueda» limpia) |
| Retrieval | `dk_public_search_dishes(jsonb)` en SQL | Filtros duros (publicado, activo, precio máx., etiquetas, abierto) + coincidencia de texto amplia → hasta 200 candidatos con todas sus señales |
| Ranking | `ranking.ts` | Factores independientes con peso; ver §5 |
| Personalización | `personalize.ts` | Perfil (con permiso) → ajusta factores y filtros |
| Respuesta | `respond.ts` | Texto con plantillas **solo** con valores presentes en los resultados |
| Orquestación | `pipeline.ts` | Recibe las dependencias inyectadas (búsqueda, LLM), así se prueba sin red |

**Evolución sin reescribir:** el retriever es una interfaz. Mañana `dk_public_search_dishes` puede sumar `pg_trgm`/`tsvector` o pgvector (embeddings del nombre, la descripción y los ingredientes publicados) y el resto del pipeline no cambia.

**Coincidencia:** el texto se normaliza (minúsculas, sin tildes, singular simple) y se expande con sinónimos (`hamburguesa ↔ burger`, `papas ↔ papas fritas ↔ francesas`…). Se compara con el nombre, la categoría, la descripción, la cocina del negocio, las etiquetas y los ingredientes publicados. El puntaje pondera el campo: el nombre pesa más que la descripción.

---

## 5. Ranking (Fase 4)

Cada factor es una función `(candidato, contexto) → valor 0..1 | null` con un peso. `null` = desconocido.

| Factor | Peso base | Valor |
|---|---|---|
| Coincidencia | 0,30 | Puntaje de texto + filtros blandos (p. ej. «con queso» en ingredientes publicados) |
| Disponibilidad | 0,15 | Disponible 1 · sin confirmar 0,5 |
| Preparación | 0,10 | Menor es mejor, normalizado entre los candidatos |
| Respuesta | 0,07 | Igual |
| Cumplimiento | 0,10 | Tasa directa |
| Popularidad | 0,08 | Percentil entre los candidatos |
| Precio | 0,08 | Más barato es mejor, normalizado |
| Distancia | 0,07 | Más cerca es mejor |
| Personalización | 0,05 | Ingredientes que le gustan, negocio favorito |
| Rating | 0 | Reservado. Cuando exista: promedio bayesiano (`(C·m + Σ) / (C + n)`), para que un 5,0 con 2 reseñas no gane a un 4,8 con 300 |

**Puntaje** = Σ peso·valor de los factores **conocidos** / Σ pesos conocidos, multiplicado por `0,85 + 0,15 · cobertura` (la fracción del peso que sí se conoce). Así un plato del que no se sabe nada no le gana a uno con datos buenos solo por tener menos datos.

**Modos** (presets de pesos, no código aparte): `best`, `fastest`, `cheapest`, `popular`, `nearest`. «La más rápida» = `fastest`.

**Explicación:** se toman los 2 factores que más aportaron **con su valor real**: «Te recomiendo Cheeseburger de Burger House porque está disponible ahora y tiene el menor tiempo de preparación (18 min) entre las opciones».

Los platos agotados o de negocios cerrados no se recomiendan. Si no hay nada abierto, se dice, y se muestra cuándo abre si se sabe.

---

## 6. Conversación e interfaz (Fases 5 y 6)

- **Estado de la conversación** (se guarda en el equipo, `sessionStorage`, y viaja en cada turno, como el historial de Copilot): `query`, `category`, `filters` (precio máx., incluir/excluir ingredientes, etiquetas, abierto, rating mínimo, distancia máx.), `sort`, `focus` (plato y negocio en foco), `lastResultIds`. El servidor lo valida antes de usarlo.
- **Referencias:** «¿tiene queso?» se resuelve contra el plato en `focus` (el que se tocó o el primero recomendado). Se responde con los ingredientes **publicados**; si no están publicados: «Este negocio no publica los ingredientes de este plato».
- **Pantalla:** una sola. Arriba «¿Qué quieres comer?», compositor fijo abajo, sugerencias como chips. Cada respuesta = burbuja de texto + carrusel o lista de cards. El detalle del plato es una hoja inferior (`sheet`) en el móvil y un panel lateral en escritorio.
- **Cards:** imagen grande, plato, negocio, precio (y precio antes si hay promoción), tiempo, disponibilidad y distancia **solo si se conocen**. Botón «Ver plato».
- **Diseño:** app nativa de iOS en SwiftUI (repo `quanela-ios`), con componentes del sistema (`NavigationStack`, hojas, `Form`, `List`, `Stepper`, SF Symbols, Liquid Glass en iOS 26), el acento `brasa` y los formatos de moneda colombianos de la ADR 0039. Modo claro y oscuro del sistema, placeholders con brillo y hápticos.
- **Android y web:** no están en la v1. El backend no cambia: cualquier cliente usa el mismo `dk-consumer-assistant`.

---

## 7. Seguridad

1. **Lectura pública solo por `dk_public_*`**: `SECURITY DEFINER`, `search_path = public`, `jsonb_build_object` con lista blanca. Nunca `to_jsonb(p)` ni `select *`. Siempre filtran `storefront.published and product published and kitchen.active and org.active`. `revoke all from public` + `grant execute to anon, authenticated`.
2. **No se agregan políticas `to anon`** a tablas privadas, ni vistas públicas.
3. **Las ids internas no salen**: el negocio se identifica por `public_slug`. El plato se identifica por su uuid (ya es visible en la URL de la foto y no da acceso a nada).
4. **Métricas:** solo agregadas, solo con `share_metrics`, nunca montos (ventas, costos, márgenes).
5. **Consumidor ≠ personal:** sus tablas usan `auth.uid()`; la Edge Function reenvía el JWT del consumidor (patrón de `dk-copilot`), sin service role.
6. **Abuso del LLM:** `dk_consumer_ai_allow()` limita por usuario (por minuto y por día). Sin cupo, el pipeline sigue con el parser de reglas: la búsqueda nunca se cae por la IA.
7. **Suite `supabase/tests/consumer_public.sql`**: como `anon`, con un encabezado de Cuenta falsificado y como consumidor:
   - solo aparece lo publicado de Cuentas activas;
   - ninguna clave de la respuesta coincide con `cost|margin|recipe|supplier|phone|email|tax_id|legal_name|kitchen_id|organization_id` (salvo el `whatsapp_phone` publicado a propósito);
   - un negocio no publicado y uno inexistente dan la misma respuesta;
   - un consumidor no lee perfiles de otro;
   - lista exacta de funciones ejecutables por `anon`.

---

## 8. Pedido (Fase 8): diseño, pendiente de aprobación

**v1 (implementada):** descubrir → seleccionar → personalizar → carrito.
- **Personalizar** = quitar ingredientes publicados + nota libre. Va a la `observation` de la línea, que es el mecanismo que la cocina ya ve. **No hay adiciones con precio**, porque no existen en Quanela: no se simulan.
- **Carrito:** un solo negocio a la vez, guardado en el equipo.
- **Enviar:** si el negocio publicó `whatsapp_phone`, el carrito se envía por WhatsApp con el detalle (canal que ya existe). Si no, el botón explica que ese negocio todavía no recibe pedidos por Quanela.

**Siguiente paso (necesita tus decisiones):** `dk_consumer_place_order(p_storefront, p_items, p_fulfillment, p_address, p_idempotency_key)`.
- Reutiliza el núcleo: inserta en `dk_orders`/`dk_order_items` en estado **NUEVO**. El negocio lo ve en su tablero y lo confirma con `dk_confirm_order`, que ya reserva el inventario. Así no se duplica la lógica de stock, cocina ni despacho.
- Precio **siempre del servidor** (el mismo cálculo de `dk_create_conversational_order`), y valida menú, ventana horaria, límite de unidades y horario.

| # | Decisión pendiente | Recomendación |
|---|---|---|
| P1 | Canal nuevo en `dk_order_channel` | `APP` («Quanela») + etiqueta en `orderVisuals.ts` |
| P2 | Vínculo consumidor → cliente de la Cuenta | `dk_consumer_customers(consumer_id, kitchen_id, customer_id)`, resuelto por teléfono **verificado** con `dk_normalize_phone` |
| P3 | Dirección por pedido | Columna `delivery_address` (copia) en `dk_orders` + `fulfillment` (`delivery`/`pickup`). Era el «Futuro» de la ADR 0040 |
| P4 | Idempotencia | Índice único `(kitchen_id, channel, external_reference)` |
| P5 | Pago | Contra entrega en v1; pasarela después con su propio webhook hacia `dk_order_payments` |
| P6 | Seguimiento | RPC del consumidor sobre sus pedidos + sondeo cada 15 s (Realtime no lleva encabezados, ADR 0008 R13) |
| P7 | Reseñas | `dk_reviews` atadas a un pedido **entregado** del mismo consumidor; recién ahí entra el rating al ranking |

---

## 9. Decisiones de esta ADR

| # | Decisión |
|---|---|
| D1 | App nativa de iOS (SwiftUI, iOS 17+) en su propio repo `quanela-ios`, con `supabase-swift` y sesión anónima en el Keychain. Este repo conserva el backend (migración, Edge Function, motor y la publicación en Configuración) |
| D2 | Capa publicada opt-in (`dk_storefronts`, `dk_storefront_products`) + lectura solo por `dk_public_*` |
| D3 | Métricas operativas solo con `share_metrics` y con mínimo de 10 pedidos |
| D4 | Pipeline puro en `supabase/functions/_consumer/`, Edge Function `dk-consumer-assistant` |
| D5 | Claude solo para la intención (modelo por `DK_CONSUMER_MODEL`, por defecto `claude-haiku-5-5`); las respuestas con datos son deterministas |
| D6 | Sesión anónima de Supabase para consumidores; perfil solo con consentimiento. **En producción hay que activar «Anonymous sign-ins» en Auth** |
| D7 | Rating, reseñas, distancia sin ubicación y adiciones con precio: **no se muestran ni pesan** hasta que existan |
| D8 | Pedido directo: diseñado (§8), pendiente de aprobación |

## 10. Plan de implementación

| Fase | Entregable |
|---|---|
| 1–2 | Esta ADR |
| 3 | Migración `dk_consumer_marketplace` (capa publicada, `dk_public_*`, consumidor, cupo) + suite SQL |
| 3–4 | `supabase/functions/_consumer/*` + pruebas vitest |
| 5–6 | `quanela-ios` (chat, cards, detalle) + `dk-consumer-assistant` |
| 7 | Perfil y preferencias con consentimiento |
| 8 | Personalizar + carrito + envío por WhatsApp; pedido directo según §8 |
| — | Configuración → «Quanela Consumer» en la app operativa (publicar negocio y platos) |
| 9 | Validación con los escenarios pedidos, en local, contra datos de prueba **marcados como tales** |

## 11. Resultados (2026-10-07)

### 11.1 Qué se construyó

| Pieza | Dónde |
|---|---|
| Capa publicada, lectura pública, consumidor, cupo de IA | `supabase/migrations/20261007120000_dk_consumer_marketplace.sql` |
| Motor (intención, estado, ranking, respuestas, modelo opcional, pipeline) | `supabase/functions/_consumer/*.ts` |
| Edge Function | `supabase/functions/dk-consumer-assistant/index.ts` |
| App del cliente (chat, cards, detalle, personalizar, carrito, perfil, voz) | Repo `~/Workspace/quanela-ios` (SwiftUI nativo). La primera versión web se validó aquí y se retiró |
| Publicación desde la app operativa | Configuración → **Quanela Consumer** (`src/modules/settings/pages/ConsumerSettingsPage.tsx`, permiso `storefront.manage`) |
| Pruebas | `supabase/functions/_consumer/engine.test.ts` (35), `supabase/tests/consumer_public.sql` (48), datos de prueba `supabase/tests/fixtures/consumer_demo.sql` |

**Decisiones que salieron al implementar**
- **Respuestas sin modelo.** Las reglas entienden las frases de la §21 al instante. Claude solo se consulta cuando no entienden nada o solo adivinaron una búsqueda con palabras sueltas («algo para el guayabo»). Su salida pasa por la misma validación que cualquier dato externo.
- **Coincidencia por cocina.** «Hamburguesas» no muestra las papas de un negocio de hamburguesas si hay platos que coinciden por nombre o categoría.
- **«Sin cebolla» no excluye**: ordena primero lo que no la lleva (según ingredientes publicados) y avisa cuál la lleva y se puede pedir sin ella. En el detalle, el ingrediente aparece ya quitado.
- **Límite de tiempo estricto.** «Tengo 30 minutos» deja por fuera lo que no publica tiempos y dice cuánto tarda lo más rápido conocido (preparación + domicilio).
- **Calificaciones.** Pedirlas responde que todavía no existen. La nota sale una vez, no en cada turno.
- **`supabase/tests/run.py --psql "<comando>"`** corre una suite contra otra base (la local) sin cambiar el modo `--linked`.

### 11.2 Validación (Fase 9), con datos de prueba marcados «(prueba)»

| Escenario | Respuesta (resumen) |
|---|---|
| «Quiero hamburguesas» | 4 opciones. Recomienda Cheeseburger: disponible, menor preparación (~15 min), entre las más pedidas (14 en 30 días). Pregunta: económico, rápido o más pedido |
| «La más rápida» → «¿Tiene queso?» | La más rápida es Cheeseburger… → «Sí, lleva queso cheddar, según lo que publica el negocio» (sobre el plato en foco) |
| «Quiero pizza» | Pizza Margarita ($29.000, promo de hoy; precio normal $34.000) |
| «Algo barato» / «Algo rápido» | Ordena por precio / por preparación, con el valor real |
| «Algo vegetariano» | Solo platos etiquetados por el negocio (vegano cuenta como vegetariano) |
| «Menos de $30.000» | Filtra en SQL por el precio de hoy |
| «Sin cebolla» | Avisa: «Hamburguesa Clásica lleva cebolla: puedes pedirla sin cebolla en la nota» |
| «¿Cuál tiene mejor rating?» | «Todavía no hay calificaciones en Quanela…» y ordena con datos reales |
| «Algo parecido a mi último pedido» | «Todavía no tienes pedidos hechos desde Quanela…» |
| «Quiero parrilla» | Recomienda lo disponible y avisa: «Picada para dos se agotó por hoy» (límite de unidades alcanzado) |
| «Quiero un sánduche» | Nada abierto: «Café Aurora está cerrado (abre mañana…)» |
| «Quiero tacos» | Nada: Taco Norte no está publicado y no aparece |
| «Tengo 30 minutos» | Nada llega a tiempo; «lo más rápido tarda ~35 min» |

La prueba «every figure in a reply comes from the data» verifica que cada cifra de una respuesta exista en los datos.

**Seguridad** (`consumer_public.sql`, 48/48, con los privilegios por defecto de producción): solo lo publicado, ninguna clave privada a ninguna profundidad, el costo 7777 nunca aparece, «no publicado» y «no existe» responden igual, un encabezado de cuenta falsificado no cambia nada, el cajero no publica, un admin no publica platos de otra cuenta, el perfil es solo del consumidor y se borra al retirar el consentimiento, cupo de 10 por minuto, y `dk_public_search_dishes` es la única función nueva que `anon` puede ejecutar.

**Sin regresiones:** `tsc -b` limpio, vitest 96 archivos / 629 pruebas, builds de las tres apps, oxlint sin avisos nuevos. Se probó en el navegador: publicar u ocultar un plato en Configuración cambia los resultados del cliente al instante, el detalle permite quitar ingredientes, el carrito arma el WhatsApp del negocio y el perfil personaliza la búsqueda.

### 11.3 Hallazgos fuera del alcance
- Las migraciones no se reproducen en una base vacía: `20260925120000` necesita un superusuario que solo existe en producción. Para local se usó un bootstrap aparte, fuera del repo.
- En local, el CLI nuevo no da privilegios de tabla por defecto a `anon`/`authenticated` (`auto_expose_new_tables`). Producción sí los da. Para que local se parezca a producción hay que activarlo.
- Las suites `account_scope`, `tenants`, `customer_360` y `permission_catalog` dependen de datos de producción.

### 11.4 Para llevarlo a producción (pendiente de tu aprobación)
1. Aplicar la migración (ensayo previo: `python3 supabase/tests/run.py consumer_public --with supabase/migrations/20261007120000_dk_consumer_marketplace.sql`).
2. Activar **Anonymous sign-ins** en Auth (D6). Sin eso la app busca igual, pero no guarda perfil.
3. Desplegar `dk-consumer-assistant`. `DK_CONSUMER_MODEL` es opcional (`claude-haiku-5-5` por defecto); usa el mismo `DK_ANTHROPIC_API_KEY`.
4. Publicar la app de iOS (`quanela-ios`) con la URL y la llave publicable de producción en `Config/Local.xcconfig` (TestFlight / App Store).
5. Que cada negocio publique en Configuración → Quanela Consumer. Hasta entonces el catálogo público está vacío, como debe ser.
