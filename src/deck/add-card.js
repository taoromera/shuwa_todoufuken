import { mountAppHeader } from '../auth/user-menu.js';
import { searchLibrary } from '../library/library-api.js';
import {
  createCard,
  createYoutubeDraft,
  discardDraft,
  finalizeDraft,
  listCards,
  uploadDraft,
} from './cards-api.js';
import { mountClipEditor } from './clip-editor.js';
import { button, el, playToggle, signVideo, textField } from './dom.js';
import { mountYoutubePicker } from './youtube-picker.js';

const SEARCH_DEBOUNCE_MS = 250;
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

const $ = (id) => document.getElementById(id);
const steps = ['step-search', 'step-library', 'step-youtube', 'step-upload', 'step-edit'].map($);

const state = {
  inDeck: new Set(),
  searchRequest: 0,
  draft: null,
  editor: null,
  youtubePicker: null,
};

function showStep(id) {
  for (const step of steps) step.hidden = step.id !== id;
  window.scrollTo({ top: 0 });
}

function setStatus(node, message) {
  node.textContent = message;
  node.hidden = !message;
}

function goToDeck(title) {
  window.location.assign(`/deck?added=${encodeURIComponent(title)}`);
}

function currentQuery() {
  return $('word-query').value.trim();
}

/** Title / reading / notes fields plus submit + back buttons. */
function buildLabelsForm(form, { title, caption, notes = '', submitLabel, onSubmit, onBack }) {
  const status = el('p', 'form-status form-status--error');
  status.hidden = true;
  status.setAttribute('role', 'alert');
  const busy = el('p', 'busy-note');
  busy.hidden = true;
  const submit = el('button', 'btn btn-next', submitLabel);
  submit.type = 'submit';
  const back = el('button', 'btn btn-secondary', '戻る');
  back.type = 'button';
  back.addEventListener('click', onBack);

  form.replaceChildren(
    textField({ name: 'title', label: '言葉', value: title, required: true }),
    textField({ name: 'caption', label: '読み（ひらがな）', value: caption }),
    textField({ name: 'notes', label: 'メモ（任意）', value: notes, multiline: true, hint: '覚え方のコツなど、自分用のメモ' }),
    status,
    busy,
    submit,
    back,
  );

  form.onsubmit = async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const fields = {
      title: String(data.get('title') ?? '').trim(),
      caption: String(data.get('caption') ?? '').trim(),
      notes: String(data.get('notes') ?? '').trim(),
    };
    if (!fields.title) {
      setStatus(status, '言葉を入力してください。');
      return;
    }

    setStatus(status, '');
    submit.disabled = true;
    back.disabled = true;
    try {
      await onSubmit(fields, (message) => setStatus(busy, message));
    } catch (error) {
      setStatus(busy, '');
      setStatus(status, error.message);
      submit.disabled = false;
      back.disabled = false;
    }
  };
}

// --- Step 1: library search -------------------------------------------------

function renderResult(item) {
  const row = el('article', 'library-item');
  const header = el('div', 'library-item-header');
  const text = el('div', 'library-item-text');
  text.append(el('p', 'library-item-title', item.title));
  if (item.caption && item.caption !== item.title) {
    text.append(el('p', 'library-item-caption', item.caption));
  }

  const media = el('div', 'library-item-media');
  media.hidden = true;
  const actions = el('div', 'library-actions');
  actions.append(playToggle(media, item.video, item.title));

  if (state.inDeck.has(item.id)) {
    const added = button('追加済み', '', () => {});
    added.disabled = true;
    actions.append(added);
  } else {
    actions.append(button('選ぶ', 'library-btn--primary', () => chooseLibraryVideo(item)));
  }

  header.append(text, actions);
  row.append(header, media);
  return row;
}

async function runSearch() {
  const requestId = ++state.searchRequest;
  const query = currentQuery();
  const results = $('search-results');
  const count = $('search-count');

  if (!query) {
    results.replaceChildren();
    count.textContent = '';
    return;
  }

  try {
    const { total, items } = await searchLibrary(query, { limit: 20 });
    if (requestId !== state.searchRequest) return;
    results.replaceChildren(...items.map(renderResult));
    count.textContent =
      total === 0
        ? `「${query}」の動画はライブラリにありません。下から新しく追加できます。`
        : `ライブラリに ${total}件`;
  } catch (error) {
    if (requestId === state.searchRequest) count.textContent = error.message;
  }
}

// --- Step 2a: library video → card --------------------------------------------

function chooseLibraryVideo(item) {
  $('library-preview').replaceChildren(signVideo(item.video, item.title));
  buildLabelsForm($('library-form'), {
    title: item.title,
    caption: item.caption,
    submitLabel: '単語帳に追加',
    onBack: () => {
      $('library-preview').replaceChildren();
      showStep('step-search');
    },
    onSubmit: async (fields) => {
      const { card } = await createCard({ ...fields, libraryVideoId: item.id });
      goToDeck(card.title);
    },
  });
  showStep('step-library');
}

