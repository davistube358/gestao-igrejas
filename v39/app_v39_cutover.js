/* 2Gather v39 Build 10 - registro de cutover controlado */
(function(){
'use strict';
var V=window.G2_V39=window.G2_V39||{};
V.cutover={
 policy:'explicit-only',
 enabled:{
  'v39.session':true,'v39.login':true,'v39.logout':true,'v39.core':true,
  'v39.people.list':true,'v39.people.save':true,
  'v39.groups.list':true,'v39.groups.save':true,
  'v39.announcements.list':true,'v39.announcements.save':true,
  'v39.prayers.list':true,'v39.prayers.save':true,
  'v39.finance.accounts':true,'v39.finance.categories':true,'v39.finance.payees':true,'v39.finance.paymentMethods':true,
  'v39.solidarity.locations':true,'v39.solidarity.categories':true,'v39.solidarity.counts':true
 },
 isEnabled:function(action){return this.enabled[action]===true;},
 summary:function(){return {policy:this.policy,enabled:Object.keys(this.enabled).filter(function(k){return V.cutover.enabled[k];}),legacyFallback:!!(V.integration&&V.integration.legacy)};}
};
})();
