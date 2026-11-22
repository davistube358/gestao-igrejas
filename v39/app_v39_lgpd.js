/* 2Gather v39 · LGPD e Auditoria (Build 63) · LGPD-1
   Carregar DEPOIS do app.js. Contrato: sql/B63_1_aceite_politica_aplicar.sql, B63_2_anonimizacao_aplicar.sql,
   B63_3_auditoria_aplicar.sql e a Edge Function "auth" (acoes politica, cadastro com politicaV e anonimizarConta).
   - Mapeia em G2_V39.p1: aceitarPolitica, publicarPolitica, anonimizarPessoa (mutacoes) e auditoria (leitura).
   - Oferece ao app.js: politica() (texto vigente), status() (situacao do aceite) e versaoPublica() (cadastro).
   - DEGRADACAO: o banco pode ainda nao ter as RPCs novas (ordem: banco -> Edge -> front). Se a RPC nao existe
     (PGRST202 / 42883 / 404), devolve null para o app.js manter o comportamento antigo e registra um aviso no
     Console. Nunca trava o login nem quebra a tela.
   - Correcoes do QA-63 (ainda LGPD-1, nao publicado): QA63-04 (V39_LGPD_SEM_VERSAO), QA63-05 (pedido recusado
     quando a regra impede aprovar) e QA63-07 (texto do 400). Pessoa anonimizada/restringida: sql/B63_5_*.
   Nao guarda dados pessoais: so versao da politica e situacao do aceite do proprio usuario (em memoria). */
