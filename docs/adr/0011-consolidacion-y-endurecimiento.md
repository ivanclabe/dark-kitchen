# ADR 0011 — Consolidación y endurecimiento

## Estado
**Aprobada (2026-09-26) con las recomendaciones de la sección 8 e implementada completa** en `dark-kitchen` (`cqfzcwpqisaohcjaevxf`).

| Fase | Resultado |
|---|---|
| 1. Cuota de IA y rangos | ✅ `20260928100000_dk_ai_quota_and_settings_schema`. `dk_features.settings_schema`, validación de rangos (RPC + guardia), `ai_runs_per_day` (Business 200, Enterprise 1000; sin valor = 50, nunca ilimitado), `dk_ai_run_allowed`. Vista `dk_ai_features` retirada. La Edge Function consulta la cuota antes del modelo y responde `429 AI_RATE_LIMITED`; la app conserva el último análisis y avisa cuándo reintentar. Prueba de la app que compara los rangos con la migración. |
| 2. RLS | ✅ `20260928110000_dk_rls_split_all_policies`: 22 superposiciones → **0** (`multiple_permissive_policies` desaparece de los asesores). `EXPLAIN` en `dk_order_items`: cada permiso se evalúa una vez (InitPlan), y la rama de edición ni se ejecuta cuando alcanza la de lectura. |
| 3. Plataforma | ✅ *Nueva cuenta* en `/admin` exige elegir la organización. |
| 4. Landing | ✅ Título, descripción, Open Graph/Twitter, `theme-color`, `apple-touch-icon.png` (180 px), `og-image.png` (1200×630), `robots.txt`. `VITE_SITE_URL` vuelve absolutas las URL de las imágenes (plugin en `vite.config.ts`). "superusuario" → "administrador de la plataforma". |
| 5. Pruebas de componentes | ✅ Testing Library + jsdom (solo desarrollo). Registro con plan (5), pestaña Plan y candados (2), galerías (2). |
| 6. Validación | ✅ SQL **348/348** (nueva `ai_quota` 13; actualizadas `features` y `multikitchen_isolation`). App **140/140**, `tsc`, `oxlint` (17 avisos anteriores, ninguno nuevo), `build`. Asesores: solo quedan los avisos esperados (RPC `SECURITY DEFINER`, `dk_activation_preview` público a propósito y la protección de contraseñas, que es D5). Landing revisada en el navegador. |
| 7. Documentación | ✅ Manual 3.3 + PDF, este ADR, arquitectura y ERD. |

**Diferencias con el plan:**
- **Tope de IA sin valor en el plan:** vale 50 análisis en 24 h, nunca ilimitado; ahí cae Standard si algún día incluye IA con modelo. Las 24 h son móviles, no por día calendario.
- **La guardia de rangos es un disparador aparte** de la de disponibilidad (`dk_trg_kitchen_features_settings`).
- **La galería tolera `matchMedia` ausente**, algo que las pruebas revelaron.
- **Verificación de `AI_RATE_LIMITED` en la función desplegada:** se probó la función de la base que decide (suite `ai_quota`) y que la función responde. La prueba con una sesión real requiere iniciar sesión, y eso queda de tu lado.

**Acciones manuales (D5):**
1. Supabase → Authentication → *Password security*: activar la protección de contraseñas filtradas.
2. Antes de `VITE_PUBLIC_SIGNUP=true`: SMTP propio, confirmación de correo obligatoria, Turnstile (`VITE_TURNSTILE_SITE_KEY`) y las URL de redirección (`…/registro/confirmado`).
3. Definir `VITE_SITE_URL` con el dominio público en el despliegue, para que las vistas previas al compartir usen URL absolutas.
4. Contacto de ventas real en `dk_plans.contact_url` (Enterprise), hoy `ventas@darkkitchen.co`.

---

*Propuesta original (para referencia):*

No agrega módulos. Revisa lo construido en los ADR [0008](./0008-organizaciones-y-cuentas.md), [0009](./0009-iconos-avatares-y-funciones.md) y [0010](./0010-planes-precios-y-onboarding.md) y cierra las brechas que encontró la auditoría.

---

## 1. Estado actual (auditoría del 2026-09-26)

