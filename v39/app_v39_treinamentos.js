/* 2Gather v39 · Treinamentos/Reuniões e Cursos do Instituto · TRN-2
   SUBSTITUI o app_v39_treinamentos.js (TRN-1): no index.html deixe só este arquivo.
   Carregar DEPOIS do app.js e dos demais módulos v39. Não altera o app.js.
   Requer, no Supabase: v39_treinamentos_completo.sql (TRN-1) e v39_treinamentos_avisos_t2.sql (TRN-2).

   1) Carrega reuniões, treinamentos, cursos e datas do banco (db.reunioes / db.aulas) e liga as gravações da tela
      (salvarReuniao, salvarAula, conviteEnviado) ao banco.
   2) AVISOS no app: quem é adicionado a um treinamento/reunião/curso, escolhido como responsável pela chamada ou
      afetado por mudança de data/horário/local vê um cartão no topo de Avisos, com contador no menu e
      notificação do aparelho (quando o usuário já ativou as notificações do app).
      Lembretes "Hoje" e "Amanhã" aparecem do mesmo jeito.
   3) LEMBRETES PELO WHATSAPP para quem gerencia: na tela de Treinamentos/Cursos aparece a fila das datas de hoje até
      daqui a 2 dias; cada participante tem o botão "Enviar" (abre o WhatsApp com a mensagem pronta e marca como enviado). */
