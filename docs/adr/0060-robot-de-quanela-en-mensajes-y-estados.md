# ADR 0060: El robot de Quanela en mensajes, avisos y estados

## Estado
**Aceptada e implementada (2026-10-14).** Resultados en la sección 6.

**Pedido:** integrar los iconos del robot (paquete `quanela-robot-icons`) en las acciones, notificaciones y estados de la app, con la expresión adecuada a cada contexto. Debe ser una mejora progresiva y discreta: sin rediseñar la app, sin tocar la lógica de negocio, sin un sistema visual paralelo.

---

## 1. Auditoría

### 1.1 Los recursos
`~/Desktop/quanela-robot-icons/` trae 10 PNG transparentes, de unos 360 × 320 px y unos 105 KB cada uno, más una hoja con todos.

| Archivo | Expresión |
|---|---|
| `quanela-robot-feliz.png` | Ojos sonrientes y trazos de alegría |
| `quanela-robot-emocionado.png` | Ojos `> <` y trazos |
| `quanela-robot-guiño.png` | Guiño |
| `quanela-robot-sorprendido.png` | Ojos redondos, sin símbolo |
| `quanela-robot-asombrado.png` | Ojos redondos, boca en «o» y un **«!»** |
| `quanela-robot-confundido.png` | Ojos redondos y un **«?»** |
| `quanela-robot-idea.png` | Sonriente con una **bombilla** |
| `quanela-robot-dormido.png` | Ojos cerrados y «zZ» |
| `quanela-robot-enamorado.png` | Ojos de corazón |
| `quanela-robot-enojado.png` | Ceño fruncido y símbolo de enojo |

Las revisé sobre fondo oscuro y claro. Los 10 archivos individuales están limpios. **La hoja tiene halos rojos y amarillos alrededor de cada robot**, restos del recorte del fondo, así que no se usa.

**No existe una expresión «pensando».** Para procesos de IA se usa «idea» (ver D2).

### 1.2 Los componentes compartidos de hoy (`src/shared/ui`)

| Componente | Uso | Hoy |
|---|---|---|
| `Toast` (`useToast().show`) | **Sistema global de avisos**: 112 de éxito, 101 de error, 7 informativos | Tonos `success`, `error` e `info` con un ícono lucide. **No hay tono de advertencia** |
| `EmptyState` | 49 usos en 40 archivos (11 en Abastecimiento, 5 en Pedidos, 5 en Finanzas…) | Ícono lucide en un recuadro gris. Ya admite título, descripción y acción |
| `ErrorState` | 48 usos | Triángulo rojo, el mensaje de error real y el botón «Reintentar» |
| `LoadingState` | 70 usos | Esqueletos y un spinner en línea |
| `ConfirmDialog` (en `Modal.tsx`) | 16 usos | Título, descripción y los botones «Cancelar» y «Confirmar». Las acciones destructivas usan el botón rojo |
| Avisos ámbar en línea | 15 archivos | Cada uno escrito a mano, sin componente compartido |
| Procesos de IA | Leer una factura (`InvoiceImportPage`), «Analizando con IA…» (`InsightParts`), el diseñador del menú y Copilot | Spinner y texto |

**Conclusión:** ya existe un sistema centralizado: los avisos globales (Toast) y los estados de pantalla (vacío, error, carga y confirmación). El robot se integra **dentro de esos componentes**. Así llega a toda la app sin editar 300 llamadas y sin crear un sistema paralelo. Solo falta:
- un componente compartido para los **avisos en línea** (advertencias y éxitos dentro de un formulario);
- el **tono de advertencia** en los avisos globales.

---

## 2. Decisiones

