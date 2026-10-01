-- ADR 0020: Personal y Turnos.
--
-- A shift is one row: a person (dk_users, member of the account), the role
-- they work with that shift (one of their roles in the account), start and
-- end. Flexible on purpose: any start/end, overnight shifts, split shifts
-- (several rows the same day), 15 min to 16 h. People and roles are NOT
-- copied: they come from dk_users / dk_kitchen_members / dk_member_roles.
--
-- Rules in the database:
--   * no overlapping shifts of the same person in the whole organization
--     (exclusion constraint, btree_gist);
--   * staff.view to see the account's plan, staff.manage to change it;
--     everyone sees their own shifts and clocks in/out themselves.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Permissions (catalog) — ADMIN and MANAGER get both (D9)
-- ---------------------------------------------------------------------------
insert into dk_permissions (key, module, action, scope, label, description, sort_order) values
  ('staff.view', 'staff', 'view', 'account', 'Ver turnos del personal', 'Ver el plan de turnos de la cuenta, quién está de turno y las horas', 175),
  ('staff.manage', 'staff', 'manage', 'account', 'Planificar turnos', 'Crear, cambiar, cancelar y copiar turnos del personal', 176)
on conflict (key) do nothing;

insert into dk_role_permissions (role_id, permission_key)
select r.id, p.key
from dk_roles r cross join (values ('staff.view'), ('staff.manage')) p(key)
where r.is_system and r.key in ('ADMIN', 'MANAGER')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Shifts
-- ---------------------------------------------------------------------------
create type dk_shift_status as enum ('scheduled', 'cancelled');

create table dk_shifts (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default dk_current_kitchen_id() references dk_kitchens(id) on delete cascade,
  -- Filled from the account (trigger): the no-overlap rule is organization-wide.
  organization_id uuid not null references dk_organizations(id) on delete cascade,
  user_id uuid not null references dk_users(id) on delete cascade,
  role_id uuid not null references dk_roles(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  break_minutes integer not null default 0,
  notes text,
  status dk_shift_status not null default 'scheduled',
  -- Created when someone clocked in without a planned shift.
  unplanned boolean not null default false,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  created_by uuid references dk_users(id) default dk_current_profile_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dk_shifts_duration check (ends_at > starts_at and ends_at - starts_at between interval '15 minutes' and interval '16 hours'),
  constraint dk_shifts_break check (break_minutes between 0 and 240 and break_minutes * interval '1 minute' < ends_at - starts_at),
  constraint dk_shifts_notes check (notes is null or char_length(notes) <= 300),
  constraint dk_shifts_clock check (clock_out_at is null or (clock_in_at is not null and clock_out_at >= clock_in_at)),
  constraint dk_shifts_no_overlap exclude using gist (
    organization_id with =, user_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (status = 'scheduled')
);

create index dk_shifts_kitchen_time_idx on dk_shifts (kitchen_id, starts_at);
create index dk_shifts_user_time_idx on dk_shifts (user_id, starts_at);

comment on table dk_shifts is 'Turnos del personal (ADR 0020). Personas y roles vienen de dk_users / dk_member_roles; sin solapes por persona en la organización.';

create trigger dk_trg_shifts_updated_at before update on dk_shifts
  for each row execute function dk_set_updated_at();

-- The person must be an active member of the account and the role one of theirs there.
create or replace function dk_shift_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select organization_id into new.organization_id from dk_kitchens where id = new.kitchen_id;
  if not exists (select 1 from dk_kitchen_members m where m.kitchen_id = new.kitchen_id and m.user_id = new.user_id and m.active) then
    raise exception 'Esa persona no es parte del equipo de esta cuenta';
  end if;
  if not exists (select 1 from dk_member_roles mr where mr.kitchen_id = new.kitchen_id and mr.user_id = new.user_id and mr.role_id = new.role_id)
     and not exists (select 1 from dk_kitchen_members m where m.kitchen_id = new.kitchen_id and m.user_id = new.user_id and m.default_role_id = new.role_id) then
    raise exception 'Ese rol no está asignado a esa persona en esta cuenta';
  end if;
  return new;
end;
$$;

create trigger dk_trg_shifts_check before insert or update of kitchen_id, user_id, role_id on dk_shifts
  for each row execute function dk_shift_check();

alter table dk_shifts enable row level security;

create policy dk_shifts_select on dk_shifts for select to authenticated
  using (
    kitchen_id = (select dk_current_kitchen_id())
    and ((select dk_can('staff.view')) or user_id = (select dk_current_profile_id()))
  );

create policy dk_shifts_insert on dk_shifts for insert to authenticated
  with check (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('staff.manage')));

create policy dk_shifts_update on dk_shifts for update to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('staff.manage')))
  with check (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('staff.manage')));

-- No delete policy: a shift is cancelled (status), never erased.

grant select, insert, update on dk_shifts to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Clock in / out (own shifts, no permission needed)
-- ---------------------------------------------------------------------------

-- Clock in: the person's planned shift of this account that is starting or
-- running (from 2 h before its start), or — without one — an unplanned shift
-- from now until the next planned one (at most 8 h).
create or replace function dk_clock_in()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := dk_current_profile_id();
  v_kitchen uuid := dk_current_kitchen_id();
  v_shift dk_shifts;
  v_role uuid;
  v_next timestamptz;
