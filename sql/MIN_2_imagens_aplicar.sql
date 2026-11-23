-- =====================================================================
-- MIN_2 · Ministérios · logo e faixa (como no GC) · APLICAR
-- 23/11/2026 · pedido do Diogo (chat): "como no GC, ter imagem (logo e faixa) com o logo do ministério".
-- VALIDACAO: ver cabecalho de MIN_2_imagens_teste_rollback.sql
--
-- Como no GC, as imagens ficam no bucket 2gather-media (privado), na pasta da igreja:
--     <igreja>/ministerios/<ministerio>/logo-<timestamp>.jpg   (quadrada)
--     <igreja>/ministerios/<ministerio>/faixa-<timestamp>.jpg  (larga)
-- O que muda em relação ao GC (mais restrito): só master/pastor (ministries.manage) e o líder/auxiliar do
-- ministério gravam, trocam ou removem essas imagens (políticas RESTRICTIVE só na pasta "ministerios").
-- Leitura: qualquer pessoa com acesso ativo à igreja (igual ao GC; imagem não é dado pessoal).
--   A. app.v39_min_media_can_write(name)  (usada pelas políticas)
--   B. políticas restritivas v39_min_media_insert/update/delete em storage.objects
--   C. private.v39_min_media(igreja, ministerio, tipo) e app.v39_min_list passa a devolver 'logo' e 'faixa' (caminho)
-- Requer KIDS_1. Reverter: MIN_2_imagens_reverter.sql
-- =====================================================================
begin;

-- MIN2-BODY-BEGIN
do $g$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'app' and table_name = 'ministries' and column_name = 'kind') then
    raise exception 'MIN_2 ABORTADO: KIDS_1 nao aplicado. Nada foi alterado.';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'v39_min_media_%') then
    raise exception 'MIN_2 ABORTADO: politicas ja existem (MIN_2 ja aplicado?). Nada foi alterado.';
  end if;
end $g$;

-- A. quem pode gravar na pasta de um ministério
create or replace function app.v39_min_media_can_write(p_name text) returns boolean
language plpgsql stable security definer set search_path = pg_catalog, app, private, storage as $f$
declare
  p text[] := storage.foldername(p_name);
  v_arq text := storage.filename(p_name);
  v_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if app.current_user_account_id() is null then return false; end if;
  if p is null or coalesce(array_length(p, 1), 0) <> 3 or p[2] <> 'ministerios' then return false; end if;
  if p[1] !~ v_re or p[3] !~ v_re then return false; end if;
  if v_arq is null or v_arq !~ '^(logo|faixa)-[0-9]{10,16}\.(jpg|jpeg|png|webp)$' then return false; end if;
  if not exists (select 1 from app.ministries m where m.id = p[3]::uuid and m.church_id = p[1]::uuid and m.status <> 'closed') then return false; end if;
  return coalesce(private.v39_min_role(p[1]::uuid, p[3]::uuid) in ('admin','leader'), false);
end $f$;

-- B. políticas restritivas: valem junto com as 2gather_storage_* (que só exigem acesso à igreja)
create policy v39_min_media_insert on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> '2gather-media' or coalesce((storage.foldername(name))[2], '') <> 'ministerios' or app.v39_min_media_can_write(name));
create policy v39_min_media_update on storage.objects as restrictive for update to authenticated
  using (bucket_id <> '2gather-media' or coalesce((storage.foldername(name))[2], '') <> 'ministerios' or app.v39_min_media_can_write(name))
  with check (bucket_id <> '2gather-media' or coalesce((storage.foldername(name))[2], '') <> 'ministerios' or app.v39_min_media_can_write(name));
create policy v39_min_media_delete on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> '2gather-media' or coalesce((storage.foldername(name))[2], '') <> 'ministerios' or app.v39_min_media_can_write(name));

-- C. imagem mais recente de cada tipo
create or replace function private.v39_min_media(p_church_id uuid, p_ministry_id uuid, p_tipo text) returns text
language sql stable security definer set search_path = pg_catalog, storage as $f$
  select o.name from storage.objects o
   where o.bucket_id = '2gather-media'
     and o.name like p_church_id::text || '/ministerios/' || p_ministry_id::text || '/' || p_tipo || '-%'
   order by o.created_at desc, o.name desc
   limit 1
$f$;

-- lista de ministérios visíveis (admin: todos; demais: onde tem vínculo ativo) + logo e faixa
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
               'logo', private.v39_min_media(p_church_id, m.id, 'logo'),
               'faixa', private.v39_min_media(p_church_id, m.id, 'faixa'),
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

revoke all on function app.v39_min_media_can_write(text) from public, anon;
grant execute on function app.v39_min_media_can_write(text) to authenticated;
revoke all on function private.v39_min_media(uuid, uuid, text) from public;
revoke all on function app.v39_min_list(uuid) from public, anon;
grant execute on function app.v39_min_list(uuid) to authenticated;
-- MIN2-BODY-END

commit;
notify pgrst, 'reload schema';

-- VERIFICACAO (deve dar tudo true)
select
  (select count(*) = 3 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'v39_min_media_%' and permissive = 'RESTRICTIVE') as politicas,
  (select has_function_privilege('authenticated', 'app.v39_min_media_can_write(text)', 'execute')
      and not has_function_privilege('anon', 'app.v39_min_media_can_write(text)', 'execute')) as funcao_escrita,
  (select pg_get_functiondef('app.v39_min_list(uuid)'::regprocedure) like '%v39_min_media%') as lista_com_imagens,
  (select has_function_privilege('authenticated', 'app.v39_min_list(uuid)', 'execute')) as lista_liberada;
