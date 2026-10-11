#!/bin/bash
# ADR 0055 — both WhatsApp end-to-end suites against a LOCAL Supabase (never the real one).
#   E2E_WORKDIR   folder whose supabase/ is the running local stack (see README.md)
#   E2E_PASSWORD  password of the local test user (created in README step 3)
#   KITCHEN       id of the local test account (printed by setup.sql)
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
DB="${E2E_DB_CONTAINER:-supabase_db_quanela-e2e}"
docker exec "$DB" psql -U postgres -tAc "delete from vault.secrets where id in (select access_token_id from dk_wa_accounts union select app_secret_id from dk_wa_accounts) or name like 'dk_n8n_secret_%'; delete from dk_wa_accounts; delete from dk_wa_templates; delete from dk_wa_outbox; delete from dk_wa_conversations; delete from dk_integration_endpoints; delete from dk_ai_insights where feature_key = 'whatsapp_ordering'; delete from dk_public_order_attempts; update dk_customers set whatsapp_opt_in = false, whatsapp_opt_in_at = null, whatsapp_opt_in_source = null, whatsapp_opt_out_at = null;" >/dev/null
cd "$DIR"
SIM_PORT=4010 SIM_WEBHOOK=http://127.0.0.1:55421/functions/v1/dk-whatsapp-webhook SIM_APP_SECRET=e2e-app-secret node meta-sim.mjs > sims.log 2>&1 &
P1=$!
LLM_PORT=4020 node llm-sim.mjs >> sims.log 2>&1 &
P2=$!
N8N_PORT=4030 node n8n-sim.mjs >> sims.log 2>&1 &
P3=$!
sleep 1
eval "$(supabase status --workdir "$E2E_WORKDIR" -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY)=')"
export API_URL ANON_KEY KITCHEN E2E_PASSWORD
echo "== Fase A: avisos salientes =="
node e2e-notices.mjs; A=$?
echo; echo "== Fase B: pedidos por WhatsApp y n8n =="
node e2e-ordering.mjs; B=$?
kill $P1 $P2 $P3 2>/dev/null
rm -f sims.log
exit $(( A + B ))
