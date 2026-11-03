/* 2Gather v39 Build 38 - leitura real da evidencia/receita por entrega */
(function(){'use strict';var V=window.G2_V39=window.G2_V39||{};
V.pharmacyEvidence={get:async function(deliveryId){if(!deliveryId)throw new Error('Farmacia: entrega obrigatoria.');var churchId=V.churchContext.ensure();var r=await V.client.schema('app').from('pharmacy_deliveries').select('id,evidence_reference').eq('church_id',churchId).eq('id',deliveryId).maybeSingle();if(r.error)throw r.error;if(!r.data)throw new Error('Farmacia: entrega nao encontrada.');return{img:r.data.evidence_reference||'',deliveryId:r.data.id,_v39:true};}};
})();
