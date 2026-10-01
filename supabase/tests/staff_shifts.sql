-- ADR 0020: Personal y Turnos — flexible shifts, no overlaps, permissions, clock in/out, copy week. Rolled-back transaction.
--
--   python3 supabase/tests/run.py staff_shifts

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid, txt text) on commit drop;
grant all on _t, _ctx to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', json_build_object('x-dk-kitchen-id', p_kitchen)::text, true);
$$;
create or replace function pg_temp.role_id(p_key text) returns uuid language sql as $$ select id from dk_roles where is_system and key = p_key $$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;

insert into _ctx (key, id) values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx (key, id) values ('A2', (select id from dk_kitchens where slug = 'hamburgesas-del-norte'));
-- A fixed future week (Monday), so nothing real collides.
insert into _ctx (key, txt) values ('monday', '2031-03-03 00:00:00-05');

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000f5a1', 'admin.turnos@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f5a2', 'cocina.turnos@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f5a3', 'caja.turnos@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-00000000f5a1', '00000000-0000-0000-0000-00000000f5a1', 'Admin Turnos', true),
  ('10000000-0000-0000-0000-00000000f5a2', '00000000-0000-0000-0000-00000000f5a2', 'Cocina Turnos', true),
  ('10000000-0000-0000-0000-00000000f5a3', '00000000-0000-0000-0000-00000000f5a3', 'Caja Turnos', true);
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id) values
  (pg_temp.k('A'), '10000000-0000-0000-0000-00000000f5a1', pg_temp.role_id('ADMIN')),
  (pg_temp.k('A'), '10000000-0000-0000-0000-00000000f5a2', pg_temp.role_id('KITCHEN')),
  (pg_temp.k('A2'), '10000000-0000-0000-0000-00000000f5a2', pg_temp.role_id('KITCHEN')),
  (pg_temp.k('A'), '10000000-0000-0000-0000-00000000f5a3', pg_temp.role_id('CASHIER'));
insert into dk_member_roles (kitchen_id, user_id, role_id) values
  (pg_temp.k('A'), '10000000-0000-0000-0000-00000000f5a1', pg_temp.role_id('ADMIN')),
  (pg_temp.k('A'), '10000000-0000-0000-0000-00000000f5a2', pg_temp.role_id('KITCHEN')),
  (pg_temp.k('A2'), '10000000-0000-0000-0000-00000000f5a2', pg_temp.role_id('KITCHEN')),
  (pg_temp.k('A'), '10000000-0000-0000-0000-00000000f5a3', pg_temp.role_id('CASHIER'))
on conflict do nothing;

-- 0. Catalog
insert into _t (area, test, expected, got) values ('Catalog', 'staff.* granted to ADMIN and MANAGER only (system roles)', 'ADMIN,MANAGER',
  (select string_agg(distinct r.key, ',' order by r.key) from dk_role_permissions rp join dk_roles r on r.id = rp.role_id where r.is_system and rp.permission_key = 'staff.manage'));

