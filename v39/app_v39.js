
/* ═══════════════════════════════════════════════════════════════
   2GATHER · App (PWA)
   ═══════════════════════════════════════════════════════════════ */
function mostrarErro(msg, origem) {
  var el = document.getElementById('erro'); if (!el) return;
  el.style.display = 'block'; el.innerHTML = '';
  var t = document.createElement('div'); t.textContent = 'Erro no app: ' + msg + (origem ? ' (' + origem + ')' : ''); el.appendChild(t);
  var b = document.createElement('button'); b.textContent = 'Fechar'; b.onclick = function () { el.style.display = 'none'; }; el.appendChild(b);
}
window.onerror = function (m, u, l, c) { mostrarErro(m, 'linha ' + l); return false; };

(function () {
try {

var APP = window.APP_CONFIG || {};
var URL_PADRAO = APP.apiUrl || 'https://script.google.com/macros/s/AKfycbxKyZ1pzhXbWCK-6vtO2av2ip08yxSY8QbyYWfrTyvpRzoU52Rqj1z9jZ1o3o4xKaJYPA/exec';
var MODO_PWA = !!APP.apiUrl || String(location.pathname || '').indexOf('/v39/') === 0; // v39/Cloudflare: usa POST, nunca JSONP bloqueado pela CSP
var ICONE_2G = 'icons/icon-192.png';
// padrão antes da 1ª configuração: no app instalado (PWA) é o 2Gather; na página antiga, o logo embutido
var LOGO_PADRAO = (window.APP_CONFIG && window.APP_CONFIG.apiUrl) ? ICONE_2G : document.getElementById('h-img').getAttribute('src');
var LOGO = LOGO_PADRAO;        // ícone usado na barra superior e nas telas internas
var VERSAO_APP = 39;
var SERVIDOR_ESPERADO = 33;      // legado temporário para módulos ainda não migrados

/* ------------------- v39: Supabase / sessão ------------------- */
var V39 = window.V39_CONFIG || {};
var SB_URL = V39.supabaseUrl || APP.supabaseUrl || '';
var SB_ANON_KEY = String(V39.supabaseAnonKey || V39.supabaseKey || V39.publishableKey || APP.supabaseAnonKey || APP.supabaseKey || APP.publishableKey || '').trim();
var sb = null, sbSessao = null, sbContexto = null;
var V39_BUILD='39-person-version-conflict-20261031-18';
console.info('[2Gather v39]',V39_BUILD,'schema=app');
function sbDiagnostico(){return {url:!!SB_URL,key:!!SB_ANON_KEY,lib:!!(window.supabase&&typeof window.supabase.createClient==='function'),configOk:!!(window.V39_CONFIG_STATUS&&window.V39_CONFIG_STATUS.ok),host:location.hostname,path:location.pathname};}
function v39Ambiente(){return String(location.pathname||'').indexOf('/v39/')===0;}
function sbDisponivel(){var d=sbDiagnostico();return !!(d.url&&d.key&&d.lib&&d.configOk);}
function sbErroConfig(){var d=sbDiagnostico(),p=[];if(!d.url)p.push('Project URL');if(!d.key)p.push('Publishable Key');if(!d.lib)p.push('biblioteca Supabase JS bloqueada ou não carregada; verifique a CSP e lib/supabase.min.js');if(!d.configOk&&window.V39_CONFIG_STATUS)p=p.concat(window.V39_CONFIG_STATUS.errors||[]);return 'Configuração incompleta da v39: '+(p.length?p.join(' | '):'verifique config_v39.js')+'.';}
function sbCliente(){
  if(sb) return sb;
  if(!sbDisponivel()) throw new Error(sbErroConfig());
  sb=window.supabase.createClient(String(SB_URL).replace(/\/$/,''),SB_ANON_KEY,{db:{schema:'app'},auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  return sb;
}
function sbRpc(nome,args){return sbCliente().rpc(nome,args||{}).then(function(x){if(x.error)throw x.error;return x.data;});}
function v39Obj(v){
  if(v==null)return {};
  if(typeof v==='string'){
    try{return JSON.parse(v);}catch(e){return {};}
  }
  return v;
}
function v39Primeiro(v){
  v=v39Obj(v);
  if(Array.isArray(v))return v39Obj(v[0]||{});
  if(v&&Array.isArray(v.data))return v39Obj(v.data[0]||{});
  if(v&&v.data&&typeof v.data==='object')return v39Obj(v.data);
  return v||{};
}
function v39NormalizarContexto(valor){
  var x=v39Primeiro(valor);
  if(x.context)x=v39Primeiro(x.context);
  if(x.frontend_context)x=v39Primeiro(x.frontend_context);
  var conta=v39Primeiro(x.user_account||x.account||x.user||{});
  var pessoa=v39Primeiro(x.person||conta.person||{});
  var acessos=Array.isArray(x.church_accesses)?x.church_accesses:(Array.isArray(x.churches)?x.churches:[]);
  var acesso=v39Primeiro(x.active_church_access||x.church_user_access||x.access||{});
  var igrejaId=x.active_church_id||x.church_id||acesso.church_id||'';
  if(!acesso.id&&acessos.length){
    acesso=v39Primeiro(acessos.filter(function(a){return (a.church_id||a.id)===igrejaId;})[0]||acessos[0]);
    igrejaId=igrejaId||acesso.church_id||acesso.id||'';
  }
  var igreja=v39Primeiro(x.active_church||x.church||acesso.church||{});
  igrejaId=igrejaId||igreja.id||igreja.church_id||'';
  var perfis=Array.isArray(x.profiles)?x.profiles:(Array.isArray(x.access_profiles)?x.access_profiles:[]);
  if(!perfis.length&&Array.isArray(acesso.profiles))perfis=acesso.profiles;
  if(!perfis.length&&Array.isArray(acesso.access_profiles))perfis=acesso.access_profiles;
  var perfil=v39Obj(x.active_profile||x.primary_profile||x.profile||acesso.active_profile||acesso.primary_profile||acesso.profile||{});
  if(typeof perfil==='string')perfil={code:perfil};
  if(!perfil.code&&!perfil.profile_code&&!perfil.profile_key&&perfis.length){
    perfil=v39Primeiro(perfis.filter(function(p){return p.is_primary===true||p.primary===true;})[0]||perfis[0]);
  }
  if(!perfil.code&&!perfil.profile_code&&!perfil.profile_key){
    var codigo=x.active_profile_code||x.primary_profile_code||x.profile_code||x.profile_key||x.role||acesso.active_profile_code||acesso.primary_profile_code||acesso.profile_code||acesso.profile_key||acesso.role||'';
    if(codigo)perfil={code:codigo};
  }
  if(!perfil.code&&!perfil.profile_code&&!perfil.profile_key&&x.user){
    var xu=v39Primeiro(x.user);
    var ucodigo=xu.active_profile_code||xu.primary_profile_code||xu.profile_code||xu.profile_key||xu.role||'';
    if(ucodigo)perfil={code:ucodigo};
  }
  var permissoes=x.effective_permissions;
  if(permissoes==null)permissoes=x.permissions;
  if(permissoes==null)permissoes=x.perms;
  if(permissoes==null&&perfil)permissoes=perfil.permissions||perfil.perms;
  if(permissoes==null)permissoes=[];
  return {raw:x,conta:conta,pessoa:pessoa,acesso:acesso,igreja:igreja,igrejaId:igrejaId,perfil:perfil,permissoes:permissoes};
}
function sbValidarContexto(valor){
  var n=v39NormalizarContexto(valor),faltam=[];
  if(!(n.conta.id||n.conta.user_account_id||n.raw.user_account_id))faltam.push('conta');
  if(!(n.pessoa.id||n.conta.person_id||n.raw.person_id))faltam.push('pessoa');
  if(!n.igrejaId)faltam.push('igreja ativa');
  if(!(n.perfil.code||n.perfil.profile_code||n.perfil.profile_key||n.raw.active_profile_code||n.raw.profile_code||n.raw.profile_key||n.raw.role))faltam.push('perfil');
  /* permissions pode legitimamente ser [] ou {}, portanto validamos presença normalizada, não quantidade */
  if(n.permissoes==null)faltam.push('permissões');
  if(faltam.length){console.error('[v39 contexto bruto]',valor);console.error('[v39 perfil diagnostico]',{profiles:n.raw.profiles,access_profiles:n.raw.access_profiles,user:n.raw.user,churches:n.raw.churches,access:n.acesso});throw new Error('Contexto de acesso incompleto: '+faltam.join(', ')+'.');}
  return n;
}
function sbCarregarContexto(){
  return sbRpc('get_my_frontend_context',{}).then(function(valor){
    var n=sbValidarContexto(valor);sbContexto=n.raw;return n;
  });
}
/* v39: ponte estrita entre codigos do Supabase e capacidades legadas da interface v38.
   A ponte apenas libera a navegacao da UI. O banco/RPC/RLS continua sendo a fonte de verdade. */
function v39MapaPermissoes(permissoes){
  var raw={}, compat={};
  if(Array.isArray(permissoes)) permissoes.forEach(function(pr){
    if(typeof pr==='string'){raw[pr]=true;return;}
    pr=pr||{};var cod=pr.code||pr.permission_code||pr.permission||pr.codigo;
    if(cod) raw[cod]=pr.allowed!==false&&pr.effect!=='deny';
  });
  else if(permissoes&&typeof permissoes==='object') Object.keys(permissoes).forEach(function(k){raw[k]=permissoes[k]===true||permissoes[k]==='allow';});
  function any(codes){return codes.some(function(c){return raw[c]===true;});}
  /* Ponte Supabase -> chaves legadas da interface. A UI nunca amplia acesso: cada chave depende de uma permissão efetiva. */
  compat.usuarios=any(['access.view','access.user.view','access.request.view']);
  compat.consulta=any(['people.view']);
  compat.visitantes=any(['people.create','people.update']);
  compat.rede=any(['gcs.view','gcs.create','gcs.update','gcs.assignments.manage','gcs.manage_memberships']);
  compat.gc=any(['gcs.view','gcs.meetings.view','gcs.attendance.manage','gcs.manage_memberships']);
  compat.gcEvento=any(['gcs.meetings.create','gcs.meetings.update','gcs.financial.report']);
  compat.eventos=any(['events.view','events.create','events.update','events.participants.manage']);
  compat.financeiro=any(['financial.book.view','financial.movements.create','financial.expenses.create','events.financial.report','gcs.financial.report']);
  compat.relFin=any(['financial.reports.view','financial.audit','financial.export','financial.reports.export']);
  compat.cursos=any(['general_meetings.view','general_meetings.create','general_meetings.update','general_meetings.attendance.manage']);
  compat.instituto=any(['institute.view','institute.courses.manage','institute.offerings.manage','institute.enrollments.manage','institute.attendance.manage']);
  compat.institutoAdmin=any(['institute.courses.manage','institute.offerings.manage','institute.enrollments.manage']);
  compat.institutoCursos=any(['institute.view','institute.courses.manage','institute.offerings.manage','institute.enrollments.manage']);
  compat.recados=any(['communication.announcements.view','communication.announcements.manage','communication.wall.view','communication.wall.manage','communication.notifications.manage']);
  compat.config=any(['settings.view','settings.manage','church.settings.view','church.settings.manage','access.manage']);
  compat.lvDirecionar=any(['life_home.view','life_home.manage','life_home.journeys.manage','people.update']);
  compat.lvLiberar=any(['life_home.manage','life_home.houses.manage']);
  compat.lvVisitas=any(['life_home.view','life_home.visits.manage']);
  compat.agendaPastoral=any(['pastoral.agenda.view','pastoral.agenda.manage','institute.health.view']);
  compat.prontuario=any(['health.records.view','health.records.manage','institute.health.records.view']);
  compat.pacienteNomes=any(['health.patient_names.view','institute.health.patient_names.view']);
  compat.instMercado=any(['institute.market.manage','institute.inventory.market.manage']);
  compat.instFarmacia=any(['institute.pharmacy.manage','institute.inventory.pharmacy.manage']);
  return {raw:raw,compat:compat};
}
function v39TemPermissao(codigo){var u=eu();return !!(u&&u.rawPerms&&u.rawPerms[codigo]);}
function v39PodeVerUsuarios(){return v39TemPermissao('access.view')||v39TemPermissao('access.user.view');}
function v39PodeVerSolicitacoes(){return v39TemPermissao('access.request.view');}
function v39PodeAprovarSolicitacoes(){return v39TemPermissao('access.request.approve');}
function v39PodeAlterarPerfil(){return v39TemPermissao('access.user.change_profile');}
function v39PodeSuspender(){return v39TemPermissao('access.user.suspend');}
function v39PodeSuspenderGlobal(){return v39TemPermissao('access.user.suspend_global');}
function v39PodeReativar(){return v39TemPermissao('access.user.reactivate');}
function v39PodeCorrigirLogin(){return v39TemPermissao('auth.user.correct_login');}
function v39PodeRedefinirSenha(){return v39TemPermissao('auth.user.reset_password');}
window.__2GATHER_PERMISSIONS=function(){var u=eu()||{};return {build:V39_BUILD,papel:u.papel||'',raw:Object.assign({},u.rawPerms||{}),compat:Object.assign({},u.perms||{}),acoes:{verUsuarios:v39PodeVerUsuarios(),verSolicitacoes:v39PodeVerSolicitacoes(),aprovar:v39PodeAprovarSolicitacoes(),alterarPerfil:v39PodeAlterarPerfil(),suspender:v39PodeSuspender(),suspenderGlobal:v39PodeSuspenderGlobal(),reativar:v39PodeReativar(),corrigirLogin:v39PodeCorrigirLogin(),redefinirSenha:v39PodeRedefinirSenha()}};};
function sbAplicarContexto(valor){
  var n=(valor&&valor.raw&&valor.conta)?valor:sbValidarContexto(valor),x=n.raw,u=n.conta,p=n.pessoa,i=n.igreja,pr=n.perfil;
  var mapasPerm=(typeof v39MapaPermissoes==='function')?v39MapaPermissoes(n.permissoes):{raw:n.permissoes||{},compat:n.permissoes||{}};
  cfg.usuario={id:u.id||u.user_account_id||x.user_account_id||'',pessoaId:p.id||u.person_id||x.person_id||'',nome:p.preferred_name||p.full_name||p.name||u.username||'',usuario:u.username||u.login||x.username||'',email:u.email||(sbSessao&&sbSessao.user&&sbSessao.user.email)||'',papel:pr.code||pr.profile_code||pr.profile_key||x.active_profile_code||x.profile_code||x.profile_key||x.role||'',perms:mapasPerm.compat||{},rawPerms:mapasPerm.raw||{},_v39:true,gcId:x.growth_group_id||x.gc_id||'',consent:x.consent!==false};
  cfg.activeChurchId=n.igrejaId;cfg.igrejaNome=i.name||i.church_name||x.church_name||cfg.igrejaNome||'';cfg.token=(sbSessao&&sbSessao.access_token)||'supabase-session';cfg.ultima=agora();salvarCfg();return x;
}

function sbRestaurarSessao(){return sbCliente().auth.getSession().then(function(x){if(x.error)throw x.error;sbSessao=x.data&&x.data.session;if(!sbSessao)return false;return sbCarregarContexto().then(sbAplicarContexto).then(function(){return true;});});}
function sbEntrar(email,senha){return sbCliente().auth.signInWithPassword({email:email,password:senha}).then(function(x){if(x.error)throw x.error;sbSessao=x.data&&x.data.session;if(!sbSessao)throw new Error('O Supabase não retornou uma sessão válida.');return sbCarregarContexto().then(sbAplicarContexto);});}
function sbSair(){v39ProntuarioLimparChave();if(!sb)return Promise.resolve();return sbCliente().auth.signOut().then(function(x){if(x.error)throw x.error;sbSessao=null;sbContexto=null;});}
function sbDefinirIgreja(id){if(!id)return Promise.reject(new Error('Selecione uma igreja.'));return sbRpc('set_active_church',{p_church_id:id}).then(function(){return sbCarregarContexto().then(sbAplicarContexto);});}
function v39TrocarSenhaAtual(senhaAtual,novaSenha){var email=(sbSessao&&sbSessao.user&&sbSessao.user.email)||eu().email;if(!email)return Promise.reject(new Error('E-mail da conta não disponível.'));return sbCliente().auth.signInWithPassword({email:email,password:senhaAtual}).then(function(r){if(r.error)throw new Error('Senha atual inválida.');return sbCliente().auth.updateUser({password:novaSenha});}).then(function(r){if(r.error)throw r.error;return r.data;});}
function v39SairTodosProprios(){return sbCliente().auth.signOut({scope:'global'});}
function v39SolicitarReset(identifier){return sbRpc('edge_request_password_reset',{p_identifier:identifier,p_fingerprint:'frontend_v39'});}
function v39CadastroIgrejaId(){return V39.churchId||APP.churchId||'';}
function v39CadastrarAcesso(d,senha){var church=v39CadastroIgrejaId();if(!church)return Promise.reject(new Error('Igreja da v39 não configurada.'));return sbCliente().auth.signUp({email:d.email,password:senha,options:{data:{full_name:d.nome,username:d.usuario}}}).then(function(r){if(r.error)throw r.error;if(!r.data||!r.data.user)throw new Error('Supabase não retornou o usuário do cadastro.');return sbRpc('v39_submit_access_request',{p_church_id:church,p_username:d.usuario,p_full_name:d.nome,p_email:d.email,p_phone:d.fone||null,p_requested_profile_code:d.papel||null,p_requested_gc_id:d.gcId||null,p_notes:d.obs||null});});}
function v39AprovarSolicitacao(id,perfil,motivo){return sbRpc('v39_approve_access_request',{p_request_id:id,p_profile_code:perfil,p_reason:motivo||'Aprovado na v39'});}
function v39EncerrarSessoesUsuario(id){return sbRpc('v39_revoke_other_user_sessions',{p_user_account_id:id});}
function v39ListarGCsPublicos(){return sbRpc(V39.publicGrowthGroupsRpc||'v39_public_growth_groups',{p_church_id:v39CadastroIgrejaId()});}
function v39PoliticaPublica(){return sbRpc(V39.publicPrivacyPolicyRpc||'v39_get_public_privacy_policy',{p_church_id:v39CadastroIgrejaId()});}
function v39TratarFalhaBoot(e){console.error('[2Gather v39 boot]',e);limparSessao();mostrarTela('s-login');erroEm('l-erro',(e&&e.message)||'Não foi possível carregar sua sessão.');}
function v39CarregarEssencial(){return Promise.all([v39ConfigCarregar(),v39ListarPessoas(),v39ListarGCs()]);}
function v39CarregarSecundario(){
  var tarefas=[['encontros',v39CarregarEncontros],['cultos',v39ListarCultos],['financeiro',function(){return v39FinCarregar(null,null);}],['lar de vida',v39LvListar],['instituto',v39InstCarregar],['acessos',v39CarregarAcessos],['reuniões',v39ReunCarregar],['comunicação',v39ComCarregar]];
  return Promise.all(tarefas.map(function(t){return Promise.resolve().then(t[1]).catch(function(e){console.warn('[v39 '+t[0]+'] '+((e&&e.message)||'erro')+' | code='+((e&&e.code)||'-')+' | details='+((e&&e.details)||'-')+' | hint='+((e&&e.hint)||'-'));return null;});})).then(function(){if(cfg.token)render();});
}
function v39AbrirApp(){return v39CarregarEssencial().then(function(){iniciarApp();setTimeout(v39CarregarSecundario,0);});}
function v39ObservarAuth(){
  return sbCliente().auth.onAuthStateChange(function(event,session){
    sbSessao=session||null;
    if(event==='SIGNED_OUT'||!session){if(cfg.token){limparSessao();mostrarTela('s-login');}return;}
    if(event==='TOKEN_REFRESHED'){cfg.token=session.access_token||'supabase-session';salvarCfg();return;}
    if((event==='USER_UPDATED'||event==='PASSWORD_RECOVERY')&&cfg.token){sbCarregarContexto().then(sbAplicarContexto).then(function(){render();}).catch(v39TratarFalhaBoot);}
  });
}
/* ------------------- v39: Fotos / Arquivos ------------------- */
function v39FotoPessoa(personId){return sbRpc('get_person_photo',{p_church_id:v39ChurchId(),p_person_id:personId});}
function v39RegistrarFotoPessoa(personId,storagePath,originalName,mimeType,sizeBytes){return sbRpc('register_person_photo',{p_church_id:v39ChurchId(),p_person_id:personId,p_storage_path:storagePath,p_original_file_name:originalName||null,p_mime_type:mimeType||null,p_size_bytes:sizeBytes||null});}
function v39RegistrarArquivo(repositoryId,storagePath,originalName,mimeType,sizeBytes,entityType,entityId){return sbRpc('register_file_metadata',{p_church_id:v39ChurchId(),p_repository_id:repositoryId,p_storage_path:storagePath,p_original_file_name:originalName,p_mime_type:mimeType||null,p_size_bytes:sizeBytes||null,p_entity_type:entityType||null,p_entity_id:entityId||null});}
function v39BlobDeDataUrl(dataUrl){var a=String(dataUrl||'').split(','),m=(a[0].match(/data:([^;]+)/)||[])[1]||'application/octet-stream',bin=atob(a[1]||''),u=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return new Blob([u],{type:m});}
function v39NomeSeguro(nome){return String(nome||'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120)||'arquivo';}
function v39StoragePath(categoria,nome){return v39ChurchId()+'/'+categoria+'/'+Date.now()+'-'+String(Math.random()).slice(2,10)+'-'+v39NomeSeguro(nome);}
function v39UploadBlob(bucket,path,blob){return sbCliente().storage.from(bucket).upload(path,blob,{cacheControl:'3600',upsert:false,contentType:blob.type}).then(function(r){if(r.error)throw r.error;return {bucket:bucket,path:path,size:blob.size,mime:blob.type};});}
function v39UrlAssinada(bucket,path,segundos){return sbCliente().storage.from(bucket).createSignedUrl(path,segundos||3600).then(function(r){if(r.error)throw r.error;return r.data.signedUrl;});}
function v39UploadDataUrl(bucket,categoria,dataUrl,nome){var blob=v39BlobDeDataUrl(dataUrl),path=v39StoragePath(categoria,nome);return v39UploadBlob(bucket,path,blob);}
function v39RepositorioPorTipo(tipo){return v39Repositorios().then(function(xs){return (xs||[]).filter(function(x){return x.repository_type===tipo||x.code===tipo||x.name===tipo;})[0]||null;});}
function v39UploadReceitaPrivada(personId,dataUrl,nome){return v39UploadDataUrl('2gather-private','pharmacy/prescriptions/'+personId,dataUrl,nome||'receita.jpg').then(function(up){return v39RepositorioPorTipo('private').then(function(repo){if(!repo)throw new Error('Repositório privado não configurado.');return v39RegistrarArquivo(repo.id,up.path,nome||'receita.jpg',up.mime,up.size,'pharmacy_prescription',null).then(function(file){return {upload:up,file:file};});});});}
function v39Arquivos(){return sbCliente().schema('app').from('files').select('*').eq('church_id',v39ChurchId()).then(function(r){if(r.error)throw r.error;return r.data||[];});}
function v39Repositorios(){return sbCliente().schema('app').from('file_repositories').select('*').eq('church_id',v39ChurchId()).then(function(r){if(r.error)throw r.error;return r.data||[];});}

/* ------------------- v39: LGPD / Auditoria ------------------- */
function v39Consentimentos(personId){return sbRpc('get_person_consents',{p_church_id:v39ChurchId(),p_person_id:personId});}
function v39RegistrarConsentimento(personId,purposeId,status,reason){return sbRpc('record_person_consent',{p_church_id:v39ChurchId(),p_person_id:personId,p_purpose_id:purposeId,p_status:status,p_reason:reason||'frontend_v39'});}
function v39RevogarConsentimento(consentId,reason){return sbRpc('revoke_person_consent',{p_consent_id:consentId,p_reason:reason||'Revogado no frontend v39'});}
function v39RegistrarEvento(action,detail,entityType,entityId){return sbRpc('record_operational_event',{p_church_id:v39ChurchId(),p_action:action,p_entity_type:entityType||null,p_entity_id:entityId||null,p_reason:detail||null,p_metadata:{source:'frontend_v39'}});}
function v39Auditoria(filtro){if(!sbDisponivel()||!v39ChurchId())return Promise.reject(new Error('Supabase indisponível'));var q=sbCliente().schema('app').from('operational_event_history').select('*',{count:'exact'}).eq('church_id',v39ChurchId()).order('occurred_at',{ascending:false}).limit(500);return q.then(function(r){if(r.error)throw r.error;var itens=(r.data||[]).map(function(x){return{usuario:(x.metadata&&x.metadata.username)||x.performed_by_user_account_id||'',acao:x.action||'',detalhe:x.reason||(x.metadata&&x.metadata.detail)||'',data:x.occurred_at||''};});if(filtro){var f=String(filtro).toLowerCase();itens=itens.filter(function(x){return(JSON.stringify(x).toLowerCase().indexOf(f)>=0);});}return{total:r.count==null?itens.length:r.count,itens:itens};});}

/* ------------------- v39: Configurações ------------------- */
var v39Settings={church:{},lifeHome:null,financial:null,loaded:false};
function v39AceitarPolitica(){return sbRpc('v39_accept_privacy_policy',{p_church_id:v39ChurchId(),p_person_id:eu().pessoaId,p_term_version:String((igr.config&&igr.config.politicaV)||'v39'),p_term_snapshot:(igr.config&&igr.config.politicaTexto)||null});}
function v39SolicitarAnonimizacao(personId,reason){return sbRpc('v39_request_person_anonymization',{p_church_id:v39ChurchId(),p_person_id:personId,p_reason:reason});}
function v39ChecarPessoa(q){return sbRpc('v39_check_person_duplicate',{p_church_id:v39ChurchId(),p_query:[q.nome,q.fone,q.nasc].filter(Boolean).join(' ')}).then(function(r){return {itens:v39Itens(r)};});}
function v39RegistrarVisitaIgreja(personId,date){return sbRpc('v39_record_church_visit',{p_church_id:v39ChurchId(),p_person_id:personId,p_visit_date:date,p_source:'frontend_v39'});}
function v39ListarBairros(city){return sbRpc('v39_list_neighborhoods',{p_church_id:v39ChurchId(),p_city:city||null});}
function v39SalvarAgendaSaude(d){var hs=d.horarios||[];var ops=hs.map(function(h){return sbRpc('v39_save_health_agenda',{p_church_id:v39ChurchId(),p_agenda_id:hs.length===1?d.id||null:null,p_payload:{professional_id:d.profissionalId,weekday:h.dow,starts_at:h.ini,ends_at:h.fim,slot_minutes:d.duracaoMin||30,location_text:d.local||null,status:d.deleted?'inactive':(d.ativa===false?'inactive':'active')}});});return Promise.all(ops);}
function v39MsgDestinatarios(e){var scope=e.gcId?'growth_group':'church';return sbRpc('v39_message_recipients',{p_church_id:v39ChurchId(),p_scope:scope,p_scope_id:e.gcId||null}).then(function(xs){var itens=v39Itens(xs).map(function(x){return{id:x.person_id,nome:x.name||'',apelido:'',fone:String(x.phone||'').replace(/\D/g,''),email:x.email||''};}).filter(function(x){return x.fone;});return {itens:itens,api:false};});}
function v39FilaMensagem(e){var rec=(msgLista||[]).map(function(p){return{person_id:p.id,address:p.fone};});return sbRpc('v39_queue_outbound_messages',{p_church_id:v39ChurchId(),p_channel_type:'whatsapp',p_subject:e.titulo||null,p_body:e.msgTexto||e.titulo||'',p_recipients:rec,p_source_type:'worship_service',p_source_id:e.id||null});}
function v39MarcarFila(batchId,status){return sbRpc('v39_mark_outbound_batch',{p_church_id:v39ChurchId(),p_batch_id:batchId,p_status:status,p_provider_message_id:null,p_failure_reason:null});}
function v39ConfigCarregar(){if(!sbDisponivel()||!v39ChurchId())return Promise.resolve(v39Settings);return Promise.all([sbCliente().schema('app').from('church_settings').select('*').eq('church_id',v39ChurchId()).eq('is_active',true),sbCliente().schema('app').from('life_home_settings').select('*').eq('church_id',v39ChurchId()).eq('is_active',true),sbCliente().schema('app').from('financial_settings').select('*').eq('church_id',v39ChurchId()).eq('is_active',true)]).then(function(r){r.forEach(function(x){if(x.error)throw x.error;});var c={};(r[0].data||[]).forEach(function(x){c[x.setting_key]=x.setting_value;});v39Settings.church=c;v39Settings.lifeHome=(r[1].data||[])[0]||null;v39Settings.financial=(r[2].data||[])[0]||null;v39Settings.loaded=true;igr.config=Object.assign({},igr.config||{},c);salvarIgr();return v39Settings;});}
function v39ConfigSalvar(c){var rows=Object.keys(c||{}).filter(function(k){return k!=='logo'&&k!=='icone'&&k!=='favicon'&&k.charAt(0)!=='_';}).map(function(k){return{church_id:v39ChurchId(),setting_key:k,setting_value:c[k]===undefined?null:c[k],value_type:Array.isArray(c[k])?'array':(c[k]===null?'null':typeof c[k]),is_active:true,updated_by_user_account_id:eu().id};});if(!rows.length)return Promise.resolve({config:c});return sbCliente().schema('app').from('church_settings').upsert(rows,{onConflict:'church_id,setting_key'}).select().then(function(r){if(r.error)throw r.error;return{config:c};});}

/* ------------------- v39: Comunicação / Avisos / Notificações ------------------- */
var v39Com={announcements:[],notifications:[],outbound:[],privateMessages:[],channels:[],prayers:[],loaded:false};
var v39Restritos=[];
/* v39: leitura direta tolerante SOMENTE a 'permission denied' (42501/403). Outros erros continuam sendo lancados.
   Tabelas sensiveis (mensagens privadas, matriculas, envios externos etc.) ficam sem GRANT ate a policy definitiva. */
function v39Tolerante(tabela,builder){
  return Promise.resolve(builder).then(function(x){
    if(x&&x.error&&(x.error.code==='42501'||x.status===403)){
      if(v39Restritos.indexOf(tabela)<0)v39Restritos.push(tabela);
      console.warn('[v39] acesso direto negado (esperado ate a policy definitiva): app.'+tabela);
      return {data:[],error:null,restrito:true};
    }
    return x;
  });
}
window.__2GATHER_RESTRITOS=function(){return v39Restritos.slice();};
function v39ComSel(table){return v39Tolerante(table,sbCliente().schema('app').from(table).select('*').eq('church_id',v39ChurchId()));}
function v39ComCarregar(){if(!sbDisponivel()||!v39ChurchId())return Promise.resolve(v39Com);var uid=eu().id||null;return Promise.all([v39ComSel('announcements'),v39ComSel('notifications'),v39ComSel('outbound_messages'),v39ComSel('communication_channels'),v39ComSel('prayer_requests'),v39Tolerante('private_messages',sbCliente().schema('app').from('private_messages').select('*'))]).then(function(r){r.forEach(function(x){if(x.error)throw x.error;});v39Com.announcements=r[0].data||[];v39Com.notifications=(r[1].data||[]).filter(function(n){return !uid||!n.user_account_id||n.user_account_id===uid;});v39Com.outbound=r[2].data||[];v39Com.channels=r[3].data||[];v39Com.prayers=r[4].data||[];v39Com.privateMessages=r[5].data||[];v39Com.loaded=true;db.alertas=v39Com.notifications.map(function(n){return{id:n.id,mensagem:n.body||n.title||'',titulo:n.title||'',lido:n.status==='read'||!!n.read_at,gcId:(n.metadata&&n.metadata.gc_id)||'',criadoEm:n.created_at||'',criadoPor:(n.metadata&&n.metadata.created_by_name)||'',prioridade:n.priority||'',_v39:true};});salvarDB();return v39Com;});}
function v39MarcarNotificacaoLida(id){var now=new Date().toISOString();return sbCliente().schema('app').from('notifications').update({status:'read',read_at:now}).eq('id',id).eq('user_account_id',eu().id).select('id');}

/* ------------------- v39: Treinamentos / Reuniões ------------------- */
var v39Reun={meetings:[],participants:[],loaded:false};
function v39Reuniao(x){return{id:x.id,tipo:x.meeting_type||'',titulo:x.title||'',tema:x.theme||'',descricao:x.description||'',local:x.location_text||'',responsavelId:x.responsible_person_id||'',inicioISO:x.starts_at||'',fimISO:x.ends_at||'',material:x.materials_reference||'',obs:x.notes||'',status:x.status||'',updatedAt:x.updated_at||'',data:(x.starts_at||'').slice(0,10),inicio:(x.starts_at||'').slice(11,16),fim:(x.ends_at||'').slice(11,16),participantes:[],_v39:true};}
function v39PayloadReuniao(d){
  var data=d.data||'', start=data+(d.inicio?'T'+d.inicio+':00':'T00:00:00'), end=data+(d.fim?'T'+d.fim+':00':'T23:59:59');
  return {meeting_type:d.tipo||d.modulo||'training',title:d.titulo||'',theme:d.tema||null,description:d.descricao||null,location_text:d.local||null,responsible_person_id:d.responsavelId||null,starts_at:start,ends_at:end,materials_reference:d.material||null,notes:d.obs||null,status:d.status||'scheduled'};
}
function v39SalvarReuniao(d){return sbRpc('save_general_meeting',{p_church_id:v39ChurchId(),p_general_meeting_id:d.id||null,p_payload:v39PayloadReuniao(d),p_reason:'frontend_v39'}).then(v39Reuniao);}
function v39SalvarParticipantesReuniao(id,itens){return sbRpc('save_general_meeting_participants',{p_general_meeting_id:id,p_items:itens||[],p_reason:'frontend_v39'});}
function v39ReunCarregar(){if(!sbDisponivel()||!v39ChurchId())return Promise.resolve(v39Reun);return Promise.all([sbCliente().schema('app').from('general_meetings').select('*').eq('church_id',v39ChurchId()),sbCliente().schema('app').from('general_meeting_participants').select('*')]).then(function(r){r.forEach(function(x){if(x.error)throw x.error;});var ms=(r[0].data||[]).map(v39Reuniao), ps=r[1].data||[], by={};ps.forEach(function(x){(by[x.general_meeting_id]=by[x.general_meeting_id]||[]).push({id:x.id,chave:x.person_id,pessoaId:x.person_id,papel:x.participation_role||'',status:x.attendance_status||'',obs:x.notes||''});});ms.forEach(function(m){m.participantes=by[m.id]||[];});v39Reun.meetings=ms;v39Reun.participants=ps;v39Reun.loaded=true;db.reunioes=ms;db.aulas=ms.map(function(m){var pres={};m.participantes.forEach(function(x){if(x.status)pres[x.pessoaId]=x.status==='present'?'P':x.status==='justified'?'J':x.status==='absent'?'F':x.status;});return{id:m.id,reuniaoId:m.id,data:m.data,inicio:m.inicio,presencas:pres,tema:m.tema,obs:m.obs,_v39:true};});salvarDB();return v39Reun;});}

/* ------------------- v39: Mercado / Farmácia Solidária ------------------- */
function v39EstSelect(tabela){return sbCliente().schema('app').from(tabela).select('*').eq('church_id',v39ChurchId());}
function v39EstProduto(x){return{id:x.id,codigo:x.code||x.product_code||'',nome:x.name||'',apresentacao:x.presentation||'',categoria:x.category_name||x.category||'',unidade:x.unit||x.unit_code||'un',ativa:x.is_active!==false,minimo:+(x.minimum_stock||x.min_stock||0),disponivel:+(x.available_quantity||x.quantity_available||x.current_stock||0),vencido:+(x.expired_quantity||0),vence30:+(x.expiring_30_days_quantity||0),usaFefo:x.uses_fefo===true,_raw:x};}
function v39EstDados(tipo){
  if(!sbDisponivel()||!v39ChurchId())return Promise.reject(new Error('Supabase indisponível'));
  var farmacia=tipo==='farmacia';
  var entregas=farmacia?'pharmacy_deliveries':'solidarity_deliveries';
  return Promise.all([v39EstSelect('solidarity_products'),v39EstSelect('solidarity_inventory_lots'),v39EstSelect('solidarity_inventory_movements'),v39EstSelect(entregas)]).then(function(r){r.forEach(function(x){if(x.error)throw x.error;});return{produtos:(r[0].data||[]).filter(function(x){return farmacia ? (x.product_type==='pharmacy'||x.is_pharmacy===true) : (x.product_type!=='pharmacy'&&x.is_pharmacy!==true);}).map(v39EstProduto),lotes:r[1].data||[],movimentos:r[2].data||[],entregas:r[3].data||[],hoje:hoje(),perm:{operador:farmacia?temEstFarmacia():temEstMercado(),admin:pode('institutoAdmin')},_v39:true};});
}
function v39EstFefo(produtoId,locationId){return sbRpc('solidarity_fefo_lots',{p_church_id:v39ChurchId(),p_product_id:produtoId,p_location_id:locationId||null});}
function v39EstConcluirEntrega(tipo,id){var fn=tipo==='farmacia'?'complete_pharmacy_delivery':'complete_solidarity_delivery';return sbRpc(fn,{p_delivery_id:id,p_user_account_id:eu().id});}
function v39EstEstornarEntrega(tipo,id,motivo){var fn=tipo==='farmacia'?'reverse_pharmacy_delivery':'reverse_solidarity_delivery';return sbRpc(fn,{p_delivery_id:id,p_user_account_id:eu().id,p_reason:motivo});}
function v39EstSalvarProduto(tipo,d){return sbRpc('save_solidarity_product',{p_church_id:v39ChurchId(),p_product_id:d.id||null,p_payload:{module_scope:tipo==='farmacia'?'pharmacy':'market',name:d.nome,description:d.apresentacao||null,unit_code:d.unidade||'un',minimum_stock:d.minimo||0,tracks_lots:true,tracks_expiration:true,uses_fefo:true,status:d.ativa===false?'inactive':'active'}});}
function v39EstEntrada(tipo,d){var loc=(estD[tipo].d&&estD[tipo].d.locationId)||null;return sbRpc('record_solidarity_stock_entry',{p_church_id:v39ChurchId(),p_location_id:loc,p_product_id:d.produtoId,p_quantity:d.qtd,p_lot_code:d.lote||null,p_expires_on:d.validade||null,p_source_reference:[d.origem,d.parte].filter(Boolean).join(' · ')||null,p_notes:d.obs||null});}
function v39EstBaixa(tipo,d){return sbRpc('record_solidarity_stock_writeoff',{p_church_id:v39ChurchId(),p_lot_id:d.loteId,p_quantity:d.qtd,p_reason:d.motivo,p_notes:d.obs||null});}
function v39EstPessoaResumo(tipo,pessoaId){return sbRpc('get_solidarity_person_summary',{p_church_id:v39ChurchId(),p_person_id:pessoaId,p_module_scope:tipo==='farmacia'?'pharmacy':'market'});}
function v39EstCriarEntrega(tipo,pessoaId,itens,obs,receitaId){var loc=(estD[tipo].d&&estD[tipo].d.locationId)||null, xs=(itens||[]).map(function(i){return{product_id:i.produtoId,quantity:i.qtd,prescription_item_id:i.prescriptionItemId||null,notes:i.obs||null};});var fn=tipo==='farmacia'?'create_pharmacy_delivery':'create_solidarity_delivery';var args=tipo==='farmacia'?{p_church_id:v39ChurchId(),p_location_id:loc,p_person_id:pessoaId,p_prescription_id:receitaId||null,p_items:xs,p_notes:obs||null}:{p_church_id:v39ChurchId(),p_location_id:loc,p_person_id:pessoaId,p_items:xs,p_notes:obs||null};return sbRpc(fn,args);}
function v39EstSalvarReceita(pessoaId,payload){return sbRpc('save_pharmacy_prescription',{p_church_id:v39ChurchId(),p_person_id:pessoaId,p_payload:payload});}

/* ------------------- v39: Usuários / Acessos ------------------- */
var v39Access={users:[],requests:[],loaded:false};
function v39Usuario(x){x=x||{};var u=x.user_account||x.user||x, p=x.person||{}, a=x.church_access||x.access||{};return{id:u.id||x.user_account_id||'',pessoaId:p.id||x.person_id||'',nome:p.name||p.full_name||x.person_name||x.nome||'',usuario:u.username||x.username||x.usuario||'',email:u.email||x.email||'',fone:x.phone||x.fone||'',papel:x.profile_code||x.profile_key||a.profile_code||x.papel||'',gcId:x.growth_group_id||x.gc_id||x.gcId||'',status:a.status||u.status||x.status||'ativo',acessos:x.permissions||x.acessos||{},updatedAt:u.updated_at||a.updated_at||x.updated_at||'',_v39:true};}
function v39Solicitacao(x){x=x||{};return{id:x.id||x.access_request_id||'',nome:x.person_name||x.full_name||x.name||'',email:x.email||'',fone:x.phone||'',status:x.status||'pending',pessoaId:x.person_id||'',cpf:x.cpf||'',perfil:x.requested_profile_code||x.profile_code||'',gcId:x.growth_group_id||x.gc_id||'',criadoEm:x.created_at||''};}
function v39CarregarAcessos(){
  if(!sbDisponivel()||!v39ChurchId())return Promise.resolve(v39Access);
  var podeU=v39PodeVerUsuarios(), podeR=v39PodeVerSolicitacoes(), ops=[];
  ops.push(podeU?sbRpc('list_active_users',{p_church_id:v39ChurchId(),p_search:null,p_profile_code:null,p_gc_id:null}):Promise.resolve([]));
  ops.push(podeR?sbRpc('list_access_requests',{p_church_id:v39ChurchId(),p_status:null,p_limit:500,p_offset:0}):Promise.resolve([]));
  return Promise.all(ops).then(function(r){
    v39Access.users=v39Itens(r[0]).map(v39Usuario);
    v39Access.requests=v39Itens(r[1]).map(v39Solicitacao);
    v39Access.loaded=true;
    usuariosCache=v39Access.users.concat(v39Access.requests.map(function(q){return{id:q.id,nome:q.nome,email:q.email,fone:q.fone,papel:q.perfil,papelSolicitado:q.perfil,gcId:q.gcId,gcSolicitado:q.gcId,status:'pendente',criadoEm:q.criadoEm,_request:true};}));
    db.pendentes=v39Access.requests.filter(function(q){return q.status==='pending'||q.status==='pendente';}).length;
    salvarDB();return v39Access;
  });
}
function v39AlterarPerfil(u,perfil){return sbRpc('change_user_profile',{p_user_account_id:u.id,p_church_id:v39ChurchId(),p_profile_code:perfil,p_reason:'frontend_v39'});}
function v39Suspender(u,motivo){return sbRpc('suspend_user_account',{p_user_account_id:u.id,p_church_id:v39ChurchId(),p_reason:motivo||'frontend_v39'});}
function v39Reativar(u,motivo){return sbRpc('reactivate_user_account',{p_user_account_id:u.id,p_church_id:v39ChurchId(),p_reason:motivo||'frontend_v39'});}
function v39Rejeitar(q,motivo){return sbRpc('reject_access_request',{p_access_request_id:q.id,p_reason:motivo||'Recusado no frontend v39'});}
function v39SuspenderGlobal(u,motivo){return sbRpc('suspend_user_account_global',{p_user_account_id:u.id,p_reason:motivo||'frontend_v39_global'});}
function v39ReativarGlobal(u,motivo){return sbRpc('reactivate_user_account_global',{p_user_account_id:u.id,p_reason:motivo||'frontend_v39_global'});}
function v39ListarPedidosReset(){return sbRpc('list_password_reset_requests',{p_church_id:v39ChurchId()});}
function v39MarcarReset(u){return sbRpc('edge_mark_password_reset',{p_user_account_id:u.id,p_actor_user_account_id:eu().id});}
function v39CorrigirLogin(u,novoUsuario){return sbRpc('edge_correct_login_identity',{p_user_account_id:u.id,p_username:novoUsuario,p_email_changed:false,p_actor_user_account_id:eu().id});}
function v39SuspenderGlobalUI(id){var u=(usuariosCache||[]).filter(function(x){return x.id===id;})[0];if(!u||!v39PodeSuspenderGlobal())return toast('Sem permissão para suspensão global.',4000);var m=prompt('Motivo da suspensão global de @'+u.usuario+':');if(m===null)return;if(!m.trim())return toast('Informe o motivo.');if(!confirm('Suspender globalmente @'+u.usuario+' em todas as igrejas e encerrar as sessões?'))return;carregando(true,'Suspendendo globalmente...');v39SuspenderGlobal(u,m.trim()).then(function(){return v39EncerrarSessoesUsuario(u.id);}).then(function(){toast('Conta suspensa globalmente e sessões encerradas.');fechar();usuariosCache=null;carregarUsuarios(true);}).catch(function(e){toast(e.message,5000);}).then(function(){carregando(false);});}
function v39ReativarGlobalUI(id){var u=(usuariosCache||[]).filter(function(x){return x.id===id;})[0];if(!u||!v39PodeReativar())return toast('Sem permissão para reativação.',4000);var m=prompt('Motivo da reativação global de @'+u.usuario+':');if(m===null)return;if(!m.trim())return toast('Informe o motivo.');carregando(true,'Reativando globalmente...');v39ReativarGlobal(u,m.trim()).then(function(){toast('Conta reativada globalmente.');fechar();usuariosCache=null;carregarUsuarios(true);}).catch(function(e){toast(e.message,5000);}).then(function(){carregando(false);});}
function v39AbrirPedidosReset(){if(!v39PodeRedefinirSenha())return toast('Sem permissão para visualizar pedidos de redefinição.',4000);carregando(true,'Carregando pedidos...');v39ListarPedidosReset().then(function(r){var a=v39Itens(r),h='<h2>Pedidos de redefinição de senha</h2><div class="aviso">A v39 não permite que o administrador defina a senha de outra pessoa. O fluxo seguro registra o pedido e a pessoa conclui a troca pelo processo de recuperação.</div><div class="gap"></div>';h+=a.length?a.map(function(x){return '<div class="row"><div class="info"><div class="nm">'+esc(x.full_name||x.username||'Usuário')+'</div><div class="sb">@'+esc(x.username||'')+' · solicitado em '+esc(dataHoraLocal(x.requested_at)||'')+(x.expires_at?' · expira '+esc(dataHoraLocal(x.expires_at)):'')+'</div></div></div>';}).join(''):'<div class="empty">Nenhum pedido pendente.</div>';h+='<div class="gap"></div><button class="btn gh" data-a="fechar">Fechar</button>';abrirModal(h);}).catch(function(e){toast(e.message,5000);}).then(function(){carregando(false);});}


/* ------------------- v39: Instituto / Lar de Vida ------------------- */
var v39Inst={courses:[],offerings:[],enrollments:[],sessions:[],attendance:[],loaded:false};
var v39LV={journeys:[],loaded:false};
function v39LvJourney(x){x=x||{};var j=x.journey||x;return{id:j.id||x.journey_id||'',pessoaId:j.person_id||'',status:j.status||'',inicio:j.started_at||'',origem:j.source_type||'',gcOrigemId:j.source_growth_group_id||'',obsOrigem:j.source_notes||'',aceitaVisita:j.accepts_home_visit!==false,diaPreferido:j.preferred_weekday,horarioIni:j.preferred_time_start||'',horarioFim:j.preferred_time_end||'',resultado:j.release_result||'',obsFinal:j.final_notes||'',encerradoEm:j.closed_at||'',motivoEncerramento:j.close_reason||'',updatedAt:j.updated_at||'',visitas:x.visits||[],responsavelId:(x.assignment&&x.assignment.responsible_person_id)||x.responsible_person_id||''};}
function v39LvPayload(j){return{person_id:j.pessoaId||j.person_id||null,source_type:j.origem||j.source_type||null,source_growth_group_id:j.gcOrigemId||j.source_growth_group_id||null,source_notes:j.obsOrigem||j.source_notes||null,accepts_home_visit:j.aceitaVisita!==false,preferred_weekday:j.diaPreferido===''?null:j.diaPreferido,preferred_time_start:j.horarioIni||null,preferred_time_end:j.horarioFim||null,status:j.status||null,release_result:j.resultado||null,final_notes:j.obsFinal||null,close_reason:j.motivoEncerramento||null};}
function v39LvListar(){if(!sbDisponivel()||!v39ChurchId())return Promise.resolve(v39LV);return sbRpc('list_life_home_journeys',{p_church_id:v39ChurchId(),p_status:null}).then(function(r){v39LV.journeys=v39Itens(r).map(v39LvJourney);v39LV.loaded=true;return v39LV;});}
function v39LvObter(id){return sbRpc('get_life_home_journey',{p_journey_id:id}).then(v39LvJourney);}
function v39LvSalvar(j){return sbRpc('save_life_home_journey',{p_church_id:v39ChurchId(),p_journey_id:j.id||null,p_payload:v39LvPayload(j),p_reason:'frontend_v39'}).then(v39LvJourney);}
function v39LvAtribuir(journeyId,pessoaId,status,motivo){return sbRpc('set_life_home_assignment',{p_journey_id:journeyId,p_responsible_person_id:pessoaId||null,p_status:status||'active',p_reason:motivo||'frontend_v39'});}
function v39LvSalvarVisita(journeyId,v){var payload={assignment_id:v.assignment_id||null,week_number:v.week_number||v.semana||null,scheduled_for:v.scheduled_for||v.agendadaPara||null,performed_at:v.performed_at||v.realizadaEm||null,status:v.status||null,result:v.result||v.resultado||null,notes:v.notes||v.obs||null};return sbRpc('save_life_home_visit',{p_journey_id:journeyId,p_visit_id:v.id||null,p_payload:payload,p_reason:'frontend_v39'});}

/* Instituto: o inventário atual confirma tabelas/RLS, mas não expõe RPCs de aplicação para cursos.
   Na v39 fazemos leitura segura via schema app quando permitido pelo cliente/RLS e mantemos escrita legada até contrato de escrita confirmado. */
function v39InstTabela(nome){return v39Tolerante(nome,sbCliente().schema('app').from(nome).select('*').eq('church_id',v39ChurchId()));}
var v39ProntuarioSegredo = null;
function v39B64u(bytes){var bin='';bytes=new Uint8Array(bytes);for(var i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function v39Unb64u(text){text=String(text||'').replace(/-/g,'+').replace(/_/g,'/');while(text.length%4)text+='=';var bin=atob(text),out=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;}
function v39ProntuarioSenha(){
  if(v39ProntuarioSegredo)return Promise.resolve(v39ProntuarioSegredo);
  var senha=prompt('Digite sua chave pessoal do prontuário. Ela não é enviada ao servidor e será esquecida ao sair ou atualizar a página.');
  if(!senha||senha.length<10)return Promise.reject(new Error('A chave do prontuário deve ter pelo menos 10 caracteres.'));
  v39ProntuarioSegredo=senha;return Promise.resolve(senha);
}
function v39ProntuarioChave(senha,salt){
  var enc=new TextEncoder();
  return crypto.subtle.importKey('raw',enc.encode(senha),'PBKDF2',false,['deriveKey']).then(function(base){return crypto.subtle.deriveKey({name:'PBKDF2',salt:salt,iterations:310000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);});
}
function v39ProntuarioCriptografar(obj){
  if(!window.crypto||!crypto.subtle)return Promise.reject(new Error('Este navegador não oferece Web Crypto para o prontuário.'));
  return v39ProntuarioSenha().then(function(senha){var salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));return v39ProntuarioChave(senha,salt).then(function(key){return crypto.subtle.encrypt({name:'AES-GCM',iv:iv},key,new TextEncoder().encode(JSON.stringify(obj))).then(function(ct){return JSON.stringify({v:1,alg:'AES-GCM',kdf:'PBKDF2-SHA256',iter:310000,salt:v39B64u(salt),iv:v39B64u(iv),ct:v39B64u(ct)});});});});
}
function v39ProntuarioDescriptografar(envelope){
  if(!envelope)return Promise.resolve({});
  var e;try{e=typeof envelope==='string'?JSON.parse(envelope):envelope;}catch(x){return Promise.reject(new Error('Registro clínico cifrado inválido.'));}
  if(!e||e.v!==1||e.alg!=='AES-GCM')return Promise.reject(new Error('Formato de criptografia não reconhecido.'));
  return v39ProntuarioSenha().then(function(senha){return v39ProntuarioChave(senha,v39Unb64u(e.salt)).then(function(key){return crypto.subtle.decrypt({name:'AES-GCM',iv:v39Unb64u(e.iv)},key,v39Unb64u(e.ct)).then(function(pt){return JSON.parse(new TextDecoder().decode(pt));});});}).catch(function(){throw new Error('Não foi possível abrir o prontuário. Verifique a chave pessoal.');});
}
function v39ProntuarioCarregar(personId,appointmentId){
  return Promise.all([sbRpc('get_my_health_patient',{p_church_id:v39ChurchId(),p_appointment_id:appointmentId}),sbRpc('get_my_health_records',{p_church_id:v39ChurchId(),p_person_id:personId})]).then(function(r){var arr=Array.isArray(r[1])?r[1]:v39Itens(r[1]);return Promise.all(arr.map(function(x){return v39ProntuarioDescriptografar(x.payload_encrypted).then(function(d){d=d||{};return{id:x.id,agendamentoId:x.appointment_id,pessoaId:x.person_id,queixa:d.queixa||'',evolucao:d.evolucao||'',conduta:d.conduta||'',retorno:d.retorno||x.return_on||'',data:x.occurred_at||x.created_at||'',payloadVersion:x.payload_version||1};});})).then(function(itens){return{paciente:r[0],itens:itens};});});
}
function v39ProntuarioSalvar(appointmentId,dados,marcar){
  return v39ProntuarioCriptografar(dados).then(function(cipher){return sbRpc('save_my_health_record',{p_church_id:v39ChurchId(),p_appointment_id:appointmentId,p_payload_encrypted:cipher,p_payload_version:1,p_return_on:dados.retorno||null,p_mark_completed:!!marcar});});
}
function v39ProntuarioLimparChave(){v39ProntuarioSegredo=null;}
function v39SaudeDados(){return sbRpc('list_institute_health_data',{p_church_id:v39ChurchId()});}
function v39SaudeSalvarProfissional(id,payload){return sbRpc('save_institute_health_professional',{p_church_id:v39ChurchId(),p_id:id||null,p_payload:payload||{}});}
function v39SaudeSalvarAgendamento(id,payload){return sbRpc('save_institute_health_appointment',{p_church_id:v39ChurchId(),p_id:id||null,p_payload:payload||{}});}
function v39SaudeAdaptarDados(r){
  r=r||{}; var prof=(r.professionals||[]).map(function(x){return{id:x.id,pessoaId:x.person_id||'',nome:x.display_name||'',especialidade:x.specialty||'',registro:[x.registration_council,x.registration_number].filter(Boolean).join(' '),fone:x.phone||'',email:x.email||'',ativo:x.status!=='inactive'};});
  var agendas=(r.agendas||[]).map(function(x){return{id:x.id,profissionalId:x.professional_id||'',nome:(prof.filter(function(p){return p.id===x.professional_id;})[0]||{}).nome||'',especialidade:(prof.filter(function(p){return p.id===x.professional_id;})[0]||{}).especialidade||'',tipo:'saude',local:x.location_text||'',duracaoMin:x.slot_minutes||30,ativa:x.status!=='inactive',horarios:[{dow:x.weekday,ini:(x.starts_at||'').slice(0,5),fim:(x.ends_at||'').slice(0,5)}],bloqueios:[]};});
  var ags=(r.appointments||[]).map(function(x){var d=new Date(x.scheduled_for),iso=isNaN(d)?'':d.toISOString();return{id:x.id,agendaId:x.agenda_id||'',profissionalId:x.professional_id||'',pessoaId:x.person_id||'',data:iso.slice(0,10),hora:iso.slice(11,16),fim:(x.ends_at||'').slice(11,16),status:x.status||'scheduled',motivo:x.reason||'',obs:x.notes||'',codigo:String(x.id||'').slice(0,8).toUpperCase()};});
  return {agendas:agendas,agendamentos:ags,pacientes:{},profissionais:prof,perm:{admin:pode('instituto'),prontuario:pode('prontuario')},hoje:hoje()};
}
function v39SaudePayloadAgendamento(o){return{agenda_id:o.agendaId||null,professional_id:o.profissionalId||null,person_id:o.pessoaId||null,scheduled_for:(o.data&&o.hora)?o.data+'T'+o.hora+':00':null,ends_at:o.endsAt||null,status:o.status||'scheduled',reason:o.motivo||null,notes:o.obs||null,cancellation_reason:o.cancellationReason||null};}
function v39InstCarregar(){
  if(!sbDisponivel()||!v39ChurchId())return Promise.resolve(v39Inst);
  return Promise.all([
    v39InstTabela('institute_courses'),v39InstTabela('institute_course_offerings'),v39InstTabela('institute_enrollments')
  ]).then(function(r){r.forEach(function(x){if(x.error)throw x.error;});v39Inst.courses=r[0].data||[];v39Inst.offerings=r[1].data||[];v39Inst.enrollments=r[2].data||[];v39Inst.loaded=true;return v39Inst;});
}

/* ------------------- v39: Financeiro / Relatórios ------------------- */
var v39Fin={balances:[],period:[],result:[],reports:[],loaded:false};
function v39Linhas(x){return Array.isArray(x)?x:v39Itens(x);}
function v39FinCarregar(de,ate){
  if(!sbDisponivel()||!v39ChurchId())return Promise.resolve(v39Fin);
  var hoje=new Date(),pad=function(n){return String(n).padStart(2,'0');};
  var iso=function(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
  de=de||iso(new Date(hoje.getFullYear(),hoje.getMonth(),1));ate=ate||iso(hoje);   /* v39: periodo padrao = mes corrente; as RPCs de resumo exigem datas */
  return Promise.all([
    sbRpc('secure_financial_account_balances',{p_church_id:v39ChurchId()}),
    sbRpc('secure_financial_period_summary',{p_church_id:v39ChurchId(),p_date_from:de,p_date_to:ate}),
    sbRpc('secure_financial_result_summary',{p_church_id:v39ChurchId(),p_date_from:de,p_date_to:ate}),
    sbRpc('secure_financial_report_catalog',{p_church_id:v39ChurchId()})
  ]).then(function(r){v39Fin.balances=v39Linhas(r[0]);v39Fin.period=v39Linhas(r[1]);v39Fin.result=v39Linhas(r[2]);v39Fin.reports=v39Linhas(r[3]);v39Fin.loaded=true;return v39Fin;});
}
function v39FinRefreshPeriodo(de,ate){return v39FinCarregar(de||null,ate||null).then(function(){render();return v39Fin;});}
function v39FinTotal(rows,keys){return (rows||[]).reduce(function(t,r){for(var i=0;i<keys.length;i++){if(r[keys[i]]!=null&&!isNaN(+r[keys[i]]))return t+(+r[keys[i]]);}return t;},0);}
function v39FinResumo(){return{saldo:v39FinTotal(v39Fin.balances,['current_balance','balance','balance_amount']),entradas:v39FinTotal(v39Fin.result,['income_amount','income','total_income']),saidas:v39FinTotal(v39Fin.result,['expense_amount','expense','total_expense']),catalogo:(v39Fin.reports||[]).length};}

/* ------------------- v39: Encontros / Chamada ------------------- */
function v39Encontro(x){x=x||{};var e=x.meeting||x;var at=x.attendance||x.attendance_items||[];var pres={},add=[],rem=[];(Array.isArray(at)?at:[]).forEach(function(a){var id=a.person_id||a.id;if(!id)return;var st=a.status||a.attendance_status||'';if(st)pres[id]=st==='present'?'P':st==='justified'?'J':st==='absent'?'F':st;if(a.was_added_during_roll_call)add.push(id);});return{id:e.id||x.meeting_id||'',gcId:e.growth_group_id||x.growth_group_id||'',data:e.meeting_date||e.date||x.date||'',tema:e.theme||e.topic||x.theme||'',anfitriao:e.host_name||e.host||x.host_name||'',recados:e.notes||e.announcements||x.notes||'',dizimo:e.tithe_amount||x.tithe_amount||'',oferta:e.offering_amount||x.offering_amount||'',presencas:pres,lista:{add:add,rem:rem},status:e.status||'',updatedAt:e.updated_at||'',deleted:false,_v39:true};}
function v39PayloadEncontro(e){return{meeting_date:e.data||null,theme:e.tema||null,host_name:e.anfitriao||null,notes:e.recados||null,tithe_amount:valor(e.dizimo)||0,offering_amount:valor(e.oferta)||0,status:e.status||'completed'};}
function v39Attendance(e){var l=lista(e), ids={};(l.add||[]).forEach(function(id){ids[id]=1;});return Object.keys(e.presencas||{}).map(function(id){var m=e.presencas[id];return{person_id:id,status:m==='P'?'present':m==='J'?'justified':m==='F'?'absent':m,was_added_during_roll_call:!!ids[id]};});}
function v39ListarEncontrosGC(gcId){return sbRpc('list_gc_meetings',{p_growth_group_id:gcId,p_date_from:null,p_date_to:null}).then(function(r){return v39Itens(r).map(v39Encontro);});}
function v39CarregarEncontros(){if(!sbDisponivel())return Promise.resolve(db.encontros||[]);return Promise.all((db.gcs||[]).map(function(g){return v39ListarEncontrosGC(g.id);})).then(function(xs){db.encontros=[].concat.apply([],xs);salvarDB();return db.encontros;});}
function v39SalvarEncontro(e){return sbRpc('save_gc_meeting',{p_growth_group_id:e.gcId,p_meeting_id:e.id||null,p_payload:v39PayloadEncontro(e),p_reason:'frontend_v39'}).then(function(r){var out=v39Encontro(r);return sbRpc('save_gc_attendance',{p_meeting_id:out.id,p_items:v39Attendance(e),p_reason:'frontend_v39'}).then(function(){out.presencas=e.presencas||{};out.lista=e.lista||{add:[],rem:[]};return out;});});}

/* ------------------- v39: Cultos ------------------- */
function v39Culto(x){x=x||{};var e=x.worship_service||x.service||x;return{id:e.id||x.worship_service_id||'',tipo:e.service_type||e.type||x.type||'Culto',data:e.service_date||e.date||x.date||'',titulo:e.title||e.name||x.title||'Culto',inicio:e.starts_at||e.start_time||x.starts_at||x.start_time||'',fim:e.ends_at||e.end_time||x.ends_at||x.end_time||'',pregador:e.preacher_name_text||e.preacher_name||x.preacher_name_text||x.preacher_name||'',tituloPalavra:e.scripture_reference||e.sermon_title||x.scripture_reference||x.sermon_title||'',liberado:e.registration_open===true||x.registration_open===true,antes:e.registration_minutes_before||x.registration_minutes_before||'',depois:e.registration_minutes_after||x.registration_minutes_after||'',obs:e.notes||x.notes||'',tema:e.theme||x.theme||'',recados:e.announcements||x.announcements||'',dizimo:e.tithe_amount||x.tithe_amount||'',oferta:e.offering_amount||x.offering_amount||'',outras:e.other_income_amount||x.other_income_amount||'',presentes:e.attendance_count||x.attendance_count||'',status:e.status||x.status||'',updatedAt:e.updated_at||'',deleted:false,_v39:true};}
function v39PayloadCulto(e){var o={};if(e.tipo!==undefined)o.service_type=e.tipo;if(e.data!==undefined)o.service_date=e.data;if(e.titulo!==undefined)o.title=e.titulo;if(e.inicio!==undefined)o.starts_at=e.inicio||null;if(e.fim!==undefined)o.ends_at=e.fim||null;if(e.pregador!==undefined)o.preacher_name_text=e.pregador||null;if(e.tituloPalavra!==undefined)o.scripture_reference=e.tituloPalavra||null;if(e.liberado!==undefined)o.registration_open=!!e.liberado;if(e.antes!==undefined)o.registration_minutes_before=e.antes===''?null:+e.antes;if(e.depois!==undefined)o.registration_minutes_after=e.depois===''?null:+e.depois;if(e.obs!==undefined)o.notes=e.obs||null;if(e.tema!==undefined)o.theme=e.tema||null;if(e.recados!==undefined)o.announcements=e.recados||null;if(e.dizimo!==undefined)o.tithe_amount=valor(e.dizimo)||0;if(e.oferta!==undefined)o.offering_amount=valor(e.oferta)||0;if(e.outras!==undefined)o.other_income_amount=valor(e.outras)||0;if(e.presentes!==undefined)o.attendance_count=e.presentes===''?null:+e.presentes;if(e.deleted)o.status='cancelled';return o;}
function v39ListarCultos(){if(!sbDisponivel()||!v39ChurchId())return Promise.resolve(db.eventos||[]);return sbRpc('list_worship_services',{p_church_id:v39ChurchId(),p_date_from:null,p_date_to:null,p_status:null}).then(function(r){db.eventos=v39Itens(r).map(v39Culto);salvarDB();return db.eventos;});}
function v39SalvarCulto(e){return sbRpc('save_worship_service',{p_church_id:v39ChurchId(),p_worship_service_id:e.id||null,p_payload:v39PayloadCulto(e),p_reason:'frontend_v39'}).then(v39Culto);}
var v39CultoDetalheAtual=null;
function v39ObterCulto(id){return sbRpc('get_worship_service',{p_worship_service_id:id});}
function v39SalvarPresencaCulto(id,itens,motivo){return sbRpc('save_worship_attendance',{p_worship_service_id:id,p_items:itens||[],p_reason:motivo||null});}
function v39StatusCultoUI(s){return s==='present'?'P':s==='absent'?'F':s==='justified'?'J':s==='not_recorded'?'N':'';}
function v39StatusCultoDB(s){return s==='P'?'present':s==='F'?'absent':s==='J'?'justified':s==='N'?'not_recorded':'';}
function v39TipoCultoLabel(t){return t==='visitor'?'Visitante':t==='guest'?'Convidado':t==='volunteer'?'Voluntário':'Regular';}
function v39AbrirChamadaCulto(id){
  if(!sbDisponivel())return toast('Chamada individual disponível somente na v39.',4000);
  carregando(true,'Carregando chamada...');
  v39ObterCulto(id).then(function(d){
    d=d||{};v39CultoDetalheAtual=d;
    var w=d.worship_service||{},att=Array.isArray(d.attendance)?d.attendance:[],asg=Array.isArray(d.assignments)?d.assignments:[],map={};
    att.forEach(function(a){map[a.person_id]=a;});
    var pessoas=(db.pessoas||[]).filter(function(p){return p&&!p.deleted&&p.status!=='merged';}).slice().sort(function(a,b){return String(a.nome||'').localeCompare(String(b.nome||''));});
    var rows=pessoas.map(function(p){var a=map[p.id]||{},st=v39StatusCultoUI(a.attendance_status),tp=a.participant_type||((p.tipo||'').toLowerCase().indexOf('visit')>=0?'visitor':'regular');return '<div class="row" style="align-items:flex-start"><div class="av">'+ini(p.nome||'?')+'</div><div class="info"><div class="nm">'+esc(p.apelido||p.nome||'Pessoa')+'</div><div class="sb">'+esc(p.codigo||p.personCode||'')+'</div><div class="g2" style="margin-top:7px"><select class="w-att" data-person="'+esc(p.id)+'" data-existing="'+(a.attendance_id?'1':'0')+'"><option value=""'+(!st?' selected':'')+'>Não marcar</option><option value="P"'+(st==='P'?' selected':'')+'>Presente</option><option value="F"'+(st==='F'?' selected':'')+'>Faltou</option><option value="J"'+(st==='J'?' selected':'')+'>Justificada</option><option value="N"'+(st==='N'?' selected':'')+'>Não registrado</option></select><select class="w-type" data-person="'+esc(p.id)+'"><option value="regular"'+(tp==='regular'?' selected':'')+'>Regular</option><option value="visitor"'+(tp==='visitor'?' selected':'')+'>Visitante</option><option value="guest"'+(tp==='guest'?' selected':'')+'>Convidado</option><option value="volunteer"'+(tp==='volunteer'?' selected':'')+'>Voluntário</option></select></div><input class="w-note" data-person="'+esc(p.id)+'" value="'+esc(a.notes||'')+'" placeholder="Observação individual" style="margin-top:7px"></div></div>';}).join('');
    var assignments=asg.length?'<div class="sec" style="margin-left:0">Escala / designações (somente leitura)</div><div class="card" style="box-shadow:none;border:1px solid #eee">'+asg.map(function(a){return '<div class="row"><div class="info"><div class="nm">'+esc(a.full_name||'Pessoa')+'</div><div class="sb">'+esc(a.assignment_type||'Designação')+(a.title?' · '+esc(a.title):'')+(a.status?' · '+esc(a.status):'')+'</div>'+(a.instructions?'<div class="sb">'+esc(a.instructions)+'</div>':'')+'</div></div>';}).join('')+'</div>':'<div class="aviso" style="margin-top:10px">Nenhuma designação cadastrada para este culto.</div>';
    abrirModal('<h2>Chamada do culto</h2><div class="sb">'+esc(w.title||eventoPor(id)&&eventoPor(id).titulo||'Culto')+'</div><div id="w-count" class="aviso" style="margin-top:10px">'+att.filter(function(a){return a.attendance_status==='present';}).length+' presente(s) registrado(s)</div>'+assignments+'<div class="sec" style="margin-left:0">Presença individual</div><div style="max-height:48vh;overflow:auto">'+(rows||'<div class="empty">Nenhuma pessoa disponível.</div>')+'</div><label>Justificativa da correção (obrigatória se o culto estiver concluído)</label><textarea id="w-reason" rows="2" placeholder="Motivo da correção, quando aplicável"></textarea><div class="gap"></div><button class="btn pr" data-a="evSalvarChamada" data-v="'+esc(id)+'">Salvar chamada</button><div class="gap"></div><button class="btn gh" data-a="fechar">Fechar</button>');
  }).catch(function(e){toast((e&&e.message)||'Não foi possível carregar a chamada.',5000);}).then(function(){carregando(false);});
}
function v39SalvarChamadaCultoUI(id){
  var statuses=document.querySelectorAll('.w-att'),itens=[];
  for(var i=0;i<statuses.length;i++){
    var s=statuses[i],pid=s.getAttribute('data-person'),st=v39StatusCultoDB(s.value),existing=s.getAttribute('data-existing')==='1';
    if(!st&&!existing)continue;if(!st)st='not_recorded';
    var tp=document.querySelector('.w-type[data-person="'+pid+'"]'),no=document.querySelector('.w-note[data-person="'+pid+'"]');
    itens.push({person_id:pid,attendance_status:st,participant_type:tp?tp.value:'regular',was_added_during_roll_call:!existing,notes:no&&no.value.trim()?no.value.trim():null});
  }
  var reason=$('w-reason')?$('w-reason').value.trim():'';
  carregando(true,'Salvando chamada...');
  v39SalvarPresencaCulto(id,itens,reason||null).then(function(r){var e=eventoPor(id);if(e)e.presentes=String(itens.filter(function(x){return x.attendance_status==='present';}).length);salvarDB();fechar();render();toast('Chamada do culto salva · '+(r&&r.processed!=null?r.processed:itens.length)+' registro(s) processado(s)');}).catch(function(e){toast((e&&e.message)||'Não foi possível salvar a chamada.',5500);}).then(function(){carregando(false);});
}


/* ------------------- v39: GCs ------------------- */
function v39GC(x){
  x=x||{}; var g=x.growth_group||x.group||x.gc||x, sc=x.schedule||x.current_schedule||{};
  return {id:g.id||x.growth_group_id||'',nome:g.name||x.name||x.nome||'',status:g.status||x.status||'active',tipoGC:g.group_type||x.group_type||x.tipoGC||'',publico:g.audience||x.audience||x.publico||'',idadeMin:g.age_range_min==null?'':g.age_range_min,idadeMax:g.age_range_max==null?'':g.age_range_max,fone:g.phone||x.phone||x.fone||'',cep:g.postal_code||x.postal_code||x.cep||'',endereco:g.street||x.street||x.endereco||'',numero:g.street_number||x.street_number||x.numero||'',complemento:g.complement||x.complement||x.complemento||'',bairro:g.district||x.district||x.bairro||'',cidade:g.city||x.city||x.cidade||'',uf:g.state_code||x.state_code||x.uf||'',referencia:g.reference_point||x.reference_point||x.referencia||'',lat:g.latitude||x.latitude||'',lng:g.longitude||x.longitude||'',inicio:g.started_at||x.started_at||x.inicio||'',obs:g.notes||x.notes||x.obs||'',diaSemana:sc.weekday||sc.day_of_week||x.weekday||x.diaSemana||'',horario:sc.start_time||sc.time||x.start_time||x.horario||'',frequencia:sc.frequency||x.frequency||x.frequencia||'',liderId:x.leader_person_id||x.leader_id||x.liderId||'',liderNome:x.leader_name||x.liderNome||'',supervisorId:x.supervisor_person_id||x.supervisor_id||x.supervisorId||'',supervisorNome:x.supervisor_name||x.supervisorNome||'',coLider:x.co_leader_name||x.coLider||'',anfitriao:x.host_name||x.anfitriao||'',updatedAt:g.updated_at||x.updated_at||'',deleted:false,_v39:true};
}
function v39PatchGC(g){return {name:g.nome||'',status:g.status||'active',group_type:g.tipoGC||null,audience:g.publico||null,age_range_min:g.idadeMin===''?null:+g.idadeMin,age_range_max:g.idadeMax===''?null:+g.idadeMax,phone:g.fone||null,postal_code:g.cep||null,street:g.endereco||null,street_number:g.numero||null,complement:g.complemento||null,district:g.bairro||null,city:g.cidade||null,state_code:g.uf||null,reference_point:g.referencia||null,started_at:g.inicio||null,notes:g.obs||null};}
function v39ListarGCs(){if(!sbDisponivel()||!v39ChurchId())return Promise.resolve(db.gcs||[]);return sbRpc('list_growth_groups',{p_church_id:v39ChurchId(),p_search:null,p_status:null}).then(function(r){var a=v39Itens(r).map(v39GC);db.gcs=a;salvarDB();return a;});}
function v39ObterGC(id){return sbRpc('get_growth_group',{p_growth_group_id:id}).then(v39GC);}
function v39AtualizarGC(g){return sbRpc('update_growth_group',{p_growth_group_id:g.id,p_patch:v39PatchGC(g)}).then(v39GC);}
function v39CriarGC(g){return sbRpc('create_growth_group',{p_church_id:v39ChurchId(),p_payload:v39PatchGC(g)}).then(v39GC);}
function v39AssociarPessoaGC(personId,gcId,reason){return sbRpc('assign_person_to_growth_group',{p_church_id:v39ChurchId(),p_person_id:personId,p_growth_group_id:gcId,p_reason:reason||'frontend_v39'});}
function v39SalvarAgendaGC(g){if(!g.id)return Promise.resolve(g);var ag={weekday:g.diaSemana||null,start_time:g.horario||null,frequency:g.frequencia||null};return sbRpc('set_growth_group_schedule',{p_growth_group_id:g.id,p_schedule:ag}).then(function(){return g;});}

/* ------------------- v39: Pessoas ------------------- */
function v39ChurchId(){ return cfg.activeChurchId || (sbContexto && (sbContexto.church_id || (sbContexto.church && sbContexto.church.id))) || ''; }
function v39Itens(x){ if(Array.isArray(x)) return x; return (x && (x.items || x.itens || x.data || x.people || x.pessoas)) || []; }
function v39Pessoa(x){
  x=x||{}; var person=x.person||x.pessoa||x, cp=x.church_person||x.churchPerson||{}, ct=x.contact||x.contacts||{}, ad=x.address||x.endereco_dados||{};
  return {
    id:person.id||x.person_id||'', codigo:person.person_code||person.code||x.person_code||x.codigo||'', nome:person.full_name||person.name||x.full_name||x.nome||'', apelido:person.nickname||x.nickname||x.apelido||'',
    tipo:cp.person_type||cp.type||x.person_type||x.tipo||'Visitante', status:cp.church_status||cp.status||x.church_status||x.status||'Em visita',
    fone:ct.whatsapp||ct.phone||x.whatsapp||x.phone||x.fone||'', email:ct.email||x.email||'', nasc:person.birth_date||x.birth_date||x.nasc||'', sexo:person.sex||x.sex||x.sexo||'',
    cep:ad.postal_code||x.postal_code||x.cep||'', endereco:ad.street||x.street||x.endereco||'', numero:ad.number||x.number||x.numero||'', complemento:ad.complement||x.complement||x.complemento||'', bairro:ad.neighborhood||x.neighborhood||x.bairro||'', cidade:ad.city||x.city||x.cidade||'',
    gcId:cp.growth_group_id||x.growth_group_id||x.gc_id||x.gcId||'', jornada:cp.journey_stage||x.journey_stage||x.jornada||'', prim:cp.first_visit_date||x.first_visit_date||x.prim||'', obs:cp.notes||x.notes||x.obs||'',
    updatedAt:x.updated_at||x.updatedAt||person.updated_at||cp.updated_at||'', deleted:false, _pend:false, _v39:true
  };
}
function v39PayloadPessoa(o){
  return {full_name:o.nome||'',nickname:o.apelido||null,birth_date:o.nasc||null,sex:o.sexo||null,phone:o.fone||null,email:o.email||null,postal_code:o.cep||null,street:o.endereco||null,number:o.numero||null,complement:o.complemento||null,neighborhood:o.bairro||null,city:o.cidade||null,person_type:o.tipo||null,church_status:o.status||null,growth_group_id:o.gcId||null,first_visit_date:o.prim||null,journey_stage:o.jornada||null,notes:o.obs||null,consent:o.consent||null};
}
function v39ListarPessoas(){
  if(!sbDisponivel()||!v39ChurchId()) return Promise.resolve(db.pessoas||[]);
  return sbRpc('list_people',{p_church_id:v39ChurchId(),p_search:null,p_church_status:null,p_gc_id:null}).then(function(r){var a=v39Itens(r).map(v39Pessoa);db.pessoas=a;salvarDB();return a;});
}
function v39ObterPessoa(id){return sbRpc('get_person',{p_church_id:v39ChurchId(),p_person_id:id}).then(v39Pessoa);}
function v39CriarPessoa(o){return sbRpc('create_person',{p_church_id:v39ChurchId(),p_payload:v39PayloadPessoa(o)}).then(v39Pessoa);}
function v39AtualizarPessoa(o){return sbRpc('update_person',{p_church_id:v39ChurchId(),p_person_id:o.id,p_expected_updated_at:o.updatedAt||null,p_payload:v39PayloadPessoa(o)}).then(v39Pessoa);}
function v39SalvarPessoa(o,ant){
  var alvo=o.gcId||'', anterior=ant&&ant.gcId||'';
  var salvar=ant?v39AtualizarPessoa(o):v39CriarPessoa(o);
  return salvar.then(function(p){
    if(alvo && alvo!==anterior && p&&p.id){
      return v39AssociarPessoaGC(p.id,alvo,ant?'frontend_v39_transfer_person':'frontend_v39_assign_person').then(function(){p.gcId=alvo;return p;});
    }
    return p;
  });
}
var EXIGE_HOSPEDADO = true;      // segurança: o app só funciona pelo endereço oficial (dados nunca trafegam pela URL)

/* ───────── armazenamento ───────── */
var STORE_OK = true, MEM = {}, servidorV = null;
try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); } catch (e) { STORE_OK = false; }
function lsGet(k) { try { return STORE_OK ? localStorage.getItem(k) : (MEM[k] || null); } catch (e) { return MEM[k] || null; } }
function lsSet(k, v) { try { if (STORE_OK) localStorage.setItem(k, v); else MEM[k] = v; } catch (e) { MEM[k] = v; } }
function lsDel(k) { try { if (STORE_OK) localStorage.removeItem(k); delete MEM[k]; } catch (e) {} }
function lerJSON(k, def) { var v = lsGet(k); if (!v) return def; try { return JSON.parse(v); } catch (e) { return def; } }

var K_CFG = 'gcbv5_cfg', K_DB = 'gcbv5_db', K_FOTOS = 'gcbv5_fotos';
var cfg = lerJSON(K_CFG, {});
cfg.url = MODO_PWA ? URL_PADRAO : (cfg.url || URL_PADRAO);
var db = lerJSON(K_DB, null) || { pessoas: [], encontros: [], gcs: [], equipe: [], pendentes: 0 };
var fotos = lerJSON(K_FOTOS, {});
function salvarCfg() { lsSet(K_CFG, JSON.stringify(cfg)); }
function salvarDB() { lsSet(K_DB, JSON.stringify(db)); }
function salvarFotos() { lsSet(K_FOTOS, JSON.stringify(fotos)); }

var MODO_SCRIPT = !!(typeof google !== 'undefined' && google.script && google.script.run);

/* ───────── utilidades ───────── */
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[<>&"']/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function pad(n) { return ('0' + n).slice(-2); }
function isoData(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function hoje() { return isoData(new Date()); }
function agora() { return new Date().toISOString(); }
function parseData(s) { var p = String(s || '').split('-'); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null; }
function br(s) { return s ? s.slice(8, 10) + '/' + s.slice(5, 7) : ''; }
function brCompleto(s) { return s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : ''; }
function horaLocal(iso) { var d = new Date(iso); return isNaN(d) ? '' : pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function dataHoraLocal(iso) { var d = new Date(iso); return isNaN(d) ? '' : pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function diasEntre(a, b) { return Math.round((b - a) / 86400000); }
function pri(n) { return String(n || '').trim().split(' ')[0]; }
function ini(n) { return String(n || '?').trim().split(' ').filter(Boolean).slice(0, 2).map(function (x) { return x[0]; }).join('').toUpperCase(); }
function fone(f) { return String(f || '').replace(/\D/g, ''); }
function pct(x) { return Math.round(x * 100) + '%'; }
function valor(v) {
  var t = String(v == null ? '' : v).trim().replace(/[^\d,.-]/g, '');
  if (!t) return 0;
  if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');   // 1.080 = mil e oitenta
  var n = parseFloat(t); return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}
function moeda(n) {
  n = Math.round((+n || 0) * 100) / 100;
  var p = n.toFixed(2).split('.'), i = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return 'R$ ' + i + ',' + p[1];
}
function moedaCurta(n) { return n >= 10000 ? 'R$ ' + num1(n / 1000) + ' mil' : moeda(n).replace(/,00$/, ''); }
function campoMoeda(v) { var n = valor(v); return n ? n.toFixed(2).replace('.', ',') : ''; }
function nomeChamado(p) { return String(p.apelido || '').trim() || pri(p.nome); }
function num1(x) { return (Math.round(x * 10) / 10).toFixed(1).replace('.', ','); }
var toastT;
function toast(msg, ms) { var t = $('toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toastT); toastT = setTimeout(function () { t.style.display = 'none'; }, ms || 2800); }
function carregando(on, txt) { $('carregando').classList.toggle('on', !!on); $('carregando-txt').textContent = txt || 'Carregando...'; }

var DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
var PAPEL_NOME = { master: 'Master', pastor: 'Pastor(a)', supervisor: 'Supervisor', lider: 'Líder', discipulo: 'Discípulo', secretaria: 'Secretaria', tesouraria: 'Tesouraria', voluntario: 'Voluntário', voluntarioLV: 'Voluntário Lar de Vida', voluntarioInst: 'Voluntário Instituto', profissional: 'Profissional de saúde' };
var ETAPAS = ['1. Visitou', '2. Frequentando', '3. Membro da igreja', '4. Batizado', '5. Em discipulado', '6. Em formação de líder'];
var CANAIS = ['Evangelismo', 'Convite de membros', 'GC', 'Redes sociais', 'Outros'];

/* ───────── SHA-256 (puro JS, funciona em qualquer navegador) ───────── */
function sha256(str) {
  var utf8 = unescape(encodeURIComponent(str)), i, j;
  var K = [], H = [], primo = 2, n = 0;
  function frac(x) { return ((x - Math.floor(x)) * 4294967296) | 0; }
  while (n < 64) {
    var ok = true;
    for (i = 2; i * i <= primo; i++) if (primo % i === 0) { ok = false; break; }
    if (ok) { if (n < 8) H[n] = frac(Math.pow(primo, 1 / 2)); K[n] = frac(Math.pow(primo, 1 / 3)); n++; }
    primo++;
  }
  var bytes = [];
  for (i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));
  var bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  var hi = Math.floor(bitLen / 4294967296), lo = bitLen >>> 0;
  bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255, (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
  function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
  for (i = 0; i < bytes.length; i += 64) {
    var w = [];
    for (j = 0; j < 16; j++) w[j] = (bytes[i + j * 4] << 24) | (bytes[i + j * 4 + 1] << 16) | (bytes[i + j * 4 + 2] << 8) | bytes[i + j * 4 + 3];
    for (j = 16; j < 64; j++) {
      var s0 = rr(w[j - 15], 7) ^ rr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      var s1 = rr(w[j - 2], 17) ^ rr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }
    var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (j = 0; j < 64; j++) {
      var S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25), ch = (e & f) ^ (~e & g);
      var t1 = (h + S1 + ch + K[j] + w[j]) | 0;
      var S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22), mj = (a & b) ^ (a & c) ^ (b & c);
      var t2 = (S0 + mj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
}
function hashSenha(usuario, senha) { return sha256(String(usuario).toLowerCase().trim() + ':' + senha); }
window.__sha256 = sha256;

/* ───────── comunicação com o servidor ───────── */
var JN = 0;
function jsonp(params, ms) {
  return new Promise(function (res, rej) {
    if (!cfg.url) return rej(new Error('Servidor não configurado.'));
    var cb = '__gc' + (++JN) + '_' + Date.now(), qs = [];
    for (var k in params) if (params[k] !== undefined && params[k] !== null) qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
    qs.push('callback=' + cb);
    var s = document.createElement('script');
    var tm = setTimeout(function () { fim(); rej(new Error('Tempo esgotado. Verifique a internet.')); }, ms || 30000);
    function fim() { clearTimeout(tm); try { delete window[cb]; } catch (e) { window[cb] = undefined; } if (s.parentNode) s.parentNode.removeChild(s); }
    window[cb] = function (j) { fim(); res(j); };
    s.onerror = function () { fim(); rej(new Error('Não foi possível falar com o servidor. Verifique a internet ou a publicação do Apps Script.')); };
    s.src = cfg.url + (cfg.url.indexOf('?') >= 0 ? '&' : '?') + qs.join('&');
    document.head.appendChild(s);
  });
}
function fatiar(txt) {
  var partes = [], i = 0;
  while (i < txt.length) {
    var tam = 1800;
    while (tam > 100 && encodeURIComponent(txt.substr(i, tam)).length > 1900) tam = Math.floor(tam * 0.8);
    partes.push(txt.substr(i, tam)); i += tam;
  }
  return partes;
}
/** PWA: POST text/plain (requisição simples, sem pré-checagem de CORS). Os dados vão só no corpo. */
function postar(json) {
  var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var tm = setTimeout(function () { if (ctl) ctl.abort(); }, 45000);
  return fetch(URL_PADRAO, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: json, redirect: 'follow', credentials: 'omit', signal: ctl ? ctl.signal : undefined })
    .then(function (r) { if (!r.ok) throw new Error('Servidor respondeu ' + r.status + '.'); return r.text(); })
    .then(function (t) { try { return JSON.parse(t); } catch (e) { throw new Error('Resposta inválida do servidor. Confira a publicação do Apps Script.'); } })
    .catch(function (e) { throw new Error(e && e.name === 'AbortError' ? 'Tempo esgotado. Verifique a internet.' : (e && e.message && /Servidor|Resposta/.test(e.message) ? e.message : 'Sem conexão com o servidor. Verifique a internet.')); })
    .then(function (x) { clearTimeout(tm); return x; }, function (e) { clearTimeout(tm); throw e; });
}
function chamarBruto(req, progresso) {
  var json = JSON.stringify(req);
  if (MODO_SCRIPT) {
    return new Promise(function (res, rej) {
      google.script.run.withSuccessHandler(function (r) { try { res(JSON.parse(r)); } catch (e) { rej(new Error('Resposta inválida')); } })
        .withFailureHandler(function (e) { rej(new Error((e && e.message) || String(e))); }).api(json);
    });
  }
  if (MODO_PWA) return postar(json);
  if (encodeURIComponent(json).length <= 1900) return jsonp({ d: json });
  var partes = fatiar(json), sid = 's' + Date.now() + Math.floor(Math.random() * 1e4), p = Promise.resolve();
  partes.forEach(function (parte, i) {
    p = p.then(function () {
      if (progresso) progresso(i + 1, partes.length);
      return jsonp({ acao: 'up', sid: sid, i: i, n: partes.length, parte: parte }).then(function (r) { if (!r || !r.ok) throw new Error((r && r.erro) || 'Falha no envio'); });
    });
  });
  return p.then(function () { return jsonp({ acao: 'commit', sid: sid }, 45000); });
}
function chamar(acao, dados, progresso) {
  var req = { acao: acao, token: cfg.token || '' };
  for (var k in (dados || {})) req[k] = dados[k];
  return chamarBruto(req, progresso).then(function (r) {
    if (!r) throw new Error('Resposta vazia do servidor.');
    if (r.sessao === false) { sessaoExpirada(); throw new Error(r.erro); }
    if (r.trocarSenha && cfg.usuario) { cfg.usuario.trocarSenha = true; verificarSenhaTemp(); }
    if (!r.ok) throw new Error(r.erro || 'Falha no servidor.');
    return r;
  });
}

/* ───────── permissões ───────── */
function eu() { return cfg.usuario || {}; }
function papel() { return eu().papel || ''; }
function ehGestor() { return pode('rede'); }
function ehAdmin() { return eu()&&eu()._v39 ? (v39PodeVerUsuarios()||v39PodeVerSolicitacoes()) : pode('usuarios'); }
function editaPessoas() { return pode('gc') || pode('rede') || pode('lvDirecionar'); }

/* ───────── dados ───────── */
function GCS() { return db.gcs.filter(function (g) { return !g.deleted; }); }
function GCSativos() { return GCS().filter(function (g) { return g.status !== 'Inativo'; }); }
function gcPor(id) { for (var i = 0; i < db.gcs.length; i++) if (db.gcs[i].id === id) return db.gcs[i]; return null; }
function gcNome(id) { var g = gcPor(id); return g ? g.nome : '—'; }
function PES(gcId) { return db.pessoas.filter(function (p) { return !p.deleted && (!gcId || p.gcId === gcId); }); }
function ENC(gcId) { return db.encontros.filter(function (e) { return !e.deleted && (!gcId || e.gcId === gcId); }); }
function encOrd(gcId) { return ENC(gcId).slice().sort(function (a, b) { return a.data < b.data ? -1 : 1; }); }
function achaEnc(gcId, data) { var l = ENC(gcId); for (var i = 0; i < l.length; i++) if (l[i].data === data) return l[i]; return null; }
function presentes(e) { var n = 0; for (var k in e.presencas) if (e.presencas[k] === 'P') n++; return n; }
function marcados(e) { return Object.keys(e.presencas || {}).length; }
var VISITAS_PARA_ATIVO = 3;
function lista(e) { if (!e) return { add: [], rem: [] }; var l = e.lista || {}; return { add: (l.add || []).slice(), rem: (l.rem || []).slice() }; }
function visitasDe(p) { var n = 0; ENC(p.gcId).forEach(function (e) { if (e.presencas[p.id] === 'P') n++; }); return n; }
function souLiderDe(g) { return papel() === 'lider' && !!g && g.liderId === eu().id; }
function podeEditarGC(g) { return ehGestor() || souLiderDe(g); }
function fotoGC(id) { var f = fotos[id]; return f && f.data ? f.data : LOGO; }
/** Ícone do GC (barra superior e listas): ícone próprio → foto do GC → ícone da igreja. */
function iconeGC(id) { var ic = fotos[id + '#ic']; if (ic && ic.data) return ic.data; return fotoGC(id); }

function statusDe(p, encs) {
  if (p.status === 'Em visita') return { s: 'visita', faltas: 0 };
  if (p.status !== 'Ativo') return { s: 'inativo', faltas: 0 };
  var es = encs || encOrd(p.gcId), faltas = 0;
  for (var i = es.length - 1; i >= 0; i--) {
    var m = es[i].presencas[p.id];
    if (!m) continue;
    if (m === 'P') break;
    if (m === 'F') faltas++;
  }
  return { s: faltas >= 2 ? 'contatar' : faltas === 1 ? 'atencao' : 'emdia', faltas: faltas };
}
function statsDe(p, encs) {
  var pres = 0, mar = 0;
  (encs || ENC(p.gcId)).forEach(function (e) { var m = e.presencas[p.id]; if (m) { mar++; if (m === 'P') pres++; } });
  return { pres: pres, mar: mar, pct: mar ? pres / mar : 0 };
}
function metricas(gcId) {
  var pes = PES(gcId), encs = encOrd(gcId).filter(function (e) { return marcados(e) > 0; });
  var ativos = pes.filter(function (p) { return p.status === 'Ativo'; });
  var ult = encs.slice(-4), recentes = encs.slice(-8);
  var media = ult.length ? ult.reduce(function (s, e) { return s + presentes(e); }, 0) / ult.length : 0;
  var tp = 0, tm = 0;
  recentes.forEach(function (e) { tm += marcados(e); tp += presentes(e); });
  var vis = pes.filter(function (p) { return p.tipo === 'Visitante'; });
  var vcom = 0, vret = 0;
  vis.forEach(function (p) { var s = statsDe(p, encs); if (s.pres >= 1) vcom++; if (s.pres >= 2) vret++; });
  var mes = hoje().slice(0, 7);
  var ultimo = encs.length ? encs[encs.length - 1].data : '';
  var alertas = 0, atencao = 0;
  ativos.forEach(function (p) { var s = statusDe(p, encs).s; if (s === 'contatar') alertas++; if (s === 'atencao') atencao++; });
  return {
    ativos: ativos.length, membros: ativos.filter(function (p) { return p.tipo === 'Membro'; }).length,
    visitantes: pes.filter(function (p) { return p.tipo === 'Visitante' && (p.status === 'Ativo' || p.status === 'Em visita'); }).length,
    emVisita: pes.filter(function (p) { return p.status === 'Em visita'; }).length,
    media: media, pres: tm ? tp / tm : null, tp: tp, tm: tm, vcom: vcom, vret: vret,
    novos: pes.filter(function (p) { return String(p.prim || '').slice(0, 7) === mes; }).length,
    alertas: alertas, atencao: atencao, ultimo: ultimo,
    diasSem: ultimo ? diasEntre(parseData(ultimo), parseData(hoje())) : null,
    encontros: encs.length
  };
}
function financeiro(gcId, mes) {
  var r = { diz: 0, ofe: 0, enc: 0 };
  ENC(gcId).forEach(function (e) {
    if (mes && String(e.data).slice(0, 7) !== mes) return;
    var d = valor(e.dizimo), o = valor(e.oferta);
    if (d || o) r.enc++;
    r.diz += d; r.ofe += o;
  });
  r.tot = r.diz + r.ofe; return r;
}
function mesesAtras(n, refIso) {
  var out = [], d = parseData(refIso || hoje());
  for (var i = n - 1; i >= 0; i--) { var x = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push(x.getFullYear() + '-' + pad(x.getMonth() + 1)); }
  return out;
}
var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function nomeMes(ym) { return MESES[+ym.slice(5, 7) - 1] + '/' + ym.slice(2, 4); }
function blocoFinanceiro(gcIds, titulo) {
  var meses = mesesAtras(6), soma = function (mes) {
    var r = { diz: 0, ofe: 0, tot: 0 };
    gcIds.forEach(function (id) { var f = financeiro(id, mes); r.diz += f.diz; r.ofe += f.ofe; r.tot += f.tot; });
    return r;
  };
  var atual = soma(meses[5]), ant = soma(meses[4]), por = meses.map(soma), mx = 1;
  por.forEach(function (x) { if (x.tot > mx) mx = x.tot; });
  var varia = ant.tot ? (atual.tot - ant.tot) / ant.tot : null;
  return '<div class="sec">' + titulo + '</div><div class="card">' +
    '<div class="kpis" style="margin-bottom:6px">' +
    '<div class="kpi dk"><div class="v" style="font-size:20px">' + moeda(atual.tot) + '</div><div class="l">Total em ' + nomeMes(meses[5]) + '</div></div>' +
    '<div class="kpi"><div class="v" style="font-size:20px">' + (varia === null ? '—' : (varia >= 0 ? '+' : '') + Math.round(varia * 100) + '%') + '</div><div class="l">vs. ' + nomeMes(meses[4]) + ' (' + moedaCurta(ant.tot) + ')</div></div>' +
    '<div class="kpi"><div class="v" style="font-size:18px">' + moeda(atual.diz) + '</div><div class="l">Dízimos no mês</div></div>' +
    '<div class="kpi"><div class="v" style="font-size:18px">' + moeda(atual.ofe) + '</div><div class="l">Ofertas no mês</div></div></div>' +
    '<div class="spark" style="margin-top:24px">' + por.map(function (x, i) {
      return '<div style="height:' + Math.max(3, x.tot / mx * 100) + '%;' + (x.tot ? '' : 'background:#e5e5e5') + '"><b>' + (x.tot ? moedaCurta(x.tot).replace('R$ ', '') : '') + '</b><u>' + nomeMes(meses[i]) + '</u></div>';
    }).join('') + '</div><div style="font-size:11px;color:#999">Valores lançados na tela Chamada de cada encontro.</div></div>';
}
/* ───────── sexo, tipo de GC e endereço ───────── */
var TIPOS_GC = ['Homens', 'Mulheres', 'Jovens e adolescentes'];
var IDADE_JOVENS = 25;          // até esta idade o GC de jovens e adolescentes aparece entre os sugeridos
function idadeDe(p) {
  var n = parseData(p && p.nasc); if (!n) return null;
  var h = parseData(hoje()), a = h.getFullYear() - n.getFullYear();
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) a--;
  return a;
}
/** O GC é adequado para a pessoa? (sexo → Homens/Mulheres; idade → Jovens e adolescentes) */
function numOuNulo(v) { var t = String(v == null ? '' : v).trim(); return t === '' || isNaN(+t) ? null : +t; }
/** Faixa etária do GC: usa a do cadastro quando preenchida; GC de jovens sem faixa usa até IDADE_JOVENS. */
function faixaGC(g) {
  var min = numOuNulo(g.idadeMin), max = numOuNulo(g.idadeMax);
  if (min === null && max === null && g.tipoGC === 'Jovens e adolescentes') max = IDADE_JOVENS;
  return { min: min, max: max };
}
function faixaTexto(g) {
  var f = faixaGC(g);
  if (f.min === null && f.max === null) return '';
  if (f.min !== null && f.max !== null) return f.min + ' a ' + f.max + ' anos';
  return f.min !== null ? 'a partir de ' + f.min + ' anos' : 'até ' + f.max + ' anos';
}
/** Público do GC: Homens → Masculino; Mulheres → Feminino; Jovens → o definido no GC (vazio = misto). */
function publicoGC(g) { return g.tipoGC === 'Homens' ? 'Masculino' : g.tipoGC === 'Mulheres' ? 'Feminino' : (g.sexoGC || ''); }
function naFaixaGC(f, i) { return !(f.min !== null && (i === null || i < f.min)) && !(f.max !== null && (i === null || i > f.max)); }
/** Está na idade de algum GC de jovens? (lista enviada pelo servidor; sem GC de jovens: até IDADE_JOVENS) */
function ehJovem(p) {
  var i = idadeDe(p); if (i === null) return false;
  var jov = db.jovens || GCSativos().filter(function (g) { return g.tipoGC === 'Jovens e adolescentes'; }).map(faixaGC);
  if (!jov.length) return i <= IDADE_JOVENS;
  return jov.some(function (f) { return naFaixaGC(f, i); });
}
/** Regra: jovens só no GC de jovens do mesmo público; adultos no GC do mesmo sexo; faixa etária respeitada. */
function gcCompativel(g, p) {
  var pub = publicoGC(g), i = idadeDe(p);
  if (pub && pub !== p.sexo) return false;
  if (!naFaixaGC(faixaGC(g), i)) return false;
  var jovem = ehJovem(p);
  if (g.tipoGC === 'Jovens e adolescentes') return jovem;
  if (g.tipoGC !== 'Homens' && g.tipoGC !== 'Mulheres') return false;
  return !jovem;
}
function ehDecisor() { return papel() === 'master' || papel() === 'pastor'; }
var PASTOR = '__pastor__';
function enderecoTexto(p) {
  var rua = [p.endereco, p.numero].filter(function (x) { return String(x || '').trim(); }).join(', ');
  return [rua + (p.complemento ? ' - ' + p.complemento : ''), separarBairroCidade(p.bairro, p.cidade).bairro].filter(Boolean).join(' · ');
}
function camposEndereco(px, p, dis) {
  return '<label>Endereço (rua)</label><input id="' + px + '-endereco" value="' + esc(p ? p.endereco : '') + '" placeholder="Ex.: Rua das Flores"' + dis + '>' +
    '<div class="g2"><div><label>Número</label><input id="' + px + '-numero" inputmode="numeric" value="' + esc(p ? p.numero : '') + '" placeholder="Ex.: 120"' + dis + '></div>' +
    '<div><label>Complemento</label><input id="' + px + '-complemento" value="' + esc(p ? p.complemento : '') + '" placeholder="Apto, fundos..."' + dis + '></div></div>';
}
function campoSexo(px, p, dis, obrig) {
  return '<label>Sexo' + (obrig ? ' *' : '') + '</label><select id="' + px + '-sexo"' + dis + '>' +
    opts([['', '— selecionar —'], ['Masculino', 'Masculino'], ['Feminino', 'Feminino']], p ? p.sexo : '') + '</select>';
}

/* ───────── endereço: CEP, bairro e cidade ───────── */
function soDigitos(t) { return String(t || '').replace(/\D/g, ''); }
function mascaraCep(t) { var d = soDigitos(t).slice(0, 8); return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d; }
/** Cadastros antigos tinham "Bairro - Cidade" no mesmo campo. Separa sem perder nada. */
function separarBairroCidade(bairro, cidade) {
  bairro = String(bairro || '').trim(); cidade = String(cidade || '').trim();
  if (!cidade) {
    var m = bairro.match(/^(.+?)\s+[-–]\s+(.+)$/);
    if (m && m[2].length >= 3 && !/^(i{1,3}|iv|vi{0,3}|\d+)$/i.test(m[2].trim())) { bairro = m[1].trim(); cidade = m[2].trim(); }
  }
  return { bairro: bairro, cidade: cidade };
}
function cidadePadrao(gcId) { var g = gcPor(gcId || gcA()); return (g && g.cidade) || cidadeIgreja(); }
var CN = 0;
/** Consulta o CEP no ViaCEP (gratuito). Usa JSONP: funciona no arquivo local e no Apps Script. */
function buscarCep(cep) {
  var d = soDigitos(cep);
  if (d.length !== 8) return Promise.reject(new Error('CEP deve ter 8 números.'));
  return fetch('https://viacep.com.br/ws/' + d + '/json/', { credentials: 'omit' })
    .then(function (r) { return r.json(); }, function () { throw new Error('Sem conexão para consultar o CEP.'); })
    .then(function (j) {
      if (!j || j.erro) throw new Error('CEP não encontrado.');
      return { logradouro: j.logradouro || '', bairro: j.bairro || '', cidade: (j.localidade || '') + (j.uf ? '/' + j.uf : '') };
    });
}
/** Preenche bairro/cidade (e rua, no GC) a partir do CEP digitado. */
function aplicarCep(prefixo) {
  var campo = $(prefixo + '-cep'), info = $(prefixo + '-cepinfo');
  if (!campo) return;
  var d = soDigitos(campo.value);
  if (d.length !== 8) { if (info) info.textContent = ''; return; }
  if (info) { info.style.color = '#999'; info.textContent = 'Consultando CEP...'; }
  buscarCep(d).then(function (r) {
    if (soDigitos(campo.value) !== d) return;
    if (r.bairro && $(prefixo + '-bairro')) { $(prefixo + '-bairro').value = bairroDaLista(r.bairro) || r.bairro; bairroSync(prefixo); }
    if (r.cidade && $(prefixo + '-cidade')) $(prefixo + '-cidade').value = r.cidade;
    if (prefixo === 'v' && lvModoCad === 'membro') setTimeout(lvAtualizarGC, 0);
    if (r.logradouro && $(prefixo + '-endereco') && !$(prefixo + '-endereco').value.trim()) $(prefixo + '-endereco').value = r.logradouro + ($(prefixo + '-numero') ? '' : ', ');
    if (info) {
      info.style.color = '#1f6b40';
      info.textContent = 'CEP encontrado: ' + [r.bairro, r.cidade].filter(Boolean).join(' · ') +
        (r.bairro ? '' : ' — esta cidade usa CEP único; preencha o bairro manualmente.');
    }
  }).catch(function (e) { if (info) { info.style.color = '#a12424'; info.textContent = e.message + ' Preencha bairro e cidade manualmente.'; } });
}

/* ───────── mapa de calor por bairro ───────── */
var K_GEO = 'gcbv5_geo', geo = lerJSON(K_GEO, {}), pedindoGeo = false, mapaObj = null, mapaGcs = null, leafletPromessa = null;
var CENTRO_PADRAO = [-21.6033, -48.3658];   // Matão/SP
function normalizar(t) {
  t = String(t || '').toLowerCase().trim().replace(/\s+/g, ' ');
  try { t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
  return t.replace(/^(jd\.?|jardim) /, 'jardim ').replace(/^(vl\.?|vila) /, 'vila ').replace(/^(pq\.?|parque) /, 'parque ');
}
/** Nome do bairro por extenso para a busca no mapa (Jd. → Jardim, Vl. → Vila, Pq. → Parque). */
function bairroPorExtenso(t) {
  return String(t || '').trim().replace(/^jd\.?\s+/i, 'Jardim ').replace(/^vl\.?\s+/i, 'Vila ').replace(/^pq\.?\s+/i, 'Parque ').replace(/^res\.?\s+/i, 'Residencial ');
}
function chaveCidade(c) { return normalizar(c).replace(/\s*([\/,-]|\s)\s*[a-z]{2}$/, '').trim(); }
var mapaOpts = {};
function dadosBairros(gcIds, semGC) {
  var mapa = {}, semBairro = 0;
  gcIds.concat(semGC ? ['__semgc__'] : []).forEach(function (gid) {
    var g = gcPor(gid), cidadeGC = (g && g.cidade) || 'Matão/SP';
    var lista = gid === '__semgc__' ? PES().filter(function (p) { return !p.gcId; }) : PES(gid);
    lista.forEach(function (p) {
      if (p.status !== 'Ativo' && p.status !== 'Em visita') return;
      var e = separarBairroCidade(p.bairro, p.cidade);
      if (!e.bairro) { semBairro++; return; }
      var cidade = e.cidade || cidadeGC;
      var chave = normalizar(e.bairro) + '|' + chaveCidade(cidade);
      if (!mapa[chave]) mapa[chave] = { chave: chave, bairro: e.bairro, cidade: cidade, n: 0 };
      mapa[chave].n++;
    });
  });
  var lst = Object.keys(mapa).map(function (k) { return mapa[k]; }).sort(function (a, b) { return b.n - a.n; });
  return { lista: lst, semBairro: semBairro };
}
function gcsNoMapa(gcIds) {
  return gcIds.map(gcPor).filter(function (g) { return g && g.bairro; })
    .map(function (g) { return { g: g, chave: geoChave(g.bairro, g.cidade), bairro: g.bairro, cidade: g.cidade || 'Matão/SP' }; });
}
function blocoMapa(gcIds, titulo, opts) {
  mapaOpts = opts || {};
  var d = dadosBairros(gcIds, mapaOpts.semGC), tot = d.lista.reduce(function (s2, x) { return s2 + x.n; }, 0);
  mapaGcs = gcIds;
  var h = '<div class="sec">' + titulo + '</div><div class="card" style="padding:10px">';
  if (!d.lista.length) return h + '<div class="empty">Preencha <b>bairro e cidade</b> no cadastro das pessoas para ver o mapa.</div></div>';
  var cids = {}; d.lista.forEach(function (x) { cids[chaveCidade(x.cidade)] = 1; });
  var multiCidade = Object.keys(cids).length > 1;
  h += '<div id="mapa-calor" style="height:280px;border-radius:12px;overflow:hidden;background:#eef0f2;position:relative;z-index:1"><div class="empty" style="padding-top:110px">Carregando mapa...</div></div>' +
    (mapaOpts.gcs ? '<div style="display:flex;align-items:center;gap:6px;font-size:10.5px;color:#555;margin:8px 2px 0">' +
      '<span style="width:12px;height:12px;border-radius:50%;background:#111;border:2px solid var(--dourado);display:inline-block"></span>local dos GCs (' + gcsNoMapa(gcIds).length + ')</div>' : '') +
    '<div style="display:flex;align-items:center;gap:8px;font-size:10.5px;color:#888;margin:8px 2px 10px"><span>menos</span>' +
    '<span style="flex:1;height:7px;border-radius:5px;background:linear-gradient(90deg,#3b82f6,#22c55e,#facc15,#f97316,#dc2626)"></span><span>mais frequentadores</span></div>';
  h += d.lista.slice(0, 8).map(function (x) {
    return '<div class="fun"><div class="t"><span>' + esc(x.bairro) + (multiCidade ? ' <span style="color:#999;font-weight:500">· ' + esc(x.cidade) + '</span>' : '') + '</span><span>' + x.n + ' · ' + pct(x.n / tot) + '</span></div><div class="bar"><i style="width:' + (x.n / d.lista[0].n * 100) + '%"></i></div></div>';
  }).join('');
  if (d.lista.length > 8) h += '<div style="font-size:11px;color:#999">+ ' + (d.lista.length - 8) + ' outro(s) bairro(s)</div>';
  if (d.semBairro) h += '<div style="font-size:11px;color:#a87700;margin-top:6px">' + d.semBairro + ' pessoa(s) sem bairro no cadastro não aparecem no mapa.</div>';
  return h + '</div>';
}
function carregarLeaflet() {
  if (window.L && window.L.heatLayer) return Promise.resolve();
  if (leafletPromessa) return leafletPromessa;
  leafletPromessa = new Promise(function (res, rej) {
    var embCss = $('lib-leaflet-css'), embJs = $('lib-leaflet');
    if (embJs) {                                     // versão do Apps Script: bibliotecas embutidas na página
      try {
        if (embCss && !$('css-leaflet-ativo')) { var st = document.createElement('style'); st.id = 'css-leaflet-ativo'; st.textContent = embCss.textContent; document.head.appendChild(st); }
        var se = document.createElement('script'); se.textContent = embJs.textContent; document.head.appendChild(se);
        if (window.L && window.L.heatLayer) return res();
      } catch (e) {}
      leafletPromessa = null; return rej(new Error('mapa não carregou'));
    }
    if (!$('css-leaflet')) { var lk = document.createElement('link'); lk.id = 'css-leaflet'; lk.rel = 'stylesheet'; lk.href = 'lib/leaflet.css'; document.head.appendChild(lk); }
    var sc = document.createElement('script'); sc.src = 'lib/leaflet.js';
    sc.onload = function () { if (window.L && window.L.heatLayer) res(); else { leafletPromessa = null; rej(new Error('mapa não carregou')); } };
    sc.onerror = function () { leafletPromessa = null; rej(new Error('mapa indisponível')); };
    document.head.appendChild(sc);
  });
  return leafletPromessa;
}
function buscarGeo(lst) {
  var falta = lst.filter(function (x) { return !(x.chave in geo); });
  if (!falta.length || pedindoGeo || !cfg.token) return Promise.resolve(false);
  pedindoGeo = true;
  return chamar('bairros', { itens: falta.slice(0, 60).map(function (x) { return { chave: x.chave, bairro: bairroPorExtenso(x.bairro), cidade: x.cidade }; }) })
    .then(function (r) {
      (r.pontos || []).forEach(function (p) { geo[p.chave] = p.lat !== null && p.lng !== null ? [p.lat, p.lng] : null; });
      lsSet(K_GEO, JSON.stringify(geo));
      return true;
    })
    .catch(function () { return false; })
    .then(function (mudou) { pedindoGeo = false; return mudou; });
}
/* Fundo do mapa: OpenStreetMap (sem chave). Se falhar em sequência, troca para o mapa de ruas da Esri. */
var FUNDOS_MAPA = [
  { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', opt: { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' } },
  { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', opt: { maxZoom: 19, attribution: 'Tiles &copy; Esri' } }
];
function adicionarFundoMapa(m, i) {
  i = i || 0;
  var f = FUNDOS_MAPA[i]; if (!f) return;
  var erros = 0, ok = 0, camada = L.tileLayer(f.url, f.opt);
  camada.on('tileload', function () { ok++; });
  camada.on('tileerror', function () {
    erros++;
    if (erros >= 4 && ok === 0 && FUNDOS_MAPA[i + 1]) { m.removeLayer(camada); adicionarFundoMapa(m, i + 1); }
  });
  camada.addTo(m);
}
function desenharMapa() {
  var el = $('mapa-calor');
  if (mapaObj) { try { mapaObj.remove(); } catch (e) {} mapaObj = null; }
  if (!el || !mapaGcs) return;
  var d = dadosBairros(mapaGcs, mapaOpts.semGC), gpts = mapaOpts.gcs ? gcsNoMapa(mapaGcs) : [];
  carregarLeaflet().then(function () {
    if (!document.body.contains(el)) return;
    var pts = d.lista.filter(function (x) { return geo[x.chave]; });
    var gOk = gpts.filter(function (x) { return geo[x.chave]; });
    el.innerHTML = '';
    var m = L.map(el, { zoomControl: true, scrollWheelZoom: false, attributionControl: true, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView(CENTRO_PADRAO, 13);
    mapaObj = m;
    adicionarFundoMapa(m);
    var mx = 1; pts.forEach(function (x) { if (x.n > mx) mx = x.n; });
    if (pts.length) {
      L.heatLayer(pts.map(function (x) { return [geo[x.chave][0], geo[x.chave][1], 0.35 + 0.65 * x.n / mx]; }),
        { radius: 38, blur: 28, minOpacity: 0.45, maxZoom: 15, max: 1,
          gradient: { 0.2: '#3b82f6', 0.45: '#22c55e', 0.65: '#facc15', 0.82: '#f97316', 1: '#dc2626' } }).addTo(m);
      pts.forEach(function (x) {
        L.circleMarker(geo[x.chave], { radius: 5, color: '#111', weight: 1, fillColor: '#fff', fillOpacity: 0.9 })
          .bindTooltip('<b>' + esc(x.bairro) + '</b><br>' + x.n + ' frequentador(es)').addTo(m);
      });
    }
    // GCs com o mesmo bairro ficam lado a lado (pequeno deslocamento)
    var usados = {};
    gOk.forEach(function (x) {
      var k = x.chave, n = usados[k] = (usados[k] || 0) + 1, c = geo[k];
      var pos = [c[0] + (n - 1) * 0.0012, c[1] + (n - 1) * 0.0012];
      L.marker(pos, { icon: L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11],
        html: '<div style="width:22px;height:22px;border-radius:50%;background:#111;border:3px solid #E0AC2E;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>' }) })
        .bindTooltip('<b>' + esc(x.g.nome) + '</b><br>' + esc(x.g.tipoGC || '') + (x.g.liderNome ? ' · ' + esc(x.g.liderNome) : '') + '<br>' + esc(x.bairro)).addTo(m);
    });
    var todos = pts.map(function (x) { return geo[x.chave]; }).concat(gOk.map(function (x) { return geo[x.chave]; }));
    if (todos.length === 1) m.setView(todos[0], 14);
    else if (todos.length > 1) m.fitBounds(todos, { padding: [30, 30], maxZoom: 15 });
    var faltam = d.lista.length - pts.length + gpts.length - gOk.length;
    if (faltam && !pedindoGeo) {
      buscarGeo(d.lista.concat(gpts)).then(function (mudou) { if (mudou && $('mapa-calor') === el) desenharMapa(); });
    }
  }).catch(function (err) {
    window.__mapaErro = String(err && (err.stack || err.message) || err);
    el.innerHTML = '<div class="empty" style="padding-top:100px">Mapa indisponível sem internet.<br>A lista de bairros abaixo continua válida.</div>';
  });
}
function proximoEncontro(g) {
  if (!g || g.diaSemana === '' || g.diaSemana == null) return '';
  var d = parseData(hoje()), alvo = +g.diaSemana;
  while (d.getDay() !== alvo) d.setDate(d.getDate() + 1);
  if (g.frequencia === 'Quinzenal' && g.inicio) {
    var ini0 = parseData(g.inicio);
    while (ini0 && diasEntre(ini0, d) % 14 !== 0) d.setDate(d.getDate() + 7);
  }
  return isoData(d);
}
function ultimoDiaEncontro(g) {
  if (!g || g.diaSemana === '' || g.diaSemana == null) return hoje();
  var d = parseData(hoje()), alvo = +g.diaSemana;
  while (d.getDay() !== alvo) d.setDate(d.getDate() - 1);
  return isoData(d);
}

/* ───────── sincronização ───────── */
var sincronizando = false, timerSync = null;
function pendentesLocais() {
  return {
    pessoas: db.pessoas.filter(function (p) { return p._pend; }).map(limpo),
    encontros: db.encontros.filter(function (e) { return e._pend; }).map(limpo)
  };
}
function limpo(o) { var c = {}; for (var k in o) if (k !== '_pend') c[k] = o[k]; return c; }
function chaveE(e) { return e.gcId + '|' + e.data; }

function sincronizar(avisar) {
  if (!cfg.token) return Promise.resolve();
  if (sincronizando) return Promise.resolve();
  sincronizando = true; pintarStatus('Sincronizando...');
  var env = pendentesLocais();
  if (!env.pessoas.length && !env.encontros.length && cfg.hashSync && db.pessoas) env.hash = cfg.hashSync;
  var mapP = {}, mapE = {};
  env.pessoas.forEach(function (p) { mapP[p.id] = p.updatedAt; });
  env.encontros.forEach(function (e) { mapE[chaveE(e)] = e.updatedAt; });
  return chamar('sync', { dados: env }, function (i, n) { pintarStatus('Enviando ' + i + '/' + n + '...'); })
    .then(function (r) {
      if (r.usuario && cfg.usuario && r.usuario.id === cfg.usuario.id) { cfg.usuario = r.usuario; setTimeout(verificarSenhaTemp, 200); }
      if (r.semMudanca) {                                    // nada mudou no servidor: não reprocessa nem redesenha
        cfg.ultima = agora(); salvarCfg(); if (avisar) toast('Sincronizado ✓');
        return;
      }
      var d = r.dados;
      cfg.hashSync = r.hash || '';
      // preserva o que foi alterado durante o envio
      var locaisP = db.pessoas.filter(function (p) { return p._pend && mapP[p.id] !== p.updatedAt; });
      var locaisE = db.encontros.filter(function (e) { return e._pend && mapE[chaveE(e)] !== e.updatedAt; });
      var np = d.pessoas.map(function (p) { p.deleted = !!p.deleted; return p; });
      locaisP.forEach(function (l) { np = np.filter(function (p) { return p.id !== l.id; }); np.push(l); });
      var ne = d.encontros.map(function (e) { e.deleted = !!e.deleted; e.presencas = e.presencas || {}; e.lista = lista(e); return e; });
      locaisE.forEach(function (l) { ne = ne.filter(function (e) { return chaveE(e) !== chaveE(l); }); ne.push(l); });
      db.pessoas = np; db.encontros = ne; db.gcs = d.gcs || [];
      db.equipe = d.equipe || []; db.pendentes = d.pendentes || 0; db.alertas = d.alertas || []; db.eventos = d.eventos || [];
        db.reunioes = d.reunioes || []; db.aulas = d.aulas || []; db.equipeInst = d.equipeInst || []; db.jovens = d.jovens || null; db.waApi = !!d.waApi; db.equipeGC = d.equipeGC || []; db.mural = d.mural || []; db.voluntariosLV = d.voluntariosLV || [];
      atualizarConfig(d.config).then(function (mudou) { if (mudou) render(); });
      if (r.usuario && cfg.usuario && r.usuario.id === cfg.usuario.id) { cfg.usuario = r.usuario; setTimeout(verificarConsentimento, 300); }
      cfg.ultima = agora(); salvarCfg(); salvarDB();
      if (r.duplicados && r.duplicados.length) toast('Cadastro não criado: ' + r.duplicados.join(' · ') + '. Use o cadastro existente.', 7000);
      else if (r.rejeitados) toast(modoVisitante() ? msgBloqueioCadastro() : r.rejeitados + ' alteração(ões) recusada(s) por falta de permissão.', 5000);
      else if (avisar) toast('Sincronizado ✓');
      validarContexto();
      try { notificarNovos(); } catch (eN) {}
      render();
      return buscarFotos().then(enviarFotosPend).then(buscarFotosPessoas).then(function (m) { if (m) render(); });
    })
    .catch(function (e) {
      pintarStatus('Sem conexão — dados salvos no aparelho');
      if (avisar) toast(e.message, 4500);
    })
    .then(function () { sincronizando = false; setTimeout(pintarStatus, 1500); });
}
function buscarFotos() {
  var falta = db.gcs.filter(function (g) {
    return (g.temFoto && (!fotos[g.id] || fotos[g.id].v !== g.fotoV)) || (g.temIcone && (!fotos[g.id + '#ic'] || fotos[g.id + '#ic'].v !== g.iconeV));
  });
  var semFoto = db.gcs.filter(function (g) { return (!g.temFoto && fotos[g.id]) || (!g.temIcone && fotos[g.id + '#ic']); });
  semFoto.forEach(function (g) { if (!g.temFoto) delete fotos[g.id]; if (!g.temIcone) delete fotos[g.id + '#ic']; });
  if (!falta.length) { if (semFoto.length) { salvarFotos(); render(); } return Promise.resolve(); }
  return chamar('fotos', { gcs: falta.map(function (g) { return g.id; }) }).then(function (r) {   // todas numa chamada só
    (r.itens || []).forEach(function (x) {
      if (x.foto) fotos[x.gc] = { v: x.fotoV, data: x.foto }; else delete fotos[x.gc];
      if (x.icone) fotos[x.gc + '#ic'] = { v: x.iconeV, data: x.icone }; else delete fotos[x.gc + '#ic'];
    });
    salvarFotos(); render();
  }).catch(function () {});
}
function sincAuto() { clearTimeout(timerSync); timerSync = setTimeout(function () { sincronizar(false); }, 2500); }
function pintarStatus(txt) {
  var el = $('h-sub'); if (!el) return;
  if (txt) { el.textContent = txt; return; }
  var pend = pendentesLocais(), np = pend.pessoas.length + pend.encontros.length;
  var base = eu().nome ? pri(eu().nome) + ' · ' : '';
  if (np) el.textContent = base + np + ' alteração(ões) aguardando envio';
  else el.textContent = base + (cfg.ultima ? 'Sincronizado ' + horaLocal(cfg.ultima) : 'Conectando...');
}

/* ───────── autenticação ───────── */
function mostrarTela(id) {
  ['s-login', 's-cadastro', 's-app'].forEach(function (x) { $(x).classList.toggle('hide', x !== id); });
  window.scrollTo(0, 0);
}
function erroEm(id, msg) { var el = $(id); el.textContent = msg; el.classList.toggle('hide', !msg); }

function entrar() {
  var u=$('l-usuario').value.trim().toLowerCase(), senha=$('l-senha').value;
  if(!u||!senha){erroEm('l-erro','Informe e-mail e senha.');return;}
  erroEm('l-erro','');$('b-entrar').disabled=true;carregando(true,'Entrando...');
  var op=sbDisponivel()?sbEntrar(u,senha).then(function(){return{supabase:true,usuario:cfg.usuario};}):(v39Ambiente()?Promise.reject(new Error(sbErroConfig())):chamar('login',{usuario:u,h:hashSenha(u,senha)}));
  op.then(function(r){
    if(!r.supabase){var trocou=cfg.usuario&&cfg.usuario.id!==r.usuario.id;if(trocou){db={pessoas:[],encontros:[],gcs:[],equipe:[],pendentes:0};fotos={};salvarDB();salvarFotos();}cfg.token=r.token;cfg.usuario=r.usuario;cfg.ultima='';cfg.hashSync='';setTimeout(verificarSenhaTemp,250);setTimeout(verificarConsentimento,300);}
    cfg.modo=ehGestor()?'ger':'gc';cfg.gcAtual='';cfg.aba='';salvarCfg();$('l-senha').value='';if(r.supabase)return v39AbrirApp();iniciarApp();return sincronizar(false);
  }).catch(function(e){erroEm('l-erro',(e&&e.message)||'Falha no login.');}).then(function(){$('b-entrar').disabled=false;carregando(false);});
}
function abrirCadastro() {
  mostrarTela('s-cadastro'); $('cad-form').classList.remove('hide'); $('cad-ok').classList.add('hide'); erroEm('c-erro', '');
  var sel=$('c-gc');sel.innerHTML='<option value="">Carregando...</option>';
  v39ListarGCsPublicos().then(function(r){var gs=v39Itens(r);sel.innerHTML='<option value="">Ainda não participo / não sei</option>'+gs.map(function(g){return '<option value="'+esc(g.id||g.growth_group_id)+'">'+esc(g.name||g.nome)+'</option>';}).join('');}).catch(function(e){console.warn('[v39 cadastro GCs]',e);sel.innerHTML='<option value="">Ainda não participo / não sei</option>';});
}
function cadastrar() {
  var v = function (id) { return $(id).value.trim(); };
  var u = v('c-usuario').toLowerCase();
  if (!v('c-nome')) return erroEm('c-erro', 'Informe o nome completo.');
  if (!/^[a-z0-9._-]{3,30}$/.test(u)) return erroEm('c-erro', 'Usuário: de 3 a 30 caracteres, sem espaços ou acentos (letras, números, ponto, hífen).');
  if ($('c-senha').value.length < 6) return erroEm('c-erro', 'A senha precisa ter pelo menos 6 caracteres.');
  if ($('c-senha').value !== $('c-senha2').value) return erroEm('c-erro', 'As senhas não conferem.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(($('c-email').value || '').trim())) return erroEm('c-erro', 'Informe um e-mail válido — ele é usado para recuperar a senha.');
  if (!$('c-aceite').checked) return erroEm('c-erro', 'Para se cadastrar, leia e aceite a Política de Privacidade.');
  erroEm('c-erro', ''); $('b-cadastrar').disabled = true; carregando(true, 'Enviando cadastro...');
  (sbDisponivel()?v39CadastrarAcesso({nome:v('c-nome'),usuario:u,fone:v('c-fone'),email:v('c-email'),gcId:v('c-gc'),papel:v('c-papel'),obs:v('c-obs')},$('c-senha').value):chamar('cadastro', { nome: v('c-nome'), usuario: u, fone: v('c-fone'), email: v('c-email'), h: hashSenha(u, $('c-senha').value), gcSolicitado: v('c-gc'), papelSolicitado: v('c-papel'), obs: v('c-obs'), aceite: true }))
    .then(function () {
      $('cad-form').classList.add('hide'); $('cad-ok').classList.remove('hide'); $('c-aceite').checked = false;
      ['c-nome', 'c-usuario', 'c-fone', 'c-email', 'c-senha', 'c-senha2', 'c-obs'].forEach(function (id) { $(id).value = ''; });
      $('l-usuario').value = u;
    })
    .catch(function (e) { erroEm('c-erro', e.message); })
    .then(function () { $('b-cadastrar').disabled = false; carregando(false); });
}
function sair(confirmar) {
  if (confirmar && pendentesLocais().pessoas.length + pendentesLocais().encontros.length > 0 &&
      !confirm('Há alterações que ainda não foram enviadas. Se sair agora, elas serão perdidas. Sair mesmo assim?')) return;
  if (confirmar && !confirm('Sair do app neste aparelho?')) return;
  if (sbSessao || sbDisponivel()) sbSair().catch(function () {});
  else if (cfg.token) chamar('logout', {}).catch(function () {});
  limparSessao();
  mostrarTela('s-login');
}
function limparSessao() {
  chDraft = null; usuariosCache = null; cfgDraft = null; lvPendente = null; consentAberto = false; if (typeof instLimpar === 'function') instLimpar();
  var url = cfg.url;
  cfg = { url: url }; salvarCfg();
  db = { pessoas: [], encontros: [], gcs: [], equipe: [], pendentes: 0 }; fotos = {};
  lsDel(K_DB); lsDel(K_FOTOS);
}
function sessaoExpirada() {
  limparSessao(); mostrarTela('s-login');
  erroEm('l-erro', 'Sua sessão expirou ou seu acesso foi alterado. Entre novamente.');
}

/* ───────── navegação ───────── */
var IC_LAR = '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M12 17s-3-1.9-3-3.8A1.6 1.6 0 0 1 12 12a1.6 1.6 0 0 1 3 1.2C15 15.1 12 17 12 17z"/>';
var IC_CURSO = '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/><path d="M22 9v6"/>';
var ABAS_VOL = [
  { id: 'lvnovo', nome: 'Cadastrar', ic: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>' },
  { id: 'lvmeus', nome: 'Meus cadastros', ic: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>' },
  { id: 'conta', nome: 'Conta', ic: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>' }
];
var ABAS_GER = [
  { id: 'bi', nome: 'Painel', ic: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>' },
  { id: 'gcs', nome: 'GCs', ic: '<path d="M3 10l9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21V13h6v8"/>' },
  { id: 'cultos', nome: 'Cultos', ic: '<path d="M12 2v5M9.5 4.5h5"/><path d="M4 21V11l8-4 8 4v10"/><path d="M10 21v-5h4v5"/>', perm: function () { return temCultos(); } },
  { id: 'lv', nome: 'Lar de Vida', ic: IC_LAR, perm: function () { return pode('lvDirecionar'); } },
  { id: 'membros', nome: 'Pessoas', ic: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M11 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM7.5 15c.8-1.4 2-2 3.5-2s2.7.6 3.5 2"/>', perm: function () { return pode('consulta'); } },
  { id: 'cursos', nome: 'Treinamentos', ic: IC_CURSO, perm: function () { return temCursos(); } },
  { id: 'usuarios', nome: 'Usuários', ic: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/>', admin: true },
  { id: 'conta', nome: 'Conta', ic: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>' }
];
var ABAS_GC = [
  { id: 'painel', nome: 'Painel', ic: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 9h8V3h-8z"/>' },
  { id: 'pessoas', nome: 'Pessoas', ic: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>' },
  { id: 'chamada', nome: 'Encontros', ic: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>' },
  { id: 'lar', nome: 'Lar de Vida', ic: IC_LAR },
  { id: 'alertas', nome: 'Alertas', ic: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>' },
  { id: 'mais', nome: 'Mais', ic: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>' }
];
var IC_INICIO = '<path d="M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>';
var IC_AGENDA = '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>';
var IC_PESSOAS = '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>';
var IC_AVISOS = '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>';
var IC_PERFIL = '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>';
var IC_LISTA = '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>';
/** Barra inferior: no máximo 5 itens fixos (Início, Agenda, Pessoas, Avisos, Perfil). Os demais módulos ficam em blocos no Início. */
function abasAtuais() {
  if (cfg.modo === 'lv') {
    var A = [];
    if (pode('visitantes')) A.push({ id: 'lvnovo', nome: 'Início', ic: IC_INICIO });
    if (temInst()) A.push({ id: 'instituto', nome: 'Instituto', ic: IC_INST });
    if (pode('lvVisitas')) A.push({ id: 'lvcasas', nome: 'Lar de Vida', ic: IC_LAR });
    if (temCultos() && !pode('lvVisitas')) A.push({ id: 'cultos', nome: 'Agenda', ic: IC_AGENDA });
    A.push({ id: 'avisos', nome: 'Avisos', ic: IC_AVISOS });
    if (pode('visitantes')) A.push({ id: 'lvmeus', nome: 'Cadastros', ic: IC_LISTA });
    else if (pode('consulta')) A.push({ id: 'membros', nome: 'Pessoas', ic: IC_PESSOAS });
    A = A.slice(0, 4); A.push({ id: 'conta', nome: 'Perfil', ic: IC_PERFIL });
    return A;
  }
  if (cfg.modo === 'ger') {
    var G = [{ id: 'bi', nome: 'Início', ic: IC_INICIO }];
    G.push(temCultos() ? { id: 'cultos', nome: 'Agenda', ic: IC_AGENDA } : { id: 'gcs', nome: 'GCs', ic: IC_GC });
    if (pode('consulta')) G.push({ id: 'membros', nome: 'Pessoas', ic: IC_PESSOAS });
    else if (temCultos()) G.push({ id: 'gcs', nome: 'GCs', ic: IC_GC });
    G.push({ id: 'avisos', nome: 'Avisos', ic: IC_AVISOS });
    G.push({ id: 'conta', nome: 'Perfil', ic: IC_PERFIL });
    return G;
  }
  return [{ id: 'painel', nome: 'Início', ic: IC_INICIO }, { id: 'chamada', nome: 'Encontros', ic: IC_AGENDA },
          { id: 'pessoas', nome: 'Pessoas', ic: IC_PESSOAS }, { id: 'alertas', nome: 'Avisos', ic: IC_AVISOS },
          { id: 'mais', nome: 'Perfil', ic: IC_PERFIL }];
}
function inicioId() { return cfg.modo === 'lv' ? (pode('visitantes') ? 'lvnovo' : temInst() ? 'instituto' : pode('lvVisitas') ? 'lvcasas' : 'conta') : cfg.modo === 'ger' ? 'bi' : 'painel'; }
function validarContexto() {
  if (!pode('rede') && !pode('gc')) { cfg.modo = 'lv'; }
  else if (pode('rede') && cfg.modo === 'lv') { cfg.modo = 'ger'; }
  else if (!ehGestor()) {
    cfg.modo = 'gc';
    var meus = GCS();
    if (!cfg.gcAtual || (meus.length && !gcPor(cfg.gcAtual))) {
      var lidero = meus.filter(function (g) { return g.liderId === eu().id; })[0];
      cfg.gcAtual = papel() === 'lider' && lidero ? lidero.id
        : (eu().gcId && gcPor(eu().gcId)) ? eu().gcId : (meus[0] ? meus[0].id : '');
    }
  }
  if (cfg.modo === 'gc' && cfg.gcAtual && db.gcs.length && !gcPor(cfg.gcAtual)) cfg.gcAtual = ehGestor() ? '' : cfg.gcAtual;
  if (cfg.modo === 'gc' && !cfg.gcAtual && ehGestor()) cfg.modo = 'ger';
  var ids = abasAtuais().map(function (a) { return a.id; }).concat(abasExtras());
  if (ids.indexOf(cfg.aba) < 0) cfg.aba = ids[0];
  salvarCfg();
}
/* ── navegação: cada tela aberta entra numa pilha; "Voltar" (seta, botão do celular ou do navegador) volta à anterior ── */
var navStack = [], histTipos = [], ignorarPop = 0, modalHist = false;
var HIST_OK = !MODO_SCRIPT && !!(window.history && history.pushState);
function fotoNav() { return { modo: cfg.modo, gcAtual: cfg.gcAtual, aba: cfg.aba, curso: cursoAberto, y: window.scrollY || 0 }; }
function empilhar(tipo) {
  if (!HIST_OK) return;
  try { history.pushState({ g2: tipo }, ''); histTipos.push(tipo); } catch (e) {}
}
/** Avança para uma tela guardando a atual (volta com a seta ou o botão Voltar). */
function navegar(muda) {
  navStack.push(fotoNav()); empilhar('nav');
  muda(); salvarCfg(); window.scrollTo(0, 0); render();
}
/** Barra inferior: abre a tela como ponto de partida (zera o caminho anterior). */
function muralNovos() { var v = lerVistos(), ult = v._mural || ''; return (db.mural || []).filter(function (m) { return !m.meu && m.criadoEm > ult; }).length; }
function irRaiz(id) {
  if (id === 'avisos' || id === 'alertas') { var vv = lerVistos(); vv._mural = new Date().toISOString(); salvarVistos(); }
  // mantém o caminho até a entrada no contexto atual (ex.: lista de GCs → GC aberto); descarta o resto
  var k = navStack.length;
  while (k > 0 && navStack[k - 1].modo === cfg.modo && navStack[k - 1].gcAtual === cfg.gcAtual) k--;
  navStack = navStack.slice(0, k); cursoAberto = '';
  if (id !== inicioId()) {
    navStack.push({ modo: cfg.modo, gcAtual: cfg.gcAtual, aba: inicioId(), curso: '', y: 0 });   // voltar → Início deste perfil
    if (HIST_OK) {
      try {
        if (histTipos[histTipos.length - 1] === 'raiz') { history.replaceState({ g2: 'raiz' }, ''); navStack.splice(navStack.length - 1, 0); }
        else { history.pushState({ g2: 'raiz' }, ''); histTipos.push('raiz'); }
      } catch (e) {}
    }
  }
  cfg.aba = id; salvarCfg(); window.scrollTo(0, 0); render();
}
function restaurar(f) {
  cfg.modo = f.modo; cfg.gcAtual = f.gcAtual; cfg.aba = f.aba; cursoAberto = f.curso || '';
  salvarCfg(); render(); setTimeout(function () { window.scrollTo(0, f.y || 0); }, 0);
}
/** Seta de voltar: usa o histórico do navegador quando existe; senão, volta direto. */
function voltar() {
  if ($('modal').classList.contains('on') && !consentAberto && !senhaObrig) { fechar(); return; }
  if (HIST_OK && histTipos.length) { history.back(); return; }
  if (navStack.length) { restaurar(navStack.pop()); return; }
  if (cfg.modo === 'gc' && ehGestor()) { cfg.modo = 'ger'; cfg.aba = 'gcs'; salvarCfg(); render(); return; }
  if (cfg.aba !== inicioId()) { cfg.aba = inicioId(); salvarCfg(); render(); }
}
if (HIST_OK) window.addEventListener('popstate', function () {
  histTipos.pop();
  if (ignorarPop) { ignorarPop--; return; }
  if (!cfg.token) return;
  if ($('modal').classList.contains('on')) {
    if (consentAberto || senhaObrig) { empilhar('modal'); return; }       // janela obrigatória: não fecha com o Voltar
    modalHist = false; fecharModalSo(); return;
  }
  if (navStack.length) { restaurar(navStack.pop()); return; }
  if (cfg.modo === 'gc' && ehGestor()) { cfg.modo = 'ger'; cfg.aba = 'gcs'; salvarCfg(); render(); return; }
  if (cfg.aba !== inicioId()) { cfg.aba = inicioId(); cursoAberto = ''; salvarCfg(); window.scrollTo(0, 0); render(); }
});
function irAba(id) { if (id === cfg.aba) return; navegar(function () { cfg.aba = id; }); }
function abrirGC(id) { navegar(function () { cfg.modo = 'gc'; cfg.gcAtual = id; cfg.aba = 'painel'; filtroP = 'todos'; }); }
function voltarRede() { if (navStack.length || histTipos.length) return voltar(); cfg.modo = 'ger'; cfg.aba = 'gcs'; salvarCfg(); window.scrollTo(0, 0); render(); }

function iniciarApp() {
  mostrarTela('s-app'); validarContexto(); render();
}

/* ───────── render principal ───────── */
var chDraft = null;
function guardarRascunhos() {
  if (cfg.aba === 'novo' && $('g-nome')) gcForm = lerFormGC();
  if ($('ch-tema')) chDraft = { gc: gcA(), data: $('ch-data').value, tema: $('ch-tema').value, preg: $('ch-preg').value,
                               diz: $('ch-diz').value, ofe: $('ch-ofe').value, rec: $('ch-rec') ? $('ch-rec').value : '' };
}
function render() {
  if (!cfg.token) return;
  guardarRascunhos();
  validarContexto();
  var g = cfg.modo === 'gc' ? gcPor(cfg.gcAtual) : null;
  $('h-img').src = g ? iconeGC(g.id) : LOGO;
  var TIT = { instituto: 'Instituto', instcursos: 'Cursos do Instituto', instmercado: 'Mercado solidário', instfarmacia: 'Farmácia solidária', instagenda: 'Agenda', lvcasas: 'Lar de Vida', relatorios: 'Relatórios', financeiro: 'Financeiro', usuarios: 'Usuários e acessos', avisos: 'Avisos', gcs: 'GCs' };
  $('h-tit').textContent = TIT[cfg.aba] ? TIT[cfg.aba] : cfg.modo === 'lv' ? igrNome() : cfg.aba === 'config' ? 'Configurações' : cfg.aba === 'cultos' ? 'Cultos e eventos' : cfg.aba === 'membros' ? 'Cadastro de pessoas' : cfg.aba === 'cursos' ? 'Treinamentos/Reuniões' : cfg.modo === 'ger' ? igrNome() : (g ? g.nome : 'Meu GC');
  $('h-papel').textContent = PAPEL_NOME[papel()] || '';
  var raizes = abasAtuais().map(function (a) { return a.id; }), naRaiz = raizes.indexOf(cfg.aba) >= 0 && !cursoAberto;
  $('b-voltar').classList.remove('hide');   // TESTE 16: Voltar disponível em todas as telas autenticadas
  $('b-voltar-ger').classList.add('hide');
  var abas = abasAtuais(), abaNav = raizes.indexOf(cfg.aba) >= 0 ? cfg.aba : (navStack.length ? (navStack[0].aba && raizes.indexOf(navStack[0].aba) >= 0 ? navStack[0].aba : inicioId()) : inicioId());
  $('nav').innerHTML = abas.map(function (a) {
    var nb = a.id === 'avisos' ? (cfg.modo === 'lv' ? alertasNaoLidos(null).length : badgeAvisos()) + muralNovos() : a.id === 'alertas' ? alertasNaoLidos(null).length + lvBadgeGC() + muralNovos() : 0;
    var bdg = nb ? '<span class="bdg">' + nb + '</span>' : '';
    return '<button data-a="nav" data-v="' + a.id + '" class="' + (abaNav === a.id ? 'on' : '') + '">' +
      '<svg viewBox="0 0 24 24">' + a.ic + '</svg>' + a.nome + bdg + '</button>';
  }).join('');
  var f = {
    bi: rBI, gcs: rGCs, novo: rNovoGC, usuarios: rUsuarios, conta: rConta,
    painel: rPainel, pessoas: rPessoas, chamada: rChamada, alertas: rAlertas, mais: rMaisGC,
    lv: rLVGer, lar: rLar, instituto: rInstituto, instcursos: rInstCursos, instmercado: rEstoque, instfarmacia: rEstoque, instagenda: rInstAgenda, lvcasas: rLVVol, avisos: rAvisos, relatorios: rRelatorios, financeiro: rFinanceiro, lvnovo: rLVNovo, lvmeus: rLVMeus, cultos: rCultos, config: rConfig, membros: rConsulta, cursos: rCursos
  }[cfg.aba];
  if (cfg.modo === 'gc' && !g) {
    $('main').innerHTML = '<div class="empty">' + (db.gcs.length ? 'Você ainda não está vinculado a um GC. Fale com a liderança.' : 'Carregando dados do GC...') + '</div>';
  } else $('main').innerHTML = f ? f() : '';
  if (cfg.aba === 'usuarios') carregarUsuarios();
  if (cfg.aba !== 'config') { if (cfgDraft) aplicarCor(igr.config && igr.config.cor); cfgDraft = null; logoNovo = null; iconeNovo = null; }
  if (cfg.aba !== 'painel' && cfg.aba !== 'bi') mapaGcs = null;
  if (cfg.aba === 'lv') setTimeout(lvGeoFila, 0);
  setTimeout(desenharMapa, 0);
  pintarStatus();
}

/* ═══════════════════ GERENCIADOR ═══════════════════ */
function kpi(v, l, cls) { return '<div class="kpi ' + (cls || '') + '"><div class="v">' + v + '</div><div class="l">' + l + '</div></div>'; }
function barra(rot, n, tot, cor) {
  return '<div class="fun"><div class="t"><span>' + rot + '</span><span>' + n + '</span></div><div class="bar"><i style="width:' +
    (tot ? Math.min(100, n / tot * 100) : 0) + '%;' + (cor ? 'background:' + cor : '') + '"></i></div></div>';
}
function semanaDe(s) { var d = parseData(s); var dia = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dia); return isoData(d); }

/* ── período do painel (mês ou intervalo de datas) ── */
var perBI = { modo: 'mes', mes: '', de: '', ate: '' };
function fimMes(ym) { var p = ym.split('-').map(Number); return isoData(new Date(p[0], p[1], 0)); }
function diasPeriodo(de, ate) { return diasEntre(parseData(de), parseData(ate)) + 1; }
function rotPeriodo(de, ate) {
  if (de.slice(8) === '01' && ate === fimMes(de.slice(0, 7))) return nomeMes(de.slice(0, 7));
  if (de.slice(0, 4) === ate.slice(0, 4) && de.slice(5) === '01-01' && ate.slice(5) === '12-31') return 'ano ' + de.slice(0, 4);
  if (de.slice(8) === '01' && ate === fimMes(ate.slice(0, 7))) return nomeMes(de.slice(0, 7)) + ' a ' + nomeMes(ate.slice(0, 7));
  return br(de) + (de.slice(0, 4) !== ate.slice(0, 4) ? '/' + de.slice(2, 4) : '') + ' a ' + br(ate) + '/' + ate.slice(2, 4);
}
/** Período ativo e o período anterior de mesma duração (para comparação). */
function periodoBI() {
  var hj = hoje(), de, ate, m = perBI.modo;
  if (m === 'mes') { var ym = perBI.mes || hj.slice(0, 7); de = ym + '-01'; ate = fimMes(ym); }
  else if (m === '3m') { var ms = mesesAtras(3); de = ms[0] + '-01'; ate = fimMes(ms[2]); }
  else if (m === 'ano') { de = hj.slice(0, 4) + '-01-01'; ate = hj.slice(0, 4) + '-12-31'; }
  else { de = perBI.de || hj.slice(0, 7) + '-01'; ate = perBI.ate || hj; if (ate < de) { var t = de; de = ate; ate = t; } }
  var antDe, antAte;
  if (de.slice(8) === '01' && ate === fimMes(ate.slice(0, 7))) {          // períodos de meses inteiros: compara com os meses anteriores
    var nm = (+ate.slice(0, 4) - +de.slice(0, 4)) * 12 + (+ate.slice(5, 7) - +de.slice(5, 7)) + 1;
    var a0 = parseData(de); a0 = new Date(a0.getFullYear(), a0.getMonth() - nm, 1);
    antDe = isoData(a0); antAte = isoData(new Date(a0.getFullYear(), a0.getMonth() + nm, 0));
  } else {
    var n = diasPeriodo(de, ate), x = parseData(de);
    var ae = new Date(x); ae.setDate(ae.getDate() - 1); var ad = new Date(ae); ad.setDate(ad.getDate() - n + 1);
    antDe = isoData(ad); antAte = isoData(ae);
  }
  return { de: de, ate: ate, rot: rotPeriodo(de, ate), antDe: antDe, antAte: antAte, antRot: rotPeriodo(antDe, antAte),
           noPer: function (d) { d = String(d || '').slice(0, 10); return d >= de && d <= ate; },
           noAnt: function (d) { d = String(d || '').slice(0, 10); return d >= antDe && d <= antAte; } };
}
function mesesDoPeriodo(P, minimo) {
  var out = [], a = parseData(P.de), b = parseData(P.ate);
  var d = new Date(a.getFullYear(), a.getMonth(), 1);
  while (d <= b && out.length < 24) { out.push(d.getFullYear() + '-' + pad(d.getMonth() + 1)); d = new Date(d.getFullYear(), d.getMonth() + 1, 1); }
  if (minimo && out.length < minimo) { var ex = mesesAtras(minimo, P.ate); out = ex; }
  return out;
}
function barraPeriodo() {
  var P = periodoBI(), hj = hoje(), mesesOp = mesesAtras(13).reverse();
  var tabs = [['mes', 'Mês'], ['3m', 'Últimos 3 meses'], ['ano', 'Ano ' + hj.slice(0, 4)], ['per', 'Período']];
  return '<div class="card" style="padding:10px 12px;position:sticky;top:66px;z-index:30;box-shadow:0 2px 8px rgba(0,0,0,.08)">' +
    '<div class="tabs" style="margin-bottom:6px">' + tabs.map(function (t) {
      return '<button data-a="perModo" data-v="' + t[0] + '" class="' + (perBI.modo === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>' +
    (perBI.modo === 'mes' ? '<select id="per-mes">' + mesesOp.map(function (m) {
        return '<option value="' + m + '"' + ((perBI.mes || hj.slice(0, 7)) === m ? ' selected' : '') + '>' + MESES[+m.slice(5, 7) - 1] + '/' + m.slice(0, 4) + (m === hj.slice(0, 7) ? ' (atual)' : '') + '</option>'; }).join('') + '</select>' : '') +
    (perBI.modo === 'per' ? '<div class="g2"><div><label style="margin-top:0">De</label><input id="per-de" type="date" value="' + esc(P.de) + '"></div>' +
      '<div><label style="margin-top:0">Até</label><input id="per-ate" type="date" value="' + esc(P.ate) + '"></div></div>' : '') +
    '<div style="font-size:11.5px;color:#777;margin-top:6px">Período: <b style="color:#222">' + esc(P.rot) + '</b> · comparando com ' + esc(P.antRot) + '</div></div>';
}

/* ── central de avisos (gerenciador) ── */
function badgeAvisos() {
  return alertasNaoLidos(null).length + (ehAdmin() ? (db.pendentes || 0) : 0) + (pode('lvDirecionar') ? lvFila().length : 0);
}
function rAvisos() {
  var ids = GCSativos().map(function (g) { return g.id; }), h = '', n = 0;
  if (ehAdmin() && db.pendentes) { n++; h += '<div class="aviso r" data-a="aba" data-v="usuarios" style="cursor:pointer"><b>' + db.pendentes + ' cadastro(s) aguardando sua validação.</b> Toque para revisar.</div>'; }
  if (pode('lvDirecionar') && lvFila().length) { n++; h += '<div class="aviso" data-a="aba" data-v="lv" style="cursor:pointer"><b>' + lvFila().length + ' visitante(s) da igreja sem GC.</b> Toque para direcionar.</div>'; }
  var atr = PES().filter(lvAtrasada).length;
  if (atr) { n++; h += '<div class="aviso r" data-a="aba" data-v="lv" style="cursor:pointer"><b>' + atr + ' visita(s) do Lar de Vida atrasada(s).</b></div>'; }
  var al = blocoAlertas(null, true); if (al) n++;
  h = blocoNotif() + h + blocoMinhasEscalas() + al;
  if (!n) h += '<div class="card"><div class="empty" style="padding:8px">Nenhum aviso para você agora. 🙌</div></div>';
  return h + blocoMural();
}

/* ── módulos (atalhos) ── */
var IC_MIN = '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>';
var IC_FIN = '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>';
var IC_MEM = '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>';
var IC_ENC = '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>';
var IC_GC = '<path d="M3 10l9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21V13h6v8"/>';
var IC_CULTO = '<path d="M12 2v5M9.5 4.5h5"/><path d="M4 21V11l8-4 8 4v10"/><path d="M10 21v-5h4v5"/>';
function modulosDisponiveis() {
  var m = [], ger = cfg.modo === 'ger';
  if (ger) m.push({ id: 'gcs', nome: 'GCs', ic: IC_GC, cor: '#2f6fd6' });
  else if (cfg.modo === 'gc') m.push({ id: 'chamada', nome: 'Encontros', ic: IC_ENC, cor: '#2f6fd6' });
  if (ger && pode('lvDirecionar')) m.push({ id: 'lv', nome: 'Lar de Vida', ic: IC_LAR, cor: '#1f9d63' });
  else if (cfg.modo === 'gc') m.push({ id: 'lar', nome: 'Lar de Vida', ic: IC_LAR, cor: '#1f9d63' });
  if (ger && temCultos()) m.push({ id: 'cultos', nome: 'Cultos', ic: IC_CULTO, cor: '#7a4fd6' });
  if (ger && temInst()) m.push({ id: 'instituto', nome: 'Instituto', ic: IC_INST, cor: '#E5484D' });
  if (pode('consulta') && cfg.modo !== 'gc') m.push({ id: 'membros', nome: 'Membros', ic: IC_MEM, cor: '#d6572f' });
  else if (cfg.modo === 'gc') m.push({ id: 'pessoas', nome: 'Pessoas', ic: IC_MEM, cor: '#d6572f' });
  if (ger && podeFin()) m.push({ id: 'financeiro', nome: 'Financeiro', ic: IC_FIN, cor: '#c99a1a' });
  if (ger && temCursos()) m.push({ id: 'cursos', nome: 'Treinamentos', ic: IC_CURSO, cor: '#0f8a8a' });
  if (ger) m.push({ id: 'relatorios', nome: 'Relatórios', ic: IC_REL, cor: '#5E6470' });
  m.push({ id: 'ministerios', nome: 'Ministérios', ic: IC_MIN, cor: '#9aa0a6', breve: true });
  m.forEach(function (x) {
    if (x.id === 'lv') x.n = lvFila().length;
    if (x.id === 'lar') x.n = lvBadgeGC();
  });
  return m;
}
function blocoModulos() {
  return '<div class="mods">' + modulosDisponiveis().map(function (x) {
    return '<button class="mod' + (x.breve ? ' breve' : '') + '" data-a="modulo" data-v="' + x.id + '">' +
      '<span class="mi" style="background:' + x.cor + '1a;color:' + x.cor + '"><svg viewBox="0 0 24 24">' + x.ic + '</svg></span>' +
      '<span class="mn">' + x.nome + '</span>' + (x.breve ? '<span class="mb">em breve</span>' : x.n ? '<span class="mn-b">' + x.n + '</span>' : '') + '</button>';
  }).join('') + '</div>';
}
function abrirModulo(id) {
  if (id === 'ministerios') {
    return abrirModal('<h2>Ministérios</h2><div class="aviso" style="margin-top:8px"><b>Em construção.</b> Este módulo vai reunir os ministérios da igreja ' +
      '(louvor, infantil, mídia, recepção, intercessão…), com equipes, escalas e avisos — no mesmo modelo da escala dos encontros do GC.</div>' +
      '<div class="gap"></div><button class="btn pr" data-a="fechar">Entendi</button>');
  }

  irAba(id);
}

function rBI() {
  var gcs = GCSativos(), ids = gcs.map(function (g) { return g.id; }), h = inicioGestor();
  if (pode('relFin') || pode('usuarios')) h += '<div class="sec">Visão geral da igreja</div>' + barraPeriodo() + blocoVisaoIgreja(gcs, true);
  else h += graficoGCSemanas(ids, 'Presença nos GCs — últimas 8 semanas');
  h += '<div class="gap"></div><button class="btn gh" data-a="aba" data-v="relatorios">Ver todos os relatórios e indicadores</button>';
  return h;
}

var buscaGC = '', filtroGC = 'Ativo';
function rGCs() {
  var lst = GCS().filter(function (g) {
    return (filtroGC === 'todos' || (filtroGC === 'Ativo' ? g.status !== 'Inativo' : g.status === 'Inativo')) &&
      (!buscaGC || (g.nome + ' ' + g.bairro + ' ' + g.liderNome).toLowerCase().indexOf(buscaGC) >= 0);
  });
  var h = (pode('rede') ? '<button class="btn" data-a="aba" data-v="novo">+ Cadastrar novo GC</button><div class="gap"></div>' : '') +
    '<div class="tabs">' + [['Ativo', 'Ativos'], ['Inativo', 'Inativos'], ['todos', 'Todos']].map(function (x) {
    return '<button data-a="filtroGC" data-v="' + x[0] + '" class="' + (filtroGC === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>' +
    '<input id="busca-gc" placeholder="Buscar GC, bairro ou líder..." value="' + esc(buscaGC) + '" style="margin-bottom:12px">';
  if (!lst.length) return h + '<div class="card"><div class="empty">Nenhum GC encontrado.<br>Use a aba <b>Novo GC</b> para cadastrar.</div></div>';
  lst.forEach(function (g) {
    var m = metricas(g.id), prox = proximoEncontro(g);
    h += '<div class="gccard"><div class="ft" style="background-image:url(\'' + fotoGC(g.id) + '\')"><span class="st pill ' + (g.status === 'Inativo' ? 'p-cinza' : g.status === 'Multiplicado' ? 'p-dour' : 'p-verde') + '">' + esc(g.status || 'Ativo') + '</span></div>' +
      '<div class="bd"><h4>' + esc(g.nome) + (g.tipoGC ? ' <span class="pill p-dour" style="vertical-align:middle">' + esc(g.tipoGC) + (faixaTexto(g) ? ' · ' + faixaTexto(g) : '') + '</span>' : '') + '</h4>' +
      '<div class="ln"><b>Líder:</b> ' + esc(g.liderNome || 'não definido') + (g.coLider ? ' · ' + esc(g.coLider) : '') + '</div>' +
      '<div class="ln"><b>Encontros:</b> ' + (g.diaSemana !== '' && g.diaSemana != null ? DIAS[+g.diaSemana] + (g.horario ? ', ' + esc(g.horario) : '') + (g.frequencia ? ' · ' + esc(g.frequencia) : '') : 'dia não definido') + (prox ? ' · próximo ' + br(prox) : '') + '</div>' +
      '<div class="ln"><b>Endereço:</b> ' + esc([g.endereco, g.bairro, g.cidade].filter(Boolean).join(' · ') || 'não informado') + '</div>' +
      '<div class="mini"><div><b>' + m.ativos + '</b><span>ativos</span></div><div><b>' + num1(m.media) + '</b><span>média</span></div>' +
      '<div><b>' + (m.pres === null ? '—' : pct(m.pres)) + '</b><span>presença</span></div><div><b style="color:' + (m.alertas ? 'var(--vermelho)' : '') + '">' + m.alertas + '</b><span>alertas</span></div></div>' +
      '<div class="acoes"><button class="btn pr sm" data-a="abrirGC" data-v="' + esc(g.id) + '">Abrir GC</button><button class="btn gh sm" data-a="editarGC" data-v="' + esc(g.id) + '">Editar</button></div></div></div>';
  });
  return h;
}

/* formulário de GC (novo / editar) */
var gcForm = null, fotoNova = null, iconeGCNovo = null;
function rNovoGC() {
  if (!gcForm || gcForm.id) { gcForm = { cidade: 'Matão/SP', status: 'Ativo', frequencia: 'Semanal', supervisorId: papel() === 'supervisor' ? eu().id : '' }; fotoNova = null; }
  return '<div class="card"><h3>Cadastrar novo GC</h3>' + formGC(gcForm) + '<div style="height:16px"></div><button class="btn pr" data-a="salvarGC">Salvar GC</button></div>';
}
function opts(lista, sel) { return lista.map(function (o) { var v = o[0], t = o[1]; return '<option value="' + esc(v) + '"' + (String(sel) === String(v) ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join(''); }
function formGC(g, restrito) {
  var eq = (db.equipe || []).slice().sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
  var lideres = [['', '— escolher —']].concat(eq.filter(function (u) { return ['lider', 'supervisor', 'pastor', 'master'].indexOf(u.papel) >= 0; })
    .map(function (u) { return [u.id, u.nome + ' (' + (PAPEL_NOME[u.papel] || u.papel) + ')']; }));
  var sups = [['', '— nenhum —']].concat(eq.filter(function (u) { return u.papel === 'supervisor'; }).map(function (u) { return [u.id, u.nome]; }));
  var discSel = String(g.discipulos || '').split(',').filter(Boolean);
  var candidatos = eq.filter(function (u) { return u.papel === 'discipulo' || u.papel === 'lider'; });
  var blocoDisc = candidatos.length ? candidatos.map(function (u) {
    var outro = u.gcId && u.gcId !== g.id && discSel.indexOf(u.id) < 0 ? ' · ' + esc(gcNome(u.gcId)) : '';
    return '<label style="display:flex;align-items:center;gap:10px;margin:0;padding:9px 2px;border-bottom:1px solid #f2f2f2;font-size:13.5px;color:#222;font-weight:600">' +
      '<input type="checkbox" class="g-disc" value="' + esc(u.id) + '" style="width:20px;height:20px;flex:0 0 20px"' + (discSel.indexOf(u.id) >= 0 ? ' checked' : '') + '>' +
      '<span style="flex:1">' + esc(u.nome) + '<span style="color:#999;font-weight:500;font-size:11.5px"> · ' + esc(PAPEL_NOME[u.papel]) + outro + '</span></span></label>';
  }).join('') : '<div style="font-size:12px;color:#999;padding:8px 0">Nenhum discípulo aprovado ainda. Eles aparecem aqui depois que o cadastro deles for validado.</div>';
  var souSup = papel() === 'supervisor';
  var foto = fotoNova ? fotoNova : (g.id && fotos[g.id] ? fotos[g.id].data : '');
  return '<label>Foto do GC</label><div class="fotoprev" data-a="escolherFoto" id="g-fotoprev" style="' + (foto ? 'background-image:url(\'' + foto + '\');border:none;color:transparent' : '') + '">Toque para escolher uma foto</div>' +
    (foto ? '<div style="text-align:right;margin-top:6px"><span class="pill p-cinza" data-a="removerFoto" style="cursor:pointer">remover foto</span></div>' : '') +
    blocoIconeGC(g) +
    '<label>Nome do GC *</label><input id="g-nome" value="' + esc(g.nome) + '" placeholder="Ex.: GC Jardim Paraíso">' +
    (restrito ? '<div class="g2"><div><label>Status</label><input value="' + esc(g.status || 'Ativo') + '" disabled></div>'
              : '<div class="g2"><div><label>Status</label><select id="g-status">' + opts([['Ativo', 'Ativo'], ['Inativo', 'Inativo'], ['Multiplicado', 'Multiplicado']], g.status || 'Ativo') + '</select></div>') +
    '<div><label>Data de início</label><input id="g-inicio" type="date" value="' + esc(g.inicio) + '"></div></div>' +
    '<div class="sec" style="margin-left:0">Endereço</div>' +
    '<label>CEP <span style="font-weight:500;color:#aaa">(opcional)</span></label><input id="g-cep" inputmode="numeric" maxlength="9" placeholder="00000-000" value="' + esc(mascaraCep(g.cep)) + '">' +
    '<div id="g-cepinfo" style="font-size:11.5px;margin-top:5px;line-height:1.4"></div>' +
    '<label>Rua e número</label><input id="g-endereco" value="' + esc(g.endereco) + '" placeholder="Rua das Flores, 120">' +
    '<div class="g2"><div>' + campoBairro('g', g.bairro, false, '') + '</div>' +
    '<div><label>Cidade</label><input id="g-cidade" value="' + esc(g.cidade || cidadeIgreja()) + '"></div></div>' +
    '<label>Ponto de referência</label><input id="g-referencia" value="' + esc(g.referencia) + '">' +
    (restrito ? '<label>Tipo de GC</label><input value="' + esc((g.tipoGC || 'não definido') + (faixaTexto(g) ? ' · ' + faixaTexto(g) : '')) + '" disabled>'
              : '<label>Tipo de GC *</label><select id="g-tipo">' + opts([['', '— selecionar —']].concat(TIPOS_GC.map(function (t) { return [t, t]; })), g.tipoGC) + '</select>' +
                '<div id="g-pubwrap" class="' + (g.tipoGC === 'Jovens e adolescentes' ? '' : 'hide') + '"><label>Público do GC de jovens</label><select id="g-sexogc">' +
                opts([['', 'Misto (rapazes e moças)'], ['Feminino', 'Somente moças'], ['Masculino', 'Somente rapazes']], g.sexoGC || '') + '</select></div>' +
                '<div class="g2"><div><label>Idade mínima</label><input id="g-idmin" type="number" min="0" max="120" inputmode="numeric" value="' + esc(g.idadeMin) + '" placeholder="opcional"></div>' +
                '<div><label>Idade máxima</label><input id="g-idmax" type="number" min="0" max="120" inputmode="numeric" value="' + esc(g.idadeMax) + '" placeholder="opcional"></div></div>' +
                '<div style="font-size:11px;color:#999;margin-top:4px">Visitantes são indicados ao GC do mesmo sexo. A faixa etária, quando preenchida, também é considerada. ' +
                'GC de jovens sem faixa usa até ' + IDADE_JOVENS + ' anos.</div>') +
    '<div class="sec" style="margin-left:0">Encontros</div>' +
    '<div class="g2"><div><label>Dia da semana</label><select id="g-dia">' + opts([['', '—']].concat(DIAS.map(function (d, i) { return [String(i), d]; })), g.diaSemana) + '</select></div>' +
    '<div><label>Horário</label><input id="g-horario" type="time" value="' + esc(g.horario) + '"></div></div>' +
    '<label>Frequência</label><select id="g-freq">' + opts([['Semanal', 'Semanal'], ['Quinzenal', 'Quinzenal'], ['Mensal', 'Mensal']], g.frequencia || 'Semanal') + '</select>' +
    '<div class="sec" style="margin-left:0">Liderança</div>' +
    (restrito ? '<div class="aviso" style="margin-bottom:4px">Líder: <b>' + esc(g.liderNome || '—') + '</b><br>Discípulos: ' + esc(g.discipulosNomes || '—') +
                '<br>Supervisor: ' + esc(g.supervisorNome || '—') + '<br><span style="font-size:11px">Liderança, status e exclusão do GC são definidos pelo supervisor ou pastor.</span></div>'
    : '<label>Líder (acessa o app com este GC)</label><select id="g-lider">' + opts(lideres, g.liderId) + '</select>' +
    '<input type="hidden" id="g-lidernome" value="' + esc(g.liderNome) + '">' +
    '<label>Discípulos com acesso ao app</label><div style="border:1.5px solid #e2e2e2;border-radius:11px;padding:2px 10px;max-height:230px;overflow-y:auto">' + blocoDisc + '</div>' +
    '<div style="font-size:11px;color:#999;margin-top:5px">Ao entrar, líder e discípulos marcados já caem direto neste GC.</div>') +
    '<div class="g2"><div><label>Co-líder / auxiliar</label><input id="g-colider" value="' + esc(g.coLider) + '"></div>' +
    '<div><label>Anfitrião (casa)</label><input id="g-anfitriao" value="' + esc(g.anfitriao) + '"></div></div>' +
    (restrito ? '' : souSup ? '<label>Supervisor</label><input value="' + esc(eu().nome) + ' (você)" disabled><input type="hidden" id="g-sup" value="' + esc(eu().id) + '">'
            : '<label>Supervisor</label><select id="g-sup">' + opts(sups, g.supervisorId) + '</select>') +
    '<label>Telefone de contato</label><input id="g-fone" type="tel" value="' + esc(g.fone) + '">' +
    '<label>Observações</label><textarea id="g-obs" rows="2">' + esc(g.obs) + '</textarea>';
}
var CAMPOS_LIDER = ['cep', 'nome', 'endereco', 'bairro', 'cidade', 'referencia', 'diaSemana', 'horario', 'frequencia', 'inicio', 'coLider', 'anfitriao', 'fone', 'obs'];
function lerFormGC() {
  var v = function (id) { var el = $(id); return el ? el.value.trim() : ''; };
  var g = {};
  for (var k in gcForm) g[k] = gcForm[k];
  if (gcForm && gcForm._restrito) {
    var mapa = { cep: 'g-cep', nome: 'g-nome', endereco: 'g-endereco', bairro: 'g-bairro', cidade: 'g-cidade', referencia: 'g-referencia', diaSemana: 'g-dia',
                 horario: 'g-horario', frequencia: 'g-freq', inicio: 'g-inicio', coLider: 'g-colider', anfitriao: 'g-anfitriao', fone: 'g-fone', obs: 'g-obs' };
    for (var c in mapa) if ($(mapa[c])) g[c] = v(mapa[c]);
    g.cep = mascaraCep(g.cep);
    return g;
  }
  g.cep = mascaraCep(v('g-cep'));
  g.tipoGC = v('g-tipo'); g.idadeMin = v('g-idmin'); g.idadeMax = v('g-idmax'); g.sexoGC = g.tipoGC === 'Jovens e adolescentes' ? v('g-sexogc') : '';
  if (g.idadeMin !== '' && g.idadeMax !== '' && +g.idadeMin > +g.idadeMax) { var tr = g.idadeMin; g.idadeMin = g.idadeMax; g.idadeMax = tr; }
  g.nome = v('g-nome'); g.status = v('g-status'); g.inicio = v('g-inicio'); g.endereco = v('g-endereco'); g.bairro = v('g-bairro');
  g.cidade = v('g-cidade'); g.referencia = v('g-referencia'); g.diaSemana = v('g-dia'); g.horario = v('g-horario'); g.frequencia = v('g-freq');
  g.liderId = v('g-lider'); g.liderNome = v('g-lidernome'); g.coLider = v('g-colider'); g.anfitriao = v('g-anfitriao');
  g.supervisorId = v('g-sup'); g.fone = v('g-fone'); g.obs = v('g-obs');
  var marc = document.querySelectorAll('.g-disc'), ds = [];
  for (var i = 0; i < marc.length; i++) if (marc[i].checked) ds.push(marc[i].value);
  if (marc.length || !g.discipulos) g.discipulos = ds.join(',');
  var sup = (db.equipe || []).filter(function (u) { return u.id === g.supervisorId; })[0]; g.supervisorNome = sup ? sup.nome : '';
  var l = (db.equipe || []).filter(function (u) { return u.id === g.liderId; })[0];
  g.liderNome = l ? l.nome : (g.liderId ? g.liderNome : '');
  return g;
}
function salvarGC(fecharModal) {
  var g = lerFormGC();
  if (!g.nome) { toast('Informe o nome do GC.'); return; }
  var envio = {};
  if (g._restrito) { envio.id = g.id; CAMPOS_LIDER.forEach(function (c) { envio[c] = g[c]; }); }
  else for (var k in g) if (k !== 'temFoto' && k !== 'foto' && k !== 'fotoV' && k !== '_restrito') envio[k] = g[k];
  if (fotoNova === '__remover__') envio.foto = '__remover__';
  else if (fotoNova) envio.foto = fotoNova;
  if (iconeGCNovo) envio.icone = iconeGCNovo;
  delete envio.temIcone; delete envio.iconeV;
  carregando(true, 'Salvando GC...');
  var opGC = sbDisponivel() ? (g.id ? v39AtualizarGC(g) : v39CriarGC(g)).then(v39SalvarAgendaGC).then(function(x){return {gc:x};}) : chamar('salvarGC', { gc: envio }, function (i, n) { $('carregando-txt').textContent = 'Enviando foto ' + i + '/' + n + '...'; });
  opGC
    .then(function (r) {
      var novo = !g.id;
      if (fotoNova && fotoNova !== '__remover__') fotos[r.gc.id] = { v: r.gc.fotoV, data: fotoNova };
      if (fotoNova === '__remover__') delete fotos[r.gc.id];
      if (iconeGCNovo && iconeGCNovo !== '__remover__') fotos[r.gc.id + '#ic'] = { v: r.gc.iconeV, data: iconeGCNovo };
      if (iconeGCNovo === '__remover__') delete fotos[r.gc.id + '#ic'];
      salvarFotos(); iconeGCNovo = null;
      db.gcs = db.gcs.filter(function (x) { return x.id !== r.gc.id; }).concat([r.gc]); salvarDB();
      gcForm = null; fotoNova = null;
      if (fecharModal) fechar();
      toast(novo ? 'GC cadastrado ✓' : 'GC atualizado ✓');
      if (novo) { cfg.aba = 'gcs'; salvarCfg(); }
      render(); sincronizar(false);
    })
    .catch(function (e) { toast(e.message, 4500); })
    .then(function () { carregando(false); });
}
function editarGC(id) {
  var g = gcPor(id); if (!g || !podeEditarGC(g)) return;
  var restrito = !ehGestor();
  gcForm = {}; for (var k in g) gcForm[k] = g[k]; gcForm._restrito = restrito; fotoNova = null; iconeGCNovo = null;
  abrirModal('<h2>' + (restrito ? 'Dados do meu GC' : 'Editar GC') + '</h2>' + formGC(gcForm, restrito) +
    '<div style="height:16px"></div><button class="btn pr" data-a="salvarGCmodal">Salvar alterações</button><div class="gap"></div>' +
    '<button class="btn gh" data-a="fechar">Cancelar</button><div class="gap"></div>' +
    (ehAdmin() && !restrito ? '<button class="btn dg" data-a="excluirGC" data-v="' + esc(id) + '">Excluir GC</button>' : ''));
}
function excluirGC(id) {
  var g = gcPor(id); if (!g) return;
  if (PES(id).length && !confirm('Este GC tem ' + PES(id).length + ' pessoa(s). Elas continuam na planilha, mas o GC sairá das telas. Excluir?')) return;
  if (!confirm('Excluir o GC "' + g.nome + '"? Prefira marcar como Inativo se quiser manter o histórico no Painel.')) return;
  gcForm = {}; for (var k in g) gcForm[k] = g[k];
  carregando(true, 'Excluindo...');
  var envio = {}; for (var k2 in g) if (k2 !== 'temFoto' && k2 !== 'temIcone') envio[k2] = g[k2]; envio.deleted = true;
  var opExcluirGC = sbDisponivel() ? v39AtualizarGC(Object.assign({}, g, {status:'inactive'})).then(function(x){x.deleted=true;return {gc:x};}) : chamar('salvarGC', { gc: envio });
  opExcluirGC.then(function (r) {
    db.gcs = db.gcs.filter(function (x) { return x.id !== id; }).concat([r.gc]); salvarDB(); fechar(); toast('GC excluído'); render();
  }).catch(function (e) { toast(e.message, 4500); }).then(function () { carregando(false); });
}

/* ícone: recorta o centro em quadrado e reduz (PNG; JPEG se ficar grande) */
function processarIcone(file, lado, pronto) {
  if (!file) return;
  var fr = new FileReader();
  fr.onload = function () {
    var img = new Image();
    img.onload = function () {
      var m = Math.min(img.width, img.height), sx = (img.width - m) / 2, sy = (img.height - m) / 2, url = '', l = lado;
      for (var t = 0; t < 5; t++) {
        var cv = document.createElement('canvas'); cv.width = l; cv.height = l;
        cv.getContext('2d').drawImage(img, sx, sy, m, m, 0, 0, l, l);
        url = cv.toDataURL('image/png');
        if (url.length > 45000) url = cv.toDataURL('image/jpeg', 0.85);
        if (url.length < 45000) break;
        l = Math.round(l * 0.8);
      }
      if (url.length >= 45000) return toast('Não foi possível reduzir esta imagem. Tente outra.');
      pronto(url);
    };
    img.onerror = function () { toast('Arquivo de imagem inválido.'); };
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
}
function blocoIconeGC(g) {
  var ic = iconeGCNovo === '__remover__' ? '' : (iconeGCNovo || (g.id && fotos[g.id + '#ic'] ? fotos[g.id + '#ic'].data : ''));
  return '<label>Ícone do GC <span style="font-weight:500;color:#aaa">(opcional)</span></label>' +
    '<div style="display:flex;gap:12px;align-items:center"><div class="fotoprev" data-a="escolherIconeGC" id="g-iconeprev" style="height:72px;width:72px;flex:0 0 72px;border-radius:18px;background-size:cover;font-size:10px;padding:4px;' +
    (ic ? 'background-image:url(\'' + ic + '\');border:none;color:transparent' : '') + '">Escolher</div>' +
    '<div style="font-size:11px;color:#999;line-height:1.45">Aparece na barra superior quando alguém está neste GC. Sem ícone, usa a foto do GC ou o ícone da igreja.' +
    '<div id="g-iconerem" class="' + (ic ? '' : 'hide') + '" style="margin-top:6px"><span class="pill p-cinza" data-a="removerIconeGC" style="cursor:pointer">remover ícone</span></div></div></div>';
}
function pintarIconeGC(url) {
  var p = $('g-iconeprev'); if (!p) return;
  p.style.backgroundImage = url ? "url('" + url + "')" : ''; p.style.border = url ? 'none' : ''; p.style.color = url ? 'transparent' : '';
  var r = $('g-iconerem'); if (r) r.classList.toggle('hide', !url);
}

/* foto: reduz no aparelho antes de enviar */
function processarFoto(file) {
  if (!file) return;
  var fr = new FileReader();
  fr.onload = function () {
    var img = new Image();
    img.onload = function () {
      var max = 640, q = 0.72, url = '';
      for (var t = 0; t < 6; t++) {
        var esc2 = Math.min(1, max / Math.max(img.width, img.height));
        var cv = document.createElement('canvas');
        cv.width = Math.round(img.width * esc2); cv.height = Math.round(img.height * esc2);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        url = cv.toDataURL('image/jpeg', q);
        if (url.length < 45000) break;
        max = Math.round(max * 0.8); q = Math.max(0.5, q - 0.06);
      }
      if (url.length >= 45000) { toast('Não foi possível reduzir esta foto. Tente outra.'); return; }
      fotoNova = url;
      var prev = $('g-fotoprev');
      if (prev) { prev.style.backgroundImage = "url('" + url + "')"; prev.style.border = 'none'; prev.style.color = 'transparent'; }
    };
    img.onerror = function () { toast('Arquivo de imagem inválido.'); };
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
}

/* usuários */
var usuariosCache = null, logCache = [], carregandoUsr = false;
function carregarUsuarios(forcar) {
  if (!ehAdmin() || carregandoUsr || (usuariosCache && !forcar)) return;
  carregandoUsr = true;
  var op = sbDisponivel() ? v39CarregarAcessos().then(function(){return {usuarios:usuariosCache,log:[]};}) : chamar('usuarios', {});
  op.then(function (r) {
    usuariosCache = r.usuarios; logCache = r.log || [];
    db.pendentes = usuariosCache.filter(function (u) { return u.status === 'pendente'; }).length; salvarDB();
    if (cfg.aba === 'usuarios') render();
  }).catch(function (e) { toast(e.message, 4000); }).then(function () { carregandoUsr = false; });
}
function papeisPermitidos() {
  var l = ['supervisor', 'lider', 'discipulo', 'secretaria', 'tesouraria', 'voluntario', 'voluntarioLV', 'voluntarioInst', 'profissional'];
  if (papel() === 'master') l = ['master', 'pastor'].concat(l);
  return l.map(function (p) { return [p, PAPEL_NOME[p]]; });
}
function gcsOpts(sel) { return opts([['', '— sem GC —']].concat(GCS().map(function (g) { return [g.id, g.nome]; })), sel); }
function avisoServidor() {
  if (servidorV === null || servidorV >= SERVIDOR_ESPERADO) return '';
  return '<div class="aviso r"><b>Servidor desatualizado (v' + servidorV + ').</b> Este app precisa do Código.gs v' + SERVIDOR_ESPERADO +
    '. Cole o código novo, rode “Configurar / migrar” e publique uma <b>Nova versão</b> da implantação — sem isso, alterações podem não ser gravadas.</div>';
}
function rUsuarios() {
  if (!ehAdmin()) return '<div class="empty">Sem permissão.</div>';
  if (servidorV !== null && servidorV < SERVIDOR_ESPERADO) return avisoServidor();
  if (!usuariosCache) return '<div class="card"><div class="empty">Carregando usuários...</div></div>';
  var pend = usuariosCache.filter(function (u) { return u.status === 'pendente'; });
  var h = '<div class="sec">Aguardando validação (' + pend.length + ')</div>';
  if (!pend.length) h += '<div class="card"><div class="empty">Nenhum cadastro pendente. 🙌</div></div>';
  pend.forEach(function (u) {
    var papelSug = u.papelSolicitado === 'pastor' && papel() !== 'master' ? 'lider' : (u.papelSolicitado || 'discipulo');
    h += '<div class="card"><div class="row" style="padding-top:0">' + avatarU(u) + '<div class="info"><div class="nm">' + esc(u.nome) + '</div>' +
      '<div class="sb">@' + esc(u.usuario) + (u.fone ? ' · ' + esc(u.fone) : '') + (u.email ? ' · ' + esc(u.email) : '') + '<br>Pediu: <b>' + esc(PAPEL_NOME[u.papelSolicitado] || '—') + '</b> em <b>' + esc(u.gcSolicitado ? gcNome(u.gcSolicitado) : 'nenhum GC') + '</b> · ' + dataHoraLocal(u.criadoEm) + '</div>' +
      (u.obs ? '<div class="sb" style="font-style:italic">"' + esc(u.obs) + '"</div>' : '') + '</div></div>' +
      '<div class="g2"><div><label>Nível de acesso</label><select id="ap-papel-' + u.id + '">' + opts(papeisPermitidos(), papelSug) + '</select></div>' +
      '<div><label>GC</label><select id="ap-gc-' + u.id + '">' + gcsOpts(u.gcSolicitado) + '</select></div></div><div class="gap"></div>' +
      '<div class="acoes"><button class="btn vd sm" data-a="aprovar" data-v="' + u.id + '">Aprovar</button><button class="btn dg sm" data-a="recusar" data-v="' + u.id + '">Recusar</button></div>' +
      (papel() === 'master' ? '<div class="acoes" style="margin-top:7px"><button class="btn gh sm" data-a="corrigirUsuario" data-v="' + u.id + '">Corrigir dados</button>' +
        '<button class="btn gh sm" data-a="excluirUsuario" data-v="' + u.id + '" style="color:var(--vermelho)">Excluir</button></div>' : '') + '</div>';
  });
  var ativos = usuariosCache.filter(function (u) { return u.status !== 'pendente'; });
  var ordem = { master: 0, pastor: 1, supervisor: 2, lider: 3, discipulo: 4, secretaria: 5, tesouraria: 6, profissional: 7, voluntario: 8, voluntarioLV: 8, voluntarioInst: 8 };
  ativos.sort(function (a, b) { return (ordem[a.papel] || 9) - (ordem[b.papel] || 9) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
  h += '<div class="sec">Usuários (' + ativos.length + ')</div><div class="card">';
  h += ativos.length ? ativos.map(function (u) {
    var st = u.status === 'ativo' ? '' : '<span class="pill ' + (u.status === 'recusado' ? 'p-cinza' : 'p-vermelho') + '">' + esc(u.status) + '</span>';
    return '<div class="row cl" data-a="editarUsuario" data-v="' + u.id + '">' + avatarU(u) + '<div class="info"><div class="nm">' + esc(u.nome) + '</div>' +
      '<div class="sb">@' + esc(u.usuario) + ' · ' + (u.gcId ? esc(gcNome(u.gcId)) : 'todos os GCs') + (u.ultimoAcesso ? ' · último acesso ' + dataHoraLocal(u.ultimoAcesso) : '') + '</div></div>' +
      (st || '<span class="pill p-preto">' + esc(PAPEL_NOME[u.papel] || '—') + (u.acessos && Object.keys(u.acessos).length ? ' +' : '') + '</span>') + '</div>';
  }).join('') : '<div class="empty">Nenhum usuário.</div>';
  h += '</div><div class="card" style="font-size:12px;line-height:1.6;color:#555"><b>Níveis de acesso</b><br>' +
    '<b>Master</b> e <b>Pastor</b>: acesso completo, validam cadastros (só o master concede master/pastor).<br>' +
    '<b>Supervisor</b>: painel da rede, cadastro e edição de GCs, acesso a todos os GCs.<br>' +
    '<b>Líder</b>: o próprio GC, completo; libera as visitas do Lar de Vida.<br><b>Discípulo</b>: o próprio GC — chamada e visitas do Lar de Vida.<br>' +
    '<b>Secretaria</b>: cultos e eventos, cadastro de visitantes e recados.<br><b>Tesouraria</b>: valores dos cultos e relatório financeiro.<br>' +
    '<b>Voluntário</b>: só cadastra visitantes no horário do culto liberado. <b>Voluntário Lar de Vida</b>: também visita as casas que o líder liberar. <b>Voluntário Instituto</b>: agenda atendimentos, sem ver os nomes dos pacientes.<br>' +
    '<b>Profissional de saúde</b>: vê apenas a própria agenda, os nomes dos pacientes e o prontuário — nem o master nem o pastor têm acesso a esses dados.<br>' +
    '<span style="color:#888">Toque num usuário para ajustar acessos individuais (o “+” indica ajustes).</span></div>';
  if (logCache.length) {
    h += '<div class="sec">Atividade recente</div><div class="card">' + logCache.slice(0, 25).map(function (l) {
      return '<div class="row" style="padding:7px 0"><div class="info"><div class="sb" style="margin:0"><b style="color:#333">@' + esc(l.usuario) + '</b> · ' + esc(l.acao) + (l.detalhe ? ' · ' + esc(l.detalhe) : '') + '</div></div><span style="font-size:10.5px;color:#aaa;white-space:nowrap">' + dataHoraLocal(l.data) + '</span></div>';
    }).join('') + '</div>';
  }
  if (papel() === 'master') h += '<button class="btn pr" data-a="auditoria">Registro de auditoria</button><div class="gap"></div>';
  if(sbDisponivel()&&v39PodeRedefinirSenha())h+='<button class="btn gh" data-a="pedidosReset">Pedidos de redefinição de senha</button><div class="gap"></div>';
  h += '<button class="btn gh" data-a="recarregarUsuarios">Atualizar lista</button>';
  return h;
}
function salvarUsuarioSrv(dados, msg) {
  var u=(usuariosCache||[]).filter(function(x){return x.id===dados.id;})[0];
  if(sbDisponivel()&&u&&!u._request){
    var ops=[];
    if(dados.papel&&dados.papel!==u.papel)ops.push(v39AlterarPerfil(u,dados.papel));
    if(dados.status&&dados.status!==u.status)ops.push((dados.status==='ativo'||dados.status==='active')?v39Reativar(u,'Alteração no frontend v39'):v39Suspender(u,'Alteração no frontend v39'));
    if(dados.gcId&&dados.gcId!==u.gcId&&u.pessoaId)ops.push(v39AssociarPessoaGC(u.pessoaId,dados.gcId,'frontend_v39_user_gc'));
    carregando(true,'Salvando...');
    return Promise.all(ops).then(function(){toast(msg||'Usuário atualizado ✓');fechar();usuariosCache=null;carregarUsuarios(true);}).catch(function(e){toast(e.message,4500);}).then(function(){carregando(false);});
  }
  carregando(true,'Salvando...');
  return chamar('salvarUsuario',{usuario:dados}).then(function(){toast(msg||'Usuário atualizado ✓');fechar();usuariosCache=null;carregarUsuarios(true);}).catch(function(e){toast(e.message,4500);}).then(function(){carregando(false);});
}
function aprovar(id) {
  if(sbDisponivel()&&!v39PodeAprovarSolicitacoes()){toast('Sem permissão para aprovar solicitações.',4000);return;}
  var p = $('ap-papel-' + id).value, g = $('ap-gc-' + id).value;
  if ((p === 'lider' || p === 'discipulo') && !g) { toast('Escolha o GC para líder ou discípulo.'); return; }
  salvarUsuarioSrv({ id: id, papel: p, gcId: (p === 'lider' || p === 'discipulo') ? g : g, status: 'ativo' }, 'Cadastro aprovado ✓');
}
function recusar(id) { if(sbDisponivel()&&!v39PodeAprovarSolicitacoes()){toast('Sem permissão para decidir solicitações.',4000);return;} if (!confirm('Recusar este cadastro?')) return; var q=(v39Access.requests||[]).filter(function(x){return x.id===id;})[0]; if(sbDisponivel()&&q){carregando(true,'Recusando...');v39Rejeitar(q,'Recusado pelo administrador').then(function(){toast('Cadastro recusado');fechar();usuariosCache=null;carregarUsuarios(true);}).catch(function(e){toast(e.message,4500);}).then(function(){carregando(false);});return;} salvarUsuarioSrv({ id: id, status: 'recusado' }, 'Cadastro recusado'); }
function editarUsuario(id) {
  if(sbDisponivel()&&!v39PodeVerUsuarios()){toast('Sem permissão para visualizar usuários.',4000);return;}
  var u = (usuariosCache || []).filter(function (x) { return x.id === id; })[0]; if (!u) return;
  var proprio = u.id === eu().id, bloqueado = u.papel === 'master' && papel() !== 'master';
  var papeis = papeisPermitidos();
  if (!papeis.some(function (x) { return x[0] === u.papel; }) && u.papel) papeis.unshift([u.papel, PAPEL_NOME[u.papel]]);
  abrirModal('<h2>' + esc(u.nome) + '</h2><div class="sb" style="font-size:12.5px;color:#888">@' + esc(u.usuario) + (u.fone ? ' · ' + esc(u.fone) : '') + (u.email ? ' · ' + esc(u.email) : '') + '</div>' +
    (u.aprovadoPor ? '<div style="font-size:11.5px;color:#999;margin-top:4px">Aprovado por @' + esc(u.aprovadoPor) + ' em ' + dataHoraLocal(u.aprovadoEm) + '</div>' : '') +
    (bloqueado ? '<div class="aviso" style="margin-top:12px">Somente o master pode alterar outro master.</div>' :
    '<label>Nível de acesso</label><select id="eu-papel"' + (proprio ? ' disabled' : '') + '>' + opts(papeis, u.papel) + '</select>' +
    '<label>GC vinculado</label><select id="eu-gc">' + gcsOpts(u.gcId) + '</select>' +
    '<label>Situação</label><select id="eu-status"' + (proprio ? ' disabled' : '') + '>' + opts([['ativo', 'Ativo'], ['bloqueado', 'Bloqueado'], ['recusado', 'Recusado']], u.status) + '</select>' +
    (u.papel === 'master' ? '<div class="aviso" style="margin-top:12px">O nível <b>Master</b> tem acesso total a todas as ações, independentemente dos acessos marcados.</div>'
      : (u._v39 ? '<div class="aviso" style="margin-top:12px">As permissões efetivas são definidas pelo perfil no Supabase.</div>' : blocoAcessos(u, proprio || (u.papel === 'pastor' && papel() !== 'master')))) +
    '<div style="height:16px"></div><button class="btn pr" data-a="salvarUsuario" data-v="' + u.id + '">Salvar</button><div class="gap"></div>' +
    '<button class="btn gh" data-a="redefinirSenha" data-v="' + u.id + '">Solicitar redefinição de senha</button><div class="gap"></div>' +
    (proprio ? '' : '<button class="btn gh" data-a="encerrarSessoes" data-v="' + u.id + '">Encerrar sessões (desconectar dos aparelhos)</button><div class="gap"></div>' + (v39PodeSuspenderGlobal() ? '<button class="btn dg" data-a="suspenderGlobal" data-v="' + u.id + '">Suspender globalmente</button><div class="gap"></div>' : '') + (v39PodeReativar() ? '<button class="btn gh" data-a="reativarGlobal" data-v="' + u.id + '">Reativar globalmente</button><div class="gap"></div>' : ''))) +
    '<div style="font-size:11px;color:#999;margin:2px 0 10px">' + (u.consentEm ? 'Aceitou a política de privacidade em ' + dataHoraLocal(u.consentEm) : 'Ainda não aceitou a política de privacidade.') + '</div>' +
    (papel() === 'master' ? '<div class="sec" style="margin-left:0">Cadastro (somente master)</div>' +
      '<button class="btn gh" data-a="corrigirUsuario" data-v="' + u.id + '">Corrigir usuário de acesso</button><div class="gap"></div>' +
      (proprio || sbDisponivel() ? '' : '<button class="btn dg" data-a="excluirUsuario" data-v="' + u.id + '">Excluir usuário</button><div class="gap"></div>') : '') +
    '<button class="btn gh" data-a="fechar">Fechar</button>');
}
function corrigirUsuario(id) {
  var u = (usuariosCache || []).filter(function (x) { return x.id === id; })[0]; if (!u) return;
  abrirModal('<h2>Corrigir cadastro</h2><div class="sb" style="font-size:12.5px;color:#888">' + esc(PAPEL_NOME[u.papel] || 'Pendente') + ' · ' + esc(u.status) + '</div>' +
    '<label>Nome completo *</label><input id="cu-nome" value="' + esc(u.nome) + '">' +
    '<label>Usuário de acesso *</label><input id="cu-usuario" autocapitalize="none" autocorrect="off" spellcheck="false" value="' + esc(u.usuario) + '">' +
    '<div id="cu-senhawrap" class="hide"><div class="aviso" style="margin:10px 0 0">Ao trocar o usuário de acesso é preciso definir uma <b>senha nova</b>. Informe a pessoa.</div>' +
    '<label>Nova senha (mín. 6)</label><input id="cu-senha" type="text" autocomplete="off"></div>' +
    '<div class="g2"><div><label>WhatsApp</label><input id="cu-fone" type="tel" inputmode="numeric" value="' + esc(u.fone) + '"></div>' +
    '<div><label>E-mail</label><input id="cu-email" type="email" autocapitalize="none" value="' + esc(u.email) + '"></div></div>' +
    '<div style="height:16px"></div><button class="btn pr" data-a="salvarCorrecao" data-v="' + esc(id) + '" data-orig="' + esc(u.usuario) + '">Salvar correção</button><div class="gap"></div>' +
    '<button class="btn gh" data-a="fechar">Cancelar</button>');
}
function salvarCorrecao(id, btn) {
  if(sbDisponivel()){
    var u=(usuariosCache||[]).filter(function(x){return x.id===id;})[0];if(!u)return toast('Usuário não encontrado.');
    if(!v39PodeCorrigirLogin())return toast('Sem permissão para corrigir login.',4000);
    var novo=$('cu-usuario').value.trim().toLowerCase();if(!/^[a-z0-9._-]{3,30}$/.test(novo))return toast('Usuário: 3 a 30 caracteres, sem espaços ou acentos.');
    if(novo===u.usuario)return toast('O usuário de acesso não foi alterado.');
    carregando(true,'Corrigindo login...');
    return v39CorrigirLogin(u,novo).then(function(){return v39EncerrarSessoesUsuario(u.id);}).then(function(){toast('Usuário de acesso corrigido; sessões encerradas.',5000);fechar();usuariosCache=null;carregarUsuarios(true);}).catch(function(e){toast(e.message,5000);}).then(function(){carregando(false);});
  }
  var orig = btn.getAttribute('data-orig'), login = $('cu-usuario').value.trim().toLowerCase(), d = { id: id, nome: $('cu-nome').value.trim(), usuario: login, fone: $('cu-fone').value.trim(), email: $('cu-email').value.trim() };
  if (!d.nome) return toast('Informe o nome.');
  if (!/^[a-z0-9._-]{3,30}$/.test(login)) return toast('Usuário: 3 a 30 caracteres, sem espaços ou acentos.');
  if (login !== orig) {
    var sn = $('cu-senha').value;
    if (sn.length < 6) { $('cu-senhawrap').classList.remove('hide'); return toast('Defina uma nova senha (mínimo 6 caracteres) para o novo usuário de acesso.', 4500); }
    d.h = hashSenha(login, sn);
  }
  carregando(true, 'Salvando...');
  chamar('corrigirUsuario', { usuario: d }).then(function (r) {
    toast(r.trocouLogin ? 'Cadastro corrigido ✓ — informe o novo usuário e a senha à pessoa' : 'Cadastro corrigido ✓', 4500);
    if (id === eu().id) { cfg.usuario.nome = d.nome; cfg.usuario.usuario = login; salvarCfg(); }
    fechar(); usuariosCache = null; carregarUsuarios(true); sincronizar(false);
  }).catch(function (e) { toast(e.message, 4500); }).then(function () { carregando(false); });
}
function excluirUsuario(id) {
  var u = (usuariosCache || []).filter(function (x) { return x.id === id; })[0]; if (!u) return;
  var gcs = GCS().filter(function (g) { return g.liderId === id || g.supervisorId === id || String(g.discipulos || '').split(',').indexOf(id) >= 0; });
  var casas = PES().filter(function (p) { return p.lvDiscipuloId === id && p.lvStatus === 'acompanhando'; }).length;
  var msg = 'Excluir definitivamente o usuário ' + u.nome + ' (@' + u.usuario + ')?\n\nEle perde o acesso ao app na hora.' +
    (gcs.length ? '\n• Sai da liderança/discípulos de: ' + gcs.map(function (g) { return g.nome; }).join(', ') : '') +
    (casas ? '\n• ' + casas + ' casa(s) do Lar de Vida voltam para o líder liberar de novo.' : '') +
    '\n\nOs cadastros de pessoas, chamadas e histórico continuam guardados. Para só suspender o acesso, use Situação = Bloqueado.';
  if (!confirm(msg)) return;
  carregando(true, 'Excluindo...');
  chamar('excluirUsuario', { id: id }).then(function (r) {
    var e = r.efeitos || {};
    toast('Usuário excluído' + (e.gcs ? ' · ' + e.gcs + ' GC(s) atualizado(s)' : '') + (e.casas ? ' · ' + e.casas + ' casa(s) liberada(s)' : ''), 4500);
    fechar(); usuariosCache = null; carregarUsuarios(true); sincronizar(false);
  }).catch(function (e) { toast(e.message, 4500); }).then(function () { carregando(false); });
}
function salvarUsuario(id) {
  var d = { id: id, gcId: $('eu-gc').value };
  if (!$('eu-papel').disabled) d.papel = $('eu-papel').value;
  if (!$('eu-status').disabled) d.status = $('eu-status').value;
  var ac = lerAcessos(); if (ac) d.acessos = ac;
  salvarUsuarioSrv(d, 'Usuário atualizado ✓');
}
function redefinirSenha(id) {
  var u=(usuariosCache||[]).filter(function(x){return x.id===id;})[0];if(!u)return;
  if(sbDisponivel()){
    if(!v39PodeRedefinirSenha())return toast('Sem permissão para solicitar redefinição.',4000);
    if(!confirm('Registrar pedido de redefinição para @'+u.usuario+' e encerrar as sessões atuais?'))return;
    carregando(true,'Registrando pedido...');
    return v39MarcarReset(u).then(function(){return v39EncerrarSessoesUsuario(u.id);}).then(function(){toast('Pedido registrado. Oriente a pessoa a usar “Esqueci a senha”.',5000);fechar();}).catch(function(e){toast(e.message,5000);}).then(function(){carregando(false);});
  }
  var sn=prompt('Nova senha provisória para @'+u.usuario+' (mínimo 6 caracteres).');if(sn===null)return;if(sn.length<6)return toast('A senha precisa ter pelo menos 6 caracteres.');carregando(true,'Redefinindo...');chamar('redefinirSenha',{id:id,h:hashSenha(u.usuario,sn)}).then(function(){toast('Senha redefinida ✓');fechar();}).catch(function(e){toast(e.message,4500);}).then(function(){carregando(false);});
}

/* conta */
function blocoConta() {
  var u = eu();
  return '<div class="card"><div class="row" style="padding-top:0"><div class="fp-click" ' + (u.pessoaId ? 'data-a="fotoDireta" data-v="' + esc(u.pessoaId) + '"' : '') + '>' + avatarU(u) + (u.pessoaId ? '<span>📷</span>' : '') + '</div><div class="info"><div class="nm">' + esc(u.nome) + '</div>' +
    '<div class="sb">@' + esc(u.usuario) + ' · ' + esc(PAPEL_NOME[u.papel] || '') + (u.gcId ? ' · ' + esc(gcNome(u.gcId)) : '') + '</div></div></div>' +
    (pode('config') ? '<button class="btn pr" data-a="aba" data-v="config">Configurações da igreja</button><div class="gap"></div>' : '') +
    (ehAdmin() ? '<button class="btn gh" data-a="aba" data-v="usuarios">Usuários e acessos' + (db.pendentes ? ' · <b style="color:var(--vermelho)">' + db.pendentes + ' aguardando</b>' : '') + '</button><div class="gap"></div>' : '') +
    (podeFin() && cfg.modo !== 'ger' ? '<button class="btn gh" data-a="aba" data-v="financeiro">Consolidado financeiro</button><div class="gap"></div>' : '') +
    (temCultos() && cfg.modo !== 'ger' ? '<button class="btn gh" data-a="aba" data-v="cultos">Cultos e eventos</button><div class="gap"></div>' : '') +
    (temCursos() && cfg.modo !== 'ger' ? '<button class="btn gh" data-a="aba" data-v="cursos">Treinamentos/Reuniões</button><div class="gap"></div>' : '') +
    (temInst() && cfg.modo !== 'ger' ? '<button class="btn gh" data-a="aba" data-v="instituto">Instituto</button><div class="gap"></div>' : '') +
    (pode('consulta') && cfg.modo !== 'ger' ? '<button class="btn gh" data-a="aba" data-v="membros">Consultar cadastro de pessoas</button><div class="gap"></div>' : '') +
    (pode('visitantes') && cfg.modo !== 'lv' ? '<button class="btn gh" data-a="aba" data-v="lvnovo">Cadastrar visitante do culto</button><div class="gap"></div>' : '') +
    '<button class="btn gh" data-a="trocarSenha">Trocar minha senha</button><div class="gap"></div>' +
    (pwaPodeInstalar() ? '<button class="btn pr" data-a="pwaInstalar">Instalar o app neste aparelho</button><div class="gap"></div>' : '') +
    '<button class="btn dg" data-a="sair">Sair deste aparelho</button><div class="gap"></div>' +
    '<button class="btn dg" data-a="sairTodos">Sair de todos os aparelhos</button>' +
    '<div style="font-size:11px;color:#999;margin-top:8px;line-height:1.5">Por segurança, a sessão expira após 7 dias sem uso. Ao sair, os dados guardados neste aparelho são apagados.</div></div>' +
    '<div class="sec">Sincronização</div><div class="card"><div style="font-size:13px;line-height:1.6;color:#444;margin-bottom:12px">' +
    (cfg.ultima ? '<b style="color:var(--verde)">● Conectado</b><br>Última sincronização: ' + dataHoraLocal(cfg.ultima) : '<b style="color:#999">● Ainda não sincronizado</b>') +
    '<br>Conexão protegida pelo app oficial' + (STORE_OK ? '' : '<br><b style="color:var(--vermelho)">O navegador está bloqueando o armazenamento local.</b>') +
    '</div><button class="btn" data-a="sincronizar">Sincronizar agora</button><div class="gap"></div><button class="btn gh" data-a="verPolitica">Política de privacidade</button></div>' +
    '<div class="meta">' + esc(igrNome()) + ' · 2Gather · app v' + VERSAO_APP + '</div>';
}
function rConta() { return blocoConta(); }
function trocarSenha() {
  abrirModal('<h2>Trocar senha</h2><label>Senha atual</label><input id="ts-a" type="password"><label>Nova senha</label><input id="ts-n" type="password">' +
    '<label>Confirmar nova senha</label><input id="ts-c" type="password"><div style="height:16px"></div><button class="btn pr" data-a="confirmarSenha">Salvar nova senha</button><div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
}
function confirmarSenha() {
  var a = $('ts-a').value, n = $('ts-n').value, c = $('ts-c').value, us = eu().usuario;
  if (n.length < 6) return toast('A nova senha precisa ter pelo menos 6 caracteres.');
  if (n !== c) return toast('As senhas não conferem.');
  carregando(true, 'Salvando...');
  (sbDisponivel()?v39TrocarSenhaAtual(a,n):chamar('trocarSenha', { atual: hashSenha(us, a), nova: hashSenha(us, n) })).then(function () { fechar(); toast('Senha alterada ✓'); })
    .catch(function (e) { toast(e.message, 4000); }).then(function () { carregando(false); });
}
function servidor() {
  abrirModal('<h2>Servidor de dados</h2><div style="font-size:12.5px;color:#777;line-height:1.5;margin-top:4px">URL do App da Web do Apps Script (termina em /exec). Só altere se a liderança pedir.</div>' +
    '<label>URL</label><textarea id="sv-url" rows="3" style="font-size:12px">' + esc(cfg.url) + '</textarea><div style="height:14px"></div>' +
    '<button class="btn pr" data-a="salvarServidor">Salvar e testar</button><div class="gap"></div><button class="btn gh" data-a="padraoServidor">Voltar ao padrão</button><div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
}
function salvarServidor(url) {
  url = (url || $('sv-url').value).trim();
  if (!/\/exec(\?.*)?$/.test(url)) return toast('A URL precisa terminar em /exec.');
  var ant = cfg.url; cfg.url = url;
  carregando(true, 'Testando...');
  chamarBruto({ acao: 'ping' }).then(function (r) {
    if (!r || !r.ok) throw new Error('Resposta inesperada');
    salvarCfg(); fechar(); toast('Servidor OK (v' + r.versao + ')');
  }).catch(function (e) { cfg.url = ant; toast('Não conectou: ' + e.message, 4500); }).then(function () { carregando(false); });
}

/* ═══════════════════ VISÃO DO GC ═══════════════════ */
function gcA() { return cfg.gcAtual; }
function rPainel() {
  var id = gcA(), m = metricas(id), g = gcPor(id), h = '';
  if (!g) return '<div class="empty">GC não encontrado.</div>';
  if (!pode('gcEvento') && !pode('lvLiberar')) return inicioDiscipulo(g) + blocoCursosHoje();     // discípulo: início enxuto
  h += inicioLider(g) + blocoCursosHoje();
  h += '<div class="sec">Indicadores do GC</div>';
  if (pode('lvLiberar')) h += blocoOrganograma();
  if (podeEditarGC(g)) h += '<button class="btn gh" data-a="editarGC" data-v="' + esc(id) + '" style="margin-bottom:12px">Editar dados do GC</button>';
  var prox = proximoEncontro(g);
  if (prox) h += '<div class="card" style="display:flex;align-items:center;gap:12px;padding:12px 14px"><div style="width:6px;align-self:stretch;background:var(--dourado);border-radius:4px"></div><div style="flex:1"><div style="font-size:11px;color:#888;font-weight:700">PRÓXIMO ENCONTRO</div><div style="font-weight:800">' +
    DIAS[parseData(prox).getDay()] + ', ' + br(prox) + (g.horario ? ' às ' + esc(g.horario) : '') + '</div>' + (g.endereco ? '<div style="font-size:11.5px;color:#888">' + esc(g.endereco) + '</div>' : '') + '</div></div>';
  h += '<div class="kpis">' + kpi(m.ativos, 'Pessoas ativas', 'dk') + kpi(num1(m.media), 'Média de presentes') +
    kpi(m.pres === null ? '—' : pct(m.pres), '% de presença') + kpi(m.vcom ? pct(m.vret / m.vcom) : '—', 'Retorno do visitante') +
    kpi(m.novos, 'Novos no mês') + kpi(m.alertas, 'Com 2+ faltas', 'al') + '</div>';
  h += graficoGCEncontros(id);
  h += blocoLVResumo([id], true);
  h += blocoMapa([id], 'Onde estão os frequentadores');
  if (pode('gcEvento') || pode('relFin')) h += blocoFinanceiro([id], 'Dízimos e ofertas');
  var pes = PES(id), t = pes.length || 1;
  h += '<div class="sec">Jornada do Membro</div><div class="card">' + ETAPAS.map(function (e) { return barra(e, pes.filter(function (p) { return p.jornada === e; }).length, t); }).join('') + '</div>';
  var encs = encOrd(id);
  var cs = [['Em dia', 'emdia', 'var(--verde)'], ['Atenção — 1 falta', 'atencao', 'var(--amarelo)'], ['Contatar — 2+ faltas', 'contatar', 'var(--vermelho)'], ['Visitantes em visita', 'visita', 'var(--azul)'], ['Inativos', 'inativo', '#bbb']];
  h += '<div class="sec">Situação do cuidado</div><div class="card">' + cs.map(function (c) {
    return barra('<i class="dot" style="background:' + c[2] + '"></i>' + c[0], pes.filter(function (p) { return statusDe(p, encs).s === c[1]; }).length, t, c[2]); }).join('') + '</div>';
  var cl = (function () { var m = {}; pes.forEach(function (p) { if (p.canal) m[p.canal] = (m[p.canal] || 0) + 1; }); return Object.keys(m).map(function (k) { return [k, m[k]]; }); })().sort(function (a, b) { return b[1] - a[1]; });
  h += '<div class="sec">Como conheceram / receberam o convite</div><div class="card">' + (cl.length ? cl.map(function (x) { return barra(x[0], x[1], t); }).join('') : '<div class="empty">Cadastre pessoas para ver os canais.</div>') + '</div>';
  return h;
}

var filtroP = 'todos', buscaP = '';
function rPessoas() {
  var id = gcA(), encs = encOrd(id), todos = PES(id);
  var ativos = function (p) { return p.status === 'Ativo' || p.status === 'Em visita'; };
  var cont = { todos: todos.length, Membro: todos.filter(function (p) { return p.tipo === 'Membro' && ativos(p); }).length,
    Visitante: todos.filter(function (p) { return p.tipo === 'Visitante' && ativos(p); }).length,
    inativos: todos.filter(function (p) { return !ativos(p); }).length };
  var q = normalizar(buscaP);
  var l = todos.filter(function (p) { return !q || normalizar(p.nome + ' ' + (p.apelido || '') + ' ' + (p.bairro || '')).indexOf(q) >= 0 || (soDigitos(buscaP).length >= 4 && soDigitos(p.fone).indexOf(soDigitos(buscaP)) >= 0); });
  if (filtroP === 'inativos') l = l.filter(function (p) { return !ativos(p); });
  else if (filtroP !== 'todos') l = l.filter(function (p) { return p.tipo === filtroP && ativos(p); });
  l.sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
  var h = '<div class="busca"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
    '<input id="busca-p" placeholder="Buscar nome, telefone ou bairro" value="' + esc(buscaP) + '" autocomplete="off"></div>';
  h += '<div class="chips">' + [['todos', 'Todos'], ['Membro', 'Membros'], ['Visitante', 'Visitantes'], ['inativos', 'Inativos']].map(function (x) {
    return '<button data-a="filtroP" data-v="' + x[0] + '" class="' + (filtroP === x[0] ? 'on' : '') + '">' + x[1] + ' <span>' + cont[x[0]] + '</span></button>'; }).join('') + '</div>';
  if (!l.length) return h + '<div class="card"><div class="empty">Nenhuma pessoa encontrada.</div></div>' + fabPessoa();
  var grupos = {}, ordem = [];
  l.forEach(function (p) { var k = normalizar(p.nome).charAt(0).toUpperCase() || '#'; if (!grupos[k]) { grupos[k] = []; ordem.push(k); } grupos[k].push(p); });
  h += '<div class="lista-pes">' + ordem.map(function (k) {
    return '<div class="grp"><div class="letra">' + k + '</div><div class="card lp">' + grupos[k].map(function (p) {
      var st = statusDe(p, encs), s2 = statsDe(p, encs);
      var pill = { emdia: ['p-verde', 'em dia'], atencao: ['p-amarelo', '1 falta'], contatar: ['p-vermelho', st.faltas + ' faltas'], inativo: ['p-cinza', String(p.status).toLowerCase()],
                   visita: ['p-dour', 'visitante ' + visitasDe(p) + '/' + VISITAS_PARA_ATIVO] }[st.s] || ['p-cinza', ''];
      var sub = [s2.mar ? pct(s2.pct) + ' presença' : 'sem chamada', separarBairroCidade(p.bairro, p.cidade).bairro, p.lvStatus === 'acompanhando' ? 'Lar de Vida ' + lvVis(p).length + '/' + LV_SEMANAS : ''].filter(Boolean).join(' · ');
      return '<div class="row cl" data-a="fichaPessoa" data-v="' + esc(p.id) + '">' + avatarP(p) + '<div class="info"><div class="nm">' + esc(p.nome) +
        (p.apelido ? ' <span class="apel">“' + esc(p.apelido) + '”</span>' : '') + '</div><div class="sb">' + esc(sub) + '</div></div>' +
        '<span class="pill ' + pill[0] + '">' + pill[1] + '</span></div>';
    }).join('') + '</div></div>';
  }).join('') + '</div>';
  return h + '<div class="meta">' + l.length + ' pessoa(s) · o cadastro do GC não dá acesso ao app</div>' + fabPessoa();
}
function fabPessoa() { return editaPessoas() ? '<button class="fab" data-a="novaPessoa" title="Cadastrar pessoa"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>' : ''; }
var CORES_AV = ['#2F5BEA', '#16A36A', '#7C5CFA', '#F06A3A', '#0E9C9C', '#C9930A', '#DB2777', '#5E6470'];
function corAvatar(nome) { var h = 0, t = String(nome || ''); for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0; return 'background:' + CORES_AV[h % CORES_AV.length] + ';color:#fff'; }
var editP = null;
var ctxPessoa = {};
function abrirPessoa(id, ctx) {
  var p = id ? db.pessoas.filter(function (x) { return x.id === id; })[0] : null;
  editP = id || null; ctx = ctx || {}; ctxPessoa = ctx;
  var ro = !editaPessoas(), dis = ro ? ' disabled' : '';
  var g = function (k, d) { return esc(p ? (p[k] || '') : (d || '')); };
  var end = separarBairroCidade(p ? p.bairro : '', p ? p.cidade : '');
  fotoNovaP = null; fpAlvo = { pid: id || '', direto: false };
  abrirModal('<h2>' + (p ? (ro ? esc(p.nome) : 'Editar pessoa') : (ctx.addChamada ? 'Visitante — 1ª visita' : 'Nova pessoa')) + '</h2>' +
    (p && p.origem ? '<span class="pill p-dour">' + esc(p.origem) + '</span>' : '') + (p ? lvResumoPill(p) + pillIgreja(p) : '') +
    (ro ? '' : campoFotoPessoa(id || '')) +
    '<label>Nome completo *</label><input id="f-nome" value="' + g('nome') + '"' + dis + '>' +
    '<label>Como gostaria de ser chamado(a) / apelido</label><input id="f-apelido" value="' + g('apelido') + '" placeholder="Ex.: Juninho, Dona Cida"' + dis + '>' +
    '<div class="g2"><div><label>Tipo</label><select id="f-tipo"' + dis + '>' + opts([['Membro', 'Membro'], ['Visitante', 'Visitante'], ['Criança/Adolescente', 'Criança/Adolescente']], p ? p.tipo : 'Visitante') + '</select></div>' +
    '<div><label>Status</label><select id="f-status"' + dis + '>' + opts([['Em visita', 'Em visita'], ['Ativo', 'Ativo'], ['Inativo', 'Inativo'], ['Mudou de GC', 'Mudou de GC'], ['Afastado', 'Afastado']], p ? p.status : (ctx.tipo === 'Membro' ? 'Ativo' : 'Em visita')) + '</select></div></div>' +
    '<div class="g2"><div><label>WhatsApp</label><input id="f-fone" type="tel" inputmode="numeric" value="' + g('fone') + '"' + dis + '></div>' +
    '<div><label>Nascimento</label><input id="f-nasc" type="date" value="' + g('nasc') + '"' + dis + '></div></div>' +
    campoSexo('f', p, dis, false) +
    '<div class="g2"><div><label>CEP <span style="font-weight:500;color:#aaa">(opcional)</span></label><input id="f-cep" inputmode="numeric" maxlength="9" placeholder="00000-000" value="' + esc(mascaraCep(p ? p.cep : '')) + '"' + dis + '></div>' +
    '<div><label>1ª participação</label><input id="f-prim" type="date" value="' + g('prim', ctx.prim || hoje()) + '"' + dis + '></div></div>' +
    '<div id="f-cepinfo" style="font-size:11.5px;margin-top:5px;line-height:1.4"></div>' +
    camposEndereco('f', p, dis) +
    '<div class="g2"><div>' + campoBairro('f', end.bairro, false, dis) + '</div>' +
    '<div><label>Cidade</label><input id="f-cidade" value="' + esc(end.cidade || (p ? '' : cidadePadrao(ctx.gcId))) + '" placeholder="Ex.: Matão/SP"' + dis + '></div></div>' +
    '<div style="font-size:11px;color:#999;margin-top:4px">Bairro e cidade definem a posição no mapa de calor.</div>' +
    (p && p.status === 'Em visita' ? '<div style="font-size:11.5px;color:#8a5b00;margin-top:6px">' + visitasDe(p) + ' de ' + VISITAS_PARA_ATIVO + ' visitas — passa para Ativo automaticamente na ' + VISITAS_PARA_ATIVO + 'ª presença.</div>' : '') +
    '<label>Etapa da jornada</label><select id="f-jornada"' + dis + '>' + opts(ETAPAS.map(function (e) { return [e, e]; }), p ? p.jornada : ETAPAS[0]) + '</select>' +
    campoCanal('f', p, dis) +
    camposIgrejaVisita('f', p, dis) +
    '<div class="g2"><div><label>Convidado por</label><input id="f-conv" value="' + g('conv') + '"' + dis + '></div>' +
    '<div><label>Discipulador</label><input id="f-disc" value="' + g('disc') + '"' + dis + '></div></div>' +
    (ehGestor() ? '<label>GC</label><select id="f-gc">' + opts(GCS().map(function (x) { return [x.id, x.nome]; }), p ? p.gcId : gcA()) + '</select>' : '') +
    camposConsent('f', p, dis) +
    '<label>Observações</label><textarea id="f-obs" rows="2"' + dis + '>' + g('obs') + '</textarea><div style="height:16px"></div>' +
    (ro ? '' : '<button class="btn pr" data-a="salvarPessoa">Salvar</button><div class="gap"></div>') +
    (p && !ro ? '<button class="btn dg" data-a="excluirPessoa">Excluir pessoa</button><div class="gap"></div>' : '') +
    '<button class="btn gh" data-a="fechar">' + (ro ? 'Fechar' : 'Cancelar') + '</button>');
}
function salvarPessoa(forcar) {
  var v = function (id) { var el = $(id); return el ? el.value.trim() : ''; };
  if (!v('f-nome')) return toast('Informe o nome.');
  var ant = editP ? db.pessoas.filter(function (x) { return x.id === editP; })[0] : null;
  var errC = validarConsent('f', !ant); if (errC) return toast(errC, 4500);
  var o = {};
  if (ant) for (var kk in ant) o[kk] = ant[kk];      // preserva campos que o formulário não mostra (Lar de Vida, origem...)
  var novoO = { id: editP || ('p' + Date.now() + Math.floor(Math.random() * 1000)), nome: v('f-nome'), tipo: v('f-tipo'), status: v('f-status'),
    fone: v('f-fone'), nasc: v('f-nasc'), bairro: v('f-bairro'), cidade: v('f-cidade'), cep: mascaraCep(v('f-cep')),
      endereco: v('f-endereco'), numero: v('f-numero'), complemento: v('f-complemento'), sexo: v('f-sexo'), prim: v('f-prim'), jornada: v('f-jornada'), canal: v('f-canal'), canalOutro: v('f-canal') === 'Outros' ? v('f-canaloutro') : '',
    conv: v('f-conv'), disc: v('f-disc'), obs: v('f-obs'), apelido: v('f-apelido'), gcId: $('f-gc') ? v('f-gc') : (ant ? ant.gcId : gcA()),
    updatedAt: ant ? ant.updatedAt : agora(), deleted: false, _pend: true,
    frequentaIgreja: v('f-freqig'), igrejaQual: v('f-freqig') === 'Sim' ? v('f-igreja') : '', aceitaVisita: v('f-aceita') };
  for (var kn in novoO) o[kn] = novoO[kn];
  aplicarConsent(o, v('f-consent'), v('f-resp'));
  if (!ant) { o.criadoPor = eu().id; o.origem = o.tipo === 'Visitante' ? 'visita GC' : ''; }
  if (!o.origem && o.tipo === 'Visitante') o.origem = 'visita GC';
  if (!ant && o.tipo === 'Visitante' && o.gcId && !pode('gcEvento') && !diaEncontroHoje(o.gcId))
    return toast('Visitante novo do GC só pode ser cadastrado no dia do encontro. Fale com o líder.', 4500);
  if (!ant && forcar !== true) { var oc = o; return checarAntesGC(o, function () { gravarPessoaGC(oc, null); }); }
  if (forcar === true && gcPendente) { o = gcPendente.o; gcPendente = null; }
  gravarPessoaGC(o, ant);
}
function gravarPessoaGC(o, ant) {
  lvAjustarPendencia(o);
  if (sbDisponivel() && v39ChurchId()) {
    carregando(true, ant ? 'Salvando pessoa...' : 'Cadastrando pessoa...');
    return v39SalvarPessoa(o, ant).then(function (salva) {
      if (!salva.id) throw new Error('O Supabase não retornou o identificador da pessoa.');
      aplicarFotoNova(salva.id);
      db.pessoas = db.pessoas.filter(function (x) { return x.id !== o.id && x.id !== salva.id; }).concat([salva]);
      if (!ant && ctxPessoa.addChamada) { incluirNaChamada(salva.id, true); toast(nomeChamado(salva) + ' cadastrado(a) e marcado(a) presente na chamada ✓'); }
      ctxPessoa = {}; salvarDB(); fechar(); render();
      if (ant && ant.gcId !== salva.gcId) toast(pri(salva.nome) + ' transferido(a) para ' + gcNome(salva.gcId));
    }).catch(function (e) { toast((e && e.message) || 'Não foi possível salvar a pessoa.', 5000); }).then(function(){ carregando(false); });
  }
  aplicarFotoNova(o.id); db.pessoas = db.pessoas.filter(function (x) { return x.id !== o.id; }).concat([o]);
  if (!ant && ctxPessoa.addChamada) { incluirNaChamada(o.id, true); toast(nomeChamado(o) + ' cadastrado(a) e marcado(a) presente na chamada ✓'); }
  ctxPessoa = {}; salvarDB(); fechar(); render(); sincAuto();
  if (ant && ant.gcId !== o.gcId) toast(pri(o.nome) + ' transferido(a) para ' + gcNome(o.gcId));
}
function excluirPessoa() {
  if (!confirm('Excluir esta pessoa?')) return;
  db.pessoas = db.pessoas.map(function (p) { if (p.id === editP) { p.deleted = true; p.updatedAt = agora(); p._pend = true; } return p; });
  salvarDB(); fechar(); render(); sincAuto();
}

/** Quem aparece na chamada de uma data:
 *  ativos + visitantes cuja 1ª visita é nesta data + incluídos manualmente + quem já tem marcação,
 *  menos quem foi removido desta chamada. */
function listaChamada(id, d, e) {
  var l = lista(e), ids = {}, out = [];
  PES(id).forEach(function (p) {
    var entra = p.status === 'Ativo' || (p.status === 'Em visita' && p.prim === d) ||
      l.add.indexOf(p.id) >= 0 || (e && e.presencas[p.id]);
    if (entra && l.rem.indexOf(p.id) < 0 && !ids[p.id]) { ids[p.id] = 1; out.push(p); }
  });
  return out.sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
}
function promoverVisitantes(gcId) {
  var promovidos = [];
  PES(gcId).forEach(function (p) {
    if (p.status !== 'Em visita' || visitasDe(p) < VISITAS_PARA_ATIVO) return;
    p.status = 'Ativo';
    if (!p.jornada || p.jornada === ETAPAS[0]) p.jornada = ETAPAS[1];
    p.updatedAt = agora(); p._pend = true;
    promovidos.push(nomeChamado(p));
  });
  if (promovidos.length) toast(promovidos.join(', ') + ' completou ' + VISITAS_PARA_ATIVO + ' visitas e agora está Ativo ✓', 4500);
  return promovidos;
}
function dataChamada() {
  if (cfg.dataChamada && cfg.dataChamadaGC === gcA()) return cfg.dataChamada;
  var hj = hoje(), l = encOrd(gcA());
  if (achaEnc(gcA(), hj)) return hj;
  var prox = l.filter(function (e) { return e.data > hj; })[0], ult = l.filter(function (e) { return e.data < hj; }).slice(-1)[0];
  return prox ? prox.data : ult ? ult.data : hj;
}
function rChamada() {
  var id = gcA(), d = dataChamada(), e = achaEnc(id, d);
  var topo = blocoMinhasEscalas() + listaEncontros(id, d);
  if (!e) {
    return topo + '<div class="card"><h3>' + (d === hoje() ? 'Nenhum encontro criado para hoje' : 'Nenhum encontro em ' + brCompleto(d)) + '</h3>' +
      '<div style="font-size:13px;color:#666;line-height:1.55">A chamada fica vinculada ao encontro criado pelo líder do GC e abre só no dia e no horário do encontro.</div>' +
      (pode('gcEvento') ? '<div class="gap"></div><button class="btn pr" data-a="encEditar" data-v="' + esc(d) + '">Criar encontro em ' + br(d) + '</button>' : '') +
      '<input type="hidden" id="ch-data" value="' + d + '"></div>';
  }
  topo += cartaoEncontro(e);
  if (!podeChamada(e)) {
    return topo + '<div class="card" style="border-left:5px solid var(--vermelho)"><h3>Chamada fechada</h3><div style="font-size:13px;color:#666;line-height:1.55">' +
      (e.data > hoje() ? 'Este encontro ainda não aconteceu. A chamada abre ' + textoJanelaGC(e) + '.'
        : e.data === hoje() ? 'A chamada abre ' + textoJanelaGC(e) + '.' : 'O horário da chamada deste encontro já terminou. Só o líder pode lançar presenças de encontros passados.') +
      '</div><input type="hidden" id="ch-data" value="' + d + '"></div>';
  }
  return topo + corpoChamada(id, d, e);
}
var filtroCh = 'todos';
function atualizarProgCh() {
  var id = gcA(), d = ($('ch-data') && $('ch-data').value) || dataChamada(), e = achaEnc(id, d), l = listaChamada(id, d, e);
  var marc = l.filter(function (p) { return e && e.presencas[p.id]; }).length, pres = l.filter(function (p) { return e && e.presencas[p.id] === 'P'; }).length;
  if ($('ch-marc')) $('ch-marc').textContent = marc + ' de ' + l.length + ' marcados';
  if ($('ch-pres')) $('ch-pres').textContent = pres + ' presente(s)';
  if ($('ch-bar')) $('ch-bar').style.width = (l.length ? Math.round(marc / l.length * 100) : 0) + '%';
}
function chTodosP() {
  var e = encontroAtual(true); if (!e) return;
  var l = listaChamada(gcA(), e.data, e), n = 0;
  l.forEach(function (p) { if (!e.presencas[p.id]) { e.presencas[p.id] = 'P'; n++; } });
  e.updatedAt = agora(); e._pend = true; salvarDB(); promoverVisitantes(gcA()); render();
  toast(n + ' pessoa(s) marcada(s) como presente — confira e salve a chamada.', 3500);
}
function corpoChamada(id, d, e) {
  var dr = chDraft && chDraft.gc === id && chDraft.data === d ? chDraft : null;
  var tema = dr ? dr.tema : (e ? e.tema : ''), preg = dr ? dr.preg : (e ? e.anfitriao : '');
  var diz = dr ? dr.diz : campoMoeda(e && e.dizimo), ofe = dr ? dr.ofe : campoMoeda(e && e.oferta);
  var rec = dr ? dr.rec : (e ? e.recados || '' : '');
  var roE = pode('gcEvento') ? '' : ' disabled';
  var l = listaChamada(id, d, e);
  var tot = l.length, marc = l.filter(function (p) { return e && e.presencas[p.id]; }).length, pres = l.filter(function (p) { return e && e.presencas[p.id] === 'P'; }).length;
  var visit = l.filter(function (p) { return p.status === 'Em visita' || p.tipo === 'Visitante'; }).length;
  var lf = filtroCh === 'membros' ? l.filter(function (p) { return !(p.status === 'Em visita' || p.tipo === 'Visitante'); })
    : filtroCh === 'visitantes' ? l.filter(function (p) { return p.status === 'Em visita' || p.tipo === 'Visitante'; })
    : filtroCh === 'sem' ? l.filter(function (p) { return !(e && e.presencas[p.id]); }) : l;
  var prog = '<div class="card ch-prog"><div class="ch-l"><span id="ch-marc">' + marc + ' de ' + tot + ' marcados</span><span id="ch-pres" style="color:var(--verde)">' + pres + ' presente(s)</span></div>' +
    '<div class="prog"><i id="ch-bar" style="width:' + (tot ? Math.round(marc / tot * 100) : 0) + '%"></i></div>' +
    (pode('gc') && tot && marc < tot ? '<button class="btn gh sm" data-a="chTodosP" style="margin-top:10px;width:100%">Marcar todos sem registro como presentes</button>' : '') + '</div>' +
    '<div class="chips">' + [['todos', 'Todos', tot], ['membros', 'Membros', tot - visit], ['visitantes', 'Visitantes', visit], ['sem', 'Sem marcar', tot - marc]].map(function (x) {
      return '<button data-a="filtroCh" data-v="' + x[0] + '" class="' + (filtroCh === x[0] ? 'on' : '') + '">' + x[1] + ' <span>' + x[2] + '</span></button>'; }).join('') + '</div>';
  var dadosEnc = '<div class="sec">Dados do encontro · ' + br(d) + '</div><div class="card"><input type="hidden" id="ch-data" value="' + d + '">' +
    '<label>Tema / estudo</label><input id="ch-tema" value="' + esc(tema) + '" placeholder="Ex.: Mateus 5"' + roE + '>' +
    '<label>Pregador</label><input id="ch-preg" value="' + esc(preg) + '" placeholder="Quem ministrou a palavra"' + roE + '>' +
    (pode('gcEvento')
      ? '<div class="g2"><div><label>Dízimos (R$)</label><input id="ch-diz" inputmode="decimal" value="' + esc(diz) + '" placeholder="0,00"></div>' +
        '<div><label>Ofertas (R$)</label><input id="ch-ofe" inputmode="decimal" value="' + esc(ofe) + '" placeholder="0,00"></div></div>'
      : '<input type="hidden" id="ch-diz" value="' + esc(diz) + '"><input type="hidden" id="ch-ofe" value="' + esc(ofe) + '">' +
        '<div style="font-size:11px;color:#999;margin-top:6px">Tema, pregador, recados e valores do encontro são preenchidos pelo líder.</div>') +
    (pode('gcEvento')
      ? '<label>Recados</label><textarea id="ch-rec" rows="3" placeholder="Avisos para o GC: próximos encontros, eventos, pedidos de oração...">' + esc(rec) + '</textarea>'
      : (rec ? '<div style="background:var(--cc);border-radius:10px;padding:9px 10px;font-size:12.5px;margin-top:10px;white-space:pre-line"><b>Recados:</b> ' + esc(rec) + '</div>' : '')) +
    '</div>';
  var h = '<div class="sec">Presença</div>' + prog + '<div class="card ch-lista">' + (lf.length ? '' : '') ;
  var corpoLista = lf.length ? lf.map(function (p) {
    var m = (e && e.presencas[p.id]) || '';
    var etiqueta = p.status === 'Em visita' ? '<span class="pill p-dour">' + (p.prim === d ? '1ª visita' : 'visita ' + Math.min(visitasDe(p) + (m === 'P' ? 0 : 1), VISITAS_PARA_ATIVO) + '/' + VISITAS_PARA_ATIVO) + '</span>'
      : (p.tipo === 'Visitante' ? '<span class="pill p-dour">visitante</span>' : '');
    return '<div class="chamada">' + avatarP(p) + '<div class="nm2"><b>' + esc(p.apelido ? p.apelido + ' · ' + p.nome : p.nome) + '</b>' + etiqueta + '</div>' +
      '<div class="tg">' + ['P', 'F', 'J'].map(function (x) { return '<button class="' + x.toLowerCase() + (m === x ? ' on' : '') + '" data-a="marcar" data-v="' + esc(p.id) + '" data-m="' + x + '">' + x + '</button>'; }).join('') +
      '<button class="rm" data-a="remChamada" data-v="' + esc(p.id) + '" title="Tirar da chamada deste dia">×</button></div></div>';
  }).join('') : '<div class="empty">' + (l.length ? 'Ninguém neste filtro.' : 'Ninguém na lista deste encontro.') + '</div>';
  h += corpoLista + '<button class="btn gh" data-a="addChamada" style="margin-top:10px">+ Adicionar visitante ou pessoa</button></div>';
  h += '<button class="btn" data-a="salvarChamada">Salvar chamada</button>' + dadosEnc + '<div class="gap"></div>';
  h += '<div class="meta">P = presente · F = falta · J = justificada · × tira da lista do dia<br>Visitante entra sozinho só na 1ª visita. Nas próximas, use “Adicionar pessoa”.<br>Com ' + VISITAS_PARA_ATIVO + ' presenças o visitante passa para Ativo.</div>';
  return h;
}
function encontroAtual(criar) {
  var id = gcA(), d = $('ch-data') ? $('ch-data').value || hoje() : dataChamada(), e = achaEnc(id, d);
  if (!e && criar && pode('gcEvento')) { e = { data: d, gcId: id, tema: '', anfitriao: '', presencas: {}, lista: { add: [], rem: [] }, deleted: false }; db.encontros.push(e); }
  return e;
}
function marcar(pid, m, btn) {
  var e = encontroAtual(true);
  if (e.presencas[pid] === m) delete e.presencas[pid]; else e.presencas[pid] = m;
  e.updatedAt = agora(); e._pend = true;
  var bs = btn.parentElement.querySelectorAll('button');
  for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', bs[i].getAttribute('data-m') === e.presencas[pid]);
  salvarDB(); atualizarProgCh();
  if (m === 'P' && promoverVisitantes(gcA()).length) { salvarDB(); render(); }
}
function remChamada(pid) {
  var e = encontroAtual(true), l = lista(e);
  l.add = l.add.filter(function (x) { return x !== pid; });
  if (l.rem.indexOf(pid) < 0) l.rem.push(pid);
  delete e.presencas[pid];
  e.lista = l; e.updatedAt = agora(); e._pend = true;
  var p = db.pessoas.filter(function (x) { return x.id === pid; })[0];
  salvarDB(); render(); toast((p ? nomeChamado(p) : 'Pessoa') + ' saiu da chamada deste dia');
}
function incluirNaChamada(pid, marcarP) {
  var e = encontroAtual(true), l = lista(e);
  l.rem = l.rem.filter(function (x) { return x !== pid; });
  if (l.add.indexOf(pid) < 0) l.add.push(pid);
  if (marcarP) e.presencas[pid] = 'P';
  e.lista = l; e.updatedAt = agora(); e._pend = true;
  salvarDB();
}
var buscaAdd = '';
function abrirAddChamada() {
  buscaAdd = '';
  abrirModal('<h2>Adicionar à chamada</h2><div style="font-size:12.5px;color:#777;margin:2px 0 10px">Encontro de ' + br(($('ch-data') && $('ch-data').value) || dataChamada()) + '</div>' +
    '<button class="btn" data-a="novoVisitanteChamada">+ Cadastrar visitante novo (1ª visita)</button>' +
    '<input id="busca-add" placeholder="Buscar pessoa já cadastrada..." style="margin:12px 0 6px">' +
    '<div id="lista-add"></div><div class="gap"></div><button class="btn gh" data-a="fechar">Fechar</button>');
  pintarAdd();
}
function pintarAdd() {
  var el = $('lista-add'); if (!el) return;
  var id = gcA(), d = ($('ch-data') && $('ch-data').value) || dataChamada(), e = achaEnc(id, d);
  var dentro = {}; listaChamada(id, d, e).forEach(function (p) { dentro[p.id] = 1; });
  var cand = PES(id).filter(function (p) { return !dentro[p.id] && (p.nome + ' ' + (p.apelido || '')).toLowerCase().indexOf(buscaAdd) >= 0; })
    .sort(function (a, b) { var va = a.status === 'Em visita' ? 0 : 1, vb = b.status === 'Em visita' ? 0 : 1; return va - vb || a.nome.localeCompare(b.nome, 'pt-BR'); });
  el.innerHTML = cand.length ? cand.map(function (p) {
    var sub = p.status === 'Em visita' ? 'Visitante · ' + visitasDe(p) + ' de ' + VISITAS_PARA_ATIVO + ' visitas' : esc(p.tipo) + ' · ' + esc(p.status);
    return '<div class="row cl" data-a="incluirChamada" data-v="' + esc(p.id) + '">' + avatarP(p) + '<div class="info"><div class="nm">' + esc(p.nome) +
      (p.apelido ? ' <span style="color:#a87700;font-weight:600">“' + esc(p.apelido) + '”</span>' : '') + '</div><div class="sb">' + sub + '</div></div><span class="pill p-verde">+ incluir</span></div>';
  }).join('') : '<div class="empty">Todos já estão na chamada deste dia.</div>';
}
function salvarChamada() {
  var e = encontroAtual(true);
  e.tema = $('ch-tema').value.trim(); e.anfitriao = $('ch-preg').value.trim();
  e.dizimo = valor($('ch-diz').value) ? String(valor($('ch-diz').value)) : '';
  e.oferta = valor($('ch-ofe').value) ? String(valor($('ch-ofe').value)) : '';
  if ($('ch-rec')) e.recados = $('ch-rec').value.trim();
  e.updatedAt = agora(); e._pend = true;
  chDraft = null;
  promoverVisitantes(gcA());
  salvarDB();
  if (sbDisponivel()) { carregando(true,'Salvando chamada...'); v39SalvarEncontro(e).then(function(out){db.encontros=db.encontros.filter(function(x){return x!==e && x.id!==out.id;}).concat([out]);salvarDB();toast('Chamada de '+br(out.data)+' salva · '+presentes(out)+' presente(s)');render();}).catch(function(err){toast(err.message,5000);}).then(function(){carregando(false);}); return; }
  toast('Chamada de ' + br(e.data) + ' salva · ' + presentes(e) + ' presente(s)'); render(); sincronizar(false);
}

function msgDe(p, tipo) {
  var n = nomeChamado(p), gc = gcNome(p.gcId);
  if (tipo === 'contatar') return 'Oi, ' + n + '! Tudo bem? Sentimos sua falta nos últimos encontros do ' + gc + '. Passando para saber como você está e dizer que estamos orando por você. Nos vemos no próximo encontro? Se precisar de algo, me chama!';
  if (tipo === 'aniversario') return 'Feliz aniversário, ' + n + '! Que Deus te abençoe muito neste novo ano de vida. O ' + gc + ' te ama!';
  return 'Oi, ' + n + '! Você fez falta no último encontro do ' + gc + '. Tudo certo por aí? Te espero no próximo!';
}
function linhaContato(p, tipo, encs) {
  var f = fone(p.fone), l = f ? 'https://wa.me/' + (f.length <= 11 ? '55' : '') + f + '?text=' + encodeURIComponent(msgDe(p, tipo)) : '';
  var s = statusDe(p, encs), st = statsDe(p, encs);
  var sub = tipo === 'aniversario' ? 'Faz ' + (new Date().getFullYear() - parseInt(p.nasc.slice(0, 4), 10)) + ' anos dia ' + p.nasc.slice(8, 10)
    : s.faltas + ' falta' + (s.faltas > 1 ? 's seguidas' : '') + ' · ' + (st.mar ? pct(st.pct) + ' presença' : '—');
  return '<div class="row">' + avatarP(p) + '<div class="info"><div class="nm">' + esc(p.nome) + (p.apelido ? ' <span style="color:#a87700;font-weight:600">“' + esc(p.apelido) + '”</span>' : '') + '</div><div class="sb">' + sub + '</div></div>' +
    (l ? '<a class="wa" href="' + l + '" target="_blank" rel="noopener">Enviar</a>' : '<span class="pill p-cinza">sem nº</span>') + '</div>';
}
function rAlertas() {
  var id = gcA(), encs = encOrd(id), pes = PES(id), topo = blocoNotif() + blocoMinhasEscalas() + blocoAlertas(null, false) + blocoMural() + '<div class="sec">Cuidado do GC</div>' + blocoLVResumo([id], true);
  var c = pes.filter(function (p) { return statusDe(p, encs).s === 'contatar'; }).sort(function (a, b) { return statusDe(b, encs).faltas - statusDe(a, encs).faltas; });
  var a = pes.filter(function (p) { return statusDe(p, encs).s === 'atencao'; });
  var mes = new Date().getMonth() + 1;
  var an = pes.filter(function (p) { return p.status === 'Ativo' && p.nasc && parseInt(p.nasc.slice(5, 7), 10) === mes; })
    .sort(function (x, y) { return parseInt(x.nasc.slice(8, 10), 10) - parseInt(y.nasc.slice(8, 10), 10); });
  return topo + '<div class="card" style="border-left:5px solid var(--vermelho)"><h3>Quem precisa de contato</h3><div style="font-size:13px;color:#666;line-height:1.5">Duas ou mais faltas seguidas. Toque em <b>Enviar</b> para abrir o WhatsApp com a mensagem pronta.</div></div>' +
    '<div class="card">' + (c.length ? c.map(function (p) { return linhaContato(p, 'contatar', encs); }).join('') : '<div class="empty">Ninguém com 2 faltas seguidas. 🙌</div>') + '</div>' +
    '<div class="sec">Atenção — 1 falta</div><div class="card">' + (a.length ? a.map(function (p) { return linhaContato(p, 'atencao', encs); }).join('') : '<div class="empty">Ninguém nesta lista.</div>') + '</div>' +
    '<div class="sec">Aniversariantes do mês</div><div class="card">' + (an.length ? an.map(function (p) { return linhaContato(p, 'aniversario', encs); }).join('') : '<div class="empty">Nenhum aniversariante neste mês.</div>') + '</div>';
}
function rMaisGC() {
  var id = gcA(), g = gcPor(id) || {}, h = '';
  h += '<div class="gccard"><div class="ft" style="background-image:url(\'' + fotoGC(id) + '\')"></div><div class="bd"><h4>' + esc(g.nome) + '</h4>' +
    '<div class="ln"><b>Líder:</b> ' + esc(g.liderNome || '—') + (g.coLider ? ' · Co-líder: ' + esc(g.coLider) : '') + '</div>' +
    (g.anfitriao ? '<div class="ln"><b>Anfitrião:</b> ' + esc(g.anfitriao) + '</div>' : '') +
    '<div class="ln"><b>Encontros:</b> ' + (g.diaSemana !== '' && g.diaSemana != null ? DIAS[+g.diaSemana] + (g.horario ? ', ' + esc(g.horario) : '') + ' · ' + esc(g.frequencia || '') : 'dia não definido') + '</div>' +
    '<div class="ln"><b>Endereço:</b> ' + esc([g.endereco, g.bairro, g.cidade].filter(Boolean).join(' · ') || '—') + (g.referencia ? ' (' + esc(g.referencia) + ')' : '') + '</div>' +
    (g.discipulosNomes ? '<div class="ln"><b>Discípulos:</b> ' + esc(g.discipulosNomes) + '</div>' : '') +
    (g.supervisorNome ? '<div class="ln"><b>Supervisor:</b> ' + esc(g.supervisorNome) + '</div>' : '') +
    (podeEditarGC(g) ? '<div class="gap"></div><button class="btn gh sm" data-a="editarGC" data-v="' + esc(id) + '">Editar dados do GC</button>' : '') + '</div></div>';
  if (!ehGestor() && GCS().length > 1) {
    h += '<div class="sec">Meus GCs</div><div class="card">' + GCS().map(function (x) {
      return '<div class="row cl" data-a="trocarGC" data-v="' + esc(x.id) + '"><img class="av" src="' + iconeGC(x.id) + '"><div class="info"><div class="nm">' + esc(x.nome) + '</div></div>' +
        (x.id === id ? '<span class="pill p-dour">atual</span>' : '<span class="pill p-cinza">abrir</span>') + '</div>'; }).join('') + '</div>';
  }
  var es = encOrd(id).slice().reverse().slice(0, 15);
  h += '<div class="sec">Histórico de encontros</div><div class="card">' + (es.length ? es.map(function (e) {
    return '<div class="row"><div class="info"><div class="nm">' + br(e.data) + ' — ' + (esc(e.tema) || 'sem tema') + '</div><div class="sb">' + presentes(e) + ' presente(s)' + (e.anfitriao ? ' · pregação de ' + esc(e.anfitriao) : '') +
      ((valor(e.dizimo) + valor(e.oferta)) ? ' · ' + moeda(valor(e.dizimo) + valor(e.oferta)) : '') + '</div></div></div>';
  }).join('') : '<div class="empty">Nenhum encontro registrado.</div>') + '</div>';
  if (editaPessoas()) h += '<div class="sec">Dados</div><div class="card"><button class="btn gh" data-a="csv">Exportar pessoas (.csv)</button></div>';
  h += '<div class="sec">Minha conta</div>' + blocoConta();
  return h;
}
function exportarCSV() {
  var id = gcA(), encs = encOrd(id);
  (sbDisponivel()?v39RegistrarEvento('exportou CSV',gcNome(id)+' · '+PES(id).length+' pessoa(s)','growth_group',id):chamar('registrarEvento',{tipo:'exportou CSV',detalhe:gcNome(id)+' · '+PES(id).length+' pessoa(s)'})).catch(function(){});
  var hd = ['Nome', 'Apelido', 'Tipo', 'Status', 'WhatsApp', 'Nascimento', 'Sexo', 'CEP', 'Endereco', 'Numero', 'Complemento', 'Bairro', 'Cidade', '1a participacao', 'Jornada', 'Como chegou', 'Convidado por', 'Discipulador', 'Presencas', 'Marcacoes', '% presenca', 'Faltas seguidas'];
  var rows = PES(id).map(function (p) { var s = statsDe(p, encs), st = statusDe(p, encs);
    return [p.nome, p.apelido || '', p.tipo, p.status, p.fone, p.nasc, p.sexo || '', p.cep || '', p.endereco || '', p.numero || '', p.complemento || '', separarBairroCidade(p.bairro, p.cidade).bairro, separarBairroCidade(p.bairro, p.cidade).cidade, p.prim, p.jornada, p.canal, p.conv, p.disc, s.pres, s.mar, s.mar ? pct(s.pct) : '', st.faltas]; });
  var csv = [hd].concat(rows).map(function (r) { return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(';'); }).join('\n');
  var b = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = (gcNome(id) + '-' + hoje()).replace(/\s+/g, '_') + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

/* ═══════════════════ LAR DE VIDA ═══════════════════
 Visitantes que aceitam visita recebem um discípulo do GC, que visita a casa
 uma vez por semana durante 7 semanas (até 5 casas por discípulo).
 Fluxo: voluntário/GC cadastra → supervisor direciona ao GC (visitante da igreja)
        → líder libera para um discípulo → discípulo registra as 7 visitas → encerra. */
var LV_SEMANAS = 7, LV_CASAS = 5, lvFiltroSel = '';
function pessoaPor(id) { for (var i = 0; i < db.pessoas.length; i++) if (db.pessoas[i].id === id) return db.pessoas[i]; return null; }
function lvVis(p) { return Array.isArray(p.lvVisitas) ? p.lvVisitas : []; }
function lvSemanaAtual(p) {
if (!p.lvInicio) return 1;
var d = diasEntre(parseData(p.lvInicio), parseData(hoje()));
return Math.max(1, Math.min(LV_SEMANAS, Math.floor(d / 7) + 1));
}
var LV_PRAZO = 7;
/** Data limite da próxima visita: 7 dias após a última visita registrada (ou após a liberação). */
function lvPrazo(p) {
if (p.lvStatus !== 'acompanhando' || !p.lvInicio) return '';
var v = lvVis(p); if (v.length >= LV_SEMANAS) return '';
var d = parseData(String(v.length ? v[v.length - 1].data || p.lvInicio : p.lvInicio).slice(0, 10)); if (!d) return '';
d.setDate(d.getDate() + LV_PRAZO); return isoData(d);
}
/** Atrasada = passou o prazo de 7 dias sem registrar a próxima visita. */
function lvAtrasada(p) { var pz = lvPrazo(p); return !!pz && pz < hoje(); }
function lvPrazoPill(p) {
var pz = lvPrazo(p); if (!pz) return '';
var dias = diasEntre(parseData(hoje()), parseData(pz));
if (dias < 0) return '<span class="pill p-vermelho">visita atrasada ' + (-dias) + ' dia(s)</span>';
if (dias <= 2) return '<span class="pill p-amarelo">' + (dias === 0 ? 'visitar hoje' : 'visitar até ' + br(pz)) + '</span>';
return '<span class="pill p-cinza">próxima visita até ' + br(pz) + '</span>';
}
function lvCasasDe(uid) { return PES().filter(function (p) { return p.lvStatus === 'acompanhando' && p.lvDiscipuloId === uid; }); }
function discipulosDoGC(g) {
var ids = String((g && g.discipulos) || '').split(',').filter(Boolean);
var nomes = String((g && g.discipulosNomes) || '').split(', ');
return ids.map(function (id, i) { return { id: id, nome: nomes[i] || 'Discípulo' }; });
}
function lvAguardando(gcId) { return PES(gcId).filter(function (p) { return p.lvStatus === 'pendente'; }); }
function lvFila() { return PES().filter(function (p) { return !p.gcId && p.status !== 'Inativo' && p.origem !== 'usuário do app' && p.origem !== 'instituto'; }); }
function lvBadgeGC() {
if (cfg.modo !== 'gc') return 0;
var g = gcPor(gcA()); if (!g) return 0;
if (pode('lvLiberar')) return lvAguardando(g.id).length + PES(g.id).filter(lvAtrasada).length;
return PES(g.id).filter(function (p) { return p.lvDiscipuloId === eu().id && lvAtrasada(p); }).length;
}
/** Quem aceita visita entra na fila do Lar de Vida; quem deixa de aceitar sai (se ainda não começou). */
function lvAjustarPendencia(o) {
if (o.lvStatus === 'acompanhando' || o.lvStatus === 'encerrado') return;
o.lvStatus = o.aceitaVisita === 'Sim' && o.status !== 'Inativo' ? 'pendente' : '';
}
/* ── alertas: visitante do GC que foi à igreja pela 1ª vez ── */
function alertasNaoLidos(gcIds) {
  return (db.alertas || []).filter(function (a) { return !a.lido && (!gcIds || gcIds.indexOf(a.gcId) >= 0); })
    .sort(function (a, b) { return String(b.criadoEm).localeCompare(String(a.criadoEm)); });
}
function blocoAlertas(gcIds, mostrarGC) {
  var l = alertasNaoLidos(gcIds);
  if (!l.length) return '';
  return '<div class="card" style="border-left:5px solid var(--azul);background:#f2f6ff">' +
    '<h3 style="margin-bottom:6px">🔔 Avisos (' + l.length + ')</h3>' + l.map(function (a) {
      return '<div class="row" style="align-items:flex-start"><div class="info"><div class="nm" style="white-space:normal;font-weight:600;font-size:13.5px">' + esc(a.mensagem) + '</div>' +
        '<div class="sb">' + (mostrarGC ? esc(gcNome(a.gcId)) + ' · ' : '') + 'registrado por ' + esc(a.criadoPor || '—') + ' · ' + dataHoraLocal(a.criadoEm) + '</div></div>' +
        '<button class="btn gh sm" data-a="lerAlerta" data-v="' + esc(a.id) + '">Ciente</button></div>';
    }).join('') + '<div style="font-size:11px;color:#777;margin-top:6px">Aproveite para dar as boas-vindas e reforçar o convite para o próximo culto.</div></div>';
}
function lerAlerta(id) {
  (db.alertas || []).forEach(function (a) { if (a.id === id) a.lido = true; });
  salvarDB(); render();
  if (sbDisponivel()) v39MarcarNotificacaoLida(id).then(function(r){if(r.error)throw r.error;}).catch(function(e){console.warn('v39 notificação',e);});
  else chamar('lerAlerta', { id: id }).catch(function () {});
}
function pillIgreja(p) { return p.visitaIgrejaEm ? ' <span class="pill" style="background:#e8efff;color:#2f5fbf">visitou a igreja ' + br(p.visitaIgrejaEm) + '</span>' : ''; }
function lvResumoPill(p) {
if (p.lvStatus === 'acompanhando') return ' <span class="pill ' + (lvAtrasada(p) ? 'p-vermelho' : 'p-verde') + '">Lar de Vida ' + lvVis(p).length + '/' + LV_SEMANAS + '</span>';
if (p.lvStatus === 'pendente') return ' <span class="pill p-amarelo">Lar de Vida: aguardando</span>';
if (p.lvStatus === 'encerrado') return ' <span class="pill p-cinza">Lar de Vida: ' + esc(p.lvResultado || 'encerrado') + '</span>';
return '';
}
function camposIgrejaVisita(px, p, dis) {
var fi = p ? (p.frequentaIgreja || 'Não') : 'Não', av = p ? (p.aceitaVisita || 'Não') : 'Não';
return '<div class="g2"><div><label>Frequenta alguma igreja?</label><select id="' + px + '-freqig"' + dis + '>' + opts([['Não', 'Não'], ['Sim', 'Sim']], fi) + '</select></div>' +
  '<div><label>Aceita visita em casa?</label><select id="' + px + '-aceita"' + dis + '>' + opts([['Não', 'Não'], ['Sim', 'Sim']], av) + '</select></div></div>' +
  '<div id="' + px + '-igrejawrap" class="' + (fi === 'Sim' ? '' : 'hide') + '"><label>Qual igreja?</label><input id="' + px + '-igreja" value="' + esc(p ? p.igrejaQual : '') + '"' + dis + '></div>' +
  '<div style="font-size:11px;color:#999;margin-top:4px">Quem aceita visita entra no Lar de Vida: um discípulo do GC visita a casa por ' + LV_SEMANAS + ' semanas.</div>';
}
function lvSituacaoTexto(p) {
if (!p.gcId) return ['p-amarelo', 'aguardando direcionamento'];
if (p.lvStatus === 'pendente') return ['p-amarelo', gcNome(p.gcId) + ' · aguardando líder'];
if (p.lvStatus === 'acompanhando') return [lvAtrasada(p) ? 'p-vermelho' : 'p-verde', 'Lar de Vida ' + lvVis(p).length + '/' + LV_SEMANAS];
if (p.lvStatus === 'encerrado') return ['p-cinza', p.lvResultado || 'encerrado'];
return ['p-cinza', gcNome(p.gcId)];
}

/* ── distância bairro × GC ── */
function geoChave(bairro, cidade) { var e = separarBairroCidade(bairro, cidade); return normalizar(e.bairro) + '|' + chaveCidade(e.cidade || 'Matão/SP'); }
function distKm(a, b) {
var r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function gcsPorDistancia(p) {
var kp = geoChave(p.bairro, p.cidade), gp = geo[kp];
return GCSativos().map(function (g) {
  var kg = geoChave(g.bairro, g.cidade), gg = geo[kg];
  var d = g.bairro && kp === kg ? 0 : (gp && gg ? distKm(gp, gg) : null);
  var ok = gcCompativel(g, p);
  // jovens e adolescentes vão primeiro para o GC de jovens; adultos, para o GC do mesmo sexo
  var prio = !ok ? 0 : (g.tipoGC === 'Jovens e adolescentes' ? 2 : 1);
  return { g: g, d: d, ok: ok, prio: prio };
}).sort(function (a, b) {
  return b.prio - a.prio ||
    (a.d === null ? 1e9 : a.d) - (b.d === null ? 1e9 : b.d) || String(a.g.nome).localeCompare(String(b.g.nome), 'pt-BR');
});
}
function opcoesGCDirecionar(p, sugerido) {
var lista = gcsPorDistancia(p), comp = lista.filter(function (x) { return x.ok; }), out = lista.filter(function (x) { return !x.ok; });
var sel = sugerido && comp.some(function (x) { return x.g.id === sugerido; }) ? sugerido : (comp[0] ? comp[0].g.id : '');
var op = function (x, exc) {
  return '<option value="' + esc(x.g.id) + '"' + (x.g.id === sel ? ' selected' : '') + (exc ? ' data-exc="1"' : '') + '>' + esc(x.g.nome) +
    (x.g.tipoGC ? ' (' + esc(x.g.tipoGC) + (publicoGC(x.g) && x.g.tipoGC === 'Jovens e adolescentes' ? ' · ' + (publicoGC(x.g) === 'Feminino' ? 'mulheres' : 'homens') : '') + (faixaTexto(x.g) ? ', ' + faixaTexto(x.g) : '') + ')' : '') +
    (x.d !== null ? ' · ' + km(x.d) : '') + (x.g.id === sel ? ' — sugerido' : '') + '</option>';
};
var h = comp.length ? '' : '<option value="">' + (ehDecisor() ? '— nenhum GC compatível: escolha uma exceção —' : 'nenhum GC compatível') + '</option>';
if (comp.length) h += '<optgroup label="Compatíveis (' + (ehJovem(p) ? 'jovens' : p.sexo === 'Masculino' ? 'homens' : p.sexo === 'Feminino' ? 'mulheres' : 'sexo não informado') + ')">' + comp.map(function (x) { return op(x, false); }).join('') + '</optgroup>';
if (out.length && ehDecisor()) h += '<optgroup label="Exceção — fora da regra (pastor/master)">' + out.map(function (x) { return op(x, true); }).join('') + '</optgroup>';
return { html: h, comp: comp.length };
}
function lvGeoFila() {
if (cfg.aba !== 'lv') return;
var itens = [];
lvFila().forEach(function (p) {
  var e = separarBairroCidade(p.bairro, p.cidade);
  if (e.bairro) itens.push({ chave: geoChave(p.bairro, p.cidade), bairro: e.bairro, cidade: e.cidade || 'Matão/SP' });
});
GCSativos().forEach(function (g) { if (g.bairro) itens.push({ chave: geoChave(g.bairro, g.cidade), bairro: g.bairro, cidade: g.cidade || 'Matão/SP' }); });
buscarGeo(itens).then(function (mudou) { if (mudou && cfg.aba === 'lv') render(); });
}
function km(d) { return d === null ? '' : d < 1 ? 'menos de 1 km' : num1(d) + ' km'; }

/* ── resumo (painel do GC e da rede) ── */
function lvContagem(gcIds) {
var c = { ac: 0, ag: 0, at: 0, enc: 0, fic: 0 };
gcIds.forEach(function (id) {
  PES(id).forEach(function (p) {
    if (p.lvStatus === 'acompanhando') { c.ac++; if (lvAtrasada(p)) c.at++; }
    if (p.lvStatus === 'pendente') c.ag++;
    if (p.lvStatus === 'encerrado') { c.enc++; if (p.lvResultado === 'Ficou') c.fic++; }
  });
});
return c;
}
function blocoLVResumo(gcIds, doGC) {
var c = lvContagem(gcIds), fila = doGC ? 0 : lvFila().length;
if (!c.ac && !c.ag && !c.enc && !fila) return '';
return '<div class="sec">Lar de Vida</div><div class="card" data-a="aba" data-v="' + (doGC ? 'lar' : 'lv') + '" style="cursor:pointer">' +
  '<div class="mini" style="margin:0 0 8px">' +
  '<div><b>' + c.ac + '</b><span>em visita</span></div>' +
  '<div><b>' + (doGC ? c.ag : c.ag + fila) + '</b><span>aguardando</span></div>' +
  '<div><b style="color:' + (c.at ? 'var(--vermelho)' : '') + '">' + c.at + '</b><span>atrasadas</span></div>' +
  '<div><b>' + c.fic + '/' + c.enc + '</b><span>ficaram</span></div></div>' +
  '<div style="font-size:11.5px;color:#888">Toque para abrir o Lar de Vida</div></div>';
}

/* ── cards de acompanhamento ── */
function lvDots(p) {
var v = lvVis(p), sem = lvSemanaAtual(p), h = '';
for (var i = 0; i < LV_SEMANAS; i++) {
  var x = v[i];
  var cor = x ? (x.realizada === 'Sim' ? (x.estava === 'Sim' ? 'var(--verde)' : 'var(--amarelo)') : 'var(--vermelho)')
              : (i < sem - 1 ? '#f3caca' : '#e5e5e5');
  h += '<span title="Semana ' + (i + 1) + '" style="flex:1;height:9px;border-radius:5px;background:' + cor + '"></span>';
}
return '<div style="display:flex;gap:4px;margin:10px 0 6px">' + h + '</div>';
}
function lvCard(p, podeRegistrar, gere) {
var v = lvVis(p), n = v.length, atr = lvAtrasada(p), ult = n ? v[n - 1] : null;
var end = separarBairroCidade(p.bairro, p.cidade);
var pill = atr ? ['p-vermelho', 'atrasada'] : n >= LV_SEMANAS ? ['p-verde', 'encerrar'] : ['p-dour', 'visita ' + (n + 1) + '/' + LV_SEMANAS];
var f = fone(p.fone);
var wa = f ? 'https://wa.me/' + (f.length <= 11 ? '55' : '') + f + '?text=' + encodeURIComponent('Oi, ' + nomeChamado(p) + '! Aqui é ' + pri(eu().nome) + ', do ' + gcNome(p.gcId) + '. Posso passar aí essa semana para te visitar?') : '';
var h = '<div class="card lvc' + (atr ? ' atr' : '') + '"><div class="row" style="padding:0;border:none">' +
  '' + avatarP(p) + '<div class="info"><div class="nm">' + esc(p.nome) + (p.apelido ? ' <span style="color:#a87700;font-weight:600">“' + esc(p.apelido) + '”</span>' : '') + '</div>' +
  '<div class="sb">Discípulo: <b>' + esc(p.lvDiscipuloNome || '—') + '</b> · início ' + br(p.lvInicio) + ' · ' + n + ' de ' + LV_SEMANAS + ' visitas</div></div>' +
  (lvPrazo(p) ? lvPrazoPill(p) : '<span class="pill ' + pill[0] + '">' + pill[1] + '</span>') + '</div>' + lvDots(p) +
  '<div class="sb" style="font-size:11.5px;color:#777;line-height:1.5">' + esc([enderecoTexto(p), end.cidade].filter(Boolean).join(' · ') || 'endereço não informado') +
  (p.origem ? ' · ' + esc(p.origem) : '') + '</div>' +
  (ult ? '<div style="font-size:12px;color:#555;margin-top:6px;line-height:1.5"><b>Última:</b> ' + br(ult.data) + ' — ' +
    (ult.realizada === 'Sim' ? 'realizada' + (ult.estava === 'Sim' ? ', pessoa em casa' : ', pessoa não estava') : 'não realizada') +
    (ult.obs ? ' · <i>"' + esc(ult.obs) + '"</i>' : '') + '</div>' : '') +
  '<div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:10px">';
if (podeRegistrar && n < LV_SEMANAS) h += '<button class="btn sm" data-a="lvRegistrar" data-v="' + esc(p.id) + '">Registrar visita ' + (n + 1) + '</button>';
if (podeRegistrar && n >= LV_SEMANAS) h += '<button class="btn vd sm" data-a="lvEncerrar" data-v="' + esc(p.id) + '">Encerrar acompanhamento</button>';
if (gere && n < LV_SEMANAS) h += '<button class="btn gh sm" data-a="lvEncerrar" data-v="' + esc(p.id) + '">Encerrar antes</button>';
if (gere) h += '<button class="btn gh sm" data-a="lvTrocar" data-v="' + esc(p.id) + '">Trocar discípulo</button>';
h += '<button class="btn gh sm" data-a="lvHistorico" data-v="' + esc(p.id) + '">Histórico</button>';
if (wa) h += '<a class="wa" href="' + wa + '" target="_blank" rel="noopener">WhatsApp</a>';
return h + '</div></div>';
}
function opcoesDiscipulos(g, sel, ignorarId) {
var ds = discipulosDoGC(g), vs = (db.voluntariosLV || []).filter(function (v) { return !ds.some(function (d) { return d.id === v.id; }); });
var op = function (d) {
  var n = lvCasasDe(d.id).filter(function (p) { return p.id !== ignorarId; }).length, cheio = n >= LV_CASAS;
  return '<option value="' + esc(d.id) + '"' + (cheio ? ' disabled' : '') + (sel === d.id ? ' selected' : '') + '>' + esc(d.nome) + ' (' + n + '/' + LV_CASAS + ' casas)' + (cheio ? ' — lotado' : '') + '</option>';
};
return '<option value="">— escolher quem vai visitar —</option>' + (ds.length ? '<optgroup label="Discípulos do GC">' + ds.map(op).join('') + '</optgroup>' : '') +
  (vs.length ? '<optgroup label="Voluntários do Lar de Vida">' + vs.map(op).join('') + '</optgroup>' : '');
}

/* ── aba Lar de Vida do GC (líder e discípulos) ── */
function rLar() {
var id = gcA(), g = gcPor(id), gere = pode('lvLiberar'), me = eu().id;
var pes = PES(id), c = lvContagem([id]);
var ac = pes.filter(function (p) { return p.lvStatus === 'acompanhando'; })
  .sort(function (a, b) { return (lvAtrasada(b) ? 1 : 0) - (lvAtrasada(a) ? 1 : 0) || lvVis(b).length - lvVis(a).length; });
var ag = lvAguardando(id), enc = pes.filter(function (p) { return p.lvStatus === 'encerrado'; })
  .sort(function (a, b) { return String(b.lvEncerradoEm).localeCompare(String(a.lvEncerradoEm)); });
var minhas = ac.filter(function (p) { return p.lvDiscipuloId === me; });
var h = (gere && !pode('lvVisitas') ? '<div class="aviso">O registro das visitas é feito pelo discípulo responsável por cada casa. Aqui você acompanha o andamento, libera novas casas e troca discípulos.</div>' : '') +
    '<div class="kpis">' + kpi(c.ac, 'Casas em acompanhamento', 'dk') + kpi(c.ag, 'Aguardando liberação') +
  kpi(c.at, 'Visitas atrasadas', c.at ? 'al' : '') + kpi(c.enc ? c.fic + '/' + c.enc : '—', 'Ficaram no GC/igreja') + '</div>';
if (minhas.length || pode('lvVisitas')) {
  h += '<div class="sec">Minhas casas · ' + minhas.length + ' de ' + LV_CASAS + '</div>';
  h += minhas.length ? minhas.map(function (p) { return lvCard(p, pode('lvVisitas'), gere); }).join('')
    : '<div class="card"><div class="empty">Nenhuma casa liberada para você ainda.<br>O líder do GC libera as visitas por aqui.</div></div>';
}
if (gere) {
  var ds = discipulosDoGC(g);
  h += '<div class="sec">Aguardando liberação (' + ag.length + ')</div>';
  if (!ds.length && ag.length) h += '<div class="aviso">Este GC ainda não tem discípulos no cadastro. Peça ao supervisor para incluí-los em <b>Editar GC</b>.</div>';
  h += ag.length ? ag.map(function (p) {
    var end = separarBairroCidade(p.bairro, p.cidade);
    return '<div class="card"><div class="row" style="padding:0;border:none">' + avatarP(p) + '<div class="info"><div class="nm">' + esc(p.nome) +
      (p.apelido ? ' <span style="color:#a87700;font-weight:600">“' + esc(p.apelido) + '”</span>' : '') + '</div>' +
      '<div class="sb">' + esc([enderecoTexto(p), end.cidade].filter(Boolean).join(' · ') || 'endereço não informado') + (p.fone ? ' · ' + esc(p.fone) : '') + '</div></div>' +
      (p.origem ? '<span class="pill p-dour">' + esc(p.origem) + '</span>' : '') + '</div>' +
      (p.frequentaIgreja === 'Sim' ? '<div style="font-size:11.5px;color:#888;margin-top:6px">Frequenta: ' + esc(p.igrejaQual || 'outra igreja') + '</div>' : '') +
      (p.direcionadoPor ? '<div style="font-size:11.5px;color:#888;margin-top:4px">Direcionado por ' + esc(p.direcionadoPor) + ' em ' + br(p.direcionadoEm) + '</div>' : '') +
      '<div class="g2"><div><label>Discípulo</label><select id="lvd-' + esc(p.id) + '">' + opcoesDiscipulos(g, '', '') + '</select></div>' +
      '<div><label>Início das visitas</label><input type="date" id="lvi-' + esc(p.id) + '" value="' + hoje() + '"></div></div><div class="gap"></div>' +
      '<button class="btn pr sm" data-a="lvLiberar" data-v="' + esc(p.id) + '">Liberar visitas</button></div>';
  }).join('') : '<div class="card"><div class="empty">Ninguém aguardando. Quem marcar “aceita visita” no cadastro aparece aqui.</div></div>';
} else if (ag.length) {
  h += '<div class="sec">Aguardando o líder liberar (' + ag.length + ')</div><div class="card">' + ag.map(function (p) {
    return '<div class="row">' + avatarP(p) + '<div class="info"><div class="nm">' + esc(p.nome) + '</div><div class="sb">' + esc(separarBairroCidade(p.bairro, p.cidade).bairro) + '</div></div></div>';
  }).join('') + '</div>';
}
var outros = gere ? ac : ac.filter(function (p) { return p.lvDiscipuloId !== me; });
if (outros.length) h += '<div class="sec">' + (gere ? 'Em acompanhamento' : 'Outras casas do GC') + ' (' + outros.length + ')</div>' +
  outros.map(function (p) { return lvCard(p, p.lvDiscipuloId === me && pode('lvVisitas'), gere); }).join('');
if (gere && discipulosDoGC(g).length) {
  h += '<div class="sec">Casas por discípulo</div><div class="card">' + discipulosDoGC(g).map(function (d) {
    var n = lvCasasDe(d.id).length;
    return barra(esc(d.nome), n + '/' + LV_CASAS, 0).replace('width:0%', 'width:' + (n / LV_CASAS * 100) + '%' + (n >= LV_CASAS ? ';background:var(--vermelho)' : ''));
  }).join('') + '</div>';
}
if (enc.length) {
  h += '<div class="sec">Encerrados (' + enc.length + ')</div><div class="card">' + enc.slice(0, 15).map(function (p) {
    var real = lvVis(p).filter(function (x) { return x.realizada === 'Sim'; }).length;
    return '<div class="row cl" data-a="lvHistorico" data-v="' + esc(p.id) + '">' + avatarP(p) + '<div class="info"><div class="nm">' + esc(p.nome) + '</div>' +
      '<div class="sb">' + br(p.lvEncerradoEm) + ' · ' + real + ' de ' + LV_SEMANAS + ' visitas realizadas · ' + esc(p.lvDiscipuloNome || '') + '</div></div>' +
      '<span class="pill ' + (p.lvResultado === 'Ficou' ? 'p-verde' : 'p-cinza') + '">' + esc(p.lvResultado || '—') + '</span></div>';
  }).join('') + '</div>';
}
h += '<div class="meta">Cada discípulo acompanha até ' + LV_CASAS + ' casas, com uma visita por semana durante ' + LV_SEMANAS + ' semanas.<br>' +
  'Verde = visita feita e pessoa em casa · amarelo = não estava · vermelho = não realizada ou semana sem registro.</div>';
return h;
}
function lvLiberar(pid) {
var p = pessoaPor(pid), g = gcPor(gcA()), sel = $('lvd-' + pid) ? $('lvd-' + pid).value : '';
if (!p) return;
if (!sel) return toast('Escolha quem vai visitar (discípulo ou voluntário do Lar de Vida).');
if (!ehDecisor() && !p.excecaoPor && !gcCompativel(g, p)) return toast('Esta pessoa não é compatível com o ' + g.nome + ' (sexo/idade). Fale com o pastor para redirecionar.', 5000);
if (lvCasasDe(sel).length >= LV_CASAS) return toast('Este discípulo já tem ' + LV_CASAS + ' casas.');
p.lvStatus = 'acompanhando'; p.lvDiscipuloId = sel; p.lvDiscipuloNome = nomeResponsavelLV(g, sel);
p.lvInicio = ($('lvi-' + pid) && $('lvi-' + pid).value) || hoje(); p.lvLiberadoPor = eu().nome; p.lvVisitas = [];
p.lvResultado = ''; p.lvEncerradoEm = ''; p.lvObsFinal = '';
p.updatedAt = agora(); p._pend = true;
salvarDB(); render(); sincAuto();
toast('Visitas liberadas para ' + pri(p.lvDiscipuloNome) + ' ✓ — 1ª visita até ' + br(lvPrazo(p)), 4000);
}
function lvTrocar(pid) {
var p = pessoaPor(pid), g = gcPor(p ? p.gcId : '');
if (!p) return;
abrirModal('<h2>Trocar discípulo</h2><div class="sb" style="font-size:12.5px;color:#888">' + esc(p.nome) + ' · atual: ' + esc(p.lvDiscipuloNome || '—') + '</div>' +
  '<label>Novo discípulo</label><select id="lv-novo">' + opcoesDiscipulos(g, p.lvDiscipuloId, p.id) + '</select>' +
  '<div style="font-size:11.5px;color:#888;margin-top:6px">As visitas já registradas continuam no histórico.</div><div style="height:14px"></div>' +
  '<button class="btn pr" data-a="lvConfirmarTroca" data-v="' + esc(pid) + '">Salvar</button><div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
}
function lvConfirmarTroca(pid) {
var p = pessoaPor(pid), sel = $('lv-novo').value, g = gcPor(p.gcId);
if (!sel) return toast('Escolha o discípulo.');
if (sel !== p.lvDiscipuloId && lvCasasDe(sel).length >= LV_CASAS) return toast('Este discípulo já tem ' + LV_CASAS + ' casas.');
p.lvDiscipuloId = sel; p.lvDiscipuloNome = nomeResponsavelLV(g, sel); p.updatedAt = agora(); p._pend = true;
salvarDB(); fechar(); render(); sincAuto(); toast('Discípulo alterado ✓');
}
function lvRegistrar(pid) {
var p = pessoaPor(pid); if (!p) return;
var n = lvVis(p).length + 1;
abrirModal('<h2>Visita ' + n + ' de ' + LV_SEMANAS + '</h2><div class="sb" style="font-size:12.5px;color:#888">' + esc(p.nome) + ' · ' + esc(separarBairroCidade(p.bairro, p.cidade).bairro) + '</div>' +
  '<label>Data da visita</label><input type="date" id="lv-data" value="' + hoje() + '">' +
  '<label>A visita foi realizada?</label><select id="v-real">' + opts([['Sim', 'Sim'], ['Não', 'Não']], 'Sim') + '</select>' +
  '<div id="lv-estavawrap"><label>A pessoa estava em casa?</label><select id="lv-estava">' + opts([['Sim', 'Sim'], ['Não', 'Não']], 'Sim') + '</select></div>' +
  '<label>Observações</label><textarea id="lv-obs" rows="3" placeholder="Como foi a conversa, pedidos de oração, motivo de não ter acontecido, próximos passos..."></textarea>' +
  '<div style="height:14px"></div><button class="btn pr" data-a="lvSalvarVisita" data-v="' + esc(pid) + '">Registrar visita</button><div class="gap"></div>' +
  '<button class="btn gh" data-a="fechar">Cancelar</button>');
}
function lvSalvarVisita(pid) {
var p = pessoaPor(pid); if (!p) return;
var v = lvVis(p).slice(), real = $('v-real').value;
v.push({ sem: v.length + 1, data: $('lv-data').value || hoje(), realizada: real, estava: real === 'Sim' ? $('lv-estava').value : '',
         obs: $('lv-obs').value.trim(), por: eu().nome, em: agora() });
p.lvVisitas = v; p.updatedAt = agora(); p._pend = true;
salvarDB(); fechar(); sincAuto();
if (v.length >= LV_SEMANAS) { render(); toast('7ª visita registrada. Agora encerre o acompanhamento.', 3500); lvEncerrar(pid); }
else { render(); toast('Visita ' + v.length + ' de ' + LV_SEMANAS + ' registrada ✓'); }
}
function lvEncerrar(pid) {
var p = pessoaPor(pid); if (!p) return;
var v = lvVis(p), real = v.filter(function (x) { return x.realizada === 'Sim'; }).length, estava = v.filter(function (x) { return x.estava === 'Sim'; }).length;
abrirModal('<h2>Encerrar Lar de Vida</h2><div class="sb" style="font-size:12.5px;color:#888">' + esc(p.nome) + '</div>' +
  '<div class="mini"><div><b>' + v.length + '</b><span>registros</span></div><div><b>' + real + '</b><span>realizadas</span></div>' +
  '<div><b>' + estava + '</b><span>em casa</span></div><div><b>' + br(p.lvInicio) + '</b><span>início</span></div></div>' +
  (v.length < LV_SEMANAS ? '<div class="aviso">Ainda faltam ' + (LV_SEMANAS - v.length) + ' visita(s). Encerre antes só se o acompanhamento não puder continuar.</div>' : '') +
  '<label>A pessoa permaneceu na igreja / no GC?</label><select id="v-res">' +
  opts([['Ficou', 'Sim — passar status de visitante para Ativo'], ['Não ficou', 'Não'], ['Mudou-se', 'Mudou-se'], ['Desistiu', 'Pediu para não receber mais visitas']], 'Ficou') + '</select>' +
  '<label>Observação final</label><textarea id="lv-obsfim" rows="2"></textarea><div style="height:14px"></div>' +
  '<button class="btn pr" data-a="lvConfirmarEncerrar" data-v="' + esc(pid) + '">Encerrar acompanhamento</button><div class="gap"></div>' +
  '<button class="btn gh" data-a="fechar">Cancelar</button>');
}
function lvConfirmarEncerrar(pid) {
var p = pessoaPor(pid); if (!p) return;
var res = $('v-res').value;
p.lvStatus = 'encerrado'; p.lvResultado = res; p.lvObsFinal = $('lv-obsfim').value.trim(); p.lvEncerradoEm = hoje();
if (res === 'Ficou') { p.status = 'Ativo'; if (!p.jornada || p.jornada === ETAPAS[0]) p.jornada = ETAPAS[1]; }
p.updatedAt = agora(); p._pend = true;
salvarDB(); fechar(); render(); sincAuto();
toast(res === 'Ficou' ? nomeChamado(p) + ' agora está Ativo ✓' : 'Acompanhamento encerrado');
}
function lvHistorico(pid) {
var p = pessoaPor(pid); if (!p) return;
var v = lvVis(p);
abrirModal('<h2>' + esc(p.nome) + '</h2><div style="margin:4px 0 8px">' + (p.origem ? '<span class="pill p-dour">' + esc(p.origem) + '</span>' : '') + lvResumoPill(p) + '</div>' +
  '<div class="sb" style="font-size:12.5px;color:#777;line-height:1.6">GC: ' + esc(gcNome(p.gcId)) + ' · Discípulo: ' + esc(p.lvDiscipuloNome || '—') +
  (p.lvLiberadoPor ? '<br>Liberado por ' + esc(p.lvLiberadoPor) + ' · início ' + brCompleto(p.lvInicio) : '') +
  (p.direcionadoPor ? '<br>Direcionado por ' + esc(p.direcionadoPor) + ' em ' + brCompleto(p.direcionadoEm) : '') + '</div>' +
  lvDots(p) + '<div class="card" style="box-shadow:none;border:1px solid #eee">' + (v.length ? v.map(function (x) {
    return '<div class="row" style="align-items:flex-start"><div class="av" style="font-size:12px">' + x.sem + 'ª</div><div class="info"><div class="nm" style="white-space:normal">' + br(x.data) + ' — ' +
      (x.realizada === 'Sim' ? 'realizada' + (x.estava === 'Sim' ? ', em casa' : ', não estava') : 'não realizada') + '</div>' +
      '<div class="sb">' + (x.obs ? esc(x.obs) + '<br>' : '') + 'por ' + esc(x.por || '') + '</div></div></div>';
  }).join('') : '<div class="empty">Nenhuma visita registrada ainda.</div>') + '</div>' +
  (p.lvStatus === 'encerrado' ? '<div class="aviso">Encerrado em ' + brCompleto(p.lvEncerradoEm) + ' · resultado: <b>' + esc(p.lvResultado) + '</b>' + (p.lvObsFinal ? '<br>' + esc(p.lvObsFinal) : '') + '</div>' : '') +
  '<button class="btn gh" data-a="fechar">Fechar</button>');
}

/* ── aba Lar de Vida do Gerenciador (supervisor, pastor, master) ── */
function rLVGer() {
var fila = lvFila(), gcs = GCSativos(), c = lvContagem(gcs.map(function (g) { return g.id; }));
var nomeUsr = {}; (db.equipe || []).forEach(function (u) { nomeUsr[u.id] = u.nome; });
var h = '<button class="btn" data-a="lvNovoModal">+ Cadastrar visitante da igreja</button><div class="gap"></div>' +
  '<div class="kpis">' + kpi(fila.length, 'Visitantes da igreja sem GC', fila.length ? 'al' : 'dk') + kpi(c.ac, 'Casas em acompanhamento') +
  kpi(c.ag, 'Aguardando o líder liberar') + kpi(c.at, 'Visitas atrasadas', c.at ? 'al' : '') + '</div>';
var doPastor = fila.filter(function (p) { return p.supRespId === PASTOR; });
if (ehDecisor() && doPastor.length) h += '<div class="aviso r"><b>' + doPastor.length + ' visitante(s) na fila do pastor</b> — sem GC compatível, GC sem supervisor ou devolvidos pelo supervisor. Decida o GC abaixo.</div>';
h += '<div class="sec">' + (ehDecisor() ? 'Direcionar ao GC (' + fila.length + ')' : 'Encaminhados a você (' + fila.length + ')') + '</div>';
if (!fila.length) h += '<div class="card"><div class="empty">' + (ehDecisor() ? 'Nenhum visitante da igreja aguardando direcionamento.' : 'Nenhum visitante encaminhado a você agora.<br>Os visitantes chegam aqui sozinhos quando o GC compatível mais próximo é um dos seus.') + '</div></div>';
fila.sort(function (a, b) { return (a.supRespId === PASTOR ? 0 : 1) - (b.supRespId === PASTOR ? 0 : 1) || (a.aceitaVisita === 'Sim' ? 0 : 1) - (b.aceitaVisita === 'Sim' ? 0 : 1) || String(a.prim).localeCompare(String(b.prim)); });
fila.forEach(function (p) {
  var end = separarBairroCidade(p.bairro, p.cidade), opG = opcoesGCDirecionar(p, p.gcSugeridoId);
  var enc = p.supRespId === PASTOR ? '<div class="aviso r" style="margin:10px 0 0"><b>Fila do pastor:</b> ' + esc(p.filaMotivo || 'decisão do pastor') + '</div>'
    : p.supRespId ? '<div style="font-size:12px;color:#1f6b40;margin-top:6px"><b>Encaminhado a:</b> ' + esc(p.supRespNome || 'supervisor') + (p.gcSugeridoId ? ' · GC sugerido: ' + esc(gcNome(p.gcSugeridoId)) : '') + '</div>'
    : '<div style="font-size:12px;color:#999;margin-top:6px">Encaminhamento em cálculo — sincronize.</div>';
  h += '<div class="card"><div class="row" style="padding:0;border:none">' + avatarP(p) + '<div class="info"><div class="nm">' + esc(p.nome) +
    (p.apelido ? ' <span style="color:#a87700;font-weight:600">“' + esc(p.apelido) + '”</span>' : '') + '</div>' +
    '<div class="sb">' + esc(p.sexo || 'sexo não informado') + (idadeDe(p) !== null ? ' · ' + idadeDe(p) + ' anos' : '') + ' · ' +
      esc([enderecoTexto(p), end.cidade].filter(Boolean).join(' · ') || 'endereço não informado') + (p.fone ? ' · ' + esc(p.fone) : '') + '</div></div>' +
    '<span class="pill ' + (p.aceitaVisita === 'Sim' ? 'p-verde' : 'p-cinza') + '">' + (p.aceitaVisita === 'Sim' ? 'aceita visita' : 'sem visita') + '</span></div>' +
    (+p.visitasIgreja >= 2 ? '<div style="margin-top:6px"><span class="pill p-vermelho">' + p.visitasIgreja + ' visitas ao culto sem GC</span></div>' : '') +
    '<div style="font-size:11.5px;color:#888;margin-top:6px;line-height:1.5">' + esc(p.origem || 'visita igreja') + ' · cadastrado em ' + br(p.prim) +
    (p.criadoPor && nomeUsr[p.criadoPor] ? ' por ' + esc(nomeUsr[p.criadoPor]) : '') +
    (p.frequentaIgreja === 'Sim' ? ' · frequenta ' + esc(p.igrejaQual || 'outra igreja') : '') + (p.obs ? '<br><i>"' + esc(p.obs) + '"</i>' : '') + '</div>' +
    (p.matchId ? '<div class="aviso" style="margin:10px 0 0;border-left-color:var(--azul);background:#f2f6ff;color:#23427f">Possível cadastro já existente: <b>' + esc(p.matchInfo || '') + '</b>' +
      '<div style="display:flex;gap:7px;margin-top:8px;flex-wrap:wrap"><button class="btn pr sm" data-a="lvVincularFila" data-v="' + esc(p.id) + '">É a mesma pessoa — avisar o GC</button>' +
      '<button class="btn gh sm" data-a="lvNaoEMesma" data-v="' + esc(p.id) + '">Não é</button></div></div>' : '') +
    enc +
    '<label>GC (compatíveis pelo sexo e idade, mais próximos primeiro)</label><select id="lvg-' + esc(p.id) + '">' + opG.html + '</select>' +
    (!opG.comp ? '<div style="font-size:11.5px;color:#a87700;margin-top:5px">' + (!p.sexo ? 'Sexo não informado — edite o cadastro.' : ehDecisor() ? 'Nenhum GC compatível. Escolha uma exceção ou cadastre o GC adequado.' : 'Nenhum dos seus GCs é compatível — devolva ao pastor.') + '</div>' : '') +
    '<div class="gap"></div>' +
    '<div class="acoes"><button class="btn pr sm" data-a="lvDirecionar" data-v="' + esc(p.id) + '">Direcionar</button>' +
    '<button class="btn gh sm" data-a="lvEditar" data-v="' + esc(p.id) + '">Editar cadastro</button></div>' +
    (!ehDecisor() ? '<div class="gap"></div><button class="btn dg sm" data-a="lvDevolver" data-v="' + esc(p.id) + '" style="width:100%">Devolver ao pastor</button>'
      : p.supRespId === PASTOR && p.filaMotivo && /^Devolvido/.test(p.filaMotivo) ? '<div class="gap"></div><button class="btn gh sm" data-a="lvReencaminhar" data-v="' + esc(p.id) + '" style="width:100%">Reencaminhar automaticamente</button>' : '') + '</div>';
});
h += '<div class="sec">Lar de Vida por GC</div><div class="card" style="padding:8px 10px;overflow-x:auto">';
h += gcs.length ? '<table class="tbl"><tr><th>GC</th><th style="text-align:right">Aguard.</th><th style="text-align:right">Visitas</th><th style="text-align:right">Atras.</th><th style="text-align:right">Ficaram</th></tr>' +
  gcs.map(function (g) {
    var x = lvContagem([g.id]);
    return '<tr class="cl" data-a="lvAbrirGC" data-v="' + esc(g.id) + '"><td><b>' + esc(g.nome) + '</b><div style="font-size:10.5px;color:#999">' + discipulosDoGC(g).length + ' discípulo(s)</div></td>' +
      '<td class="n">' + x.ag + '</td><td class="n">' + x.ac + '</td><td class="n" style="color:' + (x.at ? 'var(--vermelho)' : '#999') + '">' + x.at + '</td>' +
      '<td class="n">' + (x.enc ? x.fic + '/' + x.enc : '—') + '</td></tr>';
  }).join('') + '</table><div style="font-size:10.5px;color:#999;margin-top:8px">Toque num GC para abrir o Lar de Vida dele.</div>'
  : '<div class="empty">Nenhum GC.</div>';
return h + '</div>';
}
function lvDirecionar(pid) {
var p = pessoaPor(pid), el = $('lvg-' + pid), sel = el ? el.value : '';
if (!p) return;
if (!sel) return toast('Escolha o GC.');
var g = gcPor(sel);
if (!gcCompativel(g, p)) {
  if (!ehDecisor()) return toast('GC incompatível com a pessoa (sexo/idade).', 4500);
  if (!confirm('EXCEÇÃO: ' + g.nome + ' não segue a regra (sexo/idade) para ' + p.nome + '.\nDirecionar mesmo assim? Fica registrado na auditoria.')) return;
  p.excecaoPor = eu().nome + ' em ' + hoje();
}
p.supRespId = ''; p.supRespNome = ''; p.filaMotivo = ''; p.gcSugeridoId = '';
p.gcId = sel; p.direcionadoPor = eu().nome; p.direcionadoEm = hoje();
if (!p.prim) p.prim = hoje();
lvAjustarPendencia(p);
p.updatedAt = agora(); p._pend = true;
salvarDB(); render(); sincAuto();
toast(nomeChamado(p) + ' direcionado(a) ao ' + gcNome(sel) + (p.aceitaVisita === 'Sim' ? ' — o líder já pode liberar as visitas' : ''), 4000);
}

function lvDevolver(pid) {
var p = pessoaPor(pid); if (!p) return;
var m = prompt('Devolver ' + p.nome + ' ao pastor. Motivo (opcional):', '');
if (m === null) return;
p.supRespId = PASTOR; p.supRespNome = 'Pastor'; p.filaMotivo = 'Devolvido por ' + eu().nome + (m.trim() ? ': ' + m.trim() : '');
p.updatedAt = agora(); p._pend = true;
salvarDB(); render(); sincAuto(); toast('Devolvido ao pastor ✓');
}
function lvReencaminhar(pid) {
var p = pessoaPor(pid); if (!p) return;
p.supRespId = ''; p.supRespNome = ''; p.filaMotivo = ''; p.updatedAt = agora(); p._pend = true;
salvarDB(); sincronizar(false); toast('Reencaminhando ao supervisor do GC compatível mais próximo...');
}

/* ── cadastro de visitante da igreja (voluntário e gestores) ── */
function lvForm(p) {
var g = function (k, d) { return esc(p ? (p[k] || '') : (d || '')); };
var end = separarBairroCidade(p ? p.bairro : '', p ? p.cidade : '');
return campoFotoPessoa(p ? p.id : '') + '<label>Nome completo *</label><input id="v-nome" value="' + g('nome') + '">' +
  '<label>Como gostaria de ser chamado(a) / apelido</label><input id="v-apelido" value="' + g('apelido') + '" placeholder="Ex.: Juninho, Dona Cida">' +
  '<div class="g2"><div><label>WhatsApp</label><input id="v-fone" type="tel" inputmode="numeric" value="' + g('fone') + '"></div>' +
  '<div><label>Nascimento</label><input id="v-nasc" type="date" value="' + g('nasc') + '"></div></div>' +
  campoSexo('v', p, '', true) +
  '<div style="font-size:11px;color:#999;margin-top:4px">Define o GC indicado: masculino → GC de homens, feminino → GC de mulheres.</div>' +
  '<label>CEP <span style="font-weight:500;color:#aaa">(opcional)</span></label><input id="v-cep" inputmode="numeric" maxlength="9" placeholder="00000-000" value="' + esc(mascaraCep(p ? p.cep : '')) + '">' +
  '<div id="v-cepinfo" style="font-size:11.5px;margin-top:5px;line-height:1.4"></div>' +
  camposEndereco('v', p, '') +
  '<div class="g2"><div>' + campoBairro('v', end.bairro, true, '') + '</div>' +
  '<div><label>Cidade</label><input id="v-cidade" value="' + esc(end.cidade || cidadeIgreja()) + '"></div></div>' +
  '<div style="font-size:11px;color:#999;margin-top:4px">O bairro é usado para encaminhar ao GC mais próximo.</div>' +
  camposIgrejaVisita('v', p, '') +
  campoCanal('v', p, '') +
  '<div>' +
  '<div><label>Convidado por</label><input id="v-conv" value="' + g('conv') + '"></div></div>' +
  camposConsent('v', p, '') +
  '<label>Observações</label><textarea id="v-obs" rows="2" placeholder="Pedido de oração, melhor horário para visita...">' + g('obs') + '</textarea>';
}
function lvAbrirForm(pid) {
var p = pid ? pessoaPor(pid) : null;
lvModoCad = 'visitante';
abrirModal('<h2>' + (p ? 'Editar visitante' : 'Visitante da igreja') + '</h2><span class="pill p-dour">visita igreja</span>' + lvForm(p) +
  '<div style="height:16px"></div><button class="btn pr" data-a="' + (p ? 'lvSalvarEd' : 'lvSalvarNovo') + '" data-v="' + esc(pid || '') + '">Salvar</button>' +
  '<div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
}
var lvPendente = null;
function lvSalvarForm(pid, forcar) {
var v = function (id) { var el = $(id); return el ? el.value.trim() : ''; };
if (!pid && !forcar && $('v-nome')) {
  if (lvModoCad === 'visitante' && modoVisitante() && !eventoAbertoAgora()) { render(); return toast(msgBloqueioCadastro(), 6000); }
  if (lvModoCad === 'membro' && !v('v-gc')) return toast('Escolha o GC para onde o membro será direcionado.');
  if (!v('v-nome')) return toast('Informe o nome.');
  if (!v('v-sexo')) return toast('Informe o sexo — ele define o GC indicado (homens ou mulheres).');
  if (!v('v-bairro')) return toast('Informe o bairro — ele define o GC mais próximo.');
  var errV = validarConsent('v', true); if (errV) return toast(errV, 4500);
  var campos = {};
  ['v-nome', 'v-apelido', 'v-fone', 'v-nasc', 'v-cep', 'v-bairro', 'v-cidade', 'v-freqig', 'v-igreja', 'v-aceita', 'v-canal', 'v-canaloutro', 'v-conv', 'v-obs',
   'v-sexo', 'v-endereco', 'v-numero', 'v-complemento', 'v-gc', 'v-consent', 'v-resp'].forEach(function (k) { campos[k] = v(k); });
  campos._modo = lvModoCad;
  carregando(true, 'Consultando a base dos GCs...');
  (sbDisponivel()?v39ChecarPessoa({nome:campos['v-nome'],fone:campos['v-fone'],nasc:campos['v-nasc']}):chamar('checarPessoa', { nome: campos['v-nome'], fone: campos['v-fone'], nasc: campos['v-nasc'] })).then(function (r) {
    carregando(false);
    if (!r.itens || !r.itens.length) { lvPendente = campos; lvSalvarForm(null, true); return; }
    lvPendente = campos;
    if (campos._modo === 'membro') {
      abrirModal('<h2>Esta pessoa já está cadastrada?</h2><div style="font-size:13px;color:#555;line-height:1.5;margin:4px 0 10px">Encontramos cadastro parecido com <b>' + esc(campos['v-nome']) + '</b>:</div>' +
        r.itens.map(function (x) {
          return '<div class="card" style="box-shadow:none;border:1.5px solid #e2e2e2"><div class="nm" style="font-weight:800">' + esc(x.nome) + '</div>' +
            '<div class="sb" style="font-size:12px;color:#777;margin-top:3px">' + esc(x.gc) + (x.lider ? ' · líder ' + esc(x.lider) : '') + ' · ' + esc(x.tipo) + ' · ' + esc(x.status) +
            (x.mesmoFone ? ' · <b style="color:var(--verde)">mesmo telefone</b>' : '') + '</div></div>';
        }).join('') +
        '<div class="aviso">Se for a mesma pessoa, ela já está na base e não precisa de novo cadastro.</div>' +
        (r.itens.some(function (x) { return x.forte; }) ? '' : '<button class="btn gh" data-a="lvForcarNovo">Não é — cadastrar e direcionar mesmo assim</button><div class="gap"></div>') +
        '<button class="btn pr" data-a="fechar">É a mesma pessoa — não cadastrar</button>');
      return;
    }
    var forte = r.itens.some(function (x) { return x.forte; });
    abrirModal('<h2>Esta pessoa já está cadastrada?</h2>' +
      '<div style="font-size:13px;color:#555;line-height:1.5;margin:4px 0 10px">Encontramos ' + (r.itens.length > 1 ? 'cadastros parecidos' : 'um cadastro parecido') +
      ' com <b>' + esc(campos['v-nome']) + '</b>' + (campos['v-fone'] ? ' (' + esc(campos['v-fone']) + ')' : '') + ':</div>' +
      blocoCorrespondencias(r.itens, function (x) {
        return (x.visitaIgrejaEm ? '<div style="font-size:11.5px;color:#2f5fbf;margin-top:4px">1ª visita ao culto em ' + br(x.visitaIgrejaEm) + '</div>' : '') +
          '<div class="gap"></div><button class="btn pr sm" data-a="lvVincular" data-v="' + esc(x.id) + '">É esta pessoa — registrar ' + ((x.visitasIgreja || 0) + 1) + 'ª visita ao culto</button>';
      }) +      (forte ? '<div class="aviso r">Há um cadastro igual (mesmo nome e telefone/nascimento). Registre a visita no cadastro existente — não é possível cadastrar de novo.</div>'
             : '<button class="btn gh" data-a="lvForcarNovo">Não é — cadastrar como novo visitante</button><div class="gap"></div>') +
      '<button class="btn gh" data-a="fechar">Voltar ao formulário</button>');
  }).catch(function () { carregando(false); lvPendente = campos; lvSalvarForm(null, true); });
  return;
}
if (forcar && lvPendente) v = function (id) { return String(lvPendente[id] == null ? '' : lvPendente[id]).trim(); };
if (!v('v-nome')) return toast('Informe o nome.');
if (!v('v-sexo')) return toast('Informe o sexo — ele define o GC indicado (homens ou mulheres).');
if (!v('v-bairro')) return toast('Informe o bairro — ele define o GC mais próximo.');
var modo = forcar && lvPendente ? (lvPendente._modo || 'visitante') : (pid ? 'visitante' : lvModoCad);
var ant = pid ? pessoaPor(pid) : null, o = {};
if (ant) for (var k in ant) o[k] = ant[k];
else if (modo === 'membro') {
  if (!v('v-gc')) return toast('Escolha o GC para onde o membro será direcionado.');
  o.id = 'p' + Date.now() + Math.floor(Math.random() * 1000); o.tipo = 'Membro'; o.status = 'Ativo'; o.gcId = v('v-gc');
  o.origem = 'membro igreja'; o.prim = hoje(); o.jornada = ETAPAS[2]; o.criadoPor = eu().id; o.deleted = false;
  o.direcionadoPor = eu().nome; o.direcionadoEm = hoje(); o.lvStatus = '';
}
else {
  o.id = 'p' + Date.now() + Math.floor(Math.random() * 1000); o.tipo = 'Visitante'; o.status = 'Em visita'; o.gcId = '';
  o.origem = 'visita igreja'; o.prim = hoje(); o.jornada = ETAPAS[0]; o.criadoPor = eu().id; o.deleted = false;
}
o.nome = v('v-nome'); o.apelido = v('v-apelido'); o.fone = v('v-fone'); o.nasc = v('v-nasc'); o.cep = mascaraCep(v('v-cep'));
o.bairro = v('v-bairro'); o.cidade = v('v-cidade'); o.frequentaIgreja = v('v-freqig'); o.igrejaQual = o.frequentaIgreja === 'Sim' ? v('v-igreja') : '';
o.aceitaVisita = v('v-aceita'); o.canal = v('v-canal'); o.canalOutro = o.canal === 'Outros' ? v('v-canaloutro') : ''; o.conv = v('v-conv'); o.obs = v('v-obs');
if (pid && $('v-consent')) { var errE = validarConsent('v', false); if (errE) return toast(errE, 4500); }
aplicarConsent(o, v('v-consent'), v('v-resp'));
o.sexo = v('v-sexo'); o.endereco = v('v-endereco'); o.numero = v('v-numero'); o.complemento = v('v-complemento');
if (!ant) {
  var evA = eventoAbertoAgora();
  if (modo === 'visitante' && modoVisitante() && !evA) { lvPendente = null; render(); return toast(msgBloqueioCadastro(), 6000); }
  if (evA) { o.eventoId = evA.id; if (modo === 'visitante') o.prim = evA.data; }
}
o.updatedAt = agora(); o._pend = true;
aplicarFotoNova(o.id);
if (modo !== 'membro') lvAjustarPendencia(o);
db.pessoas = db.pessoas.filter(function (x) { return x.id !== o.id; }).concat([o]);
lvPendente = null;
if ($('v-nome') && !ant && cfg.aba === 'lvnovo') ['v-nome', 'v-apelido', 'v-fone', 'v-nasc', 'v-cep', 'v-endereco', 'v-numero', 'v-complemento', 'v-bairro', 'v-obs', 'v-conv'].forEach(function (k) { if ($(k)) $(k).value = ''; });
salvarDB(); fechar(); render(); sincronizar(false);
lvGCManual = false;
toast(ant ? 'Cadastro atualizado ✓' : modo === 'membro' ? nomeChamado(o) + ' cadastrado(a) e direcionado(a) ao ' + gcNome(o.gcId) + ' ✓ — o GC foi avisado'
  : nomeChamado(o) + ' cadastrado(a) ✓ — segue para o supervisor direcionar ao GC', 4200);
}
function lvVincular(mid, descartarId) {
  carregando(true, 'Registrando...');
  (sbDisponivel()?v39RegistrarVisitaIgreja(mid,hoje()).then(function(){return {ok:true};}):chamar('visitaIgreja', { pessoaId: mid, data: hoje(), descartarId: descartarId || '' })).then(function (r) {
    lvPendente = null; fechar();
    if (descartarId) db.pessoas = db.pessoas.filter(function (p) { return p.id !== descartarId; });
    salvarDB(); render(); sincronizar(false);
    toast(r.jaHoje ? 'A visita de hoje já estava registrada.' : r.visitas + 'ª visita ao culto registrada ✓' +
      (r.semGC ? (r.visitas >= 2 ? ' — o supervisor foi avisado para direcionar ao GC' : '') : (r.primeira ? ' — o ' + r.gc + ' foi avisado' : ' (' + r.gc + ')')), 5000);
  }).catch(function (e) { toast(e.message, 4500); }).then(function () { carregando(false); });
}
function lvNaoEMesma(pid) {
  var p = pessoaPor(pid); if (!p) return;
  p.matchId = ''; p.matchInfo = ''; p.updatedAt = agora(); p._pend = true;
  salvarDB(); render(); sincAuto(); toast('Ok, mantido como novo visitante');
}
var lvModoCad = 'visitante', lvGCManual = false;
/** Situação do cadastro de visitantes agora: aberto, ainda vai abrir hoje, já encerrou ou sem evento. */
function situacaoCadastro() {
  var ab = eventoAbertoAgora();
  if (ab) return { s: 'aberto', ev: ab };
  var d = new Date(), m = d.getHours() * 60 + d.getMinutes(), hj = eventosHoje(), prox = null, ult = null;
  hj.forEach(function (e) {
    var j = janelaEvento(e); if (!j) return;
    if (j.de > m && (!prox || j.de < janelaEvento(prox).de)) prox = e;
    if (j.ate < m && (!ult || j.ate > janelaEvento(ult).ate)) ult = e;
  });
  if (prox) return { s: 'antes', ev: prox, hora: hhmm(janelaEvento(prox).de) };
  if (ult) return { s: 'depois', ev: ult, hora: hhmm(janelaEvento(ult).ate) };
  return { s: 'nenhum' };
}
function msgBloqueioCadastro() {
  var st = situacaoCadastro();
  if (st.s === 'antes') return 'Novos cadastros bloqueados devido ao horário do culto. O cadastro do “' + st.ev.titulo + '” abre às ' + st.hora + '.';
  if (st.s === 'depois') return 'Novos cadastros bloqueados devido ao horário do culto. O cadastro do “' + st.ev.titulo + '” foi encerrado às ' + st.hora + '.';
  if (st.s === 'aberto') return 'O cadastro está aberto. Tente salvar novamente.';
  return 'Novos cadastros bloqueados: não há culto ou evento liberado para hoje.';
}
function cabecalhoEvento(ev) {
  return '<div style="background:var(--preto);color:#fff;border-radius:14px;padding:12px 14px;margin-bottom:12px;border-left:5px solid var(--dourado)">' +
    '<div style="font-size:10.5px;letter-spacing:1px;color:var(--dourado);font-weight:800">CADASTRO REFERENTE AO ' + esc((ev.tipo || 'Culto').toUpperCase()) + '</div>' +
    '<div style="font-size:17px;font-weight:800;margin-top:3px">' + esc(ev.titulo) + '</div>' +
    '<div style="font-size:12px;color:#ccc;margin-top:2px">' + DIAS[parseData(ev.data).getDay()] + ', ' + brCompleto(ev.data) +
    (ev.inicio ? ' · ' + esc(ev.inicio) + (ev.fim ? '–' + esc(ev.fim) : '') : '') + (ev.pregador ? ' · ' + esc(ev.pregador) : '') + '</div>' +
    '<div style="font-size:11px;color:#aaa;margin-top:4px">' + textoJanela(ev) + '</div></div>';
}
function gcSelectHtml() {
  var v = function (id) { var el = $(id); return el ? el.value.trim() : ''; };
  var p = { sexo: v('v-sexo'), nasc: v('v-nasc'), bairro: v('v-bairro'), cidade: v('v-cidade') || 'Matão/SP' };
  var atual = v('v-gc'), op = opcoesGCDirecionar(p);
  var html = op.html;
  if (lvGCManual && atual) html = html.replace(/ selected/g, '').replace('value="' + atual + '"', 'value="' + atual + '" selected');
  return '<label>GC de destino *</label><select id="v-gc">' + html + '</select>' +
    '<div style="font-size:11px;color:#999;margin-top:4px">Indicados pelo sexo e pela idade, com o mais próximo do bairro primeiro. ' +
    (!p.sexo ? '<b style="color:#a87700">Informe o sexo para ver os GCs indicados.</b>' : '') + '</div>';
}
function lvAtualizarGC() {
  var w = $('v-gcwrap'); if (!w) return;
  w.innerHTML = gcSelectHtml();
  var b = $('v-bairro') ? $('v-bairro').value.trim() : '';
  if (!b) return;
  var itens = [{ chave: geoChave(b, $('v-cidade').value), bairro: b, cidade: $('v-cidade').value || 'Matão/SP' }]
    .concat(GCSativos().filter(function (g) { return g.bairro; }).map(function (g) { return { chave: geoChave(g.bairro, g.cidade), bairro: g.bairro, cidade: g.cidade || 'Matão/SP' }; }));
  buscarGeo(itens).then(function (mudou) { if (mudou && $('v-gcwrap')) $('v-gcwrap').innerHTML = gcSelectHtml(); });
}
function rLVNovo() {
var topo = lvModoCad === 'visitante' && pode('visitantes') ? inicioVoluntario() : '';
var h = topo + '<div class="tabs" id="lv-tabs">' + [['visitante', 'Visitante do culto'], ['membro', 'Membro sem GC']].map(function (x) {
  return '<button data-a="lvModo" data-v="' + x[0] + '" class="' + (lvModoCad === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>';
if (lvModoCad === 'membro') {
  setTimeout(lvAtualizarGC, 0);
  return h + '<div class="aviso">Cadastre aqui quem <b>já frequenta a igreja</b> e ainda <b>não está em um GC</b>. O cadastro já é direcionado ao GC escolhido e o líder recebe um aviso. ' +
    'Não depende do horário do culto.</div>' +
    '<div class="card"><h3>Membro da igreja sem GC</h3>' + lvForm(null) + '<div id="v-gcwrap"></div>' +
    '<div style="height:16px"></div><button class="btn pr" data-a="lvSalvarNovo">Salvar e direcionar ao GC</button></div>';
}
var st = situacaoCadastro();
if (st.s !== 'aberto' && modoVisitante()) {
  var hojeL = eventosHoje();
  return h + '<div class="card" style="border-left:5px solid var(--vermelho)"><h3>Novos cadastros bloqueados</h3>' +
    '<div style="font-size:13.5px;color:#7a2020;line-height:1.55;font-weight:600">' + esc(msgBloqueioCadastro()) + '</div>' +
    '<div style="font-size:12.5px;color:#666;line-height:1.55;margin-top:6px">O cadastro de visitantes só funciona no dia e dentro do horário do culto ou evento liberado pela liderança.</div>' +
    (hojeL.length ? '<div class="sec" style="margin-left:0">Cultos de hoje</div>' + hojeL.map(function (x) {
      return '<div class="row"><div class="info"><div class="nm">' + esc(x.titulo) + (x.inicio ? ' · ' + esc(x.inicio) + (x.fim ? '–' + esc(x.fim) : '') : '') + '</div><div class="sb">' + textoJanela(x) + '</div></div></div>';
    }).join('') : '') + '</div>' +
    '<div class="meta">Membros que já frequentam a igreja e não estão em GC podem ser cadastrados a qualquer hora na aba <b>Membro sem GC</b>.</div>';
}
var ev = st.ev;
return h + (ev ? cabecalhoEvento(ev) : '<div class="aviso">Nenhum culto liberado agora — o cadastro ficará sem culto de referência.</div>') +
  '<div class="aviso">O cadastro recebe a marcação <b>“visita igreja”</b> e segue para o supervisor direcionar ao GC mais próximo do bairro. Quem aceitar visita entra no Lar de Vida.</div>' +
  '<div class="card"><h3>Novo visitante' + (ev ? ' — ' + esc(ev.titulo) : '') + '</h3>' + lvForm(null) +
  '<div style="height:16px"></div><button class="btn pr" data-a="lvSalvarNovo">Salvar visitante</button></div>';
}
function rLVMeus() {
var l = PES().filter(function (p) { return p.criadoPor === eu().id; }).sort(function (a, b) { return String(b.prim).localeCompare(String(a.prim)) || a.nome.localeCompare(b.nome, 'pt-BR'); });
var h = '<div class="sec">Meus cadastros (' + l.length + ')</div><div class="card">';
h += l.length ? l.map(function (p) {
  var s = p.origem === 'membro igreja' ? ['p-verde', 'membro · ' + gcNome(p.gcId)] : lvSituacaoTexto(p), edita = !p.gcId;
  return '<div class="row' + (edita ? ' cl" data-a="lvEditar" data-v="' + esc(p.id) : '') + '">' + avatarP(p) + '<div class="info"><div class="nm">' + esc(p.nome) + '</div>' +
    '<div class="sb">' + br(p.prim) + (p.eventoId && eventoPor(p.eventoId) ? ' · ' + esc(eventoPor(p.eventoId).titulo) : '') + ' · ' + esc(separarBairroCidade(p.bairro, p.cidade).bairro) + ' · ' + (p.aceitaVisita === 'Sim' ? 'aceita visita' : 'sem visita') + '</div></div>' +
    '<span class="pill ' + s[0] + '">' + esc(s[1]) + '</span></div>';
}).join('') : '<div class="empty">Você ainda não cadastrou visitantes.</div>';
return h + '</div><div class="meta">Dá para editar enquanto o cadastro aguarda direcionamento. Depois, o GC assume o acompanhamento.</div>';
}

/* ═══════════════════ IGREJA: CONFIGURAÇÕES, CULTOS/EVENTOS, ACESSOS ═══════════════════ */
var IC_CULTO = '<path d="M12 2v5M9.5 4.5h5"/><path d="M4 21V11l8-4 8 4v10"/><path d="M10 21v-5h4v5"/>';
var ABA_CULTOS = { id: 'cultos', nome: 'Cultos', ic: IC_CULTO };
var TIPOS_EVENTO = ['Culto', 'Evento', 'Conferência', 'Santa Ceia', 'Batismo', 'Outro'];
var SEM_MASTER_C = ['prontuario', 'pacienteNomes', 'instFarmacia'];
var PERM_ORDEM = ['config', 'eventos', 'visitantes', 'financeiro', 'recados', 'relFin', 'rede', 'gc', 'gcEvento', 'lvDirecionar', 'lvLiberar', 'lvVisitas', 'usuarios', 'consulta', 'cursos', 'instituto', 'institutoAdmin', 'institutoCursos', 'instMercado', 'instFarmacia', 'agendaPastoral', 'prontuario', 'pacienteNomes'];
var PERM_NOME_C = {
  config: 'Configurações da igreja', eventos: 'Criar e liberar cultos/eventos', visitantes: 'Cadastrar visitantes no culto',
  financeiro: 'Lançar dízimos e ofertas do culto', recados: 'Recados e tema do culto', relFin: 'Relatório financeiro',
  rede: 'Gerenciar GCs (rede)', gc: 'GC: chamada e pessoas', gcEvento: 'GC: dados do encontro e valores',
  lvDirecionar: 'Lar de Vida: direcionar visitantes', lvLiberar: 'Lar de Vida: liberar casas',
  lvVisitas: 'Lar de Vida: registrar visitas', usuarios: 'Aprovar usuários e acessos',
  consulta: 'Consultar cadastro de pessoas (telefone, endereço)',
  cursos: 'Treinamentos/Reuniões (criar e fazer chamada)', institutoCursos: 'Instituto: cursos (criar e fazer chamada)',
  instituto: 'Instituto: ver agendas e agendar (sem ver nomes)', institutoAdmin: 'Instituto: criar agendas e horários',
  agendaPastoral: 'Agenda pastoral: agendar atendimentos', prontuario: 'Prontuário e atendimentos (somente o profissional)', pacienteNomes: 'Ver nomes dos pacientes nas agendas',
  instMercado: 'Instituto: Mercado solidário (entradas, entregas e estoque)', instFarmacia: 'Instituto: Farmácia solidária (receitas, entregas e estoque — dados de saúde)'
};
var TODAS_C = ['config', 'eventos', 'visitantes', 'financeiro', 'recados', 'relFin', 'rede', 'gc', 'gcEvento', 'lvDirecionar', 'lvLiberar', 'usuarios', 'consulta', 'cursos', 'instituto', 'institutoAdmin', 'institutoCursos', 'instMercado', 'agendaPastoral'];
var PERM_PADRAO_C = {
  master: TODAS_C, pastor: TODAS_C,
  supervisor: ['visitantes', 'rede', 'gc', 'gcEvento', 'lvDirecionar', 'lvLiberar'],
  lider: ['gc', 'gcEvento', 'lvLiberar'], discipulo: ['gc', 'lvVisitas'],
  secretaria: ['eventos', 'visitantes', 'recados', 'consulta', 'instituto', 'institutoAdmin', 'institutoCursos', 'instMercado', 'agendaPastoral'], tesouraria: ['financeiro', 'relFin'], voluntario: ['visitantes'], voluntarioLV: ['visitantes', 'lvVisitas'],
  voluntarioInst: ['instituto', 'instMercado'], profissional: ['instituto', 'prontuario']
};

/* ── logo e dados da igreja (cache local) ── */
var K_IGR = 'gcbv5_igr', igr = lerJSON(K_IGR, { config: {}, logo: '', logoV: '' });
function salvarIgr() { lsSet(K_IGR, JSON.stringify(igr)); }
function igrNome() { return (igr.config && igr.config.nome) || '2Gather'; }
(function () {
  var imgs = document.querySelectorAll('img.lg-g');
  for (var i = 0; i < imgs.length; i++) imgs[i].setAttribute('data-orig', imgs[i].getAttribute('src'));
})();
/** Cor de destaque da igreja (padrão azul). Gera a versão clara para fundos. */
var COR_PADRAO = '#2F5BEA';
var CORES_SUGERIDAS = ['#2F5BEA', '#16A36A', '#7C3AED', '#D97706', '#DC2626', '#0F766E', '#DB2777', '#111827'];
function corClara(hex, a) {
  var m = String(hex).match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i); if (!m) return '#EAF0FF';
  var f = function (h) { return Math.round(parseInt(h, 16) * a + 255 * (1 - a)); };
  return 'rgb(' + f(m[1]) + ',' + f(m[2]) + ',' + f(m[3]) + ')';
}
function aplicarCor(cor) {
  cor = /^#[0-9a-f]{6}$/i.test(String(cor || '')) ? cor : COR_PADRAO;
  var r = document.documentElement.style;
  r.setProperty('--pri', cor); r.setProperty('--pri-s', corClara(cor, 0.12)); r.setProperty('--pri-m', corClara(cor, 0.28));
}
function aplicarLogo() {
  aplicarCor(igr.config && igr.config.cor);
  LOGO = igr.icone || igr.logo || LOGO_PADRAO;
  var imgs = document.querySelectorAll('img.lg-g');
  var loginImg = igr.logo || (MODO_PWA ? (igr.icone || ICONE_2G) : '');
  for (var i = 0; i < imgs.length; i++) {
    imgs[i].src = loginImg || imgs[i].getAttribute('data-orig');
    imgs[i].classList.toggle('lg-custom', !!loginImg);
  }
  var temNome = !!(igr.config && igr.config.nome);
  var subs = document.querySelectorAll('.sub-lg');
  for (var k = 0; k < subs.length; k++) subs[k].textContent = temNome ? igr.config.nome.toUpperCase() : '2GATHER';
  if (!$('h-img').getAttribute('src') || cfg.modo !== 'gc') $('h-img').src = LOGO;
  // ícone da aba do navegador: o da igreja (o ícone do app instalado continua o do 2Gather)
  var links = document.querySelectorAll('link[rel="icon"]' + (MODO_PWA ? '' : ',link[rel="apple-touch-icon"]'));
  for (var j = 0; j < links.length; j++) links[j].href = igr.icone || igr.logo ? LOGO : (MODO_PWA ? 'icons/favicon-32.png' : LOGO);
  document.title = temNome ? igrNome() : '2Gather';
}
function atualizarConfig(c) {
  if (!c) return Promise.resolve(false);
  igr.config = c; salvarIgr();
  if ((c.logoV || '') === (igr.logoV || '') && (c.iconeV || '') === (igr.iconeV || '')) { aplicarLogo(); return Promise.resolve(false); }
  if (!c.logoV && !c.iconeV) { igr.logo = ''; igr.logoV = ''; igr.icone = ''; igr.iconeV = ''; salvarIgr(); aplicarLogo(); return Promise.resolve(true); }
  return chamarBruto({ acao: 'logo' }).then(function (r) {
    if (r && r.ok) { igr.logo = r.logo || ''; igr.logoV = r.logoV || ''; igr.icone = r.icone || ''; igr.iconeV = r.iconeV || ''; salvarIgr(); aplicarLogo(); return true; }
    return false;
  }).catch(function () { return false; });
}

/* ── permissões ── */
function pode(p) {
  var u = eu();
  // Na v39 nunca ampliar acesso pelo nome do perfil. Somente effective_permissions vindas do banco.
  if (u && u._v39) return !!(u.perms && u.perms[p]);
  // Compatibilidade exclusiva com a sessão legada v38/Apps Script.
  if (u.papel === 'master') return SEM_MASTER_C.indexOf(p) < 0;
  if (u.perms) return !!u.perms[p];
  return (PERM_PADRAO_C[u.papel] || []).indexOf(p) >= 0;
}
function modoVisitante() { return !pode('gc') && !pode('rede') && !pode('lvDirecionar'); }
function temCultos() { return pode('eventos') || pode('financeiro') || pode('recados') || pode('relFin'); }
function abasExtras() {
  var x = [];
  if (cfg.modo === 'ger') { x.push('gcs', 'avisos', 'relatorios'); if (pode('lvDirecionar')) x.push('lv'); if (ehAdmin()) x.push('usuarios'); }
  if (podeFin()) x.push('financeiro');
  if (cfg.modo === 'gc') x.push('lar');
  if (cfg.modo === 'lv' && pode('visitantes')) x.push('lvnovo', 'lvmeus');
  if (cfg.modo === 'lv' && pode('lvVisitas')) x.push('lvcasas');
  x.push('avisos');
  if (temInst()) x.push('instituto', 'instagenda'); if (temInstCursos()) x.push('instcursos'); if (temEstMercado()) x.push('instmercado'); if (temEstFarmacia()) x.push('instfarmacia');
  if (pode('rede')) x.push('novo');
  if (pode('config')) x.push('config');
  if (pode('visitantes')) x.push('lvnovo', 'lvmeus');
  if (temCultos()) x.push('cultos');
  if (pode('consulta')) x.push('membros');
  if (temCursos()) x.push('cursos');
  return x;
}

/* ── horários de culto/evento ── */
function minStr(h) { var m = String(h || '').match(/^(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; }
function numPad(v, d) { var t = String(v == null ? '' : v).trim(); return t === '' || isNaN(+t) ? d : +t; }
function hhmm(m) { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
function janelaEvento(e) {
  var ini = minStr(e.inicio), fim = minStr(e.fim);
  if (ini === null) return null;
  if (fim === null) fim = ini + 120;
  return { de: ini - numPad(e.antes, 60), ate: fim + numPad(e.depois, 120) };
}
function EVS() { return (db.eventos || []).filter(function (e) { return !e.deleted; }); }
function eventoPor(id) { var l = db.eventos || []; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
function eventosHoje() { return EVS().filter(function (e) { return e.liberado && e.data === hoje(); }); }
function eventoAbertoAgora() {
  var d = new Date(), m = d.getHours() * 60 + d.getMinutes();
  return eventosHoje().filter(function (e) { var j = janelaEvento(e); return !j || (m >= j.de && m <= j.ate); })[0] || null;
}
function textoJanela(e) { var j = janelaEvento(e); return j ? 'cadastro de ' + hhmm(j.de) + ' às ' + hhmm(j.ate) : 'cadastro liberado o dia todo'; }
function totalEvento(e) { return valor(e.dizimo) + valor(e.oferta) + valor(e.outras); }

/* ── aba Cultos ── */
var filtroCulto = 'prox';
function rCultos() {
  var evs = EVS(), h = '', ab = eventoAbertoAgora(), verValor = pode('financeiro') || pode('relFin');
  if (ab && pode('visitantes')) h += '<div class="aviso" style="background:#effaf3;border-left-color:var(--verde);color:#1f6b40;cursor:pointer" data-a="aba" data-v="lvnovo">' +
    '<b>Cadastro de visitantes aberto:</b> ' + esc(ab.titulo) + ' · ' + textoJanela(ab) + '. Toque para cadastrar.</div>';
  if (pode('eventos')) {
    h += '<button class="btn" data-a="evNovo">+ Novo culto ou evento</button>';
    if (((igr.config || {}).cultos || []).length) h += '<div class="gap"></div><button class="btn gh" data-a="evSemana">Criar os cultos fixos dos próximos 7 dias</button>';
    h += '<div class="gap"></div>';
  }
  var tabs = [['prox', 'Próximos'], ['real', 'Realizados']];
  if (pode('relFin')) tabs.push(['fin', 'Financeiro']);
  if (tabs.every(function (t) { return t[0] !== filtroCulto; })) filtroCulto = 'prox';
  h += '<div class="tabs">' + tabs.map(function (t) {
    return '<button data-a="filtroCulto" data-v="' + t[0] + '" class="' + (filtroCulto === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>';
  if (filtroCulto === 'fin') return h + rRelFin();
  if (filtroCulto === 'real') h += graficoCultos('Presença nos últimos cultos e eventos');
  var hj = hoje();
  var l = filtroCulto === 'prox'
    ? evs.filter(function (e) { return e.data >= hj; }).sort(function (a, b) { return (a.data + a.inicio) < (b.data + b.inicio) ? -1 : 1; })
    : evs.filter(function (e) { return e.data < hj; }).sort(function (a, b) { return (a.data + a.inicio) < (b.data + b.inicio) ? 1 : -1; }).slice(0, 40);
  if (!l.length) return h + '<div class="card"><div class="empty">' + (filtroCulto === 'prox' ? 'Nenhum culto ou evento agendado.' : 'Nenhum culto ou evento realizado ainda.') + '</div></div>';
  l.forEach(function (e) {
    var d = parseData(e.data), aberto = ab && ab.id === e.id;
    var st = aberto ? ['p-verde', 'cadastro aberto agora'] : e.liberado ? ['p-dour', 'liberado'] : ['p-cinza', 'cadastro fechado'];
    h += '<div class="card"' + (aberto ? ' style="border-left:5px solid var(--verde)"' : '') + '>' +
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div style="min-width:0">' +
      '<div style="font-size:11px;color:#888;font-weight:800;letter-spacing:.6px">' + esc((e.tipo || 'Culto').toUpperCase()) + ' · ' + DIAS[d.getDay()].toUpperCase() + ', ' + brCompleto(e.data) +
      (e.inicio ? ' · ' + esc(e.inicio) + (e.fim ? '–' + esc(e.fim) : '') : '') + '</div>' +
      '<div style="font-size:16px;font-weight:800;margin-top:3px">' + esc(e.titulo) + '</div></div>' +
      '<span class="pill ' + st[0] + '">' + st[1] + '</span></div>' +
      '<div style="font-size:12.5px;color:#555;margin-top:6px;line-height:1.55">' +
      (e.pregador ? '<b>Pregador:</b> ' + esc(e.pregador) + '<br>' : '') +
      (e.tituloPalavra ? '<b>Palavra:</b> ' + esc(e.tituloPalavra) + '<br>' : '') +
      (e.tema ? '<b>Tema da ministração:</b> ' + esc(e.tema) + '<br>' : '') +
      '<b>Visitantes:</b> ' + (e.nVisitantes || 0) + (e.presentes ? ' · <b>Presentes:</b> ' + esc(e.presentes) : '') +
      (verValor && totalEvento(e) ? ' · <b>Arrecadado:</b> ' + moeda(totalEvento(e)) : '') +
      (e.liberado ? '<br><span style="color:#888">' + textoJanela(e) + '</span>' : '') + linhaMensagem(e) + '</div>' +
      (e.recados ? '<div style="background:var(--cc);border-radius:10px;padding:9px 10px;font-size:12.5px;margin-top:8px;white-space:pre-line">' + esc(e.recados) + '</div>' : '') +
      '<div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:10px">' +
      '<button class="btn gh sm" data-a="evFicha" data-v="' + esc(e.id) + '">Ficha</button>' +
      (pode('eventos') ? '<button class="btn gh sm" data-a="evEditar" data-v="' + esc(e.id) + '">Editar</button>' +
        '<button class="btn ' + (e.liberado ? 'dg' : 'vd') + ' sm" data-a="evLiberar" data-v="' + esc(e.id) + '">' + (e.liberado ? 'Fechar cadastro' : 'Liberar cadastro') + '</button>' : '') +
      (pode('financeiro') ? '<button class="btn gh sm" data-a="evValores" data-v="' + esc(e.id) + '">Valores e presença</button>' : '') +
      (pode('recados') ? '<button class="btn gh sm" data-a="evRecados" data-v="' + esc(e.id) + '">Recados e tema</button>' : '') +
    (pode('eventos') && (e.msgTexto || e.temImg) ? '<button class="btn pr sm" data-a="evMensagem" data-v="' + esc(e.id) + '">Mensagem WhatsApp</button>' : '') +
      '</div></div>';
  });
  return h;
}
function rRelFin() {
  var meses = mesesAtras(6), por = meses.map(function (m) {
    var r = { diz: 0, ofe: 0, out: 0, n: 0 };
    EVS().forEach(function (e) { if (String(e.data).slice(0, 7) !== m) return; r.diz += valor(e.dizimo); r.ofe += valor(e.oferta); r.out += valor(e.outras); if (totalEvento(e)) r.n++; });
    r.tot = r.diz + r.ofe + r.out;
    var g = 0; GCS().forEach(function (x) { g += financeiro(x.id, m).tot; }); r.gc = g;
    return r;
  });
  var at = por[5], mx = 1; por.forEach(function (x) { if (x.tot + x.gc > mx) mx = x.tot + x.gc; });
  var h = '<div class="kpis">' + kpi(moeda(at.tot + at.gc), 'Total em ' + nomeMes(meses[5]), 'dk') + kpi(moeda(at.tot), 'Cultos e eventos (' + at.n + ')') +
    kpi(moeda(at.diz), 'Dízimos nos cultos') + kpi(moeda(at.ofe + at.out), 'Ofertas e outras') + '</div>';
  h += '<div class="sec">Últimos 6 meses</div><div class="card"><div class="spark" style="margin-top:24px">' + por.map(function (x, i) {
    var t = x.tot + x.gc;
    return '<div style="height:' + Math.max(3, t / mx * 100) + '%;' + (t ? '' : 'background:#e5e5e5') + '"><b>' + (t ? moedaCurta(t).replace('R$ ', '') : '') + '</b><u>' + nomeMes(meses[i]) + '</u></div>';
  }).join('') + '</div><table class="tbl"><tr><th>Mês</th><th style="text-align:right">Cultos</th><th style="text-align:right">GCs</th><th style="text-align:right">Total</th></tr>' +
    por.map(function (x, i) { return '<tr><td>' + nomeMes(meses[i]) + '</td><td class="n">' + moeda(x.tot) + '</td><td class="n">' + moeda(x.gc) + '</td><td class="n">' + moeda(x.tot + x.gc) + '</td></tr>'; }).reverse().join('') +
    '</table><div style="font-size:10.5px;color:#999;margin-top:8px">GCs = valores lançados nos encontros dos GCs que você acompanha.</div></div>';
  var mesEv = EVS().filter(function (e) { return String(e.data).slice(0, 7) === meses[5]; }).sort(function (a, b) { return a.data < b.data ? -1 : 1; });
  h += '<div class="sec">Cultos e eventos de ' + nomeMes(meses[5]) + '</div><div class="card">' + (mesEv.length ? mesEv.map(function (e) {
    return '<div class="row cl" data-a="evFicha" data-v="' + esc(e.id) + '"><div class="info"><div class="nm">' + br(e.data) + ' — ' + esc(e.titulo) + '</div>' +
      '<div class="sb">Dízimos ' + moeda(valor(e.dizimo)) + ' · Ofertas ' + moeda(valor(e.oferta)) + (valor(e.outras) ? ' · Outras ' + moeda(valor(e.outras)) : '') + '</div></div>' +
      '<b style="white-space:nowrap">' + moeda(totalEvento(e)) + '</b></div>';
  }).join('') : '<div class="empty">Nenhum culto neste mês.</div>') + '</div>';
  return h;
}

/* ── modais de evento ── */
function evForm(e) {
  e = e || {};
  var cultos = (igr.config || {}).cultos || [];
  return (!e.id && cultos.length ? '<label>Usar culto fixo</label><select id="ev-fixo"><option value="">— preencher manualmente —</option>' +
      cultos.map(function (c, i) { return '<option value="' + i + '">' + esc(c.nome || 'Culto') + ' · ' + DIAS[+c.dia] + ' ' + esc(c.horario || '') + '</option>'; }).join('') + '</select>' : '') +
    '<div class="g2"><div><label>Tipo</label><select id="ev-tipo">' + opts(TIPOS_EVENTO.map(function (t) { return [t, t]; }), e.tipo || 'Culto') + '</select></div>' +
    '<div><label>Data *</label><input id="ev-data" type="date" value="' + esc(e.data || hoje()) + '"></div></div>' +
    '<label>Título *</label><input id="ev-titulo" value="' + esc(e.titulo) + '" placeholder="Ex.: Culto da Família">' +
    '<div class="g2"><div><label>Início</label><input id="ev-ini" type="time" value="' + esc(e.inicio) + '"></div>' +
    '<div><label>Término</label><input id="ev-fim" type="time" value="' + esc(e.fim) + '"></div></div>' +
    '<label>Pregador</label><input id="ev-preg" value="' + esc(e.pregador) + '">' +
    '<label>Título da palavra</label><input id="ev-palavra" value="' + esc(e.tituloPalavra) + '" placeholder="Ex.: A fé que move montanhas">' +
    '<div class="sec" style="margin-left:0">Cadastro de visitantes</div>' +
    '<label>Liberar cadastro de visitantes?</label><select id="ev-lib">' + opts([['false', 'Não (fechado)'], ['true', 'Sim — na janela de horário abaixo']], String(!!e.liberado)) + '</select>' +
    '<div class="g2"><div><label>Abre (min antes do início)</label><input id="ev-antes" type="number" min="0" value="' + esc(e.antes === undefined || e.antes === '' ? 60 : e.antes) + '"></div>' +
    '<div><label>Fecha (min após o término)</label><input id="ev-depois" type="number" min="0" value="' + esc(e.depois === undefined || e.depois === '' ? 120 : e.depois) + '"></div></div>' +
    '<div style="font-size:11px;color:#999;margin-top:4px">Os voluntários só cadastram no dia do evento e dentro desta janela.</div>' +
    '<label>Observações</label><textarea id="ev-obs" rows="2">' + esc(e.obs) + '</textarea>' + evFormMensagem(e);
}
function lerEvForm() {
  var v = function (id) { var el = $(id); return el ? el.value.trim() : ''; };
  return { tipo: v('ev-tipo'), data: v('ev-data'), titulo: v('ev-titulo'), inicio: v('ev-ini'), fim: v('ev-fim'), pregador: v('ev-preg'),
           tituloPalavra: v('ev-palavra'), liberado: v('ev-lib') === 'true', antes: v('ev-antes'), depois: v('ev-depois'), obs: v('ev-obs'),
           msgTexto: v('ev-msgtxt'), msgPublico: v('ev-msgpub'), msgGcId: v('ev-msgpub') === 'gc' ? v('ev-msggc') : '',
           msgAgendada: v('ev-msgquando') ? new Date(v('ev-msgquando')).toISOString() : '', _prog: v('ev-msgprog') };
}
function salvarEventoSrv(ev, msg) {
  carregando(true, 'Salvando...');
  var op = sbDisponivel() ? v39SalvarCulto(ev).then(function(x){return {evento:x};}) : chamar('salvarEvento', { evento: ev });
  return op.then(function (r) {
    db.eventos = (db.eventos || []).filter(function (x) { return x.id !== r.evento.id; }).concat([r.evento]); salvarDB();
    fechar(); render(); toast(msg || 'Salvo ✓');
  }).catch(function (e) { toast(e.message, 4500); }).then(function () { carregando(false); });
}
function evNovo() { msgImgNova = null;
  abrirModal('<h2>Novo culto ou evento</h2>' + evForm(null) + '<div style="height:16px"></div><button class="btn pr" data-a="evSalvar">Salvar</button><div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
}
function evEditar(id) { msgImgNova = null;
  var e = eventoPor(id); if (!e) return;
  abrirModal('<h2>Editar culto/evento</h2>' + evForm(e) + '<div style="height:16px"></div><button class="btn pr" data-a="evSalvar" data-v="' + esc(id) + '">Salvar</button><div class="gap"></div>' +
    '<button class="btn gh" data-a="fechar">Cancelar</button><div class="gap"></div><button class="btn dg" data-a="evExcluir" data-v="' + esc(id) + '">Excluir</button>');
}
function evSalvar(id) {
  var f = lerEvForm();
  if (!f.titulo) return toast('Informe o título.');
  if (!f.data) return toast('Informe a data.');
  if (id) f.id = id;
  var ant = id ? eventoPor(id) : null;
  if (f._prog === 'sim') {
    if (!f.msgTexto && !msgImgNova && !(ant && ant.temImg)) return toast('Escreva o texto ou escolha uma imagem para a mensagem.');
    if (!f.msgAgendada) return toast('Informe a data e a hora do envio da mensagem.');
    if (f.msgAgendada < new Date(Date.now() - 60000).toISOString()) return toast('A data/hora do envio já passou.');
    f.msgStatus = 'agendada';
  } else if (ant && (ant.msgStatus === 'agendada' || ant.msgStatus === 'enviando')) f.msgStatus = 'cancelada';
  delete f._prog;
  if (msgImgNova) f.msgImg = msgImgNova;
  salvarEventoSrv(f, id ? 'Evento atualizado ✓' : 'Evento criado ✓').then(function () { msgImgNova = null; });
}
function evLiberar(id) {
  var e = eventoPor(id); if (!e) return;
  salvarEventoSrv({ id: id, liberado: !e.liberado }, e.liberado ? 'Cadastro de visitantes fechado' : 'Cadastro de visitantes liberado ✓ (' + textoJanela(e) + ')');
}
function evExcluir(id) { if (confirm('Excluir este culto/evento?')) salvarEventoSrv({ id: id, deleted: true }, 'Evento excluído'); }
function evValores(id) {
  var e = eventoPor(id); if (!e) return;
  abrirModal('<h2>Valores e presença</h2><div class="sb" style="font-size:12.5px;color:#888">' + esc(e.titulo) + ' · ' + brCompleto(e.data) + '</div>' +
    '<div class="g2"><div><label>Dízimos (R$)</label><input id="ev-diz" inputmode="decimal" value="' + esc(campoMoeda(e.dizimo)) + '" placeholder="0,00"></div>' +
    '<div><label>Ofertas (R$)</label><input id="ev-ofe" inputmode="decimal" value="' + esc(campoMoeda(e.oferta)) + '" placeholder="0,00"></div></div>' +
    '<label>Outras entradas (R$)</label><input id="ev-out" inputmode="decimal" value="' + esc(campoMoeda(e.outras)) + '" placeholder="0,00">' +
    '<label>Pessoas presentes no culto</label><input id="ev-pres" type="number" min="0" inputmode="numeric" value="' + esc(e.presentes) + '" placeholder="contagem do culto">' +
    '<div style="height:16px"></div><button class="btn pr" data-a="evSalvarValores" data-v="' + esc(id) + '">Salvar valores</button><div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
}
function evSalvarValores(id) {
  var n = function (x) { var t = valor($(x).value); return t ? String(t) : ''; };
  var pr = parseInt($('ev-pres').value, 10);
  salvarEventoSrv({ id: id, dizimo: n('ev-diz'), oferta: n('ev-ofe'), outras: n('ev-out'), presentes: isNaN(pr) || pr < 0 ? '' : String(pr) }, 'Valores e presença salvos ✓');
}
function evRecados(id) {
  var e = eventoPor(id); if (!e) return;
  abrirModal('<h2>Recados e tema</h2><div class="sb" style="font-size:12.5px;color:#888">' + esc(e.titulo) + ' · ' + brCompleto(e.data) + '</div>' +
    '<label>Tema da ministração</label><input id="ev-tema" value="' + esc(e.tema) + '">' +
    '<label>Recados</label><textarea id="ev-rec" rows="6" placeholder="Avisos, agenda da semana, pedidos de oração...">' + esc(e.recados) + '</textarea>' +
    '<div style="height:16px"></div><button class="btn pr" data-a="evSalvarRecados" data-v="' + esc(id) + '">Salvar</button><div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
}
function evSalvarRecados(id) { salvarEventoSrv({ id: id, tema: $('ev-tema').value.trim(), recados: $('ev-rec').value.trim() }, 'Recados salvos ✓'); }
function evFicha(id) {
  var e = eventoPor(id); if (!e) return;
  var verValor = pode('financeiro') || pode('relFin'), vis = e.visitantes || [];
  var linha = function (r, v) { return v ? '<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid #f2f2f2;font-size:13px"><span style="flex:0 0 130px;color:#888">' + r + '</span><span style="flex:1">' + v + '</span></div>' : ''; };
  abrirModal('<h2>' + esc(e.titulo) + '</h2><div class="sb" style="font-size:12.5px;color:#888;margin-bottom:8px">' + esc(e.tipo || 'Culto') + ' · ' + DIAS[parseData(e.data).getDay()] + ', ' + brCompleto(e.data) + '</div>' +
    linha('Horário', esc([e.inicio, e.fim].filter(Boolean).join(' – '))) + linha('Pregador', esc(e.pregador)) + linha('Título da palavra', esc(e.tituloPalavra)) +
    linha('Tema da ministração', esc(e.tema)) + linha('Cadastro', e.liberado ? 'liberado · ' + textoJanela(e) : 'fechado') +
    linha('Pessoas presentes', e.presentes ? esc(e.presentes) : '') + linha('Visitantes cadastrados', String(e.nVisitantes || 0)) +
    (verValor ? linha('Dízimos', moeda(valor(e.dizimo))) + linha('Ofertas', moeda(valor(e.oferta))) + linha('Outras', moeda(valor(e.outras))) + linha('Total', '<b>' + moeda(totalEvento(e)) + '</b>') : '') +
    linha('Criado por', esc(e.criadoPor)) + linha('Observações', esc(e.obs)) +
    (e.recados ? '<div class="sec" style="margin-left:0">Recados</div><div style="background:var(--cc);border-radius:10px;padding:10px;font-size:13px;white-space:pre-line">' + esc(e.recados) + '</div>' : '') +
    (vis.length ? '<div class="sec" style="margin-left:0">Visitantes cadastrados (' + vis.length + ')</div><div class="card" style="box-shadow:none;border:1px solid #eee">' + vis.map(function (x) {
      return '<div class="row"><div class="av">' + ini(x.nome) + '</div><div class="info"><div class="nm">' + esc(x.nome) + '</div><div class="sb">' + esc(separarBairroCidade(x.bairro).bairro || '—') +
        ' · ' + (x.aceitaVisita === 'Sim' ? 'aceita visita' : 'sem visita') + (x.gc ? ' · já no GC' : '') + '</div></div></div>'; }).join('') + '</div>' : '') +
    '<div class="gap"></div>' + (sbDisponivel() ? '<button class="btn pr" data-a="evChamadaCulto" data-v="' + esc(id) + '">Presença individual e escala</button><div class="gap"></div>' : '') + '<button class="btn gh" data-a="fechar">Fechar</button>');
}
function evSemana() {
  var cultos = (igr.config || {}).cultos || [], d0 = parseData(hoje()), novos = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(d0); d.setDate(d.getDate() + i);
    cultos.forEach(function (c) {
      if (String(c.dia) === '' || +c.dia !== d.getDay()) return;
      var data = isoData(d);
      if (EVS().some(function (e) { return e.data === data && (e.inicio || '') === (c.horario || ''); })) return;
      var ini = minStr(c.horario);
      novos.push({ tipo: 'Culto', titulo: c.nome || 'Culto', data: data, inicio: c.horario || '', fim: ini === null ? '' : hhmm(ini + 120), liberado: true, antes: 60, depois: 120 });
    });
  }
  if (!novos.length) return toast('Os cultos fixos dos próximos 7 dias já estão criados.');
  if (!confirm('Criar ' + novos.length + ' culto(s) com o cadastro de visitantes liberado?')) return;
  carregando(true, 'Criando cultos...');
  var p = Promise.resolve();
  novos.forEach(function (ev) { p = p.then(function () { return chamar('salvarEvento', { evento: ev }).then(function (r) { db.eventos = (db.eventos || []).concat([r.evento]); }); }); });
  p.then(function () { salvarDB(); render(); toast(novos.length + ' culto(s) criado(s) ✓'); }).catch(function (e) { toast(e.message, 4500); }).then(function () { carregando(false); });
}

/* ── configurações da igreja ── */
var cfgDraft = null, logoNovo = null, iconeNovo = null;
function mascaraCnpj(t) {
  var d = soDigitos(t).slice(0, 14), r = d;
  if (d.length > 12) r = d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-' + d.slice(12);
  else if (d.length > 8) r = d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8);
  else if (d.length > 5) r = d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5);
  else if (d.length > 2) r = d.slice(0, 2) + '.' + d.slice(2);
  return r;
}
function lerCfgForm() {
  if (!$('cf-nome')) return cfgDraft;
  var c = { nome: $('cf-nome').value.trim(), cnpj: $('cf-cnpj').value.trim(), fundacao: $('cf-fund').value, pastorPresidente: $('cf-pastor').value.trim(), cultos: [],
    endereco: { cep: mascaraCep($('cf-cep').value), rua: $('cf-endereco').value.trim(), numero: $('cf-numero').value.trim(), complemento: $('cf-complemento').value.trim(),
                bairro: $('cf-bairro').value.trim(), cidade: $('cf-cidade').value.trim() },
    bairros: ((cfgDraft && cfgDraft.bairros) || (igr.config && igr.config.bairros) || []).slice(),
    cor: $('cf-cor') ? $('cf-cor').value : ((cfgDraft && cfgDraft.cor) || ''),
    encarregado: $('cf-encarregado') ? $('cf-encarregado').value.trim() : ((cfgDraft && cfgDraft.encarregado) || ''),
    politica: $('cf-politica') ? $('cf-politica').value : (cfgDraft ? cfgDraft.politica : undefined),
    politicaModelo: cfgDraft ? cfgDraft.politicaModelo : '' };
  var rows = document.querySelectorAll('.cf-culto');
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    c.cultos.push({ dia: r.querySelector('.cf-dia').value, horario: r.querySelector('.cf-hora').value, nome: r.querySelector('.cf-nomec').value.trim() });
  }
  return c;
}
function rConfig() {
  if (!pode('config')) return '<div class="empty">Sem permissão.</div>';
  if (!cfgDraft) { var b = igr.config || {}; cfgDraft = { nome: b.nome || '', cnpj: b.cnpj || '', fundacao: b.fundacao || '', pastorPresidente: b.pastorPresidente || '', cultos: (b.cultos || []).slice(),
    endereco: JSON.parse(JSON.stringify(b.endereco || {})), bairros: (b.bairros || []).slice(), encarregado: b.encarregado || '', cor: b.cor || '' }; }
  if (cfgDraft.politica === undefined && !cfgDraft._polCarregando) {
    cfgDraft._polCarregando = true;
    chamarBruto({ acao: 'politica' }).then(function (r) {
      if (!cfgDraft) return;
      cfgDraft.politica = r && r.ok ? r.texto : ''; cfgDraft.politicaModelo = r && r.ok && r.modelo ? r.texto : (cfgDraft.politicaModelo || '');
      if (r && r.ok && r.modelo) cfgDraft.politicaModelo = r.texto;
      if (cfg.aba === 'config') render();
    }).catch(function () { if (cfgDraft) cfgDraft.politica = ''; });
  }
  var c = cfgDraft, logo = logoNovo === '__remover__' ? '' : (logoNovo || igr.logo), icone = iconeNovo === '__remover__' ? '' : (iconeNovo || igr.icone);
  return '' +
    '<div class="card"><h3>Dados da igreja</h3>' +
    '<div class="g2" style="align-items:start">' +
    '<div><label>Logo (tela de login)</label><div class="fotoprev" data-a="escolherLogo" id="cf-logoprev" style="height:120px;background-size:contain;background-color:#F0F1F4;' +
      (logo ? 'background-image:url(\'' + logo + '\');border:none;color:transparent' : '') + '">Toque para escolher</div>' +
      (logo ? '<div style="text-align:right;margin-top:6px"><span class="pill p-cinza" data-a="removerLogo" style="cursor:pointer">remover</span></div>' : '') +
      '<div style="font-size:10.5px;color:#999;margin-top:4px;line-height:1.4">PNG, de preferência com fundo transparente. Formato livre (horizontal ou quadrado).</div></div>' +
    '<div><label>Ícone (barra e telas internas)</label><div class="fotoprev" data-a="escolherIcone" id="cf-iconeprev" style="height:120px;width:120px;margin:0 auto;border-radius:24px;background-size:cover;background-color:#F0F1F4;' +
      (icone ? 'background-image:url(\'' + icone + '\');border:none;color:transparent' : '') + '">Toque para escolher</div>' +
      (icone ? '<div style="text-align:right;margin-top:6px"><span class="pill p-cinza" data-a="removerIcone" style="cursor:pointer">remover</span></div>' : '') +
      '<div style="font-size:10.5px;color:#999;margin-top:4px;line-height:1.4">Imagem quadrada (é recortada no centro). Aparece na barra superior, nos GCs sem foto e na aba do navegador.</div></div></div>' +
    '<div style="font-size:11px;color:#888;margin-top:8px;line-height:1.5">Depois de salvar, o nome e as imagens da igreja passam a aparecer para todos. Sem ícone, o app usa o logo; sem os dois, usa o 2Gather.</div>' +
    '<label>Cor da igreja</label><div class="cores">' + CORES_SUGERIDAS.map(function (k) {
      return '<span data-a="cfCor" data-v="' + k + '" style="background:' + k + '" class="' + (String(c.cor || COR_PADRAO).toUpperCase() === k ? 'on' : '') + '"></span>';
    }).join('') + '<input type="color" id="cf-cor" value="' + esc(c.cor || COR_PADRAO) + '" title="Outra cor"></div>' +
    '<div style="font-size:11px;color:#888;margin-top:4px">Cor de destaque de botões, ícones e marcações para todos os usuários. Padrão: azul.</div>' +
    '<label>Nome da igreja</label><input id="cf-nome" value="' + esc(c.nome) + '" placeholder="Ex.: Viver Church Matão">' +
    '<div class="g2"><div><label>CNPJ</label><input id="cf-cnpj" inputmode="numeric" value="' + esc(c.cnpj) + '" placeholder="00.000.000/0000-00"></div>' +
    '<div><label>Data de fundação</label><input id="cf-fund" type="date" value="' + esc(c.fundacao) + '"></div></div>' +
    '<label>Pastor presidente</label><input id="cf-pastor" value="' + esc(c.pastorPresidente) + '"></div>' + blocoConfigEndereco(c) +
    '<div class="card"><h3>Horários de culto</h3>' + (c.cultos.length ? c.cultos.map(function (x, i) {
      return '<div class="cf-culto" style="border:1.5px solid #eee;border-radius:12px;padding:4px 10px 10px;margin-bottom:8px">' +
        '<div class="g2"><div><label>Dia</label><select class="cf-dia">' + opts(DIAS.map(function (d, j) { return [String(j), d]; }), x.dia) + '</select></div>' +
        '<div><label>Hora</label><input class="cf-hora" type="time" value="' + esc(x.horario) + '"></div></div>' +
        '<label>Nome do culto</label><div style="display:flex;gap:8px"><input class="cf-nomec" value="' + esc(x.nome) + '" placeholder="Culto da Família">' +
        '<button class="btn dg sm" data-a="cfRemCulto" data-v="' + i + '" style="padding:0 14px">×</button></div></div>';
    }).join('') : '<div class="empty" style="padding:10px">Nenhum culto fixo cadastrado.</div>') +
    '<button class="btn gh sm" data-a="cfAddCulto">+ Adicionar horário</button>' +
    '<div style="font-size:11px;color:#999;margin-top:8px">Usados para criar os cultos da semana com um toque, na aba Cultos.</div></div>' +
    '<div class="card"><h3>Privacidade e LGPD</h3>' +
    '<label>Responsável pelos dados (encarregado) — nome e contato</label><input id="cf-encarregado" value="' + esc(c.encarregado) + '" placeholder="Ex.: Maria Souza · (16) 99999-0000 · dados@igreja.org">' +
    '<label>Política de privacidade</label>' +
    (c.politica === undefined ? '<div class="empty" style="padding:10px">Carregando...</div>'
      : '<textarea id="cf-politica" rows="12" style="font-size:13px;line-height:1.5">' + esc(c.politica) + '</textarea>') +
    '<div style="font-size:11px;color:#999;margin-top:6px;line-height:1.5">É um <b>modelo</b> — revise com um advogado antes de divulgar. Ao alterar o texto, todos os usuários precisarão aceitar a nova versão no próximo acesso.</div>' +
    (c.politicaModelo ? '<div style="text-align:right;margin-top:6px"><span class="pill p-cinza" data-a="cfModeloPolitica" style="cursor:pointer">restaurar modelo</span></div>' : '') + '</div>' +
    '<button class="btn pr" data-a="cfSalvar">Salvar configurações</button>';
}
function processarLogo(file) {
  if (!file) return;
  var fr = new FileReader();
  fr.onload = function () {
    var img = new Image();
    img.onload = function () {
      var max = 360, url = '';
      for (var t = 0; t < 7; t++) {
        var k = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        url = cv.toDataURL('image/png');
        if (url.length > 45000) url = cv.toDataURL('image/jpeg', 0.8);
        if (url.length < 45000) break;
        max = Math.round(max * 0.8);
      }
      if (url.length >= 45000) return toast('Não foi possível reduzir este logo. Tente outra imagem.');
      cfgDraft = lerCfgForm(); logoNovo = url; render();
    };
    img.onerror = function () { toast('Arquivo de imagem inválido.'); };
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
}
function cfSalvar() {
  var c = lerCfgForm();
  c.cultos = c.cultos.filter(function (x) { return x.horario || x.nome; });
  if (logoNovo) c.logo = logoNovo;
  if (iconeNovo) c.icone = iconeNovo;
  delete c.politicaModelo; delete c._polCarregando;
  var icF = iconeNovo === '__remover__' ? '' : (iconeNovo || igr.icone), lgF = logoNovo === '__remover__' ? '' : (logoNovo || igr.logo);
  var srcFav = (iconeNovo || logoNovo) ? (icF || lgF) : '';      // ícone da aba só é regerado quando alguma imagem muda
  if (srcFav && !c._favOk) {
    return gerarFavicon(srcFav).then(function (f) { c.favicon = f; c._favOk = 1; enviarCfg(c); }).catch(function () { c._favOk = 1; enviarCfg(c); });
  }
  enviarCfg(c);
}
function gerarFavicon(src) {
  return new Promise(function (res, rej) {
    var img = new Image();
    img.onload = function () {
      var cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
      var cx = cv.getContext('2d'), k = Math.min(64 / img.width, 64 / img.height), w = img.width * k, h = img.height * k;
      cx.drawImage(img, (64 - w) / 2, (64 - h) / 2, w, h);
      res(cv.toDataURL('image/png'));
    };
    img.onerror = rej; img.src = src;
  });
}
function enviarCfg(c) {
  delete c._favOk;
  if (c.politica === undefined) delete c.politica;
  var verAntes = (igr.config || {}).politicaV;
  carregando(true, 'Salvando...');
  var opCfg=(sbDisponivel()&&!logoNovo&&!iconeNovo)?v39ConfigSalvar(c):chamar('salvarConfig', { config: c }, function (i, n) { $('carregando-txt').textContent = 'Enviando logo ' + i + '/' + n + '...'; });
  opCfg.then(function (r) {
    igr.config = r.config;
    if (logoNovo === '__remover__') { igr.logo = ''; igr.logoV = ''; } else if (logoNovo) { igr.logo = logoNovo; igr.logoV = r.config.logoV; }
    if (iconeNovo === '__remover__') { igr.icone = ''; igr.iconeV = ''; } else if (iconeNovo) { igr.icone = iconeNovo; igr.iconeV = r.config.iconeV; }
    salvarIgr(); aplicarLogo(); logoNovo = null; iconeNovo = null; cfgDraft = null;
    toast(r.config.politicaV !== verAntes ? 'Configurações salvas ✓ — nova versão da política: todos aceitarão no próximo acesso' : 'Configurações salvas ✓', 4500); render();
    if (r.config.politicaV !== verAntes) { cfg.usuario.consent = false; salvarCfg(); setTimeout(verificarConsentimento, 600); }
  }).catch(function (e) { toast(e.message, 4500); }).then(function () { carregando(false); });
}

/* ── encontro do GC (criado sozinho no dia; o líder completa os dados) ── */
function hojeEhEncontro(g) { return !!g && g.diaSemana !== '' && g.diaSemana != null && +g.diaSemana === new Date().getDay(); }
function diaEncontroHoje(gcId) { return encAbertoGC(achaEnc(gcId, hoje())); }
function garantirEncontroHoje(g) { return g ? achaEnc(g.id, hoje()) : null; }
function blocoEncontroHoje(g) {
  var e = garantirEncontroHoje(g);
  if (!e) {
    if (g && pode('gcEvento') && hojeEhEncontro(g))
      return '<div class="card" style="border-left:5px solid var(--amarelo)"><b>Hoje é dia de encontro.</b><div style="font-size:12.5px;color:#666;margin-top:4px;line-height:1.5">Crie o encontro (tema, escala) para liberar a chamada aos discípulos.</div>' +
        '<div class="gap"></div><button class="btn pr sm" data-a="encEditar" data-v="' + esc(hoje()) + '">Criar encontro de hoje</button></div>';
    return '';
  }
  var falta = [];
  if (!e.anfitriao) falta.push('pregador'); if (!e.tema) falta.push('tema');
  return '<div class="card" style="border-left:5px solid var(--dourado)"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">' +
    '<div><div style="font-size:11px;color:#888;font-weight:800;letter-spacing:.6px">ENCONTRO DE HOJE' + (e.horario ? ' · ' + esc(e.horario) : '') + '</div>' +
    '<div style="font-size:13px;color:#444;margin-top:4px;line-height:1.55">' +
    '<b>Pregador:</b> ' + esc(e.anfitriao || '—') + '<br><b>Tema:</b> ' + esc(e.tema || '—') + '<br><b>Presentes:</b> ' + presentes(e) + '</div></div>' +
    '<span class="pill ' + (falta.length ? 'p-amarelo' : 'p-verde') + '">' + (falta.length ? 'falta ' + falta.join(' e ') : 'dados completos') + '</span></div>' +
    (e.recados ? '<div style="background:var(--cc);border-radius:10px;padding:9px 10px;font-size:12.5px;margin-top:8px;white-space:pre-line"><b>Recados:</b> ' + esc(e.recados) + '</div>' : '') +
    '<div style="display:flex;gap:7px;margin-top:10px;flex-wrap:wrap">' +
    (pode('gcEvento') ? '<button class="btn pr sm" data-a="encEditar" data-v="' + esc(e.data) + '">Editar encontro e escala</button>' : '') +
    (podeChamada(e) ? '<button class="btn gh sm" data-a="encChamada" data-v="' + esc(e.data) + '">Fazer chamada</button>'
      : '<span class="pill p-cinza">chamada ' + textoJanelaGC(e) + '</span>') + '</div></div>';
}
function encEditar(data) {
  var g = gcPor(gcA()), e = achaEnc(gcA(), data);
  if (!e) { e = { data: data, gcId: gcA(), tema: '', anfitriao: '', presencas: {}, lista: { add: [], rem: [] }, horario: (g && g.horario) || '', recados: '', deleted: false }; db.encontros.push(e); }
  abrirModal('<h2>Dados do encontro</h2><div class="sb" style="font-size:12.5px;color:#888">' + esc(gcNome(gcA())) + ' · ' + brCompleto(data) + '</div>' +
    '<div class="g2"><div><label>Horário</label><input id="en-hora" type="time" value="' + esc(e.horario) + '"></div>' +
    '<div><label>Pregador</label><input id="en-preg" value="' + esc(e.anfitriao) + '"></div></div>' +
    '<label>Tema / estudo</label><input id="en-tema" value="' + esc(e.tema) + '">' +
    '<label>Recados</label><textarea id="en-rec" rows="3">' + esc(e.recados) + '</textarea>' + escalaCampos(e, gcA()) +
    (data > hoje() ? '<input type="hidden" id="en-diz" value=""><input type="hidden" id="en-ofe" value="">'
      : '<div class="g2"><div><label>Dízimos (R$)</label><input id="en-diz" inputmode="decimal" value="' + esc(campoMoeda(e.dizimo)) + '" placeholder="0,00"></div>' +
        '<div><label>Ofertas (R$)</label><input id="en-ofe" inputmode="decimal" value="' + esc(campoMoeda(e.oferta)) + '" placeholder="0,00"></div></div>') +
    '<div style="height:16px"></div><button class="btn pr" data-a="encSalvar" data-v="' + esc(data) + '">Salvar</button><div class="gap"></div><button class="btn gh" data-a="fechar">Fechar</button>' +
    (data > hoje() ? '<div class="gap"></div><button class="btn dg" data-a="encCancelar" data-v="' + esc(data) + '">Cancelar este encontro</button>' : ''));
}
function encSalvar(data) {
  var e = achaEnc(gcA(), data); if (!e) return;
  var escNova = lerEscala(), novos = novosNaEscala(e.escala, escNova);
  e.escala = escNova;
  e.horario = $('en-hora').value; e.anfitriao = $('en-preg').value.trim(); e.tema = $('en-tema').value.trim(); e.recados = $('en-rec').value.trim();
  if (!e.anfitriao && escNova.pregador) e.anfitriao = nomeEquipe(gcA(), escNova.pregador);
  e.dizimo = valor($('en-diz').value) ? String(valor($('en-diz').value)) : ''; e.oferta = valor($('en-ofe').value) ? String(valor($('en-ofe').value)) : '';
  e.updatedAt = agora(); e._pend = true; chDraft = null;
  cfg.dataChamada = data; cfg.dataChamadaGC = gcA(); salvarCfg();
  salvarDB(); fechar(); render(); sincronizar(false); toast('Encontro salvo ✓');
  if (novos.length) setTimeout(function () { avisarEscalaModal(data, novos); }, 350);
}

/* ── visão geral da igreja (painel do pastor) ── */
function blocoVisaoIgreja(gcs, enxuto) {
  var ids = gcs.map(function (g) { return g.id; }), at = function (p) { return p.status === 'Ativo' || p.status === 'Em visita'; };
  var todas = PES().filter(at);
  var nosGC = todas.filter(function (p) { return p.gcId && ids.indexOf(p.gcId) >= 0; }), semGC = todas.filter(function (p) { return !p.gcId; });
  // visitante = ainda em visita; quem passou a Ativo (3 presenças ou Lar de Vida concluído) conta como membro
  var ehMembro = function (p) { return p.status === 'Ativo'; };
  var mem = todas.filter(ehMembro).length, vis = todas.length - mem;
  // números macro da igreja (não só dos GCs)
  var P = periodoBI();
  var membrosAtivos = PES().filter(function (p) { return p.status === 'Ativo'; }).length;
  var visIgreja = function (f) { return PES().filter(function (p) { return p.origem === 'visita igreja' && f(p.prim); }).length; };
  var entradas = function (f) {
    var t = 0;
    EVS().forEach(function (e) { if (f(e.data)) t += totalEvento(e); });
    ENC().forEach(function (e) { if (ids.indexOf(e.gcId) >= 0 && f(e.data)) t += valor(e.dizimo) + valor(e.oferta); });
    return t;
  };
  var vMes = visIgreja(P.noPer), vAnt = visIgreja(P.noAnt);
  var verFin = pode('relFin'), eMes = verFin ? entradas(P.noPer) : 0, eAnt = verFin ? entradas(P.noAnt) : 0;
  var novosMem = PES().filter(function (p) { return p.status === 'Ativo' && P.noPer(p.prim); }).length;
  var comp = function (a, b, din) {
    if (!b) return '';
    var d = Math.round((a - b) / b * 100);
    return '<br><span style="font-size:10.5px;color:' + (d >= 0 ? 'var(--verde)' : 'var(--vermelho)') + '">' + (d >= 0 ? '▲ ' : '▼ ') + Math.abs(d) + '% vs ' + esc(P.antRot) +
      ' (' + (din ? moedaCurta(b) : b) + ')</span>';
  };
  var h = (enxuto ? '' : '<div class="sec">Visão geral da igreja</div>') + '<div class="kpis">' +
    kpi(membrosAtivos, 'Membros ativos cadastrados' + (novosMem ? '<br><span style="font-size:10.5px;color:#bbb">' + novosMem + ' com 1ª participação no período</span>' : ''), 'dk') +
    kpi(vMes, 'Visitantes da igreja — ' + esc(P.rot) + comp(vMes, vAnt, false)) +
    kpi(nosGC.length, 'Pessoas em GCs') +
    kpi(verFin ? moedaCurta(eMes) : '—', (verFin ? 'Total de entradas — ' + esc(P.rot) + ' (cultos + GCs)' + comp(eMes, eAnt, true) : 'Total de entradas (sem acesso ao financeiro)')) + '</div>' +
    '<details style="font-size:11.5px;color:#666;line-height:1.55;margin:6px 4px 0"><summary style="cursor:pointer;font-weight:700;color:#555">ⓘ Como é calculado</summary><div style="margin-top:6px">' +
    '• <b>Período:</b> os números com período usam o filtro do topo; a comparação é com o período anterior de mesma duração.<br>' +
    '• <b>Membros ativos e Pessoas em GCs:</b> retrato de hoje (não mudam com o período).<br>' +
    '• <b>Visitantes da igreja:</b> origem “visita igreja” com 1ª participação no período. Visitantes de GC não entram.<br>' +
    '• <b>Total de entradas:</b> dízimos, ofertas e outras entradas dos cultos/eventos + valores lançados nos encontros dos GCs, no período.' +
    (semGC.length ? '<br>• Há <b>' + semGC.length + '</b> pessoa(s) ativa(s) ainda sem GC.' : '') + '</div></details>';
  // presença separada: GCs e cultos/eventos
  h += graficoGCSemanas(ids, 'Presença nos GCs — ' + P.rot, P);
  h += graficoCultos('Presença nos cultos e eventos — ' + P.rot, P);
  // GCs: membros e visitantes (só em Relatórios)
  if (!enxuto) h += '<div class="sec">GCs — membros e visitantes</div><div class="card" style="padding:8px 10px;overflow-x:auto"><table class="tbl"><tr><th>GC</th>' +
    '<th style="text-align:right">Membros</th><th style="text-align:right">Visitantes</th><th style="text-align:right">Lar de Vida</th></tr>' +
    gcs.map(function (g) {
      var ps = PES(g.id).filter(at), m2 = ps.filter(ehMembro).length;
      return { g: g, m: m2, v: ps.length - m2, lv: ps.filter(function (p) { return p.lvStatus === 'acompanhando'; }).length };
    }).sort(function (a, b) { return (b.m + b.v) - (a.m + a.v); }).map(function (x) {
      return '<tr class="cl" data-a="abrirGC" data-v="' + esc(x.g.id) + '"><td><b>' + esc(x.g.nome) + '</b><div style="font-size:10.5px;color:#999">' + esc(x.g.tipoGC || '') + '</div></td>' +
        '<td class="n">' + x.m + '</td><td class="n">' + x.v + '</td><td class="n">' + x.lv + '</td></tr>';
    }).join('') + '<tr><td><b>Total</b></td><td class="n">' + nosGC.filter(ehMembro).length + '</td><td class="n">' + nosGC.filter(function (p) { return !ehMembro(p); }).length +
    '</td><td class="n">' + nosGC.filter(function (p) { return p.lvStatus === 'acompanhando'; }).length + '</td></tr></table></div>';
  // Lar de Vida (só em Relatórios)
  if (!enxuto) {
  var visitas = 0, visMes = 0, emCasa = 0, ac = 0, enc = 0, fic = 0;
  PES().forEach(function (p) {
    lvVis(p).forEach(function (v) { if (v.realizada === 'Sim') { visitas++; if (P.noPer(v.data)) { visMes++; if (v.estava === 'Sim') emCasa++; } } });
    if (p.lvStatus === 'acompanhando') ac++;
    if (p.lvStatus === 'encerrado' && P.noPer(p.lvEncerradoEm)) { enc++; if (p.lvResultado === 'Ficou') fic++; }
  });
  h += '<div class="sec">Lar de Vida</div><div class="card"><div class="mini" style="margin:0 0 10px">' +
    '<div><b>' + visMes + '</b><span>visitas no período</span></div><div><b>' + visitas + '</b><span>visitas (total)</span></div>' +
    '<div><b>' + ac + '</b><span>casas ativas</span></div><div><b>' + (enc ? pct(fic / enc) : '—') + '</b><span>conversão</span></div></div>' +
    barra('Acompanhamentos encerrados no período', enc, Math.max(enc, 1)) + barra('Viraram membros (ficaram)', fic, Math.max(enc, 1), 'var(--verde)') +
    '<div style="font-size:11px;color:#999">Conversão = ficaram ÷ acompanhamentos encerrados no período. Casas ativas = hoje. ' + emCasa + ' visita(s) do período com a pessoa em casa.</div></div>';
  }
  // arrecadação cultos + GCs
  if (pode('relFin')) {
    var meses = mesesDoPeriodo(P, 6), por = meses.map(function (m) {
      var c = 0, g = 0, n = 0, pr = 0, np = 0;
      EVS().forEach(function (e) { if (String(e.data).slice(0, 7) !== m) return; c += totalEvento(e); if (e.presentes) { pr += +e.presentes; np++; } });
      ids.forEach(function (id) { g += financeiro(id, m).tot; });
      return { c: c, g: g, t: c + g, pm: np ? pr / np : 0 };
    });
    var mx = 1; por.forEach(function (x) { if (x.t > mx) mx = x.t; });
    var atual = { c: 0, g: 0, t: 0, pm: 0 }, pr = 0, np = 0;
    EVS().forEach(function (e) { if (!P.noPer(e.data)) return; atual.c += totalEvento(e); if (e.presentes) { pr += +e.presentes; np++; } });
    ENC().forEach(function (e) { if (P.noPer(e.data) && ids.indexOf(e.gcId) >= 0) atual.g += valor(e.dizimo) + valor(e.oferta); });
    atual.t = atual.c + atual.g; atual.pm = np ? pr / np : 0;
    var ateAno = P.ate < hoje() ? P.ate : hoje(), ano = ateAno.slice(0, 4), anoTot = 0;
    EVS().forEach(function (e) { if (String(e.data).slice(0, 4) === ano && e.data <= ateAno) anoTot += totalEvento(e); });
    ENC().forEach(function (e) { if (String(e.data).slice(0, 4) === ano && e.data <= ateAno && ids.indexOf(e.gcId) >= 0) anoTot += valor(e.dizimo) + valor(e.oferta); });
    h += '<div class="sec">Arrecadação — cultos e GCs</div><div class="card"><div class="kpis" style="margin-bottom:6px">' +
      kpi(moeda(atual.t), 'Total — ' + esc(P.rot), 'dk') + kpi(moeda(anoTot), 'Acumulado ' + ano + ' até ' + br(ateAno)) +
      kpi(moeda(atual.c), 'Cultos e eventos') + kpi(moeda(atual.g), 'GCs') + '</div>' +
      '<div class="spark" style="margin-top:24px">' + por.map(function (x, i) {
        return '<div style="height:' + Math.max(3, x.t / mx * 100) + '%;background:linear-gradient(to top,var(--dourado) ' + (x.t ? x.c / x.t * 100 : 0) + '%,#111 ' + (x.t ? x.c / x.t * 100 : 0) + '%);' +
          (x.t ? '' : 'background:#e5e5e5') + '"><b>' + (x.t ? moedaCurta(x.t).replace('R$ ', '') : '') + '</b><u>' + nomeMes(meses[i]) + '</u></div>';
      }).join('') + '</div><div class="leg" style="margin-top:22px"><span><i class="dot" style="background:var(--dourado)"></i>Cultos</span><span><i class="dot" style="background:#111"></i>GCs</span>' +
      (atual.pm ? '<span>Média de presentes nos cultos do período: <b>' + Math.round(atual.pm) + '</b></span>' : '') + '</div></div>';
  }
  if (!enxuto) h += blocoMapa(ids, 'Distribuição geográfica — pessoas e GCs', { semGC: true, gcs: true });
  else if (pode('relFin')) h += '<div class="gap"></div><button class="btn gh" data-a="aba" data-v="financeiro">Abrir o consolidado financeiro</button>';
  return h;
}

/* ═══════════════════ v17: BAIRROS PADRONIZADOS, CONSULTA DE PESSOAS, GRÁFICOS DE PRESENÇA ═══════════════════ */

/* ── bairros da cidade (lista das Configurações) ── */
function enderecoIgreja() { return (igr.config && igr.config.endereco) || {}; }
function cidadeIgreja() { return enderecoIgreja().cidade || 'Matão/SP'; }
function listaBairros() { return ((igr.config && igr.config.bairros) || []).slice(); }
function bairroDaLista(nome) {
  var n = normalizar(nome); if (!n) return '';
  var l = listaBairros();
  for (var i = 0; i < l.length; i++) if (normalizar(l[i]) === n) return l[i];
  return '';
}
/** Campo de bairro: lista para escolher (padronizado) + "outro" para digitar. O valor fica sempre em #px-bairro. */
function campoBairro(px, valor, obrig, dis, ph) {
  var l = listaBairros(), rot = '<label>Bairro' + (obrig ? ' *' : '') + '</label>';
  if (!l.length) return rot + '<input id="' + px + '-bairro" value="' + esc(valor) + '" placeholder="' + (ph || 'Ex.: Bela Vista') + '"' + (dis || '') + '>';
  var achado = bairroDaLista(valor), outro = !!valor && !achado;
  return rot + '<select id="' + px + '-bairrosel"' + (dis || '') + '><option value="">— selecionar —</option>' +
    l.map(function (b) { return '<option value="' + esc(b) + '"' + (b === achado ? ' selected' : '') + '>' + esc(b) + '</option>'; }).join('') +
    '<option value="__outro__"' + (outro ? ' selected' : '') + '>Outro bairro / outra cidade…</option></select>' +
    '<input id="' + px + '-bairro" class="' + (outro ? '' : 'hide') + '" style="margin-top:6px" value="' + esc(achado || valor || '') + '" placeholder="Digite o bairro"' + (dis || '') + '>';
}
/** Mantém a lista e o campo de texto em sincronia (ex.: depois do CEP preencher o bairro). */
function bairroSync(px) {
  var sel = $(px + '-bairrosel'), inp = $(px + '-bairro');
  if (!sel || !inp) return;
  var achado = bairroDaLista(inp.value);
  if (achado) { sel.value = achado; inp.value = achado; inp.classList.add('hide'); }
  else if (inp.value.trim()) { sel.value = '__outro__'; inp.classList.remove('hide'); }
  else { sel.value = ''; inp.classList.add('hide'); }
}
function bairroEscolhido(sel) {
  var px = sel.id.replace('-bairrosel', ''), inp = $(px + '-bairro'); if (!inp) return;
  if (sel.value === '__outro__') { inp.value = ''; inp.classList.remove('hide'); inp.focus(); }
  else { inp.value = sel.value; inp.classList.add('hide'); }
  if (px === 'v' && lvModoCad === 'membro') lvAtualizarGC();
}
/** "jardim são josé" → "Jardim São José" (preposições em minúsculo). */
function tituloBairro(t) {
  var pequenas = { de: 1, da: 1, do: 1, das: 1, dos: 1, e: 1 };
  return String(t || '').trim().replace(/\s+/g, ' ').toLowerCase().split(' ').map(function (w, i) {
    if (i > 0 && pequenas[w]) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}
/** Bairros já usados nos cadastros (pessoas e GCs) da cidade da igreja, com a grafia mais usada. */
function bairrosDosCadastros() {
  var cid = chaveCidade(cidadeIgreja()), cont = {};
  var add = function (bairro, cidade) {
    var e = separarBairroCidade(bairro, cidade);
    if (!e.bairro || chaveCidade(e.cidade || cidadeIgreja()) !== cid) return;
    var nome = tituloBairro(bairroPorExtenso(e.bairro)), k = normalizar(nome);
    cont[k] = cont[k] || {}; cont[k][nome] = (cont[k][nome] || 0) + 1;
  };
  PES().forEach(function (p) { add(p.bairro, p.cidade); });
  GCS().forEach(function (g) { add(g.bairro, g.cidade); });
  return Object.keys(cont).map(function (k) {
    var v = cont[k]; return Object.keys(v).sort(function (a, b) { return v[b] - v[a]; })[0];
  });
}
/** Corrige a grafia dos cadastros para o nome da lista (ex.: "jd bela vista" → "Jardim Bela Vista"). */
function corrigirGrafiaBairros() {
  var n = 0;
  PES().forEach(function (p) {
    var e = separarBairroCidade(p.bairro, p.cidade);
    if (!e.bairro || chaveCidade(e.cidade || cidadeIgreja()) !== chaveCidade(cidadeIgreja())) return;
    var certo = bairroDaLista(bairroPorExtenso(e.bairro));
    if (certo && (certo !== p.bairro || !p.cidade)) {
      p.bairro = certo; if (!p.cidade) p.cidade = cidadeIgreja();
      p.updatedAt = agora(); p._pend = true; n++;
    }
  });
  if (!n) return toast('Nenhum cadastro precisou de correção.');
  salvarDB(); sincronizar(false); render();
  toast(n + ' cadastro(s) com a grafia do bairro corrigida ✓', 4000);
}

/* ── configurações: endereço da igreja + lista de bairros ── */
function blocoConfigEndereco(c) {
  var e = c.endereco || {};
  return '<div class="card"><h3>Endereço da igreja</h3>' +
    '<div style="font-size:11.5px;color:#888;margin-bottom:2px">A cidade da igreja é a referência para a lista de bairros e para os cadastros novos.</div>' +
    '<label>CEP</label><input id="cf-cep" inputmode="numeric" maxlength="9" placeholder="00000-000" value="' + esc(mascaraCep(e.cep)) + '">' +
    '<div id="cf-cepinfo" style="font-size:11.5px;margin-top:5px;line-height:1.4"></div>' +
    '<label>Rua</label><input id="cf-endereco" value="' + esc(e.rua) + '">' +
    '<div class="g2"><div><label>Número</label><input id="cf-numero" value="' + esc(e.numero) + '"></div>' +
    '<div><label>Complemento</label><input id="cf-complemento" value="' + esc(e.complemento) + '"></div></div>' +
    '<div class="g2"><div><label>Bairro</label><input id="cf-bairro" value="' + esc(e.bairro) + '"></div>' +
    '<div><label>Cidade</label><input id="cf-cidade" value="' + esc(e.cidade || 'Matão/SP') + '"></div></div></div>' +
    '<div class="card"><h3>Bairros de ' + esc(e.cidade || 'Matão/SP') + ' (' + (c.bairros || []).length + ')</h3>' +
    '<div style="font-size:11.5px;color:#888;line-height:1.5">Nos cadastros, voluntários e discípulos escolhem o bairro desta lista em vez de digitar — evita nomes repetidos com grafias diferentes no mapa.</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:6px;margin:10px 0;max-height:220px;overflow-y:auto">' +
    ((c.bairros || []).length ? c.bairros.map(function (b, i) {
      return '<span class="pill p-dour" style="font-size:12px;padding:5px 6px 5px 10px">' + esc(b) +
        ' <b data-a="cfRemBairro" data-v="' + i + '" style="cursor:pointer;margin-left:4px;color:#8a5b00">×</b></span>';
    }).join('') : '<div class="empty" style="padding:8px">Nenhum bairro cadastrado ainda.</div>') + '</div>' +
    '<label>Adicionar bairros (um por linha)</label><textarea id="cf-novosbairros" rows="3" placeholder="Bela Vista&#10;Centro&#10;Jardim Paraíso"></textarea>' +
    '<div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:8px">' +
    '<button class="btn gh sm" data-a="cfAddBairros">+ Adicionar</button>' +
    '<button class="btn gh sm" data-a="cfImportBairros">Importar dos cadastros</button>' +
    '<button class="btn gh sm" data-a="cfCorrigirBairros">Corrigir grafia nos cadastros</button></div>' +
    '<div style="font-size:11px;color:#999;margin-top:6px">“Importar” traz os bairros já usados nas pessoas e GCs. Depois de salvar, “Corrigir grafia” ajusta os cadastros antigos para o nome da lista.</div></div>';
}
function cfAddBairros() {
  cfgDraft = lerCfgForm();
  var novos = String($('cf-novosbairros').value || '').split(/[\n;]+/).map(function (x) { return tituloBairro(bairroPorExtenso(x.trim())); }).filter(Boolean);
  var ja = {}; (cfgDraft.bairros || []).forEach(function (b) { ja[normalizar(b)] = 1; });
  var n = 0; novos.forEach(function (b) { if (!ja[normalizar(b)]) { cfgDraft.bairros.push(b); ja[normalizar(b)] = 1; n++; } });
  cfgDraft.bairros.sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  render(); toast(n ? n + ' bairro(s) adicionado(s). Lembre de salvar.' : 'Nenhum bairro novo.');
}
function cfImportBairros() {
  cfgDraft = lerCfgForm();
  var ja = {}; (cfgDraft.bairros || []).forEach(function (b) { ja[normalizar(b)] = 1; });
  var n = 0; bairrosDosCadastros().forEach(function (b) { if (!ja[normalizar(b)]) { cfgDraft.bairros.push(b); ja[normalizar(b)] = 1; n++; } });
  cfgDraft.bairros.sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  render(); toast(n ? n + ' bairro(s) importado(s) dos cadastros. Revise e salve.' : 'Nenhum bairro novo nos cadastros.');
}

/* ── consulta de pessoas (pastor, secretaria, master) ── */
/* ── gráficos empilhados: membros × visitantes ── */
function graficoPilha(itens, nota) {
  var mx = 1; itens.forEach(function (x) { if (x.m + x.v > mx) mx = x.m + x.v; });
  return '<div class="pilha">' + itens.map(function (x) {
    var t = x.m + x.v, alt = t ? Math.max(4, t / mx * 100) : 3;
    return '<div class="col" title="' + esc(x.tit || '') + '"><div class="stk" style="height:' + alt + '%">' +
      (t ? '<i style="height:' + (x.m / t * 100) + '%;background:#111"></i><i style="height:' + (x.v / t * 100) + '%;background:var(--dourado)"></i>' : '') +
      '</div><b style="bottom:calc(' + alt + '% + 2px)">' + (t ? t + (x.semConta ? '*' : '') : '') + '</b><u>' + esc(x.rot) + '</u></div>';
  }).join('') + '</div><div class="leg" style="margin-top:20px"><span><i class="dot" style="background:#111"></i>Membros</span>' +
    '<span><i class="dot" style="background:var(--dourado)"></i>Visitantes</span>' + (nota ? '<span style="color:#999;font-weight:500">' + nota + '</span>' : '') + '</div>';
}
/** Ordem de presença de cada pessoa (para saber se, naquele encontro, ainda era visitante). */
function mapaPresencas() {
  var m = {};
  encOrd().forEach(function (e) { for (var k in e.presencas) if (e.presencas[k] === 'P') (m[k] = m[k] || []).push(e.data); });
  return m;
}
function contaMV(e, mp) {
  var r = { m: 0, v: 0 };
  for (var k in e.presencas) {
    if (e.presencas[k] !== 'P') continue;
    var p = pessoaPor(k), ord = (mp[k] || []).indexOf(e.data);
    var vis = p && p.tipo === 'Visitante' && (p.status === 'Em visita' || (ord >= 0 && ord < VISITAS_PARA_ATIVO - 1));
    if (vis) r.v++; else r.m++;
  }
  return r;
}
function graficoGCSemanas(gcIds, titulo, P) {
  var semanas = [], mp = mapaPresencas(), por = {}, gcsSem = {};
  var fim = P ? (P.ate < hoje() ? P.ate : hoje()) : hoje(), d0 = parseData(semanaDe(fim));
  var ini = P ? semanaDe(P.de) : null, maxS = 16;
  for (var i = 0; i < maxS; i++) {
    var d = new Date(d0); d.setDate(d.getDate() - 7 * i); var iso = isoData(d);
    if (ini ? iso < ini : i >= 8) break;
    semanas.unshift(iso);
  }
  if (P && semanas.length < 4) { semanas = []; for (var k = 3; k >= 0; k--) { var d2 = new Date(d0); d2.setDate(d2.getDate() - 7 * k); semanas.push(isoData(d2)); } }
  ENC().forEach(function (e) {
    if (!marcados(e) || gcIds.indexOf(e.gcId) < 0) return;
    var s = semanaDe(e.data), c = contaMV(e, mp);
    por[s] = por[s] || { m: 0, v: 0 }; por[s].m += c.m; por[s].v += c.v;
    gcsSem[s] = gcsSem[s] || {}; gcsSem[s][e.gcId] = 1;
  });
  var at = semanas[semanas.length - 1];
  return '<div class="sec">' + titulo + '</div><div class="card">' +
    graficoPilha(semanas.map(function (s) { var x = por[s] || { m: 0, v: 0 }; return { rot: br(s), m: x.m, v: x.v, tit: 'semana de ' + br(s) }; })) +
    '<div style="font-size:11.5px;color:#777;margin-top:6px">GCs com chamada na última semana do gráfico: <b>' + Object.keys(gcsSem[at] || {}).length + ' de ' + gcIds.length + '</b>' +
    (P && diasPeriodo(P.de, P.ate) > 112 ? ' · mostrando as últimas 16 semanas do período' : '') + '</div></div>';
}
function graficoGCEncontros(gcId) {
  var es = encOrd(gcId).filter(function (e) { return marcados(e); }).slice(-8), mp = mapaPresencas();
  if (!es.length) return '<div class="sec">Presença por encontro</div><div class="card"><div class="empty">Nenhuma chamada lançada ainda.</div></div>';
  return '<div class="sec">Presença por encontro</div><div class="card">' +
    graficoPilha(es.map(function (e) { var c = contaMV(e, mp); return { rot: br(e.data), m: c.m, v: c.v }; })) + '</div>';
}
/* ── consulta de pessoas (pastor, secretaria, master) — com filtros ── */
var buscaM = '', filtroM = 'todos', fM = { gc: '', bairro: '', sexo: '', idMin: '', idMax: '', aniv: '', jornada: '', origem: '', lv: '', aceita: '', semFone: '', ordem: 'nome' }, fMAberto = false;
function ultimaPresenca(p) {
  var u = '';
  ENC(p.gcId).forEach(function (e) { if (e.presencas[p.id] === 'P' && e.data > u) u = e.data; });
  return u;
}
function contaFiltrosM() { var n = 0; for (var k in fM) if (k !== 'ordem' && fM[k]) n++; return n; }
function pessoasConsulta() {
  var q = normalizar(buscaM), qd = soDigitos(buscaM), mesAt = new Date().getMonth() + 1;
  var l = PES().filter(function (p) {
    if (filtroM === 'membros' && p.status !== 'Ativo') return false;
    if (filtroM === 'visitantes' && p.status !== 'Em visita') return false;
    if (filtroM === 'semgc' && p.gcId) return false;
    if (filtroM === 'inativos' && (p.status === 'Ativo' || p.status === 'Em visita')) return false;
    if (fM.gc && (fM.gc === '__sem__' ? !!p.gcId : p.gcId !== fM.gc)) return false;
    if (fM.bairro && normalizar(separarBairroCidade(p.bairro, p.cidade).bairro) !== normalizar(fM.bairro)) return false;
    if (fM.sexo && (fM.sexo === '__sem__' ? !!p.sexo : p.sexo !== fM.sexo)) return false;
    if (fM.idMin !== '' || fM.idMax !== '') {
      var i = idadeDe(p); if (i === null) return false;
      if (fM.idMin !== '' && i < +fM.idMin) return false;
      if (fM.idMax !== '' && i > +fM.idMax) return false;
    }
    if (fM.aniv && !(p.nasc && parseInt(p.nasc.slice(5, 7), 10) === mesAt)) return false;
    if (fM.jornada && p.jornada !== fM.jornada) return false;
    if (fM.origem && (fM.origem === '__sem__' ? !!p.origem : p.origem !== fM.origem)) return false;
    if (fM.lv) {
      if (fM.lv === 'nenhum' && p.lvStatus) return false;
      if (fM.lv === 'ficou' && !(p.lvStatus === 'encerrado' && p.lvResultado === 'Ficou')) return false;
      if (['pendente', 'acompanhando', 'encerrado'].indexOf(fM.lv) >= 0 && p.lvStatus !== fM.lv) return false;
    }
    if (fM.aceita && (p.aceitaVisita || 'Não') !== fM.aceita) return false;
    if (fM.semFone && soDigitos(p.fone).length >= 8) return false;
    if (!q) return true;
    var txt = normalizar([p.nome, p.apelido, p.bairro, p.endereco, gcNome(p.gcId)].join(' '));
    return txt.indexOf(q) >= 0 || (qd.length >= 4 && soDigitos(p.fone).indexOf(qd) >= 0);
  });
  var diaAniv = function (p) { return p.nasc ? p.nasc.slice(5, 10) : '99-99'; };
  l.sort(function (a, b) {
    if (fM.ordem === 'recentes') return String(b.prim || '').localeCompare(String(a.prim || '')) || a.nome.localeCompare(b.nome, 'pt-BR');
    if (fM.ordem === 'aniversario') return diaAniv(a).localeCompare(diaAniv(b)) || a.nome.localeCompare(b.nome, 'pt-BR');
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
  return l;
}
function blocoFiltrosM() {
  var gcs = [['', 'Todos'], ['__sem__', 'Sem GC']].concat(GCS().map(function (g) { return [g.id, g.nome]; }));
  var bs = listaBairros(); if (!bs.length) bs = bairrosDosCadastros().sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  var n = contaFiltrosM();
  var h = '<div class="card" style="padding:10px 14px"><div data-a="togFiltrosM" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer">' +
    '<b style="font-size:13.5px">Filtros' + (n ? ' <span class="pill p-dour">' + n + ' ativo(s)</span>' : '') + '</b><span style="color:#888;font-size:12px">' + (fMAberto ? 'ocultar ▲' : 'mostrar ▼') + '</span></div>';
  if (!fMAberto) return h + '</div>';
  var sel = function (id, rot, lista, v) { return '<div><label>' + rot + '</label><select class="fm" data-k="' + id + '">' + opts(lista, v) + '</select></div>'; };
  h += '<div class="g2">' + sel('gc', 'GC', gcs, fM.gc) + sel('bairro', 'Bairro', [['', 'Todos']].concat(bs.map(function (b) { return [b, b]; })), fM.bairro) + '</div>' +
    '<div class="g2">' + sel('sexo', 'Sexo', [['', 'Todos'], ['Masculino', 'Masculino'], ['Feminino', 'Feminino'], ['__sem__', 'Não informado']], fM.sexo) +
    sel('jornada', 'Etapa da jornada', [['', 'Todas']].concat(ETAPAS.map(function (e) { return [e, e]; })), fM.jornada) + '</div>' +
    '<div class="g2"><div><label>Idade de</label><input class="fm" data-k="idMin" type="number" min="0" inputmode="numeric" value="' + esc(fM.idMin) + '" placeholder="mín."></div>' +
    '<div><label>até</label><input class="fm" data-k="idMax" type="number" min="0" inputmode="numeric" value="' + esc(fM.idMax) + '" placeholder="máx."></div></div>' +
    '<div class="g2">' + sel('origem', 'Origem', [['', 'Todas'], ['visita GC', 'Visita GC'], ['visita igreja', 'Visita igreja'], ['membro igreja', 'Membro igreja'], ['__sem__', 'Sem origem']], fM.origem) +
    sel('lv', 'Lar de Vida', [['', 'Todos'], ['nenhum', 'Sem Lar de Vida'], ['pendente', 'Aguardando'], ['acompanhando', 'Em acompanhamento'], ['encerrado', 'Encerrado'], ['ficou', 'Encerrado — ficou']], fM.lv) + '</div>' +
    '<div class="g2">' + sel('aceita', 'Aceita visita', [['', 'Todos'], ['Sim', 'Sim'], ['Não', 'Não']], fM.aceita) +
    sel('ordem', 'Ordenar por', [['nome', 'Nome'], ['recentes', 'Cadastro mais recente'], ['aniversario', 'Data de aniversário']], fM.ordem) + '</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:10px;font-size:13px;font-weight:600">' +
    '<label style="display:flex;align-items:center;gap:7px;margin:0;color:#333"><input type="checkbox" class="fm" data-k="aniv" style="width:18px;height:18px"' + (fM.aniv ? ' checked' : '') + '>Aniversariantes do mês</label>' +
    '<label style="display:flex;align-items:center;gap:7px;margin:0;color:#333"><input type="checkbox" class="fm" data-k="semFone" style="width:18px;height:18px"' + (fM.semFone ? ' checked' : '') + '>Sem telefone</label></div>' +
    (n ? '<div style="text-align:right;margin-top:8px"><span class="pill p-cinza" data-a="limparFiltrosM" style="cursor:pointer">limpar filtros</span></div>' : '');
  return h + '</div>';
}
function rConsulta() {
  if (!pode('consulta')) return '<div class="empty">Sem permissão.</div>';
  var l = pessoasConsulta(), todas = PES();
  var at = function (p) { return p.status === 'Ativo' || p.status === 'Em visita'; };
  var cnt = { todos: todas.length, membros: todas.filter(function (p) { return p.status === 'Ativo'; }).length, visitantes: todas.filter(function (p) { return p.status === 'Em visita'; }).length,
              semgc: todas.filter(function (p) { return !p.gcId && at(p); }).length, inativos: todas.filter(function (p) { return !at(p); }).length };
  var h = '<div class="busca"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
    '<input id="busca-m" placeholder="Buscar nome, telefone, bairro, rua ou GC" value="' + esc(buscaM) + '" autocomplete="off"></div>';
  h += '<div class="chips">' + [['todos', 'Todos'], ['membros', 'Membros'], ['visitantes', 'Visitantes'], ['semgc', 'Sem GC'], ['inativos', 'Inativos']].map(function (x) {
    return '<button data-a="filtroM" data-v="' + x[0] + '" class="' + (filtroM === x[0] ? 'on' : '') + '">' + x[1] + ' <span>' + cnt[x[0]] + '</span></button>'; }).join('') + '</div>';
  h += blocoFiltrosM();
  h += '<div class="sec" style="margin-top:6px">' + l.length + ' resultado(s)' + (l.length > 150 ? ' — mostrando 150' : '') + '</div><div class="card lp">';
  h += l.length ? l.slice(0, 150).map(function (p) {
    var end = separarBairroCidade(p.bairro, p.cidade), idade = idadeDe(p), st = p.gcId ? statsDe(p) : null, ult = p.gcId ? ultimaPresenca(p) : '';
    var aniv = fM.ordem === 'aniversario' && p.nasc ? ' · aniv. ' + p.nasc.slice(8, 10) + '/' + p.nasc.slice(5, 7) : '';
    return '<div class="row cl" data-a="fichaPessoa" data-v="' + esc(p.id) + '">' + avatarP(p) + '<div class="info">' +
      '<div class="nm">' + esc(p.nome) + (p.apelido ? ' <span style="color:#a87700;font-weight:600">“' + esc(p.apelido) + '”</span>' : '') + '</div>' +
      '<div class="sb">' + esc(p.fone || 'sem telefone') + ' · ' + esc(end.bairro || 'sem bairro') + ' · ' + esc(p.gcId ? gcNome(p.gcId) : 'sem GC') + '</div>' +
      '<div class="sb">' + (idade !== null ? idade + ' anos' : 'idade —') + aniv +
      (st && st.mar ? ' · ' + pct(st.pct) + ' presença no GC' : p.gcId ? ' · sem chamada' : '') + (ult ? ' · última ' + br(ult) : '') + '</div></div>' +
      '<span class="pill ' + (p.status === 'Ativo' ? 'p-verde' : p.status === 'Em visita' ? 'p-dour' : 'p-cinza') + '">' + esc(p.status === 'Ativo' ? 'membro' : p.status === 'Em visita' ? 'visitante' : p.status) + '</span></div>';
  }).join('') : '<div class="empty">Ninguém encontrado com esses filtros.</div>';
  h += '</div><button class="btn gh" data-a="csvConsulta">Exportar resultado (.csv)</button>';
  return h;
}
function fichaPessoa(id) {
  var p = pessoaPor(id); if (!p) return;
  var end = separarBairroCidade(p.bairro, p.cidade), f = fone(p.fone), idade = idadeDe(p), g = gcPor(p.gcId);
  var rua = [p.endereco, p.numero].filter(Boolean).join(', ') + (p.complemento ? ' - ' + p.complemento : '');
  var mapaUrl = rua || end.bairro ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([rua, end.bairro, end.cidade || cidadeIgreja()].filter(Boolean).join(', ')) : '';
  var podeEditar = editaPessoas() && (!p.gcId || !!gcPor(p.gcId)) && !p.anonimizadoEm;
  var kv = function (r, v) { return v ? '<div class="kv"><span>' + r + '</span><b>' + v + '</b></div>' : ''; };
  var at = function (ic, rot, href, acao, val) {
    var dis = !href && !acao;
    return (href ? '<a class="qa" href="' + href + '" target="_blank" rel="noopener">' : '<button class="qa"' + (acao ? ' data-a="' + acao + '" data-v="' + esc(val) + '"' : ' disabled') + '>') +
      '<svg viewBox="0 0 24 24">' + ic + '</svg><span>' + rot + '</span>' + (href ? '</a>' : '</button>');
  };
  var s2 = p.gcId ? statsDe(p) : null;
  // jornada em linha do tempo
  var tl = [];
  if (p.visitaIgrejaEm) tl.push(['ok', '1ª visita ao culto', brCompleto(p.visitaIgrejaEm)]);
  if (p.prim && p.gcId) tl.push(['ok', 'Entrou no ' + esc(g ? g.nome : 'GC'), brCompleto(p.prim) + (p.direcionadoPor ? ' · ' + esc(p.direcionadoPor) : '')]);
  if (p.lvInicio) tl.push([p.lvStatus === 'encerrado' ? 'ok' : '', 'Lar de Vida ' + (p.lvStatus === 'encerrado' ? 'concluído' : 'em andamento (' + lvVis(p).length + '/' + LV_SEMANAS + ')'),
    brCompleto(p.lvInicio) + (p.lvStatus === 'encerrado' && p.lvResultado ? ' · ' + esc(String(p.lvResultado).toLowerCase()) : '')]);
  var ie = ETAPAS.indexOf(p.jornada);
  if (ie >= 0) tl.push(['ok', 'Jornada: ' + esc(p.jornada.replace(/^\d+\.\s*/, '')), 'etapa atual']);
  if (ie >= 0 && ie < ETAPAS.length - 1) tl.push(['', esc(ETAPAS[ie + 1].replace(/^\d+\.\s*/, '')), 'próxima etapa']);
  abrirModal('<div class="perfil"><div class="fp-click" data-a="fotoDireta" data-v="' + esc(p.id) + '" title="Trocar foto">' + avatarP(p) + '<span>📷</span></div><h2>' + esc(p.nome) + '</h2>' +
    (p.apelido ? '<div class="apel">“' + esc(p.apelido) + '”</div>' : '') +
    '<p>' + esc([p.status === 'Em visita' ? 'Visitante' : p.status === 'Ativo' ? (p.tipo || 'Membro') : p.status, g ? g.nome : (p.gcId ? '' : 'sem GC'), p.prim ? 'desde ' + br(p.prim) : ''].filter(Boolean).join(' · ')) + '</p>' +
    '<div class="pills">' + (p.origem ? '<span class="pill p-cinza">' + esc(p.origem) + '</span>' : '') + lvResumoPill(p) + pillIgreja(p) + '</div></div>' +
    '<div class="qas">' +
      at('<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5z"/>', 'WhatsApp', f ? 'https://wa.me/' + (f.length <= 11 ? '55' : '') + f : '') +
      at('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.8 2z"/>', 'Ligar', f ? 'tel:' + f : '') +
      at('<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>', 'Mapa', mapaUrl) +
      at('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>', 'Editar', '', podeEditar ? 'perfilEditar' : '', p.id) +
    '</div>' +
    '<div class="stats" style="margin-top:12px">' +
      statCard('Presença no GC', s2 && s2.mar ? pct(s2.pct) : '—', s2 && s2.mar ? s2.mar + ' encontro(s) marcados' : (p.gcId ? 'sem chamada ainda' : 'sem GC'), s2 && s2.mar ? 'up' : '') +
      statCard('Visitas ao culto', +p.visitasIgreja || 0, p.visitaIgrejaEm ? '1ª em ' + br(p.visitaIgrejaEm) : 'nenhuma registrada') + '</div>' +
    '<div class="sec">Dados</div><div class="card kvs">' +
      kv('Código', esc(p.codigo || 'gerado ao sincronizar')) + kv('Telefone', esc(p.fone)) + kv('Endereço', esc([rua, end.bairro].filter(Boolean).join(' · '))) + kv('Cidade', esc(end.cidade)) +
      kv('Nascimento', p.nasc ? br(p.nasc) + (idade !== null ? ' · ' + idade + ' anos' : '') : '') + kv('Sexo', esc(p.sexo)) +
      kv('Líder do GC', esc(g ? g.liderNome : '')) + kv('Como conheceu', esc(textoCanal(p))) + kv('Convidado por', esc(p.conv)) +
      kv('Aceita visita', esc(p.aceitaVisita)) + kv('Frequenta igreja', p.frequentaIgreja === 'Sim' ? esc(p.igrejaQual || 'sim') : '') +
      kv('Observações', esc(p.obs)) +
      kv('Cadastrado por', esc((p.criadoPorNome || (p.criadoPor === eu().id ? eu().nome : '') || '—') + (p.criadoEm ? ' em ' + brCompleto(String(p.criadoEm).slice(0, 10)) : (p.prim ? ' · 1ª participação ' + brCompleto(p.prim) : '')))) +
      (p.usuarioId ? kv('Acesso ao app', 'usuário vinculado') : '') +
      kv('Uso dos dados', p.anonimizadoEm ? 'anonimizado em ' + br(String(p.anonimizadoEm).slice(0, 10)) : textoConsent(p)) + '</div>' +
    (tl.length ? '<div class="sec">Jornada</div><div class="card"><div class="tl">' + tl.map(function (x) {
      return '<div class="' + x[0] + '"><b>' + x[1] + '</b><small>' + x[2] + '</small></div>'; }).join('') + '</div></div>' : '') +
    (papel() === 'master' && !p.anonimizadoEm ? '<button class="btn dg" data-a="anonimizar" data-v="' + esc(p.id) + '">Anonimizar dados (pedido do titular)</button><div class="gap"></div>' : '') +
    '<button class="btn gh" data-a="fechar">Fechar</button>');
}
function csvConsulta() {
  var hd = ['Nome', 'Apelido', 'Status', 'Tipo', 'Telefone', 'Endereco', 'Numero', 'Complemento', 'Bairro', 'Cidade', 'CEP', 'Nascimento', 'Idade', 'Aniversario',
            'Sexo', 'GC', 'Lider do GC', 'Origem', 'Jornada', '1a participacao', '% presenca GC', 'Ultima presenca', 'Lar de Vida', 'Aceita visita',
            'Frequenta outra igreja', 'Convidado por', 'Discipulador', 'Observacoes'];
  var rows = pessoasConsulta().map(function (p) {
    var e = separarBairroCidade(p.bairro, p.cidade), g = gcPor(p.gcId), st = p.gcId ? statsDe(p) : null, i = idadeDe(p);
    var lv = p.lvStatus === 'acompanhando' ? 'em acompanhamento ' + lvVis(p).length + '/' + LV_SEMANAS : p.lvStatus === 'encerrado' ? 'encerrado - ' + (p.lvResultado || '') : p.lvStatus === 'pendente' ? 'aguardando' : '';
    return [p.nome, p.apelido, p.status, p.tipo, p.fone, p.endereco, p.numero, p.complemento, e.bairro, e.cidade, p.cep, p.nasc, i === null ? '' : i,
            p.nasc ? p.nasc.slice(8, 10) + '/' + p.nasc.slice(5, 7) : '', p.sexo, g ? g.nome : '', g ? g.liderNome : '', p.origem, p.jornada, p.prim,
            st && st.mar ? pct(st.pct) : '', p.gcId ? ultimaPresenca(p) : '', lv, p.aceitaVisita, p.frequentaIgreja === 'Sim' ? (p.igrejaQual || 'Sim') : '',
            p.conv, p.disc, p.obs];
  });
  var csv = [hd].concat(rows).map(function (r) { return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(';'); }).join('\n');
  var b = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
  (sbDisponivel()?v39RegistrarEvento('exportou CSV','consulta de pessoas · '+rows.length+' pessoa(s)','people',null):chamar('registrarEvento',{tipo:'exportou CSV',detalhe:'consulta de pessoas · '+rows.length+' pessoa(s)'})).catch(function(){});
  a.href = URL.createObjectURL(b); a.download = 'cadastro-pessoas-' + hoje() + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

/* ── gráfico de cultos/eventos: com filtro por tipo e regras visíveis ── */
var filtroTipoCulto = '';
function graficoCultos(titulo, P) {
  var hj = hoje(), tipos = {}, dentro = function (e) { return e.data <= hj && (!P || P.noPer(e.data)); };
  EVS().forEach(function (e) { if (dentro(e)) tipos[e.tipo || 'Culto'] = 1; });
  var lim = P ? 12 : 8;
  var evs = EVS().filter(function (e) { return dentro(e) && (e.presentes || e.nVisitantes) && (!filtroTipoCulto || (e.tipo || 'Culto') === filtroTipoCulto); })
    .sort(function (a, b) { return (a.data + a.inicio) < (b.data + b.inicio) ? -1 : 1; }).slice(-lim);
  var h = '<div class="sec">' + titulo + '</div><div class="card">';
  var lt = Object.keys(tipos);
  if (lt.length > 1) h += '<div class="tabs" style="margin-bottom:4px">' + [['', 'Todos']].concat(lt.map(function (t) { return [t, t]; })).map(function (x) {
    return '<button data-a="filtroTipoCulto" data-v="' + esc(x[0]) + '" class="' + (filtroTipoCulto === x[0] ? 'on' : '') + '">' + esc(x[1]) + '</button>'; }).join('') + '</div>';
  var regras = '<details style="margin-top:8px;font-size:11.5px;color:#666;line-height:1.55"><summary style="cursor:pointer;font-weight:700;color:#555">ⓘ Como é calculado</summary>' +
    '<div style="margin-top:6px">' +
    '• <b>Quais entram:</b> ' + (P ? 'os cultos/eventos do período (até 12, os mais recentes)' : 'os últimos 8 cultos/eventos até hoje') + ' que têm <b>pessoas presentes</b> lançadas ou ao menos um visitante cadastrado' + (filtroTipoCulto ? ' (filtro: ' + esc(filtroTipoCulto) + ')' : '') + '.<br>' +
    '• <b>Visitantes</b> (dourado): visitantes cadastrados naquele culto, dentro da janela de horário. Cadastros excluídos não contam.<br>' +
    '• <b>Membros</b> (preto): pessoas presentes lançadas − visitantes, nunca abaixo de zero.<br>' +
    '• <b>Sem contagem de presentes</b>: a barra mostra só os visitantes e aparece com <b>*</b>.<br>' +
    '• <b>Média de presentes</b>: só dos cultos com contagem lançada.<br>' +
    '• <b>Não contam como visitante</b>: membros cadastrados em “Membro sem GC” e quem já estava num GC e foi registrado como visita à igreja.</div></details>';
  if (!evs.length) return h + '<div class="empty">Nenhum culto com presença lançada' + (P ? ' no período' : '') + '.<br>Lance as <b>pessoas presentes</b> em Cultos → Valores e presença.</div>' + regras + '</div>';
  var semConta = false, totP = 0, nP = 0, totV = 0;
  var itens = evs.map(function (e) {
    var v = +e.nVisitantes || 0, p = parseInt(e.presentes, 10), sc = isNaN(p);
    if (sc) { semConta = true; p = v; } else { totP += p; nP++; }
    totV += v;
    return { rot: br(e.data), m: Math.max(0, p - v), v: Math.min(v, p), semConta: sc, tit: e.titulo };
  });
  h += graficoPilha(itens, semConta ? '* sem contagem de presentes' : '');
  h += '<div style="font-size:11.5px;color:#777;margin-top:6px;line-height:1.5">Média de presentes: <b>' + (nP ? Math.round(totP / nP) : '—') + '</b> · ' +
    'Visitantes cadastrados nesses cultos: <b>' + totV + '</b></div>' + regras + '</div>';
  return h;
}

/* ═══════════════════ CURSOS, REUNIÕES E TREINAMENTOS ═══════════════════ */
var TIPOS_REUNIAO = ['Curso', 'Reunião', 'Treinamento'];
var RECORRENCIAS = [['unica', 'Única'], ['diaria', 'Diária'], ['semanal', 'Semanal'], ['quinzenal', 'Quinzenal'], ['mensal', 'Mensal']];
var cursoAberto = '', filtroCurso = 'ativos', rnDraft = null, buscaPart = '';
function REUS(mod) { mod = mod === undefined ? modCursos() : mod; return (db.reunioes || []).filter(function (r) { return !r.deleted && (r.modulo || '') === mod; }); }
function reuniaoPor(id) { var l = db.reunioes || []; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
function aulasDe(rid) { return (db.aulas || []).filter(function (a) { return !a.deleted && a.reuniaoId === rid; }).sort(function (a, b) { return a.data < b.data ? -1 : 1; }); }
function aulaPor(id) { var l = db.aulas || []; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
function temCursos() { return pode('cursos') || REUS('').length > 0; }
function proximaAula(rid) { var hj = hoje(); return aulasDe(rid).filter(function (a) { return a.data >= hj; })[0] || null; }
function aulasHojeMinhas(mod) { mod = mod === undefined ? modCursos() : mod; var hj = hoje(); return (db.aulas || []).filter(function (a) { var r = a.deleted ? null : reuniaoPor(a.reuniaoId); return !!r && a.data === hj && (r.modulo || '') === mod; }); }
function presencaPart(rid, chave) {
  var p = 0, m = 0;
  aulasDe(rid).forEach(function (a) { var x = (a.presencas || {})[chave]; if (x) { m++; if (x === 'P') p++; } });
  return { p: p, m: m };
}
function quandoTexto(r) {
  var rec = RECORRENCIAS.filter(function (x) { return x[0] === (r.recorrencia || 'unica'); })[0];
  var d = parseData(r.data);
  return (rec ? rec[1] : 'Única') + (r.recorrencia && r.recorrencia !== 'unica' ? ' · desde ' : ' · ') + (d ? DIAS[d.getDay()] + ', ' : '') + brCompleto(r.data) +
    (r.inicio ? ' · ' + esc(r.inicio) + (r.fim ? '–' + esc(r.fim) : '') : '');
}
function msgConvite(r, p) {
  var ds = aulasDe(r.id).filter(function (a) { return a.data >= hoje(); }).slice(0, 6), d0 = parseData(r.data);
  var txt = 'Olá, ' + (p.apelido || pri(p.nome)) + '! Você foi convidado(a) para o ' + (r.tipo || 'encontro').toLowerCase() + ' *' + r.titulo + '*' +
    (igrNome() ? ' da ' + igrNome() : '') + '.\n\n' +
    (r.tema ? '📖 Tema: ' + r.tema + '\n' : '') +
    '📍 Local: ' + (r.local || 'a definir') + '\n' +
    '📅 ' + (d0 ? DIAS[d0.getDay()] + ', ' : '') + brCompleto(r.data) + (r.inicio ? ' às ' + r.inicio + (r.fim ? ' (até ' + r.fim + ')' : '') : '') + '\n';
  if (r.recorrencia && r.recorrencia !== 'unica' && ds.length > 1) txt += '🔁 Próximas datas: ' + ds.map(function (a) { return br(a.data); }).join(', ') + (aulasDe(r.id).length > ds.length ? '…' : '') + '\n';
  if (r.obs) txt += '\n' + r.obs + '\n';
  return txt + '\nContamos com você! 🙏';
}
function linkWA(fn, txt) { var f = fone(fn); return f.length >= 10 ? 'https://wa.me/' + (f.length <= 11 ? '55' : '') + f + '?text=' + encodeURIComponent(txt) : ''; }
function rCursos_v36() {
  if (cursoAberto && reuniaoPor(cursoAberto)) return rCursoDetalhe(reuniaoPor(cursoAberto));
  cursoAberto = '';
  var gere = pode('cursos'), hj = hoje(), h = '';
  var hojeL = aulasHojeMinhas();
  if (hojeL.length) h += '<div class="card" style="border-left:5px solid var(--dourado)"><h3>Chamadas de hoje</h3>' + hojeL.map(function (a) {
    var r = reuniaoPor(a.reuniaoId), n = Object.keys(a.presencas || {}).length;
    return '<div class="row cl" data-a="rnChamada" data-v="' + esc(a.id) + '"><div class="info"><div class="nm">' + esc(r.titulo) + (a.inicio ? ' · ' + esc(a.inicio) : '') + '</div>' +
      '<div class="sb">' + esc(r.local || '') + ' · ' + (r.participantes || []).length + ' participante(s)</div></div>' +
      '<span class="pill ' + (n ? 'p-verde' : 'p-amarelo') + '">' + (n ? 'chamada feita' : 'fazer chamada') + '</span></div>';
  }).join('') + '</div>';
  if (gere) h += '<button class="btn" data-a="rnNovo">+ Novo curso, reunião ou treinamento</button><div class="gap"></div>';
  var l = REUS().filter(function (r) {
    var ult = aulasDe(r.id).slice(-1)[0], fim = ult ? ult.data : r.data;
    return filtroCurso === 'ativos' ? fim >= hj : fim < hj;
  }).sort(function (a, b) { var pa = proximaAula(a.id), pb = proximaAula(b.id); return String(pa ? pa.data : a.data).localeCompare(String(pb ? pb.data : b.data)); });
  h += '<div class="tabs">' + [['ativos', 'Em andamento'], ['encerrados', 'Encerrados']].map(function (x) {
    return '<button data-a="filtroCurso" data-v="' + x[0] + '" class="' + (filtroCurso === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>';
  if (!l.length) return h + '<div class="card"><div class="empty">' + (filtroCurso === 'ativos' ? (gere ? 'Nenhum curso ou reunião em andamento.' : 'Você não é responsável por nenhuma chamada em andamento.') : 'Nenhum encerrado.') + '</div></div>';
  l.forEach(function (r) {
    var as = aulasDe(r.id), feitas = as.filter(function (a) { return Object.keys(a.presencas || {}).length; }), prox = proximaAula(r.id);
    var tp = 0, tm = 0; feitas.forEach(function (a) { for (var k in a.presencas) { tm++; if (a.presencas[k] === 'P') tp++; } });
    var pend = gere ? (r.participantes || []).filter(function (p) { return !p.enviadoEm; }).length : 0;
    h += '<div class="card cl" data-a="rnAbrir" data-v="' + esc(r.id) + '" style="cursor:pointer">' +
      '<div style="display:flex;justify-content:space-between;gap:8px"><div style="min-width:0"><div style="font-size:11px;color:#888;font-weight:800;letter-spacing:.6px">' + esc((r.tipo || 'Reunião').toUpperCase()) + '</div>' +
      '<div style="font-size:16px;font-weight:800;margin-top:2px">' + esc(r.titulo) + '</div></div>' +
      (prox ? '<span class="pill p-dour">' + (prox.data === hj ? 'hoje' : 'próx. ' + br(prox.data)) + '</span>' : '<span class="pill p-cinza">encerrado</span>') + '</div>' +
      '<div style="font-size:12.5px;color:#555;margin-top:6px;line-height:1.55">' + (r.tema ? '<b>Tema:</b> ' + esc(r.tema) + '<br>' : '') +
      '<b>Local:</b> ' + esc(r.local || '—') + '<br>' + quandoTexto(r) + '</div>' +
      '<div class="mini"><div><b>' + (r.participantes || []).length + '</b><span>participantes</span></div><div><b>' + feitas.length + '/' + as.length + '</b><span>chamadas</span></div>' +
      '<div><b>' + (tm ? pct(tp / tm) : '—') + '</b><span>presença</span></div><div><b style="color:' + (pend ? 'var(--vermelho)' : '') + '">' + (gere ? pend : '—') + '</b><span>convites a enviar</span></div></div></div>';
  });
  return h;
}
function rCursoDetalhe(r) {
  var gere = pode(r.modulo === 'inst' ? 'institutoCursos' : 'cursos'), hj = hoje(), as = aulasDe(r.id), parts = (r.participantes || []).slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
  var h = '<button class="btn gh sm" data-a="rnVoltar" style="margin-bottom:12px">‹ ' + (r.modulo === 'inst' ? 'Cursos' : 'Treinamentos/Reuniões') + '</button>' +
    '<div class="card"><div style="font-size:11px;color:#888;font-weight:800;letter-spacing:.6px">' + esc((r.tipo || 'Reunião').toUpperCase()) + '</div>' +
    '<div style="font-size:18px;font-weight:800;margin:2px 0 6px">' + esc(r.titulo) + '</div>' +
    '<div style="font-size:13px;color:#555;line-height:1.6">' + (r.tema ? '<b>Tema:</b> ' + esc(r.tema) + '<br>' : '') + '<b>Local:</b> ' + esc(r.local || '—') + '<br>' + quandoTexto(r) +
    (r.responsaveis ? '<br><b>Chamada:</b> ' + esc(nomesResp(r)) : '') + (r.obs ? '<br><span style="color:#777">' + esc(r.obs) + '</span>' : '') + '</div>' +
    (gere ? '<div class="acoes" style="margin-top:10px"><button class="btn gh sm" data-a="rnEditar" data-v="' + esc(r.id) + '">Editar</button>' +
      '<button class="btn gh sm" data-a="rnPart" data-v="' + esc(r.id) + '">+ Participantes</button></div>' : '') + '</div>';
  h += '<div class="sec">Datas e chamadas (' + as.length + ')</div><div class="card">' + (as.length ? as.map(function (a) {
    var n = Object.keys(a.presencas || {}).length, p = 0; for (var k in a.presencas) if (a.presencas[k] === 'P') p++;
    var futuro = a.data > hj;
    return '<div class="row cl" data-a="rnChamada" data-v="' + esc(a.id) + '"><div class="av" style="flex-direction:column;font-size:10.5px;line-height:1.1"><b style="font-size:14px">' + a.data.slice(8, 10) + '</b>' + MESES[parseData(a.data).getMonth()] + '</div>' +
      '<div class="info"><div class="nm">' + DIAS[parseData(a.data).getDay()] + (a.inicio ? ' · ' + esc(a.inicio) : '') + (a.tema ? ' — ' + esc(a.tema) : '') + '</div>' +
      '<div class="sb">' + (n ? p + ' presente(s) de ' + parts.length + (a.feitoPor ? ' · por ' + esc(a.feitoPor) : '') : futuro ? 'agendado' : 'sem chamada') + '</div></div>' +
      '<span class="pill ' + (n ? 'p-verde' : a.data === hj ? 'p-amarelo' : futuro ? 'p-cinza' : 'p-vermelho') + '">' + (n ? pct(p / Math.max(parts.length, 1)) : a.data === hj ? 'hoje' : futuro ? 'futuro' : 'pendente') + '</span></div>';
  }).join('') : '<div class="empty">Nenhuma data gerada.</div>') + '</div>';
  var pend = parts.filter(function (p) { return !p.enviadoEm; });
  h += '<div class="sec">Participantes (' + parts.length + ')</div>';
  if (gere && pend.length) h += '<div class="aviso r" data-a="rnConvites" data-v="' + esc(r.id) + '" style="cursor:pointer"><b>' + pend.length + ' convite(s) ainda não enviado(s).</b> Toque para enviar pelo WhatsApp.</div>';
  h += '<div class="card">' + (parts.length ? parts.map(function (p) {
    var st = presencaPart(r.id, p.chave);
    return '<div class="row">' + avatarP(p) + '<div class="info"><div class="nm">' + esc(p.nome) + (p.apelido ? ' <span style="color:#a87700;font-weight:600">“' + esc(p.apelido) + '”</span>' : '') + '</div>' +
      '<div class="sb">' + (st.m ? st.p + ' de ' + st.m + ' · ' + pct(st.p / st.m) + ' presença' : 'sem chamada ainda') +
      (gere ? ' · ' + (p.enviadoEm ? 'convite enviado ' + br(p.enviadoEm.slice(0, 10)) : '<b style="color:var(--vermelho)">convite pendente</b>') : '') + '</div></div>' +
      (gere && linkWA(p.fone, '') ? '<a class="wa" data-a="rnEnviar" data-v="' + esc(r.id) + '|' + esc(p.chave) + '" href="' + linkWA(p.fone, msgConvite(r, p)) + '" target="_blank" rel="noopener">' + (p.enviadoEm ? 'Reenviar' : 'Convidar') + '</a>'
        : gere ? '<span class="pill p-cinza">sem nº</span>' : '') +
      (gere ? '<button class="btn dg sm" data-a="rnRemPart" data-v="' + esc(r.id) + '|' + esc(p.chave) + '" style="padding:6px 9px;margin-left:4px">×</button>' : '') + '</div>';
  }).join('') : '<div class="empty">Nenhum participante. ' + (gere ? 'Toque em “+ Participantes”.' : '') + '</div>') + '</div>';
  return h;
}
function nomesResp(r) {
  var ids = String(r.responsaveis || '').split(',').filter(Boolean), eq = {};
  (db.equipe || []).concat(db.equipeInst || []).forEach(function (u) { eq[u.id] = u.nome; });
  return ids.map(function (id) { return eq[id] || (id === eu().id ? eu().nome : 'líder'); }).join(', ');
}
/* formulário */
function rnForm(r) {
  r = r || {};
  var eq = (modDe(r) === 'inst' ? (db.equipeInst || []) : (db.equipe || [])).filter(function (u) { return u.papel !== 'voluntario'; }).sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
  var resp = String(r.responsaveis || '').split(',').filter(Boolean);
  var rec = r.recorrencia || 'unica';
  return '<div class="g2"><div><label>Tipo</label><select id="rn-tipo">' + opts(tiposReuniao(r.tipo, modDe(r)).map(function (t) { return [t, t]; }), r.tipo || (modDe(r) === 'inst' ? 'Curso' : 'Reunião')) + '</select></div>' +
    '<div><label>Recorrência</label><select id="rn-rec">' + opts(RECORRENCIAS, rec) + '</select></div></div>' +
    '<label>Título *</label><input id="rn-titulo" value="' + esc(r.titulo) + '" placeholder="' + (modDe(r) === 'inst' ? 'Ex.: Inglês básico' : 'Ex.: Treinamento de líderes') + '">' +
    '<label>Tema / assunto</label><input id="rn-tema" value="' + esc(r.tema) + '">' +
    '<label>Local</label><input id="rn-local" value="' + esc(r.local) + '" placeholder="Ex.: Templo — sala 2">' +
    '<div class="g2"><div><label>' + (rec === 'unica' ? 'Data *' : '1º encontro *') + '</label><input id="rn-data" type="date" value="' + esc(r.data || hoje()) + '"></div>' +
    '<div class="g2" style="gap:0 6px"><div><label>Início</label><input id="rn-ini" type="time" value="' + esc(r.inicio) + '"></div><div><label>Fim</label><input id="rn-fim" type="time" value="' + esc(r.fim) + '"></div></div></div>' +
    '<div id="rn-recwrap" class="' + (rec === 'unica' ? 'hide' : '') + '"><div class="g2"><div><label>Até a data</label><input id="rn-ate" type="date" value="' + esc(r.ate) + '"></div>' +
    '<div><label>ou nº de encontros</label><input id="rn-qtd" type="number" min="1" max="60" inputmode="numeric" value="' + esc(r.qtd) + '" placeholder="ex.: 8"></div></div>' +
    '<div style="font-size:11px;color:#999;margin-top:4px">O app gera uma chamada para cada data (máximo 60). Datas sem chamada são ajustadas se você mudar a recorrência.</div></div>' +
    '<label>Quem pode fazer a chamada (além de quem tem acesso a ' + (modDe(r) === 'inst' ? 'Cursos do Instituto' : 'Treinamentos/Reuniões') + ')</label><div style="border:1.5px solid #e2e2e2;border-radius:11px;padding:2px 10px;max-height:180px;overflow-y:auto">' +
    (eq.length ? eq.map(function (u) {
      return '<label style="display:flex;align-items:center;gap:10px;margin:0;padding:8px 2px;border-bottom:1px solid #f2f2f2;font-size:13px;color:#222;font-weight:600">' +
        '<input type="checkbox" class="rn-resp" value="' + esc(u.id) + '" style="width:19px;height:19px;flex:0 0 19px"' + (resp.indexOf(u.id) >= 0 ? ' checked' : '') + '>' +
        '<span style="flex:1">' + esc(u.nome) + ' <span style="color:#999;font-weight:500;font-size:11px">· ' + esc(PAPEL_NOME[u.papel] || '') + '</span></span></label>';
    }).join('') : '<div style="font-size:12px;color:#999;padding:8px 0">Nenhum usuário.</div>') + '</div>' +
    '<label>Observações (vão no convite)</label><textarea id="rn-obs" rows="2" placeholder="Ex.: traga sua Bíblia e caderno">' + esc(r.obs) + '</textarea>';
}
function lerRnForm() {
  var v = function (id) { var el = $(id); return el ? el.value.trim() : ''; };
  var cks = document.querySelectorAll('.rn-resp'), resp = [];
  for (var i = 0; i < cks.length; i++) if (cks[i].checked) resp.push(cks[i].value);
  var rec = v('rn-rec');
  return { tipo: v('rn-tipo'), titulo: v('rn-titulo'), tema: v('rn-tema'), local: v('rn-local'), data: v('rn-data'), inicio: v('rn-ini'), fim: v('rn-fim'),
           recorrencia: rec, ate: rec === 'unica' ? '' : v('rn-ate'), qtd: rec === 'unica' ? '' : v('rn-qtd'), responsaveis: resp.join(','), obs: v('rn-obs') };
}
function rnNovo() {
  abrirModal('<h2>' + (modCursos() === 'inst' ? 'Novo curso' : 'Nova reunião ou treinamento') + '</h2>' + rnForm(null) +
    '<div style="font-size:11.5px;color:#888;margin-top:10px">Depois de salvar, você escolhe os participantes e envia os convites pelo WhatsApp.</div>' +
    '<div style="height:14px"></div><button class="btn pr" data-a="rnSalvar">Salvar e escolher participantes</button><div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
}
function rnEditar(id) {
  var r = reuniaoPor(id); if (!r) return;
  abrirModal('<h2>Editar</h2>' + rnForm(r) + '<div style="height:14px"></div><button class="btn pr" data-a="rnSalvar" data-v="' + esc(id) + '">Salvar</button><div class="gap"></div>' +
    '<button class="btn gh" data-a="fechar">Cancelar</button><div class="gap"></div><button class="btn dg" data-a="rnExcluir" data-v="' + esc(id) + '">Excluir</button>');
}
function salvarReuniaoSrv(dados, msg) {
  carregando(true, 'Salvando...');
  var opRn = sbDisponivel() ? v39SalvarReuniao(dados).then(function(x){return {reuniao:x,aulas:[]};}) : chamar('salvarReuniao', { reuniao: dados }, function (i, n) { $('carregando-txt').textContent = 'Enviando ' + i + '/' + n + '...'; });
  return opRn.then(function (r) {
    db.reunioes = (db.reunioes || []).filter(function (x) { return x.id !== r.reuniao.id; }).concat([r.reuniao]);
    db.aulas = (db.aulas || []).filter(function (a) { return a.reuniaoId !== r.reuniao.id; }).concat(r.aulas || []);
    salvarDB(); if (msg) toast(msg);
    return r.reuniao;
  }).catch(function (e) { toast(e.message, 4500); throw e; }).then(function (x) { carregando(false); return x; }, function (e) { carregando(false); throw e; });
}
function rnSalvar(id) {
  var f = lerRnForm();
  if (!f.titulo) return toast('Informe o título.');
  if (!f.data) return toast('Informe a data.');
  if (f.recorrencia !== 'unica' && !f.ate && !f.qtd) return toast('Informe até quando ou quantos encontros.');
  if (f.ate && f.ate < f.data) return toast('A data final é antes do 1º encontro.'); f.modulo = modCursos();
  if (id) f.id = id;
  salvarReuniaoSrv(f, id ? 'Atualizado ✓' : null).then(function (r) {
    fechar(); cursoAberto = r.id; render();
    if (!id) { toast(aulasDe(r.id).length + ' data(s) gerada(s) ✓ Agora escolha os participantes.', 4000); rnPart(r.id); }
  }).catch(function () {});
}
function rnExcluir(id) {
  if (!confirm('Excluir ' + ((reuniaoPor(id) || {}).modulo === 'inst' ? 'este curso' : 'este treinamento/reunião') + ' e todas as chamadas?')) return;
  salvarReuniaoSrv({ id: id, deleted: true }, 'Excluído').then(function () { fechar(); cursoAberto = ''; db.reunioes = db.reunioes.filter(function (x) { return x.id !== id; }); salvarDB(); render(); }).catch(function () {});
}
/* participantes */
var partSel = {};
function candidatosPart() {
  var out = [], vistos = {};
  PES().forEach(function (p) {
    if (p.status === 'Inativo') return;
    out.push({ chave: 'p:' + p.id, nome: p.nome, apelido: p.apelido || '', fone: p.fone || '', origem: 'pessoa', gcId: p.gcId, sub: (p.gcId ? gcNome(p.gcId) : 'sem GC') + ' · ' + (p.status === 'Ativo' ? 'membro' : 'visitante') });
    vistos[normalizar(p.nome)] = 1;
  });
  (db.equipe || []).forEach(function (u) {
    out.push({ chave: 'u:' + u.id, nome: u.nome, apelido: '', fone: u.fone || '', origem: 'usuario', gcId: u.gcId, sub: (PAPEL_NOME[u.papel] || '') + (u.gcId ? ' · ' + gcNome(u.gcId) : '') + ' · usuário do app' });
  });
  return out.sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
}
function rnPart(id) { if ((reuniaoPor(id) || {}).modulo === 'inst') return rnPartInst(id);
  var r = reuniaoPor(id); if (!r) return;
  partSel = {}; (r.participantes || []).forEach(function (p) { partSel[p.chave] = p; });
  buscaPart = '';
  abrirModal('<h2>Participantes</h2><div class="sb" style="font-size:12.5px;color:#888">' + esc(r.titulo) + '</div>' +
    '<div class="g2"><div><label>Adicionar todos de um GC</label><select id="rn-gcadd"><option value="">— escolher GC —</option>' + GCS().map(function (g) { return '<option value="' + esc(g.id) + '">' + esc(g.nome) + '</option>'; }).join('') + '</select></div>' +
    '<div><label>Adicionar líderes</label><button class="btn gh" data-a="rnAddLideres" style="padding:11px">Todos os líderes</button></div></div>' +
    '<input id="busca-part" placeholder="Buscar pessoa ou usuário..." style="margin:12px 0 6px">' +
    '<div id="rn-contsel" style="font-size:12px;color:#555;font-weight:700;margin:4px 2px 6px"></div>' +
    '<div id="lista-part" style="max-height:42vh;overflow-y:auto;border:1.5px solid #eee;border-radius:11px;padding:0 10px"></div>' +
    '<div style="height:14px"></div><button class="btn pr" data-a="rnSalvarPart" data-v="' + esc(id) + '">Salvar participantes</button><div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
  pintarPart();
}
function pintarPart() {
  var el = $('lista-part'); if (!el) return;
  var q = normalizar(buscaPart), l = candidatosPart().filter(function (c) { return !q || normalizar(c.nome + ' ' + c.apelido + ' ' + c.sub).indexOf(q) >= 0; });
  var sel = l.filter(function (c) { return partSel[c.chave]; }), nao = l.filter(function (c) { return !partSel[c.chave]; });
  el.innerHTML = sel.concat(nao).slice(0, 200).map(function (c) {
    return '<label style="display:flex;align-items:center;gap:10px;margin:0;padding:9px 2px;border-bottom:1px solid #f2f2f2;font-size:13px;color:#222;font-weight:600">' +
      '<input type="checkbox" class="rn-part" value="' + esc(c.chave) + '" style="width:19px;height:19px;flex:0 0 19px"' + (partSel[c.chave] ? ' checked' : '') + '>' +
      '<span style="flex:1;min-width:0">' + esc(c.nome) + '<span style="display:block;color:#999;font-weight:500;font-size:11px">' + esc(c.sub) + (c.fone ? '' : ' · sem telefone') + '</span></span></label>';
  }).join('') || '<div class="empty">Ninguém encontrado.</div>';
  $('rn-contsel').textContent = Object.keys(partSel).length + ' selecionado(s)';
}
function partToggle(chave, on) {
  if (on) { var c = candidatosPart().filter(function (x) { return x.chave === chave; })[0]; if (c) partSel[chave] = c; }
  else delete partSel[chave];
  $('rn-contsel').textContent = Object.keys(partSel).length + ' selecionado(s)';
}
function rnSalvarPart(id) {
  var r = reuniaoPor(id); if (!r) return;
  var antes = {}; (r.participantes || []).forEach(function (p) { antes[p.chave] = 1; });
  var lista = Object.keys(partSel).map(function (k) { var p = partSel[k]; return { chave: p.chave, nome: p.nome, apelido: p.apelido || '', fone: p.fone || '', origem: p.origem || '' }; });
  var novos = lista.filter(function (p) { return !antes[p.chave]; }).map(function (p) { return p.chave; });
  salvarReuniaoSrv({ id: id, participantes: lista }, null).then(function (rr) {
    fechar(); render();
    if (novos.length) rnConvites(rr.id, novos); else toast('Participantes salvos ✓');
  }).catch(function () {});
}
function rnRemPart(v) {
  var p = v.split('|'), r = reuniaoPor(p[0]); if (!r) return;
  var x = (r.participantes || []).filter(function (q) { return q.chave === p[1]; })[0];
  if (!x || !confirm('Remover ' + x.nome + ' deste ' + (r.tipo || 'encontro').toLowerCase() + '?')) return;
  salvarReuniaoSrv({ id: r.id, participantes: r.participantes.filter(function (q) { return q.chave !== p[1]; }) }, 'Participante removido').then(render).catch(function () {});
}
/* convites pelo WhatsApp (semiautomático) */
function rnConvites(id, chaves) {
  var r = reuniaoPor(id); if (!r) return;
  var l = (r.participantes || []).filter(function (p) { return chaves ? chaves.indexOf(p.chave) >= 0 : !p.enviadoEm; });
  if (!l.length) return toast('Todos os convites já foram enviados.');
  abrirModal('<h2>Enviar convites</h2><div style="font-size:12.5px;color:#666;line-height:1.5;margin:4px 0 10px">Toque em <b>Enviar</b> em cada pessoa: o WhatsApp abre com a mensagem pronta. ' +
    'Ao voltar para o app, o convite fica marcado como enviado.</div>' +
    '<details style="margin-bottom:10px;font-size:12px;color:#555"><summary style="cursor:pointer;font-weight:700">Ver mensagem</summary><div style="white-space:pre-line;background:var(--cc);border-radius:10px;padding:10px;margin-top:6px">' +
    esc(msgConvite(r, l[0])) + '</div></details>' +
    '<div class="card" style="box-shadow:none;border:1px solid #eee;max-height:46vh;overflow-y:auto">' + l.map(function (p) {
      var w = linkWA(p.fone, msgConvite(r, p));
      return '<div class="row" id="cv-' + esc(p.chave.replace(':', '_')) + '">' + avatarP(p) + '<div class="info"><div class="nm">' + esc(p.nome) + '</div>' +
        '<div class="sb">' + esc(p.fone || 'sem telefone') + (p.enviadoEm ? ' · já enviado' : '') + '</div></div>' +
        (w ? '<a class="wa" data-a="rnEnviar" data-v="' + esc(r.id) + '|' + esc(p.chave) + '" href="' + w + '" target="_blank" rel="noopener">Enviar</a>' : '<span class="pill p-cinza">sem nº</span>') + '</div>';
    }).join('') + '</div><div class="gap"></div><button class="btn gh" data-a="fechar">Concluir</button>');
}
var envioPend = {}, envioT = null;
function rnEnviar(v) {
  var p = v.split('|'), rid = p[0], ch = p[1];
  var r = reuniaoPor(rid);
  if (r) (r.participantes || []).forEach(function (x) { if (x.chave === ch) x.enviadoEm = agora(); });
  salvarDB();
  var linha = $('cv-' + ch.replace(':', '_'));
  if (linha) { var a = linha.querySelector('a.wa'); if (a) { a.textContent = 'Enviado ✓'; a.style.background = '#8ac9a3'; } }
  (envioPend[rid] = envioPend[rid] || {})[ch] = 1;
  clearTimeout(envioT);
  envioT = setTimeout(function () {
    Object.keys(envioPend).forEach(function (id) {
      var chs = Object.keys(envioPend[id]); delete envioPend[id];
      chamar('conviteEnviado', { reuniaoId: id, chaves: chs }).catch(function () {});
    });
    if (!$('modal').classList.contains('on')) render();
  }, 1200);
}
/* chamada de uma data */
var chamRn = null;
function rnChamada(aid) {
  var a = aulaPor(aid), r = a && reuniaoPor(a.reuniaoId); if (!a || !r) return;
  chamRn = { id: a.id, reuniaoId: r.id, presencas: JSON.parse(JSON.stringify(a.presencas || {})) };
  var parts = (r.participantes || []).slice().sort(function (x, y) { return x.nome.localeCompare(y.nome, 'pt-BR'); });
  var futuro = a.data > hoje();
  abrirModal('<h2>Chamada</h2><div class="sb" style="font-size:12.5px;color:#888">' + esc(r.titulo) + ' · ' + DIAS[parseData(a.data).getDay()] + ', ' + brCompleto(a.data) + (a.inicio ? ' · ' + esc(a.inicio) : '') + '</div>' +
    (futuro ? '<div class="aviso" style="margin-top:10px">Esta data ainda não chegou. A chamada pode ser lançada no dia.</div>' : '') +
    '<label>Tema do dia</label><input id="au-tema" value="' + esc(a.tema || r.tema || '') + '">' +
    '<div class="sec" style="margin-left:0">Presença · <span id="au-cont"></span></div>' +
    '<div style="display:flex;gap:7px;margin-bottom:6px"><span class="pill p-verde" data-a="auTodos" data-v="P" style="cursor:pointer">todos presentes</span>' +
    '<span class="pill p-cinza" data-a="auTodos" data-v="" style="cursor:pointer">limpar</span></div>' +
    '<div id="au-lista">' + (parts.length ? parts.map(function (p) {
      var m = chamRn.presencas[p.chave] || '';
      return '<div class="chamada"><div class="nm2"><b>' + esc(p.apelido ? p.apelido + ' · ' + p.nome : p.nome) + '</b></div><div class="tg">' + ['P', 'F', 'J'].map(function (x) {
        return '<button class="' + x.toLowerCase() + (m === x ? ' on' : '') + '" data-a="auMarcar" data-v="' + esc(p.chave) + '" data-m="' + x + '"' + (futuro ? ' disabled' : '') + '>' + x + '</button>'; }).join('') + '</div></div>';
    }).join('') : '<div class="empty">Nenhum participante.</div>') + '</div>' +
    '<label>Observações</label><textarea id="au-obs" rows="2">' + esc(a.obs) + '</textarea>' +
    '<div style="height:14px"></div>' + (futuro ? '' : '<button class="btn pr" data-a="auSalvar">Salvar chamada</button><div class="gap"></div>') +
    '<button class="btn gh" data-a="fechar">Fechar</button>');
  contarAu();
}
function contarAu() { var p = 0, n = 0; for (var k in chamRn.presencas) { n++; if (chamRn.presencas[k] === 'P') p++; } var el = $('au-cont'); if (el) el.textContent = p + ' presente(s), ' + n + ' marcado(s)'; }
function auMarcar(ch, btn) {
  var m = btn.getAttribute('data-m');
  if (chamRn.presencas[ch] === m) delete chamRn.presencas[ch]; else chamRn.presencas[ch] = m;
  var bs = btn.parentElement.querySelectorAll('button');
  for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', bs[i].getAttribute('data-m') === chamRn.presencas[ch]);
  contarAu();
}
function auTodos(v) {
  var r = reuniaoPor(chamRn.reuniaoId); chamRn.presencas = {};
  if (v) (r.participantes || []).forEach(function (p) { chamRn.presencas[p.chave] = v; });
  var bs = document.querySelectorAll('#au-lista .tg button');
  for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', !!v && bs[i].getAttribute('data-m') === v);
  contarAu();
}
function auSalvar() {
  var dados = { id: chamRn.id, reuniaoId: chamRn.reuniaoId, presencas: chamRn.presencas, tema: $('au-tema').value.trim(), obs: $('au-obs').value.trim() };
  carregando(true, 'Salvando chamada...');
  (sbDisponivel()?v39SalvarParticipantesReuniao(dados.reuniaoId,Object.keys(dados.presencas||{}).map(function(pid){var x=dados.presencas[pid];return {person_id:pid,attendance_status:x==='P'?'present':x==='J'?'justified':x==='F'?'absent':x};})).then(function(){return {aula:dados};}):chamar('salvarAula', { aula: dados })).then(function (r) {
    db.aulas = (db.aulas || []).filter(function (a) { return a.id !== r.aula.id; }).concat([r.aula]); salvarDB();
    fechar(); render();
    var p = 0; for (var k in r.aula.presencas) if (r.aula.presencas[k] === 'P') p++;
    toast('Chamada salva · ' + p + ' presente(s) ✓');
  }).catch(function (e) { toast(e.message, 4500); }).then(function () { carregando(false); });
}
function blocoCursosHoje(mod) {
  var l = aulasHojeMinhas(mod === undefined ? '' : mod); if (!l.length) return '';
  return '<div class="card" style="border-left:5px solid var(--azul)"><h3 style="margin-bottom:4px">' + (mod === 'inst' ? 'Cursos de hoje' : 'Treinamentos e reuniões de hoje') + '</h3>' + l.map(function (a) {
    var r = reuniaoPor(a.reuniaoId), n = Object.keys(a.presencas || {}).length;
    return '<div class="row cl" data-a="rnChamada" data-v="' + esc(a.id) + '"><div class="info"><div class="nm">' + esc(r.titulo) + (a.inicio ? ' · ' + esc(a.inicio) : '') + '</div>' +
      '<div class="sb">' + esc(r.local || '') + '</div></div><span class="pill ' + (n ? 'p-verde' : 'p-amarelo') + '">' + (n ? 'chamada feita' : 'fazer chamada') + '</span></div>';
  }).join('') + '</div>';
}

/* ═══════════════════ v24: BASE ÚNICA, COMO CONHECEU, ORGANOGRAMA ═══════════════════ */

/* ── como conheceu / recebeu o convite ── */
function campoCanal(px, p, dis, rot) {
  var atual = p ? (p.canal || '') : '', lista = CANAIS.map(function (c) { return [c, c]; });
  if (atual && CANAIS.indexOf(atual) < 0) lista.push([atual, atual + ' (antigo)']);
  return '<label>' + (rot || 'Como conheceu / recebeu o convite') + '</label><select id="' + px + '-canal"' + dis + '>' +
    opts([['', '— selecionar —']].concat(lista), atual) + '</select>' +
    '<div id="' + px + '-canalwrap" class="' + (atual === 'Outros' ? '' : 'hide') + '"><label>Qual? (informe)</label>' +
    '<input id="' + px + '-canaloutro" value="' + esc(p ? p.canalOutro : '') + '" placeholder="Ex.: passou na frente da igreja"' + dis + '></div>';
}
function textoCanal(p) { return p.canal === 'Outros' && p.canalOutro ? 'Outros — ' + p.canalOutro : (p.canal || ''); }

/* ── base única: consulta antes de cadastrar no GC ── */
function blocoCorrespondencias(itens, botoes) {
  return itens.map(function (x) {
    return '<div class="card" style="box-shadow:none;border:1.5px solid ' + (x.forte ? 'var(--vermelho)' : '#e2e2e2') + '">' +
      '<div class="nm" style="font-weight:800">' + esc(x.nome) + (x.apelido ? ' <span style="color:#a87700;font-weight:600">“' + esc(x.apelido) + '”</span>' : '') + '</div>' +
      '<div class="sb" style="font-size:12px;color:#777;margin-top:3px;line-height:1.5">' + esc(x.gc) + (x.lider ? ' · líder ' + esc(x.lider) : '') +
      (x.bairro ? ' · ' + esc(x.bairro) : '') + (x.fone4 ? ' · tel. final ' + esc(x.fone4) : '') +
      (x.visitasIgreja ? ' · ' + x.visitasIgreja + ' visita(s) ao culto' : '') + '</div>' +
      (x.forte ? '<div style="font-size:11.5px;color:var(--vermelho);font-weight:700;margin-top:4px">Mesmo nome e ' + (x.mesmoFone ? 'mesmo telefone' : 'mesma data de nascimento') + ' — é a mesma pessoa.</div>'
        : x.mesmoFone ? '<div style="font-size:11.5px;color:#a87700;margin-top:4px">Mesmo telefone (pode ser alguém da família).</div>' : '') +
      botoes(x) + '</div>';
  }).join('');
}
var gcPendente = null;
function checarAntesGC(o, seguir) {
  carregando(true, 'Consultando a base...');
  (sbDisponivel()?v39ChecarPessoa(o):chamar('checarPessoa', { nome: o.nome, fone: o.fone, nasc: o.nasc })).then(function (r) {
    carregando(false);
    var itens = (r.itens || []).filter(function (x) { return x.id !== o.id; });
    if (!itens.length) return seguir();
    gcPendente = { o: o, seguir: seguir };
    var forte = itens.some(function (x) { return x.forte; }), gid = o.gcId;
    abrirModal('<h2>Esta pessoa já está na base?</h2><div style="font-size:13px;color:#555;line-height:1.5;margin:4px 0 10px">Encontramos ' +
      (itens.length > 1 ? 'cadastros parecidos' : 'um cadastro parecido') + ' com <b>' + esc(o.nome) + '</b>:</div>' +
      blocoCorrespondencias(itens, function (x) {
        if (x.gcId === gid) return '<div class="gap"></div><button class="btn gh sm" data-a="gcAbrirExistente" data-v="' + esc(x.id) + '">Já está no seu GC — abrir cadastro</button>';
        if (!x.gcId) return '<div class="gap"></div><button class="btn pr sm" data-a="gcAssociar" data-v="' + esc(x.id) + '">É esta pessoa — associar ao ' + esc(gcNome(gid)) + '</button>';
        return '<div class="gap"></div><button class="btn gh sm" data-a="gcAssociar" data-v="' + esc(x.id) + '">É esta pessoa — pedir transferência para o ' + esc(gcNome(gid)) + '</button>';
      }) +
      (forte ? '<div class="aviso r">Há um cadastro igual (mesmo nome e telefone/nascimento). Não é possível cadastrar de novo — use o cadastro existente.</div>'
             : '<button class="btn gh" data-a="gcForcarNovo">Não é nenhuma delas — cadastrar como nova pessoa</button><div class="gap"></div>') +
      '<button class="btn gh" data-a="fechar">Voltar</button>');
  }).catch(function () { carregando(false); seguir(); });     // sem internet: o servidor confere ao sincronizar
}
function gcAssociar(pid) {
  var gid = gcPendente ? gcPendente.o.gcId : gcA(), marcarP = ctxPessoa && ctxPessoa.addChamada;
  carregando(true, 'Associando...');
  (sbDisponivel()?v39AssociarPessoaGC(pid,gid,'frontend_v39').then(function(){return {ok:true};}):chamar('associarGC', { pessoaId: pid, gcId: gid })).then(function (r) {
    gcPendente = null; fechar();
    if (r.transferencia) { toast('Pedido de transferência enviado ao supervisor do ' + (r.origem || 'GC de origem') + ' ✓', 5000); return; }
    if (r.pessoa) {
      db.pessoas = db.pessoas.filter(function (x) { return x.id !== r.pessoa.id; }).concat([r.pessoa]); salvarDB();
      if (marcarP) incluirNaChamada(r.pessoa.id, true);
    }
    ctxPessoa = {}; render(); sincronizar(false);
    toast(nomeChamado(r.pessoa || {}) + (r.jaNoGC ? ' já estava no GC.' : ' associado(a) ao ' + gcNome(gid) + ' ✓' + (marcarP ? ' e marcado(a) presente' : '')), 4500);
  }).catch(function (e) { toast(e.message, 5000); }).then(function () { carregando(false); });
}

/* ═══════════════════ ORGANOGRAMA ═══════════════════ */
var orgAbertos = { igreja: 1, pastor: 1 };
function orgStatsGC(g) {
  var ps = PES(g.id).filter(function (p) { return p.status === 'Ativo' || p.status === 'Em visita'; });
  return { part: ps.length, mem: ps.filter(function (p) { return p.status === 'Ativo'; }).length,
           vis: ps.filter(function (p) { return p.status === 'Em visita'; }).length,
           lv: ps.filter(function (p) { return p.lvStatus === 'acompanhando'; }).length, gcs: 1 };
}
function orgSoma(lista) {
  var t = { part: 0, mem: 0, vis: 0, lv: 0, gcs: 0 };
  lista.forEach(function (x) { for (var k in t) t[k] += x[k] || 0; });
  return t;
}
function orgChips(st, campos) {
  var rot = { part: 'participantes', gcs: 'GCs', lv: 'Lar de Vida', mem: 'membros', vis: 'visitantes', fila: 'sem GC', casas: 'casas LV' };
  return '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px">' + campos.map(function (k) {
    return '<span style="background:var(--cc);border-radius:8px;padding:3px 7px;font-size:11px;color:#555"><b style="color:#111;font-size:12.5px">' + (st[k] || 0) + '</b> ' + rot[k] + '</span>';
  }).join('') + '</div>';
}
function orgNo(id, cor, titulo, sub, corpo, filhos, extraClick) {
  var aberto = !!orgAbertos[id], temFilhos = !!filhos;
  return '<div style="margin:6px 0 0">' +
    '<div class="card" style="margin:0;padding:10px 12px;border-left:5px solid ' + cor + ';' + (temFilhos ? 'cursor:pointer' : '') + '"' + (temFilhos ? ' data-a="orgTog" data-v="' + esc(id) + '"' : '') + '>' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div style="min-width:0">' +
    '<div style="font-size:10px;letter-spacing:1px;color:#999;font-weight:800">' + sub + '</div>' +
    '<div style="font-size:14.5px;font-weight:800;margin-top:1px">' + titulo + '</div></div>' +
    (temFilhos ? '<span style="font-size:12px;color:#888;white-space:nowrap">' + (aberto ? '▲' : '▼') + '</span>' : '') + '</div>' + corpo +
    (extraClick || '') + '</div>' +
    (temFilhos && aberto ? '<div style="margin-left:14px;padding-left:10px;border-left:2px dashed #ddd">' + filhos() + '</div>' : '') + '</div>';
}
function orgDiscipulos(g) {
  var ds = discipulosDoGC(g);
  if (!ds.length) return '<div style="font-size:11.5px;color:#999;padding:8px 4px">Nenhum discípulo no cadastro do GC.</div>';
  return ds.map(function (d) {
    var casas = lvCasasDe(d.id).length;
    return orgNo('d_' + g.id + '_' + d.id, '#c9c9c9', esc(d.nome), 'DISCÍPULO', orgChips({ casas: casas }, ['casas']), null);
  }).join('');
}
function orgGC(g) {
  var st = orgStatsGC(g);
  return orgNo('g_' + g.id, 'var(--azul)', esc(g.liderNome || 'Líder não definido') + ' <span style="font-weight:600;color:#777;font-size:12.5px">· ' + esc(g.nome) + '</span>',
    'LÍDER · ' + esc((g.tipoGC || 'GC').toUpperCase()), orgChips(st, ['part', 'mem', 'vis', 'lv']) +
    '<div style="text-align:right;margin-top:6px"><span class="pill p-cinza" data-a="abrirGC" data-v="' + esc(g.id) + '" style="cursor:pointer">abrir GC</span></div>',
    function () { return orgDiscipulos(g); });
}
function orgSupervisores(gcs) {
  var grupos = {}, ordem = [];
  gcs.forEach(function (g) {
    var k = g.supervisorId || '_sem';
    if (!grupos[k]) { grupos[k] = { nome: g.supervisorNome || (k === '_sem' ? 'Sem supervisor' : 'Supervisor'), gcs: [] }; ordem.push(k); }
    grupos[k].gcs.push(g);
  });
  ordem.sort(function (a, b) { return a === '_sem' ? 1 : b === '_sem' ? -1 : grupos[a].nome.localeCompare(grupos[b].nome, 'pt-BR'); });
  return ordem.map(function (k) {
    var gr = grupos[k], st = orgSoma(gr.gcs.map(orgStatsGC));
    var fila = PES().filter(function (p) { return !p.gcId && p.status !== 'Inativo' && p.supRespId === k; }).length;
    st.fila = fila;
    return orgNo('s_' + k, k === '_sem' ? 'var(--vermelho)' : 'var(--verde)', esc(gr.nome), 'SUPERVISOR',
      orgChips(st, ['gcs', 'part', 'mem', 'lv'].concat(fila ? ['fila'] : [])),
      function () { return gr.gcs.sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); }).map(orgGC).join(''); });
  }).join('');
}
function blocoOrganograma() {
  var gcs = GCSativos(), h = '<div class="sec">Organograma</div>';
  if (cfg.modo === 'gc') {                           // líder: o próprio GC
    var g = gcPor(gcA()); if (!g) return '';
    orgAbertos['g_' + g.id] = orgAbertos['g_' + g.id] === undefined ? 1 : orgAbertos['g_' + g.id];
    return h + orgGC(g) + '<div style="height:6px"></div>';
  }
  if (!ehDecisor()) return h + orgSupervisores(gcs) + '<div style="height:6px"></div>';   // supervisor: os próprios GCs
  // pastor / master: igreja inteira
  var todas = PES().filter(function (p) { return p.status === 'Ativo' || p.status === 'Em visita'; });
  var stGC = orgSoma(gcs.map(orgStatsGC));
  var igreja = { part: todas.length, mem: todas.filter(function (p) { return p.status === 'Ativo'; }).length,
                 vis: todas.filter(function (p) { return p.status === 'Em visita'; }).length, gcs: gcs.length, lv: stGC.lv,
                 fila: PES().filter(function (p) { return !p.gcId && p.status !== 'Inativo'; }).length };
  var pastores = (db.equipe || []).filter(function (u) { return u.papel === 'pastor'; }).map(function (u) { return u.nome; });
  if (!pastores.length && igr.config && igr.config.pastorPresidente) pastores = [igr.config.pastorPresidente];
  var corpoPastor = '<div style="font-size:11px;color:#888;font-weight:700;margin-top:8px">IGREJA</div>' +
      orgChips({ mem: igreja.mem, vis: igreja.vis, fila: igreja.fila }, ['mem', 'vis', 'fila']) +
      '<div style="font-size:11px;color:#888;font-weight:700;margin-top:8px">GCs</div>' + orgChips(stGC, ['gcs', 'part', 'mem', 'lv']) +
      '<div style="font-size:11px;color:#888;font-weight:700;margin-top:8px">CONSOLIDADO (IGREJA + GCs)</div>' + orgChips(igreja, ['part', 'mem', 'gcs', 'lv']);
  return h + orgNo('igreja', 'var(--dourado)', esc(igrNome()), 'IGREJA', orgChips(igreja, ['part', 'gcs', 'lv', 'mem']),
    function () {
      return orgNo('pastor', '#111', esc(pastores.join(', ') || 'Pastor'), 'PASTOR', corpoPastor, function () { return orgSupervisores(gcs); });
    }) + '<div style="height:6px"></div>';
}

/* ═══════════════════ v25: MENSAGENS DOS CULTOS/EVENTOS (WhatsApp) ═══════════════════ */
var msgImgNova = null, msgImgCache = {}, msgLista = null;
var MSG_PUBLICOS = [['membros', 'Membros ativos'], ['todos', 'Membros e visitantes'], ['visitantes', 'Só visitantes'], ['gc', 'Um GC específico']];
function isoLocalInput(iso) {
  if (!iso) return '';
  var d = new Date(iso); if (isNaN(d)) return '';
  return isoData(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function evFormMensagem(e) {
  var prog = e.msgStatus === 'agendada' || e.msgStatus === 'enviando';
  var sugest = e.data ? e.data + 'T' + (e.inicio ? (function () { var m = minStr(e.inicio) - 180; return hhmm(Math.max(m, 480)); })() : '09:00') : '';
  var img = msgImgNova && msgImgNova !== '__remover__' ? msgImgNova : (e.id && e.temImg ? (msgImgCache[e.id] || '') : '');
  if (e.id && e.temImg && !msgImgCache[e.id] && msgImgNova === null) carregarImgMsg(e.id);
  return '<div class="sec" style="margin-left:0">Mensagem para os membros (WhatsApp)</div>' +
    '<div style="font-size:11.5px;color:#888;line-height:1.5;margin-bottom:4px">Imagem (arte do culto) e texto do convite. Vão só para quem <b>autorizou o uso dos dados</b> e tem telefone.</div>' +
    '<label>Imagem</label><div class="fotoprev" data-a="evEscolherImg" id="ev-msgimgprev" style="height:170px;background-size:contain;background-color:#f4f4f5;' +
      (img ? "background-image:url('" + img + "');border:none;color:transparent" : '') + '">' + (e.temImg && !img && msgImgNova === null ? 'Carregando imagem...' : 'Toque para escolher a imagem') + '</div>' +
    '<div id="ev-msgimgrem" style="text-align:right;margin-top:6px" class="' + (img || (e.temImg && msgImgNova === null) ? '' : 'hide') + '"><span class="pill p-cinza" data-a="evRemImg" style="cursor:pointer">remover imagem</span></div>' +
    '<label>Texto da mensagem</label><textarea id="ev-msgtxt" rows="5" maxlength="1000" placeholder="Ex.: Neste domingo, 19h, Culto da Família! Traga sua família e amigos. 🙏">' + esc(e.msgTexto) + '</textarea>' +
    '<div class="g2"><div><label>Para quem</label><select id="ev-msgpub">' + opts(MSG_PUBLICOS, e.msgPublico || 'membros') + '</select></div>' +
    '<div id="ev-msggcwrap" class="' + (e.msgPublico === 'gc' ? '' : 'hide') + '"><label>GC</label><select id="ev-msggc">' + opts(GCS().map(function (g) { return [g.id, g.nome]; }), e.msgGcId) + '</select></div></div>' +
    '<label>Envio programado</label><select id="ev-msgprog">' + opts([['nao', 'Não programar (enviar manualmente)'], ['sim', 'Programar envio automático']], prog ? 'sim' : 'nao') + '</select>' +
    '<div id="ev-msgquandowrap" class="' + (prog ? '' : 'hide') + '"><label>Data e hora do envio</label><input id="ev-msgquando" type="datetime-local" value="' + esc(isoLocalInput(e.msgAgendada) || sugest) + '">' +
    '<div style="font-size:11px;color:' + (db.waApi ? '#1f6b40' : '#a87700') + ';margin-top:4px;line-height:1.45">' +
    (db.waApi ? 'API oficial do WhatsApp configurada: o envio sai sozinho no horário (verificado a cada 10 minutos).'
              : 'A API oficial do WhatsApp ainda não está configurada: no horário, use o botão “Mensagem WhatsApp” do evento para enviar (lista de transmissão ou um a um).') + '</div></div>' +
    (e.msgStatus ? '<div style="font-size:11.5px;color:#666;margin-top:8px">' + textoStatusMsg(e) + '</div>' : '');
}
function textoStatusMsg(e) {
  var st = e.msgStatus;
  if (st === 'agendada') return '⏰ Envio programado para ' + dataHoraLocal(e.msgAgendada) + ' · ' + nomePublico(e);
  if (st === 'enviando') return '📤 Enviando: ' + (e.msgEnviados || 0) + ' enviada(s)' + (+e.msgFalhas ? ', ' + e.msgFalhas + ' falha(s)' : '');
  if (st === 'enviada') return '✅ Enviada em ' + dataHoraLocal(e.msgEnviadoEm) + ' · ' + (e.msgEnviados || 0) + ' pessoa(s)' + (+e.msgFalhas ? ' · ' + e.msgFalhas + ' falha(s)' : '') + (e.msgErro === 'envio assistido' ? ' (envio assistido)' : '');
  if (st === 'falhou') return '⚠️ Envio falhou: ' + esc(e.msgErro || 'erro na API');
  if (st === 'cancelada') return 'Envio programado cancelado.';
  return '';
}
function nomePublico(e) {
  var p = MSG_PUBLICOS.filter(function (x) { return x[0] === (e.msgPublico || 'membros'); })[0];
  return (p ? p[1] : 'Membros') + (e.msgPublico === 'gc' && e.msgGcId ? ' — ' + gcNome(e.msgGcId) : '');
}
function linhaMensagem(e) {
  if (!e.msgTexto && !e.temImg) return '';
  return '<br><b>Mensagem:</b> ' + (e.temImg ? '🖼️ ' : '') + (textoStatusMsg(e) || 'pronta, ainda não enviada');
}
function carregarImgMsg(id) {
  (sbDisponivel()?Promise.all([v39Arquivos(),sbCliente().schema('app').from('file_links').select('*').eq('entity_type','worship_service').eq('entity_id',id)]).then(function(r){if(r[1].error)throw r[1].error;var ids={};(r[1].data||[]).forEach(function(x){ids[x.file_id]=1;});return {itens:(r[0]||[]).filter(function(f){return ids[f.id];}).map(function(f){return {nome:f.original_file_name||'arquivo',url:f.storage_path||'',tipo:f.mime_type||''};})};}):chamar('midiaEvento', { id: id })).then(function (r) {
    msgImgCache[id] = r.img;
    if (msgImgNova === null && $('ev-msgimgprev')) pintarImgMsg(r.img);
    if ($('msg-prev')) $('msg-prev').style.backgroundImage = "url('" + r.img + "')";
  }).catch(function () {});
}
function pintarImgMsg(url) {
  var p = $('ev-msgimgprev'); if (!p) return;
  p.style.backgroundImage = url ? "url('" + url + "')" : ''; p.style.border = url ? 'none' : ''; p.style.color = url ? 'transparent' : '';
  p.textContent = url ? '' : 'Toque para escolher a imagem';
  var r = $('ev-msgimgrem'); if (r) r.classList.toggle('hide', !url);
}
/** Reduz a imagem no aparelho (até 1280 px, JPEG) antes de enviar. */
function processarImgMsg(file) {
  if (!file) return;
  var fr = new FileReader();
  fr.onload = function () {
    var img = new Image();
    img.onload = function () {
      var max = 1280, q = 0.82, url = '';
      for (var t = 0; t < 6; t++) {
        var k = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
        url = cv.toDataURL('image/jpeg', q);
        if (url.length < 900000) break;
        max = Math.round(max * 0.85); q = Math.max(0.6, q - 0.06);
      }
      msgImgNova = url; pintarImgMsg(url);
    };
    img.onerror = function () { toast('Arquivo de imagem inválido.'); };
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
}
function textoPessoal(e, nome) { return 'Olá, ' + (nome || '') + '! 👋\n\n' + (e.msgTexto || ''); }
/* ── tela de envio ── */
function evMensagem(id) {
  var e = eventoPor(id); if (!e) return;
  msgLista = null;
  abrirModal('<h2>Mensagem WhatsApp</h2><div class="sb" style="font-size:12.5px;color:#888">' + esc(e.titulo) + ' · ' + brCompleto(e.data) + '</div>' +
    (e.temImg ? '<div id="msg-prev" class="fotoprev" style="height:200px;background-size:contain;background-color:#f4f4f5;border:none;margin-top:10px;' +
      (msgImgCache[id] ? "background-image:url('" + msgImgCache[id] + "')" : '') + '"></div>' : '') +
    (e.msgTexto ? '<div style="white-space:pre-line;background:var(--cc);border-radius:12px;padding:10px 12px;font-size:13px;margin-top:10px">' + esc(e.msgTexto) + '</div>' : '') +
    '<div id="msg-info" style="font-size:12.5px;color:#555;margin:10px 2px">Calculando destinatários...</div>' +
    (e.msgStatus ? '<div style="font-size:12px;color:#666;margin-bottom:8px">' + textoStatusMsg(e) + '</div>' : '') +
    '<div id="msg-botoes"></div><div class="gap"></div><button class="btn gh" data-a="fechar">Fechar</button>');
  if (e.temImg && !msgImgCache[id]) carregarImgMsg(id);
  (sbDisponivel()?v39MsgDestinatarios(e):chamar('msgDestinatarios', { id: id })).then(function (r) {
    msgLista = r.itens || [];
    $('msg-info').innerHTML = '<b>' + msgLista.length + '</b> pessoa(s) com autorização e telefone · ' + esc(nomePublico(e));
    $('msg-botoes').innerHTML =
      (r.api ? '<button class="btn pr" data-a="msgApi" data-v="' + esc(id) + '">Enviar agora pela API oficial (' + msgLista.length + ')</button><div class="gap"></div>' : '') +
      '<button class="btn" data-a="msgCompartilhar" data-v="' + esc(id) + '">Compartilhar imagem + texto (lista de transmissão)</button>' +
      '<div style="font-size:11px;color:#888;margin:5px 2px 10px;line-height:1.45">Abre o WhatsApp com a arte e o texto prontos. Escolha a sua <b>lista de transmissão</b> (ou o grupo da igreja) e envie de uma vez.</div>' +
      '<button class="btn gh" data-a="msgIndividual" data-v="' + esc(id) + '">Enviar um a um (texto personalizado)</button>';
  }).catch(function (er) { $('msg-info').textContent = er.message; });
}
function msgApi(id) {
  var e = eventoPor(id); if (!e) return;
  if (!confirm('Enviar agora para ' + (msgLista ? msgLista.length : '') + ' pessoa(s) pela API oficial do WhatsApp?\nCada mensagem é cobrada pela Meta conforme a categoria do modelo.')) return;
  carregando(true, 'Enviando...');
  (sbDisponivel()?v39FilaMensagem(e).then(function(r){e.msgBatchId=r.batch_id;return {fim:true,enviados:r.queued||0,falhas:0,erro:''};}):chamar('msgEnviarAgora', { id: id })).then(function (r) {
    fechar(); sincronizar(false);
    toast(r.fim ? 'Enviado ✓ ' + r.enviados + ' mensagem(ns)' + (r.falhas ? ', ' + r.falhas + ' falha(s): ' + r.erro : '')
                : r.enviados + ' enviada(s) até agora — o restante continua automaticamente nos próximos minutos.', 7000);
  }).catch(function (er) { toast(er.message, 6000); }).then(function () { carregando(false); });
}
function msgCompartilhar(id) {
  var e = eventoPor(id); if (!e) return;
  var txt = e.msgTexto || e.titulo, img = msgImgCache[id];
  var copiar = function () { try { navigator.clipboard.writeText(txt); } catch (x) {} };
  if (img && navigator.canShare) {
    fetch(img).then(function (r) { return r.blob(); }).then(function (b) {
      var f = new File([b], 'convite.jpg', { type: b.type || 'image/jpeg' });
      if (navigator.canShare({ files: [f] })) {
        copiar();
        return navigator.share({ files: [f], text: txt }).then(function () { msgPerguntarFeito(id); });
      }
      throw new Error('sem suporte');
    }).catch(function (er) { if (er && er.name === 'AbortError') return; msgBaixar(e, img, txt); });
    return;
  }
  if (!img) { window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank'); msgPerguntarFeito(id); return; }
  msgBaixar(e, img, txt);
}
function msgBaixar(e, img, txt) {
  var a = document.createElement('a'); a.href = img; a.download = (e.titulo || 'convite').replace(/\s+/g, '_') + '.jpg';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  try { navigator.clipboard.writeText(txt); } catch (x) {}
  toast('Imagem baixada e texto copiado. No WhatsApp, abra a lista de transmissão, anexe a imagem e cole o texto.', 7000);
}
function msgPerguntarFeito(id) {
  setTimeout(function () {
    if (confirm('Conseguiu enviar a mensagem? Marcar como enviada?')) msgFeito(id);
  }, 1200);
}
function msgIndividual(id) {
  var e = eventoPor(id); if (!e || !msgLista) return;
  abrirModal('<h2>Enviar um a um</h2><div style="font-size:12.5px;color:#666;line-height:1.5;margin:4px 0 10px">Toque em <b>Enviar</b>: o WhatsApp abre com o texto personalizado. ' +
    (e.temImg ? 'A imagem não vai pelo link — para mandar a arte, use “Compartilhar”.' : '') + '</div>' +
    '<div class="card" style="box-shadow:none;border:1px solid #eee;max-height:52vh;overflow-y:auto">' + (msgLista.length ? msgLista.map(function (p) {
      return '<div class="row">' + avatarP(p) + '<div class="info"><div class="nm">' + esc(p.nome) + '</div><div class="sb">' + esc(p.fone) + '</div></div>' +
        '<a class="wa" target="_blank" rel="noopener" href="https://wa.me/' + p.fone + '?text=' + encodeURIComponent(textoPessoal(e, p.apelido || pri(p.nome))) + '" data-a="waFeito">Enviar</a></div>';
    }).join('') : '<div class="empty">Ninguém com autorização e telefone neste público.</div>') + '</div>' +
    '<div class="gap"></div><button class="btn pr" data-a="msgFeito" data-v="' + esc(id) + '">Concluir e marcar como enviada</button><div class="gap"></div><button class="btn gh" data-a="fechar">Fechar</button>');
}
function msgFeito(id) {
  var e=eventoPor(id);
  carregando(true, 'Registrando...');
  (sbDisponivel()&&e.msgBatchId?v39MarcarFila(e.msgBatchId,'sent'):chamar('msgMarcarEnvio', { id: id, qtd: msgLista ? msgLista.length : 0 })).then(function () { fechar(); sincronizar(false); toast('Mensagem marcada como enviada ✓'); })
    .catch(function (er) { toast(er.message, 4500); }).then(function () { carregando(false); });
}

/* ═══════════════════ v28: ENCONTROS DO GC (chamada vinculada ao encontro), ESCALA, RECUPERAR ACESSO ═══════════════════ */
var FUNCOES_GC = [['louvor', 'Louvor'], ['dizimos', 'Dízimos/Ofertas'], ['dinamica', 'Dinâmicas'], ['recados', 'Recados'], ['pregador', 'Pregador'], ['oracao', 'Oração Final']];
function nomeFuncao(f) { for (var i = 0; i < FUNCOES_GC.length; i++) if (FUNCOES_GC[i][0] === f) return FUNCOES_GC[i][1]; return f; }
function agoraMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
/** Janela da chamada do GC: no dia do encontro, 1h antes do horário até 4h depois (sem horário: o dia todo). */
function encAbertoGC(e) {
  if (!e || e.deleted || e.data !== hoje()) return false;
  var ini = minStr(e.horario); if (ini === null) return true;
  var m = agoraMin(); return m >= ini - 60 && m <= ini + 240;
}
function textoJanelaGC(e) {
  var ini = minStr(e && e.horario);
  return ini === null ? 'durante todo o dia do encontro' : 'das ' + hhmm(ini - 60) + ' às ' + hhmm(ini + 240) + ' do dia ' + br(e.data);
}
/** Quem cuida do encontro (líder) lança em qualquer data até hoje; os demais só dentro da janela do encontro. */
function podeChamada(e) {
  if (!e || e.deleted) return false;
  if (pode('gcEvento')) return e.data <= hoje();
  return encAbertoGC(e);
}
/* ── equipe do GC (líder + discípulos) para a escala ── */
function equipeDoGC(gcId) {
  var l = (db.equipeGC || []).filter(function (x) { return x.gcId === gcId; });
  if (l.length) return l;
  var g = gcPor(gcId), out = [];
  if (g && g.liderId) out.push({ id: g.liderId, nome: g.liderNome || 'Líder', fone: '', funcao: 'Líder' });
  discipulosDoGC(g).forEach(function (d) { if (d.id !== (g && g.liderId)) out.push({ id: d.id, nome: d.nome, fone: '', funcao: 'Discípulo' }); });
  return out;
}
function nomeEquipe(gcId, uid) { var x = equipeDoGC(gcId).filter(function (p) { return p.id === uid; })[0]; return x ? x.nome : ''; }
function escalaCampos(e, gcId) {
  var eq = equipeDoGC(gcId), es = (e && e.escala) || {};
  var op = [['', '— ninguém —']].concat(eq.map(function (p) { return [p.id, p.nome + (p.funcao === 'Líder' ? ' (líder)' : '')]; }));
  return '<div class="sec" style="margin-left:0">Escala do encontro</div>' +
    '<div style="font-size:11.5px;color:#888;margin:-2px 0 4px;line-height:1.45">Quem for escalado recebe o aviso no painel do app' + (db.waApi ? ' e no WhatsApp' : '') + '.</div>' +
    '<div class="g2">' + FUNCOES_GC.map(function (f) {
      return '<div><label>' + f[1] + '</label><select class="es-sel" data-f="' + f[0] + '">' + opts(op, es[f[0]] || '') + '</select></div>';
    }).join('') + '</div>' +
    (eq.length ? '' : '<div style="font-size:11.5px;color:#a87700;margin-top:6px">Nenhum discípulo vinculado a este GC ainda (cadastre em Editar GC).</div>');
}
function lerEscala() {
  var o = {}, sels = document.querySelectorAll('.es-sel');
  for (var i = 0; i < sels.length; i++) if (sels[i].value) o[sels[i].getAttribute('data-f')] = sels[i].value;
  return o;
}
function novosNaEscala(antes, depois) {
  antes = antes || {}; var out = [];
  FUNCOES_GC.forEach(function (f) { if (depois[f[0]] && depois[f[0]] !== antes[f[0]]) out.push({ funcao: f[0], uid: depois[f[0]] }); });
  return out;
}
function textoEscala(e, funcao, nome) {
  var d = parseData(e.data);
  return 'Olá, ' + pri(nome) + '! Você está na escala de *' + nomeFuncao(funcao) + '* no encontro do ' + gcNome(e.gcId) + ' — ' +
    DIAS[d.getDay()].toLowerCase() + ', ' + br(e.data) + (e.horario ? ' às ' + e.horario : '') + (e.tema ? '. Tema: ' + e.tema : '') + '. Contamos com você! 🙏';
}
/** Envio assistido: abre o WhatsApp de cada escalado com a mensagem pronta (com a API oficial, o servidor envia sozinho). */
function avisarEscalaModal(data, lista) {
  var e = achaEnc(gcA(), data); if (!e) return;
  lista = lista || FUNCOES_GC.filter(function (f) { return e.escala && e.escala[f[0]]; }).map(function (f) { return { funcao: f[0], uid: e.escala[f[0]] }; });
  if (!lista.length) return toast('Ninguém escalado neste encontro.');
  var eq = equipeDoGC(e.gcId);
  abrirModal('<h2>Avisar a escala</h2><div style="font-size:12.5px;color:#666;line-height:1.5;margin:4px 0 10px">' +
    (db.waApi ? 'A API do WhatsApp está ativa: o aviso já foi enviado automaticamente. Use os botões abaixo só se quiser reforçar.' :
      'O aviso já aparece no painel de cada pessoa. Toque em <b>Enviar</b> para mandar também pelo WhatsApp.') + '</div>' +
    '<div class="card" style="box-shadow:none;border:1px solid #eee">' + lista.map(function (x) {
      var p = eq.filter(function (q) { return q.id === x.uid; })[0] || { nome: 'Pessoa', fone: '' }, f = fone(p.fone);
      var w = f ? 'https://wa.me/' + (f.length <= 11 ? '55' : '') + f + '?text=' + encodeURIComponent(textoEscala(e, x.funcao, p.nome)) : '';
      return '<div class="row">' + avatarP(p) + '<div class="info"><div class="nm">' + esc(p.nome) + '</div><div class="sb">' + nomeFuncao(x.funcao) + '</div></div>' +
        (w ? '<a class="wa" target="_blank" rel="noopener" href="' + w + '" data-a="waFeito">Enviar</a>' : '<span class="pill p-cinza">sem nº</span>') + '</div>';
    }).join('') + '</div><div class="gap"></div><button class="btn gh" data-a="fechar">Concluir</button>');
}
/* ── aba Encontros ── */
function statusEnc(e) {
  if (marcados(e)) return ['p-verde', 'chamada feita · ' + presentes(e)];
  if (e.data > hoje()) return ['p-cinza', 'agendado'];
  if (encAbertoGC(e)) return ['p-dour', 'chamada aberta'];
  if (e.data === hoje()) return ['p-amarelo', 'hoje · abre ' + (minStr(e.horario) === null ? 'o dia todo' : hhmm(minStr(e.horario) - 60))];
  return ['p-vermelho', 'sem chamada'];
}
function listaEncontros(id, sel) {
  var hj = hoje(), todos = encOrd(id);
  var prox = todos.filter(function (e) { return e.data >= hj; }).slice(0, 6);
  var pass = todos.filter(function (e) { return e.data < hj; }).slice(-5).reverse();
  var linha = function (e) {
    var d = parseData(e.data), st = statusEnc(e), on = e.data === sel;
    return '<div class="row cl" data-a="encSel" data-v="' + esc(e.data) + '" style="' + (on ? 'background:#fff8e6;border-radius:10px;padding-left:6px;padding-right:6px' : '') + '">' +
      '<div class="av" style="flex-direction:column;font-size:10.5px;line-height:1.1"><b style="font-size:14px">' + e.data.slice(8, 10) + '</b>' + MESES[d.getMonth()] + '</div>' +
      '<div class="info"><div class="nm">' + DIAS[d.getDay()] + (e.horario ? ' · ' + esc(e.horario) : '') + (e.tema ? ' — ' + esc(e.tema) : '') + '</div>' +
      '<div class="sb">' + (e.anfitriao ? 'Pregador: ' + esc(e.anfitriao) : 'pregador a definir') + '</div></div>' +
      '<span class="pill ' + st[0] + '">' + st[1] + '</span></div>';
  };
  var h = '<div class="sec" style="margin-top:0">Encontros</div><div class="card">' +
    (prox.length ? prox.map(linha).join('') : '<div class="empty" style="padding:10px">Nenhum encontro de hoje em diante.' + (pode('gcEvento') ? '' : ' O líder cria os encontros.') + '</div>') +
    (pass.length ? '<div style="font-size:10.5px;color:#999;font-weight:800;letter-spacing:.6px;margin:10px 0 2px">ANTERIORES</div>' + pass.map(linha).join('') : '') +
    (pode('gcEvento') ? '<div class="g2" style="margin-top:10px"><button class="btn gh" data-a="encAgendar">+ Novo encontro</button>' +
      '<div><input type="date" id="ch-outra" max="' + hj + '" title="Encontro de outra data"></div></div>' +
      '<div style="font-size:10.5px;color:#999;margin-top:4px">Use a data para abrir ou lançar um encontro passado.</div>' : '') + '</div>';
  return h;
}
function cartaoEncontro(e) {
  var es = e.escala || {}, temEsc = FUNCOES_GC.some(function (f) { return es[f[0]]; });
  return '<div class="card" style="border-left:5px solid var(--dourado)">' +
    '<div style="font-size:11px;color:#888;font-weight:800;letter-spacing:.6px">' + DIAS[parseData(e.data).getDay()].toUpperCase() + ', ' + brCompleto(e.data) + (e.horario ? ' · ' + esc(e.horario) : '') + '</div>' +
    '<div style="font-size:13px;color:#444;margin-top:6px;line-height:1.6"><b>Tema:</b> ' + esc(e.tema || '—') + '<br><b>Pregador:</b> ' + esc(e.anfitriao || '—') + '</div>' +
    (temEsc ? '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:8px">' + FUNCOES_GC.filter(function (f) { return es[f[0]]; }).map(function (f) {
      var meu = es[f[0]] === eu().id;
      return '<span style="background:' + (meu ? '#fff1c7' : 'var(--cc)') + ';border-radius:8px;padding:4px 8px;font-size:11.5px"><b>' + f[1] + ':</b> ' + esc(nomeEquipe(e.gcId, es[f[0]]) || '—') + '</span>';
    }).join('') + '</div>' : '<div style="font-size:11.5px;color:#999;margin-top:6px">Escala ainda não definida.</div>') +
    (e.recados ? '<div style="background:var(--cc);border-radius:10px;padding:9px 10px;font-size:12.5px;margin-top:8px;white-space:pre-line"><b>Recados:</b> ' + esc(e.recados) + '</div>' : '') +
    (pode('gcEvento') ? '<div style="display:flex;gap:7px;margin-top:10px;flex-wrap:wrap"><button class="btn pr sm" data-a="encEditar" data-v="' + esc(e.data) + '">Editar encontro e escala</button>' +
      (temEsc ? '<button class="btn gh sm" data-a="avisarEscala" data-v="' + esc(e.data) + '">Avisar escala no WhatsApp</button>' : '') + '</div>' : '') + '</div>';
}
function blocoMinhasEscalas() {
  var me = eu().id, hj = hoje(), l = [];
  ENC().forEach(function (e) {
    if (e.data < hj || !e.escala) return;
    FUNCOES_GC.forEach(function (f) { if (e.escala[f[0]] === me) l.push({ e: e, f: f[1] }); });
  });
  if (!l.length) return '';
  l.sort(function (a, b) { return a.e.data < b.e.data ? -1 : 1; });
  return '<div class="card" style="border-left:5px solid var(--dourado);background:#fffaf0"><h3 style="margin-bottom:4px">Minhas escalas</h3>' + l.slice(0, 6).map(function (x) {
    return '<div class="row" style="padding:7px 0"><div class="info"><div class="nm">' + esc(x.f) + ' · ' + esc(gcNome(x.e.gcId)) + '</div>' +
      '<div class="sb">' + DIAS[parseData(x.e.data).getDay()] + ', ' + br(x.e.data) + (x.e.horario ? ' às ' + esc(x.e.horario) : '') + (x.e.tema ? ' · ' + esc(x.e.tema) : '') + '</div></div>' +
      (x.e.data === hj ? '<span class="pill p-dour">hoje</span>' : '') + '</div>';
  }).join('') + '</div>';
}
/* ── recuperar acesso ── */
function abrirRecuperar() {
  abrirModal('<h2>Esqueci a senha ou o usuário</h2><div style="font-size:12.5px;color:#666;line-height:1.5;margin:4px 0 6px">Informe o <b>e-mail</b> do seu cadastro (ou o seu usuário). ' +
    'Vamos enviar seu usuário e uma <b>senha temporária</b>, válida por 24 horas. Ao entrar, o app pede para você criar uma senha nova.</div>' +
    '<label>E-mail ou usuário</label><input id="rc-chave" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="nome@email.com">' +
    '<div style="height:14px"></div><button class="btn pr" data-a="recEnviar">Enviar</button><div class="gap"></div><button class="btn gh" data-a="fechar">Voltar</button>' +
    '<div style="font-size:11px;color:#999;margin-top:10px;line-height:1.45">Sem e-mail no cadastro? Peça à liderança para corrigir seus dados ou redefinir sua senha.</div>');
}
function recEnviar() {
  var c = ($('rc-chave').value || '').trim();
  if (c.length < 3) return toast('Informe o e-mail ou o usuário.');
  carregando(true, 'Enviando...');
  chamarBruto({ acao: 'recuperar', chave: c }).then(function (r) {
    if (!r || !r.ok) throw new Error((r && r.erro) || 'Não foi possível enviar agora.');
    abrirModal('<h2>Verifique seu e-mail</h2><div class="ok-box">' + esc(r.msg) + '</div><div class="gap"></div><button class="btn pr" data-a="fechar">Entendi</button>');
  }).catch(function (e) { toast(e.message, 5000); }).then(function () { carregando(false); });
}
var senhaObrig = false;
function verificarSenhaTemp() {
  if (!cfg.token || !cfg.usuario || !cfg.usuario.trocarSenha || senhaObrig) return;
  senhaObrig = true;
  abrirModal('<h2>Crie sua nova senha</h2><div class="aviso" style="margin-top:6px">Você entrou com uma <b>senha temporária</b>. Para continuar, defina uma senha nova (mínimo 6 caracteres).</div>' +
    '<label>Nova senha</label><input id="ns-n" type="password" autocomplete="new-password"><label>Confirmar nova senha</label><input id="ns-c" type="password" autocomplete="new-password">' +
    '<div style="height:14px"></div><button class="btn pr" data-a="salvarSenhaNova">Salvar e continuar</button><div class="gap"></div><button class="btn gh" data-a="sairSenhaTemp">Sair</button>');
}
function salvarSenhaNova() {
  var n = $('ns-n').value, c = $('ns-c').value, us = eu().usuario;
  if (n.length < 6) return toast('A senha precisa ter pelo menos 6 caracteres.');
  if (n !== c) return toast('As senhas não conferem.');
  carregando(true, 'Salvando...');
  chamar('trocarSenha', { atual: '', nova: hashSenha(us, n) }).then(function () {
    senhaObrig = false; cfg.usuario.trocarSenha = false; salvarCfg(); fechar(); toast('Senha criada ✓ Bem-vindo(a)!'); sincronizar(false);
  }).catch(function (e) { toast(e.message, 4500); }).then(function () { carregando(false); });
}

/* ═══════════════════ v31: INÍCIO PERSONALIZADO POR PERFIL ═══════════════════ */
function saudacao() {
  var h = new Date().getHours(), s = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  var n = pri(eu().nome || ''), pap = papel() === 'pastor' ? 'Pr. ' : '';
  return s + (n ? ', ' + pap + n : '');
}
function dataLonga(iso) {
  var d = parseData(iso || hoje());
  return DIAS[d.getDay()] + ', ' + d.getDate() + ' de ' + ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][d.getMonth()];
}
function topoInicio(sub) {
  return '<div class="ini-ola">' + esc(saudacao()) + '</div><div class="ini-sub">' + sub + '</div>';
}
/** Cartão escuro em destaque: o que importa agora. botoes = [[texto, acao, valor, claro?]] */
function heroCard(peq, grande, linha, botoes) {
  return '<div class="hero"><small>' + peq + '</small><div class="big">' + grande + '</div>' + (linha ? '<div class="mt">' + linha + '</div>' : '') +
    (botoes && botoes.length ? '<div class="acts">' + botoes.map(function (b) {
      return '<button class="hbtn' + (b[3] ? ' w' : '') + '" data-a="' + b[1] + '"' + (b[2] != null ? ' data-v="' + esc(b[2]) + '"' : '') + '>' + b[0] + '</button>';
    }).join('') + '</div>' : '') + '</div>';
}
function statCard(rot, val, det, cls) {
  return '<div class="st"><small>' + rot + '</small><b>' + val + '</b>' + (det ? '<div class="d ' + (cls || '') + '">' + det + '</div>' : '') + '</div>';
}
/** Linha de lista com número/ícone colorido. */
function linhaAtencao(n, cor, titulo, sub, chip, chipCls, acao, valor) {
  return '<div class="row' + (acao ? ' cl' : '') + '"' + (acao ? ' data-a="' + acao + '"' + (valor != null ? ' data-v="' + esc(valor) + '"' : '') : '') + '>' +
    '<div class="av" style="background:' + cor + ';color:#fff">' + n + '</div><div class="info"><div class="nm">' + titulo + '</div><div class="sb">' + sub + '</div></div>' +
    (chip ? '<span class="pill ' + chipCls + '">' + chip + '</span>' : '') + '</div>';
}
function proximoCulto() {
  var hj = hoje(), agoraM = new Date().getHours() * 60 + new Date().getMinutes();
  return EVS().filter(function (e) {
    if (e.data < hj) return false;
    if (e.data > hj) return true;
    var f = minStr(e.fim) !== null ? minStr(e.fim) : (minStr(e.inicio) !== null ? minStr(e.inicio) + 120 : 1440);
    return f >= agoraM;
  }).sort(function (a, b) { return (a.data + (a.inicio || '')) < (b.data + (b.inicio || '')) ? -1 : 1; })[0] || null;
}
function quandoTxt(iso, hora) {
  var hj = hoje(), am = parseData(hj); am.setDate(am.getDate() + 1);
  return (iso === hj ? 'Hoje' : iso === isoData(am) ? 'Amanhã' : DIAS[parseData(iso).getDay()] + ' · ' + br(iso)) + (hora ? ' · ' + esc(hora) : '');
}
function proximoEncGC(gcId) { var hj = hoje(); return encOrd(gcId).filter(function (e) { return e.data >= hj; })[0] || null; }
function minhasEscalas() {
  var me = eu().id, hj = hoje(), l = [];
  ENC().forEach(function (e) {
    if (e.data < hj || !e.escala) return;
    FUNCOES_GC.forEach(function (f) { if (e.escala[f[0]] === me) l.push({ e: e, f: f[1] }); });
  });
  return l.sort(function (a, b) { return a.e.data < b.e.data ? -1 : 1; });
}
function gradeEscala(e) {
  var es = (e && e.escala) || {};
  return '<div class="esc">' + FUNCOES_GC.map(function (f) {
    var uid = es[f[0]], nm = uid ? nomeEquipe(e.gcId, uid) : '', meu = uid && uid === eu().id;
    return '<div class="' + (meu ? 'me' : '') + '"><small>' + f[1].toUpperCase() + '</small><b' + (nm ? '' : ' style="color:var(--tx3)"') + '>' +
      (nm ? esc(meu ? pri(nm) + ' (você)' : nm) : 'a definir') + '</b></div>';
  }).join('') + '</div>';
}
function aniversarioEm(p, dias) {
  if (!p.nasc || p.nasc.length < 10) return null;
  var hj = parseData(hoje());
  for (var i = 0; i <= dias; i++) {
    var d = new Date(hj); d.setDate(d.getDate() + i);
    if (pad(d.getMonth() + 1) === p.nasc.slice(5, 7) && pad(d.getDate()) === p.nasc.slice(8, 10)) return i;
  }
  return null;
}

/* ── PASTOR / MASTER / SUPERVISOR ── */
function inicioGestor() {
  var gcs = GCSativos(), ids = gcs.map(function (g) { return g.id; }), cu = proximoCulto(), h = '';
  h += topoInicio(dataLonga() + (cu && cu.data === hoje() ? ' · ' + esc(cu.titulo) + (cu.inicio ? ' às ' + esc(cu.inicio) : '') : ''));
  if (cu) {
    var aberto = eventoAbertoAgora();
    h += heroCard(cu.data === hoje() ? 'HOJE' : 'PRÓXIMO CULTO', esc(cu.titulo), quandoTxt(cu.data, cu.inicio) +
      (cu.liberado ? ' · ' + (aberto && aberto.id === cu.id ? 'cadastro de visitantes aberto' : textoJanela(cu)) : ''),
      [['Ver culto', 'aba', 'cultos', true]].concat(pode('eventos') && (cu.msgTexto || cu.temImg) ? [['Mensagem', 'evMensagem', cu.id]] : []));
  } else if (pode('eventos')) {
    h += heroCard('AGENDA', 'Nenhum culto agendado', 'Crie os cultos da semana para liberar o cadastro de visitantes.', [['Abrir cultos', 'aba', 'cultos', true]]);
  }
  // números
  var P = typeof periodoBI === 'function' ? periodoBI() : null;
  var ativos = PES().filter(function (p) { return p.status === 'Ativo'; }).length;
  var visMes = PES().filter(function (p) { return p.status !== 'Inativo' && p.prim && p.prim.slice(0, 7) === hoje().slice(0, 7) && (p.status === 'Em visita' || p.origem); }).length;
  var emGC = PES().filter(function (p) { return p.gcId && ids.indexOf(p.gcId) >= 0 && (p.status === 'Ativo' || p.status === 'Em visita'); }).length;
  var atrasadas = PES().filter(lvAtrasada).length;
  if (!(pode('relFin') || pode('usuarios'))) h += '<div class="stats">' + statCard('Membros ativos', ativos) + statCard('Visitantes no mês', visMes) +
    statCard('Pessoas em GCs', emGC, gcs.length + ' GC(s) ativos') +
    statCard('Lar de Vida', PES().filter(function (p) { return p.lvStatus === 'acompanhando'; }).length, atrasadas ? atrasadas + ' visita(s) atrasada(s)' : 'casas em acompanhamento', atrasadas ? 'dn' : '') + '</div>';
  h += '<div class="sec">Módulos</div>' + blocoModulos();
  // atenção
  var at = [];
  var fila = pode('lvDirecionar') ? lvFila() : [];
  var doPastor = fila.filter(function (p) { return p.supRespId === '__pastor__'; }).length;
  if (ehDecisor() && doPastor) at.push(linhaAtencao(doPastor, 'var(--vermelho)', 'Visitantes na fila do pastor', 'sem GC compatível ou devolvidos', 'decidir', 'p-vermelho', 'aba', 'lv'));
  var meus = fila.length - (ehDecisor() ? doPastor : 0);
  if (meus > 0) at.push(linhaAtencao(meus, 'var(--pri)', ehDecisor() ? 'Visitantes sem GC' : 'Visitantes encaminhados a você', 'direcionar ao GC', 'direcionar', 'p-dour', 'aba', 'lv'));
  if (atrasadas) at.push(linhaAtencao(atrasadas, 'var(--amarelo)', 'Visitas do Lar de Vida atrasadas', 'mais de 7 dias sem visita', 'atrasado', 'p-amarelo', 'aba', 'lv'));
  if (ehAdmin() && db.pendentes) at.push(linhaAtencao(db.pendentes, '#14161A', 'Cadastros aguardando aprovação', 'novos usuários', 'aprovar', 'p-cinza', 'aba', 'usuarios'));
  var alN = alertasNaoLidos(null).length;
  if (alN) at.push(linhaAtencao(alN, 'var(--azul)', 'Avisos não lidos', 'escalas, transferências e visitas', 'ver', 'p-dour', 'nav', 'avisos'));
  var semCh = gcs.filter(function (g) { var u = encOrd(g.id).filter(function (e) { return e.data < hoje() && e.data >= isoData(new Date(Date.now() - 8 * 864e5)); }); return u.length && !u.some(marcados); }).length;
  if (semCh) at.push(linhaAtencao(semCh, '#9AA1AC', 'GCs sem chamada na última semana', 'encontro criado sem presença lançada', '', '', 'aba', 'gcs'));
  h += '<div class="sec">Precisa da sua atenção</div>' + (at.length ? '<div class="card" style="padding:4px 16px">' + at.join('') + '</div>'
    : '<div class="card"><div class="empty" style="padding:6px">Tudo em dia por aqui. 🙌</div></div>');
  var esc1 = minhasEscalas();
  if (esc1.length) h += blocoMinhasEscalas();
  h += blocoCursosHoje();
  if (ehAdmin()) h += avisoServidor();
  return h;
}

/* ── LÍDER ── */
function inicioLider(g) {
  var id = g.id, e = achaEnc(id, hoje()) || proximoEncGC(id), h = '', pes = PES(id), encs = encOrd(id);
  h += topoInicio(e ? (e.data === hoje() ? 'Hoje tem encontro' : 'Próximo encontro: ' + quandoTxt(e.data).toLowerCase()) : esc(g.nome));
  if (e) {
    var bts = [];
    if (podeChamada(e)) bts.push(['Fazer chamada', 'encChamada', e.data, true]);
    bts.push(['Editar encontro e escala', 'encEditar', e.data, !podeChamada(e)]);
    h += heroCard(quandoTxt(e.data, e.horario).toUpperCase(), esc(e.tema || 'Encontro do ' + g.nome),
      ((e.anfitriao || (e.escala && e.escala.pregador && nomeEquipe(id, e.escala.pregador))) ? 'Pregador: ' + esc(e.anfitriao || nomeEquipe(id, e.escala.pregador)) : 'pregador a definir') + (podeChamada(e) ? ' · chamada aberta' : ''), bts);
    h += '<div class="sec sec-l"><span>Escala do encontro</span>' + (FUNCOES_GC.some(function (f) { return e.escala && e.escala[f[0]]; }) ? '<a data-a="avisarEscala" data-v="' + esc(e.data) + '">Avisar no WhatsApp</a>' : '') + '</div>' +
      '<div class="card">' + gradeEscala(e) + '</div>';
  } else {
    h += heroCard('ENCONTROS', 'Nenhum encontro criado', 'Crie o próximo encontro para liberar a chamada e montar a escala.', [['Criar encontro', 'encAgendar', null, true]]);
  }
  var m = metricas(id);
  h += '<div class="stats">' + statCard('Pessoas ativas', m.ativos, m.novos ? '▲ ' + m.novos + ' no mês' : '', 'up') +
    statCard('Presença média', m.pres === null ? '—' : pct(m.pres), num1(m.media) + ' por encontro') + '</div>';
  // cuidar esta semana
  var c = [];
  pes.filter(function (p) { return statusDe(p, encs).s === 'contatar'; }).slice(0, 4).forEach(function (p) {
    c.push(linhaAtencao(ini(p.nome), '#F06A3A', esc(p.nome), statusDe(p, encs).faltas + ' faltas seguidas', 'contatar', 'p-vermelho', 'abrirPessoa', p.id));
  });
  pes.filter(function (p) { return p.status === 'Em visita'; }).slice(0, 3).forEach(function (p) {
    c.push(linhaAtencao(ini(p.nome), '#7C5CFA', esc(p.nome), (visitasDe(p) ? 'visitante · ' + visitasDe(p) + ' presença(s)' : 'visitante novo'), 'visitante', 'p-amarelo', 'abrirPessoa', p.id));
  });
  pes.filter(function (p) { return p.status === 'Ativo' && aniversarioEm(p, 7) !== null; }).sort(function (a, b) { return aniversarioEm(a, 7) - aniversarioEm(b, 7); }).slice(0, 3).forEach(function (p) {
    var d = aniversarioEm(p, 7);
    c.push(linhaAtencao(ini(p.nome), '#16A36A', esc(p.nome), 'aniversário ' + (d === 0 ? 'hoje 🎂' : d === 1 ? 'amanhã 🎂' : 'em ' + d + ' dias'), 'parabenizar', 'p-verde', 'abrirPessoa', p.id));
  });
  var lib = pes.filter(function (p) { return p.lvStatus === 'pendente'; });
  if (pode('lvLiberar') && lib.length) c.unshift(linhaAtencao(lib.length, 'var(--verde)', 'Lar de Vida para liberar', lib.slice(0, 2).map(function (p) { return esc(nomeChamado(p)); }).join(', ') + (lib.length > 2 ? '…' : ''), 'liberar', 'p-dour', 'aba', 'lar'));
  var atr = pes.filter(lvAtrasada).length;
  if (atr) c.unshift(linhaAtencao(atr, 'var(--amarelo)', 'Visitas atrasadas no Lar de Vida', 'discípulos com prazo vencido', 'ver', 'p-amarelo', 'aba', 'lar'));
  h += '<div class="sec">Cuidar esta semana</div>' + (c.length ? '<div class="card" style="padding:4px 16px">' + c.join('') + '</div>'
    : '<div class="card"><div class="empty" style="padding:6px">Ninguém precisando de atenção especial agora. 🙌</div></div>');
  h += blocoMinhasEscalas() + blocoAlertas([id], false);
  h += '<div class="sec">Módulos</div>' + blocoModulos();
  return h;
}

/* ── DISCÍPULO ── */
function inicioDiscipulo(g) {
  var id = g.id, esc1 = minhasEscalas(), casas = lvCasasDe(eu().id), h = '';
  var prox = esc1[0], e = achaEnc(id, hoje()) || proximoEncGC(id);
  var partes = []; if (esc1.length) partes.push(esc1.length + ' escala' + (esc1.length > 1 ? 's' : ''));
  if (casas.length) partes.push(casas.length + ' casa' + (casas.length > 1 ? 's' : '') + ' no Lar de Vida');
  h += topoInicio(partes.length ? 'Você tem ' + partes.join(' e ') : esc(g.nome));
  if (prox) {
    h += heroCard('SUA ESCALA · ' + quandoTxt(prox.e.data, prox.e.horario).toUpperCase(), esc(prox.f),
      'Encontro do ' + esc(gcNome(prox.e.gcId)) + (prox.e.tema ? ' · ' + esc(prox.e.tema) : ''),
      [[podeChamada(prox.e) ? 'Fazer chamada' : 'Ver encontro', 'encChamada', prox.e.data, true]]);
  } else if (e) {
    h += heroCard('PRÓXIMO ENCONTRO · ' + quandoTxt(e.data, e.horario).toUpperCase(), esc(e.tema || 'Encontro do ' + g.nome),
      e.anfitriao ? 'Pregador: ' + esc(e.anfitriao) : '', [[podeChamada(e) ? 'Fazer chamada' : 'Ver encontro', 'encChamada', e.data, true]]);
  }
  if (casas.length) {
    h += '<div class="sec sec-l"><span>Minhas casas · Lar de Vida</span><a data-a="aba" data-v="lar">Ver todas</a></div>';
    casas.slice().sort(function (a, b) { return String(lvPrazo(a)).localeCompare(String(lvPrazo(b))); }).slice(0, 3).forEach(function (p) {
      var n = lvVis(p).length, end = separarBairroCidade(p.bairro, p.cidade);
      h += '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div style="min-width:0"><b style="font-size:15px">' + esc(p.nome) + '</b>' +
        '<div style="font-size:12.5px;color:var(--tx2)">' + esc([p.endereco, end.bairro].filter(Boolean).join(' · ') || 'endereço não informado') + '</div></div>' + lvPrazoPill(p) + '</div>' +
        lvDots(p) + '<div style="display:flex;gap:8px;margin-top:6px">' +
        (n < LV_SEMANAS ? '<button class="btn sm" style="flex:1" data-a="lvRegistrar" data-v="' + esc(p.id) + '">Registrar visita ' + (n + 1) + '</button>' : '<button class="btn vd sm" style="flex:1" data-a="lvEncerrar" data-v="' + esc(p.id) + '">Encerrar acompanhamento</button>') +
        (fone(p.fone) ? '<a class="btn gh sm" style="text-decoration:none;text-align:center" target="_blank" rel="noopener" href="https://wa.me/' + (fone(p.fone).length <= 11 ? '55' : '') + fone(p.fone) + '">WhatsApp</a>' : '') + '</div></div>';
    });
  }
  // meu GC
  var me = PES(id).filter(function (p) { return normalizar(p.nome) === normalizar(eu().nome); })[0], st = me ? statsDe(me) : null;
  var g2 = gcPor(id), px = proximoEncontro(g2);
  h += '<div class="sec">Meu GC</div><div class="stats">' +
    statCard('Minha presença', st && st.mar ? pct(st.pct) : '—', st && st.mar ? 'nos encontros lançados' : 'sem chamadas ainda', 'up') +
    statCard('Próximo encontro', e ? (e.data === hoje() ? 'Hoje' : DIAS[parseData(e.data).getDay()].slice(0, 3) + ' ' + br(e.data)) : (px ? br(px) : '—'),
      e && e.horario ? 'às ' + esc(e.horario) + (g2 && g2.endereco ? ' · ' + esc(g2.endereco) : '') : (g2 && g2.endereco ? esc(g2.endereco) : '')) + '</div>';
  if (e && !podeChamada(e)) {
    h += '<div class="card" style="display:flex;gap:12px;align-items:center"><div class="hvolta" style="box-shadow:none;background:var(--bg)"><svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>' +
      '<div><b style="font-size:14px">Chamada fechada</b><div style="font-size:12.5px;color:var(--tx2)">Abre ' + textoJanelaGC(e) + '</div></div></div>';
  }
  h += blocoAlertas([id], false);
  h += '<div class="sec">Atalhos</div>' + blocoModulos();
  return h;
}

/* ── VOLUNTÁRIO (recepção do culto) ── */
function inicioVoluntario() {
  var ev = eventoAbertoAgora(), st = situacaoCadastro(), hj = hoje(), h = '';
  var meusHoje = PES().filter(function (p) { return p.criadoPor === eu().id && (p.prim === hj || (Array.isArray(p.visitasIgrejaDatas) && p.visitasIgrejaDatas.some(function (v) { return v.d === hj; }))); });
  var doCulto = ev ? PES().filter(function (p) { return p.eventoId === ev.id || (Array.isArray(p.visitasIgrejaDatas) && p.visitasIgrejaDatas.some(function (v) { return v.ev === ev.id; })); }) : meusHoje;
  h += '<div class="ini-ola">Bom culto' + (pri(eu().nome) ? ', ' + esc(pri(eu().nome)) : '') + '!</div>';
  h += '<div class="ini-sub">' + (ev ? esc(ev.titulo) + ' · ' + (ev.inicio ? 'hoje ' + esc(ev.inicio) + ' · ' : '') + textoJanela(ev) : st.s === 'aberto' ? 'Cadastro aberto' : 'Nenhum culto com cadastro aberto agora') + '</div>';
  if (st.s === 'aberto' || !modoVisitante()) {
    h += '<div class="big-cta" data-a="lvIrForm"><div class="bi"><svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg></div>' +
      '<div><b>Cadastrar visitante</b><span>toque para começar · leva 1 minuto</span></div></div>';
  }
  h += '<div class="count"><div><b>' + doCulto.length + '</b><small>visitantes ' + (ev ? 'neste culto' : 'hoje') + '</small></div>' +
    '<div><b>' + doCulto.filter(function (p) { return p.aceitaVisita === 'Sim'; }).length + '</b><small>aceitam visita</small></div>' +
    '<div><b>' + doCulto.filter(function (p) { return +p.visitasIgreja >= 2; }).length + '</b><small>voltaram</small></div></div>';
  h += '<div class="card cl" data-a="lvModo" data-v="membro" style="display:flex;gap:12px;align-items:center;cursor:pointer"><div class="mod" style="pointer-events:none"><span class="mi" style="width:44px;height:44px;color:var(--pri)"><svg viewBox="0 0 24 24">' + IC_PESSOAS + '</svg></span></div>' +
    '<div style="flex:1"><b style="font-size:14px">Membro sem GC</b><div style="font-size:12.5px;color:var(--tx2)">já frequenta a igreja e quer entrar num GC</div></div><span style="color:var(--tx3);font-size:18px">›</span></div>';
  if (meusHoje.length) {
    h += '<div class="sec sec-l"><span>Cadastrados hoje</span><a data-a="nav" data-v="lvmeus">Ver todos</a></div><div class="card" style="padding:4px 16px">' +
      meusHoje.slice(0, 6).map(function (p) {
        var vol = +p.visitasIgreja >= 2;
        return '<div class="row">' + avatarP(p) + '<div class="info"><div class="nm">' + esc(p.nome) + '</div><div class="sb">' +
          esc(separarBairroCidade(p.bairro, p.cidade).bairro || '—') + (p.aceitaVisita === 'Sim' ? ' · aceita visita' : '') + '</div></div>' +
          '<span class="pill ' + (vol ? 'p-dour' : 'p-verde') + '">' + (vol ? p.visitasIgreja + 'ª visita' : 'novo') + '</span></div>';
      }).join('') + '</div>';
  }
  return h + '<div id="ini-form"></div>';
}

/* ═══════════════════ v33: RELATÓRIOS E FINANCEIRO ═══════════════════ */
var IC_REL = '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>';
function podeFin() { return pode('relFin') || pode('financeiro'); }
/** Página de relatórios: todos os indicadores consolidados (o Início fica enxuto). */
function rRelatorios() {
  var gcs = GCSativos(), ids = gcs.map(function (g) { return g.id; }), visaoPastor = pode('relFin') || pode('usuarios');
  var h = '<div class="ini-ola" style="font-size:22px">Relatórios</div><div class="ini-sub">Indicadores da igreja, dos GCs e do Lar de Vida no período escolhido.</div>' + barraPeriodo();
  h += blocoOrganograma();
  if (visaoPastor) h += blocoVisaoIgreja(gcs, false);
  else h += graficoGCSemanas(ids, 'Presença nos GCs — últimas 8 semanas');
  var ms = gcs.map(function (g) { return { g: g, m: metricas(g.id) }; });
  var tot = { ativos: 0, media: 0, tp: 0, tm: 0, alertas: 0, novos: 0, vcom: 0, vret: 0, vis: 0 };
  ms.forEach(function (x) {
    tot.ativos += x.m.ativos; tot.media += x.m.media; tot.tp += x.m.tp; tot.tm += x.m.tm; tot.alertas += x.m.alertas;
    tot.novos += x.m.novos; tot.vcom += x.m.vcom; tot.vret += x.m.vret; tot.vis += x.m.visitantes;
  });
  h += '<div class="sec">Rede de GCs</div><div class="kpis">' +
    kpi(gcs.length, 'GCs ativos', 'dk') + kpi(tot.ativos, 'Pessoas ativas na rede') +
    kpi(num1(tot.media), 'Presentes por semana (média)') + kpi(tot.tm ? pct(tot.tp / tot.tm) : '—', '% de presença da rede') +
    kpi(tot.vcom ? pct(tot.vret / tot.vcom) : '—', 'Retorno do visitante') + kpi(tot.novos, 'Novos no mês') +
    kpi(tot.vis, 'Visitantes ativos') + kpi(tot.alertas, 'Pessoas com 2+ faltas', 'al') + '</div>';
  h += '<div class="sec">Comparativo por GC</div><div class="card" style="padding:8px 10px;overflow-x:auto">';
  if (!ms.length) h += '<div class="empty">Nenhum GC cadastrado.</div>';
  else {
    h += '<table class="tbl"><tr><th>GC</th><th style="text-align:right">Ativos</th><th style="text-align:right">Média</th><th style="text-align:right">Pres.</th><th style="text-align:right">Alertas</th><th style="text-align:right">Última</th></tr>';
    ms.slice().sort(function (a, b) { return b.m.ativos - a.m.ativos; }).forEach(function (x) {
      var atraso = x.m.diasSem === null || x.m.diasSem > 10;
      h += '<tr class="cl" data-a="abrirGC" data-v="' + esc(x.g.id) + '"><td><b>' + esc(x.g.nome) + '</b><div style="font-size:10.5px;color:#999">' + esc(x.g.liderNome || 'sem líder') + '</div></td>' +
        '<td class="n">' + x.m.ativos + '</td><td class="n">' + num1(x.m.media) + '</td><td class="n">' + (x.m.pres === null ? '—' : pct(x.m.pres)) + '</td>' +
        '<td class="n" style="color:' + (x.m.alertas ? 'var(--vermelho)' : '#999') + '">' + x.m.alertas + '</td>' +
        '<td class="n" style="color:' + (atraso ? 'var(--vermelho)' : '#555') + '">' + (x.m.ultimo ? br(x.m.ultimo) : '—') + '</td></tr>';
    });
    h += '</table><div style="font-size:10.5px;color:#999;margin-top:8px;line-height:1.5">Média = presentes nas últimas 4 chamadas · Pres. = presença nas últimas 8 · Última em vermelho = mais de 10 dias sem chamada.</div>';
  }
  h += '</div>';
  var semChamada = ms.filter(function (x) { return x.m.diasSem === null || x.m.diasSem > 10; }), semLider = gcs.filter(function (g) { return !g.liderNome; });
  if (semChamada.length || semLider.length) {
    h += '<div class="sec">Pontos de atenção</div><div class="card" style="padding:4px 16px">' +
      semChamada.map(function (x) { return linhaAtencao('!', 'var(--vermelho)', esc(x.g.nome), 'sem chamada há mais de 10 dias', '', '', 'abrirGC', x.g.id); }).join('') +
      semLider.map(function (g) { return linhaAtencao('!', 'var(--amarelo)', esc(g.nome), 'GC sem líder definido', '', '', 'editarGC', g.id); }).join('') + '</div>';
  }
  var pes = PES().filter(function (p) { return gcPor(p.gcId) && !gcPor(p.gcId).deleted; }), t = pes.length || 1;
  h += '<div class="sec">Jornada do Membro — rede</div><div class="card">' +
    ETAPAS.map(function (e) { return barra(e, pes.filter(function (p) { return p.jornada === e; }).length, t); }).join('') + '</div>';
  h += blocoLVResumo(ids, false);
  h += '<div class="sec">Pessoas por GC</div><div class="card">' + ms.map(function (x) { return barra(esc(x.g.nome), x.m.ativos, tot.ativos || 1); }).join('') + '</div>';
  var cl = (function () { var m = {}; PES().forEach(function (p) { if (p.canal) m[p.canal] = (m[p.canal] || 0) + 1; }); return Object.keys(m).map(function (k) { return [k, m[k]]; }); })().sort(function (a, b) { return b[1] - a[1]; });
  var tc = cl.reduce(function (s2, x) { return s2 + x[1]; }, 0) || 1;
  h += '<div class="sec">Como conheceram / receberam o convite</div><div class="card">' + (cl.length ? cl.map(function (x) { return barra(esc(x[0]), x[1], tc); }).join('') : '<div class="empty">Sem dados ainda.</div>') + '</div>';
  if (!visaoPastor) h += blocoMapa(ids, 'Mapa de calor — rede');
  if (podeFin()) h += '<div class="gap"></div><button class="btn gh" data-a="aba" data-v="financeiro">Abrir o consolidado financeiro</button>';
  return h;
}

/** Consolidado financeiro: só valores e gráficos (cultos/eventos + GCs). */
function somaFin(ids, f) {
  var r = { diz: 0, ofe: 0, out: 0, cul: 0, gc: 0, nCul: 0, porTipo: {}, porGC: {} };
  EVS().forEach(function (e) {
    if (!f(e.data)) return;
    var d = valor(e.dizimo), o = valor(e.oferta), x = valor(e.outras), tt = d + o + x;
    r.diz += d; r.ofe += o; r.out += x; r.cul += tt; if (tt) r.nCul++;
    var tp = e.tipo || 'Culto'; r.porTipo[tp] = (r.porTipo[tp] || 0) + tt;
  });
  ENC().forEach(function (e) {
    if (ids.indexOf(e.gcId) < 0 || !f(e.data)) return;
    var d = valor(e.dizimo), o = valor(e.oferta);
    r.diz += d; r.ofe += o; r.gc += d + o; r.porGC[e.gcId] = (r.porGC[e.gcId] || 0) + d + o;
  });
  r.t = r.cul + r.gc;
  return r;
}
function varPct(a, b) {
  if (!b) return '';
  var d = Math.round((a - b) / b * 100);
  return (d >= 0 ? '▲ ' : '▼ ') + Math.abs(d) + '%';
}
function rFinanceiro() {
  if (!podeFin()) return '<div class="card"><div class="empty">Sem acesso ao financeiro.</div></div>';
  var P = periodoBI(), gcs = GCSativos(), ids = gcs.map(function (g) { return g.id; });
  var a = somaFin(ids, P.noPer), b = somaFin(ids, P.noAnt);
  var ateAno = P.ate < hoje() ? P.ate : hoje(), ano = ateAno.slice(0, 4);
  var acum = somaFin(ids, function (d) { d = String(d || ''); return d.slice(0, 4) === ano && d <= ateAno; });
  var h = '<div class="ini-ola" style="font-size:22px">Financeiro</div><div class="ini-sub">Entradas consolidadas de cultos, eventos e GCs.</div>' + barraPeriodo();
  var vp = varPct(a.t, b.t);
  h += '<div class="hero"><small>TOTAL DE ENTRADAS · ' + esc(String(P.rot).toUpperCase()) + '</small><div class="big">' + moeda(a.t) + '</div>' +
    '<div class="mt">' + (vp ? vp + ' vs ' + esc(P.antRot) + ' (' + moeda(b.t) + ')' : 'sem lançamentos no período anterior') + ' · acumulado ' + ano + ': ' + moeda(acum.t) + '</div></div>';
  h += '<div class="stats">' +
    statCard('Dízimos', moeda(a.diz), varPct(a.diz, b.diz) || '—', a.diz >= b.diz ? 'up' : 'dn') +
    statCard('Ofertas', moeda(a.ofe), varPct(a.ofe, b.ofe) || '—', a.ofe >= b.ofe ? 'up' : 'dn') +
    statCard('Outras entradas', moeda(a.out), varPct(a.out, b.out) || '—', a.out >= b.out ? 'up' : 'dn') +
    statCard('Média por culto', a.nCul ? moeda(a.cul / a.nCul) : '—', a.nCul + ' culto(s) com lançamento') + '</div>';
  // origem
  var tt = a.t || 1;
  h += '<div class="sec">Origem das entradas</div><div class="card">' +
    barra('Cultos e eventos · ' + moeda(a.cul), a.cul, tt, 'var(--pri)') + barra('GCs · ' + moeda(a.gc), a.gc, tt, 'var(--tx)') +
    '<div style="height:6px"></div>' + barra('Dízimos · ' + moeda(a.diz), a.diz, tt, 'var(--verde)') + barra('Ofertas · ' + moeda(a.ofe), a.ofe, tt, 'var(--amarelo)') +
    (a.out ? barra('Outras · ' + moeda(a.out), a.out, tt, '#7C5CFA') : '') + '</div>';
  // 12 meses
  var meses = mesesAtras(12, ateAno), por = meses.map(function (m) { return somaFin(ids, function (d) { return String(d || '').slice(0, 7) === m; }); });
  var mx = 1; por.forEach(function (x) { if (x.t > mx) mx = x.t; });
  var melhor = por.reduce(function (bi, x, i) { return x.t > por[bi].t ? i : bi; }, 0);
  h += '<div class="sec">Últimos 12 meses</div><div class="card"><div class="fin12">' + por.map(function (x, i) {
    var pc = x.t ? x.cul / x.t * 100 : 0;
    return '<div class="col' + (meses[i] === ateAno.slice(0, 7) ? ' on' : '') + '" title="' + nomeMes(meses[i]) + ': ' + moeda(x.t) + '"><b>' + (x.t ? moedaCurta(x.t).replace('R$ ', '') : '') + '</b>' +
      '<div class="bx" style="height:' + Math.max(2, x.t / mx * 100) + '%"><i style="height:' + (100 - pc) + '%"></i></div><u>' + MESES[+meses[i].slice(5, 7) - 1] + '</u></div>';
  }).join('') + '</div><div class="leg"><span><i class="dot" style="background:var(--pri)"></i>Cultos e eventos</span><span><i class="dot" style="background:var(--tx)"></i>GCs</span>' +
    (por[melhor].t ? '<span>Maior mês: <b>' + nomeMes(meses[melhor]) + '</b> · ' + moeda(por[melhor].t) + '</span>' : '') + '</div></div>';
  // por GC
  var rk = gcs.map(function (g) { return { g: g, v: a.porGC[g.id] || 0 }; }).sort(function (x, y) { return y.v - x.v; });
  var tg = a.gc || 1;
  h += '<div class="sec">Por GC · ' + esc(P.rot) + '</div><div class="card">' + (a.gc ? rk.map(function (x) { return barra(esc(x.g.nome) + ' · ' + moeda(x.v), x.v, tg, 'var(--tx)'); }).join('')
    : '<div class="empty">Nenhum valor lançado nos GCs no período.</div>') + '</div>';
  // por tipo
  var tps = Object.keys(a.porTipo).filter(function (k) { return a.porTipo[k]; }).sort(function (x, y) { return a.porTipo[y] - a.porTipo[x]; });
  h += '<div class="sec">Por tipo de culto/evento · ' + esc(P.rot) + '</div><div class="card">' + (tps.length ? tps.map(function (k) { return barra(esc(k) + ' · ' + moeda(a.porTipo[k]), a.porTipo[k], a.cul || 1, 'var(--pri)'); }).join('')
    : '<div class="empty">Nenhum valor lançado nos cultos no período.</div>') + '</div>';
  // tabela mensal
  h += '<div class="sec">Resumo mensal</div><div class="card" style="padding:8px 10px;overflow-x:auto"><table class="tbl"><tr><th>Mês</th><th style="text-align:right">Cultos</th><th style="text-align:right">GCs</th><th style="text-align:right">Total</th></tr>' +
    meses.slice().reverse().map(function (m, i) { var x = por[meses.length - 1 - i]; return '<tr><td><b>' + nomeMes(m) + '</b></td><td class="n">' + moeda(x.cul) + '</td><td class="n">' + moeda(x.gc) + '</td><td class="n"><b>' + moeda(x.t) + '</b></td></tr>'; }).join('') +
    '</table></div><div class="meta">Valores lançados nos cultos/eventos (dízimos, ofertas e outras entradas) e nos encontros dos GCs.</div>';
  return h;
}

/* ═══════════════════ v34: MURAL (recados e oração) + NOTIFICAÇÕES DO APARELHO ═══════════════════ */
var muralTipo = 'recado', muralFiltro = 'todos';
function tempoRel(iso) {
  var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'agora'; if (m < 60) return m + ' min'; var h = Math.round(m / 60); if (h < 24) return h + ' h';
  var d = Math.round(h / 24); return d === 1 ? 'ontem' : d + ' dias';
}
function diasRestam(iso) { return Math.max(0, 15 - Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)); }
function blocoMural() {
  var l = (db.mural || []).filter(function (m) { return muralFiltro === 'todos' || m.tipo === muralFiltro; });
  var nO = (db.mural || []).filter(function (m) { return m.tipo === 'oracao'; }).length, nR = (db.mural || []).length - nO;
  var h = '<div class="sec sec-l"><span>Mural da igreja</span><span style="font-size:11.5px;color:var(--tx3);font-weight:600">apaga em 15 dias</span></div>' +
    '<div class="card mural-novo"><div class="chips" style="margin:0 0 8px">' +
      '<button data-a="muralTipo" data-v="recado" class="' + (muralTipo === 'recado' ? 'on' : '') + '">💬 Recado</button>' +
      '<button data-a="muralTipo" data-v="oracao" class="' + (muralTipo === 'oracao' ? 'on' : '') + '">🙏 Pedido de oração</button></div>' +
    '<textarea id="mural-txt" rows="3" maxlength="600" placeholder="' + (muralTipo === 'oracao' ? 'Compartilhe seu motivo de oração…' : 'Escreva um recado para a igreja…') + '"></textarea>' +
    '<button class="btn pr" data-a="muralPostar" style="margin-top:8px">Publicar</button>' +
    '<div style="font-size:11px;color:var(--tx3);margin-top:6px;line-height:1.4">Todos os usuários veem o mural. Só você, o pastor ou o master podem apagar sua mensagem.</div></div>';
  h += '<div class="chips">' + [['todos', 'Todos', nO + nR], ['recado', 'Recados', nR], ['oracao', 'Oração', nO]].map(function (x) {
    return '<button data-a="muralFiltro" data-v="' + x[0] + '" class="' + (muralFiltro === x[0] ? 'on' : '') + '">' + x[1] + ' <span>' + x[2] + '</span></button>'; }).join('') + '</div>';
  h += l.length ? l.map(function (m) {
    var or = m.tipo === 'oracao';
    return '<div class="card mural-it' + (or ? ' or' : '') + '"><div class="mh"><div class="av" style="' + corAvatar(m.autorNome) + '">' + ini(m.autorNome) + '</div>' +
      '<div class="info"><div class="nm">' + esc(m.autorNome) + (m.meu ? ' <span class="apel">(você)</span>' : '') + '</div><div class="sb">' + (or ? '🙏 pedido de oração' : '💬 recado') + ' · ' + tempoRel(m.criadoEm) + '</div></div>' +
      (m.podeApagar ? '<button class="mx" data-a="muralApagar" data-v="' + esc(m.id) + '" title="Apagar">×</button>' : '') + '</div>' +
      '<div class="mt-txt">' + esc(m.texto) + '</div>' +
      '<div class="mf">' + (or ? '<button class="orar' + (m.oreiEu ? ' on' : '') + '" data-a="muralOrar" data-v="' + esc(m.id) + '">🙏 ' + (m.oreiEu ? 'Orei' : 'Vou orar') + (m.oracoes ? ' · ' + m.oracoes : '') + '</button>' : '<span></span>') +
      '<span class="ate">some em ' + diasRestam(m.criadoEm) + ' dia(s)</span></div></div>';
  }).join('') : '<div class="card"><div class="empty">Nenhuma mensagem ' + (muralFiltro === 'oracao' ? 'de oração ' : '') + 'no mural.</div></div>';
  return h;
}
function muralAcao(acao, dados, ok) {
  carregando(true, 'Enviando...');
  chamar(acao, dados).then(function (r) { db.mural = r.mural || db.mural; salvarDB(); marcarVistos(); render(); if (ok) toast(ok); })
    .catch(function (e) { toast(e.message, 4500); }).then(function () { carregando(false); });
}

/* ── notificações do aparelho (central do celular / computador) ── */
var notifVistos = null;
function lerVistos() { if (notifVistos) return notifVistos; try { notifVistos = JSON.parse(localStorage.getItem('g2_vistos') || '{}'); } catch (e) { notifVistos = {}; } return notifVistos; }
function salvarVistos() { try { localStorage.setItem('g2_vistos', JSON.stringify(notifVistos || {})); } catch (e) {} }
function notifSuportada() { return typeof Notification !== 'undefined'; }
function notifStatus() { return notifSuportada() ? Notification.permission : 'indisponivel'; }
function itensNotificaveis() {
  var out = [];
  (db.alertas || []).filter(function (a) { return !a.lido; }).forEach(function (a) { out.push({ id: 'a:' + a.id, titulo: tituloAviso(a), corpo: a.mensagem, aba: 'avisos' }); });
  (db.mural || []).filter(function (m) { return !m.meu; }).forEach(function (m) {
    out.push({ id: 'm:' + m.id, titulo: (m.tipo === 'oracao' ? '🙏 Pedido de oração · ' : '💬 Recado · ') + m.autorNome, corpo: m.texto, aba: 'avisos' });
  });
  return out;
}
function tituloAviso(a) {
  return ({ escala: '🎵 Você está na escala', lvAtraso: '🏠 Lar de Vida atrasado', visitaIgreja: '⛪ Visitou a igreja', novoMembro: '👋 Novo membro no GC',
            visitasSemGC: '🚶 Visitante sem GC', transferencia: '🔁 Pedido de transferência', associado: '✅ Visitante associado' })[a.tipo] || '🔔 ' + igrNome();
}
/** Após cada sincronização: mostra na central de notificações o que é novo (e atualiza o número no ícone). */
function notificarNovos() {
  var vistos = lerVistos(), itens = itensNotificaveis(), primeira = !vistos._init, novos = [];
  itens.forEach(function (x) { if (!vistos[x.id]) { novos.push(x); vistos[x.id] = Date.now(); } });
  vistos._init = 1;
  var lim = Date.now() - 20 * 86400000; Object.keys(vistos).forEach(function (k) { if (k !== '_init' && vistos[k] < lim) delete vistos[k]; });
  salvarVistos();
  var n = (db.alertas || []).filter(function (a) { return !a.lido; }).length;
  try { if (navigator.setAppBadge) { if (n) navigator.setAppBadge(n); else navigator.clearAppBadge(); } } catch (e) {}
  if (primeira || !novos.length || notifStatus() !== 'granted') return;
  var mostrar = function (t, o) {
    if (navigator.serviceWorker && navigator.serviceWorker.ready && MODO_PWA) navigator.serviceWorker.ready.then(function (reg) { reg.showNotification(t, o); }).catch(function () { try { new Notification(t, o); } catch (e) {} });
    else { try { new Notification(t, o); } catch (e) {} }
  };
  var ic = MODO_PWA ? 'icons/icon-192.png' : undefined;
  if (novos.length > 3) mostrar(igrNome(), { body: novos.length + ' novos avisos e mensagens no app.', icon: ic, badge: ic, tag: 'g2-lote', data: { aba: 'avisos' } });
  else novos.forEach(function (x) { mostrar(x.titulo, { body: String(x.corpo || '').slice(0, 180), icon: ic, badge: ic, tag: x.id, data: { aba: x.aba } }); });
}
function marcarVistos() { var v = lerVistos(); itensNotificaveis().forEach(function (x) { v[x.id] = v[x.id] || Date.now(); }); v._init = 1; salvarVistos(); }
function blocoNotif() {
  var st = notifStatus();
  if (st === 'granted' || st === 'indisponivel') return '';
  if (st === 'denied') return '<div class="aviso" style="font-size:12.5px">As notificações estão bloqueadas neste aparelho. Para receber os avisos na central do celular/computador, libere em <b>Configurações do navegador → Notificações</b>.</div>';
  return '<div class="card notif-cta"><div style="flex:1"><b>Receber avisos no celular</b><div style="font-size:12.5px;color:var(--tx2);margin-top:2px">Escalas, Lar de Vida, recados e pedidos de oração aparecem na central de notificações.</div></div>' +
    '<button class="btn sm" data-a="notifAtivar">Ativar</button></div>';
}
function notifAtivar() {
  if (!notifSuportada()) return toast('Este navegador não permite notificações.' + (/iPhone|iPad/.test(navigator.userAgent) ? ' No iPhone, instale o app (Compartilhar → Adicionar à Tela de Início) e abra por ele.' : ''), 6000);
  Notification.requestPermission().then(function (p) {
    if (p === 'granted') { marcarVistos(); toast('Notificações ativadas ✓'); try { new Notification(igrNome(), { body: 'Você vai receber os avisos por aqui.', icon: MODO_PWA ? 'icons/icon-192.png' : undefined }); } catch (e) {} }
    render();
  });
}

/* ═══════════════════ v35: FOTOS DAS PESSOAS, CÓDIGO, VOLUNTÁRIO LAR DE VIDA ═══════════════════ */
var K_FOTOSP = 'gcbv5_fotosp', K_FOTOPEND = 'gcbv5_fotopend';
var fotosP = lerJSON(K_FOTOSP, {}), fotoPend = lerJSON(K_FOTOPEND, {}), fpAlvo = null, fotoNovaP = null;
function salvarFotosP() { lsSet(K_FOTOSP, JSON.stringify(fotosP)); lsSet(K_FOTOPEND, JSON.stringify(fotoPend)); }
function fotoP(id) { return id && fotosP[id] && fotosP[id].data ? fotosP[id].data : ''; }
/** Avatar da pessoa: foto (se houver) ou iniciais coloridas. */
function avatarP(p, extra) {
  var f = p && fotoP(p.id);
  return f ? '<img class="av" src="' + f + '" alt=""' + (extra || '') + '>'
           : '<div class="av" style="' + corAvatar(p && p.nome) + '"' + (extra || '') + '>' + ini(p && p.nome) + '</div>';
}
function avatarU(u) { return u.pessoaId && fotoP(u.pessoaId) ? '<img class="av" src="' + fotoP(u.pessoaId) + '" alt="">' : '<div class="av" style="' + corAvatar(u.nome) + '">' + ini(u.nome) + '</div>'; }
/** Busca no servidor as fotos novas ou alteradas (em lote). */
function buscarFotosPessoas() {
  var falta = PES().filter(function (p) { return p.temFoto && (!fotosP[p.id] || fotosP[p.id].v !== p.fotoV) && !fotoPend[p.id]; }).map(function (p) { return p.id; });
  var mudou = false;
  PES().forEach(function (p) { if (!p.temFoto && fotosP[p.id] && !fotoPend[p.id]) { delete fotosP[p.id]; mudou = true; } });
  if (mudou) salvarFotosP();
  if (!falta.length) return Promise.resolve(mudou);
  if (sbDisponivel()) return Promise.all(falta.slice(0,80).map(function(id){return v39FotoPessoa(id).then(function(x){var f=Array.isArray(x)?x[0]:x;if(f&&(f.url||f.signed_url||f.public_url)) fotosP[id]={v:f.updated_at||f.version||'',data:f.url||f.signed_url||f.public_url};}).catch(function(){});})).then(function(){salvarFotosP();return true;});
  return chamar('fotosPessoas', { ids: falta.slice(0, 80) }).then(function (r) { (r.itens || []).forEach(function (x) { fotosP[x.id] = { v: x.fotoV, data: x.foto }; }); salvarFotosP(); return true; }).catch(function () { return mudou; });
}
/** Envia as fotos tiradas/escolhidas que ainda não subiram (o cadastro precisa existir no servidor). */
function enviarFotosPend() {
  var ids = Object.keys(fotoPend), p = Promise.resolve();
  ids.forEach(function (id) {
    p = p.then(function () {
      return (sbDisponivel()&&fotoPend[id]!=='__remover__'?v39UploadDataUrl('2gather-media','people/'+id,fotoPend[id],'foto.jpg').then(function(up){return v39RegistrarFotoPessoa(id,up.path,'foto.jpg',up.mime,up.size).then(function(r){return v39UrlAssinada(up.bucket,up.path,3600).then(function(url){return {fotoV:(r&&r.updated_at)||Date.now(),foto:url};});});}):chamar('salvarFotoPessoa', { id: id, foto: fotoPend[id] })).then(function (r) {
        if (fotoPend[id] === '__remover__') delete fotosP[id]; else fotosP[id] = { v: r.fotoV, data: fotoPend[id] };
        delete fotoPend[id]; salvarFotosP();
      }).catch(function (e) { if (!/não encontrado/i.test(e.message)) { delete fotoPend[id]; salvarFotosP(); toast(e.message, 4000); } });
    });
  });
  return p;
}
/** Reduz a foto no aparelho (recorte quadrado, até 360 px) antes de enviar. */
function processarFotoPessoa(file, pronto) {
  if (!file) return;
  var fr = new FileReader();
  fr.onload = function () {
    var img = new Image();
    img.onload = function () {
      var m = Math.min(img.width, img.height), sx = (img.width - m) / 2, sy = (img.height - m) / 2, l = 360, q = 0.8, url = '';
      for (var t = 0; t < 7; t++) {
        var cv = document.createElement('canvas'); cv.width = l; cv.height = l;
        var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, l, l); cx.drawImage(img, sx, sy, m, m, 0, 0, l, l);
        url = cv.toDataURL('image/jpeg', q);
        if (url.length < 45000) break;
        l = Math.round(l * 0.85); q = Math.max(0.55, q - 0.05);
      }
      if (url.length >= 45000) return toast('Não foi possível reduzir esta foto. Tente outra.');
      pronto(url);
    };
    img.onerror = function () { toast('Arquivo de imagem inválido.'); };
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
}
/** Campo de foto dos formulários: prévia + Tirar foto (câmera) + Galeria. */
function campoFotoPessoa(pid) {
  var f = fotoNovaP && fotoNovaP !== '__remover__' ? fotoNovaP : (fotoNovaP === '__remover__' ? '' : fotoP(pid));
  return '<label>Foto</label><div class="fp-campo"><div class="fp-prev" id="fp-prev" style="' + (f ? "background-image:url('" + f + "')" : '') + '">' + (f ? '' : '📷') + '</div>' +
    '<div class="fp-bts"><button class="btn gh sm" data-a="fpCam">📷 Tirar foto</button><button class="btn gh sm" data-a="fpGal">🖼️ Galeria</button>' +
    (f ? '<button class="btn gh sm" data-a="fpRem" style="color:var(--vermelho)">Remover</button>' : '') +
    '<div style="font-size:10.5px;color:var(--tx3);margin-top:4px;line-height:1.35">A foto aparece para quem cuida da pessoa (GC, supervisor e Lar de Vida). O uso da imagem faz parte da autorização LGPD.</div></div></div>';
}
function pintarFotoCampo(url) {
  var p = $('fp-prev'); if (!p) return;
  p.style.backgroundImage = url ? "url('" + url + "')" : ''; p.textContent = url ? '' : '📷';
}
/** Guarda a foto escolhida no formulário para o cadastro salvo (sobe depois da sincronização). */
function aplicarFotoNova(pid) {
  if (!fotoNovaP || !pid) { fotoNovaP = null; return; }
  fotoPend[pid] = fotoNovaP;
  if (fotoNovaP === '__remover__') delete fotosP[pid]; else fotosP[pid] = { v: 'local', data: fotoNovaP };
  fotoNovaP = null; salvarFotosP();
}
/** Trocar a foto direto pela ficha / perfil. */
function trocarFotoDireta(pid) {
  fpAlvo = { pid: pid, direto: true };
  abrirModal('<h2>Foto</h2><div style="text-align:center;margin:10px 0">' + avatarP(pessoaPor(pid) || { id: pid, nome: eu().nome }, ' style="width:110px;height:110px;margin:0 auto;font-size:34px"') + '</div>' +
    '<button class="btn pr" data-a="fpCam">📷 Tirar foto agora</button><div class="gap"></div><button class="btn gh" data-a="fpGal">🖼️ Escolher da galeria</button><div class="gap"></div>' +
    (fotoP(pid) ? '<button class="btn dg" data-a="fpRem">Remover foto</button><div class="gap"></div>' : '') + '<button class="btn gh" data-a="fechar">Cancelar</button>');
}
function fotoEscolhida(url) {
  if (fpAlvo && fpAlvo.direto) {
    var pid = fpAlvo.pid; fpAlvo = null; fechar();
    fotoPend[pid] = url; if (url === '__remover__') delete fotosP[pid]; else fotosP[pid] = { v: 'local', data: url };
    salvarFotosP(); render();
    carregando(true, 'Enviando foto...');
    enviarFotosPend().then(function () { carregando(false); render(); toast(url === '__remover__' ? 'Foto removida' : 'Foto salva ✓'); });
    return;
  }
  fotoNovaP = url; pintarFotoCampo(url === '__remover__' ? '' : url);
}
/* ── voluntário do Lar de Vida ── */
function nomeResponsavelLV(g, id) {
  var d = discipulosDoGC(g).filter(function (x) { return x.id === id; })[0] || (db.voluntariosLV || []).filter(function (x) { return x.id === id; })[0];
  return d ? d.nome : '';
}
function rLVVol() {
  var me = eu().id, casas = lvCasasDe(me).sort(function (a, b) { return String(lvPrazo(a)).localeCompare(String(lvPrazo(b))); });
  var enc = PES().filter(function (p) { return p.lvDiscipuloId === me && p.lvStatus === 'encerrado'; });
  var atr = casas.filter(lvAtrasada).length;
  var h = '<div class="ini-ola" style="font-size:22px">Lar de Vida</div><div class="ini-sub">Suas casas: uma visita por semana, durante ' + LV_SEMANAS + ' semanas. Registre a data, se a pessoa estava em casa e o tema.</div>' +
    '<div class="stats">' + statCard('Casas comigo', casas.length + '/' + LV_CASAS) + statCard('Visitas atrasadas', atr, atr ? 'registre o quanto antes' : 'tudo em dia', atr ? 'dn' : 'up') + '</div>';
  h += '<div class="sec">Minhas casas</div>' + (casas.length ? casas.map(function (p) { return lvCard(p, true, false); }).join('')
    : '<div class="card"><div class="empty">Nenhuma casa liberada para você ainda.<br>O líder do GC escolhe você ao liberar as visitas.</div></div>');
  if (enc.length) h += '<div class="sec">Encerradas (' + enc.length + ')</div><div class="card lp">' + enc.map(function (p) {
    return '<div class="row cl" data-a="lvHistorico" data-v="' + esc(p.id) + '">' + avatarP(p) + '<div class="info"><div class="nm">' + esc(p.nome) + '</div><div class="sb">' + br(p.lvEncerradoEm) + ' · ' + esc(gcNome(p.gcId)) + '</div></div>' +
      '<span class="pill ' + (p.lvResultado === 'Ficou' ? 'p-verde' : 'p-cinza') + '">' + esc(p.lvResultado || '—') + '</span></div>'; }).join('') + '</div>';
  return h;
}

/* ═══════════════════ v36: MÓDULO INSTITUTO — agendas, atendimentos e prontuário ═══════════════════ */
var IC_INST = '<path d="M12 21s-7-4.4-9-9.2C1.8 8.6 3.6 5 7 5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.4 0 5.2 3.6 4 6.8C19 16.6 12 21 12 21z"/><path d="M12 9v6M9 12h6"/>';
var instD = { t: 0, carregando: false, agendas: [], ags: [], pac: {}, profissionais: [], perm: {}, hoje: '' };
var instSel = { agenda: '', data: '' }, instFl = null, instCd = null, instAgForm = null, instBuscaT = null;
function instLimpar() { instD = { t: 0, carregando: false, agendas: [], ags: [], pac: {}, profissionais: [], perm: {}, hoje: '' }; instSel = { agenda: '', data: '' }; instFl = null; instCd = null; instAgForm = null; estLimpar(); }
function temInst() { return pode('instituto') || pode('agendaPastoral') || pode('prontuario') || temInstCursos() || temEstMercado() || temEstFarmacia(); }
function agendaPor(id) { return instD.agendas.filter(function (a) { return a.id === id; })[0] || null; }
function podeAgendarNa(ag) { return ag && (ag.dono || (ag.tipo === 'pastoral' ? pode('agendaPastoral') : pode('instituto'))); }
/** Dados do Instituto ficam só na memória (nunca no armazenamento do aparelho): são dados sensíveis. */
function carregarInst(forcar) {
  if (!(pode('instituto') || pode('agendaPastoral') || pode('prontuario') || pode('institutoCursos'))) { instD.t = instD.t || Date.now(); return Promise.resolve(); }
  if (instD.carregando || (!forcar && instD.t && Date.now() - instD.t < 45000)) return Promise.resolve();
  instD.carregando = true;
  return (sbDisponivel()?v39SaudeDados().then(v39SaudeAdaptarDados):chamar('instDados', {})).then(function (r) {
    instD.agendas = r.agendas || []; instD.ags = r.agendamentos || []; instD.pac = r.pacientes || {}; instD.profissionais = r.profissionais || [];
    instD.perm = r.perm || {}; instD.hoje = r.hoje || hoje(); instD.t = Date.now();
  }).catch(function (e) { toast(e.message, 5000); instD.t = Date.now(); })
    .then(function () { instD.carregando = false; if (['instituto', 'instagenda'].indexOf(cfg.aba) >= 0) render(); });
}
/* ── grade de horários ── */
function slotsDoDia(ag, iso) {
  var dow = parseData(iso).getDay(), dur = ag.duracaoMin || 30, out = [];
  if ((ag.bloqueios || []).indexOf(iso) >= 0) return out;
  (ag.horarios || []).filter(function (h) { return +h.dow === dow; }).forEach(function (h) {
    for (var m = minStr(h.ini); m !== null && m + dur <= minStr(h.fim); m += dur) { var x = hhmm(m); if (out.indexOf(x) < 0) out.push(x); }
  });
  return out.sort();
}
function atendDe(agId, iso) { return instD.ags.filter(function (a) { return a.agendaId === agId && a.data === iso; }); }
function ocupanteDe(ag, iso, hora) {
  var ini = minStr(hora), fim = ini + (ag.duracaoMin || 30);
  return atendDe(ag.id, iso).filter(function (a) { if (a.status === 'cancelado') return false; var s = minStr(a.hora), e = s + (+a.duracao || ag.duracaoMin || 30); return ini < e && s < fim; })[0] || null;
}
function passou(iso, hora) { return iso < hoje() || (iso === hoje() && minStr(hora) < agoraMin()); }
function livresDoDia(ag, iso) { return slotsDoDia(ag, iso).filter(function (h) { return !passou(iso, h) && !ocupanteDe(ag, iso, h); }); }
function proximosDias(n) { var out = [], d = parseData(hoje()); for (var i = 0; i < n; i++) { out.push(isoData(d)); d.setDate(d.getDate() + 1); } return out; }
function proxLivre(ag) {
  var ds = proximosDias(60);
  for (var i = 0; i < ds.length; i++) { var l = livresDoDia(ag, ds[i]); if (l.length) return { data: ds[i], hora: l[0] }; }
  return null;
}
function rotDia(iso) { var d = parseData(iso); return DIAS[d.getDay()].slice(0, 3) + ' ' + pad(d.getDate()); }
function quandoRot(iso, hora) { var am = parseData(hoje()); am.setDate(am.getDate() + 1); return (iso === hoje() ? 'hoje' : iso === isoData(am) ? 'amanhã' : DIAS[parseData(iso).getDay()].toLowerCase() + ', ' + br(iso)) + (hora ? ' às ' + hora : ''); }
var ST_AT = { agendado: ['p-dour', 'agendado'], confirmado: ['p-verde', 'confirmado'], atendido: ['p-verde', 'atendido ✓'], faltou: ['p-vermelho', 'faltou'], cancelado: ['p-cinza', 'cancelado'] };
function pillAt(s) { var x = ST_AT[s] || ['p-cinza', s]; return '<span class="pill ' + x[0] + '">' + x[1] + '</span>'; }
function avatarInst(pc, nome, tam) {
  var est = tam ? 'width:' + tam + 'px;height:' + tam + 'px;font-size:' + Math.round(tam / 3) + 'px;margin:0 auto 8px;' : '';
  return pc && pc.foto ? '<img class="av" src="' + pc.foto + '" alt=""' + (est ? ' style="' + est + '"' : '') + '>' : '<div class="av" style="' + est + corAvatar(nome || '?') + '">' + ini(nome || '?') + '</div>';
}

/* ═════ especialidades e equipe ═════ */
var instFiltroEsp = '';
function espChave(a) { return a.tipo === 'pastoral' ? '__pastoral__' : (normalizar(a.especialidade || '') || 'geral'); }
function espNome(a) { return a.tipo === 'pastoral' ? 'Atendimento pastoral' : (String(a.especialidade || '').trim() || 'Atendimento geral'); }
/** Grupos: uma especialidade pode ter vários profissionais (cada um com a própria agenda). */
function gruposEsp(lista) {
  var g = {}, ordem = [];
  lista.forEach(function (a) {
    var k = espChave(a);
    if (!g[k]) { g[k] = { chave: k, nome: espNome(a), tipo: a.tipo, agendas: [] }; ordem.push(k); }
    g[k].agendas.push(a);
  });
  return ordem.map(function (k) { return g[k]; }).sort(function (x, y) { return (x.tipo === y.tipo ? 0 : x.tipo === 'saude' ? -1 : 1) || x.nome.localeCompare(y.nome, 'pt-BR'); });
}
function proxLivreGrupo(g) {
  var melhor = null;
  g.agendas.forEach(function (a) { if (!a.ativa) return; var p = proxLivre(a); if (p && (!melhor || (p.data + p.hora) < (melhor.data + melhor.hora))) melhor = p; });
  return melhor;
}
function profissionaisDe(lista) {
  var m = {}, ordem = [];
  lista.forEach(function (a) {
    var k = a.profissionalId || a.id;
    if (!m[k]) { m[k] = { id: a.profissionalId, nome: a.profissionalNome || '—', agendas: [] }; ordem.push(k); }
    m[k].agendas.push(a);
  });
  return ordem.map(function (k) { return m[k]; }).sort(function (x, y) { return x.nome.localeCompare(y.nome, 'pt-BR'); });
}
var ESPECIALIDADES_SUG = ['Clínica geral', 'Pediatria', 'Ginecologia', 'Cardiologia', 'Psicologia', 'Odontologia', 'Nutrição', 'Fisioterapia', 'Enfermagem', 'Oftalmologia', 'Dermatologia', 'Ortopedia', 'Fonoaudiologia', 'Serviço social'];

/* ═════ página inicial do Instituto ═════ */
function rInstituto() { if (!temInstSaude()) { var tb0 = instTabsLista()[0]; if (tb0 && tb0[0] !== 'instituto') { cfg.aba = tb0[0]; salvarCfg(); setTimeout(render, 0); return ''; } }
  if (!temInst()) return '<div class="empty">Sem acesso.</div>';
  carregarInst();
  if (!instD.t) return '<div class="card"><div class="empty">Carregando agendas…</div></div>';
  var h = '<div class="ini-ola" style="font-size:24px">Instituto</div><div class="ini-sub">Atendimentos de saúde, atendimento pastoral e ações sociais.</div>' + instTabs('instituto');
  var minhas = instD.agendas.filter(function (a) { return a.dono; }), hj = hoje();
  if (minhas.length) {
    var lista = instD.ags.filter(function (a) { return a.data === hj && a.status !== 'cancelado' && minhas.some(function (m) { return m.id === a.agendaId; }); }).sort(function (a, b) { return a.hora < b.hora ? -1 : 1; });
    var pend = lista.filter(function (a) { return a.status === 'agendado' || a.status === 'confirmado'; });
    h += heroCard('MINHA AGENDA · HOJE', lista.length ? lista.length + ' atendimento' + (lista.length > 1 ? 's' : '') : 'Nenhum atendimento hoje',
      pend.length ? 'Próximo: ' + esc(pend[0].hora) + (pend[0].pessoaNome ? ' · ' + esc(pend[0].pessoaNome) : '') : (lista.length ? 'Todos os atendimentos de hoje foram registrados.' : 'Aproveite para revisar sua agenda da semana.'),
      [['Abrir minha agenda', 'instAbrirAgenda', minhas[0].id, true]]);
    if (lista.length) h += '<div class="card lp">' + lista.map(function (a) { return linhaAtend(a, true); }).join('') + '</div>';
  }
  if (instD.agendas.some(podeAgendarNa)) {
    h += '<div class="big-cta" data-a="instNovoAg"><div class="bi"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4"/></svg></div>' +
      '<div><b>Agendar atendimento</b><span>escolha a especialidade, o profissional e o horário</span></div></div>';
  }
  var visiveis = instD.ags.filter(function (a) { return a.data === hj && a.status !== 'cancelado'; }).length;
  var livresHoje = instD.agendas.reduce(function (s2, a) { return s2 + (a.ativa ? livresDoDia(a, hj).length : 0); }, 0);
  var gr = gruposEsp(instD.agendas), nProf = profissionaisDe(instD.agendas).length;
  h += '<div class="stats">' + statCard('Atendimentos hoje', visiveis) + statCard('Horários livres hoje', livresHoje) +
    statCard('Especialidades', gr.length, nProf + (nProf === 1 ? ' profissional' : ' profissionais')) + statCard('Agendas ativas', instD.agendas.filter(function (a) { return a.ativa; }).length) + '</div>';
  h += blocoCursosHoje('inst'); // filtro por especialidade
  h += '<div class="sec sec-l"><span>Agendas</span>' + (instD.perm.admin ? '<a data-a="instAgendaForm" data-v="">+ Nova agenda</a>' : '') + '</div>';
  if (gr.length > 1) h += '<div class="chips"><button data-a="instFiltroEsp" data-v="" class="' + (!instFiltroEsp ? 'on' : '') + '">Todas <span>' + instD.agendas.length + '</span></button>' +
    gr.map(function (g) { return '<button data-a="instFiltroEsp" data-v="' + esc(g.chave) + '" class="' + (instFiltroEsp === g.chave ? 'on' : '') + '">' + esc(g.nome) + ' <span>' + g.agendas.length + '</span></button>'; }).join('') + '</div>';
  var mostrar = gr.filter(function (g) { return !instFiltroEsp || g.chave === instFiltroEsp; });
  h += mostrar.length ? mostrar.map(function (g) {
    var pg = proxLivreGrupo(g), n = g.agendas.length;
    return '<div class="espg"><div class="espt"><b>' + esc(g.nome) + '</b><span>' + n + (g.tipo === 'pastoral' ? ' pastor(a)' : (n > 1 ? ' profissionais' : ' profissional')) + (pg ? ' · próximo livre: ' + quandoRot(pg.data, pg.hora) : '') + '</span></div>' +
      g.agendas.slice().sort(function (a, b) { return (a.profissionalNome || '').localeCompare(b.profissionalNome || '', 'pt-BR'); }).map(function (a) {
        var l = livresDoDia(a, hj), nn = slotsDoDia(a, hj).length, pl = a.ativa ? proxLivre(a) : null;
        return '<div class="card agcard cl" data-a="instAbrirAgenda" data-v="' + esc(a.id) + '"><div class="agic ' + a.tipo + '"><svg viewBox="0 0 24 24">' + (a.tipo === 'pastoral' ? '<path d="M12 2v5M9.5 4.5h5"/><path d="M4 21V11l8-4 8 4v10"/><path d="M10 21v-5h4v5"/>' : IC_INST) + '</svg></div>' +
          '<div class="info"><div class="nm">' + esc(a.profissionalNome || a.nome) + (a.dono ? ' <span class="pill p-verde">você</span>' : '') + (a.ativa ? '' : ' <span class="pill p-cinza">inativa</span>') + '</div>' +
          '<div class="sb">' + esc([String(a.nome).indexOf(a.profissionalNome || '\u0000') === 0 ? '' : a.nome, a.local, (a.duracaoMin || 30) + ' min'].filter(Boolean).join(' · ')) + '</div>' +
          '<div class="sb" style="margin-top:3px">' + (nn ? '<b style="color:' + (l.length ? 'var(--verde)' : 'var(--vermelho)') + '">' + l.length + ' livre(s) hoje</b> de ' + nn : 'sem atendimento hoje') + (pl ? ' · próximo: ' + quandoRot(pl.data, pl.hora) : '') + '</div></div><span style="color:var(--tx3);font-size:18px">›</span></div>';
      }).join('') + '</div>';
  }).join('') : '<div class="card"><div class="empty">Nenhuma agenda cadastrada' + (instD.perm.admin ? '. Toque em “+ Adicionar profissional”.' : '.') + '</div></div>';
  // equipe
  if (instD.perm.admin) {
    var eq = profissionaisDe(instD.agendas);
    h += '<div class="sec sec-l"><span>Equipe — profissionais e pastores (' + eq.length + ')</span><a data-a="instProfForm">+ Adicionar profissional</a></div><div class="card lp">' +
      (eq.length ? eq.map(function (p) {
        return '<div class="row"><div class="av" style="' + corAvatar(p.nome) + '">' + ini(p.nome) + '</div><div class="info"><div class="nm">' + esc(p.nome) + '</div><div class="sb">' +
          p.agendas.map(function (a) { return esc(espNome(a)); }).filter(function (v, i, arr) { return arr.indexOf(v) === i; }).join(' · ') + '</div></div>' +
          '<button class="btn gh sm" data-a="instAgendaProf" data-v="' + esc(p.id) + '" title="Outra especialidade ou local para este profissional">+ agenda</button></div>';
      }).join('') : '<div class="empty" style="padding:12px">Nenhum profissional ainda.</div>') + '</div>' +
      '<div style="font-size:11.5px;color:var(--tx3);margin:-4px 4px 6px;line-height:1.45">Cada profissional tem a <b>própria agenda</b> e é o único a ver os nomes dos pacientes. Várias especialidades? Cadastre quantos profissionais precisar — o agendamento já pergunta primeiro a especialidade.</div>';
  }
  // atalhos
  h += '<div class="sec">Mais do Instituto</div><div class="mods" style="grid-template-columns:repeat(4,1fr)">' +
    '<button class="mod" data-a="instNovoAtendido"><span class="mi" style="background:#fff!important;color:#E5484D"><svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg></span><span class="mn">Novo atendido</span></button>' +
    (temEstMercado() ? '<button class="mod" data-a="aba" data-v="instmercado"><span class="mi" style="background:#fff!important;color:#C9930A"><svg viewBox="0 0 24 24"><path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6L5 3H2"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/></svg></span><span class="mn">Mercado</span></button>' : '') +
    (temEstFarmacia() ? '<button class="mod" data-a="aba" data-v="instfarmacia"><span class="mi" style="background:#fff!important;color:#16A36A"><svg viewBox="0 0 24 24"><rect x="3" y="9" width="18" height="12" rx="2"/><path d="M8 9V6a4 4 0 0 1 8 0v3M12 12v6M9 15h6"/></svg></span><span class="mn">Farmácia</span></button>' : '') +
    (temInstCursos() ? '<button class="mod" data-a="aba" data-v="instcursos"><span class="mi" style="background:#fff!important;color:#0F8A8A"><svg viewBox="0 0 24 24">' + IC_CURSO + '</svg></span><span class="mn">Cursos</span></button>' : '') + '</div>';
  h += '<div class="card" style="font-size:11.5px;color:var(--tx2);line-height:1.55;background:#FFF8E6"><b>Privacidade:</b> os nomes dos pacientes e as anotações do atendimento aparecem <b>somente para o profissional responsável</b> pela agenda. ' +
    'Secretaria, voluntários, pastor e master veem apenas “horário ocupado” e o protocolo.</div>';
  return h;
}
/** Linha de atendimento. dono = true mostra o paciente (quando o servidor liberou o nome). */
function linhaAtend(a, destaque) {
  var ag = agendaPor(a.agendaId) || {}, pc = a.pessoaId ? instD.pac[a.pessoaId] : null, nome = a.pessoaNome;
  var pend = a.status === 'agendado' || a.status === 'confirmado';
  return '<div class="row' + (pc && ag.dono ? ' cl' : '') + '"' + (pc && ag.dono ? ' data-a="instAtender" data-v="' + esc(a.id) + '"' : '') + '>' +
    (nome ? avatarInst(pc, nome) : '<div class="av" style="background:var(--bg);color:var(--tx3)">' + esc(a.hora) + '</div>') +
    '<div class="info"><div class="nm">' + (nome ? esc(nome) : 'Horário ocupado') + '</div><div class="sb">' + esc(a.hora) + ' · ' + esc(a.codigo) + (destaque ? ' · ' + esc(ag.nome || '') : '') +
    (a.pessoaCodigo && !nome ? '' : '') + (a.criadoPorNome ? ' · por ' + esc(pri(a.criadoPorNome)) : '') + '</div></div>' + pillAt(a.status) + '</div>';
}

/* ═════ detalhe de uma agenda (dias e horários) ═════ */
function rInstAgenda() {
  if (!temInst()) return '<div class="empty">Sem acesso.</div>';
  carregarInst();
  var ag = agendaPor(instSel.agenda);
  if (!instD.t) return '<div class="card"><div class="empty">Carregando…</div></div>';
  if (!ag) return '<div class="card"><div class="empty">Agenda não encontrada.</div></div>';
  var dias = proximosDias(21), sel = instSel.data && dias.indexOf(instSel.data) >= 0 ? instSel.data : hoje();
  instSel.data = sel;
  var h = '<div class="card" style="padding:14px 16px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div style="min-width:0"><div style="font-size:11px;color:var(--tx3);font-weight:800;letter-spacing:.6px">' +
    (ag.tipo === 'pastoral' ? 'AGENDA PASTORAL' : 'AGENDA DE SAÚDE') + '</div><div style="font-size:18px;font-weight:800;margin-top:2px">' + esc(ag.nome) + '</div>' +
    '<div style="font-size:12.5px;color:var(--tx2);margin-top:2px">' + esc([ag.especialidade, ag.profissionalNome, ag.local, (ag.duracaoMin || 30) + ' min por atendimento'].filter(Boolean).join(' · ')) + '</div></div>' +
    (ag.dono ? '<span class="pill p-verde">minha agenda</span>' : '') + '</div>' +
    ((instD.perm.admin || ag.dono) ? '<div style="margin-top:10px"><button class="btn gh sm" data-a="instAgendaForm" data-v="' + esc(ag.id) + '">Editar agenda e horários</button></div>' : '') + '</div>';
  h += '<div class="dstrip">' + dias.map(function (d) {
    var n = slotsDoDia(ag, d).length, l = livresDoDia(ag, d).length;
    return '<button class="dch' + (d === sel ? ' on' : '') + (n ? '' : ' off') + '" data-a="instDia" data-v="' + d + '"><small>' + DIAS[parseData(d).getDay()].slice(0, 3) + '</small><b>' + pad(parseData(d).getDate()) + '</b><i>' + (n ? (l ? l + ' livre' + (l > 1 ? 's' : '') : 'lotado') : '—') + '</i></button>';
  }).join('') + '</div>';
  var slots = slotsDoDia(ag, sel), ags = atendDe(ag.id, sel), fora = ags.filter(function (a) { return a.status !== 'cancelado' && slots.indexOf(a.hora) < 0; }), canc = ags.filter(function (a) { return a.status === 'cancelado'; });
  h += '<div class="sec">' + DIAS[parseData(sel).getDay()] + ', ' + brCompleto(sel) + '</div>';
  if (!slots.length && !fora.length) h += '<div class="card"><div class="empty">' + ((ag.bloqueios || []).indexOf(sel) >= 0 ? 'Dia sem atendimento (folga/feriado).' : 'Sem atendimento neste dia da semana.') + '</div></div>';
  else {
    h += '<div class="card lp">' + slots.map(function (hr) {
      var o = ocupanteDe(ag, sel, hr);
      if (!o) {
        var pas = passou(sel, hr), pode = podeAgendarNa(ag) && !pas && ag.ativa;
        return '<div class="row slot"><div class="av" style="background:var(--bg);color:var(--tx);font-size:12px">' + hr + '</div><div class="info"><div class="nm" style="color:' + (pas ? 'var(--tx3)' : 'var(--verde)') + '">' + (pas ? 'Encerrado' : 'Livre') + '</div></div>' +
          (pode ? '<button class="btn sm" data-a="instAgendarSlot" data-v="' + esc(ag.id + '|' + sel + '|' + hr) + '">Agendar</button>' : '') + '</div>';
      }
      return linhaAtendSlot(o, ag, hr);
    }).join('') + fora.map(function (a) { return linhaAtendSlot(a, ag, a.hora); }).join('') + '</div>';
  }
  if (canc.length) h += '<div style="font-size:11.5px;color:var(--tx3);margin:6px 4px">' + canc.length + ' atendimento(s) cancelado(s) neste dia: ' + canc.map(function (a) { return esc(a.hora); }).join(', ') + '</div>';
  return h;
}
function linhaAtendSlot(a, ag, hr) {
  var pc = a.pessoaId ? instD.pac[a.pessoaId] : null, nome = a.pessoaNome, pend = a.status === 'agendado' || a.status === 'confirmado', hj = hoje();
  var bts = '';
  if (ag.dono && a.data <= hj && pend) bts += '<button class="btn sm" data-a="instAtender" data-v="' + esc(a.id) + '">Atender</button><button class="btn gh sm" data-a="instStatusAt" data-v="' + esc(a.id + '|faltou') + '">Faltou</button>';
  else if (ag.dono && (a.status === 'atendido' || a.status === 'faltou')) bts += '<button class="btn gh sm" data-a="instAtender" data-v="' + esc(a.id) + '">Anotações</button>';
  if (podeAgendarNa(ag) && pend) {
    if (a.status === 'agendado') bts += '<button class="btn gh sm" data-a="instStatusAt" data-v="' + esc(a.id + '|confirmado') + '">Confirmar</button>';
    bts += '<button class="btn gh sm" data-a="instRemarcar" data-v="' + esc(a.id) + '">Remarcar</button><button class="btn gh sm" data-a="instStatusAt" data-v="' + esc(a.id + '|cancelado') + '" style="color:var(--vermelho)">Cancelar</button>';
  }
  return '<div class="slotb"><div class="row" style="border:none;padding-bottom:4px">' +
    (nome ? avatarInst(pc, nome) : '<div class="av" style="background:#FFF5DC;color:#8A5A00;font-size:12px">' + esc(hr) + '</div>') +
    '<div class="info"><div class="nm">' + (nome ? esc(nome) : 'Horário ocupado') + ' <span style="color:var(--tx3);font-weight:600;font-size:12px">' + esc(a.hora) + '</span></div>' +
    '<div class="sb">' + esc(a.codigo) + (a.criadoPorNome ? ' · agendado por ' + esc(pri(a.criadoPorNome)) : '') + (a.motivo ? '<br><i>' + esc(String(a.motivo).slice(0, 90)) + '</i>' : '') + '</div></div>' + pillAt(a.status) + '</div>' +
    (bts ? '<div class="slotbt">' + bts + '</div>' : '') + '</div>';
}

/* ═════ fluxo de agendamento ═════ */
function instNovoAg(agId, data, hora) {
  var ag = agId ? agendaPor(agId) : null;
  instFl = { esp: ag ? espChave(ag) : '', agenda: agId || '', data: data || '', hora: hora || '', pessoa: null, motivo: '', autorizou: false, res: [], fim: null };
  instFluxo();
}
function instFluxo() {
  var f = instFl, ag = agendaPor(f.agenda), h = '<h2>Agendar atendimento</h2>';
  var disp = instD.agendas.filter(function (a) { return a.ativa && podeAgendarNa(a); }), gr = gruposEsp(disp);
  if (!f.esp && gr.length === 1) f.esp = gr[0].chave;                 // só uma especialidade: pula a escolha
  var grupo = gr.filter(function (g) { return g.chave === f.esp; })[0];
  if (grupo && !f.agenda && grupo.agendas.length === 1) { f.agenda = grupo.agendas[0].id; ag = agendaPor(f.agenda); }   // só um profissional: pula
  var chips = [];
  if (grupo && gr.length > 1) chips.push('<span class="pill p-dour" data-a="instFlVoltar" data-v="esp" style="cursor:pointer">' + esc(grupo.nome) + ' ✎</span>');
  if (ag) chips.push('<span class="pill p-dour" data-a="instFlVoltar" data-v="agenda" style="cursor:pointer">' + esc(ag.profissionalNome || ag.nome) + ' ✎</span>');
  if (f.data) chips.push('<span class="pill p-dour" data-a="instFlVoltar" data-v="data" style="cursor:pointer">' + brCompleto(f.data) + ' ✎</span>');
  if (f.hora) chips.push('<span class="pill p-dour" data-a="instFlVoltar" data-v="hora" style="cursor:pointer">' + esc(f.hora) + ' ✎</span>');
  if (f.pessoa) chips.push('<span class="pill p-verde" data-a="instFlVoltar" data-v="pessoa" style="cursor:pointer">' + esc(f.pessoa.nome) + ' ✎</span>');
  if (chips.length) h += '<div style="display:flex;flex-wrap:wrap;gap:5px;margin:6px 0 10px">' + chips.join('') + '</div>';
  if (f.fim) return instComprovante();
  if (!f.esp) {
    h += '<div class="sb" style="font-size:13px;margin:6px 0">1. Qual especialidade?</div>' + (gr.length ? gr.map(function (g) {
      var pg = proxLivreGrupo(g), n = g.agendas.length;
      return '<div class="card cl" data-a="instFlEsp" data-v="' + esc(g.chave) + '" style="padding:12px 14px;box-shadow:none;background:var(--bg)"><b>' + esc(g.nome) + '</b><div class="sb" style="font-size:12px;color:var(--tx2)">' +
        n + (g.tipo === 'pastoral' ? ' pastor(a)' : (n > 1 ? ' profissionais' : ' profissional')) + (pg ? ' · próximo livre: ' + quandoRot(pg.data, pg.hora) : ' · sem horários livres') + '</div></div>';
    }).join('') : '<div class="empty">Nenhuma agenda disponível para você.</div>');
  } else if (!f.agenda) {
    h += '<div class="sb" style="font-size:13px;margin:6px 0">2. ' + (grupo && grupo.tipo === 'pastoral' ? 'Com qual pastor(a)?' : 'Com qual profissional?') + '</div>' + grupo.agendas.map(function (a) {
      var pl = proxLivre(a);
      return '<div class="card cl" data-a="instFlAgenda" data-v="' + esc(a.id) + '" style="padding:12px 14px;box-shadow:none;background:var(--bg)"><b>' + esc(a.profissionalNome || a.nome) + '</b><div class="sb" style="font-size:12px;color:var(--tx2)">' +
        esc([a.local, (a.duracaoMin || 30) + ' min'].filter(Boolean).join(' · ')) + (pl ? ' · próximo livre: ' + quandoRot(pl.data, pl.hora) : ' · sem horários livres') + '</div></div>';
    }).join('');
  } else if (!f.data) {
    h += '<div class="sb" style="font-size:13px;margin:6px 0">3. Qual dia?</div><div class="dstrip" style="flex-wrap:wrap">' + proximosDias(28).filter(function (d) { return slotsDoDia(ag, d).length; }).map(function (d) {
      var l = livresDoDia(ag, d).length;
      return '<button class="dch' + (l ? '' : ' off') + '" ' + (l ? 'data-a="instFlDia" data-v="' + d + '"' : 'disabled') + '><small>' + DIAS[parseData(d).getDay()].slice(0, 3) + '</small><b>' + pad(parseData(d).getDate()) + '</b><i>' + (l ? l + ' livre' + (l > 1 ? 's' : '') : 'lotado') + '</i></button>';
    }).join('') + '</div>';
  } else if (!f.hora) {
    var lv = livresDoDia(ag, f.data);
    h += '<div class="sb" style="font-size:13px;margin:6px 0">4. Qual horário? (' + DIAS[parseData(f.data).getDay()] + ')</div>' + (lv.length ? '<div class="hgrid">' + lv.map(function (x) { return '<button data-a="instFlHora" data-v="' + x + '">' + x + '</button>'; }).join('') + '</div>' : '<div class="empty">Sem horários livres neste dia.</div>');
  } else if (!f.pessoa) {
    h += '<div class="sb" style="font-size:13px;margin:6px 0">5. Quem será atendido?</div><div class="busca"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input id="fl-busca" placeholder="Nome ou telefone (mín. 3 letras)" autocomplete="off"></div>' +
      '<div id="fl-res">' + resultadosBusca(f.res) + '</div><button class="btn gh" data-a="instNovoAtendido" data-v="fluxo" style="margin-top:8px">+ Cadastrar novo atendido</button>';
  } else {
    h += '<div class="sb" style="font-size:13px;margin:6px 0">6. Confirmar</div>' +
      '<label>' + (ag.tipo === 'pastoral' ? 'Assunto (opcional — só o pastor vê)' : 'Motivo da consulta (opcional — só o profissional vê)') + '</label><textarea id="fl-motivo" rows="3" maxlength="1000" placeholder="Ex.: retorno, dor, primeira consulta…">' + esc(f.motivo) + '</textarea>' +
      (f.pessoa.autorizou === false ? '<label style="display:flex;gap:10px;align-items:flex-start;margin:10px 0 0;font-size:12.5px;color:#7a4b00"><input type="checkbox" id="fl-aut" style="width:20px;height:20px;flex:0 0 20px"> <span>Confirmo que a pessoa <b>autorizou o uso dos dados</b> (LGPD) para este atendimento.</span></label>' : '') +
      '<div style="height:12px"></div><button class="btn pr" data-a="instFlConfirmar">Agendar atendimento</button>';
  }
  h += '<div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>';
  abrirModal(h);
  if (ag && f.data && f.hora && !f.pessoa && $('fl-busca')) setTimeout(function () { try { $('fl-busca').focus(); } catch (e) {} }, 250);
}
function resultadosBusca(l) {
  if (!l || !l.length) return '<div style="font-size:12px;color:var(--tx3);padding:8px 2px">Digite para buscar. Se a pessoa ainda não tem cadastro, toque em “Cadastrar novo atendido”.</div>';
  return '<div class="card lp" style="box-shadow:none;background:var(--bg)">' + l.map(function (x) {
    return '<div class="row cl" data-a="instFlPessoa" data-v="' + esc(x.id) + '"><div class="av" style="' + corAvatar(x.nome) + '">' + ini(x.nome) + '</div><div class="info"><div class="nm">' + esc(x.nome) + '</div>' +
      '<div class="sb">' + esc(x.codigo) + (x.bairro ? ' · ' + esc(x.bairro) : '') + (x.fone4 ? ' · tel. final ' + esc(x.fone4) : '') + '</div></div><span class="pill ' + (x.igreja ? 'p-dour' : 'p-cinza') + '">' + (x.igreja ? 'da igreja' : 'Instituto') + '</span></div>';
  }).join('') + '</div>';
}
function instBuscar(q, destino) {
  clearTimeout(instBuscaT);
  instBuscaT = setTimeout(function () {
    if (String(q).trim().length < 3) { destino([]); return; }
    if(sbDisponivel()){var n=String(q).toLowerCase();destino(PES().filter(function(p){return [p.nome,p.codigo,p.fone,p.bairro].join(' ').toLowerCase().indexOf(n)>=0;}).slice(0,30).map(function(p){return{id:p.id,nome:p.nome,codigo:p.codigo||'',bairro:p.bairro||'',fone4:(p.fone||'').slice(-4),igreja:true,autorizou:p.consent!==false};}));return;} chamar('instBuscarPessoa', { q: q }).then(function (r) { destino(r.itens || []); }).catch(function (e) { toast(e.message, 4000); });
  }, 350);
}
function instFlPessoa(id) {
  var x = (instFl.res || []).filter(function (r) { return r.id === id; })[0]; if (!x) return;
  instFl.pessoa = { id: x.id, nome: x.nome, codigo: x.codigo, autorizou: x.autorizou }; instFluxo();
}
function instFlConfirmar() {
  var f = instFl, motivo = $('fl-motivo') ? $('fl-motivo').value.trim() : f.motivo; f.motivo = motivo;
  var aut = $('fl-aut') ? $('fl-aut').checked : true;
  if (f.pessoa.autorizou === false && !aut) return toast('Confirme a autorização de uso dos dados.');
  carregando(true, 'Agendando...');
  (sbDisponivel()?v39SaudeSalvarAgendamento(null,v39SaudePayloadAgendamento({agendaId:f.agenda,profissionalId:(agendaPor(f.agenda)||{}).profissionalId,pessoaId:f.pessoa.id,data:f.data,hora:f.hora,motivo:motivo})).then(function(x){return {comprovante:{codigo:String(x.id||'').slice(0,8).toUpperCase(),agenda:(agendaPor(f.agenda)||{}).nome||'',especialidade:(agendaPor(f.agenda)||{}).especialidade||'',data:f.data,hora:f.hora,local:(agendaPor(f.agenda)||{}).local||'',profissional:(agendaPor(f.agenda)||{}).nome||''}};}):chamar('instAgendar', { agendaId: f.agenda, data: f.data, hora: f.hora, pessoaId: f.pessoa.id, motivo: motivo, autorizou: f.pessoa.autorizou === false ? true : undefined })).then(function (r) {
    f.fim = r.comprovante; return carregarInst(true);
  }).then(function () { if (instFl && instFl.fim) instFluxo(); else instFluxo(); })
    .catch(function (e) { toast(e.message, 5000); carregarInst(true).then(function () { if (/ocupado|fora da agenda/i.test(e.message)) { f.hora = ''; instFluxo(); } }); })
    .then(function () { carregando(false); });
}
function textoComprovante(c) {
  var d = parseData(c.data);
  return '✅ *Atendimento agendado*\nProtocolo: ' + c.codigo + '\n' + c.agenda + (c.especialidade ? ' — ' + c.especialidade : '') + '\n📅 ' + DIAS[d.getDay()].toLowerCase() + ', ' + brCompleto(c.data) + ' às ' + c.hora +
    (c.local ? '\n📍 ' + c.local : '') + '\n👤 ' + c.pessoaNome + ' (' + c.pessoaCodigo + ')\n\nChegue 10 minutos antes e traga um documento. Se não puder vir, avise com antecedência. 🙏\n' + igrNome();
}
function instComprovante() {
  var c = instFl.fim;
  abrirModal('<div class="perfil" style="padding-top:2px"><div class="av" style="background:var(--verde);color:#fff;width:64px;height:64px;font-size:28px;margin:0 auto 8px">✓</div><h2>Agendado!</h2><p>Protocolo <b>' + esc(c.codigo) + '</b></p></div>' +
    '<div class="card kvs" style="background:var(--bg);box-shadow:none"><div class="kv"><span>Com</span><b>' + esc(c.agenda) + '</b></div><div class="kv"><span>Quando</span><b>' + DIAS[parseData(c.data).getDay()] + ', ' + brCompleto(c.data) + ' · ' + esc(c.hora) + '</b></div>' +
    (c.local ? '<div class="kv"><span>Local</span><b>' + esc(c.local) + '</b></div>' : '') + '<div class="kv"><span>Atendido</span><b>' + esc(c.pessoaNome) + '</b></div></div>' +
    '<div class="gap"></div><button class="btn pr" data-a="instCompartilhar">Enviar comprovante (WhatsApp)</button><div class="gap"></div><button class="btn gh" data-a="instNovoAg">Novo agendamento</button><div class="gap"></div><button class="btn gh" data-a="fechar">Concluir</button>');
}
function instCompartilhar() {
  var t = textoComprovante(instFl.fim);
  if (navigator.share) navigator.share({ text: t }).catch(function () {});
  else window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank');
}
function instStatusAt(v) {
  var p = v.split('|'), id = p[0], st = p[1];
  var a = instD.ags.filter(function (x) { return x.id === id; })[0];
  if (st === 'cancelado' && !confirm('Cancelar o atendimento ' + (a ? a.codigo : '') + '? O horário volta a ficar livre.')) return;
  if (st === 'faltou' && !confirm('Registrar falta?')) return;
  carregando(true, 'Salvando...');
  (sbDisponivel()?v39SaudeSalvarAgendamento(id,{status:st==='cancelado'?'cancelled':st==='faltou'?'no_show':st}):chamar('instStatus', { id: id, status: st })).then(function () { toast(st === 'cancelado' ? 'Atendimento cancelado' : st === 'faltou' ? 'Falta registrada' : 'Atualizado ✓'); return carregarInst(true); })
    .catch(function (e) { toast(e.message, 5000); }).then(function () { carregando(false); render(); });
}
function instRemarcarAbrir(id) {
  var a = instD.ags.filter(function (x) { return x.id === id; })[0], ag = a && agendaPor(a.agendaId); if (!a || !ag) return;
  instFl = { remarcar: id, agenda: ag.id, data: '', hora: '' }; instRemFluxo();
}
function instRemFluxo() {
  var f = instFl, ag = agendaPor(f.agenda), h = '<h2>Remarcar</h2><div class="sb" style="font-size:12.5px;color:var(--tx2)">' + esc(ag.nome) + '</div>';
  if (!f.data) h += '<div class="sb" style="font-size:13px;margin:10px 0 6px">Escolha o novo dia</div><div class="dstrip" style="flex-wrap:wrap">' + proximosDias(28).filter(function (d) { return livresDoDia(ag, d).length; }).map(function (d) {
    return '<button class="dch" data-a="instRemDia" data-v="' + d + '"><small>' + DIAS[parseData(d).getDay()].slice(0, 3) + '</small><b>' + pad(parseData(d).getDate()) + '</b><i>' + livresDoDia(ag, d).length + ' livres</i></button>'; }).join('') + '</div>';
  else h += '<div class="sb" style="font-size:13px;margin:10px 0 6px">' + DIAS[parseData(f.data).getDay()] + ', ' + brCompleto(f.data) + ' — escolha o horário</div><div class="hgrid">' + livresDoDia(ag, f.data).map(function (x) { return '<button data-a="instRemHora" data-v="' + x + '">' + x + '</button>'; }).join('') + '</div>' +
    '<button class="btn gh sm" data-a="instRemDia" data-v="" style="margin-top:8px">‹ outro dia</button>';
  abrirModal(h + '<div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
}
function instRemConfirmar(hora) {
  carregando(true, 'Remarcando...');
  (sbDisponivel()?v39SaudeSalvarAgendamento(instFl.remarcar,{scheduled_for:instFl.data+'T'+hora+':00',status:'rescheduled'}):chamar('instRemarcar', { id: instFl.remarcar, data: instFl.data, hora: hora })).then(function () { fechar(); toast('Atendimento remarcado ✓'); return carregarInst(true); })
    .catch(function (e) { toast(e.message, 5000); }).then(function () { carregando(false); render(); });
}

/* ═════ cadastro de atendido (base única) ═════ */
function instNovoAtendido(origem) {
  instCd = { igreja: null, res: [], origem: origem === 'fluxo' ? 'fluxo' : origem === 'curso' ? 'curso' : origem === 'estoque' ? 'estoque' : '' };
  fotoNovaP = null; fpAlvo = { pid: '', direto: false};
  instCdTela();
}
function instCdTela() {
  var c = instCd, h = '<h2>Cadastro de atendido</h2>';
  if (c.igreja === null) {
    h += '<div class="sb" style="font-size:13.5px;margin:8px 0 12px;line-height:1.5">A pessoa <b>já faz parte da igreja</b>? Se sim, vamos localizar o cadastro dela e vincular pelo código — sem duplicar.</div>' +
      '<div class="opt"><button class="btn pr" data-a="instCdIgreja" data-v="1">Sim, é da igreja</button><button class="btn gh" data-a="instCdIgreja" data-v="0">Não</button></div>';
  } else if (c.igreja === true) {
    h += '<div class="busca"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input id="cd-busca" placeholder="Nome ou telefone" autocomplete="off"></div><div id="cd-res">' + resultadosBuscaCd(c.res) +
      '</div><button class="btn gh sm" data-a="instCdIgreja" data-v="0" style="margin-top:8px">Não encontrei — cadastrar como novo</button>';
  } else {
    h += '<div class="aviso" style="margin:6px 0 4px;font-size:12.5px">Pessoa <b>fora da igreja</b>: será criado um cadastro novo, com código próprio, visível só ao Instituto.</div>' + campoFotoPessoa('') +
      '<label>Nome completo *</label><input id="i-nome" autocomplete="off"><div class="g2"><div><label>WhatsApp</label><input id="i-fone" type="tel" inputmode="numeric" placeholder="(16) 99999-0000"></div>' +
      '<div><label>Nascimento</label><input id="i-nasc" type="date"></div></div><div class="g2"><div><label>Sexo</label><select id="i-sexo"><option value="">—</option><option>Feminino</option><option>Masculino</option></select></div><div>' + campoBairro('i', '', false, '') + '</div></div>' +
      '<label>Cidade</label><input id="i-cidade" value="' + esc(cidadeIgreja()) + '">' + camposConsent('i', null, '').replace('A pessoa autorizou o uso dos dados pela igreja?', 'A pessoa autorizou o uso dos dados e da imagem?') +
      '<div style="height:12px"></div><button class="btn pr" data-a="instCdSalvar">Cadastrar atendido</button>';
  }
  abrirModal(h + '<div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
}
function resultadosBuscaCd(l) {
  if (!l || !l.length) return '<div style="font-size:12px;color:var(--tx3);padding:8px 2px">Digite ao menos 3 letras do nome ou 4 dígitos do telefone.</div>';
  return '<div class="card lp" style="box-shadow:none;background:var(--bg)">' + l.map(function (x) {
    return '<div class="row cl" data-a="instCdEscolher" data-v="' + esc(x.id) + '"><div class="av" style="' + corAvatar(x.nome) + '">' + ini(x.nome) + '</div><div class="info"><div class="nm">' + esc(x.nome) + '</div>' +
      '<div class="sb">' + esc(x.codigo) + (x.bairro ? ' · ' + esc(x.bairro) : '') + (x.fone4 ? ' · tel. final ' + esc(x.fone4) : '') + '</div></div><span class="pill ' + (x.igreja ? 'p-dour' : 'p-cinza') + '">' + (x.igreja ? 'da igreja' : 'Instituto') + '</span></div>';
  }).join('') + '</div>';
}
function instCdConcluir(p, msg) {
  toast(msg || 'Atendido vinculado ✓ ' + p.codigo, 4000);
  if (instCd && instCd.origem === 'fluxo' && instFl) { instFl.pessoa = { id: p.id, nome: p.nome, codigo: p.codigo, autorizou: p.autorizou !== false }; instCd = null; instFluxo(); }
  else if (instCd && instCd.origem === 'curso' && partInstCtx) { instCd = null; partInstNovo(p); } else if (instCd && instCd.origem === 'estoque' && estFl) { instCd = null; estFlPessoaNova(p); } else { instCd = null; fechar(); }
}
function instCdSalvar() {
  var v = function (id) { var e = $(id); return e ? e.value.trim() : ''; };
  if (v('i-nome').length < 3) return toast('Informe o nome completo.');
  var er = validarConsent('i', true); if (er) return toast(er, 4500);
  var d = { nome: v('i-nome'), fone: v('i-fone'), nasc: v('i-nasc'), sexo: v('i-sexo'), bairro: v('i-bairro'), cidade: v('i-cidade'), consentimento: 'Sim', responsavel: v('i-resp'), foto: fotoNovaP && fotoNovaP !== '__remover__' ? fotoNovaP : '' };
  carregando(true, 'Cadastrando...');
  chamar('instCriarPessoa', { pessoa: d }).then(function (r) {
    fotoNovaP = null; instCdConcluir(r.pessoa, r.existente ? 'Esta pessoa já estava cadastrada — vinculada pelo código ' + r.pessoa.codigo : 'Atendido cadastrado ✓ ' + r.pessoa.codigo);
  }).catch(function (e) { toast(e.message, 5000); }).then(function () { carregando(false); });
}

/* ═════ atendimento e prontuário (somente o profissional responsável) ═════ */
function instAtender(id) {
  var a = instD.ags.filter(function (x) { return x.id === id; })[0], ag = a && agendaPor(a.agendaId), pc = a && instD.pac[a.pessoaId];
  if (!a || !ag || !ag.dono || !pc) return toast('Somente o profissional responsável abre este atendimento.');
  var past = ag.tipo === 'pastoral';
  abrirModal('<div class="perfil" style="padding-top:0">' + avatarInst(pc, pc.nome, 72) + '<h2 style="font-size:19px">' + esc(pc.nome) + '</h2>' +
    '<p>' + esc([pc.codigo, pc.idade !== null && pc.idade !== undefined ? pc.idade + ' anos' : '', pc.sexo, pc.bairro].filter(Boolean).join(' · ')) + '</p>' +
    '<div class="pills">' + pillAt(a.status) + (pc.igreja ? '<span class="pill p-dour">membro/visitante da igreja</span>' : '') + '</div></div>' +
    (pc.fone ? '<div class="qas" style="grid-template-columns:1fr 1fr"><a class="qa" target="_blank" rel="noopener" href="https://wa.me/' + (fone(pc.fone).length <= 11 ? '55' : '') + fone(pc.fone) + '"><span>WhatsApp</span></a><a class="qa" href="tel:' + fone(pc.fone) + '"><span>Ligar</span></a></div>' : '') +
    '<div class="aviso" style="margin:10px 0 4px;font-size:12px;line-height:1.45">🔒 Anotações <b>cifradas</b> e visíveis <b>somente para você</b>' + (past ? '' : '. Master, pastor e secretaria não têm acesso.') + '</div>' +
    (a.motivo ? '<div style="background:var(--bg);border-radius:12px;padding:9px 12px;font-size:12.5px;margin:8px 0"><b>Motivo informado no agendamento:</b><br>' + esc(a.motivo) + '</div>' : '') +
    '<div id="pr-corpo"><div class="empty" style="padding:14px">Abrindo anotações…</div></div>');
  (sbDisponivel()?v39ProntuarioCarregar(a.pessoaId,a.id):chamar('instProntuarioDe', { pessoaId: a.pessoaId })).then(function (r) {
    var itens = r.itens || [], atual = itens.filter(function (e) { return e.agendamentoId === a.id; })[0] || {}, ant = itens.filter(function (e) { return e.agendamentoId !== a.id; });
    var L = past ? ['Assunto', 'Anotações do atendimento', 'Encaminhamentos / próximos passos'] : ['Queixa / motivo da consulta', 'Evolução, exame e anotações clínicas', 'Conduta e prescrição'];
    var h = '<label>' + L[0] + '</label><textarea id="pr-q" rows="2" maxlength="4000">' + esc(atual.queixa) + '</textarea><label>' + L[1] + '</label><textarea id="pr-e" rows="5" maxlength="4000">' + esc(atual.evolucao) + '</textarea>' +
      '<label>' + L[2] + '</label><textarea id="pr-c" rows="3" maxlength="4000">' + esc(atual.conduta) + '</textarea><label>Retorno sugerido em</label><input id="pr-r" type="date" value="' + esc(atual.retorno || '') + '">' +
      '<div style="height:12px"></div>' + (a.data <= hoje() && a.status !== 'atendido' ? '<button class="btn pr" data-a="instRegSalvar" data-v="' + esc(a.id + '|1') + '">Salvar e marcar como atendido</button><div class="gap"></div>' : '') +
      '<button class="btn ' + (a.status === 'atendido' ? 'pr' : 'gh') + '" data-a="instRegSalvar" data-v="' + esc(a.id + '|0') + '">Salvar anotações</button>' +
      (a.data <= hoje() && (a.status === 'agendado' || a.status === 'confirmado') ? '<div class="gap"></div><button class="btn gh" data-a="instStatusAt" data-v="' + esc(a.id + '|faltou') + '" style="color:var(--vermelho)">Registrar falta</button>' : '') +
      '<div class="gap"></div><button class="btn gh" data-a="fechar">Fechar</button>';
    if (ant.length) h += '<div class="sec">Histórico com você (' + ant.length + ')</div>' + ant.map(function (e) {
      return '<div class="card" style="box-shadow:none;background:var(--bg);padding:10px 12px"><div style="font-size:11.5px;color:var(--tx3);font-weight:800">' + brCompleto(e.data) + '</div>' +
        (e.queixa ? '<div style="font-size:12.5px;margin-top:3px"><b>' + L[0] + ':</b> ' + esc(e.queixa) + '</div>' : '') + (e.evolucao ? '<div style="font-size:12.5px;margin-top:3px;white-space:pre-line"><b>' + L[1] + ':</b> ' + esc(e.evolucao) + '</div>' : '') +
        (e.conduta ? '<div style="font-size:12.5px;margin-top:3px;white-space:pre-line"><b>' + L[2] + ':</b> ' + esc(e.conduta) + '</div>' : '') + '</div>'; }).join('');
    if ($('pr-corpo')) $('pr-corpo').innerHTML = h;
  }).catch(function (e) { if ($('pr-corpo')) $('pr-corpo').innerHTML = '<div class="aviso r">' + esc(e.message) + '</div>'; });
}
function instRegSalvar(v) {
  var p = v.split('|'), id = p[0], marcar = p[1] === '1';
  carregando(true, 'Salvando...');
  (sbDisponivel()?v39ProntuarioSalvar(id,{queixa:$('pr-q').value,evolucao:$('pr-e').value,conduta:$('pr-c').value,retorno:$('pr-r').value},marcar):chamar('instRegistro', { agendamentoId: id, queixa: $('pr-q').value, evolucao: $('pr-e').value, conduta: $('pr-c').value, retorno: $('pr-r').value, marcarAtendido: marcar })).then(function () {
    fechar(); toast(marcar ? 'Atendimento registrado ✓' : 'Anotações salvas ✓'); return carregarInst(true);
  }).catch(function (e) { toast(e.message, 5000); }).then(function () { carregando(false); render(); });
}

/* ═════ novo profissional (login + agenda) ═════ */
function sugerirLogin(nome) {
  var tit = { dr: 1, dra: 1, doutor: 1, doutora: 1, pr: 1, pra: 1, pastor: 1, pastora: 1, prof: 1, profa: 1 };
  var p = normalizar(nome).replace(/[^a-z ]/g, ' ').split(' ').filter(function (w) { return w && !tit[w]; });
  return p.length > 1 ? p[0] + '.' + p[p.length - 1] : (p[0] || '');
}
function instProfForm() {
  var h = '<h2>Novo profissional</h2><div class="sb" style="font-size:12.5px;color:var(--tx2);line-height:1.5;margin:2px 0 4px">Cria o acesso do profissional (ele vê só a própria agenda e os próprios pacientes) e, em seguida, a agenda dele. ' +
    'Para pastor(a), use <b>Perfil → Usuários</b> (nível Pastor) e depois crie a agenda pastoral.</div>' +
    '<label>Nome completo *</label><input id="pf-nome" placeholder="Ex.: Dra. Maria Souza" autocomplete="off">' +
    '<div class="g2"><div><label>Usuário de acesso *</label><input id="pf-user" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="maria.souza"></div>' +
    '<div><label>Especialidade *</label><input id="pf-esp" list="esp-lista2" placeholder="Ex.: Pediatria" autocomplete="off"><datalist id="esp-lista2">' +
      ESPECIALIDADES_SUG.concat(instD.agendas.map(function (x) { return x.especialidade; })).filter(function (v, i, arr) { return v && arr.indexOf(v) === i; }).map(function (v) { return '<option value="' + esc(v) + '">'; }).join('') + '</datalist></div></div>' +
    '<div class="g2"><div><label>E-mail (recebe a senha)</label><input id="pf-email" type="email" autocapitalize="none" placeholder="nome@email.com"></div>' +
    '<div><label>WhatsApp</label><input id="pf-fone" type="tel" inputmode="numeric" placeholder="(16) 99999-0000"></div></div>' +
    '<div class="aviso" style="margin:12px 0 4px;font-size:12px">A senha é <b>temporária</b> (vale 7 dias): se informar o e-mail, ela é enviada; o profissional cria a definitiva no primeiro acesso.</div>' +
    '<div style="height:10px"></div><button class="btn pr" data-a="instProfSalvar">Cadastrar e configurar a agenda</button><div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>';
  abrirModal(h);
}
function instProfSalvar() {
  var v = function (id) { var e = $(id); return e ? e.value.trim() : ''; };
  if (v('pf-nome').length < 3) return toast('Informe o nome completo.');
  if (!v('pf-user')) return toast('Informe o usuário de acesso.');
  if (!v('pf-esp')) return toast('Informe a especialidade.');
  var d = { nome: v('pf-nome'), usuario: v('pf-user'), email: v('pf-email'), fone: v('pf-fone') }, esp = v('pf-esp');
  carregando(true, 'Cadastrando...');
  chamar('instCriarProfissional', { profissional: d }).then(function (r) {
    carregando(false);
    var wa = fone(d.fone) ? 'https://wa.me/' + (fone(d.fone).length <= 11 ? '55' : '') + fone(d.fone) + '?text=' + encodeURIComponent('Olá, ' + pri(d.nome) + '! Seu acesso ao app ' + igrNome() + ': usuário ' + r.profissional.usuario + ' · senha temporária ' + r.senhaTemp + ' (vale 7 dias; ao entrar você cria a sua).') : '';
    abrirModal('<div class="perfil" style="padding-top:2px"><div class="av" style="background:var(--verde);color:#fff;width:64px;height:64px;font-size:28px;margin:0 auto 8px">✓</div><h2>Profissional cadastrado</h2><p>' + esc(r.profissional.nome) + '</p></div>' +
      '<div class="card kvs" style="background:var(--bg);box-shadow:none"><div class="kv"><span>Usuário</span><b>' + esc(r.profissional.usuario) + '</b></div><div class="kv"><span>Senha temporária</span><b style="font-size:16px;letter-spacing:.5px">' + esc(r.senhaTemp) + '</b></div>' +
      '<div class="kv"><span>E-mail</span><b>' + (r.emailEnviado ? 'enviado ✓' : 'não enviado') + '</b></div></div>' +
      '<div style="font-size:11.5px;color:var(--tx3);margin:6px 2px 10px;line-height:1.45">Anote ou envie agora: <b>esta senha não aparece de novo</b>. Se perder, use “Redefinir senha” em Usuários.</div>' +
      (wa ? '<a class="btn gh" style="text-decoration:none;text-align:center" target="_blank" rel="noopener" href="' + wa + '">Enviar acesso pelo WhatsApp</a><div class="gap"></div>' : '') +
      '<button class="btn pr" data-a="instProfAgenda" data-v="' + esc(r.profissional.id + '|' + esp + '|' + r.profissional.nome) + '">Configurar a agenda agora</button><div class="gap"></div><button class="btn gh" data-a="fechar">Depois</button>');
    carregarInst(true);
  }).catch(function (e) { carregando(false); toast(e.message, 5500); });
}
/** Abre o formulário de agenda já com o profissional (e a especialidade) escolhidos. */
function instAgendaDe(profId, esp, nome) {
  carregarInst(true).then(function () {
    instAgendaForm('', { profissionalId: profId, especialidade: esp || '', nome: esp ? (nome ? nome + ' — ' : '') + esp : '' });
  });
}

/* ═════ cadastro de agendas e horários ═════ */
var DIAS_ORD = [1, 2, 3, 4, 5, 6, 0];
function instAgendaForm(id, pre) {
  pre = pre || {};
  var a = id ? agendaPor(id) : null, admin = instD.perm.admin;
  instAgForm = { id: id || '', tipo: a ? a.tipo : (pre.tipo || 'saude'), bloq: a ? (a.bloqueios || []).slice() : [] };
  var hs = a ? a.horarios || [] : [];
  var porDia = function (d) { return hs.filter(function (h) { return +h.dow === d; }).sort(function (x, y) { return x.ini < y.ini ? -1 : 1; }); };
  var h = '<h2>' + (a ? 'Editar agenda' : 'Nova agenda') + '</h2>';
  if (admin) {
    h += '<div class="g2"><div><label>Tipo</label><select id="ag-tipo"' + (a ? ' disabled' : '') + '>' + opts([['saude', 'Saúde (médico, psicólogo…)'], ['pastoral', 'Pastoral (pastor/pastora)']], instAgForm.tipo) + '</select></div>' +
      '<div><label>Situação</label><select id="ag-ativa">' + opts([['1', 'Ativa'], ['0', 'Inativa']], !a || a.ativa ? '1' : '0') + '</select></div></div>' +
      '<label>Nome da agenda *</label><input id="ag-nome" value="' + esc(a ? a.nome : (pre.nome || '')) + '" placeholder="Ex.: Dra. Maria — Clínica geral">' +
      '<div class="g2"><div><label>Especialidade</label><input id="ag-esp" list="esp-lista" value="' + esc(a ? a.especialidade : (pre.especialidade || '')) + '" placeholder="Ex.: Pediatria" autocomplete="off"><datalist id="esp-lista">' + ESPECIALIDADES_SUG.concat(instD.agendas.map(function (x) { return x.especialidade; })).filter(function (v, i, arr) { return v && arr.indexOf(v) === i; }).map(function (v) { return '<option value="' + esc(v) + '">'; }).join('') + '</datalist></div><div><label>Local</label><input id="ag-local" value="' + esc(a ? a.local : '') + '" placeholder="Sala 2"></div></div>' +
      '<label>Profissional responsável *</label><select id="ag-prof">' + opcoesProfissionais(instAgForm.tipo, a ? a.profissionalId : (pre.profissionalId || '')) + '</select>' +
      '<div style="margin-top:4px"><span class="pill p-dour" data-a="instProfForm" style="cursor:pointer">+ cadastrar novo profissional</span></div>' +
      '<div style="font-size:11px;color:var(--tx3);margin-top:3px">Só esta pessoa vê os nomes dos pacientes e as anotações. Para criar o profissional, cadastre o usuário com o nível “Profissional de saúde”.</div>';
  }
  h += '<label>Duração de cada atendimento (minutos)</label><input id="ag-dur" type="number" min="10" max="240" step="5" value="' + esc(a ? a.duracaoMin : 30) + '">' +
    '<div class="sec" style="margin-left:0">Dias e horários de atendimento</div><div style="font-size:11.5px;color:var(--tx3);margin:-4px 0 6px">Deixe em branco os dias sem atendimento. Dois períodos por dia (ex.: manhã e tarde).</div>' +
    DIAS_ORD.map(function (d) {
      var p = porDia(d), g = function (i, k) { return p[i] ? p[i][k] : ''; };
      return '<div class="hdia"><b>' + DIAS[d].slice(0, 3) + '</b>' + [0, 1].map(function (i) {
        return '<span class="hper"><input data-hd="' + d + '-' + i + '-ini" value="' + g(i, 'ini') + '" inputmode="numeric" maxlength="5" placeholder="--:--"><u>–</u><input data-hd="' + d + '-' + i + '-fim" value="' + g(i, 'fim') + '" inputmode="numeric" maxlength="5" placeholder="--:--"></span>';
      }).join('') + '</div>';
    }).join('') +
    '<div class="sec" style="margin-left:0">Dias sem atendimento (folgas, feriados)</div><div id="ag-bloq" class="bloqs"></div><div style="display:flex;gap:8px"><input id="ag-bloqd" type="date"><button class="btn gh sm" data-a="instBloqAdd" style="white-space:nowrap">+ Adicionar</button></div>' +
    '<div style="height:14px"></div><button class="btn pr" data-a="instAgendaSalvar">Salvar agenda</button>' + (a && admin ? '<div class="gap"></div><button class="btn dg" data-a="instAgendaExcluir">Excluir agenda</button>' : '') + '<div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>';
  abrirModal(h); pintarBloq();
}
function opcoesProfissionais(tipo, sel) {
  var l = instD.profissionais.filter(function (p) { return tipo === 'pastoral' ? (p.papel === 'pastor' || p.papel === 'master') : p.papel === 'profissional'; });
  return '<option value="">— escolher —</option>' + l.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.nome) + '</option>'; }).join('');
}
function pintarBloq() {
  var el = $('ag-bloq'); if (!el) return;
  el.innerHTML = instAgForm.bloq.length ? instAgForm.bloq.slice().sort().map(function (d) { return '<span class="pill p-cinza">' + brCompleto(d) + ' <b data-a="instBloqRem" data-v="' + d + '" style="cursor:pointer;margin-left:4px">×</b></span>'; }).join(' ') : '<span style="font-size:12px;color:var(--tx3)">Nenhum.</span>';
}
var instHoraErr = '';
/** "830" → "08:30"; "8" → "08:00"; inválido → "" */
function normHora(v) {
  var d = String(v || '').replace(/\D/g, ''); if (!d) return '';
  if (d.length <= 2) d = ('0' + d).slice(-2) + '00'; else if (d.length === 3) d = '0' + d; else d = d.slice(0, 4);
  var h = +d.slice(0, 2), m = +d.slice(2); return h > 23 || m > 59 ? '' : d.slice(0, 2) + ':' + d.slice(2);
}
function lerAgendaForm() {
  instHoraErr = '';
  var hs = [], els = document.querySelectorAll('[data-hd]'), m = {};
  for (var i = 0; i < els.length; i++) { var k = els[i].getAttribute('data-hd').split('-'), key = k[0] + '-' + k[1], raw = els[i].value.trim(), nh = normHora(raw); if (raw && !nh) instHoraErr = raw; (m[key] = m[key] || { dow: +k[0] })[k[2]] = nh; }
  Object.keys(m).forEach(function (k) { if (m[k].ini || m[k].fim) hs.push(m[k]); });
  var d = { id: instAgForm.id, horarios: hs, bloqueios: instAgForm.bloq, duracaoMin: +($('ag-dur').value || 30) };
  if ($('ag-nome')) { d.tipo = $('ag-tipo').value; d.nome = $('ag-nome').value.trim(); d.especialidade = $('ag-esp').value.trim(); d.local = $('ag-local').value.trim(); d.profissionalId = $('ag-prof').value; d.ativa = $('ag-ativa').value === '1'; }
  return d;
}
function instAgendaSalvar(excluir) {
  var d = lerAgendaForm(); if (excluir === true) d.deleted = true;
  if (instHoraErr) return toast('Horário inválido: “' + instHoraErr + '”. Use o formato 08:30.', 4500);
  for (var i = 0; i < d.horarios.length; i++) if (!d.horarios[i].ini || !d.horarios[i].fim) return toast('Preencha o início e o fim de cada período.');
  carregando(true, 'Salvando...');
  (sbDisponivel()?v39SalvarAgendaSaude(d):chamar('instSalvarAgenda', { agenda: d })).then(function () { fechar(); toast(excluir === true ? 'Agenda excluída' : 'Agenda salva ✓'); if (excluir === true && cfg.aba === 'instagenda') irAba('instituto'); return carregarInst(true); })
    .catch(function (e) { toast(e.message, 5500); }).then(function () { carregando(false); render(); });
}

/* ── encontros agendados (futuros) ── */
function agendados(gcId) {
  var hj = hoje();
  return ENC(gcId).filter(function (e) { return e.data > hj; }).sort(function (a, b) { return a.data < b.data ? -1 : 1; });
}
function blocoAgendados(gcId, naChamada) {
  var l = agendados(gcId), gere = pode('gcEvento');
  if (!l.length && !(naChamada && gere)) return '';
  var h = '<div class="sec"' + (naChamada ? ' style="margin-top:0"' : '') + '>Próximos encontros agendados</div><div class="card">';
  h += l.length ? l.slice(0, naChamada ? 10 : 3).map(function (e) {
    var d = parseData(e.data);
    return '<div class="row' + (gere ? ' cl" data-a="encEditar" data-v="' + esc(e.data) : '') + '" style="align-items:flex-start">' +
      '<div class="av" style="flex-direction:column;font-size:11px;line-height:1.1"><b style="font-size:14px">' + e.data.slice(8, 10) + '</b>' + MESES[d.getMonth()] + '</div>' +
      '<div class="info"><div class="nm" style="white-space:normal">' + DIAS[d.getDay()] + (e.horario ? ' · ' + esc(e.horario) : '') + (e.tema ? ' — ' + esc(e.tema) : '') + '</div>' +
      '<div class="sb">' + (e.anfitriao ? 'Pregador: ' + esc(e.anfitriao) : 'pregador a definir') + '</div>' +
      (e.recados ? '<div class="sb" style="white-space:pre-line;color:#666">' + esc(e.recados) + '</div>' : '') + '</div>' +
      (gere ? '<span class="pill p-cinza">editar</span>' : '') + '</div>';
  }).join('') : '<div class="empty" style="padding:12px">Nenhum encontro agendado.</div>';
  if (naChamada && gere) h += '<button class="btn gh" data-a="encAgendar" style="margin-top:8px">+ Agendar encontro</button>';
  else if (!naChamada && l.length > 3) h += '<div style="font-size:11.5px;color:#888;margin-top:6px">+ ' + (l.length - 3) + ' na aba Encontros</div>';
  return h + '</div>';
}
function encAgendar() {
  var g = gcPor(gcA()), prox = proximoEncontro(g), d = prox && prox >= hoje() && !achaEnc(gcA(), prox) ? prox : '';
  if (!d) { var x = parseData(hoje()); x.setDate(x.getDate() + 7); d = isoData(x); }
  while (achaEnc(gcA(), d)) { var y = parseData(d); y.setDate(y.getDate() + 7); d = isoData(y); }
  abrirModal('<h2>Novo encontro</h2><div class="sb" style="font-size:12.5px;color:#888">' + esc(gcNome(gcA())) + '</div>' +
    '<div class="g2"><div><label>Data *</label><input id="ag-data" type="date" min="' + hoje() + '" value="' + d + '"></div>' +
    '<div><label>Horário</label><input id="ag-hora" type="time" value="' + esc((g && g.horario) || '') + '"></div></div>' +
    '<label>Pregador</label><input id="ag-preg" placeholder="Quem vai ministrar">' +
    '<label>Tema / estudo</label><input id="ag-tema" placeholder="Ex.: Mateus 5">' +
    '<label>Recados</label><textarea id="ag-rec" rows="3" placeholder="Ex.: trazer lanche, encontro na casa da família Souza"></textarea>' + escalaCampos({}, gcA()) +
    '<div style="font-size:11px;color:#999;margin-top:6px">A chamada deste encontro abre no dia, 1h antes do horário até 4h depois.</div>' +
    '<div style="height:16px"></div><button class="btn pr" data-a="encSalvarAgenda">Agendar</button><div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
}
function encSalvarAgenda() {
  var d = $('ag-data').value;
  if (!d) return toast('Informe a data.');
  if (d < hoje()) return toast('Para datas passadas, escolha a data em “Encontros” e toque em Criar encontro.');
  if (achaEnc(gcA(), d)) return toast('Já existe encontro nesta data. Toque nele na lista para editar.');
  var escA = lerEscala(), pregA = $('ag-preg').value.trim() || (escA.pregador ? nomeEquipe(gcA(), escA.pregador) : '');
  db.encontros.push({ data: d, gcId: gcA(), horario: $('ag-hora').value, anfitriao: pregA, tema: $('ag-tema').value.trim(), escala: escA,
    recados: $('ag-rec').value.trim(), presencas: {}, lista: { add: [], rem: [] }, dizimo: '', oferta: '', deleted: false, updatedAt: agora(), _pend: true });
  cfg.dataChamada = d; cfg.dataChamadaGC = gcA(); salvarCfg();
  salvarDB(); fechar(); render(); sincronizar(false); toast('Encontro de ' + br(d) + ' criado ✓');
  var novA = novosNaEscala({}, escA);
  if (novA.length) setTimeout(function () { avisarEscalaModal(d, novA); }, 350);
}
function encCancelar(data) {
  var e = achaEnc(gcA(), data); if (!e) return;
  if (marcados(e)) return toast('Este encontro já tem chamada lançada e não pode ser cancelado.');
  if (!confirm('Cancelar o encontro de ' + brCompleto(data) + '?')) return;
  e.deleted = true; e.updatedAt = agora(); e._pend = true;
  salvarDB(); fechar(); render(); sincronizar(false); toast('Encontro cancelado');
}

/* ── acessos do usuário (tela de usuários) ── */
function blocoAcessos(u, travado) {
  var ef = u.perms || {}, base = PERM_PADRAO_C[u.papel] || [];
  return '<div class="sec" style="margin-left:0">Acessos</div><div style="font-size:11.5px;color:#888;margin:-2px 0 6px">Marcado = pode usar. O nível define o padrão; ajuste o que precisar para esta pessoa.</div>' +
    '<div id="eu-perms" style="border:1.5px solid #e2e2e2;border-radius:11px;padding:2px 10px">' + PERM_ORDEM.map(function (p) {
      var on = !!ef[p], padrao = base.indexOf(p) >= 0;
      return '<label style="display:flex;align-items:center;gap:10px;margin:0;padding:9px 2px;border-bottom:1px solid #f2f2f2;font-size:13px;color:#222;font-weight:600">' +
        '<input type="checkbox" class="eu-perm" value="' + p + '" style="width:20px;height:20px;flex:0 0 20px"' + (on ? ' checked' : '') + (travado ? ' disabled' : '') + '>' +
        '<span style="flex:1">' + PERM_NOME_C[p] + '</span><span class="perm-tag" data-p="' + p + '" style="font-size:10px;color:' + (on === padrao ? '#aaa' : '#a87700') + ';font-weight:700">' +
        (on === padrao ? 'padrão' : 'ajustado') + '</span></label>';
    }).join('') + '</div>' + (travado ? '' : '<div style="text-align:right;margin-top:6px"><span class="pill p-cinza" data-a="permPadrao" style="cursor:pointer">restaurar padrão do nível</span></div>');
}
function marcarPadraoPerms() {
  var p = $('eu-papel') ? $('eu-papel').value : '', base = PERM_PADRAO_C[p] || [], cks = document.querySelectorAll('.eu-perm');
  for (var i = 0; i < cks.length; i++) cks[i].checked = base.indexOf(cks[i].value) >= 0;
  pintarTagsPerms();
}
function pintarTagsPerms() {
  var p = $('eu-papel') ? $('eu-papel').value : '', base = PERM_PADRAO_C[p] || [], cks = document.querySelectorAll('.eu-perm');
  for (var i = 0; i < cks.length; i++) {
    var t = document.querySelector('.perm-tag[data-p="' + cks[i].value + '"]'), pad0 = base.indexOf(cks[i].value) >= 0;
    if (t) { t.textContent = cks[i].checked === pad0 ? 'padrão' : 'ajustado'; t.style.color = cks[i].checked === pad0 ? '#aaa' : '#a87700'; }
  }
}
function lerAcessos() {
  var cks = document.querySelectorAll('.eu-perm'), o = {};
  if (!cks.length || cks[0].disabled) return null;
  for (var i = 0; i < cks.length; i++) o[cks[i].value] = cks[i].checked;
  return o;
}

/* ═══════════════════ SEGURANÇA E LGPD ═══════════════════ */
var consentAberto = false;
function verPolitica(paraAceite) {
  carregando(true,'Carregando...');
  v39PoliticaPublica().then(function(r){r=Array.isArray(r)?(r[0]||{}):(r||{});var texto=r.text||r.texto||r.term_snapshot||r.policy_text||'';if(!texto)throw new Error('Política de privacidade não publicada.');carregando(false);abrirModal('<h2>Política de privacidade</h2>'+(paraAceite?'<div class="aviso" style="margin-top:8px"><b>'+esc(eu().nome||'')+'</b>, para continuar usando o app, leia e aceite a política de privacidade.</div>':'')+'<div style="white-space:pre-line;font-size:13px;line-height:1.6;color:#333;background:var(--cc);border-radius:12px;padding:12px;max-height:52vh;overflow-y:auto;margin-top:8px">'+esc(texto)+'</div><div style="height:14px"></div>'+(paraAceite?'<button class="btn pr" data-a="aceitarPolitica">Li e aceito</button><div class="gap"></div><button class="btn gh" data-a="recusarPolitica">Não aceito - sair do app</button>':'<button class="btn gh" data-a="fechar">Fechar</button>'));}).catch(function(e){carregando(false);consentAberto=false;toast(e.message,4500);});
}
function verificarConsentimento() {
  if (!cfg.token || !cfg.usuario || cfg.usuario.consent !== false || consentAberto) return;
  // não interrompe o que a pessoa está fazendo (aprovar usuário, cadastro...): espera a janela atual fechar
  if ($('modal').classList.contains('on') || $('carregando').classList.contains('on')) { setTimeout(verificarConsentimento, 4000); return; }
  consentAberto = true; verPolitica(true);
}
function aceitarPolitica() {
  carregando(true, 'Registrando...');
  (sbDisponivel()?v39AceitarPolitica().then(function(x){return {consentEm:agora(),politicaV:(igr.config&&igr.config.politicaV)||'v39'};}):chamar('aceitarPolitica', {})).then(function (r) {
    consentAberto = false; cfg.usuario.consent = true; cfg.usuario.consentEm = r.consentEm || agora(); cfg.usuario.politicaV = r.politicaV;
    salvarCfg(); fechar(); toast('Obrigado! Seu aceite foi registrado ✓');
  }).catch(function (e) { toast(e.message, 4500); }).then(function () { carregando(false); });
}
function sairTodos() {
  if (!confirm('Sair de TODOS os aparelhos onde você entrou (inclusive este)?')) return;
  carregando(true, 'Encerrando sessões...');
  (sbDisponivel()?v39SairTodosProprios():chamar('sairTodos', {})).catch(function () {}).then(function () {
    carregando(false); limparSessao(); mostrarTela('s-login'); erroEm('l-erro', 'Você saiu de todos os aparelhos. Entre novamente.');
  });
}
function encerrarSessoes(id) {
  var u = (usuariosCache || []).filter(function (x) { return x.id === id; })[0]; if (!u) return;
  if (!confirm('Desconectar ' + u.nome + ' de todos os aparelhos? A pessoa precisará entrar de novo.')) return;
  carregando(true, 'Encerrando...');
  (sbDisponivel()?v39EncerrarSessoesUsuario(id):chamar('encerrarSessoes', { id: id })).then(function () { toast('Sessões encerradas ✓'); fechar(); })
    .catch(function (e) { toast(e.message, 4500); }).then(function () { carregando(false); });
}
function anonimizar(id) {
  var p = pessoaPor(id); if (!p) return;
  if (!confirm('Anonimizar os dados de ' + p.nome + '?\n\nNome, telefone, endereço, nascimento e observações serão apagados de forma definitiva. ' +
    'Ficam só os números (presenças e totais). Use apenas quando a pessoa pedir a exclusão dos dados.')) return;
  if (prompt('Para confirmar, digite ANONIMIZAR') !== 'ANONIMIZAR') return toast('Anonimização cancelada.');
  carregando(true, 'Anonimizando...');
  (sbDisponivel()?v39SolicitarAnonimizacao(id,'Solicitação confirmada pelo usuário na v39').then(function(){return {solicitado:true};}):chamar('anonimizarPessoa', { id: id })).then(function (r) {
    if(r.pessoa){db.pessoas = db.pessoas.filter(function (x) { return x.id !== id; }).concat([r.pessoa]); salvarDB();}
    fechar(); render(); toast(r.solicitado?'Solicitação de anonimização registrada ✓':'Dados anonimizados ✓');
  }).catch(function (e) { toast(e.message, 4500); }).then(function () { carregando(false); });
}
function abrirAuditoria(filtro) {
  carregando(true, 'Carregando auditoria...');
  var opAud=sbDisponivel()?v39Auditoria(filtro||''):chamar('auditoria', { filtro: filtro || '' });
  opAud.then(function (r) {
    abrirModal('<h2>Registro de auditoria</h2><div class="sb" style="font-size:12px;color:#888">' + r.total + ' registro(s)' + (r.total > 500 ? ' · mostrando os 500 mais recentes' : '') + '</div>' +
      '<div style="display:flex;gap:8px;margin:10px 0"><input id="aud-q" value="' + esc(filtro || '') + '" placeholder="Filtrar: usuário, login, excluiu, senha..."><button class="btn sm" data-a="audBuscar">Filtrar</button></div>' +
      '<div style="max-height:55vh;overflow-y:auto">' + (r.itens.length ? r.itens.map(function (l) {
        var alerta = /falha|bloque|excluiu|anonimiz|encerrou|redefiniu|corrigiu/i.test(l.acao);
        return '<div class="row" style="padding:7px 0;align-items:flex-start"><div class="info"><div class="sb" style="margin:0;color:#333"><b>@' + esc(l.usuario) + '</b> · ' +
          '<span style="color:' + (alerta ? 'var(--vermelho)' : '#333') + ';font-weight:' + (alerta ? 700 : 500) + '">' + esc(l.acao) + '</span>' + (l.detalhe ? ' · ' + esc(l.detalhe) : '') + '</div></div>' +
          '<span style="font-size:10.5px;color:#aaa;white-space:nowrap">' + dataHoraLocal(l.data) + '</span></div>';
      }).join('') : '<div class="empty">Nada encontrado.</div>') + '</div><div class="gap"></div><button class="btn gh" data-a="fechar">Fechar</button>');
  }).catch(function (e) { toast(e.message, 4500); }).then(function () { carregando(false); });
}
/* autorização de uso dos dados da pessoa (LGPD) */
function textoConsent(p) {
  if (p.consentimento === 'Sim') return 'autorizado' + (p.responsavel ? ' pelo responsável ' + esc(p.responsavel) : '') + (p.consentEm ? ' em ' + brCompleto(String(p.consentEm).slice(0, 10)) : '');
  if (p.consentimento === 'Revogado') return 'autorização revogada';
  return '<span style="color:#a87700">autorização não registrada</span>';
}
function camposConsent(px, p, dis) {
  var c = p ? (p.consentimento || '') : '', menor = idadeDe(p || {}) !== null && idadeDe(p) < 18;
  return '<div class="sec" style="margin-left:0">Privacidade (LGPD)</div>' +
    '<label>A pessoa autorizou o uso dos dados pela igreja? *</label><select id="' + px + '-consent"' + dis + '>' +
    opts([['', '— selecionar —'], ['Sim', 'Sim — autorizou'], ['Não', 'Não autorizou']], c === 'Revogado' ? 'Não' : c) + '</select>' +
    '<div id="' + px + '-respwrap" class="' + (menor ? '' : 'hide') + '"><div class="aviso" style="margin:10px 0 0">Menor de 18 anos: a autorização precisa ser dada por um dos pais ou responsável legal.</div>' +
    '<label>Nome do responsável que autorizou *</label><input id="' + px + '-resp" value="' + esc(p ? p.responsavel : '') + '"' + dis + '></div>' +
    (p && !p.consentimento ? '<div style="font-size:11.5px;color:#a87700;margin-top:6px">Cadastro anterior sem autorização registrada — confirme com a pessoa.</div>' : '');
}
function pintarConsent(px) {
  var nasc = $(px + '-nasc'), w = $(px + '-respwrap'); if (!w) return;
  var i = nasc && nasc.value ? idadeDe({ nasc: nasc.value }) : null;
  w.classList.toggle('hide', !(i !== null && i < 18));
}
/** Novo cadastro exige autorização; menores exigem o nome do responsável. */
function validarConsent(px, obrigatorio) {
  var c = $(px + '-consent'); if (!c) return '';
  var nasc = $(px + '-nasc'), i = nasc && nasc.value ? idadeDe({ nasc: nasc.value }) : null;
  if (obrigatorio && !c.value) return 'Informe se a pessoa autorizou o uso dos dados (LGPD).';
  if (obrigatorio && c.value === 'Não') return 'Sem a autorização da pessoa não é possível fazer o cadastro (LGPD).';
  if (c.value === 'Sim' && i !== null && i < 18 && !($(px + '-resp').value || '').trim()) return 'Menor de 18 anos: informe o nome do responsável que autorizou.';
  return '';
}
function aplicarConsent(o, valor, resp) {
  if (!valor) return;
  if (valor !== o.consentimento) o.consentEm = agora();
  o.consentimento = valor;
  var i = idadeDe(o);
  o.responsavel = i !== null && i < 18 ? resp : '';
}

/* ═══════════════════ PWA: instalação, atualização, novo endereço ═══════════════════ */
var pwaPrompt = null, pwaNovoSW = null;
function pwaOrigemOk() {
  // v39 de teste: /v39/ em Cloudflare Pages e localhost sao origens validas
  // independentemente do backend legado ou do estado do cliente Supabase.
  var host = String(location.hostname || '').toLowerCase();
  var path = String(location.pathname || '');
  if (path.indexOf('/v39/') === 0 && (/\.pages\.dev$/.test(host) || host === 'localhost' || host === '127.0.0.1')) return true;
  var ok = APP.origens || [];
  var hospedado = ok.indexOf(location.origin) >= 0 || /\.pages\.dev$/.test(host) || host === 'localhost' || host === '127.0.0.1';
  if (sbDisponivel()) return hospedado;
  if (!MODO_PWA) return false;
  return hospedado;
}
function pwaPodeInstalar() { return !!pwaPrompt; }
function pwaInstalar() {
  if (!pwaPrompt) return toast('Use o menu do navegador → “Instalar app” ou “Adicionar à tela de início”.', 5000);
  pwaPrompt.prompt();
  pwaPrompt.userChoice.then(function () { pwaPrompt = null; render(); });
}
function pwaAtualizar() {
  if (pwaNovoSW) pwaNovoSW.postMessage({ tipo: 'ATUALIZAR' }); else location.reload();
}
function pwaAvisoNovaVersao(sw) {
  pwaNovoSW = sw;
  var el = $('pwa-update'); if (el) { el.classList.remove('hide'); return; }
  el = document.createElement('div'); el.id = 'pwa-update';
  el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom) + 76px);z-index:130;background:#111;color:#fff;border-radius:14px;padding:12px 14px;display:flex;gap:10px;align-items:center;box-shadow:0 6px 20px rgba(0,0,0,.3);border-left:5px solid var(--dourado)';
  el.innerHTML = '<div style="flex:1;font-size:13px;font-weight:600">Nova versão do 2Gather disponível.</div><button class="btn sm" data-a="pwaAtualizar">Atualizar</button>';
  document.body.appendChild(el);
}
function pwaIniciar() {
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); pwaPrompt = e; if (cfg.aba === 'conta' || cfg.aba === 'mais') render(); });
  if (!MODO_PWA || !('serviceWorker' in navigator) || v39Ambiente()) return;   // v39: o registro e feito por boot_v39.js (sw_v39.js)
  var recarregando = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () { if (!recarregando) { recarregando = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js').then(function (reg) {
    if (reg.waiting && navigator.serviceWorker.controller) pwaAvisoNovaVersao(reg.waiting);
    reg.addEventListener('updatefound', function () {
      var nw = reg.installing; if (!nw) return;
      nw.addEventListener('statechange', function () { if (nw.state === 'installed' && navigator.serviceWorker.controller) pwaAvisoNovaVersao(nw); });
    });
    setInterval(function () { reg.update().catch(function () {}); }, 30 * 60000);
  }).catch(function () {});
}
/** Página antiga (Apps Script): avisa o novo endereço do app, se o master já o definiu. */
function avisoNovoEndereco() {
  var u = MODO_SCRIPT && igr.config && igr.config.urlPwa;
  if (!u || $('aviso-pwa')) return;
  var el = document.createElement('div'); el.id = 'aviso-pwa';
  el.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:140;background:#0b3a7a;color:#fff;padding:10px 14px;font-size:13px;line-height:1.45;display:flex;gap:10px;align-items:center';
  el.innerHTML = '<div style="flex:1"><b>O app mudou de endereço.</b> Agora ele se chama 2Gather e pode ser instalado no celular.</div>' +
    '<a href="' + esc(u) + '" target="_top" style="background:#fff;color:#0b3a7a;border-radius:10px;padding:8px 12px;font-weight:800;text-decoration:none;white-space:nowrap">Abrir o novo app</a>';
  document.body.appendChild(el);
}

/* ───────── modal ───────── */
function abrirModal(html) {
  var jaAberto = $('modal').classList.contains('on');
  $('modal-sheet').innerHTML = '<div class="grab"></div><button type="button" class="btn gh sm" data-a="fechar" style="width:auto;margin:0 0 10px">← Voltar</button>' + html; $('modal').classList.add('on');
  if (!jaAberto && HIST_OK && cfg.token) { empilhar('modal'); modalHist = true; }
}
function fecharModalSo() { $('modal').classList.remove('on'); gcForm = cfg.aba === 'novo' ? gcForm : null; }
function fechar() {
  fecharModalSo();
  if (modalHist) { modalHist = false; ignorarPop++; try { history.back(); } catch (e) { ignorarPop--; } }
}

/* ───────── eventos ───────── */
var ACOES = {
  aba: function (v) { irAba(v); }, nav: function (v) { irRaiz(v); }, voltar: voltar, abrirGC: function (v) { abrirGC(v); }, editarGC: function (v) { editarGC(v); },
  excluirGC: function (v) { excluirGC(v); }, salvarGC: function () { salvarGC(false); }, salvarGCmodal: function () { salvarGC(true); },
  escolherFoto: function () { $('foto-input').click(); },
  removerFoto: function () { fotoNova = '__remover__'; var p = $('g-fotoprev'); if (p) { p.style.backgroundImage = ''; p.style.border = ''; p.style.color = ''; } },
  filtroGC: function (v) { filtroGC = v; render(); }, filtroP: function (v) { filtroP = v; render(); },
  aprovar: aprovar, recusar: recusar, corrigirUsuario: corrigirUsuario, excluirUsuario: excluirUsuario, salvarCorrecao: salvarCorrecao, editarUsuario: editarUsuario, salvarUsuario: salvarUsuario, redefinirSenha: redefinirSenha, pedidosReset: v39AbrirPedidosReset, suspenderGlobal: v39SuspenderGlobalUI, reativarGlobal: v39ReativarGlobalUI,
  recarregarUsuarios: function () { usuariosCache = null; render(); carregarUsuarios(true); },
  trocarSenha: trocarSenha, confirmarSenha: confirmarSenha, sair: function () { sair(true); },
  sincronizar: function () { sincronizar(true); }, servidor: servidor, salvarServidor: function () { salvarServidor(); },
  padraoServidor: function () { salvarServidor(URL_PADRAO); },
  novaPessoa: function () { abrirPessoa(null); }, abrirPessoa: function (v) { abrirPessoa(v); }, salvarPessoa: function () { salvarPessoa(); }, modulo: abrirModulo,
    instProfForm: instProfForm, instProfSalvar: instProfSalvar,
    instTab: function (v) { if (v !== cfg.aba) { cursoAberto = ''; irAba(v); } },
    partInstAdd: partInstAdd, partInstRem: partInstRem, partInstSalvar: partInstSalvar,
    estTab: function (v) { estUI.tab = v; render(); }, estFiltro: function (v) { estUI.filtro = v; render(); },
    estHist: function (v) { estUI.hist = v; render(); }, estHistTipo: function (v) { estUI.histTipo = v; render(); },
    estNovaEntrega: estNovaEntrega, estFlPessoa: estFlPessoa,
    estFlTrocar: function () { estFlLer(); estFl.pessoa = null; estFl.resumo = null; estFl.itens = []; estFl.res = []; estFlTela(); },
    estFlAdd: estFlAdd, estFlRem: function (v) { estFlLer(); estFl.itens.splice(Number(v), 1); estFlTela(); },
    estFlFoto: estFlFoto, estFlRecRem: function () { estFlLer(); estFl.receita = ''; estFlTela(); }, estFlConfirmar: estFlConfirmar,
    estComprovante: function () { estComprovante2(); }, estComprovanteDe: estComprovanteDe,
    estEntregaAbrir: estEntregaAbrir, estVerReceita: estVerReceita, estMovAbrir: estMovAbrir,
    estEstornarAbrir: estEstornarAbrir, estEstornarOk: estEstornarOk,
    estProdutoAbrir: estProdutoAbrir, estProdutoForm: function (v) { estProdutoForm(v || ''); }, estProdutoSalvar: function (v) { estProdutoSalvar(v || ''); },
    estEntradaForm: function (v) { estEntradaForm(v || ''); }, estEntradaSalvar: estEntradaSalvar,
    estBaixaForm: estBaixaForm, estBaixaSalvar: estBaixaSalvar, estExportar: estExportar,
    instProfAgenda: function (v) { var p = v.split('|'); instAgendaDe(p[0], p[1], p[2]); },
    instAgendaProf: function (v) { var pr = profissionaisDe(instD.agendas).filter(function (x) { return x.id === v; })[0]; instAgendaForm('', { profissionalId: v, nome: pr ? pr.nome + ' — ' : '' }); },
    instFiltroEsp: function (v) { instFiltroEsp = v || ''; render(); },
    instFlEsp: function (v) { instFl.esp = v; instFl.agenda = ''; instFluxo(); },
    instAbrirAgenda: function (v) { instSel.agenda = v; instSel.data = hoje(); if (cfg.aba === 'instagenda') render(); else irAba('instagenda'); },
    instNovoAg: function (v) { instNovoAg(); }, instAgendarSlot: function (v) { var p = v.split('|'); instNovoAg(p[0], p[1], p[2]); },
    instDia: function (v) { instSel.data = v; render(); },
    instFlAgenda: function (v) { instFl.agenda = v; var a0 = agendaPor(v); if (a0) instFl.esp = espChave(a0); instFluxo(); }, instFlDia: function (v) { instFl.data = v; instFluxo(); }, instFlHora: function (v) { instFl.hora = v; instFluxo(); },
    instFlPessoa: instFlPessoa, instFlConfirmar: instFlConfirmar, instCompartilhar: instCompartilhar,
    instFlVoltar: function (v) { var f = instFl; if (v === 'esp') { f.esp = ''; f.agenda = ''; f.data = ''; f.hora = ''; f.pessoa = null; } else if (v === 'agenda') { f.agenda = ''; var gx = gruposEsp(instD.agendas.filter(function (a) { return a.ativa && podeAgendarNa(a); })).filter(function (g) { return g.chave === f.esp; })[0]; if (gx && gx.agendas.length === 1) f.esp = ''; f.data = ''; f.hora = ''; f.pessoa = null; } else if (v === 'data') { f.data = ''; f.hora = ''; f.pessoa = null; } else if (v === 'hora') { f.hora = ''; f.pessoa = null; } else f.pessoa = null; instFluxo(); },
    instStatusAt: instStatusAt, instRemarcar: instRemarcarAbrir, instRemDia: function (v) { instFl.data = v; instRemFluxo(); }, instRemHora: instRemConfirmar,
    instAtender: instAtender, instRegSalvar: instRegSalvar,
    instNovoAtendido: function (v) { instNovoAtendido(v); },
    instCdIgreja: function (v) { instCd.igreja = v === '1'; instCdTela(); if (instCd.igreja) setTimeout(function () { try { $('cd-busca').focus(); } catch (e) {} }, 250); },
    instCdEscolher: function (v) { var x = (instCd.res || []).filter(function (r) { return r.id === v; })[0]; if (x) instCdConcluir({ id: x.id, nome: x.nome, codigo: x.codigo, autorizou: x.autorizou }); },
    instCdSalvar: instCdSalvar,
    instAgendaForm: function (v) { instAgendaForm(v); }, instAgendaSalvar: function () { instAgendaSalvar(); }, instAgendaExcluir: function () { if (confirm('Excluir esta agenda? Os atendimentos já realizados continuam guardados.')) instAgendaSalvar(true); },
    instBloqAdd: function () { var d = $('ag-bloqd').value; if (d && instAgForm.bloq.indexOf(d) < 0) { instAgForm.bloq.push(d); pintarBloq(); } $('ag-bloqd').value = ''; },
    instBloqRem: function (v) { instAgForm.bloq = instAgForm.bloq.filter(function (x) { return x !== v; }); pintarBloq(); },
    instEmBreve: function (v) { abrirModal('<h2>' + esc(v) + '</h2><div class="aviso" style="margin-top:8px"><b>Em construção.</b> Entrada e saída de produtos, saldo em estoque, limite de entrega por pessoa' + (/Farm/.test(v) ? ' e receita registrada com imagem para medicamentos' : '') + ' — usando a mesma base de pessoas do Instituto.</div><div class="gap"></div><button class="btn pr" data-a="fechar">Entendi</button>'); },
    fpCam: function () { $('fp-cam').click(); }, fpGal: function () { $('fp-gal').click(); }, fpRem: function () { fotoEscolhida('__remover__'); },
    fotoDireta: function (v) { trocarFotoDireta(v); },
    muralTipo: function (v) { var t = $('mural-txt') ? $('mural-txt').value : ''; muralTipo = v; render(); if ($('mural-txt')) $('mural-txt').value = t; },
    muralFiltro: function (v) { muralFiltro = v; render(); },
    muralPostar: function () { var t = ($('mural-txt').value || '').trim(); if (t.length < 3) return toast('Escreva a mensagem.'); muralAcao('muralPostar', { tipo: muralTipo, texto: t }, 'Publicado no mural ✓'); },
    muralApagar: function (v) { if (confirm('Apagar esta mensagem do mural?')) muralAcao('muralApagar', { id: v }, 'Mensagem apagada'); },
    muralOrar: function (v) { muralAcao('muralOrar', { id: v }); }, notifAtivar: notifAtivar,
    filtroCh: function (v) { filtroCh = v; render(); }, chTodosP: chTodosP,
    lvIrForm: function () { var t = $('lv-tabs'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); setTimeout(function () { if ($('v-nome')) $('v-nome').focus(); }, 350); },
    encSel: function (v) { chDraft = null; cfg.dataChamada = v; cfg.dataChamadaGC = gcA(); salvarCfg(); render(); },
    avisarEscala: function (v) { avisarEscalaModal(v); }, recEnviar: recEnviar, salvarSenhaNova: salvarSenhaNova,
    sairSenhaTemp: function () { senhaObrig = false; fechar(); sair(false); },
    evEscolherImg: function () { $('msg-input').click(); }, evRemImg: function () { msgImgNova = '__remover__'; pintarImgMsg(''); },
    evMensagem: evMensagem, msgApi: msgApi, msgCompartilhar: msgCompartilhar, msgIndividual: msgIndividual, msgFeito: msgFeito, excluirPessoa: excluirPessoa,
  salvarChamada: salvarChamada, remChamada: remChamada, addChamada: abrirAddChamada,
  incluirChamada: function (v) { incluirNaChamada(v, false); fechar(); render(); var p = db.pessoas.filter(function (x) { return x.id === v; })[0]; toast((p ? nomeChamado(p) : 'Pessoa') + ' incluído(a) na chamada'); },
  novoVisitanteChamada: function () { fechar(); abrirPessoa(null, { addChamada: true, tipo: 'Visitante', prim: ($('ch-data') && $('ch-data').value) || dataChamada() }); }, trocarGC: function (v) { cfg.gcAtual = v; cfg.aba = 'painel'; salvarCfg(); window.scrollTo(0, 0); render(); }, csv: exportarCSV, fechar: fechar,
    lvSalvarNovo: function () { lvSalvarForm(null); }, lvEditar: function (v) { lvAbrirForm(v); }, lvSalvarEd: function (v) { lvSalvarForm(v); },
    lvNovoModal: function () { lvAbrirForm(null); }, lvDirecionar: lvDirecionar,
    lerAlerta: lerAlerta, lvVincular: function (v) { lvVincular(v, ''); }, lvForcarNovo: function () { fechar(); lvSalvarForm(null, true); },
    lvVincularFila: function (v) { var p = pessoaPor(v); if (p && p.matchId) lvVincular(p.matchId, p.id); }, lvNaoEMesma: lvNaoEMesma, gcAssociar: gcAssociar, gcForcarNovo: function () { fechar(); var pd = gcPendente; gcPendente = null; if (pd) pd.seguir(); },
    gcAbrirExistente: function (v) { gcPendente = null; fechar(); abrirPessoa(v); },
    orgTog: function (v) { if (orgAbertos[v]) delete orgAbertos[v]; else orgAbertos[v] = 1; render(); }, lvDevolver: lvDevolver, lvReencaminhar: lvReencaminhar, lvLiberar: lvLiberar, lvRegistrar: lvRegistrar,
    lvSalvarVisita: lvSalvarVisita, lvEncerrar: lvEncerrar, lvConfirmarEncerrar: lvConfirmarEncerrar, lvTrocar: lvTrocar,
    lvConfirmarTroca: lvConfirmarTroca, lvHistorico: lvHistorico, lvAbrirGC: function (v) { navegar(function () { cfg.modo = 'gc'; cfg.gcAtual = v; cfg.aba = 'lar'; }); },
    lvFiltro: function (v) { lvFiltroSel = v; render(); },
    filtroCulto: function (v) { filtroCulto = v; render(); }, evNovo: evNovo, evEditar: evEditar, evSalvar: evSalvar, evLiberar: evLiberar,
    evExcluir: evExcluir, evValores: evValores, evSalvarValores: evSalvarValores, evRecados: evRecados, evSalvarRecados: evSalvarRecados,
    evFicha: evFicha, evChamadaCulto: v39AbrirChamadaCulto, evSalvarChamada: v39SalvarChamadaCultoUI, evSemana: evSemana, escolherLogo: function () { $('logo-input').click(); },
    removerLogo: function () { cfgDraft = lerCfgForm(); logoNovo = '__remover__'; render(); },
    escolherIcone: function () { $('icone-input').click(); },
    removerIcone: function () { cfgDraft = lerCfgForm(); iconeNovo = '__remover__'; render(); },
    escolherIconeGC: function () { $('iconegc-input').click(); },
    removerIconeGC: function () { iconeGCNovo = '__remover__'; pintarIconeGC(''); },
    cfAddCulto: function () { cfgDraft = lerCfgForm(); cfgDraft.cultos.push({ dia: '0', horario: '19:00', nome: '' }); render(); },
    cfRemBairro: function (v) { cfgDraft = lerCfgForm(); cfgDraft.bairros.splice(+v, 1); render(); },
    cfAddBairros: cfAddBairros,
    cfCor: function (v) { $('cf-cor').value = v; aplicarCor(v); var sp = document.querySelectorAll('.cores span'); for (var i = 0; i < sp.length; i++) sp[i].classList.toggle('on', sp[i].getAttribute('data-v') === v); }, cfImportBairros: cfImportBairros,
    cfCorrigirBairros: function () {
      var mud = JSON.stringify((lerCfgForm() || {}).bairros || []) !== JSON.stringify((igr.config && igr.config.bairros) || []);
      if (mud) return toast('Salve as configurações antes de corrigir os cadastros.');
      if (confirm('Ajustar a grafia do bairro nos cadastros para os nomes da lista?')) corrigirGrafiaBairros();
    },
    filtroM: function (v) { filtroM = v; render(); }, fichaPessoa: fichaPessoa,
    perfilEditar: function (v) { var p = pessoaPor(v); if (!p) return; abrirPessoa(v); }, csvConsulta: csvConsulta,
    cfRemCulto: function (v) { cfgDraft = lerCfgForm(); cfgDraft.cultos.splice(+v, 1); render(); }, cfSalvar: cfSalvar,
    encEditar: encEditar, encSalvar: encSalvar, encChamada: function (v) { cfg.dataChamada = v; cfg.dataChamadaGC = gcA(); if (cfg.aba === 'chamada') render(); else irAba('chamada'); },
    permPadrao: marcarPadraoPerms,
    sairTodos: sairTodos, encerrarSessoes: encerrarSessoes, auditoria: function () { abrirAuditoria(''); }, audBuscar: function () { abrirAuditoria($('aud-q').value); },
    anonimizar: anonimizar, verPolitica: function () { verPolitica(false); }, aceitarPolitica: aceitarPolitica, recusarPolitica: function () { consentAberto = false; sair(false); },
    cfModeloPolitica: function () { cfgDraft = lerCfgForm(); cfgDraft.politica = cfgDraft.politicaModelo || ''; render(); },
    perModo: function (v) { perBI.modo = v; if (v === 'per' && !perBI.de) { var P0 = periodoBI(); perBI.de = hoje().slice(0, 7) + '-01'; perBI.ate = hoje(); } render(); }, lvModo: function (v) { lvModoCad = v; lvGCManual = false; render(); }, encAgendar: encAgendar, encSalvarAgenda: encSalvarAgenda, encCancelar: encCancelar,
    togFiltrosM: function () { fMAberto = !fMAberto; render(); },
    limparFiltrosM: function () { for (var k in fM) fM[k] = k === 'ordem' ? 'nome' : ''; render(); },
    filtroTipoCulto: function (v) { filtroTipoCulto = v || ''; render(); },
    filtroCurso: function (v) { filtroCurso = v; render(); }, rnNovo: rnNovo, rnEditar: rnEditar, rnSalvar: rnSalvar, rnExcluir: rnExcluir,
    rnAbrir: function (v) { navegar(function () { cursoAberto = v; }); }, rnVoltar: function () { if (navStack.length) voltar(); else { cursoAberto = ''; render(); } },
    rnPart: rnPart, rnSalvarPart: rnSalvarPart, rnRemPart: rnRemPart, rnConvites: function (v) { rnConvites(v); },
    rnChamada: rnChamada, auTodos: auTodos, auSalvar: auSalvar,
    rnAddLideres: function () { candidatosPart().forEach(function (c) { if (c.origem === 'usuario' && /Líder/.test(c.sub)) partSel[c.chave] = c; }); pintarPart(); }
};
document.addEventListener('click', function (ev) {
  var t = ev.target.closest('[data-a]'); if (!t) return;
  var a = t.getAttribute('data-a');
  if (a === 'marcar') { marcar(t.getAttribute('data-v'), t.getAttribute('data-m'), t); return; }
  if (a === 'auMarcar') { auMarcar(t.getAttribute('data-v'), t); return; }
  if (a === 'rnEnviar') { rnEnviar(t.getAttribute('data-v')); return; }      // deixa o link do WhatsApp abrir
  if (a === 'waFeito') { t.textContent = 'Enviado ✓'; t.style.background = '#8ac9a3'; return; }
  if (a === 'pwaInstalar') { ev.preventDefault(); pwaInstalar(); return; }
  if (a === 'pwaAtualizar') { ev.preventDefault(); pwaAtualizar(); return; }
  if (ACOES[a]) { ev.preventDefault(); ACOES[a](t.getAttribute('data-v'), t); }
});
document.addEventListener('input', function (ev) {
  if (ev.target.id === 'busca-m' && false) {}
  if (ev.target.id === 'busca-p') { buscaP = ev.target.value; var pos = ev.target.selectionStart; render(); var el = $('busca-p'); el.focus(); el.setSelectionRange(pos, pos); }
  if (ev.target.id === 'cf-cnpj') ev.target.value = mascaraCnpj(ev.target.value);
  if (['f-cep', 'g-cep', 'v-cep', 'cf-cep'].indexOf(ev.target.id) >= 0) {
    var pxc = ev.target.id.replace('-cep', '');
    ev.target.value = mascaraCep(ev.target.value);
    if (soDigitos(ev.target.value).length === 8) aplicarCep(pxc);
    else { var inf = $(pxc + '-cepinfo'); if (inf) inf.textContent = ''; }
  }
  if (ev.target.id === 'busca-m') { buscaM = ev.target.value; var pm = ev.target.selectionStart; render(); var em = $('busca-m'); em.focus(); em.setSelectionRange(pm, pm); }
  if (ev.target.id === 'busca-part') { buscaPart = ev.target.value; pintarPart(); }
  if (ev.target.id === 'pf-nome' && $('pf-user') && !$('pf-user').dataset.manual) $('pf-user').value = sugerirLogin(ev.target.value);
  if (ev.target.id === 'pf-user') ev.target.dataset.manual = '1';
  if (ev.target.id === 'fl-busca' && instFl) instBuscar(ev.target.value, function (l) { instFl.res = l; if ($('fl-res')) $('fl-res').innerHTML = resultadosBusca(l); });
  if (ev.target.id === 'cd-busca' && instCd) instBuscar(ev.target.value, function (l) { instCd.res = l; if ($('cd-res')) $('cd-res').innerHTML = resultadosBuscaCd(l); });
  if (ev.target.id === 'est-busca') { estUI.busca = ev.target.value; var edd = estD[modEst()].d; if ($('est-lista') && edd) $('est-lista').innerHTML = estListaProdutos(modEst(), edd); }
  if (ev.target.id === 'est-fl-busca' && estFl) instBuscar(ev.target.value, function (l) { if (estFl) { estFl.res = l; if ($('est-fl-res')) $('est-fl-res').innerHTML = resultadosBuscaEst(l); } });
  if (ev.target.id === 'busca-partinst' && partInstCtx) instBuscar(ev.target.value, function (l) { if (partInstCtx) { partInstCtx.res = l; if ($('pi-res')) $('pi-res').innerHTML = partInstResultados(); } });
  if (ev.target.id === 'busca-add') { buscaAdd = ev.target.value.toLowerCase(); pintarAdd(); }
  if (ev.target.id === 'busca-gc') { buscaGC = ev.target.value.toLowerCase(); var pos2 = ev.target.selectionStart; render(); var el2 = $('busca-gc'); el2.focus(); el2.setSelectionRange(pos2, pos2); }
});
document.addEventListener('change', function (ev) {
  var id = ev.target.id;
  if (id === 'ch-outra' && ev.target.value) { chDraft = null; cfg.dataChamada = ev.target.value; cfg.dataChamadaGC = gcA(); salvarCfg(); render(); }
  if (id === 'ch-data') { chDraft = null; cfg.dataChamada = ev.target.value; cfg.dataChamadaGC = gcA(); salvarCfg(); render(); }
  if (id === 'g-lider') { var u = (db.equipe || []).filter(function (x) { return x.id === ev.target.value; })[0]; $('g-lidernome').value = u ? u.nome : ''; }
  if (id === 'f-freqig' || id === 'v-freqig') { var qi = $(id.charAt(0) + '-igrejawrap'); if (qi) qi.classList.toggle('hide', ev.target.value !== 'Sim'); }
  if (id === 'v-real') { var ew = $('lv-estavawrap'); if (ew) ew.classList.toggle('hide', ev.target.value !== 'Sim'); }
  if (id === 'f-tipo' && !editP && $('f-status')) $('f-status').value = ev.target.value === 'Visitante' ? 'Em visita' : 'Ativo';
  if (id === 'fp-cam' || id === 'fp-gal') { processarFotoPessoa(ev.target.files[0], fotoEscolhida); ev.target.value = ''; }
  if (id === 'foto-input') { processarFoto(ev.target.files[0]); ev.target.value = ''; }
  if (id === 'icone-input') { processarIcone(ev.target.files[0], 256, function (u) { cfgDraft = lerCfgForm(); iconeNovo = u; render(); }); ev.target.value = ''; }
  if (id === 'iconegc-input') { processarIcone(ev.target.files[0], 192, function (u) { iconeGCNovo = u; pintarIconeGC(u); }); ev.target.value = ''; }
  if (lvModoCad === 'membro' && ['v-sexo', 'v-nasc', 'v-bairro', 'v-cidade'].indexOf(id) >= 0) lvAtualizarGC();
  if (id === 'v-gc') lvGCManual = true;
  if (id === 'f-canal' || id === 'v-canal') { var cwr = $(id.charAt(0) + '-canalwrap'); if (cwr) cwr.classList.toggle('hide', ev.target.value !== 'Outros'); }
  if (id === 'g-tipo') { var pw = $('g-pubwrap'); if (pw) pw.classList.toggle('hide', ev.target.value !== 'Jovens e adolescentes'); }
  if (id === 'f-nasc' || id === 'v-nasc' || id === 'f-consent' || id === 'v-consent' || id === 'i-nasc' || id === 'i-consent') pintarConsent(id.charAt(0));
  if (id === 'ag-tipo' && instAgForm) { instAgForm.tipo = ev.target.value; $('ag-prof').innerHTML = opcoesProfissionais(ev.target.value, ''); }
  if (id === 'cu-usuario') { var cw = $('cu-senhawrap'), bo = document.querySelector('[data-a=salvarCorrecao]'); if (cw && bo) cw.classList.toggle('hide', ev.target.value.trim().toLowerCase() === bo.getAttribute('data-orig')); }
  if (id === 'per-mes') { perBI.mes = ev.target.value; render(); }
  if (id === 'per-de' || id === 'per-ate') { perBI[id === 'per-de' ? 'de' : 'ate'] = ev.target.value; if (perBI.de && perBI.ate) render(); }
  if (ev.target.classList && ev.target.classList.contains('rn-part')) partToggle(ev.target.value, ev.target.checked);
  if (id === 'rn-gcadd' && ev.target.value) {
    var gsel = ev.target.value, nAdd = 0;
    candidatosPart().forEach(function (c) { if (c.origem === 'pessoa' && c.gcId === gsel && !partSel[c.chave]) { partSel[c.chave] = c; nAdd++; } });
    ev.target.value = ''; pintarPart(); toast(nAdd + ' pessoa(s) do ' + gcNome(gsel) + ' adicionada(s)');
  }
  if (id === 'rn-rec') { var rw = $('rn-recwrap'); if (rw) rw.classList.toggle('hide', ev.target.value === 'unica'); }
  if (ev.target.classList && ev.target.classList.contains('fm')) {
    var kf = ev.target.getAttribute('data-k'); fM[kf] = ev.target.type === 'checkbox' ? (ev.target.checked ? '1' : '') : ev.target.value; render();
  }
  if (/-bairrosel$/.test(id)) bairroEscolhido(ev.target);
  if (id === 'logo-input') { processarLogo(ev.target.files[0]); ev.target.value = ''; }
  if (id === 'msg-input') { processarImgMsg(ev.target.files[0]); ev.target.value = ''; }
  if (id === 'ev-msgpub') { var gw = $('ev-msggcwrap'); if (gw) gw.classList.toggle('hide', ev.target.value !== 'gc'); }
  if (id === 'ev-msgprog') {
    var qw = $('ev-msgquandowrap'); if (qw) qw.classList.toggle('hide', ev.target.value !== 'sim');
    var qd = $('ev-msgquando');
    if (ev.target.value === 'sim' && qd && !qd.value) { var dEv = ($('ev-data') && $('ev-data').value) || hoje(); qd.value = (dEv > hoje() ? dEv : hoje()) + 'T' + (dEv > hoje() ? '09:00' : hhmm(Math.min(new Date().getHours() * 60 + new Date().getMinutes() + 30, 1439))); }
  }
  if (ev.target.classList && ev.target.classList.contains('eu-perm')) pintarTagsPerms();
  if (id === 'eu-papel') marcarPadraoPerms();
  if (id === 'cf-cor') { aplicarCor(ev.target.value); var spc = document.querySelectorAll('.cores span'); for (var ic = 0; ic < spc.length; ic++) spc[ic].classList.remove('on'); }
  if (id === 'ev-fixo' && ev.target.value !== '') {
    var cf = ((igr.config || {}).cultos || [])[+ev.target.value];
    if (cf) {
      var dd = parseData(hoje()); while (dd.getDay() !== +cf.dia) dd.setDate(dd.getDate() + 1);
      $('ev-data').value = isoData(dd); $('ev-titulo').value = cf.nome || 'Culto'; $('ev-ini').value = cf.horario || '';
      var mi = minStr(cf.horario); if (mi !== null) $('ev-fim').value = hhmm(mi + 120); $('ev-tipo').value = 'Culto';
    }
  }
});
$('modal').addEventListener('click', function (ev) { if (ev.target === this && !consentAberto && !senhaObrig) fechar(); });
if ($('b-esqueci')) $('b-esqueci').addEventListener('click', abrirRecuperar);
$('b-entrar').addEventListener('click', entrar);
$('l-senha').addEventListener('keydown', function (e) { if (e.key === 'Enter') entrar(); });
$('b-ir-cadastro').addEventListener('click', abrirCadastro);
$('b-ir-login').addEventListener('click', function () { mostrarTela('s-login'); });
$('b-cad-voltar').addEventListener('click', function () { mostrarTela('s-login'); });
$('b-cadastrar').addEventListener('click', cadastrar);
$('b-politica').addEventListener('click', function () { verPolitica(false); });
$('b-politica2').addEventListener('click', function () { verPolitica(false); });
$('c-vpol').addEventListener('click', function (e) { e.preventDefault(); verPolitica(false); });
$('b-voltar-ger').addEventListener('click', voltarRede);
$('b-voltar').addEventListener('click', voltar);
window.addEventListener('online', function () { if (cfg.token && !v39Ambiente()) sincronizar(false); });
setInterval(function () { if (cfg.token && !v39Ambiente() && (document.visibilityState === 'visible' || notifStatus() === 'granted')) sincronizar(false); }, 120000);
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && cfg.token && !v39Ambiente()) sincronizar(false); });
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.tipo === 'ABRIR' && cfg.token) irRaiz(cfg.modo === 'gc' ? 'alertas' : 'avisos'); });

/* ───────── início ───────── */
pwaIniciar();
if (EXIGE_HOSPEDADO && !MODO_SCRIPT && !pwaOrigemOk()) {
  // aberto como arquivo ou por outro endereço: não acessa dados
  limparSessao(); mostrarTela('s-login');
  var box = document.querySelector('#s-login .box');
  if (box) box.innerHTML = '<h2>Abra pelo endereço oficial</h2><p class="sub" style="line-height:1.55">Por segurança, este app só funciona pelo link oficial da igreja. ' +
    'Peça o link à liderança ou toque abaixo.</p><div style="height:12px"></div><a class="btn pr" style="text-align:center;text-decoration:none" href="' + esc(APP.appUrl || URL_PADRAO) + '" target="_top">Abrir o app oficial</a>';
  ['b-ir-cadastro', 'b-politica'].forEach(function (x) { if ($(x)) $(x).classList.add('hide'); });
  return;
}
aplicarLogo();
if(v39Ambiente()){
  if(!window.V39_CONFIG_STATUS||!window.V39_CONFIG_STATUS.ok){limparSessao();mostrarTela('s-login');erroEm('l-erro',sbErroConfig());}
  else if(!sbDisponivel()){limparSessao();mostrarTela('s-login');erroEm('l-erro',sbErroConfig());}
  else{
    v39ObservarAuth();
    sbRestaurarSessao().then(function(ok){if(!ok){mostrarTela('s-login');return;}return v39AbrirApp();}).catch(v39TratarFalhaBoot);
  }
}else{
  chamarBruto({acao:'ping'}).then(function(r){if(r&&r.ok){servidorV=+r.versao||0;if(cfg.token&&servidorV<SERVIDOR_ESPERADO)render();}}).catch(function(){});
  chamarBruto({acao:'configPublica'}).then(function(r){if(r&&r.ok)return atualizarConfig(r.config);}).then(function(m){avisoNovoEndereco();if(m&&cfg.token)render();}).catch(function(){});
  if(cfg.token&&cfg.usuario){iniciarApp();sincronizar(false);setTimeout(verificarSenhaTemp,400);}else mostrarTela('s-login');
}

window.__gc = { db: function () { return db; }, cfg: function () { return cfg; }, sincronizar: sincronizar, metricas: metricas, pendentes: pendentesLocais };


/* ═══════════════════ v37: TREINAMENTOS/REUNIÕES × CURSOS DO INSTITUTO ═══════════════════
   Treinamentos/Reuniões = membros e lideranças (antigo módulo "Cursos").
   Cursos do Instituto   = inglês, informática etc.: membros da igreja e pessoas da comunidade
                           (base única de pessoas, com código e autorização LGPD). */
function modCursos() { return cfg.aba === 'instcursos' ? 'inst' : ''; }
function modDe(r) { return r && r.id ? (r.modulo || '') : modCursos(); }
function temInstCursos() { return pode('institutoCursos') || REUS('inst').length > 0; }
function temInstSaude() { return pode('instituto') || pode('agendaPastoral') || pode('prontuario'); }
function tiposReuniao(cur, mod) {
  if ((mod === undefined ? modCursos() : mod) === 'inst') return ['Curso'];
  var l = ['Reunião', 'Treinamento'];
  if (cur && l.indexOf(cur) < 0) l.push(cur);      // cadastros antigos do tipo "Curso" continuam visíveis
  return l;
}
function instTabs_v37(cur) {
  if (!(temInstCursos() && temInstSaude())) return '';     // abas só quando a pessoa tem os dois lados
  return '<div class="tabs">' + [['instituto', 'Atendimentos'], ['instcursos', 'Cursos']].map(function (x) {
    return '<button data-a="instTab" data-v="' + x[0] + '" class="' + (cur === x[0] ? 'on' : '') + '">' + x[1] + '</button>';
  }).join('') + '</div>';
}
function rInstCursos() {
  if (!temInstCursos()) return '<div class="empty">Sem acesso.</div>';
  var r0 = cursoAberto ? reuniaoPor(cursoAberto) : null;
  return (r0 && r0.modulo === 'inst' ? '' : instTabs('instcursos')) + rCursos();
}
/** Lista de treinamentos/reuniões (aba Treinamentos) ou de cursos (aba Cursos do Instituto): mesma lógica. */
function rCursos() {
  var mod = modCursos(), inst = mod === 'inst', r0 = cursoAberto ? reuniaoPor(cursoAberto) : null;
  if (r0 && (r0.modulo || '') === mod) return rCursoDetalhe(r0);
  cursoAberto = '';
  var gere = pode(inst ? 'institutoCursos' : 'cursos'), hj = hoje(), h = '';
  var hojeL = aulasHojeMinhas(mod);
  if (hojeL.length) h += '<div class="card" style="border-left:5px solid var(--dourado)"><h3>Chamadas de hoje</h3>' + hojeL.map(function (a) {
    var r = reuniaoPor(a.reuniaoId), n = Object.keys(a.presencas || {}).length;
    return '<div class="row cl" data-a="rnChamada" data-v="' + esc(a.id) + '"><div class="info"><div class="nm">' + esc(r.titulo) + (a.inicio ? ' · ' + esc(a.inicio) : '') + '</div>' +
      '<div class="sb">' + esc(r.local || '') + ' · ' + (r.participantes || []).length + ' participante(s)</div></div>' +
      '<span class="pill ' + (n ? 'p-verde' : 'p-amarelo') + '">' + (n ? 'chamada feita' : 'fazer chamada') + '</span></div>';
  }).join('') + '</div>';
  if (gere) h += '<button class="btn" data-a="rnNovo">' + (inst ? '+ Novo curso' : '+ Nova reunião ou treinamento') + '</button><div class="gap"></div>';
  var l = REUS(mod).filter(function (r) {
    var ult = aulasDe(r.id).slice(-1)[0], fim = ult ? ult.data : r.data;
    return filtroCurso === 'ativos' ? fim >= hj : fim < hj;
  }).sort(function (a, b) { var pa = proximaAula(a.id), pb = proximaAula(b.id); return String(pa ? pa.data : a.data).localeCompare(String(pb ? pb.data : b.data)); });
  h += '<div class="tabs">' + [['ativos', 'Em andamento'], ['encerrados', 'Encerrados']].map(function (x) {
    return '<button data-a="filtroCurso" data-v="' + x[0] + '" class="' + (filtroCurso === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>';
  if (!l.length) return h + '<div class="card"><div class="empty">' + (filtroCurso === 'ativos' ? (gere ? 'Nenhum ' + (inst ? 'curso' : 'treinamento ou reunião') + ' em andamento.' : 'Você não é responsável por nenhuma chamada em andamento.') : 'Nenhum encerrado.') + '</div></div>';
  l.forEach(function (r) {
    var as = aulasDe(r.id), feitas = as.filter(function (a) { return Object.keys(a.presencas || {}).length; }), prox = proximaAula(r.id);
    var tp = 0, tm = 0; feitas.forEach(function (a) { for (var k in a.presencas) { tm++; if (a.presencas[k] === 'P') tp++; } });
    var pend = gere ? (r.participantes || []).filter(function (p) { return !p.enviadoEm; }).length : 0;
    h += '<div class="card cl" data-a="rnAbrir" data-v="' + esc(r.id) + '" style="cursor:pointer">' +
      '<div style="display:flex;justify-content:space-between;gap:8px"><div style="min-width:0"><div style="font-size:11px;color:#888;font-weight:800;letter-spacing:.6px">' + esc((r.tipo || 'Reunião').toUpperCase()) + '</div>' +
      '<div style="font-size:16px;font-weight:800;margin-top:2px">' + esc(r.titulo) + '</div></div>' +
      (prox ? '<span class="pill p-dour">' + (prox.data === hj ? 'hoje' : 'próx. ' + br(prox.data)) + '</span>' : '<span class="pill p-cinza">encerrado</span>') + '</div>' +
      '<div style="font-size:12.5px;color:#555;margin-top:6px;line-height:1.55">' + (r.tema ? '<b>Tema:</b> ' + esc(r.tema) + '<br>' : '') +
      '<b>Local:</b> ' + esc(r.local || '—') + '<br>' + quandoTexto(r) + '</div>' +
      '<div class="mini"><div><b>' + (r.participantes || []).length + '</b><span>participantes</span></div><div><b>' + feitas.length + '/' + as.length + '</b><span>chamadas</span></div>' +
      '<div><b>' + (tm ? pct(tp / tm) : '—') + '</b><span>presença</span></div><div><b style="color:' + (pend ? 'var(--vermelho)' : '') + '">' + (gere ? pend : '—') + '</b><span>convites a enviar</span></div></div></div>';
  });
  return h;
}
/* ── participantes dos cursos do Instituto: busca na base única (membros e comunidade) ── */
var partInstCtx = null;
function rnPartInst(id) {
  var r = reuniaoPor(id); if (!r) return;
  partSel = {}; (r.participantes || []).forEach(function (p) { partSel[p.chave] = p; });
  partInstCtx = { id: id, res: [] };
  partInstTela();
}
function partInstTela() {
  var r = partInstCtx && reuniaoPor(partInstCtx.id); if (!r) return;
  abrirModal('<h2>Participantes do curso</h2><div class="sb" style="font-size:12.5px;color:#888">' + esc(r.titulo) + '</div>' +
    '<div class="aviso" style="margin:10px 0 6px;font-size:12px;line-height:1.45">Podem participar <b>membros da igreja</b> e <b>pessoas da comunidade</b>. Todos ficam na base única de pessoas (com código) e precisam ter autorização de uso dos dados (LGPD).</div>' +
    '<div class="busca"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input id="busca-partinst" placeholder="Nome ou telefone (mín. 3 letras)" autocomplete="off"></div>' +
    '<div id="pi-res">' + partInstResultados() + '</div>' +
    '<button class="btn gh sm" data-a="instNovoAtendido" data-v="curso" style="margin-top:6px">+ Cadastrar nova pessoa</button>' +
    '<div class="sec" style="margin-left:0">Selecionados (<span id="pi-cont">' + Object.keys(partSel).length + '</span>)</div>' +
    '<div id="pi-sel" class="card lp" style="box-shadow:none;border:1px solid #eee;max-height:30vh;overflow-y:auto">' + partInstSelecionados() + '</div>' +
    '<div style="height:12px"></div><button class="btn pr" data-a="partInstSalvar">Salvar participantes</button><div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
}
function partInstResultados() {
  var res = (partInstCtx && partInstCtx.res) || [];
  if (!res.length) return '<div style="font-size:12px;color:var(--tx3);padding:8px 2px">Digite ao menos 3 letras do nome ou 4 dígitos do telefone. Quem ainda não tem cadastro: toque em “Cadastrar nova pessoa”.</div>';
  return '<div class="card lp" style="box-shadow:none;background:var(--bg)">' + res.map(function (x) {
    var ja = !!partSel['p:' + x.id];
    return '<div class="row' + (ja ? '' : ' cl') + '"' + (ja ? '' : ' data-a="partInstAdd" data-v="' + esc(x.id) + '"') + '><div class="av" style="' + corAvatar(x.nome) + '">' + ini(x.nome) + '</div>' +
      '<div class="info"><div class="nm">' + esc(x.nome) + '</div><div class="sb">' + esc(x.codigo) + (x.bairro ? ' · ' + esc(x.bairro) : '') + (x.fone4 ? ' · tel. final ' + esc(x.fone4) : '') + '</div></div>' +
      (ja ? '<span class="pill p-verde">adicionado ✓</span>' : '<span class="pill ' + (x.igreja ? 'p-dour' : 'p-cinza') + '">' + (x.igreja ? 'da igreja' : 'comunidade') + '</span>') + '</div>';
  }).join('') + '</div>';
}
function partInstSelecionados() {
  var l = Object.keys(partSel).map(function (k) { return partSel[k]; }).sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
  if (!l.length) return '<div class="empty" style="padding:12px">Ninguém selecionado ainda.</div>';
  return l.map(function (p) {
    return '<div class="row"><div class="av" style="' + corAvatar(p.nome) + '">' + ini(p.nome) + '</div><div class="info"><div class="nm">' + esc(p.nome) + '</div>' +
      '<div class="sb">' + (p.convidadoEm ? 'já no curso' : '<b style="color:var(--verde)">novo</b>') + (p.origem === 'instituto' ? ' · comunidade' : '') + '</div></div>' +
      '<button class="btn dg sm" data-a="partInstRem" data-v="' + esc(p.chave) + '" style="padding:6px 9px">×</button></div>';
  }).join('');
}
function partInstAtualizar() {
  if ($('pi-res')) $('pi-res').innerHTML = partInstResultados();
  if ($('pi-sel')) $('pi-sel').innerHTML = partInstSelecionados();
  if ($('pi-cont')) $('pi-cont').textContent = Object.keys(partSel).length;
}
function partInstAdd(id) {
  var x = ((partInstCtx && partInstCtx.res) || []).filter(function (r) { return r.id === id; })[0]; if (!x) return;
  var novo = { chave: 'p:' + x.id, nome: x.nome, apelido: '', fone: '', origem: x.igreja ? 'pessoa' : 'instituto', codigo: x.codigo };
  if (x.autorizou === false) {
    if (!confirm(x.nome + ' ainda não tem a autorização de uso dos dados (LGPD) registrada.\n\nConfirme que a pessoa autorizou o uso dos dados para este curso. Incluir?')) return;
    novo.autorizadoAgora = true;
  }
  partSel[novo.chave] = novo; partInstAtualizar();
}
function partInstNovo(p) {
  if (!partInstCtx) return fechar();
  var novo = { chave: 'p:' + p.id, nome: p.nome, apelido: '', fone: '', origem: 'pessoa', codigo: p.codigo };
  if (p.autorizou === false) {
    if (!confirm(p.nome + ' ainda não tem a autorização de uso dos dados (LGPD) registrada.\n\nConfirme que a pessoa autorizou o uso dos dados para este curso. Incluir?')) { partInstTela(); return; }
    novo.autorizadoAgora = true;
  }
  partSel[novo.chave] = novo; partInstTela();
}
function partInstRem(chave) { delete partSel[chave]; partInstAtualizar(); }
function partInstSalvar() {
  if (!partInstCtx) return;
  var id = partInstCtx.id, r = reuniaoPor(id), antes = {}, lista = [], aut = [];
  (r ? r.participantes || [] : []).forEach(function (p) { antes[p.chave] = 1; });
  Object.keys(partSel).forEach(function (k) { var p = partSel[k]; lista.push({ chave: p.chave }); if (p.autorizadoAgora) aut.push(p.chave.slice(2)); });
  var novos = lista.filter(function (p) { return !antes[p.chave]; }).map(function (p) { return p.chave; });
  salvarReuniaoSrv({ id: id, participantes: lista, autorizados: aut }, null).then(function (rr) {
    partInstCtx = null; fechar(); render();
    if (novos.length) rnConvites(rr.id, novos); else toast('Participantes salvos ✓');
  }).catch(function () {});
}

/* ═══════════════════ v38: INSTITUTO — MERCADO SOLIDÁRIO E FARMÁCIA SOLIDÁRIA ═══════════════════
   Entrada e saída de produtos, saldo por lote (validade mais próxima sai primeiro), limite de entrega por pessoa e período,
   receita registrada com foto (Farmácia) e histórico — tudo ligado à base única de pessoas do Instituto.
   Os dados ficam só na memória (nunca no armazenamento do aparelho). */
var IC_MERC = '<path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6L5 3H2"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/>';
var IC_FARM = '<rect x="3" y="9" width="18" height="12" rx="2"/><path d="M8 9V6a4 4 0 0 1 8 0v3M12 12v6M9 15h6"/>';
var EST_NOME = { mercado: 'Mercado solidário', farmacia: 'Farmácia solidária' };
function estNovo() { return { t: 0, carregando: false, erro: '', d: null }; }
var estD = { mercado: estNovo(), farmacia: estNovo() };
var estUI = { tab: 'entregar', busca: '', filtro: 'todos', hist: '7', histTipo: 'todos' };
var estFl = null, estForm = null;
function estLimpar() { estD = { mercado: estNovo(), farmacia: estNovo() }; estUI = { tab: 'entregar', busca: '', filtro: 'todos', hist: '7', histTipo: 'todos' }; estFl = null; estForm = null; }
function temEstMercado() { return pode('instMercado') || pode('institutoAdmin'); }
function temEstFarmacia() { return pode('instFarmacia') || pode('institutoAdmin'); }
function modEst() { return cfg.aba === 'instfarmacia' ? 'farmacia' : 'mercado'; }
function estQ(x) { return String(Math.round(Number(x || 0) * 1000) / 1000).replace('.', ','); }
function estNum(v) { var n = Number(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : 0; }
function estProd(tipo, id) { var d = estD[tipo].d; return d ? (d.produtos.filter(function (p) { return p.id === id; })[0] || null) : null; }
function estNomeProd(tipo, id) { var p = estProd(tipo, id); return p ? p.nome + (p.apresentacao ? ' ' + p.apresentacao : '') : 'Produto'; }
function estUn(tipo, id) { var p = estProd(tipo, id); return p ? p.unidade : 'un'; }

function carregarEst(tipo, forcar) {
  var s = estD[tipo];
  if (s.carregando || (!forcar && s.t && Date.now() - s.t < 30000)) return Promise.resolve();
  s.carregando = true;
  return (sbDisponivel()?v39EstDados(tipo):chamar('estDados', { tipo: tipo })).then(function (r) { s.d = r; s.t = Date.now(); s.erro = ''; })
    .catch(function (e) { s.erro = e.message; s.t = Date.now(); toast(e.message, 5000); })
    .then(function () { s.carregando = false; if (cfg.aba === 'inst' + tipo) render(); });
}

/* ── abas do Instituto (Atendimentos · Cursos · Mercado · Farmácia) ── */
function instTabsLista() {
  var l = [];
  if (temInstSaude()) l.push(['instituto', 'Atendimentos']);
  if (temInstCursos()) l.push(['instcursos', 'Cursos']);
  if (temEstMercado()) l.push(['instmercado', 'Mercado']);
  if (temEstFarmacia()) l.push(['instfarmacia', 'Farmácia']);
  return l;
}
function instTabs(cur) {
  var l = instTabsLista(); if (l.length < 2) return '';
  return '<div class="tabs" style="overflow-x:auto">' + l.map(function (x) {
    return '<button data-a="instTab" data-v="' + x[0] + '" class="' + (cur === x[0] ? 'on' : '') + '" style="white-space:nowrap;flex:1 0 auto">' + x[1] + '</button>';
  }).join('') + '</div>';
}

/* ── status do produto ── */
function estStatus(p) {
  if (!p.ativa) return ['p-cinza', 'inativo'];
  if (p.vencido > 0) return ['p-vermelho', 'vencido'];
  if (p.disponivel <= 0) return ['p-vermelho', 'zerado'];
  if (p.minimo > 0 && p.disponivel < p.minimo) return ['p-amarelo', 'baixo'];
  if (p.vence30 > 0) return ['p-amarelo', 'vence em breve'];
  return ['p-verde', 'ok'];
}
function estPill(p) { var s = estStatus(p); return '<span class="pill ' + s[0] + '">' + s[1] + '</span>'; }

/* ── entregas (agrupa as linhas de saída pelo protocolo) ── */
function estEntregas(d) {
  var g = {}, ordem = [];
  d.movimentos.forEach(function (m) {
    if (m.mov !== 'saida') return;
    var e = g[m.entregaId];
    if (!e) { e = g[m.entregaId] = { id: m.entregaId, data: m.data, hora: m.hora, pessoaId: m.pessoaId || '', pessoaNome: m.pessoaNome || '', pessoaCodigo: m.pessoaCodigo || '', itens: {}, estornado: m.estornado, estornoMotivo: m.estornoMotivo, usuarioId: m.usuarioId, usuarioNome: m.usuarioNome, temReceita: !!m.temReceita, prescritor: m.prescritor || '', obs: m.obs || '' }; ordem.push(m.entregaId); }
    e.itens[m.produtoId] = Math.round(((e.itens[m.produtoId] || 0) + m.qtd) * 1000) / 1000;
  });
  return ordem.map(function (id) { return g[id]; });
}
function estItensTexto(tipo, e) { return Object.keys(e.itens).map(function (k) { return estQ(e.itens[k]) + ' ' + estUn(tipo, k) + ' · ' + estNomeProd(tipo, k); }).join(' | '); }
function estPodeEstornar(d, m) { return d.perm.operador && !m.estornado && (d.perm.admin || (m.usuarioId === eu().id && m.data === d.hoje)); }

/* ═════ tela do módulo ═════ */
function rEstoque() {
  var tipo = modEst();
  if (!(tipo === 'mercado' ? temEstMercado() : temEstFarmacia())) return '<div class="empty">Sem acesso.</div>';
  carregarEst(tipo);
  var s = estD[tipo], d = s.d;
  var h = '<div class="ini-ola" style="font-size:24px">' + EST_NOME[tipo] + '</div><div class="ini-sub">' +
    (tipo === 'mercado' ? 'Entrada e saída de produtos, saldo em estoque e limite de entrega por pessoa.' : 'Medicamentos e materiais de saúde: receita registrada, validade e limite por pessoa.') + '</div>' + instTabs('inst' + tipo);
  if (!d) return h + '<div class="card"><div class="empty">' + (s.erro ? esc(s.erro) : 'Carregando estoque…') + '</div></div>';
  var op = d.perm.operador, r = d.resumo, tab = op ? estUI.tab : (estUI.tab === 'entregar' ? 'estoque' : estUI.tab);
  h += '<div class="kpis" style="margin-bottom:6px">' + kpi(r.entregasHoje, 'Entregas hoje', 'dk') + kpi(r.pessoasMes, 'Pessoas no mês') +
    kpi(r.abaixoMinimo + r.zerados, 'Baixo ou zerado', r.abaixoMinimo + r.zerados ? 'al' : '') + kpi(r.vencidos + r.vencendo, 'Vencido ou vencendo', r.vencidos + r.vencendo ? 'al' : '') + '</div>';
  if (!op) h += '<div class="aviso" style="margin:8px 0;font-size:12.5px;line-height:1.5"><b>Somente consulta.</b> ' + (tipo === 'farmacia' ? 'Você vê saldos e movimentações, sem nomes de pessoas nem receitas (dados de saúde).' : 'Para lançar entradas e entregas, peça o acesso “Mercado solidário”.') + '</div>';
  var abas = (op ? [['entregar', 'Entregar']] : []).concat([['estoque', 'Estoque'], ['historico', 'Histórico']]);
  h += '<div class="tabs">' + abas.map(function (x) { return '<button data-a="estTab" data-v="' + x[0] + '" class="' + (tab === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>';
  h += tab === 'entregar' ? estTabEntregar(tipo, d) : tab === 'historico' ? estTabHistorico(tipo, d) : estTabEstoque(tipo, d);
  if (tipo === 'farmacia') h += '<div class="card" style="font-size:11.5px;color:var(--tx2);line-height:1.55;background:#FFF8E6"><b>Privacidade:</b> receitas e nomes dos atendidos aparecem <b>somente para quem opera a farmácia</b>. A foto da receita fica numa pasta privada do Drive e cada consulta é registrada na auditoria.</div>';
  return h;
}

/* ── aba Entregar ── */
function estTabEntregar(tipo, d) {
  var h = '<button class="btn pr" data-a="estNovaEntrega">+ Nova entrega</button><div class="gap"></div>';
  var hj = estEntregas(d).filter(function (e) { return e.data === d.hoje; });
  h += '<div class="sec" style="margin-left:0">Entregas de hoje</div>';
  if (!hj.length) return h + '<div class="card"><div class="empty">Nenhuma entrega hoje.</div></div>';
  return h + '<div class="card lp">' + hj.map(function (e) {
    return '<div class="row cl" data-a="estEntregaAbrir" data-v="' + esc(e.id) + '"><div class="av" style="' + corAvatar(e.pessoaNome || '?') + '">' + ini(e.pessoaNome || '?') + '</div>' +
      '<div class="info"><div class="nm">' + esc(e.pessoaNome || '—') + '</div><div class="sb">' + esc(e.hora) + ' · ' + esc(estItensTexto(tipo, e)) + '</div></div>' +
      (e.estornado ? '<span class="pill p-cinza">estornada</span>' : '<span class="pill p-verde">' + esc(e.id) + '</span>') + '</div>';
  }).join('') + '</div>';
}

/* ── aba Estoque ── */
function estFiltrar(tipo, d) {
  var q = normalizar(estUI.busca || '');
  return d.produtos.filter(function (p) {
    if (q && normalizar(p.nome + ' ' + p.apresentacao + ' ' + p.categoria + ' ' + p.codigo).indexOf(q) < 0) return false;
    if (estUI.filtro === 'baixo') return p.ativa && p.minimo > 0 && p.disponivel < p.minimo && p.disponivel > 0;
    if (estUI.filtro === 'zerado') return p.ativa && p.disponivel <= 0;
    if (estUI.filtro === 'vencendo') return p.vencido > 0 || p.vence30 > 0;
    if (estUI.filtro === 'inativo') return !p.ativa;
    return p.ativa;
  });
}
function estListaProdutos(tipo, d) {
  var l = estFiltrar(tipo, d);
  if (!l.length) return '<div class="empty" style="padding:14px">' + (d.produtos.length ? 'Nenhum produto neste filtro.' : 'Nenhum produto cadastrado ainda.') + '</div>';
  return l.map(function (p) {
    return '<div class="row cl" data-a="estProdutoAbrir" data-v="' + esc(p.id) + '"><div class="info"><div class="nm">' + esc(p.nome) + (p.apresentacao ? ' <span style="font-weight:500;color:var(--tx2)">' + esc(p.apresentacao) + '</span>' : '') + '</div>' +
      '<div class="sb">' + esc([p.categoria, p.minimo > 0 ? 'mín. ' + estQ(p.minimo) : '', p.exigeReceita ? 'exige receita' : ''].filter(Boolean).join(' · ') || p.codigo) + '</div></div>' +
      '<div style="text-align:right;margin-right:8px"><b style="font-size:17px">' + estQ(p.disponivel) + '</b><div class="sb">' + esc(p.unidade) + '</div></div>' + estPill(p) + '</div>';
  }).join('');
}
function estTabEstoque(tipo, d) {
  var h = '';
  if (d.perm.operador) h += '<div class="g2"><button class="btn pr sm" data-a="estEntradaForm">+ Entrada</button><button class="btn gh sm" data-a="estProdutoForm">+ Novo produto</button></div><div class="gap"></div>';
  h += '<div class="busca"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input id="est-busca" placeholder="Buscar produto" value="' + esc(estUI.busca) + '" autocomplete="off"></div>';
  h += '<div class="tabs" style="overflow-x:auto">' + [['todos', 'Ativos'], ['baixo', 'Baixo'], ['zerado', 'Zerados'], ['vencendo', 'Validade'], ['inativo', 'Inativos']].map(function (x) {
    return '<button data-a="estFiltro" data-v="' + x[0] + '" class="' + (estUI.filtro === x[0] ? 'on' : '') + '" style="white-space:nowrap;flex:1 0 auto">' + x[1] + '</button>'; }).join('') + '</div>';
  h += '<div class="card lp" id="est-lista">' + estListaProdutos(tipo, d) + '</div>';
  h += '<button class="btn gh sm" data-a="estExportar" data-v="estoque">Exportar estoque (CSV)</button><div class="gap"></div>';
  return h;
}

/* ── aba Histórico ── */
function estMovsPeriodo(d) {
  var dias = estUI.hist === 'hoje' ? 0 : Number(estUI.hist) || 7, de = addDiasISO(d.hoje, -dias);
  return d.movimentos.filter(function (m) {
    if (m.data < de) return false;
    var t = estUI.histTipo; return t === 'todos' || (t === 'entradas' && m.mov === 'entrada') || (t === 'entregas' && m.mov === 'saida') || (t === 'baixas' && m.mov === 'baixa');
  });
}
function addDiasISO(iso, n) { var d = parseData(iso); d.setDate(d.getDate() + n); return isoData(d); }
function estTabHistorico(tipo, d) {
  var h = '<div class="tabs" style="overflow-x:auto">' + [['hoje', 'Hoje'], ['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias']].map(function (x) {
    return '<button data-a="estHist" data-v="' + x[0] + '" class="' + (estUI.hist === x[0] ? 'on' : '') + '" style="white-space:nowrap;flex:1 0 auto">' + x[1] + '</button>'; }).join('') + '</div>';
  h += '<div class="tabs" style="overflow-x:auto">' + [['todos', 'Tudo'], ['entregas', 'Entregas'], ['entradas', 'Entradas'], ['baixas', 'Baixas']].map(function (x) {
    return '<button data-a="estHistTipo" data-v="' + x[0] + '" class="' + (estUI.histTipo === x[0] ? 'on' : '') + '" style="white-space:nowrap;flex:1 0 auto">' + x[1] + '</button>'; }).join('') + '</div>';
  var l = estMovsPeriodo(d), vistos = {}, linhas = [];
  l.forEach(function (m) {
    if (m.mov === 'saida') { if (vistos[m.entregaId]) return; vistos[m.entregaId] = 1; }
    linhas.push(m);
  });
  if (!linhas.length) return h + '<div class="card"><div class="empty">Nada neste período.</div></div>';
  var ent = {}; estEntregas(d).forEach(function (e) { ent[e.id] = e; });
  var dia = '';
  h += '<div class="card lp">';
  linhas.forEach(function (m) {
    if (m.data !== dia) { dia = m.data; h += '<div class="sec" style="margin:10px 12px 2px;font-size:11px">' + (m.data === d.hoje ? 'Hoje' : DIAS[parseData(m.data).getDay()] + ', ' + brCompleto(m.data)) + '</div>'; }
    if (m.mov === 'saida') {
      var e = ent[m.entregaId];
      h += '<div class="row cl" data-a="estEntregaAbrir" data-v="' + esc(m.entregaId) + '"><div class="info"><div class="nm">Entrega' + (e && e.pessoaNome ? ' · ' + esc(e.pessoaNome) : '') + '</div><div class="sb">' + esc(m.hora) + ' · ' + esc(e ? estItensTexto(tipo, e) : '') + '</div></div>' +
        (m.estornado ? '<span class="pill p-cinza">estornada</span>' : '<span class="pill p-dour">saída</span>') + '</div>';
    } else {
      var ent1 = m.mov === 'entrada';
      h += '<div class="row cl" data-a="estMovAbrir" data-v="' + esc(m.id) + '"><div class="info"><div class="nm">' + (ent1 ? 'Entrada' : 'Baixa') + ' · ' + esc(estNomeProd(tipo, m.produtoId)) + '</div><div class="sb">' + esc(m.hora) + ' · ' + (ent1 ? '+' : '−') + estQ(m.qtd) + ' ' + esc(estUn(tipo, m.produtoId)) + ' · ' + esc(m.origem || '') + (m.parte ? ' · ' + esc(m.parte) : '') + '</div></div>' +
        (m.estornado ? '<span class="pill p-cinza">estornada</span>' : '<span class="pill ' + (ent1 ? 'p-verde' : 'p-vermelho') + '">' + (ent1 ? 'entrada' : 'baixa') + '</span>') + '</div>';
    }
  });
  h += '</div>';
  if (d.truncado) h += '<div class="sb" style="font-size:11.5px;color:var(--tx3);margin:4px 6px">Mostrando as 600 movimentações mais recentes dos últimos 90 dias.</div>';
  return h + '<button class="btn gh sm" data-a="estExportar" data-v="mov">Exportar movimentações (CSV)</button><div class="gap"></div>';
}

/* ═════ produto: detalhe, cadastro/edição ═════ */
function estProdutoAbrir(id) {
  var tipo = modEst(), d = estD[tipo].d, p = estProd(tipo, id); if (!p) return;
  var op = d.perm.operador, ms = d.movimentos.filter(function (m) { return m.produtoId === id; }).slice(0, 6);
  var h = '<h2>' + esc(p.nome) + '</h2><div class="sb" style="font-size:12.5px;color:#888;margin-bottom:8px">' + esc([p.codigo, p.categoria, p.apresentacao].filter(Boolean).join(' · ')) + ' ' + estPill(p) + '</div>' +
    '<div class="card kvs" style="background:var(--bg);box-shadow:none"><div class="kv"><span>Disponível</span><b>' + estQ(p.disponivel) + ' ' + esc(p.unidade) + '</b></div>' +
    (p.vencido > 0 ? '<div class="kv"><span>Vencido (dar baixa)</span><b style="color:var(--vermelho)">' + estQ(p.vencido) + ' ' + esc(p.unidade) + '</b></div>' : '') +
    '<div class="kv"><span>Estoque mínimo</span><b>' + (p.minimo > 0 ? estQ(p.minimo) : '—') + '</b></div>' +
    '<div class="kv"><span>Limite por pessoa</span><b>' + (p.limiteQtd > 0 ? estQ(p.limiteQtd) + ' ' + esc(p.unidade) + ' a cada ' + p.limiteDias + ' dias' : 'sem limite') + '</b></div>' +
    (tipo === 'farmacia' ? '<div class="kv"><span>Receita</span><b>' + (p.exigeReceita ? 'obrigatória' : 'não exigida') + '</b></div>' : '') + '</div>';
  h += '<div class="sec" style="margin-left:0">Lotes em estoque</div>';
  h += p.lotes.length ? '<div class="card lp" style="box-shadow:none;background:var(--bg)">' + p.lotes.map(function (l) {
    var venc = l.validade && l.validade < d.hoje, soon = l.validade && !venc && l.validade <= addDiasISO(d.hoje, 30);
    return '<div class="row"><div class="info"><div class="nm">' + estQ(l.saldo) + ' ' + esc(p.unidade) + (l.lote ? ' · lote ' + esc(l.lote) : '') + '</div><div class="sb">' + (l.validade ? 'validade ' + brCompleto(l.validade) : 'sem validade') + ' · entrou em ' + br(l.data) + (l.origem ? ' · ' + esc(l.origem) : '') + (l.parte ? ' · ' + esc(l.parte) : '') + '</div></div>' +
      (venc ? '<span class="pill p-vermelho">vencido</span>' : soon ? '<span class="pill p-amarelo">vence logo</span>' : '') + '</div>';
  }).join('') + '</div>' : '<div class="empty" style="padding:10px">Sem saldo em lotes.</div>';
  if (ms.length) h += '<div class="sec" style="margin-left:0">Últimas movimentações</div><div class="card lp" style="box-shadow:none;background:var(--bg)">' + ms.map(function (m) {
    return '<div class="row"><div class="info"><div class="nm">' + (m.mov === 'entrada' ? '+' : '−') + estQ(m.qtd) + ' ' + esc(p.unidade) + ' · ' + (m.mov === 'entrada' ? 'entrada' : m.mov === 'saida' ? 'entrega' : 'baixa') + '</div><div class="sb">' + brCompleto(m.data) + ' ' + esc(m.hora) + ' · ' + esc(m.usuarioNome) + '</div></div>' + (m.estornado ? '<span class="pill p-cinza">estornada</span>' : '') + '</div>';
  }).join('') + '</div>';
  if (op) h += '<div class="gap"></div><div class="g2"><button class="btn pr sm" data-a="estEntradaForm" data-v="' + esc(id) + '">+ Entrada</button><button class="btn gh sm" data-a="estBaixaForm" data-v="' + esc(id) + '"' + (p.lotes.length ? '' : ' disabled') + '>Dar baixa</button></div><div class="gap"></div><button class="btn gh sm" data-a="estProdutoForm" data-v="' + esc(id) + '">Editar produto</button>';
  abrirModal(h + '<div class="gap"></div><button class="btn gh" data-a="fechar">Fechar</button>');
}
var EST_CATEG = { mercado: ['Alimentos', 'Higiene pessoal', 'Limpeza', 'Vestuário', 'Outros'], farmacia: ['Medicamento', 'Material de saúde', 'Higiene / curativo', 'Outros'] };
var EST_UNIDADES = ['un', 'kg', 'g', 'L', 'pacote', 'caixa', 'cartela', 'comprimido', 'frasco', 'bisnaga', 'ampola'];
function estProdutoForm(id) {
  var tipo = modEst(), p = id ? estProd(tipo, id) : null; p = p || { nome: '', categoria: '', unidade: 'un', apresentacao: '', minimo: 0, limiteQtd: 0, limiteDias: 30, exigeReceita: false, ativa: true };
  var h = '<h2>' + (id ? 'Editar produto' : 'Novo produto') + '</h2><div class="sb" style="font-size:12.5px;color:#888">' + EST_NOME[tipo] + '</div>' +
    '<label>Nome *</label><input id="pf-nome" value="' + esc(p.nome) + '" placeholder="' + (tipo === 'mercado' ? 'Ex.: Arroz' : 'Ex.: Dipirona') + '" autocomplete="off">' +
    (tipo === 'farmacia' ? '<label>Apresentação (dose / forma)</label><input id="pf-apr" value="' + esc(p.apresentacao) + '" placeholder="Ex.: 500 mg · comprimido">' : '<label>Apresentação (opcional)</label><input id="pf-apr" value="' + esc(p.apresentacao) + '" placeholder="Ex.: pacote 5 kg">') +
    '<div class="g2"><div><label>Categoria</label><select id="pf-cat"><option value="">—</option>' + opts(EST_CATEG[tipo].map(function (c) { return [c, c]; }), p.categoria) + '</select></div>' +
    '<div><label>Unidade</label><input id="pf-un" list="pf-un-l" value="' + esc(p.unidade) + '"><datalist id="pf-un-l">' + EST_UNIDADES.map(function (u) { return '<option value="' + u + '">'; }).join('') + '</datalist></div></div>' +
    '<div class="g2"><div><label>Estoque mínimo</label><input id="pf-min" type="text" inputmode="decimal" value="' + (p.minimo > 0 ? estQ(p.minimo) : '') + '" placeholder="avisar abaixo de…"></div>' +
    '<div><label>Limite por pessoa</label><input id="pf-lq" type="text" inputmode="decimal" value="' + (p.limiteQtd > 0 ? estQ(p.limiteQtd) : '') + '" placeholder="vazio = sem limite"></div></div>' +
    '<label>Período do limite (dias)</label><input id="pf-ld" type="number" min="1" max="365" value="' + (p.limiteDias || 30) + '">' +
    '<div class="sb" style="font-size:11.5px;color:var(--tx3);margin:2px 2px 6px">Ex.: limite 2 e período 30 = no máximo 2 unidades por pessoa a cada 30 dias.</div>' +
    (tipo === 'farmacia' ? '<label style="display:flex;gap:10px;align-items:center;margin:8px 0"><input type="checkbox" id="pf-rec" style="width:20px;height:20px"' + (p.exigeReceita ? ' checked' : '') + '> <span>Exige receita para entregar</span></label>' : '') +
    (id ? '<label style="display:flex;gap:10px;align-items:center;margin:8px 0"><input type="checkbox" id="pf-ativa" style="width:20px;height:20px"' + (p.ativa ? ' checked' : '') + '> <span>Produto ativo (aparece nas entregas)</span></label>' : '') +
    '<div style="height:10px"></div><button class="btn pr" data-a="estProdutoSalvar" data-v="' + esc(id || '') + '">Salvar produto</button><div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>';
  abrirModal(h);
}
function estProdutoSalvar(id) {
  var tipo = modEst(), v = function (x) { var e = $(x); return e ? e.value.trim() : ''; };
  if (v('pf-nome').length < 2) return toast('Informe o nome do produto.');
  var d = { tipo: tipo, id: id || undefined, nome: v('pf-nome'), apresentacao: v('pf-apr'), categoria: v('pf-cat'), unidade: v('pf-un') || 'un', minimo: estNum(v('pf-min')), limiteQtd: estNum(v('pf-lq')), limiteDias: Number(v('pf-ld')) || 30,
    exigeReceita: $('pf-rec') ? $('pf-rec').checked : false, ativa: $('pf-ativa') ? $('pf-ativa').checked : true };
  carregando(true, 'Salvando...');
  (sbDisponivel()?v39EstSalvarProduto(tipo,d):chamar('estSalvarProduto', d)).then(function () { toast('Produto salvo ✓'); fechar(); return carregarEst(tipo, true); })
    .catch(function (e) { toast(e.message, 5000); }).then(function () { carregando(false); render(); });
}

/* ═════ entrada de estoque e baixa ═════ */
function estEntradaForm(pid) {
  var tipo = modEst(), d = estD[tipo].d, ativos = d.produtos.filter(function (p) { return p.ativa; });
  if (!ativos.length) { toast('Cadastre um produto primeiro.'); return estProdutoForm(''); }
  var pr = pid ? estProd(tipo, pid) : null, far = tipo === 'farmacia';
  var h = '<h2>Entrada de estoque</h2><div class="sb" style="font-size:12.5px;color:#888">' + EST_NOME[tipo] + '</div>' +
    '<label>Produto *</label>' + (pr ? '<input id="en-prodtxt" value="' + esc(pr.nome + (pr.apresentacao ? ' ' + pr.apresentacao : '')) + '" disabled><input type="hidden" id="en-prod" value="' + esc(pr.id) + '">' :
      '<select id="en-prod"><option value="">Escolha…</option>' + opts(ativos.map(function (p) { return [p.id, p.nome + (p.apresentacao ? ' · ' + p.apresentacao : '') + ' (' + estQ(p.disponivel) + ' ' + p.unidade + ')']; }), '') + '</select>') +
    '<div class="g2"><div><label>Quantidade *</label><input id="en-qtd" type="text" inputmode="decimal" placeholder="0"></div><div><label>Origem</label><select id="en-origem">' + opts(d.origens.map(function (o) { return [o, o]; }), 'Doação') + '</select></div></div>' +
    '<label>Doador / fornecedor</label><input id="en-parte" placeholder="Ex.: Supermercado X, campanha de Natal" autocomplete="off">' +
    '<div class="g2"><div><label>Lote' + (far ? '' : ' (opcional)') + '</label><input id="en-lote"></div><div><label>Validade' + (far ? ' *' : ' (opcional)') + '</label><input id="en-val" type="date"></div></div>' +
    '<label>Observação</label><input id="en-obs" maxlength="200">' +
    '<div style="height:10px"></div><button class="btn pr" data-a="estEntradaSalvar">Registrar entrada</button><div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>';
  abrirModal(h);
}
function estEntradaSalvar() {
  var tipo = modEst(), v = function (x) { var e = $(x); return e ? e.value.trim() : ''; };
  if (!v('en-prod')) return toast('Escolha o produto.');
  if (!(estNum(v('en-qtd')) > 0)) return toast('Informe a quantidade.');
  if (tipo === 'farmacia' && !v('en-val')) return toast('Informe a validade do medicamento.');
  carregando(true, 'Registrando...');
  (function(){var q={ tipo: tipo, produtoId: v('en-prod'), qtd: estNum(v('en-qtd')), origem: v('en-origem'), parte: v('en-parte'), lote: v('en-lote'), validade: v('en-val'), obs: v('en-obs') };return sbDisponivel()?v39EstEntrada(tipo,q):chamar('estEntrada',q);})()
    .then(function () { toast('Entrada registrada ✓'); fechar(); return carregarEst(tipo, true); })
    .catch(function (e) { toast(e.message, 5000); }).then(function () { carregando(false); render(); });
}
function estBaixaForm(pid) {
  var tipo = modEst(), d = estD[tipo].d, p = estProd(tipo, pid); if (!p || !p.lotes.length) return toast('Sem saldo para dar baixa.');
  var venc = p.lotes.filter(function (l) { return l.validade && l.validade < d.hoje; })[0];
  var h = '<h2>Dar baixa</h2><div class="sb" style="font-size:12.5px;color:#888">' + esc(p.nome) + '</div>' +
    '<label>Lote *</label><select id="ba-lote">' + p.lotes.map(function (l) { return '<option value="' + esc(l.id) + '"' + (venc && venc.id === l.id ? ' selected' : '') + '>' + estQ(l.saldo) + ' ' + esc(p.unidade) + (l.lote ? ' · lote ' + esc(l.lote) : '') + (l.validade ? ' · val. ' + brCompleto(l.validade) : '') + '</option>'; }).join('') + '</select>' +
    '<div class="g2"><div><label>Quantidade *</label><input id="ba-qtd" type="text" inputmode="decimal" value="' + (venc ? estQ(venc.saldo) : '') + '"></div><div><label>Motivo *</label><select id="ba-motivo"><option value="">Escolha…</option>' + opts(d.motivos.map(function (o) { return [o, o]; }), venc ? 'Vencido' : '') + '</select></div></div>' +
    '<label>Observação</label><input id="ba-obs" maxlength="200">' +
    '<div class="aviso" style="margin:8px 0;font-size:12px">A baixa tira o item do estoque. Se lançou por engano, use “Estornar” no histórico.</div>' +
    '<button class="btn pr" data-a="estBaixaSalvar" data-v="' + esc(pid) + '">Confirmar baixa</button><div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>';
  abrirModal(h);
}
function estBaixaSalvar(pid) {
  var tipo = modEst(), v = function (x) { var e = $(x); return e ? e.value.trim() : ''; };
  if (!(estNum(v('ba-qtd')) > 0)) return toast('Informe a quantidade.');
  if (!v('ba-motivo')) return toast('Escolha o motivo.');
  carregando(true, 'Registrando...');
  (function(){var q={ tipo: tipo, produtoId: pid, loteId: v('ba-lote'), qtd: estNum(v('ba-qtd')), motivo: v('ba-motivo'), obs: v('ba-obs') };return sbDisponivel()?v39EstBaixa(tipo,q):chamar('estBaixa',q);})()
    .then(function () { toast('Baixa registrada ✓'); fechar(); return carregarEst(tipo, true); })
    .catch(function (e) { toast(e.message, 5000); }).then(function () { carregando(false); render(); });
}

/* ═════ nova entrega ═════ */
function estNovaEntrega() {
  var tipo = modEst(), d = estD[tipo].d;
  if (!d || !d.perm.operador) return;
  if (!d.produtos.some(function (p) { return p.ativa && p.disponivel > 0; })) return toast('Não há produtos com saldo disponível.', 4000);
  estFl = { tipo: tipo, pessoa: null, res: [], resumo: null, itens: [], receita: '', prescritor: '', obs: '', excecao: '', aut: false, fim: null, prodSel: '', qtdSel: '' };
  estFlTela();
}
function estFlLer() {
  if (!estFl || estFl.fim) return;
  var g = function (id) { var e = $(id); return e ? e.value : null; };
  var x;
  if ((x = g('est-fl-presc')) !== null) estFl.prescritor = x;
  if ((x = g('est-fl-obs')) !== null) estFl.obs = x;
  if ((x = g('est-fl-exc')) !== null) estFl.excecao = x;
  if ($('est-fl-aut')) estFl.aut = $('est-fl-aut').checked;
  if ((x = g('est-fl-prod')) !== null) estFl.prodSel = x;
  if ((x = g('est-fl-qtd')) !== null) estFl.qtdSel = x;
}
function resultadosBuscaEst(l) {
  if (!l || !l.length) return '<div style="font-size:12px;color:var(--tx3);padding:8px 2px">Digite ao menos 3 letras do nome ou 4 dígitos do telefone. Quem ainda não tem cadastro: toque em “Cadastrar nova pessoa”.</div>';
  return '<div class="card lp" style="box-shadow:none;background:var(--bg)">' + l.map(function (x) {
    return '<div class="row cl" data-a="estFlPessoa" data-v="' + esc(x.id) + '"><div class="av" style="' + corAvatar(x.nome) + '">' + ini(x.nome) + '</div><div class="info"><div class="nm">' + esc(x.nome) + '</div>' +
      '<div class="sb">' + esc(x.codigo) + (x.bairro ? ' · ' + esc(x.bairro) : '') + (x.fone4 ? ' · tel. final ' + esc(x.fone4) : '') + '</div></div><span class="pill ' + (x.igreja ? 'p-dour' : 'p-cinza') + '">' + (x.igreja ? 'da igreja' : 'Instituto') + '</span></div>';
  }).join('') + '</div>';
}
/** Avisos de uma linha: saldo e limite por pessoa. */
function estFlAviso(it) {
  var f = estFl, p = estProd(f.tipo, it.produtoId); if (!p) return { bloqueia: true, txt: 'Produto não encontrado.' };
  if (it.qtd > p.disponivel) return { bloqueia: true, txt: 'Saldo insuficiente (disponível ' + estQ(p.disponivel) + ').' };
  if (p.limiteQtd > 0) {
    var ja = (f.resumo && f.resumo.retirado && f.resumo.retirado[p.id]) || 0;
    if (Math.round((ja + it.qtd) * 1000) / 1000 > p.limiteQtd) return { excede: true, txt: 'Passa do limite: já retirou ' + estQ(ja) + ' de ' + estQ(p.limiteQtd) + ' ' + p.unidade + ' nos últimos ' + p.limiteDias + ' dias.' };
  }
  return null;
}
function estFlTela() {
  var f = estFl, tipo = f.tipo, d = estD[tipo].d, h = '<h2>Nova entrega</h2><div class="sb" style="font-size:12.5px;color:#888;margin-bottom:6px">' + EST_NOME[tipo] + '</div>';
  if (f.fim) return estComprovante();
  if (!f.pessoa) {
    h += '<div class="sb" style="font-size:13px;margin:6px 0">1. Quem vai receber?</div><div class="busca"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input id="est-fl-busca" placeholder="Nome ou telefone (mín. 3 letras)" autocomplete="off"></div>' +
      '<div id="est-fl-res">' + resultadosBuscaEst(f.res) + '</div><button class="btn gh" data-a="instNovoAtendido" data-v="estoque" style="margin-top:8px">+ Cadastrar nova pessoa</button>';
  } else {
    h += '<div style="display:flex;flex-wrap:wrap;gap:5px;margin:4px 0 8px"><span class="pill p-verde" data-a="estFlTrocar" style="cursor:pointer">' + esc(f.pessoa.nome) + ' · ' + esc(f.pessoa.codigo) + ' ✎</span></div>';
    var ult = (f.resumo && f.resumo.ultimas) || [];
    if (ult.length) h += '<div class="sb" style="font-size:11.5px;color:var(--tx2);margin:0 2px 8px;line-height:1.5"><b>Últimas retiradas:</b> ' + ult.map(function (u) {
      return br(u.data) + ' (' + u.itens.map(function (i) { return estQ(i.qtd) + ' ' + estNomeProd(tipo, i.produtoId); }).join(', ') + ')'; }).join(' · ') + '</div>';
    else h += '<div class="sb" style="font-size:11.5px;color:var(--tx2);margin:0 2px 8px">Primeira retirada registrada para esta pessoa.</div>';
    h += '<div class="sb" style="font-size:13px;margin:6px 0">2. O que será entregue?</div>';
    var temExc = false, bloq = false, exigeRec = false;
    if (f.itens.length) {
      h += '<div class="card lp" style="box-shadow:none;background:var(--bg)">' + f.itens.map(function (it, i) {
        var av = estFlAviso(it), p = estProd(tipo, it.produtoId); if (av && av.excede) { temExc = true; if (!pode('institutoAdmin')) bloq = true; } if (av && av.bloqueia) bloq = true; if (p && p.exigeReceita) exigeRec = true;
        return '<div class="row"><div class="info"><div class="nm">' + estQ(it.qtd) + ' ' + esc(p ? p.unidade : '') + ' · ' + esc(estNomeProd(tipo, it.produtoId)) + '</div>' +
          (av ? '<div class="sb" style="color:' + (av.bloqueia ? 'var(--vermelho)' : '#b26a00') + '">' + esc(av.txt) + '</div>' : (p && p.exigeReceita ? '<div class="sb">exige receita</div>' : '')) + '</div>' +
          '<button class="btn dg sm" data-a="estFlRem" data-v="' + i + '" style="padding:6px 9px">×</button></div>';
      }).join('') + '</div>';
    }
    var disp = d.produtos.filter(function (p) { return p.ativa && p.disponivel > 0; });
    h += '<div style="display:flex;gap:6px;align-items:flex-end;margin-top:6px"><div style="flex:1;min-width:0"><label style="margin-top:0">Produto</label><select id="est-fl-prod"><option value="">Escolha…</option>' +
      opts(disp.map(function (p) { return [p.id, p.nome + (p.apresentacao ? ' · ' + p.apresentacao : '') + ' — ' + estQ(p.disponivel) + ' ' + p.unidade]; }), f.prodSel) + '</select></div>' +
      '<div style="width:86px"><label style="margin-top:0">Qtd</label><input id="est-fl-qtd" type="text" inputmode="decimal" value="' + esc(f.qtdSel) + '" placeholder="1"></div>' +
      '<button class="btn pr sm" data-a="estFlAdd" style="height:44px">Incluir</button></div>';
    if (tipo === 'farmacia') {
      h += '<div class="sb" style="font-size:13px;margin:12px 0 4px">3. Receita ' + (exigeRec ? '<b style="color:var(--vermelho)">(obrigatória)</b>' : '(opcional)') + '</div>';
      if (f.receita) h += '<div style="display:flex;gap:10px;align-items:center"><img src="' + f.receita + '" alt="Receita" style="width:84px;height:84px;object-fit:cover;border-radius:10px;border:1px solid #ddd"><div style="flex:1"><div class="sb" style="font-size:12.5px">Receita anexada ✓</div><button class="btn gh sm" data-a="estFlRecRem" style="margin-top:4px">Remover / trocar</button></div></div>';
      else h += '<div class="g2"><button class="btn gh sm" data-a="estFlFoto" data-v="cam">📷 Tirar foto</button><button class="btn gh sm" data-a="estFlFoto" data-v="gal">🖼 Galeria</button></div>';
      h += '<label>Prescritor / CRM (opcional)</label><input id="est-fl-presc" value="' + esc(f.prescritor) + '" maxlength="80" placeholder="Ex.: Dra. Ana · CRM 12345">';
    }
    if (temExc) {
      h += pode('institutoAdmin') ? '<div class="aviso" style="margin:10px 0 4px;font-size:12.5px;line-height:1.5"><b>Exceção ao limite.</b> Como coordenação, você pode autorizar com justificativa (fica registrada).</div><label>Justificativa da exceção *</label><input id="est-fl-exc" value="' + esc(f.excecao) + '" maxlength="200" placeholder="Ex.: família numerosa, receita contínua">'
        : '<div class="aviso" style="margin:10px 0 4px;font-size:12.5px;line-height:1.5"><b>Limite excedido.</b> Reduza a quantidade ou peça a autorização da coordenação.</div>';
    }
    h += '<label>Observação (opcional)</label><input id="est-fl-obs" value="' + esc(f.obs) + '" maxlength="200">';
    if (!f.pessoa.autorizou) h += '<label style="display:flex;gap:10px;align-items:flex-start;margin:10px 0 0;font-size:12.5px;color:#7a4b00"><input type="checkbox" id="est-fl-aut" style="width:20px;height:20px;flex:0 0 20px"' + (f.aut ? ' checked' : '') + '> <span>Confirmo que a pessoa <b>autorizou o uso dos dados</b> (LGPD) para esta entrega.</span></label>';
    h += '<div style="height:12px"></div><button class="btn pr" data-a="estFlConfirmar"' + (f.itens.length && !bloq ? '' : ' disabled') + '>Registrar entrega</button>';
  }
  abrirModal(h + '<div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
  if (!f.pessoa && $('est-fl-busca')) setTimeout(function () { try { $('est-fl-busca').focus(); } catch (e) {} }, 250);
}
function estFlPessoa(id) {
  var x = (estFl.res || []).filter(function (r) { return r.id === id; })[0]; if (!x) return;
  estFlEscolher({ id: x.id, nome: x.nome, codigo: x.codigo, autorizou: x.autorizou });
}
function estFlPessoaNova(p) { estFlEscolher({ id: p.id, nome: p.nome, codigo: p.codigo, autorizou: p.autorizou !== false }); }
function estFlEscolher(p) {
  var f = estFl; carregando(true, 'Consultando retiradas...');
  (sbDisponivel()?v39EstPessoaResumo(f.tipo,p.id):chamar('estPessoaResumo', { tipo: f.tipo, pessoaId: p.id })).then(function (r) { f.pessoa = p; f.resumo = r; f.aut = false; estFlTela(); })
    .catch(function (e) { toast(e.message, 5000); }).then(function () { carregando(false); });
}
function estFlAdd() {
  estFlLer(); var f = estFl, pid = f.prodSel, q = estNum(f.qtdSel);
  if (!pid) return toast('Escolha o produto.');
  if (!(q > 0)) return toast('Informe a quantidade.');
  var ex = f.itens.filter(function (i) { return i.produtoId === pid; })[0];
  if (ex) ex.qtd = Math.round((ex.qtd + q) * 1000) / 1000; else f.itens.push({ produtoId: pid, qtd: q });
  f.prodSel = ''; f.qtdSel = ''; estFlTela();
}
function estFlConfirmar() {
  estFlLer(); var f = estFl, tipo = f.tipo;
  if (!f.itens.length) return toast('Inclua ao menos um item.');
  var exc = f.itens.some(function (it) { var a = estFlAviso(it); return a && a.excede; }), rec = f.itens.some(function (it) { var p = estProd(tipo, it.produtoId); return p && p.exigeReceita; });
  if (exc && (!pode('institutoAdmin') || String(f.excecao).trim().length < 5)) return toast(pode('institutoAdmin') ? 'Informe a justificativa da exceção (mín. 5 letras).' : 'Limite excedido: peça a autorização da coordenação.', 4500);
  if (tipo === 'farmacia' && rec && !f.receita) return toast('Algum item exige receita: anexe a foto.', 4500);
  if (!f.pessoa.autorizou && !f.aut) return toast('Confirme a autorização de uso dos dados.');
  carregando(true, f.receita ? 'Enviando receita...' : 'Registrando...');
  var opSaida=sbDisponivel()?((tipo==='farmacia'&&f.receita)?v39UploadReceitaPrivada(f.pessoa.id,f.receita,'receita.jpg').then(function(up){return v39EstSalvarReceita(f.pessoa.id,{issued_on:hoje(),prescriber_name:f.prescritor||null,private_file_reference:up.upload.path,notes:f.obs||null});}).then(function(rx){return v39EstCriarEntrega(tipo,f.pessoa.id,f.itens,f.obs,rx.id);}):v39EstCriarEntrega(tipo,f.pessoa.id,f.itens,f.obs,null)).then(function(x){return {entrega:{id:x.delivery_id,pessoaNome:f.pessoa.nome||'',pessoaCodigo:f.pessoa.codigo||'',data:hoje(),hora:new Date().toTimeString().slice(0,5),itens:f.itens,excecao:exc}};}):chamar('estSaida', { tipo: tipo, pessoaId: f.pessoa.id, itens: f.itens, autorizou: f.pessoa.autorizou ? undefined : true, excecao: exc ? f.excecao : '', obs: f.obs,
    receita: f.receita ? { imagem: f.receita, prescritor: f.prescritor } : undefined });
  opSaida.then(function (r) {
    f.fim = r.entrega; return carregarEst(tipo, true);
  }).then(function () { if (estFl && estFl.fim) estFlTela(); })
    .catch(function (e) { toast(e.message, 6000); carregarEst(tipo, true).then(function () { if (estFl && !estFl.fim) estFlTela(); }); })
    .then(function () { carregando(false); });
}
function estTextoComprovante(c, tipo) {
  var d = parseData(c.data);
  return '✅ *' + (tipo === 'farmacia' ? 'Retirada registrada' : 'Entrega registrada') + '* — ' + EST_NOME[tipo] + '\nProtocolo: ' + c.id + '\n\uD83D\uDCC5 ' + brCompleto(c.data) + ' às ' + c.hora + '\n\uD83D\uDC64 ' + c.pessoaNome + ' (' + c.pessoaCodigo + ')\n\n' +
    c.itens.map(function (i) { return '• ' + estQ(i.qtd) + ' ' + i.unidade + ' · ' + i.nome; }).join('\n') + '\n\n\uD83D\uDE4F ' + igrNome();
}
function estComprovante() {
  var c = estFl.fim, tipo = estFl.tipo;
  abrirModal('<div class="perfil" style="padding-top:2px"><div class="av" style="background:var(--verde);color:#fff;width:64px;height:64px;font-size:28px;margin:0 auto 8px">✓</div><h2>Entrega registrada!</h2><p>Protocolo <b>' + esc(c.id) + '</b></p></div>' +
    '<div class="card kvs" style="background:var(--bg);box-shadow:none"><div class="kv"><span>Atendido</span><b>' + esc(c.pessoaNome) + '</b></div>' +
    c.itens.map(function (i) { return '<div class="kv"><span>' + esc(i.nome) + '</span><b>' + estQ(i.qtd) + ' ' + esc(i.unidade) + '</b></div>'; }).join('') +
    (c.receita ? '<div class="kv"><span>Receita</span><b>anexada ✓</b></div>' : '') + (c.excecao ? '<div class="kv"><span>Exceção ao limite</span><b>autorizada</b></div>' : '') + '</div>' +
    '<div class="gap"></div><button class="btn pr" data-a="estComprovante">Enviar comprovante (WhatsApp)</button><div class="gap"></div><button class="btn gh" data-a="estNovaEntrega">Nova entrega</button><div class="gap"></div><button class="btn gh" data-a="fechar">Concluir</button>');
}
function estComprovante2() {
  var f = estFl; if (!f || !f.fim) return;
  var t = estTextoComprovante(f.fim, f.tipo);
  if (navigator.share) navigator.share({ text: t }).catch(function () {}); else window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank');
}

/* receita: foto da câmera ou da galeria, reduzida antes de enviar */
function estFlFoto(modo) {
  var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; if (modo === 'cam') inp.setAttribute('capture', 'environment');
  inp.style.display = 'none'; document.body.appendChild(inp);
  inp.addEventListener('change', function () {
    var arq = inp.files && inp.files[0]; if (inp.parentNode) inp.parentNode.removeChild(inp);
    if (arq) processarReceita(arq, function (url) { estFlLer(); if (estFl) { estFl.receita = url; estFlTela(); } });
  });
  inp.click();
}
function processarReceita(file, pronto) {
  var fr = new FileReader();
  fr.onload = function () {
    var img = new Image();
    img.onload = function () {
      var maxL = 1500, q = 0.72, url = '';
      for (var t = 0; t < 9; t++) {
        var k = Math.min(1, maxL / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
        var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
        url = cv.toDataURL('image/jpeg', q);
        if (url.length < 380000) break;
        maxL = Math.round(maxL * 0.85); q = Math.max(0.5, q - 0.04);
      }
      if (url.length >= 380000) return toast('Não foi possível reduzir esta imagem. Tente outra foto.');
      pronto(url);
    };
    img.onerror = function () { toast('Arquivo de imagem inválido.'); };
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
}

/* ═════ detalhe de uma entrega, receita e estorno ═════ */
function estEntregaAbrir(id) {
  var tipo = modEst(), d = estD[tipo].d, e = estEntregas(d).filter(function (x) { return x.id === id; })[0]; if (!e) return;
  var h = '<h2>Entrega ' + esc(e.id) + '</h2><div class="sb" style="font-size:12.5px;color:#888;margin-bottom:6px">' + brCompleto(e.data) + ' às ' + esc(e.hora) + ' · ' + EST_NOME[tipo] + '</div>';
  if (e.estornado) h += '<div class="aviso" style="margin:6px 0;font-size:12.5px"><b>Entrega estornada</b> — os itens voltaram ao estoque.' + (e.estornoMotivo ? '<br>Motivo: ' + esc(e.estornoMotivo) : '') + '</div>';
  h += '<div class="card kvs" style="background:var(--bg);box-shadow:none">' + (e.pessoaNome ? '<div class="kv"><span>Atendido</span><b>' + esc(e.pessoaNome) + ' · ' + esc(e.pessoaCodigo) + '</b></div>' : '') +
    Object.keys(e.itens).map(function (k) { return '<div class="kv"><span>' + esc(estNomeProd(tipo, k)) + '</span><b>' + estQ(e.itens[k]) + ' ' + esc(estUn(tipo, k)) + '</b></div>'; }).join('') +
    '<div class="kv"><span>Lançado por</span><b>' + esc(e.usuarioNome) + '</b></div>' + (e.prescritor ? '<div class="kv"><span>Prescritor</span><b>' + esc(e.prescritor) + '</b></div>' : '') +
    (e.obs ? '<div class="kv"><span>Observação</span><b>' + esc(e.obs) + '</b></div>' : '') + '</div>';
  if (e.temReceita && d.perm.receita) h += '<div class="gap"></div><button class="btn gh" data-a="estVerReceita" data-v="' + esc(e.id) + '">Ver receita</button>';
  if (d.perm.operador && !e.estornado) h += '<div class="gap"></div><button class="btn gh" data-a="estComprovanteDe" data-v="' + esc(e.id) + '">Reenviar comprovante (WhatsApp)</button>';
  if (estPodeEstornar(d, { usuarioId: e.usuarioId, data: e.data, estornado: e.estornado })) h += '<div class="gap"></div><button class="btn dg" data-a="estEstornarAbrir" data-v="e|' + esc(e.id) + '">Estornar entrega</button>';
  abrirModal(h + '<div class="gap"></div><button class="btn gh" data-a="fechar">Fechar</button>');
}
function estComprovanteDe(id) {
  var tipo = modEst(), d = estD[tipo].d, e = estEntregas(d).filter(function (x) { return x.id === id; })[0]; if (!e) return;
  var c = { id: e.id, data: e.data, hora: e.hora, pessoaNome: e.pessoaNome, pessoaCodigo: e.pessoaCodigo, itens: Object.keys(e.itens).map(function (k) { var p = estProd(tipo, k); return { nome: estNomeProd(tipo, k), unidade: p ? p.unidade : 'un', qtd: e.itens[k] }; }) };
  var t = estTextoComprovante(c, tipo);
  if (navigator.share) navigator.share({ text: t }).catch(function () {}); else window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank');
}
function estVerReceita(id) {
  var tipo = modEst(); carregando(true, 'Abrindo receita...');
  chamar('estReceita', { tipo: tipo, entregaId: id }).then(function (r) {
    abrirModal('<h2>Receita · ' + esc(id) + '</h2>' + (r.prescritor ? '<div class="sb" style="font-size:12.5px;color:#888">' + esc(r.prescritor) + '</div>' : '') +
      '<img src="' + r.img + '" alt="Receita" style="width:100%;border-radius:10px;margin-top:8px;border:1px solid #ddd"><div class="gap"></div><button class="btn gh" data-a="estEntregaAbrir" data-v="' + esc(id) + '">‹ Voltar</button><div class="gap"></div><button class="btn gh" data-a="fechar">Fechar</button>');
  }).catch(function (e) { toast(e.message, 5000); }).then(function () { carregando(false); });
}
function estMovAbrir(id) {
  var tipo = modEst(), d = estD[tipo].d, m = d.movimentos.filter(function (x) { return x.id === id; })[0]; if (!m) return;
  var ent = m.mov === 'entrada', p = estProd(tipo, m.produtoId);
  var h = '<h2>' + (ent ? 'Entrada' : 'Baixa') + '</h2><div class="sb" style="font-size:12.5px;color:#888;margin-bottom:6px">' + brCompleto(m.data) + ' às ' + esc(m.hora) + '</div>';
  if (m.estornado) h += '<div class="aviso" style="margin:6px 0;font-size:12.5px"><b>Lançamento estornado.</b>' + (m.estornoMotivo ? '<br>Motivo: ' + esc(m.estornoMotivo) : '') + '</div>';
  h += '<div class="card kvs" style="background:var(--bg);box-shadow:none"><div class="kv"><span>Produto</span><b>' + esc(estNomeProd(tipo, m.produtoId)) + '</b></div><div class="kv"><span>Quantidade</span><b>' + (ent ? '+' : '−') + estQ(m.qtd) + ' ' + esc(p ? p.unidade : '') + '</b></div>' +
    '<div class="kv"><span>' + (ent ? 'Origem' : 'Motivo') + '</span><b>' + esc(m.origem || '—') + '</b></div>' + (m.parte ? '<div class="kv"><span>Doador / fornecedor</span><b>' + esc(m.parte) + '</b></div>' : '') +
    (m.lote ? '<div class="kv"><span>Lote</span><b>' + esc(m.lote) + '</b></div>' : '') + (m.validade ? '<div class="kv"><span>Validade</span><b>' + brCompleto(m.validade) + '</b></div>' : '') +
    '<div class="kv"><span>Lançado por</span><b>' + esc(m.usuarioNome) + '</b></div>' + (m.obs ? '<div class="kv"><span>Observação</span><b>' + esc(m.obs) + '</b></div>' : '') + '</div>';
  if (estPodeEstornar(d, m)) h += '<div class="gap"></div><button class="btn dg" data-a="estEstornarAbrir" data-v="m|' + esc(m.id) + '">Estornar lançamento</button>';
  abrirModal(h + '<div class="gap"></div><button class="btn gh" data-a="fechar">Fechar</button>');
}
function estEstornarAbrir(v) {
  var p = String(v).split('|'); estForm = { tipo: modEst(), por: p[0], id: p.slice(1).join('|') };
  abrirModal('<h2>Estornar</h2><div class="aviso" style="margin:8px 0;font-size:12.5px;line-height:1.5">Os itens ' + (p[0] === 'e' ? 'da entrega voltam ao estoque' : 'voltam ao estado anterior') + '. O registro continua no histórico, marcado como estornado.</div>' +
    '<label>Motivo do estorno *</label><textarea id="es-motivo" rows="3" maxlength="200" placeholder="Ex.: lançado em duplicidade"></textarea>' +
    '<div style="height:10px"></div><button class="btn dg" data-a="estEstornarOk">Confirmar estorno</button><div class="gap"></div><button class="btn gh" data-a="fechar">Cancelar</button>');
}
function estEstornarOk() {
  var f = estForm, mt = $('es-motivo') ? $('es-motivo').value.trim() : ''; if (!f) return;
  if (mt.length < 3) return toast('Informe o motivo.');
  carregando(true, 'Estornando...');
  var req = { tipo: f.tipo, motivo: mt }; if (f.por === 'e') req.entregaId = f.id; else req.movId = f.id;
  ((sbDisponivel()&&f.por==='e')?v39EstEstornarEntrega(f.tipo,f.id,mt):chamar('estEstornar', req)).then(function () { toast('Estornado ✓'); fechar(); return carregarEst(f.tipo, true); })
    .catch(function (e) { toast(e.message, 5000); }).then(function () { carregando(false); render(); });
}

/* ═════ exportar CSV (abre no Excel) ═════ */
function csvCel(v) { v = String(v == null ? '' : v); return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function estExportar(modo) {
  var tipo = modEst(), d = estD[tipo].d, linhas = [];
  if (modo === 'estoque') {
    linhas.push(['Código', 'Produto', 'Apresentação', 'Categoria', 'Unidade', 'Disponível', 'Vencido', 'Mínimo', 'Limite por pessoa', 'Período (dias)', 'Exige receita', 'Situação']);
    d.produtos.forEach(function (p) { linhas.push([p.codigo, p.nome, p.apresentacao, p.categoria, p.unidade, estQ(p.disponivel), estQ(p.vencido), estQ(p.minimo), estQ(p.limiteQtd), p.limiteDias, p.exigeReceita ? 'sim' : 'não', estStatus(p)[1]]); });
  } else {
    var op = d.perm.operador;
    linhas.push(['Data', 'Hora', 'Movimento', 'Protocolo', 'Produto', 'Quantidade', 'Unidade', 'Lote', 'Validade', 'Origem / motivo', 'Doador / fornecedor'].concat(op ? ['Pessoa', 'Código'] : []).concat(['Lançado por', 'Observação', 'Estornado']));
    estMovsPeriodo(d).slice().reverse().forEach(function (m) {
      linhas.push([brCompleto(m.data), m.hora, m.mov === 'entrada' ? 'Entrada' : m.mov === 'saida' ? 'Entrega' : 'Baixa', m.entregaId || '', estNomeProd(tipo, m.produtoId), estQ(m.qtd), estUn(tipo, m.produtoId), m.lote, m.validade ? brCompleto(m.validade) : '', m.origem, m.parte]
        .concat(op ? [m.pessoaNome || '', m.pessoaCodigo || ''] : []).concat([m.usuarioNome, m.obs, m.estornado ? 'sim' : '']));
    });
  }
  var csv = '\uFEFF' + linhas.map(function (l) { return l.map(csvCel).join(';'); }).join('\r\n');
  var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = (tipo === 'mercado' ? 'mercado' : 'farmacia') + '_' + (modo === 'estoque' ? 'estoque' : 'movimentacoes') + '_' + d.hoje + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  toast('Arquivo gerado ✓');
}

} catch (err) { mostrarErro((err && err.message) || String(err), 'inicialização'); }
})();