| Área | Estado | Evidencia |
|---|---|---|
| **Landing** | Navegación (Producto, Funcionalidades, Precios, FAQ, Iniciar sesión, Crear cuenta), precios y comparativa desde la base, FAQ, `/precios`. | Revisado en el navegador. |
| **Multi-organización** | Organización → Cuenta → Usuario → Rol → Permiso. El plan es de la organización (`dk_subscriptions`, una por organización). Una persona es dueña de una sola organización. | ADR 0008 y 0010. |
| **RBAC** | Catálogo de 57 permisos (47 de Cuenta, 10 de organización). Plantillas en MAYÚSCULAS, roles propios, varios roles por Cuenta, rol activo validado por Cuenta, SUPER_ADMIN (creador, intransferible) y ADMIN de Cuenta. | `permission_catalog`, `organizations`, `accounts`. |
| **RLS** | Todas las tablas filtran por Cuenta activa + permiso. Escrituras sensibles solo por RPC. Solo los catálogos (planes y funciones) se leen sin sesión. | 336 pruebas SQL en verde. |
| **Avatares e iconos** | Dos galerías con un solo sistema: 20 personas (perfil) y 20 establecimientos (Cuentas), con CHECK en la base y la misma lista en la app. | `catalog.test.ts`. |
| **IA y funciones** | `usable = plan ∧ organización ∧ Cuenta ∧ permiso`, resuelto en la base (`dk_my_features`, `dk_can_use_feature`). La Edge Function usa el mismo estado. | Suites `features` y `plans`. |
| **Creación de Cuentas** | Tope del plan; herencia SUPER_ADMIN + ADMIN solo para el creador; icono; se entra a la Cuenta nueva. El registro crea todo en una transacción al confirmar el correo. | Suites `accounts`, `signup` y `plans`. |
| **Calidad** | `tsc`, `oxlint` (17 avisos de fast-refresh anteriores), 128 pruebas de la app, `build`. Árbol de git limpio (todo en commits). | |

## 2. Problemas encontrados

| # | Problema | Riesgo | Severidad |
|---|---|---|---|
| **H1** | **Costo de IA sin tope en el servidor.** *Analizar ahora* (`force`) salta la caché de la Edge Function sin límite. Cualquier persona que pueda usar una función de IA puede disparar llamadas al modelo sin fin. | Costo (clave de Anthropic de la plataforma). | Alta |
| **H2** | **Parámetros de IA sin rango en la base.** `dk_set_kitchen_feature` valida claves y tipos, pero no mínimos ni máximos. Con `frequency_min = 0` o negativo, la caché queda anulada. Los rangos viven solo en la app (`src/modules/ai/lib/catalog.ts`) y pueden separarse de la base sin que nadie lo note. | Costo, datos inválidos. | Alta |
| **H3** | **22 tablas con políticas RLS superpuestas.** Hay una política `FOR ALL` (escritura) más una de `SELECT` en la misma tabla. Cada lectura evalúa las dos. Es el aviso `multiple_permissive_policies` de Supabase. | Rendimiento a medida que crecen los datos. | Media |
| **H4** | **La plataforma crea Cuentas sin elegir organización.** *Nueva cuenta* en `/admin` no pide organización y termina en la organización por defecto (la de Dark Kitchen). | Cuenta en el negocio equivocado. | Media |
| **H5** | **Landing sin metadatos para compartir.** Faltan descripción, Open Graph/Twitter, `theme-color`, ícono para iPhone (`apple-touch-icon`) y `robots.txt`. Un enlace a `/precios` se comparte sin vista previa. | Adquisición. | Media |
| **H6** | **Vista de compatibilidad `dk_ai_features`.** Ningún código la usa ya (la Edge Function y la app se migraron en ADR 0009 y 0010). | Deuda. | Baja |
| **H7** | **Terminología vieja visible.** "superusuario" en la creación del administrador de la plataforma (`/signup-admin`). | Consistencia. | Baja |
| **H8** | **Pantallas con sesión sin pruebas automáticas.** Registro con plan, candados de Funciones, pestaña Plan y galerías se verificaron con arneses temporales, no con pruebas que queden en el repo. | Regresiones silenciosas. | Media |
| **H9** | **Ajustes de Auth pendientes** (del lado del dueño): protección de contraseñas filtradas, SMTP, confirmación de correo y Turnstile, antes de abrir el registro. | Seguridad. | Media (manual) |

Sin hallazgos de aislamiento: ningún camino permite ver o cambiar datos de otra organización o Cuenta (lo cubren `multikitchen_isolation`, `features`, `accounts` y `plans`).

---

## 3. Arquitectura objetivo (cambios sobre lo actual)

