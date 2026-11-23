-- =====================================================================
-- CAD_1 · cadastro legal único da Igreja e do Instituto · TESTE COM ROLLBACK
-- ULTIMA EXECUCAO: 22/11/2026, em 3 partes no Supabase (migracao T1-T2; funcoes T3-T7; reverter T8): todas PASS, nada gravado.
--   Na migracao, simulacao nos dados reais: 1 igreja passa a ter CNPJ; Instituto fica com o CNPJ da tela do Instituto.
-- Gerado a partir do _aplicar e do _reverter (corpo identico, sem begin/commit/notify), com dados ficticios.
-- Casos:
--   T1  M1: igreja sem CNPJ recebe CNPJ/IE da entidade Igreja do Financeiro; antes registrado no log
--   T2  M2: entidade Instituto recebe razão social, CNPJ, responsável e endereço da tela do Instituto (UF mantida);
--       igreja só com a tela do Instituto ganha a entidade
--   T3  v39_config_get devolve razão social, CNPJ, IE e os institutos
--   T4  v39_config_save: CNPJ só números; razão social/IE gravadas; chave ausente mantém; CNPJ inválido recusado
--   T5  Financeiro › Entidades mostra a Igreja com os dados de app.churches
--   T6  tela do Instituto grava na entidade do Financeiro (nome/logo em v39_inst_identity) e lê de lá
--   T7  discípulo não grava Configurações nem o Instituto
--   T8  REVERTER volta as 6 funções ao corpo anterior e remove o helper
-- NAO GRAVA NADA: tudo e desfeito pelo raise final.
-- =====================================================================
do $t$
declare
  v_ch uuid := gen_random_uuid(); v_ch2 uuid := gen_random_uuid();
  v_au_m uuid := gen_random_uuid(); v_au_d uuid := gen_random_uuid();
  v_p_m uuid; v_p_d uuid; v_ua_m uuid; v_ua_d uuid; v_cua uuid; v_master uuid; v_disc uuid; v_ei uuid;
  r jsonb; c jsonb; v_n int; v_res text := ''; p jsonb; v_antes jsonb; v_depois jsonb;
  v_fns text[] := array['private.v39_cfg_obj(uuid)', 'app.v39_config_get(uuid)', 'app.v39_config_save(uuid,jsonb)', 'app.v39_fin_entities_list(uuid)',
                        'private.v39_inst_ident_json(uuid)', 'app.v39_inst_identity_save(uuid,jsonb)'];
