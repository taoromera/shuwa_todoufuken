import { authClient, safeNextPath } from './auth-client.js';
import { bindForm, field, setStatus } from './form.js';

const params = new URLSearchParams(window.location.search);
const nextPath = safeNextPath(params.get('next'));
const form = document.getElementById('signup-form');
const status = document.getElementById('form-status');

if (params.has('next')) {
  document.getElementById('login-link').href = `/login?next=${encodeURIComponent(nextPath)}`;
}

bindForm(form, status, async (formData) => {
  const email = field(formData, 'email');
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    setStatus(status, 'すべての項目を入力してください。');
    return null;
  }
  if (password !== formData.get('passwordConfirm')) {
    setStatus(status, 'パスワードが一致しません。');
    return null;
  }

  // Better Auth requires `name`; the app identifies users by email only.
  const result = await authClient.signUp.email({ name: '', email, password });
  if (!result.error) {
    window.location.assign(nextPath);
  }
  return result;
});
