/**
 * Grant or revoke the admin role for an existing account.
 * Usage: npm run set-admin -- you@example.com
 *        npm run set-admin -- you@example.com --revoke
 */
import { db, mongoClient } from '../server/db.js';

const email = process.argv[2]?.trim().toLowerCase();
const revoke = process.argv.includes('--revoke');

if (!email || email.startsWith('--')) {
  console.error('Usage: npm run set-admin -- <email> [--revoke]');
  process.exit(1);
}

try {
  await mongoClient.connect();
  const role = revoke ? 'user' : 'admin';
  const result = await db.collection('user').updateOne({ email }, { $set: { role } });

  if (result.matchedCount === 0) {
    console.error(`${email} のアカウントが見つかりません。先にサインアップしてください。`);
    process.exitCode = 1;
  } else {
    console.log(`${email} のロールを ${role} に設定しました。`);
  }
} finally {
  await mongoClient.close();
}
