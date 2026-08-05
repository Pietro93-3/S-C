// Service worker: network-first sia per la navigazione sia per i bundle, così quando c'è rete si
// vede SEMPRE l'ultima versione pubblicata. La cache resta come fallback per l'uso offline
// (l'app funziona interamente in locale, la rete non le serve).
//
// PERCHÉ NON cache-first SUI BUNDLE: la strategia precedente li serviva dalla cache dando per
// scontato che il nome contenesse un hash del contenuto. Non è così — la build produce nomi fissi
// (assets/index.js, assets/index.css), quindi l'URL non cambia mai fra una versione e l'altra e il
// browser continuava a servire il bundle vecchio finché non si svuotavano i dati del sito a mano.
// Con nomi stabili l'unica strategia corretta è chiedere alla rete e tenere la cache come riserva.
//
// IMPORTANTE: CACHE_VERSION va incrementata a ogni release del progetto. È l'unico modo per far sì
// che il browser scarichi il nuovo sw.js (lo confronta byte per byte con quello già installato: se
// il file è identico, anche con codice diverso altrove, NON lo considera un aggiornamento).
const CACHE_VERSION = "v41";
const CACHE_NAME = `powerbuilding-cache-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
  self.skipWaiting(); // attiva subito il nuovo service worker, non aspetta la chiusura di tutte le schede
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)) // ripulisce le cache di versioni precedenti
      )
    )
  );
  self.clients.claim(); // prende controllo delle schede già aperte, senza dover ricaricare
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => client.postMessage({ type: "SW_UPDATED", version: CACHE_VERSION }));
  });
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Solo richieste GET dello stesso dominio.
  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) {
    return;
  }

  // Navigazione (apertura/refresh della pagina): network-first. Prova sempre la rete per primo, così
  // l'utente vede l'ultima versione pubblicata; cade sulla cache solo se è offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  // Bundle dell'app (assets/index.js, assets/index.css): network-first. Il nome del file non
  // contiene un hash del contenuto, quindi lo stesso URL serve versioni diverse nel tempo: chiedere
  // prima alla rete è l'unico modo per non restare su un bundle vecchio. Offline si usa la cache.
  if (/\/assets\/index\.(js|css)$/.test(new URL(request.url).pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Tutto il resto (icone, manifest, font): cache-first. Sono file che non cambiano fra una
  // versione e l'altra, e scaricarli ogni volta sarebbe solo traffico sprecato.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => undefined);
    })
  );
});
