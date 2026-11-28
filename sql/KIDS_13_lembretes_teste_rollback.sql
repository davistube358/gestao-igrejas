-- =====================================================================
-- KIDS_13 · TESTE COM ROLLBACK (nada é gravado; o job do pg_cron também é desfeito)
-- Esperado: "TESTE KIDS_13 CONCLUIDO (nada foi gravado): T1 ok; ... T6 ok (REVERTER ok)"
--   T1 culto em 20 h: confirmado recebe "Lembrete" faixa 24; aguardando recebe "Responda"; "não posso" nada
--   T2 rodar de novo não repete
--   T3 culto passa para 10 h: faixa 12; depois 1 h: faixa 2 (alta prioridade)
--   T4 escalado já dentro de 2 h recebe só a faixa 2
--   T5 job v39-kids-lembretes agendado a cada 10 min
--   T6 reverter remove job e função
-- =====================================================================
do $t$
declare
  v_ch uuid := gen_random_uuid();
  v_au_m uuid := gen_random_uuid(); v_au_l uuid := gen_random_uuid(); v_au_a uuid := gen_random_uuid(); v_au_b uuid := gen_random_uuid(); v_au_c uuid := gen_random_uuid();
  v_p_m uuid; v_p_l uuid; v_p_a uuid; v_p_b uuid; v_p_c uuid; v_ua uuid; v_cua uuid; v_prof uuid;
  v_kids uuid; v_culto uuid; v_ev uuid; v_culto2 uuid; v_ev2 uuid; v_sala uuid; v_sala2 uuid; v_n int;
  r jsonb; v_res text := '';
begin
do $g$
begin
  if to_regclass('app.kids_staff_transfers') is null then
    raise exception 'KIDS_13 ABORTADO: KIDS_4 nao aplicado. Nada foi alterado.';
  end if;
end $g$;

create index if not exists notifications_source_idx on app.notifications (source_id, notification_type);

create or replace function private.v39_kids_schedule_reminders() returns integer
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare x record; v_n integer := 0; v_falta text;
begin
  for x in
    select s.id, s.church_id, s.person_id, s.staff_role, s.response_status, r, e,
           case when e.starts_at - now() <= interval '2 hours' then 2 when e.starts_at - now() <= interval '12 hours' then 12 else 24 end janela
      from app.kids_event_room_staff s
      join app.kids_event_rooms r on r.id = s.event_room_id
      join app.church_events e on e.id = r.event_id
     where s.status = 'active' and s.response_status in ('confirmed','pending') and r.status = 'open'
       and e.status not in ('completed','cancelled') and e.starts_at > now() and e.starts_at <= now() + interval '24 hours'
  loop
    if exists (select 1 from app.notifications n where n.source_id = x.id and n.notification_type = 'kids_lembrete' and n.metadata->>'janela' = x.janela::text) then
      continue;
    end if;
    v_falta := case x.janela when 2 then 'menos de 2 h' when 12 then 'menos de 12 h' else 'menos de 24 h' end;
    perform private.v39_notify(x.church_id, x.person_id, 'kids_lembrete',
              case when x.response_status = 'confirmed' then 'Lembrete: você serve no Kids em ' || v_falta else 'Responda sua escala do Kids (culto em ' || v_falta || ')' end,
              'Sala ' || private.v39_kids_staff_label(x.r, x.e) || ' (' || x.staff_role || ').' ||
              case when x.response_status = 'confirmed' then ' Até lá!' else ' Confirme ou avise que não pode em "Minhas escalas".' end,
              'kids_event_room_staff', x.id, jsonb_build_object('janela', x.janela, 'event_id', (x.e).id, 'resposta', x.response_status),
              case when x.janela = 2 or x.response_status = 'pending' then 'high' else 'normal' end);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $f$;
revoke all on function private.v39_kids_schedule_reminders() from public;

create extension if not exists pg_cron;
do $c$
begin
  if exists (select 1 from cron.job where jobname = 'v39-kids-lembretes') then perform cron.unschedule('v39-kids-lembretes'); end if;
  perform cron.schedule('v39-kids-lembretes', '*/10 * * * *', 'select private.v39_kids_schedule_reminders()');
