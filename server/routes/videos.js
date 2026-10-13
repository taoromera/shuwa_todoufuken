import { Router } from 'express';
import { findLibraryVideoByFile, localVideosDir, VIDEO_FILE_PATTERN } from '../library.js';
import { getVideoUrl, storageEnabled } from '../storage.js';

export const videosRouter = Router();

videosRouter.get('/:file', async (req, res, next) => {
  try {
    const { file } = req.params;
    if (!VIDEO_FILE_PATTERN.test(file)) {
      res.sendStatus(404);
      return;
    }

    if (!storageEnabled) {
      res.sendFile(file, { root: localVideosDir, headers: { 'Cache-Control': 'no-cache' } }, (error) => {
        if (error && !res.headersSent) res.sendStatus(404);
      });
      return;
    }

    const doc = await findLibraryVideoByFile(file);
    if (!doc) {
      res.sendStatus(404);
      return;
    }

    // HEAD is used for availability checks; answering it here avoids a
    // cross-origin redirect that fetch() would reject without bucket CORS.
    if (req.method === 'HEAD') {
      res.type('video/webm').status(200).end();
      return;
    }

    const { url, expiresAt } = await getVideoUrl(doc.key);
    const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000) - 60 * 60);
    res.setHeader('Cache-Control', `private, max-age=${maxAge}`);
    res.redirect(302, url);
  } catch (error) {
    next(error);
  }
});
