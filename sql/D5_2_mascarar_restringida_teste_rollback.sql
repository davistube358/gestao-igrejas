-- =====================================================================
-- D5_2 · LGPD · nome da restringida mascarado · TESTE COM ROLLBACK
-- ULTIMA EXECUCAO (22/11/2026, conector Supabase da conta, projeto kybrwsxvdbwjtwakczyj, pelo Claude):
--   ERROR P0001: TESTE D5_2 CONCLUIDO (nada foi gravado): G1 ok; T1 ok; T2 ok; T3 ok; T4 ok; T5 ok; T6 ok; T7 ok (REVERTER ok)
--   Conferido depois: nenhuma funcao em private.*__d5raw, sem v39_lgpd_mascarar, ACL original, sem igreja de teste.
-- Roda o conteudo do _aplicar e do _reverter (sem begin/commit) num bloco so, com dados ficticios.
-- Casos:
--   G1  as 18 funcoes existem em app, 1 versao cada, jsonb, security definer, ACL original; guarda md5 do corpo
--   T1  ANTES: v39_fin_overview (master) mostra o nome da pessoa R (ainda ativa) e da pessoa N
--   T2  DEPOIS de aplicar, SEM restringida: o envelope devolve exatamente o mesmo JSON que a original
--   T3  estrutura: 18 envelopes (mesma assinatura e volatilidade, grant authenticated), originais em private sem EXECUTE
--   T4  R vira restringida: overview nao tem nome nem apelido de R, tem a mascara, N continua e o valor 123.45 continua
--   T5  mascarar(): troca so valor exato (nome dentro de frase fica) e ignora anonimizada
--   T6  chamadas internas pelo nome continuam funcionando (envelope de v39_fin_catalogs chamado por role authenticated)
--   T7  REVERTER: corpos com md5 original, ACL original, sem private.*__d5raw e sem mascarar; R volta a aparecer
-- NAO GRAVA NADA: tudo e desfeito pelo raise final.
-- =====================================================================
do $t$
declare
  v_nomes text[] := array['get_gc_meeting','list_gc_meetings','get_growth_group','list_growth_groups','v39_list_life_home',
    'v39_fin_campaigns','v39_fin_catalogs','v39_fin_expenses','v39_fin_overview','v39_fin_report','v39_fin_grant_report',
    'v39_mural_list','v39_gc_team','v39_gc_discipulos','v39_list_sectors','v39_message_recipients','list_active_users',
    'v39_access_request_names'];
  v_ch uuid := gen_random_uuid(); v_au_m uuid := gen_random_uuid();
  v_p_m uuid; v_p_r uuid; v_p_n uuid; v_ua_m uuid; v_cua uuid; v_master uuid; v_acc uuid; v_cat uuid;
  v_md5 text; v_md5b text; v_vol text; v_volb text; j0 jsonb; j1 jsonb; j2 jsonb; t text; v_n int; v_res text := '';
  v text; r record; v_call text; v_ident text;
  c_mask constant text := 'Pessoa com tratamento restrito';
  v_ano int := extract(year from current_date)::int; v_mes int := extract(month from current_date)::int;
