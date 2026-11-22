-- =====================================================================
-- TRAVA24_1 · encerrar e travar encontro do GC e culto/evento 24h depois · TESTE COM ROLLBACK
-- ULTIMA EXECUCAO (22/11/2026, conector Supabase da conta, projeto kybrwsxvdbwjtwakczyj, pelo Claude):
--   ERROR P0001: TESTE TRAVA24_1 CONCLUIDO (nada foi gravado): T1 ok; T2 ok; T3 ok; T4 ok; T5 ok; T6 ok; T7 ok; T8 ok; T9 ok (REVERTER ok)
-- Gerado a partir do _aplicar e do _reverter (corpo identico, sem begin/commit/notify), com dados ficticios.
-- Casos:
--   T1  estrutura: 4 colunas, 5 gatilhos, 3 RPCs com grant certo
--   T2  registro de 5 dias atras (criado ha 5 dias) TRAVADO: encontro, presenca, resumo; evento e resumo do evento
--   T3  encontro de hoje e encontro lancado atrasado (criado agora) continuam editaveis
--   T4  RPC existente (save_gc_attendance pelo lider) em encontro travado -> REGISTRO_TRAVADO
--   T5  encerrar: participante (discipulo) encerra; fora do GC nao; ate 24h edita; depois de 24h trava
--   T6  reabrir: lider nao; master sem motivo nao; master com motivo reabre, edita, gera auditoria
--   T7  culto/evento: secretaria encerra, discipulo nao; master reabre o evento travado e edita
--   T8  v39_registro_travas devolve travado/travaEm; cancelado nao reabre
--   T9  REVERTER aborta com registro reaberto; sem reaberto remove tudo
-- NAO GRAVA NADA: tudo e desfeito pelo raise final.
-- =====================================================================
do $t$
declare
  v_ch uuid := gen_random_uuid();
  v_au_m uuid := gen_random_uuid(); v_au_l uuid := gen_random_uuid(); v_au_d uuid := gen_random_uuid(); v_au_o uuid := gen_random_uuid(); v_au_s uuid := gen_random_uuid();
  v_p_m uuid; v_p_l uuid; v_p_d uuid; v_p_o uuid; v_p_s uuid;
  v_ua_m uuid; v_ua_l uuid; v_ua_d uuid; v_ua_o uuid; v_ua_s uuid; v_cua uuid;
  v_master uuid; v_leader uuid; v_disc uuid; v_secr uuid;
  v_gg uuid; v_gg2 uuid; v_m1 uuid; v_m2 uuid; v_m3 uuid; v_m4 uuid; v_e1 uuid; v_e2 uuid;
  r jsonb; v_n int; v_res text := '';
begin
  -- APLICAR (identico ao _aplicar, sem begin/commit)

alter table app.growth_group_meetings add column if not exists reopened_at timestamptz;
alter table app.growth_group_meetings add column if not exists reopened_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict;
alter table app.church_events add column if not exists reopened_at timestamptz;
alter table app.church_events add column if not exists reopened_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict;

create or replace function private.v39_trava_fim_dia(p_church_id uuid, p_dia date) returns timestamptz
language sql stable security definer set search_path = pg_catalog, app, private as $f$
  select ((p_dia + 1)::timestamp) at time zone coalesce(nullif((select timezone from app.churches where id = p_church_id), ''), 'America/Sao_Paulo')
$f$;

create or replace function private.v39_trava_gc(m app.growth_group_meetings) returns timestamptz
language sql stable security definer set search_path = pg_catalog, app, private as $f$
  select coalesce(m.completed_at,
                  greatest(private.v39_trava_fim_dia(m.church_id, m.meeting_date), m.created_at, coalesce(m.reopened_at, '-infinity'::timestamptz)))
         + interval '24 hours'
$f$;

