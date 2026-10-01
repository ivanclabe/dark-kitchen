# ADR 0020: Pedidos como centro operativo, Personal y Turnos, y Quanela Copilot

## Estado
**Aprobada (2026-10-01) con las recomendaciones D1–D10, y ejecutada.** Resultados en la sección 12.

Reglas que se mantienen:
- código y URL nuevas en inglés; textos de la interfaz en español;
- el manual no se toca;
- no se borran datos;
- la autenticación, los roles y la RLS actuales se conservan;
- **Abastecimiento (stock, compras, proveedores) no se modifica.**

---

## 1. Auditoría (2026-10-01)

### 1.1 Datos: ya hay una sola fuente
- **Un solo pedido en la base.** `dk_orders`, `dk_order_items`, `dk_order_status_history`, `dk_kitchen_tickets` (prioridad), `dk_deliveries` y `dk_delivery_riders`.
- **Cocina no copia pedidos.** Lee `dk_orders` filtrando por estado.
- **Inventario no está duplicado en Cocina.**
  - Al confirmar, la base reserva stock (`dk_confirm_order`).
  - Cocina solo refresca las cachés de stock después de cambiar un pedido (`useKitchen.ts`).
  - Abastecimiento sigue siendo el único dueño de insumos, compras y proveedores.

### 1.2 Interfaz: Cocina se apropió de Pedidos
| Hoy | Problema |
|---|---|
| `/orders` y `/delivery` redirigen a `/kitchen`; el rail solo muestra «Cocina» | El pedido no tiene casa propia: crear, confirmar, cobrar y despachar viven dentro de Cocina |
| Dos capas de datos sobre `dk_orders`: `kitchen/api/kitchen.ts` (tablero) y `orders/api/orders.ts` (detalle, historial), cada una con su consulta y su mapeo | Doble mantenimiento. `dk_cancel_order` y el historial de estados se llaman desde los dos lados |
| `delivery/` es una capa suelta que solo usa Cocina | El despacho no tiene vista propia |
| El historial de pedidos es un cajón dentro de Cocina | No hay lista con búsqueda y filtros para caja o administración |
| El rol DELIVERY entra por `kitchen.view` porque no tiene `orders.view` | El domiciliario ve el tablero de cocina en lugar de su despacho |

### 1.3 Personal: hay usuarios y roles, no hay turnos
- **Ya existe:** persona ↔ cuenta (`dk_kitchen_members`), roles por cuenta (`dk_member_roles`), domiciliarios enlazables a un usuario (`dk_delivery_riders.user_id`) y horario de apertura (`dk_kitchen_hours`).
- **No existe nada de turnos.**

### 1.4 IA: la base para Copilot ya está
- **Catálogo de modelos.** Haiku 4.5, Sonnet 5.5 y Opus 5.5 están activos.
- **Funciones de IA por organización** (ADR 0018), con cuota por plan (`dk_ai_run_allowed`).
- **Registro de cada análisis** en `dk_ai_insights`, que AI Monitoring del portal ya lee.
- **Edge Function `dk-ai-insights`.** Corre con el JWT del usuario y la cuenta activa (`x-dk-kitchen-id`), así que la RLS aplica.
- **Reportes ya calculados en la base.** Ventas por día, platos top, rentabilidad, mermas y compras por proveedor.
- **Lo que falta:** un asistente que responda preguntas libres.

---

## 2. Arquitectura propuesta

```
                    ┌─────────────── Quanela Copilot (panel en toda la app) ───────────────┐
                    │  pregunta → herramientas de solo lectura (con tus permisos) → respuesta │
                    └──────┬──────────┬───────────┬──────────┬───────────┬───────────┬──────┘
                           │          │           │          │           │           │
   Clientes ──────► PEDIDOS (centro operativo) ◄── Catálogo (platos → recetas → insumos)
                      │  Tablero · Lista · Despacho
                      │
          ┌───────────┼──────────────┐
          ▼           ▼              ▼
       COCINA      DESPACHO       Abastecimiento (sin cambios)
    (vista KDS de   (vista de      la confirmación reserva stock;
     los mismos     los mismos     Cocina y Pedidos solo lo leen
     pedidos)       pedidos)
                      ▲
   PERSONAL Y TURNOS ─┘ (quién está de turno: domiciliarios, cocina, caja)
```

