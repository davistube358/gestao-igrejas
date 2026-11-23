-- =====================================================================
-- KIDS_2 · Famílias, ficha da criança, consentimento e fotos · TESTE COM ROLLBACK
-- Rodar inteiro no SQL Editor. Resultado esperado (é um ERRO de propósito, nada fica gravado):
--   ERROR P0001: TESTE KIDS_2 CONCLUIDO (nada foi gravado): T1 ok; T2 ok; ... T15 ok (REVERTER ok)
--   T1  pessoa da igreja fora do Kids não cria família (PERMISSION_DENIED)
--   T2  voluntário do Kids cria família (auditoria)
--   T3  responsável novo: sem WhatsApp recusa; com WhatsApp entra como visitante, origem kids, número normalizado
--   T4  criança: sem nascimento recusa; 13 anos recusa; 5 anos entra (segue a família: visitante), ficha criada
--   T5  membro existente como responsável (cadastro dele não é alterado); 2ª criança entra como frequentadora
--   T6  quem retira: 10 anos recusa; 12 anos entra
--   T7  ficha sem autorização recusa; autorização por quem não é responsável recusa; com responsável grava cifrado
--   T8  voluntário lê a ficha (auditoria de acesso sensível); de fora não lê
--   T9  lista de famílias: membros, sinais de alergia, WhatsApp do responsável
--   T10 busca pelo final do telefone acha o responsável (só os 4 últimos dígitos)
--   T11 foto: equipe grava foto de pessoa da família com autorização; sem autorização, fora da família ou de fora não
--   T12 voluntário não encerra vínculo nem inativa família; líder encerra com motivo
--   T13 saída aos 12: antes da idade recusa; voluntário não; líder conclui sem CPF -> frequentador com pendência, ficha limpa
--   T14 autorização revogada: ficha volta a ser recusada e a foto também
--   T15 REVERTER: aborta com dados; sem os dados de teste volta tudo (foto do Instituto como antes)
-- NAO GRAVA NADA: tudo e desfeito pelo raise final.
-- =====================================================================
do $t$
declare
  v_ch uuid := gen_random_uuid();
  v_au_m uuid := gen_random_uuid(); v_au_l uuid := gen_random_uuid(); v_au_v uuid := gen_random_uuid(); v_au_o uuid := gen_random_uuid();
  v_p_m uuid; v_p_l uuid; v_p_v uuid; v_p_o uuid; v_p_r2 uuid;
  v_ua uuid; v_cua uuid; v_prof uuid;
  v_kids uuid; v_fam uuid; v_resp uuid; v_c1 uuid; v_c2 uuid; v_out uuid; v_fm_out uuid;
  r jsonb; v_s text; v_res text := '';
