import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const adminWordsPath = resolve(rootDir, 'src/data/admin-words.js');
const MAX_CONTENT_BYTES = 2 * 1024 * 1024;

function json(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function isValidAdminWordsFile(content) {
  return (
    typeof content === 'string' &&
    content.includes('export const ADMIN_WORDS') &&
    content.trimStart().startsWith('/**')
  );
}

export function adminWordsWritePlugin() {
  return {
    name: 'write-admin-words-file',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/admin-words', async (req, res) => {
        if (req.method !== 'PUT' && req.method !== 'POST') {
          json(res, 405, { error: 'PUTメソッドを使用してください。' });
          return;
        }

        try {
          const raw = await readBody(req);
          if (raw.byteLength > MAX_CONTENT_BYTES) {
            json(res, 413, { error: 'admin-words.js の内容が大きすぎます。' });
            return;
          }

          const content = raw.toString('utf8');
          if (!isValidAdminWordsFile(content)) {
            json(res, 400, { error: 'admin-words.js の形式が無効です。' });
            return;
          }

          await writeFile(adminWordsPath, content, 'utf8');
          json(res, 200, { ok: true, path: 'src/data/admin-words.js' });
        } catch (error) {
          server.config.logger.error(error);
          json(res, 500, {
            error:
              error instanceof Error
                ? error.message
                : 'admin-words.js の保存に失敗しました。',
          });
        }
      });
    },
  };
}
