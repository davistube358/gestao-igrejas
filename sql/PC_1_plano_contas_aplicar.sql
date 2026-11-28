-- =====================================================================
-- PC_1 · Plano de contas em árvore (macro → micro) ligado aos lançamentos e aos convênios · APLICAR
-- 28/11/2026 · DATA · pedido do Diogo
-- VALIDACAO: rode antes PC_1_plano_contas_teste_rollback.sql (deve terminar em "TESTE PC_1 CONCLUIDO (nada foi gravado)").
-- ---------------------------------------------------------------------
-- Decisões do Diogo (28/11):
--   - Só a conta FINAL (analítica) recebe lançamento; a conta-GRUPO (sintética) só soma as contas abaixo.
--   - As contas padrão do sistema (Dízimo, Oferta...) são únicas para todas as igrejas: cada igreja escolhe o grupo
--     delas (app.v39_fin_category_place). O código contábil delas também passa a ser POR IGREJA (antes, editar o código
--     do "Dízimo" numa igreja mudava nas outras).
--   - Convênio: a conta bancária exclusiva continua sendo a fonte do recebido/gasto (Lei 13.019/14, art. 51). O convênio
--     passa a ter as suas contas contábeis (grupo vale para as contas abaixo) e a prestação de contas mostra a árvore e as
--     DIVERGÊNCIAS: despesa/receita com conta do convênio feita por OUTRA conta bancária, e lançamento na conta do
--     convênio com conta contábil de fora.
--   - Plano modelo (ITG 2002, entidade sem fins lucrativos): grupos 3 Receitas e 4 Despesas, criados por igreja pelo botão
--     em Cadastros › Plano de contas (app.v39_fin_plano_modelo). Códigos contábeis dos grupos sugeridos: [CONFIRMAR] com o contador.
-- Estrutura nova: coluna financial_categories.is_group; tabelas app.v39_fin_category_place e app.v39_fin_grant_categories
--   (RLS ligada, sem acesso direto; só pelas funções).
-- Funções novas (internas): v39_fin_cat_pai, _cat_code, _cat_arvore, _cat_ramo, _grant_ramo, _cat_em_uso, _cat_tem_filhos,
--   _grant_cats_set, _grant_diverg; gatilhos v39_fin_cat_guard, v39_fin_cat_place_guard, v39_fin_cat_folha (5 tabelas).
-- RPC nova: app.v39_fin_plano_modelo(church) (financial.categories.manage).
-- Funções existentes alteradas (create or replace; assinatura, retorno e grants iguais; só ACRESCENTAM campos):
--   private.v39_fin_check_category, private.v39_fin_cat, app.v39_fin_save_category, private.v39_fin_catalogs__d5raw,
--   app.v39_fin_grant_save, app.v39_fin_grants_list, private.v39_fin_grant_report__d5raw; e troca de c.accounting_code pelo
--   código da igreja em private.v39_fin_report__d5raw, app.v39_fin_group_report e app.v39_fin_close_period.
-- Dados existentes: nenhuma conta vira grupo; nenhum lançamento muda. Reverter: PC_1_plano_contas_reverter.sql.
-- Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

-- ===================== 1. ESTRUTURA =====================
alter table app.financial_categories add column if not exists is_group boolean not null default false;
comment on column app.financial_categories.is_group is 'PC-1: conta-grupo (sintetica). So soma as contas abaixo; nao recebe lancamento.';

-- posição (grupo pai) e código contábil das contas PADRÃO do sistema, POR IGREJA (a conta padrão é única para todas as igrejas)
create table if not exists app.v39_fin_category_place (
  church_id uuid not null references app.churches(id) on update restrict on delete restrict,
  category_id uuid not null references app.financial_categories(id) on update restrict on delete restrict,
  parent_category_id uuid references app.financial_categories(id) on update restrict on delete restrict,
  accounting_code text,
  updated_at timestamptz not null default now(),
  updated_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict,
  primary key (church_id, category_id));
