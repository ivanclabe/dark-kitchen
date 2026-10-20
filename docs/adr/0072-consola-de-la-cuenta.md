# ADR 0072: La consola de la cuenta (navegación y Destacado)

## Estado
**Aprobada (2026-10-20).** El usuario pidió reescribir la interfaz de la cuenta tomando como referencia la consola de ElevenLabs, y crear las funciones o pantallas que hagan falta. Decisiones del propietario: tema claro por defecto (quien eligió otro lo conserva); Inicio = Destacado + franja «Ahora mismo»; plan completo aprobado.

## Contexto (auditoría)

**Navegación (`src/app/AppLayout.tsx`, `navigation.ts`):**
- Hay un riel de 64 px solo con íconos. El nombre de cada módulo se ve únicamente en un tooltip.
- Son 13 destinos en 4 grupos sin título: Día a día, Clientes y ventas, Negocio y Administración.
- Lo que no cabe se va a un menú «Más» (`fitRail`).
- Las subsecciones de cada módulo solo se ven al entrar al módulo, en pestañas:
  - Abastecimiento: Stock, Preparaciones, Compras, Proveedores.
  - Finanzas: Rentabilidad, Por pagar, Pagos, Gastos, Nómina, Flujo de caja.
  - WhatsApp: Mensajes, Conexión, Avisos, Pedidos, n8n, Registro.
  - Personal: Hoy, Semana, Horas.
  - Configuración: General, Facturación, IA y voz, Integraciones, Actividad.

**Encabezado:**
- En escritorio tiene 48 px: la cuenta y el rol a la izquierda; En vivo, «Oye Quanela» y Copilot a la derecha.
- La campana y el menú de usuario están al pie del riel.

**Inicio (`DashboardPage`):**
- Muestra listas y números sueltos: Necesita atención, Pedidos recientes, Cocina ahora, En turno, Cartera y compras, y el consejo del día.
- No hay gráficas, rango de fechas ni comparación en el tiempo.
- Las series por día existen en Insights (`dk_insights`). No existen por hora.

**Búsqueda:** no hay búsqueda global ni atajos para crear cosas (no hay paleta de comandos).

## Referencia (ElevenLabs) y lo que se toma
- **Barra lateral ancha y clara**, con nombres visibles y grupos titulados (Configurar, Monitorizar, Desplegar). Se puede plegar.
- **Arriba de la barra:** «Buscar y crear ⌘K» y el selector del espacio de trabajo (aquí, la cuenta).
- **Barra superior:** dónde estás a la izquierda; las acciones del momento a la derecha («Vista previa», «Habla con el Arquitecto» y un botón principal con menú).
- **Inicio «Destacado»:**
  - una fila de tarjetas de aviso (alta gravedad, documentación, novedades);
  - paneles de métricas con su número grande y una gráfica;
  - un selector de rango (anterior / «Últimos 7 días · UTC-5» / siguiente) y de granularidad («Cada hora»);
  - «Ver dashboards» y un engranaje para elegir los paneles.

## Decisión propuesta

### 1. Barra lateral con nombres
- **Arriba:**
  - el logo;
  - **Buscar y crear** (⌘K / Ctrl+K);
  - el **selector de cuenta**, que reemplaza el indicador del encabezado: la cuenta, el rol y el cambio de cuenta.
- **Grupos con título:**
  - **Operar:** Inicio, Centro de operaciones, Planificador de menús, Abastecimiento.
  - **Vender:** Clientes, Menú público, WhatsApp, App de clientes.
  - **Gestionar:** Personal, Análisis, Finanzas.
  - **Administrar:** Usuarios, Configuración.
- **Subsecciones:** en el módulo activo, sus subsecciones aparecen anidadas debajo. Es la misma ruta que las pestañas actuales, que se mantienen dentro de la página.
- **Pie:** la campana, «Invitar a tu equipo» (solo si puede gestionar usuarios) y el menú de usuario.
- **Plegado:**
  - se pliega a íconos con el botón ⊟ de la barra superior (o `[`) y se recuerda en el equipo;
  - entre 768 y 1279 px empieza plegada;
  - en el teléfono se abre como cajón desde el menú, con el mismo contenido.
