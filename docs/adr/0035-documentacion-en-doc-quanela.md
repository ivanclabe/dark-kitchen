# ADR 0035: La documentación en `doc.quanela.com`, enlazada desde la landing

## Estado
**Aprobada e implementada (2026-10-06).**

**Pedido:** el centro de ayuda (ADR 0034) debe vivir en **`doc.quanela.com`** y verse desde la **landing**.

**Reglas que siguen:**
- Una sola fuente: `content/help/` (ADR 0034).
- El manual HTML/PDF no se toca.
- URL e identificadores en inglés; textos en español.

---

## 1. Auditoría
| Hoy | Problema |
|---|---|
| La ayuda está en `/help` de cualquier host (`quanela.com/help`, `fr3rk6.quanela.com/help`) | No tiene una dirección propia; el mismo artículo existe en muchas direcciones |
| `parseHost` trata cualquier subdominio como el código de un negocio | `doc.quanela.com` buscaría la organización «DOC» en la base y mostraría «negocio no encontrado» |
| El comodín `*.quanela.com` ya apunta al proyecto de Vercel (ADR 0021) | `doc.quanela.com` ya llega a la app: **no hace falta DNS ni otro despliegue** |
| Los códigos de negocio tienen 6 caracteres (ADR 0022) | «doc» nunca puede ser un negocio: no hay choque |
| Los enlaces a la ayuda son rutas relativas (`/help/...`) en `PageHeader` («?»), el menú de usuario, el login, la landing, Copilot y la burbuja de «Oye Quanela» | Hay que llevarlos todos a `doc.quanela.com` |
| La landing solo tiene «Centro de ayuda» en el pie | Poco visible |
| El login acepta `?next=` | Sirve para «Abrir en Quanela» desde la documentación |

## 2. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | ¿Proyecto aparte o la misma app? | **La misma app y el mismo despliegue.** Un tipo de host nuevo, `docs`, para `doc.{dominio raíz}`. En ese host solo existe la documentación: sin login, sin resolver negocio, sin cargar el resto de la app |
| **D2** | Direcciones en `doc.quanela.com` | **Sin el prefijo `/help`:** `doc.quanela.com/` (inicio), `doc.quanela.com/orders/register-payment`. Las imágenes siguen en `/help/img/…`. Un `/help/...` viejo en ese host redirige a la dirección sin prefijo |
| **D3** | `/help` en `quanela.com` y en los subdominios de negocio | **Redirige** al mismo artículo en `doc.quanela.com`. Así hay una sola dirección por artículo. Sin dominio raíz (vistas previas de Vercel, desarrollo sin configurar), `/help` sigue funcionando como hoy |
| **D4** | Enlaces desde la app | **Un solo helper `helpUrl()`** arma la dirección absoluta en `doc.quanela.com`. Lo usan el «?», el menú de usuario, el login, la landing, las tarjetas de Copilot y «Abrir guía» de la voz. `kb.ts` y `dk-copilot` no cambian: la app traduce la ruta del artículo |
| **D5** | La landing | **«Ayuda»** en la barra de arriba (escritorio y menú del celular) y **«Centro de ayuda»** en el pie, ambos a `doc.quanela.com` |
| **D6** | Botones de la documentación | **«Entrar»** va a `quanela.com/login`; con sesión (la cookie es de `.quanela.com`) dice **«Volver a Quanela»** y va a `quanela.com`. **«Abrir en Quanela»** va a `quanela.com/login?next=<pantalla>`, que lleva a la cuenta de la persona |
| **D7** | Buscadores (SEO) | Cada artículo con su `<title>`, su descripción y un **`canonical`** a `doc.quanela.com`. El prerender sigue en «Futuro» (ADR 0034) |
| **D8** | Desarrollo | `doc.localhost:5173` funciona igual, sin configuración extra |

## 3. Qué cambia
- `src/shared/tenant/host.ts`:
  - `HostKind` suma `{ kind: 'docs' }` para `doc.{raíz}`;
  - `docsUrl(path)` arma la dirección de la documentación.
