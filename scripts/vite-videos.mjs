import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const videosDir = resolve(rootDir, 'videos');
const mimeTypes = { '.webm': 'video/webm', '.mp4': 'video/mp4' };

function parseRange(rangeHeader, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;

  let start = match[1] === '' ? null : Number(match[1]);
  let end = match[2] === '' ? null : Number(match[2]);

  if (start == null && end == null) return null;
  if (start == null) {
    start = Math.max(size - end, 0);
    end = size - 1;
  } else if (end == null || end >= size) {
    end = size - 1;
  }

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
    return null;
  }

  return { start, end };
}

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

        const { size } = statSync(filePath);
        const ext = extname(filePath).toLowerCase();
        const contentType = mimeTypes[ext] ?? 'application/octet-stream';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-cache');

        if (req.method === 'HEAD' || req.method === 'OPTIONS') {
          res.setHeader('Content-Length', String(size));
          res.statusCode = 200;
          res.end();
          return;
        }

        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end();
          return;
        }

        const range = req.headers.range ? parseRange(req.headers.range, size) : null;

        if (req.headers.range && !range) {
          res.statusCode = 416;
          res.setHeader('Content-Range', `bytes */${size}`);
          res.end();
          return;
        }

        if (range) {
          const { start, end } = range;
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
          res.setHeader('Content-Length', String(end - start + 1));
          createReadStream(filePath, { start, end }).pipe(res);
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Length', String(size));
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
