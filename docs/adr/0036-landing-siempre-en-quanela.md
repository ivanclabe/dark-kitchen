# ADR 0036: `quanela.com` siempre muestra la landing

## Estado
**Aprobada e implementada (2026-10-06)**, opción A.

## Problema
Con la sesión abierta no se podía volver a la landing:
- `quanela.com/` llevaba a la cuenta, en su subdominio (`ProtectedRoute` + `KitchenEntryRedirect`);
- la sesión se comparte en todo `.quanela.com`, así que siempre te devolvía al negocio;
- ningún menú de la app enlazaba la landing.

## Decisión
- **`quanela.com/` es siempre la landing**, con o sin sesión. Con sesión, la landing ya ofrece «Ir a mi cuenta».
- **`/app` es la entrada a la app** desde cualquier host (`APP_ENTRY` en `src/shared/tenant/navigation.ts`): la Cuenta por defecto, en su subdominio; sin sesión, el login.
- Todo lo que significaba «entrar a la app» apunta a `/app`:
  - el destino del login sin `?next=`;
  - «Ir a mi cuenta» (barra, hero, pie y precios de la landing);
  - el fin de `set-password` y `signup-admin`;
  - el dueño que vuelve al registro;
  - la confirmación del registro sin pendiente;
  - `/admin/*`;
  - «Volver a Quanela» de `doc.quanela.com`.
- Sin cambios:
  - en el subdominio de un negocio, `/` sigue siendo la app (o su login);
  - sin dominio raíz (vistas previas), `/` se comporta como antes;
  - los enlaces que llevan a la landing a propósito (el logo del registro, «Volver al inicio» sin sesión, «Ir a Quanela») siguen en `/`.

## Validación
- `tsc` sin errores; `oxlint` con los 14 avisos de siempre.
- Vitest: las pruebas del login y del registro del dueño ahora esperan `/app`.
- En el navegador, sin sesión:
  - `localhost:5173/` muestra la landing;
  - `localhost:5173/app` lleva al login.
- No probado con sesión: no inicio sesión por el usuario. La ruta `/` de la raíz no depende de la sesión.
