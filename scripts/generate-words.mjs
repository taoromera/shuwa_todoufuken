import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const { entries } = JSON.parse(
  readFileSync(join(__dirname, 'batch-lookup-output.json'), 'utf8'),
);

function formatEntry(entry) {
  return `  {
    lesson: ${entry.lesson},
    title: '${entry.title}',
    caption: '${entry.caption}',
    subdir: '${entry.subdir}',
    code: '${entry.code}',
    avatarId: ${entry.avatarId},
  }`;
}

const lesson3 = entries.filter((e) => e.lesson === 3);
const prefectures = lesson3.filter((e) => e.title.endsWith('県') || e.title === '北海道');
const regions = lesson3.filter((e) => !prefectures.includes(e));

const content = `/**
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
  // Lesson 3 — 47 prefectures (都道府県)
${prefectures.map(formatEntry).join(',\n')},

  // Lesson 3 — regions (地方)
${regions.map(formatEntry).join(',\n')},
];
`;

writeFileSync(join(root, 'src', 'data', 'words.js'), content, 'utf8');
console.log(`Wrote ${entries.length} words (${prefectures.length} prefectures, ${regions.length} regions)`);
