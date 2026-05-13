// Arktrix ZIP clone — API replay Service Worker
// Auto-generated. Do not edit manually.
const MANIFEST = {"GET https://api.ipify.org/?format=json":"/_data/ee9e5cf4f5816ab9.json","GET https://api6.ipify.org/?format=json":"/_data/8a34aef4dee66278.json","POST https://tracking.utmify.com.br/tracking/v1/events":"/_data/d20257743b59fc77.json","PUT https://tracking.utmify.com.br/tracking/v1/lead":"/_data/8d84ead942b69936.json"};
const PATH_INDEX = {"GET /?format=json":"/_data/8a34aef4dee66278.json","POST /tracking/v1/events":"/_data/d20257743b59fc77.json","PUT /tracking/v1/lead":"/_data/8d84ead942b69936.json"};
const PATH_NO_QUERY_INDEX = {"POST /tracking/v1/events":"/_data/d20257743b59fc77.json","PUT /tracking/v1/lead":"/_data/8d84ead942b69936.json"};

self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', function(event) {
  var req = event.request;
  var localPath = MANIFEST[req.method + ' ' + req.url];
  if (!localPath) {
    try {
      var u = new URL(req.url);
      // Try by origin+pathname (ignore query)
      localPath = MANIFEST[req.method + ' ' + u.origin + u.pathname];
      // Try by pathname+search (ignore host — main fix for proxy hosting)
      if (!localPath) localPath = PATH_INDEX[req.method + ' ' + u.pathname + u.search];
      // Try by pathname only (ignore query too)
      if (!localPath) localPath = PATH_NO_QUERY_INDEX[req.method + ' ' + u.pathname];
    } catch (e) {}
  }
  if (!localPath) return; // fall-through to network
  event.respondWith(
    fetch(localPath, { cache: 'no-cache' })
      .then(function(r) {
        return r.arrayBuffer().then(function(buf) {
          return new Response(buf, {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'X-Arktrix-Replay': '1' }
          });
        });
      })
      .catch(function() { return fetch(req); })
  );
});
