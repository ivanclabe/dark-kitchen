-- ADR 0014: platform control of AI features. Rolled-back transaction.
--
--   python3 supabase/tests/run.py ai_platform

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid) on commit drop;
grant all on _t, _ctx to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', case when p_kitchen is null then '{}' else jsonb_build_object('x-dk-kitchen-id', p_kitchen)::text end, true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.role_id(p_key text) returns uuid language sql as $$ select id from dk_roles where is_system and key = p_key $$;
create or replace function pg_temp.feat(p_key text, p_field text) returns text language sql as $$
  select f ->> p_field from jsonb_array_elements(dk_my_features()) f where f ->> 'key' = p_key
$$;
grant execute on function pg_temp.feat(text, text) to authenticated;

insert into _ctx values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx values ('orgA', (select organization_id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx values ('ivan', (select id from auth.users where email = 'ivanclabe@gmail.com')); -- platform admin + owner of A

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000a1a0', 'ana.aiplatform@grupob.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a1b1', 'admin.aiplatform@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-00000000a1a0', '00000000-0000-0000-0000-00000000a1a0', 'Ana (owner of B)', true),
  ('10000000-0000-0000-0000-00000000a1b1', '00000000-0000-0000-0000-00000000a1b1', 'Admin of A', true);
insert into dk_organizations (slug, name, owner_user_id, sector, category)
values ('grupo-b-aiplatform', 'Grupo B', '10000000-0000-0000-0000-00000000a1a0', 'fast_food', 'burgers');
insert into _ctx values ('orgB', (select id from dk_organizations where slug = 'grupo-b-aiplatform'));
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id) values
  ((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-00000000a1b1', pg_temp.role_id('ADMIN'));
-- Known starting point for account A.
delete from dk_kitchen_features where kitchen_id = (select id from _ctx where key = 'A') and feature_key in ('supply_reorder', 'kitchen_insights');
delete from dk_organization_features where organization_id = (select id from _ctx where key = 'orgA');
delete from dk_ai_insights where kitchen_id = (select id from _ctx where key = 'A');

-- 1. Only the platform reads the AI admin view and the model catalog
select pg_temp.act_as((select id from _ctx where key = 'ivan'), (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Overview', 'Platform sees all features', '7', jsonb_array_length(dk_platform_ai_overview() -> 'features')::text);
  insert into _t (area, test, expected, got) values ('Overview', 'Models come from the catalog (H3)', 'claude-sonnet-5-5 · claude-haiku-4-5-20251001',
    (select string_agg(f ->> 'modelKey', ' · ' order by f ->> 'key' desc) from jsonb_array_elements(dk_platform_ai_overview() -> 'features') f
     where f ->> 'key' in ('supply_reorder', 'kitchen_insights')));
  insert into _t (area, test, expected, got) values ('Overview', 'Platform reads the model catalog', 'true', ((select count(*) from dk_ai_models) >= 3)::text);
  insert into _t (area, test, expected, got) values ('Overview', 'Healthy features have no issues', '0',
    (select count(*)::text from jsonb_array_elements(dk_platform_ai_overview() -> 'features') f where jsonb_array_length(f -> 'issues') > 0));
  -- Organization activates both features for account A (support path of the platform admin, who also owns A).
  perform dk_set_kitchen_feature((select id from _ctx where key = 'A'), 'kitchen_insights', true);
  perform dk_set_kitchen_feature((select id from _ctx where key = 'A'), 'supply_reorder', true);
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a1a0', null);
set local role authenticated;
do $$ begin
  begin perform dk_platform_ai_overview();
    insert into _t (area, test, expected, got) values ('Security', 'An organization owner reads the platform view', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Security', 'An organization owner reads the platform view', 'blocked', 'blocked', sqlerrm); end;
  begin perform dk_platform_set_feature('kitchen_insights', false);
    insert into _t (area, test, expected, got) values ('Security', 'An organization owner switches a feature off globally', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Security', 'An organization owner switches a feature off globally', 'blocked', 'blocked', sqlerrm); end;
  begin perform dk_platform_set_model('claude-haiku-4-5-20251001', 'Haiku', 0, 0, true);
    insert into _t (area, test, expected, got) values ('Security', 'An organization owner edits models or prices', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Security', 'An organization owner edits models or prices', 'blocked', 'blocked', sqlerrm); end;
  begin perform dk_platform_set_plan_ai_limits('business', 999999);
    insert into _t (area, test, expected, got) values ('Security', 'An organization owner changes plan limits', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Security', 'An organization owner changes plan limits', 'blocked', 'blocked', sqlerrm); end;
  begin perform dk_platform_ai_usage();
    insert into _t (area, test, expected, got) values ('Security', 'An organization owner reads platform usage', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Security', 'An organization owner reads platform usage', 'blocked', 'blocked', sqlerrm); end;
  begin perform dk_org_ai_usage((select id from _ctx where key = 'orgA'));
    insert into _t (area, test, expected, got) values ('Security', 'Another organization reads usage of A', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Security', 'Another organization reads usage of A', 'blocked', 'blocked', sqlerrm); end;
  insert into _t (area, test, expected, got) values ('Security', 'Models are not readable by organizations', '0', (select count(*)::text from dk_ai_models));
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a1b1', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Activation', 'Account usable after organization activation', 'true', pg_temp.feat('kitchen_insights', 'usable'));
  begin perform dk_org_ai_usage((select id from _ctx where key = 'orgA'));
    insert into _t (area, test, expected, got) values ('Security', 'Account ADMIN reads organization usage', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Security', 'Account ADMIN reads organization usage', 'blocked', 'blocked', sqlerrm); end;
end $$;
reset role;

-- 2. Global switch: off at platform level = nobody uses it, settings kept
select pg_temp.act_as((select id from _ctx where key = 'ivan'), (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin perform dk_platform_set_feature('kitchen_insights', false); end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a1b1', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Global switch', 'Off globally: not usable, reason platform', 'false · platform · false',
    pg_temp.feat('kitchen_insights', 'usable') || ' · ' || (dk_feature_state('kitchen_insights') ->> 'reason') || ' · ' || pg_temp.feat('kitchen_insights', 'platformActive'));
  insert into _t (area, test, expected, got) values ('Global switch', 'The account keeps its activation', 'true', pg_temp.feat('kitchen_insights', 'enabled'));
  insert into _t (area, test, expected, got) values ('Global switch', 'No model runs allowed', 'false', dk_ai_run_allowed('kitchen_insights') ->> 'allowed');
end $$;
reset role;

select pg_temp.act_as((select id from _ctx where key = 'ivan'), (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  begin perform dk_set_kitchen_feature((select id from _ctx where key = 'A'), 'kitchen_insights', true);
    insert into _t (area, test, expected, got) values ('Global switch', 'Organization changes a globally-off feature', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Global switch', 'Organization changes a globally-off feature', 'blocked', 'blocked', sqlerrm); end;
  perform dk_platform_set_feature('kitchen_insights', true);
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a1b1', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Global switch', 'Back on: the account uses it again', 'true', pg_temp.feat('kitchen_insights', 'usable'));
  insert into _t (area, test, expected, got) values ('Model', 'The quota returns the catalog model', 'claude-haiku-4-5-20251001', dk_ai_run_allowed('kitchen_insights') ->> 'model');
end $$;
reset role;

-- 3. Models, interval, defaults, plan limits
select pg_temp.act_as((select id from _ctx where key = 'ivan'), (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  begin perform dk_platform_set_feature('supply_reorder', p_model_key => 'no-such-model');
    insert into _t (area, test, expected, got) values ('Model', 'Unknown model', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Model', 'Unknown model', 'blocked', 'blocked', sqlerrm); end;
  begin perform dk_platform_set_feature('voice_speech', p_model_key => 'claude-opus-5-5');
    insert into _t (area, test, expected, got) values ('Model', 'Model on a feature without AI', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Model', 'Model on a feature without AI', 'blocked', 'blocked', sqlerrm); end;
  perform dk_platform_set_feature('supply_reorder', p_model_key => 'claude-opus-5-5');
  insert into _t (area, test, expected, got) values ('Model', 'Change the model of a feature', 'claude-opus-5-5', (select model_key from dk_features where key = 'supply_reorder'));
  begin perform dk_platform_set_model('claude-opus-5-5', 'Claude Opus 5.5', null, null, false);
    insert into _t (area, test, expected, got) values ('Model', 'Deactivate a model in use', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Model', 'Deactivate a model in use', 'blocked', 'blocked', sqlerrm); end;

  begin perform dk_platform_set_feature('kitchen_insights', p_min_interval_seconds => 10);
    insert into _t (area, test, expected, got) values ('Policies', 'Interval under 30 s', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Policies', 'Interval under 30 s', 'blocked', 'blocked', sqlerrm); end;
  perform dk_platform_set_feature('kitchen_insights', p_min_interval_seconds => 600);

  begin perform dk_platform_set_feature('supply_reorder', p_default_settings => '{"coverage_days": 500}');
    insert into _t (area, test, expected, got) values ('Defaults', 'Default out of range', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Defaults', 'Default out of range', 'blocked', 'blocked', sqlerrm); end;
  perform dk_platform_set_feature('supply_reorder', p_default_settings => '{"coverage_days": 9, "unknown": 1}');
  insert into _t (area, test, expected, got) values ('Defaults', 'Defaults merge known keys only', '9 · 360 · false',
    (select (default_settings ->> 'coverage_days') || ' · ' || (default_settings ->> 'frequency_min') || ' · ' || (default_settings ? 'unknown')::text
     from dk_features where key = 'supply_reorder'));

  begin perform dk_platform_set_plan_ai_limits('business', -1);
    insert into _t (area, test, expected, got) values ('Policies', 'Negative daily runs', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Policies', 'Negative daily runs', 'blocked', 'blocked', sqlerrm); end;
  perform dk_platform_set_plan_ai_limits('business', 7);
  insert into _t (area, test, expected, got) values ('Policies', 'Plan daily runs updated', '7', (select limits ->> 'ai_runs_per_day' from dk_plans where key = 'business'));
end $$;
reset role;

-- Interval per feature applies to the account's quota.
select pg_temp.as_owner();
insert into dk_ai_insights (kitchen_id, feature_key, status, input, output, model, created_at)
values ((select id from _ctx where key = 'A'), 'kitchen_insights', 'ok', '{}', '{}', 'claude-haiku-4-5-20251001', now() - interval '200 seconds');
select pg_temp.act_as('00000000-0000-0000-0000-00000000a1b1', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Policies', 'Per-feature interval (600 s) applies', 'false · interval',
    (dk_ai_run_allowed('kitchen_insights') ->> 'allowed') || ' · ' || (dk_ai_run_allowed('kitchen_insights') ->> 'reason'));
  insert into _t (area, test, expected, got) values ('Defaults', 'Accounts inherit the platform default', '9', pg_temp.feat('supply_reorder', 'settings')::jsonb ->> 'coverage_days');
end $$;
reset role;

-- 4. Organization settings and account override
select pg_temp.act_as('00000000-0000-0000-0000-00000000a1b1', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin perform dk_set_kitchen_feature_settings((select id from _ctx where key = 'A'), 'supply_reorder', '{"coverage_days": 20}'); end $$;
reset role;

select pg_temp.act_as((select id from _ctx where key = 'ivan'), (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin perform dk_set_org_feature_settings((select id from _ctx where key = 'orgA'), 'supply_reorder', '{"coverage_days": 15, "allow_account_override": false}'); end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a1b1', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Layers', 'Override off: organization value wins', '15 · false',
    (pg_temp.feat('supply_reorder', 'settings')::jsonb ->> 'coverage_days') || ' · ' || pg_temp.feat('supply_reorder', 'canConfigure'));
  begin perform dk_set_kitchen_feature_settings((select id from _ctx where key = 'A'), 'supply_reorder', '{"coverage_days": 21}');
    insert into _t (area, test, expected, got) values ('Layers', 'Account customizes when not allowed', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Layers', 'Account customizes when not allowed', 'blocked', 'blocked', sqlerrm); end;
end $$;
reset role;

select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Layers', 'The account value is kept while not allowed', '20',
  (select settings ->> 'coverage_days' from dk_kitchen_features where kitchen_id = (select id from _ctx where key = 'A') and feature_key = 'supply_reorder'));

select pg_temp.act_as((select id from _ctx where key = 'ivan'), (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  begin perform dk_set_org_feature_settings((select id from _ctx where key = 'orgA'), 'supply_reorder', '{"allow_account_override": "yes"}');
    insert into _t (area, test, expected, got) values ('Layers', 'Override flag must be boolean', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Layers', 'Override flag must be boolean', 'blocked', 'blocked', sqlerrm); end;
  perform dk_set_org_feature_settings((select id from _ctx where key = 'orgA'), 'supply_reorder', '{"coverage_days": 15, "allow_account_override": true}');
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a1b1', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Layers', 'Override on: account value wins, inherited kept', '20 · 15',
    (pg_temp.feat('supply_reorder', 'settings')::jsonb ->> 'coverage_days') || ' · ' || (pg_temp.feat('supply_reorder', 'inheritedSettings')::jsonb ->> 'coverage_days'));
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000a1a0', null);
set local role authenticated;
do $$ begin
  begin perform dk_set_org_feature_settings((select id from _ctx where key = 'orgA'), 'supply_reorder', '{"coverage_days": 30}');
    insert into _t (area, test, expected, got) values ('Security', 'Another organization changes defaults of A', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Security', 'Another organization changes defaults of A', 'blocked', 'blocked', sqlerrm); end;
  begin perform dk_set_kitchen_feature_settings((select id from _ctx where key = 'A'), 'supply_reorder', '{"coverage_days": 30}');
    insert into _t (area, test, expected, got) values ('Security', 'Another organization changes settings of account A', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Security', 'Another organization changes settings of account A', 'blocked', 'blocked', sqlerrm); end;
end $$;
reset role;

-- 5. Usage: tokens and estimated cost only with prices
select pg_temp.as_owner();
insert into dk_ai_insights (kitchen_id, feature_key, status, input, output, model, input_tokens, output_tokens, latency_ms) values
  ((select id from _ctx where key = 'A'), 'kitchen_insights', 'ok', '{}', '{}', 'claude-haiku-4-5-20251001', 1000, 500, 900),
  ((select id from _ctx where key = 'A'), 'kitchen_insights', 'ok', '{}', '{}', 'claude-haiku-4-5-20251001', 1000, 500, 1100);
insert into dk_ai_insights (kitchen_id, feature_key, status, input, model, error)
values ((select id from _ctx where key = 'A'), 'kitchen_insights', 'error', '{}', 'claude-haiku-4-5-20251001', 'timeout');

select pg_temp.act_as((select id from _ctx where key = 'ivan'), (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Usage', 'Without prices there is no cost', 'null',
    coalesce(dk_platform_ai_usage() -> 'totals' ->> 'estimatedCost', 'null'));
  perform dk_platform_set_model('claude-haiku-4-5-20251001', 'Claude Haiku 4.5', 1, 5, true);
  insert into _t (area, test, expected, got) values ('Usage', 'Estimated cost = tokens × price', '0.00700',
    round((dk_platform_ai_usage() -> 'totals' ->> 'estimatedCost')::numeric, 5)::text);
  insert into _t (area, test, expected, got) values ('Usage', 'Metered runs and latency', '2 · 1000',
    (dk_platform_ai_usage() -> 'totals' ->> 'meteredRuns') || ' · ' || (dk_platform_ai_usage() -> 'totals' ->> 'avgLatencyMs'));
  insert into _t (area, test, expected, got) values ('Usage', 'Organization usage counts runs and errors of A', 'true',
    ((dk_org_ai_usage((select id from _ctx where key = 'orgA')) -> 'totals' ->> 'runs')::int >= 4
     and (dk_org_ai_usage((select id from _ctx where key = 'orgA')) -> 'totals' ->> 'errors')::int >= 1)::text);
end $$;
reset role;

-- 5b. Internal helpers are not callable from the API
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Security', 'Helpers not executable by API roles', '0',
  (select count(*)::text from pg_proc p, unnest(array['anon', 'authenticated']) r
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('dk_feature_override_allowed', 'dk_feature_inherited_settings', 'dk_feature_effective_settings', 'dk_feature_clean_settings',
                       'dk_feature_config_issues', 'dk_require_platform_admin', 'dk_audit_classify_ai')
     and has_function_privilege(r, p.oid, 'execute')));

-- 6. Audit
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Audit', 'Global switch, model and limits are logged', 'true · true · true',
  (select string_agg(exists (select 1 from dk_audit_log where event_type = e and created_at >= now())::text, ' · ' order by ord)
   from unnest(array['feature.platform_changed', 'ai.model_changed', 'plan.limits_changed']) with ordinality as t(e, ord)));
insert into _t (area, test, expected, got) values ('Audit', 'Readable summaries', 'true · true',
  (select exists (select 1 from dk_audit_log where created_at >= now() and summary = 'Apagó Sugerencias de Cocina en vivo en toda la plataforma')::text
       || ' · ' || exists (select 1 from dk_audit_log where created_at >= now() and summary like 'Cambió el modelo de Sugerencias de compra: claude-sonnet-5-5 → claude-opus-5-5')::text));

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