- `TenantGate` / `TenantProvider`: en el host `docs` no se resuelve negocio ni sesión obligatoria.
- `routes.tsx`:
  - en el host `docs`, las rutas de la ayuda en la raíz (`/`, `/:section`, `/:section/:id`) y `/help/*` → sin prefijo;
  - en los demás hosts con dominio raíz, `/help/*` → `doc.quanela.com`.
- `src/modules/help`: las direcciones salen de `helpUrl` / `helpPath` (no más `/help` fijo), incluida la intercepción de enlaces entre artículos y el `canonical`.
- `HelpButton`, `UserMenu` (`helpCenterUrl`), `LoginPage`, `LandingPage` + `LandingNav`, `CopilotProvider` y `VoiceMenu`: usan `helpUrl`.
- `scripts/help-screenshots.ts`: sin cambios (sigue capturando la app).
- **Pruebas:**
  - `parseHost` (doc, mayúsculas, `doc.localhost`, un código de 6 caracteres sigue siendo negocio);
  - `helpUrl` con y sin dominio raíz;
  - la redirección de `/help`;
  - la ayuda montada en la raíz del host `docs`;
  - la landing con «Ayuda».
- **Docs:** esta ADR con resultados, la ADR 0034 (nota de la nueva dirección) y `docs/00-architecture.md`.

## 4. Lo que tienes que hacer tú
- **Nada en el DNS** si el comodín `*.quanela.com` ya está en Vercel (ADR 0021).
- Si no lo está, agrega en Vercel → Domains el dominio **`doc.quanela.com`** al proyecto de Quanela.
- Supabase: sin cambios (la documentación no inicia sesión).

## 5. Riesgos
| Riesgo | Mitigación |
|---|---|
| Alguien guarda un enlace `quanela.com/help/...` | Redirige al mismo artículo (D3) |
| Vista previa de Vercel sin dominio raíz | `/help` sigue local (D3) |
| Un negocio con código «DOC» | Imposible: los códigos tienen 6 caracteres (ADR 0022) |

## 6. Resultados (2026-10-06)
| Pieza | Qué quedó |
|---|---|
| Host | `parseHost` reconoce `doc.{raíz}` como `docs`; `docsUrl()` arma su dirección. «docabc» (6 caracteres) sigue siendo un negocio |
| Rutas | En `docs`, `createBrowserRouter` usa `DOCS_ROUTES` (`src/modules/help/routes.ts`): la ayuda en la raíz, `/help/*` → sin prefijo, cualquier otra ruta → inicio. Sin `TenantGate` ni login. En `root`/`tenant`, `/help/*` → `HelpElsewhere` lleva al mismo artículo en `doc.…`. En modo `path`, `/help` sigue dentro de la app |
| Direcciones | `src/shared/help/helpUrl.ts`: `helpPath()` (rutas del sitio) y `helpHref()` (desde cualquier lugar). Los enlaces entre artículos del HTML generado se reescriben al host |
| Enlaces | «?» (`HelpButton`), menú de usuario (`helpCenterUrl`), login, landing (barra «Ayuda», menú del celular y pie), tarjetas de Copilot y «Abrir guía» de la voz |
| Documentación | «Entrar» → `quanela.com/login`; «Volver a Quanela» → `quanela.com`; «Abrir en Quanela» → `quanela.com/login?next=<pantalla>` (la ruta corta lleva a la cuenta de la persona en su subdominio); `canonical` a `doc.quanela.com` |

**Validación:**
- `tsc` sin errores; `oxlint` con los 14 avisos de siempre.
- Vitest: **508 pruebas**. Son nuevas `helpUrl`, `parseHost` con `doc`, el host de documentación (rutas en la raíz, `/help` viejo, enlaces, «Abrir en Quanela», `canonical`) y «Ayuda» en la landing.
- Los dos builds correctos.
- En el navegador:
  - `doc.localhost:5173/orders/register-payment` carga sin sesión;
  - `fr3rk6.localhost:5173/help/faq/faq` lleva a `doc.localhost:5173/faq/faq`;
  - la landing enlaza «Ayuda» y «Centro de ayuda» a `doc.…`.

**Para producción:** basta con que el comodín `*.quanela.com` esté en Vercel; si no, agrega `doc.quanela.com` en Vercel → Domains.
