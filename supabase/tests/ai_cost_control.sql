-- ADR 0063, fase 1: la IA bajo control. Transacción revertida.
--   · qué cuenta como consulta pagada (también la cancelada y el documento que no era factura);
--   · la reserva con huella, el intervalo y el cierre con tokens de caché;
--   · la cancelación de Copilot: se pide, se cierra como cancelada CON sus tokens y cuenta;
--   · el presupuesto mensual: avisa, y al llegar pausa solo lo automático;
--   · el costo del mes y los topes para la cuenta, las llamadas evitadas;
--   · la limpieza programada, el asistente de Consumer y los ajustes nuevos.
--
--   python3 supabase/tests/run.py ai_cost_control

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid, v jsonb) on commit drop;
grant all on _t, _ctx to authenticated;
grant usage on sequence _t_n_seq to authenticated;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', jsonb_build_object('x-dk-kitchen-id', p_kitchen)::text, true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.role_id(p_key text) returns uuid language sql as $$ select id from dk_roles where is_system and key = p_key $$;
create or replace function pg_temp.check(p_area text, p_test text, p_expected text, p_got text, p_detail text default null) returns void language sql as $$
  insert into _t (area, test, expected, got, detail) values (p_area, p_test, p_expected, coalesce(p_got, '∅'), p_detail)
$$;

-- An account with every AI feature on, and an admin there.
insert into _ctx (key, id) values ('A', (select id from dk_kitchens where active order by created_at limit 1));
insert into _ctx (key, id) values ('ORG', (select organization_id from dk_kitchens where id = pg_temp.k('A')));
insert into _ctx (key, id) values ('OWNER', (select u.auth_user_id from dk_organizations o join dk_users u on u.id = o.owner_user_id where o.id = pg_temp.k('ORG')));
insert into auth.users (id, email, aud, role) values ('00000000-0000-0000-0000-0000000c0c01', 'admin.costo@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values ('10000000-0000-0000-0000-0000000c0c01', '00000000-0000-0000-0000-0000000c0c01', 'Admin costo', true);
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id) values (pg_temp.k('A'), '10000000-0000-0000-0000-0000000c0c01', pg_temp.role_id('ADMIN'));
-- The plan that includes every AI feature, and the features on in the account.
update dk_subscriptions set plan_key = 'business' where organization_id = pg_temp.k('ORG');
insert into dk_organization_features (organization_id, feature_key, available)
select pg_temp.k('ORG'), key, true from dk_features on conflict (organization_id, feature_key) do update set available = true;
insert into dk_kitchen_features (kitchen_id, feature_key, enabled)
select pg_temp.k('A'), key, true from dk_features where key in ('supply_reorder', 'copilot', 'invoice_import', 'kitchen_insights')
on conflict (kitchen_id, feature_key) do update set enabled = true;
update dk_features set active = true where key in ('supply_reorder', 'copilot', 'invoice_import', 'kitchen_insights');
-- A priced model, used by every feature here.
insert into dk_ai_models (key, provider, label, input_price_per_mtok, output_price_per_mtok, active, sort_order)
values ('modelo-prueba-costo', 'anthropic', 'Modelo de prueba', 3, 15, true, 99);
update dk_features set model_key = 'modelo-prueba-costo' where key in ('supply_reorder', 'copilot', 'invoice_import', 'kitchen_insights');
delete from dk_ai_insights where kitchen_id = pg_temp.k('A');
delete from dk_ai_cache_hits where kitchen_id = pg_temp.k('A');

-- 1. Qué es una consulta pagada, y cuánto cuesta
select pg_temp.check('Medición', 'Pagadas: ok, error, running, cancelled; empty solo con tokens', 't t t t f t',
  concat_ws(' ', dk_ai_run_billed('ok', null), dk_ai_run_billed('error', null), dk_ai_run_billed('running', null),
            dk_ai_run_billed('cancelled', 10), dk_ai_run_billed('empty', null), dk_ai_run_billed('empty', 900)));
-- 1 M input × $3 + 0,1 M output × $15 + 1 M cache read × $0,30 + 0,1 M cache write × $3,75 = 3 + 1,5 + 0,3 + 0,375
select pg_temp.check('Medición', 'Costo con caché aparte (US$)', '5.175',
  trim_scale(dk_ai_run_cost('modelo-prueba-costo', 1000000, 100000, 1000000, 100000))::text);
select pg_temp.check('Medición', 'Modelo sin precio → sin costo (no se inventa)', '∅',
  coalesce(dk_ai_run_cost((select key from dk_ai_models where input_price_per_mtok is null limit 1), 1000, 10, null, null)::text, '∅'));

