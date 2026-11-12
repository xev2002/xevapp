/* Xevapp service worker: funciona sin conexión y muestra notificaciones */
const CACHE = "xevapp-v10";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png", "./gsap.min.js", "./Flip.min.js"];
const CDN = [];
const NETWORK_ONLY = ["openrouter.ai", "generativelanguage.googleapis.com", "api.groq.com"];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL);
    await Promise.all(CDN.map(u => fetch(u, { mode: "cors" }).then(r => r.ok && c.put(u, r)).catch(() => {})));
    self.skipWaiting();
  })());
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (NETWORK_ONLY.some(h => url.hostname.includes(h))) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put("./index.html", cp)); return r; })
      .catch(() => caches.match("./index.html")));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok && (url.origin === location.origin || url.hostname === "cdnjs.cloudflare.com")) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
    return r;
  }).catch(() => hit)));
});
/* Push desde tu servidor gratuito: pide los avisos pendientes y los muestra */
self.addEventListener("push", e => {
  e.waitUntil((async () => {
    let items = [];
    try {
      const c = await (await caches.open("xevapp-cfg")).match("./__push_cfg");
      const cfg = c ? await c.json() : null;
      if (cfg) {
        const r = await fetch(cfg.url.replace(/\/+$/, "") + "/inbox?id=" + encodeURIComponent(cfg.id), { cache: "no-store" });
        items = (await r.json()).items || [];
      }
    } catch (_) {}
    try { if (e.data) { const d = e.data.json(); if (d && d.title) items.push(d); } } catch (_) {}
    if (!items.length) items = [{ id: "x", title: "Xevapp", body: "Tienes algo pendiente. Toca para verlo." }];
    for (const it of items.slice(-4)) {
      await self.registration.showNotification(it.title || "Xevapp", { body: it.body || "", tag: it.id || undefined, icon: "icon-192.png", badge: "icon-192.png" });
    }
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (all.length) return all[0].focus();
    return self.clients.openWindow("./");
  })());
});
