# ADR 0061: Temas Claro, Oscuro y Neutro

## Estado
**Aceptada e implementada (2026-10-15).**

**Pedido:**
- auditar la apariencia de toda la app;
- corregir las inconsistencias de Claro y Oscuro;
- agregar un tercer tema, **Neutro**;
- centralizar los colores;
- que el selector y la preferencia funcionen en escritorio y celular.

Sin cambiar lógica de negocio, permisos, Supabase ni dependencias.

---

## 1. Auditoría

### 1.1 Arquitectura encontrada
- **Stack:** React, Vite y Tailwind v4.
- **Colores:** casi toda la app pinta con la **escala neutral** de Tailwind:
  - `bg-neutral-950`, el fondo;
  - `900`, tarjetas, barra lateral y campos;
  - `800`, bordes y hovers;
  - `50`, el texto principal;
  - `400` y `500`, el secundario.

  Hay unos 1.400 usos.
- **Tema claro (ADR 0023):** `src/index.css` lo implementa **redefiniendo esa escala** bajo `html[data-theme='light']`. Los componentes no saben qué tema está activo, y por eso el sistema ya es centralizado.
- **Tokens semánticos:** existen (`canvas`, `surface`, `line`, `text-*`, `success`…), pero casi no se usan. Los componentes nuevos los pueden usar; no se duplicaron con otros nombres.
- **Preferencia:** `src/shared/appearance/appearance.ts` la guarda en `localStorage` y en una cookie del dominio raíz (la comparten todas las organizaciones). La aplica el script de `index.html` antes del primer pintado. **No hay nada en Supabase y no hace falta.**
- **Selector:** el menú de usuario → Apariencia ofrecía Oscuro, «Claro (beta)» y Según el sistema.
- **Gráficos:** recharts, en Insights, Ajustes → Actividad y en la plataforma de IA.
- **Iconos:** lucide.
- **Panel global de administración** (`admin/`): app aparte y solo oscura. Queda fuera de este alcance.

### 1.2 Inventario de problemas

