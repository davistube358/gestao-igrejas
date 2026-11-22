-- =====================================================================
-- B63_3 · LGPD · Auditoria · APLICAR
-- Build 63 · DATA-63b · decisoes do PO D12, D13, D15 (22/11/2026)
-- VALIDACAO (22/11/2026, MCP execute_sql, conteudo deste arquivo dentro de do $t$, sem begin/commit):
--   ERROR P0001: TESTE APLICAR B63_3 OK (nada foi gravado): V0 ok (4 ganchos, 1 cada, volatilidade
--   STABLE mantida, backups gravados); casos C1-C5 ok (prontuario via gatilho, relatorio financeiro
--   via gancho, negados discipulo/pastor/outra igreja, sem duplicar, filtro, anon); REVERTER ok:
--   4 funcoes com md5 original e catalogo (funcoes, tabelas, gatilhos) identico ao original
--   Obs.: a reexecucao do bloco de ganchos (idempotencia) e garantida pelo marcador "-- B63_HOOK",
--   mas nao foi executada duas vezes no teste.
-- ---------------------------------------------------------------------
-- Objetivo: gravar acessos a dados sensiveis e eventos administrativos e oferecer a consulta
--   app.v39_audit_list (substitui chamar('auditoria',{filtro}); so master: audit.view; fontes de
--   saude/sensiveis exigem sensitive_access.audit).
-- Ordem de aplicacao do Build 63: B63_1 -> B63_3 -> B63_2. (Este arquivo recria os gates
--   private.v39_lgpd_me/need identicos aos do B63_1, entao nao quebra se aplicado sozinho.)
-- Pre-requisitos: audit.events, app.sensitive_data_access_log, app.data_sensitivity_levels,
--   app.v39_inst_record_log, app.file_access_log, app.access_history, private.auth_login_events,
--   app.v39_function_backups, private.v39_fin_me, app.has_permission.
--
-- FUNCOES EXISTENTES SUBSTITUIDAS (create or replace com a definicao atual + 1 linha de gancho logo
-- apos o "begin"; o bloco confere o md5 da definicao revisada em 22/11/2026 e ABORTA se ela mudou;
-- a definicao original e copiada para app.v39_function_backups com function_name 'B63_3:<assinatura>'):
--   app.v39_inst_patient_photo(uuid,uuid)            md5 0d8d9e8bd05b718e04f6c7a0f71c840f  (foto do atendido)
--   app.v39_est_prescription(uuid,jsonb)             md5 22338475688e9c5e2f3ea8251118a373  (receita da Farmacia)
--   app.v39_fin_grant_report(uuid,uuid,date,date)    md5 c0e37d62675446f1752d7b443cdc3425  (prestacao de contas)
--   app.v39_fin_report(uuid,integer,integer)         md5 b19f1f457657e9502d5fa59b3996e7f1  (relatorio financeiro)
--   Assinatura, retorno, volatilidade, search_path e grants nao mudam.
-- Prontuario SEM substituir funcao: gatilho AFTER INSERT em app.v39_inst_record_log, que ja e gravado
--   por v39_inst_record_list (read), v39_inst_record_save (save), v39_inst_patient_contact (contact)
--   e v39_inst_print_log (print:*).
-- CPF: nenhuma RPC exposta devolve CPF completo (get_person mascara; get_my_frontend_context remove).
-- Limite (D13): acesso negado que termina em raise nao fica gravado.
-- Pode aplicar antes do front? SIM. Os ganchos e o gatilho funcionam sem mudanca no front; a tela de
--   auditoria so passa a usar v39_audit_list quando o front trocar chamar('auditoria').
-- Reverter: B63_3_auditoria_reverter.sql (restaura exatamente as 4 definicoes originais, conferindo md5).
-- Verificar depois de aplicar: bloco SELECT no fim deste arquivo.
-- Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

create or replace function private.v39_lgpd_me(p_church_id uuid) returns uuid
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare v_me uuid := private.v39_fin_me();
begin
  if v_me is null or p_church_id is null or app.current_church_user_access_id(p_church_id) is null then
    perform app.raise_domain_error('ACCESS_DENIED', 'Sem acesso ativo a esta igreja');
  end if;
  return v_me;
end $f$;

create or replace function private.v39_lgpd_need(p_church_id uuid, p_code text) returns uuid
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare v_me uuid := private.v39_lgpd_me(p_church_id);
begin
  if not app.has_permission(p_code, p_church_id) then
    perform app.raise_domain_error('PERMISSION_DENIED', 'Sem permissao: ' || p_code);
  end if;
  return v_me;
end $f$;

