-- =====================================================================
-- B63_3b · HOTFIX VOLATILE · TESTE COM ROLLBACK
-- ULTIMA EXECUCAO (22/11/2026, conector Supabase da conta, projeto kybrwsxvdbwjtwakczyj, pelo Claude):
--   ERROR P0001: TESTE B63_3b CONCLUIDO (nada foi gravado): G1 ok; T1 ok (25006 reproduzido); T2 ok; T3 ok (REVERTER ok)
-- Casos:
--   G1  as 4 funcoes estao STABLE e com o gancho -- B63_HOOK (estado do bug)
--   T1  reproduz o bug: em transacao somente leitura o INSERT do gancho falha com 25006
--       (o PostgREST abre transacao somente leitura para funcao STABLE)
--   T2  aplicar: as 4 ficam VOLATILE; corpo (md5 do prosrc), ACL, search_path e security definer iguais
--   T3  reverter: as 4 voltam a STABLE
-- NAO GRAVA NADA: tudo e desfeito pelo raise final.
-- =====================================================================
do $t$
declare
  v_res text := ''; v_n int; v_antes text; v_depois text;
  c_sigs constant regprocedure[] := array['app.v39_inst_patient_photo(uuid,uuid)'::regprocedure, 'app.v39_est_prescription(uuid,jsonb)'::regprocedure,
                                          'app.v39_fin_grant_report(uuid,uuid,date,date)'::regprocedure, 'app.v39_fin_report(uuid,integer,integer)'::regprocedure];
begin
  select count(*) into v_n from pg_proc where oid = any (c_sigs) and provolatile = 's' and prosrc like '%-- B63_HOOK%';
  if v_n <> 4 then raise exception 'FALHOU G1: % de 4 STABLE com gancho', v_n; end if;
  select string_agg(md5(prosrc) || coalesce(proacl::text, '') || coalesce(proconfig::text, '') || prosecdef::text, '|' order by oid)
    into v_antes from pg_proc where oid = any (c_sigs);
  v_res := v_res || 'G1 ok; ';

  -- T1: INSERT em transacao somente leitura (subtransacao; o set local e desfeito no rollback dela)
  begin
    set local transaction_read_only = on;
    insert into app.sensitive_data_access_log (church_id, user_account_id, person_id, sensitivity_level_id, operation, entity_schema, entity_name, entity_id, access_reason, outcome, metadata)
    select null, null, null, id, 'view', 'app', 'teste', null, 'teste', 'allowed', '{}'::jsonb from app.data_sensitivity_levels limit 1;
    raise exception 'FALHOU T1: INSERT passou em transacao somente leitura';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    if sqlstate <> '25006' then raise exception 'FALHOU T1: erro inesperado % %', sqlstate, sqlerrm; end if;
  end;
  v_res := v_res || 'T1 ok (25006 reproduzido); ';

  -- APLICAR (identico ao _aplicar, sem begin/commit)
  alter function app.v39_inst_patient_photo(uuid,uuid) volatile;
  alter function app.v39_est_prescription(uuid,jsonb) volatile;
  alter function app.v39_fin_grant_report(uuid,uuid,date,date) volatile;
  alter function app.v39_fin_report(uuid,integer,integer) volatile;

  select count(*) into v_n from pg_proc where oid = any (c_sigs) and provolatile = 'v';
  if v_n <> 4 then raise exception 'FALHOU T2a: % de 4 VOLATILE', v_n; end if;
  select string_agg(md5(prosrc) || coalesce(proacl::text, '') || coalesce(proconfig::text, '') || prosecdef::text, '|' order by oid)
    into v_depois from pg_proc where oid = any (c_sigs);
  if v_depois is distinct from v_antes then raise exception 'FALHOU T2b: corpo/ACL/search_path/security definer mudou'; end if;
  v_res := v_res || 'T2 ok; ';

  -- REVERTER (identico ao _reverter, sem begin/commit)
  alter function app.v39_inst_patient_photo(uuid,uuid) stable;
  alter function app.v39_est_prescription(uuid,jsonb) stable;
  alter function app.v39_fin_grant_report(uuid,uuid,date,date) stable;
  alter function app.v39_fin_report(uuid,integer,integer) stable;
  select count(*) into v_n from pg_proc where oid = any (c_sigs) and provolatile = 's';
  if v_n <> 4 then raise exception 'FALHOU T3: % de 4 STABLE', v_n; end if;
  v_res := v_res || 'T3 ok (REVERTER ok)';

  raise exception 'TESTE B63_3b CONCLUIDO (nada foi gravado): %', v_res;
end
$t$;
