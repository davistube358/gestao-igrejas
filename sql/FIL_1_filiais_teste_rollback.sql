-- =====================================================================
-- FIL_1 · filiais como igrejas separadas · TESTE COM ROLLBACK
-- ULTIMA EXECUCAO: 22/11/2026, pelo Diogo no editor do Supabase: TESTE FIL_1 CONCLUIDO (nada foi gravado): T1 ok; T2 ok; T3 ok; T4 ok; T5 ok; T6 ok; T7 ok (REVERTER ok)
-- Gerado a partir do _aplicar e do _reverter (corpo identico, sem begin/commit/notify), com dados ficticios.
-- Casos:
--   T1  dígito verificador do CNPJ
--   T2  discípulo não cria filial; master da matriz cria (CNPJ mesma raiz): igreja com matriz, organização criada,
--       nome/cor copiados, os 2 masters da matriz viram master da filial, discípulo não entra; auditoria
--   T3  CNPJ: raiz diferente, dígito errado, CNPJ em uso; sem CNPJ cria; filial não cria filial
--   T4  lista: master vê podeCriar e acesso nas filiais; discípulo vê sem acesso
--   T5  novo master na matriz entra nas filiais (gatilho); deixando de ser master, perde o acesso dado pela sincronização
--   T6  inativar exige motivo; inativa e reativa
--   T7  REVERTER remove funções e gatilhos
-- NAO GRAVA NADA: tudo e desfeito pelo raise final.
-- =====================================================================
do $t$
declare
  v_mz uuid := gen_random_uuid();
  v_au1 uuid := gen_random_uuid(); v_au2 uuid := gen_random_uuid(); v_au3 uuid := gen_random_uuid();
  v_p uuid; v_ua1 uuid; v_ua2 uuid; v_ua3 uuid; v_cua uuid; v_cua3 uuid; v_upa3 uuid; v_master uuid; v_disc uuid;
  v_f1 uuid; v_f2 uuid; r jsonb; v_n int; v_res text := '';
