/* 2Gather v39 · Kids · KIDS-11
   KIDS-11: ao salvar professores, o sino e Minhas escalas atualizam na hora (quem se escala vê o aviso sem esperar).
   KIDS-10: saiu o botão "Salas deste culto" de Entrada e saída (a função fica no evento da Agenda), a pedido do Diogo.
   KIDS-9: salas e escala dos professores dentro do evento da Agenda (Ajustar/Editar evento); K.blocoEvento.
   KIDS-8: escala com confirmação (status de cada professor na sala, "sem resposta" a menos de 24 h, WhatsApp do líder
           registrado); quem retira precisa ter mais de 12 anos (13 ou mais). Sino e "Minhas escalas": app_v39_escala.js.
   KIDS-7: nascimento digitado como dd/mm/aaaa (o campo de data vinha vazio ao salvar em alguns aparelhos); parentesco da
           criança deduzido do parentesco do responsável e do sexo (sem perguntar dos dois lados).
   KIDS-6: "Posição na lista" explicada na sala; mensagem quando a criança já está em outro culto/sala no mesmo horário (KIDS_6).
   KIDS-5: cadastro a partir da criança (responsável da base ou tela de visitante, sem etapa "família"); grau de parentesco;
           câmera ao vivo; salas (padrão do Kids e por culto) com professores; entrada com sala automática ou escolhida;
           vínculos no cadastro de pessoas (G2_KIDS.blocoVinculos). Requer sql/KIDS_5_unificado_aplicar.sql.
   KIDS-3: aba "Entrada e saída": entrada com código de 4 dígitos (irmãos usam o mesmo), etiqueta térmica 62x29 mm,
           WhatsApp ao responsável (wa.me), retirada com código ou pela foto (com motivo), cancelar com motivo;
           contagem "Kids" no culto (G2_KIDS.cultoKids) e aviso de quem falta retirar ao encerrar (G2_KIDS.pendentesCulto).
           Requer sql/KIDS_3_entrada_aplicar.sql.
   Arquivo NOVO. Carregar DEPOIS do app_v39_ministerios.js (MIN-3+). Requer no Supabase: sql/KIDS_2_familias_aplicar.sql.
   Aba "Crianças" do ministério Kids:
   - Famílias: responsável -> criança -> quem pode retirar (mais de 12 anos). Base única de pessoas (busca antes de cadastrar).
   - Foto do rosto (câmera do celular) da criança e de quem retira; exige a autorização (kids_care) da pessoa.
   - Autorização do responsável pela criança (LGPD); adulto autoriza por si. Revogar exige motivo.
   - Ficha da criança (alergias, doenças, restrições, medicamentos): cifrada no banco; cada abertura fica na auditoria.
   - "Completaram 12 anos": o líder conclui a saída do Kids (cadastro vai para o geral da igreja).
   Quem autoriza é o banco (RPCs app.v39_kids_*); o front só esconde botões.
   Diagnóstico no Console: G2_KIDS.versao, G2_KIDS._s */