begin
  select jsonb_object_agg(f, md5(regexp_replace(p2.prosrc, '\s+', '', 'g'))) into v_antes
    from unnest(v_fns) f join pg_proc p2 on p2.oid = f::regprocedure;

  select id into v_master from app.access_profiles where code = 'master' and is_active;
  select id into v_disc from app.access_profiles where code = 'disciple' and is_active;
  insert into app.churches (id, name, slug, timezone, legal_address) values
    (v_ch, 'Igreja Teste CAD1', 'teste-cad1-' || left(v_ch::text, 8), 'America/Sao_Paulo', jsonb_build_object('uf', 'SP', 'cidade', 'Matao')),
    (v_ch2, 'Outra Igreja CAD1', 'teste-cad1b-' || left(v_ch2::text, 8), 'America/Sao_Paulo', null);
  insert into app.v39_fin_entities (church_id, kind, legal_name, cnpj, state_registration) values (v_ch, 'church', 'Igreja Teste CAD1 LTDA', '11444777000161', 'IE-1');
  insert into app.v39_fin_entities (church_id, kind, legal_name, cnpj, address) values (v_ch, 'institute', 'Inst Fin', '11222333000181', jsonb_build_object('uf', 'SP', 'cep', '00000-000'))
    returning id into v_ei;
  insert into app.v39_inst_identity (church_id, display_name, legal_name, cnpj, responsible, phone, email, cep, street, city)
    values (v_ch, 'ISPA', 'Inst Tela', '69.620.351/0001-00', 'Resp Tela', '(16) 3333-0000', 'Inst@Teste.invalid', '15990-000', 'Rua B', 'Matao'),
           (v_ch2, 'Inst Dois', 'Inst Dois LTDA', '', null, null, null, null, null, null);

  -- APLICAR (identico ao _aplicar, sem begin/commit)

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


  -- T1
  select * into c from (select to_jsonb(x) from app.churches x where x.id = v_ch) z;
  if c->>'cnpj' <> '11444777000161' or c->>'state_registration' <> 'IE-1' or c->>'legal_name' <> 'Igreja Teste CAD1 LTDA' then raise exception 'FALHOU T1: %', c; end if;
  if not exists (select 1 from app.v39_fin_entity_log where church_id = v_ch and action = 'cad1_unifica_igreja' and payload->'antes_churches'->>'cnpj' is null) then raise exception 'FALHOU T1 log'; end if;
  v_res := v_res || 'T1 ok; ';

  -- T2
  select to_jsonb(e) into c from app.v39_fin_entities e where e.id = v_ei;
  if c->>'legal_name' <> 'Inst Tela' or c->>'cnpj' <> '69620351000100' or c->>'responsible_name' <> 'Resp Tela' or c->>'responsible_email' <> 'inst@teste.invalid'
     or c->'address'->>'cidade' <> 'Matao' or c->'address'->>'uf' <> 'SP' or c->'address'->>'cep' <> '15990-000' or c->>'trade_name' <> 'ISPA' then raise exception 'FALHOU T2: %', c; end if;
  if not exists (select 1 from app.v39_fin_entity_log where entity_id = v_ei and action = 'cad1_unifica_instituto' and payload->'antes_entidade'->>'cnpj' = '11222333000181') then raise exception 'FALHOU T2 log'; end if;
  select count(*) into v_n from app.v39_fin_entities where church_id = v_ch2 and kind = 'institute' and legal_name = 'Inst Dois LTDA' and cnpj is null;
  if v_n <> 1 then raise exception 'FALHOU T2 igreja 2: %', v_n; end if;
  v_res := v_res || 'T2 ok; ';

  insert into auth.users (id, email) values (v_au_m, 'cad1m@teste.invalid'), (v_au_d, 'cad1d@teste.invalid');
  insert into app.people (full_name) values ('CAD1 Master') returning id into v_p_m;
  insert into app.people (full_name) values ('CAD1 Discipulo') returning id into v_p_d;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_m, v_p_m, 'active', now(), 'tcad1m') returning id into v_ua_m;
  insert into app.user_accounts (auth_user_id, person_id, status, activated_at, username) values (v_au_d, v_p_d, 'active', now(), 'tcad1d') returning id into v_ua_d;
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua_m, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_master, true, now() - interval '1 day');
  insert into app.church_user_access (church_id, user_account_id, status, started_at, approved_at, approved_by_user_account_id) values (v_ch, v_ua_d, 'active', now() - interval '1 day', now() - interval '1 day', v_ua_m) returning id into v_cua;
  insert into app.user_profile_assignments (church_user_access_id, profile_id, is_primary, valid_from) values (v_cua, v_disc, true, now() - interval '1 day');

  -- T3
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_m::text, true);
  begin set local role authenticated; r := app.v39_config_get(v_ch); reset role;
  exception when others then reset role; raise exception 'FALHOU T3: % %', sqlstate, sqlerrm; end;
  if r->'config'->>'razaoSocial' <> 'Igreja Teste CAD1 LTDA' or r->'config'->>'cnpj' <> '11444777000161' or r->'config'->>'ie' <> 'IE-1'
     or jsonb_array_length(r->'institutos') <> 1 or r->'institutos'->0->>'cnpj' <> '69620351000100' or (r->'institutos'->0->>'principal')::boolean is not true then
    raise exception 'FALHOU T3: %', r; end if;
  v_res := v_res || 'T3 ok; ';

  -- T4
  p := jsonb_build_object('nome', 'Viver Teste', 'cnpj', '00.000.000/0001-91', 'razaoSocial', 'Razao Nova', 'ie', '', 'endereco', jsonb_build_object('cidade', 'Matao'),
         'cultos', '[]'::jsonb, 'bairros', '[]'::jsonb);
  begin set local role authenticated; r := app.v39_config_save(v_ch, p); reset role;
  exception when others then reset role; raise exception 'FALHOU T4a: % %', sqlstate, sqlerrm; end;
  select to_jsonb(x) into c from app.churches x where x.id = v_ch;
  if c->>'cnpj' <> '00000000000191' or c->>'legal_name' <> 'Razao Nova' or c->>'state_registration' is not null or c->'legal_address'->>'uf' <> 'SP' then raise exception 'FALHOU T4a: %', c; end if;
  begin set local role authenticated; r := app.v39_config_save(v_ch, (p - 'ie' - 'razaoSocial') || jsonb_build_object('im', 'IM-9')); reset role;
  exception when others then reset role; raise exception 'FALHOU T4b: % %', sqlstate, sqlerrm; end;
  select to_jsonb(x) into c from app.churches x where x.id = v_ch;
  if c->>'legal_name' <> 'Razao Nova' or c->>'municipal_registration' <> 'IM-9' or r->'config'->>'im' <> 'IM-9' then raise exception 'FALHOU T4b: %', c; end if;
  begin set local role authenticated; perform app.v39_config_save(v_ch, p || jsonb_build_object('cnpj', '123')); reset role; raise exception 'FALHOU T4c';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'CONFIG_CNPJ_INVALIDO' then raise exception 'FALHOU T4c: %', sqlerrm; end if; end;
  v_res := v_res || 'T4 ok; ';

  -- T5
  begin set local role authenticated; r := app.v39_fin_entities_list(v_ch); reset role;
  exception when others then reset role; raise exception 'FALHOU T5: % %', sqlstate, sqlerrm; end;
  select x into c from jsonb_array_elements(r->'entidades') x where x->>'tipo' = 'church';
  if c->>'cnpj' <> '00000000000191' or c->>'nome' <> 'Razao Nova' or c->>'im' <> 'IM-9' or c->'endereco'->>'uf' <> 'SP' then raise exception 'FALHOU T5: %', c; end if;
  select x into c from jsonb_array_elements(r->'entidades') x where x->>'tipo' = 'institute';
  if c->>'cnpj' <> '69620351000100' then raise exception 'FALHOU T5 inst: %', c; end if;
  v_res := v_res || 'T5 ok; ';

  -- T6
  begin set local role authenticated;
    r := app.v39_inst_identity_save(v_ch, jsonb_build_object('nome', 'ISPA Novo', 'razaoSocial', 'Inst Nova', 'cnpj', '69.620.351/0001-00', 'responsavel', 'Outro',
           'cidade', 'Araraquara', 'cep', '14800-000', 'rua', 'Rua C', 'numero', '5'));
    reset role;
  exception when others then reset role; raise exception 'FALHOU T6: % %', sqlstate, sqlerrm; end;
  select to_jsonb(e) into c from app.v39_fin_entities e where e.id = v_ei;
  if c->>'legal_name' <> 'Inst Nova' or c->>'cnpj' <> '69620351000100' or c->>'responsible_name' <> 'Outro' or c->'address'->>'cidade' <> 'Araraquara' or c->'address'->>'uf' <> 'SP' then
    raise exception 'FALHOU T6 entidade: %', c; end if;
  if r->'identidade'->>'nome' <> 'ISPA Novo' or r->'identidade'->>'razaoSocial' <> 'Inst Nova' or r->'identidade'->>'cidade' <> 'Araraquara' or (r->'identidade'->>'entidadeId')::uuid <> v_ei then
    raise exception 'FALHOU T6 json: %', r; end if;
  if (select display_name from app.v39_inst_identity where church_id = v_ch) <> 'ISPA Novo' then raise exception 'FALHOU T6 nome'; end if;
  if not exists (select 1 from app.v39_fin_entity_log where entity_id = v_ei and action = 'inst_identity_save') then raise exception 'FALHOU T6 log'; end if;
  v_res := v_res || 'T6 ok; ';

  -- T7
  perform set_config('request.jwt.claims', json_build_object('sub', v_au_d, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_au_d::text, true);
  begin set local role authenticated; perform app.v39_config_save(v_ch, p); reset role; raise exception 'FALHOU T7a';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'PERMISSION_DENIED' then raise exception 'FALHOU T7a: %', sqlerrm; end if; end;
  begin set local role authenticated; perform app.v39_inst_identity_save(v_ch, jsonb_build_object('nome', 'Hack')); reset role; raise exception 'FALHOU T7b';
  exception when others then reset role; if sqlerrm like 'FALHOU%' then raise; end if; if sqlerrm <> 'PERMISSION_DENIED' then raise exception 'FALHOU T7b: %', sqlerrm; end if; end;
  v_res := v_res || 'T7 ok; ';

  -- T8 REVERTER (identico ao _reverter, sem begin/commit)

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


  select jsonb_object_agg(f, md5(regexp_replace(p2.prosrc, '\s+', '', 'g'))) into v_depois
    from unnest(v_fns) f join pg_proc p2 on p2.oid = f::regprocedure;
  if v_depois <> v_antes then raise exception 'FALHOU T8: corpo diferente % vs %', v_depois, v_antes; end if;
  if to_regprocedure('private.v39_inst_entity_id(uuid)') is not null then raise exception 'FALHOU T8: helper ficou'; end if;
  v_res := v_res || 'T8 ok (REVERTER ok)';

  raise exception 'TESTE CAD_1 CONCLUIDO (nada foi gravado): %', v_res;
end $t$;
