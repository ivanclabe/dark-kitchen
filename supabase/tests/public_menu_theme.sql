-- ADR 0053: the design of the public menu — closed-list validation, draft vs
-- published, publish / discard / revert, the staff preview, permissions and
-- isolation. Rolled-back transaction.
--
--   python3 supabase/tests/run.py public_menu_theme

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
  ('00000000-0000-0000-0000-000000053a01', 'duena.diseno@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000053a02', 'cocina.diseno@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-000000053a01', '00000000-0000-0000-0000-000000053a01', 'Dueña', true),
  ('10000000-0000-0000-0000-000000053a02', '00000000-0000-0000-0000-000000053a02', 'Cocina', true);
insert into dk_organizations (slug, name, owner_user_id, sector, category) values ('grupo-diseno', 'Grupo Diseño', '10000000-0000-0000-0000-000000053a01', 'fast_food', 'burgers');
insert into _ctx (key, id) values ('org', (select id from dk_organizations where slug = 'grupo-diseno')),
  ('owner', '00000000-0000-0000-0000-000000053a01'), ('cook', '00000000-0000-0000-0000-000000053a02');
select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('A', dk_create_kitchen('Diseño A', 'diseno-a-prueba', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();
update dk_subscriptions set plan_key = 'business' where organization_id = pg_temp.k('org');
select pg_temp.act_as(pg_temp.k('owner'));
set local role authenticated;
do $$ begin insert into _ctx (key, id) values ('B', dk_create_kitchen('Diseño B', 'diseno-b-prueba', 'America/Bogota', null, pg_temp.k('org'))); end $$;
reset role;
select pg_temp.as_owner();
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id)
  select pg_temp.k('A'), '10000000-0000-0000-0000-000000053a02', id from dk_roles where is_system and key = 'KITCHEN';
-- A dish on today's plan of A (the preview shows it, published or not).
insert into dk_products (id, kitchen_id, code, name, price) values ('52000000-0000-0000-0000-000000053a01', pg_temp.k('A'), 'SOPA', 'Sopa', 6000);
insert into dk_menu_plan_items (kitchen_id, plan_date, product_id, display_order, is_active)
  values (pg_temp.k('A'), (now() at time zone 'America/Bogota')::date, '52000000-0000-0000-0000-000000053a01', 1, true);

-- ---------------------------------------------------------------------------
-- 1. Validation (closed list)
-- ---------------------------------------------------------------------------
insert into _t (area, test, expected, got) values
  ('Validación', 'Un diseño completo y válido', 'válido',
    coalesce(dk_public_menu_theme_problem(jsonb_build_object(
      'template', 'classic',
      'colors', jsonb_build_object('primary', '#7A1F1F', 'background', '#F4ECD8', 'surface', '#FBF6EA', 'text', '#2A1E14', 'price', '#2A1E14'),
      'fonts', jsonb_build_object('heading', 'Playfair Display', 'body', 'Lora', 'scale', 'L'),
      'background', jsonb_build_object('kind', 'image', 'image', 'kitchens/' || pg_temp.k('A') || '/branding/fondo.webp'),
      'header', jsonb_build_object('style', 'cover', 'cover', 'kitchens/' || pg_temp.k('A') || '/branding/portada.webp', 'showTagline', true, 'showHours', false),
      'cards', jsonb_build_object('layout', 'menu', 'style', 'flat', 'image', 'hide', 'imageShape', 'circle', 'imagePosition', 'right', 'description', 'full'),
      'nav', 'tabs', 'buttons', 'square'), pg_temp.k('A')), 'válido')),
  ('Validación', 'Sin diseño (null) es válido', 'válido', coalesce(dk_public_menu_theme_problem(null, pg_temp.k('A')), 'válido')),
  ('Validación', 'Opción desconocida (CSS libre)', 'Opción desconocida: css', dk_public_menu_theme_problem('{"css": "body{}"}', pg_temp.k('A'))),
  ('Validación', 'Color que no es hexadecimal', 'El color text no es un color válido', dk_public_menu_theme_problem('{"colors": {"text": "red;background:url(x)"}}', pg_temp.k('A'))),
  ('Validación', 'Fuente fuera de la lista', 'Fuente de títulos no disponible', dk_public_menu_theme_problem('{"fonts": {"heading": "Comic Sans"}}', pg_temp.k('A'))),
  ('Validación', 'Plantilla desconocida', 'Plantilla desconocida', dk_public_menu_theme_problem('{"template": "neon"}', pg_temp.k('A'))),
  ('Validación', 'Variante desconocida', 'Forma de las tarjetas no válida', dk_public_menu_theme_problem('{"cards": {"layout": "zigzag"}}', pg_temp.k('A'))),
  ('Validación', 'Portada de otra cuenta', 'La portada no es de esta cuenta',
    dk_public_menu_theme_problem(jsonb_build_object('header', jsonb_build_object('cover', 'kitchens/' || pg_temp.k('B') || '/branding/x.webp')), pg_temp.k('A'))),
  ('Validación', 'Imagen fuera de la carpeta de marca', 'La imagen de fondo no es de esta cuenta',
    dk_public_menu_theme_problem(jsonb_build_object('background', jsonb_build_object('image', 'https://otro.sitio/x.png')), pg_temp.k('A'))),
  ('Validación', 'Demasiado grande', 'El diseño es demasiado grande', dk_public_menu_theme_problem(jsonb_build_object('template', 'modern', 'nav', repeat('x', 5000)), pg_temp.k('A')));

-- ---------------------------------------------------------------------------
-- 2. Draft, publish, discard, revert
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_public_menu_settings_save('{"published": true, "ordersEnabled": true}');
  perform dk_public_menu_theme_save_draft('{"template": "elegant"}');
  insert into _t (area, test, expected, got) values
    ('Borrador', 'El borrador se ve en la vista previa', 'elegant', dk_public_menu_preview() #>> '{theme,template}'),
    ('Borrador', 'El personal ve borrador y publicado por separado', 'elegant · null',
      (dk_public_menu_settings() #>> '{themeDraft,template}') || ' · ' || coalesce(dk_public_menu_settings() #>> '{theme,template}', 'null')),
    ('Borrador', 'Guardar un diseño inválido: rechazado', 'Color desconocido: neon', pg_temp.err($q$select dk_public_menu_theme_save_draft('{"colors": {"neon": "#FFFFFF"}}')$q$));
end $$;
reset role;
select pg_temp.as_anon();
set local role anon;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Público', 'El cliente NO ve el borrador', 'null', coalesce(dk_public_menu('diseno-a-prueba') #>> '{theme,template}', 'null')),
    ('Público', 'El contenido sigue igual (el plato de hoy, su precio)', 'Sopa · 6000', (dk_public_menu('diseno-a-prueba') #>> '{items,0,name}') || ' · ' || (dk_public_menu('diseno-a-prueba') #>> '{items,0,price}'));
end $$;
reset role;

select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_public_menu_theme_publish();
  perform dk_public_menu_theme_save_draft('{"template": "dark"}');
end $$;
reset role;
select pg_temp.as_anon();
set local role anon;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Público', 'Publicado: el cliente ve «elegante», no el nuevo borrador «dark»', 'elegant', dk_public_menu('diseno-a-prueba') #>> '{theme,template}');
end $$;
reset role;

select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  perform dk_public_menu_theme_discard();
  insert into _t (area, test, expected, got) values ('Borrador', 'Descartar: el borrador vuelve a lo publicado', 'elegant', dk_public_menu_settings() #>> '{themeDraft,template}');
  perform dk_public_menu_theme_save_draft('{"template": "classic"}');
  perform dk_public_menu_theme_publish();
  insert into _t (area, test, expected, got) values ('Publicar', 'Publicado «classic», con el anterior guardado', 'classic · true',
    (dk_public_menu_settings() #>> '{theme,template}') || ' · ' || (dk_public_menu_settings() ->> 'hasPreviousTheme'));
  perform dk_public_menu_theme_revert();
  insert into _t (area, test, expected, got) values ('Publicar', 'Volver al anterior: vuelve «elegante» (y el borrador también)', 'elegant · elegant',
    (dk_public_menu_settings() #>> '{theme,template}') || ' · ' || (dk_public_menu_settings() #>> '{themeDraft,template}'));
end $$;
reset role;

-- The tracking page wears the published design.
select pg_temp.as_owner();
insert into dk_customers (id, kitchen_id, full_name) values ('30000000-0000-0000-0000-000000053a01', pg_temp.k('A'), 'Cliente');
insert into dk_orders (id, kitchen_id, customer_id, channel, public_token) values
  ('40000000-0000-0000-0000-000000053a01', pg_temp.k('A'), '30000000-0000-0000-0000-000000053a01', 'WEB', '41000000-0000-0000-0000-000000053a01');
select pg_temp.as_anon();
set local role anon;
do $$ begin
  insert into _t (area, test, expected, got) values ('Seguimiento', 'El seguimiento usa el diseño publicado', 'elegant',
    dk_public_order_status('41000000-0000-0000-0000-000000053a01') #>> '{business,theme,template}');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Preview without publishing, permissions and isolation
-- ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('B'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Vista previa', 'B sin publicar: la vista previa funciona y es la de B', 'true · Diseño B · 0',
      (dk_public_menu_preview() ->> 'found') || ' · ' || (dk_public_menu_preview() #>> '{business,name}') || ' · ' || jsonb_array_length(dk_public_menu_preview() -> 'items'));
  perform dk_public_menu_theme_save_draft('{"template": "fresh"}');
end $$;
reset role;
select pg_temp.act_as(pg_temp.k('owner'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Aislamiento', 'El borrador de B no toca a A', 'elegant', dk_public_menu_preview() #>> '{theme,template}');
end $$;
reset role;

select pg_temp.act_as(pg_temp.k('cook'), pg_temp.k('A'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Permisos', 'Cocina: no guarda, no publica, no ve la vista previa', 'blocked · blocked · blocked',
      pg_temp.blocked($q$select dk_public_menu_theme_save_draft('{"template": "modern"}')$q$) || ' · ' ||
      pg_temp.blocked('select dk_public_menu_theme_publish()') || ' · ' || pg_temp.blocked('select dk_public_menu_preview()'));
end $$;
reset role;
select pg_temp.as_anon();
set local role anon;
do $$ begin
  insert into _t (area, test, expected, got) values
    ('Permisos', 'Un anónimo no edita ni ve borradores', 'blocked · blocked',
      pg_temp.blocked($q$select dk_public_menu_theme_save_draft('{"template": "modern"}')$q$) || ' · ' || pg_temp.blocked('select dk_public_menu_preview()')),
    ('Permisos', 'Un anónimo no usa el armador interno', 'blocked', pg_temp.blocked(format('select dk_public_menu_build(%L, null)', pg_temp.k('A'))));
end $$;
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
