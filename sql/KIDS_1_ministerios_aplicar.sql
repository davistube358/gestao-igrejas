-- =====================================================================
-- KIDS_1 · Ministérios (genérico; primeiro o Kids) · APLICAR
-- 23/11/2026 · DATA · decisões do Diogo (chat, 23/11):
--   1. evento do Kids = evento "filho" do culto em app.church_events
--   2. todo culto gera o evento do ministério que acompanha cultos (Kids)
--   3. Kids até 12 anos (app.ministries.max_age_years = 12)
--  12. administram: líder do ministério, pastor e master (secretaria não)
-- VALIDACAO: ver cabecalho de KIDS_1_ministerios_teste_rollback.sql
--
-- O que faz (o esquema app.ministry_* já existia, vazio e sem RPC utilizável):
--   A. app.ministries: + kind ('general'|'kids'), follows_church_services, max_age_years
--   B. app.church_events: + ministry_id, parent_event_id (evento do ministério; filho = acompanha o culto)
--      + gatilho de contexto (mesma igreja, pai é culto da igreja, vínculo imutável)
--      + gatilho que cria/atualiza/cancela o filho quando o culto é criado/alterado/cancelado
--        (filho travado pela TRAVA-1, encerrado ou cancelado não é tocado)
--   C. permissões ministries.* também para o perfil pastor (hoje só master)
--   D. helpers private.v39_min_role / v39_min_need / v39_min_hist / v39_min_backfill
--   E. RPCs: v39_min_list, v39_min_save, v39_min_function_save, v39_min_members,
--      v39_min_member_set, v39_min_events, v39_min_event_save, v39_min_people_search
--      (busca só de nome para o líder, que em geral não tem people.view)
-- Não muda nenhuma função existente. Cultos atuais continuam iguais (ministry_id null).
-- Front: as listas de cultos devem ignorar church_events com ministry_id (MIN-1 em
--        app_v39_p1_contracts_gc_culto_evento.js) — publicar o front junto ou antes.
-- Reverter: KIDS_1_ministerios_reverter.sql
-- =====================================================================
begin;

-- KIDS1-BODY-BEGIN
do $g$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'app' and table_name = 'church_events' and column_name in ('ministry_id','parent_event_id'))
     or exists (select 1 from information_schema.columns where table_schema = 'app' and table_name = 'ministries' and column_name in ('kind','follows_church_services','max_age_years')) then
    raise exception 'KIDS_1 ABORTADO: colunas ja existem (KIDS_1 ja aplicado?). Nada foi alterado.';
  end if;
  if (select count(*) from app.ministries) > 0 then
    raise exception 'KIDS_1 ABORTADO: app.ministries nao esta vazia; revisar antes. Nada foi alterado.';
  end if;
end $g$;

-- A. ministérios ------------------------------------------------------
alter table app.ministries
  add column kind text not null default 'general',
  add column follows_church_services boolean not null default false,
  add column max_age_years integer;
alter table app.ministries
  add constraint ministries_kind_check check (kind in ('general','kids')),
  add constraint ministries_max_age_check check (max_age_years is null or max_age_years between 1 and 18);
create unique index ministries_name_open_unique_idx on app.ministries (church_id, lower(btrim(name))) where status <> 'closed';

-- B. eventos do ministério -------------------------------------------
alter table app.church_events
  add column ministry_id uuid references app.ministries(id) on update restrict on delete restrict,
  add column parent_event_id uuid references app.church_events(id) on update restrict on delete restrict;
alter table app.church_events
  add constraint church_events_parent_needs_ministry check (parent_event_id is null or ministry_id is not null),
  add constraint church_events_parent_not_self check (parent_event_id is null or parent_event_id <> id);
create unique index church_events_ministry_child_unique_idx on app.church_events (parent_event_id, ministry_id) where parent_event_id is not null;
create index church_events_ministry_idx on app.church_events (ministry_id, starts_at) where ministry_id is not null;

create or replace function private.v39_min_event_ctx() returns trigger
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_mc uuid; v_p app.church_events;
begin
  if tg_op = 'UPDATE' and (new.ministry_id is distinct from old.ministry_id or new.parent_event_id is distinct from old.parent_event_id) then
    perform app.raise_domain_error('MIN_EVENT_LINK_IMMUTABLE', 'O vinculo do evento com o ministerio nao pode ser alterado');
  end if;
  if new.ministry_id is not null then
    select church_id into v_mc from app.ministries where id = new.ministry_id;
    if v_mc is distinct from new.church_id then
      perform app.raise_domain_error('MIN_EVENT_CHURCH', 'Ministerio e evento devem ser da mesma igreja');
    end if;
  end if;
  if new.parent_event_id is not null then
    select * into v_p from app.church_events where id = new.parent_event_id;
    if v_p.id is null or v_p.church_id <> new.church_id or v_p.ministry_id is not null then
      perform app.raise_domain_error('MIN_EVENT_PARENT', 'O evento pai deve ser um culto/evento da propria igreja');
    end if;
  end if;
  return new;
end $f$;

create trigger trg_v39_min_event_ctx before insert or update on app.church_events
  for each row execute function private.v39_min_event_ctx();

create or replace function private.v39_min_is_culto(p_type text) returns boolean
language sql immutable set search_path = pg_catalog as $f$
  select lower(btrim(coalesce(p_type, ''))) like 'culto%'
$f$;

