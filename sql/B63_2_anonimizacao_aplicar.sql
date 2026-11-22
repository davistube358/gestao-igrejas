-- =====================================================================
-- B63_2 · LGPD · Anonimizacao (pedido -> aprovacao -> execucao) · APLICAR
-- Build 63 · DATA-63b · decisoes do PO D5, D6, D7, D8, D9, D10, D11 (22/11/2026)
-- VALIDACAO (22/11/2026, MCP execute_sql, conteudo deste arquivo dentro de do $t$, sem begin/commit):
--   ERROR P0001: TESTE APLICAR B63_2 OK (nada foi gravado): V0 ok; casos C1-C7 ok (discipulo negado,
--   nao aprovado, mascara mantendo cidade/UF, financeiro 123.45 e presenca intactos, saude bloqueada,
--   anon, reverter aborta com anonimizado); REVERTER ok: funcoes, tabelas, colunas e constraints
--   identicas ao original
-- ---------------------------------------------------------------------
-- Objetivo: executar pedidos do titular (app.data_subject_requests). A anonimizacao mascara nome,
--   apelido, CPF, nascimento, sexo, observacoes, foto, contatos, endereco (mantem cidade/UF - D6),
--   e-mail/notas do pedido de acesso e username; revoga conta e acessos; PRESERVA ids, financeiro,
--   presencas, consentimentos e historicos. Pessoa com prontuario/receita: bloqueia, com opcao
--   'restrict' (D7). Pessoa em outra igreja: bloqueia (D8). Irreversivel; exige digitar ANONIMIZAR.
-- Ordem de aplicacao do Build 63: B63_1 -> B63_3 -> B63_2. (Recria os gates private.v39_lgpd_me/need
--   identicos aos do B63_1.)
-- Pre-requisitos: app.data_subject_requests, app.data_subject_request_history, app.people,
--   app.church_people, app.person_contacts, app.person_addresses, app.files, app.user_accounts,
--   app.church_user_access, app.access_requests, tabelas de saude (v39_inst_records,
--   institute_clinical_records, institute_health_records, pharmacy_prescriptions, pharmacy_deliveries),
--   audit.events, private.v39_fin_me, app.has_permission.
-- Substitui funcao existente? NAO. Altera tabela existente: app.people ganha 2 colunas (anonymized_at,
--   anonymized_by_user_account_id), nulas, sem mudar CHECK de status.
-- Pode aplicar antes do front? SIM (nada chama as funcoes novas). Antes de LIGAR a anonimizacao no
--   front, a Edge "auth" precisa da acao 'anonimizarConta' (D9/D10: banir usuario Auth, trocar e-mail,
--   revogar sessoes e apagar a foto do Storage, usando authUsersParaDesativar do retorno).
-- Reverter: B63_2_anonimizacao_reverter.sql (aborta se alguma pessoa ja foi anonimizada).
-- Verificar depois de aplicar: bloco SELECT no fim deste arquivo.
-- Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

alter table app.people add column if not exists anonymized_at timestamptz;
alter table app.people add column if not exists anonymized_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict;

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

create or replace function private.v39_dsr_move(p_req uuid, p_old text, p_new text, p_action text, p_actor uuid, p_reason text, p_meta jsonb) returns void
language sql security definer set search_path = pg_catalog, app, private as $f$
  insert into app.data_subject_request_history (request_id, previous_status, new_status, action, performed_by_user_account_id, reason, metadata)
  values (p_req, p_old, p_new, p_action, p_actor, p_reason, coalesce(p_meta, '{}'::jsonb))
$f$;

