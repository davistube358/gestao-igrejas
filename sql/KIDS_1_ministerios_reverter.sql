-- =====================================================================
-- KIDS_1 · Ministérios · REVERTER
-- Desfaz o KIDS_1_ministerios_aplicar.sql. Para ser usado logo após aplicar, se algo der errado.
-- ABORTA (sem alterar nada) se já existir ministério ou evento de ministério: nesse caso os dados
-- são da igreja e não podem ser descartados — decidir com o Diogo (nada é apagado).
-- Depois de reverter, voltar o front para a versão anterior ao MIN-1 (o filtro do MIN-1 é inofensivo sem a coluna).
-- =====================================================================
begin;

-- KIDS1-REVERTER-BEGIN
do $g$
begin
  if exists (select 1 from app.ministries) then
    raise exception 'KIDS_1 REVERTER ABORTADO: ja existem ministerios cadastrados. Nada foi alterado.';
  end if;
  if exists (select 1 from app.church_events where ministry_id is not null) then
    raise exception 'KIDS_1 REVERTER ABORTADO: ja existem eventos de ministerio. Nada foi alterado.';
  end if;
end $g$;

drop function if exists app.v39_min_people_search(uuid, uuid, text);
drop function if exists app.v39_min_event_save(uuid, jsonb);
drop function if exists app.v39_min_events(uuid, uuid, date, date);
drop function if exists app.v39_min_member_set(uuid, jsonb);
drop function if exists app.v39_min_members(uuid, uuid, boolean);
drop function if exists app.v39_min_function_save(uuid, jsonb);
drop function if exists app.v39_min_save(uuid, jsonb);
drop function if exists app.v39_min_list(uuid);
drop function if exists private.v39_min_ensure_member(app.ministries, uuid, text);
drop function if exists private.v39_min_person_ok(uuid, uuid);
drop function if exists private.v39_min_backfill(uuid);
drop function if exists private.v39_min_person_name(app.people);
drop function if exists private.v39_min_hist(uuid, text, uuid, text, text, text, text, jsonb);
drop function if exists private.v39_min_need(uuid, uuid, text);
drop function if exists private.v39_min_role(uuid, uuid);

drop trigger if exists trg_v39_min_sync_children on app.church_events;
drop trigger if exists trg_v39_min_event_ctx on app.church_events;
drop function if exists private.v39_min_sync_children();
drop function if exists private.v39_min_event_ctx();
drop function if exists private.v39_min_is_culto(text);

drop index if exists app.church_events_ministry_idx;
drop index if exists app.church_events_ministry_child_unique_idx;
alter table app.church_events drop constraint if exists church_events_parent_not_self;
alter table app.church_events drop constraint if exists church_events_parent_needs_ministry;
alter table app.church_events drop column if exists parent_event_id;
alter table app.church_events drop column if exists ministry_id;

drop index if exists app.ministries_name_open_unique_idx;
alter table app.ministries drop constraint if exists ministries_max_age_check;
alter table app.ministries drop constraint if exists ministries_kind_check;
alter table app.ministries drop column if exists max_age_years;
alter table app.ministries drop column if exists follows_church_services;
alter table app.ministries drop column if exists kind;

-- antes do KIDS_1 o pastor não tinha nenhuma permissão ministries.* (conferido em 23/11/2026)
delete from app.profile_permissions pp
 using app.access_profiles ap, app.permissions p
 where pp.profile_id = ap.id and pp.permission_id = p.id and ap.code = 'pastor' and p.code like 'ministries.%';
-- KIDS1-REVERTER-END

commit;
notify pgrst, 'reload schema';

-- VERIFICACAO (deve dar tudo true)
select
  (select count(*) = 0 from information_schema.columns where table_schema = 'app' and table_name = 'church_events' and column_name in ('ministry_id','parent_event_id')) as colunas_evento_removidas,
  (select count(*) = 0 from information_schema.columns where table_schema = 'app' and table_name = 'ministries' and column_name in ('kind','follows_church_services','max_age_years')) as colunas_ministerio_removidas,
  (select count(*) = 0 from pg_proc where proname like 'v39_min\_%') as funcoes_removidas,
  (select count(*) = 0 from app.profile_permissions pp join app.access_profiles ap on ap.id = pp.profile_id join app.permissions p on p.id = pp.permission_id
    where ap.code = 'pastor' and p.code like 'ministries.%') as pastor_sem_ministerios;
