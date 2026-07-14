import { LESSONS, formatLessonLabel } from './data/lessons.js';
import { videoFileNameFromReading } from './data/romanize.js';
import {
  addWord,
  getWordId,
  getWords,
  removeWord,
  saveWordsFile,
} from './data/word-store.js';

function videoOutputFileName(videoPath) {
  return videoPath.split('/').pop();
}

const elements = {
  lessonSelect: document.getElementById('lesson-select'),
  status: document.getElementById('status'),
  wordList: document.getElementById('word-list'),
  wordCount: document.getElementById('word-count'),
  emptyMessage: document.getElementById('empty-message'),
  videoInput: document.getElementById('video-input'),
  manualForm: document.getElementById('manual-form'),
};

let selectedLessonId = null;
let words = getWords();

function setStatus(message, type = '') {
  elements.status.textContent = message;
  elements.status.className = `manage-status${type ? ` is-${type}` : ''}`;
}

function getSelectedLessonId() {
  const value = elements.lessonSelect.value;
  return value ? Number(value) : null;
}

function hasSelectedLesson() {
  return getSelectedLessonId() != null;
}

function wordsForLesson(lessonId) {
  return words.filter((word) => word.lesson === lessonId);
}

function updateAddFormState() {
  const enabled = hasSelectedLesson();
  const addButton = elements.manualForm.querySelector('button[type="submit"]');

  elements.manualForm.querySelectorAll('input').forEach((input) => {
    input.disabled = !enabled;
  });
  elements.videoInput.disabled = !enabled;
  if (addButton) {
    addButton.disabled = !enabled;
  }
}

async function processAndAddWord(word, button) {
  const video = elements.videoInput.files?.[0];
  if (!video) {
    throw new Error('追加する動画ファイルを選択してください。');
  }

  const nextWords = addWord(word, words);

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

    setStatus(`「${word.title}」を words.js に保存中…`);
    await saveWordsFile(nextWords);
    words = nextWords;
    elements.videoInput.value = '';
    return result;
  } finally {
    button.disabled = false;
  }
}

function populateLessonSelect() {
  elements.lessonSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'レッスンを選択';
  elements.lessonSelect.appendChild(placeholder);

  for (const lesson of LESSONS) {
    const option = document.createElement('option');
    const wordCount = wordsForLesson(lesson.id).length;
    option.value = String(lesson.id);
    option.textContent = formatLessonLabel(lesson, { wordCount });
    elements.lessonSelect.appendChild(option);
  }

  elements.lessonSelect.value =
    selectedLessonId != null ? String(selectedLessonId) : '';
}

function renderWordList() {
  const lessonId = getSelectedLessonId();

  if (lessonId == null) {
    elements.wordCount.textContent = '';
    elements.wordList.innerHTML = '';
    elements.emptyMessage.hidden = false;
    elements.emptyMessage.textContent = 'レッスンを選択してください。';
    return;
  }

  const lessonWords = wordsForLesson(lessonId);

  elements.wordCount.textContent = `${lessonWords.length} 語`;
  elements.wordList.innerHTML = '';
  elements.emptyMessage.textContent = 'このレッスンにはまだ単語がありません。';
  elements.emptyMessage.hidden = lessonWords.length > 0;

  for (const word of lessonWords) {
    const item = document.createElement('li');
    item.className = 'word-list-item';

    const text = document.createElement('div');
    text.className = 'word-list-text';
    text.innerHTML = `
      <p class="word-list-title">${word.title}</p>
      <p class="word-list-caption">${word.caption}</p>
    `;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-remove';
    removeBtn.textContent = '削除';
    removeBtn.addEventListener('click', async () => {
      removeBtn.disabled = true;
      setStatus(`「${word.title}」を削除中…`);

      try {
        const nextWords = removeWord(lessonId, getWordId(word), words);
        await saveWordsFile(nextWords);
        words = nextWords;
        refresh();
        setStatus(`「${word.title}」を削除し、words.js を更新しました。`, 'success');
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

function refresh() {
  selectedLessonId = getSelectedLessonId();
  populateLessonSelect();
  renderWordList();
  updateAddFormState();
}

async function handleManualAdd(event) {
  event.preventDefault();

  const lessonId = getSelectedLessonId();
  if (lessonId == null) {
    setStatus('レッスンを選択してください。', 'error');
    return;
  }

  const caption = document.getElementById('manual-caption').value.trim();
  const fileName = videoFileNameFromReading(caption, words);
  const word = {
    id: crypto.randomUUID(),
    lesson: lessonId,
    title: document.getElementById('manual-title').value.trim(),
    caption,
    video: `./videos/${fileName}`,
  };

  const addButton = elements.manualForm.querySelector('button[type="submit"]');

  try {
    const processed = await processAndAddWord(word, addButton);
    elements.manualForm.reset();
    refresh();
    setStatus(
      `「${word.title}」を追加し、${fileName}（${processed.duration.toFixed(2)}秒）を保存、words.js を更新しました。`,
      'success',
    );
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

function bindEvents() {
  elements.lessonSelect.addEventListener('change', () => {
    refresh();
    setStatus('');
  });

  elements.manualForm.addEventListener('submit', handleManualAdd);
}

function init() {
  bindEvents();
  refresh();
  setStatus('まずレッスンを選択してください。追加・削除は src/data/words.js に保存されます。');
}

init();
