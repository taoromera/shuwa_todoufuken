import { authClient, safeNextPath } from './auth-client.js';
import { bindForm, field, setStatus } from './form.js';

const params = new URLSearchParams(window.location.search);
const nextPath = safeNextPath(params.get('next'));
const form = document.getElementById('login-form');
const status = document.getElementById('form-status');

if (params.get('reset') === '1') {
  setStatus(status, 'パスワードを再設定しました。新しいパスワードでログインしてください。', {
    type: 'success',
  });
}

if (params.get('deleted') === '1') {
  setStatus(status, 'アカウントを削除しました。', { type: 'success' });
}

if (params.has('next')) {
  document.getElementById('signup-link').href = `/signup?next=${encodeURIComponent(nextPath)}`;
}

bindForm(form, status, async (formData) => {
  const result = await authClient.signIn.email({
    email: field(formData, 'email'),
    password: String(formData.get('password') ?? ''),
    rememberMe: formData.get('rememberMe') === 'on',
  });

  if (!result.error) {
    window.location.assign(nextPath);
  }
  return result;
});
