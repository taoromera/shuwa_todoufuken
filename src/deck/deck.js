import { mountAppHeader } from '../auth/user-menu.js';
import { studyDayStart } from '../study/study-api.js';
import { deleteCard, listCards, updateCard } from './cards-api.js';
import { button, el, playToggle, textField } from './dom.js';

const elements = {
  filter: document.getElementById('deck-filter'),
  count: document.getElementById('deck-count'),
  list: document.getElementById('deck-list'),
  flash: document.getElementById('deck-flash'),
};

const DAY_MS = 24 * 60 * 60 * 1000;

const state = { cards: [] };

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u30a1-\u30f6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .toLowerCase();
}

/** Study days until the card is shown again; new and overdue cards are due today. */
function dueLabel(due) {
  if (!due) return '今日';
  const days = Math.round((studyDayStart(new Date(due)) - studyDayStart()) / DAY_MS);
  return days > 0 ? `${days}日後` : '今日';
}

function renderEditForm(card, row) {
  const form = el('form', 'library-edit auth-form');
  form.noValidate = true;
  form.append(
    textField({ name: 'title', label: '言葉', value: card.title, required: true }),
    textField({ name: 'caption', label: '読み', value: card.caption }),
    textField({ name: 'notes', label: 'メモ', value: card.notes, multiline: true }),
  );

  const status = el('p', 'form-status form-status--error');
  status.hidden = true;
  const actions = el('div', 'library-actions');
  const save = el('button', 'library-btn library-btn--primary', '保存');
  save.type = 'submit';
  actions.append(save, button('キャンセル', '', () => row.replaceWith(renderCard(card))));
  form.append(status, actions);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    save.disabled = true;
    try {
      const { card: updated } = await updateCard(card.id, {
        title: data.get('title'),
        caption: data.get('caption'),
        notes: data.get('notes'),
      });
      state.cards = state.cards.map((item) => (item.id === updated.id ? updated : item));
      row.replaceWith(renderCard(updated));
    } catch (error) {
      status.textContent = error.message;
      status.hidden = false;
      save.disabled = false;
    }
  });
  return form;
}

function renderCard(card) {
  const row = el('article', 'library-item');
  const header = el('div', 'library-item-header');
  const text = el('div', 'library-item-text');
  text.append(
    el('p', 'library-item-title', card.title),
    el('p', 'library-item-caption', `次の復習: ${dueLabel(card.due)}`),
  );
  if (card.notes) text.append(el('p', 'deck-notes', card.notes));

  const media = el('div', 'library-item-media');
  media.hidden = true;
  const actions = el('div', 'library-actions');
  if (card.video) actions.append(playToggle(media, card.video, card.title));
  actions.append(
    button('編集', '', () => row.replaceChildren(renderEditForm(card, row))),
    button('削除', 'library-btn--danger', async () => {
      if (!window.confirm(`「${card.title}」を単語帳から削除しますか？`)) return;
      try {
        await deleteCard(card.id);
        state.cards = state.cards.filter((item) => item.id !== card.id);
        row.remove();
        updateCount();
      } catch (error) {
        window.alert(error.message);
      }
    }),
  );

  header.append(text, actions);
  row.append(header, media);
  return row;
}

function visibleCards() {
  const query = normalize(elements.filter.value.trim());
  if (!query) return state.cards;
  return state.cards.filter((card) =>
    [card.title, card.caption, card.notes].some((value) => normalize(value).includes(query)),
  );
}

function updateCount() {
  const visible = visibleCards().length;
  if (state.cards.length === 0) {
    elements.count.textContent = '単語帳はまだ空です。「カードを追加」から始めましょう。';
  } else if (visible === state.cards.length) {
    elements.count.textContent = `${state.cards.length}枚`;
  } else {
    elements.count.textContent = `${state.cards.length}枚中 ${visible}枚`;
  }
}

function render() {
  elements.list.replaceChildren(...visibleCards().map(renderCard));
  updateCount();
}

async function init() {
  mountAppHeader();

  const added = new URLSearchParams(window.location.search).get('added');
  if (added) {
    elements.flash.textContent = `「${added}」を単語帳に追加しました。`;
    elements.flash.hidden = false;
    window.history.replaceState(null, '', '/deck');
  }

  elements.filter.addEventListener('input', render);
  try {
    ({ items: state.cards } = await listCards());
    render();
  } catch (error) {
    elements.count.textContent = error.message;
  }
}

void init();
