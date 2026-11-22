-- =====================================================================
-- B63_2 · LGPD · Anonimizacao · REVERTER (rollback real, pos-aplicacao)
-- Build 63 · DATA-63b
-- VALIDACAO (22/11/2026, MCP execute_sql, aplicar + reverter dentro de do $t$):
--   Mesmo bloco do aplicar: "... C7 ok (reverter aborta com anonimizado); REVERTER ok: funcoes,
--   tabelas, colunas e constraints identicas ao original" -> TESTE APLICAR B63_2 OK (nada foi gravado)
-- ---------------------------------------------------------------------
-- O que faz: remove as funcoes de pedido/decisao/execucao e as colunas
--   app.people.anonymized_at / anonymized_by_user_account_id.
-- NAO apaga dados: se alguma pessoa ja tiver anonymized_at preenchido, ABORTA sem remover nada
--   (apagar a coluna perderia a marca de anonimizacao). Pedidos e historicos em
--   data_subject_requests / data_subject_request_history / audit.events ficam.
-- A anonimizacao ja executada NAO e desfeita (e irreversivel por desenho).
-- Os gates private.v39_lgpd_me/need so saem se B63_1 e B63_3 nao estiverem aplicados.
-- Ordem de aplicacao do Build 63: B63_1 -> B63_9 -> B63_3 -> B63_2 -> B63_5.
-- Ordem de reversao do Build 63: B63_9 -> B63_5 -> B63_2 -> B63_3 -> B63_1.
-- QA63R-02 (22/11/2026): ABORTA se o B63_5 ainda estiver aplicado (gatilhos trg_v39_lgpd_guard_* ou
--   funcoes private.v39_lgpd_guard_*). Sem isso a coluna anonymized_at sairia, o gatilho do B63_5
--   continuaria preso em app.people e todo UPDATE de pessoa falharia ("record old has no field anonymized_at").
-- D4: o status anterior guardado pelo modo restrict fica so na metadata do historico/audit (nada a remover aqui).
-- Antes de reverter: o front deve parar de chamar as funcoes de anonimizacao.
-- =====================================================================
begin;

do $r$
declare v_n int;
begin
  select count(*) into v_n from pg_trigger where not tgisinternal and tgname like 'trg\_v39\_lgpd\_guard\_%';
  if v_n > 0
     or to_regprocedure('private.v39_lgpd_guard_people()') is not null
     or to_regprocedure('private.v39_lgpd_guard_person_child()') is not null
     or to_regprocedure('private.v39_lgpd_guard_church_people()') is not null then
    raise exception 'B63_2 REVERTER ABORTADO: o B63_5 ainda esta aplicado (% gatilho(s) trg_v39_lgpd_guard_*). Rode antes o B63_5_trava_pessoa_anonimizada_reverter.sql (ordem: B63_9 -> B63_5 -> B63_2 -> B63_3 -> B63_1). Nada foi removido.', v_n;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'app' and table_name = 'people' and column_name = 'anonymized_at') then
    execute 'select count(*) from app.people where anonymized_at is not null' into v_n;
    if v_n > 0 then
      raise exception 'B63_2 REVERTER ABORTADO: % pessoa(s) ja anonimizada(s). Nada foi removido.', v_n;
    end if;
  end if;
  drop function if exists app.v39_privacy_anonymize_execute(uuid,uuid,text,text);
  drop function if exists app.v39_privacy_request_decide(uuid,uuid,text,text);
  drop function if exists app.v39_privacy_requests_list(uuid,text);
  drop function if exists app.v39_privacy_request_create(uuid,uuid,text,text);
  drop function if exists private.v39_dsr_anon_precheck(uuid,uuid,uuid);
  drop function if exists private.v39_dsr_move(uuid,text,text,text,uuid,text,jsonb);
  alter table app.people drop column if exists anonymized_by_user_account_id;
  alter table app.people drop column if exists anonymized_at;
  if to_regprocedure('app.v39_privacy_policy_current(uuid)') is null
     and to_regprocedure('app.v39_audit_list(uuid,text,integer,integer,timestamptz,timestamptz)') is null then
    drop function if exists private.v39_lgpd_need(uuid,text);
    drop function if exists private.v39_lgpd_me(uuid);
  end if;
end $r$;

commit;

-- VERIFICACAO (tudo deve ser true)
select
  (select count(*) = 0 from information_schema.columns where table_schema = 'app' and table_name = 'people'
     and column_name in ('anonymized_at', 'anonymized_by_user_account_id')) as colunas_removidas,
  (select count(*) = 0 from pg_proc where proname in ('v39_privacy_request_create','v39_privacy_requests_list','v39_privacy_request_decide',
     'v39_privacy_anonymize_execute','v39_dsr_move','v39_dsr_anon_precheck')) as funcoes_removidas;
