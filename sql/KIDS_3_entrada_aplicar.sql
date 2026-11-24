-- =====================================================================
-- KIDS_3 · Entrada da criança, código, etiqueta e entrega · APLICAR
-- 24/11/2026 · DATA · decisões do Diogo (chat, 24/11):
--   1. código de 4 dígitos, o mesmo na etiqueta da criança e na do responsável, só naquele evento
--      (irmãos da mesma família no mesmo evento usam o mesmo código)
--   2. sem código: qualquer voluntário libera pela foto, com motivo registrado
--   3. culto mostra "Kids: N" separado (soma no total exibido); criança visitante conta nos visitantes
--   4. etiqueta térmica 62x29 mm (front)
--   5. entrada e entrega: qualquer voluntário ativo do Kids
--   6. culto encerrado com criança sem retirada: avisar e listar (não bloqueia)
-- VALIDACAO: ver cabecalho de KIDS_3_entrada_teste_rollback.sql
--
-- O que faz:
--   A. app.kids_checkins: uma entrada por criança por evento do Kids; código só como hash (crypt/bf);
--      quem trouxe, quem retirou (pessoa autorizada), voluntário de entrada/saída, forma da conferência;
--      nada é apagado (DELETE proibido) e trava de 24h igual à do evento
--   B. presença também em app.church_event_participants (attendance 'present')
--   C. RPCs app.v39_kids_checkin / _checkin_find / _checkout / _checkin_cancel / _board / _culto_counts
-- Requer KIDS_1 e KIDS_2. Reverter: KIDS_3_entrada_reverter.sql
-- =====================================================================
begin;

-- KIDS3-BODY-BEGIN
do $g$
begin
  if to_regclass('app.kids_child_profiles') is null then
    raise exception 'KIDS_3 ABORTADO: KIDS_2 nao aplicado. Nada foi alterado.';
  end if;
  if to_regclass('app.kids_checkins') is not null then
    raise exception 'KIDS_3 ABORTADO: app.kids_checkins ja existe (KIDS_3 ja aplicado?). Nada foi alterado.';
  end if;
end $g$;

-- A. entradas ---------------------------------------------------------------
create table app.kids_checkins (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references app.churches(id) on update restrict on delete restrict,
  ministry_id uuid not null references app.ministries(id) on update restrict on delete restrict,
  event_id uuid not null references app.church_events(id) on update restrict on delete restrict,
  family_id uuid not null references app.families(id) on update restrict on delete restrict,
  child_person_id uuid not null references app.people(id) on update restrict on delete restrict,
  brought_by_person_id uuid not null references app.people(id) on update restrict on delete restrict,
  code_hash text not null,
  status text not null default 'present',
  checked_in_at timestamptz not null default now(),
  checked_in_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict,
  picked_up_at timestamptz,
  picked_up_by_person_id uuid references app.people(id) on update restrict on delete restrict,
  picked_up_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict,
  pickup_method text,
  pickup_reason text,
  cancelled_at timestamptz,
  cancel_reason text,
  cancelled_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kids_checkins_status_check check (status in ('present','picked_up','cancelled')),
  constraint kids_checkins_method_check check (pickup_method is null or pickup_method in ('code','photo')),
  constraint kids_checkins_pickup check (status <> 'picked_up' or (picked_up_at is not null and picked_up_by_person_id is not null and pickup_method is not null)),
  constraint kids_checkins_photo_reason check (pickup_method is distinct from 'photo' or pickup_reason is not null),
  constraint kids_checkins_cancel check (status <> 'cancelled' or (cancelled_at is not null and cancel_reason is not null))
);
create unique index kids_checkins_open_unique_idx on app.kids_checkins (event_id, child_person_id) where status <> 'cancelled';
create index kids_checkins_event_idx on app.kids_checkins (event_id, status);
create trigger kids_checkins_set_updated_at before update on app.kids_checkins for each row execute function app.set_updated_at();
alter table app.kids_checkins enable row level security;
revoke all on app.kids_checkins from public, anon, authenticated;

