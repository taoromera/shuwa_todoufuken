import { authClient } from './auth-client.js';
import { bindForm, field, setStatus } from './form.js';

const form = document.getElementById('forgot-form');
const status = document.getElementById('form-status');

bindForm(form, status, async (formData) => {
  const email = field(formData, 'email');
  if (!email) {
    setStatus(status, 'メールアドレスを入力してください。');
    return null;
  }

  const result = await authClient.requestPasswordReset({
    email,
    redirectTo: `${window.location.origin}/reset-password`,
  });

  if (!result.error) {
    form.reset();
    setStatus(
      status,
      '入力したメールアドレスが登録されている場合、再設定用のリンクを送信しました。メールをご確認ください。',
      { type: 'success' },
    );
  }
  return result;
});