### 3.1 Cuota de IA en el servidor (H1)
Una función `dk_ai_run_allowed(feature)` en la base, que la Edge Function llama **antes** de llamar al modelo. Permite la llamada solo si se cumplen las dos condiciones:
1. **Intervalo mínimo** por Cuenta y función, incluso con *Analizar ahora* (D1: 2 minutos).
2. **Tope diario** de análisis con modelo por Cuenta, desde el plan (`dk_plans.limits.ai_runs_per_day`; D1: Business 200, Enterprise 1000, Standard no aplica porque no incluye IA con modelo). Cuentan los análisis `ok` y `error`; los `empty` no llaman al modelo.

Si no se permite, la Edge Function responde `AI_RATE_LIMITED` con cuándo reintentar, y la app muestra el último análisis y el aviso. Todo queda en la base: no hay contadores en memoria de la función.

### 3.2 Parámetros con esquema en la base (H2)
- `dk_features.settings_schema`: por clave, tipo, mínimo y máximo (por ejemplo `frequency_min: number 5–10080`).
- `dk_set_kitchen_feature` rechaza valores fuera de rango con un mensaje claro.
- Los textos (etiquetas, ayudas, unidades) siguen en la app. Una prueba compara los rangos de la app con el esquema de la migración, para que no se separen.

### 3.3 RLS sin superposición (H3)
En cada una de las 22 tablas, la política `FOR ALL` se divide en `INSERT`, `UPDATE` y `DELETE` con las mismas expresiones. La de `SELECT` absorbe su condición (`ver ∨ editar`), así que **quien hoy puede leer sigue pudiendo leer, y nadie más**.

Una migración lo hace de forma mecánica leyendo `pg_policies`: no se reescribe a mano ninguna política y cada expresión se conserva tal cual. Antes de aplicar se verifica con todas las suites (en especial las 72 de aislamiento) y con `EXPLAIN` en tablas grandes (pedidos, compras).

### 3.4 Plataforma: Cuenta con organización explícita (H4)
El diálogo *Nueva cuenta* de `/admin` exige elegir la organización (lista de organizaciones con su plan). Se aplican el tope del plan y la regla de herencia (la plataforma no hereda roles en un negocio ajeno, ADR 0009).

### 3.5 Landing compartible (H5)
- `index.html`: descripción, Open Graph y Twitter (título, descripción, imagen), `theme-color`, `apple-touch-icon` (PNG de 180 px del mismo logo, generado con Chrome sin interfaz, que ya usa el manual) y una imagen para compartir de 1200×630 con la marca.
- `robots.txt` que permite la landing y bloquea las rutas de la app (`/k/`, `/admin`, `/registro/confirmado`, `/activar/`).

### 3.6 Limpieza (H6, H7)
- Retirar la vista `dk_ai_features` (D2).
- "superusuario" → "administrador de la plataforma" en los textos visibles.

### 3.7 Pruebas de pantallas (H8)
Se agregan `@testing-library/react`, `@testing-library/user-event` y `jsdom` (solo de desarrollo), con pruebas de:
- **Registro:** plan preseleccionado desde la URL, *Cambiar plan*, selector obligatorio sin plan, Enterprise no seleccionable.
- **Funciones de la organización:** candado "Incluida en X" y cuentas deshabilitadas.
- **Pestaña Plan:** uso, límites y días de prueba.
- **Galerías:** selección con teclado y valor derivado.

Sin red: los datos de Supabase se simulan en el módulo de API.

---

## 4. Cambios requeridos

| Capa | Cambio |
|---|---|
| **Base** | `dk_plans.limits.ai_runs_per_day` (semillas D1). `dk_features.settings_schema` (semillas con los rangos actuales de la app). `dk_ai_run_allowed()`. Validación de rangos en `dk_set_kitchen_feature` y en una guardia de `dk_kitchen_features` (también ante escritura directa). División de las 22 políticas `FOR ALL`. Retiro de `dk_ai_features` (vista). |
| **Edge Function** | Llama a `dk_ai_run_allowed` antes del modelo y responde `AI_RATE_LIMITED` con `retryAfter`. |
| **App** | Aviso de límite en *Analizar ahora*, sugerencias de Cocina y Abastecimiento. Organización obligatoria en *Nueva cuenta* de la plataforma. Metadatos, íconos y `robots.txt`. Textos "superusuario". Prueba que compara los rangos de la app con los de la base. Pruebas de componentes (sección 3.7). |
| **Docs** | Este ADR (estado), manual (límite de IA y *Analizar ahora*), arquitectura y ERD. |

