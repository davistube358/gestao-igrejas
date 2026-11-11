/* 2Gather v39 · Instituto · INST-6
   INST-6: a entrada por COMPRA só lista despesas do CNPJ do Instituto e já traz os itens comprados na despesa (produto, quantidade comprada, já recebido, valor);
   você informa quanto chegou, lote e validade. Lote obrigatório na Farmácia e nos produtos que exigem lote (mensagem clara). Requer FIN_S15 (e INST_S12).
   Base INST-5:
   INST-5: ENTRADA POR COMPRA LIGADA A UMA DESPESA DO FINANCEIRO. A NF, a aprovação, o pagamento e a contabilidade ficam no Financeiro;
   aqui só se informa o que entrou no estoque (produto, quantidade, lote, validade) e a despesa a que se refere. Requer INST_S12.
   Base INST-3:
   Substitui o app_v39_instituto.js (INST-2). Carregar DEPOIS do app.js e dos demais módulos v39. Não altera o app.js.
   Requer no Supabase: INST_S1, S2, S35, S6, S8, S7 v2 e S9 (todos validados no INST_PACOTE_teste_v2).
   INST-3
   - FARMÁCIA SOLIDÁRIA ligada ao banco: estoque, entrada (validade obrigatória), entrega com receita (foto vai para o bucket privado
     2gather-private em <igreja>/farmacia/...), limite por pessoa, estorno e "Ver receita" (link temporário de 5 minutos).
   - CADASTRO DE PESSOA PELO INSTITUTO (instCriarPessoa) com autorização LGPD; menor de 18 exige responsável. Não duplica: se já existe, vincula.
   - BAIXA vira PEDIDO: o estoque só muda depois que tesouraria, pastor ou master aprovar (quem pediu não aprova).
   - INVENTÁRIO: folha de contagem por lote e tela de aprovações (Mercado e Farmácia), em botões no topo da tela.
   - PESSOAS DO INSTITUTO: lista com situação ("Instituto", Membro, Visitante) e atividades (Mercado, Farmácia, Atendimento, Curso).
   Ainda não migrado: Agendas/Atendimentos (instDados…) — próxima etapa (INST-4). Prontuário segue bloqueado (decisão da cifra).
   Diagnóstico no Console: G2_INST.versao · G2_INST.acoes() */
