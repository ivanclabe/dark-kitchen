-- ADR 0021: one subdomain per organization ({slug}.quanela.com).
--
-- The subdomain is the organization's slug, which already exists, is unique
-- and does not follow name changes. This migration makes it a real public
-- identifier:
--   1. reserved words can never be a slug;
--   2. the slug is immutable for the organization (only the Global Admin
--      changes it, and the old one stays as an alias that redirects and that
--      no other organization can take);
--   3. dk_tenant_public(slug): the only anonymous read — exists, name, active,
--      redirect — for the login of each subdomain;
--   4. dk_ai_insights records its organization (AI usage per organization).
-- Data isolation does not change: RLS by account and membership (ADR 0007/0008).

-- ---------------------------------------------------------------------------
-- 1. Reserved subdomains
-- ---------------------------------------------------------------------------
create or replace function dk_is_reserved_slug(p_slug text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(p_slug, '')) = any (array[
    'www', 'admin', 'app', 'api', 'auth', 'login', 'logout', 'signup', 'registro', 'mail', 'email', 'smtp', 'static', 'assets', 'cdn',
    'img', 'images', 'media', 'files', 'status', 'help', 'ayuda', 'soporte', 'support', 'blog', 'docs', 'dev', 'staging', 'stage', 'test',
    'preview', 'demo', 'beta', 'cuentas', 'cuenta', 'account', 'accounts', 'quanela', 'cuanela', 'platform', 'plataforma', 'global',
    'root', 'system', 'billing', 'pagos', 'payments', 'webhook', 'webhooks', 'ws', 'socket', 'portal', 'console', 'dashboard',
    'localhost', 'internal', 'ns1', 'ns2', 'ftp', 'vpn', 'security', 'legal', 'privacy', 'terms']);
$$;

alter table dk_organizations add constraint dk_organizations_slug_not_reserved check (not dk_is_reserved_slug(slug));

-- ---------------------------------------------------------------------------
-- 2. Aliases (old slugs) and immutability
-- ---------------------------------------------------------------------------
create table dk_organization_slug_aliases (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  organization_id uuid not null references dk_organizations(id) on delete cascade,
  created_by uuid references dk_users(id),
  created_at timestamptz not null default now()
);
comment on table dk_organization_slug_aliases is 'Subdominios anteriores de una organización (ADR 0021): redirigen al actual y no se pueden reutilizar.';
alter table dk_organization_slug_aliases enable row level security;
-- No policies: only read and written by SECURITY DEFINER functions.
revoke all on dk_organization_slug_aliases from anon, authenticated;

create or replace function dk_guard_organization()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'El SUPER_ADMIN (creador de la organización) es intransferible';
  end if;
  -- ADR 0021: the slug is the subdomain. Only dk_ga_set_organization_slug changes it.
  if new.slug is distinct from old.slug and coalesce(current_setting('dk.slug_change', true), '') <> 'on' then
    raise exception 'El subdominio de la organización no se puede cambiar desde aquí';
  end if;
  if dk_is_superadmin() then
    return new;
  end if;
  if new.active is distinct from old.active and old.owner_user_id is distinct from dk_current_profile_id() then
    raise exception 'Solo el SUPER_ADMIN puede activar o desactivar la organización';
  end if;
  if new.max_accounts is distinct from old.max_accounts then
    raise exception 'El tope de Cuentas lo fija la plataforma';
  end if;
  return new;
end;
$function$;

-- New slugs skip reserved words and old subdomains of other organizations.
create or replace function dk_unique_slug(p_base text, p_table text)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_slug text := p_base;
  v_n int := 1;
  v_taken boolean;
begin
  loop
    if p_table = 'kitchens' then
      select exists (select 1 from dk_kitchens where slug = v_slug) into v_taken;
    else
      select dk_is_reserved_slug(v_slug)
          or exists (select 1 from dk_organizations where slug = v_slug)
          or exists (select 1 from dk_organization_slug_aliases where slug = v_slug)
        into v_taken;
    end if;
    exit when not v_taken;
    v_n := v_n + 1;
    v_slug := left(p_base, 55) || '-' || v_n;
  end loop;
  return v_slug;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Public resolution of a subdomain (anonymous)
