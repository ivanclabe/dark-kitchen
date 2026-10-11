-- ADR 0054 — Diseñador de menú con IA y «Mis diseños».
-- A history of designs per business (dk_menu_designs), separate from the draft
-- (web_theme_draft) and from what is published (web_theme, ADR 0053). The AI
-- only ever writes here; the draft changes when the owner uses a design, and
-- the public page only when the owner publishes. Orders are not touched.

-- ---------------------------------------------------------------------------
-- 1. The AI function in the catalog (ADR 0014): model, quota and switches as any other
-- ---------------------------------------------------------------------------
insert into dk_features (key, category, label, description, uses_model, model_key, use_permission, manage_permission,
                         default_available, default_enabled, active, min_interval_seconds, settings_schema, default_settings, depends_on, sort_order)
values ('menu_designer', 'ai', 'Diseñador de menú con IA',
        'Propone diseños para el menú público a partir de lo que escribes («una carta elegante con fondo negro y detalles dorados») y los ajusta cuando le pides cambios. Nunca publica sola.',
        true, 'claude-sonnet-5-5', 'storefront.manage', 'ai.manage', true, true, true, 5, '{}'::jsonb, '{}'::jsonb, '{}', 16)
on conflict (key) do nothing;

insert into dk_plan_features (plan_key, feature_key)
select distinct pf.plan_key, 'menu_designer' from dk_plan_features pf where pf.feature_key = 'invoice_import'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. «Mis diseños»
-- ---------------------------------------------------------------------------
create table dk_menu_designs (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default dk_current_kitchen_id() references dk_kitchens (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  design jsonb not null,
  -- ai: proposed by the designer; editor: saved from the visual editor;
  -- published: recorded when it went live; draft_backup: a draft kept before it was replaced.
  source text not null check (source in ('ai', 'editor', 'published', 'draft_backup')),
  prompt text check (prompt is null or char_length(prompt) <= 500),
  summary text check (summary is null or char_length(summary) <= 240),
  parent_id uuid references dk_menu_designs (id) on delete set null,
  ai_run_id uuid references dk_ai_insights (id) on delete set null,
  favorite boolean not null default false,
  created_by uuid default dk_current_profile_id() references dk_users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_published_at timestamptz,
  -- Same closed list as the published design (ADR 0053): no CSS, no foreign images.
  constraint dk_menu_designs_valid check (dk_public_menu_theme_problem(design, kitchen_id) is null)
);
create index dk_menu_designs_kitchen_idx on dk_menu_designs (kitchen_id, created_at desc);
create index dk_menu_designs_parent_idx on dk_menu_designs (parent_id);

alter table dk_menu_designs enable row level security;
create policy dk_menu_designs_select on dk_menu_designs for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('storefront.manage')));
-- Writes only through the functions below.
grant select on dk_menu_designs to authenticated;

create trigger dk_trg_audit_menu_designs after insert or update or delete on dk_menu_designs
  for each row execute function dk_audit_row();

-- At most 200 per business: the oldest go first, never favorites nor anything ever published.
create or replace function dk_menu_designs_prune(p_kitchen uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from dk_menu_designs d
  where d.kitchen_id = p_kitchen
    and not d.favorite
    and d.last_published_at is null
    and d.id in (
      select id from dk_menu_designs
      where kitchen_id = p_kitchen
      order by created_at desc
      offset 200);
$$;
revoke all on function dk_menu_designs_prune(uuid) from public, anon, authenticated;

create or replace function dk_menu_design_json(d dk_menu_designs)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', d.id, 'name', d.name, 'design', d.design, 'source', d.source, 'prompt', d.prompt, 'summary', d.summary,
    'parentId', d.parent_id, 'favorite', d.favorite, 'createdAt', d.created_at, 'lastPublishedAt', d.last_published_at,
    'createdBy', (select p.full_name from dk_users p where p.id = d.created_by));
$$;
revoke all on function dk_menu_design_json(dk_menu_designs) from public, anon;

