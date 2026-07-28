import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env       = loadEnv(mode, process.cwd());
  const isProd    = mode === 'production';
  const apiTarget = env.VITE_API_URL || 'http://localhost:8765';

  return {
    base: '/',
    plugins: [
      react(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        registerType: 'prompt',
        includeAssets: ['pwa-192x192.png', 'pwa-512x512.png'],
        manifest: {
          name: 'MyFund — tracker portfela',
          short_name: 'MyFund',
          description: 'Śledź swój portfel inwestycyjny',
          theme_color: '#0d1117',
          background_color: '#0d1117',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          // Leniwe ładowanie tras ścięło pierwsze wejście z 1953 KB do 466 KB,
          // ale service worker i tak ściągał komplet 2,2 MB w tle — precache
          // brał każdy chunk, także trasy, na które użytkownik nigdy nie wszedł.
          // Te trzy to najcięższe z nich; łapie je runtime cache w sw.js dopiero
          // przy pierwszym wejściu na daną trasę.
          globIgnores: [
            'assets/pdf-*.js',
            'assets/ScenarioLab-*.js',
            'assets/CategoricalChart-*.js',
          ],
        },
      }),
    ],

    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