begin
  if v_me is null or v_kitchen is null then raise exception 'Inicia sesión en una cuenta'; end if;
  if not exists (select 1 from dk_kitchen_members where kitchen_id = v_kitchen and user_id = v_me and active) then
    raise exception 'No eres parte del equipo de esta cuenta';
  end if;
  if exists (select 1 from dk_shifts where user_id = v_me and status = 'scheduled' and clock_in_at is not null and clock_out_at is null) then
    raise exception 'Ya marcaste entrada: marca la salida de tu turno abierto';
  end if;

  select * into v_shift from dk_shifts
  where user_id = v_me and kitchen_id = v_kitchen and status = 'scheduled' and clock_in_at is null
    and now() between starts_at - interval '2 hours' and ends_at
  order by starts_at
  limit 1;

  if found then
    update dk_shifts set clock_in_at = now() where id = v_shift.id;
    return v_shift.id;
  end if;

  -- Unplanned: with the role active in the app (header), or the default one.
  v_role := coalesce(
    (select r.id from dk_roles r
      where r.id = nullif(current_setting('request.headers', true)::jsonb ->> 'x-dk-role-id', '')::uuid
        and (exists (select 1 from dk_member_roles mr where mr.kitchen_id = v_kitchen and mr.user_id = v_me and mr.role_id = r.id)
             or exists (select 1 from dk_kitchen_members m where m.kitchen_id = v_kitchen and m.user_id = v_me and m.default_role_id = r.id))),
    (select default_role_id from dk_kitchen_members where kitchen_id = v_kitchen and user_id = v_me));
  if v_role is null then raise exception 'No tienes un rol en esta cuenta'; end if;

  select min(starts_at) into v_next from dk_shifts
  where user_id = v_me and status = 'scheduled' and starts_at > now();

  insert into dk_shifts (kitchen_id, user_id, role_id, starts_at, ends_at, unplanned, clock_in_at, created_by)
  values (v_kitchen, v_me, v_role, now(), least(now() + interval '8 hours', greatest(coalesce(v_next, now() + interval '8 hours'), now() + interval '15 minutes')), true, now(), v_me)
  returning * into v_shift;
  return v_shift.id;
exception when exclusion_violation then
  raise exception 'Ya tienes un turno en este horario en otra cuenta';
end;
$$;

-- Clock out: closes the person's open shift. An unplanned shift ends now.
create or replace function dk_clock_out()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := dk_current_profile_id();
  v_shift dk_shifts;
begin
  select * into v_shift from dk_shifts
  where user_id = v_me and status = 'scheduled' and clock_in_at is not null and clock_out_at is null
  order by clock_in_at desc
  limit 1;
  if not found then raise exception 'No tienes un turno abierto'; end if;
  update dk_shifts
     set clock_out_at = now(),
         ends_at = case when unplanned then greatest(now(), starts_at + interval '15 minutes') else ends_at end
   where id = v_shift.id;
  return v_shift.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Planning helpers
-- ---------------------------------------------------------------------------

-- Copy the planned shifts of one week to another (same weekday and time).
-- p_from_week / p_to_week: the start (Monday 00:00 local) of each week, as
-- the app sees it. Shifts that would overlap, or whose person/role is no
-- longer valid, are skipped.
create or replace function dk_copy_shifts(p_from_week timestamptz, p_to_week timestamptz)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_offset interval := p_to_week - p_from_week;
  v_shift record;
  v_copied integer := 0;
  v_skipped integer := 0;
begin
  perform dk_require('staff.manage');
  if p_from_week = p_to_week then raise exception 'Elige otra semana de destino'; end if;
  for v_shift in
    select * from dk_shifts
    where kitchen_id = dk_current_kitchen_id() and status = 'scheduled' and not unplanned
      and starts_at >= p_from_week and starts_at < p_from_week + interval '7 days'
  loop
    begin
      insert into dk_shifts (kitchen_id, user_id, role_id, starts_at, ends_at, break_minutes, notes)
      values (v_shift.kitchen_id, v_shift.user_id, v_shift.role_id, v_shift.starts_at + v_offset, v_shift.ends_at + v_offset, v_shift.break_minutes, v_shift.notes);
      v_copied := v_copied + 1;
    exception when exclusion_violation or raise_exception then
      v_skipped := v_skipped + 1;
    end;
  end loop;
  return jsonb_build_object('copied', v_copied, 'skipped', v_skipped);
end;
$$;

-- Who is on shift now in the active account: clocked in (and not out), or
-- with a planned shift covering now. Minimal data, also for Despacho (riders
-- on shift) and Copilot: needs staff.view or a dispatch permission.
create or replace function dk_shifts_now()
returns table (shift_id uuid, user_id uuid, full_name text, role_id uuid, role_name text, starts_at timestamptz, ends_at timestamptz, clocked_in boolean, rider_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (dk_can('staff.view') or dk_can('dispatch.view') or dk_can('dispatch.assign')) then
    raise exception 'No autorizado: falta el permiso staff.view' using errcode = '42501';
  end if;
  return query
    select s.id, s.user_id, u.full_name, s.role_id, r.name, s.starts_at, s.ends_at,
           (s.clock_in_at is not null and s.clock_out_at is null),
           (select dr.id from dk_delivery_riders dr where dr.kitchen_id = s.kitchen_id and dr.user_id = s.user_id and dr.active limit 1)
    from dk_shifts s
    join dk_users u on u.id = s.user_id
    join dk_roles r on r.id = s.role_id
    where s.kitchen_id = dk_current_kitchen_id() and s.status = 'scheduled'
      and ((s.clock_in_at is not null and s.clock_out_at is null) or (now() >= s.starts_at and now() < s.ends_at and s.clock_out_at is null))
    order by u.full_name;
end;
$$;

revoke execute on function dk_clock_in(), dk_clock_out(), dk_copy_shifts(timestamptz, timestamptz), dk_shifts_now(), dk_shift_check() from public, anon;
grant execute on function dk_clock_in(), dk_clock_out(), dk_copy_shifts(timestamptz, timestamptz), dk_shifts_now() to authenticated;
