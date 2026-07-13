import { spawn } from 'node:child_process';
import { rm, rename } from 'node:fs/promises';

const DETECTION_FPS = 30;
const SAMPLE_WIDTH = 16;
const SAMPLE_HEIGHT = 16;
const FRAME_SIZE = SAMPLE_WIDTH * SAMPLE_HEIGHT;
const MIN_LOOP_FRAMES = Math.floor(DETECTION_FPS * 0.2) + 1;
const MAX_DETECTION_BYTES = FRAME_SIZE * DETECTION_FPS * 120;

function run(command, args, { collectStdout = false, maxStdoutBytes = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;

    child.stdout.on('data', (chunk) => {
      if (!collectStdout) {
        return;
      }

      stdoutBytes += chunk.length;
      if (maxStdoutBytes && stdoutBytes > maxStdoutBytes) {
        child.kill();
        reject(new Error('動画が長すぎます。2分以内の動画を選択してください。'));
        return;
      }

      stdoutChunks.push(chunk);
    });
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error(`${command} が見つかりません。ffmpeg をインストールしてください。`));
        return;
      }
      reject(error);
    });
    child.on('close', (code) => {
      if (code !== 0) {
        const details = Buffer.concat(stderrChunks).toString('utf8').trim();
        reject(new Error(details || `${command} が終了コード ${code} で失敗しました。`));
        return;
      }

      resolve(collectStdout ? Buffer.concat(stdoutChunks) : undefined);
    });
  });
}

function frameDistance(frames, firstIndex, secondIndex) {
  const firstOffset = firstIndex * FRAME_SIZE;
  const secondOffset = secondIndex * FRAME_SIZE;
  let difference = 0;

  for (let pixel = 0; pixel < FRAME_SIZE; pixel += 1) {
    difference += Math.abs(frames[firstOffset + pixel] - frames[secondOffset + pixel]);
  }

  return difference / FRAME_SIZE;
}

function scoreLag(frames, frameCount, lag) {
  const pairCount = frameCount - lag;
  const sampleCount = Math.min(pairCount, 120);
  let total = 0;

  for (let sample = 0; sample < sampleCount; sample += 1) {
    const index =
      sampleCount === 1 ? 0 : Math.round((sample * (pairCount - 1)) / (sampleCount - 1));
    total += frameDistance(frames, index, index + lag);
  }

  return total / sampleCount;
}

export function detectLoop(frames) {
  const frameCount = Math.floor(frames.length / FRAME_SIZE);
  const maximumLag = Math.floor(frameCount / 2);

  if (maximumLag < MIN_LOOP_FRAMES) {
    throw new Error('繰り返しを検出するには動画が短すぎます。');
  }

  const scores = [];
  for (let lag = MIN_LOOP_FRAMES; lag <= maximumLag; lag += 1) {
    scores.push({ lag, score: scoreLag(frames, frameCount, lag) });
  }

  scores.sort((left, right) => left.score - right.score);
  const lowestScore = scores[0].score;
  const comparableScores = scores.filter(({ score }) => score <= lowestScore * 1.2 + 0.15);
  const best = comparableScores.reduce((shortest, candidate) =>
    candidate.lag < shortest.lag ? candidate : shortest,
  );
  const medianScore = [...scores].sort((left, right) => left.score - right.score)[
    Math.floor(scores.length / 2)
  ].score;

  if (best.score > 8 || best.score > medianScore * 0.75) {
    throw new Error('動画内で明確な繰り返しを検出できませんでした。');
  }

  let startFrame = 0;
  let boundaryScore = Number.POSITIVE_INFINITY;
  for (let index = 0; index + best.lag < frameCount; index += 1) {
    const score = frameDistance(frames, index, index + best.lag);
    if (score < boundaryScore) {
      startFrame = index;
      boundaryScore = score;
    }
  }

  return {
    startFrame,
    frameCount: best.lag,
    duration: best.lag / DETECTION_FPS,
    similarityScore: best.score,
    boundaryScore,
  };
}

async function decodeDetectionFrames(inputPath) {
  const frames = await run(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      inputPath,
      '-vf',
      `crop=538:510:366:66,fps=${DETECTION_FPS},scale=${SAMPLE_WIDTH}:${SAMPLE_HEIGHT}:flags=area,format=gray`,
      '-an',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'gray',
      '-',
    ],
    { collectStdout: true, maxStdoutBytes: MAX_DETECTION_BYTES },
  );

  if (frames.length % FRAME_SIZE !== 0) {
    throw new Error('動画フレームを正しく読み取れませんでした。');
  }

  return frames;
}

export async function processVideoFile(inputPath, outputPath) {
  const frames = await decodeDetectionFrames(inputPath);
  const loop = detectLoop(frames);
  const temporaryOutput = `${outputPath}.${process.pid}.${Date.now()}.tmp.webm`;
  const endFrame = loop.startFrame + loop.frameCount;

  try {
    await run('ffmpeg', [
      '-y',
      '-v',
      'error',
      '-i',
      inputPath,
      '-vf',
      `crop=538:510:366:66,fps=${DETECTION_FPS},trim=start_frame=${loop.startFrame}:end_frame=${endFrame},setpts=PTS-STARTPTS`,
      '-an',
      '-r',
      String(DETECTION_FPS),
      '-fps_mode',
      'cfr',
      '-frames:v',
      String(loop.frameCount),
      '-c:v',
      'libvpx-vp9',
      '-crf',
      '18',
      '-b:v',
      '0',
      '-row-mt',
      '1',
      temporaryOutput,
    ]);

    await rm(outputPath, { force: true });
    await rename(temporaryOutput, outputPath);
  } finally {
    await rm(temporaryOutput, { force: true });
  }

  return loop;
}
