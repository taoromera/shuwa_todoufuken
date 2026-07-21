import { ADMIN_WORDS as DEFAULT_ADMIN_WORDS } from './admin-words.js';

function escapeJsString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function getAdminWords() {
  return [...DEFAULT_ADMIN_WORDS];
}

export function getAdminWordId(word) {
  return word.id ?? word.video ?? `${word.title}\u0000${word.caption}`;
}

export function addAdminWord(word, words = getAdminWords()) {
  const next = [...words];
  const duplicate = next.some(
    (entry) => entry.title === word.title && entry.caption === word.caption,
  );

  if (duplicate) {
    throw new Error(`「${word.title}」はすでに登録されています。`);
  }

  next.push(word);
  return next;
}

export function removeAdminWord(wordId, words = getAdminWords()) {
  return words.filter((word) => getAdminWordId(word) !== wordId);
}

function formatWordEntry(word) {
  const fields = [
    `title: '${escapeJsString(word.title)}'`,
    `caption: '${escapeJsString(word.caption)}'`,
  ];

  if (word.id) fields.push(`id: '${escapeJsString(word.id)}'`);
  if (word.video) fields.push(`video: '${escapeJsString(word.video)}'`);

  return `  {\n${fields.map((field) => `    ${field},`).join('\n')}\n  }`;
}

export function exportAdminWordsJs(words = getAdminWords()) {
  const entries = words.map((word) => formatWordEntry(word)).join(',\n');

  return `/**
 * Personal admin flashcards (not shown on the class home page).
 *
 * Fields:
 * - title: Japanese word shown as the answer
 * - caption: reading shown under the answer (usually hiragana)
 * - id: unique id
 * - video: relative path to the sign video
 */
export const ADMIN_WORDS = [
${entries}${entries ? ',' : ''}
];
`;
}

export async function saveAdminWordsFile(words) {
  const response = await fetch('/api/admin-words', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
    body: exportAdminWordsJs(words),
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result.error ||
        'admin-words.js の保存に失敗しました。npm run dev で起動しているか確認してください。',
    );
  }

  return result;
}
