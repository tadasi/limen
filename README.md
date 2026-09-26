# limen

夢と現実の敷居をまたぐ、選択式の物語サイト。GitHub Pages で配信する静的サイトとして作っている。

## 手元で見る

ビルドは不要。`index.html` をブラウザで直接開けば動く。

```sh
open -a "Google Chrome" index.html
```

URL の末尾に `#場面ID` を付けると、その場面から始められる（例: `index.html#corridor`）。

## 構成

```
index.html            ページの枠
css/style.css         見た目と演出（レイアウト寸法・演出時間は :root の変数）
js/main.js            場面の描画と進行
story/sample.js       物語データ（サンプル）
images/sample/        サンプルのイラスト
```

`file://` で直接開いても動くように、物語データは JSON ではなく `window.LIMEN_STORY` に代入する JS として読み込む。

## 物語データの形式

```js
window.LIMEN_STORY = {
  start: "threshold",          // 最初の場面 ID
  scenes: {
    threshold: {
      image: "images/sample/threshold.svg",
      alt: "画像の説明",
      text: ["段落1", "段落2", "段落3"],   // 段落ごとに順にふわっと表示される
      choices: [
        { label: "選択肢の文言", next: "次の場面 ID" },
      ],
    },
  },
};
```

## レイアウトの目安

| 項目 | 値 | 変数 |
|---|---|---|
| 本文の幅 | 最大 720px | `--stage-width` |
| イラストの比率 | 3:2（推奨 1200×800） | `--illust-ratio` |
| 本文の量 | 1 場面あたり 3 段落・約 180 字 | `--text-min-height` |
| 選択肢 | 1〜3 個 | — |

## 操作

- 選択肢をクリックすると次の場面へ進む。数字キー（1〜3）でも選べる。
- 表示中にイラストか本文をクリックする、または Space / Enter を押すと、演出を飛ばして選択肢を出せる。
