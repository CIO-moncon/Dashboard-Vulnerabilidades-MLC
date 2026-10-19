// ============================================================================
// SERVICE WORKER INDUSTRIAL: SW.JS
// CIO PREDICTIVO 2.0 — Mina Los Colorados (CMP) | CPF Ingeniería
// ============================================================================

const VERSION = 'v2.0.3';
const CACHE_ESTATICO = `cio-static-${VERSION}`;
const CACHE_CDN = `cio-cdn-${VERSION}`;
const CACHE_MAPAS = `cio-tiles-${VERSION}`;

const MAX_TILES_CACHE = 450;

const ASSETS_CORE = [
    './',
    './index.html',
    './terreno.html',
    './manifest.json',
    './css/main.css',
    './css/variables.css',
    './assets/img/logo-cpf.png',
    './js/app.js',
    './js/core/auth.js',
    './js/core/firebase-config.js',
    './js/core/reportes.js',
    './js/domain/evaluador-iso.js',
    './js/domain/plantillas.js',
    './js/ui/analisis.js',
    './js/ui/expediente.js',
    './js/ui/notificaciones.js',
    './js/ui/pms.js',
    './js/ui/sidebar.js',
    './js/ui/terreno.js',
    './js/terreno-core.js',
    './js/terreno-ui.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();

    event.waitUntil(
        caches.open(CACHE_ESTATICO).then(async (cache) => {
            console.log(`[SW ${VERSION}] Pre-cacheando recursos del CIO Predictivo...`);
            // Estrategia resiliente: cada recurso se cachea individualmente sin fallar en bloque
            await Promise.allSettled(
                ASSETS_CORE.map(async (url) => {
                    try {
                        const res = await fetch(url);
                        if (res.ok) await cache.put(url, res);
                    } catch {
                        /* ignorar opcionales */
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
            caches.keys().then((keys) => {
                return Promise.all(
                    keys.map((key) => {
                        if (![CACHE_ESTATICO, CACHE_CDN, CACHE_MAPAS].includes(key)) {
                            console.log(`[SW] Purgando caché obsoleta: ${key}`);
                            return caches.delete(key);
                        }
                    })
                );
            })
        ])
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET') return;

    if (
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('identitytoolkit.googleapis.com') ||
        url.hostname.includes('securetoken.googleapis.com') ||
        url.pathname.includes('/.lp')
    ) {
        return;
    }

    if (url.hostname.includes('arcgisonline.com') || url.hostname.includes('elevation-tiles-prod')) {
        event.respondWith(estrategiaTilesCacheFirst(request));
        return;
    }

    if (
        url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com') ||
        url.hostname.includes('unpkg.com') ||
        url.hostname.includes('cdn.jsdelivr.net') ||
        url.hostname.includes('cdnjs.cloudflare.com') ||
        url.hostname.includes('gstatic.com')
    ) {
        event.respondWith(estrategiaCDNStaleWhileRevalidate(request));
        return;
    }

    event.respondWith(estrategiaAppNetworkFirst(request));
});

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

        if (request.mode === 'navigate') {
            if (request.url.includes('terreno')) {
                return (await caches.match('./terreno.html')) || (await caches.match('terreno.html'));
            }
            return (await caches.match('./index.html')) || (await caches.match('index.html'));
        }

        return new Response('Sin conexión en faena.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
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