create or replace function private.v39_trava_evento(e app.church_events) returns timestamptz
language sql stable security definer set search_path = pg_catalog, app, private as $f$
  select coalesce(e.completed_at,
                  greatest(private.v39_trava_fim_dia(e.church_id,
                             (coalesce(e.ends_at, e.starts_at) at time zone coalesce(nullif((select timezone from app.churches where id = e.church_id), ''), 'America/Sao_Paulo'))::date),
                           e.created_at, coalesce(e.reopened_at, '-infinity'::timestamptz)))
         + interval '24 hours'
$f$;

-- marca local da transação gravada só pela RPC de reabrir: '<id>:<txid>'
create or replace function private.v39_trava_liberada(p_id uuid) returns boolean
language sql stable set search_path = pg_catalog as $f$
  select coalesce(current_setting('app.trava24', true), '') = p_id::text || ':' || txid_current()::text
$f$;

create or replace function private.v39_trava_guard_gc_meeting() returns trigger
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
begin
  if now() > private.v39_trava_gc(old) and not private.v39_trava_liberada(old.id) then
    perform app.raise_domain_error('REGISTRO_TRAVADO', 'Encontro encerrado ha mais de 24h: edicao travada. Peça ao pastor para reabrir.');
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $f$;

create or replace function private.v39_trava_guard_gc_child() returns trigger
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare m app.growth_group_meetings; v_id uuid;
begin
  v_id := case when tg_op = 'DELETE' then old.meeting_id else new.meeting_id end;
  select * into m from app.growth_group_meetings where id = v_id;
  if m.id is not null and now() > private.v39_trava_gc(m) and not private.v39_trava_liberada(m.id) then
    perform app.raise_domain_error('REGISTRO_TRAVADO', 'Encontro encerrado ha mais de 24h: edicao travada. Peça ao pastor para reabrir.');
  end if;
  if tg_op = 'UPDATE' and old.meeting_id is distinct from new.meeting_id then
    select * into m from app.growth_group_meetings where id = old.meeting_id;
    if m.id is not null and now() > private.v39_trava_gc(m) and not private.v39_trava_liberada(m.id) then
      perform app.raise_domain_error('REGISTRO_TRAVADO', 'Encontro encerrado ha mais de 24h: edicao travada.');
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $f$;

create or replace function private.v39_trava_guard_evento() returns trigger
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
begin
  if now() > private.v39_trava_evento(old) and not private.v39_trava_liberada(old.id) then
    perform app.raise_domain_error('REGISTRO_TRAVADO', 'Culto/evento encerrado ha mais de 24h: edicao travada. Peça ao pastor para reabrir.');
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $f$;

create or replace function private.v39_trava_guard_evento_resumo() returns trigger
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare e app.church_events; v_src text; v_id uuid;
begin
  v_src := case when tg_op = 'DELETE' then old.source else new.source end;
  v_id := case when tg_op = 'DELETE' then old.record_id else new.record_id end;
  if v_src = 'church_events' then
    select * into e from app.church_events where id = v_id;
    if e.id is not null and now() > private.v39_trava_evento(e) and not private.v39_trava_liberada(e.id) then
      perform app.raise_domain_error('REGISTRO_TRAVADO', 'Culto/evento encerrado ha mais de 24h: edicao travada. Peça ao pastor para reabrir.');
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $f$;

drop trigger if exists trg_v39_trava_gc_meeting on app.growth_group_meetings;
create trigger trg_v39_trava_gc_meeting before update or delete on app.growth_group_meetings
  for each row execute function private.v39_trava_guard_gc_meeting();
drop trigger if exists trg_v39_trava_gc_attendance on app.growth_group_attendance;
create trigger trg_v39_trava_gc_attendance before insert or update or delete on app.growth_group_attendance
  for each row execute function private.v39_trava_guard_gc_child();
drop trigger if exists trg_v39_trava_gc_summary on app.growth_group_meeting_summaries;
create trigger trg_v39_trava_gc_summary before insert or update or delete on app.growth_group_meeting_summaries
  for each row execute function private.v39_trava_guard_gc_child();
