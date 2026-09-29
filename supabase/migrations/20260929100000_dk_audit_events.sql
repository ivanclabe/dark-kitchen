-- ADR 0012, sección 5: bitácora auditable (¿quién hizo qué, cuándo, dónde y
-- sobre qué?). Se EXTIENDE dk_audit_log (no hay otra tabla):
--
-- 1. Columnas semánticas: event_type, category, summary, result, source,
--    context. Un disparador BEFORE INSERT las completa según la tabla, la
--    acción y los cambios; nunca lanza (si no reconoce el caso, genérico).
-- 2. dk_audit_row guarda en las actualizaciones SOLO las columnas que
--    cambiaron, omite las actualizaciones sin cambios y el cambio de "última
--    cuenta" del usuario (ruido: 141 de 516 filas).
-- 3. Eventos que no son filas (action = 'EVENT'): ai.run_failed (disparador
--    en dk_ai_insights) y auth.signed_in (dk_log_sign_in, desde la app, con
--    tope de 1 por minuto).
-- 4. Solo agregar: sin escrituras desde la API (revocadas) y una guardia
--    contra UPDATE/DELETE/TRUNCATE salvo la retención.
-- 5. Lectura: por Cuenta con audit.view (como hoy) o por organización con el
--    permiso nuevo observability.view (incluye las filas de organización).
--    dk_org_events: filtros y paginación por cursor.
-- 6. Retención: 400 días, purga nocturna con pg_cron.

-- ---------------------------------------------------------------------------
-- Permiso de organización (el de facturación llega en la migración siguiente)
-- ---------------------------------------------------------------------------
insert into dk_permissions (key, module, action, scope, label, description, sort_order) values
  ('observability.view', 'observability', 'view', 'organization', 'Ver observabilidad y bitácora',
   'Ver cómo operan las Cuentas de la organización y la bitácora de quién hizo qué', 550);

-- ---------------------------------------------------------------------------
-- 1. Columnas
-- ---------------------------------------------------------------------------
alter table dk_audit_log drop constraint dk_audit_log_action_check;
alter table dk_audit_log add constraint dk_audit_log_action_check check (action in ('INSERT', 'UPDATE', 'DELETE', 'EVENT'));
alter table dk_audit_log
  add column event_type text,
  add column category text,
  add column summary text,
  add column result text not null default 'success' check (result in ('success', 'failure')),
  add column source text not null default 'db' check (source in ('db', 'edge', 'app')),
  add column context jsonb not null default '{}';

comment on column dk_audit_log.event_type is 'Tipo de evento (account.created, role.assigned, plan.changed, auth.signed_in…). Lo completa dk_audit_classify.';
comment on column dk_audit_log.category is 'accounts, team, roles, features, ai, billing, settings, catalog, operations, auth, integrations, other';
comment on column dk_audit_log.summary is 'Descripción legible, generada en la base.';

create index dk_audit_log_org_category_idx on dk_audit_log (organization_id, category, created_at desc);
create index dk_audit_log_actor_idx on dk_audit_log (changed_by, created_at desc);

-- ---------------------------------------------------------------------------
-- Clasificación (tabla + acción + cambios → tipo, categoría y resumen)
-- ---------------------------------------------------------------------------
create or replace function dk_audit_classify(p dk_audit_log)
returns dk_audit_log
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  -- Fila de referencia: la identificación guardada (context.ref) + los datos del cambio.
  v_row jsonb := coalesce(p.context -> 'ref', '{}') || coalesce(p.old_data, '{}') || coalesce(p.new_data, '{}');
  v_new jsonb := coalesce(p.new_data, '{}');
  v_old jsonb := coalesce(p.old_data, '{}');
  v_verb text := case p.action when 'INSERT' then 'Creó' when 'DELETE' then 'Eliminó' else 'Editó' end;
  v_kitchen text;
  v_user text;
  v_role text;
  v_label text;
  v_fields text;
