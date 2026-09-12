/**
 * One-off batch: record missing lesson-7 words from NHK.
 * Usage: node scripts/record-lesson7-missing.mjs
 */
import { spawn } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { videoFileNameFromReading } from '../src/data/romanize.js';
import { WORDS } from '../src/data/words.js';
import { exportWordsJs, addWord } from '../src/data/word-store.js';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const RECORD_SCRIPT = resolve(rootDir, 'scripts/record-nhk-sign.mjs');
const LOG_PATH = resolve(rootDir, 'videos/lesson7-record-log.txt');
const DELAY_MS = 15_000;

/** Prefer first title that NHK has for age. */
const TO_RECORD = [
  ['去年', 'きょねん'],
  ['今年', 'ことし'],
  ['来年', 'らいねん'],
  ['国民', 'こくみん'],
  ['一昨日', 'おととい'],
  ['明後日', 'あさって'],
  ['あけましておめでとうございます', 'あけましておめでとうございます', ['あけましておめでとうございます', 'あけましておめでとう']],
  ['数字', 'すうじ'],
  ['兆', 'ちょう'],
  ['億', 'おく'],
  ['今週', 'こんしゅう'],
  ['先週', 'せんしゅう'],
  ['来週', 'らいしゅう'],
  ['餃子', 'ぎょうざ'],
  ['何歳', 'なんさい', ['何歳', '年齢']],
];

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  process.stdout.write(`${line}\n`);
  return appendFile(LOG_PATH, `${line}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runRecorder(word, outputPath) {
  return new Promise((resolvePromise) => {
    const child = spawn(
      process.execPath,
      [RECORD_SCRIPT, word, '--output', outputPath],
      {
        cwd: rootDir,
        env: {
          ...process.env,
          PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? '0',
        },
        windowsHide: true,
      },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      process.stderr.write(chunk);
    });
    child.on('error', (error) => {
      resolvePromise({ ok: false, code: -1, stdout, stderr: String(error) });
    });
    child.on('close', (code) => {
      resolvePromise({ ok: code === 0, code: code ?? 1, stdout, stderr });
    });
  });
}

function isMissingOnNhK(stdout, stderr) {
  const text = `${stdout}\n${stderr}`;
  return (
    text.includes('に一致する手話CGが見つかりませんでした') ||
    text.includes('手話CGキャンバスの初期化が完了しませんでした') ||
    text.includes('手話CGの読み込みが完了しませんでした') ||
    (text.includes('Timeout') && text.includes('search_count'))
  );
}

async function main() {
  let words = [...WORDS];
  const recorded = [];
  const skipped = [];
  const failed = [];

  for (let index = 0; index < TO_RECORD.length; index += 1) {
    const [title, caption, searchTitles = [title]] = TO_RECORD[index];
    const fileName = videoFileNameFromReading(caption, words);
    const outputPath = join(rootDir, 'videos', fileName);

    if (existsSync(outputPath)) {
      await log(`SKIP exists 「${title}」 → ${fileName}`);
      if (!words.some((w) => w.lesson === 7 && w.title === title)) {
        words = addWord(
          {
            id: crypto.randomUUID(),
            lesson: 7,
            title,
            caption,
            video: `./videos/${fileName}`,
          },
          words,
        );
        recorded.push(title);
      }
      continue;
    }

    let success = false;
    for (const searchTitle of searchTitles) {
      await log(
        `[${index + 1}/${TO_RECORD.length}] Recording 「${title}」(search: ${searchTitle}) → ${fileName}`,
      );
      const result = await runRecorder(searchTitle, outputPath);

      if (result.ok && existsSync(outputPath)) {
        const displayTitle =
          title === '何歳' && searchTitle === '年齢' ? '年齢' : title;
        const displayCaption =
          displayTitle === '年齢' ? 'ねんれい' : caption;
        const finalName =
          displayTitle === '年齢'
            ? videoFileNameFromReading(displayCaption, words)
            : fileName;
        if (finalName !== fileName && existsSync(outputPath)) {
          // keep recorded path; entry uses actual file
        }
        words = addWord(
          {
            id: crypto.randomUUID(),
            lesson: 7,
            title: displayTitle,
            caption: displayCaption,
            video: `./videos/${fileName}`,
          },
          words,
        );
        recorded.push(displayTitle);
        await log(`OK 「${displayTitle}」 → ${fileName}`);
        success = true;
        break;
      }

      if (isMissingOnNhK(result.stdout, result.stderr)) {
        await log(`SKIP 「${searchTitle}」 (not available on NHK)`);
        continue;
      }

      await log(`FAIL 「${searchTitle}」 (exit ${result.code})`);
    }

    if (!success) {
      skipped.push(title);
    }

    writeFileSync(join(rootDir, 'src/data/words.js'), exportWordsJs(words), 'utf8');

    if (index < TO_RECORD.length - 1) {
      await log(`Waiting ${DELAY_MS / 1000}s…`);
      await sleep(DELAY_MS);
    }
  }

  // Prefer 何歳 over 年齢 if both somehow present — already handled.
  // If neither age word worked, leave lesson without age-specific card.

  writeFileSync(join(rootDir, 'src/data/words.js'), exportWordsJs(words), 'utf8');
  await log(
    `Done. recorded/added=${recorded.join(', ') || '(none)'} skipped=${skipped.join(', ') || '(none)'} failed=${failed.join(', ') || '(none)'}`,
  );
}

main().catch(async (error) => {
  await log(`FATAL ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exitCode = 1;
});
