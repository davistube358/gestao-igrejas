-- =====================================================================
-- KIDS_2 · Famílias, ficha da criança, consentimento e fotos · APLICAR
-- 23/11/2026 · DATA · decisões do Diogo (chat, 23/11):
--   1. alergias/doenças: toda a equipe ativa do Kids vê (cada abertura fica na auditoria)
--   2. qualquer voluntário ativo do Kids cadastra famílias e crianças
--   3. situação da criança segue a família (responsável membro/frequentador -> criança frequenta), com opção de trocar
--   4. aos 12 anos sem CPF: frequentador com pendência de CPF
--   5. WhatsApp do responsável conferido pela mensagem da entrada (KIDS_3); aqui não se digita duas vezes
--   6. retira a criança: 12 anos ou mais e autorizado  [CONFIRMAR 12 ou 13]
--   7. aos 12: cadastro vai para o geral da igreja e sai do Kids (ficha de saúde encerrada e limpa; foto fica)
-- VALIDACAO: ver cabecalho de KIDS_2_familias_teste_rollback.sql
--
-- O que faz:
--   A. app.families, app.family_members (responsavel | crianca | outro; pode retirar; sem grau de parentesco)
--   B. app.kids_child_profiles (ficha cifrada com chave própria no Vault; só sinais "tem alergia/restrição" abertos)
--   C. finalidade LGPD kids_care por igreja (criada quando o primeiro consentimento é registrado)
--   D. foto: a equipe do Kids grava e vê a foto de pessoas de famílias ativas COM consentimento kids_care
--      (acrescenta um "ou" em app.v39_inst_photo_can_write; o resto da regra do Instituto fica igual)
--   E. RPCs app.v39_kids_*: busca sem duplicar, famílias, pessoa na família, consentimento, ficha, saída aos 12
-- Tabelas novas com RLS ligado e sem acesso direto: tudo passa pelas RPCs.
-- Requer KIDS_1. Reverter: KIDS_2_familias_reverter.sql
-- =====================================================================
begin;

-- KIDS2-BODY-BEGIN
do $g$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'app' and table_name = 'ministries' and column_name = 'kind') then
    raise exception 'KIDS_2 ABORTADO: KIDS_1 nao aplicado. Nada foi alterado.';
  end if;
  if to_regclass('app.families') is not null or to_regclass('app.family_members') is not null or to_regclass('app.kids_child_profiles') is not null then
    raise exception 'KIDS_2 ABORTADO: tabelas ja existem (KIDS_2 ja aplicado?). Nada foi alterado.';
  end if;
  if not exists (select 1 from vault.secrets where name = 'g2_kids_records_key_v1') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'g2_kids_records_key_v1', '2Gather Kids: chave da ficha da crianca');
  end if;
end $g$;

-- A. famílias ------------------------------------------------------------
create table app.families (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references app.churches(id) on update restrict on delete restrict,
  name text not null,
  status text not null default 'active',
  inactivated_at timestamptz,
  inactivation_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict,
  updated_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict,
  constraint families_name_not_blank check (length(btrim(name)) > 0),
  constraint families_status_check check (status in ('active','inactive')),
  constraint families_inactive_reason check (status = 'active' or (inactivated_at is not null and inactivation_reason is not null))
);
create index families_church_idx on app.families (church_id, status);

create table app.family_members (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references app.churches(id) on update restrict on delete restrict,
  family_id uuid not null references app.families(id) on update restrict on delete restrict,
  person_id uuid not null references app.people(id) on update restrict on delete restrict,
  role text not null,
  can_pick_up boolean not null default false,
  is_primary_contact boolean not null default false,
  status text not null default 'active',
  ended_at timestamptz,
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict,
  updated_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict,
  constraint family_members_role_check check (role in ('responsavel','crianca','outro')),
  constraint family_members_child_no_pickup check (role <> 'crianca' or (not can_pick_up and not is_primary_contact)),
  constraint family_members_status_check check (status in ('active','ended')),
  constraint family_members_end_reason check (status = 'active' or (ended_at is not null and end_reason is not null))
);
create unique index family_members_open_unique_idx on app.family_members (family_id, person_id) where status = 'active';
create index family_members_person_idx on app.family_members (church_id, person_id) where status = 'active';

-- B. ficha da criança (cifrada) -------------------------------------------
create table app.kids_child_profiles (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references app.churches(id) on update restrict on delete restrict,
  person_id uuid not null references app.people(id) on update restrict on delete restrict,
  payload_encrypted text,
  payload_version smallint not null default 1,
  has_allergy boolean not null default false,
  has_restriction boolean not null default false,
  status text not null default 'active',
  closed_at timestamptz,
  close_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict,
  updated_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict,
  constraint kids_child_profiles_status_check check (status in ('active','closed')),
  constraint kids_child_profiles_closed check (status = 'active' or (closed_at is not null and close_reason is not null and payload_encrypted is null))
);
create unique index kids_child_profiles_open_unique_idx on app.kids_child_profiles (church_id, person_id) where status = 'active';

create trigger families_set_updated_at before update on app.families for each row execute function app.set_updated_at();
create trigger family_members_set_updated_at before update on app.family_members for each row execute function app.set_updated_at();
create trigger kids_child_profiles_set_updated_at before update on app.kids_child_profiles for each row execute function app.set_updated_at();

alter table app.families enable row level security;
alter table app.family_members enable row level security;
alter table app.kids_child_profiles enable row level security;
revoke all on app.families, app.family_members, app.kids_child_profiles from public, anon, authenticated;

-- C/D. helpers --------------------------------------------------------------
create or replace function private.v39_kids_key() returns text
language plpgsql security definer set search_path = pg_catalog as $f$
declare v text;
begin
  select ds.decrypted_secret into v from vault.decrypted_secrets ds where ds.name = 'g2_kids_records_key_v1' limit 1;
  if v is null or length(v) < 32 then raise exception 'KIDS_RECORD_KEY_MISSING'; end if;
  return v;
end $f$;

