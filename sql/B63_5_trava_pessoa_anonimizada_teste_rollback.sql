-- =====================================================================
-- B63_5 · LGPD · Trava de pessoa anonimizada/restringida · teste com rollback
-- Build 63 · QA63-01 (e QA63-05/06 do B63_2) · 22/11/2026
-- ULTIMA EXECUCAO (22/11/2026, conector Supabase da conta, pelo Claude; versao com QA63R2-01 / T32):
--   ERROR P0001: TESTE B63_5 CONCLUIDO (nada foi gravado): T1 ok; ... T18 ok; T20 ok; T21 ok; T22 ok; T23 ok;
--   T24 ok; T25 ok; T26 ok; T27 ok; T28 ok; T30 ok; T31 ok; T32 ok; T29 ok; T19 ok; REVERTER ok.
--   Catalogo conferido depois: colunas anonymized_*, funcoes v39_privacy/lgpd/dsr, gatilhos trg_v39_lgpd*,
--   igrejas "Igreja Teste B63%" e auth.users de teste = 0; md5 de v39_list_people, search_people,
--   v39_person_legacy_base e da policy v39_people_select_accessible_church iguais aos originais.
-- ---------------------------------------------------------------------
-- 22/11/2026 (QA63R-01/02): + filtro da restringida em app.v39_list_people e na policy RLS
--   v39_people_select_accessible_church e em app.search_people; casos T20-T25 (rodam antes do T19) e R3-R8
--   no REVERTER.
--   D4: + app.v39_privacy_restricted_list / app.v39_privacy_restriction_lift e gatilho com a marca app.lgpd_lift;
--   T9e (status anterior guardado), T26-T31 (antes do T19) e R9.
-- Um bloco so: estrutura do B63_2 (com a pre-checagem nova) + estrutura do B63_5 + fixtures
--   ficticias do teste do B63_2, casos T1-T13 do B63_2 e T14-T19 do B63_5, e o REVERTER do B63_5.
--   Os gatilhos do B63_5 so acrescentam recusas: T1-T13 passando aqui valem tambem para o
--   teste isolado do B63_2.
-- NAO GRAVA NADA: tudo e desfeito pelo raise final.
-- =====================================================================
do $t$
declare
  v_ch1 uuid := gen_random_uuid();  v_ch2 uuid := gen_random_uuid();
  v_au_m uuid := gen_random_uuid(); v_au_d uuid := gen_random_uuid(); v_au_x uuid := gen_random_uuid(); v_au_t uuid := gen_random_uuid();
  v_p_m uuid; v_p_d uuid; v_p_x uuid; v_p_t uuid; v_p_h uuid;
  v_ua_m uuid; v_ua_d uuid; v_ua_x uuid; v_ua_t uuid;
  v_cua uuid; v_master uuid; v_disc uuid; v_repo uuid; v_file uuid; v_acc uuid; v_cat uuid; v_mov uuid; v_ws uuid;
  v_prof uuid; v_ag uuid; v_ap uuid; v_req uuid; v_req_h uuid; v_req_r uuid;
  r jsonb; v_n int; v_amt numeric; v_res text := ''; pe record; v_cpf text; v_s int; v_md5 text;
  v_md5_lp text; v_qual text; v_md5_sp text;
