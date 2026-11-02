/* 2Gather v39 Build 44 - entrada real Mercado com capacidade validada */
(function(){'use strict';var V=window.G2_V39=window.G2_V39||{};async function rpc(n,a){var r=await V.client.schema('app').rpc(n,a||{});if(r.error)throw r.error;return r.data;}
V.marketInventory={entryEnabled:false,
 validateEntry:async function(){try{var r=await V.client.schema('app').rpc('v39_create_market_inventory_entry',{p_church_id:'00000000-0000-0000-0000-000000000000',p_location_id:'00000000-0000-0000-0000-000000000000',p_product_id:'00000000-0000-0000-0000-000000000000',p_quantity:0,p_source:null,p_supplier:null,p_lot_code:null,p_expires_on:null,p_notes:null});this.entryEnabled=!!(r.error&&String(r.error.message||'').indexOf('QUANTITY_MUST_BE_POSITIVE')>=0);return this.entryEnabled;}catch(e){this.entryEnabled=false;return false;}},
 entry:async function(x){if(!this.entryEnabled)throw new Error('Mercado v39: entrada ainda nao validada.');var loc=await V.market.resolveLocation();return rpc('v39_create_market_inventory_entry',{p_church_id:V.churchContext.ensure(),p_location_id:loc.id,p_product_id:x.produtoId,p_quantity:Number(x.qtd),p_source:x.origem||null,p_supplier:x.parte||null,p_lot_code:x.lote||null,p_expires_on:x.validade||null,p_notes:x.obs||null});}
};})();

/* Build 45 */
G2_V39.marketInventory.lowEnabled=false;
G2_V39.marketInventory.validateLow=async function(){try{var r=await G2_V39.client.schema('app').rpc('v39_create_market_inventory_adjustment',{p_church_id:'00000000-0000-0000-0000-000000000000',p_location_id:'00000000-0000-0000-0000-000000000000',p_product_id:'00000000-0000-0000-0000-000000000000',p_lot_id:'00000000-0000-0000-0000-000000000000',p_quantity:0,p_reason:'qa',p_notes:null});this.lowEnabled=!!(r.error&&String(r.error.message||'').indexOf('QUANTITY_MUST_BE_POSITIVE')>=0);return this.lowEnabled;}catch(e){this.lowEnabled=false;return false;}};
G2_V39.marketInventory.low=async function(x){if(!this.lowEnabled)throw new Error('Mercado v39: baixa ainda nao validada.');var loc=await G2_V39.market.resolveLocation();var r=await G2_V39.client.schema('app').rpc('v39_create_market_inventory_adjustment',{p_church_id:G2_V39.churchContext.ensure(),p_location_id:loc.id,p_product_id:x.produtoId,p_lot_id:x.loteId,p_quantity:Number(x.qtd),p_reason:x.motivo,p_notes:x.obs||null});if(r.error)throw r.error;return r.data;};

/* Build 46 */
G2_V39.marketInventory.reverseEnabled=false;
G2_V39.marketInventory.validateReverse=async function(){try{var r=await G2_V39.client.schema('app').rpc('v39_reverse_market_inventory_adjustment',{p_adjustment_id:'00000000-0000-0000-0000-000000000000',p_reason:'preflight'});this.reverseEnabled=!!(r.error&&String(r.error.message||'').indexOf('MARKET_ADJUSTMENT_NOT_FOUND')>=0);return this.reverseEnabled;}catch(e){this.reverseEnabled=false;return false;}};
G2_V39.marketInventory.reverse=async function(id,reason){if(!this.reverseEnabled)throw new Error('Mercado v39: estorno de baixa ainda nao validado.');var r=await G2_V39.client.schema('app').rpc('v39_reverse_market_inventory_adjustment',{p_adjustment_id:id,p_reason:reason});if(r.error)throw r.error;return r.data;};
