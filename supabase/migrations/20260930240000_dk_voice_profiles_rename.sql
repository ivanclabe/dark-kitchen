-- ADR 0014: kitchen voice catalog renamed to Ivan, Karen, Dago, Daniel, Belen.
--
-- Profiles are renamed in place (same gender and style as before) and every
-- saved reference to their key is updated, so no platform, organization or
-- account loses its choice:
--   mateo → ivan   (male, energetic)
--   laura → karen  (female, natural; platform default)
--   alex  → dago   (was neutral; now male, direct)
--   daniel         (unchanged)
--   sofia → belen  (female, friendly)

update dk_voice_profiles set key = 'ivan', name = 'Ivan', sort_order = 10, description = 'Dinámica para la hora pico.' where key = 'mateo';
update dk_voice_profiles set key = 'karen', name = 'Karen', sort_order = 20, description = 'Natural, lo más cercana a una conversación.' where key = 'laura';
update dk_voice_profiles set key = 'dago', name = 'Dago', gender = 'male', sort_order = 30, description = 'Corta y directa.',
  device_voice_hints = '{Gonzalo,Jorge,Raúl,Raul,Diego,Juan,Pablo,Carlos,Andrés,Andres}' where key = 'alex';
update dk_voice_profiles set sort_order = 40 where key = 'daniel';
update dk_voice_profiles set key = 'belen', name = 'Belen', sort_order = 50, description = 'Amable y cálida.' where key = 'sofia';

-- Saved references (platform default, organization defaults, account choices).
update dk_features f set default_settings = jsonb_set(f.default_settings, '{profile}', to_jsonb(r.new_key))
from (values ('mateo', 'ivan'), ('laura', 'karen'), ('alex', 'dago'), ('sofia', 'belen')) as r(old_key, new_key) where f.key = 'voice_speech' and f.default_settings ->> 'profile' = r.old_key;

update dk_organization_features o set settings = jsonb_set(o.settings, '{profile}', to_jsonb(r.new_key))
from (values ('mateo', 'ivan'), ('laura', 'karen'), ('alex', 'dago'), ('sofia', 'belen')) as r(old_key, new_key) where o.feature_key = 'voice_speech' and o.settings ->> 'profile' = r.old_key;

update dk_kitchen_features k set settings = jsonb_set(k.settings, '{profile}', to_jsonb(r.new_key))
from (values ('mateo', 'ivan'), ('laura', 'karen'), ('alex', 'dago'), ('sofia', 'belen')) as r(old_key, new_key) where k.feature_key = 'voice_speech' and k.settings ->> 'profile' = r.old_key;

do $$
begin
  if exists (select 1 from dk_voice_profiles where key in ('mateo', 'laura', 'alex', 'sofia'))
     or exists (select 1 from dk_features where key = 'voice_speech' and default_settings ->> 'profile' in ('mateo', 'laura', 'alex', 'sofia'))
     or exists (select 1 from dk_organization_features where feature_key = 'voice_speech' and settings ->> 'profile' in ('mateo', 'laura', 'alex', 'sofia'))
     or exists (select 1 from dk_kitchen_features where feature_key = 'voice_speech' and settings ->> 'profile' in ('mateo', 'laura', 'alex', 'sofia')) then
    raise exception 'Voice rename left references to old profile keys';
  end if;
end $$;
