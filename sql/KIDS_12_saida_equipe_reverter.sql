-- =====================================================================
-- KIDS_12 · REVERTER · remove o gatilho (as escalas já retiradas continuam retiradas: nada é apagado nem refeito).
-- =====================================================================
begin;
-- KIDS12-REVERTER-BEGIN
drop trigger if exists trg_v39_kids_membership_exit on app.ministry_memberships;
drop function if exists private.v39_kids_membership_exit();
-- KIDS12-REVERTER-END
commit;

-- VERIFICACAO (deve dar true)
select not exists (select 1 from pg_trigger where tgname = 'trg_v39_kids_membership_exit') as gatilho_removido;
