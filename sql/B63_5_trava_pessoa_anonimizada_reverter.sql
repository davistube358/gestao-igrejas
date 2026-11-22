-- =====================================================================
-- B63_5 · LGPD · Trava de pessoa anonimizada/restringida · REVERTER
-- Build 63 · QA63-01 · 22/11/2026
-- ---------------------------------------------------------------------
-- Remove os 4 gatilhos e as 3 funcoes de gatilho e devolve app.v39_person_legacy_base ao texto de
--   22/11/2026 (sem 'anonimizadoEm'/'restritoLgpd'). Nao toca em dados.
-- QA63R-01: devolve tambem app.v39_list_people e a policy v39_people_select_accessible_church de app.people
--   ao texto de 22/11/2026 (sem o filtro da pessoa restringida). ATENCAO: pessoa restringida volta a
--   aparecer na lista de Pessoas de todos os perfis.
-- D4: remove app.v39_privacy_restricted_list e app.v39_privacy_restriction_lift (o gatilho sai junto com os demais).
--   Restricoes ja desfeitas continuam desfeitas (historico e audit ficam).
-- Devolve tambem app.search_people ao texto de 22/11/2026 (restringida volta a aparecer para quem tem
--   people.view_restricted).
-- ATENCAO: sem a trava, pessoas ja anonimizadas voltam a aceitar edicao pelo servidor.
-- Ordem de reversao do Build 63: B63_9 -> B63_5 -> B63_2 -> B63_3 -> B63_1 (reverter antes do B63_2,
--   que remove a coluna anonymized_at lida aqui).
-- =====================================================================
begin;

drop function if exists app.v39_privacy_restriction_lift(uuid,uuid,text);
drop function if exists app.v39_privacy_restricted_list(uuid);
drop trigger if exists trg_v39_lgpd_guard_people on app.people;
drop trigger if exists trg_v39_lgpd_guard_contacts on app.person_contacts;
drop trigger if exists trg_v39_lgpd_guard_addresses on app.person_addresses;
drop trigger if exists trg_v39_lgpd_guard_church_people on app.church_people;
drop function if exists private.v39_lgpd_guard_people();
drop function if exists private.v39_lgpd_guard_person_child();
drop function if exists private.v39_lgpd_guard_church_people();

