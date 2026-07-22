import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { cropFilterForSize } from '../src/video-crop.js';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUTPUT_FPS = 30;
const MAX_LOOP_SECONDS = 20;
const FRAME_SETTLE_MS = 120;
const VIEWPORT = { width: 1_280, height: 720 };
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
  try {
    await page.waitForFunction(
      () => {
        const count = document.querySelector('#search_count')?.textContent?.trim();
        return Boolean(count) && count !== '検索中';
      },
      undefined,
      { polling: 250, timeout: PLAYER_TIMEOUT_MS },
    );
  } catch (error) {
    throw new Error(`「${word}」の検索結果を取得できませんでした。`, { cause: error });
  }

  const countText =
    (await page.locator('#search_count').textContent())?.trim() ?? '';
  if (countText === '00件' || countText.startsWith('0件')) {
    throw new Error(`「${word}」に一致する手話CGが見つかりませんでした。`);
  }

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
        const canvas = document.querySelector('#player-canvas');
        return canvas && canvas.width > 400 && canvas.height > 400;
      },
      undefined,
      { polling: 250, timeout: PLAYER_TIMEOUT_MS },
    );
  } catch (error) {
    throw new Error('手話CGキャンバスの初期化が完了しませんでした。', { cause: error });
  }

  // Re-bind after Unity finishes booting; earlier hooks can be replaced.
  await prepareAnimationTracking(page);

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
}

async function captureCanvasFrames(page, framesDir) {
  const saved = new Set();

  await page.exposeBinding('__nhkSaveFrame', async (_source, index, base64) => {
    await writeFile(
      join(framesDir, `frame-${String(index).padStart(4, '0')}.jpg`),
      Buffer.from(base64, 'base64'),
    );
    saved.add(index);
  });

  // Real-time capture is impossible here: headless Chromium renders this Unity
  // player with software GL at only a few frames per second, so wall-clock
  // sampling produces frames seconds apart in the animation. Instead we pause
  // and seek each frame with Player.SetCurrentFrame, which is deterministic and
  // independent of render speed, then rebuild an evenly timed clip.
  const result = await page.locator('#player-canvas').evaluate(
    async (canvas, { outputFps, settleMs, maxSeconds }) => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const waitRender = () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );

      const parseTime = (value) => {
        if (value === null || value === undefined) return 0;
        const text = String(value);
        const parts = text.split(':');
        if (parts.length === 3) {
          return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + parseFloat(parts[2]);
        }
        if (parts.length === 2) {
          return Number(parts[0]) * 60 + parseFloat(parts[1]);
        }
        return parseFloat(text) || 0;
      };

      const readCurrentSeconds = async () => {
        Player.GetCurrentTime();
        await sleep(60);
        return parseTime(window.__nhkRecorderState?.currentTime);
      };

      const captureBase64 = () =>
        new Promise((resolve, reject) => {
          canvas.toBlob(
            async (blob) => {
              if (!blob) {
                reject(new Error('キャンバスの画像化に失敗しました。'));
                return;
              }
              const buffer = new Uint8Array(await blob.arrayBuffer());
              let binary = '';
              const blockSize = 0x8000;
              for (let offset = 0; offset < buffer.length; offset += blockSize) {
                binary += String.fromCharCode(...buffer.subarray(offset, offset + blockSize));
              }
              resolve(btoa(binary));
            },
            'image/jpeg',
            0.9,
          );
        });

      Player.Pause();
      await sleep(200);

      Player.GetTotalTime();
      await sleep(80);
      const totalSeconds = parseTime(window.__nhkRecorderState?.totalTime);

      // Derive the source frame rate from a probe seek (frame -> reported time).
      const probeFrame = 24;
      Player.SetCurrentFrame(probeFrame);
      await waitRender();
      await sleep(settleMs);
      const probeSeconds = await readCurrentSeconds();
      let sourceFps = probeSeconds > 0 ? probeFrame / probeSeconds : outputFps;
      if (!Number.isFinite(sourceFps) || sourceFps < 5 || sourceFps > 120) {
        sourceFps = 60;
      }

      const cappedSeconds = Math.min(totalSeconds, maxSeconds);
      const sourceFrames = Math.max(2, Math.round(cappedSeconds * sourceFps));
      const outputCount = Math.max(2, Math.round(cappedSeconds * outputFps));

      for (let index = 0; index < outputCount; index += 1) {
        let sourceFrame = Math.round((index * sourceFps) / outputFps);
        if (sourceFrame >= sourceFrames) {
          sourceFrame = sourceFrames - 1;
        }

        Player.SetCurrentFrame(sourceFrame);
        await waitRender();
        await sleep(settleMs);

        const base64 = await captureBase64();
        await window.__nhkSaveFrame(index, base64);
      }

      return {
        width: canvas.width,
        height: canvas.height,
        frameCount: outputCount,
        sourceFps,
        totalSeconds,
      };
    },
    { outputFps: OUTPUT_FPS, settleMs: FRAME_SETTLE_MS, maxSeconds: MAX_LOOP_SECONDS },
  );

  if (saved.size !== result.frameCount) {
    throw new Error(
      `フレーム数が不足しています（${saved.size}/${result.frameCount}）。`,
    );
  }

  return result;
}

