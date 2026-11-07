/* 2Gather v39 · Financeiro completo · FIN-ALL-1
   Carregar DEPOIS do app.js e dos módulos v39 (depois de app_v39_setores.js). Não altera o app.js.
   Requer: v39_financeiro_completo.sql (FIN-ALL-1) rodado no Supabase.

   Abas (cada uma aparece só para quem tem a permissão):
   Resumo · Livro · A conferir (GC e cultos) · Nova entrada · Despesas · Transferências e cartões ·
   Conciliação · Campanhas · Cadastros · Relatórios
   Regras: somente RPCs v39_fin_* (sem escrita direta em tabela); comprovantes no bucket privado fin-comprovantes. */
(function () {
  'use strict';
  var VERSAO = 'FIN-ALL-1';
  if (window.G2_FIN) return;
  window.G2_FIN = { versao: VERSAO };
  console.info('[2Gather] financeiro ' + VERSAO);

  /* ───────────── utilidades ───────────── */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function G() { return window.__gc || null; }
  function cfg() { var g = G(); return (g && g.cfg && g.cfg()) || {}; }
  function eu() { return cfg().usuario || {}; }
  function igrejaId() {
    var V = window.G2_V39 || {};
    if (V.churchContext && typeof V.churchContext.ensure === 'function') { try { var c = V.churchContext.ensure(); if (c) return c; } catch (e) { /* segue */ } }
    return eu().igrejaId || null;
  }
  function v39() { return cfg().token === 'supabase-v39'; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hoje() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dataBR(s) { if (!s) return ''; var p = String(s).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(s); }
  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function brl(v) { return num(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
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
  var MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  var ROT = {
    mov: { income: 'Entrada', expense: 'Saída', transfer_in: 'Transferência (entrada)', transfer_out: 'Transferência (saída)', opening_balance: 'Saldo inicial', adjustment: 'Ajuste', reversal: 'Estorno' },
    movSt: { draft: 'Rascunho', posted: 'Lançado', reconciled: 'Conciliado', reversed: 'Estornado', cancelled: 'Cancelado' },
    desp: { draft: 'Rascunho', pending_approval: 'Aguardando aprovação', correction_requested: 'Correção pedida', approved: 'Aprovada', partially_paid: 'Paga em parte', paid: 'Paga', rejected: 'Recusada', cancelled: 'Cancelada', reversed: 'Estornada' },
    conta: { checking: 'Conta corrente', savings: 'Poupança', cash: 'Caixa (dinheiro)', pix: 'PIX', digital_wallet: 'Carteira digital', investment: 'Investimento', other: 'Outra' },
    nat: { income: 'Entrada', expense: 'Saída', neutral: 'Neutra' },
    comp: { draft: 'Rascunho', active: 'Em dia', due_soon: 'Próximo vencimento', overdue: 'Atrasado', paid: 'Quitado', cancelled: 'Cancelado' },
    parc: { pending: 'A vencer', due_soon: 'Vence logo', overdue: 'Atrasada', partial: 'Parcial', paid: 'Paga', cancelled: 'Cancelada' },
    fat: { open: 'Aberta', closed: 'Fechada', partially_paid: 'Paga em parte', paid: 'Paga', cancelled: 'Cancelada' },
    lote: { draft: 'Rascunho', submitted: 'Enviado', posted: 'Lançado', reversed: 'Estornado', cancelled: 'Cancelado' },
    camp: { draft: 'Rascunho', planned: 'Planejada', active: 'Ativa', completed: 'Concluída', cancelled: 'Cancelada' },
    campTipo: { campaign: 'Campanha', vow: 'Voto', project: 'Projeto', fundraising: 'Arrecadação', other: 'Outra' },
    rec: { monthly: 'Mensal', quarterly: 'Trimestral', semiannual: 'Semestral', annual: 'Anual' }
  };

  var MSG = {
    PERMISSION_DENIED: 'Você não tem permissão para esta ação.',
    TREASURY_ONLY: 'Somente a Tesouraria (ou o Master) faz este lançamento.',
    FIN_START_REQUIRED: 'Defina primeiro a data de início do Financeiro (aba Cadastros).',
    FIN_START_LOCKED: 'Já existem lançamentos: a data de início não pode mais mudar.',
    FIN_BEFORE_START: 'A data é anterior ao início do Financeiro.',
    FIN_FUTURE_DATE: 'A data está no futuro.',
    FIN_DATE_REQUIRED: 'Informe uma data válida.',
    PERIOD_CLOSED: 'Este mês está fechado. Corrija por estorno em um mês aberto.',
    PERIOD_NOT_ENDED: 'O mês ainda não terminou.',
    PERIOD_PREVIOUS_OPEN: 'Feche antes os meses anteriores.',
    PERIOD_HAS_PENDING: 'Há lançamentos ou lotes pendentes neste mês.',
    PERIOD_NOT_RECONCILED: 'Há lançamentos não conciliados neste mês.',
    PERIOD_LATER_CLOSED: 'Reabra antes os meses seguintes.',
    PERIOD_NOT_CLOSED: 'Este mês não está fechado.',
    PERIOD_INVALID: 'Período inválido.',
    FIN_EVIDENCE_REQUIRED: 'Anexe o comprovante.',
    FIN_EVIDENCE_INVALID: 'O comprovante não foi encontrado. Envie o arquivo de novo.',
    FIN_EVIDENCE_SETUP: 'Comprovante sem registro oficial no banco. Avise o administrador (aviso do SQL).',
    FIN_AMOUNT_INVALID: 'Valor inválido.',
    FIN_ACCOUNT_INVALID: 'Escolha uma conta ativa (origem e destino diferentes).',
    FIN_CATEGORY_INVALID: 'Escolha uma categoria válida para este lançamento.',
    FIN_METHOD_INVALID: 'Escolha a forma de pagamento/recebimento.',
    FIN_PERSON_INVALID: 'Escolha a pessoa na lista.',
    FIN_NAME_REQUIRED: 'Preencha os campos obrigatórios.',
    FIN_STATUS_INVALID: 'Situação inválida.',
    FIN_NOT_FOUND: 'Registro não encontrado. Atualize a tela.',
    FIN_NOT_EDITABLE: 'Este registro não pode mais ser alterado.',
    FIN_NOT_REVERSIBLE: 'Este lançamento não pode ser estornado.',
    FIN_REVERSE_AT_ORIGIN: 'Estorne pela tela de origem (despesa, campanha, lote ou transferência).',
    FIN_NOT_APPROVED: 'A despesa ainda não foi aprovada.',
    FIN_NOT_PENDING: 'A despesa não está aguardando aprovação.',
    FIN_SELF_APPROVAL: 'Quem solicitou não pode decidir o próprio pedido.',
    FIN_OPENING_EXISTS: 'Esta conta já tem saldo inicial.',
    FIN_CARD_INVALID: 'Confira os dados do cartão.',
    FIN_SOURCE_INVALID: 'Origem inválida.',
    FIN_SOURCE_DONE: 'Este encontro/culto já foi lançado no Livro.',
    FIN_MATCH_INVALID: 'O lançamento tem conta ou valor diferente da linha do extrato.',
    FIN_IMPORT_INVALID: 'Arquivo de extrato inválido ou muito grande.',
    REASON_REQUIRED: 'Informe o motivo (mínimo 5 letras).'
  };
  function traduz(e) {
    var t = String((e && (e.message || e.details || e.hint || e.code)) || e || '');
    var d = String((e && e.details) || '');
    for (var k in MSG) if (t.indexOf(k) >= 0 || d === k) return MSG[k];
    if (/PGRST202|find the function|does not exist/i.test(t)) return 'Rode o v39_financeiro_completo.sql no Supabase.';
    if (/JWT|token|401/i.test(t)) return 'Sua sessão expirou. Entre de novo.';
    if (/Failed to fetch|NetworkError/i.test(t)) return 'Sem conexão. Tente novamente.';
    var m = t.match(/^[A-Z_]+:\s*(.+)$/); if (m) return m[1];
    if (e && !e.code && !e.details && /[a-zà-ú]/.test(t) && !/[{}()_]|function|column|relation|syntax/i.test(t)) return t;
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
  var S = { ctx: null, cat: null, aba: 'resumo', ano: new Date().getFullYear(), mes: new Date().getMonth() + 1, ov: null, despFiltro: 'abertas', concConta: '', relMes: true };
  function pode(p) { return !!(S.ctx && S.ctx.perms && S.ctx.perms.indexOf(p) >= 0); }
  function algum() { return !!(S.ctx && S.ctx.perms && S.ctx.perms.length); }
  function tes() { return !!(S.ctx && S.ctx.tesouraria); }

  /* ───────────── estilo ───────────── */
  function css() {
    if ($('g2f-css')) return;
    var s = document.createElement('style'); s.id = 'g2f-css';
    s.textContent = [
      '#g2fin{position:fixed;inset:0;z-index:9990;background:#f5f6f8;color:#16181d;overflow:auto;font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}',
      '#g2fin *{box-sizing:border-box}',
      '#g2fin .hd{position:sticky;top:0;z-index:2;background:#0f3d5e;color:#fff;padding:10px 14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      '#g2fin .hd h2{margin:0;font-size:17px;flex:1;min-width:120px}',
      '#g2fin .hd select,#g2fin .hd button{border:0;border-radius:8px;padding:7px 10px;font:inherit}',
      '#g2fin .tabs{display:flex;gap:6px;overflow-x:auto;padding:8px 12px;background:#fff;border-bottom:1px solid #e3e6ea;position:sticky;top:52px;z-index:1}',
      '#g2fin .tabs button{white-space:nowrap;border:1px solid #d5dae0;background:#fff;border-radius:999px;padding:6px 12px;font:inherit;cursor:pointer}',
      '#g2fin .tabs button.on{background:#0f3d5e;color:#fff;border-color:#0f3d5e}',
      '#g2fin .bd{padding:12px;max-width:1100px;margin:0 auto}',
      '#g2fin .card{background:#fff;border:1px solid #e3e6ea;border-radius:12px;padding:12px;margin-bottom:12px}',
      '#g2fin .card h3{margin:0 0 8px;font-size:15px}',
      '#g2fin .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}',
      '#g2fin .kpi{background:#fff;border:1px solid #e3e6ea;border-radius:12px;padding:10px}',
      '#g2fin .kpi b{display:block;font-size:18px}',
      '#g2fin .mut{color:#667085;font-size:12px}',
      '#g2fin .pos{color:#067647}#g2fin .neg{color:#b42318}',
      '#g2fin table{width:100%;border-collapse:collapse;font-size:13px}',
      '#g2fin th,#g2fin td{padding:7px 6px;border-bottom:1px solid #eef0f3;text-align:left;vertical-align:top}',
      '#g2fin td.r,#g2fin th.r{text-align:right;white-space:nowrap}',
      '#g2fin .tw{overflow-x:auto}',
      '#g2fin .btn{border:1px solid #0f3d5e;background:#0f3d5e;color:#fff;border-radius:8px;padding:7px 12px;font:inherit;cursor:pointer}',
      '#g2fin .btn.sec{background:#fff;color:#0f3d5e}',
      '#g2fin .btn.mini{padding:3px 8px;font-size:12px}',
      '#g2fin .btn.red{background:#b42318;border-color:#b42318}',
      '#g2fin .btn:disabled{opacity:.5;cursor:default}',
      '#g2fin .acts{display:flex;gap:6px;flex-wrap:wrap}',
      '#g2fin .tag{display:inline-block;border-radius:999px;padding:1px 8px;font-size:11px;background:#eef2f6;color:#344054}',
      '#g2fin .tag.ok{background:#dcfae6;color:#067647}#g2fin .tag.warn{background:#fef0c7;color:#93370d}#g2fin .tag.bad{background:#fee4e2;color:#b42318}',
      '#g2fin .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}',
      '#g2fin .row select,#g2fin .row input{border:1px solid #d0d5dd;border-radius:8px;padding:6px 8px;font:inherit}',
      '#g2fin .vazio{color:#667085;padding:10px 0}',
      '#g2f-mod{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9995;display:flex;align-items:flex-end;justify-content:center}',
      '#g2f-mod .box{background:#fff;color:#16181d;width:100%;max-width:560px;max-height:92vh;overflow:auto;border-radius:14px 14px 0 0;padding:14px;font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}',
      '@media(min-width:700px){#g2f-mod{align-items:center}#g2f-mod .box{border-radius:14px}}',
      '#g2f-mod h3{margin:0 0 10px;font-size:16px}',
      '#g2f-mod label{display:block;font-size:12px;color:#475467;margin:8px 0 3px}',
      '#g2f-mod input,#g2f-mod select,#g2f-mod textarea{width:100%;border:1px solid #d0d5dd;border-radius:8px;padding:8px;font:inherit;background:#fff;color:#16181d}',
      '#g2f-mod textarea{min-height:70px}',
      '#g2f-mod .chk{display:flex;gap:6px;align-items:center;margin-top:8px}#g2f-mod .chk input{width:auto}',
      '#g2f-mod .hint{font-size:12px;color:#667085;margin-top:3px}',
      '#g2f-mod .err{color:#b42318;font-size:13px;margin-top:8px;min-height:1em}',
      '#g2f-mod .ft{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}',
      '#g2f-mod .ft button{border:1px solid #0f3d5e;background:#0f3d5e;color:#fff;border-radius:8px;padding:8px 14px;font:inherit;cursor:pointer}',
      '#g2f-mod .ft button.sec{background:#fff;color:#0f3d5e}',
      '#g2f-mod .pl{border:1px solid #e3e6ea;border-radius:8px;margin-top:4px;max-height:160px;overflow:auto}',
      '#g2f-mod .pl div{padding:6px 8px;cursor:pointer}#g2f-mod .pl div:hover{background:#f2f4f7}',
      '#g2f-fab{position:fixed;left:12px;bottom:84px;z-index:9980;border:0;border-radius:999px;background:#0f3d5e;color:#fff;padding:10px 14px;font:600 13px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer}',
      '#g2f-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:24px;z-index:9999;background:#16181d;color:#fff;padding:10px 14px;border-radius:10px;max-width:92vw;display:none;font:14px system-ui,sans-serif}',
      '#g2fin button:focus-visible,#g2f-mod button:focus-visible{outline:2px solid #2e90fa;outline-offset:2px}',
      '@media print{body>*:not(#g2fin){display:none!important}#g2fin{position:static;overflow:visible;background:#fff}#g2fin .hd,#g2fin .tabs,#g2fin .noprint{display:none!important}#g2fin .card{break-inside:avoid;border:0}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ───────────── janela de formulário genérica ───────────── */
  // campos: {k, l(label), t: text|number|money|date|select|textarea|check|file|pessoa|info, o:[[v,txt]], v, req, h(hint)}
  function form(titulo, campos, okTxt, aoSalvar) {
    fecharMod();
    var o = document.createElement('div'); o.id = 'g2f-mod';
    var h = '<div class="box" role="dialog" aria-modal="true"><h3>' + esc(titulo) + '</h3><form novalidate>';
    campos.forEach(function (c, i) {
      var id = 'g2f-f' + i, v = c.v == null ? '' : c.v, rq = c.req ? ' *' : '';
      if (c.t === 'info') { h += '<div class="hint" style="margin-top:8px">' + c.l + '</div>'; return; }
      if (c.t === 'check') { h += '<div class="chk"><input type="checkbox" id="' + id + '"' + (v ? ' checked' : '') + '><label for="' + id + '" style="margin:0">' + esc(c.l) + '</label></div>'; return; }
      h += '<label for="' + id + '">' + esc(c.l) + rq + '</label>';
      if (c.t === 'select') {
        h += '<select id="' + id + '">' + (c.vazio !== false ? '<option value="">' + esc(c.vazio || '— escolha —') + '</option>' : '') + (c.o || []).map(function (x) {
          return '<option value="' + esc(x[0]) + '"' + (String(x[0]) === String(v) ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>';
      } else if (c.t === 'textarea') {
        h += '<textarea id="' + id + '">' + esc(v) + '</textarea>';
      } else if (c.t === 'file') {
        h += '<input type="file" id="' + id + '" accept="image/*,application/pdf">';
      } else if (c.t === 'pessoa') {
        h += '<input type="text" id="' + id + '" autocomplete="off" placeholder="Digite 3 letras do nome" value="' + esc(c.nome || '') + '" data-pid="' + esc(v) + '"><div class="pl" id="' + id + '-l" hidden></div>';
      } else {
        var tp = c.t === 'date' ? 'date' : (c.t === 'number' ? 'number' : 'text');
        var im = c.t === 'money' ? ' inputmode="decimal" placeholder="0,00"' : '';
        var vv = c.t === 'money' && v !== '' ? String(v).replace('.', ',') : v;
        h += '<input type="' + tp + '" id="' + id + '"' + im + ' value="' + esc(vv) + '">';
      }
      if (c.h) h += '<div class="hint">' + esc(c.h) + '</div>';
    });
    h += '<div class="err" aria-live="polite"></div><div class="ft"><button type="button" class="sec" data-x="cancelar">Cancelar</button><button type="submit">' + esc(okTxt || 'Salvar') + '</button></div></form></div>';
    o.innerHTML = h;
    o.addEventListener('click', function (ev) { if (ev.target === o) fecharMod(); });
    document.body.appendChild(o);
    o.querySelector('[data-x="cancelar"]').addEventListener('click', fecharMod);
    // busca de pessoas
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
      });
    });
    var f = o.querySelector('form'), btn = f.querySelector('button[type="submit"]'), err = f.querySelector('.err');
    f.addEventListener('submit', function (ev) {
      ev.preventDefault(); err.textContent = '';
      var val = {}, falta = [];
      campos.forEach(function (c, i) {
        if (c.t === 'info') return;
        var el = $('g2f-f' + i), x;
        if (c.t === 'check') x = el.checked;
        else if (c.t === 'file') x = el.files && el.files[0] ? el.files[0] : null;
        else if (c.t === 'pessoa') { x = el.getAttribute('data-pid') || ''; val[c.k + '_nome'] = el.value; val[c.k + '_w'] = el.getAttribute('data-w') || ''; }
        else if (c.t === 'money') { x = lerValor(el.value); if (el.value.trim() && x == null) falta.push(c.l + ' (valor inválido)'); }
        else x = String(el.value || '').trim();
        if (c.req && (x === '' || x == null || x === false)) falta.push(c.l);
        val[c.k] = x;
      });
      if (falta.length) { err.textContent = 'Preencha: ' + falta.join(', ') + '.'; return; }
      btn.disabled = true; btn.textContent = 'Salvando…';
      Promise.resolve().then(function () { return aoSalvar(val); }).then(function (msg) {
        fecharMod(); if (msg !== false) toast(msg || 'Salvo.'); recarregar();
      }).catch(function (e) {
        console.warn('[2Gather][fin]', e); err.textContent = traduz(e); btn.disabled = false; btn.textContent = okTxt || 'Salvar';
      });
    });
    var first = o.querySelector('input,select,textarea'); if (first) setTimeout(function () { first.focus(); }, 50);
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
  function opFornec() { return ((S.cat && S.cat.fornecedores) || []).filter(function (f) { return f.status !== 'inactive'; }).map(function (f) { return [f.id, f.nome]; }); }
  function opCartoes() { return ((S.cat && S.cat.cartoes) || []).filter(function (k) { return k.status === 'active'; }).map(function (k) { return [k.id, k.nome + ' •' + k.final]; }); }
  function opCampanhas() { return ((S.cat && S.cat.campanhas) || []).map(function (c) { return [c.id, c.nome]; }); }

  /* ───────────── abrir / fechar / abas ───────────── */
  var ABAS = [
    { id: 'resumo', nome: 'Resumo', ok: function () { return pode('financial.book.view') || pode('financial.reports.view'); } },
    { id: 'livro', nome: 'Livro', ok: function () { return pode('financial.book.view'); } },
    { id: 'conferir', nome: 'A conferir', ok: function () { return pode('financial.sources.view'); } },
    { id: 'entrada', nome: 'Nova entrada', ok: function () { return pode('financial.movements.create') && tes(); } },
    { id: 'despesas', nome: 'Despesas', ok: function () { return pode('financial.expenses.create') || pode('financial.expenses.view'); } },
    { id: 'transf', nome: 'Transferências e cartões', ok: function () { return pode('financial.transfers.manage') || pode('financial.cards.manage'); } },
    { id: 'conc', nome: 'Conciliação', ok: function () { return pode('financial.reconciliation.manage') && tes(); } },
    { id: 'camp', nome: 'Campanhas', ok: function () { return pode('financial.campaigns.view'); } },
    { id: 'cad', nome: 'Cadastros', ok: function () { return pode('financial.accounts.manage') || pode('financial.categories.manage') || (S.ctx && S.ctx.master); } },
    { id: 'rel', nome: 'Relatórios', ok: function () { return pode('financial.reports.view'); } }
  ];
  function abasVisiveis() { return ABAS.filter(function (a) { return a.ok(); }); }

  function abrir(aba) {
    if (!v39()) return toast('O Financeiro novo funciona só na versão v39.');
    css();
    carregarCtx().then(function () {
      if (!algum()) return toast('Você não tem acesso ao Financeiro.');
      var vis = abasVisiveis();
      if (aba && vis.some(function (a) { return a.id === aba; })) S.aba = aba;
      if (!vis.some(function (a) { return a.id === S.aba; })) S.aba = vis.length ? vis[0].id : 'despesas';
      var o = $('g2fin');
      if (!o) {
        o = document.createElement('div'); o.id = 'g2fin';
        o.addEventListener('click', clique); o.addEventListener('change', mudanca);
        document.body.appendChild(o);
        document.addEventListener('keydown', tecla);
      }
      pintarBase(); recarregar();
    }).catch(function (e) { toast(traduz(e)); });
  }
  function fechar() { var o = $('g2fin'); if (o) o.remove(); fecharMod(); document.removeEventListener('keydown', tecla); }
  function tecla(ev) { if (ev.key === 'Escape') { if ($('g2f-mod')) fecharMod(); else fechar(); } }

  function pintarBase() {
    var o = $('g2fin'); if (!o) return;
    var anos = [], y = new Date().getFullYear(); for (var i = y + 1; i >= y - 5; i--) anos.push(i);
    o.innerHTML = '<div class="hd"><h2>Financeiro</h2>' +
      '<select data-c="mes" aria-label="Mês">' + MESES.map(function (m, i) { return '<option value="' + (i + 1) + '"' + (i + 1 === S.mes ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select>' +
      '<select data-c="ano" aria-label="Ano">' + anos.map(function (a) { return '<option' + (a === S.ano ? ' selected' : '') + '>' + a + '</option>'; }).join('') + '</select>' +
      '<button type="button" data-a="fechar" aria-label="Fechar Financeiro">✕ Fechar</button></div>' +
      '<div class="tabs" role="tablist">' + abasVisiveis().map(function (a) { return '<button type="button" role="tab" data-a="aba" data-v="' + a.id + '"' + (a.id === S.aba ? ' class="on" aria-selected="true"' : '') + '>' + a.nome + '</button>'; }).join('') + '</div>' +
      '<div class="bd" id="g2f-bd" aria-live="polite"><div class="vazio">Carregando…</div></div>';
  }
  function corpo(h) { var b = $('g2f-bd'); if (b) b.innerHTML = h; }

  function carregarCtx() {
    if (!igrejaId()) return Promise.reject(new Error('Igreja não identificada. Atualize a página.'));
    return rpc('v39_fin_context', C({})).then(function (x) { S.ctx = x || { perms: [] }; });
  }
  function carregarCat() { return rpc('v39_fin_catalogs', C({})).then(function (x) { S.cat = x || {}; }); }

  function recarregar() {
    if (!$('g2fin')) return;
    corpo('<div class="vazio">Carregando…</div>');
    var r = { resumo: tResumo, livro: tLivro, conferir: tConferir, entrada: tEntrada, despesas: tDespesas, transf: tTransf, conc: tConc, camp: tCamp, cad: tCad, rel: tRel }[S.aba];
    carregarCtx().then(carregarCat).then(function () { return r(); }).catch(function (e) { console.warn('[2Gather][fin]', e); corpo('<div class="card">' + esc(traduz(e)) + '</div>'); });
  }

  /* ───────────── RESUMO ───────────── */
  function avisoInicio() {
    if (S.ctx && S.ctx.inicio) return '';
    return '<div class="card" style="border-color:#f79009"><b>Defina a data de início do Financeiro.</b><div class="mut">Ela marca o primeiro dia do Livro. Lançamentos de GC e cultos a partir dessa data aparecem em "A conferir". ' +
      (S.ctx && S.ctx.master ? 'Vá em Cadastros › Início do Financeiro.' : 'Peça ao Master.') + '</div></div>';
  }
  function tResumo() {
    return rpc('v39_fin_overview', C({ p_year: S.ano, p_month: S.mes })).then(function (x) {
      S.ov = x; var t = x.totais || {}, per = x.periodo || {};
      var h = avisoInicio();
      h += '<div class="grid"><div class="kpi"><span class="mut">Entradas do mês</span><b class="pos">' + brl(t.entradas) + '</b></div>' +
        '<div class="kpi"><span class="mut">Saídas do mês</span><b class="neg">' + brl(t.saidas) + '</b></div>' +
        '<div class="kpi"><span class="mut">Resultado</span><b class="' + (num(t.resultado) < 0 ? 'neg' : 'pos') + '">' + brl(t.resultado) + '</b></div>' +
        '<div class="kpi"><span class="mut">Mês</span><b>' + (per.status === 'closed' ? '🔒 Fechado' : 'Aberto') + '</b>' +
        (per.status === 'closed' && S.ctx.podeReabrir ? '<button type="button" class="btn mini sec" data-a="reabrir">Reabrir</button>' : '') +
        (per.status !== 'closed' && S.ctx.podeFechar ? '<button type="button" class="btn mini" data-a="fecharMes">Fechar mês</button>' : '') + '</div></div>';
      h += '<div class="card"><h3>Saldos por conta</h3><div class="tw"><table><thead><tr><th>Conta</th><th class="r">Início do mês</th><th class="r">Fim do mês</th><th class="r">Hoje</th><th class="r">Não conciliados</th></tr></thead><tbody>' +
        ((x.contas || []).length ? x.contas.map(function (a) { return '<tr><td>' + esc(a.nome) + '<div class="mut">' + esc(ROT.conta[a.tipo] || a.tipo) + (a.status !== 'active' ? ' · inativa' : '') + '</div></td><td class="r">' + brl(a.saldoInicioMes) + '</td><td class="r">' + brl(a.saldoFimMes) + '</td><td class="r"><b>' + brl(a.saldoAtual) + '</b></td><td class="r">' + (a.naoConciliados || 0) + '</td></tr>'; }).join('') : '<tr><td colspan="5" class="vazio">Nenhuma conta. Cadastre em Cadastros.</td></tr>') +
        '</tbody></table></div><div class="mut">Saldo = saldo inicial + entradas − saídas ± transferências (lançamentos e estornos). Compromissos e despesas só aprovadas não entram.</div></div>';
      var fech = (x.meses || []).filter(function (m) { return m.status === 'closed'; });
      if (fech.length) h += '<div class="card"><h3>Meses fechados</h3>' + fech.map(function (m) { return '<span class="tag">' + MESES[m.mes - 1].slice(0, 3) + '/' + m.ano + '</span> '; }).join('') + '</div>';
      corpo(h);
    });
  }

  /* ───────────── LIVRO ───────────── */
  function tLivro() {
    return rpc('v39_fin_overview', C({ p_year: S.ano, p_month: S.mes })).then(function (x) {
      S.ov = x; var L = x.livro || [], fechado = x.periodo && x.periodo.status === 'closed';
      var h = '<div class="row noprint">' + (pode('financial.reports.export') ? '<button type="button" class="btn sec mini" data-a="csvLivro">Exportar CSV</button>' : '') +
        '<span class="mut">' + L.length + ' lançamento(s) em ' + MESES[S.mes - 1] + '/' + S.ano + (fechado ? ' · mês fechado' : '') + '</span></div>';
      h += '<div class="card"><div class="tw"><table><thead><tr><th>Data</th><th>Descrição</th><th>Conta</th><th class="r">Valor</th><th>Situação</th><th class="noprint"></th></tr></thead><tbody>';
      h += L.length ? L.map(function (m) {
        var v = num(m.valor) * num(m.efeitoCaixa || (m.efeitoResultado || 0)), cls = v < 0 ? 'neg' : (v > 0 ? 'pos' : '');
        var a = [];
        if (m.comprovantePath) a.push('<button type="button" class="btn mini sec" data-a="verComp" data-v="' + esc(m.comprovantePath) + '">Comprovante</button>');
        if (tes() && !fechado && pode('financial.reconciliation.manage') && m.status === 'posted' && m.efeitoCaixa !== 0) a.push('<button type="button" class="btn mini sec" data-a="conc" data-v="' + m.id + '">Conciliar</button>');
        if (tes() && !fechado && pode('financial.reconciliation.manage') && m.status === 'reconciled') a.push('<button type="button" class="btn mini sec" data-a="desconc" data-v="' + m.id + '">Desconciliar</button>');
        if (tes() && m.manual && m.status === 'posted' && m.tipo === 'income' && pode('financial.movements.update')) a.push('<button type="button" class="btn mini sec" data-a="editMov" data-v="' + m.id + '">Editar</button>');
        if (tes() && pode('financial.movements.reverse') && (m.status === 'posted' || m.status === 'reconciled') && m.tipo !== 'reversal') a.push('<button type="button" class="btn mini red" data-a="estornar" data-v="' + m.id + '">Estornar</button>');
        return '<tr><td>' + dataBR(m.data) + '</td><td>' + esc(m.descricao) + '<div class="mut">' + esc(ROT.mov[m.tipo] || m.tipo) + ' · ' + esc(m.categoria || '') + (m.forma ? ' · ' + esc(m.forma) : '') + (m.pessoa ? ' · ' + esc(m.pessoa) : '') + '</div></td><td>' + esc(m.conta) + '</td><td class="r ' + cls + '">' + brl(v) + '</td><td><span class="tag ' + (m.status === 'reconciled' ? 'ok' : (m.status === 'reversed' ? 'bad' : '')) + '">' + esc(ROT.movSt[m.status] || m.status) + '</span></td><td class="noprint"><div class="acts">' + a.join('') + '</div></td></tr>';
      }).join('') : '<tr><td colspan="6" class="vazio">Nenhum lançamento neste mês.</td></tr>';
      corpo(h + '</tbody></table></div></div>');
    });
  }
  function csvLivro() {
    var L = (S.ov && S.ov.livro) || []; if (!L.length) return toast('Nada para exportar.');
    var lin = [['Data', 'Tipo', 'Descricao', 'Categoria', 'Conta', 'Forma', 'Pessoa', 'Valor', 'Situacao']].concat(L.map(function (m) {
      return [dataBR(m.data), ROT.mov[m.tipo] || m.tipo, m.descricao, m.categoria, m.conta, m.forma || '', m.pessoa || '', String((num(m.valor) * num(m.efeitoCaixa || m.efeitoResultado || 0)).toFixed(2)).replace('.', ','), ROT.movSt[m.status] || m.status];
    }));
    baixar('livro_' + S.ano + '-' + pad(S.mes) + '.csv', '\ufeff' + lin.map(function (r) { return r.map(function (c) { c = String(c == null ? '' : c); return /[;"\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(';'); }).join('\r\n'));
  }
  function baixar(nome, txt) {
    var b = new Blob([txt], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = nome; document.body.appendChild(a); a.click();
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

  /* ───────────── A CONFERIR (GC e cultos) ───────────── */
  var PEND = [];
  function tConferir() {
    return Promise.all([rpc('v39_fin_source_pending', C({})), rpc('v39_fin_sources', C({ p_from: null }))]).then(function (r) {
      var p = r[0] || {}, lotes = r[1] || []; PEND = p.itens || [];
      var h = avisoInicio();
      h += '<div class="card"><h3>A conferir (' + PEND.length + ')</h3><div class="mut">Valores que o líder informou no encontro do GC e os da ficha do culto, desde ' + (p.inicio ? dataBR(p.inicio) : 'o início do Financeiro') + '. Só entram no Livro e no saldo depois que a Tesouraria confere e lança.</div>';
      h += PEND.length ? '<div class="tw"><table><thead><tr><th>Data</th><th>Origem</th><th class="r">Dízimos</th><th class="r">Ofertas</th><th class="r">Outras</th><th class="r">Total</th><th></th></tr></thead><tbody>' + PEND.map(function (x, i) {
        var tot = num(x.dizimo) + num(x.oferta) + num(x.outras);
        return '<tr><td>' + dataBR(x.data) + '</td><td>' + esc(x.titulo) + '<div class="mut">' + (x.tipo === 'gc' ? 'Encontro de GC' : 'Culto/evento') + '</div></td><td class="r">' + brl(x.dizimo) + '</td><td class="r">' + brl(x.oferta) + '</td><td class="r">' + brl(x.outras) + '</td><td class="r"><b>' + brl(tot) + '</b></td><td>' +
          (tes() && pode('financial.sources.post') ? '<button type="button" class="btn mini" data-a="lancarLote" data-v="' + i + '">Conferir e lançar</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="vazio">Nada pendente.</div>';
      h += '</div><div class="card"><h3>Lotes lançados</h3>' + (lotes.length ? '<div class="tw"><table><thead><tr><th>Data</th><th>Origem</th><th class="r">Total</th><th>Situação</th><th></th></tr></thead><tbody>' + lotes.slice(0, 200).map(function (b) {
        return '<tr><td>' + dataBR(b.data) + '</td><td>' + esc(b.titulo) + '<div class="mut">' + esc(b.modulo === 'gc' ? 'GC' : 'Culto/evento') + '</div></td><td class="r">' + brl(b.total) + '</td><td><span class="tag ' + (b.status === 'posted' ? 'ok' : (b.status === 'reversed' ? 'bad' : '')) + '">' + esc(ROT.lote[b.status] || b.status) + '</span></td><td>' +
          (b.status === 'posted' && tes() && pode('financial.sources.reverse') ? '<button type="button" class="btn mini red" data-a="estLote" data-v="' + b.id + '">Estornar</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="vazio">Nenhum lote ainda.</div>') + '</div>';
      corpo(h);
    });
  }
  function lancarLote(i) {
    var x = PEND[i]; if (!x) return;
    var caixa = ((S.cat.contas || []).filter(function (a) { return a.status === 'active' && a.tipo === 'cash'; })[0] || {}).id || '';
    var din = ((S.cat.formas || []).filter(function (f) { return f.ativa && f.tipo === 'cash'; })[0] || {}).id || '';
    form('Conferir e lançar · ' + x.titulo + ' · ' + dataBR(x.data), [
      { t: 'info', l: 'Informado: dízimos ' + brl(x.dizimo) + ', ofertas ' + brl(x.oferta) + (num(x.outras) ? ', outras ' + brl(x.outras) : '') + '. Lance o valor contado; se for diferente, explique em Observação.' },
      { k: 'dizimo', l: 'Dízimos contados', t: 'money', v: x.dizimo },
      { k: 'oferta', l: 'Ofertas contadas', t: 'money', v: x.oferta },
      { k: 'outras', l: 'Outras entradas', t: 'money', v: x.outras },
      { k: 'contaId', l: 'Conta onde o dinheiro entrou', t: 'select', o: opContas(true), v: caixa, req: true },
      { k: 'formaId', l: 'Forma', t: 'select', o: opFormas(true), v: din, req: true },
      { k: 'obs', l: 'Observação', t: 'textarea' }
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

  /* ───────────── NOVA ENTRADA ───────────── */
  function tEntrada() {
    var h = avisoInicio() + '<div class="card"><h3>Nova entrada</h3><div class="mut">Dízimos, ofertas, doações, eventos e outras entradas. Campanhas e votos entram pela aba Campanhas (recebimento do compromisso). PIX e transferência exigem comprovante.</div><div class="row" style="margin-top:10px"><button type="button" class="btn" data-a="novaEntrada">+ Registrar entrada</button></div></div>';
    corpo(h); return Promise.resolve();
  }
  function novaEntrada() {
    form('Nova entrada', [
      { k: 'data', l: 'Data', t: 'date', v: hoje(), req: true },
      { k: 'valor', l: 'Valor', t: 'money', req: true },
      { k: 'categoriaId', l: 'Categoria', t: 'select', o: opCats('income'), req: true },
      { k: 'contaId', l: 'Conta / caixa', t: 'select', o: opContas(true), req: true },
      { k: 'formaId', l: 'Forma de recebimento', t: 'select', o: opFormas(true), req: true },
      { k: 'anonimo', l: 'Contribuição anônima', t: 'check' },
      { k: 'pessoaId', l: 'Pessoa (se identificada)', t: 'pessoa' },
      { k: 'origemTipo', l: 'Origem', t: 'select', o: [['culto', 'Culto'], ['evento', 'Evento'], ['doacao', 'Doação'], ['avulsa', 'Avulsa']], vazio: '— avulsa —' },
      { k: 'descricao', l: 'Descrição', h: 'Se vazio, usa o nome da categoria.' },
      { k: 'arq', l: 'Comprovante', t: 'file' },
      { k: 'obs', l: 'Observação', t: 'textarea' }
    ], 'Lançar', function (v) {
      var tp = formaTipo(v.formaId);
      if ((tp === 'pix' || tp === 'bank_transfer') && !v.arq) return Promise.reject(new Error('FIN_EVIDENCE_REQUIRED'));
      return enviarComprovante(v.arq).then(function (ev) {
        return rpc('v39_fin_post_income', C({ p: { data: v.data, valor: v.valor, categoriaId: v.categoriaId, contaId: v.contaId, formaId: v.formaId, anonimo: v.anonimo || !v.pessoaId, pessoaId: v.pessoaId || null, origemTipo: v.origemTipo || null, descricao: v.descricao, comprovanteId: ev, obs: v.obs || null, chave: uuid() } }));
      }).then(function () { return 'Entrada lançada.'; });
    });
  }

  /* ───────────── DESPESAS ───────────── */
  var DESP = [], RECS = [];
  function tDespesas() {
    var ps = [rpc('v39_fin_expenses', C({ p_filter: S.despFiltro }))];
    if (pode('financial.recurrences.manage')) ps.push(rpc('v39_fin_recurrences', C({})));
    return Promise.all(ps).then(function (r) {
      DESP = r[0] || []; RECS = r[1] || [];
      var h = '<div class="row noprint">' + (pode('financial.expenses.create') ? '<button type="button" class="btn" data-a="novaDesp">+ Nova despesa</button>' : '') +
        (pode('financial.expenses.create') || pode('financial.bills.manage') ? '<button type="button" class="btn sec" data-a="novoFornec">+ Fornecedor</button>' : '') +
        '<select data-c="despFiltro" aria-label="Filtro"><option value="abertas"' + (S.despFiltro === 'abertas' ? ' selected' : '') + '>Em andamento</option><option value="encerradas"' + (S.despFiltro === 'encerradas' ? ' selected' : '') + '>Encerradas (120 dias)</option><option value="todas"' + (S.despFiltro === 'todas' ? ' selected' : '') + '>Todas</option></select></div>';
      h += '<div class="card"><h3>Despesas</h3><div class="mut">Solicitar → aprovar → pagar. Aprovação não mexe no saldo; só o pagamento sai da conta. Quem solicitou não decide o próprio pedido.</div>';
      h += DESP.length ? '<div class="tw"><table><thead><tr><th>Despesa</th><th>Vencimento</th><th class="r">Valor</th><th>Situação</th><th></th></tr></thead><tbody>' + DESP.map(function (e) {
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
        if (e.comprovantePath) a.push('<button type="button" class="btn mini sec" data-a="verComp" data-v="' + esc(e.comprovantePath) + '">Documento</button>');
        var tag = st === 'paid' ? 'ok' : (st === 'pending_approval' || st === 'correction_requested' ? 'warn' : (st === 'rejected' || st === 'cancelled' ? 'bad' : ''));
        return '<tr><td>' + esc(e.descricao) + '<div class="mut">' + esc(e.categoria || '') + (e.fornecedor ? ' · ' + esc(e.fornecedor) : '') + (e.solicitante ? ' · por ' + esc(e.solicitante) : '') + (e.motivo ? '<br>Motivo: ' + esc(e.motivo) : '') + (e.boleto && e.boleto.linha ? '<br>Boleto: ' + esc(e.boleto.linha) : '') + '</div></td><td>' + dataBR(e.vencimento) + '</td><td class="r">' + brl(e.aprovado || e.valor) + (num(e.pago) ? '<div class="mut">pago ' + brl(e.pago) + '</div>' : '') + '</td><td><span class="tag ' + tag + '">' + esc(ROT.desp[st] || st) + '</span></td><td><div class="acts">' + a.join('') + '</div></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="vazio">Nenhuma despesa neste filtro.</div>';
      h += '</div>';
      if (pode('financial.recurrences.manage')) {
        h += '<div class="card"><h3>Contas fixas (recorrências)</h3><div class="row"><button type="button" class="btn sec mini" data-a="novaRec">+ Conta fixa</button></div>' + (RECS.length ? '<div class="tw"><table><thead><tr><th>Nome</th><th>Periodicidade</th><th class="r">Valor</th><th>Próximo</th><th></th></tr></thead><tbody>' + RECS.map(function (r) {
          return '<tr><td>' + esc(r.nome) + (r.status !== 'active' ? ' <span class="tag">pausada</span>' : '') + '</td><td>' + esc(ROT.rec[r.tipo] || r.tipo) + '</td><td class="r">' + brl(r.valor) + '</td><td>' + dataBR(r.proximo) + '</td><td><div class="acts">' + bt('editRec', r.id, 'Editar', 'sec') + (r.status === 'active' ? bt('gerarRec', r.id, 'Gerar despesa do mês') : '') + '</div></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="vazio">Nenhuma conta fixa.</div>') + '</div>';
      }
      corpo(h);
    });
  }
  function bt(a, v, t, cls) { return '<button type="button" class="btn mini ' + (cls || '') + '" data-a="' + a + '" data-v="' + esc(v) + '">' + esc(t) + '</button>'; }
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
      { k: 'arq', l: 'Documento / nota / boleto', t: 'file' },
      { k: 'obs', l: 'Observação', t: 'textarea', v: e.obs },
      { k: 'enviar', l: 'Já enviar para aprovação', t: 'check', v: !e.id }
    ], 'Salvar', function (v) {
      var id;
      return enviarComprovante(v.arq).then(function (ev) {
        return rpc('v39_fin_expense_save', C({ p_id: e.id || null, p: { descricao: v.descricao, categoriaId: v.categoriaId, valor: v.valor, fornecedorId: v.fornecedorId || null, emissao: v.emissao || null, vencimento: v.vencimento || null, competencia: v.competencia || null, linhaDigitavel: v.linhaDigitavel || null, comprovanteId: ev, obs: v.obs || null, chave: uuid() } }));
      }).then(function (r) {
        id = r && r.id;
        if (v.enviar && id && pode('financial.expenses.submit')) return rpc('v39_fin_expense_submit', C({ p_id: id })).then(function () { return 'Despesa enviada para aprovação.'; });
        return 'Despesa salva como rascunho.';
      });
    });
  }
  function pagarDesp(id) {
    var e = despesa(id); if (!e) return;
    var saldo = Math.round((num(e.aprovado || e.valor) - num(e.pago)) * 100) / 100;
    var cart = opCartoes();
    form('Pagar · ' + e.descricao, [
      { t: 'info', l: 'Aprovado ' + brl(e.aprovado || e.valor) + ' · já pago ' + brl(e.pago) + ' · a pagar ' + brl(saldo) },
      { k: 'data', l: 'Data do pagamento', t: 'date', v: hoje(), req: true },
      { k: 'valor', l: 'Valor pago', t: 'money', v: saldo, req: true },
      { k: 'meio', l: 'Pagar com', t: 'select', o: [['conta', 'Conta / caixa']].concat(cart.length ? [['cartao', 'Cartão de crédito']] : []), v: 'conta', vazio: false },
      { k: 'contaId', l: 'Conta (se conta/caixa)', t: 'select', o: opContas(true) },
      { k: 'formaId', l: 'Forma (se conta/caixa)', t: 'select', o: opFormas(true) },
      { k: 'arq', l: 'Comprovante do pagamento (obrigatório em conta/caixa)', t: 'file' },
      { k: 'cartaoId', l: 'Cartão (se cartão)', t: 'select', o: cart },
      { k: 'parcelas', l: 'Parcelas no cartão', t: 'number', v: 1, h: 'No cartão lance o valor total; as parcelas vão para as próximas faturas.' },
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
      { k: 'nome', l: 'Nome', v: r.nome, req: true },
      { k: 'categoriaId', l: 'Categoria', t: 'select', o: opCats('expense'), v: r.categoriaId, req: true },
      { k: 'fornecedorId', l: 'Fornecedor', t: 'select', o: opFornec(), v: r.fornecedorId, vazio: '— nenhum —' },
      { k: 'valor', l: 'Valor padrão', t: 'money', v: r.valor, req: true },
      { k: 'tipo', l: 'Periodicidade', t: 'select', o: [['monthly', 'Mensal'], ['quarterly', 'Trimestral'], ['semiannual', 'Semestral'], ['annual', 'Anual']], v: r.tipo || 'monthly', vazio: false },
      { k: 'inicio', l: 'Primeiro vencimento', t: 'date', v: r.inicio ? String(r.inicio).slice(0, 10) : '', req: !r.id },
      { k: 'fim', l: 'Termina em (opcional)', t: 'date', v: r.fim ? String(r.fim).slice(0, 10) : '' },
      { k: 'status', l: 'Situação', t: 'select', o: [['active', 'Ativa'], ['paused', 'Pausada']], v: r.status || 'active', vazio: false },
      { k: 'obs', l: 'Observação', t: 'textarea', v: r.obs }
    ], 'Salvar', function (v) {
      return rpc('v39_fin_recurrence_save', C({ p_id: r.id || null, p: { nome: v.nome, categoriaId: v.categoriaId, fornecedorId: v.fornecedorId || null, valor: v.valor, tipo: v.tipo, inicio: v.inicio || r.inicio, fim: v.fim || null, status: v.status, obs: v.obs || null } })).then(function () { return 'Conta fixa salva.'; });
    });
  }

  /* ───────────── TRANSFERÊNCIAS E CARTÕES ───────────── */
  var FATS = [];
  function tTransf() {
    var ps = [pode('financial.book.view') ? rpc('v39_fin_transfers', C({ p_year: S.ano, p_month: S.mes })) : Promise.resolve([]),
      pode('financial.book.view') ? rpc('v39_fin_card_statements', C({})) : Promise.resolve([])];
    return Promise.all(ps).then(function (r) {
      var T = r[0] || []; FATS = r[1] || [];
      var h = '';
      if (pode('financial.transfers.manage')) {
        h += '<div class="card"><h3>Transferências entre contas</h3><div class="mut">Não é entrada nem saída: tira de uma conta e põe na outra (ex.: depósito do caixa no banco).</div><div class="row" style="margin-top:8px">' + (tes() ? '<button type="button" class="btn" data-a="novaTransf">+ Transferir</button>' : '') + '</div>' +
          (T.length ? '<div class="tw"><table><thead><tr><th>Data</th><th>De → Para</th><th class="r">Valor</th><th>Situação</th><th></th></tr></thead><tbody>' + T.map(function (t) {
            return '<tr><td>' + dataBR(t.data) + '</td><td>' + esc(t.origem) + ' → ' + esc(t.destino) + '<div class="mut">' + esc(t.descricao) + '</div></td><td class="r">' + brl(t.valor) + '</td><td><span class="tag">' + esc(ROT.movSt[t.status] || t.status) + '</span></td><td>' + ((t.status === 'posted' || t.status === 'reconciled') && tes() ? bt('estTransf', t.id, 'Estornar', 'red') : '') + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="vazio">Nenhuma transferência em ' + MESES[S.mes - 1] + '.</div>') + '</div>';
      }
      if (pode('financial.cards.manage') || FATS.length) {
        var K = (S.cat && S.cat.cartoes) || [];
        h += '<div class="card"><h3>Cartões</h3><div class="mut">A compra no cartão é a despesa; pagar a fatura só liquida (não duplica a despesa).</div><div class="row" style="margin-top:8px">' + (pode('financial.cards.manage') ? '<button type="button" class="btn sec" data-a="novoCartao">+ Cartão</button>' : '') + '</div>' +
          (K.length ? '<div class="tw"><table><tbody>' + K.map(function (k) { return '<tr><td>' + esc(k.nome) + ' •' + esc(k.final) + '<div class="mut">' + esc(k.banco || '') + ' · fecha dia ' + k.fechamento + ' · vence dia ' + k.vencimento + (k.status !== 'active' ? ' · inativo' : '') + '</div></td><td>' + (pode('financial.cards.manage') ? bt('editCartao', k.id, 'Editar', 'sec') : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="vazio">Nenhum cartão.</div>');
        h += '<h3 style="margin-top:12px">Faturas</h3>' + (FATS.length ? '<div class="tw"><table><thead><tr><th>Fatura</th><th>Vencimento</th><th class="r">Compras</th><th class="r">Pago</th><th class="r">Em aberto</th><th>Situação</th><th></th></tr></thead><tbody>' + FATS.map(function (s, i) {
          return '<tr><td>' + esc(s.cartao) + '<div class="mut">' + pad(s.mes) + '/' + s.ano + ' · ' + (s.itens || []).length + ' compra(s)</div></td><td>' + dataBR(s.vencimento) + '</td><td class="r">' + brl(s.compras) + '</td><td class="r">' + brl(s.pago) + '</td><td class="r"><b>' + brl(s.aberto) + '</b></td><td><span class="tag">' + esc(ROT.fat[s.status] || s.status) + '</span></td><td><div class="acts">' + bt('verFatura', i, 'Itens', 'sec') + (tes() && pode('financial.expenses.pay') && num(s.aberto) > 0 && s.status !== 'paid' ? bt('pagarFatura', i, 'Pagar fatura') : '') + '</div></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="vazio">Nenhuma fatura.</div>') + '</div>';
      }
      corpo(h || '<div class="card vazio">Sem acesso a transferências ou cartões.</div>');
    });
  }
  function formCartao(k) {
    k = k || {};
    form(k.id ? 'Editar cartão' : 'Novo cartão', [
      { k: 'nome', l: 'Nome do cartão', v: k.nome, req: true },
      { k: 'banco', l: 'Banco / emissor', v: k.banco, req: true },
      { k: 'final', l: '4 últimos dígitos', v: k.final, req: true },
      { k: 'fechamento', l: 'Dia de fechamento', t: 'number', v: k.fechamento, req: true },
      { k: 'vencimento', l: 'Dia de vencimento', t: 'number', v: k.vencimento, req: true },
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
    var h = '<div class="row"><select data-c="concConta" aria-label="Conta">' + contas.map(function (c) { return '<option value="' + esc(c[0]) + '"' + (c[0] === S.concConta ? ' selected' : '') + '>' + esc(c[1]) + '</option>'; }).join('') + '</select>' +
      '<label class="btn sec" style="display:inline-block">Importar extrato (OFX/CSV)<input type="file" data-c="extrato" accept=".ofx,.csv,.txt" hidden></label>' +
      '<button type="button" class="btn sec" data-a="fecharConc">Registrar saldo do extrato</button></div>';
    if (!S.concConta) { corpo(h + '<div class="card vazio">Cadastre uma conta primeiro.</div>'); return Promise.resolve(); }
    return rpc('v39_fin_statement_view', C({ p_account: S.concConta, p_year: S.ano, p_month: S.mes })).then(function (x) {
      CONC = x || {}; var L = CONC.linhas || [], P = CONC.pendentes || [];
      var difs = CONC.sessao && CONC.sessao.saldoExtrato != null ? num(CONC.sessao.saldoExtrato) - num(CONC.saldoSistema) : null;
      h += '<div class="grid"><div class="kpi"><span class="mut">Saldo no sistema (fim do mês)</span><b>' + brl(CONC.saldoSistema) + '</b></div>' +
        '<div class="kpi"><span class="mut">Saldo do extrato</span><b>' + (CONC.sessao && CONC.sessao.saldoExtrato != null ? brl(CONC.sessao.saldoExtrato) : '—') + '</b></div>' +
        '<div class="kpi"><span class="mut">Diferença</span><b class="' + (difs ? 'neg' : 'pos') + '">' + (difs == null ? '—' : brl(difs)) + '</b></div></div>';
      h += '<div class="card"><h3>Linhas do extrato</h3>' + (L.length ? '<div class="tw"><table><thead><tr><th>Data</th><th>Descrição</th><th class="r">Valor</th><th>Situação / sugestão</th></tr></thead><tbody>' + L.map(function (l) {
        var s = l.status === 'matched' ? '<span class="tag ok">Conciliada</span>' : (l.status === 'ignored' ? '<span class="tag">Ignorada</span> ' + bt('ignLinha', l.id, 'Voltar', 'sec') :
          ((l.sugestoes || []).map(function (m) { return '<div>' + dataBR(m.data) + ' · ' + esc(m.descricao) + ' ' + bt('casar', l.id + '|' + m.id, 'Casar') + '</div>'; }).join('') || '<span class="mut">Sem lançamento igual (±3 dias). Lance a entrada/saída e volte aqui.</span>') + ' ' + bt('ignLinha', l.id, 'Ignorar', 'sec'));
        return '<tr><td>' + dataBR(l.data) + '</td><td>' + esc(l.descricao) + '</td><td class="r ' + (num(l.valor) < 0 ? 'neg' : 'pos') + '">' + brl(l.valor) + '</td><td>' + s + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="vazio">Nenhuma linha importada para este mês. Você também pode conciliar manualmente abaixo.</div>') + '</div>';
      h += '<div class="card"><h3>Lançamentos do mês nesta conta</h3>' + (P.length ? '<div class="tw"><table><tbody>' + P.map(function (m) {
        return '<tr><td>' + dataBR(m.data) + '</td><td>' + esc(m.descricao) + '</td><td class="r ' + (num(m.valor) < 0 ? 'neg' : 'pos') + '">' + brl(m.valor) + '</td><td>' + (m.status === 'reconciled' ? '<span class="tag ok">Conciliado</span> ' + bt('desconc', m.id, 'Desfazer', 'sec') : bt('conc', m.id, 'Conciliar')) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="vazio">Nenhum lançamento.</div>') + '</div>';
      corpo(h);
    });
  }
  function lerExtrato(nome, txt) {
    var linhas = [];
    if (/<STMTTRN>/i.test(txt)) {
      var blocos = txt.split(/<STMTTRN>/i).slice(1);
      blocos.forEach(function (b) {
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
        .then(function (x) { toast('Extrato: ' + x.novas + ' linha(s) nova(s), ' + x.repetidas + ' repetida(s).'); recarregar(); })
        .catch(function (e) { toast(traduz(e)); });
    };
    fr.onerror = function () { toast('Não foi possível ler o arquivo.'); };
    fr.readAsText(arq, /\.ofx$/i.test(arq.name) ? 'ISO-8859-1' : 'UTF-8');
  }

  /* ───────────── CAMPANHAS ───────────── */
  var CAMPS = [];
  function tCamp() {
    return rpc('v39_fin_campaigns', C({})).then(function (L) {
      CAMPS = L || [];
      var h = '<div class="row">' + (pode('financial.campaigns.manage') ? '<button type="button" class="btn" data-a="novaCamp">+ Campanha / voto</button>' : '') + (pode('financial.commitments.create') ? '<button type="button" class="btn sec" data-a="novoComp">+ Compromisso</button>' : '') + '</div>';
      h += '<div class="mut" style="margin-bottom:8px">Compromisso não é receita: só o valor recebido entra no Livro e no saldo.</div>';
      h += CAMPS.length ? CAMPS.map(function (g, gi) {
        var pc = num(g.meta) ? Math.min(100, Math.round(num(g.recebido) / num(g.meta) * 100)) : null;
        return '<div class="card"><h3>' + esc(g.nome) + ' <span class="tag">' + esc(ROT.campTipo[g.tipo] || g.tipo) + '</span> <span class="tag ' + (g.status === 'active' ? 'ok' : '') + '">' + esc(ROT.camp[g.status] || g.status) + '</span></h3>' +
          '<div class="mut">' + esc(g.objetivo) + (g.responsavel ? ' · Responsável: ' + esc(g.responsavel) : '') + ' · ' + dataBR(g.inicio) + (g.fim ? ' a ' + dataBR(g.fim) : '') + '</div>' +
          '<div class="row" style="margin-top:6px"><span>Acordado <b>' + brl(g.acordado) + '</b></span><span>Recebido <b class="pos">' + brl(g.recebido) + '</b></span>' + (g.meta ? '<span>Meta ' + brl(g.meta) + (pc != null ? ' (' + pc + '%)' : '') + '</span>' : '') +
          (pode('financial.campaigns.manage') && ['draft', 'planned', 'active'].indexOf(g.status) >= 0 ? bt('editCamp', gi, 'Editar', 'sec') : '') + '</div>' +
          ((g.compromissos || []).length ? '<div class="tw"><table><thead><tr><th>Pessoa</th><th class="r">Acordado</th><th class="r">Recebido</th><th class="r">Saldo</th><th>Próxima</th><th>Situação</th><th></th></tr></thead><tbody>' + g.compromissos.map(function (c, ci) {
            var a = [];
            if (tes() && pode('financial.commitments.receive') && ['active', 'due_soon', 'overdue'].indexOf(c.status) >= 0 && num(c.saldo) > 0) a.push(bt('receber', gi + '|' + ci, 'Receber'));
            if (pode('financial.commitments.communicate')) a.push(bt('zap', gi + '|' + ci, 'WhatsApp', 'sec'));
            if (pode('financial.commitments.cancel') && ['paid', 'cancelled'].indexOf(c.status) < 0) a.push(bt('cancComp', c.id, 'Cancelar', 'red'));
            if (tes() && pode('financial.commitments.reverse')) (c.recebimentos || []).forEach(function (r) { if (r.status === 'posted') a.push(bt('estRec', r.id, 'Estornar ' + dataBR(r.data), 'red')); });
            var tg = c.status === 'paid' ? 'ok' : (c.status === 'overdue' ? 'bad' : (c.status === 'due_soon' ? 'warn' : ''));
            return '<tr><td>' + esc(c.pessoa) + '<div class="mut">' + (c.parcelas > 1 ? c.parcelas + ' parcelas' : 'à vista') + '</div></td><td class="r">' + brl(c.acordado) + '</td><td class="r">' + brl(c.recebido) + '</td><td class="r">' + brl(c.saldo) + '</td><td>' + (c.proximo ? dataBR(c.proximo) + '<div class="mut">' + brl(c.proximoValor) + '</div>' : '—') + '</td><td><span class="tag ' + tg + '">' + esc(ROT.comp[c.status] || c.status) + '</span></td><td><div class="acts">' + a.join('') + '</div></td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="vazio">Nenhum compromisso.</div>') + '</div>';
      }).join('') : '<div class="card vazio">Nenhuma campanha.</div>';
      corpo(h);
    });
  }
  function formCamp(g) {
    g = g || {};
    form(g.id ? 'Editar campanha' : 'Nova campanha / voto', [
      { k: 'nome', l: 'Nome', v: g.nome, req: true },
      { k: 'tipo', l: 'Tipo', t: 'select', o: [['campaign', 'Campanha'], ['vow', 'Voto'], ['project', 'Projeto'], ['fundraising', 'Arrecadação'], ['other', 'Outra']], v: g.tipo || 'campaign', vazio: false },
      { k: 'objetivo', l: 'Objetivo / projeto', t: 'textarea', v: g.objetivo, req: true },
      { k: 'responsavelId', l: 'Responsável', t: 'pessoa', v: g.responsavelId || '', nome: g.responsavel || '', h: 'Se vazio, fica você.' },
      { k: 'inicio', l: 'Início', t: 'date', v: g.inicio ? String(g.inicio).slice(0, 10) : hoje() },
      { k: 'fim', l: 'Fim', t: 'date', v: g.fim ? String(g.fim).slice(0, 10) : '' },
      { k: 'meta', l: 'Meta (opcional)', t: 'money', v: g.meta },
      { k: 'status', l: 'Situação', t: 'select', o: [['active', 'Ativa'], ['planned', 'Planejada'], ['completed', 'Concluída'], ['cancelled', 'Cancelada']], v: g.status || 'active', vazio: false },
      { k: 'motivo', l: 'Motivo (se cancelar)', t: 'textarea' },
      { k: 'obs', l: 'Observação', t: 'textarea', v: g.obs }
    ], 'Salvar', function (v) {
      return rpc('v39_fin_campaign_save', C({ p_id: g.id || null, p: { nome: v.nome, tipo: v.tipo, objetivo: v.objetivo, responsavelId: v.responsavelId || g.responsavelId || null, inicio: v.inicio || null, fim: v.fim || null, meta: v.meta, status: v.status, motivo: v.motivo || null, obs: v.obs || null } })).then(function () { return 'Campanha salva.'; });
    });
  }
  function compromisso(ref) { var p = String(ref).split('|'), g = CAMPS[+p[0]]; return g ? { g: g, c: (g.compromissos || [])[+p[1]] } : null; }
  function textoZap(g, c) {
    var L = ['Olá, ' + String(c.pessoa || '').split(' ')[0] + '! Paz do Senhor.', '', 'Resumo do seu compromisso com *' + g.nome + '*', 'Projeto: ' + g.objetivo];
    if (g.responsavel) L.push('Responsável: ' + g.responsavel);
    L.push('Valor acordado: ' + brl(c.acordado) + ' (' + (c.parcelas > 1 ? c.parcelas + ' parcelas' : 'à vista') + ')');
    var forma = ((S.cat.formas || []).filter(function (f) { return f.id === c.formaId; })[0] || {}).nome; if (forma) L.push('Forma prevista: ' + forma);
    (c.datas || []).forEach(function (d) { L.push('• ' + d.n + 'ª: ' + dataBR(d.venc) + ' — ' + brl(d.valor) + (d.status === 'paid' ? ' ✔ paga' : (num(d.recebido) ? ' (recebido ' + brl(d.recebido) + ')' : ''))); });
    if (num(c.recebido)) { L.push(''); L.push('Recebido até agora: ' + brl(c.recebido)); L.push('Saldo: ' + brl(c.saldo)); }
    if (c.proximo) L.push('Próximo vencimento: ' + dataBR(c.proximo) + ' — ' + brl(c.proximoValor));
    L.push(''); L.push('Obrigado pela sua fidelidade!');
    return L.join('\n');
  }
  function zap(ref) {
    var x = compromisso(ref); if (!x) return;
    form('WhatsApp · ' + x.c.pessoa, [
      { k: 'tel', l: 'Telefone (com DDD)', v: x.c.telefone || '', req: true },
      { k: 'tipo', l: 'Tipo', t: 'select', o: [['confirmation', 'Confirmação do compromisso'], ['reminder', 'Lembrete'], ['overdue_notice', 'Aviso de atraso'], ['balance_update', 'Saldo atualizado'], ['receipt_confirmation', 'Confirmação de recebimento']], v: x.c.status === 'overdue' ? 'overdue_notice' : 'reminder', vazio: false },
      { k: 'texto', l: 'Mensagem', t: 'textarea', v: textoZap(x.g, x.c), req: true },
      { t: 'info', l: 'O WhatsApp abre com a mensagem pronta; você confere e envia. O envio fica registrado no histórico.' }
    ], 'Abrir WhatsApp', function (v) {
      var tel = String(v.tel).replace(/\D/g, ''); if (tel.length < 10) return Promise.reject(new Error('Telefone inválido.'));
      if (tel.length <= 11) tel = '55' + tel;
      var w = window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent(v.texto), '_blank');
      return rpc('v39_fin_commitment_message', C({ p_commitment: x.c.id, p_tipo: v.tipo, p_texto: v.texto })).then(function () { if (!w) window.location.href = 'https://wa.me/' + tel + '?text=' + encodeURIComponent(v.texto); return 'Mensagem registrada.'; });
    });
  }
  function receber(ref) {
    var x = compromisso(ref); if (!x) return;
    form('Receber · ' + x.c.pessoa, [
      { t: 'info', l: 'Saldo do compromisso: ' + brl(x.c.saldo) + '. O valor é aplicado nas parcelas mais antigas.' },
      { k: 'data', l: 'Data', t: 'date', v: hoje(), req: true },
      { k: 'valor', l: 'Valor recebido', t: 'money', v: x.c.proximoValor || x.c.saldo, req: true },
      { k: 'contaId', l: 'Conta', t: 'select', o: opContas(true), req: true },
      { k: 'formaId', l: 'Forma', t: 'select', o: opFormas(true), v: x.c.formaId || '', req: true },
      { k: 'arq', l: 'Comprovante (obrigatório em PIX/transferência)', t: 'file' },
      { k: 'obs', l: 'Observação', t: 'textarea' }
    ], 'Registrar recebimento', function (v) {
      var tp = formaTipo(v.formaId);
      if ((tp === 'pix' || tp === 'bank_transfer') && !v.arq) return Promise.reject(new Error('FIN_EVIDENCE_REQUIRED'));
      return enviarComprovante(v.arq).then(function (ev) {
        return rpc('v39_fin_commitment_receive', C({ p: { compromissoId: x.c.id, data: v.data, valor: v.valor, contaId: v.contaId, formaId: v.formaId, comprovanteId: ev, obs: v.obs || null, chave: uuid() } }));
      }).then(function () { return 'Recebimento lançado no Livro.'; });
    });
  }
  function novoComp() {
    var camps = opCampanhas(); if (!camps.length) return toast('Crie uma campanha primeiro.');
    form('Novo compromisso', [
      { k: 'campanhaId', l: 'Campanha / voto', t: 'select', o: camps, req: true },
      { k: 'pessoaId', l: 'Pessoa', t: 'pessoa', req: true },
      { k: 'total', l: 'Valor total acordado', t: 'money', req: true },
      { k: 'parcelas', l: 'Parcelas (1 = à vista)', t: 'number', v: 1, req: true },
      { k: 'primeiroVencimento', l: 'Primeiro vencimento', t: 'date', v: hoje(), req: true, h: 'As demais vencem no mesmo dia dos meses seguintes.' },
      { k: 'formaId', l: 'Forma prevista', t: 'select', o: opFormas(true), vazio: '— não definida —' },
      { k: 'obs', l: 'Observação', t: 'textarea' }
    ], 'Salvar', function (v) {
      return rpc('v39_fin_commitment_create', C({ p: { campanhaId: v.campanhaId, pessoaId: v.pessoaId, total: v.total, parcelas: Math.max(1, Math.min(60, parseInt(v.parcelas, 10) || 1)), primeiroVencimento: v.primeiroVencimento, formaId: v.formaId || null, obs: v.obs || null } })).then(function () { return 'Compromisso registrado (não entra no saldo).'; });
    });
  }

  /* ───────────── CADASTROS ───────────── */
  function tCad() {
    var C2 = S.cat || {}, h = '';
    if (S.ctx.master || !S.ctx.inicio) {
      h += '<div class="card"><h3>Início do Financeiro</h3><div>' + (S.ctx.inicio ? 'Começou em <b>' + dataBR(S.ctx.inicio) + '</b>.' : '<b>Não definido.</b>') + '</div>' +
        '<div class="mut">Primeiro dia do Livro. GC e cultos com valores a partir desta data aparecem em "A conferir" (inclusive os já registrados antes deste módulo). Só muda enquanto não houver lançamentos.</div>' +
        (S.ctx.master ? '<div class="row" style="margin-top:8px"><button type="button" class="btn sec" data-a="inicio">Definir data</button></div>' : '') + '</div>';
    }
    if (pode('financial.accounts.manage')) {
      h += '<div class="card"><h3>Contas e caixas</h3><div class="row"><button type="button" class="btn sec mini" data-a="novaConta">+ Conta</button></div><div class="tw"><table><tbody>' +
        ((C2.contas || []).map(function (a) {
          return '<tr><td>' + esc(a.nome) + '<div class="mut">' + esc(ROT.conta[a.tipo] || a.tipo) + (a.banco ? ' · ' + esc(a.banco) : '') + (a.status !== 'active' ? ' · inativa' : '') + '</div></td><td>' + (a.saldoInicial ? 'Saldo inicial ' + brl(a.saldoInicial.valor) + ' em ' + dataBR(a.saldoInicial.data) : '<span class="tag warn">sem saldo inicial</span>') + '</td><td><div class="acts">' + bt('editConta', a.id, 'Editar', 'sec') + (!a.saldoInicial && tes() ? bt('saldoIni', a.id, 'Saldo inicial') : '') + '</div></td></tr>';
        }).join('') || '<tr><td class="vazio">Nenhuma conta.</td></tr>') + '</tbody></table></div></div>';
    }
    if (pode('financial.categories.manage')) {
      h += '<div class="card"><h3>Categorias (plano de contas)</h3><div class="mut">O código contábil é o do contador; preencha quando receber a lista.</div><div class="row" style="margin-top:6px"><button type="button" class="btn sec mini" data-a="novaCat">+ Categoria</button></div><div class="tw"><table><thead><tr><th>Código</th><th>Nome</th><th>Natureza</th><th>Cód. contábil</th><th></th></tr></thead><tbody>' +
        ((C2.categorias || []).map(function (c) {
          return '<tr><td>' + esc(c.codigo) + '</td><td>' + esc(c.nome) + (c.ativa ? '' : ' <span class="tag">inativa</span>') + (c.sistema ? ' <span class="tag">padrão</span>' : '') + '</td><td>' + esc(ROT.nat[c.natureza] || c.natureza) + '</td><td>' + esc(c.contabil || '—') + '</td><td>' + bt('editCat', c.id, 'Editar', 'sec') + '</td></tr>';
        }).join('') || '<tr><td colspan="5" class="vazio">Nenhuma categoria.</td></tr>') + '</tbody></table></div></div>';
    }
    if (pode('financial.expenses.create') || pode('financial.bills.manage')) {
      h += '<div class="card"><h3>Fornecedores / beneficiários</h3><div class="row"><button type="button" class="btn sec mini" data-a="novoFornec">+ Fornecedor</button></div><div class="tw"><table><tbody>' +
        ((C2.fornecedores || []).map(function (f) { return '<tr><td>' + esc(f.nome) + '<div class="mut">' + esc(f.documento || '') + (f.contato ? ' · ' + esc(f.contato) : '') + (f.status === 'inactive' ? ' · inativo' : '') + '</div></td><td>' + bt('editFornec', f.id, 'Editar', 'sec') + '</td></tr>'; }).join('') || '<tr><td class="vazio">Nenhum fornecedor.</td></tr>') + '</tbody></table></div></div>';
    }
    corpo(h || '<div class="card vazio">Sem cadastros disponíveis para o seu perfil.</div>');
    return Promise.resolve();
  }
  function formConta(a) {
    a = a || {};
    form(a.id ? 'Editar conta' : 'Nova conta', [
      { k: 'nome', l: 'Nome', v: a.nome, req: true },
      { k: 'tipo', l: 'Tipo', t: 'select', o: Object.keys(ROT.conta).map(function (k) { return [k, ROT.conta[k]]; }), v: a.tipo || 'checking', vazio: false },
      { k: 'banco', l: 'Banco', v: a.banco }, { k: 'agencia', l: 'Agência', v: a.agencia }, { k: 'numero', l: 'Número da conta', v: a.numero },
      { k: 'pix', l: 'Chave PIX', v: a.pix },
      { k: 'status', l: 'Situação', t: 'select', o: [['active', 'Ativa'], ['inactive', 'Inativa']], v: a.status || 'active', vazio: false },
      { k: 'obs', l: 'Observação', t: 'textarea', v: a.obs }
    ], 'Salvar', function (v) { return rpc('v39_fin_save_account', C({ p_id: a.id || null, p_payload: Object.assign({ abertaEm: a.abertaEm || null }, v) })).then(function () { return 'Conta salva.'; }); });
  }
  function formCat(c) {
    c = c || {}; var fixa = !!c.sistema;
    form(c.id ? 'Editar categoria' : 'Nova categoria', (fixa ? [{ t: 'info', l: 'Categoria padrão: só o código contábil pode mudar.' }] : [
      { k: 'codigo', l: 'Código interno', v: c.codigo, req: true },
      { k: 'nome', l: 'Nome', v: c.nome, req: true },
      { k: 'natureza', l: 'Natureza', t: 'select', o: [['income', 'Entrada'], ['expense', 'Saída']], v: c.natureza || 'expense', vazio: false },
      { k: 'descricao', l: 'Descrição', v: c.descricao },
      { k: 'ativa', l: 'Ativa', t: 'check', v: c.id ? c.ativa : true }
    ]).concat([{ k: 'contabil', l: 'Código contábil (do contador)', v: c.contabil }]), 'Salvar', function (v) {
      var p = fixa ? { codigo: c.codigo, nome: c.nome, natureza: c.natureza, contabil: v.contabil } : v;
      return rpc('v39_fin_save_category', C({ p_id: c.id || null, p_payload: p })).then(function () { return 'Categoria salva.'; });
    });
  }
  function formFornec(f) {
    f = f || {};
    form(f.id ? 'Editar fornecedor' : 'Novo fornecedor', [
      { k: 'nome', l: 'Nome / razão social', v: f.nome, req: true },
      { k: 'documento', l: 'CPF/CNPJ (opcional)', v: f.documento },
      { k: 'contato', l: 'Contato', v: f.contato },
      { k: 'status', l: 'Situação', t: 'select', o: [['active', 'Ativo'], ['inactive', 'Inativo']], v: f.status || 'active', vazio: false },
      { k: 'obs', l: 'Observação', t: 'textarea', v: f.obs }
    ], 'Salvar', function (v) { return rpc('v39_fin_payee_save', C({ p_id: f.id || null, p: v })).then(function () { return 'Fornecedor salvo.'; }); });
  }

  /* ───────────── RELATÓRIOS ───────────── */
  function tRel() {
    return rpc('v39_fin_report', C({ p_year: S.ano, p_month: S.relMes ? S.mes : null })).then(function (x) {
      var p = x.periodo || {}, r = x.resultado || {}, f = x.fluxo || {};
      var tit = (S.relMes ? MESES[S.mes - 1] + '/' : 'Ano ') + S.ano;
      var h = '<div class="row noprint"><select data-c="relMes"><option value="1"' + (S.relMes ? ' selected' : '') + '>Mês selecionado</option><option value="0"' + (!S.relMes ? ' selected' : '') + '>Ano inteiro</option></select>' +
        '<button type="button" class="btn sec" data-a="imprimir">Imprimir / PDF</button></div>';
      h += '<div class="card"><h3>' + esc(x.entidade || 'Igreja') + ' — Relatório financeiro ' + esc(tit) + '</h3><div class="mut">' + (x.documento ? 'CNPJ ' + esc(x.documento) + ' · ' : '') + 'Período ' + dataBR(p.inicio) + ' a ' + dataBR(p.fim) + ' · ' + (p.definitivo ? 'meses fechados (definitivo)' : 'PRÉVIA: há mês aberto no período') + ' · gerado em ' + new Date(p.geradoEm || Date.now()).toLocaleString('pt-BR') + '</div></div>';
      h += '<div class="grid"><div class="kpi"><span class="mut">Receitas</span><b class="pos">' + brl(r.receitas) + '</b></div><div class="kpi"><span class="mut">Despesas</span><b class="neg">' + brl(r.despesas) + '</b></div><div class="kpi"><span class="mut">Superávit / déficit</span><b class="' + (num(r.superavit) < 0 ? 'neg' : 'pos') + '">' + brl(r.superavit) + '</b></div></div>';
      var cats = x.categorias || [];
      h += '<div class="card"><h3>Demonstração do resultado por categoria</h3><div class="tw"><table><thead><tr><th>Cód. contábil</th><th>Categoria</th><th class="r">Lançamentos</th><th class="r">Valor</th></tr></thead><tbody>' +
        (cats.length ? cats.map(function (c) { return '<tr><td>' + esc(c.contabil || '—') + '</td><td>' + esc(c.nome) + '</td><td class="r">' + c.lancamentos + '</td><td class="r ' + (num(c.valor) < 0 ? 'neg' : 'pos') + '">' + brl(c.valor) + '</td></tr>'; }).join('') : '<tr><td colspan="4" class="vazio">Sem lançamentos.</td></tr>') + '</tbody></table></div></div>';
      h += '<div class="card"><h3>Fluxo de caixa (método direto)</h3><div class="tw"><table><tbody><tr><td>Caixa inicial (todas as contas)</td><td class="r">' + brl(f.caixaInicial) + '</td></tr>' +
        (f.recebimentos || []).map(function (y) { return '<tr><td>+ ' + esc(y.nome) + '</td><td class="r pos">' + brl(y.valor) + '</td></tr>'; }).join('') +
        (f.pagamentos || []).map(function (y) { return '<tr><td>− ' + esc(y.nome) + '</td><td class="r neg">' + brl(y.valor) + '</td></tr>'; }).join('') +
        '<tr><td>Pagamento de faturas de cartão</td><td class="r">' + brl(f.liquidacaoCartao) + '</td></tr><tr><td>Saldos iniciais lançados no período</td><td class="r">' + brl(f.saldosIniciais) + '</td></tr><tr><td>Transferências (líquido)</td><td class="r">' + brl(f.transferencias) + '</td></tr>' + (num(f.ajustes) ? '<tr><td>Ajustes</td><td class="r">' + brl(f.ajustes) + '</td></tr>' : '') +
        '<tr><td><b>Caixa final</b></td><td class="r"><b>' + brl(f.caixaFinal) + '</b></td></tr></tbody></table></div></div>';
      h += '<div class="card"><h3>Contas: saldo e conciliação</h3><div class="tw"><table><thead><tr><th>Conta</th><th class="r">Inicial</th><th class="r">Entradas</th><th class="r">Saídas</th><th class="r">Final</th><th class="r">Extrato</th><th class="r">Não conciliado</th></tr></thead><tbody>' +
        (x.contas || []).map(function (a) { return '<tr><td>' + esc(a.nome) + '</td><td class="r">' + brl(a.inicial) + '</td><td class="r">' + brl(a.entradas) + '</td><td class="r">' + brl(-num(a.saidas)) + '</td><td class="r"><b>' + brl(a.final) + '</b></td><td class="r">' + (a.saldoExtrato != null ? brl(a.saldoExtrato) : '—') + '</td><td class="r">' + (a.naoConciliados || 0) + ' (' + brl(a.valorNaoConciliado) + ')</td></tr>'; }).join('') + '</tbody></table></div></div>';
      if (S.relMes) {
        (x.contas || []).forEach(function (a) {
          if (!(a.movimentos || []).length) return;
          h += '<div class="card"><h3>Razão · ' + esc(a.nome) + '</h3><div class="tw"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="r">Valor</th><th>Comp.</th></tr></thead><tbody>' +
            a.movimentos.map(function (m) { return '<tr><td>' + dataBR(m.data) + '</td><td>' + esc(m.descricao) + (m.pessoa ? '<div class="mut">' + esc(m.pessoa) + '</div>' : '') + '</td><td>' + esc(m.categoria) + (m.contabil ? ' (' + esc(m.contabil) + ')' : '') + '</td><td class="r ' + (num(m.valor) < 0 ? 'neg' : 'pos') + '">' + brl(m.valor) + '</td><td>' + (m.comprovante ? '✔' : '—') + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
        });
      } else if ((x.mensal || []).length) {
        h += '<div class="card"><h3>Mês a mês</h3><div class="tw"><table><thead><tr><th>Mês</th><th class="r">Receitas</th><th class="r">Despesas</th><th class="r">Resultado</th><th></th></tr></thead><tbody>' +
          x.mensal.map(function (m) { return '<tr><td>' + MESES[m.mes - 1] + '</td><td class="r">' + brl(m.receitas) + '</td><td class="r">' + brl(m.despesas) + '</td><td class="r ' + (num(m.resultado) < 0 ? 'neg' : 'pos') + '">' + brl(m.resultado) + '</td><td>' + (m.fechado ? '🔒' : '') + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
      }
      var cp = x.contasPagar || [], cr = x.compromissos || [];
      h += '<div class="card"><h3>Contas a pagar (' + cp.length + ')</h3>' + (cp.length ? '<div class="tw"><table><tbody>' + cp.map(function (e) { return '<tr><td>' + esc(e.descricao) + '<div class="mut">' + esc(e.fornecedor || '') + '</div></td><td>' + dataBR(e.vencimento) + '</td><td class="r">' + brl(e.saldo) + '</td><td>' + esc(ROT.desp[e.status] || e.status) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="vazio">Nada a pagar.</div>') + '</div>';
      h += '<div class="card"><h3>Compromissos a receber (' + cr.length + ')</h3>' + (cr.length ? '<div class="tw"><table><tbody>' + cr.map(function (c) { return '<tr><td>' + esc(c.pessoa) + '<div class="mut">' + esc(c.campanha) + '</div></td><td class="r">' + brl(c.saldo) + '</td><td>' + (c.proximo ? dataBR(c.proximo) : '—') + '</td><td>' + esc(ROT.comp[c.status] || c.status) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="vazio">Nada a receber.</div>') + '<div class="mut">Compromissos não são receita até o recebimento.</div></div>';
      var cv = x.comprovantes || [], sem = cv.filter(function (c) { return /sem comprovante/.test(c.arquivo); }).length;
      h += '<div class="card"><h3>Relação de comprovantes (' + cv.length + (sem ? ', ' + sem + ' sem comprovante' : '') + ')</h3>' + (cv.length ? '<div class="tw"><table><tbody>' + cv.map(function (c) { return '<tr><td>' + dataBR(c.data) + '</td><td>' + esc(c.descricao) + '<div class="mut">' + esc(c.conta) + '</div></td><td class="r">' + brl(c.valor) + '</td><td>' + esc(c.arquivo) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="vazio">Sem movimentos.</div>') + '</div>';
      corpo(h);
    });
  }

  /* ───────────── eventos ───────────── */
  function achar(lista, id) { return (lista || []).filter(function (x) { return x.id === id; })[0] || null; }
  function acao(p) { return p.then(function (m) { if (m) toast(m); recarregar(); }).catch(function (e) { console.warn('[2Gather][fin]', e); toast(traduz(e)); }); }
  function clique(ev) {
    var b = ev.target.closest && ev.target.closest('[data-a]'); if (!b) return;
    var a = b.getAttribute('data-a'), v = b.getAttribute('data-v');
    switch (a) {
      case 'fechar': return fechar();
      case 'aba': S.aba = v; pintarBase(); return recarregar();
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
          return enviarComprovante(x.arq).then(function (ev) { return rpc('v39_fin_transfer', C({ p: { origemId: x.origemId, destinoId: x.destinoId, valor: x.valor, data: x.data, descricao: x.descricao, comprovanteId: ev, chave: uuid() } })); }).then(function () { return 'Transferência lançada.'; });
        });
      case 'estTransf': return motivo('Estornar transferência', function (m) { return rpc('v39_fin_transfer_reverse', C({ p_id: v, p_reason: m })).then(function () { return 'Transferência estornada.'; }); }, 'Estornar');
      case 'novoCartao': return formCartao(null);
      case 'editCartao': return formCartao(achar(S.cat.cartoes, v));
      case 'verFatura': {
        var s = FATS[+v]; if (!s) return;
        return form('Fatura ' + s.cartao + ' ' + pad(s.mes) + '/' + s.ano, [{ t: 'info', l: (s.itens || []).map(function (i) { return dataBR(i.data) + ' · ' + esc(i.descricao) + ' · ' + esc(i.parcela) + ' · ' + brl(i.valor); }).join('<br>') || 'Sem compras.' }], 'OK', function () { return false; });
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
          return enviarComprovante(x.arq).then(function (ev) { return rpc('v39_fin_card_statement_pay', C({ p_statement_id: f.id, p: { data: x.data, valor: x.valor, contaId: x.contaId, formaId: x.formaId, comprovanteId: ev, obs: x.obs || null, chave: uuid() } })); }).then(function () { return 'Fatura paga.'; });
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
      case 'novoComp': return novoComp();
      case 'receber': return receber(v);
      case 'zap': return zap(v);
      case 'cancComp': return motivo('Cancelar compromisso', function (m) { return rpc('v39_fin_commitment_cancel', C({ p_id: v, p_reason: m })).then(function () { return 'Compromisso cancelado.'; }); }, 'Cancelar compromisso');
      case 'estRec': return motivo('Estornar recebimento', function (m) { return rpc('v39_fin_receipt_reverse', C({ p_receipt: v, p_reason: m })).then(function () { return 'Recebimento estornado.'; }); }, 'Estornar');
      case 'inicio':
        return form('Início do Financeiro', [{ k: 'data', l: 'Primeiro dia do Livro', t: 'date', v: (S.ctx && S.ctx.inicio) || (new Date().getFullYear() + '-01-01'), req: true },
          { t: 'info', l: 'Dica: use o 1º dia do mês. Depois cadastre o saldo inicial de cada conta nessa data (aba Cadastros). Encontros de GC e cultos com valores desde essa data aparecem em "A conferir".' }], 'Salvar',
          function (x) { return rpc('v39_fin_set_start', C({ p_date: x.data })).then(function () { return 'Início definido.'; }); });
      case 'novaConta': return formConta(null);
      case 'editConta': return formConta(achar(S.cat.contas, v));
      case 'saldoIni': {
        var ac = achar(S.cat.contas, v);
        return form('Saldo inicial · ' + (ac ? ac.nome : ''), [
          { t: 'info', l: 'Saldo da conta no dia ' + dataBR(S.ctx.inicio) + ' (início do Financeiro). Use 0 se estava zerada. Só pode ser lançado uma vez.' },
          { k: 'valor', l: 'Saldo', t: 'money', req: true }, { k: 'arq', l: 'Extrato/comprovante', t: 'file' }, { k: 'obs', l: 'Observação', t: 'textarea' }
        ], 'Lançar saldo inicial', function (x) {
          return enviarComprovante(x.arq).then(function (ev) { return rpc('v39_fin_opening_balance', C({ p: { contaId: v, valor: x.valor, comprovanteId: ev, obs: x.obs || null } })); }).then(function () { return 'Saldo inicial lançado.'; });
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
    if (c === 'mes') { S.mes = +el.value; return recarregar(); }
    if (c === 'ano') { S.ano = +el.value; return recarregar(); }
    if (c === 'despFiltro') { S.despFiltro = el.value; return recarregar(); }
    if (c === 'concConta') { S.concConta = el.value; return recarregar(); }
    if (c === 'relMes') { S.relMes = el.value === '1'; return recarregar(); }
    if (c === 'extrato') { var f = el.files && el.files[0]; el.value = ''; return importarExtrato(f); }
  }

  /* ───────────── entrada no app: botão e aba antiga ───────────── */
  var fabTentado = false;
  function botao() {
    if (!v39() || !igrejaId()) return;
    if ($('g2f-fab') || fabTentado) return;
    fabTentado = true;
    carregarCtx().then(function () {
      if (!algum()) return;
      css();
      var b = document.createElement('button'); b.type = 'button'; b.id = 'g2f-fab'; b.textContent = 'R$ Financeiro';
      b.setAttribute('aria-label', 'Abrir o Financeiro');
      b.addEventListener('click', function () { abrir(); });
      document.body.appendChild(b);
    }).catch(function (e) { fabTentado = false; console.warn('[2Gather][fin] ' + traduz(e)); });
  }
  function abaAntiga() {
    var main = $('main'); if (!main || !v39()) return;
    if (!/fin/i.test(String(cfg().aba || ''))) return;
    if ($('g2f-aviso')) return;
    if (!S.ctx || !algum()) return;
    css();
    main.insertAdjacentHTML('afterbegin', '<div id="g2f-aviso" style="background:#0f3d5e;color:#fff;border-radius:12px;padding:12px;margin:10px 0;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div style="flex:1;min-width:180px"><b>Financeiro novo (Livro único)</b><div style="font-size:12px;opacity:.85">Entradas, despesas, conferência de GC e cultos, conciliação, campanhas e relatórios.</div></div><button type="button" style="border:0;border-radius:8px;padding:8px 12px;font-weight:600;cursor:pointer" data-g2f="abrir">Abrir</button></div>');
    $('g2f-aviso').querySelector('[data-g2f="abrir"]').addEventListener('click', function () { abrir(); });
  }
  // sessão trocou (logout/login): limpa
  var ultimoUsuario = '';
  setInterval(function () {
    var u = String(eu().id || eu().usuario || eu().email || '') + '|' + (igrejaId() || '');
    if (u !== ultimoUsuario) {
      ultimoUsuario = u; S.ctx = null; S.cat = null; fabTentado = false;
      var f = $('g2f-fab'); if (f) f.remove(); fechar();
    }
    if (cfg().usuario) botao();
    abaAntiga();
  }, 1500);

  window.G2_FIN.abrir = abrir;
  window.G2_FIN.fechar = fechar;
  window.G2_FIN._lerExtrato = lerExtrato;
  window.G2_FIN._lerValor = lerValor;
})();
