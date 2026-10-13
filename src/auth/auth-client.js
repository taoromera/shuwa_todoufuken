import { createAuthClient } from 'better-auth/client';

export const authClient = createAuthClient();

const ERROR_MESSAGES = {
  INVALID_EMAIL_OR_PASSWORD: 'メールアドレスまたはパスワードが正しくありません。',
  INVALID_EMAIL: 'メールアドレスの形式が正しくありません。',
  INVALID_PASSWORD: 'パスワードが正しくありません。',
  PASSWORD_TOO_SHORT: 'パスワードは8文字以上にしてください。',
  PASSWORD_TOO_LONG: 'パスワードが長すぎます（128文字以内）。',
  USER_ALREADY_EXISTS: 'このメールアドレスはすでに登録されています。',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'このメールアドレスはすでに登録されています。',
  INVALID_TOKEN: 'リンクが無効か、有効期限が切れています。もう一度やり直してください。',
  TOKEN_EXPIRED: 'リンクの有効期限が切れています。もう一度やり直してください。',
  SESSION_EXPIRED: 'セッションの有効期限が切れました。もう一度ログインしてください。',
  CREDENTIAL_ACCOUNT_NOT_FOUND: 'パスワードが設定されていないアカウントです。',
  EMAIL_CAN_NOT_BE_UPDATED: 'メールアドレスを変更できませんでした。',
  FAILED_TO_UPDATE_USER: 'アカウント情報を更新できませんでした。',
  USER_NOT_FOUND: 'アカウントが見つかりません。',
};

export function describeAuthError(error) {
  if (!error) return '';
  if (error.status === 429) {
    return '試行回数が多すぎます。しばらく待ってからもう一度お試しください。';
  }
  return ERROR_MESSAGES[error.code] ?? error.message ?? 'エラーが発生しました。もう一度お試しください。';
}

/** Only allow same-site relative paths as post-login destinations. */
export function safeNextPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }
  return value;
}
