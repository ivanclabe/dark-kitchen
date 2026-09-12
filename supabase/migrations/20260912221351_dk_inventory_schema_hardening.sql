-- dk_apply_movement_to_stock solo se invoca como trigger, nunca como RPC.
revoke execute on function dk_apply_movement_to_stock() from public, anon, authenticated;

-- Reafirma el patron revoke-from-public + grant-to-authenticated para las RPC
-- de negocio (evita que anon las alcance via el grant implicito a PUBLIC).
revoke execute on function dk_confirm_purchase(uuid) from public, anon;
grant execute on function dk_confirm_purchase(uuid) to authenticated;

revoke execute on function dk_register_waste(uuid, numeric, dk_waste_reason, text) from public, anon;
grant execute on function dk_register_waste(uuid, numeric, dk_waste_reason, text) to authenticated;

revoke execute on function dk_register_adjustment(uuid, numeric, text) from public, anon;
grant execute on function dk_register_adjustment(uuid, numeric, text) to authenticated;
