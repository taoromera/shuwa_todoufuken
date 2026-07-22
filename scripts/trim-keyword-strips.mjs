import { readdirSync, rmSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { cropFilterForSize } from '../src/video-crop.js';

const videosDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'videos');

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => {
      err += d;
    });
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error((err || `${cmd} failed ${code}`).slice(0, 800))),
    );
  });
}

function probe(file) {
  return new Promise((resolve) => {
    const child = spawn(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file],
      { windowsHide: true },
    );
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
    });
    child.on('close', () => {
      const [w, h] = out.trim().split(',').map(Number);
      resolve({ w, h });
    });
  });
}

/**
 * Detect white keyword strip in the bottom ~18% of a mid frame.
 * Cyan background averages much lower luminance than the white strip.
 */
async function hasKeywordStrip(file, w, h) {
  const framePath = join(tmpdir(), `shuwa-strip-${process.pid}-${Date.now()}.png`);
  try {
    await run('ffmpeg', [
      '-y',
      '-v',
      'error',
      '-i',
      file,
      '-vf',
      'select=eq(n\\,5)',
      '-frames:v',
      '1',
      framePath,
    ]);

    const bandH = Math.max(20, Math.round(h * 0.18));
    const escaped = framePath.replace(/\\/g, '/').replace(/:/g, '\\:');
    const filter = `movie=${escaped},crop=${w}:${bandH}:0:${h - bandH},signalstats`;

    const yavg = await new Promise((resolve) => {
      const child = spawn(
        'ffprobe',
        [
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          filter,
          '-show_entries',
          'frame_tags=lavfi.signalstats.YAVG',
          '-of',
          'csv=p=0',
        ],
        { windowsHide: true },
      );
      let out = '';
      child.stdout.on('data', (d) => {
        out += d;
      });
      child.on('close', () => {
        const lines = out.trim().split(/\r?\n/).filter(Boolean);
        resolve(Number(lines.at(-1)));
      });
    });

    return Number.isFinite(yavg) && yavg > 170;
  } finally {
    rmSync(framePath, { force: true });
  }
}

async function trimVideo(file, w, h) {
  const input = join(videosDir, file);
  const tempOut = `${input}.trim.tmp.webm`;
  const cleanOut = `${input}.trim.clean.webm`;
  const filter = cropFilterForSize(w, h);

  try {
    await run('ffmpeg', [
      '-y',
      '-v',
      'error',
      '-i',
      input,
      '-vf',
      `${filter},fps=30`,
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
      '30',
      '-fps_mode',
      'cfr',
      tempOut,
    ]);

    await run('ffmpeg', [
      '-y',
      '-v',
      'error',
      '-i',
      tempOut,
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
      '30',
      '-fps_mode',
      'cfr',
      cleanOut,
    ]);

    renameSync(cleanOut, input);
  } finally {
    rmSync(tempOut, { force: true });
    rmSync(cleanOut, { force: true });
  }
}

const files = readdirSync(videosDir)
  .filter((f) => f.endsWith('.webm'))
  .sort();

const candidates = [];
for (const f of files) {
  const { w, h } = await probe(join(videosDir, f));
  // Lesson crops ~538x510; already-trimmed admin ~720x490; strip videos ~720x640.
  if (h > 530) {
    candidates.push({ f, w, h });
  }
}

console.log(`tall candidates: ${candidates.length}`);

const toTrim = [];
for (const c of candidates) {
  let strip = false;
  try {
    strip = await hasKeywordStrip(join(videosDir, c.f), c.w, c.h);
  } catch (error) {
    strip = c.h >= 600;
    console.log(`detect-fail ${c.f}: ${error.message}`);
  }

  console.log(`${strip ? 'STRIP' : 'clean'} ${c.f} ${c.w}x${c.h}`);
  if (strip || c.h >= 600) {
    toTrim.push(c);
  }
}

console.log(`trimming ${toTrim.length} videos…`);

for (const c of toTrim) {
  await trimVideo(c.f, c.w, c.h);
  const after = await probe(join(videosDir, c.f));
  console.log(`trimmed ${c.f} ${c.w}x${c.h} -> ${after.w}x${after.h}`);
}

for (const f of ['otouto.webm', 'imouto.webm', 'anata.webm', 'au.webm']) {
  const p = await probe(join(videosDir, f));
  console.log(`final ${f} ${p.w}x${p.h}`);
}
