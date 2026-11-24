-- =====================================================================
-- KIDS_6 · Criança em um só culto/sala no mesmo dia e horário · APLICAR
-- 24/11/2026 · pedido do Diogo (chat): "uma criança não pode ser associada a mais de um culto ou sala no mesmo dia e horário".
-- VALIDACAO: ver cabecalho de KIDS_6_conflito_teste_rollback.sql
--
-- O que já existia: uma entrada por criança por evento (índice único) e uma sala por entrada (coluna única).
-- O que faz: gatilho BEFORE INSERT em app.kids_checkins recusa (KIDS_CHECKIN_CONFLICT) a entrada quando a criança
--   a) ainda está na sala de outro evento (entrada "na sala", sem retirada), ou
--   b) já tem entrada (não cancelada) em outro evento cujo horário se sobrepõe a este
--      (horário do evento = início até o fim; sem fim, 3 horas).
--   Um lock por criança evita duas entradas simultâneas em aparelhos diferentes.
-- Vale para qualquer caminho de gravação (RPC ou futuro). Não muda nenhuma função existente.
-- Reverter: KIDS_6_conflito_reverter.sql
-- =====================================================================
begin;

-- KIDS6-BODY-BEGIN
do $g$
begin
  if to_regclass('app.kids_checkins') is null then
    raise exception 'KIDS_6 ABORTADO: KIDS_3 nao aplicado. Nada foi alterado.';
  end if;
  if exists (select 1 from pg_trigger where tgrelid = 'app.kids_checkins'::regclass and tgname = 'trg_v39_kids_checkin_conflict') then
    raise exception 'KIDS_6 ABORTADO: gatilho ja existe (KIDS_6 ja aplicado?). Nada foi alterado.';
  end if;
end $g$;

create or replace function private.v39_kids_event_end(e app.church_events) returns timestamptz
language sql immutable set search_path = pg_catalog, app as $f$
  select coalesce(e.ends_at, e.starts_at + interval '3 hours')
$f$;

create or replace function private.v39_kids_checkin_conflict() returns trigger
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare ne app.church_events; v_nome text;
begin
  if new.status <> 'present' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('kids_checkin:' || new.child_person_id::text, 0));
  select * into ne from app.church_events where id = new.event_id;
  select e.name into v_nome
    from app.kids_checkins c join app.church_events e on e.id = c.event_id
   where c.child_person_id = new.child_person_id and c.church_id = new.church_id
     and c.event_id <> new.event_id and c.status <> 'cancelled'
     and (c.status = 'present'
          or (e.starts_at < private.v39_kids_event_end(ne) and ne.starts_at < private.v39_kids_event_end(e)))
   order by (c.status = 'present') desc, c.checked_in_at desc
   limit 1;
  if v_nome is not null then
    perform app.raise_domain_error('KIDS_CHECKIN_CONFLICT', 'A crianca ja esta em outro culto/evento no mesmo horario: ' || v_nome,
                                   jsonb_build_object('evento', v_nome));
  end if;
  return new;
end $f$;

create trigger trg_v39_kids_checkin_conflict before insert on app.kids_checkins
  for each row execute function private.v39_kids_checkin_conflict();

revoke all on function private.v39_kids_event_end(app.church_events) from public;
revoke all on function private.v39_kids_checkin_conflict() from public;
-- KIDS6-BODY-END

commit;

-- VERIFICACAO (deve dar tudo true)
select
  (select count(*) = 1 from pg_trigger where tgrelid = 'app.kids_checkins'::regclass and tgname = 'trg_v39_kids_checkin_conflict') as gatilho,
  (select count(*) = 2 from pg_proc where proname in ('v39_kids_event_end','v39_kids_checkin_conflict')) as funcoes;
