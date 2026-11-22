-- =====================================================================
-- POLITICA_1 · política de privacidade com os dados do cadastro da igreja · APLICAR
-- 22/11/2026 · DATA · pedido do Diogo: ligar a política aos campos do cadastro da igreja (atualizados depois)
-- VALIDACAO: ver cabecalho de POLITICA_1_dados_da_igreja_teste_rollback.sql
-- ---------------------------------------------------------------------
-- A versão publicada (app.v39_privacy_policy_versions.body) continua imutável e guarda o MODELO, com marcadores.
-- Na hora de mostrar, private.v39_privacy_render troca os marcadores pelos dados de app.churches:
--   {{IGREJA_NOME}}           legal_name (ou name)
--   {{IGREJA_CNPJ}}           cnpj
--   {{IGREJA_ENDERECO}}       legal_address (rua, número, complemento, bairro, cidade - UF, CEP)
--   {{ENCARREGADO_NOME}}      responsible_name
--   {{ENCARREGADO_EMAIL}}     responsible_email
--   {{ENCARREGADO_TELEFONE}}  responsible_phone
--   Campo vazio -> "[a preencher no cadastro da igreja]". Esses campos são editados em Financeiro › Entidades
--   (app.v39_fin_entity_save). Atualizar o cadastro muda o texto exibido sem publicar nova versão.
-- Funções existentes alteradas (create or replace; assinatura, retorno, volatilidade e grants iguais):
--   app.v39_privacy_policy_current (md5 do corpo 0be0aa4a...): 'texto' preenchido + 'modelo' (com marcadores).
--   app.edge_privacy_policy_public (md5 do corpo 37d9c53c...): 'texto' preenchido.
-- Reverter: POLITICA_1_dados_da_igreja_reverter.sql.
-- Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

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

commit;

notify pgrst, 'reload schema';

-- VERIFICACAO (tudo deve ser true)
select
  (select prosrc like '%v39_privacy_render%' from pg_proc where oid = 'app.v39_privacy_policy_current(uuid)'::regprocedure) as atual_ok,
  (select prosrc like '%v39_privacy_render%' from pg_proc where oid = 'app.edge_privacy_policy_public(uuid)'::regprocedure) as edge_ok,
  (select proacl::text = '{postgres=X/postgres,authenticated=X/postgres}' from pg_proc where oid = 'app.v39_privacy_policy_current(uuid)'::regprocedure)
    and (select proacl::text = '{postgres=X/postgres,service_role=X/postgres}' from pg_proc where oid = 'app.edge_privacy_policy_public(uuid)'::regprocedure) as grants_ok,
  not has_function_privilege('authenticated', 'private.v39_privacy_render(uuid,text)', 'EXECUTE') as render_fechada;
