-- =====================================================================
-- CONFIG_1 · Configurações da igreja no Supabase · TESTE COM ROLLBACK
-- ULTIMA EXECUCAO (22/11/2026, conector Supabase da conta, projeto kybrwsxvdbwjtwakczyj, pelo Claude):
--   ERROR P0001: TESTE CONFIG_1 CONCLUIDO (nada foi gravado): T1 ok; T2 ok; T3 ok; T4 ok; T5 ok; T6 ok; T7 ok; T8 ok; T9 ok (REVERTER ok)
-- Gerado a partir do _aplicar e do _reverter (corpo identico, sem begin/commit/notify), com dados ficticios.
-- Casos:
--   T1  antes de salvar: get devolve nome da igreja, listas vazias e salvoEm nulo
--   T2  discipulo não salva (PERMISSION_DENIED); lê (get)
--   T3  master salva tudo; get devolve igual; app.churches recebe CNPJ, pastor, encarregado e endereço (UF mantida);
--       settings gravados; auditoria
--   T4  validações: cor, e-mail, data, arquivo fora da pasta da igreja, nome vazio
--   T5  salvar de novo sem logoPath mantém o logo; logoPath '' remove
--   T6  política (POLITICA_1) passa a mostrar o encarregado salvo aqui
--   T7  edge_config_public devolve nome/cor/caminhos e é só do service_role
--   T8  outra igreja não lê (ACCESS_DENIED)
--   T9  REVERTER remove as funções
-- NAO GRAVA NADA: tudo e desfeito pelo raise final.
-- =====================================================================
do $t$
declare
  v_ch uuid := gen_random_uuid(); v_ch2 uuid := gen_random_uuid();
  v_au_m uuid := gen_random_uuid(); v_au_d uuid := gen_random_uuid(); v_au_x uuid := gen_random_uuid();
  v_p_m uuid; v_p_d uuid; v_p_x uuid; v_ua_m uuid; v_ua_d uuid; v_ua_x uuid; v_cua uuid; v_master uuid; v_disc uuid;
  r jsonb; c jsonb; v_n int; v_res text := ''; p jsonb;
begin
  -- APLICAR (identico ao _aplicar, sem begin/commit)

create or replace function private.v39_cfg_set(p_church_id uuid, p_key text, p_value jsonb, p_type text, p_me uuid) returns void
language sql security definer set search_path = pg_catalog, app, private as $f$
  insert into app.church_settings (church_id, setting_key, setting_value, value_type, is_active, created_by_user_account_id, updated_by_user_account_id)
  values (p_church_id, p_key, p_value, p_type, true, p_me, p_me)
  on conflict (church_id, lower(setting_key)) do update
     set setting_value = excluded.setting_value, value_type = excluded.value_type, is_active = true,
         updated_at = now(), updated_by_user_account_id = excluded.updated_by_user_account_id
$f$;