drop trigger if exists trg_v39_trava_evento on app.church_events;
create trigger trg_v39_trava_evento before update or delete on app.church_events
  for each row execute function private.v39_trava_guard_evento();
drop trigger if exists trg_v39_trava_evento_resumo on app.church_event_summaries;
create trigger trg_v39_trava_evento_resumo before insert or update or delete on app.church_event_summaries
  for each row execute function private.v39_trava_guard_evento_resumo();

create or replace function app.v39_registro_travas(p_church_id uuid, p_tipo text, p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
begin
  if app.current_user_account_id() is null or app.current_church_user_access_id(p_church_id) is null then
    perform app.raise_domain_error('ACCESS_DENIED', 'Sem acesso ativo a esta igreja');
  end if;
  if p_tipo = 'gc' then
    return coalesce((select jsonb_object_agg(m.id, jsonb_build_object('status', m.status, 'encerradoEm', m.completed_at,
              'travaEm', private.v39_trava_gc(m), 'travado', now() > private.v39_trava_gc(m), 'reabertoEm', m.reopened_at))
       from app.growth_group_meetings m where m.church_id = p_church_id and m.id = any (coalesce(p_ids, '{}'))), '{}'::jsonb);
  elsif p_tipo = 'evento' then
    return coalesce((select jsonb_object_agg(e.id, jsonb_build_object('status', e.status, 'encerradoEm', e.completed_at,
              'travaEm', private.v39_trava_evento(e), 'travado', now() > private.v39_trava_evento(e), 'reabertoEm', e.reopened_at))
       from app.church_events e where e.church_id = p_church_id and e.id = any (coalesce(p_ids, '{}'))), '{}'::jsonb);
  end if;
  perform app.raise_domain_error('TIPO_INVALIDO', 'Tipo deve ser gc ou evento');
end $f$;

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

create or replace function app.v39_registro_reabrir(p_church_id uuid, p_tipo text, p_id uuid, p_motivo text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_me uuid := app.current_user_account_id(); v_motivo text := btrim(coalesce(p_motivo, '')); m app.growth_group_meetings; e app.church_events; v_ant text;
begin
  if v_me is null or app.current_church_user_access_id(p_church_id) is null then
    perform app.raise_domain_error('ACCESS_DENIED', 'Sem acesso ativo a esta igreja');
  end if;
  if not private.has_active_profile_in_church(p_church_id, array['master','pastor']) then
    perform app.raise_domain_error('PERMISSION_DENIED', 'So master ou pastor reabre');
  end if;
  if length(v_motivo) < 10 then perform app.raise_domain_error('REASON_REQUIRED', 'Informe o motivo da reabertura (minimo 10 caracteres)'); end if;
  if p_tipo = 'gc' then
    select * into m from app.growth_group_meetings where id = p_id and church_id = p_church_id for update;
    if m.id is null then perform app.raise_domain_error('GC_MEETING_NOT_FOUND', 'Encontro nao encontrado'); end if;
    if m.status = 'cancelled' then perform app.raise_domain_error('REGISTRO_CANCELADO', 'Encontro cancelado nao reabre'); end if;
    v_ant := m.status;
    perform set_config('app.trava24', m.id::text || ':' || txid_current()::text, true);
    update app.growth_group_meetings set status = 'open', completed_at = null, reopened_at = now(), reopened_by_user_account_id = v_me,
           updated_by_user_account_id = v_me where id = m.id;
    perform set_config('app.trava24', '', true);
    select * into m from app.growth_group_meetings where id = m.id;
    insert into audit.events (church_id, actor_user_account_id, action, entity_schema, entity_name, entity_id, event_category, sensitivity, outcome, reason, source, metadata)
    values (p_church_id, v_me, 'registro_reaberto', 'app', 'growth_group_meetings', m.id::text, 'administrative', 'standard', 'success', left(v_motivo, 500), 'rpc',
            jsonb_build_object('tipo', 'gc', 'statusAnterior', v_ant));
    return jsonb_build_object('ok', true, 'status', m.status, 'travaEm', private.v39_trava_gc(m));
  elsif p_tipo = 'evento' then
    select * into e from app.church_events where id = p_id and church_id = p_church_id for update;
    if e.id is null then perform app.raise_domain_error('EVENT_NOT_FOUND', 'Culto ou evento nao encontrado'); end if;
    if e.status = 'cancelled' then perform app.raise_domain_error('REGISTRO_CANCELADO', 'Culto/evento cancelado nao reabre'); end if;
    v_ant := e.status;
    perform set_config('app.trava24', e.id::text || ':' || txid_current()::text, true);
    update app.church_events set status = 'open', completed_at = null, reopened_at = now(), reopened_by_user_account_id = v_me,
           updated_by_user_account_id = v_me where id = e.id;
    perform set_config('app.trava24', '', true);
    select * into e from app.church_events where id = e.id;
    insert into audit.events (church_id, actor_user_account_id, action, entity_schema, entity_name, entity_id, event_category, sensitivity, outcome, reason, source, metadata)
    values (p_church_id, v_me, 'registro_reaberto', 'app', 'church_events', e.id::text, 'administrative', 'standard', 'success', left(v_motivo, 500), 'rpc',
            jsonb_build_object('tipo', 'evento', 'statusAnterior', v_ant));
    return jsonb_build_object('ok', true, 'status', e.status, 'travaEm', private.v39_trava_evento(e));
  end if;
  perform app.raise_domain_error('TIPO_INVALIDO', 'Tipo deve ser gc ou evento');
end $f$;

revoke all on function private.v39_trava_fim_dia(uuid,date), private.v39_trava_gc(app.growth_group_meetings), private.v39_trava_evento(app.church_events),
  private.v39_trava_liberada(uuid), private.v39_trava_guard_gc_meeting(), private.v39_trava_guard_gc_child(), private.v39_trava_guard_evento(),
  private.v39_trava_guard_evento_resumo() from public, anon, authenticated;
revoke all on function app.v39_registro_travas(uuid,text,uuid[]), app.v39_registro_encerrar(uuid,text,uuid), app.v39_registro_reabrir(uuid,text,uuid,text) from public, anon;
grant execute on function app.v39_registro_travas(uuid,text,uuid[]), app.v39_registro_encerrar(uuid,text,uuid), app.v39_registro_reabrir(uuid,text,uuid,text) to authenticated;

  -- T1 estrutura
  if (select count(*) from information_schema.columns where table_schema = 'app' and table_name in ('growth_group_meetings','church_events')
        and column_name in ('reopened_at','reopened_by_user_account_id')) <> 4
     or (select count(*) from pg_trigger where not tgisinternal and tgname like 'trg\_v39\_trava\_%') <> 5
     or not has_function_privilege('authenticated', 'app.v39_registro_reabrir(uuid,text,uuid,text)', 'EXECUTE')
     or has_function_privilege('anon', 'app.v39_registro_reabrir(uuid,text,uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.v39_trava_guard_gc_meeting()', 'EXECUTE') then
    raise exception 'FALHOU T1: estrutura';
  end if;
  v_res := v_res || 'T1 ok; ';

  -- dados ficticios
  select id into v_master from app.access_profiles where code = 'master' and is_active;
  select id into v_leader from app.access_profiles where code = 'leader' and is_active;
  select id into v_disc from app.access_profiles where code = 'disciple' and is_active;
  select id into v_secr from app.access_profiles where code = 'secretary' and is_active;
  insert into app.churches (id, name, slug, timezone) values (v_ch, 'Igreja Teste TRAVA24', 'teste-trava24-' || left(v_ch::text, 8), 'America/Sao_Paulo');
  insert into auth.users (id, email) values (v_au_m, 't24m@teste.invalid'), (v_au_l, 't24l@teste.invalid'), (v_au_d, 't24d@teste.invalid'), (v_au_o, 't24o@teste.invalid'), (v_au_s, 't24s@teste.invalid');
  insert into app.people (full_name) values ('T24 Master') returning id into v_p_m;
  insert into app.people (full_name) values ('T24 Lider') returning id into v_p_l;
  insert into app.people (full_name) values ('T24 Discipulo') returning id into v_p_d;
  insert into app.people (full_name) values ('T24 Fora do GC') returning id into v_p_o;
  insert into app.people (full_name) values ('T24 Secretaria') returning id into v_p_s;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_m, v_p_m, 'active', now(), 't24m') returning id into v_ua_m;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_l, v_p_l, 'active', now(), 't24l') returning id into v_ua_l;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_d, v_p_d, 'active', now(), 't24d') returning id into v_ua_d;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_o, v_p_o, 'active', now(), 't24o') returning id into v_ua_o;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_s, v_p_s, 'active', now(), 't24s') returning id into v_ua_s;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua_m, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_master, true, now() - interval '1 day');
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua_l, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_leader, true, now() - interval '1 day');
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua_d, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_disc, true, now() - interval '1 day');
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua_o, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_disc, true, now() - interval '1 day');
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua_s, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_secr, true, now() - interval '1 day');
  insert into app.church_people (church_id, person_id, status) values (v_ch, v_p_m, 'active'), (v_ch, v_p_l, 'active'), (v_ch, v_p_d, 'active'), (v_ch, v_p_o, 'active'), (v_ch, v_p_s, 'active');
  insert into app.growth_groups (church_id, name) values (v_ch, 'GC T24') returning id into v_gg;
  insert into app.growth_groups (church_id, name) values (v_ch, 'GC T24 outro') returning id into v_gg2;
  insert into app.growth_group_memberships (growth_group_id, person_id, role_type, status, started_at) values
    (v_gg, v_p_l, 'leader', 'active', now() - interval '30 days'), (v_gg, v_p_d, 'participant', 'active', now() - interval '30 days'),
    (v_gg2, v_p_o, 'participant', 'active', now() - interval '30 days');
  insert into app.growth_group_meetings (church_id, growth_group_id, meeting_date, theme) values (v_ch, v_gg, (now() at time zone 'America/Sao_Paulo')::date, 'tema hoje') returning id into v_m1;
  insert into app.growth_group_meetings (church_id, growth_group_id, meeting_date, theme, created_at) values (v_ch, v_gg, (now() at time zone 'America/Sao_Paulo')::date - 5, 'tema antigo', now() - interval '5 days') returning id into v_m2;
  insert into app.growth_group_meetings (church_id, growth_group_id, meeting_date, theme) values (v_ch, v_gg, (now() at time zone 'America/Sao_Paulo')::date - 6, 'lancado atrasado') returning id into v_m3;
  insert into app.growth_group_meetings (church_id, growth_group_id, meeting_date, theme, status, cancelled_at, cancellation_reason, created_at) values (v_ch, v_gg, (now() at time zone 'America/Sao_Paulo')::date - 9, 'cancelado', 'cancelled', now() - interval '9 days', 'chuva', now() - interval '9 days') returning id into v_m4;
  insert into app.church_events (church_id, name, event_type, starts_at) values (v_ch, 'Culto T24 hoje', 'Culto', now()) returning id into v_e1;
  insert into app.church_events (church_id, name, event_type, starts_at, created_at) values (v_ch, 'Culto T24 antigo', 'Culto', now() - interval '5 days', now() - interval '6 days') returning id into v_e2;

  -- T2 travados
  begin update app.growth_group_meetings set theme = 'x' where id = v_m2; raise exception 'FALHOU T2a';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'REGISTRO_TRAVADO' then raise exception 'FALHOU T2a: %', sqlerrm; end if; end;
  begin insert into app.growth_group_attendance (meeting_id, person_id, attendance_status) values (v_m2, v_p_d, 'present'); raise exception 'FALHOU T2b';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'REGISTRO_TRAVADO' then raise exception 'FALHOU T2b: %', sqlerrm; end if; end;
  begin insert into app.growth_group_meeting_summaries (meeting_id, church_id, tithe_amount) values (v_m2, v_ch, 10); raise exception 'FALHOU T2c';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'REGISTRO_TRAVADO' then raise exception 'FALHOU T2c: %', sqlerrm; end if; end;
  begin update app.church_events set notes = 'x' where id = v_e2; raise exception 'FALHOU T2d';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'REGISTRO_TRAVADO' then raise exception 'FALHOU T2d: %', sqlerrm; end if; end;
  begin insert into app.church_event_summaries (source, record_id, church_id, tithe_amount) values ('church_events', v_e2, v_ch, 10); raise exception 'FALHOU T2e';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'REGISTRO_TRAVADO' then raise exception 'FALHOU T2e: %', sqlerrm; end if; end;
  begin delete from app.growth_group_meetings where id = v_m2; raise exception 'FALHOU T2f';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'REGISTRO_TRAVADO' then raise exception 'FALHOU T2f: %', sqlerrm; end if; end;
  v_res := v_res || 'T2 ok; ';

  -- T3 abertos
  update app.growth_group_meetings set theme = 'tema hoje 2' where id = v_m1;
  insert into app.growth_group_attendance (meeting_id, person_id, attendance_status) values (v_m1, v_p_d, 'present');
  insert into app.growth_group_meeting_summaries (meeting_id, church_id, tithe_amount) values (v_m1, v_ch, 10);
  update app.growth_group_meetings set theme = 'atrasado 2' where id = v_m3;
  insert into app.church_event_summaries (source, record_id, church_id, tithe_amount) values ('church_events', v_e1, v_ch, 10);
  update app.church_events set notes = 'ok' where id = v_e1;
  v_res := v_res || 'T3 ok; ';

  -- T4 RPC existente em encontro travado (lider)
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_l, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_l::text, true);
  begin
    set local role authenticated;
    perform app.save_gc_attendance(v_m2, jsonb_build_array(jsonb_build_object('person_id', v_p_d, 'attendance_status', 'present')), 'teste');
    reset role;
    raise exception 'FALHOU T4';
  exception when others then
    reset role;
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'REGISTRO_TRAVADO' then raise exception 'FALHOU T4: %', sqlerrm; end if;
  end;
  v_res := v_res || 'T4 ok; ';

  -- T5 encerrar
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_o, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_o::text, true);
  begin
    set local role authenticated; perform app.v39_registro_encerrar(v_ch, 'gc', v_m1); reset role; raise exception 'FALHOU T5a';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'PERMISSION_DENIED' then raise exception 'FALHOU T5a: %', sqlerrm; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_d, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_d::text, true);
  begin
    set local role authenticated; r := app.v39_registro_encerrar(v_ch, 'gc', v_m1); reset role;
  exception when others then reset role; raise exception 'FALHOU T5b: % %', sqlstate, sqlerrm;
  end;
  if r->>'status' <> 'completed' or (r->>'encerradoEm') is null or (r->>'travaEm')::timestamptz < now() + interval '23 hours' then raise exception 'FALHOU T5b: %', r; end if;
  update app.growth_group_meetings set theme = 'ajuste dentro de 24h' where id = v_m1;
  update app.growth_group_meetings set completed_at = now() - interval '25 hours' where id = v_m1;
  begin update app.growth_group_meetings set theme = 'depois de 24h' where id = v_m1; raise exception 'FALHOU T5c';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'REGISTRO_TRAVADO' then raise exception 'FALHOU T5c: %', sqlerrm; end if; end;
  begin insert into app.growth_group_attendance (meeting_id, person_id, attendance_status) values (v_m1, v_p_l, 'present'); raise exception 'FALHOU T5d';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'REGISTRO_TRAVADO' then raise exception 'FALHOU T5d: %', sqlerrm; end if; end;
  v_res := v_res || 'T5 ok; ';

  -- T6 reabrir
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_l, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_l::text, true);
  begin
    set local role authenticated; perform app.v39_registro_reabrir(v_ch, 'gc', v_m1, 'Lider tentando reabrir o encontro'); reset role; raise exception 'FALHOU T6a';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'PERMISSION_DENIED' then raise exception 'FALHOU T6a: %', sqlerrm; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  begin
    set local role authenticated; perform app.v39_registro_reabrir(v_ch, 'gc', v_m1, 'curto'); reset role; raise exception 'FALHOU T6b';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'REASON_REQUIRED' then raise exception 'FALHOU T6b: %', sqlerrm; end if;
  end;
  begin
    set local role authenticated; r := app.v39_registro_reabrir(v_ch, 'gc', v_m1, 'Faltou lancar a presenca de um visitante'); reset role;
  exception when others then reset role; raise exception 'FALHOU T6c: % %', sqlstate, sqlerrm;
  end;
  select count(*) into v_n from app.growth_group_meetings where id = v_m1 and status = 'open' and completed_at is null and reopened_at is not null and reopened_by_user_account_id = v_ua_m;
  if v_n <> 1 then raise exception 'FALHOU T6d: estado depois de reabrir'; end if;
  insert into app.growth_group_attendance (meeting_id, person_id, attendance_status) values (v_m1, v_p_l, 'present');
  select count(*) into v_n from audit.events where entity_id = v_m1::text and action = 'registro_reaberto' and reason = 'Faltou lancar a presenca de um visitante';
  if v_n <> 1 then raise exception 'FALHOU T6e: auditoria'; end if;
  v_res := v_res || 'T6 ok; ';

  -- T7 evento
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_d, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_d::text, true);
  begin
    set local role authenticated; perform app.v39_registro_encerrar(v_ch, 'evento', v_e1); reset role; raise exception 'FALHOU T7a';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'PERMISSION_DENIED' then raise exception 'FALHOU T7a: %', sqlerrm; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_s, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_s::text, true);
  begin
    set local role authenticated; r := app.v39_registro_encerrar(v_ch, 'evento', v_e1); reset role;
  exception when others then reset role; raise exception 'FALHOU T7b: % %', sqlstate, sqlerrm;
  end;
  if r->>'status' <> 'completed' then raise exception 'FALHOU T7b: %', r; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  begin
    set local role authenticated; r := app.v39_registro_reabrir(v_ch, 'evento', v_e2, 'Valor da oferta lancado errado'); reset role;
  exception when others then reset role; raise exception 'FALHOU T7c: % %', sqlstate, sqlerrm;
  end;
  update app.church_events set notes = 'corrigido' where id = v_e2;
  insert into app.church_event_summaries (source, record_id, church_id, tithe_amount) values ('church_events', v_e2, v_ch, 20);
  v_res := v_res || 'T7 ok; ';

  -- T8 travas e cancelado
  begin
    set local role authenticated;
    r := app.v39_registro_travas(v_ch, 'gc', array[v_m1, v_m2, v_m3]);
    reset role;
  exception when others then reset role; raise exception 'FALHOU T8a: % %', sqlstate, sqlerrm;
  end;
  if (r->v_m2::text->>'travado')::boolean is not true or (r->v_m1::text->>'travado')::boolean is not false
     or (r->v_m3::text->>'travado')::boolean is not false or r->v_m1::text->>'reabertoEm' is null then
    raise exception 'FALHOU T8a: %', r;
  end if;
  begin
    set local role authenticated; perform app.v39_registro_reabrir(v_ch, 'gc', v_m4, 'Tentando reabrir cancelado'); reset role; raise exception 'FALHOU T8b';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'REGISTRO_CANCELADO' then raise exception 'FALHOU T8b: %', sqlerrm; end if;
  end;
  v_res := v_res || 'T8 ok; ';

  -- T9 REVERTER: aborta com reaberto; sem reaberto remove tudo
  begin
    execute $x$
