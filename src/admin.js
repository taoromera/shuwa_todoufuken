import { videoFileNameFromReading } from './data/romanize.js';
import { getWords } from './data/word-store.js';
import {
  addAdminWord,
  getAdminWordId,
  getAdminWords,
  removeAdminWord,
  saveAdminWordsFile,
} from './data/admin-word-store.js';
import {
  buildReviewQueue,
  countSrsStats,
  formatDueLabel,
  getSrsEntry,
  removeSrsEntry,
  reviewCard,
} from './data/srs-store.js';
import { showQuizVideo } from './quiz-video.js';

const MODES = {
  SIGN_TO_WORD: 'sign-to-word',
  WORD_TO_SIGN: 'word-to-sign',
};

const PROMPTS = {
  [MODES.SIGN_TO_WORD]: '手話の動画を見て、言葉を思い出してみましょう。',
  [MODES.WORD_TO_SIGN]: '言葉の手話を思い浮かべてから、答えを見てみましょう。',
};

const SECTIONS = {
  REVIEW: 'review',
  MANAGE: 'manage',
};

const SRS_LOG = '[admin-srs]';

function srsLog(step, detail = {}) {
  console.log(SRS_LOG, step, detail);
}

const state = {
  section: SECTIONS.REVIEW,
  mode: MODES.SIGN_TO_WORD,
  current: null,
  revealed: false,
  queue: [],
  queueIndex: 0,
  availableVideos: new Set(),
  words: getAdminWords(),
};

const elements = {
  sectionTabs: document.querySelectorAll('[data-section]'),
  reviewSection: document.getElementById('review-section'),
  manageSection: document.getElementById('manage-section'),
  srsStats: document.getElementById('srs-stats'),
  modeTabs: document.querySelectorAll('#review-section [data-mode]'),
  prompt: document.getElementById('prompt'),
  questionArea: document.getElementById('question-area'),
  revealBtn: document.getElementById('reveal-btn'),
  answerArea: document.getElementById('answer-area'),
  srsRatings: document.getElementById('srs-ratings'),
  cardCounter: document.getElementById('card-counter'),
  completionModal: document.getElementById('completion-modal'),
  completionMessage: document.getElementById('completion-message'),
  completionOkBtn: document.getElementById('completion-ok-btn'),
  status: document.getElementById('status'),
  wordList: document.getElementById('word-list'),
  wordCount: document.getElementById('word-count'),
  emptyMessage: document.getElementById('empty-message'),
  videoInput: document.getElementById('video-input'),
  manualForm: document.getElementById('manual-form'),
};

const slots = {
  questionMedia: document.createElement('div'),
  questionWord: document.createElement('div'),
  answerMedia: document.createElement('div'),
  emptyMessage: document.createElement('p'),
};

function videoOutputFileName(videoPath) {
  return videoPath.split('/').pop();
}

function setStatus(message, type = '') {
  elements.status.textContent = message;
  elements.status.className = `manage-status${type ? ` is-${type}` : ''}`;
}

function setupViewSlots() {
  slots.emptyMessage.className = 'empty-message';
  slots.emptyMessage.innerHTML =
    '復習できるカードがありません。<br>「カード管理」から追加してください。';

  elements.questionArea.replaceChildren(
    slots.questionMedia,
    slots.questionWord,
    slots.emptyMessage,
  );
  elements.answerArea.replaceChildren(slots.answerMedia);
}

function renderSrsStats() {
  const playable = getPlayableWords();
  const stats = countSrsStats(playable, getAdminWordId);

  elements.srsStats.innerHTML = `
    <div class="srs-stat">
      <span class="srs-stat-value">${stats.due}</span>
      <span class="srs-stat-label">今日の復習</span>
    </div>
    <div class="srs-stat">
      <span class="srs-stat-value">${stats.new}</span>
      <span class="srs-stat-label">新規</span>
    </div>
    <div class="srs-stat">
      <span class="srs-stat-value">${stats.later}</span>
      <span class="srs-stat-label">あとで</span>
    </div>
  `;
}

