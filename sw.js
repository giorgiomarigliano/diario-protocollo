/* Service worker del Diario Protocollo — 13/11/2026 (punto 6 del piano: uso senza rete).
   Obiettivo: l'app si apre subito e funziona anche con rete assente o pessima, SENZA mai mostrare una versione vecchia
   quando la rete c'e' e SENZA mai mettere in cache i dati del diario.

   Regole:
   - pagina (v2.html, index.html): prima la rete, con 4 secondi di attesa; solo se la rete non risponde si usa la copia in cache.
     Cosi' una pubblicazione nuova arriva sempre al primo caricamento utile.
   - libreria esterna e icone: prima la cache (sono immutabili, hanno la versione nell'URL), con aggiornamento in sottofondo.
   - qualsiasi chiamata a supabase.co (dati, accesso, foto): mai toccata e mai messa in cache. I dati del diario restano
     solo nella copia locale che gestisce l'app (localStorage), protetta dall'accesso.
   - tutto il resto: passa senza intermediazione.

   Per forzare l'aggiornamento della cache dopo una pubblicazione importante basta cambiare VERSIONE. */
const VERSIONE = 'dp2-2026-11-13';
const SHELL = [
  './v2.html',
  './apple-touch-icon-v2.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4/dist/umd/supabase.js',
];
const ATTESA_RETE = 4000;

self.addEventListener('install', (e) => {
  // la pagina viene messa in cache qui; se una risorsa non c'e' non si blocca l'installazione
  e.waitUntil(caches.open(VERSIONE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSIONE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => { if (e.data === 'aggiorna') self.skipWaiting(); });

function retePrima(req) {
  return new Promise((risolvi) => {
    let fatto = false;
    const timer = setTimeout(() => { if (!fatto) { fatto = true; caches.match(req, { ignoreSearch: true }).then((c) => risolvi(c || fetch(req))); } }, ATTESA_RETE);
    fetch(req).then((r) => {
      if (fatto) { if (r && r.ok) caches.open(VERSIONE).then((c) => c.put(req, r.clone())); return; }
      fatto = true; clearTimeout(timer);
      if (r && r.ok) { const copia = r.clone(); caches.open(VERSIONE).then((c) => c.put(req, copia)); }
      risolvi(r);
    }).catch(() => {
      if (fatto) return;
      fatto = true; clearTimeout(timer);
      caches.match(req, { ignoreSearch: true }).then((c) => risolvi(c || new Response('Senza rete e senza copia locale della pagina.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })));
    });
  });
}

function cachePrima(req) {
  return caches.match(req).then((c) => {
    const rete = fetch(req).then((r) => { if (r && r.ok) caches.open(VERSIONE).then((ca) => ca.put(req, r.clone())); return r; }).catch(() => c);
    return c || rete;
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co')) return;                       // dati, accesso e foto: sempre dalla rete, mai in cache
  if (req.mode === 'navigate' || req.destination === 'document') return e.respondWith(retePrima(req));
  if (SHELL.some((u) => req.url === u || req.url.endsWith(u.replace('./', '/')))) return e.respondWith(cachePrima(req));
});
