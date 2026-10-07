-- ADR 0041 (D1): measure where the time of a voice question goes.
--
-- The run of a Copilot question (dk_ai_insights) already keeps the server's
-- timings (model rounds, tools, total). The app adds its own under
-- timings.client:
--   * with the question: how long until the recognizer listened (listenMs)
--     and how long the phrase took to close (endpointMs), plus whether it
--     came from «Oye Quanela» (wake) and was a follow-up (followUp);
--   * after the answer, here: until the sentence to say arrived (requestMs),
--     until Quanela started speaking (speechMs), from the last word to her
--     voice (totalMs), and whether it came in parts (streamed).
-- The two halves can arrive in any order (the run is closed in the
-- background), so dk_ai_run_finish now merges instead of overwriting.

-- Closes a reserved run (only its author, only once). Same as before, except
-- that the timings merge: what the app already reported under «client» stays.
create or replace function dk_ai_run_finish(
  p_run_id uuid, p_status text, p_output jsonb default null, p_input jsonb default null, p_input_tokens integer default null,
  p_output_tokens integer default null, p_latency_ms integer default null, p_error text default null,
  p_intent text default null, p_scope text default null, p_timings jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('ok', 'empty', 'error', 'cancelled') then
    raise exception 'Estado de corrida no válido';
  end if;
  update dk_ai_insights set
    status = p_status, output = p_output, input = coalesce(p_input, input),
    input_tokens = p_input_tokens, output_tokens = p_output_tokens, latency_ms = p_latency_ms,
    error = left(p_error, 500), intent = left(p_intent, 40), scope = p_scope,
    timings = case
      when p_timings is null then timings
      when timings ? 'client' or p_timings ? 'client'
        then coalesce(timings, '{}') || p_timings || jsonb_build_object('client', coalesce(timings -> 'client', '{}') || coalesce(p_timings -> 'client', '{}'))
      else coalesce(timings, '{}') || p_timings
    end
  where id = p_run_id and status = 'running'
    and kitchen_id = dk_current_kitchen_id() and created_by is not distinct from dk_current_profile_id();
end;
$$;

-- What the app measured after the answer, on the person's own recent Copilot
-- question. Only known keys: whole milliseconds between 0 and 60 000, or
-- true/false; anything else is dropped. Someone else's run, an old one or
-- another feature's: nothing changes.
create or replace function dk_ai_run_client_timings(p_run_id uuid, p_timings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean jsonb;
begin
  if p_timings is null or jsonb_typeof(p_timings) <> 'object' then
    raise exception 'Tiempos inválidos';
  end if;
  select jsonb_object_agg(t.key, case when jsonb_typeof(t.value) = 'number' then to_jsonb(round((t.value #>> '{}')::numeric)::integer) else t.value end)
    into v_clean
  from jsonb_each(p_timings) t
  where (t.key in ('listenMs', 'endpointMs', 'requestMs', 'speechMs', 'totalMs')
         and jsonb_typeof(t.value) = 'number' and (t.value #>> '{}')::numeric between 0 and 60000)
     or (t.key in ('wake', 'followUp', 'streamed') and jsonb_typeof(t.value) = 'boolean');
  if v_clean is null then return; end if;

  update dk_ai_insights
  set timings = coalesce(timings, '{}') || jsonb_build_object('client', coalesce(timings -> 'client', '{}') || v_clean)
  where id = p_run_id and feature_key = 'copilot'
    and kitchen_id = dk_current_kitchen_id() and created_by is not distinct from dk_current_profile_id()
    and created_at > now() - interval '15 minutes';
end;
$$;

revoke execute on function dk_ai_run_client_timings(uuid, jsonb) from public, anon;
grant execute on function dk_ai_run_client_timings(uuid, jsonb) to authenticated;
comment on function dk_ai_run_client_timings is 'ADR 0041: the app''s own timings of a voice question (until Quanela speaks), merged into timings.client of the person''s own recent Copilot run.';