(function () {
  'use strict';
  var VERSAO = 'TRN-2';
  if (window.G2_TRN) return;
  window.G2_TRN = { versao: VERSAO };
  console.info('[2Gather] treinamentos ' + VERSAO);

  /* ───────── utilidades ───────── */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function G() { return window.__gc || null; }
  function cfg() { var g = G(); try { return (g && g.cfg && g.cfg()) || {}; } catch (e) { return {}; } }
  function db() { var g = G(); try { return (g && g.db && g.db()) || null; } catch (e) { return null; } }
  function v39() { return cfg().token === 'supabase-v39'; }
  function uuid(x) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(x || '')); }
  // mesma origem da igreja que o app.js usa (não chama nenhum "ensure" do contexto)
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
    TRN_TITLE_REQUIRED: 'Informe o título.', TRN_DATE_REQUIRED: 'Informe a data.', TRN_DATE_INVALID: 'A data informada é inválida.',
    TRN_TIME_INVALID: 'O horário de término precisa ser depois do início.', TRN_NOT_FOUND: 'Não encontrado. Atualize a página e tente de novo.',
    TRN_CLASS_FUTURE: 'Esta data ainda não chegou. A chamada pode ser lançada no dia.',
    TRN_PARTICIPANT_INVALID: 'Há um participante inválido ou de outra igreja. Remova e escolha de novo.',
    PERMISSION_DENIED: 'Você não tem permissão para esta ação. Fale com a liderança.'
  };
  function traduz(e) {
    var t = String((e && (e.message || e.details || e.hint || e.code)) || e || ''), d = String((e && e.details) || '');
    for (var k in MSG) if (t.indexOf(k) >= 0 || d === k) return MSG[k];
    if (/PGRST202|find the function|does not exist/i.test(t)) return 'O servidor ainda não tem esta função. Rode os SQL de Treinamentos (TRN-1 e TRN-2) no Supabase.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(t)) return 'Sem conexão. Tente novamente.';
    return 'Não foi possível concluir. Tente novamente.';
  }
  function erro(e) { console.warn('[2Gather][treinamentos]', e); return new Error(traduz(e)); }
  function ativo() { return !!(cfg().usuario && v39() && uuid(igrejaId())); }

  /* ───────── 1) reuniões e aulas do banco para o app ───────── */
  var S = { ig: '', t: 0, carregando: false, sig: '' };
  function digitando() { var a = document.activeElement, m = $('main'); return !!(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && m && m.contains(a)); }
  function redesenhar() {
    var g = G(); if (!g || typeof g.render !== 'function') return;
    if (digitando()) { setTimeout(redesenhar, 1500); return; }
    var md = $('modal'); if (md && md.classList.contains('on')) { setTimeout(redesenhar, 2500); return; }
    g.render();
  }
  function hidratar(forcar) {
    var ig = igrejaId();
    if (!ativo() || S.carregando) return Promise.resolve();
    if (!forcar && S.ig === ig && Date.now() - S.t < 15000) return Promise.resolve();
    S.carregando = true;
    return rpc('v39_trn_list', { p_church_id: ig }).then(function (r) {
      var d = db(); if (!d || !r) return;
      var sig = JSON.stringify([r.reunioes, r.aulas]);
      d.reunioes = r.reunioes || []; d.aulas = r.aulas || [];
      if (!(d.equipeInst && d.equipeInst.length)) d.equipeInst = d.equipe || [];
      var mudou = sig !== S.sig; S.sig = sig; S.ig = ig; S.t = Date.now();
      if (mudou) redesenhar();
    }).catch(function (e) { S.ig = ig; S.t = Date.now(); console.warn('[2Gather][treinamentos] leitura falhou: ' + traduz(e)); })
      .then(function () { S.carregando = false; });
  }
  function limpar(o) { var x = {}; for (var k in o) if (o[k] !== undefined) x[k] = o[k]; return x; }
  var ACOES = {
    salvarReuniao: function (d) {
      return rpc('v39_trn_save_meeting', { p_church_id: igrejaId(), p: limpar(d.reuniao || {}) }).then(function (r) {
        setTimeout(function () { hidratar(true); carregarFila(true); }, 800);
        return { ok: true, reuniao: r.reuniao, aulas: r.aulas || [] };
      }).catch(function (e) { throw erro(e); });
    },
    salvarAula: function (d) {
      return rpc('v39_trn_save_class', { p_church_id: igrejaId(), p: limpar(d.aula || {}) }).then(function (r) { return { ok: true, aula: r.aula }; })
        .catch(function (e) { throw erro(e); });
    },
    conviteEnviado: function (d) {
      return rpc('v39_trn_mark_invited', { p_church_id: igrejaId(), p_meeting_id: d.reuniaoId, p_keys: d.chaves || [] })
        .then(function () { return { ok: true }; }).catch(function (e) { throw erro(e); });
    }
  };
  function instalar() {
    var V = window.G2_V39; if (!V || !V.p1) return false;
    var P = V.p1; if (P.__trn) return true;
    if (typeof P.isMutation !== 'function' || typeof P.isRead !== 'function' || typeof P.execute !== 'function') return false;
    var isM = P.isMutation, isR = P.isRead, ex = P.execute;
    P.isMutation = function (a) { return ACOES[a] ? true : isM.apply(P, arguments); };
    P.isRead = function (a) { return ACOES[a] ? false : isR.apply(P, arguments); };
    P.execute = function (a, d) { return ACOES[a] ? ACOES[a](d || {}) : ex.apply(P, arguments); };
    P.__trn = true; return true;
  }
  var tent = 0, tm = setInterval(function () { if (instalar() || ++tent > 240) clearInterval(tm); }, 250);

  /* ───────── 2) avisos no app ───────── */
  var N = { lista: [], nao: 0, ig: '', t: 0, carregando: false, sig: '' };
  var K_NOT = 'g2_trn_notif';
  function lerVistos() { try { return JSON.parse(localStorage.getItem(K_NOT) || '{}') || {}; } catch (e) { return {}; } }
  function gravarVistos(v) {
    var lim = Date.now() - 20 * 86400000;
    Object.keys(v).forEach(function (k) { if (k !== '_i' && v[k] < lim) delete v[k]; });
    try { localStorage.setItem(K_NOT, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ }
  }
  function notificarDispositivo(lista) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    var vistos = lerVistos(), limite = new Date(Date.now() - 48 * 3600000).toISOString(), novos = [];
    lista.forEach(function (a) {
      if (a.lido || vistos[a.chave]) return;
      vistos[a.chave] = Date.now();
      if (a.tipo === 'lembrete' || String(a.ordem || '') >= limite) novos.push(a);
    });
    gravarVistos(vistos);
    var mostrar = function (t, o) {
      if (navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then(function (reg) { reg.showNotification(t, o); }).catch(function () { try { new Notification(t, o); } catch (e) { /* sem notificação */ } });
      else { try { new Notification(t, o); } catch (e) { /* sem notificação */ } }
    };
    var ic = 'icons/icon-192.png';
    if (novos.length > 3) mostrar('Treinamentos e reuniões', { body: novos.length + ' avisos novos no app.', icon: ic, badge: ic, tag: 'g2-trn-lote', data: { aba: 'avisos' } });
    else novos.forEach(function (a) { mostrar(a.titulo, { body: String(a.corpo || '').slice(0, 160), icon: ic, badge: ic, tag: 'trn:' + a.chave, data: { aba: 'avisos' } }); });
  }
  function carregarAvisos(forcar) {
    var ig = igrejaId();
    if (!ativo() || N.carregando) return Promise.resolve();
    if (!forcar && N.ig === ig && Date.now() - N.t < 45000) return Promise.resolve();
    N.carregando = true;
    return rpc('v39_trn_my_notices', { p_church_id: ig }).then(function (r) {
      r = r || {}; N.lista = r.avisos || []; N.nao = +r.naoLidos || 0; N.ig = ig; N.t = Date.now();
      notificarDispositivo(N.lista);
      var sig = JSON.stringify(N.lista.map(function (a) { return a.chave + (a.lido ? '1' : '0'); }));
      if (sig !== N.sig) { N.sig = sig; var x = $('g2t-avisos'); if (x) x.remove(); }
    }).catch(function (e) { N.ig = ig; N.t = Date.now(); console.warn('[2Gather][treinamentos] avisos: ' + traduz(e)); })
      .then(function () { N.carregando = false; pintarAvisos(); pintarBadge(); });
  }
  function ehTelaAvisos() { var a = String(cfg().aba || ''); return a === 'avisos' || a === 'alertas'; }
  function pintarAvisos() {
    var main = $('main');
    if (!main || !ativo() || !ehTelaAvisos()) return;
    var x = $('g2t-avisos'); if (x && main.contains(x)) return;
    var pend = N.lista.filter(function (a) { return !a.lido; });
    if (!pend.length) return;
    var h = '<div class="card" id="g2t-avisos" style="border-left:5px solid var(--dourado)"><h3>📚 Treinamentos e reuniões</h3>' +
      pend.map(function (a) {
        return '<div class="row" style="align-items:flex-start"><div class="info"><div class="nm">' + (a.tipo === 'lembrete' ? '⏰ ' : '') + esc(a.titulo) + '</div>' +
          '<div class="sb">' + esc(a.corpo) + '</div></div><button type="button" class="btn gh sm" data-g2t="ok" data-v="' + esc(a.chave) + '">Ok</button></div>';
      }).join('') +
      (pend.length > 1 ? '<div style="text-align:right;margin-top:6px"><button type="button" class="btn gh sm" data-g2t="todos">Marcar todos como lidos</button></div>' : '') + '</div>';
    main.insertAdjacentHTML('afterbegin', h);
  }
  function pintarBadge() {
    var nav = $('nav'); if (!nav) return;
    var b = nav.querySelector('button[data-v="avisos"], button[data-v="alertas"]'); if (!b) return;
    if (b.getAttribute('data-g2t-n') === String(N.nao)) return;
    var tag = b.querySelector('.bdg');
    if (tag) {
      var base = parseInt(tag.getAttribute('data-g2t-base') != null ? tag.getAttribute('data-g2t-base') : tag.textContent, 10) || 0;
      tag.setAttribute('data-g2t-base', base);
      if (base + N.nao > 0) tag.textContent = base + N.nao; else tag.remove();
    } else if (N.nao > 0) b.insertAdjacentHTML('beforeend', '<span class="bdg" data-g2t-base="0">' + N.nao + '</span>');
    b.setAttribute('data-g2t-n', N.nao);
  }
  function marcarLidos(chaves) {
    chaves.forEach(function (k) { N.lista.forEach(function (a) { if (a.chave === k) a.lido = true; }); });
    N.nao = N.lista.filter(function (a) { return !a.lido; }).length;
    var x = $('g2t-avisos'); if (x) x.remove(); pintarAvisos(); pintarBadge();
    rpc('v39_trn_my_notices_read', { p_church_id: igrejaId(), p_keys: chaves }).catch(function (e) { console.warn('[2Gather][treinamentos] marcar lido: ' + traduz(e)); });
  }

  /* ───────── 3) lembretes pelo WhatsApp (quem gerencia) ───────── */
  var Q = { lista: [], ig: '', t: 0, carregando: false, sig: '' };
  function telaCursos() { var a = String(cfg().aba || ''); return a === 'cursos' || a === 'instcursos'; }
  function carregarFila(forcar) {
    var ig = igrejaId();
    if (!ativo() || Q.carregando) return Promise.resolve();
    if (!forcar && Q.ig === ig && Date.now() - Q.t < 60000) return Promise.resolve();
    Q.carregando = true;
    return rpc('v39_trn_wa_queue', { p_church_id: ig }).then(function (r) {
      Q.lista = Array.isArray(r) ? r : []; Q.ig = ig; Q.t = Date.now();
      var sig = JSON.stringify(Q.lista); if (sig !== Q.sig) { Q.sig = sig; var x = $('g2t-fila'); if (x) x.remove(); }
    }).catch(function (e) { Q.ig = ig; Q.t = Date.now(); console.warn('[2Gather][treinamentos] fila: ' + traduz(e)); })
      .then(function () { Q.carregando = false; pintarFila(); });
  }
  function dd(iso) { return String(iso || '').slice(8, 10) + '/' + String(iso || '').slice(5, 7); }
  function primeiroNome(n) { return String(n || '').trim().split(' ')[0] || ''; }
  function linkWA(fone, txt) { var f = String(fone || '').replace(/\D/g, ''); return f.length >= 10 ? 'https://wa.me/' + (f.length <= 11 ? '55' : '') + f + '?text=' + encodeURIComponent(txt) : ''; }
  function msgLembrete(it, p) {
    var quando = it.dias === 0 ? 'hoje' : it.dias === 1 ? 'amanhã' : 'em ' + it.dias + ' dias (' + dd(it.data) + ')';
    return 'Olá, ' + primeiroNome(p.nome) + '! Lembrete: *' + it.titulo + '* é ' + quando + (it.inicio ? ' às ' + it.inicio : '') + '.\n' +
      (it.tema ? '📖 Tema: ' + it.tema + '\n' : '') + (it.local ? '📍 Local: ' + it.local + '\n' : '') + '\nContamos com você! 🙏';
  }
  function moduloDe(id) {
    var d = db(), l = (d && d.reunioes) || [];
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i].modulo || '';
    return null;
  }
  function pintarFila() {
    var main = $('main');
    if (!main || !ativo() || !telaCursos()) return;
    var x = $('g2t-fila'); if (x && main.contains(x)) return;
    var mod = String(cfg().aba) === 'instcursos' ? 'inst' : '';
    var itens = Q.lista.filter(function (it) { var m = moduloDe(it.reuniaoId); return m === null || m === mod; });
    if (!itens.length) return;
    var h = '<div class="card" id="g2t-fila" style="border-left:5px solid #25D366"><h3>⏰ Lembretes pelo WhatsApp</h3>' +
      '<div style="font-size:12px;color:#666;line-height:1.5;margin-bottom:8px">Datas de hoje até daqui a 2 dias. Toque em <b>Enviar</b>: o WhatsApp abre com a mensagem pronta e o lembrete fica marcado como enviado.</div>' +
      itens.map(function (it) {
        var env = it.participantes.filter(function (p) { return p.enviado; }).length;
        var quando = it.dias === 0 ? 'Hoje' : it.dias === 1 ? 'Amanhã' : dd(it.data);
        return '<details' + (it.dias <= 1 ? ' open' : '') + ' style="border-top:1px solid #eee;padding:6px 0"><summary style="cursor:pointer;font-weight:700;font-size:13px">' +
          esc(quando) + (it.inicio ? ' · ' + esc(it.inicio) : '') + ' — ' + esc(it.titulo) + ' <span style="font-weight:500;color:#888">(' + it.participantes.length + ' participante(s)' + (env ? ', ' + env + ' enviado(s)' : '') + ')</span></summary>' +
          it.participantes.map(function (p) {
            var w = linkWA(p.fone, msgLembrete(it, p));
            return '<div class="row" id="g2t-p-' + esc(it.aulaId) + '-' + esc(p.chave.replace(':', '_')) + '"><div class="info"><div class="nm">' + esc(p.nome) + '</div><div class="sb">' + esc(p.fone || 'sem telefone') + '</div></div>' +
              (p.enviado ? '<span class="pill p-verde">enviado ✓</span>' : (w ? '<a class="wa" data-g2t="zap" data-v="' + esc(it.aulaId + '|' + p.chave) + '" href="' + w + '" target="_blank" rel="noopener">Enviar</a>' : '<span class="pill p-cinza">sem nº</span>')) + '</div>';
          }).join('') + '</details>';
      }).join('') + '</div>';
    main.insertAdjacentHTML('afterbegin', h);
  }
  function enviouLembrete(v) {
    var p = String(v).split('|'), aulaId = p[0], chave = p[1];
    Q.lista.forEach(function (it) { if (it.aulaId === aulaId) it.participantes.forEach(function (q) { if (q.chave === chave) q.enviado = true; }); });
    Q.sig = JSON.stringify(Q.lista);
    var linha = $('g2t-p-' + aulaId + '-' + String(chave).replace(':', '_'));
    if (linha) { var a = linha.querySelector('a.wa'); if (a) { var s = document.createElement('span'); s.className = 'pill p-verde'; s.textContent = 'enviado ✓'; a.parentNode.replaceChild(s, a); } }
    rpc('v39_trn_wa_mark', { p_church_id: igrejaId(), p_class_id: aulaId, p_keys: [chave] }).catch(function (e) { console.warn('[2Gather][treinamentos] marcar envio: ' + traduz(e)); });
  }

  /* ───────── cliques dos cartões deste módulo ───────── */
  document.addEventListener('click', function (ev) {
    var b = ev.target && ev.target.closest ? ev.target.closest('[data-g2t]') : null; if (!b) return;
    var k = b.getAttribute('data-g2t'), v = b.getAttribute('data-v');
    if (k === 'ok') marcarLidos([v]);
    else if (k === 'todos') marcarLidos(N.lista.filter(function (a) { return !a.lido; }).map(function (a) { return a.chave; }));
    else if (k === 'zap') setTimeout(function () { enviouLembrete(v); }, 600);       // o link abre o WhatsApp; aqui só marca
  });

  /* ───────── manutenção ───────── */
  var abaAnt = '', igAnt = '';
  setInterval(function () {
    if (!cfg().usuario || !v39()) { if (S.ig || N.ig || Q.ig) { S.ig = N.ig = Q.ig = ''; S.sig = N.sig = Q.sig = ''; N.lista = []; N.nao = 0; Q.lista = []; } return; }
    var ig = igrejaId(); if (!uuid(ig)) return;
    if (ig !== igAnt) { igAnt = ig; S.sig = N.sig = Q.sig = ''; hidratar(true); carregarAvisos(true); }
    var aba = String(cfg().aba || '');
    if (aba !== abaAnt) { abaAnt = aba; if (/cursos|instcursos/.test(aba)) { hidratar(false); carregarFila(false); } if (ehTelaAvisos()) carregarAvisos(false); }
    carregarAvisos(false);
    if (telaCursos()) carregarFila(false);
    pintarAvisos(); pintarFila(); pintarBadge();
  }, 900);
  setInterval(function () { hidratar(true); }, 90000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { hidratar(false); carregarAvisos(true); if (telaCursos()) carregarFila(true); } });

  window.G2_TRN.hidratar = function () { return hidratar(true); };
  window.G2_TRN.avisos = function () { return carregarAvisos(true); };
  window.G2_TRN._acoes = ACOES;
  window.G2_TRN._msgLembrete = msgLembrete;
  window.G2_TRN._linkWA = linkWA;
})();
