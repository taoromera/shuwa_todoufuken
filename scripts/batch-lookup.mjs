import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getSubdir(type) {
  switch (type) {
    case 1: return 'jp';
    case 2: return 'eng';
    case 5: return 'num';
    case 6: return 'area';
    default: return 'common';
  }
}

async function searchWord(word) {
  const encoded = encodeURIComponent(word);
  const url = `https://ci3ya8mywk.execute-api.ap-northeast-1.amazonaws.com/default/SLCG-WSearch/_search?index=sign_cg_data&q=(title.keyword:*${encoded}*)&from=0&limit=10&sortkey=ruby,title,number&order=asc`;
  const res = await fetch(url);
  return res.json();
}

function pickBestResult(response, word) {
  if (response.status !== 200 || response.total === 0) return null;
  const exact = response.result.find((item) => item.title === word);
  return exact ?? response.result[0];
}

const prefectures = [
  { title: '北海道', caption: 'ほっかいどう' },
  { title: '青森県', caption: 'あおもりけん' },
  { title: '岩手県', caption: 'いわてけん' },
  { title: '宮城県', caption: 'みやぎけん' },
  { title: '秋田県', caption: 'あきたけん' },
  { title: '山形県', caption: 'やまがたけん' },
  { title: '福島県', caption: 'ふくしまけん' },
  { title: '茨城県', caption: 'いばらきけん' },
  { title: '栃木県', caption: 'とちぎけん' },
  { title: '群馬県', caption: 'ぐんまけん' },
  { title: '埼玉県', caption: 'さいたまけん' },
  { title: '千葉県', caption: 'ちばけん' },
  { title: '東京都', caption: 'とうきょうと' },
  { title: '神奈川県', caption: 'かながわけん' },
  { title: '新潟県', caption: 'にいがたけん' },
  { title: '富山県', caption: 'とやまけん' },
  { title: '石川県', caption: 'いしかわけん' },
  { title: '福井県', caption: 'ふくいけん' },
  { title: '山梨県', caption: 'やまなしけん' },
  { title: '長野県', caption: 'ながのけん' },
  { title: '岐阜県', caption: 'ぎふけん' },
  { title: '静岡県', caption: 'しずおかけん' },
  { title: '愛知県', caption: 'あいちけん' },
  { title: '三重県', caption: 'みえけん' },
  { title: '滋賀県', caption: 'しがけん' },
  { title: '京都府', caption: 'きょうとふ' },
  { title: '大阪府', caption: 'おおさかふ' },
  { title: '兵庫県', caption: 'ひょうごけん' },
  { title: '奈良県', caption: 'ならけん' },
  { title: '和歌山県', caption: 'わかやまけん' },
  { title: '鳥取県', caption: 'とっとりけん' },
  { title: '島根県', caption: 'しまねけん' },
  { title: '岡山県', caption: 'おかやまけん' },
  { title: '広島県', caption: 'ひろしまけん' },
  { title: '山口県', caption: 'やまぐちけん' },
  { title: '徳島県', caption: 'とくしまけん' },
  { title: '香川県', caption: 'かがわけん' },
  { title: '愛媛県', caption: 'えひめけん' },
  { title: '高知県', caption: 'こうちけん' },
  { title: '福岡県', caption: 'ふくおかけん' },
  { title: '佐賀県', caption: 'さがけん' },
  { title: '長崎県', caption: 'ながさきけん' },
  { title: '熊本県', caption: 'くまもとけん' },
  { title: '大分県', caption: 'おおいたけん' },
  { title: '宮崎県', caption: 'みやざきけん' },
  { title: '鹿児島県', caption: 'かごしまけん' },
  { title: '沖縄県', caption: 'おきなわけん' },
];

const regions = [
  { title: '北海道地方', caption: 'ほっかいどうちほう', search: '北海道地方' },
  { title: '東北', caption: 'とうほく', search: '東北' },
  { title: '関東', caption: 'かんとう', search: '関東' },
  { title: '中部', caption: 'ちゅうぶ', search: '中部' },
  { title: '北陸', caption: 'ほくりく', search: '北陸' },
  { title: '関西', caption: 'かんさい', search: '関西' },
  { title: '近畿', caption: 'きんき', search: '近畿' },
  { title: '中国', caption: 'ちゅうごく', search: '中国' },
  { title: '四国', caption: 'しこく', search: '四国' },
  { title: '九州', caption: 'きゅうしゅう', search: '九州' },
  { title: '沖縄', caption: 'おきなわ', search: '沖縄' },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const entries = [];
const missing = [];

for (const p of prefectures) {
  await sleep(150);
  let response = await searchWord(p.title);
  let item = pickBestResult(response, p.title);
  if (!item) {
    const short = p.title.replace(/[都道府県]$/, '');
    response = await searchWord(short);
    item = pickBestResult(response, short);
  }
  if (!item) {
    missing.push(p.title);
    console.log(`MISSING prefecture: ${p.title}`);
    continue;
  }
  entries.push({
    lesson: 3,
    title: p.title,
    caption: p.caption,
    subdir: getSubdir(Number(item.type)),
    code: item.code,
    avatarId: Number(item.avatarid),
  });
  console.log(`OK prefecture: ${p.title} -> ${item.code} (${item.title})`);
}

for (const r of regions) {
  await sleep(150);
  const response = await searchWord(r.search);
  const item = pickBestResult(response, r.search);
  if (!item) {
    missing.push(r.title);
    console.log(`MISSING region: ${r.title}`);
    continue;
  }
  entries.push({
    lesson: 3,
    title: r.title,
    caption: r.caption,
    subdir: getSubdir(Number(item.type)),
    code: item.code,
    avatarId: Number(item.avatarid),
  });
  console.log(`OK region: ${r.title} -> ${item.code} (${item.title})`);
}

const outFile = join(__dirname, 'batch-lookup-output.json');
writeFileSync(outFile, JSON.stringify({ entries, missing }, null, 2), 'utf8');
console.log(`\nWrote ${entries.length} entries to ${outFile}`);
if (missing.length) console.log('Missing:', missing.join(', '));
