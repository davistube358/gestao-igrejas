-- =====================================================================
-- B63_9 · LGPD · Revogar EXECUTE das 2 funcoes antigas e inseguras · APLICAR
-- Build 63 · DATA-63b · decisao do PO D4 (22/11/2026)
--
-- >>> APLICAR SO DEPOIS QUE O FRONT V39 PARAR DE CHAMA-LAS (e depois de B63_1 e B63_2 publicados). <<<
--
-- VALIDACAO (22/11/2026, MCP execute_sql, aplicar + reverter dentro de do $t$):
--   ERROR P0001: TESTE APLICAR B63_9 OK (nada foi gravado): aplicar ok (authenticated sem EXECUTE;
--   chamada real negada 42501; nenhuma funcao do banco as chama); reverter ok (ACL identica a
--   original: {postgres=X/postgres,authenticated=X/postgres})
-- ---------------------------------------------------------------------
-- Funcoes (existentes; NAO sao alteradas nem apagadas, so perdem o EXECUTE de authenticated):
--   app.v39_accept_privacy_policy(uuid,uuid,text,text)   aceita por qualquer pessoa; quebra no 2o aceite
--   app.v39_request_person_anonymization(uuid,uuid,text) qualquer usuario cria pedido para qualquer pessoa
--   Substitutas: app.v39_privacy_accept (B63_1) e app.v39_privacy_request_create (B63_2).
-- ACL antes (22/11/2026): {postgres=X/postgres,authenticated=X/postgres} nas duas.
-- Conferencia no front ANTES de aplicar (deve voltar vazio; em 22/11/2026 voltou vazio, exit 1):
--   grep -rn "v39_accept_privacy_policy\|v39_request_person_anonymization" v39/ --include=*.js --include=*.html
-- Conferencia no banco (nenhuma outra funcao as chama; esperado 0 linhas):
--   select p.oid::regprocedure from pg_proc p
--    where p.prosrc ~ '(v39_accept_privacy_policy|v39_request_person_anonymization)'
--      and p.proname not in ('v39_accept_privacy_policy','v39_request_person_anonymization');
-- Pode aplicar antes do front? NAO.
-- Reverter: B63_9_revogar_funcoes_antigas_reverter.sql (devolve o EXECUTE a authenticated).
-- =====================================================================
begin;

revoke execute on function app.v39_accept_privacy_policy(uuid,uuid,text,text) from public, anon, authenticated;
revoke execute on function app.v39_request_person_anonymization(uuid,uuid,text) from public, anon, authenticated;

commit;

-- VERIFICACAO (tudo deve ser true)
select
  not has_function_privilege('authenticated', 'app.v39_accept_privacy_policy(uuid,uuid,text,text)', 'EXECUTE') as aceite_antigo_fechado,
  not has_function_privilege('authenticated', 'app.v39_request_person_anonymization(uuid,uuid,text)', 'EXECUTE') as pedido_antigo_fechado,
  not has_function_privilege('anon', 'app.v39_accept_privacy_policy(uuid,uuid,text,text)', 'EXECUTE')
    and not has_function_privilege('anon', 'app.v39_request_person_anonymization(uuid,uuid,text)', 'EXECUTE') as anon_fechado,
  (select count(*) = 0 from pg_proc p where p.prosrc ~ '(v39_accept_privacy_policy|v39_request_person_anonymization)'
     and p.proname not in ('v39_accept_privacy_policy','v39_request_person_anonymization')) as ninguem_chama_no_banco;
