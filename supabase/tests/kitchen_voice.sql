-- ADR 0014: kitchen voice (catalog, layered settings, permissions, audit). Rolled-back transaction.
--
--   python3 supabase/tests/run.py kitchen_voice

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid) on commit drop;
grant all on _t, _ctx to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  select set_config('request.headers', case when p_kitchen is null then '{}' else jsonb_build_object('x-dk-kitchen-id', p_kitchen)::text end, true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.role_id(p_key text) returns uuid language sql as $$ select id from dk_roles where is_system and key = p_key $$;
create or replace function pg_temp.voice(p_field text) returns text language sql as $$
  select f -> 'settings' ->> p_field from jsonb_array_elements(dk_my_features()) f where f ->> 'key' = 'voice_speech'
$$;
create or replace function pg_temp.feat(p_key text, p_field text) returns text language sql as $$
  select f ->> p_field from jsonb_array_elements(dk_my_features()) f where f ->> 'key' = p_key
$$;
grant execute on function pg_temp.voice(text), pg_temp.feat(text, text) to authenticated;

insert into _ctx values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx values ('orgA', (select organization_id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx values ('ivan', (select id from auth.users where email = 'ivanclabe@gmail.com'));

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000b0a0', 'ana.voice@grupob.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000b0b1', 'admin.voice@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000b0b2', 'cocina.voice@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-00000000b0a0', '00000000-0000-0000-0000-00000000b0a0', 'Ana (owner of B)', true),
  ('10000000-0000-0000-0000-00000000b0b1', '00000000-0000-0000-0000-00000000b0b1', 'Admin of A', true),
  ('10000000-0000-0000-0000-00000000b0b2', '00000000-0000-0000-0000-00000000b0b2', 'Kitchen of A', true);
insert into dk_organizations (slug, name, owner_user_id, sector, category)
values ('grupo-b-voice', 'Grupo B', '10000000-0000-0000-0000-00000000b0a0', 'fast_food', 'burgers');
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id) values
  ((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-00000000b0b1', pg_temp.role_id('ADMIN')),
  ((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-00000000b0b2', pg_temp.role_id('KITCHEN'));
delete from dk_kitchen_features where kitchen_id = (select id from _ctx where key = 'A') and feature_key = 'voice_speech';
delete from dk_organization_features where organization_id = (select id from _ctx where key = 'orgA') and feature_key = 'voice_speech';

-- 0. Data migration: every stored setting is still valid against the new schemas
insert into _t (area, test, expected, got) values ('Migration', 'Existing account settings are valid', '0',
  (select count(*)::text from dk_kitchen_features where dk_feature_settings_error(feature_key, settings) is not null));
insert into _t (area, test, expected, got) values ('Migration', 'Platform voice default (today''s behaviour)', 'karen · natural · 1 · 1 · es-US',
  (select concat_ws(' · ', default_settings ->> 'profile', default_settings ->> 'style', default_settings ->> 'rate', default_settings ->> 'volume', default_settings ->> 'lang')
   from dk_features where key = 'voice_speech'));

insert into _t (area, test, expected, got) values ('Migration', 'No reference to the old voice keys', '0',
  (select (select count(*) from dk_voice_profiles where key in ('mateo', 'laura', 'alex', 'sofia'))
        + (select count(*) from dk_kitchen_features where feature_key = 'voice_speech' and settings ->> 'profile' in ('mateo', 'laura', 'alex', 'sofia'))
        + (select count(*) from dk_organization_features where feature_key = 'voice_speech' and settings ->> 'profile' in ('mateo', 'laura', 'alex', 'sofia')))::text);

-- 1. Catalog and defaults, as the kitchen team
select pg_temp.act_as('00000000-0000-0000-0000-00000000b0b2', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Catalog', 'The team reads the active voices', 'belen · dago · daniel · ivan · karen',
    (select string_agg(key, ' · ' order by key) from dk_voice_profiles));
  insert into _t (area, test, expected, got) values ('Defaults', 'Account without settings uses the platform default', 'karen · 1 · es-US',
    pg_temp.voice('profile') || ' · ' || pg_temp.voice('rate') || ' · ' || pg_temp.voice('lang'));
  insert into _t (area, test, expected, got) values ('Permissions', 'The kitchen team uses the voice but cannot configure it', 'true · false',
    pg_temp.feat('voice_speech', 'usable') || ' · ' || pg_temp.feat('voice_speech', 'canConfigure'));
  begin perform dk_set_kitchen_feature_settings((select id from _ctx where key = 'A'), 'voice_speech', '{"profile": "belen"}');
    insert into _t (area, test, expected, got) values ('Permissions', 'The kitchen team changes the voice', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Permissions', 'The kitchen team changes the voice', 'blocked', 'blocked', sqlerrm); end;
end $$;
reset role;

-- 2. Validation (platform default)
select pg_temp.act_as((select id from _ctx where key = 'ivan'), (select id from _ctx where key = 'A'));
set local role authenticated;
do $$
declare v_case jsonb;
begin
  foreach v_case in array array['{"profile": "nobody"}', '{"style": "loud"}', '{"rate": 3}', '{"volume": 0}', '{"lang": "fr-FR"}']::jsonb[] loop
    begin perform dk_platform_set_feature('voice_speech', p_default_settings => v_case);
      insert into _t (area, test, expected, got) values ('Validation', 'Invalid default ' || v_case::text, 'blocked', 'ALLOWED');
    exception when others then insert into _t (area, test, expected, got, detail) values ('Validation', 'Invalid default ' || v_case::text, 'blocked', 'blocked', sqlerrm); end;
  end loop;

  -- 3. Organization default voice
  perform dk_set_org_feature_settings((select id from _ctx where key = 'orgA'), 'voice_speech', '{"profile": "daniel", "rate": 1.1, "allow_account_override": true}');
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000b0b1', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Layers', 'Organization default reaches the account', 'daniel · 1.1', pg_temp.voice('profile') || ' · ' || pg_temp.voice('rate'));
  -- 4. ADR 0018: the account admin no longer changes the voice
  insert into _t (area, test, expected, got) values ('Override', 'The account admin cannot configure', 'false', pg_temp.feat('voice_speech', 'canConfigure'));
  begin perform dk_set_kitchen_feature_settings((select id from _ctx where key = 'A'), 'voice_speech', '{"profile": "belen", "style": "friendly"}');
    insert into _t (area, test, expected, got) values ('Override', 'The account admin changes the voice', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Override', 'The account admin changes the voice', 'blocked', 'blocked', sqlerrm); end;
end $$;
reset role;

-- 5. The organization sets an exception for the account
select pg_temp.act_as((select id from _ctx where key = 'ivan'), (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  perform dk_set_kitchen_feature_settings((select id from _ctx where key = 'A'), 'voice_speech', '{"profile": "belen", "style": "friendly"}');
  begin perform dk_set_kitchen_feature_settings((select id from _ctx where key = 'A'), 'voice_speech', '{"lang": "en-US"}');
    insert into _t (area, test, expected, got) values ('Validation', 'Language not offered', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Validation', 'Language not offered', 'blocked', 'blocked', sqlerrm); end;
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000b0b1', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Layers', 'Account exception on top of the organization', 'belen · friendly · 1.1',
    pg_temp.voice('profile') || ' · ' || pg_temp.voice('style') || ' · ' || pg_temp.voice('rate'));
  insert into _t (area, test, expected, got) values ('Layers', 'Inherited voice stays visible', 'daniel',
    pg_temp.feat('voice_speech', 'inheritedSettings')::jsonb ->> 'profile');
end $$;
reset role;

select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Override', 'The exception is stored for the account', 'belen',
  (select settings ->> 'profile' from dk_kitchen_features where kitchen_id = (select id from _ctx where key = 'A') and feature_key = 'voice_speech'));

-- 6. Platform switches the voice off: nobody speaks, settings kept
select pg_temp.act_as((select id from _ctx where key = 'ivan'), (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin perform dk_platform_set_feature('voice_speech', false); end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000b0b2', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Global switch', 'Voice off globally for the kitchen team', 'false · platform',
    pg_temp.feat('voice_speech', 'usable') || ' · ' || (dk_feature_state('voice_speech') ->> 'reason'));
end $$;
reset role;

select pg_temp.act_as((select id from _ctx where key = 'ivan'), (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  perform dk_platform_set_feature('voice_speech', true);
  -- 7. Voice catalog management
  perform dk_platform_set_voice_profile('valentina', 'Valentina', 'female', 'calm', 0.95, 'es-MX', '{Dalia,Paulina}', 'Tranquila.', true);
  insert into _t (area, test, expected, got) values ('Catalog', 'Platform adds a voice', 'Valentina · calm · es-MX',
    (select concat_ws(' · ', name, default_style, lang) from dk_voice_profiles where key = 'valentina'));
  begin perform dk_platform_set_voice_profile('karen', 'Laura', 'female', 'natural', 1, 'es-CO', '{}', '', false);
    insert into _t (area, test, expected, got) values ('Catalog', 'Deactivate the platform default voice', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Catalog', 'Deactivate the platform default voice', 'blocked', 'blocked', sqlerrm); end;
  perform dk_platform_set_voice_profile('ivan', 'Mateo', 'male', 'energetic', 1.05, 'es-CO', '{Diego}', '', false);
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-00000000b0b2', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Catalog', 'Inactive voices are hidden from accounts', 'false',
    exists (select 1 from dk_voice_profiles where key = 'ivan')::text);
end $$;
reset role;

-- 8. Isolation
select pg_temp.act_as('00000000-0000-0000-0000-00000000b0a0', null);
set local role authenticated;
do $$ begin
  begin perform dk_platform_set_voice_profile('hack', 'Hack', 'male', 'direct');
    insert into _t (area, test, expected, got) values ('Security', 'An organization owner edits the voice catalog', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Security', 'An organization owner edits the voice catalog', 'blocked', 'blocked', sqlerrm); end;
  begin perform dk_set_org_feature_settings((select id from _ctx where key = 'orgA'), 'voice_speech', '{"profile": "dago"}');
    insert into _t (area, test, expected, got) values ('Security', 'Another organization changes the voice of A', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Security', 'Another organization changes the voice of A', 'blocked', 'blocked', sqlerrm); end;
  begin perform dk_set_kitchen_feature_settings((select id from _ctx where key = 'A'), 'voice_speech', '{"profile": "dago"}');
    insert into _t (area, test, expected, got) values ('Security', 'Another organization changes the voice of account A', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Security', 'Another organization changes the voice of account A', 'blocked', 'blocked', sqlerrm); end;
end $$;
reset role;

-- 9. Audit
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Audit', 'Account voice change with names', 'true',
  exists (select 1 from dk_audit_log where created_at >= now() and event_type = 'voice.settings_changed'
          and summary like 'Cambió la voz de cocina de % → Belen')::text);
insert into _t (area, test, expected, got) values ('Audit', 'Organization voice change', 'true',
  exists (select 1 from dk_audit_log where created_at >= now() and event_type = 'voice.settings_changed' and summary like 'Cambió la voz de cocina de la organización%')::text);
insert into _t (area, test, expected, got) values ('Audit', 'Catalog change', 'true',
  exists (select 1 from dk_audit_log where created_at >= now() and event_type = 'voice.catalog_changed' and summary = 'Agregó la voz Valentina del catálogo')::text);

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
