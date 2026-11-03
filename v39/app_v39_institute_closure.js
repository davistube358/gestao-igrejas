/* 2Gather v39 Build 56 - consolidacao Instituto */
(function(){'use strict';var V=window.G2_V39=window.G2_V39||{};
V.instituteClosure={
 capabilities:function(){return{
  courses:!!(V.institute&&V.institute.saveCourse),offerings:!!(V.institute&&V.institute.saveOffering),sessions:!!(V.institute&&V.institute.saveSession),enrollments:!!(V.institute&&V.institute.saveEnrollment),attendance:!!(V.institute&&V.institute.saveAttendance),
  trainingMeetings:!!(V.eventsMeetings&&V.eventsMeetings.enabled),classesParticipants:!!(V.classesParticipants&&V.classesParticipants.enabled),
  market:!!(V.marketClosure&&V.marketClosure.state),pharmacy:!!(V.pharmacyFlow&&V.pharmacyDelivery)
 };},
 snapshot:function(){return{capabilities:this.capabilities(),courses:{available:!!V.institute},training:{available:!!V.classesParticipants},solidarity:{market:V.marketClosure&&V.marketClosure.state||null,pharmacyCatalogs:V.solidarityView&&V.solidarityView.items&&V.solidarityView.items.pharmacy||null}};},
 validate:function(){var c=this.capabilities();var required=['courses','offerings','sessions','enrollments','attendance','trainingMeetings','classesParticipants'];return{ready:required.every(function(k){return c[k];}),capabilities:c};}
};window.G2_V39_INSTITUTE_STATUS=function(){return V.instituteClosure.snapshot();};})();
