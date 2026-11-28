-- =====================================================================
-- KIDS_11 · TESTE COM ROLLBACK (nada é gravado)
-- Roda o corpo do _aplicar e do _reverter dentro de um bloco que termina em erro proposital.
-- Resultado esperado: "TESTE KIDS_11 CONCLUIDO (nada foi gravado): T1 ok; ... T6 ok (REVERTER ok)"
--   T1 líder vê o evento com 2 escalados, 1 confirmado, 1 aguardando, sem criar salas
--   T2 voluntário vê o mesmo resumo e "euEscalado"
--   T3 quem não é da equipe do Kids é barrado
--   T4 evento a menos de 24 h com pendente: semResposta24h; sala sem professor contada
--   T5 a função não grava (contagem de salas igual antes/depois)
--   T6 reverter remove a função
-- =====================================================================
do $t$
declare
  v_ch uuid := gen_random_uuid();
  v_au_m uuid := gen_random_uuid(); v_au_l uuid := gen_random_uuid(); v_au_a uuid := gen_random_uuid(); v_au_b uuid := gen_random_uuid(); v_au_o uuid := gen_random_uuid();
  v_p_m uuid; v_p_l uuid; v_p_a uuid; v_p_b uuid; v_p_o uuid; v_ua uuid; v_cua uuid; v_prof uuid;
  v_kids uuid; v_culto uuid; v_ev uuid; v_culto2 uuid; v_ev2 uuid; v_sala uuid; v_sala2 uuid; v_n int;
  r jsonb; x jsonb; v_s text; v_res text := '';
begin
do $g$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'app' and table_name = 'kids_event_room_staff' and column_name = 'response_status') then
    raise exception 'KIDS_11 ABORTADO: KIDS_4 nao aplicado. Nada foi alterado.';
  end if;
end $g$;

create or replace function app.v39_kids_schedule_summary(p_church_id uuid, p_ministry_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare
  m app.ministries; v_me uuid := app.current_user_account_id(); v_pes uuid;
begin
  m := private.v39_kids_need(p_church_id, p_ministry_id, 'volunteer');
  select person_id into v_pes from app.user_accounts where id = v_me;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'eventoId', e.id,
             'salas', (select count(*) from app.kids_event_rooms r where r.event_id = e.id and r.status = 'open'),
             'salasSemProfessor', (select count(*) from app.kids_event_rooms r where r.event_id = e.id and r.status = 'open'
                                     and not exists (select 1 from app.kids_event_room_staff s where s.event_room_id = r.id and s.status = 'active')),
             'total', coalesce(x.total, 0), 'confirmados', coalesce(x.conf, 0), 'recusados', coalesce(x.rec, 0), 'pendentes', coalesce(x.pend, 0),
             'semResposta24h', coalesce(x.pend, 0) > 0 and e.starts_at - now() < interval '24 hours' and e.starts_at > now(),
             'trocas', coalesce(x.trocas, 0),
             'euEscalado', coalesce(x.eu, false),
             'escalados', coalesce(x.lista, '[]'::jsonb)) order by e.starts_at)
      from app.church_events e
      left join lateral (
        select count(*) total,
               count(*) filter (where s.response_status = 'confirmed') conf,
               count(*) filter (where s.response_status = 'declined') rec,
               count(*) filter (where s.response_status = 'pending') pend,
               count(*) filter (where exists (select 1 from app.kids_staff_transfers t where t.staff_id = s.id and t.status in ('pending_target','pending_leader'))) trocas,
               bool_or(s.person_id = v_pes) eu,
               jsonb_agg(jsonb_build_object('pessoaId', s.person_id, 'nome', coalesce(nullif(btrim(p.preferred_name), ''), p.full_name),
                                            'resposta', s.response_status, 'funcao', s.staff_role, 'sala', r.name,
                                            'temFoto', p.photo_file_id is not null, 'eu', s.person_id = v_pes)
                         order by case s.response_status when 'confirmed' then 0 when 'pending' then 1 else 2 end, p.full_name) lista
          from app.kids_event_rooms r
          join app.kids_event_room_staff s on s.event_room_id = r.id and s.status = 'active'
          join app.people p on p.id = s.person_id
         where r.event_id = e.id and r.status = 'open'
      ) x on true
     where e.church_id = p_church_id and e.ministry_id = m.id
       and e.starts_at > now() - interval '30 days' and e.starts_at < now() + interval '90 days'), '[]'::jsonb);
end $f$;