-- cria/atualiza/cancela o evento filho dos ministérios que acompanham cultos
create or replace function private.v39_min_sync_children() returns trigger
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare m app.ministries; c app.church_events; v_actor uuid := coalesce(new.updated_by_user_account_id, new.created_by_user_account_id);
begin
  if not private.v39_min_is_culto(new.event_type) then return null; end if;
  for m in select * from app.ministries where church_id = new.church_id and status = 'active' and follows_church_services loop
    select * into c from app.church_events where parent_event_id = new.id and ministry_id = m.id;
    if c.id is null then
      if new.status in ('draft','planned','open') and coalesce(new.ends_at, new.starts_at) >= now() - interval '12 hours' then
        insert into app.church_events (church_id, name, event_type, starts_at, ends_at, location_text, status,
                                       created_by_user_account_id, updated_by_user_account_id, ministry_id, parent_event_id)
        values (new.church_id, left(m.name || ' · ' || new.name, 200), m.name, new.starts_at, new.ends_at, new.location_text, new.status,
                v_actor, v_actor, m.id, new.id);
      end if;
      continue;
    end if;
    if c.status in ('completed','cancelled') then continue; end if;
    if now() > private.v39_trava_evento(c) and not private.v39_trava_liberada(c.id) then continue; end if;
    if new.status = 'cancelled' then
      update app.church_events set status = 'cancelled', cancelled_at = now(),
             cancellation_reason = left('Culto cancelado: ' || coalesce(new.cancellation_reason, 'sem motivo'), 500),
             updated_by_user_account_id = v_actor
       where id = c.id;
    elsif tg_op = 'UPDATE' then
      update app.church_events set
             starts_at = new.starts_at, ends_at = new.ends_at,
             location_text = case when c.location_text is not distinct from old.location_text then new.location_text else c.location_text end,
             name = case when c.name = left(m.name || ' · ' || old.name, 200) then left(m.name || ' · ' || new.name, 200) else c.name end,
             status = case when new.status is distinct from old.status and new.status in ('draft','planned','open') then new.status else c.status end,
             updated_by_user_account_id = v_actor
       where id = c.id
         and (c.starts_at is distinct from new.starts_at or c.ends_at is distinct from new.ends_at
              or old.location_text is distinct from new.location_text or old.name is distinct from new.name
              or (new.status is distinct from old.status and new.status in ('draft','planned','open')));
    end if;
  end loop;
  return null;
end $f$;

create trigger trg_v39_min_sync_children after insert or update on app.church_events
  for each row when (new.ministry_id is null) execute function private.v39_min_sync_children();

-- C. permissões: pastor também administra ministérios -----------------
insert into app.profile_permissions (profile_id, permission_id, effect, requires_additional_authorization)
select ap.id, p.id, 'allow', false
  from app.access_profiles ap cross join app.permissions p
 where ap.code = 'pastor' and p.code like 'ministries.%' and p.is_active
   and not exists (select 1 from app.profile_permissions pp where pp.profile_id = ap.id and pp.permission_id = p.id);

-- D. helpers ----------------------------------------------------------
-- papel de quem chama no ministério: admin (ministries.manage) | leader | volunteer | null
create or replace function private.v39_min_role(p_church_id uuid, p_ministry_id uuid) returns text
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare v_person uuid; v_type text;
begin
  if p_church_id is null or not app.v39_has_church_access(p_church_id) then return null; end if;
  if app.has_permission('ministries.manage', p_church_id) then return 'admin'; end if;
  if p_ministry_id is null then return null; end if;
  select ua.person_id into v_person from app.user_accounts ua where ua.id = app.current_user_account_id() and ua.status = 'active';
  if v_person is null then return null; end if;
  if exists (select 1 from app.ministries m where m.id = p_ministry_id and m.church_id = p_church_id and m.status in ('planned','active','inactive')
              and v_person in (m.leader_person_id, m.assistant_person_id)) then return 'leader'; end if;
  select mm.membership_type into v_type from app.ministry_memberships mm join app.ministries m on m.id = mm.ministry_id
   where mm.ministry_id = p_ministry_id and mm.church_id = p_church_id and mm.person_id = v_person and mm.status = 'active'
     and m.status in ('planned','active','inactive');
  if v_type is null then return null; end if;
  return case when v_type in ('leader','assistant','coordinator') then 'leader' else 'volunteer' end;
end $f$;

create or replace function private.v39_min_need(p_church_id uuid, p_ministry_id uuid, p_level text) returns text
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare v_role text := private.v39_min_role(p_church_id, p_ministry_id);
begin
  if app.current_user_account_id() is null or not coalesce(app.v39_has_church_access(p_church_id), false) then
    perform app.raise_domain_error('ACCESS_DENIED', 'Sem acesso ativo a esta igreja');
  end if;
  if p_ministry_id is not null and not exists (select 1 from app.ministries where id = p_ministry_id and church_id = p_church_id) then
    perform app.raise_domain_error('MINISTRY_NOT_FOUND', 'Ministerio nao encontrado');
  end if;
  if v_role is null
     or (p_level = 'admin' and v_role <> 'admin')
     or (p_level = 'leader' and v_role not in ('admin','leader')) then
    perform app.raise_domain_error('PERMISSION_DENIED', 'Sem permissao neste ministerio');
  end if;
  return v_role;
end $f$;

