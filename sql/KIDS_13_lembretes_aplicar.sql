-- =====================================================================
-- KIDS_13 · Lembretes da escala do Kids: 24 h, 12 h e 2 h antes · APLICAR
-- 28/11/2026 · pedido do Diogo: depois de aceitar a escala, o lembrete sai da tela principal e vai para os avisos,
--   com avisos faltando 24 h, 12 h e 2 h para o culto.
-- O que faz:
--   - private.v39_kids_schedule_reminders(): para cada professor escalado (ativo) em evento futuro do Kids, grava UM aviso
--     por faixa: 24 h (de 24 h a 12 h antes), 12 h (de 12 h a 2 h) e 2 h (últimas 2 h). Quem entra na escala já dentro de
--     uma faixa recebe só o aviso daquela faixa. Confirmado: "Lembrete"; aguardando: "Responda sua escala"; "não posso": nada.
--     Não repete (confere app.notifications pela escala + faixa).
--   - liga a extensão pg_cron (já disponível no Supabase) e agenda a função a cada 10 minutos (job v39-kids-lembretes).
-- Depois, o mesmo ponto pode disparar o WhatsApp automático pela API.
-- Requer KIDS_4. Reverter: KIDS_13_lembretes_reverter.sql
-- =====================================================================
begin;

-- KIDS13-BODY-BEGIN
do $g$
begin
  if to_regclass('app.kids_staff_transfers') is null then
    raise exception 'KIDS_13 ABORTADO: KIDS_4 nao aplicado. Nada foi alterado.';
  end if;
end $g$;

create index if not exists notifications_source_idx on app.notifications (source_id, notification_type);

create or replace function private.v39_kids_schedule_reminders() returns integer
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare x record; v_n integer := 0; v_falta text;
begin
  for x in
    select s.id, s.church_id, s.person_id, s.staff_role, s.response_status, r, e,
           case when e.starts_at - now() <= interval '2 hours' then 2 when e.starts_at - now() <= interval '12 hours' then 12 else 24 end janela
      from app.kids_event_room_staff s
      join app.kids_event_rooms r on r.id = s.event_room_id
      join app.church_events e on e.id = r.event_id
     where s.status = 'active' and s.response_status in ('confirmed','pending') and r.status = 'open'
       and e.status not in ('completed','cancelled') and e.starts_at > now() and e.starts_at <= now() + interval '24 hours'
  loop
    if exists (select 1 from app.notifications n where n.source_id = x.id and n.notification_type = 'kids_lembrete' and n.metadata->>'janela' = x.janela::text) then
      continue;
    end if;
    v_falta := case x.janela when 2 then 'menos de 2 h' when 12 then 'menos de 12 h' else 'menos de 24 h' end;
    perform private.v39_notify(x.church_id, x.person_id, 'kids_lembrete',
              case when x.response_status = 'confirmed' then 'Lembrete: você serve no Kids em ' || v_falta else 'Responda sua escala do Kids (culto em ' || v_falta || ')' end,
              'Sala ' || private.v39_kids_staff_label(x.r, x.e) || ' (' || x.staff_role || ').' ||
              case when x.response_status = 'confirmed' then ' Até lá!' else ' Confirme ou avise que não pode em "Minhas escalas".' end,
              'kids_event_room_staff', x.id, jsonb_build_object('janela', x.janela, 'event_id', (x.e).id, 'resposta', x.response_status),
              case when x.janela = 2 or x.response_status = 'pending' then 'high' else 'normal' end);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $f$;
revoke all on function private.v39_kids_schedule_reminders() from public;

create extension if not exists pg_cron;
do $c$
begin
  if exists (select 1 from cron.job where jobname = 'v39-kids-lembretes') then perform cron.unschedule('v39-kids-lembretes'); end if;
  perform cron.schedule('v39-kids-lembretes', '*/10 * * * *', 'select private.v39_kids_schedule_reminders()');
end $c$;
-- KIDS13-BODY-END

commit;

-- VERIFICACAO (deve dar tudo true)
select
  (select count(*) = 1 from cron.job where jobname = 'v39-kids-lembretes' and active) as job_agendado,
  (select count(*) = 1 from pg_proc where proname = 'v39_kids_schedule_reminders') as funcao_lembretes;
