/* 2Gather v39 Build 49 - Encontros/Chamada com preflight seguro */
(function(){'use strict';var V=window.G2_V39=window.G2_V39||{};
V.encounters={enabled:false,preflight:null,
 validate:async function(){
  try{
   var checks=await Promise.all([
    V.client.schema('app').from('growth_group_encounters').select('id').limit(1),
    V.client.schema('app').from('growth_group_attendance').select('encounter_id').limit(1),
    V.client.schema('app').from('growth_group_attendance_list').select('encounter_id').limit(1)
   ]);
   var tableOk=checks.every(function(x){return !x.error;});
   var probe=await V.client.schema('app').rpc('v39_save_growth_group_encounter',{p_church_id:'00000000-0000-0000-0000-000000000000',p_growth_group_id:'00000000-0000-0000-0000-000000000000',p_encounter_date:'1900-01-01',p_payload:{}});
   var rpcExists=!!probe.error && !/function .* does not exist|Could not find the function/i.test(String(probe.error.message||''));
   this.preflight={tables:tableOk,rpc:rpcExists,probeError:probe.error?probe.error.message:null};
   this.enabled=tableOk&&rpcExists;
   return this.preflight;
  }catch(e){this.enabled=false;this.preflight={tables:false,rpc:false,error:e.message||String(e)};return this.preflight;}
 },
 save:async function(e){
  if(!this.enabled)throw new Error('Encontros v39: preflight nao aprovado.');
  var r=await V.client.schema('app').rpc('v39_save_growth_group_encounter',{
   p_church_id:V.churchContext.ensure(),p_growth_group_id:e.gcId,p_encounter_date:e.data,
   p_payload:{tema:e.tema||'',anfitriao:e.anfitriao||'',dizimo:e.dizimo||'',oferta:e.oferta||'',recados:e.recados||'',presencas:e.presencas||{},lista:e.lista||{add:[],rem:[]}}
  });
  if(r.error)throw r.error;return r.data;
 }
};})();
