# ADR 0018: IA centralizada en la organización, menú más rápido e imágenes de platos

## Estado
**Propuesta (2026-09-30), pendiente de aprobación.** Una vez aprobada, se ejecuta completa (sección 8) sin más aprobaciones. Si apruebas sin comentarios, cada decisión de la sección 7 toma su recomendación. El código nuevo va en inglés, los textos de la interfaz en español y el manual no se toca.

La ADR 0017 (voz para todo el flujo del pedido) queda **en pausa**.

---

## 1. Auditoría (2026-09-30)

### 1.1 Configuración de IA: hoy está repartida en tres lugares

| Dónde | Qué se configura hoy | Quién |
|---|---|---|
| **Plataforma** (`/admin` → IA) | <ul><li>Encender o apagar cada función para todos</li><li>Modelo e intervalo mínimo por función</li><li>**Valores por defecto de los umbrales**</li><li>Proveedores y modelos (costo por token)</li><li>Catálogo de voces</li><li>Uso y costo</li><li>Límites por plan</li></ul> | Operador de Quanela |
| **Organización** (`/o/:org/ai`) | <ul><li>Qué funciones ofrece y en qué cuenta las activa</li><li>Voz de cocina por defecto y si cada cuenta la puede cambiar</li><li>Uso por cuenta</li></ul>**No tiene umbrales de IA:** la base lo permite (`dk_set_org_feature_settings`), pero no hay pantalla. | `features.manage` |
| **Cuenta** (Configuración → IA y voz) | <ul><li>**Umbrales de IA por cuenta:** días de cobertura, frecuencia, avisos por voz… (`FeatureCard`, permiso `ai.manage`)</li><li>«Analizar ahora»</li><li>Voz de cocina de la cuenta</li><li>Estado de cada función</li><li>Preferencias **del equipo**: motor de reconocimiento y manos libres</li></ul> | `ai.manage`, `settings.manage` |

**Duplicidades encontradas:**
- **Los umbrales de IA se editan en dos lugares,** plataforma (por defecto) y cuenta, y falta la capa que debería mandar: la organización.
- **La voz de cocina se edita en dos lugares:** organización y cuenta.

**Fuente de verdad actual:** `dk_my_features` calcula en la base la configuración efectiva por capas: plataforma ← organización ← cuenta (si la organización lo permite).

**Datos existentes:** 1 organización y 2 cuentas.
- Hay umbrales guardados **por cuenta** en las 6 funciones.
- Una cuenta tiene valores propios en «Pedidos detenidos»: aviso a los 3 min y repetir cada 1 min, frente a 12 y 5 de la otra.
- No hay umbrales guardados a nivel de organización.

### 1.2 Menú: por qué el plato «vuelve» al soltarlo
El soltar sí agrega el plato (`useMenuPlannerDrag` llama a la misma función que el botón «+»), pero la interfaz hace parecer que no:
1. **El plato arrastrado regresa animado a su lugar** (animación por defecto de `DragOverlay`), así que da la impresión de que se rechazó.
2. **No hay actualización optimista:** el plato aparece en el día solo después del viaje a la base y de recargar toda la semana (0,5–2 s).
3. **La tarjeta del catálogo solo marca «ya agregado» para el día *seleccionado*,** no para el día donde se soltó ni para la semana. No se ve qué platos ya están ni dónde.
4. **Quitar un plato de un día** exige abrir sus reglas; no hay un «×» directo.

### 1.3 Imágenes de platos: hay una base a medias
- `dk_products.image_path` existe (una sola imagen). En «Editar plato» hay un botón «Imagen» que sube el archivo al bucket **privado** `dk-attachments`, junto con las facturas.
- **La imagen no se muestra en ningún lado,** no se puede quitar y no se valida formato ni tamaño.
- Hoy ningún plato tiene imagen, así que no hay datos que migrar.
- **Brecha de RBAC:** el bucket `dk-attachments` solo comprueba la cuenta, no el permiso. Cualquier miembro de la cuenta podría subir o borrar archivos.

