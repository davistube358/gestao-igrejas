-- =====================================================================
-- KIDS_1 · Ministérios · TESTE COM ROLLBACK
-- ULTIMA EXECUCAO (23/11/2026, conector Supabase da conta, pelo Claude):
--   ERROR P0001: TESTE KIDS_1 CONCLUIDO (nada foi gravado): T1 ok; T2 ok; T3 ok; T4 ok; T5 ok; T6 ok; T7 ok; T16 ok; T8 ok; T9 ok; T10 ok; T11 ok; T12 ok; T13 ok; T14 ok; T15 ok (REVERTER ok)
-- Gerado a partir do _aplicar e do _reverter (corpo identico, sem begin/commit/notify).
-- Casos:
--   T1  secretaria não cria ministério (PERMISSION_DENIED)
--   T2  pastor cria o Kids (líder L): só o culto futuro ganha filho (não o passado nem a conferência);
--       idade 12, acompanha cultos, L vira membro líder
--   T3  master cria culto pelo v39_save_church_event: filho nasce sozinho, mesma data e situação
--   T4  master altera horário e libera o culto: filho acompanha (horário e "open")
--   T5  master cancela o culto: filho cancelado com "Culto cancelado: <motivo>"
--   T6  líder cria funções; quem é de fora não cria (PERMISSION_DENIED)
--   T7  líder inclui voluntário V com função; V vê a equipe (2 membros, função certa)
--   T16 busca do líder: só pessoas ativas da igreja, só nome, marca "já membro"; restringida não aparece; voluntário não busca
--   T8  líder não define outro líder (PERMISSION_DENIED)
--   T9  líder cria evento paralelo; V lista 3 eventos do ministério e não vê valores (resumo null)
--   T10 lista de ministérios: fora = 0, voluntário = 1 (volunteer), pastor = 1 (admin)
--   T11 gatilho de contexto: filho de filho recusado (MIN_EVENT_PARENT); trocar ministry_id recusado (MIN_EVENT_LINK_IMMUTABLE)
--   T12 filho travado (encerrado há 2 dias) não é tocado quando o culto muda; culto antigo não ganha filho
--   T13 líder pausa V (motivo obrigatório); V perde o acesso (PERMISSION_DENIED)
--   T14 pastor inativa o ministério: eventos futuros do ministério cancelados; culto novo não gera filho
--   T15 REVERTER: aborta com ministério existente; sem dados de teste volta tudo e v39_save_church_event segue ok
-- NAO GRAVA NADA: tudo e desfeito pelo raise final.
-- =====================================================================
do $t$
declare
  v_ch uuid := gen_random_uuid();
  v_au_m uuid := gen_random_uuid(); v_au_p uuid := gen_random_uuid(); v_au_s uuid := gen_random_uuid();
  v_au_l uuid := gen_random_uuid(); v_au_v uuid := gen_random_uuid(); v_au_o uuid := gen_random_uuid();
  v_p_m uuid; v_p_p uuid; v_p_s uuid; v_p_l uuid; v_p_v uuid; v_p_o uuid;
  v_ua uuid; v_cua uuid; v_prof uuid;
  v_e1 uuid; v_e2 uuid; v_e3 uuid; v_e4 uuid; v_e6 uuid; v_c uuid; v_c6 uuid; v_kids uuid; v_f1 uuid; v_f2 uuid; v_par uuid;
  r jsonb; v_n int; v_t timestamptz; v_s text; v_res text := '';
