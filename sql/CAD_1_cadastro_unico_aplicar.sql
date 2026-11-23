-- =====================================================================
-- CAD_1 · cadastro legal único da Igreja e do Instituto · APLICAR
-- 22/11/2026 · DATA · pedido do Diogo: CNPJ e dados legais numa base só, mostrados em Configurações, no Financeiro e no Instituto
-- VALIDACAO: ver cabecalho de CAD_1_cadastro_unico_teste_rollback.sql
-- ---------------------------------------------------------------------
-- Antes: os dados legais ficavam em 3 lugares e já divergiam:
--   app.churches (Configurações) · app.v39_fin_entities (Financeiro › Entidades: Igreja e Instituto) · app.v39_inst_identity (tela do Instituto).
-- Depois (decisão do Diogo, 22/11):
--   IGREJA    -> app.churches é a base única (legal_name, cnpj, IE, IM, presidente, encarregado, endereço legal).
--                Financeiro › Entidades passa a LER a Igreja de app.churches (v39_fin_entity_save já gravava lá desde o S9).
--   INSTITUTO -> app.v39_fin_entities (kind 'institute', a que já está ligada às contas) é a base única dos dados legais.
--                A tela do Instituto lê e grava lá; app.v39_inst_identity fica só com nome de exibição e logo.
-- Migração de dados (uma vez; nada é apagado; valor anterior registrado em app.v39_fin_entity_log):
--   M1 Igreja: campos VAZIOS de app.churches recebem o que está na entidade Igreja do Financeiro (CNPJ, IE, IM, ...).
--   M2 Instituto: a tela do Instituto prevalece (escolha do Diogo): razão social, CNPJ, responsável, telefone, e-mail e
--      endereço da tela do Instituto vão para a entidade Instituto; o que estiver vazio lá fica como estava.
--      Sem entidade Instituto e com cadastro na tela do Instituto: cria a entidade.
-- Funções alteradas (create or replace; assinatura, retorno, volatilidade e grants iguais):
--   private.v39_cfg_obj, app.v39_config_save (CONFIG_1): + razão social, IE, IM; CNPJ só números (14) e validado.
--   app.v39_config_get (CONFIG_1): + 'institutos' (dados legais das entidades Instituto, para mostrar em Configurações).
--   app.v39_fin_entities_list: a Igreja vem de app.churches.
--   private.v39_inst_ident_json, app.v39_inst_identity_save: dados legais do Instituto na entidade do Financeiro.
-- Função nova: private.v39_inst_entity_id(church) (entidade Instituto principal: ativa, mais antiga).
-- Reverter: CAD_1_cadastro_unico_reverter.sql (volta as funções; os dados migrados ficam, com o antes no log).
-- Nao contem segredos nem dados pessoais.
-- =====================================================================
begin;

create or replace function private.v39_inst_entity_id(p_church_id uuid) returns uuid
language sql stable security definer set search_path = pg_catalog, app as $f$
  select e.id from app.v39_fin_entities e where e.church_id = p_church_id and e.kind = 'institute'
   order by e.is_active desc, e.created_at, e.id limit 1
$f$;

-- ── M1: Igreja (campos vazios de app.churches <- entidade Igreja do Financeiro) ──
insert into app.v39_fin_entity_log (church_id, entity_id, action, payload, performed_by)
select c.id, e.id, 'cad1_unifica_igreja',
       jsonb_build_object('antes_churches', jsonb_build_object('cnpj', c.cnpj, 'ie', c.state_registration, 'im', c.municipal_registration, 'legal_name', c.legal_name,
                            'president_name', c.president_name, 'responsible_name', c.responsible_name, 'responsible_phone', c.responsible_phone,
                            'responsible_email', c.responsible_email, 'legal_address', c.legal_address)), null
  from app.churches c join app.v39_fin_entities e on e.church_id = c.id and e.kind = 'church';