## 2. Diseño: IA en la organización

### 2.1 Un solo espacio: Organización → «IA y voz»
Se rediseña `/o/:org/ai` como **el** lugar de configuración de IA y voz, con cuatro pestañas:

| Pestaña | Contenido |
|---|---|
| **Funciones** | Una tarjeta por función, agrupadas en *Abastecimiento*, *Cocina* y *Voz*. Cada tarjeta tiene:<ul><li>interruptor «Ofrecer en la organización»;</li><li>fila de cuentas con interruptor por cuenta (lo que ya existe);</li><li>**acordeón «Ajustes»** con los umbrales de la organización (días de cobertura, minutos, frecuencia, avisos por voz), validados con los rangos del catálogo;</li><li>**«Excepciones por cuenta»**, solo si alguna cuenta tiene valores distintos: se ven, se editan o se quitan («usar los de la organización»).</li></ul> |
| **Voz de cocina** | La voz de la organización (lo que ya existe) y las excepciones por cuenta en el mismo formato |
| **Uso** | Lo que ya existe, más «Analizar ahora» por cuenta y por función |
| **Estado** | IA conectada o no, plan y límites del plan (solo lectura) |

- **Se ve según RBAC:** con `features.manage` se configura; con acceso al centro pero sin ese permiso, solo se lee.
- **Estilo:** los componentes existentes (`Tabs`, `Switch`, `Drawer`, `Badge`, cards y un acordeón nuevo reutilizable en `shared/ui`).

### 2.2 La cuenta deja de configurar IA
- **Se quitan de la cuenta** los umbrales de IA (`FeatureCard` / `AiSettingsPage`) y la voz de cocina editable (`KitchenVoiceCard`).
- **La pestaña de la cuenta se renombra** a *«Voz en este equipo»* y queda solo con lo que depende de **cada tableta**: motor de reconocimiento, manos libres, voz fijada del dispositivo y «Probar». No es configuración de IA del negocio; es hardware (sección 7, D2).
- **Arriba, una línea de solo lectura:** «La IA y la voz las configura tu organización», con un enlace al centro si la persona tiene permiso.
- **Las rutas viejas** (`/settings/features`, `/settings/ai`) redirigen a la nueva pestaña.

### 2.3 Base de datos: sin perder nada
- **Migración de datos:**
  - Para cada función, si **todas** las cuentas de la organización tienen el mismo valor, ese valor pasa a la **organización** y se borra de las cuentas (sin cambio de comportamiento).
  - Si difieren, se quedan como **excepción de cuenta**, visible y editable desde la organización (sin cambio de comportamiento).
- **Solo la organización escribe:** `dk_set_kitchen_feature_settings` pasa a exigir `features.manage` de la organización (hoy basta `ai.manage` o `settings.manage` de la cuenta). La lectura (`dk_my_features`) no cambia, así que Cocina y la Edge Function siguen igual.
- **`allow_account_override` deja de mostrarse:** la organización siempre puede fijar excepciones; ninguna cuenta se configura sola. Se mantiene en la base por compatibilidad.
- **La plataforma conserva solo lo del operador** (sección 7, D1):
  - interruptor global;
  - modelo, proveedores y costo;
  - límites por plan;
  - catálogo de voces.

  Los «valores por defecto» de la plataforma pasan a llamarse **«valores de fábrica»**: lo que recibe una organización nueva.
- **Pruebas SQL:** capas, permisos (una cuenta ya no puede escribir), migración de datos y auditoría.

## 3. Diseño: menú más rápido

### 3.1 Arrastrar y soltar sin fricción
- **Al soltar sobre un día, el plato aparece al instante** (actualización optimista en la caché de la semana). Si la base lo rechaza, se deshace y se avisa.
- **Sin animación de regreso** del plato arrastrado.
- **Mientras se arrastra:**
  - el día bajo el cursor se resalta;
  - un día que **ya tiene** ese plato se marca en gris con «Ya está» y no acepta soltar.
