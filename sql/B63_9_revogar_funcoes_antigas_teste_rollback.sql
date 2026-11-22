-- =====================================================================
-- B63_9 · LGPD · Revogar EXECUTE das 2 funcoes antigas · TESTE COM ROLLBACK
-- Build 63 · DATA-63b · 22/11/2026
-- ULTIMA EXECUCAO (22/11/2026, conector Supabase da conta, projeto kybrwsxvdbwjtwakczyj, pelo Claude):
--   ERROR P0001: TESTE B63_9 CONCLUIDO (nada foi gravado): G1 ok; G2 ok; T1 ok; T2 ok; T3 ok; T4 ok;
--   T5 ok; T6 ok (REVERTER ok)
--   Conferido depois: ACL das 2 funcoes continua {postgres=X/postgres,authenticated=X/postgres}.
-- ---------------------------------------------------------------------
-- Roda, dentro de um bloco so, o MESMO conteudo do _aplicar e do _reverter (sem begin/commit)
--   e confere cada efeito. NAO GRAVA NADA: tudo e desfeito pelo raise final.
-- Casos:
--   G1  as 2 funcoes existem, com SECURITY DEFINER, e a ACL e a original
--       {postgres=X/postgres,authenticated=X/postgres} (se mudou, o teste para antes de mexer)
--   G2  nenhuma outra funcao do banco chama as 2 funcoes (conferencia do cabecalho do _aplicar)
--   T1  antes de aplicar: authenticated TEM EXECUTE nas 2 (estado de hoje)
--   T2  aplicar: authenticated, anon e public sem EXECUTE nas 2
--   T3  chamada real como authenticated -> 42501 nas 2 (privilegio, antes do corpo da funcao)
--   T4  chamada real como anon -> 42501 nas 2
--   T5  postgres (dono) continua com EXECUTE; funcoes nao foram apagadas nem alteradas (md5 do corpo)
--   T6  reverter: ACL volta identica a original e authenticated volta a ter EXECUTE
-- Conferencia no front/Edges (fora do SQL; em 22/11/2026 voltou vazio, exit 1):
--   grep -rn "v39_accept_privacy_policy\|v39_request_person_anonymization" v39/ supabase/ --include=*.js --include=*.html --include=*.ts
-- =====================================================================
do $t$
declare
  c_acl constant text := '{postgres=X/postgres,authenticated=X/postgres}';
  v_res text := ''; v_n int;
  v_md5_a text; v_md5_p text;
  f text;
