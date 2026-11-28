-- =====================================================================
-- KIDS_4 · Escala do Kids: confirmação, avisos, WhatsApp e transferência · TESTE COM ROLLBACK
-- Rodar inteiro no SQL Editor. Resultado esperado (é um ERRO de propósito, nada fica gravado):
--   ERROR P0001: TESTE KIDS_4 CONCLUIDO (nada foi gravado): T1 ok; ... T12 ok (REVERTER ok)
--   T1  escalar: o professor recebe aviso e fica "aguardando"
--   T2  "não posso" exige motivo e avisa o líder
--   T3  confirmar; outro professor não responde por ele
--   T4  registro do WhatsApp: só o líder
--   T5  transferência: alvo inválido recusa; duplicada recusa; líder só decide depois do aceite; aceite + autorização trocam a escala
--   T6  transferência recusada por quem recebe (motivo) e pelo líder (motivo)
--   T7  quem pediu cancela; depois ninguém responde
--   T8  líder tira da escala: a pessoa é avisada
--   T9  marcar avisos como lidos
--   T10 retirada: 12 anos recusa, 13 anos aceita
--   T11 culto em menos de 24 h: professor sem resposta fica destacado
--   T12 REVERTER: aborta com dados; sem os dados de teste devolve as funções do KIDS_5/KIDS_3
-- =====================================================================
do $t$
declare
  v_ch uuid := gen_random_uuid();
  v_au_m uuid := gen_random_uuid(); v_au_l uuid := gen_random_uuid(); v_au_a uuid := gen_random_uuid(); v_au_b uuid := gen_random_uuid(); v_au_o uuid := gen_random_uuid();
  v_p_m uuid; v_p_l uuid; v_p_a uuid; v_p_b uuid; v_p_o uuid; v_pai uuid; v_ua uuid; v_cua uuid; v_prof uuid;
  v_kids uuid; v_culto uuid; v_ev uuid; v_culto2 uuid; v_ev2 uuid; v_sala uuid; v_sala2 uuid; v_st uuid; v_stb uuid; v_tr uuid; v_fam uuid;
  r jsonb; v_s text; v_res text := '';
begin
  -- APLICAR (identico ao _aplicar, sem begin/commit)
do $g$
begin
  if to_regclass('app.kids_event_room_staff') is null then
    raise exception 'KIDS_4 ABORTADO: KIDS_5 nao aplicado. Nada foi alterado.';
  end if;
  if to_regclass('app.kids_staff_transfers') is not null or exists (select 1 from information_schema.columns where table_schema = 'app' and table_name = 'kids_event_room_staff' and column_name = 'response_status') then
    raise exception 'KIDS_4 ABORTADO: KIDS_4 ja aplicado. Nada foi alterado.';
  end if;
end $g$;

-- A. confirmação -----------------------------------------------------------
alter table app.kids_event_room_staff
  add column response_status text not null default 'pending',
  add column responded_at timestamptz,
  add column decline_reason text,
  add column whatsapp_sent_at timestamptz;
alter table app.kids_event_room_staff
  add constraint kids_event_room_staff_response_check check (response_status in ('pending','confirmed','declined')),
  add constraint kids_event_room_staff_decline_reason check (response_status <> 'declined' or (decline_reason is not null and responded_at is not null));

-- B. transferência ---------------------------------------------------------
create table app.kids_staff_transfers (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references app.churches(id) on update restrict on delete restrict,
  staff_id uuid not null references app.kids_event_room_staff(id) on update restrict on delete restrict,
  from_person_id uuid not null references app.people(id) on update restrict on delete restrict,
  to_person_id uuid not null references app.people(id) on update restrict on delete restrict,
  status text not null default 'pending_target',
  reason text,
  requested_at timestamptz not null default now(),
  target_responded_at timestamptz,
  target_decline_reason text,
  leader_responded_at timestamptz,
  leader_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict,
  leader_reason text,
  new_staff_id uuid references app.kids_event_room_staff(id) on update restrict on delete restrict,
  cancelled_at timestamptz,
  created_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict,
  updated_at timestamptz not null default now(),
  constraint kids_staff_transfers_status_check check (status in ('pending_target','pending_leader','approved','rejected','cancelled')),
  constraint kids_staff_transfers_not_self check (from_person_id <> to_person_id),
  constraint kids_staff_transfers_approved check (status <> 'approved' or (new_staff_id is not null and leader_responded_at is not null and target_responded_at is not null))
);
create unique index kids_staff_transfers_open_unique_idx on app.kids_staff_transfers (staff_id) where status in ('pending_target','pending_leader');
create index kids_staff_transfers_to_idx on app.kids_staff_transfers (to_person_id, status);
create trigger kids_staff_transfers_set_updated_at before update on app.kids_staff_transfers for each row execute function app.set_updated_at();
alter table app.kids_staff_transfers enable row level security;
revoke all on app.kids_staff_transfers from public, anon, authenticated;
create or replace function private.v39_kids_transfer_no_delete() returns trigger
language plpgsql security definer set search_path = pg_catalog, app as $f$
begin
  perform app.raise_domain_error('KIDS_TRANSFER_NO_DELETE', 'Transferencia nao se apaga: cancele ou recuse');
  return old;
end $f$;
create trigger trg_v39_kids_transfer_no_delete before delete on app.kids_staff_transfers for each row execute function private.v39_kids_transfer_no_delete();

-- C. avisos pessoais -------------------------------------------------------
create or replace function private.v39_notify(p_church_id uuid, p_person uuid, p_tipo text, p_titulo text, p_texto text,
                                              p_src_type text, p_src_id uuid, p_meta jsonb default '{}'::jsonb, p_prioridade text default 'normal') returns integer
language plpgsql security definer set search_path = pg_catalog, app as $f$
declare v_n integer;
begin
  insert into app.notifications (church_id, user_account_id, notification_type, title, body, source_type, source_id, priority, status, metadata)
  select p_church_id, ua.id, p_tipo, left(p_titulo, 200), left(p_texto, 1000), p_src_type, p_src_id, p_prioridade, 'unread', coalesce(p_meta, '{}'::jsonb)
    from app.user_accounts ua join app.church_user_access cua on cua.user_account_id = ua.id
   where ua.person_id = p_person and ua.status = 'active' and cua.church_id = p_church_id and cua.status = 'active';
  get diagnostics v_n = row_count;
  return v_n;
end $f$;

create or replace function private.v39_kids_notify_leaders(p_church_id uuid, p_ministry_id uuid, p_tipo text, p_titulo text, p_texto text,
                                                           p_src_type text, p_src_id uuid, p_meta jsonb default '{}'::jsonb) returns integer
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_n integer := 0; v_p uuid;
begin
  for v_p in
    select distinct x.p from (
      select m.leader_person_id p from app.ministries m where m.id = p_ministry_id
      union select m.assistant_person_id from app.ministries m where m.id = p_ministry_id
      union select mm.person_id from app.ministry_memberships mm where mm.ministry_id = p_ministry_id and mm.status = 'active' and mm.membership_type in ('leader','assistant','coordinator')
    ) x where x.p is not null
  loop
    v_n := v_n + private.v39_notify(p_church_id, v_p, p_tipo, p_titulo, p_texto, p_src_type, p_src_id, p_meta, 'high');
  end loop;
  return v_n;