create or replace function private.v39_min_hist(p_church_id uuid, p_entity text, p_id uuid, p_action text,
                                                 p_prev text, p_new text, p_reason text, p_meta jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
begin
  insert into app.ministry_history (church_id, entity_type, entity_id, action, previous_status, new_status, performed_by_user_account_id, reason, metadata)
  values (p_church_id, p_entity, p_id, p_action, p_prev, p_new, app.current_user_account_id(), left(p_reason, 500), coalesce(p_meta, '{}'::jsonb));
  perform private.v39_audit_log(p_church_id, case when p_prev is distinct from p_new and p_new is not null then 'status_change' else 'data_change' end,
                                'ministry_' || p_entity || '_' || p_action, 'app',
                                case p_entity when 'ministry' then 'ministries' when 'function' then 'ministry_functions'
                                              when 'membership' then 'ministry_memberships' else 'ministry_' || p_entity end,
                                p_id::text, null, 'standard', 'success', p_reason, coalesce(p_meta, '{}'::jsonb));
end $f$;

create or replace function private.v39_min_person_name(p app.people) returns text
language sql stable set search_path = pg_catalog, app as $f$
  select case when p.id is null then null
              when p.status = 'restricted' and p.anonymized_at is null then 'Pessoa com tratamento restrito'
              else coalesce(nullif(btrim(p.preferred_name), ''), p.full_name) end
$f$;

-- cria os filhos dos cultos futuros para um ministério que acompanha cultos
create or replace function private.v39_min_backfill(p_ministry_id uuid) returns integer
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare m app.ministries; v_n integer;
begin
  select * into m from app.ministries where id = p_ministry_id;
  if m.id is null or m.status <> 'active' or not m.follows_church_services then return 0; end if;
  insert into app.church_events (church_id, name, event_type, starts_at, ends_at, location_text, status,
                                 created_by_user_account_id, updated_by_user_account_id, ministry_id, parent_event_id)
  select e.church_id, left(m.name || ' · ' || e.name, 200), m.name, e.starts_at, e.ends_at, e.location_text, e.status,
         app.current_user_account_id(), app.current_user_account_id(), m.id, e.id
    from app.church_events e
   where e.church_id = m.church_id and e.ministry_id is null and private.v39_min_is_culto(e.event_type)
     and e.status in ('draft','planned','open') and coalesce(e.ends_at, e.starts_at) >= now() - interval '12 hours'
     and not exists (select 1 from app.church_events c where c.parent_event_id = e.id and c.ministry_id = m.id);
  get diagnostics v_n = row_count;
  return v_n;
end $f$;

-- pessoa elegível para vínculo: na igreja, não encerrada, ativa (nem restringida nem anonimizada)
create or replace function private.v39_min_person_ok(p_church_id uuid, p_person_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, app as $f$
  select exists (select 1 from app.church_people cp join app.people p on p.id = cp.person_id
                  where cp.church_id = p_church_id and cp.person_id = p_person_id and cp.status <> 'closed'
                    and p.status = 'active' and p.anonymized_at is null)
$f$;

-- garante vínculo ativo do líder/auxiliar
create or replace function private.v39_min_ensure_member(p_ministry app.ministries, p_person uuid, p_type text) returns void
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare mm app.ministry_memberships; v_me uuid := app.current_user_account_id();
begin
  if p_person is null then return; end if;
  select * into mm from app.ministry_memberships where ministry_id = p_ministry.id and person_id = p_person and status in ('requested','active','paused');
  if mm.id is null then
    insert into app.ministry_memberships (church_id, ministry_id, person_id, membership_type, status, requested_by_user_account_id,
                                          approved_at, approved_by_user_account_id, created_by_user_account_id, updated_by_user_account_id)
    values (p_ministry.church_id, p_ministry.id, p_person, p_type, 'active', v_me, now(), v_me, v_me, v_me) returning * into mm;
    perform private.v39_min_hist(p_ministry.church_id, 'membership', mm.id, 'created', null, 'active', 'Definido como ' || p_type || ' do ministerio',
                                 jsonb_build_object('ministry_id', p_ministry.id, 'person_id', p_person, 'type', p_type));
  elsif mm.status <> 'active' or mm.membership_type <> p_type then
    update app.ministry_memberships set membership_type = p_type, status = 'active',
           approved_at = coalesce(approved_at, now()), approved_by_user_account_id = coalesce(approved_by_user_account_id, v_me),
           paused_at = null, pause_reason = null, updated_by_user_account_id = v_me
     where id = mm.id;
    perform private.v39_min_hist(p_ministry.church_id, 'membership', mm.id, 'updated', mm.status, 'active', 'Definido como ' || p_type || ' do ministerio',
                                 jsonb_build_object('ministry_id', p_ministry.id, 'person_id', p_person, 'type', p_type, 'previous_type', mm.membership_type));
  end if;
end $f$;

-- E. RPCs -------------------------------------------------------------
-- lista de ministérios visíveis (admin: todos; demais: onde tem vínculo ativo)
create or replace function app.v39_min_list(p_church_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare v_admin boolean;
begin
  if app.current_user_account_id() is null or not coalesce(app.v39_has_church_access(p_church_id), false) then
    perform app.raise_domain_error('ACCESS_DENIED', 'Sem acesso ativo a esta igreja');
  end if;
  v_admin := app.has_permission('ministries.manage', p_church_id) or app.has_permission('ministries.view', p_church_id);
  return coalesce((
    select jsonb_agg(x.j order by x.ord, x.nm) from (
      select case m.status when 'active' then 0 when 'planned' then 1 when 'inactive' then 2 else 3 end ord, lower(m.name) nm,
             jsonb_build_object(
               'id', m.id, 'nome', m.name, 'codigo', m.code, 'descricao', m.description, 'tipo', m.kind, 'status', m.status,
               'liderId', m.leader_person_id, 'liderNome', private.v39_min_person_name(pl),
               'auxiliarId', m.assistant_person_id, 'auxiliarNome', private.v39_min_person_name(pa),
               'acompanhaCultos', m.follows_church_services, 'idadeMax', m.max_age_years,
               'encerradoEm', m.closed_on, 'motivoEncerramento', m.close_reason,
               'meuPapel', private.v39_min_role(p_church_id, m.id),
               'membrosAtivos', (select count(*) from app.ministry_memberships mm where mm.ministry_id = m.id and mm.status = 'active'),
               'funcoes', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.name, 'descricao', f.description,
                                                                        'lideranca', f.is_leadership, 'ativo', f.is_active) order by f.is_active desc, lower(f.name))
                                      from app.ministry_functions f where f.ministry_id = m.id), '[]'::jsonb)) j
        from app.ministries m
        left join app.people pl on pl.id = m.leader_person_id
        left join app.people pa on pa.id = m.assistant_person_id
       where m.church_id = p_church_id
         and (v_admin or private.v39_min_role(p_church_id, m.id) is not null)
    ) x), '[]'::jsonb);
end $f$;

