-- =====================================================================
-- CONFIG_1 · REVERTER · remove as RPCs de configuração. Os valores já gravados em app.churches e
--   app.church_settings ficam (são dados da igreja, não estrutura). O app volta a ler do Apps Script.
-- =====================================================================
begin;

drop function if exists app.edge_config_public(uuid);
drop function if exists app.v39_config_save(uuid,jsonb);
drop function if exists app.v39_config_get(uuid);
drop function if exists private.v39_cfg_obj(uuid);
drop function if exists private.v39_cfg_set(uuid,text,jsonb,text,uuid);

commit;

notify pgrst, 'reload schema';

select to_regprocedure('app.v39_config_save(uuid,jsonb)') is null and to_regprocedure('app.v39_config_get(uuid)') is null
   and to_regprocedure('app.edge_config_public(uuid)') is null and to_regprocedure('private.v39_cfg_obj(uuid)') is null as removido;
