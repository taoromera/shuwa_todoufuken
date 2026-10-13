import { describeAuthError } from './auth-client.js';

export function setStatus(element, message, { type = 'error' } = {}) {
  element.textContent = message;
  element.hidden = !message;
  element.classList.toggle('form-status--error', type === 'error');
  element.classList.toggle('form-status--success', type === 'success');
}

/**
 * Wire a form to an async submit handler: disables the submit button while
 * running and shows Better Auth errors in the status element.
 */
export function bindForm(form, status, onSubmit) {
  const submitButton = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus(status, '');
    submitButton.disabled = true;

    try {
      const result = await onSubmit(new FormData(form));
      if (result?.error) {
        setStatus(status, describeAuthError(result.error));
      }
    } catch (error) {
      console.error(error);
      setStatus(status, 'エラーが発生しました。もう一度お試しください。');
    } finally {
      submitButton.disabled = false;
    }
  });
}

export function field(formData, name) {
  return String(formData.get(name) ?? '').trim();
}
