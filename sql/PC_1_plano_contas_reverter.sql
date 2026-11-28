-- =====================================================================
-- PC_1 · Plano de contas em árvore · REVERTER
-- Devolve as funções alteradas ao corpo anterior (28/11/2026), remove os gatilhos e as funções novas.
-- FICAM (nada é apagado): a coluna is_group, as tabelas app.v39_fin_category_place e app.v39_fin_grant_categories e os
--   grupos já criados. Sem os gatilhos, um grupo passaria a aceitar lançamento: inative os grupos se não for reaplicar.
-- Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

-- relatórios: volta a ler o código gravado na própria conta
do $p$
declare f regprocedure; v_def text;
begin
  foreach f in array array['private.v39_fin_report__d5raw(uuid,integer,integer)', 'app.v39_fin_group_report(uuid,integer,integer)', 'app.v39_fin_close_period(uuid,integer,integer,text)']::regprocedure[] loop
    v_def := pg_get_functiondef(f);
    if position('private.v39_fin_cat_code(p_church_id, c.id)' in v_def) > 0 then
      execute replace(v_def, 'private.v39_fin_cat_code(p_church_id, c.id)', 'c.accounting_code');
    end if;
  end loop;
end $p$;

drop trigger if exists v39_fin_cat_folha on app.financial_movements;
drop trigger if exists v39_fin_cat_folha on app.financial_expenses;
drop trigger if exists v39_fin_cat_folha on app.financial_expense_recurrences;
drop trigger if exists v39_fin_cat_folha on app.financial_expense_requests;
drop trigger if exists v39_fin_cat_folha on app.financial_source_batch_items;
drop trigger if exists v39_fin_cat_guard on app.financial_categories;
drop trigger if exists v39_fin_cat_place_guard on app.v39_fin_category_place;

create or replace function private.v39_fin_check_category(p_church_id uuid, p_cat uuid, p_nature text) returns void
language plpgsql stable security definer set search_path = pg_catalog, app as $f$
begin
  if not exists (select 1 from app.financial_categories where id = p_cat and (church_id = p_church_id or church_id is null)
                  and is_active and nature = p_nature) then
    perform app.raise_domain_error('FIN_CATEGORY_INVALID', 'Categoria invalida para este lancamento');
  end if;
end $f$;

create or replace function private.v39_fin_cat(p_church_id uuid, p_code text, p_name text, p_nature text, p_like text default null) returns uuid
language plpgsql security definer set search_path = pg_catalog, app as $f$
declare v_id uuid;
begin
  select id into v_id from app.financial_categories
   where (church_id = p_church_id or church_id is null) and is_active and nature = p_nature and code = p_code limit 1;
  if v_id is null and p_like is not null then
    select id into v_id from app.financial_categories
     where (church_id = p_church_id or church_id is null) and is_active and nature = p_nature and name ilike p_like
     order by (church_id is null), code limit 1;
  end if;
  if v_id is null then
    insert into app.financial_categories (id, church_id, code, name, nature, is_system, is_active, created_at, updated_at)
    values (gen_random_uuid(), p_church_id, p_code, p_name, p_nature, false, true, now(), now()) returning id into v_id;
  end if;
  return v_id;
end $f$;

