-- ADR 0071: legal documents, acceptance evidence (immutable, chained), re-acceptance, PQR with radicado and
-- legal terms, data-subject tools and the consents of each business's customers. Transacción revertida.
--
--   python3 supabase/tests/run.py legal_compliance

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid, v jsonb) on commit drop;
grant all on _t, _ctx to authenticated;
grant usage on sequence _t_n_seq to authenticated;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid default null, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated', 'aal', p_aal)::text, true);
  select set_config('request.headers', (jsonb_build_object('x-forwarded-for', '181.49.10.20, 10.0.0.1', 'user-agent', 'Prueba/1.0')
                                        || case when p_kitchen is null then '{}'::jsonb else jsonb_build_object('x-dk-kitchen-id', p_kitchen) end)::text, true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.v(p_key text) returns jsonb language sql as $$ select v from _ctx where key = p_key $$;
create or replace function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return sqlerrm; end;
$$;
create or replace function pg_temp.hint(p_sql text) returns text language plpgsql as $$
declare v_hint text; v_state text;
begin execute p_sql; return 'ALLOWED';
exception when others then get stacked diagnostics v_hint = pg_exception_hint, v_state = returned_sqlstate;
  return coalesce(nullif(v_hint, ''), v_state); end;
$$;
-- The versions in force (the suite does not depend on which one is published).
create or replace function pg_temp.ver(p_slug text) returns text language sql stable as $$ select (dk_current_legal_document(p_slug)).version $$;
create or replace function pg_temp.docs(variadic p_slugs text[]) returns jsonb language sql stable as $$
  select jsonb_agg(jsonb_build_object('slug', s, 'version', pg_temp.ver(s))) from unnest(p_slugs) s
$$;
grant execute on function pg_temp.err(text), pg_temp.hint(text), pg_temp.k(text), pg_temp.v(text), pg_temp.ver(text), pg_temp.docs(text[]) to authenticated;

-- 1. Business days (Colombia, 2026): holidays from Ley 51 de 1983 and Easter, terms from the next day.
insert into _t (area, test, expected, got) values
  ('Plazos', 'Festivos 2026 (18)', '18', (select count(*)::text from dk_co_holidays(2026))),
  ('Plazos', 'Reyes, San José, Ascensión, Corpus y Sagrado Corazón se corren al lunes', '2026-01-12 2026-03-23 2026-05-18 2026-06-08 2026-06-15',
    (select string_agg(d::text, ' ' order by d) from dk_co_holidays(2026) d where d in ('2026-01-12', '2026-03-23', '2026-05-18', '2026-06-08', '2026-06-15'))),
  ('Plazos', 'Jueves y Viernes Santo 2026', '2026-04-02 2026-04-03',
    (select string_agg(d::text, ' ' order by d) from dk_co_holidays(2026) d where d between '2026-03-30' and '2026-04-05')),
  ('Plazos', '10 días hábiles desde un viernes', '2026-10-30', dk_add_business_days('2026-10-16 15:00-05', 10)::text),
  ('Plazos', '3 días hábiles saltando Navidad y el fin de semana', '2026-12-28', dk_add_business_days('2026-12-22 10:00-05', 3)::text),
  ('Plazos', 'Radicado un sábado: cuenta desde el lunes', '2026-10-19', dk_add_business_days('2026-10-17 11:00-05', 1)::text),
  ('Plazos', 'A las 23:30 en Bogotá ya es ese día (no el siguiente en UTC)', '2026-10-20', dk_add_business_days('2026-10-19 23:30-05', 1)::text);

-- Emptying an evidence table is refused (checked while it is empty: nothing else is pending on it yet).
insert into _t (area, test, expected, got) values
  ('Evidencia', 'Vaciar la tabla de aceptaciones (dueño de la base)', 'immutable_evidence', pg_temp.hint($q$truncate dk_legal_acceptances$q$)),
  ('Evidencia', 'Vaciar la de autorizaciones de clientes', 'immutable_evidence', pg_temp.hint($q$truncate dk_customer_consents$q$));

-- People: an owner (org + account), a cook in her account, a stranger in another org, and a Global Admin.
insert into auth.users (id, email, aud, role, created_at) values
  ('00000000-0000-0000-0000-000000071a01', 'duena.legal@prueba.test', 'authenticated', 'authenticated', now() - interval '2 minutes'),
  ('00000000-0000-0000-0000-000000071a02', 'cocina.legal@prueba.test', 'authenticated', 'authenticated', now() - interval '1 minute'),
  ('00000000-0000-0000-0000-000000071a03', 'otra.legal@prueba.test', 'authenticated', 'authenticated', now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000071a04', 'ga.legal@prueba.test', 'authenticated', 'authenticated', now() - interval '30 days');
insert into dk_users (id, auth_user_id, full_name, active, platform_role) values
  ('10000000-0000-0000-0000-000000071a01', '00000000-0000-0000-0000-000000071a01', 'Dueña', true, null),
  ('10000000-0000-0000-0000-000000071a02', '00000000-0000-0000-0000-000000071a02', 'Cocinero', true, null),
  ('10000000-0000-0000-0000-000000071a03', '00000000-0000-0000-0000-000000071a03', 'Otra', true, null),
  ('10000000-0000-0000-0000-000000071a04', '00000000-0000-0000-0000-000000071a04', 'Plataforma', true, 'SUPERADMIN');
insert into dk_organizations (slug, name, owner_user_id, sector, category) values
  ('grupo-legal', 'Grupo Legal', '10000000-0000-0000-0000-000000071a01', 'fast_food', 'burgers'),
  ('grupo-otro-legal', 'Grupo Otro', '10000000-0000-0000-0000-000000071a03', 'fast_food', 'burgers');
insert into _ctx (key, id) values
  ('org', (select id from dk_organizations where slug = 'grupo-legal')),
  ('org2', (select id from dk_organizations where slug = 'grupo-otro-legal')),
  ('owner', '00000000-0000-0000-0000-000000071a01'), ('cook', '00000000-0000-0000-0000-000000071a02'),
  ('other', '00000000-0000-0000-0000-000000071a03'), ('ga', '00000000-0000-0000-0000-000000071a04');

select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('A', dk_create_kitchen('Centro', 'centro-legal', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.act_as(pg_temp.k('other'));
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('B', dk_create_kitchen('Otra', 'otra-legal', 'America/Bogota', null, pg_temp.k('org2'))); end $$;
reset role;
select pg_temp.as_owner();
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
  select pg_temp.k('A'), '10000000-0000-0000-0000-000000071a02', id from dk_roles where is_system and key = 'KITCHEN';
update dk_kitchens set legal_name = 'Centro Legal S.A.S.', tax_id = '900123456-7', phone = '+573001112233', address = 'Calle 1 # 2-3' where id = pg_temp.k('A');

-- 2. Documents in force and the acceptance at sign-up.
select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Documentos', 'Sin aceptar nada, pide Términos y Política de datos', 'privacidad:first terminos:first',
    (select string_agg(slug || ':' || reason, ' ' order by slug) from dk_my_pending_legal_documents())),
  ('Documentos', 'Cualquiera puede leer las versiones publicadas (los seis documentos)', '6', (select count(distinct slug)::text from dk_legal_documents)),
  ('Aceptación', 'Una versión vieja no se acepta', 'stale_version',
    pg_temp.hint($q$select dk_record_legal_acceptance('[{"slug": "terminos", "version": "0.9"}]', 'signup')$q$)),
  ('Aceptación', 'Un documento informativo no se acepta', 'invalid',
    pg_temp.hint(format($q$select dk_record_legal_acceptance('[{"slug": "cookies", "version": %s}]', 'signup')$q$, to_jsonb((dk_current_legal_document('cookies')).version)))),
  ('Aceptación', 'Contexto inventado', 'invalid',
    pg_temp.hint(format($q$select dk_record_legal_acceptance(%L, 'por_si_acaso')$q$, pg_temp.docs('terminos')))),
  ('Aceptación', 'Las dos casillas quedan registradas', '2',
    (select dk_record_legal_acceptance(pg_temp.docs('terminos', 'privacidad'), 'signup', '{"method": "email"}')::text));
-- (A statement does not see the rows it writes itself: the checks go in the next one.)
insert into _t (area, test, expected, got) values
  ('Aceptación', 'Ya no queda nada pendiente', '0', (select count(*)::text from dk_my_pending_legal_documents())),
  ('Aceptación', 'Evidencia: versión, hash, contexto, IP (primer salto) y navegador', 'terminos ' || pg_temp.ver('terminos') || ' · hash ok · signup · checkbox · 181.49.10.20 · Prueba/1.0',
    (select a.document_slug || ' ' || a.document_version || ' · ' || case when a.content_sha256 = d.content_sha256 then 'hash ok' else 'hash distinto' end
            || ' · ' || a.context || ' · ' || a.method || ' · ' || a.client_ip || ' · ' || a.user_agent
     from dk_legal_acceptances a join dk_legal_documents d on d.slug = a.document_slug and d.version = a.document_version
     where a.document_slug = 'terminos')),
  ('Aceptación', 'Sign-up por correo: la hora es la de creación de la cuenta (marcó antes de confirmar)', 'auth_user_created_at · antes',
    (select (details ->> 'consented_at_source') || ' · ' || case when consented_at < recorded_at then 'antes' else 'igual' end
     from dk_legal_acceptances where document_slug = 'privacidad')),
  ('Aceptación', 'Escribir la tabla directamente: prohibido', 'permission denied for table dk_legal_acceptances',
    pg_temp.err($q$insert into dk_legal_acceptances (auth_user_id, document_slug, document_version, content_sha256, action, context, method, consented_at, row_sha256)
                   values (auth.uid(), 'terminos', '1.0', 'x', 'accepted', 'signup', 'checkbox', now(), 'x')$q$)),
  ('Aceptación', 'Su historial (con título)', 'Política de Tratamiento de Datos Personales y Privacidad · Términos y Condiciones',
    (select string_agg(title, ' · ' order by title) from dk_my_legal_acceptances())),
  ('Renovación', 'Autorizar la renovación automática en un negocio ajeno', '42501',
    pg_temp.hint(format($q$select dk_record_legal_acceptance(%L, 'billing_renewal', '{}', %L)$q$, pg_temp.docs('suscripciones'), pg_temp.k('org2')))),
  ('Renovación', 'La dueña autoriza la renovación de su negocio', '1',
    (select dk_record_legal_acceptance(pg_temp.docs('suscripciones'), 'billing_renewal', '{"plan": "business"}', pg_temp.k('org'))::text));
reset role;

select pg_temp.act_as(pg_temp.k('other'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Aislamiento', 'Otra persona no ve las aceptaciones ajenas', '0', (select count(*)::text from dk_legal_acceptances)),
  ('Aislamiento', 'Y sigue con sus documentos pendientes', '2', (select count(*)::text from dk_my_pending_legal_documents()));
reset role;

select pg_temp.act_as(pg_temp.k('cook'));
set local role authenticated;
-- An existing user asked when entering the app: the time is the acceptance's, never the account's creation.
insert into _t (area, test, expected, got) values
  ('Aceptación', 'Al entrar a la app (cuenta reciente): registra ambos documentos', '2',
    (select dk_record_legal_acceptance(pg_temp.docs('terminos', 'privacidad'), 'app_gate')::text));
insert into _t (area, test, expected, got) values
  ('Aceptación', 'Al entrar a la app: la hora es la de la aceptación', 'app_gate · igual',
    (select min(context) || ' · ' || case when bool_and(consented_at = recorded_at) then 'igual' else 'distinta' end from dk_legal_acceptances)),
  ('Renovación', 'Quien no factura no autoriza cobros', '42501',
    pg_temp.hint(format($q$select dk_record_legal_acceptance(%L, 'billing_renewal', '{}', %L)$q$, pg_temp.docs('suscripciones'), pg_temp.k('org'))));
reset role;

-- 3. Immutable evidence: no edit nor delete, not even as the database owner; the chain detects tampering.
insert into _t (area, test, expected, got) values
  ('Evidencia', 'Modificar una aceptación (dueño de la base)', 'immutable_evidence', pg_temp.hint($q$update dk_legal_acceptances set client_ip = '1.1.1.1'$q$)),
  ('Evidencia', 'Borrar una aceptación (dueño de la base)', 'immutable_evidence', pg_temp.hint($q$delete from dk_legal_acceptances$q$)),
  ('Evidencia', 'Cambiar el texto de una versión publicada', 'immutable_evidence', pg_temp.hint($q$update dk_legal_documents set content_sha256 = repeat('0', 64)$q$)),
  ('Evidencia', 'Cada fila apunta a la anterior', 'true',
    (select bool_and(a.prev_sha256 is not distinct from (select b.row_sha256 from dk_legal_acceptances b where b.id < a.id order by b.id desc limit 1))::text
     from dk_legal_acceptances a));

select pg_temp.act_as(pg_temp.k('ga'), null, 'aal2');
set local role authenticated;
insert into _t (area, test, expected, got) values ('Evidencia', 'La cadena está íntegra', '(íntegra)', coalesce(dk_verify_evidence_chain('dk_legal_acceptances')::text, '(íntegra)'));
reset role;
select pg_temp.as_owner();
-- Someone with full control of the database disables the guard and edits a row: the chain says where.
alter table dk_legal_acceptances disable trigger dk_legal_acceptances_immutable;
update dk_legal_acceptances set client_ip = '1.1.1.1' where document_slug = 'privacidad';
alter table dk_legal_acceptances enable trigger dk_legal_acceptances_immutable;
select pg_temp.act_as(pg_temp.k('ga'), null, 'aal2');
set local role authenticated;
insert into _t (area, test, expected, got) values ('Evidencia', 'Una fila editada a escondidas rompe la cadena en esa fila', 'privacidad',
  (select document_slug from dk_legal_acceptances where id = dk_verify_evidence_chain('dk_legal_acceptances')));
reset role;
select pg_temp.act_as(pg_temp.k('ga'));
set local role authenticated;
insert into _t (area, test, expected, got) values ('Evidencia', 'Verificar la cadena exige el segundo factor', 'ERROR',
  case when pg_temp.err($q$select dk_verify_evidence_chain('dk_legal_acceptances')$q$) = 'ALLOWED' then 'ALLOWED' else 'ERROR' end);
reset role;
select pg_temp.as_owner();

-- 4. A new version that asks for a new acceptance: pending again; the old acceptances stay.
insert into _ctx (key, v) values ('terminos-before', to_jsonb(pg_temp.ver('terminos')));
insert into dk_legal_documents (slug, version, title, effective_date, content_sha256, acceptance, requires_reacceptance)
  values ('terminos', '9.1', 'Términos y Condiciones', (now() at time zone 'America/Bogota')::date, repeat('a', 64), 'required', true);
-- One announced for next month is not in force yet.
insert into dk_legal_documents (slug, version, title, effective_date, content_sha256, acceptance, requires_reacceptance)
  values ('privacidad', '9.2', 'Política de Tratamiento de Datos Personales y Privacidad', (now() at time zone 'America/Bogota')::date + 30, repeat('b', 64), 'required', true);
select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Nueva versión', 'Pide la versión nueva de los Términos (la de privacidad aún no rige)', 'terminos 9.1 new_version',
    (select string_agg(slug || ' ' || version || ' ' || reason, ', ') from dk_my_pending_legal_documents())),
  ('Nueva versión', 'Aceptar la anterior otra vez ya no sirve', 'stale_version',
    pg_temp.hint(format($q$select dk_record_legal_acceptance('[{"slug": "terminos", "version": %s}]', 'reacceptance')$q$, pg_temp.v('terminos-before')))),
  ('Nueva versión', 'Acepta la nueva', '1', (select dk_record_legal_acceptance('[{"slug": "terminos", "version": "9.1"}]', 'reacceptance')::text));
insert into _t (area, test, expected, got) values
  ('Nueva versión', 'Las aceptaciones anteriores se conservan', 'terminos ' || (pg_temp.v('terminos-before') #>> '{}') || ', terminos 9.1',
    (select string_agg(document_slug || ' ' || document_version, ', ' order by id) from dk_legal_acceptances where document_slug = 'terminos')),
  ('Nueva versión', 'Nada pendiente', '0', (select count(*)::text from dk_my_pending_legal_documents()));
reset role;
select pg_temp.as_owner();

-- 5. PQR: radicado, legal term, what was filed never changes, the platform answers.
select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin insert into _ctx (key, v) values ('pqr1', dk_create_pqr('consulta', 'Quiero saber qué datos míos tienen y para qué los usan.')); end $$;
do $$ begin insert into _ctx (key, v) values ('pqr2', dk_create_pqr('retracto', 'Me retracto de la suscripción que pagué ayer, por favor.', pg_temp.k('org'))); end $$;
insert into _t (area, test, expected, got) values
  ('PQR', 'Radicado con el año y consecutivo', 'true',
    ((pg_temp.v('pqr1') ->> 'radicado') ~ ('^PQR-' || extract(year from now() at time zone 'America/Bogota') || '-[0-9]{5}$'))::text),
  ('PQR', 'Consecutivos distintos', 'true', ((pg_temp.v('pqr1') ->> 'radicado') <> (pg_temp.v('pqr2') ->> 'radicado'))::text),
  ('PQR', 'Consulta: 10 días hábiles (Ley 1581 art. 14)', 'true · Ley 1581 de 2012, art. 14',
    ((pg_temp.v('pqr1') ->> 'dueDate')::date = dk_add_business_days(now(), 10))::text || ' · ' || (pg_temp.v('pqr1') ->> 'legalBasis')),
  ('PQR', 'Retracto: 15 días hábiles, con la fecha límite del retracto (sin pagos: vacía)', 'true · null',
    ((pg_temp.v('pqr2') ->> 'dueDate')::date = dk_add_business_days(now(), 15))::text || ' · '
      || coalesce((select details ->> 'firstPaymentAt' from dk_pqr_requests where radicado = pg_temp.v('pqr2') ->> 'radicado'), 'null')),
  ('PQR', 'Descripción muy corta', 'invalid', pg_temp.hint($q$select dk_create_pqr('queja', 'mal')$q$)),
  ('PQR', 'Tipo inventado', 'invalid', pg_temp.hint($q$select dk_create_pqr('amenaza', 'Una solicitud cualquiera de prueba')$q$)),
  ('PQR', 'Sus solicitudes (la más nueva primero)', 'retracto, consulta', (select string_agg(kind, ', ') from dk_my_pqr_requests())),
  ('PQR', 'No puede cambiar la respuesta ella misma', 'permission denied for table dk_pqr_requests',
    pg_temp.err($q$update dk_pqr_requests set status = 'respondida'$q$)),
  ('PQR', 'Ni responder como plataforma', 'ERROR',
    case when pg_temp.err(format($q$select dk_ga_update_pqr(%L, 'respondida', 'Listo')$q$, (select id from dk_pqr_requests limit 1))) = 'ALLOWED' then 'ALLOWED' else 'ERROR' end);
reset role;

select pg_temp.act_as(pg_temp.k('cook'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('PQR', 'Quien no factura no pide reembolsos del negocio', '42501',
    pg_temp.hint(format($q$select dk_create_pqr('reembolso', 'Me cobraron dos veces este mes, por favor.', %L)$q$, pg_temp.k('org')))),
  ('PQR', 'Pero sí consulta sus propios datos', 'ALLOWED', pg_temp.err($q$select dk_create_pqr('consulta', 'Qué datos míos guarda quanela, por favor.')$q$));
insert into _t (area, test, expected, got) values
  ('PQR', 'Y no ve las solicitudes de la dueña', '1', (select count(*)::text from dk_pqr_requests));
reset role;

select pg_temp.act_as(pg_temp.k('ga'), null, 'aal2');
set local role authenticated;
do $$
declare v_id uuid := (select id from dk_pqr_requests where radicado = pg_temp.v('pqr1') ->> 'radicado');
begin
  insert into _t (area, test, expected, got) values
    ('Plataforma', 'Responder sin texto', 'invalid', pg_temp.hint(format($q$select dk_ga_update_pqr(%L, 'respondida')$q$, v_id))),
    ('Plataforma', 'Prorrogar sin motivo', 'invalid', pg_temp.hint(format($q$select dk_ga_update_pqr(%L, 'en_tramite', null, true)$q$, v_id))),
    ('Plataforma', 'Prorrogar con motivo (+5 días hábiles)', 'ALLOWED',
      pg_temp.err(format($q$select dk_ga_update_pqr(%L, 'en_tramite', 'Necesitamos revisar la bitácora', true)$q$, v_id))),
    ('Plataforma', 'Solo se prorroga una vez', 'invalid',
      pg_temp.hint(format($q$select dk_ga_update_pqr(%L, 'en_tramite', 'Otra vez', true)$q$, v_id))),
    ('Plataforma', 'Responde', 'ALLOWED', pg_temp.err(format($q$select dk_ga_update_pqr(%L, 'respondida', 'Tenemos tu nombre, correo y negocio.')$q$, v_id))),
    ('Plataforma', 'La bandeja ve las tres de esta prueba', '3', (select count(*)::text from dk_ga_pqr_requests() where requester_email like '%.legal@prueba.test'));
end $$;
insert into _t (area, test, expected, got) values ('Evidencia', 'La historia de las solicitudes está íntegra', '(íntegra)',
  coalesce(dk_verify_evidence_chain('dk_pqr_events')::text, '(íntegra)'));
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values
  ('PQR', 'Prórroga: 5 días hábiles más sobre el vencimiento', 'true',
    (select (extended_due_date = dk_add_business_days(due_date::timestamp at time zone 'America/Bogota', 5))::text from dk_pqr_requests where radicado = pg_temp.v('pqr1') ->> 'radicado')),
  ('PQR', 'Historia: radicada, prórroga, respuesta', 'filed extended answered',
    (select string_agg(e.event, ' ' order by e.id) from dk_pqr_events e join dk_pqr_requests r on r.id = e.request_id where r.radicado = pg_temp.v('pqr1') ->> 'radicado')),
  ('PQR', 'Lo radicado no se edita (ni el dueño de la base)', 'immutable_evidence', pg_temp.hint($q$update dk_pqr_requests set description = 'otra cosa'$q$)),
  ('PQR', 'Ni se borra', 'immutable_evidence', pg_temp.hint($q$delete from dk_pqr_requests$q$));

select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('PQR', 'Ella ve la respuesta', 'respondida · Tenemos tu nombre, correo y negocio.',
    (select status || ' · ' || response from dk_my_pqr_requests() where radicado = pg_temp.v('pqr1') ->> 'radicado')),
  ('Mis datos', 'Su archivo: cuenta, perfil, organizaciones, aceptaciones y solicitudes', 'duena.legal@prueba.test · Dueña · 1 · 4 · 2',
    (select (d -> 'account' ->> 'email') || ' · ' || (d -> 'profile' ->> 'fullName') || ' · ' || jsonb_array_length(d -> 'organizations')
            || ' · ' || jsonb_array_length(d -> 'legalAcceptances') || ' · ' || jsonb_array_length(d -> 'requests')
     from (select dk_export_my_data() d) x));
reset role;
select pg_temp.as_owner();

-- 6. The business's customers: WhatsApp notices history, dietary data only with express authorization,
--    orders by WhatsApp (conduct after the notice) and the anonymization on request.
insert into dk_customers (id, full_name, phone, email, address, notes, kitchen_id, whatsapp_opt_in, whatsapp_opt_in_source, whatsapp_opt_in_at) values
  ('30000000-0000-0000-0000-000000071a01', 'Lucía Pérez', '+573001234567', 'lucia@prueba.test', 'Cra 5 # 6-7', 'Llamar antes', pg_temp.k('A'), true, 'web', now());
insert into dk_customer_addresses (kitchen_id, customer_id, address, recipient_name) values
  (pg_temp.k('A'), '30000000-0000-0000-0000-000000071a01', 'Calle 80 # 10-20, oficina', 'Portería');
insert into dk_orders (id, customer_id, kitchen_id, channel, fulfillment, delivery_address) values
  ('40000000-0000-0000-0000-000000071a01', '30000000-0000-0000-0000-000000071a01', pg_temp.k('A'), 'WHATSAPP', 'delivery', 'Cra 5 # 6-7');
insert into dk_wa_conversations (kitchen_id, phone, customer_id, customer_name) values (pg_temp.k('A'), '+573001234567', '30000000-0000-0000-0000-000000071a01', 'Lucía');

select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Clientes', 'Alimentaria sin autorización expresa', 'consent_required',
    pg_temp.hint($q$insert into dk_customer_preferences (customer_id, kind, label) values ('30000000-0000-0000-0000-000000071a01', 'dietary', 'Sin gluten')$q$)),
  ('Clientes', 'Con la autorización declarada se guarda', 'ALLOWED',
    pg_temp.err($q$insert into dk_customer_preferences (customer_id, kind, label, authorized_by_customer) values ('30000000-0000-0000-0000-000000071a01', 'dietary', 'Vegetariano', true)$q$)),
  ('Clientes', 'Un gusto (no sensible) no lo pide', 'ALLOWED',
    pg_temp.err($q$insert into dk_customer_preferences (customer_id, kind, label) values ('30000000-0000-0000-0000-000000071a01', 'disliked_ingredient', 'Cebolla')$q$)),
  ('Clientes', 'Desactivar los avisos de WhatsApp', 'ALLOWED',
    pg_temp.err($q$update dk_customers set whatsapp_opt_in = false, whatsapp_opt_out_at = now() where id = '30000000-0000-0000-0000-000000071a01'$q$));
insert into _t (area, test, expected, got) values
  ('Clientes', 'Historia de autorizaciones: avisos (web), pedido por WhatsApp, alimentaria, avisos retirados',
    'whatsapp_notices:granted:public_menu:checkbox order_processing:granted:whatsapp:conduct sensitive_preferences:granted:staff:staff_declared whatsapp_notices:withdrawn:staff:staff_declared',
    (select string_agg(purpose || ':' || action || ':' || channel || ':' || method, ' ' order by id) from dk_customer_consents)),
  ('Clientes', 'Con la identificación del negocio de ese momento', 'Centro Legal S.A.S. · 900123456-7',
    (select (kitchen_snapshot ->> 'legalName') || ' · ' || (kitchen_snapshot ->> 'taxId') from dk_customer_consents order by id limit 1)),
  ('Clientes', 'La evidencia no se escribe a mano', 'permission denied for table dk_customer_consents',
    pg_temp.err($q$insert into dk_customer_consents (kitchen_id, channel, purpose, action, method, row_sha256) values (dk_current_kitchen_id(), 'staff', 'order_processing', 'granted', 'checkbox', 'x')$q$));
insert into _t (area, test, expected, got) values
  ('Supresión', 'Borrar los datos del cliente', 'ALLOWED', pg_temp.err($q$select dk_anonymize_customer('30000000-0000-0000-0000-000000071a01')$q$));
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values
  ('Supresión', 'Sin nada que lo identifique', 'Cliente anonimizado ·  ·  ·  · ',
    (select full_name || ' · ' || coalesce(phone, '') || ' · ' || coalesce(email, '') || ' · ' || coalesce(address, '') || ' · ' || coalesce(notes, '')
     from dk_customers where id = '30000000-0000-0000-0000-000000071a01')),
  ('Supresión', 'Sin direcciones, preferencias ni conversaciones', '0 · 0 · 0',
    (select count(*)::text from dk_customer_addresses where customer_id = '30000000-0000-0000-0000-000000071a01') || ' · ' ||
    (select count(*)::text from dk_customer_preferences where customer_id = '30000000-0000-0000-0000-000000071a01') || ' · ' ||
    (select count(*)::text from dk_wa_conversations where kitchen_id = pg_temp.k('A'))),
  ('Supresión', 'El pedido se conserva sin la dirección', '1 · ',
    (select count(*)::text || ' · ' || coalesce(max(delivery_address), '') from dk_orders where customer_id = '30000000-0000-0000-0000-000000071a01')),
  ('Supresión', 'Queda en la bitácora', '1', (select count(*)::text from dk_audit_log where event_type = 'customers.anonymized' and kitchen_id = pg_temp.k('A'))),
  ('Supresión', 'La evidencia de las autorizaciones se conserva', '4', (select count(*)::text from dk_customer_consents where customer_id = '30000000-0000-0000-0000-000000071a01'));

select pg_temp.act_as(pg_temp.k('cook'), pg_temp.k('A'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Supresión', 'Cocina no borra clientes', '42501', pg_temp.hint($q$select dk_anonymize_customer('30000000-0000-0000-0000-000000071a01')$q$));
reset role;
select pg_temp.act_as(pg_temp.k('other'), pg_temp.k('B'));
set local role authenticated;
insert into _t (area, test, expected, got) values
  ('Aislamiento', 'Otro negocio no ve las autorizaciones', '0', (select count(*)::text from dk_customer_consents)),
  ('Aislamiento', 'Ni anonimiza clientes ajenos', 'not_found', pg_temp.hint($q$select dk_anonymize_customer('30000000-0000-0000-0000-000000071a01')$q$));
reset role;

-- 7. The business's policy page: its own identification, from the public menu slug only.
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values
  ('Política del negocio', 'Sin menú publicado no hay política', 'null', coalesce(dk_public_kitchen_privacy('centro-legal')::text, 'null'));

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;

rollback;
