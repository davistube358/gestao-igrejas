-- =====================================================================
-- D5_1 · LGPD-RLS-PEOPLE · TESTE COM ROLLBACK
-- ULTIMA EXECUCAO (22/11/2026, conector Supabase da conta, projeto kybrwsxvdbwjtwakczyj, pelo Claude):
--   ERROR P0001: TESTE D5_1 CONCLUIDO (nada foi gravado): G1 ok; T1 ok (vazamento reproduzido: CPF/obs,
--   church_people, encontro de outra igreja); T2 ok; T3 ok; T4 ok; T5 ok; T6 ok (REVERTER ok)
--   Conferido depois: policies e RLS como antes; nenhuma igreja/usuario de teste ficou.
-- Roda o conteudo do _aplicar e do _reverter (sem begin/commit) num bloco so, com dados ficticios.
-- Casos (leituras feitas como "authenticated", igual a chamada REST do navegador):
--   G1  policies atuais iguais as revisadas (md5) e RLS desligada nas 2 tabelas de encontros
--   T1  ANTES (prova o problema): discipulo le CPF e observacoes de outra pessoa da igreja; le
--       church_people da igreja; usuario de OUTRA igreja le encontro e lista de presenca alheios
--   T2  DEPOIS, discipulo: nao le outra pessoa nem church_people; le o proprio cadastro (select *)
--   T3  DEPOIS, master: idem (REST so devolve o proprio cadastro)
--   T4  DEPOIS, outra igreja: nao le encontro nem lista de presenca
--   T5  RPCs do app continuam iguais: v39_list_people (discipulo; usa v39_person_legacy_base por dentro)
--       e search_people (master) devolvem a pessoa
--   T6  REVERTER: policies com md5 original, RLS desligada de novo e discipulo volta a ler (comportamento antigo)
-- NAO GRAVA NADA: tudo e desfeito pelo raise final.
-- =====================================================================
do $t$
declare
  v_ch1 uuid := gen_random_uuid(); v_ch2 uuid := gen_random_uuid();
  v_au_m uuid := gen_random_uuid(); v_au_d uuid := gen_random_uuid(); v_au_x uuid := gen_random_uuid();
  v_p_m uuid; v_p_d uuid; v_p_x uuid; v_p_t uuid;
  v_ua_m uuid; v_ua_d uuid; v_ua_x uuid; v_cua uuid; v_master uuid; v_disc uuid; v_gg uuid; v_enc uuid;
  v_cpf text; v_s int; v_n int; v_n2 int; v_txt text; r jsonb; v_res text := '';
