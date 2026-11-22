-- =====================================================================
-- B63_5 · LGPD · Trava de pessoa anonimizada/restringida · APLICAR
-- Build 63 · QA63-01 (MAJOR) · 22/11/2026
-- VALIDACAO: ver cabecalho de B63_5_trava_pessoa_anonimizada_teste_rollback.sql
-- ---------------------------------------------------------------------
-- Problema (QA63-01): depois da anonimizacao/restricao, o servidor nao recusava edicao da pessoa
--   e a leitura do app nao dizia que ela estava anonimizada/restringida. Um sync reabria o botao
--   "Anonimizar" e a edicao, permitindo regravar dados pessoais (reidentificacao).
-- O que faz:
--   1. Gatilho em app.people: pessoa anonimizada (anonymized_at) ou restringida (status 'restricted')
--      nao muda nome, apelido, nascimento, sexo, CPF, observacoes, foto, status, fusao nem a marca.
--      Unica transicao permitida: restringida -> anonimizada (execucao do B63_2). Toques que so
--      mudam updated_at/updated_by passam.
--   2. Gatilho em app.person_contacts e app.person_addresses: nao inclui nem reabre (valid_until nulo)
--      contato/endereco dessas pessoas. Encerrar/mascarar (valid_until preenchido) continua permitido.
--   3. Gatilho em app.church_people: vinculo de pessoa ANONIMIZADA nao e criado nem reaberto
--      (fica 'closed' com ended_at). Restringida continua com o vinculo editavel (jornada, GC).
--   4. app.v39_person_legacy_base (leitura do sync do app, via v39_list_people/v39_person_legacy)
--      passa a devolver 'anonimizadoEm' (timestamptz ou null) e 'restritoLgpd' (boolean).
--      Chaves novas; nenhuma chave existente muda.
--   5. (QA63R-01, 22/11/2026) app.v39_list_people (sync de Pessoas do app) deixa de devolver pessoa com
--      people.status 'restricted' (restringida ou anonimizada) para TODOS os perfis. O vinculo
--      church_people NAO e fechado: prontuario/receitas do Instituto/Farmacia (guarda legal de 20 anos)
--      seguem pelas RPCs proprias (v39_inst_*, farmacia), que nao passam por v39_list_people.
--   6. (QA63R-01) policy RLS v39_people_select_accessible_church (leitura direta de app.people) ganha
--      people.status <> 'restricted'. A policy do proprio titular (v39_people_select_own_person) nao muda.
--   7. (QA63R-01, escopo aprovado) app.search_people (Financeiro: seletor de pessoa e telefone de lembrete;
--      Treinamentos: WhatsApp de lembrete) deixa de devolver pessoa com status 'restricted' para TODOS.
--      Antes so escondia de quem nao tinha people.view_restricted (master/pastor viam, com WhatsApp/e-mail).
--      Anonimizada ja ficava fora (vinculo fechado) e agora fica fora tambem pelo status.
--   8. (D4, decisao do Diogo 22/11) desfazer restricao feita por engano: app.v39_privacy_restricted_list e
--      app.v39_privacy_restriction_lift (privacy.manage, so master). O gatilho de app.people aceita
--      restricted -> status anterior SOMENTE com a marca local app.lgpd_lift gravada pela RPC. O status anterior
--      vem da metadata do historico do pedido (gravada pelo modo restrict do B63_2). Contas e acessos revogados
--      NAO sao reativados [CONFIRMAR]; prontuario/receitas nao sao tocados.
--      QA63R2-01: so desfaz a igreja que restringiu (pedido restricted_health_retention dela + vinculo aberto);
--      senao RESTRICTION_NOT_FOUND.
--   [CONFIRMAR] master/pastor (people.view_restricted) tambem deixam de ver a restringida na lista geral
--      (opcao mais restritiva, alinhada ao texto "O cadastro some das listas"). A restringida continua
--      visivel no pedido LGPD (v39_privacy_requests_list) e nas telas do Instituto/Farmacia. Se o PO quiser
--      que quem tem people.view_restricted continue vendo (como app.list_people), trocar o filtro por
--      "(rp.status <> 'restricted' or app.has_permission('people.view_restricted', p_church_id, 'church', p_church_id))".
-- Por que gatilho e nao alterar cada RPC: cobre todas as escritas (update_person, v39_save_person,
--   set_person_cpf, register_person_photo, v39_inst_*, futuras) sem reescrever funcoes grandes.
--   Codigos de erro: PERSON_ANONYMIZED / PERSON_RESTRICTED (app.raise_domain_error, P0001).
-- Hoje: 0 pessoas com status 'restricted' e coluna anonymized_at inexistente (conferido em 22/11):
--   nenhum registro atual passa a ficar bloqueado.
-- app.list_people (usada so pela acao 'buscarPessoa' do G2_V39.p1, sem chamada no front) NAO muda: ja esconde
--   a restringida de quem nao tem people.view_restricted (so master/pastor tem).
-- Ordem do Build 63: B63_1 -> B63_9 -> B63_3 -> B63_2 -> B63_5 (exige as colunas do B63_2).
-- Reverter: B63_5_trava_pessoa_anonimizada_reverter.sql (antes de reverter o B63_2).
-- Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