begin
  -- -------------------------------------------------------------------
  -- 1. ESTRUTURA PROPOSTA
  -- -------------------------------------------------------------------
  alter table app.people add column anonymized_at timestamptz;
  alter table app.people add column anonymized_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict;

  create function private.v39_lgpd_me(p_church_id uuid) returns uuid
  language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
  declare v_me uuid := private.v39_fin_me();
  begin
    if v_me is null or p_church_id is null or app.current_church_user_access_id(p_church_id) is null then
      perform app.raise_domain_error('ACCESS_DENIED', 'Sem acesso ativo a esta igreja');
    end if;
    return v_me;
  end $f$;
  create function private.v39_lgpd_need(p_church_id uuid, p_code text) returns uuid
  language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
  declare v_me uuid := private.v39_lgpd_me(p_church_id);
  begin
    if not app.has_permission(p_code, p_church_id) then
      perform app.raise_domain_error('PERMISSION_DENIED', 'Sem permissao: ' || p_code);
    end if;
    return v_me;
  end $f$;

  -- registra mudanca de situacao do pedido (historico imutavel ja existente)
  create function private.v39_dsr_move(p_req uuid, p_old text, p_new text, p_action text, p_actor uuid, p_reason text, p_meta jsonb) returns void
  language sql security definer set search_path = pg_catalog, app, private as $f$
    insert into app.data_subject_request_history (request_id, previous_status, new_status, action, performed_by_user_account_id, reason, metadata)
    values (p_req, p_old, p_new, p_action, p_actor, p_reason, coalesce(p_meta, '{}'::jsonb))
  $f$;

  -- QA63-05/06: guardas da anonimizacao num lugar so; usada na APROVACAO (pedido nao fica aprovado
  --   sem poder executar) e na EXECUCAO. Outra igreja = vinculo (church_people) aberto OU acesso
  --   (church_user_access) nao encerrado de qualquer conta da pessoa: a execucao revoga todas as contas.
  create function private.v39_dsr_anon_precheck(p_church_id uuid, p_person uuid, p_me uuid) returns void
  language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
  begin
    if exists (select 1 from app.user_accounts where id = p_me and person_id = p_person) then
      perform app.raise_domain_error('ANONYMIZATION_SELF_DENIED', 'Nao e possivel anonimizar o proprio cadastro');
    end if;
    if exists (select 1 from app.church_people where person_id = p_person and church_id <> p_church_id and ended_at is null)
       or exists (select 1 from app.church_user_access a join app.user_accounts u on u.id = a.user_account_id
                   where u.person_id = p_person and a.church_id <> p_church_id and a.status in ('active','pending','suspended')) then
      perform app.raise_domain_error('ANONYMIZATION_MULTI_CHURCH', 'Pessoa ligada a outra igreja: decisao conjunta necessaria');
    end if;
  end $f$;

  -- (a) pedido do titular (registrado por quem atende a pessoa)
  create function app.v39_privacy_request_create(p_church_id uuid, p_person_id uuid, p_type text, p_reason text) returns jsonb
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

  -- (b) fila de pedidos
  create function app.v39_privacy_requests_list(p_church_id uuid, p_status text default null) returns jsonb
  language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
  begin
    perform private.v39_lgpd_need(p_church_id, 'privacy.requests.manage');
    return coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'pessoaId', d.person_id, 'pessoa', pe.full_name, 'tipo', d.request_type,
              'status', d.status, 'motivo', d.description, 'recebidoEm', d.received_at, 'decididoEm', d.decision_at,
              'decisao', d.decision_reason, 'concluidoEm', d.completed_at, 'resultado', d.response_reference) order by d.received_at desc)
      from app.data_subject_requests d join app.people pe on pe.id = d.person_id
     where d.church_id = p_church_id and (p_status is null or d.status = p_status)), '[]'::jsonb);
  end $f$;

  -- (c) decisao
  create function app.v39_privacy_request_decide(p_church_id uuid, p_request_id uuid, p_decision text, p_reason text) returns jsonb
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
    if d.request_type = 'anonymization' and p_decision = 'approved' then perform private.v39_dsr_anon_precheck(p_church_id, d.person_id, v_me); end if;
    update app.data_subject_requests set status = p_decision, decision_at = now(), decision_reason = left(btrim(p_reason), 500),
           assigned_to_user_account_id = v_me, identity_validated_at = coalesce(identity_validated_at, now()), updated_by = v_me
     where id = d.id;
    perform private.v39_dsr_move(d.id, d.status, p_decision, 'decided', v_me, left(btrim(p_reason), 500), null);
    insert into audit.events (church_id, actor_user_account_id, action, entity_schema, entity_name, entity_id, event_category, sensitivity, outcome, source, metadata)
    values (p_church_id, v_me, 'data_subject_request_' || p_decision, 'app', 'data_subject_requests', d.id::text, 'approval', 'personal', 'success', 'rpc', jsonb_build_object('type', d.request_type));
    return jsonb_build_object('ok', true, 'status', p_decision);
  end $f$;

  -- (d) execucao da anonimizacao (irreversivel)
  create function app.v39_privacy_anonymize_execute(p_church_id uuid, p_request_id uuid, p_confirm text, p_health_mode text default 'block') returns jsonb
  language plpgsql security definer set search_path = pg_catalog, app, private as $f$
  declare
    v_me uuid := private.v39_lgpd_need(p_church_id, 'privacy.requests.manage');
    d app.data_subject_requests; v_person uuid; v_code text; v_health boolean; v_name text; v_auth uuid[];
    v_n_contacts int := 0; v_n_addr int := 0; v_n_acc int := 0; v_prev_status text; v_prev_deact timestamptz;
  begin
    select * into d from app.data_subject_requests where id = p_request_id and church_id = p_church_id for update;
    if d.id is null then perform app.raise_domain_error('REQUEST_NOT_FOUND', 'Pedido nao encontrado'); end if;
    if d.request_type <> 'anonymization' or d.status <> 'approved' then
      perform app.raise_domain_error('ANONYMIZATION_NOT_APPROVED', 'O pedido precisa estar aprovado');
    end if;
    if p_confirm is distinct from 'ANONIMIZAR' then perform app.raise_domain_error('CONFIRMATION_REQUIRED', 'Digite ANONIMIZAR para confirmar'); end if;
    if p_health_mode not in ('block','restrict') then perform app.raise_domain_error('HEALTH_MODE_INVALID', 'Modo invalido'); end if;
    v_person := d.person_id;
    perform private.v39_dsr_anon_precheck(p_church_id, v_person, v_me);
    v_health := exists (select 1 from app.v39_inst_records where patient_person_id = v_person)
             or exists (select 1 from app.institute_clinical_records where patient_person_id = v_person)
             or exists (select 1 from app.institute_health_records where person_id = v_person)
             or exists (select 1 from app.pharmacy_prescriptions where patient_person_id = v_person)
             or exists (select 1 from app.pharmacy_deliveries where patient_person_id = v_person);
    select array_agg(auth_user_id) into v_auth from app.user_accounts where person_id = v_person;

    -- contas e acessos sempre encerrados
    update app.church_user_access set status = 'revoked', ended_at = coalesce(ended_at, now())
     where user_account_id in (select id from app.user_accounts where person_id = v_person) and status <> 'revoked';
    update app.user_accounts set status = 'revoked', revoked_at = coalesce(revoked_at, now()), updated_by = v_me where person_id = v_person and status <> 'revoked';
    get diagnostics v_n_acc = row_count;

    if v_health then
      if p_health_mode = 'block' then
        perform app.raise_domain_error('ANONYMIZATION_BLOCKED_HEALTH_RETENTION', 'Pessoa com prontuario ou receita: guarda legal impede anonimizar. Use o modo restringir.');
      end if;
      -- D4 (B63_5): guarda status anterior no historico imutavel do pedido, para desfazer restricao feita por engano
      select status, deactivated_at into v_prev_status, v_prev_deact from app.people where id = v_person;
      update app.people set status = 'restricted', deactivated_at = coalesce(deactivated_at, now()), updated_by = v_me where id = v_person;
      update app.data_subject_requests set status = 'completed', completed_at = now(), response_reference = 'restricted_health_retention', updated_by = v_me where id = d.id;
      perform private.v39_dsr_move(d.id, 'approved', 'completed', 'restricted_health_retention', v_me, null, jsonb_build_object('contas', v_n_acc, 'statusAnterior', v_prev_status, 'desativadoEmAnterior', v_prev_deact));
      insert into audit.events (church_id, actor_user_account_id, action, entity_schema, entity_name, entity_id, event_category, sensitivity, outcome, source, metadata)
      values (p_church_id, v_me, 'person_restricted_health_retention', 'app', 'people', v_person::text, 'privacy', 'health', 'partial', 'rpc', jsonb_build_object('request_id', d.id, 'statusAnterior', v_prev_status));
      return jsonb_build_object('ok', true, 'resultado', 'restringido', 'pessoa', jsonb_build_object('id', v_person), 'authUsersParaDesativar', to_jsonb(coalesce(v_auth, '{}')));
    end if;

    select person_code into v_code from app.people where id = v_person;
    v_name := 'Pessoa anonimizada ' || coalesce(nullif(v_code, ''), left(v_person::text, 8));
    -- membro exige CPF: encerra o vinculo antes de apagar o CPF (vinculos ficam, com fim)
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

  revoke all on function private.v39_lgpd_me(uuid), private.v39_lgpd_need(uuid,text), private.v39_dsr_move(uuid,text,text,text,uuid,text,jsonb), private.v39_dsr_anon_precheck(uuid,uuid,uuid) from public, anon, authenticated;
  revoke all on function app.v39_privacy_request_create(uuid,uuid,text,text), app.v39_privacy_requests_list(uuid,text),
    app.v39_privacy_request_decide(uuid,uuid,text,text), app.v39_privacy_anonymize_execute(uuid,uuid,text,text) from public, anon;
  grant execute on function app.v39_privacy_request_create(uuid,uuid,text,text), app.v39_privacy_requests_list(uuid,text),
    app.v39_privacy_request_decide(uuid,uuid,text,text), app.v39_privacy_anonymize_execute(uuid,uuid,text,text) to authenticated;

  -- -------------------------------------------------------------------
  -- 1b. ESTRUTURA B63_5 (identica ao _aplicar, sem begin/commit)
  -- -------------------------------------------------------------------
  if md5(pg_get_functiondef('app.v39_person_legacy_base(uuid,uuid)'::regprocedure)) <> 'bb32b6486a2223e0a3b4417a412cef9f' then
    raise exception 'FALHOU G0: v39_person_legacy_base mudou (md5)';
  end if;
  v_md5 := md5(regexp_replace(pg_get_functiondef('app.v39_person_legacy_base(uuid,uuid)'::regprocedure), '\s+', ' ', 'g'));
  create or replace function private.v39_lgpd_guard_people() returns trigger
  language plpgsql security definer set search_path = pg_catalog, app, private as $f$
  begin
    if old.anonymized_at is null and old.status <> 'restricted' then return new; end if;
    if old.anonymized_at is null and new.anonymized_at is not null then return new; end if;   -- restringida -> anonimizada (B63_2)
    -- B63_5 (D4): restringida -> status anterior SOMENTE pela RPC app.v39_privacy_restriction_lift, que grava
    --   a marca app.lgpd_lift = person_id:txid (local a transacao) logo antes do UPDATE e limpa logo depois.
    --   So status e deactivated_at mudam; qualquer outro campo (ou sem a marca) continua recusado.
    if old.anonymized_at is null and old.status = 'restricted' and new.anonymized_at is null
       and new.status in ('active','inactive','deceased')
       and coalesce(current_setting('app.lgpd_lift', true), '') = old.id::text || ':' || txid_current()::text
       and (new.full_name, new.preferred_name, new.birth_date, new.sex, new.cpf, new.notes, new.photo_file_id, new.merged_into_person_id)
           is not distinct from
           (old.full_name, old.preferred_name, old.birth_date, old.sex, old.cpf, old.notes, old.photo_file_id, old.merged_into_person_id) then
      return new;
    end if;
    if (new.full_name, new.preferred_name, new.birth_date, new.sex, new.cpf, new.notes, new.photo_file_id,
        new.status, new.merged_into_person_id, new.anonymized_at)
       is distinct from
       (old.full_name, old.preferred_name, old.birth_date, old.sex, old.cpf, old.notes, old.photo_file_id,
        old.status, old.merged_into_person_id, old.anonymized_at) then
      if old.anonymized_at is not null then
        perform app.raise_domain_error('PERSON_ANONYMIZED', 'Pessoa anonimizada (LGPD): o cadastro nao pode ser alterado');
      end if;
      perform app.raise_domain_error('PERSON_RESTRICTED', 'Pessoa com tratamento restrito (LGPD): o cadastro nao pode ser alterado');
    end if;
    return new;
  end $f$;

  create or replace function private.v39_lgpd_guard_person_child() returns trigger
  language plpgsql security definer set search_path = pg_catalog, app, private as $f$
  declare v_code text;
  begin
    if tg_op = 'UPDATE' and new.valid_until is not null then return new; end if;   -- encerrar/mascarar sempre pode
    select case when p.anonymized_at is not null then 'PERSON_ANONYMIZED' when p.status = 'restricted' then 'PERSON_RESTRICTED' end
      into v_code from app.people p where p.id = new.person_id;
    if v_code is not null then
      perform app.raise_domain_error(v_code, 'Pessoa com dados bloqueados (LGPD): contato ou endereco nao pode ser incluido nem reaberto');
    end if;
    return new;
  end $f$;

  create or replace function private.v39_lgpd_guard_church_people() returns trigger
  language plpgsql security definer set search_path = pg_catalog, app, private as $f$
  begin
    if new.status = 'closed' and new.ended_at is not null then return new; end if;
    if exists (select 1 from app.people p where p.id = new.person_id and p.anonymized_at is not null) then
      perform app.raise_domain_error('PERSON_ANONYMIZED', 'Pessoa anonimizada (LGPD): o vinculo com a igreja nao pode ser criado nem reaberto');
    end if;
    return new;
  end $f$;

  revoke all on function private.v39_lgpd_guard_people(), private.v39_lgpd_guard_person_child(), private.v39_lgpd_guard_church_people()
    from public, anon, authenticated;

  drop trigger if exists trg_v39_lgpd_guard_people on app.people;
  create trigger trg_v39_lgpd_guard_people before update on app.people
    for each row execute function private.v39_lgpd_guard_people();
  drop trigger if exists trg_v39_lgpd_guard_contacts on app.person_contacts;
  create trigger trg_v39_lgpd_guard_contacts before insert or update on app.person_contacts
    for each row execute function private.v39_lgpd_guard_person_child();
  drop trigger if exists trg_v39_lgpd_guard_addresses on app.person_addresses;
  create trigger trg_v39_lgpd_guard_addresses before insert or update on app.person_addresses
    for each row execute function private.v39_lgpd_guard_person_child();
  drop trigger if exists trg_v39_lgpd_guard_church_people on app.church_people;
  create trigger trg_v39_lgpd_guard_church_people before insert or update on app.church_people
    for each row execute function private.v39_lgpd_guard_church_people();

  -- igual ao original (md5 bb32b648...), mais 'anonimizadoEm' e 'restritoLgpd' no fim do objeto
  create or replace function app.v39_person_legacy_base(p_church_id uuid, p_person_id uuid)
   returns jsonb
   language sql
   stable security definer
   set search_path to 'pg_catalog', 'app', 'private'
  as $function$
    select jsonb_build_object(
      'id', p.id, 'codigo', coalesce(p.person_code::text, ''),
      'nome', p.full_name, 'apelido', coalesce(p.preferred_name, ''),
      'nasc', coalesce(p.birth_date::text, ''), 'sexo', app.v39_sexo_legado(p.sex), 'obs', coalesce(p.notes, ''),
      'tipo',   case cp.status when 'visiting' then 'Visitante' when 'institute' then 'Instituto' else 'Membro' end,
      'status', case cp.status when 'visiting' then 'Em visita' when 'institute' then 'Instituto' when 'inactive' then 'Inativo'
                               when 'closed' then 'Inativo' when 'transferred' then 'Inativo' else 'Ativo' end,
      'aceitaVisita',    case cp.accepts_home_visit   when true then 'Sim' when false then 'Não' else '' end,
      'frequentaIgreja', case cp.attends_other_church when true then 'Sim' when false then 'Não' else '' end,
      'igrejaQual', coalesce(cp.attends_church_text, ''), 'canal', coalesce(cp.source, ''), 'canalOutro', coalesce(cp.source_other, ''),
      'gcId', coalesce((select m.growth_group_id::text from app.growth_group_memberships m
                         where m.person_id = p.id and m.role_type = 'participant' and m.ended_at is null
                           and m.status in ('active','pending','inactive')
                         order by m.updated_at desc limit 1), ''),
      'fone', coalesce((select c.contact_value from app.person_contacts c
                         where c.person_id = p.id and c.contact_type in ('whatsapp','phone') and c.valid_until is null
                         order by c.is_primary desc, c.created_at desc limit 1), ''),
      'cep', coalesce(a.postal_code, ''), 'endereco', coalesce(a.street, ''), 'numero', coalesce(a.street_number, ''),
      'complemento', coalesce(a.complement, ''), 'bairro', coalesce(a.district, ''), 'cidade', coalesce(a.city, ''),
      'criadoPor', coalesce(to_jsonb(cp)->>'created_by', to_jsonb(cp)->>'created_by_user_account_id',
                            to_jsonb(p)->>'created_by_user_account_id', to_jsonb(p)->>'created_by', ''),
      'criadoEm', coalesce(cp.created_at, p.created_at),
      'jornada', coalesce(cp.journey_stage, case when cp.status = 'institute' then 'Instituto' else '' end),
      'deleted', cp.status = 'closed', 'updatedAt', greatest(p.updated_at, cp.updated_at), '_supabase', true)
      || jsonb_build_object('anonimizadoEm', p.anonymized_at, 'restritoLgpd', p.status = 'restricted' and p.anonymized_at is null)
    from app.people p
    join app.church_people cp on cp.person_id = p.id and cp.church_id = p_church_id
    left join lateral (select * from app.person_addresses x
                        where x.person_id = p.id and x.valid_until is null
                        order by x.is_primary desc, x.created_at desc limit 1) a on true
    where p.id = p_person_id
    order by (cp.ended_at is null) desc, cp.started_at desc nulls last
    limit 1;
  $function$;

  if md5(pg_get_functiondef('app.v39_list_people(uuid)'::regprocedure)) <> '20e5487d1c530b527e9a334b1f899dc9' then
    raise exception 'FALHOU G1: v39_list_people mudou (md5)';
  end if;
  select md5(qual) into v_qual from pg_policies where schemaname = 'app' and tablename = 'people'
    and policyname = 'v39_people_select_accessible_church' and cmd = 'SELECT';
  if v_qual is distinct from '62eeb0de18914860aa1ffbe07ea645fd' then
    raise exception 'FALHOU G2: policy v39_people_select_accessible_church mudou (md5)';
  end if;
  v_md5_lp := md5(regexp_replace(pg_get_functiondef('app.v39_list_people(uuid)'::regprocedure), '\s+', ' ', 'g'));

  -- B63_5 (QA63R-01): igual ao original (md5 20e5487d...), mais o filtro da pessoa restringida (LGPD)
  create or replace function app.v39_list_people(p_church_id uuid)
   returns jsonb
   language plpgsql
   stable security definer
   set search_path to 'pg_catalog', 'app', 'private'
  as $function$
  declare v_map jsonb := '{}'::jsonb; v_l jsonb;
  begin
    if app.current_user_account_id() is null
       or not private.has_active_profile_in_church(p_church_id, array['master','pastor','supervisor','leader','disciple']) then
      perform app.raise_domain_error('PERMISSION_DENIED','Sem permissao');
    end if;
    -- INST-4: auxílios do Instituto por pessoa (código). Sem acesso ao Instituto: lista vazia, sem erro.
    begin
      v_l := app.v39_inst_people(p_church_id => p_church_id, p_filtro => 'todos');
      select coalesce(jsonb_object_agg(k, a), '{}'::jsonb) into v_map from (
        select distinct on (ltrim(x->>'codigo', '0')) ltrim(x->>'codigo', '0') k, coalesce(x->'atividades', '[]'::jsonb) a
          from jsonb_array_elements(coalesce(v_l->'pessoas', '[]'::jsonb)) x
         where coalesce(x->>'codigo', '') <> '') t;
    exception when others then v_map := '{}'::jsonb;
    end;
    -- B63_5 (QA63R-01): pessoa restringida ou anonimizada (people.status 'restricted') fica fora da lista
    --   geral de TODOS os perfis. Prontuario/receitas seguem pelas RPCs do Instituto/Farmacia (guarda legal).
    return coalesce((select jsonb_agg(l || jsonb_build_object('instAtividades', coalesce(v_map->ltrim(l->>'codigo', '0'), '[]'::jsonb)))
                       from (select app.v39_person_legacy(p_church_id, cp.person_id) l
                               from app.church_people cp
                              where cp.church_id = p_church_id and cp.status <> 'closed'
                                and not exists (select 1 from app.people rp where rp.id = cp.person_id and rp.status = 'restricted')) s), '[]'::jsonb);
  end;
  $function$;

  -- B63_5 (QA63R-01): leitura direta de app.people (PostgREST) tambem nao devolve a restringida.
  --   Mesma condicao original (md5 do qual 62eeb0de...), mais people.status <> 'restricted'.
  --   A policy v39_people_select_own_person (o proprio titular) NAO muda.
  drop policy if exists v39_people_select_accessible_church on app.people;
  create policy v39_people_select_accessible_church on app.people as permissive for select to authenticated
    using (people.status <> 'restricted'
           and exists (select 1
                         from app.church_people cp
                         join app.church_user_access cua on cua.church_id = cp.church_id
                         join app.user_accounts ua on ua.id = cua.user_account_id
                        where cp.person_id = people.id and cp.ended_at is null and cua.status = 'active'
                          and ua.status = 'active' and ua.auth_user_id = auth.uid()));

  if md5(pg_get_functiondef('app.search_people(uuid,text,integer)'::regprocedure)) <> 'ab3fe6f3dc1ef81031123ac20271d262' then
    raise exception 'FALHOU G3: search_people mudou (md5)';
  end if;
  v_md5_sp := md5(regexp_replace(pg_get_functiondef('app.search_people(uuid,text,integer)'::regprocedure), '\s+', ' ', 'g'));

  -- B63_5 (QA63R-01, escopo aprovado 22/11): app.search_people igual ao original (md5 ab3fe6f3...), mas a pessoa
  --   restringida/anonimizada (people.status 'restricted') sai do retorno para TODOS (antes: so quem tinha
  --   people.view_restricted, master/pastor, via has_permission). Usada pelo Financeiro (seletor de pessoa e telefone
  --   de lembrete) e por Treinamentos (WhatsApp de lembrete). Pessoa normal: mesmo comportamento.
  create or replace function app.search_people(p_church_id uuid, p_query text default null::text, p_limit integer default 30)
   returns table(person_id uuid, full_name text, preferred_name text, status text, church_status text, primary_email text, primary_whatsapp text)
   language plpgsql
   security definer
   set search_path to 'pg_catalog', 'app'
  as $function$
  begin
    if not app.has_permission('people.view', p_church_id, 'church', p_church_id) then
      perform app.raise_domain_error('PERMISSION_DENIED', 'Permissao people.view obrigatoria');
    end if;
    return query
    select p.id, p.full_name, p.preferred_name, p.status, cp.status,
           (select pc.contact_value from app.person_contacts pc where pc.person_id = p.id and pc.contact_type = 'email' and pc.valid_until is null order by pc.is_primary desc, pc.created_at limit 1),
           (select pc.contact_value from app.person_contacts pc where pc.person_id = p.id and pc.contact_type = 'whatsapp' and pc.valid_until is null order by pc.is_primary desc, pc.created_at limit 1)
      from app.people p join app.church_people cp on cp.person_id = p.id and cp.church_id = p_church_id
     where cp.ended_at is null and p.status <> 'merged'
       and p.status <> 'restricted'
       and (p_query is null or p.full_name ilike '%' || trim(p_query) || '%' or p.preferred_name ilike '%' || trim(p_query) || '%')
     order by p.full_name limit greatest(1, least(coalesce(p_limit, 30), 100));
  end;
  $function$;

  -- B63_5 (D4): pessoas restringidas da igreja, para desfazer restricao feita por engano. Somente leitura.
  --   Status anterior e pedido vem do historico imutavel do pedido (metadata gravada pelo modo restrict do B63_2).
  create or replace function app.v39_privacy_restricted_list(p_church_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
  begin
    perform private.v39_lgpd_need(p_church_id, 'privacy.manage');
    return coalesce((
      select jsonb_agg(jsonb_build_object('pessoaId', p.id, 'nome', p.full_name, 'restritoEm', coalesce(h.occurred_at, p.deactivated_at),
                       'pedidoId', h.request_id, 'statusAnterior', h.metadata->>'statusAnterior', 'motivo', h.description)
                       order by coalesce(h.occurred_at, p.deactivated_at) desc nulls last, p.full_name)
        from app.people p
        left join lateral (select x.request_id, x.occurred_at, x.metadata, d.description
                             from app.data_subject_request_history x
                             join app.data_subject_requests d on d.id = x.request_id
                            where d.church_id = p_church_id and d.person_id = p.id and d.request_type = 'anonymization'
                              and d.response_reference = 'restricted_health_retention' and x.action = 'restricted_health_retention'
                            order by x.occurred_at desc, x.id desc limit 1) h on true
       where p.status = 'restricted' and p.anonymized_at is null
         and exists (select 1 from app.church_people cp where cp.church_id = p_church_id and cp.person_id = p.id and cp.ended_at is null)
    ), '[]'::jsonb);
  end $f$;

  -- B63_5 (D4): desfaz a restricao (modo restrict do B63_2) feita por engano. Volta people.status ao status
  --   anterior guardado no historico do pedido (sem registro: active, marcado no audit). NAO reativa contas
  --   nem acessos revogados e NAO toca em prontuario/receitas. O pedido continua completed e passa a
  --   response_reference restriction_lifted (com linha no historico), para nao ser usado de novo.
  create or replace function app.v39_privacy_restriction_lift(p_church_id uuid, p_person_id uuid, p_reason text) returns jsonb
  language plpgsql security definer set search_path = pg_catalog, app, private as $f$
  declare
    v_me uuid := private.v39_lgpd_need(p_church_id, 'privacy.manage');
    v_reason text := btrim(coalesce(p_reason, ''));
    pe app.people; v_req uuid; v_prev text; v_prev_deact_txt text; v_prev_deact timestamptz; v_sem boolean := false; q record;
  begin
    if length(v_reason) < 10 then
      perform app.raise_domain_error('RESTRICTION_LIFT_REASON_REQUIRED', 'Informe o motivo para desfazer a restricao (minimo 10 caracteres)');
    end if;
    if not exists (select 1 from app.church_people where church_id = p_church_id and person_id = p_person_id) then
      perform app.raise_domain_error('PERSON_NOT_IN_CHURCH', 'Pessoa nao pertence a esta igreja');
    end if;
    select * into pe from app.people where id = p_person_id for update;
    if pe.id is null or pe.status <> 'restricted' or pe.anonymized_at is not null then
      perform app.raise_domain_error('PERSON_NOT_RESTRICTED', 'Pessoa nao esta restringida (ou ja foi anonimizada)');
    end if;
    select x.request_id into v_req
      from app.data_subject_request_history x join app.data_subject_requests d on d.id = x.request_id
     where d.church_id = p_church_id and d.person_id = p_person_id and d.request_type = 'anonymization'
       and d.response_reference = 'restricted_health_retention' and x.action = 'restricted_health_retention'
     order by x.occurred_at desc, x.id desc limit 1;
    -- QA63R2-01: so desfaz quem restringiu: exige pedido de restricao DESTA igreja e vinculo aberto nela
    if v_req is null or not exists (select 1 from app.church_people where church_id = p_church_id and person_id = p_person_id and ended_at is null) then
      perform app.raise_domain_error('RESTRICTION_NOT_FOUND', 'Nao ha restricao desta igreja para esta pessoa (exige pedido de restricao e vinculo aberto)');
    end if;
    select x.metadata->>'statusAnterior', x.metadata->>'desativadoEmAnterior' into v_prev, v_prev_deact_txt
      from app.data_subject_request_history x join app.data_subject_requests d on d.id = x.request_id
     where d.church_id = p_church_id and d.person_id = p_person_id and d.request_type = 'anonymization'
       and d.response_reference = 'restricted_health_retention' and x.action = 'restricted_health_retention'
       and x.metadata->>'statusAnterior' in ('active','inactive','deceased')
     order by x.occurred_at desc, x.id desc limit 1;
    if v_prev is null then v_prev := 'active'; v_sem := true; end if;
    v_prev_deact := case when v_prev = 'active' then null
                         else coalesce(nullif(v_prev_deact_txt, '')::timestamptz, pe.deactivated_at) end;

    perform set_config('app.lgpd_lift', p_person_id::text || ':' || txid_current()::text, true);
    update app.people set status = v_prev, deactivated_at = v_prev_deact, updated_by = v_me where id = p_person_id;
    perform set_config('app.lgpd_lift', '', true);

    for q in select d.id from app.data_subject_requests d
              where d.church_id = p_church_id and d.person_id = p_person_id and d.request_type = 'anonymization'
                and d.response_reference = 'restricted_health_retention'
              for update loop
      update app.data_subject_requests set response_reference = 'restriction_lifted', updated_by = v_me where id = q.id;
      perform private.v39_dsr_move(q.id, 'completed', 'completed', 'restriction_lifted', v_me, left(v_reason, 500),
              jsonb_build_object('statusNovo', v_prev, 'semRegistroAnterior', v_sem));
    end loop;
    insert into audit.events (church_id, actor_user_account_id, action, entity_schema, entity_name, entity_id, event_category, sensitivity, outcome, source, metadata)
    values (p_church_id, v_me, 'person_restriction_lifted', 'app', 'people', p_person_id::text, 'privacy', 'personal', 'success', 'rpc',
            jsonb_build_object('motivo', left(v_reason, 500), 'statusAnterior', case when v_sem then null else v_prev end, 'statusNovo', v_prev,
                               'semRegistroAnterior', v_sem, 'pedidoId', v_req, 'contasReativadas', false));
    return jsonb_build_object('ok', true, 'pessoa', jsonb_build_object('id', p_person_id), 'statusNovo', v_prev);
  end $f$;

  revoke all on function app.v39_privacy_restricted_list(uuid), app.v39_privacy_restriction_lift(uuid,uuid,text) from public, anon;
  grant execute on function app.v39_privacy_restricted_list(uuid), app.v39_privacy_restriction_lift(uuid,uuid,text) to authenticated;


  -- -------------------------------------------------------------------
  -- 2. DADOS FICTICIOS
  -- -------------------------------------------------------------------
  select id into v_master from app.access_profiles where code = 'master' and is_active;
  select id into v_disc from app.access_profiles where code = 'disciple' and is_active;
  insert into app.churches (id, name, slug) values (v_ch1, 'Igreja Teste B63 A', 'teste-b63-a-' || left(v_ch1::text, 8)), (v_ch2, 'Igreja Teste B63 B', 'teste-b63-b-' || left(v_ch2::text, 8));
  insert into auth.users (id, email) values (v_au_m, 'b63m@teste.invalid'), (v_au_d, 'b63d@teste.invalid'), (v_au_x, 'b63x@teste.invalid'), (v_au_t, 'b63t@teste.invalid');
  insert into app.people (full_name) values ('Teste B63 Master') returning id into v_p_m;
  insert into app.people (full_name) values ('Teste B63 Discipulo') returning id into v_p_d;
  insert into app.people (full_name) values ('Teste B63 Outra Igreja') returning id into v_p_x;
  -- titular ficticio: membro com CPF de teste, contatos, endereco, foto, conta, dinheiro e presenca
  -- CPF ficticio valido, gerado aqui e inexistente na base (nao usa CPF real)
  loop
    v_cpf := lpad((floor(random() * 999999999))::bigint::text, 9, '0');
    v_s := 0; for i in 1..9 loop v_s := v_s + substr(v_cpf, i, 1)::int * (11 - i); end loop;
    v_cpf := v_cpf || case when v_s % 11 < 2 then 0 else 11 - v_s % 11 end;
    v_s := 0; for i in 1..10 loop v_s := v_s + substr(v_cpf, i, 1)::int * (12 - i); end loop;
    v_cpf := v_cpf || case when v_s % 11 < 2 then 0 else 11 - v_s % 11 end;
    exit when app.is_valid_cpf(v_cpf) and not exists (select 1 from app.people where cpf = v_cpf);
  end loop;
  insert into app.people (full_name, preferred_name, birth_date, sex, cpf, notes) values ('Titular Ficticio B63', 'Titular', date '1990-01-01', 'F', v_cpf, 'obs ficticia') returning id into v_p_t;
  insert into app.people (full_name) values ('Paciente Ficticio B63') returning id into v_p_h;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_m, v_p_m, 'active', now(), 'tb63m') returning id into v_ua_m;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_d, v_p_d, 'active', now(), 'tb63d') returning id into v_ua_d;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_x, v_p_x, 'active', now(), 'tb63x') returning id into v_ua_x;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_t, v_p_t, 'active', now(), 'tb63t') returning id into v_ua_t;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch1, v_ua_m, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_master, true, now() - interval '1 day');
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch1, v_ua_d, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_disc, true, now() - interval '1 day');
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch2, v_ua_x, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_master, true, now() - interval '1 day');
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch1, v_ua_t, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_disc, true, now() - interval '1 day');
  insert into app.church_people (church_id, person_id, status) values (v_ch1, v_p_t, 'member'), (v_ch1, v_p_h, 'institute'), (v_ch2, v_p_x, 'active');
  insert into app.person_contacts (person_id, contact_type, contact_value, normalized_value, is_primary) values (v_p_t, 'whatsapp', '(11) 90000-0000', '11900000000', true), (v_p_t, 'email', 'titular@teste.invalid', 'titular@teste.invalid', false);
  insert into app.person_addresses (person_id, postal_code, street, street_number, district, city, state_code, latitude, longitude, is_primary)
  values (v_p_t, '00000-000', 'Rua Ficticia', '10', 'Bairro Ficticio', 'Cidade Ficticia', 'SP', -23.5, -46.6, true);
  insert into app.file_repositories (code, name, church_id) values ('b63-' || left(v_ch1::text, 8), 'Repo teste B63', v_ch1) returning id into v_repo;
  insert into app.files (church_id, repository_id, file_category, current_file_name, original_file_name, storage_path, status, owner_person_id)
  values (v_ch1, v_repo, 'photo', 'foto.jpg', 'foto.jpg', 'teste/b63/foto.jpg', 'active', v_p_t) returning id into v_file;
  update app.people set photo_file_id = v_file where id = v_p_t;
  insert into app.access_requests (church_id, person_id, email, status, requested_username, request_notes, decided_at, decided_by_user_account_id, decision_reason, created_user_account_id, created_church_user_access_id)
  values (v_ch1, v_p_t, 'titular@teste.invalid', 'approved', 'tb63t', 'nota ficticia', now(), v_ua_m, 'ok', v_ua_t, v_cua);
  insert into app.financial_accounts (church_id, name, account_type) values (v_ch1, 'Conta teste B63', 'checking') returning id into v_acc;
  insert into app.financial_categories (church_id, code, name, nature) values (v_ch1, 'B63-REC', 'Receita teste B63', 'income') returning id into v_cat;
  insert into app.financial_movements (church_id, account_id, category_id, movement_type, amount, movement_date, person_id, description, source_module, idempotency_key, status, created_by_user_account_id, cash_effect, result_effect)
  values (v_ch1, v_acc, v_cat, 'income', 123.45, current_date, v_p_t, 'Dizimo ficticio B63', 'teste_b63', 'b63-' || gen_random_uuid(), 'posted', v_ua_m, 1, 1) returning id into v_mov;
  insert into app.worship_services (church_id, service_type, title, service_date) values (v_ch1, 'culto', 'Culto teste B63', current_date) returning id into v_ws;
  insert into app.worship_service_attendance (worship_service_id, person_id, attendance_status) values (v_ws, v_p_t, 'present');
  -- paciente com prontuario (envelope cifrado ficticio)
  insert into app.institute_professionals (church_id, name) values (v_ch1, 'Profissional ficticio') returning id into v_prof;
  insert into app.institute_agendas (church_id, agenda_type, title, professional_id) values (v_ch1, 'health', 'Agenda teste B63', v_prof) returning id into v_ag;
  insert into app.institute_appointments (church_id, agenda_id, appointment_date, start_time, patient_person_id) values (v_ch1, v_ag, current_date, '09:00', v_p_h) returning id into v_ap;
  insert into app.v39_inst_records (church_id, appointment_id, patient_person_id, professional_id, encrypted_payload, content_hash) values (v_ch1, v_ap, v_p_h, v_prof, 'ficticio', 'ficticio');

  -- -------------------------------------------------------------------
  -- 3. TESTES
  -- -------------------------------------------------------------------
  -- T1 discipulo nao registra pedido
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_d, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_d::text, true);
  begin
    perform app.v39_privacy_request_create(v_ch1, v_p_t, 'anonymization', 'pedido da pessoa');
    raise exception 'FALHOU T1';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERMISSION_DENIED' then raise exception 'FALHOU T1: erro inesperado %', sqlerrm; end if;
  end;
  v_res := v_res || 'T1 ok; ';

  -- T2 cross-tenant: master da igreja B, com church_id B, pessoa da igreja A -> PERSON_NOT_IN_CHURCH; com church_id A -> ACCESS_DENIED
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_x, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_x::text, true);
  begin
    perform app.v39_privacy_request_create(v_ch2, v_p_t, 'anonymization', 'tentativa');
    raise exception 'FALHOU T2a';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERSON_NOT_IN_CHURCH' then raise exception 'FALHOU T2a: erro inesperado %', sqlerrm; end if;
  end;
  begin
    perform app.v39_privacy_request_create(v_ch1, v_p_t, 'anonymization', 'tentativa');
    raise exception 'FALHOU T2b';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'ACCESS_DENIED' then raise exception 'FALHOU T2b: erro inesperado %', sqlerrm; end if;
  end;
  v_res := v_res || 'T2 ok; ';

  -- T3 master registra; executar antes de aprovar -> ANONYMIZATION_NOT_APPROVED
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  r := app.v39_privacy_request_create(v_ch1, v_p_t, 'anonymization', 'Titular pediu exclusao dos dados');
  v_req := (r->>'pedidoId')::uuid;
  begin
    perform app.v39_privacy_anonymize_execute(v_ch1, v_req, 'ANONIMIZAR');
    raise exception 'FALHOU T3';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'ANONYMIZATION_NOT_APPROVED' then raise exception 'FALHOU T3: erro inesperado %', sqlerrm; end if;
  end;
  begin
    perform app.v39_privacy_request_create(v_ch1, v_p_t, 'anonymization', 'duplicado');
    raise exception 'FALHOU T3b';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'DSR_ALREADY_OPEN' then raise exception 'FALHOU T3b: erro inesperado %', sqlerrm; end if;
  end;
  v_res := v_res || 'T3 ok; ';

  -- T4 discipulo nao decide; nao lista
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_d, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_d::text, true);
  begin
    perform app.v39_privacy_request_decide(v_ch1, v_req, 'approved', 'x');
    raise exception 'FALHOU T4';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERMISSION_DENIED' then raise exception 'FALHOU T4: erro inesperado %', sqlerrm; end if;
  end;
  begin
    perform app.v39_privacy_requests_list(v_ch1);
    raise exception 'FALHOU T4b';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERMISSION_DENIED' then raise exception 'FALHOU T4b: erro inesperado %', sqlerrm; end if;
  end;
  v_res := v_res || 'T4 ok; ';

  -- T5 master: decidir sem motivo -> REASON_REQUIRED; aprovar; executar sem digitar ANONIMIZAR -> CONFIRMATION_REQUIRED
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  begin
    perform app.v39_privacy_request_decide(v_ch1, v_req, 'approved', '  ');
    raise exception 'FALHOU T5a';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'REASON_REQUIRED' then raise exception 'FALHOU T5a: erro inesperado %', sqlerrm; end if;
  end;
  perform app.v39_privacy_request_decide(v_ch1, v_req, 'approved', 'Identidade conferida pessoalmente');
  begin
    perform app.v39_privacy_anonymize_execute(v_ch1, v_req, 'sim');
    raise exception 'FALHOU T5b';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'CONFIRMATION_REQUIRED' then raise exception 'FALHOU T5b: erro inesperado %', sqlerrm; end if;
  end;
  v_res := v_res || 'T5 ok; ';

  -- T6 master da igreja B nao executa pedido da igreja A
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_x, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_x::text, true);
  begin
    perform app.v39_privacy_anonymize_execute(v_ch2, v_req, 'ANONIMIZAR');
    raise exception 'FALHOU T6';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'REQUEST_NOT_FOUND' then raise exception 'FALHOU T6: erro inesperado %', sqlerrm; end if;
  end;
  v_res := v_res || 'T6 ok; ';

  -- T7 execucao: mascara dados pessoais e PRESERVA dinheiro, presenca, ids
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  r := app.v39_privacy_anonymize_execute(v_ch1, v_req, 'ANONIMIZAR');
  if r->>'resultado' <> 'anonimizado' or (r->'pessoa'->>'id')::uuid <> v_p_t then raise exception 'FALHOU T7a: %', r; end if;
  select * into pe from app.people where id = v_p_t;
  if pe.full_name not like 'Pessoa anonimizada %' or pe.preferred_name is not null or pe.birth_date is not null or pe.cpf is not null
     or pe.notes is not null or pe.sex is not null or pe.photo_file_id is not null or pe.status <> 'restricted' or pe.anonymized_at is null then
    raise exception 'FALHOU T7b: pessoa nao mascarada';
  end if;
  select count(*) into v_n from app.person_contacts where person_id = v_p_t and (contact_value <> 'anonimizado' or normalized_value is not null or valid_until is null);
  if v_n <> 0 then raise exception 'FALHOU T7c: contatos=%', v_n; end if;
  select count(*) into v_n from app.person_addresses where person_id = v_p_t and (street is not null or postal_code is not null or district is not null or latitude is not null or city is null);
  if v_n <> 0 then raise exception 'FALHOU T7d: endereco=%', v_n; end if;
  select count(*) into v_n from app.files where id = v_file and status = 'archived';
  if v_n <> 1 then raise exception 'FALHOU T7e: foto'; end if;
  select count(*) into v_n from app.user_accounts where id = v_ua_t and status = 'revoked' and username like 'anon-%';
  if v_n <> 1 then raise exception 'FALHOU T7f: conta'; end if;
  select count(*) into v_n from app.church_user_access where user_account_id = v_ua_t and status = 'revoked';
  if v_n <> 1 then raise exception 'FALHOU T7g: acesso'; end if;
  select count(*) into v_n from app.access_requests where person_id = v_p_t and email like 'anon-%@anonimizado.invalid' and request_notes is null;
  if v_n <> 1 then raise exception 'FALHOU T7h: pedido de acesso'; end if;
  select count(*), sum(amount) into v_n, v_amt from app.financial_movements where id = v_mov and person_id = v_p_t and status = 'posted';
  if v_n <> 1 or v_amt <> 123.45 then raise exception 'FALHOU T7i: financeiro alterado'; end if;
  select count(*) into v_n from app.worship_service_attendance where worship_service_id = v_ws and person_id = v_p_t and attendance_status = 'present';
  if v_n <> 1 then raise exception 'FALHOU T7j: presenca alterada'; end if;
  select count(*) into v_n from app.data_subject_requests where id = v_req and status = 'completed' and response_reference = 'anonymized';
  if v_n <> 1 then raise exception 'FALHOU T7k: pedido'; end if;
  select count(*) into v_n from app.data_subject_request_history where request_id = v_req;
  if v_n <> 3 then raise exception 'FALHOU T7l: historico=%', v_n; end if;
  select count(*) into v_n from audit.events where entity_id = v_p_t::text and action = 'person_anonymized' and old_data is null and new_data is null;
  if v_n <> 1 then raise exception 'FALHOU T7m: auditoria'; end if;
  select count(*) into v_n from app.church_people where person_id = v_p_t and status = 'closed' and ended_at is not null;
  if v_n <> 1 then raise exception 'FALHOU T7n: vinculo'; end if;
  v_res := v_res || 'T7 ok (mascarou pessoa/contatos/endereco/foto/conta; financeiro 123.45 e presenca intactos); ';

  -- T8 irreversivel / nao repete
  begin
    perform app.v39_privacy_anonymize_execute(v_ch1, v_req, 'ANONIMIZAR');
    raise exception 'FALHOU T8';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'ANONYMIZATION_NOT_APPROVED' then raise exception 'FALHOU T8: erro inesperado %', sqlerrm; end if;
  end;
  v_res := v_res || 'T8 ok; ';

  -- T9 paciente com prontuario: padrao bloqueia (e nada muda); modo restrict so restringe
  r := app.v39_privacy_request_create(v_ch1, v_p_h, 'anonymization', 'Paciente pediu exclusao');
  v_req_h := (r->>'pedidoId')::uuid;
  perform app.v39_privacy_request_decide(v_ch1, v_req_h, 'approved', 'Identidade conferida');
  begin
    perform app.v39_privacy_anonymize_execute(v_ch1, v_req_h, 'ANONIMIZAR');
    raise exception 'FALHOU T9a';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'ANONYMIZATION_BLOCKED_HEALTH_RETENTION' then raise exception 'FALHOU T9a: erro inesperado %', sqlerrm; end if;
  end;
  select count(*) into v_n from app.people where id = v_p_h and full_name = 'Paciente Ficticio B63' and status = 'active';
  if v_n <> 1 then raise exception 'FALHOU T9b: bloqueio alterou dados'; end if;
  r := app.v39_privacy_anonymize_execute(v_ch1, v_req_h, 'ANONIMIZAR', 'restrict');
  select count(*) into v_n from app.people where id = v_p_h and full_name = 'Paciente Ficticio B63' and status = 'restricted' and anonymized_at is null;
  if v_n <> 1 or r->>'resultado' <> 'restringido' then raise exception 'FALHOU T9c: %', r; end if;
  select count(*) into v_n from app.v39_inst_records where patient_person_id = v_p_h;
  if v_n <> 1 then raise exception 'FALHOU T9d: prontuario alterado'; end if;
  select count(*) into v_n from app.data_subject_request_history where request_id = v_req_h and action = 'restricted_health_retention'
     and metadata->>'statusAnterior' = 'active';
  if v_n <> 1 then raise exception 'FALHOU T9e: status anterior nao guardado'; end if;
  v_res := v_res || 'T9 ok; ';

  -- T10 pedido recusado nao executa
  insert into app.church_people (church_id, person_id, status) values (v_ch1, v_p_d, 'active');
  r := app.v39_privacy_request_create(v_ch1, v_p_d, 'anonymization', 'teste recusa');
  v_req_r := (r->>'pedidoId')::uuid;
  perform app.v39_privacy_request_decide(v_ch1, v_req_r, 'rejected', 'Identidade nao confirmada');
  begin
    perform app.v39_privacy_anonymize_execute(v_ch1, v_req_r, 'ANONIMIZAR');
    raise exception 'FALHOU T10';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'ANONYMIZATION_NOT_APPROVED' then raise exception 'FALHOU T10: erro inesperado %', sqlerrm; end if;
  end;
  v_res := v_res || 'T10 ok; ';

  -- T11 lista do master mostra os 3 pedidos; anon sem EXECUTE e chamada real negada
  r := app.v39_privacy_requests_list(v_ch1);
  if jsonb_array_length(r) <> 3 then raise exception 'FALHOU T11a: %', jsonb_array_length(r); end if;
  if has_function_privilege('anon', 'app.v39_privacy_anonymize_execute(uuid,uuid,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'app.v39_privacy_request_create(uuid,uuid,text,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'app.v39_privacy_anonymize_execute(uuid,uuid,text,text)', 'EXECUTE') then
    raise exception 'FALHOU T11b: privilegios';
  end if;
  begin
    set local role anon;
    perform app.v39_privacy_requests_list(v_ch1);
    reset role;
    raise exception 'FALHOU T11c';
  exception when others then
    reset role;
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU T11c: erro inesperado % %', sqlstate, sqlerrm; end if;
  end;
  v_res := v_res || 'T11 ok; ';

  -- T12 (QA63-06) acesso ativo/pendente em OUTRA igreja (sem church_people la) bloqueia ja na APROVACAO
  insert into app.church_user_access (church_id, user_account_id, status) values (v_ch2, v_ua_d, 'pending');
  r := app.v39_privacy_request_create(v_ch1, v_p_d, 'anonymization', 'teste multi-igreja por acesso');
  v_req_r := (r->>'pedidoId')::uuid;
  begin
    perform app.v39_privacy_request_decide(v_ch1, v_req_r, 'approved', 'Identidade conferida');
    raise exception 'FALHOU T12a';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'ANONYMIZATION_MULTI_CHURCH' then raise exception 'FALHOU T12a: erro inesperado %', sqlerrm; end if;
  end;
  select count(*) into v_n from app.data_subject_requests where id = v_req_r and status = 'received';
  if v_n <> 1 then raise exception 'FALHOU T12b: pedido nao ficou em received'; end if;
  perform app.v39_privacy_request_decide(v_ch1, v_req_r, 'rejected', 'Bloqueado: ANONYMIZATION_MULTI_CHURCH');
  select count(*) into v_n from app.user_accounts where id = v_ua_d and status = 'active';
  if v_n <> 1 then raise exception 'FALHOU T12c: conta alterada'; end if;
  v_res := v_res || 'T12 ok; ';

  -- T13 (QA63-05) proprio cadastro: recusado na APROVACAO (antes: so na execucao, com pedido ja aprovado)
  insert into app.church_people (church_id, person_id, status) values (v_ch1, v_p_m, 'active');
  r := app.v39_privacy_request_create(v_ch1, v_p_m, 'anonymization', 'teste proprio cadastro');
  begin
    perform app.v39_privacy_request_decide(v_ch1, (r->>'pedidoId')::uuid, 'approved', 'Identidade conferida');
    raise exception 'FALHOU T13a';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'ANONYMIZATION_SELF_DENIED' then raise exception 'FALHOU T13a: erro inesperado %', sqlerrm; end if;
  end;
  select count(*) into v_n from app.data_subject_requests where id = (r->>'pedidoId')::uuid and status = 'received';
  if v_n <> 1 then raise exception 'FALHOU T13b'; end if;
  v_res := v_res || 'T13 ok; ';


  -- ===================================================================
  -- B63_5 (QA63-01): trava de pessoa anonimizada (v_p_t, T7) e restringida (v_p_h, T9)
  -- ===================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  -- T14 anonimizada: nome, status e marca nao mudam; toque so em updated_at passa; RPC de edicao recusada
  begin
    update app.people set full_name = 'Reidentificada' where id = v_p_t;
    raise exception 'FALHOU T14a';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERSON_ANONYMIZED' then raise exception 'FALHOU T14a: erro inesperado %', sqlerrm; end if;
  end;
  begin
    update app.people set anonymized_at = null, status = 'active', deactivated_at = null where id = v_p_t;
    raise exception 'FALHOU T14b';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERSON_ANONYMIZED' then raise exception 'FALHOU T14b: erro inesperado %', sqlerrm; end if;
  end;
  update app.people set updated_at = now() + interval '1 second' where id = v_p_t;
  begin
    perform app.update_person(v_ch1, v_p_t, (select updated_at from app.people where id = v_p_t), '{"full_name":"Reidentificada"}'::jsonb);
    raise exception 'FALHOU T14c';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERSON_ANONYMIZED' then raise exception 'FALHOU T14c: erro inesperado %', sqlerrm; end if;
  end;
  select count(*) into v_n from app.people where id = v_p_t and full_name like 'Pessoa anonimizada %' and anonymized_at is not null;
  if v_n <> 1 then raise exception 'FALHOU T14d: pessoa alterada'; end if;
  v_res := v_res || 'T14 ok; ';

  -- T15 anonimizada: contato/endereco nao entram nem reabrem; vinculo nao reabre nem nasce em outra igreja
  begin
    insert into app.person_contacts (person_id, contact_type, contact_value, normalized_value) values (v_p_t, 'whatsapp', '(11) 98888-0000', '11988880000');
    raise exception 'FALHOU T15a';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERSON_ANONYMIZED' then raise exception 'FALHOU T15a: erro inesperado %', sqlerrm; end if;
  end;
  begin
    update app.person_addresses set valid_until = null, street = 'Rua Nova' where person_id = v_p_t;
    raise exception 'FALHOU T15b';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERSON_ANONYMIZED' then raise exception 'FALHOU T15b: erro inesperado %', sqlerrm; end if;
  end;
  begin
    update app.church_people set status = 'active', ended_at = null where person_id = v_p_t and church_id = v_ch1;
    raise exception 'FALHOU T15c';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERSON_ANONYMIZED' then raise exception 'FALHOU T15c: erro inesperado %', sqlerrm; end if;
  end;
  begin
    insert into app.church_people (church_id, person_id, status) values (v_ch2, v_p_t, 'active');
    raise exception 'FALHOU T15d';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERSON_ANONYMIZED' then raise exception 'FALHOU T15d: erro inesperado %', sqlerrm; end if;
  end;
  v_res := v_res || 'T15 ok; ';

  -- T16 restringida (saude): cadastro e contato travados; vinculo (jornada) segue editavel
  begin
    update app.people set full_name = 'Paciente Renomeado' where id = v_p_h;
    raise exception 'FALHOU T16a';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERSON_RESTRICTED' then raise exception 'FALHOU T16a: erro inesperado %', sqlerrm; end if;
  end;
  begin
    insert into app.person_contacts (person_id, contact_type, contact_value, normalized_value) values (v_p_h, 'whatsapp', '(11) 97777-0000', '11977770000');
    raise exception 'FALHOU T16b';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERSON_RESTRICTED' then raise exception 'FALHOU T16b: erro inesperado %', sqlerrm; end if;
  end;
  update app.church_people set journey_stage = 'Teste B63_5' where person_id = v_p_h and church_id = v_ch1;
  update app.people set updated_at = now() + interval '1 second' where id = v_p_h;
  v_res := v_res || 'T16 ok; ';

  -- T17 leitura do sync (v39_person_legacy_base / v39_person_legacy): chaves novas, antigas intactas
  r := app.v39_person_legacy_base(v_ch1, v_p_h);
  if (r->>'restritoLgpd')::boolean is not true or r->'anonimizadoEm' <> 'null'::jsonb or r->>'nome' <> 'Paciente Ficticio B63' or r->>'jornada' <> 'Teste B63_5' then
    raise exception 'FALHOU T17a: %', r;
  end if;
  r := app.v39_person_legacy_base(v_ch1, v_p_t);
  if r->>'anonimizadoEm' is null or (r->>'restritoLgpd')::boolean or (r->>'deleted')::boolean is not true then raise exception 'FALHOU T17b: %', r; end if;
  r := app.v39_person_legacy(v_ch1, v_p_d);
  if (r->>'restritoLgpd')::boolean or r->'anonimizadoEm' <> 'null'::jsonb or r->>'id' <> v_p_d::text or not (r ? 'gcId') or not (r ? 'fone') then
    raise exception 'FALHOU T17c: %', r;
  end if;
  v_res := v_res || 'T17 ok; ';

  -- T18 pessoa comum nao muda de comportamento
  update app.people set notes = 'obs B63_5' where id = v_p_d;
  insert into app.person_contacts (person_id, contact_type, contact_value, normalized_value) values (v_p_d, 'whatsapp', '(11) 96666-0000', '11966660000');
  update app.person_contacts set contact_value = '(11) 95555-0000' where person_id = v_p_d and valid_until is null;
  update app.church_people set journey_stage = 'Teste' where person_id = v_p_d and church_id = v_ch1;
  v_res := v_res || 'T18 ok; ';

  -- ===================================================================
  -- QA63R-01/02 (T20-T24): rodam ANTES do T19 porque o T19 anonimiza v_p_h (a restringida)
  -- ===================================================================
  -- T20 discipulo: restringida (v_p_h, vinculo 'institute' aberto) fora de v39_list_people;
  --     pessoas comuns (v_p_d, v_p_m) continuam; nenhum item nulo; vinculo da restringida intacto
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_d, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_d::text, true);
  r := app.v39_list_people(v_ch1);
  if exists (select 1 from jsonb_array_elements(r) x where x->>'id' = v_p_h::text) then raise exception 'FALHOU T20a: restringida na lista do discipulo'; end if;
  select count(*) into v_n from jsonb_array_elements(r) x where x->>'id' in (v_p_d::text, v_p_m::text);
  if v_n <> 2 then raise exception 'FALHOU T20b: pessoas comuns na lista=%', v_n; end if;
  if exists (select 1 from jsonb_array_elements(r) x where jsonb_typeof(x) <> 'object') then raise exception 'FALHOU T20c: item nulo/invalido'; end if;
  select count(*) into v_n from app.church_people where person_id = v_p_h and church_id = v_ch1 and status = 'institute' and ended_at is null;
  if v_n <> 1 then raise exception 'FALHOU T20d: vinculo da restringida mudou'; end if;
  v_res := v_res || 'T20 ok; ';

  -- T21 anonimizada (v_p_t) continua fora da lista
  if exists (select 1 from jsonb_array_elements(r) x where x->>'id' = v_p_t::text) then raise exception 'FALHOU T21: anonimizada na lista'; end if;
  v_res := v_res || 'T21 ok; ';

  -- T22 master (tem people.view_restricted): lista geral tambem sem restringida/anonimizada [CONFIRMAR]; comum aparece;
  --     prontuario da restringida intacto e a leitura individual (v39_person_legacy_base) ainda devolve a marca
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  r := app.v39_list_people(v_ch1);
  if exists (select 1 from jsonb_array_elements(r) x where x->>'id' in (v_p_h::text, v_p_t::text)) then raise exception 'FALHOU T22a: restringida/anonimizada na lista do master'; end if;
  if not exists (select 1 from jsonb_array_elements(r) x where x->>'id' = v_p_d::text) then raise exception 'FALHOU T22b: pessoa comum sumiu'; end if;
  select count(*) into v_n from app.v39_inst_records where patient_person_id = v_p_h;
  if v_n <> 1 then raise exception 'FALHOU T22c: prontuario'; end if;
  if (app.v39_person_legacy_base(v_ch1, v_p_h)->>'restritoLgpd')::boolean is not true then raise exception 'FALHOU T22d: leitura individual'; end if;
  v_res := v_res || 'T22 ok; ';

  -- T23 RLS (leitura direta de app.people como authenticated): restringida invisivel p/ discipulo e master; comuns visiveis
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_d, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_d::text, true);
  begin
    set local role authenticated;
    select count(*) into v_n from app.people where id = v_p_h;
    select count(*) into v_s from app.people where id in (v_p_d, v_p_m);
    reset role;
  exception when others then
    reset role;
    raise exception 'FALHOU T23: erro inesperado % %', sqlstate, sqlerrm;
  end;
  if v_n <> 0 then raise exception 'FALHOU T23a: discipulo le a restringida (%)', v_n; end if;
  if v_s <> 2 then raise exception 'FALHOU T23b: discipulo le % de 2 pessoas comuns', v_s; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  begin
    set local role authenticated;
    select count(*) into v_n from app.people where id = v_p_h;
    select count(*) into v_s from app.people where id = v_p_d;
    reset role;
  exception when others then
    reset role;
    raise exception 'FALHOU T23: erro inesperado % %', sqlstate, sqlerrm;
  end;
  if v_n <> 0 or v_s <> 1 then raise exception 'FALHOU T23c: master restringida=% comum=%', v_n, v_s; end if;
  v_res := v_res || 'T23 ok; ';

  -- T24 (QA63R-02) o bloco do B63_2_anonimizacao_reverter.sql (copia literal) aborta com o B63_5 aplicado e nada sai
  begin
    execute $x$
