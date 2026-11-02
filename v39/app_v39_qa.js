/* 2Gather v39 Build 69D.1 - QA rigoroso + boot automatico Supabase */
(function(){
'use strict';
var V=window.G2_V39=window.G2_V39||{};
function c(n,o,d){return{name:n,ok:!!o,detail:d||null};}
function fn(o,n){return !!(o&&typeof o[n]==='function');}
V.qa={run:function(){
  var o=[],h=V.health?V.health():null;
  o.push(c('health-api',typeof V.health==='function',h));
  o.push(c('versao-39',V.version===39,V.version));
  o.push(c('cutover-fail-closed',!!(V.cutover&&V.cutover.policy==='fail-closed')));
  o.push(c('bridge-sem-write-fallback',!!(V.capabilities&&V.capabilities.writeFallback===false&&V.capabilities.legacyFallback===false)));
  o.push(c('repository-fail-closed',!!(V.migration&&V.migration.mode==='supabase-fail-closed'&&V.migration.legacyWriteFallback===false)));
  o.push(c('events-ui-sem-legacy',!!(V.eventsMeetingsUI&&V.eventsMeetingsUI.failClosed===true)));
  o.push(c('classes-ui-sem-legacy',!!(V.classesParticipantsUI&&V.classesParticipantsUI.failClosed===true)));
  var clinical=!!(V.clinicalRecords&&(fn(V.clinicalRecords,'save')||fn(V.clinicalRecords,'saveRecord')||fn(V.clinicalRecords,'create')));
  var identity=!!V.identity,lgpd=!!V.lgpd,communication=!!V.communication;
  o.push(c('67g-clinical',clinical));
  o.push(c('68d1-identity',identity));
  o.push(c('68d2-lgpd',lgpd));
  o.push(c('68d3-communication',communication));
  o.push(c('baseline-67g-68d3-completa',clinical&&identity&&lgpd&&communication));
  return{ok:o.every(function(x){return x.ok;}),checks:o,health:h,diagnostic:V.integration&&V.integration.diagnostic?V.integration.diagnostic():null};
}};
window.G2_V39_QA=function(){return V.qa.run();};

/* Build 69D.1: inicializa Supabase automaticamente e reaproveita sessao existente. */
var autoBootStarted=false;
async function autoBoot(){
  if(autoBootStarted)return;
  autoBootStarted=true;
  try{
    if(typeof V.init!=='function')throw new Error('G2_V39.init indisponivel.');
    if(!V.ready||!V.client){
      var initialized=await V.init();
      if(initialized&&initialized.error)throw initialized.error;
    }
    var sr=await V.client.auth.getSession();
    if(sr.error)throw sr.error;
    var session=sr.data&&sr.data.session;
    if(session&&typeof V.boot==='function')await V.boot();
    window.dispatchEvent(new CustomEvent('2gather:v39-autoboot-ready',{detail:{authenticated:!!session}}));
  }catch(error){
    autoBootStarted=false;
    console.error('[2Gather v39] Falha no boot automatico do Supabase.',error);
    window.dispatchEvent(new CustomEvent('2gather:v39-boot-error',{detail:{message:error&&error.message?error.message:String(error)}}));
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',autoBoot,{once:true});
else autoBoot();
})();