(function () {
  'use strict';
  var VERSAO = 'LGPD-1';
  if (window.G2_LGPD) return;
  console.info('[2Gather] lgpd ' + VERSAO);

  var ACOES = { aceitarPolitica: 1, publicarPolitica: 1, anonimizarPessoa: 1 };
  var LEITURAS = { auditoria: 1 };
  var avisados = {};

  function G() { return window.__gc || null; }
  function cfg() { var g = G(); return (g && g.cfg()) || {}; }
  function v39() { return cfg().token === 'supabase-v39'; }
  function igrejaId() { return (cfg().usuario || {}).igrejaId || ''; }
  function logado() { return v39() && !!igrejaId(); }
  function sb() { var C = window.V39_CONFIG || window.APP_CONFIG || {}; return { url: String(C.supabaseUrl || '').replace(/\/$/, ''), key: C.supabaseAnonKey || '' }; }
  function cliente() {
    var V = window.G2_V39 || {};
    var pr = (!V.client && typeof V.init === 'function') ? Promise.resolve(V.init()) : Promise.resolve();
    return pr.then(function () { if (!V.client) throw new Error('Sem conexão com o servidor.'); return V.client; });
  }
  function rpc(nome, args) {
    return cliente().then(function (c) {
      var b = c.schema('app'); return (b.__rpcOriginal || b.rpc).call(b, nome, args || {});
    }).then(function (r) { if (r.error) throw r.error; return r.data; });
  }

  /* ---------- erros ---------- */
  function texto(e) { return String((e && (e.message || e.details || e.code)) || e || ''); }
  function ausente(e) {
    var c = e && e.code, t = texto(e);
    return c === 'PGRST202' || c === '42883' || (e && (e.status === 404 || e.codigo === 'RPC_MISSING')) || /could not find the function|function .* does not exist|RPC_MISSING/i.test(t);
  }
  function codigo(e) {
    if (!e) return '';
    if (e.code === 'P0001') return String(e.message || '').trim();
    var m = /\b([A-Z][A-Z0-9_]{5,})\b/.exec(texto(e)); return m ? m[1] : String(e.code || '');
  }
  function avisar(chave, e) {
    if (avisados[chave]) return; avisados[chave] = 1;
    console.warn('[2Gather][lgpd] ' + chave + ': função nova ainda não existe no banco; mantendo o comportamento anterior.', e && (e.code || e.message));
  }
  var MSG = {
    ACCESS_DENIED: 'Sem acesso ativo a esta igreja.',
    PERMISSION_DENIED: 'Você não tem permissão para esta ação.',
    PERSON_NOT_LINKED: 'Seu usuário não está ligado a um cadastro de pessoa. Fale com a liderança.',
    PRIVACY_POLICY_MISSING: 'Ainda não há política de privacidade publicada.',
    PRIVACY_VERSION_NOT_CURRENT: 'A política foi atualizada. Leia a versão atual e aceite de novo.',
    V39_LGPD_SEM_VERSAO: 'Não foi possível confirmar a versão da política agora. Tente de novo mais tarde.',
    PERSON_ANONYMIZED: 'Esta pessoa foi anonimizada (LGPD): o cadastro não pode ser alterado.',
    PERSON_RESTRICTED: 'Esta pessoa tem o tratamento restrito (LGPD): o cadastro não pode ser alterado.',
    PRIVACY_VERSION_EXISTS: 'Esta versão da política já foi publicada. Use outro número de versão.',
    PRIVACY_TEXT_REQUIRED: 'Informe a versão e o texto da política.',
    PRIVACY_VERSION_IMMUTABLE: 'Uma versão publicada não pode ser alterada.',
    REQUEST_NOT_FOUND: 'Pedido do titular não encontrado.',
    ANONYMIZATION_NOT_APPROVED: 'O pedido de anonimização precisa estar aprovado.',
    CONFIRMATION_REQUIRED: 'Confirmação inválida: digite ANONIMIZAR.',
    ANONYMIZATION_SELF_DENIED: 'Não é possível anonimizar o seu próprio cadastro.',
    ANONYMIZATION_MULTI_CHURCH: 'Esta pessoa também está ligada a outra igreja: a anonimização precisa de decisão conjunta. Nada foi alterado.',
    ANONYMIZATION_BLOCKED_HEALTH_RETENTION: 'Esta pessoa tem prontuário ou receita: a guarda legal impede anonimizar. Nada foi alterado.',
    HEALTH_MODE_INVALID: 'Modo de anonimização inválido.',
    DSR_ALREADY_OPEN: 'Já existe um pedido aberto deste tipo para esta pessoa.',
    DSR_ALREADY_DECIDED: 'Este pedido já foi decidido.',
    DSR_TYPE_INVALID: 'Tipo de pedido inválido.',
    DSR_DECISION_INVALID: 'Decisão inválida.',
    PERSON_NOT_IN_CHURCH: 'Esta pessoa não pertence a esta igreja.',
    REASON_REQUIRED: 'Informe o motivo.'
  };
  function erro(e, padrao, chave) {
    if (ausente(e)) {
      avisar(chave || 'rpc', e);
      var a = new Error(padrao + ' ainda não está ativado no servidor. Nada foi alterado.'); a.code = 'V39_LGPD_RPC_MISSING'; return a;
    }
    var c = codigo(e), x = new Error(MSG[c] || texto(e) || 'Não foi possível concluir agora. Tente novamente.');
    x.code = c || 'V39_LGPD_ERROR'; return x;
  }

  /* ---------- Edge "auth" ---------- */
  function edge(acao, dados, comSessao) {
    var s = sb();
    if (!s.url || !s.key) return Promise.reject(new Error('Configuração do servidor indisponível. Atualize a página.'));
    var tk = comSessao ? cliente().then(function (c) { return c.auth.getSession(); }).then(function (r) {
      var t = r && r.data && r.data.session && r.data.session.access_token; if (!t) throw new Error('Sessão expirada. Entre novamente.'); return t;
    }) : Promise.resolve(s.key);
    return tk.then(function (token) {
      var corpo = {}; for (var k in (dados || {})) corpo[k] = dados[k]; corpo.acao = acao;
      return fetch(s.url + '/functions/v1/auth', {
        method: 'POST', mode: 'cors', cache: 'no-store', credentials: 'omit',
        headers: { 'Content-Type': 'application/json', apikey: s.key, Authorization: 'Bearer ' + token },
        body: JSON.stringify(corpo)
      });
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = {}; try { j = t ? JSON.parse(t) : {}; } catch (e) {}
        j.__status = r.status; return j;
      });
    });
  }

  /* ---------- politica ---------- */
  var ultimaVersao = null, versaoPub = null;
  /** Texto vigente: logado -> v39_privacy_policy_current; deslogado -> Edge auth {acao:'politica'}.
      Devolve null quando a fonte nova ainda nao existe ou nao ha versao publicada (o app.js usa a fonte antiga). */
  function politica() {
    if (logado()) {
      return rpc('v39_privacy_policy_current', { p_church_id: igrejaId() }).then(function (r) {
        if (!r || !r.versao || !String(r.texto || '').trim()) { avisar('politica sem versão publicada', null); return null; }
        ultimaVersao = r.versao;
        return { ok: true, texto: r.texto, versao: r.versao, publicadaEm: r.publicadaEm || '', fonte: 'supabase' };
      }, function (e) { if (ausente(e)) { avisar('v39_privacy_policy_current', e); return null; } throw erro(e, 'A política'); });
    }
    return edge('politica', {}).then(function (j) {
      if (j.__status === 400 || j.em_preparacao || !j.versao || !String(j.texto || '').trim()) { avisar('Edge auth politica', { code: j.__status }); return null; }
      versaoPub = j.versao;
      return { ok: true, texto: j.texto, versao: j.versao, fonte: 'edge' };
    }, function (e) { console.warn('[2Gather][lgpd] política pela Edge indisponível', e); return null; });
  }
  /** Versao a enviar no cadastro (a exibida; se a pessoa nao abriu o texto, a vigente). null = Edge antiga ou sem politica. */
  function versaoPublica() {
    if (versaoPub) return Promise.resolve(versaoPub);
    return edge('politica', {}).then(function (j) { if (j && j.versao && !j.em_preparacao) versaoPub = j.versao; return versaoPub; }, function () { return null; });
  }
  function esquecerVersaoPublica() { versaoPub = null; }

  /* ---------- situacao do aceite (login) ---------- */
  /** {consent, consentEm, politicaV, versaoVigente} | null (RPC ausente / erro de rede: manter o atual).
      Erro de dominio do banco: fail-closed (consent=false), como na proposta. */
  function status() {
    if (!logado()) return Promise.resolve(null);
    return rpc('v39_privacy_my_status', { p_church_id: igrejaId() }).then(function (r) {
      return { consent: r ? r.consent : null, consentEm: (r && r.consentEm) || '', politicaV: (r && r.politicaV) || '', versaoVigente: (r && r.versaoVigente) || '' };
    }, function (e) {
      if (ausente(e)) { avisar('v39_privacy_my_status', e); return null; }
      if (e && e.code === 'P0001') { console.warn('[2Gather][lgpd] situação do aceite recusada pelo banco: ' + codigo(e)); return { consent: false, consentEm: '', politicaV: '', versaoVigente: '' }; }
      console.warn('[2Gather][lgpd] situação do aceite indisponível agora', e); return null;
    });
  }

  /* ---------- mutacoes ---------- */
  function aceitar(d) {
    var ver = (d && d.versao) || ultimaVersao;
    // QA63-04: texto exibido sem versão (veio da fonte antiga): código próprio; o app.js fecha o modal em vez de reabrir em laço
    if (!ver) return Promise.reject(Object.assign(new Error(MSG.V39_LGPD_SEM_VERSAO), { code: 'V39_LGPD_SEM_VERSAO' }));
    return rpc('v39_privacy_accept', { p_church_id: igrejaId(), p_version: ver }).then(function (r) {
      return { ok: true, consentEm: r.consentEm, politicaV: r.politicaV };
    }, function (e) { throw erro(e, 'O aceite da política', 'v39_privacy_accept'); });
  }
  function publicar(d) {
    var ver = String((d && d.versao) || '').trim(), txt = String((d && d.texto) || '');
    return rpc('v39_privacy_policy_publish', { p_church_id: igrejaId(), p_version: ver, p_text: txt }).then(function (r) {
      ultimaVersao = r.versao; return { ok: true, versao: r.versao };
    }, function (e) { throw erro(e, 'A publicação da política', 'v39_privacy_policy_publish'); });
  }

  /* anonimizacao: pedido -> decisao -> execucao (D5: o master faz os 3 passos num clique, cada um registrado) */
  var REGRA_BLOQUEIA = ['ANONYMIZATION_SELF_DENIED', 'ANONYMIZATION_MULTI_CHURCH'];
  var ABERTOS = ['received', 'identity_validation', 'under_review', 'waiting_information', 'approved', 'partially_approved'];
  function pedidoAberto(c, pid) {
    return rpc('v39_privacy_requests_list', { p_church_id: c, p_status: null }).then(function (l) {
      return (l || []).filter(function (x) { return x && x.pessoaId === pid && x.tipo === 'anonymization' && ABERTOS.indexOf(x.status) >= 0; })[0] || null;
    });
  }
  function obterPedidoAprovado(c, pid, pedidoId) {
    if (pedidoId) return Promise.resolve({ id: pedidoId, status: 'approved' });
    return rpc('v39_privacy_request_create', { p_church_id: c, p_person_id: pid, p_type: 'anonymization',
      p_reason: 'Pedido do titular: exclusão dos dados (registrado no app)' }).then(function (r) {
      return { id: r.pedidoId, status: r.status };
    }, function (e) {
      if (codigo(e) !== 'DSR_ALREADY_OPEN') throw e;
      return pedidoAberto(c, pid).then(function (p) { if (!p) throw e; return p; });
    }).then(function (p) {
      if (p.status === 'approved') return p;
      return rpc('v39_privacy_request_decide', { p_church_id: c, p_request_id: p.id, p_decision: 'approved',
        p_reason: 'Aprovado pelo master no app (anonimização em um clique)' }).then(function () { return { id: p.id, status: 'approved' }; }, function (e) {
        // QA63-05: o banco (B63_2) recusa aprovar quando a regra impede executar; o pedido é recusado com o motivo e não fica aberto
        var cod = codigo(e);
        if (REGRA_BLOQUEIA.indexOf(cod) < 0) throw e;
        return rpc('v39_privacy_request_decide', { p_church_id: c, p_request_id: p.id, p_decision: 'rejected', p_reason: 'Bloqueado pela regra: ' + cod })
          .then(function () { throw e; }, function (e2) { console.warn('[2Gather][lgpd] pedido ' + p.id + ' não pôde ser recusado', e2); throw e; });
      });
    });
  }
  function pessoaLegada(id, r) {
    var g = G(), d = g && g.db(), antes = ((d && d.pessoas) || []).filter(function (x) { return x.id === id; })[0] || {}, o = {}, k;
    for (k in antes) o[k] = antes[k];
    var limpar = { apelido: '', fone: '', nasc: '', sexo: '', cep: '', endereco: '', numero: '', complemento: '', bairro: '', obs: '', cpf: '', email: '',
      foto: '', fotoV: '', fotoPath: '', temFoto: false, responsavel: '' };
    for (k in limpar) o[k] = limpar[k];
    o.id = id; o.nome = (r.pessoa && r.pessoa.nome) || 'Pessoa anonimizada'; o.anonimizadoEm = new Date().toISOString(); o.updatedAt = o.anonimizadoEm;
    return o;   // cidade fica (D6); presencas, totais e financeiro nao sao tocados
  }
  /** Edge auth "anonimizarConta": bane/revoga a conta Auth, troca o e-mail e apaga a foto. Idempotente: pode repetir. */
  function desligarConta(pedidoId) {
    return edge('anonimizarConta', { igrejaId: igrejaId(), pedidoId: pedidoId }, true).then(function (j) {
      if (j.__status === 200 && j.ok) return { ok: true, conta: j };
      console.warn('[2Gather][lgpd] anonimizarConta não concluída (pedido ' + pedidoId + ')', j.__status, j.erro || '');
      // QA63-07: a Edge nova também responde 400 (igreja/pedido inválido) com "erro"; 400 sem texto = Edge antiga, sem a ação
      return { ok: false, aviso: j.erro ? j.erro + ' O acesso ao app e a foto não foram desligados por completo.'
        : j.__status === 400 ? 'A Edge "auth" ainda não tem a ação anonimizarConta: o acesso ao app e a foto ainda não foram desligados.'
        : 'O acesso ao app e a foto não foram desligados por completo.' };
    }, function (e) {
      console.warn('[2Gather][lgpd] anonimizarConta falhou (pedido ' + pedidoId + ')', e);
      return { ok: false, aviso: 'Os dados no banco já foram tratados, mas não foi possível desligar o acesso ao app e a foto agora.' };
    });
  }
  function anonimizar(d) {
    d = d || {};
    var c = igrejaId(), pid = String(d.id || ''), modo = d.modoSaude === 'restrict' ? 'restrict' : 'block', pedido = null;
    if (!/^[0-9a-f-]{36}$/i.test(pid)) return Promise.reject(new Error('Cadastro ainda não enviado ao servidor.'));
    return obterPedidoAprovado(c, pid, d.pedidoId).then(function (p) {
      pedido = p.id;
      return rpc('v39_privacy_anonymize_execute', { p_church_id: c, p_request_id: pedido, p_confirm: String(d.confirmacao || ''), p_health_mode: modo });
    }).then(function (r) {
      var res = { ok: true, resultado: r.resultado, pedidoId: pedido, authUsersParaDesativar: r.authUsersParaDesativar || [] };
      if (r.resultado === 'anonimizado') res.pessoa = pessoaLegada(pid, r);
      var precisaEdge = r.resultado === 'anonimizado' || (r.authUsersParaDesativar || []).length > 0;
      if (!precisaEdge) return res;
      return desligarConta(pedido).then(function (z) { if (z.ok) res.conta = z.conta; else res.avisoConta = z.aviso; return res; });
    }, function (e) {
      var x = erro(e, 'A anonimização', 'v39_privacy_*'); if (pedido) x.pedidoId = pedido; throw x;
    });
  }

  /* ---------- leitura: auditoria ---------- */
  function auditoria(d) {
    return rpc('v39_audit_list', { p_church_id: igrejaId(), p_filtro: String((d && d.filtro) || ''), p_limit: 500, p_offset: 0 }).then(function (r) {
      r = r || {};
      return { ok: true, total: +r.total || 0, itens: (r.itens || []).map(function (l) {
        return { usuario: l.usuario || '', acao: l.acao || '', detalhe: l.detalhe || '', data: l.data || '', fonte: l.fonte || '', categoria: l.categoria || '', resultado: l.resultado || '' };
      }), limite: r.limite, offset: r.offset, incluiSensiveis: !!r.incluiSensiveis };
    }, function (e) { throw erro(e, 'O registro de auditoria', 'v39_audit_list'); });
  }

  function executar(a, d) {
    if (a === 'aceitarPolitica') return aceitar(d);
    if (a === 'publicarPolitica') return publicar(d);
    return anonimizar(d);
  }
  function instalar() {
    var V = window.G2_V39, P = V && V.p1;
    if (!P || typeof P.isMutation !== 'function' || typeof P.isRead !== 'function' || typeof P.execute !== 'function' || typeof P.read !== 'function') return false;
    if (P.__g2lgpd) return true;
    var isM = P.isMutation, isR = P.isRead, ex = P.execute, rd = P.read;
    P.isMutation = function (a) { return ACOES[a] ? true : isM.apply(P, arguments); };
    P.isRead = function (a) { return LEITURAS[a] ? true : isR.apply(P, arguments); };
    P.execute = function (a, d) { return ACOES[a] && v39() ? Promise.resolve().then(function () { return executar(a, d); }) : ex.apply(P, arguments); };
    P.read = function (a, d) { return LEITURAS[a] && v39() ? Promise.resolve().then(function () { return auditoria(d); }) : rd.apply(P, arguments); };
    P.__g2lgpd = VERSAO;
    return true;
  }
  if (!instalar()) { var n = 0, t = setInterval(function () { if (instalar() || ++n > 240) clearInterval(t); }, 250); }

  window.G2_LGPD = { versao: VERSAO, politica: politica, status: status, versaoPublica: versaoPublica, esquecerVersaoPublica: esquecerVersaoPublica, desligarConta: desligarConta,
    _ausente: ausente };
})();
