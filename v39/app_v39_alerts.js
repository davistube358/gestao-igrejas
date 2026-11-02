/* 2Gather v39 Build 51 - Pendentes e Alertas derivados de contratos ja validados */
(function(){'use strict';var V=window.G2_V39=window.G2_V39||{};
V.alerts={
 derive:function(state){state=state||{};var people=state.pessoas||[],enc=state.encontros||[],alerts=[];
  var pendingPeople=people.filter(function(p){return !!p._pend;}).length;
  var pendingEnc=enc.filter(function(e){return !!e._pend;}).length;
  var visitorSuggestions=[];
  people.forEach(function(p){if(p.status!=='Em visita')return;var count=0;enc.forEach(function(e){if(e&&e.presencas&&e.presencas[p.id]==='P')count++;});if(count>=3)visitorSuggestions.push({tipo:'visitor_promotion_suggestion',pessoaId:p.id,nome:p.nome||p.name||'',presencas:count,gcId:p.gcId||null});});
  Array.prototype.push.apply(alerts,visitorSuggestions);
  return{pendentes:pendingPeople+pendingEnc,alertas:alerts,visitorSuggestions:visitorSuggestions};
 },
 apply:function(db){var x=this.derive(db||{});db.pendentes=x.pendentes;var legacy=(db.alertas||[]).filter(function(a){return a&&a.tipo!=='visitor_promotion_suggestion';});db.alertas=legacy.concat(x.alertas);return x;}
};})();
