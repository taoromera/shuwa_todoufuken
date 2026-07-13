import { LESSONS, formatLessonLabel } from './data/lessons.js';
import { searchNhkWords, toLessonWord } from './data/nhk-lookup.js';
import { videoFileName } from './data/videos.js';
import {
  addWord,
  exportWordsJs,
  getWordsForLesson,
  hasCustomWords,
  removeWord,
  resetWords,
} from './data/word-store.js';

const elements = {
  lessonSelect: document.getElementById('lesson-select'),
  status: document.getElementById('status'),
  wordList: document.getElementById('word-list'),
  wordCount: document.getElementById('word-count'),
  emptyMessage: document.getElementById('empty-message'),
  searchForm: document.getElementById('search-form'),
  searchInput: document.getElementById('search-input'),
  searchResults: document.getElementById('search-results'),
  videoInput: document.getElementById('video-input'),
  manualForm: document.getElementById('manual-form'),
  exportBtn: document.getElementById('export-btn'),
  resetBtn: document.getElementById('reset-btn'),
};

let selectedLessonId = LESSONS[0]?.id ?? 1;

function setStatus(message, type = '') {
  elements.status.textContent = message;
  elements.status.className = `manage-status${type ? ` is-${type}` : ''}`;
}

function getSelectedLessonId() {
  return Number(elements.lessonSelect.value);
}

async function processAndAddWord(word, button) {
  const video = elements.videoInput.files?.[0];
  if (!video) {
    throw new Error('追加する動画ファイルを選択してください。');
  }

  const duplicate = getWordsForLesson(word.lesson).some((entry) => entry.code === word.code);
  if (duplicate) {
    throw new Error(`「${word.title}」はこのレッスンに既に追加されています。`);
  }

  button.disabled = true;
  setStatus(`「${word.title}」の動画を処理中…`);

  try {
    const fileName = videoFileName(word);
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

    addWord(word);
    elements.videoInput.value = '';
    return result;
  } finally {
    button.disabled = false;
  }
}

function populateLessonSelect() {
  elements.lessonSelect.innerHTML = '';

  for (const lesson of LESSONS) {
    const option = document.createElement('option');
    const wordCount = getWordsForLesson(lesson.id).length;
    option.value = String(lesson.id);
    option.textContent = formatLessonLabel(lesson, { wordCount });
    elements.lessonSelect.appendChild(option);
  }

  elements.lessonSelect.value = String(selectedLessonId);
}

function renderWordList() {
  const lessonId = getSelectedLessonId();
  const words = getWordsForLesson(lessonId);

  elements.wordCount.textContent = `${words.length} 語`;
  elements.wordList.innerHTML = '';
  elements.emptyMessage.hidden = words.length > 0;

  for (const word of words) {
    const item = document.createElement('li');
    item.className = 'word-list-item';

    const text = document.createElement('div');
    text.className = 'word-list-text';
    text.innerHTML = `
      <p class="word-list-title">${word.title}</p>
      <p class="word-list-caption">${word.caption}</p>
      <p class="word-list-meta">${word.subdir} · ${word.code} · ${videoFileName(word)}</p>
    `;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-remove';
    removeBtn.textContent = '削除';
    removeBtn.addEventListener('click', () => {
      removeWord(lessonId, word.code);
      refresh();
      setStatus(`「${word.title}」を削除しました。`, 'success');
    });

    item.append(text, removeBtn);
    elements.wordList.appendChild(item);
  }
}

function renderSearchResults(results) {
  elements.searchResults.innerHTML = '';
  elements.searchResults.hidden = results.length === 0;

  if (results.length === 0) {
    return;
  }

  for (const result of results) {
    const item = document.createElement('li');
    item.className = 'search-result-item';

    const text = document.createElement('div');
    text.className = 'word-list-text';
    text.innerHTML = `
      <p class="word-list-title">${result.title}</p>
      <p class="word-list-caption">${result.caption}</p>
      <p class="word-list-meta">${result.subdir} · ${result.code} · ${videoFileName(result)}</p>
    `;

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn-pick';
    addBtn.textContent = '追加';
    addBtn.addEventListener('click', async () => {
      try {
        const word = toLessonWord(result, getSelectedLessonId());
        const processed = await processAndAddWord(word, addBtn);
        elements.searchResults.hidden = true;
        elements.searchInput.value = '';
        refresh();
        setStatus(
          `「${word.title}」を追加し、動画を${processed.duration.toFixed(2)}秒に切り抜きました。`,
          'success',
        );
      } catch (error) {
        setStatus(error.message, 'error');
      }
    });

    item.append(text, addBtn);
    elements.searchResults.appendChild(item);
  }
}

function refresh() {
  selectedLessonId = getSelectedLessonId();
  populateLessonSelect();
  renderWordList();
}

async function handleManualAdd(event) {
  event.preventDefault();

  const word = {
    lesson: getSelectedLessonId(),
    title: document.getElementById('manual-title').value.trim(),
    caption: document.getElementById('manual-caption').value.trim(),
    subdir: document.getElementById('manual-subdir').value,
    code: document.getElementById('manual-code').value.trim(),
    avatarId: 1,
  };

  const addButton = elements.manualForm.querySelector('button[type="submit"]');

  try {
    const processed = await processAndAddWord(word, addButton);
    elements.manualForm.reset();
    refresh();
    setStatus(
      `「${word.title}」を追加し、動画を${processed.duration.toFixed(2)}秒に切り抜きました。`,
      'success',
    );
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function handleSearch(event) {
  event.preventDefault();

  const query = elements.searchInput.value.trim();
  if (!query) {
    setStatus('検索する言葉を入力してください。', 'error');
    return;
  }

  setStatus('検索中…');

  try {
    const results = await searchNhkWords(query);
    renderSearchResults(results);

    if (results.length === 0) {
      setStatus(`「${query}」の検索結果はありませんでした。`, 'error');
      return;
    }

    setStatus(`${results.length} 件見つかりました。`);
  } catch (error) {
    renderSearchResults([]);
    setStatus(error.message, 'error');
  }
}

function handleExport() {
  const content = exportWordsJs();
  const blob = new Blob([content], { type: 'text/javascript;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'words.js';
  link.click();
  URL.revokeObjectURL(url);
  setStatus('words.js をダウンロードしました。src/data/words.js に上書きして保存できます。', 'success');
}

function handleReset() {
  const confirmed = window.confirm(
    'ブラウザに保存した変更を破棄し、元の words.js の内容に戻しますか？',
  );

  if (!confirmed) {
    return;
  }

  resetWords();
  refresh();
  elements.searchResults.hidden = true;
  setStatus('初期データに戻しました。', 'success');
}

function bindEvents() {
  elements.lessonSelect.addEventListener('change', () => {
    refresh();
    setStatus('');
  });

  elements.searchForm.addEventListener('submit', handleSearch);
  elements.manualForm.addEventListener('submit', handleManualAdd);
  elements.exportBtn.addEventListener('click', handleExport);
  elements.resetBtn.addEventListener('click', handleReset);
}

function init() {
  bindEvents();
  refresh();

  if (hasCustomWords()) {
    setStatus('ブラウザに保存した変更が反映されています。');
  }
}

init();
