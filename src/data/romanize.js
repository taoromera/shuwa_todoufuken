const BASIC = {
  あ: 'a',
  い: 'i',
  う: 'u',
  え: 'e',
  お: 'o',
  か: 'ka',
  き: 'ki',
  く: 'ku',
  け: 'ke',
  こ: 'ko',
  さ: 'sa',
  し: 'shi',
  す: 'su',
  せ: 'se',
  そ: 'so',
  た: 'ta',
  ち: 'chi',
  つ: 'tsu',
  て: 'te',
  と: 'to',
  な: 'na',
  に: 'ni',
  ぬ: 'nu',
  ね: 'ne',
  の: 'no',
  は: 'ha',
  ひ: 'hi',
  ふ: 'fu',
  へ: 'he',
  ほ: 'ho',
  ま: 'ma',
  み: 'mi',
  む: 'mu',
  め: 'me',
  も: 'mo',
  や: 'ya',
  ゆ: 'yu',
  よ: 'yo',
  ら: 'ra',
  り: 'ri',
  る: 'ru',
  れ: 're',
  ろ: 'ro',
  わ: 'wa',
  を: 'o',
  ん: 'n',
  が: 'ga',
  ぎ: 'gi',
  ぐ: 'gu',
  げ: 'ge',
  ご: 'go',
  ざ: 'za',
  じ: 'ji',
  ず: 'zu',
  ぜ: 'ze',
  ぞ: 'zo',
  だ: 'da',
  ぢ: 'ji',
  づ: 'zu',
  で: 'de',
  ど: 'do',
  ば: 'ba',
  び: 'bi',
  ぶ: 'bu',
  べ: 'be',
  ぼ: 'bo',
  ぱ: 'pa',
  ぴ: 'pi',
  ぷ: 'pu',
  ぺ: 'pe',
  ぽ: 'po',
  ぁ: 'a',
  ぃ: 'i',
  ぅ: 'u',
  ぇ: 'e',
  ぉ: 'o',
  ャ: 'ya',
  ュ: 'yu',
  ョ: 'yo',
  ゃ: 'ya',
  ゅ: 'yu',
  ょ: 'yo',
  ー: '',
};

const DIGRAPHS = {
  きゃ: 'kya',
  きゅ: 'kyu',
  きょ: 'kyo',
  しゃ: 'sha',
  しゅ: 'shu',
  しょ: 'sho',
  ちゃ: 'cha',
  ちゅ: 'chu',
  ちょ: 'cho',
  にゃ: 'nya',
  にゅ: 'nyu',
  にょ: 'nyo',
  ひゃ: 'hya',
  ひゅ: 'hyu',
  ひょ: 'hyo',
  みゃ: 'mya',
  みゅ: 'myu',
  みょ: 'myo',
  りゃ: 'rya',
  りゅ: 'ryu',
  りょ: 'ryo',
  ぎゃ: 'gya',
  ぎゅ: 'gyu',
  ぎょ: 'gyo',
  じゃ: 'ja',
  じゅ: 'ju',
  じょ: 'jo',
  びゃ: 'bya',
  びゅ: 'byu',
  びょ: 'byo',
  ぴゃ: 'pya',
  ぴゅ: 'pyu',
  ぴょ: 'pyo',
};

function toHiragana(text) {
  return text.replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60),
  );
}

function sanitizeRomaji(romaji) {
  return romaji
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/**
 * Convert hiragana/katakana reading to Hepburn-style ASCII romaji.
 * Example: くま → kuma
 */
export function romanizeKana(text) {
  const hiragana = toHiragana(String(text ?? '').trim());
  let result = '';
  let i = 0;

  while (i < hiragana.length) {
    const digraph = hiragana.slice(i, i + 2);
    if (DIGRAPHS[digraph]) {
      result += DIGRAPHS[digraph];
      i += 2;
      continue;
    }

    const char = hiragana[i];

    if (char === 'っ' || char === 'ッ') {
      const next = hiragana.slice(i + 1, i + 3);
      const nextRomaji = DIGRAPHS[next] ?? BASIC[hiragana[i + 1]] ?? '';
      const consonant = nextRomaji.match(/^[bcdfghjklmnpqrstvwxyz]/)?.[0];
      if (consonant) {
        result += consonant;
      }
      i += 1;
      continue;
    }

    if (BASIC[char]) {
      result += BASIC[char];
      i += 1;
      continue;
    }

    if (/[a-zA-Z0-9-]/.test(char)) {
      result += char.toLowerCase();
    }

    i += 1;
  }

  return sanitizeRomaji(result);
}

export function videoFileNameFromReading(caption, existingWords = [], { extension = 'webm' } = {}) {
  const base = romanizeKana(caption) || 'word';
  const used = new Set(
    existingWords
      .map((word) => word.video?.split('/').pop()?.toLowerCase())
      .filter(Boolean),
  );

  let fileName = `${base}.${extension}`;
  let suffix = 2;

  while (used.has(fileName.toLowerCase())) {
    fileName = `${base}-${suffix}.${extension}`;
    suffix += 1;
  }

  return fileName;
}
