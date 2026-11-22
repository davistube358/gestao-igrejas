-- =====================================================================
-- B63_1 · LGPD · Aceite da Politica · REVERTER (rollback real, pos-aplicacao)
-- Build 63 · DATA-63b
-- VALIDACAO (22/11/2026, MCP execute_sql, aplicar + reverter dentro de do $t$):
--   Mesmo bloco do aplicar: "... C9 ok (reverter aborta com dados); REVERTER ok: catalogo de
--   funcoes e tabelas (app/private/audit) identico ao original" -> TESTE APLICAR B63_1 OK (nada foi gravado)
--   (md5 de todas as funcoes [assinatura+corpo+ACL+config] e tabelas [nome+tipo+RLS+ACL]
--    de app/private/audit antes do aplicar = depois do reverter)
-- ---------------------------------------------------------------------
-- O que faz: remove as funcoes, o gatilho e a tabela criados por B63_1_aceite_politica_aplicar.sql.
-- NAO apaga dados: se app.v39_privacy_policy_versions tiver alguma versao publicada, ABORTA sem
--   remover nada. Linhas gravadas em app.person_consents, person_consent_history, audit.events e
--   a finalidade 'privacy_policy' em app.processing_purposes ficam (sao historico).
-- Os gates private.v39_lgpd_me/need so sao removidos se B63_2 e B63_3 nao estiverem aplicados.
-- Ordem de reversao do Build 63: B63_9 -> B63_2 -> B63_3 -> B63_1.
-- Antes de reverter: voltar a Edge "auth" e o front para nao chamarem as funcoes novas.
-- =====================================================================
begin;

do $r$
declare v_n int;
begin
  if to_regclass('app.v39_privacy_policy_versions') is not null then
    select count(*) into v_n from app.v39_privacy_policy_versions;
    if v_n > 0 then
      raise exception 'B63_1 REVERTER ABORTADO: app.v39_privacy_policy_versions tem % versao(oes) publicada(s). Nada foi removido.', v_n;
    end if;
    drop function if exists app.edge_create_access_request_with_consent(uuid,text,text,uuid,text,text,text,text,text,uuid,text,text);
    drop function if exists app.edge_record_signup_consent(uuid,text,text);
    drop function if exists app.edge_privacy_policy_public(uuid);
    drop function if exists app.v39_privacy_accept(uuid,text);
    drop function if exists app.v39_privacy_my_status(uuid);
    drop function if exists app.v39_privacy_policy_publish(uuid,text,text);
    drop function if exists app.v39_privacy_policy_current(uuid);
    drop function if exists private.v39_privacy_grant(uuid,uuid,app.v39_privacy_policy_versions,text,uuid,text);
    drop function if exists private.v39_privacy_current(uuid);
    drop table app.v39_privacy_policy_versions;   -- vazia (conferido acima); leva junto o gatilho
  end if;
  drop function if exists private.v39_privacy_versions_guard();
  drop function if exists private.v39_privacy_purpose(uuid);
  if to_regprocedure('app.v39_audit_list(uuid,text,integer,integer,timestamptz,timestamptz)') is null
     and to_regprocedure('app.v39_privacy_anonymize_execute(uuid,uuid,text,text)') is null then
    drop function if exists private.v39_lgpd_need(uuid,text);
    drop function if exists private.v39_lgpd_me(uuid);
  end if;
end $r$;

commit;

-- VERIFICACAO (tudo deve ser true)
select
  to_regclass('app.v39_privacy_policy_versions') is null as tabela_removida,
  (select count(*) = 0 from pg_proc where proname in ('v39_privacy_policy_current','v39_privacy_policy_publish','v39_privacy_my_status','v39_privacy_accept',
     'edge_privacy_policy_public','edge_record_signup_consent','edge_create_access_request_with_consent','v39_privacy_grant','v39_privacy_current',
     'v39_privacy_purpose','v39_privacy_versions_guard')) as funcoes_removidas;
