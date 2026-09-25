-- ADR 0009, sección 3.2: funciones opcionales (IA, voz…) con catálogo central
-- y dos niveles: la organización decide qué ofrece; cada Cuenta activa lo que
-- se le ofrece. Una sola fórmula, en la base:
--
--   usable = catálogo.activo ∧ disponible(organización) ∧ activada(Cuenta) ∧ dk_can(permiso de uso)
--
-- Sin fila en la organización o en la Cuenta valen los valores por defecto del
-- catálogo (reproducen el comportamiento previo: todo ofrecido, IA apagada,
-- voz encendida). La elección de la Cuenta se conserva si la organización
-- deja de ofrecer una función y vuelve cuando la ofrece de nuevo.
--
-- 1. dk_features: catálogo (lo define la migración; nadie lo edita).
-- 2. dk_organization_features: disponibilidad por organización.
-- 3. dk_kitchen_features: renombre de dk_ai_features (mismas filas) + FK al
--    catálogo. Escritura solo por RPC. Vista de compatibilidad dk_ai_features.
-- 4. Funciones de estado, RPC de escritura, guardia y nuevas políticas de
--    dk_ai_insights (reemplazan a dk_ai_feature_allowed, que deducía el permiso
--    por el prefijo del nombre).
-- 5. Permiso de organización features.manage (SUPER_ADMIN).

-- ---------------------------------------------------------------------------
-- 5. Permiso
-- ---------------------------------------------------------------------------
insert into dk_permissions (key, module, action, scope, label, description, sort_order) values
  ('features.manage', 'features', 'manage', 'organization', 'Administrar funciones',
   'Decidir qué funciones (IA, voz…) ofrece la organización y cuáles activa cada Cuenta', 545);

-- ---------------------------------------------------------------------------
-- 1. Catálogo
-- ---------------------------------------------------------------------------
create table dk_features (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  category text not null check (category in ('ai', 'voice', 'general')),
  label text not null,
  description text not null,
  use_permission text not null references dk_permissions(key),
  manage_permission text not null references dk_permissions(key),
  default_available boolean not null default true,
  default_enabled boolean not null default false,
  default_settings jsonb not null default '{}' check (jsonb_typeof(default_settings) = 'object'),
  uses_model boolean not null default false,
  sort_order integer not null,
  active boolean not null default true
);

comment on table dk_features is 'Catálogo de funciones opcionales (ADR 0009). Lo define una migración. Los módulos base no son funciones: los controla el RBAC.';
comment on column dk_features.use_permission is 'Permiso de Cuenta que necesita el rol activo para usar la función.';
comment on column dk_features.manage_permission is 'Permiso de Cuenta para activarla/desactivarla y cambiar sus parámetros en la Cuenta.';

insert into dk_features (key, category, label, description, use_permission, manage_permission, default_available, default_enabled, default_settings, uses_model, sort_order) values
  ('supply_reorder', 'ai', 'Sugerencias de compra',
   'Prioriza qué reponer según el consumo real, la tendencia y la cobertura, y explica por qué.',
   'inventory.view', 'ai.manage', true, false, '{"coverage_days": 7, "frequency_min": 360}', true, 10),
  ('supply_perishables', 'ai', 'Perecederos en riesgo',
   'Detecta insumos perecederos que vencen pronto o no alcanzan a consumirse antes de vencer.',
   'inventory.view', 'ai.manage', true, false, '{"warning_days": 2, "frequency_min": 360}', true, 20),
  ('supply_slow_movers', 'ai', 'Poco movimiento',
   'Señala insumos que no se consumen o con stock excesivo para su ritmo.',
   'inventory.view', 'ai.manage', true, false, '{"slow_days": 21, "overstock_days": 60, "frequency_min": 1440}', true, 30),
  ('kitchen_stall_alerts', 'ai', 'Alertas de pedidos detenidos',
   'Avisa en Cocina cuando un pedido o un plato lleva demasiado tiempo sin avanzar.',
   'kitchen.view', 'ai.manage', true, false, '{"dish_stall_min": 12, "repeat_min": 5, "voice": true}', false, 40),
  ('kitchen_insights', 'ai', 'Sugerencias de Cocina en vivo',
   'Mira la cocina en tiempo real y sugiere qué priorizar, agrupar o despachar.',
   'kitchen.view', 'ai.manage', true, false, '{"frequency_min": 10, "voice": false}', true, 50),
  ('voice_commands', 'voice', 'Comandos de voz',
   'Dictar acciones en Cocina (“iniciar el pedido 1023”). Cada acción pasa por los mismos permisos que los botones.',
   'kitchen.view', 'settings.manage', true, true, '{}', false, 100),
  ('voice_speech', 'voice', 'Voz de la aplicación',
   'Respuestas habladas a los comandos y avisos por voz (pedidos detenidos, sugerencias).',
   'kitchen.view', 'settings.manage', true, true, '{}', false, 110);

