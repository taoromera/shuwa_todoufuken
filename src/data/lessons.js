/**
 * Lesson metadata. Words in words.js reference lessons by id.
 *
 * Fields:
 * - id: lesson number (matches word.lesson)
 * - groupName: study group (e.g. JSL circle name)
 * - theme: topic covered in class
 * - date: class date (ISO 8601)
 *
 * Source: 2026年度 うめ組カリキュラム
 */
export const LESSONS = [
  {
    id: 1,
    groupName: 'うめ',
    theme: '開講式・オリエンテーション、ウォーミングアップ',
    date: '2026-06-20',
  },
  {
    id: 2,
    groupName: 'うめ',
    theme: '名前の表現（指文字・挨拶）',
    date: '2026-07-04',
  },
  {
    id: 3,
    groupName: 'うめ',
    theme: '出身地など地名の表現（都道府県）',
    date: '2026-07-11',
  },
  {
    id: 4,
    groupName: 'うめ',
    theme: '色や形の表現（ゲームの事前学習）',
    date: '2026-08-08',
  },
  {
    id: 5,
    groupName: 'うめ',
    theme: '伝わるかな＆わかるかなゲーム（名前だけの自己紹介を含む）',
    date: '2026-08-22',
  },
  {
    id: 6,
    groupName: 'うめ',
    theme: 'これまでの復習',
    date: '2026-09-05',
  },
  {
    id: 7,
    groupName: 'うめ',
    theme: '数を使った表現（年齢・月日）',
    date: '2026-09-12',
  },
  {
    id: 8,
    groupName: 'うめ',
    theme: '家族にかかわる手話表現',
    date: '2026-10-03',
  },
  {
    id: 9,
    groupName: 'うめ',
    theme: '全体学習「手話de運動会」',
    date: '2026-10-17',
  },
  {
    id: 10,
    groupName: 'うめ',
    theme: '趣味や仕事、学校に関わる表現',
    date: '2026-10-24',
  },
  {
    id: 11,
    groupName: 'うめ',
    theme: '食べ物や飲み物に関わる表現（ゲームの事前学習）',
    date: '2026-11-07',
  },
  {
    id: 12,
    groupName: 'うめ',
    theme: '伝わるかな＆わかるかなゲーム（自己紹介を含む）',
    date: '2026-11-28',
  },
  {
    id: 13,
    groupName: 'うめ',
    theme: '時制（曜日・現在過去未来）の表現',
    date: '2026-12-19',
  },
  {
    id: 14,
    groupName: 'うめ',
    theme: '天気に関わる表現',
    date: '2027-01-16',
  },
  {
    id: 15,
    groupName: 'うめ',
    theme: '全体学習「講演会」',
    date: '2027-01-23',
  },
  {
    id: 16,
    groupName: 'うめ',
    theme: 'これまでの復習',
    date: '2027-02-06',
  },
  {
    id: 17,
    groupName: 'うめ',
    theme: '交通に関わる表現',
    date: '2027-02-20',
  },
  {
    id: 18,
    groupName: 'うめ',
    theme: 'おさらいその１（1日の出来事を表現）',
    date: '2027-03-06',
  },
  {
    id: 19,
    groupName: 'うめ',
    theme: 'おさらいその２（クラス発表の内容を選定・練習）',
    date: '2027-03-13',
  },
  {
    id: 20,
    groupName: 'うめ',
    theme: 'おさらいその３（クラス発表の内容の練習）',
    date: '2027-04-10',
  },
];

export function formatLessonDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  return `${year}年${month}月${day}日`;
}

export function getLessonById(id) {
  const lessonId = typeof id === 'string' ? Number(id) : id;
  return LESSONS.find((lesson) => lesson.id === lessonId) ?? null;
}

export function formatLessonLabel(lesson, { wordCount = null } = {}) {
  const date = formatLessonDate(lesson.date);
  const count = wordCount != null ? ` (${wordCount}語)` : '';
  return `第${lesson.id}回 · ${lesson.theme} · ${date} · ${lesson.groupName}${count}`;
}

export function getLessonsWithWords(words) {
  return LESSONS.filter((lesson) => words.some((word) => word.lesson === lesson.id));
}
