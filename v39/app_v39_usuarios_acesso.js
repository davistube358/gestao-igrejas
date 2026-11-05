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
  var VERSAO = 'USUARIOS-4';
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
    PROFILE_LOCKED: 'O perfil Master não pode ser alterado.',
    PERSON_INVALID_FIELD: 'Algum campo está com valor inválido. Confira a data de nascimento e o CEP.',
    PERSON_CONFIRMATION_REQUIRED: 'Não foi possível confirmar a pessoa deste pedido.',
    PERSON_NOT_IN_CHURCH: 'A pessoa não está vinculada a esta igreja.',
    GC_SCOPE_INVALID: 'O GC escolhido não pertence a esta igreja.',
    REASON_REQUIRED: 'Informe o motivo.',
    PERMISSION_DENIED: 'Você não tem permissão para liberar acessos.',
    'Somente Master': 'Esta alteração é restrita ao perfil Master.',
    SELF_CHANGE_DENIED: 'Não é possível alterar o seu próprio acesso.',
    USER_NOT_IN_CHURCH: 'Este usuário não tem acesso a esta igreja.',
    OVERRIDE_INVALID: 'O banco recusou esta alteração de módulo. Avise o administrador do sistema.',
    'Somente Master altera': 'Somente um Master altera o acesso de outro Master.'
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
        var p1 = ids.length ? rpc('v39_access_request_names', { p_church_id: igrejaId() })
          .then(function (m) { for (var k in (m || {})) if (m[k]) nomes[k] = m[k]; })
          .catch(function () { return app().then(function (b) { return b.from('people').select('id,full_name,preferred_name').in('id', ids); })
            .then(function (r) { (r.data || []).forEach(function (p) { nomes[p.id] = p.full_name || p.preferred_name; }); }).catch(function () {}); }) : Promise.resolve();
        var p2 = perfis.length ? Promise.resolve() : rpc('v39_list_access_profiles', {})
          .then(function (l) { perfis = lista(l).filter(function (p) { return p.code !== 'master'; }); })
          .catch(function (e) { console.warn('[2Gather][acessos] perfis: rode v39_acesso_apoio.sql', e); });
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
      if (a === 'fechar') return ehMaster() ? abrirHub() : fecharJanela();
      if (a === 'liberar') return abrirLiberar(r);
      if (a === 'corrigir' || a === 'recusar') return decidir(r, a);
    });
  }

  function abrirLiberar(r) {
    var gcs = ((G() && G().db().gcs) || []).filter(function (g) { return !g.deleted && g.status !== 'Inativo'; });
    var optsPerfil = perfis.slice().sort(function (a, b) { return nomePerfil(a).localeCompare(nomePerfil(b), 'pt-BR'); })
      .map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === r.requested_profile_id ? ' selected' : '') + '>' + esc(nomePerfil(p)) + '</option>'; }).join('');
    if (!optsPerfil && r.requested_profile_id) optsPerfil = '<option value="' + esc(r.requested_profile_id) + '">Função pedida (lista de perfis indisponível)</option>';
    var optsGc = '<option value="">Sem GC</option>' + gcs.map(function (g) { return '<option value="' + esc(g.id) + '"' + (g.id === r.requested_gc_id ? ' selected' : '') + '>' + esc(g.nome) + '</option>'; }).join('');
    var o = janela('<h2 style="margin:0 0 4px">Liberar acesso</h2>' +
      '<div style="font-size:13px;color:#666;margin-bottom:10px">' + esc(nomes[r.person_id] || r.requested_username) + ' · usuário <b>' + esc(r.requested_username) + '</b></div>' +
      '<label>CPF *</label><input id="g2a-cpf" inputmode="numeric" maxlength="14" placeholder="000.000.000-00" autocomplete="off">' +
      '<div style="background:var(--bg,#F0F1F4);border-radius:10px;padding:9px 11px;margin:10px 0 2px;font-size:13px">Função pedida no cadastro: <b>' +
        esc(nomePerfil(perfilPorId(r.requested_profile_id)) || 'não informada') + '</b><br><span style="color:#888;font-size:12px">Já vem selecionada abaixo. Mantenha ou escolha outro perfil.</span></div>' +
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


  /* ═══════════ USUÁRIOS E ACESSOS (usuários ativos) ═══════════ */
  var MODULOS = { gc: 'GCs', gcs: 'GCs', people: 'Pessoas', pessoas: 'Pessoas', events: 'Cultos e eventos', worship: 'Cultos', agenda: 'Agenda',
    finance: 'Financeiro', financeiro: 'Financeiro', institute: 'Instituto', instituto: 'Instituto', life_home: 'Lar de Vida', lar: 'Lar de Vida',
    access: 'Usuários e acessos', users: 'Usuários e acessos', reports: 'Relatórios', relatorios: 'Relatórios', announcements: 'Avisos e mural',
    mural: 'Mural', messages: 'Mensagens', config: 'Configurações da igreja', church: 'Configurações da igreja', courses: 'Treinamentos/Reuniões',
    training: 'Treinamentos/Reuniões', market: 'Mercado solidário', pharmacy: 'Farmácia solidária', clinical: 'Prontuário', health: 'Saúde',
    audit: 'Auditoria', lgpd: 'LGPD / Privacidade' };
  function nomeModulo(c) { return MODULOS[c] || MODULOS[String(c).split('.')[0]] || String(c).replace(/_/g, ' ').replace(/^\w/, function (x) { return x.toUpperCase(); }); }
  var usuarios = [], podeGerir = null;
  function uId(x) { return x.user_account_id || x.id; }
  function uNome(x) { return x.full_name || x.person_name || x.nome || x.name || x.username || '—'; }
  function uPerfil(x) { return x.profile_code || x.primary_profile_code || (Array.isArray(x.profiles) && x.profiles[0] && (x.profiles[0].code || x.profiles[0])) || x.profile || ''; }
  function uStatus(x) { return String(x.status || x.account_status || x.access_status || 'active'); }
  function nomeCodigo(c) { for (var i = 0; i < perfis.length; i++) if (perfis[i].code === c) return nomePerfil(perfis[i]); return nomePerfil({ code: c }); }
  function carregarUsuarios(busca) {
    var pp = perfis.length ? Promise.resolve() : rpc('v39_list_access_profiles', {}).then(function (l) { perfis = lista(l).filter(function (p) { return p.code !== 'master'; }); }).catch(function () {});
    return pp.then(function () { return rpc('list_active_users', { p_church_id: igrejaId(), p_search: busca || null, p_profile_code: null, p_gc_id: null, p_limit: 200, p_offset: 0 }); })
      .then(function (l) { podeGerir = true; usuarios = lista(l); return usuarios; })
      .catch(function (e) { if (/autoriza|permiss|PERMISSION/i.test(String(e && (e.message || e.details)))) podeGerir = false; throw e; });
  }
  function abrirUsuarios() {
    var o = janela('<h2 style="margin:0 0 4px">Usuários e acessos</h2><div style="font-size:12.5px;color:#888;margin-bottom:10px">Toque em um usuário para mudar o perfil, liberar ou bloquear módulos, suspender ou reativar.</div>' +
      (pendentes.length ? '<button class="btn pr" id="g2u-ped" style="width:100%;margin-bottom:10px">🔔 ' + pendentes.length + ' cadastro(s) aguardando liberação</button>' : '') +
      '<input id="g2u-busca" placeholder="Buscar por nome ou usuário..." autocomplete="off"><div id="g2u-lista" style="margin-top:10px"><div class="empty">Carregando...</div></div>' +
      '<button class="btn gh" id="g2u-fechar" style="width:100%;margin-top:8px">Fechar</button>');
    if (o.querySelector('#g2u-ped')) o.querySelector('#g2u-ped').addEventListener('click', abrirLista);
    o.querySelector('#g2u-fechar').addEventListener('click', abrirHub);
    var alvo = o.querySelector('#g2u-lista'), tm = null;
    function pintarLista(l) {
      if (!l.length) { alvo.innerHTML = '<div class="empty">Nenhum usuário encontrado.</div>'; return; }
      alvo.innerHTML = l.map(function (x, i) {
        var susp = /susp|inativ|block/i.test(uStatus(x));
        return '<div class="card" data-u="' + i + '" style="margin-bottom:8px;cursor:pointer;display:flex;gap:10px;align-items:center' + (susp ? ';opacity:.6' : '') + '">' +
          '<div style="flex:1;min-width:0"><div style="font-weight:700">' + esc(uNome(x)) + '</div><div style="font-size:12.5px;color:#666">@' + esc(x.username || '') +
          ' · ' + esc(nomeCodigo(uPerfil(x)) || 'sem perfil') + (susp ? ' · <b style="color:#C2262B">suspenso</b>' : '') + '</div></div><div style="color:#aaa">›</div></div>';
      }).join('');
    }
    function buscar() {
      alvo.innerHTML = '<div class="empty">Carregando...</div>';
      carregarUsuarios(o.querySelector('#g2u-busca').value.trim()).then(pintarLista)
        .catch(function (e) { alvo.innerHTML = '<div class="empty">' + esc(traduz(e)) + '</div>'; });
    }
    o.querySelector('#g2u-busca').addEventListener('input', function () { clearTimeout(tm); tm = setTimeout(buscar, 400); });
    alvo.addEventListener('click', function (ev) { var c = ev.target.closest('[data-u]'); if (c) abrirUsuario(usuarios[+c.getAttribute('data-u')]); });
    buscar();
  }
  function abrirUsuario(x) {
    var id = uId(x), susp = /susp|inativ|block/i.test(uStatus(x)), perfilAtual = uPerfil(x);
    var opts = perfis.slice().sort(function (a, b) { return nomePerfil(a).localeCompare(nomePerfil(b), 'pt-BR'); })
      .map(function (p) { return '<option value="' + esc(p.code) + '"' + (p.code === perfilAtual ? ' selected' : '') + '>' + esc(nomePerfil(p)) + '</option>'; }).join('');
    if (perfilAtual === 'master') opts = '<option value="master" selected>Master</option>' + opts;
    var o = janela('<h2 style="margin:0 0 2px">' + esc(uNome(x)) + '</h2><div style="font-size:12.5px;color:#666;margin-bottom:12px">@' + esc(x.username || '') + (x.email ? ' · ' + esc(x.email) : '') + '</div>' +
      '<label>Perfil de acesso</label><div style="display:flex;gap:8px"><select id="g2u-perfil" style="flex:1">' + opts + '</select><button class="btn pr sm" id="g2u-salvarp">Salvar</button></div>' +
      '<div style="font-weight:700;margin:16px 0 4px">Módulos</div><div style="font-size:12px;color:#888;margin-bottom:6px">"Padrão do perfil" segue o perfil. "Liberado" ou "Bloqueado" criam uma exceção só para esta pessoa.</div>' +
      '<div id="g2u-mods"><div class="empty">Carregando...</div></div>' +
      '<div style="height:12px"></div><button class="btn ' + (susp ? 'pr' : 'dg') + '" id="g2u-susp" style="width:100%">' + (susp ? 'Reativar acesso' : 'Suspender acesso') + '</button>' +
      '<div class="gap"></div><button class="btn gh" id="g2u-voltar" style="width:100%">Voltar</button>');
    o.querySelector('#g2u-voltar').addEventListener('click', abrirUsuarios);
    o.querySelector('#g2u-salvarp').addEventListener('click', function () {
      var novo = o.querySelector('#g2u-perfil').value; if (novo === perfilAtual) return toast('O perfil já é este.');
      var m = prompt('Motivo da troca de perfil:', ''); if (m === null) return; m = m.trim(); if (m.length < 3) return toast('Informe o motivo com pelo menos 3 caracteres.');
      rpc('change_user_profile', { p_user_account_id: id, p_church_id: igrejaId(), p_profile_code: novo, p_reason: m })
        .then(function () { toast('Perfil alterado para ' + nomeCodigo(novo) + ' ✓. Vale no próximo acesso da pessoa.', 5000); x.profile_code = novo; perfilAtual = novo; carregarMods(); })
        .catch(function (e) { toast(traduz(e), 5000); });
    });
    o.querySelector('#g2u-susp').addEventListener('click', function () {
      var m = prompt(susp ? 'Motivo da reativação:' : 'Motivo da suspensão (a pessoa perde o acesso):', ''); if (m === null) return; m = m.trim(); if (m.length < 3) return toast('Informe o motivo com pelo menos 3 caracteres.');
      rpc(susp ? 'reactivate_user_account' : 'suspend_user_account', { p_user_account_id: id, p_church_id: igrejaId(), p_reason: m })
        .then(function () { toast(susp ? 'Acesso reativado ✓' : 'Acesso suspenso.'); abrirUsuarios(); })
        .catch(function (e) { toast(traduz(e), 5000); });
    });
    var box = o.querySelector('#g2u-mods');
    function carregarMods() {
      rpc('v39_user_module_access', { p_church_id: igrejaId(), p_user_account_id: id }).then(function (r) {
        var ms = (r && r.modulos) || [];
        if (!ms.length) { box.innerHTML = '<div class="empty">Nenhum módulo cadastrado no banco.</div>'; return; }
        box.innerHTML = ms.map(function (m) {
          var ex = m.excecao === 'allow' ? 'liberar' : m.excecao === 'deny' ? 'bloquear' : 'perfil';
          var efetivo = ex === 'liberar' || (ex === 'perfil' && m.doPerfil);
          return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(0,0,0,.06)">' +
            '<span style="width:9px;height:9px;border-radius:50%;flex:0 0 9px;background:' + (efetivo ? '#2E9E5B' : '#C9CDD3') + '"></span>' +
            '<div style="flex:1;font-size:14px">' + esc(nomeModulo(m.modulo)) + '<div style="font-size:11.5px;color:#999">' + (efetivo ? 'com acesso' : 'sem acesso') + (ex === 'perfil' ? ' · pelo perfil' : ' · exceção') + '</div></div>' +
            '<select data-mod="' + esc(m.modulo) + '" data-atual="' + ex + '" style="width:auto;max-width:150px;margin:0">' +
            '<option value="perfil"' + (ex === 'perfil' ? ' selected' : '') + '>Padrão do perfil</option>' +
            '<option value="liberar"' + (ex === 'liberar' ? ' selected' : '') + '>Liberado</option>' +
            '<option value="bloquear"' + (ex === 'bloquear' ? ' selected' : '') + '>Bloqueado</option></select></div>';
        }).join('');
      }).catch(function (e) { box.innerHTML = '<div class="empty">' + esc(/does not exist|PGRST202|find the function/i.test(String(e && (e.message || e.details))) ? 'Rode o v39_usuarios_modulos.sql no Supabase.' : traduz(e)) + '</div>'; });
    }
    box.addEventListener('change', function (ev) {
      var sel = ev.target; if (!sel.getAttribute('data-mod')) return;
      var mod = sel.getAttribute('data-mod'), atual = sel.getAttribute('data-atual');
      var m = prompt('Motivo da alteração em "' + nomeModulo(mod) + '":', ''); if (m === null || m.trim().length < 3) { sel.value = atual; if (m !== null) toast('Informe o motivo com pelo menos 3 caracteres.'); return; }
      sel.disabled = true;
      rpc('v39_set_user_module_access', { p_church_id: igrejaId(), p_user_account_id: id, p_module_code: mod, p_mode: sel.value, p_reason: m.trim() })
        .then(function () { toast('Acesso a ' + nomeModulo(mod) + ' atualizado ✓'); carregarMods(); })
        .catch(function (e) { sel.value = atual; sel.disabled = false; toast(traduz(e), 5000); });
    });
    carregarMods();
  }

  function ehMaster() { var u = cfg().usuario || {}; return String(u.papel || '').toLowerCase() === 'master'; }

  /* ═══════════ HUB "Usuários e acessos" (somente Master) ═══════════ */
  function abrirHub() {
    if (!ehMaster()) return fecharJanela();
    var o = janela('<h2 style="margin:0 0 4px">Usuários e acessos</h2><div style="font-size:12.5px;color:#888;margin-bottom:12px">Manutenção restrita ao perfil Master.</div>' +
      '<button class="btn ' + (pendentes.length ? 'pr' : 'gh') + '" data-h="ped" style="width:100%">Cadastros aguardando liberação' + (pendentes.length ? ' · ' + pendentes.length : '') + '</button><div class="gap"></div>' +
      '<button class="btn gh" data-h="usu" style="width:100%">Usuários · perfil, módulos, suspensão</button><div class="gap"></div>' +
      '<button class="btn gh" data-h="per" style="width:100%">Perfis · liberação por função e módulo</button><div class="gap"></div>' +
      '<button class="btn gh" data-h="sair" style="width:100%">Fechar</button>');
    o.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-h]'); if (!b) return;
      var h = b.getAttribute('data-h');
      if (h === 'ped') carregar(true).then(abrirLista); else if (h === 'usu') abrirUsuarios(); else if (h === 'per') abrirPerfis(); else fecharJanela();
    });
  }

  /* ═══════════ PERFIS: painel por função e módulo ═══════════ */
  function abrirPerfis() {
    var o = janela('<h2 style="margin:0 0 4px">Perfis</h2><div style="font-size:12.5px;color:#888;margin-bottom:10px">Escolha a função para ver e ajustar o que ela pode fazer em cada módulo. A alteração vale para todas as pessoas com esse perfil.</div>' +
      '<div id="g2p-lista"><div class="empty">Carregando...</div></div><button class="btn gh" id="g2p-voltar" style="width:100%;margin-top:8px">Voltar</button>');
    o.querySelector('#g2p-voltar').addEventListener('click', abrirHub);
    var alvo = o.querySelector('#g2p-lista');
    rpc('v39_list_access_profiles', {}).then(function (l) {
      var ps = lista(l);
      alvo.innerHTML = ps.map(function (p, i) {
        return '<div class="card" data-p="' + i + '" style="margin-bottom:8px;cursor:pointer;display:flex;align-items:center;gap:10px"><div style="flex:1"><b>' + esc(nomePerfil(p)) + '</b>' +
          (p.code === 'master' ? '<div style="font-size:12px;color:#999">acesso total · não editável</div>' : '') + '</div><div style="color:#aaa">›</div></div>';
      }).join('') || '<div class="empty">Nenhum perfil encontrado.</div>';
      alvo.addEventListener('click', function (ev) { var c = ev.target.closest('[data-p]'); if (c) abrirPerfil(ps[+c.getAttribute('data-p')]); });
    }).catch(function (e) { alvo.innerHTML = '<div class="empty">' + esc(traduz(e)) + '</div>'; });
  }
  function abrirPerfil(perf) {
    var o = janela('<h2 style="margin:0 0 2px">' + esc(nomePerfil(perf)) + '</h2><div id="g2p-info" style="font-size:12.5px;color:#888;margin-bottom:10px"></div>' +
      '<div id="g2p-mods"><div class="empty">Carregando...</div></div>' +
      '<div style="position:sticky;bottom:0;background:var(--bg,#fff);padding-top:8px"><button class="btn pr" id="g2p-salvar" style="width:100%;display:none">Salvar alterações</button>' +
      '<div class="gap"></div><button class="btn gh" id="g2p-voltar" style="width:100%">Voltar</button></div>');
    o.querySelector('#g2p-voltar').addEventListener('click', abrirPerfis);
    var box = o.querySelector('#g2p-mods'), salvar = o.querySelector('#g2p-salvar'), orig = {}, travado = false;
    function mudancas() { var l = []; box.querySelectorAll('input[data-perm]').forEach(function (c) { var k = c.getAttribute('data-perm'); if (c.checked !== orig[k]) l.push({ code: k, liberada: c.checked }); }); return l; }
    function atualizar() {
      box.querySelectorAll('[data-modbox]').forEach(function (g) {
        var cs = g.querySelectorAll('input[data-perm]'), n = 0; cs.forEach(function (c) { if (c.checked) n++; });
        var t = g.querySelector('[data-cont]'); t.textContent = n + '/' + cs.length;
        t.style.background = n === 0 ? '#E7E9EC' : n === cs.length ? '#2E9E5B' : '#E0A100'; t.style.color = n === 0 ? '#555' : '#fff';
      });
      var m = mudancas().length; salvar.style.display = m && !travado ? '' : 'none'; salvar.textContent = 'Salvar ' + m + ' alteração(ões)';
    }
    function carregarPerfil() {
      rpc('v39_profile_permissions', { p_church_id: igrejaId(), p_profile_code: perf.code }).then(function (r) {
        travado = !!r.bloqueado; orig = {};
        o.querySelector('#g2p-info').textContent = (r.usuarios || 0) + ' pessoa(s) com este perfil nesta igreja' + (travado ? ' · o perfil Master tem acesso total e não pode ser alterado' : '');
        var grupos = {}; (r.permissoes || []).forEach(function (x) { (grupos[x.modulo] = grupos[x.modulo] || []).push(x); orig[x.code] = !!x.liberada; });
        box.innerHTML = Object.keys(grupos).sort(function (a, b) { return nomeModulo(a).localeCompare(nomeModulo(b), 'pt-BR'); }).map(function (m) {
          return '<details data-modbox class="card" style="margin-bottom:8px;padding:10px 12px"><summary style="display:flex;align-items:center;gap:10px;cursor:pointer;list-style:none">' +
            '<b style="flex:1">' + esc(nomeModulo(m)) + '</b><span data-cont style="border-radius:999px;padding:2px 9px;font-size:12px;font-weight:700"></span>' +
            (travado ? '' : '<button type="button" class="btn gh sm" data-tudo="' + esc(m) + '" style="width:auto">Tudo / nada</button>') + '</summary>' +
            grupos[m].map(function (x) {
              return '<label style="display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-top:1px solid rgba(0,0,0,.06);font-weight:500;cursor:pointer">' +
                '<input type="checkbox" data-perm="' + esc(x.code) + '"' + (x.liberada ? ' checked' : '') + (travado ? ' disabled' : '') + ' style="width:auto;margin-top:3px">' +
                '<span style="flex:1;font-size:13.5px">' + esc(x.nome) + (x.descricao ? '<br><span style="font-size:12px;color:#888">' + esc(x.descricao) + '</span>' : '') +
                (/high|alta|sens|crit/i.test(x.sensibilidade) ? ' <span style="font-size:11px;color:#C2262B;font-weight:700">· sensível</span>' : '') + '</span></label>';
            }).join('') + '</details>';
        }).join('') || '<div class="empty">Nenhuma permissão cadastrada.</div>';
        atualizar();
      }).catch(function (e) { box.innerHTML = '<div class="empty">' + esc(/PGRST202|find the function|does not exist/i.test(String(e && (e.message || e.details))) ? 'Rode o v39_perfis_meus_dados.sql no Supabase.' : traduz(e)) + '</div>'; });
    }
    box.addEventListener('change', atualizar);
    box.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-tudo]'); if (!b) return; ev.preventDefault();
      var cs = b.closest('[data-modbox]').querySelectorAll('input[data-perm]'), todos = true; cs.forEach(function (c) { if (!c.checked) todos = false; });
      cs.forEach(function (c) { c.checked = !todos; }); atualizar();
    });
    salvar.addEventListener('click', function () {
      var l = mudancas(); if (!l.length) return;
      var sens = l.filter(function (x) { return x.liberada; }).length;
      var m = prompt('Motivo da alteração no perfil ' + nomePerfil(perf) + ' (' + l.length + ' item(ns)' + (sens ? ', ' + sens + ' liberado(s)' : '') + '):', ''); if (m === null) return;
      m = m.trim(); if (m.length < 3) return toast('Informe o motivo com pelo menos 3 caracteres.');
      salvar.disabled = true;
      rpc('v39_set_profile_permissions', { p_church_id: igrejaId(), p_profile_code: perf.code, p_grants: l, p_reason: m })
        .then(function (r) { toast('Perfil ' + nomePerfil(perf) + ' atualizado ✓ (' + (r.liberadas || 0) + ' liberada(s), ' + (r.removidas || 0) + ' removida(s)). Vale no próximo acesso das pessoas.', 6000); carregarPerfil(); })
        .catch(function (e) { toast(traduz(e), 5000); }).then(function () { salvar.disabled = false; });
    });
    carregarPerfil();
  }

  /* ═══════════ MEUS DADOS (cada usuário, somente os próprios dados) ═══════════ */
  function abrirMeusDados() {
    var o = janela('<h2 style="margin:0 0 4px">Meus dados</h2><div style="font-size:12.5px;color:#888;margin-bottom:10px">Altere seus dados pessoais. Função, GC e jornada na igreja são mantidos pela liderança.</div><div id="g2m-form"><div class="empty">Carregando...</div></div>');
    var f = o.querySelector('#g2m-form'), atual = {};
    function campo(id, rot, v, extra) { return '<label>' + rot + '</label><input id="g2m-' + id + '" value="' + esc(v || '') + '"' + (extra || '') + '>'; }
    rpc('v39_get_my_profile', {}).then(function (d) {
      atual = d || {};
      f.innerHTML = '<label>Nome completo</label><input value="' + esc(d.nome) + '" disabled style="opacity:.7"><div style="font-size:11.5px;color:#999;margin-top:2px">Para corrigir o nome completo, procure a liderança.</div>' +
        campo('apelido', 'Como prefere ser chamado(a)', d.apelido) +
        '<div class="g2"><div>' + campo('nasc', 'Nascimento', d.nasc, ' type="date"') + '</div><div><label>Sexo</label><select id="g2m-sexo"><option value=""></option>' +
          ['Masculino', 'Feminino'].map(function (x) { return '<option' + (d.sexo === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div></div>' +
        campo('fone', 'WhatsApp', d.fone, ' inputmode="tel" placeholder="(16) 99999-9999"') +
        campo('email', 'E-mail de acesso', d.email, ' type="email" autocomplete="email"') +
        '<div style="font-size:11.5px;color:#999;margin-top:2px">Ao trocar o e-mail, enviamos um link de confirmação para o novo endereço.</div>' +
        '<div class="g2"><div>' + campo('cep', 'CEP', d.cep, ' inputmode="numeric" maxlength="9" placeholder="00000-000"') + '</div><div>' + campo('numero', 'Número', d.numero) + '</div></div>' +
        campo('endereco', 'Endereço', d.endereco) + campo('complemento', 'Complemento', d.complemento) +
        '<div class="g2"><div>' + campo('bairro', 'Bairro', d.bairro) + '</div><div>' + campo('cidade', 'Cidade', d.cidade) + '</div></div>' +
        '<div style="font-size:12px;color:#888;background:var(--bg,#F0F1F4);border-radius:8px;padding:8px;margin-top:10px">A troca de foto será liberada quando o armazenamento de fotos for migrado para o novo servidor.</div>' +
        '<div id="g2m-erro" style="display:none;color:#a12424;background:#fdecec;border-radius:8px;padding:8px;margin-top:8px;font-size:13px"></div>' +
        '<div style="height:12px"></div><button class="btn pr" id="g2m-salvar" style="width:100%">Salvar meus dados</button><div class="gap"></div><button class="btn gh" id="g2m-fechar" style="width:100%">Fechar</button>';
      var cep = o.querySelector('#g2m-cep');
      cep.addEventListener('input', function () {
        var dg = soDig(cep.value).slice(0, 8); cep.value = dg.length > 5 ? dg.slice(0, 5) + '-' + dg.slice(5) : dg;
        if (dg.length === 8) fetch('https://viacep.com.br/ws/' + dg + '/json/').then(function (r) { return r.json(); }).then(function (c) {
          if (!c || c.erro) return;
          if (c.logradouro && !o.querySelector('#g2m-endereco').value) o.querySelector('#g2m-endereco').value = c.logradouro;
          if (c.bairro) o.querySelector('#g2m-bairro').value = c.bairro;
          if (c.localidade) o.querySelector('#g2m-cidade').value = c.localidade + (c.uf ? '/' + c.uf : '');
        }).catch(function () {});
      });
      o.querySelector('#g2m-fechar').addEventListener('click', fecharJanela);
      o.querySelector('#g2m-salvar').addEventListener('click', function () {
        var v = function (id) { return String(o.querySelector('#g2m-' + id).value || '').trim(); }, erro = o.querySelector('#g2m-erro');
        function falha(m) { erro.textContent = m; erro.style.display = 'block'; }
        var email = v('email').toLowerCase();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return falha('Informe um e-mail válido.');
        if (v('fone') && soDig(v('fone')).length < 10) return falha('Informe o WhatsApp com DDD.');
        var btn = this; btn.disabled = true; btn.textContent = 'Salvando...'; erro.style.display = 'none';
        var dados = { apelido: v('apelido'), nasc: v('nasc'), sexo: v('sexo'), fone: v('fone'), cep: v('cep'), endereco: v('endereco'),
                      numero: v('numero'), complemento: v('complemento'), bairro: v('bairro'), cidade: v('cidade') };
        var trocaEmail = email && email !== String(atual.email || '').toLowerCase();
        rpc('v39_update_my_profile', { p_data: dados }).then(function () {
          if (!trocaEmail) return false;
          var V = window.G2_V39 || {};
          return V.client.auth.updateUser({ email: email }).then(function (r) { if (r && r.error) throw r.error; return true; });
        }).then(function (enviou) {
          fecharJanela();
          toast('Seus dados foram salvos ✓' + (enviou ? ' Confirme o novo e-mail pelo link que enviamos; até lá, continue usando o e-mail atual.' : ''), enviou ? 8000 : 4000);
          var g = G(); if (g && g.sincronizar) g.sincronizar(false);
        }).catch(function (e) {
          var t = String((e && (e.message || e.details)) || '');
          falha(/PERSON_NOT_LINKED/.test(t) ? 'Sua conta não está ligada a um cadastro de pessoa. Procure a liderança.' :
                /already|registered|exists/i.test(t) ? 'Este e-mail já está em uso por outra conta.' :
                /PGRST202|find the function/i.test(t) ? 'Função ainda não instalada no servidor. Avise o administrador.' : traduz(e));
        }).then(function () { btn.disabled = false; btn.textContent = 'Salvar meus dados'; });
      });
    }).catch(function (e) {
      var t = String((e && (e.message || e.details)) || '');
      f.innerHTML = '<div class="empty">' + esc(/PERSON_NOT_LINKED/.test(t) ? 'Sua conta não está ligada a um cadastro de pessoa. Procure a liderança.' : /PGRST202|find the function/i.test(t) ? 'Rode o v39_perfis_meus_dados.sql no Supabase.' : traduz(e)) + '</div><button class="btn gh" style="width:100%;margin-top:8px" onclick="document.getElementById(\'g2-acessos-modal\').remove()">Fechar</button>';
    });
  }

  /* ═══════════ botões na aba Configurações e no menu do usuário ═══════════ */
  function botao(id, cls, html, fn) { var b = document.createElement('button'); b.id = id; b.className = 'btn ' + cls; b.style.cssText = 'width:100%'; b.innerHTML = html; b.addEventListener('click', fn); return b; }
  function pintarBotaoUsuarios() {
    var main = $('main'); if (!main || !logado()) return;
    var aba = String(cfg().aba || '').toLowerCase(); if (aba !== 'conta' && aba !== 'mais') return;
    var card = main.querySelector('.card'); if (!card) return;
    var ref = card.querySelector('[data-a="aba"][data-v="config"]') || card.querySelector('.btn');
    if (!$('g2-btn-meus')) {
      var b1 = botao('g2-btn-meus', 'gh', 'Meus dados', abrirMeusDados), g1 = document.createElement('div'); g1.className = 'gap';
      if (ref) { ref.parentNode.insertBefore(b1, ref); ref.parentNode.insertBefore(g1, ref); } else card.appendChild(b1);
    }
    if (ehMaster() && !$('g2-btn-usuarios')) {
      var antigo = card.querySelector('[data-a="abrirPedidosAcesso"]'); if (antigo) { var g = antigo.nextElementSibling; antigo.remove(); if (g && g.className === 'gap') g.remove(); }
      var b2 = botao('g2-btn-usuarios', 'pr', 'Usuários e acessos' + (pendentes.length ? ' · <b style="color:#ffd27a">' + pendentes.length + ' aguardando</b>' : ''), abrirHub), g2 = document.createElement('div'); g2.className = 'gap';
      var depois = card.querySelector('[data-a="aba"][data-v="config"]');
      if (depois) { depois.parentNode.insertBefore(g2, depois.nextSibling); depois.parentNode.insertBefore(b2, g2.nextSibling); }
      else { card.appendChild(b2); }
    }
  }
  setInterval(pintarBotaoUsuarios, 700);
  /* item "Meus dados" no menu das iniciais */
  new MutationObserver(function () {
    var m = $('g2-umenu'); if (!m || m.querySelector('[data-g2meus]')) return;
    var ref = m.querySelector('[data-a="trocarSenha"]'); if (!ref) return;
    var it = document.createElement('button'); it.type = 'button'; it.setAttribute('data-g2meus', '1');
    it.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>Meus dados';
    it.addEventListener('click', function () { setTimeout(abrirMeusDados, 0); });
    ref.parentNode.insertBefore(it, ref);
  }).observe(document.body, { childList: true });

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

  window.G2_USUARIOS = { versao: VERSAO, abrir: function () { carregar(true).then(abrirLista); }, usuarios: abrirUsuarios, hub: abrirHub, perfis: abrirPerfis, meusDados: abrirMeusDados, recarregar: function () { return carregar(true); } };
})();
