import { getCurrentUser, mountAppHeader } from '../auth/user-menu.js';
import { deleteLibraryVideo, searchLibrary, updateLibraryVideo } from './library-api.js';

const SEARCH_DEBOUNCE_MS = 250;

const elements = {
  query: document.getElementById('library-query'),
  count: document.getElementById('library-count'),
  list: document.getElementById('library-list'),
};

const state = {
  isAdmin: false,
  requestId: 0,
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(label, className, onClick) {
  const node = el('button', `library-btn ${className}`, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

function renderVideo(item) {
  const video = document.createElement('video');
  video.className = 'quiz-video';
  video.src = item.video;
  video.controls = true;
  video.loop = true;
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('aria-label', `${item.title}の手話動画`);
  return video;
}

function renderEditForm(item, row) {
  const form = el('form', 'library-edit auth-form');
  form.noValidate = true;

  const fields = [
    ['title', '言葉', item.title],
    ['caption', '読み', item.caption],
    ['aliases', '別名（読点「、」区切り）', item.aliases.join('、')],
  ];
  for (const [name, label, value] of fields) {
    const wrapper = el('div', 'form-field');
    const id = `${name}-${item.id}`;
    const labelNode = el('label', null, label);
    labelNode.htmlFor = id;
    const input = el('input');
    input.id = id;
    input.name = name;
    input.value = value;
    wrapper.append(labelNode, input);
    form.append(wrapper);
  }

  const status = el('p', 'form-status form-status--error');
  status.hidden = true;
  const actions = el('div', 'library-actions');
  const save = el('button', 'library-btn library-btn--primary', '保存');
  save.type = 'submit';
  actions.append(save, button('キャンセル', '', () => row.replaceWith(renderRow(item))));
  form.append(status, actions);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    save.disabled = true;
    try {
      const { item: updated } = await updateLibraryVideo(item.id, {
        title: data.get('title'),
        caption: data.get('caption'),
        aliases: String(data.get('aliases') ?? '').split(/[、,，]/),
      });
      row.replaceWith(renderRow(updated));
    } catch (error) {
      status.textContent = error.message;
      status.hidden = false;
      save.disabled = false;
    }
  });

  return form;
}

function renderRow(item) {
  const row = el('article', 'library-item');
  const header = el('div', 'library-item-header');
  const text = el('div', 'library-item-text');
  text.append(el('p', 'library-item-title', item.title));
  if (item.caption && item.caption !== item.title) {
    text.append(el('p', 'library-item-caption', item.caption));
  }
  if (item.aliases.length) {
    text.append(el('p', 'library-item-aliases', `別名：${item.aliases.join('、')}`));
  }

  const actions = el('div', 'library-actions');
  const media = el('div', 'library-item-media');
  media.hidden = true;

  const playButton = button('再生', 'library-btn--primary', () => {
    const opening = media.hidden;
    media.hidden = !opening;
    playButton.textContent = opening ? '閉じる' : '再生';
    media.replaceChildren(...(opening ? [renderVideo(item)] : []));
  });
  actions.append(playButton);

  if (state.isAdmin) {
    actions.append(
      button('編集', '', () => {
        row.replaceChildren(renderEditForm(item, row));
      }),
      button('削除', 'library-btn--danger', async () => {
        if (
          !window.confirm(
            `「${item.title}」の動画をライブラリから削除しますか？\nこの動画を使っている全ユーザーのカードも削除されます。この操作は取り消せません。`,
          )
        ) {
          return;
        }
        try {
          await deleteLibraryVideo(item.id);
          row.remove();
        } catch (error) {
          window.alert(error.message);
        }
      }),
    );
  }

  header.append(text, actions);
  row.append(header, media);
  return row;
}

async function runSearch() {
  const requestId = ++state.requestId;
  const query = elements.query.value.trim();

  try {
    const { total, items } = await searchLibrary(query);
    if (requestId !== state.requestId) return;

    elements.list.replaceChildren(...items.map(renderRow));
    if (total === 0) {
      elements.count.textContent = query ? `「${query}」に一致する動画はありません。` : 'ライブラリはまだ空です。';
    } else if (total > items.length) {
      elements.count.textContent = `${total}件中 ${items.length}件を表示（検索で絞り込めます）`;
    } else {
      elements.count.textContent = `${total}件`;
    }
  } catch (error) {
    if (requestId !== state.requestId) return;
    elements.count.textContent = error.message;
  }
}

let debounceTimer = null;
elements.query.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
});

async function init() {
  mountAppHeader();
  const user = await getCurrentUser();
  state.isAdmin = user?.role === 'admin';
  await runSearch();
}

void init();