create or replace function app.v39_fin_save_category(p_church_id uuid, p_id uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_me uuid := private.v39_fin_me(); v_id uuid := p_id;
  v_nome text := btrim(coalesce(p_payload->>'nome', '')); v_cod text := btrim(coalesce(p_payload->>'codigo', ''));
  v_nat text := coalesce(nullif(p_payload->>'natureza', ''), 'expense');
begin
  perform private.v39_fin_need(p_church_id, 'financial.categories.manage');
  if v_nome = '' or v_cod = '' then perform app.raise_domain_error('FIN_NAME_REQUIRED', 'Informe codigo e nome'); end if;
  if v_nat not in ('income','expense','neutral') then perform app.raise_domain_error('FIN_STATUS_INVALID', 'Natureza invalida'); end if;
  if v_id is null then
    insert into app.financial_categories (id, church_id, parent_category_id, code, name, nature, description, is_system, is_active,
        accounting_code, created_at, updated_at, created_by_user_account_id, updated_by_user_account_id)
    values (gen_random_uuid(), p_church_id, private.v39_fin_uuid(p_payload, 'paiId'), v_cod, v_nome, v_nat, nullif(p_payload->>'descricao', ''), false,
        coalesce((p_payload->>'ativa')::boolean, true), nullif(p_payload->>'contabil', ''), now(), now(), v_me, v_me)
    returning id into v_id;
  else
    update app.financial_categories set accounting_code = nullif(p_payload->>'contabil', ''), updated_at = now(), updated_by_user_account_id = v_me
     where id = v_id and (church_id is null or is_system);
    if not found then
      update app.financial_categories set code = v_cod, name = v_nome, nature = v_nat, parent_category_id = private.v39_fin_uuid(p_payload, 'paiId'),
          description = nullif(p_payload->>'descricao', ''), is_active = coalesce((p_payload->>'ativa')::boolean, true),
          accounting_code = nullif(p_payload->>'contabil', ''), updated_at = now(), updated_by_user_account_id = v_me
       where id = v_id and church_id = p_church_id;
      if not found then perform app.raise_domain_error('FIN_NOT_FOUND', 'Categoria nao encontrada'); end if;
    end if;
  end if;
  insert into app.financial_history (church_id, entity_type, entity_id, action, performed_by_user_account_id, occurred_at, metadata)
  values (p_church_id, 'category', v_id, case when p_id is null then 'v39_create' else 'v39_update' end, v_me, now(), p_payload);
  return app.v39_fin_catalogs(p_church_id);
end $f$;

create or replace function private.v39_fin_catalogs__d5raw(p_church_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
begin
  if not exists (select 1 from app.permissions pm where pm.code like 'financial.%' and private.v39_fin_has(p_church_id, pm.code)) then
    perform app.raise_domain_error('PERMISSION_DENIED', 'Sem acesso ao Financeiro');
  end if;
  return jsonb_build_object(
    'contas', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', name, 'tipo', account_type, 'status', status,
        'banco', institution_name, 'agencia', branch_reference, 'numero', account_reference, 'pix', pix_key_reference,
        'abertaEm', opened_on, 'obs', notes,
        'saldoInicial', (select jsonb_build_object('valor', ob.amount, 'data', ob.balance_date) from app.financial_opening_balances ob
                          where ob.account_id = a.id and ob.status = 'confirmed' limit 1)) order by name)
      from app.financial_accounts a where church_id = p_church_id and private.v39_fin_ent_ok(a.id)), '[]'::jsonb),
    'categorias', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'codigo', code, 'nome', name, 'natureza', nature,
        'paiId', parent_category_id, 'descricao', description, 'ativa', is_active, 'sistema', is_system or church_id is null,
        'contabil', accounting_code) order by nature, code)
      from app.financial_categories where church_id = p_church_id or church_id is null), '[]'::jsonb),
    'formas', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'codigo', code, 'nome', name, 'tipo', method_type,
        'ativa', is_active) order by name)
      from app.financial_payment_methods where church_id = p_church_id or church_id is null), '[]'::jsonb),
    'fornecedores', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nome', coalesce(f.legal_name, p.full_name), 'pessoaId', f.person_id,
        'documento', f.document_reference, 'contato', f.contact_reference, 'status', f.status, 'obs', f.notes) order by coalesce(f.legal_name, p.full_name))
      from app.financial_payees f left join app.people p on p.id = f.person_id where f.church_id = p_church_id), '[]'::jsonb),
    'cartoes', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'nome', k.name, 'banco', k.institution_name, 'final', k.last_four,
        'fechamento', k.closing_day, 'vencimento', k.due_day, 'responsavelId', k.responsible_person_id, 'contaId', k.settlement_account_id,
        'status', k.status) order by k.name)
      from app.financial_cards k where k.church_id = p_church_id and private.v39_fin_ent_ok(k.settlement_account_id)), '[]'::jsonb),
    'campanhas', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', name, 'status', status) order by name)
      from app.financial_campaigns where church_id = p_church_id and status in ('draft','planned','active')), '[]'::jsonb));
end $f$;

