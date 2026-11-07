/* 2Gather v39 · GC por função no cadastro e na liberação de acesso · ACESSO-GC-1
   Carregar DEPOIS de app_v39_cadastro_acesso.js e app_v39_usuarios_acesso.js. Não altera nenhum deles. Não exige SQL.
   Regra (Diogo, 07/11/2026): Supervisor, Pastor e Master podem atuar em vários GCs (supervisor recebe os GCs pelo Setor;
   pastor e master veem todos). Para essas funções o campo "De qual GC você participa?" some e não é enviado.
   - Tela "Solicitar acesso" (#c-papel / #c-gc)
   - Janela "Liberar acesso" do Master/Pastor (#g2a-perfil / #g2a-gc) */
(function () {
  'use strict';
  if (window.G2_ACESSO_GC) return;
  window.G2_ACESSO_GC = 'ACESSO-GC-1';
  var MULTI = /supervis|pastor|master/i;

  function semAcento(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function textoSel(sel) { var o = sel && sel.options[sel.selectedIndex]; return semAcento((o && o.text) + ' ' + (sel && sel.value)); }
  function rotulo(campo) {
    var l = campo && campo.id ? document.querySelector('label[for="' + campo.id + '"]') : null;
    if (l) return l;
    var p = campo ? campo.previousElementSibling : null;
    return p && p.tagName === 'LABEL' ? p : null;
  }
  function aviso(campo, id, txt) {
    var a = document.getElementById(id);
    if (!a) { a = document.createElement('div'); a.id = id; a.style.cssText = 'font-size:12px;color:#888;margin:6px 0 2px'; a.textContent = txt; campo.parentNode.insertBefore(a, campo.nextSibling); }
    return a;
  }
  function aplicar(funcao, gc, idAviso, extra) {
    if (!funcao || !gc) return;
    var multi = MULTI.test(textoSel(funcao));
    var l = rotulo(gc);
    if (multi) gc.value = '';
    gc.style.display = multi ? 'none' : '';
    if (l) l.style.display = multi ? 'none' : '';
    if (extra) extra.style.display = multi ? 'none' : '';
    aviso(gc, idAviso, 'Supervisor, Pastor e Master não ficam presos a um GC: o supervisor recebe os GCs pelo Setor; pastor e master veem todos.')
      .style.display = multi ? '' : 'none';
  }
  function ligar(idFuncao, idGc, idAviso, achaExtra) {
    var f = document.getElementById(idFuncao), g = document.getElementById(idGc);
    if (!f || !g || f.__g2gc) return;
    f.__g2gc = true;
    var go = function () { aplicar(f, g, idAviso, achaExtra ? achaExtra(g) : null); };
    f.addEventListener('change', go); go();
  }
  // dica "Se o perfil for Líder e o GC estiver sem líder..." da janela de liberação
  function dicaLider(g) { var d = g.nextElementSibling; while (d && d.id === 'g2a-gc-aviso') d = d.nextElementSibling; return d && /GC estiver sem l/i.test(d.textContent) ? d : null; }

  // Antes de enviar o cadastro: garante GC vazio para as funções sem GC (o módulo de cadastro lê #c-gc no clique)
  document.addEventListener('click', function (ev) {
    var b = ev.target && ev.target.closest ? ev.target.closest('#b-cadastrar, #g2a-ok') : null; if (!b) return;
    var f = document.getElementById(b.id === 'b-cadastrar' ? 'c-papel' : 'g2a-perfil');
    var g = document.getElementById(b.id === 'b-cadastrar' ? 'c-gc' : 'g2a-gc');
    if (f && g && MULTI.test(textoSel(f))) g.value = '';
  }, true);

  new MutationObserver(function () {
    ligar('c-papel', 'c-gc', 'c-gc-aviso');
    ligar('g2a-perfil', 'g2a-gc', 'g2a-gc-aviso', dicaLider);
  }).observe(document.documentElement, { childList: true, subtree: true });
  ligar('c-papel', 'c-gc', 'c-gc-aviso');
})();
