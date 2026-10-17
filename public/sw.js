const CACHE="verschub-v2";
const SHELL=["./","./manifest.webmanifest","./icon-192.png","./icon-512.png"];
self.addEventListener("install",e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch",e=>{
  const req=e.request;
  const url=new URL(req.url);
  // Nur eigene Dateien cachen; API (claims) und externe Daten immer direkt aus dem Netz
  if(req.method!=="GET" || url.origin!==location.origin || url.pathname.includes("/api/")) return;
  e.respondWith(
    fetch(req).then(res=>{
      const copy=res.clone();
      caches.open(CACHE).then(c=>c.put(req,copy));
      return res;
    }).catch(()=>caches.match(req).then(r=>r||caches.match("./")))
  );
});

self.addEventListener("push",e=>{
  let d={}; try{d=e.data.json();}catch{}
  e.waitUntil(self.registration.showNotification(d.title||"Verschub",{
    body:d.body||"", tag:d.tag, icon:"icon-192.png", badge:"icon-192.png",
    data:{url:self.registration.scope}
  }));
});
self.addEventListener("notificationclick",e=>{
  e.notification.close();
  const url=(e.notification.data&&e.notification.data.url)||"./";
  e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
    for(const c of list){ if(c.url.startsWith(url)&&"focus" in c) return c.focus(); }
    return clients.openWindow(url);
  }));
});
