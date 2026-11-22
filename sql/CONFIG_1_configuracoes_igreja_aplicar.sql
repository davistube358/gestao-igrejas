-- =====================================================================
-- CONFIG_1 · Configurações da igreja no Supabase (sai do Apps Script/Planilhas) · APLICAR
-- 22/11/2026 · DATA · pedido do Diogo: migração completa; encarregado em 3 campos ligados ao cadastro da igreja
-- VALIDACAO: ver cabecalho de CONFIG_1_configuracoes_igreja_teste_rollback.sql
-- ---------------------------------------------------------------------
-- Problema: na v39 a tela Configurações lia do Apps Script (configPublica) e o salvar não estava mapeado
--   ("Ação v39 não mapeada"): nada gravava.
-- Onde cada campo fica (sem tabela nova):
--   app.churches: cnpj, president_name (pastor presidente), responsible_name/phone/email (encarregado; são os
--     marcadores {{ENCARREGADO_*}} da política), legal_address (cep, rua, número, complemento, bairro, cidade;
--     a UF existente é mantida).
--   app.church_settings (chave/valor): identity.display_name (nome exibido), identity.founded_on (fundação),
--     worship.fixed_services (cultos fixos), cadastro.districts (bairros), theme.primary_color (cor),
--     theme.logo_path / theme.icon_path / theme.favicon_path (arquivos no bucket 2gather-media, pasta
--     <igreja>/branding/), config.saved_at (marca de que a configuração já foi salva pelo Supabase).
-- RPCs (SECURITY DEFINER, conta ativa e acesso ativo à igreja):
--   app.v39_config_get(church): qualquer membro ativo (nome, cor e logo são a identidade do app; cultos fixos e
--     bairros são usados nas telas).
--   app.v39_config_save(church, p): só master (no app, só o master tem "config"); valida cor, e-mail, caminhos
--     dos arquivos (<igreja>/branding/...), tamanhos; grava audit.events 'church_config_saved'.
--   app.edge_config_public(church): só service_role (Edge auth, tela de login): nome, cor e caminhos.
-- Não muda tabelas, colunas, policies nem funções existentes.
-- Reverter: CONFIG_1_configuracoes_igreja_reverter.sql (remove as funções; os valores gravados ficam).
-- Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

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

commit;

notify pgrst, 'reload schema';

-- VERIFICACAO (tudo deve ser true)
select
  has_function_privilege('authenticated', 'app.v39_config_get(uuid)', 'EXECUTE') and has_function_privilege('authenticated', 'app.v39_config_save(uuid,jsonb)', 'EXECUTE') as rpcs_ok,
  not has_function_privilege('anon', 'app.v39_config_save(uuid,jsonb)', 'EXECUTE') as anon_fechado,
  not has_function_privilege('authenticated', 'app.edge_config_public(uuid)', 'EXECUTE') and has_function_privilege('service_role', 'app.edge_config_public(uuid)', 'EXECUTE') as edge_so_service_role,
  not has_function_privilege('authenticated', 'private.v39_cfg_set(uuid,text,jsonb,text,uuid)', 'EXECUTE') as helper_fechado;