do $g$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'app' and table_name = 'people' and column_name = 'anonymized_at') then
    raise exception 'B63_5 ABORTADO: aplique o B63_2 antes (falta app.people.anonymized_at). Nada foi alterado.';
  end if;
  if md5(pg_get_functiondef('app.v39_person_legacy_base(uuid,uuid)'::regprocedure)) <> 'bb32b6486a2223e0a3b4417a412cef9f' then
    raise exception 'B63_5 ABORTADO: app.v39_person_legacy_base mudou desde 22/11/2026 (md5). Nada foi alterado.';
  end if;
  if md5(pg_get_functiondef('app.v39_list_people(uuid)'::regprocedure)) <> '20e5487d1c530b527e9a334b1f899dc9' then
    raise exception 'B63_5 ABORTADO: app.v39_list_people mudou desde 22/11/2026 (md5). Nada foi alterado.';
  end if;
  if (select md5(qual) from pg_policies where schemaname = 'app' and tablename = 'people'
        and policyname = 'v39_people_select_accessible_church' and cmd = 'SELECT') is distinct from '62eeb0de18914860aa1ffbe07ea645fd' then
    raise exception 'B63_5 ABORTADO: policy v39_people_select_accessible_church mudou desde 22/11/2026 (md5). Nada foi alterado.';
  end if;
  if md5(pg_get_functiondef('app.search_people(uuid,text,integer)'::regprocedure)) <> 'ab3fe6f3dc1ef81031123ac20271d262' then
    raise exception 'B63_5 ABORTADO: app.search_people mudou desde 22/11/2026 (md5). Nada foi alterado.';
  end if;
end $g$;

create or replace function private.v39_lgpd_guard_people() returns trigger
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
begin
  if old.anonymized_at is null and old.status <> 'restricted' then return new; end if;
  if old.anonymized_at is null and new.anonymized_at is not null then return new; end if;   -- restringida -> anonimizada (B63_2)
  -- B63_5 (D4): restringida -> status anterior SOMENTE pela RPC app.v39_privacy_restriction_lift, que grava
  --   a marca app.lgpd_lift = person_id:txid (local a transacao) logo antes do UPDATE e limpa logo depois.
  --   So status e deactivated_at mudam; qualquer outro campo (ou sem a marca) continua recusado.
  if old.anonymized_at is null and old.status = 'restricted' and new.anonymized_at is null
     and new.status in ('active','inactive','deceased')
     and coalesce(current_setting('app.lgpd_lift', true), '') = old.id::text || ':' || txid_current()::text
     and (new.full_name, new.preferred_name, new.birth_date, new.sex, new.cpf, new.notes, new.photo_file_id, new.merged_into_person_id)
         is not distinct from
         (old.full_name, old.preferred_name, old.birth_date, old.sex, old.cpf, old.notes, old.photo_file_id, old.merged_into_person_id) then
    return new;
  end if;
  if (new.full_name, new.preferred_name, new.birth_date, new.sex, new.cpf, new.notes, new.photo_file_id,
      new.status, new.merged_into_person_id, new.anonymized_at)
     is distinct from
     (old.full_name, old.preferred_name, old.birth_date, old.sex, old.cpf, old.notes, old.photo_file_id,
      old.status, old.merged_into_person_id, old.anonymized_at) then
    if old.anonymized_at is not null then
      perform app.raise_domain_error('PERSON_ANONYMIZED', 'Pessoa anonimizada (LGPD): o cadastro nao pode ser alterado');
    end if;
    perform app.raise_domain_error('PERSON_RESTRICTED', 'Pessoa com tratamento restrito (LGPD): o cadastro nao pode ser alterado');
  end if;
  return new;
