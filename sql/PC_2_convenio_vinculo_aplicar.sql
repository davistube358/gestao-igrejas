-- =====================================================================
-- PC_2 · Despesa/entrada vinculada ao convênio + contas finais no plano modelo · APLICAR
-- 28/11/2026 · DATA · pedido do Diogo
-- VALIDACAO: rode antes PC_2_convenio_vinculo_teste_rollback.sql (deve terminar em "TESTE PC_2 CONCLUIDO (nada foi gravado)").
-- Requer o PC_1 aplicado.
-- ---------------------------------------------------------------------
-- Pedido: ao lançar a despesa, informar que a verba sai do convênio. E as contas novas não apareciam ao lançar:
--   o plano modelo só criava GRUPOS (que por regra não recebem lançamento) e os grupos 3.3, 4.1 e 4.4 ficavam vazios.
-- Regras:
--   - A conta bancária do convênio continua sendo a fonte do recebido/gasto/saldo (Lei 13.019/14, art. 51).
--   - O VÍNCULO declara que a despesa (ou a entrada) é do convênio: entra no "comprometido" e na prestação de contas;
--     se for paga/recebida por outra conta bancária, aparece como divergência (vinculo_fora_da_conta).
--   - Um convênio por despesa/entrada. Trocar ou retirar exige motivo; nada é apagado (status 'removed' + histórico).
--   - Despesa cancelada/recusada/estornada não recebe vínculo; convênio precisa estar em execução ou em prestação de
--     contas e ser do mesmo CNPJ (Igreja x Instituto) da despesa.
--   - Conta contábil fora das contas do convênio não bloqueia: a função devolve contaForaDoConvenio para a tela avisar.
-- Estrutura nova: tabela app.v39_fin_grant_items (RLS ligada, sem acesso direto).
-- RPCs novas: app.v39_fin_grant_link(church, p), app.v39_fin_grant_items_map(church).
-- Funções do PC-1 alteradas (create or replace; assinatura e grants iguais; só ACRESCENTAM campos):
--   private.v39_fin_grant_diverg, app.v39_fin_grants_list, private.v39_fin_grant_report__d5raw, app.v39_fin_plano_modelo
--   (agora cria também 6 contas finais: 3.3.01, 3.3.02, 4.1.01, 4.1.02, 4.4.01, 4.5.02 — códigos [CONFIRMAR] com o contador).
-- Depois de aplicar: em Cadastros, clique de novo em "Criar plano de contas modelo" para criar as contas finais
--   (a igreja que já tem os grupos recebe só as contas que faltam).
-- Reverter: PC_2_convenio_vinculo_reverter.sql. Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

-- ===================== 1. ESTRUTURA =====================
-- despesa ou entrada cuja verba sai/entra pelo convênio (um convênio por item). Nada é apagado: trocar/retirar = status 'removed' com motivo.
create table if not exists app.v39_fin_grant_items (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references app.churches(id) on update restrict on delete restrict,
  grant_id uuid not null references app.v39_fin_grants(id) on update restrict on delete restrict,
  expense_id uuid references app.financial_expenses(id) on update restrict on delete restrict,
  movement_id uuid references app.financial_movements(id) on update restrict on delete restrict,
  status text not null default 'active' check (status in ('active', 'removed')),
  created_at timestamptz not null default now(),
  created_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict,
  removed_at timestamptz,
  removed_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict,
  removal_reason text,
  constraint v39_fin_grant_items_one_ck check ((expense_id is null) <> (movement_id is null)),
  constraint v39_fin_grant_items_removed_ck check ((status = 'removed') = (removed_at is not null)));
create unique index if not exists v39_fin_grant_items_exp_uq on app.v39_fin_grant_items (expense_id) where status = 'active' and expense_id is not null;
create unique index if not exists v39_fin_grant_items_mov_uq on app.v39_fin_grant_items (movement_id) where status = 'active' and movement_id is not null;
create index if not exists v39_fin_grant_items_grant_idx on app.v39_fin_grant_items (grant_id) where status = 'active';
alter table app.v39_fin_grant_items enable row level security;
revoke all on app.v39_fin_grant_items from public, anon, authenticated;

