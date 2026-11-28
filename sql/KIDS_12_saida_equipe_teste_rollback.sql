-- =====================================================================
-- KIDS_12 · TESTE COM ROLLBACK (nada é gravado)
-- Esperado: "TESTE KIDS_12 CONCLUIDO (nada foi gravado): T1 ok; ... T5 ok (REVERTER ok)"
--   T1 encerrar a participação de A tira A da escala futura (removed, com motivo) e avisa A
--   T2 a escala de A num evento que já passou continua (histórico)
--   T3 troca aberta para A (pedida por B) é cancelada
--   T4 pausar B tira B das escalas futuras
--   T5 reverter remove o gatilho
-- =====================================================================
do $t$
declare
  v_ch uuid := gen_random_uuid();
  v_au_m uuid := gen_random_uuid(); v_au_l uuid := gen_random_uuid(); v_au_a uuid := gen_random_uuid(); v_au_b uuid := gen_random_uuid();
  v_p_m uuid; v_p_l uuid; v_p_a uuid; v_p_b uuid; v_ua uuid; v_cua uuid; v_prof uuid;
  v_kids uuid; v_culto uuid; v_ev uuid; v_culto0 uuid; v_ev0 uuid; v_sala uuid; v_sala2 uuid; v_sala0 uuid; v_st_a uuid; v_st_a0 uuid; v_st_b uuid; v_tr uuid;
  r jsonb; v_res text := '';
begin
do $g$
begin
  if to_regclass('app.kids_staff_transfers') is null then
    raise exception 'KIDS_12 ABORTADO: KIDS_4 nao aplicado. Nada foi alterado.';
  end if;
end $g$;

create or replace function private.v39_kids_membership_exit() returns trigger
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare s record; v_n integer := 0; v_motivo text;
begin
  if new.status not in ('ended','paused') or old.status = new.status then return new; end if;
  v_motivo := left('Saiu da equipe (' || case new.status when 'ended' then 'participação encerrada' else 'participação pausada' end || ')', 500);
  for s in
    select st.id, st.church_id, r.name sala, e.id ev, e.name evento, e.starts_at
      from app.kids_event_room_staff st
      join app.kids_event_rooms r on r.id = st.event_room_id
      join app.church_events e on e.id = r.event_id
     where st.person_id = new.person_id and st.status = 'active' and e.ministry_id = new.ministry_id
       and e.starts_at > now() and e.status not in ('completed','cancelled')
  loop
    update app.kids_event_room_staff set status = 'removed', removed_at = now(), removed_reason = v_motivo where id = s.id;
    update app.kids_staff_transfers set status = 'cancelled', cancelled_at = now() where staff_id = s.id and status in ('pending_target','pending_leader');
    v_n := v_n + 1;
  end loop;
  update app.kids_staff_transfers t set status = 'cancelled', cancelled_at = now()
    from app.kids_event_room_staff st join app.kids_event_rooms r on r.id = st.event_room_id join app.church_events e on e.id = r.event_id
   where t.staff_id = st.id and t.to_person_id = new.person_id and t.status in ('pending_target','pending_leader') and e.ministry_id = new.ministry_id;
  if v_n > 0 then
    perform private.v39_notify(new.church_id, new.person_id, 'kids_escala_removida', 'Você saiu das escalas do Kids',
                               'Sua participação na equipe foi ' || case new.status when 'ended' then 'encerrada' else 'pausada' end || ': ' || v_n || ' escala(s) futura(s) foram retiradas.',
                               'ministry_memberships', new.id, jsonb_build_object('ministry_id', new.ministry_id, 'escalas', v_n));
    perform private.v39_kids_audit(new.church_id, 'status_change', 'kids_staff_removed_by_exit', 'ministry_memberships', new.id, new.person_id, 'standard', v_motivo,
                                   jsonb_build_object('ministry_id', new.ministry_id, 'escalas', v_n, 'status', new.status));
  end if;
  return new;
