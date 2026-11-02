/* 2Gather v39 Build 60 - Financeiro e Relatorios consolidados */
(function(){'use strict';var V=window.G2_V39=window.G2_V39||{};
function num(x){x=Number(x);return isFinite(x)?x:0;}
V.financeReports={
 load:async function(){var churchId=V.churchContext.ensure();var ge=await V.client.schema('app').from('growth_group_encounters').select('id,growth_group_id,encounter_date,tithes,offerings').eq('church_id',churchId);if(ge.error)throw ge.error;var ce=await V.client.schema('app').from('church_events').select('id,event_date,title,event_type').eq('church_id',churchId).eq('deleted',false);if(ce.error)throw ce.error;var catalogs=V.financeView&&V.financeView.items?V.financeView.items:await V.financeView.list();var gcTotal={tithes:0,offerings:0,total:0};(ge.data||[]).forEach(function(x){gcTotal.tithes+=num(x.tithes);gcTotal.offerings+=num(x.offerings);});gcTotal.total=gcTotal.tithes+gcTotal.offerings;return{gc:{rows:ge.data||[],totals:gcTotal},events:{rows:ce.data||[]},catalogs:catalogs,_v39:true};},
 report:async function(){var x=await this.load();return{resumo:{dizimos:x.gc.totals.tithes,ofertas:x.gc.totals.offerings,total:x.gc.totals.total},encontros:x.gc.rows,eventos:x.events.rows,catalogos:x.catalogs};}
};window.G2_V39_FINANCE_REPORT=function(){return V.financeReports.report();};})();
