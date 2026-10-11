# Pruebas de extremo a extremo de WhatsApp (ADR 0055)

Corren sobre un **Supabase local**, nunca sobre la base real, con tres simuladores:

| Simulador | Puerto | Qué hace |
|---|---|---|
| `meta-sim.mjs` | 4010 | Hace de Graph de Meta: recibe los envíos, devuelve los recibos `sent → delivered → read` firmados al webhook y simula mensajes entrantes (`/_inbound`) |
| `llm-sim.mjs` | 4020 | Hace del modelo: convierte el mensaje en intenciones con reglas fijas y guarda lo que recibió, para comprobar que nunca vio precios |
| `n8n-sim.mjs` | 4030 | Hace de un nodo Webhook de n8n: verifica `X-Quanela-Signature` |

**Qué cubren las pruebas:**
- **`e2e-notices.mjs`** (fase A, 18 pasos):
  - conexión, verificación del webhook y plantillas;
  - aviso «confirmado» → entregado → leído, con sus variables y el seguimiento;
  - «listo para recoger» y cancelado;
  - sin aceptación, número inválido y reintento;
  - sin duplicados con varios despachadores;
  - firma falsa rechazada.
- **`e2e-ordering.mjs`** (fase B, 21 pasos):
  - conversación con el asistente, sin inventar, con el total real;
  - «sí» → pedido WhatsApp en cocina, con su aviso;
  - paso a una persona y bandeja;
  - BAJA;
  - modo n8n con eventos firmados y pedido creado desde n8n.

## Cómo correrlas

1. **Copia** `supabase/` a una carpeta temporal y, en su `config.toml`, cambia `project_id` (por ejemplo `quanela-e2e`) y los puertos (`54321 → 55421`, `54322 → 55422`, etc.) para no chocar con otro Supabase local.
   > La cadena completa de migraciones no se aplica sobre una base vacía: `20260925120000_dk_organizations.sql` exige un dueño. En la **copia**, reemplaza el `raise exception 'Fase C: …'` por la creación de un usuario de prueba. No cambies la migración del repositorio.
2. En esa carpeta, levanta el stack local:
   ```bash
   supabase start --workdir <copia> -x studio,imgproxy,logflare,vector,supavisor,mailpit
   ```
   Apunta `pg_net` al gateway local:
   ```bash
   docker exec supabase_db_quanela-e2e psql -U postgres -c "update dk_platform_settings set value = 'http://supabase_kong_quanela-e2e:8000/functions/v1' where key = 'functions_url'"
   ```
3. Crea la usuaria local de prueba con la API de administración local (`laura@negocio.co`, contraseña en `$E2E_PASSWORD`). Después carga los datos con `setup.sql` (`docker exec -i … psql -U postgres < setup.sql`), que imprime el id de la cuenta (`KITCHEN`).
4. Sirve las funciones con estas variables (valores locales; no son claves reales):
   ```bash
   supabase functions serve --workdir <copia> --env-file e2e.env
   ```
   El archivo `e2e.env` lleva:
   ```
   DK_META_GRAPH_TEST_URL=http://host.docker.internal:4010
   QUANELA_APP_URL=http://localhost:5173
   DK_ANTHROPIC_API_KEY=local-simulator-not-a-key
   DK_ANTHROPIC_BASE_URL=http://host.docker.internal:4020
   DK_WA_DEBOUNCE_MS=400
   ```
5. Corre las pruebas:
   ```bash
   E2E_WORKDIR=<copia> KITCHEN=<id> E2E_PASSWORD=… ./run.sh
   ```
   Al terminar, apaga el stack: `supabase stop --workdir <copia> --no-backup`.
