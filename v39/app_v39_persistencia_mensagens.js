/* ═══════════════════════════════════════════════════════════════
   2Gather v39 · SYNC-V39-5
   Complemento carregado DEPOIS do app.js (não altera o app.js).
   1) Ficha do culto/evento: dízimos, ofertas, outras, presentes, tema,
      recados, pregador, título da palavra e janela de cadastro → Supabase.
   2) Receitas e anfitrião do encontro de GC → Supabase.
   3) Mensagens do sistema em linguagem clara para o usuário.
   4) Versão visível no Perfil e na barra superior.
   Requer: v39_ficha_recados_receitas.sql executado no Supabase.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var BUILD = 'SYNC-V39-5';
  var VERSAO = '2Gather v39 · ' + BUILD;
  window.G2_BUILD = BUILD;
  console.info('[2Gather] ' + VERSAO);

  var CAMPOS_EV = ['dizimo', 'oferta', 'outras', 'presentes', 'tema', 'recados', 'pregador', 'tituloPalavra', 'antes', 'depois'];
  var cacheEv = {};   // 'source|id' -> resumo
  var cacheGc = {};   // meetingId -> resumo

  function G() { return window.__gc || null; }
  function db() { var g = G(); return g ? g.db() : null; }
  function cfg() { var g = G(); return g ? g.cfg() : {}; }
  function igrejaId() { var c = cfg(); return c && c.usuario && c.usuario.igrejaId; }
  function v39() { return (cfg() || {}).token === 'supabase-v39'; }
  function uuid(x) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(x || '')); }
  function salvarLocal() { try { var d = db(); if (d) localStorage.setItem('gcbv5_db', JSON.stringify(d)); } catch (e) {} }

  /* ── chamada direta ao Supabase (sem passar pelos wrappers) ── */
  var rpcOriginal = null;
  function rpc(nome, args) {
    var V = window.G2_V39 || {};
    var pronto = (!V.client && typeof V.init === 'function') ? Promise.resolve(V.init()) : Promise.resolve();
    return pronto.then(function () {
      if (!V.client) throw new Error('Cliente Supabase indisponível.');
      var b = V.client.schema('app');
      var fn = (b.__rpcOriginal || b.rpc).bind(b);
      return fn(nome, args || {});
    }).then(function (r) { if (r.error) throw r.error; return r.data; });
  }
  function lista(x) { return Array.isArray(x) ? x : (x && Array.isArray(x.items) ? x.items : []); }

  /* ═════ 1. CULTOS E EVENTOS ═════ */
  function chaveEv(src, id) { return (src || 'church_events') + '|' + id; }
  function resumoDeEvento(ev) { var o = {}; CAMPOS_EV.forEach(function (k) { if (ev && ev[k] !== undefined && ev[k] !== null) o[k] = String(ev[k]); }); return o; }

  function salvarResumoEvento(ev) {
    if (!v39() || !ev || ev.deleted || !uuid(ev.id) || !uuid(igrejaId())) return Promise.resolve(null);
    var local = (db() && (db().eventos || []).filter(function (x) { return x.id === ev.id; })[0]) || {};
    var junto = Object.assign({}, local, ev);
    var src = junto._source === 'worship_services' ? 'worship_services' : 'church_events';
    var payload = resumoDeEvento(junto);
    return rpc('v39_save_event_summary', { p_church_id: igrejaId(), p_source: src, p_record_id: ev.id, p_payload: payload })
      .then(function () { cacheEv[chaveEv(src, ev.id)] = payload; return payload; })
      .catch(function (e) { console.warn('[2Gather][ficha] não salvou no Supabase', e); throw traduzErro(e); });
  }
  function carregarResumosEventos() {
    if (!v39() || !uuid(igrejaId())) return Promise.resolve();
    return rpc('v39_list_event_summaries', { p_church_id: igrejaId() }).then(function (l) {
      var novo = {}; lista(l).forEach(function (s) { var o = {}; CAMPOS_EV.forEach(function (k) { if (s[k] != null) o[k] = s[k]; }); novo[chaveEv(s.source, s.id)] = o; });
      cacheEv = novo;
    }).catch(function (e) { console.warn('[2Gather][ficha] leitura falhou (rode v39_ficha_recados_receitas.sql)', e); });
  }
  function mesclarEventos(lst) {
    var mudou = false;
    (lst || []).forEach(function (e) {
      if (!e || e._pend) return;
      var s = cacheEv[chaveEv(e._source, e.id)] || cacheEv[chaveEv('church_events', e.id)] || cacheEv[chaveEv('worship_services', e.id)];
      if (!s) return;
      CAMPOS_EV.forEach(function (k) { if (s[k] !== undefined && s[k] !== null && s[k] !== '' && String(e[k] == null ? '' : e[k]) !== String(s[k])) { if (!(k in e) || e[k] === '' || e[k] == null) { e[k] = s[k]; mudou = true; } } });
    });
    return mudou;
  }

  /* ═════ 2. ENCONTROS DE GC (receitas) ═════ */
  function salvarResumoGC(meetingId, gcId, data) {
    var d = db(); if (!d || !uuid(meetingId)) return Promise.resolve();
    var e = (d.encontros || []).filter(function (x) { return x.gcId === gcId && x.data === data && !x.deleted; })[0];
    if (!e || !('dizimo' in e || 'oferta' in e || 'anfitriao' in e)) return Promise.resolve();
    var p = { dizimo: e.dizimo || '', oferta: e.oferta || '', anfitriao: e.anfitriao || '' };
    return rpc('v39_save_gc_meeting_summary', { p_meeting_id: meetingId, p_payload: p })
      .then(function () { cacheGc[meetingId] = p; })
      .catch(function (err) { console.warn('[2Gather][GC] receitas não salvas', err); });
  }
  function carregarResumosGC() {
    if (!v39() || !uuid(igrejaId())) return Promise.resolve();
    return rpc('v39_list_gc_meeting_summaries', { p_church_id: igrejaId() }).then(function (l) {
      var novo = {}; lista(l).forEach(function (s) { novo[s.meetingId] = { dizimo: s.dizimo || '', oferta: s.oferta || '', anfitriao: s.anfitriao || '' }; });
      cacheGc = novo;
    }).catch(function (e) { console.warn('[2Gather][GC] leitura das receitas falhou (rode v39_ficha_recados_receitas.sql)', e); });
  }
  function mesclarEncontros(lst) {
    var mudou = false;
    (lst || []).forEach(function (e) {
      if (!e || e._pend) return;
      var s = cacheGc[e.meetingId] || cacheGc[e.id]; if (!s) return;
      ['dizimo', 'oferta', 'anfitriao'].forEach(function (k) { if (s[k] && (!(k in e) || e[k] === '' || e[k] == null)) { e[k] = s[k]; mudou = true; } });
    });
    return mudou;
  }

  /* ── redesenha a tela sem efeitos colaterais (ação interna sem uso: lvFiltro) ── */
  function redesenhar() {
    var a = document.activeElement;
    if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && document.getElementById('main') && document.getElementById('main').contains(a)) { setTimeout(redesenhar, 1500); return; }
    var t = document.createElement('span'); t.setAttribute('data-a', 'lvFiltro'); t.setAttribute('data-v', ''); t.style.display = 'none';
    document.body.appendChild(t); t.click(); document.body.removeChild(t);
  }
  setInterval(function () {
    var d = db(); if (!d || !v39()) return;
    var m1 = mesclarEventos(d.eventos), m2 = mesclarEncontros(d.encontros);
    if (m1 || m2) { salvarLocal(); redesenhar(); }
  }, 1500);

  /* ═════ ganchos nos módulos v39 (sem tocar no app.js) ═════ */
  function instalar() {
    var V = window.G2_V39; if (!V) return false;
    var ok = true;
    // leitura geral: atualiza os caches e já mescla nos eventos antes de desenhar
    if (V.p13 && typeof V.p13.hydrate === 'function' && !V.p13.__g2wrap) {
      var hOrig = V.p13.hydrate;
      V.p13.hydrate = function () {
        var args = arguments;
        return Promise.all([carregarResumosEventos(), carregarResumosGC()]).catch(function () {})
          .then(function () { return hOrig.apply(V.p13, args); })
          .then(function (r) { if (r && r.eventos) mesclarEventos(r.eventos); return r; });
      };
      V.p13.__g2wrap = true;
    } else if (!(V.p13 && V.p13.__g2wrap)) ok = false;
    // gravação de culto/evento pelo contrato P1
    if (V.p1 && typeof V.p1.execute === 'function' && !V.p1.__g2wrap) {
      var eOrig = V.p1.execute;
      V.p1.execute = function (acao, dados, progresso) {
        return Promise.resolve(eOrig.call(V.p1, acao, dados, progresso)).then(function (r) {
          if (acao !== 'salvarEvento') return r;
          var ev = (dados && dados.evento) || {}, id = ev.id || (r && r.evento && r.evento.id);
          if (!id || ev.deleted) return r;
          var junto = Object.assign({}, ev, { id: id, _source: ev._source || (r && r.evento && r.evento._source) });
          return salvarResumoEvento(junto).then(function (s) {
            if (r && r.evento && s) Object.keys(s).forEach(function (k) { r.evento[k] = s[k]; });
            return r;
          });
        });
      };
      V.p1.__g2wrap = true;
    } else if (!(V.p1 && V.p1.__g2wrap)) ok = false;
    // culto especializado (worship_services)
    var H = V.p1 && V.p1.handlers;
    if (H && typeof H.salvarCulto === 'function' && !H.__g2wrap) {
      var cOrig = H.salvarCulto;
      H.salvarCulto = function (input) {
        return Promise.resolve(cOrig.call(H, input)).then(function (r) {
          var ev = (input && (input.culto || input.evento)) || {}, ret = r && (r.evento || r.culto), id = ev.id || (ret && ret.id);
          if (!id || ev.deleted) return r;
          return salvarResumoEvento(Object.assign({}, ev, { id: id, _source: 'worship_services' })).then(function () { return r; });
        });
      };
      H.__g2wrap = true;
    }
    // encontro do GC: depois de gravar o encontro, grava as receitas
    if (V.client && typeof V.client.schema === 'function' && !V.client.__g2wrap) {
      var sOrig = V.client.schema.bind(V.client);
      V.client.schema = function (nome) {
        var b = sOrig(nome);
        if (nome !== 'app' || !b || typeof b.rpc !== 'function' || b.__rpcOriginal) return b;
        var rOrig = b.rpc;
        b.__rpcOriginal = rOrig;
        b.rpc = function (fn, args, opts) {
          var q = rOrig.call(b, fn, args, opts);
          if (fn !== 'v39_save_gc_meeting' && fn !== 'save_gc_meeting') return q;
          return Promise.resolve(q).then(function (res) {
            if (res && !res.error && res.data && res.data.id && args && args.p_payload)
              return salvarResumoGC(res.data.id, args.p_growth_group_id, args.p_payload.meeting_date).then(function () { return res; });
            return res;
          });
        };
        return b;
      };
      V.client.__g2wrap = true;
    } else if (!(V.client && V.client.__g2wrap)) ok = false;
    return ok;
  }
  var tent = 0, tm = setInterval(function () { if (instalar() || ++tent > 240) clearInterval(tm); }, 250);
  instalar();

  /* ═════ 3. MENSAGENS CLARAS ═════ */
  var CODIGOS = {
    GC_MEETING_CONFLICT: 'Já existe um encontro deste GC nesta data. Abra o encontro da lista para editar.',
    GC_MEETING_DATE_REQUIRED: 'Informe a data do encontro.',
    GC_MEETING_TIME_INVALID: 'O horário de término precisa ser depois do início.',
    GC_MEETING_NOT_FOUND: 'Encontro não encontrado. Atualize a página e tente de novo.',
    GC_MEETING_CLOSED: 'Este encontro foi cancelado e não pode ser reaberto.',
    GC_MEETING_INVALID: 'Algum dado do encontro está em formato inválido. Confira data e horários.',
    GC_MEETING_STATUS_INVALID: 'Situação do encontro inválida.',
    GC_NOT_FOUND: 'GC não encontrado. Atualize a página.',
    GC_FIELD_NOT_ALLOWED: 'Esse dado do GC não pode ser alterado por esta tela.',
    GC_NAME_REQUIRED: 'Informe o nome do GC.',
    GC_VALUES_INVALID: 'Valores inválidos. Use números, por exemplo 150,00.',
    EVENT_NOT_FOUND: 'Culto ou evento não encontrado. Atualize a agenda.',
    EVENT_VALUES_INVALID: 'Valores inválidos. Use números, por exemplo 150,00.',
    PERSON_NAME_REQUIRED: 'Informe o nome da pessoa.',
    PERSON_NOT_FOUND: 'Pessoa não encontrada nesta igreja. Atualize a página.',
    PERMISSION_DENIED: 'Você não tem permissão para esta ação. Fale com a liderança.',
    REASON_REQUIRED: 'Informe o motivo para continuar.',
    CHURCH_REQUIRED: 'Não foi possível identificar a igreja. Saia e entre novamente.',
    V39_ACTION_NOT_MAPPED: 'Esta função ainda está sendo migrada para a nova versão e não está disponível no momento.',
    V39_CLIENT_UNAVAILABLE: 'Não foi possível conectar ao servidor. Atualize a página.'
  };
  function traduzTexto(t) {
    t = String(t || '');
    for (var c in CODIGOS) if (t.indexOf(c) >= 0) return CODIGOS[c];
    if (/a[cç][aã]o v39 n[aã]o mapeada/i.test(t)) return CODIGOS.V39_ACTION_NOT_MAPPED;
    if (/failed to fetch|networkerror|load failed|sem conex[aã]o|network request failed/i.test(t)) return 'Sem conexão com a internet. O que você fez fica guardado e será enviado quando a conexão voltar.';
    if (/jwt|token.*expir|sess[aã]o expir|not authenticated|invalid refresh/i.test(t)) return 'Sua sessão expirou. Saia e entre novamente.';
    if (/sem permiss|permission denied|row-level security|42501/i.test(t)) return CODIGOS.PERMISSION_DENIED;
    if (/duplicate key|unique constraint|23505/i.test(t)) return 'Este registro já existe.';
    if (/invalid input syntax|violates check|22P02|23514/i.test(t)) return 'Algum dado está em formato inválido. Confira os campos.';
    if (/could not find the function|PGRST202/i.test(t)) return 'O servidor ainda não tem esta função. Avise o administrador do sistema.';
    if (/cliente supabase indispon/i.test(t)) return CODIGOS.V39_CLIENT_UNAVAILABLE;
    return '';
  }
  function traduzErro(e) { var m = traduzTexto((e && (e.message || e.details || e.code)) || e); var x = new Error(m || (e && e.message) || 'Não foi possível concluir. Tente novamente.'); x.original = e; return x; }

  function amigavel(t) {
    var o = String(t || ''), r = o, m;
    if ((m = o.match(/^Chamada guardada no aparelho, mas N[ÃA]O enviada: (.*)$/i))) r = 'A chamada foi guardada neste aparelho, mas ainda não chegou ao servidor. ' + (traduzTexto(m[1]) || 'Tente salvar novamente.');
    else if ((m = o.match(/^N[ãa]o foi poss[íi]vel salvar a chamada: (.*)$/i))) r = 'Não foi possível salvar a chamada. ' + (traduzTexto(m[1]) || 'Tente novamente.');
    else if (/Atualizado com avisos/.test(o)) r = 'Dados atualizados, mas parte das informações não carregou. Tente sincronizar de novo.';
    else if (/salva no Supabase/.test(o)) r = o.replace(' no Supabase', '');
    else if (/^(Erro|Falha|Error)/i.test(o) || /[A-Z]{3,}_[A-Z_]{3,}/.test(o) || /supabase|v39|rpc|PGRST|Apps Script/i.test(o)) { var tr = traduzTexto(o); if (tr) r = tr; else if (/supabase|v39|rpc|PGRST/i.test(o)) r = 'Não foi possível concluir agora. Tente novamente em instantes.'; }
    return r;
  }
  function statusAmigavel(t) {
    var o = String(t || ''), r = o, m;
    if ((m = o.match(/^(.*?)(\d+) altera[cç][aã]o\(?[õo]?e?s?\)? N[ÃA]O enviada\(s\) ao Supabase$/i))) r = m[1] + m[2] + (m[2] === '1' ? ' alteração aguardando envio' : ' alterações aguardando envio');
    else if (/leitura parcial/i.test(o)) r = 'Alguns dados não carregaram · toque em Sincronizar';
    else if (/falha de leitura/i.test(o)) r = 'Não foi possível atualizar · verifique a internet';
    else if (/Enviando altera[cç][oõ]es ao Supabase/i.test(o)) r = 'Enviando alterações…';
    else if (/Atualizando do Supabase/i.test(o)) r = 'Atualizando…';
    else if (/Supabase conectado$/i.test(o)) r = o.replace(/Supabase conectado$/i, 'Conectado');
    return r;
  }
  function vigiar(id, fn) {
    var el = document.getElementById(id); if (!el) return false;
    var trocando = false;
    new MutationObserver(function () {
      if (trocando) return;
      var a = el.textContent, b = fn(a);
      if (b && b !== a) { trocando = true; el.textContent = b; trocando = false; }
    }).observe(el, { childList: true, characterData: true, subtree: true });
    var b0 = fn(el.textContent); if (b0 && b0 !== el.textContent) el.textContent = b0;
    return true;
  }
  var vig = { toast: false, 'h-sub': false, 'l-erro': false, 'c-erro': false };
  var tv = setInterval(function () {
    if (!vig.toast) vig.toast = vigiar('toast', amigavel);
    if (!vig['h-sub']) vig['h-sub'] = vigiar('h-sub', statusAmigavel);
    if (!vig['l-erro']) vig['l-erro'] = vigiar('l-erro', amigavel);
    if (!vig['c-erro']) vig['c-erro'] = vigiar('c-erro', amigavel);
    if (vig.toast && vig['h-sub'] && vig['l-erro'] && vig['c-erro']) clearInterval(tv);
  }, 300);

  /* ═════ 4. VERSÃO VISÍVEL ═════ */
  function marcarVersao() {
    var ms = document.querySelectorAll('#main .meta');
    for (var i = 0; i < ms.length; i++) if (/app v\d+/.test(ms[i].textContent) && ms[i].textContent.indexOf(BUILD) < 0)
      ms[i].textContent = ms[i].textContent.replace(/app v\d+/, 'versão v39 · ' + BUILD);
    var tag = document.getElementById('g2-build');
    if (!tag) {
      tag = document.createElement('div'); tag.id = 'g2-build';
      tag.style.cssText = 'position:fixed;right:8px;bottom:calc(env(safe-area-inset-bottom) + 4px);z-index:5;font-size:10px;color:#9aa1ac;pointer-events:none;font-family:inherit';
      tag.textContent = 'v39 · ' + BUILD; document.body.appendChild(tag);
    }
  }
  var main = document.getElementById('main');
  if (main) new MutationObserver(marcarVersao).observe(main, { childList: true });
  setTimeout(marcarVersao, 800);
})();