| # | Decisión | Detalle |
|---|---|---|
| **D1** | **Recursos** | • Los 10 PNG se copian a `public/robot/` con nombres en inglés, por la convención del código: `happy`, `excited`, `wink`, `surprised`, `astonished`, `confused`, `idea`, `sleeping`, `in-love` y `angry`.<br>• Se convierten a **WebP con transparencia** en dos tamaños:<br>  – `-96`, para mostrar hasta 48 px (avisos y diálogos);<br>  – `-320`, para estados vacíos de hasta 160 px.<br>• Pasan de unos 105 KB a pocos KB cada uno.<br>• Los originales quedan en `docs/brand/robot/`.<br>• Sin fondos forzados, proporción original y `width` y `height` fijos para que la pantalla no salte al cargar |
| **D2** | **Catálogo central** `src/shared/robot/expressions.ts` | Relaciona cada **propósito** con la expresión. Las pantallas piden el propósito, no el archivo:<br>• **success** (operación completada) → `happy`<br>• **celebrate** (logros: menú publicado, primer pedido) → `excited`<br>• **error** → `surprised`<br>• **warning** (advertencia o algo que requiere atención) → `astonished`, por su «!»<br>• **info** → `wink`<br>• **help** (consejos y ayuda) → `idea`<br>• **ai** (asistente y procesos de IA) → `idea`<br>• **empty** (todavía no hay nada, con una acción) → `wink`<br>• **noResults** (búsqueda o filtros sin resultados) → `confused`, por su «?»<br>• **idle** (nada pendiente: sin pedidos en cocina, nada por despachar) → `sleeping`<br>• **thanks** (agradecimiento al cliente en el menú público) → `in-love`<br>**`angry` no se usa:** con un error, un robot enojado parece culpar al usuario. Queda en el catálogo, sin propósito asignado |
| **D3** | **Un solo componente para la imagen**: `RobotFace` | `<RobotFace mood="success" size={32} />`:<br>• elige el archivo y el tamaño (96 o 320) según `size`;<br>• es decorativa (`alt=""`, `aria-hidden`): el significado lo dan el texto y su rol (`alert` o `status`);<br>• `loading="lazy"` en estados vacíos, para que cada pantalla cargue solo las expresiones que usa;<br>• el único movimiento es un pulso suave en procesos de IA, `motion-safe` (respeta «reducir movimiento») |
| **D4** | **`Feedback`**: el bloque de mensaje con robot. Es el `QuanelaFeedback` del pedido, con el nombre según la convención de `shared/ui` | `<Feedback tone="success" title="Compra registrada" description="…" action={…} />`:<br>• `tone` elige la expresión, el color del borde y el rol;<br>• `layout="inline"` (aviso dentro de un formulario, robot de 32 a 40 px);<br>• `layout="block"` (estado de pantalla, robot de 96 a 128 px; 72 px en celular).<br>**`EmptyState` y `ErrorState` se reescriben sobre `Feedback`**: conservan su API y sus 97 usos no cambian. Una sola forma de presentar mensajes |
| **D5** | **Avisos globales (Toast)** | • El ícono lucide se cambia por el robot de **28 px** según el tono.<br>• Se agrega el tono **`warning`** (ámbar, `astonished`).<br>• Opción `mood` para casos especiales, por ejemplo `celebrate` al publicar el menú.<br>• El texto, la duración, «Deshacer» y el botón de cerrar no cambian. Los 220 avisos actuales reciben el robot sin editarlos |
| **D6** | **Estados vacíos** | • `EmptyState` muestra el robot `empty` en los estados de **pantalla** (no compactos).<br>• Los **compactos** (dentro de una tarjeta o tabla) conservan su ícono lucide, para no repetir el robot en una misma pantalla. Igual pueden pedirlo con `mood`.<br>• Se marcan con `mood` los casos con significado propio:<br>  – «Sin resultados» → `noResults`;<br>  – «Nada por despachar» y «No hay pedidos activos en cocina» → `idle`;<br>  – «Nada por reponer» y «No se debe nada» → `success`.<br>• Se agrega **una acción útil** donde hoy falta y el permiso lo permite: «Crear receta», «Registrar compra», «Agregar insumo», «Registrar gasto» |
| **D7** | **Errores** | • `ErrorState` muestra el robot `surprised` (64 px) con **el mismo mensaje real del error** y «Reintentar». Nada se oculta.<br>• Los avisos de error usan el robot de 28 px y conservan el texto (por ejemplo, el de Supabase o una integración) |
| **D8** | **Procesamiento** | • **Los esqueletos de carga no cambian**: son la mejor señal en listas y tablas, y un robot en cada carga cansaría.<br>• El robot `ai` acompaña solo los **procesos largos de IA**: leer una factura, analizar con IA (Insights y sugerencias de compra) y el diseñador del menú. Para eso, `LoadingState` gana la variante `ai`.<br>• El indicador de guardado de los botones sigue igual |
| **D9** | **Confirmaciones** | • `ConfirmDialog` gana `mood`. Por defecto usa `warning` (48 px) en las acciones destructivas (`danger`), y ninguno en las demás.<br>• **Los botones, el texto, el doble paso y cualquier mecanismo de seguridad no cambian**: el robot solo acompaña la descripción |
| **D10** | **Advertencias en línea** | `Feedback tone="warning"` reemplaza los avisos ámbar escritos a mano donde el texto es una advertencia: stock bajo o faltantes, campos o datos inconsistentes, la lectura de facturas no disponible e integraciones desconectadas. Los textos y las condiciones que los muestran no cambian |
| **D11** | **Toques especiales, uno por flujo** | • **Menú publicado** → aviso con `celebrate`.<br>• **Seguimiento del pedido del cliente** (menú público): «Entregado» → `thanks`, y «Recibido» → `success`.<br>• **Copilot**, al abrirse sin conversación → `ai` (80 px) |
| **D12** | **Lo que no cambia** | Tablas, RLS, permisos, autenticación, funciones de Supabase, la lógica de formularios, pedidos, compras e inventario, y la navegación (sus íconos siguen siendo lucide). No hay dependencias nuevas. **No se toca el manual** |

