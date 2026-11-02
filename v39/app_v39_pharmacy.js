/* 2Gather v39 Build 26 - Farmacia: RPCs confirmadas */
(function(){'use strict';var V=window.G2_V39=window.G2_V39||{};
V.pharmacy={
 savePrescriptionItems:async function(prescriptionId,items,reason){var churchId=V.churchContext.ensure();var r=await V.client.schema('app').rpc('v39_save_pharmacy_prescription_items',{p_church_id:churchId,p_prescription_id:prescriptionId,p_items:items||[],p_reason:reason||null});if(r.error)throw r.error;return r.data;}
};})();