create index if not exists v39_fin_category_place_parent_idx on app.v39_fin_category_place (parent_category_id) where parent_category_id is not null;
alter table app.v39_fin_category_place enable row level security;
revoke all on app.v39_fin_category_place from public, anon, authenticated;

-- contas contábeis do convênio (grupo = vale para todas as contas abaixo dele). Nada é apagado: retirar = status 'removed'.
create table if not exists app.v39_fin_grant_categories (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references app.churches(id) on update restrict on delete restrict,
  grant_id uuid not null references app.v39_fin_grants(id) on update restrict on delete restrict,
  category_id uuid not null references app.financial_categories(id) on update restrict on delete restrict,
  status text not null default 'active' check (status in ('active', 'removed')),
  created_at timestamptz not null default now(),
  created_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict,
  removed_at timestamptz,
  removed_by_user_account_id uuid references app.user_accounts(id) on update restrict on delete restrict,
  removal_reason text,
  constraint v39_fin_grant_categories_removed_ck check ((status = 'removed') = (removed_at is not null)));
create unique index if not exists v39_fin_grant_categories_active_uq on app.v39_fin_grant_categories (grant_id, category_id) where status = 'active';
create index if not exists v39_fin_grant_categories_cat_idx on app.v39_fin_grant_categories (category_id) where status = 'active';
alter table app.v39_fin_grant_categories enable row level security;
revoke all on app.v39_fin_grant_categories from public, anon, authenticated;

-- ===================== 2. ÁRVORE (funções internas) =====================
create or replace function private.v39_fin_cat_pai(p_church uuid, p_cat uuid) returns uuid
language sql stable security definer set search_path = pg_catalog, app as $f$
  select case when c.church_id is null
              then (select pl.parent_category_id from app.v39_fin_category_place pl where pl.church_id = p_church and pl.category_id = c.id)
              else c.parent_category_id end
    from app.financial_categories c where c.id = p_cat
$f$;

create or replace function private.v39_fin_cat_code(p_church uuid, p_cat uuid) returns text
language sql stable security definer set search_path = pg_catalog, app as $f$
  select case when c.church_id is null
              then coalesce(nullif(btrim((select pl.accounting_code from app.v39_fin_category_place pl where pl.church_id = p_church and pl.category_id = c.id)), ''), c.accounting_code)
              else c.accounting_code end
    from app.financial_categories c where c.id = p_cat
$f$;

-- todas as contas que a igreja enxerga, com pai, nível e caminho ("Despesas › Administrativas › Energia")
create or replace function private.v39_fin_cat_arvore(p_church uuid)
returns table (id uuid, pai_id uuid, grupo boolean, natureza text, nivel integer, caminho text, ordem text)
language sql stable security definer set search_path = pg_catalog, app as $f$
  with recursive b as (
    select c.id, case when c.church_id is null then pl.parent_category_id else c.parent_category_id end pai, c.is_group, c.nature, c.name,
           coalesce(nullif(btrim(case when c.church_id is null then coalesce(nullif(btrim(pl.accounting_code), ''), c.accounting_code) else c.accounting_code end), ''), '~' || c.name) chave
      from app.financial_categories c
      left join app.v39_fin_category_place pl on c.church_id is null and pl.church_id = p_church and pl.category_id = c.id
     where c.church_id = p_church or c.church_id is null),
  r as (
    select b.id, b.pai, b.is_group, b.nature, 0 nivel, b.name::text caminho, b.chave::text ordem, array[b.id] vis
      from b where b.pai is null or not exists (select 1 from b x where x.id = b.pai)
    union all
    select b.id, b.pai, b.is_group, b.nature, r.nivel + 1, r.caminho || ' › ' || b.name, r.ordem || '|' || b.chave, r.vis || b.id
      from b join r on b.pai = r.id where not (b.id = any (r.vis)) and r.nivel < 12)
  select r.id, r.pai, r.is_group, r.nature, r.nivel, r.caminho, r.ordem from r
$f$;

