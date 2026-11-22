-- =====================================================================
-- B63_3 · LGPD · Auditoria (gravar acessos sensiveis + consulta) · teste com rollback
-- Build 63 · tarefa DATA-63 · 2gather-data
-- ULTIMA EXECUCAO (22/11/2026, via MCP execute_sql, projeto kybrwsxvdbwjtwakczyj):
--   ERROR P0001: TESTE B63_3 CONCLUIDO (nada foi gravado): T1 ok (leitura do prontuario
--   registrada nos 2 logs); T2 ok; T3 ok (discipulo/pastor/medico negados); T4 ok;
--   T5 ok (5 registros); T6 ok; T7 ok; T8 ok; T9 ok   (passou na 1a execucao)
-- ---------------------------------------------------------------------
-- Objetivo
--   1) Helpers de gravacao:
--      private.v39_audit_log(...)      -> audit.events (acoes administrativas/privacidade)
--      private.v39_sensitive_log(...)  -> app.sensitive_data_access_log (leitura de dado sensivel)
--   2) Exemplo de gancho: app.v39_inst_record_list (prontuario) passa a gravar tambem em
--      sensitive_data_access_log (continua gravando em v39_inst_record_log, sem regressao).
--      O corpo e o atual do banco + 1 linha (perform private.v39_sensitive_log ...).
--   3) Consulta: app.v39_audit_list(church, filtro, limite, offset, de, ate), que substitui
--      chamar('auditoria', {filtro}) e devolve {total, itens:[{usuario, acao, detalhe, data, ...}]}
--      no formato que abrirAuditoria() ja desenha. Gate: audit.view (hoje so master).
--      Fontes de saude/sensiveis so com sensitive_access.audit (hoje so master).
--      A propria consulta fica registrada (auditoria da auditoria).
-- Limite conhecido: acesso NEGADO que termina em raise nao fica gravado (o raise desfaz o
--   insert; Postgres nao tem transacao autonoma). Ver proposta 63.3.
-- Pre-requisitos: audit.events, app.sensitive_data_access_log, app.data_sensitivity_levels,
--   app.v39_inst_record_log, app.access_history, private.auth_login_events.
-- NAO GRAVA NADA: tudo e desfeito pelo raise final (inclusive a troca de v39_inst_record_list).
-- =====================================================================
do $t$
declare
  v_ch1 uuid := gen_random_uuid();  v_ch2 uuid := gen_random_uuid();
  v_au_m uuid := gen_random_uuid(); v_au_d uuid := gen_random_uuid(); v_au_x uuid := gen_random_uuid(); v_au_p uuid := gen_random_uuid(); v_au_h uuid := gen_random_uuid();
  v_p_m uuid; v_p_d uuid; v_p_x uuid; v_p_p uuid; v_p_h uuid; v_pac uuid;
  v_ua_m uuid; v_ua_d uuid; v_ua_x uuid; v_ua_p uuid; v_ua_h uuid;
  v_cua uuid; v_cua_m uuid; v_master uuid; v_disc uuid; v_pastor uuid; v_hp uuid; v_prof uuid; v_ag uuid;
  r jsonb; v_n int; v_res text := '';
