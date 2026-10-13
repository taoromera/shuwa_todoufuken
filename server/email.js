import { Resend } from 'resend';
import { env } from './env.js';

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendEmail({ to, subject, text, html }) {
  if (!resend || !env.emailFrom) {
    console.log(`[email] RESEND_API_KEY / EMAIL_FROM 未設定のため送信をスキップ\nTo: ${to}\nSubject: ${subject}\n${text}`);
    return;
  }

  const { error } = await resend.emails.send({ from: env.emailFrom, to, subject, text, html });
  if (error) {
    console.error('[email] 送信に失敗しました', error);
    throw new Error('メールの送信に失敗しました。');
  }
}

export function sendPasswordResetEmail({ user, url }) {
  return sendEmail({
    to: user.email,
    subject: '【手話単語帳】パスワードの再設定',
    text: `パスワード再設定のリクエストを受け付けました。\n下のリンクから新しいパスワードを設定してください（有効期限は1時間です）。\n\n${url}\n\n心当たりがない場合は、このメールを無視してください。`,
    html: `<p>パスワード再設定のリクエストを受け付けました。<br>下のボタンから新しいパスワードを設定してください（有効期限は1時間です）。</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;background:#1a365d;color:#fff;border-radius:12px;text-decoration:none;font-weight:700">パスワードを再設定する</a></p>
<p style="color:#5a6778;font-size:13px">ボタンが使えない場合は、こちらのURLを開いてください：<br>${escapeHtml(url)}</p>
<p style="color:#5a6778;font-size:13px">心当たりがない場合は、このメールを無視してください。</p>`,
  });
}
