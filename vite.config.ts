import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'public',
        filename: 'sw.js',
        registerType: 'autoUpdate',
        includeAssets: ['logo-192.png', 'logo-512.png'],
        manifest: {
          name: 'Tickets — نظام إدارة الصيانة',
          short_name: 'Tickets',
          description: 'نظام إدارة تذاكر الصيانة والمواعيد',
          theme_color: '#18181b',
          background_color: '#18181b',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          icons: [
            {
              src: '/logo-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/logo-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/logo-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        injectManifest: {
          globDirectory: 'dist',
          globIgnores: [
            '**/index.html',
            'assets/index.es-*.js',
          ],
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
          // Install only the app shell. Route chunks and export/import engines
          // are cached after first use by the service worker instead of being
          // downloaded on every deploy or cache reset.
          globPatterns: [
            'assets/index-*.js',
            'assets/index-*.css',
            '**/*.{ico,png,svg,woff2}',
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: ['**/_IGNORE_session/**', '**/wa-sessions/**', '**/open-wa-session.*']
      }
    },
  };
});