async function detectAvailableVideos(words) {
  const checks = await Promise.all(
    words.map(async (word) => {
      if (!word.video) return null;
      try {
        const response = await fetch(word.video, { method: 'HEAD' });
        return response.ok ? word.video : null;
      } catch {
        return null;
      }
    }),
  );

  state.availableVideos = new Set(checks.filter(Boolean));
}

function getPlayableWords() {
  return state.words.filter((word) => state.availableVideos.has(word.video));
}

function setRatingButtonsEnabled(enabled) {
  elements.srsRatings.querySelectorAll('[data-rating]').forEach((button) => {
    button.disabled = !enabled;
  });
}

function resetReveal() {
  state.revealed = false;
  elements.revealBtn.hidden = false;
  elements.answerArea.hidden = true;
  elements.srsRatings.hidden = true;
  setRatingButtonsEnabled(false);
  slots.answerMedia.replaceChildren();
}

function pauseVideos() {
  document.querySelectorAll('.quiz-video').forEach((video) => {
    video.pause();
  });
}

function renderWordCard(word, { label = null } = {}) {
  const card = document.createElement('div');
  card.className = 'word-card';
  card.innerHTML = `
    ${label ? `<p class="answer-label">${label}</p>` : ''}
    <p class="word-title">${word.title}</p>
    <p class="word-caption">${word.caption}</p>
  `;
  return card;
}

function showVideoIn(target, word, { hideLabel = false } = {}) {
  showQuizVideo(target, word, {
    isAvailable: state.availableVideos.has(word.video),
    hideLabel,
  });
}

function renderQuestion() {
  slots.emptyMessage.hidden = true;
  slots.questionMedia.hidden = true;
  slots.questionWord.hidden = true;
  slots.questionMedia.replaceChildren();
  slots.questionWord.replaceChildren();

  if (!state.current) {
    slots.emptyMessage.hidden = false;
    elements.revealBtn.hidden = true;
    return;
  }

  if (state.mode === MODES.SIGN_TO_WORD) {
    slots.questionMedia.hidden = false;
    showVideoIn(slots.questionMedia, state.current, { hideLabel: true });
    return;
  }

  slots.questionWord.hidden = false;
  slots.questionWord.appendChild(renderWordCard(state.current));
}

function renderAnswer() {
  slots.answerMedia.replaceChildren();
  if (!state.current) return;

  if (state.mode === MODES.SIGN_TO_WORD) {
    slots.answerMedia.appendChild(renderWordCard(state.current, { label: '答え' }));
    return;
  }

  showVideoIn(slots.answerMedia, state.current);
}

function updateCounter() {
  if (state.queue.length === 0 || !state.current) {
    elements.cardCounter.hidden = true;
    return;
  }

  elements.cardCounter.hidden = false;
  elements.cardCounter.textContent = `${state.queueIndex} / ${state.queue.length}`;
  elements.cardCounter.classList.remove('card-counter--bump');
  void elements.cardCounter.offsetWidth;
  elements.cardCounter.classList.add('card-counter--bump');
}

function scrollToBottom() {
  window.scrollTo({
    top: document.documentElement.scrollHeight,
    behavior: 'smooth',
  });
}

function showCompletionModal() {
  srsLog('showCompletionModal');
  pauseVideos();
  const stats = countSrsStats(getPlayableWords(), getAdminWordId);
  elements.completionMessage.textContent =
    stats.later > 0
      ? `今日の分は完了です。あと ${stats.later} 枚は予定日まで待ちます。`
      : '期限のカードをすべて復習しました。';
  elements.completionModal.hidden = false;
  elements.completionOkBtn.focus();
}

function hideCompletionModal() {
  elements.completionModal.hidden = true;
}

async function beginReview() {
  srsLog('beginReview:start', { wordCount: state.words.length });
  await detectAvailableVideos(state.words);
  state.queue = buildReviewQueue(getPlayableWords(), getAdminWordId);
  state.queueIndex = 0;
  srsLog('beginReview:queue-built', {
    playable: getPlayableWords().length,
    queueLength: state.queue.length,
    firstCard: state.queue[0]?.title ?? null,
  });
  renderSrsStats();
  loadQuestion();
}