**Principio:** el pedido es la única entidad operativa. Cocina y Despacho son **vistas** de él, con su propio foco y sin tablas ni consultas propias.

---

## 3. Pedidos: el centro operativo
**Módulo `src/modules/orders`, ruta `/orders`.** Es el dueño único de los datos del pedido en el frontend.

### 3.1 Una sola capa de datos
- **Consultas.** `orders/api` tiene la única consulta del pedido, con su mapeo único `Order`: cliente, ítems, estado de cocina, prioridad, entrega y pagos.
- **Hooks de vista.** `useOrders({ statuses, range, search })` alimenta a todas las vistas (Pedidos, Cocina, Despacho y el Dashboard) con las mismas claves de caché. Así, un cambio en una vista se ve al instante en las demás.
- **Transiciones y acciones.** Las transiciones (máquina de estados, hoy en `kitchen/kanban/transitions.ts`) y las acciones (confirmar, cancelar, despachar, entregar, prioridad) pasan a `orders/`. Cocina las importa.
- **Cachés de stock.** Su refresco se centraliza en un solo lugar de `orders/`, sin duplicados.
- **Despacho.** `delivery/` se integra en `orders/dispatch`, que conserva la API de domiciliarios.

### 3.2 Pantallas
| Vista (`/orders?view=…`) | Para quién | Qué |
|---|---|---|
| **Tablero** (por defecto) | Caja, administración | El flujo completo NUEVO → EN RUTA, el kanban actual movido aquí: confirmar, avanzar, cancelar, prioridad |
| **Lista** | Caja, administración | Todos los pedidos (también entregados y cancelados) con búsqueda por número, cliente o plato; filtros de fecha, estado, canal y pago; reemplaza el cajón «Historial» |
| **Despacho** | Caja, domiciliarios | Listos para salir y en ruta. Primero aparecen los domiciliarios **de turno ahora**. El rol DELIVERY ve solo sus entregas |

**Detalle del pedido (`/orders/:number`)**, en cajón o en página según el ancho de pantalla, es el punto que une todo:
- **Cliente:** saldo y pedidos anteriores, con enlace a Clientes.
- **Ítems:** plato → receta → insumos reservados, con enlaces a Catálogo y Abastecimiento.
- **Línea de tiempo de estados:** quién y cuándo (`dk_order_status_history`).
- **Cocina:** estado por ítem.
- **Entrega:** domiciliario y tiempos.
- **Pagos.**

**Flujo operativo:**
- `N` crea un pedido y `/` busca;
- cada tarjeta avanza con un toque;
- el pedido nuevo suena;
- funciona en tablet y celular.

---

## 4. Cocina: una vista especializada de los pedidos
**`/kitchen` se queda con lo que es de cocina:**
- **Pantalla de cocina (KDS):** solo CONFIRMADO → EN PREPARACIÓN → LISTO, por ítem, ordenada por tiempo y prioridad, con letra grande para la tablet de la línea.
- **Vista de tiempos (SLA)** y alertas de pedidos detenidos.
- **Voz:** comandos, «Oye Quanela» y voz de cocina.
- **Configuración de cocina:** horario y tiempos objetivo.

**Ya no tiene** su propia consulta de pedidos, ni crear, confirmar, despachar o historial. Todo eso es de Pedidos, aunque desde la cocina se puede abrir el detalle del pedido.

**Accesos:**
- El rol KITCHEN entra directo a `/kitchen`.
- Caja entra a `/orders`.
- Ambos ven los mismos pedidos al mismo tiempo.

---

## 5. Abastecimiento: sin cambios
- No se tocan sus pantallas, tablas ni funciones.
- La única «duplicación» con Cocina era el refresco de cachés de stock, que pasa a Pedidos (sección 3.1). El comportamiento es el mismo.

---

## 6. Personal y Turnos
**Módulo `src/modules/staff`, ruta `/staff`.**