---

## 3. Fases

| Fase | Qué |
|---|---|
| **1 · Base** | `public/robot/` (WebP en dos tamaños) y los originales en `docs/brand/robot/`. El catálogo `expressions.ts`, `RobotFace` y `Feedback`. Pruebas: cada propósito apunta a un archivo que existe y cada tono pinta su expresión y su rol |
| **2 · Cinco escenarios representativos** | 1. **Éxito:** el aviso global (Toast) con el robot.<br>2. **Advertencia:** el tono `warning` del aviso y un `Feedback` en línea (faltantes al confirmar una compra).<br>3. **Error:** `ErrorState` sobre `Feedback`.<br>4. **Carga:** `LoadingState variant="ai"` en la lectura de facturas.<br>5. **Vacío:** `EmptyState` sobre `Feedback`.<br>Se revisan con capturas en tema claro y oscuro, en escritorio y celular, antes de extender |
| **3 · Extensión** | • Los `mood` especiales (D6), con las acciones en los estados vacíos.<br>• `ConfirmDialog` (D9).<br>• Los avisos ámbar (D10).<br>• IA en Insights y el diseñador (D8).<br>• Los toques de D11 |
| **4 · Pruebas y cierre** | • `tsc`, `oxlint`, Vitest completo y los dos builds.<br>• **Visual:** capturas en el stack local de pruebas (`quanela-e2e`, usuarios de prueba locales) de cada escenario, en claro y oscuro y en escritorio y celular, sin imágenes rotas (todas las respuestas de `/robot/*` en 200).<br>• Revisar que no se dupliquen avisos y que los errores sigan mostrando su causa.<br>• Sección de resultados en este ADR |

## 4. Cómo agregar una expresión
1. Copiar el PNG a `docs/brand/robot/`.
2. Generar los dos WebP con `scripts/robot-icons.sh` (usa `cwebp`).
3. Agregar el nombre a `RobotExpression` y, si corresponde, un propósito en `expressions.ts`.