begin
  -- Eventos que ya vienen clasificados (dk_log_event).
  if p.event_type is not null then
    p.category := coalesce(p.category, split_part(p.event_type, '.', 1));
    return p;
  end if;

  -- En una actualización cuenta solo lo que cambió (las filas antiguas guardaban la fila entera).
  if p.action = 'UPDATE' then
    select coalesce(jsonb_object_agg(n.key, n.value), '{}') into v_new
    from jsonb_each(coalesce(p.new_data, '{}')) n
    where n.key not in ('updated_at') and n.value is distinct from (p.old_data -> n.key);
  end if;

  select name into v_kitchen from dk_kitchens where id = coalesce(p.kitchen_id, (v_row ->> 'kitchen_id')::uuid);
  v_fields := (select string_agg(k, ', ' order by k) from jsonb_object_keys(v_new) k where k not in ('updated_at', 'updated_by'));

  case p.table_name
  when 'dk_kitchens' then
    p.category := 'accounts';
    if p.action = 'INSERT' then p.event_type := 'account.created'; p.summary := format('Creó la cuenta %s', v_row ->> 'name');
    elsif p.action = 'DELETE' then p.event_type := 'account.deleted'; p.summary := format('Eliminó la cuenta %s', v_row ->> 'name');
    elsif v_new ? 'active' then
      p.event_type := case when (v_new ->> 'active')::boolean then 'account.activated' else 'account.deactivated' end;
      p.summary := format('%s la cuenta %s', case when (v_new ->> 'active')::boolean then 'Activó' else 'Desactivó' end, coalesce(v_kitchen, 'eliminada'));
    else p.event_type := 'account.updated'; p.summary := format('Editó la cuenta %s (%s)', coalesce(v_kitchen, '—'), coalesce(v_fields, 'sin cambios'));
    end if;

  when 'dk_organizations' then
    p.category := 'settings';
    p.event_type := case p.action when 'INSERT' then 'organization.created' when 'DELETE' then 'organization.deleted' else 'organization.updated' end;
    p.summary := case p.action when 'INSERT' then format('Creó la organización %s', v_row ->> 'name')
                               else format('%s la organización (%s)', v_verb, coalesce(v_fields, '—')) end;

  when 'dk_organization_members' then
    p.category := 'team';
    select full_name into v_user from dk_users where id = (v_row ->> 'user_id')::uuid;
    if p.action = 'INSERT' then
      p.event_type := case when v_row ->> 'status' = 'pending' then 'user.invited' else 'user.added' end;
      p.summary := format('%s a %s a la organización', case when v_row ->> 'status' = 'pending' then 'Invitó' else 'Agregó' end, coalesce(v_user, 'un usuario'));
    elsif p.action = 'DELETE' then p.event_type := 'user.removed'; p.summary := format('Quitó a %s de la organización', coalesce(v_user, 'un usuario'));
    elsif v_new ? 'status' then
      p.event_type := case v_new ->> 'status' when 'active' then 'user.activated' when 'disabled' then 'user.deactivated' else 'user.status_changed' end;
      p.summary := format('%s a %s', case v_new ->> 'status' when 'active' then 'Activó' when 'disabled' then 'Desactivó' else 'Cambió el estado de' end, coalesce(v_user, 'un usuario'));
    else p.event_type := 'user.updated'; p.summary := format('Editó la membresía de %s (%s)', coalesce(v_user, 'un usuario'), coalesce(v_fields, '—'));
    end if;

  when 'dk_kitchen_members' then
    p.category := 'team';
    select full_name into v_user from dk_users where id = (v_row ->> 'user_id')::uuid;
    if p.action = 'INSERT' then p.event_type := 'account_access.granted'; p.summary := format('Dio acceso a %s a la cuenta %s', coalesce(v_user, 'un usuario'), coalesce(v_kitchen, '—'));
    elsif p.action = 'DELETE' then p.event_type := 'account_access.revoked'; p.summary := format('Quitó el acceso de %s a la cuenta %s', coalesce(v_user, 'un usuario'), coalesce(v_kitchen, '—'));
    elsif v_new ? 'active' then
      p.event_type := case when (v_new ->> 'active')::boolean then 'account_access.granted' else 'account_access.revoked' end;
      p.summary := format('%s el acceso de %s a %s', case when (v_new ->> 'active')::boolean then 'Reactivó' else 'Suspendió' end, coalesce(v_user, 'un usuario'), coalesce(v_kitchen, '—'));
    else
      select name into v_role from dk_roles where id = (v_new ->> 'default_role_id')::uuid;
      p.event_type := 'role.default_changed'; p.category := 'roles';
      p.summary := format('Cambió el rol predeterminado de %s en %s a %s', coalesce(v_user, 'un usuario'), coalesce(v_kitchen, '—'), coalesce(v_role, '—'));
    end if;

  when 'dk_member_roles' then
    p.category := 'roles';
    select full_name into v_user from dk_users where id = (v_row ->> 'user_id')::uuid;
    select name into v_role from dk_roles where id = (v_row ->> 'role_id')::uuid;
    p.event_type := case when p.action = 'DELETE' then 'role.removed' else 'role.assigned' end;
    p.summary := format('%s %s a %s en %s', case when p.action = 'DELETE' then 'Quitó el rol' else 'Asignó el rol' end, coalesce(v_role, '—'), coalesce(v_user, 'un usuario'), coalesce(v_kitchen, '—'));
    p.context := p.context || jsonb_build_object('role', v_role);

  when 'dk_roles' then
    p.category := 'roles';
    p.event_type := case p.action when 'INSERT' then 'role.created' when 'DELETE' then 'role.deleted' else 'role.updated' end;
    p.summary := format('%s el rol %s', v_verb, v_row ->> 'name');

  when 'dk_role_permissions' then
    p.category := 'roles';
    select name, organization_id into v_role, p.organization_id from dk_roles where id = (v_row ->> 'role_id')::uuid;
    p.event_type := 'role.permissions_changed';
    p.summary := format('%s el permiso %s %s el rol %s', case when p.action = 'DELETE' then 'Quitó' else 'Agregó' end, v_row ->> 'permission_key',
                        case when p.action = 'DELETE' then 'del' else 'al' end, coalesce(v_role, '—'));

  when 'dk_organization_features' then
    p.category := 'features';
    select label into v_label from dk_features where key = v_row ->> 'feature_key';
    p.event_type := 'feature.org_changed';
    p.summary := format('%s %s en la organización', case when (v_row ->> 'available')::boolean then 'Ofreció' else 'Dejó de ofrecer' end, coalesce(v_label, v_row ->> 'feature_key'));
    p.context := p.context || jsonb_build_object('feature', v_row ->> 'feature_key');

  when 'dk_kitchen_features', 'dk_ai_features' then
    select label, case when category = 'ai' then 'ai' else 'features' end into v_label, p.category from dk_features where key = v_row ->> 'feature_key';
    p.category := coalesce(p.category, 'features');
    if p.action = 'UPDATE' and not (v_new ? 'enabled') and v_new ? 'settings' then
      p.event_type := 'ai.settings_changed';
      p.summary := format('Cambió los parámetros de %s en %s', coalesce(v_label, v_row ->> 'feature_key'), coalesce(v_kitchen, '—'));
    else
      p.event_type := 'feature.account_changed';
      p.summary := format('%s %s en %s', case when coalesce((v_row ->> 'enabled')::boolean, false) then 'Activó' else 'Desactivó' end, coalesce(v_label, v_row ->> 'feature_key'), coalesce(v_kitchen, '—'));
    end if;
    p.context := p.context || jsonb_build_object('feature', v_row ->> 'feature_key');

  when 'dk_subscriptions' then
    p.category := 'billing';
    if p.action = 'INSERT' then p.event_type := 'plan.started'; p.summary := format('Inició el plan %s (%s)', v_row ->> 'plan_key', v_row ->> 'status');
    elsif v_new ? 'plan_key' then
      p.event_type := 'plan.changed'; p.summary := format('Cambió el plan de %s a %s', v_old ->> 'plan_key', v_new ->> 'plan_key');
      p.context := p.context || jsonb_build_object('from', v_old ->> 'plan_key', 'to', v_new ->> 'plan_key');
    elsif v_new ? 'status' then p.event_type := 'subscription.status_changed'; p.summary := format('La suscripción pasó de %s a %s', v_old ->> 'status', v_new ->> 'status');
    else p.event_type := 'subscription.updated'; p.summary := format('Actualizó la suscripción (%s)', coalesce(v_fields, '—'));
    end if;

  when 'dk_users' then
    p.category := 'team';
    p.event_type := case when p.action = 'INSERT' then 'user.created' when v_new ? 'platform_role' then 'platform.role_changed'
                         when v_new ?| array['full_name', 'avatar_key'] then 'profile.updated' else 'user.updated' end;
    p.summary := format('%s el usuario %s', v_verb, v_row ->> 'full_name');

  when 'dk_master_menus', 'dk_master_products', 'dk_master_menu_kitchens' then
    p.category := 'catalog';
    p.event_type := 'master_menu.' || lower(p.action);
    p.summary := format('%s %s del menú maestro', v_verb, case p.table_name when 'dk_master_menus' then 'el menú ' || coalesce(v_row ->> 'name', '')
                                                                           when 'dk_master_products' then 'el plato ' || coalesce(v_row ->> 'name', '')
                                                                           else 'el acceso de una cuenta' end);

  when 'dk_orders' then
    p.category := 'operations';
    if p.action = 'INSERT' then p.event_type := 'order.created'; p.summary := format('Creó el pedido #%s (%s)', v_row ->> 'order_number', v_row ->> 'channel');
    elsif v_new ? 'status' then
      p.event_type := case when v_new ->> 'status' = 'CANCELADO' then 'order.cancelled' else 'order.status_changed' end;
      p.summary := format('Pedido #%s: %s → %s', v_row ->> 'order_number', v_old ->> 'status', v_new ->> 'status');
    elsif p.action = 'DELETE' then p.event_type := 'order.deleted'; p.summary := format('Eliminó el pedido #%s', v_row ->> 'order_number');
    else p.event_type := 'order.updated'; p.summary := format('Editó el pedido #%s (%s)', v_row ->> 'order_number', coalesce(v_fields, '—'));
    end if;

  when 'dk_purchases' then
    p.category := 'operations';
    p.event_type := case when p.action = 'INSERT' then 'purchase.created' when v_new ->> 'status' = 'CONFIRMADA' then 'purchase.confirmed'
                         when p.action = 'DELETE' then 'purchase.deleted' else 'purchase.updated' end;
    p.summary := format('%s la compra %s', case p.event_type when 'purchase.confirmed' then 'Confirmó' else v_verb end, coalesce(v_row ->> 'invoice_number', ''));

  when 'dk_kitchen_hours', 'dk_kitchen_hour_exceptions' then
    p.category := 'settings';
    p.event_type := 'settings.hours_changed';
    p.summary := format('%s el horario de %s', v_verb, coalesce(v_kitchen, '—'));

  when 'dk_ingredients', 'dk_products', 'dk_menu_items', 'dk_menu_plan_items', 'dk_weekly_menu_items' then
    p.category := 'catalog';
    p.event_type := 'catalog.' || lower(p.action);
    p.summary := format('%s %s%s', v_verb,
      case p.table_name when 'dk_ingredients' then 'el insumo ' when 'dk_products' then 'el plato ' else 'un ítem del menú ' end,
      coalesce(v_row ->> 'name', ''));

  else
    p.category := 'other';
    p.event_type := 'record.' || lower(p.action);
    p.summary := format('%s un registro de %s', v_verb, p.table_name);
  end case;

  return p;