- Desaparece «Más»: con nombres y desplazamiento propio caben todos los módulos.

### 2. Barra superior
- **Izquierda:** el botón para plegar y la ruta (Cuenta › Módulo › Sección).
- **Derecha:**
  - En vivo;
  - **Vista previa** del menú público (si está publicado);
  - **Oye Quanela**;
  - **Habla con Copilot**;
  - un **botón principal según el permiso**: «Nuevo pedido», con un menú para «Nuevo cliente», «Registrar compra» y «Nuevo plato».

### 3. Buscar y crear (nuevo)
- **Ir a:** cualquier módulo o subsección que el rol pueda abrir.
- **Crear:** pedido, cliente, compra, plato o insumo, según los permisos.
- **Buscar:** clientes, pedidos por número y platos.
  - Usa las consultas que ya existen; la base sigue validando permisos.
  - No crea endpoints nuevos.
- Es accesible: cuadro de diálogo con lista navegable por teclado, Escape para cerrar, y en el teléfono ocupa la pantalla.

### 4. Inicio «Destacado»
- **Fila de tarjetas.** Se pueden descartar por ese aviso, en ese equipo:
  - **Alta gravedad:** lo más urgente de «Necesita atención» (pedidos atrasados, stock en cero, pago fallido, documentos sin completar), con su acción.
  - **Guía:** el artículo de ayuda que corresponde al punto donde está el negocio (sin menú publicado, sin recetas…).
  - **Novedades:** las de la última versión.
- **Rango:** anterior / siguiente y «Hoy · Últimos 7 días · Últimos 30 días · Este mes», en la zona horaria de la cuenta.
- **Granularidad:** «Cada hora» o «Cada día»; con rangos de más de 7 días solo «Cada día».
- **Paneles de métricas**, cada uno con su número grande, la variación frente al periodo anterior y una gráfica:

  | Panel | Muestra |
  |---|---|
  | Pedidos | número y línea |
  | Ventas | valor y área |
  | Ticket promedio | valor y línea |
  | Tiempo en cocina (de Preparando a Listo) | promedio y línea |
  | Cancelados | porcentaje y línea |
  | Costo de comida | porcentaje; solo con permiso de rentabilidad |
  | Platos más vendidos | barras horizontales |
  | Canales | Manual, Menú web, WhatsApp, Teléfono |

  Un panel sin datos lo dice («Aún no hay pedidos en este rango»), sin inventar ceros.
- **Personalizar (engranaje):** mostrar u ocultar paneles y cambiar su orden. Se guarda por persona y por cuenta, en el equipo.
- **Ver análisis:** lleva a Análisis con el mismo rango.
- **Lo que se conserva:** lo operativo de hoy (Cocina ahora, En turno, Cartera) queda en una franja «Ahora mismo» debajo de los paneles.

### 5. Base de datos
- Una RPC nueva y solo de lectura, `dk_dashboard_series(p_from, p_to, p_granularity)`:
  - devuelve los cubos por hora o por día, en la zona horaria de la cuenta, con pedidos, ventas, ticket, tiempo en cocina, cancelados, canales, platos más vendidos y costo (este último solo con `reports.profitability`);
  - valida `reports.view` o `dashboard` y la cuenta activa (`dk_current_kitchen_id`);
  - limita el rango a 92 días y a cubos por hora solo hasta 7 días.
- Sin tablas nuevas.

### 6. Estilo
- Se mantienen los tres temas (Oscuro, Claro, Neutro) y los tokens.
- La consola se diseña primero en claro, como la referencia, y se verifica en los tres.
- Las tarjetas son de borde fino y radio suave, con poco relleno de color.
- Las gráficas son de una línea con rejilla tenue, con el formato de recharts ya instalado.

### 7. Lo que no cambia
- Las rutas y los permisos.
- Las páginas de cada módulo por dentro, que solo heredan el nuevo marco.
- El portal Global Admin y el menú público.

