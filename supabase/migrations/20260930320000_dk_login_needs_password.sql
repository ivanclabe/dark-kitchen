-- ADR 0019: an Organization Admin invited from the Global Admin portal opens
-- the activation link with a session from the invitation e-mail, but has no
-- password yet. The activation page asks them to create one first. Only says
-- whether the CURRENT user's login lacks a password; never reads anything else.
create or replace function dk_my_login_needs_password()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select au.encrypted_password is null or au.encrypted_password = '' from auth.users au where au.id = auth.uid()), false);
$$;

revoke execute on function dk_my_login_needs_password() from public, anon;
grant execute on function dk_my_login_needs_password() to authenticated;
