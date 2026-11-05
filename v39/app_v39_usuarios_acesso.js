/* 2Gather v39 · Pedidos de acesso (aprovar novos usuários) · USUARIOS-1
   Carregar DEPOIS do app.js (e do app_v39_cadastro_acesso.js).
   1) Master/pastor (quem tem a permissão de aprovar no banco) vê os cadastros aguardando
      liberação nas abas Avisos e Pessoas, com aviso no topo e contador.
   2) Aprovar (com CPF, perfil e GC), pedir correção ou recusar, usando as funções oficiais:
      list_access_requests, approve_access_request, request_access_correction, reject_access_request.
   3) Novo usuário que tenta entrar antes da liberação recebe a mensagem
      "cadastro aguardando aprovação" (ou "confirme seu e-mail", quando for o caso).
   Não altera o app.js. */
(function () {
  'use strict';
  var VERSAO = 'USUARIOS-1';
  var ABAS_AVISO = ['avisos', 'alertas', 'mural', 'pessoas', 'membros', 'usuarios', 'equipe', 'inicio', 'painel'];
  var pendentes = [], nomes = {}, perfis = [], podeAprovar = null, carregando = false, ultimaCarga = 0;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function G() { return window.__gc || null; }
  function cfg() { var g = G(); return (g && g.cfg()) || {}; }
  function igrejaId() { var c = cfg(); return c.usuario && c.usuario.igrejaId; }
  function logado() { var c = cfg(); return c.token === 'supabase-v39' && !!igrejaId(); }
  function soDig(s) { return String(s || '').replace(/\D/g, ''); }
  function dataBr(s) { if (!s) return ''; var d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  function toast(msg, ms) { var t = $('toast'); if (!t) { alert(msg); return; } t.textContent = msg; t.style.display = 'block'; clearTimeout(toast._t); toast._t = setTimeout(function () { t.style.display = 'none'; }, ms || 4000); }

  function cpfValido(c) {
    c = soDig(c); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
    for (var t = 9; t < 11; t++) { var s = 0; for (var i = 0; i < t; i++) s += +c[i] * (t + 1 - i); if (((s * 10) % 11) % 10 !== +c[t]) return false; }
    return true;
  }

  var MSG = {
    ACCESS_ACCOUNT_CPF_REQUIRED: 'Informe um CPF válido para liberar o acesso.',
    PERSON_CPF_MISMATCH: 'Esta pessoa já tem outro CPF cadastrado. Confira o número.',
    ACCESS_REQUEST_NOT_PENDING: 'Este pedido já foi decidido por outra pessoa. A lista foi atualizada.',
    ACCESS_REQUEST_INCOMPLETE: 'Este pedido está incompleto (sem usuário de acesso). Peça para a pessoa se cadastrar de novo.',
    PROFILE_NOT_AVAILABLE: 'O perfil escolhido não está disponível.',
    PERSON_CONFIRMATION_REQUIRED: 'Não foi possível confirmar a pessoa deste pedido.',
    PERSON_NOT_IN_CHURCH: 'A pessoa não está vinculada a esta igreja.',
    GC_SCOPE_INVALID: 'O GC escolhido não pertence a esta igreja.',
    REASON_REQUIRED: 'Informe o motivo.',
    PERMISSION_DENIED: 'Você não tem permissão para liberar acessos.',
    'Somente Master': 'Somente um Master pode dar o perfil Master.'
  };
  function traduz(e) {
    var t = String((e && (e.details || e.message || e.code)) || e || '');
    for (var k in MSG) if (t.indexOf(k) >= 0) return MSG[k];
    if (/autoriza|permiss/i.test(t)) return MSG.PERMISSION_DENIED;
    if (/duplicate|unique/i.test(t)) return 'Este usuário ou CPF já está em uso por outra conta.';
    return 'Não foi possível concluir. Tente novamente.';
  }

  function app() {
    var V = window.G2_V39 || {};
    var pronto = (!V.client && typeof V.init === 'function') ? Promise.resolve(V.init()) : Promise.resolve();
    return pronto.then(function () { if (!V.client) throw new Error('Sem conexão com o servidor.'); return V.client.schema('app'); });
  }
  function rpc(nome, args) {
    return app().then(function (b) { return (b.__rpcOriginal || b.rpc).call(b, nome, args || {}); })
      .then(function (r) { if (r.error) throw r.error; return r.data; });
  }
  function lista(x) { return Array.isArray(x) ? x : (x && Array.isArray(x.items) ? x.items : []); }

  function nomePerfil(p) {
    var m = { master: 'Master', pastor: 'Pastor', supervisor: 'Supervisor', leader: 'Líder', disciple: 'Discípulo', secretary: 'Secretaria',
              treasury: 'Tesouraria', volunteer: 'Voluntário', life_home_volunteer: 'Voluntário Lar de Vida',
              institute_volunteer: 'Voluntário Instituto', health_professional: 'Profissional de saúde' };
    return p ? (p.name || m[p.code] || p.code) : '';
  }
  function perfilPorId(id) { for (var i = 0; i < perfis.length; i++) if (perfis[i].id === id) return perfis[i]; return null; }
  function gcNome(id) { var g = G(), d = g && g.db(); var l = (d && d.gcs) || []; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i].nome; return ''; }

  /* ── carga dos pedidos ── */
  function carregar(forcar) {
    if (!logado() || carregando) return Promise.resolve();
    if (!forcar && Date.now() - ultimaCarga < 60000) return Promise.resolve();
    carregando = true;
    return rpc('list_access_requests', { p_church_id: igrejaId(), p_status: null, p_limit: 100, p_offset: 0 })
      .then(function (l) {
        podeAprovar = true;
        pendentes = lista(l).filter(function (r) { return ['pending', 'under_review', 'correction_requested'].indexOf(r.status) >= 0; });
        var ids = pendentes.map(function (r) { return r.person_id; }).filter(Boolean);
        var p1 = ids.length ? app().then(function (b) { return b.from('people').select('id,full_name,preferred_name').in('id', ids); })
          .then(function (r) { (r.data || []).forEach(function (p) { nomes[p.id] = p.full_name || p.preferred_name; }); }).catch(function () {}) : Promise.resolve();
        var p2 = perfis.length ? Promise.resolve() : app().then(function (b) { return b.from('access_profiles').select('id,code,name,is_active').eq('is_active', true); })
          .then(function (r) { perfis = (r.data || []).filter(function (p) { return p.code !== 'master'; }); }).catch(function () {});
        return Promise.all([p1, p2]);
      })
      .catch(function (e) { if (/autoriza|permiss|PERMISSION/i.test(String(e && (e.message || e.details)))) podeAprovar = false; else console.warn('[2Gather][acessos]', e); })
      .then(function () { carregando = false; ultimaCarga = Date.now(); pintar(); });
  }

  /* ── aviso nas abas Avisos e Pessoas ── */
  function pintar() {
    var main = $('main'), velho = $('g2-acessos');
    if (velho) velho.remove();
    if (!main || !podeAprovar || !pendentes.length) return;
    var aba = String(cfg().aba || '').toLowerCase();
    if (ABAS_AVISO.indexOf(aba) < 0) return;
    var n = pendentes.length;
    var card = document.createElement('div');
    card.id = 'g2-acessos'; card.className = 'card';
    card.style.cssText = 'border-left:4px solid #b7791f;background:#fff8e6;margin-bottom:12px;cursor:pointer';
    card.innerHTML = '<div style="display:flex;align-items:center;gap:10px">' +
      '<div style="font-size:22px">🔔</div><div style="flex:1"><div style="font-weight:700">' + n + (n === 1 ? ' cadastro aguardando liberação' : ' cadastros aguardando liberação') + '</div>' +
      '<div style="font-size:12.5px;color:#7a5a12">Toque para ver e liberar o acesso.</div></div>' +
      '<div style="background:#b7791f;color:#fff;border-radius:999px;min-width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-weight:700">' + n + '</div></div>';
    card.addEventListener('click', abrirLista);
    main.insertBefore(card, main.firstChild);
  }

  /* ── janelas próprias (não interferem no modal do app) ── */
  function janela(html) {
    fecharJanela();
    var o = document.createElement('div'); o.id = 'g2-acessos-modal';
    o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:flex-end;justify-content:center';
    o.innerHTML = '<div style="background:var(--bg,#fff);color:inherit;width:100%;max-width:560px;max-height:90vh;overflow:auto;border-radius:16px 16px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom))">' + html + '</div>';
    o.addEventListener('click', function (ev) { if (ev.target === o) fecharJanela(); });
    document.body.appendChild(o);
    return o;
  }
  function fecharJanela() { var o = $('g2-acessos-modal'); if (o) o.remove(); }

  function abrirLista() {
    var h = '<h2 style="margin:0 0 4px">Cadastros aguardando liberação</h2>' +
      '<div style="font-size:12.5px;color:#888;margin-bottom:12px">Confira os dados antes de liberar. Para liberar é preciso informar o CPF da pessoa.</div>';
    if (!pendentes.length) h += '<div class="card"><div class="empty">Nenhum cadastro aguardando.</div></div>';
    pendentes.forEach(function (r, i) {
      var p = perfilPorId(r.requested_profile_id);
      h += '<div class="card" style="margin-bottom:10px"><div style="font-weight:700">' + esc(nomes[r.person_id] || r.requested_username || 'Sem nome') + '</div>' +
        '<div style="font-size:12.5px;color:#666;line-height:1.5">Usuário: <b>' + esc(r.requested_username || '—') + '</b><br>' +
        'E-mail: ' + esc(r.email || '—') + '<br>Função pedida: ' + esc(nomePerfil(p) || '—') +
        (r.requested_gc_id ? '<br>GC: ' + esc(gcNome(r.requested_gc_id) || '—') : '') +
        (r.request_notes ? '<br>Observação: ' + esc(r.request_notes) : '') +
        '<br>Enviado em ' + esc(dataBr(r.requested_at || r.created_at)) +
        (r.status === 'correction_requested' ? '<br><b style="color:#b7791f">Correção pedida:</b> ' + esc(r.decision_reason || '') : '') + '</div>' +
        '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' +
        '<button class="btn pr sm" data-g2acao="liberar" data-i="' + i + '">Liberar acesso</button>' +
        (r.status !== 'correction_requested' ? '<button class="btn gh sm" data-g2acao="corrigir" data-i="' + i + '">Pedir correção</button>' : '') +
        '<button class="btn dg sm" data-g2acao="recusar" data-i="' + i + '">Recusar</button></div></div>';
    });
    h += '<button class="btn gh" data-g2acao="fechar" style="width:100%;margin-top:6px">Fechar</button>';
    var o = janela(h);
    o.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-g2acao]'); if (!b) return;
      var a = b.getAttribute('data-g2acao'), r = pendentes[+b.getAttribute('data-i')];
      if (a === 'fechar') return fecharJanela();
      if (a === 'liberar') return abrirLiberar(r);
      if (a === 'corrigir' || a === 'recusar') return decidir(r, a);
    });
  }

  function abrirLiberar(r) {
    var gcs = ((G() && G().db().gcs) || []).filter(function (g) { return !g.deleted && g.status !== 'Inativo'; });
    var optsPerfil = perfis.slice().sort(function (a, b) { return nomePerfil(a).localeCompare(nomePerfil(b), 'pt-BR'); })
      .map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === r.requested_profile_id ? ' selected' : '') + '>' + esc(nomePerfil(p)) + '</option>'; }).join('');
    if (!optsPerfil && r.requested_profile_id) optsPerfil = '<option value="' + esc(r.requested_profile_id) + '">Função pedida</option>';
    var optsGc = '<option value="">Sem GC</option>' + gcs.map(function (g) { return '<option value="' + esc(g.id) + '"' + (g.id === r.requested_gc_id ? ' selected' : '') + '>' + esc(g.nome) + '</option>'; }).join('');
    var o = janela('<h2 style="margin:0 0 4px">Liberar acesso</h2>' +
      '<div style="font-size:13px;color:#666;margin-bottom:10px">' + esc(nomes[r.person_id] || r.requested_username) + ' · usuário <b>' + esc(r.requested_username) + '</b></div>' +
      '<label>CPF *</label><input id="g2a-cpf" inputmode="numeric" maxlength="14" placeholder="000.000.000-00" autocomplete="off">' +
      '<label>Perfil de acesso *</label><select id="g2a-perfil">' + optsPerfil + '</select>' +
      '<label>GC</label><select id="g2a-gc">' + optsGc + '</select>' +
      '<div style="font-size:11.5px;color:#999;margin:6px 0 2px">Se o perfil for Líder e o GC estiver sem líder, a pessoa já entra como líder do GC.</div>' +
      '<div id="g2a-erro" style="display:none;color:#a12424;background:#fdecec;border-radius:8px;padding:8px;margin-top:8px;font-size:13px"></div>' +
      '<div style="height:12px"></div><button class="btn pr" id="g2a-ok" style="width:100%">Liberar acesso</button>' +
      '<div class="gap"></div><button class="btn gh" id="g2a-voltar" style="width:100%">Voltar</button>');
    var cpf = o.querySelector('#g2a-cpf');
    cpf.addEventListener('input', function () {
      var d = soDig(cpf.value).slice(0, 11);
      cpf.value = d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
    });
    o.querySelector('#g2a-voltar').addEventListener('click', abrirLista);
    o.querySelector('#g2a-ok').addEventListener('click', function () {
      var erro = o.querySelector('#g2a-erro');
      function falha(m) { erro.textContent = m; erro.style.display = 'block'; }
      if (!cpfValido(cpf.value)) return falha('Informe um CPF válido.');
      var perfil = o.querySelector('#g2a-perfil').value; if (!perfil) return falha('Escolha o perfil de acesso.');
      var btn = this; btn.disabled = true; btn.textContent = 'Liberando...';
      rpc('approve_access_request', { p_request_id: r.id, p_confirmed_person_id: r.person_id, p_cpf: soDig(cpf.value),
          p_profile_id: perfil, p_gc_id: o.querySelector('#g2a-gc').value || null, p_church_person_status: 'member', p_reason: 'Liberado pelo app' })
        .then(function () {
          fecharJanela(); toast('Acesso liberado ✓ ' + (nomes[r.person_id] || r.requested_username) + ' já pode entrar com o usuário ' + r.requested_username + '.', 6000);
          carregar(true); var g = G(); if (g && g.sincronizar) g.sincronizar(false);
        })
        .catch(function (e) { console.warn('[2Gather][acessos] aprovar', e); falha(traduz(e)); if (/NOT_PENDING/.test(String(e && (e.details || e.message)))) carregar(true); })
        .then(function () { btn.disabled = false; btn.textContent = 'Liberar acesso'; });
    });
  }

  function decidir(r, tipo) {
    var corrigir = tipo === 'corrigir';
    var motivo = prompt(corrigir ? 'O que a pessoa precisa corrigir?' : 'Motivo da recusa (a pessoa não terá acesso):', '');
    if (motivo === null) return;
    motivo = String(motivo).trim(); if (motivo.length < 3) return toast('Informe o motivo com pelo menos 3 caracteres.');
    rpc(corrigir ? 'request_access_correction' : 'reject_access_request', { p_access_request_id: r.id, p_reason: motivo })
      .then(function () { toast(corrigir ? 'Correção pedida ✓' : 'Cadastro recusado.'); return carregar(true); })
      .then(function () { if ($('g2-acessos-modal')) abrirLista(); })
      .catch(function (e) { toast(traduz(e), 5000); });
  }

  /* ── tela de login: cadastro ainda não liberado ── */
  var CHAVE = 'g2_cadastro_pendente';
  function guardarPendente(u) { try { if (u) localStorage.setItem(CHAVE, String(u).toLowerCase()); } catch (e) {} }
  function usuarioPendente() { try { return localStorage.getItem(CHAVE) || ''; } catch (e) { return ''; } }
  function limparPendente() { try { localStorage.removeItem(CHAVE); } catch (e) {} }

  function msgLogin(texto) {
    var t = String(texto || ''); if (!t) return t;
    var u = (($('l-usuario') || {}).value || '').trim().toLowerCase();
    if (/email not confirmed|e-mail n[aã]o confirmado|confirm/i.test(t))
      return 'Confirme seu e-mail antes de entrar: abra a mensagem que enviamos e toque no link. Depois disso, seu cadastro ainda precisa ser liberado pela liderança.';
    if (/aguard|pendente|pending|aprova|n[aã]o liberad|not approved|sem acesso|inativ/i.test(t))
      return 'Seu cadastro foi recebido e está aguardando aprovação da liderança. Assim que for liberado, você consegue entrar com este usuário e senha.';
    if (u && u === usuarioPendente() && /inv[aá]lid|incorret|n[aã]o encontrad|credenciais|invalid/i.test(t))
      return 'Seu cadastro foi recebido e está aguardando aprovação da liderança. Assim que for liberado, você consegue entrar com este usuário e senha. Se já foi liberado, confira a senha.';
    return t;
  }
  function vigiarLogin() {
    var el = $('l-erro'); if (!el || el.__g2) return !!el;
    el.__g2 = true; var trocando = false;
    new MutationObserver(function () {
      if (trocando) return; var a = el.textContent, b = msgLogin(a);
      if (b !== a) { trocando = true; el.textContent = b; trocando = false; }
    }).observe(el, { childList: true, characterData: true, subtree: true });
    return true;
  }
  function vigiarCadastroOk() {
    var ok = $('cad-ok'); if (!ok || ok.__g2) return !!ok;
    ok.__g2 = true;
    new MutationObserver(function () {
      if (ok.classList.contains('hide')) return;
      guardarPendente(($('l-usuario') || {}).value);
      if (!$('g2-aviso-aprov')) {
        var p = document.createElement('div'); p.id = 'g2-aviso-aprov';
        p.style.cssText = 'background:#fff8e6;border-left:4px solid #b7791f;border-radius:8px;padding:10px;margin:10px 0;font-size:13.5px;text-align:left';
        p.innerHTML = '<b>Próximos passos</b><br>1. Abra seu e-mail e toque no link de confirmação.<br>2. Aguarde a liderança liberar o seu acesso.<br>3. Depois de liberado, entre com o usuário e a senha que você criou.';
        ok.insertBefore(p, ok.children[1] || null);
      }
    }).observe(ok, { attributes: true, attributeFilter: ['class'] });
    return true;
  }

  /* ── ligação ── */
  var n = 0, t = setInterval(function () { var a = vigiarLogin(), b = vigiarCadastroOk(); if ((a && b) || ++n > 60) clearInterval(t); }, 300);
  var mainObs = null;
  setInterval(function () {
    if (!logado()) { pendentes = []; podeAprovar = null; return; }
    if (usuarioPendente()) limparPendente();               // entrou: o cadastro foi liberado
    if (!mainObs && $('main')) { mainObs = new MutationObserver(function () { if (!$('g2-acessos')) pintar(); }); mainObs.observe($('main'), { childList: true }); }
    if (podeAprovar !== false) carregar(false);
  }, 2000);
  setInterval(function () { if (logado() && podeAprovar) carregar(true); }, 120000);

  window.G2_USUARIOS = { versao: VERSAO, abrir: function () { carregar(true).then(abrirLista); }, recarregar: function () { return carregar(true); } };
})();