-- ===================== 2. VÍNCULO (RPCs novas) =====================
-- p: { convenioId (vazio = não é de convênio), despesaId | lancamentoId (entrada), motivo (obrigatório ao trocar ou retirar) }
create or replace function app.v39_fin_grant_link(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_me uuid := private.v39_fin_me(); v_grant uuid := private.v39_fin_uuid(p, 'convenioId');
  v_exp uuid := private.v39_fin_uuid(p, 'despesaId'); v_mov uuid := private.v39_fin_uuid(p, 'lancamentoId');
  v_mot text := nullif(btrim(coalesce(p->>'motivo', '')), ''); v_atual uuid; v_ent uuid; v_cat uuid; v_st text; v_ok boolean;
  g record; v_ramo uuid[]; v_fora boolean := false;
begin
  if (v_exp is null) = (v_mov is null) then perform app.raise_domain_error('FIN_NOT_FOUND', 'Informe a despesa ou o lancamento'); end if;
  if v_exp is not null then
    v_ok := private.v39_fin_has(p_church_id, 'financial.expenses.create') or private.v39_fin_has(p_church_id, 'financial.expenses.approve') or private.v39_fin_has(p_church_id, 'financial.accounts.manage');
  else
    v_ok := private.v39_fin_has(p_church_id, 'financial.movements.create') or private.v39_fin_has(p_church_id, 'financial.accounts.manage');
  end if;
  if v_me is null or not v_ok then perform app.raise_domain_error('PERMISSION_DENIED', 'Sem permissao para vincular ao convenio'); end if;
  if v_exp is not null then
    select e.entity_id, e.category_id, e.status into v_ent, v_cat, v_st from app.financial_expenses e where e.id = v_exp and e.church_id = p_church_id;
    if v_st is null then perform app.raise_domain_error('FIN_NOT_FOUND', 'Despesa nao encontrada'); end if;
    if v_grant is not null and v_st in ('cancelled', 'rejected', 'reversed') then perform app.raise_domain_error('FIN_NOT_EDITABLE', 'Despesa cancelada, recusada ou estornada'); end if;
    select gi.grant_id into v_atual from app.v39_fin_grant_items gi where gi.expense_id = v_exp and gi.status = 'active';
  else
    select a.entity_id, m.category_id, m.status into v_ent, v_cat, v_st
      from app.financial_movements m join app.financial_accounts a on a.id = m.account_id
     where m.id = v_mov and m.church_id = p_church_id and m.movement_type = 'income';
    if v_st is null then perform app.raise_domain_error('FIN_NOT_FOUND', 'Entrada nao encontrada'); end if;
    if v_grant is not null and v_st not in ('posted', 'reconciled') then perform app.raise_domain_error('FIN_NOT_EDITABLE', 'Entrada estornada ou cancelada'); end if;
    select gi.grant_id into v_atual from app.v39_fin_grant_items gi where gi.movement_id = v_mov and gi.status = 'active';
  end if;
  if v_atual is not distinct from v_grant then return jsonb_build_object('ok', true, 'mudou', false); end if;
  if v_grant is not null then
    select * into g from app.v39_fin_grants where id = v_grant and church_id = p_church_id;
    if g.id is null then perform app.raise_domain_error('GRANT_INVALID', 'Convenio nao encontrado'); end if;
    if g.status not in ('active', 'reporting') then perform app.raise_domain_error('GRANT_NOT_ACTIVE', 'Convenio fora de execucao'); end if;
    if g.entity_id is distinct from v_ent then perform app.raise_domain_error('GRANT_ENTITY', 'Convenio de outro CNPJ'); end if;
  end if;
  if v_atual is not null then
    if v_mot is null or length(v_mot) < 5 then perform app.raise_domain_error('REASON_REQUIRED', 'Informe o motivo para trocar ou retirar o convenio'); end if;
    update app.v39_fin_grant_items set status = 'removed', removed_at = now(), removed_by_user_account_id = v_me, removal_reason = v_mot
     where status = 'active' and ((v_exp is not null and expense_id = v_exp) or (v_mov is not null and movement_id = v_mov));
  end if;
  if v_grant is not null then
    insert into app.v39_fin_grant_items (church_id, grant_id, expense_id, movement_id, created_by_user_account_id)
    values (p_church_id, v_grant, v_exp, v_mov, v_me);
    v_ramo := private.v39_fin_grant_ramo(v_grant);
    v_fora := cardinality(v_ramo) > 0 and not (v_cat = any (v_ramo));
  end if;
  if v_exp is not null then
    insert into app.financial_expense_history (church_id, entity_type, entity_id, action, performed_by_user_account_id, reason, occurred_at, metadata)
    values (p_church_id, 'expense', v_exp, 'v39_grant_link', v_me, v_mot, now(), jsonb_build_object('convenioAnterior', v_atual, 'convenio', v_grant));
  else
    insert into app.financial_history (church_id, entity_type, entity_id, action, performed_by_user_account_id, occurred_at, metadata)
    values (p_church_id, 'movement', v_mov, 'v39_grant_link', v_me, now(), jsonb_build_object('convenioAnterior', v_atual, 'convenio', v_grant, 'motivo', v_mot));
  end if;
  return jsonb_build_object('ok', true, 'mudou', true, 'contaForaDoConvenio', v_fora);
end $f$;

-- mapa dos vínculos ativos da visão atual (Igreja ou Instituto): { despesas: {id: convenioId}, lancamentos: {id: convenioId} }
create or replace function app.v39_fin_grant_items_map(p_church_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
begin
  if not exists (select 1 from app.permissions pm where pm.code like 'financial.%' and private.v39_fin_has(p_church_id, pm.code)) then
    perform app.raise_domain_error('PERMISSION_DENIED', 'Sem acesso ao Financeiro'); end if;
  return jsonb_build_object(
    'despesas', coalesce((select jsonb_object_agg(gi.expense_id::text, gi.grant_id) from app.v39_fin_grant_items gi join app.v39_fin_grants g on g.id = gi.grant_id
       where gi.church_id = p_church_id and gi.status = 'active' and gi.expense_id is not null and g.entity_id is not distinct from private.v39_fin_target_entity()), '{}'::jsonb),
    'lancamentos', coalesce((select jsonb_object_agg(gi.movement_id::text, gi.grant_id) from app.v39_fin_grant_items gi join app.v39_fin_grants g on g.id = gi.grant_id
       where gi.church_id = p_church_id and gi.status = 'active' and gi.movement_id is not null and g.entity_id is not distinct from private.v39_fin_target_entity()), '{}'::jsonb));
end $f$;

-- ===================== 3. FUNÇÕES DO PC-1 AMPLIADAS =====================
-- movimentos que pertencem ao convênio por VÍNCULO: entrada vinculada + pagamentos efetivados de despesa vinculada
create or replace function private.v39_fin_grant_movs(p_grant uuid) returns uuid[]
language sql stable security definer set search_path = pg_catalog, app as $f$
  select coalesce(array_agg(x.id), '{}'::uuid[]) from (
    select gi.movement_id id from app.v39_fin_grant_items gi where gi.grant_id = p_grant and gi.status = 'active' and gi.movement_id is not null
    union
    select ep.financial_movement_id from app.v39_fin_grant_items gi join app.financial_expense_payments ep on ep.expense_id = gi.expense_id
     where gi.grant_id = p_grant and gi.status = 'active' and ep.status = 'posted' and ep.financial_movement_id is not null) x
$f$;

-- divergências: + 'vinculo_fora_da_conta' (despesa/entrada vinculada que passou por outra conta bancária); o que está vinculado não conta como "conta de fora"
create or replace function private.v39_fin_grant_diverg(p_grant uuid, p_de date default null, p_ate date default null)
returns table (movement_id uuid, tipo text)
language sql stable security definer set search_path = pg_catalog, app, private as $f$
  with g as (select g.id, g.church_id, g.account_id, coalesce(p_de, g.start_on, date '2000-01-01') de, coalesce(p_ate, g.end_on, current_date) ate,
                    private.v39_fin_grant_ramo(g.id) ramo, private.v39_fin_grant_movs(g.id) vinc
               from app.v39_fin_grants g where g.id = p_grant)
  select m.id, 'fora_da_conta'::text from app.financial_movements m, g
   where cardinality(g.ramo) > 0 and m.church_id = g.church_id and m.category_id = any (g.ramo) and m.account_id is distinct from g.account_id
     and not (m.id = any (g.vinc))
     and m.status in ('posted', 'reconciled') and m.movement_type in ('income', 'expense') and m.movement_date between g.de and g.ate
  union all
  select m.id, 'conta_fora_do_convenio'::text from app.financial_movements m, g
   where cardinality(g.ramo) > 0 and g.account_id is not null and m.account_id = g.account_id and not (m.category_id = any (g.ramo))
     and not (m.id = any (g.vinc))
     and m.status in ('posted', 'reconciled') and m.movement_type in ('income', 'expense') and m.movement_date between g.de and g.ate
  union all
  select m.id, 'vinculo_fora_da_conta'::text from app.financial_movements m, g
   where m.id = any (g.vinc) and m.account_id is distinct from g.account_id
     and m.status in ('posted', 'reconciled') and m.movement_date between g.de and g.ate
$f$;

-- lista: + comprometido (despesas vinculadas não canceladas) e disponível (valor do convênio − comprometido)
create or replace function app.v39_fin_grants_list(p_church_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare v_ok text[] := array['posted','reconciled','reversed'];
begin
  if not (private.v39_fin_has(p_church_id, 'financial.book.view') or private.v39_fin_has(p_church_id, 'financial.reports.view')) then perform app.raise_domain_error('PERMISSION_DENIED', 'Sem permissao'); end if;
  return coalesce((select jsonb_agg(x.o order by x.start_on desc nulls last, x.grantor_name) from (
    select g.start_on, g.grantor_name, jsonb_build_object('id', g.id, 'origem', g.source_kind, 'instrumento', g.instrument, 'concedente', g.grantor_name, 'documento', coalesce(g.grantor_document, ''),
      'numero', coalesce(g.number, ''), 'objeto', g.object, 'inicio', g.start_on, 'fim', g.end_on, 'valor', g.amount, 'contrapartida', g.counterpart_amount, 'contaId', g.account_id,
      'conta', a.name, 'status', g.status, 'obs', coalesce(g.notes, ''),
      'recebido', coalesce((select sum(m.amount) from app.financial_movements m where m.account_id = g.account_id and m.status = any (v_ok) and m.status <> 'reversed' and m.cash_effect > 0 and m.movement_type not in ('transfer_in', 'transfer_out', 'opening_balance', 'reversal')), 0),
      'gasto', coalesce((select sum(m.amount) from app.financial_movements m where m.account_id = g.account_id and m.status = any (v_ok) and m.status <> 'reversed' and m.cash_effect < 0 and m.movement_type not in ('transfer_in', 'transfer_out', 'opening_balance', 'reversal')), 0),
      'saldo', coalesce((select sum(m.amount * m.cash_effect) from app.financial_movements m where m.account_id = g.account_id and m.status = any (v_ok)), 0),
      'contasContabeis', coalesce((select jsonb_agg(gc.category_id order by gc.created_at) from app.v39_fin_grant_categories gc where gc.grant_id = g.id and gc.status = 'active'), '[]'::jsonb),
      'divergencias', (select count(*) from private.v39_fin_grant_diverg(g.id)),
      'despesasVinculadas', (select count(*) from app.v39_fin_grant_items gi join app.financial_expenses e on e.id = gi.expense_id where gi.grant_id = g.id and gi.status = 'active' and e.status not in ('cancelled', 'rejected', 'reversed')),
      'comprometido', c.v, 'disponivel', case when g.amount is null then null else g.amount - c.v end) o
    from app.v39_fin_grants g left join app.financial_accounts a on a.id = g.account_id
    cross join lateral (select coalesce(sum(coalesce(e.approved_amount, e.requested_amount)), 0) v from app.v39_fin_grant_items gi join app.financial_expenses e on e.id = gi.expense_id
                         where gi.grant_id = g.id and gi.status = 'active' and e.status not in ('cancelled', 'rejected', 'reversed')) c
   where g.church_id = p_church_id and g.entity_id is not distinct from private.v39_fin_target_entity()) x), '[]'::jsonb);
end $f$;

-- prestação de contas: + despesas e entradas vinculadas, resumo (comprometido, pago, a pagar, disponível) e a divergência de vínculo
create or replace function private.v39_fin_grant_report__d5raw(p_church_id uuid, p_grant uuid, p_de date default null, p_ate date default null) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare g record; v_ok text[] := array['posted','reconciled','reversed']; v_de date; v_ate date; v_ent record; v_doc jsonb := private.v39_fin_church_doc(p_church_id);
  v_ramo uuid[]; v_tem boolean; v_vinc uuid[]; v_desp jsonb; v_comp numeric; v_pago numeric;
begin
  perform private.v39_sensitive_log(p_church_id, null, 'financial', 'view', 'app', 'v39_fin_grant_report', p_grant::text, 'Prestacao de contas de convenio'); -- B63_HOOK
  perform private.v39_fin_need(p_church_id, 'financial.reports.view');
  select * into g from app.v39_fin_grants where id = p_grant and church_id = p_church_id;
  if g.id is null then perform app.raise_domain_error('FIN_NOT_FOUND', 'Convenio nao encontrado'); end if;
  select * into v_ent from app.v39_fin_entities where id = g.entity_id;
  v_de := coalesce(p_de, g.start_on, '2000-01-01'); v_ate := coalesce(p_ate, g.end_on, current_date);
  v_ramo := private.v39_fin_grant_ramo(g.id); v_tem := cardinality(v_ramo) > 0; v_vinc := private.v39_fin_grant_movs(g.id);
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'descricao', e.description, 'fornecedor', coalesce(f.legal_name, pp.full_name, ''), 'vencimento', e.due_on, 'status', e.status,
           'valor', coalesce(e.approved_amount, e.requested_amount), 'pago', coalesce(pg.v, 0), 'contas', coalesce(pg.contas, ''), 'cartao', exists (select 1 from app.v39_fin_expense_card k where k.expense_id = e.id),
           'categoria', c.name, 'contabil', coalesce(private.v39_fin_cat_code(p_church_id, c.id), ''), 'noConvenio', case when v_tem then c.id = any (v_ramo) end,
           'foraDaConta', coalesce(pg.fora, false)) order by e.due_on nulls last, e.created_at), '[]'::jsonb),
         coalesce(sum(coalesce(e.approved_amount, e.requested_amount)) filter (where e.status not in ('cancelled', 'rejected', 'reversed')), 0), coalesce(sum(pg.v), 0)
    into v_desp, v_comp, v_pago
    from app.v39_fin_grant_items gi join app.financial_expenses e on e.id = gi.expense_id
    join app.financial_categories c on c.id = e.category_id
    left join app.financial_payees f on f.id = e.payee_id left join app.people pp on pp.id = f.person_id
    left join lateral (select sum(ep.amount) v, string_agg(distinct a.name, ', ') contas, bool_or(m.account_id is distinct from g.account_id) fora
                         from app.financial_expense_payments ep join app.financial_movements m on m.id = ep.financial_movement_id left join app.financial_accounts a on a.id = m.account_id
                        where ep.expense_id = e.id and ep.status = 'posted') pg on true
   where gi.grant_id = g.id and gi.status = 'active';
  return jsonb_build_object(
    'entidade', jsonb_build_object('nome', coalesce(v_ent.legal_name, v_doc->>'nome'), 'cnpj', coalesce(nullif(v_ent.cnpj, ''), v_doc->>'cnpj', ''), 'presidente', coalesce(v_ent.president_name, '')),
    'convenio', jsonb_build_object('concedente', g.grantor_name, 'documento', coalesce(g.grantor_document, ''), 'instrumento', g.instrument, 'numero', coalesce(g.number, ''), 'objeto', g.object,
       'inicio', g.start_on, 'fim', g.end_on, 'valor', g.amount, 'contrapartida', g.counterpart_amount, 'status', g.status),
    'periodo', jsonb_build_object('de', v_de, 'ate', v_ate),
    'saldoInicial', coalesce((select sum(m.amount * m.cash_effect) from app.financial_movements m where m.account_id = g.account_id and m.status = any (v_ok) and m.movement_date < v_de), 0),
    'saldoFinal', coalesce((select sum(m.amount * m.cash_effect) from app.financial_movements m where m.account_id = g.account_id and m.status = any (v_ok) and m.movement_date <= v_ate), 0),
    'contasContabeis', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.name, 'contabil', coalesce(private.v39_fin_cat_code(p_church_id, c.id), ''), 'natureza', c.nature,
         'grupo', c.is_group, 'caminho', coalesce(t.caminho, c.name)) order by c.nature desc, t.ordem)
       from app.v39_fin_grant_categories gc join app.financial_categories c on c.id = gc.category_id left join private.v39_fin_cat_arvore(p_church_id) t on t.id = c.id
      where gc.grant_id = g.id and gc.status = 'active'), '[]'::jsonb),
    'porCategoria', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'categoria', c.name, 'contabil', coalesce(private.v39_fin_cat_code(p_church_id, c.id), ''), 'natureza', c.nature, 'valor', t.v,
         'caminho', coalesce(a.caminho, c.name), 'noConvenio', case when v_tem then c.id = any (v_ramo) end) order by c.nature desc, c.name)
       from (select m.category_id, sum(m.amount * m.cash_effect) v from app.financial_movements m where m.account_id = g.account_id and m.status = any (v_ok) and m.movement_date between v_de and v_ate group by 1) t
       join app.financial_categories c on c.id = t.category_id left join private.v39_fin_cat_arvore(p_church_id) a on a.id = c.id), '[]'::jsonb),
    'movimentos', coalesce((select jsonb_agg(jsonb_build_object('data', m.movement_date, 'descricao', m.description, 'categoria', c.name, 'valor', m.amount * m.cash_effect, 'tipo', m.movement_type,
         'favorecido', coalesce(p.full_name, ''), 'comprovante', (m.evidence_file_id is not null or m.metadata ? 'v39_evid'),
         'categoriaId', c.id, 'contabil', coalesce(private.v39_fin_cat_code(p_church_id, c.id), ''), 'noConvenio', case when m.id = any (v_vinc) then true when v_tem then c.id = any (v_ramo) end,
         'vinculado', m.id = any (v_vinc)) order by m.movement_date, m.created_at)
       from app.financial_movements m join app.financial_categories c on c.id = m.category_id left join app.people p on p.id = m.person_id
      where m.account_id = g.account_id and m.status = any (v_ok) and m.movement_date between v_de and v_ate), '[]'::jsonb),
    'foraDaConta', coalesce((select jsonb_agg(jsonb_build_object('data', m.movement_date, 'descricao', m.description, 'categoria', c.name, 'contabil', coalesce(private.v39_fin_cat_code(p_church_id, c.id), ''),
         'conta', coalesce(a.name, ''), 'valor', m.amount * m.cash_effect, 'tipo', m.movement_type, 'comprovante', (m.evidence_file_id is not null or m.metadata ? 'v39_evid'),
         'vinculado', d.tipo = 'vinculo_fora_da_conta') order by m.movement_date, m.created_at)
       from private.v39_fin_grant_diverg(g.id, v_de, v_ate) d join app.financial_movements m on m.id = d.movement_id join app.financial_categories c on c.id = m.category_id
       left join app.financial_accounts a on a.id = m.account_id where d.tipo in ('fora_da_conta', 'vinculo_fora_da_conta')), '[]'::jsonb),
    'divergencias', (select jsonb_build_object('foraDaConta', count(*) filter (where d.tipo = 'fora_da_conta'), 'contaForaDoConvenio', count(*) filter (where d.tipo = 'conta_fora_do_convenio'),
         'vinculoForaDaConta', count(*) filter (where d.tipo = 'vinculo_fora_da_conta'))
       from private.v39_fin_grant_diverg(g.id, v_de, v_ate) d),
    'despesasVinculadas', v_desp,
    'entradasVinculadas', coalesce((select jsonb_agg(jsonb_build_object('data', m.movement_date, 'descricao', m.description, 'valor', m.amount, 'conta', coalesce(a.name, ''), 'status', m.status,
         'foraDaConta', m.account_id is distinct from g.account_id) order by m.movement_date)
       from app.v39_fin_grant_items gi join app.financial_movements m on m.id = gi.movement_id left join app.financial_accounts a on a.id = m.account_id
      where gi.grant_id = g.id and gi.status = 'active'), '[]'::jsonb),
    'resumoVinculo', jsonb_build_object('comprometido', v_comp, 'pago', v_pago, 'aPagar', greatest(v_comp - v_pago, 0),
       'disponivel', case when g.amount is null then null else g.amount - v_comp end));
