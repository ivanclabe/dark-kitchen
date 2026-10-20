-- ADR 0072: the brand is written «quanela» (lowercase), as in its wordmark. What the database shows to people
-- changes with it: permission and feature names, and the messages of its functions. The activity log keeps
-- what it recorded (history is not rewritten).

update dk_permissions
set label = regexp_replace(label, '\mQuanela\M', 'quanela', 'g'),
    description = regexp_replace(description, '\mQuanela\M', 'quanela', 'g')
where label ~ '\mQuanela\M' or description ~ '\mQuanela\M';

update dk_features
set label = regexp_replace(label, '\mQuanela\M', 'quanela', 'g'),
    description = regexp_replace(description, '\mQuanela\M', 'quanela', 'g')
where label ~ '\mQuanela\M' or description ~ '\mQuanela\M';

-- Functions whose messages say «Quanela»: recreated with the same definition, only the brand changes.
do $$
declare
  f record;
begin
  for f in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.prosrc ~ '\mQuanela\M'
  loop
    execute regexp_replace(pg_get_functiondef(f.oid), '\mQuanela\M', 'quanela', 'g');
  end loop;
end $$;

-- The legal documents say «quanela» too: new versions of the same text (no new acceptance needed).
insert into dk_legal_documents (slug, version, title, effective_date, content_sha256, acceptance, requires_reacceptance) values
  ('terminos', '1.1', 'Términos y Condiciones', '2026-10-20', '0543311a9fc9e63dba50f48e05b6fe1186bcb88215b26de7cde9432aac5d3ddf', 'required', false),
  ('privacidad', '1.1', 'Política de Tratamiento de Datos Personales y Privacidad', '2026-10-20', 'bfb460ca12c009359ce357e5b4eaad3504e8278e34ac773c3b72f3b7d81211d5', 'required', false),
  ('suscripciones', '1.1', 'Suscripciones, renovación automática y cobros', '2026-10-20', 'abf298e168a4c7c2b0310319cd0cae6e0c0cca56975a82a6b305d506270f7dc8', 'billing', false),
  ('reembolsos', '1.1', 'Política de Cancelaciones y Reembolsos', '2026-10-20', 'b678c6df657e7d441286db4d07ae5ee72db01270a02090b9c3bc105f95799184', 'informational', false),
  ('cookies', '1.2', 'Política de Cookies', '2026-10-20', '00f056190eae0d90c5080bceeb094971fdeb75d75151afd10f904a1b4d2f7d4d', 'informational', false),
  ('politica-cocina', '1.1', 'Política de tratamiento de datos de {{cocina.nombre}}', '2026-10-20', '8d10fd73179f7e6b39626ef972e7a51b58e2ca55cd7f6e606ab14106be703a1c', 'customers', false)
on conflict (slug, version) do nothing;