begin
  -- APLICAR (identico ao _aplicar, sem begin/commit)
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


  -- utilitários do teste (temporários)
  create function pg_temp.k2_as(p uuid) returns void language sql as $x$
    select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true),
           set_config('request.jwt.claim.sub', p::text, true) $x$;
  create function pg_temp.k2_q(p_sql text) returns jsonb language plpgsql as $x$
    declare v jsonb; begin execute 'set local role authenticated'; execute 'select to_jsonb((' || p_sql || '))' into v; execute 'reset role'; return v; end $x$;
  create function pg_temp.k2_err(p_sql text) returns text language plpgsql as $x$
    begin execute 'set local role authenticated'; execute 'select (' || p_sql || ')'; execute 'reset role'; return 'OK';
    exception when others then return sqlerrm; end $x$;

  -- DADOS DE TESTE ---------------------------------------------------
  insert into app.churches (id, name, slug, timezone) values (v_ch, 'Igreja Teste KIDS_2', 'teste-kids2-' || left(v_ch::text, 8), 'America/Sao_Paulo');
  insert into auth.users (id, email) values (v_au_m, 'k2m@teste.invalid'), (v_au_l, 'k2l@teste.invalid'), (v_au_v, 'k2v@teste.invalid'), (v_au_o, 'k2o@teste.invalid');
  insert into app.people (full_name) values ('K2 Master') returning id into v_p_m;
  insert into app.people (full_name) values ('K2 Lider Kids') returning id into v_p_l;
  insert into app.people (full_name) values ('K2 Voluntario') returning id into v_p_v;
  insert into app.people (full_name) values ('K2 De Fora') returning id into v_p_o;
  insert into app.people (full_name, birth_date) values ('K2 Membro Responsavel', current_date - interval '35 years') returning id into v_p_r2;
  insert into app.church_people (church_id, person_id, status) values (v_ch, v_p_m, 'active'), (v_ch, v_p_l, 'active'), (v_ch, v_p_v, 'active'), (v_ch, v_p_o, 'active'), (v_ch, v_p_r2, 'active');
  insert into app.person_contacts (person_id, contact_type, contact_value, normalized_value, is_primary) values (v_p_r2, 'whatsapp', '(21) 97777-1234', '21977771234', true);

  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_m, v_p_m, 'active', now(), 'k2m') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  select id into v_prof from app.access_profiles where code = 'master';
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');
  select id into v_prof from app.access_profiles where code = 'disciple';
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_l, v_p_l, 'active', now(), 'k2l') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_v, v_p_v, 'active', now(), 'k2v') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_o, v_p_o, 'active', now(), 'k2o') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');

  perform pg_temp.k2_as(v_au_m);
  r := pg_temp.k2_q(format('app.v39_min_save(%L, %L::jsonb)', v_ch, jsonb_build_object('nome', 'Kids', 'tipo', 'kids', 'liderId', v_p_l)));
  v_kids := (r->>'id')::uuid;
  perform pg_temp.k2_as(v_au_l);
  r := pg_temp.k2_q(format('app.v39_min_member_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_p_v)));

  -- T1
  perform pg_temp.k2_as(v_au_o);
  v_s := pg_temp.k2_err(format('app.v39_kids_family_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'nome', 'Familia X')));
  if v_s <> 'PERMISSION_DENIED' then raise exception 'FALHOU T1: %', v_s; end if;
  v_res := v_res || 'T1 ok; ';

  -- T2
  perform pg_temp.k2_as(v_au_v);
  r := pg_temp.k2_q(format('app.v39_kids_family_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'nome', 'Familia Teste')));
  v_fam := (r->>'id')::uuid;
  if v_fam is null then raise exception 'FALHOU T2a: %', r; end if;
  if not exists (select 1 from audit.events where church_id = v_ch and action = 'kids_family_created') then raise exception 'FALHOU T2b: sem auditoria'; end if;
  v_res := v_res || 'T2 ok; ';

  -- T3
  v_s := pg_temp.k2_err(format('app.v39_kids_member_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'familiaId', v_fam, 'papel', 'responsavel',
           'pessoa', jsonb_build_object('nome', 'Mae Teste', 'nascimento', (current_date - interval '30 years')::date))));
  if v_s <> 'KIDS_PHONE_REQUIRED' then raise exception 'FALHOU T3a: %', v_s; end if;
  r := pg_temp.k2_q(format('app.v39_kids_member_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'familiaId', v_fam, 'papel', 'responsavel', 'contatoPrincipal', true,
           'pessoa', jsonb_build_object('nome', 'Mae Teste', 'nascimento', (current_date - interval '30 years')::date, 'sexo', 'Feminino', 'whatsapp', '+55 (11) 98888-7777'))));
  v_resp := (r->>'pessoaId')::uuid;
  if not exists (select 1 from app.church_people where church_id = v_ch and person_id = v_resp and status = 'visiting' and source = 'kids' and ended_at is null) then raise exception 'FALHOU T3b: vinculo igreja'; end if;
  if not exists (select 1 from app.person_contacts where person_id = v_resp and normalized_value = '11988887777' and valid_until is null) then raise exception 'FALHOU T3c: telefone'; end if;
  if not exists (select 1 from app.family_members where id = (r->>'id')::uuid and can_pick_up and is_primary_contact) then raise exception 'FALHOU T3d: pode retirar'; end if;
  v_res := v_res || 'T3 ok; ';

  -- T4
  v_s := pg_temp.k2_err(format('app.v39_kids_member_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'familiaId', v_fam, 'papel', 'crianca',
           'pessoa', jsonb_build_object('nome', 'Crianca Sem Data'))));
  if v_s <> 'KIDS_BIRTH_REQUIRED' then raise exception 'FALHOU T4a: %', v_s; end if;
  v_s := pg_temp.k2_err(format('app.v39_kids_member_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'familiaId', v_fam, 'papel', 'crianca',
           'pessoa', jsonb_build_object('nome', 'Crianca Grande', 'nascimento', (current_date - interval '13 years')::date))));
  if v_s <> 'KIDS_AGE_OVER' then raise exception 'FALHOU T4b: %', v_s; end if;
  r := pg_temp.k2_q(format('app.v39_kids_member_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'familiaId', v_fam, 'papel', 'crianca', 'podeRetirar', true,
           'pessoa', jsonb_build_object('nome', 'Crianca Um', 'nascimento', (current_date - interval '5 years')::date))));
  v_c1 := (r->>'pessoaId')::uuid;
  if r->>'situacao' <> 'visiting' then raise exception 'FALHOU T4c: situacao=%', r->>'situacao'; end if;
  if exists (select 1 from app.family_members where person_id = v_c1 and can_pick_up) then raise exception 'FALHOU T4d: crianca pode retirar'; end if;
  if not exists (select 1 from app.kids_child_profiles where person_id = v_c1 and status = 'active') then raise exception 'FALHOU T4e: sem ficha'; end if;
  v_res := v_res || 'T4 ok; ';

  -- T5
  r := pg_temp.k2_q(format('app.v39_kids_member_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'familiaId', v_fam, 'papel', 'responsavel',
           'pessoaId', v_p_r2, 'pessoa', jsonb_build_object('nome', 'Nome Trocado', 'whatsapp', '11900000000'))));
  if not exists (select 1 from app.people where id = v_p_r2 and full_name = 'K2 Membro Responsavel') then raise exception 'FALHOU T5a: cadastro do membro alterado'; end if;
  if not exists (select 1 from app.person_contacts where person_id = v_p_r2 and normalized_value = '21977771234' and valid_until is null) then raise exception 'FALHOU T5b: telefone do membro trocado'; end if;
  r := pg_temp.k2_q(format('app.v39_kids_member_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'familiaId', v_fam, 'papel', 'crianca',
           'pessoa', jsonb_build_object('nome', 'Crianca Dois', 'nascimento', (current_date - interval '8 years')::date))));
  v_c2 := (r->>'pessoaId')::uuid;
  if r->>'situacao' <> 'active' then raise exception 'FALHOU T5c: situacao=%', r->>'situacao'; end if;
  v_res := v_res || 'T5 ok; ';

  -- T6
  v_s := pg_temp.k2_err(format('app.v39_kids_member_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'familiaId', v_fam, 'papel', 'outro', 'podeRetirar', true,
           'pessoa', jsonb_build_object('nome', 'Primo Pequeno', 'nascimento', (current_date - interval '10 years')::date))));
  if v_s <> 'KIDS_PICKUP_AGE' then raise exception 'FALHOU T6a: %', v_s; end if;
  r := pg_temp.k2_q(format('app.v39_kids_member_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'familiaId', v_fam, 'papel', 'outro', 'podeRetirar', true,
           'pessoa', jsonb_build_object('nome', 'Irmao Doze', 'nascimento', (current_date - interval '12 years 1 day')::date))));
  v_out := (r->>'pessoaId')::uuid; v_fm_out := (r->>'id')::uuid;
  if not exists (select 1 from app.family_members where id = v_fm_out and can_pick_up and role = 'outro') then raise exception 'FALHOU T6b'; end if;
  v_res := v_res || 'T6 ok; ';

  -- T7
  v_s := pg_temp.k2_err(format('app.v39_kids_child_profile_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_c1, 'alergias', 'amendoim')));
  if v_s <> 'KIDS_CONSENT_REQUIRED' then raise exception 'FALHOU T7a: %', v_s; end if;
  v_s := pg_temp.k2_err(format('app.v39_kids_consent_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_c1, 'autorizadoPorId', v_out)));
  if v_s <> 'KIDS_GUARDIAN_INVALID' then raise exception 'FALHOU T7b: %', v_s; end if;
  r := pg_temp.k2_q(format('app.v39_kids_consent_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_c1, 'autorizadoPorId', v_resp)));
  if not exists (select 1 from app.person_consents where person_id = v_c1 and status = 'granted' and granted_by_person_id = v_resp and granted_by_relationship = 'responsavel') then raise exception 'FALHOU T7c: consentimento'; end if;
  r := pg_temp.k2_q(format('app.v39_kids_child_profile_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_c1, 'alergias', 'amendoim', 'restricoes', 'sem lactose')));
  if not exists (select 1 from app.kids_child_profiles where person_id = v_c1 and status = 'active' and has_allergy and has_restriction
                  and payload_encrypted is not null and payload_encrypted not like '%amendoim%') then raise exception 'FALHOU T7d: ficha'; end if;
  v_res := v_res || 'T7 ok; ';

  -- T8
  r := pg_temp.k2_q(format('app.v39_kids_child_profile(%L, %L, %L)', v_ch, v_kids, v_c1));
  if r->>'alergias' <> 'amendoim' or r->>'restricoes' <> 'sem lactose' then raise exception 'FALHOU T8a: %', r; end if;
  if not exists (select 1 from audit.events where church_id = v_ch and action = 'kids_child_profile_viewed' and event_category = 'sensitive_access') then raise exception 'FALHOU T8b: sem auditoria'; end if;
  perform pg_temp.k2_as(v_au_o);
  v_s := pg_temp.k2_err(format('app.v39_kids_child_profile(%L, %L, %L)', v_ch, v_kids, v_c1));
  if v_s <> 'PERMISSION_DENIED' then raise exception 'FALHOU T8c: %', v_s; end if;
  v_res := v_res || 'T8 ok; ';

  -- T9
  perform pg_temp.k2_as(v_au_v);
  r := pg_temp.k2_q(format('app.v39_kids_families(%L, %L, null, false)', v_ch, v_kids));
  if jsonb_array_length(r) <> 1 or jsonb_array_length(r->0->'membros') <> 5 then raise exception 'FALHOU T9a: %', r; end if;
  if not exists (select 1 from jsonb_array_elements(r->0->'membros') x where x->>'pessoaId' = v_c1::text and (x->>'temAlergia')::boolean and (x->>'consentimento')::boolean) then raise exception 'FALHOU T9b'; end if;
  if not exists (select 1 from jsonb_array_elements(r->0->'membros') x where x->>'pessoaId' = v_resp::text and x->>'whatsapp' = '11988887777') then raise exception 'FALHOU T9c'; end if;
  v_res := v_res || 'T9 ok; ';

  -- T10
  r := pg_temp.k2_q(format('app.v39_kids_people_search(%L, %L, %L)', v_ch, v_kids, '8888-7777'));
  if not exists (select 1 from jsonb_array_elements(r) x where x->>'id' = v_resp::text and x->>'finalFone' = '7777') then raise exception 'FALHOU T10a: %', r; end if;
  if r::text like '%98888%' then raise exception 'FALHOU T10b: telefone completo exposto'; end if;
  v_res := v_res || 'T10 ok; ';

  -- T11
  if not (pg_temp.k2_q(format('app.v39_inst_photo_can_write(%L, %L)', v_ch, v_c1)))::text::boolean then raise exception 'FALHOU T11a'; end if;
  if (pg_temp.k2_q(format('app.v39_inst_photo_can_write(%L, %L)', v_ch, v_out)))::text::boolean then raise exception 'FALHOU T11b: sem autorizacao gravou'; end if;
  if (pg_temp.k2_q(format('app.v39_inst_photo_can_write(%L, %L)', v_ch, v_p_o)))::text::boolean then raise exception 'FALHOU T11c: fora da familia gravou'; end if;
  if not (pg_temp.k2_q(format('app.v39_inst_photo_name_ok(%L, true)', v_ch || '/people/' || v_c1 || '/' || gen_random_uuid() || '.jpg')))::text::boolean then raise exception 'FALHOU T11d: politica do storage'; end if;
  perform pg_temp.k2_as(v_au_o);
  if (pg_temp.k2_q(format('app.v39_inst_photo_can_write(%L, %L)', v_ch, v_c1)))::text::boolean then raise exception 'FALHOU T11e: de fora gravou'; end if;
  v_res := v_res || 'T11 ok; ';

  -- T12
  perform pg_temp.k2_as(v_au_v);
  v_s := pg_temp.k2_err(format('app.v39_kids_member_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'id', v_fm_out, 'status', 'ended', 'motivo', 'mudou')));
  if v_s <> 'PERMISSION_DENIED' then raise exception 'FALHOU T12a: %', v_s; end if;
  v_s := pg_temp.k2_err(format('app.v39_kids_family_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'id', v_fam, 'nome', 'Familia Teste', 'status', 'inactive', 'motivo', 'x')));
  if v_s <> 'PERMISSION_DENIED' then raise exception 'FALHOU T12b: %', v_s; end if;
  perform pg_temp.k2_as(v_au_l);
  v_s := pg_temp.k2_err(format('app.v39_kids_member_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'id', v_fm_out, 'status', 'ended')));
  if v_s <> 'REASON_REQUIRED' then raise exception 'FALHOU T12c: %', v_s; end if;
  r := pg_temp.k2_q(format('app.v39_kids_member_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'id', v_fm_out, 'status', 'ended', 'motivo', 'mudou de cidade')));
  if not exists (select 1 from app.family_members where id = v_fm_out and status = 'ended' and end_reason = 'mudou de cidade') then raise exception 'FALHOU T12d'; end if;
  v_res := v_res || 'T12 ok; ';

  -- T13
  v_s := pg_temp.k2_err(format('app.v39_kids_child_graduate(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_c2)));
  if v_s <> 'KIDS_AGE_UNDER' then raise exception 'FALHOU T13a: %', v_s; end if;
  update app.people set birth_date = current_date - interval '12 years' where id = v_c2;
  perform pg_temp.k2_as(v_au_v);
  v_s := pg_temp.k2_err(format('app.v39_kids_child_graduate(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_c2)));
  if v_s <> 'PERMISSION_DENIED' then raise exception 'FALHOU T13b: %', v_s; end if;
  perform pg_temp.k2_as(v_au_l);
  r := pg_temp.k2_q(format('app.v39_kids_child_graduate(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_c2)));
  if r->>'situacao' <> 'active' or not (r->>'pendenciaCpf')::boolean then raise exception 'FALHOU T13c: %', r; end if;
  if not exists (select 1 from app.church_people where church_id = v_ch and person_id = v_c2 and status = 'active' and source = 'kids_concluido' and notes like 'Pendencia: CPF%') then raise exception 'FALHOU T13d'; end if;
  if exists (select 1 from app.kids_child_profiles where person_id = v_c2 and (status = 'active' or payload_encrypted is not null)) then raise exception 'FALHOU T13e: ficha nao encerrada'; end if;
  if exists (select 1 from app.family_members where person_id = v_c2 and status = 'active') then raise exception 'FALHOU T13f: continua no Kids'; end if;
  v_res := v_res || 'T13 ok; ';

  -- T14
  perform pg_temp.k2_as(v_au_v);
  v_s := pg_temp.k2_err(format('app.v39_kids_consent_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_c1, 'autorizadoPorId', v_resp, 'status', 'revoked')));
  if v_s <> 'REASON_REQUIRED' then raise exception 'FALHOU T14a: %', v_s; end if;
  r := pg_temp.k2_q(format('app.v39_kids_consent_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_c1, 'autorizadoPorId', v_resp, 'status', 'revoked', 'motivo', 'pedido da mae')));
  v_s := pg_temp.k2_err(format('app.v39_kids_child_profile_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_c1, 'alergias', 'ovo')));
  if v_s <> 'KIDS_CONSENT_REQUIRED' then raise exception 'FALHOU T14b: %', v_s; end if;
  if (pg_temp.k2_q(format('app.v39_inst_photo_can_write(%L, %L)', v_ch, v_c1)))::text::boolean then raise exception 'FALHOU T14c: foto sem autorizacao'; end if;
  v_res := v_res || 'T14 ok; ';

  -- T15 REVERTER
  reset role;
  begin
    if exists (select 1 from app.families) then raise exception 'KIDS_2 REVERTER ABORTADO: ja existem familias/fichas do Kids. Nada foi alterado.'; end if;
    raise exception 'FALHOU T15a';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm not like 'KIDS_2 REVERTER ABORTADO%' then raise exception 'FALHOU T15a: %', sqlerrm; end if;
  end;
  delete from app.kids_child_profiles where church_id = v_ch;
  delete from app.family_members where church_id = v_ch;
  delete from app.families where church_id = v_ch;
  -- histórico de consentimento é imutável (prevent_mutation): só neste teste, dentro do rollback, a trava é desligada para limpar os dados de teste
  alter table app.person_consent_history disable trigger user;
  delete from app.person_consent_history where church_id = v_ch;
  alter table app.person_consent_history enable trigger user;
  delete from app.person_consents where church_id = v_ch;

  -- REVERTER (identico ao _reverter, sem begin/commit)
do $g$
begin
  if exists (select 1 from app.families) or exists (select 1 from app.family_members) or exists (select 1 from app.kids_child_profiles) then
    raise exception 'KIDS_2 REVERTER ABORTADO: ja existem familias/fichas do Kids. Nada foi alterado.';
  end if;
  if exists (select 1 from app.person_consents c join app.processing_purposes pp on pp.id = c.purpose_id where pp.code = 'kids_care') then
    raise exception 'KIDS_2 REVERTER ABORTADO: ja existem consentimentos kids_care. Nada foi alterado.';
  end if;
end $g$;

-- regra de foto do Instituto exatamente como antes do KIDS_2
create or replace function app.v39_inst_photo_can_write(p_church uuid, p_person uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, app, private as $f$
  select app.current_user_account_id() is not null
     and (app.has_permission('institute.staff.manage', p_church, 'church', p_church)
          or ((app.has_permission('institute.sessions.manage', p_church, 'church', p_church)
               or app.has_permission('solidarity_market.deliveries.create', p_church, 'church', p_church)
               or app.has_permission('pharmacy.deliveries.create', p_church, 'church', p_church))
              and private.v39_inst_my_prof(p_church) is null))
     and exists (select 1 from app.church_people cp where cp.church_id = p_church and cp.person_id = p_person and cp.ended_at is null and cp.source = 'instituto')
$f$;
revoke all on function app.v39_inst_photo_can_write(uuid, uuid) from public, anon;
grant execute on function app.v39_inst_photo_can_write(uuid, uuid) to authenticated;

drop function if exists app.v39_kids_child_graduate(uuid, jsonb);
drop function if exists app.v39_kids_child_profile_save(uuid, jsonb);
drop function if exists app.v39_kids_child_profile(uuid, uuid, uuid);
drop function if exists app.v39_kids_consent_set(uuid, jsonb);
drop function if exists app.v39_kids_member_save(uuid, jsonb);
drop function if exists app.v39_kids_family_save(uuid, jsonb);
drop function if exists app.v39_kids_families(uuid, uuid, text, boolean);
drop function if exists app.v39_kids_people_search(uuid, uuid, text);
drop function if exists private.v39_kids_person_json(uuid, uuid, integer);
drop function if exists private.v39_kids_family_status(uuid);
drop function if exists private.v39_kids_whatsapp(uuid);
drop function if exists private.v39_kids_phone(text);
drop function if exists private.v39_kids_audit(uuid, text, text, text, uuid, uuid, text, text, jsonb);
drop function if exists private.v39_kids_photo_ok(uuid, uuid);
drop function if exists private.v39_kids_in_family(uuid, uuid);
drop function if exists private.v39_kids_has_consent(uuid, uuid);
drop function if exists private.v39_kids_purpose(uuid);
drop function if exists private.v39_kids_is_team(uuid);
drop function if exists private.v39_kids_need(uuid, uuid, text);
drop function if exists private.v39_kids_age(date);
drop function if exists private.v39_kids_key();

drop table if exists app.kids_child_profiles;
drop table if exists app.family_members;
drop table if exists app.families;

-- finalidade criada pelo KIDS_2 e sem nenhum consentimento (conferido acima)
delete from app.processing_purposes pp where pp.code = 'kids_care'
   and not exists (select 1 from app.person_consents c where c.purpose_id = pp.id);


  if to_regclass('app.families') is not null or to_regclass('app.kids_child_profiles') is not null then raise exception 'FALHOU T15b: tabelas ficaram'; end if;
  if exists (select 1 from pg_proc where proname like 'v39\_kids\_%') then raise exception 'FALHOU T15c: funcoes ficaram'; end if;
  if pg_get_functiondef('app.v39_inst_photo_can_write(uuid,uuid)'::regprocedure) like '%kids%' then raise exception 'FALHOU T15d: foto do Instituto nao voltou'; end if;
  if exists (select 1 from app.processing_purposes where code = 'kids_care') then raise exception 'FALHOU T15e: finalidade ficou'; end if;
  v_res := v_res || 'T15 ok (REVERTER ok)';

  raise exception 'TESTE KIDS_2 CONCLUIDO (nada foi gravado): %', v_res;
end
$t$;
