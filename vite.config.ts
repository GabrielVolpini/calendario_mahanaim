import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// App instalável (PWA): o plugin gera o manifest e o service worker no build.
// Ícones: `node scripts/gerar-icones.ts` (saem em public/icons/).
export default defineConfig({
  plugins: [
    VitePWA({
      // 'prompt': a versão nova só entra quando a pessoa toca em "Atualizar",
      // para não recarregar a tela no meio de uma ata ou de um formulário.
      registerType: 'prompt',
      injectRegister: false, // o registro fica em src/pwa.ts
      includeAssets: ['logo-mahanaim.jpg', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'],
      manifest: {
        id: '/',
        name: 'Mahanaim · Gestão da liderança',
        short_name: 'Mahanaim',
        description: 'Calendário, solicitações e atas da liderança da Igreja Internacional Mahanaim.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0B1650',
        theme_color: '#0B1650',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Guarda a "casca" do app (HTML, JS, CSS, ícones) para abrir rápido e sem internet.
        globPatterns: ['**/*.{js,css,html,png,jpg,svg,woff2}'],
        // Rotas como /atas e /users abrem o index.html, como o rewrite da Vercel.
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // Os dados do Supabase NÃO ficam em cache: sempre vêm do banco (e do RLS).
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-arquivos',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
