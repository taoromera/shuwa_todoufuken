import { button, el } from './dom.js';

const MAX_SECTION_SECONDS = 60;
const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const PLAYER_TIMEOUT_MS = 20_000;

let apiReady = null;

function loadYoutubeApi() {
  if (!apiReady) {
    apiReady = new Promise((resolve, reject) => {
      if (window.YT?.Player) {
        resolve(window.YT);
        return;
      }
      window.onYouTubeIframeAPIReady = () => resolve(window.YT);
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => {
        apiReady = null;
        reject(new Error('YouTube プレーヤーを読み込めませんでした。'));
      };
      document.head.append(script);
    });
  }
  return apiReady;
}

export function parseYoutubeId(value) {
  let url;
  try {
    url = new URL(String(value ?? '').trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id = null;
  if (host === 'youtu.be') {
    id = url.pathname.slice(1).split('/')[0];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v') ?? url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/]+)/)?.[1];
  }
  return id && ID_PATTERN.test(id) ? id : null;
}

function startSeconds(value) {
  try {
    const t = new URL(value).searchParams.get('t') ?? '';
    const match = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    if (!match) return 0;
    return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  } catch {
    return 0;
  }
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
}

/**
 * Embed the YouTube player for `url` and let the user mark a rough range.
 * Returns `{ getRange() }`; getRange() yields `{ start, end }` or `{ error }`.
 */
export async function mountYoutubePicker(root, url) {
  const videoId = parseYoutubeId(url);
  if (!videoId) throw new Error('YouTube の動画URLを入力してください。');

  const YT = await loadYoutubeApi();
  const frame = el('div', 'youtube-player');
  const target = el('div');
  frame.append(target);
  // YT.Player swaps `target` for an iframe, which only loads once it's in the document.
  root.replaceChildren(frame);

  const range = { start: null, end: null };
  const startValue = el('strong', null, '未設定');
  const endValue = el('strong', null, '未設定');
  const note = el('p', 'form-hint', `だいたいの範囲でOKです（${MAX_SECTION_SECONDS}秒以内）。次の画面で細かく調整できます。`);

  let player;
  try {
    player = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('YouTube プレーヤーを読み込めませんでした。')),
        PLAYER_TIMEOUT_MS,
      );
      const instance = new YT.Player(target, {
        videoId,
        playerVars: { playsinline: 1, rel: 0, start: Math.floor(startSeconds(url)) },
        events: {
          onReady: () => {
            clearTimeout(timer);
            resolve(instance);
          },
          onError: () => {
            clearTimeout(timer);
            reject(new Error('この YouTube 動画は再生できません。'));
          },
        },
      });
    });
  } catch (error) {
    root.replaceChildren();
    throw error;
  }

  function render() {
    startValue.textContent = range.start == null ? '未設定' : formatTime(range.start);
    endValue.textContent = range.end == null ? '未設定' : formatTime(range.end);
  }

  const startCell = el('div', 'range-cell');
  startCell.append(
    el('span', null, '開始'),
    startValue,
    button('今の位置を開始に', '', () => {
      range.start = player.getCurrentTime();
      if (range.end != null && range.end <= range.start) range.end = null;
      render();
    }),
  );
  const endCell = el('div', 'range-cell');
  endCell.append(
    el('span', null, '終了'),
    endValue,
    button('今の位置を終了に', '', () => {
      range.end = player.getCurrentTime();
      if (range.start != null && range.start >= range.end) range.start = null;
      render();
    }),
  );
  const rangeRow = el('div', 'range-row');
  rangeRow.append(startCell, endCell);

  root.append(rangeRow, note);

  return {
    getRange() {
      if (range.start == null || range.end == null) {
        return { error: '開始と終了の位置を設定してください。' };
      }
      if (range.end - range.start > MAX_SECTION_SECONDS) {
        return { error: `範囲は${MAX_SECTION_SECONDS}秒以内にしてください。` };
      }
      player.pauseVideo();
      const padding = range.end - range.start + 1 <= MAX_SECTION_SECONDS ? 0.5 : 0;
      return {
        start: Math.max(0, Number((range.start - padding).toFixed(2))),
        end: Number((range.end + padding).toFixed(2)),
      };
    },
  };
}