exception when others then
  -- La bitácora nunca debe impedir la operación que registra.
  p.category := coalesce(p.category, 'other');
  p.event_type := coalesce(p.event_type, 'record.' || lower(coalesce(p.action, 'event')));
  p.summary := coalesce(p.summary, format('Cambio en %s', p.table_name));
  return p;
end;
$$;

create or replace function dk_audit_log_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new := dk_audit_classify(new);
  return new;
end;
$$;

create trigger dk_trg_audit_log_classify before insert on dk_audit_log
  for each row execute function dk_audit_log_before_insert();

-- Reclasificar lo existente (antes de la guardia de solo agregar).
update dk_audit_log a
set event_type = c.event_type, category = c.category, summary = c.summary, context = c.context, organization_id = c.organization_id
from dk_audit_log src
cross join lateral (select (dk_audit_classify(src)).*) c
where a.id = src.id;

-- ---------------------------------------------------------------------------
-- 2. Registro compacto y sin ruido
-- ---------------------------------------------------------------------------
create or replace function dk_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_kitchen uuid;
begin
  if tg_op = 'UPDATE' then
    -- Solo lo que cambió (sin marcas de tiempo de actualización).
    select jsonb_object_agg(n.key, n.value), jsonb_object_agg(n.key, to_jsonb(old) -> n.key)
    into v_new, v_old
    from jsonb_each(to_jsonb(new)) n
    where n.key not in ('updated_at') and n.value is distinct from (to_jsonb(old) -> n.key);
    if v_new is null then return new; end if;
    -- Entrar a una Cuenta actualiza la "última cuenta" del usuario: no es un evento.
    if tg_table_name = 'dk_users' and (select array_agg(k) from jsonb_object_keys(v_new) k) <@ array['last_account_id'] then
      return new;
    end if;
  elsif tg_op = 'INSERT' then
    v_new := to_jsonb(new);
  else
    v_old := to_jsonb(old);
  end if;

  select string_agg(v_row ->> a.attname, '|' order by array_position(i.indkey::int2[], a.attnum))
  into v_key
  from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
  where i.indrelid = tg_relid and i.indisprimary;

  v_kitchen := case
    when tg_table_name = 'dk_kitchens' then (v_row ->> 'id')::uuid
    when v_row ? 'kitchen_id' then (v_row ->> 'kitchen_id')::uuid
  end;

  insert into dk_audit_log (table_name, record_id, record_key, kitchen_id, organization_id, action, old_data, new_data, changed_by, context)
  values (
    tg_table_name,
    case when v_row ? 'id' then (v_row ->> 'id')::uuid end,
    coalesce(v_key, v_row ->> 'id'),
    v_kitchen,
    case
      when tg_table_name = 'dk_organizations' then (v_row ->> 'id')::uuid
      when v_row ? 'organization_id' then (v_row ->> 'organization_id')::uuid
      when v_kitchen is not null then (select organization_id from dk_kitchens where id = v_kitchen)
    end,
    tg_op,
    v_old,
    v_new,
    dk_current_profile_id(),
    -- Identificación del registro (para describirlo aunque solo cambien otras columnas).
    case when tg_op = 'UPDATE' then jsonb_build_object('ref', (
      select jsonb_object_agg(r.key, r.value) from jsonb_each(v_row) r
      where r.key in ('id', 'name', 'full_name', 'order_number', 'user_id', 'kitchen_id', 'role_id', 'feature_key', 'permission_key',
                      'organization_id', 'plan_key', 'status', 'channel', 'invoice_number', 'active', 'enabled', 'available'))) else '{}'::jsonb end
  );
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Eventos que no son filas
-- ---------------------------------------------------------------------------
-- Interna: registra un evento ya clasificado.
create or replace function dk_log_event(p_event_type text, p_summary text, p_organization_id uuid, p_kitchen_id uuid default null,
                                        p_result text default 'success', p_source text default 'db', p_context jsonb default '{}',
                                        p_actor uuid default null, p_record_key text default null)
