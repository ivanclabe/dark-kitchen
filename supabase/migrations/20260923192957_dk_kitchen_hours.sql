create table dk_kitchen_hours (
  day_of_week dk_day_of_week primary key,
  is_open boolean not null default false,
  opens_at time,
  closes_at time,
  updated_by uuid references dk_users(id) default dk_current_profile_id(),
  updated_at timestamptz not null default now(),
  constraint dk_kitchen_hours_times check (
    not is_open or (opens_at is not null and closes_at is not null and opens_at <> closes_at)
  )
);

create table dk_kitchen_hour_exceptions (
  exception_date date primary key,
  is_open boolean not null,
  opens_at time,
  closes_at time,
  note text,
  created_by uuid references dk_users(id) default dk_current_profile_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dk_kitchen_hour_exceptions_times check (
    not is_open or (opens_at is not null and closes_at is not null and opens_at <> closes_at)
  )
);

create trigger dk_trg_kitchen_hours_updated_at
  before update on dk_kitchen_hours
  for each row execute function dk_set_updated_at();

create trigger dk_trg_kitchen_hour_exceptions_updated_at
  before update on dk_kitchen_hour_exceptions
  for each row execute function dk_set_updated_at();

create trigger dk_trg_audit_kitchen_hours
  after insert or update or delete on dk_kitchen_hours
  for each row execute function dk_audit_row();

create trigger dk_trg_audit_kitchen_hour_exceptions
  after insert or update or delete on dk_kitchen_hour_exceptions
  for each row execute function dk_audit_row();

alter table dk_kitchen_hours enable row level security;
alter table dk_kitchen_hour_exceptions enable row level security;

create policy dk_kitchen_hours_select on dk_kitchen_hours for select to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER','CASHIER','KITCHEN','DELIVERY'));
create policy dk_kitchen_hours_write on dk_kitchen_hours for all to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER'))
  with check (dk_current_role() in ('ADMIN','MANAGER'));

create policy dk_kitchen_hour_exceptions_select on dk_kitchen_hour_exceptions for select to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER','CASHIER','KITCHEN','DELIVERY'));
create policy dk_kitchen_hour_exceptions_write on dk_kitchen_hour_exceptions for all to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER'))
  with check (dk_current_role() in ('ADMIN','MANAGER'));

comment on table dk_kitchen_hours is 'Horario semanal de la cocina (plantilla recurrente). closes_at <= opens_at = cierra al dia siguiente. Vacia = sin configurar.';
comment on table dk_kitchen_hour_exceptions is 'Excepciones del horario por fecha (festivos, cierres, horarios especiales). Gana sobre dk_kitchen_hours.';
