-- ADR 0045: one voice for every account (the platform default), always on. Rolled back.
--
--   python3 supabase/tests/run.py voice_default --with supabase/migrations/20261009110000_dk_voice_speech_platform_default.sql

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;

insert into _t (area, test, expected, got) values
  ('Default', 'The platform voice is the one Dark Kitchen used', '{"lang": "es-US", "rate": 1, "style": "natural", "volume": 1, "profile": "karen"}',
    (select (default_settings - array(select k from jsonb_object_keys(default_settings) k where k not in ('lang', 'rate', 'style', 'volume', 'profile')))::text
     from dk_features where key = 'voice_speech')),
  ('Default', 'The default passes the platform''s own validation', 'valid',
    coalesce(dk_feature_settings_error('voice_speech', (select default_settings from dk_features where key = 'voice_speech')), 'valid')),
  ('Accounts', 'No business nor account keeps its own voice', '0',
    ((select count(*) from dk_organization_features where feature_key = 'voice_speech' and settings <> '{}'::jsonb)
     + (select count(*) from dk_kitchen_features where feature_key = 'voice_speech' and settings <> '{}'::jsonb))::text),
  ('Accounts', 'Every active account speaks with that same voice', '0',
    (select count(*)::text from dk_kitchens k where k.active
       and dk_feature_effective_settings(k.id, 'voice_speech') ->> 'lang' is distinct from 'es-US')),
  ('Accounts', 'And it is on in every active account', '0',
    (select count(*)::text from dk_kitchens k where k.active and not dk_feature_enabled(k.id, 'voice_speech')));

select area, test, expected, got, case when expected is not distinct from got then 'PASS' else 'FAIL' end as result, detail from _t order by n;
rollback;
