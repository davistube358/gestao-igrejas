-- =====================================================================
-- HARD_1 · endurecimento do banco · TESTE COM ROLLBACK
-- ULTIMA EXECUCAO: 22/11/2026 (Claude, conector Supabase): TESTE HARD_1 CONCLUIDO (nada foi gravado): T1 ok; T2 ok; T3 ok; T4 ok (REVERTER ok)
-- Casos:
--   T1  depois de aplicar: authenticated sem INSERT/UPDATE em church_events (SELECT mantido); gravar direto dá 42501
--   T2  views v39_*_status com security_invoker e sem SELECT para authenticated (o dono continua lendo)
--   T3  as 10 funções auxiliares com search_path fixo e respondendo igual
--   T4  REVERTER devolve grants, opções e search_path
-- NAO GRAVA NADA: tudo e desfeito pelo raise final.
-- =====================================================================
do $t$
declare v_res text := ''; v_n int; d date[];
begin
  if not has_table_privilege('authenticated', 'app.church_events', 'INSERT') then raise exception 'FALHOU: HARD_1 parece ja aplicado (rode o reverter antes de testar)'; end if;

  -- APLICAR (identico ao _aplicar, sem begin/commit)

revoke insert, update on app.church_events from authenticated;

alter view app.v39_access_closure_status set (security_invoker = true);
alter view app.v39_backend_closure_status set (security_invoker = true);
alter view app.v39_health_record_security_status set (security_invoker = true);
alter view app.v39_prepublication_closure_status set (security_invoker = true);
alter view app.v39_stock_delivery_closure_status set (security_invoker = true);
alter view app.v39_storage_status set (security_invoker = true);
revoke select on app.v39_access_closure_status, app.v39_backend_closure_status, app.v39_health_record_security_status,
  app.v39_prepublication_closure_status, app.v39_stock_delivery_closure_status, app.v39_storage_status from authenticated;

alter function app.v39_papel_legado(text) set search_path = pg_catalog, public;
alter function app.v39_sexo_legado(text) set search_path = pg_catalog, public;
alter function private.v39_fin_uuid(jsonb, text) set search_path = pg_catalog, public;
alter function private.v39_fin_date(jsonb, text) set search_path = pg_catalog, public;
alter function private.v39_fin_key(jsonb, text) set search_path = pg_catalog, public;
alter function private.v39_fin_money(jsonb, text) set search_path = pg_catalog, public;
alter function private.v39_fin_reason(text) set search_path = pg_catalog, public;
alter function private.v39_trn_quando(app.training_meetings) set search_path = pg_catalog, public;
alter function private.v39_trn_scope(text) set search_path = pg_catalog, public;
alter function private.v39_trn_dates(date, text, date, integer) set search_path = pg_catalog, public;


  -- T1
  if has_table_privilege('authenticated', 'app.church_events', 'INSERT') or has_table_privilege('authenticated', 'app.church_events', 'UPDATE')
     or not has_table_privilege('authenticated', 'app.church_events', 'SELECT') then raise exception 'FALHOU T1 grants'; end if;
  begin
    set local role authenticated;
    update app.church_events set updated_at = updated_at where false;
    reset role; raise exception 'FALHOU T1: update direto passou';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlstate <> '42501' then raise exception 'FALHOU T1: % %', sqlstate, sqlerrm; end if; end;
  v_res := v_res || 'T1 ok; ';

  -- T2
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'app' and c.relname like 'v39\_%\_status' escape '\'
     and (has_table_privilege('authenticated', c.oid, 'SELECT') or not coalesce((select option_value = 'true' from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'), false));
  if v_n <> 0 then raise exception 'FALHOU T2: % view(s)', v_n; end if;
  begin
    set local role authenticated; perform 1 from app.v39_storage_status; reset role; raise exception 'FALHOU T2: authenticated leu a view';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlstate <> '42501' then raise exception 'FALHOU T2: % %', sqlstate, sqlerrm; end if; end;
  perform count(*) from app.v39_backend_closure_status;
  v_res := v_res || 'T2 ok; ';

  -- T3
  if app.v39_papel_legado('leader') <> 'lider' or private.v39_fin_money('{"v":"10.555"}'::jsonb, 'v') <> 10.56 or private.v39_fin_date('{"d":"2026-11-22"}'::jsonb, 'd') <> date '2026-11-22'
     or private.v39_fin_uuid('{"u":"x"}'::jsonb, 'u') is not null or private.v39_fin_key('{"chave":"k"}'::jsonb, 'p') <> 'p:k' or private.v39_trn_scope('inst') <> 'inst'
     or private.v39_fin_reason('motivo ok') <> 'motivo ok' or app.v39_sexo_legado('m') <> 'Masculino' then raise exception 'FALHOU T3 valores'; end if;
  d := private.v39_trn_dates(date '2026-11-01', 'semanal', date '2026-11-22', null);
  if coalesce(array_length(d, 1), 0) < 1 then raise exception 'FALHOU T3 datas'; end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where (n.nspname, p.proname) in (('app','v39_papel_legado'),('app','v39_sexo_legado'),('private','v39_fin_uuid'),('private','v39_fin_date'),('private','v39_fin_key'),
     ('private','v39_fin_money'),('private','v39_fin_reason'),('private','v39_trn_quando'),('private','v39_trn_scope'),('private','v39_trn_dates')) and p.proconfig is not null;
  if v_n <> 10 then raise exception 'FALHOU T3 search_path: %', v_n; end if;
  v_res := v_res || 'T3 ok; ';

  -- T4 REVERTER (identico ao _reverter, sem begin/commit)

grant insert, update on app.church_events to authenticated;

alter view app.v39_access_closure_status reset (security_invoker);
alter view app.v39_backend_closure_status reset (security_invoker);
alter view app.v39_health_record_security_status reset (security_invoker);
alter view app.v39_prepublication_closure_status reset (security_invoker);
alter view app.v39_stock_delivery_closure_status reset (security_invoker);
alter view app.v39_storage_status reset (security_invoker);
grant select on app.v39_access_closure_status, app.v39_backend_closure_status, app.v39_health_record_security_status,
  app.v39_prepublication_closure_status, app.v39_stock_delivery_closure_status, app.v39_storage_status to authenticated;

alter function app.v39_papel_legado(text) reset search_path;
alter function app.v39_sexo_legado(text) reset search_path;
alter function private.v39_fin_uuid(jsonb, text) reset search_path;
alter function private.v39_fin_date(jsonb, text) reset search_path;
alter function private.v39_fin_key(jsonb, text) reset search_path;
alter function private.v39_fin_money(jsonb, text) reset search_path;
alter function private.v39_fin_reason(text) reset search_path;
alter function private.v39_trn_quando(app.training_meetings) reset search_path;
alter function private.v39_trn_scope(text) reset search_path;
alter function private.v39_trn_dates(date, text, date, integer) reset search_path;


  if not has_table_privilege('authenticated', 'app.church_events', 'INSERT') or not has_table_privilege('authenticated', 'app.v39_storage_status', 'SELECT')
     or exists (select 1 from pg_proc where oid = 'app.v39_papel_legado(text)'::regprocedure and proconfig is not null) then raise exception 'FALHOU T4'; end if;
  v_res := v_res || 'T4 ok (REVERTER ok)';

  raise exception 'TESTE HARD_1 CONCLUIDO (nada foi gravado): %', v_res;
end $t$;
