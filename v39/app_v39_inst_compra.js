/* 2Gather v39 · Instituto · Entrada por compra · COMPRA-1
   ARQUIVO NOVO (não altera nenhum arquivo existente). Carregar DEPOIS do app_v39_instituto.js (INST-6) e antes do app_v39_popups.js.
   Substitui a tela "Entrada por compra" (botão do topo do Mercado/Farmácia e origem "Compra" da entrada de estoque).
   Requer no Supabase: FIN_S15 e INST_S13 (INST_S13_entrada_pendente.sql, com teste ok).
   Regras
   - Só aparecem despesas do CNPJ do Instituto que ainda têm SALDO A RECEBER (quantidade).
   - Cada despesa mostra o que falta receber; item recebido 100% some da tela. Despesa 100% recebida fica FINALIZADA e não aceita nova entrada.
   - "Mostrar também as já recebidas" lista as finalizadas só para consulta (bloqueadas). Despesa encerrada à mão pode ser reaberta.
   - Quantidade maior que a pendente é bloqueada. Lote obrigatório na Farmácia e nos produtos que exigem lote.
   - "Encerrar recebimento": para quando o fornecedor não vai entregar o restante (pede motivo) ou para despesa sem itens informados.
   Diagnóstico no Console: G2_COMPRA.versao */