-- nada é apagado; depois de 24h do evento encerrado, só com o evento reaberto pelo pastor
create or replace function private.v39_kids_checkin_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare e app.church_events;
begin
  if tg_op = 'DELETE' then
    perform app.raise_domain_error('KIDS_CHECKIN_NO_DELETE', 'Entrada do Kids nao se apaga: cancele com motivo');
  end if;
  select * into e from app.church_events where id = old.event_id;
  if e.id is not null and now() > private.v39_trava_evento(e) and not private.v39_trava_liberada(e.id) then
    perform app.raise_domain_error('REGISTRO_TRAVADO', 'Evento encerrado ha mais de 24h: edicao travada. Peca ao pastor para reabrir.');
  end if;
  if new.code_hash is distinct from old.code_hash or new.child_person_id is distinct from old.child_person_id
     or new.event_id is distinct from old.event_id or new.family_id is distinct from old.family_id then
    perform app.raise_domain_error('KIDS_CHECKIN_IMMUTABLE', 'Dados da entrada nao podem ser trocados');
  end if;
  return new;
end $f$;
create trigger trg_v39_kids_checkin_guard before update or delete on app.kids_checkins
  for each row execute function private.v39_kids_checkin_guard();

-- helpers -----------------------------------------------------------------
create or replace function private.v39_kids_event_ok(p_church_id uuid, p_ministry_id uuid, p_event_id uuid) returns app.church_events
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare e app.church_events;
begin
  select * into e from app.church_events where id = p_event_id and church_id = p_church_id and ministry_id = p_ministry_id;
  if e.id is null then perform app.raise_domain_error('EVENT_NOT_FOUND', 'Evento do Kids nao encontrado'); end if;
  return e;
end $f$;

create or replace function private.v39_kids_code_match(p_hash text, p_code text) returns boolean
language sql immutable set search_path = pg_catalog as $f$
  select p_hash is not null and p_code ~ '^[0-9]{4}$' and extensions.crypt(p_code, p_hash) = p_hash
$f$;

