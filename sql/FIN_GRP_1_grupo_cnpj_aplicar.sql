-- =====================================================================
-- FIN_GRP_1 · Financeiro do grupo (matriz + filiais): repasse entre igrejas e relatório consolidado · APLICAR
-- 22/11/2026 · DATA · pedido do Diogo
-- VALIDACAO: ver cabecalho de FIN_GRP_1_grupo_cnpj_teste_rollback.sql
-- ---------------------------------------------------------------------
-- Regra (decisões do Diogo, 22/11; [CONFIRMAR] com o contador):
--   - Filial com a mesma raiz de CNPJ é a MESMA pessoa jurídica da matriz: as demonstrações da entidade (ITG 2002 R1)
--     somam matriz + filiais, com uma coluna por estabelecimento (CNPJ).
--   - Repasse entre igrejas do grupo NÃO é receita nem despesa: sai de uma conta da igreja de origem e entra numa conta
--     da igreja de destino (transfer_out / transfer_in, categoria neutra 'transfer'), e é eliminado no consolidado.
--   - O Instituto (contas com entidade própria) fica fora do consolidado da igreja: tem relatório próprio e aparece só
--     como parte relacionada.
-- Funções novas (SECURITY DEFINER; conta ativa + permissão financeira em CADA igreja envolvida):
--   private.v39_fin_group(church)                         matriz + filiais (FIL_1: parent_church_id).
--   app.v39_fin_group_info(church)                        igrejas do grupo, o que a pessoa pode ver/repassar e as contas.
--   app.v39_fin_repasse(church_origem, p)                 repasse (transfers.manage + Tesouraria nas duas igrejas).
--   app.v39_fin_repasse_reverse(church, repasse, motivo)  estorna os dois lados juntos.
--   app.v39_fin_repasses(church, ano, mes)                repasses enviados e recebidos da igreja no período.
--   app.v39_fin_group_report(church, ano, mes)            consolidado por raiz de CNPJ (reports.view; só as igrejas em
--                                                         que a pessoa tem reports.view entram; o resto vira 'parcial').
-- Função existente alterada (create or replace; assinatura, retorno e grants iguais):
--   app.v39_fin_reverse_movement: lançamento de repasse só se estorna pela tela de repasses (os dois lados juntos).
-- Sem tabela nova. Reverter: FIN_GRP_1_grupo_cnpj_reverter.sql.
-- Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

create or replace function private.v39_fin_group(p_church uuid)
returns table (church_id uuid, papel text, nome text, cnpj text, status text)
language sql stable security definer set search_path = pg_catalog, app as $f$
  with mz as (select coalesce(c.parent_church_id, c.id) id from app.churches c where c.id = p_church)
  select c.id, case when c.id = mz.id then 'matriz' else 'filial' end, coalesce(nullif(c.legal_name, ''), c.name), coalesce(c.cnpj, ''), c.status
    from app.churches c, mz
   where c.id = mz.id or c.parent_church_id = mz.id
   order by (c.id = mz.id) desc, c.name
$f$;

create or replace function app.v39_fin_group_info(p_church_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
begin
  if private.v39_fin_me() is null or not exists (select 1 from app.permissions pm where pm.code like 'financial.%' and private.v39_fin_has(p_church_id, pm.code)) then
    perform app.raise_domain_error('PERMISSION_DENIED', 'Sem acesso ao Financeiro'); end if;
  return jsonb_build_object('atual', p_church_id, 'grupo', coalesce((select jsonb_agg(jsonb_build_object(
      'id', g.church_id, 'papel', g.papel, 'nome', g.nome, 'cnpj', g.cnpj, 'status', g.status,
      'podeVer', private.v39_fin_has(g.church_id, 'financial.reports.view'),
      'podeRepassar', private.v39_fin_has(g.church_id, 'financial.transfers.manage') and private.v39_fin_treasury(g.church_id),
      'contas', case when private.v39_fin_has(g.church_id, 'financial.transfers.manage') then coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.name) order by a.name)
                  from app.financial_accounts a where a.church_id = g.church_id and a.status = 'active' and a.entity_id is null), '[]'::jsonb) else '[]'::jsonb end))
    from private.v39_fin_group(p_church_id) g), '[]'::jsonb));
