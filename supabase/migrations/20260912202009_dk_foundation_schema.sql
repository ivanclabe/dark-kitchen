-- Dark Kitchen — Fase 1 (Foundation): identidad, roles y auditoria base.
-- Prefijo dk_ en todo objeto nuevo para aislarlo del resto del proyecto compartido.

create type dk_role as enum ('ADMIN','MANAGER','KITCHEN','INVENTORY','CASHIER','DELIVERY');

create or replace function dk_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table dk_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  role dk_role not null default 'CASHIER',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table dk_users is 'Perfil de staff de Dark Kitchen, 1:1 con auth.users. Fuente de verdad del rol para RLS.';

create trigger dk_trg_users_updated_at
  before update on dk_users
  for each row
  execute function dk_set_updated_at();

-- SECURITY DEFINER: se usa dentro de policies de RLS sin causar recursion,
-- porque corre con privilegios del owner y no vuelve a evaluar RLS de dk_users.
create or replace function dk_current_role()
returns dk_role
language sql
security definer
stable
set search_path = public
as $$
  select role from dk_users where auth_user_id = auth.uid();
$$;

create or replace function dk_current_profile_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from dk_users where auth_user_id = auth.uid();
$$;

alter table dk_users enable row level security;

-- Cualquier usuario autenticado puede leer su propia fila (para resolver su
-- rol al iniciar sesion); ADMIN puede leer todas.
create policy dk_users_select on dk_users
  for select
  to authenticated
  using (auth_user_id = auth.uid() or dk_current_role() = 'ADMIN');

-- Bootstrap: si la tabla esta vacia, cualquier usuario autenticado puede
-- crear la primera fila (se vuelve el primer ADMIN manualmente despues, o se
-- inserta ya con role='ADMIN' desde la app de bootstrap). Una vez existe al
-- menos un usuario, solo ADMIN puede crear mas.
create policy dk_users_insert on dk_users
  for insert
  to authenticated
  with check (
    dk_current_role() = 'ADMIN'
    or not exists (select 1 from dk_users)
  );

create policy dk_users_update on dk_users
  for update
  to authenticated
  using (dk_current_role() = 'ADMIN')
  with check (dk_current_role() = 'ADMIN');

-- Sin policy de delete: los usuarios se desactivan (active=false), no se borran.

-- ---------------------------------------------------------------------------
-- Auditoria generica
-- ---------------------------------------------------------------------------

create table dk_audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid references dk_users(id),
  created_at timestamptz not null default now()
);

comment on table dk_audit_log is 'Auditoria generica para tablas sensibles de Dark Kitchen (dk_*): quien, que, cuando, valor anterior/nuevo.';

alter table dk_audit_log enable row level security;

create policy dk_audit_log_select on dk_audit_log
  for select
  to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER'));

-- Sin policy de insert/update/delete para clientes: solo se escribe via
-- trigger SECURITY DEFINER (dk_audit_row), nunca directo desde la app.

create or replace function dk_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into dk_audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE','INSERT') then to_jsonb(new) else null end,
    dk_current_profile_id()
  );
  return coalesce(new, old);
end;
$$;

create trigger dk_trg_audit_users
  after insert or update or delete on dk_users
  for each row
  execute function dk_audit_row();
