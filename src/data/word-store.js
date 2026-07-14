import { WORDS as DEFAULT_WORDS } from './words.js';

function escapeJsString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function getWords() {
  return [...DEFAULT_WORDS];
}

export function getWordsForLesson(lessonId) {
  const id = typeof lessonId === 'string' ? Number(lessonId) : lessonId;
  return getWords().filter((word) => word.lesson === id);
}

export function getWordId(word) {
  return word.id ?? word.video ?? `${word.title}\u0000${word.caption}`;
}

export function addWord(word, words = getWords()) {
  const next = [...words];
  const duplicate = next.some(
    (entry) =>
      entry.lesson === word.lesson &&
      entry.title === word.title &&
      entry.caption === word.caption,
  );

  if (duplicate) {
    throw new Error(`「${word.title}」はこのレッスンに既に追加されています。`);
  }

  next.push(word);
  return next;
}

export function removeWord(lessonId, wordId, words = getWords()) {
  const id = typeof lessonId === 'string' ? Number(lessonId) : lessonId;
  return words.filter((word) => !(word.lesson === id && getWordId(word) === wordId));
}

function formatWordEntry(word) {
  const fields = [
    `lesson: ${word.lesson}`,
    `title: '${escapeJsString(word.title)}'`,
    `caption: '${escapeJsString(word.caption)}'`,
  ];

  if (word.id) fields.push(`id: '${escapeJsString(word.id)}'`);
  if (word.video) fields.push(`video: '${escapeJsString(word.video)}'`);

  return `  {\n${fields.map((field) => `    ${field},`).join('\n')}\n  }`;
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
 * Fields:
 * - lesson: lesson id (see lessons.js for metadata)
 * - title: Japanese word shown as the answer
 * - caption: reading shown under the answer (usually hiragana)
 * - id: unique id for manually added words
 * - video: relative path to the sign video
 */
export const WORDS = [
${blocks.join(',\n')},
];
`;
}

export async function saveWordsFile(words) {
  const response = await fetch('/api/words', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
    body: exportWordsJs(words),
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result.error || 'words.js の保存に失敗しました。npm run dev で起動しているか確認してください。',
    );
  }

  return result;
}
