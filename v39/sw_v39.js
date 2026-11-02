/* 2Gather v39 Build 69D.5 */
var VERSAO='2gather-v39-b69d5';
self.addEventListener('install',function(e){e.waitUntil(self.skipWaiting());});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));});
self.addEventListener('fetch',function(e){var r=e.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==self.location.origin)return;e.respondWith(fetch(r,{cache:'no-store'}).catch(function(){return caches.match(r,{ignoreSearch:true});}));});