create or replace function app.v39_privacy_request_create(p_church_id uuid, p_person_id uuid, p_type text, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_me uuid := private.v39_lgpd_me(p_church_id); v_id uuid;
begin
  if not (app.has_permission('privacy.requests.manage', p_church_id) or app.has_permission('people.update', p_church_id)) then
    perform app.raise_domain_error('PERMISSION_DENIED', 'Sem permissao para registrar pedido do titular');
  end if;
  if p_type not in ('access','confirmation','correction','portability','restriction','anonymization','deletion','consent_revocation','information','review') then
    perform app.raise_domain_error('DSR_TYPE_INVALID', 'Tipo de pedido invalido');
  end if;
  if nullif(btrim(p_reason), '') is null then perform app.raise_domain_error('REASON_REQUIRED', 'Informe o motivo'); end if;
  if not exists (select 1 from app.church_people cp where cp.church_id = p_church_id and cp.person_id = p_person_id) then
    perform app.raise_domain_error('PERSON_NOT_IN_CHURCH', 'Pessoa nao pertence a esta igreja');
  end if;
  if exists (select 1 from app.data_subject_requests where church_id = p_church_id and person_id = p_person_id and request_type = p_type
              and status in ('received','identity_validation','under_review','waiting_information','approved','partially_approved')) then
    perform app.raise_domain_error('DSR_ALREADY_OPEN', 'Ja existe pedido aberto deste tipo para a pessoa');
  end if;
  insert into app.data_subject_requests (church_id, person_id, request_type, description, status, received_at, created_by, updated_by)
  values (p_church_id, p_person_id, p_type, left(btrim(p_reason), 500), 'received', now(), v_me, v_me) returning id into v_id;
  perform private.v39_dsr_move(v_id, null, 'received', 'created', v_me, left(btrim(p_reason), 500), jsonb_build_object('type', p_type));
  insert into audit.events (church_id, actor_user_account_id, action, entity_schema, entity_name, entity_id, event_category, sensitivity, outcome, source, metadata)
  values (p_church_id, v_me, 'data_subject_request_created', 'app', 'data_subject_requests', v_id::text, 'privacy', 'personal', 'success', 'rpc', jsonb_build_object('type', p_type));
  return jsonb_build_object('ok', true, 'pedidoId', v_id, 'status', 'received');
end $f$;

create or replace function app.v39_privacy_requests_list(p_church_id uuid, p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
begin
  perform private.v39_lgpd_need(p_church_id, 'privacy.requests.manage');
  return coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'pessoaId', d.person_id, 'pessoa', pe.full_name, 'tipo', d.request_type,
            'status', d.status, 'motivo', d.description, 'recebidoEm', d.received_at, 'decididoEm', d.decision_at,
            'decisao', d.decision_reason, 'concluidoEm', d.completed_at, 'resultado', d.response_reference) order by d.received_at desc)
    from app.data_subject_requests d join app.people pe on pe.id = d.person_id
   where d.church_id = p_church_id and (p_status is null or d.status = p_status)), '[]'::jsonb);
end $f$;

