/* 2Gather v39 Build 69D.2 - ponte v38 -> Supabase com login pela Edge auth comprovada */
(function(){
'use strict';
var V=window.G2_V39=window.G2_V39||{};
var C=window.APP_CONFIG||{};
V.AUTH_ACTIONS={login:1,logout:1};
V.LEGACY_ONLY={ping:1,configPublica:1,politica:1,logo:1,bairros:1};
V.isSupabaseReady=function(){return !!(V.ready&&V.client);};
V.failClosed=V.failClosed||function(action,detail){var e=new Error('Acao indisponivel no Supabase: '+action);e.code='V39_FAIL_CLOSED';e.action=action;e.detail=detail||null;throw e;};
function edgeUrl(){return String(C.supabaseUrl||'').replace(/\/$/,'')+'/functions/v1/auth';}
async function parseEdgeResponse(r){var text=await r.text(),body={};try{body=text?JSON.parse(text):{};}catch(_e){}if(!r.ok||body.ok===false){var e=new Error(body.erro||body.message||('Erro '+r.status));e.status=r.status;e.code=body.codigo||body.code||'';e.detail=body.detalhe||body.details||null;throw e;}return body;}
V.edgeAuth=async function(acao,payload,token){var h={'Content-Type':'application/json'};if(token)h.Authorization='Bearer '+token;var r=await fetch(edgeUrl(),{method:'POST',headers:h,body:JSON.stringify(Object.assign({},payload||{},{acao:acao}))});return parseEdgeResponse(r);};
V.boot=async function(){await V.init();var ctx=await V.sessionContext();V.context=ctx;window.dispatchEvent(new CustomEvent('2gather:v39-ready',{detail:{authenticated:!!(ctx&&ctx.authUser)}}));return ctx;};
V.signIn=async function(usuario,senha){var out=await V.edgeAuth('login',{usuario:String(usuario||'').trim(),senha:String(senha||'')});var session=out.session||out.data&&out.data.session;if(!session||!session.access_token||!session.refresh_token){var e=new Error('Sessao ausente na resposta de login.');e.code='AUTH_SESSION_MISSING';throw e;}if(!V.ready||!V.client){var init=await V.init();if(init&&init.error)throw init.error;}var sr=await V.client.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});if(sr.error)throw sr.error;V.context=await V.sessionContext();return{context:V.context,must_change_password:!!out.must_change_password,session:sr.data&&sr.data.session};};
V.signOut=async function(){if(!V.ready)await V.init();var r=await V.client.auth.signOut();if(r.error)throw r.error;V.context=null;};
V.loadCore=async function(churchId){if(!V.ready)await V.init();return{pessoas:await V.people.list(churchId),gcs:await V.gcs.list(churchId),equipe:await V.users.accounts()};};
V.promotions={visitsRequired:3,automatic:false,eligible:function(person,presenceCount){return !!person&&person.status==='Em visita'&&presenceCount>=3;}};
V.capabilities={auth:'supabase-edge',session:'supabase',people:'supabase',users:'supabase',growthGroups:'supabase',announcements:'supabase',prayers:'supabase',privateMessages:'supabase',financeCatalogs:'supabase',solidarityCatalogs:'supabase',legacyFallback:false,writeFallback:false};
})();