end $f$;

create or replace function app.v39_my_notifications(p_church_id uuid, p_limite integer default 30) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app as $f$
declare v_me uuid := app.current_user_account_id();
begin
  if v_me is null or not coalesce(app.v39_has_church_access(p_church_id), false) then perform app.raise_domain_error('ACCESS_DENIED', 'Sem acesso ativo a esta igreja'); end if;
  return jsonb_build_object(
    'naoLidas', (select count(*) from app.notifications where user_account_id = v_me and church_id = p_church_id and status = 'unread'),
    'itens', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'tipo', n.notification_type, 'titulo', n.title, 'texto', n.body, 'status', n.status,
                                                           'em', n.created_at, 'origem', n.source_type, 'origemId', n.source_id, 'prioridade', n.priority, 'meta', n.metadata) order by n.created_at desc)
                         from (select * from app.notifications where user_account_id = v_me and church_id = p_church_id and status in ('unread','read')
                                order by created_at desc limit greatest(1, least(coalesce(p_limite, 30), 100))) n), '[]'::jsonb));
end $f$;

create or replace function app.v39_notification_read(p_church_id uuid, p_id uuid default null) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app as $f$
declare v_me uuid := app.current_user_account_id(); v_n integer;
begin
  if v_me is null or not coalesce(app.v39_has_church_access(p_church_id), false) then perform app.raise_domain_error('ACCESS_DENIED', 'Sem acesso ativo a esta igreja'); end if;
  update app.notifications set status = 'read', read_at = coalesce(read_at, now())
   where user_account_id = v_me and church_id = p_church_id and status = 'unread' and (p_id is null or id = p_id);
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'lidas', v_n);
end $f$;

-- D. escala ----------------------------------------------------------------
create or replace function private.v39_kids_staff_ctx(p_staff uuid, out s app.kids_event_room_staff, out r app.kids_event_rooms, out e app.church_events)
language plpgsql stable security definer set search_path = pg_catalog, app as $f$
begin
  select * into s from app.kids_event_room_staff where id = p_staff;
  select * into r from app.kids_event_rooms where id = s.event_room_id;
  select * into e from app.church_events where id = r.event_id;
end $f$;

create or replace function private.v39_kids_staff_label(r app.kids_event_rooms, e app.church_events) returns text
language sql stable security definer set search_path = pg_catalog, app as $f$
  select r.name || ' · ' || coalesce((select p.name from app.church_events p where p.id = e.parent_event_id), e.name) || ' · '
         || to_char(e.starts_at at time zone coalesce(nullif((select timezone from app.churches where id = e.church_id), ''), 'America/Sao_Paulo'), 'DD/MM HH24:MI')
$f$;

create or replace function private.v39_kids_event_room_json(r app.kids_event_rooms) returns jsonb
language sql stable security definer set search_path = pg_catalog, app, private as $f$
  select jsonb_build_object('id', r.id, 'salaPadraoId', r.room_id, 'nome', r.name, 'unidade', r.age_unit, 'idadeMin', r.min_age, 'idadeMax', r.max_age,
           'genero', r.gender, 'capacidade', r.capacity, 'ordem', r.sort_order, 'status', r.status, 'motivoFechamento', r.closed_reason,
           'presentes', (select count(*) from app.kids_checkins c where c.event_room_id = r.id and c.status = 'present'),
           'professores', coalesce((select jsonb_agg(jsonb_build_object('staffId', s.id, 'pessoaId', s.person_id, 'nome', coalesce(nullif(btrim(p.preferred_name), ''), p.full_name),
                                                                         'funcao', s.staff_role, 'resposta', s.response_status, 'motivoRecusa', s.decline_reason,
                                                                         'respondidoEm', s.responded_at, 'whatsappEm', s.whatsapp_sent_at,
                                                                         'semResposta24h', s.response_status = 'pending' and ev.starts_at - now() < interval '24 hours',
                                                                         'whatsapp', case when private.v39_min_role(r.church_id, ev.ministry_id) in ('admin','leader') then private.v39_kids_whatsapp(s.person_id) end,
                                                                         'transferencia', (select jsonb_build_object('id', t.id, 'status', t.status, 'para', coalesce(nullif(btrim(tp.preferred_name), ''), tp.full_name))
                                                                                             from app.kids_staff_transfers t join app.people tp on tp.id = t.to_person_id
                                                                                            where t.staff_id = s.id and t.status in ('pending_target','pending_leader') limit 1))
                                                     order by s.staff_role desc, p.full_name)
                                      from app.kids_event_room_staff s join app.people p on p.id = s.person_id join app.church_events ev on ev.id = r.event_id
                                     where s.event_room_id = r.id and s.status = 'active'), '[]'::jsonb))
$f$;

