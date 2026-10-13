import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const OUTPUT_FPS = 30;
const OUTPUT_MAX_SIZE = 720;
const PREVIEW_MAX_HEIGHT = 480;
const YOUTUBE_TIMEOUT_MS = 3 * 60 * 1000;
const ENCODE_TIMEOUT_MS = 5 * 60 * 1000;

const TOOL_MISSING = {
  ffmpeg: 'サーバーに ffmpeg がインストールされていません。',
  ffprobe: 'サーバーに ffprobe がインストールされていません。',
  'yt-dlp': 'サーバーに yt-dlp がインストールされていません。',
};

/** An error whose message can be shown to the user. */
export function mediaError(message, status = 422) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function run(command, args, { timeoutMs = ENCODE_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(mediaError('処理に時間がかかりすぎたため中断しました。', 504));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error.code === 'ENOENT' && TOOL_MISSING[command] ? mediaError(TOOL_MISSING[command], 500) : error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString('utf8'));
        return;
      }
      const details = Buffer.concat(stderr).toString('utf8').trim();
      const error = new Error(`${command} failed (${code})`);
      error.details = details.slice(-2000);
      reject(error);
    });
  });
}

/** Returns duration (s) and display size of the first video stream, or null. */
export async function probeVideo(path) {
  try {
    const output = await run(
      'ffprobe',
      [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height:stream_side_data=rotation:format=duration',
        '-of', 'json',
        path,
      ],
      { timeoutMs: 30_000 },
    );
    const data = JSON.parse(output);
    const stream = data.streams?.[0];
    const duration = Number(data.format?.duration);
    if (!stream || !Number.isFinite(duration) || duration <= 0) return null;

    const rotation = Math.abs(Number(stream.side_data_list?.[0]?.rotation ?? 0)) % 180;
    const [width, height] =
      rotation === 90 ? [stream.height, stream.width] : [stream.width, stream.height];
    return { duration, width, height };
  } catch (error) {
    if (error.details !== undefined) return null;
    throw error;
  }
}

/** Small H.264 copy for the in-browser trim/crop editor. */
export async function makePreview(inputPath, outputPath) {
  await run('ffmpeg', [
    '-y', '-v', 'error',
    '-i', inputPath,
    '-vf', `scale=-2:'min(${PREVIEW_MAX_HEIGHT},ih)'`,
    '-an',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputPath,
  ]);
}

/**
 * Download only [start, end] of a YouTube video (video track only, ≤720p).
 * Returns the downloaded file path.
 */
export async function downloadYoutubeSection(videoId, start, end, dir) {
  try {
    await run(
      'yt-dlp',
      [
        '--no-playlist',
        '--no-warnings',
        '--no-progress',
        '--js-runtimes', 'node',
        '-f', 'bv*[height<=720][vcodec^=avc1]/bv*[height<=720]/b[height<=720]/b',
        '--download-sections', `*${start.toFixed(2)}-${end.toFixed(2)}`,
        '--max-filesize', '200M',
        '--no-part',
        '-o', join(dir, 'source.%(ext)s'),
        '--',
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      { timeoutMs: YOUTUBE_TIMEOUT_MS },
    );
  } catch (error) {
    if (error.details !== undefined) {
      console.error('[yt-dlp]', error.details);
      throw mediaError(describeYoutubeError(error.details));
    }
    throw error;
  }

  const file = (await readdir(dir)).find((name) => name.startsWith('source.'));
  if (!file) throw mediaError('YouTube から動画を取得できませんでした。');
  return join(dir, file);
}

function describeYoutubeError(details) {
  if (/Sign in to confirm|not a bot|HTTP Error 429/i.test(details)) {
    return 'YouTube にアクセスを制限されたため取得できませんでした。時間をおいて試すか、動画をアップロードしてください。';
  }
  if (/Private video|Video unavailable|removed|members-only|age/i.test(details)) {
    return 'この YouTube 動画は取得できません（非公開・削除済み・年齢制限など）。';
  }
  return 'YouTube から動画を取得できませんでした。URL を確認するか、動画をアップロードしてください。';
}

/**
 * Trim, optionally crop (normalized 0–1 rect), and encode to a small VP9 webm
 * without audio — the format used by every library video.
 */
export async function encodeClip(inputPath, outputPath, { start, end, crop }) {
  const filters = [];
  if (crop) {
    const f = (value) => value.toFixed(5);
    filters.push(
      `crop=trunc(iw*${f(crop.w)}/2)*2:trunc(ih*${f(crop.h)}/2)*2:trunc(iw*${f(crop.x)}):trunc(ih*${f(crop.y)})`,
    );
  }
  filters.push(
    `scale=w='min(${OUTPUT_MAX_SIZE},iw)':h='min(${OUTPUT_MAX_SIZE},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:out_range=limited`,
    `fps=${OUTPUT_FPS}`,
  );

  await run('ffmpeg', [
    '-y', '-v', 'error',
    '-ss', start.toFixed(3),
    '-to', end.toFixed(3),
    '-i', inputPath,
    '-vf', filters.join(','),
    '-an',
    // Chrome's hardware VP9 decoder fails on full-range ("pc") video.
    '-pix_fmt', 'yuv420p', '-color_range', 'tv',
    '-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0',
    '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1',
    outputPath,
  ]);
}
