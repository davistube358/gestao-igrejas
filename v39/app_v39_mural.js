/* 2Gather v39 · Mural (recados e pedidos de oração) no Supabase · MURAL-1
   Carregar DEPOIS do app.js e de app_v39_setores.js. Não altera o app.js. Requer v39_mural.sql.
   - As ações muralPostar, muralApagar e muralOrar deixam de cair em "Ação v39 não mapeada" e vão para o Supabase.
   - O mural é carregado em toda sincronização (hydrate) e a cada 2 min com o app aberto.
   - A tela do mural (blocoMural) e o contador de novidades do app.js continuam os mesmos. */
(function () {
  'use strict';
  var VERSAO = 'MURAL-1';
  if (window.G2_MURAL) return;
  window.G2_MURAL = VERSAO;
  console.info('[2Gather] mural ' + VERSAO);

  var ACOES = { muralPostar: 1, muralApagar: 1, muralOrar: 1 };
  function G() { return window.__gc || null; }
  function cfg() { var g = G(); return (g && g.cfg()) || {}; }
  function db() { var g = G(); return g ? g.db() : null; }
  function v39() { return cfg().token === 'supabase-v39'; }
  function igrejaId() { return (cfg().usuario || {}).igrejaId; }
  function rpc(nome, args) {
    var V = window.G2_V39 || {};
    var pr = (!V.client && typeof V.init === 'function') ? Promise.resolve(V.init()) : Promise.resolve();
    return pr.then(function () {
      if (!V.client) throw new Error('Sem conexão com o servidor.');
      var b = V.client.schema('app'); return (b.__rpcOriginal || b.rpc).call(b, nome, args || {});
    }).then(function (r) { if (r.error) throw r.error; return r.data; });
  }
  var MSG = { MURAL_TEXT_REQUIRED: 'Escreva a mensagem.', MURAL_NOT_FOUND: 'Esta mensagem não está mais no mural. Atualize a página.',
    PERMISSION_DENIED: 'Só o autor, o pastor ou o master podem apagar esta mensagem.' };
  function erro(e) {
    var t = String((e && (e.details || e.message || e.code)) || e || '');
    for (var k in MSG) if (t.indexOf(k) >= 0) return new Error(MSG[k]);
    if (/PGRST202|find the function/i.test(t)) return new Error('Mural ainda não ativado: rode o v39_mural.sql no Supabase.');
    return new Error('Não foi possível atualizar o mural. Tente novamente.');
  }
  function guardar(l) { var d = db(); if (d && Array.isArray(l)) d.mural = l; return l; }

  function carregar() {
    if (!v39() || !igrejaId()) return Promise.resolve();
    return rpc('v39_mural_list', { p_church_id: igrejaId() }).then(guardar)
      .catch(function (e) { console.warn('[2Gather][mural] ' + erro(e).message, e); });
  }
  function executar(acao, dados) {
    dados = dados || {};
    var c = igrejaId();
    var p = acao === 'muralPostar' ? rpc('v39_mural_post', { p_church_id: c, p_tipo: dados.tipo === 'oracao' ? 'oracao' : 'recado', p_texto: dados.texto || '' })
      : acao === 'muralApagar' ? rpc('v39_mural_delete', { p_church_id: c, p_id: String(dados.id || ''), p_reason: 'Apagado no mural' })
      : rpc('v39_mural_pray', { p_church_id: c, p_id: String(dados.id || '') });
    return p.then(function (l) { return { ok: true, mural: guardar(l) || [] }; }, function (e) { throw erro(e); });
  }

  function instalar() {
    var V = window.G2_V39; if (!V || !V.p1 || !V.p13) return false;
    if (!V.p1.__g2mural) {
      var isM = V.p1.isMutation, ex = V.p1.execute;
      V.p1.isMutation = function (a) { return ACOES[a] ? true : isM.apply(V.p1, arguments); };
      V.p1.execute = function (a, d) { return ACOES[a] && v39() ? executar(a, d) : ex.apply(V.p1, arguments); };
      V.p1.__g2mural = true;
    }
    if (typeof V.p13.hydrate === 'function' && !V.p13.__g2mural) {
      var h = V.p13.hydrate;
      V.p13.hydrate = function () {
        var a = arguments;
        return Promise.all([h.apply(V.p13, a), carregar()]).then(function (r) { return r[0]; });
      };
      V.p13.__g2mural = true;
    }
    return true;
  }
  var n = 0, t = setInterval(function () { if (instalar() || ++n > 240) clearInterval(t); }, 250);

  // novidades com o app aberto (sem redesenhar enquanto a pessoa digita no mural)
  setInterval(function () {
    if (document.hidden || !v39()) return;
    var antes = JSON.stringify((db() || {}).mural || []);
    carregar().then(function () {
      var el = document.activeElement, digitando = el && el.id === 'mural-txt' && el.value;
      if (!digitando && antes !== JSON.stringify((db() || {}).mural || []) && G()) G().render();
    });
  }, 120000);
})();
