import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env.js';

const { endpoint, bucket, accessKeyId, secretAccessKey, region, forcePathStyle } = env.s3;

export const storageEnabled = Boolean(endpoint && bucket && accessKeyId && secretAccessKey);

const client = storageEnabled
  ? new S3Client({
      endpoint,
      region,
      forcePathStyle,
      credentials: { accessKeyId, secretAccessKey },
    })
  : null;

const URL_TTL_SECONDS = 6 * 60 * 60;
const URL_REUSE_MIN_REMAINING_MS = 60 * 60 * 1000;
const VIDEO_CACHE_CONTROL = 'private, max-age=86400';

/**
 * Presigned URLs are reused while they have >1h left so browsers can cache
 * the video under a stable URL instead of re-downloading on every view.
 */
const signedUrlCache = new Map();

function requireClient() {
  if (!client) {
    throw new Error('S3_* 環境変数が設定されていないため、ストレージを利用できません。');
  }
  return client;
}

export async function getVideoUrl(key) {
  const cached = signedUrlCache.get(key);
  if (cached && cached.expiresAt - Date.now() > URL_REUSE_MIN_REMAINING_MS) {
    return cached;
  }

  const url = await getSignedUrl(
    requireClient(),
    new GetObjectCommand({ Bucket: bucket, Key: key, ResponseCacheControl: VIDEO_CACHE_CONTROL }),
    { expiresIn: URL_TTL_SECONDS },
  );
  const entry = { url, expiresAt: Date.now() + URL_TTL_SECONDS * 1000 };
  signedUrlCache.set(key, entry);
  return entry;
}

export async function putVideo(key, body, { contentType = 'video/webm', contentLength } = {}) {
  await requireClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: contentLength,
      CacheControl: VIDEO_CACHE_CONTROL,
    }),
  );
}

export async function objectExists(key) {
  try {
    await requireClient().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (error.$metadata?.httpStatusCode === 404 || error.name === 'NotFound') return false;
    throw error;
  }
}

export async function deleteVideo(key) {
  signedUrlCache.delete(key);
  await requireClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
