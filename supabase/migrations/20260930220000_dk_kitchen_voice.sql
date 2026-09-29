-- ADR 0014 (3/3): configurable kitchen voice.
--
--   * dk_voice_profiles: platform catalog of voice profiles (Sofía, Laura…).
--     provider 'device' = the browser's speech synthesis; device_voice_hints
--     are installed-voice names to look for, in order (resolved on each device).
--   * voice_speech gets its settings: profile, style, rate, volume, lang.
--     Stored in the existing feature tables (no duplicate voice table):
--     platform default → organization default → account (if allowed).
--   * dk_feature_settings_error understands string settings (enum and
--     references to the voice catalog).

create table dk_voice_profiles (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  name text not null check (length(name) between 2 and 40),
  gender text not null check (gender in ('female', 'male', 'neutral')),
  default_style text not null check (default_style in ('friendly', 'professional', 'energetic', 'calm', 'direct', 'natural', 'minimal')),
  pitch numeric(3, 2) not null default 1 check (pitch between 0.5 and 1.5),
  lang text not null default 'es-CO' check (lang in ('es-CO', 'es-MX', 'es-ES', 'es-US')),
  provider text not null default 'device' check (provider in ('device')),
  device_voice_hints text[] not null default '{}',
  description text not null default '' check (length(description) <= 200),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references dk_users(id) default dk_current_profile_id()
);
comment on table dk_voice_profiles is 'ADR 0014: kitchen voice catalog managed by the platform. With provider device, each device picks the first installed voice matching device_voice_hints.';

alter table dk_voice_profiles enable row level security;
revoke insert, update, delete, truncate on dk_voice_profiles from anon, authenticated;
grant select on dk_voice_profiles to authenticated;
create policy dk_voice_profiles_select on dk_voice_profiles for select to authenticated using (active or (select dk_is_superadmin()));

create trigger dk_trg_voice_profiles_touch before update on dk_voice_profiles for each row execute function dk_touch_ai_feature();
create trigger dk_trg_audit_voice_profiles after insert or update or delete on dk_voice_profiles for each row execute function dk_audit_row();

insert into dk_voice_profiles (key, name, gender, default_style, pitch, description, device_voice_hints, sort_order) values
  ('sofia', 'Sofía', 'female', 'friendly', 1.10, 'Amable y cálida.',
   '{Paulina,Mónica,Monica,Salomé,Salome,Dalia,Sabina,Helena,Laura,Elvira,Google español de Estados Unidos,Google español}', 10),
  ('laura', 'Laura', 'female', 'natural', 1.00, 'Natural, lo más cercana a una conversación.',
   '{Premium,Enhanced,Mejorada,Natural,Salomé,Salome,Dalia,Paulina,Mónica,Monica,Google español de Estados Unidos,Google español}', 20),
  ('daniel', 'Daniel', 'male', 'professional', 0.95, 'Clara y profesional.',
   '{Jorge,Gonzalo,Juan,Diego,Raúl,Raul,Álvaro,Alvaro,Pablo,Carlos,Andrés,Andres}', 30),
  ('mateo', 'Mateo', 'male', 'energetic', 1.05, 'Dinámica para la hora pico.',
   '{Diego,Juan,Jorge,Gonzalo,Álvaro,Alvaro,Raúl,Raul,Carlos,Andrés,Andres}', 40),
  ('alex', 'Alex', 'neutral', 'direct', 1.00, 'Corta y directa. Usa la voz predeterminada del equipo.',
   '{}', 50);

-- ---------------------------------------------------------------------------
-- Settings validation: strings (enum / voice catalog)
-- ---------------------------------------------------------------------------
create or replace function dk_feature_settings_error(p_feature_key text, p_settings jsonb)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_schema jsonb;
  v_item record;
  v_rule jsonb;
  v_number numeric;
  v_text text;
