/* 2Gather v39 P1.2 - repository metadata alinhado ao cutover */
(function(){'use strict';var V=window.G2_V39=window.G2_V39||{};function needChurch(id){var c=id||(V.churchContext&&V.churchContext.ensure?V.churchContext.ensure():V.runtime&&V.runtime.state&&V.runtime.state.churchId);if(!c)throw new Error('Igreja ativa nao definida.');return c;}
V.repo=V.repo||{};V.repo.context=function(){return V.runtime&&V.runtime.state?V.runtime.state.context:null;};
V.repo.finance={accounts:function(id){return V.finance.accounts(needChurch(id));},categories:function(id){return V.finance.categories(needChurch(id));},payees:function(id){return V.finance.payees(needChurch(id));},paymentMethods:function(id){return V.finance.paymentMethods(needChurch(id));}};
V.repo.solidarity={locations:function(scope,id){return V.solidarity.locations(needChurch(id),scope);},categories:function(scope,id){return V.solidarity.categories(needChurch(id),scope);},counts:function(id){return V.solidarity.counts(needChurch(id));}};
V.migration={mode:'supabase-v39',migrated:['auth','session','people','growth-groups','meetings-attendance','services','church-events','training-meetings','institute','market','pharmacy','finance-reports'],pendingContracts:['prayer-writes','clinical-content-cutover'],isMigrated:function(name){return this.migrated.indexOf(name)>=0;}};
})();