alter table dk_features enable row level security;
create policy dk_features_select on dk_features for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 2. Disponibilidad por organización
-- ---------------------------------------------------------------------------
create table dk_organization_features (
  organization_id uuid not null references dk_organizations(id) on delete cascade,
  feature_key text not null references dk_features(key),
  available boolean not null,
  updated_by uuid references dk_users(id) default dk_current_profile_id(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, feature_key)
);

comment on table dk_organization_features is 'Qué funciones ofrece cada organización a sus Cuentas. Sin fila = valor por defecto del catálogo. Escritura solo por dk_set_org_feature.';

create index dk_organization_features_feature_idx on dk_organization_features (feature_key);

alter table dk_organization_features enable row level security;
create policy dk_organization_features_select on dk_organization_features for select to authenticated
  using ((select dk_has_org_permission(organization_id, 'organization.view')));

create trigger dk_trg_audit_organization_features after insert or update or delete on dk_organization_features
  for each row execute function dk_audit_row();

-- ---------------------------------------------------------------------------
-- 3. Activación por Cuenta (antes dk_ai_features)
-- ---------------------------------------------------------------------------
alter table dk_ai_features rename to dk_kitchen_features;
alter table dk_kitchen_features rename constraint dk_ai_features_pkey to dk_kitchen_features_pkey;
alter table dk_kitchen_features rename constraint dk_ai_features_kitchen_id_fkey to dk_kitchen_features_kitchen_id_fkey;
alter table dk_kitchen_features rename constraint dk_ai_features_updated_by_fkey to dk_kitchen_features_updated_by_fkey;
alter table dk_kitchen_features drop constraint dk_ai_features_feature_key_check;
alter table dk_kitchen_features add constraint dk_kitchen_features_feature_key_fkey foreign key (feature_key) references dk_features(key);
alter trigger dk_trg_ai_features_touch on dk_kitchen_features rename to dk_trg_kitchen_features_touch;
alter trigger dk_trg_audit_ai_features on dk_kitchen_features rename to dk_trg_audit_kitchen_features;

comment on table dk_kitchen_features is 'Funciones activadas en cada Cuenta y sus parámetros. Sin fila = valor por defecto del catálogo. Escritura solo por dk_set_kitchen_feature.';

create index dk_kitchen_features_feature_idx on dk_kitchen_features (feature_key);

-- Escritura directa fuera: todo pasa por la RPC (que valida la organización).
drop policy dk_ai_features_update_ai_manage on dk_kitchen_features;
alter policy dk_ai_features_select on dk_kitchen_features rename to dk_kitchen_features_select;

-- ---------------------------------------------------------------------------
-- 4. Estado efectivo
-- ---------------------------------------------------------------------------

-- ¿La organización ofrece la función? (interna: la usan otras funciones)
create or replace function dk_feature_available(p_organization_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select f.active and coalesce(ofe.available, f.default_available)
    from dk_features f
    left join dk_organization_features ofe on ofe.organization_id = p_organization_id and ofe.feature_key = f.key
    where f.key = p_key
  ), false);
$$;

-- ¿Está encendida en la Cuenta? (organización ∧ Cuenta; interna)
create or replace function dk_feature_enabled(p_kitchen_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select f.active and coalesce(ofe.available, f.default_available) and coalesce(kf.enabled, f.default_enabled)
    from dk_features f
    join dk_kitchens k on k.id = p_kitchen_id
    left join dk_organization_features ofe on ofe.organization_id = k.organization_id and ofe.feature_key = f.key
    left join dk_kitchen_features kf on kf.kitchen_id = k.id and kf.feature_key = f.key
    where f.key = p_key
  ), false);