begin
  select settings_schema into v_schema from dk_features where key = p_feature_key;
  if v_schema is null or p_settings is null then return null; end if;
  for v_item in select key, value from jsonb_each(p_settings) loop
    v_rule := v_schema -> v_item.key;
    if v_rule is null then continue; end if; -- unknown keys: dropped by the RPCs
    if v_rule ->> 'type' = 'number' then
      if jsonb_typeof(v_item.value) <> 'number' then return format('"%s" debe ser un número', v_item.key); end if;
      v_number := (v_item.value #>> '{}')::numeric;
      if v_rule ? 'min' and v_number < (v_rule ->> 'min')::numeric
         or v_rule ? 'max' and v_number > (v_rule ->> 'max')::numeric then
        return format('"%s" debe estar entre %s y %s', v_item.key, v_rule ->> 'min', v_rule ->> 'max');
      end if;
    elsif v_rule ->> 'type' = 'boolean' then
      if jsonb_typeof(v_item.value) <> 'boolean' then return format('"%s" debe ser sí o no', v_item.key); end if;
    elsif v_rule ->> 'type' = 'string' then
      if jsonb_typeof(v_item.value) <> 'string' then return format('"%s" debe ser un texto', v_item.key); end if;
      v_text := v_item.value #>> '{}';
      if v_rule ? 'enum' and not (v_rule -> 'enum') ? v_text then
        return format('"%s" no admite el valor «%s»', v_item.key, v_text);
      end if;
      if v_rule ->> 'ref' = 'voice_profile' and not exists (select 1 from dk_voice_profiles where key = v_text and active) then
        return format('la voz «%s» no existe o está inactiva', v_text);
      end if;
    end if;
  end loop;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- voice_speech settings (platform default = today's behaviour: device default voice in es-CO)
-- ---------------------------------------------------------------------------
update dk_features set
  description = 'Avisos y respuestas habladas en Cocina, con la voz, el estilo, la velocidad y el volumen que elijas.',
  default_settings = '{"profile": "laura", "style": "natural", "rate": 1, "volume": 1, "lang": "es-CO"}',
  settings_schema = '{
    "profile": {"type": "string", "ref": "voice_profile"},
    "style": {"type": "string", "enum": ["friendly", "professional", "energetic", "calm", "direct", "natural", "minimal"]},
    "rate": {"type": "number", "min": 0.7, "max": 1.5},
    "volume": {"type": "number", "min": 0.1, "max": 1},
    "lang": {"type": "string", "enum": ["es-CO", "es-MX", "es-ES", "es-US"]}
  }'
where key = 'voice_speech';

-- ---------------------------------------------------------------------------
-- Platform: voice catalog
-- ---------------------------------------------------------------------------
create or replace function dk_platform_set_voice_profile(
  p_key text,
  p_name text,
  p_gender text,
  p_default_style text,
  p_pitch numeric default 1,
  p_lang text default 'es-CO',
  p_device_voice_hints text[] default '{}',
  p_description text default '',
  p_active boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform dk_require_platform_admin();
  if not coalesce(p_active, true) and (select default_settings ->> 'profile' from dk_features where key = 'voice_speech') = p_key then
    raise exception 'Es la voz por defecto de la plataforma: elige otra por defecto antes de desactivarla';
  end if;
  update dk_voice_profiles set name = trim(p_name), gender = p_gender, default_style = p_default_style, pitch = coalesce(p_pitch, 1),
    lang = coalesce(p_lang, 'es-CO'), device_voice_hints = coalesce(p_device_voice_hints, '{}'),
    description = coalesce(p_description, ''), active = coalesce(p_active, true)
  where key = p_key;
  if not found then
    insert into dk_voice_profiles (key, name, gender, default_style, pitch, lang, device_voice_hints, description, active, sort_order)
    values (p_key, trim(p_name), p_gender, p_default_style, coalesce(p_pitch, 1), coalesce(p_lang, 'es-CO'),
            coalesce(p_device_voice_hints, '{}'), coalesce(p_description, ''), coalesce(p_active, true),
            coalesce((select max(sort_order) from dk_voice_profiles), 0) + 10);
  end if;
end;
$$;
revoke execute on function dk_platform_set_voice_profile(text, text, text, text, numeric, text, text[], text, boolean) from public, anon;
comment on function dk_platform_set_voice_profile is 'ADR 0014: create or update a voice profile of the catalog (platform admins).';