-- quem pode retirar a criança nesta família (12 anos ou mais, autorizado, com foto)
create or replace function private.v39_kids_pickup_people(p_church_id uuid, p_family uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog, app, private as $f$
  select coalesce(jsonb_agg(jsonb_build_object('pessoaId', p.id, 'nome', coalesce(nullif(btrim(p.preferred_name), ''), p.full_name),
                                               'papel', fm.role, 'temFoto', p.photo_file_id is not null,
                                               'idade', private.v39_kids_age(p.birth_date)) order by fm.role, p.full_name), '[]'::jsonb)
    from app.family_members fm join app.people p on p.id = fm.person_id
   where fm.family_id = p_family and fm.church_id = p_church_id and fm.status = 'active' and fm.can_pick_up and fm.role <> 'crianca'
$f$;

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

-- C. RPCs -----------------------------------------------------------------
-- entrada da criança: devolve o código UMA vez (etiqueta e WhatsApp)
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

-- entrega, passo 1: achar a(s) criança(s) pelo código (e mostrar quem pode retirar, com foto)
create or replace function app.v39_kids_checkin_find(p_church_id uuid, p_ministry_id uuid, p_event_id uuid, p_codigo text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare m app.ministries := private.v39_kids_need(p_church_id, p_ministry_id, 'volunteer'); e app.church_events := private.v39_kids_event_ok(p_church_id, p_ministry_id, p_event_id);
begin
  if coalesce(p_codigo, '') !~ '^[0-9]{4}$' then perform app.raise_domain_error('KIDS_CODE_INVALID', 'Codigo deve ter 4 digitos'); end if;
  return coalesce((select jsonb_agg(private.v39_kids_checkin_json(c) || jsonb_build_object('podemRetirar', private.v39_kids_pickup_people(p_church_id, c.family_id))
                                    order by c.checked_in_at)
                     from app.kids_checkins c where c.event_id = e.id and c.status = 'present' and private.v39_kids_code_match(c.code_hash, p_codigo)), '[]'::jsonb);
end $f$;

-- entrega, passo 2: confirmar quem retirou (pelo código ou, sem código, pela foto com motivo)
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

-- cancelar entrada feita por engano (com motivo)
create or replace function app.v39_kids_checkin_cancel(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id(); v_min uuid := nullif(p->>'ministerioId', '')::uuid; m app.ministries;
  v_motivo text := nullif(btrim(p->>'motivo'), ''); c app.kids_checkins;
begin
  m := private.v39_kids_need(p_church_id, v_min, 'volunteer');
  select * into c from app.kids_checkins where id = nullif(p->>'checkinId', '')::uuid and church_id = p_church_id and ministry_id = v_min for update;
  if c.id is null then perform app.raise_domain_error('KIDS_CHECKIN_NOT_FOUND', 'Entrada nao encontrada'); end if;
  if c.status <> 'present' then perform app.raise_domain_error('KIDS_NOT_PRESENT', 'So cancela entrada de crianca ainda na sala'); end if;
  if v_motivo is null then perform app.raise_domain_error('REASON_REQUIRED', 'Informe o motivo'); end if;
  update app.kids_checkins set status = 'cancelled', cancelled_at = now(), cancel_reason = left(v_motivo, 500), cancelled_by_user_account_id = v_me
   where id = c.id returning * into c;
  update app.church_event_participants set attendance_status = 'not_recorded', checked_in_at = null, updated_by_user_account_id = v_me
   where event_id = c.event_id and person_id = c.child_person_id;
  perform private.v39_kids_audit(p_church_id, 'cancellation', 'kids_checkin_cancelled', 'kids_checkins', c.id, c.child_person_id, 'minor', v_motivo,
                                 jsonb_build_object('event_id', c.event_id));
  return jsonb_build_object('ok', true, 'id', c.id, 'status', c.status);
end $f$;

-- painel do evento: quem está na sala, quem já saiu, contagens
create or replace function app.v39_kids_board(p_church_id uuid, p_ministry_id uuid, p_event_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare m app.ministries := private.v39_kids_need(p_church_id, p_ministry_id, 'volunteer'); e app.church_events := private.v39_kids_event_ok(p_church_id, p_ministry_id, p_event_id);
begin
  return jsonb_build_object(
    'evento', jsonb_build_object('id', e.id, 'nome', e.name, 'inicio', e.starts_at, 'status', e.status, 'cultoId', e.parent_event_id,
                                 'travado', now() > private.v39_trava_evento(e) and not private.v39_trava_liberada(e.id)),
    'presentes', (select count(*) from app.kids_checkins where event_id = e.id and status = 'present'),
    'retiradas', (select count(*) from app.kids_checkins where event_id = e.id and status = 'picked_up'),
    'visitantes', (select count(*) from app.kids_checkins c join app.church_people cp on cp.person_id = c.child_person_id and cp.church_id = c.church_id and cp.ended_at is null
                    where c.event_id = e.id and c.status <> 'cancelled' and cp.status = 'visiting'),
    'entradas', coalesce((select jsonb_agg(private.v39_kids_checkin_json(c) order by (c.status = 'present') desc, c.checked_in_at)
                            from app.kids_checkins c where c.event_id = e.id and c.status <> 'cancelled'), '[]'::jsonb));
end $f$;

-- contagem do Kids por culto (quem tem acesso à igreja vê os números; nomes de quem falta retirar só a equipe do Kids
-- ou quem já vê pessoas): {cultoId: {kids, visitantes, faltamRetirar, pendentes:[nomes]}}
create or replace function app.v39_kids_culto_counts(p_church_id uuid, p_culto_ids uuid[] default null) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare v_nomes boolean;
begin
  if app.current_user_account_id() is null or not coalesce(app.v39_has_church_access(p_church_id), false) then
    perform app.raise_domain_error('ACCESS_DENIED', 'Sem acesso ativo a esta igreja');
  end if;
  v_nomes := private.v39_kids_is_team(p_church_id) or app.has_permission('people.view', p_church_id);
  return coalesce((
    select jsonb_object_agg(x.culto, jsonb_build_object('kids', x.kids, 'visitantes', x.vis, 'faltamRetirar', x.falta,
                                                       'pendentes', case when v_nomes then x.nomes else '[]'::jsonb end))
      from (select e.parent_event_id culto,
                   count(*) filter (where c.status <> 'cancelled') kids,
                   count(*) filter (where c.status <> 'cancelled' and cp.status = 'visiting') vis,
                   count(*) filter (where c.status = 'present') falta,
                   coalesce(jsonb_agg(coalesce(nullif(btrim(ch.preferred_name), ''), ch.full_name) order by ch.full_name) filter (where c.status = 'present'), '[]'::jsonb) nomes
              from app.kids_checkins c
              join app.church_events e on e.id = c.event_id and e.parent_event_id is not null
              join app.people ch on ch.id = c.child_person_id
              left join app.church_people cp on cp.person_id = c.child_person_id and cp.church_id = c.church_id and cp.ended_at is null
             where c.church_id = p_church_id and (p_culto_ids is null or e.parent_event_id = any (p_culto_ids))
             group by e.parent_event_id) x), '{}'::jsonb);
end $f$;

-- grants ----------------------------------------------------------------
revoke all on function private.v39_kids_checkin_guard() from public;
revoke all on function private.v39_kids_event_ok(uuid, uuid, uuid) from public;
revoke all on function private.v39_kids_code_match(text, text) from public;
revoke all on function private.v39_kids_pickup_people(uuid, uuid) from public;
revoke all on function private.v39_kids_checkin_json(app.kids_checkins) from public;
revoke all on function app.v39_kids_checkin(uuid, jsonb) from public, anon;
revoke all on function app.v39_kids_checkin_find(uuid, uuid, uuid, text) from public, anon;
revoke all on function app.v39_kids_checkout(uuid, jsonb) from public, anon;
revoke all on function app.v39_kids_checkin_cancel(uuid, jsonb) from public, anon;
revoke all on function app.v39_kids_board(uuid, uuid, uuid) from public, anon;
revoke all on function app.v39_kids_culto_counts(uuid, uuid[]) from public, anon;
grant execute on function app.v39_kids_checkin(uuid, jsonb) to authenticated;
grant execute on function app.v39_kids_checkin_find(uuid, uuid, uuid, text) to authenticated;
grant execute on function app.v39_kids_checkout(uuid, jsonb) to authenticated;
grant execute on function app.v39_kids_checkin_cancel(uuid, jsonb) to authenticated;
grant execute on function app.v39_kids_board(uuid, uuid, uuid) to authenticated;
grant execute on function app.v39_kids_culto_counts(uuid, uuid[]) to authenticated;
-- KIDS3-BODY-END

commit;
notify pgrst, 'reload schema';

-- VERIFICACAO (deve dar tudo true)
select
  (select relrowsecurity from pg_class where oid = to_regclass('app.kids_checkins')) as tabela_com_rls,
  (select not has_table_privilege('authenticated', 'app.kids_checkins', 'select')) as sem_acesso_direto,
  (select count(*) = 6 from pg_proc where pronamespace = 'app'::regnamespace and proname in
     ('v39_kids_checkin','v39_kids_checkin_find','v39_kids_checkout','v39_kids_checkin_cancel','v39_kids_board','v39_kids_culto_counts')
     and has_function_privilege('authenticated', oid, 'execute') and not has_function_privilege('anon', oid, 'execute')) as rpcs,
  (select count(*) = 1 from pg_trigger where tgrelid = 'app.kids_checkins'::regclass and tgname = 'trg_v39_kids_checkin_guard') as trava;
