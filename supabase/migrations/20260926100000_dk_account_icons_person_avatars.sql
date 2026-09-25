-- ADR 0009, sección 3.1: iconos de Cuenta y avatares de personas.
--
-- Un solo sistema visual, dos galerías (src/shared/avatars/catalog.ts —
-- mantener ambas listas iguales):
-- 1. dk_kitchens.icon_key: icono de establecimiento de la Cuenta (la galería
--    original de 20 ilustraciones). NULL = icono derivado del id. Se edita con
--    la política de UPDATE de siempre (settings.manage en la Cuenta o
--    accounts.manage en la organización). `logo_path` queda sin tocar.
-- 2. dk_users.avatar_key: ahora solo los 20 avatares de personas. Los valores
--    anteriores (comida) pasan a NULL: la persona ve su avatar derivado del id
--    y elige uno nuevo en Mi perfil.
-- 3. dk_my_context: cada Cuenta trae su `iconKey`.

alter table dk_kitchens
  add column icon_key text
  constraint dk_kitchens_icon_key_check check (
    icon_key in (
      'chef', 'burger', 'pizza', 'taco', 'sushi', 'ramen', 'donut', 'croissant', 'coffee', 'icecream',
      'avocado', 'chili', 'lemon', 'egg', 'cheese', 'shrimp', 'whisk', 'pot', 'cutlery', 'flame'
    )
  );

comment on column dk_kitchens.icon_key is 'Icono de establecimiento de la Cuenta (galería de la app). NULL = icono derivado del id. Sin imágenes propias.';

alter table dk_users drop constraint dk_users_avatar_key_check;

update dk_users set avatar_key = null
where avatar_key is not null
  and avatar_key not in (
    'chef-classic', 'chef-bun', 'baker', 'barista', 'rider', 'cashier', 'grill-master', 'sushi-chef', 'pizzaiolo', 'manager',
    'waiter', 'grandma', 'curly', 'hijab', 'beanie', 'headphones', 'cap', 'braids', 'robot', 'cat-chef'
  );

alter table dk_users
  add constraint dk_users_avatar_key_check check (
    avatar_key in (
      'chef-classic', 'chef-bun', 'baker', 'barista', 'rider', 'cashier', 'grill-master', 'sushi-chef', 'pizzaiolo', 'manager',
      'waiter', 'grandma', 'curly', 'hijab', 'beanie', 'headphones', 'cap', 'braids', 'robot', 'cat-chef'
    )
  );

comment on column dk_users.avatar_key is 'Avatar de persona elegido (galería de la app). NULL = avatar derivado del id. Sin fotos propias.';

create or replace function dk_my_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user dk_users;
  v_platform boolean := dk_is_superadmin();
begin
  select * into v_user from dk_users where auth_user_id = auth.uid();
  if not found then return null; end if;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_user.id, 'fullName', v_user.full_name, 'avatarKey', v_user.avatar_key,
      'active', v_user.active, 'isPlatformAdmin', v_platform, 'lastAccountId', v_user.last_account_id),
    'accountPermissions', (select coalesce(jsonb_agg(p.key order by p.sort_order), '[]') from dk_permissions p where p.scope = 'account'),
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', o.id, 'slug', o.slug, 'name', o.name, 'active', o.active,
          'isOwner', o.owner_user_id = v_user.id,
          'isSuperAdmin', v_platform or coalesce(om.is_super_admin and om.status = 'active', false),
          'status', coalesce(om.status, 'active'),
          'permissions', (select coalesce(jsonb_agg(p.key order by p.sort_order), '[]') from dk_permissions p
                          where p.scope = 'organization' and dk_has_org_permission(o.id, p.key)))
        order by o.name)
      from dk_organizations o
      left join dk_organization_members om on om.organization_id = o.id and om.user_id = v_user.id
      where v_platform or om.user_id is not null
    ), '[]'),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', k.id, 'slug', k.slug, 'name', k.name, 'organizationId', k.organization_id, 'iconKey', k.icon_key,
          'active', k.active and o.active,
          'superAdmin', v_platform or coalesce(om.is_super_admin and om.status = 'active', false),
          'defaultRoleId', m.default_role_id,
          'roles', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', r.id, 'key', r.key, 'name', r.name, 'isSystem', r.is_system,
                'permissions', (select coalesce(jsonb_agg(rp.permission_key order by rp.permission_key), '[]') from dk_role_permissions rp where rp.role_id = r.id))
              order by r.id = m.default_role_id desc, r.name)
            from dk_member_roles mr join dk_roles r on r.id = mr.role_id
            where mr.kitchen_id = k.id and mr.user_id = v_user.id and m.active
          ), '[]'))
        order by o.name, k.name)
      from dk_kitchens k
      join dk_organizations o on o.id = k.organization_id
      left join dk_organization_members om on om.organization_id = k.organization_id and om.user_id = v_user.id
      left join dk_kitchen_members m on m.kitchen_id = k.id and m.user_id = v_user.id
      where v_platform
         or (om.status = 'active' and (om.is_super_admin or m.active))
    ), '[]')
  );
end;
$$;
