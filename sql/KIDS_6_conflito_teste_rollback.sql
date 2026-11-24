-- =====================================================================
-- KIDS_6 · Criança em um só culto/sala no mesmo horário · TESTE COM ROLLBACK
-- Rodar inteiro no SQL Editor. Resultado esperado (é um ERRO de propósito, nada fica gravado):
--   ERROR P0001: TESTE KIDS_6 CONCLUIDO (nada foi gravado): T1 ok; T2 ok; T3 ok; T4 ok; T5 ok; T6 ok (REVERTER ok)
--   T1  entrada no culto A (hoje)
--   T2  culto B no mesmo horário: recusa (ainda na sala do A)
--   T3  culto C amanhã: recusa enquanto a criança não foi retirada do A
--   T4  retirada do A; culto B (horário sobreposto) continua recusado
--   T5  culto C amanhã: entra
--   T6  REVERTER: sem o gatilho a trava some (prova que é o gatilho)
-- =====================================================================
do $t$
declare
  v_ch uuid := gen_random_uuid(); v_au_m uuid := gen_random_uuid(); v_au_l uuid := gen_random_uuid(); v_au_v uuid := gen_random_uuid();
  v_p_m uuid; v_p_l uuid; v_p_v uuid; v_pai uuid; v_ua uuid; v_cua uuid; v_prof uuid;
  v_kids uuid; v_ca uuid; v_cb uuid; v_cc uuid; v_ea uuid; v_eb uuid; v_ec uuid; v_c uuid; v_ka uuid;
  r jsonb; v_s text; v_cod text; v_res text := '';
begin
  -- APLICAR (identico ao _aplicar, sem begin/commit)
do $g$
begin
  if to_regclass('app.kids_checkins') is null then
    raise exception 'KIDS_6 ABORTADO: KIDS_3 nao aplicado. Nada foi alterado.';
  end if;
  if exists (select 1 from pg_trigger where tgrelid = 'app.kids_checkins'::regclass and tgname = 'trg_v39_kids_checkin_conflict') then
    raise exception 'KIDS_6 ABORTADO: gatilho ja existe (KIDS_6 ja aplicado?). Nada foi alterado.';
  end if;
end $g$;

create or replace function private.v39_kids_event_end(e app.church_events) returns timestamptz
language sql immutable set search_path = pg_catalog, app as $f$
  select coalesce(e.ends_at, e.starts_at + interval '3 hours')
$f$;

create or replace function private.v39_kids_checkin_conflict() returns trigger
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare ne app.church_events; v_nome text;
begin
  if new.status <> 'present' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('kids_checkin:' || new.child_person_id::text, 0));
  select * into ne from app.church_events where id = new.event_id;
  select e.name into v_nome
    from app.kids_checkins c join app.church_events e on e.id = c.event_id
   where c.child_person_id = new.child_person_id and c.church_id = new.church_id
     and c.event_id <> new.event_id and c.status <> 'cancelled'
     and (c.status = 'present'
          or (e.starts_at < private.v39_kids_event_end(ne) and ne.starts_at < private.v39_kids_event_end(e)))
   order by (c.status = 'present') desc, c.checked_in_at desc
   limit 1;
  if v_nome is not null then
    perform app.raise_domain_error('KIDS_CHECKIN_CONFLICT', 'A crianca ja esta em outro culto/evento no mesmo horario: ' || v_nome,
                                   jsonb_build_object('evento', v_nome));
  end if;
  return new;
end $f$;

create trigger trg_v39_kids_checkin_conflict before insert on app.kids_checkins
  for each row execute function private.v39_kids_checkin_conflict();

