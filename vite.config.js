import { defineConfig } from 'vite';
import { videoProcessPlugin } from './scripts/vite-video-process.mjs';
import { videosPlugin } from './scripts/vite-videos.mjs';
import { wordsWritePlugin } from './scripts/vite-words-write.mjs';

export default defineConfig({
  base: './',
  plugins: [videoProcessPlugin(), videosPlugin(), wordsWritePlugin()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        manage: 'manage.html',
      },
    },
  },
});