(function () {
  'use strict';
  var VERSAO = 'INST-6';
  if (window.G2_INST) return;
  var M = window.G2_INST = { versao: VERSAO, ultimo: {} };
  console.info('[2Gather] instituto ' + VERSAO);

  /* ───────────── utilidades ───────────── */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function G() { return window.__gc || null; }
  function cfg() { var g = G(); try { return (g && g.cfg && g.cfg()) || {}; } catch (e) { return {}; } }
  function uuid(x) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(x || '')); }
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
  function rnd() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); }
  function dataBR(s) { var p = String(s || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }
  function q3(x) { return String(Math.round(Number(x || 0) * 1000) / 1000).replace('.', ','); }

  var MSG = {
    PERMISSION_DENIED: 'Você não tem permissão para esta ação. Peça o acesso à coordenação.',
    PRODUCT_NAME_REQUIRED: 'Informe o nome do produto.', PRODUCT_NOT_FOUND: 'Produto não encontrado ou inativo. Atualize a tela.',
    LIMIT_DAYS_INVALID: 'O período do limite deve ser de 1 a 365 dias.', LIMIT_QTY_INVALID: 'Limite inválido.',
    QUANTITY_MUST_BE_POSITIVE: 'Informe a quantidade.', INVALID_DELIVERY_QUANTITY: 'Quantidade inválida.', QUANTITY_INVALID: 'Quantidade contada inválida.',
    REASON_REQUIRED: 'Informe o motivo (mín. 5 letras).', LOT_NOT_FOUND: 'Lote não encontrado. Atualize a tela.',
    STOCK_INSUFFICIENT: 'Saldo insuficiente.', STOCK_ALREADY_USED: 'Parte desta entrada já foi entregue: estorne antes as entregas ou faça um inventário.',
    PERSON_NOT_FOUND: 'Pessoa não encontrada nesta igreja.', DELIVERY_ITEMS_REQUIRED: 'Inclua ao menos um item.',
    LIMIT_EXCEEDED: 'Limite por pessoa excedido: peça a autorização da coordenação.',
    LIMIT_EXCEPTION_REASON: 'Informe a justificativa da exceção (mín. 5 letras).',
    DELIVERY_NOT_FOUND: 'Entrega não encontrada. Atualize a tela.', DELIVERY_NOT_COMPLETED: 'Somente entrega concluída pode ser estornada.',
    MOVEMENT_NOT_FOUND: 'Só entradas se estornam aqui. Baixas e inventários aprovados se corrigem com um novo inventário.',
    ALREADY_REVERSED: 'Este lançamento já foi estornado.',
    EXPIRY_REQUIRED: 'Informe a validade do medicamento.',
    PRESCRIPTION_REQUIRED: 'Este medicamento exige receita: anexe a foto da receita.',
    PRESCRIPTION_PATH_INVALID: 'A foto da receita não foi enviada corretamente. Tente de novo.',
    PRESCRIPTION_NOT_FOUND: 'Esta entrega não tem receita.',
    CONSENT_REQUIRED: 'Sem a autorização da pessoa (LGPD) não é possível continuar.',
    CONSENT_REPRESENTATIVE_REQUIRED: 'Menor de 18 anos: informe o nome do responsável que autorizou.',
    PERSON_REQUIRED_FIELD: 'Informe o nome completo.', PERSON_INVALID_FIELD: 'Data de nascimento inválida.',
    INVENTORY_EMPTY: 'Informe a contagem de ao menos um lote.', INVENTORY_PENDING: 'Já existe baixa ou inventário aguardando aprovação para um destes lotes.',
    INVENTORY_STALE: 'O saldo de um lote mudou depois da contagem: recuse e conte de novo.',
    INVENTORY_NOT_FOUND: 'Pedido não encontrado. Atualize a tela.', INVENTORY_NOT_PENDING: 'Este pedido já foi decidido.',
    APPROVER_REQUIRED: 'Somente tesouraria, pastor ou master aprovam ajustes de estoque.',
    SELF_APPROVAL: 'Quem pediu ou contou não pode aprovar o próprio pedido.',
    PURCHASE_EXPENSE_REQUIRED: 'Escolha a despesa do Financeiro.',
    PURCHASE_EXPENSE_NOT_FOUND: 'Despesa não encontrada. Atualize a lista.',
    PURCHASE_EXPENSE_INVALID: 'Esta despesa está recusada, cancelada ou estornada e não pode receber entradas.',
    PURCHASE_EXPENSE_ENTITY: 'Esta despesa não é do CNPJ do Instituto. No Financeiro, lance a despesa com o seletor em Instituto.',
    PURCHASE_PRODUCT_NOT_IN_EXPENSE: 'Este produto não está nos itens da despesa.'
  };
  function traduz(e) {
    var t = String((e && (e.message || e.code)) || e || ''), det = (e && e.details) || '';
    for (var k in MSG) if (t === k || t.indexOf(k) === 0) {
      if (k === 'STOCK_INSUFFICIENT') { try { var j = JSON.parse(det); if (j && j.message) return 'Saldo insuficiente: ' + j.message.replace(/^Saldo insuficiente de /, '') + '.'; } catch (x) { /* sem detalhe */ } }
      return MSG[k];
    }
    if (/identifica[cç][aã]o de lote|exige.{0,20}lote/i.test(t)) return 'Este produto exige o número do lote. Informe o lote dos itens marcados com *.';
    if (/PGRST202|find the function|does not exist/i.test(t)) return 'O servidor ainda não tem esta função. Avise o administrador.';
    if (/row-level|policy|403|unauthorized/i.test(t)) return 'Sem permissão para guardar a foto da receita. Avise o administrador (bucket 2gather-private).';
    if (/Failed to fetch|NetworkError|Load failed/i.test(t)) return 'Sem conexão. Tente novamente.';
    if (/JWT|401/i.test(t)) return 'Sua sessão expirou. Entre de novo.';
    try { var d = JSON.parse(det); if (d && d.message) return d.message; } catch (x) { /* sem detalhe */ }
    return 'Não foi possível concluir. Tente novamente.';
  }
  function erro(e) { console.warn('[2Gather][instituto]', e); return new Error(traduz(e)); }
  function tipoDe(d) { return String((d && d.tipo) || 'mercado') === 'farmacia' ? 'farmacia' : 'mercado'; }
  function chamarRpc(nome, args) {
    var ig = igrejaId(); if (!ig) return Promise.reject(new Error('Igreja não identificada. Atualize a página.'));
    args.p_church_id = ig; return rpc(nome, args).catch(function (e) { throw erro(e); });
  }
  function limpo(d) { var o = {}; for (var k in d) if (d[k] !== undefined && typeof d[k] !== 'function') o[k] = d[k]; return o; }
  function aviso(msg, ms) {
    var t = $('g2i-toast');
    if (!t) { t = document.createElement('div'); t.id = 'g2i-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.style.display = 'block'; clearTimeout(aviso._t);
    aviso._t = setTimeout(function () { t.style.display = 'none'; }, ms || 6500);
  }
  function recarregarEstoque() { try { var g = G(); if (g && typeof g.estRecarregar === 'function') g.estRecarregar(); } catch (e) { /* segue */ } }

  /* receita: foto (dataURL) → bucket privado, caminho exigido pelo banco: <igreja>/farmacia/... */
  function dataUrlBlob(u) {
    var p = String(u).split(','), mime = (p[0].match(/data:([^;]+)/) || [])[1] || 'image/jpeg', bin = atob(p[1] || ''), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: mime });
  }
  function enviarReceita(dataUrl) {
    var ig = igrejaId(), d = new Date();
    var path = ig + '/farmacia/' + d.getFullYear() + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + rnd() + '.jpg';
    return cliente().then(function (c) { return c.storage.from('2gather-private').upload(path, dataUrlBlob(dataUrl), { contentType: 'image/jpeg', upsert: false }); })
      .then(function (r) { if (r.error) throw r.error; return path; });
  }

  /* ───────────── ações que o app.js chama ───────────── */
  var LEITURA = { estDados: 1, estPessoaResumo: 1, instBuscarPessoa: 1, estReceita: 1 };
  var ACOES = {
    estDados: function (d) {
      var t = tipoDe(d);
      return chamarRpc('v39_est_dados', { p_tipo: t }).then(function (r) { M.ultimo[t] = r; setTimeout(pintarBarra, 0); return r; });
    },
    estSalvarProduto: function (d) { var p = limpo(d); p.tipo = tipoDe(d); return chamarRpc('v39_est_save_product', { p: p }); },
    estEntrada: function (d) { var p = limpo(d); p.tipo = tipoDe(d); return chamarRpc('v39_est_entry', { p: p }); },
    estBaixa: function (d) {
      var p = limpo(d); p.tipo = tipoDe(d);
      return chamarRpc('v39_est_writeoff', { p: p }).then(function (r) {
        // o app mostra "Baixa registrada": aqui explica que virou pedido
        setTimeout(function () { aviso((r && r.mensagem) || 'Baixa enviada para aprovação. O estoque só muda depois de aprovada.'); }, 80);
        return r;
      });
    },
    estEstornar: function (d) { var p = limpo(d); p.tipo = tipoDe(d); return chamarRpc('v39_est_reverse', { p: p }); },
    estPessoaResumo: function (d) {
      return chamarRpc('v39_est_person_summary', { p: { tipo: tipoDe(d), pessoaId: d.pessoaId } })
        .then(function (r) { return { retirado: (r && r.retirado) || {}, ultimas: (r && r.ultimas) || [] }; });
    },
    estSaida: function (d) {
      var t = tipoDe(d), p = limpo(d), rec = d.receita;
      delete p.receita; p.tipo = t;
      p.itens = (d.itens || []).map(function (i) { return { produtoId: i.produtoId, qtd: i.qtd }; });
      if (t !== 'farmacia' || !rec || !rec.imagem) return chamarRpc('v39_est_delivery', { p: p });
      return enviarReceita(rec.imagem).catch(function (e) { throw erro(e); }).then(function (path) {
        p.receita = { arquivo: path, prescritor: rec.prescritor || '' };
        return chamarRpc('v39_est_delivery', { p: p });
      });
    },
    estReceita: function (d) {
      return chamarRpc('v39_est_prescription', { p: { entregaId: d.entregaId } }).then(function (r) {
        return cliente().then(function (c) { return c.storage.from(r.bucket || '2gather-private').createSignedUrl(r.arquivo, 300); })
          .then(function (s) { if (s.error) throw erro(s.error); return { img: s.data.signedUrl, prescritor: [r.prescritor, r.registro].filter(Boolean).join(' · ') }; });
      });
    },
    instBuscarPessoa: function (d) { return chamarRpc('v39_inst_people_search', { p_q: String((d && d.q) || '') }); },
    instCriarPessoa: function (d) {
      var x = limpo((d && d.pessoa) || {});
      x.consent = x.consent || x.consentimento || '';
      if (x.foto) { delete x.foto; setTimeout(function () { aviso('O cadastro foi feito sem a foto: a foto do atendido chega numa próxima etapa.'); }, 80); }
      return chamarRpc('v39_inst_create_person', { p: { pessoa: x } });
    }
  };
  M.acoes = function () { return Object.keys(ACOES); };
  M._ACOES = ACOES; M._traduz = traduz;

  function instalar() {
    var V = window.G2_V39; if (!V || !V.p1) return false;
    var P = V.p1; if (P.__inst) return true;
    if (typeof P.isMutation !== 'function' || typeof P.isRead !== 'function') return false;
    var isM = P.isMutation, isR = P.isRead, ex = P.execute, rd = P.read;
    P.isMutation = function (a) { return ACOES[a] ? !LEITURA[a] : isM.apply(P, arguments); };
    P.isRead = function (a) { return ACOES[a] ? !!LEITURA[a] : isR.apply(P, arguments); };
    P.execute = function (a, d) { return ACOES[a] ? ACOES[a](d || {}) : (typeof ex === 'function' ? ex.apply(P, arguments) : Promise.reject(new Error('Acao v39 nao mapeada: ' + a))); };
    P.read = function (a, d) { return ACOES[a] ? ACOES[a](d || {}) : (typeof rd === 'function' ? rd.apply(P, arguments) : Promise.reject(new Error('Acao v39 nao mapeada: ' + a))); };
    P.__inst = true;
    recarregarEstoque();   // o app pode ter aberto direto no Mercado/Farmácia antes deste módulo
    return true;
  }
  var tent = 0, tm = setInterval(function () { if (instalar() || ++tent > 240) clearInterval(tm); }, 250);
  instalar();

  /* ───────────── estilo e janela própria (fecha só pelo X, Cancelar ou Esc) ───────────── */
  function css() {
    if ($('g2i-css')) return;
    var s = document.createElement('style'); s.id = 'g2i-css';
    s.textContent = [
      '#g2i-bar{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}',
      '#g2i-bar button{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 13px;border:none;border-radius:11px;background:#EEF0F4;color:#14161A;font:inherit;font-weight:700;font-size:12.5px;cursor:pointer}',
      '#g2i-bar button.pri{background:var(--pri,#2F5BEA);color:#fff}#g2i-bar button b{background:#E5484D;color:#fff;border-radius:99px;padding:1px 7px;font-size:11px}',
      '#g2i-bar button:focus-visible,#g2i-mod button:focus-visible{outline:2px solid var(--pri,#2F5BEA);outline-offset:2px}',
      '#g2i-mod{position:fixed;inset:0;background:rgba(20,22,26,.45);z-index:9996;display:flex;align-items:flex-end;justify-content:center}',
      '#g2i-mod .box{position:relative;display:flex;flex-direction:column;background:#fff;color:#14161A;width:100%;max-width:640px;max-height:92vh;overflow:hidden;border-radius:22px 22px 0 0;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}',
      '@media(min-width:700px){#g2i-mod{align-items:center}#g2i-mod .box{border-radius:22px}}',
      '#g2i-mod .bd{overflow:auto;padding:18px 16px}#g2i-mod h3{margin:0 0 6px;padding-right:42px;font-size:17px}',
      '#g2i-mod .x{position:absolute;top:10px;right:10px;width:34px;height:34px;border:none;border-radius:50%;background:#EEF0F4;font-size:18px;cursor:pointer}',
      '#g2i-mod .sb{font-size:12.5px;color:#5E6470}#g2i-mod label{display:block;font-size:12px;color:#5E6470;margin:10px 0 4px;font-weight:700}',
      '#g2i-mod input,#g2i-mod select,#g2i-mod textarea{width:100%;box-sizing:border-box;border:1.5px solid #ECEEF1;border-radius:12px;padding:10px;font:inherit;font-size:15px;background:#fff;color:#14161A}',
      '#g2i-mod .ln{display:flex;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid #F0F1F4}#g2i-mod .ln .i{flex:1;min-width:0}',
      '#g2i-mod .ln .i b{display:block;font-size:13.5px}#g2i-mod .ln .i small{display:block;font-size:11.5px;color:#5E6470}',
      '#g2i-mod .ln input{width:96px;flex:0 0 96px;text-align:right}',
      '#g2i-mod .pl{display:inline-block;border-radius:99px;padding:2px 8px;font-size:11px;font-weight:700;background:#EEF0F4;color:#5E6470;margin:2px 3px 0 0}',
      '#g2i-mod .pl.v{background:#E7F7EF;color:#16A36A}#g2i-mod .pl.a{background:#FFF5DC;color:#8A5A00}#g2i-mod .pl.r{background:#FDECEC;color:#C2262B}#g2i-mod .pl.d{background:#EAF0FF;color:#2F5BEA}',
      '#g2i-mod .chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}#g2i-mod .chips button{height:32px;padding:0 11px;border:none;border-radius:99px;background:#EEF0F4;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}',
      '#g2i-mod .chips button.on{background:#14161A;color:#fff}',
      '#g2i-mod .ft{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}',
      '#g2i-mod .ft button,#g2i-mod .bt{height:40px;padding:0 16px;border:none;border-radius:12px;background:var(--pri,#2F5BEA);color:#fff;font:inherit;font-weight:800;cursor:pointer}',
      '#g2i-mod .bt.s{background:#EEF0F4;color:#14161A}#g2i-mod .bt.r{background:#FDECEC;color:#C2262B}#g2i-mod .bt.sm{height:32px;padding:0 11px;font-size:12.5px}',
      '#g2i-mod .card{border:1px solid #ECEEF1;border-radius:14px;padding:12px;margin:10px 0}#g2i-mod .err{color:#E5484D;font-size:13px;min-height:1em;margin-top:8px}',
      '#g2i-mod .vazio{color:#9AA1AC;text-align:center;padding:18px 6px}','#g2i-mod .gr2{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}',
      '#g2i-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:96px;z-index:10000;background:#14161A;color:#fff;padding:11px 16px;border-radius:14px;max-width:90vw;display:none;font:13.5px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;border-left:4px solid #C9930A}',
      '@media (prefers-color-scheme:dark){#g2i-mod .box{background:#1d2026;color:#eceef1}#g2i-mod input,#g2i-mod select,#g2i-mod textarea{background:#14161A;color:#eceef1;border-color:#2a2e36}}'
    ].join('\n');
    document.head.appendChild(s);
  }
  function abrir(html) {
    css(); fechar();
    var o = document.createElement('div'); o.id = 'g2i-mod';
    o.innerHTML = '<div class="box" role="dialog" aria-modal="true"><button type="button" class="x" data-i="fechar" aria-label="Fechar">×</button><div class="bd">' + html + '</div></div>';
    document.body.appendChild(o);
    o.addEventListener('click', cliqueMod); o.addEventListener('input', digitaMod);
    return o;
  }
  function fechar() { var o = $('g2i-mod'); if (o) o.remove(); }
  function corpo(html) { var o = $('g2i-mod'); if (o) o.querySelector('.bd').innerHTML = html; }
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && $('g2i-mod')) fechar(); });

  /* ───────────── barra de botões no topo das telas do Instituto ───────────── */
  var NOME = { mercado: 'Mercado', farmacia: 'Farmácia' };
  function abaAtual() { return String(cfg().aba || ''); }
  function tipoDaAba() { var a = abaAtual(); return a === 'instfarmacia' ? 'farmacia' : a === 'instmercado' ? 'mercado' : ''; }
  function pintarBarra() {
    var main = $('main'), a = abaAtual();
    if (!main || !cfg().token || !/^inst(ituto|mercado|farmacia|cursos)$/.test(a)) return;
    var t = tipoDaAba(), u = t ? M.ultimo[t] : null, perm = (u && u.perm) || {};
    var h = '';
    if (t && (perm.ajuste || perm.aprovador)) {
      var pend = (u && u.resumo && u.resumo.ajustesPendentes) || 0;
      if (perm.ajuste) h += '<button type="button" class="pri" data-i="inv" data-v="' + t + '">Contagem de inventário</button>';
      h += '<button type="button" data-i="apr" data-v="' + t + '">' + (perm.aprovador ? 'Aprovar baixas e inventários' : 'Meus pedidos de ajuste') + (pend ? ' <b>' + pend + '</b>' : '') + '</button>';
    }
    if (t && perm.operador !== false) h += '<button type="button" data-i="cmp" data-v="' + t + '">Entrada por compra</button>';
    h += '<button type="button" data-i="pes">Pessoas do Instituto</button>';
    var bar = $('g2i-bar');
    if (bar && main.contains(bar)) { if (bar.getAttribute('data-sig') !== a + h) { bar.innerHTML = h; bar.setAttribute('data-sig', a + h); } return; }
    if (bar) bar.remove();
    css();
    bar = document.createElement('div'); bar.id = 'g2i-bar'; bar.innerHTML = h; bar.setAttribute('data-sig', a + h);
    bar.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-i]'); if (!b) return;
      var k = b.getAttribute('data-i'), v = b.getAttribute('data-v');
      if (k === 'inv') abrirInventario(v); else if (k === 'apr') abrirAprovacoes(v, 'pending'); else if (k === 'pes') abrirPessoas('todos'); else if (k === 'cmp') M.abrirCompra(v, '');
    });
    var tabs = main.querySelector('.tabs'), sub = main.querySelector('.ini-sub');
    var ref = tabs && tabs.querySelector('[data-a="instTab"]') ? tabs : sub;
    if (ref && ref.parentNode) ref.parentNode.insertBefore(bar, ref.nextSibling); else main.insertBefore(bar, main.firstChild);
  }
  setInterval(pintarBarra, 1200);
  (function observar() {
    var main = $('main'); if (!main) { setTimeout(observar, 400); return; }
    try { new MutationObserver(function () { setTimeout(pintarBarra, 0); }).observe(main, { childList: true }); } catch (e) { /* o intervalo cobre */ }
  })();

  /* ───────────── inventário: folha de contagem ───────────── */
  var INV = null;
  var MOTIVOS_INV = ['Inventário', 'Ajuste de inventário', 'Vencido', 'Avariado', 'Perda', 'Outro'];
  function abrirInventario(t) {
    abrir('<h3>Contagem de inventário · ' + NOME[t] + '</h3><div class="vazio">Carregando a folha de contagem…</div>');
    chamarRpc('v39_est_inventory_sheet', { p_tipo: t }).then(function (l) {
      INV = { tipo: t, linhas: Array.isArray(l) ? l : [], busca: '' };
      pintarInventario();
    }).catch(function (e) { corpo('<h3>Contagem de inventário</h3><div class="err">' + esc(e.message) + '</div>'); });
  }
  function linhasInv() {
    var q = String(INV.busca || '').toLowerCase();
    return INV.linhas.filter(function (x) { return !q || String(x.produto + ' ' + x.lote).toLowerCase().indexOf(q) >= 0; });
  }
  function htmlLinhasInv() {
    var l = linhasInv();
    if (!l.length) return '<div class="vazio">' + (INV.linhas.length ? 'Nenhum item com esta busca.' : 'Nenhum lote em estoque.') + '</div>';
    return l.map(function (x) {
      var v = INV.cont && INV.cont[x.loteId] != null ? INV.cont[x.loteId] : '';
      return '<div class="ln"><div class="i"><b>' + esc(x.produto) + '</b><small>' + esc([x.lote ? 'lote ' + x.lote : 'sem lote', x.validade ? 'val. ' + dataBR(x.validade) : '', 'sistema: ' + q3(x.sistema) + ' ' + x.unidade].filter(Boolean).join(' · ')) +
        (x.pendente ? ' · <span class="pl a">pedido aguardando</span>' : '') + '</small></div>' +
        '<input type="text" inputmode="decimal" data-lote="' + esc(x.loteId) + '" value="' + esc(v) + '" placeholder="' + esc(q3(x.sistema)) + '"' + (x.pendente ? ' disabled title="Já há pedido aguardando aprovação para este lote"' : '') + ' aria-label="Quantidade contada de ' + esc(x.produto) + '"></div>';
    }).join('');
  }
  function pintarInventario() {
    INV.cont = INV.cont || {};
    corpo('<h3>Contagem de inventário · ' + NOME[INV.tipo] + '</h3>' +
      '<div class="sb">Digite a quantidade <b>contada</b> só dos lotes conferidos. Em branco = não conferido (fica como está). As diferenças vão para aprovação de tesouraria, pastor ou master; quem contou não aprova.</div>' +
      '<label for="g2i-busca">Buscar produto</label><input id="g2i-busca" data-k="busca" autocomplete="off" value="' + esc(INV.busca) + '">' +
      '<div id="g2i-lin">' + htmlLinhasInv() + '</div>' +
      '<label for="g2i-mot">Motivo</label><select id="g2i-mot">' + MOTIVOS_INV.map(function (m) { return '<option>' + esc(m) + '</option>'; }).join('') + '</select>' +
      '<label for="g2i-obs">Observação</label><input id="g2i-obs" maxlength="300">' +
      '<div class="err" id="g2i-err" aria-live="polite"></div>' +
      '<div class="ft"><button type="button" class="bt s" data-i="fechar">Cancelar</button><button type="button" data-i="invEnviar">Enviar contagem</button></div>');
  }
  function lerContagem() {
    var ins = document.querySelectorAll('#g2i-mod input[data-lote]');
    Array.prototype.forEach.call(ins, function (i) { INV.cont[i.getAttribute('data-lote')] = i.value.trim(); });
  }
  function enviarInventario() {
    lerContagem();
    var err = $('g2i-err'), linhas = [], ruim = '';
    Object.keys(INV.cont).forEach(function (k) {
      var v = INV.cont[k]; if (v === '') return;
      var n = Number(String(v).replace(',', '.'));
      if (!isFinite(n) || n < 0) { ruim = v; return; }
      linhas.push({ loteId: k, contado: n });
    });
    if (ruim) { err.textContent = 'Quantidade inválida: "' + ruim + '".'; return; }
    if (!linhas.length) { err.textContent = 'Informe a contagem de ao menos um lote.'; return; }
    var b = document.querySelector('#g2i-mod [data-i="invEnviar"]'); b.disabled = true; b.textContent = 'Enviando…';
    chamarRpc('v39_est_inventory_submit', { p: { tipo: INV.tipo, motivo: $('g2i-mot').value, obs: $('g2i-obs').value, linhas: linhas } }).then(function (r) {
      fechar(); aviso((r && r.mensagem) || 'Contagem enviada.'); recarregarEstoque();
    }).catch(function (e) { err.textContent = e.message; b.disabled = false; b.textContent = 'Enviar contagem'; });
  }

  /* ───────────── aprovações de baixa e inventário ───────────── */
  var APR = null;
  function abrirAprovacoes(t, st) {
    APR = { tipo: t, status: st, lista: [] };
    abrir('<h3>Ajustes de estoque · ' + NOME[t] + '</h3><div class="vazio">Carregando…</div>');
    carregarAprovacoes();
  }
  function carregarAprovacoes() {
    chamarRpc('v39_est_inventory_list', { p_status: APR.status, p_tipo: APR.tipo }).then(function (r) {
      APR.lista = (r && r.pedidos) || []; APR.aprovador = !!(r && r.aprovador); pintarAprovacoes();
    }).catch(function (e) { corpo('<h3>Ajustes de estoque</h3><div class="err">' + esc(e.message) + '</div>'); });
  }
  var ST_INV = { pending: ['a', 'aguardando'], approved: ['v', 'aprovado'], rejected: ['r', 'recusado'], cancelled: ['', 'cancelado'] };
  function pintarAprovacoes() {
    var h = '<h3>Ajustes de estoque · ' + NOME[APR.tipo] + '</h3><div class="sb">Baixas e contagens de inventário só mudam o estoque depois de aprovadas por tesouraria, pastor ou master (quem pediu não aprova).</div>' +
      '<div class="chips"><button type="button" data-i="aprSt" data-v="pending" class="' + (APR.status === 'pending' ? 'on' : '') + '">Aguardando</button><button type="button" data-i="aprSt" data-v="" class="' + (APR.status === '' ? 'on' : '') + '">Histórico</button></div>';
    if (!APR.lista.length) h += '<div class="vazio">' + (APR.status === 'pending' ? 'Nenhum pedido aguardando.' : 'Nenhum pedido.') + '</div>';
    APR.lista.forEach(function (c) {
      var s = ST_INV[c.status] || ['', c.status];
      h += '<div class="card"><div class="ln" style="border:none;padding-top:0"><div class="i"><b>' + (c.tipo === 'baixa' ? 'Baixa' : 'Inventário') + ' · ' + esc(c.motivo) + '</b>' +
        '<small>pedido por ' + esc(c.pedidoPor || '—') + ' em ' + esc(new Date(c.pedidoEm).toLocaleString('pt-BR')) + (c.obs ? ' · ' + esc(c.obs) : '') +
        (c.decididoPor ? '<br>' + esc(s[1]) + ' por ' + esc(c.decididoPor) + (c.decisao ? ': ' + esc(c.decisao) : '') : '') + '</small></div><span class="pl ' + s[0] + '">' + esc(s[1]) + '</span></div>' +
        (c.linhas || []).map(function (l) {
          var d = Number(l.diferenca), mudou = c.status === 'pending' && Number(l.saldoAtual) !== Number(l.sistema);
          return '<div class="ln"><div class="i"><b>' + esc(l.produto) + (l.lote ? ' · lote ' + esc(l.lote) : '') + '</b><small>sistema ' + q3(l.sistema) + ' → contado ' + q3(l.contado) + ' ' + esc(l.unidade) +
            (mudou ? ' · <span class="pl r">saldo mudou: ' + q3(l.saldoAtual) + '</span>' : '') + '</small></div><span class="pl ' + (d < 0 ? 'r' : 'v') + '">' + (d > 0 ? '+' : '') + q3(d) + '</span></div>';
        }).join('') +
        (c.status === 'pending' ? '<div class="ft">' + (c.meu ? '<button type="button" class="bt s sm" data-i="aprDec" data-v="cancel|' + esc(c.id) + '">Cancelar pedido</button>' : '') +
          (c.podeDecidir ? '<button type="button" class="bt r sm" data-i="aprDec" data-v="reject|' + esc(c.id) + '">Recusar</button><button type="button" class="bt sm" data-i="aprDec" data-v="approve|' + esc(c.id) + '">Aprovar</button>' : '') +
          (!c.meu && !c.podeDecidir ? '<span class="sb">' + (APR.aprovador ? 'Você não pode decidir este pedido.' : 'Aguardando tesouraria, pastor ou master.') + '</span>' : '') + '</div>' : '') + '</div>';
    });
    corpo(h + '<div class="err" id="g2i-err" aria-live="polite"></div><div class="ft"><button type="button" class="bt s" data-i="fechar">Fechar</button></div>');
  }
  function decidir(v) {
    var p = String(v).split('|'), dec = p[0], id = p[1], motivo = null;
    if (dec === 'reject') { motivo = prompt('Motivo da recusa (mín. 5 letras):', ''); if (motivo === null) return; if (motivo.trim().length < 5) return aviso('Informe o motivo da recusa (mín. 5 letras).'); }
    if (dec === 'approve' && !confirm('Aprovar este ajuste? O estoque será alterado agora.')) return;
    if (dec === 'cancel' && !confirm('Cancelar este pedido?')) return;
    chamarRpc('v39_est_inventory_decide', { p_id: id, p_decision: dec, p_reason: motivo }).then(function (r) {
      aviso(dec === 'approve' ? 'Ajuste aprovado ✓ ' + ((r && r.ajustes) || 0) + ' lote(s) alterado(s).' : dec === 'reject' ? 'Pedido recusado.' : 'Pedido cancelado.');
      recarregarEstoque(); carregarAprovacoes();
    }).catch(function (e) { var er = $('g2i-err'); if (er) er.textContent = e.message; else aviso(e.message); });
  }

  /* ───────────── pessoas do Instituto ───────────── */
  var PES = null;
  var FILTROS = [['todos', 'Todas', null], ['instituto', 'Só do Instituto', null], ['mercado', 'Mercado', null], ['farmacia', 'Farmácia', 'farmacia'], ['atendimento', 'Atendimentos', 'atendimentos'], ['curso', 'Cursos', 'cursos']];
  function abrirPessoas(f) {
    PES = { filtro: f, busca: '', lista: [], mostra: {} };
    abrir('<h3>Pessoas do Instituto</h3><div class="vazio">Carregando…</div>');
    carregarPessoas();
  }
  function carregarPessoas() {
    chamarRpc('v39_inst_people', { p_filtro: PES.filtro }).then(function (r) {
      PES.lista = (r && r.pessoas) || []; PES.mostra = (r && r.mostra) || {}; pintarPessoas();
    }).catch(function (e) { corpo('<h3>Pessoas do Instituto</h3><div class="err">' + esc(e.message) + '</div>'); });
  }
  function htmlListaPes() {
    var q = String(PES.busca || '').toLowerCase();
    var l = PES.lista.filter(function (p) { return !q || String(p.nome + ' ' + p.codigo).toLowerCase().indexOf(q) >= 0; });
    if (!l.length) return '<div class="vazio">Ninguém encontrado.</div>';
    var CLS = { Instituto: 'd', Membro: 'v', Visitante: 'a', Inativo: '' };
    return '<div class="sb" style="margin:6px 0">' + l.length + ' pessoa(s)</div>' + l.map(function (p) {
      var ex = [];
      if (p.mercado) ex.push(p.mercado + ' entrega(s) no Mercado' + (p.ultimaMercado ? ', última ' + dataBR(p.ultimaMercado) : ''));
      if (PES.mostra.farmacia && p.farmacia) ex.push(p.farmacia + ' na Farmácia');
      if (PES.mostra.atendimentos && p.atendimentos) ex.push(p.atendimentos + ' atendimento(s)');
      if (PES.mostra.cursos && p.cursos) ex.push(p.cursos + ' curso(s)');
      return '<div class="ln"><div class="i"><b>' + esc(p.nome) + '</b><small>' + esc(p.codigo) + (p.desde ? ' · desde ' + dataBR(p.desde) : '') + (ex.length ? ' · ' + esc(ex.join(' · ')) : '') + '</small>' +
        (p.atividades || []).map(function (a) { return '<span class="pl">' + esc(a === 'Farmacia' ? 'Farmácia' : a) + '</span>'; }).join('') + '</div>' +
        '<span class="pl ' + (CLS[p.situacao] || '') + '">' + esc(p.situacao) + '</span></div>';
    }).join('');
  }
  function pintarPessoas() {
    var chips = FILTROS.filter(function (f) { return !f[2] || PES.mostra[f[2]]; });
    corpo('<h3>Pessoas do Instituto</h3><div class="sb">Quem foi cadastrado pelo Instituto aparece como <b>Instituto</b>; no cadastro da igreja continua como visitante, sem ir para GC ou Lar de Vida.</div>' +
      '<div class="chips">' + chips.map(function (f) { return '<button type="button" data-i="pesF" data-v="' + f[0] + '" class="' + (PES.filtro === f[0] ? 'on' : '') + '">' + f[1] + '</button>'; }).join('') + '</div>' +
      '<label for="g2i-bp">Buscar nome ou código</label><input id="g2i-bp" data-k="buscaP" autocomplete="off" value="' + esc(PES.busca) + '">' +
      '<div id="g2i-pl">' + htmlListaPes() + '</div>' +
      '<div class="ft"><button type="button" class="bt s" data-i="fechar">Fechar</button><button type="button" data-i="pesNova">+ Cadastrar pessoa</button></div>');
  }
  function novaPessoa() {
    fechar();
    var b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-a', 'instNovoAtendido'); b.style.display = 'none';
    document.body.appendChild(b); b.click(); b.remove();   // usa o formulário de cadastro com LGPD que o app já tem
  }

  /* ───────────── INST-6: entrada por compra ligada a uma despesa do Financeiro (só do CNPJ do Instituto) ───────────── */
  var CP = null;
  function brl(n) { return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function num(t) {
    var s = String(t == null ? '' : t).trim(); if (!s) return NaN;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    var n = Number(s); return isFinite(n) ? n : NaN;
  }
  function fq(n) { return String(Math.round(Number(n || 0) * 1000) / 1000).replace('.', ','); }
  function cnpjFmt(t) { var d = String(t || '').replace(/\D/g, ''); return d.length === 14 ? d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-' + d.slice(12) : d; }
  var ST_DESP = { draft: ['', 'rascunho'], pending_approval: ['a', 'aguardando aprovação'], correction_requested: ['a', 'correção pedida'], approved: ['d', 'aprovada'], partially_paid: ['d', 'parcialmente paga'], paid: ['v', 'paga'] };
  function exigeLote(it) {
    var p = (CP.produtos || []).filter(function (x) { return String(x.id) === String(it.produtoId); })[0] || {};
    return CP.tipo === 'farmacia' || !!(p.exigeLote || p.controlaLote || p.controla_lote || p.requerLote) || !!it.exigeLote;
  }
  M.abrirCompra = function (tipo, prodId) {
    tipo = tipo === 'farmacia' ? 'farmacia' : 'mercado';
    CP = { tipo: tipo, itens: [{ produtoId: prodId || '', qtd: '', lote: '', validade: '' }], fixo: false, despesaId: '', obs: '', busca: '', produtos: [], despesas: [] };
    abrir('<h3>Entrada por compra · ' + NOME[tipo] + '</h3><div class="vazio">Carregando produtos e despesas…</div>');
    var pDados = M.ultimo[tipo] ? Promise.resolve(M.ultimo[tipo]) : ACOES.estDados({ tipo: tipo });
    Promise.all([pDados, chamarRpc('v39_est_expenses_open', { p_tipo: tipo })]).then(function (r) {
      CP.produtos = ((r[0] && r[0].produtos) || []).filter(function (p) { return p.ativa !== false; });
      CP.despesas = (r[1] && r[1].despesas) || [];
      if (!CP.produtos.length) return corpo('<h3>Entrada por compra</h3><div class="vazio">Cadastre um produto primeiro.</div><div class="ft"><button type="button" class="bt s" data-i="fechar">Fechar</button></div>');
      pintarCompra();
    }).catch(function (e) {
      corpo('<h3>Entrada por compra</h3><div class="err">' + esc(e.message) + '</div><div class="ft"><button type="button" class="bt s" data-i="fechar">Fechar</button></div>');
    });
  };
  function opt(l, sel, vazio) { return (vazio ? '<option value="">' + vazio + '</option>' : '') + l.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (String(x[0]) === String(sel) ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join(''); }
  function despDe(id) { return CP.despesas.filter(function (d) { return d.id === id; })[0] || null; }
  function linhasDaDespesa(d) {
    var its = (d && d.itens) || [];
    if (!its.length) return [{ produtoId: '', qtd: '', lote: '', validade: '' }];
    return its.map(function (i) {
      var rest = Math.max(0, Math.round((Number(i.qtd) - Number(i.recebido || 0)) * 1000) / 1000);
      return { produtoId: i.produtoId, desc: i.descricao, unidade: i.unidade || 'un', comprada: Number(i.qtd), recebido: Number(i.recebido || 0), restante: rest, valorUnit: Number(i.valorUnit || 0), qtd: rest > 0 ? fq(rest) : '', lote: '', validade: '', fixo: true };
    });
  }
  function escolherDespesa(id) {
    lerCompra(); CP.despesaId = id; var d = despDe(id);
    CP.fixo = !!(d && (d.itens || []).length); CP.itens = linhasDaDespesa(d); pintarCompra();
  }
  function lerCompra() {
    if (!CP || !$('cp-obs')) return;
    CP.obs = $('cp-obs').value.trim();
    CP.itens.forEach(function (it, i) { ['produtoId', 'qtd', 'lote', 'validade'].forEach(function (k) { var el = $('cp-' + k + '-' + i); if (el) it[k] = el.value.trim(); }); });
  }
  function despFiltradas() {
    var q = String(CP.busca || '').toLowerCase();
    return CP.despesas.filter(function (d) { return !q || String([d.fornecedor, d.descricao, d.numero].join(' ')).toLowerCase().indexOf(q) >= 0 || d.id === CP.despesaId; }).slice(0, 25);
  }
  function resumoItens(d) { return (d.itens || []).map(function (i) { return fq(i.qtd) + ' ' + (i.unidade || 'un') + ' ' + i.descricao; }).join(' · '); }
  function htmlDespesas() {
    var l = despFiltradas();
    if (!CP.despesas.length) return '<div class="vazio">Nenhuma despesa do <b>CNPJ do Instituto</b> encontrada.<br>No Financeiro, troque o seletor para <b>Instituto</b>, lance a despesa (com os itens comprados) e volte aqui.</div>';
    if (!l.length) return '<div class="vazio">Nenhuma despesa com esta busca.</div>';
    return l.map(function (d) {
      var s = ST_DESP[d.status] || ['', d.status], on = d.id === CP.despesaId, tit = resumoItens(d);
      return '<div class="ln" style="cursor:pointer;border-radius:10px;padding:9px 8px;' + (on ? 'background:#EAF0FF;border:1.5px solid #2F5BEA' : '') + '" data-i="cpEsc" data-v="' + esc(d.id) + '" role="button" tabindex="0">' +
        '<div class="i"><b>' + esc(d.fornecedor || 'Sem fornecedor') + ' · ' + brl(d.valor) + '</b><small>' + esc([d.numero, d.descricao].filter(Boolean).join(' · ')) + '</small>' +
        (tit ? '<small>Itens: ' + esc(tit) + '</small>' : '<small>Sem itens informados: escolha os produtos na entrada.</small>') +
        '<small>emissão ' + (d.emissao ? dataBR(d.emissao) : '—') + ' · Instituto' + (d.cnpj ? ' · CNPJ ' + esc(cnpjFmt(d.cnpj)) : '') + (d.entradas ? ' · ' + d.entradas + ' entrada(s) já ligada(s)' : '') + '</small></div>' +
        '<span class="pl ' + s[0] + '">' + (on ? '✓ ' : '') + esc(s[1]) + '</span></div>';
    }).join('');
  }
  function totalEntrada() {
    return Math.round(CP.itens.reduce(function (t, it) { var q = num(it.qtd); return t + (q > 0 && it.valorUnit > 0 ? q * it.valorUnit : 0); }, 0) * 100) / 100;
  }
  function htmlLinhas() {
    var far = CP.tipo === 'farmacia', prods = CP.produtos.map(function (p) { return [p.id, p.nome + (p.apresentacao ? ' · ' + p.apresentacao : '') + ' (' + (p.unidade || 'un') + ')']; });
    return CP.itens.map(function (it, i) {
      var reqL = exigeLote(it), campos =
        '<div class="gr2"><div><label for="cp-qtd-' + i + '">Quantidade que chegou' + (it.fixo ? '' : ' *') + '</label><input id="cp-qtd-' + i + '" inputmode="decimal" value="' + esc(it.qtd) + '"></div>' +
        '<div><label for="cp-lote-' + i + '">Lote' + (reqL ? ' *' : ' (opcional)') + '</label><input id="cp-lote-' + i + '" value="' + esc(it.lote) + '"></div></div>' +
        '<label for="cp-validade-' + i + '">Validade' + (far ? ' *' : ' (opcional)') + '</label><input id="cp-validade-' + i + '" type="date" value="' + esc(it.validade) + '">';
      if (it.fixo) {
        return '<div style="border-bottom:1px solid #F0F1F4;padding:8px 0 10px"><b>' + esc(it.desc) + '</b>' +
          '<div class="sb">comprado ' + fq(it.comprada) + ' ' + esc(it.unidade) + ' · já recebido ' + fq(it.recebido) + ' · <b>falta ' + fq(it.restante) + '</b>' + (it.valorUnit > 0 ? ' · ' + brl(it.valorUnit) + ' cada' : '') + '</div>' + campos + '</div>';
      }
      return '<div style="border-bottom:1px solid #F0F1F4;padding:6px 0 10px"><label for="cp-produtoId-' + i + '">Produto *</label><div style="display:flex;gap:8px"><select id="cp-produtoId-' + i + '" style="flex:1">' + opt(prods, it.produtoId, 'Escolha…') + '</select>' +
        (CP.itens.length > 1 ? '<button type="button" class="bt r sm" data-i="cpRem" data-v="' + i + '" aria-label="Remover item ' + (i + 1) + '">×</button>' : '') + '</div>' + campos + '</div>';
    }).join('');
  }
  function pintarCompra() {
    var d = despDe(CP.despesaId);
    var h = '<h3>Entrada por compra · ' + NOME[CP.tipo] + '</h3>' +
      '<div class="sb">A NF, a aprovação e o pagamento ficam no <b>Financeiro</b>. Aqui você confere o que chegou e registra no estoque. Só aparecem despesas lançadas no <b>CNPJ do Instituto</b>.</div>' +
      '<div class="card"><b>1. Despesa do Financeiro *</b>' +
      '<label for="cp-busca">Buscar por fornecedor, descrição ou número</label><input id="cp-busca" data-k="cpbusca" autocomplete="off" value="' + esc(CP.busca) + '">' +
      '<div id="cp-lista" style="max-height:30vh;overflow:auto;margin-top:6px">' + htmlDespesas() + '</div></div>';
    if (!CP.despesaId) h += '<div class="card"><div class="vazio">Escolha a despesa acima para ver os itens comprados.</div></div>';
    else {
      h += '<div class="card"><b>2. O que chegou no estoque</b>' +
        (CP.fixo ? '<div class="sb">Itens da despesa de ' + esc((d && d.fornecedor) || 'fornecedor') + '. Deixe a quantidade <b>em branco</b> no que ainda não chegou.</div>' : '<div class="sb">Esta despesa não tem itens informados: escolha os produtos.</div>') +
        '<div id="cp-linhas">' + htmlLinhas() + '</div>' +
        (CP.fixo ? '' : '<div class="ft" style="justify-content:flex-start"><button type="button" class="bt s sm" data-i="cpAdd">+ Item</button></div>') +
        '<div class="sb" id="cp-tot" style="text-align:right;margin-top:6px">' + (CP.fixo ? 'Valor desta entrada: <b>' + brl(totalEntrada()) + '</b> de ' + brl(d && d.valor) : '') + '</div>' +
        '<label for="cp-obs">Observação</label><input id="cp-obs" maxlength="150" value="' + esc(CP.obs) + '"></div>';
    }
    h += '<div class="err" id="g2i-err" aria-live="polite"></div>' +
      '<div class="ft"><button type="button" class="bt s" data-i="fechar">Cancelar</button><button type="button" data-i="cpSalvar">Registrar entrada</button></div>';
    corpo(h);
  }
  function validarCompra() {
    var far = CP.tipo === 'farmacia', algum = false;
    if (!CP.despesaId) return 'Escolha a despesa do Financeiro.';
    for (var i = 0; i < CP.itens.length; i++) {
      var it = CP.itens[i], q = num(it.qtd);
      if (it.fixo && !(q > 0)) continue;
      if (!it.produtoId) return 'Escolha o produto do item ' + (i + 1) + '.';
      if (!(q > 0)) return 'Informe a quantidade do item ' + (i + 1) + '.';
      if (far && !it.validade) return 'Informe a validade do item ' + (i + 1) + ' (medicamento).';
      if (exigeLote(it) && !it.lote) { it.exigeLote = true; return 'Informe o lote do item ' + (i + 1) + ': este produto exige identificação de lote.'; }
      algum = true;
    }
    if (!algum) return 'Informe a quantidade que chegou de ao menos um item.';
    return '';
  }
  function salvarCompra(btn) {
    lerCompra();
    var err = $('g2i-err'), msg = validarCompra();
    if (msg) { err.textContent = msg; pintarCompraMantendoErro(msg); return; }
    var d = despDe(CP.despesaId) || {}, linhas = CP.itens.filter(function (it) { return num(it.qtd) > 0; });
    var acima = linhas.filter(function (it) { return it.fixo && num(it.qtd) > it.restante + 0.0005; });
    var q = 'Registrar a entrada no estoque ligada à despesa de ' + (d.fornecedor || 'fornecedor') + ' (' + brl(d.valor) + ')?';
    if (acima.length) q = 'Atenção: ' + acima.map(function (it) { return it.desc + ' (chegou ' + it.qtd + ', faltava ' + fq(it.restante) + ')'; }).join('; ') + ' — quantidade maior que a comprada.\n\n' + q;
    if (!confirm(q)) return;
    btn.disabled = true; btn.textContent = 'Registrando…';
    chamarRpc('v39_est_purchase_link', { p: { tipo: CP.tipo, despesaId: CP.despesaId, obs: CP.obs,
      itens: linhas.map(function (it) { return { produtoId: it.produtoId, qtd: num(it.qtd), lote: it.lote, validade: it.validade }; }) } }).then(function (r) {
      fechar(); recarregarEstoque();
      aviso('Entrada registrada ✓ ' + r.itens + ' item(ns) ligados à despesa de ' + (r.fornecedor || 'fornecedor') + (r.numero ? ' (' + r.numero + ')' : '') + '.', 8000);
    }).catch(function (e) {
      if (/exige o n[úu]mero do lote/i.test(e.message)) CP.itens.forEach(function (it) { if (!it.lote) it.exigeLote = true; });
      err.textContent = e.message; btn.disabled = false; btn.textContent = 'Registrar entrada';
      if (/exige o n[úu]mero do lote/i.test(e.message)) pintarCompraMantendoErro(e.message);
    });
  }
  // redesenha para marcar o lote como obrigatório e mantém a mensagem na tela
  function pintarCompraMantendoErro(msg) { var l = $('cp-linhas'); if (l) l.innerHTML = htmlLinhas(); var er = $('g2i-err'); if (er) er.textContent = msg; }

  /* ───────────── eventos da janela ───────────── */
  function cliqueMod(ev) {
    var b = ev.target.closest('[data-i]'); if (!b) return;
    var k = b.getAttribute('data-i'), v = b.getAttribute('data-v');
    if (k === 'fechar') return fechar();
    if (k === 'invEnviar') return enviarInventario();
    if (k === 'aprSt') { APR.status = v; return carregarAprovacoes(); }
    if (k === 'aprDec') return decidir(v);
    if (k === 'pesF') { PES.filtro = v; return carregarPessoas(); }
    if (k === 'pesNova') return novaPessoa();
    if (k === 'cpAdd') { lerCompra(); CP.itens.push({ produtoId: '', qtd: '', lote: '', validade: '' }); return pintarCompra(); }
    if (k === 'cpRem') { lerCompra(); CP.itens.splice(+v, 1); return pintarCompra(); }
    if (k === 'cpEsc') return escolherDespesa(v);
    if (k === 'cpSalvar') return salvarCompra(b);
  }
  function digitaMod(ev) {
    var k = ev.target.getAttribute && ev.target.getAttribute('data-k');
    if (k === 'busca' && INV) { lerContagem(); INV.busca = ev.target.value; var el = $('g2i-lin'); if (el) el.innerHTML = htmlLinhasInv(); }
if (k === 'cpbusca' && CP) { CP.busca = ev.target.value; var cl = $('cp-lista'); if (cl) cl.innerHTML = htmlDespesas(); }
    if (CP && /^cp-qtd-/.test(ev.target.id || '') && CP.fixo && $('cp-tot')) { lerCompra(); var d0 = despDe(CP.despesaId); $('cp-tot').innerHTML = 'Valor desta entrada: <b>' + brl(totalEntrada()) + '</b> de ' + brl(d0 && d0.valor); }
    if (k === 'buscaP' && PES) { PES.busca = ev.target.value; var pl = $('g2i-pl'); if (pl) pl.innerHTML = htmlListaPes(); }
  }
  M._t = { pintarBarra: pintarBarra, abrirInventario: abrirInventario, abrirAprovacoes: abrirAprovacoes, abrirPessoas: abrirPessoas, enviarReceita: enviarReceita };
})();
