/* Online directory: never resurrect obsolete carrier data from a cache. */
const CACHE='rutas-cr-shell-v22';
const SHELL=['./','./index.html','./assets/css/app.css','./assets/js/core.js','./assets/js/app.js','./manifest.json','./assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('rutas-cr-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url),scope=new URL(self.registration.scope);
  if(event.request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname)||url.pathname.includes('/data/'))return;
  const path='./'+url.pathname.slice(scope.pathname.length);
  if(!SHELL.includes(path))return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(event.request,copy)));}return response;
  }).catch(async()=>{const cached=await caches.match(event.request);if(cached)return cached;if(event.request.mode==='navigate'){const home=await caches.match('./index.html');if(home)return home;}return Response.error();}));
});