create or replace function private.v39_cfg_obj(p_church_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare c app.churches; a jsonb; s jsonb;
begin
  select * into c from app.churches where id = p_church_id;
  select coalesce(jsonb_object_agg(lower(setting_key), setting_value), '{}'::jsonb) into s
    from app.church_settings where church_id = p_church_id and is_active;
  a := coalesce(c.legal_address, '{}'::jsonb);
  return jsonb_build_object(
    'nome', coalesce(nullif(s->>'identity.display_name', ''), c.name, ''),
    'cnpj', coalesce(c.cnpj, ''),
    'fundacao', coalesce(s->>'identity.founded_on', ''),
    'pastorPresidente', coalesce(c.president_name, ''),
    'endereco', jsonb_build_object('cep', coalesce(a->>'cep', ''), 'rua', coalesce(a->>'rua', ''), 'numero', coalesce(a->>'numero', ''),
                                   'complemento', coalesce(a->>'complemento', ''), 'bairro', coalesce(a->>'bairro', ''),
                                   'cidade', coalesce(a->>'cidade', ''), 'uf', coalesce(a->>'uf', '')),
    'cultos', case when jsonb_typeof(s->'worship.fixed_services') = 'array' then s->'worship.fixed_services' else '[]'::jsonb end,
    'bairros', case when jsonb_typeof(s->'cadastro.districts') = 'array' then s->'cadastro.districts' else '[]'::jsonb end,
    'cor', coalesce(s->>'theme.primary_color', ''),
    'encarregadoNome', coalesce(c.responsible_name, ''),
    'encarregadoTelefone', coalesce(c.responsible_phone, ''),
    'encarregadoEmail', coalesce(c.responsible_email, ''),
    'logoPath', coalesce(s->>'theme.logo_path', ''),
    'iconePath', coalesce(s->>'theme.icon_path', ''),
    'faviconPath', coalesce(s->>'theme.favicon_path', ''),
    'salvoEm', s->>'config.saved_at');
end $f$;

create or replace function app.v39_config_get(p_church_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
begin
  if app.current_user_account_id() is null or app.current_church_user_access_id(p_church_id) is null then
    perform app.raise_domain_error('ACCESS_DENIED', 'Sem acesso ativo a esta igreja');
  end if;
  return jsonb_build_object('ok', true, 'config', private.v39_cfg_obj(p_church_id));
end $f$;

create or replace function app.v39_config_save(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id();
  v_nome text := btrim(coalesce(p->>'nome', ''));
  v_cor text := btrim(coalesce(p->>'cor', ''));
  v_email text := btrim(coalesce(p->>'encarregadoEmail', ''));
  v_fund text := btrim(coalesce(p->>'fundacao', ''));
  v_pref text := p_church_id::text || '/branding/';
  v_end jsonb := coalesce(p->'endereco', '{}'::jsonb);
  v_cultos jsonb := coalesce(p->'cultos', '[]'::jsonb);
  v_bairros jsonb := coalesce(p->'bairros', '[]'::jsonb);
  k text;
begin
  if v_me is null or app.current_church_user_access_id(p_church_id) is null then
    perform app.raise_domain_error('ACCESS_DENIED', 'Sem acesso ativo a esta igreja');
  end if;
  if not private.has_active_profile_in_church(p_church_id, array['master']) then
    perform app.raise_domain_error('PERMISSION_DENIED', 'So o master altera as configuracoes da igreja');
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then perform app.raise_domain_error('CONFIG_INVALIDA', 'Dados invalidos'); end if;
  if v_nome = '' or length(v_nome) > 120 then perform app.raise_domain_error('CONFIG_NOME_INVALIDO', 'Informe o nome da igreja (ate 120 caracteres)'); end if;
  if v_cor <> '' and v_cor !~ '^#[0-9A-Fa-f]{6}$' then perform app.raise_domain_error('CONFIG_COR_INVALIDA', 'Cor invalida'); end if;
  if v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then perform app.raise_domain_error('CONFIG_EMAIL_INVALIDO', 'E-mail do encarregado invalido'); end if;
  if v_fund <> '' and v_fund !~ '^\d{4}-\d{2}-\d{2}$' then perform app.raise_domain_error('CONFIG_DATA_INVALIDA', 'Data de fundacao invalida'); end if;
  if jsonb_typeof(v_end) <> 'object' or jsonb_typeof(v_cultos) <> 'array' or jsonb_typeof(v_bairros) <> 'array'
     or jsonb_array_length(v_cultos) > 50 or jsonb_array_length(v_bairros) > 500 then
    perform app.raise_domain_error('CONFIG_INVALIDA', 'Cultos, bairros ou endereco invalidos');
  end if;
  foreach k in array array['logoPath','iconePath','faviconPath'] loop
    if p ? k and btrim(coalesce(p->>k, '')) <> '' and (left(p->>k, length(v_pref)) <> v_pref or p->>k ~ '\.\.' or length(p->>k) > 300) then
      perform app.raise_domain_error('CONFIG_ARQUIVO_INVALIDO', 'Arquivo de logo/icone fora da pasta da igreja');
    end if;
  end loop;

  update app.churches set
    cnpj = nullif(btrim(coalesce(p->>'cnpj', '')), ''),
    president_name = nullif(btrim(coalesce(p->>'pastorPresidente', '')), ''),
    responsible_name = nullif(btrim(coalesce(p->>'encarregadoNome', '')), ''),
    responsible_phone = nullif(btrim(coalesce(p->>'encarregadoTelefone', '')), ''),
    responsible_email = nullif(v_email, ''),
    legal_address = coalesce(legal_address, '{}'::jsonb) || jsonb_build_object(
      'cep', btrim(coalesce(v_end->>'cep', '')), 'rua', btrim(coalesce(v_end->>'rua', '')), 'numero', btrim(coalesce(v_end->>'numero', '')),
      'complemento', btrim(coalesce(v_end->>'complemento', '')), 'bairro', btrim(coalesce(v_end->>'bairro', '')), 'cidade', btrim(coalesce(v_end->>'cidade', ''))),
    updated_at = now()
  where id = p_church_id;

  perform private.v39_cfg_set(p_church_id, 'identity.display_name', to_jsonb(v_nome), 'string', v_me);
  perform private.v39_cfg_set(p_church_id, 'identity.founded_on', to_jsonb(v_fund), 'string', v_me);
  perform private.v39_cfg_set(p_church_id, 'worship.fixed_services', v_cultos, 'json', v_me);
  perform private.v39_cfg_set(p_church_id, 'cadastro.districts', v_bairros, 'json', v_me);
  if v_cor <> '' then perform private.v39_cfg_set(p_church_id, 'theme.primary_color', to_jsonb(v_cor), 'color', v_me); end if;
  if p ? 'logoPath' then perform private.v39_cfg_set(p_church_id, 'theme.logo_path', to_jsonb(btrim(coalesce(p->>'logoPath', ''))), 'string', v_me); end if;
  if p ? 'iconePath' then perform private.v39_cfg_set(p_church_id, 'theme.icon_path', to_jsonb(btrim(coalesce(p->>'iconePath', ''))), 'string', v_me); end if;
  if p ? 'faviconPath' then perform private.v39_cfg_set(p_church_id, 'theme.favicon_path', to_jsonb(btrim(coalesce(p->>'faviconPath', ''))), 'string', v_me); end if;
  perform private.v39_cfg_set(p_church_id, 'config.saved_at', to_jsonb(now()::text), 'string', v_me);

  insert into audit.events (church_id, actor_user_account_id, action, entity_schema, entity_name, entity_id, event_category, sensitivity, outcome, source, metadata)
  values (p_church_id, v_me, 'church_config_saved', 'app', 'churches', p_church_id::text, 'administrative', 'standard', 'success', 'rpc',
          jsonb_build_object('logo', p ? 'logoPath', 'icone', p ? 'iconePath'));
  return jsonb_build_object('ok', true, 'config', private.v39_cfg_obj(p_church_id));
end $f$;

create or replace function app.edge_config_public(p_church_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, app, private as $f$
declare o jsonb := private.v39_cfg_obj(p_church_id);
begin
  return jsonb_build_object('ok', true, 'nome', o->>'nome', 'cor', o->>'cor', 'logoPath', o->>'logoPath', 'iconePath', o->>'iconePath',
                            'faviconPath', o->>'faviconPath', 'salvoEm', o->>'salvoEm');
end $f$;

revoke all on function private.v39_cfg_set(uuid,text,jsonb,text,uuid), private.v39_cfg_obj(uuid) from public, anon, authenticated;
revoke all on function app.v39_config_get(uuid), app.v39_config_save(uuid,jsonb), app.edge_config_public(uuid) from public, anon, authenticated;
grant execute on function app.v39_config_get(uuid), app.v39_config_save(uuid,jsonb) to authenticated;
grant execute on function app.edge_config_public(uuid) to service_role;


  select id into v_master from app.access_profiles where code = 'master' and is_active;
  select id into v_disc from app.access_profiles where code = 'disciple' and is_active;
  insert into app.churches (id, name, slug, timezone, legal_address) values
    (v_ch, 'Igreja Teste CFG1', 'teste-cfg1-' || left(v_ch::text, 8), 'America/Sao_Paulo', jsonb_build_object('uf', 'SP')),
    (v_ch2, 'Outra Igreja CFG1', 'teste-cfg1b-' || left(v_ch2::text, 8), 'America/Sao_Paulo', null);
  insert into auth.users (id, email) values (v_au_m, 'cfg1m@teste.invalid'), (v_au_d, 'cfg1d@teste.invalid'), (v_au_x, 'cfg1x@teste.invalid');
  insert into app.people (full_name) values ('CFG1 Master') returning id into v_p_m;
  insert into app.people (full_name) values ('CFG1 Discipulo') returning id into v_p_d;
  insert into app.people (full_name) values ('CFG1 Outra') returning id into v_p_x;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_m, v_p_m, 'active', now(), 'tcfg1m') returning id into v_ua_m;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_d, v_p_d, 'active', now(), 'tcfg1d') returning id into v_ua_d;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_x, v_p_x, 'active', now(), 'tcfg1x') returning id into v_ua_x;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua_m, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_master, true, now() - interval '1 day');
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua_d, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_disc, true, now() - interval '1 day');
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch2, v_ua_x, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_x) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_master, true, now() - interval '1 day');

  -- T1
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  begin set local role authenticated; r := app.v39_config_get(v_ch); reset role;
  exception when others then reset role; raise exception 'FALHOU T1: % %', sqlstate, sqlerrm; end;
  c := r->'config';
  if c->>'nome' <> 'Igreja Teste CFG1' or c->'cultos' <> '[]'::jsonb or c->'bairros' <> '[]'::jsonb or c->>'salvoEm' is not null or c->'endereco'->>'uf' <> 'SP' then
    raise exception 'FALHOU T1: %', c;
  end if;
  v_res := v_res || 'T1 ok; ';

  p := jsonb_build_object('nome', 'Viver Teste', 'cnpj', '00.000.000/0001-91', 'fundacao', '2010-03-15', 'pastorPresidente', 'Pr. Fulano',
         'endereco', jsonb_build_object('cep', '15990-000', 'rua', 'Rua A', 'numero', '10', 'complemento', 'Sala 2', 'bairro', 'Centro', 'cidade', 'Matao'),
         'cultos', jsonb_build_array(jsonb_build_object('dia', '0', 'horario', '18:00', 'nome', 'Culto de domingo')),
         'bairros', jsonb_build_array('Centro', 'Jardim Paraiso'), 'cor', '#16A36A',
         'encarregadoNome', 'Maria Encarregada', 'encarregadoTelefone', '(16) 99999-0000', 'encarregadoEmail', 'dados@teste.invalid',
         'logoPath', v_ch::text || '/branding/logo-1.png', 'iconePath', v_ch::text || '/branding/icone-1.png', 'faviconPath', v_ch::text || '/branding/favicon-1.png');

  -- T2
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_d, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_d::text, true);
  begin set local role authenticated; perform app.v39_config_save(v_ch, p); reset role; raise exception 'FALHOU T2a';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'PERMISSION_DENIED' then raise exception 'FALHOU T2a: %', sqlerrm; end if; end;
  begin set local role authenticated; r := app.v39_config_get(v_ch); reset role;
  exception when others then reset role; raise exception 'FALHOU T2b: % %', sqlstate, sqlerrm; end;
  v_res := v_res || 'T2 ok; ';

  -- T3
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  begin set local role authenticated; r := app.v39_config_save(v_ch, p); reset role;
  exception when others then reset role; raise exception 'FALHOU T3: % %', sqlstate, sqlerrm; end;
  c := r->'config';
  if c->>'nome' <> 'Viver Teste' or c->>'cnpj' <> '00.000.000/0001-91' or c->>'fundacao' <> '2010-03-15' or c->>'pastorPresidente' <> 'Pr. Fulano'
     or c->'endereco'->>'rua' <> 'Rua A' or c->'endereco'->>'uf' <> 'SP' or c->'cultos'->0->>'nome' <> 'Culto de domingo'
     or c->'bairros'->>1 <> 'Jardim Paraiso' or c->>'cor' <> '#16A36A' or c->>'encarregadoEmail' <> 'dados@teste.invalid'
     or c->>'logoPath' <> v_ch::text || '/branding/logo-1.png' or c->>'salvoEm' is null then
    raise exception 'FALHOU T3a: %', c;
  end if;
  select count(*) into v_n from app.churches where id = v_ch and cnpj = '00.000.000/0001-91' and president_name = 'Pr. Fulano'
     and responsible_name = 'Maria Encarregada' and responsible_phone = '(16) 99999-0000' and responsible_email = 'dados@teste.invalid'
     and legal_address->>'cidade' = 'Matao' and legal_address->>'uf' = 'SP' and name = 'Igreja Teste CFG1';
  if v_n <> 1 then raise exception 'FALHOU T3b: app.churches'; end if;
  select count(*) into v_n from audit.events where entity_id = v_ch::text and action = 'church_config_saved';
  if v_n <> 1 then raise exception 'FALHOU T3c: auditoria'; end if;
  v_res := v_res || 'T3 ok; ';

  -- T4 validações
  begin set local role authenticated; perform app.v39_config_save(v_ch, p || jsonb_build_object('cor', 'azul')); reset role; raise exception 'FALHOU T4a';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'CONFIG_COR_INVALIDA' then raise exception 'FALHOU T4a: %', sqlerrm; end if; end;
  begin set local role authenticated; perform app.v39_config_save(v_ch, p || jsonb_build_object('encarregadoEmail', 'sem-arroba')); reset role; raise exception 'FALHOU T4b';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'CONFIG_EMAIL_INVALIDO' then raise exception 'FALHOU T4b: %', sqlerrm; end if; end;
  begin set local role authenticated; perform app.v39_config_save(v_ch, p || jsonb_build_object('fundacao', '15/03/2010')); reset role; raise exception 'FALHOU T4c';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'CONFIG_DATA_INVALIDA' then raise exception 'FALHOU T4c: %', sqlerrm; end if; end;
  begin set local role authenticated; perform app.v39_config_save(v_ch, p || jsonb_build_object('logoPath', v_ch2::text || '/branding/x.png')); reset role; raise exception 'FALHOU T4d';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'CONFIG_ARQUIVO_INVALIDO' then raise exception 'FALHOU T4d: %', sqlerrm; end if; end;
  begin set local role authenticated; perform app.v39_config_save(v_ch, p || jsonb_build_object('nome', '  ')); reset role; raise exception 'FALHOU T4e';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'CONFIG_NOME_INVALIDO' then raise exception 'FALHOU T4e: %', sqlerrm; end if; end;
  v_res := v_res || 'T4 ok; ';

  -- T5 logo mantido quando a chave não vem; removido com ''
  begin set local role authenticated; r := app.v39_config_save(v_ch, (p - 'logoPath' - 'iconePath' - 'faviconPath') || jsonb_build_object('nome', 'Viver Teste 2')); reset role;
  exception when others then reset role; raise exception 'FALHOU T5a: % %', sqlstate, sqlerrm; end;
  if r->'config'->>'logoPath' <> v_ch::text || '/branding/logo-1.png' or r->'config'->>'nome' <> 'Viver Teste 2' then raise exception 'FALHOU T5a: %', r; end if;
  begin set local role authenticated; r := app.v39_config_save(v_ch, p || jsonb_build_object('logoPath', '')); reset role;
  exception when others then reset role; raise exception 'FALHOU T5b: % %', sqlstate, sqlerrm; end;
  if r->'config'->>'logoPath' <> '' then raise exception 'FALHOU T5b: %', r; end if;
  v_res := v_res || 'T5 ok; ';

  -- T6 política mostra o encarregado salvo aqui (se a POLITICA_1 estiver aplicada)
  if to_regprocedure('private.v39_privacy_render(uuid,text)') is not null then
    if private.v39_privacy_render(v_ch, 'Enc {{ENCARREGADO_NOME}} <{{ENCARREGADO_EMAIL}}> tel {{ENCARREGADO_TELEFONE}}') <> 'Enc Maria Encarregada <dados@teste.invalid> tel (16) 99999-0000' then
      raise exception 'FALHOU T6';
    end if;
    v_res := v_res || 'T6 ok; ';
  else
    v_res := v_res || 'T6 pulado (sem POLITICA_1); ';
  end if;

  -- T7 edge pública
  r := app.edge_config_public(v_ch);
  if r->>'nome' <> 'Viver Teste' or r->>'cor' <> '#16A36A' or r->>'iconePath' <> v_ch::text || '/branding/icone-1.png' then raise exception 'FALHOU T7a: %', r; end if;
  if has_function_privilege('authenticated', 'app.edge_config_public(uuid)', 'EXECUTE') or has_function_privilege('anon', 'app.v39_config_get(uuid)', 'EXECUTE') then
    raise exception 'FALHOU T7b: privilegios';
  end if;
  v_res := v_res || 'T7 ok; ';

  -- T8 outra igreja
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_x, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_x::text, true);
  begin set local role authenticated; perform app.v39_config_get(v_ch); reset role; raise exception 'FALHOU T8';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'ACCESS_DENIED' then raise exception 'FALHOU T8: %', sqlerrm; end if; end;
  v_res := v_res || 'T8 ok; ';

  -- REVERTER (identico ao _reverter, sem begin/commit)

drop function if exists app.edge_config_public(uuid);
drop function if exists app.v39_config_save(uuid,jsonb);
drop function if exists app.v39_config_get(uuid);
drop function if exists private.v39_cfg_obj(uuid);
drop function if exists private.v39_cfg_set(uuid,text,jsonb,text,uuid);

  if to_regprocedure('app.v39_config_save(uuid,jsonb)') is not null or to_regprocedure('app.v39_config_get(uuid)') is not null
     or to_regprocedure('app.edge_config_public(uuid)') is not null or to_regprocedure('private.v39_cfg_obj(uuid)') is not null then
    raise exception 'FALHOU T9';
  end if;
  v_res := v_res || 'T9 ok (REVERTER ok)';

  raise exception 'TESTE CONFIG_1 CONCLUIDO (nada foi gravado): %', v_res;
end
$t$;