returns void
language sql
security definer
set search_path = public
as $$
  insert into dk_audit_log (table_name, record_key, kitchen_id, organization_id, action, changed_by, event_type, category, summary, result, source, context)
  values ('event', coalesce(p_record_key, gen_random_uuid()::text), p_kitchen_id, p_organization_id, 'EVENT',
          coalesce(p_actor, dk_current_profile_id()), p_event_type, split_part(p_event_type, '.', 1), p_summary, p_result, p_source, coalesce(p_context, '{}'));
$$;

-- Fallos de IA (los guarda la Edge Function en dk_ai_insights): a la bitácora.
create or replace function dk_audit_ai_failure()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
begin
  select label into v_label from dk_features where key = new.feature_key;
  perform dk_log_event('ai.run_failed',
    format('Falló el análisis de IA de %s: %s', coalesce(v_label, new.feature_key), left(coalesce(new.error, 'sin detalle'), 200)),
    (select organization_id from dk_kitchens where id = new.kitchen_id), new.kitchen_id, 'failure', 'edge',
    jsonb_build_object('feature', new.feature_key, 'model', new.model), new.created_by, new.id::text);
  return new;
exception when others then
  return new;
end;
$$;

create trigger dk_trg_ai_insights_audit_failure after insert on dk_ai_insights
  for each row when (new.status = 'error') execute function dk_audit_ai_failure();

