-- =====================================================================
-- KIDS_11 · REVERTER · remove a função de resumo da escala (só leitura; nenhum dado é afetado).
-- O front (MIN-8) volta a mostrar os cards sem a escala se a função não existir.
-- =====================================================================
begin;
-- KIDS11-REVERTER-BEGIN
drop function if exists app.v39_kids_schedule_summary(uuid, uuid);
-- KIDS11-REVERTER-END
commit;
notify pgrst, 'reload schema';

-- VERIFICACAO (deve dar true)
select (select count(*) = 0 from pg_proc where pronamespace = 'app'::regnamespace and proname = 'v39_kids_schedule_summary') as removida;