update app.churches c set
  cnpj = coalesce(nullif(regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g'), ''), nullif(regexp_replace(coalesce(e.cnpj, ''), '\D', '', 'g'), '')),
  state_registration = coalesce(nullif(btrim(c.state_registration), ''), nullif(btrim(e.state_registration), '')),
  municipal_registration = coalesce(nullif(btrim(c.municipal_registration), ''), nullif(btrim(e.municipal_registration), '')),
  legal_name = coalesce(nullif(btrim(c.legal_name), ''), nullif(btrim(e.legal_name), '')),
  president_name = coalesce(nullif(btrim(c.president_name), ''), nullif(btrim(e.president_name), '')),
  responsible_name = coalesce(nullif(btrim(c.responsible_name), ''), nullif(btrim(e.responsible_name), '')),
  responsible_phone = coalesce(nullif(btrim(c.responsible_phone), ''), nullif(btrim(e.responsible_phone), '')),
  responsible_email = coalesce(nullif(btrim(c.responsible_email), ''), nullif(btrim(e.responsible_email), '')),
  legal_address = case when c.legal_address is null or c.legal_address = '{}'::jsonb then coalesce(e.address, '{}'::jsonb) else c.legal_address end,
  updated_at = now()
from app.v39_fin_entities e
where e.church_id = c.id and e.kind = 'church';

-- ── M2: Instituto (tela do Instituto prevalece; vazio não sobrescreve) ──
insert into app.v39_fin_entities (church_id, kind, legal_name, trade_name, cnpj, responsible_name, responsible_phone, responsible_email, address)
select i.church_id, 'institute', coalesce(nullif(btrim(i.legal_name), ''), i.display_name), nullif(btrim(i.display_name), ''),
       nullif(regexp_replace(coalesce(i.cnpj, ''), '\D', '', 'g'), ''), nullif(btrim(i.responsible), ''), nullif(btrim(i.phone), ''), nullif(lower(btrim(i.email)), ''),
       jsonb_strip_nulls(jsonb_build_object('cep', nullif(btrim(i.cep), ''), 'rua', nullif(btrim(i.street), ''), 'numero', nullif(btrim(i.street_number), ''),
         'complemento', nullif(btrim(i.complement), ''), 'bairro', nullif(btrim(i.district), ''), 'cidade', nullif(btrim(i.city), '')))
  from app.v39_inst_identity i
 where private.v39_inst_entity_id(i.church_id) is null;

insert into app.v39_fin_entity_log (church_id, entity_id, action, payload, performed_by)
select i.church_id, e.id, 'cad1_unifica_instituto',
       jsonb_build_object('antes_entidade', to_jsonb(e) - 'notes', 'tela_instituto', jsonb_build_object('legal_name', i.legal_name, 'cnpj', i.cnpj, 'responsible', i.responsible,
         'phone', i.phone, 'email', i.email, 'cep', i.cep, 'street', i.street, 'street_number', i.street_number, 'complement', i.complement, 'district', i.district, 'city', i.city)), null
  from app.v39_inst_identity i join app.v39_fin_entities e on e.id = private.v39_inst_entity_id(i.church_id);

update app.v39_fin_entities e set
  legal_name = coalesce(nullif(btrim(i.legal_name), ''), e.legal_name),
  trade_name = coalesce(nullif(btrim(e.trade_name), ''), nullif(btrim(i.display_name), '')),
  cnpj = coalesce(nullif(regexp_replace(coalesce(i.cnpj, ''), '\D', '', 'g'), ''), e.cnpj),
  responsible_name = coalesce(nullif(btrim(i.responsible), ''), e.responsible_name),
  responsible_phone = coalesce(nullif(btrim(i.phone), ''), e.responsible_phone),
  responsible_email = coalesce(nullif(lower(btrim(i.email)), ''), e.responsible_email),
  address = case when coalesce(nullif(btrim(i.cep), ''), nullif(btrim(i.street), ''), nullif(btrim(i.district), ''), nullif(btrim(i.city), '')) is null then e.address
                 else coalesce(e.address, '{}'::jsonb) || jsonb_build_object('cep', coalesce(btrim(i.cep), ''), 'rua', coalesce(btrim(i.street), ''), 'numero', coalesce(btrim(i.street_number), ''),
                        'complemento', coalesce(btrim(i.complement), ''), 'bairro', coalesce(btrim(i.district), ''), 'cidade', coalesce(btrim(i.city), '')) end,
  updated_at = now()
from app.v39_inst_identity i
where e.id = private.v39_inst_entity_id(i.church_id);

-- ── Configurações (CONFIG_1 + razão social, IE, IM; institutos) ──
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
    'razaoSocial', coalesce(c.legal_name, ''),
    'cnpj', coalesce(c.cnpj, ''),
    'ie', coalesce(c.state_registration, ''),
    'im', coalesce(c.municipal_registration, ''),
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
  return jsonb_build_object('ok', true, 'config', private.v39_cfg_obj(p_church_id),
    'institutos', coalesce((select jsonb_agg(jsonb_build_object('registroId', e.id, 'nome', e.legal_name, 'fantasia', coalesce(e.trade_name, ''),
        'cnpj', coalesce(e.cnpj, ''), 'ie', coalesce(e.state_registration, ''), 'im', coalesce(e.municipal_registration, ''), 'presidente', coalesce(e.president_name, ''),
        'responsavel', coalesce(e.responsible_name, ''), 'telefone', coalesce(e.responsible_phone, ''), 'email', coalesce(e.responsible_email, ''),
        'endereco', e.address, 'obs', coalesce(e.notes, ''), 'ativa', e.is_active, 'principal', e.id = private.v39_inst_entity_id(p_church_id))
        order by e.is_active desc, e.created_at)
      from app.v39_fin_entities e where e.church_id = p_church_id and e.kind = 'institute'), '[]'::jsonb));
end $f$;

create or replace function app.v39_config_save(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare
  v_me uuid := app.current_user_account_id();
  v_nome text := btrim(coalesce(p->>'nome', ''));
  v_cor text := btrim(coalesce(p->>'cor', ''));
  v_email text := btrim(coalesce(p->>'encarregadoEmail', ''));
  v_fund text := btrim(coalesce(p->>'fundacao', ''));
  v_cnpj text := regexp_replace(coalesce(p->>'cnpj', ''), '\D', '', 'g');
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
  if v_cnpj <> '' and length(v_cnpj) <> 14 then perform app.raise_domain_error('CONFIG_CNPJ_INVALIDO', 'CNPJ deve ter 14 digitos'); end if;
  foreach k in array array['razaoSocial','ie','im'] loop
    if length(coalesce(p->>k, '')) > 200 then perform app.raise_domain_error('CONFIG_INVALIDA', 'Campo muito longo'); end if;
  end loop;
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
    cnpj = case when p ? 'cnpj' then nullif(v_cnpj, '') else cnpj end,
    legal_name = case when p ? 'razaoSocial' then nullif(btrim(coalesce(p->>'razaoSocial', '')), '') else legal_name end,
    state_registration = case when p ? 'ie' then nullif(btrim(coalesce(p->>'ie', '')), '') else state_registration end,
    municipal_registration = case when p ? 'im' then nullif(btrim(coalesce(p->>'im', '')), '') else municipal_registration end,
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

-- ── Financeiro › Entidades: a Igreja vem de app.churches ──
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
      'id', case when e.kind = 'church' then null else e.id end, 'registroId', e.id, 'tipo', e.kind,
      'nome', case when e.kind = 'church' then coalesce(nullif(c.legal_name, ''), c.name, e.legal_name) else e.legal_name end,
      'fantasia', coalesce(e.trade_name, ''),
      'cnpj', coalesce(case when e.kind = 'church' then c.cnpj else e.cnpj end, ''),
      'cnpjEfetivo', coalesce(nullif(case when e.kind = 'church' then c.cnpj else e.cnpj end, ''), v_doc->>'cnpj', ''),
      'usaCnpjDaIgreja', e.kind = 'institute' and nullif(e.cnpj, '') is null,
      'ie', coalesce(case when e.kind = 'church' then c.state_registration else e.state_registration end, ''),
      'im', coalesce(case when e.kind = 'church' then c.municipal_registration else e.municipal_registration end, ''),
      'presidente', coalesce(case when e.kind = 'church' then c.president_name else e.president_name end, ''),
      'responsavel', coalesce(case when e.kind = 'church' then c.responsible_name else e.responsible_name end, ''),
      'telefone', coalesce(case when e.kind = 'church' then c.responsible_phone else e.responsible_phone end, ''),
      'email', coalesce(case when e.kind = 'church' then c.responsible_email else e.responsible_email end, ''),
      'endereco', case when e.kind = 'church' then coalesce(c.legal_address, '{}'::jsonb) else e.address end,
      'obs', coalesce(e.notes, ''), 'ativa', e.is_active,
      'contas', (select count(*) from app.financial_accounts a where a.church_id = p_church_id and a.entity_id is not distinct from case when e.kind = 'church' then null else e.id end))
      order by (e.kind = 'church') desc, e.legal_name)
    from app.v39_fin_entities e left join app.churches c on c.id = e.church_id and e.kind = 'church'
   where e.church_id = p_church_id), '[]'::jsonb));
