import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { deleteCardsForUser } from './cards.js';
import { db, mongoClient } from './db.js';
import { sendPasswordResetEmail } from './email.js';
import { env } from './env.js';

export const ROLES = {
  USER: 'user',
  ADMIN: 'admin',
};

await mongoClient.connect();

// Transactions need a replica set (e.g. Atlas); a standalone server rejects them.
const { setName } = await db.admin().command({ hello: 1 });
const supportsTransactions = Boolean(setName);

export const auth = betterAuth({
  appName: '手話単語帳',
  baseURL: env.baseUrl,
  secret: env.authSecret,
  trustedOrigins: [env.baseUrl],
  database: mongodbAdapter(db, {
    client: supportsTransactions ? mongoClient : undefined,
    transaction: supportsTransactions,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail({ user, url });
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: ROLES.USER,
        input: false,
      },
    },
    changeEmail: {
      enabled: true,
      updateEmailWithoutVerification: true,
    },
    deleteUser: {
      enabled: true,
      afterDelete: async (user) => {
        await deleteCardsForUser(user.id);
      },
    },
  },
});
