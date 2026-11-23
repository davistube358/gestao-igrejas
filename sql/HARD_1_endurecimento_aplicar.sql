-- =====================================================================
-- HARD_1 · endurecimento do banco antes da produção · APLICAR
-- 22/11/2026 · DATA · item 4 da lista de produção (Diogo: "seguir sua sugestão")
-- VALIDACAO: ver cabecalho de HARD_1_endurecimento_teste_rollback.sql
-- ---------------------------------------------------------------------
-- 1) app.church_events: o usuário logado tinha INSERT/UPDATE direto na tabela (contra a regra "escrita só por RPC").
--    Hoje o RLS já barra (não há policy de escrita) e só funções SECURITY DEFINER do dono gravam ali
--    (v39_save_church_event, v39_registro_encerrar, v39_registro_reabrir). Revoga os dois grants; SELECT continua.
-- 2) 6 views de diagnóstico (v39_*_status) rodavam com o dono (alerta ERROR "security_definer_view" do Supabase) e
--    estavam liberadas a qualquer usuário logado. Só dizem se objetos existem (sem dado pessoal), o app não usa.
--    Passam a security_invoker e deixam de ser lidas por authenticated.
-- 3) 10 funções auxiliares sem search_path fixo (alerta WARN "function_search_path_mutable"): fixa em pg_catalog, public.
--    Todas são SECURITY INVOKER e já usam nomes completos (app.raise_domain_error).
-- Fica como está (por desenho, registrado): RLS ligado sem policy em tabelas acessadas só por RPC (INFO), RPCs
-- SECURITY DEFINER executáveis por authenticated (cada uma confere permissão), extensão unaccent no schema public.
-- Fora do SQL (painel do Supabase, Diogo): ligar "Leaked password protection" em Auth.
-- Reverter: HARD_1_endurecimento_reverter.sql.
-- Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

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

commit;

notify pgrst, 'reload schema';

-- VERIFICACAO (tudo deve ser true)
select
  not has_table_privilege('authenticated', 'app.church_events', 'INSERT') and not has_table_privilege('authenticated', 'app.church_events', 'UPDATE')
    and has_table_privilege('authenticated', 'app.church_events', 'SELECT') as church_events_ok,
  not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'app' and c.relname like 'v39\_%\_status' escape '\'
               and (has_table_privilege('authenticated', c.oid, 'SELECT')
                    or not coalesce((select option_value = 'true' from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'), false))) as views_ok,
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where (n.nspname, p.proname) in (('app','v39_papel_legado'),('app','v39_sexo_legado'),('private','v39_fin_uuid'),('private','v39_fin_date'),('private','v39_fin_key'),
                 ('private','v39_fin_money'),('private','v39_fin_reason'),('private','v39_trn_quando'),('private','v39_trn_scope'),('private','v39_trn_dates'))
                 and p.proconfig is null) as search_path_ok;
