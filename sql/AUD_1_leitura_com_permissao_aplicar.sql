-- =====================================================================
-- AUD_1 · duas funções de leitura passam a exigir permissão · APLICAR
-- 28/11/2026 · DATA · auditoria de segurança, item 14 (docs/privado/AUDITORIA_SEGURANCA_2026-11-28.md)
-- VALIDACAO: ver cabecalho de AUD_1_leitura_com_permissao_teste_rollback.sql
-- ---------------------------------------------------------------------
-- Antes: bastava ser membro ativo da igreja (app.assert_church_access) para
--   - app.v39_check_person_duplicate: buscar pessoas da igreja pelo nome (app.search_people);
--   - app.v39_list_entity_files: listar arquivos ligados a um registro (nome, caminho, sensibilidade).
-- Depois: além do acesso à igreja, people.view (busca de pessoas) e files.view (arquivos).
-- O app hoje não depende das duas (a checagem de duplicado roda no próprio app). Assinatura, retorno e grants iguais.
-- Reverter: AUD_1_leitura_com_permissao_reverter.sql.
-- Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

create or replace function app.v39_check_person_duplicate(p_church_id uuid, p_query text) returns jsonb
language plpgsql stable security definer set search_path = app, public as $f$
begin
  perform app.assert_church_access(p_church_id);
  if not app.has_permission('people.view', p_church_id) then
    perform app.raise_domain_error('PERMISSION_DENIED', 'Sem permissao para consultar pessoas');
  end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from app.search_people(p_church_id, p_query, 20) x), '[]'::jsonb);
end $f$;

create or replace function app.v39_list_entity_files(p_church_id uuid, p_entity_schema text, p_entity_name text, p_entity_id uuid) returns jsonb
language plpgsql stable security definer set search_path = app, public as $f$
begin
  perform app.assert_church_access(p_church_id);
  if not app.has_permission('files.view', p_church_id) then
    perform app.raise_domain_error('PERMISSION_DENIED', 'Sem permissao para ver arquivos');
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('link_id', l.id, 'file_id', f.id, 'storage_path', f.storage_path, 'original_file_name', f.original_file_name,
      'media_type', f.media_type, 'file_category', f.file_category, 'sensitivity', f.sensitivity, 'description', l.description) order by l.linked_at desc)
    from app.file_links l join app.files f on f.id = l.file_id
   where l.church_id = p_church_id and l.entity_schema = p_entity_schema and l.entity_name = p_entity_name and l.entity_id = p_entity_id
     and l.is_active = true and f.status = 'active'), '[]'::jsonb);
end $f$;

commit;

notify pgrst, 'reload schema';

-- VERIFICACAO (tudo deve ser true)
select
  position('people.view' in pg_get_functiondef('app.v39_check_person_duplicate(uuid,text)'::regprocedure)) > 0 as duplicado_ok,
  position('files.view' in pg_get_functiondef('app.v39_list_entity_files(uuid,text,text,uuid)'::regprocedure)) > 0 as arquivos_ok;
