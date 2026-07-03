// Service worker: network-first per la navigazione (index.html) così l'utente vede SEMPRE l'ultima
// versione pubblicata quando è online; cache-first per gli asset con hash nel nome (i bundle JS/CSS
// generati da Vite, sicuri da cachare a lungo perché un contenuto diverso ha sempre un hash diverso).
// La cache resta come fallback per l'uso offline (generazione cicli 100% locale, non serve la rete).
//
// IMPORTANTE: CACHE_VERSION va incrementata a ogni release del progetto. È l'unico modo per far sì
// che il browser scarichi il nuovo sw.js (lo confronta byte per byte con quello già installato: se
// il file è identico, anche con codice diverso altrove, NON lo considera un aggiornamento).
const CACHE_VERSION = "v2";
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

  // Asset (JS/CSS con hash, icone, manifest): cache-first, un contenuto diverso ha sempre un URL
  // diverso (hash nel nome file), quindi è sicuro servire dalla cache senza rischiare di mostrare
  // contenuto vecchio sotto lo stesso URL.
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
