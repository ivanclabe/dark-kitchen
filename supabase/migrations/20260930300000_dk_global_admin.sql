-- ADR 0019: Quanela Global Admin portal (backend).
--
--   * Global Admin = dk_users.platform_role = 'SUPERADMIN' (existing source of
--     truth; several admins possible) AND a session with a second factor
--     (aal2). dk_require_global_admin() guards every portal function and,
--     from now on, every dk_platform_* function too.
--   * dk_provision_organization: the single way an organization is created
--     (organization, owner = Organization Admin, first account, subscription).
--     The public signup and the portal both use it.
--   * Portal functions dk_ga_*: read-only views over existing sources
--     (organizations, users, auth sign-ins, memberships, dk_ai_insights,
--     dk_audit_log) plus a few audited actions. No new metric tables.

-- ---------------------------------------------------------------------------
-- 0. Who is a Global Admin
-- ---------------------------------------------------------------------------
create or replace function dk_is_global_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select dk_is_superadmin() and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

create or replace function dk_require_global_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not dk_is_superadmin() then
    raise exception 'Acceso restringido a Global Admin' using errcode = '42501';
  end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'Global Admin requiere el segundo factor (MFA)' using errcode = '42501';
  end if;
end;
$$;

-- Platform functions (ADR 0014) now need the same: role + second factor.
create or replace function dk_require_platform_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform dk_require_global_admin();
end;
$$;

-- What the portal needs to decide what to show (only about the caller).
create or replace function dk_ga_me()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'email', lower(coalesce(auth.jwt() ->> 'email', '')),
    'isGlobalAdmin', dk_is_superadmin(),
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'fullName', (select full_name from dk_users where auth_user_id = auth.uid()));
$$;

-- Portal actions are recorded with their own source.
alter table dk_audit_log drop constraint dk_audit_log_source_check;
alter table dk_audit_log add constraint dk_audit_log_source_check check (source = any (array['db', 'edge', 'app', 'global_admin']));

