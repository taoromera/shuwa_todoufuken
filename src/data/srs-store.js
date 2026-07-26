/**
 * Browser-local ease tracking for admin flashcards only.
 * No due-date scheduling: each session reviews every card,
 * ordered from lowest ease (hardest) to highest.
 * Not used by the class home page.
 */

const STORAGE_KEY = 'shuwa-admin-srs-v1';

const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;

export const RATINGS = {
  AGAIN: 'again',
  EASY: 'easy',
};

const EASE_DELTAS = {
  [RATINGS.AGAIN]: -0.2,
  [RATINGS.EASY]: 0.15,
};

export function loadSrsMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveSrsMap(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getSrsEntry(wordId, map = loadSrsMap()) {
  return map[wordId] ?? null;
}

export function isNewCard(wordId, map = loadSrsMap()) {
  return !map[wordId];
}

export function getEase(wordId, map = loadSrsMap()) {
  return map[wordId]?.ease ?? DEFAULT_EASE;
}

/**
 * Build the review queue: every card, lowest ease first.
 * Cards with equal ease (including new cards) are shuffled.
 */
export function buildReviewQueue(words, getId) {
  const map = loadSrsMap();
  const shuffled = [...words];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  // Stable sort keeps the shuffled order within equal-ease groups.
  shuffled.sort((a, b) => getEase(getId(a), map) - getEase(getId(b), map));
  return shuffled;
}

export function countSrsStats(words, getId) {
  const map = loadSrsMap();
  let fresh = 0;
  let hard = 0;

  for (const word of words) {
    const id = getId(word);
    if (isNewCard(id, map)) {
      fresh += 1;
    } else if (getEase(id, map) < DEFAULT_EASE) {
      hard += 1;
    }
  }

  return { new: fresh, hard, total: words.length };
}

/**
 * Apply a rating: adjust the card's ease and persist. Returns the updated entry.
 */
export function reviewCard(wordId, rating) {
  console.log('[admin-srs]', 'reviewCard', { wordId, rating });
  const map = loadSrsMap();
  const prev = map[wordId];
  const ease = prev?.ease ?? DEFAULT_EASE;
  const delta = EASE_DELTAS[rating] ?? 0;
  const next = {
    ease: Math.max(MIN_EASE, ease + delta),
    reviews: (prev?.reviews ?? prev?.repetitions ?? 0) + 1,
    lastReviewed: Date.now(),
  };
  map[wordId] = next;
  saveSrsMap(map);
  console.log('[admin-srs]', 'reviewCard:saved', { wordId, rating, prev, next });
  return next;
}

export function removeSrsEntry(wordId) {
  const map = loadSrsMap();
  if (!(wordId in map)) return;
  delete map[wordId];
  saveSrsMap(map);
}

export function formatEaseLabel(entry) {
  if (!entry) return '新規';
  const ease = entry.ease ?? DEFAULT_EASE;
  const reviews = entry.reviews ?? 0;
  return `習熟度 ${ease.toFixed(2)}${reviews > 0 ? `・${reviews}回` : ''}`;
}
