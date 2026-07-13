import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const videosDir = resolve(rootDir, 'videos');
const mimeTypes = { '.webm': 'video/webm', '.mp4': 'video/mp4' };

export function videosPlugin() {
  return {
    name: 'serve-videos',
    configureServer(server) {
      server.middlewares.use('/videos', (req, res, next) => {
        const fileName = decodeURIComponent(req.url?.split('?')[0] ?? '').replace(/^\//, '');
        if (!fileName || fileName.includes('..')) {
          next();
          return;
        }

        const filePath = resolve(videosDir, fileName);
        if (!existsSync(filePath) || !statSync(filePath).isFile()) {
          next();
          return;
        }

        const ext = extname(filePath).toLowerCase();
        res.setHeader('Content-Type', mimeTypes[ext] ?? 'application/octet-stream');
        createReadStream(filePath).pipe(res);
      });
    },
    closeBundle() {
      if (existsSync(videosDir)) {
        cpSync(videosDir, resolve(rootDir, 'dist/videos'), { recursive: true });
      }
    },
  };
}
