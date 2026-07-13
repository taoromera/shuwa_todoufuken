import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { processVideoFile } from './video-process.mjs';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const videosDir = resolve(rootDir, 'videos');
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

function json(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function uploadLimit() {
  let bytes = 0;

  return new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      if (bytes > MAX_UPLOAD_BYTES) {
        callback(new Error('動画ファイルは1 GB以下にしてください。'));
        return;
      }
      callback(null, chunk);
    },
  });
}

function validateOutputName(fileName) {
  return (
    fileName &&
    basename(fileName) === fileName &&
    /^[\p{L}\p{N}._-]+\.webm$/u.test(fileName)
  );
}

export function videoProcessPlugin() {
  return {
    name: 'process-uploaded-videos',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/videos/process', async (req, res) => {
        if (req.method !== 'POST') {
          json(res, 405, { error: 'POSTメソッドを使用してください。' });
          return;
        }

        const contentLength = Number(req.headers['content-length'] ?? 0);
        if (contentLength > MAX_UPLOAD_BYTES) {
          json(res, 413, { error: '動画ファイルは1 GB以下にしてください。' });
          return;
        }

        const requestUrl = new URL(req.url ?? '/', 'http://localhost');
        const fileName = requestUrl.searchParams.get('fileName') ?? '';
        if (!validateOutputName(fileName)) {
          json(res, 400, { error: '出力ファイル名が無効です。' });
          return;
        }

        let temporaryDir;

        try {
          temporaryDir = await mkdtemp(join(tmpdir(), 'shuwa-video-'));
          const inputPath = join(temporaryDir, 'upload');
          await pipeline(req, uploadLimit(), createWriteStream(inputPath));
          await mkdir(videosDir, { recursive: true });

          const loop = await processVideoFile(inputPath, resolve(videosDir, fileName));
          json(res, 200, {
            fileName,
            frameCount: loop.frameCount,
            duration: loop.duration,
          });
        } catch (error) {
          server.config.logger.error(error);
          json(res, 422, {
            error: error instanceof Error ? error.message : '動画の処理に失敗しました。',
          });
        } finally {
          if (temporaryDir) {
            await rm(temporaryDir, { recursive: true, force: true });
          }
        }
      });
    },
  };
}
