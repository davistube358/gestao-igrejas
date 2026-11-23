-- =====================================================================
-- FIL_1 · filiais como igrejas separadas · REVERTER
-- Remove gatilhos e funções do FIL_1. Ficam: a coluna app.churches.parent_church_id, as filiais criadas, os vínculos
-- na organização e os acessos já dados (nada é apagado; inative pela tela antes, se for o caso).
-- Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

drop trigger if exists fil1_sync_masters_upa on app.user_profile_assignments;
drop trigger if exists fil1_sync_masters_cua on app.church_user_access;
drop function if exists app.v39_branch_set_status(uuid, uuid, text, text);
drop function if exists app.v39_branch_create(uuid, jsonb);
drop function if exists app.v39_branch_list(uuid);
drop function if exists private.v39_branch_sync_trg();
drop function if exists private.v39_branch_sync_masters(uuid);
drop function if exists private.v39_cnpj_valido(text);

commit;

notify pgrst, 'reload schema';
