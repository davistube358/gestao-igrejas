/* 2Gather v39 · Setores no módulo GCs · SETOR-1
   Carregar DEPOIS do app.js (e de app_v39_correcoes.js). Não altera o app.js. Requer v39_setores.sql.
   - Módulo GCs: quadro "Setores" (master/pastor criam e editam; supervisor vê o próprio setor),
     filtro por setor e a linha "Setor" em cada GC.
   - Editar/Novo GC: campo "Setor" no lugar de "Supervisor" (o supervisor vem do setor).
   - Supervisor só recebe os GCs dos seus setores (e os relatórios ficam restritos a eles). */
(function () {
  'use strict';
  var VERSAO = 'SETOR-1';
  var setores = [], porGc = {}, carregado = false, filtroSetor = '', ultimoGC = '';
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function G() { return window.__gc || null; }
  function cfg() { var g = G(); return (g && g.cfg()) || {}; }
  function db() { var g = G(); return g ? g.db() : null; }
  function eu() { return cfg().usuario || {}; }
  function papel() { return String(eu().papel || ''); }
  function gestor() { return papel() === 'master' || papel() === 'pastor'; }
  function supervisor() { return papel() === 'supervisor'; }
  function igrejaId() { return eu().igrejaId; }
  function v39() { return cfg().token === 'supabase-v39'; }
  function lista(x) { return Array.isArray(x) ? x : (x && Array.isArray(x.items) ? x.items : []); }
  function toast(msg, ms) { setTimeout(function () { var t = $('toast'); if (!t) return; t.textContent = msg; t.style.display = 'block'; clearTimeout(toast._t); toast._t = setTimeout(function () { t.style.display = 'none'; }, ms || 5000); }, 3200); }
  function rpc(nome, args) {
    var V = window.G2_V39 || {};
    var pr = (!V.client && typeof V.init === 'function') ? Promise.resolve(V.init()) : Promise.resolve();
    return pr.then(function () { if (!V.client) throw new Error('Sem conexão com o servidor.'); var b = V.client.schema('app'); return (b.__rpcOriginal || b.rpc).call(b, nome, args || {}); })
      .then(function (r) { if (r.error) throw r.error; return r.data; });
  }
  var MSG = { SECTOR_NAME_REQUIRED: 'Informe o nome do setor.', SECTOR_SUPERVISOR_INVALID: 'O supervisor escolhido precisa ter o perfil Supervisor.',
    SECTOR_CONFLICT: 'Já existe um setor com este nome.', SECTOR_NOT_FOUND: 'Setor não encontrado. Atualize a página.',
    PERMISSION_DENIED: 'Você não tem permissão para esta alteração de setor.', GC_NOT_FOUND: 'GC não encontrado. Atualize a página.' };
  function traduz(e) { var t = String((e && (e.details || e.message || e.code)) || e || ''); for (var k in MSG) if (t.indexOf(k) >= 0) return MSG[k];
    return /PGRST202|find the function/i.test(t) ? 'Rode o v39_setores.sql no Supabase.' : 'Não foi possível concluir. Tente novamente.'; }
  function meus() { return setores.filter(function (s) { return s.meu; }).map(function (s) { return s.id; }); }

  /* ── dados ── */
  function carregar() {
    if (!v39() || !igrejaId()) return Promise.resolve();
    return rpc('v39_list_sectors', { p_church_id: igrejaId() }).then(function (l) {
      setores = lista(l); porGc = {};
      setores.forEach(function (s) { (s.gcs || []).forEach(function (id) { porGc[id] = s; }); });
      carregado = true; aplicar();
    }).catch(function (e) { console.warn('[2Gather][setores] ' + traduz(e), e); });
  }
  function aplicar(gcs) {
    var d = db(); (gcs || (d && d.gcs) || []).forEach(function (g) {
      var s = porGc[g.id]; g.setorId = s ? s.id : ''; g.setorNome = s ? s.nome : '';
      if (s) { g.supervisorId = s.supervisorId || ''; g.supervisorNome = s.supervisorNome || ''; }
    });
  }
  function filtrar(gcs) {
    if (!supervisor() || !carregado) return gcs;
    var m = meus(); return (gcs || []).filter(function (g) { var s = porGc[g.id]; return s && m.indexOf(s.id) >= 0; });
  }

  /* ── ganchos ── */
  function instalar() {
    var V = window.G2_V39; if (!V || !V.p13 || !V.p1) return false;
    if (typeof V.p13.hydrate === 'function' && !V.p13.__g2setor) {
      var h = V.p13.hydrate;
      V.p13.hydrate = function () {
        var a = arguments;
        return carregar().then(function () { return h.apply(V.p13, a); }).then(function (r) {
          if (r && r.gcs) { aplicar(r.gcs); r.gcs = filtrar(r.gcs); }
          return r;
        });
      };
      V.p13.__g2setor = true;
    }
    if (typeof V.p1.execute === 'function' && !V.p1.__g2setor) {
      var ex = V.p1.execute;
      V.p1.execute = function (acao, dados, prog) {
        var sel = acao === 'salvarGC' ? $('g-setor') : null, escolha = sel ? sel.value : null;
        var gc = (dados && dados.gc) || {};
        if (sel && v39() && supervisor() && !gc.deleted && !escolha) return Promise.reject(new Error('Escolha o setor do GC.'));
        return Promise.resolve(ex.call(V.p1, acao, dados, prog)).then(function (r) {
          if (!sel || gc.deleted) return r;
          var id = gc.id || (r && r.gc && r.gc.id), atual = (porGc[id] && porGc[id].id) || '';
          if (!id || escolha === atual) return r;
          return rpc('v39_set_gc_sector', { p_church_id: igrejaId(), p_gc_id: id, p_sector_id: escolha || null })
            .then(function () { return carregar(); }, function (e) { toast('Os dados do GC foram salvos, mas o setor não: ' + traduz(e), 7000); })
            .then(function () { if (r && r.gc) { var s = porGc[id]; r.gc.setorId = s ? s.id : ''; r.gc.setorNome = s ? s.nome : ''; } return r; });
        });
      };
      V.p1.__g2setor = true;
    }
    return true;
  }
  var n = 0, t = setInterval(function () { if (instalar() || ++n > 240) clearInterval(t); }, 250);
  document.addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('[data-a="editarGC"]'); if (b) ultimoGC = b.getAttribute('data-v') || ''; }, true);

  /* ── módulo GCs: quadro de setores, filtro e linha "Setor" ── */
  function quadro() {
    var gcs = ((db() && db().gcs) || []).filter(function (g) { return !g.deleted; });
    var semSetor = gcs.filter(function (g) { return !porGc[g.id]; }).length;
    var h = '<div class="card" id="g2-setores" style="margin-bottom:12px">';
    if (gestor()) {
      h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h3 style="margin:0">Setores (' + setores.length + ')</h3>' +
        '<button type="button" class="btn gh sm" data-g2s="novo" style="width:auto">+ Novo setor</button></div>';
      h += setores.length ? setores.map(function (s) {
        return '<div class="row cl" data-g2s="editar" data-id="' + esc(s.id) + '" style="cursor:pointer"><div class="info"><div class="nm">' + esc(s.nome) +
          (s.status === 'inactive' ? ' <span class="pill p-cinza">inativo</span>' : '') + '</div><div class="sb">Supervisor: ' + esc(s.supervisorNome || 'não definido') +
          (s.pastorNome ? ' · Pastor: ' + esc(s.pastorNome) : '') + ' · ' + (s.gcs || []).length + ' GC(s)</div></div><span style="color:#aaa">›</span></div>';
      }).join('') : '<div class="empty" style="padding:10px">Nenhum setor ainda. Crie o primeiro e escolha o supervisor.</div>';
      if (semSetor) h += '<div class="aviso" style="margin-top:8px;font-size:12.5px">' + semSetor + ' GC(s) sem setor: nenhum supervisor acompanha. Inclua-os num setor.</div>';
    } else if (supervisor()) {
      var m = setores.filter(function (s) { return s.meu; });
      h += m.length ? '<h3 style="margin:0 0 4px">Meu setor</h3>' + m.map(function (s) { return '<div class="sb" style="font-size:13px"><b>' + esc(s.nome) + '</b> · ' + (s.gcs || []).length + ' GC(s)' + (s.pastorNome ? ' · Pastor: ' + esc(s.pastorNome) : '') + '</div>'; }).join('')
        : '<div class="aviso" style="margin:0">Você ainda não está em um setor. Peça ao pastor para incluir você; até lá, nenhum GC aparece aqui.</div>';
    }
    if (setores.length > 1) h += '<label style="margin-top:10px">Filtrar por setor</label><select id="g2-setor-filtro"><option value="">Todos os setores</option>' +
      setores.map(function (s) { return '<option value="' + esc(s.id) + '"' + (filtroSetor === s.id ? ' selected' : '') + '>' + esc(s.nome) + '</option>'; }).join('') +
      (gestor() ? '<option value="__sem__"' + (filtroSetor === '__sem__' ? ' selected' : '') + '>Sem setor</option>' : '') + '</select>';
    return h + '</div>';
  }
  function pintarModulo() {
    var main = $('main'); if (!main || !v39() || !carregado) return;
    if (String(cfg().aba) !== 'gcs' || cfg().modo !== 'ger') return;
    if (!$('g2-setores') && (gestor() || supervisor())) main.insertAdjacentHTML('afterbegin', quadro());
    var cards = main.querySelectorAll('.gccard');
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i], b = c.querySelector('[data-a="abrirGC"]'), id = b && b.getAttribute('data-v'), s = porGc[id];
      if (!c.querySelector('.g2-setor-ln')) {
        var ln = c.querySelector('.ln'), d = document.createElement('div'); d.className = 'ln g2-setor-ln';
        d.innerHTML = '<b>Setor:</b> ' + (s ? esc(s.nome) : '<span style="color:#a87700">sem setor</span>');
        if (ln && ln.parentNode) ln.parentNode.insertBefore(d, ln); else (c.querySelector('.bd') || c).appendChild(d);
      }
      c.style.display = !filtroSetor || (filtroSetor === '__sem__' ? !s : (s && s.id === filtroSetor)) ? '' : 'none';
    }
  }

  /* ── formulário do GC: Setor no lugar de Supervisor ── */
  function pintarForm() {
    var sup = $('g-sup'); if (!sup || $('g-setor') || !v39()) return;
    var esconder = [sup], lab = sup.previousElementSibling;
    while (lab && lab.tagName !== 'LABEL') { esconder.push(lab); lab = lab.previousElementSibling; }
    if (lab) esconder.push(lab);
    if (sup.type === 'hidden' && sup.previousElementSibling && sup.previousElementSibling.tagName === 'INPUT') esconder.push(sup.previousElementSibling);
    esconder.forEach(function (el) { if (el.type !== 'hidden') el.style.display = 'none'; });
    var gcId = $('modal') && $('modal').classList.contains('on') ? ultimoGC : '';
    var atual = (porGc[gcId] && porGc[gcId].id) || '';
    var lst = gestor() ? setores.filter(function (s) { return s.status === 'active' || s.id === atual; }) : setores.filter(function (s) { return s.meu; });
    if (!atual && supervisor() && lst.length === 1) atual = lst[0].id;
    var html = '<label>Setor' + (supervisor() ? ' *' : '') + '</label><select id="g-setor">' + (gestor() ? '<option value="">— sem setor —</option>' : (lst.length ? '' : '<option value="">— você não tem setor —</option>')) +
      lst.map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === atual ? ' selected' : '') + '>' + esc(s.nome) + (s.supervisorNome ? ' · ' + esc(s.supervisorNome) : '') + '</option>'; }).join('') + '</select>' +
      '<div id="g-setor-info" style="font-size:11.5px;color:#888;margin-top:4px">O supervisor do GC é o supervisor do setor.' + (supervisor() && !lst.length ? ' Peça ao pastor para incluir você num setor.' : '') + '</div>';
    sup.insertAdjacentHTML('afterend', html);
    if (!gestor() && !supervisor()) { $('g-setor').disabled = true; }
  }

  /* ── janela de setor (master/pastor) ── */
  function janela(html) {
    fechar(); var o = document.createElement('div'); o.id = 'g2-setor-modal';
    o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:flex-end;justify-content:center';
    o.innerHTML = '<div style="background:var(--bg,#fff);width:100%;max-width:560px;max-height:90vh;overflow:auto;border-radius:16px 16px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom))">' + html + '</div>';
    o.addEventListener('click', function (ev) { if (ev.target === o) fechar(); }); document.body.appendChild(o); return o;
  }
  function fechar() { var o = $('g2-setor-modal'); if (o) o.remove(); }
  function abrirSetor(id) {
    var s = setores.filter(function (x) { return x.id === id; })[0] || { nome: '', status: 'active', notas: '', supervisorId: '', pastorId: '', gcs: [] };
    var eq = (db() && db().equipe) || [];
    var sups = eq.filter(function (u) { return u.papel === 'supervisor'; }), pas = eq.filter(function (u) { return u.papel === 'pastor' || u.papel === 'master'; });
    var gcs = ((db() && db().gcs) || []).filter(function (g) { return !g.deleted; }).sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
    var op = function (l, sel, vazio) { return '<option value="">' + vazio + '</option>' + l.map(function (u) { return '<option value="' + esc(u.id) + '"' + (u.id === sel ? ' selected' : '') + '>' + esc(u.nome) + '</option>'; }).join(''); };
    var o = janela('<h2 style="margin:0 0 8px">' + (id ? 'Editar setor' : 'Novo setor') + '</h2>' +
      '<label>Nome do setor *</label><input id="s-nome" value="' + esc(s.nome) + '" placeholder="Ex.: Setor Norte">' +
      '<label>Supervisor</label><select id="s-sup">' + op(sups, s.supervisorId, '— sem supervisor —') + '</select>' +
      (sups.length ? '' : '<div style="font-size:11.5px;color:#a87700;margin-top:3px">Nenhum usuário com perfil Supervisor. Libere o perfil em Usuários e acessos.</div>') +
      '<label>Pastor responsável (opcional)</label><select id="s-pas">' + op(pas, s.pastorId, '— todos os pastores —') + '</select>' +
      '<div style="font-size:11.5px;color:#999;margin-top:3px">Hoje todos os supervisores respondem ao pastor. O campo fica pronto para quando houver mais de um pastor.</div>' +
      '<label>Situação</label><select id="s-st"><option value="active"' + (s.status === 'active' ? ' selected' : '') + '>Ativo</option><option value="inactive"' + (s.status === 'inactive' ? ' selected' : '') + '>Inativo</option></select>' +
      '<label>GCs do setor</label><div style="border:1.5px solid #e2e2e2;border-radius:11px;padding:2px 10px;max-height:230px;overflow-y:auto">' + (gcs.length ? gcs.map(function (g) {
        var outro = porGc[g.id] && porGc[g.id].id !== id ? porGc[g.id].nome : '';
        return '<label style="display:flex;align-items:center;gap:10px;margin:0;padding:9px 2px;border-bottom:1px solid #f2f2f2;font-size:13.5px;font-weight:600">' +
          '<input type="checkbox" class="s-gc" value="' + esc(g.id) + '" style="width:20px;height:20px;flex:0 0 20px"' + ((s.gcs || []).indexOf(g.id) >= 0 ? ' checked' : '') + '>' +
          '<span style="flex:1">' + esc(g.nome) + (outro ? '<span style="color:#a87700;font-weight:500;font-size:11.5px"> · hoje em ' + esc(outro) + '</span>' : '') + '</span></label>';
      }).join('') : '<div class="empty" style="padding:8px">Nenhum GC.</div>') + '</div>' +
      '<div style="font-size:11.5px;color:#999;margin-top:4px">Marcar um GC que está em outro setor move o GC para este.</div>' +
      '<label>Observações</label><textarea id="s-obs" rows="2">' + esc(s.notas) + '</textarea>' +
      '<div id="s-erro" style="display:none;color:#a12424;background:#fdecec;border-radius:8px;padding:8px;margin-top:8px;font-size:13px"></div>' +
      '<div style="height:12px"></div><button type="button" class="btn pr" id="s-ok" style="width:100%">Salvar setor</button><div class="gap"></div>' +
      '<button type="button" class="btn gh" id="s-x" style="width:100%">Cancelar</button>');
    o.querySelector('#s-x').addEventListener('click', fechar);
    o.querySelector('#s-ok').addEventListener('click', function () {
      var er = o.querySelector('#s-erro'), nome = o.querySelector('#s-nome').value.trim();
      if (nome.length < 2) { er.textContent = 'Informe o nome do setor.'; er.style.display = 'block'; return; }
      var ids = [].map.call(o.querySelectorAll('.s-gc:checked'), function (c) { return c.value; });
      var bt = this; bt.disabled = true; bt.textContent = 'Salvando...';
      rpc('v39_save_sector', { p_church_id: igrejaId(), p_sector_id: id || null, p_reason: 'Setor salvo no app',
        p_payload: { nome: nome, supervisorUser: o.querySelector('#s-sup').value || null, pastorUser: o.querySelector('#s-pas').value || null,
          status: o.querySelector('#s-st').value, notas: o.querySelector('#s-obs').value.trim(), gcIds: ids } })
        .then(function () { fechar(); return carregar(); })
        .then(function () { var g = G(); if (g) { g.render(); g.sincronizar(false); } var x = $('toast'); if (x) { x.textContent = 'Setor salvo ✓'; x.style.display = 'block'; setTimeout(function () { x.style.display = 'none'; }, 3000); } })
        .catch(function (e) { er.textContent = traduz(e); er.style.display = 'block'; bt.disabled = false; bt.textContent = 'Salvar setor'; });
    });
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-g2s]'); if (!b) return;
    ev.preventDefault(); if (!gestor()) return;
    abrirSetor(b.getAttribute('data-g2s') === 'editar' ? b.getAttribute('data-id') : '');
  });
  document.addEventListener('change', function (ev) {
    if (ev.target && ev.target.id === 'g2-setor-filtro') { filtroSetor = ev.target.value; pintarModulo(); }
    if (ev.target && ev.target.id === 'g-setor') { var s = setores.filter(function (x) { return x.id === ev.target.value; })[0], i = $('g-setor-info');
      if (i) i.textContent = s ? 'Supervisor deste setor: ' + (s.supervisorNome || 'não definido') + '.' : 'Sem setor: nenhum supervisor acompanha este GC.'; }
  });
  new MutationObserver(function () { pintarModulo(); pintarForm(); }).observe(document.body, { childList: true, subtree: true });

  /* primeira carga */
  var feitoPara = null;
  setInterval(function () { if (v39() && igrejaId() && feitoPara !== igrejaId() && window.G2_V39 && G2_V39.client) { feitoPara = igrejaId(); carregar().then(function () { var g = G(); if (g) g.render(); }); } }, 800);
  window.G2_SETORES = { versao: VERSAO, recarregar: carregar };
})();