-- as contas indicadas e todas as que estão abaixo delas
create or replace function private.v39_fin_cat_ramo(p_church uuid, p_cats uuid[]) returns uuid[]
language sql stable security definer set search_path = pg_catalog, app as $f$
  with recursive b as (
    select c.id, case when c.church_id is null then pl.parent_category_id else c.parent_category_id end pai
      from app.financial_categories c
      left join app.v39_fin_category_place pl on c.church_id is null and pl.church_id = p_church and pl.category_id = c.id
     where c.church_id = p_church or c.church_id is null),
  r as (select b.id, array[b.id] vis from b where b.id = any (coalesce(p_cats, '{}'::uuid[]))
        union all
        select b.id, r.vis || b.id from b join r on b.pai = r.id where not (b.id = any (r.vis)) and cardinality(r.vis) < 13)
  select coalesce(array_agg(distinct r.id), '{}'::uuid[]) from r
$f$;

create or replace function private.v39_fin_grant_ramo(p_grant uuid) returns uuid[]
language sql stable security definer set search_path = pg_catalog, app, private as $f$
  select coalesce((select private.v39_fin_cat_ramo(g.church_id, array(select gc.category_id from app.v39_fin_grant_categories gc where gc.grant_id = g.id and gc.status = 'active'))
                     from app.v39_fin_grants g where g.id = p_grant), '{}'::uuid[])
$f$;

