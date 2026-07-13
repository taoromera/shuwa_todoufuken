# 手話フラッシュカード

レッスンで学んだ日本手話を、自分で用意した動画で復習するフラッシュカードアプリです。

## 復習モード

- **手話 → 言葉**: 手話動画を見て、言葉を思い出す
- **言葉 → 手話**: 言葉を見て、手話を思い浮かべてから答えを確認

## はじめに

### 1. 動画を用意する

各単語の動画を `videos/` フォルダに置きます。都道府県はローマ字ファイル名を使います（例: `hokkaido.webm`）。その他の単語は `{code}.webm` か、単語データの `video` フィールドで指定できます。

```js
{
  lesson: 3,
  title: '北海道',
  caption: 'ほっかいどう',
  subdir: 'common',
  code: '003418',
  avatarId: 1,
  video: 'hokkaido.webm', // 省略時は {code}.webm
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

ブラウザで `manage.html` を開き、レッスンごとに単語を追加・削除できます。NHK 手話辞書の検索でメタデータを取得できます（動画は別途 `videos/` に配置してください）。

### `src/data/words.js` を直接編集

```js
{
  lesson: 2,
  title: 'ありがとう',
  caption: 'ありがとう',
  subdir: 'common',
  code: '001234',
  avatarId: 1,
},
```

NHK のメタデータを調べる場合:

```bash
npm run lookup -- ありがとう
```

## ファイル構成

```text
src/
  data/words.js       # レッスン単語リスト
  data/videos.js      # 動画パスの解決
videos/               # 手話動画（自分で用意）
scripts/
  lookup-word.ps1     # 単語メタデータの検索（任意）
```

## 注意

個人学習用です。
