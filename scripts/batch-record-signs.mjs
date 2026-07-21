import { spawn } from 'node:child_process';
import { access, mkdir, appendFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { videoFileNameFromReading } from '../src/data/romanize.js';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DELAY_MS = 60_000;
const RECORD_SCRIPT = resolve(rootDir, 'scripts/record-nhk-sign.mjs');
const LOG_PATH = resolve(rootDir, 'videos/batch-record-log.txt');

/**
 * title -> hiragana reading used for romanized filenames.
 * Adjust if NHK's preferred caption differs.
 */
const WORDS = [
  ['こんにちは', 'こんにちは'],
  ['おはよう', 'おはよう'],
  ['こんばんは', 'こんばんは'],
  ['ありがとう', 'ありがとう'],
  ['どういたしまして', 'どういたしまして'],
  ['ごめんなさい', 'ごめんなさい'],
  ['はい', 'はい'],
  ['いいえ', 'いいえ'],
  ['お願いします', 'おねがいします'],
  ['はじめまして', 'はじめまして'],
  ['さようなら', 'さようなら'],
  ['またね', 'またね'],
  ['わかる', 'わかる'],
  ['わからない', 'わからない'],
  ['大丈夫', 'だいじょうぶ'],
  ['私', 'わたし'],
  ['あなた', 'あなた'],
  ['人', 'ひと'],
  ['男', 'おとこ'],
  ['女', 'おんな'],
  ['子ども', 'こども'],
  ['家族', 'かぞく'],
  ['父', 'ちち'],
  ['母', 'はは'],
  ['兄', 'あに'],
  ['姉', 'あね'],
  ['弟', 'おとうと'],
  ['妹', 'いもうと'],
  ['友達', 'ともだち'],
  ['先生', 'せんせい'],
  ['誰', 'だれ'],
  ['何', 'なに'],
  ['どこ', 'どこ'],
  ['いつ', 'いつ'],
  ['なぜ', 'なぜ'],
  ['どう', 'どう'],
  ['どちら', 'どちら'],
  ['いくつ', 'いくつ'],
  ['どれ', 'どれ'],
  ['本当', 'ほんとう'],
  ['行く', 'いく'],
  ['来る', 'くる'],
  ['帰る', 'かえる'],
  ['見る', 'みる'],
  ['聞く', 'きく'],
  ['話す', 'はなす'],
  ['食べる', 'たべる'],
  ['飲む', 'のむ'],
  ['買う', 'かう'],
  ['売る', 'うる'],
  ['使う', 'つかう'],
  ['作る', 'つくる'],
  ['読む', 'よむ'],
  ['書く', 'かく'],
  ['会う', 'あう'],
  ['待つ', 'まつ'],
  ['座る', 'すわる'],
  ['立つ', 'たつ'],
  ['寝る', 'ねる'],
  ['起きる', 'おきる'],
  ['働く', 'はたらく'],
  ['勉強する', 'べんきょうする'],
  ['教える', 'おしえる'],
  ['手伝う', 'てつだう'],
  ['好き', 'すき'],
  ['良い', 'よい'],
  ['悪い', 'わるい'],
  ['大きい', 'おおきい'],
  ['小さい', 'ちいさい'],
  ['新しい', 'あたらしい'],
  ['古い', 'ふるい'],
  ['多い', 'おおい'],
  ['少ない', 'すくない'],
  ['暑い', 'あつい'],
  ['寒い', 'さむい'],
  ['忙しい', 'いそがしい'],
  ['暇', 'ひま'],
  ['楽しい', 'たのしい'],
  ['疲れた', 'つかれた'],
  ['元気', 'げんき'],
  ['今日', 'きょう'],
  ['明日', 'あした'],
  ['昨日', 'きのう'],
  ['今', 'いま'],
  ['朝', 'あさ'],
  ['昼', 'ひる'],
  ['夜', 'よる'],
  ['毎日', 'まいにち'],
  ['週', 'しゅう'],
  ['月', 'つき'],
  ['家', 'いえ'],
  ['学校', 'がっこう'],
  ['会社', 'かいしゃ'],
  ['駅', 'えき'],
  ['病院', 'びょういん'],
  ['店', 'みせ'],
  ['トイレ', 'トイレ'],
  ['電車', 'でんしゃ'],
  ['お金', 'おかね'],
  ['名前', 'なまえ'],
];

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  process.stdout.write(`${line}\n`);
  return appendFile(LOG_PATH, `${line}\n`);
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
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

async function loadFinishedTitles() {
  try {
    await access(LOG_PATH);
  } catch {
    return new Set();
  }

  const text = await readFile(LOG_PATH, 'utf8');
  const finished = new Set();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/\b(?:OK|SKIP) 「([^」]+)」/);
    if (match) {
      finished.add(match[1]);
    }
  }
  return finished;
}

async function main() {
  await mkdir(resolve(rootDir, 'videos'), { recursive: true });
  const finished = await loadFinishedTitles();
  await appendFile(
    LOG_PATH,
    `\n--- Resume ${new Date().toISOString()} ` +
      `(already finished: ${finished.size}/${WORDS.length}) ---\n`,
  );

  const summary = { ok: [], skipped: [], failed: [], resumed: 0 };
  let pendingDelay = false;

  for (let index = 0; index < WORDS.length; index += 1) {
    const [title, reading] = WORDS[index];
    const fileName = videoFileNameFromReading(reading);
    const outputPath = join(rootDir, 'videos', fileName);

    if (finished.has(title)) {
      summary.resumed += 1;
      continue;
    }

    if (pendingDelay) {
      await log(`Waiting ${DELAY_MS / 1000}s before next word…`);
      await sleep(DELAY_MS);
    }
    pendingDelay = true;

    await log(`[${index + 1}/${WORDS.length}] Recording 「${title}」 → ${fileName}`);

    const result = await runRecorder(title, outputPath);

    if (result.ok) {
      summary.ok.push({ title, fileName });
      await log(`OK 「${title}」 → ${fileName}`);
    } else if (isMissingOnNhK(result.stdout, result.stderr)) {
      summary.skipped.push({ title, reason: 'not found on NHK' });
      await log(`SKIP 「${title}」 (not available on NHK)`);
    } else {
      summary.failed.push({
        title,
        fileName,
        detail: (result.stderr || result.stdout).slice(0, 400),
      });
      await log(`FAIL 「${title}」 (exit ${result.code})`);
    }
  }

  const report =
    `\nDone.\n` +
    `Already finished (skipped on resume): ${summary.resumed}\n` +
    `OK this run: ${summary.ok.length}\n` +
    `Skipped this run: ${summary.skipped.length}\n` +
    `Failed this run: ${summary.failed.length}\n` +
    (summary.skipped.length
      ? `Skipped titles: ${summary.skipped.map((entry) => entry.title).join(', ')}\n`
      : '') +
    (summary.failed.length
      ? `Failed titles: ${summary.failed.map((entry) => entry.title).join(', ')}\n`
      : '');

  await log(report.trimEnd());
  process.stdout.write(report);

  if (summary.failed.length > 0) {
    process.exitCode = 1;
  }
}

await main();
