-- =====================================================================
-- B63_1 · LGPD · Aceite da Politica de Privacidade · APLICAR
-- Build 63 · DATA-63b · decisoes do PO D1, D1b, D2, D3 (22/11/2026)
-- VALIDACAO (22/11/2026, MCP execute_sql, conteudo deste arquivo dentro de do $t$, sem begin/commit):
--   ERROR P0001: TESTE APLICAR B63_1 OK (nada foi gravado): V0 ok; casos C1-C9 ok (publicar,
--   negar discipulo, aceite e substituicao, cross-tenant, anon, cadastro atomico, versao errada
--   desfaz, reverter aborta com dados); REVERTER ok: catalogo de funcoes e tabelas
--   (app/private/audit) identico ao original
-- ---------------------------------------------------------------------
-- Objetivo: texto da politica no Supabase (versoes imutaveis, hash), aceite do usuario logado
--   (so a propria pessoa), situacao do aceite para o login e aceite do cadastro publico gravado
--   na pessoa criada pelo cadastro, de forma atomica (edge_create_access_request_with_consent).
-- Ordem de aplicacao do Build 63: B63_1 -> B63_3 -> B63_2  (B63_9 so depois do front; B63_4 nao aplicar)
-- Pre-requisitos: app.person_consents, app.person_consent_history, app.processing_purposes,
--   app.access_requests, app.edge_create_access_request, private.v39_fin_me, app.has_permission,
--   app.current_church_user_access_id, app.raise_domain_error, extensions.digest, audit.events.
-- Substitui funcao existente? NAO. So cria objetos novos.
-- Pode aplicar antes do front/Edge? SIM. Nada chama as funcoes novas ate o front/Edge mudarem.
--   Depois de aplicar: (1) o master publica a versao 1 da politica (v39_privacy_policy_publish,
--   pela tela de Configuracoes migrada); (2) Edge "auth": acao 'politica' e cadastro chamando
--   edge_create_access_request_with_consent; (3) front: my_status no login, modal e aceite.
--   NAO publicar o front de aceite antes de existir versao publicada (consent viria null).
-- Reverter: B63_1_aceite_politica_reverter.sql
-- Verificar depois de aplicar: bloco SELECT no fim deste arquivo (todas as colunas = true).
-- Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