-- ---------------------------------------------------------------------------
create or replace function dk_tenant_public(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_org dk_organizations;
  v_alias text;
begin
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) > 63 then
    return jsonb_build_object('exists', false);
  end if;
  select * into v_org from dk_organizations where slug = v_slug;
  if found then
    return jsonb_build_object('exists', true, 'slug', v_org.slug, 'name', v_org.name, 'active', v_org.active, 'redirectTo', null);
  end if;
  select o.slug into v_alias from dk_organization_slug_aliases a join dk_organizations o on o.id = a.organization_id where a.slug = v_slug;
  if found then
    return jsonb_build_object('exists', true, 'slug', v_slug, 'name', null, 'active', null, 'redirectTo', v_alias);
  end if;
  return jsonb_build_object('exists', false);
end;
$$;

grant execute on function dk_tenant_public(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Change a subdomain (Global Admin only, with alias)
-- ---------------------------------------------------------------------------
create or replace function dk_ga_set_organization_slug(p_organization_id uuid, p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new text := lower(btrim(coalesce(p_slug, '')));
  v_org dk_organizations;
begin
  perform dk_require_global_admin();
  select * into v_org from dk_organizations where id = p_organization_id;
  if not found then raise exception 'Organización no encontrada'; end if;
  if v_new = v_org.slug then return jsonb_build_object('slug', v_org.slug, 'changed', false); end if;
  if v_new !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_new) not between 3 and 60 then
    raise exception 'El subdominio usa minúsculas, números y guiones (3 a 60 caracteres)';
  end if;
  if dk_is_reserved_slug(v_new) then raise exception 'Ese subdominio está reservado'; end if;
  if exists (select 1 from dk_organizations where slug = v_new)
     or exists (select 1 from dk_organization_slug_aliases where slug = v_new and organization_id <> p_organization_id) then
    raise exception 'Ese subdominio ya está en uso';
  end if;

  -- The new one may be an old alias of this same organization: it stops being an alias.
  delete from dk_organization_slug_aliases where slug = v_new and organization_id = p_organization_id;
  insert into dk_organization_slug_aliases (slug, organization_id, created_by) values (v_org.slug, p_organization_id, dk_current_profile_id())
    on conflict (slug) do nothing;
  perform set_config('dk.slug_change', 'on', true);
  update dk_organizations set slug = v_new where id = p_organization_id;
  perform set_config('dk.slug_change', 'off', true);

  perform dk_log_event('global_admin.organization_slug_changed',
    format('Subdominio de %s: %s → %s', v_org.name, v_org.slug, v_new),
    p_organization_id, null, 'success', 'global_admin',
    jsonb_build_object('from', v_org.slug, 'to', v_new), null, p_organization_id::text);
  return jsonb_build_object('slug', v_new, 'previous', v_org.slug, 'changed', true);
end;
$$;

revoke execute on function dk_ga_set_organization_slug(uuid, text) from public, anon;
grant execute on function dk_ga_set_organization_slug(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. AI usage records their organization
-- ---------------------------------------------------------------------------
alter table dk_ai_insights add column organization_id uuid references dk_organizations(id) on delete cascade;

update dk_ai_insights i set organization_id = k.organization_id from dk_kitchens k where k.id = i.kitchen_id and i.organization_id is null;

create or replace function dk_ai_insight_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select organization_id into new.organization_id from dk_kitchens where id = new.kitchen_id;
  return new;
end;
$$;

create trigger dk_trg_ai_insights_organization before insert or update of kitchen_id on dk_ai_insights
  for each row execute function dk_ai_insight_organization();

create index dk_ai_insights_org_time_idx on dk_ai_insights (organization_id, created_at);

-- The portal's AI monitoring groups by it directly.
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
        join dk_ai_insights i on i.organization_id = o.id and i.created_at >= v_from and i.created_at < v_to
        group by o.id, o.name) t),
    'recent', (select coalesce(jsonb_agg(x order by x ->> 'at' desc), '[]') from (
                 select jsonb_build_object('at', i.created_at, 'feature', i.feature_key, 'status', i.status, 'account', k.name, 'organization', o.name,
                                           'user', u.full_name, 'latencyMs', i.latency_ms) x
                 from dk_ai_insights i join dk_kitchens k on k.id = i.kitchen_id join dk_organizations o on o.id = k.organization_id
                 left join dk_users u on u.id = i.created_by
                 order by i.created_at desc limit 25) t));
end;
$$;
