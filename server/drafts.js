import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DRAFTS_DIR = join(tmpdir(), 'shuwa-drafts');
const DRAFT_TTL_MS = 60 * 60 * 1000;
const MAX_DRAFTS_PER_USER = 3;
const MAX_CONCURRENT_JOBS = 2;

/** In-memory: drafts only live on this server instance. */
const drafts = new Map();
const busyUsers = new Set();

let activeJobs = 0;
const jobQueue = [];

export async function initDrafts() {
  await rm(DRAFTS_DIR, { recursive: true, force: true });
  await mkdir(DRAFTS_DIR, { recursive: true });
  setInterval(() => {
    const cutoff = Date.now() - DRAFT_TTL_MS;
    for (const draft of drafts.values()) {
      if (draft.createdAt < cutoff) void removeDraft(draft.id);
    }
  }, 5 * 60 * 1000).unref();
}

export async function createDraftDir(userId) {
  const owned = [...drafts.values()]
    .filter((draft) => draft.userId === userId)
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const draft of owned.slice(0, Math.max(0, owned.length - MAX_DRAFTS_PER_USER + 1))) {
    await removeDraft(draft.id);
  }

  const id = randomUUID();
  const dir = join(DRAFTS_DIR, id);
  await mkdir(dir, { recursive: true });
  return { id, dir };
}

export function saveDraft(draft) {
  drafts.set(draft.id, { ...draft, createdAt: Date.now() });
  return drafts.get(draft.id);
}

export function getDraft(id, userId) {
  const draft = drafts.get(id);
  return draft && draft.userId === userId ? draft : null;
}

export async function removeDraft(id) {
  drafts.delete(id);
  await rm(join(DRAFTS_DIR, id), { recursive: true, force: true });
}

export async function discardDir(dir) {
  await rm(dir, { recursive: true, force: true });
}

export function toApiDraft(draft) {
  return {
    id: draft.id,
    source: draft.source,
    duration: draft.duration,
    width: draft.width,
    height: draft.height,
    suggestedStart: draft.suggestedStart ?? 0,
    suggestedEnd: draft.suggestedEnd ?? draft.duration,
    preview: `/api/drafts/${draft.id}/preview`,
  };
}

/**
 * Run a heavy media job: one at a time per user, MAX_CONCURRENT_JOBS globally.
 * Throws a user-facing error if this user already has a job running.
 */
export async function runMediaJob(userId, job) {
  if (busyUsers.has(userId)) {
    const error = new Error('別の動画を処理中です。終わるまでお待ちください。');
    error.status = 429;
    throw error;
  }
  busyUsers.add(userId);

  try {
    if (activeJobs >= MAX_CONCURRENT_JOBS) {
      await new Promise((resolve) => jobQueue.push(resolve));
    }
    activeJobs += 1;
    try {
      return await job();
    } finally {
      activeJobs -= 1;
      jobQueue.shift()?.();
    }
  } finally {
    busyUsers.delete(userId);
  }
}
