export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function button(label, className, onClick) {
  const node = el('button', `library-btn ${className}`.trim(), label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

export function signVideo(src, title) {
  const video = document.createElement('video');
  video.className = 'quiz-video';
  video.src = src;
  video.controls = true;
  video.loop = true;
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('aria-label', `${title}の手話動画`);
  return video;
}

/** A labelled text input or textarea inside `.form-field`. */
export function textField({ name, label, value = '', multiline = false, required = false, hint }) {
  const wrapper = el('div', 'form-field');
  const id = `${name}-${Math.random().toString(36).slice(2, 8)}`;
  const labelNode = el('label', null, label);
  labelNode.htmlFor = id;
  const input = el(multiline ? 'textarea' : 'input');
  input.id = id;
  input.name = name;
  input.value = value;
  input.required = required;
  if (multiline) input.rows = 3;
  wrapper.append(labelNode, input);
  if (hint) wrapper.append(el('p', 'form-hint', hint));
  return wrapper;
}

let closeOpenPlayer = null;

/** Toggle an inline video player under a "再生" button; only one player is open at a time. */
export function playToggle(media, src, title) {
  const close = () => {
    media.hidden = true;
    toggle.textContent = '再生';
    media.replaceChildren();
    if (closeOpenPlayer === close) closeOpenPlayer = null;
  };

  const toggle = button('再生', 'library-btn--primary', () => {
    if (!media.hidden) {
      close();
      return;
    }
    closeOpenPlayer?.();
    media.hidden = false;
    toggle.textContent = '閉じる';
    media.replaceChildren(signVideo(src, title));
    closeOpenPlayer = close;
  });
  return toggle;
}
