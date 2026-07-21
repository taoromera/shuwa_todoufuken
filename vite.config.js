import { defineConfig } from 'vite';
import { adminWordsWritePlugin } from './scripts/vite-admin-words-write.mjs';
import { videoProcessPlugin } from './scripts/vite-video-process.mjs';
import { videosPlugin } from './scripts/vite-videos.mjs';
import { wordsWritePlugin } from './scripts/vite-words-write.mjs';

function adminRoutePlugin() {
  return {
    name: 'admin-route',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/admin' || req.url?.startsWith('/admin?')) {
          req.url = '/admin.html';
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [
    adminRoutePlugin(),
    videoProcessPlugin(),
    videosPlugin(),
    wordsWritePlugin(),
    adminWordsWritePlugin(),
  ],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        manage: 'manage.html',
        admin: 'admin.html',
      },
    },
  },
});