end $f$;

-- ===================== 4. PLANO MODELO: também cria as contas finais padrão =====================
-- Antes só criava grupos (e grupo não recebe lançamento): 3.3, 4.1 e 4.4 ficavam sem conta para escolher.
create or replace function app.v39_fin_plano_modelo(p_church_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_me uuid := private.v39_fin_me(); r record; v_id uuid; v_pai uuid; v_n int := 0; v_pos int := 0; v_k int; v_c int := 0;
begin
  perform private.v39_fin_need(p_church_id, 'financial.categories.manage');
  for r in select * from (values
      (1, 'grp_3', 'Receitas', 'income', null, '3'),
      (2, 'grp_3_1', 'Contribuições e doações', 'income', 'grp_3', '3.1'),
      (3, 'grp_3_2', 'Receitas de cultos e eventos', 'income', 'grp_3', '3.2'),
      (4, 'grp_3_3', 'Convênios, termos e subvenções', 'income', 'grp_3', '3.3'),
      (5, 'grp_3_9', 'Outras receitas', 'income', 'grp_3', '3.9'),
      (6, 'grp_4', 'Despesas', 'expense', null, '4'),
      (7, 'grp_4_1', 'Pessoal e encargos', 'expense', 'grp_4', '4.1'),
      (8, 'grp_4_2', 'Administrativas e operacionais', 'expense', 'grp_4', '4.2'),
      (9, 'grp_4_3', 'Cultos e eventos', 'expense', 'grp_4', '4.3'),
      (10, 'grp_4_4', 'Projetos sociais e convênios', 'expense', 'grp_4', '4.4'),
      (11, 'grp_4_5', 'Despesas financeiras', 'expense', 'grp_4', '4.5')) x(o, cod, nome, nat, pai, ctb) order by o loop
    if not exists (select 1 from app.financial_categories where church_id = p_church_id and code = r.cod) then
      v_pai := case when r.pai is null then null else (select id from app.financial_categories where church_id = p_church_id and code = r.pai and is_group) end;
      insert into app.financial_categories (id, church_id, parent_category_id, code, name, nature, description, is_system, is_active, is_group,
          accounting_code, created_at, updated_at, created_by_user_account_id, updated_by_user_account_id)
      values (gen_random_uuid(), p_church_id, v_pai, r.cod, r.nome, r.nat, 'Grupo do plano de contas modelo (PC-1)', false, true, true,
          r.ctb, now(), now(), v_me, v_me);
      v_n := v_n + 1;
    end if;
  end loop;
  -- contas finais padrão (só as que ainda não existem na igreja; o grupo precisa existir e estar ativo)
  for r in select * from (values
      ('conv_recursos', 'Recursos de convênios e termos', 'income', 'grp_3_3', '3.3.01'),
      ('conv_subvencoes', 'Subvenções e auxílios públicos', 'income', 'grp_3_3', '3.3.02'),
      ('pes_salarios', 'Salários e encargos', 'expense', 'grp_4_1', '4.1.01'),
      ('pes_prebenda', 'Prebenda e ajuda de custo pastoral', 'expense', 'grp_4_1', '4.1.02'),
      ('proj_despesas', 'Despesas de projetos e convênios', 'expense', 'grp_4_4', '4.4.01'),
      ('fin_tarifas', 'Tarifas bancárias', 'expense', 'grp_4_5', '4.5.02')) x(cod, nome, nat, grp, ctb) loop
    select id into v_pai from app.financial_categories where church_id = p_church_id and code = r.grp and is_group and is_active and nature = r.nat;
    if v_pai is null or exists (select 1 from app.financial_categories where church_id = p_church_id and code = r.cod) then continue; end if;
    insert into app.financial_categories (id, church_id, parent_category_id, code, name, nature, description, is_system, is_active, is_group,
        accounting_code, created_at, updated_at, created_by_user_account_id, updated_by_user_account_id)
    values (gen_random_uuid(), p_church_id, v_pai, r.cod, r.nome, r.nat, 'Conta do plano de contas modelo (PC-2)', false, true, false,
        r.ctb, now(), now(), v_me, v_me);
    v_c := v_c + 1;
  end loop;
  for r in select * from (values ('tithe', 'grp_3_1'), ('offering', 'grp_3_1'), ('donation', 'grp_3_1'), ('campaign_receipt', 'grp_3_1'),
      ('worship_income', 'grp_3_2'), ('event_income', 'grp_3_2'), ('other_income', 'grp_3_9'),
      ('operational_expense', 'grp_4_2'), ('desp_compras', 'grp_4_2'), ('card_despesas', 'grp_4_2'),
      ('worship_expense', 'grp_4_3'), ('event_expense', 'grp_4_3'), ('card_interest', 'grp_4_5')) x(cod, grp) loop
    select id into v_pai from app.financial_categories where church_id = p_church_id and code = r.grp and is_group and is_active;
    if v_pai is null then continue; end if;
    select id into v_id from app.financial_categories c where c.church_id is null and c.code = r.cod and c.is_active
       and c.nature = (select nature from app.financial_categories where id = v_pai);
    if v_id is not null and not exists (select 1 from app.v39_fin_category_place where church_id = p_church_id and category_id = v_id and parent_category_id is not null) then
      insert into app.v39_fin_category_place (church_id, category_id, parent_category_id, updated_at, updated_by_user_account_id)
      values (p_church_id, v_id, v_pai, now(), v_me)
      on conflict (church_id, category_id) do update set parent_category_id = excluded.parent_category_id, updated_at = now(), updated_by_user_account_id = v_me;
      v_pos := v_pos + 1;
    end if;
    update app.financial_categories c set parent_category_id = v_pai, updated_at = now(), updated_by_user_account_id = v_me
     where c.church_id = p_church_id and c.code = r.cod and c.parent_category_id is null and not c.is_group
       and c.nature = (select nature from app.financial_categories where id = v_pai);
    get diagnostics v_k = row_count; v_pos := v_pos + v_k;
  end loop;
  insert into app.financial_history (church_id, entity_type, entity_id, action, performed_by_user_account_id, occurred_at, metadata)
  values (p_church_id, 'category', p_church_id, 'v39_plano_modelo', v_me, now(), jsonb_build_object('grupos', v_n, 'contas', v_c, 'posicionadas', v_pos));   -- entity_id = a igreja
  return jsonb_build_object('ok', true, 'grupos', v_n, 'contas', v_c, 'posicionadas', v_pos);
end $f$;

-- ===================== 5. PERMISSÕES =====================
revoke all on function private.v39_fin_grant_movs(uuid) from public, anon, authenticated;
revoke all on function private.v39_fin_grant_diverg(uuid, date, date) from public, anon, authenticated;
revoke all on function app.v39_fin_grant_link(uuid, jsonb) from public, anon;
grant execute on function app.v39_fin_grant_link(uuid, jsonb) to authenticated;
revoke all on function app.v39_fin_grant_items_map(uuid) from public, anon;
grant execute on function app.v39_fin_grant_items_map(uuid) to authenticated;

commit;
