async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
  }
  if (!response.ok) {
    throw new Error(data.error || 'エラーが発生しました。もう一度お試しください。');
  }
  return data;
}

export function searchLibrary(query, { limit = 100 } = {}) {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return request(`/api/library?${params}`);
}

export function updateLibraryVideo(id, labels) {
  return request(`/api/library/${encodeURIComponent(id)}`, { method: 'PATCH', body: labels });
}

export function deleteLibraryVideo(id) {
  return request(`/api/library/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