-- ---------------------------------------------------------------------------
-- 3. Functions (storefront.manage, the active account)
-- ---------------------------------------------------------------------------
create or replace function dk_menu_design_guard()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
begin
  if v_kitchen is null then raise exception 'No hay una cuenta activa'; end if;
  if not dk_can('storefront.manage') then raise exception 'No autorizado para el menú público'; end if;
  return v_kitchen;
end;
$$;
revoke all on function dk_menu_design_guard() from public, anon, authenticated;

create or replace function dk_menu_design_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_menu_design_guard();
begin
  return coalesce((select jsonb_agg(dk_menu_design_json(d) order by d.created_at desc) from dk_menu_designs d where d.kitchen_id = v_kitchen), '[]'::jsonb);
end;
$$;

-- Save one design (from the editor, or the designer's proposals). Never touches the draft nor what is published.
create or replace function dk_menu_design_save(
  p_name text,
  p_design jsonb,
  p_source text default 'editor',
  p_prompt text default null,
  p_summary text default null,
  p_parent_id uuid default null,
  p_ai_run_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_menu_design_guard();
  v_problem text;
  d dk_menu_designs;
begin
  if p_source not in ('ai', 'editor') then raise exception 'Origen no válido'; end if;
  v_problem := dk_public_menu_theme_problem(p_design, v_kitchen);
  if p_design is null then v_problem := 'El diseño está vacío'; end if;
  if v_problem is not null then raise exception '%', v_problem using hint = 'invalid_theme'; end if;
  if p_parent_id is not null and not exists (select 1 from dk_menu_designs where id = p_parent_id and kitchen_id = v_kitchen) then
    raise exception 'El diseño anterior no existe';
  end if;
  if p_ai_run_id is not null and not exists (select 1 from dk_ai_insights where id = p_ai_run_id and kitchen_id = v_kitchen and feature_key = 'menu_designer') then
    raise exception 'La ejecución de IA no es de esta cuenta';
  end if;
  insert into dk_menu_designs (kitchen_id, name, design, source, prompt, summary, parent_id, ai_run_id)
  values (v_kitchen, left(btrim(coalesce(nullif(btrim(p_name), ''), 'Mi diseño')), 60), p_design, p_source,
          left(nullif(btrim(p_prompt), ''), 500), left(nullif(btrim(p_summary), ''), 240), p_parent_id, p_ai_run_id)
  returning * into d;
  perform dk_menu_designs_prune(v_kitchen);
  return dk_menu_design_json(d);
end;
$$;

-- Rename or (un)mark as favorite.
create or replace function dk_menu_design_update(p_id uuid, p_name text default null, p_favorite boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_menu_design_guard();
  d dk_menu_designs;
begin
  update dk_menu_designs
  set name = coalesce(left(nullif(btrim(p_name), ''), 60), name), favorite = coalesce(p_favorite, favorite)
  where id = p_id and kitchen_id = v_kitchen
  returning * into d;
  if not found then raise exception 'El diseño no existe'; end if;
  return dk_menu_design_json(d);
end;
$$;

create or replace function dk_menu_design_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_menu_design_guard();
begin
  delete from dk_menu_designs where id = p_id and kitchen_id = v_kitchen;
  if not found then raise exception 'El diseño no existe'; end if;
end;
$$;

-- Before the draft is replaced: if it has unpublished changes not kept anywhere, keep it in «Mis diseños».
create or replace function dk_menu_design_backup_draft(p_kitchen uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  s dk_storefronts;
begin
  select * into s from dk_storefronts where kitchen_id = p_kitchen for update;
  if not found or s.web_theme_draft is null or s.web_theme_draft is not distinct from s.web_theme then return false; end if;
  if exists (select 1 from dk_menu_designs where kitchen_id = p_kitchen and design = s.web_theme_draft) then return false; end if;
  insert into dk_menu_designs (kitchen_id, name, design, source)
  values (p_kitchen, 'Borrador del ' || to_char(now() at time zone 'America/Bogota', 'DD/MM HH24:MI'), s.web_theme_draft, 'draft_backup');
  return true;
end;
$$;
revoke all on function dk_menu_design_backup_draft(uuid) from public, anon, authenticated;

-- «Usar en el editor»: the design becomes the draft. The public page does not change.
create or replace function dk_menu_design_use(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_menu_design_guard();
  d dk_menu_designs;
  v_backed_up boolean;
begin
  select * into d from dk_menu_designs where id = p_id and kitchen_id = v_kitchen;
  if not found then raise exception 'El diseño no existe'; end if;
  v_backed_up := dk_menu_design_backup_draft(v_kitchen);
  perform dk_public_menu_theme_save_draft(d.design);
  perform dk_menu_designs_prune(v_kitchen);
  return jsonb_build_object('backedUp', v_backed_up);
end;
$$;

-- «Publicar»: the design becomes the draft and is published (ADR 0053: the current one becomes «anterior»).
create or replace function dk_menu_design_publish(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_menu_design_guard();
  d dk_menu_designs;
  v_backed_up boolean;
begin
  select * into d from dk_menu_designs where id = p_id and kitchen_id = v_kitchen;
  if not found then raise exception 'El diseño no existe'; end if;
  v_backed_up := dk_menu_design_backup_draft(v_kitchen);
  perform dk_public_menu_theme_save_draft(d.design);
  perform dk_public_menu_theme_publish();
  perform dk_menu_designs_prune(v_kitchen);
  return jsonb_build_object('backedUp', v_backed_up);
end;
$$;

-- What the designer may tell the AI (D5): presentation context only — no customers, prices nor orders.
create or replace function dk_menu_design_ai_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_menu_design_guard();
begin
  return (
    select jsonb_build_object(
      'name', k.name,
      'cuisine', coalesce(k.cuisine, o.category),
      'tagline', s.tagline,
      'categories', coalesce((select jsonb_agg(distinct coalesce(i.category, 'Otros')) from dk_public_menu_items(k.id) i), '[]'::jsonb),
      'current', coalesce(s.web_theme_draft, s.web_theme))
    from dk_kitchens k
    join dk_organizations o on o.id = k.organization_id
    left join dk_storefronts s on s.kitchen_id = k.id
    where k.id = v_kitchen);
end;
$$;

revoke all on function dk_menu_design_list() from public, anon;
revoke all on function dk_menu_design_save(text, jsonb, text, text, text, uuid, uuid) from public, anon;
revoke all on function dk_menu_design_update(uuid, text, boolean) from public, anon;
revoke all on function dk_menu_design_delete(uuid) from public, anon;
revoke all on function dk_menu_design_use(uuid) from public, anon;
revoke all on function dk_menu_design_publish(uuid) from public, anon;
revoke all on function dk_menu_design_ai_context() from public, anon;
grant execute on function dk_menu_design_list(), dk_menu_design_save(text, jsonb, text, text, text, uuid, uuid),
  dk_menu_design_update(uuid, text, boolean), dk_menu_design_delete(uuid), dk_menu_design_use(uuid),
  dk_menu_design_publish(uuid), dk_menu_design_ai_context() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Every publication (editor, card or «volver al anterior») is recorded in the history
-- ---------------------------------------------------------------------------
create or replace function dk_menu_designs_on_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.web_theme is null or new.web_theme is not distinct from old.web_theme then return new; end if;
  update dk_menu_designs set last_published_at = now() where kitchen_id = new.kitchen_id and design = new.web_theme;
  if not found then
    insert into dk_menu_designs (kitchen_id, name, design, source, last_published_at)
    values (new.kitchen_id, 'Publicado el ' || to_char(now() at time zone 'America/Bogota', 'DD/MM HH24:MI'), new.web_theme, 'published', now());
  end if;
  return new;
end;
$$;
revoke all on function dk_menu_designs_on_publish() from public, anon, authenticated;

create trigger dk_trg_storefronts_design_history after update of web_theme on dk_storefronts
  for each row execute function dk_menu_designs_on_publish();