-- criar/alterar ministério (master/pastor)
create or replace function app.v39_min_save(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id(); m app.ministries; v_old app.ministries;
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_nome text := nullif(btrim(p->>'nome'), '');
  v_kind text := coalesce(nullif(btrim(p->>'tipo'), ''), 'general');
  v_status text := coalesce(nullif(btrim(p->>'status'), ''), 'active');
  v_motivo text := nullif(btrim(p->>'motivo'), '');
  v_lider uuid := nullif(p->>'liderId', '')::uuid;
  v_aux uuid := nullif(p->>'auxiliarId', '')::uuid;
  v_follows boolean; v_max integer; v_n integer := 0; v_canc integer := 0;
begin
  perform private.v39_min_need(p_church_id, null, 'admin');
  if p is null or jsonb_typeof(p) <> 'object' then perform app.raise_domain_error('MIN_PAYLOAD_INVALID', 'Dados invalidos'); end if;
  if v_nome is null then perform app.raise_domain_error('MIN_NAME_REQUIRED', 'Informe o nome do ministerio'); end if;
  if v_kind not in ('general','kids') then perform app.raise_domain_error('MIN_KIND_INVALID', 'Tipo de ministerio invalido'); end if;
  if v_status not in ('planned','active','inactive','closed') then perform app.raise_domain_error('MIN_STATUS_INVALID', 'Situacao invalida'); end if;
  if v_status = 'closed' and v_motivo is null then perform app.raise_domain_error('REASON_REQUIRED', 'Informe o motivo do encerramento'); end if;
  v_follows := coalesce((nullif(p->>'acompanhaCultos', ''))::boolean, v_kind = 'kids');
  v_max := coalesce(nullif(p->>'idadeMax', '')::integer, case when v_kind = 'kids' then 12 end);
  if v_lider is not null and not private.v39_min_person_ok(p_church_id, v_lider) then
    perform app.raise_domain_error('MIN_PERSON_INVALID', 'Lider precisa ser pessoa ativa desta igreja');
  end if;
  if v_aux is not null and not private.v39_min_person_ok(p_church_id, v_aux) then
    perform app.raise_domain_error('MIN_PERSON_INVALID', 'Auxiliar precisa ser pessoa ativa desta igreja');
  end if;
  if v_aux is not null and v_aux = v_lider then perform app.raise_domain_error('MIN_LEADERS_EQUAL', 'Lider e auxiliar devem ser pessoas diferentes'); end if;
  if exists (select 1 from app.ministries x where x.church_id = p_church_id and x.status <> 'closed' and lower(btrim(x.name)) = lower(v_nome)
              and x.id is distinct from v_id) and v_status <> 'closed' then
    perform app.raise_domain_error('MIN_NAME_DUPLICATE', 'Ja existe ministerio com este nome');
  end if;

  if v_id is null then
    if v_status = 'closed' then perform app.raise_domain_error('MIN_STATUS_INVALID', 'Ministerio novo nao pode nascer encerrado'); end if;
    insert into app.ministries (church_id, code, name, description, purpose, leader_person_id, assistant_person_id, status, starts_on, notes,
                                created_by_user_account_id, updated_by_user_account_id, kind, follows_church_services, max_age_years)
    values (p_church_id, nullif(btrim(p->>'codigo'), ''), v_nome, nullif(p->>'descricao', ''), nullif(p->>'proposito', ''), v_lider, v_aux,
            v_status, coalesce(nullif(p->>'inicio', '')::date, current_date), nullif(p->>'obs', ''), v_me, v_me, v_kind, v_follows, v_max)
    returning * into m;
    perform private.v39_min_hist(p_church_id, 'ministry', m.id, 'created', null, m.status, v_motivo, jsonb_build_object('kind', v_kind));
  else
    select * into v_old from app.ministries where id = v_id and church_id = p_church_id for update;
    if v_old.id is null then perform app.raise_domain_error('MINISTRY_NOT_FOUND', 'Ministerio nao encontrado'); end if;
    if v_old.status = 'closed' and v_status <> 'closed' then perform app.raise_domain_error('MIN_CLOSED', 'Ministerio encerrado nao pode ser reaberto'); end if;
    update app.ministries set code = nullif(btrim(p->>'codigo'), ''), name = v_nome, description = nullif(p->>'descricao', ''),
           purpose = nullif(p->>'proposito', ''), leader_person_id = v_lider, assistant_person_id = v_aux, status = v_status,
           closed_on = case when v_status = 'closed' then coalesce(closed_on, current_date) end,
           close_reason = case when v_status = 'closed' then v_motivo end,
           notes = nullif(p->>'obs', ''), kind = v_kind, follows_church_services = v_follows, max_age_years = v_max,
           updated_by_user_account_id = v_me
     where id = v_id returning * into m;
    perform private.v39_min_hist(p_church_id, 'ministry', m.id, 'updated', v_old.status, m.status, v_motivo,
                                 jsonb_build_object('before', to_jsonb(v_old) - 'created_at' - 'updated_at', 'kind', v_kind));
    -- líder/auxiliar trocado: o anterior continua no ministério como voluntário
    if v_old.leader_person_id is not null and v_old.leader_person_id is distinct from m.leader_person_id
       and v_old.leader_person_id is distinct from m.assistant_person_id then
      update app.ministry_memberships set membership_type = 'volunteer', updated_by_user_account_id = v_me
       where ministry_id = m.id and person_id = v_old.leader_person_id and status in ('active','paused') and membership_type in ('leader','assistant');
    end if;
    if v_old.assistant_person_id is not null and v_old.assistant_person_id is distinct from m.assistant_person_id
       and v_old.assistant_person_id is distinct from m.leader_person_id then
      update app.ministry_memberships set membership_type = 'volunteer', updated_by_user_account_id = v_me
       where ministry_id = m.id and person_id = v_old.assistant_person_id and status in ('active','paused') and membership_type in ('leader','assistant');
    end if;
    -- inativado/encerrado: cancela os eventos futuros do ministério ainda não iniciados
    if m.status in ('inactive','closed') and v_old.status not in ('inactive','closed') then
      update app.church_events set status = 'cancelled', cancelled_at = now(),
             cancellation_reason = left('Ministerio ' || case when m.status = 'closed' then 'encerrado' else 'inativado' end
                                        || coalesce(': ' || v_motivo, ''), 500),
             updated_by_user_account_id = v_me
       where ministry_id = m.id and status in ('draft','planned','open') and starts_at > now();
      get diagnostics v_canc = row_count;
    end if;
  end if;

  if m.status <> 'closed' then
    perform private.v39_min_ensure_member(m, m.leader_person_id, 'leader');
    perform private.v39_min_ensure_member(m, m.assistant_person_id, 'assistant');
  end if;
  v_n := private.v39_min_backfill(m.id);
  return jsonb_build_object('ok', true, 'id', m.id, 'status', m.status, 'eventosCriados', v_n, 'eventosCancelados', v_canc);
end $f$;

-- funções do ministério (líder)
create or replace function app.v39_min_function_save(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id(); f app.ministry_functions; v_old app.ministry_functions;
  v_id uuid := nullif(p->>'id', '')::uuid; v_min uuid := nullif(p->>'ministerioId', '')::uuid;
  v_nome text := nullif(btrim(p->>'nome'), ''); v_ativo boolean := coalesce((nullif(p->>'ativo', ''))::boolean, true);
begin
  if v_id is not null then
    select * into v_old from app.ministry_functions where id = v_id;
    if v_old.id is null then perform app.raise_domain_error('MIN_FUNCTION_NOT_FOUND', 'Funcao nao encontrada'); end if;
    if v_min is not null and v_min <> v_old.ministry_id then perform app.raise_domain_error('MIN_FUNCTION_NOT_FOUND', 'Funcao nao encontrada'); end if;
    v_min := v_old.ministry_id;
  end if;
  perform private.v39_min_need(p_church_id, v_min, 'leader');
  if v_min is null then perform app.raise_domain_error('MINISTRY_REQUIRED', 'Informe o ministerio'); end if;
  if v_nome is null then perform app.raise_domain_error('MIN_FUNCTION_NAME_REQUIRED', 'Informe o nome da funcao'); end if;
  if exists (select 1 from app.ministry_functions x where x.ministry_id = v_min and lower(btrim(x.name)) = lower(v_nome) and x.id is distinct from v_id) then
    perform app.raise_domain_error('MIN_FUNCTION_DUPLICATE', 'Ja existe funcao com este nome');
  end if;
  if v_id is null then
    insert into app.ministry_functions (ministry_id, name, description, requires_approval, is_leadership, is_active, created_by_user_account_id, updated_by_user_account_id)
    values (v_min, v_nome, nullif(p->>'descricao', ''), false, coalesce((nullif(p->>'lideranca', ''))::boolean, false), v_ativo, v_me, v_me)
    returning * into f;
    perform private.v39_min_hist(p_church_id, 'function', f.id, 'created', null, case when f.is_active then 'active' else 'inactive' end, null,
                                 jsonb_build_object('ministry_id', v_min, 'name', f.name));
  else
    update app.ministry_functions set name = v_nome, description = nullif(p->>'descricao', ''),
           is_leadership = coalesce((nullif(p->>'lideranca', ''))::boolean, is_leadership), is_active = v_ativo, updated_by_user_account_id = v_me
     where id = v_id returning * into f;
    perform private.v39_min_hist(p_church_id, 'function', f.id, 'updated',
                                 case when v_old.is_active then 'active' else 'inactive' end, case when f.is_active then 'active' else 'inactive' end,
                                 nullif(btrim(p->>'motivo'), ''), jsonb_build_object('ministry_id', v_min, 'before', to_jsonb(v_old) - 'created_at' - 'updated_at'));
  end if;
  return jsonb_build_object('ok', true, 'id', f.id);
end $f$;

-- membros do ministério (voluntário vê os ativos; líder vê ativos e pausados, e encerrados se pedir)
create or replace function app.v39_min_members(p_church_id uuid, p_ministry_id uuid, p_incluir_encerrados boolean default false) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare v_role text := private.v39_min_need(p_church_id, p_ministry_id, 'volunteer'); v_lead boolean;
begin
  v_lead := v_role in ('admin','leader');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', mm.id, 'pessoaId', mm.person_id, 'nome', private.v39_min_person_name(pe), 'tipo', mm.membership_type, 'status', mm.status,
             'desde', mm.approved_at, 'pausadoEm', mm.paused_at, 'motivoPausa', case when v_lead then mm.pause_reason end,
             'encerradoEm', mm.ended_at, 'motivoEncerramento', case when v_lead then mm.end_reason end,
             'temLogin', exists (select 1 from app.user_accounts ua join app.church_user_access cua on cua.user_account_id = ua.id
                                  where ua.person_id = mm.person_id and ua.status = 'active' and cua.church_id = p_church_id and cua.status = 'active'),
             'funcoes', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.name) order by lower(f.name))
                                    from app.ministry_member_functions mf join app.ministry_functions f on f.id = mf.function_id
                                   where mf.membership_id = mm.id and mf.status = 'approved'), '[]'::jsonb))
           order by case mm.membership_type when 'leader' then 0 when 'assistant' then 1 when 'coordinator' then 2 else 3 end,
                    case mm.status when 'active' then 0 when 'paused' then 1 else 2 end, lower(pe.full_name))
      from app.ministry_memberships mm join app.people pe on pe.id = mm.person_id
     where mm.ministry_id = p_ministry_id and mm.church_id = p_church_id
       and (mm.status = 'active' or (v_lead and mm.status = 'paused')
            or (v_lead and coalesce(p_incluir_encerrados, false) and mm.status in ('ended','cancelled','rejected')))), '[]'::jsonb);
