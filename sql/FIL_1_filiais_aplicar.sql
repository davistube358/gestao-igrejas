-- =====================================================================
-- FIL_1 · filiais como igrejas separadas (derivações do CNPJ da matriz) · APLICAR
-- 22/11/2026 · DATA · pedido do Diogo
-- VALIDACAO: ver cabecalho de FIL_1_filiais_teste_rollback.sql
-- ---------------------------------------------------------------------
-- Decisões do Diogo (22/11):
--   - Filial = outra igreja no 2Gather (app.churches), com membros, GCs, acessos e financeiro próprios (segregada).
--   - CNPJ da filial é opcional; se informado: 14 dígitos, dígito verificador válido, MESMA RAIZ (8 primeiros) da
--     matriz e diferente do CNPJ da matriz e de qualquer outra igreja.
--   - Os masters da matriz seguem em todas as filiais (mantido automaticamente); os demais usuários ficam só na
--     igreja/filial em que têm acesso.
-- Estrutura (DEPENDÊNCIA DATA):
--   app.churches.parent_church_id (nova coluna, opcional): a matriz da filial. Um nível só (filial não tem filial).
--   A matriz e as filiais ficam na mesma organização (app.organizations / app.organization_churches, já existentes);
--   se a matriz ainda não tiver organização, ela é criada.
-- Funções:
--   private.v39_cnpj_valido(text)                 dígitos verificadores do CNPJ.
--   private.v39_branch_sync_masters(matriz)       garante master da matriz em cada filial ativa; quem deixou de ser
--                                                 master da matriz perde o acesso dado por esta sincronização.
--   gatilhos em user_profile_assignments e church_user_access: mudanças na matriz disparam a sincronização.
--   app.v39_branch_list(church)                   matriz + filiais (qualquer membro ativo da matriz ou da filial vê a lista;
--                                                 'tenhoAcesso' diz em quais a pessoa pode entrar).
--   app.v39_branch_create(church, p)              só master da matriz. Cria a igreja filial, liga à organização,
--                                                 copia nome de exibição e cor, sincroniza os masters, audita.
--   app.v39_branch_set_status(church, branch, status, motivo)  só master da matriz; inativa/reativa (nada é apagado).
-- Reverter: FIL_1_filiais_reverter.sql (remove funções e gatilhos; a coluna e as filiais criadas ficam).
-- Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

alter table app.churches add column if not exists parent_church_id uuid references app.churches(id) on update restrict on delete restrict;
do $c$ begin
  if not exists (select 1 from pg_constraint where conname = 'churches_parent_not_self') then
    alter table app.churches add constraint churches_parent_not_self check (parent_church_id is null or parent_church_id <> id);
  end if;
end $c$;
create index if not exists churches_parent_idx on app.churches (parent_church_id) where parent_church_id is not null;
comment on column app.churches.parent_church_id is 'FIL_1: matriz desta filial (um nível). Nulo = igreja matriz/independente.';

create or replace function private.v39_cnpj_valido(p text) returns boolean
language plpgsql immutable set search_path = pg_catalog as $f$
declare c text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); s int; i int; r int; w int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
begin
  if length(c) <> 14 or c ~ '^(\d)\1{13}$' then return false; end if;
  s := 0; for i in 1..12 loop s := s + substr(c, i, 1)::int * w[i + 1]; end loop;
  r := s % 11; if (case when r < 2 then 0 else 11 - r end) <> substr(c, 13, 1)::int then return false; end if;
  s := 0; for i in 1..13 loop s := s + substr(c, i, 1)::int * w[i]; end loop;
  r := s % 11; return (case when r < 2 then 0 else 11 - r end) = substr(c, 14, 1)::int;
end $f$;

