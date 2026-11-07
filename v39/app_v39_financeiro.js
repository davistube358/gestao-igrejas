/* 2Gather v39 · Financeiro no Supabase · FIN-1
   Carregar DEPOIS do app.js (e dos demais módulos v39). Não altera o app.js. Requer v39_fin1.sql.
   Na aba "Financeiro" (v39) a tela antiga é substituída por:
   - Resumo do mês: saldo atual, entradas, saídas, resultado; seletor de mês; situação do mês (aberto/fechado)
   - Contas e saldos (início do mês, fim do mês, atual, não conciliados)
   - Livro do mês (filtros por conta, tipo e texto)
   - Fechar mês (Master/Tesouraria) e Reabrir (só Master, com motivo)
   - Cadastros: contas e categorias (com código contábil); formas de pagamento (consulta)
   Lançar entradas/saídas chega no FIN-2/FIN-3. Quem não tem permissão financeira vê só o aviso. */
(function () {
  'use strict';
  var VERSAO = 'FIN-1';
  if (window.G2_FIN) return;
  window.G2_FIN = VERSAO;
  console.info('[2Gather] financeiro ' + VERSAO);

  var hoje = new Date();
  var S = { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1, aba: 'livro', ctx: null, ov: null, cat: null, erro: '', carregando: false,
            fConta: '', fTipo: '', fTexto: '', form: null };
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var TIPO_MOV = { income: 'Entrada', expense: 'Saída', transfer_in: 'Transf. recebida', transfer_out: 'Transf. enviada',
    opening_balance: 'Saldo inicial', adjustment: 'Ajuste', reversal: 'Estorno' };
  var STATUS_MOV = { posted: 'lançado', reconciled: 'conciliado', cancelled: 'cancelado', reversed: 'estornado' };
  var TIPO_CONTA = { checking: 'Conta corrente', savings: 'Poupança', cash: 'Caixa (dinheiro)', pix: 'PIX', digital_wallet: 'Carteira digital', investment: 'Aplicação', other: 'Outra' };
  var NATUREZA = { income: 'Receita', expense: 'Despesa', neutral: 'Neutra' };
  var MSG = { PERMISSION_DENIED: 'Você não tem permissão para esta ação no Financeiro.', PERIOD_CLOSED: 'Este mês está fechado. Correções só por estorno em um mês aberto.',
    PERIOD_NOT_ENDED: 'O mês ainda não terminou.', PERIOD_PREVIOUS_OPEN: 'Feche antes os meses anteriores.', PERIOD_HAS_PENDING: 'Há lançamentos ou lotes pendentes neste mês.',
    PERIOD_NOT_RECONCILED: 'Há lançamentos não conciliados neste mês.', PERIOD_LATER_CLOSED: 'Reabra antes os meses seguintes.', PERIOD_NOT_CLOSED: 'Este mês não está fechado.',
    REASON_REQUIRED: 'Informe o motivo (mínimo 5 letras).', FIN_NAME_REQUIRED: 'Preencha os campos obrigatórios.', FIN_NOT_FOUND: 'Registro não encontrado. Atualize.',
    FIN_STATUS_INVALID: 'Situação inválida.' };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function G() { return window.__gc || null; }
  function cfg() { var g = G(); return (g && g.cfg()) || {}; }
  function v39() { return cfg().token === 'supabase-v39'; }
  function igrejaId() { return (cfg().usuario || {}).igrejaId; }
  function ativo() { return v39() && cfg().aba === 'financeiro'; }
  function brl(v) { var n = Number(v); if (!isFinite(n)) n = 0; return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function dataBr(s) { s = String(s || ''); return s.length >= 10 ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : ''; }
  function pode(c) { return !!(S.ctx && S.ctx.perms && S.ctx.perms.indexOf(c) >= 0); }
  function temAlgo() { return !!(S.ctx && S.ctx.perms && S.ctx.perms.length); }
  function veLivro() { return pode('financial.book.view') || pode('financial.reports.view'); }
  function toast(msg, ms) { var t = $('toast'); if (!t) return; t.textContent = msg; t.style.display = 'block'; clearTimeout(toast._t); toast._t = setTimeout(function () { t.style.display = 'none'; }, ms || 3500); }
  function traduz(e) {
    var t = String((e && (e.details || e.message || e.code)) || e || '');
    for (var k in MSG) if (t.indexOf(k) >= 0) return MSG[k];
    if (/PGRST202|find the function/i.test(t)) return 'Financeiro ainda não ativado: rode o v39_fin1.sql no Supabase.';
    return 'Não foi possível concluir. Tente novamente.';
  }
  function rpc(nome, args) {
    var V = window.G2_V39 || {};
    var pr = (!V.client && typeof V.init === 'function') ? Promise.resolve(V.init()) : Promise.resolve();
    return pr.then(function () { if (!V.client) throw new Error('Sem conexão com o servidor.'); var b = V.client.schema('app'); return (b.__rpcOriginal || b.rpc).call(b, nome, args || {}); })
      .then(function (r) { if (r.error) throw r.error; return r.data; });
  }

  /* ── dados ── */
  function carregar() {
    if (S.carregando) return; S.carregando = true; S.erro = ''; pintar();
    var c = igrejaId();
    rpc('v39_fin_context', { p_church_id: c }).then(function (ctx) {
      S.ctx = ctx || { perms: [] };
      if (!temAlgo()) return null;
      return Promise.all([
        veLivro() ? rpc('v39_fin_overview', { p_church_id: c, p_year: S.ano, p_month: S.mes }) : null,
        rpc('v39_fin_catalogs', { p_church_id: c })
      ]).then(function (r) { S.ov = r[0]; S.cat = r[1]; if (!veLivro() && S.aba !== 'cadastros') S.aba = 'cadastros'; });
    }).catch(function (e) { S.erro = traduz(e); console.warn('[2Gather][fin]', e); })
      .then(function () { S.carregando = false; S.tempo = Date.now(); pintar(); });
  }
  function recarregarMes() {
    if (!veLivro()) return;
    S.carregando = true; pintar();
    rpc('v39_fin_overview', { p_church_id: igrejaId(), p_year: S.ano, p_month: S.mes })
      .then(function (o) { S.ov = o; }, function (e) { toast(traduz(e), 5000); })
      .then(function () { S.carregando = false; pintar(); });
  }

  /* ── telas ── */
  function cardNum(rot, val, cor) {
    return '<div class="card" style="flex:1 1 140px;margin:0"><div style="font-size:11.5px;color:var(--tx3);font-weight:600;text-transform:uppercase">' + rot +
      '</div><div style="font-size:19px;font-weight:800;margin-top:4px;' + (cor ? 'color:' + cor : '') + '">' + val + '</div></div>';
  }
  function hdrMes() {
    var p = S.ov && S.ov.periodo, fechado = p && p.status === 'closed';
    var anoMax = hoje.getFullYear(), opsMes = MESES.map(function (m, i) { return '<option value="' + (i + 1) + '"' + (i + 1 === S.mes ? ' selected' : '') + '>' + m + '</option>'; }).join('');
    var opsAno = ''; for (var a = anoMax; a >= anoMax - 6; a--) opsAno += '<option' + (a === S.ano ? ' selected' : '') + '>' + a + '</option>';
    return '<div class="card g2f-mes" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">' +
      '<button type="button" class="btn gh sm" data-f="mesAnt" aria-label="Mês anterior">‹</button>' +
      '<label class="g2f-sr" for="g2f-m">Mês</label><select id="g2f-m" data-fc="mes" style="width:auto">' + opsMes + '</select>' +
      '<label class="g2f-sr" for="g2f-a">Ano</label><select id="g2f-a" data-fc="ano" style="width:auto">' + opsAno + '</select>' +
      '<button type="button" class="btn gh sm" data-f="mesProx" aria-label="Próximo mês">›</button>' +
      '<span class="pill ' + (fechado ? 'p-cinza' : 'p-verde') + '" style="margin-left:auto">' + (fechado ? '🔒 mês fechado em ' + dataBr(p.fechadoEm) : 'mês aberto') + '</span>' +
      (fechado ? (S.ctx.podeReabrir ? '<button type="button" class="btn gh sm" data-f="reabrir">Reabrir</button>' : '')
               : (S.ctx.podeFechar ? '<button type="button" class="btn pr sm" data-f="fechar">Fechar mês</button>' : '')) + '</div>';
  }
  function telaResumo() {
    var o = S.ov || {}, t = o.totais || {}, contas = o.contas || [];
    var saldo = contas.reduce(function (a, c) { return a + Number(c.saldoAtual || 0); }, 0);
    var res = Number(t.resultado || 0);
    var h = hdrMes() + '<div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0">' +
      cardNum('Saldo atual (todas as contas)', brl(saldo)) + cardNum('Entradas no mês', brl(t.entradas), '#15803d') +
      cardNum('Saídas no mês', brl(t.saidas), '#b91c1c') + cardNum('Resultado do mês', brl(res), res < 0 ? '#b91c1c' : '#15803d') + '</div>';
    h += '<div class="sec">Contas e saldos</div>';
    h += contas.length ? '<div class="card" style="overflow-x:auto"><table class="g2f-tab"><thead><tr><th>Conta</th><th>Início do mês</th><th>Fim do mês</th><th>Atual</th><th>Não conciliados</th></tr></thead><tbody>' +
      contas.map(function (c) {
        return '<tr><td><b>' + esc(c.nome) + '</b><br><span class="g2f-dim">' + esc(TIPO_CONTA[c.tipo] || c.tipo) + (c.status !== 'active' ? ' · ' + esc(c.status) : '') + '</span></td>' +
          '<td>' + brl(c.saldoInicioMes) + '</td><td>' + brl(c.saldoFimMes) + '</td><td><b>' + brl(c.saldoAtual) + '</b></td>' +
          '<td>' + (c.naoConciliados ? '<span class="pill p-amarelo">' + c.naoConciliados + '</span>' : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>'
      : '<div class="card"><div class="empty">Nenhuma conta cadastrada.' + (pode('financial.accounts.manage') ? ' Cadastre em <b>Cadastros</b>.' : '') + '</div></div>';
    return h;
  }
  function telaLivro() {
    var o = S.ov || {}, l = o.livro || [], txt = S.fTexto.toLowerCase();
    var f = l.filter(function (m) {
      return (!S.fConta || m.conta === S.fConta) && (!S.fTipo || m.tipo === S.fTipo) &&
        (!txt || (String(m.descricao) + ' ' + m.categoria + ' ' + m.pessoa).toLowerCase().indexOf(txt) >= 0);
    });
    var contas = []; l.forEach(function (m) { if (contas.indexOf(m.conta) < 0) contas.push(m.conta); });
    var h = telaResumo() + '<div class="sec">Livro do mês · ' + MESES[S.mes - 1] + ' de ' + S.ano + '</div>' +
      '<div class="card" style="display:flex;flex-wrap:wrap;gap:8px">' +
      '<label class="g2f-sr" for="g2f-fc">Conta</label><select id="g2f-fc" data-fc="fConta" style="flex:1 1 140px"><option value="">Todas as contas</option>' +
        contas.map(function (c) { return '<option' + (c === S.fConta ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<label class="g2f-sr" for="g2f-ft">Tipo</label><select id="g2f-ft" data-fc="fTipo" style="flex:1 1 140px"><option value="">Todos os tipos</option>' +
        Object.keys(TIPO_MOV).map(function (k) { return '<option value="' + k + '"' + (k === S.fTipo ? ' selected' : '') + '>' + TIPO_MOV[k] + '</option>'; }).join('') + '</select>' +
      '<label class="g2f-sr" for="g2f-fx">Buscar</label><input id="g2f-fx" data-fc="fTexto" placeholder="Buscar descrição, categoria ou pessoa" value="' + esc(S.fTexto) + '" style="flex:2 1 200px"></div>';
    h += f.length ? '<div class="card" style="overflow-x:auto"><table class="g2f-tab"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Conta</th><th style="text-align:right">Valor</th><th>Situação</th></tr></thead><tbody>' +
      f.map(function (m) {
        var sinal = Number(m.efeitoCaixa) < 0 ? -1 : 1, cor = Number(m.efeitoCaixa) < 0 ? '#b91c1c' : Number(m.efeitoCaixa) > 0 ? '#15803d' : 'inherit';
        return '<tr' + (m.status === 'cancelled' || m.status === 'reversed' ? ' class="g2f-off"' : '') + '><td>' + dataBr(m.data) + '</td>' +
          '<td>' + esc(m.descricao) + '<br><span class="g2f-dim">' + esc(TIPO_MOV[m.tipo] || m.tipo) + (m.pessoa ? ' · ' + esc(m.pessoa) : '') + (m.forma ? ' · ' + esc(m.forma) : '') + (m.comprovante ? ' · 📎' : '') + '</span></td>' +
          '<td>' + esc(m.categoria) + '</td><td>' + esc(m.conta) + '</td>' +
          '<td style="text-align:right;white-space:nowrap;color:' + cor + '">' + (sinal < 0 ? '− ' : '') + brl(m.valor) + '</td>' +
          '<td><span class="g2f-dim">' + esc(STATUS_MOV[m.status] || m.status) + '</span></td></tr>';
      }).join('') + '</tbody></table>' + (l.length >= 1000 ? '<div class="g2f-dim" style="margin-top:6px">Mostrando os 1.000 lançamentos mais recentes do mês.</div>' : '') + '</div>'
      : '<div class="card"><div class="empty">Nenhum lançamento ' + (l.length ? 'com estes filtros' : 'neste mês') + '.</div></div>';
    return h;
  }
  function telaCadastros() {
    var c = S.cat || {}, contas = c.contas || [], cats = c.categorias || [], formas = c.formas || [];
    var mc = pode('financial.accounts.manage'), mk = pode('financial.categories.manage');
    var h = '<div class="sec sec-l"><span>Contas</span>' + (mc ? '<button type="button" class="btn pr sm" data-f="novaConta">+ Conta</button>' : '') + '</div>';
    h += contas.length ? contas.map(function (a) {
      return '<div class="card"><div style="display:flex;gap:8px;align-items:center"><div style="flex:1"><b>' + esc(a.nome) + '</b><br><span class="g2f-dim">' +
        esc(TIPO_CONTA[a.tipo] || a.tipo) + (a.banco ? ' · ' + esc(a.banco) : '') + (a.status !== 'active' ? ' · ' + esc(a.status) : '') + '</span></div>' +
        (mc && a.status !== 'closed' ? '<button type="button" class="btn gh sm" data-f="editarConta" data-v="' + esc(a.id) + '">Editar</button>' : '') + '</div></div>';
    }).join('') : '<div class="card"><div class="empty">Nenhuma conta.</div></div>';
    h += '<div class="sec sec-l"><span>Categorias</span>' + (mk ? '<button type="button" class="btn pr sm" data-f="novaCat">+ Categoria</button>' : '') + '</div>';
    h += cats.length ? '<div class="card" style="overflow-x:auto"><table class="g2f-tab"><thead><tr><th>Código</th><th>Nome</th><th>Natureza</th><th>Cód. contábil</th><th></th></tr></thead><tbody>' +
      cats.map(function (k) {
        return '<tr' + (k.ativa ? '' : ' class="g2f-off"') + '><td>' + esc(k.codigo) + '</td><td>' + esc(k.nome) + (k.sistema ? ' <span class="g2f-dim">(padrão)</span>' : '') + '</td>' +
          '<td>' + esc(NATUREZA[k.natureza] || k.natureza) + '</td><td>' + esc(k.contabil || '—') + '</td>' +
          '<td>' + (mk ? '<button type="button" class="btn gh sm" data-f="editarCat" data-v="' + esc(k.id) + '">Editar</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="card"><div class="empty">Nenhuma categoria.</div></div>';
    h += '<div class="sec">Formas de pagamento</div><div class="card">' + (formas.length ? formas.map(function (f) {
      return '<span class="pill ' + (f.ativa ? 'p-cinza' : '') + '" style="margin:2px">' + esc(f.nome) + '</span>'; }).join('') : '<div class="empty">Nenhuma forma.</div>') + '</div>';
    return h;
  }
  function formHtml() {
    var f = S.form; if (!f) return '';
    var d = f.dados || {};
    function inp(id, rot, val, extra) { return '<label for="g2f-' + id + '">' + rot + '</label><input id="g2f-' + id + '" value="' + esc(val) + '"' + (extra || '') + '>'; }
    function sel(id, rot, mapa, val) { return '<label for="g2f-' + id + '">' + rot + '</label><select id="g2f-' + id + '">' +
      Object.keys(mapa).map(function (k) { return '<option value="' + k + '"' + (k === val ? ' selected' : '') + '>' + esc(mapa[k]) + '</option>'; }).join('') + '</select>'; }
    var h = '<div class="card g2f-form" role="dialog" aria-label="' + esc(f.titulo) + '"><div style="font-weight:800;margin-bottom:6px">' + esc(f.titulo) + '</div>';
    if (f.tipo === 'conta') {
      h += inp('nome', 'Nome *', d.nome, ' maxlength="80" placeholder="Ex.: Conta Banco do Brasil"') + sel('tipo', 'Tipo', TIPO_CONTA, d.tipo || 'checking') +
        inp('banco', 'Banco / instituição', d.banco) + inp('agencia', 'Agência', d.agencia) + inp('numero', 'Número da conta', d.numero) +
        inp('pix', 'Chave PIX', d.pix) + inp('abertaEm', 'Aberta em', d.abertaEm, ' type="date"') +
        sel('status', 'Situação', { active: 'Ativa', inactive: 'Inativa' }, d.status || 'active') + inp('obs', 'Observação', d.obs);
    } else {
      var sistema = !!d.sistema;
      h += (sistema ? '<div class="aviso" style="font-size:12.5px">Categoria padrão do sistema: só o código contábil pode ser ajustado.</div>' : '') +
        inp('codigo', 'Código *', d.codigo, sistema ? ' disabled' : ' maxlength="20" placeholder="Ex.: REC-DIZ"') +
        inp('nome', 'Nome *', d.nome, sistema ? ' disabled' : ' maxlength="80"') +
        (sistema ? '' : sel('natureza', 'Natureza', NATUREZA, d.natureza || 'expense')) +
        inp('contabil', 'Código no plano de contas do contador', d.contabil, ' maxlength="30" placeholder="Ex.: 3.1.01"') +
        (sistema ? '' : inp('descricao', 'Descrição', d.descricao) + sel('ativa', 'Situação', { 'true': 'Ativa', 'false': 'Inativa' }, String(d.ativa !== false)));
    }
    return h + '<div class="acoes" style="margin-top:10px"><button type="button" class="btn pr" data-f="salvarForm">Salvar</button>' +
      '<button type="button" class="btn gh" data-f="cancelarForm">Cancelar</button></div></div>';
  }
  var CSS = '#g2f .g2f-tab{width:100%;border-collapse:collapse;font-size:13px}#g2f .g2f-tab th{text-align:left;font-size:11.5px;color:var(--tx3);font-weight:700;padding:6px;border-bottom:1px solid rgba(127,127,127,.25)}' +
    '#g2f .g2f-tab td{padding:7px 6px;border-bottom:1px solid rgba(127,127,127,.12);vertical-align:top}#g2f .g2f-dim{font-size:11.5px;color:var(--tx3)}#g2f .g2f-off{opacity:.5}' +
    '#g2f .g2f-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}#g2f .g2f-form label{display:block;margin-top:8px}' +
    '#g2f button:focus-visible,#g2f select:focus-visible,#g2f input:focus-visible{outline:2px solid #0E7C7B;outline-offset:2px}';
  function pintar() {
    var main = $('main'); if (!main || !ativo()) return;
    if (!$('g2f-css')) { var st = document.createElement('style'); st.id = 'g2f-css'; st.textContent = CSS; document.head.appendChild(st); }
    var raiz = $('g2f'); if (!raiz) { main.innerHTML = '<div id="g2f"></div>'; raiz = $('g2f'); }
    var foco = document.activeElement && document.activeElement.id, pos = foco && document.activeElement.selectionStart;
    var h;
    if (S.carregando && !S.ctx) h = '<div class="empty">Carregando o Financeiro...</div>';
    else if (S.erro) h = '<div class="card"><div class="empty">' + esc(S.erro) + '</div><button type="button" class="btn gh sm" data-f="recarregar">Tentar de novo</button></div>';
    else if (!temAlgo()) h = '<div class="card"><div class="empty">Seu perfil não tem acesso ao Financeiro. Fale com o Master ou a Tesouraria.</div></div>';
    else {
      var abas = (veLivro() ? [['livro', 'Livro e saldos']] : []).concat([['cadastros', 'Cadastros']]);
      h = '<div class="chips" role="tablist">' + abas.map(function (a) {
        return '<button type="button" role="tab" aria-selected="' + (S.aba === a[0]) + '" data-f="aba" data-v="' + a[0] + '" class="' + (S.aba === a[0] ? 'on' : '') + '">' + a[1] + '</button>'; }).join('') +
        '<button type="button" data-f="recarregar" aria-label="Atualizar">↻</button></div>' +
        (S.carregando ? '<div class="g2f-dim" aria-live="polite">Atualizando...</div>' : '') + formHtml() +
        (S.aba === 'cadastros' ? telaCadastros() : telaLivro());
    }
    raiz.innerHTML = h;
    if (foco && $(foco)) { $(foco).focus(); try { if (pos != null) $(foco).setSelectionRange(pos, pos); } catch (e) {} }
  }

  /* ── ações ── */
  function salvarForm() {
    var f = S.form; if (!f) return;
    function v(id) { var e = $('g2f-' + id); return e ? String(e.value || '').trim() : ''; }
    var p, nome;
    if (f.tipo === 'conta') {
      p = { nome: v('nome'), tipo: v('tipo'), banco: v('banco'), agencia: v('agencia'), numero: v('numero'), pix: v('pix'), abertaEm: v('abertaEm'), status: v('status'), obs: v('obs') };
      if (!p.nome) return toast('Informe o nome da conta.'); nome = 'v39_fin_save_account';
    } else {
      var d = f.dados || {};
      p = d.sistema ? { codigo: d.codigo, nome: d.nome, contabil: v('contabil') }
        : { codigo: v('codigo'), nome: v('nome'), natureza: v('natureza'), contabil: v('contabil'), descricao: v('descricao'), ativa: v('ativa') === 'true' };
      if (!p.codigo || !p.nome) return toast('Informe código e nome.'); nome = 'v39_fin_save_category';
    }
    S.carregando = true; pintar();
    rpc(nome, { p_church_id: igrejaId(), p_id: f.id || null, p_payload: p })
      .then(function (cat) { S.cat = cat; S.form = null; toast('Salvo ✓'); if (veLivro()) recarregarMes(); },
            function (e) { toast(traduz(e), 5000); })
      .then(function () { S.carregando = false; pintar(); });
  }
  function fechar() {
    var nome = MESES[S.mes - 1] + '/' + S.ano;
    if (!confirm('Fechar ' + nome + '?\n\nDepois de fechado, nada deste mês pode ser lançado ou alterado. Correções só por estorno em um mês aberto.')) return;
    var obs = prompt('Observação do fechamento (opcional):', '') || '';
    S.carregando = true; pintar();
    rpc('v39_fin_close_period', { p_church_id: igrejaId(), p_year: S.ano, p_month: S.mes, p_notes: obs })
      .then(function (o) { S.ov = o; toast('Mês fechado ✓'); }, function (e) { toast(traduz(e), 6000); })
      .then(function () { S.carregando = false; pintar(); });
  }
  function reabrir() {
    var m = prompt('Motivo para reabrir ' + MESES[S.mes - 1] + '/' + S.ano + ' (fica registrado):', '');
    if (m == null) return; if (m.trim().length < 5) return toast(MSG.REASON_REQUIRED);
    S.carregando = true; pintar();
    rpc('v39_fin_reopen_period', { p_church_id: igrejaId(), p_year: S.ano, p_month: S.mes, p_reason: m.trim() })
      .then(function (o) { S.ov = o; toast('Mês reaberto'); }, function (e) { toast(traduz(e), 6000); })
      .then(function () { S.carregando = false; pintar(); });
  }
  function mudarMes(d) { var m = S.mes + d, a = S.ano; if (m < 1) { m = 12; a--; } if (m > 12) { m = 1; a++; } S.mes = m; S.ano = a; recarregarMes(); }
  function achar(lista, id) { for (var i = 0; i < (lista || []).length; i++) if (lista[i].id === id) return lista[i]; return null; }

  document.addEventListener('click', function (ev) {
    var b = ev.target && ev.target.closest ? ev.target.closest('#g2f [data-f]') : null; if (!b) return;
    ev.preventDefault();
    var a = b.getAttribute('data-f'), v = b.getAttribute('data-v');
    if (a === 'aba') { S.aba = v; pintar(); }
    else if (a === 'recarregar') carregar();
    else if (a === 'mesAnt') mudarMes(-1);
    else if (a === 'mesProx') mudarMes(1);
    else if (a === 'fechar') fechar();
    else if (a === 'reabrir') reabrir();
    else if (a === 'novaConta') { S.form = { tipo: 'conta', titulo: 'Nova conta', dados: {} }; pintar(); }
    else if (a === 'editarConta') { S.form = { tipo: 'conta', titulo: 'Editar conta', id: v, dados: achar(S.cat.contas, v) || {} }; pintar(); }
    else if (a === 'novaCat') { S.form = { tipo: 'cat', titulo: 'Nova categoria', dados: {} }; pintar(); }
    else if (a === 'editarCat') { S.form = { tipo: 'cat', titulo: 'Editar categoria', id: v, dados: achar(S.cat.categorias, v) || {} }; pintar(); }
    else if (a === 'salvarForm') salvarForm();
    else if (a === 'cancelarForm') { S.form = null; pintar(); }
    if (S.form && /novaConta|editarConta|novaCat|editarCat/.test(a)) { var fm = document.querySelector('#g2f .g2f-form input:not([disabled])'); if (fm) fm.focus(); }
  });
  document.addEventListener('change', function (ev) {
    var e = ev.target; if (!e || !e.closest || !e.closest('#g2f')) return;
    var k = e.getAttribute('data-fc'); if (!k) return;
    if (k === 'mes' || k === 'ano') { S[k] = parseInt(e.value, 10) || S[k]; recarregarMes(); }
    else if (k === 'fConta' || k === 'fTipo') { S[k] = e.value; pintar(); }
  });
  document.addEventListener('input', function (ev) {
    var e = ev.target; if (!e || e.id !== 'g2f-fx') return;
    S.fTexto = e.value.slice(0, 80); clearTimeout(S._t); S._t = setTimeout(pintar, 250);
  });

  /* ── assume a aba Financeiro no v39 ── */
  function verificar() {
    if (!ativo()) return;
    var main = $('main'); if (!main || $('g2f')) return;
    pintar();
    if (!S.ctx || !S.tempo || Date.now() - S.tempo > 120000) carregar();
  }
  function observar() {
    var main = $('main'); if (!main) return setTimeout(observar, 300);
    var agendado = false;
    new MutationObserver(function () { if (agendado) return; agendado = true; requestAnimationFrame(function () { agendado = false; verificar(); }); })
      .observe(main, { childList: true });
    verificar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observar); else observar();
})();
