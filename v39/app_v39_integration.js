/* 2Gather v39 Build 69D.15 - integracao fail-closed para writes */
(function(){
'use strict';
var V=window.G2_V39=window.G2_V39||{};
V.integration=V.integration||{};
V.integration.legacy=V.integration.legacy||null;
V.integration.stats=V.integration.stats||{supabase:0,legacy:0,readFallback:0,cacheHit:0,validationErrors:0,errors:0,blockedWrites:0};
V.integration.attachLegacy=function(fn){this.legacy=fn;};
V.integration.call=function(action,payload,progress){
 var self=this;
 if(V.mutationGateway&&V.mutationGateway.isMutation(action)){
   self.stats.supabase++;
   return V.mutationGateway.execute(action,payload,progress).catch(function(e){self.stats.errors++;if(e&&/^V39_/.test(e.code||''))self.stats.blockedWrites++;throw e;});
 }
 var cut=!!(V.cutover&&V.cutover.isEnabled(action)&&V.router&&V.router.canHandle(action));
 if(!cut){if(typeof self.legacy==='function'){self.stats.legacy++;return self.legacy(action,payload,progress);}self.stats.errors++;return Promise.reject(new Error('Operacao sem backend registrado: '+action));}
 var guarded,validated;
 try{guarded=V.guard?V.guard.protect(action,payload):payload;validated=V.contracts?V.contracts.validate(action,guarded):guarded;}catch(e){self.stats.validationErrors++;return Promise.reject(e);}
 var isRead=!!(V.resilience&&V.resilience.isRead(action));
 if(isRead&&V.cache){var cached=V.cache.get(action,validated);if(cached!==null){self.stats.cacheHit++;return Promise.resolve(cached);}}
 self.stats.supabase++;
 return V.router.call(action,validated).then(function(r){if(V.resilience)V.resilience.passed(action);if(!isRead&&V.mutation)r=V.mutation.after(action,r);return isRead&&V.cache?V.cache.set(action,validated,r):r;}).catch(function(e){self.stats.errors++;if(V.resilience)V.resilience.failed(action);if(isRead&&typeof self.legacy==='function'){self.stats.legacy++;self.stats.readFallback++;return Promise.resolve(self.legacy(action,validated,progress)).then(function(r){return V.cache?V.cache.set(action,validated,r):r;});}throw e;});
};
V.integration.diagnostic=function(){return{stats:Object.assign({},this.stats),mutationGateway:V.mutationGateway?V.mutationGateway.summary():null,cutover:V.cutover?V.cutover.summary():null,resilience:V.resilience?V.resilience.status():null};};
})();