end $f$;

create or replace function private.v39_lgpd_guard_person_child() returns trigger
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_code text;
begin
  if tg_op = 'UPDATE' and new.valid_until is not null then return new; end if;   -- encerrar/mascarar sempre pode
  select case when p.anonymized_at is not null then 'PERSON_ANONYMIZED' when p.status = 'restricted' then 'PERSON_RESTRICTED' end
    into v_code from app.people p where p.id = new.person_id;
  if v_code is not null then
    perform app.raise_domain_error(v_code, 'Pessoa com dados bloqueados (LGPD): contato ou endereco nao pode ser incluido nem reaberto');
  end if;
  return new;
end $f$;

create or replace function private.v39_lgpd_guard_church_people() returns trigger
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
begin
  if new.status = 'closed' and new.ended_at is not null then return new; end if;
  if exists (select 1 from app.people p where p.id = new.person_id and p.anonymized_at is not null) then
    perform app.raise_domain_error('PERSON_ANONYMIZED', 'Pessoa anonimizada (LGPD): o vinculo com a igreja nao pode ser criado nem reaberto');
  end if;
  return new;
end $f$;

revoke all on function private.v39_lgpd_guard_people(), private.v39_lgpd_guard_person_child(), private.v39_lgpd_guard_church_people()
  from public, anon, authenticated;

drop trigger if exists trg_v39_lgpd_guard_people on app.people;
create trigger trg_v39_lgpd_guard_people before update on app.people
  for each row execute function private.v39_lgpd_guard_people();
drop trigger if exists trg_v39_lgpd_guard_contacts on app.person_contacts;
create trigger trg_v39_lgpd_guard_contacts before insert or update on app.person_contacts
  for each row execute function private.v39_lgpd_guard_person_child();
drop trigger if exists trg_v39_lgpd_guard_addresses on app.person_addresses;
create trigger trg_v39_lgpd_guard_addresses before insert or update on app.person_addresses
  for each row execute function private.v39_lgpd_guard_person_child();
drop trigger if exists trg_v39_lgpd_guard_church_people on app.church_people;
create trigger trg_v39_lgpd_guard_church_people before insert or update on app.church_people
  for each row execute function private.v39_lgpd_guard_church_people();

