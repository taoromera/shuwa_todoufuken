const VIDEO_BY_TITLE = {
  北海道: 'hokkaido.webm',
  青森県: 'aomori.webm',
  岩手県: 'iwate.webm',
  宮城県: 'miyagi.webm',
  秋田県: 'akita.webm',
  山形県: 'yamagata.webm',
  福島県: 'fukushima.webm',
  茨城県: 'ibaraki.webm',
  栃木県: 'tochigi.webm',
  群馬県: 'gunma.webm',
  埼玉県: 'saitama.webm',
  千葉県: 'chiba.webm',
  東京都: 'toukyo.webm',
  神奈川県: 'kanagawa.webm',
  新潟県: 'niigata.webm',
  富山県: 'toyama.webm',
  石川県: 'ishikawa.webm',
  福井県: 'fukui.webm',
  山梨県: 'yamanashi.webm',
  長野県: 'nagano.webm',
  岐阜県: 'gifu.webm',
  静岡県: 'shizuoka.webm',
  愛知県: 'aichi.webm',
  三重県: 'mie.webm',
  滋賀県: 'shiga.webm',
  京都府: 'kyouto.webm',
  大阪府: 'oosaka.webm',
  兵庫県: 'hyougo.webm',
  奈良県: 'nara.webm',
  和歌山県: 'wakayama.webm',
  鳥取県: 'tottori.webm',
  島根県: 'shimane.webm',
  岡山県: 'okayama.webm',
  広島県: 'hiroshima.webm',
  山口県: 'yamaguchi.webm',
  徳島県: 'tokushima.webm',
  香川県: 'kagawa.webm',
  愛媛県: 'ehime.webm',
  高知県: 'kouchi.webm',
  福岡県: 'fukuoka.webm',
  佐賀県: 'saga.webm',
  長崎県: 'nagasaki.webm',
  熊本県: 'kumamoto.webm',
  大分県: 'ooita.webm',
  宮崎県: 'miyazaki.webm',
  鹿児島県: 'kagoshima.webm',
  沖縄県: 'okinawa.webm',
  沖縄: 'okinawa.webm',
};

export function videoFileName(word) {
  if (word.video) {
    return word.video.includes('/') ? word.video.split('/').pop() : word.video;
  }

  return VIDEO_BY_TITLE[word.title] ?? `${word.code}.webm`;
}

export function videoUrl(word) {
  const fileName = videoFileName(word);

  if (fileName.startsWith('./') || fileName.startsWith('/')) {
    return fileName;
  }

  return `./videos/${fileName}`;
}
