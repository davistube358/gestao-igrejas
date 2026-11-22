-- =====================================================================
-- TRAVA24_2 · não encerrar antes do dia/início · TESTE COM ROLLBACK
-- ULTIMA EXECUCAO (22/11/2026, conector Supabase da conta, projeto kybrwsxvdbwjtwakczyj, pelo Claude):
--   ERROR P0001: TESTE TRAVA24_2 CONCLUIDO (nada foi gravado): T1 ok; T2 ok; T5 ok; T3 ok; T4 ok; T6 ok (REVERTER ok)
-- Gerado a partir do _aplicar e do _reverter (corpo identico, sem begin/commit/notify).
-- Casos:
--   T1  encontro de amanhã: participante não encerra (REGISTRO_FUTURO) e nada muda
--   T2  encontro de hoje: participante encerra
--   T3  culto que começa daqui a 2h: secretaria não encerra (REGISTRO_FUTURO)
--   T4  culto que começou há 1h: secretaria encerra
--   T5  encontro futuro já encerrado antes da regra: chamar de novo não dá erro (idempotente)
--   T6  REVERTER: corpo volta ao md5 da TRAVA24_1 e o encontro de amanhã volta a poder ser encerrado
-- NAO GRAVA NADA: tudo e desfeito pelo raise final.
-- =====================================================================
do $t$
declare
  v_ch uuid := gen_random_uuid(); v_au_d uuid := gen_random_uuid(); v_au_s uuid := gen_random_uuid();
  v_p_d uuid; v_p_s uuid; v_ua_d uuid; v_ua_s uuid; v_cua uuid; v_disc uuid; v_secr uuid;
  v_gg uuid; v_m_am uuid; v_m_hj uuid; v_m_fut uuid; v_e_fut uuid; v_e_ini uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; r jsonb; v_n int; v_res text := '';
begin
  -- APLICAR (identico ao _aplicar, sem begin/commit)

do $g$
begin
  if (select md5(prosrc) from pg_proc where oid = 'app.v39_registro_encerrar(uuid,text,uuid)'::regprocedure) is distinct from 'dfef6b987dc5b7836c197bb227ed4280' then
    raise exception 'TRAVA24_2 ABORTADO: v39_registro_encerrar diferente da versao da TRAVA24_1. Nada foi alterado.';
  end if;
end $g$;

