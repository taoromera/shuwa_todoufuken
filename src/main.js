import { getWords } from './data/word-store.js';
import {
  formatLessonLabel,
  getLessonsWithWords,
} from './data/lessons.js';
import { showQuizVideo } from './quiz-video.js';

const MODES = {
  SIGN_TO_WORD: 'sign-to-word',
  WORD_TO_SIGN: 'word-to-sign',
};

const PROMPTS = {
  [MODES.SIGN_TO_WORD]: '手話の動画を見て、言葉を思い出してみましょう。',
  [MODES.WORD_TO_SIGN]: '言葉の手話を思い浮かべてから、答えを見てみましょう。',
};

const ALL_LESSONS = 'all';

const state = {
  mode: MODES.SIGN_TO_WORD,
  selectedLessonId: ALL_LESSONS,
  current: null,
  revealed: false,
  deck: [],
  deckIndex: 0,
  availableVideos: new Set(),
};

const elements = {
  lessonSelect: document.getElementById('lesson-select'),
  modeTabs: document.querySelectorAll('.mode-tab'),
  prompt: document.getElementById('prompt'),
  questionArea: document.getElementById('question-area'),
  revealBtn: document.getElementById('reveal-btn'),
  answerArea: document.getElementById('answer-area'),
  nextBtn: document.getElementById('next-btn'),
  cardCounter: document.getElementById('card-counter'),
  completionModal: document.getElementById('completion-modal'),
  completionOkBtn: document.getElementById('completion-ok-btn'),
};

const slots = {
  questionMedia: document.createElement('div'),
  questionWord: document.createElement('div'),
  answerMedia: document.createElement('div'),
  emptyMessage: document.createElement('p'),
};

function getLessonWords() {
  // Class home: only lesson cards. Personal/admin cards live on /admin.
  return getWords().filter((word) => word.lesson != null);
}

function getActiveWords() {
  const words = getLessonWords();

  if (state.selectedLessonId === ALL_LESSONS) {
    return words;
  }

  return words.filter((word) => word.lesson === Number(state.selectedLessonId));
}

function countWordsForLesson(lessonId) {
  return getLessonWords().filter((word) => word.lesson === lessonId).length;
}

function populateLessonSelect() {
  elements.lessonSelect.innerHTML = '';

  const allOption = document.createElement('option');
  allOption.value = ALL_LESSONS;
  allOption.textContent = 'すべてのレッスン';
  elements.lessonSelect.appendChild(allOption);

  for (const lesson of getLessonsWithWords(getLessonWords())) {
    const wordCount = countWordsForLesson(lesson.id);
    const option = document.createElement('option');
    option.value = String(lesson.id);
    option.textContent = formatLessonLabel(lesson, { wordCount });
    elements.lessonSelect.appendChild(option);
  }

  elements.lessonSelect.value = state.selectedLessonId;
}

function updateCounter() {
  if (state.deck.length === 0 || !state.current) {
    elements.cardCounter.hidden = true;
    return;
  }

  elements.cardCounter.hidden = false;
  elements.cardCounter.textContent = `${state.deckIndex} / ${state.deck.length}`;
  elements.cardCounter.classList.remove('card-counter--bump');
  // Force a reflow so removing then re-adding the class always restarts the animation.
  void elements.cardCounter.offsetWidth;
  elements.cardCounter.classList.add('card-counter--bump');
}

async function detectAvailableVideos(words) {
  const checks = await Promise.all(
    words.map(async (word) => {
      if (!word.video) {
        return null;
      }

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
  return getActiveWords().filter((word) => state.availableVideos.has(word.video));
}

function shuffleArray(items) {
  const shuffled = [...items];

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

function resetDeck() {
  state.deck = shuffleArray(getPlayableWords());
  state.deckIndex = 0;
}

function setupViewSlots() {
  slots.emptyMessage.className = 'empty-message';
  slots.emptyMessage.innerHTML =
    'このレッスンで再生できる動画がまだありません。<br>videos フォルダに動画を追加してください。';

  elements.questionArea.replaceChildren(
    slots.questionMedia,
    slots.questionWord,
    slots.emptyMessage,
  );
  elements.answerArea.replaceChildren(slots.answerMedia);
}

function resetReveal() {
  state.revealed = false;
  elements.revealBtn.hidden = false;
  elements.answerArea.hidden = true;
  slots.answerMedia.replaceChildren();
  elements.nextBtn.hidden = true;
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

  if (!state.current) {
    return;
  }

  if (state.mode === MODES.SIGN_TO_WORD) {
    slots.answerMedia.appendChild(renderWordCard(state.current, { label: '答え' }));
    return;
  }

  showVideoIn(slots.answerMedia, state.current);
}

function scrollToBottom() {
  window.scrollTo({
    top: document.documentElement.scrollHeight,
    behavior: 'smooth',
  });
}

function showCompletionModal() {
  pauseVideos();
  elements.completionModal.hidden = false;
  elements.completionOkBtn.focus();
}

function hideCompletionModal() {
  elements.completionModal.hidden = true;
}

async function beginRound() {
  await detectAvailableVideos(getActiveWords());
  resetDeck();
  loadQuestion();
}

function loadQuestion() {
  resetReveal();
  pauseVideos();

  if (state.deck.length === 0) {
    state.current = null;
    elements.prompt.textContent = PROMPTS[state.mode];
    renderQuestion();
    updateCounter();
    elements.nextBtn.hidden = true;
    return;
  }

  if (state.deckIndex >= state.deck.length) {
    showCompletionModal();
    return;
  }

  state.current = state.deck[state.deckIndex];
  state.deckIndex += 1;
  elements.prompt.textContent = PROMPTS[state.mode];
  renderQuestion();
  updateCounter();
}

function revealAnswer() {
  if (!state.current || state.revealed) {
    return;
  }

  state.revealed = true;
  elements.revealBtn.hidden = true;
  elements.answerArea.hidden = false;
  elements.nextBtn.hidden = false;
  renderAnswer();

  requestAnimationFrame(scrollToBottom);

  const answerVideo = slots.answerMedia.querySelector('.quiz-video');
  answerVideo?.addEventListener('loadedmetadata', scrollToBottom, { once: true });
}

async function setMode(mode) {
  state.mode = mode;

  elements.modeTabs.forEach((tab) => {
    const isActive = tab.dataset.mode === mode;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });

  hideCompletionModal();
  await beginRound();
}

async function setSelectedLesson(lessonId) {
  state.selectedLessonId = lessonId;
  hideCompletionModal();
  await beginRound();
}

function startNewRound() {
  hideCompletionModal();
  void beginRound();
}

function bindEvents() {
  elements.lessonSelect.addEventListener('change', () => {
    void setSelectedLesson(elements.lessonSelect.value);
  });

  elements.modeTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      void setMode(tab.dataset.mode);
    });
  });

  elements.revealBtn.addEventListener('click', revealAnswer);
  elements.nextBtn.addEventListener('click', loadQuestion);
  elements.completionOkBtn.addEventListener('click', startNewRound);
}

async function init() {
  setupViewSlots();
  populateLessonSelect();
  bindEvents();
  await beginRound();
}

init();