begin
  -- APLICAR (identico ao _aplicar, sem begin/commit)
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


  -- DADOS DE TESTE ---------------------------------------------------
  insert into app.churches (id, name, slug, timezone) values (v_ch, 'Igreja Teste KIDS_1', 'teste-kids1-' || left(v_ch::text, 8), 'America/Sao_Paulo');
  insert into auth.users (id, email) values (v_au_m, 'k1m@teste.invalid'), (v_au_p, 'k1p@teste.invalid'), (v_au_s, 'k1s@teste.invalid'),
                                            (v_au_l, 'k1l@teste.invalid'), (v_au_v, 'k1v@teste.invalid'), (v_au_o, 'k1o@teste.invalid');
  insert into app.people (full_name) values ('K1 Master') returning id into v_p_m;
  insert into app.people (full_name) values ('K1 Pastor') returning id into v_p_p;
  insert into app.people (full_name) values ('K1 Secretaria') returning id into v_p_s;
  insert into app.people (full_name) values ('K1 Lider Kids') returning id into v_p_l;
  insert into app.people (full_name) values ('K1 Voluntario') returning id into v_p_v;
  insert into app.people (full_name) values ('K1 De Fora') returning id into v_p_o;
  insert into app.church_people (church_id, person_id, status) values
    (v_ch, v_p_m, 'active'), (v_ch, v_p_p, 'active'), (v_ch, v_p_s, 'active'), (v_ch, v_p_l, 'active'), (v_ch, v_p_v, 'active'), (v_ch, v_p_o, 'active');

  -- contas: master, pastor, secretary, e discípulos (líder, voluntário, de fora)
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_m, v_p_m, 'active', now(), 'k1m') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  select id into v_prof from app.access_profiles where code = 'master';
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');

  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_p, v_p_p, 'active', now(), 'k1p') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  select id into v_prof from app.access_profiles where code = 'pastor';
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');

  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_s, v_p_s, 'active', now(), 'k1s') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  select id into v_prof from app.access_profiles where code = 'secretary';
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');

  select id into v_prof from app.access_profiles where code = 'disciple';
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_l, v_p_l, 'active', now(), 'k1l') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_v, v_p_v, 'active', now(), 'k1v') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_o, v_p_o, 'active', now(), 'k1o') returning id into v_ua;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua, 'active', now() - interval '1 day', now() - interval '1 day', v_ua) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_prof, true, now() - interval '1 day');

  -- cultos existentes antes do Kids
  insert into app.church_events (church_id, name, event_type, starts_at, status) values (v_ch, 'Culto futuro', 'Culto', now() + interval '2 days', 'planned') returning id into v_e1;
  insert into app.church_events (church_id, name, event_type, starts_at, status, created_at) values (v_ch, 'Culto passado', 'Culto', now() - interval '3 days', 'planned', now() - interval '4 days') returning id into v_e2;
  insert into app.church_events (church_id, name, event_type, starts_at, status) values (v_ch, 'Conferencia futura', 'Conferência', now() + interval '3 days', 'planned') returning id into v_e3;

  -- T1 secretaria não cria ministério
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_s, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_s::text, true);
  begin
    set local role authenticated; perform app.v39_min_save(v_ch, jsonb_build_object('nome', 'Kids', 'tipo', 'kids')); reset role; raise exception 'FALHOU T1';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'PERMISSION_DENIED' then raise exception 'FALHOU T1: %', sqlerrm; end if;
  end;
  v_res := v_res || 'T1 ok; ';

  -- T2 pastor cria o Kids
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_p::text, true);
  begin
    set local role authenticated; r := app.v39_min_save(v_ch, jsonb_build_object('nome', 'Kids', 'tipo', 'kids', 'liderId', v_p_l)); reset role;
  exception when others then reset role; raise exception 'FALHOU T2: % %', sqlstate, sqlerrm;
  end;
  v_kids := (r->>'id')::uuid;
  if (r->>'eventosCriados')::int <> 1 then raise exception 'FALHOU T2a: eventosCriados=% (esperado 1)', r->>'eventosCriados'; end if;
  select id into v_c from app.church_events where parent_event_id = v_e1 and ministry_id = v_kids;
  if v_c is null then raise exception 'FALHOU T2b: culto futuro sem filho'; end if;
  if exists (select 1 from app.church_events where parent_event_id in (v_e2, v_e3)) then raise exception 'FALHOU T2c: culto passado ou conferencia ganhou filho'; end if;
  if not exists (select 1 from app.ministries where id = v_kids and kind = 'kids' and follows_church_services and max_age_years = 12 and status = 'active') then
    raise exception 'FALHOU T2d: padroes do Kids'; end if;
  if not exists (select 1 from app.ministry_memberships where ministry_id = v_kids and person_id = v_p_l and status = 'active' and membership_type = 'leader') then
    raise exception 'FALHOU T2e: lider sem vinculo'; end if;
  if not exists (select 1 from audit.events where church_id = v_ch and action = 'ministry_ministry_created') then raise exception 'FALHOU T2f: sem auditoria'; end if;
  v_res := v_res || 'T2 ok; ';

  -- T3/T4/T5 master cria, altera/libera e cancela culto
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  v_t := date_trunc('minute', now()) + interval '5 days';
  begin
    set local role authenticated;
    select (app.v39_save_church_event(v_ch, null, jsonb_build_object('name', 'Culto domingo', 'event_type', 'Culto', 'starts_at', v_t))).id into v_e4;
    reset role;
  exception when others then reset role; raise exception 'FALHOU T3: % %', sqlstate, sqlerrm;
  end;
  select count(*) into v_n from app.church_events where parent_event_id = v_e4 and ministry_id = v_kids and starts_at = v_t and status = 'planned' and name = 'Kids · Culto domingo';
  if v_n <> 1 then raise exception 'FALHOU T3: filho nao criado corretamente'; end if;
  v_res := v_res || 'T3 ok; ';

  begin
    set local role authenticated;
    perform app.v39_save_church_event(v_ch, v_e4, jsonb_build_object('name', 'Culto domingo', 'event_type', 'Culto', 'starts_at', v_t + interval '1 hour', 'status', 'open'));
    reset role;
  exception when others then reset role; raise exception 'FALHOU T4: % %', sqlstate, sqlerrm;
  end;
  select count(*) into v_n from app.church_events where parent_event_id = v_e4 and starts_at = v_t + interval '1 hour' and status = 'open';
  if v_n <> 1 then raise exception 'FALHOU T4: filho nao acompanhou'; end if;
  v_res := v_res || 'T4 ok; ';

  begin
    set local role authenticated;
    perform app.v39_save_church_event(v_ch, v_e4, jsonb_build_object('name', 'Culto domingo', 'event_type', 'Culto', 'starts_at', v_t + interval '1 hour', 'status', 'cancelled', 'motivo', 'chuva'));
    reset role;
  exception when others then reset role; raise exception 'FALHOU T5: % %', sqlstate, sqlerrm;
  end;
  select count(*) into v_n from app.church_events where parent_event_id = v_e4 and status = 'cancelled' and cancellation_reason = 'Culto cancelado: chuva';
  if v_n <> 1 then raise exception 'FALHOU T5: filho nao cancelado'; end if;
  v_res := v_res || 'T5 ok; ';

  -- T6 líder cria funções; de fora não
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_l, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_l::text, true);
  begin
    set local role authenticated;
    v_f1 := (app.v39_min_function_save(v_ch, jsonb_build_object('ministerioId', v_kids, 'nome', 'Professor'))->>'id')::uuid;
    v_f2 := (app.v39_min_function_save(v_ch, jsonb_build_object('ministerioId', v_kids, 'nome', 'Recepcao'))->>'id')::uuid;
    reset role;
  exception when others then reset role; raise exception 'FALHOU T6a: % %', sqlstate, sqlerrm;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_o, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_o::text, true);
  begin
    set local role authenticated; perform app.v39_min_function_save(v_ch, jsonb_build_object('ministerioId', v_kids, 'nome', 'Intrusa')); reset role; raise exception 'FALHOU T6b';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'PERMISSION_DENIED' then raise exception 'FALHOU T6b: %', sqlerrm; end if;
  end;
  v_res := v_res || 'T6 ok; ';

  -- T7 líder inclui voluntário com função; voluntário vê a equipe
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_l, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_l::text, true);
  begin
    set local role authenticated;
    perform app.v39_min_member_set(v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_p_v, 'tipo', 'volunteer', 'funcoes', jsonb_build_array(v_f1)));
    reset role;
  exception when others then reset role; raise exception 'FALHOU T7a: % %', sqlstate, sqlerrm;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_v, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_v::text, true);
  begin
    set local role authenticated; r := app.v39_min_members(v_ch, v_kids); reset role;
  exception when others then reset role; raise exception 'FALHOU T7b: % %', sqlstate, sqlerrm;
  end;
  if jsonb_array_length(r) <> 2 then raise exception 'FALHOU T7c: % membros', jsonb_array_length(r); end if;
  if not exists (select 1 from jsonb_array_elements(r) x where (x->>'pessoaId')::uuid = v_p_v and x->'funcoes'->0->>'nome' = 'Professor' and (x->>'temLogin')::boolean) then
    raise exception 'FALHOU T7d: %', r; end if;
  v_res := v_res || 'T7 ok; ';

  -- T16 busca de pessoas do ministério: líder acha só pessoas ativas (com marca de já membro); voluntário não busca
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_l, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_l::text, true);
  begin
    set local role authenticated; r := app.v39_min_people_search(v_ch, v_kids, 'k1 '); reset role;
  exception when others then reset role; raise exception 'FALHOU T16a: % %', sqlstate, sqlerrm;
  end;
  if jsonb_array_length(r) <> 6 then raise exception 'FALHOU T16b: % pessoas: %', jsonb_array_length(r), r; end if;
  if not exists (select 1 from jsonb_array_elements(r) x where (x->>'id')::uuid = v_p_v and (x->>'jaMembro')::boolean and (x->>'temLogin')::boolean and x ? 'nome' and not x ? 'fone') then
    raise exception 'FALHOU T16c: %', r; end if;
  update app.people set status = 'restricted' where id = v_p_o;
  set local role authenticated; r := app.v39_min_people_search(v_ch, v_kids, 'de fora'); reset role;
  if jsonb_array_length(r) <> 0 then raise exception 'FALHOU T16d: restringida apareceu'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_v, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_v::text, true);
  begin
    set local role authenticated; perform app.v39_min_people_search(v_ch, v_kids, 'k1'); reset role; raise exception 'FALHOU T16e';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'PERMISSION_DENIED' then raise exception 'FALHOU T16e: %', sqlerrm; end if;
  end;
  v_res := v_res || 'T16 ok; ';


  -- T8 líder não define outro líder
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_l, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_l::text, true);
  begin
    set local role authenticated; perform app.v39_min_member_set(v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_p_o, 'tipo', 'leader')); reset role; raise exception 'FALHOU T8';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'PERMISSION_DENIED' then raise exception 'FALHOU T8: %', sqlerrm; end if;
  end;
  v_res := v_res || 'T8 ok; ';

  -- T9 evento paralelo; voluntário lista sem valores
  begin
    set local role authenticated;
    v_par := (app.v39_min_event_save(v_ch, jsonb_build_object('ministerioId', v_kids, 'nome', 'Tarde Kids',
                'data', ((now() at time zone 'America/Sao_Paulo')::date + 6)::text, 'inicio', '15:00', 'fim', '17:00'))->>'id')::uuid;
    reset role;
  exception when others then reset role; raise exception 'FALHOU T9a: % %', sqlstate, sqlerrm;
  end;
  if not exists (select 1 from app.church_events where id = v_par and ministry_id = v_kids and parent_event_id is null and event_type = 'Kids') then
    raise exception 'FALHOU T9b: evento paralelo'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_v, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_v::text, true);
  begin
    set local role authenticated; r := app.v39_min_events(v_ch, v_kids); reset role;
  exception when others then reset role; raise exception 'FALHOU T9c: % %', sqlstate, sqlerrm;
  end;
  if jsonb_array_length(r) <> 3 then raise exception 'FALHOU T9d: % eventos: %', jsonb_array_length(r), r; end if;
  if exists (select 1 from jsonb_array_elements(r) x where x->'resumo' <> 'null'::jsonb) then raise exception 'FALHOU T9e: voluntario viu valores'; end if;
  v_res := v_res || 'T9 ok; ';

  -- T10 lista de ministérios por papel
  begin
    set local role authenticated; r := app.v39_min_list(v_ch); reset role;
  exception when others then reset role; raise exception 'FALHOU T10a: % %', sqlstate, sqlerrm;
  end;
  if jsonb_array_length(r) <> 1 or r->0->>'meuPapel' <> 'volunteer' then raise exception 'FALHOU T10a: %', r; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_o, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_o::text, true);
  set local role authenticated; r := app.v39_min_list(v_ch); reset role;
  if jsonb_array_length(r) <> 0 then raise exception 'FALHOU T10b: de fora viu %', r; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_p::text, true);
  set local role authenticated; r := app.v39_min_list(v_ch); reset role;
  if jsonb_array_length(r) <> 1 or r->0->>'meuPapel' <> 'admin' or r->0->>'liderNome' <> 'K1 Lider Kids' or jsonb_array_length(r->0->'funcoes') <> 2 then
    raise exception 'FALHOU T10c: %', r; end if;
  v_res := v_res || 'T10 ok; ';

  -- T11 gatilho de contexto
  begin
    insert into app.church_events (church_id, name, event_type, starts_at, ministry_id, parent_event_id) values (v_ch, 'neto', 'Kids', now() + interval '2 days', v_kids, v_c);
    raise exception 'FALHOU T11a';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'MIN_EVENT_PARENT' then raise exception 'FALHOU T11a: %', sqlerrm; end if;
  end;
  begin
    update app.church_events set ministry_id = null, parent_event_id = null where id = v_c;
    raise exception 'FALHOU T11b';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'MIN_EVENT_LINK_IMMUTABLE' then raise exception 'FALHOU T11b: %', sqlerrm; end if;
  end;
  v_res := v_res || 'T11 ok; ';

  -- T12 filho travado não é tocado; culto antigo não ganha filho
  insert into app.church_events (church_id, name, event_type, starts_at, status) values (v_ch, 'Culto T12', 'Culto', now() + interval '4 days', 'planned') returning id into v_e6;
  select id into v_c6 from app.church_events where parent_event_id = v_e6;
  if v_c6 is null then raise exception 'FALHOU T12a: culto inserido direto nao gerou filho'; end if;
  update app.church_events set status = 'completed', completed_at = now() - interval '2 days' where id = v_c6;
  update app.church_events set starts_at = now() + interval '4 days 2 hours' where id = v_e6;
  select starts_at into v_t from app.church_events where id = v_c6;
  if v_t = (select starts_at from app.church_events where id = v_e6) then raise exception 'FALHOU T12b: filho travado foi alterado'; end if;
  insert into app.church_events (church_id, name, event_type, starts_at, status, created_at) values (v_ch, 'Culto antigo', 'culto da noite', now() - interval '5 days', 'planned', now() - interval '6 days') returning id into v_e2;
  if exists (select 1 from app.church_events where parent_event_id = v_e2) then raise exception 'FALHOU T12c: culto antigo ganhou filho'; end if;
  v_res := v_res || 'T12 ok; ';

  -- T13 líder pausa V; V perde acesso
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_l, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_l::text, true);
  begin
    set local role authenticated; perform app.v39_min_member_set(v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_p_v, 'status', 'paused')); reset role; raise exception 'FALHOU T13a';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'REASON_REQUIRED' then raise exception 'FALHOU T13a: %', sqlerrm; end if;
  end;
  begin
    set local role authenticated; perform app.v39_min_member_set(v_ch, jsonb_build_object('ministerioId', v_kids, 'pessoaId', v_p_v, 'status', 'paused', 'motivo', 'ferias', 'funcoes', jsonb_build_array(v_f1))); reset role;
  exception when others then reset role; raise exception 'FALHOU T13b: % %', sqlstate, sqlerrm;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_v, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_v::text, true);
  begin
    set local role authenticated; perform app.v39_min_members(v_ch, v_kids); reset role; raise exception 'FALHOU T13c';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'PERMISSION_DENIED' then raise exception 'FALHOU T13c: %', sqlerrm; end if;
  end;
  v_res := v_res || 'T13 ok; ';

  -- T14 pastor inativa o Kids
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_p::text, true);
  begin
    set local role authenticated; r := app.v39_min_save(v_ch, jsonb_build_object('id', v_kids, 'nome', 'Kids', 'tipo', 'kids', 'liderId', v_p_l, 'status', 'inactive', 'motivo', 'pausa')); reset role;
  exception when others then reset role; raise exception 'FALHOU T14a: % %', sqlstate, sqlerrm;
  end;
  if (r->>'eventosCancelados')::int <> 2 then raise exception 'FALHOU T14b: cancelados=% (esperado 2: filho do culto futuro e paralelo)', r->>'eventosCancelados'; end if;
  insert into app.church_events (church_id, name, event_type, starts_at, status) values (v_ch, 'Culto T14', 'Culto', now() + interval '8 days', 'planned') returning id into v_e1;
  if exists (select 1 from app.church_events where parent_event_id = v_e1) then raise exception 'FALHOU T14c: ministerio inativo gerou filho'; end if;
  v_res := v_res || 'T14 ok; ';

  -- T15 REVERTER: primeiro aborta (há ministério); depois, sem os dados de teste, volta tudo
  reset role;
  begin
    if exists (select 1 from app.ministries) then
      raise exception 'KIDS_1 REVERTER ABORTADO: ja existem ministerios cadastrados. Nada foi alterado.';
    end if;
    raise exception 'FALHOU T15a';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm not like 'KIDS_1 REVERTER ABORTADO%' then raise exception 'FALHOU T15a: %', sqlerrm; end if;
  end;
  alter table app.church_events disable trigger trg_v39_trava_evento;
  delete from app.ministry_member_functions where membership_id in (select id from app.ministry_memberships where church_id = v_ch);
  delete from app.ministry_memberships where church_id = v_ch;
  delete from app.ministry_functions where ministry_id = v_kids;
  delete from app.church_events where church_id = v_ch and ministry_id is not null;
  delete from app.ministries where church_id = v_ch;
  alter table app.church_events enable trigger trg_v39_trava_evento;

  -- REVERTER (identico ao _reverter, sem begin/commit)
