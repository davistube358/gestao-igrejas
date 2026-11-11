/* 2Gather v39 · Financeiro · FIN-ALL-14.1 · Entidades (Igreja e Instituto)
   14.1: corrige a tecla Esc (não deixa camada invisível na tela) e o fechamento das janelas.
   Arquivo NOVO. Carregar DEPOIS do app_v39_financeiro.js (FIN-ALL-13). Não altera o app.js nem o financeiro.
   Requer no Supabase: INST_S7_financeiro_entidades_v2.sql e INST_S9 (já aplicados e validados).
   - Livro financeiro › Cadastros ganha o bloco "Entidades": dados legais da Igreja (CNPJ, IE, IM, presidente, responsável,
     contato e endereço legal) e do Instituto (CNPJ próprio ou o da igreja).
     O CNPJ da Igreja é gravado também na tabela de igrejas (fonte única); o Instituto sem CNPJ usa o da igreja.
   - Ligar conta ao Instituto: só contas SEM lançamentos (o banco recusa as demais).
   Ainda não incluído: trocar a visão do Livro para o Instituto e a tela de convênios (próxima etapa, FIN-ALL-15).
   Diagnóstico no Console: G2_FIN_ENT.versao */
(function () {
  'use strict';
  var VERSAO = 'FIN-ALL-14.1';
  if (window.G2_FIN_ENT) return;
  var M = window.G2_FIN_ENT = { versao: VERSAO };
  console.info('[2Gather] financeiro entidades ' + VERSAO);

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cfg() { var g = window.__gc; try { return (g && g.cfg && g.cfg()) || {}; } catch (e) { return {}; } }
  function uuid(x) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(x || '')); }
  function igrejaId() {
    var V = window.G2_V39 || {};
    if (V.churchContext && typeof V.churchContext.ensure === 'function') { try { var c = V.churchContext.ensure(); if (uuid(c)) return c; } catch (e) { /* segue */ } }
    var u = cfg().usuario || {}; return uuid(u.igrejaId) ? u.igrejaId : null;
  }
  function rpc(nome, args) {
    var V = window.G2_V39 || {};
    var pr = (!V.client && typeof V.init === 'function') ? Promise.resolve(V.init()) : Promise.resolve();
    return pr.then(function () {
      if (!V.client) throw new Error('Sem conexão com o servidor.');
      var b = V.client.schema('app'); args = args || {}; args.p_church_id = igrejaId();
      return (b.__rpcOriginal || b.rpc).call(b, nome, args);
    }).then(function (r) { if (r.error) throw r.error; return r.data; });
  }
  var MSG = { PERMISSION_DENIED: 'Somente master, pastor ou quem gerencia contas altera as entidades.', FIN_NAME_REQUIRED: 'Informe a razão social (mín. 3 letras).',
    CNPJ_INVALID: 'CNPJ deve ter 14 dígitos.', FIN_NOT_FOUND: 'Registro não encontrado. Atualize a tela.',
    FIN_ACCOUNT_HAS_MOVEMENTS: 'Esta conta já tem lançamentos e não pode mudar de entidade. Abra uma conta nova no Instituto.' };
  function traduz(e) {
    var t = String((e && (e.message || e.code)) || e || '');
    for (var k in MSG) if (t.indexOf(k) === 0) return MSG[k];
    if (/PGRST202|find the function/i.test(t)) return 'O servidor ainda não tem esta função (rode o INST_S7 v2 e o S9).';
    if (/Failed to fetch|NetworkError/i.test(t)) return 'Sem conexão. Tente novamente.';
    return 'Não foi possível concluir. Tente novamente.';
  }
  function soDig(s) { return String(s || '').replace(/\D/g, ''); }
  function mascCnpj(t) {
    var d = soDig(t).slice(0, 14);
    return d.length > 12 ? d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-' + d.slice(12)
      : d.length > 8 ? d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8)
      : d.length > 5 ? d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5) : d.length > 2 ? d.slice(0, 2) + '.' + d.slice(2) : d;
  }
  function cnpjValido(c) {
    c = soDig(c); if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
    function dv(n) { var s = 0, p = n - 7; for (var i = 0; i < n; i++) { s += +c[i] * p--; if (p < 2) p = 9; } var r = s % 11; return r < 2 ? 0 : 11 - r; }
    return dv(12) === +c[12] && dv(13) === +c[13];
  }
  function T() { return (window.G2_FIN && window.G2_FIN._t) || null; }
  function podeEditar() {
    var t = T(), ctx = t && t.S && t.S.ctx; if (!ctx) return false;
    var p = (cfg().usuario || {}).papel;
    return !!ctx.master || p === 'pastor' || (ctx.perms || []).indexOf('financial.accounts.manage') >= 0;
  }

  var D = { lista: null, em: 0, carregando: false, erro: '' };
  function carregar(forcar) {
    if (D.carregando || (!forcar && D.lista && Date.now() - D.em < 60000)) return;
    D.carregando = true;
    rpc('v39_fin_entities_list', {}).then(function (r) { D.lista = (r && r.entidades) || []; D.erro = ''; })
      .catch(function (e) { console.warn('[2Gather][entidades]', e); D.erro = traduz(e); D.lista = D.lista || []; })
      .then(function () { D.carregando = false; D.em = Date.now(); var c = $('g2e-card'); if (c) c.remove(); pintar(); });
  }
  function endTexto(a) { a = a || {}; return [[a.rua, a.numero].filter(Boolean).join(', '), a.bairro, [a.cidade, a.uf].filter(Boolean).join('/'), a.cep].filter(Boolean).join(' · '); }
  function htmlCard() {
    var ed = podeEditar(), l = D.lista || [];
    var h = '<div class="sec" id="g2e-sec">Entidades (dados legais)</div><div class="card lp" id="g2e-card">';
    if (D.erro) h += '<div class="aviso">' + esc(D.erro) + '</div>';
    if (!l.length && !D.erro) h += '<div class="empty">Carregando…</div>';
    l.forEach(function (e) {
      var ig = e.tipo === 'church', cn = e.cnpjEfetivo ? mascCnpj(e.cnpjEfetivo) : '';
      h += '<div class="row g2f-mv"><span class="g2f-ri ' + (ig ? 'pri' : 'in') + '">' + (ig ? '⛪' : '🤝') + '</span><div class="info"><div class="nm">' + esc(e.nome) +
        ' <span class="pill p-' + (ig ? 'dour' : 'verde') + '">' + (ig ? 'Igreja' : 'Instituto') + '</span>' + (e.ativa === false ? ' <span class="pill p-cinza">inativa</span>' : '') + '</div>' +
        '<div class="sb">' + (cn ? 'CNPJ ' + esc(cn) + (e.usaCnpjDaIgreja ? ' (usa o da igreja)' : '') : '<b style="color:#C2262B">CNPJ não informado</b>') +
        (e.presidente ? ' · Presidente: ' + esc(e.presidente) : '') + (e.responsavel ? ' · Responsável: ' + esc(e.responsavel) : '') + '</div>' +
        (endTexto(e.endereco) ? '<div class="sb">' + esc(endTexto(e.endereco)) + '</div>' : '') +
        '<div class="sb">' + (e.contas || 0) + ' conta(s) no Financeiro</div></div>' +
        (ed ? '<div class="g2f-acts"><button type="button" class="g2f-ib t pri" data-e="editar" data-v="' + esc(e.registroId) + '"><span>Editar</span></button></div>' : '') + '</div>';
    });
    h += '</div>';
    if (ed) h += '<div class="g2f-tool g2f-noprint"><button type="button" class="g2f-btn g2f-soft" data-e="novo">+ Instituto</button>' +
      (l.some(function (e) { return e.tipo === 'institute'; }) ? '<button type="button" class="g2f-btn g2f-soft" data-e="conta">Ligar conta ao Instituto</button>' : '') + '</div>';
    return h + '<div class="g2f-note">Os dados legais saem nos relatórios e na prestação de contas. O CNPJ da Igreja vale também para o Instituto quando ele não tiver CNPJ próprio.</div>';
  }
  function pintar() {
    var t = T(), bd = $('g2f-bd');
    if (!t || !t.S || !t.S.aberto || t.S.aba !== 'cad' || !bd) return;
    if (/Carregando…/.test(bd.textContent || '') && bd.children.length < 2) return;
    if ($('g2e-card') && bd.contains($('g2e-card'))) return;
    if (!D.lista) { carregar(false); return; }
    var w = document.createElement('div'); w.id = 'g2e-wrap'; w.innerHTML = htmlCard();
    var old = $('g2e-wrap'); if (old) old.remove();
    bd.insertBefore(w, bd.firstChild);
    if (Date.now() - D.em > 60000) carregar(true);
  }
  setInterval(pintar, 1000);

  /* janela de formulário */
  function fechar() { var l = document.querySelectorAll('#g2e-mod'); for (var i = 0; i < l.length; i++) if (l[i].parentNode) l[i].parentNode.removeChild(l[i]); }
  // captura o Esc antes do módulo financeiro (que também usa o id g2f-mod) para fechar tudo de uma vez
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && $('g2e-mod')) { ev.stopPropagation(); fechar(); } }, true);
  function campo(id, rot, v, extra) { return '<label for="' + id + '">' + rot + '</label><input id="' + id + '" value="' + esc(v || '') + '"' + (extra || '') + '>'; }
  function abrirForm(e) {
    var ig = e && e.tipo === 'church', a = (e && e.endereco) || {};
    var o = document.createElement('div'); o.id = 'g2e-mod'; o.className = 'g2e-m';
    o.innerHTML = '<div id="g2f-mod" style="z-index:9997"><div class="box" role="dialog" aria-modal="true"><button type="button" class="g2f-x" data-e="fechar" aria-label="Fechar">×</button><div class="bd2">' +
      '<h3>' + (e ? 'Dados legais · ' + (ig ? 'Igreja' : 'Instituto') : 'Novo Instituto') + '</h3>' +
      campo('e-nome', 'Razão social *', e && e.nome) + campo('e-fant', 'Nome fantasia', e && e.fantasia) +
      campo('e-cnpj', 'CNPJ' + (ig ? '' : ' (vazio = usa o da igreja)'), e && e.cnpj ? mascCnpj(e.cnpj) : '', ' inputmode="numeric" placeholder="00.000.000/0000-00"') +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px">' + campo('e-ie', 'Inscrição estadual', e && e.ie) + campo('e-im', 'Inscrição municipal', e && e.im) + '</div>' +
      campo('e-pres', 'Presidente', e && e.presidente) + campo('e-resp', 'Responsável (contato)', e && e.responsavel) +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px">' + campo('e-tel', 'Telefone', e && e.telefone, ' type="tel" inputmode="numeric"') + campo('e-mail', 'E-mail', e && e.email, ' type="email" autocapitalize="none"') + '</div>' +
      '<label>Endereço legal</label><div style="display:grid;grid-template-columns:1fr 2fr;gap:0 10px">' + campo('e-cep', 'CEP', a.cep, ' inputmode="numeric" maxlength="9"') + campo('e-rua', 'Rua', a.rua) + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 2fr;gap:0 10px">' + campo('e-num', 'Número', a.numero) + campo('e-comp', 'Complemento', a.complemento) + '</div>' +
      '<div style="display:grid;grid-template-columns:2fr 2fr 1fr;gap:0 10px">' + campo('e-bai', 'Bairro', a.bairro) + campo('e-cid', 'Cidade', a.cidade) + campo('e-uf', 'UF', a.uf, ' maxlength="2"') + '</div>' +
      '<label for="e-obs">Observação</label><textarea id="e-obs">' + esc(e && e.obs) + '</textarea>' +
      (e && !ig ? '<div class="chk"><input type="checkbox" id="e-ativa"' + (e.ativa !== false ? ' checked' : '') + '><label for="e-ativa">Entidade ativa</label></div>' : '') +
      '<div class="err" id="e-err" aria-live="polite"></div><div class="ft"><button type="button" class="sec" data-e="fechar">Cancelar</button><button type="button" data-e="salvar" data-v="' + esc((e && e.registroId) || '') + '">Salvar</button></div>' +
      '</div></div></div>';
    document.body.appendChild(o);
    o.addEventListener('click', cliqueForm);
    o.addEventListener('input', function (ev) { if (ev.target.id === 'e-cnpj') ev.target.value = mascCnpj(ev.target.value); if (ev.target.id === 'e-uf') ev.target.value = ev.target.value.toUpperCase(); });
    setTimeout(function () { var n = $('e-nome'); if (n) n.focus(); }, 50);
  }
  function v(id) { var el = $(id); return el ? el.value.trim() : ''; }
  function salvar(regId, btn) {
    var err = $('e-err'), cn = soDig(v('e-cnpj'));
    if (v('e-nome').length < 3) { err.textContent = 'Informe a razão social (mín. 3 letras).'; return; }
    if (cn && !cnpjValido(cn)) { err.textContent = 'CNPJ inválido: confira os números.'; return; }
    if (v('e-mail') && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('e-mail'))) { err.textContent = 'E-mail inválido.'; return; }
    var p = { registroId: regId || null, nome: v('e-nome'), fantasia: v('e-fant'), cnpj: cn, ie: v('e-ie'), im: v('e-im'), presidente: v('e-pres'), responsavel: v('e-resp'),
      telefone: v('e-tel'), email: v('e-mail'), obs: v('e-obs'),
      endereco: { cep: v('e-cep'), rua: v('e-rua'), numero: v('e-num'), complemento: v('e-comp'), bairro: v('e-bai'), cidade: v('e-cid'), uf: v('e-uf') } };
    if ($('e-ativa')) p.ativa = $('e-ativa').checked;
    btn.disabled = true; btn.textContent = 'Salvando…';
    rpc('v39_fin_entity_save', { p: p }).then(function () {
      fechar(); D.lista = null; var w = $('g2e-wrap'); if (w) w.remove(); carregar(true);
      var t = T(); if (t && typeof t.carregarCtx === 'function') t.carregarCtx().catch(function () {});
    }).catch(function (e) { console.warn('[2Gather][entidades]', e); err.textContent = traduz(e); btn.disabled = false; btn.textContent = 'Salvar'; });
  }
  function abrirConta() {
    var t = T(), contas = ((t && t.S && t.S.cat && t.S.cat.contas) || []).filter(function (a) { return a.status === 'active'; });
    var inst = (D.lista || []).filter(function (e) { return e.tipo === 'institute'; });
    var o = document.createElement('div'); o.id = 'g2e-mod'; o.className = 'g2e-m';
    o.innerHTML = '<div id="g2f-mod" style="z-index:9997"><div class="box" role="dialog" aria-modal="true"><button type="button" class="g2f-x" data-e="fechar" aria-label="Fechar">×</button><div class="bd2">' +
      '<h3>Ligar conta ao Instituto</h3><div class="hint">Só contas <b>sem lançamentos</b> podem mudar de entidade. Contas que já têm movimento ficam na Igreja; abra uma conta nova para o Instituto.</div>' +
      '<label for="c-conta">Conta</label><select id="c-conta"><option value="">— escolha —</option>' + contas.map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(a.nome) + '</option>'; }).join('') + '</select>' +
      '<label for="c-ent">Pertence a</label><select id="c-ent"><option value="">Igreja</option>' + inst.map(function (e) { return '<option value="' + esc(e.registroId) + '">' + esc(e.nome) + '</option>'; }).join('') + '</select>' +
      '<div class="err" id="e-err" aria-live="polite"></div><div class="ft"><button type="button" class="sec" data-e="fechar">Cancelar</button><button type="button" data-e="salvarConta">Salvar</button></div></div></div></div>';
    document.body.appendChild(o); o.addEventListener('click', cliqueForm);
  }
  function salvarConta(btn) {
    var err = $('e-err'); if (!v('c-conta')) { err.textContent = 'Escolha a conta.'; return; }
    btn.disabled = true;
    rpc('v39_fin_account_set_entity', { p_account: v('c-conta'), p_entity: v('c-ent') || null }).then(function () {
      fechar(); D.lista = null; var w = $('g2e-wrap'); if (w) w.remove(); carregar(true);
    }).catch(function (e) { err.textContent = traduz(e); btn.disabled = false; });
  }
  function cliqueForm(ev) {
    var b = ev.target.closest('[data-e]'); if (!b) return;
    var k = b.getAttribute('data-e');
    if (k === 'fechar') return fechar();
    if (k === 'salvar') return salvar(b.getAttribute('data-v'), b);
    if (k === 'salvarConta') return salvarConta(b);
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('#g2e-wrap [data-e]'); if (!b) return;
    ev.stopPropagation();
    var k = b.getAttribute('data-e');
    if (k === 'editar') { var e = (D.lista || []).filter(function (x) { return x.registroId === b.getAttribute('data-v'); })[0]; if (e) abrirForm(e); }
    if (k === 'novo') abrirForm(null);
    if (k === 'conta') abrirConta();
  }, true);
  M._t = { cnpjValido: cnpjValido, mascCnpj: mascCnpj, D: D, pintar: pintar };
})();