revoke all on function app.v39_kids_schedule_summary(uuid, uuid) from public, anon;
grant execute on function app.v39_kids_schedule_summary(uuid, uuid) to authenticated;

  create function pg_temp.k11_as(p uuid) returns void language sql as $x$
    select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', p::text, true) $x$;
  create function pg_temp.k11_q(p_sql text) returns jsonb language plpgsql as $x$
    declare v jsonb; begin execute 'set local role authenticated'; execute 'select to_jsonb((' || p_sql || '))' into v; execute 'reset role'; return v; end $x$;
  create function pg_temp.k11_err(p_sql text) returns text language plpgsql as $x$
    begin execute 'set local role authenticated'; execute 'select (' || p_sql || ')'; execute 'reset role'; return 'OK';
    exception when others then return sqlerrm; end $x$;

  insert into app.churches (id, name, slug, timezone) values (v_ch, 'Igreja Teste KIDS_11', 'teste-kids11-' || left(v_ch::text, 8), 'America/Sao_Paulo');
  insert into auth.users (id, email) values (v_au_m, 'k11m@teste.invalid'), (v_au_l, 'k11l@teste.invalid'), (v_au_a, 'k11a@teste.invalid'), (v_au_b, 'k11b@teste.invalid'), (v_au_o, 'k11o@teste.invalid');
  insert into app.people (full_name) values ('K11 Master') returning id into v_p_m;
  insert into app.people (full_name) values ('K11 Lider') returning id into v_p_l;
  insert into app.people (full_name) values ('K11 Prof A') returning id into v_p_a;
  insert into app.people (full_name) values ('K11 Prof B') returning id into v_p_b;
  insert into app.people (full_name) values ('K11 De Fora') returning id into v_p_o;
  insert into app.church_people (church_id, person_id, status) values (v_ch, v_p_m, 'active'), (v_ch, v_p_l, 'active'), (v_ch, v_p_a, 'active'), (v_ch, v_p_b, 'active'), (v_ch, v_p_o, 'active');
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_m, v_p_m, 'active', now(), 'k11m') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  select id into v_prof from app.access_profiles where code = 'master';
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');
  select id into v_prof from app.access_profiles where code = 'disciple';
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_l, v_p_l, 'active', now(), 'k11l') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_a, v_p_a, 'active', now(), 'k11a') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_b, v_p_b, 'active', now(), 'k11b') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_o, v_p_o, 'active', now(), 'k11o') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');

  perform pg_temp.k11_as(v_au_m);
  r := pg_temp.k11_q(format('app.v39_min_save(%L, %L::jsonb)', v_ch, jsonb_build_object('nome', 'Kids', 'tipo', 'kids', 'liderId', v_p_l)));
  v_kids := (r->>'id')::uuid;
  perform pg_temp.k11_as(v_au_l);
  r := pg_temp.k11_q(format('app.v39_min_member_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_p_a)));
  r := pg_temp.k11_q(format('app.v39_min_member_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_p_b)));
  r := pg_temp.k11_q(format('app.v39_kids_room_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'nome', 'Pequenos', 'idadeMin', 2, 'idadeMax', 5)));
  r := pg_temp.k11_q(format('app.v39_kids_room_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'nome', 'Maiores', 'idadeMin', 6, 'idadeMax', 11)));
  reset role;
  insert into app.church_events (church_id, name, event_type, starts_at, status) values (v_ch, 'Culto Domingo', 'Culto', now() + interval '3 days', 'open') returning id into v_culto;
  select id into v_ev from app.church_events where parent_event_id = v_culto;
  insert into app.church_events (church_id, name, event_type, starts_at, status) values (v_ch, 'Culto Hoje', 'Culto', now() + interval '6 hours', 'open') returning id into v_culto2;
  select id into v_ev2 from app.church_events where parent_event_id = v_culto2;
  perform pg_temp.k11_as(v_au_l);
  r := pg_temp.k11_q(format('app.v39_kids_event_rooms(%L, %L, %L)', v_ch, v_kids, v_ev));
  select (e->>'id')::uuid into v_sala from jsonb_array_elements(r) e where e->>'nome' = 'Pequenos';
  r := pg_temp.k11_q(format('app.v39_kids_event_room_staff_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'salaId', v_sala,
         'professores', jsonb_build_array(jsonb_build_object('pessoaId', v_p_a), jsonb_build_object('pessoaId', v_p_b, 'funcao', 'auxiliar')))));
  perform pg_temp.k11_as(v_au_a);
  r := pg_temp.k11_q(format('app.v39_kids_schedule_respond(%L, %L::jsonb)', v_ch, jsonb_build_object('staffId', (select id from app.kids_event_room_staff where event_room_id = v_sala and person_id = v_p_a and status = 'active'), 'resposta', 'confirmed')));

  -- T1 líder
  perform pg_temp.k11_as(v_au_l);
  r := pg_temp.k11_q(format('app.v39_kids_schedule_summary(%L, %L)', v_ch, v_kids));
  select e into x from jsonb_array_elements(r) e where e->>'eventoId' = v_ev::text;
  if x is null or (x->>'total')::int <> 2 or (x->>'confirmados')::int <> 1 or (x->>'pendentes')::int <> 1 or (x->>'salas')::int <> 2 or (x->>'salasSemProfessor')::int <> 1
     or (x->>'euEscalado')::boolean or x->'escalados'->0->>'resposta' <> 'confirmed' then raise exception 'FALHOU T1: %', x; end if;
  select e into x from jsonb_array_elements(r) e where e->>'eventoId' = v_ev2::text;
  if x is null or (x->>'salas')::int <> 0 or (x->>'total')::int <> 0 then raise exception 'FALHOU T1b (evento sem salas): %', x; end if;
  v_res := v_res || 'T1 ok; ';

  -- T2 voluntário
  perform pg_temp.k11_as(v_au_b);
  r := pg_temp.k11_q(format('app.v39_kids_schedule_summary(%L, %L)', v_ch, v_kids));
  select e into x from jsonb_array_elements(r) e where e->>'eventoId' = v_ev::text;
  if not (x->>'euEscalado')::boolean or not exists (select 1 from jsonb_array_elements(x->'escalados') y where (y->>'eu')::boolean and y->>'funcao' = 'auxiliar') then raise exception 'FALHOU T2: %', x; end if;
  v_res := v_res || 'T2 ok; ';

  -- T3 de fora
  perform pg_temp.k11_as(v_au_o);
  v_s := pg_temp.k11_err(format('app.v39_kids_schedule_summary(%L, %L)', v_ch, v_kids));
  if v_s = 'OK' then raise exception 'FALHOU T3: quem nao e da equipe leu a escala'; end if;
  v_res := v_res || 'T3 ok (' || v_s || '); ';

  -- T4 menos de 24 h
  perform pg_temp.k11_as(v_au_l);
  r := pg_temp.k11_q(format('app.v39_kids_event_rooms(%L, %L, %L)', v_ch, v_kids, v_ev2));
  select (e->>'id')::uuid into v_sala2 from jsonb_array_elements(r) e where e->>'nome' = 'Pequenos';
  r := pg_temp.k11_q(format('app.v39_kids_event_room_staff_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'salaId', v_sala2, 'professores', jsonb_build_array(jsonb_build_object('pessoaId', v_p_a)))));
  r := pg_temp.k11_q(format('app.v39_kids_schedule_summary(%L, %L)', v_ch, v_kids));
  select e into x from jsonb_array_elements(r) e where e->>'eventoId' = v_ev2::text;
  if not (x->>'semResposta24h')::boolean or (x->>'salasSemProfessor')::int <> 1 then raise exception 'FALHOU T4: %', x; end if;
  select e into x from jsonb_array_elements(r) e where e->>'eventoId' = v_ev::text;
  if (x->>'semResposta24h')::boolean then raise exception 'FALHOU T4b: evento em 3 dias marcado como <24h'; end if;
  v_res := v_res || 'T4 ok; ';

  -- T5 não grava
  reset role;
  select count(*) into v_n from app.kids_event_rooms where church_id = v_ch;
  insert into app.church_events (church_id, name, event_type, starts_at, status) values (v_ch, 'Culto Sexta', 'Culto', now() + interval '5 days', 'open');
  perform pg_temp.k11_as(v_au_l);
  r := pg_temp.k11_q(format('app.v39_kids_schedule_summary(%L, %L)', v_ch, v_kids));
  reset role;
  if (select count(*) from app.kids_event_rooms where church_id = v_ch) <> v_n then raise exception 'FALHOU T5: o resumo criou salas'; end if;
  v_res := v_res || 'T5 ok; ';

  -- T6 reverter
drop function if exists app.v39_kids_schedule_summary(uuid, uuid);
  if exists (select 1 from pg_proc where pronamespace = 'app'::regnamespace and proname = 'v39_kids_schedule_summary') then raise exception 'FALHOU T6'; end if;
  v_res := v_res || 'T6 ok (REVERTER ok)';

  raise exception 'TESTE KIDS_11 CONCLUIDO (nada foi gravado): %', v_res;
end
$t$;