end $c$;

  create function pg_temp.k13_as(p uuid) returns void language sql as $x$
    select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', p::text, true) $x$;
  create function pg_temp.k13_q(p_sql text) returns jsonb language plpgsql as $x$
    declare v jsonb; begin execute 'set local role authenticated'; execute 'select to_jsonb((' || p_sql || '))' into v; execute 'reset role'; return v; end $x$;
  create function pg_temp.k13_avisos(p uuid) returns text language sql as $x$
    select coalesce(string_agg(n.metadata->>'janela' || ':' || left(n.title, 9) || ':' || n.priority, ',' order by (n.metadata->>'janela')::int desc), '')
      from app.notifications n join app.user_accounts ua on ua.id = n.user_account_id where ua.person_id = p and n.notification_type = 'kids_lembrete' $x$;

  insert into app.churches (id, name, slug, timezone) values (v_ch, 'Igreja Teste KIDS_13', 'teste-kids13-' || left(v_ch::text, 8), 'America/Sao_Paulo');
  insert into auth.users (id, email) values (v_au_m, 'k13m@teste.invalid'), (v_au_l, 'k13l@teste.invalid'), (v_au_a, 'k13a@teste.invalid'), (v_au_b, 'k13b@teste.invalid'), (v_au_c, 'k13c@teste.invalid');
  insert into app.people (full_name) values ('K13 Master') returning id into v_p_m;
  insert into app.people (full_name) values ('K13 Lider') returning id into v_p_l;
  insert into app.people (full_name) values ('K13 Prof A') returning id into v_p_a;
  insert into app.people (full_name) values ('K13 Prof B') returning id into v_p_b;
  insert into app.people (full_name) values ('K13 Prof C') returning id into v_p_c;
  insert into app.church_people (church_id, person_id, status) values (v_ch, v_p_m, 'active'), (v_ch, v_p_l, 'active'), (v_ch, v_p_a, 'active'), (v_ch, v_p_b, 'active'), (v_ch, v_p_c, 'active');
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_m, v_p_m, 'active', now(), 'k13m') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  select id into v_prof from app.access_profiles where code = 'master';
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');
  select id into v_prof from app.access_profiles where code = 'disciple';
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_l, v_p_l, 'active', now(), 'k13l') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_a, v_p_a, 'active', now(), 'k13a') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_b, v_p_b, 'active', now(), 'k13b') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_c, v_p_c, 'active', now(), 'k13c') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');

  perform pg_temp.k13_as(v_au_m);
  r := pg_temp.k13_q(format('app.v39_min_save(%L, %L::jsonb)', v_ch, jsonb_build_object('nome', 'Kids', 'tipo', 'kids', 'liderId', v_p_l)));
  v_kids := (r->>'id')::uuid;
  perform pg_temp.k13_as(v_au_l);
  r := pg_temp.k13_q(format('app.v39_min_member_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_p_a)));
  r := pg_temp.k13_q(format('app.v39_min_member_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_p_b)));
  r := pg_temp.k13_q(format('app.v39_min_member_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_p_c)));
  r := pg_temp.k13_q(format('app.v39_kids_room_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'nome', 'Pequenos', 'idadeMin', 2, 'idadeMax', 5)));
  reset role;
  insert into app.church_events (church_id, name, event_type, starts_at, status) values (v_ch, 'Culto Amanha', 'Culto', now() + interval '20 hours', 'open') returning id into v_culto;
  select id into v_ev from app.church_events where parent_event_id = v_culto;
  perform pg_temp.k13_as(v_au_l);
  r := pg_temp.k13_q(format('app.v39_kids_event_rooms(%L, %L, %L)', v_ch, v_kids, v_ev));
  v_sala := (r->0->>'id')::uuid;
  r := pg_temp.k13_q(format('app.v39_kids_event_room_staff_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'salaId', v_sala,
         'professores', jsonb_build_array(jsonb_build_object('pessoaId', v_p_a), jsonb_build_object('pessoaId', v_p_b), jsonb_build_object('pessoaId', v_p_c)))));
  perform pg_temp.k13_as(v_au_a);
  r := pg_temp.k13_q(format('app.v39_kids_schedule_respond(%L, %L::jsonb)', v_ch, jsonb_build_object('staffId', (select id from app.kids_event_room_staff where event_room_id = v_sala and person_id = v_p_a and status = 'active'), 'resposta', 'confirmed')));
  perform pg_temp.k13_as(v_au_c);
  r := pg_temp.k13_q(format('app.v39_kids_schedule_respond(%L, %L::jsonb)', v_ch, jsonb_build_object('staffId', (select id from app.kids_event_room_staff where event_room_id = v_sala and person_id = v_p_c and status = 'active'), 'resposta', 'declined', 'motivo', 'viagem')));
  reset role;

  -- T1
  perform private.v39_kids_schedule_reminders();
  if pg_temp.k13_avisos(v_p_a) <> '24:Lembrete::normal' or pg_temp.k13_avisos(v_p_b) <> '24:Responda :high' or pg_temp.k13_avisos(v_p_c) <> '' then
    raise exception 'FALHOU T1: A=% B=% C=%', pg_temp.k13_avisos(v_p_a), pg_temp.k13_avisos(v_p_b), pg_temp.k13_avisos(v_p_c); end if;
  v_res := v_res || 'T1 ok; ';
  -- T2
  perform private.v39_kids_schedule_reminders();
  if pg_temp.k13_avisos(v_p_a) <> '24:Lembrete::normal' then raise exception 'FALHOU T2: %', pg_temp.k13_avisos(v_p_a); end if;
  v_res := v_res || 'T2 ok; ';
  -- T3
  update app.church_events set starts_at = now() + interval '10 hours' where id = v_ev;
  perform private.v39_kids_schedule_reminders();
  update app.church_events set starts_at = now() + interval '1 hour' where id = v_ev;
  perform private.v39_kids_schedule_reminders();
  if pg_temp.k13_avisos(v_p_a) <> '24:Lembrete::normal,12:Lembrete::normal,2:Lembrete::high' then raise exception 'FALHOU T3: %', pg_temp.k13_avisos(v_p_a); end if;
  v_res := v_res || 'T3 ok; ';
  -- T4: novo culto em 1 h, C escalado (aguardando) só recebe a faixa 2
  insert into app.church_events (church_id, name, event_type, starts_at, status) values (v_ch, 'Culto Ja', 'Culto', now() + interval '90 minutes', 'open') returning id into v_culto2;
  select id into v_ev2 from app.church_events where parent_event_id = v_culto2;
  perform pg_temp.k13_as(v_au_l);
  r := pg_temp.k13_q(format('app.v39_kids_event_rooms(%L, %L, %L)', v_ch, v_kids, v_ev2));
  v_sala2 := (r->0->>'id')::uuid;
  r := pg_temp.k13_q(format('app.v39_kids_event_room_staff_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'salaId', v_sala2, 'professores', jsonb_build_array(jsonb_build_object('pessoaId', v_p_c)))));
  reset role;
  perform private.v39_kids_schedule_reminders();
  if pg_temp.k13_avisos(v_p_c) <> '2:Responda :high' then raise exception 'FALHOU T4: %', pg_temp.k13_avisos(v_p_c); end if;
  v_res := v_res || 'T4 ok; ';
  -- T5
  if not exists (select 1 from cron.job where jobname = 'v39-kids-lembretes' and schedule = '*/10 * * * *' and active) then raise exception 'FALHOU T5'; end if;
  v_res := v_res || 'T5 ok; ';

  -- T6 reverter
do $c$
begin
  if to_regclass('cron.job') is not null and exists (select 1 from cron.job where jobname = 'v39-kids-lembretes') then
    perform cron.unschedule('v39-kids-lembretes');
  end if;
end $c$;
drop function if exists private.v39_kids_schedule_reminders();
  if exists (select 1 from pg_proc where proname = 'v39_kids_schedule_reminders') or exists (select 1 from cron.job where jobname = 'v39-kids-lembretes') then raise exception 'FALHOU T6'; end if;
  v_res := v_res || 'T6 ok (REVERTER ok)';

  raise exception 'TESTE KIDS_13 CONCLUIDO (nada foi gravado): %', v_res;
end
$t$;
