-- ADR 0015: the voice-model bucket is public for reading and closed for writing. Rolled-back transaction.
--
--   python3 supabase/tests/run.py voice_models

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
grant all on _t to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

insert into _t (area, test, expected, got) values ('Bucket', 'Exists, public, 100 MB limit', 'true · 104857600',
  (select public::text || ' · ' || file_size_limit::text from storage.buckets where id = 'dk-voice-models'));

-- A signed-in user (any account) cannot upload, replace or delete models.
insert into auth.users (id, email, aud, role) values ('00000000-0000-0000-0000-00000000c0a1', 'voz.modelos@prueba.test', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000c0a1', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  begin
    insert into storage.objects (bucket_id, name, owner) values ('dk-voice-models', 'hack/model.tar.gz', '00000000-0000-0000-0000-00000000c0a1');
    insert into _t (area, test, expected, got) values ('Security', 'Signed-in user uploads a model', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Security', 'Signed-in user uploads a model', 'blocked', 'blocked', sqlerrm); end;
  begin
    update storage.objects set name = 'x' where bucket_id = 'dk-voice-models';
    insert into _t (area, test, expected, got) values ('Security', 'Signed-in user renames models', '0 rows', (case when found then 'CHANGED' else '0 rows' end));
  exception when others then insert into _t (area, test, expected, got, detail) values ('Security', 'Signed-in user renames models', '0 rows', '0 rows', sqlerrm); end;
end $$;
reset role;

set local role anon;
do $$ begin
  begin
    insert into storage.objects (bucket_id, name) values ('dk-voice-models', 'anon/model.tar.gz');
    insert into _t (area, test, expected, got) values ('Security', 'Anonymous upload', 'blocked', 'ALLOWED');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Security', 'Anonymous upload', 'blocked', 'blocked', sqlerrm); end;
end $$;
reset role;

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
