import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import express, { Router } from 'express';
import { createCard, validateCardFields } from '../cards.js';
import {
  createDraftDir,
  discardDir,
  getDraft,
  removeDraft,
  runMediaJob,
  saveDraft,
  toApiDraft,
} from '../drafts.js';
import {
  createLibraryVideo,
  LIBRARY_KEY_PREFIX,
  localVideosDir,
  USER_VIDEO_PREFIX,
} from '../library.js';
import { downloadYoutubeSection, encodeClip, makePreview, probeVideo } from '../media.js';
import { putVideo, storageEnabled } from '../storage.js';
import { sendError } from './respond.js';

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const MAX_UPLOAD_DURATION_S = 3 * 60;
const MAX_YOUTUBE_SECTION_S = 60;
const MIN_CLIP_S = 0.3;
const MAX_CLIP_S = 30;
const MIN_CROP_SIZE = 0.05;
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function ffmpegFailure(error) {
  if (error.details === undefined) return error;
  console.error('[ffmpeg]', error.details);
  return new UserError('動画を変換できませんでした。別の動画をお試しください。', 422);
}

function userId(res) {
  return res.locals.session.user.id;
}

function byteLimit(maxBytes) {
  let bytes = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        callback(new UserError('動画ファイルは200MB以下にしてください。', 413));
        return;
      }
      callback(null, chunk);
    },
  });
}

/** Probe the source, build the editor preview, and register the draft. */
async function prepareDraft({ id, dir, sourcePath, owner, source, sourceUrl, maxDuration }) {
  const info = await probeVideo(sourcePath);
  if (!info) throw new UserError('動画として読み込めませんでした。別のファイルをお試しください。');
  if (info.duration > maxDuration + 1) {
    throw new UserError(`動画は${Math.round(maxDuration / 60)}分以内のものを選んでください。`);
  }

  const previewPath = join(dir, 'preview.mp4');
  await makePreview(sourcePath, previewPath).catch((error) => {
    throw ffmpegFailure(error);
  });

  return saveDraft({
    id,
    userId: owner,
    dir,
    sourcePath,
    previewPath,
    source,
    sourceUrl,
    ...info,
  });
}

export function parseYoutubeId(value) {
  let url;
  try {
    url = new URL(String(value ?? '').trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id = null;
  if (host === 'youtu.be') {
    id = url.pathname.slice(1).split('/')[0];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id =
      url.searchParams.get('v') ??
      url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/]+)/)?.[1] ??
      null;
  }
  return id && YOUTUBE_ID_PATTERN.test(id) ? id : null;
}

function parseClip(body, duration) {
  const start = Number(body?.start);
  const end = Number(body?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > duration + 0.05) {
    throw new UserError('開始・終了位置が正しくありません。');
  }
  if (end - start < MIN_CLIP_S) throw new UserError('切り出す範囲が短すぎます。');
  if (end - start > MAX_CLIP_S) throw new UserError(`切り出す範囲は${MAX_CLIP_S}秒以内にしてください。`);

  let crop = null;
  if (body?.crop) {
    const { x, y, w, h } = Object.fromEntries(
      ['x', 'y', 'w', 'h'].map((key) => [key, Number(body.crop[key])]),
    );
    const valid =
      [x, y, w, h].every(Number.isFinite) &&
      x >= 0 && y >= 0 && w >= MIN_CROP_SIZE && h >= MIN_CROP_SIZE &&
      x + w <= 1.001 && y + h <= 1.001;
    if (!valid) throw new UserError('切り抜き範囲が正しくありません。');
    const isFullFrame = x < 0.005 && y < 0.005 && w > 0.995 && h > 0.995;
    crop = isFullFrame ? null : { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) };
  }

  return { start, end: Math.min(end, duration), crop };
}

async function storeVideo(file, outputPath) {
  if (storageEnabled) {
    const body = await readFile(outputPath);
    await putVideo(`${LIBRARY_KEY_PREFIX}${file}`, body, { contentLength: body.length });
    return body.length;
  }
  await mkdir(localVideosDir, { recursive: true });
  await copyFile(outputPath, join(localVideosDir, file));
  return (await stat(outputPath)).size;
}

export const draftsRouter = Router();