create or replace function private.v39_fin_cat_em_uso(p_cat uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, app as $f$
  select exists (select 1 from app.financial_movements where category_id = p_cat)
      or exists (select 1 from app.financial_expenses where category_id = p_cat)
      or exists (select 1 from app.financial_expense_recurrences where category_id = p_cat)
      or exists (select 1 from app.financial_expense_requests where category_id = p_cat)
      or exists (select 1 from app.financial_source_batch_items where category_id = p_cat)
      or exists (select 1 from app.v39_fin_meta where key like 'camp_cat:%' and value::text = p_cat::text)
$f$;

create or replace function private.v39_fin_cat_tem_filhos(p_cat uuid, p_so_ativas boolean) returns boolean
language sql stable security definer set search_path = pg_catalog, app as $f$
  select exists (select 1 from app.financial_categories where parent_category_id = p_cat and (not p_so_ativas or is_active))
      or exists (select 1 from app.v39_fin_category_place pl join app.financial_categories c on c.id = pl.category_id
                  where pl.parent_category_id = p_cat and (not p_so_ativas or c.is_active))
$f$;

-- ===================== 3. REGRAS (gatilhos) =====================
create or replace function private.v39_fin_cat_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare p record; v_cur uuid; v_n int := 0; v_novo_pai boolean := true;
begin
  if tg_op = 'UPDATE' then
    v_novo_pai := new.parent_category_id is distinct from old.parent_category_id;
    if old.is_group and private.v39_fin_cat_tem_filhos(new.id, false)
       and (not new.is_group or new.nature <> old.nature or new.church_id is distinct from old.church_id) then
      perform app.raise_domain_error('FIN_CATEGORY_HAS_CHILDREN', 'Grupo com contas abaixo: mova as contas antes'); end if;
    if old.is_active and not new.is_active and private.v39_fin_cat_tem_filhos(new.id, true) then
      perform app.raise_domain_error('FIN_CATEGORY_HAS_CHILDREN', 'Inative ou mova antes as contas abaixo deste grupo'); end if;
  end if;
  if new.is_group then
    if new.church_id is null then perform app.raise_domain_error('FIN_CATEGORY_GROUP_SYSTEM', 'Conta padrao do sistema nao pode ser grupo'); end if;
    if new.nature not in ('income', 'expense') then perform app.raise_domain_error('FIN_CATEGORY_GROUP_NATURE', 'Grupo so de entrada ou de saida'); end if;
    if tg_op = 'UPDATE' then
      if not old.is_group and private.v39_fin_cat_em_uso(new.id) then
        perform app.raise_domain_error('FIN_CATEGORY_GROUP_IN_USE', 'Conta com lancamentos nao pode virar grupo'); end if;
    end if;
  end if;
  if new.parent_category_id is not null then
    if new.church_id is null then perform app.raise_domain_error('FIN_CATEGORY_PARENT_INVALID', 'Conta padrao usa a posicao por igreja'); end if;
    select * into p from app.financial_categories where id = new.parent_category_id;
    if p.id is null or p.church_id is distinct from new.church_id or not p.is_group or p.nature <> new.nature or (v_novo_pai and not p.is_active) then
      perform app.raise_domain_error('FIN_CATEGORY_PARENT_INVALID', 'O pai deve ser um grupo ativo da mesma igreja e natureza'); end if;
    v_cur := new.parent_category_id;
    while v_cur is not null and v_n < 20 loop
      if v_cur = new.id then perform app.raise_domain_error('FIN_CATEGORY_CYCLE', 'Um grupo nao pode ficar dentro dele mesmo'); end if;
      select c.parent_category_id into v_cur from app.financial_categories c where c.id = v_cur; v_n := v_n + 1;
    end loop;
  end if;
  return new;
end $f$;
create or replace trigger v39_fin_cat_guard before insert or update on app.financial_categories
  for each row execute function private.v39_fin_cat_guard();

create or replace function private.v39_fin_cat_place_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare c record; p record; v_novo_pai boolean := true;
begin
  if tg_op = 'UPDATE' then v_novo_pai := new.parent_category_id is distinct from old.parent_category_id; end if;
  select * into c from app.financial_categories where id = new.category_id;
  if c.id is null or c.church_id is not null then perform app.raise_domain_error('FIN_CATEGORY_INVALID', 'So contas padrao do sistema usam posicao por igreja'); end if;
  if new.parent_category_id is not null then
    select * into p from app.financial_categories where id = new.parent_category_id;
    if p.id is null or p.church_id is distinct from new.church_id or not p.is_group or p.nature <> c.nature or (v_novo_pai and not p.is_active) then
      perform app.raise_domain_error('FIN_CATEGORY_PARENT_INVALID', 'O pai deve ser um grupo ativo da mesma igreja e natureza'); end if;
  end if;
  new.accounting_code := nullif(btrim(coalesce(new.accounting_code, '')), '');
  return new;
end $f$;
create or replace trigger v39_fin_cat_place_guard before insert or update on app.v39_fin_category_place
  for each row execute function private.v39_fin_cat_place_guard();

-- conta-grupo não recebe lançamento (vale para todas as telas e funções, não só para as RPCs)
create or replace function private.v39_fin_cat_folha() returns trigger
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_mudou boolean := true;
begin
  if tg_op = 'UPDATE' then v_mudou := new.category_id is distinct from old.category_id; end if;
  if v_mudou and new.category_id is not null and exists (select 1 from app.financial_categories where id = new.category_id and is_group) then
    perform app.raise_domain_error('FIN_CATEGORY_GROUP', 'Conta-grupo nao recebe lancamento: escolha uma conta abaixo dele'); end if;
  return new;
end $f$;
create or replace trigger v39_fin_cat_folha before insert or update of category_id on app.financial_movements for each row execute function private.v39_fin_cat_folha();
create or replace trigger v39_fin_cat_folha before insert or update of category_id on app.financial_expenses for each row execute function private.v39_fin_cat_folha();
create or replace trigger v39_fin_cat_folha before insert or update of category_id on app.financial_expense_recurrences for each row execute function private.v39_fin_cat_folha();
create or replace trigger v39_fin_cat_folha before insert or update of category_id on app.financial_expense_requests for each row execute function private.v39_fin_cat_folha();
create or replace trigger v39_fin_cat_folha before insert or update of category_id on app.financial_source_batch_items for each row execute function private.v39_fin_cat_folha();

-- ===================== 4. FUNÇÕES EXISTENTES ALTERADAS =====================
-- validação central das RPCs de lançamento: grupo recusado com mensagem própria
create or replace function private.v39_fin_check_category(p_church_id uuid, p_cat uuid, p_nature text) returns void
language plpgsql stable security definer set search_path = pg_catalog, app as $f$
begin
  if exists (select 1 from app.financial_categories where id = p_cat and is_group) then
    perform app.raise_domain_error('FIN_CATEGORY_GROUP', 'Conta-grupo nao recebe lancamento: escolha uma conta abaixo dele'); end if;
  if not exists (select 1 from app.financial_categories where id = p_cat and (church_id = p_church_id or church_id is null)
                  and is_active and nature = p_nature) then
    perform app.raise_domain_error('FIN_CATEGORY_INVALID', 'Categoria invalida para este lancamento');
  end if;
end $f$;

-- busca/cria conta por código ou nome (saldo inicial, lotes): nunca devolve um grupo
create or replace function private.v39_fin_cat(p_church_id uuid, p_code text, p_name text, p_nature text, p_like text default null) returns uuid
language plpgsql security definer set search_path = pg_catalog, app as $f$
declare v_id uuid;
begin
  select id into v_id from app.financial_categories
   where (church_id = p_church_id or church_id is null) and is_active and not is_group and nature = p_nature and code = p_code limit 1;
  if v_id is null and p_like is not null then
    select id into v_id from app.financial_categories
     where (church_id = p_church_id or church_id is null) and is_active and not is_group and nature = p_nature and name ilike p_like
     order by (church_id is null), code limit 1;
  end if;
  if v_id is null then
    insert into app.financial_categories (id, church_id, code, name, nature, is_system, is_active, created_at, updated_at)
    values (gen_random_uuid(), p_church_id, p_code, p_name, p_nature, false, true, now(), now()) returning id into v_id;
  end if;
  return v_id;
end $f$;

-- cadastro de conta: pai, grupo; conta padrão grava pai e código POR IGREJA (antes o código ia para a conta global e valia para todas as igrejas)
create or replace function app.v39_fin_save_category(p_church_id uuid, p_id uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_me uuid := private.v39_fin_me(); v_id uuid := p_id; v_cid uuid; v_cchurch uuid; v_csys boolean; v_cgrp boolean;
  v_nome text := btrim(coalesce(p_payload->>'nome', '')); v_cod text := btrim(coalesce(p_payload->>'codigo', ''));
  v_nat text := coalesce(nullif(p_payload->>'natureza', ''), 'expense');
  v_ctb text := nullif(btrim(coalesce(p_payload->>'contabil', '')), ''); v_pai uuid; v_grp boolean;
begin
  perform private.v39_fin_need(p_church_id, 'financial.categories.manage');
  if v_id is not null then
    select id, church_id, is_system, is_group into v_cid, v_cchurch, v_csys, v_cgrp
      from app.financial_categories where id = v_id and (church_id is null or church_id = p_church_id);
    if v_cid is null then perform app.raise_domain_error('FIN_NOT_FOUND', 'Categoria nao encontrada'); end if;
  end if;
  -- campo ausente = mantém o que já está gravado
  v_pai := case when p_payload ? 'paiId' then private.v39_fin_uuid(p_payload, 'paiId')
                when v_cid is null then null else private.v39_fin_cat_pai(p_church_id, v_cid) end;
  v_grp := case when p_payload ? 'grupo' then coalesce((p_payload->>'grupo')::boolean, false) else coalesce(v_cgrp, false) end;
  if v_cid is not null and v_cchurch is null then
    insert into app.v39_fin_category_place (church_id, category_id, parent_category_id, accounting_code, updated_at, updated_by_user_account_id)
    values (p_church_id, v_id, v_pai, v_ctb, now(), v_me)
    on conflict (church_id, category_id) do update set parent_category_id = excluded.parent_category_id, accounting_code = excluded.accounting_code,
       updated_at = now(), updated_by_user_account_id = v_me;
  elsif v_cid is not null and v_csys then
    update app.financial_categories set accounting_code = v_ctb, parent_category_id = v_pai, updated_at = now(), updated_by_user_account_id = v_me
     where id = v_id and church_id = p_church_id;
  else
    if v_nome = '' or v_cod = '' then perform app.raise_domain_error('FIN_NAME_REQUIRED', 'Informe codigo e nome'); end if;
    if v_nat not in ('income','expense','neutral') then perform app.raise_domain_error('FIN_STATUS_INVALID', 'Natureza invalida'); end if;
    if v_id is null then
      insert into app.financial_categories (id, church_id, parent_category_id, code, name, nature, description, is_system, is_active, is_group,
          accounting_code, created_at, updated_at, created_by_user_account_id, updated_by_user_account_id)
      values (gen_random_uuid(), p_church_id, v_pai, v_cod, v_nome, v_nat, nullif(p_payload->>'descricao', ''), false,
          coalesce((p_payload->>'ativa')::boolean, true), v_grp, v_ctb, now(), now(), v_me, v_me)
      returning id into v_id;
    else
      update app.financial_categories set code = v_cod, name = v_nome, nature = v_nat, parent_category_id = v_pai, is_group = v_grp,
          description = nullif(p_payload->>'descricao', ''), is_active = coalesce((p_payload->>'ativa')::boolean, true),
          accounting_code = v_ctb, updated_at = now(), updated_by_user_account_id = v_me
       where id = v_id and church_id = p_church_id;
    end if;
  end if;
  insert into app.financial_history (church_id, entity_type, entity_id, action, performed_by_user_account_id, occurred_at, metadata)
  values (p_church_id, 'category', v_id, case when p_id is null then 'v39_create' else 'v39_update' end, v_me, now(), p_payload);
  return app.v39_fin_catalogs(p_church_id);
end $f$;

-- catálogo: categorias com pai (por igreja), grupo, nível, caminho e código contábil da igreja
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
    'categorias', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'codigo', c.code, 'nome', c.name, 'natureza', c.nature,
        'paiId', t.pai_id, 'descricao', c.description, 'ativa', c.is_active, 'sistema', c.is_system or c.church_id is null,
        'contabil', private.v39_fin_cat_code(p_church_id, c.id), 'grupo', c.is_group, 'nivel', coalesce(t.nivel, 0), 'caminho', coalesce(t.caminho, c.name)) order by c.nature, c.code)
      from app.financial_categories c left join private.v39_fin_cat_arvore(p_church_id) t on t.id = c.id
     where c.church_id = p_church_id or c.church_id is null), '[]'::jsonb),
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