create table if not exists app.v39_privacy_policy_versions (
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
create unique index if not exists v39_privacy_policy_versions_ver on app.v39_privacy_policy_versions (coalesce(church_id, '00000000-0000-0000-0000-000000000000'::uuid), version);
create unique index if not exists v39_privacy_policy_versions_cur on app.v39_privacy_policy_versions (coalesce(church_id, '00000000-0000-0000-0000-000000000000'::uuid)) where is_current;
alter table app.v39_privacy_policy_versions enable row level security;
revoke all on app.v39_privacy_policy_versions from public, anon, authenticated;

create or replace function private.v39_privacy_versions_guard() returns trigger
language plpgsql set search_path = pg_catalog, app, private as $f$
begin
  if tg_op = 'DELETE' then raise exception 'PRIVACY_VERSION_IMMUTABLE'; end if;
  if new.body is distinct from old.body or new.version is distinct from old.version
     or new.body_sha256 is distinct from old.body_sha256 or new.church_id is distinct from old.church_id then
    raise exception 'PRIVACY_VERSION_IMMUTABLE';
  end if;
  return new;
end $f$;
drop trigger if exists v39_privacy_versions_guard on app.v39_privacy_policy_versions;
create trigger v39_privacy_versions_guard before update or delete on app.v39_privacy_policy_versions
  for each row execute function private.v39_privacy_versions_guard();

-- gates comuns do Build 63 (tambem recriados, identicos, por B63_2 e B63_3)
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

create or replace function private.v39_privacy_current(p_church_id uuid) returns app.v39_privacy_policy_versions
language sql stable security definer set search_path = pg_catalog, app, private as $f$
  select v.* from app.v39_privacy_policy_versions v
   where v.is_current and (v.church_id = p_church_id or v.church_id is null)
   order by v.church_id nulls last limit 1
$f$;

create or replace function private.v39_privacy_purpose(p_church_id uuid) returns uuid
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

-- indice person_consents_active_unique_idx: 1 'granted' por pessoa/finalidade; FK replaced_by nao deferivel:
-- o anterior passa por 'expired' e depois vira 'replaced'.
create or replace function private.v39_privacy_grant(p_church_id uuid, p_person uuid, p_ver app.v39_privacy_policy_versions,
                                                     p_channel text, p_actor uuid, p_evidence text) returns uuid
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_purpose uuid := private.v39_privacy_purpose(p_church_id); v_new uuid; v_old uuid[]; o record;
begin
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

create or replace function app.v39_privacy_policy_current(p_church_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare v app.v39_privacy_policy_versions;
begin
  perform private.v39_lgpd_me(p_church_id);
  v := private.v39_privacy_current(p_church_id);
  if v.id is null then return jsonb_build_object('ok', true, 'versao', null, 'texto', ''); end if;
  return jsonb_build_object('ok', true, 'versao', v.version, 'texto', v.body, 'hash', v.body_sha256, 'publicadaEm', v.published_at);
end $f$;

create or replace function app.v39_privacy_policy_publish(p_church_id uuid, p_version text, p_text text) returns jsonb
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

create or replace function app.v39_privacy_my_status(p_church_id uuid) returns jsonb
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

create or replace function app.v39_privacy_accept(p_church_id uuid, p_version text) returns jsonb
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

create or replace function app.edge_privacy_policy_public(p_church_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare v app.v39_privacy_policy_versions := private.v39_privacy_current(p_church_id);
begin
  return jsonb_build_object('ok', true, 'versao', v.version, 'texto', coalesce(v.body, ''));
end $f$;

create or replace function app.edge_record_signup_consent(p_access_request_id uuid, p_term_version text, p_fingerprint text default null) returns jsonb
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

-- D1b: cadastro + aceite na mesma transacao (a Edge troca edge_create_access_request por esta)
create or replace function app.edge_create_access_request_with_consent(p_auth_user_id uuid, p_username text, p_email text, p_church_id uuid, p_full_name text,
  p_term_version text, p_whatsapp text default null, p_preferred_name text default null, p_requested_profile_code text default null,
  p_requested_gc_id uuid default null, p_notes text default null, p_fingerprint text default null) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_req jsonb; v_cons jsonb;
begin
  v_req := app.edge_create_access_request(p_auth_user_id, p_username, p_email, p_church_id, p_full_name, p_whatsapp, p_preferred_name,
                                          p_requested_profile_code, p_requested_gc_id, p_notes);
  v_cons := app.edge_record_signup_consent((v_req ->> 'request_id')::uuid, p_term_version, p_fingerprint);
  return v_req || jsonb_build_object('consent_id', v_cons ->> 'consent_id');
end $f$;

revoke all on function private.v39_privacy_versions_guard(), private.v39_lgpd_me(uuid), private.v39_lgpd_need(uuid,text),
  private.v39_privacy_current(uuid), private.v39_privacy_purpose(uuid),
  private.v39_privacy_grant(uuid,uuid,app.v39_privacy_policy_versions,text,uuid,text) from public, anon, authenticated;
revoke all on function app.v39_privacy_policy_current(uuid), app.v39_privacy_policy_publish(uuid,text,text),
  app.v39_privacy_my_status(uuid), app.v39_privacy_accept(uuid,text),
  app.edge_privacy_policy_public(uuid), app.edge_record_signup_consent(uuid,text,text),
  app.edge_create_access_request_with_consent(uuid,text,text,uuid,text,text,text,text,text,uuid,text,text) from public, anon, authenticated;
grant execute on function app.v39_privacy_policy_current(uuid), app.v39_privacy_policy_publish(uuid,text,text),
  app.v39_privacy_my_status(uuid), app.v39_privacy_accept(uuid,text) to authenticated;
grant execute on function app.edge_privacy_policy_public(uuid), app.edge_record_signup_consent(uuid,text,text),
  app.edge_create_access_request_with_consent(uuid,text,text,uuid,text,text,text,text,text,uuid,text,text) to service_role;

commit;

-- ---------------------------------------------------------------------
-- VERIFICACAO (rodar depois do commit; tudo deve ser true)
-- ---------------------------------------------------------------------
select
  to_regclass('app.v39_privacy_policy_versions') is not null as tabela_ok,
  (select relrowsecurity from pg_class where oid = 'app.v39_privacy_policy_versions'::regclass) as rls_ok,
  (select count(*) = 7 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app'
     and p.proname in ('v39_privacy_policy_current','v39_privacy_policy_publish','v39_privacy_my_status','v39_privacy_accept',
                       'edge_privacy_policy_public','edge_record_signup_consent','edge_create_access_request_with_consent')
     and p.prosecdef) as funcoes_7_security_definer,
  not has_function_privilege('anon', 'app.v39_privacy_accept(uuid,text)', 'EXECUTE') as anon_sem_execute,
  has_function_privilege('authenticated', 'app.v39_privacy_accept(uuid,text)', 'EXECUTE') as authenticated_ok,
  not has_function_privilege('authenticated', 'app.edge_create_access_request_with_consent(uuid,text,text,uuid,text,text,text,text,text,uuid,text,text)', 'EXECUTE') as edge_fechada_para_authenticated,
  has_function_privilege('service_role', 'app.edge_create_access_request_with_consent(uuid,text,text,uuid,text,text,text,text,text,uuid,text,text)', 'EXECUTE') as edge_ok_service_role,
  exists (select 1 from pg_trigger where tgname = 'v39_privacy_versions_guard') as gatilho_ok;
