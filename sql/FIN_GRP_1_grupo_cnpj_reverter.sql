-- =====================================================================
-- FIN_GRP_1 · Financeiro do grupo (matriz + filiais) · REVERTER
-- Remove as funções novas e devolve app.v39_fin_reverse_movement ao corpo anterior.
-- Lançamentos de repasse já feitos ficam (são transferências neutras; o estorno pelo app exigirá o FIN_GRP_1 de volta).
-- Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

drop function if exists app.v39_fin_group_report(uuid, integer, integer);
drop function if exists app.v39_fin_repasses(uuid, integer, integer);
drop function if exists app.v39_fin_repasse_reverse(uuid, uuid, text);
drop function if exists app.v39_fin_repasse(uuid, jsonb);
drop function if exists app.v39_fin_group_info(uuid);
drop function if exists private.v39_fin_group(uuid);

create or replace function app.v39_fin_reverse_movement(p_church_id uuid, p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_me uuid := private.v39_fin_me(); m record; v_r text := private.v39_fin_reason(p_reason); v_new uuid;
begin
  perform private.v39_fin_need(p_church_id, 'financial.movements.reverse');
  perform private.v39_fin_need_treasury(p_church_id);
  select * into m from app.financial_movements where id = p_id and church_id = p_church_id;
  if m.id is null then perform app.raise_domain_error('FIN_NOT_FOUND', 'Lancamento nao encontrado'); end if;
  if m.status not in ('posted','reconciled') or m.movement_type = 'reversal' then
    perform app.raise_domain_error('FIN_NOT_REVERSIBLE', 'Este lancamento nao pode ser estornado'); end if;
  if m.transfer_id is not null
     or exists (select 1 from app.financial_expense_payments where financial_movement_id = p_id)
     or exists (select 1 from app.financial_commitment_receipts where financial_movement_id = p_id)
     or exists (select 1 from app.financial_source_batch_items where financial_movement_id = p_id)
     or exists (select 1 from app.financial_card_purchases where financial_movement_id = p_id) then
    perform app.raise_domain_error('FIN_REVERSE_AT_ORIGIN', 'Estorne pela tela de origem (despesa, compromisso, lote ou transferencia)'); end if;
  v_new := app.reverse_financial_movement(p_id, v_me, v_r);
  return jsonb_build_object('id', v_new);
end $f$;

commit;

notify pgrst, 'reload schema';