(function () {
  'use strict';
  var VERSAO = 'KIDS-11';
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
    KIDS_PICKUP_AGE: 'Quem retira (ou é responsável) precisa ter mais de 12 anos.', KIDS_KINSHIP_INVALID: 'Grau de parentesco inválido.', KIDS_CHILD_AGE: 'Criança do Kids: menos de 12 anos e com data de nascimento.',
    KIDS_ROOM_AGE_INVALID: 'Faixa de idade inválida (anos até 18; meses até 48).', KIDS_ROOM_DUPLICATE: 'Já existe sala com este nome.', KIDS_ROOM_NOT_FOUND: 'Sala não encontrada ou fechada.',
    KIDS_ROOM_HAS_CHILDREN: 'Há crianças nesta sala: troque-as de sala antes de fechar.', KIDS_STAFF_NOT_MEMBER: 'O professor precisa estar na equipe ativa do Kids.', KIDS_STAFF_NO_LOGIN: 'Só quem tem acesso ao app pode ser escalado.',
    KIDS_ROOM_NAME_REQUIRED: 'Informe o nome da sala.',
    KIDS_STAFF_NOT_FOUND: 'Escala não encontrada (talvez já tenha sido alterada).', KIDS_STATUS_INVALID: 'Resposta inválida.',
    KIDS_TRANSFER_TARGET_INVALID: 'Escolha outra pessoa da equipe do Kids com acesso ao app (e que não esteja nesta sala).', KIDS_TRANSFER_PENDING: 'Já existe um pedido de troca em andamento para esta escala.',
    KIDS_TRANSFER_NOT_FOUND: 'Pedido de troca não encontrado ou já respondido.', KIDS_TRANSFER_NOT_READY: 'Quem recebe ainda não aceitou a troca.',
    KIDS_CHECKIN_CONFLICT: 'A criança já está em outro culto ou sala neste horário (ou ainda não foi retirada do anterior).', KIDS_CONSENT_REQUIRED: 'Registre antes a autorização do responsável.',
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
  function membro(fam, fmId) {   // KIDS-5: procura no núcleo aberto e, se não achar, em todos (a criança pode ter mais de um núcleo)
    var x = fam && (fam.membros || []).filter(function (y) { return y.id === fmId; })[0];
    if (x) return x;
    (S.lista || []).some(function (f) { x = (f.membros || []).filter(function (y) { return y.id === fmId; })[0]; return !!x; });
    return x;
  }
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
      (lider(m) ? ' <button class="btn gh sm" data-k="encerrarMembro" data-v="' + esc(p.id) + '">Desvincular</button>' : '');
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
    if (novo && !ehCr) return formVinculoKids(S.form.papel);   // KIDS-5: adulto novo vem da base (busca) ou da tela de visitante
    modal('<h2>' + (novo ? 'Adicionar ' + PAPEL[S.form.papel].toLowerCase() : 'Editar ' + esc(p.nome)) + '</h2>' +
      (novo ? '<div class="ini-sub">Busque antes para não cadastrar a mesma pessoa duas vezes.</div>' +
        '<input id="km-busca" data-k-pessoa="1" placeholder="Nome ou final do telefone" autocomplete="off"><div id="km-res"></div>' +
        '<div id="km-sel" class="sb" style="margin:6px 0"></div>' : '') +
      '<div id="km-dados">' +
      '<label>Nome completo' + (novo ? ' *' : '') + '</label><input id="km-nome" value="' + esc(p ? p.nomeCompleto : '') + '"' + (podeEditarDados ? '' : ' disabled') + '>' +
      '<div class="g2"><div><label>Como é chamado(a)</label><input id="km-apelido"' + (podeEditarDados ? '' : ' disabled') + '></div>' +
      '<div><label>Nascimento' + (ehCr || S.form.papel === 'outro' ? ' *' : '') + '</label>' + campoData('km-nasc', p && p.nascimento) + '</div></div>' +
      '<div class="g2"><div><label>Sexo</label><select id="km-sexo"' + (podeEditarDados ? '' : ' disabled') + '><option value=""></option><option' + (p && p.sexo === 'Feminino' ? ' selected' : '') + '>Feminino</option><option' + (p && p.sexo === 'Masculino' ? ' selected' : '') + '>Masculino</option></select></div>' +
      (ehCr ? '<div><label>Situação</label><select id="km-sit"><option value="">segue a família</option><option value="visiting"' + (p && p.situacao === 'visiting' ? ' selected' : '') + '>Visitante</option><option value="active"' + (p && p.situacao === 'active' ? ' selected' : '') + '>Frequenta</option></select></div>'
            : '<div><label>WhatsApp' + (S.form.papel === 'responsavel' ? ' *' : '') + '</label><input id="km-fone" inputmode="tel" placeholder="(11) 98888-7777" value="' + esc(p && p.whatsapp ? fone(p.whatsapp) : '') + '"></div>') + '</div>' +
      '</div>' +
      '<label>Grau de parentesco</label>' + selectParentesco('km-par', S.form.papel, p && p.parentesco) +
      (ehCr ? '' : '<label><input type="checkbox" id="km-retira"' + (!p || p.podeRetirar ? ' checked' : '') + ' style="width:auto;margin-right:6px">Pode retirar a criança (mais de 12 anos, com foto)</label>' +
        '<label><input type="checkbox" id="km-princ"' + (p && p.contatoPrincipal ? ' checked' : '') + ' style="width:auto;margin-right:6px">Contato principal (recebe o WhatsApp da entrada)</label>') +
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
    var nascM = lerData('km-nasc'); if (nascM === null) return toast('Data de nascimento inválida: use dd/mm/aaaa.', true);
    var pes = { nome: ($('km-nome') || {}).value, apelido: ($('km-apelido') || {}).value, nascimento: nascM || null,
                sexo: ($('km-sexo') || {}).value || null, whatsapp: $('km-fone') ? $('km-fone').value : null };
    Object.keys(pes).forEach(function (k) { if (typeof pes[k] === 'string') pes[k] = pes[k].trim(); if (pes[k] === '') pes[k] = null; });
    p.pessoa = pes;
    if ($('km-par')) p.parentesco = $('km-par').value || null;
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
    abrirCamera('Foto · ' + p.nome, function (blob) { enviarFotoBlob(p, blob); });   // KIDS-5: câmera ao vivo (galeria como opção)
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

  /* ═════════ KIDS-5: cadastro a partir da criança (sem etapa "família"), parentesco, câmera ═════════ */
  var PAR_ADULTO = ['Pai', 'Mãe', 'Padrasto', 'Madrasta', 'Avô', 'Avó', 'Tio', 'Tia', 'Irmão', 'Irmã', 'Primo', 'Prima', 'Tutor legal', 'Cônjuge', 'Outro'];
  var PAR_CRIANCA = ['Filho', 'Filha', 'Neto', 'Neta', 'Enteado', 'Enteada', 'Sobrinho', 'Sobrinha', 'Irmão', 'Irmã', 'Primo', 'Prima', 'Outro'];
  var PAR_TODOS = PAR_ADULTO.concat(['Filho', 'Filha', 'Neto', 'Neta', 'Enteado', 'Enteada', 'Sobrinho', 'Sobrinha']);
  function selectParentesco(id, papel, atual) {
    var l = papel === 'crianca' ? PAR_CRIANCA : papel === 'todos' ? PAR_TODOS : PAR_ADULTO;
    return '<select id="' + id + '"><option value="">— escolha —</option>' + l.map(function (x) { return '<option' + (x === atual ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select>';
  }
  /* KIDS-7: data digitada como dd/mm/aaaa (o campo de data do navegador vinha vazio em alguns aparelhos) */
  function campoData(id, iso) {
    var v = iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '';
    return '<input id="' + id + '" data-k-data="1" inputmode="numeric" maxlength="10" placeholder="dd/mm/aaaa" autocomplete="off" value="' + esc(v) + '">';
  }
  function mascaraData(v) { var d = String(v || '').replace(/\D/g, '').slice(0, 8); return d.length > 4 ? d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4) : d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d; }
  /* devolve 'aaaa-mm-dd', '' (vazio) ou null (inválida) */
  function lerData(id) {
    var el = $(id); if (!el) return '';
    var v = String(el.value || '').trim(); if (!v) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    var m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (!m) return null;
    var d = +m[1], mo = +m[2], a = +m[3], dt = new Date(a, mo - 1, d);
    if (dt.getFullYear() !== a || dt.getMonth() !== mo - 1 || dt.getDate() !== d || dt > new Date() || a < 1900) return null;
    return a + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
  }
  /* parentesco da criança deduzido do parentesco do responsável e do sexo da criança */
  function parentescoInverso(parResp, sexo) {
    var f = sexo === 'Feminino';
    var m = { 'Pai': f ? 'Filha' : 'Filho', 'Mãe': f ? 'Filha' : 'Filho', 'Padrasto': f ? 'Enteada' : 'Enteado', 'Madrasta': f ? 'Enteada' : 'Enteado',
              'Avô': f ? 'Neta' : 'Neto', 'Avó': f ? 'Neta' : 'Neto', 'Tio': f ? 'Sobrinha' : 'Sobrinho', 'Tia': f ? 'Sobrinha' : 'Sobrinho',
              'Irmão': f ? 'Irmã' : 'Irmão', 'Irmã': f ? 'Irmã' : 'Irmão', 'Primo': f ? 'Prima' : 'Primo', 'Prima': f ? 'Prima' : 'Primo' };
    return parResp ? (m[parResp] || 'Outro') : null;
  }
  /* crianças (uma linha por criança, juntando os núcleos em que ela aparece) */
  function criancas() {
    var mapa = {}, l = [];
    (S.lista || []).forEach(function (f) { (f.membros || []).forEach(function (p) {
      if (p.papel !== 'crianca') return;
      if (!mapa[p.pessoaId]) { mapa[p.pessoaId] = { p: p, familias: [] }; l.push(mapa[p.pessoaId]); }
      mapa[p.pessoaId].familias.push(f);
    }); });
    return l.sort(function (a, b) { return String(a.p.nome).localeCompare(String(b.p.nome)); });
  }
  function adultosDa(x) {
    var vistos = {}, l = [];
    x.familias.forEach(function (f) { (f.membros || []).forEach(function (p) { if (p.papel !== 'crianca' && !vistos[p.pessoaId]) { vistos[p.pessoaId] = true; l.push(p); } }); });
    return l.sort(function (a, b) { return (a.papel === 'responsavel' ? 0 : 1) - (b.papel === 'responsavel' ? 0 : 1); });
  }
  function telaCriancas(m) {
    if (!U()) return '';
    if (S.min !== m.id || S.lista === null) { setTimeout(function () { carregar(m, false); }, 0); return '<div class="empty">Carregando crianças…</div>'; }
    var l = criancas();
    if (S.crianca) { var x = l.filter(function (y) { return y.p.pessoaId === S.crianca; })[0]; if (x) return telaCrianca(m, x); S.crianca = null; }
    var h = '';
    if (S.erro) h += '<div class="aviso r">' + esc(S.erro) + '</div>';
    h += '<input data-k-busca="1" value="' + esc(S.q) + '" placeholder="Buscar criança ou responsável" style="margin-top:4px">';
    h += '<div class="gap"></div><button class="btn pr" data-k="novaCrianca">+ Criança</button>';
    var doze = l.filter(function (x) { return x.p.completouIdade; });
    if (doze.length) {
      h += '<div class="card" style="margin-top:12px;padding:10px 16px;border-left:4px solid #c99a1a"><b>Completaram ' + esc(m.idadeMax || 12) + ' anos</b>' +
        '<div class="sb" style="margin:2px 0 6px">Saem do Kids e vão para o cadastro geral da igreja.' + (lider(m) ? '' : ' O líder conclui a saída.') + '</div>' +
        doze.map(function (x) {
          return '<div class="row" style="padding:6px 0">' + foto(x.p, 34) + '<div class="info" style="margin-left:10px"><div class="nm">' + esc(x.p.nome) + ' · ' + esc(x.p.idade) + ' anos</div></div>' +
            (lider(m) ? '<button class="btn gh sm" data-k="concluir" data-v="' + esc(x.p.pessoaId) + '" data-f="' + esc(x.familias[0].id) + '">Concluir Kids</button>' : '') + '</div>';
        }).join('') + '</div>';
    }
    var q = S.q.trim().toLowerCase();
    var vis = l.filter(function (x) { return !q || String(x.p.nomeCompleto || x.p.nome).toLowerCase().indexOf(q) >= 0 || adultosDa(x).some(function (a) { return String(a.nomeCompleto || a.nome).toLowerCase().indexOf(q) >= 0; }); });
    if (!vis.length) return h + '<div class="card" style="margin-top:12px"><div class="empty">' + (q ? 'Nada encontrado.' : 'Nenhuma criança cadastrada.') + '</div></div>';
    h += '<div class="card" style="padding:4px 16px;margin-top:12px">' + vis.map(function (x) {
      var p = x.p, rs = adultosDa(x).filter(function (a) { return a.papel === 'responsavel'; }), al = [];
      if (p.temAlergia) al.push(pill('⚠ alergia', '#c0392b'));
      if (!p.temFoto) al.push(pill('falta foto', '#c99a1a'));
      if (!p.consentimento) al.push(pill('falta autorização', '#c99a1a'));
      return '<div class="row cl" data-k="abrirCrianca" data-v="' + esc(p.pessoaId) + '" style="cursor:pointer;gap:10px">' + foto(p, 40) +
        '<div class="info"><div class="nm">' + esc(p.nome) + ' <span class="sb">' + esc(p.idade) + ' anos</span> ' + al.join(' ') + '</div>' +
        '<div class="sb">' + (rs.length ? rs.map(function (a) { return esc(a.nome) + (a.parentesco ? ' (' + esc(a.parentesco) + ')' : ''); }).join(', ') : 'sem responsável') + '</div></div>' +
        '<span style="color:var(--tx3);font-size:18px">›</span></div>';
    }).join('') + '</div>';
    return h;
  }
  function telaCrianca(m, x) {
    var f = x.familias[0]; S.aberta = f.id;
    var ad = adultosDa(x), irmaos = [];
    x.familias.forEach(function (fa) { (fa.membros || []).forEach(function (p) { if (p.papel === 'crianca' && p.pessoaId !== x.p.pessoaId && irmaos.indexOf(p) < 0) irmaos.push(p); }); });
    var h = '<button class="btn gh sm" data-k="voltarCriancas" style="margin-bottom:8px">‹ Crianças</button>' +
      '<div class="card" style="padding:4px 16px">' + linhaMembro(m, f, x.p) + '</div>' +
      '<div class="card" style="padding:4px 16px;margin-top:10px"><div style="font-weight:700;margin:8px 0 2px">Responsáveis e quem pode retirar</div>' +
      (ad.length ? ad.map(function (p) { return linhaMembro(m, f, p); }).join('') : '<div class="sb" style="padding:8px 0">Nenhum responsável ainda.</div>') +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0"><button class="btn sm" data-k="addVinculo" data-v="responsavel">+ Responsável</button>' +
      '<button class="btn sm" data-k="addVinculo" data-v="outro">+ Outra pessoa que retira</button></div></div>';
    if (irmaos.length) h += '<div class="card" style="padding:4px 16px;margin-top:10px"><div style="font-weight:700;margin:8px 0 2px">Irmãos no Kids</div>' + irmaos.map(function (p) {
      return '<div class="row cl" data-k="abrirCrianca" data-v="' + esc(p.pessoaId) + '" style="cursor:pointer;gap:10px">' + foto(p, 32) + '<div class="info"><div class="nm">' + esc(p.nome) + ' <span class="sb">' + esc(p.idade) + ' anos</span></div></div></div>';
    }).join('') + '</div>';
    return h;
  }
  /* busca na base (nome ou final do telefone) para escolher responsável/quem retira */
  function caixaBusca(id, rotulo) {
    return '<label>' + rotulo + '</label><input id="' + id + '-q" data-k-base="' + id + '" placeholder="Nome ou final do telefone" autocomplete="off">' +
      '<div id="' + id + '-res"></div><div id="' + id + '-sel" class="sb" style="margin:6px 0">Ninguém escolhido.</div>' +
      '<button class="btn gh sm" data-k="cadastrarVisitante">Não achou? Cadastrar na tela de visitante</button>';
  }
  function buscarBase(campo, q) {
    clearTimeout(S.tBase);
    var res = $(campo + '-res'); if (!res) return;
    if (String(q || '').trim().length < 2) { res.innerHTML = ''; return; }
    S.tBase = setTimeout(function () {
      rpc('v39_kids_people_search', { p_ministry_id: S.min, p_q: q }).then(function (l) {
        var r = $(campo + '-res'); if (!r) return; l = (l || []).filter(function (x) { return x.idade == null || x.idade >= 13; });
        r.innerHTML = l.length ? '<div class="card" style="padding:2px 12px;margin:4px 0">' + l.map(function (x) {
          return '<div class="row cl" data-k="escolherBase" data-v="' + esc(x.id) + '" data-campo="' + campo + '" data-nome="' + esc(x.nome) + '" style="cursor:pointer;padding:8px 0"><div class="info"><div class="nm">' + esc(x.nome) + '</div>' +
            '<div class="sb">' + (x.idade != null ? x.idade + ' anos · ' : '') + (x.finalFone ? 'tel. final ' + esc(x.finalFone) : 'sem telefone') + ' · ' + (x.situacao === 'visiting' ? 'visitante' : 'da igreja') + '</div></div></div>';
        }).join('') + '</div>' : '<div class="sb" style="margin:4px 0">Ninguém encontrado na base da igreja.</div>';
      }).catch(function (e) { var r = $(campo + '-res'); if (r) r.innerHTML = '<div class="sb">' + esc(traduz(e)) + '</div>'; });
    }, 350);
  }
  function formNovaCrianca(retorno) {
    S.form = { respId: retorno && retorno.respId || null };
    modal('<h2>Nova criança</h2>' +
      '<label>Nome completo *</label><input id="kc-nome">' +
      '<div class="g2"><div><label>Como é chamada</label><input id="kc-apelido"></div><div><label>Nascimento *</label>' + campoData('kc-nasc') + '</div></div>' +
      '<div class="g2"><div><label>Sexo *</label><select id="kc-sexo"><option value=""></option><option>Feminino</option><option>Masculino</option></select></div>' +
      '<div><label>Situação</label><select id="kc-sit"><option value="">segue o responsável</option><option value="visiting">Visitante</option><option value="active">Frequenta</option></select></div></div>' +
      '<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--ln,#e6e8eb)">' + caixaBusca('kc-resp', 'Responsável (da base da igreja) *') +
      '<label style="margin-top:8px">O responsável é (da criança)</label>' + selectParentesco('kc-parresp', 'responsavel') +
      '<div class="sb">O parentesco da criança é deduzido (ex.: Pai → Filho/Filha, conforme o sexo).</div></div>' +
      '<div class="sb" style="margin-top:6px">Depois de salvar: foto, autorização, ficha e outras pessoas que podem retirar.</div>' +
      '<div class="gap"></div><button class="btn pr" data-k="salvarNovaCrianca">Salvar criança</button>' +
      '<div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
    if (retorno && retorno.respId) marcarEscolhido('kc-resp', retorno.respId, retorno.respNome);
  }
  function marcarEscolhido(campo, id, nome) {
    if (campo === 'kc-resp') S.form.respId = id; else S.form.vinId = id;
    var s = $(campo + '-sel'); if (s) s.innerHTML = 'Escolhido: <b>' + esc(nome) + '</b>';
    var r = $(campo + '-res'); if (r) r.innerHTML = '';
    var q = $(campo + '-q'); if (q) q.value = '';
  }
  function salvarNovaCrianca() {
    var nasc = lerData('kc-nasc');
    var c = { nome: $('kc-nome').value.trim(), apelido: $('kc-apelido').value.trim() || null, nascimento: nasc || null, sexo: $('kc-sexo').value || null };
    if (!c.nome) return toast('Informe o nome da criança.', true);
    if (nasc === null) return toast('Data de nascimento inválida: use dd/mm/aaaa.', true);
    if (!c.nascimento) return toast('Informe a data de nascimento.', true);
    c.parentesco = parentescoInverso($('kc-parresp').value, c.sexo);
    if (!c.sexo) return toast('Informe o sexo (define a sala).', true);
    if (!S.form.respId) return toast('Escolha o responsável na busca ou cadastre pela tela de visitante.', true);
    var p = { ministerioId: S.min, responsavelId: S.form.respId, parentescoResponsavel: $('kc-parresp').value || null, crianca: c, situacao: $('kc-sit').value || null };
    rpc('v39_kids_child_register', { p: p }).then(function (r) {
      fechar(); toast('Criança cadastrada. Agora a foto e a autorização.'); S.crianca = r && r.criancaId; return recarregar();
    }).catch(function (e) { toast(traduz(e), true); });
  }
  function formVinculoKids(papel) {
    S.form = { papel: papel, vinId: null };
    modal('<h2>' + (papel === 'responsavel' ? 'Adicionar responsável' : 'Outra pessoa que pode retirar') + '</h2>' + caixaBusca('kv', 'Pessoa da base da igreja *') +
      '<label style="margin-top:8px">Grau de parentesco com a criança</label>' + selectParentesco('kv-par', 'responsavel') +
      '<label><input type="checkbox" id="kv-retira" checked style="width:auto;margin-right:6px">Pode retirar a criança (mais de 12 anos, com foto)</label>' +
      (papel === 'responsavel' ? '<label><input type="checkbox" id="kv-princ" style="width:auto;margin-right:6px">Contato principal (recebe o WhatsApp da entrada)</label>' : '') +
      '<div class="gap"></div><button class="btn pr" data-k="salvarVinculoKids">Salvar</button>' +
      '<div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
  }
  function salvarVinculoKids() {
    var F = S.form || {};
    if (!F.vinId) return toast('Escolha a pessoa na busca ou cadastre pela tela de visitante.', true);
    var p = { ministerioId: S.min, familiaId: S.aberta, papel: F.papel, pessoaId: F.vinId, parentesco: $('kv-par').value || null,
              podeRetirar: !!($('kv-retira') && $('kv-retira').checked), contatoPrincipal: !!($('kv-princ') && $('kv-princ').checked), pessoa: {} };
    rpc('v39_kids_member_save', { p: p }).then(function () { fechar(); toast('Vínculo salvo.'); return recarregar(); })
      .catch(function (e) { toast(traduz(e), true); });
  }
  /* responsável não cadastrado: tela de visitante do culto e volta para o Kids (decisão 5) */
  var VOLTA = 'g2_kids_volta';
  function irCadastroVisitante() {
    var g = window.__gc || {};
    if (g.pode && !g.pode('visitantes')) return toast('Seu perfil ainda não tem a liberação de cadastro de visitantes. Peça ao master.', true);
    var ctx = { ministerio: S.min, crianca: S.crianca || null, tipo: S.form && S.form.papel ? 'vinculo' : 'crianca', papel: (S.form && S.form.papel) || 'responsavel', em: Date.now() };
    try { sessionStorage.setItem(VOLTA, JSON.stringify(ctx)); } catch (e) { /* segue */ }
    fechar(); toast('Cadastre o responsável e você volta para o Kids.');
    if (g.irAba) g.irAba('lvnovo');
  }
  K.aposCadastroVisitante = function (pessoa) {
    var ctx = null; try { ctx = JSON.parse(sessionStorage.getItem(VOLTA) || 'null'); sessionStorage.removeItem(VOLTA); } catch (e) { ctx = null; }
    if (!ctx || Date.now() - (ctx.em || 0) > 30 * 60000 || !pessoa) return;
    var nome = String(pessoa.nome || '').trim(), tent = 0;
    toast('Voltando ao Kids…');
    function achar() {
      tent++;
      rpc('v39_kids_people_search', { p_ministry_id: ctx.ministerio, p_q: nome }).then(function (l) {
        var x = (l || []).filter(function (y) { return String(y.nome).toLowerCase() === nome.toLowerCase() || String(y.nome).toLowerCase().indexOf(nome.toLowerCase()) === 0; })[0];
        if (!x && tent < 10) return setTimeout(achar, 2500);   // ainda sincronizando
        if (window.G2_MIN && G2_MIN.abrir) G2_MIN.abrir(ctx.ministerio, 'criancas');
        S.crianca = ctx.crianca;
        setTimeout(function () {
          if (ctx.tipo === 'crianca') formNovaCrianca(x ? { respId: x.id, respNome: x.nome } : null);
          else { formVinculoKids(ctx.papel); if (x) marcarEscolhido('kv', x.id, x.nome); }
          if (!x) toast('O cadastro ainda está sincronizando: busque pelo nome em instantes.', true);
        }, 400);
      }).catch(function () { if (tent < 10) setTimeout(achar, 2500); });
    }
    setTimeout(achar, 1500);
  };

  /* câmera ao vivo (frontal/traseira) com captura; galeria continua como opção */
  var CAM = { stream: null, frente: true, pronto: null };
  function pararCamera() { if (CAM.stream) { CAM.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { /* segue */ } }); CAM.stream = null; } }
  function abrirCamera(titulo, pronto) {
    CAM.pronto = pronto;
    modal('<h2>' + esc(titulo) + '</h2><div style="position:relative;background:#000;border-radius:14px;overflow:hidden;aspect-ratio:3/4;max-height:60vh">' +
      '<video id="kcam-v" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover"></video></div>' +
      '<div id="kcam-msg" class="sb" style="margin:6px 0">Abrindo a câmera…</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pr" data-k="camCapturar">📸 Tirar foto</button><button class="btn" data-k="camTrocar">Trocar câmera</button>' +
      '<button class="btn gh" data-k="camGaleria">Escolher da galeria</button></div><div class="gap"></div><button class="btn gh" data-k="camFechar">Cancelar</button>');
    ligarCamera();
  }
  function ligarCamera() {
    pararCamera();
    var msg = $('kcam-msg');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { if (msg) msg.textContent = 'Este aparelho não liberou a câmera aqui. Use "Escolher da galeria".'; return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: CAM.frente ? 'user' : 'environment', width: { ideal: 1280 } }, audio: false }).then(function (s) {
      var v = $('kcam-v'); if (!v) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      CAM.stream = s; v.srcObject = s; var mm = $('kcam-msg'); if (mm) mm.textContent = 'Enquadre o rosto e toque em "Tirar foto".';
      var vigia = setInterval(function () { if (!document.getElementById('kcam-v')) { clearInterval(vigia); pararCamera(); } }, 1000);   // modal fechado por fora
    }).catch(function () { var mm = $('kcam-msg'); if (mm) mm.textContent = 'Não foi possível abrir a câmera (permissão negada?). Use "Escolher da galeria".'; });
  }
  function capturar() {
    var v = $('kcam-v'); if (!v || !v.videoWidth) return toast('A câmera ainda não abriu.', true);
    var max = 800, e = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight)), cv = document.createElement('canvas');
    cv.width = Math.round(v.videoWidth * e); cv.height = Math.round(v.videoHeight * e);
    cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
    pararCamera();
    cv.toBlob(function (b) { var f = CAM.pronto; CAM.pronto = null; fechar(); if (b && f) f(b); }, 'image/jpeg', 0.82);
  }
  function galeria() {
    var f = CAM.pronto, inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = function () { var a = inp.files && inp.files[0]; if (!a) return; pararCamera(); CAM.pronto = null; fechar(); reduzirArquivo(a, f); };
    inp.click();
  }
  function reduzirArquivo(arq, pronto) {
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 800, e = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.round(img.width * e); cv.height = Math.round(img.height * e);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(function (b) { if (b) pronto(b); else toast('Não foi possível ler a foto.', true); }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { toast('Arquivo de imagem inválido.', true); };
      img.src = fr.result;
    };
    fr.readAsDataURL(arq);
  }
  function enviarFotoBlob(p, blob) {
    var ig = U().igrejaId(), caminho = ig + '/people/' + p.pessoaId + '/' + uuid4().toLowerCase() + '.jpg';
    toast('Enviando foto…');
    U().cliente().then(function (cl) { return cl.storage.from('person-photos').upload(caminho, blob, { contentType: 'image/jpeg', upsert: false }); })
      .then(function (u) { if (u && u.error) throw u.error; return rpc('v39_inst_register_photo', { p_person_id: p.pessoaId, p_storage_path: caminho, p_original_file_name: 'kids.jpg', p_checksum_sha256: null }); })
      .then(function () { delete S.fotoPedida[p.pessoaId]; delete S.fotos[p.pessoaId]; toast('Foto salva.'); return recarregar(); })
      .catch(function (er) { toast(traduz(er), true); });
  }

  /* ═════════ KIDS-5: salas (padrão do Kids e de cada culto) e professores ═════════ */
  var GEN = { '': 'Todos', Feminino: 'Meninas', Masculino: 'Meninos' };
  function faixa(r) { return r.unidade === 'meses' ? r.idadeMin + ' a ' + r.idadeMax + ' meses' : r.idadeMin + ' a ' + r.idadeMax + ' anos'; }
  var SALAS = { min: null, lista: null };
  function telaSalas(m) {
    if (!U()) return '';
    if (SALAS.min !== m.id || SALAS.lista === null) {
      SALAS.min = m.id; SALAS.lista = null;
      rpc('v39_kids_rooms', { p_ministry_id: m.id }).then(function (l) { SALAS.lista = l || []; pintar(); }).catch(function (e) { SALAS.lista = []; toast(traduz(e), true); pintar(); });
      return '<div class="empty">Carregando salas…</div>';
    }
    var h = '<div class="ini-sub" style="margin-top:4px">Salas padrão do Kids: são copiadas para cada culto, onde o líder ajusta e escala os professores.</div>';
    if (lider(m)) h += '<div class="gap"></div><button class="btn pr" data-k="novaSala">+ Sala</button>';
    h += '<div class="card" style="padding:4px 16px;margin-top:12px">' + (SALAS.lista.length ? SALAS.lista.map(function (r) {
      return '<div class="row' + (lider(m) ? ' cl" data-k="editarSala" data-v="' + esc(r.id) + '" style="cursor:pointer' : '" style="') + ';' + (r.status === 'active' ? '' : 'opacity:.55') + '"><div class="info"><div class="nm">' + esc(r.nome) +
        (r.status === 'active' ? '' : ' ' + pill('inativa', '#7a7f87')) + '</div><div class="sb">' + esc(faixa(r)) + ' · ' + esc(GEN[r.genero || '']) + (r.capacidade ? ' · até ' + esc(r.capacidade) : '') + '</div></div></div>';
    }).join('') : '<div class="empty">Nenhuma sala cadastrada.</div>') + '</div>';
    return h;
  }
  function camposSala(r, comStatus, ehEvento) {
    r = r || { unidade: 'anos', idadeMin: 0 };
    return '<label>Nome *</label><input id="ks-nome" value="' + esc(r.nome) + '" placeholder="Ex.: Berçário, Pequenos, Juniores">' +
      '<div class="g2"><div><label>Idade em</label><select id="ks-un"><option value="anos"' + (r.unidade !== 'meses' ? ' selected' : '') + '>anos</option><option value="meses"' + (r.unidade === 'meses' ? ' selected' : '') + '>meses (berçário)</option></select></div>' +
      '<div><label>Para</label><select id="ks-gen"><option value="">Todos</option><option value="Feminino"' + (r.genero === 'Feminino' ? ' selected' : '') + '>Meninas</option><option value="Masculino"' + (r.genero === 'Masculino' ? ' selected' : '') + '>Meninos</option></select></div></div>' +
      '<div class="g2"><div><label>Idade mínima</label><input id="ks-min" type="number" min="0" value="' + esc(r.idadeMin) + '"></div><div><label>Idade máxima *</label><input id="ks-max" type="number" min="0" value="' + esc(r.idadeMax == null ? '' : r.idadeMax) + '"></div></div>' +
      '<div class="g2"><div><label>Capacidade (opcional)</label><input id="ks-cap" type="number" min="1" value="' + esc(r.capacidade || '') + '"></div><div><label>Posição na lista</label><input id="ks-ord" type="number" value="' + esc(r.ordem || 0) + '"></div></div>' +
      '<div class="sb" style="margin-top:-2px">Posição: 1 aparece primeiro na lista. Se duas salas servirem para a criança e estiverem igualmente cheias, a de posição menor é a sugerida.</div>' +
      (comStatus ? '<div class="g2"><div><label>Situação</label><select id="ks-st">' + (ehEvento ? '<option value="open"' + (r.status !== 'closed' ? ' selected' : '') + '>Aberta</option><option value="closed"' + (r.status === 'closed' ? ' selected' : '') + '>Fechada</option>'
        : '<option value="active"' + (r.status !== 'inactive' ? ' selected' : '') + '>Ativa</option><option value="inactive"' + (r.status === 'inactive' ? ' selected' : '') + '>Inativa</option>') + '</select></div><div><label>Motivo (fechar/inativar)</label><input id="ks-mot"></div></div>' : '');
  }
  function lerSala() {
    return { nome: $('ks-nome').value.trim(), unidade: $('ks-un').value, genero: $('ks-gen').value || null, idadeMin: $('ks-min').value || 0, idadeMax: $('ks-max').value,
             capacidade: $('ks-cap').value || null, ordem: $('ks-ord').value || 0, status: $('ks-st') ? $('ks-st').value : undefined, motivo: $('ks-mot') ? $('ks-mot').value.trim() || null : null };
  }
  function formSala(r) {
    modal('<h2>' + (r ? 'Editar sala' : 'Nova sala') + '</h2>' + camposSala(r, !!r, false) +
      '<div class="gap"></div><button class="btn pr" data-k="salvarSala" data-v="' + esc(r ? r.id : '') + '">Salvar</button><div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
  }
  function salvarSala(id) {
    var p = lerSala(); p.ministerioId = S.min || SALAS.min; p.id = id || null;
    if (!p.nome || p.idadeMax === '') return toast('Informe o nome e a idade máxima.', true);
    rpc('v39_kids_room_save', { p: p }).then(function () { fechar(); toast('Sala salva.'); SALAS.lista = null; pintar(); }).catch(function (e) { toast(traduz(e), true); });
  }
  /* salas deste culto (líder): ajustar, abrir/fechar, professores, sala só deste culto */
  function htmlSalasEvento() {
    var m = U().minAtual(), l = SALA.salas || [];
    return '<div class="card" style="padding:4px 14px;margin-top:8px">' + (l.length ? l.map(function (r) {
        return '<div style="padding:9px 0;border-bottom:1px solid var(--ln,#eceef1)"><div class="nm">' + esc(r.nome) + ' ' + (r.status === 'closed' ? pill('fechada', '#7a7f87') : '') + '</div>' +
          '<div class="sb">' + esc(faixa(r)) + ' · ' + esc(GEN[r.genero || '']) + ' · ' + r.presentes + (r.capacidade ? '/' + r.capacidade : '') + ' na sala · professores:' +
          (r.professores.length ? '' : ' <b style="color:#c99a1a">nenhum</b>') + '</div>' + r.professores.map(function (x) { return linhaProfessor(r, x, lider(m)); }).join('') +
          (lider(m) ? '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap"><button class="btn gh sm" data-k="editarSalaEvento" data-v="' + esc(r.id) + '">Ajustar</button>' +
            '<button class="btn gh sm" data-k="professoresSala" data-v="' + esc(r.id) + '">Professores</button></div>' : '') + '</div>';
      }).join('') : '<div class="empty">Nenhuma sala. Cadastre as salas padrão na aba Salas.</div>') + '</div>' +
      (lider(m) ? '<div class="gap"></div><button class="btn" data-k="novaSalaEvento">+ Sala só deste culto</button>' : '');
  }
  function formSalasEvento() {
    SALA.volta = null;
    modal('<h2>Salas deste culto</h2><div class="sb">Vêm das salas padrão do Kids. O que mudar aqui vale só para este culto.</div>' + htmlSalasEvento() +
      '<div class="gap"></div><button class="btn gh" data-a="fechar">Fechar</button>');
  }
  /* KIDS-9: volta para onde a sala foi aberta (evento da Agenda ou Entrada e saída) */
  function voltarSalas() { if (SALA.volta) SALA.volta(); else formSalasEvento(); }
  K.blocoEvento = function (eventoId, ministerioId, voltar) {
    S.min = ministerioId || S.min; SALA.ev = eventoId; SALA.salas = null; SALA.board = null; SALA.volta = voltar || null;
    setTimeout(function () {
      rpc('v39_kids_event_rooms', { p_ministry_id: S.min, p_event_id: eventoId }).then(function (l) {
        if (SALA.ev !== eventoId) return; SALA.salas = l || []; var b = $('kse-box'); if (b) b.innerHTML = htmlSalasEvento();
      }).catch(function (e) { var b = $('kse-box'); if (b) b.innerHTML = '<div class="aviso r">' + esc(traduz(e)) + '</div>'; });
    }, 0);
    return '<div class="sec" style="margin:16px 0 0">Salas e escala do Kids</div><div class="sb">Vêm das salas padrão do Kids; o que mudar aqui vale só para este evento. Cada professor escalado recebe aviso no app para confirmar.</div>' +
      '<div id="kse-box"><div class="empty">Carregando salas…</div></div>';
  };
  /* KIDS-8: resposta de cada professor à escala */
  var RESP = { pending: ['aguardando', '#c99a1a'], confirmed: ['confirmado', '#1f7a4d'], declined: ['não pode', '#c0392b'] };
  function linhaProfessor(r, x, ehLider) {
    var st = RESP[x.resposta] || null, tr = x.transferencia;
    return '<div style="padding:4px 0 2px 8px;border-left:3px solid ' + (x.semResposta24h ? '#c0392b' : 'transparent') + ';margin-top:4px">' +
      '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><b style="font-size:13.5px">' + esc(x.nome) + '</b>' + (x.funcao === 'auxiliar' ? '<span class="sb">(aux.)</span>' : '') +
      (st ? pill(st[0], st[1]) : '') + (x.semResposta24h ? pill('sem resposta · culto em menos de 24 h', '#c0392b') : '') + '</div>' +
      (x.resposta === 'declined' && x.motivoRecusa ? '<div class="sb">Motivo: ' + esc(x.motivoRecusa) + '</div>' : '') +
      (tr ? '<div class="sb">Troca pedida para ' + esc(tr.para) + ' · ' + (tr.status === 'pending_leader' ? '<b>aceita, aguardando sua autorização em Minhas escalas</b>' : 'aguardando quem recebe aceitar') + '</div>' : '') +
      (ehLider && x.whatsappEm ? '<div class="sb">WhatsApp enviado ' + esc(diaHora(x.whatsappEm)) + '</div>' : '') +
      (ehLider && x.whatsapp && x.resposta !== 'confirmed' ? '<button class="btn gh sm" style="margin-top:4px" data-k="whatsEscala" data-v="' + esc(x.staffId) + '" data-sala="' + esc(r.id) + '">' + (x.whatsappEm ? 'Lembrar pelo WhatsApp' : 'Avisar pelo WhatsApp') + '</button>' : '') +
      '</div>';
  }
  function textoEscala(r, x) {
    var ev = ((U().eventos && U().eventos(S.min)) || []).filter ? ((U().eventos(S.min) || []).filter(function (e) { return e.id === SALA.ev; })[0] || null) : null;
    return 'Olá, ' + x.nome + '! Você está na escala do Kids: sala ' + r.nome + (ev ? ' · ' + ev.nome + ' · ' + diaHora(ev.inicio) : '') + ' (' + x.funcao + ').\n' +
      'Confirme pelo app 2Gather, em "Minhas escalas" na tela inicial (Confirmo, Não posso ou Passar para outro voluntário).';
  }
  function whatsEscala(staffId, t) {
    var r = (SALA.salas || []).filter(function (s) { return s.id === t.getAttribute('data-sala'); })[0]; if (!r) return;
    var x = r.professores.filter(function (p) { return p.staffId === staffId; })[0]; if (!x || !x.whatsapp) return;
    var tel = String(x.whatsapp).replace(/\D/g, '');
    window.open('https://wa.me/55' + tel + '?text=' + encodeURIComponent(textoEscala(r, x)), '_blank');
    rpc('v39_kids_schedule_whatsapp_sent', { p: { staffId: staffId } }).then(function () { return carregarSalasEvento().then(voltarSalas); }).catch(function (e) { toast(traduz(e), true); });
  }
  function formSalaEvento(r) {
    modal('<h2>' + (r ? 'Ajustar ' + esc(r.nome) : 'Sala só deste culto') + '</h2>' + camposSala(r, !!r, true) +
      '<div class="gap"></div><button class="btn pr" data-k="salvarSalaEvento" data-v="' + esc(r ? r.id : '') + '">Salvar</button><div class="gap"></div><button class="btn gh" data-k="voltarSalasEvento">Voltar</button>');
  }
  function salvarSalaEvento(id) {
    var p = lerSala(); p.ministerioId = S.min; p.eventoId = SALA.ev; p.id = id || null;
    if (!p.nome || p.idadeMax === '') return toast('Informe o nome e a idade máxima.', true);
    rpc('v39_kids_event_room_save', { p: p }).then(function () { toast('Sala salva.'); return carregarSalasEvento().then(voltarSalas); }).catch(function (e) { toast(traduz(e), true); });
  }
  function formProfessores(salaId) {
    var r = (SALA.salas || []).filter(function (x) { return x.id === salaId; })[0]; if (!r) return;
    var eq = (U().membros && U().membros(S.min)) || [], marc = {};
    r.professores.forEach(function (x) { marc[x.pessoaId] = x.funcao; });
    eq = (Array.isArray(eq) ? eq : []).filter(function (x) { return x.status === 'active'; });
    modal('<h2>Professores · ' + esc(r.nome) + '</h2><div class="sb">Só quem está na equipe do Kids e tem acesso ao app. Esta lista é a escala da sala neste culto: cada professor novo recebe um aviso no app para confirmar.</div>' +
      '<div class="card" style="padding:4px 14px;margin-top:8px">' + (eq.length ? eq.map(function (x) {
        var dis = !x.temLogin;
        return '<div class="row" style="padding:7px 0;gap:8px' + (dis ? ';opacity:.5' : '') + '"><input type="checkbox" class="kp-sel" value="' + esc(x.pessoaId) + '"' + (marc[x.pessoaId] ? ' checked' : '') + (dis ? ' disabled' : '') + ' style="width:auto">' +
          '<div class="info"><div class="nm">' + esc(x.nome) + '</div><div class="sb">' + (dis ? 'sem acesso ao app' : '') + '</div></div>' +
          '<select class="kp-fun" data-p="' + esc(x.pessoaId) + '" style="width:auto"' + (dis ? ' disabled' : '') + '><option value="professor">professor</option><option value="auxiliar"' + (marc[x.pessoaId] === 'auxiliar' ? ' selected' : '') + '>auxiliar</option></select></div>';
      }).join('') : '<div class="empty">Abra a aba Equipe para carregar a equipe do Kids.</div>') + '</div>' +
      '<div class="gap"></div><button class="btn pr" data-k="salvarProfessores" data-v="' + esc(salaId) + '">Salvar</button><div class="gap"></div><button class="btn gh" data-k="voltarSalasEvento">Voltar</button>');
  }
  function salvarProfessores(salaId) {
    var prof = [].slice.call(document.querySelectorAll('.kp-sel:checked')).map(function (c) {
      var f = document.querySelector('.kp-fun[data-p="' + c.value + '"]'); return { pessoaId: c.value, funcao: f ? f.value : 'professor' }; });
    rpc('v39_kids_event_room_staff_set', { p: { ministerioId: S.min, salaId: salaId, professores: prof } })
      .then(function () { toast('Professores salvos.'); if (window.G2_ESCALA && G2_ESCALA.recarregar) G2_ESCALA.recarregar(); return carregarSalasEvento().then(voltarSalas); }).catch(function (e) { toast(traduz(e), true); });
  }
  function carregarSalasEvento() {
    if (!SALA.ev) return Promise.resolve();
    return rpc('v39_kids_event_rooms', { p_ministry_id: S.min, p_event_id: SALA.ev }).then(function (l) { SALA.salas = l || []; pintar(); }).catch(function () { SALA.salas = SALA.salas || []; });
  }
  function trocarSala(checkinId) {
    var x = ((SALA.board || {}).entradas || []).filter(function (e) { return e.id === checkinId; })[0]; if (!x) return;
    var l = (SALA.salas || []).filter(function (r) { return r.status === 'open'; });
    if (!l.length) return toast('Nenhuma sala aberta neste culto.', true);
    modal('<h2>Trocar sala · ' + esc(x.crianca) + '</h2><select id="kt-sala">' + l.map(function (r) { return '<option value="' + esc(r.id) + '"' + (r.id === x.salaId ? ' selected' : '') + '>' + esc(r.nome + ' · ' + faixa(r) + ' · ' + r.presentes + (r.capacidade ? '/' + r.capacidade : '')) + '</option>'; }).join('') + '</select>' +
      '<div class="gap"></div><button class="btn pr" data-k="confirmarTrocaSala" data-v="' + esc(checkinId) + '">Trocar</button><div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
  }
  function confirmarTrocaSala(checkinId) {
    rpc('v39_kids_checkin_move', { p: { ministerioId: S.min, checkinId: checkinId, salaId: $('kt-sala').value } })
      .then(function (r) { fechar(); toast('Agora na sala ' + (r && r.sala || '') + '.'); carregarSala({ id: S.min }, true); }).catch(function (e) { toast(traduz(e), true); });
  }

  /* ═════════ KIDS-5: vínculos no cadastro de pessoas (app.js chama G2_KIDS.blocoVinculos) ═════════ */
  var PAPEL_VIN = { responsavel: 'Responsável', crianca: 'Criança sob responsabilidade', outro: 'Outro familiar' };
  K.blocoVinculos = function (pessoaId) {
    if (!/^[0-9a-f-]{36}$/i.test(String(pessoaId || '')) || !U()) return '';
    setTimeout(function () { carregarVinculos(pessoaId); }, 0);
    return '<div class="sec">Família (vínculos)</div><div class="card" id="kvin-' + esc(pessoaId) + '"><div class="sb">Carregando…</div></div>';
  };
  function carregarVinculos(pessoaId) {
    rpc('v39_family_links', { p_person_id: pessoaId }).then(function (r) {
      var el = $('kvin-' + pessoaId); if (!el) return;
      var l = []; ((r && r.nucleos) || []).forEach(function (n) { (n.membros || []).forEach(function (x) { if (!x.euMesmo) l.push(x); }); });
      el.innerHTML = (l.length ? l.map(function (x) {
        return '<div class="row" style="padding:7px 0;gap:8px"><div class="info"><div class="nm">' + esc(x.nome) + (x.idade != null ? ' <span class="sb">' + x.idade + ' anos</span>' : '') + '</div>' +
          '<div class="sb">' + esc(x.parentesco || 'parentesco não informado') + ' · ' + esc(PAPEL_VIN[x.papel] || x.papel) + (x.podeRetirar ? ' · pode retirar no Kids' : '') + '</div></div>' +
          (r.podeEditar ? '<button class="btn gh sm" data-k="desvincular" data-v="' + esc(x.id) + '" data-p="' + esc(pessoaId) + '">Desvincular</button>' : '') + '</div>';
      }).join('') : '<div class="sb" style="padding:6px 0">Nenhum vínculo.</div>') +
        (r && r.podeEditar ? '<div class="gap"></div><button class="btn gh sm" data-k="addVinculoPessoa" data-v="' + esc(pessoaId) + '">+ Vincular familiar</button>' : '');
    }).catch(function () { var el = $('kvin-' + pessoaId); if (el) el.innerHTML = '<div class="sb">Sem acesso aos vínculos.</div>'; });
  }
  function formVinculoPessoa(pessoaId) {
    S.formVin = { pessoaId: pessoaId, vinId: null, html: (document.getElementById('modal') || {}).innerHTML };
    var html = '<div id="kvp" class="card" style="padding:10px 14px;margin-top:8px"><b>Vincular familiar</b>' +
      '<input id="kvp-q" data-k-local="1" placeholder="Nome da pessoa" autocomplete="off" style="margin-top:6px"><div id="kvp-res"></div><div id="kvp-sel" class="sb" style="margin:6px 0">Ninguém escolhido.</div>' +
      '<div class="g2"><div><label>Ele(a) é</label>' + selectParentesco('kvp-par', 'todos') + '</div><div><label>Papel</label><select id="kvp-papel"><option value="outro">Outro familiar</option>' +
      '<option value="responsavel">Responsável</option><option value="crianca">Criança sob responsabilidade</option></select></div></div>' +
      '<label><input type="checkbox" id="kvp-ret" style="width:auto;margin-right:6px">Pode retirar criança no Kids (mais de 12 anos)</label>' +
      '<div class="gap"></div><button class="btn pr sm" data-k="salvarVinculoPessoa">Salvar vínculo</button></div>';
    var el = $('kvin-' + pessoaId); if (el) el.insertAdjacentHTML('beforeend', html);
  }
  function buscarLocal(q) {
    var res = $('kvp-res'); if (!res) return;
    q = String(q || '').trim().toLowerCase(); if (q.length < 2) { res.innerHTML = ''; return; }
    var g = window.__gc || {}, l = (g.pessoas ? g.pessoas() : []).filter(function (p) { return /^[0-9a-f-]{36}$/i.test(String(p.id)) && p.id !== S.formVin.pessoaId && String(p.nome || '').toLowerCase().indexOf(q) >= 0; }).slice(0, 15);
    res.innerHTML = l.length ? l.map(function (p) { return '<div class="row cl" data-k="escolherLocal" data-v="' + esc(p.id) + '" data-nome="' + esc(p.nome) + '" style="cursor:pointer;padding:6px 0"><div class="info"><div class="nm">' + esc(p.nome) + '</div></div></div>'; }).join('')
      : '<div class="sb">Ninguém com esse nome.</div>';
  }
  function salvarVinculoPessoa() {
    var F = S.formVin || {}; if (!F.vinId) return toast('Escolha a pessoa.', true);
    var p = { pessoaId: F.pessoaId, vinculadoId: F.vinId, parentescoVinculado: $('kvp-par').value || null, papelVinculado: $('kvp-papel').value, podeRetirar: !!$('kvp-ret').checked };
    rpc('v39_family_link_set', { p: p }).then(function () { toast('Vínculo salvo.'); carregarVinculos(F.pessoaId); S.lista = null; })
      .catch(function (e) { toast(traduz(e), true); });
  }
  function desvincular(id, t) {
    var motivo = window.prompt('Motivo para desfazer o vínculo:'); if (motivo === null) return;
    if (!motivo.trim()) return toast('Informe o motivo.', true);
    rpc('v39_family_link_end', { p: { id: id, motivo: motivo.trim() } }).then(function () { toast('Vínculo desfeito.'); carregarVinculos(t.getAttribute('data-p')); S.lista = null; })
      .catch(function (e) { toast(traduz(e), true); });
  }

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
      .then(function (b) { SALA.board = b; SALA.erro = ''; return carregarSalasEvento(); })
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
    var salasAb = (SALA.salas || []).filter(function (r) { return r.status === 'open'; });
    if (salasAb.length) h += '<div class="card" style="padding:6px 14px;margin:0 0 10px">' + salasAb.map(function (r) { return '<div class="row" style="padding:5px 0"><div class="info"><div class="nm">' + esc(r.nome) + ' <span class="sb">' + esc(faixa(r)) + (r.genero ? ' · ' + esc(GEN[r.genero]) : '') + '</span></div><div class="sb">' + (r.professores.length ? r.professores.map(function (x) { return esc(x.nome); }).join(', ') : 'sem professor') + '</div></div><b>' + r.presentes + (r.capacidade ? '/' + r.capacidade : '') + '</b></div>'; }).join('') + '</div>';
    h += '<div class="sb" style="margin:0 0 10px">Salas e professores deste culto: Agenda → Ajustar · salas e escala.</div>';   // KIDS-10: botão Salas deste culto saiu (fica na Agenda)
    if (b.evento.travado) h += '<div class="aviso">🔒 Evento travado (encerrado há mais de 24h).</div>';
    else h += '<div style="display:flex;gap:8px;flex-wrap:wrap">' + (b.evento.status === 'completed' ? '' : '<button class="btn pr" data-k="entrada">+ Dar entrada</button>') +
      '<button class="btn" data-k="retirarCodigo">Retirar com código</button><button class="btn gh" data-k="atualizarSala">Atualizar</button></div>';
    var pres = (b.entradas || []).filter(function (x) { return x.status === 'present'; }), sai = (b.entradas || []).filter(function (x) { return x.status === 'picked_up'; });
    h += '<div class="card" style="padding:4px 16px;margin-top:12px"><div style="font-weight:700;margin:8px 0 2px">Na sala (' + pres.length + ')</div>' +
      (pres.length ? pres.map(function (x) {
        return '<div style="padding:9px 0;border-bottom:1px solid var(--ln,#eceef1)"><div class="nm">' + esc(x.crianca) + ' <span class="sb">' + esc(x.idade) + ' anos</span> ' +
          (x.temAlergia ? pill('⚠ alergia', '#c0392b') : '') + (x.temRestricao ? ' ' + pill('restrição', '#c0392b') : '') + (x.situacao === 'visiting' ? ' ' + pill('visitante', '#2f6fd6') : '') + '</div>' +
          '<div class="sb">' + (x.sala ? '<b>' + esc(x.sala) + '</b>' : '<b style="color:#c99a1a">sem sala</b>') + ' · trouxe: ' + esc(x.trazidoPor) + ' · entrou ' + hora(x.entrada) + '</div>' +
          (fechado && b.evento.travado ? '' : '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap"><button class="btn gh sm" data-k="retirarFoto" data-v="' + esc(x.id) + '">Retirar sem código</button>' +
            '<button class="btn gh sm" data-k="trocarSala" data-v="' + esc(x.id) + '">Trocar sala</button><button class="btn gh sm" data-k="cancelarEntrada" data-v="' + esc(x.id) + '">Cancelar entrada</button></div>') + '</div>';
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
      ((SALA.salas || []).some(function (r) { return r.status === 'open'; }) ? '<label>Sala</label><select id="ke-sala"><option value="">Automática (idade e gênero, a menos cheia)</option>' +
        (SALA.salas || []).filter(function (r) { return r.status === 'open'; }).map(function (r) { return '<option value="' + esc(r.id) + '">' + esc(r.nome + ' · ' + faixa(r) + (r.genero ? ' · ' + GEN[r.genero] : '') + ' · ' + r.presentes + (r.capacidade ? '/' + r.capacidade : '')) + '</option>'; }).join('') + '</select>' : '') +
      (quem.length ? '<div class="gap"></div><button class="btn pr" data-k="confirmarEntrada">Confirmar entrada</button>' : '') +
      '<div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
  }
  function confirmarEntrada() {
    var F = S.form || {}, p = { ministerioId: S.min, eventoId: SALA.ev, criancaId: F.criancaId, trazidoPorId: ($('ke-trouxe') || {}).value };
    var c = $('ke-cod') && $('ke-cod').value.trim(); if (c) p.codigoFamilia = c;
    if ($('ke-sala') && $('ke-sala').value) p.salaId = $('ke-sala').value;
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
      '<div style="font-size:15px;margin-top:4px">' + (r.sala ? 'Levar para a sala <b>' + esc(r.sala) + '</b>' : '<b style="color:#c99a1a">Nenhuma sala compatível aberta: escolha uma em "Trocar sala".</b>') + '</div>' +
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
      '<div class="e"><div class="n">' + esc(r.crianca) + '</div><div class="s">' + (r.sala ? '<b>Sala: ' + esc(r.sala) + '</b><br>' : '') + culto + '<br>' + esc(quando) + ' · resp.: ' + esc(r.trazidoPor) + '</div>' +
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
        var ok = p.temFoto && (p.idade == null || p.idade >= 13);
        return '<label class="row" style="padding:6px 0;gap:10px;align-items:center;cursor:' + (ok ? 'pointer' : 'default') + '"><input type="radio" name="kr-por-' + esc(x.id) + '" value="' + esc(p.pessoaId) + '"' + (ok ? '' : ' disabled') + ' style="width:auto">' +
          foto({ pessoaId: p.pessoaId, temFoto: p.temFoto }, 64) + '<span><b>' + esc(p.nome) + '</b><br><span class="sb">' + (p.papel === 'responsavel' ? 'responsável' : 'autorizado') + (p.temFoto ? '' : ' · sem foto: não pode retirar') + (p.idade != null && p.idade < 13 ? ' · 12 anos ou menos: não pode retirar' : '') + '</span></span></label>';
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
    atualizarSala: function () { carregarSala({ id: S.min }, true); },
    novaCrianca: function () { if (S.lista === null) carregar({ id: S.min }, false); formNovaCrianca(null); },
    abrirCrianca: function (v) { S.crianca = v; pintar(); window.scrollTo(0, 0); },
    voltarCriancas: function () { S.crianca = null; S.aberta = null; pintar(); },
    escolherBase: function (v, t) { marcarEscolhido(t.getAttribute('data-campo'), v, t.getAttribute('data-nome')); },
    salvarNovaCrianca: salvarNovaCrianca,
    addVinculo: function (v) { formVinculoKids(v); },
    salvarVinculoKids: salvarVinculoKids,
    cadastrarVisitante: irCadastroVisitante,
    camCapturar: capturar, camTrocar: function () { CAM.frente = !CAM.frente; ligarCamera(); }, camGaleria: galeria,
    camFechar: function () { pararCamera(); CAM.pronto = null; fechar(); },
    novaSala: function () { formSala(null); },
    editarSala: function (v) { var r = (SALAS.lista || []).filter(function (x) { return x.id === v; })[0]; if (r) formSala(r); },
    salvarSala: salvarSala,
    salasEvento: function () { SALA.volta = null; carregarSalasEvento().then(formSalasEvento); },
    editarSalaEvento: function (v) { var r = (SALA.salas || []).filter(function (x) { return x.id === v; })[0]; if (r) formSalaEvento(r); },
    novaSalaEvento: function () { formSalaEvento(null); },
    salvarSalaEvento: salvarSalaEvento,
    voltarSalasEvento: voltarSalas,
    professoresSala: formProfessores,
    whatsEscala: whatsEscala,
    salvarProfessores: salvarProfessores,
    trocarSala: trocarSala,
    confirmarTrocaSala: confirmarTrocaSala,
    addVinculoPessoa: formVinculoPessoa,
    escolherLocal: function (v, t) { S.formVin.vinId = v; var s = $('kvp-sel'); if (s) s.innerHTML = 'Escolhido: <b>' + esc(t.getAttribute('data-nome')) + '</b>'; var r = $('kvp-res'); if (r) r.innerHTML = ''; },
    salvarVinculoPessoa: salvarVinculoPessoa,
    desvincular: desvincular
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
    else if (t.getAttribute('data-k-base')) buscarBase(t.getAttribute('data-k-base'), t.value);
    else if (t.getAttribute('data-k-data')) t.value = mascaraData(t.value);
    else if (t.getAttribute('data-k-local')) buscarLocal(t.value);
    else if (t.getAttribute('data-k-entrada')) { var q = t.value.trim().toLowerCase(), el = $('ke-lista');
      if (el) el.innerHTML = listaEntrada(criancasElegiveis().filter(function (x) { return !q || (x.p.nomeCompleto || x.p.nome).toLowerCase().indexOf(q) >= 0 || x.f.nome.toLowerCase().indexOf(q) >= 0; })); }
  });
  document.addEventListener('change', function (ev) {
    var t = ev.target; if (!t || !t.getAttribute || !t.getAttribute('data-k-evento')) return;
    SALA.ev = t.value; SALA.board = null; pintar();
  });

  K.tela = telaCriancas;   // KIDS-5: lista por criança (a tela por família saiu)
  K.telaSala = telaSala;
  K.telaSalas = telaSalas;
  K.resetar = function () { S.min = null; S.lista = null; S.aberta = null; };
  K._t = { traduz: traduz, tela: tela, fone: fone };
})();
