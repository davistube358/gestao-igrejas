-- =====================================================================
-- CAD_1 · cadastro legal único da Igreja e do Instituto · REVERTER
-- Volta as funções ao estado anterior ao CAD_1 (CONFIG_1 e INST_S7/S9) e remove private.v39_inst_entity_id.
-- Os dados migrados (M1/M2) ficam como estão; o valor anterior está em app.v39_fin_entity_log
-- (actions 'cad1_unifica_igreja' e 'cad1_unifica_instituto').
-- Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

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

create or replace function app.v39_fin_entities_list(p_church_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_doc jsonb := private.v39_fin_church_doc(p_church_id);
begin
  if private.v39_fin_me() is null or not exists (select 1 from app.permissions pm where pm.code like 'financial.%' and private.v39_fin_has(p_church_id, pm.code)) then
    perform app.raise_domain_error('PERMISSION_DENIED', 'Sem acesso ao Financeiro'); end if;
  insert into app.v39_fin_entities (church_id, kind, legal_name)
    select p_church_id, 'church', coalesce(c.legal_name, c.name, 'Igreja') from app.churches c where c.id = p_church_id on conflict do nothing;
  v_doc := private.v39_fin_church_doc(p_church_id);
  return jsonb_build_object('atual', private.v39_fin_target_entity(), 'entidades', coalesce((select jsonb_agg(jsonb_build_object(
      'id', case when e.kind = 'church' then null else e.id end, 'registroId', e.id, 'tipo', e.kind, 'nome', e.legal_name, 'fantasia', coalesce(e.trade_name, ''),
      'cnpj', coalesce(e.cnpj, ''), 'cnpjEfetivo', coalesce(nullif(e.cnpj, ''), v_doc->>'cnpj', ''), 'usaCnpjDaIgreja', e.kind = 'institute' and nullif(e.cnpj, '') is null,
      'ie', coalesce(e.state_registration, ''), 'im', coalesce(e.municipal_registration, ''), 'presidente', coalesce(e.president_name, ''),
      'responsavel', coalesce(e.responsible_name, ''), 'telefone', coalesce(e.responsible_phone, ''), 'email', coalesce(e.responsible_email, ''),
      'endereco', e.address, 'obs', coalesce(e.notes, ''), 'ativa', e.is_active,
      'contas', (select count(*) from app.financial_accounts a where a.church_id = p_church_id and a.entity_id is not distinct from case when e.kind = 'church' then null else e.id end))
      order by (e.kind = 'church') desc, e.legal_name)
    from app.v39_fin_entities e where e.church_id = p_church_id), '[]'::jsonb));
end $f$;

create or replace function private.v39_inst_ident_json(p_church_id uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog, app, private as $f$
  select to_jsonb(x) from (
    select i.display_name as nome, coalesce(i.legal_name, '') as "razaoSocial", coalesce(i.cnpj, '') as cnpj, coalesce(i.responsible, '') as responsavel,
           coalesce(i.phone, '') as telefone, coalesce(i.email, '') as email, coalesce(i.cep, '') as cep, coalesce(i.street, '') as rua,
           coalesce(i.street_number, '') as numero, coalesce(i.complement, '') as complemento, coalesce(i.district, '') as bairro, coalesce(i.city, '') as cidade,
           coalesce(i.logo, '') as logo, i.updated_at as "atualizadoEm"
      from app.v39_inst_identity i where i.church_id = p_church_id) x
$f$;

create or replace function app.v39_inst_identity_save(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_me uuid := app.current_user_account_id(); v_nome text := btrim(coalesce(p->>'nome', '')); v_logo text := nullif(btrim(coalesce(p->>'logo', '')), '');
  v_cnpj text := nullif(btrim(coalesce(p->>'cnpj', '')), ''); k text;
begin
  if v_me is null or not private.v39_est_can_any(p_church_id, array['institute.staff.manage']) then
    perform app.raise_domain_error('PERMISSION_DENIED', 'Somente quem gerencia o Instituto altera estes dados'); end if;
  if length(v_nome) < 3 then perform app.raise_domain_error('IDENTITY_NAME_REQUIRED', 'Informe o nome do Instituto'); end if;
  foreach k in array array['nome', 'razaoSocial', 'responsavel', 'telefone', 'email', 'cep', 'rua', 'numero', 'complemento', 'bairro', 'cidade', 'cnpj'] loop
    if length(coalesce(p->>k, '')) > 200 then perform app.raise_domain_error('IDENTITY_TOO_LONG', 'Algum campo passou de 200 caracteres'); end if;
  end loop;
  if v_cnpj is not null and length(regexp_replace(v_cnpj, '\D', '', 'g')) not in (11, 14) then perform app.raise_domain_error('IDENTITY_CNPJ_INVALID', 'CNPJ invalido (14 numeros; CPF 11)'); end if;
  if v_logo is not null and (v_logo !~ '^data:image/(png|jpeg|jpg|webp);base64,' or length(v_logo) > 250000) then
    perform app.raise_domain_error('IDENTITY_LOGO_INVALID', 'Logo invalida ou muito grande (use PNG ou JPG)'); end if;
  insert into app.v39_inst_identity (church_id, display_name, legal_name, cnpj, responsible, phone, email, cep, street, street_number, complement, district, city, logo, updated_at, updated_by)
  values (p_church_id, v_nome, nullif(btrim(coalesce(p->>'razaoSocial', '')), ''), v_cnpj, nullif(btrim(coalesce(p->>'responsavel', '')), ''), nullif(btrim(coalesce(p->>'telefone', '')), ''),
          nullif(btrim(coalesce(p->>'email', '')), ''), nullif(btrim(coalesce(p->>'cep', '')), ''), nullif(btrim(coalesce(p->>'rua', '')), ''), nullif(btrim(coalesce(p->>'numero', '')), ''),
          nullif(btrim(coalesce(p->>'complemento', '')), ''), nullif(btrim(coalesce(p->>'bairro', '')), ''), nullif(btrim(coalesce(p->>'cidade', '')), ''), v_logo, now(), v_me)
  on conflict (church_id) do update set display_name = excluded.display_name, legal_name = excluded.legal_name, cnpj = excluded.cnpj, responsible = excluded.responsible,
    phone = excluded.phone, email = excluded.email, cep = excluded.cep, street = excluded.street, street_number = excluded.street_number, complement = excluded.complement,
    district = excluded.district, city = excluded.city, logo = excluded.logo, updated_at = now(), updated_by = v_me;
  return jsonb_build_object('ok', true, 'identidade', private.v39_inst_ident_json(p_church_id));
end $f$;

drop function if exists private.v39_inst_entity_id(uuid);

commit;

notify pgrst, 'reload schema';
