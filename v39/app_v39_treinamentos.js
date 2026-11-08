/* 2Gather v39 · Treinamentos/Reuniões e Cursos do Instituto · TRN-1
   Carregar DEPOIS do app.js (SYNC-V39-15) e dos demais módulos v39. Não altera o app.js.
   Requer: v39_treinamentos_completo.sql rodado no Supabase.

   Por que existe: na v39 o app.js não carregava reuniões/aulas do banco (só o ramo antigo do Apps Script fazia isso)
   e as gravações não tinham destino. Este módulo:
   1) carrega as reuniões, treinamentos, cursos e datas (aulas) do Supabase para o app (db.reunioes e db.aulas);
   2) liga as ações da tela ao banco: salvarReuniao, salvarAula e conviteEnviado;
   3) mostra mensagens claras e atualiza a tela sozinho (a cada 90 s, ao voltar para o app e ao abrir a aba).
   Quem enxerga o quê é decidido no BANCO: Master/Pastor gerenciam treinamentos; Master/Pastor/Secretaria gerenciam
   cursos do Instituto; quem foi escolhido como responsável faz a chamada só dos seus. */
(function () {
  'use strict';
  var VERSAO = 'TRN-1';
  if (window.G2_TRN) return;
  window.G2_TRN = { versao: VERSAO };
  console.info('[2Gather] treinamentos ' + VERSAO);

  /* ───────── utilidades ───────── */
  function $(id) { return document.getElementById(id); }
  function G() { return window.__gc || null; }
  function cfg() { var g = G(); try { return (g && g.cfg && g.cfg()) || {}; } catch (e) { return {}; } }
  function db() { var g = G(); try { return (g && g.db && g.db()) || null; } catch (e) { return null; } }
  function v39() { return cfg().token === 'supabase-v39'; }
  function uuid(x) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(x || '')); }
  function igrejaId() {
    var V = window.G2_V39 || {};
    if (V.churchContext && typeof V.churchContext.ensure === 'function') { try { var c = V.churchContext.ensure(); if (c) return c; } catch (e) { /* segue */ } }
    var u = cfg().usuario || {}; return u.igrejaId || null;
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

  var MSG = {
    TRN_TITLE_REQUIRED: 'Informe o título.',
    TRN_DATE_REQUIRED: 'Informe a data.',
    TRN_DATE_INVALID: 'A data informada é inválida.',
    TRN_TIME_INVALID: 'O horário de término precisa ser depois do início.',
    TRN_NOT_FOUND: 'Não encontrado. Atualize a página e tente de novo.',
    TRN_CLASS_FUTURE: 'Esta data ainda não chegou. A chamada pode ser lançada no dia.',
    TRN_PARTICIPANT_INVALID: 'Há um participante inválido ou de outra igreja. Remova e escolha de novo.',
    PERMISSION_DENIED: 'Você não tem permissão para esta ação. Fale com a liderança.'
  };
  function traduz(e) {
    var t = String((e && (e.message || e.details || e.hint || e.code)) || e || ''), d = String((e && e.details) || '');
    for (var k in MSG) if (t.indexOf(k) >= 0 || d === k) return MSG[k];
    if (/PGRST202|find the function|does not exist/i.test(t)) return 'O servidor ainda não tem esta função. Rode o v39_treinamentos_completo.sql no Supabase.';
    if (/JWT|token|401/i.test(t)) return 'Sua sessão expirou. Saia e entre de novo.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(t)) return 'Sem conexão. Tente novamente.';
    return 'Não foi possível concluir. Tente novamente.';
  }
  function erro(e) { console.warn('[2Gather][treinamentos]', e); return new Error(traduz(e)); }

  /* ───────── carga do servidor para o app ───────── */
  var S = { ig: '', t: 0, carregando: false, sig: '', aba: '' };
  function digitando() {
    var a = document.activeElement, m = $('main');
    return !!(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && m && m.contains(a));
  }
  function redesenhar() {
    var g = G(); if (!g || typeof g.render !== 'function') return;
    if (digitando()) { setTimeout(redesenhar, 1500); return; }
    var md = $('modal'); if (md && md.classList.contains('on')) { setTimeout(redesenhar, 2500); return; }
    g.render();
  }
  function hidratar(forcar) {
    var ig = igrejaId();
    if (!v39() || !uuid(ig) || S.carregando) return Promise.resolve();
    if (!forcar && S.ig === ig && Date.now() - S.t < 15000) return Promise.resolve();
    S.carregando = true;
    return rpc('v39_trn_list', { p_church_id: ig }).then(function (r) {
      var d = db(); if (!d || !r) return;
      var sig = JSON.stringify([r.reunioes, r.aulas]);
      d.reunioes = r.reunioes || []; d.aulas = r.aulas || [];
      if (!(d.equipeInst && d.equipeInst.length)) d.equipeInst = d.equipe || [];
      var mudou = sig !== S.sig; S.sig = sig; S.ig = ig; S.t = Date.now();
      if (mudou) redesenhar();
    }).catch(function (e) { S.ig = ig; S.t = Date.now(); console.warn('[2Gather][treinamentos] leitura falhou: ' + traduz(e)); })
      .then(function () { S.carregando = false; });
  }

  /* ───────── ações da tela (salvarReuniao, salvarAula, conviteEnviado) ───────── */
  function limpar(o) { var x = {}; for (var k in o) if (o[k] !== undefined) x[k] = o[k]; return x; }
  var ACOES = {
    salvarReuniao: function (d) {
      var p = limpar(d.reuniao || {});
      return rpc('v39_trn_save_meeting', { p_church_id: igrejaId(), p: p }).then(function (r) {
        setTimeout(function () { hidratar(true); }, 600);
        return { ok: true, reuniao: r.reuniao, aulas: r.aulas || [] };
      }).catch(function (e) { throw erro(e); });
    },
    salvarAula: function (d) {
      var p = limpar(d.aula || {});
      return rpc('v39_trn_save_class', { p_church_id: igrejaId(), p: p }).then(function (r) {
        return { ok: true, aula: r.aula };
      }).catch(function (e) { throw erro(e); });
    },
    conviteEnviado: function (d) {
      return rpc('v39_trn_mark_invited', { p_church_id: igrejaId(), p_meeting_id: d.reuniaoId, p_keys: d.chaves || [] })
        .then(function () { return { ok: true }; }).catch(function (e) { throw erro(e); });
    }
  };

  /* ───────── gancho no roteador de ações v39 (mesmo padrão dos demais módulos) ───────── */
  function instalar() {
    var V = window.G2_V39; if (!V || !V.p1) return false;
    var P = V.p1; if (P.__trn) return true;
    if (typeof P.isMutation !== 'function' || typeof P.isRead !== 'function' || typeof P.execute !== 'function') return false;
    var isM = P.isMutation, isR = P.isRead, ex = P.execute;
    P.isMutation = function (a) { return ACOES[a] ? true : isM.apply(P, arguments); };
    P.isRead = function (a) { return ACOES[a] ? false : isR.apply(P, arguments); };
    P.execute = function (a, d) { return ACOES[a] ? ACOES[a](d || {}) : ex.apply(P, arguments); };
    P.__trn = true;
    return true;
  }
  var tent = 0, tm = setInterval(function () { if (instalar() || ++tent > 240) clearInterval(tm); }, 250);

  /* ───────── manutenção: troca de usuário, abertura da aba, atualização periódica ───────── */
  setInterval(function () {
    if (!cfg().usuario || !v39()) { if (S.ig) { S.ig = ''; S.sig = ''; S.t = 0; } return; }
    var ig = igrejaId();
    if (ig && S.ig !== ig) { S.sig = ''; hidratar(true); return; }
    var aba = String(cfg().aba || '');
    if (aba !== S.aba) { S.aba = aba; if (/cursos|instcursos/.test(aba)) hidratar(false); }
  }, 800);
  setInterval(function () { hidratar(true); }, 90000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') hidratar(false); });

  window.G2_TRN.hidratar = function () { return hidratar(true); };
  window.G2_TRN._acoes = ACOES;
})();
