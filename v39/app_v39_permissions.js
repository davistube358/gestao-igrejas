/* 2Gather v39 Build 14 - contexto de perfis e autorizacao local */
(function(){'use strict';var V=window.G2_V39=window.G2_V39||{};
function now(){return Date.now();} function ts(v){var n=Date.parse(v);return isNaN(n)?null:n;}
V.permissions={
 profiles:function(ctx){ctx=ctx||(V.runtime&&V.runtime.state&&V.runtime.state.context);var cid=V.runtime&&V.runtime.state&&V.runtime.state.churchId;return ((ctx&&ctx.assignments)||[]).filter(function(a){var access=((ctx&&ctx.churches)||[]).find(function(x){return x.id===a.church_user_access_id;});if(cid&&access&&access.church_id!==cid)return false;var f=ts(a.valid_from),u=ts(a.valid_until),n=now();return (!f||f<=n)&&(!u||u>=n);}).map(function(a){return (a.access_profiles&&a.access_profiles.name)||a.profile_name||a.profile_id;}).filter(Boolean);},
 hasProfile:function(name){return this.profiles().indexOf(name)>=0;},
 snapshot:function(){return {churchId:V.runtime&&V.runtime.state&&V.runtime.state.churchId||null,profiles:this.profiles()};}
};})();
