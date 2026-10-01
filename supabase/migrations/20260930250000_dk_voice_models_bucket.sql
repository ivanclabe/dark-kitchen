-- ADR 0015: public, read-only bucket for offline speech-recognition models
-- (Vosk). Files are downloaded once per device through the public URL and
-- cached by the browser. No write policies: only the service role (platform
-- tooling) uploads models; the app can only read them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dk-voice-models', 'dk-voice-models', true, 104857600, array['application/gzip', 'application/x-gzip', 'application/octet-stream'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
