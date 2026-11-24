-- =====================================================================
-- KIDS_5 · Cadastro unificado e salas · REVERTER
-- Desfaz o KIDS_5_unificado_aplicar.sql e devolve as funções do KIDS_2/KIDS_3.
-- ABORTA (sem alterar nada) se já houver sala, sala de evento, professor escalado, entrada com sala
-- ou parentesco gravado: os dados são da igreja (nada é apagado) — decidir com o Diogo.
-- =====================================================================
begin;

-- KIDS5-REVERTER-BEGIN
do $g$
begin
  if exists (select 1 from app.kids_rooms) or exists (select 1 from app.kids_event_rooms) or exists (select 1 from app.kids_event_room_staff)
     or exists (select 1 from app.kids_checkins where event_room_id is not null) or exists (select 1 from app.family_members where kinship is not null) then
    raise exception 'KIDS_5 REVERTER ABORTADO: ja existem salas, escalas, entradas com sala ou parentesco. Nada foi alterado.';
  end if;
end $g$;

drop function if exists app.v39_kids_checkin_move(uuid, jsonb);
drop function if exists app.v39_kids_event_room_staff_set(uuid, jsonb);
drop function if exists app.v39_kids_event_room_save(uuid, jsonb);
drop function if exists app.v39_kids_event_rooms(uuid, uuid, uuid);
drop function if exists app.v39_kids_room_save(uuid, jsonb);
drop function if exists app.v39_kids_rooms(uuid, uuid);
drop function if exists private.v39_kids_room_fields(jsonb);
drop function if exists app.v39_family_link_end(uuid, jsonb);
drop function if exists app.v39_family_link_set(uuid, jsonb);
drop function if exists app.v39_family_links(uuid, uuid);
drop function if exists private.v39_family_can_view(uuid, uuid);
drop function if exists app.v39_kids_child_register(uuid, jsonb);

-- funções do KIDS_2 e do KIDS_3 como eram (a coluna event_room_id sai antes do checkin_json voltar)
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

alter table app.kids_checkins drop column if exists event_room_id;

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
           'cancelada', c.cancelled_at, 'motivoCancelamento', c.cancel_reason)
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
  v_hash text; v_ok boolean; v_n integer := 0; v_resp record;
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

  insert into app.kids_checkins (church_id, ministry_id, event_id, family_id, child_person_id, brought_by_person_id, code_hash, checked_in_by_user_account_id)
  values (p_church_id, m.id, e.id, fm.family_id, v_ch, v_by, v_hash, v_me) returning * into c;
  insert into app.church_event_participants (event_id, person_id, participation_role, registration_status, attendance_status, checked_in_at, created_by_user_account_id, updated_by_user_account_id)
  values (e.id, v_ch, 'crianca', 'confirmed', 'present', c.checked_in_at, v_me, v_me)
  on conflict (event_id, person_id) do update set attendance_status = 'present', registration_status = 'confirmed',
         checked_in_at = excluded.checked_in_at, updated_by_user_account_id = v_me;
  perform private.v39_kids_audit(p_church_id, 'data_change', 'kids_checkin', 'kids_checkins', c.id, v_ch, 'minor', null,
                                 jsonb_build_object('event_id', e.id, 'brought_by', v_by, 'family_code_reused', x.id is not null));
  return private.v39_kids_checkin_json(c) || jsonb_build_object(
           'ok', true, 'codigo', v_cod, 'evento', e.name, 'inicio', e.starts_at,
           'cultoId', e.parent_event_id, 'culto', (select name from app.church_events where id = e.parent_event_id),
           'igreja', (select name from app.churches where id = p_church_id),
           'responsavelId', v_resp.id, 'whatsapp', v_resp.fone);
end $f$;

drop function if exists private.v39_kids_room_suggest(uuid, date, text);
drop function if exists private.v39_kids_event_room_json(app.kids_event_rooms);
drop function if exists private.v39_kids_event_rooms_ensure(uuid, uuid, app.church_events);
drop function if exists private.v39_kids_room_fits(app.kids_event_rooms, date, text);
drop function if exists private.v39_age_months(date);
drop table if exists app.kids_event_room_staff;
drop table if exists app.kids_event_rooms;
drop table if exists app.kids_rooms;
drop function if exists private.v39_kids_room_guard();
alter table app.family_members drop constraint if exists family_members_kinship_check;
alter table app.family_members drop column if exists kinship;
drop function if exists private.v39_kinship_ok(text);

revoke all on function app.v39_kids_member_save(uuid, jsonb) from public, anon;
revoke all on function app.v39_kids_families(uuid, uuid, text, boolean) from public, anon;
revoke all on function app.v39_kids_checkin(uuid, jsonb) from public, anon;
revoke all on function private.v39_kids_checkin_json(app.kids_checkins) from public;
grant execute on function app.v39_kids_member_save(uuid, jsonb) to authenticated;
grant execute on function app.v39_kids_families(uuid, uuid, text, boolean) to authenticated;
grant execute on function app.v39_kids_checkin(uuid, jsonb) to authenticated;
-- KIDS5-REVERTER-END

commit;
notify pgrst, 'reload schema';

-- VERIFICACAO (deve dar tudo true)
select
  (select to_regclass('app.kids_rooms') is null and to_regclass('app.kids_event_rooms') is null and to_regclass('app.kids_event_room_staff') is null) as salas_removidas,
  (select count(*) = 0 from information_schema.columns where table_schema = 'app' and ((table_name = 'family_members' and column_name = 'kinship') or (table_name = 'kids_checkins' and column_name = 'event_room_id'))) as colunas_removidas,
  (select pg_get_functiondef('app.v39_kids_checkin(uuid,jsonb)'::regprocedure) not like '%room%') as entrada_kids3,
  (select count(*) = 0 from pg_proc where proname in ('v39_kids_child_register','v39_family_links','v39_family_link_set','v39_kids_rooms','v39_kids_checkin_move')) as funcoes_removidas;