revoke all on function private.v39_kids_event_end(app.church_events) from public;
revoke all on function private.v39_kids_checkin_conflict() from public;


  create function pg_temp.k6_as(p uuid) returns void language sql as $x$
    select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', p::text, true) $x$;
  create function pg_temp.k6_q(p_sql text) returns jsonb language plpgsql as $x$
    declare v jsonb; begin execute 'set local role authenticated'; execute 'select to_jsonb((' || p_sql || '))' into v; execute 'reset role'; return v; end $x$;
  create function pg_temp.k6_err(p_sql text) returns text language plpgsql as $x$
    begin execute 'set local role authenticated'; execute 'select (' || p_sql || ')'; execute 'reset role'; return 'OK';
    exception when others then return sqlerrm; end $x$;

  insert into app.churches (id, name, slug, timezone) values (v_ch, 'Igreja Teste KIDS_6', 'teste-kids6-' || left(v_ch::text, 8), 'America/Sao_Paulo');
  insert into auth.users (id, email) values (v_au_m, 'k6m@teste.invalid'), (v_au_l, 'k6l@teste.invalid'), (v_au_v, 'k6v@teste.invalid');
  insert into app.people (full_name) values ('K6 Master') returning id into v_p_m;
  insert into app.people (full_name) values ('K6 Lider') returning id into v_p_l;
  insert into app.people (full_name) values ('K6 Voluntario') returning id into v_p_v;
  insert into app.people (full_name, birth_date) values ('Pai Teste', current_date - interval '35 years') returning id into v_pai;
  insert into app.church_people (church_id, person_id, status) values (v_ch, v_p_m, 'active'), (v_ch, v_p_l, 'active'), (v_ch, v_p_v, 'active'), (v_ch, v_pai, 'active');
  insert into app.person_contacts (person_id, contact_type, contact_value, normalized_value, is_primary) values (v_pai, 'whatsapp', '11966660000', '11966660000', true);
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_m, v_p_m, 'active', now(), 'k6m') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  select id into v_prof from app.access_profiles where code = 'master';
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');
  select id into v_prof from app.access_profiles where code = 'disciple';
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_l, v_p_l, 'active', now(), 'k6l') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_v, v_p_v, 'active', now(), 'k6v') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');

  perform pg_temp.k6_as(v_au_m);
  r := pg_temp.k6_q(format('app.v39_min_save(%L, %L::jsonb)', v_ch, jsonb_build_object('nome', 'Kids', 'tipo', 'kids', 'liderId', v_p_l)));
  v_kids := (r->>'id')::uuid;
  perform pg_temp.k6_as(v_au_l);
  r := pg_temp.k6_q(format('app.v39_min_member_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_p_v)));
  insert into app.church_events (church_id, name, event_type, starts_at, status) values (v_ch, 'Culto A', 'Culto', now() + interval '2 hours', 'open') returning id into v_ca;
  insert into app.church_events (church_id, name, event_type, starts_at, status) values (v_ch, 'Culto B', 'Culto', now() + interval '3 hours', 'open') returning id into v_cb;
  insert into app.church_events (church_id, name, event_type, starts_at, status) values (v_ch, 'Culto C', 'Culto', now() + interval '1 day 2 hours', 'open') returning id into v_cc;
  select id into v_ea from app.church_events where parent_event_id = v_ca;
  select id into v_eb from app.church_events where parent_event_id = v_cb;
  select id into v_ec from app.church_events where parent_event_id = v_cc;

  perform pg_temp.k6_as(v_au_v);
  r := pg_temp.k6_q(format('app.v39_kids_child_register(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'responsavelId', v_pai, 'parentescoResponsavel', 'Pai',
         'crianca', jsonb_build_object('nome', 'Filha Teste', 'nascimento', (current_date - interval '6 years')::date, 'sexo', 'Feminino', 'parentesco', 'Filha'))));
  v_c := (r->>'criancaId')::uuid;
  update app.people set photo_file_id = gen_random_uuid() where id in (v_c, v_pai);
  r := pg_temp.k6_q(format('app.v39_kids_consent_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_c, 'autorizadoPorId', v_pai)));

  -- T1
  r := pg_temp.k6_q(format('app.v39_kids_checkin(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'eventoId', v_ea, 'criancaId', v_c, 'trazidoPorId', v_pai)));
  v_ka := (r->>'id')::uuid; v_cod := r->>'codigo';
  if v_ka is null then raise exception 'FALHOU T1: %', r; end if;
  v_res := v_res || 'T1 ok; ';
  -- T2
  v_s := pg_temp.k6_err(format('app.v39_kids_checkin(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'eventoId', v_eb, 'criancaId', v_c, 'trazidoPorId', v_pai)));
  if v_s <> 'KIDS_CHECKIN_CONFLICT' then raise exception 'FALHOU T2: %', v_s; end if;
  v_res := v_res || 'T2 ok; ';
  -- T3
  v_s := pg_temp.k6_err(format('app.v39_kids_checkin(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'eventoId', v_ec, 'criancaId', v_c, 'trazidoPorId', v_pai)));
  if v_s <> 'KIDS_CHECKIN_CONFLICT' then raise exception 'FALHOU T3: %', v_s; end if;
  v_res := v_res || 'T3 ok; ';
  -- T4
  r := pg_temp.k6_q(format('app.v39_kids_checkout(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'checkinId', v_ka, 'retiradoPorId', v_pai, 'codigo', v_cod)));
  v_s := pg_temp.k6_err(format('app.v39_kids_checkin(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'eventoId', v_eb, 'criancaId', v_c, 'trazidoPorId', v_pai)));
  if v_s <> 'KIDS_CHECKIN_CONFLICT' then raise exception 'FALHOU T4: %', v_s; end if;
  v_res := v_res || 'T4 ok; ';
  -- T5
  r := pg_temp.k6_q(format('app.v39_kids_checkin(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'eventoId', v_ec, 'criancaId', v_c, 'trazidoPorId', v_pai)));
  if r->>'id' is null then raise exception 'FALHOU T5: %', r; end if;
  v_res := v_res || 'T5 ok; ';

  -- T6 REVERTER
  reset role;
  -- REVERTER (identico ao _reverter, sem begin/commit)
drop trigger if exists trg_v39_kids_checkin_conflict on app.kids_checkins;
drop function if exists private.v39_kids_checkin_conflict();
drop function if exists private.v39_kids_event_end(app.church_events);


  update app.kids_checkins set status = 'cancelled', cancelled_at = now(), cancel_reason = 'teste' where id = (r->>'id')::uuid;
  perform pg_temp.k6_as(v_au_v);
  r := pg_temp.k6_q(format('app.v39_kids_checkin(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'eventoId', v_eb, 'criancaId', v_c, 'trazidoPorId', v_pai)));
  if r->>'id' is null then raise exception 'FALHOU T6: %', r; end if;
  v_res := v_res || 'T6 ok (REVERTER ok)';

  raise exception 'TESTE KIDS_6 CONCLUIDO (nada foi gravado): %', v_res;
end
$t$;
