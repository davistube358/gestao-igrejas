-- =====================================================================
-- B63_3b · HOTFIX do B63_3 · funcoes com gancho de auditoria passam a VOLATILE · APLICAR
-- Build 63 · 22/11/2026
-- Problema (producao, 22/11/2026 16:11): o B63_3 colocou um INSERT de auditoria
--   (private.v39_sensitive_log) em 4 funcoes STABLE. O PostgREST executa funcao STABLE em
--   transacao somente leitura -> "cannot execute INSERT in a read-only transaction" -> HTTP 405.
--   Afetados: relatorio financeiro, prestacao de contas de convenio, foto do atendido, receita.
--   O teste do B63_3 rodou direto no banco (transacao de escrita) e nao pegou o caso.
-- Correcao: ALTER FUNCTION ... VOLATILE nas 4. Corpo, assinatura, retorno, search_path e grants
--   NAO mudam. So a volatilidade.
-- Teste: B63_3b_ganchos_volatile_teste_rollback.sql
-- Reverter: B63_3b_ganchos_volatile_reverter.sql (volta a STABLE e, com o gancho, volta o 405;
--   so faz sentido junto com o B63_3_auditoria_reverter.sql, que recria as originais STABLE).
-- Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

do $g$
begin
  if (select count(*) from pg_proc
       where oid in ('app.v39_inst_patient_photo(uuid,uuid)'::regprocedure, 'app.v39_est_prescription(uuid,jsonb)'::regprocedure,
                     'app.v39_fin_grant_report(uuid,uuid,date,date)'::regprocedure, 'app.v39_fin_report(uuid,integer,integer)'::regprocedure)
         and prosrc like '%-- B63_HOOK%') <> 4 then
    raise exception 'B63_3b ABORTADO: as 4 funcoes nao estao com o gancho do B63_3. Nada foi alterado.';
  end if;
end $g$;

alter function app.v39_inst_patient_photo(uuid,uuid) volatile;
alter function app.v39_est_prescription(uuid,jsonb) volatile;
alter function app.v39_fin_grant_report(uuid,uuid,date,date) volatile;
alter function app.v39_fin_report(uuid,integer,integer) volatile;

commit;

-- VERIFICACAO (tudo deve ser true)
select
  (select count(*) = 4 from pg_proc
    where oid in ('app.v39_inst_patient_photo(uuid,uuid)'::regprocedure, 'app.v39_est_prescription(uuid,jsonb)'::regprocedure,
                  'app.v39_fin_grant_report(uuid,uuid,date,date)'::regprocedure, 'app.v39_fin_report(uuid,integer,integer)'::regprocedure)
      and provolatile = 'v' and prosrc like '%-- B63_HOOK%') as quatro_volatile_com_gancho,
  has_function_privilege('authenticated', 'app.v39_fin_report(uuid,integer,integer)', 'EXECUTE') as fin_report_executavel;
