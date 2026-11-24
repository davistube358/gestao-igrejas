/* 2Gather v39 · Kids · KIDS-3
   KIDS-3: aba "Entrada e saída": entrada com código de 4 dígitos (irmãos usam o mesmo), etiqueta térmica 62x29 mm,
           WhatsApp ao responsável (wa.me), retirada com código ou pela foto (com motivo), cancelar com motivo;
           contagem "Kids" no culto (G2_KIDS.cultoKids) e aviso de quem falta retirar ao encerrar (G2_KIDS.pendentesCulto).
           Requer sql/KIDS_3_entrada_aplicar.sql.
   Arquivo NOVO. Carregar DEPOIS do app_v39_ministerios.js (MIN-3+). Requer no Supabase: sql/KIDS_2_familias_aplicar.sql.
   Aba "Crianças" do ministério Kids:
   - Famílias: responsável -> criança -> quem pode retirar (12 anos ou mais). Base única de pessoas (busca antes de cadastrar).
   - Foto do rosto (câmera do celular) da criança e de quem retira; exige a autorização (kids_care) da pessoa.
   - Autorização do responsável pela criança (LGPD); adulto autoriza por si. Revogar exige motivo.
   - Ficha da criança (alergias, doenças, restrições, medicamentos): cifrada no banco; cada abertura fica na auditoria.
   - "Completaram 12 anos": o líder conclui a saída do Kids (cadastro vai para o geral da igreja).
   Quem autoriza é o banco (RPCs app.v39_kids_*); o front só esconde botões.
   Diagnóstico no Console: G2_KIDS.versao, G2_KIDS._s */
