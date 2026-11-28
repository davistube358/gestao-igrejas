-- =====================================================================
-- KIDS_11 · Agenda do Kids em cards: resumo da escala por evento · APLICAR
-- 28/11/2026 · pedido do Diogo: agenda do culto com a escala visível (líder e voluntário), no estilo
--   "data · nome · hora · fotos de quem está escalado · confirmados/total · alerta de quem não respondeu".
-- Só LEITURA: não cria salas nem grava nada (a v39_kids_event_rooms copia as salas padrão ao abrir; esta não).
-- Permissão: equipe do Kids (voluntário, líder) ou admin da igreja, via private.v39_kids_need(..., 'volunteer').
-- Requer KIDS_4. Reverter: KIDS_11_agenda_escala_reverter.sql
-- =====================================================================
begin;

-- KIDS11-BODY-BEGIN
do $g$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'app' and table_name = 'kids_event_room_staff' and column_name = 'response_status') then
    raise exception 'KIDS_11 ABORTADO: KIDS_4 nao aplicado. Nada foi alterado.';
  end if;
end $g$;

create or replace function app.v39_kids_schedule_summary(p_church_id uuid, p_ministry_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare
  m app.ministries; v_me uuid := app.current_user_account_id(); v_pes uuid;
begin
  m := private.v39_kids_need(p_church_id, p_ministry_id, 'volunteer');
  select person_id into v_pes from app.user_accounts where id = v_me;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'eventoId', e.id,
             'salas', (select count(*) from app.kids_event_rooms r where r.event_id = e.id and r.status = 'open'),
             'salasSemProfessor', (select count(*) from app.kids_event_rooms r where r.event_id = e.id and r.status = 'open'
                                     and not exists (select 1 from app.kids_event_room_staff s where s.event_room_id = r.id and s.status = 'active')),
             'total', coalesce(x.total, 0), 'confirmados', coalesce(x.conf, 0), 'recusados', coalesce(x.rec, 0), 'pendentes', coalesce(x.pend, 0),
             'semResposta24h', coalesce(x.pend, 0) > 0 and e.starts_at - now() < interval '24 hours' and e.starts_at > now(),
             'trocas', coalesce(x.trocas, 0),
             'euEscalado', coalesce(x.eu, false),
             'escalados', coalesce(x.lista, '[]'::jsonb)) order by e.starts_at)
      from app.church_events e
      left join lateral (
        select count(*) total,
               count(*) filter (where s.response_status = 'confirmed') conf,
               count(*) filter (where s.response_status = 'declined') rec,
               count(*) filter (where s.response_status = 'pending') pend,
               count(*) filter (where exists (select 1 from app.kids_staff_transfers t where t.staff_id = s.id and t.status in ('pending_target','pending_leader'))) trocas,
               bool_or(s.person_id = v_pes) eu,
               jsonb_agg(jsonb_build_object('pessoaId', s.person_id, 'nome', coalesce(nullif(btrim(p.preferred_name), ''), p.full_name),
                                            'resposta', s.response_status, 'funcao', s.staff_role, 'sala', r.name,
                                            'temFoto', p.photo_file_id is not null, 'eu', s.person_id = v_pes)
                         order by case s.response_status when 'confirmed' then 0 when 'pending' then 1 else 2 end, p.full_name) lista
          from app.kids_event_rooms r
          join app.kids_event_room_staff s on s.event_room_id = r.id and s.status = 'active'
          join app.people p on p.id = s.person_id
         where r.event_id = e.id and r.status = 'open'
      ) x on true
     where e.church_id = p_church_id and e.ministry_id = m.id
       and e.starts_at > now() - interval '30 days' and e.starts_at < now() + interval '90 days'), '[]'::jsonb);
end $f$;

revoke all on function app.v39_kids_schedule_summary(uuid, uuid) from public, anon;
grant execute on function app.v39_kids_schedule_summary(uuid, uuid) to authenticated;
-- KIDS11-BODY-END

commit;
notify pgrst, 'reload schema';

-- VERIFICACAO (deve dar tudo true)
select
  (select count(*) = 1 from pg_proc where pronamespace = 'app'::regnamespace and proname = 'v39_kids_schedule_summary'
      and has_function_privilege('authenticated', oid, 'execute') and not has_function_privilege('anon', oid, 'execute')) as resumo_escala,
  (select provolatile = 's' from pg_proc where pronamespace = 'app'::regnamespace and proname = 'v39_kids_schedule_summary') as somente_leitura;