begin
  -- -------------------------------------------------------------------
  -- G1/G2 pre-condicoes
  -- -------------------------------------------------------------------
  if to_regprocedure('app.v39_accept_privacy_policy(uuid,uuid,text,text)') is null
     or to_regprocedure('app.v39_request_person_anonymization(uuid,uuid,text)') is null then
    raise exception 'FALHOU G1a: funcao antiga nao existe';
  end if;
  select count(*) into v_n from pg_proc
   where oid in ('app.v39_accept_privacy_policy(uuid,uuid,text,text)'::regprocedure, 'app.v39_request_person_anonymization(uuid,uuid,text)'::regprocedure)
     and prosecdef and proacl::text = c_acl;
  if v_n <> 2 then raise exception 'FALHOU G1b: ACL ou SECURITY DEFINER diferente do esperado (% de 2)', v_n; end if;
  select count(*) into v_n from pg_proc p
   where p.prosrc ~ '(v39_accept_privacy_policy|v39_request_person_anonymization)'
     and p.proname not in ('v39_accept_privacy_policy','v39_request_person_anonymization');
  if v_n <> 0 then raise exception 'FALHOU G2: % funcao(oes) do banco chamam as funcoes antigas', v_n; end if;
  v_res := v_res || 'G1 ok; G2 ok; ';

  select md5(prosrc) into v_md5_a from pg_proc where oid = 'app.v39_accept_privacy_policy(uuid,uuid,text,text)'::regprocedure;
  select md5(prosrc) into v_md5_p from pg_proc where oid = 'app.v39_request_person_anonymization(uuid,uuid,text)'::regprocedure;

  -- T1 estado de hoje
  if not has_function_privilege('authenticated', 'app.v39_accept_privacy_policy(uuid,uuid,text,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'app.v39_request_person_anonymization(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'FALHOU T1: authenticated ja estava sem EXECUTE';
  end if;
  v_res := v_res || 'T1 ok; ';

  -- -------------------------------------------------------------------
  -- APLICAR (identico ao B63_9_revogar_funcoes_antigas_aplicar.sql, sem begin/commit)
  -- -------------------------------------------------------------------
  revoke execute on function app.v39_accept_privacy_policy(uuid,uuid,text,text) from public, anon, authenticated;
  revoke execute on function app.v39_request_person_anonymization(uuid,uuid,text) from public, anon, authenticated;

  -- T2 sem EXECUTE para authenticated, anon e public
  if has_function_privilege('authenticated', 'app.v39_accept_privacy_policy(uuid,uuid,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'app.v39_request_person_anonymization(uuid,uuid,text)', 'EXECUTE')
     or has_function_privilege('anon', 'app.v39_accept_privacy_policy(uuid,uuid,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'app.v39_request_person_anonymization(uuid,uuid,text)', 'EXECUTE')
     or has_function_privilege('public', 'app.v39_accept_privacy_policy(uuid,uuid,text,text)', 'EXECUTE')
     or has_function_privilege('public', 'app.v39_request_person_anonymization(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'FALHOU T2: EXECUTE continua aberto';
  end if;
  v_res := v_res || 'T2 ok; ';

  -- T3/T4 chamada real negada por privilegio (42501) para authenticated e anon
  foreach f in array array['authenticated','anon'] loop
    begin
      execute format('set local role %I', f);
      perform app.v39_accept_privacy_policy(gen_random_uuid(), gen_random_uuid(), 'v-teste', 'hash-teste');
      reset role;
      raise exception 'FALHOU T3/T4: % chamou v39_accept_privacy_policy', f;
    exception when others then
      reset role;
      if sqlerrm like 'FALHOU%' then raise; end if;
      if sqlstate <> '42501' then raise exception 'FALHOU T3/T4: % em v39_accept_privacy_policy erro inesperado % %', f, sqlstate, sqlerrm; end if;
    end;
    begin
      execute format('set local role %I', f);
      perform app.v39_request_person_anonymization(gen_random_uuid(), gen_random_uuid(), 'motivo teste');
      reset role;
      raise exception 'FALHOU T3/T4: % chamou v39_request_person_anonymization', f;
    exception when others then
      reset role;
      if sqlerrm like 'FALHOU%' then raise; end if;
      if sqlstate <> '42501' then raise exception 'FALHOU T3/T4: % em v39_request_person_anonymization erro inesperado % %', f, sqlstate, sqlerrm; end if;
    end;
  end loop;
  v_res := v_res || 'T3 ok; T4 ok; ';

  -- T5 dono mantem EXECUTE; funcoes intactas
  if not has_function_privilege('postgres', 'app.v39_accept_privacy_policy(uuid,uuid,text,text)', 'EXECUTE')
     or not has_function_privilege('postgres', 'app.v39_request_person_anonymization(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'FALHOU T5a: postgres perdeu EXECUTE';
  end if;
  if (select md5(prosrc) from pg_proc where oid = 'app.v39_accept_privacy_policy(uuid,uuid,text,text)'::regprocedure) <> v_md5_a
     or (select md5(prosrc) from pg_proc where oid = 'app.v39_request_person_anonymization(uuid,uuid,text)'::regprocedure) <> v_md5_p then
    raise exception 'FALHOU T5b: corpo de funcao alterado';
  end if;
  v_res := v_res || 'T5 ok; ';

  -- -------------------------------------------------------------------
  -- REVERTER (identico ao B63_9_revogar_funcoes_antigas_reverter.sql, sem begin/commit)
  -- -------------------------------------------------------------------
  grant execute on function app.v39_accept_privacy_policy(uuid,uuid,text,text) to authenticated;
  grant execute on function app.v39_request_person_anonymization(uuid,uuid,text) to authenticated;

  -- T6 ACL identica a original
  select count(*) into v_n from pg_proc
   where oid in ('app.v39_accept_privacy_policy(uuid,uuid,text,text)'::regprocedure, 'app.v39_request_person_anonymization(uuid,uuid,text)'::regprocedure)
     and proacl::text = c_acl;
  if v_n <> 2 then raise exception 'FALHOU T6a: ACL depois do reverter diferente da original (% de 2)', v_n; end if;
  if not has_function_privilege('authenticated', 'app.v39_accept_privacy_policy(uuid,uuid,text,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'app.v39_request_person_anonymization(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'FALHOU T6b: authenticated sem EXECUTE depois do reverter';
  end if;
  v_res := v_res || 'T6 ok (REVERTER ok)';

  raise exception 'TESTE B63_9 CONCLUIDO (nada foi gravado): %', v_res;
end
$t$;