(function () {
  'use strict';
  var VERSAO = 'KIDS-3';
  if (window.G2_KIDS) return;
  var K = window.G2_KIDS = { versao: VERSAO };
  console.info('[2Gather] kids ' + VERSAO);

  function U() { return (window.G2_MIN && window.G2_MIN._u) || null; }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rpc(n, a) { return U().rpc(n, a); }
  function toast(t, e) { U().toast(t, e); }
  function modal(h) { U().modal(h); }
  function fechar() { U().fecharModal(); }
  function pintar() { U().pintar(); }
  function pill(txt, cor) { return '<span class="pill" style="background:' + cor + '1f;color:' + cor + '">' + esc(txt) + '</span>'; }
  function fone(d) { d = String(d || '').replace(/\D/g, ''); return d.length === 11 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7) : d.length === 10 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6) : d; }
  function uuid4() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach(function (_, i) { b[i] = Math.floor(Math.random() * 256); });
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = [].map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  var MSG = {
    KIDS_PHONE_REQUIRED: 'Informe o WhatsApp do responsável.', KIDS_PHONE_INVALID: 'WhatsApp inválido: use DDD + número.',
    KIDS_BIRTH_REQUIRED: 'Informe a data de nascimento.', KIDS_BIRTH_INVALID: 'A data de nascimento está no futuro.',
    KIDS_AGE_OVER: 'A criança já passou da idade do Kids.', KIDS_AGE_UNDER: 'A criança ainda não completou a idade de saída do Kids.',
    KIDS_PICKUP_AGE: 'Quem retira precisa ter 12 anos ou mais.', KIDS_CONSENT_REQUIRED: 'Registre antes a autorização do responsável.',
    KIDS_GUARDIAN_REQUIRED: 'Escolha o responsável que autoriza.', KIDS_GUARDIAN_INVALID: 'Quem autoriza precisa ser responsável na mesma família.',
    KIDS_FAMILY_NAME_REQUIRED: 'Informe o nome da família.', KIDS_FAMILY_INACTIVE: 'Família inativa.', KIDS_PERSON_INVALID: 'Esta pessoa não pode ser usada.',
    KIDS_PERSON_NOT_IN_FAMILY: 'A pessoa não está em uma família do Kids.', KIDS_CHILD_NOT_FOUND: 'Criança não encontrada no Kids.',
    KIDS_CONSENT_NOT_FOUND: 'Não há autorização ativa.', KIDS_PROFILE_TOO_LONG: 'Texto muito longo.', KIDS_SEX_INVALID: 'Sexo inválido.',
    KIDS_MINISTRY_REQUIRED: 'Use o ministério Kids.', CPF_INVALID: 'CPF inválido.', PERSON_REQUIRED_FIELD: 'Informe o nome.', PERSON_REQUIRED: 'Informe a pessoa.',
    REASON_REQUIRED: 'Informe o motivo.', PERMISSION_DENIED: 'Sem permissão para esta ação (algumas são só do líder).', MIN_INACTIVE: 'O ministério não está ativo.',
    KIDS_PHOTO_REQUIRED: 'Falta a foto do rosto (criança ou quem retira).', KIDS_ALREADY_IN: 'A criança já deu entrada neste culto.', KIDS_CODE_INVALID: 'Código não confere.',
    KIDS_EVENT_CLOSED: 'Evento encerrado ou cancelado.', KIDS_PICKUP_NOT_AUTHORIZED: 'Esta pessoa não está autorizada a retirar a criança.', KIDS_NOT_PRESENT: 'A criança não está mais na sala.',
    KIDS_BROUGHT_BY_INVALID: 'Quem trouxe precisa ser responsável ou autorizado na família.', KIDS_BROUGHT_BY_REQUIRED: 'Informe quem trouxe a criança.', KIDS_CODE_EXHAUSTED: 'Não foi possível gerar um código livre. Tente de novo.',
    KIDS_CHECKIN_NOT_FOUND: 'Entrada não encontrada.', REGISTRO_TRAVADO: 'Evento encerrado há mais de 24h: travado. Peça ao pastor para reabrir.',
    PHOTO_SIZE_INVALID: 'A foto deve ter até 5 MB.', PHOTO_OWNED_BY_OTHER_CHURCH: 'A foto desta pessoa pertence a outra igreja.'
  };
  function traduz(e) {
    var t = String((e && (e.message || e.code)) || e || '');
    for (var k in MSG) if (t.indexOf(k) === 0) return MSG[k];
    if (/PGRST202|find the function/i.test(t)) return 'O servidor ainda não tem o cadastro do Kids (rodar o KIDS_2).';
    if (/row-level security|403|Unauthorized/i.test(t)) return 'Sem permissão para gravar a foto (confira a autorização da pessoa).';
    return U() ? U().traduz(e) : 'Não foi possível concluir.';
  }

  /* ───────── estado ───────── */
  var S = { min: null, lista: null, carregando: false, erro: '', q: '', aberta: null, fotos: {}, fotoPedida: {}, form: null };
  K._s = S;
  function familia(id) { return (S.lista || []).filter(function (f) { return f.id === id; })[0] || null; }
  function membro(fam, fmId) { return fam && (fam.membros || []).filter(function (x) { return x.id === fmId; })[0]; }
  function lider(m) { return m && (m.meuPapel === 'admin' || m.meuPapel === 'leader'); }

  function carregar(m, forcar) {
    if (S.min !== m.id) { S.min = m.id; S.lista = null; S.aberta = null; S.fotos = {}; S.fotoPedida = {}; }
    if (S.carregando || (S.lista && !forcar)) return Promise.resolve();
    S.carregando = true;
    return rpc('v39_kids_families', { p_ministry_id: m.id, p_q: null, p_incluir_inativas: false })
      .then(function (r) { S.lista = Array.isArray(r) ? r : []; S.erro = ''; })
      .catch(function (e) { S.lista = []; S.erro = traduz(e); })
      .then(function () { S.carregando = false; carregarFotos(); pintar(); });
  }
  /* fotos: caminho por v39_people_photos e URL assinada do bucket person-photos (a política só libera o que a equipe pode ver) */
  function carregarFotos() {
    var ids = [];
    (S.lista || []).forEach(function (f) { (f.membros || []).forEach(function (p) { if (p.temFoto && !S.fotoPedida[p.pessoaId]) { ids.push(p.pessoaId); S.fotoPedida[p.pessoaId] = true; } }); });
    if (!ids.length) return;
    rpc('v39_people_photos', { p_person_ids: ids }).then(function (l) {
      return U().cliente().then(function (cl) {
        return Promise.all((l || []).map(function (x) {
          return cl.storage.from('person-photos').createSignedUrl(x.path, 3600).then(function (r) { if (r && r.data && r.data.signedUrl) S.fotos[x.id] = r.data.signedUrl; }).catch(function () {});
        }));
      });
    }).then(function () { pintar(); }).catch(function () {});
  }
  function foto(p, lado) {
    var u = S.fotos[p.pessoaId], r = Math.round(lado / 2);
    if (u) return '<div style="width:' + lado + 'px;height:' + lado + 'px;flex:0 0 ' + lado + 'px;border-radius:' + r + 'px;background:#eee center/cover no-repeat url(\'' + esc(u) + '\')"></div>';
    return '<div style="width:' + lado + 'px;height:' + lado + 'px;flex:0 0 ' + lado + 'px;border-radius:' + r + 'px;background:#f1f2f4;color:#9aa0a6;display:flex;align-items:center;justify-content:center;font-size:10px;text-align:center">' + (p.temFoto ? '…' : 'sem<br>foto') + '</div>';
  }

  /* ───────── telas ───────── */
  function tela(m) {
    if (!U()) return '';
    if (S.min !== m.id || S.lista === null) { setTimeout(function () { carregar(m, false); }, 0); return '<div class="empty">Carregando crianças…</div>'; }
    if (S.aberta && familia(S.aberta)) return telaFamilia(m, familia(S.aberta));
    var h = '';
    if (S.erro) h += '<div class="aviso r">' + esc(S.erro) + '</div>';
    h += '<input data-k-busca="1" value="' + esc(S.q) + '" placeholder="Buscar família, criança ou responsável" style="margin-top:4px">';
    h += '<div class="gap"></div><button class="btn" data-k="novaFamilia">+ Nova família</button>';
    var q = S.q.trim().toLowerCase(), l = (S.lista || []).filter(function (f) {
      return !q || f.nome.toLowerCase().indexOf(q) >= 0 || (f.membros || []).some(function (p) { return String(p.nomeCompleto || p.nome || '').toLowerCase().indexOf(q) >= 0; });
    });
    var doze = [];
    (S.lista || []).forEach(function (f) { (f.membros || []).forEach(function (p) { if (p.papel === 'crianca' && p.completouIdade) doze.push({ f: f, p: p }); }); });
    if (doze.length) {
      h += '<div class="card" style="margin-top:12px;padding:10px 16px;border-left:4px solid #c99a1a"><b>Completaram ' + esc(m.idadeMax || 12) + ' anos</b>' +
        '<div class="sb" style="margin:2px 0 6px">Saem do Kids e vão para o cadastro geral da igreja.' + (lider(m) ? '' : ' O líder conclui a saída.') + '</div>' +
        doze.map(function (x) {
          return '<div class="row" style="padding:6px 0">' + foto(x.p, 34) + '<div class="info" style="margin-left:10px"><div class="nm">' + esc(x.p.nome) + ' · ' + esc(x.p.idade) + ' anos</div><div class="sb">' + esc(x.f.nome) + '</div></div>' +
            (lider(m) ? '<button class="btn gh sm" data-k="concluir" data-v="' + esc(x.p.pessoaId) + '" data-f="' + esc(x.f.id) + '">Concluir Kids</button>' : '') + '</div>';
        }).join('') + '</div>';
    }
    if (!l.length) return h + '<div class="card" style="margin-top:12px"><div class="empty">' + (S.q ? 'Nada encontrado.' : 'Nenhuma família cadastrada. Comece pelo responsável.') + '</div></div>';
    h += '<div class="card" style="padding:4px 16px;margin-top:12px">' + l.map(function (f) {
      var cr = (f.membros || []).filter(function (p) { return p.papel === 'crianca'; }), rs = (f.membros || []).filter(function (p) { return p.papel === 'responsavel'; });
      var alertas = [];
      if (cr.some(function (p) { return p.temAlergia; })) alertas.push(pill('⚠ alergia', '#c0392b'));
      if ((f.membros || []).some(function (p) { return (p.papel === 'crianca' || p.podeRetirar) && !p.temFoto; })) alertas.push(pill('falta foto', '#c99a1a'));
      if ((f.membros || []).some(function (p) { return (p.papel === 'crianca' || p.podeRetirar) && !p.consentimento; })) alertas.push(pill('falta autorização', '#c99a1a'));
      return '<div class="row cl" data-k="abrir" data-v="' + esc(f.id) + '" style="cursor:pointer"><div class="info"><div class="nm">' + esc(f.nome) + ' ' + alertas.join(' ') + '</div>' +
        '<div class="sb">' + (cr.length ? cr.map(function (p) { return esc(p.nome) + ' (' + esc(p.idade) + ')'; }).join(', ') : 'sem crianças') +
        (rs.length ? ' · resp.: ' + rs.map(function (p) { return esc(p.nome); }).join(', ') : ' · sem responsável') + '</div></div><span style="color:var(--tx3);font-size:18px">›</span></div>';
    }).join('') + '</div>';
    return h;
  }
  function linhaMembro(m, f, p) {
    var tags = [];
    if (p.papel === 'crianca') {
      tags.push(esc(p.idade) + ' anos');
      if (p.temAlergia) tags.push('<b style="color:#c0392b">⚠ alergia</b>');
      if (p.temRestricao) tags.push('<b style="color:#c0392b">restrição</b>');
      tags.push(p.situacao === 'visiting' ? 'visitante' : 'frequenta');
    } else {
      if (p.idade != null) tags.push(esc(p.idade) + ' anos');
      if (p.whatsapp) tags.push(esc(fone(p.whatsapp)));
      if (p.podeRetirar) tags.push('<b style="color:#1f9d63">pode retirar</b>');
      if (p.contatoPrincipal) tags.push('contato principal');
    }
    var precisaFoto = p.papel === 'crianca' || p.podeRetirar;
    if (precisaFoto && !p.temFoto) tags.push('<b style="color:#c99a1a">falta foto</b>');
    if (precisaFoto && !p.consentimento) tags.push('<b style="color:#c99a1a">falta autorização</b>');
    var bts = '<button class="btn gh sm" data-k="foto" data-v="' + esc(p.id) + '">' + (p.temFoto ? 'Trocar foto' : 'Tirar foto') + '</button> ' +
      '<button class="btn gh sm" data-k="autorizacao" data-v="' + esc(p.id) + '">Autorização</button> ' +
      (p.papel === 'crianca' ? '<button class="btn gh sm" data-k="ficha" data-v="' + esc(p.id) + '">Ficha</button> ' : '') +
      '<button class="btn gh sm" data-k="editarMembro" data-v="' + esc(p.id) + '">Editar</button>' +
      (lider(m) ? ' <button class="btn gh sm" data-k="encerrarMembro" data-v="' + esc(p.id) + '">Tirar da família</button>' : '');
    return '<div style="padding:10px 0;border-bottom:1px solid var(--ln,#eceef1)"><div class="row" style="padding:0">' + foto(p, 48) +
      '<div class="info" style="margin-left:12px"><div class="nm">' + esc(p.nomeCompleto || p.nome) + '</div><div class="sb">' + tags.join(' · ') + '</div></div></div>' +
      '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px">' + bts + '</div></div>';
  }
  function telaFamilia(m, f) {
    var g = { responsavel: [], crianca: [], outro: [] };
    (f.membros || []).forEach(function (p) { (g[p.papel] || g.outro).push(p); });
    var h = '<button class="btn gh sm" data-k="voltar" style="margin-bottom:8px">‹ Famílias</button>' +
      '<div class="ini-ola" style="font-size:20px">' + esc(f.nome) + '</div>' + (f.obs ? '<div class="ini-sub">' + esc(f.obs) + '</div>' : '') +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;margin:10px 0">' +
      '<button class="btn sm" data-k="addMembro" data-v="responsavel">+ Responsável</button>' +
      '<button class="btn sm" data-k="addMembro" data-v="crianca">+ Criança</button>' +
      '<button class="btn sm" data-k="addMembro" data-v="outro">+ Outra pessoa que retira</button>' +
      '<button class="btn gh sm" data-k="editarFamilia" data-v="' + esc(f.id) + '">Editar família</button></div>';
    [['responsavel', 'Responsáveis'], ['crianca', 'Crianças'], ['outro', 'Outras pessoas']].forEach(function (s) {
      if (!g[s[0]].length && s[0] === 'outro') return;
      h += '<div class="card" style="padding:4px 16px;margin-top:10px"><div style="font-weight:700;margin:8px 0 2px">' + s[1] + '</div>' +
        (g[s[0]].length ? g[s[0]].map(function (p) { return linhaMembro(m, f, p); }).join('') : '<div class="sb" style="padding:8px 0">Ninguém ainda.</div>') + '</div>';
    });
    return h;
  }

  /* ───────── formulários ───────── */
  function formFamilia(f, m) {
    f = f || {};
    modal('<h2>' + (f.id ? 'Editar família' : 'Nova família') + '</h2>' +
      '<label>Nome da família *</label><input id="kf-nome" value="' + esc(f.nome) + '" placeholder="Ex.: Família Souza">' +
      '<label>Observação</label><input id="kf-obs" value="' + esc(f.obs) + '">' +
      (f.id && lider(m) ? '<label><input type="checkbox" id="kf-inativar" style="width:auto;margin-right:6px">Inativar a família (só o líder)</label><input id="kf-motivo" placeholder="Motivo da inativação">' : '') +
      '<div class="gap"></div><button class="btn pr" data-k="salvarFamilia" data-v="' + esc(f.id || '') + '">Salvar</button>' +
      '<div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
  }
  function salvarFamilia(id) {
    var p = { ministerioId: S.min, id: id || null, nome: $('kf-nome').value.trim(), obs: $('kf-obs').value.trim() || null };
    if ($('kf-inativar') && $('kf-inativar').checked) { p.status = 'inactive'; p.motivo = $('kf-motivo').value.trim(); }
    if (!p.nome) return toast('Informe o nome da família.', true);
    rpc('v39_kids_family_save', { p: p }).then(function (r) {
      fechar(); toast(p.status === 'inactive' ? 'Família inativada.' : 'Família salva.');
      S.aberta = p.status === 'inactive' ? null : (r && r.id) || S.aberta;
      return recarregar();
    }).catch(function (e) { toast(traduz(e), true); });
  }
  var PAPEL = { responsavel: 'Responsável', crianca: 'Criança', outro: 'Outra pessoa que retira' };
  function formMembro(papel, p) {
    var novo = !p, f = familia(S.aberta);
    S.form = { papel: p ? p.papel : papel, pessoaId: p ? p.pessoaId : null, fmId: p ? p.id : null, t: 0 };
    var ehCr = S.form.papel === 'crianca', podeEditarDados = !p || p.origem === 'kids';
    modal('<h2>' + (novo ? 'Adicionar ' + PAPEL[S.form.papel].toLowerCase() : 'Editar ' + esc(p.nome)) + '</h2>' +
      (novo ? '<div class="ini-sub">Busque antes para não cadastrar a mesma pessoa duas vezes.</div>' +
        '<input id="km-busca" data-k-pessoa="1" placeholder="Nome ou final do telefone" autocomplete="off"><div id="km-res"></div>' +
        '<div id="km-sel" class="sb" style="margin:6px 0"></div>' : '') +
      '<div id="km-dados">' +
      '<label>Nome completo' + (novo ? ' *' : '') + '</label><input id="km-nome" value="' + esc(p ? p.nomeCompleto : '') + '"' + (podeEditarDados ? '' : ' disabled') + '>' +
      '<div class="g2"><div><label>Como é chamado(a)</label><input id="km-apelido"' + (podeEditarDados ? '' : ' disabled') + '></div>' +
      '<div><label>Nascimento' + (ehCr || S.form.papel === 'outro' ? ' *' : '') + '</label><input id="km-nasc" type="date" value="' + esc(p && p.nascimento ? String(p.nascimento).slice(0, 10) : '') + '"></div></div>' +
      '<div class="g2"><div><label>Sexo</label><select id="km-sexo"' + (podeEditarDados ? '' : ' disabled') + '><option value=""></option><option' + (p && p.sexo === 'Feminino' ? ' selected' : '') + '>Feminino</option><option' + (p && p.sexo === 'Masculino' ? ' selected' : '') + '>Masculino</option></select></div>' +
      (ehCr ? '<div><label>Situação</label><select id="km-sit"><option value="">segue a família</option><option value="visiting"' + (p && p.situacao === 'visiting' ? ' selected' : '') + '>Visitante</option><option value="active"' + (p && p.situacao === 'active' ? ' selected' : '') + '>Frequenta</option></select></div>'
            : '<div><label>WhatsApp' + (S.form.papel === 'responsavel' ? ' *' : '') + '</label><input id="km-fone" inputmode="tel" placeholder="(11) 98888-7777" value="' + esc(p && p.whatsapp ? fone(p.whatsapp) : '') + '"></div>') + '</div>' +
      '</div>' +
      (ehCr ? '' : '<label><input type="checkbox" id="km-retira"' + (!p || p.podeRetirar ? ' checked' : '') + ' style="width:auto;margin-right:6px">Pode retirar a criança (12 anos ou mais, com foto)</label>' +
        '<label><input type="checkbox" id="km-princ"' + (p && p.contatoPrincipal ? ' checked' : '') + ' style="width:auto;margin-right:6px">Contato principal da família</label>') +
      (!podeEditarDados ? '<div class="sb">Cadastro geral da igreja: aqui só se completa o que falta (nascimento, WhatsApp).</div>' : '') +
      '<div class="gap"></div><button class="btn pr" data-k="salvarMembro">Salvar</button>' +
      '<div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
    if (f && !novo) S.form.familia = f.id;
  }
  function buscarPessoa(q) {
    clearTimeout(S.form && S.form.t);
    var res = $('km-res'); if (!res) return;
    if (String(q || '').trim().length < 2) { res.innerHTML = ''; return; }
    S.form.t = setTimeout(function () {
      rpc('v39_kids_people_search', { p_ministry_id: S.min, p_q: q }).then(function (l) {
        var r = $('km-res'); if (!r) return; l = l || [];
        r.innerHTML = l.length ? '<div class="card" style="padding:2px 12px;margin:4px 0">' + l.map(function (x) {
          return '<div class="row cl" data-k="escolherPessoa" data-v="' + esc(x.id) + '" data-nome="' + esc(x.nome) + '" style="cursor:pointer;padding:8px 0"><div class="info"><div class="nm">' + esc(x.nome) + '</div>' +
            '<div class="sb">' + (x.idade != null ? x.idade + ' anos · ' : '') + (x.finalFone ? 'tel. final ' + esc(x.finalFone) + ' · ' : '') + (x.situacao === 'visiting' ? 'visitante' : 'da igreja') + (x.emFamilia ? ' · já em família do Kids' : '') + '</div></div></div>';
        }).join('') + '</div>' : '<div class="sb" style="margin:4px 0">Ninguém encontrado: preencha abaixo para cadastrar.</div>';
      }).catch(function (e) { var r = $('km-res'); if (r) r.innerHTML = '<div class="sb">' + esc(traduz(e)) + '</div>'; });
    }, 350);
  }
  function salvarMembro() {
    var F = S.form || {}, f = familia(S.aberta); if (!f) return;
    var p = { ministerioId: S.min, familiaId: f.id, papel: F.papel };
    if (F.fmId) p.id = F.fmId;
    if (F.pessoaId) p.pessoaId = F.pessoaId;
    var pes = { nome: ($('km-nome') || {}).value, apelido: ($('km-apelido') || {}).value, nascimento: ($('km-nasc') || {}).value || null,
                sexo: ($('km-sexo') || {}).value || null, whatsapp: $('km-fone') ? $('km-fone').value : null };
    Object.keys(pes).forEach(function (k) { if (typeof pes[k] === 'string') pes[k] = pes[k].trim(); if (pes[k] === '') pes[k] = null; });
    p.pessoa = pes;
    if (!p.pessoaId && !pes.nome) return toast('Informe o nome ou escolha alguém na busca.', true);
    if (F.papel !== 'crianca') { p.podeRetirar = !!($('km-retira') && $('km-retira').checked); p.contatoPrincipal = !!($('km-princ') && $('km-princ').checked); }
    else if ($('km-sit') && $('km-sit').value) p.situacao = $('km-sit').value;
    rpc('v39_kids_member_save', { p: p }).then(function () { fechar(); toast('Salvo.'); return recarregar(); })
      .catch(function (e) { toast(traduz(e), true); });
  }
  function encerrarMembro(fmId) {
    var f = familia(S.aberta), p = membro(f, fmId); if (!p) return;
    var motivo = window.prompt('Motivo para tirar ' + p.nome + ' da família ' + f.nome + ':');
    if (motivo === null) return;
    if (!motivo.trim()) return toast('Informe o motivo.', true);
    rpc('v39_kids_member_save', { p: { ministerioId: S.min, id: fmId, status: 'ended', motivo: motivo.trim() } })
      .then(function () { toast('Retirado da família.'); return recarregar(); }).catch(function (e) { toast(traduz(e), true); });
  }

  /* autorização (LGPD) */
  var TERMO = 'Autorizo a igreja a guardar o cadastro, a foto do rosto (para conferência na entrega) e, no caso da criança, alergias, doenças e restrições, para o cuidado no Kids enquanto a criança participar (até 12 anos).';
  function formAutorizacao(fmId) {
    var f = familia(S.aberta), p = membro(f, fmId); if (!p) return;
    var menor = p.papel === 'crianca' || (p.idade != null && p.idade < 18);
    var resp = (f.membros || []).filter(function (x) { return x.papel === 'responsavel'; });
    S.form = { fmId: fmId, pessoaId: p.pessoaId };
    modal('<h2>Autorização · ' + esc(p.nome) + '</h2>' +
      '<div class="card" style="padding:10px 14px;font-size:13px;line-height:1.5;background:#f8f9fb">' + esc(TERMO) + '</div>' +
      (p.consentimento
        ? '<div class="aviso" style="margin-top:10px">Autorização registrada.</div><label>Para revogar, informe o motivo</label><input id="ka-motivo">' +
          (menor ? '<label>Responsável</label><select id="ka-por">' + resp.map(function (x) { return '<option value="' + esc(x.pessoaId) + '">' + esc(x.nome) + '</option>'; }).join('') + '</select>' : '') +
          '<div class="gap"></div><button class="btn" data-k="revogar">Revogar autorização</button>'
        : (menor ? (resp.length ? '<label>Quem autoriza (responsável) *</label><select id="ka-por">' + resp.map(function (x) { return '<option value="' + esc(x.pessoaId) + '">' + esc(x.nome) + '</option>'; }).join('') + '</select>'
                                : '<div class="aviso r" style="margin-top:10px">Cadastre antes um responsável nesta família.</div>')
                 : '<div class="sb" style="margin-top:8px">A própria pessoa autoriza.</div>') +
          '<div class="sb">Leia o texto acima para a pessoa e registre só depois que ela concordar.</div>' +
          (menor && !resp.length ? '' : '<div class="gap"></div><button class="btn pr" data-k="autorizar">Registrar autorização</button>')) +
      '<div class="gap"></div><button class="btn gh" data-a="fechar">Fechar</button>');
  }
  function gravarAutorizacao(status) {
    var F = S.form || {}, p = { ministerioId: S.min, pessoaId: F.pessoaId, status: status };
    if ($('ka-por')) p.autorizadoPorId = $('ka-por').value;
    if (status === 'revoked') { p.motivo = ($('ka-motivo') || {}).value; if (!p.motivo || !p.motivo.trim()) return toast('Informe o motivo.', true); }
    rpc('v39_kids_consent_set', { p: p }).then(function () { fechar(); toast(status === 'granted' ? 'Autorização registrada.' : 'Autorização revogada.'); return recarregar(); })
      .catch(function (e) { toast(traduz(e), true); });
  }

  /* ficha da criança (abre só quando pedida: cada abertura fica na auditoria) */
  function abrirFicha(fmId) {
    var f = familia(S.aberta), p = membro(f, fmId); if (!p) return;
    if (!p.consentimento) return toast('Registre antes a autorização do responsável.', true);
    rpc('v39_kids_child_profile', { p_ministry_id: S.min, p_person_id: p.pessoaId }).then(function (k) {
      k = k || {}; S.form = { pessoaId: p.pessoaId };
      function campo(id, rot, v, ph) { return '<label>' + rot + '</label><textarea id="kp-' + id + '" rows="2" placeholder="' + esc(ph || '') + '">' + esc(v || '') + '</textarea>'; }
      modal('<h2>Ficha · ' + esc(p.nome) + '</h2><div class="sb">Informação de saúde: uso só da equipe do Kids. Quem abre fica registrado.</div>' +
        campo('alergias', 'Alergias', k.alergias, 'Ex.: amendoim, dipirona') + campo('doencas', 'Doenças / condições', k.doencas) +
        campo('restricoes', 'Restrições (alimentação, atividades)', k.restricoes) + campo('medicamentos', 'Medicamentos', k.medicamentos) +
        campo('obs', 'Outras observações', k.obs) +
        '<div class="gap"></div><button class="btn pr" data-k="salvarFicha">Salvar ficha</button>' +
        '<div class="gap"></div><button class="btn gh" data-a="fechar">Fechar</button>');
    }).catch(function (e) { toast(traduz(e), true); });
  }
  function salvarFicha() {
    var p = { ministerioId: S.min, pessoaId: (S.form || {}).pessoaId };
    ['alergias', 'doencas', 'restricoes', 'medicamentos', 'obs'].forEach(function (k) { p[k] = ($('kp-' + k) || {}).value || null; });
    rpc('v39_kids_child_profile_save', { p: p }).then(function () { fechar(); toast('Ficha salva.'); return recarregar(); })
      .catch(function (e) { toast(traduz(e), true); });
  }

  /* foto do rosto: câmera do celular, reduz no aparelho, envia ao bucket person-photos e registra */
  function pedirFoto(fmId) {
    var f = familia(S.aberta), p = membro(f, fmId); if (!p) return;
    if (!p.consentimento) return toast('Registre antes a autorização' + (p.papel === 'crianca' ? ' do responsável.' : ' da pessoa.'), true);
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.setAttribute('capture', 'user');
    inp.onchange = function () { var arq = inp.files && inp.files[0]; if (arq) reduzirEEnviar(p, arq); };
    inp.click();
  }
  function reduzirEEnviar(p, arq) {
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 800, e = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.round(img.width * e); cv.height = Math.round(img.height * e);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(function (blob) {
          if (!blob) return toast('Não foi possível ler a foto.', true);
          var ig = U().igrejaId(), caminho = ig + '/people/' + p.pessoaId + '/' + uuid4().toLowerCase() + '.jpg';
          toast('Enviando foto…');
          U().cliente().then(function (cl) {
            return cl.storage.from('person-photos').upload(caminho, blob, { contentType: 'image/jpeg', upsert: false });
          }).then(function (u) {
            if (u && u.error) throw u.error;
            return rpc('v39_inst_register_photo', { p_person_id: p.pessoaId, p_storage_path: caminho, p_original_file_name: 'kids.jpg', p_checksum_sha256: null });
          }).then(function () { delete S.fotoPedida[p.pessoaId]; delete S.fotos[p.pessoaId]; toast('Foto salva.'); return recarregar(); })
            .catch(function (er) { toast(traduz(er), true); });
        }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { toast('Arquivo de imagem inválido.', true); };
      img.src = fr.result;
    };
    fr.readAsDataURL(arq);
  }

  /* saída aos 12 anos (líder) */
  function formConcluir(pessoaId, famId) {
    var f = familia(famId), p = f && (f.membros || []).filter(function (x) { return x.pessoaId === pessoaId; })[0]; if (!p) return;
    S.form = { pessoaId: pessoaId };
    modal('<h2>Concluir Kids · ' + esc(p.nome) + '</h2>' +
      '<div class="ini-sub">A ficha de saúde é encerrada e apagada, a criança sai da família no Kids e o cadastro vai para o geral da igreja (a foto fica).</div>' +
      (p.temCpf ? '<div class="sb">Tem CPF: passa a membro.</div>' : '<label>CPF (opcional)</label><input id="kc-cpf" inputmode="numeric" placeholder="Sem CPF: fica como frequentador com pendência">') +
      '<div class="gap"></div><button class="btn pr" data-k="confirmarConcluir">Concluir</button>' +
      '<div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
  }
  function concluir() {
    var p = { ministerioId: S.min, pessoaId: (S.form || {}).pessoaId };
    if ($('kc-cpf') && $('kc-cpf').value.trim()) p.cpf = $('kc-cpf').value.trim();
    rpc('v39_kids_child_graduate', { p: p }).then(function (r) {
      fechar(); toast(r && r.pendenciaCpf ? 'Saiu do Kids. Ficou como frequentador (pendência de CPF).' : 'Saiu do Kids e passou a membro.');
      return recarregar();
    }).catch(function (e) { toast(traduz(e), true); });
  }

  function recarregar() { var m = { id: S.min }; return carregar(m, true); }

  /* ═════════ KIDS-3: entrada e retirada (sala) ═════════ */
  var SALA = { ev: null, board: null, carregando: false, codigos: {}, achados: null, cultos: null, cultosEm: 0, cultosPedido: false };
  K._sala = SALA;
  function hora(iso) { if (!iso) return ''; var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  function diaHora(iso) { if (!iso) return ''; var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) + ' ' + hora(iso); }
  function eventosSala(m) {
    var l = (U().eventos && U().eventos(m.id)) || [];
    if (!Array.isArray(l)) return [];
    var agora = Date.now();
    return l.filter(function (e) { var t = new Date(e.inicio).getTime(); return e.status !== 'cancelled' && t > agora - 2 * 864e5 && t < agora + 2 * 864e5; });
  }
  function eventoPadrao(m) {
    var l = eventosSala(m), agora = Date.now(), melhor = null, dist = Infinity;
    l.forEach(function (e) { if (e.status === 'completed') return; var d = Math.abs(new Date(e.inicio).getTime() - agora); if (d < dist) { dist = d; melhor = e; } });
    return melhor || l[0] || null;
  }
  function carregarSala(m, forcar) {
    if (!SALA.ev) { var e = eventoPadrao(m); SALA.ev = e ? e.id : null; }
    if (!SALA.ev || SALA.carregando || (SALA.board && SALA.board.evento && SALA.board.evento.id === SALA.ev && !forcar)) return Promise.resolve();
    SALA.carregando = true;
    if (S.min !== m.id || S.lista === null) carregar(m, false);
    return rpc('v39_kids_board', { p_ministry_id: m.id, p_event_id: SALA.ev })
      .then(function (b) { SALA.board = b; SALA.erro = ''; })
      .catch(function (e) { SALA.board = null; SALA.erro = traduz(e); })
      .then(function () { SALA.carregando = false; pintar(); });
  }
  function telaSala(m) {
    if (!U()) return '';
    var evs = eventosSala(m);
    if (!evs.length) return '<div class="card" style="margin-top:8px"><div class="empty">Nenhum evento do Kids entre ontem e amanhã. Os eventos aparecem sozinhos quando o culto é criado.</div></div>';
    if (!SALA.ev || !evs.some(function (e) { return e.id === SALA.ev; })) { SALA.ev = (eventoPadrao(m) || evs[0]).id; SALA.board = null; }
    if (!SALA.board || !SALA.board.evento || SALA.board.evento.id !== SALA.ev) setTimeout(function () { carregarSala(m, false); }, 0);
    var b = SALA.board && SALA.board.evento && SALA.board.evento.id === SALA.ev ? SALA.board : null;
    var h = '<select data-k-evento="1" style="margin-top:4px">' + evs.map(function (e) {
      return '<option value="' + esc(e.id) + '"' + (e.id === SALA.ev ? ' selected' : '') + '>' + esc(diaHora(e.inicio) + ' · ' + e.nome) + (e.status === 'completed' ? ' (encerrado)' : '') + '</option>'; }).join('') + '</select>';
    if (SALA.erro) h += '<div class="aviso r">' + esc(SALA.erro) + '</div>';
    if (!b) return h + '<div class="empty">Carregando a sala…</div>';
    var fechado = b.evento.status === 'completed' || b.evento.travado;
    h += '<div style="display:flex;gap:8px;margin:10px 0;flex-wrap:wrap">' +
      '<div class="card" style="flex:1;min-width:90px;padding:8px 12px;margin:0"><div class="sb">Na sala</div><div style="font-size:22px;font-weight:800">' + b.presentes + '</div></div>' +
      '<div class="card" style="flex:1;min-width:90px;padding:8px 12px;margin:0"><div class="sb">Retiradas</div><div style="font-size:22px;font-weight:800">' + b.retiradas + '</div></div>' +
      '<div class="card" style="flex:1;min-width:90px;padding:8px 12px;margin:0"><div class="sb">Visitantes</div><div style="font-size:22px;font-weight:800">' + b.visitantes + '</div></div></div>';
    if (b.evento.travado) h += '<div class="aviso">🔒 Evento travado (encerrado há mais de 24h).</div>';
    else h += '<div style="display:flex;gap:8px;flex-wrap:wrap">' + (b.evento.status === 'completed' ? '' : '<button class="btn pr" data-k="entrada">+ Dar entrada</button>') +
      '<button class="btn" data-k="retirarCodigo">Retirar com código</button><button class="btn gh" data-k="atualizarSala">Atualizar</button></div>';
    var pres = (b.entradas || []).filter(function (x) { return x.status === 'present'; }), sai = (b.entradas || []).filter(function (x) { return x.status === 'picked_up'; });
    h += '<div class="card" style="padding:4px 16px;margin-top:12px"><div style="font-weight:700;margin:8px 0 2px">Na sala (' + pres.length + ')</div>' +
      (pres.length ? pres.map(function (x) {
        return '<div style="padding:9px 0;border-bottom:1px solid var(--ln,#eceef1)"><div class="nm">' + esc(x.crianca) + ' <span class="sb">' + esc(x.idade) + ' anos</span> ' +
          (x.temAlergia ? pill('⚠ alergia', '#c0392b') : '') + (x.temRestricao ? ' ' + pill('restrição', '#c0392b') : '') + (x.situacao === 'visiting' ? ' ' + pill('visitante', '#2f6fd6') : '') + '</div>' +
          '<div class="sb">' + esc(x.familia) + ' · trouxe: ' + esc(x.trazidoPor) + ' · entrou ' + hora(x.entrada) + '</div>' +
          (fechado && b.evento.travado ? '' : '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap"><button class="btn gh sm" data-k="retirarFoto" data-v="' + esc(x.id) + '">Retirar sem código</button>' +
            '<button class="btn gh sm" data-k="cancelarEntrada" data-v="' + esc(x.id) + '">Cancelar entrada</button></div>') + '</div>';
      }).join('') : '<div class="sb" style="padding:8px 0">Nenhuma criança na sala.</div>') + '</div>';
    if (sai.length) h += '<div class="card" style="padding:4px 16px;margin-top:10px"><div style="font-weight:700;margin:8px 0 2px">Já retiradas (' + sai.length + ')</div>' + sai.map(function (x) {
      return '<div style="padding:7px 0;border-bottom:1px solid var(--ln,#eceef1)"><div class="nm">' + esc(x.crianca) + '</div><div class="sb">retirada às ' + hora(x.retirada) + ' por ' + esc(x.retiradoPor) +
        (x.metodo === 'photo' ? ' · <b>sem código</b>: ' + esc(x.motivoFoto) : ' · com código') + '</div></div>';
    }).join('') + '</div>';
    return h;
  }

  /* entrada */
  function criancasElegiveis() {
    var dentro = {}; ((SALA.board || {}).entradas || []).forEach(function (x) { dentro[x.criancaId] = true; });
    var l = [];
    (S.lista || []).forEach(function (f) { (f.membros || []).forEach(function (p) { if (p.papel === 'crianca' && !p.completouIdade) l.push({ f: f, p: p, dentro: !!dentro[p.pessoaId] }); }); });
    return l.sort(function (a, b) { return String(a.p.nome).localeCompare(String(b.p.nome)); });
  }
  function formEntrada(q) {
    var l = criancasElegiveis(), qq = String(q || '').trim().toLowerCase();
    if (qq) l = l.filter(function (x) { return (x.p.nomeCompleto || x.p.nome).toLowerCase().indexOf(qq) >= 0 || x.f.nome.toLowerCase().indexOf(qq) >= 0; });
    modal('<h2>Dar entrada</h2><input data-k-entrada="1" value="' + esc(q || '') + '" placeholder="Nome da criança ou da família" autocomplete="off">' +
      '<div id="ke-lista">' + listaEntrada(l) + '</div><div class="gap"></div><button class="btn gh" data-a="fechar">Fechar</button>');
  }
  function listaEntrada(l) {
    if (S.lista === null) return '<div class="empty">Carregando famílias…</div>';
    if (!l.length) return '<div class="sb" style="margin:8px 0">Nenhuma criança encontrada. Cadastre na aba Crianças.</div>';
    return '<div class="card" style="padding:2px 12px;margin-top:6px">' + l.slice(0, 40).map(function (x) {
      var falta = [];
      if (!x.p.temFoto) falta.push('sem foto'); if (!x.p.consentimento) falta.push('sem autorização');
      return '<div class="row' + (x.dentro || falta.length ? '' : ' cl') + '"' + (x.dentro || falta.length ? '' : ' data-k="escolherCrianca" data-v="' + esc(x.p.pessoaId) + '" style="cursor:pointer"') + '>' + foto(x.p, 36) +
        '<div class="info" style="margin-left:10px"><div class="nm">' + esc(x.p.nome) + ' <span class="sb">' + esc(x.p.idade) + ' anos</span></div><div class="sb">' + esc(x.f.nome) +
        (x.dentro ? ' · <b>já está na sala</b>' : '') + (falta.length ? ' · <b style="color:#c99a1a">' + falta.join(', ') + '</b>' : '') + '</div></div></div>';
    }).join('') + '</div>';
  }
  function escolherCrianca(pid) {
    var x = criancasElegiveis().filter(function (y) { return y.p.pessoaId === pid; })[0]; if (!x) return;
    var quem = (x.f.membros || []).filter(function (p) { return p.papel !== 'crianca' && (p.papel === 'responsavel' || p.podeRetirar); });
    var irmao = ((SALA.board || {}).entradas || []).some(function (e) { return e.familiaId === x.f.id && e.status === 'present'; });
    var codGuardado = SALA.codigos[SALA.ev + '|' + x.f.id] || '';
    S.form = { criancaId: pid, familiaId: x.f.id };
    modal('<h2>Entrada · ' + esc(x.p.nome) + '</h2>' + (x.p.temAlergia || x.p.temRestricao ? '<div class="aviso r">⚠ Esta criança tem ' + (x.p.temAlergia ? 'alergia' : 'restrição') + ' na ficha.</div>' : '') +
      '<label>Quem trouxe *</label>' + (quem.length ? '<select id="ke-trouxe">' + quem.map(function (p) { return '<option value="' + esc(p.pessoaId) + '">' + esc(p.nome) + (p.papel === 'responsavel' ? ' (responsável)' : '') + '</option>'; }).join('') + '</select>'
        : '<div class="aviso r">A família não tem responsável. Cadastre na aba Crianças.</div>') +
      (irmao ? '<label>Código do irmão que já entrou</label><input id="ke-cod" inputmode="numeric" maxlength="4" value="' + esc(codGuardado) + '" placeholder="4 dígitos (vazio = código novo)">' +
        '<div class="sb">Irmãos no mesmo culto usam o mesmo código.</div>' : '') +
      (quem.length ? '<div class="gap"></div><button class="btn pr" data-k="confirmarEntrada">Confirmar entrada</button>' : '') +
      '<div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
  }
  function confirmarEntrada() {
    var F = S.form || {}, p = { ministerioId: S.min, eventoId: SALA.ev, criancaId: F.criancaId, trazidoPorId: ($('ke-trouxe') || {}).value };
    var c = $('ke-cod') && $('ke-cod').value.trim(); if (c) p.codigoFamilia = c;
    var bt = document.querySelector('[data-k="confirmarEntrada"]'); if (bt) bt.disabled = true;
    rpc('v39_kids_checkin', { p: p }).then(function (r) {
      SALA.codigos[SALA.ev + '|' + r.familiaId] = r.codigo;
      mostrarCodigo(r); carregarSala({ id: S.min }, true);
    }).catch(function (e) { if (bt) bt.disabled = false; toast(traduz(e), true); });
  }
  function textoWhats(r) {
    return 'Olá! ' + r.crianca + ' deu entrada no Kids às ' + hora(r.entrada) + ' — ' + (r.culto || r.evento) + (r.igreja ? ' (' + r.igreja + ')' : '') + '.\n' +
      'Código de retirada: *' + r.codigo + '*\nApresente este código para retirar a criança.';
  }
  function mostrarCodigo(r) {
    S.ultimaEntrada = r;
    var tel = String(r.whatsapp || '').replace(/\D/g, ''), link = tel ? 'https://wa.me/55' + tel + '?text=' + encodeURIComponent(textoWhats(r)) : '';
    modal('<h2>Entrada registrada</h2><div class="nm" style="font-size:16px">' + esc(r.crianca) + '</div>' +
      '<div style="font-size:48px;font-weight:900;letter-spacing:8px;text-align:center;margin:10px 0">' + esc(r.codigo) + '</div>' +
      '<div class="sb" style="text-align:center">Este código só aparece agora: imprima as etiquetas e envie pelo WhatsApp.</div>' +
      (r.temAlergia || r.temRestricao ? '<div class="aviso r">⚠ ' + (r.temAlergia ? 'Alergia' : 'Restrição') + ' na ficha.</div>' : '') +
      '<div class="gap"></div><button class="btn pr" data-k="imprimir">Imprimir etiquetas</button>' +
      (link ? '<div class="gap"></div><a class="btn" href="' + esc(link) + '" target="_blank" rel="noopener">Enviar WhatsApp ao responsável (' + esc(fone(tel)) + ')</a>' : '') +
      '<div class="gap"></div><button class="btn gh" data-a="fechar">Fechar</button>');
  }
  /* etiqueta térmica 62x29 mm: 1ª da criança, 2ª do responsável (retirada) */
  function imprimir() {
    var r = S.ultimaEntrada; if (!r) return;
    var alerta = r.temAlergia ? '⚠ ALERGIA' : r.temRestricao ? '⚠ RESTRIÇÃO' : '';
    var css = '@page{size:62mm 29mm;margin:0}*{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}body{margin:0}' +
      '.e{width:62mm;height:29mm;padding:2mm 3mm;page-break-after:always;overflow:hidden;position:relative}' +
      '.n{font-size:15pt;font-weight:800;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.c{position:absolute;right:3mm;bottom:2mm;font-size:20pt;font-weight:900;letter-spacing:1.5mm}' +
      '.s{font-size:7.5pt;line-height:1.25}.a{font-size:10pt;font-weight:900;background:#000;color:#fff;display:inline-block;padding:0 1.5mm;margin-top:1mm}';
    var quando = diaHora(r.entrada), culto = esc(r.culto || r.evento || '');
    var html = '<!doctype html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body>' +
      '<div class="e"><div class="n">' + esc(r.crianca) + '</div><div class="s">' + culto + '<br>' + esc(quando) + ' · resp.: ' + esc(r.trazidoPor) + '</div>' +
      (alerta ? '<div class="a">' + alerta + '</div>' : '') + '<div class="c">' + esc(r.codigo) + '</div></div>' +
      '<div class="e"><div class="s"><b>RETIRADA KIDS</b> · ' + culto + '</div><div class="n" style="font-size:12pt">' + esc(r.crianca) + '</div>' +
      '<div class="s">Apresente este código para retirar.</div><div class="c">' + esc(r.codigo) + '</div></div></body></html>';
    var f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
    document.body.appendChild(f);
    var d = f.contentWindow.document; d.open(); d.write(html); d.close();
    setTimeout(function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { toast('Não foi possível abrir a impressão.', true); } setTimeout(function () { f.remove(); }, 4000); }, 300);
  }

  /* retirada */
  function formRetirarCodigo() {
    SALA.achados = null;
    modal('<h2>Retirar com código</h2><input id="kr-cod" inputmode="numeric" maxlength="4" placeholder="Código de 4 dígitos" style="font-size:24px;letter-spacing:6px;text-align:center">' +
      '<div class="gap"></div><button class="btn pr" data-k="buscarCodigo">Buscar</button><div id="kr-res"></div><div class="gap"></div><button class="btn gh" data-a="fechar">Fechar</button>');
  }
  function fotosDe(ids) {
    var falta = ids.filter(function (id) { return !S.fotos[id] && !S.fotoPedida[id]; });
    if (!falta.length) return Promise.resolve();
    falta.forEach(function (id) { S.fotoPedida[id] = true; });
    return rpc('v39_people_photos', { p_person_ids: falta }).then(function (l) {
      return U().cliente().then(function (cl) {
        return Promise.all((l || []).map(function (x) { return cl.storage.from('person-photos').createSignedUrl(x.path, 3600).then(function (r) { if (r && r.data && r.data.signedUrl) S.fotos[x.id] = r.data.signedUrl; }); }));
      });
    }).catch(function () {});
  }
  function blocoRetirada(x, metodo) {
    var pes = x.podemRetirar || [];
    return '<div class="card" style="padding:10px 14px;margin-top:8px"><div class="row" style="padding:0">' + foto({ pessoaId: x.criancaId, temFoto: x.temFoto }, 56) +
      '<div class="info" style="margin-left:10px"><div class="nm">' + esc(x.crianca) + '</div><div class="sb">' + esc(x.familia) + ' · entrou ' + hora(x.entrada) + '</div></div></div>' +
      '<div class="sb" style="margin:8px 0 4px">Confira o rosto de quem está retirando:</div>' +
      (pes.length ? pes.map(function (p) {
        var ok = p.temFoto && (p.idade == null || p.idade >= 12);
        return '<label class="row" style="padding:6px 0;gap:10px;align-items:center;cursor:' + (ok ? 'pointer' : 'default') + '"><input type="radio" name="kr-por-' + esc(x.id) + '" value="' + esc(p.pessoaId) + '"' + (ok ? '' : ' disabled') + ' style="width:auto">' +
          foto({ pessoaId: p.pessoaId, temFoto: p.temFoto }, 64) + '<span><b>' + esc(p.nome) + '</b><br><span class="sb">' + (p.papel === 'responsavel' ? 'responsável' : 'autorizado') + (p.temFoto ? '' : ' · sem foto: não pode retirar') + '</span></span></label>';
      }).join('') : '<div class="aviso r">Ninguém autorizado a retirar nesta família.</div>') +
      (metodo === 'photo' ? '<label>Motivo da retirada sem código *</label><input id="kr-motivo-' + esc(x.id) + '" placeholder="Ex.: perdeu a etiqueta">' : '') +
      '<div class="gap"></div><button class="btn pr" data-k="confirmarRetirada" data-v="' + esc(x.id) + '" data-metodo="' + metodo + '">Confirmar retirada</button></div>';
  }
  function buscarCodigo() {
    var cod = ($('kr-cod') || {}).value; cod = String(cod || '').trim();
    if (!/^\d{4}$/.test(cod)) return toast('Digite os 4 dígitos.', true);
    rpc('v39_kids_checkin_find', { p_ministry_id: S.min, p_event_id: SALA.ev, p_codigo: cod }).then(function (l) {
      SALA.achados = { codigo: cod, lista: l || [] };
      var ids = []; (l || []).forEach(function (x) { ids.push(x.criancaId); (x.podemRetirar || []).forEach(function (p) { ids.push(p.pessoaId); }); });
      var desenhar = function () { var r = $('kr-res'); if (r) r.innerHTML = (l && l.length) ? l.map(function (x) { return blocoRetirada(x, 'code'); }).join('') : '<div class="aviso r" style="margin-top:8px">Nenhuma criança na sala com este código.</div>'; };
      desenhar(); fotosDe(ids).then(desenhar);
    }).catch(function (e) { toast(traduz(e), true); });
  }
  function formRetirarFoto(checkinId) {
    var x = ((SALA.board || {}).entradas || []).filter(function (e) { return e.id === checkinId; })[0]; if (!x) return;
    var f = familia(x.familiaId);
    var pes = f ? (f.membros || []).filter(function (p) { return p.papel !== 'crianca' && p.podeRetirar; }).map(function (p) { return { pessoaId: p.pessoaId, nome: p.nome, papel: p.papel, temFoto: p.temFoto, idade: p.idade }; }) : [];
    var item = Object.assign({}, x, { podemRetirar: pes });
    SALA.achados = { codigo: null, lista: [item] };
    modal('<h2>Retirar sem código</h2><div class="sb">Só libere depois de conferir o rosto pela foto. Fica registrado quem liberou e o motivo.</div><div id="kr-res">' + blocoRetirada(item, 'photo') + '</div>' +
      '<div class="gap"></div><button class="btn gh" data-a="fechar">Fechar</button>');
    fotosDe(pes.map(function (p) { return p.pessoaId; }).concat([x.criancaId])).then(function () { var r = $('kr-res'); if (r) r.innerHTML = blocoRetirada(item, 'photo'); });
  }
  function confirmarRetirada(checkinId, t) {
    var metodo = t.getAttribute('data-metodo'), sel = document.querySelector('input[name="kr-por-' + checkinId + '"]:checked');
    if (!sel) return toast('Escolha quem está retirando.', true);
    var p = { ministerioId: S.min, checkinId: checkinId, retiradoPorId: sel.value, metodo: metodo };
    if (metodo === 'code') p.codigo = (SALA.achados || {}).codigo;
    else { p.motivo = (($('kr-motivo-' + checkinId) || {}).value || '').trim(); if (!p.motivo) return toast('Informe o motivo.', true); }
    rpc('v39_kids_checkout', { p: p }).then(function (r) {
      toast((r && r.crianca ? r.crianca + ' retirada' : 'Retirada') + ' por ' + (r && r.retiradoPor || '') + '.');
      var rest = ((SALA.achados || {}).lista || []).filter(function (x) { return x.id !== checkinId; });
      if (rest.length) { SALA.achados.lista = rest; var el = $('kr-res'); if (el) el.innerHTML = rest.map(function (x) { return blocoRetirada(x, metodo); }).join(''); }
      else fechar();
      carregarSala({ id: S.min }, true);
    }).catch(function (e) { toast(traduz(e), true); });
  }
  function cancelarEntrada(checkinId) {
    var x = ((SALA.board || {}).entradas || []).filter(function (e) { return e.id === checkinId; })[0]; if (!x) return;
    var motivo = window.prompt('Motivo para cancelar a entrada de ' + x.crianca + ':');
    if (motivo === null) return;
    if (!motivo.trim()) return toast('Informe o motivo.', true);
    rpc('v39_kids_checkin_cancel', { p: { ministerioId: S.min, checkinId: checkinId, motivo: motivo.trim() } })
      .then(function () { toast('Entrada cancelada.'); carregarSala({ id: S.min }, true); }).catch(function (e) { toast(traduz(e), true); });
  }

  /* contagem do Kids no culto (lida pelo app.js) */
  function carregarCultos() {
    if (SALA.cultosPedido || !(window.G2_MIN && window.G2_MIN._u)) return;
    SALA.cultosPedido = true;
    rpc('v39_kids_culto_counts', { p_culto_ids: null }).then(function (r) {
      var antes = JSON.stringify(SALA.cultos || {}); SALA.cultos = r || {}; SALA.cultosEm = Date.now();
      if (JSON.stringify(SALA.cultos) !== antes && window.__gc && window.__gc.render) window.__gc.render();
    }).catch(function () { SALA.cultos = SALA.cultos || {}; })
      .then(function () { setTimeout(function () { SALA.cultosPedido = false; }, 60000); });
  }
  K.cultoKids = function (id) {
    if (!SALA.cultos || Date.now() - SALA.cultosEm > 60000) carregarCultos();
    return (SALA.cultos && SALA.cultos[id]) || null;
  };
  K.pendentesCulto = function (id) {
    if (!(window.G2_MIN && window.G2_MIN._u)) return Promise.resolve(null);
    return rpc('v39_kids_culto_counts', { p_culto_ids: [id] }).then(function (r) { return (r && r[id]) || null; }).catch(function () { return null; });
  };

  /* ───────── eventos (só o que tem data-k) ───────── */
  var ACOES = {
    novaFamilia: function () { formFamilia(null, U().minAtual()); },
    editarFamilia: function (v) { formFamilia(familia(v), U().minAtual()); },
    salvarFamilia: salvarFamilia,
    abrir: function (v) { S.aberta = v; pintar(); window.scrollTo(0, 0); },
    voltar: function () { S.aberta = null; pintar(); },
    addMembro: function (v) { formMembro(v, null); },
    editarMembro: function (v) { var p = membro(familia(S.aberta), v); if (p) formMembro(p.papel, p); },
    escolherPessoa: function (v, t) {
      S.form.pessoaId = v;
      var sel = $('km-sel'); if (sel) sel.innerHTML = 'Selecionado: <b>' + esc(t.getAttribute('data-nome')) + '</b> (cadastro existente; os campos abaixo só completam o que faltar)';
      var r = $('km-res'); if (r) r.innerHTML = '';
      var n = $('km-nome'); if (n) { n.value = t.getAttribute('data-nome'); n.disabled = true; }
    },
    salvarMembro: salvarMembro,
    encerrarMembro: encerrarMembro,
    autorizacao: formAutorizacao,
    autorizar: function () { gravarAutorizacao('granted'); },
    revogar: function () { gravarAutorizacao('revoked'); },
    ficha: abrirFicha,
    salvarFicha: salvarFicha,
    foto: pedirFoto,
    concluir: function (v, t) { formConcluir(v, t.getAttribute('data-f')); },
    confirmarConcluir: concluir,
    entrada: function () { if (S.lista === null) carregar({ id: S.min }, false); formEntrada(''); },
    escolherCrianca: escolherCrianca,
    confirmarEntrada: confirmarEntrada,
    imprimir: imprimir,
    retirarCodigo: formRetirarCodigo,
    buscarCodigo: buscarCodigo,
    retirarFoto: formRetirarFoto,
    confirmarRetirada: confirmarRetirada,
    cancelarEntrada: cancelarEntrada,
    atualizarSala: function () { carregarSala({ id: S.min }, true); }
  };
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-k]'); if (!t) return;
    var a = t.getAttribute('data-k'); if (!ACOES[a]) return;
    if (!t.closest('#g2min') && !t.closest('#modal')) return;
    ev.preventDefault(); ev.stopPropagation();
    try { ACOES[a](t.getAttribute('data-v'), t); } catch (e) { console.warn('[2Gather] kids', e); toast('Não foi possível concluir.', true); }
  });
  document.addEventListener('input', function (ev) {
    var t = ev.target; if (!t || !t.getAttribute) return;
    if (t.getAttribute('data-k-busca')) { S.q = t.value; var pos = t.selectionStart; pintar(); var n = document.querySelector('[data-k-busca]'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* segue */ } } }
    else if (t.getAttribute('data-k-pessoa')) buscarPessoa(t.value);
    else if (t.getAttribute('data-k-entrada')) { var q = t.value.trim().toLowerCase(), el = $('ke-lista');
      if (el) el.innerHTML = listaEntrada(criancasElegiveis().filter(function (x) { return !q || (x.p.nomeCompleto || x.p.nome).toLowerCase().indexOf(q) >= 0 || x.f.nome.toLowerCase().indexOf(q) >= 0; })); }
  });
  document.addEventListener('change', function (ev) {
    var t = ev.target; if (!t || !t.getAttribute || !t.getAttribute('data-k-evento')) return;
    SALA.ev = t.value; SALA.board = null; pintar();
  });

  K.tela = tela;
  K.telaSala = telaSala;
  K.resetar = function () { S.min = null; S.lista = null; S.aberta = null; };
  K._t = { traduz: traduz, tela: tela, fone: fone };
})();