function loadQuestion() {
  srsLog('loadQuestion:start', {
    queueIndex: state.queueIndex,
    queueLength: state.queue.length,
    currentTitle: state.current?.title ?? null,
    revealed: state.revealed,
  });

  resetReveal();
  pauseVideos();

  if (state.queue.length === 0) {
    srsLog('loadQuestion:empty-queue');
    state.current = null;
    elements.prompt.textContent =
      state.words.length === 0
        ? 'カードを追加してから復習を始めましょう。'
        : '今日の復習はありません。';
    renderQuestion();
    updateCounter();
    return;
  }

  if (state.queueIndex >= state.queue.length) {
    srsLog('loadQuestion:session-complete', {
      queueIndex: state.queueIndex,
      queueLength: state.queue.length,
    });
    showCompletionModal();
    return;
  }

  state.current = state.queue[state.queueIndex];
  state.queueIndex += 1;
  srsLog('loadQuestion:show-card', {
    title: state.current.title,
    wordId: getAdminWordId(state.current),
    queueIndex: state.queueIndex,
    queueLength: state.queue.length,
  });
  elements.prompt.textContent = PROMPTS[state.mode];
  renderQuestion();
  updateCounter();
}

function revealAnswer() {
  srsLog('revealAnswer:click', {
    hasCurrent: Boolean(state.current),
    revealed: state.revealed,
    title: state.current?.title ?? null,
  });

  if (!state.current || state.revealed) {
    srsLog('revealAnswer:skipped', {
      reason: !state.current ? 'no-current-card' : 'already-revealed',
    });
    return;
  }

  state.revealed = true;
  elements.revealBtn.hidden = true;
  elements.answerArea.hidden = false;
  elements.srsRatings.hidden = false;
  setRatingButtonsEnabled(true);
  renderAnswer();
  srsLog('revealAnswer:shown', {
    title: state.current.title,
    ratingsVisible: !elements.srsRatings.hidden,
  });
  requestAnimationFrame(scrollToBottom);

  const answerVideo = slots.answerMedia.querySelector('.quiz-video');
  answerVideo?.addEventListener('loadedmetadata', scrollToBottom, { once: true });
}

function handleRating(rating) {
  srsLog('handleRating:click', {
    rating,
    hasCurrent: Boolean(state.current),
    revealed: state.revealed,
    title: state.current?.title ?? null,
    queueIndex: state.queueIndex,
    queueLength: state.queue.length,
  });

  if (!state.current || !state.revealed) {
    srsLog('handleRating:skipped', {
      reason: !state.current ? 'no-current-card' : 'not-revealed',
      ratingsHidden: elements.srsRatings.hidden,
    });
    return;
  }

  const wordId = getAdminWordId(state.current);
  const entry = reviewCard(wordId, rating);
  srsLog('handleRating:saved', {
    rating,
    wordId,
    title: state.current.title,
    entry,
  });

  // Keep failed cards in this session so they come back soon.
  if (rating === 'again') {
    state.queue.push(state.current);
    srsLog('handleRating:requeued', { title: state.current.title, queueLength: state.queue.length });
  }

  renderSrsStats();
  loadQuestion();
}

