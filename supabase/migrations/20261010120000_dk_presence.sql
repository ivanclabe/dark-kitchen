-- ADR 0050 — Usuarios en línea (Supabase Realtime Presence).
--
-- Cada cuenta tiene un canal PRIVADO de presencia: account:{id}:presence. Las
-- reglas de realtime.messages dejan leer y anunciarse en él solo a quien es del
-- negocio en esa cuenta: miembro activo de la cuenta o superadministrador de su
-- organización. Alguien de la plataforma que no es del negocio no entra.
-- No se guarda nada: la presencia vive mientras la app está abierta.

-- ¿Puede la persona de esta sesión estar en el canal de presencia `p_topic`?
create or replace function dk_presence_allowed(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen uuid;
  v_user uuid;
begin
  if p_topic is null or auth.uid() is null
     or p_topic !~* '^account:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:presence$' then
    return false;
  end if;
  v_kitchen := split_part(p_topic, ':', 2)::uuid;
  select id into v_user from dk_users where auth_user_id = auth.uid() and active;
  if v_user is null then return false; end if;

  return exists (
    select 1 from dk_kitchens k join dk_organizations o on o.id = k.organization_id
    where k.id = v_kitchen and k.active and o.active
      and (
        exists (select 1 from dk_kitchen_members m where m.kitchen_id = k.id and m.user_id = v_user and m.active)
        or exists (select 1 from dk_organization_members om
                   where om.organization_id = o.id and om.user_id = v_user and om.status = 'active' and om.is_super_admin)
      )
  );
end;
$$;

revoke all on function dk_presence_allowed(text) from public, anon;
grant execute on function dk_presence_allowed(text) to authenticated;

-- Escuchar quién está (select) y anunciarse (insert), solo presencia y solo en su cuenta.
create policy dk_presence_read on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'presence' and (select public.dk_presence_allowed(realtime.topic())));

create policy dk_presence_track on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'presence' and (select public.dk_presence_allowed(realtime.topic())));
