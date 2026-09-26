-- Pruebas de planes, suscripción y registro con plan (ADR 0010).
-- Transacción revertida.
--
--   python3 supabase/tests/run.py plans

begin;

create temp table _t (n serial, area text, test text, expected text, got text, detail text) on commit drop;
create temp table _ctx (key text primary key, id uuid, txt text) on commit drop;
grant all on _t, _ctx to authenticated, anon;
grant usage on sequence _t_n_seq to authenticated, anon;

create or replace function pg_temp.act_as(p_auth uuid, p_kitchen uuid default null) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  select set_config('request.headers',
    (case when p_kitchen is null then '{}'::jsonb else jsonb_build_object('x-dk-kitchen-id', p_kitchen) end)::text, true);
$$;
create or replace function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true), set_config('request.headers', '{}', true);
$$;

insert into _ctx (key, id) values ('ivanAuth', (select id from auth.users where email = 'ivanclabe@gmail.com'));
insert into _ctx (key, id) values ('orgDK', (select organization_id from dk_kitchens where slug = 'dark-kitchen-1'));

insert into auth.users (id, email, aud, role, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000b1a01', 'business@plan.test', 'authenticated', 'authenticated', now(), '{"full_name": "Dueña Business"}'),
  ('00000000-0000-0000-0000-0000000b1a02', 'standard@plan.test', 'authenticated', 'authenticated', now(), '{"full_name": "Dueño Standard"}'),
  ('00000000-0000-0000-0000-0000000b1a03', 'tramposa@plan.test', 'authenticated', 'authenticated', now(), '{"full_name": "Tramposa"}');

-- 1. Precios sin sesión: solo catálogos
select pg_temp.as_owner();
set local role anon;
do $$ begin
  insert into _t (area, test, expected, got) values ('Público', 'Planes visibles sin sesión (en orden)', 'standard, business, enterprise',
    (select string_agg(key, ', ' order by sort_order) from dk_plans));
  insert into _t (area, test, expected, got) values ('Público', 'Funciones por plan visibles', '3 · 7 · 7',
    (select count(*) filter (where plan_key = 'standard') || ' · ' || count(*) filter (where plan_key = 'business') || ' · ' || count(*) filter (where plan_key = 'enterprise') from dk_plan_features));
  insert into _t (area, test, expected, got) values ('Público', 'Catálogo de funciones visible', '7', (select count(*)::text from dk_features));
  begin
    insert into _t (area, test, expected, got) values ('Público', 'Organizaciones cerradas', '0', (select count(*)::text from dk_organizations));
  exception when others then insert into _t (area, test, expected, got, detail) values ('Público', 'Organizaciones cerradas', '0', '0', sqlerrm); end;
  begin
    insert into _t (area, test, expected, got) values ('Público', 'Suscripciones cerradas', '0', (select count(*)::text from dk_subscriptions));
  exception when others then insert into _t (area, test, expected, got, detail) values ('Público', 'Suscripciones cerradas', '0', '0', sqlerrm); end;
  begin update dk_plans set price_monthly = 1;
    insert into _t (area, test, expected, got) values ('Público', 'Cambiar precios sin sesión', 'bloqueado', case when (select price_monthly from dk_plans where key = 'standard') = 1 then 'PERMITIDO' else 'bloqueado' end);
  exception when others then insert into _t (area, test, expected, got, detail) values ('Público', 'Cambiar precios sin sesión', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

-- La organización existente quedó en Enterprise activo
insert into _t (area, test, expected, got) values ('Migración', 'Organización existente: Enterprise activo', 'enterprise · active',
  (select plan_key || ' · ' || status from dk_subscriptions where organization_id = (select id from _ctx where key = 'orgDK')));

-- 2. Registro con plan inválido: no se crea nada
select pg_temp.act_as('00000000-0000-0000-0000-0000000b1a03');
set local role authenticated;
do $$ begin
  begin perform dk_create_organization('Sin plan', 'fast_food', 'burgers');
    insert into _t (area, test, expected, got) values ('Registro', 'Sin plan', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Registro', 'Sin plan', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin perform dk_create_organization('Enterprise gratis', 'fast_food', 'burgers', p_plan => 'enterprise');
    insert into _t (area, test, expected, got) values ('Registro', 'Enterprise por el registro (es por ventas)', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Registro', 'Enterprise por el registro (es por ventas)', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin perform dk_create_organization('Plan inventado', 'fast_food', 'burgers', p_plan => 'gratis_para_siempre');
    insert into _t (area, test, expected, got) values ('Registro', 'Plan inventado', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Registro', 'Plan inventado', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin perform dk_create_organization('Icono malo', 'fast_food', 'burgers', p_plan => 'standard', p_account_icon => 'https://malo.test/x.png');
    insert into _t (area, test, expected, got) values ('Registro', 'Icono de la primera cuenta inválido', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Registro', 'Icono de la primera cuenta inválido', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Registro', 'Intentos fallidos no dejan organizaciones', '0',
  (select count(*)::text from dk_organizations o join dk_users u on u.id = o.owner_user_id where u.auth_user_id = '00000000-0000-0000-0000-0000000b1a03'));

-- Plan retirado
update dk_plans set status = 'retired' where key = 'standard';
select pg_temp.act_as('00000000-0000-0000-0000-0000000b1a03');
set local role authenticated;
do $$ begin
  begin perform dk_create_organization('Plan retirado', 'fast_food', 'burgers', p_plan => 'standard');
    insert into _t (area, test, expected, got) values ('Registro', 'Plan retirado', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Registro', 'Plan retirado', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;
select pg_temp.as_owner();
update dk_plans set status = 'public' where key = 'standard';

-- 3. Registro con Business: organización + suscripción (prueba) + primera Cuenta + SUPER_ADMIN + ADMIN
select pg_temp.act_as('00000000-0000-0000-0000-0000000b1a01');
set local role authenticated;
do $$
declare v_slug text;
begin
  v_slug := dk_create_organization('Grupo XYZ', 'fast_food', 'burgers', p_plan => 'business', p_account_name => 'Hamburguesería Centro', p_account_icon => 'burger');
  insert into _ctx (key, id, txt) values ('bizK1', (select id from dk_kitchens where slug = v_slug), v_slug);
  insert into _ctx (key, id) values ('bizOrg', (select organization_id from dk_kitchens where slug = v_slug));
  insert into _t (area, test, expected, got) values ('Registro', 'La primera Cuenta con su nombre e icono', 'hamburgueseria-centro · Hamburguesería Centro · burger',
    (select slug || ' · ' || name || ' · ' || icon_key from dk_kitchens where slug = v_slug));
  insert into _t (area, test, expected, got) values ('Registro', 'El plan queda en la organización, en prueba de 14 días', 'business · trialing · 14',
    (select plan_key || ' · ' || status || ' · ' || round(extract(epoch from trial_ends_at - now()) / 86400) from dk_subscriptions
     where organization_id = (select id from _ctx where key = 'bizOrg')));
  insert into _t (area, test, expected, got) values ('Registro', 'SUPER_ADMIN y ADMIN en la primera Cuenta', 'true · ADMIN',
    (select (a ->> 'superAdmin') || ' · ' || (select string_agg(r ->> 'name', ' + ') from jsonb_array_elements(a -> 'roles') r)
     from jsonb_array_elements(dk_my_context() -> 'accounts') a where a ->> 'slug' = v_slug));
  insert into _t (area, test, expected, got) values ('Registro', 'Idempotente: repetir no crea otra', v_slug,
    dk_create_organization('Otro', 'cafe', 'coffee', p_plan => 'standard'));
  insert into _t (area, test, expected, got) values ('Suscripción', 'La organización ve su plan, límites y uso', 'business · 3 · 15 · 1 · 1 · true',
    (select (s -> 'plan' ->> 'key') || ' · ' || (s -> 'limits' ->> 'accounts') || ' · ' || (s -> 'limits' ->> 'users') || ' · ' ||
            (s -> 'usage' ->> 'accounts') || ' · ' || (s -> 'usage' ->> 'users') || ' · ' || (s ->> 'isCurrent')
     from (select dk_my_subscription((select id from _ctx where key = 'bizOrg')) s) x));

  -- Business: puede ofrecer IA
  perform dk_set_org_feature((select id from _ctx where key = 'bizOrg'), 'supply_reorder', true);
  perform dk_set_kitchen_feature((select id from _ctx where key = 'bizK1'), 'supply_reorder', true);
  insert into _ctx (key, id) values ('bizK2', dk_create_kitchen('Pizzería Norte', 'pizzeria-norte-plan', null, null, (select id from _ctx where key = 'bizOrg'), 'pizza'));
  -- Solo la plataforma cambia el plan
  begin perform dk_set_subscription((select id from _ctx where key = 'bizOrg'), 'enterprise');
    insert into _t (area, test, expected, got) values ('Suscripción', 'La organización se cambia de plan sola', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Suscripción', 'La organización se cambia de plan sola', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin update dk_subscriptions set plan_key = 'enterprise' where organization_id = (select id from _ctx where key = 'bizOrg');
  exception when others then null; -- sin permiso de escritura: se verifica abajo como dueño de la base
  end;
end $$;
reset role;

select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Suscripción', 'Escritura directa de la suscripción', 'business',
  (select plan_key from dk_subscriptions where organization_id = (select id from _ctx where key = 'bizOrg')));

select pg_temp.act_as('00000000-0000-0000-0000-0000000b1a01', (select id from _ctx where key = 'bizK1'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Funciones', 'Business: la IA se puede usar', 'true', dk_feature_state('supply_reorder') ->> 'usable');
end $$;
reset role;

-- 4. Standard: sin IA de modelo, 1 cuenta, 5 usuarios
select pg_temp.act_as('00000000-0000-0000-0000-0000000b1a02');
set local role authenticated;
do $$
declare v_slug text;
begin
  v_slug := dk_create_organization('Taquería Sur', 'fast_food', 'burgers', p_plan => 'standard');
  insert into _ctx (key, id) values ('stdOrg', (select organization_id from dk_kitchens where slug = v_slug));
  insert into _ctx (key, id) values ('stdK1', (select id from dk_kitchens where slug = v_slug));
  insert into _t (area, test, expected, got) values ('Registro', 'Sin nombre de cuenta: la primera Cuenta toma el del negocio', 'Taquería Sur',
    (select name from dk_kitchens where slug = v_slug));
  begin perform dk_set_org_feature((select id from _ctx where key = 'stdOrg'), 'supply_reorder', true);
    insert into _t (area, test, expected, got) values ('Funciones', 'Standard ofrece IA que su plan no incluye', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Funciones', 'Standard ofrece IA que su plan no incluye', 'bloqueado', 'bloqueado', sqlerrm); end;
  begin perform dk_set_kitchen_feature((select id from _ctx where key = 'stdK1'), 'supply_reorder', true);
    insert into _t (area, test, expected, got) values ('Funciones', 'Standard activa IA en su Cuenta', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Funciones', 'Standard activa IA en su Cuenta', 'bloqueado', 'bloqueado', sqlerrm); end;
  insert into _t (area, test, expected, got) values ('Funciones', 'Matriz: incluida en el plan · plan mínimo', 'false · Business · true',
    (select (f ->> 'includedInPlan') || ' · ' || (f ->> 'minPlan') || ' · ' ||
            (select g ->> 'includedInPlan' from jsonb_array_elements(dk_org_feature_matrix((select id from _ctx where key = 'stdOrg')) -> 'features') g where g ->> 'key' = 'voice_commands')
     from jsonb_array_elements(dk_org_feature_matrix((select id from _ctx where key = 'stdOrg')) -> 'features') f where f ->> 'key' = 'supply_reorder'));
  begin perform dk_create_kitchen('Segunda', 'segunda-standard', null, null, (select id from _ctx where key = 'stdOrg'));
    insert into _t (area, test, expected, got) values ('Límites', 'Standard crea una segunda Cuenta', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Límites', 'Standard crea una segunda Cuenta', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

select pg_temp.act_as('00000000-0000-0000-0000-0000000b1a02', (select id from _ctx where key = 'stdK1'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Funciones', 'Standard: motivo "plan"', 'false · plan',
    (dk_feature_state('supply_reorder') ->> 'usable') || ' · ' || (dk_feature_state('supply_reorder') ->> 'reason'));
  insert into _t (area, test, expected, got) values ('Funciones', 'Standard: la voz sí', 'true', dk_feature_state('voice_commands') ->> 'usable');
end $$;
reset role;

-- Usuarios: 5 en Standard (el dueño + 4); la reactivación también cuenta
select pg_temp.as_owner();
insert into dk_users (id, full_name, email, active) select ('20000000-0000-0000-0000-00000000000' || i)::uuid, 'Persona ' || i, 'persona' || i || '@plan.test', true from generate_series(1, 6) i;
do $$
declare i integer;
begin
  for i in 1..4 loop
    insert into dk_organization_members (organization_id, user_id, is_super_admin, status)
    values ((select id from _ctx where key = 'stdOrg'), ('20000000-0000-0000-0000-00000000000' || i)::uuid, false, case when i = 4 then 'pending' else 'active' end);
  end loop;
  begin
    insert into dk_organization_members (organization_id, user_id, is_super_admin, status)
    values ((select id from _ctx where key = 'stdOrg'), '20000000-0000-0000-0000-000000000005', false, 'active');
    insert into _t (area, test, expected, got) values ('Límites', 'Sexto usuario en Standard (pendientes cuentan)', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Límites', 'Sexto usuario en Standard (pendientes cuentan)', 'bloqueado', 'bloqueado', sqlerrm); end;
  -- Desactivar libera el puesto; reactivar sin puesto, no.
  update dk_organization_members set status = 'disabled' where organization_id = (select id from _ctx where key = 'stdOrg') and user_id = '20000000-0000-0000-0000-000000000001';
  insert into dk_organization_members (organization_id, user_id, is_super_admin, status)
  values ((select id from _ctx where key = 'stdOrg'), '20000000-0000-0000-0000-000000000005', false, 'active');
  insert into _t (area, test, expected, got) values ('Límites', 'Desactivar libera un puesto', 'permitido', 'permitido');
  begin
    update dk_organization_members set status = 'active' where organization_id = (select id from _ctx where key = 'stdOrg') and user_id = '20000000-0000-0000-0000-000000000001';
    insert into _t (area, test, expected, got) values ('Límites', 'Reactivar sin puesto libre', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Límites', 'Reactivar sin puesto libre', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;

-- 5. Bajar y subir de plan (plataforma): no se borra nada
select pg_temp.act_as((select id from _ctx where key = 'ivanAuth'));
set local role authenticated;
do $$ begin perform dk_set_subscription((select id from _ctx where key = 'bizOrg'), 'standard', 'active'); end $$;
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000b1a01', (select id from _ctx where key = 'bizK1'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Cambio de plan', 'Bajar a Standard: las 2 Cuentas se conservan', '2',
    (select count(*)::text from dk_kitchens where organization_id = (select id from _ctx where key = 'bizOrg')));
  insert into _t (area, test, expected, got) values ('Cambio de plan', 'Bajar a Standard: IA apagada, configuración de la Cuenta guardada', 'false · plan · true',
    (dk_feature_state('supply_reorder') ->> 'usable') || ' · ' || (dk_feature_state('supply_reorder') ->> 'reason') || ' · ' || (dk_feature_state('supply_reorder') ->> 'enabled'));
  begin perform dk_create_kitchen('Tercera', 'tercera-plan', null, null, (select id from _ctx where key = 'bizOrg'));
    insert into _t (area, test, expected, got) values ('Cambio de plan', 'Bajar a Standard: no crea más Cuentas', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Cambio de plan', 'Bajar a Standard: no crea más Cuentas', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;
select pg_temp.act_as((select id from _ctx where key = 'ivanAuth'));
set local role authenticated;
do $$ begin perform dk_set_subscription((select id from _ctx where key = 'bizOrg'), 'business'); end $$;
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000b1a01', (select id from _ctx where key = 'bizK1'));
set local role authenticated;
do $$ begin
  insert into _t (area, test, expected, got) values ('Cambio de plan', 'Volver a Business restaura la IA', 'true', dk_feature_state('supply_reorder') ->> 'usable');
  -- 6. Aislamiento entre organizaciones
  insert into _t (area, test, expected, got) values ('Aislamiento', 'No ve la suscripción de otra organización', '1',
    (select count(*)::text from dk_subscriptions));
  begin perform dk_my_subscription((select id from _ctx where key = 'stdOrg'));
    insert into _t (area, test, expected, got) values ('Aislamiento', 'Pide el plan de otra organización', 'bloqueado', 'PERMITIDO');
  exception when others then insert into _t (area, test, expected, got, detail) values ('Aislamiento', 'Pide el plan de otra organización', 'bloqueado', 'bloqueado', sqlerrm); end;
end $$;
reset role;

-- 7. Vigencia (lista para cobrar; hoy no bloquea)
select pg_temp.as_owner();
insert into _t (area, test, expected, got) values ('Suscripción', 'Prueba vigente', 'true', dk_subscription_is_current((select id from _ctx where key = 'stdOrg'))::text);
update dk_subscriptions set trial_ends_at = now() - interval '1 day' where organization_id = (select id from _ctx where key = 'stdOrg');
insert into _t (area, test, expected, got) values ('Suscripción', 'Prueba vencida', 'false', dk_subscription_is_current((select id from _ctx where key = 'stdOrg'))::text);

select area, test, expected, got, detail, case when got = expected then 'PASS' else 'FAIL' end as result from _t order by n;
rollback;
