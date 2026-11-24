/* 2Gather v39 · Ministérios · MIN-6
   MIN-6: aba "Salas" no Kids (KIDS-5), G2_MIN.abrir e G2_MIN._u.membros.
   MIN-5: aba "Entrada e saída" no Kids (KIDS-3) e G2_MIN._u.eventos.
   MIN-4: aba "Crianças" no ministério Kids (módulo app_v39_kids.js, KIDS-2) e utilitários G2_MIN._u.
   MIN-3: logo e faixa dentro do cadastro do ministério (sem botão à parte); líder/auxiliar abre o cadastro só para as imagens.
   Carregar DEPOIS do app.js. Requer no Supabase: sql/KIDS_1_ministerios_aplicar.sql (MIN-1) e sql/MIN_2_imagens_aplicar.sql (logo/faixa).
   MIN-2: logo (quadrado) e faixa (larga) do ministério, como no GC. Bucket 2gather-media, pasta <igreja>/ministerios/<id>/.
          Quem troca: master/pastor e líder/auxiliar do ministério (o banco confere). Sem o MIN_2 no servidor o botão não aparece.
   - Lista de ministérios (master/pastor veem todos; líder e voluntário veem os seus).
   - Cadastro do ministério (master/pastor): nome, tipo (Geral | Kids), líder, auxiliar, acompanha os cultos, idade máxima (Kids),
     situação (ativo / inativo / encerrado com motivo).
   - Agenda: eventos do ministério. Ministério que acompanha os cultos (Kids) ganha sozinho um evento para cada culto;
     o líder ajusta local/observação, abre ou cancela (com motivo) e cria eventos próprios.
   - Equipe: pessoas da base única ligadas ao ministério, com tipo e funções; pausar/encerrar com motivo (nada é apagado).
   - Funções do ministério (Professor, Auxiliar, Recepção…).
   Quem autoriza é o banco (RPCs app.v39_min_*); o front só esconde botões.
   Diagnóstico no Console: G2_MIN.versao, G2_MIN._s */
