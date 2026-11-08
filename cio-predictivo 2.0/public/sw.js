// ============================================================================
// SERVICE WORKER INDUSTRIAL: SW.JS (v2.3.0)
// CIO PREDICTIVO 2.0 — Cache resiliente, offline y sincronización diferida
// ============================================================================
//
// Estrategias:
//   - Precache de Workbox: bundles hasheados, íconos y manifest (arranque
//     offline instantáneo tras la instalación).
//   - Navegación (HTML): network-first con fallback al shell cacheado.
//   - Assets del mismo origen (JS/CSS/imágenes): stale-while-revalidate.
//   - Tiles satelitales: cache-first con límite de tamaño.
//   - CDNs (fuentes, MapLibre, Chart.js): stale-while-revalidate.
//   - API (/api/*): nunca se cachea; el Outbox de IndexedDB maneja el offline.
// ============================================================================

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

// Precache generado por vite-plugin-pwa (revisiones con hash por build).
precacheAndRoute(self.__WB_MANIFEST);

const VERSION = 'v2.3.0';
const CACHE_ESTATICO = `cio-static-${VERSION}`;
const CACHE_RUNTIME = `cio-runtime-${VERSION}`;
const CACHE_CDN = `cio-cdn-${VERSION}`;
const CACHE_MAPAS = `cio-tiles-${VERSION}`;

const MAX_TILES_CACHE = 450;
const MAX_RUNTIME_CACHE = 120;

// El shell HTML se precachea aquí para preservar la estrategia network-first
// de navegación; los bundles/íconos los precachea Workbox (ver vite.config).
const ASSETS_CORE = ['./', './index.html', './terreno.html'];

const HOSTS_CDN = [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'unpkg.com',
    'cdn.jsdelivr.net',
    'cdnjs.cloudflare.com'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_ESTATICO).then(async (cache) => {
            console.log(`[SW ${VERSION}] Pre-cacheando app shell...`);
            await Promise.allSettled(
                ASSETS_CORE.map(async (url) => {
                    try {
                        const res = await fetch(url, { cache: 'reload' });
                        if (res.ok) await cache.put(url, res);
                    } catch {
                        /* Los opcionales pueden no existir en dev */
                    }
                })
            );
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            // Workbox elimina los precaches de versiones anteriores.
            cleanupOutdatedCaches(),
            caches.keys().then((keys) => {
                const vigentes = [CACHE_ESTATICO, CACHE_RUNTIME, CACHE_CDN, CACHE_MAPAS];
                return Promise.all(
                    keys.map((key) => {
                        // Solo purgar cachés propias (cio-*); las de Workbox se
                        // gestionan con cleanupOutdatedCaches.
                        if (key.startsWith('cio-') && !vigentes.includes(key)) {
                            console.log(`[SW] Purgando caché obsoleta: ${key}`);
                            return caches.delete(key);
                        }
                    })
                );
            })
        ])
    );
});

self.addEventListener('message', (event) => {
    if (event.data?.accion === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Solo GET y nunca la API (el offline se resuelve con IndexedDB/Outbox).
    if (request.method !== 'GET') return;
    if (url.pathname.startsWith('/api/')) return;

    // Firebase y endpoints de autenticación siempre a la red.
    if (
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('identitytoolkit.googleapis.com') ||
        url.hostname.includes('securetoken.googleapis.com')
    ) {
        return;
    }

    if (url.hostname.includes('arcgisonline.com') || url.hostname.includes('elevation-tiles-prod')) {
        event.respondWith(estrategiaTilesCacheFirst(request));
        return;
    }

    if (HOSTS_CDN.some((host) => url.hostname.includes(host))) {
        event.respondWith(estrategiaCDNStaleWhileRevalidate(request));
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(estrategiaAppNetworkFirst(request));
        return;
    }

    if (url.origin === self.location.origin) {
        event.respondWith(estrategiaRuntimeStaleWhileRevalidate(request));
    }
});

// Evento Background Sync: se dispara automáticamente al recuperar red.
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-reportes-terreno') {
        event.waitUntil(notificarClientesSincronizar());
    }
});

async function notificarClientesSincronizar() {
    const clientes = await self.clients.matchAll({ type: 'window' });
    for (const cliente of clientes) {
        cliente.postMessage({ accion: 'DESPACHAR_BOVEDA_OFFLINE' });
    }
}

async function estrategiaTilesCacheFirst(request) {
    const cache = await caches.open(CACHE_MAPAS);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;

    try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
            limitarTamanoCache(cache, MAX_TILES_CACHE);
        }
        return networkResponse;
    } catch {
        return cachedResponse || new Response('', { status: 408 });
    }
}

async function estrategiaCDNStaleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_CDN);
    const cachedResponse = await cache.match(request);

    const fetchPromise = fetch(request)
        .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
                cache.put(request, networkResponse.clone());
            }
            return networkResponse;
        })
        .catch(() => cachedResponse);

    return cachedResponse || fetchPromise;
}

async function estrategiaRuntimeStaleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_RUNTIME);
    const cachedResponse = await cache.match(request);

    const fetchPromise = fetch(request)
        .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
                cache.put(request, networkResponse.clone());
                limitarTamanoCache(cache, MAX_RUNTIME_CACHE);
            }
            return networkResponse;
        })
        .catch(() => cachedResponse);

    return cachedResponse || fetchPromise;
}

async function estrategiaAppNetworkFirst(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_ESTATICO);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;

        if (request.url.includes('terreno')) {
            return (
                (await caches.match('./terreno.html')) ||
                (await caches.match('/terreno.html')) ||
                (await caches.match('./index.html')) ||
                new Response('Sin conexión en faena.', {
                    status: 503,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                })
            );
        }

        return (
            (await caches.match('./index.html')) ||
            (await caches.match('/index.html')) ||
            new Response('Sin conexión en faena.', {
                status: 503,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            })
        );
    }
}

async function limitarTamanoCache(cache, maxItems) {
    const keys = await cache.keys();
    if (keys.length > maxItems) {
        const eliminar = keys.slice(0, Math.ceil(maxItems * 0.1));
        for (const req of eliminar) {
            await cache.delete(req);
        }
    }
}
