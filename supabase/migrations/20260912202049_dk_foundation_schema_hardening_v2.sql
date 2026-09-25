-- El revoke anterior solo quito el privilegio otorgado explicitamente a
-- "anon"; PUBLIC seguia otorgando EXECUTE (y anon hereda de PUBLIC). Se
-- revoca de PUBLIC y se otorga explicitamente solo a authenticated, que es
-- el unico rol que las policies de dk_users evaluan.

revoke execute on function dk_current_role() from public;
revoke execute on function dk_current_profile_id() from public;

grant execute on function dk_current_role() to authenticated;
grant execute on function dk_current_profile_id() to authenticated;
