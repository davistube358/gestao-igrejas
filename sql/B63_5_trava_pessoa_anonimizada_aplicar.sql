-- =====================================================================
-- B63_5 · LGPD · Trava de pessoa anonimizada/restringida · APLICAR
-- Build 63 · QA63-01 (MAJOR) · 22/11/2026
-- VALIDACAO: ver cabecalho de B63_5_trava_pessoa_anonimizada_teste_rollback.sql
-- ---------------------------------------------------------------------
-- Problema (QA63-01): depois da anonimizacao/restricao, o servidor nao recusava edicao da pessoa
--   e a leitura do app nao dizia que ela estava anonimizada/restringida. Um sync reabria o botao
--   "Anonimizar" e a edicao, permitindo regravar dados pessoais (reidentificacao).
-- O que faz:
--   1. Gatilho em app.people: pessoa anonimizada (anonymized_at) ou restringida (status 'restricted')
--      nao muda nome, apelido, nascimento, sexo, CPF, observacoes, foto, status, fusao nem a marca.
--      Unica transicao permitida: restringida -> anonimizada (execucao do B63_2). Toques que so
--      mudam updated_at/updated_by passam.
--   2. Gatilho em app.person_contacts e app.person_addresses: nao inclui nem reabre (valid_until nulo)
--      contato/endereco dessas pessoas. Encerrar/mascarar (valid_until preenchido) continua permitido.
--   3. Gatilho em app.church_people: vinculo de pessoa ANONIMIZADA nao e criado nem reaberto
--      (fica 'closed' com ended_at). Restringida continua com o vinculo editavel (jornada, GC).
--   4. app.v39_person_legacy_base (leitura do sync do app, via v39_list_people/v39_person_legacy)
--      passa a devolver 'anonimizadoEm' (timestamptz ou null) e 'restritoLgpd' (boolean).
--      Chaves novas; nenhuma chave existente muda.
-- Por que gatilho e nao alterar cada RPC: cobre todas as escritas (update_person, v39_save_person,
--   set_person_cpf, register_person_photo, v39_inst_*, futuras) sem reescrever funcoes grandes.
--   Codigos de erro: PERSON_ANONYMIZED / PERSON_RESTRICTED (app.raise_domain_error, P0001).
-- Hoje: 0 pessoas com status 'restricted' e coluna anonymized_at inexistente (conferido em 22/11):
--   nenhum registro atual passa a ficar bloqueado.
-- app.list_people (usada so pela acao 'buscarPessoa' do G2_V39.p1, sem chamada no front) NAO muda.
-- Ordem do Build 63: B63_1 -> B63_9 -> B63_3 -> B63_2 -> B63_5 (exige as colunas do B63_2).
-- Reverter: B63_5_trava_pessoa_anonimizada_reverter.sql (antes de reverter o B63_2).
-- Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

do $g$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'app' and table_name = 'people' and column_name = 'anonymized_at') then
    raise exception 'B63_5 ABORTADO: aplique o B63_2 antes (falta app.people.anonymized_at). Nada foi alterado.';
  end if;
  if md5(pg_get_functiondef('app.v39_person_legacy_base(uuid,uuid)'::regprocedure)) <> 'bb32b6486a2223e0a3b4417a412cef9f' then
    raise exception 'B63_5 ABORTADO: app.v39_person_legacy_base mudou desde 22/11/2026 (md5). Nada foi alterado.';
  end if;
end $g$;

create or replace function private.v39_lgpd_guard_people() returns trigger
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
begin
  if old.anonymized_at is null and old.status <> 'restricted' then return new; end if;
  if old.anonymized_at is null and new.anonymized_at is not null then return new; end if;   -- restringida -> anonimizada (B63_2)
  if (new.full_name, new.preferred_name, new.birth_date, new.sex, new.cpf, new.notes, new.photo_file_id,
      new.status, new.merged_into_person_id, new.anonymized_at)
     is distinct from
     (old.full_name, old.preferred_name, old.birth_date, old.sex, old.cpf, old.notes, old.photo_file_id,
      old.status, old.merged_into_person_id, old.anonymized_at) then
    if old.anonymized_at is not null then
      perform app.raise_domain_error('PERSON_ANONYMIZED', 'Pessoa anonimizada (LGPD): o cadastro nao pode ser alterado');
    end if;
    perform app.raise_domain_error('PERSON_RESTRICTED', 'Pessoa com tratamento restrito (LGPD): o cadastro nao pode ser alterado');
  end if;
  return new;
