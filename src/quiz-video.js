import { needsLabelCrop, scaledBottomCropPixels } from './video-crop.js';

function applyLabelCrop(frame, video) {
  const bottom = scaledBottomCropPixels(video.videoHeight);
  frame.classList.add('quiz-video-frame--cropped');
  frame.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight - bottom}`;
}

export function renderQuizVideo(
  word,
  { autoplay = true, controls = true, loop = true, hideLabel = false } = {},
) {
  const frame = document.createElement('div');
  frame.className = 'quiz-video-frame';

  const video = document.createElement('video');
  video.className = 'quiz-video';
  video.src = word.video;
  video.playsInline = true;
  video.controls = controls;
  video.preload = 'auto';
  video.setAttribute('aria-label', `${word.title}の手話動画`);

  if (autoplay) {
    video.autoplay = true;
    video.muted = true;
    video.addEventListener(
      'loadeddata',
      () => {
        void video.play().catch(() => {});
      },
      { once: true },
    );
  }

  if (loop) {
    video.loop = true;
  }

  if (hideLabel) {
    video.addEventListener(
      'loadedmetadata',
      () => {
        if (needsLabelCrop(video.videoWidth, video.videoHeight)) {
          applyLabelCrop(frame, video);
        }
      },
      { once: true },
    );
  }

  frame.appendChild(video);
  return frame;
}

export function renderMissingVideo(word) {
  const missing = document.createElement('p');
  missing.className = 'missing-video';
  missing.textContent = `「${word.title}」の動画（${word.video}）がまだありません。`;
  return missing;
}

export function showQuizVideo(target, word, options = {}) {
  target.replaceChildren();

  if (!options.isAvailable) {
    target.appendChild(renderMissingVideo(word));
    return;
  }

  target.appendChild(renderQuizVideo(word, options));
}
