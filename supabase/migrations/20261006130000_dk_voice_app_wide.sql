-- ADR 0033, phase 1: «Oye Quanela» is the voice of the whole app, not of Cocina.
--
-- 1. New permission voice.use («Usar Oye Quanela»): every system role, and
--    every custom role that today has kitchen.view — nobody loses the voice
--    they already use (D9).
-- 2. Hands-free (voice_wake_word) and speaking (voice_speech) need voice.use
--    instead of kitchen.view; hands-free no longer depends on the kitchen
--    commands (it also opens Copilot questions).
-- 3. The kitchen commands (voice_commands) keep kitchen.view: they act on orders.
-- Plans do not change.

insert into dk_permissions (key, module, action, scope, label, description, sort_order) values
  ('voice.use', 'voice', 'use', 'account', 'Usar Oye Quanela',
   'Hablarle a Quanela y escuchar sus respuestas en cualquier pantalla. Lo que se pueda consultar o hacer sigue dependiendo de los demás permisos', 187)
on conflict (key) do nothing;

insert into dk_role_permissions (role_id, permission_key)
select r.id, 'voice.use' from dk_roles r where r.is_system
on conflict do nothing;

insert into dk_role_permissions (role_id, permission_key)
select distinct rp.role_id, 'voice.use' from dk_role_permissions rp join dk_roles r on r.id = rp.role_id
where not r.is_system and rp.permission_key = 'kitchen.view'
on conflict do nothing;

update dk_features set
  use_permission = 'voice.use',
  depends_on = '{}',
  description = 'Di «Oye Quanela» en cualquier pantalla: en Cocina da comandos y en todas partes le preguntas a Copilot. La frase se detecta en el equipo; lo que dices después lo reconoce el servicio de voz del navegador.'
where key = 'voice_wake_word';

update dk_features set
  use_permission = 'voice.use',
  description = 'Avisos de cocina y respuestas habladas de Quanela, con la voz, el estilo, la velocidad y el volumen que elijas.'
where key = 'voice_speech';
