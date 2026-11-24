-- =====================================================================
-- KIDS_3 · Entrada da criança, código, etiqueta e entrega · REVERTER
-- Desfaz o KIDS_3_entrada_aplicar.sql. Para usar logo após aplicar, se algo der errado.
-- ABORTA (sem alterar nada) se já existir qualquer entrada do Kids: os registros são da igreja
-- e não podem ser descartados — decidir com o Diogo (nada é apagado).
-- =====================================================================
begin;

-- KIDS3-REVERTER-BEGIN
do $g$
begin
  if exists (select 1 from app.kids_checkins) then
    raise exception 'KIDS_3 REVERTER ABORTADO: ja existem entradas do Kids. Nada foi alterado.';
  end if;
end $g$;

drop function if exists app.v39_kids_culto_counts(uuid, uuid[]);
drop function if exists app.v39_kids_board(uuid, uuid, uuid);
drop function if exists app.v39_kids_checkin_cancel(uuid, jsonb);
drop function if exists app.v39_kids_checkout(uuid, jsonb);
drop function if exists app.v39_kids_checkin_find(uuid, uuid, uuid, text);
drop function if exists app.v39_kids_checkin(uuid, jsonb);
drop function if exists private.v39_kids_checkin_json(app.kids_checkins);
drop function if exists private.v39_kids_pickup_people(uuid, uuid);
drop function if exists private.v39_kids_code_match(text, text);
drop function if exists private.v39_kids_event_ok(uuid, uuid, uuid);
drop table if exists app.kids_checkins;
drop function if exists private.v39_kids_checkin_guard();
-- KIDS3-REVERTER-END

commit;
notify pgrst, 'reload schema';

-- VERIFICACAO (deve dar tudo true)
select
  (select to_regclass('app.kids_checkins') is null) as tabela_removida,
  (select count(*) = 0 from pg_proc where proname in ('v39_kids_checkin','v39_kids_checkin_find','v39_kids_checkout','v39_kids_checkin_cancel',
                                                     'v39_kids_board','v39_kids_culto_counts','v39_kids_checkin_guard','v39_kids_event_ok',
                                                     'v39_kids_code_match','v39_kids_pickup_people','v39_kids_checkin_json')) as funcoes_removidas;
