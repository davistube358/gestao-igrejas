/* 2Gather v39 · Correções gerais · CORRECAO-2
   Carregar DEPOIS do app.js (SYNC-V39-15) e ANTES de app_v39_setores.js. Não altera o app.js. Não exige SQL.

   1) Editar pessoa SEM GC (correção 26, revisada)
      Causa: na ficha, o botão "Editar" (perfilEditar) chama lvEditar(v) para quem não tem GC.
      lvEditar não existe como função no app.js (só como ação interna) → ReferenceError → o botão não fazia nada.
      Correção: para pessoa sem GC o clique é desviado para a ação "abrirPessoa" (formulário completo).
      Proteção extra: no formulário, o campo GC ganha a opção "— sem GC —" já selecionada. Sem isso o
      navegador selecionaria o 1º GC da lista e, ao salvar, a pessoa seria transferida sem ninguém pedir.

   2) Faixa de destaque dinâmica na tela inicial (carrossel)
      Mantém o cartão original (Próximo culto / Encontro / Escala) como 1º quadro e acrescenta, quando houver dado:
      - Palavra do culto (título da palavra, tema e pregador cadastrados no culto)
      - Agenda dos próximos 7 dias
      - Aniversariantes da semana (pessoas ativas visíveis para o usuário)
      - Novos rostos (visitantes que chegaram nos últimos 7 dias — só número)
      - Passagem da semana (referência bíblica + reflexão curta, muda toda semana)
      Troca a cada 8 s, pausa ao tocar/passar o mouse, aceita arrastar para os lados e os pontos de navegação.
      Respeita "reduzir movimento" do aparelho (sem troca automática). */
