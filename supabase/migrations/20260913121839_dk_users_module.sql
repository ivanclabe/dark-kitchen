-- Dark Kitchen — Modulo Usuarios: cierra el hueco de que "active=false" no
-- tenia ningun efecto real, y habilita el auto-registro de personal (despues
-- del primer ADMIN) con rol CASHIER por defecto, para que un ADMIN pueda
-- luego promoverlo desde la UI.

-- dk_current_role() ahora exige active=true. Como todas las policies de la
-- app usan `dk_current_role() in (...)`, desactivar a alguien le corta el
-- acceso a todo inmediatamente (NULL not in (...) = false), sin tener que
-- tocar cada policy una por una.
create or replace function dk_current_role()
returns dk_role
language sql
security definer
stable
set search_path = public
as $$
  select role from dk_users where auth_user_id = auth.uid() and active;
$$;

-- Insert: bootstrap (tabla vacia) sigue permitiendo pedir ADMIN; un ADMIN ya
-- autenticado puede insertar con cualquier rol; y ahora tambien cualquier
-- usuario autenticado sin perfil aun puede crear su propia fila, pero
-- SOLO como CASHIER activo (nunca eligiendo su propio rol) -- un ADMIN debe
-- promoverlo despues desde el modulo de Usuarios.
drop policy dk_users_insert on dk_users;
create policy dk_users_insert on dk_users
  for insert
  to authenticated
  with check (
    dk_current_role() = 'ADMIN'
    or (
      not exists (select 1 from dk_users where auth_user_id = auth.uid())
      and auth_user_id = auth.uid()
      and (
        (not exists (select 1 from dk_users) and role = 'ADMIN')
        or (exists (select 1 from dk_users) and role = 'CASHIER' and active = true)
      )
    )
  );
