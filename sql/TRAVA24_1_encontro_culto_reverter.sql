-- =====================================================================
-- TRAVA24_1 · REVERTER · tira gatilhos, RPCs e colunas da trava de 24h
-- Aborta se algum registro já foi reaberto (reopened_at preenchido): a coluna guarda histórico.
-- Os status 'completed' e completed_at gravados pelo "Encerrar" ficam (são válidos no esquema original).
-- =====================================================================
begin;

do $g$
begin
  if exists (select 1 from app.growth_group_meetings where reopened_at is not null)
     or exists (select 1 from app.church_events where reopened_at is not null) then
    raise exception 'TRAVA24_1 REVERTER ABORTADO: ha registro reaberto (reopened_at). Nada foi removido.';
  end if;
end $g$;

drop trigger if exists trg_v39_trava_gc_meeting on app.growth_group_meetings;
drop trigger if exists trg_v39_trava_gc_attendance on app.growth_group_attendance;
drop trigger if exists trg_v39_trava_gc_summary on app.growth_group_meeting_summaries;
drop trigger if exists trg_v39_trava_evento on app.church_events;
drop trigger if exists trg_v39_trava_evento_resumo on app.church_event_summaries;
drop function if exists app.v39_registro_reabrir(uuid,text,uuid,text);
drop function if exists app.v39_registro_encerrar(uuid,text,uuid);
drop function if exists app.v39_registro_travas(uuid,text,uuid[]);
drop function if exists private.v39_trava_guard_evento_resumo();
drop function if exists private.v39_trava_guard_evento();
drop function if exists private.v39_trava_guard_gc_child();
drop function if exists private.v39_trava_guard_gc_meeting();
drop function if exists private.v39_trava_liberada(uuid);
drop function if exists private.v39_trava_evento(app.church_events);
drop function if exists private.v39_trava_gc(app.growth_group_meetings);
drop function if exists private.v39_trava_fim_dia(uuid,date);
alter table app.church_events drop column if exists reopened_by_user_account_id;
alter table app.church_events drop column if exists reopened_at;
alter table app.growth_group_meetings drop column if exists reopened_by_user_account_id;
alter table app.growth_group_meetings drop column if exists reopened_at;

commit;

notify pgrst, 'reload schema';

select
  (select count(*) = 0 from pg_trigger where not tgisinternal and tgname like 'trg\_v39\_trava\_%') as sem_gatilhos,
  to_regprocedure('app.v39_registro_reabrir(uuid,text,uuid,text)') is null as sem_rpc,
  (select count(*) = 0 from information_schema.columns where table_schema = 'app' and column_name = 'reopened_at'
     and table_name in ('growth_group_meetings','church_events')) as sem_colunas;