(function () {
  'use strict';
  var VERSAO = 'CORRECAO-2';
  if (window.G2_CORRECOES) return;
  window.G2_CORRECOES = VERSAO;
  console.info('[2Gather] correções ' + VERSAO);

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function G() { return window.__gc || null; }
  function db() { var g = G(); return (g && g.db()) || {}; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function hoje() { return iso(new Date()); }
  function parse(s) { var p = String(s || '').split('-'); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null; }
  function minStr(h) { var m = String(h || '').match(/^(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  function pri(n) { return String(n || '').trim().split(' ')[0]; }
  function chamado(p) { return String(p.apelido || '').trim() || pri(p.nome); }
  var DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  function quando(dt, hora) {
    if (!dt) return hora || '';
    var d = parse(dt); if (!d) return hora || '';
    var am = new Date(); am.setDate(am.getDate() + 1);
    return (dt === hoje() ? 'Hoje' : dt === iso(am) ? 'Amanhã' : DIAS[d.getDay()] + ' ' + dt.slice(8, 10) + '/' + dt.slice(5, 7)) + (hora ? ' · ' + hora : '');
  }

  /* ═════════ 1) EDITAR PESSOA SEM GC ═════════ */
  function pessoa(id) { var l = db().pessoas || []; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function opcaoSemGC() {
    var sel = $('f-gc'); if (!sel || sel.querySelector('option[value=""]')) return;
    var o = document.createElement('option'); o.value = ''; o.textContent = '— sem GC —';
    sel.insertBefore(o, sel.firstChild); sel.value = '';
  }
  document.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-a="perfilEditar"]') : null; if (!t) return;
    var p = pessoa(t.getAttribute('data-v'));
    if (!p || p.gcId) return;                                 // com GC: segue o fluxo normal do app.js
    t.setAttribute('data-a', 'abrirPessoa');                  // o tratador do app.js (fase de bolha) abre o formulário completo
    setTimeout(opcaoSemGC, 0);
  }, true);

  /* ═════════ 2) FAIXA DINÂMICA DA TELA INICIAL ═════════ */
  var PASSAGENS = [
    ['Eclesiastes 4:9-10', 'Juntos somos mais fortes: quando um cai, o outro ajuda a levantar.'],
    ['Hebreus 10:24-25', 'Encorajar uns aos outros e não abandonar o costume de se reunir.'],
    ['Salmos 133:1', 'Viver em unidade é bom e agradável aos olhos de Deus.'],
    ['Atos 2:42', 'Ensino, comunhão, partir do pão e oração: a vida da igreja em casa.'],
    ['Gálatas 6:2', 'Levar as cargas uns dos outros é cumprir a lei de Cristo.'],
    ['João 13:34-35', 'O amor entre nós é a marca de quem segue Jesus.'],
    ['Mateus 18:20', 'Onde dois ou três se reúnem em seu nome, Ele está presente.'],
    ['Salmos 23', 'O cuidado de Deus nos acompanha em cada estação da vida.'],
    ['Mateus 11:28-30', 'Jesus oferece descanso para quem está cansado e sobrecarregado.'],
    ['Josué 1:9', 'Coragem: Deus está com você por onde você andar.'],
    ['Filipenses 4:6-7', 'Troque a ansiedade pela oração e receba a paz de Deus.'],
    ['Romanos 8:28', 'Deus age em todas as coisas para o bem de quem o ama.'],
    ['Isaías 40:31', 'Quem espera no Senhor tem as forças renovadas.'],
    ['Lamentações 3:22-23', 'As misericórdias de Deus se renovam a cada manhã.'],
    ['Provérbios 3:5-6', 'Confiar de todo o coração e deixar Deus guiar os caminhos.'],
    ['João 15:5', 'Permanecer em Cristo é o que faz a vida dar fruto.'],
    ['1 Pedro 5:7', 'Entregue a Ele as suas preocupações: Ele cuida de você.'],
    ['Miqueias 6:8', 'Praticar a justiça, amar a misericórdia e andar humildemente com Deus.']
  ];
  function semanaDoAno() { var d = new Date(), i = new Date(d.getFullYear(), 0, 1); return Math.floor(((d - i) / 864e5 + i.getDay()) / 7); }

  function eventos() { return (db().eventos || []).filter(function (e) { return e && !e.deleted && e.data; }); }
  function ordena(a, b) { return (a.data + (a.inicio || '')) < (b.data + (b.inicio || '')) ? -1 : 1; }
  function proximoCulto() {
    var hj = hoje(), agM = new Date().getHours() * 60 + new Date().getMinutes();
    return eventos().filter(function (e) {
      if (e.data < hj) return false; if (e.data > hj) return true;
      var f = minStr(e.fim) !== null ? minStr(e.fim) : (minStr(e.inicio) !== null ? minStr(e.inicio) + 120 : 1440);
      return f >= agM;
    }).sort(ordena)[0] || null;
  }
  function pessoasAtivas() { return (db().pessoas || []).filter(function (p) { return p && !p.deleted && !p.anonimizadoEm && p.status !== 'Inativo'; }); }
  function aniversarioEm(p) {
    if (!p.nasc || String(p.nasc).length < 10) return null;
    var base = parse(hoje());
    for (var i = 0; i < 7; i++) { var d = new Date(base); d.setDate(d.getDate() + i);
      if (pad(d.getMonth() + 1) === p.nasc.slice(5, 7) && pad(d.getDate()) === p.nasc.slice(8, 10)) return i; }
    return null;
  }

  var ICONES = {
    palavra: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M12 7v6M9 10h6"/>',
    agenda: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    aniver: '<path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20M7 8v3M12 8v3M17 8v3M7 4h.01M12 4h.01M17 4h.01"/>',
    novos: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    passagem: '<path d="M12 2l2.4 7.2H22l-6 4.4 2.3 7.2L12 16.4 5.7 20.8 8 13.6 2 9.2h7.6z"/>'
  };
  function slide(id, tema, peq, grande, linha, extra, botao) {
    return { id: id, html: '<div class="hero g2c-s g2c-' + tema + '" data-g2c-id="' + id + '">' +
      '<svg class="g2c-ic" viewBox="0 0 24 24" aria-hidden="true">' + (ICONES[tema] || '') + '</svg>' +
      '<small>' + peq + '</small><div class="big">' + grande + '</div>' + (linha ? '<div class="mt">' + linha + '</div>' : '') + (extra || '') +
      (botao ? '<div class="acts"><button class="hbtn w" data-a="' + botao[1] + '"' + (botao[2] != null ? ' data-v="' + esc(botao[2]) + '"' : '') + '>' + botao[0] + '</button></div>' : '') + '</div>' };
  }
  function montarSlides(temAgenda) {
    var l = [], cu = proximoCulto();
    // Palavra do culto
    if (cu && (cu.tituloPalavra || cu.tema || cu.pregador)) {
      l.push(slide('palavra', 'palavra', cu.data === hoje() ? 'PALAVRA DE HOJE' : 'PALAVRA DO PRÓXIMO CULTO',
        esc(cu.tituloPalavra || cu.tema || 'Pregação da Palavra'),
        [cu.pregador ? 'Com ' + esc(cu.pregador) : '', esc(quando(cu.data, cu.inicio))].filter(Boolean).join(' · '), '',
        temAgenda ? ['Ver culto', 'aba', 'cultos'] : null));
    }
    // Agenda dos próximos 7 dias
    var lim = parse(hoje()); lim.setDate(lim.getDate() + 7); var limIso = iso(lim);
    var prox = eventos().filter(function (e) { return e.data >= hoje() && e.data <= limIso && (!cu || e.id !== cu.id); }).sort(ordena).slice(0, 3);
    if (prox.length) {
      l.push(slide('agenda', 'agenda', 'AGENDA DOS PRÓXIMOS DIAS', prox.length === 1 ? esc(prox[0].titulo || 'Evento') : prox.length + ' encontros marcados', '',
        '<ul class="g2c-lista">' + prox.map(function (e) { return '<li><b>' + esc(quando(e.data, e.inicio)) + '</b><span>' + esc(e.titulo || 'Evento') + '</span></li>'; }).join('') + '</ul>',
        temAgenda ? ['Abrir agenda', 'aba', 'cultos'] : null));
    }
    // Aniversariantes
    var aniv = pessoasAtivas().map(function (p) { return { p: p, d: aniversarioEm(p) }; }).filter(function (x) { return x.d !== null; })
      .sort(function (a, b) { return a.d - b.d; });
    if (aniv.length) {
      var nomes = aniv.slice(0, 3).map(function (x) {
        var dd = new Date(); dd.setDate(dd.getDate() + x.d);
        return esc(chamado(x.p)) + ' <span class="g2c-dim">(' + (x.d === 0 ? 'hoje' : x.d === 1 ? 'amanhã' : DIAS[dd.getDay()].toLowerCase()) + ')</span>';
      }).join(' · ') + (aniv.length > 3 ? ' <span class="g2c-dim">e mais ' + (aniv.length - 3) + '</span>' : '');
      l.push(slide('aniver', 'aniver', 'ANIVERSARIANTES DA SEMANA', aniv[0].d === 0 ? 'Hoje tem aniversário! \uD83C\uDF82' : aniv.length + ' aniversariante' + (aniv.length > 1 ? 's' : '') + ' \uD83C\uDF89', nomes));
    }
    // Novos rostos (só número)
    var corte = new Date(); corte.setDate(corte.getDate() - 7); var corteIso = iso(corte);
    var novos = pessoasAtivas().filter(function (p) { var d = p.visitaIgrejaEm || p.prim || ''; return p.status === 'Em visita' && d >= corteIso && d <= hoje(); }).length;
    if (novos) l.push(slide('novos', 'novos', 'NOVOS ROSTOS', novos + ' visitante' + (novos > 1 ? 's chegaram' : ' chegou') + ' nesta semana',
      'Uma mensagem de boas-vindas faz toda a diferença.'));
    // Passagem da semana
    var ps = PASSAGENS[semanaDoAno() % PASSAGENS.length];
    l.push(slide('passagem', 'passagem', 'PASSAGEM DA SEMANA', esc(ps[0]), esc(ps[1])));
    return l;
  }

  var CSS = '.g2c{position:relative;display:grid}.g2c>.hero{grid-area:1/1;margin:0!important;transition:opacity .55s ease,visibility .55s;opacity:0;visibility:hidden;position:relative;overflow:hidden}' +
    '.g2c>.hero.on{opacity:1;visibility:visible}.g2c .g2c-ic{position:absolute;right:-14px;bottom:-18px;width:130px;height:130px;fill:none;stroke:currentColor;stroke-width:1.2;opacity:.13;pointer-events:none}' +
    '.g2c-palavra{background:linear-gradient(135deg,#0B2A6B,#0E7C7B)!important;color:#fff}.g2c-agenda{background:linear-gradient(135deg,#14161A,#2F5BEA)!important;color:#fff}' +
    '.g2c-aniver{background:linear-gradient(135deg,#7C3A8C,#DB2777)!important;color:#fff}.g2c-novos{background:linear-gradient(135deg,#0E7C7B,#16A36A)!important;color:#fff}' +
    '.g2c-passagem{background:linear-gradient(135deg,#1E293B,#8A5B00)!important;color:#fff}.g2c .g2c-dim{opacity:.75;font-weight:500}' +
    '.g2c-lista{list-style:none;margin:8px 0 0;padding:0;font-size:13px;line-height:1.6}.g2c-lista li{display:flex;gap:8px;flex-wrap:wrap}.g2c-lista b{min-width:96px}' +
    '.g2c-dots{position:absolute;top:16px;right:18px;display:flex;gap:6px;z-index:2}.g2c-dots button{width:8px;height:8px;padding:0;border:0;border-radius:99px;background:rgba(255,255,255,.4);cursor:pointer;transition:width .3s,background .3s}' +
    '.g2c-dots button.on{width:22px;background:#fff}.g2c-dots button:focus-visible{outline:2px solid #fff;outline-offset:2px}' +
    '@media (prefers-reduced-motion:reduce){.g2c>.hero,.g2c-dots button{transition:none}}';
  function estilo() { if ($('g2c-css')) return; var s = document.createElement('style'); s.id = 'g2c-css'; s.textContent = CSS; document.head.appendChild(s); }

  var atualId = null, timer = null, pausado = false, reduz = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function ir(w, alvo) {
    var sl = w.querySelectorAll(':scope > .hero'), n = sl.length; if (!n) return;
    alvo = ((alvo % n) + n) % n;
    for (var i = 0; i < n; i++) {
      var on = i === alvo; sl[i].classList.toggle('on', on); sl[i].setAttribute('aria-hidden', on ? 'false' : 'true');
      if (on) sl[i].removeAttribute('inert'); else sl[i].setAttribute('inert', '');
    }
    var ds = w.querySelectorAll('.g2c-dots button'); for (var j = 0; j < ds.length; j++) { ds[j].classList.toggle('on', j === alvo); ds[j].setAttribute('aria-current', j === alvo ? 'true' : 'false'); }
    atualId = sl[alvo].getAttribute('data-g2c-id'); w.setAttribute('data-idx', alvo);
  }
  function idx(w) { return +w.getAttribute('data-idx') || 0; }
  function relogio() {
    if (timer || reduz) return;
    timer = setInterval(function () {
      var w = document.querySelector('.g2c');
      if (!w) { clearInterval(timer); timer = null; return; }
      if (!pausado && !document.hidden) ir(w, idx(w) + 1);
    }, 8000);
  }
  function melhorar() {
    var main = $('main'); if (!main || !main.querySelector('.ini-ola')) return;
    var hero = main.querySelector('.hero:not(.g2c-s):not([data-g2c-id])'); if (!hero || hero.closest('.g2c')) return;
    var temAgenda = !!hero.querySelector('[data-a="aba"][data-v="cultos"]');
    var extras; try { extras = montarSlides(temAgenda); } catch (e) { console.warn('[2Gather][destaque]', e); return; }
    if (!extras.length) return;
    estilo();
    var mb = getComputedStyle(hero).marginBottom;
    var w = document.createElement('div'); w.className = 'g2c'; w.style.marginBottom = mb;
    w.setAttribute('role', 'region'); w.setAttribute('aria-roledescription', 'carrossel'); w.setAttribute('aria-label', 'Destaques');
    hero.parentNode.insertBefore(w, hero);
    hero.setAttribute('data-g2c-id', 'principal'); w.appendChild(hero);
    extras.forEach(function (s) { w.insertAdjacentHTML('beforeend', s.html); });
    var total = extras.length + 1, dots = document.createElement('div'); dots.className = 'g2c-dots';
    for (var i = 0; i < total; i++) { var b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', 'Destaque ' + (i + 1) + ' de ' + total); b.setAttribute('data-i', i); dots.appendChild(b); }
    w.appendChild(dots);
    dots.addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (b) ir(w, +b.getAttribute('data-i')); });
    w.addEventListener('pointerenter', function () { pausado = true; });
    w.addEventListener('pointerleave', function () { pausado = false; });
    w.addEventListener('focusin', function () { pausado = true; });
    w.addEventListener('focusout', function () { pausado = false; });
    var x0 = null;
    w.addEventListener('pointerdown', function (ev) { x0 = ev.clientX; });
    w.addEventListener('pointerup', function (ev) { if (x0 === null) return; var dx = ev.clientX - x0; x0 = null; if (Math.abs(dx) > 45) ir(w, idx(w) + (dx < 0 ? 1 : -1)); });
    w.addEventListener('keydown', function (ev) { if (ev.key === 'ArrowRight') ir(w, idx(w) + 1); else if (ev.key === 'ArrowLeft') ir(w, idx(w) - 1); });
    var ini = 0, sl = w.querySelectorAll(':scope > .hero');
    for (var k = 0; k < sl.length; k++) if (sl[k].getAttribute('data-g2c-id') === atualId) ini = k;   // re-render mantém o quadro atual
    ir(w, ini); relogio();
  }
  var agendado = false;
  function agendar() { if (agendado) return; agendado = true; requestAnimationFrame(function () { agendado = false; melhorar(); }); }
  function observar() {
    var main = $('main'); if (!main) return setTimeout(observar, 300);
    new MutationObserver(agendar).observe(main, { childList: true, subtree: true });
    agendar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observar); else observar();
})();
