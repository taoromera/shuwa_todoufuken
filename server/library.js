import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ObjectId } from 'mongodb';
import { db } from './db.js';

export const libraryVideos = db.collection('library_videos');

export const LIBRARY_KEY_PREFIX = 'library/';
export const VIDEO_FILE_PATTERN = /^[\p{L}\p{N}._-]+\.webm$/u;
/** File-name prefix for clips created through the app (as opposed to seeded originals). */
export const USER_VIDEO_PREFIX = 'u-';
/** Used instead of the bucket when storage isn't configured (local development). */
export const localVideosDir = resolve(fileURLToPath(new URL('../videos', import.meta.url)));

const MAX_TITLE_LENGTH = 100;
const MAX_ALIASES = 10;

/** NFKC + katakana→hiragana + lowercase, so 「アカ」 matches 「あか」. */
export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u30a1-\u30f6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .toLowerCase()
    .replace(/\s+/g, '');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildSearchFields({ title, caption, aliases = [] }) {
  return {
    searchTerms: [...new Set([title, caption, ...aliases].map(normalizeSearchText).filter(Boolean))],
  };
}

export async function ensureLibraryIndexes() {
  await libraryVideos.createIndex({ key: 1 }, { unique: true });
  await libraryVideos.createIndex({ file: 1 }, { unique: true });
  await libraryVideos.createIndex({ searchTerms: 1 });
}

/** `?v=` changes whenever the file is replaced, so browsers don't play a stale cached copy. */
export function videoPath(doc) {
  const version = doc.updatedAt ? `?v=${doc.updatedAt.getTime()}` : '';
  return `/videos/${doc.file}${version}`;
}

export function toApiVideo(doc) {
  return {
    id: doc._id.toHexString(),
    title: doc.title,
    caption: doc.caption,
    aliases: doc.aliases ?? [],
    video: videoPath(doc),
    source: doc.source,
    createdAt: doc.createdAt,
  };
}

function rankMatch(doc, query) {
  const terms = doc.searchTerms ?? [];
  if (terms.includes(query)) return 0;
  if (terms.some((term) => term.startsWith(query))) return 1;
  return 2;
}

export async function searchLibrary(query, { limit = 50 } = {}) {
  const normalized = normalizeSearchText(query);
  const filter = normalized
    ? { searchTerms: { $regex: escapeRegex(normalized) } }
    : {};

  const docs = await libraryVideos.find(filter).toArray();
  const collator = new Intl.Collator('ja');
  docs.sort(
    (a, b) =>
      (normalized ? rankMatch(a, normalized) - rankMatch(b, normalized) : 0) ||
      collator.compare(a.caption || a.title, b.caption || b.title),
  );

  return { total: docs.length, items: docs.slice(0, limit).map(toApiVideo) };
}

export async function createLibraryVideo({ file, labels, source, sourceUrl = null, createdBy, size }) {
  const now = new Date();
  const doc = {
    key: `${LIBRARY_KEY_PREFIX}${file}`,
    file,
    ...labels,
    aliases: labels.aliases ?? [],
    ...buildSearchFields(labels),
    source,
    sourceUrl,
    createdBy,
    size,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await libraryVideos.insertOne(doc);
  return { ...doc, _id: insertedId };
}

export async function findLibraryVideoByFile(file) {
  return libraryVideos.findOne({ file });
}

function parseId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

export function findLibraryVideoById(id) {
  const objectId = parseId(id);
  return objectId ? libraryVideos.findOne({ _id: objectId }) : null;
}

/** Validate admin edits; returns `{ error }` or the cleaned fields. */
export function validateLabels(input) {
  const title = String(input?.title ?? '').trim();
  const caption = String(input?.caption ?? '').trim();
  const aliases = (Array.isArray(input?.aliases) ? input.aliases : [])
    .map((alias) => String(alias).trim())
    .filter(Boolean);

  if (!title) return { error: '言葉を入力してください。' };
  if (title.length > MAX_TITLE_LENGTH || caption.length > MAX_TITLE_LENGTH) {
    return { error: `言葉と読みは${MAX_TITLE_LENGTH}文字以内にしてください。` };
  }
  if (aliases.length > MAX_ALIASES) {
    return { error: `別名は${MAX_ALIASES}個までです。` };
  }

  return { title, caption, aliases: [...new Set(aliases)] };
}

export async function updateLibraryLabels(id, labels) {
  const objectId = parseId(id);
  if (!objectId) return null;

  return libraryVideos.findOneAndUpdate(
    { _id: objectId },
    { $set: { ...labels, ...buildSearchFields(labels), updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
}

export async function deleteLibraryDoc(id) {
  const objectId = parseId(id);
  if (!objectId) return;
  await libraryVideos.deleteOne({ _id: objectId });
}
