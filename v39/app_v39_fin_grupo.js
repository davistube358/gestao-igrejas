/* 2Gather v39 · Financeiro · FIN-GRP-1 · Grupo (matriz + filiais)
   Arquivo NOVO. Carregar DEPOIS do app_v39_financeiro.js e do app_v39_fin_entidades.js. Não altera o app.js nem o financeiro.
   Requer no Supabase: FIL_1 e FIN_GRP_1.
   - Aba Relatórios: card "Entidade (matriz + filiais)": uma coluna por estabelecimento (CNPJ), total consolidado,
     repasses entre estabelecimentos eliminados, Instituto fora (parte relacionada). Só aparece quando a igreja tem filiais.
   - Aba Transf. e cartões: "Repasses entre igrejas" (enviar para outra igreja do grupo; estornar os dois lados juntos).
   Regra: filial com a mesma raiz de CNPJ é a mesma pessoa jurídica; o repasse não é receita nem despesa. [CONFIRMAR] com o contador.
   Diagnóstico no Console: G2_FIN_GRP.versao */
(function () {
  'use strict';
  var VERSAO = 'FIN-GRP-1';
  if (window.G2_FIN_GRP) return;
  var M = window.G2_FIN_GRP = { versao: VERSAO };
  console.info('[2Gather] financeiro grupo ' + VERSAO);

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
  var MSG = { PERMISSION_DENIED: 'Sem permissão nesta igreja (é preciso Financeiro nas duas igrejas).', TREASURY_ONLY: 'Somente a Tesouraria ou o Master (nas duas igrejas).',
    FIN_REPASSE_DESTINO: 'Escolha outra igreja do mesmo grupo (ativa).', FIN_REPASSE_CONTA: 'Use contas da igreja (não do Instituto).', FIN_ACCOUNT_INVALID: 'Conta inválida ou inativa.',
    FIN_AMOUNT_INVALID: 'Valor inválido.', FIN_DATE_REQUIRED: 'Informe a data.', FIN_START_REQUIRED: 'A outra igreja ainda não definiu a data de início do Financeiro.',
    FIN_BEFORE_START: 'Data anterior ao início do Financeiro de uma das igrejas.', FIN_FUTURE_DATE: 'Data no futuro.', FIN_PERIOD_CLOSED: 'Mês fechado em uma das igrejas.',
    FIN_NOT_FOUND: 'Repasse não encontrado.', FIN_NOT_REVERSIBLE: 'Este repasse já foi estornado.', REASON_REQUIRED: 'Informe o motivo (mínimo de 5 letras).' };
  function traduz(e) {
    var t = String((e && (e.message || e.code)) || e || '');
    for (var k in MSG) if (t.indexOf(k) === 0) return MSG[k];
    if (/PGRST202|find the function/i.test(t)) return 'O servidor ainda não tem o Financeiro do grupo (rode o FIN_GRP_1).';
    if (/Failed to fetch|NetworkError/i.test(t)) return 'Sem conexão. Tente novamente.';
    return 'Não foi possível concluir. Tente novamente.';
  }
  function semFuncao(e) { return /PGRST202|find the function/i.test(String((e && (e.message || e.code)) || '')); }
  function soDig(s) { return String(s || '').replace(/\D/g, ''); }
  function cnpjFmt(c) { var d = soDig(c); return d.length === 14 ? d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-' + d.slice(12) : (d.length === 8 ? d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) : (c || '')); }
  function moeda(v) { var n = Number(v || 0); try { return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } catch (e) { return 'R$ ' + n.toFixed(2); } }
  function hoje() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function T() { return (window.G2_FIN && window.G2_FIN._t) || null; }
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  /* ── estado ── */
  var G = { info: null, infoIgreja: null, carregandoInfo: false, off: false, rel: null, relChave: '', carregandoRel: false, rep: null, repChave: '', carregandoRep: false };
  function carregarInfo() {
    var ig = igrejaId(); if (!ig || G.carregandoInfo || G.off) return;
    if (G.info && G.infoIgreja === ig) return;
    G.carregandoInfo = true;
    rpc('v39_fin_group_info', {}).then(function (r) { G.info = r || { grupo: [] }; G.infoIgreja = ig; })
      .catch(function (e) { if (semFuncao(e)) G.off = true; else console.warn('[2Gather][grupo]', e); G.info = { grupo: [] }; G.infoIgreja = ig; })
      .then(function () { G.carregandoInfo = false; });
  }
  function temGrupo() { return !!(G.info && (G.info.grupo || []).length > 1); }

  /* ── aba Relatórios: consolidado ── */
  function chaveRel(S) { return igrejaId() + '|' + S.ano + '|' + (S.relMes ? S.mes : '') ; }
  function carregarRel(S) {
    var k = chaveRel(S); if (G.carregandoRel || G.relChave === k) return;
    G.carregandoRel = true; G.relChave = k; G.rel = null;
    rpc('v39_fin_group_report', { p_year: S.ano, p_month: S.relMes ? S.mes : null }).then(function (r) { G.rel = r; })
      .catch(function (e) { G.rel = { erro: traduz(e) }; }).then(function () { G.carregandoRel = false; var w = $('g2g-rel'); if (w) w.remove(); });
  }
  function htmlRel(S) {
    var R = G.rel, tit = (S.relMes ? MESES[S.mes - 1] + '/' : 'Ano ') + S.ano;
    var h = '<div class="card" id="g2g-relcard"><h3>Entidade (matriz + filiais) — consolidado ' + esc(tit) + '</h3>';
    if (!R) return h + '<div class="empty">Carregando…</div></div>';
    if (R.erro) return h + '<div class="aviso">' + esc(R.erro) + '</div></div>';
    var E = R.estabelecimentos || [], C = R.consolidado || {}, inc = E.filter(function (e) { return e.incluido; });
    h += '<div class="g2f-mut">' + esc((R.entidade || {}).nome || '') + ((R.entidade || {}).raiz ? ' · CNPJ raiz ' + esc(cnpjFmt(R.entidade.raiz)) : '') +
      ' · ' + inc.length + ' estabelecimento(s)</div>';
    if (R.parcial) h += '<div class="aviso">Consolidado parcial: você não tem acesso ao Financeiro de ' + E.filter(function (e) { return !e.incluido; }).map(function (e) { return esc(e.nome); }).join(', ') + '.</div>';
    h += '<div style="overflow-x:auto"><table class="g2f-tab" style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr>' +
      '<th style="text-align:left">Estabelecimento</th><th style="text-align:left">CNPJ</th><th style="text-align:right">Receitas</th><th style="text-align:right">Despesas</th>' +
      '<th style="text-align:right">Superávit/Déficit</th><th style="text-align:right">Repasses (env./rec.)</th><th style="text-align:right">Caixa final</th></tr></thead><tbody>';
    inc.forEach(function (e) {
      h += '<tr><td>' + esc(e.nome) + ' <span class="pill p-' + (e.papel === 'matriz' ? 'dour' : 'verde') + '">' + (e.papel === 'matriz' ? 'Matriz' : 'Filial') + '</span>' +
        (e.status !== 'active' ? ' <span class="pill p-cinza">inativa</span>' : '') + '</td><td>' + esc(e.cnpj ? cnpjFmt(e.cnpj) : '—') + '</td>' +
        '<td style="text-align:right">' + moeda(e.receitas) + '</td><td style="text-align:right">' + moeda(e.despesas) + '</td>' +
        '<td style="text-align:right">' + moeda(e.superavit) + '</td><td style="text-align:right">' + moeda(e.repassesEnviados) + ' / ' + moeda(e.repassesRecebidos) + '</td>' +
        '<td style="text-align:right">' + moeda(e.caixaFinal) + '</td></tr>';
    });
    h += '<tr style="font-weight:700;border-top:2px solid var(--cc,#ddd)"><td>Consolidado</td><td>' + esc((R.entidade || {}).raiz ? cnpjFmt(R.entidade.raiz) + '…' : '') + '</td>' +
      '<td style="text-align:right">' + moeda(C.receitas) + '</td><td style="text-align:right">' + moeda(C.despesas) + '</td><td style="text-align:right">' + moeda(C.superavit) + '</td>' +
      '<td style="text-align:right">eliminados</td><td style="text-align:right">' + moeda(C.caixaFinal) + '</td></tr></tbody></table></div>';
    h += '<div class="g2f-mut" style="margin-top:6px">Repasses entre estabelecimentos no período: enviados ' + moeda(C.repassesEnviados) + ', recebidos ' + moeda(C.repassesRecebidos) +
      '. Não são receita nem despesa e se anulam no consolidado.' + (Math.abs(Number(C.repassesEmTransito || 0)) > 0.004 ? ' <b style="color:#C2262B">Diferença de ' + moeda(C.repassesEmTransito) + ' (repasse em trânsito ou lançado só de um lado).</b>' : '') + '</div>';
    var cats = R.categorias || [];
    if (cats.length) {
      h += '<div style="overflow-x:auto;margin-top:10px"><table class="g2f-tab" style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th style="text-align:left">Conta contábil</th><th style="text-align:left">Categoria</th>' +
        inc.map(function (e) { return '<th style="text-align:right">' + esc(e.nome) + '</th>'; }).join('') + '<th style="text-align:right">Total</th></tr></thead><tbody>' +
        cats.map(function (c) {
          return '<tr><td>' + esc(c.contabil || '—') + '</td><td>' + esc(c.nome) + '</td>' + inc.map(function (e) { return '<td style="text-align:right">' + moeda((c.porEstabelecimento || {})[e.id] || 0) + '</td>'; }).join('') +
            '<td style="text-align:right"><b>' + moeda(c.valor) + '</b></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    var pr = R.partesRelacionadas || [];
    if (pr.length) h += '<div class="g2f-mut" style="margin-top:8px">Fora do consolidado (pessoa jurídica própria, relatório separado; citar como parte relacionada): ' +
      pr.map(function (x) { return esc(x.nome) + (x.cnpj ? ' (CNPJ ' + esc(cnpjFmt(x.cnpj)) + ')' : ' (sem CNPJ próprio)'); }).join('; ') + '.</div>';
    return h + '<div class="g2f-note">Filial com a mesma raiz de CNPJ é a mesma pessoa jurídica: as demonstrações da entidade (ITG 2002 R1) somam matriz e filiais. Valide a apresentação com o contador.</div></div>';
  }

  /* ── aba Transf.: repasses ── */
  function chaveRep(S) { return igrejaId() + '|' + S.ano + '|' + S.mes; }
  function carregarRep(S) {
    var k = chaveRep(S); if (G.carregandoRep || G.repChave === k) return;
    G.carregandoRep = true; G.repChave = k; G.rep = null;
    rpc('v39_fin_repasses', { p_year: S.ano, p_month: S.mes }).then(function (r) { G.rep = r || []; })
      .catch(function (e) { G.rep = { erro: traduz(e) }; }).then(function () { G.carregandoRep = false; var w = $('g2g-rep'); if (w) w.remove(); });
  }
  function eu() { var g = (G.info && G.info.grupo) || [], at = igrejaId(); return g.filter(function (x) { return x.id === at; })[0] || null; }
  function htmlRep(S) {
    var me = eu(), pode = !!(me && me.podeRepassar), outras = ((G.info && G.info.grupo) || []).filter(function (x) { return x.id !== igrejaId() && x.status === 'active' && x.podeRepassar; });
    var h = '<div class="sec">Repasses entre igrejas (matriz e filiais)</div><div class="card lp" id="g2g-repcard">';
    var L = G.rep;
    if (!L) h += '<div class="empty">Carregando…</div>';
    else if (L.erro) h += '<div class="aviso">' + esc(L.erro) + '</div>';
    else if (!L.length) h += '<div class="empty">Nenhum repasse em ' + esc(MESES[S.mes - 1]) + '/' + S.ano + '.</div>';
    else L.forEach(function (x) {
      var env = x.sentido === 'enviado', est = x.status === 'reversed';
      h += '<div class="row g2f-mv"><span class="g2f-ri ' + (env ? 'out' : 'in') + '">' + (env ? '↗' : '↙') + '</span><div class="info"><div class="nm">' + (env ? 'Para ' : 'De ') + esc(x.outraIgreja || '') +
        (est ? ' <span class="pill p-cinza">estornado</span>' : '') + '</div><div class="sb">' + esc(String(x.data || '').split('-').reverse().join('/')) + ' · ' + esc(x.conta || '') + ' · ' + esc(x.descricao || '') + '</div></div>' +
        '<div style="text-align:right"><b>' + (env ? '−' : '+') + moeda(x.valor) + '</b>' + (pode && !est ? '<div><button type="button" class="g2f-ib t" data-g="estornar" data-v="' + esc(x.id) + '"><span>Estornar</span></button></div>' : '') + '</div></div>';
    });
    h += '</div>';
    if (pode && outras.length) h += '<div class="g2f-tool g2f-noprint"><button type="button" class="g2f-btn g2f-soft" data-g="novo">+ Repasse para outra igreja</button></div>';
    return h + '<div class="g2f-note">Repasse não é receita nem despesa: sai de uma conta desta igreja e entra numa conta da outra, e se anula no consolidado da entidade.</div>';
  }

  /* ── pintura (mesmo padrão do módulo de entidades) ── */
  function pintar() {
    var t = T(), bd = $('g2f-bd');
    if (!t || !t.S || !t.S.aberto || !bd) return;
    if (/Carregando…/.test(bd.textContent || '') && bd.children.length < 2) return;
    carregarInfo(); if (G.off || !G.info || !temGrupo()) return;
    var S = t.S;
    if (S.aba === 'rel') {
      if ($('g2g-rel') && bd.contains($('g2g-rel'))) return;
      carregarRel(S);
      var w = document.createElement('div'); w.id = 'g2g-rel'; w.innerHTML = htmlRel(S); bd.insertBefore(w, bd.firstChild);
    } else if (S.aba === 'transf') {
      if ($('g2g-rep') && bd.contains($('g2g-rep'))) return;
      carregarRep(S);
      var w2 = document.createElement('div'); w2.id = 'g2g-rep'; w2.innerHTML = htmlRep(S); bd.appendChild(w2);
    }
  }
  setInterval(pintar, 1000);

  /* ── janelas ── */
  function fechar() { var l = document.querySelectorAll('#g2g-mod'); for (var i = 0; i < l.length; i++) if (l[i].parentNode) l[i].parentNode.removeChild(l[i]); }
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && $('g2g-mod')) { ev.stopPropagation(); fechar(); } }, true);
  function modal(html) {
    var o = document.createElement('div'); o.id = 'g2g-mod';
    o.innerHTML = '<div id="g2f-mod" style="z-index:9997"><div class="box" role="dialog" aria-modal="true"><button type="button" class="g2f-x" data-g="fechar" aria-label="Fechar">×</button><div class="bd2">' + html + '</div></div></div>';
    document.body.appendChild(o); o.addEventListener('click', clique); return o;
  }
  function opcoesContas(l) { return '<option value="">— escolha —</option>' + (l || []).map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(a.nome) + '</option>'; }).join(''); }
  function abrirNovo() {
    var me = eu(), outras = ((G.info && G.info.grupo) || []).filter(function (x) { return x.id !== igrejaId() && x.status === 'active' && x.podeRepassar; });
    modal('<h3>Repasse para outra igreja</h3><div class="hint">Sai de uma conta desta igreja e entra numa conta da igreja escolhida. Não conta como receita nem despesa.</div>' +
      '<label for="g-co">Conta de origem (' + esc(me ? me.nome : '') + ')</label><select id="g-co">' + opcoesContas(me && me.contas) + '</select>' +
      '<label for="g-ig">Igreja de destino</label><select id="g-ig"><option value="">— escolha —</option>' + outras.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.nome) + (x.papel === 'matriz' ? ' (matriz)' : '') + '</option>'; }).join('') + '</select>' +
      '<label for="g-cd">Conta de destino</label><select id="g-cd"><option value="">— escolha a igreja —</option></select>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px"><div><label for="g-val">Valor (R$)</label><input id="g-val" inputmode="decimal" placeholder="0,00"></div>' +
      '<div><label for="g-dt">Data</label><input id="g-dt" type="date" value="' + hoje() + '"></div></div>' +
      '<label for="g-desc">Descrição</label><input id="g-desc" placeholder="Ex.: ajuda para o aluguel">' +
      '<div class="err" id="g-err" aria-live="polite"></div><div class="ft"><button type="button" class="sec" data-g="fechar">Cancelar</button><button type="button" data-g="salvar">Repassar</button></div>');
    var ig = $('g-ig'); if (ig) ig.addEventListener('change', function () {
      var d = ((G.info && G.info.grupo) || []).filter(function (x) { return x.id === ig.value; })[0];
      $('g-cd').innerHTML = d ? opcoesContas(d.contas) : '<option value="">— escolha a igreja —</option>';
    });
  }
  function valorBR(s) { s = String(s || '').trim().replace(/\s|R\$/g, ''); if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); return Number(s); }
  function salvar(btn) {
    var err = $('g-err'), v = function (id) { var e = $(id); return e ? e.value.trim() : ''; };
    var p = { contaOrigemId: v('g-co'), igrejaDestinoId: v('g-ig'), contaDestinoId: v('g-cd'), valor: valorBR(v('g-val')), data: v('g-dt'), descricao: v('g-desc'),
      chave: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random() };
    if (!p.contaOrigemId || !p.igrejaDestinoId || !p.contaDestinoId) { err.textContent = 'Escolha a conta de origem, a igreja e a conta de destino.'; return; }
    if (!(p.valor > 0)) { err.textContent = 'Informe o valor.'; return; }
    btn.disabled = true; btn.textContent = 'Repassando…';
    rpc('v39_fin_repasse', { p: p }).then(function () {
      fechar(); G.repChave = ''; G.relChave = ''; var w = $('g2g-rep'); if (w) w.remove();
      var t = T(); if (t && typeof t.carregarCtx === 'function') t.carregarCtx().catch(function () {});
    }).catch(function (e) { console.warn('[2Gather][grupo]', e); err.textContent = traduz(e); btn.disabled = false; btn.textContent = 'Repassar'; });
  }
  function abrirEstorno(id) {
    modal('<h3>Estornar repasse</h3><div class="hint">Estorna os dois lados (nesta igreja e na outra). Nada é apagado.</div>' +
      '<label for="g-mot">Motivo *</label><textarea id="g-mot" rows="3"></textarea>' +
      '<div class="err" id="g-err" aria-live="polite"></div><div class="ft"><button type="button" class="sec" data-g="fechar">Cancelar</button><button type="button" data-g="estornarOk" data-v="' + esc(id) + '">Estornar</button></div>');
  }
  function estornar(id, btn) {
    var err = $('g-err'), mot = $('g-mot') ? $('g-mot').value.trim() : '';
    if (mot.length < 5) { err.textContent = 'Informe o motivo.'; return; }
    btn.disabled = true;
    rpc('v39_fin_repasse_reverse', { p_repasse: id, p_reason: mot }).then(function () {
      fechar(); G.repChave = ''; G.relChave = ''; var w = $('g2g-rep'); if (w) w.remove();
    }).catch(function (e) { err.textContent = traduz(e); btn.disabled = false; });
  }
  function clique(ev) {
    var b = ev.target.closest('[data-g]'); if (!b) return;
    var k = b.getAttribute('data-g');
    if (k === 'fechar') return fechar();
    if (k === 'salvar') return salvar(b);
    if (k === 'estornarOk') return estornar(b.getAttribute('data-v'), b);
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('#g2g-rep [data-g]'); if (!b) return;
    ev.stopPropagation();
    var k = b.getAttribute('data-g');
    if (k === 'novo') abrirNovo();
    if (k === 'estornar') abrirEstorno(b.getAttribute('data-v'));
  }, true);
  M._t = { G: G, htmlRel: htmlRel, htmlRep: htmlRep, valorBR: valorBR, cnpjFmt: cnpjFmt };
})();
