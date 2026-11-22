-- =====================================================================
-- D5_2 · REVERTER · tira os 18 envelopes e devolve as funções originais ao schema app
-- Rodar ANTES dos reverters do D5_1, B63_5, B63_3b e B63_3.
-- =====================================================================
begin;

do $r$
declare
  v_nomes text[] := array['get_gc_meeting','list_gc_meetings','get_growth_group','list_growth_groups','v39_list_life_home',
    'v39_fin_campaigns','v39_fin_catalogs','v39_fin_expenses','v39_fin_overview','v39_fin_report','v39_fin_grant_report',
    'v39_mural_list','v39_gc_team','v39_gc_discipulos','v39_list_sectors','v39_message_recipients','list_active_users',
    'v39_access_request_names'];
  v text; v_ident text;
begin
  foreach v in array v_nomes loop
    select pg_get_function_identity_arguments(p.oid) into v_ident
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = v || '__d5raw';
    if v_ident is null then raise exception 'D5_2 REVERTER ABORTADO: private.%__d5raw nao existe. Nada foi alterado.', v; end if;
    execute format('drop function app.%I(%s)', v, v_ident);
    execute format('alter function private.%I(%s) set schema app', v || '__d5raw', v_ident);
    execute format('alter function app.%I(%s) rename to %I', v || '__d5raw', v_ident, v);
    execute format('grant execute on function app.%I(%s) to authenticated', v, v_ident);
  end loop;
  drop function if exists private.v39_lgpd_mascarar(jsonb);
end $r$;

commit;

-- VERIFICACAO (tudo deve ser true)
select
  (select count(*) = 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname like '%\_\_d5raw') as sem_originais_em_private,
  (select count(*) = 0 from pg_proc where prosrc like '%v39_lgpd_mascarar(%') as sem_envelopes,
  to_regprocedure('private.v39_lgpd_mascarar(jsonb)') is null as mascarar_removida,
  (select proacl::text = '{postgres=X/postgres,authenticated=X/postgres}' from pg_proc where oid = 'app.v39_fin_overview(uuid,integer,integer)'::regprocedure) as acl_original;