-- 1. Planning as the admin
select pg_temp.act_as('00000000-0000-0000-0000-00000000f5a1', pg_temp.k('A'));
set local role authenticated;
do $$
declare m timestamptz := (select txt from _ctx where key = 'monday')::timestamptz;
begin
  insert into dk_shifts (user_id, role_id, starts_at, ends_at, break_minutes) values ('10000000-0000-0000-0000-00000000f5a2', pg_temp.role_id('KITCHEN'), m + interval '7 hours', m + interval '15 hours', 30);
  insert into _t (area, test, expected, got) values ('Plan', 'Day shift with a break', 'ok', 'ok');
  -- Split shift: morning and night the same day.
  insert into dk_shifts (user_id, role_id, starts_at, ends_at) values ('10000000-0000-0000-0000-00000000f5a3', pg_temp.role_id('CASHIER'), m + interval '9 hours', m + interval '13 hours');
  insert into dk_shifts (user_id, role_id, starts_at, ends_at) values ('10000000-0000-0000-0000-00000000f5a3', pg_temp.role_id('CASHIER'), m + interval '18 hours', m + interval '23 hours');
  insert into _t (area, test, expected, got) values ('Plan', 'Split shift (two the same day)', 'ok', 'ok');
  -- Overnight
  insert into dk_shifts (user_id, role_id, starts_at, ends_at) values ('10000000-0000-0000-0000-00000000f5a2', pg_temp.role_id('KITCHEN'), m + interval '1 day 20 hours', m + interval '2 days 4 hours');
  insert into _t (area, test, expected, got) values ('Plan', 'Overnight shift', 'ok', 'ok');

  begin insert into dk_shifts (user_id, role_id, starts_at, ends_at) values ('10000000-0000-0000-0000-00000000f5a2', pg_temp.role_id('KITCHEN'), m + interval '14 hours', m + interval '18 hours');
    insert into _t (area, test, expected, got) values ('Rules', 'Overlap of the same person', 'blocked', 'ALLOWED');
  exception when exclusion_violation then insert into _t (area, test, expected, got) values ('Rules', 'Overlap of the same person', 'blocked', 'blocked'); end;

  begin insert into dk_shifts (user_id, role_id, starts_at, ends_at) values ('10000000-0000-0000-0000-00000000f5a2', pg_temp.role_id('CASHIER'), m + interval '3 days 8 hours', m + interval '3 days 12 hours');
    insert into _t (area, test, expected, got) values ('Rules', 'Role the person does not have', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Rules', 'Role the person does not have', 'blocked', 'blocked', sqlerrm); end;

  begin insert into dk_shifts (user_id, role_id, starts_at, ends_at) values ('10000000-0000-0000-0000-00000000f5a2', pg_temp.role_id('KITCHEN'), m + interval '4 days', m + interval '4 days 17 hours');
    insert into _t (area, test, expected, got) values ('Rules', 'Longer than 16 h', 'blocked', 'ALLOWED');
  exception when check_violation then insert into _t (area, test, expected, got) values ('Rules', 'Longer than 16 h', 'blocked', 'blocked'); end;

  begin insert into dk_shifts (user_id, role_id, starts_at, ends_at) values ('10000000-0000-0000-0000-00000000f5a2', pg_temp.role_id('KITCHEN'), m + interval '4 days 10 hours', m + interval '4 days 9 hours');
    insert into _t (area, test, expected, got) values ('Rules', 'Ends before it starts', 'blocked', 'ALLOWED');
  exception when check_violation then insert into _t (area, test, expected, got) values ('Rules', 'Ends before it starts', 'blocked', 'blocked'); end;

  -- Cancelling frees the time.
  update dk_shifts set status = 'cancelled' where user_id = '10000000-0000-0000-0000-00000000f5a3' and starts_at = m + interval '18 hours';
  insert into dk_shifts (user_id, role_id, starts_at, ends_at) values ('10000000-0000-0000-0000-00000000f5a3', pg_temp.role_id('CASHIER'), m + interval '17 hours', m + interval '22 hours');
  insert into _t (area, test, expected, got) values ('Rules', 'A cancelled shift does not block', 'ok', 'ok');

  insert into _t (area, test, expected, got) values ('Copy', 'Copy the week to the next one', '{"copied": 4, "skipped": 0}',
    dk_copy_shifts(m, m + interval '7 days')::text);
  insert into _t (area, test, expected, got) values ('Copy', 'Copying again skips the overlaps', '{"copied": 0, "skipped": 4}',
    dk_copy_shifts(m, m + interval '7 days')::text);
end $$;
reset role;

-- 2. Overlap across accounts of the organization
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'ivanclabe@gmail.com'), 'role', 'authenticated')::text, true);
select set_config('request.headers', json_build_object('x-dk-kitchen-id', pg_temp.k('A2'))::text, true);
set local role authenticated;
do $$
declare m timestamptz := (select txt from _ctx where key = 'monday')::timestamptz;
begin
  begin insert into dk_shifts (user_id, role_id, starts_at, ends_at) values ('10000000-0000-0000-0000-00000000f5a2', pg_temp.role_id('KITCHEN'), m + interval '10 hours', m + interval '12 hours');
    insert into _t (area, test, expected, got) values ('Rules', 'Overlap in another account of the organization', 'blocked', 'ALLOWED');
  exception when exclusion_violation then insert into _t (area, test, expected, got) values ('Rules', 'Overlap in another account of the organization', 'blocked', 'blocked'); end;