-- Inicio de sesión: lo registra la app (Auth no admite disparadores propios).
-- Solo a quien llama, una fila por organización activa, como mucho 1 por minuto.
create or replace function dk_log_sign_in()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := dk_current_profile_id();
begin
  if v_user is null then return; end if;
  if exists (select 1 from dk_audit_log where changed_by = v_user and event_type = 'auth.signed_in' and created_at > now() - interval '1 minute') then
    return;
  end if;
  insert into dk_audit_log (table_name, record_key, organization_id, action, changed_by, event_type, category, summary, source)
  select 'event', v_user::text, om.organization_id, 'EVENT', v_user, 'auth.signed_in', 'auth',
         format('%s inició sesión', (select full_name from dk_users where id = v_user)), 'app'
  from dk_organization_members om
  where om.user_id = v_user and om.status = 'active';
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Solo agregar
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate on dk_audit_log from anon, authenticated;

create or replace function dk_guard_audit_log()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('dk.audit_retention', true), '') <> 'on' then
    raise exception 'La bitácora es de solo agregar: no se puede modificar ni borrar';
  end if;
  return coalesce(old, new);
end;
$$;

create trigger dk_trg_audit_log_guard before update or delete on dk_audit_log
  for each row execute function dk_guard_audit_log();
create trigger dk_trg_audit_log_guard_truncate before truncate on dk_audit_log
  for each statement execute function dk_guard_audit_log();

