/* 2Gather v39 · Avisos pessoais (sino) e "Minhas escalas" · ESCALA-1 (KIDS_4)
   Carregar DEPOIS do app.js, do app_v39_ministerios.js e do app_v39_kids.js. Requer KIDS_4_escala_aplicar.sql.
   - Sino no topo com o número de avisos não lidos (app.notifications da própria conta); a lista marca como lido.
   - "Minhas escalas" no Início: Confirmo / Não posso (motivo) / Passar para outro voluntário da equipe do Kids.
   - Troca de escala: quem recebe aceita ou recusa (motivo); depois o líder autoriza ou não (motivo).
   - Sem o SQL no servidor, nada aparece (o resto do app segue igual).
   O WhatsApp continua pelo wa.me do líder (na sala do culto, módulo Kids); depois vira mensagem automática pela API. */
(function () {
  'use strict';
  var VERSAO = 'ESCALA-1';
  if (window.G2_ESCALA) return;
  console.info('[2Gather] escala ' + VERSAO);

  function U() { return (window.G2_MIN && window.G2_MIN._u) || null; }
  function G() { return window.__gc || {}; }
  function cfg() { var g = G(); try { return (g.cfg && g.cfg()) || {}; } catch (e) { return {}; } }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pill(txt, cor) { return '<span class="pill" style="background:' + cor + '1f;color:' + cor + '">' + esc(txt) + '</span>'; }
  function v39() { return cfg().token === 'supabase-v39'; }
  function rpc(n, a) { return U().rpc(n, a); }
  function toast(t, e) { U().toast(t, e); }
  function modal(h) { U().modal(h); }
  function fechar() { U().fecharModal(); }
  function traduz(e) { return (window.G2_KIDS && G2_KIDS._t && G2_KIDS._t.traduz) ? G2_KIDS._t.traduz(e) : U().traduz(e); }
  function semFuncao(e) { return /PGRST202|find the function/i.test(String((e && (e.message || e.code)) || '')); }
  function diaHora(iso) {
    if (!iso) return ''; var d = new Date(iso); if (isNaN(d)) return '';
    return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function quando(iso) {
    var d = new Date(iso); if (isNaN(d)) return ''; var m = Math.round((Date.now() - d.getTime()) / 60000);
    return m < 1 ? 'agora' : m < 60 ? 'há ' + m + ' min' : m < 1440 ? 'há ' + Math.round(m / 60) + ' h' : diaHora(iso);
  }

  var E = { n: 0, itens: [], esc: null, em: 0, carregando: false, desligado: false, inicio: false };

  function carregar() {
    if (!v39() || !U() || E.desligado || E.carregando || !U().igrejaId || !(window.G2_V39 || {}).client) return Promise.resolve();
    E.carregando = true;
    return Promise.all([
      rpc('v39_my_notifications', { p_limite: 30 }).then(function (r) { E.n = (r && r.naoLidas) || 0; E.itens = (r && r.itens) || []; }),
      rpc('v39_kids_my_schedule', {}).then(function (r) { E.esc = r || null; })
    ]).catch(function (e) { if (semFuncao(e)) E.desligado = true; else console.warn('[2Gather][escala]', e); })
      .then(function () { E.carregando = false; E.em = Date.now(); pintarSino(); pintarCard(); });
  }

  /* ───────── sino ───────── */
  var SINO = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';
  function pintarSino() {
    var hd = document.querySelector('#s-app header'); if (!hd) return;
    var s = $('g2-sino');
    if (E.desligado || !v39()) { if (s) s.remove(); return; }
    if (!s) {
      s = document.createElement('span'); s.id = 'g2-sino'; s.setAttribute('data-e', 'sino'); s.setAttribute('role', 'button'); s.title = 'Avisos';
      s.style.cssText = 'position:relative;display:inline-flex;align-items:center;cursor:pointer;padding:4px;margin-right:2px;align-self:center';
      var pap = $('h-papel'); if (pap) hd.insertBefore(s, pap); else hd.appendChild(s);
    }
    s.innerHTML = SINO + (E.n ? '<span style="position:absolute;top:-2px;right:-4px;min-width:17px;height:17px;padding:0 4px;border-radius:99px;background:#c0392b;color:#fff;font-size:10.5px;font-weight:800;display:flex;align-items:center;justify-content:center">' + (E.n > 99 ? '99+' : E.n) + '</span>' : '');
  }
  function listaAvisos() {
    var l = E.itens || [];
    modal('<h2>Avisos</h2>' + (E.n ? '<button class="btn gh sm" data-e="lerTodos">Marcar todos como lidos</button>' : '') +
      '<div class="card" style="padding:2px 14px;margin-top:8px">' + (l.length ? l.map(function (n) {
        var nova = n.status === 'unread';
        return '<div class="row cl" data-e="abrirAviso" data-v="' + esc(n.id) + '" style="cursor:pointer;padding:9px 0;align-items:flex-start;border-bottom:1px solid var(--ln,#eceef1)">' +
          '<div class="info"><div class="nm">' + (nova ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#c0392b;margin-right:6px"></span>' : '') + esc(n.titulo) + '</div>' +
          '<div class="sb" style="white-space:normal">' + esc(n.texto || '') + '</div><div class="sb">' + esc(quando(n.em)) + '</div></div></div>';
      }).join('') : '<div class="empty">Nenhum aviso.</div>') + '</div><div class="gap"></div><button class="btn gh" data-a="fechar">Fechar</button>');
  }
  function lerAviso(id) {
    return rpc('v39_notification_read', { p_id: id || null }).then(function () {
      (E.itens || []).forEach(function (n) { if (!id || n.id === id) n.status = 'read'; });
      E.n = (E.itens || []).filter(function (n) { return n.status === 'unread'; }).length; pintarSino();
    }).catch(function (e) { toast(traduz(e), true); });
  }
  function abrirAviso(id) {
    var n = (E.itens || []).filter(function (x) { return x.id === id; })[0]; if (!n) return;
    (n.status === 'unread' ? lerAviso(id) : Promise.resolve()).then(function () {
      if (/^kids_/.test(n.tipo || '')) { fechar(); irInicio(); } else listaAvisos();
    });
  }
  function irInicio() {
    var g = G(), c = cfg();
    if (E.inicio) { var el = $('g2esc'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (g.irAba) { try { g.irAba(c.modo === 'ger' ? 'bi' : 'painel'); } catch (e) { /* segue */ } }
  }

  /* ───────── Minhas escalas (Início) ───────── */
  var RESP = { pending: ['aguardando sua resposta', '#c99a1a'], confirmed: ['confirmado', '#1f7a4d'], declined: ['não posso', '#c0392b'] };
  function rotulo(x) { return esc(x.sala) + ' · ' + esc(x.culto || x.evento) + ' · ' + esc(diaHora(x.inicio)); }
  function card() {
    var r = E.esc; if (!r) return '';
    var es = r.escalas || [], pm = r.paraMim || [], au = r.autorizar || [];
    if (!es.length && !pm.length && !au.length) return '';
    var h = '<div class="card" style="margin:10px 0 12px;padding:10px 14px"><div class="nm" style="font-size:15px;margin-bottom:4px">Minhas escalas · Kids</div>';
    au.forEach(function (t) {
      h += '<div style="padding:8px 0;border-top:1px solid var(--ln,#eceef1)">' + pill('troca para autorizar', '#6c4bd1') +
        '<div style="margin-top:4px"><b>' + esc(t.de) + '</b> → <b>' + esc(t.para) + '</b></div><div class="sb">' + rotulo(t) + (t.motivo ? ' · motivo: ' + esc(t.motivo) : '') + '</div>' +
        '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"><button class="btn pr sm" data-e="aprovar" data-v="' + esc(t.id) + '">Autorizar</button>' +
        '<button class="btn gh sm" data-e="naoAprovar" data-v="' + esc(t.id) + '">Não autorizar</button></div></div>';
    });
    pm.forEach(function (t) {
      h += '<div style="padding:8px 0;border-top:1px solid var(--ln,#eceef1)">' + pill('pedido de troca para você', '#2c6fbb') +
        '<div style="margin-top:4px"><b>' + esc(t.de) + '</b> quer passar a escala para você</div><div class="sb">' + rotulo(t) + (t.motivo ? ' · motivo: ' + esc(t.motivo) : '') + '</div>' +
        '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"><button class="btn pr sm" data-e="aceitar" data-v="' + esc(t.id) + '">Aceitar</button>' +
        '<button class="btn gh sm" data-e="recusarTroca" data-v="' + esc(t.id) + '">Não posso</button></div>' +
        '<div class="sb" style="margin-top:4px">Depois de aceitar, o líder do Kids ainda precisa autorizar.</div></div>';
    });
    es.forEach(function (x) {
      var st = RESP[x.resposta] || RESP.pending, tr = x.transferencia;
      h += '<div style="padding:8px 0;border-top:1px solid var(--ln,#eceef1)"><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><b>' + esc(x.sala) + '</b>' +
        '<span class="sb">(' + esc(x.funcao) + ')</span>' + pill(st[0], st[1]) + '</div><div class="sb">' + esc(x.culto || x.evento) + ' · ' + esc(diaHora(x.inicio)) + '</div>' +
        (x.resposta === 'declined' && x.motivoRecusa ? '<div class="sb">Seu motivo: ' + esc(x.motivoRecusa) + '</div>' : '');
      if (tr) {
        h += '<div class="sb" style="margin-top:4px">Troca pedida para <b>' + esc(tr.para) + '</b> · ' + (tr.status === 'pending_leader' ? 'aceita, aguardando o líder' : 'aguardando a resposta') +
          '. Até a autorização, a escala continua com você.</div><button class="btn gh sm" style="margin-top:6px" data-e="cancelarTroca" data-v="' + esc(tr.id) + '">Cancelar pedido de troca</button>';
      } else {
        h += '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">' +
          (x.resposta !== 'confirmed' ? '<button class="btn pr sm" data-e="confirmar" data-v="' + esc(x.staffId) + '">Confirmo</button>' : '') +
          (x.resposta !== 'declined' ? '<button class="btn gh sm" data-e="naoPosso" data-v="' + esc(x.staffId) + '">Não posso</button>' : '') +
          '<button class="btn gh sm" data-e="transferir" data-v="' + esc(x.staffId) + '">Passar para outro</button></div>';
      }
      h += '</div>';
    });
    return h + '</div>';
  }
  function pintarCard() {
    if (!E.inicio) return;
    var m = $('main'); if (!m) return;
    var el = $('g2esc'), html = E.desligado ? '' : card();
    if (!el) { el = document.createElement('div'); el.id = 'g2esc'; m.insertBefore(el, m.firstChild); }
    el.innerHTML = html;
  }

  /* ───────── ações ───────── */
  function depois(msg) { return function () { fechar(); toast(msg); E.em = 0; return carregar(); }; }
  function falhou(e) { toast(traduz(e), true); }
  function pedirMotivo(titulo, texto, acao, id, rotuloBt) {
    modal('<h2>' + esc(titulo) + '</h2>' + (texto ? '<div class="sb">' + esc(texto) + '</div>' : '') +
      '<label>Motivo *</label><textarea id="g2e-motivo" rows="3" maxlength="500"></textarea>' +
      '<div class="gap"></div><button class="btn pr" data-e="' + acao + '" data-v="' + esc(id) + '">' + esc(rotuloBt || 'Enviar') + '</button><div class="gap"></div><button class="btn gh" data-a="fechar">Voltar</button>');
  }
  function motivo() { var t = $('g2e-motivo'); var v = t ? t.value.trim() : ''; if (!v) toast('Informe o motivo.', true); return v; }
  function escala(id) { return ((E.esc && E.esc.escalas) || []).filter(function (x) { return x.staffId === id; })[0] || null; }
  function formTransferir(staffId) {
    var x = escala(staffId); if (!x) return;
    modal('<h2>Passar a escala</h2><div class="sb">' + rotulo(x) + '</div><div class="empty">Carregando a equipe do Kids…</div>');
    rpc('v39_min_members', { p_ministry_id: x.ministerioId, p_incluir_encerrados: false }).then(function (l) {
      var eu = (cfg().usuario || {}).pessoaId;
      l = (Array.isArray(l) ? l : []).filter(function (p) { return p.status === 'active' && p.temLogin && p.pessoaId !== eu; });
      modal('<h2>Passar a escala</h2><div class="sb">' + rotulo(x) + '</div>' +
        '<div class="sb" style="margin-top:6px">Quem receber precisa aceitar e depois o líder autoriza. Até lá, a escala continua com você.</div>' +
        '<label>Para quem *</label><select id="g2e-para"><option value="">Escolha…</option>' + l.map(function (p) { return '<option value="' + esc(p.pessoaId) + '">' + esc(p.nome) + '</option>'; }).join('') + '</select>' +
        (l.length ? '' : '<div class="aviso r">Ninguém da equipe do Kids com acesso ao app para receber.</div>') +
        '<label>Motivo (opcional)</label><textarea id="g2e-motivo" rows="2" maxlength="500"></textarea>' +
        '<div class="gap"></div><button class="btn pr" data-e="enviarTroca" data-v="' + esc(staffId) + '">Pedir a troca</button><div class="gap"></div><button class="btn gh" data-a="fechar">Voltar</button>');
    }).catch(falhou);
  }
  var ACOES = {
    sino: function () { if (Date.now() - E.em > 15000) carregar().then(listaAvisos); else listaAvisos(); },
    lerTodos: function () { lerAviso(null).then(listaAvisos); },
    abrirAviso: abrirAviso,
    confirmar: function (id) { rpc('v39_kids_schedule_respond', { p: { staffId: id, resposta: 'confirmed' } }).then(depois('Escala confirmada. Obrigado!')).catch(falhou); },
    naoPosso: function (id) { var x = escala(id); pedirMotivo('Não posso nesta escala', x ? x.sala + ' · ' + diaHora(x.inicio) + '. O líder será avisado.' : '', 'naoPossoOk', id); },
    naoPossoOk: function (id) { var m = motivo(); if (!m) return; rpc('v39_kids_schedule_respond', { p: { staffId: id, resposta: 'declined', motivo: m } }).then(depois('Resposta enviada ao líder.')).catch(falhou); },
    transferir: formTransferir,
    enviarTroca: function (id) {
      var s = $('g2e-para'), para = s ? s.value : ''; if (!para) return toast('Escolha para quem passar.', true);
      var mt = $('g2e-motivo');
      rpc('v39_kids_transfer_request', { p: { staffId: id, paraPessoaId: para, motivo: mt ? mt.value.trim() : '' } }).then(depois('Pedido de troca enviado.')).catch(falhou);
    },
    cancelarTroca: function (id) { rpc('v39_kids_transfer_cancel', { p: { transferenciaId: id } }).then(depois('Pedido de troca cancelado.')).catch(falhou); },
    aceitar: function (id) { rpc('v39_kids_transfer_respond', { p: { transferenciaId: id, aceita: true } }).then(depois('Troca aceita. Falta o líder autorizar.')).catch(falhou); },
    recusarTroca: function (id) { pedirMotivo('Não posso assumir', 'Quem pediu a troca será avisado.', 'recusarTrocaOk', id); },
    recusarTrocaOk: function (id) { var m = motivo(); if (!m) return; rpc('v39_kids_transfer_respond', { p: { transferenciaId: id, aceita: false, motivo: m } }).then(depois('Resposta enviada.')).catch(falhou); },
    aprovar: function (id) { rpc('v39_kids_transfer_decide', { p: { transferenciaId: id, aprova: true } }).then(depois('Troca autorizada.')).catch(falhou); },
    naoAprovar: function (id) { pedirMotivo('Não autorizar a troca', 'Os dois voluntários serão avisados.', 'naoAprovarOk', id); },
    naoAprovarOk: function (id) { var m = motivo(); if (!m) return; rpc('v39_kids_transfer_decide', { p: { transferenciaId: id, aprova: false, motivo: m } }).then(depois('Troca não autorizada.')).catch(falhou); }
  };
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest && ev.target.closest('[data-e]'); if (!t) return;
    var a = t.getAttribute('data-e'); if (!ACOES[a]) return;
    if (!t.closest('#g2esc') && !t.closest('#modal') && t.id !== 'g2-sino') return;
    ev.preventDefault(); ev.stopPropagation();
    if (t.disabled) return;
    try { ACOES[a](t.getAttribute('data-v'), t); } catch (e) { console.warn('[2Gather] escala', e); toast('Não foi possível concluir.', true); }
  });

  /* chamado no fim do render() do app.js */
  window.G2_ESCALA = {
    versao: VERSAO,
    aposRender: function (ehInicio) {
      E.inicio = !!ehInicio && v39();
      pintarSino(); pintarCard();
      if (Date.now() - E.em > 60000) carregar();
    },
    recarregar: function () { E.em = 0; return carregar(); }
  };
  setInterval(function () { if (!document.hidden && cfg().token) carregar(); }, 120000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && Date.now() - E.em > 60000 && cfg().token) carregar(); });
})();
