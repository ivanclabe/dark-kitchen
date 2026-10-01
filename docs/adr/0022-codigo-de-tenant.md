# ADR 0022: Código de tenant de 6 caracteres (reemplaza el `slug` como subdominio)

## Estado
**Aprobada (2026-10-01) con las recomendaciones D1–D5, y ejecutada.** Modifica la decisión D1 de la [ADR 0021](./0021-subdominios-por-organizacion.md): el subdominio es el código de 6 caracteres, nunca el nombre. Resultados en la sección 9.

Reglas: código y URL en inglés; textos de la interfaz en español; el manual no se toca; nada fijo en el código (`VITE_TENANT_ROOT_DOMAIN`). El pedido dice «cuanela»; el dominio es **quanela.com**.

> **Nota:** el pedido llegó cortado en «### 11. Base». Este plan cubre los puntos 1 a 10. Si había más, mándamelo y lo agrego antes de ejecutar.

---

## 1. Auditoría (2026-10-01)
- **Organizaciones:** hay 2 (`dark-kitchen` y `julian-hamburguesas`). Ninguna tiene un código; el subdominio de hoy es el `slug`, que sale del nombre.
- **El comodín ya está activo:** `dark-kitchen.quanela.com` responde 200, así que las direcciones con nombre podrían estar circulando desde hace unas horas.
- **Alias:** `dk_organization_slug_aliases` está vacía; nunca se cambió un subdominio.
- **Uso del `slug` como tenant:**
  - **Base:** `dk_tenant_public`, `dk_ga_set_organization_slug` y el guardián de `slug`.
  - **Contexto:** `dk_my_context` y `dk_ga_*` devuelven el `slug` pero no un código.
  - **Frontend:** 15 archivos usan el `slug` como subdominio (`src/shared/tenant`, `KitchenScope`, `OrgScope`, el selector de cuentas, el de organizaciones, el login y el registro).
  - **Portal:** 4 archivos (lista, detalle con «Cambiar subdominio», alta y `lib/tenant`).
- **Lo que no cambia:** la seguridad no depende del identificador. La puerta exige sesión y membresía activa, y la RLS por cuenta y membresía decide cada dato (suites `tenants` y `multikitchen_isolation`).