create or replace function app.v39_registro_encerrar(p_church_id uuid, p_tipo text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_me uuid := app.current_user_account_id(); m app.growth_group_meetings; e app.church_events; v_trava timestamptz;
        v_tz text := coalesce(nullif((select timezone from app.churches where id = p_church_id), ''), 'America/Sao_Paulo');
begin
  if v_me is null or app.current_church_user_access_id(p_church_id) is null then
    perform app.raise_domain_error('ACCESS_DENIED', 'Sem acesso ativo a esta igreja');
  end if;
  if p_tipo = 'gc' then
    select * into m from app.growth_group_meetings where id = p_id and church_id = p_church_id for update;
    if m.id is null then perform app.raise_domain_error('GC_MEETING_NOT_FOUND', 'Encontro nao encontrado'); end if;
    if not (private.has_active_profile_in_church(p_church_id, array['master','pastor'])
            or private.has_active_gc_membership(m.growth_group_id, array['leader','co_leader','host','supervisor','participant'])) then
      perform app.raise_domain_error('PERMISSION_DENIED', 'Sem permissao para encerrar este encontro');
    end if;
    if m.status = 'cancelled' then perform app.raise_domain_error('REGISTRO_CANCELADO', 'Encontro cancelado'); end if;
    if m.status <> 'completed' and m.meeting_date > (now() at time zone v_tz)::date then
      perform app.raise_domain_error('REGISTRO_FUTURO', 'O encontro ainda nao aconteceu: so pode ser encerrado a partir do dia dele');
    end if;
    if m.status <> 'completed' then
      update app.growth_group_meetings set status = 'completed', completed_at = now(), updated_by_user_account_id = v_me where id = m.id;
      select * into m from app.growth_group_meetings where id = m.id;
    end if;
    v_trava := private.v39_trava_gc(m);
    return jsonb_build_object('ok', true, 'status', m.status, 'encerradoEm', m.completed_at, 'travaEm', v_trava);
  elsif p_tipo = 'evento' then
    select * into e from app.church_events where id = p_id and church_id = p_church_id for update;
    if e.id is null then perform app.raise_domain_error('EVENT_NOT_FOUND', 'Culto ou evento nao encontrado'); end if;
    if not private.has_active_profile_in_church(p_church_id, array['master','pastor','secretary','secretariat','treasury']) then
      perform app.raise_domain_error('PERMISSION_DENIED', 'Sem permissao para encerrar este culto/evento');
    end if;
    if e.status = 'cancelled' then perform app.raise_domain_error('REGISTRO_CANCELADO', 'Culto/evento cancelado'); end if;
    if e.status <> 'completed' and e.starts_at > now() then
      perform app.raise_domain_error('REGISTRO_FUTURO', 'O culto/evento ainda nao comecou: so pode ser encerrado depois do inicio');
    end if;
    if e.status <> 'completed' then
      update app.church_events set status = 'completed', completed_at = now(), updated_by_user_account_id = v_me where id = e.id;
      select * into e from app.church_events where id = e.id;
    end if;
    v_trava := private.v39_trava_evento(e);
    return jsonb_build_object('ok', true, 'status', e.status, 'encerradoEm', e.completed_at, 'travaEm', v_trava);
  end if;
  perform app.raise_domain_error('TIPO_INVALIDO', 'Tipo deve ser gc ou evento');
end $f$;


  select id into v_disc from app.access_profiles where code = 'disciple' and is_active;
  select id into v_secr from app.access_profiles where code = 'secretary' and is_active;
  insert into app.churches (id, name, slug, timezone) values (v_ch, 'Igreja Teste TRAVA24_2', 'teste-trava24-2-' || left(v_ch::text, 8), 'America/Sao_Paulo');
  insert into auth.users (id, email) values (v_au_d, 't242d@teste.invalid'), (v_au_s, 't242s@teste.invalid');
  insert into app.people (full_name) values ('T242 Discipulo') returning id into v_p_d;
  insert into app.people (full_name) values ('T242 Secretaria') returning id into v_p_s;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_d, v_p_d, 'active', now(), 't242d') returning id into v_ua_d;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_s, v_p_s, 'active', now(), 't242s') returning id into v_ua_s;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua_d, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_d) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_disc, true, now() - interval '1 day');
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua_s, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_s) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_secr, true, now() - interval '1 day');
  insert into app.church_people (church_id, person_id, status) values (v_ch, v_p_d, 'active'), (v_ch, v_p_s, 'active');
  insert into app.growth_groups (church_id, name) values (v_ch, 'GC T242') returning id into v_gg;
  insert into app.growth_group_memberships (growth_group_id, person_id, role_type, status, started_at) values (v_gg, v_p_d, 'participant', 'active', now() - interval '30 days');
  insert into app.growth_group_meetings (church_id, growth_group_id, meeting_date) values (v_ch, v_gg, v_hoje + 1) returning id into v_m_am;
  insert into app.growth_group_meetings (church_id, growth_group_id, meeting_date) values (v_ch, v_gg, v_hoje) returning id into v_m_hj;
  insert into app.growth_group_meetings (church_id, growth_group_id, meeting_date, status, completed_at) values (v_ch, v_gg, v_hoje + 7, 'completed', now()) returning id into v_m_fut;
  insert into app.church_events (church_id, name, event_type, starts_at) values (v_ch, 'Culto T242 futuro', 'Culto', now() + interval '2 hours') returning id into v_e_fut;
  insert into app.church_events (church_id, name, event_type, starts_at) values (v_ch, 'Culto T242 em andamento', 'Culto', now() - interval '1 hour') returning id into v_e_ini;

  perform set_config('request.jwt.claims', json_build_object('sub', v_au_d, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_d::text, true);
  begin
    set local role authenticated; perform app.v39_registro_encerrar(v_ch, 'gc', v_m_am); reset role; raise exception 'FALHOU T1';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'REGISTRO_FUTURO' then raise exception 'FALHOU T1: %', sqlerrm; end if;
  end;
  select count(*) into v_n from app.growth_group_meetings where id = v_m_am and status = 'planned' and completed_at is null;
  if v_n <> 1 then raise exception 'FALHOU T1b: encontro de amanha mudou'; end if;
  v_res := v_res || 'T1 ok; ';

  begin
    set local role authenticated; r := app.v39_registro_encerrar(v_ch, 'gc', v_m_hj); reset role;
  exception when others then reset role; raise exception 'FALHOU T2: % %', sqlstate, sqlerrm;
  end;
  if r->>'status' <> 'completed' then raise exception 'FALHOU T2: %', r; end if;
  v_res := v_res || 'T2 ok; ';

  begin
    set local role authenticated; r := app.v39_registro_encerrar(v_ch, 'gc', v_m_fut); reset role;
  exception when others then reset role; raise exception 'FALHOU T5: % %', sqlstate, sqlerrm;
  end;
  if r->>'status' <> 'completed' then raise exception 'FALHOU T5: %', r; end if;
  v_res := v_res || 'T5 ok; ';

  perform set_config('request.jwt.claims', json_build_object('sub', v_au_s, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_s::text, true);
  begin
    set local role authenticated; perform app.v39_registro_encerrar(v_ch, 'evento', v_e_fut); reset role; raise exception 'FALHOU T3';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'REGISTRO_FUTURO' then raise exception 'FALHOU T3: %', sqlerrm; end if;
  end;
  v_res := v_res || 'T3 ok; ';
  begin
    set local role authenticated; r := app.v39_registro_encerrar(v_ch, 'evento', v_e_ini); reset role;
  exception when others then reset role; raise exception 'FALHOU T4: % %', sqlstate, sqlerrm;
  end;
  if r->>'status' <> 'completed' then raise exception 'FALHOU T4: %', r; end if;
  v_res := v_res || 'T4 ok; ';

  -- REVERTER (identico ao _reverter, sem begin/commit)

create or replace function app.v39_registro_encerrar(p_church_id uuid, p_tipo text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_me uuid := app.current_user_account_id(); m app.growth_group_meetings; e app.church_events; v_trava timestamptz;
begin
  if v_me is null or app.current_church_user_access_id(p_church_id) is null then
    perform app.raise_domain_error('ACCESS_DENIED', 'Sem acesso ativo a esta igreja');
  end if;
  if p_tipo = 'gc' then
    select * into m from app.growth_group_meetings where id = p_id and church_id = p_church_id for update;
    if m.id is null then perform app.raise_domain_error('GC_MEETING_NOT_FOUND', 'Encontro nao encontrado'); end if;
    if not (private.has_active_profile_in_church(p_church_id, array['master','pastor'])
            or private.has_active_gc_membership(m.growth_group_id, array['leader','co_leader','host','supervisor','participant'])) then
      perform app.raise_domain_error('PERMISSION_DENIED', 'Sem permissao para encerrar este encontro');
    end if;
    if m.status = 'cancelled' then perform app.raise_domain_error('REGISTRO_CANCELADO', 'Encontro cancelado'); end if;
    if m.status <> 'completed' then
      update app.growth_group_meetings set status = 'completed', completed_at = now(), updated_by_user_account_id = v_me where id = m.id;
      select * into m from app.growth_group_meetings where id = m.id;
    end if;
    v_trava := private.v39_trava_gc(m);
    return jsonb_build_object('ok', true, 'status', m.status, 'encerradoEm', m.completed_at, 'travaEm', v_trava);
  elsif p_tipo = 'evento' then
    select * into e from app.church_events where id = p_id and church_id = p_church_id for update;
    if e.id is null then perform app.raise_domain_error('EVENT_NOT_FOUND', 'Culto ou evento nao encontrado'); end if;
    if not private.has_active_profile_in_church(p_church_id, array['master','pastor','secretary','secretariat','treasury']) then
      perform app.raise_domain_error('PERMISSION_DENIED', 'Sem permissao para encerrar este culto/evento');
    end if;
    if e.status = 'cancelled' then perform app.raise_domain_error('REGISTRO_CANCELADO', 'Culto/evento cancelado'); end if;
    if e.status <> 'completed' then
      update app.church_events set status = 'completed', completed_at = now(), updated_by_user_account_id = v_me where id = e.id;
      select * into e from app.church_events where id = e.id;
    end if;
    v_trava := private.v39_trava_evento(e);
    return jsonb_build_object('ok', true, 'status', e.status, 'encerradoEm', e.completed_at, 'travaEm', v_trava);
  end if;
  perform app.raise_domain_error('TIPO_INVALIDO', 'Tipo deve ser gc ou evento');
end $f$;

  if (select md5(prosrc) from pg_proc where oid = 'app.v39_registro_encerrar(uuid,text,uuid)'::regprocedure) is distinct from 'dfef6b987dc5b7836c197bb227ed4280' then
    raise exception 'FALHOU T6a: corpo do reverter diferente da TRAVA24_1';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_d, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_d::text, true);
  begin
    set local role authenticated; r := app.v39_registro_encerrar(v_ch, 'gc', v_m_am); reset role;
  exception when others then reset role; raise exception 'FALHOU T6b: % %', sqlstate, sqlerrm;
  end;
  v_res := v_res || 'T6 ok (REVERTER ok)';

  raise exception 'TESTE TRAVA24_2 CONCLUIDO (nada foi gravado): %', v_res;
end
$t$;
