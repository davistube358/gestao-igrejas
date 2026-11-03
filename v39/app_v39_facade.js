/* 2Gather v39 - facade para a UI herdada da v38 */
(function(){
'use strict';
var V=window.G2_V39=window.G2_V39||{};
function id(x){return x==null?'':String(x)}
function adaptPerson(p){p=p||{};return Object.assign({},p,{id:id(p.id),gcId:id(p.gc_id||p.gcId),nome:p.name||p.nome||'',apelido:p.nickname||p.apelido||'',status:p.status||'',tipo:p.type||p.tipo||''});}
function adaptGroup(g){g=g||{};return Object.assign({},g,{id:id(g.id),liderId:id(g.leader_person_id||g.lider_id||g.liderId),nome:g.name||g.nome||'',status:g.status||''});}
V.facade={
 hydrateCore:async function(){
   var core=await V.runtime.core();
   var legacy={pessoas:(core.pessoas||[]).map(adaptPerson),gcs:(core.gcs||[]).map(adaptGroup),equipe:core.equipe||[]};
   window.dispatchEvent(new CustomEvent('2gather:data-core',{detail:legacy}));
   return legacy;
 },
 session:async function(){if(!V.runtime.state.started)await V.runtime.start();return V.runtime.state.context;},
 login:function(email,password){return V.signIn(email,password);},
 logout:function(){return V.signOut();}
};
})();
