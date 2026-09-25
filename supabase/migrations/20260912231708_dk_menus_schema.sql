-- Dark Kitchen — Fase 4: Menu (menus, disponibilidad, horarios, precio especial).

create table dk_menus (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger dk_trg_menus_updated_at
  before update on dk_menus
  for each row execute function dk_set_updated_at();

-- Un producto dentro de un menu: si esta activo, su horario, y su precio
-- especial (si difiere del precio base del plato).
create table dk_menu_items (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references dk_menus(id) on delete cascade,
  product_id uuid not null references dk_products(id) on delete cascade,
  active boolean not null default true,
  special_price numeric check (special_price is null or special_price >= 0),
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (menu_id, product_id),
  constraint dk_menu_items_schedule check (
    start_time is null or end_time is null or start_time < end_time
  )
);

create trigger dk_trg_menu_items_updated_at
  before update on dk_menu_items
  for each row execute function dk_set_updated_at();

create trigger dk_trg_audit_menu_items
  after insert or update or delete on dk_menu_items
  for each row execute function dk_audit_row();

-- Menu del dia: excepcion puntual de disponibilidad/precio para una fecha
-- concreta, sin tocar el menu_item base (que sigue siendo el default para
-- cualquier otro dia). Si no hay fila aqui para (menu_item, fecha), la
-- disponibilidad efectiva es la de dk_menu_items.active.
create table dk_daily_availability (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references dk_menu_items(id) on delete cascade,
  menu_date date not null,
  available boolean not null default true,
  special_price numeric check (special_price is null or special_price >= 0),
  created_by uuid references dk_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (menu_item_id, menu_date)
);

create trigger dk_trg_daily_availability_updated_at
  before update on dk_daily_availability
  for each row execute function dk_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table dk_menus enable row level security;
alter table dk_menu_items enable row level security;
alter table dk_daily_availability enable row level security;

-- Lectura abierta a cualquier autenticado (caja/cocina necesitan saber que
-- esta disponible); estructura del menu (dk_menus/dk_menu_items) solo la
-- edita ADMIN/MANAGER.
create policy dk_menus_select on dk_menus for select to authenticated using (true);
create policy dk_menus_write on dk_menus for all to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER'))
  with check (dk_current_role() in ('ADMIN','MANAGER'));

create policy dk_menu_items_select on dk_menu_items for select to authenticated using (true);
create policy dk_menu_items_write on dk_menu_items for all to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER'))
  with check (dk_current_role() in ('ADMIN','MANAGER'));

-- El "menu del dia" (marcar algo agotado hoy) tambien lo puede operar KITCHEN
-- en caliente durante el servicio, sin permitirle tocar precios/estructura.
create policy dk_daily_availability_select on dk_daily_availability for select to authenticated using (true);
create policy dk_daily_availability_write on dk_daily_availability for all to authenticated
  using (dk_current_role() in ('ADMIN','MANAGER','KITCHEN'))
  with check (dk_current_role() in ('ADMIN','MANAGER','KITCHEN'));
