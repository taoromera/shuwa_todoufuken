import { createServer as createHttpServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { auth, ROLES } from './auth.js';
import { env } from './env.js';
import { ensureCardIndexes } from './cards.js';
import { initDrafts } from './drafts.js';
import { ensureLibraryIndexes } from './library.js';
import { cardsRouter } from './routes/cards.js';
import { draftsRouter } from './routes/drafts.js';
import { libraryRouter } from './routes/library.js';
import { studyRouter } from './routes/study.js';
import { videosRouter } from './routes/videos.js';
import { storageEnabled } from './storage.js';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const distDir = resolve(rootDir, 'dist');

const ACCESS = {
  PUBLIC: 'public',
  GUEST: 'guest',
  USER: 'user',
  ADMIN: 'admin',
};

const PAGES = {
  '/': { file: 'index.html', access: ACCESS.USER },
  '/login': { file: 'login.html', access: ACCESS.GUEST },
  '/signup': { file: 'signup.html', access: ACCESS.GUEST },
  '/forgot-password': { file: 'forgot-password.html', access: ACCESS.GUEST },
  '/reset-password': { file: 'reset-password.html', access: ACCESS.PUBLIC },
  '/account': { file: 'account.html', access: ACCESS.USER },
  '/library': { file: 'library.html', access: ACCESS.USER },
  '/deck': { file: 'deck.html', access: ACCESS.USER },
  '/deck/add': { file: 'add-card.html', access: ACCESS.USER },
};

const PATH_BY_FILE = new Map(
  Object.entries(PAGES).map(([path, page]) => [`/${page.file}`, path]),
);

async function getSession(req) {
  return auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
}

function queryString(req) {
  const index = req.originalUrl.indexOf('?');
  return index === -1 ? '' : req.originalUrl.slice(index);
}

function loginRedirect(req, res) {
  const next = encodeURIComponent(req.originalUrl);
  res.redirect(302, `/login?next=${next}`);
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

app.all('/api/auth/{*splat}', toNodeHandler(auth));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.use((req, res, next) => {
  const cleanPath = PATH_BY_FILE.get(req.path);
  if (cleanPath && (req.method === 'GET' || req.method === 'HEAD')) {
    res.redirect(301, `${cleanPath}${queryString(req)}`);
    return;
  }
  next();
});

app.use(async (req, res, next) => {
  try {
    const page = PAGES[req.path];
    if (page && (req.method === 'GET' || req.method === 'HEAD')) {
      const session = page.access === ACCESS.PUBLIC ? null : await getSession(req);

      if (page.access === ACCESS.GUEST && session) {
        res.redirect(302, '/');
        return;
      }
      if ((page.access === ACCESS.USER || page.access === ACCESS.ADMIN) && !session) {
        loginRedirect(req, res);
        return;
      }
      if (page.access === ACCESS.ADMIN && session.user.role !== ROLES.ADMIN) {
        res.redirect(302, '/');
        return;
      }

      res.locals.pageFile = page.file;
      next();
      return;
    }

    if (req.path.startsWith('/api/') || req.path.startsWith('/videos/')) {
      const session = await getSession(req);
      if (!session) {
        res.status(401).json({ error: 'ログインが必要です。' });
        return;
      }
      res.locals.session = session;
    }

    next();
  } catch (error) {
    next(error);
  }
});

app.use('/videos', videosRouter);
app.use('/api/library', libraryRouter);
app.use('/api/cards', cardsRouter);
app.use('/api/drafts', draftsRouter);
app.use('/api/study', studyRouter);

await ensureLibraryIndexes();
await ensureCardIndexes();
await initDrafts();
if (!storageEnabled) {
  console.warn('[storage] S3_* 未設定のため、動画はローカルの videos/ フォルダから配信します。');
}

const httpServer = createHttpServer(app);

if (env.isProduction) {
  app.use((req, res, next) => {
    if (!res.locals.pageFile) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(resolve(distDir, res.locals.pageFile));
  });
  app.use(
    express.static(distDir, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${resolve(distDir, 'assets')}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    root: rootDir,
    appType: 'mpa',
    server: { middlewareMode: true, hmr: { server: httpServer } },
  });
  app.use((req, res, next) => {
    if (res.locals.pageFile) {
      req.url = `/${res.locals.pageFile}${queryString(req)}`;
    }
    next();
  });
  app.use(vite.middlewares);
}

app.use((_req, res) => {
  res.status(404).send('Not Found');
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'サーバーエラーが発生しました。' });
});

httpServer.listen(env.port, () => {
  console.log(`手話単語帳: ${env.baseUrl} (port ${env.port}, ${env.isProduction ? 'production' : 'development'})`);
});
