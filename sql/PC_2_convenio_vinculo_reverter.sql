-- =====================================================================
-- PC_2 · Despesa/entrada vinculada ao convênio + contas finais no plano modelo · REVERTER
-- 28/11/2026 · DATA · pedido do Diogo
-- Devolve as 4 funções ao corpo do PC-1 e remove as RPCs novas. A tabela app.v39_fin_grant_items e as contas finais criadas FICAM.
-- Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

-- funções do PC-1 voltam ao corpo do PC_1_plano_contas_aplicar.sql
create or replace function private.v39_fin_grant_diverg(p_grant uuid, p_de date default null, p_ate date default null)
returns table (movement_id uuid, tipo text)
language sql stable security definer set search_path = pg_catalog, app, private as $f$
  with g as (select g.id, g.church_id, g.account_id, coalesce(p_de, g.start_on, date '2000-01-01') de, coalesce(p_ate, g.end_on, current_date) ate,
                    private.v39_fin_grant_ramo(g.id) ramo
               from app.v39_fin_grants g where g.id = p_grant)
  select m.id, 'fora_da_conta'::text from app.financial_movements m, g
   where cardinality(g.ramo) > 0 and m.church_id = g.church_id and m.category_id = any (g.ramo) and m.account_id is distinct from g.account_id
     and m.status in ('posted', 'reconciled') and m.movement_type in ('income', 'expense') and m.movement_date between g.de and g.ate
  union all
  select m.id, 'conta_fora_do_convenio'::text from app.financial_movements m, g
   where cardinality(g.ramo) > 0 and g.account_id is not null and m.account_id = g.account_id and not (m.category_id = any (g.ramo))
     and m.status in ('posted', 'reconciled') and m.movement_type in ('income', 'expense') and m.movement_date between g.de and g.ate
$f$;

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
      'saldo', coalesce((select sum(m.amount * m.cash_effect) from app.financial_movements m where m.account_id = g.account_id and m.status = any (v_ok)), 0),
      'contasContabeis', coalesce((select jsonb_agg(gc.category_id order by gc.created_at) from app.v39_fin_grant_categories gc where gc.grant_id = g.id and gc.status = 'active'), '[]'::jsonb),
      'divergencias', (select count(*) from private.v39_fin_grant_diverg(g.id))) order by g.start_on desc nulls last, g.grantor_name)
    from app.v39_fin_grants g left join app.financial_accounts a on a.id = g.account_id
   where g.church_id = p_church_id and g.entity_id is not distinct from private.v39_fin_target_entity()), '[]'::jsonb);
end $f$;

create or replace function private.v39_fin_grant_report__d5raw(p_church_id uuid, p_grant uuid, p_de date default null, p_ate date default null) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare g record; v_ok text[] := array['posted','reconciled','reversed']; v_de date; v_ate date; v_ent record; v_doc jsonb := private.v39_fin_church_doc(p_church_id);
  v_ramo uuid[]; v_tem boolean;
begin
  perform private.v39_sensitive_log(p_church_id, null, 'financial', 'view', 'app', 'v39_fin_grant_report', p_grant::text, 'Prestacao de contas de convenio'); -- B63_HOOK
  perform private.v39_fin_need(p_church_id, 'financial.reports.view');
  select * into g from app.v39_fin_grants where id = p_grant and church_id = p_church_id;
  if g.id is null then perform app.raise_domain_error('FIN_NOT_FOUND', 'Convenio nao encontrado'); end if;
  select * into v_ent from app.v39_fin_entities where id = g.entity_id;
  v_de := coalesce(p_de, g.start_on, '2000-01-01'); v_ate := coalesce(p_ate, g.end_on, current_date);
  v_ramo := private.v39_fin_grant_ramo(g.id); v_tem := cardinality(v_ramo) > 0;
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
         'categoriaId', c.id, 'contabil', coalesce(private.v39_fin_cat_code(p_church_id, c.id), ''), 'noConvenio', case when v_tem then c.id = any (v_ramo) end) order by m.movement_date, m.created_at)
       from app.financial_movements m join app.financial_categories c on c.id = m.category_id left join app.people p on p.id = m.person_id
      where m.account_id = g.account_id and m.status = any (v_ok) and m.movement_date between v_de and v_ate), '[]'::jsonb),
    'foraDaConta', coalesce((select jsonb_agg(jsonb_build_object('data', m.movement_date, 'descricao', m.description, 'categoria', c.name, 'contabil', coalesce(private.v39_fin_cat_code(p_church_id, c.id), ''),
         'conta', coalesce(a.name, ''), 'valor', m.amount * m.cash_effect, 'tipo', m.movement_type, 'comprovante', (m.evidence_file_id is not null or m.metadata ? 'v39_evid')) order by m.movement_date, m.created_at)
       from private.v39_fin_grant_diverg(g.id, v_de, v_ate) d join app.financial_movements m on m.id = d.movement_id join app.financial_categories c on c.id = m.category_id
       left join app.financial_accounts a on a.id = m.account_id where d.tipo = 'fora_da_conta'), '[]'::jsonb),
    'divergencias', (select jsonb_build_object('foraDaConta', count(*) filter (where d.tipo = 'fora_da_conta'), 'contaForaDoConvenio', count(*) filter (where d.tipo = 'conta_fora_do_convenio'))
       from private.v39_fin_grant_diverg(g.id, v_de, v_ate) d));
end $f$;

create or replace function app.v39_fin_plano_modelo(p_church_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_me uuid := private.v39_fin_me(); r record; v_id uuid; v_pai uuid; v_n int := 0; v_pos int := 0; v_k int;
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
  values (p_church_id, 'category', p_church_id, 'v39_plano_modelo', v_me, now(), jsonb_build_object('grupos', v_n, 'posicionadas', v_pos));   -- entity_id = a igreja (o modelo vale para o plano inteiro)
  return jsonb_build_object('ok', true, 'grupos', v_n, 'posicionadas', v_pos);
end $f$;

drop function if exists app.v39_fin_grant_items_map(uuid);
drop function if exists app.v39_fin_grant_link(uuid, jsonb);
drop function if exists private.v39_fin_grant_movs(uuid);
-- A tabela app.v39_fin_grant_items FICA (nada é apagado).

commit;