do $g$
begin
  if exists (select 1 from app.growth_group_meetings where reopened_at is not null)
     or exists (select 1 from app.church_events where reopened_at is not null) then
    raise exception 'TRAVA24_1 REVERTER ABORTADO: ha registro reaberto (reopened_at). Nada foi removido.';
  end if;
end $g$;
    $x$;
    raise exception 'FALHOU T9a';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm not like 'TRAVA24_1 REVERTER ABORTADO%' then raise exception 'FALHOU T9a: %', sqlerrm; end if;
  end;
  perform set_config('app.trava24', v_m1::text || ':' || txid_current()::text, true);
  update app.growth_group_meetings set reopened_at = null, reopened_by_user_account_id = null where id = v_m1;
  perform set_config('app.trava24', v_e2::text || ':' || txid_current()::text, true);
  update app.church_events set reopened_at = null, reopened_by_user_account_id = null where id = v_e2;
  perform set_config('app.trava24', '', true);
  execute $x$
do $g$
begin
  if exists (select 1 from app.growth_group_meetings where reopened_at is not null)
     or exists (select 1 from app.church_events where reopened_at is not null) then
    raise exception 'TRAVA24_1 REVERTER ABORTADO: ha registro reaberto (reopened_at). Nada foi removido.';
  end if;
