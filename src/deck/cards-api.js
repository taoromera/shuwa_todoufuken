async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return parseResponse(response);
}

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
  }
  if (!response.ok) {
    throw new Error(data.error || 'エラーが発生しました。もう一度お試しください。');
  }
  return data;
}

export function listCards() {
  return request('/api/cards');
}

export function createCard(fields) {
  return request('/api/cards', { method: 'POST', body: fields });
}

export function updateCard(id, fields) {
  return request(`/api/cards/${encodeURIComponent(id)}`, { method: 'PATCH', body: fields });
}

export function deleteCard(id) {
  return request(`/api/cards/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function createYoutubeDraft({ url, start, end }) {
  return request('/api/drafts/youtube', { method: 'POST', body: { url, start, end } });
}

/** Upload with progress (fetch has no upload progress events). */
export function uploadDraft(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/drafts/upload');
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    });
    xhr.addEventListener('load', () => {
      const response = new Response(xhr.responseText, { status: xhr.status });
      parseResponse(response).then(resolve, reject);
    });
    xhr.addEventListener('error', () => reject(new Error('アップロードに失敗しました。通信環境を確認してください。')));
    xhr.send(file);
  });
}

export function finalizeDraft(id, payload) {
  return request(`/api/drafts/${encodeURIComponent(id)}/finalize`, { method: 'POST', body: payload });
}

export function discardDraft(id) {
  return request(`/api/drafts/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
}
