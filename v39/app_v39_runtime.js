/* 2Gather v39 - runtime oficial */
(function(){
'use strict';
var V=window.G2_V39=window.G2_V39||{};
function emit(n,d){window.dispatchEvent(new CustomEvent('2gather:'+n,{detail:d||{}}));}
V.runtime={state:{started:false,authenticated:false,churchId:null,context:null,error:null},
 start:async function(){
   try{
     var ctx=await V.boot();
     this.state.context=ctx;this.state.authenticated=!!(ctx&&ctx.authUser);this.state.started=true;this.state.error=null;
     var access=ctx&&ctx.churches&&ctx.churches.length?ctx.churches[0]:null;
     this.state.churchId=access?(access.church_id||(access.churches&&access.churches.id)||null):null;
     emit('runtime',{state:this.state});return this.state;
   }catch(e){this.state.started=false;this.state.error=e;emit('runtime-error',{message:e&&e.message?e.message:String(e)});throw e;}
 },
 selectChurch:function(id){this.state.churchId=id||null;emit('church-changed',{churchId:this.state.churchId});},
 core:async function(){if(!this.state.started)await this.start();return V.loadCore(this.state.churchId);}
};
V.bindAuthEvents=function(){
 if(!V.client||!V.client.auth||V._authListenerBound)return;
 V._authListenerBound=true;
 V.client.auth.onAuthStateChange(function(event){emit('auth-change',{event:event});if(event==='SIGNED_OUT'){V.context=null;V.runtime.state.authenticated=false;V.runtime.state.context=null;}});
};
})();
