import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const RECORDING_DURATION_MS = 5_000;
const RECORDING_FPS = 30;
const NAVIGATION_TIMEOUT_MS = 90_000;
const PLAYER_TIMEOUT_MS = 60_000;
const REGULAR_CHROME_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function usage() {
  return `NHKの手話CGを5秒間録画します。

使い方:
  npm run record:sign -- <単語> [オプション]

オプション:
  -o, --output <path>  出力先（既定: videos/<単語>.webm）
  -r, --result <n>     検索結果のn番目を録画（1から開始）
  -h, --help           ヘルプを表示

環境変数:
  NHK_BROWSER_PATH     使用するChrome/Chromiumの実行ファイル
`;
}

function parseArguments(argv) {
  let word;
  let output;
  let result;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '-h' || argument === '--help') {
      return { help: true };
    }

    if (argument === '-o' || argument === '--output') {
      output = argv[index + 1];
      if (!output) {
        throw new Error(`${argument} には出力先を指定してください。`);
      }
      index += 1;
      continue;
    }

    if (argument === '-r' || argument === '--result') {
      const value = argv[index + 1];
      result = Number(value);
      if (!Number.isInteger(result) || result < 1) {
        throw new Error(`${argument} には1以上の整数を指定してください。`);
      }
      index += 1;
      continue;
    }

    if (argument.startsWith('-')) {
      throw new Error(`不明なオプションです: ${argument}`);
    }

    if (word) {
      throw new Error(`単語は1つだけ指定してください: ${argument}`);
    }
    word = argument;
  }

  if (!word?.trim()) {
    throw new Error('録画する単語を指定してください。');
  }

  return { word: word.trim(), output, result };
}

function safeFileName(word) {
  const normalized = word
    .normalize('NFKC')
    .replace(/[^\p{Letter}\p{Number}._-]+/gu, '_')
    .replace(/^[_\-.]+|[_\-.]+$/g, '');

  return normalized || 'sign';
}

function outputPathFor(word, requestedPath) {
  let outputPath = requestedPath ?? resolve(rootDir, 'videos', `${safeFileName(word)}.webm`);
  outputPath = resolve(outputPath);

  if (!extname(outputPath)) {
    outputPath += '.webm';
  }
  if (extname(outputPath).toLowerCase() !== '.webm') {
    throw new Error('出力ファイルの拡張子は .webm にしてください。');
  }

  return outputPath;
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    const stderr = [];

    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error(`${command} が見つかりません。ffmpeg をインストールしてください。`));
        return;
      }
      reject(error);
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      const details = Buffer.concat(stderr).toString('utf8').trim();
      reject(new Error(details || `${command} が終了コード ${code} で失敗しました。`));
    });
  });
}

async function launchBrowser() {
  const launchOptions = {
    headless: true,
    args: ['--use-angle=swiftshader'],
  };

  if (process.env.NHK_BROWSER_PATH) {
    return chromium.launch({
      ...launchOptions,
      executablePath: process.env.NHK_BROWSER_PATH,
    });
  }

  try {
    return await chromium.launch(launchOptions);
  } catch (bundledBrowserError) {
    try {
      return await chromium.launch({ ...launchOptions, channel: 'chrome' });
    } catch {
      throw new Error(
        'Chromiumを起動できませんでした。npx playwright install chromium を実行するか、' +
          'NHK_BROWSER_PATHを指定してください。',
        { cause: bundledBrowserError },
      );
    }
  }
}

async function selectSearchResult(page, word, requestedResult) {
  const resultLinks = page.locator('#searchResult > a');
  await page.waitForFunction(
    () => {
      const count = document.querySelector('#search_count')?.textContent?.trim();
      return count && count !== '00件';
    },
    undefined,
    { polling: 250, timeout: PLAYER_TIMEOUT_MS },
  );

  const results = await resultLinks.evaluateAll((links) =>
    links.map((link) => ({
      title: link.dataset.title ?? '',
      caption: link.dataset.caption ?? '',
    })),
  );

  if (results.length === 0) {
    throw new Error(`「${word}」に一致する手話CGが見つかりませんでした。`);
  }

  let selectedIndex;
  if (requestedResult) {
    selectedIndex = requestedResult - 1;
  } else {
    selectedIndex = results.findIndex(
      ({ title, caption }) => title === word || caption === word,
    );
    if (selectedIndex < 0) {
      selectedIndex = 0;
    }
  }

  if (!results[selectedIndex]) {
    throw new Error(
      `検索結果は${results.length}件です。--resultには1から${results.length}までを指定してください。`,
    );
  }

  return {
    locator: resultLinks.nth(selectedIndex),
    ...results[selectedIndex],
  };
}

async function prepareAnimationTracking(page) {
  await page.evaluate(() => {
    window.__nhkRecorderState = {
      currentTime: null,
      totalTime: null,
    };

    const originalCurrentTime = Player.CallbackCurrentTime.bind(Player);
    const originalTotalTime = Player.CallbackTotalTime.bind(Player);

    Player.CallbackCurrentTime = (value) => {
      window.__nhkRecorderState.currentTime = value;
      originalCurrentTime(value);
    };
    Player.CallbackTotalTime = (value) => {
      window.__nhkRecorderState.totalTime = value;
      originalTotalTime(value);
    };
  });
}