$$;

-- ¿Puede usarla quien consulta, en la Cuenta actual y con su rol activo?
create or replace function dk_can_use_feature(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    dk_current_kitchen_id() is not null
    and dk_feature_enabled(dk_current_kitchen_id(), p_key)
    and dk_can((select f.use_permission from dk_features f where f.key = p_key)),
    false);
$$;

-- Estado de una función en la Cuenta actual, con el motivo si no se puede usar
-- (lo usa la Edge Function de IA).
create or replace function dk_feature_state(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_feature dk_features;
  v_org uuid;
  v_row dk_kitchen_features;
  v_available boolean;
  v_enabled boolean;
  v_allowed boolean;
begin
  select * into v_feature from dk_features where key = p_key and active;
  if not found or v_kitchen is null then
    return jsonb_build_object('key', p_key, 'usable', false, 'reason', case when v_kitchen is null then 'account' else 'unknown' end);
  end if;
  select organization_id into v_org from dk_kitchens where id = v_kitchen;
  select * into v_row from dk_kitchen_features where kitchen_id = v_kitchen and feature_key = p_key;
  v_available := dk_feature_available(v_org, p_key);
  v_enabled := coalesce(v_row.enabled, v_feature.default_enabled);
  v_allowed := dk_can(v_feature.use_permission);
  return jsonb_build_object(
    'key', p_key,
    'available', v_available,
    'enabled', v_enabled,
    'usable', v_available and v_enabled and v_allowed,
    'reason', case when not v_available then 'organization' when not v_enabled then 'account' when not v_allowed then 'permission' end,
    'settings', v_feature.default_settings || coalesce(v_row.settings, '{}'));
end;
$$;

-- Todas las funciones de la Cuenta actual, para el contexto de la app.
create or replace function dk_my_features()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'key', f.key,
      'category', f.category,
      'label', f.label,
      'description', f.description,
      'usesModel', f.uses_model,
      'available', x.available,
      'enabled', coalesce(kf.enabled, f.default_enabled),
      'usable', x.available and coalesce(kf.enabled, f.default_enabled) and dk_can(f.use_permission),
      'canManage', dk_can(f.manage_permission) or dk_has_org_permission(k.organization_id, 'features.manage'),
      'settings', f.default_settings || coalesce(kf.settings, '{}'),
      'updatedAt', kf.updated_at)
    order by f.sort_order), '[]')
  from dk_features f
  join dk_kitchens k on k.id = dk_current_kitchen_id()
  left join dk_kitchen_features kf on kf.kitchen_id = k.id and kf.feature_key = f.key
  cross join lateral (select dk_feature_available(k.organization_id, f.key) as available) x
  where f.active and dk_effective_role(k.id) is not null;
$$;

-- Matriz de la organización: qué ofrece y qué tiene activado cada Cuenta.
create or replace function dk_org_feature_matrix(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not dk_has_org_permission(p_organization_id, 'features.manage') then
    raise exception 'Solo el SUPER_ADMIN administra las funciones de la organización';
  end if;
  return jsonb_build_object(
    'features', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'key', f.key, 'category', f.category, 'label', f.label, 'description', f.description, 'usesModel', f.uses_model,
          'available', dk_feature_available(p_organization_id, f.key))
        order by f.sort_order), '[]')
      from dk_features f where f.active),
    'accounts', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', k.id, 'name', k.name, 'slug', k.slug, 'iconKey', k.icon_key, 'active', k.active,
          'enabled', (
            select jsonb_object_agg(f.key, coalesce(kf.enabled, f.default_enabled))
            from dk_features f
            left join dk_kitchen_features kf on kf.kitchen_id = k.id and kf.feature_key = f.key
            where f.active))
        order by k.name), '[]')
      from dk_kitchens k where k.organization_id = p_organization_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Escritura