| # | Problema | Dónde | Impacto | Prioridad | Solución |
|---|---|---|---|---|---|
| 1 | El texto secundario (`neutral-500`, #737373) llega a **3.78:1** sobre las tarjetas en Oscuro y a **4.35:1** sobre el fondo en Claro (AA pide 4.5:1) | 368 usos en toda la app | Legibilidad | Alta | Oscuro → #858585 (4.86:1), Claro → #666666 (5.27:1) |
| 2 | `neutral-600` se usa como texto informativo («Sin teléfono», «Nunca», «Sin meta», «· en 2 recetas», «Cerrado»…) con **2.3–2.6:1** | 12 textos en Clientes, Abastecimiento, IA, Horarios, Fotos y Planificador | Legibilidad | Media | Esos textos pasan a `500`. `600` (pistas, iconos y deshabilitados) sube a ≈3:1 |
| 3 | **Oscuro sin `color-scheme: dark`**: radios, casillas, listas de los select, selectores de fecha y hora y barras de desplazamiento salían **en claro** sobre fondo oscuro | Toda la app: en la composición de platos, por ejemplo, los radios eran círculos blancos | Coherencia | Alta | `html[data-theme='dark'] { color-scheme: dark }` |
| 4 | Los campos de hora tenían `[color-scheme:dark]` fijo y salían oscuros en Claro | Horarios de cocina | Coherencia | Media | Se quita: ahora siguen el tema |
| 5 | Acentos pálidos sobre fondo claro: `amber-200/300/400`, `emerald-*`, `rose`, `pink`, `teal` e `indigo-300` sin ajustar. Ejemplos: las iniciales de los platos casi invisibles, el aviso ámbar de Insights ilegible y los avatares de clientes | Planificador, Catálogo, Insights, Pedidos y Clientes | Legibilidad | Alta | En la familia clara, los tonos 200-400 de cada acento pasan a su 700 |
| 6 | El naranja de textos y enlaces (`brasa-400`) en Claro daba **3.56:1** | Enlaces y acciones de texto | Legibilidad | Media | Familia clara: `brasa-400` → #c2410c (5.18:1). El naranja de marca (`brasa-500`) no cambia |
| 7 | **Gráficos con colores fijos del tema oscuro**: tooltip negro en Claro, cuadrícula #262626, ejes #737373 y serie de margen #a3a3a3 casi invisible sobre blanco | Insights, Actividad y Uso de IA | Coherencia y legibilidad | Alta | `src/shared/ui/chartTheme.ts` con variables del tema; las series usan tokens |
| 8 | El borde de los campos era casi invisible (1.18:1 en Oscuro), igual que el de una tarjeta | `Input`, `Select`, `Textarea` y `Combobox` | Accesibilidad (identificar el campo) | Media | `border-neutral-700/70` y hover `600`; placeholder `500` |
| 9 | Los avisos (toasts) de éxito y error en Claro tenían texto oscuro sobre fondo oscuro | `Toast` | Legibilidad | Alta | Ya corregido en ADR 0060: la superficie sigue el tema |
| 10 | Dos paneles con la misma `key` («closed») producían errores de React en consola | Abastecimiento y Planificador | Consola y riesgo de estado mezclado | Baja | Claves únicas por panel |
| 11 | Solo dos temas, y Claro marcado «beta» | Menú de usuario | Funcional | Alta | Se agrega **Neutro**; Claro deja de ser beta |
| 12 | El menú público, una página del negocio con su propia paleta, tomaba los controles nativos del tema del visitante | Menú público y seguimiento | Coherencia | Baja | Su `color-scheme` sigue el fondo del menú |
| 13 | **Texto blanco sobre el naranja de marca (`brasa-500`): 2.8:1** en los botones principales | Todos los botones primarios | Contraste AA | Alta, pero es identidad de marca | **Pendiente de decisión** (§5) |

Sin hallazgos en la búsqueda de colores fijos:
- No hay fondos blancos fijos fuera de los intencionales (el QR, la vista de factura PDF y la perilla del interruptor).
- No hay `text-black`, ni grises de otra escala (`gray`, `zinc`, `slate`), ni textos blancos sobre superficies del tema.
- Los verdes de WhatsApp en Integraciones imitan WhatsApp a propósito.

---

## 2. Decisiones

| # | Decisión |
|---|---|
| **D1** | **Un solo sistema:** cada tema redefine la escala neutral y los tokens semánticos en `src/index.css`. Ningún componente pregunta por el tema |
| **D2** | **Familia clara:** Claro y Neutro comparten un bloque con `color-scheme: light` y los acentos ajustados para fondo claro (tonos 700 en lugar de 200-400). Cada uno define solo su escala, sus tokens y sus sombras. `.theme-light` (secciones claras de la landing) usa la paleta Claro |
| **D3** | **Neutro** es gris **cálido**, no un Claro con fondo gris ni un Oscuro aclarado. Parte de la paleta pedida y la ajusta para pasar AA |
| **D4** | **Preferencia:** `ThemePreference` acepta `'dark' \| 'light' \| 'neutral' \| 'system'`, y cualquier otro valor cae a Oscuro. «Según el sistema» sigue igual (Claro u Oscuro según el sistema operativo). Se amplía el mecanismo actual (`localStorage` y cookie) sin tocar Supabase |
| **D5** | **Gráficos:** `chartTheme.ts` con `var(--color-…)`. Recharts los acepta como atributos SVG y estilos |
| **D6** | **Controles nativos:** `color-scheme` por tema; el menú público usa el de su paleta y la landing (clara) fuerza `light` |

---

## 3. Paletas finales

La escala va de 950 (fondo) a 50 (texto). Los valores tienen el contraste medido:
- **Texto** (50, 400, 500): contra el fondo (950) y contra la tarjeta (900).
- **Bordes** (700, 800): contra la tarjeta.

| Token | Oscuro | Claro | Neutro |
|---|---|---|---|
| 950 · fondo (`canvas`) | #0a0a0a | #f5f5f5 | **#f2f0ed** |
| 900 · tarjeta, barra lateral, campos (`surface`) | #171717 | #ffffff | **#faf9f7** |
| 800 · borde y hover (`line`) | #262626 | #e5e5e5 | **#dfdad3** |
| 700 · borde fuerte (`line-strong`) | #404040 | #d4d4d4 | **#cfc9c0** |
| 600 · pistas, iconos, deshabilitado | #6b6b6b (3.4:1) | #8f8f8f (3.2:1) | **#938d84** (3.1:1) |
| 500 · texto secundario (`text-muted`) | #858585 (4.9:1) | #666666 (5.7:1) | **#68645e** (5.6:1) |
| 400 · texto secundario fuerte | #a3a3a3 (7.1:1) | #525252 (7.8:1) | **#5e5a54** (6.5:1) |
| 50 · texto principal (`text`) | #fafafa (17.2:1) | #0a0a0a (19.8:1) | **#292724** (14.2:1) |
| Superficie secundaria (`surface-raised`) | #1f1f1f | #ebebeb | **#eae7e2** |
| Marca | #f97316 | #f97316 | #f97316 |
| Naranja de textos (`brasa-400`) | #fb923c (7.9:1) | #c2410c (5.2:1) | #c2410c (4.9:1) |
| Éxito, advertencia, peligro e info | 400 claros | 700 | 700 |
| Sombras | Negras, fuertes | Grises suaves | Café (#1C1310) muy suaves |

**Ajustes a la paleta inicial de Neutro:**
- el texto secundario #68645E quedó como `500`, y `400` es un tono más oscuro (#5e5a54);
- los bordes pasaron de #D8D3CC a #dfdad3 en los hairlines, para que no se vean más fuertes que en Claro; #D8D3CC queda como el token `line`.

---

## 4. Resultados

### 4.1 Archivos principales
- `src/index.css`: los tres temas, la familia clara, `color-scheme` y las barras de desplazamiento.
- `src/shared/appearance/appearance.ts` e `index.html`: el tipo, la validación y el primer pintado con `neutral`.
- `src/app/UserMenu.tsx`: el selector con Oscuro, Claro, **Neutro** y Según el sistema.
- `src/shared/ui/chartTheme.ts` (nuevo), más `TrendChart.tsx`, `InsightsTabs.tsx`, `ActivitySettingsPage.tsx` y `UsageTab.tsx`.
- `src/shared/ui/formClasses.ts` y `Combobox.tsx`: el borde de los campos y el placeholder.
- Los textos informativos de `600` a `500`, en 10 archivos de Clientes, Abastecimiento, IA, Horarios, Fotos y Planificador.
- Los acentos `-100` fijos, en 3 archivos.
- `timeInputClass.ts`: sin `color-scheme` fijo.
- `publicMenu/lib/themes.ts`: el `colorScheme` del menú público.
- `LandingPage.tsx`: la landing en esquema claro.
- `SupplyPage.tsx` y `MenuPlannerPage.tsx`: las claves únicas.
- Novedades del centro de ayuda (15 de octubre).

### 4.2 Pruebas ejecutadas
- **Técnicas:**
  - `tsc` sin errores;
  - `oxlint` con los mismos 13 avisos de antes;
  - **Vitest 131 archivos y 848 pruebas**, con 3 nuevas:
    - Neutro se guarda, se restaura y se aplica con esquema claro;
    - el selector ofrece 4 opciones y marca Neutro;
    - el script de `index.html` aplica los tres temas, «sistema» y valores inválidos;
  - los dos builds;
  - `npm ls` sin dependencias faltantes ni inválidas (no se agregó ninguna).
- **Visuales, en el stack local** (`quanela-e2e`, usuaria de prueba Laura Gómez, negocio «Brasa & Pan» con datos ficticios):
  - **20 pantallas × 3 temas a 1440 px:**
    - Inicio;
    - Operación: tablero, cocina y lista;
    - Abastecimiento: stock, compras, preparaciones y proveedores;
    - Catálogo, receta y composición de plato;
    - Clientes, Insights, Finanzas y Personal;
    - Menú público;
    - Integraciones;
    - Ajustes: general y actividad;
    - Usuarios.
  - **Las 20 en celular (390 px, Neutro) y en tablet (768 px, Claro).**
  - **En cada pantalla se verificó:**
    - el tema aplicado;
    - que ningún fondo grande quedara blanco en Oscuro, ni negro en Claro o Neutro (la única excepción es el QR, intencional);
    - que no hubiera desbordes horizontales en celular y tablet;
    - que no hubiera errores de consola (los de la clave repetida se corrigieron y la consola quedó limpia).
  - **Componentes compartidos en los tres temas:**
    - el modal «Nuevo cliente» con validación;
    - el gráfico con su tooltip;
    - el selector de Apariencia;
    - la barra lateral en celular;
    - los avisos, estados vacíos y de error (ya validados en ADR 0060).
  - **Selector y persistencia:**
    - elegir Neutro lo aplica al instante, sin recargar;
    - se conserva al navegar, al recargar y en una pestaña nueva;
    - **el primer pintado ya es Neutro** (medido en `DOMContentLoaded`, antes de React): sin destello del tema equivocado.
- **Capturas comparativas:** `docs/qa/temas/`.
- **Funcional:**
  - la suite completa cubre pedidos, inventario, recetas, compras, autenticación e integraciones, y pasa igual que antes;
  - en el stack local se probaron navegación, login, formularios (crear cliente) y el tablero;
  - **no se cambió lógica de negocio**: solo estilos, la preferencia de apariencia y las claves de dos paneles.

### 4.3 Pendientes y límites
1. **Texto blanco sobre el naranja de marca (2.8:1).** No pasa AA para texto normal. Hay dos opciones y cambian la identidad:
   - texto café (#1C1310) sobre naranja (6.5:1);
   - botón en `brasa-700` (#c2410c, 5.2:1).

   Queda para decisión del dueño.
2. **Panel global de administración** (`admin/`): solo tiene tema oscuro y no se tocó.
3. **Copilot:** su base de conocimiento (`supabase/functions/_shared/kb.ts`) se regeneró con la novedad de Neutro, pero **no se desplegó `dk-copilot`**. Hasta desplegarlo, Copilot no conoce la novedad.
4. **Insights:** «Analizando con IA…» y algunos estados con datos (reposición pendiente, perecederos) no se vieron en pantalla porque los datos de prueba no los producen. Usan los mismos tokens.
5. **Pruebas en dispositivos:** las de celular y tablet se hicieron con emulación de Chrome, no en dispositivos físicos.

---

## 5. Neutro por defecto en el acceso y la ayuda (2026-10-15)

**Pedido:** Neutro como apariencia por defecto del inicio de sesión, la creación de cuenta y la documentación.

**Páginas que abren en Neutro cuando el equipo nunca eligió un tema:**
- `/login`;
- `/registro` (y `/registro/confirmado`);
- `/activar/…` (activar una invitación);
- `/set-password`;
- `/signup-admin`;
- el centro de ayuda: `/help` y `doc.quanela.com`.

**Reglas:**
- El resto de la app sigue en Oscuro por defecto.
- **Un tema elegido siempre gana:** quien eligió Oscuro, Claro, Neutro o Según el sistema lo ve igual en estas páginas.

**Implementación:**
- La lista vive en `NEUTRAL_DEFAULT_PATH` (`appearance.ts`) y en el script de `index.html`, para que el primer pintado ya sea Neutro.
- `router.subscribe` aplica el tema por defecto en cada navegación: al entrar a la app después de iniciar sesión pasa a Oscuro, y al volver de la landing al login, a Neutro. La landing, al salir, restaura el tema elegido o el de la página siguiente.

**Pruebas:**
- **Unitarias:** `defaultThemeFor` por ruta, `applyRouteDefault` sin y con tema elegido, y el script de `index.html` por ruta.
- **En el navegador** (escritorio y celular): login, registro, activar y ayuda abren en Neutro desde el primer pintado. La landing sigue igual. Landing → login por enlace da Neutro, y login → inicio vuelve a la landing. Con Oscuro elegido, el login queda en Oscuro.
- **Capturas:** `docs/qa/temas/claro-por-defecto-*.png` (con Claro, sección 5.1).

### 5.1 Cambio: Claro en lugar de Neutro (2026-10-15)
A pedido del dueño, esas mismas páginas abren en **Claro** cuando el equipo no eligió un tema. Todo lo demás de la sección 5 sigue igual:
- la lista, ahora `LIGHT_DEFAULT_PATH`;
- el primer pintado;
- el cambio al navegar;
- un tema elegido siempre gana;
- Oscuro por defecto dentro de la app.

Neutro sigue disponible en Apariencia.