-- 2. Reserva con huella, intervalo y cierre con tokens de caché
select pg_temp.act_as('00000000-0000-0000-0000-0000000c0c01', pg_temp.k('A'));
set local role authenticated;
do $$
declare v jsonb; w jsonb;
begin
  v := dk_ai_run_reserve('supply_reorder', '{"insumos": []}', 'huella-1');
  insert into _ctx (key, id, v) values ('run1', (v ->> 'runId')::uuid, v);
  perform pg_temp.check('Reserva', 'Reserva el análisis con su huella', 'true · running · huella-1',
    concat_ws(' · ', v ->> 'allowed', (select status from dk_ai_insights where id = (v ->> 'runId')::uuid), (select input_hash from dk_ai_insights where id = (v ->> 'runId')::uuid)));
  w := dk_ai_run_reserve('supply_reorder', '{"insumos": []}', 'huella-1');
  perform pg_temp.check('Reserva', 'Otra pantalla a la vez: no llama otra vez', 'false · interval', concat_ws(' · ', w ->> 'allowed', w ->> 'reason'));
  perform dk_ai_run_finish(p_run_id => (v ->> 'runId')::uuid, p_status => 'ok', p_output => '{"summary": "", "items": []}',
    p_input_tokens => 1200, p_output_tokens => 300, p_cache_read_tokens => 5000, p_cache_write_tokens => 800);
  perform pg_temp.check('Reserva', 'Se cierra con tokens de entrada, salida y caché', 'ok · 1200 · 300 · 5000 · 800',
    (select concat_ws(' · ', status, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens) from dk_ai_insights where id = (v ->> 'runId')::uuid));
end $$;
reset role;

-- 3. Cancelar Copilot: se pide, la corrida se cierra como cancelada con sus tokens, y cuenta
select pg_temp.act_as('00000000-0000-0000-0000-0000000c0c01', pg_temp.k('A'));
set local role authenticated;
do $$
declare v jsonb; v_run uuid;
begin
  v := dk_ai_run_reserve('copilot', '{"question": "¿cuánto vendimos?", "requestId": "r1"}');
  v_run := (v ->> 'runId')::uuid;
  perform pg_temp.check('Cancelar', 'Antes de pedirlo, no está cancelada', 'false', dk_ai_run_cancel_requested(v_run)::text);
  perform pg_temp.check('Cancelar', 'Pedir la cancelación', 'true', dk_ai_run_request_cancel(v_run)::text);
  perform pg_temp.check('Cancelar', 'La función lo ve entre rondas', 'true', dk_ai_run_cancel_requested(v_run)::text);
  -- The last round had already answered: the run still closes as cancelled, with the tokens it used.
  perform dk_ai_run_finish(p_run_id => v_run, p_status => 'ok', p_input_tokens => 900, p_output_tokens => 120, p_cache_read_tokens => 4000);
  perform pg_temp.check('Cancelar', 'Cerrada como cancelada, con sus tokens', 'cancelled · 900 · 120 · 4000',
    (select concat_ws(' · ', status, input_tokens, output_tokens, cache_read_tokens) from dk_ai_insights where id = v_run));
end $$;
reset role;
select pg_temp.as_owner();
select pg_temp.check('Cancelar', 'La cancelada cuenta en el tope de Copilot', '1',
  (select count(*)::text from dk_ai_insights where kitchen_id = pg_temp.k('A') and feature_key = 'copilot' and dk_ai_run_billed(status, input_tokens)));
-- Another person cannot ask to stop someone else's question.
select pg_temp.act_as(pg_temp.k('OWNER'), pg_temp.k('A'));
set local role authenticated;
select pg_temp.check('Cancelar', 'Otra persona no cancela una consulta ajena', 'false',
  dk_ai_run_request_cancel((select id from dk_ai_insights where kitchen_id = pg_temp.k('A') and feature_key = 'copilot' limit 1))::text);
reset role;

-- 4. Un documento que no era factura: se cobró, así que cuenta en el tope
select pg_temp.as_owner();
insert into dk_ai_insights (kitchen_id, feature_key, status, input, model, input_tokens, output_tokens, created_by)
values (pg_temp.k('A'), 'invoice_import', 'empty', '{}', 'modelo-prueba-costo', 2500, 40, '10000000-0000-0000-0000-0000000c0c01'),
       (pg_temp.k('A'), 'supply_reorder', 'empty', '{}', null, null, null, null);