-- ---------------------------------------------------------------------------
-- 1. One way to create an organization (public signup and portal)
-- ---------------------------------------------------------------------------
create or replace function dk_provision_organization(
  p_owner uuid,
  p_created_by uuid,
  p_name text,
  p_sector text,
  p_category text,
  p_plan dk_plans,
  p_address text default null,
  p_city text default null,
  p_country text default 'CO',
  p_phone text default null,
  p_tax_id text default null,
  p_legal_name text default null,
  p_account_name text default null,
  p_account_icon text default null
)
returns table (new_organization_id uuid, new_kitchen_id uuid, new_kitchen_slug text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_account_name text;
  v_timezone text;
  v_currency text;
  v_org uuid;
  v_kitchen uuid;
  v_slug text;
  v_constraint text;
begin
  if char_length(v_name) not between 2 and 80 then raise exception 'El nombre del negocio debe tener entre 2 y 80 caracteres'; end if;
  v_account_name := btrim(coalesce(nullif(btrim(p_account_name), ''), v_name));
  if char_length(v_account_name) not between 2 and 80 then raise exception 'El nombre de la cuenta debe tener entre 2 y 80 caracteres'; end if;

  v_timezone := case upper(coalesce(p_country, 'CO'))
    when 'MX' then 'America/Mexico_City' when 'PE' then 'America/Lima' when 'EC' then 'America/Guayaquil'
    when 'CL' then 'America/Santiago' when 'AR' then 'America/Argentina/Buenos_Aires' when 'PA' then 'America/Panama'
    when 'VE' then 'America/Caracas' when 'US' then 'America/New_York' when 'ES' then 'Europe/Madrid'
    else 'America/Bogota' end;
  v_currency := case upper(coalesce(p_country, 'CO'))
    when 'MX' then 'MXN' when 'PE' then 'PEN' when 'CL' then 'CLP' when 'AR' then 'ARS' when 'ES' then 'EUR'
    when 'EC' then 'USD' when 'PA' then 'USD' when 'VE' then 'USD' when 'US' then 'USD'
    else 'COP' end;

  -- The organization (triggers make the owner its active SUPER_ADMIN and create the subscription)…
  insert into dk_organizations (slug, name, address, city, country, sector, category, legal_name, tax_id, phone,
                                currency, default_timezone, owner_user_id, created_by)
  values (dk_unique_slug(dk_slugify(v_name), 'organizations'), v_name, nullif(btrim(p_address), ''), nullif(btrim(p_city), ''),
          upper(coalesce(p_country, 'CO')), nullif(p_sector, ''), nullif(p_category, ''), nullif(btrim(p_legal_name), ''),
          nullif(btrim(p_tax_id), ''), nullif(btrim(p_phone), ''), v_currency, v_timezone, p_owner, p_created_by)
  returning id into v_org;

  -- …with its plan (free trial if the plan has one)…
  update dk_subscriptions
  set plan_key = p_plan.key,
      status = case when p_plan.trial_days > 0 then 'trialing' else 'active' end,
      billing_period = 'monthly',
      started_at = now(),
      current_period_start = now(),
      trial_ends_at = case when p_plan.trial_days > 0 then now() + make_interval(days => p_plan.trial_days) end,
      current_period_end = case when p_plan.trial_days > 0 then now() + make_interval(days => p_plan.trial_days) else now() + interval '1 month' end
  where organization_id = v_org;

  -- …and its first account, where the owner is also ADMIN (ADR 0009) whoever creates it.
  v_slug := dk_unique_slug(dk_slugify(v_account_name), 'kitchens');
  v_kitchen := dk_create_kitchen(v_account_name, v_slug, v_timezone, v_currency, v_org, p_account_icon);
  update dk_kitchens
  set address = nullif(btrim(p_address), ''), phone = nullif(btrim(p_phone), ''),
      legal_name = nullif(btrim(p_legal_name), ''), tax_id = nullif(btrim(p_tax_id), '')
  where id = v_kitchen;
  perform set_config('dk.assignment_bypass', 'on', true);
  insert into dk_kitchen_members (kitchen_id, user_id, default_role_id, active, invited_by)
  values (v_kitchen, p_owner, (select id from dk_roles where is_system and key = 'ADMIN'), true, p_created_by)
  on conflict (kitchen_id, user_id) do nothing;
  perform set_config('dk.assignment_bypass', 'off', true);
  update dk_users set last_account_id = v_kitchen where id = p_owner and last_account_id is null;

  return query select v_org, v_kitchen, v_slug;
exception when check_violation then
  get stacked diagnostics v_constraint = constraint_name;
  if v_constraint = 'dk_kitchens_icon_key_check' then
    raise exception 'El icono de la cuenta no es válido';
  end if;
  raise exception 'Revisa el sector y la categoría del negocio';
end;
$$;

revoke execute on function dk_provision_organization(uuid, uuid, text, text, text, dk_plans, text, text, text, text, text, text, text, text) from public, anon, authenticated;

-- Public signup: same checks as before; the creation itself is shared.
create or replace function dk_create_organization(
  p_name text,
  p_sector text,
  p_category text,
  p_address text default null,
  p_city text default null,
  p_country text default 'CO',
  p_phone text default null,
  p_tax_id text default null,
  p_legal_name text default null,
  p_full_name text default null,
  p_plan text default null,
  p_account_name text default null,
  p_account_icon text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth auth.users;
  v_profile uuid;
  v_slug text;
  v_full_name text;
  v_plan dk_plans;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para crear tu negocio'; end if;
  select * into v_auth from auth.users where id = auth.uid();
  if v_auth.email_confirmed_at is null then
    raise exception 'Confirma tu correo antes de crear tu negocio';
  end if;

  select id into v_profile from dk_users where auth_user_id = auth.uid();

  -- Idempotent: someone who already owns an organization goes back to its first account.
  if v_profile is not null then
    select k.slug into v_slug
    from dk_organizations o join dk_kitchens k on k.organization_id = o.id
    where o.owner_user_id = v_profile
    order by k.created_at limit 1;
    if v_slug is not null then return v_slug; end if;
    if exists (select 1 from dk_organizations where owner_user_id = v_profile) then
      raise exception 'Ya eres dueño de una organización';
    end if;
  end if;

  -- The plan comes from the signup (editable metadata): validated here.
  select * into v_plan from dk_plans where key = p_plan and status = 'public' and self_serve;
  if not found then
    raise exception 'PLAN_NOT_AVAILABLE: el plan elegido no está disponible; elige otro plan';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 80 then raise exception 'El nombre del negocio debe tener entre 2 y 80 caracteres'; end if;

  v_full_name := btrim(coalesce(nullif(btrim(p_full_name), ''), v_auth.raw_user_meta_data ->> 'full_name', split_part(v_auth.email, '@', 1)));
  if char_length(v_full_name) < 2 then v_full_name := split_part(v_auth.email, '@', 1); end if;
  if v_profile is null then
    insert into dk_users (auth_user_id, full_name, active) values (auth.uid(), left(v_full_name, 80), true) returning id into v_profile;
  end if;

  select p.new_kitchen_slug into v_slug
  from dk_provision_organization(v_profile, v_profile, p_name, p_sector, p_category, v_plan, p_address, p_city, p_country,
                                 p_phone, p_tax_id, p_legal_name, p_account_name, p_account_icon) p;
  return v_slug;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Creating an organization from the portal
-- ---------------------------------------------------------------------------
create or replace function dk_ga_normalize(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(lower(translate(coalesce(p, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '[^a-z0-9]+', '', 'g');
$$;

-- Before creating: is the e-mail valid, does the person exist, are there similar organizations?
create or replace function dk_ga_check_new_organization(p_name text, p_email text, p_tax_id text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_profile dk_users;
  v_auth uuid;
  v_owns text;
begin
  perform dk_require_global_admin();
  select * into v_profile from dk_users where lower(email) = v_email limit 1;
  select id into v_auth from auth.users where lower(email) = v_email limit 1;
  select o.name into v_owns from dk_organizations o where o.owner_user_id = v_profile.id limit 1;
  return jsonb_build_object(
    'emailValid', v_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$',
    'user', jsonb_build_object(
      'exists', v_profile.id is not null or v_auth is not null,
      'hasLogin', v_auth is not null,
      'fullName', v_profile.full_name,
      'active', coalesce(v_profile.active, true),
      'ownsOrganization', v_owns),
    'similarOrganizations', (
      select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug, 'taxId', o.tax_id, 'active', o.active) order by o.name), '[]')
      from dk_organizations o
      where (char_length(dk_ga_normalize(p_name)) >= 3 and dk_ga_normalize(o.name) = dk_ga_normalize(p_name))
         or (nullif(btrim(coalesce(p_tax_id, '')), '') is not null and dk_ga_normalize(o.tax_id) = dk_ga_normalize(p_tax_id))));
end;
$$;

create or replace function dk_ga_create_organization(
  p_name text,
  p_sector text,
  p_category text,
  p_admin_name text,
  p_admin_email text,
  p_plan text,
  p_country text default 'CO',
  p_city text default null,
  p_phone text default null,
  p_tax_id text default null,
  p_confirm_similar boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_check jsonb;
  v_email text := lower(btrim(coalesce(p_admin_email, '')));
  v_admin_name text := btrim(coalesce(p_admin_name, ''));
  v_me uuid := dk_current_profile_id();
  v_plan dk_plans;
  v_owner uuid;
  v_auth uuid;
  v_existing boolean := false;
  v_result record;
  v_token text;
begin
  perform dk_require_global_admin();
  v_check := dk_ga_check_new_organization(p_name, v_email, p_tax_id);
  if not (v_check ->> 'emailValid')::boolean then raise exception 'El correo del administrador no es válido'; end if;
  if char_length(v_admin_name) not between 2 and 80 then raise exception 'El nombre del administrador debe tener entre 2 y 80 caracteres'; end if;
  if v_check -> 'user' ->> 'ownsOrganization' is not null then
    raise exception 'Ese correo ya administra la organización «%»: una persona solo crea una organización', v_check -> 'user' ->> 'ownsOrganization';
  end if;
  if not coalesce((v_check -> 'user' ->> 'active')::boolean, true) then
    raise exception 'Ese usuario está desactivado en Quanela';
  end if;
  if jsonb_array_length(v_check -> 'similarOrganizations') > 0 and not coalesce(p_confirm_similar, false) then
    raise exception 'SIMILAR_ORGANIZATION: ya existe una organización con ese nombre o NIT';
  end if;
  select * into v_plan from dk_plans where key = p_plan;
  if not found then raise exception 'Plan desconocido: %', p_plan; end if;

  -- The Organization Admin: their existing profile, the login they already have, or a new pending profile.
  select id into v_owner from dk_users where lower(email) = v_email limit 1;
  if v_owner is not null then
    v_existing := true;
  else
    select id into v_auth from auth.users where lower(email) = v_email limit 1;
    insert into dk_users (auth_user_id, full_name, email, active) values (v_auth, left(v_admin_name, 80), v_email, true) returning id into v_owner;
    v_existing := v_auth is not null;
  end if;

  select * into v_result
  from dk_provision_organization(v_owner, v_me, p_name, p_sector, p_category, v_plan, null, p_city, p_country, p_phone, p_tax_id, null, null, null);

  -- Secure activation: a one-time token (only its hash is stored), 7 days.
  v_token := dk_new_activation(v_result.new_organization_id, v_owner);

  perform dk_log_event('global_admin.organization_created',
    format('Global Admin creó la organización «%s» con %s como administrador', btrim(p_name), v_email),
    v_result.new_organization_id, v_result.new_kitchen_id, 'success', 'global_admin',
    jsonb_build_object('plan', v_plan.key, 'adminEmail', v_email, 'adminExisting', v_existing), v_me, v_result.new_organization_id::text);

  return jsonb_build_object(
    'organizationId', v_result.new_organization_id,
    'organizationSlug', (select slug from dk_organizations where id = v_result.new_organization_id),
    'accountSlug', v_result.new_kitchen_slug,
    'adminProfileId', v_owner,
    'adminEmail', v_email,
    'adminName', (select full_name from dk_users where id = v_owner),
    'adminHasLogin', exists (select 1 from dk_users where id = v_owner and auth_user_id is not null),
    'plan', v_plan.name,
    'status', 'pending_activation',
    'createdAt', (select created_at from dk_organizations where id = v_result.new_organization_id),
    'token', v_token);
end;
$$;

-- The portal (Edge Function) reports whether the e-mail went out.
create or replace function dk_ga_log_invitation(p_organization_id uuid, p_email text, p_sent boolean, p_detail text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform dk_require_global_admin();
  perform dk_log_event(case when p_sent then 'user.invited' else 'user.invitation_failed' end,
    case when p_sent then format('Invitación enviada a %s', lower(p_email)) else format('No se pudo enviar la invitación a %s', lower(p_email)) end,
    p_organization_id, null, case when p_sent then 'success' else 'failure' end, 'global_admin',
    jsonb_build_object('email', lower(p_email), 'detail', left(coalesce(p_detail, ''), 300)), null, p_organization_id::text);
end;
$$;

create or replace function dk_ga_resend_invitation(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner dk_users;
begin
  perform dk_require_global_admin();
  select u.* into v_owner from dk_organizations o join dk_users u on u.id = o.owner_user_id where o.id = p_organization_id;
  if not found then raise exception 'Organización no encontrada'; end if;
  if exists (select 1 from dk_user_activations where organization_id = p_organization_id and user_id = v_owner.id and used_at is not null)
     and v_owner.auth_user_id is not null then
    raise exception 'El administrador ya activó su cuenta';
  end if;
  return jsonb_build_object('token', dk_new_activation(p_organization_id, v_owner.id), 'email', v_owner.email, 'name', v_owner.full_name);
end;
$$;

create or replace function dk_ga_set_organization_active(p_organization_id uuid, p_active boolean, p_confirm_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org dk_organizations;
begin
  perform dk_require_global_admin();
  select * into v_org from dk_organizations where id = p_organization_id;
  if not found then raise exception 'Organización no encontrada'; end if;
  if not p_active and btrim(coalesce(p_confirm_name, '')) <> v_org.name then
    raise exception 'Para desactivar, escribe el nombre exacto de la organización';
  end if;
  update dk_organizations set active = p_active where id = p_organization_id;
  perform dk_log_event(case when p_active then 'global_admin.organization_reactivated' else 'global_admin.organization_deactivated' end,
    format('Global Admin %s la organización «%s»', case when p_active then 'reactivó' else 'desactivó' end, v_org.name),
    p_organization_id, null, 'success', 'global_admin', '{}', null, p_organization_id::text);
end;
$$;

-- Grant or remove the Global Admin role (never to oneself). UI comes later (ADR 0019, D6).
create or replace function dk_ga_set_global_admin(p_email text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target dk_users;
begin
  perform dk_require_global_admin();
  select * into v_target from dk_users where lower(email) = lower(btrim(p_email)) and auth_user_id is not null;
  if not found then raise exception 'Ese correo no tiene un usuario activo en Quanela'; end if;
  if v_target.auth_user_id = auth.uid() then raise exception 'No puedes cambiar tu propio acceso'; end if;
  update dk_users set platform_role = case when p_on then 'SUPERADMIN' else null end where id = v_target.id;
  perform dk_log_event('global_admin.role_changed',
    format('%s %s como Global Admin', v_target.email, case when p_on then 'agregado' else 'quitado' end),
    null, null, 'success', 'global_admin', jsonb_build_object('email', v_target.email, 'on', p_on), null, v_target.id::text);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Reading: dashboard, organizations, users, AI, activity
-- ---------------------------------------------------------------------------
create index if not exists dk_audit_log_created_at_idx on dk_audit_log (created_at desc);
create index if not exists dk_ai_insights_created_at_idx on dk_ai_insights (created_at desc);

-- Last sign-in of each profile (from Supabase Auth).
create or replace function dk_ga_last_sign_in(p_user uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select au.last_sign_in_at from dk_users u join auth.users au on au.id = u.auth_user_id where u.id = p_user;
$$;

create or replace function dk_ga_overview(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := coalesce(p_from, now() - interval '30 days');
  v_to timestamptz := coalesce(p_to, now());
begin
  perform dk_require_global_admin();
  return jsonb_build_object(
    'range', jsonb_build_object('from', v_from, 'to', v_to),
    'organizations', (select jsonb_build_object(
        'total', count(*), 'active', count(*) filter (where active), 'inactive', count(*) filter (where not active),
        'new', count(*) filter (where created_at >= v_from and created_at < v_to))
      from dk_organizations),
    'users', (select jsonb_build_object(
        'total', count(*),
        'active30d', count(*) filter (where au.last_sign_in_at >= now() - interval '30 days'),
        'pending', count(*) filter (where u.auth_user_id is null),
        'new', count(*) filter (where u.created_at >= v_from and u.created_at < v_to))
      from dk_users u left join auth.users au on au.id = u.auth_user_id
      where u.active),
    'ai', jsonb_build_object(
      'organizationsWithAi', (select count(distinct ofe.organization_id) from dk_organization_features ofe join dk_features f on f.key = ofe.feature_key
                              where f.category = 'ai' and f.active and ofe.available and dk_plan_includes(ofe.organization_id, f.key)),
      'organizationsUsingAi', (select count(distinct k.organization_id) from dk_ai_insights i join dk_kitchens k on k.id = i.kitchen_id
                               where i.created_at >= v_from and i.created_at < v_to),
      'featuresActive', (select count(*) from dk_features where category = 'ai' and active),
      'featuresTotal', (select count(*) from dk_features where category = 'ai'),
      'runs', (select count(*) from dk_ai_insights where created_at >= v_from and created_at < v_to),
      'errors', (select count(*) from dk_ai_insights where status = 'error' and created_at >= v_from and created_at < v_to)),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'day', d::date,
          'organizations', (select count(*) from dk_organizations where created_at::date = d::date),
          'users', (select count(*) from dk_users where created_at::date = d::date),
          'aiRuns', (select count(*) from dk_ai_insights where created_at::date = d::date)) order by d), '[]')
      from generate_series(date_trunc('day', v_from), date_trunc('day', v_to), interval '1 day') d),
    'recentActivity', (
      select coalesce(jsonb_agg(e order by e ->> 'at' desc), '[]') from (
        select jsonb_build_object('at', a.created_at, 'type', a.event_type, 'category', a.category, 'summary', a.summary, 'result', a.result,
                                  'organization', o.name, 'actor', u.full_name) e
        from dk_audit_log a left join dk_organizations o on o.id = a.organization_id left join dk_users u on u.id = a.changed_by
        where a.event_type is not null and a.event_type not in ('order.updated', 'catalog.update', 'user.updated')
        order by a.created_at desc limit 12) x),
    'alerts', jsonb_build_object(
      'aiErrors24h', (select count(*) from dk_ai_insights where status = 'error' and created_at >= now() - interval '24 hours'),
      'expiredInvitations', (select count(*) from dk_user_activations a join dk_users u on u.id = a.user_id
                             where a.used_at is null and a.revoked_at is null and a.expires_at < now() and u.auth_user_id is null),
      'inactiveOrganizations30d', (select count(*) from dk_organizations o where o.active and not exists (
                                     select 1 from dk_audit_log a where a.organization_id = o.id and a.created_at >= now() - interval '30 days')),
      'trialsEndingSoon', (select count(*) from dk_subscriptions where status = 'trialing' and trial_ends_at between now() and now() + interval '7 days'),
      'deactivatedOrganizations', (select count(*) from dk_organizations where not active)));
end;
$$;

create or replace function dk_ga_organizations()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform dk_require_global_admin();
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'name', o.name, 'slug', o.slug, 'active', o.active, 'createdAt', o.created_at,
        'country', o.country, 'city', o.city, 'sector', o.sector, 'category', o.category, 'taxId', o.tax_id,
        'plan', jsonb_build_object('key', s.plan_key, 'name', p.name, 'status', s.status, 'trialEndsAt', s.trial_ends_at),
        'admin', jsonb_build_object('id', ow.id, 'name', ow.full_name, 'email', ow.email, 'activated', ow.auth_user_id is not null),
        'accounts', (select count(*) from dk_kitchens k where k.organization_id = o.id),
        'users', (select count(*) from dk_organization_members m where m.organization_id = o.id),
        'pendingUsers', (select count(*) from dk_organization_members m where m.organization_id = o.id and m.status = 'pending'),
        'lastActivityAt', (select max(a.created_at) from dk_audit_log a where a.organization_id = o.id),
        'featuresOffered', (select coalesce(jsonb_agg(f.key order by f.sort_order), '[]') from dk_features f
                            where f.active and dk_feature_available(o.id, f.key)),
        'aiFeatures', (select coalesce(jsonb_agg(f.key order by f.sort_order), '[]') from dk_features f
                       where f.category = 'ai' and f.active and dk_feature_available(o.id, f.key)),
        'aiRuns30d', (select count(*) from dk_ai_insights i join dk_kitchens k on k.id = i.kitchen_id
                      where k.organization_id = o.id and i.created_at >= now() - interval '30 days'))
      order by o.created_at desc), '[]')
    from dk_organizations o
    left join dk_subscriptions s on s.organization_id = o.id
    left join dk_plans p on p.key = s.plan_key
    left join dk_users ow on ow.id = o.owner_user_id);
end;
$$;

create or replace function dk_ga_organization_detail(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_summary jsonb;
begin
  perform dk_require_global_admin();
  select e into v_summary from jsonb_array_elements(dk_ga_organizations()) e where (e ->> 'id')::uuid = p_organization_id;
  if v_summary is null then raise exception 'Organización no encontrada'; end if;
  return v_summary || jsonb_build_object(
    'accountList', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'slug', k.slug, 'active', k.active, 'createdAt', k.created_at,
                                                                 'iconKey', k.icon_key) order by k.created_at), '[]')
                    from dk_kitchens k where k.organization_id = p_organization_id),
    'userList', (select coalesce(jsonb_agg(jsonb_build_object(
                     'id', u.id, 'name', u.full_name, 'email', u.email, 'status', m.status, 'isOrganizationAdmin', m.is_super_admin,
                     'activeProfile', u.active, 'createdAt', m.created_at, 'lastSignInAt', dk_ga_last_sign_in(u.id),
                     'roles', (select coalesce(jsonb_agg(distinct r.name), '[]') from dk_member_roles mr join dk_roles r on r.id = mr.role_id
                               join dk_kitchens k on k.id = mr.kitchen_id where mr.user_id = u.id and k.organization_id = p_organization_id))
                   order by m.is_super_admin desc, u.full_name), '[]')
                 from dk_organization_members m join dk_users u on u.id = m.user_id where m.organization_id = p_organization_id),
    'invitation', (select jsonb_build_object('createdAt', a.created_at, 'expiresAt', a.expires_at, 'usedAt', a.used_at, 'revokedAt', a.revoked_at)
                   from dk_user_activations a join dk_organizations o on o.id = a.organization_id and a.user_id = o.owner_user_id
                   where a.organization_id = p_organization_id order by a.created_at desc limit 1),
    'configuration', (select coalesce(jsonb_agg(jsonb_build_object(
                          'key', f.key, 'label', f.label, 'category', f.category, 'available', dk_feature_available(p_organization_id, f.key),
                          'includedInPlan', dk_plan_includes(p_organization_id, f.key), 'settings', dk_feature_inherited_settings(p_organization_id, f.key),
                          'accountsEnabled', (select count(*) from dk_kitchens k left join dk_kitchen_features kf on kf.kitchen_id = k.id and kf.feature_key = f.key
                                              where k.organization_id = p_organization_id and coalesce(kf.enabled, f.default_enabled)))
                        order by f.sort_order), '[]') from dk_features f),
    'activity', (select coalesce(jsonb_agg(x order by x ->> 'at' desc), '[]') from (
                   select jsonb_build_object('at', a.created_at, 'type', a.event_type, 'category', a.category, 'summary', a.summary, 'result', a.result,
                                             'actor', u.full_name, 'account', k.name) x
                   from dk_audit_log a left join dk_users u on u.id = a.changed_by left join dk_kitchens k on k.id = a.kitchen_id
                   where a.organization_id = p_organization_id and a.event_type is not null
                   order by a.created_at desc limit 40) t));