begin
  -- G1
  foreach v in array v_nomes loop
    select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app' and p.proname = v and pg_get_function_result(p.oid) = 'jsonb' and p.prosecdef and p.proargmodes is null
       and p.proacl::text = '{postgres=X/postgres,authenticated=X/postgres}';
    if v_n <> 1 then raise exception 'FALHOU G1: app.% fora do esperado', v; end if;
  end loop;
  select string_agg(p.proname || ':' || md5(p.prosrc), '|' order by p.proname), string_agg(p.proname || ':' || p.provolatile::text, '|' order by p.proname)
    into v_md5, v_vol from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and p.proname = any (v_nomes);
  if exists (select 1 from app.people where status = 'restricted' and anonymized_at is null) then
    raise exception 'FALHOU G1b: ja existe pessoa restringida no banco (o T2 assume nenhuma)';
  end if;
  v_res := v_res || 'G1 ok; ';

  -- dados ficticios
  select id into v_master from app.access_profiles where code = 'master' and is_active;
  insert into app.churches (id, name, slug) values (v_ch, 'Igreja Teste D5_2', 'teste-d5-2-' || left(v_ch::text, 8));
  insert into auth.users (id, email) values (v_au_m, 'd52m@teste.invalid');
  insert into app.people (full_name) values ('Teste D52 Master') returning id into v_p_m;
  insert into app.people (full_name, preferred_name) values ('Restrita Ficticia D52', 'Apelido D52') returning id into v_p_r;
  insert into app.people (full_name) values ('Normal Ficticia D52') returning id into v_p_n;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_m, v_p_m, 'active', now(), 'td52m') returning id into v_ua_m;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua_m, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_master, true, now() - interval '1 day');
  insert into app.church_people (church_id, person_id, status) values (v_ch, v_p_m, 'active'), (v_ch, v_p_r, 'active'), (v_ch, v_p_n, 'active');
  insert into app.financial_accounts (church_id, name, account_type) values (v_ch, 'Conta teste D52', 'checking') returning id into v_acc;
  insert into app.financial_categories (church_id, code, name, nature) values (v_ch, 'D52-REC', 'Receita teste D52', 'income') returning id into v_cat;
  insert into app.financial_movements (church_id, account_id, category_id, movement_type, amount, movement_date, person_id, description, source_module, idempotency_key, status, created_by_user_account_id, cash_effect, result_effect)
  values (v_ch, v_acc, v_cat, 'income', 123.45, current_date, v_p_r, 'Dizimo ficticio D52 R', 'teste_d52', 'd52-' || gen_random_uuid(), 'posted', v_ua_m, 1, 1),
         (v_ch, v_acc, v_cat, 'income', 50.00, current_date, v_p_n, 'Dizimo ficticio D52 N', 'teste_d52', 'd52-' || gen_random_uuid(), 'posted', v_ua_m, 1, 1);
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);

  -- T1 antes
  begin
    set local role authenticated;
    j0 := app.v39_fin_overview(v_ch, v_ano, v_mes);
    reset role;
  exception when others then reset role; raise exception 'FALHOU T1: % %', sqlstate, sqlerrm;
  end;
  if position('"Restrita Ficticia D52"' in j0::text) = 0 or position('"Normal Ficticia D52"' in j0::text) = 0 then
    raise exception 'FALHOU T1: nomes ausentes antes de aplicar';
  end if;
  v_res := v_res || 'T1 ok; ';

  -- APLICAR (identico ao _aplicar, sem begin/commit)
  create or replace function private.v39_lgpd_mascarar(p jsonb) returns jsonb
  language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
  declare t text; r record;
  begin
    if p is null or not exists (select 1 from app.people where status = 'restricted' and anonymized_at is null) then
      return p;
    end if;
    t := p::text;
    for r in
      select distinct n from (
        select full_name as n from app.people where status = 'restricted' and anonymized_at is null
        union all
        select preferred_name from app.people where status = 'restricted' and anonymized_at is null
      ) s
      where length(btrim(coalesce(n, ''))) >= 3
      order by n
    loop
      t := replace(t, to_jsonb(r.n)::text, to_jsonb('Pessoa com tratamento restrito'::text)::text);
    end loop;
    return t::jsonb;
  end $f$;
  revoke all on function private.v39_lgpd_mascarar(jsonb) from public, anon, authenticated;

  foreach v in array v_nomes loop
    select p.oid, pg_get_function_identity_arguments(p.oid) ident, pg_get_function_arguments(p.oid) args,
           pg_get_function_result(p.oid) ret, p.provolatile, p.prosecdef, p.proacl::text acl, p.proargnames, p.proargmodes
      into r
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app' and p.proname = v;
    select string_agg(format('%I => %I', a, a), ', ' order by o) into v_call from unnest(r.proargnames) with ordinality as x(a, o);
    execute format('alter function app.%I(%s) rename to %I', v, r.ident, v || '__d5raw');
    execute format('alter function app.%I(%s) set schema private', v || '__d5raw', r.ident);
    execute format('revoke all on function private.%I(%s) from public, anon, authenticated', v || '__d5raw', r.ident);
    execute format('create function app.%I(%s) returns jsonb language sql %s security definer set search_path = pg_catalog, app, private as $w$ select private.v39_lgpd_mascarar(private.%I(%s)) $w$',
                   v, r.args, case r.provolatile when 'v' then 'volatile' when 's' then 'stable' else 'immutable' end, v || '__d5raw', coalesce(v_call, ''));
    execute format('comment on function app.%I(%s) is %L', v, r.ident, 'D5_2 (LGPD): envelope de private.' || v || '__d5raw que mascara o nome da pessoa restringida');
    execute format('revoke all on function app.%I(%s) from public, anon', v, r.ident);
    execute format('grant execute on function app.%I(%s) to authenticated', v, r.ident);
  end loop;

  -- T2 sem restringida: mesmo JSON
  begin
    set local role authenticated;
    j1 := app.v39_fin_overview(v_ch, v_ano, v_mes);
    reset role;
  exception when others then reset role; raise exception 'FALHOU T2: % %', sqlstate, sqlerrm;
  end;
  if j1 is distinct from j0 then raise exception 'FALHOU T2: envelope mudou o JSON sem haver restringida'; end if;
  v_res := v_res || 'T2 ok; ';

  -- T3 estrutura
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = any (v_nomes) and p.prosrc like '%private.v39_lgpd_mascarar(%'
     and p.proacl::text = '{postgres=X/postgres,authenticated=X/postgres}' and p.prosecdef;
  if v_n <> 18 then raise exception 'FALHOU T3a: % de 18 envelopes', v_n; end if;
  select string_agg(p.proname || ':' || p.provolatile::text, '|' order by p.proname) into v_volb
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and p.proname = any (v_nomes);
  if v_volb is distinct from v_vol then raise exception 'FALHOU T3b: volatilidade mudou'; end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname like '%\_\_d5raw' and not has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if v_n <> 18 then raise exception 'FALHOU T3c: % de 18 originais fechadas em private', v_n; end if;
  if has_function_privilege('anon', 'app.v39_fin_overview(uuid,integer,integer)', 'EXECUTE') then raise exception 'FALHOU T3d: anon executa'; end if;
  v_res := v_res || 'T3 ok; ';

  -- T4 R restringida
  update app.people set status = 'restricted', deactivated_at = now() where id = v_p_r;
  begin
    set local role authenticated;
    j2 := app.v39_fin_overview(v_ch, v_ano, v_mes);
    reset role;
  exception when others then reset role; raise exception 'FALHOU T4: % %', sqlstate, sqlerrm;
  end;
  t := j2::text;
  if position('Restrita Ficticia D52' in t) > 0 or position('Apelido D52' in t) > 0 then raise exception 'FALHOU T4a: nome da restringida apareceu'; end if;
  if position('"' || c_mask || '"' in t) = 0 then raise exception 'FALHOU T4b: mascara ausente'; end if;
  if position('"Normal Ficticia D52"' in t) = 0 then raise exception 'FALHOU T4c: pessoa comum sumiu'; end if;
  if not exists (select 1 from jsonb_path_query(j2, '$.** ? (@.valor == 123.45)') x) then raise exception 'FALHOU T4d: lancamento da restringida sumiu'; end if;
  v_res := v_res || 'T4 ok; ';

  -- T5 mascarar: so valor exato; anonimizada ignorada
  j1 := private.v39_lgpd_mascarar(jsonb_build_object('a', 'Restrita Ficticia D52', 'b', 'Restrita Ficticia D52 · obs', 'c', array['Apelido D52', 'Outro']));
  if j1->>'a' <> c_mask or j1->>'b' <> 'Restrita Ficticia D52 · obs' or j1->'c'->>0 <> c_mask or j1->'c'->>1 <> 'Outro' then
    raise exception 'FALHOU T5a: %', j1;
  end if;
  update app.people set full_name = 'Pessoa anonimizada D52', preferred_name = null, anonymized_at = now() where id = v_p_r;
  j1 := private.v39_lgpd_mascarar(jsonb_build_object('a', 'Pessoa anonimizada D52'));
  if j1->>'a' <> 'Pessoa anonimizada D52' then raise exception 'FALHOU T5b: anonimizada mascarada'; end if;
  v_res := v_res || 'T5 ok; ';

  -- T6 envelope de outra funcao (v39_fin_catalogs) como authenticated
  begin
    set local role authenticated;
    j1 := app.v39_fin_catalogs(v_ch);
    reset role;
  exception when others then reset role; raise exception 'FALHOU T6: % %', sqlstate, sqlerrm;
  end;
  if j1 is null then raise exception 'FALHOU T6: retorno nulo'; end if;
  v_res := v_res || 'T6 ok; ';

  -- REVERTER (identico ao _reverter, sem begin/commit)
  foreach v in array v_nomes loop
    select pg_get_function_identity_arguments(p.oid) into v_ident
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = v || '__d5raw';
    execute format('drop function app.%I(%s)', v, v_ident);
    execute format('alter function private.%I(%s) set schema app', v || '__d5raw', v_ident);
    execute format('alter function app.%I(%s) rename to %I', v || '__d5raw', v_ident, v);
    execute format('grant execute on function app.%I(%s) to authenticated', v, v_ident);
  end loop;
  drop function if exists private.v39_lgpd_mascarar(jsonb);

  -- T7
  select string_agg(p.proname || ':' || md5(p.prosrc), '|' order by p.proname) into v_md5b
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and p.proname = any (v_nomes);
  if v_md5b is distinct from v_md5 then raise exception 'FALHOU T7a: corpo diferente do original'; end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = any (v_nomes) and p.proacl::text = '{postgres=X/postgres,authenticated=X/postgres}';
  if v_n <> 18 then raise exception 'FALHOU T7b: ACL diferente (% de 18)', v_n; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname like '%\_\_d5raw')
     or to_regprocedure('private.v39_lgpd_mascarar(jsonb)') is not null then
    raise exception 'FALHOU T7c: sobrou objeto do D5_2';
  end if;
  select string_agg(p.proname || ':' || p.provolatile::text, '|' order by p.proname) into v_volb
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and p.proname = any (v_nomes);
  if v_volb is distinct from v_vol then raise exception 'FALHOU T7d: volatilidade diferente'; end if;
  v_res := v_res || 'T7 ok (REVERTER ok)';

  raise exception 'TESTE D5_2 CONCLUIDO (nada foi gravado): %', v_res;
end
$t$;
