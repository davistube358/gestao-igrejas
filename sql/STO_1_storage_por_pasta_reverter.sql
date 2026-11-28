-- =====================================================================
-- STO_1 · regras do Storage por pasta · REVERTER
-- Volta as 4 regras antigas (qualquer membro ativo lê, grava, troca e apaga nos dois buckets) e remove a função.
-- Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

drop policy if exists "2gather_storage_select" on storage.objects;
drop policy if exists "2gather_storage_insert" on storage.objects;
drop policy if exists "2gather_storage_update" on storage.objects;
drop policy if exists "2gather_storage_delete" on storage.objects;

create policy "2gather_storage_select" on storage.objects for select to authenticated
  using ((bucket_id = any (array['2gather-media'::text, '2gather-private'::text])) and app.can_access_storage_church(((storage.foldername(name))[1])::uuid));
create policy "2gather_storage_insert" on storage.objects for insert to authenticated
  with check ((bucket_id = any (array['2gather-media'::text, '2gather-private'::text])) and app.can_access_storage_church(((storage.foldername(name))[1])::uuid));
create policy "2gather_storage_update" on storage.objects for update to authenticated
  using ((bucket_id = any (array['2gather-media'::text, '2gather-private'::text])) and app.can_access_storage_church(((storage.foldername(name))[1])::uuid))
  with check ((bucket_id = any (array['2gather-media'::text, '2gather-private'::text])) and app.can_access_storage_church(((storage.foldername(name))[1])::uuid));
create policy "2gather_storage_delete" on storage.objects for delete to authenticated
  using ((bucket_id = any (array['2gather-media'::text, '2gather-private'::text])) and app.can_access_storage_church(((storage.foldername(name))[1])::uuid));

drop function if exists private.v39_sto_pode(text, text, text);

commit;
