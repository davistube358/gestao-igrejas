-- =====================================================================
-- MIN_2 · Ministérios · logo e faixa · TESTE COM ROLLBACK
-- Rodar inteiro no SQL Editor. Resultado esperado (é um ERRO de propósito, nada fica gravado):
--   ERROR P0001: TESTE MIN_2 CONCLUIDO (nada foi gravado): T1 ok; T2 ok; T3 ok; T4 ok; T5 ok; T6 ok; T7 ok; T8 ok; T9 ok (REVERTER ok)
--   T1  líder do Kids grava o logo do Kids
--   T2  voluntário do Kids não grava (RLS)
--   T3  pessoa da igreja sem vínculo com o ministério não grava (RLS)
--   T4  master grava a faixa do Kids
--   T5  líder não grava nome de arquivo fora do padrão nem na pasta de outro ministério
--   T6  regra geral intacta: voluntário continua gravando na pasta de GC
--   T7  v39_min_list devolve logo e faixa (as mais recentes) para o voluntário
--   T8  troca (UPDATE): voluntário não altera o objeto (0 linhas); líder altera (1 linha)
--   T9  REVERTER: políticas e funções somem, v39_min_list volta sem logo/faixa
-- NAO GRAVA NADA: tudo e desfeito pelo raise final.
-- =====================================================================
do $t$
declare
  v_ch uuid := gen_random_uuid();
  v_au_m uuid := gen_random_uuid(); v_au_l uuid := gen_random_uuid(); v_au_v uuid := gen_random_uuid(); v_au_o uuid := gen_random_uuid();
  v_p_m uuid; v_p_l uuid; v_p_v uuid; v_p_o uuid;
  v_ua uuid; v_cua uuid; v_prof uuid;
  v_kids uuid; v_louvor uuid; v_logo text; v_logo2 text; v_faixa text;
  r jsonb; v_n int; v_res text := '';