La prueba del catálogo falla si un propósito apunta a un archivo que no existe.

## 5. Riesgos y límites
- **No hay expresión «pensando» ni «preocupado».** Se usan «idea» para la IA y «sorprendido» para errores. Si llegan, solo cambia el catálogo.
- **La hoja de iconos tiene halos de color:** no se usa.
- **Tamaño mínimo:** a menos de 24 px los rasgos se pierden (el sombrero y el visor dominan). Los avisos usan 28 px como mínimo.
- **Repetición:** las reglas de D6 y D8 (no usarlo en esqueletos ni en estados compactos) evitan ver el robot muchas veces en una misma pantalla.

---

## 6. Resultados (2026-10-14)

### 6.1 Componentes
| Pieza | Qué es |
|---|---|
| `public/robot/robot-<expresión>-{sm,lg}.webp` | Las 10 expresiones con transparencia: `sm` de 96 px de alto (4–6 KB) y `lg` de 288 px (17–24 KB). Antes eran 105 KB cada una. **Cambio frente a D1:** el tamaño grande es de 288 px y no de 320, porque varios originales miden unos 310 px de alto y no se amplían |
| `docs/brand/robot/` | Los originales con nombre en inglés y el README del paquete |
| `scripts/robot-icons.sh` | Regenera los WebP desde los originales |
| `src/shared/robot/expressions.ts` | El catálogo: proporción de cada expresión, `RobotMood` → expresión, y `robotSrc` (archivo pequeño hasta 48 px) |
| `src/shared/robot/RobotFace.tsx` | La imagen: decorativa (`alt=""`, `aria-hidden`), con `width` y `height` fijos, `loading="lazy"` opcional y el balanceo `motion-safe:animate-robot-bob` (definido en `index.css`; se detiene con «reducir movimiento») |
| `src/shared/ui/Feedback.tsx` | El mensaje con robot, `inline` o `block`. El tono elige expresión, marco y rol: `alert` en errores y advertencias en línea, `status` en éxitos y procesos de IA |

**Reutilizados, sin cambiar su forma de uso:**
- **`EmptyState`** (sobre `Feedback`): gana `mood`, y `mood={null}` conserva el ícono.
- **`ErrorState`** (sobre `Feedback`).
- **`LoadingState`**: nueva variante `ai`.
- **`Toast`**: el robot reemplaza el ícono, hay tono `warning` y opción `mood`.
- **`ConfirmDialog`**: `mood`, por defecto `warning` si la acción es destructiva.

### 6.2 Expresiones integradas
Están las 10 en `public/robot`. Se usan 9:
- `happy`: éxito;
- `excited`: menú publicado;
- `surprised`: error;
- `astonished`: advertencia y confirmación destructiva;
- `wink`: vacío, información y permisos;
- `confused`: sin resultados;
- `idea`: IA (lectura de facturas, análisis y Copilot);
- `sleeping`: nada pendiente (operación, cocina y despacho);
- `in-love`: el pedido del cliente entregado.

`angry` no se usa (D2).

### 6.3 Módulos tocados
- **Avisos globales (los 220):** a través del `Toast`.
- **Estados vacíos, errores y confirmaciones:** a través de sus componentes. Además:
  - **Abastecimiento:**
    - insumos, preparaciones, compras y proveedores: `noResults` o `empty`;
    - los «Selecciona…» conservan el ícono;
    - avisos de la lectura de facturas en `Feedback`;
    - lectura de facturas con el robot `ai`.
  - **Pedidos y operación:** tablero y despacho `idle`, lista `noResults`. **Cocina:** SLA `idle`.
  - **Clientes:** búsqueda y cliente no encontrado → `noResults`.
  - **Equipo:** usuarios → `noResults` o `empty`.
  - **Finanzas:**
    - «No se debe nada» → `success`;
    - las notas de rentabilidad en `Feedback`;
    - los estados de permiso conservan el candado.
  - **Recetas:** sin ingredientes → `empty`, con su acción «Agregar ingrediente».
  - **Menú público:**
    - advertencias del resumen en `Feedback`;
    - error del diseñador con IA en `Feedback`;
    - «Diseño publicado» → `celebrate`;
    - seguimiento del pedido del cliente: «¡Recibido!» → `success` y «¡Entregado!» → `thanks`.
  - **Integraciones:** advertencias de WhatsApp y n8n en `Feedback`.
  - **Cuentas:** cuenta sin acceso en `Feedback`.
  - **IA:** «Analizando con IA…» con el robot. «Análisis en pausa» (límite de uso) pasó de error a **advertencia**.
  - **Copilot:** saludo con el robot `ai`.
