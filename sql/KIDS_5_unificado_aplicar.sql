-- =====================================================================
-- KIDS_5 · Cadastro unificado (parentesco e vínculos), salas por idade/gênero com professores · APLICAR
-- 24/11/2026 · DATA · decisões do Diogo (chat, 24/11):
--   1. salas cadastradas uma vez no Kids e copiadas para cada culto, com ajuste por evento
--   2. faixa da sala em anos; meses só no Berçário
--   3. direcionamento automático: a sala compatível (idade e gênero) menos cheia; o voluntário pode trocar
--   4. professores da sala em cada culto = escala do Kids (só quem tem acesso ao app; aviso/confirmação no KIDS_4)
--   5. responsável não cadastrado: tela de visitante do culto (front); equipe do Kids recebe a liberação no perfil
--   6. grau de parentesco informado; vínculos no cadastro de pessoas editados por quem já edita pessoas
-- VALIDACAO: ver cabecalho de KIDS_5_unificado_teste_rollback.sql
--
-- O que faz:
--   A. app.family_members + kinship (grau de parentesco, lista fechada); o núcleo familiar some da tela, mas
--      continua ligando criança, responsáveis e quem retira (nada do que existe é perdido)
--   B. app.v39_kids_member_save e app.v39_kids_families passam a gravar/devolver o parentesco
--   C. app.v39_kids_child_register: cadastro a partir da criança, ligada a um responsável da base
--   D. vínculos no cadastro de pessoas: app.v39_family_links, app.v39_family_link_set, app.v39_family_link_end
--   E. salas: app.kids_rooms (padrão do Kids), app.kids_event_rooms (por evento), app.kids_event_room_staff
--      (professores), app.kids_checkins.event_room_id; RPCs v39_kids_rooms, _room_save, _event_rooms,
--      _event_room_save, _event_room_staff_set, _checkin_move; v39_kids_checkin escolhe a sala (manual ou automática)
-- Requer KIDS_1..KIDS_3. Reverter: KIDS_5_unificado_reverter.sql
-- =====================================================================
begin;

-- KIDS5-BODY-BEGIN
do $g$
begin
  if to_regclass('app.kids_checkins') is null then
    raise exception 'KIDS_5 ABORTADO: KIDS_3 nao aplicado. Nada foi alterado.';
  end if;
  if to_regclass('app.kids_rooms') is not null or exists (select 1 from information_schema.columns where table_schema = 'app' and table_name = 'family_members' and column_name = 'kinship') then
    raise exception 'KIDS_5 ABORTADO: KIDS_5 ja aplicado. Nada foi alterado.';
  end if;
end $g$;

-- A. parentesco ------------------------------------------------------------
create or replace function private.v39_kinship_ok(p text) returns boolean
language sql immutable set search_path = pg_catalog as $f$
  select p is null or p in ('Pai','Mãe','Padrasto','Madrasta','Avô','Avó','Tio','Tia','Irmão','Irmã','Primo','Prima',
                            'Tutor legal','Filho','Filha','Enteado','Enteada','Neto','Neta','Sobrinho','Sobrinha','Cônjuge','Outro')
$f$;
alter table app.family_members add column kinship text;
alter table app.family_members add constraint family_members_kinship_check check (private.v39_kinship_ok(kinship));

-- E. salas ---------------------------------------------------------------
create table app.kids_rooms (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references app.churches(id) on update restrict on delete restrict,
  ministry_id uuid not null references app.ministries(id) on update restrict on delete restrict,
  name text not null,
  age_unit text not null default 'anos',
  min_age integer not null default 0,
  max_age integer not null,
  gender text,
  capacity integer,
  sort_order integer not null default 0,
  status text not null default 'active',
  inactivated_at timestamptz,
  inactivation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict,
  updated_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict,
  constraint kids_rooms_name_not_blank check (length(btrim(name)) > 0),
  constraint kids_rooms_unit_check check (age_unit in ('anos','meses')),
  constraint kids_rooms_age_check check (min_age >= 0 and max_age >= min_age and (age_unit = 'meses' or max_age <= 18) and (age_unit = 'anos' or max_age <= 48)),
  constraint kids_rooms_gender_check check (gender is null or gender in ('Masculino','Feminino')),
  constraint kids_rooms_capacity_check check (capacity is null or capacity > 0),
  constraint kids_rooms_status_check check (status in ('active','inactive')),
  constraint kids_rooms_inactive_reason check (status = 'active' or (inactivated_at is not null and inactivation_reason is not null))
);
create unique index kids_rooms_name_open_unique_idx on app.kids_rooms (ministry_id, lower(btrim(name))) where status = 'active';

create table app.kids_event_rooms (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references app.churches(id) on update restrict on delete restrict,
  event_id uuid not null references app.church_events(id) on update restrict on delete restrict,
  room_id uuid references app.kids_rooms(id) on update restrict on delete restrict,
  name text not null,
  age_unit text not null default 'anos',
  min_age integer not null default 0,
  max_age integer not null,
  gender text,
  capacity integer,
  sort_order integer not null default 0,
  status text not null default 'open',
  closed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict,
  updated_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict,
  constraint kids_event_rooms_name_not_blank check (length(btrim(name)) > 0),
  constraint kids_event_rooms_unit_check check (age_unit in ('anos','meses')),
  constraint kids_event_rooms_age_check check (min_age >= 0 and max_age >= min_age),
  constraint kids_event_rooms_gender_check check (gender is null or gender in ('Masculino','Feminino')),
  constraint kids_event_rooms_capacity_check check (capacity is null or capacity > 0),
  constraint kids_event_rooms_status_check check (status in ('open','closed'))
);
create unique index kids_event_rooms_template_unique_idx on app.kids_event_rooms (event_id, room_id) where room_id is not null;
create index kids_event_rooms_event_idx on app.kids_event_rooms (event_id);

create table app.kids_event_room_staff (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references app.churches(id) on update restrict on delete restrict,
  event_room_id uuid not null references app.kids_event_rooms(id) on update restrict on delete restrict,
  person_id uuid not null references app.people(id) on update restrict on delete restrict,
  staff_role text not null default 'professor',
  status text not null default 'active',
  removed_at timestamptz,
  removed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict,
  updated_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict,
  constraint kids_event_room_staff_role_check check (staff_role in ('professor','auxiliar')),
  constraint kids_event_room_staff_status_check check (status in ('active','removed')),
  constraint kids_event_room_staff_removed check (status = 'active' or (removed_at is not null and removed_reason is not null))
);
create unique index kids_event_room_staff_open_unique_idx on app.kids_event_room_staff (event_room_id, person_id) where status = 'active';

