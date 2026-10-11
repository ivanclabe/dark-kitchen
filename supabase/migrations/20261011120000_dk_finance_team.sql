-- ADR 0051 (D6): the team of the account with how each person is paid today,
-- for Finanzas → Nómina (finance.payroll; it does not need staff.view).
create or replace function dk_finance_team()
returns table (user_id uuid, full_name text, avatar_key text, active boolean, role_name text, pay_type text, rate numeric, effective_from date)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not dk_can('finance.payroll') then
    raise exception 'No autorizado para la nómina' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.full_name, u.avatar_key, (m.active and u.active), r.name,
           pay.pay_type, pay.rate, pay.effective_from
    from dk_kitchen_members m
    join dk_users u on u.id = m.user_id
    left join dk_roles r on r.id = m.default_role_id
    left join lateral (select mp.pay_type, mp.rate, mp.effective_from from dk_member_pay mp
                       where mp.kitchen_id = m.kitchen_id and mp.user_id = m.user_id and mp.effective_from <= dk_local_date(now(), dk_account_tz())
                       order by mp.effective_from desc limit 1) pay on true
    where m.kitchen_id = dk_current_kitchen_id()
    order by (m.active and u.active) desc, u.full_name;
end;
$$;

revoke all on function dk_finance_team() from public, anon;
grant execute on function dk_finance_team() to authenticated;
