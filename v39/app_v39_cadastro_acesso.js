/* 2Gather v39 · Cadastro de acesso (autocadastro antes do login) · ACESSO-2
   ACESSO-2: quem escolhe uma função que NÃO é de GC (Secretaria, Tesouraria, Voluntário Lar de Vida, Voluntário Instituto, Profissional de saúde) não escolhe mais GC:
     o campo "De qual GC você participa?" fica desligado ("Esta função não participa de GC") e o GC não é enviado. Evita que o profissional entre num GC na aprovação.
   ACESSO-1 (base)
   Carregar DEPOIS do app.js.
   Antes do login o app.js ainda chamava o Apps Script (gcsPublico e cadastro).
   Este módulo liga a tela "Solicitar acesso" à Edge Function `auth` do Supabase,
   a mesma que o login do v39 já usa (ações gcsPublico e cadastro).
   Não altera o app.js: substitui apenas os dois botões da tela de cadastro. */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cfgSb() { var C = window.V39_CONFIG || window.APP_CONFIG || {}; return { url: String(C.supabaseUrl || '').replace(/\/$/, ''), key: C.supabaseAnonKey || '' }; }
  function erroEm(id, msg) { var el = $(id); if (!el) return; el.textContent = msg || ''; el.classList.toggle('hide', !msg); }
  function carregando(on, txt) { var c = $('carregando'), t = $('carregando-txt'); if (t && txt) t.textContent = txt; if (c) c.classList.toggle('hide', !on); }

  var MSG = {
    USERNAME_TAKEN: 'Este usuário já está em uso. Escolha outro.',
    USERNAME_INVALID: 'Usuário inválido: use de 3 a 30 letras, números, ponto, hífen ou _.',
    EMAIL_INVALID: 'Informe um e-mail válido.',
    EMAIL_TAKEN: 'Este e-mail já está cadastrado. Use "Esqueci a senha" ou outro e-mail.',
    PASSWORD_WEAK: 'A senha precisa ter pelo menos 6 caracteres.',
    CONSENT_REQUIRED: 'Para se cadastrar, leia e aceite a Política de Privacidade.',
    ACCESS_REQUEST_LIMIT: 'Há muitos pedidos aguardando aprovação. Tente novamente mais tarde.',
    GC_SCOPE_INVALID: 'O GC escolhido não está disponível. Escolha outro ou deixe em branco.'
  };
  function traduz(t) {
    t = String(t || '');
    for (var c in MSG) if (t.indexOf(c) >= 0) return MSG[c];
    if (/already|já existe|ja existe|em uso|duplicate/i.test(t)) return MSG.USERNAME_TAKEN;
    if (/failed to fetch|network|load failed/i.test(t)) return 'Sem conexão com a internet. Verifique e tente novamente.';
    return t || 'Não foi possível enviar o cadastro. Tente novamente.';
  }

  function edge(acao, dados) {
    var s = cfgSb();
    if (!s.url || !s.key) return Promise.reject(new Error('Configuração do servidor indisponível. Atualize a página.'));
    var corpo = {}; for (var k in (dados || {})) corpo[k] = dados[k]; corpo.acao = acao;
    return fetch(s.url + '/functions/v1/auth', {
      method: 'POST', mode: 'cors', cache: 'no-store', credentials: 'omit',
      headers: { 'Content-Type': 'application/json', apikey: s.key, Authorization: 'Bearer ' + s.key },
      body: JSON.stringify(corpo)
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = {}; try { j = t ? JSON.parse(t) : {}; } catch (e) {}
        if (!r.ok || j.ok === false) throw new Error(traduz(j.erro || j.message || j.mensagem || j.code || ('Erro ' + r.status)));
        return j;
      });
    }, function () { throw new Error('Sem conexão com o servidor. Verifique a internet.'); });
  }

  /* Função escolhida no formulário → código aceito pela Edge Function (igual ao v38). */
  function perfil(v) {
    var n = String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/lar|lv$/.test(n)) return 'voluntarioLV';
    if (/instit|inst$/.test(n)) return 'voluntarioInst';
    if (/profiss|saude/.test(n)) return 'profissional';
    if (/tesour/.test(n)) return 'tesouraria';
    if (/secret/.test(n)) return 'secretaria';
    if (/pastor/.test(n)) return 'pastor';
    if (/supervis/.test(n)) return 'supervisor';
    if (/lider/.test(n)) return 'lider';
    if (/volunt/.test(n)) return 'voluntario';
    return 'discipulo';
  }

  var SEM_GC_FUNCAO = ['secretaria', 'tesouraria', 'voluntarioLV', 'voluntarioInst', 'profissional'];
  function ajustarGcPorFuncao() {
    var sel = $('c-gc'), pap = $('c-papel'); if (!sel || !pap) return;
    var sem = SEM_GC_FUNCAO.indexOf(perfil(pap.value)) >= 0, dica = $('c-gc-dica');
    if (!dica) { dica = document.createElement('div'); dica.id = 'c-gc-dica'; dica.style.cssText = 'font-size:11.5px;color:#8A5A00;margin:4px 2px 0;line-height:1.4'; sel.parentNode.insertBefore(dica, sel.nextSibling); }
    if (sem) { sel.dataset.antes = sel.value || sel.dataset.antes || ''; sel.value = ''; sel.disabled = true; dica.textContent = 'Esta função não participa de GC: não precisa escolher.'; }
    else { sel.disabled = false; if (sel.dataset.antes && !sel.value) sel.value = sel.dataset.antes; dica.textContent = ''; }
  }
  document.addEventListener('change', function (ev) { if (ev.target && ev.target.id === 'c-papel') ajustarGcPorFuncao(); });
  function abrirCadastro() {
    ['s-login', 's-cadastro', 's-app'].forEach(function (x) { var el = $(x); if (el) el.classList.toggle('hide', x !== 's-cadastro'); });
    window.scrollTo(0, 0);
    if ($('cad-form')) $('cad-form').classList.remove('hide');
    if ($('cad-ok')) $('cad-ok').classList.add('hide');
    erroEm('c-erro', '');
    var sel = $('c-gc'); if (!sel) return;
    sel.innerHTML = '<option value="">Carregando...</option>';
    edge('gcsPublico', {}).then(function (r) {
      var gs = (r && r.gcs) || [];
      sel.innerHTML = '<option value="">Ainda não participo / não sei</option>' +
        gs.map(function (g) { return '<option value="' + esc(g.id) + '">' + esc(g.nome || g.name) + '</option>'; }).join('');
      if (!gs.length) console.warn('[2Gather][cadastro] a lista pública de GCs voltou vazia');
      ajustarGcPorFuncao();
    }).catch(function () { sel.innerHTML = '<option value="">Ainda não participo / não sei</option>'; });
  }

  function cadastrar() {
    var v = function (id) { var el = $(id); return el ? String(el.value || '').trim() : ''; };
    var u = v('c-usuario').toLowerCase(), senha = $('c-senha') ? $('c-senha').value : '';
    if (!v('c-nome')) return erroEm('c-erro', 'Informe o nome completo.');
    if (!/^[a-z0-9._-]{3,30}$/.test(u)) return erroEm('c-erro', 'Usuário: de 3 a 30 caracteres, sem espaços ou acentos (letras, números, ponto, hífen).');
    if (senha.length < 6) return erroEm('c-erro', 'A senha precisa ter pelo menos 6 caracteres.');
    if ($('c-senha2') && senha !== $('c-senha2').value) return erroEm('c-erro', 'As senhas não conferem.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('c-email'))) return erroEm('c-erro', 'Informe um e-mail válido. Ele é usado para recuperar a senha.');
    if ($('c-aceite') && !$('c-aceite').checked) return erroEm('c-erro', 'Para se cadastrar, leia e aceite a Política de Privacidade.');
    var d = { nome: v('c-nome'), usuario: u, email: v('c-email'), fone: v('c-fone'), senha: senha,
              perfil: perfil(v('c-papel')), aceite: true, obs: v('c-obs') };
    if (v('c-gc') && SEM_GC_FUNCAO.indexOf(d.perfil) < 0) d.gcId = v('c-gc');
    erroEm('c-erro', ''); var b = $('b-cadastrar'); if (b) b.disabled = true;
    carregando(true, 'Enviando cadastro...');
    edge('cadastro', d).then(function () {
      if ($('cad-form')) $('cad-form').classList.add('hide');
      if ($('cad-ok')) $('cad-ok').classList.remove('hide');
      if ($('c-aceite')) $('c-aceite').checked = false;
      ['c-nome', 'c-usuario', 'c-fone', 'c-email', 'c-senha', 'c-senha2', 'c-obs'].forEach(function (id) { if ($(id)) $(id).value = ''; });
      if ($('l-usuario')) $('l-usuario').value = u;
    }).catch(function (e) { erroEm('c-erro', (e && e.message) || 'Não foi possível enviar o cadastro.'); })
      .then(function () { if (b) b.disabled = false; carregando(false); });
  }

  /* Troca os botões (remove o listener antigo, que chamava o Apps Script). */
  function religar(id, fn) {
    var el = $(id); if (!el || el.__g2acesso) return !!el;
    var novo = el.cloneNode(true); novo.__g2acesso = true;
    el.parentNode.replaceChild(novo, el);
    novo.addEventListener('click', function (ev) { ev.preventDefault(); fn(); });
    return true;
  }
  function instalar() { var a = religar('b-ir-cadastro', abrirCadastro), b = religar('b-cadastrar', cadastrar); return a && b; }
  if (!instalar()) { var n = 0, t = setInterval(function () { if (instalar() || ++n > 40) clearInterval(t); }, 250); }
  window.G2_ACESSO = { versao: 'ACESSO-1', perfil: perfil };
})();
