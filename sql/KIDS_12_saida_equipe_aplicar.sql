-- =====================================================================
-- KIDS_12 · Saída da equipe tira das escalas futuras do Kids · APLICAR
-- 28/11/2026 · pedido do Diogo: botão para retirar professor/voluntário do ministério.
-- Hoje, encerrar ou pausar a participação (v39_min_member_set) NÃO mexia na escala: a pessoa seguia escalada nos
-- próximos cultos. Este gatilho, em qualquer caminho que mude a participação para 'ended' ou 'paused':
--   - retira a pessoa das salas de eventos FUTUROS do mesmo ministério (status 'removed', com motivo; nada é apagado);
--   - cancela trocas abertas em que ela pede ou recebe;
--   - avisa a pessoa no app (kids_escala_removida).
-- Eventos passados ou em andamento ficam como estão (histórico).
-- Requer KIDS_4. Reverter: KIDS_12_saida_equipe_reverter.sql
-- =====================================================================
begin;

-- KIDS12-BODY-BEGIN
do $g$
begin
  if to_regclass('app.kids_staff_transfers') is null then
    raise exception 'KIDS_12 ABORTADO: KIDS_4 nao aplicado. Nada foi alterado.';
  end if;
end $g$;

create or replace function private.v39_kids_membership_exit() returns trigger
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare s record; v_n integer := 0; v_motivo text;
begin
  if new.status not in ('ended','paused') or old.status = new.status then return new; end if;
  v_motivo := left('Saiu da equipe (' || case new.status when 'ended' then 'participação encerrada' else 'participação pausada' end || ')', 500);
  for s in
    select st.id, st.church_id, r.name sala, e.id ev, e.name evento, e.starts_at
      from app.kids_event_room_staff st
      join app.kids_event_rooms r on r.id = st.event_room_id
      join app.church_events e on e.id = r.event_id
     where st.person_id = new.person_id and st.status = 'active' and e.ministry_id = new.ministry_id
       and e.starts_at > now() and e.status not in ('completed','cancelled')
  loop
    update app.kids_event_room_staff set status = 'removed', removed_at = now(), removed_reason = v_motivo where id = s.id;
    update app.kids_staff_transfers set status = 'cancelled', cancelled_at = now() where staff_id = s.id and status in ('pending_target','pending_leader');
    v_n := v_n + 1;
  end loop;
  update app.kids_staff_transfers t set status = 'cancelled', cancelled_at = now()
    from app.kids_event_room_staff st join app.kids_event_rooms r on r.id = st.event_room_id join app.church_events e on e.id = r.event_id
   where t.staff_id = st.id and t.to_person_id = new.person_id and t.status in ('pending_target','pending_leader') and e.ministry_id = new.ministry_id;
  if v_n > 0 then
    perform private.v39_notify(new.church_id, new.person_id, 'kids_escala_removida', 'Você saiu das escalas do Kids',
                               'Sua participação na equipe foi ' || case new.status when 'ended' then 'encerrada' else 'pausada' end || ': ' || v_n || ' escala(s) futura(s) foram retiradas.',
                               'ministry_memberships', new.id, jsonb_build_object('ministry_id', new.ministry_id, 'escalas', v_n));
    perform private.v39_kids_audit(new.church_id, 'status_change', 'kids_staff_removed_by_exit', 'ministry_memberships', new.id, new.person_id, 'standard', v_motivo,
                                   jsonb_build_object('ministry_id', new.ministry_id, 'escalas', v_n, 'status', new.status));
  end if;
  return new;
end $f$;
revoke all on function private.v39_kids_membership_exit() from public;

drop trigger if exists trg_v39_kids_membership_exit on app.ministry_memberships;
create trigger trg_v39_kids_membership_exit after update of status on app.ministry_memberships
  for each row when (new.status in ('ended','paused') and old.status is distinct from new.status)
  execute function private.v39_kids_membership_exit();
-- KIDS12-BODY-END

commit;

-- VERIFICACAO (deve dar true)
select exists (select 1 from pg_trigger where tgname = 'trg_v39_kids_membership_exit' and not tgisinternal) as gatilho_saida;
