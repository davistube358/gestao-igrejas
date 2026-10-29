window.addEventListener('error', function (e) {
  var d = document.getElementById('diag');
  if (d) { d.className = 'aviso r'; d.textContent = 'Erro no script: ' + (e.message || 'desconhecido') + (e.lineno ? ' (linha ' + e.lineno + ')' : ''); }
});
(function () {
'use strict';
var VERSAO_PAGINA = 'v5';
var diag = document.getElementById('diag');
function setDiag(cls, txt) { diag.className = 'aviso ' + cls; diag.textContent = txt; }
setDiag('ok', 'Página ' + VERSAO_PAGINA + ' · script carregado · endereço: ' + location.origin + ' · testando conexão...');
var URL_SB = 'https://kybrwsxvdbwjtwakczyj.supabase.co';
var KEY = 'sb_publishable_eYAiKCusJIf-mBLiXflj1w_lQw6ALW1';   // chave publicável: pública por desenho. Nunca coloque a chave secreta aqui.
var FN = URL_SB + '/functions/v1/auth', REST = URL_SB + '/rest/v1/rpc/';
var S = { tok: null, ctx: null, igreja: '', troca: false };

function $(i) { return document.getElementById(i); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
var tT;
function toast(m, ms) { var t = $('toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(tT); tT = setTimeout(function () { t.style.display = 'none'; }, ms || 4500); }
function dh(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('pt-BR'); }

var MSG = {
  PERMISSION_DENIED: 'Sem permissão para esta ação.', REASON_REQUIRED: 'Informe o motivo.',
  ACCESS_REQUEST_NOT_PENDING: 'O pedido não está mais pendente.', ACCESS_REQUEST_NOT_FOUND: 'Pedido não encontrado.',
  ACCESS_ACCOUNT_CPF_REQUIRED: 'É preciso um CPF válido para vincular a conta de acesso.', PERSON_CPF_MISMATCH: 'A pessoa confirmada já tem outro CPF.',
  ACCESS_APPROVAL_CONFLICT: 'Usuário, CPF ou vínculo já existe.', PROFILE_NOT_AVAILABLE: 'Perfil indisponível (o pedido veio sem perfil válido).',
  GC_SCOPE_INVALID: 'O GC não pertence a esta igreja.', PERSON_CONFIRMATION_REQUIRED: 'Confirme uma pessoa existente.',
  PERSON_NOT_IN_CHURCH: 'Pessoa não vinculada a esta igreja.', CHURCH_PERSON_STATUS_INVALID: 'Situação inválida.',
  PERSON_DUPLICATE: 'Esta pessoa já está cadastrada.', PERSON_CREATE_CONFLICT: 'Não foi possível concluir o cadastro.',
  MEMBER_CPF_REQUIRED: 'Membro precisa de CPF válido.', PERSON_CPF_INVALID: 'CPF inválido.', PERSON_REQUIRED_FIELD: 'Preencha o campo obrigatório.',
  PERSON_INVALID_FIELD: 'Algum campo está com valor inválido.', MASTER_ONLY: 'Somente o master age sobre outro master.'
};
function erroTxt(e) {
  if (e && e.codigo) {
    var x = MSG[e.codigo] || ('Operação recusada (' + e.codigo + ')');
    if (e.codigo === 'PERSON_DUPLICATE' && e.detalhe && e.detalhe.person_id) x += ' ID: ' + e.detalhe.person_id;
    return x;
  }
  return (e && e.message) || 'Erro inesperado.';
}
function falha(e) { toast(erroTxt(e), 7000); }

function expirou() { S.tok = null; S.ctx = null; mostrar('t-login'); $('b-sair').classList.add('hide'); aviso('l-erro', 'Sessão expirada. Entre novamente.'); }
function aviso(id, txt) { var el = $(id); el.textContent = txt || ''; el.classList.toggle('hide', !txt); }

/* ---------- chamadas ---------- */
function edge(acao, dados, comToken) {
  var h = { 'Content-Type': 'application/json' };
  if (comToken && S.tok) h.Authorization = 'Bearer ' + S.tok;
  var corpo = {}; for (var k in (dados || {})) corpo[k] = dados[k]; corpo.acao = acao;
  return fetch(FN, { method: 'POST', headers: h, body: JSON.stringify(corpo) }).then(function (r) {
    return r.text().then(function (t) {
      var j = {}; try { j = JSON.parse(t); } catch (e) {}
      if (r.status === 401 && j.sessao === false) { expirou(); }
      if (!r.ok || j.ok === false) { var er = new Error(j.erro || ('Erro ' + r.status)); er.status = r.status; throw er; }
      return j;
    });
  }, function () { throw new Error('Sem conexão com o servidor.'); });
}
function rpc(fn, args) {
  var h = { apikey: KEY, Authorization: 'Bearer ' + S.tok, 'Content-Type': 'application/json', 'Content-Profile': 'app' };
  return fetch(REST + fn, { method: 'POST', headers: h, body: JSON.stringify(args || {}) }).then(function (r) {
    return r.text().then(function (t) {
      var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
      if (r.ok) return j;
      var er = new Error(), msg = (j && j.message) || ('HTTP ' + r.status);
      if (j && j.code === 'P0001') {
        er.codigo = String(j.message);
        try { er.detalhe = (JSON.parse(j.details) || {}).detail; } catch (e) {}
      } else if (r.status === 401 || /JWT/i.test(msg)) { expirou(); er.message = 'Sessão expirada.'; }
      else { er.codigo = ''; er.message = 'Falha no banco (' + msg + ')'; }
      throw er;
    });
  }, function () { throw new Error('Sem conexão com o servidor.'); });
}

/* ---------- navegação ---------- */
function mostrar(id) { ['t-login', 't-cad', 't-troca', 't-app'].forEach(function (x) { $(x).classList.toggle('hide', x !== id); }); }
function tab(n) {
  ['resumo', 'pedidos', 'pessoas', 'senhas'].forEach(function (x) { $('p-' + x).classList.toggle('hide', x !== n); });
  var bs = document.querySelectorAll('nav button'); for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', bs[i].getAttribute('data-id') === n);
  if (n === 'resumo') resumo(); if (n === 'pedidos') listarPedidos(); if (n === 'senhas') listarResets();
}

/* ---------- login ---------- */
function entrar() {
  var u = $('l-usuario').value.trim().toLowerCase(), s = $('l-senha').value;
  if (!u || !s) return aviso('l-erro', 'Informe usuário e senha.');
  aviso('l-erro', ''); $('b-entrar').disabled = true;
  edge('login', { usuario: u, senha: s }).then(function (r) {
    S.tok = r.session.access_token; S.troca = !!r.must_change_password; $('l-senha').value = '';
    return carregarCtx();
  }).then(function () {
    $('b-sair').classList.remove('hide');
    if (S.troca) mostrar('t-troca'); else abrirApp();
  }).catch(function (e) { aviso('l-erro', erroTxt(e)); }).then(function () { $('b-entrar').disabled = false; });
}
function carregarCtx() {
  return rpc('get_my_frontend_context', {}).then(function (c) {
    S.ctx = c; S.igreja = c.active_church_id || '';
    if (!S.igreja) throw new Error('Sua conta não tem igreja ativa.');
  });
}
function abrirApp() {
  var u = (S.ctx && S.ctx.user) || {};
  $('quem').textContent = '@' + (u.username || '?') + ' · ' + nomeIgreja();
  mostrar('t-app'); tab('resumo');
}
function nomeIgreja() {
  var l = (S.ctx && S.ctx.churches) || [];
  for (var i = 0; i < l.length; i++) if ((l[i].id || l[i].church_id) === S.igreja) return l[i].name || l[i].church_name || 'igreja ativa';
  return 'igreja ativa';
}
function sair() { S.tok = null; S.ctx = null; S.igreja = ''; $('b-sair').classList.add('hide'); $('quem').textContent = 'teste do novo banco (Supabase)'; mostrar('t-login'); }

/* ---------- resumo ---------- */
function codPerm(p) { return p.code || p.permission_code || p.permission || p.codigo || '?'; }
function resumo() {
  var c = S.ctx || {}, u = c.user || {}, ps = c.effective_permissions || [], ok = ps.filter(function (p) { return p.allowed === true; });
  var kv = function (a, b) { return '<div class="kv"><span>' + a + '</span><b>' + esc(b) + '</b></div>'; };
  $('p-resumo').innerHTML = '<div class="card"><h2>Minha conta</h2>' + kv('Usuário', u.username) + kv('Situação', u.status) + kv('Igreja ativa', nomeIgreja()) +
    kv('Igrejas com acesso', (c.churches || []).length) + kv('Permissões no catálogo', ps.length) + kv('Permissões liberadas', ok.length) + '</div>' +
    '<div class="card"><h3>Permissões liberadas</h3><div class="sb">' + (ok.length ? ok.map(function (p) { return '<code>' + esc(codPerm(p)) + '</code>'; }).join(' ') : 'nenhuma') + '</div></div>';
}

/* ---------- pedidos de acesso ---------- */
function listarPedidos() {
  var st = $('f-status').value, a = { p_church_id: S.igreja }; if (st) a.p_status = st;
  rpc('list_access_requests', a).then(function (l) {
    l = l || [];
    $('l-pedidos').innerHTML = l.length ? l.map(function (r) {
      var abertos = ['pending', 'under_review', 'correction_requested'].indexOf(r.status) >= 0;
      return '<div class="card"><b>@' + esc(r.requested_username) + '</b> <span class="pill">' + esc(r.status) + '</span>' +
        '<div class="sb">' + esc(r.email) + ' · ' + esc(dh(r.requested_at)) + '</div>' +
        '<div class="sb">Perfil pedido: ' + (r.requested_profile_id ? 'definido' : '<b>não definido</b>') + ' · GC pedido: ' + (r.requested_gc_id ? 'sim' : 'não') + '</div>' +
        (r.request_notes ? '<div class="sb">“' + esc(r.request_notes) + '”</div>' : '') +
        (r.decision_reason ? '<div class="sb">Motivo: ' + esc(r.decision_reason) + '</div>' : '') +
        (abertos ? '<label>CPF da pessoa (para aprovar)</label><input id="cpf-' + esc(r.id) + '" inputmode="numeric">' +
          '<label>Motivo (para recusar ou pedir correção)</label><input id="mot-' + esc(r.id) + '">' +
          '<div class="row"><button class="v" data-act="aprovar" data-id="' + esc(r.id) + '">Aprovar</button><button class="g" data-act="corrigir" data-id="' + esc(r.id) + '">Pedir correção</button><button class="d" data-act="recusar" data-id="' + esc(r.id) + '">Recusar</button></div>' : '') + '</div>';
    }).join('') : '<div class="card"><div class="sb">Nenhum pedido nesta situação.</div></div>';
    window.__pedidos = {}; l.forEach(function (r) { window.__pedidos[r.id] = r; });
  }).catch(falha);
}
function pedido(id) { return (window.__pedidos || {})[id]; }
function aprovar(id) {
  var r = pedido(id), cpf = ($('cpf-' + id).value || '').replace(/\D/g, '');
  if (!r) return;
  if (cpf.length !== 11) return toast('Informe o CPF com 11 dígitos.');
  if (!confirm('Aprovar @' + r.requested_username + '? Isto cria o usuário de acesso e o vínculo de membro.')) return;
  var a = { p_request_id: id, p_confirmed_person_id: r.person_id, p_cpf: cpf, p_profile_id: r.requested_profile_id, p_reason: 'Aprovado pela página de teste' };
  if (r.requested_gc_id) a.p_gc_id = r.requested_gc_id;
  rpc('approve_access_request', a).then(function (x) {
    toast('Aprovado ✓' + (x && x.leader_slot_taken ? ' (o GC já tinha líder: entrou como participante)' : ''), 6000); listarPedidos();
  }).catch(falha);
}
function decidir(fn, id) {
  var m = ($('mot-' + id).value || '').trim();
  if (!m) return toast('Informe o motivo.');
  rpc(fn, { p_access_request_id: id, p_reason: m }).then(function () { toast('Registrado ✓'); listarPedidos(); }).catch(falha);
}

/* ---------- pessoas ---------- */
function criarPessoa() {
  var v = function (i) { return ($(i).value || '').trim(); };
  var p = { full_name: v('pe-nome'), church_status: v('pe-status') };
  if (v('pe-fone')) p.whatsapp = v('pe-fone'); if (v('pe-nasc')) p.birth_date = v('pe-nasc');
  if (v('pe-cpf')) p.cpf = v('pe-cpf').replace(/\D/g, ''); if ($('pe-visita').checked) p.accepts_home_visit = 'true';
  if (!p.full_name) return toast('Informe o nome.');
  rpc('create_person', { p_church_id: S.igreja, p_payload: p }).then(function (r) {
    $('pe-res').innerHTML = '<div class="aviso">Pessoa criada. ID: <code>' + esc(r.person_id) + '</code></div>';
    $('fi-id').value = r.person_id;
  }).catch(function (e) {
    var det = e && e.detalhe && e.detalhe.person_id; if (det) $('fi-id').value = det; falha(e);
  });
}
function abrirFicha() {
  var id = ($('fi-id').value || '').trim(); if (!id) return toast('Informe o ID.');
  rpc('get_person', { p_church_id: S.igreja, p_person_id: id }).then(function (g) {
    var p = g.person || {}, cp = g.church_person || {}, kv = function (a, b) { return b == null || b === '' ? '' : '<div class="kv"><span>' + a + '</span><b>' + esc(b) + '</b></div>'; };
    $('fi-res').innerHTML = '<div class="card">' + kv('Nome', p.full_name) + kv('Código', p.person_code) + kv('Situação na igreja', cp.status) + kv('Nascimento', p.birth_date) +
      kv('CPF', p.has_cpf ? p.cpf_masked : 'não informado') + kv('Aceita visita', cp.accepts_home_visit == null ? '' : (cp.accepts_home_visit ? 'sim' : 'não')) +
      (g.contacts || []).map(function (c) { return kv('Contato (' + c.type + ')', c.value); }).join('') +
      (g.addresses || []).map(function (a) { return kv('Endereço', [a.street, a.street_number, a.district, a.city].filter(Boolean).join(', ')); }).join('') + '</div>';
  }).catch(falha);
}

/* ---------- senhas ---------- */
function senhaNova() {
  var n = $('n-nova').value, r = $('n-rep').value;
  if (n.length < 8) return toast('Use pelo menos 8 caracteres.'); if (n !== r) return toast('As senhas não conferem.');
  edge('trocarSenha', { atual: '', nova: n }, true).then(function () { S.troca = false; $('n-nova').value = ''; $('n-rep').value = ''; toast('Senha criada ✓'); abrirApp(); }).catch(falha);
}
function trocarSenha() {
  var a = $('s-atual').value, n = $('s-nova').value;
  if (n.length < 8) return toast('Use pelo menos 8 caracteres.');
  edge('trocarSenha', { atual: a, nova: n }, true).then(function () { $('s-atual').value = ''; $('s-nova').value = ''; toast('Senha trocada ✓'); }).catch(falha);
}
function listarResets() {
  rpc('list_password_reset_requests', { p_church_id: S.igreja }).then(function (l) {
    l = l || [];
    $('l-resets').innerHTML = l.length ? l.map(function (r) {
      return '<div class="card"><b>@' + esc(r.username) + '</b> · ' + esc(r.full_name) + '<div class="sb">Pedido em ' + esc(dh(r.requested_at)) + ' · vale até ' + esc(dh(r.expires_at)) + '</div>' +
        '<div class="row"><button data-act="redefinir" data-id="' + esc(r.user_account_id) + '">Gerar senha temporária</button></div></div>';
    }).join('') : '<div class="card"><div class="sb">Nenhum pedido em aberto.</div></div>';
  }).catch(falha);
}
function redefinir(id) {
  if (!confirm('Gerar uma senha temporária para este usuário? A senha atual dele deixa de valer e as sessões abertas são encerradas.')) return;
  edge('redefinirSenha', { user_account_id: id }, true).then(function (r) {
    $('l-resets').innerHTML = '<div class="aviso r">Senha temporária: <b><code>' + esc(r.senha_temporaria) + '</code></b><br>Anote e passe à pessoa agora. <b>Ela não aparece de novo.</b></div>' + $('l-resets').innerHTML;
    toast('Senha gerada ✓');
  }).catch(falha);
}

/* ---------- cadastro público ---------- */
function irCadastro() {
  mostrar('t-cad'); aviso('c-erro', ''); $('c-ok').classList.add('hide');
  edge('gcsPublico', {}).then(function (r) {
    var s = $('c-gc'); s.innerHTML = '<option value="">Ainda não participo</option>' + (r.gcs || []).map(function (g) { return '<option value="' + esc(g.id) + '">' + esc(g.nome) + '</option>'; }).join('');
  }).catch(function () {});
}
function cadastrar() {
  var v = function (i) { return ($(i).value || '').trim(); };
  var d = { nome: v('c-nome'), usuario: v('c-usuario').toLowerCase(), email: v('c-email'), fone: v('c-fone'), senha: $('c-senha').value, perfil: $('c-papel').value, aceite: $('c-aceite').checked };
  if (v('c-gc')) d.gcId = v('c-gc');
  aviso('c-erro', ''); $('b-cadastrar').disabled = true;
  edge('cadastro', d).then(function () { $('c-ok').classList.remove('hide'); $('c-senha').value = ''; }).catch(function (e) { aviso('c-erro', erroTxt(e)); }).then(function () { $('b-cadastrar').disabled = false; });
}

var ACOES = {};
ACOES.entrar = entrar;
ACOES.sair = sair;
ACOES.irCadastro = irCadastro;
ACOES.irLogin = function () { mostrar('t-login'); };
ACOES.cadastrar = cadastrar;
ACOES.senhaNova = senhaNova;
ACOES.tab = function (id) { tab(id); };
ACOES.listarPedidos = listarPedidos;
ACOES.aprovar = aprovar;
ACOES.corrigir = function (id) { decidir('request_access_correction', id); };
ACOES.recusar = function (id) { decidir('reject_access_request', id); };
ACOES.criarPessoa = criarPessoa;
ACOES.abrirFicha = abrirFicha;
ACOES.trocarSenha = trocarSenha;
ACOES.listarResets = listarResets;
ACOES.redefinir = redefinir;

function clicou(ev) {
  var alvo = ev.target.closest ? ev.target.closest('[data-act]') : null;
  if (!alvo) return;
  var nome = alvo.getAttribute('data-act');
  var fn = ACOES[nome];
  if (typeof fn === 'function') fn(alvo.getAttribute('data-id'), alvo);
}
document.addEventListener('click', clicou);
fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'gcsPublico' }) }).then(function (r) {
  setDiag('ok', 'Página ' + VERSAO_PAGINA + ' · script carregado · endereço: ' + location.origin + ' · conexão com o servidor: OK (HTTP ' + r.status + ')');
}, function (e) {
  setDiag('r', 'Página ' + VERSAO_PAGINA + ' · script carregado · endereço: ' + location.origin + ' · conexão com o servidor: FALHOU (' + ((e && e.message) || e) + '). Causas comuns: a política de segurança do site (arquivo _headers, item connect-src) ou outro endereço. Abra a página em https://2gather-e1f.pages.dev/teste-supabase.html');
});
$('l-senha').addEventListener('keydown', function (e) { if (e.key === 'Enter') entrar(); });
})();