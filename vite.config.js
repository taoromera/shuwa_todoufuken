import { defineConfig } from 'vite';
import { videoProcessPlugin } from './scripts/vite-video-process.mjs';
import { videosPlugin } from './scripts/vite-videos.mjs';

export default defineConfig({
  base: './',
  plugins: [videoProcessPlugin(), videosPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        manage: 'manage.html',
      },
    },
  },
});
