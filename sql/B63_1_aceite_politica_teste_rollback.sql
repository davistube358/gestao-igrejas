-- =====================================================================
-- B63_1 · LGPD · Aceite da Politica de Privacidade (teste com rollback)
-- Build 63 · tarefa DATA-63 · 2gather-data
-- ULTIMA EXECUCAO (22/11/2026, via MCP execute_sql, projeto kybrwsxvdbwjtwakczyj):
--   ERROR P0001: TESTE B63_1 CONCLUIDO (nada foi gravado): T1 ok; T2 ok; T3 ok; T4 ok;
--   T5 ok; T6 ok; T7 ok; T8 ok; T9 ok; T10 ok; T11 ok; T12 ok; T13 ok; T14 ok (5 eventos)
--   (1a tentativa falhou em T7 com 23505 person_consents_active_unique_idx: corrigido
--    em private.v39_privacy_grant; a funcao atual v39_accept_privacy_policy tem esse
--    mesmo defeito no 2o aceite.)
-- ---------------------------------------------------------------------
-- Objetivo
--   1) Guardar o texto da politica no Supabase (versoes imutaveis), no
--      lugar de chamarBruto({acao:'politica'}) do Apps Script.
--   2) Aceite do usuario logado: app.v39_privacy_accept (so para a
--      PROPRIA pessoa; o texto/hash vem do servidor, nao do navegador).
--   3) Situacao do aceite para o login: app.v39_privacy_my_status
--      (alimenta cfg.usuario.consent / consentEm / politicaV).
--   4) Aceite no cadastro publico (antes da conta): o cadastro ja cria a
--      pessoa (private.create_public_access_request), entao o aceite vai
--      direto para app.person_consents com canal 'public_signup' por
--      app.edge_record_signup_consent (so service_role / Edge "auth").
--      Na aprovacao nada precisa ser copiado: o consentimento ja e da
--      pessoa. Pedido antigo sem aceite -> o modal aparece no 1o login.
-- Pre-requisitos: tabelas app.person_consents, app.person_consent_history,
--   app.processing_purposes; funcoes private.v39_fin_me, app.has_permission,
--   app.current_church_user_access_id, app.raise_domain_error.
-- NAO GRAVA NADA: tudo (tabela nova, funcoes, igrejas/pessoas/usuarios
--   ficticios) e criado dentro do bloco e desfeito pelo raise final.
-- =====================================================================
do $t$
declare
  v_ch1 uuid := gen_random_uuid();  v_ch2 uuid := gen_random_uuid();
  v_au_m uuid := gen_random_uuid(); v_au_d uuid := gen_random_uuid(); v_au_x uuid := gen_random_uuid(); v_au_s uuid := gen_random_uuid();
  v_p_m uuid; v_p_d uuid; v_p_x uuid; v_p_s uuid; v_p_cad uuid;
  v_ua_m uuid; v_ua_d uuid; v_ua_x uuid; v_ua_s uuid;
  v_cua uuid; v_master uuid; v_disc uuid; v_req uuid;
  r jsonb; v_n int; v_txt text; v_res text := '';