-- texto original (22/11/2026; o md5 pode diferir do original so por quebra de linha CRLF/LF)
create or replace function app.v39_person_legacy_base(p_church_id uuid, p_person_id uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'pg_catalog', 'app', 'private'
as $function$
  select jsonb_build_object(
    'id', p.id, 'codigo', coalesce(p.person_code::text, ''),
    'nome', p.full_name, 'apelido', coalesce(p.preferred_name, ''),
    'nasc', coalesce(p.birth_date::text, ''), 'sexo', app.v39_sexo_legado(p.sex), 'obs', coalesce(p.notes, ''),
    'tipo',   case cp.status when 'visiting' then 'Visitante' when 'institute' then 'Instituto' else 'Membro' end,
    'status', case cp.status when 'visiting' then 'Em visita' when 'institute' then 'Instituto' when 'inactive' then 'Inativo'
                             when 'closed' then 'Inativo' when 'transferred' then 'Inativo' else 'Ativo' end,
    'aceitaVisita',    case cp.accepts_home_visit   when true then 'Sim' when false then 'Não' else '' end,
    'frequentaIgreja', case cp.attends_other_church when true then 'Sim' when false then 'Não' else '' end,
    'igrejaQual', coalesce(cp.attends_church_text, ''), 'canal', coalesce(cp.source, ''), 'canalOutro', coalesce(cp.source_other, ''),
    'gcId', coalesce((select m.growth_group_id::text from app.growth_group_memberships m
                       where m.person_id = p.id and m.role_type = 'participant' and m.ended_at is null
                         and m.status in ('active','pending','inactive')
                       order by m.updated_at desc limit 1), ''),
    'fone', coalesce((select c.contact_value from app.person_contacts c
                       where c.person_id = p.id and c.contact_type in ('whatsapp','phone') and c.valid_until is null
                       order by c.is_primary desc, c.created_at desc limit 1), ''),
    'cep', coalesce(a.postal_code, ''), 'endereco', coalesce(a.street, ''), 'numero', coalesce(a.street_number, ''),
    'complemento', coalesce(a.complement, ''), 'bairro', coalesce(a.district, ''), 'cidade', coalesce(a.city, ''),
    'criadoPor', coalesce(to_jsonb(cp)->>'created_by', to_jsonb(cp)->>'created_by_user_account_id',
                          to_jsonb(p)->>'created_by_user_account_id', to_jsonb(p)->>'created_by', ''),
    'criadoEm', coalesce(cp.created_at, p.created_at),
    'jornada', coalesce(cp.journey_stage, case when cp.status = 'institute' then 'Instituto' else '' end),
    'deleted', cp.status = 'closed', 'updatedAt', greatest(p.updated_at, cp.updated_at), '_supabase', true)
  from app.people p
  join app.church_people cp on cp.person_id = p.id and cp.church_id = p_church_id
  left join lateral (select * from app.person_addresses x
                      where x.person_id = p.id and x.valid_until is null
                      order by x.is_primary desc, x.created_at desc limit 1) a on true
  where p.id = p_person_id
  order by (cp.ended_at is null) desc, cp.started_at desc nulls last
  limit 1;
$function$;

-- texto original de app.v39_list_people (22/11/2026; md5 20e5487d... com CRLF; aqui LF)
create or replace function app.v39_list_people(p_church_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_map jsonb := '{}'::jsonb; v_l jsonb;
begin
  if app.current_user_account_id() is null
     or not private.has_active_profile_in_church(p_church_id, array['master','pastor','supervisor','leader','disciple']) then
    perform app.raise_domain_error('PERMISSION_DENIED','Sem permissao');
  end if;
  -- INST-4: auxílios do Instituto por pessoa (código). Sem acesso ao Instituto: lista vazia, sem erro.
  begin
    v_l := app.v39_inst_people(p_church_id => p_church_id, p_filtro => 'todos');
    select coalesce(jsonb_object_agg(k, a), '{}'::jsonb) into v_map from (
      select distinct on (ltrim(x->>'codigo', '0')) ltrim(x->>'codigo', '0') k, coalesce(x->'atividades', '[]'::jsonb) a
        from jsonb_array_elements(coalesce(v_l->'pessoas', '[]'::jsonb)) x
       where coalesce(x->>'codigo', '') <> '') t;
  exception when others then v_map := '{}'::jsonb;
  end;
  return coalesce((select jsonb_agg(l || jsonb_build_object('instAtividades', coalesce(v_map->ltrim(l->>'codigo', '0'), '[]'::jsonb)))
                     from (select app.v39_person_legacy(p_church_id, cp.person_id) l
                             from app.church_people cp
                            where cp.church_id = p_church_id and cp.status <> 'closed') s), '[]'::jsonb);
end;
$function$;

-- policy original de app.people (22/11/2026; md5 do qual 62eeb0de...)
drop policy if exists v39_people_select_accessible_church on app.people;
create policy v39_people_select_accessible_church on app.people as permissive for select to authenticated
  using (exists (select 1
                   from app.church_people cp
                   join app.church_user_access cua on cua.church_id = cp.church_id
                   join app.user_accounts ua on ua.id = cua.user_account_id
                  where cp.person_id = people.id and cp.ended_at is null and cua.status = 'active'
                    and ua.status = 'active' and ua.auth_user_id = auth.uid()));

-- texto original de app.search_people (22/11/2026; md5 ab3fe6f3... com CRLF; aqui LF)
create or replace function app.search_people(p_church_id uuid, p_query text default null::text, p_limit integer default 30)
 returns table(person_id uuid, full_name text, preferred_name text, status text, church_status text, primary_email text, primary_whatsapp text)
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'app'
as $function$
begin
  if not app.has_permission('people.view', p_church_id, 'church', p_church_id) then
    perform app.raise_domain_error('PERMISSION_DENIED', 'Permissao people.view obrigatoria');
  end if;
  return query
  select p.id, p.full_name, p.preferred_name, p.status, cp.status,
         (select pc.contact_value from app.person_contacts pc where pc.person_id = p.id and pc.contact_type = 'email' and pc.valid_until is null order by pc.is_primary desc, pc.created_at limit 1),
         (select pc.contact_value from app.person_contacts pc where pc.person_id = p.id and pc.contact_type = 'whatsapp' and pc.valid_until is null order by pc.is_primary desc, pc.created_at limit 1)
    from app.people p join app.church_people cp on cp.person_id = p.id and cp.church_id = p_church_id
   where cp.ended_at is null and p.status <> 'merged'
     and (p.status <> 'restricted' or app.has_permission('people.view_restricted', p_church_id, 'church', p_church_id))
     and (p_query is null or p.full_name ilike '%' || trim(p_query) || '%' or p.preferred_name ilike '%' || trim(p_query) || '%')
   order by p.full_name limit greatest(1, least(coalesce(p_limit, 30), 100));
end;
$function$;

commit;

-- VERIFICACAO (tudo deve ser true)
select
  (select count(*) = 0 from pg_trigger where tgname like 'trg_v39_lgpd_guard_%') as gatilhos_removidos,
  (select pg_get_functiondef('app.v39_person_legacy_base(uuid,uuid)'::regprocedure) not like '%restritoLgpd%') as leitura_original,
  (select pg_get_functiondef('app.v39_list_people(uuid)'::regprocedure) not like '%rp.status%') as lista_original,
  (select md5(qual) = '62eeb0de18914860aa1ffbe07ea645fd' from pg_policies where schemaname = 'app' and tablename = 'people'
     and policyname = 'v39_people_select_accessible_church') as rls_original,
  (select pg_get_functiondef('app.search_people(uuid,text,integer)'::regprocedure) like '%view_restricted%') as busca_original,
  (to_regprocedure('app.v39_privacy_restriction_lift(uuid,uuid,text)') is null
     and to_regprocedure('app.v39_privacy_restricted_list(uuid)') is null) as desfazer_removido;