end $g$;
  $x$;


drop trigger if exists trg_v39_trava_gc_meeting on app.growth_group_meetings;
drop trigger if exists trg_v39_trava_gc_attendance on app.growth_group_attendance;
drop trigger if exists trg_v39_trava_gc_summary on app.growth_group_meeting_summaries;
drop trigger if exists trg_v39_trava_evento on app.church_events;
drop trigger if exists trg_v39_trava_evento_resumo on app.church_event_summaries;
drop function if exists app.v39_registro_reabrir(uuid,text,uuid,text);
drop function if exists app.v39_registro_encerrar(uuid,text,uuid);
drop function if exists app.v39_registro_travas(uuid,text,uuid[]);
drop function if exists private.v39_trava_guard_evento_resumo();
drop function if exists private.v39_trava_guard_evento();
drop function if exists private.v39_trava_guard_gc_child();
drop function if exists private.v39_trava_guard_gc_meeting();
drop function if exists private.v39_trava_liberada(uuid);
drop function if exists private.v39_trava_evento(app.church_events);
drop function if exists private.v39_trava_gc(app.growth_group_meetings);
drop function if exists private.v39_trava_fim_dia(uuid,date);
alter table app.church_events drop column if exists reopened_by_user_account_id;
alter table app.church_events drop column if exists reopened_at;
alter table app.growth_group_meetings drop column if exists reopened_by_user_account_id;
alter table app.growth_group_meetings drop column if exists reopened_at;

  if exists (select 1 from pg_trigger where not tgisinternal and tgname like 'trg\_v39\_trava\_%')
     or to_regprocedure('app.v39_registro_reabrir(uuid,text,uuid,text)') is not null
     or exists (select 1 from information_schema.columns where table_schema = 'app' and column_name = 'reopened_at' and table_name in ('growth_group_meetings','church_events')) then
    raise exception 'FALHOU T9b: sobrou objeto da TRAVA24_1';
  end if;
  update app.growth_group_meetings set theme = 'sem trava de novo' where id = v_m2;
  v_res := v_res || 'T9 ok (REVERTER ok)';

  raise exception 'TESTE TRAVA24_1 CONCLUIDO (nada foi gravado): %', v_res;
end
$t$;
