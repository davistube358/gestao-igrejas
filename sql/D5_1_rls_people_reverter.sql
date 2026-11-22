-- =====================================================================
-- D5_1 · LGPD-RLS-PEOPLE · REVERTER
-- Recria as 2 policies amplas exatamente como estavam em 22/11/2026 (versao do B63_5 em app.people)
--   e desliga a RLS das 2 tabelas de encontros. Rodar ANTES do B63_5_trava_pessoa_anonimizada_reverter.sql.
-- =====================================================================
begin;

create policy v39_people_select_accessible_church on app.people as permissive for select to authenticated
  using (people.status <> 'restricted'
         and exists (select 1
                       from app.church_people cp
                       join app.church_user_access cua on cua.church_id = cp.church_id
                       join app.user_accounts ua on ua.id = cua.user_account_id
                      where cp.person_id = people.id and cp.ended_at is null and cua.status = 'active'
                        and ua.status = 'active' and ua.auth_user_id = auth.uid()));

create policy v39_church_people_select_accessible_church on app.church_people as permissive for select to authenticated
  using (exists (select 1
                   from app.church_user_access cua
                   join app.user_accounts ua on ua.id = cua.user_account_id
                  where ua.auth_user_id = auth.uid() and ua.status = 'active' and cua.status = 'active'
                    and cua.church_id = church_people.church_id));

alter table app.growth_group_encounters disable row level security;
alter table app.growth_group_attendance_list disable row level security;

commit;

-- VERIFICACAO (tudo deve ser true)
select
  (select md5(qual) from pg_policies where schemaname = 'app' and tablename = 'people' and policyname = 'v39_people_select_accessible_church') = 'c89e24a2b7c252150948de52bc4909cf' as people_original,
  (select md5(qual) from pg_policies where schemaname = 'app' and tablename = 'church_people' and policyname = 'v39_church_people_select_accessible_church') = 'f9a1c1c9c614b2244e55777542233bb1' as church_people_original,
  not (select relrowsecurity from pg_class where oid = 'app.growth_group_encounters'::regclass) as encontros_sem_rls,
  not (select relrowsecurity from pg_class where oid = 'app.growth_group_attendance_list'::regclass) as lista_sem_rls;