(function () {
  'use strict';
  var VERSAO = 'COMPRA-1';
  if (window.G2_COMPRA) return;
  var K = window.G2_COMPRA = { versao: VERSAO };
  console.info('[2Gather] compra do instituto ' + VERSAO);

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
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
  function brl(n) { return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function num(t) {
    var s = String(t == null ? '' : t).trim(); if (!s) return NaN;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    var n = Number(s); return isFinite(n) ? n : NaN;
  }
  function fq(n) { return String(Math.round(Number(n || 0) * 1000) / 1000).replace('.', ','); }
  function dataBR(s) { var p = String(s || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }
  function cnpjFmt(t) { var d = String(t || '').replace(/\D/g, ''); return d.length === 14 ? d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-' + d.slice(12) : d; }
  function aviso(msg, ms) {
    var t = $('g2c-toast');
    if (!t) { t = document.createElement('div'); t.id = 'g2c-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.style.display = 'block'; clearTimeout(aviso._t);
    aviso._t = setTimeout(function () { t.style.display = 'none'; }, ms || 7000);
  }
  function recarregarEstoque() { try { if (window.__gc && typeof window.__gc.estRecarregar === 'function') window.__gc.estRecarregar(); } catch (e) { /* segue */ } }

  var MSG = {
    PURCHASE_EXPENSE_DONE: 'Esta despesa já foi totalmente recebida ou encerrada. Atualize a lista.',
    PURCHASE_ITEM_DONE: 'Este item já foi recebido 100%. Atualize a lista.',
    PURCHASE_EXPENSE_SCOPE: 'Os itens desta despesa são de outro estoque (Mercado ou Farmácia).',
    PURCHASE_EXPENSE_ENTITY: 'Esta despesa não é do CNPJ do Instituto.',
    PURCHASE_EXPENSE_NOT_FOUND: 'Despesa não encontrada. Atualize a lista.',
    PURCHASE_EXPENSE_INVALID: 'Esta despesa está recusada, cancelada ou estornada e não pode receber entradas.',
    PURCHASE_EXPENSE_REQUIRED: 'Escolha a despesa do Financeiro.',
    PURCHASE_PRODUCT_NOT_IN_EXPENSE: 'Este produto não está nos itens da despesa.',
    REASON_REQUIRED: 'Informe o motivo (mín. 3 letras).'
  };
  function detMsg(e) { try { var d = JSON.parse((e && e.details) || ''); return d && d.message ? String(d.message) : ''; } catch (x) { return ''; } }
  function traduz(e) {
    var t = String((e && (e.message || e.code)) || e || '');
    if (t.indexOf('PURCHASE_QTY_EXCEEDS') === 0) { var m = detMsg(e); return m || 'Quantidade acima do que falta receber.'; }
    for (var k in MSG) if (t === k || t.indexOf(k) === 0) return MSG[k];
    if (/identifica[cç][aã]o de lote|exige.{0,20}lote/i.test(t)) return 'Este produto exige o número do lote. Informe o lote dos itens marcados com *.';
    if (/PGRST202|find the function|does not exist/i.test(t)) return 'O servidor ainda não tem esta função. Rode o INST_S13 no Supabase.';
    try { if (window.G2_INST && typeof window.G2_INST._traduz === 'function') return window.G2_INST._traduz(e); } catch (x) { /* segue */ }
    return 'Não foi possível concluir. Tente novamente.';
  }
  function erro(e) { console.warn('[2Gather][compra]', e); return new Error(traduz(e)); }

  function css() {
    if ($('g2c-css')) return;
    var s = document.createElement('style'); s.id = 'g2c-css';
    s.textContent = [
      '#g2c-mod{position:fixed;inset:0;background:rgba(20,22,26,.45);z-index:9996;display:flex;align-items:flex-end;justify-content:center}',
      '#g2c-mod .box{position:relative;display:flex;flex-direction:column;background:#fff;color:#14161A;width:100%;max-width:640px;max-height:92vh;overflow:hidden;border-radius:22px 22px 0 0;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}',
      '@media(min-width:700px){#g2c-mod{align-items:center}#g2c-mod .box{border-radius:22px}}',
      '#g2c-mod .bd{overflow:auto;padding:18px 16px}#g2c-mod h3{margin:0 0 6px;padding-right:42px;font-size:17px}',
      '#g2c-mod .x{position:absolute;top:10px;right:10px;width:34px;height:34px;border:none;border-radius:50%;background:#EEF0F4;font-size:18px;cursor:pointer}',
      '#g2c-mod .sb{font-size:12.5px;color:#5E6470}#g2c-mod label{display:block;font-size:12px;color:#5E6470;margin:10px 0 4px;font-weight:700}',
      '#g2c-mod input,#g2c-mod select{width:100%;box-sizing:border-box;border:1.5px solid #ECEEF1;border-radius:12px;padding:10px;font:inherit;font-size:15px;background:#fff;color:#14161A}',
      '#g2c-mod input[type=checkbox]{width:auto;margin-right:6px}',
      '#g2c-mod .ln{display:flex;gap:10px;align-items:center;padding:9px 8px;border-bottom:1px solid #F0F1F4;border-radius:10px}#g2c-mod .ln .i{flex:1;min-width:0}',
      '#g2c-mod .ln .i b{display:block;font-size:13.5px}#g2c-mod .ln .i small{display:block;font-size:11.5px;color:#5E6470}',
      '#g2c-mod .ln.sel{background:#EAF0FF;outline:1.5px solid #2F5BEA}#g2c-mod .ln.fin{opacity:.6;cursor:not-allowed}#g2c-mod .ln:not(.fin){cursor:pointer}',
      '#g2c-mod .ln:focus-visible,#g2c-mod button:focus-visible{outline:2px solid #2F5BEA;outline-offset:2px}',
      '#g2c-mod .pl{display:inline-block;border-radius:99px;padding:2px 8px;font-size:11px;font-weight:700;background:#EEF0F4;color:#5E6470;margin:2px 3px 0 0;white-space:nowrap}',
      '#g2c-mod .pl.v{background:#E7F7EF;color:#16A36A}#g2c-mod .pl.a{background:#FFF5DC;color:#8A5A00}#g2c-mod .pl.d{background:#EAF0FF;color:#2F5BEA}',
      '#g2c-mod .bar{height:6px;border-radius:99px;background:#ECEEF1;margin-top:5px;overflow:hidden}#g2c-mod .bar i{display:block;height:100%;background:#16A36A}',
      '#g2c-mod .ft{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}',
      '#g2c-mod .ft button,#g2c-mod .bt{height:40px;padding:0 16px;border:none;border-radius:12px;background:var(--pri,#2F5BEA);color:#fff;font:inherit;font-weight:800;cursor:pointer}',
      '#g2c-mod .bt.s{background:#EEF0F4;color:#14161A}#g2c-mod .bt.sm{height:32px;padding:0 11px;font-size:12.5px}',
      '#g2c-mod .bt.r{background:#FDECEC;color:#C2262B}#g2c-mod .ft button:disabled{opacity:.55;cursor:default}',
      '#g2c-mod .card{border:1px solid #ECEEF1;border-radius:14px;padding:12px;margin:10px 0}#g2c-mod .err{color:#E5484D;font-size:13px;min-height:1em;margin-top:8px}',
      '#g2c-mod .vazio{color:#9AA1AC;text-align:center;padding:18px 6px}#g2c-mod .gr2{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}',
      '#g2c-mod .it{border-bottom:1px solid #F0F1F4;padding:8px 0 10px}',
      '#g2c-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:96px;z-index:10000;background:#14161A;color:#fff;padding:11px 16px;border-radius:14px;max-width:90vw;display:none;font:13.5px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;border-left:4px solid #16A36A}',
      '@media (prefers-color-scheme:dark){#g2c-mod .box{background:#1d2026;color:#eceef1}#g2c-mod input,#g2c-mod select{background:#14161A;color:#eceef1;border-color:#2a2e36}#g2c-mod .ln.sel{background:#1c2a52}}'
    ].join('\n');
    document.head.appendChild(s);
  }
  function fechar() { var o = $('g2c-mod'); if (o) o.parentNode.removeChild(o); }
  function abrirModal(html) {
    css(); fechar();
    var o = document.createElement('div'); o.id = 'g2c-mod';
    o.innerHTML = '<div class="box" role="dialog" aria-modal="true"><button type="button" class="x" data-c="fechar" aria-label="Fechar">×</button><div class="bd">' + html + '</div></div>';
    document.body.appendChild(o);
    o.addEventListener('click', clique); o.addEventListener('input', digita); o.addEventListener('change', muda);
    o.addEventListener('keydown', function (ev) { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target && ev.target.getAttribute && ev.target.getAttribute('data-c') === 'esc') { ev.preventDefault(); escolher(ev.target.getAttribute('data-v')); } });
  }
  function corpo(h) { var o = $('g2c-mod'); if (o) o.querySelector('.bd').innerHTML = h; }
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && $('g2c-mod')) fechar(); });

  var NOME = { mercado: 'Mercado', farmacia: 'Farmácia' };
  var S = null;
  var ST_DESP = { draft: ['', 'rascunho'], pending_approval: ['a', 'aguardando aprovação'], correction_requested: ['a', 'correção pedida'], approved: ['d', 'aprovada'], partially_paid: ['d', 'parcialmente paga'], paid: ['v', 'paga'] };

  function carregarProdutos(tipo) {
    var I = window.G2_INST;
    if (I && I.ultimo && I.ultimo[tipo] && I.ultimo[tipo].produtos) return Promise.resolve(I.ultimo[tipo]);
    if (I && I._ACOES && typeof I._ACOES.estDados === 'function') return I._ACOES.estDados({ tipo: tipo });
    return rpc('v39_est_dados', { p_tipo: tipo });
  }
  function carregarDespesas() {
    return rpc('v39_est_expenses_open', { p_tipo: S.tipo, p_finalizadas: !!S.todas }).catch(function (e) { throw erro(e); }).then(function (r) {
      S.despesas = (r && r.despesas) || []; S.ocultas = Number((r && r.ocultas) || 0);
      if (S.despesaId && !S.despesas.some(function (d) { return d.id === S.despesaId; })) { S.despesaId = ''; S.itens = []; }
    });
  }
  K.abrirCompra = function (tipo, prodId) {
    tipo = tipo === 'farmacia' ? 'farmacia' : 'mercado';
    S = { tipo: tipo, prodId: prodId || '', despesas: [], ocultas: 0, todas: false, despesaId: '', itens: [], livres: false, obs: '', busca: '', produtos: [], loteObrig: {} };
    abrirModal('<h3>Entrada por compra · ' + NOME[tipo] + '</h3><div class="vazio">Carregando despesas pendentes…</div>');
    Promise.all([carregarProdutos(tipo), carregarDespesas()]).then(function (r) {
      S.produtos = ((r[0] && r[0].produtos) || []).filter(function (p) { return p.ativa !== false; });
      pintar();
    }).catch(function (e) {
      corpo('<h3>Entrada por compra</h3><div class="err">' + esc(e.message) + '</div><div class="ft"><button type="button" class="bt s" data-c="fechar">Fechar</button></div>');
    });
  };

  function despDe(id) { return S.despesas.filter(function (d) { return d.id === id; })[0] || null; }
  function resumoFalta(d) {
    var l = (d.itens || []).filter(function (i) { return Number(i.restante) > 0; });
    return l.map(function (i) { return fq(i.restante) + ' ' + (i.unidade || 'un') + ' ' + i.descricao; }).join(' · ');
  }
  function progresso(d) {
    var q = 0, r = 0; (d.itens || []).forEach(function (i) { q += Number(i.qtd); r += Math.min(Number(i.recebido), Number(i.qtd)); });
    return q > 0 ? Math.round(r / q * 100) : 0;
  }
  function filtradas() {
    var q = String(S.busca || '').toLowerCase();
    return S.despesas.filter(function (d) { return !q || String([d.fornecedor, d.descricao, d.numero].join(' ')).toLowerCase().indexOf(q) >= 0 || d.id === S.despesaId; }).slice(0, 40);
  }
  function htmlLista() {
    var l = filtradas();
    if (!S.despesas.length) return '<div class="vazio">' + (S.todas ? 'Nenhuma despesa do <b>CNPJ do Instituto</b> encontrada.' : 'Nenhuma despesa <b>com saldo a receber</b>.' + (S.ocultas ? '<br>' + S.ocultas + ' já foi(ram) totalmente recebida(s) ou encerrada(s): marque "Mostrar também as já recebidas" para consultar.' : '<br>Lance a despesa no <b>Financeiro</b> (seletor em Instituto, com os itens comprados) e volte aqui.')) + '</div>';
    if (!l.length) return '<div class="vazio">Nenhuma despesa com esta busca.</div>';
    return l.map(function (d) {
      var s = ST_DESP[d.status] || ['', d.status], on = d.id === S.despesaId, fin = !!d.finalizada, falta = resumoFalta(d), pr = progresso(d);
      var info = fin ? ('<small>' + (d.finalizacao === 'manual' ? 'Recebimento encerrado' + (d.motivoFinal ? ': ' + esc(d.motivoFinal) : '') : 'Recebido 100% — finalizada, bloqueada para novas entradas') + '</small>')
        : (falta ? '<small>Falta receber: ' + esc(falta) + '</small><div class="bar" aria-label="Recebido ' + pr + '%"><i style="width:' + pr + '%"></i></div>' : '<small>Sem itens informados: escolha os produtos que chegaram.</small>');
      return '<div class="ln' + (on ? ' sel' : '') + (fin ? ' fin' : '') + '" data-c="' + (fin ? 'fin' : 'esc') + '" data-v="' + esc(d.id) + '" role="button" tabindex="' + (fin ? '-1' : '0') + '"' + (fin ? ' aria-disabled="true"' : '') + '>' +
        '<div class="i"><b>' + esc(d.fornecedor || 'Sem fornecedor') + ' · ' + brl(d.valor) + '</b><small>' + esc([d.numero, d.descricao].filter(Boolean).join(' · ')) + '</small>' + info +
        '<small>emissão ' + (d.emissao ? dataBR(d.emissao) : '—') + ' · Instituto' + (d.cnpj ? ' · CNPJ ' + esc(cnpjFmt(d.cnpj)) : '') + (d.entradas ? ' · ' + d.entradas + ' entrada(s) já feita(s)' : '') + '</small></div>' +
        '<span class="pl ' + (fin ? 'v' : s[0]) + '">' + (fin ? '🔒 finalizada' : (on ? '✓ ' : '') + esc(s[1])) + '</span></div>';
    }).join('');
  }
  function exigeLote(it) { return S.tipo === 'farmacia' || !!S.loteObrig[String(it.produtoId)]; }
  function linhasDe(d) {
    var its = (d && d.itens) || [];
    if (!its.length) return { livres: true, itens: [{ produtoId: S.prodId || '', qtd: '', lote: '', validade: '' }] };
    return { livres: false, itens: its.filter(function (i) { return Number(i.restante) > 0; }).map(function (i) {
      return { produtoId: i.produtoId, desc: i.descricao, unidade: i.unidade || 'un', comprada: Number(i.qtd), recebido: Number(i.recebido), restante: Number(i.restante), valorUnit: Number(i.valorUnit || 0), qtd: fq(i.restante), lote: '', validade: '' };
    }) };
  }
  function escolher(id) {
    var d = despDe(id); if (!d || d.finalizada) return;
    lerForm(); S.despesaId = id; var x = linhasDe(d); S.livres = x.livres; S.itens = x.itens; pintar();
  }
  function lerForm() {
    if (!S || !$('c-obs')) return;
    S.obs = $('c-obs').value.trim();
    S.itens.forEach(function (it, i) { ['produtoId', 'qtd', 'lote', 'validade'].forEach(function (k) { var el = $('c-' + k + '-' + i); if (el) it[k] = el.value.trim(); }); });
  }
  function opt(l, sel, vazio) { return (vazio ? '<option value="">' + vazio + '</option>' : '') + l.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (String(x[0]) === String(sel) ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join(''); }
  function htmlLinhas() {
    var far = S.tipo === 'farmacia', prods = S.produtos.map(function (p) { return [p.id, p.nome + (p.apresentacao ? ' · ' + p.apresentacao : '') + ' (' + (p.unidade || 'un') + ')']; });
    if (!S.itens.length) return '<div class="vazio">Nenhum item pendente nesta despesa.</div>';
    return S.itens.map(function (it, i) {
      var req = exigeLote(it), campos =
        '<div class="gr2"><div><label for="c-qtd-' + i + '">Quantidade que chegou' + (S.livres ? ' *' : '') + '</label><input id="c-qtd-' + i + '" inputmode="decimal" value="' + esc(it.qtd) + '"></div>' +
        '<div><label for="c-lote-' + i + '">Lote' + (req ? ' *' : ' (opcional)') + '</label><input id="c-lote-' + i + '" value="' + esc(it.lote) + '"></div></div>' +
        '<label for="c-validade-' + i + '">Validade' + (far ? ' *' : ' (opcional)') + '</label><input id="c-validade-' + i + '" type="date" value="' + esc(it.validade) + '">';
      if (!S.livres) return '<div class="it"><b>' + esc(it.desc) + '</b><div class="sb">comprado ' + fq(it.comprada) + ' ' + esc(it.unidade) + ' · já recebido ' + fq(it.recebido) + ' · <b>falta ' + fq(it.restante) + '</b>' + (it.valorUnit > 0 ? ' · ' + brl(it.valorUnit) + ' cada' : '') + '</div>' + campos + '</div>';
      return '<div class="it"><label for="c-produtoId-' + i + '">Produto *</label><div style="display:flex;gap:8px"><select id="c-produtoId-' + i + '" style="flex:1">' + opt(prods, it.produtoId, 'Escolha…') + '</select>' +
        (S.itens.length > 1 ? '<button type="button" class="bt r sm" data-c="rem" data-v="' + i + '" aria-label="Remover item ' + (i + 1) + '">×</button>' : '') + '</div>' + campos + '</div>';
    }).join('');
  }
  function pintar() {
    var d = despDe(S.despesaId);
    var h = '<h3>Entrada por compra · ' + NOME[S.tipo] + '</h3>' +
      '<div class="sb">Aparecem só as despesas do <b>CNPJ do Instituto</b> com <b>saldo a receber</b>. Recebido 100% = entrada concluída e item bloqueado.</div>' +
      '<div class="card"><b>1. Despesa do Financeiro *</b>' +
      '<label for="c-busca">Buscar por fornecedor, descrição ou número</label><input id="c-busca" data-k="busca" autocomplete="off" value="' + esc(S.busca) + '">' +
      '<label style="display:flex;align-items:center;font-weight:600;margin-top:8px"><input type="checkbox" id="c-todas" data-c="todas"' + (S.todas ? ' checked' : '') + '>Mostrar também as já recebidas' + (S.ocultas && !S.todas ? ' (' + S.ocultas + ')' : '') + '</label>' +
      '<div id="c-lista" style="max-height:30vh;overflow:auto;margin-top:6px">' + htmlLista() + '</div></div>';
    if (!d) h += '<div class="card"><div class="vazio">Escolha uma despesa acima para registrar o que chegou.</div></div>';
    else h += '<div class="card"><b>2. O que chegou no estoque</b><div class="sb">' + (S.livres ? 'Esta despesa não tem itens informados: escolha os produtos e as quantidades.' : 'Itens de ' + esc(d.fornecedor || 'fornecedor') + '. Deixe a quantidade <b>em branco</b> no que ainda não chegou.') + '</div>' +
      '<div id="c-linhas">' + htmlLinhas() + '</div>' + (S.livres ? '<div class="ft" style="justify-content:flex-start"><button type="button" class="bt s sm" data-c="add">+ Item</button></div>' : '') +
      '<label for="c-obs">Observação</label><input id="c-obs" maxlength="150" value="' + esc(S.obs) + '"></div>';
    h += '<div class="err" id="c-err" aria-live="polite"></div><div class="ft">' +
      (d ? '<button type="button" class="bt s" data-c="encerrar">Encerrar recebimento</button>' : '') +
      '<button type="button" class="bt s" data-c="fechar">Cancelar</button><button type="button" data-c="salvar"' + (d ? '' : ' disabled') + '>Registrar entrada</button></div>';
    corpo(h);
  }
  function mostrarErro(m) { var er = $('c-err'); if (er) er.textContent = m; }
  function validar() {
    var far = S.tipo === 'farmacia', algum = false;
    if (!S.despesaId) return 'Escolha a despesa do Financeiro.';
    var soma = {};
    for (var i = 0; i < S.itens.length; i++) {
      var it = S.itens[i], q = num(it.qtd);
      if (!S.livres && !(q > 0)) continue;
      if (!it.produtoId) return 'Escolha o produto do item ' + (i + 1) + '.';
      if (!(q > 0)) return 'Informe a quantidade do item ' + (i + 1) + '.';
      if (!S.livres && q > it.restante + 0.0005) return 'Quantidade acima do que falta receber de ' + it.desc + ' (falta ' + fq(it.restante) + ').';
      if (far && !it.validade) return 'Informe a validade do item ' + (i + 1) + ' (medicamento).';
      if (exigeLote(it) && !it.lote) return 'Informe o lote do item ' + (i + 1) + ': este produto exige identificação de lote.';
      soma[it.produtoId] = (soma[it.produtoId] || 0) + q; algum = true;
    }
    if (!algum) return 'Informe a quantidade que chegou de ao menos um item.';
    return '';
  }
  function salvar(btn) {
    lerForm();
    var msg = validar(); if (msg) { mostrarErro(msg); return; }
    var d = despDe(S.despesaId) || {}, linhas = S.itens.filter(function (it) { return num(it.qtd) > 0; });
    if (!confirm('Registrar a entrada no estoque ligada à despesa de ' + (d.fornecedor || 'fornecedor') + ' (' + brl(d.valor) + ')?')) return;
    btn.disabled = true; btn.textContent = 'Registrando…';
    rpc('v39_est_purchase_link', { p: { tipo: S.tipo, despesaId: S.despesaId, obs: S.obs,
      itens: linhas.map(function (it) { return { produtoId: it.produtoId, qtd: num(it.qtd), lote: it.lote, validade: it.validade }; }) } })
      .catch(function (e) { throw erro(e); }).then(function (r) {
        fechar(); recarregarEstoque();
        aviso(r.finalizada ? 'Recebimento concluído ✓ A despesa de ' + (r.fornecedor || 'fornecedor') + (r.numero ? ' (' + r.numero + ')' : '') + ' foi finalizada e não aceita novas entradas.'
          : 'Entrada registrada ✓ Ainda falta receber ' + fq(r.restante) + ' (despesa de ' + (r.fornecedor || 'fornecedor') + ').', 9000);
      }).catch(function (e) {
        var t = String(e.message || '');
        if (/exige o n[úu]mero do lote/i.test(t)) { S.itens.forEach(function (it) { if (!it.lote) S.loteObrig[String(it.produtoId)] = true; }); var l = $('c-linhas'); if (l) l.innerHTML = htmlLinhas(); }
        mostrarErro(t); btn.disabled = false; btn.textContent = 'Registrar entrada';
        if (/j[áa] foi (totalmente )?recebid|Atualize a lista/i.test(t)) { carregarDespesas().then(function () { S.despesaId = ''; S.itens = []; pintar(); mostrarErro(t); }).catch(function () { /* mantém */ }); }
      });
  }
  function encerrar(btn) {
    var d = despDe(S.despesaId); if (!d) return;
    var falta = Number(d.pendente || 0), motivo = '';
    if (falta > 0) {
      motivo = prompt('O que falta receber (' + resumoFalta(d) + ') não vai chegar?\nInforme o motivo para encerrar o recebimento (mín. 3 letras):', '');
      if (motivo === null) return; if (motivo.trim().length < 3) return mostrarErro('Informe o motivo (mín. 3 letras).');
    } else if (!confirm('Encerrar o recebimento desta despesa? Ela deixa de aparecer para novas entradas.')) return;
    btn.disabled = true;
    rpc('v39_est_expense_finish', { p_expense: d.id, p_tipo: S.tipo, p_done: true, p_reason: motivo.trim() || null }).catch(function (e) { throw erro(e); })
      .then(function () { S.despesaId = ''; S.itens = []; return carregarDespesas(); })
      .then(function () { pintar(); aviso('Recebimento encerrado. A despesa saiu da lista de pendentes.'); })
      .catch(function (e) { btn.disabled = false; mostrarErro(e.message); });
  }
  function reabrir(id) {
    var d = despDe(id); if (!d || d.finalizacao !== 'manual') return aviso('Só dá para reabrir o que foi encerrado à mão. Recebido 100% fica bloqueado; para receber mais, estorne a entrada.');
    if (!confirm('Reabrir o recebimento desta despesa?')) return;
    rpc('v39_est_expense_finish', { p_expense: id, p_tipo: S.tipo, p_done: false }).catch(function (e) { throw erro(e); })
      .then(function () { return carregarDespesas(); }).then(function () { pintar(); aviso('Recebimento reaberto.'); })
      .catch(function (e) { mostrarErro(e.message); });
  }
  function clique(ev) {
    var b = ev.target.closest && ev.target.closest('[data-c]'); if (!b) return;
    var k = b.getAttribute('data-c'), v = b.getAttribute('data-v');
    if (k === 'fechar') return fechar();
    if (k === 'esc') return escolher(v);
    if (k === 'fin') return reabrir(v);
    if (k === 'add') { lerForm(); S.itens.push({ produtoId: '', qtd: '', lote: '', validade: '' }); return pintar(); }
    if (k === 'rem') { lerForm(); S.itens.splice(+v, 1); return pintar(); }
    if (k === 'salvar') return salvar(b);
    if (k === 'encerrar') return encerrar(b);
  }
  function digita(ev) {
    if (ev.target.getAttribute && ev.target.getAttribute('data-k') === 'busca') { S.busca = ev.target.value; var l = $('c-lista'); if (l) l.innerHTML = htmlLista(); }
  }
  function muda(ev) {
    if (ev.target.id === 'c-todas') {
      lerForm(); S.todas = !!ev.target.checked;
      carregarDespesas().then(function () { pintar(); }).catch(function (e) { mostrarErro(e.message); });
    }
  }

  function instalar() {
    var I = window.G2_INST; if (!I) return false;
    I.abrirCompra = K.abrirCompra; I._compraVersao = VERSAO; return true;
  }
  var tent = 0, tm = setInterval(function () { if (instalar() || ++tent > 60) clearInterval(tm); }, 250);
  instalar();
  K._t = { estado: function () { return S; }, validar: validar };
})();
