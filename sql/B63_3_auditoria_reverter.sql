-- =====================================================================
-- B63_3 · LGPD · Auditoria · REVERTER (rollback real, pos-aplicacao)
-- Build 63 · DATA-63b
-- VALIDACAO (22/11/2026, MCP execute_sql, aplicar + reverter dentro de do $t$):
--   Mesmo bloco do aplicar: "... REVERTER ok: 4 funcoes com md5 original e catalogo (funcoes,
--   tabelas, gatilhos) identico ao original" -> TESTE APLICAR B63_3 OK (nada foi gravado)
--   (o caminho principal, remover a linha do gancho, ja devolveu o md5 original; o caminho de
--    restauracao pelo backup nao precisou ser usado no teste)
-- ---------------------------------------------------------------------
-- O que faz:
--   1) Restaura as 4 funcoes existentes alteradas pelo aplicar, removendo exatamente a linha do gancho
--      ("-- B63_HOOK") e conferindo o md5 da definicao original (revisada em 22/11/2026):
--        app.v39_inst_patient_photo(uuid,uuid)          0d8d9e8bd05b718e04f6c7a0f71c840f
--        app.v39_est_prescription(uuid,jsonb)           22338475688e9c5e2f3ea8251118a373
--        app.v39_fin_grant_report(uuid,uuid,date,date)  c0e37d62675446f1752d7b443cdc3425
--        app.v39_fin_report(uuid,integer,integer)       b19f1f457657e9502d5fa59b3996e7f1
--      Se o md5 nao bater, restaura a definicao original guardada pelo aplicar em
--      app.v39_function_backups (function_name 'B63_3:<assinatura>') e confere de novo; se ainda
--      divergir, ABORTA sem mudar nada.
--      Por que a definicao original nao esta colada aqui: os corpos originais tem quebras de linha
--      CRLF e somam ~19 mil caracteres; copiar a mao arrisca alterar bytes. A copia byte a byte fica
--      em app.v39_function_backups e a conferencia e por md5. Para ver o original:
--        select definition from app.v39_function_backups where function_name like 'B63_3:%' order by saved_at desc;
--   2) Remove gatilho/funcao do prontuario, app.v39_audit_list e os helpers de log.
--   NAO apaga dados: linhas de audit.events, sensitive_data_access_log e os backups ficam (historico).
--   Os gates private.v39_lgpd_me/need so saem se B63_1 e B63_2 nao estiverem aplicados.
-- Ordem de reversao do Build 63: B63_9 -> B63_2 -> B63_3 -> B63_1.
-- =====================================================================
begin;

do $r$
declare r record; v_def text; v_bk text;
begin
  for r in select * from (values
      ('app.v39_inst_patient_photo(uuid,uuid)', '0d8d9e8bd05b718e04f6c7a0f71c840f'),
      ('app.v39_est_prescription(uuid,jsonb)', '22338475688e9c5e2f3ea8251118a373'),
      ('app.v39_fin_grant_report(uuid,uuid,date,date)', 'c0e37d62675446f1752d7b443cdc3425'),
      ('app.v39_fin_report(uuid,integer,integer)', 'b19f1f457657e9502d5fa59b3996e7f1')
    ) as t(sig, md5_orig)
  loop
    v_def := pg_get_functiondef(r.sig::regprocedure);
    if position('-- B63_HOOK' in v_def) = 0 and md5(v_def) = r.md5_orig then continue; end if;   -- ja original
    if position('-- B63_HOOK' in v_def) > 0 then
      execute regexp_replace(v_def, '\n  perform private\.v39_sensitive_log\([^\n]*-- B63_HOOK', '');
    end if;
    if md5(pg_get_functiondef(r.sig::regprocedure)) <> r.md5_orig then
      select definition into v_bk from app.v39_function_backups where function_name = 'B63_3:' || r.sig order by saved_at desc, id desc limit 1;
      if v_bk is null or md5(v_bk) <> r.md5_orig then
        raise exception 'B63_3 REVERTER ABORTADO: nao foi possivel restaurar % com o md5 original %.', r.sig, r.md5_orig;
      end if;
      execute v_bk;
      if md5(pg_get_functiondef(r.sig::regprocedure)) <> r.md5_orig then
        raise exception 'B63_3 REVERTER ABORTADO: % restaurada do backup mas md5 divergente.', r.sig;
      end if;
    end if;
  end loop;

  drop trigger if exists v39_inst_record_log_audit on app.v39_inst_record_log;
  drop function if exists private.v39_inst_record_log_audit();
  drop function if exists app.v39_audit_list(uuid,text,integer,integer,timestamptz,timestamptz);
  drop function if exists private.v39_sensitive_log(uuid,uuid,text,text,text,text,text,text,text,jsonb);
  drop function if exists private.v39_audit_log(uuid,text,text,text,text,text,uuid,text,text,text,jsonb);
  if to_regprocedure('app.v39_privacy_policy_current(uuid)') is null
     and to_regprocedure('app.v39_privacy_anonymize_execute(uuid,uuid,text,text)') is null then
    drop function if exists private.v39_lgpd_need(uuid,text);
    drop function if exists private.v39_lgpd_me(uuid);
  end if;
end $r$;

commit;

-- VERIFICACAO (tudo deve ser true)
select
  to_regprocedure('app.v39_audit_list(uuid,text,integer,integer,timestamptz,timestamptz)') is null as consulta_removida,
  not exists (select 1 from pg_trigger where tgname = 'v39_inst_record_log_audit') as gatilho_removido,
  md5(pg_get_functiondef('app.v39_inst_patient_photo(uuid,uuid)'::regprocedure)) = '0d8d9e8bd05b718e04f6c7a0f71c840f' as foto_original,
  md5(pg_get_functiondef('app.v39_est_prescription(uuid,jsonb)'::regprocedure)) = '22338475688e9c5e2f3ea8251118a373' as receita_original,
  md5(pg_get_functiondef('app.v39_fin_grant_report(uuid,uuid,date,date)'::regprocedure)) = 'c0e37d62675446f1752d7b443cdc3425' as convenio_original,
  md5(pg_get_functiondef('app.v39_fin_report(uuid,integer,integer)'::regprocedure)) = 'b19f1f457657e9502d5fa59b3996e7f1' as relatorio_original;
