/* 2Gather v39 · Financeiro completo · FIN-ALL-6
   Substitui o app_v39_financeiro.js (FIN-ALL-1 a 5): no index.html deixe só este arquivo.
   Carregar DEPOIS do app.js e dos módulos v39. Não altera o app.js.
   Requer: v39_financeiro_completo.sql e v39_campanhas_equipe_c2.sql no Supabase (nada novo no SQL nesta versão).

   FIN-ALL-6
   - Campanha: meta, já recebido, FALTA PARA A META e a receber dos acordos, em destaque (antes ficava numa linha pequena).
   - Nova entrada: o tipo "Recebimento de campanha ou voto" aparece uma única vez (a categoria de mesmo nome do banco é ocultada);
     um só botão "Registrar entrada".
   - Painel do Financeiro: sem os botões de acesso rápido e sem o "consolidado anterior". No lugar, o dashboard do Livro:
     entradas × saídas mês a mês, fluxo do mês por dia, de onde vem e para onde vai, saldo por conta, campanhas e últimos lançamentos.
   - Tela que "atualizava sozinha": quando o app redesenha a área principal (sincronização), o Livro e o painel voltam NA HORA do
     que já estava na tela, sem buscar tudo de novo no servidor. */
(function () {
  'use strict';
  var VERSAO = 'FIN-ALL-6';
  if (window.G2_FIN) return;
  window.G2_FIN = { versao: VERSAO };
  console.info('[2Gather] financeiro ' + VERSAO);

  /* ───────────── utilidades ───────────── */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function G() { return window.__gc || null; }
  function cfg() { var g = G(); try { return (g && g.cfg && g.cfg()) || {}; } catch (e) { return {}; } }
  function eu() { return cfg().usuario || {}; }
  function igrejaId() {
    var V = window.G2_V39 || {};
    if (V.churchContext && typeof V.churchContext.ensure === 'function') { try { var c = V.churchContext.ensure(); if (c) return c; } catch (e) { /* segue */ } }
    return eu().igrejaId || null;
  }
  function v39() { return cfg().token === 'supabase-v39'; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoD(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function hoje() { return isoD(new Date()); }
  function addDias(iso, n) { var p = String(iso).split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + n); return isoD(d); }
  function difDias(a, b) { var x = String(a).split('-'), y = String(b).split('-'); return Math.round((new Date(+y[0], +y[1] - 1, +y[2]) - new Date(+x[0], +x[1] - 1, +x[2])) / 864e5); }
  function dataBR(s) { if (!s) return ''; var p = String(s).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(s); }
  function dataCurta(s) { var p = String(s).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] : ''; }
  var DSEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  function dataDia(s) { var p = String(s).slice(0, 10).split('-'); if (p.length !== 3) return ''; var d = new Date(+p[0], +p[1] - 1, +p[2]); return DSEM[d.getDay()] + ', ' + p[2] + '/' + p[1]; }
  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function arr2(v) { return Math.round(num(v) * 100) / 100; }
  function brl(v) { return num(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function brlK(v) { v = num(v); var a = Math.abs(v); return a >= 1000000 ? (v / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi' : a >= 10000 ? (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil' : brl(v); }
  function lerValor(s) {
    s = String(s == null ? '' : s).trim().replace(/[R$\s]/g, '');
    if (!s) return null;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    var v = Number(s); return isFinite(v) ? Math.round(v * 100) / 100 : null;
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
  function primeiro(n) { return String(n || '').trim().split(' ')[0]; }
  function iniciais(n) { var p = String(n || '').trim().split(/\s+/); return ((p[0] || '').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase() || '?'; }
  var MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  var MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  /* ───────────── ícones ───────────── */
  var IC = {
    plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M20 6L9 17l-5-5"/>',
    checkc: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>', x: '<path d="M18 6L6 18M6 6l12 12"/>',
    xc: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>', ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    clip: '<path d="M21 12.5l-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l9-9a3.7 3.7 0 0 1 5.2 5.2l-9 9a1.8 1.8 0 0 1-2.6-2.6l8.3-8.3"/>',
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>', down: '<path d="M12 5v14M5 12l7 7 7-7"/>', up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    swap: '<path d="M7 7h13l-4-4M17 17H4l4 4"/>', cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    chat: '<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.3L3 20l1.3-5A8.5 8.5 0 1 1 21 11.5z"/>', send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
    cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    dl: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>', lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>', chevl: '<path d="M15 18l-6-6 6-6"/>', chevr: '<path d="M9 18l6-6-6-6"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
    receipt: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>', card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    scale: '<path d="M12 3v18M5 7h14"/><path d="M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>', flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>', chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    userplus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>', wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2z"/><path d="M16 14h.01"/>',
    bank: '<path d="M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M2 10l10-7 10 7z"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', repeat: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    dot: '<circle cx="12" cy="12" r="2"/>', tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><path d="M7 7h.01"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>'
  };
  function ic(n, sz) { return '<svg class="g2f-svg" viewBox="0 0 24 24" aria-hidden="true"' + (sz ? ' style="width:' + sz + 'px;height:' + sz + 'px"' : '') + '>' + (IC[n] || IC.dot) + '</svg>'; }

  var ROT = {
    mov: { income: 'Entrada', expense: 'Saída', transfer_in: 'Transferência (entrada)', transfer_out: 'Transferência (saída)', opening_balance: 'Saldo inicial', adjustment: 'Ajuste', reversal: 'Estorno' },
    movSt: { draft: 'Rascunho', posted: 'Lançado', reconciled: 'Conciliado', reversed: 'Estornado', cancelled: 'Cancelado' },
    desp: { draft: 'Rascunho', pending_approval: 'Aguardando aprovação', correction_requested: 'Correção pedida', approved: 'Aprovada', partially_paid: 'Paga em parte', paid: 'Paga', rejected: 'Recusada', cancelled: 'Cancelada', reversed: 'Estornada' },
    conta: { checking: 'Conta corrente', savings: 'Poupança', cash: 'Caixa (dinheiro)', pix: 'PIX', digital_wallet: 'Carteira digital', investment: 'Investimento', other: 'Outra' },
    nat: { income: 'Entrada', expense: 'Saída', neutral: 'Neutra' },
    comp: { draft: 'Rascunho', active: 'Em dia', due_soon: 'Vence logo', overdue: 'Atrasado', paid: 'Quitado', cancelled: 'Cancelado' },
    fat: { open: 'Aberta', closed: 'Fechada', partially_paid: 'Paga em parte', paid: 'Paga', cancelled: 'Cancelada' },
    lote: { draft: 'Rascunho', submitted: 'Enviado', posted: 'Lançado', reversed: 'Estornado', cancelled: 'Cancelado' },
    camp: { draft: 'Rascunho', planned: 'Planejada', active: 'Ativa', completed: 'Concluída', cancelled: 'Cancelada' },
    campTipo: { campaign: 'Campanha', vow: 'Voto', project: 'Projeto', fundraising: 'Arrecadação', other: 'Outra' },
    rec: { monthly: 'Mensal', quarterly: 'Trimestral', semiannual: 'Semestral', annual: 'Anual' }
  };
  var MSG = {
    PERMISSION_DENIED: 'Você não tem permissão para esta ação.', TREASURY_ONLY: 'Somente a Tesouraria (ou o Master) faz este lançamento.',
    FIN_START_REQUIRED: 'Defina primeiro a data de início do Financeiro (Cadastros).', FIN_START_LOCKED: 'Já existem lançamentos: a data de início não pode mais mudar.',
    FIN_BEFORE_START: 'A data é anterior ao início do Financeiro.', FIN_FUTURE_DATE: 'A data está no futuro.', FIN_DATE_REQUIRED: 'Informe uma data válida.',
    PERIOD_CLOSED: 'Este mês está fechado. Corrija por estorno em um mês aberto.', PERIOD_NOT_ENDED: 'O mês ainda não terminou.',
    PERIOD_PREVIOUS_OPEN: 'Feche antes os meses anteriores.', PERIOD_HAS_PENDING: 'Há lançamentos ou lotes pendentes neste mês.',
    PERIOD_NOT_RECONCILED: 'Há lançamentos não conciliados neste mês.', PERIOD_LATER_CLOSED: 'Reabra antes os meses seguintes.',
    PERIOD_NOT_CLOSED: 'Este mês não está fechado.', PERIOD_INVALID: 'Período inválido.', FIN_EVIDENCE_REQUIRED: 'Anexe o comprovante.',
    FIN_EVIDENCE_INVALID: 'O comprovante não foi encontrado. Envie o arquivo de novo.', FIN_EVIDENCE_SETUP: 'Comprovante sem registro oficial no banco. Avise o administrador.',
    FIN_AMOUNT_INVALID: 'Valor inválido.', FIN_ACCOUNT_INVALID: 'Escolha uma conta ativa (origem e destino diferentes).',
    FIN_CATEGORY_INVALID: 'Escolha uma categoria válida para este lançamento.', FIN_METHOD_INVALID: 'Escolha a forma de pagamento/recebimento.',
    FIN_PERSON_INVALID: 'Escolha a pessoa na lista.', FIN_NAME_REQUIRED: 'Preencha os campos obrigatórios.', FIN_STATUS_INVALID: 'Situação inválida.',
    FIN_NOT_FOUND: 'Registro não encontrado. Atualize a tela.', FIN_NOT_EDITABLE: 'Este registro não pode mais ser alterado.',
    FIN_NOT_REVERSIBLE: 'Este lançamento não pode ser estornado.', FIN_REVERSE_AT_ORIGIN: 'Estorne pela tela de origem (despesa, campanha, lote ou transferência).',
    FIN_NOT_APPROVED: 'A despesa ainda não foi aprovada.', FIN_NOT_PENDING: 'A despesa não está aguardando aprovação.',
    FIN_SELF_APPROVAL: 'Quem solicitou não pode decidir o próprio pedido.', FIN_OPENING_EXISTS: 'Esta conta já tem saldo inicial.',
    FIN_CARD_INVALID: 'Confira os dados do cartão.', FIN_SOURCE_INVALID: 'Origem inválida.', FIN_SOURCE_DONE: 'Este encontro/culto já foi lançado no Livro.',
    FIN_MATCH_INVALID: 'O lançamento tem conta ou valor diferente da linha do extrato.', FIN_IMPORT_INVALID: 'Arquivo de extrato inválido ou muito grande.',
    FIN_SCHEDULE_SUM: 'A soma das parcelas precisa ser igual ao valor total.', FIN_SCHEDULE_LOCKED: 'Já há recebimento: as datas não podem mais mudar.',
    FIN_SCHEDULE_INVALID: 'Confira as datas e os valores das parcelas.', REASON_REQUIRED: 'Informe o motivo (mínimo 5 letras).'
  };
  function traduz(e) {
    var t = String((e && (e.message || e.details || e.hint || e.code)) || e || '');
    var d = String((e && e.details) || '');
    for (var k in MSG) if (t.indexOf(k) >= 0 || d === k) return MSG[k];
    if (/PGRST202|find the function|does not exist/i.test(t)) return 'Falta rodar o SQL novo no Supabase (v39_campanhas_equipe_c2.sql).';
    if (/JWT|token|401/i.test(t)) return 'Sua sessão expirou. Entre de novo.';
    if (/Failed to fetch|NetworkError/i.test(t)) return 'Sem conexão. Tente novamente.';
    var m = t.match(/^[A-Z_]+:\s*(.+)$/); if (m) return m[1];
    if (e && (e.code === 'P0001' || !e.code) && /[a-zà-ú ]{12,}/i.test(t) && !/[{}()]|function|column|relation|syntax|violates/i.test(t)) return t.charAt(0).toUpperCase() + t.slice(1);
    return 'Não foi possível concluir. Tente novamente.';
  }
  function toast(msg, ms) {
    var t = $('g2f-toast');
    if (!t) { t = document.createElement('div'); t.id = 'g2f-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.style.display = 'block'; clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.style.display = 'none'; }, ms || 4500);
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
  function C(extra) { var a = { p_church_id: igrejaId() }; for (var k in extra) a[k] = extra[k]; return a; }

  /* ───────────── estado ───────────── */
  var S = { ctx: null, cat: null, aberto: false, aba: 'livro', ano: new Date().getFullYear(), mes: new Date().getMonth() + 1, ov: null,
    despFiltro: 'abertas', concConta: '', relMes: true, livroFiltro: 'tudo', livroBusca: '', cache: null };
  var CAMPS = [], SENT = null;
  function pode(p) { return !!(S.ctx && S.ctx.perms && S.ctx.perms.indexOf(p) >= 0); }
  function algum() { return !!(S.ctx && S.ctx.perms && S.ctx.perms.length); }
  function tes() { return !!(S.ctx && S.ctx.tesouraria); }

  /* ───────────── estilo: usa as classes do próprio app (.card, .row, .chips, .stats…) ───────────── */
  function css() {
    if ($('g2f-css')) return;
    var s = document.createElement('style'); s.id = 'g2f-css';
    s.textContent = [
      '.g2f-oculto{display:none!important}',
      '#g2fin *,#g2f-dash *{box-sizing:border-box}',
      '.g2f-svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:0 0 auto}',
      '.g2f-head{display:flex;align-items:center;gap:12px;margin:2px 0 14px}',
      '.g2f-head .ini-ola{margin:0}.g2f-head .ini-sub{margin:2px 0 0}',
      '.g2f-back{flex:0 0 38px;width:38px;height:38px;border:none;border-radius:12px;background:#fff;box-shadow:0 1px 2px rgba(20,22,26,.06);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--tx,#14161A)}',
      '.g2f-tabs button{display:inline-flex;align-items:center;gap:6px}.g2f-tabs button .g2f-svg{width:15px;height:15px}',
      '.g2f-per{display:flex;align-items:center;gap:8px;background:#fff;border-radius:16px;padding:5px;margin-bottom:12px;box-shadow:0 1px 2px rgba(20,22,26,.05)}',
      '.g2f-per b{flex:1;text-align:center;font-size:14px}',
      '.g2f-per button{width:36px;height:36px;border:none;border-radius:12px;background:var(--bg,#F6F7F9);color:var(--tx,#14161A);display:flex;align-items:center;justify-content:center;cursor:pointer}',
      '.g2f-per .g2f-hoje{width:auto;padding:0 12px;font-size:12px;font-weight:700;font-family:inherit}',
      '.g2f-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:38px;padding:0 15px;border:none;border-radius:12px;background:var(--tx,#14161A);color:#fff;font-weight:700;font-size:13px;font-family:inherit;line-height:1;cursor:pointer;white-space:nowrap}',
      '.g2f-btn .g2f-svg{width:16px;height:16px}',
      '.g2f-btn.g2f-soft{background:#EEF0F4;color:var(--tx,#14161A)}.g2f-btn.g2f-acc{background:var(--pri,#2F5BEA);color:#fff}',
      '.g2f-btn.g2f-sm{height:32px;padding:0 11px;font-size:12px;border-radius:10px}.g2f-btn:disabled{opacity:.5;cursor:default}',
      '.g2f-tool{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 12px}',
      '.g2f-tool .busca{flex:1 1 220px;margin:0}',
      '.g2f-ib{display:inline-flex;align-items:center;justify-content:center;gap:5px;width:32px;height:32px;padding:0;border:none;border-radius:10px;background:#EEF0F4;color:var(--tx2,#5E6470);font-family:inherit;font-weight:700;font-size:12px;cursor:pointer;text-decoration:none}',
      '.g2f-ib .g2f-svg{width:16px;height:16px}.g2f-ib.t{width:auto;padding:0 11px}',
      '.g2f-ib.pri{background:var(--pri-s,#EAF0FF);color:var(--pri,#2F5BEA)}.g2f-ib.ok{background:#E7F7EF;color:#16A36A}.g2f-ib.dg{background:#FDECEC;color:#E5484D}',
      '.g2f-ib:focus-visible,.g2f-btn:focus-visible,.g2f-back:focus-visible,.g2f-per button:focus-visible{outline:2px solid var(--pri,#2F5BEA);outline-offset:2px}',
      '.g2f-acts{flex:0 0 100%;display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}',
      '@media(min-width:700px){.g2f-acts{flex:0 0 auto;flex-wrap:nowrap}}',
      '.g2f-mv{flex-wrap:wrap}.g2f-mv .info{flex:1 1 150px}.g2f-mv .nm,.g2f-pt .nm{white-space:normal!important}',
      '.g2f-ri{flex:0 0 40px;width:40px;height:40px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:#F0F1F4;color:var(--tx2,#5E6470)}',
      '.g2f-ri.in{background:#E7F7EF;color:#16A36A}.g2f-ri.out{background:#FDECEC;color:#E5484D}.g2f-ri.pri{background:var(--pri-s,#EAF0FF);color:var(--pri,#2F5BEA)}.g2f-ri.amb{background:#FFF5DC;color:#9A6A00}',
      '.g2f-amt{display:flex;flex-direction:column;align-items:flex-end;gap:4px;font-weight:800;font-size:14px;text-align:right}',
      '.g2f-pos{color:#16A36A}.g2f-neg{color:#E5484D}.g2f-mut{color:var(--tx2,#5E6470);font-size:12px}',
      '.g2f-sti{position:absolute;right:12px;top:12px;width:28px;height:28px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:#F0F1F4;color:var(--tx2,#5E6470)}',
      '.g2f-sti.in{background:#E7F7EF;color:#16A36A}.g2f-sti.out{background:#FDECEC;color:#E5484D}.g2f-sti.pri{background:var(--pri-s,#EAF0FF);color:var(--pri,#2F5BEA)}.g2f-sti.amb{background:#FFF5DC;color:#9A6A00}',
      '#g2fin .stats .st,#g2f-dash .stats .st{position:relative}',
      '.g2f-prog{height:7px;border-radius:99px;background:var(--ln,#ECEEF1);overflow:hidden;margin-top:8px}.g2f-prog i{display:block;height:100%;background:var(--verde,#16A36A);border-radius:99px}',
      '.g2f-prog.sm{height:5px;margin-top:6px}',
      '.g2f-pl{position:relative;height:11px;border-radius:99px;background:var(--ln,#ECEEF1);overflow:hidden;margin:2px 0 0}.g2f-pl i{position:absolute;left:0;top:0;bottom:0;border-radius:99px}.g2f-pl .ac{background:#BFD0FF}.g2f-pl .rc{background:var(--verde,#16A36A)}',
      '.g2f-note{color:var(--tx3,#9AA1AC);font-size:11.5px;line-height:1.5;margin:6px 4px 14px}',
      '.g2f-help summary{cursor:pointer;font-weight:700;font-size:13.5px;display:flex;align-items:center;gap:8px;list-style:none}.g2f-help summary::-webkit-details-marker{display:none}',
      '.g2f-help p{margin:8px 0 0;font-size:13px;line-height:1.55;color:var(--tx2,#5E6470)}',
      '.g2f-par{margin-top:6px}.g2f-par summary{cursor:pointer;font-size:12px;color:var(--pri,#2F5BEA);font-weight:700}',
      '.g2f-par div{font-size:12px;color:var(--tx2,#5E6470);padding:2px 0}',
      '.g2f-tbl{width:100%;border-collapse:collapse;font-size:13px}',
      '.g2f-tbl th{color:var(--tx3,#9AA1AC);font-size:11px;font-weight:800;text-transform:uppercase;text-align:left;padding:8px 6px;border-bottom:1px solid var(--ln,#ECEEF1)}',
      '.g2f-tbl td{padding:9px 6px;border-bottom:1px solid var(--ln,#ECEEF1);vertical-align:top}.g2f-tbl td.r,.g2f-tbl th.r{text-align:right;white-space:nowrap}',
      '.g2f-tw{overflow-x:auto}',
      '.g2f-dashper{margin-bottom:12px}',
      /* dashboard */
      '.g2f-ch{display:flex;align-items:flex-end;gap:5px;height:140px;padding-top:6px}',
      '.g2f-col{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}',
      '.g2f-bars{display:flex;align-items:flex-end;gap:2px;width:100%;height:calc(100% - 16px)}',
      '.g2f-bars i{flex:1;min-width:2px;border-radius:4px 4px 0 0;min-height:0}',
      '.g2f-bars i.in{background:#16A36A}.g2f-bars i.out{background:#E5484D}',
      '.g2f-col small{font-size:10px;color:var(--tx3,#9AA1AC);margin-top:4px;height:12px;line-height:12px;white-space:nowrap}',
      '.g2f-col.on small{color:var(--tx,#14161A);font-weight:800}.g2f-col:not(.on) .g2f-bars i{opacity:.55}',
      '.g2f-ch.dia{gap:2px}.g2f-ch.dia .g2f-bars{gap:1px}',
      '.g2f-leg{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--tx2,#5E6470);margin-top:10px}.g2f-leg i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:5px}',
      '.g2f-two{display:grid;grid-template-columns:1fr;gap:0 12px}@media(min-width:760px){.g2f-two{grid-template-columns:1fr 1fr}}',
      '.g2f-hb{margin:9px 0}.g2f-hb .t{display:flex;justify-content:space-between;font-size:13px;gap:8px}.g2f-hb .t span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.g2f-hb .t b{white-space:nowrap}',
      '.g2f-hb .b{height:7px;border-radius:99px;background:var(--ln,#ECEEF1);margin-top:4px;overflow:hidden}.g2f-hb .b i{display:block;height:100%;border-radius:99px}',
      '.g2f-dh{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:0 0 4px}.g2f-dh h3{margin:0}.g2f-dh .g2f-mut{white-space:nowrap}',
      '.g2f-click{cursor:pointer}',
      '#g2f-mod{position:fixed;inset:0;background:rgba(20,22,26,.45);z-index:9995;display:flex;align-items:flex-end;justify-content:center}',
      '#g2f-mod .box{background:#fff;color:#14161A;width:100%;max-width:560px;max-height:92vh;overflow:auto;border-radius:24px 24px 0 0;padding:18px 16px;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}',
      '@media(min-width:700px){#g2f-mod{align-items:center}#g2f-mod .box{border-radius:24px}}',
      '#g2f-mod h3{margin:0 0 10px;font-size:17px}',
      '#g2f-mod label{display:block;font-size:12px;color:#5E6470;margin:10px 0 4px;font-weight:700}',
      '#g2f-mod input,#g2f-mod select,#g2f-mod textarea{width:100%;border:1.5px solid #ECEEF1;border-radius:14px;padding:11px;font:inherit;font-size:15px;background:#fff;color:#14161A}',
      '#g2f-mod input:focus,#g2f-mod select:focus,#g2f-mod textarea:focus{outline:none;border-color:var(--pri,#2F5BEA)}',
      '#g2f-mod textarea{min-height:76px}',
      '#g2f-mod .chk{display:flex;gap:8px;align-items:center;margin-top:10px}#g2f-mod .chk input{width:auto}#g2f-mod .chk label{margin:0}',
      '#g2f-mod .hint{font-size:12px;color:#5E6470;margin-top:4px;line-height:1.45}',
      '#g2f-mod .err{color:#E5484D;font-size:13px;margin-top:10px;min-height:1em}',
      '#g2f-mod .ft{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}',
      '#g2f-mod .ft button{height:42px;padding:0 18px;border:none;border-radius:13px;background:var(--pri,#2F5BEA);color:#fff;font:inherit;font-weight:800;font-size:14px;cursor:pointer}',
      '#g2f-mod .ft button.sec{background:#EEF0F4;color:#14161A}',
      '#g2f-mod .pl{border:1.5px solid #ECEEF1;border-radius:12px;margin-top:4px;max-height:160px;overflow:auto}',
      '#g2f-mod .pl div{padding:8px 10px;cursor:pointer}#g2f-mod .pl div:hover{background:#F6F7F9}',
      '#g2f-mod .g2f-pr{display:grid;grid-template-columns:34px 1fr 1fr;gap:8px;align-items:center;margin-bottom:6px}',
      '#g2f-mod .g2f-pr span{font-size:12.5px;font-weight:800;color:#5E6470}#g2f-mod .g2f-pr input{padding:9px 8px;font-size:14px}',
      '#g2f-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:92px;z-index:9999;background:#14161A;color:#fff;padding:11px 16px;border-radius:14px;max-width:90vw;display:none;font:13.5px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;border-left:4px solid var(--pri,#2F5BEA)}',
      '@media print{body *{visibility:hidden!important}#g2fin,#g2fin *{visibility:visible!important}#g2fin{position:absolute;left:0;top:0;width:100%}.g2f-noprint{display:none!important}.card{box-shadow:none;break-inside:avoid}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ───────────── botões ───────────── */
  var BTI = {
    Comprovante: { i: 'clip' }, Documento: { i: 'clip' }, Conciliar: { i: 'checkc' }, Desconciliar: { i: 'ban' }, Editar: { i: 'pencil' },
    Estornar: { i: 'undo' }, Aprovar: { i: 'check', t: 1, tone: 'ok' }, Recusar: { i: 'x' }, Cancelar: { i: 'xc' }, Pagar: { i: 'cash', t: 1, l: 'Pagar' },
    Enviar: { i: 'send', t: 1, l: 'Enviar' }, Receber: { i: 'cash', t: 1, tone: 'ok' }, Pedir: { i: 'pencil' }, WhatsApp: { i: 'chat', tone: 'ok' },
    Itens: { i: 'list' }, Conferir: { i: 'check', t: 1, tone: 'ok', l: 'Conferir' }, Gerar: { i: 'repeat', t: 1, l: 'Gerar' }, Casar: { i: 'check', t: 1, l: 'Casar' }, Exportar: { i: 'dl' },
    Ignorar: { i: 'x' }, Voltar: { i: 'undo' }, Saldo: { i: 'plus', t: 1, l: 'Saldo inicial' }, Reabrir: { i: 'unlock', t: 1 }, Fechar: { i: 'lock', t: 1 },
    Participante: { i: 'userplus', t: 1 }, Dispensar: { i: 'x' }
  };
  function bt(a, v, t, cls) {
    var w = String(t).split(' ')[0], m = BTI[w] || { i: 'dot' };
    var tone = cls === 'red' ? 'dg' : cls === 'sec' ? '' : (m.tone || 'pri');
    return '<button type="button" class="g2f-ib' + (m.t ? ' t' : '') + (tone ? ' ' + tone : '') + '" data-a="' + a + '" data-v="' + esc(v) + '" title="' + esc(t) + '" aria-label="' + esc(t) + '">' +
      ic(m.i) + (m.t ? '<span>' + esc(m.l || t) + '</span>' : '') + '</button>';
  }
  function btn(a, label, icone, cls, v) {
    return '<button type="button" class="g2f-btn' + (cls ? ' ' + cls : '') + '" data-a="' + a + '"' + (v != null ? ' data-v="' + esc(v) + '"' : '') + '>' + (icone ? ic(icone) : '') + esc(label) + '</button>';
  }
  function pill(txt, tom) { return '<span class="pill p-' + (tom || 'cinza') + '">' + esc(txt) + '</span>'; }

  /* ───────────── janela de formulário (com campos que aparecem/mudam conforme a escolha) ───────────── */
  function campoHtml(c, i) {
    var id = 'g2f-f' + i, v = c.v == null ? '' : c.v, rq = c.req ? ' *' : '', h = '<div class="g2f-fld" data-i="' + i + '">';
    if (c.t === 'info') return h + '<div class="hint" style="margin-top:8px">' + c.l + '</div></div>';
    if (c.t === 'check') return h + '<div class="chk"><input type="checkbox" id="' + id + '"' + (v ? ' checked' : '') + '><label for="' + id + '">' + esc(c.l) + '</label></div></div>';
    h += '<label for="' + id + '">' + esc(c.l) + rq + '</label>';
    if (c.t === 'select') {
      h += '<select id="' + id + '">' + (c.vazio !== false ? '<option value="">' + esc(c.vazio || '— escolha —') + '</option>' : '') + (c.o || []).map(function (x) {
        return '<option value="' + esc(x[0]) + '"' + (String(x[0]) === String(v) ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>';
    } else if (c.t === 'textarea') h += '<textarea id="' + id + '">' + esc(v) + '</textarea>';
    else if (c.t === 'file') h += '<input type="file" id="' + id + '" accept="image/*,application/pdf">';
    else if (c.t === 'pessoa') h += '<input type="text" id="' + id + '" autocomplete="off" placeholder="Digite 3 letras do nome" value="' + esc(c.nome || '') + '" data-pid="' + esc(v) + '"><div class="pl" id="' + id + '-l" hidden></div>';
    else if (c.t === 'parcelas') h += '<div id="' + id + '"></div>';
    else {
      var tp = c.t === 'date' ? 'date' : (c.t === 'number' ? 'number' : 'text'), im = c.t === 'money' ? ' inputmode="decimal" placeholder="0,00"' : '';
      var vv = c.t === 'money' && v !== '' ? String(v).replace('.', ',') : v;
      h += '<input type="' + tp + '" id="' + id + '"' + im + ' value="' + esc(vv) + '">';
    }
    if (c.h) h += '<div class="hint">' + esc(c.h) + '</div>';
    return h + '</div>';
  }
  function form(titulo, campos, okTxt, aoSalvar) {
    fecharMod();
    var o = document.createElement('div'); o.id = 'g2f-mod';
    var h = '<div class="box" role="dialog" aria-modal="true"><h3>' + esc(titulo) + '</h3><form novalidate>';
    campos.forEach(function (c, i) { h += campoHtml(c, i); });
    h += '<div class="err" aria-live="polite"></div><div class="ft"><button type="button" class="sec" data-x="cancelar">Cancelar</button><button type="submit">' + esc(okTxt || 'Salvar') + '</button></div></form></div>';
    o.innerHTML = h;
    o.addEventListener('click', function (ev) { if (ev.target === o) fecharMod(); });
    document.body.appendChild(o);
    o.querySelector('[data-x="cancelar"]').addEventListener('click', fecharMod);
    var f = o.querySelector('form'), btn1 = f.querySelector('button[type="submit"]'), err = f.querySelector('.err');

    function wrap(i) { return o.querySelector('.g2f-fld[data-i="' + i + '"]'); }
    function ler(validar) {
      var val = {}, falta = [];
      campos.forEach(function (c, i) {
        if (c.t === 'info') return;
        var el = $('g2f-f' + i), w = wrap(i), x;
        if (w && w.hidden) { val[c.k] = c.t === 'check' ? false : ''; return; }
        if (c.t === 'check') x = el.checked;
        else if (c.t === 'file') x = el.files && el.files[0] ? el.files[0] : null;
        else if (c.t === 'pessoa') { x = el.getAttribute('data-pid') || ''; val[c.k + '_nome'] = el.value; val[c.k + '_w'] = el.getAttribute('data-w') || ''; }
        else if (c.t === 'parcelas') {
          x = []; var rs = el.querySelectorAll('.g2f-pr');
          Array.prototype.forEach.call(rs, function (r, n) { var d = r.querySelector('input[data-p="d"]'), vl = r.querySelector('input[data-p="v"]'); x.push({ n: n + 1, venc: d.value, valor: lerValor(vl.value) }); });
        } else if (c.t === 'money') { x = lerValor(el.value); if (validar && el.value.trim() && x == null) falta.push(c.l + ' (valor inválido)'); }
        else x = String(el.value || '').trim();
        if (validar && c.req && (x === '' || x == null || x === false)) falta.push(c.l);
        val[c.k] = x;
      });
      return { val: val, falta: falta };
    }
    function atualizar() {
      for (var pass = 0; pass < 2; pass++) {
        var vals = ler(false).val;
        campos.forEach(function (c, i) {
          var w = wrap(i), el = $('g2f-f' + i);
          if (c.vis && w) w.hidden = !c.vis(vals);
          if (c.opts && el) {
            var lista = c.opts(vals) || [], sig = JSON.stringify(lista);
            if (el.getAttribute('data-sig') !== sig) {
              var cur = el.value;
              el.innerHTML = (c.vazio !== false ? '<option value="">' + esc(c.vazio || '— escolha —') + '</option>' : '') + lista.map(function (x) { return '<option value="' + esc(x[0]) + '">' + esc(x[1]) + '</option>'; }).join('');
              el.setAttribute('data-sig', sig);
              el.value = lista.some(function (x) { return String(x[0]) === String(cur); }) ? cur : '';
            }
            if (c.unico && lista.length === 1 && !el.value) el.value = lista[0][0];
          }
          if (c.fill && el) {
            var dv = String(vals[c.fill.dep] == null ? '' : vals[c.fill.dep]);
            if (el.getAttribute('data-dep') !== dv) {
              el.setAttribute('data-dep', dv);
              var nv = c.fill.fn(vals);
              if (nv != null && (c.fill.sempre || dv !== '')) el.value = c.t === 'money' ? String(nv).replace('.', ',') : nv;
            }
          }
          if (c.t === 'parcelas' && el) {
            var sig2 = JSON.stringify(c.deps.map(function (k) { return vals[k]; }));
            if (el.getAttribute('data-sig') !== sig2) {
              el.setAttribute('data-sig', sig2);
              var ps = c.gen(vals) || [];
              el.innerHTML = ps.map(function (p) {
                return '<div class="g2f-pr"><span>' + p.n + 'ª</span><input type="date" data-p="d" value="' + esc(p.venc) + '"><input type="text" inputmode="decimal" data-p="v" value="' + esc(String(p.valor).replace('.', ',')) + '"></div>';
              }).join('') || '<div class="hint">Informe o valor, o número de parcelas e o 1º vencimento.</div>';
            }
          }
        });
      }
    }
    campos.forEach(function (c, i) {
      if (c.t !== 'pessoa') return;
      var inp = $('g2f-f' + i), lst = $('g2f-f' + i + '-l'), tmr;
      inp.addEventListener('input', function () {
        inp.setAttribute('data-pid', ''); clearTimeout(tmr);
        var q = inp.value.trim(); if (q.length < 3) { lst.hidden = true; return; }
        tmr = setTimeout(function () {
          rpc('search_people', { p_church_id: igrejaId(), p_query: q, p_limit: 12 }).then(function (r) {
            r = Array.isArray(r) ? r : [];
            lst.innerHTML = r.length ? r.map(function (p) { return '<div data-id="' + esc(p.person_id) + '" data-w="' + esc(p.primary_whatsapp || '') + '">' + esc(p.full_name) + (p.primary_whatsapp ? ' <span class="hint">' + esc(p.primary_whatsapp) + '</span>' : '') + '</div>'; }).join('') : '<div class="hint">Ninguém encontrado</div>';
            lst.hidden = false;
          }).catch(function () { lst.hidden = true; });
        }, 300);
      });
      lst.addEventListener('click', function (ev) {
        var d = ev.target.closest('[data-id]'); if (!d) return;
        inp.value = d.firstChild.textContent; inp.setAttribute('data-pid', d.getAttribute('data-id')); inp.setAttribute('data-w', d.getAttribute('data-w') || ''); lst.hidden = true;
        atualizar();
      });
    });
    f.addEventListener('change', atualizar); f.addEventListener('input', function (ev) { if (ev.target && ev.target.getAttribute && ev.target.getAttribute('data-pid') === null) atualizar(); });
    f.addEventListener('submit', function (ev) {
      ev.preventDefault(); err.textContent = '';
      var r = ler(true); if (r.falta.length) { err.textContent = 'Preencha: ' + r.falta.join(', ') + '.'; return; }
      btn1.disabled = true; btn1.textContent = 'Salvando…';
      Promise.resolve().then(function () { return aoSalvar(r.val); }).then(function (msg) {
        fecharMod(); if (msg !== false) toast(msg || 'Salvo.'); S.cache = null; recarregar(); dashCarregar(true);
      }).catch(function (e) {
        console.warn('[2Gather][fin]', e); err.textContent = traduz(e); btn1.disabled = false; btn1.textContent = okTxt || 'Salvar';
      });
    });
    atualizar();
    var first = o.querySelector('.g2f-fld:not([hidden]) input,.g2f-fld:not([hidden]) select,.g2f-fld:not([hidden]) textarea'); if (first) setTimeout(function () { first.focus(); }, 50);
  }
  function fecharMod() { var o = $('g2f-mod'); if (o) o.remove(); }
  function motivo(titulo, aoOk, okTxt) {
    form(titulo, [{ k: 'm', l: 'Motivo', t: 'textarea', req: true, h: 'Fica registrado no histórico (mínimo 5 letras).' }], okTxt || 'Confirmar', function (v) { return aoOk(v.m); });
  }

  /* ───────────── comprovantes ───────────── */
  function enviarComprovante(arq) {
    if (!arq) return Promise.resolve(null);
    if (arq.size > 10 * 1024 * 1024) return Promise.reject(new Error('Arquivo maior que 10 MB.'));
    var d = new Date(), nome = String(arq.name || 'comprovante').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
    var path = igrejaId() + '/' + d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + uuid() + '-' + nome;
    return cliente().then(function (c) {
      return c.storage.from('fin-comprovantes').upload(path, arq, { contentType: arq.type || 'application/octet-stream', upsert: false });
    }).then(function (r) {
      if (r.error) throw r.error;
      return rpc('v39_fin_evidence_register', C({ p_path: path, p_name: arq.name || nome, p_mime: arq.type || null, p_size: arq.size || null }));
    }).then(function (r) { return r && r.id; });
  }
  function abrirComprovante(path) {
    if (!path) return toast('Sem comprovante.');
    var w = window.open('', '_blank');
    cliente().then(function (c) { return c.storage.from('fin-comprovantes').createSignedUrl(path, 300); })
      .then(function (r) { if (r.error) throw r.error; if (w) w.location = r.data.signedUrl; else window.location.href = r.data.signedUrl; })
      .catch(function (e) { if (w) w.close(); toast(traduz(e)); });
  }

  /* ───────────── listas para selects ───────────── */
  function opContas(soAtivas) { return ((S.cat && S.cat.contas) || []).filter(function (a) { return !soAtivas || a.status === 'active'; }).map(function (a) { return [a.id, a.nome + ' · ' + (ROT.conta[a.tipo] || a.tipo)]; }); }
  function opCats(nat) { return ((S.cat && S.cat.categorias) || []).filter(function (c) { return c.ativa && c.natureza === nat; }).map(function (c) { return [c.id, c.nome + (c.contabil ? ' (' + c.contabil + ')' : '')]; }); }
  function opFormas(semCartao) { return ((S.cat && S.cat.formas) || []).filter(function (f) { return f.ativa && (!semCartao || f.tipo !== 'card'); }).map(function (f) { return [f.id, f.nome]; }); }
  function formaTipo(id) { var f = ((S.cat && S.cat.formas) || []).filter(function (x) { return x.id === id; })[0]; return f ? f.tipo : ''; }
  function formaNome(id) { var f = ((S.cat && S.cat.formas) || []).filter(function (x) { return x.id === id; })[0]; return f ? f.nome : ''; }
  function opFornec() { return ((S.cat && S.cat.fornecedores) || []).filter(function (f) { return f.status !== 'inactive'; }).map(function (f) { return [f.id, f.nome]; }); }
  function opCartoes() { return ((S.cat && S.cat.cartoes) || []).filter(function (k) { return k.status === 'active'; }).map(function (k) { return [k.id, k.nome + ' •' + k.final]; }); }
  function opCampanhas() { return (CAMPS || []).filter(function (g) { return ['cancelled', 'completed'].indexOf(g.status) < 0; }).map(function (g) { return [g.id, g.nome]; }); }

  /* ───────────── abas, abrir/fechar, base ───────────── */
  var ABAS = [
    { id: 'livro', nome: 'Livro', i: 'book', ok: function () { return pode('financial.book.view'); } },
    { id: 'conferir', nome: 'A conferir', i: 'inbox', ok: function () { return pode('financial.sources.view'); } },
    { id: 'entrada', nome: 'Entrada', i: 'down', ok: function () { return pode('financial.movements.create') && tes(); } },
    { id: 'despesas', nome: 'Despesas', i: 'receipt', ok: function () { return pode('financial.expenses.create') || pode('financial.expenses.view'); } },
    { id: 'transf', nome: 'Transf. e cartões', i: 'card', ok: function () { return pode('financial.transfers.manage') || pode('financial.cards.manage'); } },
    { id: 'conc', nome: 'Conciliação', i: 'scale', ok: function () { return pode('financial.reconciliation.manage') && tes(); } },
    { id: 'camp', nome: 'Campanhas', i: 'flag', ok: function () { return pode('financial.campaigns.view'); } },
    { id: 'cad', nome: 'Cadastros', i: 'sliders', ok: function () { return pode('financial.accounts.manage') || pode('financial.categories.manage') || (S.ctx && S.ctx.master); } },
    { id: 'rel', nome: 'Relatórios', i: 'chart', ok: function () { return pode('financial.reports.view'); } }
  ];
  var PERIODO = ['livro', 'transf', 'conc', 'rel'];
  function abasVisiveis() { return ABAS.filter(function (a) { return a.ok(); }); }

  function esconderMain(main, sim) {
    Array.prototype.forEach.call(main.children, function (el) {
      if (el.id === 'g2fin') return;
      if (sim) { if (!el.classList.contains('g2f-oculto')) { el.classList.add('g2f-oculto'); el.setAttribute('data-g2f-esc', '1'); } }
      else if (el.getAttribute('data-g2f-esc') === '1') { el.classList.remove('g2f-oculto'); el.removeAttribute('data-g2f-esc'); }
    });
  }
  function montar() {
    var main = $('main'); if (!main) return false;
    var o = $('g2fin');
    if (!o || !main.contains(o)) {
      if (o) o.remove();
      o = document.createElement('div'); o.id = 'g2fin';
      o.addEventListener('click', clique); o.addEventListener('change', mudanca); o.addEventListener('input', digita);
      main.appendChild(o);
    }
    esconderMain(main, true);
    return true;
  }
  function abrir(aba) {
    if (!v39()) return toast('O Financeiro novo funciona só na versão v39.');
    css();
    carregarCtx().then(function () {
      if (!algum()) return toast('Você não tem acesso ao Financeiro.');
      var vis = abasVisiveis();
      if (aba && vis.some(function (a) { return a.id === aba; })) S.aba = aba;
      if (!vis.some(function (a) { return a.id === S.aba; })) S.aba = vis.length ? vis[0].id : 'despesas';
      S.aberto = true; S.cache = null;
      if (!montar()) return;
      pintarBase(); recarregar(); window.scrollTo(0, 0);
    }).catch(function (e) { toast(traduz(e)); });
  }
  function fechar() {
    S.aberto = false; S.cache = null; fecharMod();
    var o = $('g2fin'); if (o) o.remove();
    var main = $('main'); if (main) esconderMain(main, false);
    dashCarregar(true); window.scrollTo(0, 0);
  }
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && $('g2f-mod')) fecharMod(); });

  function pintarBase() {
    var o = $('g2fin'); if (!o) return;
    var cur = ABAS.filter(function (a) { return a.id === S.aba; })[0] || { nome: '' }, comPer = PERIODO.indexOf(S.aba) >= 0;
    var ag = new Date(), ehHoje = S.ano === ag.getFullYear() && S.mes === ag.getMonth() + 1;
    o.innerHTML =
      '<div class="g2f-head g2f-noprint"><button type="button" class="g2f-back" data-a="fechar" aria-label="Voltar ao painel Financeiro">' + ic('chevl', 20) + '</button>' +
      '<div><div class="ini-ola">Livro financeiro</div><div class="ini-sub">' + esc(cur.nome) + (comPer ? ' · ' + MESES[S.mes - 1] + ' de ' + S.ano : '') + '</div></div></div>' +
      '<div class="chips g2f-tabs g2f-noprint" role="tablist">' + abasVisiveis().map(function (a) {
        return '<button type="button" role="tab" data-a="aba" data-v="' + a.id + '" class="' + (a.id === S.aba ? 'on' : '') + '"' + (a.id === S.aba ? ' aria-selected="true"' : '') + '>' + ic(a.i) + esc(a.nome) + '</button>'; }).join('') + '</div>' +
      (comPer ? '<div class="g2f-per g2f-noprint"><button type="button" data-a="mesAnt" aria-label="Mês anterior">' + ic('chevl') + '</button><b>' + MESES[S.mes - 1] + ' ' + S.ano + '</b>' +
        (ehHoje ? '' : '<button type="button" class="g2f-hoje" data-a="mesHoje">Hoje</button>') + '<button type="button" data-a="mesProx" aria-label="Próximo mês">' + ic('chevr') + '</button></div>' : '') +
      '<div id="g2f-bd" aria-live="polite"><div class="empty">Carregando…</div></div>';
  }
  function mover(d) { var m = S.mes + d; if (m < 1) { m = 12; S.ano--; } else if (m > 12) { m = 1; S.ano++; } S.mes = m; S.cache = null; pintarBase(); recarregar(); }
  // guarda o que está na tela: se o app redesenhar a área principal, voltamos NA HORA sem buscar de novo no servidor
  function corpo(h) {
    var b = $('g2f-bd'); if (b) b.innerHTML = h;
    if (S.aberto && String(h).indexOf('Carregando…') < 0) S.cache = { aba: S.aba, ano: S.ano, mes: S.mes, html: h, t: Date.now() };
  }
  function carregarCtx() {
    if (!igrejaId()) return Promise.reject(new Error('Igreja não identificada. Atualize a página.'));
    return rpc('v39_fin_context', C({})).then(function (x) { S.ctx = x || { perms: [] }; });
  }
  function carregarCat() { return rpc('v39_fin_catalogs', C({})).then(function (x) { S.cat = x || {}; }); }
  function recarregar() {
    if (!S.aberto || !$('g2fin')) return;
    corpo('<div class="empty">Carregando…</div>');
    var r = { livro: tLivro, conferir: tConferir, entrada: tEntrada, despesas: tDespesas, transf: tTransf, conc: tConc, camp: tCamp, cad: tCad, rel: tRel }[S.aba];
    carregarCtx().then(carregarCat).then(function () { return r(); }).catch(function (e) { console.warn('[2Gather][fin]', e); corpo('<div class="card">' + esc(traduz(e)) + '</div>'); });
  }
  function restaurar() {
    if (!montar()) return;
    pintarBase();
    var c = S.cache;
    if (c && c.aba === S.aba && c.ano === S.ano && c.mes === S.mes && Date.now() - c.t < 180000) {
      var b = $('g2f-bd'); if (b) b.innerHTML = c.html;
      if (S.aba === 'livro' && S.ov) pintarLista();
    } else recarregar();
  }
  function avisoInicio() {
    if (S.ctx && S.ctx.inicio) return '';
    return '<div class="aviso"><b>Defina a data de início do Financeiro.</b> Ela marca o primeiro dia do Livro; GC e cultos a partir dessa data aparecem em "A conferir". ' +
      (S.ctx && S.ctx.master ? 'Vá em Cadastros › Início do Financeiro.' : 'Peça ao Master.') + '</div>';
  }
  function stat(rot, val, tom, icone, cls, sub) {
    return '<div class="st"><span class="g2f-sti ' + tom + '">' + ic(icone, 16) + '</span><small>' + esc(rot) + '</small><b class="' + (cls || '') + '">' + val + '</b>' + (sub ? '<div class="d">' + sub + '</div>' : '') + '</div>';
  }
  function norm(s) { s = String(s || '').toLowerCase(); try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { /* sem normalize */ } return s; }

  /* ───────────── CAMPANHAS: dados derivados (a receber, fila de mensagens) ───────────── */
  function achaComp(id) {
    for (var i = 0; i < (CAMPS || []).length; i++) { var cs = CAMPS[i].compromissos || []; for (var j = 0; j < cs.length; j++) if (cs[j].id === id) return { g: CAMPS[i], c: cs[j], gi: i, ci: j }; }
    return null;
  }
  function partsDe(cid) {
    var g = (CAMPS || []).filter(function (x) { return x.id === cid; })[0]; if (!g) return [];
    return (g.compromissos || []).filter(function (c) { return ['cancelled', 'paid', 'draft'].indexOf(c.status) < 0 && num(c.saldo) > 0; })
      .map(function (c) { return [c.id, c.pessoa + ' · falta ' + brl(c.saldo)]; });
  }
  function previstos() {
    var out = [], hj = hoje();
    (CAMPS || []).forEach(function (g, gi) {
      if (g.status === 'cancelled') return;
      (g.compromissos || []).forEach(function (c, ci) {
        if (['cancelled', 'paid', 'draft'].indexOf(c.status) >= 0) return;
        var ds = c.datas || [], tot = ds.length || c.parcelas || 1;
        ds.forEach(function (d) {
          var pend = arr2(num(d.valor) - num(d.recebido)), v = String(d.venc || '').slice(0, 10);
          if (d.status === 'paid' || d.status === 'cancelled' || pend <= 0) return;
          out.push({ gi: gi, ci: ci, g: g, c: c, n: d.n, tot: tot, venc: v, valor: pend, atraso: !!v && v < hj });
        });
        if (!ds.length && num(c.saldo) > 0) { var v2 = String(c.proximo || '').slice(0, 10); out.push({ gi: gi, ci: ci, g: g, c: c, n: 1, tot: 1, venc: v2, valor: arr2(c.saldo), atraso: !!v2 && v2 < hj }); }
      });
    });
    out.sort(function (a, b) { return a.venc < b.venc ? -1 : a.venc > b.venc ? 1 : 0; });
    return out;
  }
  function somaPrev(l) { return arr2(l.reduce(function (s, p) { return s + p.valor; }, 0)); }
  function jaEnviou(c, k, n) { return !!(SENT && SENT.map[c + '|' + k + '|' + n]); }
  function carregarSent() {
    if (!pode('financial.commitments.communicate')) { SENT = null; return Promise.resolve(); }
    return rpc('v39_fin_msg_sent_list', C({})).then(function (l) {
      SENT = { map: {} }; (l || []).forEach(function (x) { SENT.map[x.c + '|' + x.k + '|' + x.n] = 1; });
    }).catch(function (e) { console.warn('[2Gather][fin] mensagens: ' + traduz(e)); SENT = null; });
  }
  function filaMsgs() {
    if (!SENT) return [];
    var q = [], hj = hoje(), lim = addDias(hj, -30);
    (CAMPS || []).forEach(function (g, gi) {
      if (g.status !== 'active') return;
      (g.compromissos || []).forEach(function (c, ci) {
        if (['cancelled', 'paid', 'draft'].indexOf(c.status) >= 0) return;
        var ini = String(g.inicio || '').slice(0, 10);
        if ((!ini || ini <= hj) && !jaEnviou(c.id, 'inicio', 0) && !jaEnviou(c.id, 'resumo', 0)) q.push({ tipo: 'inicio', gi: gi, ci: ci, n: 0, dias: 0 });
        (c.datas || []).forEach(function (d) {
          var v = String(d.venc || '').slice(0, 10), pend = num(d.valor) - num(d.recebido);
          if (!v || d.status === 'paid' || d.status === 'cancelled' || pend <= 0.004) return;
          if (v === hj && !jaEnviou(c.id, 'venc', d.n)) q.push({ tipo: 'venc', gi: gi, ci: ci, n: d.n, dias: 0 });
          else if (v < hj && v >= lim && !jaEnviou(c.id, 'atraso', d.n)) q.push({ tipo: 'atraso', gi: gi, ci: ci, n: d.n, dias: difDias(v, hj) });
        });
      });
    });
    return q;
  }
  function waLink(fone, txt) {
    var f = String(fone || '').replace(/\D/g, ''); if (f.length < 10) return '';
    if (f.length <= 11) f = '55' + f;
    return 'https://wa.me/' + f + '?text=' + encodeURIComponent(txt);
  }
  function parcelaDe(c, n) { var l = c.datas || []; for (var i = 0; i < l.length; i++) if (l[i].n === n) return l[i]; return null; }
  // Mensagens ao membro: NUNCA mostram saldo, quanto falta ou quanto já foi pago.
  function msgTexto(tipo, g, c, p) {
    var nome = primeiro(c.pessoa), forma = formaNome(c.formaId), ds = c.datas || [];
    var forma1 = forma ? ' (' + forma + ')' : '';
    var assina = '\n\nQualquer dúvida, é só nos chamar. Deus abençoe você! 🙏';
    if (tipo === 'inicio' || tipo === 'resumo') {
      var L = ['Olá, ' + nome + '! Paz do Senhor 🙏', '', 'Hoje ' + (tipo === 'inicio' ? 'começamos' : 'registramos') + ' a campanha *' + g.nome + '*' + (g.objetivo ? ' — ' + g.objetivo : '') + '. Muito obrigado por abraçar este compromisso conosco!', '',
        'Segue um resumo do que combinamos:', '• Valor: ' + brl(c.acordado) + (c.parcelas > 1 ? ' em ' + c.parcelas + ' parcelas' : ' à vista'), forma ? '• Forma: ' + forma : ''].filter(function (x, i) { return x !== '' || i === 1 || i === 3; });
      if (ds.length) { L.push('• Datas:'); ds.forEach(function (d) { L.push('   ' + d.n + 'ª — ' + dataBR(d.venc) + ' — ' + brl(d.valor)); }); }
      return L.join('\n') + assina;
    }
    if (tipo === 'venc') {
      var d = p && p.n ? parcelaDe(c, p.n) : null, val = d ? arr2(num(d.valor) - num(d.recebido)) : (p && p.valor) || c.proximoValor;
      return 'Olá, ' + nome + '! Paz do Senhor 🙏\n\nPassando com carinho para lembrar que hoje é a data combinada ' + (c.parcelas > 1 && p && p.n ? 'da ' + p.n + 'ª parcela ' : 'do seu compromisso ') + '(' + brl(val) + ') com a campanha *' + g.nome + '*' + forma1 +
        '.\n\nSe você já realizou, por favor desconsidere — e muito obrigado! 🙏' + assina;
    }
    if (tipo === 'atraso') {
      var d2 = p && p.n ? parcelaDe(c, p.n) : null;
      return 'Olá, ' + nome + '! Paz do Senhor 🙏\n\nPassando para lembrar, sem pressa, ' + (d2 ? 'da parcela de ' + dataBR(d2.venc) + ' (' + brl(arr2(num(d2.valor) - num(d2.recebido))) + ') ' : 'do seu compromisso ') + 'com a campanha *' + g.nome + '*. Se precisar combinar uma nova data, é só nos avisar — estamos juntos! 🙏' + assina;
    }
    return 'Olá, ' + nome + '! Recebemos a sua contribuição' + (p && p.valor ? ' de ' + brl(p.valor) : '') + ' para a campanha *' + g.nome + '*. Muito obrigado pela sua generosidade! Deus abençoe você. 🙏';
  }
  function marcarMsg(compId, kind, n, texto, dispensar) {
    return rpc('v39_fin_msg_mark', C({ p_commitment: compId, p_kind: kind, p_n: n || 0, p_text: dispensar ? null : (texto || null), p_dismiss: !!dispensar }))
      .then(function () { if (SENT) SENT.map[compId + '|' + kind + '|' + (n || 0)] = 1; })
      .catch(function (e) { console.warn('[2Gather][fin] marcar mensagem: ' + traduz(e)); });
  }
  function ofertarRecibo(g, c, valor) {
    if (!pode('financial.commitments.communicate') || !c) return;
    form('Avisar ' + primeiro(c.pessoa) + ' pelo WhatsApp?', [
      { t: 'info', l: 'Recebimento registrado. Quer enviar a confirmação? A mensagem não mostra saldo nem valores em aberto.' },
      { k: 'tel', l: 'Telefone (com DDD)', v: c.telefone || '', req: true },
      { k: 'texto', l: 'Mensagem', t: 'textarea', v: msgTexto('recibo', g, c, { valor: valor }), req: true }
    ], 'Abrir WhatsApp', function (v) {
      var url = waLink(v.tel, v.texto); if (!url) return Promise.reject(new Error('Telefone inválido.'));
      window.open(url, '_blank');
      return marcarMsg(c.id, 'recibo', 0, v.texto, false).then(function () { return 'Mensagem registrada.'; });
    });
  }

  /* ───────────── LIVRO ───────────── */
  function movVis(m) {
    var t = m.tipo;
    if (t === 'income') return { i: 'down', c: 'in' };
    if (t === 'expense') return { i: 'up', c: 'out' };
    if (t === 'transfer_in' || t === 'transfer_out') return { i: 'swap', c: '' };
    if (t === 'opening_balance') return { i: 'bank', c: 'pri' };
    return { i: 'undo', c: 'amb' };
  }
  function linhaMov(m, fechado) {
    var vis = movVis(m), v = num(m.valor) * num(m.efeitoCaixa || m.efeitoResultado || 0), a = [];
    if (m.comprovantePath) a.push(bt('verComp', m.comprovantePath, 'Comprovante', 'sec'));
    if (tes() && !fechado && pode('financial.reconciliation.manage') && m.status === 'posted' && m.efeitoCaixa !== 0) a.push(bt('conc', m.id, 'Conciliar', 'sec'));
    if (tes() && !fechado && pode('financial.reconciliation.manage') && m.status === 'reconciled') a.push(bt('desconc', m.id, 'Desconciliar', 'sec'));
    if (tes() && m.manual && m.status === 'posted' && m.tipo === 'income' && pode('financial.movements.update')) a.push(bt('editMov', m.id, 'Editar', 'sec'));
    if (tes() && pode('financial.movements.reverse') && (m.status === 'posted' || m.status === 'reconciled') && m.tipo !== 'reversal') a.push(bt('estornar', m.id, 'Estornar', 'red'));
    var st = m.status === 'reconciled' ? pill('conciliado', 'verde') : m.status === 'reversed' ? pill('estornado', 'vermelho') : pill((ROT.movSt[m.status] || m.status).toLowerCase(), 'cinza');
    return '<div class="row g2f-mv"><span class="g2f-ri ' + vis.c + '">' + ic(vis.i) + '</span><div class="info"><div class="nm">' + esc(m.descricao) + '</div>' +
      '<div class="sb">' + esc([ROT.mov[m.tipo] || m.tipo, m.categoria, m.conta, m.forma, m.pessoa].filter(Boolean).join(' · ')) + '</div></div>' +
      '<div class="g2f-amt"><span class="' + (v < 0 ? 'g2f-neg' : v > 0 ? 'g2f-pos' : '') + '">' + (v > 0 ? '+ ' : '') + brl(v) + '</span>' + st + '</div>' +
      (a.length ? '<div class="g2f-acts g2f-noprint">' + a.join('') + '</div>' : '') + '</div>';
  }
  function linhaPrev(p) {
    var forma = formaNome(p.c.formaId);
    return '<div class="row g2f-mv"><span class="g2f-ri amb">' + ic('clock') + '</span><div class="info"><div class="nm">' + esc(p.c.pessoa) + ' · ' + esc(p.g.nome) + '</div>' +
      '<div class="sb">' + (p.tot > 1 ? 'parcela ' + p.n + '/' + p.tot + ' · ' : '') + (p.atraso ? 'venceu ' : 'vence ') + dataBR(p.venc) + (forma ? ' · ' + esc(forma) : '') + '</div></div>' +
      '<div class="g2f-amt"><span>' + brl(p.valor) + '</span>' + (p.atraso ? pill('atrasada', 'vermelho') : pill('previsto', 'amarelo')) + '</div>' +
      (tes() && pode('financial.commitments.receive') ? '<div class="g2f-acts g2f-noprint">' + bt('receber', p.gi + '|' + p.ci, 'Receber') + '</div>' : '') + '</div>';
  }
  function blocoPrevisto(lim) {
    var prev = previstos(); if (!prev.length) return '';
    var vis = prev.slice(0, lim || 12);
    return '<div class="sec" style="display:flex;justify-content:space-between;align-items:center"><span>A receber · previsto</span><span class="g2f-mut">' + brl(somaPrev(prev)) + '</span></div><div class="card lp">' + vis.map(linhaPrev).join('') + '</div>' +
      (prev.length > vis.length ? '<div class="g2f-note">Mostrando ' + vis.length + ' de ' + prev.length + '. A lista completa está em Campanhas.</div>' : '') +
      '<div class="g2f-note">Valores acordados em campanhas e votos. Só entram no Livro e no saldo quando forem recebidos.</div>';
  }
  function tLivro() {
    var pc = pode('financial.campaigns.view');
    return Promise.all([rpc('v39_fin_overview', C({ p_year: S.ano, p_month: S.mes })), pc ? rpc('v39_fin_campaigns', C({})).catch(function () { return []; }) : Promise.resolve([])]).then(function (r) {
      S.ov = r[0] || {}; CAMPS = r[1] || []; desenharLivro();
    });
  }
  function desenharLivro() {
    var x = S.ov, L = x.livro || [], t = x.totais || {}, per = x.periodo || {}, fechado = per.status === 'closed', prev = previstos();
    var cont = { tudo: L.length, in: 0, out: 0, tr: 0, conc: 0 };
    L.forEach(function (m) {
      if (m.tipo === 'income') cont.in++; else if (m.tipo === 'expense') cont.out++; else if (m.tipo === 'transfer_in' || m.tipo === 'transfer_out') cont.tr++;
      if (m.status === 'posted' && m.efeitoCaixa !== 0) cont.conc++;
    });
    var h = avisoInicio();
    h += '<div class="stats">' + stat('Entradas', brl(t.entradas), 'in', 'down', 'g2f-pos') + stat('Saídas', brl(t.saidas), 'out', 'up', 'g2f-neg') +
      stat('Resultado', brl(t.resultado), 'pri', 'trend', num(t.resultado) < 0 ? 'g2f-neg' : 'g2f-pos', 'entradas − saídas') +
      stat('A receber', brl(somaPrev(prev)), 'amb', 'clock', '', 'campanhas e votos') + '</div>';
    h += '<div class="g2f-tool g2f-noprint"><div class="busca"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input data-c="busca" placeholder="Buscar descrição, pessoa ou conta" value="' + esc(S.livroBusca) + '" autocomplete="off"></div>' +
      (pode('financial.reports.export') ? bt('csvLivro', '', 'Exportar CSV', 'sec') : '') +
      (fechado ? (S.ctx.podeReabrir ? bt('reabrir', '', 'Reabrir mês', 'sec') : '<span class="pill p-cinza">mês fechado</span>') : (S.ctx.podeFechar ? bt('fecharMes', '', 'Fechar mês', 'sec') : '')) + '</div>';
    h += '<div class="chips g2f-noprint">' + [['tudo', 'Tudo'], ['in', 'Entradas'], ['out', 'Saídas'], ['tr', 'Transferências'], ['conc', 'A conciliar']].map(function (f) {
      return '<button type="button" data-a="livroFiltro" data-v="' + f[0] + '" class="' + (S.livroFiltro === f[0] ? 'on' : '') + '">' + f[1] + ' <span>' + cont[f[0]] + '</span></button>'; }).join('') + '</div>';
    h += '<div id="g2f-lista"></div>' + blocoPrevisto(12);
    corpo(h); pintarLista();
  }
  function pintarLista() {
    var el = $('g2f-lista'); if (!el) return;
    var x = S.ov || {}, L = x.livro || [], fechado = x.periodo && x.periodo.status === 'closed', q = norm(S.livroBusca), f = S.livroFiltro;
    var l = L.filter(function (m) {
      if (f === 'in' && m.tipo !== 'income') return false;
      if (f === 'out' && m.tipo !== 'expense') return false;
      if (f === 'tr' && m.tipo !== 'transfer_in' && m.tipo !== 'transfer_out') return false;
      if (f === 'conc' && !(m.status === 'posted' && m.efeitoCaixa !== 0)) return false;
      return !q || norm([m.descricao, m.pessoa, m.conta, m.categoria, m.forma].join(' ')).indexOf(q) >= 0;
    });
    if (!l.length) { el.innerHTML = '<div class="card"><div class="empty">Nenhum lançamento ' + (L.length ? 'com este filtro' : 'neste mês') + '.</div></div>'; return; }
    l.sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : 0; });
    var gr = {}, ordem = [];
    l.forEach(function (m) { var d = String(m.data).slice(0, 10); if (!gr[d]) { gr[d] = []; ordem.push(d); } gr[d].push(m); });
    el.innerHTML = ordem.map(function (d) { return '<div class="letra">' + esc(dataDia(d)) + '</div><div class="card lp">' + gr[d].map(function (m) { return linhaMov(m, fechado); }).join('') + '</div>'; }).join('');
    if (S.cache && S.cache.aba === 'livro') S.cache.t = Date.now();
  }
  function csvLivro() {
    var L = (S.ov && S.ov.livro) || []; if (!L.length) return toast('Nada para exportar.');
    var lin = [['Data', 'Tipo', 'Descricao', 'Categoria', 'Conta', 'Forma', 'Pessoa', 'Valor', 'Situacao']].concat(L.map(function (m) {
      return [dataBR(m.data), ROT.mov[m.tipo] || m.tipo, m.descricao, m.categoria, m.conta, m.forma || '', m.pessoa || '', String((num(m.valor) * num(m.efeitoCaixa || m.efeitoResultado || 0)).toFixed(2)).replace('.', ','), ROT.movSt[m.status] || m.status];
    }));
    var txt = '\ufeff' + lin.map(function (r) { return r.map(function (c) { c = String(c == null ? '' : c); return /[;"\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(';'); }).join('\r\n');
    var b = new Blob([txt], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = 'livro_' + S.ano + '-' + pad(S.mes) + '.csv'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function editMov(id) {
    var m = ((S.ov && S.ov.livro) || []).filter(function (x) { return x.id === id; })[0]; if (!m) return;
    form('Editar entrada', [
      { k: 'descricao', l: 'Descrição', v: m.descricao },
      { k: 'categoriaId', l: 'Categoria', t: 'select', o: opCats('income'), v: m.categoriaId, req: true },
      { k: 'formaId', l: 'Forma de recebimento', t: 'select', o: opFormas(true), v: m.formaId, req: true },
      { k: 'anonimo', l: 'Contribuição anônima', t: 'check', v: m.anonimo },
      { k: 'pessoaId', l: 'Pessoa (se identificada)', t: 'pessoa', v: m.pessoaId || '', nome: m.anonimo ? '' : m.pessoa },
      { k: 'arq', l: 'Trocar/anexar comprovante', t: 'file' },
      { t: 'info', l: 'Valor, data e conta só mudam por estorno + novo lançamento.' }
    ], 'Salvar', function (v) {
      return enviarComprovante(v.arq).then(function (ev) {
        return rpc('v39_fin_update_movement', C({ p_id: id, p: { descricao: v.descricao, categoriaId: v.categoriaId, formaId: v.formaId, anonimo: v.anonimo || !v.pessoaId, pessoaId: v.pessoaId || null, comprovanteId: ev } }));
      }).then(function () { return 'Entrada atualizada.'; });
    });
  }

  /* ───────────── A CONFERIR ───────────── */
  var PEND = [];
  function tConferir() {
    return Promise.all([rpc('v39_fin_source_pending', C({})), rpc('v39_fin_sources', C({ p_from: null }))]).then(function (r) {
      var p = r[0] || {}, lotes = r[1] || []; PEND = p.itens || [];
      var h = avisoInicio() + '<div class="sec">A conferir (' + PEND.length + ')</div>';
      h += '<div class="card lp">' + (PEND.length ? PEND.map(function (x, i) {
        var tot = num(x.dizimo) + num(x.oferta) + num(x.outras);
        return '<div class="row g2f-mv"><span class="g2f-ri pri">' + ic(x.tipo === 'gc' ? 'users' : 'cal') + '</span><div class="info"><div class="nm">' + esc(x.titulo) + '</div>' +
          '<div class="sb">' + esc(dataBR(x.data) + ' · ' + (x.tipo === 'gc' ? 'Encontro de GC' : 'Culto/evento') + ' · Dízimos ' + brl(x.dizimo) + ' · Ofertas ' + brl(x.oferta) + (num(x.outras) ? ' · Outras ' + brl(x.outras) : '')) + '</div></div>' +
          '<div class="g2f-amt"><span>' + brl(tot) + '</span></div>' + (tes() && pode('financial.sources.post') ? '<div class="g2f-acts">' + bt('lancarLote', i, 'Conferir e lançar') + '</div>' : '') + '</div>';
      }).join('') : '<div class="empty">Nada pendente.</div>') + '</div>' +
        '<div class="g2f-note">Valores que o líder informou no encontro do GC e na ficha do culto' + (p.inicio ? ', desde ' + dataBR(p.inicio) : '') + '. Só entram no Livro e no saldo depois que a Tesouraria confere e lança.</div>';
      h += '<div class="sec">Lotes lançados</div><div class="card lp">' + (lotes.length ? lotes.slice(0, 200).map(function (b) {
        return '<div class="row g2f-mv"><span class="g2f-ri in">' + ic('check') + '</span><div class="info"><div class="nm">' + esc(b.titulo) + '</div><div class="sb">' + esc(dataBR(b.data) + ' · ' + (b.modulo === 'gc' ? 'GC' : 'Culto/evento')) + '</div></div>' +
          '<div class="g2f-amt"><span>' + brl(b.total) + '</span>' + pill((ROT.lote[b.status] || b.status).toLowerCase(), b.status === 'posted' ? 'verde' : b.status === 'reversed' ? 'vermelho' : 'cinza') + '</div>' +
          (b.status === 'posted' && tes() && pode('financial.sources.reverse') ? '<div class="g2f-acts">' + bt('estLote', b.id, 'Estornar', 'red') + '</div>' : '') + '</div>';
      }).join('') : '<div class="empty">Nenhum lote ainda.</div>') + '</div>';
      corpo(h);
    });
  }
  function lancarLote(i) {
    var x = PEND[i]; if (!x) return;
    var caixa = ((S.cat.contas || []).filter(function (a) { return a.status === 'active' && a.tipo === 'cash'; })[0] || {}).id || '';
    var din = ((S.cat.formas || []).filter(function (f) { return f.ativa && f.tipo === 'cash'; })[0] || {}).id || '';
    form('Conferir e lançar · ' + x.titulo + ' · ' + dataBR(x.data), [
      { t: 'info', l: 'Informado: dízimos ' + brl(x.dizimo) + ', ofertas ' + brl(x.oferta) + (num(x.outras) ? ', outras ' + brl(x.outras) : '') + '. Lance o valor contado; se for diferente, explique em Observação.' },
      { k: 'dizimo', l: 'Dízimos contados', t: 'money', v: x.dizimo }, { k: 'oferta', l: 'Ofertas contadas', t: 'money', v: x.oferta }, { k: 'outras', l: 'Outras entradas', t: 'money', v: x.outras },
      { k: 'contaId', l: 'Conta onde o dinheiro entrou', t: 'select', o: opContas(true), v: caixa, req: true },
      { k: 'formaId', l: 'Forma', t: 'select', o: opFormas(true), v: din, req: true }, { k: 'obs', l: 'Observação', t: 'textarea' }
    ], 'Lançar no Livro', function (v) {
      var dif = num(v.dizimo) !== num(x.dizimo) || num(v.oferta) !== num(x.oferta) || num(v.outras) !== num(x.outras);
      if (dif && String(v.obs || '').length < 5) return Promise.reject(new Error('REASON_REQUIRED'));
      var itens = [];
      if (num(v.dizimo) > 0) itens.push({ rotulo: 'dizimo', valor: v.dizimo, informado: x.dizimo });
      if (num(v.oferta) > 0) itens.push({ rotulo: 'oferta', valor: v.oferta, informado: x.oferta });
      if (num(v.outras) > 0) itens.push({ rotulo: 'outras', valor: v.outras, informado: x.outras });
      return rpc('v39_fin_source_post', C({ p: { tipo: x.tipo, entidadeId: x.entidadeId, data: String(x.data).slice(0, 10), contaId: v.contaId, formaId: v.formaId, titulo: x.titulo, itens: itens, obs: v.obs || null } }))
        .then(function (r) { return 'Lançado no Livro: ' + brl(r && r.total); });
    });
  }

  /* ───────────── ENTRADA (inclui recebimento de campanha ou voto) ───────────── */
  function tEntrada() {
    corpo(avisoInicio() + '<div class="card"><h3>Nova entrada</h3><div class="g2f-mut" style="line-height:1.5">Dízimos, ofertas, doações, eventos e outras entradas. PIX e transferência exigem comprovante. ' +
      'Para registrar o pagamento de um participante de campanha ou voto, escolha o tipo <b>Recebimento de campanha ou voto</b> no formulário.</div>' +
      '<div class="g2f-tool" style="margin:12px 0 0">' + btn('novaEntrada', 'Registrar entrada', 'plus') + '</div></div>');
    return Promise.resolve();
  }
  function novaEntrada() {
    var pc = pode('financial.commitments.receive') && pode('financial.campaigns.view') ? rpc('v39_fin_campaigns', C({})).catch(function () { return CAMPS || []; }) : Promise.resolve(CAMPS || []);
    pc.then(function (l) { CAMPS = l || []; abrirFormEntrada(); });
  }
  function abrirFormEntrada() {
    var temCamp = pode('financial.commitments.receive');
    // a categoria de mesmo nome que já existe no banco é escondida: o tipo "Recebimento de campanha ou voto" aparece UMA vez
    var cats = opCats('income').filter(function (c) { return !temCamp || !/campanha|voto/.test(norm(c[1])); });
    var vistos = {}; cats = cats.filter(function (c) { var k = norm(c[1]).replace(/\(.*\)/, '').trim(); if (vistos[k]) return false; vistos[k] = 1; return true; });
    if (temCamp) cats = [['__camp', 'Recebimento de campanha ou voto']].concat(cats);
    var ehC = function (v) { return v.categoriaId === '__camp'; }, naoC = function (v) { return !ehC(v); };
    form('Nova entrada', [
      { k: 'categoriaId', l: 'Tipo de entrada', t: 'select', o: cats, req: true },
      { k: 'campanhaId', l: 'Campanha ou voto', t: 'select', o: opCampanhas(), req: true, vis: ehC, h: opCampanhas().length ? '' : 'Nenhuma campanha ativa. Crie uma em Campanhas.' },
      { k: 'compromissoId', l: 'Quem está pagando', t: 'select', req: true, vis: function (v) { return ehC(v) && !!v.campanhaId; }, opts: function (v) { return partsDe(v.campanhaId); }, unico: true,
        h: 'Só aparecem participantes com valor a receber.' },
      { k: 'data', l: 'Data', t: 'date', v: hoje(), req: true },
      { k: 'valor', l: 'Valor', t: 'money', req: true, fill: { dep: 'compromissoId', fn: function (v) { var x = achaComp(v.compromissoId); return x ? arr2(x.c.proximoValor || x.c.saldo) : null; } } },
      { k: 'contaId', l: 'Conta / caixa', t: 'select', o: opContas(true), req: true },
      { k: 'formaId', l: 'Forma de recebimento', t: 'select', o: opFormas(true), req: true, fill: { dep: 'compromissoId', fn: function (v) { var x = achaComp(v.compromissoId); return x && x.c.formaId ? x.c.formaId : null; } } },
      { k: 'anonimo', l: 'Contribuição anônima', t: 'check', vis: naoC },
      { k: 'pessoaId', l: 'Pessoa (se identificada)', t: 'pessoa', vis: naoC },
      { k: 'origemTipo', l: 'Origem', t: 'select', o: [['culto', 'Culto'], ['evento', 'Evento'], ['doacao', 'Doação'], ['avulsa', 'Avulsa']], vazio: '— avulsa —', vis: naoC },
      { k: 'descricao', l: 'Descrição', h: 'Se vazio, usa o nome da categoria.', vis: naoC },
      { k: 'arq', l: 'Comprovante', t: 'file' }, { k: 'obs', l: 'Observação', t: 'textarea' }
    ], 'Lançar', function (v) {
      var tp = formaTipo(v.formaId);
      if ((tp === 'pix' || tp === 'bank_transfer') && !v.arq) return Promise.reject(new Error('FIN_EVIDENCE_REQUIRED'));
      if (v.categoriaId === '__camp') {
        var x = achaComp(v.compromissoId); if (!x) return Promise.reject(new Error('Escolha a campanha e quem está pagando.'));
        return enviarComprovante(v.arq).then(function (ev) {
          return rpc('v39_fin_commitment_receive', C({ p: { compromissoId: v.compromissoId, data: v.data, valor: v.valor, contaId: v.contaId, formaId: v.formaId, comprovanteId: ev, obs: v.obs || null, chave: uuid() } }));
        }).then(function () { setTimeout(function () { ofertarRecibo(x.g, x.c, v.valor); }, 500); return 'Recebimento lançado e baixado da campanha.'; });
      }
      return enviarComprovante(v.arq).then(function (ev) {
        return rpc('v39_fin_post_income', C({ p: { data: v.data, valor: v.valor, categoriaId: v.categoriaId, contaId: v.contaId, formaId: v.formaId, anonimo: v.anonimo || !v.pessoaId, pessoaId: v.pessoaId || null, origemTipo: v.origemTipo || null, descricao: v.descricao, comprovanteId: ev, obs: v.obs || null, chave: uuid() } }));
      }).then(function () { return 'Entrada lançada.'; });
    });
  }

  /* ───────────── DESPESAS ───────────── */
  var DESP = [], RECS = [];
  function linhaDesp(e) {
    var a = [], st = e.status;
    if ((st === 'draft' || st === 'correction_requested') && e.meu) { a.push(bt('editDesp', e.id, 'Editar', 'sec')); a.push(bt('enviarDesp', e.id, 'Enviar p/ aprovação')); }
    if (st === 'pending_approval' && !e.souSolicitante) {
      if (pode('financial.expenses.approve')) a.push(bt('aprovarDesp', e.id, 'Aprovar'));
      if (pode('financial.expenses.request_correction')) a.push(bt('corrigirDesp', e.id, 'Pedir correção', 'sec'));
      if (pode('financial.expenses.reject')) a.push(bt('recusarDesp', e.id, 'Recusar', 'red'));
    }
    if ((st === 'approved' || st === 'partially_paid') && tes() && pode('financial.expenses.pay')) a.push(bt('pagarDesp', e.id, 'Pagar'));
    if (['draft', 'correction_requested', 'pending_approval', 'approved'].indexOf(st) >= 0 && (e.meu || tes())) a.push(bt('cancDesp', e.id, 'Cancelar', 'red'));
    if (tes() && pode('financial.expenses.reverse')) (e.pagamentos || []).forEach(function (p) { if (p.status === 'posted') a.push(bt('estPag', p.id, 'Estornar pgto ' + dataBR(p.data), 'red')); });
    if (e.comprovantePath) a.push(bt('verComp', e.comprovantePath, 'Documento', 'sec'));
    var tom = st === 'paid' ? 'verde' : (st === 'pending_approval' || st === 'correction_requested') ? 'amarelo' : (st === 'rejected' || st === 'cancelled') ? 'vermelho' : 'cinza';
    return '<div class="row g2f-mv"><span class="g2f-ri ' + (st === 'paid' ? 'in' : 'out') + '">' + ic('receipt') + '</span><div class="info"><div class="nm">' + esc(e.descricao) + '</div>' +
      '<div class="sb">' + esc([e.categoria, e.fornecedor, e.vencimento ? 'vence ' + dataBR(e.vencimento) : '', e.solicitante ? 'por ' + e.solicitante : ''].filter(Boolean).join(' · ')) + '</div>' +
      (e.motivo ? '<div class="sb">Motivo: ' + esc(e.motivo) + '</div>' : '') + (e.boleto && e.boleto.linha ? '<div class="sb">Boleto: ' + esc(e.boleto.linha) + '</div>' : '') + '</div>' +
      '<div class="g2f-amt"><span>' + brl(e.aprovado || e.valor) + '</span>' + (num(e.pago) ? '<span class="g2f-mut">pago ' + brl(e.pago) + '</span>' : '') + pill((ROT.desp[st] || st).toLowerCase(), tom) + '</div>' +
      (a.length ? '<div class="g2f-acts g2f-noprint">' + a.join('') + '</div>' : '') + '</div>';
  }
  function tDespesas() {
    var ps = [rpc('v39_fin_expenses', C({ p_filter: S.despFiltro }))];
    if (pode('financial.recurrences.manage')) ps.push(rpc('v39_fin_recurrences', C({})));
    return Promise.all(ps).then(function (r) {
      DESP = r[0] || []; RECS = r[1] || [];
      var h = '<div class="g2f-tool g2f-noprint">' + (pode('financial.expenses.create') ? btn('novaDesp', 'Nova despesa', 'plus') : '') +
        (pode('financial.expenses.create') || pode('financial.bills.manage') ? btn('novoFornec', 'Fornecedor', 'plus', 'g2f-soft') : '') + '</div>';
      h += '<div class="chips g2f-noprint">' + [['abertas', 'Em andamento'], ['encerradas', 'Encerradas (120 dias)'], ['todas', 'Todas']].map(function (f) {
        return '<button type="button" data-a="despFiltro" data-v="' + f[0] + '" class="' + (S.despFiltro === f[0] ? 'on' : '') + '">' + f[1] + '</button>'; }).join('') + '</div>';
      h += '<div class="card lp">' + (DESP.length ? DESP.map(linhaDesp).join('') : '<div class="empty">Nenhuma despesa neste filtro.</div>') + '</div>' +
        '<div class="g2f-note">Solicitar → aprovar → pagar. Aprovar não mexe no saldo; só o pagamento sai da conta. Quem solicitou não decide o próprio pedido.</div>';
      if (pode('financial.recurrences.manage')) {
        h += '<div class="sec">Contas fixas</div><div class="g2f-tool g2f-noprint">' + btn('novaRec', 'Conta fixa', 'plus', 'g2f-soft') + '</div><div class="card lp">' + (RECS.length ? RECS.map(function (rc) {
          return '<div class="row g2f-mv"><span class="g2f-ri pri">' + ic('repeat') + '</span><div class="info"><div class="nm">' + esc(rc.nome) + (rc.status !== 'active' ? ' ' + pill('pausada', 'cinza') : '') + '</div>' +
            '<div class="sb">' + esc((ROT.rec[rc.tipo] || rc.tipo) + ' · próximo ' + dataBR(rc.proximo)) + '</div></div><div class="g2f-amt"><span>' + brl(rc.valor) + '</span></div>' +
            '<div class="g2f-acts">' + bt('editRec', rc.id, 'Editar', 'sec') + (rc.status === 'active' ? bt('gerarRec', rc.id, 'Gerar despesa do mês') : '') + '</div></div>';
        }).join('') : '<div class="empty">Nenhuma conta fixa.</div>') + '</div>';
      }
      corpo(h);
    });
  }
  function despesa(id) { return DESP.filter(function (x) { return x.id === id; })[0] || null; }
  function formDesp(e) {
    e = e || {};
    form(e.id ? 'Editar despesa' : 'Nova despesa', [
      { k: 'descricao', l: 'Descrição', v: e.descricao, req: true },
      { k: 'categoriaId', l: 'Categoria', t: 'select', o: opCats('expense'), v: e.categoriaId, req: true },
      { k: 'valor', l: 'Valor', t: 'money', v: e.valor, req: true },
      { k: 'fornecedorId', l: 'Fornecedor / beneficiário', t: 'select', o: opFornec(), v: e.fornecedorId, vazio: '— nenhum —' },
      { k: 'emissao', l: 'Emissão', t: 'date', v: e.emissao ? String(e.emissao).slice(0, 10) : '' },
      { k: 'vencimento', l: 'Vencimento', t: 'date', v: e.vencimento ? String(e.vencimento).slice(0, 10) : '' },
      { k: 'competencia', l: 'Competência (mês de referência)', t: 'date', v: e.competencia ? String(e.competencia).slice(0, 10) : '' },
      { k: 'linhaDigitavel', l: 'Linha digitável do boleto (opcional)' },
      { k: 'arq', l: 'Documento / nota / boleto', t: 'file' }, { k: 'obs', l: 'Observação', t: 'textarea', v: e.obs },
      { k: 'enviar', l: 'Já enviar para aprovação', t: 'check', v: !e.id }
    ], 'Salvar', function (v) {
      return enviarComprovante(v.arq).then(function (ev) {
        return rpc('v39_fin_expense_save', C({ p_id: e.id || null, p: { descricao: v.descricao, categoriaId: v.categoriaId, valor: v.valor, fornecedorId: v.fornecedorId || null, emissao: v.emissao || null, vencimento: v.vencimento || null, competencia: v.competencia || null, linhaDigitavel: v.linhaDigitavel || null, comprovanteId: ev, obs: v.obs || null, chave: uuid() } }));
      }).then(function (r) {
        var id = r && r.id;
        if (v.enviar && id && pode('financial.expenses.submit')) return rpc('v39_fin_expense_submit', C({ p_id: id })).then(function () { return 'Despesa enviada para aprovação.'; });
        return 'Despesa salva como rascunho.';
      });
    });
  }
  function pagarDesp(id) {
    var e = despesa(id); if (!e) return;
    var saldo = arr2(num(e.aprovado || e.valor) - num(e.pago)), cart = opCartoes();
    var conta = function (v) { return v.meio !== 'cartao'; }, cartao = function (v) { return v.meio === 'cartao'; };
    form('Pagar · ' + e.descricao, [
      { t: 'info', l: 'Aprovado ' + brl(e.aprovado || e.valor) + ' · já pago ' + brl(e.pago) + ' · a pagar ' + brl(saldo) },
      { k: 'data', l: 'Data do pagamento', t: 'date', v: hoje(), req: true }, { k: 'valor', l: 'Valor pago', t: 'money', v: saldo, req: true },
      { k: 'meio', l: 'Pagar com', t: 'select', o: [['conta', 'Conta / caixa']].concat(cart.length ? [['cartao', 'Cartão de crédito']] : []), v: 'conta', vazio: false },
      { k: 'contaId', l: 'Conta', t: 'select', o: opContas(true), vis: conta }, { k: 'formaId', l: 'Forma', t: 'select', o: opFormas(true), vis: conta },
      { k: 'arq', l: 'Comprovante do pagamento', t: 'file', vis: conta, h: 'Obrigatório em conta/caixa.' },
      { k: 'cartaoId', l: 'Cartão', t: 'select', o: cart, vis: cartao }, { k: 'parcelas', l: 'Parcelas no cartão', t: 'number', v: 1, vis: cartao, h: 'No cartão lance o valor total; as parcelas vão para as próximas faturas.' },
      { k: 'obs', l: 'Observação', t: 'textarea' }
    ], 'Registrar pagamento', function (v) {
      if (v.meio === 'cartao') {
        if (!v.cartaoId) return Promise.reject(new Error('FIN_CARD_INVALID'));
        return rpc('v39_fin_expense_pay', C({ p_id: id, p: { data: v.data, valor: v.valor, cartaoId: v.cartaoId, parcelas: Math.max(1, Math.min(24, parseInt(v.parcelas, 10) || 1)), obs: v.obs || null, chave: uuid() } })).then(function () { return 'Compra lançada no cartão.'; });
      }
      if (!v.contaId) return Promise.reject(new Error('FIN_ACCOUNT_INVALID'));
      if (!v.formaId) return Promise.reject(new Error('FIN_METHOD_INVALID'));
      if (!v.arq) return Promise.reject(new Error('FIN_EVIDENCE_REQUIRED'));
      return enviarComprovante(v.arq).then(function (ev) {
        return rpc('v39_fin_expense_pay', C({ p_id: id, p: { data: v.data, valor: v.valor, contaId: v.contaId, formaId: v.formaId, comprovanteId: ev, obs: v.obs || null, chave: uuid() } }));
      }).then(function () { return 'Pagamento registrado.'; });
    });
  }
  function formRec(r) {
    r = r || {};
    form(r.id ? 'Editar conta fixa' : 'Nova conta fixa', [
      { k: 'nome', l: 'Nome', v: r.nome, req: true }, { k: 'categoriaId', l: 'Categoria', t: 'select', o: opCats('expense'), v: r.categoriaId, req: true },
      { k: 'fornecedorId', l: 'Fornecedor', t: 'select', o: opFornec(), v: r.fornecedorId, vazio: '— nenhum —' }, { k: 'valor', l: 'Valor padrão', t: 'money', v: r.valor, req: true },
      { k: 'tipo', l: 'Periodicidade', t: 'select', o: [['monthly', 'Mensal'], ['quarterly', 'Trimestral'], ['semiannual', 'Semestral'], ['annual', 'Anual']], v: r.tipo || 'monthly', vazio: false },
      { k: 'inicio', l: 'Primeiro vencimento', t: 'date', v: r.inicio ? String(r.inicio).slice(0, 10) : '', req: !r.id },
      { k: 'fim', l: 'Termina em (opcional)', t: 'date', v: r.fim ? String(r.fim).slice(0, 10) : '' },
      { k: 'status', l: 'Situação', t: 'select', o: [['active', 'Ativa'], ['paused', 'Pausada']], v: r.status || 'active', vazio: false }, { k: 'obs', l: 'Observação', t: 'textarea', v: r.obs }
    ], 'Salvar', function (v) {
      return rpc('v39_fin_recurrence_save', C({ p_id: r.id || null, p: { nome: v.nome, categoriaId: v.categoriaId, fornecedorId: v.fornecedorId || null, valor: v.valor, tipo: v.tipo, inicio: v.inicio || r.inicio, fim: v.fim || null, status: v.status, obs: v.obs || null } })).then(function () { return 'Conta fixa salva.'; });
    });
  }

  /* ───────────── TRANSFERÊNCIAS E CARTÕES ───────────── */
  var FATS = [];
  function tTransf() {
    var ps = [pode('financial.book.view') ? rpc('v39_fin_transfers', C({ p_year: S.ano, p_month: S.mes })) : Promise.resolve([]), pode('financial.book.view') ? rpc('v39_fin_card_statements', C({})) : Promise.resolve([])];
    return Promise.all(ps).then(function (r) {
      var T = r[0] || []; FATS = r[1] || []; var h = '';
      if (pode('financial.transfers.manage')) {
        h += '<div class="g2f-tool g2f-noprint">' + (tes() ? btn('novaTransf', 'Transferir', 'swap') : '') + '</div><div class="sec">Transferências</div><div class="card lp">' + (T.length ? T.map(function (t) {
          return '<div class="row g2f-mv"><span class="g2f-ri">' + ic('swap') + '</span><div class="info"><div class="nm">' + esc(t.origem) + ' → ' + esc(t.destino) + '</div><div class="sb">' + esc(dataBR(t.data) + (t.descricao ? ' · ' + t.descricao : '')) + '</div></div>' +
            '<div class="g2f-amt"><span>' + brl(t.valor) + '</span>' + pill((ROT.movSt[t.status] || t.status).toLowerCase(), 'cinza') + '</div>' +
            (((t.status === 'posted' || t.status === 'reconciled') && tes()) ? '<div class="g2f-acts">' + bt('estTransf', t.id, 'Estornar', 'red') + '</div>' : '') + '</div>';
        }).join('') : '<div class="empty">Nenhuma transferência em ' + MESES[S.mes - 1] + '.</div>') + '</div><div class="g2f-note">Transferir não é entrada nem saída: tira de uma conta e põe na outra (ex.: depósito do caixa no banco).</div>';
      }
      if (pode('financial.cards.manage') || FATS.length) {
        var K = (S.cat && S.cat.cartoes) || [];
        h += '<div class="sec">Cartões</div><div class="g2f-tool g2f-noprint">' + (pode('financial.cards.manage') ? btn('novoCartao', 'Cartão', 'plus', 'g2f-soft') : '') + '</div><div class="card lp">' + (K.length ? K.map(function (k) {
          return '<div class="row g2f-mv"><span class="g2f-ri pri">' + ic('card') + '</span><div class="info"><div class="nm">' + esc(k.nome) + ' •' + esc(k.final) + (k.status !== 'active' ? ' ' + pill('inativo', 'cinza') : '') + '</div><div class="sb">' + esc((k.banco || '') + ' · fecha dia ' + k.fechamento + ' · vence dia ' + k.vencimento) + '</div></div>' +
            (pode('financial.cards.manage') ? '<div class="g2f-acts">' + bt('editCartao', k.id, 'Editar', 'sec') + '</div>' : '') + '</div>';
        }).join('') : '<div class="empty">Nenhum cartão.</div>') + '</div>';
        h += '<div class="sec">Faturas</div><div class="card lp">' + (FATS.length ? FATS.map(function (s, i) {
          return '<div class="row g2f-mv"><span class="g2f-ri amb">' + ic('receipt') + '</span><div class="info"><div class="nm">' + esc(s.cartao) + ' · ' + pad(s.mes) + '/' + s.ano + '</div><div class="sb">' + esc('vence ' + dataBR(s.vencimento) + ' · compras ' + brl(s.compras) + ' · pago ' + brl(s.pago)) + '</div></div>' +
            '<div class="g2f-amt"><span>' + brl(s.aberto) + '</span>' + pill((ROT.fat[s.status] || s.status).toLowerCase(), s.status === 'paid' ? 'verde' : 'amarelo') + '</div>' +
            '<div class="g2f-acts">' + bt('verFatura', i, 'Itens', 'sec') + (tes() && pode('financial.expenses.pay') && num(s.aberto) > 0 && s.status !== 'paid' ? bt('pagarFatura', i, 'Pagar fatura') : '') + '</div></div>';
        }).join('') : '<div class="empty">Nenhuma fatura.</div>') + '</div><div class="g2f-note">A compra no cartão é a despesa; pagar a fatura só liquida (não duplica a despesa).</div>';
      }
      corpo(h || '<div class="card"><div class="empty">Sem acesso a transferências ou cartões.</div></div>');
    });
  }
  function formCartao(k) {
    k = k || {};
    form(k.id ? 'Editar cartão' : 'Novo cartão', [
      { k: 'nome', l: 'Nome do cartão', v: k.nome, req: true }, { k: 'banco', l: 'Banco / emissor', v: k.banco, req: true }, { k: 'final', l: '4 últimos dígitos', v: k.final, req: true },
      { k: 'fechamento', l: 'Dia de fechamento', t: 'number', v: k.fechamento, req: true }, { k: 'vencimento', l: 'Dia de vencimento', t: 'number', v: k.vencimento, req: true },
      { k: 'contaId', l: 'Conta que paga a fatura', t: 'select', o: opContas(true), v: k.contaId, req: true },
      { k: 'responsavelId', l: 'Responsável pelo cartão', t: 'pessoa', v: k.responsavelId || '', h: 'Se vazio, fica você.' },
      { k: 'status', l: 'Situação', t: 'select', o: [['active', 'Ativo'], ['inactive', 'Inativo']], v: k.status || 'active', vazio: false }
    ], 'Salvar', function (v) {
      if (!/^[0-9]{4}$/.test(v.final)) return Promise.reject(new Error('FIN_CARD_INVALID'));
      return rpc('v39_fin_card_save', C({ p_id: k.id || null, p: { nome: v.nome, banco: v.banco, final: v.final, fechamento: parseInt(v.fechamento, 10), vencimento: parseInt(v.vencimento, 10), contaId: v.contaId, responsavelId: v.responsavelId || k.responsavelId || null, status: v.status } })).then(function () { return 'Cartão salvo.'; });
    });
  }

  /* ───────────── CONCILIAÇÃO ───────────── */
  var CONC = null;
  function tConc() {
    var contas = opContas(false);
    if (!S.concConta && contas.length) S.concConta = contas[0][0];
    var h = '<div class="g2f-tool g2f-noprint"><select data-c="concConta" aria-label="Conta" style="flex:1 1 200px">' + contas.map(function (c) { return '<option value="' + esc(c[0]) + '"' + (c[0] === S.concConta ? ' selected' : '') + '>' + esc(c[1]) + '</option>'; }).join('') + '</select>' +
      '<label class="g2f-btn g2f-soft" style="cursor:pointer">' + ic('dl') + 'Importar extrato<input type="file" data-c="extrato" accept=".ofx,.csv,.txt" hidden></label>' + btn('fecharConc', 'Saldo do extrato', 'scale', 'g2f-soft') + '</div>';
    if (!S.concConta) { corpo(h + '<div class="card"><div class="empty">Cadastre uma conta primeiro.</div></div>'); return Promise.resolve(); }
    return rpc('v39_fin_statement_view', C({ p_account: S.concConta, p_year: S.ano, p_month: S.mes })).then(function (x) {
      CONC = x || {}; var L = CONC.linhas || [], P = CONC.pendentes || [];
      var tem = CONC.sessao && CONC.sessao.saldoExtrato != null, difs = tem ? arr2(num(CONC.sessao.saldoExtrato) - num(CONC.saldoSistema)) : null;
      h += '<div class="stats">' + stat('No sistema', brl(CONC.saldoSistema), 'pri', 'wallet', '', 'fim do mês') + stat('No extrato', tem ? brl(CONC.sessao.saldoExtrato) : '—', 'pri', 'bank') +
        stat('Diferença', difs == null ? '—' : brl(difs), difs ? 'out' : 'in', 'scale', difs ? 'g2f-neg' : 'g2f-pos') + '</div>';
      h += '<div class="sec">Linhas do extrato</div><div class="card lp">' + (L.length ? L.map(function (l) {
        var acts = '', sub = dataBR(l.data);
        if (l.status === 'matched') sub += ' · conciliada';
        else if (l.status === 'ignored') acts = bt('ignLinha', l.id, 'Voltar', 'sec');
        else acts = (l.sugestoes || []).map(function (m) { return bt('casar', l.id + '|' + m.id, 'Casar com ' + dataBR(m.data) + ' ' + m.descricao); }).join('') + bt('ignLinha', l.id, 'Ignorar', 'sec');
        if (l.status !== 'matched' && l.status !== 'ignored' && !(l.sugestoes || []).length) sub += ' · sem lançamento igual (±3 dias): lance a entrada/saída e volte aqui';
        return '<div class="row g2f-mv"><span class="g2f-ri ' + (num(l.valor) < 0 ? 'out' : 'in') + '">' + ic(num(l.valor) < 0 ? 'up' : 'down') + '</span><div class="info"><div class="nm">' + esc(l.descricao) + '</div><div class="sb">' + esc(sub) + '</div></div>' +
          '<div class="g2f-amt"><span class="' + (num(l.valor) < 0 ? 'g2f-neg' : 'g2f-pos') + '">' + brl(l.valor) + '</span>' + (l.status === 'matched' ? pill('conciliada', 'verde') : l.status === 'ignored' ? pill('ignorada', 'cinza') : '') + '</div>' +
          (acts ? '<div class="g2f-acts">' + acts + '</div>' : '') + '</div>';
      }).join('') : '<div class="empty">Nenhuma linha importada para este mês. Você também pode conciliar manualmente abaixo.</div>') + '</div>';
      h += '<div class="sec">Lançamentos do mês nesta conta</div><div class="card lp">' + (P.length ? P.map(function (m) {
        return '<div class="row g2f-mv"><span class="g2f-ri ' + (num(m.valor) < 0 ? 'out' : 'in') + '">' + ic(num(m.valor) < 0 ? 'up' : 'down') + '</span><div class="info"><div class="nm">' + esc(m.descricao) + '</div><div class="sb">' + esc(dataBR(m.data)) + '</div></div>' +
          '<div class="g2f-amt"><span class="' + (num(m.valor) < 0 ? 'g2f-neg' : 'g2f-pos') + '">' + brl(m.valor) + '</span>' + (m.status === 'reconciled' ? pill('conciliado', 'verde') : '') + '</div>' +
          '<div class="g2f-acts">' + (m.status === 'reconciled' ? bt('desconc', m.id, 'Desconciliar', 'sec') : bt('conc', m.id, 'Conciliar')) + '</div></div>';
      }).join('') : '<div class="empty">Nenhum lançamento.</div>') + '</div>';
      corpo(h);
    });
  }
  function lerExtrato(nome, txt) {
    var linhas = [];
    if (/<STMTTRN>/i.test(txt)) {
      txt.split(/<STMTTRN>/i).slice(1).forEach(function (b) {
        function tag(t) { var m = b.match(new RegExp('<' + t + '>([^<\\r\\n]*)', 'i')); return m ? m[1].trim() : ''; }
        var dt = tag('DTPOSTED'), v = lerValor(tag('TRNAMT').replace(',', '.')), id = tag('FITID');
        if (dt.length >= 8 && v != null) linhas.push({ fitid: id || (dt + '|' + v + '|' + tag('MEMO')), data: dt.slice(0, 4) + '-' + dt.slice(4, 6) + '-' + dt.slice(6, 8), valor: v, descricao: (tag('MEMO') || tag('NAME')).slice(0, 300) });
      });
      return { fonte: 'ofx', linhas: linhas };
    }
    txt.split(/\r?\n/).forEach(function (ln, i) {
      var c = ln.split(ln.indexOf(';') >= 0 ? ';' : ','); if (c.length < 3) return;
      var d = String(c[0]).trim().replace(/"/g, ''), m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/), iso = m ? m[3] + '-' + m[2] + '-' + m[1] : (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
      var v = lerValor(String(c[c.length - 1]).replace(/"/g, '')), desc = c.slice(1, c.length - 1).join(' ').replace(/"/g, '').trim();
      if (!iso || v == null || v === 0) return;
      linhas.push({ fitid: 'csv|' + iso + '|' + v + '|' + desc.slice(0, 60) + '|' + i, data: iso, valor: v, descricao: desc.slice(0, 300) });
    });
    return { fonte: 'csv', linhas: linhas };
  }
  function importarExtrato(arq) {
    if (!arq) return;
    if (arq.size > 3 * 1024 * 1024) return toast('Arquivo grande demais (máx. 3 MB).');
    var fr = new FileReader();
    fr.onload = function () {
      var r = lerExtrato(arq.name, String(fr.result || ''));
      if (!r.linhas.length) return toast('Nenhuma linha reconhecida. Use OFX, ou CSV com data;descrição;valor.');
      rpc('v39_fin_statement_import', C({ p_account: S.concConta, p_lines: r.linhas, p_source: r.fonte, p_file: arq.name }))
        .then(function (x) { toast('Extrato: ' + x.novas + ' linha(s) nova(s), ' + x.repetidas + ' repetida(s).'); S.cache = null; recarregar(); })
        .catch(function (e) { toast(traduz(e)); });
    };
    fr.onerror = function () { toast('Não foi possível ler o arquivo.'); };
    fr.readAsText(arq, /\.ofx$/i.test(arq.name) ? 'ISO-8859-1' : 'UTF-8');
  }

  /* ───────────── CAMPANHAS E VOTOS ───────────── */
  var FILA = [];
  function compromisso(ref) { var p = String(ref).split('|'), g = CAMPS[+p[0]]; return g ? { g: g, c: (g.compromissos || [])[+p[1]], gi: +p[0], ci: +p[1] } : null; }
  function blocoFila() {
    if (!pode('financial.commitments.communicate')) return '';
    if (!SENT) return '<div class="aviso">Para controlar as mensagens da campanha, rode o <b>v39_campanhas_equipe_c2.sql</b> no Supabase.</div>';
    FILA = filaMsgs(); if (!FILA.length) return '';
    var tt = { inicio: 'Início da campanha', venc: 'Vencimento hoje', atraso: 'Parcela atrasada' };
    return '<div class="sec">Mensagens para enviar (' + FILA.length + ')</div><div class="card lp">' + FILA.map(function (q, i) {
      var g = CAMPS[q.gi], c = g.compromissos[q.ci], url = waLink(c.telefone, msgTexto(q.tipo, g, c, { n: q.n }));
      return '<div class="row g2f-mv"><span class="g2f-ri ' + (q.tipo === 'atraso' ? 'out' : q.tipo === 'venc' ? 'amb' : 'in') + '">' + ic('chat') + '</span><div class="info"><div class="nm">' + esc(c.pessoa) + '</div>' +
        '<div class="sb">' + esc(tt[q.tipo] + ' · ' + g.nome + (q.tipo === 'atraso' ? ' · há ' + q.dias + ' dia(s)' : '') + (c.telefone ? '' : ' · sem telefone')) + '</div></div>' +
        '<div class="g2f-acts">' + (url ? '<a class="g2f-ib t ok" href="' + esc(url) + '" target="_blank" rel="noopener" data-a="msgEnv" data-v="' + i + '">' + ic('send') + '<span>Enviar</span></a>' : '<button type="button" class="g2f-ib t" disabled>sem nº</button>') +
        bt('msgDisp', i, 'Dispensar', 'sec') + '</div></div>';
    }).join('') + '</div><div class="g2f-note">Toque em Enviar: o WhatsApp abre com a mensagem pronta e o envio fica registrado. "Dispensar" tira da fila sem enviar. As mensagens não mostram saldo nem valores em aberto.</div>';
  }
  function linhaPart(g, gi, c, ci) {
    var ac = num(c.acordado), pc = ac > 0 ? Math.min(100, Math.round(num(c.recebido) / ac * 100)) : 0, forma = formaNome(c.formaId), ds = c.datas || [], a = [];
    var aberto = ['active', 'due_soon', 'overdue'].indexOf(c.status) >= 0;
    if (tes() && pode('financial.commitments.receive') && aberto && num(c.saldo) > 0) a.push(bt('receber', gi + '|' + ci, 'Receber'));
    if (pode('financial.commitments.communicate')) a.push(bt('zap', gi + '|' + ci, 'WhatsApp'));
    if (pode('financial.commitments.update') && aberto && num(c.recebido) === 0 && ds.length) a.push(bt('editParc', gi + '|' + ci, 'Editar datas', 'sec'));
    if (pode('financial.commitments.cancel') && ['paid', 'cancelled'].indexOf(c.status) < 0) a.push(bt('cancComp', c.id, 'Cancelar', 'red'));
    if (tes() && pode('financial.commitments.reverse')) (c.recebimentos || []).forEach(function (r) { if (r.status === 'posted') a.push(bt('estRec', r.id, 'Estornar ' + dataBR(r.data), 'red')); });
    var tom = c.status === 'paid' ? 'verde' : c.status === 'overdue' ? 'vermelho' : c.status === 'due_soon' ? 'amarelo' : 'cinza';
    return '<div class="row g2f-pt g2f-mv"><span class="av">' + esc(iniciais(c.pessoa)) + '</span><div class="info"><div class="nm">' + esc(c.pessoa) + '</div>' +
      '<div class="sb">' + esc(brl(c.acordado) + ' · ' + (c.parcelas > 1 ? c.parcelas + 'x' : 'à vista') + (forma ? ' · ' + forma : '') + (c.proximo ? ' · próxima ' + dataCurta(c.proximo) + ' (' + brl(c.proximoValor) + ')' : '')) + '</div>' +
      '<div class="g2f-prog sm"><i style="width:' + pc + '%"></i></div>' +
      '<div class="sb">Pago ' + esc(brl(c.recebido) + ' de ' + brl(c.acordado)) + (num(c.saldo) > 0 ? ' · falta ' + esc(brl(c.saldo)) : '') + '</div>' +
      (ds.length > 1 || (ds.length === 1 && ds[0].status !== 'paid') ? '<details class="g2f-par"><summary>Parcelas</summary>' + ds.map(function (d) {
        return '<div>' + d.n + 'ª · ' + esc(dataBR(d.venc)) + ' · ' + esc(brl(d.valor)) + ' · ' + (d.status === 'paid' ? 'paga' : num(d.recebido) > 0 ? 'parcial (' + esc(brl(d.recebido)) + ')' : 'a vencer') + '</div>'; }).join('') + '</details>' : '') + '</div>' +
      '<div class="g2f-amt">' + pill((ROT.comp[c.status] || c.status).toLowerCase(), tom) + '</div>' + (a.length ? '<div class="g2f-acts g2f-noprint">' + a.join('') + '</div>' : '') + '</div>';
  }
  // Meta da campanha em destaque: meta, já recebido, QUANTO FALTA para a meta e o que ainda vai entrar dos acordos
  function blocoMeta(g) {
    var ac = num(g.acordado), rc = num(g.recebido), meta = num(g.meta), aRec = arr2(Math.max(0, ac - rc));
    if (!(meta > 0)) {
      return '<div class="stats">' + stat('Acordado', brl(ac), 'pri', 'flag', '', 'soma dos compromissos') + stat('Já recebido', brl(rc), 'in', 'down', 'g2f-pos') + stat('A receber dos acordos', brl(aRec), 'amb', 'clock', '', 'combinado, ainda não pago') + '</div>' +
        '<div class="aviso">Esta campanha ainda não tem <b>meta</b>. Toque no lápis para informar o valor total que a campanha quer arrecadar; assim a tela mostra quanto já foi recebido e quanto ainda falta.</div>';
    }
    var falta = arr2(Math.max(0, meta - rc)), semComp = arr2(Math.max(0, meta - ac)), pr = Math.min(100, Math.round(rc / meta * 100)), pa = Math.min(100, Math.round(ac / meta * 100));
    return '<div class="stats">' +
      stat('Meta da campanha', brl(meta), 'pri', 'target', '', 'valor total a arrecadar') +
      stat('Já recebido', brl(rc), 'in', 'down', 'g2f-pos', pr + '% da meta') +
      stat('Falta para a meta', brl(falta), falta > 0 ? 'amb' : 'in', 'flag', falta > 0 ? 'g2f-neg' : 'g2f-pos', falta > 0 ? 'ainda a arrecadar' : 'meta atingida 🎉') +
      stat('A receber dos acordos', brl(aRec), 'pri', 'clock', '', 'combinado, ainda não pago') + '</div>' +
      '<div class="g2f-pl" role="img" aria-label="' + pr + '% da meta recebido e ' + pa + '% acordado"><i class="ac" style="width:' + pa + '%"></i><i class="rc" style="width:' + pr + '%"></i></div>' +
      '<div class="g2f-note" style="margin:6px 2px 8px">Verde = já recebido (' + pr + '%) · azul claro = acordado (' + pa + '%). ' +
      (semComp > 0 ? 'Ainda faltam ' + esc(brl(semComp)) + ' em compromissos para cobrir a meta.' : 'Os compromissos já cobrem toda a meta.') + '</div>';
  }
  function cardCamp(g, gi) {
    var cs = g.compromissos || [], abre = ['draft', 'planned', 'active'].indexOf(g.status) >= 0;
    var h = '<div class="card"><div class="row g2f-mv" style="border:none;padding:0 0 8px"><span class="g2f-ri pri">' + ic('flag') + '</span><div class="info"><div class="nm">' + esc(g.nome) + ' ' + pill(ROT.campTipo[g.tipo] || g.tipo, 'dour') + ' ' + pill((ROT.camp[g.status] || g.status).toLowerCase(), g.status === 'active' ? 'verde' : 'cinza') + '</div>' +
      '<div class="sb">' + esc([g.objetivo, g.responsavel ? 'Responsável: ' + g.responsavel : '', dataBR(g.inicio) + (g.fim ? ' a ' + dataBR(g.fim) : '')].filter(Boolean).join(' · ')) + '</div></div>' +
      '<div class="g2f-acts g2f-noprint">' + (pode('financial.campaigns.manage') && abre ? bt('editCamp', gi, 'Editar', 'sec') : '') + (pode('financial.commitments.create') && abre ? bt('novoCompCamp', gi, 'Participante') : '') + '</div></div>' +
      blocoMeta(g) +
      '<div class="g2f-note" style="margin:2px 2px 6px">Os valores desta área são internos: o participante recebe só o resumo do próprio compromisso.</div>';
    h += cs.length ? '<div>' + cs.map(function (c, ci) { return linhaPart(g, gi, c, ci); }).join('') + '</div>' : '<div class="empty">Nenhum participante ainda. Use "Participante" para incluir quem vai contribuir.</div>';
    return h + '</div>';
  }
  function tCamp() {
    return Promise.all([rpc('v39_fin_campaigns', C({})), carregarSent()]).then(function (r) {
      CAMPS = r[0] || [];
      var h = '<div class="g2f-tool g2f-noprint">' + (pode('financial.campaigns.manage') ? btn('novaCamp', 'Campanha ou voto', 'plus') : '') +
        (pode('financial.commitments.create') && opCampanhas().length ? btn('novoComp', 'Participante', 'userplus', 'g2f-soft') : '') + '</div>';
      h += '<details class="card g2f-help"><summary>' + ic('info') + 'Campanha ou compromisso? Entenda a diferença</summary>' +
        '<p><b>Campanha</b> (ou <b>voto</b>) é o projeto: nome, objetivo, período e meta — por exemplo, a "Reforma do templo".</p>' +
        '<p><b>Compromisso</b> é a promessa de cada pessoa dentro da campanha: quanto vai dar, de que forma e em quais datas. Uma campanha tem vários participantes, cada um com o seu compromisso, e cada pagamento recebido baixa o compromisso daquela pessoa.</p>' +
        '<p>O que já foi pago e o que ainda falta receber aparece aqui e no Livro (como "a receber · previsto"). O participante nunca recebe esses valores.</p></details>';
      h += blocoFila();
      h += CAMPS.length ? CAMPS.map(cardCamp).join('') : '<div class="card"><div class="empty">Nenhuma campanha ainda.</div></div>';
      corpo(h);
    });
  }
  function formCamp(g) {
    g = g || {};
    form(g.id ? 'Editar campanha' : 'Nova campanha ou voto', [
      { k: 'nome', l: 'Nome', v: g.nome, req: true },
      { k: 'tipo', l: 'Tipo', t: 'select', o: [['campaign', 'Campanha'], ['vow', 'Voto'], ['project', 'Projeto'], ['fundraising', 'Arrecadação'], ['other', 'Outra']], v: g.tipo || 'campaign', vazio: false },
      { k: 'objetivo', l: 'Objetivo / projeto', t: 'textarea', v: g.objetivo, req: true },
      { k: 'responsavelId', l: 'Responsável', t: 'pessoa', v: g.responsavelId || '', nome: g.responsavel || '', h: 'Se vazio, fica você.' },
      { k: 'inicio', l: 'Início da campanha', t: 'date', v: g.inicio ? String(g.inicio).slice(0, 10) : hoje(), h: 'No dia do início, os participantes recebem o resumo do compromisso.' },
      { k: 'fim', l: 'Fim', t: 'date', v: g.fim ? String(g.fim).slice(0, 10) : '' }, { k: 'meta', l: 'Meta da campanha (valor total a arrecadar)', t: 'money', v: g.meta, h: 'Com a meta definida, a tela mostra quanto já foi recebido e quanto ainda falta.' },
      { k: 'status', l: 'Situação', t: 'select', o: [['active', 'Ativa'], ['planned', 'Planejada'], ['completed', 'Concluída'], ['cancelled', 'Cancelada']], v: g.status || 'active', vazio: false },
      { k: 'motivo', l: 'Motivo (se cancelar)', t: 'textarea' }, { k: 'obs', l: 'Observação', t: 'textarea', v: g.obs }
    ], 'Salvar', function (v) {
      return rpc('v39_fin_campaign_save', C({ p_id: g.id || null, p: { nome: v.nome, tipo: v.tipo, objetivo: v.objetivo, responsavelId: v.responsavelId || g.responsavelId || null, inicio: v.inicio || null, fim: v.fim || null, meta: v.meta, status: v.status, motivo: v.motivo || null, obs: v.obs || null } })).then(function () { return 'Campanha salva.'; });
    });
  }
  function addMeses(iso, n) {
    var p = String(iso).split('-'), y = +p[0], m = +p[1] - 1 + n, d = +p[2], alvo = new Date(y, m, 1), ult = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
    return isoD(new Date(alvo.getFullYear(), alvo.getMonth(), Math.min(d, ult)));
  }
  function genParcelas(v) {
    var n = Math.max(0, Math.min(60, parseInt(v.parcelas, 10) || 0)), tot = num(v.total), ini = String(v.primeiroVencimento || '');
    if (!n || !tot || !/^\d{4}-\d{2}-\d{2}$/.test(ini)) return [];
    var base = Math.floor(tot * 100 / n) / 100, out = [], soma = 0;
    for (var i = 0; i < n; i++) { var val = i === n - 1 ? arr2(tot - soma) : base; soma += base; out.push({ n: i + 1, venc: addMeses(ini, i), valor: val }); }
    return out;
  }
  function novoComp(gi) {
    var camps = opCampanhas(); if (!camps.length) return toast('Crie uma campanha primeiro.');
    var pre = gi != null && CAMPS[gi] ? CAMPS[gi].id : '';
    form('Novo participante', [
      { k: 'campanhaId', l: 'Campanha ou voto', t: 'select', o: camps, v: pre, req: true },
      { k: 'pessoaId', l: 'Pessoa', t: 'pessoa', req: true },
      { k: 'total', l: 'Valor com que se comprometeu', t: 'money', req: true },
      { k: 'formaId', l: 'Forma de pagamento prevista', t: 'select', o: opFormas(true), vazio: '— não definida —' },
      { k: 'parcelas', l: 'Número de parcelas (1 = à vista)', t: 'number', v: 1, req: true },
      { k: 'primeiroVencimento', l: 'Data do 1º pagamento', t: 'date', v: hoje(), req: true },
      { k: 'parc', l: 'Datas e valores de cada parcela', t: 'parcelas', deps: ['total', 'parcelas', 'primeiroVencimento'], gen: genParcelas, h: 'Você pode ajustar a data e o valor de cada parcela. A soma precisa ser igual ao valor total.' },
      { k: 'obs', l: 'Observação', t: 'textarea' }
    ], 'Salvar', function (v) {
      var n = Math.max(1, Math.min(60, parseInt(v.parcelas, 10) || 1)), padrao = genParcelas(v), ed = v.parc || [];
      if (ed.length !== n || ed.some(function (p) { return !p.venc || !(p.valor > 0); })) return Promise.reject(new Error('FIN_SCHEDULE_INVALID'));
      if (Math.abs(arr2(ed.reduce(function (s, p) { return s + p.valor; }, 0)) - num(v.total)) > 0.01) return Promise.reject(new Error('FIN_SCHEDULE_SUM'));
      var mudou = ed.some(function (p, i) { return !padrao[i] || p.venc !== padrao[i].venc || arr2(p.valor) !== arr2(padrao[i].valor); });
      var primeira = ed.map(function (p) { return p.venc; }).sort()[0];
      return rpc('v39_fin_commitment_create', C({ p: { campanhaId: v.campanhaId, pessoaId: v.pessoaId, total: v.total, parcelas: n, primeiroVencimento: primeira, formaId: v.formaId || null, obs: v.obs || null } })).then(function (r) {
        if (!mudou) return 'Participante incluído. O que falta receber já aparece no Livro como previsto.';
        return rpc('v39_fin_commitment_schedule', C({ p_commitment: r.id, p_items: ed })).then(function () { return 'Participante incluído com as datas combinadas.'; })
          .catch(function (e) { return 'Participante incluído, mas as datas personalizadas não foram aplicadas: ' + traduz(e); });
      });
    });
  }
  function editParc(ref) {
    var x = compromisso(ref); if (!x) return;
    var ds = (x.c.datas || []).map(function (d) { return { n: d.n, venc: String(d.venc).slice(0, 10), valor: arr2(d.valor) }; });
    form('Datas de ' + primeiro(x.c.pessoa) + ' · ' + x.g.nome, [
      { t: 'info', l: 'Compromisso de ' + brl(x.c.acordado) + '. Só dá para mudar antes do primeiro recebimento. A soma das parcelas precisa continuar igual.' },
      { k: 'parc', l: 'Datas e valores de cada parcela', t: 'parcelas', deps: [], gen: function () { return ds; } }
    ], 'Salvar datas', function (v) {
      var ed = v.parc || [];
      if (ed.length !== ds.length || ed.some(function (p) { return !p.venc || !(p.valor > 0); })) return Promise.reject(new Error('FIN_SCHEDULE_INVALID'));
      if (Math.abs(arr2(ed.reduce(function (s, p) { return s + p.valor; }, 0)) - num(x.c.acordado)) > 0.01) return Promise.reject(new Error('FIN_SCHEDULE_SUM'));
      return rpc('v39_fin_commitment_schedule', C({ p_commitment: x.c.id, p_items: ed })).then(function () { return 'Datas atualizadas.'; });
    });
  }
  function alvoParcela(c, tipo) {
    var hj = hoje(), l = (c.datas || []).filter(function (d) { return d.status !== 'paid' && d.status !== 'cancelled' && num(d.valor) - num(d.recebido) > 0.004; });
    if (!l.length) return 0;
    if (tipo === 'venc') { var h = l.filter(function (d) { return String(d.venc).slice(0, 10) === hj; })[0]; return (h || l[0]).n; }
    if (tipo === 'atraso') { var a = l.filter(function (d) { return String(d.venc).slice(0, 10) < hj; })[0]; return (a || l[0]).n; }
    return 0;
  }
  function zap(ref) {
    var x = compromisso(ref); if (!x) return;
    var padrao = SENT && (jaEnviou(x.c.id, 'inicio', 0) || jaEnviou(x.c.id, 'resumo', 0)) ? 'venc' : 'resumo';
    form('WhatsApp · ' + x.c.pessoa, [
      { k: 'tel', l: 'Telefone (com DDD)', v: x.c.telefone || '', req: true },
      { k: 'tipo', l: 'Mensagem', t: 'select', o: [['resumo', 'Resumo do compromisso'], ['venc', 'Lembrete de vencimento'], ['atraso', 'Parcela atrasada (gentil)'], ['recibo', 'Confirmação de recebimento']], v: padrao, vazio: false },
      { k: 'texto', l: 'Texto', t: 'textarea', req: true, fill: { dep: 'tipo', sempre: true, fn: function (v) { var t = v.tipo || 'resumo'; return msgTexto(t, x.g, x.c, { n: alvoParcela(x.c, t) }); } } },
      { t: 'info', l: 'O WhatsApp abre com a mensagem pronta; você confere e envia. O texto não mostra saldo nem valores em aberto.' }
    ], 'Abrir WhatsApp', function (v) {
      var url = waLink(v.tel, v.texto); if (!url) return Promise.reject(new Error('Telefone inválido.'));
      window.open(url, '_blank');
      var n = alvoParcela(x.c, v.tipo);
      return marcarMsg(x.c.id, v.tipo, v.tipo === 'venc' || v.tipo === 'atraso' ? n : 0, v.texto, false).then(function () { return 'Mensagem registrada.'; });
    });
  }
  function receber(ref) {
    var x = compromisso(ref); if (!x) return;
    form('Receber · ' + x.c.pessoa, [
      { t: 'info', l: 'O valor é aplicado nas parcelas mais antigas. Falta receber ' + brl(x.c.saldo) + ' deste participante.' },
      { k: 'data', l: 'Data', t: 'date', v: hoje(), req: true }, { k: 'valor', l: 'Valor recebido', t: 'money', v: x.c.proximoValor || x.c.saldo, req: true },
      { k: 'contaId', l: 'Conta', t: 'select', o: opContas(true), req: true }, { k: 'formaId', l: 'Forma', t: 'select', o: opFormas(true), v: x.c.formaId || '', req: true },
      { k: 'arq', l: 'Comprovante', t: 'file', h: 'Obrigatório em PIX/transferência.' }, { k: 'obs', l: 'Observação', t: 'textarea' }
    ], 'Registrar recebimento', function (v) {
      var tp = formaTipo(v.formaId);
      if ((tp === 'pix' || tp === 'bank_transfer') && !v.arq) return Promise.reject(new Error('FIN_EVIDENCE_REQUIRED'));
      return enviarComprovante(v.arq).then(function (ev) {
        return rpc('v39_fin_commitment_receive', C({ p: { compromissoId: x.c.id, data: v.data, valor: v.valor, contaId: v.contaId, formaId: v.formaId, comprovanteId: ev, obs: v.obs || null, chave: uuid() } }));
      }).then(function () { setTimeout(function () { ofertarRecibo(x.g, x.c, v.valor); }, 500); return 'Recebimento lançado no Livro.'; });
    });
  }

  /* ───────────── CADASTROS ───────────── */
  function tCad() {
    var C2 = S.cat || {}, h = '';
    if (S.ctx.master || !S.ctx.inicio) {
      h += '<div class="card"><div class="row g2f-mv" style="border:none;padding:0"><span class="g2f-ri pri">' + ic('cal') + '</span><div class="info"><div class="nm">Início do Financeiro</div><div class="sb">' + (S.ctx.inicio ? 'Começou em ' + esc(dataBR(S.ctx.inicio)) + '.' : 'Não definido.') +
        ' É o primeiro dia do Livro. GC e cultos com valores a partir desta data aparecem em "A conferir". Só muda enquanto não houver lançamentos.</div></div>' +
        (S.ctx.master ? '<div class="g2f-acts">' + btn('inicio', 'Definir data', 'cal', 'g2f-soft g2f-sm') + '</div>' : '') + '</div></div>';
    }
    if (pode('financial.accounts.manage')) {
      h += '<div class="sec">Contas bancárias e caixas</div><div class="g2f-tool g2f-noprint">' + btn('novaConta', 'Conta', 'plus', 'g2f-soft') + '</div><div class="card lp">' + ((C2.contas || []).map(function (a) {
        return '<div class="row g2f-mv"><span class="g2f-ri pri">' + ic(a.tipo === 'cash' ? 'cash' : 'bank') + '</span><div class="info"><div class="nm">' + esc(a.nome) + (a.status !== 'active' ? ' ' + pill('inativa', 'cinza') : '') + '</div>' +
          '<div class="sb">' + esc([ROT.conta[a.tipo] || a.tipo, a.banco, a.agencia ? 'ag. ' + a.agencia : '', a.numero ? 'c/c ' + a.numero : ''].filter(Boolean).join(' · ')) + '</div></div>' +
          '<div class="g2f-amt">' + (a.saldoInicial ? '<span class="g2f-mut">saldo inicial ' + esc(brl(a.saldoInicial.valor)) + ' em ' + esc(dataBR(a.saldoInicial.data)) + '</span>' : pill('sem saldo inicial', 'amarelo')) + '</div>' +
          '<div class="g2f-acts">' + bt('editConta', a.id, 'Editar', 'sec') + (!a.saldoInicial && tes() ? bt('saldoIni', a.id, 'Saldo inicial') : '') + '</div></div>';
      }).join('') || '<div class="empty">Nenhuma conta.</div>') + '</div>';
    }
    if (pode('financial.categories.manage')) {
      h += '<div class="sec">Plano de contas</div><div class="g2f-tool g2f-noprint">' + btn('novaCat', 'Categoria', 'plus', 'g2f-soft') + '</div><div class="card lp">' + ((C2.categorias || []).map(function (c) {
        return '<div class="row g2f-mv"><span class="g2f-ri ' + (c.natureza === 'income' ? 'in' : c.natureza === 'expense' ? 'out' : '') + '">' + ic('tag') + '</span><div class="info"><div class="nm">' + esc(c.nome) + (c.ativa ? '' : ' ' + pill('inativa', 'cinza')) + (c.sistema ? ' ' + pill('padrão', 'cinza') : '') + '</div>' +
          '<div class="sb">' + esc([c.codigo, ROT.nat[c.natureza] || c.natureza, c.contabil ? 'cód. contábil ' + c.contabil : 'sem cód. contábil'].join(' · ')) + '</div></div><div class="g2f-acts">' + bt('editCat', c.id, 'Editar', 'sec') + '</div></div>';
      }).join('') || '<div class="empty">Nenhuma categoria.</div>') + '</div><div class="g2f-note">O código contábil é o do contador; preencha quando receber a lista.</div>';
    }
    if (pode('financial.expenses.create') || pode('financial.bills.manage')) {
      h += '<div class="sec">Fornecedores e beneficiários</div><div class="g2f-tool g2f-noprint">' + btn('novoFornec', 'Fornecedor', 'plus', 'g2f-soft') + '</div><div class="card lp">' + ((C2.fornecedores || []).map(function (f) {
        return '<div class="row g2f-mv"><span class="g2f-ri">' + ic('user') + '</span><div class="info"><div class="nm">' + esc(f.nome) + (f.status === 'inactive' ? ' ' + pill('inativo', 'cinza') : '') + '</div><div class="sb">' + esc([f.documento, f.contato].filter(Boolean).join(' · ')) + '</div></div><div class="g2f-acts">' + bt('editFornec', f.id, 'Editar', 'sec') + '</div></div>';
      }).join('') || '<div class="empty">Nenhum fornecedor.</div>') + '</div>';
    }
    corpo(h || '<div class="card"><div class="empty">Sem cadastros disponíveis para o seu perfil.</div></div>');
    return Promise.resolve();
  }
  function formConta(a) {
    a = a || {};
    form(a.id ? 'Editar conta' : 'Nova conta', [
      { k: 'nome', l: 'Nome', v: a.nome, req: true }, { k: 'tipo', l: 'Tipo', t: 'select', o: Object.keys(ROT.conta).map(function (k) { return [k, ROT.conta[k]]; }), v: a.tipo || 'checking', vazio: false },
      { k: 'banco', l: 'Banco', v: a.banco }, { k: 'agencia', l: 'Agência', v: a.agencia }, { k: 'numero', l: 'Número da conta', v: a.numero }, { k: 'pix', l: 'Chave PIX', v: a.pix },
      { k: 'status', l: 'Situação', t: 'select', o: [['active', 'Ativa'], ['inactive', 'Inativa']], v: a.status || 'active', vazio: false }, { k: 'obs', l: 'Observação', t: 'textarea', v: a.obs }
    ], 'Salvar', function (v) { return rpc('v39_fin_save_account', C({ p_id: a.id || null, p_payload: Object.assign({ abertaEm: a.abertaEm || null }, v) })).then(function () { return 'Conta salva.'; }); });
  }
  function formCat(c) {
    c = c || {}; var fixa = !!c.sistema;
    form(c.id ? 'Editar categoria' : 'Nova categoria', (fixa ? [{ t: 'info', l: 'Categoria padrão: só o código contábil pode mudar.' }] : [
      { k: 'codigo', l: 'Código interno', v: c.codigo, req: true }, { k: 'nome', l: 'Nome', v: c.nome, req: true },
      { k: 'natureza', l: 'Natureza', t: 'select', o: [['income', 'Entrada'], ['expense', 'Saída']], v: c.natureza || 'expense', vazio: false },
      { k: 'descricao', l: 'Descrição', v: c.descricao }, { k: 'ativa', l: 'Ativa', t: 'check', v: c.id ? c.ativa : true }
    ]).concat([{ k: 'contabil', l: 'Código contábil (do contador)', v: c.contabil }]), 'Salvar', function (v) {
      var p = fixa ? { codigo: c.codigo, nome: c.nome, natureza: c.natureza, contabil: v.contabil } : v;
      return rpc('v39_fin_save_category', C({ p_id: c.id || null, p_payload: p })).then(function () { return 'Categoria salva.'; });
    });
  }
  function formFornec(f) {
    f = f || {};
    form(f.id ? 'Editar fornecedor' : 'Novo fornecedor', [
      { k: 'nome', l: 'Nome / razão social', v: f.nome, req: true }, { k: 'documento', l: 'CPF/CNPJ (opcional)', v: f.documento }, { k: 'contato', l: 'Contato', v: f.contato },
      { k: 'status', l: 'Situação', t: 'select', o: [['active', 'Ativo'], ['inactive', 'Inativo']], v: f.status || 'active', vazio: false }, { k: 'obs', l: 'Observação', t: 'textarea', v: f.obs }
    ], 'Salvar', function (v) { return rpc('v39_fin_payee_save', C({ p_id: f.id || null, p: v })).then(function () { return 'Fornecedor salvo.'; }); });
  }

  /* ───────────── RELATÓRIOS ───────────── */
  function tRel() {
    return rpc('v39_fin_report', C({ p_year: S.ano, p_month: S.relMes ? S.mes : null })).then(function (x) {
      var p = x.periodo || {}, r = x.resultado || {}, f = x.fluxo || {}, tit = (S.relMes ? MESES[S.mes - 1] + '/' : 'Ano ') + S.ano;
      var h = '<div class="g2f-tool g2f-noprint"><select data-c="relMes" style="flex:1 1 180px"><option value="1"' + (S.relMes ? ' selected' : '') + '>Mês selecionado</option><option value="0"' + (!S.relMes ? ' selected' : '') + '>Ano inteiro</option></select>' + btn('imprimir', 'Imprimir / PDF', 'file', 'g2f-soft') + '</div>';
      h += '<div class="card"><h3>' + esc(x.entidade || 'Igreja') + ' — Relatório financeiro ' + esc(tit) + '</h3><div class="g2f-mut">' + (x.documento ? 'CNPJ ' + esc(x.documento) + ' · ' : '') + 'Período ' + dataBR(p.inicio) + ' a ' + dataBR(p.fim) + ' · ' + (p.definitivo ? 'meses fechados (definitivo)' : 'PRÉVIA: há mês aberto no período') + ' · gerado em ' + esc(new Date(p.geradoEm || Date.now()).toLocaleString('pt-BR')) + '</div></div>';
      h += '<div class="stats">' + stat('Receitas', brl(r.receitas), 'in', 'down', 'g2f-pos') + stat('Despesas', brl(r.despesas), 'out', 'up', 'g2f-neg') + stat('Superávit / déficit', brl(r.superavit), 'pri', 'trend', num(r.superavit) < 0 ? 'g2f-neg' : 'g2f-pos') + '</div>';
      var cats = x.categorias || [];
      h += '<div class="card"><h3>Resultado por categoria</h3><div class="g2f-tw"><table class="g2f-tbl"><thead><tr><th>Cód. contábil</th><th>Categoria</th><th class="r">Lançamentos</th><th class="r">Valor</th></tr></thead><tbody>' +
        (cats.length ? cats.map(function (c) { return '<tr><td>' + esc(c.contabil || '—') + '</td><td>' + esc(c.nome) + '</td><td class="r">' + c.lancamentos + '</td><td class="r ' + (num(c.valor) < 0 ? 'g2f-neg' : 'g2f-pos') + '">' + brl(c.valor) + '</td></tr>'; }).join('') : '<tr><td colspan="4">Sem lançamentos.</td></tr>') + '</tbody></table></div></div>';
      h += '<div class="card"><h3>Fluxo de caixa (método direto)</h3><div class="g2f-tw"><table class="g2f-tbl"><tbody><tr><td>Caixa inicial (todas as contas)</td><td class="r">' + brl(f.caixaInicial) + '</td></tr>' +
        (f.recebimentos || []).map(function (y) { return '<tr><td>+ ' + esc(y.nome) + '</td><td class="r g2f-pos">' + brl(y.valor) + '</td></tr>'; }).join('') +
        (f.pagamentos || []).map(function (y) { return '<tr><td>− ' + esc(y.nome) + '</td><td class="r g2f-neg">' + brl(y.valor) + '</td></tr>'; }).join('') +
        '<tr><td>Pagamento de faturas de cartão</td><td class="r">' + brl(f.liquidacaoCartao) + '</td></tr><tr><td>Saldos iniciais lançados no período</td><td class="r">' + brl(f.saldosIniciais) + '</td></tr><tr><td>Transferências (líquido)</td><td class="r">' + brl(f.transferencias) + '</td></tr>' +
        (num(f.ajustes) ? '<tr><td>Ajustes</td><td class="r">' + brl(f.ajustes) + '</td></tr>' : '') + '<tr><td><b>Caixa final</b></td><td class="r"><b>' + brl(f.caixaFinal) + '</b></td></tr></tbody></table></div></div>';
      h += '<div class="card"><h3>Contas: saldo e conciliação</h3><div class="g2f-tw"><table class="g2f-tbl"><thead><tr><th>Conta</th><th class="r">Inicial</th><th class="r">Entradas</th><th class="r">Saídas</th><th class="r">Final</th><th class="r">Extrato</th><th class="r">Não conciliado</th></tr></thead><tbody>' +
        (x.contas || []).map(function (a) { return '<tr><td>' + esc(a.nome) + '</td><td class="r">' + brl(a.inicial) + '</td><td class="r">' + brl(a.entradas) + '</td><td class="r">' + brl(-num(a.saidas)) + '</td><td class="r"><b>' + brl(a.final) + '</b></td><td class="r">' + (a.saldoExtrato != null ? brl(a.saldoExtrato) : '—') + '</td><td class="r">' + (a.naoConciliados || 0) + ' (' + brl(a.valorNaoConciliado) + ')</td></tr>'; }).join('') + '</tbody></table></div></div>';
      if (S.relMes) {
        (x.contas || []).forEach(function (a) {
          if (!(a.movimentos || []).length) return;
          h += '<div class="card"><h3>Razão · ' + esc(a.nome) + '</h3><div class="g2f-tw"><table class="g2f-tbl"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="r">Valor</th><th>Comp.</th></tr></thead><tbody>' +
            a.movimentos.map(function (m) { return '<tr><td>' + dataBR(m.data) + '</td><td>' + esc(m.descricao) + (m.pessoa ? '<div class="g2f-mut">' + esc(m.pessoa) + '</div>' : '') + '</td><td>' + esc(m.categoria) + (m.contabil ? ' (' + esc(m.contabil) + ')' : '') + '</td><td class="r ' + (num(m.valor) < 0 ? 'g2f-neg' : 'g2f-pos') + '">' + brl(m.valor) + '</td><td>' + (m.comprovante ? '✔' : '—') + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
        });
      } else if ((x.mensal || []).length) {
        h += '<div class="card"><h3>Mês a mês</h3><div class="g2f-tw"><table class="g2f-tbl"><thead><tr><th>Mês</th><th class="r">Receitas</th><th class="r">Despesas</th><th class="r">Resultado</th><th></th></tr></thead><tbody>' +
          x.mensal.map(function (m) { return '<tr><td>' + MESES[m.mes - 1] + '</td><td class="r">' + brl(m.receitas) + '</td><td class="r">' + brl(m.despesas) + '</td><td class="r ' + (num(m.resultado) < 0 ? 'g2f-neg' : 'g2f-pos') + '">' + brl(m.resultado) + '</td><td>' + (m.fechado ? '🔒' : '') + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
      }
      var cp = x.contasPagar || [], cr = x.compromissos || [];
      h += '<div class="card"><h3>Contas a pagar (' + cp.length + ')</h3>' + (cp.length ? '<div class="g2f-tw"><table class="g2f-tbl"><tbody>' + cp.map(function (e) { return '<tr><td>' + esc(e.descricao) + '<div class="g2f-mut">' + esc(e.fornecedor || '') + '</div></td><td>' + dataBR(e.vencimento) + '</td><td class="r">' + brl(e.saldo) + '</td><td>' + esc(ROT.desp[e.status] || e.status) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="empty">Nada a pagar.</div>') + '</div>';
      h += '<div class="card"><h3>Compromissos a receber (' + cr.length + ')</h3>' + (cr.length ? '<div class="g2f-tw"><table class="g2f-tbl"><tbody>' + cr.map(function (c) { return '<tr><td>' + esc(c.pessoa) + '<div class="g2f-mut">' + esc(c.campanha) + '</div></td><td class="r">' + brl(c.saldo) + '</td><td>' + (c.proximo ? dataBR(c.proximo) : '—') + '</td><td>' + esc(ROT.comp[c.status] || c.status) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="empty">Nada a receber.</div>') + '<div class="g2f-mut">Compromissos não são receita até o recebimento.</div></div>';
      var cv = x.comprovantes || [], sem = cv.filter(function (c) { return /sem comprovante/.test(c.arquivo); }).length;
      h += '<div class="card"><h3>Relação de comprovantes (' + cv.length + (sem ? ', ' + sem + ' sem comprovante' : '') + ')</h3>' + (cv.length ? '<div class="g2f-tw"><table class="g2f-tbl"><tbody>' + cv.map(function (c) { return '<tr><td>' + dataBR(c.data) + '</td><td>' + esc(c.descricao) + '<div class="g2f-mut">' + esc(c.conta) + '</div></td><td class="r">' + brl(c.valor) + '</td><td>' + esc(c.arquivo) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="empty">Sem movimentos.</div>') + '</div>';
      corpo(h);
    });
  }

  /* ───────────── eventos do Livro ───────────── */
  function achar(lista, id) { return (lista || []).filter(function (x) { return x.id === id; })[0] || null; }
  function acao(p) { return p.then(function (m) { if (m) toast(m); S.cache = null; recarregar(); dashCarregar(true); }).catch(function (e) { console.warn('[2Gather][fin]', e); toast(traduz(e)); }); }
  function clique(ev) {
    var b = ev.target.closest && ev.target.closest('[data-a]'); if (!b || !$('g2fin') || !$('g2fin').contains(b)) return;
    var a = b.getAttribute('data-a'), v = b.getAttribute('data-v');
    ev.stopPropagation();
    switch (a) {
      case 'fechar': return fechar();
      case 'aba': S.aba = v; S.cache = null; pintarBase(); return recarregar();
      case 'mesAnt': return mover(-1);
      case 'mesProx': return mover(1);
      case 'mesHoje': S.ano = new Date().getFullYear(); S.mes = new Date().getMonth() + 1; S.cache = null; pintarBase(); return recarregar();
      case 'livroFiltro': S.livroFiltro = v; return desenharLivro();
      case 'despFiltro': S.despFiltro = v; S.cache = null; return recarregar();
      case 'verComp': return abrirComprovante(v);
      case 'csvLivro': return csvLivro();
      case 'imprimir': return window.print();
      case 'fecharMes':
        return form('Fechar ' + MESES[S.mes - 1] + '/' + S.ano, [{ t: 'info', l: 'Depois de fechado, nada do mês muda; correções só por estorno em mês aberto. Precisa estar sem pendências e com os meses anteriores fechados.' }, { k: 'obs', l: 'Observação', t: 'textarea' }], 'Fechar mês',
          function (x) { return rpc('v39_fin_close_period', C({ p_year: S.ano, p_month: S.mes, p_notes: x.obs || null })).then(function () { return 'Mês fechado.'; }); });
      case 'reabrir': return motivo('Reabrir ' + MESES[S.mes - 1] + '/' + S.ano, function (m) { return rpc('v39_fin_reopen_period', C({ p_year: S.ano, p_month: S.mes, p_reason: m })).then(function () { return 'Mês reaberto.'; }); }, 'Reabrir');
      case 'conc': return acao(rpc('v39_fin_reconcile', C({ p_movement_id: v, p_on: true, p_statement_date: null })).then(function () { return 'Conciliado.'; }));
      case 'desconc': return acao(rpc('v39_fin_reconcile', C({ p_movement_id: v, p_on: false, p_statement_date: null })).then(function () { return 'Conciliação desfeita.'; }));
      case 'editMov': return editMov(v);
      case 'estornar': return motivo('Estornar lançamento', function (m) { return rpc('v39_fin_reverse_movement', C({ p_id: v, p_reason: m })).then(function () { return 'Estornado. O original continua no histórico.'; }); }, 'Estornar');
      case 'lancarLote': return lancarLote(+v);
      case 'estLote': return motivo('Estornar lote', function (m) { return rpc('v39_fin_source_reverse', C({ p_batch: v, p_reason: m })).then(function () { return 'Lote estornado. O encontro/culto volta para "A conferir".'; }); }, 'Estornar');
      case 'novaEntrada': return novaEntrada();
      case 'novaDesp': return formDesp(null);
      case 'editDesp': return formDesp(despesa(v));
      case 'enviarDesp': return acao(rpc('v39_fin_expense_submit', C({ p_id: v })).then(function () { return 'Enviada para aprovação.'; }));
      case 'aprovarDesp': {
        var e = despesa(v);
        return form('Aprovar · ' + (e ? e.descricao : ''), [{ k: 'valor', l: 'Valor aprovado', t: 'money', v: e && e.valor, req: true, h: 'Pode ser menor que o pedido. Aprovar não tira dinheiro da conta.' }], 'Aprovar',
          function (x) { return rpc('v39_fin_expense_decide', C({ p_id: v, p_decision: 'approve', p_amount: x.valor, p_reason: null })).then(function () { return 'Despesa aprovada.'; }); });
      }
      case 'corrigirDesp': return motivo('Pedir correção', function (m) { return rpc('v39_fin_expense_decide', C({ p_id: v, p_decision: 'correct', p_amount: null, p_reason: m })).then(function () { return 'Correção pedida.'; }); });
      case 'recusarDesp': return motivo('Recusar despesa', function (m) { return rpc('v39_fin_expense_decide', C({ p_id: v, p_decision: 'reject', p_amount: null, p_reason: m })).then(function () { return 'Despesa recusada.'; }); }, 'Recusar');
      case 'pagarDesp': return pagarDesp(v);
      case 'cancDesp': return motivo('Cancelar despesa', function (m) { return rpc('v39_fin_expense_cancel', C({ p_id: v, p_reason: m })).then(function () { return 'Despesa cancelada.'; }); }, 'Cancelar despesa');
      case 'estPag': return motivo('Estornar pagamento', function (m) { return rpc('v39_fin_payment_reverse', C({ p_payment_id: v, p_reason: m })).then(function () { return 'Pagamento estornado.'; }); }, 'Estornar');
      case 'novaRec': return formRec(null);
      case 'editRec': return formRec(achar(RECS, v));
      case 'gerarRec': return acao(rpc('v39_fin_recurrence_generate', C({ p_id: v })).then(function () { return 'Despesa gerada (rascunho). Envie para aprovação.'; }));
      case 'novaTransf':
        return form('Transferir entre contas', [
          { k: 'origemId', l: 'De (sai)', t: 'select', o: opContas(true), req: true }, { k: 'destinoId', l: 'Para (entra)', t: 'select', o: opContas(true), req: true },
          { k: 'valor', l: 'Valor', t: 'money', req: true }, { k: 'data', l: 'Data', t: 'date', v: hoje(), req: true },
          { k: 'descricao', l: 'Descrição', v: 'Depósito do caixa no banco' }, { k: 'arq', l: 'Comprovante', t: 'file' }
        ], 'Transferir', function (x) {
          if (x.origemId === x.destinoId) return Promise.reject(new Error('FIN_ACCOUNT_INVALID'));
          return enviarComprovante(x.arq).then(function (ev2) { return rpc('v39_fin_transfer', C({ p: { origemId: x.origemId, destinoId: x.destinoId, valor: x.valor, data: x.data, descricao: x.descricao, comprovanteId: ev2, chave: uuid() } })); }).then(function () { return 'Transferência lançada.'; });
        });
      case 'estTransf': return motivo('Estornar transferência', function (m) { return rpc('v39_fin_transfer_reverse', C({ p_id: v, p_reason: m })).then(function () { return 'Transferência estornada.'; }); }, 'Estornar');
      case 'novoCartao': return formCartao(null);
      case 'editCartao': return formCartao(achar(S.cat.cartoes, v));
      case 'verFatura': {
        var s = FATS[+v]; if (!s) return;
        return form('Fatura ' + s.cartao + ' ' + pad(s.mes) + '/' + s.ano, [{ t: 'info', l: (s.itens || []).map(function (i) { return esc(dataBR(i.data)) + ' · ' + esc(i.descricao) + ' · ' + esc(i.parcela) + ' · ' + esc(brl(i.valor)); }).join('<br>') || 'Sem compras.' }], 'OK', function () { return false; });
      }
      case 'pagarFatura': {
        var f = FATS[+v]; if (!f) return;
        var ct = (achar(S.cat.cartoes, f.cartaoId) || {}).contaId || '';
        return form('Pagar fatura ' + f.cartao + ' ' + pad(f.mes) + '/' + f.ano, [
          { t: 'info', l: 'Em aberto: ' + brl(f.aberto) + '. Pagar a fatura não cria despesa nova (as compras já são as despesas).' },
          { k: 'data', l: 'Data', t: 'date', v: hoje(), req: true }, { k: 'valor', l: 'Valor pago', t: 'money', v: f.aberto, req: true },
          { k: 'contaId', l: 'Conta', t: 'select', o: opContas(true), v: ct, req: true }, { k: 'formaId', l: 'Forma', t: 'select', o: opFormas(true), req: true },
          { k: 'arq', l: 'Comprovante', t: 'file', req: true }, { k: 'obs', l: 'Observação', t: 'textarea' }
        ], 'Pagar', function (x) {
          return enviarComprovante(x.arq).then(function (ev2) { return rpc('v39_fin_card_statement_pay', C({ p_statement_id: f.id, p: { data: x.data, valor: x.valor, contaId: x.contaId, formaId: x.formaId, comprovanteId: ev2, obs: x.obs || null, chave: uuid() } })); }).then(function () { return 'Fatura paga.'; });
        });
      }
      case 'casar': { var pp = String(v).split('|'); return acao(rpc('v39_fin_statement_match', C({ p_line: pp[0], p_movement: pp[1] })).then(function () { return 'Linha conciliada.'; })); }
      case 'ignLinha': {
        var ln = achar(CONC && CONC.linhas, v);
        if (ln && ln.status === 'ignored') return acao(rpc('v39_fin_statement_ignore', C({ p_line: v, p_reason: null })).then(function () { return 'Linha reativada.'; }));
        return motivo('Ignorar linha do extrato', function (m) { return rpc('v39_fin_statement_ignore', C({ p_line: v, p_reason: m })).then(function () { return 'Linha ignorada.'; }); }, 'Ignorar');
      }
      case 'fecharConc':
        return form('Saldo do extrato em ' + MESES[S.mes - 1] + '/' + S.ano, [{ k: 'saldo', l: 'Saldo final do extrato bancário', t: 'money', req: true }], 'Registrar',
          function (x) { return rpc('v39_fin_recon_close', C({ p_account: S.concConta, p_year: S.ano, p_month: S.mes, p_closing: x.saldo })).then(function () { return 'Saldo do extrato registrado.'; }); });
      case 'novaCamp': return formCamp(null);
      case 'editCamp': return formCamp(CAMPS[+v]);
      case 'novoComp': return novoComp(null);
      case 'novoCompCamp': return novoComp(+v);
      case 'editParc': return editParc(v);
      case 'receber': return receber(v);
      case 'zap': return zap(v);
      case 'msgEnv': {
        var q = FILA[+v]; if (!q) return;
        var gq = CAMPS[q.gi], cq = gq.compromissos[q.ci];
        marcarMsg(cq.id, q.tipo, q.n, msgTexto(q.tipo, gq, cq, { n: q.n }), false).then(function () { S.cache = null; setTimeout(recarregar, 700); });
        return;                                   // o link do WhatsApp segue o caminho normal (abre em nova aba)
      }
      case 'msgDisp': {
        var q2 = FILA[+v]; if (!q2) return;
        var c2 = CAMPS[q2.gi].compromissos[q2.ci];
        return marcarMsg(c2.id, q2.tipo, q2.n, null, true).then(function () { toast('Mensagem dispensada.'); S.cache = null; recarregar(); });
      }
      case 'cancComp': return motivo('Cancelar participante', function (m) { return rpc('v39_fin_commitment_cancel', C({ p_id: v, p_reason: m })).then(function () { return 'Participante cancelado.'; }); }, 'Cancelar participante');
      case 'estRec': return motivo('Estornar recebimento', function (m) { return rpc('v39_fin_receipt_reverse', C({ p_receipt: v, p_reason: m })).then(function () { return 'Recebimento estornado.'; }); }, 'Estornar');
      case 'inicio':
        return form('Início do Financeiro', [{ k: 'data', l: 'Primeiro dia do Livro', t: 'date', v: (S.ctx && S.ctx.inicio) || (new Date().getFullYear() + '-01-01'), req: true },
          { t: 'info', l: 'Dica: use o 1º dia do mês. Depois cadastre o saldo inicial de cada conta nessa data. Encontros de GC e cultos com valores desde essa data aparecem em "A conferir".' }], 'Salvar',
          function (x) { return rpc('v39_fin_set_start', C({ p_date: x.data })).then(function () { return 'Início definido.'; }); });
      case 'novaConta': return formConta(null);
      case 'editConta': return formConta(achar(S.cat.contas, v));
      case 'saldoIni': {
        var ac = achar(S.cat.contas, v);
        return form('Saldo inicial · ' + (ac ? ac.nome : ''), [
          { t: 'info', l: 'Saldo da conta no dia ' + dataBR(S.ctx.inicio) + ' (início do Financeiro). Use 0 se estava zerada. Só pode ser lançado uma vez.' },
          { k: 'valor', l: 'Saldo', t: 'money', req: true }, { k: 'arq', l: 'Extrato/comprovante', t: 'file' }, { k: 'obs', l: 'Observação', t: 'textarea' }
        ], 'Lançar saldo inicial', function (x) {
          return enviarComprovante(x.arq).then(function (ev2) { return rpc('v39_fin_opening_balance', C({ p: { contaId: v, valor: x.valor, comprovanteId: ev2, obs: x.obs || null } })); }).then(function () { return 'Saldo inicial lançado.'; });
        });
      }
      case 'novaCat': return formCat(null);
      case 'editCat': return formCat(achar(S.cat.categorias, v));
      case 'novoFornec': return formFornec(null);
      case 'editFornec': return formFornec(achar(S.cat.fornecedores, v));
    }
  }
  function mudanca(ev) {
    var el = ev.target, c = el.getAttribute && el.getAttribute('data-c'); if (!c) return;
    if (c === 'concConta') { S.concConta = el.value; S.cache = null; return recarregar(); }
    if (c === 'relMes') { S.relMes = el.value === '1'; S.cache = null; return recarregar(); }
    if (c === 'extrato') { var f = el.files && el.files[0]; el.value = ''; return importarExtrato(f); }
  }
  function digita(ev) {
    var el = ev.target;
    if (el && el.getAttribute && el.getAttribute('data-c') === 'busca') { S.livroBusca = el.value; pintarLista(); }
  }

  /* ───────────── PAINEL na tela Financeiro: dashboard do Livro ───────────── */
  var D = { dados: null, carregando: false, em: 0 };
  function telaFinanceiro() { return /fin/i.test(String(cfg().aba || '')); }
  function tituloFinanceiro(main) {
    var o = main.querySelector('.ini-ola'); if (o && /^\s*financeiro\s*$/i.test(o.textContent || '')) return o;
    var hs = main.querySelectorAll('h1,h2,h3');
    for (var i = 0; i < hs.length; i++) if (/^\s*financeiro\s*$/i.test(hs[i].textContent || '')) return hs[i];
    return null;
  }
  function dashCarregar(forcar) {
    if (D.carregando || !igrejaId()) return;
    if (!forcar && D.dados && Date.now() - D.em < 60000) return;
    D.carregando = true;
    carregarCtx().then(function () {
      if (!algum()) { D.dados = { semAcesso: true }; return; }
      var ps = [pode('financial.book.view') || pode('financial.reports.view') ? rpc('v39_fin_overview', C({ p_year: S.ano, p_month: S.mes })).catch(function () { return null; }) : Promise.resolve(null),
        pode('financial.sources.view') ? rpc('v39_fin_source_pending', C({})).catch(function () { return null; }) : Promise.resolve(null),
        (pode('financial.expenses.approve') || pode('financial.expenses.pay')) ? rpc('v39_fin_expenses', C({ p_filter: 'abertas' })).catch(function () { return null; }) : Promise.resolve(null),
        pode('financial.campaigns.view') ? rpc('v39_fin_campaigns', C({})).catch(function () { return null; }) : Promise.resolve(null),
        pode('financial.reports.view') ? rpc('v39_fin_report', C({ p_year: S.ano, p_month: null })).catch(function () { return null; }) : Promise.resolve(null), carregarSent()];
      return Promise.all(ps).then(function (r) { if (r[3]) CAMPS = r[3]; D.dados = { ov: r[0], pend: r[1], desp: r[2], camps: r[3], rep: r[4] }; });
    }).catch(function (e) { console.warn('[2Gather][fin] ' + traduz(e)); D.dados = { erro: traduz(e) }; })
      .then(function () { D.carregando = false; D.em = Date.now(); var x = $('g2f-dash'); if (x) x.remove(); pintarDash(); });
  }
  /* gráfico de colunas (HTML puro): barras verdes = entradas, vermelhas = saídas */
  function grafico(cols, classe) {
    var mx = 0; cols.forEach(function (c) { if (c.a > mx) mx = c.a; if (c.b > mx) mx = c.b; }); if (!(mx > 0)) mx = 1;
    var h = function (v) { return v > 0 ? Math.max(3, Math.round(v / mx * 100)) : 0; };
    return '<div class="g2f-ch' + (classe ? ' ' + classe : '') + '" role="img" aria-label="Entradas e saídas">' + cols.map(function (c) {
      return '<div class="g2f-col' + (c.on ? ' on' : '') + '" title="' + esc(c.tit) + '"><div class="g2f-bars"><i class="in" style="height:' + h(c.a) + '%"></i><i class="out" style="height:' + h(c.b) + '%"></i></div><small>' + esc(c.rot) + '</small></div>'; }).join('') +
      '</div><div class="g2f-leg"><span><i style="background:#16A36A"></i>Entradas</span><span><i style="background:#E5484D"></i>Saídas</span></div>';
  }
  function barrasH(itens, cor) {
    if (!itens.length) return '<div class="empty">Sem lançamentos neste mês.</div>';
    var mx = itens[0].v || 1, tot = itens.reduce(function (s, x) { return s + x.v; }, 0) || 1;
    return itens.map(function (x) {
      return '<div class="g2f-hb"><div class="t"><span>' + esc(x.n) + '</span><b>' + brl(x.v) + ' <span class="g2f-mut">' + Math.round(x.v / tot * 100) + '%</span></b></div><div class="b"><i style="width:' + Math.max(3, Math.round(x.v / mx * 100)) + '%;background:' + cor + '"></i></div></div>'; }).join('');
  }
  function serieAno() {
    var rep = D.dados && D.dados.rep, mens = rep && rep.mensal; if (!Array.isArray(mens) || !mens.length) return null;
    var out = []; for (var i = 1; i <= 12; i++) { var m = mens.filter(function (x) { return +x.mes === i; })[0]; out.push({ mes: i, r: num(m && m.receitas), d: num(m && m.despesas) }); }
    return out;
  }
  function variacao(atual, anterior) {
    if (!(anterior > 0)) return '';
    var p = Math.round((atual - anterior) / anterior * 100);
    return '<span class="g2f-delta ' + (p === 0 ? '' : '') + '">' + (p > 0 ? '▲ ' : p < 0 ? '▼ ' : '= ') + Math.abs(p) + '% vs mês anterior</span>';
  }
  function htmlDash() {
    var d = D.dados || {}, ov = d.ov || {}, t = ov.totais || {}, contas = ov.contas || [], L = ov.livro || [], h = '';
    if (d.erro) return '<div class="card">' + esc(d.erro) + '</div>';
    var saldo = contas.reduce(function (s, a) { return s + num(a.saldoAtual); }, 0), prev = d.camps ? previstos() : [];
    var nPend = d.pend && d.pend.itens ? d.pend.itens.length : 0;
    var nAprov = (d.desp || []).filter(function (e) { return e.status === 'pending_approval' && !e.souSolicitante; }).length;
    var nPagar = (d.desp || []).filter(function (e) { return e.status === 'approved' || e.status === 'partially_paid'; }).length;
    var nMsg = d.camps && SENT ? filaMsgs().length : 0, ano = serieAno();
    var pAnt = ano && S.mes > 1 ? ano[S.mes - 2] : null;

    if (d.ov) {
      h += '<div class="g2f-per g2f-dashper"><button type="button" data-d="mesAnt" aria-label="Mês anterior">' + ic('chevl') + '</button><b>' + MESES[S.mes - 1] + ' ' + S.ano + '</b><button type="button" data-d="mesProx" aria-label="Próximo mês">' + ic('chevr') + '</button></div>';
      h += '<div class="stats">' + stat('Entradas', brl(t.entradas), 'in', 'down', 'g2f-pos', pAnt ? variacao(num(t.entradas), pAnt.r) || 'no mês' : 'no mês') + stat('Saídas', brl(t.saidas), 'out', 'up', 'g2f-neg', pAnt ? variacao(num(t.saidas), pAnt.d) || 'no mês' : 'no mês') +
        stat('Resultado', brl(t.resultado), 'pri', 'trend', num(t.resultado) < 0 ? 'g2f-neg' : 'g2f-pos', 'entradas − saídas') + stat('Saldo atual', brl(saldo), 'pri', 'wallet', '', 'todas as contas, hoje') + '</div>';
    }
    h += '<div class="big-cta" data-d="abrir" data-v="livro" role="button" tabindex="0"><div class="bi">' + ic('book', 26) + '</div><div><b>Abrir Livro financeiro</b><span>Lançamentos, despesas, campanhas e relatórios</span></div></div>';

    var pend = [];
    if (nPend && pode('financial.sources.view')) pend.push({ n: nPend, txt: 'GC/cultos com valores <b>a conferir</b>', aba: 'conferir', i: 'inbox' });
    if (nAprov && pode('financial.expenses.approve')) pend.push({ n: nAprov, txt: 'despesa(s) <b>aguardando sua aprovação</b>', aba: 'despesas', i: 'receipt' });
    if (nPagar && tes() && pode('financial.expenses.pay')) pend.push({ n: nPagar, txt: 'despesa(s) aprovada(s) <b>a pagar</b>', aba: 'despesas', i: 'cash' });
    if (nMsg) pend.push({ n: nMsg, txt: 'mensagem(ns) de campanha <b>para enviar hoje</b>', aba: 'camp', i: 'chat' });
    if (pend.length) h += '<div class="card lp">' + pend.map(function (p) {
      return '<div class="row g2f-mv g2f-click" data-d="abrir" data-v="' + p.aba + '"><span class="g2f-ri amb">' + ic(p.i) + '</span><div class="info"><div class="nm"><b>' + p.n + '</b> ' + p.txt + '</div></div>' + ic('chevr') + '</div>'; }).join('') + '</div>';

    if (ano) {
      var cols = ano.map(function (m) { return { rot: MES3[m.mes - 1], a: m.r, b: m.d, on: m.mes === S.mes, tit: MESES[m.mes - 1] + ': entradas ' + brl(m.r) + ' · saídas ' + brl(m.d) }; });
      var tr = ano.reduce(function (s, m) { return s + m.r; }, 0), td = ano.reduce(function (s, m) { return s + m.d; }, 0);
      h += '<div class="card"><div class="g2f-dh"><h3>Entradas × saídas · ' + S.ano + '</h3><span class="g2f-mut">' + brlK(tr) + ' · ' + brlK(td) + '</span></div>' + grafico(cols) + '</div>';
    }
    if (d.ov) {
      var dias = new Date(S.ano, S.mes, 0).getDate(), porDia = []; for (var i = 1; i <= dias; i++) porDia.push({ a: 0, b: 0 });
      var catIn = {}, catOut = {};
      L.forEach(function (m) {
        var ef = num(m.efeitoResultado), v = num(m.valor) * ef, di = parseInt(String(m.data).slice(8, 10), 10);
        if (!ef) return;
        if (di >= 1 && di <= dias) { if (v > 0) porDia[di - 1].a += v; else porDia[di - 1].b += -v; }
        var n = m.categoria || 'Sem categoria'; catIn[n] = (catIn[n] || 0) + v;
      });
      var listaIn = [], listaOut = [];
      Object.keys(catIn).forEach(function (n) { if (catIn[n] > 0.004) listaIn.push({ n: n, v: arr2(catIn[n]) }); else if (catIn[n] < -0.004) listaOut.push({ n: n, v: arr2(-catIn[n]) }); });
      listaIn.sort(function (a, b) { return b.v - a.v; }); listaOut.sort(function (a, b) { return b.v - a.v; });
      var colsD = porDia.map(function (x, k) { var dia = k + 1; return { rot: (dia === 1 || dia % 5 === 0) ? String(dia) : '', a: x.a, b: x.b, on: false, tit: 'Dia ' + dia + ': entradas ' + brl(x.a) + ' · saídas ' + brl(x.b) }; });
      h += '<div class="card"><div class="g2f-dh"><h3>Fluxo do mês, dia a dia</h3><span class="g2f-mut">' + MESES[S.mes - 1] + '</span></div>' + grafico(colsD, 'dia') + '</div>';
      h += '<div class="g2f-two"><div class="card"><div class="g2f-dh"><h3>De onde vem</h3><span class="g2f-mut">entradas</span></div>' + barrasH(listaIn.slice(0, 6), '#16A36A') + '</div>' +
        '<div class="card"><div class="g2f-dh"><h3>Para onde vai</h3><span class="g2f-mut">saídas</span></div>' + barrasH(listaOut.slice(0, 6), '#E5484D') + '</div></div>';
    }
    if (contas.length) {
      var pos = contas.reduce(function (s, a) { return s + Math.max(0, num(a.saldoAtual)); }, 0) || 1;
      h += '<div class="card"><div class="g2f-dh"><h3>Saldo por conta</h3><span class="g2f-mut">' + brl(saldo) + '</span></div>' + contas.map(function (a) {
        var p = Math.max(0, Math.round(num(a.saldoAtual) / pos * 100));
        return '<div class="g2f-hb"><div class="t"><span>' + esc(a.nome) + (a.naoConciliados ? ' <span class="g2f-mut">· ' + a.naoConciliados + ' a conciliar</span>' : '') + '</span><b>' + brl(a.saldoAtual) + '</b></div><div class="b"><i style="width:' + Math.max(2, p) + '%;background:var(--pri,#2F5BEA)"></i></div></div>'; }).join('') + '</div>';
    } else if (d.ov) h += '<div class="card"><div class="empty">Nenhuma conta cadastrada. Abra o Livro › Cadastros para cadastrar as contas bancárias, o caixa e o plano de contas.</div></div>';

    var ativas = (d.camps || []).filter(function (g) { return ['active', 'planned'].indexOf(g.status) >= 0; });
    if (ativas.length) {
      h += '<div class="card"><div class="g2f-dh"><h3>Campanhas e votos</h3><span class="g2f-mut">a receber ' + brl(somaPrev(prev)) + '</span></div>' + ativas.slice(0, 5).map(function (g) {
        var meta = num(g.meta), rc = num(g.recebido), ac = num(g.acordado), base = meta > 0 ? meta : (ac > 0 ? ac : 1), pr = Math.min(100, Math.round(rc / base * 100)), pa = Math.min(100, Math.round(ac / base * 100));
        return '<div class="g2f-hb g2f-click" data-d="abrir" data-v="camp"><div class="t"><span>' + esc(g.nome) + '</span><b>' + brl(rc) + (meta > 0 ? ' <span class="g2f-mut">de ' + brl(meta) + '</span>' : '') + '</b></div>' +
          '<div class="g2f-pl" style="margin-top:4px"><i class="ac" style="width:' + pa + '%"></i><i class="rc" style="width:' + pr + '%"></i></div>' +
          '<div class="g2f-mut" style="margin-top:3px">' + (meta > 0 ? (rc >= meta ? 'meta atingida 🎉' : 'faltam ' + brl(meta - rc) + ' para a meta') : 'sem meta definida') + ' · acordado ' + brl(ac) + '</div></div>'; }).join('') + '</div>';
    }
    if (d.ov && L.length) {
      var ult = L.slice().sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : 0; }).slice(0, 6);
      h += '<div class="card lp"><div class="g2f-dh" style="padding:12px 14px 0"><h3>Últimos lançamentos</h3><span class="g2f-mut g2f-click" data-d="abrir" data-v="livro">ver todos</span></div>' + ult.map(function (m) {
        var vis = movVis(m), v = num(m.valor) * num(m.efeitoCaixa || m.efeitoResultado || 0);
        return '<div class="row g2f-mv g2f-click" data-d="abrir" data-v="livro"><span class="g2f-ri ' + vis.c + '">' + ic(vis.i) + '</span><div class="info"><div class="nm">' + esc(m.descricao) + '</div><div class="sb">' + esc(dataBR(m.data) + ' · ' + (m.categoria || ROT.mov[m.tipo] || '') + ' · ' + (m.conta || '')) + '</div></div>' +
          '<div class="g2f-amt"><span class="' + (v < 0 ? 'g2f-neg' : v > 0 ? 'g2f-pos' : '') + '">' + (v > 0 ? '+ ' : '') + brl(v) + '</span></div></div>'; }).join('') + '</div>';
    }
    return h;
  }
  // o consolidado anterior (cultos/GC) fica sempre escondido: o dashboard acima o substitui
  function esconderLegado(main, dash) {
    var passou = false;
    Array.prototype.forEach.call(main.children, function (el) {
      if (el === dash) { passou = true; return; }
      if (!passou || el.id === 'g2fin') return;
      if (!el.classList.contains('g2f-oculto')) { el.classList.add('g2f-oculto'); el.setAttribute('data-g2f-leg', '1'); }
    });
  }
  function pintarDash() {
    var main = $('main');
    if (!main || !v39() || !telaFinanceiro() || S.aberto) return;
    var dash = $('g2f-dash');
    if (dash && main.contains(dash)) { esconderLegado(main, dash); return; }
    if (!D.dados) { dashCarregar(false); return; }
    if (D.dados.semAcesso) return;
    css();
    dash = document.createElement('div'); dash.id = 'g2f-dash';
    dash.innerHTML = htmlDash();
    dash.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-d]'); if (!b) return;
      var k = b.getAttribute('data-d');
      if (k === 'abrir') return abrir(b.getAttribute('data-v'));
      if (k === 'mesAnt' || k === 'mesProx') { var m = S.mes + (k === 'mesAnt' ? -1 : 1); if (m < 1) { m = 12; S.ano--; } else if (m > 12) { m = 1; S.ano++; } S.mes = m; dashCarregar(true); }
    });
    dash.addEventListener('keydown', function (ev) { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.getAttribute && ev.target.getAttribute('data-d') === 'abrir') { ev.preventDefault(); abrir(ev.target.getAttribute('data-v')); } });
    var t = tituloFinanceiro(main), ref = null;
    if (t) {
      ref = t;
      var sub = t.nextElementSibling;
      if (sub && !sub.querySelector('button,select,input') && (sub.textContent || '').trim().length < 160) ref = sub;
      while (ref.parentNode && ref.parentNode !== main) ref = ref.parentNode;
    }
    if (ref && ref.parentNode === main) ref.insertAdjacentElement('afterend', dash); else main.insertAdjacentElement('afterbegin', dash);
    esconderLegado(main, dash);
  }

  /* ───────────── manutenção: usuário, redesenho do app ───────────── */
  var ultimoUsuario = '', ocupado = false;
  function manter() {
    if (ocupado) return; ocupado = true;
    try {
      var f = $('g2f-fab'); if (f) f.remove();
      var av = $('g2f-aviso'); if (av) av.remove();
      var at = $('g2f-atalhos'); if (at) at.remove();
      var u = String(eu().id || eu().usuario || eu().email || '') + '|' + (igrejaId() || '');
      if (u !== ultimoUsuario) {
        ultimoUsuario = u; S.ctx = null; S.cat = null; S.cache = null; D.dados = null; S.aberto = false; CAMPS = []; SENT = null;
        var o = $('g2fin'); if (o) o.remove(); var d = $('g2f-dash'); if (d) d.remove(); fecharMod();
      }
      if (!cfg().usuario || !v39()) return;
      if (S.aberto) {
        if (!telaFinanceiro()) { S.aberto = false; var o2 = $('g2fin'); if (o2) o2.remove(); return; }
        var main = $('main');
        if (main && !$('g2fin')) restaurar();          // o app redesenhou a tela: volta o Livro do que já estava carregado
        else if (main) esconderMain(main, true);
        return;
      }
      pintarDash();
    } finally { ocupado = false; }
  }
  setInterval(manter, 1500);
  // reage no mesmo instante em que o app troca o conteúdo da área principal (sem esperar o intervalo)
  (function observar() {
    var main = $('main'); if (!main) { setTimeout(observar, 400); return; }
    try { new MutationObserver(function () { manter(); }).observe(main, { childList: true }); } catch (e) { /* sem observer: o intervalo cobre */ }
  })();

  window.G2_FIN.abrir = abrir;
  window.G2_FIN.fechar = fechar;
  window.G2_FIN._lerExtrato = lerExtrato;
  window.G2_FIN._lerValor = lerValor;
  window.G2_FIN._t = { S: S, tLivro: tLivro, tCamp: tCamp, tDespesas: tDespesas, tConferir: tConferir, tCad: tCad, tTransf: tTransf, tConc: tConc, tRel: tRel, htmlDash: htmlDash, D: D,
    setCamps: function (c) { CAMPS = c; }, setSent: function (s) { SENT = s; }, filaMsgs: filaMsgs, previstos: previstos, novaEntrada: novaEntrada, novoComp: novoComp, editParc: editParc, zap: zap, receber: receber,
    msgTexto: msgTexto, genParcelas: genParcelas, addMeses: addMeses, bt: bt, carregarCtx: carregarCtx, carregarCat: carregarCat, pintarBase: pintarBase, restaurar: restaurar, manter: manter, corpo: corpo };
})();
