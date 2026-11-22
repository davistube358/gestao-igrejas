-- =====================================================================
-- B63_4 · LGPD · Base legal, finalidades e retencao · SEED · TESTE COM ROLLBACK
-- Build 63 · DATA-63b · decisao do PO D14 (aceita como PROPOSTA; prazos pendentes de validacao juridica)
-- ULTIMA EXECUCAO (22/11/2026, via MCP execute_sql, projeto kybrwsxvdbwjtwakczyj):
--   ERROR P0001: TESTE B63_4 CONCLUIDO (nada foi gravado): 7 bases legais, 11 finalidades globais e
--   11 politicas de retencao inseridas sem conflito (finalidades por igreja intactas: 4)
-- ---------------------------------------------------------------------
-- >>> NAO HA _aplicar PARA ESTE ITEM. Todos os prazos e bases estao marcados [VALIDAR JURIDICO]. <<<
-- Objetivo: provar que o seed proposto cabe nas tabelas existentes (app.legal_bases vazia,
--   app.processing_purposes, app.retention_policies vazia), com registros GLOBAIS (church_id null),
--   sem colidir com as finalidades por igreja ja existentes (church_care, institute_social).
-- Nao e base juridica: textos e prazos sao sugestao tecnica para revisao do encarregado/juridico.
-- NAO GRAVA NADA: termina em raise exception.
-- =====================================================================
do $t$
declare v_n int; v_res text;
begin
  -- bases legais (LGPD) [VALIDAR JURIDICO]
  insert into app.legal_bases (code, name, description, requires_consent) values
    ('lgpd_7_i_consent',    'Consentimento (art. 7, I)', 'Consentimento do titular', true),
    ('lgpd_7_ii_legal',     'Obrigacao legal (art. 7, II)', 'Cumprimento de obrigacao legal ou regulatoria', false),
    ('lgpd_7_ix_legit',     'Legitimo interesse (art. 7, IX)', 'Legitimo interesse do controlador', false),
    ('lgpd_11_i_consent',   'Consentimento especifico (art. 11, I)', 'Dado pessoal sensivel, consentimento especifico e destacado', true),
    ('lgpd_11_ii_a_legal',  'Obrigacao legal - sensivel (art. 11, II, a)', 'Dado sensivel para cumprimento de obrigacao legal', false),
    ('lgpd_11_ii_f_health', 'Tutela da saude (art. 11, II, f)', 'Procedimento por profissional de saude ou servico de saude', false),
    ('lgpd_14_minor',       'Criancas e adolescentes (art. 14)', 'Consentimento especifico de pelo menos um dos pais ou responsavel', true);

  -- finalidades globais [VALIDAR JURIDICO]
  insert into app.processing_purposes (church_id, code, name, description, legal_basis_id, requires_consent, is_system, is_active, valid_from)
  select null, x.code, x.name, x.descr, (select id from app.legal_bases where code = x.base), x.cons, true, true, current_date
    from (values
      ('church_care',         'Cadastro e cuidado pela igreja',  'Cadastro, GC, presencas e cuidado pastoral (conviccao religiosa e dado sensivel, art. 5, II)', 'lgpd_11_i_consent', true),
      ('privacy_policy',      'Politica de Privacidade',         'Aceite da politica de privacidade do 2Gather', 'lgpd_7_i_consent', true),
      ('institute_social',    'Atendimento social do Instituto', 'Mercado Solidario, cursos e assistencia', 'lgpd_11_i_consent', true),
      ('health_care',         'Atendimento de saude',            'Prontuario e atendimento por profissional de saude', 'lgpd_11_ii_f_health', false),
      ('pharmacy',            'Farmacia Solidaria',              'Receitas e entregas de medicamentos', 'lgpd_11_ii_f_health', false),
      ('financial_donations', 'Financeiro e doacoes',            'Dizimos, ofertas, doacoes e compromissos', 'lgpd_7_ii_legal', false),
      ('access_security',     'Seguranca e auditoria de acesso', 'Logins, trilhas de auditoria e acessos sensiveis', 'lgpd_7_ii_legal', false),
      ('minors',              'Dados de criancas e adolescentes','Tratamento de dados de menores', 'lgpd_14_minor', true),
      ('communication',       'Comunicacao com o titular',       'WhatsApp e mensagens da igreja', 'lgpd_7_i_consent', true),
      ('image',               'Imagem (foto)',                   'Foto da pessoa no cadastro', 'lgpd_7_i_consent', true),
      ('visitor',             'Visitantes',                      'Visitante ainda nao integrado', 'lgpd_7_ix_legit', false)
    ) as x(code, name, descr, base, cons);

  -- retencao global [VALIDAR JURIDICO] (dias; null = enquanto durar a finalidade)
  insert into app.retention_policies (church_id, code, name, description, purpose_id, data_category_id, retention_days, retention_basis, disposition_action, requires_manual_approval)
  select null, 'ret_' || x.purpose, 'Retencao: ' || x.purpose, x.descr,
         (select id from app.processing_purposes where church_id is null and code = x.purpose),
         (select id from app.data_categories where code = x.cat), x.days, x.basis, x.action, true
    from (values
      ('church_care',         'church_relationship', 730,  'Vinculo encerrado + 2 anos sem atividade [VALIDAR JURIDICO]', 'anonymize', 'Cadastro e participacao'),
      ('privacy_policy',      'access_security',     1825, 'Enquanto a conta existir + 5 anos (prova do aceite) [VALIDAR JURIDICO]', 'retain', 'Aceites da politica'),
      ('institute_social',    'identity',            1825, '5 anos apos o ultimo atendimento [VALIDAR JURIDICO]', 'review', 'Atendimento social'),
      ('health_care',         'health',              7300, '20 anos: Lei 13.787/2018 art. 6 e Res. CFM 1.821/2007 [VALIDAR JURIDICO]', 'restrict', 'Prontuario'),
      ('pharmacy',            'health',              1825, '5 anos [VALIDAR JURIDICO - confirmar norma sanitaria aplicavel]', 'review', 'Receitas e entregas'),
      ('financial_donations', 'financial',           1825, '5 anos apos o exercicio (alternativa: 10 anos) [VALIDAR JURIDICO]', 'retain', 'Movimentos financeiros'),
      ('access_security',     'access_security',     730,  'Minimo 6 meses (Marco Civil art. 15); sugerido 2 anos [VALIDAR JURIDICO]', 'review', 'Logs e auditoria (imutaveis)'),
      ('minors',              'minor',               null, 'Igual a finalidade principal [VALIDAR JURIDICO]', 'review', 'Dados de menores'),
      ('communication',       'contact',             null, 'Enquanto houver consentimento [VALIDAR JURIDICO]', 'delete', 'Mensagens'),
      ('image',               'identity',            null, 'Enquanto houver vinculo [VALIDAR JURIDICO]', 'delete', 'Foto'),
      ('visitor',             'identity',            730,  '2 anos sem retorno [VALIDAR JURIDICO]', 'anonymize', 'Visitantes')
    ) as x(purpose, cat, days, basis, action, descr);

  select count(*) into v_n from app.legal_bases;
  if v_n < 7 then raise exception 'FALHOU S1: bases=%', v_n; end if;
  select count(*) into v_n from app.processing_purposes where church_id is null and legal_basis_id is not null;
  if v_n <> 11 then raise exception 'FALHOU S2: finalidades=%', v_n; end if;
  select count(*) into v_n from app.retention_policies where church_id is null and purpose_id is not null and data_category_id is not null and retention_basis like '%[VALIDAR JURIDICO%';
  if v_n <> 11 then raise exception 'FALHOU S3: retencao=%', v_n; end if;
  select count(*) into v_n from app.processing_purposes where church_id is not null and code in ('church_care', 'institute_social');
  v_res := '7 bases legais, 11 finalidades globais e 11 politicas de retencao inseridas sem conflito (finalidades por igreja intactas: ' || v_n || ')';
  raise exception 'TESTE B63_4 CONCLUIDO (nada foi gravado): %', v_res;
end
$t$;
