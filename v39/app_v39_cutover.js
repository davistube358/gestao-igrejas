/* 2Gather v39 Build 69C-R2 - cutover fail-closed por capacidade real */
(function(){'use strict';var V=window.G2_V39=window.G2_V39||{};
var staticEnabled={'v39.session':true,'v39.login':true,'v39.logout':true,'v39.core':true,'v39.people.list':true,'v39.people.save':true,'v39.groups.list':true,'v39.groups.save':true,'v39.announcements.list':true,'v39.announcements.save':true,'v39.prayers.list':true,'v39.prayers.save':true,'v39.finance.accounts':true,'v39.finance.categories':true,'v39.finance.payees':true,'v39.finance.paymentMethods':true,'v39.solidarity.locations':true,'v39.solidarity.categories':true,'v39.solidarity.counts':true};
var dynamic={
'v39.encounters.write':function(){return !!(V.encounters&&V.encounters.enabled&&V.encounters.validate);},
'v39.events.write':function(){return !!(V.eventsMeetings&&V.eventsMeetings.enabled&&V.eventsMeetings.saveEvent);},
'v39.meetings.write':function(){return !!(V.eventsMeetings&&V.eventsMeetings.enabled&&V.eventsMeetings.saveMeeting);},
'v39.classes.write':function(){return !!(V.classesParticipants&&V.classesParticipants.enabled&&V.classesParticipants.saveClass);},
'v39.participants.write':function(){return !!(V.classesParticipants&&V.classesParticipants.enabled&&V.classesParticipants.saveParticipants);},
'v39.clinical.write':function(){return !!(V.clinicalRecords&&V.clinicalRecords.enabled!==false&&(V.clinicalRecords.save||V.clinicalRecords.saveRecord));},
'v39.identity.write':function(){return !!(V.identity&&V.identity.enabled!==false&&typeof V.identity.suspendGlobal==='function'&&typeof V.identity.reactivateGlobal==='function');},
'v39.lgpd.write':function(){return !!(V.lgpd&&V.lgpd.enabled!==false&&typeof V.lgpd.acceptPolicy==='function');},
'v39.communication.write':function(){return !!(V.communication&&V.communication.enabled!==false&&typeof V.communication.recipients==='function'&&typeof V.communication.queue==='function'&&typeof V.communication.markBatch==='function');}
};
V.cutover={policy:'fail-closed',enabled:staticEnabled,isEnabled:function(action){if(staticEnabled[action]===true)return true;return !!(dynamic[action]&&dynamic[action]());},require:function(action){if(!this.isEnabled(action)){var e=new Error('Cutover nao habilitado ou preflight ausente: '+action);e.code='V39_CUTOVER_DISABLED';e.action=action;throw e;}return true;},summary:function(){var keys=Object.keys(staticEnabled).concat(Object.keys(dynamic));return{policy:this.policy,enabled:keys.filter(this.isEnabled.bind(this)),disabled:keys.filter(function(k){return !V.cutover.isEnabled(k);}),legacyFallback:false,writeFallback:false};}};
})();
