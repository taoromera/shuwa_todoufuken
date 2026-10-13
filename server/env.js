import 'dotenv/config';

const isProduction =
  process.env.NODE_ENV === 'production' || process.argv.includes('--production');

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません（.env を確認してください）。`);
  }
  return value;
}

function optional(name, fallback = '') {
  return process.env[name]?.trim() || fallback;
}

const port = Number(optional('PORT', '3000'));

export const env = {
  isProduction,
  port,
  mongodbUri: required('MONGODB_URI'),
  mongodbDb: optional('MONGODB_DB', 'shuwa'),
  authSecret: required('BETTER_AUTH_SECRET'),
  baseUrl: optional('BETTER_AUTH_URL', `http://localhost:${port}`).replace(/\/$/, ''),
  resendApiKey: isProduction ? required('RESEND_API_KEY') : optional('RESEND_API_KEY'),
  emailFrom: isProduction ? required('EMAIL_FROM') : optional('EMAIL_FROM'),
  s3: {
    endpoint: isProduction ? required('S3_ENDPOINT') : optional('S3_ENDPOINT'),
    bucket: isProduction ? required('S3_BUCKET') : optional('S3_BUCKET'),
    accessKeyId: isProduction ? required('S3_ACCESS_KEY_ID') : optional('S3_ACCESS_KEY_ID'),
    secretAccessKey: isProduction
      ? required('S3_SECRET_ACCESS_KEY')
      : optional('S3_SECRET_ACCESS_KEY'),
    region: optional('S3_REGION', 'auto'),
    forcePathStyle: optional('S3_URL_STYLE', 'virtual') === 'path',
  },
};
