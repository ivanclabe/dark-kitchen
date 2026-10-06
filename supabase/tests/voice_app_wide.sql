-- ADR 0033, phase 1: «Oye Quanela» for the whole app — voice.use for every role
-- (and for custom roles that had kitchen.view), hands-free and speaking under
-- voice.use, kitchen commands still under kitchen.view. Rolled-back transaction.
--
--   python3 supabase/tests/run.py voice_app_wide

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid) on commit drop;
grant all on _t, _ctx to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', json_build_object('x-dk-kitchen-id', p_kitchen)::text, true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;

insert into _ctx values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000033b01', 'inventario.voz@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000033b02', 'cocina.voz@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-000000033b01', '00000000-0000-0000-0000-000000033b01', 'Inventario Voz', true),
  ('10000000-0000-0000-0000-000000033b02', '00000000-0000-0000-0000-000000033b02', 'Cocina Voz', true);
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
select pg_temp.k('A'), m.user_id, (select id from dk_roles where is_system and key = m.role_key)
from (values ('10000000-0000-0000-0000-000000033b01'::uuid, 'INVENTORY'), ('10000000-0000-0000-0000-000000033b02'::uuid, 'KITCHEN')) m(user_id, role_key);

insert into _t (area, test, expected, got) values
  ('Catalog', 'voice.use exists, for the account', 'account · Usar Oye Quanela', (select scope || ' · ' || label from dk_permissions where key = 'voice.use')),
  ('Catalog', 'Every system role has voice.use', 'true',
    ((select count(*) from dk_roles where is_system) = (select count(*) from dk_role_permissions rp join dk_roles r on r.id = rp.role_id where r.is_system and rp.permission_key = 'voice.use'))::text),
  ('Catalog', 'No custom role with kitchen.view lost the voice', '0',
    (select count(*)::text from dk_role_permissions rp join dk_roles r on r.id = rp.role_id
     where not r.is_system and rp.permission_key = 'kitchen.view'
       and not exists (select 1 from dk_role_permissions v where v.role_id = r.id and v.permission_key = 'voice.use'))),
  ('Catalog', 'Hands-free and speaking need voice.use; commands still kitchen.view', 'voice.use · voice.use · kitchen.view',
    (select string_agg(use_permission, ' · ' order by array_position(array['voice_wake_word', 'voice_speech', 'voice_commands'], key)) from dk_features
     where key in ('voice_wake_word', 'voice_speech', 'voice_commands'))),
  ('Catalog', 'Hands-free no longer depends on the kitchen commands', '{}', (select depends_on::text from dk_features where key = 'voice_wake_word'));

-- Inventario (no kitchen.view) can now use the voice, but not the kitchen commands.
select pg_temp.act_as('00000000-0000-0000-0000-000000033b01', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Roles', 'Inventario: voice.use yes, kitchen.view no', 'true · false', dk_can('voice.use')::text || ' · ' || dk_can('kitchen.view')::text),
  ('Roles', 'Inventario: kitchen commands not usable', 'false', dk_can_use_feature('voice_commands')::text);
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-000000033b02', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Roles', 'Cocina keeps everything it had', 'true · true', dk_can('voice.use')::text || ' · ' || dk_can('kitchen.view')::text);
reset role;

select area, test, expected, got, case when expected is not distinct from got then 'PASS' else 'FAIL' end as result, detail from _t order by n;
rollback;
