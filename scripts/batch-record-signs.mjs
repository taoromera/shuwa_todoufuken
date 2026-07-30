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
  ['飲む', 'のむ'],
  ['置く', 'おく'],
  ['忘れる', 'わすれる'],
  ['覚える', 'おぼえる'],
  ['考える', 'かんがえる'],
  ['知る', 'しる'],
  ['洗う', 'あらう'],
  ['欲しい', 'ほしい'],
  ['まだ', 'まだ'],
  ['高い', 'たかい'],
  ['安い', 'やすい'],
  ['長い', 'ながい'],
  ['短い', 'みじかい'],
  ['遠い', 'とおい'],
  ['近い', 'ちかい'],
  ['重い', 'おもい'],
  ['軽い', 'かるい'],
  ['早い', 'はやい'],
  ['遅い', 'おそい'],
  ['難しい', 'むずかしい'],
  ['易しい', 'やさしい'],
  ['美しい', 'うつくしい'],
  ['汚い', 'きたない'],
  ['暖かい', 'あたたかい'],
  ['涼しい', 'すずしい'],
  ['痛い', 'いたい'],
  ['危ない', 'あぶない'],
  ['静か', 'しずか'],
  ['便利', 'べんり'],
  ['有名', 'ゆうめい'],
  ['大切', 'たいせつ'],
  ['同じ', 'おなじ'],
  ['違う', 'ちがう'],
  ['赤', 'あか'],
  ['青', 'あお'],
  ['黄色', 'きいろ'],
  ['緑', 'みどり'],
  ['黒', 'くろ'],
  ['茶色', 'ちゃいろ'],
  ['色', 'いろ'],
  ['春', 'はる'],
  ['夏', 'なつ'],
  ['秋', 'あき'],
  ['冬', 'ふゆ'],
  ['月曜日', 'げつようび'],
  ['火曜日', 'かようび'],
  ['水曜日', 'すいようび'],
  ['木曜日', 'もくようび'],
  ['金曜日', 'きんようび'],
  ['土曜日', 'どようび'],
  ['日曜日', 'にちようび'],
  ['服', 'ふく'],
  ['シャツ', 'シャツ'],
  ['ズボン', 'ズボン'],
  ['靴', 'くつ'],
  ['帽子', 'ぼうし'],
  ['眼鏡', 'めがね'],
  ['部屋', 'へや'],
  ['窓', 'まど'],
  ['ドア', 'ドア'],
  ['机', 'つくえ'],
  ['椅子', 'いす'],
  ['ベッド', 'ベッド'],
  ['台所', 'だいどころ'],
  ['ご飯', 'ごはん'],
  ['味噌汁', 'みそしる'],
  ['朝食', 'ちょうしょく'],
  ['夕食', 'ゆうしょく'],
  ['塩', 'しお'],
  ['砂糖', 'さとう'],
  ['醤油', 'しょうゆ'],
  ['油', 'あぶら'],
  ['米', 'こめ'],
  ['麺', 'めん'],
  ['スープ', 'スープ'],
  ['サラダ', 'サラダ'],
  ['りんご', 'りんご'],
  ['みかん', 'みかん'],
  ['バナナ', 'バナナ'],
  ['イチゴ', 'イチゴ'],
  ['犬', 'いぬ'],
  ['猫', 'ねこ'],
  ['鳥', 'とり'],
  ['花', 'はな'],
  ['木', 'き'],
  ['森', 'もり'],
  ['道', 'みち'],
  ['橋', 'はし'],
  ['建物', 'たてもの'],
  ['市', 'し'],
  ['町', 'まち'],
  ['村', 'むら'],
  ['国', 'くに'],
  ['日本', 'にほん'],
  ['世界', 'せかい'],
  ['言葉', 'ことば'],
  ['日本語', 'にほんご'],
  ['英語', 'えいご'],
  ['手紙', 'てがみ'],
  ['仕事', 'しごと'],
  ['休み', 'やすみ'],
  ['旅行', 'りょこう'],
  ['趣味', 'しゅみ'],
  ['スポーツ', 'スポーツ'],
  ['サッカー', 'サッカー'],
  ['野球', 'やきゅう'],
  ['テニス', 'テニス'],
  ['料理', 'りょうり'],
  ['掃除', 'そうじ'],
  ['洗濯', 'せんたく'],
  ['買い物', 'かいもの'],
  ['運転', 'うんてん'],
  ['練習', 'れんしゅう'],
  ['質問', 'しつもん'],
  ['答え', 'こたえ'],
  ['問題', 'もんだい'],
  ['試験', 'しけん'],
  ['宿題', 'しゅくだい'],
  ['授業', 'じゅぎょう'],
  ['学生', 'がくせい'],
  ['大学', 'だいがく'],
  ['高校', 'こうこう'],
  ['中学校', 'ちゅうがっこう'],
  ['小学校', 'しょうがっこう'],
  ['クラス', 'クラス'],
  ['彼女', 'かのじょ'],
  ['彼', 'かれ'],
  ['両親', 'りょうしん'],
  ['赤ちゃん', 'あかちゃん'],
  ['夫', 'おっと'],
  ['妻', 'つま'],
  ['結婚', 'けっこん'],
  ['誕生日', 'たんじょうび'],
  ['祝う', 'いわう'],
  ['贈る', 'おくる'],
  ['もらう', 'もらう'],
  ['あげる', 'あげる'],
  ['貸す', 'かす'],
  ['借りる', 'かりる'],
  ['返す', 'かえす'],
  ['払う', 'はらう'],
  ['切る', 'きる'],
  ['押す', 'おす'],
  ['引く', 'ひく'],
  ['捨てる', 'すてる'],
  ['拾う', 'ひろう'],
  ['探す', 'さがす'],
  ['見つける', 'みつける'],
  ['決める', 'きめる'],
  ['選ぶ', 'えらぶ'],
  ['通る', 'とおる'],
  ['渡る', 'わたる'],
  ['曲がる', 'まがる'],
  ['乗る', 'のる'],
  ['降りる', 'おりる'],
  ['着く', 'つく'],
  ['送る', 'おくる'],
  ['届く', 'とどく'],
  ['住む', 'すむ'],
  ['死ぬ', 'しぬ'],
  ['生まれる', 'うまれる'],
  ['消す', 'けす'],
  ['つける', 'つける'],
  ['直す', 'なおす'],
  ['壊す', 'こわす'],
  ['守る', 'まもる'],
  ['助ける', 'たすける'],
  ['泣く', 'なく'],
  ['笑う', 'わらう'],
  ['怒る', 'おこる'],
  ['驚く', 'おどろく'],
  ['嬉しい', 'うれしい'],
  ['悲しい', 'かなしい'],
  ['怖い', 'こわい'],
  ['恥ずかしい', 'はずかしい'],
  ['寂しい', 'さびしい'],
  ['幸せ', 'しあわせ'],
  ['夢', 'ゆめ'],
  ['心', 'こころ'],
  ['力', 'ちから'],
  ['声', 'こえ'],
  ['髪', 'かみ'],
  ['歯', 'は'],
  ['指', 'ゆび'],
  ['背中', 'せなか'],
  ['お腹', 'おなか'],
  ['胸', 'むね'],
  ['肩', 'かた'],
  ['首', 'くび'],
  ['薬', 'くすり'],
  ['医者', 'いしゃ'],
  ['病気', 'びょうき'],
  ['熱', 'ねつ'],
  ['怪我', 'けが'],
  ['健康', 'けんこう'],
  ['生活', 'せいかつ'],
  ['文化', 'ぶんか'],
  ['歴史', 'れきし'],
  ['科学', 'かがく'],
  ['技術', 'ぎじゅつ'],
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
