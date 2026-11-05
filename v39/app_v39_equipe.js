/* 2Gather v39 · Equipe do GC, permissões por módulo e fotos · EQUIPE-1
   Carregar DEPOIS do app.js (e dos módulos de acesso/usuários).
   1) Preenche a equipe (db.equipe) e a liderança de cada GC → o campo "Líder" e os discípulos
      voltam a aparecer em Editar GC, e o líder é reconhecido como líder do GC (liberar Lar de Vida).
   2) Ao salvar o GC, grava líder, supervisor e discípulos no Supabase (set_growth_group_membership).
   3) Aplica nas telas as liberações/bloqueios por módulo feitos em "Usuários e acessos" e em "Perfis".
   4) Fotos das pessoas: salvar e buscar no bucket privado person-photos.
   Requer: v39_equipe_fotos.sql. Não altera o app.js. */
(function () {
  'use strict';
  var VERSAO = 'EQUIPE-1';
  function G() { return window.__gc || null; }
  function cfg() { var g = G(); return (g && g.cfg()) || {}; }
  function db() { var g = G(); return g ? g.db() : null; }
  function igrejaId() { var c = cfg(); return c.usuario && c.usuario.igrejaId; }
  function v39() { return cfg().token === 'supabase-v39'; }
  function uuid(x) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(x || '')); }
  function V() { return window.G2_V39 || {}; }
  function cliente() {
    var v = V(), pronto = (!v.client && typeof v.init === 'function') ? Promise.resolve(v.init()) : Promise.resolve();
    return pronto.then(function () { if (!v.client) throw new Error('Sem conexão com o servidor.'); return v.client; });
  }
  function rpc(nome, args) {
    return cliente().then(function (c) { var b = c.schema('app'); return (b.__rpcOriginal || b.rpc).call(b, nome, args || {}); })
      .then(function (r) { if (r.error) throw r.error; return r.data; });
  }
  function semFuncao(e) { return /PGRST202|find the function|does not exist/i.test(String(e && (e.message || e.details))); }

  /* ═════ 1 e 3. leitura: equipe, liderança e permissões ═════ */
  var equipeCache = null;
  function aplicarEquipe(gcs) {
    if (!equipeCache) return;
    var d = db(); if (d) d.equipe = equipeCache.equipe || [];
    var mapa = equipeCache.gcs || {};
    (gcs || (d && d.gcs) || []).forEach(function (g) {
      var x = mapa[g.id]; if (!x) return;
      g.liderId = x.liderId || ''; g.liderNome = x.liderNome || '';
      g.supervisorId = x.supervisorId || g.supervisorId || ''; g.supervisorNome = x.supervisorNome || g.supervisorNome || '';
    });
  }
  function carregarEquipe() {
    if (!v39() || !uuid(igrejaId())) return Promise.resolve();
    return rpc('v39_gc_team', { p_church_id: igrejaId() }).then(function (r) { equipeCache = r || null; })
      .catch(function (e) { console.warn('[2Gather][equipe] ' + (semFuncao(e) ? 'rode v39_equipe_fotos.sql' : 'leitura falhou'), e); });
  }

  /* padrão de cada perfil no v38 (cópia de PERM_PADRAO_C do app.js) */
  var PADRAO = {
    supervisor: ['visitantes', 'rede', 'gc', 'gcEvento', 'lvDirecionar', 'lvLiberar'],
    lider: ['gc', 'gcEvento', 'lvLiberar'], discipulo: ['gc', 'lvVisitas'],
    secretaria: ['eventos', 'visitantes', 'recados', 'consulta', 'instituto', 'institutoAdmin', 'institutoCursos', 'instMercado', 'agendaPastoral'],
    tesouraria: ['financeiro', 'relFin'], voluntario: ['visitantes'], voluntarioLV: ['visitantes', 'lvVisitas'],
    voluntarioInst: ['instituto', 'instMercado'], profissional: ['instituto', 'prontuario']
  };
  /* módulo do banco → permissões das telas do app (o que o módulo controla / o que uma liberação concede) */
  var MOD = {
    gcs: { controla: ['gc', 'gcEvento'], libera: ['gc'] },
    life_home: { controla: ['lvVisitas', 'lvLiberar', 'lvDirecionar'], libera: ['lvVisitas'] },
    worship: { controla: ['eventos', 'recados', 'visitantes'], libera: ['eventos', 'visitantes'] },
    events: { controla: ['eventos', 'recados'], libera: ['eventos'] },
    financial: { controla: ['financeiro', 'relFin'], libera: ['financeiro', 'relFin'] },
    people: { controla: ['consulta'], libera: ['consulta'] },
    institute: { controla: ['instituto', 'institutoAdmin', 'institutoCursos'], libera: ['instituto'] },
    solidarity_market: { controla: ['instMercado'], libera: ['instMercado'] },
    access: { controla: ['usuarios'], libera: ['usuarios'] }
  };
  var LEG = { leader: 'lider', disciple: 'discipulo', secretary: 'secretaria', treasury: 'tesouraria', volunteer: 'voluntario',
              life_home_volunteer: 'voluntarioLV', institute_volunteer: 'voluntarioInst', health_professional: 'profissional' };
  function aplicarPermissoes(mods) {
    var u = cfg().usuario; if (!u) return;
    var p = LEG[u.papel] || u.papel;
    if (p === 'master' || p === 'pastor' || !PADRAO[p]) return;            // master/pastor: padrão completo do app
    var on = {}, codigos = {};
    PADRAO[p].forEach(function (c) { on[c] = true; });
    var ligado = {}; (mods || []).forEach(function (m) { ligado[m.modulo] = m; });
    Object.keys(MOD).forEach(function (k) { MOD[k].controla.forEach(function (c) { (codigos[c] = codigos[c] || []).push(k); }); });
    // sem nenhuma permissão no perfil (e sem exceção) em TODOS os módulos que controlam o código → remove
    Object.keys(on).forEach(function (c) {
      var ms = codigos[c]; if (!ms) return;
      var algumLigado = ms.some(function (k) { var m = ligado[k]; return !m || m.doPerfil || m.excecao === 'allow'; });
      if (!algumLigado) delete on[c];
    });
    Object.keys(ligado).forEach(function (k) {
      var m = ligado[k], def = MOD[k]; if (!def) return;
      if (m.excecao === 'deny') def.controla.forEach(function (c) { delete on[c]; });
      else if (m.excecao === 'allow') def.libera.forEach(function (c) { on[c] = true; });
    });
    u.perms = on; u.permsOrigem = VERSAO;
  }
  function carregarPermissoes() {
    if (!v39() || !uuid(igrejaId())) return Promise.resolve();
    return rpc('v39_my_module_access', { p_church_id: igrejaId() }).then(aplicarPermissoes)
      .catch(function (e) { console.warn('[2Gather][permissões] ' + (semFuncao(e) ? 'rode v39_equipe_fotos.sql' : 'leitura falhou'), e); });
  }

  /* ═════ 2. gravação da liderança junto com o GC ═════ */
  function lista(s) { return String(s || '').split(',').filter(uuid); }
  function gravarEquipe(gcIn, gcId) {
    var d = db(), ant = d && (d.gcs || []).filter(function (x) { return x.id === gcId; })[0] || {};
    var novoLider = gcIn.liderId || '', novoSup = gcIn.supervisorId || '', novosDisc = lista(gcIn.discipulos), antDisc = lista(ant.discipulos);
    var mudou = novoLider !== (ant.liderId || '') || novoSup !== (ant.supervisorId || '') || novosDisc.sort().join() !== antDisc.slice().sort().join();
    if (!mudou) return Promise.resolve(null);
    return rpc('v39_set_gc_team', { p_church_id: igrejaId(), p_gc_id: gcId, p_leader_user: uuid(novoLider) ? novoLider : null,
      p_supervisor_user: uuid(novoSup) ? novoSup : null, p_discipulos: novosDisc, p_previous: antDisc });
  }

  /* ═════ 4. fotos ═════ */
  function dataUrlParaBlob(u) {
    var p = String(u).split(','), mime = (p[0].match(/data:([^;]+)/) || [])[1] || 'image/jpeg', bin = atob(p[1] || ''), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: mime });
  }
  function sha256(blob) {
    if (!window.crypto || !crypto.subtle || !blob.arrayBuffer) return Promise.resolve(null);
    return blob.arrayBuffer().then(function (b) { return crypto.subtle.digest('SHA-256', b); })
      .then(function (h) { return Array.prototype.map.call(new Uint8Array(h), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); })
      .catch(function () { return null; });
  }
  function blobParaDataUrl(b) { return new Promise(function (ok, err) { var fr = new FileReader(); fr.onload = function () { ok(fr.result); }; fr.onerror = err; fr.readAsDataURL(b); }); }
  function salvarFoto(d) {
    var pid = d && d.id, foto = d && d.foto, ig = igrejaId();
    if (!uuid(pid)) return Promise.reject(new Error('Cadastro não encontrado no servidor. Salve a pessoa e tente de novo.'));
    if (foto === '__remover__') {
      return rpc('v39_people_photos', { p_church_id: ig, p_person_ids: [pid] }).then(function (l) {
        var x = (l || [])[0]; if (!x) return { ok: true, fotoV: '' };
        return rpc('v39_unlink_file', { p_church_id: ig, p_link_id: x.linkId, p_reason: 'Foto removida no app' }).then(function () { return { ok: true, fotoV: '' }; });
      });
    }
    var blob = dataUrlParaBlob(foto), caminho = ig + '/' + pid + '/' + Date.now() + '.jpg';
    return cliente().then(function (c) {
      return c.storage.from('person-photos').upload(caminho, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
    }).then(function (r) {
      if (r.error) throw /row-level|policy|permission|403/i.test(r.error.message || '') ? new Error('Você não tem permissão para enviar fotos. Peça à liderança para liberar "Gerenciar foto de pessoa" no seu perfil.') : r.error;
      return sha256(blob);
    }).then(function (h) {
      return rpc('register_person_photo', { p_church_id: ig, p_person_id: pid, p_storage_path: caminho, p_original_file_name: 'foto.jpg', p_checksum_sha256: h });
    }).then(function () { return { ok: true, fotoV: caminho }; });
  }
  function buscarFotos(d) {
    var ids = ((d && d.ids) || []).filter(uuid), ig = igrejaId();
    if (!ids.length) return Promise.resolve({ ok: true, itens: [] });
    return rpc('v39_people_photos', { p_church_id: ig, p_person_ids: ids }).then(function (l) {
      return cliente().then(function (c) {
        return Promise.all((l || []).map(function (x) {
          return c.storage.from('person-photos').download(x.path).then(function (r) {
            if (r.error || !r.data) return null;
            return blobParaDataUrl(r.data).then(function (u) { return { id: x.id, fotoV: x.fotoV, foto: u }; });
          }).catch(function () { return null; });
        }));
      });
    }).then(function (itens) { return { ok: true, itens: itens.filter(Boolean) }; });
  }

  /* ═════ ganchos nos módulos v39 ═════ */
  function instalar() {
    var v = V(); if (!v.p1 || !v.p13) return false;
    if (typeof v.p13.hydrate === 'function' && !v.p13.__g2equipe) {
      var h = v.p13.hydrate;
      v.p13.hydrate = function () {
        var a = arguments;
        return Promise.all([carregarEquipe(), carregarPermissoes()]).catch(function () {})
          .then(function () { return h.apply(v.p13, a); })
          .then(function (r) { if (r && r.gcs) aplicarEquipe(r.gcs); return r; });
      };
      v.p13.__g2equipe = true;
    }
    var P = v.p1;
    if (typeof P.execute === 'function' && !P.__g2equipe) {
      var ex = P.execute, isM = P.isMutation, isR = P.isRead, rd = P.read;
      P.isMutation = function (a) { return a === 'salvarFotoPessoa' || (isM ? isM.call(P, a) : false); };
      P.isRead = function (a) { return a === 'fotosPessoas' || (isR ? isR.call(P, a) : false); };
      P.read = function (a, d) { return a === 'fotosPessoas' ? buscarFotos(d) : (rd ? rd.call(P, a, d) : Promise.reject(new Error('Leitura indisponível: ' + a))); };
      P.execute = function (acao, dados, prog) {
        if (acao === 'salvarFotoPessoa') return salvarFoto(dados);
        return Promise.resolve(ex.call(P, acao, dados, prog)).then(function (r) {
          if (acao !== 'salvarGC') return r;
          var gc = (dados && dados.gc) || {}, id = gc.id || (r && r.gc && r.gc.id);
          if (!uuid(id) || gc.deleted || gc._restrito || !('liderId' in gc)) return r;
          return gravarEquipe(gc, id).then(function (res) {
            if (r && r.gc) { r.gc.liderId = gc.liderId || ''; r.gc.liderNome = gc.liderNome || ''; r.gc.supervisorId = gc.supervisorId || ''; r.gc.supervisorNome = gc.supervisorNome || ''; r.gc.discipulos = gc.discipulos || ''; }
            if (res && res.avisos && res.avisos.length) console.warn('[2Gather][equipe]', res.avisos);
            return carregarEquipe().then(function () { return r; });
          }, function (e) {
            var t = String((e && (e.message || e.details)) || '');
            throw new Error('Os dados do GC foram salvos, mas a liderança não: ' + (/PERMISSION|permiss/i.test(t) ? 'você não tem permissão para definir o líder deste GC (somente master ou pastor).' : /PERSON_NOT_LINKED/.test(t) ? 'o líder escolhido não tem cadastro de pessoa.' : (e && e.message) || 'erro desconhecido'));
          });
        });
      };
      P.__g2equipe = true;
    }
    return true;
  }
  var n = 0, t = setInterval(function () { if (instalar() || ++n > 240) clearInterval(t); }, 250);

  /* primeira carga (antes da 1ª sincronização) */
  var carregadoPara = null;
  setInterval(function () {
    if (!v39() || !uuid(igrejaId()) || carregadoPara === igrejaId() || !V().client) return;
    carregadoPara = igrejaId();
    Promise.all([carregarEquipe(), carregarPermissoes()]).then(function () {
      aplicarEquipe(); var g = G(); if (g && g.render) g.render();
    });
  }, 800);

  window.G2_EQUIPE = { versao: VERSAO, recarregar: function () { return Promise.all([carregarEquipe(), carregarPermissoes()]).then(function () { aplicarEquipe(); }); } };
})();
