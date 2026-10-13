import { button, el } from './dom.js';

const NUDGE_SECONDS = 0.1;
const MIN_CROP = 0.05;
const MAX_CLIP_SECONDS = 30;

function formatTime(seconds) {
  return `${seconds.toFixed(1)}秒`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Trim + crop editor over a draft preview video.
 * Returns `{ getClip() }`; getClip() yields `{ start, end, crop }` or `{ error }`.
 */
export function mountClipEditor(root, draft) {
  const range = {
    start: draft.suggestedStart,
    end: Math.min(draft.suggestedEnd, draft.suggestedStart + MAX_CLIP_SECONDS),
  };
  let crop = null;

  const stage = el('div', 'clip-stage');
  const video = document.createElement('video');
  video.src = draft.preview;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  const cropLayer = el('div', 'crop-layer');
  cropLayer.hidden = true;
  const cropRect = el('div', 'crop-rect');
  cropRect.hidden = true;
  cropLayer.append(cropRect);
  stage.append(video, cropLayer);

  const playButton = button('再生', 'library-btn--primary', () => {
    if (video.paused) {
      if (video.currentTime < range.start || video.currentTime >= range.end) {
        video.currentTime = range.start;
      }
      void video.play();
    } else {
      video.pause();
    }
  });
  const seek = el('input', 'clip-seek');
  seek.type = 'range';
  seek.min = '0';
  seek.max = String(draft.duration);
  seek.step = '0.01';
  seek.value = '0';
  seek.setAttribute('aria-label', '再生位置');
  const timeLabel = el('span', 'clip-time', formatTime(0));
  const transport = el('div', 'clip-transport');
  transport.append(playButton, seek, timeLabel);

  const nudges = el('div', 'nudge-row');
  nudges.append(
    button(`◀ ${NUDGE_SECONDS}秒`, '', () => {
      video.pause();
      video.currentTime = clamp(video.currentTime - NUDGE_SECONDS, 0, draft.duration);
    }),
    button(`${NUDGE_SECONDS}秒 ▶`, '', () => {
      video.pause();
      video.currentTime = clamp(video.currentTime + NUDGE_SECONDS, 0, draft.duration);
    }),
  );

  const startValue = el('strong', null, formatTime(range.start));
  const endValue = el('strong', null, formatTime(range.end));
  const startCell = el('div', 'range-cell');
  startCell.append(
    el('span', null, '開始'),
    startValue,
    button('今の位置を開始に', '', () => {
      range.start = Math.min(video.currentTime, range.end - 0.1);
      renderRange();
    }),
  );
  const endCell = el('div', 'range-cell');
  endCell.append(
    el('span', null, '終了'),
    endValue,
    button('今の位置を終了に', '', () => {
      range.end = Math.max(video.currentTime, range.start + 0.1);
      renderRange();
    }),
  );
  const rangeRow = el('div', 'range-row');
  rangeRow.append(startCell, endCell);
  const rangeNote = el('p', 'form-hint');

  const cropToggleLabel = el('label', 'form-check');
  const cropToggle = el('input');
  cropToggle.type = 'checkbox';
  cropToggleLabel.append(cropToggle, document.createTextNode('切り抜く（動画の上をドラッグして範囲を指定）'));
  const cropReset = button('切り抜きをリセット', '', () => {
    crop = null;
    renderCrop();
  });
  cropReset.hidden = true;

  function renderRange() {
    startValue.textContent = formatTime(range.start);
    endValue.textContent = formatTime(range.end);
    const length = range.end - range.start;
    rangeNote.textContent =
      length > MAX_CLIP_SECONDS
        ? `長さ ${length.toFixed(1)}秒（${MAX_CLIP_SECONDS}秒以内にしてください）`
        : `長さ ${length.toFixed(1)}秒`;
    rangeNote.classList.toggle('form-hint--error', length > MAX_CLIP_SECONDS);
  }

  function renderCrop() {
    cropLayer.hidden = !cropToggle.checked;
    cropReset.hidden = !cropToggle.checked || !crop;
    cropRect.hidden = !crop;
    if (crop) {
      Object.assign(cropRect.style, {
        left: `${crop.x * 100}%`,
        top: `${crop.y * 100}%`,
        width: `${crop.w * 100}%`,
        height: `${crop.h * 100}%`,
      });
    }
  }

  function pointToFraction(event) {
    const rect = cropLayer.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };
  }

  let dragOrigin = null;
  cropLayer.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    cropLayer.setPointerCapture(event.pointerId);
    dragOrigin = pointToFraction(event);
    crop = { ...dragOrigin, w: 0, h: 0 };
    renderCrop();
  });
  cropLayer.addEventListener('pointermove', (event) => {
    if (!dragOrigin) return;
    const point = pointToFraction(event);
    crop = {
      x: Math.min(dragOrigin.x, point.x),
      y: Math.min(dragOrigin.y, point.y),
      w: Math.abs(point.x - dragOrigin.x),
      h: Math.abs(point.y - dragOrigin.y),
    };
    renderCrop();
  });
  const endDrag = () => {
    if (!dragOrigin) return;
    dragOrigin = null;
    if (crop && (crop.w < MIN_CROP || crop.h < MIN_CROP)) crop = null;
    renderCrop();
  };
  cropLayer.addEventListener('pointerup', endDrag);
  cropLayer.addEventListener('pointercancel', endDrag);
  cropToggle.addEventListener('change', renderCrop);

  let lastTime = 0;
  function tick() {
    if (!video.paused && lastTime < range.end && video.currentTime >= range.end) {
      video.currentTime = range.start;
    }
    lastTime = video.currentTime;
    seek.value = String(video.currentTime);
    timeLabel.textContent = formatTime(video.currentTime);
    if (!video.paused) requestAnimationFrame(tick);
  }
  video.addEventListener('play', () => {
    playButton.textContent = '一時停止';
    requestAnimationFrame(tick);
  });
  video.addEventListener('pause', () => {
    playButton.textContent = '再生';
  });
  video.addEventListener('seeked', tick);
  video.addEventListener('loadeddata', () => {
    video.currentTime = range.start;
  });
  seek.addEventListener('input', () => {
    video.currentTime = Number(seek.value);
  });

  root.replaceChildren(stage, transport, nudges, rangeRow, rangeNote, cropToggleLabel, cropReset);
  renderRange();
  renderCrop();

  return {
    getClip() {
      if (range.end - range.start > MAX_CLIP_SECONDS) {
        return { error: `切り出す範囲は${MAX_CLIP_SECONDS}秒以内にしてください。` };
      }
      return {
        start: Number(range.start.toFixed(3)),
        end: Number(range.end.toFixed(3)),
        crop: cropToggle.checked ? crop : null,
      };
    },
    pause() {
      video.pause();
    },
  };
}
