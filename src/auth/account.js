import { authClient } from './auth-client.js';
import { bindForm, field, setStatus } from './form.js';
import { bindLogoutButton, mountAppHeader } from './user-menu.js';
const summary = document.getElementById('account-summary');
const emailInput = document.getElementById('email');

function renderUser(user) {
  summary.textContent = user.email;
  emailInput.value = user.email;
}

async function loadUser() {
  const { data } = await authClient.getSession({ query: { disableCookieCache: true } });
  if (!data) {
    window.location.assign('/login?next=/account');
    return null;
  }
  renderUser(data.user);
  return data.user;
}

const emailStatus = document.getElementById('email-status');
bindForm(document.getElementById('email-form'), emailStatus, async (formData) => {
  const newEmail = field(formData, 'email');
  if (!newEmail) {
    setStatus(emailStatus, 'メールアドレスを入力してください。');
    return null;
  }

  const result = await authClient.changeEmail({ newEmail });
  if (!result.error) {
    await loadUser();
    setStatus(emailStatus, 'メールアドレスを変更しました。', { type: 'success' });
  }
  return result;
});

const passwordForm = document.getElementById('password-form');
const passwordStatus = document.getElementById('password-status');
bindForm(passwordForm, passwordStatus, async (formData) => {
  const newPassword = String(formData.get('newPassword') ?? '');
  if (newPassword !== formData.get('newPasswordConfirm')) {
    setStatus(passwordStatus, '新しいパスワードが一致しません。');
    return null;
  }

  const result = await authClient.changePassword({
    currentPassword: String(formData.get('currentPassword') ?? ''),
    newPassword,
  });
  if (!result.error) {
    passwordForm.reset();
    setStatus(passwordStatus, 'パスワードを変更しました。', { type: 'success' });
  }
  return result;
});

const deleteStatus = document.getElementById('delete-status');
bindForm(document.getElementById('delete-form'), deleteStatus, async (formData) => {
  const password = String(formData.get('password') ?? '');
  if (!password) {
    setStatus(deleteStatus, 'パスワードを入力してください。');
    return null;
  }
  if (!window.confirm('本当にアカウントを削除しますか？この操作は取り消せません。')) {
    return null;
  }

  const result = await authClient.deleteUser({ password });
  if (!result.error) {
    window.location.assign('/login?deleted=1');
  }
  return result;
});

mountAppHeader();
bindLogoutButton(document.getElementById('logout-btn'));
void loadUser();
