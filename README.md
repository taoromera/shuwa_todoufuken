# 手話フラッシュカード

レッスンで学んだ日本手話を、自分で用意した動画で復習するフラッシュカードアプリです。

## 復習モード

- **手話 → 言葉**: 手話動画を見て、言葉を思い出す
- **言葉 → 手話**: 言葉を見て、手話を思い浮かべてから答えを確認

## はじめに

### 1. 動画を用意する

各単語の動画を `videos/` フォルダに置き、カードの `video` に相対パスを書きます。

```js
{
  lesson: 3,
  title: '北海道',
  caption: 'ほっかいどう',
  video: './videos/hokkaido.webm',
},
```

動画がある単語だけがデッキに含まれます。

#### NHK手話CGを録画する

Playwright用のChromiumとffmpegを用意すると、指定した単語の手話CGを5秒間のWebM動画として録画できます。

```bash
npx playwright install chromium
npm run record:sign -- "作る"
```

既定では `videos/作る.webm` に保存されます。出力先や検索結果を指定する場合:

```bash
npm run record:sign -- "作る" --output videos/tsukuru.webm
npm run record:sign -- "作る" --result 2
```

録画はNHKの検索結果から完全一致する単語を優先し、該当しない場合は最初の結果を使います。`--result` は検索結果の1番目を `1` として指定します。個人学習の範囲で利用し、NHKサイトの利用条件と著作権を確認してください。

### 2. 開発サーバー

```bash
npm install
npm run dev
```

### 3. ビルド

```bash
npm run build
npm run preview
```

## 単語の追加方法

### 管理ページ（`manage.html`）

`npm run dev` で起動し、ブラウザで `manage.html` を開きます。単語の追加・削除は `src/data/words.js` に直接書き込まれます。

### `src/data/words.js` を直接編集

```js
{
  lesson: 2,
  title: 'ありがとう',
  caption: 'ありがとう',
  id: 'unique-id',
  video: './videos/arigatou.webm',
},
```

## ファイル構成

```text
src/
  data/words.js       # レッスン単語リスト（video パス含む）
videos/               # 手話動画（自分で用意）
```

## 注意

個人学習用です。
