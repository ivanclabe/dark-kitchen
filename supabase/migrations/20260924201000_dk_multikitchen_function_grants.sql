-- Multi-Cocina — higiene de permisos de las funciones nuevas (Fases 1–3).
--
-- Por defecto Postgres da EXECUTE a PUBLIC (incluido `anon`). Sin sesión
-- estas funciones ya devolvían NULL/false (no exponían datos), pero no hay
-- razón para que alguien sin iniciar sesión las invoque por la API:
--   * Funciones de autorización: solo `authenticated` (las usa la RLS).
--   * Funciones de trigger: nadie las invoca directo; los triggers siguen
--     disparándose (Postgres no revisa EXECUTE al disparar un trigger).

revoke execute on function
  dk_can(text, text),
  dk_can_see_user(uuid),
  dk_current_kitchen_id(),
  dk_has_kitchen_permission(uuid, text, text),
  dk_is_kitchen_member(uuid),
  dk_is_staff(),
  dk_is_superadmin(),
  dk_kitchen_today()
from public, anon;

grant execute on function
  dk_can(text, text),
  dk_can_see_user(uuid),
  dk_current_kitchen_id(),
  dk_has_kitchen_permission(uuid, text, text),
  dk_is_kitchen_member(uuid),
  dk_is_staff(),
  dk_is_superadmin(),
  dk_kitchen_today()
to authenticated;

revoke execute on function
  dk_assign_order_number(),
  dk_inherit_kitchen_id(),
  dk_sync_legacy_profile_to_membership()
from public, anon, authenticated;