end;
$$;

create or replace function dk_ga_users()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform dk_require_global_admin();
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id, 'name', u.full_name, 'email', u.email, 'createdAt', u.created_at, 'avatarKey', u.avatar_key,
        'status', case when not u.active then 'disabled' when u.auth_user_id is null then 'pending' else 'active' end,
        'globalAdmin', u.platform_role = 'SUPERADMIN',
        'lastSignInAt', au.last_sign_in_at,
        'organizations', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'isOrganizationAdmin', m.is_super_admin, 'status', m.status)
                                                    order by o.name), '[]')
                          from dk_organization_members m join dk_organizations o on o.id = m.organization_id where m.user_id = u.id),
        'roles', (select coalesce(jsonb_agg(distinct r.name), '[]') from dk_member_roles mr join dk_roles r on r.id = mr.role_id where mr.user_id = u.id),
        'aiFeaturesUsed', (select coalesce(jsonb_agg(distinct i.feature_key), '[]') from dk_ai_insights i where i.created_by = u.id),
        'aiRuns30d', (select count(*) from dk_ai_insights i where i.created_by = u.id and i.created_at >= now() - interval '30 days'))
      order by u.created_at desc), '[]')
    from dk_users u left join auth.users au on au.id = u.auth_user_id);
end;
$$;

