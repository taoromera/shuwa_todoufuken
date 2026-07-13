import { WORDS as DEFAULT_WORDS } from './words.js';

const STORAGE_KEY = 'shuwa-words-v1';

function readStoredWords() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getWords() {
  return readStoredWords() ?? [...DEFAULT_WORDS];
}

export function saveWords(words) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
}

export function hasCustomWords() {
  return readStoredWords() !== null;
}

export function resetWords() {
  localStorage.removeItem(STORAGE_KEY);
  return [...DEFAULT_WORDS];
}

export function getWordsForLesson(lessonId) {
  const id = typeof lessonId === 'string' ? Number(lessonId) : lessonId;
  return getWords().filter((word) => word.lesson === id);
}

export function addWord(word) {
  const words = getWords();
  const duplicate = words.some(
    (entry) => entry.lesson === word.lesson && entry.code === word.code,
  );

  if (duplicate) {
    throw new Error(`「${word.title}」はこのレッスンに既に追加されています。`);
  }

  words.push(word);
  saveWords(words);
  return words;
}

export function removeWord(lessonId, code) {
  const id = typeof lessonId === 'string' ? Number(lessonId) : lessonId;
  const words = getWords().filter((word) => !(word.lesson === id && word.code === code));
  saveWords(words);
  return words;
}

function formatWordEntry(word) {
  return `  {
    lesson: ${word.lesson},
    title: '${word.title}',
    caption: '${word.caption}',
    subdir: '${word.subdir}',
    code: '${word.code}',
    avatarId: ${word.avatarId},
  }`;
}

export function exportWordsJs(words = getWords()) {
  const byLesson = new Map();

  for (const word of words) {
    if (!byLesson.has(word.lesson)) {
      byLesson.set(word.lesson, []);
    }
    byLesson.get(word.lesson).push(word);
  }

  const lessonIds = [...byLesson.keys()].sort((a, b) => a - b);
  const blocks = lessonIds.map((lessonId) => {
    const entries = byLesson
      .get(lessonId)
      .map((word) => formatWordEntry(word))
      .join(',\n');
    return `  // Lesson ${lessonId}\n${entries}`;
  });

  return `/**
 * Add new lesson words here.
 *
 * To look up NHK metadata for a word:
 *   npm run lookup -- 北海道
 *
 * Fields:
 * - lesson: lesson id (see lessons.js for metadata)
 * - title: Japanese word shown as the answer
 * - caption: reading shown under the answer (usually hiragana)
 * - subdir: NHK dictionary folder (common | area | jp | eng | num)
 * - code: 6-digit NHK dictionary code (used as fallback video name)
 * - avatarId: legacy NHK field, usually 1
 */
export const WORDS = [
${blocks.join(',\n')},
];
`;
}