begin
  -- -------------------------------------------------------------------
  -- 1. ESTRUTURA PROPOSTA
  -- -------------------------------------------------------------------
  create table app.v39_privacy_policy_versions (
    id uuid primary key default gen_random_uuid(),
    church_id uuid references app.churches(id) on update restrict on delete restrict,
    version text not null check (length(btrim(version)) between 1 and 40),
    body text not null check (length(btrim(body)) > 0),
    body_sha256 text not null,
    is_current boolean not null default false,
    published_at timestamptz not null default now(),
    published_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict,
    replaced_at timestamptz
  );
  create unique index v39_privacy_policy_versions_ver on app.v39_privacy_policy_versions (coalesce(church_id, '00000000-0000-0000-0000-000000000000'::uuid), version);
  create unique index v39_privacy_policy_versions_cur on app.v39_privacy_policy_versions (coalesce(church_id, '00000000-0000-0000-0000-000000000000'::uuid)) where is_current;
  alter table app.v39_privacy_policy_versions enable row level security;
  revoke all on app.v39_privacy_policy_versions from public, anon, authenticated;

  -- texto e hash nao mudam depois de publicados (so is_current/replaced_at)
  create function private.v39_privacy_versions_guard() returns trigger
  language plpgsql set search_path = pg_catalog, app, private as $f$
  begin
    if tg_op = 'DELETE' then raise exception 'PRIVACY_VERSION_IMMUTABLE'; end if;
    if new.body is distinct from old.body or new.version is distinct from old.version
       or new.body_sha256 is distinct from old.body_sha256 or new.church_id is distinct from old.church_id then
      raise exception 'PRIVACY_VERSION_IMMUTABLE';
    end if;
    return new;
  end $f$;
  create trigger v39_privacy_versions_guard before update or delete on app.v39_privacy_policy_versions
    for each row execute function private.v39_privacy_versions_guard();

  -- gate comum: conta ativa + acesso ativo a igreja (church_id do navegador nao autoriza)
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

  create function private.v39_privacy_current(p_church_id uuid) returns app.v39_privacy_policy_versions
  language sql stable security definer set search_path = pg_catalog, app, private as $f$
    select v.* from app.v39_privacy_policy_versions v
     where v.is_current and (v.church_id = p_church_id or v.church_id is null)
     order by v.church_id nulls last limit 1
  $f$;

  create function private.v39_privacy_purpose(p_church_id uuid) returns uuid
  language plpgsql security definer set search_path = pg_catalog, app, private as $f$
  declare v uuid;
  begin
    select id into v from app.processing_purposes
     where code = 'privacy_policy' and is_active and (church_id = p_church_id or church_id is null)
     order by church_id nulls last limit 1;
    if v is null then
      insert into app.processing_purposes (church_id, code, name, description, requires_consent, is_system, is_active, valid_from)
      values (p_church_id, 'privacy_policy', 'Politica de Privacidade', 'Aceite da politica de privacidade do 2Gather', true, true, true, current_date)
      returning id into v;
    end if;
    return v;
  end $f$;

  -- grava o aceite (usado pelo usuario logado e pelo cadastro publico)
  create function private.v39_privacy_grant(p_church_id uuid, p_person uuid, p_ver app.v39_privacy_policy_versions,
                                            p_channel text, p_actor uuid, p_evidence text) returns uuid
  language plpgsql security definer set search_path = pg_catalog, app, private as $f$
  declare v_purpose uuid := private.v39_privacy_purpose(p_church_id); v_new uuid; v_old uuid[]; o record;
  begin
    -- indice person_consents_active_unique_idx: so 1 'granted' por pessoa/finalidade.
    -- O FK replaced_by nao e deferivel: o anterior passa por 'expired' (valid_until) e depois vira 'replaced'.
    select array_agg(id) into v_old from app.person_consents
     where church_id = p_church_id and person_id = p_person and purpose_id = v_purpose and status = 'granted';
    update app.person_consents set status = 'expired', valid_until = greatest(now(), granted_at) where id = any (coalesce(v_old, '{}'));
    insert into app.person_consents (church_id, person_id, purpose_id, status, term_version, term_text_snapshot,
                                     granted_by_person_id, granted_at, collection_channel, evidence_reference, recorded_by_user_account_id)
    values (p_church_id, p_person, v_purpose, 'granted', p_ver.version, 'sha256:' || p_ver.body_sha256,
            p_person, now(), p_channel, p_evidence, p_actor)
    returning id into v_new;
    insert into app.person_consent_history (consent_id, church_id, person_id, action, previous_status, new_status, performed_by_user_account_id, metadata)
    values (v_new, p_church_id, p_person, 'granted', null, 'granted', p_actor, jsonb_build_object('version', p_ver.version, 'channel', p_channel));
    for o in select id from app.person_consents where id = any (coalesce(v_old, '{}'))
    loop
      update app.person_consents set status = 'replaced', replaced_by_consent_id = v_new where id = o.id;
      insert into app.person_consent_history (consent_id, church_id, person_id, action, previous_status, new_status, performed_by_user_account_id, metadata)
      values (o.id, p_church_id, p_person, 'replaced', 'granted', 'replaced', p_actor, jsonb_build_object('replaced_by', v_new));
    end loop;
    return v_new;
  end $f$;

  -- (a) texto vigente para quem esta logado (Configuracoes > Politica)
  create function app.v39_privacy_policy_current(p_church_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
  declare v app.v39_privacy_policy_versions;
  begin
    perform private.v39_lgpd_me(p_church_id);
    v := private.v39_privacy_current(p_church_id);
    if v.id is null then return jsonb_build_object('ok', true, 'versao', null, 'texto', ''); end if;
    return jsonb_build_object('ok', true, 'versao', v.version, 'texto', v.body, 'hash', v.body_sha256, 'publicadaEm', v.published_at);
  end $f$;

  -- (b) publicar nova versao (Master: privacy.manage). Nova versao obriga novo aceite de todos.
  create function app.v39_privacy_policy_publish(p_church_id uuid, p_version text, p_text text) returns jsonb
  language plpgsql security definer set search_path = pg_catalog, app, private as $f$
  declare v_me uuid := private.v39_lgpd_need(p_church_id, 'privacy.manage'); v_id uuid;
  begin
    if nullif(btrim(p_version), '') is null or nullif(btrim(p_text), '') is null then
      perform app.raise_domain_error('PRIVACY_TEXT_REQUIRED', 'Informe versao e texto');
    end if;
    if exists (select 1 from app.v39_privacy_policy_versions where church_id = p_church_id and version = btrim(p_version)) then
      perform app.raise_domain_error('PRIVACY_VERSION_EXISTS', 'Versao ja publicada');
    end if;
    update app.v39_privacy_policy_versions set is_current = false, replaced_at = now() where church_id = p_church_id and is_current;
    insert into app.v39_privacy_policy_versions (church_id, version, body, body_sha256, is_current, published_by_user_account_id)
    values (p_church_id, btrim(p_version), p_text, encode(extensions.digest(p_text, 'sha256'), 'hex'), true, v_me)
    returning id into v_id;
    insert into audit.events (church_id, actor_user_account_id, action, entity_schema, entity_name, entity_id, event_category, sensitivity, outcome, source, metadata)
    values (p_church_id, v_me, 'privacy_policy_published', 'app', 'v39_privacy_policy_versions', v_id::text, 'privacy', 'standard', 'success', 'rpc', jsonb_build_object('version', btrim(p_version)));
    return jsonb_build_object('ok', true, 'versao', btrim(p_version));
  end $f$;

  -- (c) situacao do aceite do usuario logado
  create function app.v39_privacy_my_status(p_church_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
  declare v_me uuid := private.v39_lgpd_me(p_church_id); v_person uuid; v app.v39_privacy_policy_versions; c record;
  begin
    select person_id into v_person from app.user_accounts where id = v_me;
    v := private.v39_privacy_current(p_church_id);
    select pc.granted_at, pc.term_version into c from app.person_consents pc join app.processing_purposes pp on pp.id = pc.purpose_id and pp.code = 'privacy_policy'
     where pc.church_id = p_church_id and pc.person_id = v_person and pc.status = 'granted' order by pc.granted_at desc limit 1;
    return jsonb_build_object('ok', true,
      'consent', case when v.id is null then null else (c.term_version is not null and c.term_version = v.version) end,
      'consentEm', c.granted_at, 'politicaV', c.term_version, 'versaoVigente', v.version);
  end $f$;

  -- (d) aceitar (somente a propria pessoa; p_version tem que ser a vigente)
  create function app.v39_privacy_accept(p_church_id uuid, p_version text) returns jsonb
  language plpgsql security definer set search_path = pg_catalog, app, private as $f$
  declare v_me uuid := private.v39_lgpd_me(p_church_id); v_person uuid; v app.v39_privacy_policy_versions; v_id uuid;
  begin
    select person_id into v_person from app.user_accounts where id = v_me;
    if v_person is null then perform app.raise_domain_error('PERSON_NOT_LINKED', 'Conta sem pessoa ligada'); end if;
    v := private.v39_privacy_current(p_church_id);
    if v.id is null then perform app.raise_domain_error('PRIVACY_POLICY_MISSING', 'Nenhuma politica publicada'); end if;
    if p_version is distinct from v.version then perform app.raise_domain_error('PRIVACY_VERSION_NOT_CURRENT', 'A politica foi atualizada. Leia de novo.'); end if;
    v_id := private.v39_privacy_grant(p_church_id, v_person, v, 'frontend_v39', v_me, null);
    insert into audit.events (church_id, actor_user_account_id, actor_person_id, action, entity_schema, entity_name, entity_id, event_category, sensitivity, outcome, source, metadata)
    values (p_church_id, v_me, v_person, 'privacy_policy_accepted', 'app', 'person_consents', v_id::text, 'privacy', 'personal', 'success', 'rpc', jsonb_build_object('version', v.version));
    return jsonb_build_object('ok', true, 'consentEm', now(), 'politicaV', v.version);
  end $f$;

  -- (e) Edge "auth" (service_role): texto publico para a tela de cadastro
  create function app.edge_privacy_policy_public(p_church_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
  declare v app.v39_privacy_policy_versions := private.v39_privacy_current(p_church_id);
  begin
    return jsonb_build_object('ok', true, 'versao', v.version, 'texto', coalesce(v.body, ''));
  end $f$;

  -- (f) Edge "auth" (service_role): aceite do cadastro publico, logo apos edge_create_access_request
  create function app.edge_record_signup_consent(p_access_request_id uuid, p_term_version text, p_fingerprint text default null) returns jsonb
  language plpgsql security definer set search_path = pg_catalog, app, private as $f$
  declare ar app.access_requests; v app.v39_privacy_policy_versions; v_id uuid;
  begin
    select * into ar from app.access_requests where id = p_access_request_id;
    if ar.id is null or ar.status not in ('pending', 'under_review', 'correction_requested') then
      perform app.raise_domain_error('PENDING_REQUEST_NOT_FOUND', 'Pedido nao encontrado');
    end if;
    v := private.v39_privacy_current(ar.church_id);
    if v.id is null then perform app.raise_domain_error('PRIVACY_POLICY_MISSING', 'Nenhuma politica publicada'); end if;
    if p_term_version is distinct from v.version then perform app.raise_domain_error('PRIVACY_VERSION_NOT_CURRENT', 'Versao da politica desatualizada'); end if;
    v_id := private.v39_privacy_grant(ar.church_id, ar.person_id, v, 'public_signup', null, nullif(left(p_fingerprint, 64), ''));
    insert into audit.events (church_id, actor_person_id, action, entity_schema, entity_name, entity_id, event_category, sensitivity, outcome, source, metadata)
    values (ar.church_id, ar.person_id, 'privacy_policy_accepted_signup', 'app', 'access_requests', ar.id::text, 'privacy', 'personal', 'success', 'edge_auth', jsonb_build_object('version', v.version));
    return jsonb_build_object('ok', true, 'consent_id', v_id);
  end $f$;

  revoke all on function private.v39_privacy_versions_guard(), private.v39_lgpd_me(uuid), private.v39_lgpd_need(uuid,text),
    private.v39_privacy_current(uuid), private.v39_privacy_purpose(uuid),
    private.v39_privacy_grant(uuid,uuid,app.v39_privacy_policy_versions,text,uuid,text) from public, anon, authenticated;
  revoke all on function app.v39_privacy_policy_current(uuid), app.v39_privacy_policy_publish(uuid,text,text),
    app.v39_privacy_my_status(uuid), app.v39_privacy_accept(uuid,text),
    app.edge_privacy_policy_public(uuid), app.edge_record_signup_consent(uuid,text,text) from public, anon;
  grant execute on function app.v39_privacy_policy_current(uuid), app.v39_privacy_policy_publish(uuid,text,text),
    app.v39_privacy_my_status(uuid), app.v39_privacy_accept(uuid,text) to authenticated;
  revoke all on function app.edge_privacy_policy_public(uuid), app.edge_record_signup_consent(uuid,text,text) from authenticated;
  grant execute on function app.edge_privacy_policy_public(uuid), app.edge_record_signup_consent(uuid,text,text) to service_role;

  -- -------------------------------------------------------------------
  -- 2. DADOS FICTICIOS (2 igrejas, master, discipulo, usuario de outra igreja, suspenso)
  -- -------------------------------------------------------------------
  select id into v_master from app.access_profiles where code = 'master' and is_active;
  select id into v_disc from app.access_profiles where code = 'disciple' and is_active;
  insert into app.churches (id, name, slug) values (v_ch1, 'Igreja Teste B63 A', 'teste-b63-a-' || left(v_ch1::text, 8)), (v_ch2, 'Igreja Teste B63 B', 'teste-b63-b-' || left(v_ch2::text, 8));
  insert into auth.users (id, email) values (v_au_m, 'b63m@teste.invalid'), (v_au_d, 'b63d@teste.invalid'), (v_au_x, 'b63x@teste.invalid'), (v_au_s, 'b63s@teste.invalid');
  insert into app.people (full_name) values ('Teste B63 Master') returning id into v_p_m;
  insert into app.people (full_name) values ('Teste B63 Discipulo') returning id into v_p_d;
  insert into app.people (full_name) values ('Teste B63 Outra Igreja') returning id into v_p_x;
  insert into app.people (full_name) values ('Teste B63 Suspenso') returning id into v_p_s;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_m, v_p_m, 'active', now(), 'tb63m') returning id into v_ua_m;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_d, v_p_d, 'active', now(), 'tb63d') returning id into v_ua_d;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_x, v_p_x, 'active', now(), 'tb63x') returning id into v_ua_x;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_s, v_p_s, 'active', now(), 'tb63s') returning id into v_ua_s;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch1, v_ua_m, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_master, true, now() - interval '1 day');
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch1, v_ua_d, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_disc, true, now() - interval '1 day');
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch2, v_ua_x, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_master, true, now() - interval '1 day');
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch1, v_ua_s, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_disc, true, now() - interval '1 day');
  update app.user_accounts set status = 'suspended', suspended_at = now() where id = v_ua_s;

  -- -------------------------------------------------------------------
  -- 3. TESTES
  -- -------------------------------------------------------------------
  -- T1 master publica v1
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  r := app.v39_privacy_policy_publish(v_ch1, '2026.1', 'Texto ficticio da politica v1');
  if r->>'versao' <> '2026.1' then raise exception 'FALHOU T1: %', r; end if;
  v_res := v_res || 'T1 ok; ';

  -- T2 discipulo NAO publica
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_d, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_d::text, true);
  begin
    perform app.v39_privacy_policy_publish(v_ch1, '2026.9', 'x');
    raise exception 'FALHOU T2: discipulo publicou';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PERMISSION_DENIED' then raise exception 'FALHOU T2: erro inesperado %', sqlerrm; end if;
  end;
  v_res := v_res || 'T2 ok; ';

  -- T3 discipulo le o texto vigente; T4 status = false (ainda nao aceitou)
  r := app.v39_privacy_policy_current(v_ch1);
  if r->>'versao' <> '2026.1' or r->>'texto' not like 'Texto ficticio%' then raise exception 'FALHOU T3: %', r; end if;
  r := app.v39_privacy_my_status(v_ch1);
  if (r->>'consent')::boolean is distinct from false then raise exception 'FALHOU T4: %', r; end if;
  v_res := v_res || 'T3 ok; T4 ok; ';

  -- T5 aceite com versao errada -> PRIVACY_VERSION_NOT_CURRENT
  begin
    perform app.v39_privacy_accept(v_ch1, '2025.0');
    raise exception 'FALHOU T5: aceitou versao antiga';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PRIVACY_VERSION_NOT_CURRENT' then raise exception 'FALHOU T5: erro inesperado %', sqlerrm; end if;
  end;
  v_res := v_res || 'T5 ok; ';

  -- T6 aceite valido -> status true, consentimento da PROPRIA pessoa, snapshot = hash do servidor
  r := app.v39_privacy_accept(v_ch1, '2026.1');
  r := app.v39_privacy_my_status(v_ch1);
  if (r->>'consent')::boolean is distinct from true or r->>'politicaV' <> '2026.1' then raise exception 'FALHOU T6: %', r; end if;
  select count(*) into v_n from app.person_consents where church_id = v_ch1 and person_id = v_p_d and status = 'granted' and term_text_snapshot like 'sha256:%' and collection_channel = 'frontend_v39';
  if v_n <> 1 then raise exception 'FALHOU T6: consentimentos=%', v_n; end if;
  v_res := v_res || 'T6 ok; ';

  -- T7 nova versao (master) -> discipulo volta a false; novo aceite substitui o anterior (status replaced)
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  perform app.v39_privacy_policy_publish(v_ch1, '2026.2', 'Texto ficticio da politica v2');
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_d, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_d::text, true);
  r := app.v39_privacy_my_status(v_ch1);
  if (r->>'consent')::boolean is distinct from false then raise exception 'FALHOU T7a: %', r; end if;
  perform app.v39_privacy_accept(v_ch1, '2026.2');
  select count(*) into v_n from app.person_consents where person_id = v_p_d and status = 'replaced' and replaced_by_consent_id is not null;
  if v_n <> 1 then raise exception 'FALHOU T7b: replaced=%', v_n; end if;
  select count(*) into v_n from app.person_consent_history where person_id = v_p_d;
  if v_n <> 3 then raise exception 'FALHOU T7c: historico=%', v_n; end if;
  v_res := v_res || 'T7 ok; ';

  -- T8 texto publicado e imutavel
  begin
    update app.v39_privacy_policy_versions set body = 'alterado' where church_id = v_ch1 and version = '2026.1';
    raise exception 'FALHOU T8: texto alterado';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PRIVACY_VERSION_IMMUTABLE' then raise exception 'FALHOU T8: erro inesperado %', sqlerrm; end if;
  end;
  v_res := v_res || 'T8 ok; ';

  -- T9 cross-tenant: usuario da igreja B chama com church_id da igreja A
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_x, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_x::text, true);
  begin
    perform app.v39_privacy_accept(v_ch1, '2026.2');
    raise exception 'FALHOU T9: aceitou em outra igreja';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'ACCESS_DENIED' then raise exception 'FALHOU T9: erro inesperado %', sqlerrm; end if;
  end;
  begin
    perform app.v39_privacy_policy_publish(v_ch1, '2026.7', 'x');
    raise exception 'FALHOU T9b: master de outra igreja publicou';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'ACCESS_DENIED' then raise exception 'FALHOU T9b: erro inesperado %', sqlerrm; end if;
  end;
  v_res := v_res || 'T9 ok; ';

  -- T10 conta suspensa nao aceita
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_s, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_s::text, true);
  begin
    perform app.v39_privacy_accept(v_ch1, '2026.2');
    raise exception 'FALHOU T10: suspenso aceitou';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'ACCESS_DENIED' then raise exception 'FALHOU T10: erro inesperado %', sqlerrm; end if;
  end;
  v_res := v_res || 'T10 ok; ';

  -- T11 anon: sem EXECUTE em nenhuma funcao nova; chamada real negada
  if has_function_privilege('anon', 'app.v39_privacy_accept(uuid,text)', 'EXECUTE')
     or has_function_privilege('anon', 'app.v39_privacy_policy_current(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'app.edge_record_signup_consent(uuid,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'app.edge_record_signup_consent(uuid,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'app.edge_privacy_policy_public(uuid)', 'EXECUTE') then
    raise exception 'FALHOU T11: privilegio indevido';
  end if;
  begin
    set local role anon;
    perform app.v39_privacy_policy_current(v_ch1);
    reset role;
    raise exception 'FALHOU T11b: anon executou';
  exception when others then
    reset role;
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU T11b: erro inesperado % %', sqlstate, sqlerrm; end if;
  end;
  v_res := v_res || 'T11 ok; ';

  -- T12 cadastro publico: pedido pendente com pessoa nova -> aceite direto na pessoa (canal public_signup)
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  insert into app.people (full_name) values ('Teste B63 Cadastro') returning id into v_p_cad;
  insert into app.access_requests (church_id, person_id, email, status, requested_username) values (v_ch1, v_p_cad, 'b63cad@teste.invalid', 'pending', 'tb63cad') returning id into v_req;
  r := app.edge_privacy_policy_public(v_ch1);
  if r->>'versao' <> '2026.2' then raise exception 'FALHOU T12a: %', r; end if;
  begin
    perform app.edge_record_signup_consent(v_req, '2026.1');
    raise exception 'FALHOU T12b: aceitou versao antiga';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PRIVACY_VERSION_NOT_CURRENT' then raise exception 'FALHOU T12b: erro inesperado %', sqlerrm; end if;
  end;
  r := app.edge_record_signup_consent(v_req, '2026.2', 'fp-ficticio');
  select count(*) into v_n from app.person_consents where person_id = v_p_cad and status = 'granted' and collection_channel = 'public_signup' and recorded_by_user_account_id is null;
  if v_n <> 1 then raise exception 'FALHOU T12c: %', v_n; end if;
  v_res := v_res || 'T12 ok; ';

  -- T13 pedido ja decidido nao recebe aceite pelo canal publico
  update app.access_requests set status = 'rejected', decided_at = now(), decided_by_user_account_id = v_ua_m, decision_reason = 'teste' where id = v_req;
  begin
    perform app.edge_record_signup_consent(v_req, '2026.2');
    raise exception 'FALHOU T13: aceitou pedido decidido';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlerrm <> 'PENDING_REQUEST_NOT_FOUND' then raise exception 'FALHOU T13: erro inesperado %', sqlerrm; end if;
  end;
  v_res := v_res || 'T13 ok; ';

  -- T14 trilha: eventos de privacidade gravados em audit.events
  select count(*) into v_n from audit.events where church_id = v_ch1 and event_category = 'privacy';
  if v_n <> 5 then raise exception 'FALHOU T14: eventos=%', v_n; end if;
  v_res := v_res || 'T14 ok (5 eventos)';

  raise exception 'TESTE B63_1 CONCLUIDO (nada foi gravado): %', v_res;
end
$t$;
