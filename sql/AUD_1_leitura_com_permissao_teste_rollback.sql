-- =====================================================================
-- AUD_1 · duas funções de leitura com permissão · TESTE COM ROLLBACK
-- ULTIMA EXECUCAO: 28/11/2026 (Claude, conector Supabase): TESTE AUD_1 CONCLUIDO (nada foi gravado): T1 ok; T2 ok; T3 ok
-- Casos: T1 discípulo recusado nas duas (PERMISSION_DENIED); T2 master consegue; T3 REVERTER volta ao corpo antigo.
-- NAO GRAVA NADA: tudo e desfeito pelo raise final.
-- =====================================================================
do $t$
declare v_c uuid := gen_random_uuid(); v_au_m uuid := gen_random_uuid(); v_au_d uuid := gen_random_uuid(); v_p uuid; v_ua uuid; v_cua uuid; r jsonb; v_res text := '';
begin
  -- APLICAR

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

  insert into app.churches (id, name, slug, timezone) values (v_c, 'Igreja AUD1', 'teste-aud1-' || left(v_c::text, 8), 'America/Sao_Paulo');
  insert into auth.users (id, email) values (v_au_m, 'aud1m@teste.invalid'), (v_au_d, 'aud1d@teste.invalid');
  insert into app.people (full_name) values ('AUD1 M') returning id into v_p;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_m, v_p, 'active', now(), 'taud1m') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_c, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) select v_cua, id, true, now() - interval '1 day' from app.access_profiles where code = 'master';
  insert into app.people (full_name) values ('AUD1 D') returning id into v_p;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_d, v_p, 'active', now(), 'taud1d') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_c, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) select v_cua, id, true, now() - interval '1 day' from app.access_profiles where code = 'disciple';
  -- T1
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_d, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_d::text, true);
  begin set local role authenticated; perform app.v39_check_person_duplicate(v_c, 'AUD'); reset role; raise exception 'FALHOU T1a';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'PERMISSION_DENIED' then raise exception 'FALHOU T1a: %', sqlerrm; end if; end;
  begin set local role authenticated; perform app.v39_list_entity_files(v_c, 'app', 'people', v_p); reset role; raise exception 'FALHOU T1b';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'PERMISSION_DENIED' then raise exception 'FALHOU T1b: %', sqlerrm; end if; end;
  v_res := v_res || 'T1 ok; ';
  -- T2
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  begin set local role authenticated; r := app.v39_check_person_duplicate(v_c, 'AUD'); r := app.v39_list_entity_files(v_c, 'app', 'people', v_p); reset role;
  exception when others then reset role; raise exception 'FALHOU T2: % %', sqlstate, sqlerrm; end;
  v_res := v_res || 'T2 ok; ';
  -- T3 REVERTER

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

  if position('people.view' in pg_get_functiondef('app.v39_check_person_duplicate(uuid,text)'::regprocedure)) > 0
     or position('files.view' in pg_get_functiondef('app.v39_list_entity_files(uuid,text,text,uuid)'::regprocedure)) > 0 then raise exception 'FALHOU T3'; end if;
  v_res := v_res || 'T3 ok';
  raise exception 'TESTE AUD_1 CONCLUIDO (nada foi gravado): %', v_res;
end $t$;