## Verificación prevista
- **SQL:** suite `dashboard_series`:
  - cubos por hora y por día en la zona horaria de la cuenta;
  - costo solo con el permiso;
  - aislamiento entre cuentas;
  - límites de rango.
- **Vitest:**
  - barra lateral (grupos según permisos, subsecciones, plegado recordado);
  - Buscar y crear (teclado, permisos, navegación);
  - Destacado (rango, granularidad, sin datos, personalizar, descartar avisos).
- **Navegador:** escritorio, tablet y teléfono, en los tres temas; contraste y foco.
- **Regresión:** tsc, lint, vitest completo y los dos builds; el contrato de páginas (ADR 0029) se mantiene.

## Implementación (2026-10-20)
- **Base de datos:** `20261020100000_dk_dashboard_series.sql` (`dk_dashboard_series`) y `20261020110000_dk_legal_cookies_v1_1.sql`.
  - La Política de Cookies pasa a la versión 1.1, informativa: no pide una nueva aceptación.
  - Registra tres claves nuevas del navegador: `dk-sidebar-collapsed`, `dk-home-panels:*` y `dk-home-dismissed`.
- **Marco** (`src/app/shell`):
  - `Sidebar`, `TopBar`, `CommandPalette`, `ShellActions` (los diálogos de crear que ya existían) y `subsections`.
  - Las subsecciones salen de las mismas listas y permisos que las pestañas de cada página: `supplyViews`, `financeTabs`, `integrationsTabs`, `operationsViews` y `settingsSections`.
  - Desaparecen el riel y «Más» (`fitRail`).
  - `ContextIndicator` gana las variantes `sidebar` e `icon`, y `Popover` la posición `right-start`.
- **Destacado** (`src/modules/dashboard`):
  - componentes `HomeHighlights`, `HomeMetrics` y `MetricPanel`;
  - lógica en `lib/range` (rangos en la zona horaria de la cuenta), `lib/panels` (preferencias por persona y cuenta) y `lib/delta`.
  - La página queda así: Destacado, luego «Ahora mismo» (lo que era Inicio) y el consejo del día.
- **Planificador:** `?plato=nuevo` abre un plato vacío, para «Nuevo plato».
- **Tema:** claro por defecto en toda la app (`defaultThemeFor`, `index.html`). Un tema elegido se respeta.
- **Ayuda:**
  - artículo nuevo «Moverte por Quanela»;
  - «Inicio: Destacado» reescrito;
  - campana y Configuración ajustadas;
  - Novedades del 20 de octubre;
  - base de conocimiento de Copilot regenerada.

## Verificación
- **SQL:**
  - `dashboard_series` 20/20: cubos por hora y por día en la hora local (las 23:30 quedan en su día), reglas de venta, tiempo en cocina, cancelados, costo solo con permiso, aislamiento y límites.
  - `legal_compliance` 81/81, ajustada para no depender de las versiones nuevas.
- **Vitest:** 979 pruebas. Las nuevas cubren:
  - la barra lateral: grupos por permiso, secciones y estado plegado;
  - Buscar y crear: ⌘K, permisos, Enter y crear;
  - las subsecciones;
  - el rango, la comparación y los paneles;
  - el tema claro.
- **Revisiones:**
  - tsc limpio;
  - lint en su línea base (13 advertencias);
  - `build` y `build:admin` pasan.
- **Navegador** (stack local):
  - Destacado en tema claro y oscuro;
  - cada hora y el periodo anterior;
  - paneles personalizados;
  - Buscar y crear: ir a Compras y crear un cliente;
  - barra plegada;
  - teléfono: menú completo, sin desplazamiento lateral;
  - sin errores en consola.

## Pendiente
- **Capturas de la ayuda:** hay que regenerarlas con `scripts/help-screenshots.ts`. Las de Inicio y la navegación muestran todavía el riel anterior.
- **Despliegue:** antes del frontend van las dos migraciones y la función que usa `_shared/kb.ts` (la base de conocimiento de Copilot).
