-- =====================================================================
-- MIN_2 · Ministérios · logo e faixa · REVERTER
-- Desfaz o MIN_2_imagens_aplicar.sql: tira as políticas restritivas e as funções novas e devolve o
-- app.v39_min_list do KIDS_1 (sem 'logo'/'faixa'). As imagens já enviadas ficam no bucket (nada é apagado);
-- sem as políticas, a pasta "ministerios" volta à regra geral do 2gather-media (acesso à igreja).
-- Depois de reverter, voltar o front para o MIN-1 (o MIN-2 só deixa de mostrar as imagens).
-- =====================================================================
begin;

-- MIN2-REVERTER-BEGIN
drop policy if exists v39_min_media_insert on storage.objects;
drop policy if exists v39_min_media_update on storage.objects;
drop policy if exists v39_min_media_delete on storage.objects;

create or replace function app.v39_min_list(p_church_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare v_admin boolean;
begin
  if app.current_user_account_id() is null or not coalesce(app.v39_has_church_access(p_church_id), false) then
    perform app.raise_domain_error('ACCESS_DENIED', 'Sem acesso ativo a esta igreja');
  end if;
  v_admin := app.has_permission('ministries.manage', p_church_id) or app.has_permission('ministries.view', p_church_id);
  return coalesce((
    select jsonb_agg(x.j order by x.ord, x.nm) from (
      select case m.status when 'active' then 0 when 'planned' then 1 when 'inactive' then 2 else 3 end ord, lower(m.name) nm,
             jsonb_build_object(
               'id', m.id, 'nome', m.name, 'codigo', m.code, 'descricao', m.description, 'tipo', m.kind, 'status', m.status,
               'liderId', m.leader_person_id, 'liderNome', private.v39_min_person_name(pl),
               'auxiliarId', m.assistant_person_id, 'auxiliarNome', private.v39_min_person_name(pa),
               'acompanhaCultos', m.follows_church_services, 'idadeMax', m.max_age_years,
               'encerradoEm', m.closed_on, 'motivoEncerramento', m.close_reason,
               'meuPapel', private.v39_min_role(p_church_id, m.id),
               'membrosAtivos', (select count(*) from app.ministry_memberships mm where mm.ministry_id = m.id and mm.status = 'active'),
               'funcoes', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.name, 'descricao', f.description,
                                                                        'lideranca', f.is_leadership, 'ativo', f.is_active) order by f.is_active desc, lower(f.name))
                                      from app.ministry_functions f where f.ministry_id = m.id), '[]'::jsonb)) j
        from app.ministries m
        left join app.people pl on pl.id = m.leader_person_id
        left join app.people pa on pa.id = m.assistant_person_id
       where m.church_id = p_church_id
         and (v_admin or private.v39_min_role(p_church_id, m.id) is not null)
    ) x), '[]'::jsonb);
end $f$;
revoke all on function app.v39_min_list(uuid) from public, anon;
grant execute on function app.v39_min_list(uuid) to authenticated;

drop function if exists private.v39_min_media(uuid, uuid, text);
drop function if exists app.v39_min_media_can_write(text);
-- MIN2-REVERTER-END

commit;
notify pgrst, 'reload schema';

-- VERIFICACAO (deve dar tudo true)
select
  (select count(*) = 0 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'v39_min_media_%') as politicas_removidas,
  (select count(*) = 0 from pg_proc where proname in ('v39_min_media', 'v39_min_media_can_write')) as funcoes_removidas,
  (select pg_get_functiondef('app.v39_min_list(uuid)'::regprocedure) not like '%v39_min_media%') as lista_kids1;