async function waitForAnimation(page) {
  try {
    await page.waitForFunction(
      () => {
        Player.GetTotalTime();
        const totalTime = window.__nhkRecorderState?.totalTime;
        return totalTime && totalTime !== '00:00:00';
      },
      undefined,
      { polling: 250, timeout: PLAYER_TIMEOUT_MS },
    );
  } catch (error) {
    const state = await page.evaluate(() => window.__nhkRecorderState);
    throw new Error(
      `手話CGの読み込みが完了しませんでした（再生時間: ${state?.totalTime ?? '未取得'}）。`,
      { cause: error },
    );
  }

  // Start at the beginning of a loop so repeated runs produce comparable clips.
  try {
    await page.waitForFunction(
      () => {
        Player.GetCurrentTime();
        const value = window.__nhkRecorderState?.currentTime;
        const parts = (value ?? '').split(':').map(Number);
        if (parts.length < 2 || parts.some((part) => !Number.isFinite(part))) {
          return false;
        }

        const seconds = parts.reduce((total, part) => total * 60 + part, 0);
        return seconds <= 0.15;
      },
      undefined,
      { polling: 50, timeout: PLAYER_TIMEOUT_MS },
    );
  } catch (error) {
    const state = await page.evaluate(() => window.__nhkRecorderState);
    throw new Error(
      `手話CGの先頭を検出できませんでした（現在時刻: ${state?.currentTime ?? '未取得'}）。`,
      { cause: error },
    );
  }
}

async function recordCanvas(page) {
  return page.locator('#player-canvas').evaluate(
    async (canvas, { durationMs, fps }) => {
      const mimeType = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ].find((candidate) => MediaRecorder.isTypeSupported(candidate));

      if (!mimeType) {
        throw new Error('このブラウザはWebM録画に対応していません。');
      }

      const stream = canvas.captureStream(fps);
      const chunks = [];
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 4_000_000,
      });

      const recording = new Promise((resolvePromise, reject) => {
        recorder.addEventListener('dataavailable', (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        });
        recorder.addEventListener('error', () => {
          reject(recorder.error ?? new Error('ブラウザでの録画に失敗しました。'));
        });
        recorder.addEventListener('stop', async () => {
          try {
            const blob = new Blob(chunks, { type: mimeType });
            const bytes = new Uint8Array(await blob.arrayBuffer());
            let binary = '';
            const blockSize = 32_768;

            for (let offset = 0; offset < bytes.length; offset += blockSize) {
              binary += String.fromCharCode(...bytes.subarray(offset, offset + blockSize));
            }

            resolvePromise(btoa(binary));
          } catch (error) {
            reject(error);
          } finally {
            stream.getTracks().forEach((track) => track.stop());
          }
        });
      });

      recorder.start(1_000);
      setTimeout(() => recorder.stop(), durationMs + 250);
      return recording;
    },
    { durationMs: RECORDING_DURATION_MS, fps: RECORDING_FPS },
  );
}

async function normalizeRecording(inputPath, outputPath) {
  await run('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-i',
    inputPath,
    '-an',
    '-vf',
    `fps=${RECORDING_FPS},tpad=stop_mode=clone:stop_duration=5,trim=duration=5,setpts=PTS-STARTPTS`,
    '-frames:v',
    String((RECORDING_DURATION_MS / 1_000) * RECORDING_FPS),
    '-c:v',
    'libvpx-vp9',
    '-crf',
    '18',
    '-b:v',
    '0',
    '-row-mt',
    '1',
    outputPath,
  ]);
}

async function recordSign({ word, output, result }) {
  const outputPath = outputPathFor(word, output);
  const temporaryPath = `${outputPath}.${process.pid}.${Date.now()}.raw.webm`;
  const searchUrl = new URL(
    'https://www.nhk.or.jp/strl/signlanguagecg/searchJSL/keyword.html',
  );
  searchUrl.searchParams.set('word', word);

  await mkdir(dirname(outputPath), { recursive: true });

  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({
      viewport: { width: 1_280, height: 720 },
      userAgent: REGULAR_CHROME_USER_AGENT,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(PLAYER_TIMEOUT_MS);

    await page.goto(searchUrl.href, {
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    const selected = await selectSearchResult(page, word, result);
    await prepareAnimationTracking(page);
    await selected.locator.click();
    await page.locator('#playrbox.is-active').waitFor({ state: 'visible' });
    await waitForAnimation(page);

    const base64Recording = await recordCanvas(page);
    await writeFile(temporaryPath, Buffer.from(base64Recording, 'base64'));
    await context.close();

    await normalizeRecording(temporaryPath, outputPath);
    return { outputPath, selected };
  } finally {
    await browser?.close();
    await rm(temporaryPath, { force: true });
  }
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(usage());
      return;
    }

    const { outputPath, selected } = await recordSign(options);
    process.stdout.write(
      `録画しました: ${selected.title}（${selected.caption}）\n${outputPath}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n`);
    process.stderr.write(usage());
    process.exitCode = 1;
  }
}

await main();