begin
  -- APLICAR (identico ao _aplicar, sem begin/commit)

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


  -- T1
  if not private.v39_cnpj_valido('11.222.333/0002-62') or private.v39_cnpj_valido('11222333000263') or private.v39_cnpj_valido('11111111111111') then raise exception 'FALHOU T1'; end if;
  v_res := v_res || 'T1 ok; ';

  select id into v_master from app.access_profiles where code = 'master' and is_active;
  select id into v_disc from app.access_profiles where code = 'disciple' and is_active;
  insert into app.churches (id, name, legal_name, slug, timezone, cnpj) values (v_mz, 'Matriz FIL1', 'Matriz FIL1 LTDA', 'teste-fil1-' || left(v_mz::text, 8), 'America/Sao_Paulo', '11222333000181');
  perform private.v39_cfg_set(v_mz, 'theme.primary_color', to_jsonb('#16A36A'::text), 'color', null);
  insert into auth.users (id, email) values (v_au1, 'fil1a@teste.invalid'), (v_au2, 'fil1b@teste.invalid'), (v_au3, 'fil1c@teste.invalid');
  insert into app.people (full_name) values ('FIL1 Master A') returning id into v_p;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au1, v_p, 'active', now(), 'tfil1a') returning id into v_ua1;
  insert into app.people (full_name) values ('FIL1 Master B') returning id into v_p;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au2, v_p, 'active', now(), 'tfil1b') returning id into v_ua2;
  insert into app.people (full_name) values ('FIL1 Discipulo') returning id into v_p;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au3, v_p, 'active', now(), 'tfil1c') returning id into v_ua3;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_mz, v_ua1, 'active', now() - interval '1 day', now() - interval '1 day', v_ua1) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_master, true, now() - interval '1 day');
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_mz, v_ua2, 'active', now() - interval '1 day', now() - interval '1 day', v_ua1) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_master, true, now() - interval '1 day');
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_mz, v_ua3, 'active', now() - interval '1 day', now() - interval '1 day', v_ua1) returning id into v_cua3;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua3, v_disc, true, now() - interval '1 day');

  -- T2
  perform set_config('request.jwt.claims', json_build_object('sub', v_au3, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au3::text, true);
  begin set local role authenticated; perform app.v39_branch_create(v_mz, jsonb_build_object('nome', 'Filial Hack')); reset role; raise exception 'FALHOU T2a';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'PERMISSION_DENIED' then raise exception 'FALHOU T2a: %', sqlerrm; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au1::text, true);
  begin set local role authenticated;
    r := app.v39_branch_create(v_mz, jsonb_build_object('nome', 'Filial Centro', 'razaoSocial', 'Matriz FIL1 LTDA - Filial', 'cnpj', '11.222.333/0002-62',
           'endereco', jsonb_build_object('cidade', 'Araraquara', 'uf', 'sp')));
    reset role;
  exception when others then reset role; raise exception 'FALHOU T2b: % %', sqlstate, sqlerrm; end;
  v_f1 := (r->>'id')::uuid;
  if (select parent_church_id from app.churches where id = v_f1) <> v_mz or (select cnpj from app.churches where id = v_f1) <> '11222333000262'
     or (select legal_address->>'uf' from app.churches where id = v_f1) <> 'SP' then raise exception 'FALHOU T2 igreja'; end if;
  select count(*) into v_n from app.organization_churches oc where oc.church_id in (v_mz, v_f1) and oc.status = 'active'
     and oc.organization_id = (select organization_id from app.organization_churches where church_id = v_mz and status = 'active');
  if v_n <> 2 then raise exception 'FALHOU T2 org: %', v_n; end if;
  if (select setting_value #>> '{}' from app.church_settings where church_id = v_f1 and setting_key = 'theme.primary_color') is distinct from '#16A36A'
     or not exists (select 1 from app.church_settings where church_id = v_f1 and setting_key = 'config.saved_at') then raise exception 'FALHOU T2 settings'; end if;
  select count(*) into v_n from app.church_user_access cua join app.user_profile_assignments upa on upa.church_user_access_id = cua.id
   where cua.church_id = v_f1 and cua.status = 'active' and upa.profile_id = v_master and upa.valid_until is null and cua.user_account_id in (v_ua1, v_ua2);
  if v_n <> 2 then raise exception 'FALHOU T2 masters: %', v_n; end if;
  if exists (select 1 from app.church_user_access where church_id = v_f1 and user_account_id = v_ua3) then raise exception 'FALHOU T2 discipulo entrou'; end if;
  if not exists (select 1 from audit.events where church_id = v_mz and action = 'church_branch_created' and entity_id = v_f1::text) then raise exception 'FALHOU T2 audit'; end if;
  v_res := v_res || 'T2 ok; ';

  -- T3
  begin set local role authenticated; perform app.v39_branch_create(v_mz, jsonb_build_object('nome', 'Filial X', 'cnpj', '11444777000161')); reset role; raise exception 'FALHOU T3a';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'BRANCH_CNPJ_RAIZ' then raise exception 'FALHOU T3a: %', sqlerrm; end if; end;
  begin set local role authenticated; perform app.v39_branch_create(v_mz, jsonb_build_object('nome', 'Filial X', 'cnpj', '11222333000344')); reset role; raise exception 'FALHOU T3b';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'BRANCH_CNPJ_INVALID' then raise exception 'FALHOU T3b: %', sqlerrm; end if; end;
  begin set local role authenticated; perform app.v39_branch_create(v_mz, jsonb_build_object('nome', 'Filial X', 'cnpj', '11222333000262')); reset role; raise exception 'FALHOU T3c';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'BRANCH_CNPJ_EM_USO' then raise exception 'FALHOU T3c: %', sqlerrm; end if; end;
  begin set local role authenticated; r := app.v39_branch_create(v_mz, jsonb_build_object('nome', 'Congregacao Rural')); reset role;
  exception when others then reset role; raise exception 'FALHOU T3d: % %', sqlstate, sqlerrm; end;
  v_f2 := (r->>'id')::uuid;
  begin set local role authenticated; perform app.v39_branch_create(v_f1, jsonb_build_object('nome', 'Neta')); reset role; raise exception 'FALHOU T3e';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'BRANCH_LEVEL' then raise exception 'FALHOU T3e: %', sqlerrm; end if; end;
  v_res := v_res || 'T3 ok; ';

  -- T4
  begin set local role authenticated; r := app.v39_branch_list(v_f1); reset role;
  exception when others then reset role; raise exception 'FALHOU T4a: % %', sqlstate, sqlerrm; end;
  if (r->>'podeCriar')::boolean is not true or jsonb_array_length(r->'filiais') <> 2 or (r->'matriz'->>'id')::uuid <> v_mz
     or exists (select 1 from jsonb_array_elements(r->'filiais') x where (x->>'tenhoAcesso')::boolean is not true) then raise exception 'FALHOU T4a: %', r; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au3, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au3::text, true);
  begin set local role authenticated; r := app.v39_branch_list(v_mz); reset role;
  exception when others then reset role; raise exception 'FALHOU T4b: % %', sqlstate, sqlerrm; end;
  if (r->>'podeCriar')::boolean or exists (select 1 from jsonb_array_elements(r->'filiais') x where (x->>'tenhoAcesso')::boolean) then raise exception 'FALHOU T4b: %', r; end if;
  begin set local role authenticated; perform app.v39_branch_list(v_f1); reset role; raise exception 'FALHOU T4c';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'ACCESS_DENIED' then raise exception 'FALHOU T4c: %', sqlerrm; end if; end;
  v_res := v_res || 'T4 ok; ';

  -- T5 (gatilho)
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua3, v_master, false, now()) returning id into v_upa3;
  select count(*) into v_n from app.church_user_access cua join app.user_profile_assignments upa on upa.church_user_access_id = cua.id
   where cua.church_id in (v_f1, v_f2) and cua.user_account_id = v_ua3 and cua.status = 'active' and upa.profile_id = v_master and upa.valid_until is null;
  if v_n <> 2 then raise exception 'FALHOU T5a: %', v_n; end if;
  update app.user_profile_assignments set valid_until = now() where id = v_upa3;
  select count(*) into v_n from app.church_user_access where church_id in (v_f1, v_f2) and user_account_id = v_ua3 and status = 'active';
  if v_n <> 0 then raise exception 'FALHOU T5b: %', v_n; end if;
  select count(*) into v_n from app.church_user_access where church_id in (v_f1, v_f2) and user_account_id = v_ua3 and status = 'revoked' and end_reason like 'FIL_1:%';
  if v_n <> 2 then raise exception 'FALHOU T5c: %', v_n; end if;
  v_res := v_res || 'T5 ok; ';

  -- T6
  perform set_config('request.jwt.claims', json_build_object('sub', v_au1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au1::text, true);
  begin set local role authenticated; perform app.v39_branch_set_status(v_mz, v_f2, 'inactive', 'curto'); reset role; raise exception 'FALHOU T6a';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'REASON_REQUIRED' then raise exception 'FALHOU T6a: %', sqlerrm; end if; end;
  begin set local role authenticated; perform app.v39_branch_set_status(v_mz, v_f2, 'inactive', 'Congregacao encerrou as atividades'); reset role;
  exception when others then reset role; raise exception 'FALHOU T6b: % %', sqlstate, sqlerrm; end;
  if (select status from app.churches where id = v_f2) <> 'inactive' or (select deactivated_at from app.churches where id = v_f2) is null then raise exception 'FALHOU T6b'; end if;
  begin set local role authenticated; perform app.v39_branch_set_status(v_mz, v_f2, 'active', 'Congregacao voltou a funcionar'); reset role;
  exception when others then reset role; raise exception 'FALHOU T6c: % %', sqlstate, sqlerrm; end;
  if (select status from app.churches where id = v_f2) <> 'active' then raise exception 'FALHOU T6c'; end if;
  v_res := v_res || 'T6 ok; ';

  -- T7 REVERTER (identico ao _reverter, sem begin/commit)

drop trigger if exists fil1_sync_masters_upa on app.user_profile_assignments;
drop trigger if exists fil1_sync_masters_cua on app.church_user_access;
drop function if exists app.v39_branch_set_status(uuid, uuid, text, text);
drop function if exists app.v39_branch_create(uuid, jsonb);
drop function if exists app.v39_branch_list(uuid);
drop function if exists private.v39_branch_sync_trg();
drop function if exists private.v39_branch_sync_masters(uuid);
drop function if exists private.v39_cnpj_valido(text);


  if to_regprocedure('app.v39_branch_create(uuid,jsonb)') is not null or to_regprocedure('private.v39_branch_sync_masters(uuid)') is not null
     or exists (select 1 from pg_trigger where tgname like 'fil1_%') then raise exception 'FALHOU T7'; end if;
  v_res := v_res || 'T7 ok (REVERTER ok)';

  raise exception 'TESTE FIL_1 CONCLUIDO (nada foi gravado): %', v_res;
end $t$;