begin
  -- G1
  if (select md5(qual) from pg_policies where schemaname = 'app' and tablename = 'people' and policyname = 'v39_people_select_accessible_church') is distinct from 'c89e24a2b7c252150948de52bc4909cf'
     or (select md5(qual) from pg_policies where schemaname = 'app' and tablename = 'church_people' and policyname = 'v39_church_people_select_accessible_church') is distinct from 'f9a1c1c9c614b2244e55777542233bb1'
     or (select md5(qual) from pg_policies where schemaname = 'app' and tablename = 'people' and policyname = 'v39_people_select_own_person') is distinct from '5bdbb05d4fe84ae347f8c4b070342767' then
    raise exception 'FALHOU G1a: policies diferentes das revisadas';
  end if;
  if (select relrowsecurity from pg_class where oid = 'app.growth_group_encounters'::regclass)
     or (select relrowsecurity from pg_class where oid = 'app.growth_group_attendance_list'::regclass) then
    raise exception 'FALHOU G1b: RLS ja ligada nas tabelas de encontros';
  end if;
  v_res := v_res || 'G1 ok; ';

  -- dados ficticios
  select id into v_master from app.access_profiles where code = 'master' and is_active;
  select id into v_disc from app.access_profiles where code = 'disciple' and is_active;
  insert into app.churches (id, name, slug) values (v_ch1, 'Igreja Teste D5 A', 'teste-d5-a-' || left(v_ch1::text, 8)), (v_ch2, 'Igreja Teste D5 B', 'teste-d5-b-' || left(v_ch2::text, 8));
  insert into auth.users (id, email) values (v_au_m, 'd5m@teste.invalid'), (v_au_d, 'd5d@teste.invalid'), (v_au_x, 'd5x@teste.invalid');
  insert into app.people (full_name) values ('Teste D5 Master') returning id into v_p_m;
  insert into app.people (full_name) values ('Teste D5 Discipulo') returning id into v_p_d;
  insert into app.people (full_name) values ('Teste D5 Outra Igreja') returning id into v_p_x;
  loop
    v_cpf := lpad((floor(random() * 999999999))::bigint::text, 9, '0');
    v_s := 0; for i in 1..9 loop v_s := v_s + substr(v_cpf, i, 1)::int * (11 - i); end loop;
    v_cpf := v_cpf || case when v_s % 11 < 2 then 0 else 11 - v_s % 11 end;
    v_s := 0; for i in 1..10 loop v_s := v_s + substr(v_cpf, i, 1)::int * (12 - i); end loop;
    v_cpf := v_cpf || case when v_s % 11 < 2 then 0 else 11 - v_s % 11 end;
    exit when app.is_valid_cpf(v_cpf) and not exists (select 1 from app.people where cpf = v_cpf);
  end loop;
  insert into app.people (full_name, cpf, notes, birth_date) values ('Titular Ficticio D5', v_cpf, 'obs sigilosa D5', date '1990-01-01') returning id into v_p_t;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_m, v_p_m, 'active', now(), 'td5m') returning id into v_ua_m;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_d, v_p_d, 'active', now(), 'td5d') returning id into v_ua_d;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_x, v_p_x, 'active', now(), 'td5x') returning id into v_ua_x;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch1, v_ua_m, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_master, true, now() - interval '1 day');
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch1, v_ua_d, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_disc, true, now() - interval '1 day');
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch2, v_ua_x, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_master, true, now() - interval '1 day');
  insert into app.church_people (church_id, person_id, status) values (v_ch1, v_p_t, 'active'), (v_ch1, v_p_d, 'active'), (v_ch1, v_p_m, 'active'), (v_ch2, v_p_x, 'active');
  insert into app.growth_groups (church_id, name) values (v_ch1, 'GC Teste D5') returning id into v_gg;
  insert into app.growth_group_encounters (church_id, growth_group_id, encounter_date, topic, notes) values (v_ch1, v_gg, current_date, 'tema D5', 'obs encontro D5') returning id into v_enc;
  insert into app.growth_group_attendance_list (encounter_id, person_id, action) values (v_enc, v_p_t, 'add');

  -- T1 ANTES: o problema
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_d, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_d::text, true);
  begin
    set local role authenticated;
    select cpf || '|' || notes into v_txt from app.people where id = v_p_t;
    select count(*) into v_n from app.church_people where church_id = v_ch1;
    reset role;
  exception when others then reset role; raise exception 'FALHOU T1: erro inesperado % %', sqlstate, sqlerrm;
  end;
  if v_txt is distinct from v_cpf || '|obs sigilosa D5' then raise exception 'FALHOU T1a: discipulo nao leu CPF/observacao (o problema nao se reproduziu): %', v_txt; end if;
  if v_n < 3 then raise exception 'FALHOU T1b: discipulo leu % linhas de church_people', v_n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_x, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_x::text, true);
  begin
    set local role authenticated;
    select count(*) into v_n from app.growth_group_encounters where id = v_enc;
    select count(*) into v_n2 from app.growth_group_attendance_list where encounter_id = v_enc;
    reset role;
  exception when others then reset role; raise exception 'FALHOU T1: erro inesperado % %', sqlstate, sqlerrm;
  end;
  if v_n <> 1 or v_n2 <> 1 then raise exception 'FALHOU T1c: outra igreja leu encontro=% lista=%', v_n, v_n2; end if;
  v_res := v_res || 'T1 ok (vazamento reproduzido: CPF/obs, church_people, encontro de outra igreja); ';

  -- APLICAR (identico ao _aplicar, sem begin/commit)
  drop policy v39_people_select_accessible_church on app.people;
  drop policy v39_church_people_select_accessible_church on app.church_people;
  alter table app.growth_group_encounters enable row level security;
  alter table app.growth_group_attendance_list enable row level security;

  -- T2 discipulo
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_d, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_d::text, true);
  begin
    set local role authenticated;
    select count(*) into v_n from app.people where id = v_p_t;
    select count(*) into v_n2 from app.church_people where church_id = v_ch1;
    select full_name into v_txt from app.people where id = v_p_d;
    reset role;
  exception when others then reset role; raise exception 'FALHOU T2: erro inesperado % %', sqlstate, sqlerrm;
  end;
  if v_n <> 0 then raise exception 'FALHOU T2a: discipulo ainda le outra pessoa'; end if;
  if v_n2 <> 0 then raise exception 'FALHOU T2b: discipulo ainda le church_people (%)', v_n2; end if;
  if v_txt is distinct from 'Teste D5 Discipulo' then raise exception 'FALHOU T2c: discipulo nao le o proprio cadastro'; end if;
  begin
    set local role authenticated;
    select count(*) into v_n from (select * from app.people where id = v_p_d) s;
    reset role;
  exception when others then reset role; raise exception 'FALHOU T2d: select * do proprio cadastro falhou % %', sqlstate, sqlerrm;
  end;
  if v_n <> 1 then raise exception 'FALHOU T2d: select * do proprio cadastro devolveu %', v_n; end if;
  v_res := v_res || 'T2 ok; ';

  -- T3 master
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  begin
    set local role authenticated;
    select count(*) into v_n from app.people where id in (v_p_t, v_p_d);
    select count(*) into v_n2 from app.people where id = v_p_m;
    reset role;
  exception when others then reset role; raise exception 'FALHOU T3: erro inesperado % %', sqlstate, sqlerrm;
  end;
  if v_n <> 0 or v_n2 <> 1 then raise exception 'FALHOU T3: master outras=% proprio=%', v_n, v_n2; end if;
  v_res := v_res || 'T3 ok; ';

  -- T4 outra igreja
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_x, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_x::text, true);
  begin
    set local role authenticated;
    select count(*) into v_n from app.growth_group_encounters where id = v_enc;
    select count(*) into v_n2 from app.growth_group_attendance_list where encounter_id = v_enc;
    reset role;
  exception when others then reset role; raise exception 'FALHOU T4: erro inesperado % %', sqlstate, sqlerrm;
  end;
  if v_n <> 0 or v_n2 <> 0 then raise exception 'FALHOU T4: outra igreja ainda le encontro=% lista=%', v_n, v_n2; end if;
  v_res := v_res || 'T4 ok; ';

  -- T5 RPCs do app inalteradas (chamadas como o navegador: role authenticated)
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_d, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_d::text, true);
  begin
    set local role authenticated;
    r := app.v39_list_people(v_ch1);
    reset role;
  exception when others then reset role; raise exception 'FALHOU T5a: v39_list_people % %', sqlstate, sqlerrm;
  end;
  if not exists (select 1 from jsonb_array_elements(r) x where x->>'id' = v_p_t::text and x->>'nome' = 'Titular Ficticio D5') then
    raise exception 'FALHOU T5a: v39_list_people sem a pessoa';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  begin
    set local role authenticated;
    select count(*) into v_n from app.search_people(v_ch1, 'Titular Ficticio D5', 12) s where s.person_id = v_p_t;
    reset role;
  exception when others then reset role; raise exception 'FALHOU T5b: % %', sqlstate, sqlerrm;
  end;
  if v_n <> 1 then raise exception 'FALHOU T5b: search_people sem a pessoa'; end if;
  v_res := v_res || 'T5 ok; ';

  -- REVERTER (identico ao _reverter, sem begin/commit)
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

  if (select md5(qual) from pg_policies where schemaname = 'app' and tablename = 'people' and policyname = 'v39_people_select_accessible_church') is distinct from 'c89e24a2b7c252150948de52bc4909cf'
     or (select md5(qual) from pg_policies where schemaname = 'app' and tablename = 'church_people' and policyname = 'v39_church_people_select_accessible_church') is distinct from 'f9a1c1c9c614b2244e55777542233bb1' then
    raise exception 'FALHOU T6a: policies do reverter diferentes das originais';
  end if;
  if (select relrowsecurity from pg_class where oid = 'app.growth_group_encounters'::regclass)
     or (select relrowsecurity from pg_class where oid = 'app.growth_group_attendance_list'::regclass) then
    raise exception 'FALHOU T6b: RLS continua ligada';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_d, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_d::text, true);
  begin
    set local role authenticated;
    select count(*) into v_n from app.people where id = v_p_t;
    reset role;
  exception when others then reset role; raise exception 'FALHOU T6c: % %', sqlstate, sqlerrm;
  end;
  if v_n <> 1 then raise exception 'FALHOU T6c: comportamento antigo nao voltou'; end if;
  v_res := v_res || 'T6 ok (REVERTER ok)';

  raise exception 'TESTE D5_1 CONCLUIDO (nada foi gravado): %', v_res;
end
$t$;
