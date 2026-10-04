-- ADR 0024 (phase 2): turn a feature on or off for the ACTIVE account only.
-- Before, the organization first "offered" a feature and then switched it on
-- per account. Inside the account there is a single switch: if the business
-- was not offering it yet, it is offered and the other accounts are pinned to
-- off, so switching it on here never switches it on anywhere else.
-- Same permission as before (features.manage of the organization).

create or replace function dk_account_set_feature(p_key text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kitchen uuid := dk_current_kitchen_id();
  v_org uuid;
begin
  if v_kitchen is null then raise exception 'Entra a una cuenta'; end if;
  select organization_id into v_org from dk_kitchens where id = v_kitchen;
  if not dk_has_org_permission(v_org, 'features.manage') then
    raise exception 'No autorizado para activar funciones en esta cuenta' using errcode = '42501';
  end if;
  if p_enabled is null then raise exception 'Indica si la función está activada'; end if;

  if p_enabled and not dk_feature_available(v_org, p_key) then
    -- The other accounts were off (the business did not offer it): they stay off.
    insert into dk_kitchen_features (kitchen_id, feature_key, enabled, settings, updated_by)
    select k.id, p_key, false, '{}', dk_current_profile_id()
    from dk_kitchens k where k.organization_id = v_org and k.id <> v_kitchen
    on conflict (kitchen_id, feature_key) do update set enabled = false;
    perform dk_set_org_feature(v_org, p_key, true);
  end if;
  perform dk_set_kitchen_feature(v_kitchen, p_key, p_enabled);
end;
$$;

revoke all on function dk_account_set_feature(text, boolean) from public, anon;
grant execute on function dk_account_set_feature(text, boolean) to authenticated;