### 6.1 Datos (sin duplicar personas ni roles)
**`dk_shifts`**, cada fila un turno:
- **Campos:**
  - `kitchen_id`;
  - `user_id`: debe ser miembro de la cuenta;
  - `role_id`: el rol con el que trabaja ese turno, uno de sus roles en `dk_member_roles`;
  - `starts_at` y `ends_at`;
  - `break_minutes` y `notes`;
  - `status`: programado o cancelado;
  - `clock_in_at` y `clock_out_at`;
  - `created_by` y fechas.
- **Turnos flexibles:**
  - cualquier hora de inicio y fin;
  - turnos que cruzan la medianoche;
  - turnos partidos (varias filas el mismo día);
  - duración de 15 min a 16 h;
  - sin plantillas rígidas.
- **Sin solapes.** Una persona no puede tener dos turnos que se cruzan, ni siquiera en cuentas distintas de la organización. Lo impide una restricción de exclusión con `btree_gist`, que está disponible en el proyecto.
- **Personas y roles.** Salen de `dk_users`, `dk_kitchen_members` y `dk_member_roles`; no se copian.
- **Domiciliarios.** Salen de `dk_delivery_riders.user_id`. Si un domiciliario no tiene usuario, no tiene turnos y se sigue asignando como hoy.

**Funciones:**
- `dk_clock_in` y `dk_clock_out`: entrada y salida propias. Si no tenía turno, crea uno «sin programar».
- `dk_copy_shifts(desde, hasta)`: copia la semana anterior.
- `dk_shifts_now()`: quién está de turno ahora.

### 6.2 Permisos
- **Permisos nuevos en el catálogo.** `staff.view` (ver el plan de turnos de la cuenta) y `staff.manage` (crear, editar, cancelar y copiar turnos).
- **Quién los recibe.** ADMIN y MANAGER reciben los dos. El resto de roles no recibe ninguno.
- **Lo que no necesita permiso.** Cualquier persona ve **sus propios turnos** y marca su entrada y salida.
- **Dónde se aplica.** La RLS y las funciones lo exigen en la base; la interfaz solo lo refleja.

### 6.3 Pantallas
| Vista | Qué |
|---|---|
| **Hoy** | Quién está de turno ahora y por rol, quién marcó entrada, quién llega tarde o no llegó, próximos turnos |
| **Semana** | Grilla de personas × días con bloques de turno: crear con un toque, editar, copiar la semana anterior, filtrar por rol, horas planificadas por persona. Muestra el horario de apertura de la cuenta |
| **Mis turnos** | En el menú de usuario: próximos turnos y botón «Marcar entrada / salida» |
| **Horas** | Horas planificadas frente a trabajadas por persona y semana (sin nómina) |

**Integraciones:**
- Despacho muestra primero a los domiciliarios de turno.
- Copilot responde «¿quién está de turno?».
- El Dashboard muestra «En turno ahora».

---

## 7. Quanela Copilot
**Panel lateral disponible en toda la cuenta.** Se abre con un botón ✦ en la barra superior o con `Ctrl/⌘ + J`.

**Responde preguntas sobre datos reales.** Por ejemplo:
- «¿Cuánto vendimos esta semana frente a la pasada?»
- «¿Qué platos llevan pollo y cuánto pollo queda?»
- «¿Qué pedidos se demoraron más de 30 minutos hoy?»
- «¿Quién es el cliente que más compra y cuánto debe?»
- «¿Quién está de turno en la noche?»