do $r$
declare v_n int;
begin
  select count(*) into v_n from pg_trigger where not tgisinternal and tgname like 'trg\_v39\_lgpd\_guard\_%';
  if v_n > 0
     or to_regprocedure('private.v39_lgpd_guard_people()') is not null
     or to_regprocedure('private.v39_lgpd_guard_person_child()') is not null
     or to_regprocedure('private.v39_lgpd_guard_church_people()') is not null then
    raise exception 'B63_2 REVERTER ABORTADO: o B63_5 ainda esta aplicado (% gatilho(s) trg_v39_lgpd_guard_*). Rode antes o B63_5_trava_pessoa_anonimizada_reverter.sql (ordem: B63_9 -> B63_5 -> B63_2 -> B63_3 -> B63_1). Nada foi removido.', v_n;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'app' and table_name = 'people' and column_name = 'anonymized_at') then
    execute 'select count(*) from app.people where anonymized_at is not null' into v_n;
    if v_n > 0 then
      raise exception 'B63_2 REVERTER ABORTADO: % pessoa(s) ja anonimizada(s). Nada foi removido.', v_n;
    end if;
  end if;
  drop function if exists app.v39_privacy_anonymize_execute(uuid,uuid,text,text);
  drop function if exists app.v39_privacy_request_decide(uuid,uuid,text,text);
  drop function if exists app.v39_privacy_requests_list(uuid,text);
  drop function if exists app.v39_privacy_request_create(uuid,uuid,text,text);
  drop function if exists private.v39_dsr_anon_precheck(uuid,uuid,uuid);
  drop function if exists private.v39_dsr_move(uuid,text,text,text,uuid,text,jsonb);
  alter table app.people drop column if exists anonymized_by_user_account_id;
  alter table app.people drop column if exists anonymized_at;
  if to_regprocedure('app.v39_privacy_policy_current(uuid)') is null
     and to_regprocedure('app.v39_audit_list(uuid,text,integer,integer,timestamptz,timestamptz)') is null then
    drop function if exists private.v39_lgpd_need(uuid,text);
    drop function if exists private.v39_lgpd_me(uuid);
  end if;