-- professores da sala (líder): quem entra recebe aviso e fica "aguardando"; quem sai é avisado
create or replace function app.v39_kids_event_room_staff_set(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id(); v_min uuid := nullif(p->>'ministerioId', '')::uuid; m app.ministries; r app.kids_event_rooms; e app.church_events;
  it jsonb; v_pes uuid; v_fun text; v_lista uuid[] := '{}'; s app.kids_event_room_staff; v_rot text;
begin
  m := private.v39_kids_need(p_church_id, v_min, 'leader');
  select * into r from app.kids_event_rooms where id = nullif(p->>'salaId', '')::uuid and church_id = p_church_id;
  if r.id is null then perform app.raise_domain_error('KIDS_ROOM_NOT_FOUND', 'Sala nao encontrada'); end if;
  e := private.v39_kids_event_ok(p_church_id, v_min, r.event_id);
  v_rot := private.v39_kids_staff_label(r, e);
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
    select * into s from app.kids_event_room_staff where event_room_id = r.id and person_id = v_pes and status = 'active';
    if s.id is null then
      insert into app.kids_event_room_staff (church_id, event_room_id, person_id, staff_role, created_by_user_account_id, updated_by_user_account_id)
      values (p_church_id, r.id, v_pes, v_fun, v_me, v_me) returning * into s;
      perform private.v39_notify(p_church_id, v_pes, 'kids_escala', 'Você foi escalado(a) no Kids',
                                 'Sala ' || v_rot || ' (' || v_fun || '). Confirme pelo app em "Minhas escalas".', 'kids_event_room_staff', s.id,
                                 jsonb_build_object('event_id', e.id, 'room_id', r.id), 'high');
    elsif s.staff_role <> v_fun then
      update app.kids_event_room_staff set staff_role = v_fun, updated_by_user_account_id = v_me where id = s.id;
    end if;
  end loop;
  for s in select * from app.kids_event_room_staff where event_room_id = r.id and status = 'active' and not (person_id = any (v_lista)) loop
    update app.kids_event_room_staff set status = 'removed', removed_at = now(), removed_reason = 'Retirado da escala da sala pelo lider', updated_by_user_account_id = v_me where id = s.id;
    update app.kids_staff_transfers set status = 'cancelled', cancelled_at = now() where staff_id = s.id and status in ('pending_target','pending_leader');
    perform private.v39_notify(p_church_id, s.person_id, 'kids_escala_removida', 'Você saiu da escala do Kids', 'Sala ' || v_rot || ': o líder retirou você desta escala.',
                               'kids_event_room_staff', s.id, jsonb_build_object('event_id', e.id));
  end loop;
  perform private.v39_kids_audit(p_church_id, 'data_change', 'kids_event_room_staff_set', 'kids_event_rooms', r.id, null, 'standard', null,
                                 jsonb_build_object('event_id', r.event_id, 'staff', to_jsonb(v_lista)));
  select * into r from app.kids_event_rooms where id = r.id;
  return private.v39_kids_event_room_json(r) || jsonb_build_object('ok', true);
end $f$;

-- minhas escalas (próximos 60 dias e de hoje), transferências que recebi e, para o líder, as que aguardam autorização
create or replace function app.v39_kids_my_schedule(p_church_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare v_me uuid := app.current_user_account_id(); v_pes uuid;
begin
  if v_me is null or not coalesce(app.v39_has_church_access(p_church_id), false) then perform app.raise_domain_error('ACCESS_DENIED', 'Sem acesso ativo a esta igreja'); end if;
  select person_id into v_pes from app.user_accounts where id = v_me;
  return jsonb_build_object(
    'escalas', coalesce((select jsonb_agg(jsonb_build_object('staffId', s.id, 'sala', r.name, 'funcao', s.staff_role, 'resposta', s.response_status, 'motivoRecusa', s.decline_reason,
                                                             'eventoId', e.id, 'evento', e.name, 'culto', (select name from app.church_events where id = e.parent_event_id),
                                                             'inicio', e.starts_at, 'ministerioId', e.ministry_id,
                                                             'transferencia', (select jsonb_build_object('id', t.id, 'status', t.status, 'para', coalesce(nullif(btrim(tp.preferred_name), ''), tp.full_name))
                                                                                 from app.kids_staff_transfers t join app.people tp on tp.id = t.to_person_id
                                                                                where t.staff_id = s.id and t.status in ('pending_target','pending_leader') limit 1)) order by e.starts_at)
                           from app.kids_event_room_staff s join app.kids_event_rooms r on r.id = s.event_room_id join app.church_events e on e.id = r.event_id
                          where s.church_id = p_church_id and s.person_id = v_pes and s.status = 'active' and e.status not in ('cancelled')
                            and e.starts_at > now() - interval '12 hours' and e.starts_at < now() + interval '60 days'), '[]'::jsonb),
    'paraMim', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'de', coalesce(nullif(btrim(fp.preferred_name), ''), fp.full_name), 'motivo', t.reason,
                                                             'sala', r.name, 'evento', e.name, 'inicio', e.starts_at) order by e.starts_at)
                           from app.kids_staff_transfers t join app.people fp on fp.id = t.from_person_id join app.kids_event_room_staff s on s.id = t.staff_id
                           join app.kids_event_rooms r on r.id = s.event_room_id join app.church_events e on e.id = r.event_id
                          where t.church_id = p_church_id and t.to_person_id = v_pes and t.status = 'pending_target'), '[]'::jsonb),
    'autorizar', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'de', coalesce(nullif(btrim(fp.preferred_name), ''), fp.full_name),
                                                               'para', coalesce(nullif(btrim(tp.preferred_name), ''), tp.full_name), 'motivo', t.reason, 'ministerioId', e.ministry_id,
                                                               'sala', r.name, 'evento', e.name, 'inicio', e.starts_at) order by e.starts_at)
                             from app.kids_staff_transfers t join app.people fp on fp.id = t.from_person_id join app.people tp on tp.id = t.to_person_id
                             join app.kids_event_room_staff s on s.id = t.staff_id join app.kids_event_rooms r on r.id = s.event_room_id join app.church_events e on e.id = r.event_id
                            where t.church_id = p_church_id and t.status = 'pending_leader' and private.v39_min_role(p_church_id, e.ministry_id) in ('admin','leader')), '[]'::jsonb));
end $f$;

