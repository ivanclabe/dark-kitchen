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
