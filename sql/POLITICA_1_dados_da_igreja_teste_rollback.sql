-- =====================================================================
-- POLITICA_1 · política com os dados do cadastro da igreja · TESTE COM ROLLBACK
-- ULTIMA EXECUCAO (22/11/2026, conector Supabase da conta, projeto kybrwsxvdbwjtwakczyj, pelo Claude):
--   ERROR P0001: TESTE POLITICA_1 CONCLUIDO (nada foi gravado): T1 ok; T2 ok; T3 ok; T4 ok; T5 ok (REVERTER ok)
-- Gerado a partir do _aplicar e do _reverter (corpo identico, sem begin/commit/notify), com dados ficticios.
-- Casos:
--   T1  texto exibido (v39_privacy_policy_current, como authenticated) troca CNPJ, e-mail e endereço montado;
--       campo vazio vira "[a preencher no cadastro da igreja]"; 'modelo' mantém os marcadores; hash e versão iguais
--   T2  Edge pública (edge_privacy_policy_public) devolve o mesmo texto preenchido
--   T3  atualizar o cadastro da igreja muda o texto exibido sem nova versão
--   T4  texto sem marcadores sai idêntico
--   T5  REVERTER: corpo das 2 funções com md5 do B63_1 e render removida
-- NAO GRAVA NADA: tudo e desfeito pelo raise final.
-- =====================================================================
do $t$
declare
  v_ch uuid := gen_random_uuid(); v_au uuid := gen_random_uuid(); v_p uuid; v_ua uuid; v_cua uuid; v_master uuid;
  c_body constant text := 'Igreja {{IGREJA_NOME}} CNPJ {{IGREJA_CNPJ}} End {{IGREJA_ENDERECO}} Enc {{ENCARREGADO_NOME}} <{{ENCARREGADO_EMAIL}}>';
  r jsonb; t text; v_res text := '';
begin
  -- APLICAR (identico ao _aplicar, sem begin/commit)

do $g$
begin
  if (select md5(prosrc) from pg_proc where oid = 'app.v39_privacy_policy_current(uuid)'::regprocedure) is distinct from '0be0aa4a04ed5ec198fde250a9cfc93f'
     or (select md5(prosrc) from pg_proc where oid = 'app.edge_privacy_policy_public(uuid)'::regprocedure) is distinct from '37d9c53c63b40783fb396cd8cda8f94a' then
    raise exception 'POLITICA_1 ABORTADO: funcoes da politica diferentes das do B63_1. Nada foi alterado.';
  end if;
end $g$;

create or replace function private.v39_privacy_render(p_church_id uuid, p_body text) returns text
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare c app.churches; a jsonb; t text := coalesce(p_body, ''); f text := '[a preencher no cadastro da igreja]'; v_end text;
begin
  if position('{{' in t) = 0 then return t; end if;
  select * into c from app.churches where id = p_church_id;
  a := coalesce(c.legal_address, '{}'::jsonb);
  v_end := nullif(concat_ws(', ',
             nullif(btrim(concat_ws(', ', nullif(btrim(a->>'rua'), ''), nullif(btrim(a->>'numero'), ''))), ''),
             nullif(btrim(a->>'complemento'), ''),
             nullif(btrim(a->>'bairro'), ''),
             nullif(btrim(concat_ws(' - ', nullif(btrim(a->>'cidade'), ''), nullif(btrim(a->>'uf'), ''))), ''),
             case when nullif(btrim(a->>'cep'), '') is not null then 'CEP ' || btrim(a->>'cep') end), '');
  t := replace(t, '{{IGREJA_NOME}}', coalesce(nullif(btrim(c.legal_name), ''), nullif(btrim(c.name), ''), f));
  t := replace(t, '{{IGREJA_CNPJ}}', coalesce(nullif(btrim(c.cnpj), ''), f));
  t := replace(t, '{{IGREJA_ENDERECO}}', coalesce(v_end, f));
  t := replace(t, '{{ENCARREGADO_NOME}}', coalesce(nullif(btrim(c.responsible_name), ''), f));
  t := replace(t, '{{ENCARREGADO_EMAIL}}', coalesce(nullif(btrim(c.responsible_email), ''), f));
  t := replace(t, '{{ENCARREGADO_TELEFONE}}', coalesce(nullif(btrim(c.responsible_phone), ''), f));
  return t;
end $f$;
revoke all on function private.v39_privacy_render(uuid,text) from public, anon, authenticated;

