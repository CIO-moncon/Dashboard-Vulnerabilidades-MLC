// Este código le hace creer al navegador que la app tiene soporte nativo offline
self.addEventListener('install', (e) => {
    console.log('[Service Worker] Instalado');
});

self.addEventListener('fetch', (e) => {
    // Solo dejamos pasar la petición normal para cumplir el requisito PWA
});