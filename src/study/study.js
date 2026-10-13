import { mountAppHeader } from '../auth/user-menu.js';
import { signVideo } from '../deck/dom.js';
import { getSession, studyDayStart, submitReview } from './study-api.js';

const $ = (id) => document.getElementById(id);

const state = {
  dayEnd: 0,
  /** Due reviews in due order, then new cards. */
  queue: [],
  /** Cards in a short (minutes) learning step, shown again once due. */
  learning: [],
  /** Distinct cards in today's session; learning repeats don't add to it. */
  total: 0,
  current: null,
  revealed: false,
  busy: false,
  session: null,
};

const dueTime = (item) => new Date(item.due).getTime();

function takeNext() {
  state.learning.sort((a, b) => dueTime(a) - dueTime(b));
  if (state.learning[0] && dueTime(state.learning[0]) <= Date.now()) return state.learning.shift();
  if (state.queue.length) return state.queue.shift();
  // Only learning cards remain: show them early rather than making the user wait.
  return state.learning.shift() ?? null;
}

function renderCounter() {
  const remaining = (state.current ? 1 : 0) + state.queue.length + state.learning.length;
  const counter = $('study-counter');
  counter.hidden = !state.current;
  counter.textContent = `${state.total - remaining + 1} / ${state.total}`;
}

function setError(message) {
  $('study-error').textContent = message;
  $('study-error').hidden = !message;
}

function pauseVideo() {
  $('answer-video').querySelector('video')?.pause();
}

function showMessage(title, body, action) {
  pauseVideo();
  setError('');
  for (const id of ['word-card', 'reveal-btn', 'answer-area']) $(id).hidden = true;
  $('message-title').textContent = title;
  $('message-body').textContent = body;
  const link = $('message-action');
  link.hidden = !action;
  if (action) {
    link.textContent = action.label;
    link.href = action.href;
  }
  $('study-message').hidden = false;
}

function formatNextDue(value) {
  const due = new Date(value);
  const days = Math.round((studyDayStart(due) - studyDayStart()) / (24 * 60 * 60 * 1000));
  if (days <= 1) return '次の復習は明日です。';
  return `次の復習は${days}日後（${due.getMonth() + 1}月${due.getDate()}日）です。`;
}

function showFinished() {
  const { session } = state;
  if (!session.items.length && !session.nextDue && session.newLeftInDeck === 0 && session.newStudiedToday === 0) {
    showMessage('単語帳にカードがありません', 'まずは単語帳にカードを追加しましょう。', {
      label: 'カードを追加',
      href: '/deck/add',
    });
    return;
  }

  const lines = ['今日の復習はすべて終わりました。'];
  if (session.newLeftInDeck > 0) {
    lines.push(`新しいカードがあと${session.newLeftInDeck}枚あります（1日${session.newPerDay}枚まで）。`);
  }
  showMessage('おつかれさまでした！', lines.join('\n'), { label: '単語帳を見る', href: '/deck' });
  void refreshNextDue();
}

/** The session is fetched before any reviews, so ask again for an accurate next due date. */
async function refreshNextDue() {
  try {
    const { nextDue } = await getSession(studyDayStart());
    if (nextDue) $('message-body').textContent += `\n${formatNextDue(nextDue)}`;
  } catch {
    // The completion message is fine without it.
  }
}

function showCard(item) {
  state.current = item;
  state.revealed = false;
  setError('');
  pauseVideo();
  $('answer-video').replaceChildren();
  $('answer-area').hidden = true;
  $('reveal-btn').hidden = false;
  $('card-title').textContent = item.title;
  $('card-caption').textContent = item.caption;
  $('card-caption').hidden = !item.caption;
  $('study-message').hidden = true;
  $('word-card').hidden = false;
  renderCounter();
  $('reveal-btn').focus();
}

function next() {
  const item = takeNext();
  if (!item) {
    state.current = null;
    renderCounter();
    showFinished();
    return;
  }
  showCard(item);
}

function reveal() {
  const item = state.current;
  if (!item || state.revealed) return;
  state.revealed = true;
  $('reveal-btn').hidden = true;
  $('answer-video').replaceChildren(signVideo(item.video, item.title));
  $('card-notes').textContent = item.notes;
  $('card-notes').hidden = !item.notes;
  $('answer-area').hidden = false;
  requestAnimationFrame(() => {
    $('answer-area').scrollIntoView({ behavior: 'smooth', block: 'end' });
  });
}

function setRatingDisabled(disabled) {
  for (const btn of document.querySelectorAll('[data-rating]')) btn.disabled = disabled;
}

async function rate(rating) {
  const item = state.current;
  if (!item || !state.revealed || state.busy) return;
  state.busy = true;
  setRatingDisabled(true);
  try {
    const { item: updated } = await submitReview(item.id, rating);
    if (updated && dueTime(updated) < state.dayEnd) state.learning.push(updated);
    next();
  } catch (error) {
    // 404: deleted elsewhere; 409: already rated (e.g. in another tab). Either way, move on.
    if (error.status === 404 || error.status === 409) {
      next();
    } else {
      setError(error.message);
    }
  } finally {
    state.busy = false;
    setRatingDisabled(false);
  }
}

function bindEvents() {
  $('reveal-btn').addEventListener('click', reveal);
  for (const btn of document.querySelectorAll('[data-rating]')) {
    btn.addEventListener('click', () => void rate(Number(btn.dataset.rating)));
  }
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || !state.current) return;
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select')) return;
    if (!state.revealed && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault();
      reveal();
    } else if (state.revealed && ['1', '2', '3', '4'].includes(event.key)) {
      event.preventDefault();
      void rate(Number(event.key));
    }
  });
}

async function init() {
  mountAppHeader();
  bindEvents();
  try {
    const session = await getSession(studyDayStart());
    state.session = session;
    state.dayEnd = new Date(session.dayEnd).getTime();
    state.total = session.items.length;
    state.learning = session.items.filter((item) => item.state === 'learning');
    state.queue = session.items.filter((item) => item.state !== 'learning');
    next();
  } catch (error) {
    showMessage('読み込めませんでした', error.message);
  } finally {
    $('study-loading').hidden = true;
  }
}

void init();
