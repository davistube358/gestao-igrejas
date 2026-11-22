-- =====================================================================
-- B63_9 · Revogar funcoes antigas · REVERTER
-- Build 63 · DATA-63b
-- VALIDACAO: ver o topo de B63_9_revogar_funcoes_antigas_aplicar.sql (mesmo bloco de teste).
-- ---------------------------------------------------------------------
-- Devolve o EXECUTE de authenticated as 2 funcoes antigas, voltando a ACL de 22/11/2026:
--   {postgres=X/postgres,authenticated=X/postgres}. Nada mais muda.
-- =====================================================================
begin;

grant execute on function app.v39_accept_privacy_policy(uuid,uuid,text,text) to authenticated;
grant execute on function app.v39_request_person_anonymization(uuid,uuid,text) to authenticated;

commit;

-- VERIFICACAO (tudo deve ser true)
select
  (select proacl::text from pg_proc where oid = 'app.v39_accept_privacy_policy(uuid,uuid,text,text)'::regprocedure) = '{postgres=X/postgres,authenticated=X/postgres}' as aceite_acl_original,
  (select proacl::text from pg_proc where oid = 'app.v39_request_person_anonymization(uuid,uuid,text)'::regprocedure) = '{postgres=X/postgres,authenticated=X/postgres}' as pedido_acl_original;
