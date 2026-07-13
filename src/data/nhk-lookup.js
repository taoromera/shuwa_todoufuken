const SEARCH_URL =
  'https://ci3ya8mywk.execute-api.ap-northeast-1.amazonaws.com/default/SLCG-WSearch/_search';

export function getSubdir(type) {
  switch (type) {
    case 1:
      return 'jp';
    case 2:
      return 'eng';
    case 5:
      return 'num';
    case 6:
      return 'area';
    default:
      return 'common';
  }
}

export async function searchNhkWords(query) {
  const encoded = encodeURIComponent(query.trim());
  const url = `${SEARCH_URL}?index=sign_cg_data&q=(title.keyword:*${encoded}*)&from=0&limit=10&sortkey=ruby,title,number&order=asc`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('NHKの検索に失敗しました。');
  }

  const data = await response.json();
  if (data.status !== 200 || data.total === 0) {
    return [];
  }

  return data.result.map((item) => ({
    title: item.title,
    caption: item.caption,
    subdir: getSubdir(Number(item.type)),
    code: item.code,
    avatarId: Number(item.avatarid) || 1,
  }));
}

export function toLessonWord(result, lessonId) {
  return {
    lesson: Number(lessonId),
    title: result.title,
    caption: result.caption,
    subdir: result.subdir,
    code: result.code,
    avatarId: result.avatarId,
  };
}
