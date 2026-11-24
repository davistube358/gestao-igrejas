-- =====================================================================
-- KIDS_6 · Criança em um só culto/sala no mesmo horário · REVERTER
-- Tira o gatilho e as duas funções. Não mexe em nenhuma entrada já gravada.
-- =====================================================================
begin;

-- KIDS6-REVERTER-BEGIN
drop trigger if exists trg_v39_kids_checkin_conflict on app.kids_checkins;
drop function if exists private.v39_kids_checkin_conflict();
drop function if exists private.v39_kids_event_end(app.church_events);
-- KIDS6-REVERTER-END

commit;

-- VERIFICACAO (deve dar tudo true)
select
  (select count(*) = 0 from pg_trigger where tgname = 'trg_v39_kids_checkin_conflict') as gatilho_removido,
  (select count(*) = 0 from pg_proc where proname in ('v39_kids_event_end','v39_kids_checkin_conflict')) as funcoes_removidas;
