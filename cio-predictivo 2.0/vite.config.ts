import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      // El registro manual ya existe en index.html y terreno.html.
      injectRegister: false,
      // El manifest.json ya existe en public/ y está enlazado en los HTML.
      manifest: false,
      injectManifest: {
        // Precachea bundles con hash, íconos, manifest y fuentes locales.
        // El HTML se precachea aparte (ASSETS_CORE del SW) para preservar la
        // estrategia network-first de navegación.
        globPatterns: ['**/*.{js,css,json,png,svg,ico,woff,woff2}'],
        globIgnores: ['sw.js'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        rollupFormat: 'iife',
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        terreno: fileURLToPath(new URL('./terreno.html', import.meta.url))
      }
    }
  }
});
