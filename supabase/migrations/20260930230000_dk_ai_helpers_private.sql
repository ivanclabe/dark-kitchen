-- ADR 0014: internal helpers are not part of the API.
--
-- Supabase grants EXECUTE on new functions to anon and authenticated
-- explicitly, so "revoke … from public" is not enough. These helpers are only
-- called from SECURITY DEFINER functions (which run as the owner), so revoking
-- them from API roles changes nothing for the app and closes reading another
-- account's settings by id.
revoke execute on function dk_feature_override_allowed(uuid, text) from public, anon, authenticated;
revoke execute on function dk_feature_inherited_settings(uuid, text) from public, anon, authenticated;
revoke execute on function dk_feature_effective_settings(uuid, text) from public, anon, authenticated;
revoke execute on function dk_feature_clean_settings(text, jsonb) from public, anon, authenticated;
revoke execute on function dk_feature_config_issues(text) from public, anon, authenticated;
revoke execute on function dk_require_platform_admin() from public, anon, authenticated;
revoke execute on function dk_audit_classify_ai() from public, anon, authenticated;