end $f$;

create or replace function app.v39_fin_repasse(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := private.v39_fin_me(); v_dest uuid := private.v39_fin_uuid(p, 'igrejaDestinoId');
  v_o uuid := private.v39_fin_uuid(p, 'contaOrigemId'); v_d uuid := private.v39_fin_uuid(p, 'contaDestinoId');
  v_dt date := private.v39_fin_date(p, 'data'); v_val numeric := private.v39_fin_money(p, 'valor'); v_key text := private.v39_fin_key(p, 'v39rp');
  v_evid uuid := private.v39_fin_uuid(p, 'comprovanteId'); v_cat uuid; v_id uuid; v_desc text := nullif(btrim(coalesce(p->>'descricao', '')), '');
  v_no text; v_nd text; v_meta jsonb;
begin
  if v_dest is null or v_dest = p_church_id then perform app.raise_domain_error('FIN_REPASSE_DESTINO', 'Escolha outra igreja do grupo'); end if;
  if not exists (select 1 from private.v39_fin_group(p_church_id) g where g.church_id = v_dest and g.status = 'active') then
    perform app.raise_domain_error('FIN_REPASSE_DESTINO', 'A igreja de destino nao e do mesmo grupo (matriz/filiais) ou esta inativa'); end if;
  perform private.v39_fin_need(p_church_id, 'financial.transfers.manage'); perform private.v39_fin_need_treasury(p_church_id);
  perform private.v39_fin_need(v_dest, 'financial.transfers.manage'); perform private.v39_fin_need_treasury(v_dest);
  perform private.v39_fin_check_date(p_church_id, v_dt); perform private.v39_fin_check_date(v_dest, v_dt);
  perform private.v39_fin_check_account(p_church_id, v_o); perform private.v39_fin_check_account(v_dest, v_d);
  if exists (select 1 from app.financial_accounts where id in (v_o, v_d) and entity_id is not null) then
    perform app.raise_domain_error('FIN_REPASSE_CONTA', 'Repasse entre igrejas usa contas da igreja (nao do Instituto)'); end if;
  select id into v_cat from app.financial_categories where church_id is null and code = 'transfer' and nature = 'neutral' and is_active limit 1;
  if v_cat is null then perform app.raise_domain_error('FIN_CATEGORY_INVALID', 'Categoria de transferencia nao encontrada'); end if;

  select source_entity_id into v_id from app.financial_movements where church_id = p_church_id and idempotency_key = v_key || ':out';
  if v_id is not null then return jsonb_build_object('ok', true, 'id', v_id); end if;
  v_id := gen_random_uuid();
  select nome into v_no from private.v39_fin_group(p_church_id) where church_id = p_church_id;
  select nome into v_nd from private.v39_fin_group(p_church_id) where church_id = v_dest;
  v_meta := jsonb_build_object('repasse', jsonb_build_object('id', v_id, 'origem', p_church_id, 'destino', v_dest, 'contaOrigem', v_o, 'contaDestino', v_d));
  perform private.v39_fin_insert_movement(p_church_id, v_o, v_cat, null, 'transfer_out', v_val, v_dt, null, false,
          'Repasse para ' || v_nd || coalesce(' · ' || v_desc, ''), 'v39_repasse', 'church_repasse', v_id, v_evid, v_key || ':out', v_meta, v_me);
  perform private.v39_fin_insert_movement(v_dest, v_d, v_cat, null, 'transfer_in', v_val, v_dt, null, false,
          'Repasse de ' || v_no || coalesce(' · ' || v_desc, ''), 'v39_repasse', 'church_repasse', v_id, null, v_key || ':in', v_meta, v_me);
  insert into audit.events (church_id, actor_user_account_id, action, entity_schema, entity_name, entity_id, event_category, sensitivity, outcome, source, metadata)
  values (p_church_id, v_me, 'fin_repasse_sent', 'app', 'financial_movements', v_id::text, 'data_change', 'financial', 'success', 'rpc', jsonb_build_object('destino', v_dest, 'valor', v_val)),
         (v_dest, v_me, 'fin_repasse_received', 'app', 'financial_movements', v_id::text, 'data_change', 'financial', 'success', 'rpc', jsonb_build_object('origem', p_church_id, 'valor', v_val));
  return jsonb_build_object('ok', true, 'id', v_id);
end $f$;

create or replace function app.v39_fin_repasse_reverse(p_church_id uuid, p_repasse uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_me uuid := private.v39_fin_me(); v_r text := private.v39_fin_reason(p_reason); m record; v_n int := 0;
begin
  if not exists (select 1 from app.financial_movements where source_module = 'v39_repasse' and source_entity_id = p_repasse and church_id = p_church_id) then
    perform app.raise_domain_error('FIN_NOT_FOUND', 'Repasse nao encontrado'); end if;
  for m in select * from app.financial_movements where source_module = 'v39_repasse' and source_entity_id = p_repasse and movement_type in ('transfer_in','transfer_out') loop
    perform private.v39_fin_need(m.church_id, 'financial.transfers.manage'); perform private.v39_fin_need_treasury(m.church_id);
    if m.status not in ('posted','reconciled') then perform app.raise_domain_error('FIN_NOT_REVERSIBLE', 'Repasse ja estornado'); end if;
  end loop;
  for m in select * from app.financial_movements where source_module = 'v39_repasse' and source_entity_id = p_repasse and movement_type in ('transfer_in','transfer_out') loop
    perform app.reverse_financial_movement(m.id, v_me, v_r); v_n := v_n + 1;
    insert into audit.events (church_id, actor_user_account_id, action, entity_schema, entity_name, entity_id, event_category, sensitivity, outcome, source, reason, metadata)
    values (m.church_id, v_me, 'fin_repasse_reversed', 'app', 'financial_movements', p_repasse::text, 'reversal', 'financial', 'success', 'rpc', v_r, jsonb_build_object('movimento', m.id));
  end loop;
  return jsonb_build_object('ok', true, 'estornados', v_n);
end $f$;

create or replace function app.v39_fin_repasses(p_church_id uuid, p_year integer, p_month integer) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_ini date; v_fim date;
begin
  perform private.v39_fin_need(p_church_id, 'financial.book.view');
  if p_year < 2000 or (p_month is not null and p_month not between 1 and 12) then perform app.raise_domain_error('PERIOD_INVALID', 'Periodo invalido'); end if;
  v_ini := make_date(p_year, coalesce(p_month, 1), 1);
  v_fim := case when p_month is null then make_date(p_year, 12, 31) else (v_ini + interval '1 month - 1 day')::date end;
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.source_entity_id, 'data', m.movement_date, 'valor', m.amount,
      'sentido', case when m.movement_type = 'transfer_out' then 'enviado' else 'recebido' end,
      'outraIgreja', (select coalesce(nullif(c.legal_name, ''), c.name) from app.churches c
                       where c.id = (case when m.movement_type = 'transfer_out' then (m.metadata->'repasse'->>'destino') else (m.metadata->'repasse'->>'origem') end)::uuid),
      'conta', a.name, 'descricao', m.description, 'status', m.status) order by m.movement_date desc, m.created_at desc)
    from app.financial_movements m join app.financial_accounts a on a.id = m.account_id
   where m.church_id = p_church_id and m.source_module = 'v39_repasse' and m.movement_type in ('transfer_in','transfer_out')
     and m.movement_date between v_ini and v_fim), '[]'::jsonb);