create or replace function app.v39_fin_grant_save(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_me uuid := private.v39_fin_me(); v_id uuid := nullif(p->>'id', '')::uuid; v_acc uuid := nullif(p->>'contaId', '')::uuid; v_ent uuid;
begin
  perform private.v39_fin_need(p_church_id, 'financial.accounts.manage');
  if length(btrim(coalesce(p->>'concedente', ''))) < 3 or length(btrim(coalesce(p->>'objeto', ''))) < 5 then perform app.raise_domain_error('FIN_NAME_REQUIRED', 'Informe concedente e objeto'); end if;
  if v_acc is not null then
    select entity_id into v_ent from app.financial_accounts where id = v_acc and church_id = p_church_id;
    if not found then perform app.raise_domain_error('FIN_ACCOUNT_INVALID', 'Conta invalida'); end if;
  else v_ent := private.v39_fin_target_entity(); end if;
  if coalesce(p->>'origem', 'public') = 'public' and v_acc is null and coalesce(p->>'status', 'active') = 'active' then
    perform app.raise_domain_error('GRANT_ACCOUNT_REQUIRED', 'Recurso publico exige conta bancaria especifica (Lei 13.019/14, art. 51)'); end if;
  if v_id is null then
    insert into app.v39_fin_grants (church_id, entity_id, source_kind, instrument, grantor_name, grantor_document, number, object, start_on, end_on, amount, counterpart_amount, account_id, status, notes, created_by, updated_by)
    values (p_church_id, v_ent, coalesce(nullif(p->>'origem', ''), 'public'), coalesce(nullif(p->>'instrumento', ''), 'outro'), btrim(p->>'concedente'),
       nullif(regexp_replace(coalesce(p->>'documento', ''), '\D', '', 'g'), ''), nullif(btrim(p->>'numero'), ''), btrim(p->>'objeto'),
       nullif(p->>'inicio', '')::date, nullif(p->>'fim', '')::date, nullif(p->>'valor', '')::numeric, nullif(p->>'contrapartida', '')::numeric, v_acc,
       coalesce(nullif(p->>'status', ''), 'active'), nullif(btrim(p->>'obs'), ''), v_me, v_me) returning id into v_id;
  else
    update app.v39_fin_grants set entity_id = v_ent, source_kind = coalesce(nullif(p->>'origem', ''), source_kind), instrument = coalesce(nullif(p->>'instrumento', ''), instrument),
       grantor_name = btrim(p->>'concedente'), grantor_document = nullif(regexp_replace(coalesce(p->>'documento', ''), '\D', '', 'g'), ''), number = nullif(btrim(p->>'numero'), ''),
       object = btrim(p->>'objeto'), start_on = nullif(p->>'inicio', '')::date, end_on = nullif(p->>'fim', '')::date, amount = nullif(p->>'valor', '')::numeric,
       counterpart_amount = nullif(p->>'contrapartida', '')::numeric, account_id = v_acc, status = coalesce(nullif(p->>'status', ''), status), notes = nullif(btrim(p->>'obs'), ''),
       updated_at = now(), updated_by = v_me
     where id = v_id and church_id = p_church_id;
    if not found then perform app.raise_domain_error('FIN_NOT_FOUND', 'Convenio nao encontrado'); end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
exception when unique_violation then perform app.raise_domain_error('GRANT_ACCOUNT_IN_USE', 'Esta conta ja esta vinculada a outro convenio ativo'); return null;
end $f$;

create or replace function app.v39_fin_grants_list(p_church_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare v_ok text[] := array['posted','reconciled','reversed'];
begin
  if not (private.v39_fin_has(p_church_id, 'financial.book.view') or private.v39_fin_has(p_church_id, 'financial.reports.view')) then perform app.raise_domain_error('PERMISSION_DENIED', 'Sem permissao'); end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'origem', g.source_kind, 'instrumento', g.instrument, 'concedente', g.grantor_name, 'documento', coalesce(g.grantor_document, ''),
      'numero', coalesce(g.number, ''), 'objeto', g.object, 'inicio', g.start_on, 'fim', g.end_on, 'valor', g.amount, 'contrapartida', g.counterpart_amount, 'contaId', g.account_id,
      'conta', a.name, 'status', g.status, 'obs', coalesce(g.notes, ''),
      'recebido', coalesce((select sum(m.amount) from app.financial_movements m where m.account_id = g.account_id and m.status = any (v_ok) and m.status <> 'reversed' and m.cash_effect > 0 and m.movement_type not in ('transfer_in', 'transfer_out', 'opening_balance', 'reversal')), 0),
      'gasto', coalesce((select sum(m.amount) from app.financial_movements m where m.account_id = g.account_id and m.status = any (v_ok) and m.status <> 'reversed' and m.cash_effect < 0 and m.movement_type not in ('transfer_in', 'transfer_out', 'opening_balance', 'reversal')), 0),
      'saldo', coalesce((select sum(m.amount * m.cash_effect) from app.financial_movements m where m.account_id = g.account_id and m.status = any (v_ok)), 0)) order by g.start_on desc nulls last, g.grantor_name)
    from app.v39_fin_grants g left join app.financial_accounts a on a.id = g.account_id
   where g.church_id = p_church_id and g.entity_id is not distinct from private.v39_fin_target_entity()), '[]'::jsonb);