### 7.1 Cómo funciona
1. **La Edge Function `dk-copilot`** recibe la pregunta y el historial corto de la conversación, que vive solo en el navegador. Corre **con el JWT de la persona y la cuenta activa**, igual que `dk-ai-insights`.
2. **El modelo** usa *tool use* sobre **herramientas de solo lectura**. Cada herramienta es una función SQL `dk_copilot_*`, *security invoker*, que exige un permiso y respeta la RLS.

   | Herramienta | Permiso | Datos |
   |---|---|---|
   | `sales` | `reports.view` | Ventas por día, canal, plato o cliente y comparación entre periodos (reutiliza los reportes existentes) |
   | `orders` | `orders.view` | Búsqueda de pedidos y detalle de un pedido: tiempos, ítems, cliente y entrega |
   | `kitchen_performance` | `kitchen.view` | Tiempos de preparación, demoras frente al tiempo objetivo, pedidos detenidos |
   | `products` | `products.view` | Platos, recetas, costo y margen (el margen exige `reports.profitability`), en qué platos se usa un insumo |
   | `ingredients` | `inventory.view` | Stock, cobertura, consumo por periodo, por agotarse (lee lo mismo que Abastecimiento) |
   | `purchases` | `purchasing.view` | Compras por proveedor y por insumo |
   | `customers` | `customers.view` | Clientes top, historial; saldos solo con `receivables.view` |
   | `deliveries` | `dispatch.view` | Entregas por domiciliario y tiempos |
   | `staff` | `staff.view`, o solo lo propio | Turnos, quién está ahora y horas |

   **Solo se ofrecen al modelo las herramientas que la persona tiene permitidas,** y la base vuelve a comprobarlo. Una persona de cocina no puede preguntar por ventas, y Copilot se lo dice.
3. **La respuesta:**
   - las cifras salen **solo** de las herramientas;
   - si un dato no existe, lo dice («no tengo ese dato»);
   - trae **enlaces** a pedidos, platos, insumos, clientes o personas, validados contra lo que devolvieron las herramientas;
   - las tablas cortas se muestran como tablas;
   - Copilot nunca modifica nada (v1 es de solo lectura).
4. **Control:**
   - nueva función de IA `copilot` en el catálogo, gobernada por plan, organización y cuenta como las demás (ADR 0014 y 0018);
   - cuota con `dk_ai_run_allowed`;
   - el modelo lo elige la plataforma en Administration;
   - cada pregunta queda en `dk_ai_insights` con la pregunta, las herramientas usadas, los tokens y la latencia, así que aparece en AI Monitoring del portal;
   - las conversaciones no se guardan como tabla aparte.

### 7.2 Interfaz
- **Preguntas sugeridas** según el rol y la pantalla en que estás. Si estás en Pedidos, sugiere preguntas de pedidos.
- **Pasos visibles** mientras responde: «Consultando ventas…».
- **Botón para copiar** la respuesta.
- **Aviso fijo:** «Responde con los datos de esta cuenta y tus permisos».

---

## 8. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Nombre de la marca | **Quanela**, como en todo el producto |
| **D2** | Navegación | Rail: **Dashboard · Pedidos · Cocina · Catálogo · Abastecimiento · Clientes · Personal · Reportes**. Copilot va en la barra superior, no en el rail |
| **D3** | Inicio por rol | Caja → Pedidos; Cocina → Cocina; Domiciliario → Despacho; el resto → Dashboard |
| **D4** | Rol DELIVERY | Entra a Pedidos → Despacho con `dispatch.view` y se le quita `kitchen.view`, que ya no necesita. Los roles personalizados no se tocan |
| **D5** | Modelo de Copilot | **Sonnet 5.5** por defecto (buen equilibrio entre razonamiento sobre datos y costo); se cambia en Administration |
| **D6** | Planes con Copilot | Los mismos que hoy incluyen las funciones de IA de cocina y abastecimiento |
| **D7** | Copilot en v1 | **Solo lectura.** Acciones como «crea una compra» quedan para una versión posterior, con confirmación |
| **D8** | Turnos entre cuentas | **Sin solapes** de una misma persona en toda la organización |
| **D9** | Permisos `staff.*` | ADMIN y MANAGER los reciben; el resto ve solo lo propio |
| **D10** | Respuesta de Copilot | **Sin streaming** en v1 (respuesta completa con pasos visibles); el streaming queda para después |

---