-- ---------------------------------------------------------------------------
-- 5. Lectura
-- ---------------------------------------------------------------------------
alter policy dk_audit_log_select on dk_audit_log using (
  (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('audit.view')))
  or (organization_id is not null and dk_has_org_permission(organization_id, 'observability.view'))
);

-- Bitácora de la organización: filtros y paginación por cursor (created_at, id).
create or replace function dk_org_events(
  p_organization_id uuid,
  p_kitchen_id uuid default null,
  p_category text default null,
  p_actor uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_search text default null,
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_rows jsonb;
begin
  if not dk_has_org_permission(p_organization_id, 'observability.view') then
    raise exception 'No autorizado para ver la bitácora de esta organización';
  end if;

  select coalesce(jsonb_agg(e order by e ->> 'createdAt' desc, e ->> 'id' desc), '[]') into v_rows
  from (
    select jsonb_build_object(
      'id', a.id, 'createdAt', a.created_at, 'eventType', a.event_type, 'category', a.category, 'summary', a.summary,
      'result', a.result, 'source', a.source, 'action', a.action, 'table', a.table_name, 'recordKey', a.record_key,
      'context', a.context,
      'actor', case when u.id is null then null else jsonb_build_object('id', u.id, 'name', u.full_name, 'avatarKey', u.avatar_key) end,
      'account', case when k.id is null then null else jsonb_build_object('id', k.id, 'name', k.name, 'iconKey', k.icon_key) end,
      'changes', case when a.action = 'UPDATE' then (
          select jsonb_object_agg(c.key, jsonb_build_object('from', a.old_data -> c.key, 'to', c.value))
          from jsonb_each(a.new_data) c) end) as e
    from dk_audit_log a
    left join dk_users u on u.id = a.changed_by
    left join dk_kitchens k on k.id = a.kitchen_id
    where a.organization_id = p_organization_id
      and (p_kitchen_id is null or a.kitchen_id = p_kitchen_id)
      and (p_category is null or a.category = p_category)
      and (p_actor is null or a.changed_by = p_actor)
      and (p_from is null or a.created_at >= p_from)
      and (p_to is null or a.created_at < p_to)
      and (p_search is null or a.summary ilike '%' || p_search || '%')
      and (p_before_at is null or (a.created_at, a.id) < (p_before_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by a.created_at desc, a.id desc
    limit v_limit + 1
  ) x;

  return jsonb_build_object(
    'events', (select coalesce(jsonb_agg(v order by ord), '[]') from jsonb_array_elements(v_rows) with ordinality t(v, ord) where ord <= v_limit),
    'hasMore', jsonb_array_length(v_rows) > v_limit);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Retención (400 días)
-- ---------------------------------------------------------------------------
create or replace function dk_purge_audit_log(p_days integer default 400)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_days < 30 then raise exception 'La retención mínima es de 30 días'; end if;
  perform set_config('dk.audit_retention', 'on', true);
  delete from dk_audit_log where created_at < now() - make_interval(days => p_days);
  get diagnostics v_count = row_count;
  perform set_config('dk.audit_retention', 'off', true);
  return v_count;
end;
$$;

create extension if not exists pg_cron;
select cron.schedule('dk-purge-audit-log', '30 8 * * *', $cron$select public.dk_purge_audit_log(400)$cron$);

revoke execute on function dk_audit_classify(dk_audit_log), dk_audit_log_before_insert(), dk_log_event(text, text, uuid, uuid, text, text, jsonb, uuid, text),
  dk_audit_ai_failure(), dk_guard_audit_log(), dk_purge_audit_log(integer), dk_log_sign_in(), dk_org_events(uuid, uuid, text, uuid, timestamptz, timestamptz, text, timestamptz, uuid, integer)
  from public, anon;
revoke execute on function dk_audit_classify(dk_audit_log), dk_audit_log_before_insert(), dk_log_event(text, text, uuid, uuid, text, text, jsonb, uuid, text),
  dk_audit_ai_failure(), dk_guard_audit_log(), dk_purge_audit_log(integer) from authenticated;
grant execute on function dk_log_sign_in(), dk_org_events(uuid, uuid, text, uuid, timestamptz, timestamptz, text, timestamptz, uuid, integer) to authenticated;

notify pgrst, 'reload schema';