end $$;
reset role;

-- 3. What each one sees and can do
select pg_temp.act_as('00000000-0000-0000-0000-00000000f5a2', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Access', 'Kitchen sees only their own shifts', 'true', (select bool_and(user_id = '10000000-0000-0000-0000-00000000f5a2') and count(*) > 0 from dk_shifts)::text);
do $$ begin
  begin perform dk_copy_shifts(now(), now() + interval '7 days');
    insert into _t (area, test, expected, got) values ('Access', 'Kitchen cannot copy weeks', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Access', 'Kitchen cannot copy weeks', 'blocked', 'blocked', sqlerrm); end;
  begin insert into dk_shifts (user_id, role_id, starts_at, ends_at) values ('10000000-0000-0000-0000-00000000f5a2', pg_temp.role_id('KITCHEN'), now() + interval '30 days', now() + interval '30 days 2 hours');
    insert into _t (area, test, expected, got) values ('Access', 'Kitchen cannot plan shifts', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Access', 'Kitchen cannot plan shifts', 'blocked', 'blocked', sqlerrm); end;
  begin perform * from dk_shifts_now();
    insert into _t (area, test, expected, got) values ('Access', 'Kitchen cannot list who is on shift', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Access', 'Kitchen cannot list who is on shift', 'blocked', 'blocked', sqlerrm); end;
end $$;
update dk_shifts set notes = 'cambio propio' where user_id = '10000000-0000-0000-0000-00000000f5a2';
insert into _t (area, test, expected, got) values ('Access', 'Kitchen cannot edit their shift', '0', (select count(*)::text from dk_shifts where notes = 'cambio propio'));

-- 4. Clock in without a planned shift (now) → unplanned; clock out
do $$
declare v uuid;
begin
  v := dk_clock_in();
  insert into _t (area, test, expected, got) values ('Clock', 'Clock in without a plan creates an unplanned shift', 'true · KITCHEN',
    (select unplanned::text || ' · ' || (select key from dk_roles where id = role_id) from dk_shifts where id = v));
  begin perform dk_clock_in();
    insert into _t (area, test, expected, got) values ('Clock', 'Cannot clock in twice', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Clock', 'Cannot clock in twice', 'blocked', 'blocked', sqlerrm); end;
  perform dk_clock_out();
  insert into _t (area, test, expected, got) values ('Clock', 'Clock out closes it', 'true',
    (select (clock_out_at is not null and ends_at >= starts_at + interval '15 minutes')::text from dk_shifts where id = v));
end $$;
reset role;

-- 4b. Team for planning: the admin reads it, kitchen does not
select pg_temp.act_as('00000000-0000-0000-0000-00000000f5a1', pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values ('Team', 'Admin reads the team with roles', 'KITCHEN',
  (select (select key from dk_roles where id = (roles -> 0 ->> 'id')::uuid) from dk_staff_members() where user_id = '10000000-0000-0000-0000-00000000f5a2'));
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-00000000f5a2', pg_temp.k('A'));
set local role authenticated;
do $$ begin
  begin perform * from dk_staff_members();
    insert into _t (area, test, expected, got) values ('Team', 'Kitchen cannot read the team', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Team', 'Kitchen cannot read the team', 'blocked', 'blocked', sqlerrm); end;
end $$;
reset role;

-- 5. Who is on shift now (cashier: dispatch permission) — the cashier clocks in.
select pg_temp.act_as('00000000-0000-0000-0000-00000000f5a3', pg_temp.k('A'));
set local role authenticated;
do $$ begin perform dk_clock_in(); end $$;
insert into _t (area, test, expected, got) values ('Now', 'Cashier sees who is on shift (themselves, clocked in)', 'Caja Turnos · true',
  (select full_name || ' · ' || clocked_in::text from dk_shifts_now() where user_id = '10000000-0000-0000-0000-00000000f5a3'));
reset role;

set local role anon;
do $$ begin
  begin perform dk_clock_in();
    insert into _t (area, test, expected, got) values ('Access', 'Anonymous clock in', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Access', 'Anonymous clock in', 'blocked', 'blocked', sqlerrm); end;
end $$;
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
