async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
  }
  if (!response.ok) {
    const error = new Error(data.error || 'エラーが発生しました。もう一度お試しください。');
    error.status = response.status;
    throw error;
  }
  return data;
}

export const DAY_START_HOUR = 4;

/** Start of the current study day in local time (days roll over at 4:00, like Anki). */
export function studyDayStart(now = new Date()) {
  const start = new Date(now);
  start.setHours(DAY_START_HOUR, 0, 0, 0);
  if (now < start) start.setDate(start.getDate() - 1);
  return start.getTime();
}

export function getSession(dayStart) {
  return request(`/api/study/session?dayStart=${dayStart}`);
}

export function submitReview(cardId, rating) {
  return request('/api/study/review', { method: 'POST', body: { cardId, rating } });
}