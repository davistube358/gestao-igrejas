/* 2Gather v39 · Instituto · INST-2 (Mercado Solidário)
   Carregar DEPOIS do app.js e dos demais módulos v39 (antes do app_v39_popups.js). Não altera o app.js.
   Requer no Supabase: INST_S1_seguranca.sql e INST_S2_mercado_v2.sql.
   INST-2: as leituras (estDados, estPessoaResumo, instBuscarPessoa) passam por G2_V39.p1.read, que o app.js usa para ações de leitura.
           O INST-1 só ligava execute e as leituras continuavam caindo em "não mapeada".
   Liga ao banco as ações que o app.js já usa no Mercado Solidário: estDados, estSalvarProduto, estEntrada, estBaixa, estEstornar,
   estPessoaResumo, estSaida (tipo "mercado") e instBuscarPessoa. Farmácia (tipo "farmacia" e estReceita): ainda não migrada — aviso claro.
   Diagnóstico no Console: G2_INST.versao · G2_INST.acoes() */
(function () {
  'use strict';
  var VERSAO = 'INST-2';
  if (window.G2_INST) return;
  var M = window.G2_INST = { versao: VERSAO };
  console.info('[2Gather] instituto ' + VERSAO);

  function G() { return window.__gc || null; }
  function cfg() { var g = G(); try { return (g && g.cfg && g.cfg()) || {}; } catch (e) { return {}; } }
  function uuid(x) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(x || '')); }
  function igrejaId() {
    var u = cfg().usuario || {}; if (uuid(u.igrejaId)) return u.igrejaId;
    var V = window.G2_V39 || {}, st = (V.runtime && V.runtime.state) || {};
    return uuid(st.churchId) ? st.churchId : null;
  }
  function cliente() {
    var V = window.G2_V39 || {};
    var pr = (!V.client && typeof V.init === 'function') ? Promise.resolve(V.init()) : Promise.resolve();
    return pr.then(function () { if (!V.client) throw new Error('Sem conexão com o servidor.'); return V.client; });
  }
  function rpc(nome, args) {
    return cliente().then(function (c) { var b = c.schema('app'); return (b.__rpcOriginal || b.rpc).call(b, nome, args || {}); })
      .then(function (r) { if (r.error) throw r.error; return r.data; });
  }

  var MSG = {
    PERMISSION_DENIED: 'Você não tem permissão para esta ação no Mercado Solidário. Peça o acesso à coordenação.',
    EST_NOT_MIGRATED: 'A Farmácia Solidária ainda está sendo migrada para o v39 (próxima etapa).',
    PRODUCT_NAME_REQUIRED: 'Informe o nome do produto.', PRODUCT_NOT_FOUND: 'Produto não encontrado ou inativo. Atualize a tela.',
    LIMIT_DAYS_INVALID: 'O período do limite deve ser de 1 a 365 dias.', LIMIT_QTY_INVALID: 'Limite inválido.',
    QUANTITY_MUST_BE_POSITIVE: 'Informe a quantidade.', INVALID_DELIVERY_QUANTITY: 'Quantidade inválida.',
    REASON_REQUIRED: 'Informe o motivo.', LOT_NOT_FOUND: 'Lote não encontrado. Atualize a tela.',
    STOCK_INSUFFICIENT: 'Saldo insuficiente.', STOCK_ALREADY_USED: 'Parte desta entrada já foi entregue: estorne antes as entregas ou faça uma baixa.',
    PERSON_NOT_FOUND: 'Pessoa não encontrada nesta igreja.', DELIVERY_ITEMS_REQUIRED: 'Inclua ao menos um item.',
    LIMIT_EXCEEDED: 'Limite por pessoa excedido: peça a autorização da coordenação.',
    LIMIT_EXCEPTION_REASON: 'Informe a justificativa da exceção (mín. 5 letras).',
    DELIVERY_NOT_FOUND: 'Entrega não encontrada. Atualize a tela.', DELIVERY_NOT_COMPLETED: 'Somente entrega concluída pode ser estornada.',
    MOVEMENT_NOT_FOUND: 'Lançamento não encontrado. Atualize a tela.', ALREADY_REVERSED: 'Este lançamento já foi estornado.'
  };
  function traduz(e) {
    var t = String((e && (e.message || e.code)) || e || ''), det = (e && e.details) || '';
    for (var k in MSG) if (t === k || t.indexOf(k) === 0) {
      if (k === 'STOCK_INSUFFICIENT') { try { var j = JSON.parse(det); if (j && j.message) return 'Saldo insuficiente: ' + j.message.replace(/^Saldo insuficiente de /, '') + '.'; } catch (x) { /* sem detalhe */ } }
      return MSG[k];
    }
    if (/PGRST202|find the function|does not exist/i.test(t)) return 'O servidor ainda não tem esta função. Rode o INST_S2_mercado_v2.sql no Supabase.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(t)) return 'Sem conexão. Tente novamente.';
    if (/JWT|401/i.test(t)) return 'Sua sessão expirou. Entre de novo.';
    try { var d = JSON.parse(det); if (d && d.message) return d.message; } catch (x) { /* sem detalhe */ }
    return 'Não foi possível concluir. Tente novamente.';
  }
  function erro(e) { console.warn('[2Gather][instituto]', e); return new Error(traduz(e)); }
  function ehMercado(d) { return String((d && d.tipo) || 'mercado') === 'mercado'; }
  function naoMigrado() { return Promise.reject(new Error(MSG.EST_NOT_MIGRATED)); }
  function chamarRpc(nome, args) {
    var ig = igrejaId(); if (!ig) return Promise.reject(new Error('Igreja não identificada. Atualize a página.'));
    args.p_church_id = ig; return rpc(nome, args).catch(function (e) { throw erro(e); });
  }
  function limpo(d) { var o = {}; for (var k in d) if (d[k] !== undefined && typeof d[k] !== 'function') o[k] = d[k]; return o; }

  var LEITURA = { estDados: 1, estPessoaResumo: 1, instBuscarPessoa: 1, estReceita: 1 };
  var ACOES = {
    estDados: function (d) { return ehMercado(d) ? chamarRpc('v39_est_dados', { p_tipo: 'mercado' }) : naoMigrado(); },
    estSalvarProduto: function (d) { return ehMercado(d) ? chamarRpc('v39_est_save_product', { p: limpo(d) }) : naoMigrado(); },
    estEntrada: function (d) { return ehMercado(d) ? chamarRpc('v39_est_entry', { p: limpo(d) }) : naoMigrado(); },
    estBaixa: function (d) { return ehMercado(d) ? chamarRpc('v39_est_writeoff', { p: limpo(d) }) : naoMigrado(); },
    estEstornar: function (d) { return ehMercado(d) ? chamarRpc('v39_est_reverse', { p: limpo(d) }) : naoMigrado(); },
    estPessoaResumo: function (d) { return ehMercado(d) ? chamarRpc('v39_est_person_summary', { p: limpo(d) }) : naoMigrado(); },
    estSaida: function (d) {
      if (!ehMercado(d)) return naoMigrado();
      var p = limpo(d); delete p.receita;                                       // receita é só da Farmácia
      p.itens = (d.itens || []).map(function (i) { return { produtoId: i.produtoId, qtd: i.qtd }; });
      return chamarRpc('v39_est_delivery', { p: p });
    },
    estReceita: function () { return naoMigrado(); },
    instBuscarPessoa: function (d) { return chamarRpc('v39_inst_people_search', { p_q: String((d && d.q) || '') }); }
  };
  M.acoes = function () { return Object.keys(ACOES); };
  M._ACOES = ACOES; M._traduz = traduz;

  function instalar() {
    var V = window.G2_V39; if (!V || !V.p1) return false;
    var P = V.p1; if (P.__inst) return true;
    if (typeof P.isMutation !== 'function' || typeof P.isRead !== 'function') return false;
    var isM = P.isMutation, isR = P.isRead, ex = P.execute, rd = P.read;
    P.isMutation = function (a) { return ACOES[a] ? !LEITURA[a] : isM.apply(P, arguments); };
    P.isRead = function (a) { return ACOES[a] ? !!LEITURA[a] : isR.apply(P, arguments); };
    P.execute = function (a, d) { return ACOES[a] ? ACOES[a](d || {}) : (typeof ex === 'function' ? ex.apply(P, arguments) : Promise.reject(new Error('Acao v39 nao mapeada: ' + a))); };
    P.read = function (a, d) { return ACOES[a] ? ACOES[a](d || {}) : (typeof rd === 'function' ? rd.apply(P, arguments) : Promise.reject(new Error('Acao v39 nao mapeada: ' + a))); };
    P.__inst = true;
    // o app pode ter aberto direto no Mercado antes deste módulo: recarrega o estoque já pelo banco
    try { var g = window.__gc; if (g && typeof g.estRecarregar === 'function') g.estRecarregar(); } catch (e) { console.warn('[2Gather][instituto]', e); }
    return true;
  }
  var tent = 0, tm = setInterval(function () { if (instalar() || ++tent > 240) clearInterval(tm); }, 250);
  instalar();
})();
