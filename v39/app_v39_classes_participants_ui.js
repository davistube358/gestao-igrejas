/* 2Gather v39 Build 55 - UI Aulas e Participantes validada */
(function(){'use strict';var V=window.G2_V39=window.G2_V39||{};
V.classesParticipantsUI={
 saveClass:function(a){if(!(V.classesParticipants&&V.classesParticipants.enabled))return Promise.reject(Object.assign(new Error('Operacao v39 indisponivel; fallback legado bloqueado.'),{code:'V39_CONTRACT_UNAVAILABLE'}));return V.classesParticipants.saveClass(a).then(function(x){return{aula:Object.assign({},a,x||{})};});},
 saveMeeting:function(m){if(!(V.classesParticipants&&V.classesParticipants.enabled))return V.eventsMeetingsUI.meeting(m);if(m&&m.id&&Object.prototype.hasOwnProperty.call(m,'participantes')){return V.classesParticipants.saveParticipants(m).then(function(){var current=(typeof reuniaoPor==='function'?reuniaoPor(m.id):null)||{};return{reuniao:Object.assign({},current,m),aulas:[]};});}return V.eventsMeetingsUI.meeting(m);}
};})();
