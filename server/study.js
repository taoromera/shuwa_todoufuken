import { ObjectId } from 'mongodb';
import { createEmptyCard, fsrs, generatorParameters, Rating, State } from 'ts-fsrs';
import { attachVideos, cards, reviewLogs } from './cards.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const GRADES = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];
const NEW_CARDS_PER_DAY = 500;

const scheduler = fsrs(
  generatorParameters({ request_retention: 0.9, enable_fuzz: true, enable_short_term: true }),
);

function studyError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * The client sends the start of its local study day (4:00 local time) so the
 * server needs no timezone handling. Anything implausible is rejected.
 */
export function parseDayStart(value, now = Date.now()) {
  const dayStart = Number(value);
  if (!Number.isFinite(dayStart) || dayStart > now || dayStart < now - DAY_MS - 60 * 60 * 1000) {
    throw studyError('学習日の指定が正しくありません。ページを再読み込みしてください。', 400);
  }
  return new Date(dayStart);
}

function stateName(srs) {
  if (!srs || srs.state === State.New) return 'new';
  return srs.state === State.Review ? 'review' : 'learning';
}

function toStudyItem(apiCard, doc) {
  return { ...apiCard, state: stateName(doc.srs) };
}

async function toStudyItems(docs) {
  const apiCards = await attachVideos(docs);
  return apiCards
    .map((card, index) => toStudyItem(card, docs[index]))
    .filter((item) => item.video);
}

/** Today's queue: everything due before the study day ends, then new cards up to the daily limit. */
export async function buildSession(userId, dayStart) {
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  const unseen = { userId, srs: { $exists: false } };

  const [dueDocs, newStudiedToday, unseenCount] = await Promise.all([
    cards.find({ userId, 'srs.due': { $lt: dayEnd } }).sort({ 'srs.due': 1 }).toArray(),
    reviewLogs.countDocuments({ userId, review: { $gte: dayStart }, state: State.New }),
    cards.countDocuments(unseen),
  ]);
  const newLimit = Math.max(0, NEW_CARDS_PER_DAY - newStudiedToday);
  const newDocs =
    newLimit > 0 ? await cards.find(unseen).sort({ createdAt: 1 }).limit(newLimit).toArray() : [];

  const items = await toStudyItems([...dueDocs, ...newDocs]);
  const next = items.length
    ? null
    : await cards.find({ userId, 'srs.due': { $gte: dayEnd } }).sort({ 'srs.due': 1 }).limit(1).next();

  return {
    dayEnd,
    newPerDay: NEW_CARDS_PER_DAY,
    items,
    newStudiedToday,
    newLeftInDeck: unseenCount - newDocs.length,
    nextDue: next?.srs.due ?? null,
  };
}

export async function reviewCard(userId, cardId, rating) {
  if (!GRADES.includes(rating)) throw studyError('評価が正しくありません。', 400);
  const id = ObjectId.isValid(cardId) ? new ObjectId(cardId) : null;
  const doc = id ? await cards.findOne({ _id: id, userId }) : null;
  if (!doc) throw studyError('カードが見つかりません。', 404);

  const now = new Date();
  const { card: srs, log } = scheduler.next(doc.srs ?? createEmptyCard(now), now, rating);

  // Guards against a double-submitted rating applying twice.
  const unchanged = doc.srs ? { 'srs.reps': doc.srs.reps } : { srs: { $exists: false } };
  const updated = await cards.findOneAndUpdate(
    { _id: id, userId, ...unchanged },
    { $set: { srs } },
    { returnDocument: 'after' },
  );
  if (!updated) throw studyError('このカードはすでに評価されています。', 409);

  await reviewLogs.insertOne({ userId, cardId: id, ...log });
  const [item] = await toStudyItems([updated]);
  return item ?? null;
}