end $f$;
revoke all on function private.v39_kids_membership_exit() from public;

drop trigger if exists trg_v39_kids_membership_exit on app.ministry_memberships;
create trigger trg_v39_kids_membership_exit after update of status on app.ministry_memberships
  for each row when (new.status in ('ended','paused') and old.status is distinct from new.status)
  execute function private.v39_kids_membership_exit();

  create function pg_temp.k12_as(p uuid) returns void language sql as $x$
    select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', p::text, true) $x$;
  create function pg_temp.k12_q(p_sql text) returns jsonb language plpgsql as $x$
    declare v jsonb; begin execute 'set local role authenticated'; execute 'select to_jsonb((' || p_sql || '))' into v; execute 'reset role'; return v; end $x$;

  insert into app.churches (id, name, slug, timezone) values (v_ch, 'Igreja Teste KIDS_12', 'teste-kids12-' || left(v_ch::text, 8), 'America/Sao_Paulo');
  insert into auth.users (id, email) values (v_au_m, 'k12m@teste.invalid'), (v_au_l, 'k12l@teste.invalid'), (v_au_a, 'k12a@teste.invalid'), (v_au_b, 'k12b@teste.invalid');
  insert into app.people (full_name) values ('K12 Master') returning id into v_p_m;
  insert into app.people (full_name) values ('K12 Lider') returning id into v_p_l;
  insert into app.people (full_name) values ('K12 Prof A') returning id into v_p_a;
  insert into app.people (full_name) values ('K12 Prof B') returning id into v_p_b;
  insert into app.church_people (church_id, person_id, status) values (v_ch, v_p_m, 'active'), (v_ch, v_p_l, 'active'), (v_ch, v_p_a, 'active'), (v_ch, v_p_b, 'active');
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_m, v_p_m, 'active', now(), 'k12m') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  select id into v_prof from app.access_profiles where code = 'master';
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');
  select id into v_prof from app.access_profiles where code = 'disciple';
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_l, v_p_l, 'active', now(), 'k12l') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_a, v_p_a, 'active', now(), 'k12a') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_b, v_p_b, 'active', now(), 'k12b') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');

  perform pg_temp.k12_as(v_au_m);
  r := pg_temp.k12_q(format('app.v39_min_save(%L, %L::jsonb)', v_ch, jsonb_build_object('nome', 'Kids', 'tipo', 'kids', 'liderId', v_p_l)));
  v_kids := (r->>'id')::uuid;
  perform pg_temp.k12_as(v_au_l);
  r := pg_temp.k12_q(format('app.v39_min_member_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_p_a)));
  r := pg_temp.k12_q(format('app.v39_min_member_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_p_b)));
  r := pg_temp.k12_q(format('app.v39_kids_room_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'nome', 'Pequenos', 'idadeMin', 2, 'idadeMax', 5)));
  r := pg_temp.k12_q(format('app.v39_kids_room_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'nome', 'Maiores', 'idadeMin', 6, 'idadeMax', 11)));
  reset role;
  insert into app.church_events (church_id, name, event_type, starts_at, status) values (v_ch, 'Culto Domingo', 'Culto', now() + interval '3 days', 'open') returning id into v_culto;
  select id into v_ev from app.church_events where parent_event_id = v_culto;
  insert into app.church_events (church_id, name, event_type, starts_at, status) values (v_ch, 'Culto Passado', 'Culto', now() - interval '2 hours', 'open') returning id into v_culto0;
  select id into v_ev0 from app.church_events where parent_event_id = v_culto0;
  perform pg_temp.k12_as(v_au_l);
  r := pg_temp.k12_q(format('app.v39_kids_event_rooms(%L, %L, %L)', v_ch, v_kids, v_ev));
  select (e->>'id')::uuid into v_sala from jsonb_array_elements(r) e where e->>'nome' = 'Pequenos';
  select (e->>'id')::uuid into v_sala2 from jsonb_array_elements(r) e where e->>'nome' = 'Maiores';
  r := pg_temp.k12_q(format('app.v39_kids_event_rooms(%L, %L, %L)', v_ch, v_kids, v_ev0));
  select (e->>'id')::uuid into v_sala0 from jsonb_array_elements(r) e where e->>'nome' = 'Pequenos';
  r := pg_temp.k12_q(format('app.v39_kids_event_room_staff_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'salaId', v_sala, 'professores', jsonb_build_array(jsonb_build_object('pessoaId', v_p_a)))));
  r := pg_temp.k12_q(format('app.v39_kids_event_room_staff_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'salaId', v_sala2, 'professores', jsonb_build_array(jsonb_build_object('pessoaId', v_p_b)))));
  r := pg_temp.k12_q(format('app.v39_kids_event_room_staff_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'salaId', v_sala0, 'professores', jsonb_build_array(jsonb_build_object('pessoaId', v_p_a)))));
  reset role;
  select id into v_st_a from app.kids_event_room_staff where event_room_id = v_sala and person_id = v_p_a and status = 'active';
  select id into v_st_a0 from app.kids_event_room_staff where event_room_id = v_sala0 and person_id = v_p_a and status = 'active';
  select id into v_st_b from app.kids_event_room_staff where event_room_id = v_sala2 and person_id = v_p_b and status = 'active';
  perform pg_temp.k12_as(v_au_b);
  r := pg_temp.k12_q(format('app.v39_kids_transfer_request(%L, %L::jsonb)', v_ch, jsonb_build_object('staffId', v_st_b, 'paraPessoaId', v_p_a)));
  v_tr := (r->>'id')::uuid;

  -- T1 encerrar A
  perform pg_temp.k12_as(v_au_l);
  r := pg_temp.k12_q(format('app.v39_min_member_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_p_a, 'status', 'ended', 'motivo', 'mudou de cidade')));
  reset role;
  if not exists (select 1 from app.kids_event_room_staff where id = v_st_a and status = 'removed' and removed_reason like 'Saiu da equipe%') then raise exception 'FALHOU T1a'; end if;
  if not exists (select 1 from app.notifications n join app.user_accounts ua on ua.id = n.user_account_id where ua.person_id = v_p_a and n.church_id = v_ch and n.title = 'Você saiu das escalas do Kids') then raise exception 'FALHOU T1b: sem aviso'; end if;
  v_res := v_res || 'T1 ok; ';
  -- T2 passado fica
  if not exists (select 1 from app.kids_event_room_staff where id = v_st_a0 and status = 'active') then raise exception 'FALHOU T2: escala passada foi retirada'; end if;
  v_res := v_res || 'T2 ok; ';
  -- T3 troca para A cancelada
  if not exists (select 1 from app.kids_staff_transfers where id = v_tr and status = 'cancelled') then raise exception 'FALHOU T3'; end if;
  if not exists (select 1 from app.kids_event_room_staff where id = v_st_b and status = 'active') then raise exception 'FALHOU T3b: B perdeu a escala'; end if;
  v_res := v_res || 'T3 ok; ';
  -- T4 pausar B
  perform pg_temp.k12_as(v_au_l);
  r := pg_temp.k12_q(format('app.v39_min_member_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_p_b, 'status', 'paused', 'motivo', 'licença')));
  reset role;
  if not exists (select 1 from app.kids_event_room_staff where id = v_st_b and status = 'removed' and removed_reason like '%pausada%') then raise exception 'FALHOU T4'; end if;
  v_res := v_res || 'T4 ok; ';

  -- T5 reverter
drop trigger if exists trg_v39_kids_membership_exit on app.ministry_memberships;
drop function if exists private.v39_kids_membership_exit();
  if exists (select 1 from pg_trigger where tgname = 'trg_v39_kids_membership_exit') then raise exception 'FALHOU T5'; end if;
  v_res := v_res || 'T5 ok (REVERTER ok)';

  raise exception 'TESTE KIDS_12 CONCLUIDO (nada foi gravado): %', v_res;
end
$t$;
