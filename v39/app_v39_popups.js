/* 2Gather v39 · Pop-ups seguros · POPUP-1
   Carregar por ÚLTIMO, depois de todos os módulos v39 (antes do app_v39_qa.js, se existir). Não altera o app.js. Não exige SQL.

   Vale para TODOS os pop-ups do app (os do app.js e os dos módulos v39):
   1) Clicar na área escura FORA do pop-up não fecha mais (evita perder o que foi digitado).
   2) Todo pop-up ganha um botão X pequeno no canto superior direito. O X fecha o pop-up do mesmo jeito que o app já
      fecha (usa o botão "Cancelar/Fechar" do próprio pop-up; se não houver, usa o mesmo caminho do clique no fundo).
   3) Botões lado a lado dentro do pop-up ficam alinhados na vertical (mesma altura, sem desnível de margem).
   O Esc continua fechando como antes. Se algum pop-up se comportar mal: no Console, G2_POPUPS.off() desliga tudo na hora. */
(function () {
  'use strict';
  if (window.G2_POPUPS) return;
  var P = window.G2_POPUPS = { versao: 'POPUP-1', ativo: true };
  console.info('[2Gather] pop-ups ' + P.versao);

  var ATIVOS = [], rodando = false, agendado = false, ocupado = false, ultimo = 0;
  var EVS = ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'];
  var RX_NOME = /(^|[\s_-])(modal|overlay|backdrop|dialog|popup|sheet|scrim|lightbox|mask)/;
  var RX_FECHAR = ['[data-a="fechar"]', '[data-a="cancelar"]', '[data-x="cancelar"]', '[data-act="fechar"]', '[data-fechar]', '[data-close]', '.fechar', '.close'];

  /* ───────── utilidades de DOM (só o necessário, simples de testar) ───────── */
  function el1(n) { return n && n.nodeType === 1; }
  function filhos(e) { var o = [], c = (e && e.children) || [], i; for (i = 0; i < c.length; i++) o.push(c[i]); return o; }
  function tem(e, a) { return !!(e && e.hasAttribute && e.hasAttribute(a)); }
  function estilo(e) { try { return window.getComputedStyle(e) || {}; } catch (x) { return {}; } }
  function visivel(e) {
    var cs = estilo(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (parseFloat(cs.opacity === undefined || cs.opacity === '' ? '1' : cs.opacity) < 0.01) return false;
    return !e.getClientRects || e.getClientRects().length > 0;
  }
  function alfa(cs) {
    var c = String((cs && cs.backgroundColor) || ''), m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return c === 'transparent' || c === '' ? 0 : 1;
    var p = m[1].split(','); return p.length > 3 ? parseFloat(p[3]) : 1;
  }
  // percorre os descendentes (largura primeiro), com limite, e devolve o 1º que satisfaz fn
  function achar(raiz, fn, prof, lim) {
    var fila = [{ e: raiz, d: 0 }], n = 0;
    while (fila.length && n < (lim || 400)) {
      var it = fila.shift(), ks = filhos(it.e);
      for (var i = 0; i < ks.length; i++) {
        n++; if (fn(ks[i])) return ks[i];
        if (it.d + 1 < (prof || 8)) fila.push({ e: ks[i], d: it.d + 1 });
      }
    }
    return null;
  }
  function subir(e, fn) { while (e && e.nodeType === 1) { if (fn(e)) return e; e = e.parentNode; } return null; }
  function contem(a, b) { return !!(a && b && (a === b || (a.contains && a.contains(b)))); }

  /* ───────── 1) quais elementos são pop-ups ───────── */
  function ehOverlay(e) {
    if (!el1(e) || e === document.body || e === document.documentElement) return false;
    var id = String(e.id || '');
    if (id === 'main' || id === 'nav' || id === 'g2fin' || id === 'g2f-dash' || id === 'g2f-toast') return false;
    var cs = estilo(e);
    if (cs.position !== 'fixed' || !visivel(e)) return false;
    var r = e.getBoundingClientRect(), W = window.innerWidth || 0, H = window.innerHeight || 0;
    if (r.width < W * 0.9 || r.height < H * 0.9) return false;
    if (!filhos(e).length) return false;
    var nome = (id + ' ' + (typeof e.className === 'string' ? e.className : '')).toLowerCase();
    var nomeado = RX_NOME.test(nome) || (e.getAttribute && (e.getAttribute('role') === 'dialog' || e.getAttribute('aria-modal') === 'true'));
    var z = parseInt(cs.zIndex, 10) || 0;
    if (!(nomeado || z >= 100)) return false;
    if (achar(e, function (x) { return x.id === 'main' || x.id === 'nav'; }, 3, 60)) return false;     // casca do app, não pop-up
    return true;
  }
  function candidatos() {
    var out = [], vistos = [];
    function add(x) { if (x && vistos.indexOf(x) < 0) { vistos.push(x); if (ehOverlay(x)) out.push(x); } }
    add(document.getElementById('modal'));
    try {
      var q = document.querySelectorAll('[id*="modal"],[class*="modal"],[class*="overlay"],[class*="backdrop"],[role="dialog"],[aria-modal="true"]');
      for (var i = 0; i < q.length; i++) add(q[i]);
    } catch (x) { /* sem querySelectorAll */ }
    var ks = filhos(document.body); for (var j = 0; j < ks.length; j++) add(ks[j]);
    return out;
  }
  // a "caixa" do pop-up: o maior elemento de fundo opaco dentro do overlay (ou o próprio overlay, se ele for a folha)
  function acharBox(ov) {
    var cs = estilo(ov);
    if (alfa(cs) >= 0.95) return ov;
    var ro = ov.getBoundingClientRect(), areaOv = ro.width * ro.height, melhor = null, area = 0, maior = null, areaMaior = 0;
    achar(ov, function (c) {
      if (!visivel(c)) return false;
      var r = c.getBoundingClientRect(), a = r.width * r.height;
      if (a <= 0 || a >= areaOv * 0.999) return false;
      if (alfa(estilo(c)) >= 0.95 && a > area) { area = a; melhor = c; }
      if (contem(ov, c) && c.parentNode === ov && a > areaMaior) { areaMaior = a; maior = c; }
      return false;
    }, 3, 80);
    if (melhor) return melhor;
    if (maior) { var rm = maior.getBoundingClientRect(); if (rm.width < ro.width - 8 || rm.height < ro.height - 8) return maior; }
    return ov;
  }

  /* ───────── 2) botão X ───────── */
  var ICONE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  function fecharPopup(ov) {
    var box = ov._g2box && contem(ov, ov._g2box) ? ov._g2box : ov, alvo = null, i;
    for (i = 0; i < RX_FECHAR.length && !alvo; i++) {
      try { alvo = achar(box, function (x) { return !tem(x, 'data-g2x') && matchSeletor(x, RX_FECHAR[i]); }, 8, 300); } catch (x) { alvo = null; }
    }
    if (alvo && typeof alvo.click === 'function') { alvo.click(); return; }
    // sem botão de fechar no pop-up: usa o mesmo caminho do clique no fundo, que é o que o app já trata
    try {
      ov._g2permitir = true;
      ov.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    } catch (x) { /* sem MouseEvent */ }
    ov._g2permitir = false;
  }
  function matchSeletor(x, sel) {
    var m = sel.match(/^\[([a-z-]+)(?:="([^"]*)")?\]$/);
    if (m) return m[2] === undefined ? tem(x, m[1]) : (x.getAttribute && x.getAttribute(m[1]) === m[2]);
    var c = sel.match(/^\.([\w-]+)$/);
    if (c) return String(x.className || '').split(/\s+/).indexOf(c[1]) >= 0;
    return false;
  }
  function criarX(ov) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'g2x-x'; b.setAttribute('data-g2x', '1');
    b.setAttribute('aria-label', 'Fechar'); b.setAttribute('title', 'Fechar'); b.innerHTML = ICONE;
    b.addEventListener('click', function (ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); fecharPopup(ov); });
    ov.appendChild(b);
    return b;
  }
  function xDe(ov) { return achar(ov, function (x) { return tem(x, 'data-g2x'); }, 8, 400); }
  function posicionar(ov) {
    var b = xDe(ov); if (!b) return;
    var box = ov._g2box && contem(ov, ov._g2box) ? ov._g2box : ov, r = box.getBoundingClientRect(), W = window.innerWidth || 0;
    var top = Math.max(6, Math.round(r.top + 8)), left = Math.max(6, Math.min(W - 42, Math.round(r.right - 42)));
    if (b._g2t !== top || b._g2l !== left) { b._g2t = top; b._g2l = left; b.style.top = top + 'px'; b.style.left = left + 'px'; }
  }

  /* ───────── 3) botões alinhados ───────── */
  function ehBotao(x) {
    var t = String(x.tagName || '').toUpperCase();
    if (tem(x, 'data-g2x')) return false;
    if (t === 'BUTTON') return true;
    if (t === 'INPUT') { var ty = String((x.getAttribute && x.getAttribute('type')) || '').toLowerCase(); return ty === 'button' || ty === 'submit'; }
    if (t === 'A' || t === 'LABEL') return /(^|\s)(btn|button|hbtn)(\s|$)/.test(String(x.className || '')) || (x.getAttribute && x.getAttribute('role') === 'button');
    return !!(x.getAttribute && x.getAttribute('role') === 'button');
  }
  function alinharLinha(row, kids) {
    if (row._g2row) return; row._g2row = 1;
    var cs = estilo(row), d = cs.display;
    if (row.classList) row.classList.add('g2x-row');
    if (d === 'flex' || d === 'inline-flex' || d === 'grid' || d === 'inline-grid') row.style.alignItems = 'stretch';
    else {
      var ta = cs.textAlign;
      row.style.display = 'flex'; row.style.flexWrap = 'wrap'; row.style.alignItems = 'stretch'; row.style.gap = '8px';
      row.style.justifyContent = (ta === 'right' || ta === 'end') ? 'flex-end' : (ta === 'center' ? 'center' : 'flex-start');
    }
    kids.forEach(function (k) {
      k.style.marginTop = '0'; k.style.marginBottom = '0';
      if (String(k.tagName || '').toUpperCase() !== 'BUTTON') { k.style.display = 'inline-flex'; k.style.alignItems = 'center'; k.style.justifyContent = 'center'; }
    });
  }
  function alinharBotoes(box) {
    var pilha = [box], n = 0;
    while (pilha.length && n < 300) {
      var e = pilha.shift(), ks = filhos(e);
      n += ks.length;
      var vis = ks.filter(function (k) { return !k.hidden && !tem(k, 'data-g2x'); });
      if (vis.length >= 2 && vis.every(ehBotao)) alinharLinha(e, vis);
      ks.forEach(function (k) { if (el1(k)) pilha.push(k); });
    }
  }

  /* ───────── decorar cada pop-up aberto ───────── */
  function decorar(ov) {
    var box = acharBox(ov); ov._g2box = box;
    if (ov.classList && !ov.classList.contains('g2x-ov')) ov.classList.add('g2x-ov');
    if (!xDe(ov)) criarX(ov);
    var h = achar(box, function (x) { return /^H[1-4]$/.test(String(x.tagName || '')); }, 4, 40);
    if (h && !h._g2pad) { h._g2pad = 1; h.style.paddingRight = '44px'; }
    alinharBotoes(box);
    posicionar(ov);
  }
  function varrer() {
    if (ocupado || !P.ativo) return; ocupado = true;
    try {
      css();
      ATIVOS = candidatos();
      ATIVOS.forEach(function (ov) { try { decorar(ov); } catch (e) { console.warn('[2Gather][popups]', e); } });
      if (ATIVOS.length) iniciarLoop();
    } finally { ocupado = false; }
  }
  function iniciarLoop() {
    if (rodando) return; rodando = true;
    (function quadro() {
      if (!ATIVOS.length) { rodando = false; return; }
      for (var i = 0; i < ATIVOS.length; i++) { try { posicionar(ATIVOS[i]); } catch (e) { /* segue */ } }
      var agora = Date.now();
      if (agora - ultimo > 600) { ultimo = agora; if (ATIVOS.some(function (o) { return !visivel(o); })) { agendar(); } }
      requestAnimationFrame(quadro);
    })();
  }
  function agendar() { if (agendado) return; agendado = true; requestAnimationFrame(function () { agendado = false; varrer(); }); }

  /* ───────── bloqueio do clique no fundo ───────── */
  function bloquear(ev) {
    if (!P.ativo || !ATIVOS.length) return;
    var t = ev && ev.target; if (!el1(t)) return;
    for (var i = 0; i < ATIVOS.length; i++) {
      var ov = ATIVOS[i]; if (!contem(ov, t)) continue;
      if (ov._g2permitir) return;
      if (subir(t, function (x) { return tem(x, 'data-g2x'); })) return;                   // clique no X
      var box = ov._g2box && contem(ov, ov._g2box) ? ov._g2box : ov;
      if (box === ov || contem(box, t)) return;                                              // dentro do pop-up
      ev.stopImmediatePropagation && ev.stopImmediatePropagation();
      if (String(ev.type).indexOf('touch') !== 0 && ev.preventDefault) ev.preventDefault();
      return;
    }
  }

  /* ───────── estilo ───────── */
  function css() {
    if (document.getElementById('g2x-css')) return;
    var s = document.createElement('style'); s.id = 'g2x-css';
    s.textContent = '.g2x-x{position:fixed;z-index:2147483000;width:34px;height:34px;padding:0;margin:0;border:0;border-radius:50%;background:#fff;color:#14161A;box-shadow:0 2px 10px rgba(20,22,26,.28);display:flex;align-items:center;justify-content:center;cursor:pointer;line-height:1}' +
      '.g2x-x:hover{background:#EEF0F4}.g2x-x:focus-visible{outline:2px solid #2F5BEA;outline-offset:2px}' +
      '.g2x-x svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round}' +
      '.g2x-ov{cursor:default}.g2x-row>*{margin-top:0!important;margin-bottom:0!important}';
    document.head.appendChild(s);
  }

  /* ───────── liga tudo ───────── */
  function iniciar() {
    EVS.forEach(function (t) { document.addEventListener(t, bloquear, { capture: true, passive: false }); });
    try {
      new MutationObserver(function (recs) {
        for (var i = 0; i < recs.length; i++) { var t = recs[i].target; if (!(el1(t) && subir(t, function (x) { return tem(x, 'data-g2x'); }))) { agendar(); return; } }
      }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    } catch (e) { /* sem observer: o intervalo cobre */ }
    setInterval(varrer, 1500);
    agendar();
  }
  P.off = function () { P.ativo = false; ATIVOS = []; var xs = document.querySelectorAll ? document.querySelectorAll('[data-g2x].g2x-x') : []; for (var i = 0; i < xs.length; i++) if (xs[i].remove) xs[i].remove(); console.info('[2Gather] pop-ups: desligado'); };
  P.on = function () { P.ativo = true; agendar(); console.info('[2Gather] pop-ups: ligado'); };
  P.varrer = varrer;
  P._t = { ehOverlay: ehOverlay, acharBox: acharBox, bloquear: bloquear, decorar: decorar, candidatos: candidatos, fecharPopup: fecharPopup, alinharBotoes: alinharBotoes, setAtivos: function (a) { ATIVOS = a; }, ativos: function () { return ATIVOS; } };

  if (document.body) iniciar(); else document.addEventListener('DOMContentLoaded', iniciar);
})();
