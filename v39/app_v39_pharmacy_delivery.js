/* 2Gather v39 Build 33 - Farmacia: RPCs com assinaturas confirmadas */
(function(){'use strict';var V=window.G2_V39=window.G2_V39||{};
async function rpc(n,a){var r=await V.client.schema('app').rpc(n,a);if(r.error)throw r.error;return r.data;}
V.pharmacyDelivery={
 createDraft:function(locationId,personId,prescriptionId,items,notes){return rpc('v39_create_pharmacy_delivery_draft',{p_church_id:V.churchContext.ensure(),p_location_id:locationId,p_person_id:personId,p_prescription_id:prescriptionId||null,p_items:items||[],p_notes:notes||null});},
 setEvidence:function(deliveryId,evidenceReference){return rpc('v39_set_pharmacy_delivery_evidence',{p_delivery_id:deliveryId,p_evidence_reference:evidenceReference});},
 finalize:function(deliveryId,reason){return rpc('v39_finalize_pharmacy_delivery',{p_delivery_id:deliveryId,p_reason:reason||null});}
};})();