alter table app.kids_checkins add column event_room_id uuid references app.kids_event_rooms(id) on update restrict on delete restrict;

create trigger kids_rooms_set_updated_at before update on app.kids_rooms for each row execute function app.set_updated_at();
create trigger kids_event_rooms_set_updated_at before update on app.kids_event_rooms for each row execute function app.set_updated_at();
create trigger kids_event_room_staff_set_updated_at before update on app.kids_event_room_staff for each row execute function app.set_updated_at();
alter table app.kids_rooms enable row level security;
alter table app.kids_event_rooms enable row level security;
alter table app.kids_event_room_staff enable row level security;
revoke all on app.kids_rooms, app.kids_event_rooms, app.kids_event_room_staff from public, anon, authenticated;

-- sala do evento travada junto com o evento (24h depois de encerrado); nada se apaga
create or replace function private.v39_kids_room_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare e app.church_events; v_ev uuid;
begin
  if tg_op = 'DELETE' then perform app.raise_domain_error('KIDS_ROOM_NO_DELETE', 'Sala nao se apaga: feche ou retire com motivo'); end if;
  if tg_table_name = 'kids_event_rooms' then v_ev := old.event_id;
  else select r.event_id into v_ev from app.kids_event_rooms r where r.id = old.event_room_id; end if;
  select * into e from app.church_events where id = v_ev;
  if e.id is not null and now() > private.v39_trava_evento(e) and not private.v39_trava_liberada(e.id) then
    perform app.raise_domain_error('REGISTRO_TRAVADO', 'Evento encerrado ha mais de 24h: edicao travada. Peca ao pastor para reabrir.');
  end if;
  return new;
end $f$;
create trigger trg_v39_kids_event_rooms_guard before update or delete on app.kids_event_rooms for each row execute function private.v39_kids_room_guard();
create trigger trg_v39_kids_event_room_staff_guard before update or delete on app.kids_event_room_staff for each row execute function private.v39_kids_room_guard();

-- idade em meses e compatibilidade com a sala
create or replace function private.v39_age_months(p_birth date) returns integer
language sql stable set search_path = pg_catalog as $f$
  select case when p_birth is null then null else (date_part('year', age(current_date, p_birth)) * 12 + date_part('month', age(current_date, p_birth)))::integer end
$f$;
create or replace function private.v39_kids_room_fits(r app.kids_event_rooms, p_birth date, p_sex text) returns boolean
language sql stable set search_path = pg_catalog, app, private as $f$
  select r.status = 'open'
     and (r.gender is null or r.gender = p_sex)
     and private.v39_age_months(p_birth) is not null
     and private.v39_age_months(p_birth) >= case when r.age_unit = 'meses' then r.min_age else r.min_age * 12 end
     and private.v39_age_months(p_birth) <= case when r.age_unit = 'meses' then r.max_age else r.max_age * 12 + 11 end
$f$;

-- copia as salas padrão para o evento (as que ainda não estão lá), se o evento não estiver travado
create or replace function private.v39_kids_event_rooms_ensure(p_church_id uuid, p_ministry_id uuid, e app.church_events) returns void
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
begin
  if e.status in ('completed','cancelled') or (now() > private.v39_trava_evento(e) and not private.v39_trava_liberada(e.id)) then return; end if;
  insert into app.kids_event_rooms (church_id, event_id, room_id, name, age_unit, min_age, max_age, gender, capacity, sort_order, created_by_user_account_id, updated_by_user_account_id)
  select p_church_id, e.id, r.id, r.name, r.age_unit, r.min_age, r.max_age, r.gender, r.capacity, r.sort_order, app.current_user_account_id(), app.current_user_account_id()
    from app.kids_rooms r
   where r.ministry_id = p_ministry_id and r.church_id = p_church_id and r.status = 'active'
     and not exists (select 1 from app.kids_event_rooms x where x.event_id = e.id and x.room_id = r.id)
  on conflict do nothing;
end $f$;

create or replace function private.v39_kids_event_room_json(r app.kids_event_rooms) returns jsonb
language sql stable security definer set search_path = pg_catalog, app, private as $f$
  select jsonb_build_object('id', r.id, 'salaPadraoId', r.room_id, 'nome', r.name, 'unidade', r.age_unit, 'idadeMin', r.min_age, 'idadeMax', r.max_age,
           'genero', r.gender, 'capacidade', r.capacity, 'ordem', r.sort_order, 'status', r.status, 'motivoFechamento', r.closed_reason,
           'presentes', (select count(*) from app.kids_checkins c where c.event_room_id = r.id and c.status = 'present'),
           'professores', coalesce((select jsonb_agg(jsonb_build_object('pessoaId', s.person_id, 'nome', coalesce(nullif(btrim(p.preferred_name), ''), p.full_name), 'funcao', s.staff_role)
                                                     order by s.staff_role desc, p.full_name)
                                      from app.kids_event_room_staff s join app.people p on p.id = s.person_id
                                     where s.event_room_id = r.id and s.status = 'active'), '[]'::jsonb))
$f$;

-- sala sugerida: compatível, aberta, com vaga; a menos cheia (depois a ordem)
create or replace function private.v39_kids_room_suggest(p_event uuid, p_birth date, p_sex text) returns uuid
language sql stable security definer set search_path = pg_catalog, app, private as $f$
  select r.id from app.kids_event_rooms r
   where r.event_id = p_event and private.v39_kids_room_fits(r, p_birth, p_sex)
     and (r.capacity is null or (select count(*) from app.kids_checkins c where c.event_room_id = r.id and c.status = 'present') < r.capacity)
   order by (select count(*) from app.kids_checkins c where c.event_room_id = r.id and c.status = 'present'), r.sort_order, r.name
   limit 1
$f$;

-- B. member_save e families com parentesco (corpo do KIDS_2 + kinship) -----------------
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
  v_sit text := nullif(btrim(p->>'situacao'), ''); v_par text := nullif(btrim(p->>'parentesco'), '');
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
  if not private.v39_kinship_ok(v_par) then perform app.raise_domain_error('KIDS_KINSHIP_INVALID', 'Grau de parentesco invalido'); end if;

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
    insert into app.family_members (church_id, family_id, person_id, role, can_pick_up, is_primary_contact, kinship, created_by_user_account_id, updated_by_user_account_id)
    values (p_church_id, f.id, v_pes, v_papel, v_ret, v_princ, v_par, v_me, v_me) returning * into fm;
  else
    update app.family_members set role = v_papel, can_pick_up = v_ret, is_primary_contact = v_princ, kinship = coalesce(v_par, kinship), updated_by_user_account_id = v_me
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

