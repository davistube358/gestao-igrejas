'use strict';
(function(){
  if(!('serviceWorker' in navigator)||location.pathname.indexOf('/v39/')!==0)return;
  window.addEventListener('load',function(){
    var sw='./sw_v39.js?v=39-test-10';
    fetch(sw,{cache:'no-store'}).then(function(r){
      var ct=String(r.headers.get('content-type')||'').toLowerCase();
      if(!r.ok)throw new Error('sw_v39.js HTTP '+r.status);
      if(ct.indexOf('javascript')<0&&ct.indexOf('text/plain')<0)throw new Error('sw_v39.js retornou MIME '+(ct||'desconhecido')+'. Confirme o arquivo /v39/sw_v39.js no GitHub.');
      return navigator.serviceWorker.register(sw,{scope:'./'});
    }).then(function(r){console.info('[2Gather v39] service worker',r.scope);}).catch(function(e){console.warn('[2Gather v39] service worker não registrado:',e.message||e);});
  });
})();
