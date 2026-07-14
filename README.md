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
