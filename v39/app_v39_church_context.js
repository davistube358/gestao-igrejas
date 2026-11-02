/* 2Gather v39 Build 15 - contexto multi-igreja */
(function(){'use strict';var V=window.G2_V39=window.G2_V39||{};
function accessId(a){return a&&(a.church_id||(a.churches&&a.churches.id))||null;}
V.churchContext={
 available:function(){var c=V.runtime&&V.runtime.state&&V.runtime.state.context;return ((c&&c.churches)||[]).map(function(a){return{id:accessId(a),accessId:a.id,church:a.churches||null};}).filter(function(x){return !!x.id;});},
 select:function(id){var a=this.available();if(!a.some(function(x){return x.id===id;}))throw new Error('Igreja fora do escopo da sessao.');V.runtime.selectChurch(id);return this.snapshot();},
 ensure:function(){var s=V.runtime&&V.runtime.state;if(s&&s.churchId)return s.churchId;var a=this.available();if(a.length===1){V.runtime.selectChurch(a[0].id);return a[0].id;}if(a.length>1)throw new Error('Selecione uma igreja ativa.');throw new Error('Nenhuma igreja disponivel para esta sessao.');},
 snapshot:function(){return{active:V.runtime&&V.runtime.state&&V.runtime.state.churchId||null,available:this.available()};}
};
window.G2_V39_SELECT_CHURCH=function(id){return V.churchContext.select(id);};})();
