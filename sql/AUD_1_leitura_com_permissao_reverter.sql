-- =====================================================================
-- AUD_1 · duas funções de leitura · REVERTER (volta a exigir só o acesso à igreja)
-- Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

create or replace function app.v39_check_person_duplicate(p_church_id uuid, p_query text) returns jsonb
language plpgsql stable security definer set search_path = app, public as $f$
begin
 perform app.assert_church_access(p_church_id);
 return coalesce((select jsonb_agg(to_jsonb(x)) from app.search_people(p_church_id,p_query,20) x),'[]'::jsonb);
end $f$;

create or replace function app.v39_list_entity_files(p_church_id uuid, p_entity_schema text, p_entity_name text, p_entity_id uuid) returns jsonb
language plpgsql stable security definer set search_path = app, public as $f$
begin
 perform app.assert_church_access(p_church_id);
 return coalesce((select jsonb_agg(jsonb_build_object('link_id',l.id,'file_id',f.id,'storage_path',f.storage_path,'original_file_name',f.original_file_name,'media_type',f.media_type,'file_category',f.file_category,'sensitivity',f.sensitivity,'description',l.description) order by l.linked_at desc)
 from app.file_links l join app.files f on f.id=l.file_id
 where l.church_id=p_church_id and l.entity_schema=p_entity_schema and l.entity_name=p_entity_name and l.entity_id=p_entity_id and l.is_active=true and f.status='active'),'[]'::jsonb);
end $f$;

commit;

notify pgrst, 'reload schema';
