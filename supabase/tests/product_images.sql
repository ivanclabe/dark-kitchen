-- ADR 0018: dish photos (table, main photo, RLS, public bucket and its write policies). Rolled-back transaction.
--
--   python3 supabase/tests/run.py product_images

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid) on commit drop;
grant all on _t, _ctx to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers', case when p_kitchen is null then '{}' else jsonb_build_object('x-dk-kitchen-id', p_kitchen)::text end, true);
$$;
create or replace function pg_temp.role_id(p_key text) returns uuid language sql as $$ select id from dk_roles where is_system and key = p_key $$;

insert into _ctx values ('A', (select id from dk_kitchens where slug = 'dark-kitchen-1'));
insert into _ctx values ('B', (select id from dk_kitchens where slug <> 'dark-kitchen-1' order by created_at limit 1));

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000f1a1', 'admin.fotos@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f1a2', 'cocina.fotos@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f1b1', 'admin.fotos.b@prueba.test', 'authenticated', 'authenticated');
insert into dk_users (id, auth_user_id, full_name, active) values
  ('10000000-0000-0000-0000-00000000f1a1', '00000000-0000-0000-0000-00000000f1a1', 'Admin A (fotos)', true),
  ('10000000-0000-0000-0000-00000000f1a2', '00000000-0000-0000-0000-00000000f1a2', 'Cocina A (fotos)', true),
  ('10000000-0000-0000-0000-00000000f1b1', '00000000-0000-0000-0000-00000000f1b1', 'Admin B (fotos)', true);