do $g$
begin
  if exists (select 1 from app.ministries) then
    raise exception 'KIDS_1 REVERTER ABORTADO: ja existem ministerios cadastrados. Nada foi alterado.';
  end if;
  if exists (select 1 from app.church_events where ministry_id is not null) then
    raise exception 'KIDS_1 REVERTER ABORTADO: ja existem eventos de ministerio. Nada foi alterado.';
  end if;
end $g$;

drop function if exists app.v39_min_people_search(uuid, uuid, text);
drop function if exists app.v39_min_event_save(uuid, jsonb);
drop function if exists app.v39_min_events(uuid, uuid, date, date);
drop function if exists app.v39_min_member_set(uuid, jsonb);
drop function if exists app.v39_min_members(uuid, uuid, boolean);
drop function if exists app.v39_min_function_save(uuid, jsonb);
drop function if exists app.v39_min_save(uuid, jsonb);
drop function if exists app.v39_min_list(uuid);
drop function if exists private.v39_min_ensure_member(app.ministries, uuid, text);
drop function if exists private.v39_min_person_ok(uuid, uuid);
drop function if exists private.v39_min_backfill(uuid);
drop function if exists private.v39_min_person_name(app.people);
drop function if exists private.v39_min_hist(uuid, text, uuid, text, text, text, text, jsonb);
drop function if exists private.v39_min_need(uuid, uuid, text);
drop function if exists private.v39_min_role(uuid, uuid);