## 5. Migraciones
| Migración | Contenido | Reversible |
|---|---|---|
| `20260928100000_dk_ai_quota_and_settings_schema` | `settings_schema`, `ai_runs_per_day`, `dk_ai_run_allowed`, validación de rangos (RPC + guardia), corrección de filas con valores fuera de rango (se ajustan al rango), retiro de la vista `dk_ai_features`. | Sí. |
| `20260928110000_dk_rls_split_all_policies` | División mecánica de las políticas `FOR ALL` superpuestas, con verificación dentro de la migración de que no quedan superposiciones y de que se conservan las expresiones. | Sí (la migración deja las expresiones originales en un comentario de cada política). |

Cada una se ensaya antes con `run.py --with …` contra todas las suites, después `db push`, tipos y asesores. La Edge Function se despliega **después** de la migración 1.

## 6. Dependencias y orden
```
M1 (cuota + esquema) ──→ Edge Function ──→ App (aviso de límite, prueba de rangos)
M2 (RLS) ─────────────── independiente; se valida con todas las suites
Plataforma (H4), landing (H5), textos (H7), pruebas de componentes (H8) ── independientes de la base
Docs al final
```

## 7. Riesgos
| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Dividir las políticas cambia quién lee algo. | La condición de lectura nueva es exactamente `ver ∨ editar` (la unión de antes). La migración compara expresiones y se detiene si algo no calza. Pasan las 336 pruebas, incluidas las 72 de aislamiento. |
| R2 | La cuota bloquea un uso legítimo. | Valores holgados (D1), editables en `dk_plans` con un `UPDATE`. El aviso dice cuándo reintentar, y las alertas y listas del sistema siguen sin IA. |
| R3 | Filas guardadas con parámetros fuera del rango nuevo. | La migración las ajusta al rango y lo registra en auditoría. Hoy no hay ninguna fuera de rango (se verifica). |
| R4 | Retirar la vista rompe una versión vieja desplegada. | Ningún código del repo la usa. Si hay un despliegue anterior, se redespliega (D2). |
| R5 | Dependencias nuevas de desarrollo. | Solo `devDependencies`; no entran al bundle. |

## 8. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Cuota de IA | Intervalo mínimo de 2 minutos por Cuenta y función (también con *Analizar ahora*). Tope diario por Cuenta: Business 200 y Enterprise 1000 análisis con modelo. Standard no incluye IA con modelo. |
| **D2** | Vista `dk_ai_features` | Retirarla ahora. |
| **D3** | Pruebas de componentes | Agregar Testing Library + jsdom (solo desarrollo). |
| **D4** | Una organización por persona | Se mantiene (ADR 0008). El modelo ya soporta varias; abrirlo es otra decisión de producto. |
| **D5** | Ajustes de Auth (H9) | Quedan de tu lado: son ajustes de seguridad de tu proyecto. Van documentados con los pasos. |

## 9. Plan de ejecución (una sola aprobación)
| Fase | Qué |
|---|---|
| 1 | M1 + Edge Function + aviso de límite en la app + prueba de rangos. |
| 2 | M2 (RLS) con ensayo completo, `EXPLAIN` y asesores. |
| 3 | Plataforma: organización obligatoria al crear Cuentas. |
| 4 | Landing: metadatos, íconos, imagen para compartir, `robots.txt`. Textos "superusuario". |
| 5 | Pruebas de componentes (D3). |
| 6 | Validación integral (SQL, app, `build`, asesores, navegador). |
| 7 | Documentación (manual, este ADR, arquitectura, ERD). |

## 10. Criterios de éxito
1. **IA:** *Analizar ahora* no llama al modelo dos veces dentro del intervalo mínimo, ni más allá del tope diario del plan. Lo prueban la suite SQL y la respuesta `AI_RATE_LIMITED` de la función desplegada.
2. **Parámetros:** la base rechaza valores fuera de rango (RPC y escritura directa), y una prueba falla si la app y la base se separan.
3. **RLS:** `multiple_permissive_policies` pasa de 22 a 0 sin perder ni ganar acceso. Las 336 pruebas existentes siguen en verde, más las nuevas.
4. **Plataforma:** no se puede crear una Cuenta sin elegir organización.
5. **Landing:** un enlace a la landing o a `/precios` muestra título, descripción e imagen al compartirse; `robots.txt` publicado.
6. **Limpieza:** la vista `dk_ai_features` retirada y ningún "superusuario" visible.
7. **Pruebas:** de componentes para registro con plan, candados, pestaña Plan y galerías; `tsc`, `oxlint` sin avisos nuevos y `build` en verde.
8. **Documentación:** manual, ADR, arquitectura y ERD actualizados.
