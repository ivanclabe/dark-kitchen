-- ADR 0045: «Voz de la aplicación» leaves Configuración → IA y voz.
--
-- The voice that Dark Kitchen uses today (Karen, natural, rate 1, volume 1,
-- es-US; it only differed from the platform's in the language) becomes the
-- platform default, and every account — existing and new — uses it: no
-- business or account keeps its own voice. The feature stays on everywhere
-- (it already is): with the switch gone, nobody could turn it back on.
-- Only the platform changes the voice from now on (portal → Voz).

update dk_features
set default_settings = default_settings || '{"lang": "es-US", "rate": 1, "style": "natural", "volume": 1, "profile": "karen"}'::jsonb
where key = 'voice_speech';

update dk_organization_features set settings = '{}'::jsonb
where feature_key = 'voice_speech' and settings <> '{}'::jsonb;

update dk_kitchen_features set settings = '{}'::jsonb
where feature_key = 'voice_speech' and settings <> '{}'::jsonb;

update dk_organization_features set available = true where feature_key = 'voice_speech' and not available;
update dk_kitchen_features set enabled = true where feature_key = 'voice_speech' and not enabled;
