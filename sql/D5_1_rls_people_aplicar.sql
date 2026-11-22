-- =====================================================================
-- D5_1 · LGPD-RLS-PEOPLE · fechar a leitura direta (REST) de pessoas · APLICAR
-- 22/11/2026 · DATA
-- VALIDACAO: ver cabecalho de D5_1_rls_people_teste_rollback.sql
-- ---------------------------------------------------------------------
-- Problema: qualquer conta ATIVA da igreja (inclusive discipulo) le por REST TODAS as colunas de
--   TODAS as pessoas da igreja em app.people (cpf, notes, birth_date...) e de app.church_people
--   (notes, attends_other_church, invited_by...). E app.growth_group_encounters /
--   app.growth_group_attendance_list estao SEM RLS: qualquer usuario autenticado, de qualquer igreja,
--   le as linhas (hoje 0 linhas nas duas).
-- Levantamento (22/11/2026):
--   - O app le app.people direto so para o PROPRIO cadastro (app_v39.js:39, select=* por id); nos
--     logs da API de 24h, 6 chamadas, todas desse tipo. Listas, busca e telas usam RPCs SECURITY
--     DEFINER (v39_list_people, search_people, v39_inst_*...), que nao dependem da RLS.
--   - Nenhuma leitura direta de app.church_people no front nem nas Edges.
--   - Nenhuma funcao SECURITY INVOKER usada pelo app le people/church_people (so os gatilhos de CPF,
--     disparados por RPC definer). Policies de outras tabelas e do Storage usam funcoes definer.
-- O que faz:
--   1. app.people: remove v39_people_select_accessible_church. FICA v39_people_select_own_person
--      (a pessoa le o proprio cadastro).
--   2. app.church_people: remove v39_church_people_select_accessible_church (RLS segue ligada, sem
--      policy de leitura: REST nao devolve linhas).
--   3. app.growth_group_encounters e app.growth_group_attendance_list: liga a RLS (sem policy).
-- Nao muda: RPCs, grants, colunas, dados. Caminhos antigos sem uso nos logs (G2_V39.people.list,
--   userView, fallback de nomes em app_v39_usuarios_acesso.js) passam a ver so o proprio cadastro.
-- Ordem: depois do B63 (este arquivo remove a policy na versao do B63_5).
-- Reverter: D5_1_rls_people_reverter.sql (ANTES de reverter o B63_5).
-- Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

do $g$
begin
  if (select md5(qual) from pg_policies where schemaname = 'app' and tablename = 'people'
        and policyname = 'v39_people_select_accessible_church') is distinct from 'c89e24a2b7c252150948de52bc4909cf' then
    raise exception 'D5_1 ABORTADO: policy v39_people_select_accessible_church diferente da revisada em 22/11/2026. Nada foi alterado.';
  end if;
  if (select md5(qual) from pg_policies where schemaname = 'app' and tablename = 'church_people'
        and policyname = 'v39_church_people_select_accessible_church') is distinct from 'f9a1c1c9c614b2244e55777542233bb1' then
    raise exception 'D5_1 ABORTADO: policy v39_church_people_select_accessible_church diferente da revisada em 22/11/2026. Nada foi alterado.';
  end if;
  if (select md5(qual) from pg_policies where schemaname = 'app' and tablename = 'people'
        and policyname = 'v39_people_select_own_person') is distinct from '5bdbb05d4fe84ae347f8c4b070342767' then
    raise exception 'D5_1 ABORTADO: policy v39_people_select_own_person ausente ou diferente. Nada foi alterado.';
  end if;
end $g$;

drop policy v39_people_select_accessible_church on app.people;
drop policy v39_church_people_select_accessible_church on app.church_people;
alter table app.growth_group_encounters enable row level security;
alter table app.growth_group_attendance_list enable row level security;

commit;

-- VERIFICACAO (tudo deve ser true)
select
  not exists (select 1 from pg_policies where schemaname = 'app' and tablename = 'people' and policyname = 'v39_people_select_accessible_church') as people_ampla_removida,
  exists (select 1 from pg_policies where schemaname = 'app' and tablename = 'people' and policyname = 'v39_people_select_own_person') as people_propria_mantida,
  not exists (select 1 from pg_policies where schemaname = 'app' and tablename = 'church_people' and cmd = 'SELECT') as church_people_sem_leitura_rest,
  (select relrowsecurity from pg_class where oid = 'app.growth_group_encounters'::regclass) as encontros_rls,
  (select relrowsecurity from pg_class where oid = 'app.growth_group_attendance_list'::regclass) as lista_presenca_rls,
  has_function_privilege('authenticated', 'app.v39_list_people(uuid)', 'EXECUTE') as rpc_lista_ok;
