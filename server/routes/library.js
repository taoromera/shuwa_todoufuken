import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import express, { Router } from 'express';
import { ROLES } from '../auth.js';
import { deleteCardsForVideo } from '../cards.js';
import {
  deleteLibraryDoc,
  findLibraryVideoById,
  localVideosDir,
  searchLibrary,
  toApiVideo,
  updateLibraryLabels,
  USER_VIDEO_PREFIX,
  validateLabels,
} from '../library.js';
import { deleteVideo, storageEnabled } from '../storage.js';

const MAX_LIMIT = 100;

function requireAdmin(_req, res, next) {
  if (res.locals.session?.user.role !== ROLES.ADMIN) {
    res.status(403).json({ error: '管理者のみ利用できます。' });
    return;
  }
  next();
}

export const libraryRouter = Router();
libraryRouter.use(express.json({ limit: '16kb' }));

libraryRouter.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, MAX_LIMIT);
    res.json(await searchLibrary(String(req.query.q ?? ''), { limit }));
  } catch (error) {
    next(error);
  }
});

libraryRouter.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const labels = validateLabels(req.body);
    if (labels.error) {
      res.status(400).json({ error: labels.error });
      return;
    }

    const updated = await updateLibraryLabels(req.params.id, labels);
    if (!updated) {
      res.status(404).json({ error: '動画が見つかりません。' });
      return;
    }
    res.json({ item: toApiVideo(updated) });
  } catch (error) {
    next(error);
  }
});

libraryRouter.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const doc = await findLibraryVideoById(req.params.id);
    if (!doc) {
      res.status(404).json({ error: '動画が見つかりません。' });
      return;
    }

    if (storageEnabled) {
      await deleteVideo(doc.key);
    } else if (doc.file.startsWith(USER_VIDEO_PREFIX)) {
      // Seeded originals in local videos/ are the only copy, so only app-made clips are removed.
      await rm(join(localVideosDir, doc.file), { force: true });
    }
    await deleteLibraryDoc(req.params.id);
    const deletedCards = await deleteCardsForVideo(doc._id);
    res.json({ ok: true, deletedCards });
  } catch (error) {
    next(error);
  }
});