-- ===================== 5. PLANO DE CONTAS MODELO =====================
-- Cria os grupos que faltam e encaixa as contas atuais. Não mexe em conta que já tem grupo. Pode rodar de novo (não duplica).
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

-- ===================== 6. CONVÊNIO x PLANO DE CONTAS =====================
create or replace function private.v39_fin_grant_cats_set(p_church uuid, p_grant uuid, p_ids jsonb, p_me uuid) returns void
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_ids uuid[]; v_bad int;
begin
  if p_ids is null or jsonb_typeof(p_ids) <> 'array' then perform app.raise_domain_error('FIN_CATEGORY_INVALID', 'Lista de contas contabeis invalida'); end if;
  select coalesce(array_agg(distinct x.v::uuid), '{}'::uuid[]) into v_ids from jsonb_array_elements_text(p_ids) x(v) where nullif(btrim(x.v), '') is not null;
  select count(*) into v_bad from unnest(v_ids) u
   where not exists (select 1 from app.financial_categories c where c.id = u and (c.church_id = p_church or c.church_id is null) and c.nature in ('income', 'expense')
                       and (c.is_active or exists (select 1 from app.v39_fin_grant_categories g where g.grant_id = p_grant and g.category_id = u and g.status = 'active')));
  if v_bad > 0 then perform app.raise_domain_error('FIN_CATEGORY_INVALID', 'Conta contabil invalida para o convenio'); end if;
  update app.v39_fin_grant_categories set status = 'removed', removed_at = now(), removed_by_user_account_id = p_me, removal_reason = 'Retirada no cadastro do convenio'
   where grant_id = p_grant and status = 'active' and not (category_id = any (v_ids));
  insert into app.v39_fin_grant_categories (church_id, grant_id, category_id, created_by_user_account_id)
  select p_church, p_grant, u, p_me from unnest(v_ids) u
   where not exists (select 1 from app.v39_fin_grant_categories g where g.grant_id = p_grant and g.category_id = u and g.status = 'active');
