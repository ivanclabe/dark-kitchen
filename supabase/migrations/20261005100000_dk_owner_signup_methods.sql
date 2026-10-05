-- ADR 0025: the person who creates a business may sign up with Google,
-- Instagram (custom:instagram) or a phone number (SMS code), besides email.
-- dk_create_organization changes in three points; everything else (owner,
-- membership, roles, plan, tenant code, RBAC, RLS) stays the same:
--   1. Verified identity: confirmed email, OR confirmed phone, OR an identity
--      from an allowed provider (Google verifies the email; Instagram gives none).
--   2. Name: the one typed in the onboarding, then the provider's, never the email.
--   3. A pending invitation with the same email is not orphaned: activate it instead.
-- Invited users keep their flow (invitation → activation → email + password).

create or replace function dk_owner_signup_verified(p_auth auth.users)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_auth.email_confirmed_at is not null
      or (p_auth.phone is not null and p_auth.phone_confirmed_at is not null)
      or exists (select 1 from auth.identities i where i.user_id = p_auth.id and i.provider in ('google', 'custom:instagram'));
$$;
revoke all on function dk_owner_signup_verified(auth.users) from public, anon, authenticated;

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
  if not dk_owner_signup_verified(v_auth) then
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
  elsif v_auth.email is not null
        and exists (select 1 from dk_users where email = lower(v_auth.email) and auth_user_id is null) then
    -- A second profile would leave the invitation impossible to activate.
    raise exception 'PENDING_INVITATION: tienes una invitación pendiente; actívala con el enlace que te enviaron';
  end if;

  -- The plan comes from the signup (editable metadata): validated here.
  select * into v_plan from dk_plans where key = p_plan and status = 'public' and self_serve;
  if not found then
    raise exception 'PLAN_NOT_AVAILABLE: el plan elegido no está disponible; elige otro plan';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 80 then raise exception 'El nombre del negocio debe tener entre 2 y 80 caracteres'; end if;

  v_full_name := btrim(coalesce(
    nullif(btrim(p_full_name), ''),
    nullif(btrim(v_auth.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(v_auth.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(v_auth.raw_user_meta_data ->> 'preferred_username'), ''),
    nullif(split_part(v_auth.email, '@', 1), ''),
    'Dueño'));
  if char_length(v_full_name) < 2 then v_full_name := 'Dueño'; end if;
  if v_profile is null then
    insert into dk_users (auth_user_id, full_name, active) values (auth.uid(), left(v_full_name, 80), true) returning id into v_profile;
  end if;

  select p.new_kitchen_slug into v_slug
  from dk_provision_organization(v_profile, v_profile, p_name, p_sector, p_category, v_plan, p_address, p_city, p_country,
                                 p_phone, p_tax_id, p_legal_name, p_account_name, p_account_icon) p;
  return v_slug;
end;
$$;

revoke all on function dk_create_organization(text, text, text, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function dk_create_organization(text, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;