- **Se dejaron con su ícono a propósito, para no repetir el robot:**
  - «Nada por reponer» y las tarjetas de IA de Abastecimiento (conviven con otros estados en la misma pantalla);
  - los avisos por ítem de Insights;
  - el estado de IA en Ajustes y en la plataforma;
  - el contraste del diseñador;
  - las tarjetas urgentes del inicio;
  - las líneas de la factura.

### 6.4 Arreglo de paso
**Avisos en tema claro.** Usaban fondos verde, rojo o ámbar oscuro con un texto que en el tema claro también es oscuro, así que no se leían. Era un problema anterior, visible en la captura. Ahora la superficie sigue el tema y el tono va en el borde. Los marcos de `Feedback` usan tintes translúcidos que se leen en los dos temas.

### 6.5 Pruebas
- **Unitarias (11 nuevas):**
  - `expressions.test.ts`: cada expresión existe en sus dos tamaños, cada propósito tiene la expresión del plan y nunca `angry`.
  - `Feedback.test.tsx`:
    - expresión y rol por tono, y robot decorativo;
    - `ErrorState` conserva la causa real y «Reintentar»;
    - `EmptyState`: robot, ícono o `mood`;
    - `LoadingState ai` con el balanceo solo en `motion-safe`;
    - `ConfirmDialog`: robot en acciones destructivas y la confirmación sigue exigiendo el botón;
    - avisos: un robot por tono, el texto intacto y un aviso por llamada.
- **Suite completa:** `tsc` sin errores, `oxlint` con los mismos 13 avisos, **Vitest 130 archivos y 846 pruebas** y los dos builds. El build incluye los 20 archivos de `public/robot`.
- **Visual, en el stack local (`quanela-e2e`, usuaria de prueba local Laura Gómez, negocio «Brasa & Pan»):**
  - capturas en `docs/qa/robot/` de los 5 escenarios y Copilot, en tema oscuro y claro, escritorio (1440 px) y celular (390 px), con hojas de contacto;
  - en cada pantalla se verificó la expresión cargada, sin imágenes rotas: 0 respuestas fallidas de `/robot/*` en las tres corridas;
  - el error se provocó cortando la red de una consulta desde la prueba: se ve «TypeError: Failed to fetch» y «Reintentar»;
  - la lectura de facturas se dejó esperando desde la prueba;
  - la confirmación destructiva se abrió y se canceló;
  - el stack quedó apagado al terminar.
- **Límite de la prueba visual:** el «Analizando con IA…» de Abastecimiento solo aparece cuando hay algo por reponer, y los datos de prueba no lo tenían. Está cubierto por el código y la prueba unitaria de `LoadingState ai`. Para capturar la IA se usó la lectura de facturas.

### 6.6 Limitaciones de los recursos
- No hay expresión «pensando» ni «preocupado»: se usan «idea» y «sorprendido».
- La hoja de iconos trae halos rojos y amarillos del recorte y no se usa.
- Las expresiones con símbolo lateral («!», «?», bombilla, «zZ») son más anchas. El componente respeta su proporción, así que a igual alto ocupan algo más de ancho.
- Por debajo de 28 px los rasgos se pierden: los avisos usan 30 px y los diálogos 48 px.
