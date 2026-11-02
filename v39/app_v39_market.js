/* 2Gather v39 Build 42 - Mercado: operacoes reais seguras */
(function(){'use strict';var V=window.G2_V39=window.G2_V39||{};
V.market={
 catalogs:function(){return V.solidarityView.list('market');},
 resolveLocation:async function(){var x=V.solidarityView.items.market||await this.catalogs(),locs=(x.locations||[]).filter(function(l){return (l.status||'active')==='active'&&(l.module_scope==='market'||l.module_scope==='shared');});if(locs.length===1)return locs[0];if(!locs.length)throw new Error('Mercado: nenhum local de estoque ativo disponivel.');throw new Error('Mercado: existem varios locais ativos; selecao de local e obrigatoria.');},
 personSummary:function(personId,products){if(V.marketDelivery&&V.marketDelivery.enabled)return V.marketSummary.forPerson(personId,products||[]);return V.integration.legacy('estPessoaResumo',{tipo:'mercado',pessoaId:personId});}
};})();
