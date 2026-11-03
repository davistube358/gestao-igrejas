/* 2Gather v39 Build 21 - view model real da tela Usuarios */
(function(){'use strict';var V=window.G2_V39=window.G2_V39||{};
function val(o,ks){for(var i=0;i<ks.length;i++)if(o&&o[ks[i]]!==undefined&&o[ks[i]]!==null)return o[ks[i]];return '';}
V.userView={
 list:async function(){
  var churchId=V.churchContext.ensure(), accounts=await V.users.accounts(), out=[];
  for(var i=0;i<(accounts||[]).length;i++){
   var a=accounts[i], accesses=await V.users.churchAccess(a.id), access=(accesses||[]).filter(function(x){return x.church_id===churchId;})[0];
   if(!access)continue;
   var profs=await V.users.profiles(access.id), primary=(profs||[]).filter(function(x){return x.is_primary;})[0]||(profs||[])[0]||null;
   var person=null;if(a.person_id){var pr=await V.client.schema('app').from('people').select('*').eq('id',a.person_id).maybeSingle();if(pr.error)throw pr.error;person=pr.data;}
   out.push({id:a.id,pessoaId:a.person_id||'',nome:val(person,['name','nome'])||val(a,['display_name','name','email']),usuario:val(a,['username','email']),email:val(a,['email']),papel:primary?(val(primary.access_profiles,['name','code','slug'])||primary.profile_id):'',status:val(access,['status'])||val(a,['status'])||'',gcId:val(access,['growth_group_id','gc_id']),acessoId:access.id});
  }
  return out;
 }
};})();
