-- =====================================================================
-- KIDS_13 · REVERTER · desliga o job e remove a função dos lembretes.
-- Os avisos já gravados ficam. A extensão pg_cron continua instalada (pode servir a outros jobs);
-- para removê-la: drop extension pg_cron; (só se não houver outros jobs).
-- =====================================================================
begin;
-- KIDS13-REVERTER-BEGIN
do $c$
begin
  if to_regclass('cron.job') is not null and exists (select 1 from cron.job where jobname = 'v39-kids-lembretes') then
    perform cron.unschedule('v39-kids-lembretes');
  end if;
end $c$;
drop function if exists private.v39_kids_schedule_reminders();
-- KIDS13-REVERTER-END
commit;

-- VERIFICACAO (deve dar true)
select not exists (select 1 from pg_proc where proname = 'v39_kids_schedule_reminders') as funcao_removida;
