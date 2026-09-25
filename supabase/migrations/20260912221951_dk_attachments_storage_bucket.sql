-- Bucket privado para adjuntos de Dark Kitchen (facturas escaneadas, fotos).
insert into storage.buckets (id, name, public)
values ('dk-attachments', 'dk-attachments', false)
on conflict (id) do nothing;

create policy dk_attachments_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'dk-attachments' and dk_current_role() in ('ADMIN','MANAGER','INVENTORY'));

create policy dk_attachments_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'dk-attachments' and dk_current_role() in ('ADMIN','MANAGER','INVENTORY'));

create policy dk_attachments_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'dk-attachments' and dk_current_role() in ('ADMIN','MANAGER','INVENTORY'));