create or replace function app.v39_kids_families(p_church_id uuid, p_ministry_id uuid, p_q text default null, p_incluir_inativas boolean default false) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare m app.ministries := private.v39_kids_need(p_church_id, p_ministry_id, 'volunteer'); v_q text := lower(btrim(coalesce(p_q, '')));
begin
  return coalesce((
    select jsonb_agg(x.j order by x.nm) from (
      select lower(f.name) nm, jsonb_build_object(
               'id', f.id, 'nome', f.name, 'status', f.status, 'obs', f.notes, 'motivoInativacao', f.inactivation_reason,
               'membros', coalesce((select jsonb_agg(private.v39_kids_person_json(p_church_id, fm.person_id, m.max_age_years)
                                                     || jsonb_build_object('id', fm.id, 'papel', fm.role, 'parentesco', fm.kinship, 'podeRetirar', fm.can_pick_up,
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

-- C. cadastro a partir da criança -----------------------------------------
create or replace function app.v39_kids_child_register(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id(); v_min uuid := nullif(p->>'ministerioId', '')::uuid; m app.ministries;
  v_resp uuid := nullif(p->>'responsavelId', '')::uuid; v_fam uuid; v_nome text; r jsonb; r2 jsonb;
begin
  m := private.v39_kids_need(p_church_id, v_min, 'volunteer');
  if v_resp is null then perform app.raise_domain_error('KIDS_GUARDIAN_REQUIRED', 'Escolha o responsavel da crianca'); end if;
  if not private.v39_kinship_ok(nullif(p->>'parentescoResponsavel', '')) or not private.v39_kinship_ok(nullif(p->'crianca'->>'parentesco', '')) then
    perform app.raise_domain_error('KIDS_KINSHIP_INVALID', 'Grau de parentesco invalido');
  end if;
  -- núcleo do responsável (o mais recente em que ele é responsável); senão um novo, com o sobrenome dele
  select fm.family_id into v_fam from app.family_members fm join app.families f on f.id = fm.family_id and f.status = 'active'
   where fm.church_id = p_church_id and fm.person_id = v_resp and fm.status = 'active' and fm.role = 'responsavel'
   order by fm.created_at desc limit 1;
  if v_fam is null then
    select 'Família ' || coalesce(nullif(regexp_replace(btrim(full_name), '^.*\s', ''), ''), full_name) into v_nome from app.people where id = v_resp;
    r := app.v39_kids_family_save(p_church_id, jsonb_build_object('ministerioId', v_min, 'nome', coalesce(v_nome, 'Família')));
    v_fam := (r->>'id')::uuid;
    r := app.v39_kids_member_save(p_church_id, jsonb_build_object('ministerioId', v_min, 'familiaId', v_fam, 'papel', 'responsavel', 'pessoaId', v_resp,
                                  'podeRetirar', true, 'contatoPrincipal', true, 'parentesco', nullif(p->>'parentescoResponsavel', ''),
                                  'pessoa', coalesce(p->'responsavel', '{}'::jsonb)));
  elsif nullif(p->>'parentescoResponsavel', '') is not null then
    update app.family_members set kinship = nullif(p->>'parentescoResponsavel', ''), updated_by_user_account_id = v_me
     where family_id = v_fam and person_id = v_resp and status = 'active';
  end if;
  r2 := app.v39_kids_member_save(p_church_id, jsonb_build_object('ministerioId', v_min, 'familiaId', v_fam, 'papel', 'crianca',
                                 'pessoaId', nullif(p->>'criancaId', ''), 'pessoa', p->'crianca', 'parentesco', nullif(p->'crianca'->>'parentesco', ''),
                                 'situacao', nullif(p->>'situacao', '')));
  return jsonb_build_object('ok', true, 'familiaId', v_fam, 'criancaId', r2->>'pessoaId', 'situacao', r2->>'situacao');
end $f$;

-- D. vínculos no cadastro de pessoas ----------------------------------------
create or replace function private.v39_family_can_view(p_church_id uuid, p_person uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, app, private as $f$
  select app.current_user_account_id() is not null and coalesce(app.v39_has_church_access(p_church_id), false)
     and (app.has_permission('people.view', p_church_id) or app.v39_pode_editar_pessoa(p_church_id, p_person) or private.v39_kids_is_team(p_church_id))
$f$;

create or replace function app.v39_family_links(p_church_id uuid, p_person_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
begin
  if not private.v39_family_can_view(p_church_id, p_person_id) then perform app.raise_domain_error('PERMISSION_DENIED', 'Sem permissao'); end if;
  return jsonb_build_object('podeEditar', app.v39_pode_editar_pessoa(p_church_id, p_person_id), 'nucleos', coalesce((
    select jsonb_agg(jsonb_build_object('familiaId', f.id,
             'membros', (select jsonb_agg(jsonb_build_object('id', x.id, 'pessoaId', x.person_id, 'nome', coalesce(nullif(btrim(p.preferred_name), ''), p.full_name),
                                                             'papel', x.role, 'parentesco', x.kinship, 'podeRetirar', x.can_pick_up,
                                                             'idade', private.v39_kids_age(p.birth_date), 'euMesmo', x.person_id = p_person_id)
                                         order by (x.person_id = p_person_id) desc, x.role, p.full_name)
                           from app.family_members x join app.people p on p.id = x.person_id
                          where x.family_id = f.id and x.status = 'active')) order by f.created_at)
      from app.families f
     where f.church_id = p_church_id and f.status = 'active'
       and exists (select 1 from app.family_members me where me.family_id = f.id and me.person_id = p_person_id and me.status = 'active')), '[]'::jsonb));
end $f$;

-- liga duas pessoas da igreja no mesmo núcleo (cria o núcleo se a pessoa ainda não tiver), com parentesco
create or replace function app.v39_family_link_set(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id(); v_pes uuid := nullif(p->>'pessoaId', '')::uuid; v_vin uuid := nullif(p->>'vinculadoId', '')::uuid;
  v_fam uuid := nullif(p->>'familiaId', '')::uuid; v_papel text := coalesce(nullif(btrim(p->>'papelVinculado'), ''), 'outro');
  v_par text := nullif(btrim(p->>'parentescoVinculado'), ''); v_papel_p text := nullif(btrim(p->>'papelPessoa'), '');
  v_par_p text := nullif(btrim(p->>'parentescoPessoa'), ''); v_ret boolean := coalesce((nullif(p->>'podeRetirar', ''))::boolean, false);
  a app.people; b app.people; v_nome text; x app.family_members; v_ia integer; v_ib integer;
begin
  if v_pes is null or v_vin is null or v_pes = v_vin then perform app.raise_domain_error('PERSON_REQUIRED', 'Informe as duas pessoas'); end if;
  if not app.v39_pode_editar_pessoa(p_church_id, v_pes) then perform app.raise_domain_error('PERMISSION_DENIED', 'Sem permissao para editar esta pessoa'); end if;
  if v_papel not in ('responsavel','crianca','outro') or (v_papel_p is not null and v_papel_p not in ('responsavel','crianca','outro')) then
    perform app.raise_domain_error('KIDS_ROLE_INVALID', 'Papel invalido');
  end if;
  if not private.v39_kinship_ok(v_par) or not private.v39_kinship_ok(v_par_p) then perform app.raise_domain_error('KIDS_KINSHIP_INVALID', 'Grau de parentesco invalido'); end if;
  select * into a from app.people where id = v_pes;
  select * into b from app.people where id = v_vin;
  if not private.v39_min_person_ok(p_church_id, v_pes) or not private.v39_min_person_ok(p_church_id, v_vin) then
    perform app.raise_domain_error('KIDS_PERSON_INVALID', 'As duas pessoas precisam estar ativas nesta igreja');
  end if;
  v_ia := private.v39_kids_age(a.birth_date); v_ib := private.v39_kids_age(b.birth_date);
  v_papel_p := coalesce(v_papel_p, case when v_ia is not null and v_ia < 12 then 'crianca' when v_papel = 'crianca' then 'responsavel' else 'outro' end);
  if v_papel = 'crianca' and (v_ib is null or v_ib >= 12) then perform app.raise_domain_error('KIDS_CHILD_AGE', 'Criança do Kids: menos de 12 anos e com data de nascimento'); end if;
  if v_papel_p = 'crianca' and (v_ia is null or v_ia >= 12) then perform app.raise_domain_error('KIDS_CHILD_AGE', 'Criança do Kids: menos de 12 anos e com data de nascimento'); end if;
  if v_ret and (v_papel = 'crianca' or v_ib is null or v_ib < 12) then perform app.raise_domain_error('KIDS_PICKUP_AGE', 'Quem retira precisa ter 12 anos ou mais'); end if;
  if v_fam is not null and not exists (select 1 from app.family_members where family_id = v_fam and person_id = v_pes and status = 'active') then
    perform app.raise_domain_error('KIDS_FAMILY_NOT_FOUND', 'Nucleo familiar nao encontrado');
  end if;
  if v_fam is null then
    select fm.family_id into v_fam from app.family_members fm join app.families f on f.id = fm.family_id and f.status = 'active'
     where fm.church_id = p_church_id and fm.person_id = v_pes and fm.status = 'active' order by fm.created_at limit 1;
  end if;
  if v_fam is null then
    v_nome := 'Família ' || coalesce(nullif(regexp_replace(btrim(a.full_name), '^.*\s', ''), ''), a.full_name);
    insert into app.families (church_id, name, created_by_user_account_id, updated_by_user_account_id) values (p_church_id, left(v_nome, 120), v_me, v_me) returning id into v_fam;
  end if;
  -- a própria pessoa no núcleo
  select * into x from app.family_members where family_id = v_fam and person_id = v_pes and status = 'active';
  if x.id is null then
    insert into app.family_members (church_id, family_id, person_id, role, can_pick_up, kinship, created_by_user_account_id, updated_by_user_account_id)
    values (p_church_id, v_fam, v_pes, v_papel_p, v_papel_p = 'responsavel' and coalesce(v_ia, 99) >= 12, v_par_p, v_me, v_me);
  elsif v_par_p is not null then
    update app.family_members set kinship = v_par_p, updated_by_user_account_id = v_me where id = x.id;
  end if;
  -- o vinculado
  select * into x from app.family_members where family_id = v_fam and person_id = v_vin and status = 'active';
  if x.id is null then
    insert into app.family_members (church_id, family_id, person_id, role, can_pick_up, kinship, created_by_user_account_id, updated_by_user_account_id)
    values (p_church_id, v_fam, v_vin, v_papel, v_ret, v_par, v_me, v_me) returning * into x;
  else
    update app.family_members set role = v_papel, can_pick_up = v_ret, kinship = coalesce(v_par, kinship), updated_by_user_account_id = v_me
     where id = x.id returning * into x;
  end if;
  perform private.v39_kids_audit(p_church_id, 'data_change', 'family_link_set', 'family_members', x.id, v_vin,
                                 case when v_papel = 'crianca' then 'minor' else 'personal' end, null,
                                 jsonb_build_object('family_id', v_fam, 'person_id', v_pes, 'role', v_papel, 'kinship', v_par, 'can_pick_up', v_ret));
  return jsonb_build_object('ok', true, 'id', x.id, 'familiaId', v_fam);
end $f$;

create or replace function app.v39_family_link_end(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_me uuid := app.current_user_account_id(); x app.family_members; v_motivo text := nullif(btrim(p->>'motivo'), '');
begin
  select * into x from app.family_members where id = nullif(p->>'id', '')::uuid and church_id = p_church_id and status = 'active' for update;
  if x.id is null then perform app.raise_domain_error('KIDS_MEMBER_NOT_FOUND', 'Vinculo nao encontrado'); end if;
  if not (app.v39_pode_editar_pessoa(p_church_id, x.person_id)
          or exists (select 1 from app.family_members o where o.family_id = x.family_id and o.status = 'active' and app.v39_pode_editar_pessoa(p_church_id, o.person_id))) then
    perform app.raise_domain_error('PERMISSION_DENIED', 'Sem permissao');
  end if;
  if v_motivo is null then perform app.raise_domain_error('REASON_REQUIRED', 'Informe o motivo'); end if;
  update app.family_members set status = 'ended', ended_at = now(), end_reason = left(v_motivo, 500), updated_by_user_account_id = v_me where id = x.id;
  perform private.v39_kids_audit(p_church_id, 'status_change', 'family_link_ended', 'family_members', x.id, x.person_id,
                                 case when x.role = 'crianca' then 'minor' else 'personal' end, v_motivo, jsonb_build_object('family_id', x.family_id));
  return jsonb_build_object('ok', true, 'id', x.id);
end $f$;

-- E. salas: RPCs ------------------------------------------------------------
create or replace function app.v39_kids_rooms(p_church_id uuid, p_ministry_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare m app.ministries := private.v39_kids_need(p_church_id, p_ministry_id, 'volunteer');
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'nome', r.name, 'unidade', r.age_unit, 'idadeMin', r.min_age, 'idadeMax', r.max_age,
                                                       'genero', r.gender, 'capacidade', r.capacity, 'ordem', r.sort_order, 'status', r.status,
                                                       'motivoInativacao', r.inactivation_reason) order by (r.status = 'active') desc, r.sort_order, r.name)
                     from app.kids_rooms r where r.ministry_id = p_ministry_id and r.church_id = p_church_id), '[]'::jsonb);
end $f$;

create or replace function private.v39_kids_room_fields(p jsonb, out v_nome text, out v_un text, out v_min integer, out v_max integer, out v_gen text, out v_cap integer, out v_ord integer)
language plpgsql immutable set search_path = pg_catalog, app as $f$
begin
  v_nome := nullif(btrim(p->>'nome'), ''); v_un := coalesce(nullif(btrim(p->>'unidade'), ''), 'anos');
  v_min := coalesce(nullif(p->>'idadeMin', '')::integer, 0); v_max := nullif(p->>'idadeMax', '')::integer;
  v_gen := nullif(btrim(p->>'genero'), ''); v_cap := nullif(p->>'capacidade', '')::integer; v_ord := coalesce(nullif(p->>'ordem', '')::integer, 0);
  if v_nome is null then perform app.raise_domain_error('KIDS_ROOM_NAME_REQUIRED', 'Informe o nome da sala'); end if;
  if v_un not in ('anos','meses') then perform app.raise_domain_error('KIDS_ROOM_INVALID', 'Unidade de idade invalida'); end if;
  if v_max is null or v_max < v_min or v_min < 0 or (v_un = 'anos' and v_max > 18) or (v_un = 'meses' and v_max > 48) then
    perform app.raise_domain_error('KIDS_ROOM_AGE_INVALID', 'Faixa de idade invalida');
  end if;
  if v_gen is not null and v_gen not in ('Masculino','Feminino') then perform app.raise_domain_error('KIDS_ROOM_INVALID', 'Genero invalido'); end if;
  if v_cap is not null and v_cap <= 0 then perform app.raise_domain_error('KIDS_ROOM_INVALID', 'Capacidade invalida'); end if;
end $f$;

-- sala padrão do Kids (líder): criar, alterar, inativar com motivo
create or replace function app.v39_kids_room_save(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id(); v_min uuid := nullif(p->>'ministerioId', '')::uuid; m app.ministries;
  v_id uuid := nullif(p->>'id', '')::uuid; v_status text := coalesce(nullif(btrim(p->>'status'), ''), 'active'); v_motivo text := nullif(btrim(p->>'motivo'), '');
  f record; r app.kids_rooms;
begin
  m := private.v39_kids_need(p_church_id, v_min, 'leader');
  select * into f from private.v39_kids_room_fields(p);
  if v_status not in ('active','inactive') then perform app.raise_domain_error('KIDS_STATUS_INVALID', 'Situacao invalida'); end if;
  if v_status = 'inactive' and v_motivo is null then perform app.raise_domain_error('REASON_REQUIRED', 'Informe o motivo'); end if;
  if v_status = 'active' and exists (select 1 from app.kids_rooms x where x.ministry_id = v_min and x.status = 'active' and lower(btrim(x.name)) = lower(f.v_nome) and x.id is distinct from v_id) then
    perform app.raise_domain_error('KIDS_ROOM_DUPLICATE', 'Ja existe sala com este nome');
  end if;
  if v_id is null then
    insert into app.kids_rooms (church_id, ministry_id, name, age_unit, min_age, max_age, gender, capacity, sort_order, created_by_user_account_id, updated_by_user_account_id)
    values (p_church_id, v_min, left(f.v_nome, 80), f.v_un, f.v_min, f.v_max, f.v_gen, f.v_cap, f.v_ord, v_me, v_me) returning * into r;
  else
    update app.kids_rooms set name = left(f.v_nome, 80), age_unit = f.v_un, min_age = f.v_min, max_age = f.v_max, gender = f.v_gen, capacity = f.v_cap,
           sort_order = f.v_ord, status = v_status, inactivated_at = case when v_status = 'inactive' then coalesce(inactivated_at, now()) end,
           inactivation_reason = case when v_status = 'inactive' then v_motivo end, updated_by_user_account_id = v_me
     where id = v_id and ministry_id = v_min returning * into r;
    if r.id is null then perform app.raise_domain_error('KIDS_ROOM_NOT_FOUND', 'Sala nao encontrada'); end if;
  end if;
  perform private.v39_kids_audit(p_church_id, 'data_change', 'kids_room_saved', 'kids_rooms', r.id, null, 'standard', v_motivo, jsonb_build_object('status', r.status));
  return jsonb_build_object('ok', true, 'id', r.id, 'status', r.status);
end $f$;

-- salas do evento (garante a cópia das salas padrão) com professores e lotação
create or replace function app.v39_kids_event_rooms(p_church_id uuid, p_ministry_id uuid, p_event_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare m app.ministries := private.v39_kids_need(p_church_id, p_ministry_id, 'volunteer'); e app.church_events := private.v39_kids_event_ok(p_church_id, p_ministry_id, p_event_id);
begin
  perform private.v39_kids_event_rooms_ensure(p_church_id, p_ministry_id, e);
  return coalesce((select jsonb_agg(private.v39_kids_event_room_json(r) order by (r.status = 'open') desc, r.sort_order, r.name)
                     from app.kids_event_rooms r where r.event_id = e.id), '[]'::jsonb);
end $f$;

-- sala no evento (líder): ajustar, abrir/fechar, criar uma sala só deste evento
create or replace function app.v39_kids_event_room_save(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id(); v_min uuid := nullif(p->>'ministerioId', '')::uuid; m app.ministries; e app.church_events;
  v_id uuid := nullif(p->>'id', '')::uuid; v_status text := coalesce(nullif(btrim(p->>'status'), ''), 'open'); v_motivo text := nullif(btrim(p->>'motivo'), '');
  f record; r app.kids_event_rooms;
begin
  m := private.v39_kids_need(p_church_id, v_min, 'leader');
  e := private.v39_kids_event_ok(p_church_id, v_min, nullif(p->>'eventoId', '')::uuid);
  select * into f from private.v39_kids_room_fields(p);
  if v_status not in ('open','closed') then perform app.raise_domain_error('KIDS_STATUS_INVALID', 'Situacao invalida'); end if;
  if v_status = 'closed' and v_motivo is null then perform app.raise_domain_error('REASON_REQUIRED', 'Informe o motivo de fechar a sala'); end if;
  if v_status = 'closed' and v_id is not null and exists (select 1 from app.kids_checkins where event_room_id = v_id and status = 'present') then
    perform app.raise_domain_error('KIDS_ROOM_HAS_CHILDREN', 'Ha criancas nesta sala: troque-as de sala antes de fechar');
  end if;
  if v_id is null then
    if now() > private.v39_trava_evento(e) and not private.v39_trava_liberada(e.id) then perform app.raise_domain_error('REGISTRO_TRAVADO', 'Evento travado'); end if;
    insert into app.kids_event_rooms (church_id, event_id, name, age_unit, min_age, max_age, gender, capacity, sort_order, created_by_user_account_id, updated_by_user_account_id)
    values (p_church_id, e.id, left(f.v_nome, 80), f.v_un, f.v_min, f.v_max, f.v_gen, f.v_cap, f.v_ord, v_me, v_me) returning * into r;
  else
    update app.kids_event_rooms set name = left(f.v_nome, 80), age_unit = f.v_un, min_age = f.v_min, max_age = f.v_max, gender = f.v_gen, capacity = f.v_cap,
           sort_order = f.v_ord, status = v_status, closed_reason = case when v_status = 'closed' then v_motivo end, updated_by_user_account_id = v_me
     where id = v_id and event_id = e.id returning * into r;
    if r.id is null then perform app.raise_domain_error('KIDS_ROOM_NOT_FOUND', 'Sala nao encontrada'); end if;
  end if;
  perform private.v39_kids_audit(p_church_id, 'data_change', 'kids_event_room_saved', 'kids_event_rooms', r.id, null, 'standard', v_motivo,
                                 jsonb_build_object('event_id', e.id, 'status', r.status));
  return private.v39_kids_event_room_json(r) || jsonb_build_object('ok', true);
end $f$;

-- professores da sala no evento (líder): a lista enviada passa a ser a escala da sala (quem sai fica registrado)
create or replace function app.v39_kids_event_room_staff_set(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id(); v_min uuid := nullif(p->>'ministerioId', '')::uuid; m app.ministries; r app.kids_event_rooms; e app.church_events;
  it jsonb; v_pes uuid; v_fun text; v_lista uuid[] := '{}';
begin
  m := private.v39_kids_need(p_church_id, v_min, 'leader');
  select * into r from app.kids_event_rooms where id = nullif(p->>'salaId', '')::uuid and church_id = p_church_id;
  if r.id is null then perform app.raise_domain_error('KIDS_ROOM_NOT_FOUND', 'Sala nao encontrada'); end if;
  e := private.v39_kids_event_ok(p_church_id, v_min, r.event_id);
  for it in select * from jsonb_array_elements(coalesce(p->'professores', '[]'::jsonb)) loop
    v_pes := nullif(it->>'pessoaId', '')::uuid; v_fun := coalesce(nullif(btrim(it->>'funcao'), ''), 'professor');
    if v_fun not in ('professor','auxiliar') then perform app.raise_domain_error('KIDS_STAFF_ROLE_INVALID', 'Funcao invalida'); end if;
    if not exists (select 1 from app.ministry_memberships mm where mm.ministry_id = v_min and mm.person_id = v_pes and mm.status = 'active') then
      perform app.raise_domain_error('KIDS_STAFF_NOT_MEMBER', 'O professor precisa estar na equipe ativa do Kids');
    end if;
    if not exists (select 1 from app.user_accounts ua join app.church_user_access cua on cua.user_account_id = ua.id
                    where ua.person_id = v_pes and ua.status = 'active' and cua.church_id = p_church_id and cua.status = 'active') then
      perform app.raise_domain_error('KIDS_STAFF_NO_LOGIN', 'So quem tem acesso ao app pode ser escalado');
    end if;
    v_lista := v_lista || v_pes;
    insert into app.kids_event_room_staff (church_id, event_room_id, person_id, staff_role, created_by_user_account_id, updated_by_user_account_id)
    values (p_church_id, r.id, v_pes, v_fun, v_me, v_me)
    on conflict (event_room_id, person_id) where status = 'active' do update set staff_role = excluded.staff_role, updated_by_user_account_id = v_me;
  end loop;
  update app.kids_event_room_staff set status = 'removed', removed_at = now(), removed_reason = 'Retirado da escala da sala pelo lider', updated_by_user_account_id = v_me
   where event_room_id = r.id and status = 'active' and not (person_id = any (v_lista));
  perform private.v39_kids_audit(p_church_id, 'data_change', 'kids_event_room_staff_set', 'kids_event_rooms', r.id, null, 'standard', null,
                                 jsonb_build_object('event_id', r.event_id, 'staff', to_jsonb(v_lista)));
  select * into r from app.kids_event_rooms where id = r.id;
  return private.v39_kids_event_room_json(r) || jsonb_build_object('ok', true);
end $f$;

-- checkin_json (com a sala) e checkin (sala manual ou automática): corpo do KIDS_3 + sala
create or replace function private.v39_kids_checkin_json(c app.kids_checkins) returns jsonb
language sql stable security definer set search_path = pg_catalog, app, private as $f$
  select jsonb_build_object(
           'id', c.id, 'status', c.status, 'eventoId', c.event_id, 'familiaId', c.family_id, 'familia', f.name,
           'criancaId', c.child_person_id, 'crianca', coalesce(nullif(btrim(ch.preferred_name), ''), ch.full_name), 'criancaNomeCompleto', ch.full_name,
           'idade', private.v39_kids_age(ch.birth_date), 'temFoto', ch.photo_file_id is not null,
           'situacao', cp.status,
           'temAlergia', coalesce(k.has_allergy, false), 'temRestricao', coalesce(k.has_restriction, false),
           'trazidoPor', coalesce(nullif(btrim(bb.preferred_name), ''), bb.full_name),
           'entrada', c.checked_in_at, 'retirada', c.picked_up_at,
           'retiradoPor', coalesce(nullif(btrim(pu.preferred_name), ''), pu.full_name), 'metodo', c.pickup_method, 'motivoFoto', c.pickup_reason,
           'cancelada', c.cancelled_at, 'motivoCancelamento', c.cancel_reason,
           'salaId', c.event_room_id, 'sala', (select r.name from app.kids_event_rooms r where r.id = c.event_room_id))
    from app.people ch
    join app.families f on f.id = c.family_id
    join app.people bb on bb.id = c.brought_by_person_id
    left join app.people pu on pu.id = c.picked_up_by_person_id
    left join app.church_people cp on cp.person_id = ch.id and cp.church_id = c.church_id and cp.ended_at is null
    left join app.kids_child_profiles k on k.person_id = ch.id and k.church_id = c.church_id and k.status = 'active'
   where ch.id = c.child_person_id
$f$;

create or replace function app.v39_kids_checkin(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id(); v_min uuid := nullif(p->>'ministerioId', '')::uuid; m app.ministries; e app.church_events;
  v_ch uuid := nullif(p->>'criancaId', '')::uuid; v_by uuid := nullif(p->>'trazidoPorId', '')::uuid;
  v_cod text := nullif(btrim(p->>'codigoFamilia'), ''); fm app.family_members; pe app.people; c app.kids_checkins; x app.kids_checkins;
  v_hash text; v_ok boolean; v_n integer := 0; v_resp record; v_sala uuid := nullif(p->>'salaId', '')::uuid; rs app.kids_event_rooms;
begin
  m := private.v39_kids_need(p_church_id, v_min, 'volunteer');
  e := private.v39_kids_event_ok(p_church_id, v_min, nullif(p->>'eventoId', '')::uuid);
  if e.status not in ('draft','planned','open') then perform app.raise_domain_error('KIDS_EVENT_CLOSED', 'Evento encerrado ou cancelado'); end if;
  if now() > private.v39_trava_evento(e) and not private.v39_trava_liberada(e.id) then
    perform app.raise_domain_error('REGISTRO_TRAVADO', 'Evento travado (mais de 24h)');
  end if;
  select fm2.* into fm from app.family_members fm2 join app.families f on f.id = fm2.family_id and f.status = 'active'
   where fm2.church_id = p_church_id and fm2.person_id = v_ch and fm2.status = 'active' and fm2.role = 'crianca'
     and (v_by is null or exists (select 1 from app.family_members b where b.family_id = fm2.family_id and b.person_id = v_by and b.status = 'active'
                                   and b.role <> 'crianca' and (b.role = 'responsavel' or b.can_pick_up)))
   order by fm2.created_at limit 1;
  if fm.id is null then
    if v_by is not null and exists (select 1 from app.family_members where church_id = p_church_id and person_id = v_ch and status = 'active' and role = 'crianca') then
      perform app.raise_domain_error('KIDS_BROUGHT_BY_INVALID', 'Quem trouxe precisa ser responsavel ou autorizado na familia da crianca');
    end if;
    perform app.raise_domain_error('KIDS_CHILD_NOT_FOUND', 'Crianca nao encontrada no Kids');
  end if;
  if v_by is null then perform app.raise_domain_error('KIDS_BROUGHT_BY_REQUIRED', 'Informe quem trouxe a crianca'); end if;
  select * into pe from app.people where id = v_ch;
  if coalesce(private.v39_kids_age(pe.birth_date), 99) >= coalesce(m.max_age_years, 12) then perform app.raise_domain_error('KIDS_AGE_OVER', 'A crianca ja passou da idade do Kids'); end if;
  if pe.photo_file_id is null then perform app.raise_domain_error('KIDS_PHOTO_REQUIRED', 'A crianca precisa ter foto'); end if;
  if not private.v39_kids_has_consent(p_church_id, v_ch) then perform app.raise_domain_error('KIDS_CONSENT_REQUIRED', 'Falta a autorizacao do responsavel'); end if;
  select p2.id, private.v39_kids_whatsapp(p2.id) fone into v_resp
    from app.family_members r join app.people p2 on p2.id = r.person_id
   where r.family_id = fm.family_id and r.status = 'active' and r.role = 'responsavel' and private.v39_kids_whatsapp(p2.id) is not null
   order by (r.person_id = v_by) desc, r.is_primary_contact desc, r.created_at limit 1;
  if v_resp.id is null then perform app.raise_domain_error('KIDS_PHONE_REQUIRED', 'A familia precisa de um responsavel com WhatsApp'); end if;
  if exists (select 1 from app.kids_checkins where event_id = e.id and child_person_id = v_ch and status <> 'cancelled') then
    perform app.raise_domain_error('KIDS_ALREADY_IN', 'A crianca ja deu entrada neste evento');
  end if;

  -- código: o da família (irmãos) ou um novo, sem repetir entre as crianças presentes no evento
  if v_cod is not null then
    select * into x from app.kids_checkins where event_id = e.id and family_id = fm.family_id and status = 'present'
       and private.v39_kids_code_match(code_hash, v_cod) limit 1;
    if x.id is null then perform app.raise_domain_error('KIDS_CODE_INVALID', 'Codigo da familia nao confere'); end if;
    v_hash := x.code_hash;
  else
    loop
      v_n := v_n + 1;
      v_cod := lpad((floor(random() * 10000))::int::text, 4, '0');
      select not exists (select 1 from app.kids_checkins where event_id = e.id and status = 'present' and private.v39_kids_code_match(code_hash, v_cod)) into v_ok;
      exit when v_ok or v_n > 50;
    end loop;
    if not v_ok then perform app.raise_domain_error('KIDS_CODE_EXHAUSTED', 'Nao foi possivel gerar um codigo livre'); end if;
    v_hash := extensions.crypt(v_cod, extensions.gen_salt('bf', 6));
  end if;

  -- sala: a escolhida (aberta, deste evento) ou a sugerida pelos critérios (idade/gênero, menos cheia); sem sala compatível entra sem sala
  perform private.v39_kids_event_rooms_ensure(p_church_id, m.id, e);
  if v_sala is not null then
    select * into rs from app.kids_event_rooms where id = v_sala and event_id = e.id;
    if rs.id is null or rs.status <> 'open' then perform app.raise_domain_error('KIDS_ROOM_NOT_FOUND', 'Sala nao encontrada ou fechada'); end if;
  else
    v_sala := private.v39_kids_room_suggest(e.id, pe.birth_date, pe.sex);
  end if;
  insert into app.kids_checkins (church_id, ministry_id, event_id, family_id, child_person_id, brought_by_person_id, code_hash, checked_in_by_user_account_id, event_room_id)
  values (p_church_id, m.id, e.id, fm.family_id, v_ch, v_by, v_hash, v_me, v_sala) returning * into c;
  insert into app.church_event_participants (event_id, person_id, participation_role, registration_status, attendance_status, checked_in_at, created_by_user_account_id, updated_by_user_account_id)
  values (e.id, v_ch, 'crianca', 'confirmed', 'present', c.checked_in_at, v_me, v_me)
  on conflict (event_id, person_id) do update set attendance_status = 'present', registration_status = 'confirmed',
         checked_in_at = excluded.checked_in_at, updated_by_user_account_id = v_me;
  perform private.v39_kids_audit(p_church_id, 'data_change', 'kids_checkin', 'kids_checkins', c.id, v_ch, 'minor', null,
                                 jsonb_build_object('event_id', e.id, 'brought_by', v_by, 'family_code_reused', x.id is not null, 'room_id', v_sala));
  return private.v39_kids_checkin_json(c) || jsonb_build_object(
           'ok', true, 'codigo', v_cod, 'evento', e.name, 'inicio', e.starts_at,
           'cultoId', e.parent_event_id, 'culto', (select name from app.church_events where id = e.parent_event_id),
           'igreja', (select name from app.churches where id = p_church_id),
           'responsavelId', v_resp.id, 'whatsapp', v_resp.fone);
end $f$;

-- trocar a criança de sala (qualquer voluntário)
create or replace function app.v39_kids_checkin_move(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id(); v_min uuid := nullif(p->>'ministerioId', '')::uuid; m app.ministries;
  c app.kids_checkins; r app.kids_event_rooms; v_old uuid;
begin
  m := private.v39_kids_need(p_church_id, v_min, 'volunteer');
  select * into c from app.kids_checkins where id = nullif(p->>'checkinId', '')::uuid and church_id = p_church_id and ministry_id = v_min for update;
  if c.id is null then perform app.raise_domain_error('KIDS_CHECKIN_NOT_FOUND', 'Entrada nao encontrada'); end if;
  if c.status <> 'present' then perform app.raise_domain_error('KIDS_NOT_PRESENT', 'A crianca nao esta mais na sala'); end if;
  select * into r from app.kids_event_rooms where id = nullif(p->>'salaId', '')::uuid and event_id = c.event_id;
  if r.id is null or r.status <> 'open' then perform app.raise_domain_error('KIDS_ROOM_NOT_FOUND', 'Sala nao encontrada ou fechada'); end if;
  v_old := c.event_room_id;
  update app.kids_checkins set event_room_id = r.id where id = c.id returning * into c;
  perform private.v39_kids_audit(p_church_id, 'data_change', 'kids_checkin_room_moved', 'kids_checkins', c.id, c.child_person_id, 'minor', null,
                                 jsonb_build_object('from', v_old, 'to', r.id));
  return private.v39_kids_checkin_json(c) || jsonb_build_object('ok', true);
end $f$;

-- grants ----------------------------------------------------------------
revoke all on function private.v39_kinship_ok(text) from public;
revoke all on function private.v39_kids_room_guard() from public;
revoke all on function private.v39_age_months(date) from public;
revoke all on function private.v39_kids_room_fits(app.kids_event_rooms, date, text) from public;
revoke all on function private.v39_kids_event_rooms_ensure(uuid, uuid, app.church_events) from public;
revoke all on function private.v39_kids_event_room_json(app.kids_event_rooms) from public;
revoke all on function private.v39_kids_room_suggest(uuid, date, text) from public;
revoke all on function private.v39_family_can_view(uuid, uuid) from public;
revoke all on function private.v39_kids_room_fields(jsonb) from public;
revoke all on function app.v39_kids_member_save(uuid, jsonb) from public, anon;
revoke all on function app.v39_kids_families(uuid, uuid, text, boolean) from public, anon;
revoke all on function app.v39_kids_child_register(uuid, jsonb) from public, anon;
revoke all on function app.v39_family_links(uuid, uuid) from public, anon;
revoke all on function app.v39_family_link_set(uuid, jsonb) from public, anon;
revoke all on function app.v39_family_link_end(uuid, jsonb) from public, anon;
revoke all on function app.v39_kids_rooms(uuid, uuid) from public, anon;
revoke all on function app.v39_kids_room_save(uuid, jsonb) from public, anon;
revoke all on function app.v39_kids_event_rooms(uuid, uuid, uuid) from public, anon;
revoke all on function app.v39_kids_event_room_save(uuid, jsonb) from public, anon;
revoke all on function app.v39_kids_event_room_staff_set(uuid, jsonb) from public, anon;
revoke all on function app.v39_kids_checkin(uuid, jsonb) from public, anon;
revoke all on function app.v39_kids_checkin_move(uuid, jsonb) from public, anon;
revoke all on function private.v39_kids_checkin_json(app.kids_checkins) from public;
grant execute on function app.v39_kids_member_save(uuid, jsonb) to authenticated;
grant execute on function app.v39_kids_families(uuid, uuid, text, boolean) to authenticated;
grant execute on function app.v39_kids_child_register(uuid, jsonb) to authenticated;
grant execute on function app.v39_family_links(uuid, uuid) to authenticated;
grant execute on function app.v39_family_link_set(uuid, jsonb) to authenticated;
grant execute on function app.v39_family_link_end(uuid, jsonb) to authenticated;
grant execute on function app.v39_kids_rooms(uuid, uuid) to authenticated;
grant execute on function app.v39_kids_room_save(uuid, jsonb) to authenticated;
grant execute on function app.v39_kids_event_rooms(uuid, uuid, uuid) to authenticated;
grant execute on function app.v39_kids_event_room_save(uuid, jsonb) to authenticated;
grant execute on function app.v39_kids_event_room_staff_set(uuid, jsonb) to authenticated;
grant execute on function app.v39_kids_checkin(uuid, jsonb) to authenticated;
grant execute on function app.v39_kids_checkin_move(uuid, jsonb) to authenticated;
-- KIDS5-BODY-END

commit;
notify pgrst, 'reload schema';

-- VERIFICACAO (deve dar tudo true)
select
  (select count(*) = 1 from information_schema.columns where table_schema = 'app' and table_name = 'family_members' and column_name = 'kinship') as parentesco,
  (select count(*) = 3 from pg_class where oid in (to_regclass('app.kids_rooms'), to_regclass('app.kids_event_rooms'), to_regclass('app.kids_event_room_staff')) and relrowsecurity) as salas_com_rls,
  (select count(*) = 1 from information_schema.columns where table_schema = 'app' and table_name = 'kids_checkins' and column_name = 'event_room_id') as sala_na_entrada,
  (select count(*) = 10 from pg_proc where pronamespace = 'app'::regnamespace and proname in
     ('v39_kids_child_register','v39_family_links','v39_family_link_set','v39_family_link_end','v39_kids_rooms','v39_kids_room_save',
      'v39_kids_event_rooms','v39_kids_event_room_save','v39_kids_event_room_staff_set','v39_kids_checkin_move')
     and has_function_privilege('authenticated', oid, 'execute') and not has_function_privilege('anon', oid, 'execute')) as rpcs_novas,
  (select pg_get_functiondef('app.v39_kids_checkin(uuid,jsonb)'::regprocedure) like '%v39_kids_room_suggest%') as entrada_com_sala,
  (select count(*) from app.family_members) >= 0 as dados_preservados;