create or replace function private.v39_audit_log(p_church_id uuid, p_category text, p_action text, p_entity_schema text, p_entity_name text,
                                                 p_entity_id text default null, p_person_id uuid default null, p_sensitivity text default 'standard',
                                                 p_outcome text default 'success', p_reason text default null, p_metadata jsonb default '{}'::jsonb) returns bigint
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_id bigint; v_me uuid := app.current_user_account_id();
begin
  insert into audit.events (church_id, actor_user_account_id, actor_person_id, action, entity_schema, entity_name, entity_id, event_category,
                            sensitivity, outcome, reason, source, metadata)
  values (p_church_id, v_me, (select person_id from app.user_accounts where id = v_me), p_action, p_entity_schema, p_entity_name, p_entity_id,
          p_category, p_sensitivity, p_outcome, left(p_reason, 500), 'rpc',
          coalesce(p_metadata, '{}'::jsonb) || case when p_person_id is null then '{}'::jsonb else jsonb_build_object('person_id', p_person_id) end)
  returning id into v_id;
  return v_id;
end $f$;

create or replace function private.v39_sensitive_log(p_church_id uuid, p_person_id uuid, p_level text, p_operation text, p_entity_schema text,
                                                     p_entity_name text, p_entity_id text, p_reason text, p_outcome text default 'allowed',
                                                     p_metadata jsonb default '{}'::jsonb) returns bigint
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_id bigint; v_me uuid := app.current_user_account_id(); v_level uuid;
begin
  if v_me is null then return null; end if;
  select id into v_level from app.data_sensitivity_levels where code = coalesce(p_level, 'sensitive');
  if v_level is null then select id into v_level from app.data_sensitivity_levels where code = 'sensitive'; end if;
  insert into app.sensitive_data_access_log (church_id, user_account_id, person_id, sensitivity_level_id, operation, entity_schema, entity_name,
                                             entity_id, access_reason, outcome, metadata)
  values (p_church_id, v_me, p_person_id, v_level, p_operation, p_entity_schema, p_entity_name, p_entity_id,
          coalesce(nullif(btrim(p_reason), ''), 'consulta'), p_outcome, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $f$;

-- prontuario: espelha cada linha de v39_inst_record_log em sensitive_data_access_log (sem conteudo clinico)
create or replace function private.v39_inst_record_log_audit() returns trigger
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_level text; v_op text; v_reason text; v_lvl uuid;
begin
  if new.user_account_id is null then return new; end if;
  if new.action = 'read' then v_level := 'health'; v_op := 'view'; v_reason := 'Prontuario: leitura';
  elsif new.action = 'save' then v_level := 'health'; v_op := 'update'; v_reason := 'Prontuario: gravacao';
  elsif new.action = 'contact' then v_level := 'personal'; v_op := 'view'; v_reason := 'Contato do paciente';
  elsif new.action like 'print:%' then v_level := 'health'; v_op := 'print'; v_reason := 'Impressao: ' || substr(new.action, 7);
  else v_level := 'sensitive'; v_op := 'view'; v_reason := 'Instituto: ' || new.action;
  end if;
  select id into v_lvl from app.data_sensitivity_levels where code = v_level;
  insert into app.sensitive_data_access_log (church_id, user_account_id, person_id, sensitivity_level_id, operation, entity_schema, entity_name,
                                             entity_id, access_reason, outcome, metadata)
  values (new.church_id, new.user_account_id, new.patient_person_id, v_lvl, v_op, 'app', 'v39_inst_record_log', new.id::text, v_reason, 'allowed',
          jsonb_build_object('professional_id', new.professional_id, 'appointment_id', new.appointment_id));
  return new;
end $f$;
drop trigger if exists v39_inst_record_log_audit on app.v39_inst_record_log;
create trigger v39_inst_record_log_audit after insert on app.v39_inst_record_log
  for each row execute function private.v39_inst_record_log_audit();

-- ganchos nas 4 funcoes existentes (idempotente: pula se o gancho ja estiver la)
do $a$
declare r record; v_def text;
begin
  for r in select * from (values
      ('app.v39_inst_patient_photo(uuid,uuid)', '0d8d9e8bd05b718e04f6c7a0f71c840f',
       $h$perform private.v39_sensitive_log(p_church_id, p_person, 'personal', 'view', 'app', 'people.photo', null, 'Foto do atendido'); -- B63_HOOK$h$),
      ('app.v39_est_prescription(uuid,jsonb)', '22338475688e9c5e2f3ea8251118a373',
       $h$perform private.v39_sensitive_log(p_church_id, null, 'health', 'view', 'app', 'pharmacy_prescriptions', null, 'Receita da Farmacia', 'allowed', coalesce(p, '{}'::jsonb)); -- B63_HOOK$h$),
      ('app.v39_fin_grant_report(uuid,uuid,date,date)', 'c0e37d62675446f1752d7b443cdc3425',
       $h$perform private.v39_sensitive_log(p_church_id, null, 'financial', 'view', 'app', 'v39_fin_grant_report', p_grant::text, 'Prestacao de contas de convenio'); -- B63_HOOK$h$),
      ('app.v39_fin_report(uuid,integer,integer)', 'b19f1f457657e9502d5fa59b3996e7f1',
       $h$perform private.v39_sensitive_log(p_church_id, null, 'financial', 'view', 'app', 'v39_fin_report', p_year || '-' || p_month, 'Relatorio financeiro'); -- B63_HOOK$h$)
    ) as t(sig, md5_orig, hook)
  loop
    v_def := pg_get_functiondef(r.sig::regprocedure);
    if position('-- B63_HOOK' in v_def) > 0 then continue; end if;
    if md5(v_def) <> r.md5_orig then
      raise exception 'B63_3 ABORTADO: % mudou desde a revisao de 22/11/2026 (md5 %). Revisar o gancho antes de aplicar.', r.sig, md5(v_def);
    end if;
    insert into app.v39_function_backups (function_name, definition, saved_at) values ('B63_3:' || r.sig, v_def, now());
    execute regexp_replace(v_def, '\mbegin\M', 'begin' || chr(10) || '  ' || r.hook, 'i');
  end loop;
end $a$;

create or replace function app.v39_audit_list(p_church_id uuid, p_filtro text default '', p_limit integer default 500, p_offset integer default 0,
                                              p_de timestamptz default null, p_ate timestamptz default null) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := private.v39_lgpd_need(p_church_id, 'audit.view');
  v_sens boolean := app.has_permission('sensitive_access.audit', p_church_id);
  v_q text := nullif(btrim(coalesce(p_filtro, '')), '');
  v_lim int := least(greatest(coalesce(p_limit, 500), 1), 500);
  v_off int := greatest(coalesce(p_offset, 0), 0);
  v_total int; v_itens jsonb;
begin
  with base as (
    select e.occurred_at as data, coalesce(ua.username, 'sistema') as usuario,
           case e.action
             when 'person_anonymized' then 'anonimizou pessoa'
             when 'person_restricted_health_retention' then 'restringiu pessoa (guarda de saude)'
             when 'privacy_policy_accepted' then 'aceitou a politica'
             when 'privacy_policy_accepted_signup' then 'aceitou a politica no cadastro'
             when 'privacy_policy_published' then 'publicou nova politica'
             when 'data_subject_request_created' then 'registrou pedido do titular'
             when 'data_subject_request_approved' then 'aprovou pedido do titular'
             when 'data_subject_request_rejected' then 'recusou pedido do titular'
             when 'audit_viewed' then 'consultou a auditoria'
             else e.action end as acao,
           concat_ws(' · ', e.entity_name, nullif(e.reason, '')) as detalhe, 'evento' as fonte, e.event_category as categoria, e.outcome as resultado,
           e.sensitivity in ('sensitive', 'health', 'minor') as sensivel
      from audit.events e left join app.user_accounts ua on ua.id = e.actor_user_account_id
     where e.church_id = p_church_id
    union all
    select s.accessed_at, coalesce(ua.username, '?'), 'acesso a dado sensivel: ' || s.operation,
           concat_ws(' · ', s.entity_name, s.access_reason), 'sensivel', dl.code, s.outcome, true
      from app.sensitive_data_access_log s join app.data_sensitivity_levels dl on dl.id = s.sensitivity_level_id
      left join app.user_accounts ua on ua.id = s.user_account_id
     where s.church_id = p_church_id
    union all
    -- linhas antigas do prontuario (antes do gatilho); as novas ja aparecem como acesso sensivel
    select l.occurred_at, coalesce(ua.username, '?'), 'prontuario: ' || l.action, 'paciente ' || left(l.patient_person_id::text, 8), 'prontuario', 'health', 'allowed', true
      from app.v39_inst_record_log l left join app.user_accounts ua on ua.id = l.user_account_id
     where l.church_id = p_church_id
       and not exists (select 1 from app.sensitive_data_access_log s2 where s2.entity_name = 'v39_inst_record_log' and s2.entity_id = l.id::text)
    union all
    select f.accessed_at, coalesce(ua.username, '?'), 'arquivo: ' || f.operation, f.reason, 'arquivo', 'file', f.outcome, true
      from app.file_access_log f left join app.user_accounts ua on ua.id = f.user_account_id
     where f.church_id = p_church_id
    union all
    select h.occurred_at, coalesce(actor.username, 'sistema'),
           case h.action when 'approved' then 'aprovou acesso' when 'rejected' then 'recusou acesso' when 'suspended' then 'bloqueou usuario'
                         when 'reactivated' then 'reativou usuario' when 'session_ended' then 'encerrou sessoes' when 'correction_requested' then 'pediu correcao de cadastro'
                         when 'profile_assigned' then 'atribuiu perfil' when 'profile_removed' then 'removeu perfil' else h.action end,
           concat_ws(' · ', '@' || target.username, nullif(h.reason, '')), 'acesso', 'access', 'success', false
      from app.access_history h left join app.user_accounts actor on actor.id = h.performed_by_user_account_id
      left join app.user_accounts target on target.id = h.user_account_id
     where h.church_id = p_church_id
    union all
    select a.occurred_at, coalesce(ua.username, '?'),
           case a.event_type when 'success' then 'login' when 'failure' then 'falha de login' when 'locked' then 'bloqueio por tentativas'
                             when 'password_reset' then 'redefiniu senha' when 'password_changed' then 'trocou a senha'
                             when 'username_changed' then 'corrigiu usuario' when 'email_changed' then 'corrigiu e-mail' else a.event_type end,
           '', 'login', 'authentication', case when a.event_type in ('failure', 'locked') then 'denied' else 'success' end, false
      from private.auth_login_events a join app.user_accounts ua on ua.id = a.user_account_id
     where exists (select 1 from app.church_user_access cua where cua.user_account_id = a.user_account_id and cua.church_id = p_church_id)
  ), filtrado as (
    select * from base
     where (v_sens or not sensivel)
       and (p_de is null or data >= p_de) and (p_ate is null or data < p_ate)
       and (v_q is null or usuario ilike '%' || v_q || '%' or acao ilike '%' || v_q || '%' or detalhe ilike '%' || v_q || '%')
  )
  select (select count(*) from filtrado),
         coalesce((select jsonb_agg(jsonb_build_object('data', data, 'usuario', usuario, 'acao', acao, 'detalhe', detalhe, 'fonte', fonte,
                                                       'categoria', categoria, 'resultado', resultado) order by data desc)
                     from (select * from filtrado order by data desc limit v_lim offset v_off) p), '[]'::jsonb)
    into v_total, v_itens;
  perform private.v39_audit_log(p_church_id, 'sensitive_access', 'audit_viewed', 'audit', 'events', null, null, 'restricted', 'success', null,
                                jsonb_build_object('filtro', left(coalesce(v_q, ''), 60), 'total', v_total, 'sensiveis', v_sens));
  return jsonb_build_object('ok', true, 'total', v_total, 'itens', v_itens, 'limite', v_lim, 'offset', v_off, 'incluiSensiveis', v_sens);
end $f$;

revoke all on function private.v39_lgpd_me(uuid), private.v39_lgpd_need(uuid,text),
  private.v39_audit_log(uuid,text,text,text,text,text,uuid,text,text,text,jsonb),
  private.v39_sensitive_log(uuid,uuid,text,text,text,text,text,text,text,jsonb),
  private.v39_inst_record_log_audit() from public, anon, authenticated;
revoke all on function app.v39_audit_list(uuid,text,integer,integer,timestamptz,timestamptz) from public, anon;
grant execute on function app.v39_audit_list(uuid,text,integer,integer,timestamptz,timestamptz) to authenticated;

commit;

-- ---------------------------------------------------------------------
-- VERIFICACAO (rodar depois do commit; tudo deve ser true)
-- ---------------------------------------------------------------------
select
  to_regprocedure('app.v39_audit_list(uuid,text,integer,integer,timestamptz,timestamptz)') is not null as consulta_ok,
  not has_function_privilege('anon', 'app.v39_audit_list(uuid,text,integer,integer,timestamptz,timestamptz)', 'EXECUTE') as anon_sem_execute,
  not has_function_privilege('authenticated', 'private.v39_sensitive_log(uuid,uuid,text,text,text,text,text,text,text,jsonb)', 'EXECUTE') as helper_fechado,
  exists (select 1 from pg_trigger where tgname = 'v39_inst_record_log_audit' and tgrelid = 'app.v39_inst_record_log'::regclass) as gatilho_prontuario_ok,
  (select count(*) = 4 from pg_proc where oid in ('app.v39_inst_patient_photo(uuid,uuid)'::regprocedure, 'app.v39_est_prescription(uuid,jsonb)'::regprocedure,
     'app.v39_fin_grant_report(uuid,uuid,date,date)'::regprocedure, 'app.v39_fin_report(uuid,integer,integer)'::regprocedure)
     and prosrc like '%-- B63_HOOK%') as quatro_ganchos_ok,
  (select count(*) >= 4 from app.v39_function_backups where function_name like 'B63_3:%') as backups_ok;