begin
  -- APLICAR (identico ao _aplicar, sem begin/commit)
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


  -- DADOS DE TESTE ---------------------------------------------------
  insert into app.churches (id, name, slug, timezone) values (v_ch, 'Igreja Teste MIN_2', 'teste-min2-' || left(v_ch::text, 8), 'America/Sao_Paulo');
  insert into auth.users (id, email) values (v_au_m, 'm2m@teste.invalid'), (v_au_l, 'm2l@teste.invalid'), (v_au_v, 'm2v@teste.invalid'), (v_au_o, 'm2o@teste.invalid');
  insert into app.people (full_name) values ('M2 Master') returning id into v_p_m;
  insert into app.people (full_name) values ('M2 Lider Kids') returning id into v_p_l;
  insert into app.people (full_name) values ('M2 Voluntario') returning id into v_p_v;
  insert into app.people (full_name) values ('M2 De Fora') returning id into v_p_o;
  insert into app.church_people (church_id, person_id, status) values (v_ch, v_p_m, 'active'), (v_ch, v_p_l, 'active'), (v_ch, v_p_v, 'active'), (v_ch, v_p_o, 'active');

  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_m, v_p_m, 'active', now(), 'm2m') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  select id into v_prof from app.access_profiles where code = 'master';
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');

  select id into v_prof from app.access_profiles where code = 'disciple';
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_l, v_p_l, 'active', now(), 'm2l') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_v, v_p_v, 'active', now(), 'm2v') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_o, v_p_o, 'active', now(), 'm2o') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');

  -- master cria o Kids (líder L) e o Louvor (sem líder); líder inclui V no Kids
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  set local role authenticated;
  r := app.v39_min_save(v_ch, jsonb_build_object('nome', 'Kids', 'tipo', 'kids', 'liderId', v_p_l)); v_kids := (r->>'id')::uuid;
  r := app.v39_min_save(v_ch, jsonb_build_object('nome', 'Louvor', 'tipo', 'general')); v_louvor := (r->>'id')::uuid;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_l, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_l::text, true);
  set local role authenticated;
  perform app.v39_min_member_set(v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_p_v));
  reset role;

  v_logo := v_ch || '/ministerios/' || v_kids || '/logo-1700000000001.jpg';
  v_logo2 := v_ch || '/ministerios/' || v_kids || '/logo-1700000000002.png';
  v_faixa := v_ch || '/ministerios/' || v_kids || '/faixa-1700000000003.jpg';

  -- T1 líder grava o logo
  begin
    set local role authenticated;
    insert into storage.objects (bucket_id, name, metadata) values ('2gather-media', v_logo, '{"mimetype":"image/jpeg"}');
    reset role;
  exception when others then reset role; raise exception 'FALHOU T1: % %', sqlstate, sqlerrm;
  end;
  v_res := v_res || 'T1 ok; ';

  -- T2 voluntário não grava
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_v, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_v::text, true);
  begin
    set local role authenticated;
    insert into storage.objects (bucket_id, name, metadata) values ('2gather-media', v_ch || '/ministerios/' || v_kids || '/faixa-1700000000009.jpg', '{}');
    reset role; raise exception 'FALHOU T2';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlstate <> '42501' then raise exception 'FALHOU T2: % %', sqlstate, sqlerrm; end if;
  end;
  v_res := v_res || 'T2 ok; ';

  -- T3 de fora não grava
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_o, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_o::text, true);
  begin
    set local role authenticated;
    insert into storage.objects (bucket_id, name, metadata) values ('2gather-media', v_ch || '/ministerios/' || v_kids || '/logo-1700000000008.jpg', '{}');
    reset role; raise exception 'FALHOU T3';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlstate <> '42501' then raise exception 'FALHOU T3: % %', sqlstate, sqlerrm; end if;
  end;
  v_res := v_res || 'T3 ok; ';

  -- T4 master grava a faixa
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  begin
    set local role authenticated;
    insert into storage.objects (bucket_id, name, metadata) values ('2gather-media', v_faixa, '{"mimetype":"image/jpeg"}');
    reset role;
  exception when others then reset role; raise exception 'FALHOU T4: % %', sqlstate, sqlerrm;
  end;
  v_res := v_res || 'T4 ok; ';

  -- T5 líder: nome fora do padrão e pasta de outro ministério
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_l, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_l::text, true);
  begin
    set local role authenticated;
    insert into storage.objects (bucket_id, name, metadata) values ('2gather-media', v_ch || '/ministerios/' || v_kids || '/qualquer.jpg', '{}');
    reset role; raise exception 'FALHOU T5a';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlstate <> '42501' then raise exception 'FALHOU T5a: % %', sqlstate, sqlerrm; end if;
  end;
  begin
    set local role authenticated;
    insert into storage.objects (bucket_id, name, metadata) values ('2gather-media', v_ch || '/ministerios/' || v_louvor || '/logo-1700000000007.jpg', '{}');
    reset role; raise exception 'FALHOU T5b';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlstate <> '42501' then raise exception 'FALHOU T5b: % %', sqlstate, sqlerrm; end if;
  end;
  -- o mais novo vira o logo atual
  begin
    set local role authenticated;
    insert into storage.objects (bucket_id, name, metadata, created_at) values ('2gather-media', v_logo2, '{"mimetype":"image/png"}', now() + interval '1 second');
    reset role;
  exception when others then reset role; raise exception 'FALHOU T5c: % %', sqlstate, sqlerrm;
  end;
  v_res := v_res || 'T5 ok; ';

  -- T6 voluntário continua gravando na pasta de GC (regra geral)
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_v, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_v::text, true);
  begin
    set local role authenticated;
    insert into storage.objects (bucket_id, name, metadata) values ('2gather-media', v_ch || '/gcs/' || gen_random_uuid() || '/foto-1700000000000.jpg', '{}');
    reset role;
  exception when others then reset role; raise exception 'FALHOU T6: % %', sqlstate, sqlerrm;
  end;
  v_res := v_res || 'T6 ok; ';

  -- T7 lista devolve logo/faixa ao voluntário
  begin
    set local role authenticated; r := app.v39_min_list(v_ch); reset role;
  exception when others then reset role; raise exception 'FALHOU T7: % %', sqlstate, sqlerrm;
  end;
  select x into r from jsonb_array_elements(r) x where x->>'id' = v_kids::text;
  if r->>'logo' is distinct from v_logo2 then raise exception 'FALHOU T7a: logo=% (esperado %)', r->>'logo', v_logo2; end if;
  if r->>'faixa' is distinct from v_faixa then raise exception 'FALHOU T7b: faixa=%', r->>'faixa'; end if;
  v_res := v_res || 'T7 ok; ';

  -- T8 UPDATE: voluntário não altera; líder altera
  set local role authenticated;
  update storage.objects set metadata = '{"mimetype":"image/jpeg","t":"v"}' where bucket_id = '2gather-media' and name = v_logo;
  get diagnostics v_n = row_count;
  reset role;
  if v_n <> 0 then raise exception 'FALHOU T8a: voluntario alterou % objeto(s)', v_n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_l, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_l::text, true);
  set local role authenticated;
  update storage.objects set metadata = '{"mimetype":"image/jpeg","t":"l"}' where bucket_id = '2gather-media' and name = v_logo;
  get diagnostics v_n = row_count;
  reset role;
  if v_n <> 1 then raise exception 'FALHOU T8b: lider alterou % objeto(s)', v_n; end if;
  v_res := v_res || 'T8 ok; ';

  -- T9 REVERTER
  reset role;
  -- REVERTER (identico ao _reverter, sem begin/commit)
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


  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'v39_min_media_%') then raise exception 'FALHOU T9a: politicas ficaram'; end if;
  if exists (select 1 from pg_proc where proname in ('v39_min_media', 'v39_min_media_can_write')) then raise exception 'FALHOU T9b: funcoes ficaram'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  begin
    set local role authenticated; r := app.v39_min_list(v_ch); reset role;
  exception when others then reset role; raise exception 'FALHOU T9c: % %', sqlstate, sqlerrm;
  end;
  if jsonb_array_length(r) <> 2 or exists (select 1 from jsonb_array_elements(r) x where x ? 'logo' or x ? 'faixa') then raise exception 'FALHOU T9d: lista %', r; end if;
  v_res := v_res || 'T9 ok (REVERTER ok)';

  raise exception 'TESTE MIN_2 CONCLUIDO (nada foi gravado): %', v_res;
end
$t$;