end $f$;

create or replace function app.v39_fin_group_report(p_church_id uuid, p_year integer, p_month integer) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_ini date; v_fim date; v_ok text[] := array['posted','reconciled','reversed']; v_ids uuid[]; v_mz record; v_est jsonb; v_cons jsonb;
begin
  perform private.v39_sensitive_log(p_church_id, null, 'financial', 'view', 'app', 'v39_fin_group_report', p_year || '-' || p_month, 'Relatorio consolidado do grupo');
  perform private.v39_fin_need(p_church_id, 'financial.reports.view');
  if p_year < 2000 or (p_month is not null and p_month not between 1 and 12) then perform app.raise_domain_error('PERIOD_INVALID', 'Periodo invalido'); end if;
  v_ini := make_date(p_year, coalesce(p_month, 1), 1);
  v_fim := case when p_month is null then make_date(p_year, 12, 31) else (v_ini + interval '1 month - 1 day')::date end;
  select array_agg(g.church_id) into v_ids from private.v39_fin_group(p_church_id) g where private.v39_fin_has(g.church_id, 'financial.reports.view');
  select * into v_mz from private.v39_fin_group(p_church_id) g where g.papel = 'matriz';

  -- por estabelecimento (só contas da igreja: entity_id nulo; o Instituto fica fora)
  select coalesce(jsonb_agg(jsonb_build_object('id', g.church_id, 'papel', g.papel, 'nome', g.nome, 'cnpj', g.cnpj, 'status', g.status,
      'incluido', g.church_id = any (v_ids),
      'receitas', x.rec, 'despesas', x.desp, 'superavit', x.rec - x.desp, 'caixaInicial', x.ci, 'caixaFinal', x.cf,
      'repassesEnviados', x.renv, 'repassesRecebidos', x.rrec) order by (g.papel = 'matriz') desc, g.nome), '[]'::jsonb)
    into v_est
    from private.v39_fin_group(p_church_id) g
    left join lateral (select
        coalesce(sum(m.amount * m.result_effect) filter (where m.result_effect > 0 and m.movement_date between v_ini and v_fim), 0) rec,
        coalesce(-sum(m.amount * m.result_effect) filter (where m.result_effect < 0 and m.movement_date between v_ini and v_fim), 0) desp,
        coalesce(sum(m.amount * m.cash_effect) filter (where m.movement_date < v_ini), 0) ci,
        coalesce(sum(m.amount * m.cash_effect) filter (where m.movement_date <= v_fim), 0) cf,
        -- repasses líquidos no período (o estorno conta pelo movimento original)
        coalesce(-sum(m.amount * m.cash_effect) filter (where coalesce(case when m.source_module = 'v39_repasse' then m.movement_type end,
                 case when o.source_module = 'v39_repasse' then o.movement_type end) = 'transfer_out' and m.movement_date between v_ini and v_fim), 0) renv,
        coalesce(sum(m.amount * m.cash_effect) filter (where coalesce(case when m.source_module = 'v39_repasse' then m.movement_type end,
                 case when o.source_module = 'v39_repasse' then o.movement_type end) = 'transfer_in' and m.movement_date between v_ini and v_fim), 0) rrec
      from app.financial_movements m join app.financial_accounts a on a.id = m.account_id
      left join app.financial_movements o on o.id = m.reversal_of_movement_id
     where m.church_id = g.church_id and a.entity_id is null and m.status = any (v_ok) and g.church_id = any (v_ids)) x on true;

  -- consolidado (só igrejas incluídas); repasses entre elas são neutros no resultado e se anulam no caixa
  select jsonb_build_object(
      'receitas', coalesce(sum((e->>'receitas')::numeric) filter (where (e->>'incluido')::boolean), 0),
      'despesas', coalesce(sum((e->>'despesas')::numeric) filter (where (e->>'incluido')::boolean), 0),
      'superavit', coalesce(sum((e->>'superavit')::numeric) filter (where (e->>'incluido')::boolean), 0),
      'caixaInicial', coalesce(sum((e->>'caixaInicial')::numeric) filter (where (e->>'incluido')::boolean), 0),
      'caixaFinal', coalesce(sum((e->>'caixaFinal')::numeric) filter (where (e->>'incluido')::boolean), 0),
      'repassesEnviados', coalesce(sum((e->>'repassesEnviados')::numeric) filter (where (e->>'incluido')::boolean), 0),
      'repassesRecebidos', coalesce(sum((e->>'repassesRecebidos')::numeric) filter (where (e->>'incluido')::boolean), 0))
    into v_cons from jsonb_array_elements(v_est) e;

  return jsonb_build_object(
    'periodo', jsonb_build_object('ano', p_year, 'mes', p_month, 'inicio', v_ini, 'fim', v_fim, 'geradoEm', now()),
    'entidade', jsonb_build_object('id', v_mz.church_id, 'nome', v_mz.nome, 'cnpj', v_mz.cnpj, 'raiz', left(regexp_replace(v_mz.cnpj, '\D', '', 'g'), 8)),
    'estabelecimentos', v_est,
    'consolidado', v_cons || jsonb_build_object('repassesEmTransito', (v_cons->>'repassesEnviados')::numeric - (v_cons->>'repassesRecebidos')::numeric),
    'parcial', exists (select 1 from jsonb_array_elements(v_est) e where not (e->>'incluido')::boolean),
    -- receitas e despesas por categoria, somadas no grupo e abertas por estabelecimento
    'categorias', coalesce((select jsonb_agg(jsonb_build_object('codigo', c.code, 'nome', c.name, 'contabil', coalesce(c.accounting_code, ''), 'natureza', c.nature,
         'valor', t.v, 'porEstabelecimento', t.por) order by c.nature desc, c.code)
       from (select y.category_id, sum(y.v) v, jsonb_object_agg(y.church_id, y.v) por
               from (select m.category_id, m.church_id, sum(m.amount * m.result_effect) v
                       from app.financial_movements m join app.financial_accounts a on a.id = m.account_id
                      where m.church_id = any (v_ids) and a.entity_id is null and m.status = any (v_ok) and m.result_effect <> 0 and m.movement_date between v_ini and v_fim
                      group by 1, 2) y group by 1) t
       join app.financial_categories c on c.id = t.category_id), '[]'::jsonb),
    -- partes relacionadas: Instituto(s) com CNPJ próprio (fora do consolidado)
    'partesRelacionadas', coalesce((select jsonb_agg(jsonb_build_object('nome', e.legal_name, 'cnpj', coalesce(e.cnpj, ''), 'igreja', e.church_id))
       from app.v39_fin_entities e where e.kind = 'institute' and e.is_active and e.church_id = any (v_ids)), '[]'::jsonb));
