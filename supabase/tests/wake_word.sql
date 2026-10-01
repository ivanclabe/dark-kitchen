-- ADR 0016: "Oye Quanela" wake word as a feature (catalog, plans, layers, validation). Rolled-back transaction.
--
--   python3 supabase/tests/run.py wake_word

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid) on commit drop;
grant all on _t, _ctx to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  select set_config('request.headers', case when p_kitchen is null then '{}' else jsonb_build_object('x-dk-kitchen-id', p_kitchen)::text end, true);
$$;
create or replace function pg_temp.role_id(p_key text) returns uuid language sql as $$ select id from dk_roles where is_system and key = p_key $$;
create or replace function pg_temp.feat(p_key text, p_field text) returns text language sql as $$
  select f ->> p_field from jsonb_array_elements(dk_my_features()) f where f ->> 'key' = p_key
$$;
grant execute on function pg_temp.feat(text, text) to authenticated;

insert into _ctx values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx values ('orgA', (select organization_id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx values ('ivan', (select id from auth.users where email = 'ivanclabe@gmail.com'));

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000d0b2', 'cocina.wake@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-00000000d0b2', '00000000-0000-0000-0000-00000000d0b2', 'Kitchen of A (wake word)', true);
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id) values
  ((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-00000000d0b2', pg_temp.role_id('KITCHEN'));
delete from dk_kitchen_features where kitchen_id = (select id from _ctx where key = 'A') and feature_key in ('voice_wake_word', 'voice_commands');
delete from dk_organization_features where organization_id = (select id from _ctx where key = 'orgA') and feature_key in ('voice_wake_word', 'voice_commands');

-- 1. Catalog and plans
insert into _t (area, test, expected, got) values ('Catalog', 'Voice feature that depends on voice commands', 'voice · {voice_commands} · false',
  (select concat_ws(' · ', category, depends_on::text, uses_model::text) from dk_features where key = 'voice_wake_word'));
insert into _t (area, test, expected, got) values ('Catalog', 'Platform defaults are valid', 'true',
  (select (dk_feature_settings_error(key, default_settings) is null)::text from dk_features where key = 'voice_wake_word'));
insert into _t (area, test, expected, got) values ('Plans', 'Same plans as voice commands', 'business · enterprise · standard',
  (select string_agg(plan_key, ' · ' order by plan_key) from dk_plan_features where feature_key = 'voice_wake_word'));
insert into _t (area, test, expected, got) values ('Plans', 'No plan has it without voice commands', '0',
  (select count(*)::text from dk_plan_features w where w.feature_key = 'voice_wake_word'
     and not exists (select 1 from dk_plan_features c where c.plan_key = w.plan_key and c.feature_key = 'voice_commands')));

-- 2. The kitchen team uses it (the device switch is still off) but cannot tune it
select pg_temp.act_as('00000000-0000-0000-0000-00000000d0b2', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Permissions', 'Kitchen team: usable, not configurable', 'true · false',
    pg_temp.feat('voice_wake_word', 'usable') || ' · ' || pg_temp.feat('voice_wake_word', 'canConfigure'));
  insert into _t (area, test, expected, got) values ('Defaults', 'Account gets the platform tuning', 'true',
    ((pg_temp.feat('voice_wake_word', 'settings')::jsonb) = (select default_settings from dk_features where key = 'voice_wake_word'))::text);
  begin perform dk_set_kitchen_feature_settings((select id from _ctx where key = 'A'), 'voice_wake_word', '{"threshold": 0.9}');
    insert into _t (area, test, expected, got) values ('Permissions', 'Kitchen team changes the threshold', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Permissions', 'Kitchen team changes the threshold', 'blocked', 'blocked', sqlerrm); end;
end $$;
reset role;

-- 3. Platform tuning is validated
select pg_temp.act_as((select id from _ctx where key = 'ivan'), (select id from _ctx where key = 'A'));
set local role authenticated;
do $$
declare v_case jsonb;
begin
  foreach v_case in array array['{"threshold": 1.5}', '{"threshold": 0}', '{"confirm_frames": 0}', '{"confirm_frames": 9}']::jsonb[] loop
    begin perform dk_platform_set_feature('voice_wake_word', p_default_settings => v_case);
      insert into _t (area, test, expected, got) values ('Validation', 'Invalid tuning ' || v_case::text, 'blocked', 'ALLOWED');
    exception when others then insert into _t (area, test, expected, got, detail) values ('Validation', 'Invalid tuning ' || v_case::text, 'blocked', 'blocked', sqlerrm); end;
  end loop;
  perform dk_platform_set_feature('voice_wake_word', p_default_settings => '{"threshold": "high"}');
  insert into _t (area, test, expected, got) values ('Validation', 'Wrong type is dropped, default kept', 'true',
    ((select default_settings from dk_features where key = 'voice_wake_word') ->> 'threshold' ~ '^[0-9.]+$')::text);
  perform dk_platform_set_feature('voice_wake_word', p_default_settings => '{"threshold": 0.7, "confirm_frames": 2}');
  insert into _t (area, test, expected, got) values ('Validation', 'Valid tuning reaches the account', '0.7 · 2',
    (pg_temp.feat('voice_wake_word', 'settings')::jsonb ->> 'threshold') || ' · ' || (pg_temp.feat('voice_wake_word', 'settings')::jsonb ->> 'confirm_frames'));
  insert into _t (area, test, expected, got) values ('Platform', 'Overview shows the dependency', '["voice_commands"]',
    (select f -> 'dependsOn' from jsonb_array_elements(dk_platform_ai_overview() -> 'features') f where f ->> 'key' = 'voice_wake_word')::text);

  -- 4. Organization switches it off for one account; then offers it to nobody
  perform dk_set_kitchen_feature((select id from _ctx where key = 'A'), 'voice_wake_word', false);
  insert into _t (area, test, expected, got) values ('Layers', 'Off for the account', 'false · account',
    pg_temp.feat('voice_wake_word', 'usable') || ' · ' || (dk_feature_state('voice_wake_word') ->> 'reason'));
  perform dk_set_kitchen_feature((select id from _ctx where key = 'A'), 'voice_wake_word', true);
  perform dk_set_org_feature((select id from _ctx where key = 'orgA'), 'voice_wake_word', false);
  insert into _t (area, test, expected, got) values ('Layers', 'Not offered by the organization', 'false · organization',
    pg_temp.feat('voice_wake_word', 'usable') || ' · ' || (dk_feature_state('voice_wake_word') ->> 'reason'));
  perform dk_set_org_feature((select id from _ctx where key = 'orgA'), 'voice_wake_word', true);

  -- 5. Platform switch
  perform dk_platform_set_feature('voice_wake_word', false);
  insert into _t (area, test, expected, got) values ('Global switch', 'Off for everybody', 'false · platform',
    pg_temp.feat('voice_wake_word', 'usable') || ' · ' || (dk_feature_state('voice_wake_word') ->> 'reason'));
  perform dk_platform_set_feature('voice_wake_word', true);
  insert into _t (area, test, expected, got) values ('Global switch', 'Back on', 'true', pg_temp.feat('voice_wake_word', 'usable'));
end $$;
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
