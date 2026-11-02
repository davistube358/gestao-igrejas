/* 2Gather v39 Build 69D.4 */
var VERSAO='2gather-v39-b69d4';
self.addEventListener('install',function(e){e.waitUntil(self.skipWaiting());});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==VERSAO;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));});
self.addEventListener('fetch',function(e){var r=e.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==self.location.origin)return;if(r.mode==='navigate'){e.respondWith(fetch(r,{cache:'no-store'}).catch(function(){return caches.match(r);}));return;}e.respondWith(fetch(r).catch(function(){return caches.match(r,{ignoreSearch:true});}));});