create or replace function app.v39_privacy_policy_current(p_church_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare v app.v39_privacy_policy_versions;
begin
  perform private.v39_lgpd_me(p_church_id);
  v := private.v39_privacy_current(p_church_id);
  if v.id is null then return jsonb_build_object('ok', true, 'versao', null, 'texto', '', 'modelo', ''); end if;
  return jsonb_build_object('ok', true, 'versao', v.version, 'texto', private.v39_privacy_render(p_church_id, v.body), 'modelo', v.body,
                            'hash', v.body_sha256, 'publicadaEm', v.published_at);
end $f$;

create or replace function app.edge_privacy_policy_public(p_church_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare v app.v39_privacy_policy_versions := private.v39_privacy_current(p_church_id);
begin
  return jsonb_build_object('ok', true, 'versao', v.version, 'texto', coalesce(private.v39_privacy_render(p_church_id, v.body), ''));
end $f$;


  select id into v_master from app.access_profiles where code = 'master' and is_active;
  insert into app.churches (id, name, legal_name, slug, timezone, cnpj, responsible_email, legal_address)
  values (v_ch, 'Igreja Teste POL1', 'Associacao Teste POL1', 'teste-pol1-' || left(v_ch::text, 8), 'America/Sao_Paulo', '00.000.000/0001-91', 'dpo@teste.invalid',
          jsonb_build_object('rua', 'Rua A', 'numero', '10', 'complemento', '', 'bairro', 'Centro', 'cidade', 'Matao', 'uf', 'SP', 'cep', '15990-000'));
  insert into auth.users (id, email) values (v_au, 'pol1@teste.invalid');
  insert into app.people (full_name) values ('POL1 Master') returning id into v_p;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au, v_p, 'active', now(), 'tpol1') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_master, true, now() - interval '1 day');
  insert into app.v39_privacy_policy_versions (church_id, version, body, body_sha256, is_current)
  values (v_ch, '1', c_body, encode(extensions.digest(c_body, 'sha256'), 'hex'), true);

  perform set_config('request.jwt.claims', json_build_object('sub', v_au, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au::text, true);
  begin
    set local role authenticated; r := app.v39_privacy_policy_current(v_ch); reset role;
  exception when others then reset role; raise exception 'FALHOU T1: % %', sqlstate, sqlerrm;
  end;
  t := r->>'texto';
  if t <> 'Igreja Associacao Teste POL1 CNPJ 00.000.000/0001-91 End Rua A, 10, Centro, Matao - SP, CEP 15990-000 Enc [a preencher no cadastro da igreja] <dpo@teste.invalid>' then
    raise exception 'FALHOU T1a: %', t;
  end if;
  if r->>'modelo' <> c_body or r->>'versao' <> '1' or r->>'hash' <> encode(extensions.digest(c_body, 'sha256'), 'hex') then raise exception 'FALHOU T1b: %', r; end if;
  v_res := v_res || 'T1 ok; ';

  r := app.edge_privacy_policy_public(v_ch);
  if r->>'texto' <> t then raise exception 'FALHOU T2: %', r; end if;
  v_res := v_res || 'T2 ok; ';

  update app.churches set responsible_name = 'Fulano Encarregado' where id = v_ch;
  if position('Enc Fulano Encarregado <dpo@teste.invalid>' in (app.edge_privacy_policy_public(v_ch)->>'texto')) = 0 then raise exception 'FALHOU T3'; end if;
  v_res := v_res || 'T3 ok; ';

  if private.v39_privacy_render(v_ch, 'Sem marcadores aqui.') <> 'Sem marcadores aqui.' then raise exception 'FALHOU T4'; end if;
  v_res := v_res || 'T4 ok; ';

  -- REVERTER (identico ao _reverter, sem begin/commit)

create or replace function app.v39_privacy_policy_current(p_church_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare v app.v39_privacy_policy_versions;
begin
  perform private.v39_lgpd_me(p_church_id);
  v := private.v39_privacy_current(p_church_id);
  if v.id is null then return jsonb_build_object('ok', true, 'versao', null, 'texto', ''); end if;
  return jsonb_build_object('ok', true, 'versao', v.version, 'texto', v.body, 'hash', v.body_sha256, 'publicadaEm', v.published_at);
end $f$;

create or replace function app.edge_privacy_policy_public(p_church_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare v app.v39_privacy_policy_versions := private.v39_privacy_current(p_church_id);
begin
  return jsonb_build_object('ok', true, 'versao', v.version, 'texto', coalesce(v.body, ''));
end $f$;

drop function if exists private.v39_privacy_render(uuid,text);

  if (select md5(prosrc) from pg_proc where oid = 'app.v39_privacy_policy_current(uuid)'::regprocedure) is distinct from '0be0aa4a04ed5ec198fde250a9cfc93f'
     or (select md5(prosrc) from pg_proc where oid = 'app.edge_privacy_policy_public(uuid)'::regprocedure) is distinct from '37d9c53c63b40783fb396cd8cda8f94a'
     or to_regprocedure('private.v39_privacy_render(uuid,text)') is not null then
    raise exception 'FALHOU T5: reverter diferente do B63_1';
  end if;
  v_res := v_res || 'T5 ok (REVERTER ok)';

  raise exception 'TESTE POLITICA_1 CONCLUIDO (nada foi gravado): %', v_res;
end
$t$;
