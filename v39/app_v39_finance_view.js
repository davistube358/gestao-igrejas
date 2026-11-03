/* 2Gather v39 Build 24 - catalogos financeiros reais */
(function(){'use strict';var V=window.G2_V39=window.G2_V39||{};
V.financeView={items:null,list:function(){var id=V.churchContext.ensure();return Promise.all([V.integration.call('v39.finance.accounts',{churchId:id}),V.integration.call('v39.finance.categories',{churchId:id}),V.integration.call('v39.finance.payees',{churchId:id}),V.integration.call('v39.finance.paymentMethods',{churchId:id})]).then(function(r){function d(x){return x&&x.data!==undefined?x.data:x;}V.financeView.items={accounts:d(r[0])||[],categories:d(r[1])||[],payees:d(r[2])||[],paymentMethods:d(r[3])||[]};return V.financeView.items;});}};
})();
