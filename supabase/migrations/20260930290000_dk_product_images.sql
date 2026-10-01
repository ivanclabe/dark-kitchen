-- ADR 0018: up to two photos per dish.
--
--   * dk_product_images: one row per photo (position 1 = main, 2 = second),
--     in the account of the dish. Same visibility as dk_products; writing
--     needs products.edit in that account.
--   * dk_products.image_path mirrors the main photo (kept for existing readers).
--   * Public bucket dk-product-images: dish photos are not sensitive and are
--     shown everywhere (lists, menus), so they are served by URL with CDN
--     caching. Paths carry UUIDs; only products.edit in the same account can
--     upload, replace or delete. Invoices stay in the private dk-attachments.

create table dk_product_images (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default dk_current_kitchen_id() references dk_kitchens(id) on delete cascade,
  product_id uuid not null references dk_products(id) on delete cascade,
  path text not null unique,
  position smallint not null check (position in (1, 2)),
  width integer check (width > 0),
  height integer check (height > 0),
  created_at timestamptz not null default now(),
  created_by uuid default dk_current_profile_id() references dk_users(id) on delete set null,
  -- Deferred so the main and second photo can swap places in one statement.
  constraint dk_product_images_one_per_position unique (product_id, position) deferrable initially deferred
);

create index dk_product_images_kitchen on dk_product_images (kitchen_id);

comment on table dk_product_images is 'ADR 0018: dish photos (max 2; position 1 is the main one). Files live in the public bucket dk-product-images.';

-- The photo must belong to a dish of the same account.
create or replace function dk_product_images_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from dk_products p where p.id = new.product_id and p.kitchen_id = new.kitchen_id) then
    raise exception 'El plato no pertenece a esta cuenta';
  end if;
  if new.path not like 'kitchens/' || new.kitchen_id::text || '/products/' || new.product_id::text || '/%' then
    raise exception 'Ruta de imagen inválida';
  end if;
  return new;
end;
$$;

create trigger dk_product_images_check before insert or update on dk_product_images
  for each row execute function dk_product_images_check();

-- dk_products.image_path = path of the main photo (or null).
create or replace function dk_product_images_sync_main()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product uuid := case when tg_op = 'DELETE' then old.product_id else new.product_id end;
begin
  -- Deleting the main photo promotes the second one.
  if tg_op = 'DELETE' and old.position = 1 then
    update dk_product_images set position = 1 where product_id = v_product and position = 2;
  end if;
  update dk_products
  set image_path = (select i.path from dk_product_images i where i.product_id = v_product order by i.position limit 1)
  where id = v_product;
  return null;
end;
$$;

create trigger dk_product_images_sync_main after insert or update or delete on dk_product_images
  for each row execute function dk_product_images_sync_main();

alter table dk_product_images enable row level security;

create policy dk_product_images_select on dk_product_images for select to authenticated
  using (kitchen_id = (select dk_current_kitchen_id())
         and ((select dk_can('products.view')) or (select dk_can('menus.view')) or (select dk_can('orders.view'))
              or (select dk_can('kitchen.view')) or (select dk_can('dispatch.view')) or (select dk_can('recipes.view'))
              or (select dk_can('reports.view'))));
create policy dk_product_images_insert on dk_product_images for insert to authenticated
  with check (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('products.edit')));
create policy dk_product_images_update on dk_product_images for update to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('products.edit')))
  with check (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('products.edit')));
create policy dk_product_images_delete on dk_product_images for delete to authenticated
  using (kitchen_id = (select dk_current_kitchen_id()) and (select dk_can('products.edit')));

grant select, insert, update, delete on dk_product_images to authenticated;
revoke execute on function dk_product_images_check(), dk_product_images_sync_main() from public, anon, authenticated;

-- Main photo first: makes `id` the main one and the other (if any) the second.
create or replace function dk_set_main_product_image(p_image_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update dk_product_images
  set position = case when id = p_image_id then 1 else 2 end
  where product_id = (select product_id from dk_product_images where id = p_image_id);
$$;

grant execute on function dk_set_main_product_image(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dk-product-images', 'dk-product-images', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public URLs need no read policy; this one lets the account's editors
-- manage their files (Storage needs to see an object to replace or delete it).
create policy dk_product_images_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'dk-product-images'
         and (storage.foldername(name))[1] = 'kitchens'
         and (storage.foldername(name))[2] = (select dk_current_kitchen_id())::text);
create policy dk_product_images_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'dk-product-images'
              and (storage.foldername(name))[1] = 'kitchens'
              and (storage.foldername(name))[2] = (select dk_current_kitchen_id())::text
              and (storage.foldername(name))[3] = 'products'
              and (select dk_can('products.edit')));
create policy dk_product_images_storage_update on storage.objects for update to authenticated
  using (bucket_id = 'dk-product-images'
         and (storage.foldername(name))[2] = (select dk_current_kitchen_id())::text
         and (select dk_can('products.edit')));
create policy dk_product_images_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'dk-product-images'
         and (storage.foldername(name))[1] = 'kitchens'
         and (storage.foldername(name))[2] = (select dk_current_kitchen_id())::text
         and (select dk_can('products.edit')));
