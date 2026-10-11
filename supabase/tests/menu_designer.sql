-- ADR 0054: «Mis diseños» and the AI menu designer — proposals live in the
-- history only, using a design changes the draft (with a backup), publishing
-- is explicit, every publication is recorded; cap, permissions, isolation.
-- Rolled-back transaction.
--
--   python3 supabase/tests/run.py menu_designer

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid, v jsonb) on commit drop;
grant all on _t, _ctx to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', (case when p_kitchen is null then '{}'::jsonb else jsonb_build_object('x-dk-kitchen-id', p_kitchen) end)::text, true);
$$;
create or replace function pg_temp.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role": "anon"}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;
create or replace function pg_temp.k(p_key text) returns uuid language sql as $$ select id from _ctx where key = p_key $$;
create or replace function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return sqlerrm; end;
$$;
create or replace function pg_temp.blocked(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ALLOWED'; exception when others then return 'blocked'; end;
$$;
grant execute on function pg_temp.k(text), pg_temp.err(text), pg_temp.blocked(text) to anon;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000054a01', 'duena.ia@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000054a02', 'cocina.ia@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-000000054a01', '00000000-0000-0000-0000-000000054a01', 'Dueña', true),
  ('10000000-0000-0000-0000-000000054a02', '00000000-0000-0000-0000-000000054a02', 'Cocina', true);
insert into dk_organizations (slug, name, owner_user_id, sector, category) values ('grupo-ia', 'Grupo IA', '10000000-0000-0000-0000-000000054a01', 'fast_food', 'burgers');
insert into _ctx (key, id) values ('org', (select id from dk_organizations where slug = 'grupo-ia')),
  ('owner', '00000000-0000-0000-0000-000000054a01'), ('cook', '00000000-0000-0000-0000-000000054a02');
select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('A', dk_create_kitchen('IA A', 'ia-a-prueba', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();
update dk_subscriptions set plan_key = 'business' where organization_id = pg_temp.k('org');
select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('B', dk_create_kitchen('IA B', 'ia-b-prueba', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
  select pg_temp.k('A'), '10000000-0000-0000-0000-000000054a02', id from dk_roles where is_system and key = 'KITCHEN';
-- A dish on today's plan of A (the preview shows it, published or not).
insert into dk_products (id, kitchen_id, code, name, price) values ('52000000-0000-0000-0000-000000054a01', pg_temp.k('A'), 'SOPA', 'Sopa', 6000);
insert into dk_menu_plan_items (kitchen_id, plan_date, product_id, display_order, is_active)
  values (pg_temp.k('A'), (now() at time zone 'America/Bogota')::date, '52000000-0000-0000-0000-000000054a01', 1, true);


-- ---------------------------------------------------------------------------
-- 1. The AI function in the catalog
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_public_menu_settings_save('{"published": true, "ordersEnabled": true}');
  insert into _t (area, test, expected, got) values
    ('Catálogo', 'La dueña puede usar el diseñador con IA', 'true',
      (select f ->> 'usable' from jsonb_array_elements(dk_my_features()) f where f ->> 'key' = 'menu_designer')),
    ('Catálogo', 'Lo que se le dice a la IA: solo presentación', 'categories,cuisine,current,name,tagline',
      (select string_agg(k, ',' order by k) from jsonb_object_keys(dk_menu_design_ai_context()) k)),
    ('Catálogo', 'Las categorías de hoy (sin precios ni platos)', '["Otros"]', (dk_menu_design_ai_context() -> 'categories')::text);
end $$;
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values
  ('Catálogo', 'Función menu_designer: permiso storefront.manage, modelo Sonnet 5.5', 'storefront.manage · claude-sonnet-5-5',
    (select use_permission || ' · ' || model_key from dk_features where key = 'menu_designer'));

-- ---------------------------------------------------------------------------
-- 2. Proposals go to the history only (never to the draft nor to the public page)
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v jsonb;
begin
  v := dk_menu_design_save('Noche dorada', '{"template": "dark"}', 'ai', 'una carta elegante con fondo negro y detalles dorados', 'Fondo negro y dorado.');
  insert into _ctx (key, id) values ('d1', (v ->> 'id')::uuid);
  v := dk_menu_design_save('Clásica dorada', '{"template": "classic", "colors": {"background": "#111111", "surface": "#1A1A1A", "text": "#F5F1E8", "muted": "#B5AE9F", "price": "#D4A64A", "primary": "#D4A64A"}}', 'ai', 'una carta elegante con fondo negro y detalles dorados');
  insert into _ctx (key, id) values ('d2', (v ->> 'id')::uuid);
  insert into _t (area, test, expected, got) values
    ('Historial', 'Dos propuestas en «Mis diseños»', '2', jsonb_array_length(dk_menu_design_list())::text),
    ('Historial', 'Con su instrucción, su origen y quién la creó', 'ai · una carta elegante con fondo negro y detalles dorados · Dueña',
      (select (d ->> 'source') || ' · ' || (d ->> 'prompt') || ' · ' || (d ->> 'createdBy') from jsonb_array_elements(dk_menu_design_list()) d where (d ->> 'id')::uuid = pg_temp.k('d1'))),
    ('Separación', 'Generar NO cambia el borrador ni lo publicado', 'null · null',
      coalesce(dk_public_menu_settings() #>> '{themeDraft,template}', 'null') || ' · ' || coalesce(dk_public_menu_settings() #>> '{theme,template}', 'null'));
  -- A refinement is a new version linked to its parent.
  v := dk_menu_design_save('Noche dorada · v2', '{"template": "dark", "colors": {"background": "#1C1C20"}}', 'ai', 'haz el fondo un poco más claro', null, pg_temp.k('d1'));
  insert into _ctx (key, id) values ('d1v2', (v ->> 'id')::uuid);
  insert into _t (area, test, expected, got) values
    ('Historial', 'Pedir un cambio crea la versión 2, enlazada', 'true', ((v ->> 'parentId')::uuid = pg_temp.k('d1'))::text),
    ('Validación', 'Un diseño inválido no se guarda', 'Opción desconocida: css', pg_temp.err($q$select dk_menu_design_save('X', '{"css": "body{}"}', 'ai')$q$)),
    ('Validación', 'Una imagen de otra cuenta no se guarda', 'La portada no es de esta cuenta',
      pg_temp.err(format($q$select dk_menu_design_save('X', '{"header": {"cover": "kitchens/%s/branding/x.webp"}}', 'ai')$q$, pg_temp.k('B')))),
    ('Validación', 'Nadie guarda a mano un «publicado»', 'Origen no válido', pg_temp.err($q$select dk_menu_design_save('X', '{"template": "modern"}', 'published')$q$)),
    ('Validación', 'El texto de la instrucción se limita a 500', '500',
      (select char_length(dk_menu_design_save('Largo', '{"template": "modern"}', 'ai', repeat('a', 900)) ->> 'prompt')::text));
end $$;
reset role;
select pg_temp.as_anon();
set local role anon;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Separación', 'El cliente no ve nada del historial', 'null · Sopa',
      coalesce(dk_public_menu('ia-a-prueba') #>> '{theme,template}', 'null') || ' · ' || (dk_public_menu('ia-a-prueba') #>> '{items,0,name}'));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Use in the editor (draft) and publish, with the draft backed up
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$
declare v jsonb;
begin
  -- An unpublished draft that is not in the history.
  perform dk_public_menu_theme_save_draft('{"template": "fresh", "nav": "tabs"}');
  v := dk_menu_design_use(pg_temp.k('d2'));
  insert into _t (area, test, expected, got) values
    ('Usar', 'Usar en el editor: el borrador es el diseño', 'classic', dk_public_menu_settings() #>> '{themeDraft,template}'),
    ('Usar', 'El borrador anterior quedó en «Mis diseños»', 'true · 1', (v ->> 'backedUp') || ' · ' ||
      (select count(*)::text from dk_menu_designs where source = 'draft_backup' and design = '{"template": "fresh", "nav": "tabs"}'::jsonb)),
    ('Usar', 'Lo publicado no cambia', 'null', coalesce(dk_public_menu_settings() #>> '{theme,template}', 'null'));
  v := dk_menu_design_use(pg_temp.k('d1'));
  insert into _t (area, test, expected, got) values
    ('Usar', 'Un borrador que ya está en el historial no se duplica', 'false', v ->> 'backedUp');

  v := dk_menu_design_publish(pg_temp.k('d1v2'));
  insert into _t (area, test, expected, got) values
    ('Publicar', 'Publicar una tarjeta: borrador y publicado son ese diseño', '#1C1C20 · #1C1C20',
      (dk_public_menu_settings() #>> '{theme,colors,background}') || ' · ' || (dk_public_menu_settings() #>> '{themeDraft,colors,background}')),
    ('Publicar', 'La tarjeta queda marcada como publicada (sin duplicarse)', 'true · 0',
      ((select last_published_at is not null from dk_menu_designs where id = pg_temp.k('d1v2')))::text || ' · ' ||
      (select count(*)::text from dk_menu_designs where source = 'published'));
  -- Publishing from the editor records it in the history too.
  perform dk_public_menu_theme_save_draft('{"template": "artisan"}');
  perform dk_public_menu_theme_publish();
  insert into _t (area, test, expected, got) values
    ('Publicar', 'Publicar desde el editor queda en el historial', '1 · artisan',
      (select count(*)::text from dk_menu_designs where source = 'published') || ' · ' ||
      (select design ->> 'template' from dk_menu_designs where source = 'published'));
  perform dk_public_menu_theme_revert();
  insert into _t (area, test, expected, got) values
    ('Publicar', 'Volver al anterior marca otra vez la v2, sin filas nuevas', 'dark · 1',
      (dk_public_menu_settings() #>> '{theme,template}') || ' · ' || (select count(*)::text from dk_menu_designs where source = 'published'));
end $$;
reset role;
select pg_temp.as_anon();
set local role anon;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Público', 'El cliente ve el diseño publicado; el menú, igual', 'dark · Sopa · 6000',
      (dk_public_menu('ia-a-prueba') #>> '{theme,template}') || ' · ' || (dk_public_menu('ia-a-prueba') #>> '{items,0,name}') || ' · ' || (dk_public_menu('ia-a-prueba') #>> '{items,0,price}'));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Rename, favorite, delete, and the 200 cap
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Tarjetas', 'Renombrar y marcar favorito', 'Mi carta negra · true',
      (select (v ->> 'name') || ' · ' || (v ->> 'favorite') from (select dk_menu_design_update(pg_temp.k('d2'), 'Mi carta negra', true) v) x));
  perform dk_menu_design_delete(pg_temp.k('d1'));
  insert into _t (area, test, expected, got) values
    ('Tarjetas', 'Eliminar: la versión 2 se conserva sin padre', 'null', coalesce((select parent_id::text from dk_menu_designs where id = pg_temp.k('d1v2')), 'null'));
  for i in 1..205 loop perform dk_menu_design_save('Prueba ' || i, '{"template": "modern"}', 'editor'); end loop;
  insert into _t (area, test, expected, got) values
    ('Tope', 'Máximo 200 por negocio', '200', (select count(*)::text from dk_menu_designs)),
    ('Tope', 'Se conservan el favorito y lo publicado', 'true · true',
      (exists (select 1 from dk_menu_designs where id = pg_temp.k('d2')))::text || ' · ' || (exists (select 1 from dk_menu_designs where id = pg_temp.k('d1v2')))::text);
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. Isolation and permissions
-- ---------------------------------------------------------------------------
select pg_temp.as_owner();
insert into dk_ai_insights (id, feature_key, status, input, kitchen_id) values ('60000000-0000-0000-0000-000000054a01', 'menu_designer', 'ok', '{}', pg_temp.k('B'));
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('B'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Aislamiento', 'B no ve los diseños de A', '0', jsonb_array_length(dk_menu_design_list())::text),
    ('Aislamiento', 'B no usa, publica ni borra un diseño de A', 'blocked · blocked · blocked',
      pg_temp.blocked(format('select dk_menu_design_use(%L)', pg_temp.k('d2'))) || ' · ' ||
      pg_temp.blocked(format('select dk_menu_design_publish(%L)', pg_temp.k('d2'))) || ' · ' ||
      pg_temp.blocked(format('select dk_menu_design_delete(%L)', pg_temp.k('d2')))),
    ('Aislamiento', 'B no cuelga una versión de un diseño de A', 'El diseño anterior no existe',
      pg_temp.err(format($q$select dk_menu_design_save('X', '{"template": "modern"}', 'ai', null, null, %L)$q$, pg_temp.k('d2'))));
end $$;
reset role;
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Aislamiento', 'A no usa la ejecución de IA de B', 'La ejecución de IA no es de esta cuenta',
      pg_temp.err($q$select dk_menu_design_save('X', '{"template": "modern"}', 'ai', null, null, null, '60000000-0000-0000-0000-000000054a01')$q$)),
    ('Permisos', 'Nadie escribe la tabla directo', 'blocked',
      pg_temp.blocked($q$insert into dk_menu_designs (name, design, source) values ('X', '{}', 'editor')$q$));
end $$;
reset role;
select pg_temp.act_as(pg_temp.k('cook'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Permisos', 'Cocina: no lista, no guarda, no publica, no ve el contexto de IA', 'blocked · blocked · blocked · blocked',
      pg_temp.blocked('select dk_menu_design_list()') || ' · ' || pg_temp.blocked($q$select dk_menu_design_save('X', '{"template": "modern"}')$q$) || ' · ' ||
      pg_temp.blocked(format('select dk_menu_design_publish(%L)', pg_temp.k('d2'))) || ' · ' || pg_temp.blocked('select dk_menu_design_ai_context()')),
    ('Permisos', 'Cocina: la tabla no le muestra nada', '0', (select count(*)::text from dk_menu_designs)),
    ('Permisos', 'Cocina: el diseñador con IA no le aparece', 'false',
      (select f ->> 'usable' from jsonb_array_elements(dk_my_features()) f where f ->> 'key' = 'menu_designer'));
end $$;
reset role;
select pg_temp.as_anon();
set local role anon;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Permisos', 'Un anónimo no toca el historial', 'blocked · blocked',
      pg_temp.blocked('select dk_menu_design_list()') || ' · ' || pg_temp.blocked($q$select dk_menu_design_save('X', '{"template": "modern"}')$q$));
end $$;
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