-- responder a escala (só o próprio professor)
create or replace function app.v39_kids_schedule_respond(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id(); v_pes uuid; c record; v_resp text := nullif(btrim(p->>'resposta'), ''); v_motivo text := nullif(btrim(p->>'motivo'), '');
begin
  if v_me is null or not coalesce(app.v39_has_church_access(p_church_id), false) then perform app.raise_domain_error('ACCESS_DENIED', 'Sem acesso ativo a esta igreja'); end if;
  select person_id into v_pes from app.user_accounts where id = v_me;
  select * into c from private.v39_kids_staff_ctx(nullif(p->>'staffId', '')::uuid);
  if (c.s).id is null or (c.s).church_id <> p_church_id or (c.s).status <> 'active' then perform app.raise_domain_error('KIDS_STAFF_NOT_FOUND', 'Escala nao encontrada'); end if;
  if (c.s).person_id is distinct from v_pes then perform app.raise_domain_error('PERMISSION_DENIED', 'So o proprio professor responde a escala'); end if;
  if v_resp not in ('confirmed','declined') then perform app.raise_domain_error('KIDS_STATUS_INVALID', 'Resposta invalida'); end if;
  if v_resp = 'declined' and v_motivo is null then perform app.raise_domain_error('REASON_REQUIRED', 'Informe o motivo'); end if;
  if (c.e).status in ('completed','cancelled') then perform app.raise_domain_error('KIDS_EVENT_CLOSED', 'Evento encerrado ou cancelado'); end if;
  update app.kids_event_room_staff set response_status = v_resp, responded_at = now(), decline_reason = case when v_resp = 'declined' then left(v_motivo, 500) end,
         updated_by_user_account_id = v_me where id = (c.s).id;
  if v_resp = 'declined' then
    perform private.v39_kids_notify_leaders(p_church_id, (c.e).ministry_id, 'kids_escala_recusa', 'Professor não pode na escala',
                                            (select coalesce(nullif(btrim(preferred_name), ''), full_name) from app.people where id = v_pes) || ' não pode em ' || private.v39_kids_staff_label(c.r, c.e) || '. Motivo: ' || v_motivo,
                                            'kids_event_room_staff', (c.s).id, jsonb_build_object('event_id', (c.e).id));
  end if;
  perform private.v39_kids_audit(p_church_id, 'status_change', 'kids_schedule_' || v_resp, 'kids_event_room_staff', (c.s).id, v_pes, 'standard', v_motivo, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'staffId', (c.s).id, 'resposta', v_resp);
end $f$;

-- registra que o líder mandou o WhatsApp (aviso ou lembrete)
create or replace function app.v39_kids_schedule_whatsapp_sent(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_me uuid := app.current_user_account_id(); c record;
begin
  select * into c from private.v39_kids_staff_ctx(nullif(p->>'staffId', '')::uuid);
  if (c.s).id is null or (c.s).church_id <> p_church_id then perform app.raise_domain_error('KIDS_STAFF_NOT_FOUND', 'Escala nao encontrada'); end if;
  perform private.v39_kids_need(p_church_id, (c.e).ministry_id, 'leader');
  update app.kids_event_room_staff set whatsapp_sent_at = now(), updated_by_user_account_id = v_me where id = (c.s).id;
  perform private.v39_kids_audit(p_church_id, 'data_change', 'kids_schedule_whatsapp_sent', 'kids_event_room_staff', (c.s).id, (c.s).person_id, 'standard', null, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $f$;

-- transferência: pedido (o próprio professor)
create or replace function app.v39_kids_transfer_request(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id(); v_pes uuid; c record; v_para uuid := nullif(p->>'paraPessoaId', '')::uuid; t app.kids_staff_transfers;
begin
  if v_me is null or not coalesce(app.v39_has_church_access(p_church_id), false) then perform app.raise_domain_error('ACCESS_DENIED', 'Sem acesso ativo a esta igreja'); end if;
  select person_id into v_pes from app.user_accounts where id = v_me;
  select * into c from private.v39_kids_staff_ctx(nullif(p->>'staffId', '')::uuid);
  if (c.s).id is null or (c.s).church_id <> p_church_id or (c.s).status <> 'active' then perform app.raise_domain_error('KIDS_STAFF_NOT_FOUND', 'Escala nao encontrada'); end if;
  if (c.s).person_id is distinct from v_pes then perform app.raise_domain_error('PERMISSION_DENIED', 'So o proprio professor transfere a escala'); end if;
  if (c.e).status in ('completed','cancelled') then perform app.raise_domain_error('KIDS_EVENT_CLOSED', 'Evento encerrado ou cancelado'); end if;
  if v_para is null or v_para = v_pes then perform app.raise_domain_error('KIDS_TRANSFER_TARGET_INVALID', 'Escolha outro voluntario'); end if;
  if not exists (select 1 from app.ministry_memberships mm where mm.ministry_id = (c.e).ministry_id and mm.person_id = v_para and mm.status = 'active')
     or not exists (select 1 from app.user_accounts ua join app.church_user_access cua on cua.user_account_id = ua.id
                     where ua.person_id = v_para and ua.status = 'active' and cua.church_id = p_church_id and cua.status = 'active') then
    perform app.raise_domain_error('KIDS_TRANSFER_TARGET_INVALID', 'Quem recebe precisa estar na equipe do Kids e ter acesso ao app');
  end if;
  if exists (select 1 from app.kids_event_room_staff x where x.event_room_id = (c.r).id and x.person_id = v_para and x.status = 'active') then
    perform app.raise_domain_error('KIDS_TRANSFER_TARGET_INVALID', 'Esta pessoa ja esta nesta sala');
  end if;
  if exists (select 1 from app.kids_staff_transfers where staff_id = (c.s).id and status in ('pending_target','pending_leader')) then
    perform app.raise_domain_error('KIDS_TRANSFER_PENDING', 'Ja existe uma transferencia em andamento para esta escala');
  end if;
  insert into app.kids_staff_transfers (church_id, staff_id, from_person_id, to_person_id, reason, created_by_user_account_id)
  values (p_church_id, (c.s).id, v_pes, v_para, nullif(btrim(p->>'motivo'), ''), v_me) returning * into t;
  perform private.v39_notify(p_church_id, v_para, 'kids_transferencia', 'Pedido de troca de escala no Kids',
                             (select coalesce(nullif(btrim(preferred_name), ''), full_name) from app.people where id = v_pes) || ' quer passar para você: ' || private.v39_kids_staff_label(c.r, c.e) || '. Aceite ou recuse em "Minhas escalas".',
                             'kids_staff_transfers', t.id, jsonb_build_object('event_id', (c.e).id), 'high');
  perform private.v39_kids_audit(p_church_id, 'data_change', 'kids_transfer_requested', 'kids_staff_transfers', t.id, v_para, 'standard', t.reason, jsonb_build_object('staff_id', (c.s).id));
  return jsonb_build_object('ok', true, 'id', t.id, 'status', t.status);
end $f$;

-- transferência: quem recebe aceita ou recusa
create or replace function app.v39_kids_transfer_respond(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id(); v_pes uuid; t app.kids_staff_transfers; c record; v_aceita boolean := coalesce((nullif(p->>'aceita', ''))::boolean, false);
  v_motivo text := nullif(btrim(p->>'motivo'), '');
begin
  if v_me is null or not coalesce(app.v39_has_church_access(p_church_id), false) then perform app.raise_domain_error('ACCESS_DENIED', 'Sem acesso ativo a esta igreja'); end if;
  select person_id into v_pes from app.user_accounts where id = v_me;
  select * into t from app.kids_staff_transfers where id = nullif(p->>'transferenciaId', '')::uuid and church_id = p_church_id for update;
  if t.id is null or t.status <> 'pending_target' then perform app.raise_domain_error('KIDS_TRANSFER_NOT_FOUND', 'Transferencia nao encontrada ou ja respondida'); end if;
  if t.to_person_id is distinct from v_pes then perform app.raise_domain_error('PERMISSION_DENIED', 'So quem recebe responde'); end if;
  if not v_aceita and v_motivo is null then perform app.raise_domain_error('REASON_REQUIRED', 'Informe o motivo'); end if;
  select * into c from private.v39_kids_staff_ctx(t.staff_id);
  if v_aceita then
    update app.kids_staff_transfers set status = 'pending_leader', target_responded_at = now() where id = t.id;
    perform private.v39_kids_notify_leaders(p_church_id, (c.e).ministry_id, 'kids_transferencia_autorizar', 'Troca de escala para autorizar',
                                            (select full_name from app.people where id = t.from_person_id) || ' → ' || (select full_name from app.people where id = t.to_person_id) || ': ' || private.v39_kids_staff_label(c.r, c.e) || '.',
                                            'kids_staff_transfers', t.id, jsonb_build_object('event_id', (c.e).id));
  else
    update app.kids_staff_transfers set status = 'rejected', target_responded_at = now(), target_decline_reason = left(v_motivo, 500) where id = t.id;
    perform private.v39_notify(p_church_id, t.from_person_id, 'kids_transferencia_recusada', 'Troca de escala recusada',
                               (select coalesce(nullif(btrim(preferred_name), ''), full_name) from app.people where id = t.to_person_id) || ' não pode assumir ' || private.v39_kids_staff_label(c.r, c.e) || '. Motivo: ' || v_motivo,
                               'kids_staff_transfers', t.id, '{}'::jsonb);
  end if;
  perform private.v39_kids_audit(p_church_id, 'status_change', case when v_aceita then 'kids_transfer_target_accepted' else 'kids_transfer_target_declined' end,
                                 'kids_staff_transfers', t.id, v_pes, 'standard', v_motivo, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'id', t.id, 'status', case when v_aceita then 'pending_leader' else 'rejected' end);
end $f$;

-- transferência: o líder autoriza ou recusa (só depois do aceite de quem recebe)
create or replace function app.v39_kids_transfer_decide(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id(); t app.kids_staff_transfers; c record; v_aprova boolean := coalesce((nullif(p->>'aprova', ''))::boolean, false);
  v_motivo text := nullif(btrim(p->>'motivo'), ''); s2 app.kids_event_room_staff; v_rot text;
begin
  select * into t from app.kids_staff_transfers where id = nullif(p->>'transferenciaId', '')::uuid and church_id = p_church_id for update;
  if t.id is null then perform app.raise_domain_error('KIDS_TRANSFER_NOT_FOUND', 'Transferencia nao encontrada'); end if;
  select * into c from private.v39_kids_staff_ctx(t.staff_id);
  perform private.v39_kids_need(p_church_id, (c.e).ministry_id, 'leader');
  if t.status <> 'pending_leader' then perform app.raise_domain_error('KIDS_TRANSFER_NOT_READY', 'A transferencia ainda nao foi aceita por quem recebe (ou ja foi decidida)'); end if;
  if not v_aprova and v_motivo is null then perform app.raise_domain_error('REASON_REQUIRED', 'Informe o motivo'); end if;
  v_rot := private.v39_kids_staff_label(c.r, c.e);
  if v_aprova then
    if (c.s).status <> 'active' then perform app.raise_domain_error('KIDS_STAFF_NOT_FOUND', 'A escala de origem nao esta mais ativa'); end if;
    update app.kids_event_room_staff set status = 'removed', removed_at = now(),
           removed_reason = left('Transferida para ' || (select full_name from app.people where id = t.to_person_id), 500), updated_by_user_account_id = v_me
     where id = (c.s).id;
    insert into app.kids_event_room_staff (church_id, event_room_id, person_id, staff_role, response_status, responded_at, created_by_user_account_id, updated_by_user_account_id)
    values (p_church_id, (c.r).id, t.to_person_id, (c.s).staff_role, 'confirmed', now(), v_me, v_me) returning * into s2;
    update app.kids_staff_transfers set status = 'approved', leader_responded_at = now(), leader_user_account_id = v_me, leader_reason = v_motivo, new_staff_id = s2.id where id = t.id;
    perform private.v39_notify(p_church_id, t.to_person_id, 'kids_transferencia_aprovada', 'Escala assumida', 'O líder autorizou: agora você está em ' || v_rot || '.', 'kids_event_room_staff', s2.id, '{}'::jsonb);
    perform private.v39_notify(p_church_id, t.from_person_id, 'kids_transferencia_aprovada', 'Troca de escala autorizada', 'Você saiu de ' || v_rot || '.', 'kids_staff_transfers', t.id, '{}'::jsonb);
  else
    update app.kids_staff_transfers set status = 'rejected', leader_responded_at = now(), leader_user_account_id = v_me, leader_reason = left(v_motivo, 500) where id = t.id;
    perform private.v39_notify(p_church_id, t.from_person_id, 'kids_transferencia_recusada', 'Troca de escala não autorizada', v_rot || ': o líder não autorizou. Motivo: ' || v_motivo, 'kids_staff_transfers', t.id, '{}'::jsonb);
    perform private.v39_notify(p_church_id, t.to_person_id, 'kids_transferencia_recusada', 'Troca de escala não autorizada', v_rot || ': o líder não autorizou. Motivo: ' || v_motivo, 'kids_staff_transfers', t.id, '{}'::jsonb);
  end if;
  perform private.v39_kids_audit(p_church_id, 'approval', case when v_aprova then 'kids_transfer_approved' else 'kids_transfer_rejected' end,
                                 'kids_staff_transfers', t.id, t.to_person_id, 'standard', v_motivo, jsonb_build_object('new_staff_id', s2.id));
  return jsonb_build_object('ok', true, 'id', t.id, 'status', case when v_aprova then 'approved' else 'rejected' end);
end $f$;

-- transferência: quem pediu desiste (enquanto não decidida)
create or replace function app.v39_kids_transfer_cancel(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_me uuid := app.current_user_account_id(); v_pes uuid; t app.kids_staff_transfers;
begin
  if v_me is null or not coalesce(app.v39_has_church_access(p_church_id), false) then perform app.raise_domain_error('ACCESS_DENIED', 'Sem acesso ativo a esta igreja'); end if;
  select person_id into v_pes from app.user_accounts where id = v_me;
  select * into t from app.kids_staff_transfers where id = nullif(p->>'transferenciaId', '')::uuid and church_id = p_church_id for update;
  if t.id is null or t.status not in ('pending_target','pending_leader') then perform app.raise_domain_error('KIDS_TRANSFER_NOT_FOUND', 'Transferencia nao encontrada ou ja decidida'); end if;
  if t.from_person_id is distinct from v_pes then perform app.raise_domain_error('PERMISSION_DENIED', 'So quem pediu cancela'); end if;
  update app.kids_staff_transfers set status = 'cancelled', cancelled_at = now() where id = t.id;
  perform private.v39_notify(p_church_id, t.to_person_id, 'kids_transferencia_cancelada', 'Pedido de troca cancelado', 'O pedido de troca de escala foi cancelado por quem pediu.', 'kids_staff_transfers', t.id, '{}'::jsonb);
  perform private.v39_kids_audit(p_church_id, 'cancellation', 'kids_transfer_cancelled', 'kids_staff_transfers', t.id, v_pes, 'standard', null, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'id', t.id, 'status', 'cancelled');
end $f$;

-- E. quem retira: 13 anos ou mais (corpo do KIDS_5/KIDS_3 com a nova idade) ------------
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
    if v_ret and v_idade < 13 then perform app.raise_domain_error('KIDS_PICKUP_AGE', 'Quem retira precisa ter mais de 12 anos'); end if;
    if v_papel = 'responsavel' and private.v39_kids_whatsapp(v_pes) is null then
      perform app.raise_domain_error('KIDS_PHONE_REQUIRED', 'Informe o WhatsApp do responsavel');
    end if;
    if v_idade is not null and v_idade < 13 and v_papel = 'responsavel' then
      perform app.raise_domain_error('KIDS_PICKUP_AGE', 'Responsavel precisa ter mais de 12 anos');
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
  if v_ret and (v_papel = 'crianca' or v_ib is null or v_ib < 13) then perform app.raise_domain_error('KIDS_PICKUP_AGE', 'Quem retira precisa ter mais de 12 anos'); end if;
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
    values (p_church_id, v_fam, v_pes, v_papel_p, v_papel_p = 'responsavel' and coalesce(v_ia, 99) >= 13, v_par_p, v_me, v_me);
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
  if coalesce(private.v39_kids_age(pe.birth_date), 0) < 13 then perform app.raise_domain_error('KIDS_PICKUP_AGE', 'Quem retira precisa ter mais de 12 anos'); end if;
  if pe.photo_file_id is null then perform app.raise_domain_error('KIDS_PHOTO_REQUIRED', 'Quem retira precisa ter foto para a conferencia'); end if;
  update app.kids_checkins set status = 'picked_up', picked_up_at = now(), picked_up_by_person_id = v_por, picked_up_by_user_account_id = v_me,
         pickup_method = v_metodo, pickup_reason = case when v_metodo = 'photo' then left(v_motivo, 500) end
   where id = c.id returning * into c;
  perform private.v39_kids_audit(p_church_id, 'status_change', 'kids_checkout', 'kids_checkins', c.id, c.child_person_id, 'minor', v_motivo,
                                 jsonb_build_object('event_id', c.event_id, 'picked_up_by', v_por, 'method', v_metodo));
  return private.v39_kids_checkin_json(c) || jsonb_build_object('ok', true);
end $f$;

-- grants ----------------------------------------------------------------
revoke all on function private.v39_kids_transfer_no_delete() from public;
revoke all on function private.v39_notify(uuid, uuid, text, text, text, text, uuid, jsonb, text) from public;
revoke all on function private.v39_kids_notify_leaders(uuid, uuid, text, text, text, text, uuid, jsonb) from public;
revoke all on function private.v39_kids_staff_ctx(uuid) from public;
revoke all on function private.v39_kids_staff_label(app.kids_event_rooms, app.church_events) from public;
revoke all on function private.v39_kids_event_room_json(app.kids_event_rooms) from public;
revoke all on function app.v39_my_notifications(uuid, integer) from public, anon;
revoke all on function app.v39_notification_read(uuid, uuid) from public, anon;
revoke all on function app.v39_kids_event_room_staff_set(uuid, jsonb) from public, anon;
revoke all on function app.v39_kids_my_schedule(uuid) from public, anon;
revoke all on function app.v39_kids_schedule_respond(uuid, jsonb) from public, anon;
revoke all on function app.v39_kids_schedule_whatsapp_sent(uuid, jsonb) from public, anon;
revoke all on function app.v39_kids_transfer_request(uuid, jsonb) from public, anon;
revoke all on function app.v39_kids_transfer_respond(uuid, jsonb) from public, anon;
revoke all on function app.v39_kids_transfer_decide(uuid, jsonb) from public, anon;
revoke all on function app.v39_kids_transfer_cancel(uuid, jsonb) from public, anon;
revoke all on function app.v39_kids_member_save(uuid, jsonb) from public, anon;
revoke all on function app.v39_family_link_set(uuid, jsonb) from public, anon;
revoke all on function app.v39_kids_checkout(uuid, jsonb) from public, anon;
grant execute on function app.v39_my_notifications(uuid, integer) to authenticated;
grant execute on function app.v39_notification_read(uuid, uuid) to authenticated;
grant execute on function app.v39_kids_event_room_staff_set(uuid, jsonb) to authenticated;
grant execute on function app.v39_kids_my_schedule(uuid) to authenticated;
grant execute on function app.v39_kids_schedule_respond(uuid, jsonb) to authenticated;
grant execute on function app.v39_kids_schedule_whatsapp_sent(uuid, jsonb) to authenticated;
grant execute on function app.v39_kids_transfer_request(uuid, jsonb) to authenticated;
grant execute on function app.v39_kids_transfer_respond(uuid, jsonb) to authenticated;
grant execute on function app.v39_kids_transfer_decide(uuid, jsonb) to authenticated;
grant execute on function app.v39_kids_transfer_cancel(uuid, jsonb) to authenticated;
grant execute on function app.v39_kids_member_save(uuid, jsonb) to authenticated;
grant execute on function app.v39_family_link_set(uuid, jsonb) to authenticated;
grant execute on function app.v39_kids_checkout(uuid, jsonb) to authenticated;


  create function pg_temp.k4_as(p uuid) returns void language sql as $x$
    select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', p::text, true) $x$;
  create function pg_temp.k4_q(p_sql text) returns jsonb language plpgsql as $x$
    declare v jsonb; begin execute 'set local role authenticated'; execute 'select to_jsonb((' || p_sql || '))' into v; execute 'reset role'; return v; end $x$;
  create function pg_temp.k4_err(p_sql text) returns text language plpgsql as $x$
    begin execute 'set local role authenticated'; execute 'select (' || p_sql || ')'; execute 'reset role'; return 'OK';
    exception when others then return sqlerrm; end $x$;

  insert into app.churches (id, name, slug, timezone) values (v_ch, 'Igreja Teste KIDS_4', 'teste-kids4-' || left(v_ch::text, 8), 'America/Sao_Paulo');
  insert into auth.users (id, email) values (v_au_m, 'k4m@teste.invalid'), (v_au_l, 'k4l@teste.invalid'), (v_au_a, 'k4a@teste.invalid'), (v_au_b, 'k4b@teste.invalid'), (v_au_o, 'k4o@teste.invalid');
  insert into app.people (full_name) values ('K4 Master') returning id into v_p_m;
  insert into app.people (full_name) values ('K4 Lider') returning id into v_p_l;
  insert into app.people (full_name) values ('K4 Prof A') returning id into v_p_a;
  insert into app.people (full_name) values ('K4 Prof B') returning id into v_p_b;
  insert into app.people (full_name) values ('K4 De Fora') returning id into v_p_o;
  insert into app.people (full_name, birth_date) values ('K4 Pai', current_date - interval '35 years') returning id into v_pai;
  insert into app.church_people (church_id, person_id, status) values (v_ch, v_p_m, 'active'), (v_ch, v_p_l, 'active'), (v_ch, v_p_a, 'active'), (v_ch, v_p_b, 'active'), (v_ch, v_p_o, 'active'), (v_ch, v_pai, 'active');
  insert into app.person_contacts (person_id, contact_type, contact_value, normalized_value, is_primary) values (v_pai, 'whatsapp', '11955550000', '11955550000', true), (v_p_a, 'whatsapp', '11944440000', '11944440000', true);
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_m, v_p_m, 'active', now(), 'k4m') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  select id into v_prof from app.access_profiles where code = 'master';
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');
  select id into v_prof from app.access_profiles where code = 'disciple';
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_l, v_p_l, 'active', now(), 'k4l') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_a, v_p_a, 'active', now(), 'k4a') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_b, v_p_b, 'active', now(), 'k4b') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_o, v_p_o, 'active', now(), 'k4o') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');

  perform pg_temp.k4_as(v_au_m);
  r := pg_temp.k4_q(format('app.v39_min_save(%L, %L::jsonb)', v_ch, jsonb_build_object('nome', 'Kids', 'tipo', 'kids', 'liderId', v_p_l)));
  v_kids := (r->>'id')::uuid;
  perform pg_temp.k4_as(v_au_l);
  r := pg_temp.k4_q(format('app.v39_min_member_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_p_a)));
  r := pg_temp.k4_q(format('app.v39_min_member_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_p_b)));
  r := pg_temp.k4_q(format('app.v39_kids_room_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'nome', 'Pequenos', 'idadeMin', 2, 'idadeMax', 5)));
  insert into app.church_events (church_id, name, event_type, starts_at, status) values (v_ch, 'Culto Domingo', 'Culto', now() + interval '2 days', 'open') returning id into v_culto;
  select id into v_ev from app.church_events where parent_event_id = v_culto;
  r := pg_temp.k4_q(format('app.v39_kids_event_rooms(%L, %L, %L)', v_ch, v_kids, v_ev));
  v_sala := (r->0->>'id')::uuid;

  -- T1
  r := pg_temp.k4_q(format('app.v39_kids_event_room_staff_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'salaId', v_sala, 'professores', jsonb_build_array(jsonb_build_object('pessoaId', v_p_a)))));
  if r->'professores'->0->>'resposta' <> 'pending' or r->'professores'->0->>'whatsapp' <> '11944440000' or (r->'professores'->0->>'semResposta24h')::boolean then raise exception 'FALHOU T1a: %', r; end if;
  v_st := (r->'professores'->0->>'staffId')::uuid;
  perform pg_temp.k4_as(v_au_a);
  r := pg_temp.k4_q(format('app.v39_my_notifications(%L, 30)', v_ch));
  if (r->>'naoLidas')::int <> 1 or r->'itens'->0->>'tipo' <> 'kids_escala' then raise exception 'FALHOU T1b: %', r; end if;
  r := pg_temp.k4_q(format('app.v39_kids_my_schedule(%L)', v_ch));
  if jsonb_array_length(r->'escalas') <> 1 then raise exception 'FALHOU T1c: %', r; end if;
  r := pg_temp.k4_q(format('app.v39_kids_event_rooms(%L, %L, %L)', v_ch, v_kids, v_ev));
  if r->0->'professores'->0->>'whatsapp' is not null then raise exception 'FALHOU T1d: voluntario ve o WhatsApp'; end if;
  v_res := v_res || 'T1 ok; ';

  -- T2
  v_s := pg_temp.k4_err(format('app.v39_kids_schedule_respond(%L, %L::jsonb)', v_ch, jsonb_build_object('staffId', v_st, 'resposta', 'declined')));
  if v_s <> 'REASON_REQUIRED' then raise exception 'FALHOU T2a: %', v_s; end if;
  r := pg_temp.k4_q(format('app.v39_kids_schedule_respond(%L, %L::jsonb)', v_ch, jsonb_build_object('staffId', v_st, 'resposta', 'declined', 'motivo', 'viagem')));
  perform pg_temp.k4_as(v_au_l);
  r := pg_temp.k4_q(format('app.v39_my_notifications(%L, 30)', v_ch));
  if not exists (select 1 from jsonb_array_elements(r->'itens') x where x->>'tipo' = 'kids_escala_recusa' and x->>'texto' like '%viagem%') then raise exception 'FALHOU T2b: %', r; end if;
  v_res := v_res || 'T2 ok; ';

  -- T3
  perform pg_temp.k4_as(v_au_a);
  r := pg_temp.k4_q(format('app.v39_kids_schedule_respond(%L, %L::jsonb)', v_ch, jsonb_build_object('staffId', v_st, 'resposta', 'confirmed')));
  if not exists (select 1 from app.kids_event_room_staff where id = v_st and response_status = 'confirmed' and decline_reason is null) then raise exception 'FALHOU T3a'; end if;
  perform pg_temp.k4_as(v_au_b);
  v_s := pg_temp.k4_err(format('app.v39_kids_schedule_respond(%L, %L::jsonb)', v_ch, jsonb_build_object('staffId', v_st, 'resposta', 'confirmed')));
  if v_s <> 'PERMISSION_DENIED' then raise exception 'FALHOU T3b: %', v_s; end if;
  v_res := v_res || 'T3 ok; ';

  -- T4
  perform pg_temp.k4_as(v_au_a);
  v_s := pg_temp.k4_err(format('app.v39_kids_schedule_whatsapp_sent(%L, %L::jsonb)', v_ch, jsonb_build_object('staffId', v_st)));
  if v_s <> 'PERMISSION_DENIED' then raise exception 'FALHOU T4a: %', v_s; end if;
  perform pg_temp.k4_as(v_au_l);
  r := pg_temp.k4_q(format('app.v39_kids_schedule_whatsapp_sent(%L, %L::jsonb)', v_ch, jsonb_build_object('staffId', v_st)));
  if not exists (select 1 from app.kids_event_room_staff where id = v_st and whatsapp_sent_at is not null) then raise exception 'FALHOU T4b'; end if;
  v_res := v_res || 'T4 ok; ';

  -- T5
  perform pg_temp.k4_as(v_au_a);
  v_s := pg_temp.k4_err(format('app.v39_kids_transfer_request(%L, %L::jsonb)', v_ch, jsonb_build_object('staffId', v_st, 'paraPessoaId', v_p_o)));
  if v_s <> 'KIDS_TRANSFER_TARGET_INVALID' then raise exception 'FALHOU T5a: %', v_s; end if;
  r := pg_temp.k4_q(format('app.v39_kids_transfer_request(%L, %L::jsonb)', v_ch, jsonb_build_object('staffId', v_st, 'paraPessoaId', v_p_b, 'motivo', 'compromisso')));
  v_tr := (r->>'id')::uuid;
  v_s := pg_temp.k4_err(format('app.v39_kids_transfer_request(%L, %L::jsonb)', v_ch, jsonb_build_object('staffId', v_st, 'paraPessoaId', v_p_b)));
  if v_s <> 'KIDS_TRANSFER_PENDING' then raise exception 'FALHOU T5b: %', v_s; end if;
  perform pg_temp.k4_as(v_au_l);
  v_s := pg_temp.k4_err(format('app.v39_kids_transfer_decide(%L, %L::jsonb)', v_ch, jsonb_build_object('transferenciaId', v_tr, 'aprova', true)));
  if v_s <> 'KIDS_TRANSFER_NOT_READY' then raise exception 'FALHOU T5c: %', v_s; end if;
  perform pg_temp.k4_as(v_au_b);
  r := pg_temp.k4_q(format('app.v39_kids_my_schedule(%L)', v_ch));
  if jsonb_array_length(r->'paraMim') <> 1 then raise exception 'FALHOU T5d: %', r; end if;
  r := pg_temp.k4_q(format('app.v39_kids_transfer_respond(%L, %L::jsonb)', v_ch, jsonb_build_object('transferenciaId', v_tr, 'aceita', true)));
  perform pg_temp.k4_as(v_au_l);
  r := pg_temp.k4_q(format('app.v39_kids_my_schedule(%L)', v_ch));
  if jsonb_array_length(r->'autorizar') <> 1 then raise exception 'FALHOU T5e: %', r; end if;
  r := pg_temp.k4_q(format('app.v39_kids_transfer_decide(%L, %L::jsonb)', v_ch, jsonb_build_object('transferenciaId', v_tr, 'aprova', true)));
  if not exists (select 1 from app.kids_event_room_staff where id = v_st and status = 'removed' and removed_reason like 'Transferida para%')
     or not exists (select 1 from app.kids_event_room_staff where event_room_id = v_sala and person_id = v_p_b and status = 'active' and response_status = 'confirmed') then raise exception 'FALHOU T5f'; end if;
  select id into v_stb from app.kids_event_room_staff where event_room_id = v_sala and person_id = v_p_b and status = 'active';
  v_res := v_res || 'T5 ok; ';

  -- T6
  perform pg_temp.k4_as(v_au_b);
  r := pg_temp.k4_q(format('app.v39_kids_transfer_request(%L, %L::jsonb)', v_ch, jsonb_build_object('staffId', v_stb, 'paraPessoaId', v_p_a)));
  v_tr := (r->>'id')::uuid;
  perform pg_temp.k4_as(v_au_a);
  v_s := pg_temp.k4_err(format('app.v39_kids_transfer_respond(%L, %L::jsonb)', v_ch, jsonb_build_object('transferenciaId', v_tr, 'aceita', false)));
  if v_s <> 'REASON_REQUIRED' then raise exception 'FALHOU T6a: %', v_s; end if;
  r := pg_temp.k4_q(format('app.v39_kids_transfer_respond(%L, %L::jsonb)', v_ch, jsonb_build_object('transferenciaId', v_tr, 'aceita', false, 'motivo', 'trabalho')));
  if not exists (select 1 from app.kids_staff_transfers where id = v_tr and status = 'rejected' and target_decline_reason = 'trabalho') then raise exception 'FALHOU T6b'; end if;
  perform pg_temp.k4_as(v_au_b);
  r := pg_temp.k4_q(format('app.v39_kids_transfer_request(%L, %L::jsonb)', v_ch, jsonb_build_object('staffId', v_stb, 'paraPessoaId', v_p_a)));
  v_tr := (r->>'id')::uuid;
  perform pg_temp.k4_as(v_au_a);
  r := pg_temp.k4_q(format('app.v39_kids_transfer_respond(%L, %L::jsonb)', v_ch, jsonb_build_object('transferenciaId', v_tr, 'aceita', true)));
  perform pg_temp.k4_as(v_au_l);
  v_s := pg_temp.k4_err(format('app.v39_kids_transfer_decide(%L, %L::jsonb)', v_ch, jsonb_build_object('transferenciaId', v_tr, 'aprova', false)));
  if v_s <> 'REASON_REQUIRED' then raise exception 'FALHOU T6c: %', v_s; end if;
  r := pg_temp.k4_q(format('app.v39_kids_transfer_decide(%L, %L::jsonb)', v_ch, jsonb_build_object('transferenciaId', v_tr, 'aprova', false, 'motivo', 'B ja treinado na sala')));
  if not exists (select 1 from app.kids_event_room_staff where id = v_stb and status = 'active') then raise exception 'FALHOU T6d'; end if;
  v_res := v_res || 'T6 ok; ';

  -- T7
  perform pg_temp.k4_as(v_au_b);
  r := pg_temp.k4_q(format('app.v39_kids_transfer_request(%L, %L::jsonb)', v_ch, jsonb_build_object('staffId', v_stb, 'paraPessoaId', v_p_a)));
  v_tr := (r->>'id')::uuid;
  r := pg_temp.k4_q(format('app.v39_kids_transfer_cancel(%L, %L::jsonb)', v_ch, jsonb_build_object('transferenciaId', v_tr)));
  perform pg_temp.k4_as(v_au_a);
  v_s := pg_temp.k4_err(format('app.v39_kids_transfer_respond(%L, %L::jsonb)', v_ch, jsonb_build_object('transferenciaId', v_tr, 'aceita', true)));
  if v_s <> 'KIDS_TRANSFER_NOT_FOUND' then raise exception 'FALHOU T7: %', v_s; end if;
  v_res := v_res || 'T7 ok; ';

  -- T8
  perform pg_temp.k4_as(v_au_l);
  r := pg_temp.k4_q(format('app.v39_kids_event_room_staff_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'salaId', v_sala, 'professores', '[]'::jsonb)));
  perform pg_temp.k4_as(v_au_b);
  r := pg_temp.k4_q(format('app.v39_my_notifications(%L, 30)', v_ch));
  if not exists (select 1 from jsonb_array_elements(r->'itens') x where x->>'tipo' = 'kids_escala_removida') then raise exception 'FALHOU T8: %', r; end if;
  v_res := v_res || 'T8 ok; ';

  -- T9
  perform pg_temp.k4_as(v_au_a);
  r := pg_temp.k4_q(format('app.v39_notification_read(%L, null)', v_ch));
  r := pg_temp.k4_q(format('app.v39_my_notifications(%L, 30)', v_ch));
  if (r->>'naoLidas')::int <> 0 then raise exception 'FALHOU T9: %', r; end if;
  v_res := v_res || 'T9 ok; ';

  -- T10
  perform pg_temp.k4_as(v_au_a);
  r := pg_temp.k4_q(format('app.v39_kids_child_register(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'responsavelId', v_pai, 'parentescoResponsavel', 'Pai',
         'crianca', jsonb_build_object('nome', 'K4 Filha', 'nascimento', (current_date - interval '4 years')::date, 'sexo', 'Feminino', 'parentesco', 'Filha'))));
  v_fam := (r->>'familiaId')::uuid;
  v_s := pg_temp.k4_err(format('app.v39_kids_member_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'familiaId', v_fam, 'papel', 'outro', 'podeRetirar', true,
         'pessoa', jsonb_build_object('nome', 'Irmao Doze', 'nascimento', (current_date - interval '12 years 6 months')::date))));
  if v_s <> 'KIDS_PICKUP_AGE' then raise exception 'FALHOU T10a: %', v_s; end if;
  r := pg_temp.k4_q(format('app.v39_kids_member_save(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'familiaId', v_fam, 'papel', 'outro', 'podeRetirar', true,
         'pessoa', jsonb_build_object('nome', 'Irmao Treze', 'nascimento', (current_date - interval '13 years 1 day')::date))));
  if r->>'id' is null then raise exception 'FALHOU T10b: %', r; end if;
  v_res := v_res || 'T10 ok; ';

  -- T11
  reset role;
  insert into app.church_events (church_id, name, event_type, starts_at, status) values (v_ch, 'Culto Hoje', 'Culto', now() + interval '10 hours', 'open') returning id into v_culto2;
  select id into v_ev2 from app.church_events where parent_event_id = v_culto2;
  perform pg_temp.k4_as(v_au_l);
  r := pg_temp.k4_q(format('app.v39_kids_event_rooms(%L, %L, %L)', v_ch, v_kids, v_ev2));
  v_sala2 := (r->0->>'id')::uuid;
  r := pg_temp.k4_q(format('app.v39_kids_event_room_staff_set(%L, %L::jsonb)', v_ch, jsonb_build_object('ministerioId', v_kids, 'salaId', v_sala2, 'professores', jsonb_build_array(jsonb_build_object('pessoaId', v_p_a)))));
  if not (r->'professores'->0->>'semResposta24h')::boolean then raise exception 'FALHOU T11: %', r; end if;
  v_res := v_res || 'T11 ok; ';

  -- T12 REVERTER
  reset role;
  begin
    if exists (select 1 from app.kids_staff_transfers) then raise exception 'KIDS_4 REVERTER ABORTADO: ja existem transferencias ou respostas de escala. Nada foi alterado.'; end if;
    raise exception 'FALHOU T12a';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm not like 'KIDS_4 REVERTER ABORTADO%' then raise exception 'FALHOU T12a: %', sqlerrm; end if;
  end;
  alter table app.kids_staff_transfers disable trigger trg_v39_kids_transfer_no_delete;
  delete from app.kids_staff_transfers where church_id = v_ch;
  update app.kids_event_room_staff set response_status = 'pending', responded_at = null, decline_reason = null, whatsapp_sent_at = null where church_id = v_ch;

  -- REVERTER (identico ao _reverter, sem begin/commit)
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


  if to_regclass('app.kids_staff_transfers') is not null then raise exception 'FALHOU T12b: tabela ficou'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'app' and table_name = 'kids_event_room_staff' and column_name = 'response_status') then raise exception 'FALHOU T12c: colunas ficaram'; end if;
  if pg_get_functiondef('app.v39_kids_checkout(uuid,jsonb)'::regprocedure) not like '%< 12%' then raise exception 'FALHOU T12d: retirada nao voltou a 12'; end if;
  if pg_get_functiondef('private.v39_kids_event_room_json(app.kids_event_rooms)'::regprocedure) like '%resposta%' then raise exception 'FALHOU T12e: json nao voltou ao KIDS_5'; end if;
  v_res := v_res || 'T12 ok (REVERTER ok)';

  raise exception 'TESTE KIDS_4 CONCLUIDO (nada foi gravado): %', v_res;
end
$t$;