end $f$;

-- incluir/alterar/pausar/encerrar voluntário e definir as funções dele (líder)
create or replace function app.v39_min_member_set(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id(); v_role text; m app.ministries; mm app.ministry_memberships; v_prev text;
  v_min uuid := nullif(p->>'ministerioId', '')::uuid; v_pes uuid := nullif(p->>'pessoaId', '')::uuid;
  v_tipo text := coalesce(nullif(btrim(p->>'tipo'), ''), 'volunteer');
  v_status text := coalesce(nullif(btrim(p->>'status'), ''), 'active');
  v_motivo text := nullif(btrim(p->>'motivo'), '');
  v_funcs uuid[]; v_f uuid; v_bad integer;
begin
  v_role := private.v39_min_need(p_church_id, v_min, 'leader');
  select * into m from app.ministries where id = v_min;
  if m.status = 'closed' then perform app.raise_domain_error('MIN_CLOSED', 'Ministerio encerrado'); end if;
  if v_pes is null then perform app.raise_domain_error('PERSON_REQUIRED', 'Informe a pessoa'); end if;
  if v_tipo not in ('leader','assistant','coordinator','volunteer','support','other') then perform app.raise_domain_error('MIN_TYPE_INVALID', 'Tipo de participacao invalido'); end if;
  if v_status not in ('active','paused','ended') then perform app.raise_domain_error('MIN_STATUS_INVALID', 'Situacao invalida'); end if;
  if v_status in ('paused','ended') and v_motivo is null then perform app.raise_domain_error('REASON_REQUIRED', 'Informe o motivo'); end if;
  if v_role <> 'admin' and (v_tipo in ('leader','assistant') or v_pes in (m.leader_person_id, m.assistant_person_id)) then
    perform app.raise_domain_error('PERMISSION_DENIED', 'Lider e auxiliar do ministerio sao definidos pelo pastor ou master');
  end if;
  if v_status <> 'active' and v_pes in (m.leader_person_id, m.assistant_person_id) then
    perform app.raise_domain_error('MIN_LEADER_ACTIVE', 'Troque o lider/auxiliar no cadastro do ministerio antes de pausar ou encerrar');
  end if;
  select coalesce(array_agg(distinct x.v::uuid), '{}') into v_funcs from jsonb_array_elements_text(coalesce(p->'funcoes', '[]'::jsonb)) as x(v);
  select count(*) into v_bad from unnest(v_funcs) u(id) where not exists (select 1 from app.ministry_functions f where f.id = u.id and f.ministry_id = v_min and f.is_active);
  if v_bad > 0 then perform app.raise_domain_error('MIN_FUNCTION_INVALID', 'Funcao invalida ou inativa para este ministerio'); end if;

  select * into mm from app.ministry_memberships where ministry_id = v_min and person_id = v_pes and status in ('requested','active','paused') for update;
  if mm.id is null then
    if v_status <> 'active' then perform app.raise_domain_error('MIN_MEMBER_NOT_FOUND', 'Pessoa nao participa deste ministerio'); end if;
    if not private.v39_min_person_ok(p_church_id, v_pes) then perform app.raise_domain_error('MIN_PERSON_INVALID', 'Pessoa precisa estar ativa nesta igreja'); end if;
    insert into app.ministry_memberships (church_id, ministry_id, person_id, membership_type, status, requested_by_user_account_id,
                                          approved_at, approved_by_user_account_id, notes, created_by_user_account_id, updated_by_user_account_id)
    values (p_church_id, v_min, v_pes, v_tipo, 'active', v_me, now(), v_me, nullif(p->>'obs', ''), v_me, v_me) returning * into mm;
    v_prev := null;
  else
    v_prev := mm.status;
    if v_status = 'active' then
      if not private.v39_min_person_ok(p_church_id, v_pes) then perform app.raise_domain_error('MIN_PERSON_INVALID', 'Pessoa precisa estar ativa nesta igreja'); end if;
      update app.ministry_memberships set membership_type = v_tipo, status = 'active',
             approved_at = coalesce(approved_at, now()), approved_by_user_account_id = coalesce(approved_by_user_account_id, v_me),
             paused_at = null, pause_reason = null, notes = coalesce(nullif(p->>'obs', ''), notes), updated_by_user_account_id = v_me
       where id = mm.id returning * into mm;
    elsif v_status = 'paused' then
      if mm.status = 'requested' then perform app.raise_domain_error('MIN_STATUS_INVALID', 'Pedido ainda nao aprovado'); end if;
      update app.ministry_memberships set membership_type = v_tipo, status = 'paused', paused_at = now(), pause_reason = v_motivo, updated_by_user_account_id = v_me
       where id = mm.id returning * into mm;
    else
      update app.ministry_memberships set status = 'ended', ended_at = now(), end_reason = v_motivo, updated_by_user_account_id = v_me
       where id = mm.id returning * into mm;
      update app.ministry_member_functions set status = 'revoked', revoked_at = now(), revocation_reason = left('Participacao encerrada: ' || v_motivo, 500)
       where membership_id = mm.id and status in ('requested','approved');
    end if;
  end if;

  if mm.status = 'active' then
    foreach v_f in array v_funcs loop
      insert into app.ministry_member_functions (membership_id, function_id, status, requested_at, approved_at, approved_by_user_account_id)
      values (mm.id, v_f, 'approved', now(), now(), v_me)
      on conflict (membership_id, function_id) do update set status = 'approved', approved_at = now(), approved_by_user_account_id = v_me,
             rejected_at = null, rejection_reason = null, revoked_at = null, revocation_reason = null
       where app.ministry_member_functions.status <> 'approved';
    end loop;
    update app.ministry_member_functions set status = 'revoked', revoked_at = now(),
           revocation_reason = left(coalesce(v_motivo, 'Funcao retirada pelo lider'), 500)
     where membership_id = mm.id and status = 'approved' and not (function_id = any (v_funcs));
  end if;

  perform private.v39_min_hist(p_church_id, 'membership', mm.id, case when v_prev is null then 'created' else 'updated' end, v_prev, mm.status, v_motivo,
                               jsonb_build_object('ministry_id', v_min, 'person_id', v_pes, 'type', mm.membership_type, 'functions', to_jsonb(v_funcs)));
  return jsonb_build_object('ok', true, 'id', mm.id, 'status', mm.status);
end $f$;

-- busca de pessoas para incluir no ministério (líder): só nome, sem contato; pessoas ativas desta igreja
create or replace function app.v39_min_people_search(p_church_id uuid, p_ministry_id uuid, p_q text) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare v_q text := lower(btrim(coalesce(p_q, '')));
begin
  perform private.v39_min_need(p_church_id, p_ministry_id, 'leader');
  if length(v_q) < 2 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(x.j order by x.nm) from (
      select lower(p.full_name) nm, jsonb_build_object(
               'id', p.id, 'nome', coalesce(nullif(btrim(p.preferred_name), ''), p.full_name),
               'temLogin', exists (select 1 from app.user_accounts ua join app.church_user_access cua on cua.user_account_id = ua.id
                                    where ua.person_id = p.id and ua.status = 'active' and cua.church_id = p_church_id and cua.status = 'active'),
               'jaMembro', exists (select 1 from app.ministry_memberships mm where mm.ministry_id = p_ministry_id and mm.person_id = p.id
                                    and mm.status in ('requested','active','paused'))) j
        from app.people p join app.church_people cp on cp.person_id = p.id and cp.church_id = p_church_id
       where cp.status <> 'closed' and p.status = 'active' and p.anonymized_at is null
         and (lower(p.full_name) like '%' || v_q || '%' or lower(coalesce(p.preferred_name, '')) like '%' || v_q || '%')
       order by lower(p.full_name) limit 20) x), '[]'::jsonb);