begin
  -- -------------------------------------------------------------------
  -- 1. ESTRUTURA PROPOSTA
  -- -------------------------------------------------------------------
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

  create function private.v39_audit_log(p_church_id uuid, p_category text, p_action text, p_entity_schema text, p_entity_name text,
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

  create function private.v39_sensitive_log(p_church_id uuid, p_person_id uuid, p_level text, p_operation text, p_entity_schema text,
                                            p_entity_name text, p_entity_id text, p_reason text, p_outcome text default 'allowed',
                                            p_metadata jsonb default '{}'::jsonb) returns bigint
  language plpgsql security definer set search_path = pg_catalog, app, private as $f$
  declare v_id bigint; v_me uuid := app.current_user_account_id(); v_level uuid;
  begin
    if v_me is null then return null; end if;  -- sem usuario nao ha o que registrar (a RPC ja negou)
    select id into v_level from app.data_sensitivity_levels where code = coalesce(p_level, 'sensitive');
    if v_level is null then select id into v_level from app.data_sensitivity_levels where code = 'sensitive'; end if;
    insert into app.sensitive_data_access_log (church_id, user_account_id, person_id, sensitivity_level_id, operation, entity_schema, entity_name,
                                               entity_id, access_reason, outcome, metadata)
    values (p_church_id, v_me, p_person_id, v_level, p_operation, p_entity_schema, p_entity_name, p_entity_id,
            coalesce(nullif(btrim(p_reason), ''), 'consulta'), p_outcome, coalesce(p_metadata, '{}'::jsonb))
    returning id into v_id;
    return v_id;
  end $f$;

  -- gancho no prontuario: corpo atual + 1 linha de registro sensivel
  create or replace function app.v39_inst_record_list(p_church_id uuid, p_person uuid) returns jsonb
  language plpgsql security definer set search_path = pg_catalog, app, private as $f$
  declare v_me uuid := app.current_user_account_id(); v_prof uuid := private.v39_inst_my_prof(p_church_id); v_clin boolean; r record; v_key text; v_plain jsonb; v_out jsonb := '[]'::jsonb; v_bad int := 0;
  begin
    if v_me is null or v_prof is null then perform app.raise_domain_error('PERMISSION_DENIED', 'Somente profissionais de saude acessam o prontuario'); end if;
    if not exists (select 1 from app.institute_appointments ap join app.institute_agendas g on g.id = ap.agenda_id where ap.church_id = p_church_id and ap.patient_person_id = p_person and g.professional_id = v_prof) then
      perform app.raise_domain_error('PERMISSION_DENIED', 'Voce nao tem atendimento com este paciente');
    end if;
    v_clin := private.v39_inst_is_clinical(p_church_id, v_prof);
    v_key := private.v39_inst_rec_key();
    for r in select c.id, c.appointment_id, c.patient_person_id, c.professional_id, c.reserved, c.encrypted_payload, c.content_hash, c.updated_at, ap.appointment_date, ap.start_time,
                    coalesce(ip.name, '') as prof_nome, coalesce(nullif(g.settings->>'especialidade', ''), ip.specialty, '') as prof_esp
               from app.v39_inst_records c join app.institute_appointments ap on ap.id = c.appointment_id join app.institute_agendas g on g.id = ap.agenda_id
               left join app.institute_professionals ip on ip.id = c.professional_id
              where c.church_id = p_church_id and c.patient_person_id = p_person and (c.professional_id = v_prof or (v_clin and not c.reserved))
              order by ap.appointment_date desc, ap.start_time desc limit 200
    loop
      begin
        v_plain := extensions.pgp_sym_decrypt(decode(r.encrypted_payload, 'base64'), v_key)::jsonb;
        if v_plain->>'appointment_id' is distinct from r.appointment_id::text or v_plain->>'patient_person_id' is distinct from r.patient_person_id::text
           or v_plain->>'professional_id' is distinct from r.professional_id::text or encode(extensions.digest(v_plain::text, 'sha256'), 'hex') is distinct from r.content_hash then
          v_bad := v_bad + 1;
        else
          v_out := v_out || jsonb_build_object('agendamentoId', r.appointment_id, 'data', r.appointment_date, 'hora', to_char(r.start_time, 'HH24:MI'), 'profissionalId', r.professional_id,
            'profissional', r.prof_nome, 'especialidade', r.prof_esp, 'meu', r.professional_id = v_prof, 'reservado', r.reserved, 'queixa', v_plain->>'queixa',
            'anamnese', v_plain->>'anamnese', 'exame', v_plain->>'exame', 'avaliacao', v_plain->>'avaliacao', 'conduta', v_plain->>'conduta', 'receita', v_plain->>'receita',
            'comentarios', v_plain->>'comentarios', 'retorno', v_plain->>'retorno', 'atualizadoEm', r.updated_at);
        end if;
      exception when others then v_bad := v_bad + 1;
      end;
    end loop;
    insert into app.v39_inst_record_log (church_id, user_account_id, professional_id, patient_person_id, action) values (p_church_id, v_me, v_prof, p_person, 'read');
    -- B63: registro unificado de acesso sensivel (nao guarda conteudo clinico)
    perform private.v39_sensitive_log(p_church_id, p_person, 'health', 'view', 'app', 'v39_inst_records', null, 'Prontuario: leitura pelo profissional',
                                      'allowed', jsonb_build_object('itens', jsonb_array_length(v_out), 'invalidos', v_bad, 'professional_id', v_prof));
    return jsonb_build_object('itens', v_out, 'invalidos', v_bad, 'clinico', v_clin);
  end $f$;

  -- consulta unificada (substitui chamar('auditoria', {filtro}))
  create function app.v39_audit_list(p_church_id uuid, p_filtro text default '', p_limit integer default 500, p_offset integer default 0,
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
      select l.occurred_at, coalesce(ua.username, '?'), 'prontuario: ' || l.action, 'paciente ' || left(l.patient_person_id::text, 8), 'prontuario', 'health', 'allowed', true
        from app.v39_inst_record_log l left join app.user_accounts ua on ua.id = l.user_account_id
       where l.church_id = p_church_id
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
    private.v39_sensitive_log(uuid,uuid,text,text,text,text,text,text,text,jsonb) from public, anon, authenticated;
  revoke all on function app.v39_audit_list(uuid,text,integer,integer,timestamptz,timestamptz) from public, anon;
  grant execute on function app.v39_audit_list(uuid,text,integer,integer,timestamptz,timestamptz) to authenticated;

  -- -------------------------------------------------------------------
  -- 2. DADOS FICTICIOS
  -- -------------------------------------------------------------------
  select id into v_master from app.access_profiles where code = 'master' and is_active;
  select id into v_disc from app.access_profiles where code = 'disciple' and is_active;
  select id into v_pastor from app.access_profiles where code = 'pastor' and is_active;
  select id into v_hp from app.access_profiles where code = 'health_professional' and is_active;
  insert into app.churches (id, name, slug) values (v_ch1, 'Igreja Teste B63 A', 'teste-b63-a-' || left(v_ch1::text, 8)), (v_ch2, 'Igreja Teste B63 B', 'teste-b63-b-' || left(v_ch2::text, 8));
  insert into auth.users (id, email) values (v_au_m, 'b63m@teste.invalid'), (v_au_d, 'b63d@teste.invalid'), (v_au_x, 'b63x@teste.invalid'), (v_au_p, 'b63p@teste.invalid'), (v_au_h, 'b63h@teste.invalid');
  insert into app.people (full_name) values ('Teste B63 Master') returning id into v_p_m;
  insert into app.people (full_name) values ('Teste B63 Discipulo') returning id into v_p_d;
  insert into app.people (full_name) values ('Teste B63 Outra Igreja') returning id into v_p_x;
  insert into app.people (full_name) values ('Teste B63 Pastor') returning id into v_p_p;
  insert into app.people (full_name) values ('Teste B63 Medico') returning id into v_p_h;
  insert into app.people (full_name) values ('Paciente Ficticio B63') returning id into v_pac;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_m, v_p_m, 'active', now(), 'tb63m') returning id into v_ua_m;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_d, v_p_d, 'active', now(), 'tb63d') returning id into v_ua_d;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_x, v_p_x, 'active', now(), 'tb63x') returning id into v_ua_x;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_p, v_p_p, 'active', now(), 'tb63p') returning id into v_ua_p;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_h, v_p_h, 'active', now(), 'tb63h') returning id into v_ua_h;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch1, v_ua_m, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua_m;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua_m, v_master, true, now() - interval '1 day');
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch1, v_ua_d, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_disc, true, now() - interval '1 day');
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch2, v_ua_x, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_master, true, now() - interval '1 day');
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch1, v_ua_p, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_pastor, true, now() - interval '1 day');
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch1, v_ua_h, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_hp, true, now() - interval '1 day');
  insert into app.institute_professionals (church_id, person_id, name, active) values (v_ch1, v_p_h, 'Medico ficticio', true) returning id into v_prof;
  insert into app.institute_agendas (church_id, agenda_type, title, professional_id) values (v_ch1, 'health', 'Agenda teste B63', v_prof) returning id into v_ag;
  insert into app.institute_appointments (church_id, agenda_id, appointment_date, start_time, patient_person_id) values (v_ch1, v_ag, current_date, '09:00', v_pac);
  -- eventos administrativos pre-existentes (igreja A) e um da igreja B (nao pode aparecer na A)
  insert into private.auth_login_events (user_account_id, event_type) values (v_ua_d, 'failure'), (v_ua_d, 'success');
  insert into app.access_history (church_id, user_account_id, action, performed_by_user_account_id, reason) values (v_ch1, v_ua_d, 'suspended', v_ua_m, 'teste');
  insert into audit.events (church_id, actor_user_account_id, action, entity_schema, entity_name, event_category, sensitivity, outcome, source)
  values (v_ch2, v_ua_x, 'evento_da_igreja_b', 'app', 'people', 'administrative', 'standard', 'success', 'rpc');

  -- -------------------------------------------------------------------
  -- 3. TESTES
  -- -------------------------------------------------------------------
  -- T1 medico le o prontuario do paciente -> grava em v39_inst_record_log E em sensitive_data_access_log
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_h, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_h::text, true);
  r := app.v39_inst_record_list(v_ch1, v_pac);
  select count(*) into v_n from app.sensitive_data_access_log s join app.data_sensitivity_levels dl on dl.id = s.sensitivity_level_id
   where s.church_id = v_ch1 and s.user_account_id = v_ua_h and s.person_id = v_pac and dl.code = 'health' and s.operation = 'view' and s.outcome = 'allowed';
  if v_n <> 1 then raise exception 'FALHOU T1a: sensivel=%', v_n; end if;
  select count(*) into v_n from app.v39_inst_record_log where church_id = v_ch1 and user_account_id = v_ua_h and patient_person_id = v_pac and action = 'read';
  if v_n <> 1 then raise exception 'FALHOU T1b: record_log=%', v_n; end if;
  v_res := v_res || 'T1 ok (leitura do prontuario registrada nos 2 logs); ';

  -- T2 medico sem atendimento com outro paciente: negado (e o log e desfeito junto com o erro)
  begin
    perform app.v39_inst_record_list(v_ch1, v_p_d);
    raise exception 'FALHOU T2';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERMISSION_DENIED' then raise exception 'FALHOU T2: erro inesperado %', sqlerrm; end if;
  end;
  v_res := v_res || 'T2 ok; ';

  -- T3 discipulo, pastor e medico NAO consultam a auditoria
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_d, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_d::text, true);
  begin
    perform app.v39_audit_list(v_ch1);
    raise exception 'FALHOU T3a';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERMISSION_DENIED' then raise exception 'FALHOU T3a: erro inesperado %', sqlerrm; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_p::text, true);
  begin
    perform app.v39_audit_list(v_ch1);
    raise exception 'FALHOU T3b';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERMISSION_DENIED' then raise exception 'FALHOU T3b: erro inesperado %', sqlerrm; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_h, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_h::text, true);
  begin
    perform app.v39_audit_list(v_ch1);
    raise exception 'FALHOU T3c';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERMISSION_DENIED' then raise exception 'FALHOU T3c: erro inesperado %', sqlerrm; end if;
  end;
  v_res := v_res || 'T3 ok (discipulo/pastor/medico negados); ';

  -- T4 master da igreja B nao le a auditoria da igreja A
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_x, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_x::text, true);
  begin
    perform app.v39_audit_list(v_ch1);
    raise exception 'FALHOU T4';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'ACCESS_DENIED' then raise exception 'FALHOU T4: erro inesperado %', sqlerrm; end if;
  end;
  v_res := v_res || 'T4 ok; ';

  -- T5 master le: formato {total, itens[usuario, acao, detalhe, data]}; 5 registros da igreja A
  --    (falha de login, login, bloqueio, prontuario no record_log, acesso sensivel); nada da igreja B
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  r := app.v39_audit_list(v_ch1);
  if (r->>'total')::int <> 5 or jsonb_array_length(r->'itens') <> 5 or (r->>'incluiSensiveis')::boolean is not true then raise exception 'FALHOU T5a: %', r; end if;
  if not (r->'itens'->0 ? 'usuario' and r->'itens'->0 ? 'acao' and r->'itens'->0 ? 'detalhe' and r->'itens'->0 ? 'data') then raise exception 'FALHOU T5b: formato'; end if;
  if r::text like '%evento_da_igreja_b%' then raise exception 'FALHOU T5c: vazou igreja B'; end if;
  v_res := v_res || 'T5 ok (5 registros); ';

  -- T6 filtro (como o campo "Filtrar" da tela) e a consulta anterior ja aparece (auditoria da auditoria)
  r := app.v39_audit_list(v_ch1, 'falha');
  if (r->>'total')::int <> 1 or r->'itens'->0->>'acao' <> 'falha de login' then raise exception 'FALHOU T6a: %', r; end if;
  r := app.v39_audit_list(v_ch1, 'consultou');
  if (r->>'total')::int <> 2 then raise exception 'FALHOU T6b: %', r; end if;
  v_res := v_res || 'T6 ok; ';

  -- T7 paginacao: limite 2
  r := app.v39_audit_list(v_ch1, '', 2, 0);
  if jsonb_array_length(r->'itens') <> 2 or (r->>'total')::int < 5 then raise exception 'FALHOU T7: %', r; end if;
  v_res := v_res || 'T7 ok; ';

  -- T8 master com negacao explicita de sensitive_access.audit: nao ve fontes de saude/sensiveis
  insert into app.user_permission_overrides (church_user_access_id, permission_id, effect, justification)
  select v_cua_m, id, 'deny', 'teste B63' from app.permissions where code = 'sensitive_access.audit';
  r := app.v39_audit_list(v_ch1);
  if (r->>'incluiSensiveis')::boolean is not false or r::text like '%prontuario%' or r::text like '%acesso a dado sensivel%' then raise exception 'FALHOU T8: %', r; end if;
  v_res := v_res || 'T8 ok; ';

  -- T9 anon sem EXECUTE; helpers privados fechados ate para authenticated
  if has_function_privilege('anon', 'app.v39_audit_list(uuid,text,integer,integer,timestamptz,timestamptz)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.v39_audit_log(uuid,text,text,text,text,text,uuid,text,text,text,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.v39_sensitive_log(uuid,uuid,text,text,text,text,text,text,text,jsonb)', 'EXECUTE') then
    raise exception 'FALHOU T9a: privilegios';
  end if;
  begin
    set local role anon;
    perform app.v39_audit_list(v_ch1);
    reset role;
    raise exception 'FALHOU T9b';
  exception when others then
    reset role;
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU T9b: erro inesperado % %', sqlstate, sqlerrm; end if;
  end;
  v_res := v_res || 'T9 ok';

  raise exception 'TESTE B63_3 CONCLUIDO (nada foi gravado): %', v_res;
end
$t$;