- **La tarjeta del catálogo se queda en su lugar** y muestra:
  - una **marca «En N días esta semana»** con puntos por día (L M M J V S D) para ver de un vistazo dónde está;
  - un **✓** si está en el día seleccionado.
- **Agregar varios platos seguidos al mismo día:**
  - el catálogo no pierde su posición ni su búsqueda al agregar (nada se recarga);
  - un **clic en un día lo selecciona,** y el botón «+» de cada plato lo agrega a ese día sin arrastrar.
- **Quitar:** cada plato del día tiene un **«×»** al pasar el cursor, y en táctil, al tocar. Queda **«Deshacer»** durante 5 s en el aviso.
- **Sin duplicados:** se valida antes de soltar y la base sigue garantizando la regla (`unique (plan_date, product_id)`).
- **Teclado y táctil:** un sensor táctil con pequeña demora, para que el scroll del catálogo no se confunda con arrastrar.

### 3.2 Pantalla
- **Cada plato del día es una fila compacta:** miniatura (sección 4), nombre, precio y los íconos de reglas de hoy.
- **Encabezado de cada día:** conteo de platos y el total de platos distintos de la semana.

## 4. Diseño: imágenes de platos

### 4.1 Almacenamiento
- **Bucket nuevo y público `dk-product-images`** (sección 7, D3). Las fotos de platos no son sensibles; se muestran en todas partes y en el futuro en menús para clientes. Tener URL públicas con caché de CDN evita pedir un enlace firmado por cada miniatura.
  - Tamaño máximo 5 MB; formatos JPEG, PNG y WebP.
  - Ruta: `kitchens/<cuenta>/products/<plato>/<uuid>.webp`.
  - **Escritura** solo para quien tiene `products.edit` en **esa** cuenta (política RLS con `dk_can`). **Lectura** pública.
- **Tabla nueva `dk_product_images`:** `id`, `kitchen_id`, `product_id`, `path`, `position` (1 = principal, 2 = secundaria), `width`, `height`, `created_at` y `created_by`.
  - `unique (product_id, position)`, como máximo 2 por plato.
  - RLS por cuenta, igual que `dk_products`; lectura para miembros de la cuenta y escritura con `products.edit`.
- **`dk_products.image_path`** queda como espejo de la imagen principal, mantenido por un disparador, para no romper lecturas existentes. El botón viejo y su uso de `dk-attachments` se retiran; no hay archivos que migrar.
- **Borrar o reemplazar** quita el archivo del bucket y la fila, con la limpieza en la misma operación.

### 4.2 En el navegador, antes de subir
- **Se acepta** JPEG, PNG, WebP (y HEIC si el navegador lo decodifica) de hasta 15 MB de origen.
- **Se reduce a un máximo de 1.600 px por lado y se convierte a WebP** (calidad 0,85). Una foto de celular queda en unos 150–400 KB.
- **Vista previa inmediata;** estados *subiendo*, *listo* y *error*, con reintento.

### 4.3 Interfaz
- **Editar plato:** dos espacios, «Principal» y «Segunda foto».
  - Arrastrar un archivo o tocar para elegirlo; vista previa.
  - Reemplazar, quitar e **intercambiar** cuál es la principal.
  - Todo se guarda al instante, sin un paso extra de «Guardar».
- **Sin foto:** un marcador elegante con la inicial del plato y un tono derivado de su categoría, sin íconos genéricos.
- **Dónde se muestran,** en tamaños pequeños para que no dominen:

| Lugar | Tamaño |
|---|---|
| Catálogo del planificador | Miniatura cuadrada de 40 px |
| Plato dentro de un día (semana) | Miniatura de 24 px; en la vista de mes, sin imagen |
| Editar plato / vista del plato | Imagen principal grande, con la segunda al lado; clic → visor con las dos |
| Selector de platos al crear un pedido (`OrderBuilder`) | Miniatura de 40 px, para identificar el plato rápido en caja |