// --- Step 2b: YouTube ---------------------------------------------------------

function resetYoutubeStep() {
  state.youtubePicker = null;
  $('youtube-picker').replaceChildren();
  $('youtube-fetch').hidden = true;
  setStatus($('youtube-status'), '');
}

/** Block the whole page (pointer, keyboard and screen readers) while `task` runs. */
async function withLoadingOverlay(task) {
  const overlay = $('loading-overlay');
  const background = [...document.body.children].filter(
    (node) => node !== overlay && node.tagName !== 'SCRIPT',
  );
  for (const node of background) node.inert = true;
  overlay.hidden = false;
  try {
    return await task();
  } finally {
    overlay.hidden = true;
    for (const node of background) node.inert = false;
  }
}

$('youtube-url-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  resetYoutubeStep();
  const load = $('youtube-load');
  load.disabled = true;
  load.textContent = '読み込み中…';
  try {
    state.youtubePicker = await mountYoutubePicker($('youtube-picker'), $('youtube-url').value);
    $('youtube-fetch').hidden = false;
  } catch (error) {
    setStatus($('youtube-status'), error.message);
  } finally {
    load.disabled = false;
    load.textContent = '動画を読み込む';
  }
});

$('youtube-fetch').addEventListener('click', async () => {
  const range = state.youtubePicker?.getRange();
  if (!range) return;
  if (range.error) {
    setStatus($('youtube-status'), range.error);
    return;
  }

  setStatus($('youtube-status'), '');
  const url = $('youtube-url').value.trim();
  try {
    const { draft } = await withLoadingOverlay(() => createYoutubeDraft({ url, ...range }));
    openEditor(draft, { title: '', notes: url });
  } catch (error) {
    setStatus($('youtube-status'), error.message);
  }
});

// --- Step 2c: upload ------------------------------------------------------------

$('upload-file').addEventListener('change', async () => {
  const input = $('upload-file');
  const file = input.files?.[0];
  if (!file) return;

  const status = $('upload-status');
  const busy = $('upload-busy');
  const progress = $('upload-progress');
  const bar = $('upload-progress-bar');
  setStatus(status, '');

  if (file.size > MAX_UPLOAD_BYTES) {
    setStatus(status, '動画ファイルは200MB以下にしてください。');
    input.value = '';
    return;
  }

  input.disabled = true;
  progress.hidden = false;
  bar.style.width = '0%';
  setStatus(busy, 'アップロード中…');
  try {
    const { draft } = await uploadDraft(file, (fraction) => {
      bar.style.width = `${Math.round(fraction * 100)}%`;
      if (fraction >= 1) setStatus(busy, '動画を読み込んでいます…');
    });
    openEditor(draft);
  } catch (error) {
    setStatus(status, error.message);
  } finally {
    input.disabled = false;
    input.value = '';
    progress.hidden = true;
    setStatus(busy, '');
  }
});

// --- Step 3: trim / crop / save -------------------------------------------------

function leaveEditor() {
  state.editor?.pause();
  if (state.draft) void discardDraft(state.draft.id);
  state.draft = null;
  state.editor = null;
  $('clip-editor').replaceChildren();
  showStep('step-search');
}

function openEditor(draft, { title = currentQuery(), notes = '' } = {}) {
  state.draft = draft;
  state.editor = mountClipEditor($('clip-editor'), draft);
  buildLabelsForm($('edit-form'), {
    title,
    caption: '',
    notes,
    submitLabel: '保存して単語帳に追加',
    onBack: leaveEditor,
    onSubmit: async (fields, setBusy) => {
      const clip = state.editor.getClip();
      if (clip.error) throw new Error(clip.error);
      state.editor.pause();
      setBusy('動画を変換しています…（数十秒かかることがあります）');
      const { card } = await finalizeDraft(draft.id, { ...fields, ...clip });
      state.draft = null;
      goToDeck(card.title);
    },
  });
  showStep('step-edit');
}

// --- Wiring ---------------------------------------------------------------------

let debounceTimer = null;
$('word-query').addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
});
$('choose-youtube').addEventListener('click', () => {
  resetYoutubeStep();
  showStep('step-youtube');
  $('youtube-url').focus();
});
$('choose-upload').addEventListener('click', () => {
  setStatus($('upload-status'), '');
  showStep('step-upload');
});
for (const back of document.querySelectorAll('[data-back]')) {
  back.addEventListener('click', () => {
    // A hidden YouTube iframe would keep playing, so drop it.
    resetYoutubeStep();
    showStep('step-search');
  });
}

async function init() {
  mountAppHeader();
  $('word-query').focus();
  try {
    const { items } = await listCards();
    state.inDeck = new Set(items.map((card) => card.libraryVideoId));
  } catch {
    // Search still works; duplicates are rejected by the server.
  }
}

void init();