end $f$;

-- lançamento de repasse: estorno só pela tela de repasses (os dois lados juntos)
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
     or m.source_module = 'v39_repasse'
     or exists (select 1 from app.financial_expense_payments where financial_movement_id = p_id)
     or exists (select 1 from app.financial_commitment_receipts where financial_movement_id = p_id)
     or exists (select 1 from app.financial_source_batch_items where financial_movement_id = p_id)
     or exists (select 1 from app.financial_card_purchases where financial_movement_id = p_id) then
    perform app.raise_domain_error('FIN_REVERSE_AT_ORIGIN', 'Estorne pela tela de origem (despesa, compromisso, lote ou transferencia)'); end if;
  v_new := app.reverse_financial_movement(p_id, v_me, v_r);
  return jsonb_build_object('id', v_new);
end $f$;

revoke all on function private.v39_fin_group(uuid) from public, anon, authenticated;
revoke all on function app.v39_fin_group_info(uuid), app.v39_fin_repasse(uuid,jsonb), app.v39_fin_repasse_reverse(uuid,uuid,text),
  app.v39_fin_repasses(uuid,integer,integer), app.v39_fin_group_report(uuid,integer,integer) from public, anon;
grant execute on function app.v39_fin_group_info(uuid), app.v39_fin_repasse(uuid,jsonb), app.v39_fin_repasse_reverse(uuid,uuid,text),
  app.v39_fin_repasses(uuid,integer,integer), app.v39_fin_group_report(uuid,integer,integer) to authenticated;

commit;

notify pgrst, 'reload schema';

-- VERIFICACAO (tudo deve ser true)
select
  has_function_privilege('authenticated', 'app.v39_fin_group_report(uuid,integer,integer)', 'EXECUTE') and has_function_privilege('authenticated', 'app.v39_fin_repasse(uuid,jsonb)', 'EXECUTE') as rpcs_ok,
  not has_function_privilege('anon', 'app.v39_fin_repasse(uuid,jsonb)', 'EXECUTE') as anon_fechado,
  not has_function_privilege('authenticated', 'private.v39_fin_group(uuid)', 'EXECUTE') as helper_fechado,
  position('v39_repasse' in pg_get_functiondef('app.v39_fin_reverse_movement(uuid,uuid,text)'::regprocedure)) > 0 as estorno_protegido;