## 2. El código
| Propiedad | Cómo |
|---|---|
| 6 caracteres alfanuméricos | Alfabeto **sin caracteres confundibles**: `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (sin 0/O, 1/I/L). Son 31⁶ ≈ 887 millones de combinaciones |
| Nunca una palabra | **Al menos una letra y al menos un número.** Ninguno puede ser solo letras (`STATUS`, `ASSETS`). Además se revisa contra la lista de reservados |
| Único y concurrente | Columna `tenant_code` con **`UNIQUE`**. Se genera en la base (`dk_new_tenant_code()`, con `gen_random_bytes`). Si dos altas simultáneas chocan, `dk_provision_organization` reintenta ante la violación de unicidad, hasta 10 veces |
| Estable e independiente del nombre | Se genera una sola vez al crear la organización. **Nadie lo puede cambiar**, ni la organización ni el Global Admin (el guardián lo rechaza) |
| Mayúsculas y minúsculas | Se guarda y se muestra en **MAYÚSCULAS** (`A7K92P`); el subdominio va en minúsculas (`a7k92p.quanela.com`), porque el DNS no distingue entre ellas |
| Organizaciones existentes | Reciben su código en la migración |

## 3. Cambios
### 3.1 Base de datos
1. `dk_organizations.tenant_code`: `not null`, `unique` y `check` de formato. Se llena por trigger al insertar y se completa para las 2 organizaciones existentes.
2. `dk_new_tenant_code()` con el alfabeto y las reglas de la sección 2. El reintento por concurrencia va en `dk_provision_organization`, que comparten el registro y el portal.
3. Guardián: `tenant_code` inmutable.
4. `dk_tenant_public(code)` busca por código (sin distinguir mayúsculas). Sigue sin devolver ids ni datos internos.
5. `dk_my_context` agrega `tenantCode` a cada organización. Los `dk_ga_*` (lista, detalle y alta) lo devuelven; el alta también lo responde a la Edge Function.
6. Se retira el «cambio de subdominio»: se elimina `dk_ga_set_organization_slug` y se elimina la tabla de alias, que está vacía (D3). El `slug` queda como dato interno: la ruta del centro de administración (`/o/{slug}`) y el selector.

### 3.2 Quanela
- **Resolución desde el host.** `parseHost` reconoce como tenant solo una etiqueta de 6 caracteres válida; cualquier otra (un nombre, por ejemplo) se trata como «no existe». `resolveOrganizationFromHost` y `TenantProvider` siguen siendo el único lugar donde se resuelve.
- **Membresía por código.** `tenantAccess`, `KitchenScope`, `OrgScope`, el selector de organizaciones y el de cuentas comparan por `tenantCode`.
- **Pantallas que muestran la dirección:**
  - el registro: «Tu organización ha sido creada. Código: **A7K92P**. Tu espacio Quanela: **a7k92p.quanela.com**»;
  - el login de cada subdominio y el selector de organizaciones muestran el código.

### 3.3 Portal Global Admin
- Lista: columnas **Código** y **Subdominio**, con enlace.
- Detalle: código, subdominio, **Abrir** y **Copiar**. Sin «Cambiar».
- Resumen del alta: código y URL.

### 3.4 Direcciones con nombre ya publicadas (D4)
- Con la recomendación, `dark-kitchen.quanela.com` y `julian-hamburguesas.quanela.com` **dejan de funcionar** («esta dirección no existe»), como pide el texto: el nombre no se usa ni como respaldo.
- Si prefieres no romper enlaces que ya compartiste, la alternativa es que esas 2 direcciones redirijan una sola vez a su código, y solo para las organizaciones existentes.

## 4. Pruebas
- **SQL (`tenants`, actualizada):**
  - el formato y las reglas del código;
  - la unicidad, incluido el reintento cuando se fuerza un choque;
  - el código es inmutable para todos;
  - las organizaciones existentes tienen código;
  - el registro y el alta del portal lo generan;
  - `dk_tenant_public` resuelve por código y no por nombre;
  - conocer el código no da acceso: sin membresía no se ve nada;
  - la misma persona con roles distintos en A y B.
- **Vitest:**
  - `parseHost` con códigos, nombres y mayúsculas;
  - `tenantAccess` por código;
  - las URL de cada organización;
  - la navegación entre subdominios.
- **Navegador local:**
  - `{código}.localhost` muestra el login de su organización;
  - `{nombre}.localhost` muestra «no existe».
- **Regresión:** todas las suites, `tsc`, `oxlint` y ambos builds.

## 5. Riesgos
| Riesgo | Mitigación |
|---|---|
| Se rompen los enlaces con nombre que ya circulan | D4 (redirigir una sola vez si lo prefieres) |
| El código es difícil de recordar | Se muestra junto al nombre en el login, el selector, el portal y el registro. La persona entra desde «Tus organizaciones» o desde `quanela.com` |
| Alguien adivina un código | No da acceso: la seguridad es la sesión, la membresía, los roles y la RLS. El código solo identifica a la organización |

## 6. Decisiones (con recomendación)
| # | Decisión | Recomendación |
|---|---|---|
| **D1** | Alfabeto | **Sin caracteres confundibles** (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`), al menos una letra y un número |
| **D2** | Visualización | **`A7K92P` en pantalla; `a7k92p.quanela.com` en la dirección** |
| **D3** | Cambio de subdominio desde el portal | **Se retira**: el código es para toda la vida. Se eliminan la función y la tabla de alias, que está vacía |
| **D4** | Direcciones con nombre ya publicadas | **Dejan de funcionar**, como pide el texto. La alternativa es redirigirlas una sola vez para las 2 organizaciones existentes |
| **D5** | `slug` | **Se conserva como dato interno** (rutas `/o/{slug}`), nunca como subdominio |

