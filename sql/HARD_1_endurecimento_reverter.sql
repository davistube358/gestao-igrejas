-- =====================================================================
-- HARD_1 · endurecimento do banco · REVERTER
-- Devolve os grants e as opções anteriores. Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

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

commit;

notify pgrst, 'reload schema';