end $f$;

create or replace function private.v39_fin_grant_report__d5raw(p_church_id uuid, p_grant uuid, p_de date default null, p_ate date default null) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare g record; v_ok text[] := array['posted','reconciled','reversed']; v_de date; v_ate date; v_ent record; v_doc jsonb := private.v39_fin_church_doc(p_church_id);
begin
  perform private.v39_sensitive_log(p_church_id, null, 'financial', 'view', 'app', 'v39_fin_grant_report', p_grant::text, 'Prestacao de contas de convenio'); -- B63_HOOK
  perform private.v39_fin_need(p_church_id, 'financial.reports.view');
  select * into g from app.v39_fin_grants where id = p_grant and church_id = p_church_id;
  if g.id is null then perform app.raise_domain_error('FIN_NOT_FOUND', 'Convenio nao encontrado'); end if;
  select * into v_ent from app.v39_fin_entities where id = g.entity_id;
  v_de := coalesce(p_de, g.start_on, '2000-01-01'); v_ate := coalesce(p_ate, g.end_on, current_date);
  return jsonb_build_object(
    'entidade', jsonb_build_object('nome', coalesce(v_ent.legal_name, v_doc->>'nome'), 'cnpj', coalesce(nullif(v_ent.cnpj, ''), v_doc->>'cnpj', ''), 'presidente', coalesce(v_ent.president_name, '')),
    'convenio', jsonb_build_object('concedente', g.grantor_name, 'documento', coalesce(g.grantor_document, ''), 'instrumento', g.instrument, 'numero', coalesce(g.number, ''), 'objeto', g.object,
       'inicio', g.start_on, 'fim', g.end_on, 'valor', g.amount, 'contrapartida', g.counterpart_amount, 'status', g.status),
    'periodo', jsonb_build_object('de', v_de, 'ate', v_ate),
    'saldoInicial', coalesce((select sum(m.amount * m.cash_effect) from app.financial_movements m where m.account_id = g.account_id and m.status = any (v_ok) and m.movement_date < v_de), 0),
    'saldoFinal', coalesce((select sum(m.amount * m.cash_effect) from app.financial_movements m where m.account_id = g.account_id and m.status = any (v_ok) and m.movement_date <= v_ate), 0),
    'porCategoria', coalesce((select jsonb_agg(jsonb_build_object('categoria', c.name, 'contabil', coalesce(c.accounting_code, ''), 'natureza', c.nature, 'valor', t.v) order by c.nature desc, c.name)
       from (select m.category_id, sum(m.amount * m.cash_effect) v from app.financial_movements m where m.account_id = g.account_id and m.status = any (v_ok) and m.movement_date between v_de and v_ate group by 1) t
       join app.financial_categories c on c.id = t.category_id), '[]'::jsonb),
    'movimentos', coalesce((select jsonb_agg(jsonb_build_object('data', m.movement_date, 'descricao', m.description, 'categoria', c.name, 'valor', m.amount * m.cash_effect, 'tipo', m.movement_type,
         'favorecido', coalesce(p.full_name, ''), 'comprovante', (m.evidence_file_id is not null or m.metadata ? 'v39_evid')) order by m.movement_date, m.created_at)
       from app.financial_movements m join app.financial_categories c on c.id = m.category_id left join app.people p on p.id = m.person_id
      where m.account_id = g.account_id and m.status = any (v_ok) and m.movement_date between v_de and v_ate), '[]'::jsonb));
end $f$;

drop function if exists app.v39_fin_plano_modelo(uuid);
drop function if exists private.v39_fin_grant_cats_set(uuid, uuid, jsonb, uuid);
drop function if exists private.v39_fin_grant_diverg(uuid, date, date);
drop function if exists private.v39_fin_grant_ramo(uuid);
drop function if exists private.v39_fin_cat_ramo(uuid, uuid[]);
drop function if exists private.v39_fin_cat_arvore(uuid);
drop function if exists private.v39_fin_cat_code(uuid, uuid);
drop function if exists private.v39_fin_cat_pai(uuid, uuid);
drop function if exists private.v39_fin_cat_folha();
drop function if exists private.v39_fin_cat_place_guard();
drop function if exists private.v39_fin_cat_guard();
drop function if exists private.v39_fin_cat_tem_filhos(uuid, boolean);
drop function if exists private.v39_fin_cat_em_uso(uuid);
-- Tabelas app.v39_fin_category_place e app.v39_fin_grant_categories e a coluna is_group FICAM (nada é apagado).

commit;