create or replace function dk_ga_user_detail(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_summary jsonb;
begin
  perform dk_require_global_admin();
  select e into v_summary from jsonb_array_elements(dk_ga_users()) e where (e ->> 'id')::uuid = p_user_id;
  if v_summary is null then raise exception 'Usuario no encontrado'; end if;
  return v_summary || jsonb_build_object(
    'accounts', (select coalesce(jsonb_agg(jsonb_build_object('name', k.name, 'organization', o.name, 'active', km.active,
                                                              'role', (select name from dk_roles where id = km.default_role_id)) order by o.name, k.name), '[]')
                 from dk_kitchen_members km join dk_kitchens k on k.id = km.kitchen_id join dk_organizations o on o.id = k.organization_id
                 where km.user_id = p_user_id),
    'activity', (select coalesce(jsonb_agg(x order by x ->> 'at' desc), '[]') from (
                   select jsonb_build_object('at', a.created_at, 'type', a.event_type, 'category', a.category, 'summary', a.summary,
                                             'result', a.result, 'organization', o.name) x
                   from dk_audit_log a left join dk_organizations o on o.id = a.organization_id
                   where a.changed_by = p_user_id and a.event_type is not null
                   order by a.created_at desc limit 40) t));
end;
$$;

create or replace function dk_ga_ai_monitoring(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := coalesce(p_from, now() - interval '30 days');
  v_to timestamptz := coalesce(p_to, now());
begin
  perform dk_require_global_admin();
  return jsonb_build_object(
    'range', jsonb_build_object('from', v_from, 'to', v_to),
    'features', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'key', f.key, 'label', f.label, 'category', f.category, 'usesModel', f.uses_model, 'platformActive', f.active,
          -- Voice runs on each device and is not recorded: no usage numbers for it (shown as not available).
          'tracked', f.category = 'ai',
          'organizationsOffering', (select count(*) from dk_organizations o where dk_feature_available(o.id, f.key)),
          'accountsEnabled', (select count(*) from dk_kitchens k join dk_organizations o on o.id = k.organization_id
                              left join dk_kitchen_features kf on kf.kitchen_id = k.id and kf.feature_key = f.key
                              where dk_feature_available(o.id, f.key) and coalesce(kf.enabled, f.default_enabled)),
          'runs', (select count(*) from dk_ai_insights i where i.feature_key = f.key and i.created_at >= v_from and i.created_at < v_to),
          'errors', (select count(*) from dk_ai_insights i where i.feature_key = f.key and i.status = 'error' and i.created_at >= v_from and i.created_at < v_to),
          'users', (select count(distinct i.created_by) from dk_ai_insights i where i.feature_key = f.key and i.created_at >= v_from and i.created_at < v_to),
          'organizationsUsing', (select count(distinct k.organization_id) from dk_ai_insights i join dk_kitchens k on k.id = i.kitchen_id
                                 where i.feature_key = f.key and i.created_at >= v_from and i.created_at < v_to),
          'avgLatencyMs', (select round(avg(i.latency_ms)) from dk_ai_insights i where i.feature_key = f.key and i.created_at >= v_from and i.created_at < v_to),
          'tokens', (select coalesce(sum(coalesce(i.input_tokens, 0) + coalesce(i.output_tokens, 0)), 0) from dk_ai_insights i
                     where i.feature_key = f.key and i.created_at >= v_from and i.created_at < v_to),
          'lastRunAt', (select max(i.created_at) from dk_ai_insights i where i.feature_key = f.key))
        order by f.sort_order), '[]')
      from dk_features f where f.category in ('ai', 'voice')),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d::date,
          'runs', (select count(*) from dk_ai_insights where created_at::date = d::date),
          'errors', (select count(*) from dk_ai_insights where status = 'error' and created_at::date = d::date)) order by d), '[]')
      from generate_series(date_trunc('day', v_from), date_trunc('day', v_to), interval '1 day') d),
    'byOrganization', (
      select coalesce(jsonb_agg(x order by (x ->> 'runs')::int desc), '[]') from (
        select jsonb_build_object('id', o.id, 'name', o.name, 'runs', count(i.id), 'errors', count(i.id) filter (where i.status = 'error'),
                                  'users', count(distinct i.created_by), 'features', coalesce(jsonb_agg(distinct i.feature_key) filter (where i.id is not null), '[]')) x
        from dk_organizations o
        join dk_kitchens k on k.organization_id = o.id
        join dk_ai_insights i on i.kitchen_id = k.id and i.created_at >= v_from and i.created_at < v_to
        group by o.id, o.name) t),
    'recent', (select coalesce(jsonb_agg(x order by x ->> 'at' desc), '[]') from (
                 select jsonb_build_object('at', i.created_at, 'feature', i.feature_key, 'status', i.status, 'account', k.name, 'organization', o.name,
                                           'user', u.full_name, 'latencyMs', i.latency_ms) x
                 from dk_ai_insights i join dk_kitchens k on k.id = i.kitchen_id join dk_organizations o on o.id = k.organization_id
                 left join dk_users u on u.id = i.created_by
                 order by i.created_at desc limit 25) t));