end $f$;

-- eventos do ministério (filhos de culto e paralelos)
create or replace function app.v39_min_events(p_church_id uuid, p_ministry_id uuid, p_de date default null, p_ate date default null) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare v_role text := private.v39_min_need(p_church_id, p_ministry_id, 'volunteer');
        v_tz text := coalesce(nullif((select timezone from app.churches where id = p_church_id), ''), 'America/Sao_Paulo');
        v_de date := coalesce(p_de, (now() at time zone v_tz)::date - 30); v_ate date := coalesce(p_ate, (now() at time zone v_tz)::date + 60);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', e.id, 'nome', e.name, 'tipo', e.event_type, 'inicio', e.starts_at, 'fim', e.ends_at,
             'data', (e.starts_at at time zone v_tz)::date, 'local', e.location_text, 'obs', e.notes, 'status', e.status,
             'motivoCancelamento', e.cancellation_reason, 'encerradoEm', e.completed_at,
             'cultoId', e.parent_event_id, 'cultoNome', pe.name, 'cultoStatus', pe.status,
             'travaEm', private.v39_trava_evento(e),
             'travado', now() > private.v39_trava_evento(e) and not private.v39_trava_liberada(e.id),
             'resumo', case when v_role in ('admin','leader') then
                         (select jsonb_build_object('dizimo', s.tithe_amount, 'oferta', s.offering_amount, 'outras', s.other_amount,
                                                    'presentes', s.attendance_total, 'tema', s.theme)
                            from app.church_event_summaries s where s.source = 'church_events' and s.record_id = e.id) end)
           order by e.starts_at)
      from app.church_events e left join app.church_events pe on pe.id = e.parent_event_id
     where e.church_id = p_church_id and e.ministry_id = p_ministry_id
       and (e.starts_at at time zone v_tz)::date between v_de and v_ate), '[]'::jsonb);
