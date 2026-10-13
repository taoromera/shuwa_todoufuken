import { ObjectId } from 'mongodb';
import { db } from './db.js';
import { libraryVideos, videoPath } from './library.js';

export const cards = db.collection('cards');
/** One document per rating; FSRS state itself lives on the card (`srs`). */
export const reviewLogs = db.collection('review_logs');

const MAX_LABEL_LENGTH = 100;
const MAX_NOTES_LENGTH = 1000;

export async function ensureCardIndexes() {
  await cards.createIndex({ userId: 1, createdAt: -1 });
  await cards.createIndex({ userId: 1, libraryVideoId: 1 }, { unique: true });
  await cards.createIndex({ libraryVideoId: 1 });
  await cards.createIndex({ userId: 1, 'srs.due': 1 });
  await reviewLogs.createIndex({ userId: 1, review: -1 });
  await reviewLogs.createIndex({ cardId: 1 });
}

/** Validate user-editable card fields; returns `{ error }` or the cleaned fields. */
export function validateCardFields(input) {
  const title = String(input?.title ?? '').trim();
  const caption = String(input?.caption ?? '').trim();
  const notes = String(input?.notes ?? '').trim();

  if (!title) return { error: '言葉を入力してください。' };
  if (title.length > MAX_LABEL_LENGTH || caption.length > MAX_LABEL_LENGTH) {
    return { error: `言葉と読みは${MAX_LABEL_LENGTH}文字以内にしてください。` };
  }
  if (notes.length > MAX_NOTES_LENGTH) {
    return { error: `メモは${MAX_NOTES_LENGTH}文字以内にしてください。` };
  }
  return { title, caption, notes };
}

function parseId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function toApiCard(card, video) {
  return {
    id: card._id.toHexString(),
    title: card.title,
    caption: card.caption,
    notes: card.notes,
    libraryVideoId: card.libraryVideoId.toHexString(),
    video: video ? videoPath(video) : null,
    createdAt: card.createdAt,
  };
}

export async function attachVideos(cardDocs) {
  const ids = [...new Set(cardDocs.map((card) => card.libraryVideoId.toHexString()))].map(
    (id) => new ObjectId(id),
  );
  const videos = await libraryVideos
    .find({ _id: { $in: ids } }, { projection: { file: 1, updatedAt: 1 } })
    .toArray();
  const byId = new Map(videos.map((video) => [video._id.toHexString(), video]));
  return cardDocs.map((card) => toApiCard(card, byId.get(card.libraryVideoId.toHexString())));
}

export async function listCards(userId) {
  const docs = await cards.find({ userId }).sort({ createdAt: -1 }).toArray();
  return attachVideos(docs);
}

export class DuplicateCardError extends Error {
  constructor() {
    super('この動画はすでに単語帳に入っています。');
    this.status = 409;
  }
}

export async function createCard(userId, libraryVideoId, fields) {
  const videoId = typeof libraryVideoId === 'string' ? parseId(libraryVideoId) : libraryVideoId;
  const video = videoId ? await libraryVideos.findOne({ _id: videoId }) : null;
  if (!video) {
    const error = new Error('動画が見つかりません。');
    error.status = 404;
    throw error;
  }

  const now = new Date();
  const doc = { userId, libraryVideoId: video._id, ...fields, createdAt: now, updatedAt: now };
  try {
    const { insertedId } = await cards.insertOne(doc);
    return toApiCard({ ...doc, _id: insertedId }, video);
  } catch (error) {
    if (error.code === 11000) throw new DuplicateCardError();
    throw error;
  }
}

export async function updateCard(userId, cardId, fields) {
  const id = parseId(cardId);
  if (!id) return null;
  const updated = await cards.findOneAndUpdate(
    { _id: id, userId },
    { $set: { ...fields, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!updated) return null;
  const [card] = await attachVideos([updated]);
  return card;
}

export async function deleteCard(userId, cardId) {
  const id = parseId(cardId);
  if (!id) return false;
  const { deletedCount } = await cards.deleteOne({ _id: id, userId });
  if (deletedCount === 1) await reviewLogs.deleteMany({ cardId: id });
  return deletedCount === 1;
}

export async function deleteCardsForUser(userId) {
  await cards.deleteMany({ userId });
  await reviewLogs.deleteMany({ userId });
}

export function countCardsForVideo(libraryVideoId) {
  return cards.countDocuments({ libraryVideoId });
}

export async function deleteCardsForVideo(libraryVideoId) {
  const ids = await cards.distinct('_id', { libraryVideoId });
  if (ids.length === 0) return 0;
  await reviewLogs.deleteMany({ cardId: { $in: ids } });
  const { deletedCount } = await cards.deleteMany({ _id: { $in: ids } });
  return deletedCount;
}
