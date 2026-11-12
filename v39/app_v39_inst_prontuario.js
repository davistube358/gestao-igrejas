/* 2Gather v39 · Instituto · Prontuário · PRONT-2
   ARQUIVO NOVO (não altera nenhum arquivo existente). Carregar DEPOIS do app_v39_instituto.js (INST-7) e antes do app_v39_popups.js.
   Liga a tela de atendimento do app.js (SYNC-V39-19) ao banco (INST_S15 v2): consulta com queixa, anamnese, exame, avaliação, conduta, receita, comentários e retorno,
   cifrada no servidor. O prontuário do paciente reúne as consultas de todos os profissionais de saúde do Instituto (as marcadas como reservadas ficam só com o autor).
   Sem o INST_S15, a agenda continua funcionando e o atendimento só registra a presença.
   PRONT-2: documentos com a identidade do INSTITUTO (logo, CNPJ, endereço), registro profissional (CRM/CRP) na assinatura, tela "Pacientes e prontuários",
   registro de cada impressão e número da via (1ª, 2ª via da receita). Requer INST_S18 para as novidades; sem ele, o PRONT-1 continua funcionando.
   Diagnóstico no Console: G2_PRONT.versao */
(function () {
  'use strict';
  var VERSAO = 'PRONT-2';
  if (window.G2_PRONT) return;
  var K = window.G2_PRONT = { versao: VERSAO, v2: true };
  console.info('[2Gather] prontuário ' + VERSAO);

  function cfg() { try { return (window.__gc && window.__gc.cfg && window.__gc.cfg()) || {}; } catch (e) { return {}; } }
  function uuid(x) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(x || '')); }
  function igrejaId() {
    var u = cfg().usuario || {}; if (uuid(u.igrejaId)) return u.igrejaId;
    var V = window.G2_V39 || {}, st = (V.runtime && V.runtime.state) || {}; return uuid(st.churchId) ? st.churchId : null;
  }
  function cliente() {
    var V = window.G2_V39 || {};
    var pr = (!V.client && typeof V.init === 'function') ? Promise.resolve(V.init()) : Promise.resolve();
    return pr.then(function () { if (!V.client) throw new Error('Sem conexão com o servidor.'); return V.client; });
  }
  function rpc(nome, args) {
    var ig = igrejaId(); if (!ig) return Promise.reject(new Error('Igreja não identificada. Atualize a página.'));
    args = args || {}; args.p_church_id = ig;
    return cliente().then(function (c) { var b = c.schema('app'); return (b.__rpcOriginal || b.rpc).call(b, nome, args); })
      .then(function (r) { if (r.error) throw r.error; return r.data; });
  }
  var MSG = {
    PERMISSION_DENIED: 'O prontuário é só de profissionais de saúde que têm atendimento com este paciente.',
    APPOINTMENT_NOT_FOUND: 'Atendimento não encontrado. Atualize a tela.',
    APPOINTMENT_CLOSED: 'Este atendimento foi cancelado ou remarcado: não dá para registrar a consulta.',
    PERSON_NOT_FOUND: 'Atendimento sem paciente.',
    RECORD_TOO_LONG: 'Cada campo aceita até 6000 caracteres.',
    RETURN_DATE_INVALID: 'Data de retorno inválida.',
    INST_RECORD_KEY_MISSING: 'A chave de cifra do prontuário não foi encontrada no servidor. Avise o administrador.',
    IDENTITY_NAME_REQUIRED: 'Informe o nome do Instituto.', IDENTITY_TOO_LONG: 'Algum campo passou de 200 caracteres.',
    IDENTITY_CNPJ_INVALID: 'CNPJ inválido: informe os 14 números.', IDENTITY_LOGO_INVALID: 'Logo inválida ou muito grande. Use uma imagem PNG ou JPG menor.',
    REGISTRY_TOO_LONG: 'O registro aceita até 40 caracteres.', PROFESSIONAL_NOT_FOUND: 'Profissional não encontrado. Atualize a tela.',
    PRINT_TYPE_INVALID: 'Tipo de documento inválido.'
  };
  function detMsg(e) { try { var d = JSON.parse((e && e.details) || ''); return d && d.message ? String(d.message) : ''; } catch (x) { return ''; } }
  function traduz(e) {
    var t = String((e && (e.message || e.code)) || e || '');
    for (var k in MSG) if (t === k || t.indexOf(k) === 0) return MSG[k];
    if (/receita so pode ser impressa/i.test(t + ' ' + detMsg(e))) return 'A receita só pode ser impressa pelo profissional que fez o atendimento.';
    if (/Somente quem gerencia/i.test(t + ' ' + detMsg(e))) return 'Somente quem gerencia o Instituto altera estes dados.';
    if (/Voce nao tem atendimento|Somente profissionais/i.test(t + ' ' + detMsg(e))) return MSG.PERMISSION_DENIED;
    try { var I = window.G2_INST; if (I && typeof I._traduz === 'function') return I._traduz(e); } catch (x) { /* segue */ }
    return 'Não foi possível concluir. Tente novamente.';
  }
  function erro(e) { console.warn('[2Gather][prontuario]', e); return new Error(traduz(e)); }
  function semFuncao(e) { return /PGRST202|find the function|does not exist|schema cache/i.test(String((e && (e.message || e.code || e.details)) || e || '')); }

  var CAMPOS = ['queixa', 'anamnese', 'exame', 'avaliacao', 'conduta', 'receita', 'comentarios'];
  function acaoLer(d) {
    return rpc('v39_inst_record_list', { p_person: d.pessoaId }).then(function (r) {
      return { itens: (r && r.itens) || [], invalidos: (r && r.invalidos) || 0, clinico: !r || r.clinico !== false };
    }).catch(function (e) { if (semFuncao(e)) return { itens: [], semProntuario: true }; throw erro(e); });
  }
  function acaoGravar(d) {
    var temTexto = CAMPOS.concat(['retorno']).some(function (k) { return String(d[k] || '').trim(); });
    var p = { agendamentoId: d.agendamentoId, retorno: d.retorno || '', reservado: !!d.reservado };
    CAMPOS.forEach(function (k) { p[k] = d[k] || ''; });
    var grava = temTexto ? rpc('v39_inst_record_save', { p: p }).catch(function (e) {
      if (semFuncao(e)) throw new Error('As anotações do prontuário ainda não foram liberadas neste servidor (falta rodar o INST_S15).');
      throw erro(e);
    }) : Promise.resolve();
    return grava.then(function () {
      return d.marcarAtendido ? rpc('v39_inst_set_status', { p: { id: d.agendamentoId, status: 'completed' } }).catch(function (e) { throw erro(e); }) : null;
    }).then(function () { return { ok: true }; });
  }
  /* ── PRONT-2 ── */
  function acaoIdentidade() {
    return rpc('v39_inst_identity_get', {}).then(function (r) { return { identidade: (r && r.identidade) || null, edita: !!(r && r.edita) }; })
      .catch(function (e) { if (semFuncao(e)) return { identidade: null, edita: false, semSql: true }; throw erro(e); });
  }
  function acaoIdentidadeSalvar(d) {
    return rpc('v39_inst_identity_save', { p: d.identidade || {} }).then(function (r) { return { ok: true, identidade: (r && r.identidade) || null }; })
      .catch(function (e) { if (semFuncao(e)) throw new Error('Falta rodar o INST_S18 no Supabase para salvar os dados do Instituto.'); throw erro(e); });
  }
  function acaoCtxImpressao() {
    return rpc('v39_inst_print_context', {}).then(function (r) {
      return { identidade: (r && r.identidade) || null, meuProfissionalId: (r && r.meuProfissionalId) || '', registros: (r && r.registros) || {}, edita: !!(r && r.edita) };
    }).catch(function (e) { if (semFuncao(e)) return { identidade: null, meuProfissionalId: '', registros: {}, semSql: true }; throw erro(e); });
  }
  function acaoRegistroProf(d) {
    return rpc('v39_inst_prof_registry_set', { p_prof: d.profissionalId, p_registro: d.registro || '' }).then(function () { return { ok: true }; })
      .catch(function (e) { if (semFuncao(e)) throw new Error('Falta rodar o INST_S18 no Supabase para salvar o registro profissional.'); throw erro(e); });
  }
  function acaoPacientes(d) {
    return rpc('v39_inst_my_patients', { p_q: (d && d.q) || null }).then(function (r) { return { itens: (r && r.itens) || [] }; })
      .catch(function (e) { if (semFuncao(e)) return { itens: [], semSql: true }; throw erro(e); });
  }
  function acaoImpressaoLog(d) {
    return rpc('v39_inst_print_log', { p: { pessoaId: d.pessoaId, agendamentoId: d.agendamentoId || null, tipo: d.tipo } }).then(function (r) { return { via: Number((r && r.via) || 1) }; })
      .catch(function (e) { if (semFuncao(e)) return { via: 1, semLog: true }; throw erro(e); });
  }
  function instalar() {
    var I = window.G2_INST; if (!I || !I._ACOES) return false;
    var A = I._ACOES;
    A.instProntuarioDe = acaoLer; A.instRegistro = acaoGravar; A.instIdentidade = acaoIdentidade; A.instIdentidadeSalvar = acaoIdentidadeSalvar;
    A.instImpressaoCtx = acaoCtxImpressao; A.instRegistroProf = acaoRegistroProf; A.instPacientes = acaoPacientes; A.instImpressaoLog = acaoImpressaoLog;
    I._prontuarioVersao = VERSAO;
    return true;
  }
  var tent = 0, tm = setInterval(function () { if (instalar() || ++tent > 120) clearInterval(tm); }, 250);
  instalar();
  K._t = { acaoLer: acaoLer, acaoGravar: acaoGravar, acaoIdentidade: acaoIdentidade, acaoIdentidadeSalvar: acaoIdentidadeSalvar, acaoCtxImpressao: acaoCtxImpressao, acaoRegistroProf: acaoRegistroProf, acaoPacientes: acaoPacientes, acaoImpressaoLog: acaoImpressaoLog, traduz: traduz };
})();