end $f$;

-- evento paralelo do ministério (criar/alterar/cancelar) e ajustes no filho do culto (local, obs, abrir, cancelar) — líder
create or replace function app.v39_min_event_save(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id(); m app.ministries; e app.church_events; v_old app.church_events;
  v_id uuid := nullif(p->>'id', '')::uuid; v_min uuid := nullif(p->>'ministerioId', '')::uuid;
  v_tz text := coalesce(nullif((select timezone from app.churches where id = p_church_id), ''), 'America/Sao_Paulo');
  v_nome text := nullif(btrim(p->>'nome'), ''); v_status text := lower(coalesce(nullif(btrim(p->>'status'), ''), 'planned'));
  v_motivo text := nullif(btrim(p->>'motivo'), ''); v_ini timestamptz; v_fim timestamptz;
begin
  if v_id is not null then
    select * into v_old from app.church_events where id = v_id and church_id = p_church_id;
    if v_old.id is null or v_old.ministry_id is null or (v_min is not null and v_min <> v_old.ministry_id) then
      perform app.raise_domain_error('EVENT_NOT_FOUND', 'Evento do ministerio nao encontrado');
    end if;
    v_min := v_old.ministry_id;
  end if;
  perform private.v39_min_need(p_church_id, v_min, 'leader');
  select * into m from app.ministries where id = v_min;
  if v_status not in ('draft','planned','open','cancelled') then perform app.raise_domain_error('EVENT_STATUS_INVALID', 'Situacao invalida'); end if;
  if v_status = 'cancelled' and v_motivo is null then perform app.raise_domain_error('REASON_REQUIRED', 'Informe o motivo do cancelamento'); end if;

  if v_old.id is not null and v_old.status = 'cancelled' then
    if v_status <> 'cancelled' then perform app.raise_domain_error('EVENT_CANCELLED_CANNOT_REOPEN', 'Evento cancelado nao pode ser reaberto'); end if;
    return jsonb_build_object('ok', true, 'id', v_old.id, 'status', v_old.status);
  end if;
  if v_old.id is not null and v_old.status = 'completed' then perform app.raise_domain_error('EVENT_COMPLETED', 'Evento encerrado: peca ao pastor para reabrir'); end if;

  if v_old.id is not null and v_old.parent_event_id is not null then
    -- filho do culto: data/hora e nome acompanham o culto; aqui só local, observação e situação
    update app.church_events set location_text = coalesce(nullif(btrim(p->>'local'), ''), location_text), notes = nullif(p->>'obs', ''),
           status = v_status, cancelled_at = case when v_status = 'cancelled' then now() end,
           cancellation_reason = case when v_status = 'cancelled' then v_motivo end, updated_by_user_account_id = v_me
     where id = v_old.id returning * into e;
  else
    if m.status <> 'active' and v_old.id is null then perform app.raise_domain_error('MIN_INACTIVE', 'Ministerio nao esta ativo'); end if;
    if v_nome is null then perform app.raise_domain_error('EVENT_TITLE_REQUIRED', 'Informe o nome do evento'); end if;
    if nullif(p->>'data', '') is null then perform app.raise_domain_error('EVENT_START_REQUIRED', 'Informe a data'); end if;
    v_ini := ((p->>'data')::date + coalesce(nullif(p->>'inicio', '')::time, time '00:00')) at time zone v_tz;
    v_fim := case when nullif(p->>'fim', '') is not null then ((p->>'data')::date + (p->>'fim')::time) at time zone v_tz end;
    if v_fim is not null and v_fim < v_ini then perform app.raise_domain_error('EVENT_DATES_INVALID', 'Fim antes do inicio'); end if;
    if v_old.id is null then
      insert into app.church_events (church_id, name, event_type, starts_at, ends_at, location_text, status, notes,
                                     cancelled_at, cancellation_reason, created_by_user_account_id, updated_by_user_account_id, ministry_id)
      values (p_church_id, v_nome, m.name, v_ini, v_fim, nullif(btrim(p->>'local'), ''), v_status, nullif(p->>'obs', ''),
              case when v_status = 'cancelled' then now() end, case when v_status = 'cancelled' then v_motivo end, v_me, v_me, m.id)
      returning * into e;
    else
      update app.church_events set name = v_nome, starts_at = v_ini, ends_at = v_fim, location_text = nullif(btrim(p->>'local'), ''),
             notes = nullif(p->>'obs', ''), status = v_status, cancelled_at = case when v_status = 'cancelled' then now() end,
             cancellation_reason = case when v_status = 'cancelled' then v_motivo end, updated_by_user_account_id = v_me
       where id = v_old.id returning * into e;
    end if;
  end if;
  perform private.v39_audit_log(p_church_id, case when v_old.id is null then 'data_change' when v_old.status is distinct from e.status then 'status_change' else 'data_change' end,
                                case when v_old.id is null then 'ministry_event_created' else 'ministry_event_updated' end, 'app', 'church_events', e.id::text,
                                null, 'standard', 'success', v_motivo,
                                jsonb_build_object('ministry_id', v_min, 'parent_event_id', e.parent_event_id, 'status', e.status, 'previous_status', v_old.status));
  return jsonb_build_object('ok', true, 'id', e.id, 'status', e.status);
end $f$;

-- grants --------------------------------------------------------------
revoke all on function private.v39_min_event_ctx() from public;
revoke all on function private.v39_min_sync_children() from public;
revoke all on function private.v39_min_is_culto(text) from public;
revoke all on function private.v39_min_role(uuid, uuid) from public;
revoke all on function private.v39_min_need(uuid, uuid, text) from public;
revoke all on function private.v39_min_hist(uuid, text, uuid, text, text, text, text, jsonb) from public;
revoke all on function private.v39_min_person_name(app.people) from public;
revoke all on function private.v39_min_backfill(uuid) from public;
revoke all on function private.v39_min_person_ok(uuid, uuid) from public;
revoke all on function private.v39_min_ensure_member(app.ministries, uuid, text) from public;
revoke all on function app.v39_min_list(uuid) from public, anon;
revoke all on function app.v39_min_save(uuid, jsonb) from public, anon;
revoke all on function app.v39_min_function_save(uuid, jsonb) from public, anon;
revoke all on function app.v39_min_members(uuid, uuid, boolean) from public, anon;
revoke all on function app.v39_min_member_set(uuid, jsonb) from public, anon;
revoke all on function app.v39_min_events(uuid, uuid, date, date) from public, anon;
revoke all on function app.v39_min_event_save(uuid, jsonb) from public, anon;
revoke all on function app.v39_min_people_search(uuid, uuid, text) from public, anon;
grant execute on function app.v39_min_people_search(uuid, uuid, text) to authenticated;
grant execute on function app.v39_min_list(uuid) to authenticated;
grant execute on function app.v39_min_save(uuid, jsonb) to authenticated;
grant execute on function app.v39_min_function_save(uuid, jsonb) to authenticated;
grant execute on function app.v39_min_members(uuid, uuid, boolean) to authenticated;
grant execute on function app.v39_min_member_set(uuid, jsonb) to authenticated;
grant execute on function app.v39_min_events(uuid, uuid, date, date) to authenticated;
grant execute on function app.v39_min_event_save(uuid, jsonb) to authenticated;
-- KIDS1-BODY-END

commit;
notify pgrst, 'reload schema';

-- VERIFICACAO (deve dar tudo true)
select
  (select count(*) = 2 from information_schema.columns where table_schema = 'app' and table_name = 'church_events' and column_name in ('ministry_id','parent_event_id')) as colunas_evento,
  (select count(*) = 3 from information_schema.columns where table_schema = 'app' and table_name = 'ministries' and column_name in ('kind','follows_church_services','max_age_years')) as colunas_ministerio,
  (select count(*) = 2 from pg_trigger where tgrelid = 'app.church_events'::regclass and tgname in ('trg_v39_min_event_ctx','trg_v39_min_sync_children')) as gatilhos,
  (select count(*) = 8 from pg_proc where pronamespace = 'app'::regnamespace and proname in
     ('v39_min_list','v39_min_save','v39_min_function_save','v39_min_members','v39_min_member_set','v39_min_events','v39_min_event_save','v39_min_people_search')
     and has_function_privilege('authenticated', oid, 'execute') and not has_function_privilege('anon', oid, 'execute')) as rpcs,
  (select count(*) = (select count(*) from app.permissions where code like 'ministries.%' and is_active)
     from app.profile_permissions pp join app.access_profiles ap on ap.id = pp.profile_id join app.permissions p on p.id = pp.permission_id
    where ap.code = 'pastor' and p.code like 'ministries.%') as pastor_permissoes,
  (select count(*) = 0 from app.church_events where ministry_id is not null) as nenhum_evento_de_ministerio_ainda;