- **Carga diferida:** `loading="lazy"`, tamaño reservado (sin saltos) y aparición suave.

## 5. Pruebas
- **SQL:**
  - capas de IA con la organización como dueña;
  - una cuenta no puede escribir ajustes de IA;
  - la migración conserva el comportamiento de ambas cuentas;
  - `dk_product_images`: RLS, máximo 2, disparador de la principal;
  - políticas del bucket: sin `products.edit` no sube ni borra; otra cuenta no escribe.
- **App (vitest):**
  - formulario de ajustes de la organización y excepciones;
  - redirecciones;
  - arrastrar y soltar (optimista, duplicado, quitar, deshacer);
  - reducción de imágenes;
  - componente de imagen con 0, 1 y 2 fotos.
- **Navegador:** los 12 puntos de validación de la solicitud, con recarga para comprobar que las imágenes persisten.
- **Regresión:** todas las suites, `tsc`, `oxlint` y `build`.

## 6. Riesgos
| Riesgo | Mitigación |
|---|---|
| Quitar la configuración de la cuenta cambia el comportamiento de una cuenta | Migración con excepciones; nada cambia de valor |
| Una cuenta pierde la posibilidad de ajustar su IA | La organización lo hace por ella; es lo pedido |
| Fotos pesadas desde el celular | Reducción en el navegador a WebP de 1.600 px |
| Bucket público | Rutas con UUID, solo fotos de platos y escritura restringida por RLS y permiso |
| Actualización optimista y error de la base | Se deshace y se muestra el error |

## 7. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | ¿Qué queda en la **plataforma** (`/admin`)? | **Solo lo del operador de Quanela:** interruptor global, modelos y costo, límites por plan y catálogo de voces. Todo lo que define **cómo se comporta la IA en un negocio** (qué se ofrece, dónde, umbrales, frecuencia, voz) pasa a la **organización**. Mover modelos o límites a la organización dejaría que cada cliente decida su propio costo. |
| **D2** | Preferencias del **equipo** (motor de reconocimiento, manos libres, voz del dispositivo) | **Se quedan en la cuenta,** como «Voz en este equipo»: dependen de cada tableta, no son configuración de IA del negocio |
| **D3** | Almacenamiento de las fotos | **Bucket público nuevo** `dk-product-images`, con escritura restringida por RLS y permiso. Las facturas siguen en el privado `dk-attachments`. |
| **D4** | Platos de menús maestros (hoy 0) | Por ahora, **fotos por cuenta** como cualquier plato; las fotos del maestro quedan para una ADR futura |
| **D5** | Umbrales distintos entre cuentas | **Excepción por cuenta** administrada desde la organización (preserva el comportamiento) |

## 8. Orden de ejecución
| Fase | Qué |
|---|---|
| 1 | Migraciones: permisos de escritura de ajustes, migración de valores a la organización, `dk_product_images`, bucket y políticas; pruebas SQL |
| 2 | IA en la organización: página con pestañas, tarjetas, acordeón de ajustes, excepciones, uso y estado; limpieza de la cuenta y redirecciones; «valores de fábrica» en la plataforma |
| 3 | Menú: arrastrar y soltar optimista, indicadores por día, «×» con deshacer, sensor táctil |
| 4 | Imágenes: reducción y subida, editor de dos fotos, visor y miniaturas en catálogo, día y selector de pedidos |
| 5 | Validación: suites, `tsc`, `oxlint`, `build` y los 12 puntos en el navegador |
| 6 | Documentación: esta ADR con resultados, arquitectura y ERD (el manual no) |

## 9. Qué necesito de ti
1. **Aprobar esta ADR.**
2. **Para la verificación en el navegador:** inicia sesión una vez en el panel del navegador de la app, porque yo no puedo escribir tu contraseña. Si no, verifico con páginas de prueba temporales y te lo digo.
