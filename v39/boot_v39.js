'use strict';
(function(){if(!('serviceWorker' in navigator)||location.pathname.indexOf('/v39/')!==0)return;window.addEventListener('load',function(){navigator.serviceWorker.register('./sw_v39.js?v=39-test-8',{scope:'./'}).then(function(r){console.info('[2Gather v39] service worker',r.scope);}).catch(function(e){console.warn('[2Gather v39] service worker não registrado',e);});});})();
