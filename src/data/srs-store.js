/**
 * Browser-local SRS state for admin flashcards only (SM-2).
 * Not used by the class home page.
 */

const STORAGE_KEY = 'shuwa-admin-srs-v1';

export const RATINGS = {
  AGAIN: 'again',
  HARD: 'hard',
  GOOD: 'good',
  EASY: 'easy',
};

function nowMs() {
  return Date.now();
}

function daysToMs(days) {
  return days * 24 * 60 * 60 * 1000;
}

function createDefaultEntry() {
  return {
    ease: 2.5,
    interval: 0,
    repetitions: 0,
    due: 0,
  };
}

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

export function isDue(wordId, map = loadSrsMap(), at = nowMs()) {
  const entry = map[wordId];
  if (!entry) return false;
  return entry.due <= at;
}

/**
 * Build today's review queue: due cards first (oldest due), then new cards.
 */
export function buildReviewQueue(words, getId, { newLimit = 20 } = {}) {
  const map = loadSrsMap();
  const at = nowMs();
  const due = [];
  const fresh = [];

  for (const word of words) {
    const id = getId(word);
    if (isNewCard(id, map)) {
      fresh.push(word);
    } else if (isDue(id, map, at)) {
      due.push(word);
    }
  }

  due.sort((a, b) => {
    const aDue = map[getId(a)].due;
    const bDue = map[getId(b)].due;
    return aDue - bDue;
  });

  return [...due, ...fresh.slice(0, newLimit)];
}

export function countSrsStats(words, getId) {
  const map = loadSrsMap();
  const at = nowMs();
  let due = 0;
  let fresh = 0;
  let learning = 0;

  for (const word of words) {
    const id = getId(word);
    if (isNewCard(id, map)) {
      fresh += 1;
    } else if (isDue(id, map, at)) {
      due += 1;
    } else {
      learning += 1;
    }
  }

  return { due, new: fresh, later: learning, total: words.length };
}

/**
 * Apply an SM-2 rating and persist. Returns the updated entry.
 */
export function reviewCard(wordId, rating) {
  console.log('[admin-srs]', 'reviewCard', { wordId, rating });
  const map = loadSrsMap();
  const prev = map[wordId] ? { ...map[wordId] } : createDefaultEntry();
  const next = schedule(prev, rating);
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

function schedule(entry, rating) {
  let { ease, interval, repetitions } = entry;
  const at = nowMs();

  if (rating === RATINGS.AGAIN) {
    repetitions = 0;
    interval = 0;
    ease = Math.max(1.3, ease - 0.2);
    return {
      ease,
      interval,
      repetitions,
      due: at + daysToMs(0) + 10 * 60 * 1000,
    };
  }

  if (rating === RATINGS.HARD) {
    ease = Math.max(1.3, ease - 0.15);
    if (repetitions === 0) {
      interval = 1;
      repetitions = 1;
    } else {
      interval = Math.max(1, Math.round(interval * 1.2));
      repetitions += 1;
    }
    return { ease, interval, repetitions, due: at + daysToMs(interval) };
  }

  if (rating === RATINGS.EASY) {
    ease += 0.15;
    if (repetitions === 0) {
      interval = 4;
      repetitions = 1;
    } else if (repetitions === 1) {
      interval = Math.max(4, Math.round(interval * ease * 1.3));
      repetitions = 2;
    } else {
      interval = Math.max(1, Math.round(interval * ease * 1.3));
      repetitions += 1;
    }
    return { ease, interval, repetitions, due: at + daysToMs(interval) };
  }

  // GOOD (default)
  if (repetitions === 0) {
    interval = 1;
    repetitions = 1;
  } else if (repetitions === 1) {
    interval = 6;
    repetitions = 2;
  } else {
    interval = Math.max(1, Math.round(interval * ease));
    repetitions += 1;
  }

  return { ease, interval, repetitions, due: at + daysToMs(interval) };
}

export function formatDueLabel(entry, at = nowMs()) {
  if (!entry) return '新規';
  const diff = entry.due - at;
  if (diff <= 0) return '復習';
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `${minutes}分後`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}時間後`;
  const days = Math.round(hours / 24);
  return `${days}日後`;
}
