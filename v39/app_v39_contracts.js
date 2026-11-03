/* 2Gather v39 Build 13 - validacao local de contratos */
(function(){'use strict';var V=window.G2_V39=window.G2_V39||{};
function req(o,ks,n){ks.forEach(function(k){if(o[k]===undefined||o[k]===null||o[k]==='')throw new Error(n+': campo obrigatorio '+k);});return o;}
V.contracts={
 'v39.login':function(x){return req(x,['email','password'],'login');},
 'v39.people.save':function(x){var r=x.row||x;return {row:req(r,['church_id'],'people.save')};},
 'v39.groups.save':function(x){var r=x.row||x;return {row:req(r,['church_id'],'groups.save')};},
 'v39.announcements.save':function(x){var r=x.row||x;return {row:req(r,['church_id'],'announcements.save')};},
 'v39.prayers.save':function(x){var r=x.row||x;return {row:req(r,['church_id'],'prayers.save')};},
 validate:function(a,p){var f=this[a];return f?f(p||{}):(p||{});}
};})();