async function setMode(mode) {
  state.mode = mode;
  elements.modeTabs.forEach((tab) => {
    const isActive = tab.dataset.mode === mode;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
  hideCompletionModal();
  await beginReview();
}

function setSection(section) {
  state.section = section;

  elements.sectionTabs.forEach((tab) => {
    const isActive = tab.dataset.section === section;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });

  const isReview = section === SECTIONS.REVIEW;
  elements.reviewSection.hidden = !isReview;
  elements.manageSection.hidden = isReview;

  if (isReview) {
    hideCompletionModal();
    void beginReview();
  } else {
    pauseVideos();
    refreshManage();
  }
}

async function processAndAddWord(word, button) {
  const video = elements.videoInput.files?.[0];
  if (!video) {
    throw new Error('追加する動画ファイルを選択してください。');
  }

  const nextWords = addAdminWord(word, state.words);
  button.disabled = true;
  setStatus(`「${word.title}」の動画を処理中…`);

  try {
    const fileName = videoOutputFileName(word.video);
    const response = await fetch(
      `/api/videos/process?fileName=${encodeURIComponent(fileName)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': video.type || 'application/octet-stream' },
        body: video,
      },
    );
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || '動画の処理に失敗しました。開発サーバーを確認してください。');
    }

    setStatus(`「${word.title}」を admin-words.js に保存中…`);
    await saveAdminWordsFile(nextWords);
    state.words = nextWords;
    elements.videoInput.value = '';
    return result;
  } finally {
    button.disabled = false;
  }
}

function refreshManage() {
  const words = state.words;
  elements.wordCount.textContent = `${words.length} 語`;
  elements.wordList.innerHTML = '';
  elements.emptyMessage.hidden = words.length > 0;

  for (const word of words) {
    const item = document.createElement('li');
    item.className = 'word-list-item';

    const entry = getSrsEntry(getAdminWordId(word));
    const text = document.createElement('div');
    text.className = 'word-list-text';
    text.innerHTML = `
      <p class="word-list-title">${word.title}</p>
      <p class="word-list-caption">${word.caption}</p>
      <p class="word-list-meta">SRS: ${formatDueLabel(entry)}</p>
    `;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-remove';
    removeBtn.textContent = '削除';
    removeBtn.addEventListener('click', async () => {
      removeBtn.disabled = true;
      setStatus(`「${word.title}」を削除中…`);

      try {
        const wordId = getAdminWordId(word);
        const nextWords = removeAdminWord(wordId, state.words);
        await saveAdminWordsFile(nextWords);
        removeSrsEntry(wordId);
        state.words = nextWords;
        refreshManage();
        setStatus(`「${word.title}」を削除し、admin-words.js を更新しました。`, 'success');
      } catch (error) {
        setStatus(error.message, 'error');
      } finally {
        removeBtn.disabled = false;
      }
    });

    item.append(text, removeBtn);
    elements.wordList.appendChild(item);
  }
}

async function handleManualAdd(event) {
  event.preventDefault();

  const caption = document.getElementById('manual-caption').value.trim();
  const existing = [...getWords(), ...state.words];
  const fileName = videoFileNameFromReading(caption, existing);
  const word = {
    id: crypto.randomUUID(),
    title: document.getElementById('manual-title').value.trim(),
    caption,
    video: `./videos/${fileName}`,
  };

  const addButton = elements.manualForm.querySelector('button[type="submit"]');

  try {
    const processed = await processAndAddWord(word, addButton);
    elements.manualForm.reset();
    refreshManage();
    setStatus(
      `「${word.title}」を追加し、${fileName}（${processed.duration.toFixed(2)}秒）を保存しました。`,
      'success',
    );
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

function bindEvents() {
  elements.sectionTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      setSection(tab.dataset.section);
    });
  });

  elements.modeTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      void setMode(tab.dataset.mode);
    });
  });

  elements.revealBtn.addEventListener('click', revealAnswer);

  elements.srsRatings.querySelectorAll('[data-rating]').forEach((button) => {
    button.addEventListener('click', (event) => {
      srsLog('ratingButton:click', {
        rating: button.dataset.rating,
        label: button.textContent?.trim(),
        target: event.target?.tagName,
        currentTarget: event.currentTarget?.tagName,
      });
      handleRating(button.dataset.rating);
    });
  });

  const ratingButtons = elements.srsRatings.querySelectorAll('[data-rating]');
  srsLog('bindEvents:rating-buttons', { count: ratingButtons.length });

  elements.completionOkBtn.addEventListener('click', () => {
    hideCompletionModal();
    void beginReview();
  });

  elements.manualForm.addEventListener('submit', (event) => {
    void handleManualAdd(event);
  });
}

async function init() {
  setupViewSlots();
  bindEvents();
  setRatingButtonsEnabled(false);
  setStatus('カードの追加・削除は src/data/admin-words.js に保存されます。SRS進捗はこのブラウザに保存されます。');
  await beginReview();
}

init();