## 9. Orden de ejecución
| Fase | Qué |
|---|---|
| 1 | **Pedidos, datos:** capa única en `orders/` (consulta, mapeo, hooks, transiciones, acciones, despacho); Cocina y Dashboard pasan a usarla; se elimina `kitchen/api/kitchen.ts` y se integra `delivery/` |
| 2 | **Pedidos, pantallas:** `/orders` con Tablero, Lista, Despacho y Detalle; atajos; rutas y redirecciones (`/delivery` → Despacho) |
| 3 | **Cocina como vista:** KDS de preparación, tiempos y voz sobre los hooks de Pedidos; quitar lo que pasó a Pedidos |
| 4 | **Navegación y roles:** rail, inicio por rol (D2, D3, D4) |
| 5 | **Personal, base:** `dk_shifts`, exclusión, RLS, permisos `staff.*`, entrada y salida, copiar semana, quién está ahora; suite SQL `staff_shifts` |
| 6 | **Personal, pantallas:** Hoy, Semana, Mis turnos, Horas; integración con Despacho y Dashboard |
| 7 | **Copilot, base:** funciones `dk_copilot_*` con permiso y RLS, función `copilot` en el catálogo, Edge Function `dk-copilot`; suite SQL `copilot_tools` (cada herramienta, con y sin permiso, aislamiento entre cuentas) |
| 8 | **Copilot, interfaz:** panel, sugerencias, enlaces, pasos |
| 9 | **Validación:** todas las suites SQL, vitest (nuevas pruebas de la capa de pedidos, transiciones, turnos y Copilot), `tsc`, `oxlint`, build de ambas apps, recorrido en el navegador |
| 10 | **Documentación:** esta ADR con resultados y la arquitectura (el manual no) |

## 10. Riesgos
| Riesgo | Mitigación |
|---|---|
| Mover el tablero rompe algo de cocina que hoy funciona | Fases 1 a 3 sin cambiar la lógica, solo de lugar; las pruebas actuales de transiciones, voz y tablero se mantienen y corren en cada fase |
| Copilot inventa o filtra datos | Solo cifras de herramientas; herramientas por permiso con RLS; enlaces validados; pruebas de aislamiento entre cuentas |
| Costo de Copilot | Cuota por plan y por cuenta, límite de 6 llamadas a herramientas por pregunta, límite de filas por herramienta, todo visible en AI Monitoring |
| Turnos con zona horaria | Se guardan en `timestamptz` y se muestran en la zona horaria de la cuenta |

## 11. Qué necesito de ti
1. **Aprobar esta ADR**, con las decisiones D1 a D10 confirmadas o corregidas.
2. **Para probar en el navegador,** iniciar sesión en el panel de vista previa (yo no escribo contraseñas).
3. **No hace falta ninguna clave nueva:** Copilot usa la de Anthropic que ya está en los secretos.

---

## 12. Resultados (2026-10-01)

### 12.1 Lo construido
| Fase | Resultado |
|---|---|
| 1 | **Una sola capa de datos del pedido** (`orders/api`, `orders/hooks`): una consulta y un tipo `Order` para Pedidos, Cocina, Despacho, Dashboard y Clientes, con una sola raíz de caché (`['orders']`) y un solo lugar que refresca el stock. Se eliminaron `kitchen/api/kitchen.ts`, `kitchen/hooks/useKitchen.ts`, `kitchen/types` y el módulo `delivery/`. Búsqueda en la base: `dk_order_search` |
| 2 | **`/orders`**: Tablero (flujo completo), Lista (búsqueda por número, cliente, teléfono o plato; filtros de fecha, estado y canal; reemplaza el cajón Historial) y Despacho. **Detalle `/orders/:id`**: cliente, platos con enlace a su receta, insumos reservados o consumidos, cocina por plato, entrega, totales y línea de tiempo con quién hizo cada cambio. Atajos: `N` y `/`. Alerta sonora de pedidos nuevos de WhatsApp |
| 3 | **Cocina** es la pantalla de preparación: las mismas órdenes, solo En cola → Preparando → Listo, con tiempos, voz, «Oye Quanela», alertas de detenidos y tamaño grande. No confirma ni despacha (alcance `KITCHEN_SCOPE`); el tablero es el mismo componente con otras columnas |
| 4 | Menú: Dashboard · Pedidos · Cocina · Catálogo · Abastecimiento · Clientes · Personal · Reportes. Inicio por rol. El rol DELIVERY perdió `kitchen.view` y ve la dirección y el teléfono del cliente de sus entregas |
| 5 | `dk_shifts` con restricción de no solape en la organización, RLS, `staff.view`/`staff.manage` (ADMIN y MANAGER), `dk_clock_in`/`dk_clock_out`, `dk_copy_shifts`, `dk_shifts_now`, `dk_staff_members` |
| 6 | **`/staff`**: Hoy, Semana (personas × días, horario de apertura, copiar semana) y Horas (planificadas frente a trabajadas). **`/my-shifts`** para todos (menú de usuario). Despacho ordena primero a los domiciliarios de turno; el Dashboard muestra «En turno ahora» |
| 7 | Función de IA `copilot` (planes business y enterprise, Sonnet 5.5, intervalo de 5 s), permiso `copilot.use` (todos los roles del sistema), 10 herramientas `dk_copilot_*` y `dk_copilot_context`, y Edge Function `dk-copilot` (desplegada) |
| 8 | Panel Copilot: botón ✦ en la barra superior (escritorio y móvil) y `Ctrl/⌘ + J`. Incluye preguntas sugeridas por rol y pantalla, pasos consultados, copiar, nueva conversación y consultas restantes del día. Los enlaces llevan a pedidos, recetas, insumos y clientes. Las respuestas se muestran sin HTML |

