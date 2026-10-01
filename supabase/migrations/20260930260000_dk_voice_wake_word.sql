-- ADR 0016: "Oye Quanela" wake word (hands-free kitchen voice commands).
--
--   * New feature voice_wake_word (category voice) in the ADR 0014 model:
--     platform switch → plan → organization offers → account enabled → permission.
--   * Same plans as voice_commands, and it depends on it (the phrase only opens
--     the command window).
--   * Settings are detection tuning, owned by the platform (organizations may
--     override them like any other feature setting):
--       threshold      — score (0–1) a chunk must reach,
--       confirm_frames — consecutive 80 ms chunks above the threshold.
--   * Each device still has to switch "Manos libres" on (off by default): the
--     microphone stays open only where someone chose it.
insert into dk_features (key, category, label, description, use_permission, manage_permission, default_available, default_enabled,
                         default_settings, uses_model, sort_order, depends_on, settings_schema)
values (
  'voice_wake_word', 'voice', 'Manos libres (Oye Quanela)',
  'Di «Oye Quanela» y da el comando sin tocar la pantalla. El audio se procesa en el equipo: no se guarda ni se envía.',
  'kitchen.view', 'settings.manage', true, true,
  '{"threshold": 0.95, "confirm_frames": 2}', false, 105, '{voice_commands}',
  '{
    "threshold": {"type": "number", "min": 0.05, "max": 0.99},
    "confirm_frames": {"type": "number", "min": 1, "max": 5}
  }'
)
on conflict (key) do nothing;

insert into dk_plan_features (plan_key, feature_key)
select plan_key, 'voice_wake_word' from dk_plan_features where feature_key = 'voice_commands'
on conflict do nothing;