create or replace function private.v39_kids_age(p_birth date) returns integer
language sql stable set search_path = pg_catalog as $f$
  select case when p_birth is null then null else date_part('year', age(current_date, p_birth))::integer end
$f$;

-- equipe do Kids: ministério do tipo kids, ativo, e quem chama tem papel nele (admin/leader/volunteer)
create or replace function private.v39_kids_need(p_church_id uuid, p_ministry_id uuid, p_level text) returns app.ministries
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare m app.ministries;
begin
  perform private.v39_min_need(p_church_id, p_ministry_id, p_level);
  select * into m from app.ministries where id = p_ministry_id;
  if m.id is null or m.kind <> 'kids' then perform app.raise_domain_error('KIDS_MINISTRY_REQUIRED', 'Use o ministerio Kids'); end if;
  if m.status <> 'active' then perform app.raise_domain_error('MIN_INACTIVE', 'O ministerio nao esta ativo'); end if;
  return m;
end $f$;

-- quem chama é da equipe ativa de algum Kids ativo da igreja
create or replace function private.v39_kids_is_team(p_church_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, app, private as $f$
  select exists (select 1 from app.ministries m where m.church_id = p_church_id and m.kind = 'kids' and m.status = 'active'
                  and private.v39_min_role(p_church_id, m.id) is not null)
$f$;

create or replace function private.v39_kids_purpose(p_church_id uuid) returns uuid
language plpgsql security definer set search_path = pg_catalog, app as $f$
declare v uuid;
begin
  select id into v from app.processing_purposes where church_id = p_church_id and code = 'kids_care';
  if v is null then
    insert into app.processing_purposes (church_id, code, name, description, requires_consent, is_system, is_active)
    values (p_church_id, 'kids_care', 'Cuidado de criancas no Kids',
            'Cadastro da crianca e de quem pode retira-la, foto do rosto para conferencia na entrega, alergias, doencas e restricoes enquanto a crianca participa do Kids (ate 12 anos).',
            true, false, true)
    on conflict do nothing;
    select id into v from app.processing_purposes where church_id = p_church_id and code = 'kids_care';
  end if;
  return v;
end $f$;

create or replace function private.v39_kids_has_consent(p_church_id uuid, p_person uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, app as $f$
  select exists (select 1 from app.person_consents c join app.processing_purposes pp on pp.id = c.purpose_id
                  where c.church_id = p_church_id and c.person_id = p_person and c.status = 'granted'
                    and pp.code = 'kids_care' and pp.church_id = p_church_id
                    and (c.valid_until is null or c.valid_until > now()))
$f$;

create or replace function private.v39_kids_in_family(p_church_id uuid, p_person uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, app as $f$
  select exists (select 1 from app.family_members fm join app.families f on f.id = fm.family_id
                  where fm.church_id = p_church_id and fm.person_id = p_person and fm.status = 'active' and f.status = 'active')
$f$;

-- foto: equipe do Kids, pessoa de família ativa, com consentimento kids_care
create or replace function private.v39_kids_photo_ok(p_church_id uuid, p_person uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, app, private as $f$
  select app.current_user_account_id() is not null
     and private.v39_kids_is_team(p_church_id)
     and private.v39_kids_in_family(p_church_id, p_person)
     and private.v39_kids_has_consent(p_church_id, p_person)
$f$;

-- regra do Instituto + "ou" do Kids (o corpo original fica igual)
create or replace function app.v39_inst_photo_can_write(p_church uuid, p_person uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, app, private as $f$
  select (app.current_user_account_id() is not null
     and (app.has_permission('institute.staff.manage', p_church, 'church', p_church)
          or ((app.has_permission('institute.sessions.manage', p_church, 'church', p_church)
               or app.has_permission('solidarity_market.deliveries.create', p_church, 'church', p_church)
               or app.has_permission('pharmacy.deliveries.create', p_church, 'church', p_church))
              and private.v39_inst_my_prof(p_church) is null))
     and exists (select 1 from app.church_people cp where cp.church_id = p_church and cp.person_id = p_person and cp.ended_at is null and cp.source = 'instituto'))
     or private.v39_kids_photo_ok(p_church, p_person)
$f$;

create or replace function private.v39_kids_audit(p_church_id uuid, p_category text, p_action text, p_entity text, p_id uuid,
                                                  p_person uuid, p_sensitivity text, p_reason text, p_meta jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
begin
  perform private.v39_audit_log(p_church_id, p_category, p_action, 'app', p_entity, p_id::text, p_person, p_sensitivity, 'success',
                                left(p_reason, 500), coalesce(p_meta, '{}'::jsonb));
end $f$;

create or replace function private.v39_kids_phone(p_raw text) returns text
language sql immutable set search_path = pg_catalog as $f$
  select case
           when d is null or d = '' then null
           when length(d) in (12, 13) and left(d, 2) = '55' then substr(d, 3)
           else d end
    from (select regexp_replace(coalesce(p_raw, ''), '\D', '', 'g') d) x
$f$;

create or replace function private.v39_kids_whatsapp(p_person uuid) returns text
language sql stable security definer set search_path = pg_catalog, app as $f$
  select coalesce(normalized_value, contact_value) from app.person_contacts
   where person_id = p_person and contact_type in ('whatsapp','phone') and valid_until is null
   order by (contact_type = 'whatsapp') desc, is_primary desc, created_at desc limit 1
$f$;

-- situação de criança nova: frequenta se algum responsável ativo da família frequenta/é membro; senão visitante
create or replace function private.v39_kids_family_status(p_family uuid) returns text
language sql stable security definer set search_path = pg_catalog, app as $f$
  select case when exists (select 1 from app.family_members fm join app.church_people cp on cp.person_id = fm.person_id and cp.church_id = fm.church_id and cp.ended_at is null
                            where fm.family_id = p_family and fm.status = 'active' and fm.role = 'responsavel'
                              and cp.status in ('active','integrated','member'))
              then 'active' else 'visiting' end
$f$;

create or replace function private.v39_kids_person_json(p_church_id uuid, p_person uuid, p_max integer) returns jsonb
language sql stable security definer set search_path = pg_catalog, app, private as $f$
  select jsonb_build_object(
           'pessoaId', p.id, 'nome', coalesce(nullif(btrim(p.preferred_name), ''), p.full_name), 'nomeCompleto', p.full_name,
           'nascimento', p.birth_date, 'idade', private.v39_kids_age(p.birth_date), 'sexo', p.sex,
           'situacao', cp.status, 'origem', cp.source, 'temFoto', p.photo_file_id is not null,
           'whatsapp', private.v39_kids_whatsapp(p.id),
           'consentimento', private.v39_kids_has_consent(p_church_id, p.id),
           'completouIdade', p_max is not null and private.v39_kids_age(p.birth_date) >= p_max,
           'temCpf', p.cpf is not null)
    from app.people p left join app.church_people cp on cp.person_id = p.id and cp.church_id = p_church_id and cp.ended_at is null
   where p.id = p_person
$f$;

-- E. RPCs -------------------------------------------------------------------
-- busca de pessoas da igreja para não duplicar (nome ou final do telefone); só nome, idade e final do telefone
create or replace function app.v39_kids_people_search(p_church_id uuid, p_ministry_id uuid, p_q text) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare v_q text := lower(btrim(coalesce(p_q, ''))); v_d text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
begin
  perform private.v39_kids_need(p_church_id, p_ministry_id, 'volunteer');
  if length(v_q) < 2 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(x.j order by x.nm) from (
      select lower(p.full_name) nm, jsonb_build_object(
               'id', p.id, 'nome', coalesce(nullif(btrim(p.preferred_name), ''), p.full_name),
               'idade', private.v39_kids_age(p.birth_date),
               'finalFone', right(private.v39_kids_whatsapp(p.id), 4),
               'situacao', cp.status,
               'emFamilia', private.v39_kids_in_family(p_church_id, p.id)) j
        from app.people p join app.church_people cp on cp.person_id = p.id and cp.church_id = p_church_id and cp.ended_at is null
       where cp.status <> 'closed' and p.status = 'active' and p.anonymized_at is null
         and (lower(p.full_name) like '%' || v_q || '%' or lower(coalesce(p.preferred_name, '')) like '%' || v_q || '%'
              or (length(v_d) >= 4 and exists (select 1 from app.person_contacts pc where pc.person_id = p.id and pc.valid_until is null
                                                  and pc.contact_type in ('whatsapp','phone') and coalesce(pc.normalized_value, '') like '%' || v_d)))
       order by lower(p.full_name) limit 20) x), '[]'::jsonb);
end $f$;

-- famílias da igreja (equipe do Kids), com os membros ativos
create or replace function app.v39_kids_families(p_church_id uuid, p_ministry_id uuid, p_q text default null, p_incluir_inativas boolean default false) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare m app.ministries := private.v39_kids_need(p_church_id, p_ministry_id, 'volunteer'); v_q text := lower(btrim(coalesce(p_q, '')));
begin
  return coalesce((
    select jsonb_agg(x.j order by x.nm) from (
      select lower(f.name) nm, jsonb_build_object(
               'id', f.id, 'nome', f.name, 'status', f.status, 'obs', f.notes, 'motivoInativacao', f.inactivation_reason,
               'membros', coalesce((select jsonb_agg(private.v39_kids_person_json(p_church_id, fm.person_id, m.max_age_years)
                                                     || jsonb_build_object('id', fm.id, 'papel', fm.role, 'podeRetirar', fm.can_pick_up,
                                                                           'contatoPrincipal', fm.is_primary_contact,
                                                                           'temFicha', exists (select 1 from app.kids_child_profiles k where k.church_id = p_church_id and k.person_id = fm.person_id and k.status = 'active'),
                                                                           'temAlergia', coalesce((select k.has_allergy from app.kids_child_profiles k where k.church_id = p_church_id and k.person_id = fm.person_id and k.status = 'active'), false),
                                                                           'temRestricao', coalesce((select k.has_restriction from app.kids_child_profiles k where k.church_id = p_church_id and k.person_id = fm.person_id and k.status = 'active'), false))
                                                     order by case fm.role when 'crianca' then 1 when 'responsavel' then 0 else 2 end, fm.created_at)
                                      from app.family_members fm where fm.family_id = f.id and fm.status = 'active'), '[]'::jsonb)) j
        from app.families f
       where f.church_id = p_church_id and (f.status = 'active' or coalesce(p_incluir_inativas, false))
         and (v_q = '' or lower(f.name) like '%' || v_q || '%'
              or exists (select 1 from app.family_members fm join app.people p on p.id = fm.person_id
                          where fm.family_id = f.id and fm.status = 'active'
                            and (lower(p.full_name) like '%' || v_q || '%' or lower(coalesce(p.preferred_name, '')) like '%' || v_q || '%')))
    ) x), '[]'::jsonb);
end $f$;

-- criar/alterar família; inativar é do líder (com motivo)
create or replace function app.v39_kids_family_save(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id(); v_min uuid := nullif(p->>'ministerioId', '')::uuid;
  v_id uuid := nullif(p->>'id', '')::uuid; v_nome text := nullif(btrim(p->>'nome'), '');
  v_status text := coalesce(nullif(btrim(p->>'status'), ''), 'active'); v_motivo text := nullif(btrim(p->>'motivo'), '');
  f app.families; v_old app.families;
begin
  perform private.v39_kids_need(p_church_id, v_min, case when v_status = 'inactive' then 'leader' else 'volunteer' end);
  if v_nome is null then perform app.raise_domain_error('KIDS_FAMILY_NAME_REQUIRED', 'Informe o nome da familia'); end if;
  if v_status not in ('active','inactive') then perform app.raise_domain_error('KIDS_STATUS_INVALID', 'Situacao invalida'); end if;
  if v_status = 'inactive' and v_motivo is null then perform app.raise_domain_error('REASON_REQUIRED', 'Informe o motivo'); end if;
  if v_id is null then
    if v_status <> 'active' then perform app.raise_domain_error('KIDS_STATUS_INVALID', 'Familia nova nasce ativa'); end if;
    insert into app.families (church_id, name, notes, created_by_user_account_id, updated_by_user_account_id)
    values (p_church_id, left(v_nome, 120), nullif(btrim(p->>'obs'), ''), v_me, v_me) returning * into f;
  else
    select * into v_old from app.families where id = v_id and church_id = p_church_id for update;
    if v_old.id is null then perform app.raise_domain_error('KIDS_FAMILY_NOT_FOUND', 'Familia nao encontrada'); end if;
    if v_old.status = 'inactive' and v_status = 'active' then
      perform private.v39_kids_need(p_church_id, v_min, 'leader');
    end if;
    update app.families set name = left(v_nome, 120), notes = nullif(btrim(p->>'obs'), ''), status = v_status,
           inactivated_at = case when v_status = 'inactive' then coalesce(inactivated_at, now()) end,
           inactivation_reason = case when v_status = 'inactive' then v_motivo end,
           updated_by_user_account_id = v_me
     where id = v_id returning * into f;
  end if;
  perform private.v39_kids_audit(p_church_id, case when v_old.id is not null and v_old.status <> f.status then 'status_change' else 'data_change' end,
                                 case when v_old.id is null then 'kids_family_created' else 'kids_family_updated' end, 'families', f.id, null, 'minor', v_motivo,
                                 jsonb_build_object('status', f.status, 'previous_status', v_old.status));
  return jsonb_build_object('ok', true, 'id', f.id, 'status', f.status);
end $f$;

-- pessoa na família: nova (cadastro mínimo) ou já existente; criança, responsável ou outro; quem pode retirar
create or replace function app.v39_kids_member_save(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id(); v_min uuid := nullif(p->>'ministerioId', '')::uuid; m app.ministries;
  v_fam uuid := nullif(p->>'familiaId', '')::uuid; f app.families;
  v_fm uuid := nullif(p->>'id', '')::uuid; fm app.family_members; v_old app.family_members;
  v_pes uuid := nullif(p->>'pessoaId', '')::uuid; v_np jsonb := p->'pessoa';
  v_papel text := coalesce(nullif(btrim(p->>'papel'), ''), 'responsavel');
  v_ret boolean := coalesce((nullif(p->>'podeRetirar', ''))::boolean, v_papel = 'responsavel');
  v_princ boolean := coalesce((nullif(p->>'contatoPrincipal', ''))::boolean, false);
  v_status text := coalesce(nullif(btrim(p->>'status'), ''), 'active'); v_motivo text := nullif(btrim(p->>'motivo'), '');
  v_sit text := nullif(btrim(p->>'situacao'), '');
  v_nome text; v_nasc date; v_sexo text; v_fone text; pe app.people; cp app.church_people; v_idade integer; v_novo boolean := false;
begin
  m := private.v39_kids_need(p_church_id, v_min, case when v_status = 'ended' then 'leader' else 'volunteer' end);
  if v_fm is not null then
    select * into v_old from app.family_members where id = v_fm and church_id = p_church_id for update;
    if v_old.id is null or v_old.status <> 'active' then perform app.raise_domain_error('KIDS_MEMBER_NOT_FOUND', 'Vinculo nao encontrado'); end if;
    v_fam := v_old.family_id; v_pes := v_old.person_id;
    if nullif(btrim(p->>'papel'), '') is null then v_papel := v_old.role; end if;
  end if;
  select * into f from app.families where id = v_fam and church_id = p_church_id;
  if f.id is null then perform app.raise_domain_error('KIDS_FAMILY_NOT_FOUND', 'Familia nao encontrada'); end if;
  if f.status <> 'active' then perform app.raise_domain_error('KIDS_FAMILY_INACTIVE', 'Familia inativa'); end if;
  if v_papel not in ('responsavel','crianca','outro') then perform app.raise_domain_error('KIDS_ROLE_INVALID', 'Papel invalido'); end if;
  if v_status not in ('active','ended') then perform app.raise_domain_error('KIDS_STATUS_INVALID', 'Situacao invalida'); end if;

  -- encerrar o vínculo (líder, com motivo)
  if v_status = 'ended' then
    if v_old.id is null then perform app.raise_domain_error('KIDS_MEMBER_NOT_FOUND', 'Vinculo nao encontrado'); end if;
    if v_motivo is null then perform app.raise_domain_error('REASON_REQUIRED', 'Informe o motivo'); end if;
    update app.family_members set status = 'ended', ended_at = now(), end_reason = left(v_motivo, 500), updated_by_user_account_id = v_me
     where id = v_old.id returning * into fm;
    perform private.v39_kids_audit(p_church_id, 'status_change', 'kids_family_member_ended', 'family_members', fm.id, fm.person_id,
                                   case when fm.role = 'crianca' then 'minor' else 'personal' end, v_motivo, jsonb_build_object('family_id', fm.family_id, 'role', fm.role));
    return jsonb_build_object('ok', true, 'id', fm.id, 'status', fm.status);
  end if;

  -- pessoa nova (cadastro mínimo, na base única) ou existente
  if v_pes is null then
    if v_np is null or jsonb_typeof(v_np) <> 'object' then perform app.raise_domain_error('PERSON_REQUIRED', 'Informe a pessoa'); end if;
    v_nome := nullif(btrim(v_np->>'nome'), '');
    if v_nome is null then perform app.raise_domain_error('PERSON_REQUIRED_FIELD', 'Informe o nome'); end if;
    v_nasc := nullif(v_np->>'nascimento', '')::date;
    v_sexo := nullif(btrim(v_np->>'sexo'), '');
    if v_sexo is not null and v_sexo not in ('Masculino','Feminino') then perform app.raise_domain_error('KIDS_SEX_INVALID', 'Sexo invalido'); end if;
    if v_nasc is not null and v_nasc > current_date then perform app.raise_domain_error('KIDS_BIRTH_INVALID', 'Data de nascimento no futuro'); end if;
    v_fone := private.v39_kids_phone(v_np->>'whatsapp');
    if v_fone is not null and length(v_fone) not in (10, 11) then perform app.raise_domain_error('KIDS_PHONE_INVALID', 'WhatsApp invalido: use DDD + numero'); end if;
    insert into app.people (full_name, preferred_name, birth_date, sex, created_by, updated_by)
    values (left(v_nome, 200), nullif(btrim(v_np->>'apelido'), ''), v_nasc, v_sexo, v_me, v_me) returning * into pe;
    v_pes := pe.id; v_novo := true;
    if v_fone is not null then
      insert into app.person_contacts (person_id, contact_type, contact_value, normalized_value, is_primary, created_by, updated_by)
      values (v_pes, 'whatsapp', btrim(v_np->>'whatsapp'), v_fone, true, v_me, v_me);
    end if;
  else
    select * into pe from app.people where id = v_pes;
    if pe.id is null or pe.status <> 'active' or pe.anonymized_at is not null then perform app.raise_domain_error('KIDS_PERSON_INVALID', 'Pessoa nao pode ser usada'); end if;
    select * into cp from app.church_people where church_id = p_church_id and person_id = v_pes and ended_at is null;
    if cp.id is null or cp.status = 'closed' then perform app.raise_domain_error('KIDS_PERSON_INVALID', 'Pessoa nao esta ativa nesta igreja'); end if;
    -- completar dados que faltam (nunca sobrescreve cadastro de quem não veio do Kids)
    if v_np is not null and jsonb_typeof(v_np) = 'object' then
      v_nasc := nullif(v_np->>'nascimento', '')::date;
      v_fone := private.v39_kids_phone(v_np->>'whatsapp');
      if v_fone is not null and length(v_fone) not in (10, 11) then perform app.raise_domain_error('KIDS_PHONE_INVALID', 'WhatsApp invalido: use DDD + numero'); end if;
      if v_nasc is not null and v_nasc > current_date then perform app.raise_domain_error('KIDS_BIRTH_INVALID', 'Data de nascimento no futuro'); end if;
      if cp.source = 'kids' then
        update app.people set full_name = coalesce(left(nullif(btrim(v_np->>'nome'), ''), 200), full_name),
               preferred_name = coalesce(nullif(btrim(v_np->>'apelido'), ''), preferred_name),
               birth_date = coalesce(v_nasc, birth_date),
               sex = coalesce(case when v_np->>'sexo' in ('Masculino','Feminino') then v_np->>'sexo' end, sex), updated_by = v_me
         where id = v_pes returning * into pe;
      elsif pe.birth_date is null and v_nasc is not null then
        update app.people set birth_date = v_nasc, updated_by = v_me where id = v_pes returning * into pe;
      end if;
      if v_fone is not null and (cp.source = 'kids' or private.v39_kids_whatsapp(v_pes) is null)
         and private.v39_kids_whatsapp(v_pes) is distinct from v_fone then
        update app.person_contacts set valid_until = now(), updated_by = v_me
         where person_id = v_pes and contact_type in ('whatsapp','phone') and valid_until is null;
        insert into app.person_contacts (person_id, contact_type, contact_value, normalized_value, is_primary, created_by, updated_by)
        values (v_pes, 'whatsapp', btrim(v_np->>'whatsapp'), v_fone, true, v_me, v_me);
      end if;
    end if;
  end if;

  -- regras do papel
  v_idade := private.v39_kids_age(pe.birth_date);
  if v_papel = 'crianca' then
    v_ret := false; v_princ := false;
    if v_idade is null then perform app.raise_domain_error('KIDS_BIRTH_REQUIRED', 'Informe a data de nascimento da crianca'); end if;
    if v_idade >= coalesce(m.max_age_years, 12) then perform app.raise_domain_error('KIDS_AGE_OVER', 'A crianca ja passou da idade do Kids'); end if;
  else
    if v_ret and v_idade is null then perform app.raise_domain_error('KIDS_BIRTH_REQUIRED', 'Informe a data de nascimento de quem pode retirar'); end if;
    if v_ret and v_idade < 12 then perform app.raise_domain_error('KIDS_PICKUP_AGE', 'Quem retira precisa ter 12 anos ou mais'); end if;
    if v_papel = 'responsavel' and private.v39_kids_whatsapp(v_pes) is null then
      perform app.raise_domain_error('KIDS_PHONE_REQUIRED', 'Informe o WhatsApp do responsavel');
    end if;
    if v_idade is not null and v_idade < coalesce(m.max_age_years, 12) and v_papel = 'responsavel' then
      perform app.raise_domain_error('KIDS_PICKUP_AGE', 'Responsavel precisa ter 12 anos ou mais');
    end if;
  end if;

  -- vínculo com a igreja: pessoa nova entra pelo Kids (fora da fila de visita e da sugestão de GC)
  if v_novo then
    if v_papel = 'crianca' then
      v_sit := coalesce(case when v_sit in ('visiting','active') then v_sit end, private.v39_kids_family_status(f.id));
    else
      v_sit := case when v_sit in ('visiting','active') then v_sit else 'visiting' end;
    end if;
    insert into app.church_people (church_id, person_id, status, source, started_at, journey_stage, created_by, updated_by)
    values (p_church_id, v_pes, v_sit, 'kids', current_date, 'Kids', v_me, v_me) returning * into cp;
  elsif v_sit in ('visiting','active') and cp.source = 'kids' and cp.status in ('visiting','active') and cp.status <> v_sit then
    update app.church_people set status = v_sit, updated_by = v_me where id = cp.id returning * into cp;   -- opção de trocar (decisão 3)
  end if;

  if v_princ then
    update app.family_members set is_primary_contact = false, updated_by_user_account_id = v_me
     where family_id = f.id and status = 'active' and is_primary_contact and person_id <> v_pes;
  end if;
  if v_old.id is null then
    select * into v_old from app.family_members where family_id = f.id and person_id = v_pes and status = 'active' for update;
  end if;
  if v_old.id is null then
    insert into app.family_members (church_id, family_id, person_id, role, can_pick_up, is_primary_contact, created_by_user_account_id, updated_by_user_account_id)
    values (p_church_id, f.id, v_pes, v_papel, v_ret, v_princ, v_me, v_me) returning * into fm;
  else
    update app.family_members set role = v_papel, can_pick_up = v_ret, is_primary_contact = v_princ, updated_by_user_account_id = v_me
     where id = v_old.id returning * into fm;
  end if;
  if v_papel = 'crianca' then
    insert into app.kids_child_profiles (church_id, person_id, created_by_user_account_id, updated_by_user_account_id)
    values (p_church_id, v_pes, v_me, v_me) on conflict do nothing;
  end if;
  perform private.v39_kids_audit(p_church_id, 'data_change', case when v_old.id is null then 'kids_family_member_added' else 'kids_family_member_updated' end,
                                 'family_members', fm.id, v_pes, case when v_papel = 'crianca' then 'minor' else 'personal' end, null,
                                 jsonb_build_object('family_id', f.id, 'role', fm.role, 'can_pick_up', fm.can_pick_up, 'new_person', v_novo,
                                                    'previous_role', v_old.role, 'previous_can_pick_up', v_old.can_pick_up));
  return jsonb_build_object('ok', true, 'id', fm.id, 'pessoaId', v_pes, 'novaPessoa', v_novo, 'situacao', cp.status);
end $f$;

-- consentimento kids_care: da criança (dado pelo responsável da família) ou da própria pessoa adulta
create or replace function app.v39_kids_consent_set(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id(); v_min uuid := nullif(p->>'ministerioId', '')::uuid; m app.ministries;
  v_pes uuid := nullif(p->>'pessoaId', '')::uuid; v_por uuid := nullif(p->>'autorizadoPorId', '')::uuid;
  v_status text := coalesce(nullif(btrim(p->>'status'), ''), 'granted'); v_motivo text := nullif(btrim(p->>'motivo'), '');
  v_crianca boolean; v_purpose uuid; c app.person_consents; v_id uuid; v_idade integer;
begin
  m := private.v39_kids_need(p_church_id, v_min, 'volunteer');
  if v_status not in ('granted','revoked') then perform app.raise_domain_error('KIDS_STATUS_INVALID', 'Situacao invalida'); end if;
  if not private.v39_kids_in_family(p_church_id, v_pes) then perform app.raise_domain_error('KIDS_PERSON_NOT_IN_FAMILY', 'Pessoa nao esta em familia do Kids'); end if;
  v_crianca := exists (select 1 from app.family_members where church_id = p_church_id and person_id = v_pes and status = 'active' and role = 'crianca');
  select private.v39_kids_age(birth_date) into v_idade from app.people where id = v_pes;
  if v_crianca or coalesce(v_idade, 18) < 18 then
    if v_por is null then perform app.raise_domain_error('KIDS_GUARDIAN_REQUIRED', 'Informe o responsavel que autoriza'); end if;
    if not exists (select 1 from app.family_members a join app.family_members b on b.family_id = a.family_id and b.status = 'active'
                    join app.families f on f.id = a.family_id and f.status = 'active'
                    where a.person_id = v_pes and a.status = 'active' and a.church_id = p_church_id
                      and b.person_id = v_por and b.role = 'responsavel') then
      perform app.raise_domain_error('KIDS_GUARDIAN_INVALID', 'Quem autoriza precisa ser responsavel na mesma familia');
    end if;
  else
    v_por := coalesce(v_por, v_pes);
    if v_por <> v_pes then perform app.raise_domain_error('KIDS_GUARDIAN_INVALID', 'Adulto autoriza por si mesmo'); end if;
  end if;
  v_purpose := private.v39_kids_purpose(p_church_id);
  select * into c from app.person_consents where church_id = p_church_id and person_id = v_pes and purpose_id = v_purpose and status = 'granted' for update;

  if v_status = 'granted' then
    if c.id is not null then return jsonb_build_object('ok', true, 'id', c.id, 'status', c.status); end if;
    insert into app.person_consents (church_id, person_id, purpose_id, status, term_version, term_text_snapshot, granted_by_person_id,
                                     granted_by_relationship, granted_at, collection_channel, evidence_reference, recorded_by_user_account_id)
    values (p_church_id, v_pes, v_purpose, 'granted', 'v39-kids-1',
            'Autorizo a igreja a guardar o cadastro, a foto do rosto (para conferencia na entrega) e, no caso da crianca, alergias, doencas e restricoes, '
            || 'para o cuidado no Kids enquanto a crianca participar (ate 12 anos).',
            v_por, case when v_por = v_pes then 'titular' else 'responsavel' end, now(), 'presencial', null, v_me)
    returning id into v_id;
    insert into app.person_consent_history (consent_id, church_id, person_id, action, previous_status, new_status, performed_by_user_account_id, reason, metadata)
    values (v_id, p_church_id, v_pes, 'granted', null, 'granted', v_me, null, jsonb_build_object('origem', 'kids', 'autorizado_por', v_por));
  else
    if c.id is null then perform app.raise_domain_error('KIDS_CONSENT_NOT_FOUND', 'Nao ha autorizacao ativa'); end if;
    if v_motivo is null then perform app.raise_domain_error('REASON_REQUIRED', 'Informe o motivo'); end if;
    update app.person_consents set status = 'revoked', revoked_at = now(), revocation_reason = left(v_motivo, 500) where id = c.id;
    insert into app.person_consent_history (consent_id, church_id, person_id, action, previous_status, new_status, performed_by_user_account_id, reason, metadata)
    values (c.id, p_church_id, v_pes, 'revoked', 'granted', 'revoked', v_me, v_motivo, jsonb_build_object('origem', 'kids'));
    v_id := c.id;
  end if;
  perform private.v39_kids_audit(p_church_id, 'privacy', 'kids_consent_' || v_status, 'person_consents', v_id, v_pes,
                                 case when v_crianca then 'minor' else 'personal' end, v_motivo, jsonb_build_object('autorizado_por', v_por));
  return jsonb_build_object('ok', true, 'id', v_id, 'status', v_status);
end $f$;

-- ficha da criança: leitura (cada abertura vai para a auditoria)
create or replace function app.v39_kids_child_profile(p_church_id uuid, p_ministry_id uuid, p_person_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, app, private as $f$
declare m app.ministries := private.v39_kids_need(p_church_id, p_ministry_id, 'volunteer'); k app.kids_child_profiles; v jsonb := '{}'::jsonb;
begin
  if not exists (select 1 from app.family_members where church_id = p_church_id and person_id = p_person_id and status = 'active' and role = 'crianca') then
    perform app.raise_domain_error('KIDS_CHILD_NOT_FOUND', 'Crianca nao encontrada no Kids');
  end if;
  select * into k from app.kids_child_profiles where church_id = p_church_id and person_id = p_person_id and status = 'active';
  if k.payload_encrypted is not null then
    v := extensions.pgp_sym_decrypt(decode(k.payload_encrypted, 'base64'), private.v39_kids_key())::jsonb;
  end if;
  perform private.v39_kids_audit(p_church_id, 'sensitive_access', 'kids_child_profile_viewed', 'kids_child_profiles', coalesce(k.id, p_person_id), p_person_id, 'health', null, '{}'::jsonb);
  return jsonb_build_object('pessoaId', p_person_id, 'alergias', v->>'alergias', 'doencas', v->>'doencas', 'restricoes', v->>'restricoes',
                            'medicamentos', v->>'medicamentos', 'obs', v->>'obs', 'temAlergia', coalesce(k.has_allergy, false),
                            'temRestricao', coalesce(k.has_restriction, false), 'atualizadoEm', k.updated_at,
                            'consentimento', private.v39_kids_has_consent(p_church_id, p_person_id));
end $f$;

-- ficha da criança: gravar (exige autorização do responsável)
create or replace function app.v39_kids_child_profile_save(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id(); v_min uuid := nullif(p->>'ministerioId', '')::uuid; m app.ministries;
  v_pes uuid := nullif(p->>'pessoaId', '')::uuid; k app.kids_child_profiles; v jsonb; v_txt text;
  v_al text := nullif(btrim(p->>'alergias'), ''); v_do text := nullif(btrim(p->>'doencas'), ''); v_re text := nullif(btrim(p->>'restricoes'), '');
  v_me2 text := nullif(btrim(p->>'medicamentos'), ''); v_ob text := nullif(btrim(p->>'obs'), '');
begin
  m := private.v39_kids_need(p_church_id, v_min, 'volunteer');
  if not exists (select 1 from app.family_members fm join app.families f on f.id = fm.family_id and f.status = 'active'
                  where fm.church_id = p_church_id and fm.person_id = v_pes and fm.status = 'active' and fm.role = 'crianca') then
    perform app.raise_domain_error('KIDS_CHILD_NOT_FOUND', 'Crianca nao encontrada no Kids');
  end if;
  if not private.v39_kids_has_consent(p_church_id, v_pes) then
    perform app.raise_domain_error('KIDS_CONSENT_REQUIRED', 'Registre antes a autorizacao do responsavel');
  end if;
  if length(coalesce(v_al, '') || coalesce(v_do, '') || coalesce(v_re, '') || coalesce(v_me2, '') || coalesce(v_ob, '')) > 4000 then
    perform app.raise_domain_error('KIDS_PROFILE_TOO_LONG', 'Texto muito longo');
  end if;
  v := jsonb_strip_nulls(jsonb_build_object('alergias', v_al, 'doencas', v_do, 'restricoes', v_re, 'medicamentos', v_me2, 'obs', v_ob));
  v_txt := case when v = '{}'::jsonb then null else encode(extensions.pgp_sym_encrypt(v::text, private.v39_kids_key()), 'base64') end;
  select * into k from app.kids_child_profiles where church_id = p_church_id and person_id = v_pes and status = 'active' for update;
  if k.id is null then
    insert into app.kids_child_profiles (church_id, person_id, payload_encrypted, has_allergy, has_restriction, created_by_user_account_id, updated_by_user_account_id)
    values (p_church_id, v_pes, v_txt, v_al is not null, coalesce(v_re, v_do, v_me2) is not null, v_me, v_me) returning * into k;
  else
    update app.kids_child_profiles set payload_encrypted = v_txt, has_allergy = v_al is not null, has_restriction = coalesce(v_re, v_do, v_me2) is not null,
           updated_by_user_account_id = v_me
     where id = k.id returning * into k;
  end if;
  perform private.v39_kids_audit(p_church_id, 'data_change', 'kids_child_profile_saved', 'kids_child_profiles', k.id, v_pes, 'health', null,
                                 jsonb_build_object('has_allergy', k.has_allergy, 'has_restriction', k.has_restriction));
  return jsonb_build_object('ok', true, 'id', k.id, 'temAlergia', k.has_allergy, 'temRestricao', k.has_restriction);
end $f$;

-- aos 12 anos: sai do Kids e vai para o cadastro geral (líder)
create or replace function app.v39_kids_child_graduate(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id(); v_min uuid := nullif(p->>'ministerioId', '')::uuid; m app.ministries;
  v_pes uuid := nullif(p->>'pessoaId', '')::uuid; v_cpf text := nullif(regexp_replace(coalesce(p->>'cpf', ''), '\D', '', 'g'), '');
  pe app.people; cp app.church_people; v_status text; v_n integer;
begin
  m := private.v39_kids_need(p_church_id, v_min, 'leader');
  select * into pe from app.people where id = v_pes;
  if pe.id is null or not exists (select 1 from app.family_members where church_id = p_church_id and person_id = v_pes and status = 'active' and role = 'crianca') then
    perform app.raise_domain_error('KIDS_CHILD_NOT_FOUND', 'Crianca nao encontrada no Kids');
  end if;
  if coalesce(private.v39_kids_age(pe.birth_date), 0) < coalesce(m.max_age_years, 12) then
    perform app.raise_domain_error('KIDS_AGE_UNDER', 'A crianca ainda nao completou a idade de saida do Kids');
  end if;
  if v_cpf is not null then
    if not app.is_valid_cpf(v_cpf) then perform app.raise_domain_error('CPF_INVALID', 'CPF invalido'); end if;
    if pe.cpf is null then update app.people set cpf = v_cpf, updated_by = v_me where id = v_pes returning * into pe; end if;
  end if;
  select * into cp from app.church_people where church_id = p_church_id and person_id = v_pes and ended_at is null for update;
  v_status := case when pe.cpf is not null and app.is_valid_cpf(pe.cpf) then 'member' else 'active' end;
  if cp.id is not null then
    update app.church_people set status = case when status in ('member','integrated') then status else v_status end,
           source = case when source = 'kids' then 'kids_concluido' else source end,
           journey_stage = case when journey_stage = 'Kids' then null else journey_stage end,
           notes = case when v_status = 'active' and status not in ('member','integrated')
                        then left(coalesce(notes || E'\n', '') || 'Pendencia: CPF para virar membro (saiu do Kids em ' || to_char(current_date, 'DD/MM/YYYY') || ')', 2000)
                        else notes end,
           updated_by = v_me
     where id = cp.id returning * into cp;
  end if;
  update app.kids_child_profiles set status = 'closed', closed_at = now(), close_reason = 'Saiu do Kids (' || coalesce(m.max_age_years, 12) || ' anos)',
         payload_encrypted = null, updated_by_user_account_id = v_me
   where church_id = p_church_id and person_id = v_pes and status = 'active';
  update app.family_members set status = 'ended', ended_at = now(), end_reason = 'Saiu do Kids (' || coalesce(m.max_age_years, 12) || ' anos)', updated_by_user_account_id = v_me
   where church_id = p_church_id and person_id = v_pes and status = 'active' and role = 'crianca';
  get diagnostics v_n = row_count;
  perform private.v39_kids_audit(p_church_id, 'status_change', 'kids_child_graduated', 'people', v_pes, v_pes, 'minor', null,
                                 jsonb_build_object('church_status', cp.status, 'families_ended', v_n, 'cpf_pending', cp.status = 'active'));
  return jsonb_build_object('ok', true, 'pessoaId', v_pes, 'situacao', cp.status, 'pendenciaCpf', cp.status = 'active');
end $f$;

-- grants ----------------------------------------------------------------
revoke all on function private.v39_kids_key() from public;
revoke all on function private.v39_kids_age(date) from public;
revoke all on function private.v39_kids_need(uuid, uuid, text) from public;
revoke all on function private.v39_kids_is_team(uuid) from public;
revoke all on function private.v39_kids_purpose(uuid) from public;
revoke all on function private.v39_kids_has_consent(uuid, uuid) from public;
revoke all on function private.v39_kids_in_family(uuid, uuid) from public;
revoke all on function private.v39_kids_photo_ok(uuid, uuid) from public;
revoke all on function private.v39_kids_audit(uuid, text, text, text, uuid, uuid, text, text, jsonb) from public;
revoke all on function private.v39_kids_phone(text) from public;
revoke all on function private.v39_kids_whatsapp(uuid) from public;
revoke all on function private.v39_kids_family_status(uuid) from public;
revoke all on function private.v39_kids_person_json(uuid, uuid, integer) from public;
revoke all on function app.v39_inst_photo_can_write(uuid, uuid) from public, anon;
grant execute on function app.v39_inst_photo_can_write(uuid, uuid) to authenticated;
revoke all on function app.v39_kids_people_search(uuid, uuid, text) from public, anon;
revoke all on function app.v39_kids_families(uuid, uuid, text, boolean) from public, anon;
revoke all on function app.v39_kids_family_save(uuid, jsonb) from public, anon;
revoke all on function app.v39_kids_member_save(uuid, jsonb) from public, anon;
revoke all on function app.v39_kids_consent_set(uuid, jsonb) from public, anon;
revoke all on function app.v39_kids_child_profile(uuid, uuid, uuid) from public, anon;
revoke all on function app.v39_kids_child_profile_save(uuid, jsonb) from public, anon;
revoke all on function app.v39_kids_child_graduate(uuid, jsonb) from public, anon;
grant execute on function app.v39_kids_people_search(uuid, uuid, text) to authenticated;
grant execute on function app.v39_kids_families(uuid, uuid, text, boolean) to authenticated;
grant execute on function app.v39_kids_family_save(uuid, jsonb) to authenticated;
grant execute on function app.v39_kids_member_save(uuid, jsonb) to authenticated;
grant execute on function app.v39_kids_consent_set(uuid, jsonb) to authenticated;
grant execute on function app.v39_kids_child_profile(uuid, uuid, uuid) to authenticated;
grant execute on function app.v39_kids_child_profile_save(uuid, jsonb) to authenticated;
grant execute on function app.v39_kids_child_graduate(uuid, jsonb) to authenticated;
-- KIDS2-BODY-END

commit;
notify pgrst, 'reload schema';

-- VERIFICACAO (deve dar tudo true)
select
  (select count(*) = 3 from pg_class where oid in (to_regclass('app.families'), to_regclass('app.family_members'), to_regclass('app.kids_child_profiles')) and relrowsecurity) as tabelas_com_rls,
  (select not has_table_privilege('authenticated', 'app.kids_child_profiles', 'select')) as ficha_sem_acesso_direto,
  (select count(*) = 8 from pg_proc where pronamespace = 'app'::regnamespace and proname like 'v39\_kids\_%'
     and has_function_privilege('authenticated', oid, 'execute') and not has_function_privilege('anon', oid, 'execute')) as rpcs,
  (select exists (select 1 from vault.secrets where name = 'g2_kids_records_key_v1')) as chave_no_vault,
  (select pg_get_functiondef('app.v39_inst_photo_can_write(uuid,uuid)'::regprocedure) like '%v39_kids_photo_ok%') as foto_kids;