end $r$;
    $x$;
    raise exception 'FALHOU T24a: reverter do B63_2 rodou com o B63_5 aplicado';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm not like 'B63_2 REVERTER ABORTADO: o B63_5 ainda esta aplicado%' then raise exception 'FALHOU T24b: erro inesperado %', sqlerrm; end if;
  end;
  if not exists (select 1 from information_schema.columns where table_schema = 'app' and table_name = 'people' and column_name = 'anonymized_at')
     or to_regprocedure('app.v39_privacy_anonymize_execute(uuid,uuid,text,text)') is null then
    raise exception 'FALHOU T24c: algo foi removido';
  end if;
  v_res := v_res || 'T24 ok; ';

  -- T25 search_people (Financeiro/Treinamentos): master (people.view + people.view_restricted) nao acha a restringida
  --     nem a anonimizada; pessoa comum continua com o mesmo retorno; discipulo continua sem people.view
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  select count(*) into v_n from app.search_people(v_ch1, 'Paciente Ficticio', 12) s;
  if v_n <> 0 then raise exception 'FALHOU T25a: search_people devolve a restringida (%)', v_n; end if;
  select count(*) into v_n from app.search_people(v_ch1, 'Pessoa anonimizada', 12) s;
  if v_n <> 0 then raise exception 'FALHOU T25b: search_people devolve a anonimizada (%)', v_n; end if;
  select count(*) into v_n from app.search_people(v_ch1, 'Teste B63 Discipulo', 12) s
   where s.person_id = v_p_d and s.status = 'active' and s.church_status = 'active' and s.primary_whatsapp = '(11) 95555-0000';
  if v_n <> 1 then raise exception 'FALHOU T25c: pessoa comum (%)', v_n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_d, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_d::text, true);
  begin
    perform * from app.search_people(v_ch1, 'Teste', 12);
    raise exception 'FALHOU T25d';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERMISSION_DENIED' then raise exception 'FALHOU T25d: erro inesperado %', sqlerrm; end if;
  end;
  v_res := v_res || 'T25 ok; ';

  -- ===================================================================
  -- D4 (T26-T31): desfazer restricao feita por engano. Ordem: T26, T27, T28, T30, T31, T29 (T29 desfaz)
  --   e T29k restringe de novo v_p_h, para o T19 continuar valendo.
  -- ===================================================================
  -- T26 lista de restringidas: master ve v_p_h com pedido, status anterior e motivo; anonimizada fora; discipulo PERMISSION_DENIED
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  r := app.v39_privacy_restricted_list(v_ch1);
  if jsonb_array_length(r) <> 1 or r->0->>'pessoaId' <> v_p_h::text or r->0->>'pedidoId' <> v_req_h::text
     or r->0->>'statusAnterior' <> 'active' or r->0->>'nome' <> 'Paciente Ficticio B63' or r->0->>'restritoEm' is null
     or r->0->>'motivo' <> 'Paciente pediu exclusao' then
    raise exception 'FALHOU T26a: %', r;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_d, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_d::text, true);
  begin
    perform app.v39_privacy_restricted_list(v_ch1);
    raise exception 'FALHOU T26b';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERMISSION_DENIED' then raise exception 'FALHOU T26b: erro inesperado %', sqlerrm; end if;
  end;
  if has_function_privilege('anon', 'app.v39_privacy_restricted_list(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'app.v39_privacy_restriction_lift(uuid,uuid,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'app.v39_privacy_restriction_lift(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'FALHOU T26c: privilegios';
  end if;
  v_res := v_res || 'T26 ok; ';

  -- T27 desfazer sem motivo (ou com menos de 10 caracteres) falha e nada muda
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  begin
    perform app.v39_privacy_restriction_lift(v_ch1, v_p_h, '  curto  ');
    raise exception 'FALHOU T27a';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'RESTRICTION_LIFT_REASON_REQUIRED' then raise exception 'FALHOU T27a: erro inesperado %', sqlerrm; end if;
  end;
  begin
    perform app.v39_privacy_restriction_lift(v_ch1, v_p_h, null);
    raise exception 'FALHOU T27b';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'RESTRICTION_LIFT_REASON_REQUIRED' then raise exception 'FALHOU T27b: erro inesperado %', sqlerrm; end if;
  end;
  select count(*) into v_n from app.people where id = v_p_h and status = 'restricted';
  if v_n <> 1 then raise exception 'FALHOU T27c: status mudou'; end if;
  v_res := v_res || 'T27 ok; ';

  -- T28 discipulo nao desfaz
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_d, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_d::text, true);
  begin
    perform app.v39_privacy_restriction_lift(v_ch1, v_p_h, 'Tentativa do discipulo sem permissao');
    raise exception 'FALHOU T28';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERMISSION_DENIED' then raise exception 'FALHOU T28: erro inesperado %', sqlerrm; end if;
  end;
  v_res := v_res || 'T28 ok; ';

  -- T30 UPDATE direto restricted -> active fora da RPC continua recusado (sem marca, marca forjada sem txid,
  --     marca certa mas mudando outro campo)
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  begin
    update app.people set status = 'active', deactivated_at = null where id = v_p_h;
    raise exception 'FALHOU T30a';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERSON_RESTRICTED' then raise exception 'FALHOU T30a: erro inesperado %', sqlerrm; end if;
  end;
  begin
    perform set_config('app.lgpd_lift', v_p_h::text, true);
    update app.people set status = 'active', deactivated_at = null where id = v_p_h;
    raise exception 'FALHOU T30b';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERSON_RESTRICTED' then raise exception 'FALHOU T30b: erro inesperado %', sqlerrm; end if;
  end;
  begin
    perform set_config('app.lgpd_lift', v_p_h::text || ':' || txid_current()::text, true);
    update app.people set status = 'active', deactivated_at = null, full_name = 'Paciente Renomeado' where id = v_p_h;
    raise exception 'FALHOU T30c';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERSON_RESTRICTED' then raise exception 'FALHOU T30c: erro inesperado %', sqlerrm; end if;
  end;
  perform set_config('app.lgpd_lift', '', true);
  select count(*) into v_n from app.people where id = v_p_h and status = 'restricted' and full_name = 'Paciente Ficticio B63';
  if v_n <> 1 then raise exception 'FALHOU T30d: pessoa mudou'; end if;
  v_res := v_res || 'T30 ok; ';

  -- T31 desfazer em anonimizada (v_p_t) ou em pessoa comum falha; master de outra igreja nao alcanca v_p_h
  begin
    perform app.v39_privacy_restriction_lift(v_ch1, v_p_t, 'Tentativa em pessoa anonimizada');
    raise exception 'FALHOU T31a';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERSON_NOT_RESTRICTED' then raise exception 'FALHOU T31a: erro inesperado %', sqlerrm; end if;
  end;
  begin
    perform app.v39_privacy_restriction_lift(v_ch1, v_p_d, 'Tentativa em pessoa comum');
    raise exception 'FALHOU T31b';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERSON_NOT_RESTRICTED' then raise exception 'FALHOU T31b: erro inesperado %', sqlerrm; end if;
  end;
  select count(*) into v_n from app.people where id = v_p_t and anonymized_at is not null and status = 'restricted';
  if v_n <> 1 then raise exception 'FALHOU T31c: anonimizada mudou'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_x, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_x::text, true);
  begin
    perform app.v39_privacy_restriction_lift(v_ch2, v_p_h, 'Tentativa de outra igreja');
    raise exception 'FALHOU T31d';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERSON_NOT_IN_CHURCH' then raise exception 'FALHOU T31d: erro inesperado %', sqlerrm; end if;
  end;
  v_res := v_res || 'T31 ok; ';
  -- T32 (QA63R2-01) master de OUTRA igreja, com vinculo aberto la mas sem pedido de restricao dela, nao desfaz;
  --     depois o vinculo e encerrado para nao afetar o T29k (pre-checagem multi-igreja)
  insert into app.church_people (church_id, person_id, status) values (v_ch2, v_p_h, 'active');
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_x, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_x::text, true);
  begin
    perform app.v39_privacy_restriction_lift(v_ch2, v_p_h, 'Tentativa de outra igreja com vinculo');
    raise exception 'FALHOU T32a';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'RESTRICTION_NOT_FOUND' then raise exception 'FALHOU T32a: erro inesperado %', sqlerrm; end if;
  end;
  select count(*) into v_n from app.people where id = v_p_h and status = 'restricted';
  if v_n <> 1 then raise exception 'FALHOU T32b: restricao desfeita por outra igreja'; end if;
  update app.church_people set status = 'closed', ended_at = now() where church_id = v_ch2 and person_id = v_p_h;
  v_res := v_res || 'T32 ok; ';


  -- T29 master desfaz: volta ao status anterior (active), reaparece em v39_list_people e search_people,
  --     audit e historico gravados, pedido continua completed, prontuario intacto
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  r := app.v39_privacy_restriction_lift(v_ch1, v_p_h, '  Restricao feita por engano no atendimento  ');
  if r->>'ok' <> 'true' or r->'pessoa'->>'id' <> v_p_h::text or r->>'statusNovo' <> 'active' then raise exception 'FALHOU T29a: %', r; end if;
  select count(*) into v_n from app.people where id = v_p_h and status = 'active' and deactivated_at is null and anonymized_at is null
     and full_name = 'Paciente Ficticio B63';
  if v_n <> 1 then raise exception 'FALHOU T29b: status nao voltou'; end if;
  r := app.v39_list_people(v_ch1);
  if not exists (select 1 from jsonb_array_elements(r) x where x->>'id' = v_p_h::text and (x->>'restritoLgpd')::boolean is false) then
    raise exception 'FALHOU T29c: nao reapareceu na lista';
  end if;
  select count(*) into v_n from app.search_people(v_ch1, 'Paciente Ficticio', 12) s where s.person_id = v_p_h;
  if v_n <> 1 then raise exception 'FALHOU T29d: nao reapareceu na busca'; end if;
  select count(*) into v_n from audit.events where entity_id = v_p_h::text and action = 'person_restriction_lifted' and event_category = 'privacy'
     and sensitivity = 'personal' and metadata->>'statusAnterior' = 'active' and metadata->>'pedidoId' = v_req_h::text
     and metadata->>'motivo' = 'Restricao feita por engano no atendimento' and (metadata->>'semRegistroAnterior')::boolean is false;
  if v_n <> 1 then raise exception 'FALHOU T29e: auditoria'; end if;
  select count(*) into v_n from app.data_subject_requests where id = v_req_h and status = 'completed' and response_reference = 'restriction_lifted';
  if v_n <> 1 then raise exception 'FALHOU T29f: pedido'; end if;
  select count(*) into v_n from app.data_subject_request_history where request_id = v_req_h and action = 'restriction_lifted' and new_status = 'completed';
  if v_n <> 1 then raise exception 'FALHOU T29g: historico'; end if;
  select count(*) into v_n from app.v39_inst_records where patient_person_id = v_p_h;
  if v_n <> 1 then raise exception 'FALHOU T29h: prontuario'; end if;
  if jsonb_array_length(app.v39_privacy_restricted_list(v_ch1)) <> 0 then raise exception 'FALHOU T29i: lista de restringidas'; end if;
  begin
    perform app.v39_privacy_restriction_lift(v_ch1, v_p_h, 'Repetindo o desfazer');
    raise exception 'FALHOU T29j';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERSON_NOT_RESTRICTED' then raise exception 'FALHOU T29j: erro inesperado %', sqlerrm; end if;
  end;
  -- T29k restringe de novo (fluxo normal do B63_2) para o T19 continuar testando restringida -> anonimizada
  r := app.v39_privacy_request_create(v_ch1, v_p_h, 'anonymization', 'Paciente pediu de novo');
  perform app.v39_privacy_request_decide(v_ch1, (r->>'pedidoId')::uuid, 'approved', 'Identidade conferida');
  r := app.v39_privacy_anonymize_execute(v_ch1, (r->>'pedidoId')::uuid, 'ANONIMIZAR', 'restrict');
  select count(*) into v_n from app.people where id = v_p_h and status = 'restricted' and anonymized_at is null;
  if v_n <> 1 or r->>'resultado' <> 'restringido' then raise exception 'FALHOU T29k: %', r; end if;
  if jsonb_array_length(app.v39_privacy_restricted_list(v_ch1)) <> 1 then raise exception 'FALHOU T29l: lista de restringidas'; end if;
  v_res := v_res || 'T29 ok; ';

  -- T19 restringida -> anonimizada continua possivel (execucao do B63_2 quando a guarda legal acabar)
  update app.people set full_name = 'Pessoa anonimizada T19', anonymized_at = now(), anonymized_by_user_account_id = v_ua_m where id = v_p_h;
  v_res := v_res || 'T19 ok; ';

  -- REVERTER B63_5: volta ao original
  drop function if exists app.v39_privacy_restriction_lift(uuid,uuid,text);
  drop function if exists app.v39_privacy_restricted_list(uuid);
  drop trigger if exists trg_v39_lgpd_guard_people on app.people;
  drop trigger if exists trg_v39_lgpd_guard_contacts on app.person_contacts;
  drop trigger if exists trg_v39_lgpd_guard_addresses on app.person_addresses;
  drop trigger if exists trg_v39_lgpd_guard_church_people on app.church_people;
  drop function if exists private.v39_lgpd_guard_people();
  drop function if exists private.v39_lgpd_guard_person_child();
  drop function if exists private.v39_lgpd_guard_church_people();

  -- texto original (22/11/2026; o md5 pode diferir do original so por quebra de linha CRLF/LF)
  create or replace function app.v39_person_legacy_base(p_church_id uuid, p_person_id uuid)
   returns jsonb
   language sql
   stable security definer
   set search_path to 'pg_catalog', 'app', 'private'
  as $function$
    select jsonb_build_object(
      'id', p.id, 'codigo', coalesce(p.person_code::text, ''),
      'nome', p.full_name, 'apelido', coalesce(p.preferred_name, ''),
      'nasc', coalesce(p.birth_date::text, ''), 'sexo', app.v39_sexo_legado(p.sex), 'obs', coalesce(p.notes, ''),
      'tipo',   case cp.status when 'visiting' then 'Visitante' when 'institute' then 'Instituto' else 'Membro' end,
      'status', case cp.status when 'visiting' then 'Em visita' when 'institute' then 'Instituto' when 'inactive' then 'Inativo'
                               when 'closed' then 'Inativo' when 'transferred' then 'Inativo' else 'Ativo' end,
      'aceitaVisita',    case cp.accepts_home_visit   when true then 'Sim' when false then 'Não' else '' end,
      'frequentaIgreja', case cp.attends_other_church when true then 'Sim' when false then 'Não' else '' end,
      'igrejaQual', coalesce(cp.attends_church_text, ''), 'canal', coalesce(cp.source, ''), 'canalOutro', coalesce(cp.source_other, ''),
      'gcId', coalesce((select m.growth_group_id::text from app.growth_group_memberships m
                         where m.person_id = p.id and m.role_type = 'participant' and m.ended_at is null
                           and m.status in ('active','pending','inactive')
                         order by m.updated_at desc limit 1), ''),
      'fone', coalesce((select c.contact_value from app.person_contacts c
                         where c.person_id = p.id and c.contact_type in ('whatsapp','phone') and c.valid_until is null
                         order by c.is_primary desc, c.created_at desc limit 1), ''),
      'cep', coalesce(a.postal_code, ''), 'endereco', coalesce(a.street, ''), 'numero', coalesce(a.street_number, ''),
      'complemento', coalesce(a.complement, ''), 'bairro', coalesce(a.district, ''), 'cidade', coalesce(a.city, ''),
      'criadoPor', coalesce(to_jsonb(cp)->>'created_by', to_jsonb(cp)->>'created_by_user_account_id',
                            to_jsonb(p)->>'created_by_user_account_id', to_jsonb(p)->>'created_by', ''),
      'criadoEm', coalesce(cp.created_at, p.created_at),
      'jornada', coalesce(cp.journey_stage, case when cp.status = 'institute' then 'Instituto' else '' end),
      'deleted', cp.status = 'closed', 'updatedAt', greatest(p.updated_at, cp.updated_at), '_supabase', true)
    from app.people p
    join app.church_people cp on cp.person_id = p.id and cp.church_id = p_church_id
    left join lateral (select * from app.person_addresses x
                        where x.person_id = p.id and x.valid_until is null
                        order by x.is_primary desc, x.created_at desc limit 1) a on true
    where p.id = p_person_id
    order by (cp.ended_at is null) desc, cp.started_at desc nulls last
    limit 1;
  $function$;

  if md5(regexp_replace(pg_get_functiondef('app.v39_person_legacy_base(uuid,uuid)'::regprocedure), '\s+', ' ', 'g')) <> v_md5 then
    raise exception 'FALHOU R1: v39_person_legacy_base diferente do original';
  end if;
  select count(*) into v_n from pg_trigger where tgname like 'trg_v39_lgpd_guard_%';
  if v_n <> 0 then raise exception 'FALHOU R2: gatilhos'; end if;

  -- texto original de app.v39_list_people (22/11/2026; md5 20e5487d... com CRLF; aqui LF)
  create or replace function app.v39_list_people(p_church_id uuid)
   returns jsonb
   language plpgsql
   stable security definer
   set search_path to 'pg_catalog', 'app', 'private'
  as $function$
  declare v_map jsonb := '{}'::jsonb; v_l jsonb;
  begin
    if app.current_user_account_id() is null
       or not private.has_active_profile_in_church(p_church_id, array['master','pastor','supervisor','leader','disciple']) then
      perform app.raise_domain_error('PERMISSION_DENIED','Sem permissao');
    end if;
    -- INST-4: auxílios do Instituto por pessoa (código). Sem acesso ao Instituto: lista vazia, sem erro.
    begin
      v_l := app.v39_inst_people(p_church_id => p_church_id, p_filtro => 'todos');
      select coalesce(jsonb_object_agg(k, a), '{}'::jsonb) into v_map from (
        select distinct on (ltrim(x->>'codigo', '0')) ltrim(x->>'codigo', '0') k, coalesce(x->'atividades', '[]'::jsonb) a
          from jsonb_array_elements(coalesce(v_l->'pessoas', '[]'::jsonb)) x
         where coalesce(x->>'codigo', '') <> '') t;
    exception when others then v_map := '{}'::jsonb;
    end;
    return coalesce((select jsonb_agg(l || jsonb_build_object('instAtividades', coalesce(v_map->ltrim(l->>'codigo', '0'), '[]'::jsonb)))
                       from (select app.v39_person_legacy(p_church_id, cp.person_id) l
                               from app.church_people cp
                              where cp.church_id = p_church_id and cp.status <> 'closed') s), '[]'::jsonb);
  end;
  $function$;

  -- policy original de app.people (22/11/2026; md5 do qual 62eeb0de...)
  drop policy if exists v39_people_select_accessible_church on app.people;
  create policy v39_people_select_accessible_church on app.people as permissive for select to authenticated
    using (exists (select 1
                     from app.church_people cp
                     join app.church_user_access cua on cua.church_id = cp.church_id
                     join app.user_accounts ua on ua.id = cua.user_account_id
                    where cp.person_id = people.id and cp.ended_at is null and cua.status = 'active'
                      and ua.status = 'active' and ua.auth_user_id = auth.uid()));

  if md5(regexp_replace(pg_get_functiondef('app.v39_list_people(uuid)'::regprocedure), '\s+', ' ', 'g')) <> v_md5_lp then
    raise exception 'FALHOU R3: v39_list_people diferente do original';
  end if;
  if (select md5(qual) from pg_policies where schemaname = 'app' and tablename = 'people'
        and policyname = 'v39_people_select_accessible_church' and cmd = 'SELECT') is distinct from v_qual then
    raise exception 'FALHOU R4: policy diferente da original';
  end if;
  -- R5/R6 reverter restaura o comportamento antigo: v_p_h (vinculo aberto) volta a lista e a leitura direta
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_d, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_d::text, true);
  r := app.v39_list_people(v_ch1);
  if not exists (select 1 from jsonb_array_elements(r) x where x->>'id' = v_p_h::text) then raise exception 'FALHOU R5: lista nao restaurada'; end if;
  begin
    set local role authenticated;
    select count(*) into v_n from app.people where id = v_p_h;
    reset role;
  exception when others then
    reset role;
    raise exception 'FALHOU R6: erro inesperado % %', sqlstate, sqlerrm;
  end;
  if v_n <> 1 then raise exception 'FALHOU R6: RLS nao restaurada (%)', v_n; end if;

  -- texto original de app.search_people (22/11/2026; md5 ab3fe6f3... com CRLF; aqui LF)
  create or replace function app.search_people(p_church_id uuid, p_query text default null::text, p_limit integer default 30)
   returns table(person_id uuid, full_name text, preferred_name text, status text, church_status text, primary_email text, primary_whatsapp text)
   language plpgsql
   security definer
   set search_path to 'pg_catalog', 'app'
  as $function$
  begin
    if not app.has_permission('people.view', p_church_id, 'church', p_church_id) then
      perform app.raise_domain_error('PERMISSION_DENIED', 'Permissao people.view obrigatoria');
    end if;
    return query
    select p.id, p.full_name, p.preferred_name, p.status, cp.status,
           (select pc.contact_value from app.person_contacts pc where pc.person_id = p.id and pc.contact_type = 'email' and pc.valid_until is null order by pc.is_primary desc, pc.created_at limit 1),
           (select pc.contact_value from app.person_contacts pc where pc.person_id = p.id and pc.contact_type = 'whatsapp' and pc.valid_until is null order by pc.is_primary desc, pc.created_at limit 1)
      from app.people p join app.church_people cp on cp.person_id = p.id and cp.church_id = p_church_id
     where cp.ended_at is null and p.status <> 'merged'
       and (p.status <> 'restricted' or app.has_permission('people.view_restricted', p_church_id, 'church', p_church_id))
       and (p_query is null or p.full_name ilike '%' || trim(p_query) || '%' or p.preferred_name ilike '%' || trim(p_query) || '%')
     order by p.full_name limit greatest(1, least(coalesce(p_limit, 30), 100));
  end;
  $function$;

  if md5(regexp_replace(pg_get_functiondef('app.search_people(uuid,text,integer)'::regprocedure), '\s+', ' ', 'g')) <> v_md5_sp then
    raise exception 'FALHOU R7: search_people diferente do original';
  end if;
  -- R8 reverter restaura: master (people.view_restricted) volta a achar a restringida (v_p_h, renomeada no T19)
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  select count(*) into v_n from app.search_people(v_ch1, 'Pessoa anonimizada T19', 12) s where s.person_id = v_p_h;
  if v_n <> 1 then raise exception 'FALHOU R8: search_people nao restaurada (%)', v_n; end if;
  if to_regprocedure('app.v39_privacy_restricted_list(uuid)') is not null
     or to_regprocedure('app.v39_privacy_restriction_lift(uuid,uuid,text)') is not null then
    raise exception 'FALHOU R9: RPCs de desfazer restricao nao foram removidas';
  end if;
  update app.people set full_name = 'Sem trava' where id = v_p_t;
  v_res := v_res || 'REVERTER ok';

  raise exception 'TESTE B63_5 CONCLUIDO (nada foi gravado): %', v_res;
end
$t$;