create or replace function private.v39_branch_sync_masters(p_matriz uuid) returns void
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_master uuid; f record; m uuid; v_ms uuid[]; v_acc uuid; v_status text; v_notes text; x record;
begin
  select id into v_master from app.access_profiles where code = 'master' and is_active;
  if v_master is null or not exists (select 1 from app.churches where parent_church_id = p_matriz) then return; end if;
  -- masters ativos da matriz
  select coalesce(array_agg(distinct cua.user_account_id), '{}'::uuid[]) into v_ms from app.church_user_access cua join app.user_profile_assignments upa on upa.church_user_access_id = cua.id
     where cua.church_id = p_matriz and cua.status = 'active' and upa.profile_id = v_master and (upa.valid_until is null or upa.valid_until > now());
  for f in select id from app.churches where parent_church_id = p_matriz and status = 'active' loop
    foreach m in array v_ms loop
      v_acc := null; v_status := null; v_notes := null;
      select id, status, approval_notes into v_acc, v_status, v_notes from app.church_user_access where church_id = f.id and user_account_id = m;
      if v_acc is null then
        insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id, approval_notes)
        values (f.id, m, 'active', now(), now(), m, 'FIL_1: master da matriz') returning id into v_acc;
      elsif v_status <> 'active' and coalesce(v_notes, '') like 'FIL_1:%' then
        update app.church_user_access set status = 'active', started_at = now(), approved_at = now(), approved_by_user_account_id = m,
               ended_at = null, end_reason = null, updated_at = now() where id = v_acc;
      elsif v_status <> 'active' then
        continue;   -- acesso suspenso/revogado na filial por decisão de alguém: não reabre sozinho
      end if;
      if not exists (select 1 from app.user_profile_assignments where church_user_access_id = v_acc and profile_id = v_master and (valid_until is null or valid_until > now())) then
        insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from, assignment_reason)
        values (v_acc, v_master,
                not exists (select 1 from app.user_profile_assignments where church_user_access_id = v_acc and is_primary and valid_until is null),
                now(), 'FIL_1: master da matriz');
      end if;
    end loop;
  end loop;
  -- quem deixou de ser master da matriz: encerra o que esta sincronização deu nas filiais
  for x in select upa.id upa_id, cua.id acc_id, coalesce(cua.approval_notes, '') notes
             from app.user_profile_assignments upa join app.church_user_access cua on cua.id = upa.church_user_access_id
             join app.churches ch on ch.id = cua.church_id
            where ch.parent_church_id = p_matriz and upa.assignment_reason = 'FIL_1: master da matriz' and upa.profile_id = v_master
              and (upa.valid_until is null or upa.valid_until > now())
              and not (cua.user_account_id = any(v_ms)) loop
    update app.user_profile_assignments set valid_until = greatest(now(), valid_from) where id = x.upa_id;
    if x.notes like 'FIL_1:%' and not exists (select 1 from app.user_profile_assignments where church_user_access_id = x.acc_id and (valid_until is null or valid_until > now())) then
      update app.church_user_access set status = 'revoked', ended_at = greatest(now(), coalesce(started_at, now())), end_reason = 'FIL_1: deixou de ser master da matriz', updated_at = now()
       where id = x.acc_id and status = 'active';
    end if;
  end loop;
end $f$;

create or replace function private.v39_branch_sync_trg() returns trigger
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_church uuid;
begin
  if pg_trigger_depth() > 1 then return null; end if;   -- a própria sincronização não dispara outra
  if tg_table_name = 'user_profile_assignments' then
    select church_id into v_church from app.church_user_access where id = coalesce(new.church_user_access_id, old.church_user_access_id);
  else
    v_church := coalesce(new.church_id, old.church_id);
  end if;
  if v_church is not null and exists (select 1 from app.churches where parent_church_id = v_church) then
    perform private.v39_branch_sync_masters(v_church);
  end if;
  return null;
end $f$;

drop trigger if exists fil1_sync_masters_upa on app.user_profile_assignments;
create trigger fil1_sync_masters_upa after insert or update on app.user_profile_assignments
  for each row execute function private.v39_branch_sync_trg();
drop trigger if exists fil1_sync_masters_cua on app.church_user_access;
create trigger fil1_sync_masters_cua after update of status on app.church_user_access
  for each row execute function private.v39_branch_sync_trg();

create or replace function app.v39_branch_list(p_church_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_me uuid := app.current_user_account_id(); v_matriz uuid; mz app.churches;
begin
  if v_me is null or app.current_church_user_access_id(p_church_id) is null then
    perform app.raise_domain_error('ACCESS_DENIED', 'Sem acesso ativo a esta igreja'); end if;
  select coalesce(parent_church_id, id) into v_matriz from app.churches where id = p_church_id;
  select * into mz from app.churches where id = v_matriz;
  return jsonb_build_object('ok', true,
    'atual', p_church_id,
    'matriz', jsonb_build_object('id', mz.id, 'nome', coalesce(nullif(mz.legal_name, ''), mz.name), 'cnpj', coalesce(mz.cnpj, ''),
               'tenhoAcesso', app.current_church_user_access_id(mz.id) is not null),
    'podeCriar', private.has_active_profile_in_church(v_matriz, array['master']),
    'filiais', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.name, 'razaoSocial', coalesce(c.legal_name, ''), 'cnpj', coalesce(c.cnpj, ''),
                 'cidade', coalesce(c.legal_address->>'cidade', ''), 'uf', coalesce(c.legal_address->>'uf', ''), 'status', c.status,
                 'tenhoAcesso', app.current_church_user_access_id(c.id) is not null) order by c.status, c.name)
               from app.churches c where c.parent_church_id = v_matriz), '[]'::jsonb));
