/* 2Gather v39 Build 53 - contratos da UI v38 */
(function(){'use strict';var V=window.G2_V39=window.G2_V39||{};
V.eventsMeetingsUI={event:function(ev){if(!(V.eventsMeetings&&V.eventsMeetings.enabled))return Promise.reject(Object.assign(new Error('Operacao v39 indisponivel; fallback legado bloqueado.'),{code:'V39_CONTRACT_UNAVAILABLE'}));return V.eventsMeetings.saveEvent(ev).then(function(x){return{evento:Object.assign({},ev,{id:x.id})};});},meeting:function(m){if(!(V.eventsMeetings&&V.eventsMeetings.enabled))return Promise.reject(Object.assign(new Error('Operacao v39 indisponivel; fallback legado bloqueado.'),{code:'V39_CONTRACT_UNAVAILABLE'}));return V.eventsMeetings.saveMeeting(m).then(function(x){return{reuniao:Object.assign({},m,{id:x.id}),aulas:[]};});}};
})();
