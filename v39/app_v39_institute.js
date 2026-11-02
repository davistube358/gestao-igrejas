/* 2Gather v39 Build 28 - Instituto/Cursos: RPCs confirmadas */
(function(){'use strict';var V=window.G2_V39=window.G2_V39||{};
async function rpc(name,args){var r=await V.client.schema('app').rpc(name,args);if(r.error)throw r.error;return r.data;}
V.institute={
 saveCourse:function(courseId,payload){return rpc('v39_save_institute_course',{p_church_id:V.churchContext.ensure(),p_course_id:courseId||null,p_payload:payload||{}});},
 saveOffering:function(offeringId,payload){return rpc('v39_save_institute_offering',{p_church_id:V.churchContext.ensure(),p_offering_id:offeringId||null,p_payload:payload||{}});},
 saveSession:function(sessionId,payload){return rpc('v39_save_institute_session',{p_church_id:V.churchContext.ensure(),p_session_id:sessionId||null,p_payload:payload||{}});},
 saveEnrollment:function(enrollmentId,payload,reason){return rpc('v39_save_institute_enrollment',{p_church_id:V.churchContext.ensure(),p_enrollment_id:enrollmentId||null,p_payload:payload||{},p_reason:reason||null});},
 saveAttendance:function(sessionId,items,reason){return rpc('v39_save_institute_attendance',{p_church_id:V.churchContext.ensure(),p_session_id:sessionId,p_items:items||[],p_reason:reason||null});}
};})();