(function () {
  'use strict';
  var VERSAO = 'MIN-6';
  if (window.G2_MIN) return;
  var M = window.G2_MIN = { versao: VERSAO };
  console.info('[2Gather] ministerios ' + VERSAO);

  /* ───────── utilidades ───────── */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function G() { return window.__gc || {}; }
  function cfg() { var g = G(); try { return (g.cfg && g.cfg()) || {}; } catch (e) { return {}; } }
  function uuid(x) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(x || '')); }
  function igrejaId() {
    var V = window.G2_V39 || {};
    if (V.churchContext && typeof V.churchContext.ensure === 'function') { try { var c = V.churchContext.ensure(); if (uuid(c)) return c; } catch (e) { /* segue */ } }
    var u = cfg().usuario || {}; return uuid(u.igrejaId) ? u.igrejaId : null;
  }
  function rpc(nome, args) {
    var V = window.G2_V39 || {};
    var pr = (!V.client && typeof V.init === 'function') ? Promise.resolve(V.init()) : Promise.resolve();
    return pr.then(function () {
      if (!V.client) throw new Error('Sem conexão com o servidor.');
      var b = V.client.schema('app'); args = args || {}; if (!('p_church_id' in args)) args.p_church_id = igrejaId();
      return (b.__rpcOriginal || b.rpc).call(b, nome, args);
    }).then(function (r) { if (r.error) throw r.error; return r.data; });
  }
  function cliente() {
    var V = window.G2_V39 || {};
    var pr = (!V.client && typeof V.init === 'function') ? Promise.resolve(V.init()) : Promise.resolve();
    return pr.then(function () { if (!V.client) throw new Error('Sem conexão com o servidor.'); return V.client; });
  }

  /* ───────── MIN-2: logo e faixa ───────── */
  var BUCKET = '2gather-media', IMG = {}, IMG_PEDIDO = {};
  function temImagens(m) { return !!m && ('logo' in m); }   // servidor com MIN_2
  function urlImg(path) {
    if (!path) return '';
    var c = IMG[path]; if (c && c.ate > Date.now()) return c.url;
    if (!IMG_PEDIDO[path]) {
      IMG_PEDIDO[path] = true;
      cliente().then(function (cl) { return cl.storage.from(BUCKET).createSignedUrl(path, 3600); }).then(function (r) {
        IMG_PEDIDO[path] = false;
        if (r && r.data && r.data.signedUrl) { IMG[path] = { url: r.data.signedUrl, ate: Date.now() + 50 * 60000 }; pintar(); }
      }).catch(function () { IMG_PEDIDO[path] = false; });
    }
    return c ? c.url : '';
  }
  function iniciais(nome) { return String(nome || '?').trim().split(/\s+/).slice(0, 2).map(function (p) { return p.charAt(0).toUpperCase(); }).join(''); }
  function logoHtml(m, lado) {
    var u = urlImg(m.logo), r = Math.round(lado * 0.28);
    if (u) return '<div style="width:' + lado + 'px;height:' + lado + 'px;flex:0 0 ' + lado + 'px;border-radius:' + r + 'px;background:#fff center/cover no-repeat url(\'' + esc(u) + '\');box-shadow:0 1px 3px rgba(0,0,0,.15)"></div>';
    var cor = m.tipo === 'kids' ? '#d6457a' : 'var(--pri,#2f6fd6)';
    return '<div style="width:' + lado + 'px;height:' + lado + 'px;flex:0 0 ' + lado + 'px;border-radius:' + r + 'px;background:' + cor + ';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:' + Math.round(lado * 0.36) + 'px">' + esc(iniciais(m.nome)) + '</div>';
  }
  function dataUrlBlob(u) {
    var p = String(u).split(','), mime = (p[0].match(/data:([^;]+)/) || [])[1] || 'image/jpeg', b = atob(p[1] || ''), a = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return new Blob([a], { type: mime });
  }
  /* recorta no centro (proporção w:h) e reduz; logo 512x512, faixa 1200x400 */
  function processarImg(file, tipo, pronto) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type || '')) return toast('Use uma imagem JPG, PNG ou WEBP.', true);
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        var W = tipo === 'logo' ? 512 : 1200, H = tipo === 'logo' ? 512 : 400, alvo = W / H;
        var sw = img.width, sh = img.height;
        if (sw / sh > alvo) sw = Math.round(sh * alvo); else sh = Math.round(sw / alvo);
        var sx = Math.round((img.width - sw) / 2), sy = Math.round((img.height - sh) / 2), url = '';
        for (var t = 0; t < 5; t++) {
          var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
          var cx = cv.getContext('2d');
          if (tipo === 'logo') { cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, W, H); }
          cx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
          url = cv.toDataURL('image/jpeg', 0.85);
          if (url.length < 900000) break;
          W = Math.round(W * 0.8); H = Math.round(H * 0.8);
        }
        pronto(url);
      };
      img.onerror = function () { toast('Arquivo de imagem inválido.', true); };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }
  function enviarImg(m, tipo, dado) {
    var pasta = S.igreja + '/ministerios/' + m.id;
    return cliente().then(function (cl) {
      var b = cl.storage.from(BUCKET);
      return b.list(pasta, { limit: 100 }).then(function (r) {
        var velhos = ((r && r.data) || []).filter(function (o) { return o.name.indexOf(tipo + '-') === 0; }).map(function (o) { return pasta + '/' + o.name; });
        if (dado === '__remover__') return velhos.length ? b.remove(velhos).then(function (x) { if (x && x.error) throw x.error; }) : null;
        var caminho = pasta + '/' + tipo + '-' + Date.now() + '.jpg';
        return b.upload(caminho, dataUrlBlob(dado), { contentType: 'image/jpeg', upsert: false }).then(function (u) {
          if (u.error) throw u.error;
          if (velhos.length) b.remove(velhos).catch(function () {});   // como no GC: a imagem anterior sai
        });
      });
    });
  }
  /* MIN-3: logo e faixa ficam dentro do cadastro do ministério (sem botão à parte) */
  function blocoImagens(m) {
    S.imgNova = { logo: null, faixa: null };
    var lg = urlImg(m.logo), fx = urlImg(m.faixa);
    return '<div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--ln,#e6e8eb)"><label>Logo <span style="font-weight:500;color:#aaa">(quadrado)</span></label>' +
      '<div style="display:flex;gap:12px;align-items:center"><div class="fotoprev" data-m="escolherImg" data-v="logo" id="mi-logo" style="height:88px;width:88px;flex:0 0 88px;border-radius:22px;background-size:cover;background-position:center;font-size:11px;' +
        (lg ? "background-image:url('" + esc(lg) + "');border:none;color:transparent" : '') + '">Escolher</div>' +
      '<div><div class="ini-sub" style="margin:0 0 6px">Aparece na lista de ministérios. A imagem é recortada no centro.</div>' +
      '<span class="pill p-cinza ' + (m.logo ? '' : 'hide') + '" id="mi-logo-rem" data-m="removerImg" data-v="logo" style="cursor:pointer">remover logo</span></div></div>' +
      '<label style="margin-top:12px">Faixa <span style="font-weight:500;color:#aaa">(larga, 3:1 · topo da tela do ministério)</span></label>' +
      '<div class="fotoprev" data-m="escolherImg" data-v="faixa" id="mi-faixa" style="height:110px;width:100%;border-radius:14px;background-size:cover;background-position:center;font-size:11px;' +
        (fx ? "background-image:url('" + esc(fx) + "');border:none;color:transparent" : '') + '">Escolher</div>' +
      '<div style="text-align:right;margin-top:6px"><span class="pill p-cinza ' + (m.faixa ? '' : 'hide') + '" id="mi-faixa-rem" data-m="removerImg" data-v="faixa" style="cursor:pointer">remover faixa</span></div>' +
      '<input type="file" id="mi-arq" accept="image/jpeg,image/png,image/webp" style="display:none"></div>';
  }
  function pintarPrevImg(tipo, url) {
    var p = $('mi-' + tipo); if (!p) return;
    p.style.backgroundImage = url ? "url('" + url + "')" : ''; p.style.border = url ? 'none' : ''; p.style.color = url ? 'transparent' : '';
    var r = $('mi-' + tipo + '-rem'); if (r) r.classList.toggle('hide', !url);
  }
  /* envia as imagens escolhidas no formulário; devolve quantas foram gravadas */
  function enviarImagensPendentes(id) {
    var n = S.imgNova || {}, tipos = ['logo', 'faixa'].filter(function (t) { return n[t]; });
    if (!tipos.length || !id) return Promise.resolve(0);
    var m = { id: id };
    return tipos.reduce(function (p, t) { return p.then(function () { return enviarImg(m, t, n[t]); }); }, Promise.resolve())
      .then(function () { S.imgNova = null; return tipos.length; });
  }
  function erroImg(e) {
    var t = String((e && (e.message || e.statusCode)) || '');
    return /row-level security|403|Unauthorized/i.test(t) ? 'Só o líder do ministério, o pastor ou o master trocam as imagens.' : traduz(e);
  }
  function servidorTemImagens() { var l = S.lista || []; return !l.length || l.some(temImagens); }
  document.addEventListener('change', function (ev) {
    if (!ev.target || ev.target.id !== 'mi-arq') return;
    var tipo = ev.target.getAttribute('data-tipo'), f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    processarImg(f, tipo, function (url) { if (!S.imgNova) return; S.imgNova[tipo] = url; pintarPrevImg(tipo, url); });
  });
  var MSG = {
    PERMISSION_DENIED: 'Sem permissão neste ministério.', ACCESS_DENIED: 'Sem acesso ativo a esta igreja.', MINISTRY_NOT_FOUND: 'Ministério não encontrado.',
    MIN_NAME_REQUIRED: 'Informe o nome do ministério.', MIN_NAME_DUPLICATE: 'Já existe um ministério com este nome.', MIN_PERSON_INVALID: 'A pessoa precisa estar ativa nesta igreja.',
    MIN_LEADERS_EQUAL: 'Líder e auxiliar devem ser pessoas diferentes.', MIN_CLOSED: 'Ministério encerrado não pode ser alterado nem reaberto.',
    MIN_STATUS_INVALID: 'Situação inválida.', REASON_REQUIRED: 'Informe o motivo.', MIN_FUNCTION_NAME_REQUIRED: 'Informe o nome da função.',
    MIN_FUNCTION_DUPLICATE: 'Já existe uma função com este nome.', MIN_FUNCTION_INVALID: 'Função inválida ou inativa.', MIN_LEADER_ACTIVE: 'Troque o líder/auxiliar no cadastro do ministério antes de pausar ou encerrar.',
    MIN_MEMBER_NOT_FOUND: 'A pessoa não participa deste ministério.', MIN_INACTIVE: 'O ministério não está ativo.', EVENT_TITLE_REQUIRED: 'Informe o nome do evento.',
    EVENT_START_REQUIRED: 'Informe a data.', EVENT_DATES_INVALID: 'O término está antes do início.', EVENT_NOT_FOUND: 'Evento não encontrado.',
    EVENT_CANCELLED_CANNOT_REOPEN: 'Evento cancelado não pode ser reaberto.', EVENT_COMPLETED: 'Evento encerrado: peça ao pastor para reabrir.',
    REGISTRO_TRAVADO: 'Evento encerrado há mais de 24h: edição travada. Peça ao pastor para reabrir.', MIN_EVENT_LINK_IMMUTABLE: 'O vínculo do evento com o ministério não pode ser alterado.'
  };
  function traduz(e) {
    var t = String((e && (e.message || e.code)) || e || '');
    for (var k in MSG) if (t.indexOf(k) === 0) return MSG[k];
    if (/PGRST202|find the function/i.test(t)) return 'O servidor ainda não tem o módulo de Ministérios (rodar o KIDS_1).';
    if (/Failed to fetch|NetworkError/i.test(t)) return 'Sem conexão. Tente novamente.';
    return 'Não foi possível concluir. Tente novamente.';
  }
  function semFuncao(e) { return /PGRST202|find the function/i.test(String((e && (e.message || e.code)) || '')); }
  function toast(msg, erro) {
    var d = document.createElement('div');
    d.textContent = msg; d.setAttribute('role', 'status');
    d.style.cssText = 'position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:9999;max-width:90vw;padding:10px 16px;border-radius:12px;font-size:13.5px;font-weight:600;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.18);background:' + (erro ? '#c0392b' : '#1f7a4d');
    document.body.appendChild(d); setTimeout(function () { d.remove(); }, erro ? 4200 : 2600);
  }
  function modal(html) { var g = G(); if (g.abrirModal) g.abrirModal(html); }
  function fecharModal() { var g = G(); if (g.fechar) g.fechar(); }
  function dataBr(iso) { if (!iso) return ''; var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }); }
  function horaBr(iso) { if (!iso) return ''; var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  function dia(iso) { if (!iso) return ''; var d = new Date(iso); if (isNaN(d)) return ''; return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function moeda(v) { var n = Number(v || 0); try { return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } catch (e) { return 'R$ ' + n.toFixed(2); } }
  function pill(txt, cor) { return '<span class="pill" style="background:' + cor + '1f;color:' + cor + '">' + esc(txt) + '</span>'; }
  var ST_EV = { draft: ['Rascunho', '#7a7f87'], planned: ['Planejado', '#2f6fd6'], open: ['Aberto', '#1f9d63'], completed: ['Encerrado', '#5e6470'], cancelled: ['Cancelado', '#c0392b'] };
  var ST_MIN = { planned: ['Planejado', '#2f6fd6'], active: ['Ativo', '#1f9d63'], inactive: ['Inativo', '#c99a1a'], closed: ['Encerrado', '#c0392b'] };
  var TIPO = { leader: 'Líder', assistant: 'Auxiliar', coordinator: 'Coordenador', volunteer: 'Voluntário', support: 'Apoio', other: 'Outro' };
  var PAPEL = { admin: 'Administração', leader: 'Liderança', volunteer: 'Voluntário' };

  /* ───────── estado ───────── */
  var S = { igreja: null, lista: null, carregando: false, erro: '', semServidor: false, podeCriar: false,
            atual: null, aba: 'agenda', eventos: {}, membros: {}, carregandoDet: {}, busca: { q: '', res: [], sel: null, t: 0 } };
  M._s = S;
  function minAtual() { return (S.lista || []).filter(function (m) { return m.id === S.atual; })[0] || null; }
  function ehLider(m) { return m && (m.meuPapel === 'admin' || m.meuPapel === 'leader'); }
  function ehAdmin() { return S.podeCriar; }

  function resetSeTrocouIgreja() {
    var ig = igrejaId();
    if (ig !== S.igreja) { S.igreja = ig; S.lista = null; S.atual = null; S.eventos = {}; S.membros = {}; S.erro = ''; S.semServidor = false; S.podeCriar = false; }
  }
  function carregarLista(forcar) {
    resetSeTrocouIgreja();
    if (!S.igreja || S.carregando || (S.lista && !forcar)) return Promise.resolve();
    S.carregando = true;
    var pPerm = rpc('has_permission', { p_permission_code: 'ministries.manage', p_church_id: S.igreja, p_scope_type: null, p_scope_id: null })
      .then(function (r) { S.podeCriar = r === true; }).catch(function () { S.podeCriar = false; });
    var pLista = rpc('v39_min_list', {}).then(function (r) { S.lista = Array.isArray(r) ? r : []; S.erro = ''; })
      .catch(function (e) { S.lista = []; S.semServidor = semFuncao(e); S.erro = traduz(e); });
    return Promise.all([pPerm, pLista]).then(function () {
      S.carregando = false;
      if (S.atual && !minAtual()) S.atual = null;
      pintar();
    });
  }
  function carregarDetalhe(id, forcar) {
    if (!id || S.carregandoDet[id]) return;
    if (!forcar && S.eventos[id] && S.membros[id]) return;
    S.carregandoDet[id] = true;
    Promise.all([
      rpc('v39_min_events', { p_ministry_id: id, p_de: null, p_ate: null }).then(function (r) { S.eventos[id] = r || []; }).catch(function (e) { S.eventos[id] = { erro: traduz(e) }; }),
      rpc('v39_min_members', { p_ministry_id: id, p_incluir_encerrados: false }).then(function (r) { S.membros[id] = r || []; }).catch(function (e) { S.membros[id] = { erro: traduz(e) }; })
    ]).then(function () { S.carregandoDet[id] = false; pintar(); });
  }

  /* ───────── telas ───────── */
  function html() {
    resetSeTrocouIgreja();
    if (!cfg().usuario || cfg().token !== 'supabase-v39') return '<div class="card"><div class="empty">Ministérios disponível só na versão com Supabase.</div></div>';
    return '<div id="g2min">' + corpo() + '</div>';
  }
  function corpo() {
    if (S.lista === null) return '<div class="ini-ola" style="font-size:22px">Ministérios</div><div class="empty">Carregando…</div>';
    if (S.atual && minAtual()) return telaMinisterio(minAtual());
    return telaLista();
  }
  function telaLista() {
    var h = '<div class="ini-ola" style="font-size:22px">Ministérios</div><div class="ini-sub">Equipes, funções e agenda de cada ministério da igreja.</div>';
    if (S.erro) h += '<div class="aviso r" style="margin-top:10px">' + esc(S.erro) + '</div>';
    if (ehAdmin() && !S.semServidor) h += '<div class="gap"></div><button class="btn" data-m="novoMin">+ Novo ministério</button>';
    var l = S.lista || [];
    if (!l.length && !S.erro) {
      h += '<div class="card" style="margin-top:12px"><div class="empty">' + (ehAdmin() ? 'Nenhum ministério cadastrado. Comece pelo Kids.' : 'Você ainda não participa de nenhum ministério. Fale com a liderança.') + '</div></div>';
      return h;
    }
    h += '<div class="card" style="padding:4px 16px;margin-top:12px">' + l.map(function (m) {
      var st = ST_MIN[m.status] || [m.status, '#7a7f87'];
      return '<div class="row cl" data-m="abrirMin" data-v="' + esc(m.id) + '" style="cursor:pointer;gap:12px">' + (temImagens(m) ? logoHtml(m, 42) : '') +
        '<div class="info"><div class="nm">' + esc(m.nome) + ' ' + (m.tipo === 'kids' ? pill('Kids', '#d6457a') : '') + ' ' + pill(st[0], st[1]) + '</div>' +
        '<div class="sb">' + (m.liderNome ? 'Líder: ' + esc(m.liderNome) + ' · ' : 'Sem líder definido · ') + (m.membrosAtivos || 0) + ' na equipe' +
        (m.meuPapel ? ' · você: ' + esc(PAPEL[m.meuPapel] || m.meuPapel) : '') + '</div></div>' +
        '<span style="color:var(--tx3);font-size:18px">›</span></div>';
    }).join('') + '</div>';
    return h;
  }
  function telaMinisterio(m) {
    var st = ST_MIN[m.status] || [m.status, '#7a7f87'], lid = ehLider(m);
    var h = '<button class="btn gh sm" data-m="voltarLista" style="margin-bottom:8px">‹ Ministérios</button>';
    if (temImagens(m)) {   // MIN-2: faixa no topo com o logo por cima (sem faixa, só o logo ao lado do nome)
      var fx = urlImg(m.faixa);
      if (m.faixa) h += '<div style="position:relative;margin-bottom:34px"><div style="width:100%;aspect-ratio:3/1;max-height:220px;border-radius:16px;background:#eceef1 center/cover no-repeat' + (fx ? " url('" + esc(fx) + "')" : '') + '"></div>' +
        '<div style="position:absolute;left:16px;bottom:-28px;border:3px solid #fff;border-radius:20px;background:#fff">' + logoHtml(m, 64) + '</div></div>';
      else h += '<div style="margin:4px 0 8px">' + logoHtml(m, 56) + '</div>';
    }
    h += '<div class="ini-ola" style="font-size:22px">' + esc(m.nome) + '</div>' +
      '<div class="ini-sub">' + (m.tipo === 'kids' ? 'Kids · até ' + esc(m.idadeMax || 12) + ' anos · ' : '') + st[0] +
      (m.acompanhaCultos ? ' · acompanha os cultos' : '') + (m.liderNome ? ' · líder: ' + esc(m.liderNome) : '') + (m.auxiliarNome ? ' · auxiliar: ' + esc(m.auxiliarNome) : '') + '</div>';
    if (m.status === 'closed' && m.motivoEncerramento) h += '<div class="aviso r">Encerrado: ' + esc(m.motivoEncerramento) + '</div>';
    var bts = '';
    // MIN-3: pastor/master editam tudo; líder/auxiliar abre o mesmo cadastro só para logo e faixa
    if (ehAdmin() || (lid && temImagens(m) && m.status !== 'closed')) bts += '<button class="btn gh sm" data-m="editarMin" data-v="' + esc(m.id) + '">Editar ministério</button>';
    if (bts) h += '<div class="gap"></div>' + bts;
    var abas = [['agenda', 'Agenda']];
    if (m.tipo === 'kids' && m.status === 'active' && window.G2_KIDS) {
      if (window.G2_KIDS.telaSala) abas.push(['sala', 'Entrada e saída']);   // KIDS-3
      abas.push(['criancas', 'Crianças']);   // KIDS-2
      if (window.G2_KIDS.telaSalas) abas.push(['salas', 'Salas']);   // KIDS-5
    }
    abas.push(['equipe', 'Equipe']); if (lid) abas.push(['funcoes', 'Funções']);
    if (abas.map(function (a) { return a[0]; }).indexOf(S.aba) < 0) S.aba = 'agenda';
    h += '<div class="chips" style="margin-top:12px">' + abas.map(function (a) {
      return '<button data-m="abaMin" data-v="' + a[0] + '" class="' + (S.aba === a[0] ? 'on' : '') + '">' + a[1] + '</button>'; }).join('') + '</div>';
    if (S.aba === 'agenda') h += telaAgenda(m, lid);
    else if (S.aba === 'criancas') h += window.G2_KIDS.tela(m);
    else if (S.aba === 'sala') h += window.G2_KIDS.telaSala(m);
    else if (S.aba === 'salas') h += window.G2_KIDS.telaSalas(m);
    else if (S.aba === 'equipe') h += telaEquipe(m, lid);
    else h += telaFuncoes(m);
    return h;
  }
  function telaAgenda(m, lid) {
    var ev = S.eventos[m.id], h = '';
    if (lid && m.status === 'active') h += '<button class="btn gh" data-m="novoEv">+ Evento do ministério</button><div class="gap"></div>';
    if (!ev) return h + '<div class="empty">Carregando agenda…</div>';
    if (ev.erro) return h + '<div class="aviso r">' + esc(ev.erro) + '</div>';
    var hj = dia(new Date().toISOString());
    var prox = ev.filter(function (e) { return dia(e.inicio) >= hj; }), pass = ev.filter(function (e) { return dia(e.inicio) < hj; }).reverse();
    if (m.acompanhaCultos) h += '<div class="ini-sub" style="margin:0 0 8px">Cada culto da igreja gera automaticamente um evento deste ministério (mesma data e horário).</div>';
    function lista(arr) {
      if (!arr.length) return '<div class="card"><div class="empty">Nenhum evento.</div></div>';
      return '<div class="card" style="padding:4px 16px">' + arr.map(function (e) {
        var s = ST_EV[e.status] || [e.status, '#7a7f87'], r = e.resumo || null;
        var res = r && (r.presentes != null || r.dizimo || r.oferta || r.outras)
          ? '<div class="sb">' + (r.presentes != null ? r.presentes + ' presentes' : '') + (r.dizimo ? ' · dízimos ' + moeda(r.dizimo) : '') + (r.oferta ? ' · ofertas ' + moeda(r.oferta) : '') + (r.outras ? ' · outras ' + moeda(r.outras) : '') + '</div>' : '';
        var podeAjustar = lid && !e.travado && e.status !== 'cancelled' && e.status !== 'completed';
        return '<div class="row"><div class="info"><div class="nm">' + (e.travado ? '🔒 ' : '') + esc(e.nome) + ' ' + pill(s[0], s[1]) + '</div>' +
          '<div class="sb">' + esc(dataBr(e.inicio)) + ' · ' + esc(horaBr(e.inicio)) + (e.fim ? '–' + esc(horaBr(e.fim)) : '') + (e.local ? ' · ' + esc(e.local) : '') +
          (e.cultoId ? ' · acompanha: ' + esc(e.cultoNome || 'culto') : ' · evento próprio') + '</div>' +
          (e.status === 'cancelled' && e.motivoCancelamento ? '<div class="sb">Motivo: ' + esc(e.motivoCancelamento) + '</div>' : '') + res + '</div>' +
          (podeAjustar ? '<button class="btn gh sm" data-m="ajustarEv" data-v="' + esc(e.id) + '">' + (e.cultoId ? 'Ajustar' : 'Editar') + '</button>' : '') + '</div>';
      }).join('') + '</div>';
    }
    h += '<div class="sec" style="margin-left:0">Próximos</div>' + lista(prox);
    if (pass.length) h += '<div class="sec" style="margin-left:0">Realizados (últimos 30 dias)</div>' + lista(pass);
    return h;
  }
  function telaEquipe(m, lid) {
    var mb = S.membros[m.id], h = '';
    if (lid && m.status !== 'closed') h += '<button class="btn gh" data-m="novoMembro">+ Incluir pessoa na equipe</button><div class="gap"></div>';
    if (!mb) return h + '<div class="empty">Carregando equipe…</div>';
    if (mb.erro) return h + '<div class="aviso r">' + esc(mb.erro) + '</div>';
    if (!mb.length) return h + '<div class="card"><div class="empty">Ninguém na equipe ainda.</div></div>';
    h += '<div class="card" style="padding:4px 16px">' + mb.map(function (p) {
      var fun = (p.funcoes || []).map(function (f) { return f.nome; }).join(', ');
      var pausa = p.status === 'paused';
      return '<div class="row"><div class="info"><div class="nm">' + esc(p.nome) + ' ' + pill(TIPO[p.tipo] || p.tipo, '#2f6fd6') + (pausa ? ' ' + pill('Pausado', '#c99a1a') : '') + '</div>' +
        '<div class="sb">' + (fun ? esc(fun) : 'sem função definida') + (p.temLogin ? '' : ' · sem acesso ao app (não pode ser escalado)') + '</div>' +
        (pausa && p.motivoPausa ? '<div class="sb">Pausa: ' + esc(p.motivoPausa) + '</div>' : '') + '</div>' +
        (lid && m.status !== 'closed' ? '<button class="btn gh sm" data-m="editarMembro" data-v="' + esc(p.pessoaId) + '">Alterar</button>' : '') + '</div>';
    }).join('') + '</div>';
    return h;
  }
  function telaFuncoes(m) {
    var f = m.funcoes || [], h = '';
    if (m.status !== 'closed') h += '<button class="btn gh" data-m="novaFuncao">+ Nova função</button><div class="gap"></div>';
    if (!f.length) return h + '<div class="card"><div class="empty">Nenhuma função. Ex.: Professor, Auxiliar, Recepção.</div></div>';
    return h + '<div class="card" style="padding:4px 16px">' + f.map(function (x) {
      return '<div class="row"><div class="info"><div class="nm">' + esc(x.nome) + (x.lideranca ? ' ' + pill('Liderança', '#7a4fd6') : '') + (x.ativo ? '' : ' ' + pill('Inativa', '#7a7f87')) + '</div>' +
        (x.descricao ? '<div class="sb">' + esc(x.descricao) + '</div>' : '') + '</div>' +
        (m.status !== 'closed' ? '<button class="btn gh sm" data-m="editarFuncao" data-v="' + esc(x.id) + '">Editar</button>' : '') + '</div>';
    }).join('') + '</div>';
  }

  function pintar() {
    var el = $('g2min');
    if (!el || String(cfg().aba || '') !== 'ministerios') return;
    el.innerHTML = corpo();
  }
  function montar() {
    resetSeTrocouIgreja();
    pintar();
    if (S.lista === null) carregarLista(false);
    else if (S.atual) carregarDetalhe(S.atual, false);
  }

  /* ───────── formulários (modal do app) ───────── */
  function campoPessoa(id, rotulo, atualId, atualNome) {
    return '<label>' + rotulo + '</label><input type="hidden" id="' + id + '" value="' + esc(atualId || '') + '">' +
      '<div id="' + id + '-nome" class="sb" style="margin:2px 0 6px">' + (atualNome ? 'Selecionado: <b>' + esc(atualNome) + '</b> <a href="#" data-m="limparPessoa" data-v="' + id + '">trocar</a>' : 'Nenhuma pessoa selecionada') + '</div>' +
      '<input id="' + id + '-q" data-busca-pessoa="' + id + '" placeholder="Digite parte do nome para buscar" autocomplete="off">' +
      '<div id="' + id + '-res"></div>';
  }
  function formMin(m) {
    m = m || { tipo: 'kids', status: 'active', acompanhaCultos: true, idadeMax: 12 };
    var novo = !m.id, img = servidorTemImagens() && m.status !== 'closed';
    S.imgNova = null;
    if (!ehAdmin()) {   // MIN-3: líder/auxiliar troca só logo e faixa; o resto é do pastor/master
      modal('<h2>Editar ministério · ' + esc(m.nome) + '</h2>' +
        '<div class="ini-sub">Nome, líder, situação e demais dados são alterados pelo pastor ou master.</div>' + blocoImagens(m) +
        '<div class="gap"></div><button class="btn pr" data-m="salvarMin" data-v="' + esc(m.id) + '">Salvar</button>' +
        '<div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
      return;
    }
    modal('<h2>' + (novo ? 'Novo ministério' : 'Editar ministério') + '</h2>' +
      '<label>Nome *</label><input id="mn-nome" value="' + esc(m.nome) + '" placeholder="Ex.: Kids">' +
      '<div class="g2"><div><label>Tipo</label><select id="mn-tipo"><option value="kids"' + (m.tipo === 'kids' ? ' selected' : '') + '>Kids (crianças)</option><option value="general"' + (m.tipo !== 'kids' ? ' selected' : '') + '>Geral</option></select></div>' +
      '<div><label>Idade máxima (Kids)</label><input id="mn-idade" type="number" min="1" max="18" value="' + esc(m.idadeMax || '') + '"></div></div>' +
      '<label><input type="checkbox" id="mn-cultos"' + (m.acompanhaCultos ? ' checked' : '') + ' style="width:auto;margin-right:6px">Acompanha os cultos (cada culto gera um evento deste ministério)</label>' +
      campoPessoa('mn-lider', 'Líder', m.liderId, m.liderNome) +
      campoPessoa('mn-aux', 'Auxiliar (opcional)', m.auxiliarId, m.auxiliarNome) +
      '<label>Descrição</label><input id="mn-desc" value="' + esc(m.descricao) + '">' +
      (novo ? '' : '<div class="g2"><div><label>Situação</label><select id="mn-status">' +
        [['active', 'Ativo'], ['inactive', 'Inativo'], ['closed', 'Encerrado']].map(function (o) { return '<option value="' + o[0] + '"' + (m.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
        '</select></div><div><label>Motivo (inativar/encerrar)</label><input id="mn-motivo"></div></div>' +
        '<div class="ini-sub" style="margin:4px 0">Inativar ou encerrar cancela os eventos futuros do ministério. Encerrado não volta.</div>') +
      (img ? blocoImagens(m) : '') +
      '<div class="gap"></div><button class="btn pr" data-m="salvarMin" data-v="' + esc(m.id || '') + '">Salvar</button>' +
      '<div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
    S.busca = { q: '', res: [], sel: null, t: 0, ministerio: m.id || null };
  }
  function travarBotao(sim) { var bt = document.querySelector('[data-m="salvarMin"]'); if (bt) { bt.disabled = sim; bt.textContent = sim ? 'Salvando…' : 'Salvar'; } }
  function salvarMin(id) {
    if (!ehAdmin()) {   // líder: só as imagens
      travarBotao(true);
      return enviarImagensPendentes(id).then(function (n) { fecharModal(); if (n) toast('Imagens salvas.'); return carregarLista(true); })
        .catch(function (e) { travarBotao(false); toast(erroImg(e), true); });
    }
    var p = { id: id || null, nome: $('mn-nome').value.trim(), tipo: $('mn-tipo').value, acompanhaCultos: $('mn-cultos').checked,
              idadeMax: $('mn-idade').value || null, liderId: $('mn-lider').value || null, auxiliarId: $('mn-aux').value || null,
              descricao: $('mn-desc').value.trim() || null };
    if ($('mn-status')) { p.status = $('mn-status').value; p.motivo = $('mn-motivo').value.trim() || null; }
    if (!p.nome) return toast('Informe o nome do ministério.', true);
    if (p.tipo !== 'kids') p.idadeMax = p.idadeMax || null;
    travarBotao(true);
    var res = null;
    rpc('v39_min_save', { p: p }).then(function (r) {
      res = r || {};
      // imagens depois do cadastro (ministério novo já tem id); encerrado não grava imagem
      return (res.status === 'closed' ? Promise.resolve(0) : enviarImagensPendentes(res.id)).catch(function (e) { toast('O ministério foi salvo, mas a imagem não: ' + erroImg(e), true); return 0; });
    }).then(function () {
      fecharModal();
      var t = 'Ministério salvo.'; if (res.eventosCriados) t += ' ' + res.eventosCriados + ' evento(s) criado(s) a partir dos cultos.'; if (res.eventosCancelados) t += ' ' + res.eventosCancelados + ' evento(s) futuro(s) cancelado(s).';
      toast(t); if (res.id) { S.atual = res.id; delete S.eventos[res.id]; delete S.membros[res.id]; }
      return carregarLista(true).then(function () { if (S.atual) carregarDetalhe(S.atual, true); });
    }, function (e) { travarBotao(false); toast(traduz(e), true); });
  }
  function formFuncao(f) {
    f = f || { ativo: true };
    modal('<h2>' + (f.id ? 'Editar função' : 'Nova função') + '</h2>' +
      '<label>Nome *</label><input id="mf-nome" value="' + esc(f.nome) + '" placeholder="Ex.: Professor">' +
      '<label>Descrição</label><input id="mf-desc" value="' + esc(f.descricao) + '">' +
      '<label><input type="checkbox" id="mf-lid"' + (f.lideranca ? ' checked' : '') + ' style="width:auto;margin-right:6px">Função de liderança</label>' +
      '<label><input type="checkbox" id="mf-ativo"' + (f.ativo !== false ? ' checked' : '') + ' style="width:auto;margin-right:6px">Ativa</label>' +
      '<div class="gap"></div><button class="btn pr" data-m="salvarFuncao" data-v="' + esc(f.id || '') + '">Salvar</button>' +
      '<div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
  }
  function salvarFuncao(id) {
    var p = { id: id || null, ministerioId: S.atual, nome: $('mf-nome').value.trim(), descricao: $('mf-desc').value.trim() || null,
              lideranca: $('mf-lid').checked, ativo: $('mf-ativo').checked };
    if (!p.nome) return toast('Informe o nome da função.', true);
    rpc('v39_min_function_save', { p: p }).then(function () { fecharModal(); toast('Função salva.'); return carregarLista(true); })
      .catch(function (e) { toast(traduz(e), true); });
  }
  function checksFuncoes(m, marcadas) {
    var f = (m.funcoes || []).filter(function (x) { return x.ativo; });
    if (!f.length) return '<div class="ini-sub">Cadastre as funções na aba Funções para atribuir aqui.</div>';
    return f.map(function (x) {
      return '<label style="font-weight:500"><input type="checkbox" class="mm-fun" value="' + esc(x.id) + '"' + (marcadas.indexOf(x.id) >= 0 ? ' checked' : '') + ' style="width:auto;margin-right:6px">' + esc(x.nome) + '</label>';
    }).join('');
  }
  function opcoesTipo(atual) {
    var ts = ehAdmin() ? ['volunteer', 'coordinator', 'support', 'other', 'assistant', 'leader'] : ['volunteer', 'coordinator', 'support', 'other'];
    return ts.map(function (t) { return '<option value="' + t + '"' + (t === atual ? ' selected' : '') + '>' + TIPO[t] + '</option>'; }).join('');
  }
  function formMembro(p) {
    var m = minAtual(); if (!m) return;
    var novo = !p, marc = p ? (p.funcoes || []).map(function (f) { return f.id; }) : [];
    modal('<h2>' + (novo ? 'Incluir na equipe' : esc(p.nome)) + '</h2>' +
      (novo ? campoPessoa('mm-pessoa', 'Pessoa (base única de pessoas) *', null, null) +
        '<div class="ini-sub" style="margin:2px 0 6px">Não achou? A pessoa precisa estar cadastrada na igreja (Cadastro de pessoas). Só quem tem acesso ao app pode ser escalado.</div>' :
        '<input type="hidden" id="mm-pessoa" value="' + esc(p.pessoaId) + '">') +
      '<label>Tipo</label><select id="mm-tipo">' + opcoesTipo(p ? p.tipo : 'volunteer') + '</select>' +
      '<label>Funções</label>' + checksFuncoes(m, marc) +
      (novo ? '' : '<label>Situação</label><select id="mm-status"><option value="active"' + (p.status === 'active' ? ' selected' : '') + '>Ativo</option><option value="paused"' + (p.status === 'paused' ? ' selected' : '') + '>Pausado</option><option value="ended">Encerrar participação</option></select>' +
        '<label>Motivo (obrigatório para pausar ou encerrar)</label><input id="mm-motivo">') +
      '<div class="gap"></div><button class="btn pr" data-m="salvarMembro">Salvar</button>' +
      '<div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
    S.busca = { q: '', res: [], sel: null, t: 0, ministerio: m.id };
  }
  function salvarMembro() {
    var pes = $('mm-pessoa') && $('mm-pessoa').value;
    if (!pes) return toast('Escolha a pessoa.', true);
    var fun = [].slice.call(document.querySelectorAll('.mm-fun:checked')).map(function (x) { return x.value; });
    var p = { ministerioId: S.atual, pessoaId: pes, tipo: $('mm-tipo').value, funcoes: fun,
              status: $('mm-status') ? $('mm-status').value : 'active', motivo: $('mm-motivo') ? ($('mm-motivo').value.trim() || null) : null };
    if (p.status !== 'active' && !p.motivo) return toast('Informe o motivo.', true);
    rpc('v39_min_member_set', { p: p }).then(function () {
      fecharModal(); toast('Equipe atualizada.'); var id = S.atual; delete S.membros[id];
      return carregarLista(true).then(function () { carregarDetalhe(id, true); });
    }).catch(function (e) { toast(traduz(e), true); });
  }
  function formEvento(e) {
    var filho = e && e.cultoId;
    if (filho) {
      modal('<h2>Ajustar evento</h2><div class="ini-sub">' + esc(e.nome) + ' · ' + esc(dataBr(e.inicio)) + ' ' + esc(horaBr(e.inicio)) + '<br>Data e horário acompanham o culto.</div>' +
        '<label>Local</label><input id="me-local" value="' + esc(e.local) + '" placeholder="Ex.: Sala Kids">' +
        '<label>Observação</label><input id="me-obs" value="' + esc(e.obs) + '">' +
        '<label>Situação</label><select id="me-status">' + [['planned', 'Planejado'], ['open', 'Aberto'], ['cancelled', 'Cancelar (não haverá neste culto)']].map(function (o) {
          return '<option value="' + o[0] + '"' + (e.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
        '<label>Motivo (obrigatório para cancelar)</label><input id="me-motivo">' +
        '<div class="gap"></div><button class="btn pr" data-m="salvarEv" data-v="' + esc(e.id) + '">Salvar</button><div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
      return;
    }
    e = e || { status: 'planned' };
    modal('<h2>' + (e.id ? 'Editar evento' : 'Novo evento do ministério') + '</h2>' +
      '<label>Nome *</label><input id="me-nome" value="' + esc(e.nome) + '" placeholder="Ex.: Tarde Kids">' +
      '<div class="g2"><div><label>Data *</label><input id="me-data" type="date" value="' + esc(e.inicio ? dia(e.inicio) : '') + '"></div>' +
      '<div><label>Local</label><input id="me-local" value="' + esc(e.local) + '"></div></div>' +
      '<div class="g2"><div><label>Início</label><input id="me-ini" type="time" value="' + esc(horaBr(e.inicio)) + '"></div><div><label>Término</label><input id="me-fim" type="time" value="' + esc(horaBr(e.fim)) + '"></div></div>' +
      '<label>Observação</label><input id="me-obs" value="' + esc(e.obs) + '">' +
      '<label>Situação</label><select id="me-status">' + [['planned', 'Planejado'], ['open', 'Aberto']].concat(e.id ? [['cancelled', 'Cancelar evento']] : []).map(function (o) {
        return '<option value="' + o[0] + '"' + (e.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      (e.id ? '<label>Motivo (obrigatório para cancelar)</label><input id="me-motivo">' : '') +
      '<div class="gap"></div><button class="btn pr" data-m="salvarEv" data-v="' + esc(e.id || '') + '">Salvar</button><div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
  }
  function salvarEv(id) {
    var p = { id: id || null, ministerioId: S.atual, local: $('me-local').value.trim() || null, obs: $('me-obs').value.trim() || null,
              status: $('me-status').value, motivo: $('me-motivo') ? ($('me-motivo').value.trim() || null) : null };
    if ($('me-nome')) {
      p.nome = $('me-nome').value.trim(); p.data = $('me-data').value; p.inicio = $('me-ini').value || null; p.fim = $('me-fim').value || null;
      if (!p.nome) return toast('Informe o nome do evento.', true);
      if (!p.data) return toast('Informe a data.', true);
    }
    if (p.status === 'cancelled' && !p.motivo) return toast('Informe o motivo do cancelamento.', true);
    rpc('v39_min_event_save', { p: p }).then(function () { fecharModal(); toast('Evento salvo.'); carregarDetalhe(S.atual, true); })
      .catch(function (e) { toast(traduz(e), true); });
  }

  /* busca de pessoas (líder/admin): só nome, pelo servidor */
  function buscarPessoa(campo, q) {
    clearTimeout(S.busca.t);
    var res = $(campo + '-res'); if (!res) return;
    if (String(q || '').trim().length < 2) { res.innerHTML = ''; return; }
    S.busca.t = setTimeout(function () {
      rpc('v39_min_people_search', { p_ministry_id: S.busca.ministerio || null, p_q: q }).then(function (l) {
        var r = $(campo + '-res'); if (!r) return;
        l = l || [];
        r.innerHTML = l.length ? '<div class="card" style="padding:2px 12px;margin:4px 0">' + l.map(function (p) {
          return '<div class="row cl" data-m="escolherPessoa" data-v="' + esc(p.id) + '" data-campo="' + campo + '" data-nome="' + esc(p.nome) + '" style="cursor:pointer;padding:8px 0">' +
            '<div class="info"><div class="nm">' + esc(p.nome) + '</div><div class="sb">' + (p.jaMembro ? 'já está no ministério · ' : '') + (p.temLogin ? 'tem acesso ao app' : 'sem acesso ao app') + '</div></div></div>';
        }).join('') + '</div>' : '<div class="sb" style="margin:4px 0">Ninguém encontrado com esse nome.</div>';
      }).catch(function (e) { var r = $(campo + '-res'); if (r) r.innerHTML = '<div class="sb">' + esc(traduz(e)) + '</div>'; });
    }, 350);
  }

  /* ───────── eventos de clique/digitação (só o que tem data-m) ───────── */
  var ACOES = {
    novoMin: function () { formMin(null); },
    editarMin: function (v) { var m = (S.lista || []).filter(function (x) { return x.id === v; })[0]; if (m) formMin(m); },
    salvarMin: salvarMin,
    escolherImg: function (v) { var a = $('mi-arq'); if (!a) return; a.setAttribute('data-tipo', v); a.click(); },
    removerImg: function (v) { if (!S.imgNova) return; S.imgNova[v] = '__remover__'; pintarPrevImg(v, ''); },
    abrirMin: function (v) { S.atual = v; S.aba = 'agenda'; pintar(); window.scrollTo(0, 0); carregarDetalhe(v, false); },
    voltarLista: function () { S.atual = null; pintar(); window.scrollTo(0, 0); carregarLista(true); },
    abaMin: function (v) { S.aba = v; pintar(); },
    novaFuncao: function () { formFuncao(null); },
    editarFuncao: function (v) { var m = minAtual(); var f = m && (m.funcoes || []).filter(function (x) { return x.id === v; })[0]; if (f) formFuncao(f); },
    salvarFuncao: salvarFuncao,
    novoMembro: function () { formMembro(null); },
    editarMembro: function (v) { var l = S.membros[S.atual]; var p = Array.isArray(l) && l.filter(function (x) { return x.pessoaId === v; })[0]; if (p) formMembro(p); },
    salvarMembro: salvarMembro,
    novoEv: function () { formEvento(null); },
    ajustarEv: function (v) { var l = S.eventos[S.atual]; var e = Array.isArray(l) && l.filter(function (x) { return x.id === v; })[0]; if (e) formEvento(e); },
    salvarEv: salvarEv,
    escolherPessoa: function (v, t) {
      var c = t.getAttribute('data-campo'), nm = t.getAttribute('data-nome');
      if ($(c)) $(c).value = v;
      if ($(c + '-nome')) $(c + '-nome').innerHTML = 'Selecionado: <b>' + esc(nm) + '</b> <a href="#" data-m="limparPessoa" data-v="' + c + '">trocar</a>';
      if ($(c + '-res')) $(c + '-res').innerHTML = ''; if ($(c + '-q')) $(c + '-q').value = '';
    },
    limparPessoa: function (v) { if ($(v)) $(v).value = ''; if ($(v + '-nome')) $(v + '-nome').textContent = 'Nenhuma pessoa selecionada'; if ($(v + '-q')) $(v + '-q').focus(); }
  };
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-m]'); if (!t) return;
    var a = t.getAttribute('data-m'); if (!ACOES[a]) return;
    if (!t.closest('#g2min') && !t.closest('#modal')) return;
    ev.preventDefault(); ev.stopPropagation();
    try { ACOES[a](t.getAttribute('data-v'), t); } catch (e) { console.warn('[2Gather] ministerios', e); toast('Não foi possível concluir.', true); }
  });
  document.addEventListener('input', function (ev) {
    var c = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-busca-pessoa');
    if (c) buscarPessoa(c, ev.target.value);
  });

  M.html = html;
  M.montar = montar;
  M.recarregar = function () { S.lista = null; S.eventos = {}; S.membros = {}; return carregarLista(true); };
  M._t = { traduz: traduz, corpo: corpo, telaLista: telaLista, telaMinisterio: telaMinisterio };
  // KIDS-2: utilitários para o módulo app_v39_kids.js (mesma conexão, modal e toast)
  M._u = { rpc: rpc, cliente: cliente, toast: toast, modal: modal, fecharModal: fecharModal, traduz: traduz, pintar: pintar,
           igrejaId: function () { return S.igreja; }, minAtual: minAtual, eventos: function (id) { return S.eventos[id]; }, membros: function (id) { return S.membros[id]; } };
  // KIDS-5: abrir um ministério numa aba (volta da tela de visitante)
  M.abrir = function (id, aba) { var g = G(); if (g.irAba) g.irAba('ministerios'); S.atual = id; S.aba = aba || 'agenda'; setTimeout(function () { pintar(); carregarDetalhe(id, true); }, 50); };
})();
