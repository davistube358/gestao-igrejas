-- =====================================================================
-- D5_2 · LGPD · nome da pessoa restringida mascarado nas RPCs fora do Instituto/Farmácia · APLICAR
-- 22/11/2026 · DATA · decisão do Diogo: mascarar o nome também no histórico
-- VALIDACAO: ver cabecalho de D5_2_mascarar_restringida_teste_rollback.sql
-- ---------------------------------------------------------------------
-- Problema: pessoa restringida (people.status 'restricted', guarda legal de prontuário) já saiu de
--   v39_list_people/search_people/RLS (B63_5), mas o nome dela ainda aparece em 18 RPCs (GC, Lar de Vida,
--   Financeiro, mural, equipe, setores, destinatários, usuários).
-- Técnica (sem editar o corpo de nenhuma função):
--   1. private.v39_lgpd_mascarar(jsonb): troca, no JSON, todo valor de texto IGUAL ao nome completo ou ao
--      apelido de uma pessoa restringida (e ainda não anonimizada) por "Pessoa com tratamento restrito".
--      Sem nenhuma restringida no banco, devolve o JSON sem tocar (caminho rápido).
--   2. Cada uma das 18 funções vai para private.<nome>__d5raw (mesmo corpo, sem EXECUTE para authenticated)
--      e app.<nome> vira um envelope SQL com a MESMA assinatura, defaults, retorno (jsonb), volatilidade e
--      grant, que devolve private.v39_lgpd_mascarar(private.<nome>__d5raw(...)).
-- Fica de fora, de propósito: Instituto/Farmácia (v39_inst_*, v39_est_*: guarda legal, equipe de saúde
--   continua vendo), tela LGPD (v39_privacy_*), get_person/list_people (já tratam a restringida),
--   mutações (create/update/save) e o próprio perfil.
-- Limites conhecidos:
--   - só troca valores de texto exatamente iguais ao nome/apelido; nome dentro de uma frase maior
--     (ex.: "Fulano · observação") não é trocado;
--   - homônimo exato de uma restringida (qualquer igreja) também aparece mascarado;
--   - nas listas ativas (ex.: membros do GC na chamada) a restringida aparece mascarada, não some.
-- Chamadas internas pelo nome (v39_fin_save_account/category, v39_fin_close/reopen_period, v39_mural_post/
--   delete/pray) passam a usar o envelope: mesmo retorno, nome mascarado.
-- Ordem: depois do D5_1. Reverter: D5_2_mascarar_restringida_reverter.sql (ANTES do D5_1, B63_5, B63_3b e B63_3,
--   porque v39_fin_report e v39_fin_grant_report estão entre as 18).
-- Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

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

do $a$
declare
  v_nomes text[] := array['get_gc_meeting','list_gc_meetings','get_growth_group','list_growth_groups','v39_list_life_home',
    'v39_fin_campaigns','v39_fin_catalogs','v39_fin_expenses','v39_fin_overview','v39_fin_report','v39_fin_grant_report',
    'v39_mural_list','v39_gc_team','v39_gc_discipulos','v39_list_sectors','v39_message_recipients','list_active_users',
    'v39_access_request_names'];
  v text; r record; v_call text; v_vol text;
begin
  foreach v in array v_nomes loop
    select p.oid, pg_get_function_identity_arguments(p.oid) ident, pg_get_function_arguments(p.oid) args,
           pg_get_function_result(p.oid) ret, p.provolatile, p.prosecdef, p.proacl::text acl, p.proargnames, p.proargmodes
      into r
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app' and p.proname = v;
    if r.oid is null then raise exception 'D5_2 ABORTADO: app.% nao existe. Nada foi alterado.', v; end if;
    if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and p.proname = v) <> 1 then
      raise exception 'D5_2 ABORTADO: app.% tem mais de uma versao. Nada foi alterado.', v;
    end if;
    if r.ret <> 'jsonb' or not r.prosecdef or r.proargmodes is not null
       or r.acl is distinct from '{postgres=X/postgres,authenticated=X/postgres}' then
      raise exception 'D5_2 ABORTADO: app.% diferente do revisado em 22/11/2026 (retorno %, definer %, acl %). Nada foi alterado.', v, r.ret, r.prosecdef, r.acl;
    end if;
    if exists (select 1 from pg_proc p2 join pg_namespace n2 on n2.oid = p2.pronamespace where n2.nspname = 'private' and p2.proname = v || '__d5raw') then
      raise exception 'D5_2 ABORTADO: private.%__d5raw ja existe. Nada foi alterado.', v;
    end if;
    select string_agg(format('%I => %I', a, a), ', ' order by o) into v_call from unnest(r.proargnames) with ordinality as x(a, o);
    v_vol := case r.provolatile when 'v' then 'volatile' when 's' then 'stable' else 'immutable' end;

    execute format('alter function app.%I(%s) rename to %I', v, r.ident, v || '__d5raw');
    execute format('alter function app.%I(%s) set schema private', v || '__d5raw', r.ident);
    execute format('revoke all on function private.%I(%s) from public, anon, authenticated', v || '__d5raw', r.ident);
    execute format('create function app.%I(%s) returns jsonb language sql %s security definer set search_path = pg_catalog, app, private as $w$ select private.v39_lgpd_mascarar(private.%I(%s)) $w$',
                   v, r.args, v_vol, v || '__d5raw', coalesce(v_call, ''));
    execute format('comment on function app.%I(%s) is %L', v, r.ident,
                   'D5_2 (LGPD): envelope de private.' || v || '__d5raw que mascara o nome da pessoa restringida');
    execute format('revoke all on function app.%I(%s) from public, anon', v, r.ident);
    execute format('grant execute on function app.%I(%s) to authenticated', v, r.ident);
  end loop;
end $a$;

commit;

-- VERIFICACAO (tudo deve ser true)
select
  (select count(*) = 18 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.prosrc like '%private.v39_lgpd_mascarar(%' and p.proacl::text = '{postgres=X/postgres,authenticated=X/postgres}') as envelopes_18,
  (select count(*) = 18 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname like '%\_\_d5raw' and not has_function_privilege('authenticated', p.oid, 'EXECUTE')) as originais_fechadas_18,
  (select provolatile = 'v' from pg_proc where oid = 'app.v39_fin_report(uuid,integer,integer)'::regprocedure) as fin_report_volatile,
  not has_function_privilege('authenticated', 'private.v39_lgpd_mascarar(jsonb)', 'EXECUTE') as mascarar_fechada;