-- igual ao original (md5 bb32b648...), mais 'anonimizadoEm' e 'restritoLgpd' no fim do objeto
create or replace function app.v39_person_legacy_base(p_church_id uuid, p_person_id uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'pg_catalog', 'app', 'private'
as $function$
  select jsonb_build_object(
    'id', p.id, 'codigo', coalesce(p.person_code::text, ''),
    'nome', p.full_name, 'apelido', coalesce(p.preferred_name, ''),
    'nasc', coalesce(p.birth_date::text, ''), 'sexo', app.v39_sexo_legado(p.sex), 'obs', coalesce(p.notes, ''),
    'tipo',   case cp.status when 'visiting' then 'Visitante' when 'institute' then 'Instituto' else 'Membro' end,
    'status', case cp.status when 'visiting' then 'Em visita' when 'institute' then 'Instituto' when 'inactive' then 'Inativo'
                             when 'closed' then 'Inativo' when 'transferred' then 'Inativo' else 'Ativo' end,
    'aceitaVisita',    case cp.accepts_home_visit   when true then 'Sim' when false then 'Não' else '' end,
    'frequentaIgreja', case cp.attends_other_church when true then 'Sim' when false then 'Não' else '' end,
    'igrejaQual', coalesce(cp.attends_church_text, ''), 'canal', coalesce(cp.source, ''), 'canalOutro', coalesce(cp.source_other, ''),
    'gcId', coalesce((select m.growth_group_id::text from app.growth_group_memberships m
                       where m.person_id = p.id and m.role_type = 'participant' and m.ended_at is null
                         and m.status in ('active','pending','inactive')
                       order by m.updated_at desc limit 1), ''),
    'fone', coalesce((select c.contact_value from app.person_contacts c
                       where c.person_id = p.id and c.contact_type in ('whatsapp','phone') and c.valid_until is null
                       order by c.is_primary desc, c.created_at desc limit 1), ''),
    'cep', coalesce(a.postal_code, ''), 'endereco', coalesce(a.street, ''), 'numero', coalesce(a.street_number, ''),
    'complemento', coalesce(a.complement, ''), 'bairro', coalesce(a.district, ''), 'cidade', coalesce(a.city, ''),
    'criadoPor', coalesce(to_jsonb(cp)->>'created_by', to_jsonb(cp)->>'created_by_user_account_id',
                          to_jsonb(p)->>'created_by_user_account_id', to_jsonb(p)->>'created_by', ''),
    'criadoEm', coalesce(cp.created_at, p.created_at),
    'jornada', coalesce(cp.journey_stage, case when cp.status = 'institute' then 'Instituto' else '' end),
    'deleted', cp.status = 'closed', 'updatedAt', greatest(p.updated_at, cp.updated_at), '_supabase', true)
    || jsonb_build_object('anonimizadoEm', p.anonymized_at, 'restritoLgpd', p.status = 'restricted' and p.anonymized_at is null)
  from app.people p
  join app.church_people cp on cp.person_id = p.id and cp.church_id = p_church_id
  left join lateral (select * from app.person_addresses x
                      where x.person_id = p.id and x.valid_until is null
                      order by x.is_primary desc, x.created_at desc limit 1) a on true
  where p.id = p_person_id
  order by (cp.ended_at is null) desc, cp.started_at desc nulls last
  limit 1;
$function$;

-- B63_5 (QA63R-01): igual ao original (md5 20e5487d...), mais o filtro da pessoa restringida (LGPD)
create or replace function app.v39_list_people(p_church_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_map jsonb := '{}'::jsonb; v_l jsonb;
begin
  if app.current_user_account_id() is null
     or not private.has_active_profile_in_church(p_church_id, array['master','pastor','supervisor','leader','disciple']) then
    perform app.raise_domain_error('PERMISSION_DENIED','Sem permissao');
  end if;
  -- INST-4: auxílios do Instituto por pessoa (código). Sem acesso ao Instituto: lista vazia, sem erro.
  begin
    v_l := app.v39_inst_people(p_church_id => p_church_id, p_filtro => 'todos');
    select coalesce(jsonb_object_agg(k, a), '{}'::jsonb) into v_map from (
      select distinct on (ltrim(x->>'codigo', '0')) ltrim(x->>'codigo', '0') k, coalesce(x->'atividades', '[]'::jsonb) a
        from jsonb_array_elements(coalesce(v_l->'pessoas', '[]'::jsonb)) x
       where coalesce(x->>'codigo', '') <> '') t;
  exception when others then v_map := '{}'::jsonb;
  end;
  -- B63_5 (QA63R-01): pessoa restringida ou anonimizada (people.status 'restricted') fica fora da lista
  --   geral de TODOS os perfis. Prontuario/receitas seguem pelas RPCs do Instituto/Farmacia (guarda legal).
  return coalesce((select jsonb_agg(l || jsonb_build_object('instAtividades', coalesce(v_map->ltrim(l->>'codigo', '0'), '[]'::jsonb)))
                     from (select app.v39_person_legacy(p_church_id, cp.person_id) l
                             from app.church_people cp
                            where cp.church_id = p_church_id and cp.status <> 'closed'
                              and not exists (select 1 from app.people rp where rp.id = cp.person_id and rp.status = 'restricted')) s), '[]'::jsonb);
end;
$function$;

-- B63_5 (QA63R-01): leitura direta de app.people (PostgREST) tambem nao devolve a restringida.
--   Mesma condicao original (md5 do qual 62eeb0de...), mais people.status <> 'restricted'.
--   A policy v39_people_select_own_person (o proprio titular) NAO muda.
drop policy if exists v39_people_select_accessible_church on app.people;
create policy v39_people_select_accessible_church on app.people as permissive for select to authenticated
  using (people.status <> 'restricted'
         and exists (select 1
                       from app.church_people cp
                       join app.church_user_access cua on cua.church_id = cp.church_id
                       join app.user_accounts ua on ua.id = cua.user_account_id
                      where cp.person_id = people.id and cp.ended_at is null and cua.status = 'active'
                        and ua.status = 'active' and ua.auth_user_id = auth.uid()));

-- B63_5 (QA63R-01, escopo aprovado 22/11): app.search_people igual ao original (md5 ab3fe6f3...), mas a pessoa
--   restringida/anonimizada (people.status 'restricted') sai do retorno para TODOS (antes: so quem tinha
--   people.view_restricted, master/pastor, via has_permission). Usada pelo Financeiro (seletor de pessoa e telefone
--   de lembrete) e por Treinamentos (WhatsApp de lembrete). Pessoa normal: mesmo comportamento.
create or replace function app.search_people(p_church_id uuid, p_query text default null::text, p_limit integer default 30)
 returns table(person_id uuid, full_name text, preferred_name text, status text, church_status text, primary_email text, primary_whatsapp text)
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'app'
as $function$
begin
  if not app.has_permission('people.view', p_church_id, 'church', p_church_id) then
    perform app.raise_domain_error('PERMISSION_DENIED', 'Permissao people.view obrigatoria');
  end if;
  return query
  select p.id, p.full_name, p.preferred_name, p.status, cp.status,
         (select pc.contact_value from app.person_contacts pc where pc.person_id = p.id and pc.contact_type = 'email' and pc.valid_until is null order by pc.is_primary desc, pc.created_at limit 1),
         (select pc.contact_value from app.person_contacts pc where pc.person_id = p.id and pc.contact_type = 'whatsapp' and pc.valid_until is null order by pc.is_primary desc, pc.created_at limit 1)
    from app.people p join app.church_people cp on cp.person_id = p.id and cp.church_id = p_church_id
   where cp.ended_at is null and p.status <> 'merged'
     and p.status <> 'restricted'
     and (p_query is null or p.full_name ilike '%' || trim(p_query) || '%' or p.preferred_name ilike '%' || trim(p_query) || '%')
   order by p.full_name limit greatest(1, least(coalesce(p_limit, 30), 100));
end;
$function$;

-- B63_5 (D4): pessoas restringidas da igreja, para desfazer restricao feita por engano. Somente leitura.
--   Status anterior e pedido vem do historico imutavel do pedido (metadata gravada pelo modo restrict do B63_2).
create or replace function app.v39_privacy_restricted_list(p_church_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
begin
  perform private.v39_lgpd_need(p_church_id, 'privacy.manage');
  return coalesce((
    select jsonb_agg(jsonb_build_object('pessoaId', p.id, 'nome', p.full_name, 'restritoEm', coalesce(h.occurred_at, p.deactivated_at),
                     'pedidoId', h.request_id, 'statusAnterior', h.metadata->>'statusAnterior', 'motivo', h.description)
                     order by coalesce(h.occurred_at, p.deactivated_at) desc nulls last, p.full_name)
      from app.people p
      left join lateral (select x.request_id, x.occurred_at, x.metadata, d.description
                           from app.data_subject_request_history x
                           join app.data_subject_requests d on d.id = x.request_id
                          where d.church_id = p_church_id and d.person_id = p.id and d.request_type = 'anonymization'
                            and d.response_reference = 'restricted_health_retention' and x.action = 'restricted_health_retention'
                          order by x.occurred_at desc, x.id desc limit 1) h on true
     where p.status = 'restricted' and p.anonymized_at is null
       and exists (select 1 from app.church_people cp where cp.church_id = p_church_id and cp.person_id = p.id and cp.ended_at is null)
  ), '[]'::jsonb);
end $f$;

-- B63_5 (D4): desfaz a restricao (modo restrict do B63_2) feita por engano. Volta people.status ao status
--   anterior guardado no historico do pedido (sem registro: active, marcado no audit). NAO reativa contas
--   nem acessos revogados e NAO toca em prontuario/receitas. O pedido continua completed e passa a
--   response_reference restriction_lifted (com linha no historico), para nao ser usado de novo.
create or replace function app.v39_privacy_restriction_lift(p_church_id uuid, p_person_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := private.v39_lgpd_need(p_church_id, 'privacy.manage');
  v_reason text := btrim(coalesce(p_reason, ''));
  pe app.people; v_req uuid; v_prev text; v_prev_deact_txt text; v_prev_deact timestamptz; v_sem boolean := false; q record;
begin
  if length(v_reason) < 10 then
    perform app.raise_domain_error('RESTRICTION_LIFT_REASON_REQUIRED', 'Informe o motivo para desfazer a restricao (minimo 10 caracteres)');
  end if;
  if not exists (select 1 from app.church_people where church_id = p_church_id and person_id = p_person_id) then
    perform app.raise_domain_error('PERSON_NOT_IN_CHURCH', 'Pessoa nao pertence a esta igreja');
  end if;
  select * into pe from app.people where id = p_person_id for update;
  if pe.id is null or pe.status <> 'restricted' or pe.anonymized_at is not null then
    perform app.raise_domain_error('PERSON_NOT_RESTRICTED', 'Pessoa nao esta restringida (ou ja foi anonimizada)');
  end if;
  select x.request_id into v_req
    from app.data_subject_request_history x join app.data_subject_requests d on d.id = x.request_id
   where d.church_id = p_church_id and d.person_id = p_person_id and d.request_type = 'anonymization'
     and d.response_reference = 'restricted_health_retention' and x.action = 'restricted_health_retention'
   order by x.occurred_at desc, x.id desc limit 1;
  -- QA63R2-01: so desfaz quem restringiu: exige pedido de restricao DESTA igreja e vinculo aberto nela
  if v_req is null or not exists (select 1 from app.church_people where church_id = p_church_id and person_id = p_person_id and ended_at is null) then
    perform app.raise_domain_error('RESTRICTION_NOT_FOUND', 'Nao ha restricao desta igreja para esta pessoa (exige pedido de restricao e vinculo aberto)');
  end if;
  select x.metadata->>'statusAnterior', x.metadata->>'desativadoEmAnterior' into v_prev, v_prev_deact_txt
    from app.data_subject_request_history x join app.data_subject_requests d on d.id = x.request_id
   where d.church_id = p_church_id and d.person_id = p_person_id and d.request_type = 'anonymization'
     and d.response_reference = 'restricted_health_retention' and x.action = 'restricted_health_retention'
     and x.metadata->>'statusAnterior' in ('active','inactive','deceased')
   order by x.occurred_at desc, x.id desc limit 1;
  if v_prev is null then v_prev := 'active'; v_sem := true; end if;
  v_prev_deact := case when v_prev = 'active' then null
                       else coalesce(nullif(v_prev_deact_txt, '')::timestamptz, pe.deactivated_at) end;

  perform set_config('app.lgpd_lift', p_person_id::text || ':' || txid_current()::text, true);
  update app.people set status = v_prev, deactivated_at = v_prev_deact, updated_by = v_me where id = p_person_id;
  perform set_config('app.lgpd_lift', '', true);

  for q in select d.id from app.data_subject_requests d
            where d.church_id = p_church_id and d.person_id = p_person_id and d.request_type = 'anonymization'
              and d.response_reference = 'restricted_health_retention'
            for update loop
    update app.data_subject_requests set response_reference = 'restriction_lifted', updated_by = v_me where id = q.id;
    perform private.v39_dsr_move(q.id, 'completed', 'completed', 'restriction_lifted', v_me, left(v_reason, 500),
            jsonb_build_object('statusNovo', v_prev, 'semRegistroAnterior', v_sem));
  end loop;
  insert into audit.events (church_id, actor_user_account_id, action, entity_schema, entity_name, entity_id, event_category, sensitivity, outcome, source, metadata)
  values (p_church_id, v_me, 'person_restriction_lifted', 'app', 'people', p_person_id::text, 'privacy', 'personal', 'success', 'rpc',
          jsonb_build_object('motivo', left(v_reason, 500), 'statusAnterior', case when v_sem then null else v_prev end, 'statusNovo', v_prev,
                             'semRegistroAnterior', v_sem, 'pedidoId', v_req, 'contasReativadas', false));
  return jsonb_build_object('ok', true, 'pessoa', jsonb_build_object('id', p_person_id), 'statusNovo', v_prev);
end $f$;

revoke all on function app.v39_privacy_restricted_list(uuid), app.v39_privacy_restriction_lift(uuid,uuid,text) from public, anon;
grant execute on function app.v39_privacy_restricted_list(uuid), app.v39_privacy_restriction_lift(uuid,uuid,text) to authenticated;

commit;

-- ---------------------------------------------------------------------
-- VERIFICACAO (rodar depois do commit; tudo deve ser true)
-- ---------------------------------------------------------------------
select
  (select count(*) = 4 from pg_trigger where not tgisinternal and tgname in
     ('trg_v39_lgpd_guard_people','trg_v39_lgpd_guard_contacts','trg_v39_lgpd_guard_addresses','trg_v39_lgpd_guard_church_people')) as gatilhos_ok,
  (select pg_get_functiondef('app.v39_person_legacy_base(uuid,uuid)'::regprocedure) like '%restritoLgpd%') as leitura_ok,
  not has_function_privilege('authenticated', 'private.v39_lgpd_guard_people()', 'EXECUTE') as gatilho_fechado,
  (select pg_get_functiondef('app.v39_list_people(uuid)'::regprocedure) like '%rp.status = ''restricted''%') as lista_filtra_restrita,
  has_function_privilege('authenticated', 'app.v39_list_people(uuid)', 'EXECUTE') as lista_executavel,
  (select pg_get_functiondef('app.search_people(uuid,text,integer)'::regprocedure) not like '%view_restricted%') as busca_filtra_restrita,
  has_function_privilege('authenticated', 'app.search_people(uuid,text,integer)', 'EXECUTE') as busca_executavel,
  (has_function_privilege('authenticated', 'app.v39_privacy_restriction_lift(uuid,uuid,text)', 'EXECUTE')
     and has_function_privilege('authenticated', 'app.v39_privacy_restricted_list(uuid)', 'EXECUTE')
     and not has_function_privilege('anon', 'app.v39_privacy_restriction_lift(uuid,uuid,text)', 'EXECUTE')
     and not has_function_privilege('anon', 'app.v39_privacy_restricted_list(uuid)', 'EXECUTE')) as desfazer_ok,
  (select pg_get_functiondef('private.v39_lgpd_guard_people()'::regprocedure) like '%app.lgpd_lift%') as gatilho_aceita_desfazer,
  (select qual like '%restricted%' from pg_policies where schemaname = 'app' and tablename = 'people'
     and policyname = 'v39_people_select_accessible_church') as rls_filtra_restrita,
  (select count(*) = 0 from app.people where status = 'restricted' and anonymized_at is null
     and not exists (select 1 from app.data_subject_requests d where d.person_id = people.id and d.response_reference = 'restricted_health_retention')) as sem_restrito_fora_lgpd;
