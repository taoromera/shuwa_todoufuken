import { authClient } from './auth-client.js';
import { bindForm, setStatus } from './form.js';

const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const form = document.getElementById('reset-form');
const status = document.getElementById('form-status');

if (!token || params.get('error')) {
  form.hidden = true;
  setStatus(status, 'リンクが無効か、有効期限が切れています。もう一度再設定リンクを送信してください。');
}

bindForm(form, status, async (formData) => {
  const password = String(formData.get('password') ?? '');

  if (password !== formData.get('passwordConfirm')) {
    setStatus(status, 'パスワードが一致しません。');
    return null;
  }

  const result = await authClient.resetPassword({ newPassword: password, token });
  if (!result.error) {
    await authClient.signOut().catch(() => {});
    window.location.assign('/login?reset=1');
  }
  return result;
});