end $f$;

create or replace function app.v39_branch_create(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id(); mz app.churches; v_org uuid; v_id uuid;
  v_nome text := btrim(coalesce(p->>'nome', '')); v_cnpj text := regexp_replace(coalesce(p->>'cnpj', ''), '\D', '', 'g');
  v_end jsonb := coalesce(p->'endereco', '{}'::jsonb); v_slug text; v_cor jsonb;
begin
  if v_me is null or app.current_church_user_access_id(p_church_id) is null then
    perform app.raise_domain_error('ACCESS_DENIED', 'Sem acesso ativo a esta igreja'); end if;
  select * into mz from app.churches where id = p_church_id;
  if mz.parent_church_id is not null then perform app.raise_domain_error('BRANCH_LEVEL', 'Filial nao pode ter filial: crie a partir da matriz'); end if;
  if not private.has_active_profile_in_church(p_church_id, array['master']) then
    perform app.raise_domain_error('PERMISSION_DENIED', 'So o master da matriz cria filiais'); end if;
  if length(v_nome) < 3 or length(v_nome) > 120 then perform app.raise_domain_error('BRANCH_NAME_INVALID', 'Informe o nome da filial (3 a 120 caracteres)'); end if;
  if jsonb_typeof(v_end) <> 'object' or length(coalesce(p->>'razaoSocial', '')) > 200 then perform app.raise_domain_error('BRANCH_INVALID', 'Dados invalidos'); end if;
  if v_cnpj <> '' then
    if not private.v39_cnpj_valido(v_cnpj) then perform app.raise_domain_error('BRANCH_CNPJ_INVALID', 'CNPJ invalido'); end if;
    if nullif(mz.cnpj, '') is null then perform app.raise_domain_error('BRANCH_MATRIZ_SEM_CNPJ', 'Cadastre o CNPJ da matriz antes'); end if;
    if left(v_cnpj, 8) <> left(regexp_replace(mz.cnpj, '\D', '', 'g'), 8) then perform app.raise_domain_error('BRANCH_CNPJ_RAIZ', 'O CNPJ da filial precisa ter a mesma raiz da matriz'); end if;
    if exists (select 1 from app.churches where regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = v_cnpj) then
      perform app.raise_domain_error('BRANCH_CNPJ_EM_USO', 'Este CNPJ ja pertence a outra igreja'); end if;
  end if;

  v_slug := left(trim(both '-' from regexp_replace(lower(v_nome), '[^a-z0-9]+', '-', 'g')), 50) || '-' || substr(md5(gen_random_uuid()::text), 1, 6);
  insert into app.churches (name, legal_name, slug, timezone, cnpj, legal_address, parent_church_id)
  values (v_nome, nullif(btrim(coalesce(p->>'razaoSocial', '')), ''), v_slug, mz.timezone, nullif(v_cnpj, ''),
          jsonb_build_object('cep', btrim(coalesce(v_end->>'cep', '')), 'rua', btrim(coalesce(v_end->>'rua', '')), 'numero', btrim(coalesce(v_end->>'numero', '')),
            'complemento', btrim(coalesce(v_end->>'complemento', '')), 'bairro', btrim(coalesce(v_end->>'bairro', '')), 'cidade', btrim(coalesce(v_end->>'cidade', '')),
            'uf', upper(btrim(coalesce(v_end->>'uf', '')))), p_church_id)
  returning id into v_id;

  select organization_id into v_org from app.organization_churches where church_id = p_church_id and status = 'active' and ended_at is null limit 1;
  if v_org is null then
    insert into app.organizations (code, name, legal_name, status, settings, created_by_user_account_id)
    values (mz.slug, mz.name, mz.legal_name, 'active', '{}'::jsonb, v_me) returning id into v_org;
    insert into app.organization_churches (organization_id, church_id, status, started_at, created_by_user_account_id) values (v_org, p_church_id, 'active', now(), v_me);
  end if;
  insert into app.organization_churches (organization_id, church_id, status, started_at, created_by_user_account_id) values (v_org, v_id, 'active', now(), v_me);

  -- identidade inicial: nome de exibição e cor da matriz; config.saved_at faz o app usar a configuração da filial
  perform private.v39_cfg_set(v_id, 'identity.display_name', to_jsonb(v_nome), 'string', v_me);
  select setting_value into v_cor from app.church_settings where church_id = p_church_id and lower(setting_key) = 'theme.primary_color' and is_active;
  if v_cor is not null then perform private.v39_cfg_set(v_id, 'theme.primary_color', v_cor, 'color', v_me); end if;
  perform private.v39_cfg_set(v_id, 'config.saved_at', to_jsonb(now()::text), 'string', v_me);

  perform private.v39_branch_sync_masters(p_church_id);

  insert into audit.events (church_id, actor_user_account_id, action, entity_schema, entity_name, entity_id, event_category, sensitivity, outcome, source, metadata)
  values (p_church_id, v_me, 'church_branch_created', 'app', 'churches', v_id::text, 'administrative', 'standard', 'success', 'rpc',
          jsonb_build_object('filial', v_id, 'cnpj_informado', v_cnpj <> ''));
  return jsonb_build_object('ok', true, 'id', v_id, 'lista', app.v39_branch_list(p_church_id));
end $f$;

create or replace function app.v39_branch_set_status(p_church_id uuid, p_branch_id uuid, p_status text, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_me uuid := app.current_user_account_id(); v_old text;
begin
  if v_me is null or app.current_church_user_access_id(p_church_id) is null then
    perform app.raise_domain_error('ACCESS_DENIED', 'Sem acesso ativo a esta igreja'); end if;
  if not private.has_active_profile_in_church(p_church_id, array['master']) then
    perform app.raise_domain_error('PERMISSION_DENIED', 'So o master da matriz altera filiais'); end if;
  if p_status not in ('active', 'inactive') then perform app.raise_domain_error('BRANCH_INVALID', 'Situacao invalida'); end if;
  if length(btrim(coalesce(p_reason, ''))) < 10 then perform app.raise_domain_error('REASON_REQUIRED', 'Informe o motivo (minimo de 10 caracteres)'); end if;
  select status into v_old from app.churches where id = p_branch_id and parent_church_id = p_church_id for update;
  if v_old is null then perform app.raise_domain_error('BRANCH_NOT_FOUND', 'Filial nao encontrada'); end if;
  update app.churches set status = p_status, deactivated_at = case when p_status = 'inactive' then now() else null end, updated_at = now() where id = p_branch_id;
  if p_status = 'active' then perform private.v39_branch_sync_masters(p_church_id); end if;
  insert into audit.events (church_id, actor_user_account_id, action, entity_schema, entity_name, entity_id, event_category, sensitivity, outcome, source, reason, metadata)
  values (p_church_id, v_me, 'church_branch_status', 'app', 'churches', p_branch_id::text, 'administrative', 'standard', 'success', 'rpc', btrim(p_reason),
          jsonb_build_object('de', v_old, 'para', p_status));
  return jsonb_build_object('ok', true, 'lista', app.v39_branch_list(p_church_id));
end $f$;

revoke all on function private.v39_cnpj_valido(text), private.v39_branch_sync_masters(uuid), private.v39_branch_sync_trg() from public, anon, authenticated;
revoke all on function app.v39_branch_list(uuid), app.v39_branch_create(uuid,jsonb), app.v39_branch_set_status(uuid,uuid,text,text) from public, anon;
grant execute on function app.v39_branch_list(uuid), app.v39_branch_create(uuid,jsonb), app.v39_branch_set_status(uuid,uuid,text,text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- VERIFICACAO (tudo deve ser true)
select
  exists (select 1 from information_schema.columns where table_schema = 'app' and table_name = 'churches' and column_name = 'parent_church_id') as coluna_ok,
  has_function_privilege('authenticated', 'app.v39_branch_create(uuid,jsonb)', 'EXECUTE') and not has_function_privilege('anon', 'app.v39_branch_create(uuid,jsonb)', 'EXECUTE') as rpcs_ok,
  not has_function_privilege('authenticated', 'private.v39_branch_sync_masters(uuid)', 'EXECUTE') as helper_fechado,
  private.v39_cnpj_valido('11.222.333/0001-81') and not private.v39_cnpj_valido('11.222.333/0001-82') as cnpj_ok,
  (select count(*) from pg_trigger where tgname in ('fil1_sync_masters_upa', 'fil1_sync_masters_cua')) = 2 as gatilhos_ok;