select pg_temp.act_as(pg_temp.k('OWNER'), pg_temp.k('A'));
set local role authenticated;
select set_config('test.cost', dk_account_ai_cost()::text, true);
reset role;
select pg_temp.check('Topes', 'Análisis en 24 h: el de compras y la factura vacía con tokens (no el vacío sin modelo)', '2',
  (current_setting('test.cost')::jsonb #>> '{limits,analyses,used24h}'));
select pg_temp.check('Topes', 'Copilot y WhatsApp con su propio tope visible', '100 · 1 · 400',
  concat_ws(' · ', current_setting('test.cost')::jsonb #>> '{limits,copilot,perDay}', current_setting('test.cost')::jsonb #>> '{limits,copilot,used24h}',
            current_setting('test.cost')::jsonb #>> '{limits,whatsapp,perDay}'));
select pg_temp.check('Costo del mes', 'Consultas del mes (compras, Copilot cancelada, factura)', '3',
  current_setting('test.cost')::jsonb #>> '{month,runs}');
select pg_temp.check('Costo del mes', 'Costo estimado del mes en US$', '0.0264',
  current_setting('test.cost')::jsonb #>> '{month,estimatedUsd}',
  'compras 0,0126 + Copilot 0,0057 + factura 0,0081 (precios 3 / 15 por millón, caché 10 % y 125 %)');

-- 5. Llamadas evitadas
select pg_temp.act_as('00000000-0000-0000-0000-0000000c0c01', pg_temp.k('A'));
set local role authenticated;
select dk_ai_cache_hit('supply_reorder'), dk_ai_cache_hit('supply_reorder'), dk_ai_cache_hit('kitchen_insights');
reset role;
select pg_temp.act_as(pg_temp.k('OWNER'), pg_temp.k('A'));
set local role authenticated;
select pg_temp.check('Evitadas', 'Cada reutilización se cuenta por función', '2 · 1',
  (select concat_ws(' · ', max(x ->> 'avoided') filter (where x ->> 'key' = 'supply_reorder'), max(x ->> 'avoided') filter (where x ->> 'key' = 'kitchen_insights'))
   from jsonb_array_elements(dk_account_ai_cost() -> 'byFeature') x));
reset role;

-- 6. Presupuesto mensual: aviso y pausa de lo automático
select pg_temp.as_owner();
insert into dk_kitchen_features (kitchen_id, feature_key, enabled, settings) values (pg_temp.k('A'), 'ai_budget', true, '{"monthly_runs": 4, "alert_pct": 75}')
on conflict (kitchen_id, feature_key) do update set enabled = true, settings = excluded.settings;
select pg_temp.check('Presupuesto', '3 de 4 consultas: aviso al 75 %, sin pausa', 'true · false · 75',
  (select concat_ws(' · ', b ->> 'alert', b ->> 'exceeded', b ->> 'pct') from (select dk_ai_budget_status(pg_temp.k('A')) b) x));
insert into dk_ai_insights (kitchen_id, feature_key, status, input, model, input_tokens, created_at)
values (pg_temp.k('A'), 'menu_designer', 'ok', '{}', 'modelo-prueba-costo', 100, now() - interval '3 hours');
select pg_temp.check('Presupuesto', '4 de 4: presupuesto agotado', 'true · 100', (select concat_ws(' · ', b ->> 'exceeded', b ->> 'pct') from (select dk_ai_budget_status(pg_temp.k('A')) b) x));
select pg_temp.act_as('00000000-0000-0000-0000-0000000c0c01', pg_temp.k('A'));
set local role authenticated;
select pg_temp.check('Presupuesto', 'Lo automático se pausa (Cocina)', 'false · budget',
  (select concat_ws(' · ', q ->> 'allowed', q ->> 'reason') from (select dk_ai_run_allowed('kitchen_insights') q) x));
select pg_temp.check('Presupuesto', 'Lo que una persona pide sigue (lectura de facturas)', 'true',
  dk_ai_run_allowed('invoice_import') ->> 'allowed');
reset role;
select pg_temp.as_owner();
update dk_kitchen_features set enabled = false where kitchen_id = pg_temp.k('A') and feature_key = 'ai_budget';
select pg_temp.check('Presupuesto', 'Sin presupuesto activo nada se pausa', 'false · false',
  (select concat_ws(' · ', b ->> 'enabled', b ->> 'exceeded') from (select dk_ai_budget_status(pg_temp.k('A')) b) x));

-- 7. Ajustes nuevos con su rango
select pg_temp.check('Ajustes', 'Copilot: «voz» debe ser sí o no', 'rechazado',
  case when dk_feature_settings_error('copilot', '{"voice_fallback": "si"}') is not null then 'rechazado' else 'aceptado' end);
select pg_temp.check('Ajustes', 'Cocina: menos de 5 min ya no se acepta', 'rechazado',
  case when dk_feature_settings_error('kitchen_insights', '{"frequency_min": 3}') is not null then 'rechazado' else 'aceptado' end);
select pg_temp.check('Ajustes', 'Presupuesto: aviso entre 50 % y 100 %', 'rechazado · aceptado',
  concat_ws(' · ', case when dk_feature_settings_error('ai_budget', '{"alert_pct": 30}') is not null then 'rechazado' else 'aceptado' end,
                   case when dk_feature_settings_error('ai_budget', '{"alert_pct": 90, "monthly_usd": 25}') is not null then 'rechazado' else 'aceptado' end));
select pg_temp.check('Ajustes', 'Valores por defecto: voz, seguimiento y leer al soltar activados', 'true · true · true',
  concat_ws(' · ', (select default_settings ->> 'voice_fallback' from dk_features where key = 'copilot'),
                   (select default_settings ->> 'follow_up' from dk_features where key = 'copilot'),
                   (select default_settings ->> 'read_on_drop' from dk_features where key = 'invoice_import')));

-- 8. Limpieza programada
select pg_temp.as_owner();
insert into dk_ai_insights (id, kitchen_id, feature_key, status, input, model, created_at) values
  ('20000000-0000-0000-0000-0000000c0c01', pg_temp.k('A'), 'copilot', 'running', '{}', 'modelo-prueba-costo', now() - interval '20 minutes'),
  ('20000000-0000-0000-0000-0000000c0c02', pg_temp.k('A'), 'supply_reorder', 'empty', '{}', null, now() - interval '31 days'),
  ('20000000-0000-0000-0000-0000000c0c03', pg_temp.k('A'), 'invoice_import', 'empty', '{}', 'modelo-prueba-costo', now() - interval '31 days');
update dk_ai_insights set input_tokens = 2000 where id = '20000000-0000-0000-0000-0000000c0c03';
select dk_ai_housekeeping();
select pg_temp.check('Limpieza', 'Corrida colgada → error (sigue contando: llamó al modelo)', 'error',
  (select status from dk_ai_insights where id = '20000000-0000-0000-0000-0000000c0c01'));
select pg_temp.check('Limpieza', 'Análisis vacío sin modelo de hace un mes → borrado; con tokens → se queda', 'borrado · queda',
  concat_ws(' · ', case when exists (select 1 from dk_ai_insights where id = '20000000-0000-0000-0000-0000000c0c02') then 'queda' else 'borrado' end,
                   case when exists (select 1 from dk_ai_insights where id = '20000000-0000-0000-0000-0000000c0c03') then 'queda' else 'borrado' end));
select pg_temp.check('Limpieza', 'Tarea programada cada 10 min', '*/10 * * * *', (select schedule from cron.job where jobname = 'dk-ai-housekeeping'));

-- 9. Asistente de Consumer: interruptor de plataforma y medición
select pg_temp.act_as('00000000-0000-0000-0000-0000000c0c01', null);
set local role authenticated;
do $$
declare v jsonb;
begin
  v := dk_consumer_ai_reserve();
  perform pg_temp.check('Consumer', 'Reserva con el modelo de la plataforma', 'true',
    case when (v ->> 'allowed')::boolean and v ->> 'model' is not null then 'true' else v::text end);
  perform dk_consumer_ai_finish((v ->> 'runId')::bigint, true, 420, 35, 900);
end $$;
reset role;
select pg_temp.check('Consumer', 'Queda medido con sus tokens', 'ok · 420 · 35',
  (select concat_ws(' · ', status, input_tokens, output_tokens) from dk_consumer_ai_runs order by id desc limit 1));
update dk_platform_settings set value = 'false' where key = 'consumer_assistant_active';
select pg_temp.act_as('00000000-0000-0000-0000-0000000c0c01', null);
set local role authenticated;
select pg_temp.check('Consumer', 'Apagado en la plataforma: no llama al modelo', 'false · platform',
  (select concat_ws(' · ', r ->> 'allowed', r ->> 'reason') from (select dk_consumer_ai_reserve() r) x));
do $$ begin
  perform dk_platform_set_consumer_ai(true, null);
  perform pg_temp.check('Consumer', 'Solo la plataforma lo enciende o apaga', 'bloqueado', 'PERMITIDO');
exception when others then perform pg_temp.check('Consumer', 'Solo la plataforma lo enciende o apaga', 'bloqueado', 'bloqueado');
end $$;
reset role;
select pg_temp.as_owner();
select pg_temp.check('Permisos', 'Sin sesión no se ve el costo de la IA', 'false',
  has_function_privilege('anon', 'dk_account_ai_cost()', 'execute')::text);

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