-- ---------------------------------------------------------------------------
create or replace function dk_set_org_feature(p_organization_id uuid, p_key text, p_available boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not dk_has_org_permission(p_organization_id, 'features.manage') then
    raise exception 'Solo el SUPER_ADMIN administra las funciones de la organización';
  end if;
  if not exists (select 1 from dk_features where key = p_key and active) then
    raise exception 'Función desconocida: %', p_key;
  end if;
  if p_available is null then raise exception 'Indica si la función está disponible'; end if;

  insert into dk_organization_features (organization_id, feature_key, available)
  values (p_organization_id, p_key, p_available)
  on conflict (organization_id, feature_key) do update
    set available = excluded.available, updated_by = dk_current_profile_id(), updated_at = now()
  where dk_organization_features.available is distinct from excluded.available;
end;
$$;

-- Activar/desactivar en una Cuenta y (opcional) cambiar sus parámetros. Solo
-- se guardan las claves que la función define (las del catálogo) con su tipo.
create or replace function dk_set_kitchen_feature(p_kitchen_id uuid, p_key text, p_enabled boolean, p_settings jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_feature dk_features;
  v_settings jsonb;
  v_current boolean;
begin
  select organization_id into v_org from dk_kitchens where id = p_kitchen_id;
  if v_org is null then raise exception 'Cuenta no encontrada'; end if;
  select * into v_feature from dk_features where key = p_key and active;
  if not found then raise exception 'Función desconocida: %', p_key; end if;
  if not (dk_has_org_permission(v_org, 'features.manage') or dk_has_kitchen_permission(p_kitchen_id, v_feature.manage_permission)) then
    raise exception 'No autorizado para cambiar esta función en la Cuenta';
  end if;
  if p_enabled is null then raise exception 'Indica si la función está activada'; end if;
  -- Activarla exige que la organización la ofrezca; si ya estaba activada,
  -- se pueden ajustar sus parámetros (seguirá apagada hasta que se ofrezca).
  select coalesce((select enabled from dk_kitchen_features where kitchen_id = p_kitchen_id and feature_key = p_key), v_feature.default_enabled)
  into v_current;
  if p_enabled and not v_current and not dk_feature_available(v_org, p_key) then
    raise exception 'Tu organización no tiene disponible esta función';
  end if;

  if p_settings is not null then
    if jsonb_typeof(p_settings) <> 'object' then raise exception 'Parámetros inválidos'; end if;
    select coalesce(jsonb_object_agg(s.key, s.value), '{}') into v_settings
    from jsonb_each(p_settings) s
    where v_feature.default_settings ? s.key
      and jsonb_typeof(s.value) = jsonb_typeof(v_feature.default_settings -> s.key);
  end if;

  -- Actualizar y, si no hay fila, insertar (un upsert dispararía la guardia de
  -- INSERT con la fila propuesta aunque termine siendo una actualización).
  update dk_kitchen_features
  set enabled = p_enabled, settings = coalesce(v_settings, settings)
  where kitchen_id = p_kitchen_id and feature_key = p_key;
  if not found then
    insert into dk_kitchen_features (kitchen_id, feature_key, enabled, settings, updated_by)
    values (p_kitchen_id, p_key, p_enabled, coalesce(v_settings, '{}'), dk_current_profile_id());
  end if;
end;
$$;

-- Guardia: una Cuenta no activa lo que su organización no ofrece (también ante
-- escrituras que no pasen por la RPC).
create or replace function dk_guard_kitchen_feature()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activating boolean;
begin
  if tg_op = 'INSERT' then
    v_activating := new.enabled and not (select default_enabled from dk_features where key = new.feature_key);
  else
    v_activating := new.enabled and not old.enabled;
  end if;
  if v_activating and not dk_feature_available((select organization_id from dk_kitchens where id = new.kitchen_id), new.feature_key) then
    raise exception 'Tu organización no tiene disponible esta función';
  end if;
  return new;
end;
$$;

create trigger dk_trg_kitchen_features_guard before insert or update on dk_kitchen_features
  for each row execute function dk_guard_kitchen_feature();

-- ---------------------------------------------------------------------------
-- Cuentas nuevas: ya no se siembran filas de IA (valen los valores del
-- catálogo). La versión final de dk_create_kitchen llega en la migración
-- 20260926120000 (icono y herencia SUPER_ADMIN + ADMIN).
-- ---------------------------------------------------------------------------
create or replace function dk_create_kitchen(p_name text, p_slug text, p_timezone text default null, p_currency text default null, p_organization_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := coalesce(p_organization_id, dk_default_organization_id());
  v_org_row dk_organizations;
  v_kitchen_id uuid;
begin
  if v_org is null then raise exception 'Indica la organización de la nueva Cuenta'; end if;
  if not dk_has_org_permission(v_org, 'accounts.create') then
    raise exception 'No autorizado para crear Cuentas en esta organización';
  end if;
  select * into v_org_row from dk_organizations where id = v_org;
  if v_org_row.max_accounts is not null and (select count(*) from dk_kitchens where organization_id = v_org) >= v_org_row.max_accounts then
    raise exception 'La organización llegó a su tope de % Cuentas', v_org_row.max_accounts;
  end if;

  insert into dk_kitchens (slug, name, timezone, currency, organization_id, created_by)
  values (lower(btrim(p_slug)), btrim(p_name), coalesce(p_timezone, v_org_row.default_timezone), coalesce(p_currency, v_org_row.currency), v_org, dk_current_profile_id())
  returning id into v_kitchen_id;

  insert into dk_kitchen_sla_settings (kitchen_id) values (v_kitchen_id);
  insert into dk_kitchen_counters (kitchen_id, name, last_value) values (v_kitchen_id, 'order_number', 999);
  return v_kitchen_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Resultados de IA: la regla única reemplaza a la deducción por prefijo.
-- ---------------------------------------------------------------------------
-- Sin filas obligatorias por Cuenta: el resultado apunta al catálogo (y a su Cuenta).
alter table dk_ai_insights drop constraint dk_ai_insights_feature_fkey;
alter table dk_ai_insights add constraint dk_ai_insights_feature_key_fkey foreign key (feature_key) references dk_features(key);

alter policy dk_ai_insights_select on dk_ai_insights
  using (kitchen_id = (select dk_current_kitchen_id()) and dk_can_use_feature(feature_key));
alter policy dk_ai_insights_insert on dk_ai_insights
  with check (kitchen_id = (select dk_current_kitchen_id()) and dk_can_use_feature(feature_key));
drop function dk_ai_feature_allowed(text);

-- ---------------------------------------------------------------------------
-- Compatibilidad: el nombre anterior, solo lectura y con el estado EFECTIVO
-- (organización ∧ Cuenta), para una Edge Function o app de la versión previa
-- durante el despliegue. Se retira en una migración posterior.
-- ---------------------------------------------------------------------------
create view dk_ai_features with (security_invoker = true) as
  select kf.feature_key,
         kf.enabled and f.active and coalesce(ofe.available, f.default_available) as enabled,
         f.default_settings || kf.settings as settings,
         kf.updated_by, kf.updated_at, kf.kitchen_id
  from dk_kitchen_features kf
  join dk_features f on f.key = kf.feature_key and f.category = 'ai'
  join dk_kitchens k on k.id = kf.kitchen_id
  left join dk_organization_features ofe on ofe.organization_id = k.organization_id and ofe.feature_key = kf.feature_key;

comment on view dk_ai_features is 'COMPATIBILIDAD (ADR 0009): vista de solo lectura sobre dk_kitchen_features. Retirar cuando no quede ninguna versión previa desplegada.';

revoke all on dk_ai_features from anon, authenticated;
grant select on dk_ai_features to authenticated;

-- ---------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------
revoke execute on function dk_feature_available(uuid, text), dk_feature_enabled(uuid, text), dk_can_use_feature(text),
  dk_feature_state(text), dk_my_features(), dk_org_feature_matrix(uuid), dk_set_org_feature(uuid, text, boolean),
  dk_set_kitchen_feature(uuid, text, boolean, jsonb), dk_guard_kitchen_feature() from public, anon;
revoke execute on function dk_feature_available(uuid, text), dk_feature_enabled(uuid, text), dk_guard_kitchen_feature() from authenticated;
grant execute on function dk_can_use_feature(text), dk_feature_state(text), dk_my_features(), dk_org_feature_matrix(uuid),
  dk_set_org_feature(uuid, text, boolean), dk_set_kitchen_feature(uuid, text, boolean, jsonb) to authenticated;

notify pgrst, 'reload schema';