end $f$;

create or replace function private.v39_lgpd_guard_person_child() returns trigger
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_code text;
begin
  if tg_op = 'UPDATE' and new.valid_until is not null then return new; end if;   -- encerrar/mascarar sempre pode
  select case when p.anonymized_at is not null then 'PERSON_ANONYMIZED' when p.status = 'restricted' then 'PERSON_RESTRICTED' end
    into v_code from app.people p where p.id = new.person_id;
  if v_code is not null then
    perform app.raise_domain_error(v_code, 'Pessoa com dados bloqueados (LGPD): contato ou endereco nao pode ser incluido nem reaberto');
  end if;
  return new;
end $f$;

create or replace function private.v39_lgpd_guard_church_people() returns trigger
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
begin
  if new.status = 'closed' and new.ended_at is not null then return new; end if;
  if exists (select 1 from app.people p where p.id = new.person_id and p.anonymized_at is not null) then
    perform app.raise_domain_error('PERSON_ANONYMIZED', 'Pessoa anonimizada (LGPD): o vinculo com a igreja nao pode ser criado nem reaberto');
  end if;
  return new;
end $f$;

revoke all on function private.v39_lgpd_guard_people(), private.v39_lgpd_guard_person_child(), private.v39_lgpd_guard_church_people()
  from public, anon, authenticated;

drop trigger if exists trg_v39_lgpd_guard_people on app.people;
create trigger trg_v39_lgpd_guard_people before update on app.people
  for each row execute function private.v39_lgpd_guard_people();
drop trigger if exists trg_v39_lgpd_guard_contacts on app.person_contacts;
create trigger trg_v39_lgpd_guard_contacts before insert or update on app.person_contacts
  for each row execute function private.v39_lgpd_guard_person_child();
drop trigger if exists trg_v39_lgpd_guard_addresses on app.person_addresses;
create trigger trg_v39_lgpd_guard_addresses before insert or update on app.person_addresses
  for each row execute function private.v39_lgpd_guard_person_child();
drop trigger if exists trg_v39_lgpd_guard_church_people on app.church_people;
create trigger trg_v39_lgpd_guard_church_people before insert or update on app.church_people
  for each row execute function private.v39_lgpd_guard_church_people();

-- igual ao original (md5 bb32b648...), mais 'anonimizadoEm' e 'restritoLgpd' no fim do objeto
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
    || jsonb_build_object('anonimizadoEm', p.anonymized_at, 'restritoLgpd', p.status = 'restricted' and p.anonymized_at is null)
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

-- ---------------------------------------------------------------------
-- VERIFICACAO (rodar depois do commit; tudo deve ser true)
-- ---------------------------------------------------------------------
select
  (select count(*) = 4 from pg_trigger where not tgisinternal and tgname in
     ('trg_v39_lgpd_guard_people','trg_v39_lgpd_guard_contacts','trg_v39_lgpd_guard_addresses','trg_v39_lgpd_guard_church_people')) as gatilhos_ok,
  (select pg_get_functiondef('app.v39_person_legacy_base(uuid,uuid)'::regprocedure) like '%restritoLgpd%') as leitura_ok,
  not has_function_privilege('authenticated', 'private.v39_lgpd_guard_people()', 'EXECUTE') as gatilho_fechado,
  (select count(*) = 0 from app.people where status = 'restricted' and anonymized_at is null
     and not exists (select 1 from app.data_subject_requests d where d.person_id = people.id and d.response_reference = 'restricted_health_retention')) as sem_restrito_fora_lgpd;
