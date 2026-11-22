-- =====================================================================
-- B63_5 · LGPD · Trava de pessoa anonimizada/restringida · REVERTER
-- Build 63 · QA63-01 · 22/11/2026
-- ---------------------------------------------------------------------
-- Remove os 4 gatilhos e as 3 funcoes de gatilho e devolve app.v39_person_legacy_base ao texto de
--   22/11/2026 (sem 'anonimizadoEm'/'restritoLgpd'). Nao toca em dados.
-- ATENCAO: sem a trava, pessoas ja anonimizadas voltam a aceitar edicao pelo servidor.
-- Ordem de reversao do Build 63: B63_9 -> B63_5 -> B63_2 -> B63_3 -> B63_1 (reverter antes do B63_2,
--   que remove a coluna anonymized_at lida aqui).
-- =====================================================================
begin;

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

commit;

-- VERIFICACAO (tudo deve ser true)
select
  (select count(*) = 0 from pg_trigger where tgname like 'trg_v39_lgpd_guard_%') as gatilhos_removidos,
  (select pg_get_functiondef('app.v39_person_legacy_base(uuid,uuid)'::regprocedure) not like '%restritoLgpd%') as leitura_original;
