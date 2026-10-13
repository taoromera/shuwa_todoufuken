/**
 * One-off: re-encode full-range ("pc") library videos to limited range ("tv").
 * Chrome's hardware VP9 decoder fails on full-range video ("video decode error").
 *
 * Originals are kept in video-backup/ before anything in the bucket is replaced.
 *
 *   node scripts/fix-video-color-range.mjs --dry-run
 *   node scripts/fix-video-color-range.mjs
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { mongoClient } from '../server/db.js';
import { libraryVideos } from '../server/library.js';
import { getVideoUrl, putVideo, storageEnabled } from '../server/storage.js';

const exec = promisify(execFile);
const dryRun = process.argv.includes('--dry-run');
const CONCURRENCY = 4;
const backupDir = join(process.cwd(), 'video-backup');
const workDir = join(backupDir, '.tmp');

async function colorRange(path) {
  const { stdout } = await exec('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=color_range', '-of', 'csv=p=0', path,
  ]);
  return stdout.trim();
}

async function download(doc) {
  const path = join(backupDir, doc.file);
  if (!existsSync(path)) {
    const { url } = await getVideoUrl(doc.key);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    await writeFile(path, Buffer.from(await res.arrayBuffer()));
  }
  return path;
}

async function reencode(input, output) {
  await exec('ffmpeg', [
    '-y', '-v', 'error', '-i', input,
    '-vf', 'scale=out_range=limited',
    '-an', '-pix_fmt', 'yuv420p', '-color_range', 'tv',
    '-c:v', 'libvpx-vp9', '-crf', '20', '-b:v', '0',
    '-deadline', 'good', '-cpu-used', '2', '-row-mt', '1',
    output,
  ]);
}

async function fix(doc) {
  const original = await download(doc);
  const range = await colorRange(original);
  if (range !== 'pc') return 'ok';
  if (dryRun) return 'needs-fix';

  const output = join(workDir, doc.file);
  await reencode(original, output);
  if ((await colorRange(output)) !== 'tv') throw new Error('re-encode did not produce limited range');

  const body = await readFile(output);
  await putVideo(doc.key, body, { contentLength: body.length });
  await libraryVideos.updateOne({ _id: doc._id }, { $set: { size: body.length, updatedAt: new Date() } });
  await rm(output);
  return 'fixed';
}

if (!storageEnabled) {
  console.error('S3_* が設定されていません。');
  process.exit(1);
}

await mkdir(workDir, { recursive: true });
const docs = await libraryVideos.find({}, { projection: { key: 1, file: 1 } }).toArray();
const counts = { ok: 0, 'needs-fix': 0, fixed: 0, failed: 0 };
const queue = [...docs];
let done = 0;

async function worker() {
  for (let doc = queue.shift(); doc; doc = queue.shift()) {
    try {
      counts[await fix(doc)] += 1;
    } catch (error) {
      counts.failed += 1;
      console.error(`${doc.file}: ${error.message}`);
    }
    done += 1;
    if (done % 25 === 0) console.log(`${done}/${docs.length}`, JSON.stringify(counts));
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(dryRun ? '[dry run]' : '', JSON.stringify(counts));
await rm(workDir, { recursive: true, force: true });
await mongoClient.close();
