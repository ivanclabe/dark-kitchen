-- ADR 0008, Fase A: perfil propio y avatares prediseñados.
--
-- 1. dk_users.avatar_key: clave de uno de los 20 avatares del catálogo de la
--    app (src/shared/avatars/catalog.ts). No hay fotos ni URLs: la base solo
--    acepta claves de esta lista. NULL = avatar por defecto derivado del id.
-- 2. dk_update_my_profile(): cada persona edita SU nombre y SU avatar. La
--    política de UPDATE de dk_users sigue siendo solo para administradores;
--    esta RPC no puede tocar a otra persona ni ningún otro campo (activo,
--    privilegios de plataforma).

alter table dk_users
  add column avatar_key text
  constraint dk_users_avatar_key_check check (
    avatar_key in (
      'chef', 'burger', 'pizza', 'taco', 'sushi', 'ramen', 'donut', 'croissant', 'coffee', 'icecream',
      'avocado', 'chili', 'lemon', 'egg', 'cheese', 'shrimp', 'whisk', 'pot', 'cutlery', 'flame'
    )
  );

comment on column dk_users.avatar_key is 'Avatar prediseñado elegido por la persona (catálogo de la app). NULL = avatar por defecto derivado del id. Sin fotos propias.';

create or replace function dk_update_my_profile(p_full_name text, p_avatar_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_full_name, ''));
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'El nombre debe tener entre 2 y 80 caracteres';
  end if;

  update dk_users
  set full_name = v_name,
      avatar_key = nullif(btrim(coalesce(p_avatar_key, '')), '')
  where auth_user_id = auth.uid();

  if not found then
    raise exception 'Tu usuario no tiene perfil';
  end if;
end;
$$;

revoke execute on function dk_update_my_profile(text, text) from public, anon;
grant execute on function dk_update_my_profile(text, text) to authenticated;
