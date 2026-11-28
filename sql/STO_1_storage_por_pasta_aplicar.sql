-- =====================================================================
-- STO_1 · regras do Storage por pasta (buckets 2gather-media e 2gather-private) · APLICAR
-- 28/11/2026 · DATA · auditoria de segurança, itens 4 e 5 (docs/privado/AUDITORIA_SEGURANCA_2026-11-28.md)
-- VALIDACAO: ver cabecalho de STO_1_storage_por_pasta_teste_rollback.sql
-- ---------------------------------------------------------------------
-- Antes: 4 regras (2gather_storage_select/insert/update/delete) deixavam QUALQUER membro ativo da igreja ler, gravar,
--   trocar e APAGAR qualquer arquivo dos dois buckets, inclusive as fotos de receita da Farmácia (dado de saúde) e o
--   logo/ícone da igreja.
-- Depois (mesmos nomes de regra, condição nova numa função só, private.v39_sto_pode):
--   2gather-private/<igreja>/farmacia/...  ler: quem tem pharmacy.prescriptions.view / deliveries.create|complete / audit
--                                          gravar/trocar: pharmacy.deliveries.create|complete / prescriptions.manage
--                                          apagar: ninguém (nada é apagado)
--   2gather-private, outras pastas         ninguém pelo app (hoje não há outras pastas)
--   2gather-media/<igreja>/branding/...    ler: membro ativo · gravar/trocar: só master · apagar: ninguém
--   2gather-media/<igreja>/gcs/<gc>/...    ler: membro ativo · gravar/trocar/apagar: quem gerencia o GC
--                                          (master, pastor, líder/supervisor do GC; private.can_view_growth_group)
--   2gather-media/<igreja>/ministerios/... como antes: membro ativo, e a regra RESTRITIVA v39_min_media_* (Kids) continua
--   2gather-media, outras pastas           ler: membro ativo · gravar/trocar/apagar: ninguém
-- As Edges (service_role) não passam por estas regras (logo da tela de login, anonimização).
-- Reverter: STO_1_storage_por_pasta_reverter.sql (volta as 4 regras antigas).
-- Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

create or replace function private.v39_sto_pode(p_bucket text, p_name text, p_op text) returns boolean
language plpgsql stable security definer set search_path = pg_catalog, app, private, storage as $f$
declare p text[] := storage.foldername(p_name); v_ig uuid; v_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if app.current_user_account_id() is null or p is null or coalesce(array_length(p, 1), 0) < 2 or p[1] !~* v_re then return false; end if;
  v_ig := p[1]::uuid;
  if not app.can_access_storage_church(v_ig) then return false; end if;
  if p_bucket = '2gather-private' then
    if p[2] <> 'farmacia' then return false; end if;
    if p_op = 'select' then
      return private.v39_est_can_any(v_ig, array['pharmacy.prescriptions.view','pharmacy.deliveries.create','pharmacy.deliveries.complete','pharmacy.audit']);
    elsif p_op in ('insert','update') then
      return private.v39_est_can_any(v_ig, array['pharmacy.deliveries.create','pharmacy.deliveries.complete','pharmacy.prescriptions.manage']);
    end if;
    return false;   -- delete
  elsif p_bucket = '2gather-media' then
    if p_op = 'select' then return true; end if;
    if p[2] = 'branding' then
      return p_op in ('insert','update') and private.has_active_profile_in_church(v_ig, array['master']);
    elsif p[2] = 'gcs' then
      return coalesce(array_length(p, 1), 0) >= 3 and p[3] ~* v_re and private.can_view_growth_group(p[3]::uuid)
             and exists (select 1 from app.growth_groups g where g.id = p[3]::uuid and g.church_id = v_ig);
    elsif p[2] = 'ministerios' then
      return true;    -- a regra restritiva v39_min_media_* decide (KIDS)
    end if;
    return false;
  end if;
  return false;
end $f$;

revoke all on function private.v39_sto_pode(text, text, text) from public, anon;
grant execute on function private.v39_sto_pode(text, text, text) to authenticated;

drop policy if exists "2gather_storage_select" on storage.objects;
drop policy if exists "2gather_storage_insert" on storage.objects;
drop policy if exists "2gather_storage_update" on storage.objects;
drop policy if exists "2gather_storage_delete" on storage.objects;

create policy "2gather_storage_select" on storage.objects for select to authenticated
  using (bucket_id in ('2gather-media', '2gather-private') and private.v39_sto_pode(bucket_id, name, 'select'));
create policy "2gather_storage_insert" on storage.objects for insert to authenticated
  with check (bucket_id in ('2gather-media', '2gather-private') and private.v39_sto_pode(bucket_id, name, 'insert'));
create policy "2gather_storage_update" on storage.objects for update to authenticated
  using (bucket_id in ('2gather-media', '2gather-private') and private.v39_sto_pode(bucket_id, name, 'update'))
  with check (bucket_id in ('2gather-media', '2gather-private') and private.v39_sto_pode(bucket_id, name, 'update'));
create policy "2gather_storage_delete" on storage.objects for delete to authenticated
  using (bucket_id in ('2gather-media', '2gather-private') and private.v39_sto_pode(bucket_id, name, 'delete'));

commit;

-- VERIFICACAO (tudo deve ser true)
select
  (select count(*) from pg_policies where schemaname = 'storage' and policyname like '2gather_storage_%' and coalesce(qual, with_check) like '%v39_sto_pode%') = 4 as regras_ok,
  not has_function_privilege('anon', 'private.v39_sto_pode(text,text,text)', 'EXECUTE') as anon_fechado,
  has_function_privilege('authenticated', 'private.v39_sto_pode(text,text,text)', 'EXECUTE') as authenticated_ok;
