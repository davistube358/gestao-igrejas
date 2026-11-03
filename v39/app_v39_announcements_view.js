/* 2Gather v39 Build 22 - leitura real de Avisos/Mural */
(function(){
'use strict';
var V=window.G2_V39=window.G2_V39||{};
function pick(o,ks,d){for(var i=0;i<ks.length;i++){if(o&&o[ks[i]]!==undefined&&o[ks[i]]!==null)return o[ks[i]];}return d;}
V.announcementView={
 list:function(){
  return V.integration.call('v39.announcements.list',{churchId:V.churchContext.ensure()}).then(function(r){
   var xs=r&&r.data!==undefined?r.data:r;
   return (xs||[]).map(function(a){return {id:a.id,titulo:pick(a,['title','titulo'],''),texto:pick(a,['body','message','text','texto'],''),criadoEm:pick(a,['created_at','publish_at'],''),publicadoEm:pick(a,['publish_at'],''),status:pick(a,['status'],'')};});
  });
 }
};
})();
