/* 理科计算器 Service Worker：离线缓存（导航网络优先，保证部署后立即更新） */
var CACHE='sci-calc-v1';
var ASSETS=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png'];
self.addEventListener('install',function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(ASSETS);}).then(function(){return self.skipWaiting();}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));
  }).then(function(){return self.clients.claim();}));
});
self.addEventListener('fetch',function(e){
  var req=e.request;
  if(req.method!=='GET')return;
  var url;
  try{url=new URL(req.url);}catch(err){return;}
  if(url.origin!==self.location.origin)return;
  if(req.mode==='navigate'){
    e.respondWith(fetch(req).then(function(r){
      var copy=r.clone();
      caches.open(CACHE).then(function(c){c.put('./index.html',copy);});
      return r;
    }).catch(function(){return caches.match('./index.html');}));
    return;
  }
  e.respondWith(caches.match(req).then(function(r){return r||fetch(req);}));
});