drop trigger if exists trg_v39_min_sync_children on app.church_events;
drop trigger if exists trg_v39_min_event_ctx on app.church_events;
drop function if exists private.v39_min_sync_children();
drop function if exists private.v39_min_event_ctx();
drop function if exists private.v39_min_is_culto(text);

drop index if exists app.church_events_ministry_idx;
drop index if exists app.church_events_ministry_child_unique_idx;
alter table app.church_events drop constraint if exists church_events_parent_not_self;
alter table app.church_events drop constraint if exists church_events_parent_needs_ministry;
alter table app.church_events drop column if exists parent_event_id;
alter table app.church_events drop column if exists ministry_id;

drop index if exists app.ministries_name_open_unique_idx;
alter table app.ministries drop constraint if exists ministries_max_age_check;
alter table app.ministries drop constraint if exists ministries_kind_check;
alter table app.ministries drop column if exists max_age_years;
alter table app.ministries drop column if exists follows_church_services;
alter table app.ministries drop column if exists kind;

-- antes do KIDS_1 o pastor não tinha nenhuma permissão ministries.* (conferido em 23/11/2026)
delete from app.profile_permissions pp
 using app.access_profiles ap, app.permissions p
 where pp.profile_id = ap.id and pp.permission_id = p.id and ap.code = 'pastor' and p.code like 'ministries.%';


  if exists (select 1 from information_schema.columns where table_schema = 'app' and table_name in ('church_events','ministries')
              and column_name in ('ministry_id','parent_event_id','kind','follows_church_services','max_age_years')) then
    raise exception 'FALHOU T15b: colunas ficaram'; end if;
  if exists (select 1 from pg_proc where proname like 'v39_min\_%') then raise exception 'FALHOU T15c: funcoes ficaram'; end if;
  if exists (select 1 from app.profile_permissions pp join app.access_profiles ap on ap.id = pp.profile_id join app.permissions p on p.id = pp.permission_id
              where ap.code = 'pastor' and p.code like 'ministries.%') then raise exception 'FALHOU T15d: permissoes do pastor ficaram'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  begin
    set local role authenticated;
    perform app.v39_save_church_event(v_ch, null, jsonb_build_object('name', 'Culto pos reverter', 'event_type', 'Culto', 'starts_at', now() + interval '9 days'));
    reset role;
  exception when others then reset role; raise exception 'FALHOU T15e: % %', sqlstate, sqlerrm;
  end;
  v_res := v_res || 'T15 ok (REVERTER ok)';

  raise exception 'TESTE KIDS_1 CONCLUIDO (nada foi gravado): %', v_res;
end
$t$;