async function encodeVp9(inputArgs, outputPath, { videoFilter, frameCount } = {}) {
  const args = [
    '-y',
    '-v',
    'error',
    ...inputArgs,
  ];

  if (videoFilter) {
    args.push('-vf', videoFilter);
  }

  args.push(
    '-an',
    '-c:v',
    'libvpx-vp9',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    '18',
    '-b:v',
    '0',
    '-row-mt',
    '1',
    '-auto-alt-ref',
    '0',
    '-r',
    String(OUTPUT_FPS),
    '-fps_mode',
    'cfr',
  );

  if (frameCount != null) {
    args.push('-frames:v', String(frameCount));
  }

  args.push(outputPath);
  await run('ffmpeg', args);
}

async function encodeFrames(framesDir, outputPath, frameCount, { width, height } = {}) {
  const temporaryOutput = `${outputPath}.${process.pid}.${Date.now()}.tmp.webm`;
  const sanitizedOutput = `${outputPath}.${process.pid}.${Date.now()}.clean.webm`;
  const cropFilter =
    width && height ? `${cropFilterForSize(width, height)},` : '';

  try {
    // First pass: JPEG sequence -> VP9 (may produce Chrome-hostile bitstreams).
    await encodeVp9(
      [
        '-framerate',
        String(OUTPUT_FPS),
        '-i',
        join(framesDir, 'frame-%04d.jpg'),
      ],
      temporaryOutput,
      {
        videoFilter: `${cropFilter}fps=${OUTPUT_FPS}`,
        frameCount,
      },
    );

    // Second pass: remux through a clean CFR re-encode so Chrome can decode it.
    await encodeVp9(['-i', temporaryOutput], sanitizedOutput);

    await rm(outputPath, { force: true });
    await rename(sanitizedOutput, outputPath);
  } finally {
    await rm(temporaryOutput, { force: true });
    await rm(sanitizedOutput, { force: true });
  }
}

async function recordSign({ word, output, result }) {
  const outputPath = outputPathFor(word, output);
  const framesDir = await mkdtemp(join(tmpdir(), 'shuwa-nhk-frames-'));
  const searchUrl = new URL(
    'https://www.nhk.or.jp/strl/signlanguagecg/searchJSL/keyword.html',
  );
  searchUrl.searchParams.set('word', word);

  await mkdir(dirname(outputPath), { recursive: true });

  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({
      viewport: VIEWPORT,
      userAgent: REGULAR_CHROME_USER_AGENT,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(PLAYER_TIMEOUT_MS);

    // Force Unity's WebGL context to keep the drawing buffer so toBlob can read frames.
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function getContext(type, attributes) {
        if (type === 'webgl' || type === 'experimental-webgl' || type === 'webgl2') {
          return original.call(this, type, {
            ...(attributes || {}),
            preserveDrawingBuffer: true,
          });
        }
        return original.call(this, type, attributes);
      };
    });

    await page.goto(searchUrl.href, {
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    const selected = await selectSearchResult(page, word, result);
    await prepareAnimationTracking(page);
    await selected.locator.click();
    await page.locator('#playrbox.is-active').waitFor({ state: 'visible' });
    await waitForAnimation(page);
    const capture = await captureCanvasFrames(page, framesDir);
    await context.close();
    await encodeFrames(framesDir, outputPath, capture.frameCount, {
      width: capture.width,
      height: capture.height,
    });

    return { outputPath, selected, capture };
  } finally {
    await browser?.close();
    await rm(framesDir, { recursive: true, force: true });
  }
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(usage());
      return;
    }

    const { outputPath, selected, capture } = await recordSign(options);
    const seconds = (capture.frameCount / OUTPUT_FPS).toFixed(2);
    process.stdout.write(
      `録画しました: ${selected.title}（${selected.caption}）` +
        ` / ${capture.frameCount}フレーム ${seconds}秒 @${OUTPUT_FPS}fps\n${outputPath}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n`);
    process.stderr.write(usage());
    process.exitCode = 1;
  }
}

await main();
