-- =====================================================================
-- STO_1 · regras do Storage por pasta · TESTE COM ROLLBACK
-- ULTIMA EXECUCAO: 28/11/2026, pelo Diogo no editor: TESTE STO_1 CONCLUIDO (nada foi gravado): T1 ok; T2 ok; T3 ok; T4 ok; T5 ok; T6 ok; T7 ok (REVERTER ok)
-- Casos (avaliando private.v39_sto_pode como cada usuário fictício):
--   T1  discípulo: lê mídia; não grava logo nem foto de GC; não lê nem grava receita
--   T2  profissional de saúde: lê e grava receita; não apaga; não troca o logo
--   T3  master: troca o logo (não apaga); grava/apaga foto do GC; lê receita
--   T4  master de outra igreja: nada na igreja alheia; GC de outra igreja recusado
--   T5  caminhos inválidos recusados
--   T6  as 4 regras novas usam a função
--   T7  REVERTER volta as regras antigas e remove a função
-- NAO GRAVA NADA: tudo e desfeito pelo raise final.
-- =====================================================================
do $t$
declare
  v_c uuid := gen_random_uuid(); v_o uuid := gen_random_uuid(); v_g uuid; v_go uuid;
  v_au_m uuid := gen_random_uuid(); v_au_d uuid := gen_random_uuid(); v_au_h uuid := gen_random_uuid(); v_au_x uuid := gen_random_uuid();
  v_p uuid; v_ua uuid; v_cua uuid; v_res text := ''; ok boolean;
  pf text; pb text; pg text;
begin
  -- APLICAR (identico ao _aplicar, sem begin/commit)

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


  insert into app.churches (id, name, slug, timezone) values (v_c, 'Igreja STO1', 'teste-sto1-' || left(v_c::text, 8), 'America/Sao_Paulo'),
                                                            (v_o, 'Outra STO1', 'teste-sto1o-' || left(v_o::text, 8), 'America/Sao_Paulo');
  insert into app.growth_groups (church_id, name) values (v_c, 'GC STO1') returning id into v_g;
  insert into app.growth_groups (church_id, name) values (v_o, 'GC Outra') returning id into v_go;
  insert into auth.users (id, email) values (v_au_m, 'sto1m@teste.invalid'), (v_au_d, 'sto1d@teste.invalid'), (v_au_h, 'sto1h@teste.invalid'), (v_au_x, 'sto1x@teste.invalid');
  -- master, discípulo e profissional de saúde na igreja; master na outra igreja
  insert into app.people (full_name) values ('STO1 M') returning id into v_p;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_m, v_p, 'active', now(), 'tsto1m') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_c, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) select v_cua, id, true, now() - interval '1 day' from app.access_profiles where code = 'master';
  insert into app.people (full_name) values ('STO1 D') returning id into v_p;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_d, v_p, 'active', now(), 'tsto1d') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_c, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) select v_cua, id, true, now() - interval '1 day' from app.access_profiles where code = 'disciple';
  insert into app.people (full_name) values ('STO1 H') returning id into v_p;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_h, v_p, 'active', now(), 'tsto1h') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_c, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) select v_cua, id, true, now() - interval '1 day' from app.access_profiles where code = 'health_professional';
  insert into app.people (full_name) values ('STO1 X') returning id into v_p;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_x, v_p, 'active', now(), 'tsto1x') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_o, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) select v_cua, id, true, now() - interval '1 day' from app.access_profiles where code = 'master';

  pf := v_c::text || '/farmacia/2026/11/r1.jpg'; pb := v_c::text || '/branding/logo-1.png'; pg := v_c::text || '/gcs/' || v_g::text || '/foto-1.jpg';

  -- T1 discípulo
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_d, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_d::text, true);
  if not private.v39_sto_pode('2gather-media', pb, 'select') or private.v39_sto_pode('2gather-media', pb, 'insert') or private.v39_sto_pode('2gather-media', pb, 'update')
     or private.v39_sto_pode('2gather-media', pg, 'insert') or private.v39_sto_pode('2gather-media', pg, 'delete')
     or private.v39_sto_pode('2gather-private', pf, 'select') or private.v39_sto_pode('2gather-private', pf, 'insert') then raise exception 'FALHOU T1'; end if;
  v_res := v_res || 'T1 ok; ';

  -- T2 profissional de saúde
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_h, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_h::text, true);
  if not private.v39_sto_pode('2gather-private', pf, 'select') or not private.v39_sto_pode('2gather-private', pf, 'insert')
     or private.v39_sto_pode('2gather-private', pf, 'delete') or private.v39_sto_pode('2gather-media', pb, 'insert') then raise exception 'FALHOU T2'; end if;
  v_res := v_res || 'T2 ok; ';

  -- T3 master
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  if not private.v39_sto_pode('2gather-media', pb, 'insert') or not private.v39_sto_pode('2gather-media', pb, 'update') or private.v39_sto_pode('2gather-media', pb, 'delete')
     or not private.v39_sto_pode('2gather-media', pg, 'insert') or not private.v39_sto_pode('2gather-media', pg, 'delete')
     or not private.v39_sto_pode('2gather-private', pf, 'select') or private.v39_sto_pode('2gather-private', v_c::text || '/outra/x.pdf', 'select') then raise exception 'FALHOU T3'; end if;
  v_res := v_res || 'T3 ok; ';

  -- T4 master de outra igreja
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_x, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_x::text, true);
  if private.v39_sto_pode('2gather-media', pb, 'select') or private.v39_sto_pode('2gather-media', pb, 'insert') or private.v39_sto_pode('2gather-private', pf, 'select')
     or private.v39_sto_pode('2gather-media', v_o::text || '/gcs/' || v_g::text || '/f.jpg', 'insert') then raise exception 'FALHOU T4'; end if;
  if not private.v39_sto_pode('2gather-media', v_o::text || '/gcs/' || v_go::text || '/f.jpg', 'insert') then raise exception 'FALHOU T4 proprio GC'; end if;
  v_res := v_res || 'T4 ok; ';

  -- T5 caminhos inválidos
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  if private.v39_sto_pode('2gather-media', 'abc/branding/x.png', 'insert') or private.v39_sto_pode('2gather-media', v_c::text || '/gcs/nao-uuid/f.jpg', 'insert')
     or private.v39_sto_pode('2gather-media', 'x.png', 'select') or private.v39_sto_pode('outro-bucket', pb, 'select') then raise exception 'FALHOU T5'; end if;
  v_res := v_res || 'T5 ok; ';

  -- T6
  if (select count(*) from pg_policies where schemaname = 'storage' and policyname like '2gather_storage_%' and coalesce(qual, with_check) like '%v39_sto_pode%') <> 4 then raise exception 'FALHOU T6'; end if;
  v_res := v_res || 'T6 ok; ';

  -- T7 REVERTER (identico ao _reverter, sem begin/commit)

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


  if to_regprocedure('private.v39_sto_pode(text,text,text)') is not null
     or (select count(*) from pg_policies where schemaname = 'storage' and policyname like '2gather_storage_%' and coalesce(qual, with_check) like '%can_access_storage_church%') <> 4 then raise exception 'FALHOU T7'; end if;
  v_res := v_res || 'T7 ok (REVERTER ok)';

  raise exception 'TESTE STO_1 CONCLUIDO (nada foi gravado): %', v_res;
end $t$;
