-- ADR 0008: endurecimiento según los avisos del asesor de Supabase.
--
-- 1. Funciones de disparador: nadie las llama por RPC (Postgres solo exige
--    EXECUTE al crear el disparador, no al dispararlo), así que se quita el
--    permiso por defecto a PUBLIC / anon / authenticated.
-- 2. search_path fijo en las dos funciones auxiliares nuevas.

revoke execute on function
  dk_fill_user_email(),
  dk_guard_kitchen_member(),
  dk_guard_master_menu_kitchen(),
  dk_guard_member_role_assignment(),
  dk_guard_org_owner_membership(),
  dk_sync_member_default_role(),
  dk_sync_org_owner_membership(),
  dk_sync_user_email(),
  dk_guard_organization()
from public, anon, authenticated;

alter function dk_request_header(text) set search_path = public;
alter function dk_slugify(text, text) set search_path = public;