### 12.2 Ajustes durante la ejecución
| Ajuste | Motivo |
|---|---|
| El detalle usa `/orders/:id` y no el número | Los números se reciclan (1000–9999) y solo son únicos mientras el pedido está abierto |
| `/` de la cuenta es «tu inicio» (redirige según el rol) y el Dashboard pasa a `/dashboard` | Sin esto, caja (que tiene Dashboard) no podía empezar en Pedidos (D3) y a la vez seguir abriendo el Dashboard |
| La vista «día anterior» de Cocina se quitó | Pedidos → Lista cubre el historial con filtros de fecha |
| Permiso nuevo `copilot.use` | No había un permiso común a todos los roles para gobernar Copilot. Cada herramienta exige además el suyo |
| El intervalo mínimo entre ejecuciones de IA bajó de 30 s a 2 s (restricción, función de plataforma y pantalla del portal) | Una conversación necesita segundos, no medio minuto. Cada función conserva su valor; solo Copilot usa 5 s |
| `dk_staff_members` y `dk_copilot_context` | MANAGER planifica turnos sin `team.view`; Copilot necesita la zona horaria, la moneda y las áreas permitidas de la persona |
| No hay solapes de turnos en toda la organización (D8) | La exclusión usa `organization_id`, que se llena desde la cuenta |
| La cuota diaria de IA es compartida | Copilot cuenta en el mismo límite diario por cuenta que las demás funciones (`ai_runs_per_day` del plan). Se ajusta en el portal → Administration → IA → Políticas |

### 12.3 Validación
- **SQL:** 653/653 en 27 suites. Las nuevas son `orders_search` (12), `dispatch_riders` (8), `staff_shifts` (24) y `copilot_tools` (35). Esta última prueba cada herramienta con y sin permiso por rol, el aislamiento entre cuentas, las guardias de fechas y el acceso anónimo. Se ajustaron los conteos del catálogo en `permission_catalog`, `features`, `ai_platform`, `plans` y `observability`.
- **Vitest:** 255/255. Son nuevas las de mapeo del pedido, navegación por rol, horas y semanas de turnos, sugerencias de Copilot y Markdown seguro (sin HTML, solo enlaces internos).
- **`tsc`:** sin errores.
- **`oxlint`:** 17 avisos, igual que antes.
- **Builds:** Quanela y el portal compilan.
- **Edge Function `dk-copilot`:**
  - responde 401 sin sesión;
  - rechaza la clave anónima;
  - una pregunta real necesita una sesión.
- **Navegador:** el servidor de desarrollo carga Pedidos, Cocina, Personal, Mis turnos y Copilot sin errores. **Pendiente con tu sesión:**
  - recorrer Pedidos (Tablero, Lista, Despacho y detalle);
  - Cocina;
  - Personal (crear, copiar, marcar entrada y salida);
  - hacer preguntas reales a Copilot.
