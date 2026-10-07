-- ADR 0041: latency of «Oye Quanela» — the voice model of Copilot and the
-- app's own timings on a question's run. Rolled-back transaction.
--
--   python3 supabase/tests/run.py voice_latency

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid) on commit drop;
create temp table _r (key text primary key, v jsonb) on commit drop;
grant all on _t, _ctx, _r to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  select set_config('request.headers', json_build_object('x-dk-kitchen-id', p_kitchen)::text, true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.r(p_key text) returns jsonb language sql as $$ select v from _r where key = p_key $$;
create or replace function pg_temp.blocked(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return 'blocked'; end;
$$;
create or replace function pg_temp.run_timings(p_run uuid) returns jsonb language sql as $$ select timings from dk_ai_insights where id = p_run $$;

insert into _ctx values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx values ('ivan', (select id from auth.users where email = 'ivanclabe@gmail.com')); -- platform admin
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000041a01', 'admin.latencia@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000041a02', 'caja.latencia@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-000000041a01', '00000000-0000-0000-0000-000000041a01', 'Admin Latencia', true),
  ('10000000-0000-0000-0000-000000041a02', '00000000-0000-0000-0000-000000041a02', 'Caja Latencia', true);
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
select pg_temp.k('A'), m.user_id, (select id from dk_roles where is_system and key = m.role_key)
from (values ('10000000-0000-0000-0000-000000041a01'::uuid, 'ADMIN'), ('10000000-0000-0000-0000-000000041a02'::uuid, 'CASHIER')) m(user_id, role_key);

delete from dk_ai_insights where kitchen_id = pg_temp.k('A');
insert into dk_kitchen_features (kitchen_id, feature_key, enabled) values (pg_temp.k('A'), 'copilot', true)
on conflict (kitchen_id, feature_key) do update set enabled = true;
-- A known starting point: Copilot answers with Sonnet; no voice model yet.
update dk_features set model_key = 'claude-sonnet-5-5', voice_model_key = null where key = 'copilot';
update dk_ai_models set active = true where key in ('claude-sonnet-5-5', 'claude-haiku-4-5-20251001');

-- 1. Who sets the voice model
select pg_temp.act_as('00000000-0000-0000-0000-000000041a01', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Voice model', 'An account admin cannot set it', 'blocked', pg_temp.blocked('select dk_platform_set_voice_model(''copilot'', ''claude-haiku-4-5-20251001'')'));
reset role;
select pg_temp.act_as(pg_temp.k('ivan'), pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Voice model', 'Unknown model is refused', 'blocked', pg_temp.blocked('select dk_platform_set_voice_model(''copilot'', ''no-existe'')')),
  ('Voice model', 'Only Copilot has a voice channel', 'blocked', pg_temp.blocked('select dk_platform_set_voice_model(''kitchen_insights'', ''claude-haiku-4-5-20251001'')')),
  ('Voice model', 'The platform sets it', 'ALLOWED', pg_temp.blocked('select dk_platform_set_voice_model(''copilot'', ''claude-haiku-4-5-20251001'')'));
insert into _r values ('overview', dk_platform_ai_overview());
insert into _t (area, test, expected, got) values
  ('Voice model', 'A model used only for voice cannot be switched off', 'blocked',
    pg_temp.blocked('select dk_platform_set_model(''claude-haiku-4-5-20251001'', ''Claude Haiku 4.5'', null, null, false)'));
reset role;
insert into _t (area, test, expected, got) values
  ('Voice model', 'The overview shows it', 'claude-haiku-4-5-20251001',
    (select f ->> 'voiceModelKey' from jsonb_array_elements(pg_temp.r('overview') -> 'features') f where f ->> 'key' = 'copilot')),
  ('Voice model', 'The model is «used by» Copilot', 'true',
    (select (m -> 'usedBy') ? 'copilot' from jsonb_array_elements(pg_temp.r('overview') -> 'models') m where m ->> 'key' = 'claude-haiku-4-5-20251001')::text);

-- 2. Which model answers
select pg_temp.act_as('00000000-0000-0000-0000-000000041a01', pg_temp.k('A'));
set local role authenticated;
insert into _r values ('voice', dk_ai_run_reserve('copilot', '{"question": "¿cuánto vendimos?", "channel": "voice"}'));
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000041a02', pg_temp.k('A'));
set local role authenticated;
insert into _r values ('text', dk_ai_run_reserve('copilot', '{"question": "¿cuánto vendimos?", "channel": "text"}'));
reset role;
insert into _t (area, test, expected, got) values
  ('Model', 'A voice question uses the voice model (also on its run)', 'claude-haiku-4-5-20251001 · claude-haiku-4-5-20251001',
    (pg_temp.r('voice') ->> 'model') || ' · ' || (select model from dk_ai_insights where id = (pg_temp.r('voice') ->> 'runId')::uuid)),
  ('Model', 'A typed question keeps Copilot''s model', 'claude-sonnet-5-5', pg_temp.r('text') ->> 'model');

-- The voice model switched off behind the platform's back: back to Copilot's model, never without one.
select pg_temp.as_owner();
delete from dk_ai_insights where kitchen_id = pg_temp.k('A');
update dk_ai_models set active = false where key = 'claude-haiku-4-5-20251001';
select pg_temp.act_as('00000000-0000-0000-0000-000000041a01', pg_temp.k('A'));
set local role authenticated;
insert into _r values ('voice-inactive', dk_ai_run_reserve('copilot', '{"question": "¿y ayer?", "channel": "voice"}'));
reset role;
select pg_temp.as_owner();
update dk_ai_models set active = true where key = 'claude-haiku-4-5-20251001';
delete from dk_ai_insights where kitchen_id = pg_temp.k('A');
select pg_temp.act_as(pg_temp.k('ivan'), pg_temp.k('A'));
set local role authenticated;
select dk_platform_set_voice_model('copilot', null);
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-000000041a01', pg_temp.k('A'));
set local role authenticated;
insert into _r values ('voice-empty', dk_ai_run_reserve('copilot', '{"question": "¿y hoy?", "channel": "voice"}'));
reset role;
insert into _t (area, test, expected, got) values
  ('Model', 'An inactive voice model falls back to Copilot''s', 'claude-sonnet-5-5', pg_temp.r('voice-inactive') ->> 'model'),
  ('Model', 'Cleared: a voice question uses Copilot''s model', 'claude-sonnet-5-5 · null',
    (pg_temp.r('voice-empty') ->> 'model') || ' · ' || coalesce((select voice_model_key from dk_features where key = 'copilot'), 'null'));
insert into _ctx values ('run', (pg_temp.r('voice-empty') ->> 'runId')::uuid);

-- 3. The app's timings on the person's own run
select pg_temp.act_as('00000000-0000-0000-0000-000000041a01', pg_temp.k('A'));
set local role authenticated;
select dk_ai_run_client_timings(pg_temp.k('run'), '{"requestMs": 1834.6, "speechMs": 240, "totalMs": 2600, "streamed": true, "evil": "x", "endpointMs": -5, "listenMs": 999999, "wake": "yes"}');
reset role;
insert into _t (area, test, expected, got) values
  ('Timings', 'Only known keys, whole ms in range, true/false', '{"client": {"totalMs": 2600, "speechMs": 240, "streamed": true, "requestMs": 1835}}',
    pg_temp.run_timings(pg_temp.k('run'))::text);

-- Closing the run afterwards keeps what the app reported and adds the rest.
select pg_temp.act_as('00000000-0000-0000-0000-000000041a01', pg_temp.k('A'));
set local role authenticated;
select dk_ai_run_finish(pg_temp.k('run'), 'ok', p_timings => '{"rounds": [900, 700], "total": 1700, "client": {"listenMs": 320, "endpointMs": 510, "wake": true}}');
reset role;
insert into _t (area, test, expected, got) values
  ('Timings', 'Closing merges server and both halves of the app''s timings', '1700 · 1835 · 320 · 510 · true · true',
    concat_ws(' · ', pg_temp.run_timings(pg_temp.k('run')) ->> 'total', pg_temp.run_timings(pg_temp.k('run')) -> 'client' ->> 'requestMs',
      pg_temp.run_timings(pg_temp.k('run')) -> 'client' ->> 'listenMs', pg_temp.run_timings(pg_temp.k('run')) -> 'client' ->> 'endpointMs',
      pg_temp.run_timings(pg_temp.k('run')) -> 'client' ->> 'wake', pg_temp.run_timings(pg_temp.k('run')) -> 'client' ->> 'streamed'));

-- Someone else's run, an old run, nonsense.
select pg_temp.act_as('00000000-0000-0000-0000-000000041a02', pg_temp.k('A'));
set local role authenticated;
select dk_ai_run_client_timings(pg_temp.k('run'), '{"totalMs": 1}');
insert into _t (area, test, expected, got) values
  ('Timings', 'Not an object is refused', 'blocked', pg_temp.blocked(format('select dk_ai_run_client_timings(%L, %L)', pg_temp.k('run'), '[1, 2]')));
reset role;
insert into _t (area, test, expected, got) values
  ('Timings', 'Another person cannot write on my run', '2600', pg_temp.run_timings(pg_temp.k('run')) -> 'client' ->> 'totalMs');
select pg_temp.as_owner();
update dk_ai_insights set created_at = now() - interval '1 hour' where id = pg_temp.k('run');
select pg_temp.act_as('00000000-0000-0000-0000-000000041a01', pg_temp.k('A'));
set local role authenticated;
select dk_ai_run_client_timings(pg_temp.k('run'), '{"totalMs": 1}');
reset role;
insert into _t (area, test, expected, got) values
  ('Timings', 'An old run is left alone', '2600', pg_temp.run_timings(pg_temp.k('run')) -> 'client' ->> 'totalMs'),
  ('Security', 'Anonymous cannot report timings', 'false', has_function_privilege('anon', 'dk_ai_run_client_timings(uuid, jsonb)', 'execute')::text),
  ('Security', 'Only the platform sets the voice model (anon)', 'false', has_function_privilege('anon', 'dk_platform_set_voice_model(text, text)', 'execute')::text);

-- A cancelled run keeps its timings (cancel sends none).
select pg_temp.as_owner();
delete from dk_ai_insights where kitchen_id = pg_temp.k('A');
select pg_temp.act_as('00000000-0000-0000-0000-000000041a02', pg_temp.k('A'));
set local role authenticated;
insert into _r values ('cancel', dk_ai_run_reserve('copilot', '{"question": "¿quién debe?", "channel": "voice"}'));
select dk_ai_run_client_timings((pg_temp.r('cancel') ->> 'runId')::uuid, '{"listenMs": 300}');
select dk_ai_run_finish((pg_temp.r('cancel') ->> 'runId')::uuid, 'cancelled');
reset role;
insert into _t (area, test, expected, got) values
  ('Timings', 'Cancelling keeps what was measured', 'cancelled · 300',
    (select status || ' · ' || (timings -> 'client' ->> 'listenMs') from dk_ai_insights where id = (pg_temp.r('cancel') ->> 'runId')::uuid));

select area, test, expected, got, case when expected is not distinct from got then 'PASS' else 'FAIL' end as result, detail from _t order by n;
rollback;