insert into dk_kitchen_members (kitchen_id, user_id, default_role_id) values
  ((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-00000000f1a1', pg_temp.role_id('ADMIN')),
  ((select id from _ctx where key = 'A'), '10000000-0000-0000-0000-00000000f1a2', pg_temp.role_id('KITCHEN')),
  ((select id from _ctx where key = 'B'), '10000000-0000-0000-0000-00000000f1b1', pg_temp.role_id('ADMIN'));

insert into dk_products (id, kitchen_id, name, price)
values ('20000000-0000-0000-0000-00000000f1d1', (select id from _ctx where key = 'A'), 'Plato con fotos (prueba)', 10000);
insert into _ctx values ('dish', '20000000-0000-0000-0000-00000000f1d1');

-- 0. Infrastructure
insert into _t (area, test, expected, got) values ('Storage', 'Public bucket, 5 MB, WebP/JPEG/PNG', 'true · 5242880 · 3',
  (select public::text || ' · ' || file_size_limit::text || ' · ' || array_length(allowed_mime_types, 1)::text from storage.buckets where id = 'dk-product-images'));
insert into _t (area, test, expected, got) values ('Storage', 'Invoices stay private', 'false',
  (select public::text from storage.buckets where id = 'dk-attachments'));

-- 1. The account admin (products.edit) adds two photos
select pg_temp.act_as('00000000-0000-0000-0000-00000000f1a1', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$
declare
  v_base text := 'kitchens/' || (select id from _ctx where key = 'A') || '/products/' || (select id from _ctx where key = 'dish') || '/';
begin
  insert into storage.objects (bucket_id, name, owner) values ('dk-product-images', v_base || 'uno.webp', auth.uid());
  insert into _t (area, test, expected, got) values ('Storage', 'Editor uploads to its account folder', 'ok', 'ok');

  insert into dk_product_images (product_id, path, position, width, height) values ((select id from _ctx where key = 'dish'), v_base || 'uno.webp', 1, 1600, 1200);
  insert into _t (area, test, expected, got) values ('Photos', 'Main photo mirrored on the dish', 'uno.webp',
    (select split_part(image_path, '/', 5) from dk_products where id = (select id from _ctx where key = 'dish')));

  insert into dk_product_images (product_id, path, position) values ((select id from _ctx where key = 'dish'), v_base || 'dos.webp', 2);
  insert into _t (area, test, expected, got) values ('Photos', 'Two photos', '2',
    (select count(*)::text from dk_product_images where product_id = (select id from _ctx where key = 'dish')));

  begin insert into dk_product_images (product_id, path, position) values ((select id from _ctx where key = 'dish'), v_base || 'tres.webp', 3);
    insert into _t (area, test, expected, got) values ('Photos', 'A third photo', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Photos', 'A third photo', 'blocked', 'blocked', sqlerrm); end;

  begin
    set constraints dk_product_images_one_per_position immediate;
    insert into dk_product_images (product_id, path, position) values ((select id from _ctx where key = 'dish'), v_base || 'otra.webp', 2);
    insert into _t (area, test, expected, got) values ('Photos', 'Two photos in the same place', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Photos', 'Two photos in the same place', 'blocked', 'blocked', sqlerrm); end;
  set constraints dk_product_images_one_per_position deferred;

  begin insert into dk_product_images (product_id, path, position) values ((select id from _ctx where key = 'dish'), 'kitchens/otra/ruta.webp', 1);
    insert into _t (area, test, expected, got) values ('Photos', 'Path outside the dish folder', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Photos', 'Path outside the dish folder', 'blocked', 'blocked', sqlerrm); end;

  -- Swap: the second becomes the main one
  perform dk_set_main_product_image((select id from dk_product_images where path = v_base || 'dos.webp'));
  set constraints dk_product_images_one_per_position immediate;
  insert into _t (area, test, expected, got) values ('Photos', 'Swap main and second', 'dos.webp · uno.webp',
    (select split_part(image_path, '/', 5) from dk_products where id = (select id from _ctx where key = 'dish')) || ' · ' ||
    (select split_part(path, '/', 5) from dk_product_images where product_id = (select id from _ctx where key = 'dish') and position = 2));
  set constraints dk_product_images_one_per_position deferred;

  -- Deleting the main one promotes the other
  delete from dk_product_images where path = v_base || 'dos.webp';
  insert into _t (area, test, expected, got) values ('Photos', 'Delete main: the other becomes main', 'uno.webp · 1',
    (select split_part(image_path, '/', 5) from dk_products where id = (select id from _ctx where key = 'dish')) || ' · ' ||
    (select position::text from dk_product_images where product_id = (select id from _ctx where key = 'dish')));
end $$;
reset role;

-- 2. Kitchen team (no products.edit): sees, cannot change
select pg_temp.act_as('00000000-0000-0000-0000-00000000f1a2', (select id from _ctx where key = 'A'));
set local role authenticated;
do $$
declare
  v_base text := 'kitchens/' || (select id from _ctx where key = 'A') || '/products/' || (select id from _ctx where key = 'dish') || '/';
begin
  insert into _t (area, test, expected, got) values ('Permissions', 'Kitchen team sees the photos', '1',
    (select count(*)::text from dk_product_images where product_id = (select id from _ctx where key = 'dish')));
  begin insert into dk_product_images (product_id, path, position) values ((select id from _ctx where key = 'dish'), v_base || 'k.webp', 2);
    insert into _t (area, test, expected, got) values ('Permissions', 'Kitchen team adds a photo', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Permissions', 'Kitchen team adds a photo', 'blocked', 'blocked', sqlerrm); end;
  delete from dk_product_images where product_id = (select id from _ctx where key = 'dish');
  insert into _t (area, test, expected, got) values ('Permissions', 'Kitchen team deletes a photo', '0 rows', case when found then 'DELETED' else '0 rows' end);
  begin insert into storage.objects (bucket_id, name, owner) values ('dk-product-images', v_base || 'k.webp', auth.uid());
    insert into _t (area, test, expected, got) values ('Storage', 'Kitchen team uploads a file', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Storage', 'Kitchen team uploads a file', 'blocked', 'blocked', sqlerrm); end;
end $$;
reset role;

-- 3. Another account: neither sees nor writes
select pg_temp.act_as('00000000-0000-0000-0000-00000000f1b1', (select id from _ctx where key = 'B'));
set local role authenticated;
do $$
declare
  v_base text := 'kitchens/' || (select id from _ctx where key = 'A') || '/products/' || (select id from _ctx where key = 'dish') || '/';
begin
  insert into _t (area, test, expected, got) values ('Isolation', 'Another account sees the photos', '0',
    (select count(*)::text from dk_product_images where product_id = (select id from _ctx where key = 'dish')));
  begin insert into storage.objects (bucket_id, name, owner) values ('dk-product-images', v_base || 'b.webp', auth.uid());
    insert into _t (area, test, expected, got) values ('Isolation', 'Another account uploads into A''s folder', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Isolation', 'Another account uploads into A''s folder', 'blocked', 'blocked', sqlerrm); end;
  begin insert into dk_product_images (kitchen_id, product_id, path, position) values ((select id from _ctx where key = 'A'), (select id from _ctx where key = 'dish'), v_base || 'b.webp', 2);
    insert into _t (area, test, expected, got) values ('Isolation', 'Another account adds a photo to A''s dish', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Isolation', 'Another account adds a photo to A''s dish', 'blocked', 'blocked', sqlerrm); end;
end $$;
reset role;

-- 4. Anonymous: cannot upload
set local role anon;
do $$ begin
  begin insert into storage.objects (bucket_id, name) values ('dk-product-images', 'kitchens/x/products/y/anon.webp');
    insert into _t (area, test, expected, got) values ('Storage', 'Anonymous upload', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Storage', 'Anonymous upload', 'blocked', 'blocked', sqlerrm); end;
end $$;
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
