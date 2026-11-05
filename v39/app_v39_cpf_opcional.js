/* 2Gather v39 · CPF opcional · CPF-2 (substitui o CPF-1). Carregar DEPOIS de app_v39_usuarios_acesso.js. */
(function () {
  'use strict';
  var VERSAO = 'CPF-2';
  function $(id) { return document.getElementById(id); }
  function soDig(s) { return String(s || '').replace(/\D/g, ''); }
  function fmt(d) { d = soDig(d).slice(0, 11); return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cpfValido(c) {
    c = soDig(c); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
    for (var t = 9; t < 11; t++) { var s = 0; for (var i = 0; i < t; i++) s += +c[i] * (t + 1 - i); if (((s * 10) % 11) % 10 !== +c[t]) return false; }
    return true;
  }
  function G() { return window.__gc || null; }
  function igrejaId() { var g = G(), c = g && g.cfg && g.cfg(); return c && c.usuario && c.usuario.igrejaId; }
  function toast(msg, ms) { var t = $('toast'); if (!t) { alert(msg); return; } t.textContent = msg; t.style.display = 'block'; clearTimeout(toast._t); toast._t = setTimeout(function () { t.style.display = 'none'; }, ms || 4500); }
  function rpc(nome, args) {
    var V = window.G2_V39 || {};
    var pr = (!V.client && typeof V.init === 'function') ? Promise.resolve(V.init()) : Promise.resolve();
    return pr.then(function () { if (!V.client) throw new Error('Sem conexão com o servidor.'); var b = V.client.schema('app'); return (b.__rpcOriginal || b.rpc).call(b, nome, args || {}); })
      .then(function (r) { if (r.error) throw r.error; return r.data; });
  }
  var MSG = {
    PERSON_CPF_INVALID: 'CPF inválido. Confira os números.',
    PERSON_CPF_ALREADY_SET: 'O CPF já foi informado. Para alterar, procure a liderança.',
    PERSON_CPF_CONFLICT: 'Não foi possível salvar o CPF. Procure a liderança.',
    PERSON_CPF_MISMATCH: 'Esta pessoa já tem outro CPF cadastrado. Confira o número ou deixe em branco.',
    ACCESS_ACCOUNT_CPF_REQUIRED: 'CPF inválido. Confira os números ou deixe em branco.',
    ACCESS_REQUEST_NOT_PENDING: 'Este pedido já foi decidido por outra pessoa. A lista foi atualizada.',
    ACCESS_APPROVAL_CONFLICT: 'Não foi possível liberar: usuário, CPF ou vínculo já existente.',
    PROFILE_NOT_AVAILABLE: 'O perfil escolhido não está disponível.',
    PERMISSION_DENIED: 'Você não tem permissão para esta ação.',
    PERSON_NOT_LINKED: 'Sua conta não está ligada a um cadastro de pessoa. Procure a liderança.'
  };
  function traduz(e) {
    var t = String((e && (e.details || e.message || e.code)) || e || '');
    for (var k in MSG) if (t.indexOf(k) >= 0) return MSG[k];
    if (/PGRST202|find the function/i.test(t)) return 'Rode o v39_cpf_opcional.sql no Supabase.';
    return 'Não foi possível concluir. Tente novamente.';
  }

  /* 1. Liberar acesso: CPF opcional */
  function ajustarLiberar(m) {
    var campo = m.querySelector('#g2a-cpf'); if (!campo || campo.__g2c2) return; campo.__g2c2 = true;
    var rotulo = campo.previousElementSibling; if (rotulo && /CPF/i.test(rotulo.textContent)) rotulo.textContent = 'CPF (opcional)';
    campo.placeholder = 'Opcional';
    var nota = document.createElement('div'); nota.style.cssText = 'font-size:11.5px;color:#888;margin-top:3px';
    nota.textContent = 'Não é obrigatório. Se alguma validação precisar do CPF, a própria pessoa informa em Meus dados.';
    campo.parentNode.insertBefore(nota, campo.nextSibling);
  }
  document.addEventListener('click', function (ev) {
    var btn = ev.target && ev.target.closest && ev.target.closest('#g2a-ok'); if (!btn) return;
    var m = $('g2-acessos-modal'), campo = $('g2a-cpf'); if (!m || !campo) return;
    if (soDig(campo.value)) return;
    ev.stopImmediatePropagation(); ev.preventDefault();
    var erro = m.querySelector('#g2a-erro');
    function falha(t) { if (erro) { erro.textContent = t; erro.style.display = 'block'; } else toast(t); }
    var b = m.querySelector('h2 + div b'), usuario = b ? String(b.textContent || '').trim().toLowerCase() : '';
    var perfil = $('g2a-perfil') && $('g2a-perfil').value, gc = $('g2a-gc') && $('g2a-gc').value;
    if (!perfil) return falha('Escolha o perfil de acesso.');
    if (erro) erro.style.display = 'none';
    btn.disabled = true; btn.textContent = 'Liberando...';
    rpc('list_access_requests', { p_church_id: igrejaId(), p_status: null, p_limit: 100, p_offset: 0 }).then(function (l) {
      var lista = Array.isArray(l) ? l : (l && l.items) || [];
      var r = lista.filter(function (x) { return String(x.requested_username || '').toLowerCase() === usuario && ['pending', 'under_review', 'correction_requested'].indexOf(x.status) >= 0; })[0];
      if (!r) throw new Error('ACCESS_REQUEST_NOT_PENDING');
      return rpc('approve_access_request', { p_request_id: r.id, p_confirmed_person_id: r.person_id, p_cpf: null, p_profile_id: perfil,
        p_gc_id: gc || null, p_church_person_status: 'member', p_reason: 'Liberado pelo app' }).then(function () { return r; });
    }).then(function (r) {
      m.remove();
      toast('Acesso liberado ✓ A pessoa já pode entrar com o usuário ' + (r.requested_username || usuario) + '.', 6000);
      if (window.G2_USUARIOS && G2_USUARIOS.recarregar) G2_USUARIOS.recarregar();
      var g = G(); if (g && g.sincronizar) g.sincronizar(false);
    }).catch(function (e) { falha(traduz(e)); btn.disabled = false; btn.textContent = 'Liberar acesso'; });
  }, true);

  /* 2. Meus dados: CPF opcional da própria pessoa */
  function blocoCpf(f) {
    if (f.querySelector('#g2m-cpf-bloco') || !f.querySelector('#g2m-salvar')) return;
    var ref = f.querySelector('#g2m-erro'); if (!ref) return;
    var b = document.createElement('div'); b.id = 'g2m-cpf-bloco'; b.style.cssText = 'margin-top:12px;padding-top:10px;border-top:1px solid rgba(0,0,0,.07)';
    b.innerHTML = '<div style="font-size:12.5px;color:#888">Carregando...</div>';
    ref.parentNode.insertBefore(b, ref);
    function desenhar() {
      rpc('v39_my_cpf_status', {}).then(function (s) {
        if (s && s.temCpf) {
          b.innerHTML = '<label>CPF</label><div style="font-weight:600">' + esc(s.mascarado) + '</div>' +
            '<div style="font-size:11.5px;color:#999;margin-top:3px">CPF já informado. Para alterar, procure a liderança.</div>';
          return;
        }
        b.innerHTML = '<label>CPF (opcional)</label><div style="display:flex;gap:8px"><input id="g2m-cpf" inputmode="numeric" maxlength="14" placeholder="000.000.000-00" autocomplete="off" style="flex:1"><button type="button" class="btn gh sm" id="g2m-cpf-ok">Salvar CPF</button></div>' +
          '<div style="font-size:11.5px;color:#999;margin-top:3px">Informe só se a liderança pedir para alguma validação. Depois de salvo, só a liderança altera.</div>' +
          '<div id="g2m-cpf-erro" style="display:none;color:#a12424;font-size:12.5px;margin-top:4px"></div>';
        var inp = b.querySelector('#g2m-cpf'), er = b.querySelector('#g2m-cpf-erro');
        inp.addEventListener('input', function () { inp.value = fmt(inp.value); });
        b.querySelector('#g2m-cpf-ok').addEventListener('click', function () {
          er.style.display = 'none';
          if (!cpfValido(inp.value)) { er.textContent = 'CPF inválido. Confira os números.'; er.style.display = 'block'; return; }
          var bt = this; bt.disabled = true;
          rpc('v39_set_my_cpf', { p_cpf: soDig(inp.value) }).then(function () { toast('CPF salvo ✓'); desenhar(); })
            .catch(function (e) { er.textContent = traduz(e); er.style.display = 'block'; bt.disabled = false; });
        });
      }).catch(function (e) { b.innerHTML = '<div style="font-size:12.5px;color:#888">' + esc(traduz(e)) + '</div>'; });
    }
    desenhar();
  }
  new MutationObserver(function () {
    var m = $('g2-acessos-modal'); if (!m) return;
    ajustarLiberar(m);
    var f = m.querySelector('#g2m-form'); if (f) blocoCpf(f);
  }).observe(document.body, { childList: true, subtree: true });

  window.G2_CPF = { versao: VERSAO, cpfValido: cpfValido };
})();