create or replace function app.v39_privacy_request_decide(p_church_id uuid, p_request_id uuid, p_decision text, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_me uuid := private.v39_lgpd_need(p_church_id, 'privacy.requests.manage'); d app.data_subject_requests;
begin
  select * into d from app.data_subject_requests where id = p_request_id and church_id = p_church_id for update;
  if d.id is null then perform app.raise_domain_error('REQUEST_NOT_FOUND', 'Pedido nao encontrado'); end if;
  if d.status not in ('received','identity_validation','under_review','waiting_information') then
    perform app.raise_domain_error('DSR_ALREADY_DECIDED', 'Pedido ja decidido');
  end if;
  if p_decision not in ('approved','rejected') then perform app.raise_domain_error('DSR_DECISION_INVALID', 'Decisao invalida'); end if;
  if nullif(btrim(p_reason), '') is null then perform app.raise_domain_error('REASON_REQUIRED', 'Informe o motivo'); end if;
  update app.data_subject_requests set status = p_decision, decision_at = now(), decision_reason = left(btrim(p_reason), 500),
         assigned_to_user_account_id = v_me, identity_validated_at = coalesce(identity_validated_at, now()), updated_by = v_me
   where id = d.id;
  perform private.v39_dsr_move(d.id, d.status, p_decision, 'decided', v_me, left(btrim(p_reason), 500), null);
  insert into audit.events (church_id, actor_user_account_id, action, entity_schema, entity_name, entity_id, event_category, sensitivity, outcome, source, metadata)
  values (p_church_id, v_me, 'data_subject_request_' || p_decision, 'app', 'data_subject_requests', d.id::text, 'approval', 'personal', 'success', 'rpc', jsonb_build_object('type', d.request_type));
  return jsonb_build_object('ok', true, 'status', p_decision);
end $f$;

create or replace function app.v39_privacy_anonymize_execute(p_church_id uuid, p_request_id uuid, p_confirm text, p_health_mode text default 'block') returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := private.v39_lgpd_need(p_church_id, 'privacy.requests.manage');
  d app.data_subject_requests; v_person uuid; v_code text; v_health boolean; v_name text; v_auth uuid[];
  v_n_contacts int := 0; v_n_addr int := 0; v_n_acc int := 0;
begin
  select * into d from app.data_subject_requests where id = p_request_id and church_id = p_church_id for update;
  if d.id is null then perform app.raise_domain_error('REQUEST_NOT_FOUND', 'Pedido nao encontrado'); end if;
  if d.request_type <> 'anonymization' or d.status <> 'approved' then
    perform app.raise_domain_error('ANONYMIZATION_NOT_APPROVED', 'O pedido precisa estar aprovado');
  end if;
  if p_confirm is distinct from 'ANONIMIZAR' then perform app.raise_domain_error('CONFIRMATION_REQUIRED', 'Digite ANONIMIZAR para confirmar'); end if;
  if p_health_mode not in ('block','restrict') then perform app.raise_domain_error('HEALTH_MODE_INVALID', 'Modo invalido'); end if;
  v_person := d.person_id;
  if exists (select 1 from app.user_accounts where id = v_me and person_id = v_person) then
    perform app.raise_domain_error('ANONYMIZATION_SELF_DENIED', 'Nao e possivel anonimizar o proprio cadastro');
  end if;
  if exists (select 1 from app.church_people where person_id = v_person and church_id <> p_church_id and ended_at is null) then
    perform app.raise_domain_error('ANONYMIZATION_MULTI_CHURCH', 'Pessoa ligada a outra igreja: decisao conjunta necessaria');
  end if;
  v_health := exists (select 1 from app.v39_inst_records where patient_person_id = v_person)
           or exists (select 1 from app.institute_clinical_records where patient_person_id = v_person)
           or exists (select 1 from app.institute_health_records where person_id = v_person)
           or exists (select 1 from app.pharmacy_prescriptions where patient_person_id = v_person)
           or exists (select 1 from app.pharmacy_deliveries where patient_person_id = v_person);
  select array_agg(auth_user_id) into v_auth from app.user_accounts where person_id = v_person;

  update app.church_user_access set status = 'revoked', ended_at = coalesce(ended_at, now())
   where user_account_id in (select id from app.user_accounts where person_id = v_person) and status <> 'revoked';
  update app.user_accounts set status = 'revoked', revoked_at = coalesce(revoked_at, now()), updated_by = v_me where person_id = v_person and status <> 'revoked';
  get diagnostics v_n_acc = row_count;

  if v_health then
    if p_health_mode = 'block' then
      perform app.raise_domain_error('ANONYMIZATION_BLOCKED_HEALTH_RETENTION', 'Pessoa com prontuario ou receita: guarda legal impede anonimizar. Use o modo restringir.');
    end if;
    update app.people set status = 'restricted', deactivated_at = coalesce(deactivated_at, now()), updated_by = v_me where id = v_person;
    update app.data_subject_requests set status = 'completed', completed_at = now(), response_reference = 'restricted_health_retention', updated_by = v_me where id = d.id;
    perform private.v39_dsr_move(d.id, 'approved', 'completed', 'restricted_health_retention', v_me, null, jsonb_build_object('contas', v_n_acc));
    insert into audit.events (church_id, actor_user_account_id, action, entity_schema, entity_name, entity_id, event_category, sensitivity, outcome, source, metadata)
    values (p_church_id, v_me, 'person_restricted_health_retention', 'app', 'people', v_person::text, 'privacy', 'health', 'partial', 'rpc', jsonb_build_object('request_id', d.id));
    return jsonb_build_object('ok', true, 'resultado', 'restringido', 'pessoa', jsonb_build_object('id', v_person), 'authUsersParaDesativar', to_jsonb(coalesce(v_auth, '{}')));
  end if;

  select person_code into v_code from app.people where id = v_person;
  v_name := 'Pessoa anonimizada ' || coalesce(nullif(v_code, ''), left(v_person::text, 8));
  update app.church_people set status = 'closed', ended_at = coalesce(ended_at, now()) where person_id = v_person and church_id = p_church_id and ended_at is null;
  update app.files set status = 'archived', archived_at = now()
   where id = (select photo_file_id from app.people where id = v_person) and status in ('pending','active','quarantined','failed');
  update app.people set full_name = v_name, preferred_name = null, birth_date = null, sex = null, cpf = null, notes = null,
         photo_file_id = null, status = 'restricted', deactivated_at = coalesce(deactivated_at, now()),
         anonymized_at = now(), anonymized_by_user_account_id = v_me, updated_by = v_me
   where id = v_person;
  update app.person_contacts set contact_value = 'anonimizado', normalized_value = null, is_primary = false, is_verified = false,
         contact_allowed = false, valid_until = greatest(coalesce(valid_from, now()), now())
   where person_id = v_person;
  get diagnostics v_n_contacts = row_count;
  update app.person_addresses set postal_code = null, street = null, street_number = null, complement = null, district = null,
         latitude = null, longitude = null, geocoding_source = null, valid_until = greatest(coalesce(valid_from, now()), now())
   where person_id = v_person;
  get diagnostics v_n_addr = row_count;
  update app.access_requests set email = 'anon-' || left(id::text, 8) || '@anonimizado.invalid', request_notes = null where person_id = v_person;
  update app.user_accounts set username = 'anon-' || left(id::text, 8) where person_id = v_person;
  update app.data_subject_requests set status = 'completed', completed_at = now(), response_reference = 'anonymized', updated_by = v_me where id = d.id;
  perform private.v39_dsr_move(d.id, 'approved', 'completed', 'anonymized', v_me, null,
          jsonb_build_object('contatos', v_n_contacts, 'enderecos', v_n_addr, 'contas', v_n_acc));
  -- sem old_data: guardar o valor antigo desfaria a anonimizacao
  insert into audit.events (church_id, actor_user_account_id, action, entity_schema, entity_name, entity_id, event_category, sensitivity, outcome, source, metadata)
  values (p_church_id, v_me, 'person_anonymized', 'app', 'people', v_person::text, 'privacy', 'personal', 'success', 'rpc',
          jsonb_build_object('request_id', d.id, 'contatos', v_n_contacts, 'enderecos', v_n_addr, 'contas', v_n_acc));
  return jsonb_build_object('ok', true, 'resultado', 'anonimizado',
    'pessoa', jsonb_build_object('id', v_person, 'nome', v_name, 'anonimizada', true),
    'authUsersParaDesativar', to_jsonb(coalesce(v_auth, '{}')));
end $f$;

revoke all on function private.v39_lgpd_me(uuid), private.v39_lgpd_need(uuid,text), private.v39_dsr_move(uuid,text,text,text,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function app.v39_privacy_request_create(uuid,uuid,text,text), app.v39_privacy_requests_list(uuid,text),
  app.v39_privacy_request_decide(uuid,uuid,text,text), app.v39_privacy_anonymize_execute(uuid,uuid,text,text) from public, anon;
grant execute on function app.v39_privacy_request_create(uuid,uuid,text,text), app.v39_privacy_requests_list(uuid,text),
  app.v39_privacy_request_decide(uuid,uuid,text,text), app.v39_privacy_anonymize_execute(uuid,uuid,text,text) to authenticated;

commit;

-- ---------------------------------------------------------------------
-- VERIFICACAO (rodar depois do commit; tudo deve ser true)
-- ---------------------------------------------------------------------
select
  (select count(*) = 2 from information_schema.columns where table_schema = 'app' and table_name = 'people'
     and column_name in ('anonymized_at', 'anonymized_by_user_account_id')) as colunas_ok,
  (select count(*) = 4 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app'
     and p.proname in ('v39_privacy_request_create','v39_privacy_requests_list','v39_privacy_request_decide','v39_privacy_anonymize_execute') and p.prosecdef) as funcoes_ok,
  not has_function_privilege('anon', 'app.v39_privacy_anonymize_execute(uuid,uuid,text,text)', 'EXECUTE') as anon_sem_execute,
  has_function_privilege('authenticated', 'app.v39_privacy_anonymize_execute(uuid,uuid,text,text)', 'EXECUTE') as authenticated_ok,
  not has_function_privilege('authenticated', 'private.v39_dsr_move(uuid,text,text,text,uuid,text,jsonb)', 'EXECUTE') as helper_fechado;
