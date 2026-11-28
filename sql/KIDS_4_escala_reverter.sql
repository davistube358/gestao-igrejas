-- =====================================================================
-- KIDS_4 · Escala do Kids · REVERTER
-- Desfaz o KIDS_4_escala_aplicar.sql e devolve as funções do KIDS_5/KIDS_3 (idade de retirada volta a 12).
-- ABORTA (sem alterar nada) se já houver transferência, resposta de escala ou WhatsApp registrado: os dados são
-- da igreja (nada é apagado) — decidir com o Diogo. Os avisos já gravados em app.notifications ficam.
-- =====================================================================
begin;

-- KIDS4-REVERTER-BEGIN
do $g$
begin
  if exists (select 1 from app.kids_staff_transfers)
     or exists (select 1 from app.kids_event_room_staff where response_status <> 'pending' or whatsapp_sent_at is not null) then
    raise exception 'KIDS_4 REVERTER ABORTADO: ja existem transferencias ou respostas de escala. Nada foi alterado.';
  end if;
end $g$;

drop function if exists app.v39_kids_transfer_cancel(uuid, jsonb);
drop function if exists app.v39_kids_transfer_decide(uuid, jsonb);
drop function if exists app.v39_kids_transfer_respond(uuid, jsonb);
drop function if exists app.v39_kids_transfer_request(uuid, jsonb);
drop function if exists app.v39_kids_schedule_whatsapp_sent(uuid, jsonb);
drop function if exists app.v39_kids_schedule_respond(uuid, jsonb);
drop function if exists app.v39_kids_my_schedule(uuid);
drop function if exists app.v39_notification_read(uuid, uuid);
drop function if exists app.v39_my_notifications(uuid, integer);

-- funções do KIDS_5 e do KIDS_3 como eram
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

create or replace function app.v39_kids_checkout(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id(); v_min uuid := nullif(p->>'ministerioId', '')::uuid; m app.ministries;
  v_id uuid := nullif(p->>'checkinId', '')::uuid; v_por uuid := nullif(p->>'retiradoPorId', '')::uuid;
  v_metodo text := coalesce(nullif(btrim(p->>'metodo'), ''), 'code'); v_motivo text := nullif(btrim(p->>'motivo'), '');
  c app.kids_checkins; pe app.people;
begin
  m := private.v39_kids_need(p_church_id, v_min, 'volunteer');
  select * into c from app.kids_checkins where id = v_id and church_id = p_church_id and ministry_id = v_min for update;
  if c.id is null then perform app.raise_domain_error('KIDS_CHECKIN_NOT_FOUND', 'Entrada nao encontrada'); end if;
  if c.status <> 'present' then perform app.raise_domain_error('KIDS_NOT_PRESENT', 'A crianca nao esta mais na sala'); end if;
  if v_metodo not in ('code','photo') then perform app.raise_domain_error('KIDS_METHOD_INVALID', 'Forma de conferencia invalida'); end if;
  if v_metodo = 'code' and not private.v39_kids_code_match(c.code_hash, btrim(coalesce(p->>'codigo', ''))) then
    perform app.raise_domain_error('KIDS_CODE_INVALID', 'Codigo nao confere');
  end if;
  if v_metodo = 'photo' and v_motivo is null then perform app.raise_domain_error('REASON_REQUIRED', 'Informe o motivo da retirada sem codigo'); end if;
  if v_por is null or not exists (select 1 from app.family_members where family_id = c.family_id and person_id = v_por and status = 'active'
                                     and can_pick_up and role <> 'crianca') then
    perform app.raise_domain_error('KIDS_PICKUP_NOT_AUTHORIZED', 'Esta pessoa nao esta autorizada a retirar a crianca');
  end if;
  select * into pe from app.people where id = v_por;
  if coalesce(private.v39_kids_age(pe.birth_date), 0) < 12 then perform app.raise_domain_error('KIDS_PICKUP_AGE', 'Quem retira precisa ter 12 anos ou mais'); end if;
  if pe.photo_file_id is null then perform app.raise_domain_error('KIDS_PHOTO_REQUIRED', 'Quem retira precisa ter foto para a conferencia'); end if;
  update app.kids_checkins set status = 'picked_up', picked_up_at = now(), picked_up_by_person_id = v_por, picked_up_by_user_account_id = v_me,
         pickup_method = v_metodo, pickup_reason = case when v_metodo = 'photo' then left(v_motivo, 500) end
   where id = c.id returning * into c;
  perform private.v39_kids_audit(p_church_id, 'status_change', 'kids_checkout', 'kids_checkins', c.id, c.child_person_id, 'minor', v_motivo,
                                 jsonb_build_object('event_id', c.event_id, 'picked_up_by', v_por, 'method', v_metodo));
  return private.v39_kids_checkin_json(c) || jsonb_build_object('ok', true);
end $f$;

drop function if exists private.v39_kids_staff_label(app.kids_event_rooms, app.church_events);
drop function if exists private.v39_kids_staff_ctx(uuid);
drop function if exists private.v39_kids_notify_leaders(uuid, uuid, text, text, text, text, uuid, jsonb);
drop function if exists private.v39_notify(uuid, uuid, text, text, text, text, uuid, jsonb, text);
drop table if exists app.kids_staff_transfers;
drop function if exists private.v39_kids_transfer_no_delete();
alter table app.kids_event_room_staff drop constraint if exists kids_event_room_staff_decline_reason;
alter table app.kids_event_room_staff drop constraint if exists kids_event_room_staff_response_check;
alter table app.kids_event_room_staff drop column if exists whatsapp_sent_at;
alter table app.kids_event_room_staff drop column if exists decline_reason;
alter table app.kids_event_room_staff drop column if exists responded_at;
alter table app.kids_event_room_staff drop column if exists response_status;

revoke all on function private.v39_kids_event_room_json(app.kids_event_rooms) from public;
revoke all on function app.v39_kids_event_room_staff_set(uuid, jsonb) from public, anon;
revoke all on function app.v39_kids_member_save(uuid, jsonb) from public, anon;
revoke all on function app.v39_family_link_set(uuid, jsonb) from public, anon;
revoke all on function app.v39_kids_checkout(uuid, jsonb) from public, anon;
grant execute on function app.v39_kids_event_room_staff_set(uuid, jsonb) to authenticated;
grant execute on function app.v39_kids_member_save(uuid, jsonb) to authenticated;
grant execute on function app.v39_family_link_set(uuid, jsonb) to authenticated;
grant execute on function app.v39_kids_checkout(uuid, jsonb) to authenticated;
-- KIDS4-REVERTER-END

commit;
notify pgrst, 'reload schema';

-- VERIFICACAO (deve dar tudo true)
select
  (select to_regclass('app.kids_staff_transfers') is null) as transferencias_removidas,
  (select count(*) = 0 from information_schema.columns where table_schema = 'app' and table_name = 'kids_event_room_staff' and column_name in ('response_status','responded_at','decline_reason','whatsapp_sent_at')) as colunas_removidas,
  (select count(*) = 0 from pg_proc where proname in ('v39_my_notifications','v39_kids_my_schedule','v39_kids_transfer_request','v39_notify')) as funcoes_removidas,
  (select pg_get_functiondef('app.v39_kids_checkout(uuid,jsonb)'::regprocedure) like '%< 12%') as retirada_volta_12;
