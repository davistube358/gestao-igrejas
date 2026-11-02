/* 2Gather v39 Build 23 - leitura real de pedidos de oracao */
(function(){'use strict';var V=window.G2_V39=window.G2_V39||{};
function pick(o,ks,d){for(var i=0;i<ks.length;i++){if(o&&o[ks[i]]!==undefined&&o[ks[i]]!==null)return o[ks[i]];}return d;}
V.prayerView={list:function(){return V.integration.call('v39.prayers.list',{churchId:V.churchContext.ensure()}).then(function(r){var xs=r&&r.data!==undefined?r.data:r;return (xs||[]).map(function(a){return{id:a.id,pessoaId:pick(a,['person_id','pessoa_id'],''),texto:pick(a,['request_text','body','text','pedido','texto'],''),status:pick(a,['status'],''),criadoEm:pick(a,['created_at'],''),atualizadoEm:pick(a,['updated_at'],''),privado:!!pick(a,['is_private','private'],false)};});});}};
})();
