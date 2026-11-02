/* 2Gather v39 Build 25 - catalogos reais Mercado/Farmacia */
(function(){'use strict';var V=window.G2_V39=window.G2_V39||{};
function data(x){return x&&x.data!==undefined?x.data:x;}
V.solidarityView={items:{},list:function(scope){var id=V.churchContext.ensure();return Promise.all([V.integration.call('v39.solidarity.locations',{churchId:id,scope:scope}),V.integration.call('v39.solidarity.categories',{churchId:id,scope:scope}),V.integration.call('v39.solidarity.counts',{churchId:id})]).then(function(r){var out={locations:data(r[0])||[],categories:data(r[1])||[],counts:data(r[2])||[]};V.solidarityView.items[scope]=out;return out;});},loadAll:function(){return Promise.all([this.list('market'),this.list('pharmacy')]).then(function(x){return{mercado:x[0],farmacia:x[1]};});}};
})();