draftsRouter.post('/upload', async (req, res, next) => {
  const owner = userId(res);
  let dirToDiscard = null;

  try {
    const contentType = String(req.headers['content-type'] ?? '');
    if (!/^(video\/|application\/octet-stream)/.test(contentType)) {
      throw new UserError('動画ファイルを選んでください。', 415);
    }
    if (Number(req.headers['content-length'] ?? 0) > MAX_UPLOAD_BYTES) {
      throw new UserError('動画ファイルは200MB以下にしてください。', 413);
    }

    const draft = await runMediaJob(owner, async () => {
      const { id, dir } = await createDraftDir(owner);
      dirToDiscard = dir;
      const sourcePath = join(dir, 'source.upload');
      await pipeline(req, byteLimit(MAX_UPLOAD_BYTES), createWriteStream(sourcePath));
      return prepareDraft({
        id,
        dir,
        sourcePath,
        owner,
        source: 'upload',
        sourceUrl: null,
        maxDuration: MAX_UPLOAD_DURATION_S,
      });
    });
    dirToDiscard = null;
    res.status(201).json({ draft: toApiDraft(draft) });
  } catch (error) {
    req.resume();
    sendError(res, next, error);
  } finally {
    if (dirToDiscard) await discardDir(dirToDiscard);
  }
});

draftsRouter.post('/youtube', express.json({ limit: '4kb' }), async (req, res, next) => {
  const owner = userId(res);
  let dirToDiscard = null;

  try {
    const videoId = parseYoutubeId(req.body?.url);
    if (!videoId) throw new UserError('YouTube の動画URLを入力してください。');

    const start = Number(req.body?.start);
    const end = Number(req.body?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
      throw new UserError('開始・終了位置を指定してください。');
    }
    if (end - start > MAX_YOUTUBE_SECTION_S) {
      throw new UserError(`切り出す範囲は${MAX_YOUTUBE_SECTION_S}秒以内にしてください。`);
    }

    const draft = await runMediaJob(owner, async () => {
      const { id, dir } = await createDraftDir(owner);
      dirToDiscard = dir;
      const sourcePath = await downloadYoutubeSection(videoId, start, end, dir);
      return prepareDraft({
        id,
        dir,
        sourcePath,
        owner,
        source: 'youtube',
        sourceUrl: `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(start)}s`,
        maxDuration: MAX_YOUTUBE_SECTION_S + 5,
      });
    });
    dirToDiscard = null;
    res.status(201).json({ draft: toApiDraft(draft) });
  } catch (error) {
    sendError(res, next, error);
  } finally {
    if (dirToDiscard) await discardDir(dirToDiscard);
  }
});

draftsRouter.get('/:id/preview', (req, res) => {
  const draft = getDraft(req.params.id, userId(res));
  if (!draft) {
    res.sendStatus(404);
    return;
  }
  res.sendFile(draft.previewPath, { headers: { 'Cache-Control': 'private, no-store' } });
});

draftsRouter.delete('/:id', async (req, res) => {
  if (getDraft(req.params.id, userId(res))) await removeDraft(req.params.id);
  res.json({ ok: true });
});

draftsRouter.post('/:id/finalize', express.json({ limit: '16kb' }), async (req, res, next) => {
  const owner = userId(res);

  try {
    const draft = getDraft(req.params.id, owner);
    if (!draft) throw new UserError('下書きの有効期限が切れました。もう一度動画を選んでください。', 404);

    const fields = validateCardFields(req.body);
    if (fields.error) throw new UserError(fields.error);
    const clip = parseClip(req.body, draft.duration);

    const card = await runMediaJob(owner, async () => {
      const file = `${USER_VIDEO_PREFIX}${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.webm`;
      const outputPath = join(draft.dir, file);
      await encodeClip(draft.sourcePath, outputPath, clip).catch((error) => {
        throw ffmpegFailure(error);
      });
      const size = await storeVideo(file, outputPath);

      const video = await createLibraryVideo({
        file,
        labels: { title: fields.title, caption: fields.caption },
        source: draft.source,
        sourceUrl: draft.sourceUrl,
        createdBy: owner,
        size,
      });
      return createCard(owner, video._id, fields);
    });

    await removeDraft(draft.id);
    res.status(201).json({ card });
  } catch (error) {
    sendError(res, next, error);
  }
});
