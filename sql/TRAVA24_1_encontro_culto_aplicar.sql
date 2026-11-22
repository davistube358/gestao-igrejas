-- =====================================================================
-- TRAVA24_1 · Encontro do GC e culto/evento: encerrar e travar a edição 24h depois · APLICAR
-- 22/11/2026 · DATA · decisões do Diogo: master/pastor reabre com motivo; sem "Encerrar", conta como
--   encerrado no fim do dia do encontro/culto.
-- VALIDACAO: ver cabecalho de TRAVA24_1_encontro_culto_teste_rollback.sql
-- ---------------------------------------------------------------------
-- Regra: trava_em = coalesce(completed_at, greatest(fim do dia do registro, created_at, reopened_at)) + 24h
--   fim do dia = meia-noite seguinte no fuso da igreja (app.churches.timezone; padrão America/Sao_Paulo).
--   GC: dia = meeting_date. Evento/culto: dia = data local de coalesce(ends_at, starts_at).
--   created_at entra para que um encontro lançado atrasado ainda tenha 24h de preenchimento.
-- Depois de trava_em, nenhuma escrita passa (gatilhos BEFORE), qualquer que seja a RPC:
--   app.growth_group_meetings (update/delete), app.growth_group_attendance e app.growth_group_meeting_summaries
--   (insert/update/delete), app.church_events (update/delete), app.church_event_summaries de source
--   'church_events' (insert/update/delete). Erro: REGISTRO_TRAVADO (P0001).
-- RPCs novas (SECURITY DEFINER, conta ativa e acesso ativo à igreja):
--   app.v39_registro_encerrar(church, tipo 'gc'|'evento', id): status completed + completed_at.
--     GC: master/pastor ou membro ativo do GC (leader/co_leader/host/supervisor/participant). Evento: master/pastor/
--     secretary/secretariat/treasury.
--   app.v39_registro_reabrir(church, tipo, id, motivo): só master/pastor; motivo >= 10; volta a 'open',
--     limpa completed_at, grava reopened_at/by (mais 24h para corrigir) e audit.events. Cancelado não reabre.
--   app.v39_registro_travas(church, tipo, ids[]): {id: {status, encerradoEm, travaEm, travado, reabertoEm}}.
-- Colunas novas (nulas): reopened_at, reopened_by_user_account_id em app.growth_group_meetings e app.church_events.
-- Hoje (22/11/2026): 5 encontros (planned) e 41 eventos; nenhum completed. Registros de dias passados ficam
--   travados assim que aplicar (regra "encerra sozinho"); master/pastor reabre se precisar.
-- Reverter: TRAVA24_1_encontro_culto_reverter.sql (aborta se algum registro já foi reaberto).
-- Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

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

commit;

notify pgrst, 'reload schema';

-- VERIFICACAO (tudo deve ser true)
select
  (select count(*) = 4 from information_schema.columns where table_schema = 'app' and table_name in ('growth_group_meetings','church_events')
     and column_name in ('reopened_at','reopened_by_user_account_id')) as colunas_ok,
  (select count(*) = 5 from pg_trigger where not tgisinternal and tgname like 'trg\_v39\_trava\_%') as gatilhos_5,
  has_function_privilege('authenticated', 'app.v39_registro_encerrar(uuid,text,uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'app.v39_registro_reabrir(uuid,text,uuid,text)', 'EXECUTE')
    and has_function_privilege('authenticated', 'app.v39_registro_travas(uuid,text,uuid[])', 'EXECUTE') as rpcs_ok,
  not has_function_privilege('anon', 'app.v39_registro_reabrir(uuid,text,uuid,text)', 'EXECUTE') as anon_fechado,
  not has_function_privilege('authenticated', 'private.v39_trava_guard_gc_meeting()', 'EXECUTE') as gatilho_fechado;
