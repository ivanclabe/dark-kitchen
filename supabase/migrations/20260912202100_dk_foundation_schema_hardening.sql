-- Endurece las funciones creadas en dk_foundation_schema segun los advisories
-- de seguridad de Supabase (search_path fijo, y EXECUTE minimo necesario).

alter function dk_set_updated_at() set search_path = public;

-- dk_audit_row solo se invoca como trigger (via NEW/OLD), nunca como RPC.
revoke execute on function dk_audit_row() from public, anon, authenticated;

-- dk_current_role / dk_current_profile_id: el revoke inicial solo quito el
-- privilegio explicito de "anon"; PUBLIC seguia otorgando EXECUTE (y anon
-- hereda de PUBLIC). Se revoca de PUBLIC y se otorga solo a authenticated,
-- el unico rol que las policies de dk_users evaluan.
revoke execute on function dk_current_role() from anon;
revoke execute on function dk_current_profile_id() from anon;
revoke execute on function dk_current_role() from public;
revoke execute on function dk_current_profile_id() from public;
grant execute on function dk_current_role() to authenticated;
grant execute on function dk_current_profile_id() to authenticated;