end;
$$;

create or replace function dk_ga_activity(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_organization_id uuid default null,
  p_user_id uuid default null,
  p_category text default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  perform dk_require_global_admin();
  return jsonb_build_object(
    'categories', (select coalesce(jsonb_agg(distinct category order by category), '[]') from dk_audit_log where category is not null),
    'items', (select coalesce(jsonb_agg(x order by (x ->> 'at') desc), '[]') from (
      select jsonb_build_object('id', a.id, 'at', a.created_at, 'type', a.event_type, 'category', a.category, 'summary', a.summary,
                                'result', a.result, 'source', a.source,
                                'organization', case when o.id is null then null else jsonb_build_object('id', o.id, 'name', o.name) end,
                                'account', k.name,
                                'actor', case when u.id is null then null else jsonb_build_object('id', u.id, 'name', u.full_name, 'email', u.email) end) x
      from dk_audit_log a
      left join dk_organizations o on o.id = a.organization_id
      left join dk_kitchens k on k.id = a.kitchen_id
      left join dk_users u on u.id = a.changed_by
      where a.event_type is not null
        and (p_from is null or a.created_at >= p_from)
        and (p_to is null or a.created_at < p_to)
        and (p_organization_id is null or a.organization_id = p_organization_id)
        and (p_user_id is null or a.changed_by = p_user_id)
        and (p_category is null or a.category = p_category)
        and (p_search is null or a.summary ilike '%' || p_search || '%')
      order by a.created_at desc
      limit v_limit offset greatest(coalesce(p_offset, 0), 0)) t));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Grants: nothing for anonymous users; every function checks the caller
-- ---------------------------------------------------------------------------
revoke execute on function dk_is_global_admin(), dk_require_global_admin(), dk_ga_last_sign_in(uuid), dk_ga_normalize(text) from public, anon;
revoke execute on function dk_ga_last_sign_in(uuid) from authenticated;
revoke execute on function
  dk_ga_me(), dk_ga_check_new_organization(text, text, text),
  dk_ga_create_organization(text, text, text, text, text, text, text, text, text, text, boolean),
  dk_ga_log_invitation(uuid, text, boolean, text), dk_ga_resend_invitation(uuid), dk_ga_set_organization_active(uuid, boolean, text),
  dk_ga_set_global_admin(text, boolean), dk_ga_overview(timestamptz, timestamptz), dk_ga_organizations(), dk_ga_organization_detail(uuid),
  dk_ga_users(), dk_ga_user_detail(uuid), dk_ga_ai_monitoring(timestamptz, timestamptz),
  dk_ga_activity(timestamptz, timestamptz, uuid, uuid, text, text, integer, integer)
from public, anon;
grant execute on function
  dk_ga_me(), dk_ga_check_new_organization(text, text, text),
  dk_ga_create_organization(text, text, text, text, text, text, text, text, text, text, boolean),
  dk_ga_log_invitation(uuid, text, boolean, text), dk_ga_resend_invitation(uuid), dk_ga_set_organization_active(uuid, boolean, text),
  dk_ga_set_global_admin(text, boolean), dk_ga_overview(timestamptz, timestamptz), dk_ga_organizations(), dk_ga_organization_detail(uuid),
  dk_ga_users(), dk_ga_user_detail(uuid), dk_ga_ai_monitoring(timestamptz, timestamptz),
  dk_ga_activity(timestamptz, timestamptz, uuid, uuid, text, text, integer, integer)
to authenticated;

notify pgrst, 'reload schema';