end $f$;

-- ── Instituto: dados legais na entidade do Financeiro; v39_inst_identity só com nome de exibição e logo ──
create or replace function private.v39_inst_ident_json(p_church_id uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog, app, private as $f$
  select to_jsonb(x) from (
    select coalesce(i.display_name, e.trade_name, e.legal_name, '') as nome,
           coalesce(case when e.id is null then i.legal_name else e.legal_name end, '') as "razaoSocial",
           coalesce(case when e.id is null then i.cnpj else e.cnpj end, '') as cnpj,
           coalesce(case when e.id is null then i.responsible else e.responsible_name end, '') as responsavel,
           coalesce(case when e.id is null then i.phone else e.responsible_phone end, '') as telefone,
           coalesce(case when e.id is null then i.email else e.responsible_email end, '') as email,
           coalesce(case when e.id is null then i.cep else e.address->>'cep' end, '') as cep,
           coalesce(case when e.id is null then i.street else e.address->>'rua' end, '') as rua,
           coalesce(case when e.id is null then i.street_number else e.address->>'numero' end, '') as numero,
           coalesce(case when e.id is null then i.complement else e.address->>'complemento' end, '') as complemento,
           coalesce(case when e.id is null then i.district else e.address->>'bairro' end, '') as bairro,
           coalesce(case when e.id is null then i.city else e.address->>'cidade' end, '') as cidade,
           coalesce(i.logo, '') as logo, greatest(i.updated_at, e.updated_at) as "atualizadoEm", e.id as "entidadeId"
      from (select p_church_id as cid) b
      left join app.v39_inst_identity i on i.church_id = b.cid
      left join app.v39_fin_entities e on e.id = private.v39_inst_entity_id(b.cid)
     where i.church_id is not null or e.id is not null) x
$f$;

create or replace function app.v39_inst_identity_save(p_church_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, app, private as $f$
declare v_me uuid := app.current_user_account_id(); v_nome text := btrim(coalesce(p->>'nome', '')); v_logo text := nullif(btrim(coalesce(p->>'logo', '')), '');
  v_cnpj text := nullif(btrim(coalesce(p->>'cnpj', '')), ''); k text; v_e uuid;
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
  v_cnpj := nullif(regexp_replace(coalesce(v_cnpj, ''), '\D', '', 'g'), '');

  -- identidade visual (nome de exibição e logo)
  insert into app.v39_inst_identity (church_id, display_name, logo, updated_at, updated_by)
  values (p_church_id, v_nome, v_logo, now(), v_me)
  on conflict (church_id) do update set display_name = excluded.display_name, logo = excluded.logo, updated_at = now(), updated_by = v_me;

  -- dados legais: base única na entidade Instituto do Financeiro
  v_e := private.v39_inst_entity_id(p_church_id);
  if v_e is null then
    insert into app.v39_fin_entities (church_id, kind, legal_name, trade_name, cnpj, responsible_name, responsible_phone, responsible_email, address, created_by, updated_by)
    values (p_church_id, 'institute', left(coalesce(nullif(btrim(coalesce(p->>'razaoSocial', '')), ''), v_nome), 200), v_nome, v_cnpj,
            nullif(btrim(coalesce(p->>'responsavel', '')), ''), nullif(btrim(coalesce(p->>'telefone', '')), ''), nullif(lower(btrim(coalesce(p->>'email', ''))), ''),
            jsonb_build_object('cep', btrim(coalesce(p->>'cep', '')), 'rua', btrim(coalesce(p->>'rua', '')), 'numero', btrim(coalesce(p->>'numero', '')),
              'complemento', btrim(coalesce(p->>'complemento', '')), 'bairro', btrim(coalesce(p->>'bairro', '')), 'cidade', btrim(coalesce(p->>'cidade', ''))), v_me, v_me)
    returning id into v_e;
  else
    update app.v39_fin_entities set
      legal_name = left(coalesce(nullif(btrim(coalesce(p->>'razaoSocial', '')), ''), legal_name), 200),
      cnpj = v_cnpj,
      responsible_name = nullif(btrim(coalesce(p->>'responsavel', '')), ''),
      responsible_phone = nullif(btrim(coalesce(p->>'telefone', '')), ''),
      responsible_email = nullif(lower(btrim(coalesce(p->>'email', ''))), ''),
      address = coalesce(address, '{}'::jsonb) || jsonb_build_object('cep', btrim(coalesce(p->>'cep', '')), 'rua', btrim(coalesce(p->>'rua', '')), 'numero', btrim(coalesce(p->>'numero', '')),
              'complemento', btrim(coalesce(p->>'complemento', '')), 'bairro', btrim(coalesce(p->>'bairro', '')), 'cidade', btrim(coalesce(p->>'cidade', ''))),
      updated_at = now(), updated_by = v_me
    where id = v_e;
  end if;
  insert into app.v39_fin_entity_log (church_id, entity_id, action, payload, performed_by)
  values (p_church_id, v_e, 'inst_identity_save', p - 'logo', v_me);
  return jsonb_build_object('ok', true, 'identidade', private.v39_inst_ident_json(p_church_id));
end $f$;

revoke all on function private.v39_inst_entity_id(uuid) from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- VERIFICACAO (tudo deve ser true)
select
  not has_function_privilege('authenticated', 'private.v39_inst_entity_id(uuid)', 'EXECUTE') as helper_fechado,
  has_function_privilege('authenticated', 'app.v39_config_get(uuid)', 'EXECUTE') and has_function_privilege('authenticated', 'app.v39_inst_identity_save(uuid,jsonb)', 'EXECUTE')
    and has_function_privilege('authenticated', 'app.v39_fin_entities_list(uuid)', 'EXECUTE') as rpcs_ok,
  not exists (select 1 from app.churches c join app.v39_fin_entities e on e.church_id = c.id and e.kind = 'church'
               where nullif(c.cnpj, '') is null and nullif(e.cnpj, '') is not null) as igreja_unificada,
  not exists (select 1 from app.v39_inst_identity i join app.v39_fin_entities e on e.id = private.v39_inst_entity_id(i.church_id)
               where nullif(regexp_replace(coalesce(i.cnpj, ''), '\D', '', 'g'), '') is not null
                 and e.cnpj is distinct from regexp_replace(i.cnpj, '\D', '', 'g')) as instituto_unificado;