## 7. Orden de ejecución
| Fase | Qué |
|---|---|
| 1 | Base: columna, generador, trigger y reintento, relleno de las existentes, guardián, `dk_tenant_public` por código, `tenantCode` en `dk_my_context` y `dk_ga_*`, retiro de la función de cambio y de los alias; suite `tenants` |
| 2 | Quanela: `src/shared/tenant` por código, puerta, scopes, selectores, login y registro |
| 3 | Portal: código, subdominio, Abrir y Copiar; alta con código y URL; quitar «Cambiar» |
| 4 | Validación: SQL, vitest, `tsc`, `oxlint`, builds y navegador local |
| 5 | Documentación: esta ADR con resultados, la ADR 0021 marcada como modificada y la arquitectura |

## 8. Qué necesito de ti
1. **Aprobar esta ADR**, con D1 a D5 confirmadas o corregidas.
2. **Decirme si el pedido seguía** después de «11. Base».
3. Después del despliegue, nada más en Vercel: el comodín ya está activo.

---

## 9. Resultados (2026-10-01)

### 9.1 Lo construido
- **Base de datos.** Migración `20261001170000_dk_tenant_code.sql`, aplicada:
  - **El código.** `tenant_code`: `not null`, `unique` y formato. `dk_new_tenant_code()` y el trigger que lo asigna siempre (un valor enviado por un cliente se ignora).
  - **Inmutable.** El guardián impide cambiar el código, y también el `slug`.
  - **Resolución pública.** `dk_tenant_public(p_code)` busca por código y nunca por nombre.
  - **El código viaja con la organización.** `tenantCode` en `dk_my_context`, `dk_ga_organizations` (y el detalle) y `dk_ga_create_organization`; la Edge Function ya lo devuelve en el resumen.
  - **Se retiró el cambio de subdominio.** Se eliminaron `dk_ga_set_organization_slug` y `dk_organization_slug_aliases`, que estaba vacía.
- **Organizaciones existentes.** **Dark Kitchen → `FR3RK6`** (`fr3rk6.quanela.com`) y **Julian Hamburguesas → `CBED2D`** (`cbed2d.quanela.com`).
- **Quanela.**
  - **Código en todo el flujo.** El host se lee como código; la puerta, los scopes, el selector de cuentas, el de organizaciones (muestra el código) y el login trabajan con él.
  - **Registro.** Muestra «Tu organización ha sido creada · Código: **A7K92P** · Tu espacio Quanela: **a7k92p.quanela.com**».
- **Portal.** Columnas Código y Subdominio, con búsqueda por código. En el detalle, una barra con el código, el subdominio, «Abrir organización» y Copiar. El resumen del alta muestra el código, el subdominio y «Abrir organización». Ya no hay «Cambiar».

### 9.2 Ajustes durante la ejecución
| Ajuste | Motivo |
|---|---|
| Concurrencia con un **candado de transacción** al generar el código, en lugar de reintentos | Dos altas simultáneas se esperan unos milisegundos y no pueden elegir el mismo código; `UNIQUE` queda como última barrera (probado) |
| Las direcciones con nombre (`dark-kitchen.quanela.com`) muestran «Esta dirección no existe» | D4 tal como se recomendó |

### 9.3 Validación
- **SQL:** 691/691. La suite `tenants` (38) cubre:
  - formato y reglas, 200 códigos generados válidos y distintos;
  - un código enviado por el cliente se ignora, y `UNIQUE` frena un duplicado;
  - código y `slug` inmutables incluso para la plataforma, y renombrar no cambia el código;
  - el alta del portal y el registro público lo generan, y viaja en el contexto y en la lista del portal;
  - se resuelve en minúsculas, el nombre no resuelve, y saber el código no da acceso.
- **Vitest:** 276/276. Host por código y en mayúsculas, acceso por código, «el código no basta, decide la membresía», URL en minúsculas y navegación entre organizaciones.
- **Resto:** `tsc` sin errores; `oxlint` con 17 avisos, igual que antes; ambos builds.
- **Navegador local:**
  - `fr3rk6.localhost` → login de Dark Kitchen;
  - `cbed2d.localhost/kitchen` → login de Julian Hamburguesas;
  - `dark-kitchen.localhost` → «Esta dirección no existe»;
  - sin errores en la consola.
- **Pendiente con tu sesión:** entrar con sesión y cambiar de organización; en producción, después de desplegar.