end $f$;

-- divergências: lançamento com conta do convênio pago/recebido por OUTRA conta bancária, e lançamento na conta do convênio com conta contábil de fora
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

-- cadastro do convênio: igual ao anterior + "contasContabeis" (lista de ids; ausente = não mexe)
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
  if p ? 'contasContabeis' then perform private.v39_fin_grant_cats_set(p_church_id, v_id, p->'contasContabeis', v_me); end if;
  return jsonb_build_object('ok', true, 'id', v_id);
exception when unique_violation then perform app.raise_domain_error('GRANT_ACCOUNT_IN_USE', 'Esta conta ja esta vinculada a outro convenio ativo'); return null;
end $f$;

-- lista: igual à anterior + contas contábeis ligadas e número de divergências na vigência
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

-- prestação de contas: igual à anterior (conta bancária é a fonte) + contas contábeis do convênio, caminho, marcação e divergências
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

-- ===================== 7. RELATÓRIOS: código contábil da igreja =====================
-- Troca c.accounting_code por private.v39_fin_cat_code(p_church_id, c.id) no balancete, no consolidado do grupo e no fechamento do mês.
do $p$
declare f regprocedure; v_def text; v_n int;
begin
  foreach f in array array['private.v39_fin_report__d5raw(uuid,integer,integer)', 'app.v39_fin_group_report(uuid,integer,integer)', 'app.v39_fin_close_period(uuid,integer,integer,text)']::regprocedure[] loop
    v_def := pg_get_functiondef(f);
    v_n := (select count(*) from regexp_matches(v_def, 'c\.accounting_code', 'g'));
    if v_n = 0 then
      if position('private.v39_fin_cat_code(p_church_id, c.id)' in v_def) = 0 then raise exception 'PC-1: % sem c.accounting_code e sem v39_fin_cat_code', f; end if;
    else
      execute replace(v_def, 'c.accounting_code', 'private.v39_fin_cat_code(p_church_id, c.id)');
    end if;
  end loop;
