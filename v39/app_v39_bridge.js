/* 2Gather v39 - ponte de integracao v38 -> Supabase */
(function(){
'use strict';
var V=window.G2_V39=window.G2_V39||{};
V.AUTH_ACTIONS={login:1,logout:1};
V.LEGACY_ONLY={ping:1,configPublica:1,politica:1,logo:1,bairros:1,midiaEvento:1};
V.isSupabaseReady=function(){return !!(V.ready&&V.client);};
V.boot=async function(){
  var out=await V.init();
  var ctx=await V.sessionContext();
  V.context=ctx;
  window.dispatchEvent(new CustomEvent('2gather:v39-ready',{detail:{authenticated:!!(ctx&&ctx.authUser)}}));
  return ctx;
};
V.signIn=async function(email,password){
  if(!V.ready) await V.init();
  var r=await V.client.auth.signInWithPassword({email:email,password:password});
  if(r.error) throw r.error;
  V.context=await V.sessionContext();
  return V.context;
};
V.signOut=async function(){
  if(!V.ready) await V.init();
  var r=await V.client.auth.signOut(); if(r.error) throw r.error;
  V.context=null;
};
V.loadCore=async function(churchId){
  if(!V.ready) await V.init();
  var result={pessoas:[],gcs:[],equipe:[]};
  result.pessoas=await V.people.list(churchId);
  result.gcs=await V.gcs.list(churchId);
  result.equipe=await V.users.accounts();
  return result;
};
V.promotions={
  visitsRequired:3,
  automatic:false,
  eligible:function(person,presenceCount){return !!person&&person.status==='Em visita'&&presenceCount>=3;}
};
V.capabilities={
  auth:'supabase',session:'supabase',people:'supabase',users:'supabase',growthGroups:'supabase',
  announcements:'supabase',prayers:'supabase',privateMessages:'supabase',financeCatalogs:'supabase',solidarityCatalogs:'supabase',
  legacyFallback:true
};
})();