end $p$;

-- ===================== 8. PERMISSÕES =====================
revoke all on function private.v39_fin_cat_pai(uuid, uuid) from public, anon, authenticated;
revoke all on function private.v39_fin_cat_code(uuid, uuid) from public, anon, authenticated;
revoke all on function private.v39_fin_cat_arvore(uuid) from public, anon, authenticated;
revoke all on function private.v39_fin_cat_ramo(uuid, uuid[]) from public, anon, authenticated;
revoke all on function private.v39_fin_grant_ramo(uuid) from public, anon, authenticated;
revoke all on function private.v39_fin_cat_em_uso(uuid) from public, anon, authenticated;
revoke all on function private.v39_fin_cat_tem_filhos(uuid, boolean) from public, anon, authenticated;
revoke all on function private.v39_fin_cat_guard() from public, anon, authenticated;
revoke all on function private.v39_fin_cat_place_guard() from public, anon, authenticated;
revoke all on function private.v39_fin_cat_folha() from public, anon, authenticated;
revoke all on function private.v39_fin_grant_cats_set(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function private.v39_fin_grant_diverg(uuid, date, date) from public, anon, authenticated;
revoke all on function app.v39_fin_plano_modelo(uuid) from public, anon;
grant execute on function app.v39_fin_plano_modelo(uuid) to authenticated;

commit;
