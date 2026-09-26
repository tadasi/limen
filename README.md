# limen

夢と現実の敷居をまたぐ、選択式の物語サイト。GitHub Pages で配信する静的サイトとして作っている。

バージョンごとに世界を支える規則（法則）を一つ据え、その世界の中で複数の主人公の物語を扱う。サイトのデザインと仕組みは全バージョンで共通。

## 手元で見る

ビルドは不要。`index.html` をブラウザで直接開けば動く。

```sh
open -a "Google Chrome" index.html
```

## URL

| URL | 表示 |
|---|---|
| `index.html` | 最新バージョンの主人公選択 |
| `index.html#/v1` | v1 の主人公選択 |
| `index.html#/v1/windowsill` | v1・窓辺の人の最初の場面 |
| `index.html#/v1/windowsill/sail` | v1・窓辺の人の `sail` 場面 |

存在しないバージョンや場面を指定した場合は、最新バージョンの主人公選択、またはその主人公の最初の場面に戻る。

## 構成

```
index.html                    ページの枠（全バージョン共通）
assets/
  css/style.css               見た目と演出（寸法・演出時間は :root の変数）
  js/main.js                  URL の解釈、データの読み込み、場面の描画
stories/
  index.js                    バージョン一覧と最新バージョン
  v1/
    version.js                v1 の題・表紙・前口上・主人公一覧
    world.md                  v1 の世界の規則（執筆・生成用の設定）
    images/                   v1 の主人公どうしで共有する画像
    doorway/
      story.js                主人公「戸口の人」の場面一式
    windowsill/
      story.js                主人公「窓辺の人」の場面一式
```

主人公だけが使う画像は、その主人公のディレクトリに `images/` を作って置く。

`file://` で直接開いても動くように、データは JSON ではなく JS として `<script>` で読み込む。読み込むのは、表示に必要なバージョンと主人公の分だけ。

## データの書き方

### バージョン一覧（`stories/index.js`）

```js
LIMEN.catalog({
  latest: "v1",
  versions: ["v1"],
});
```

### バージョン（`stories/<version>/version.js`）

```js
LIMEN.registerVersion("v1", {
  title: "見立て",                       // ヘッダーとページタイトルに出る
  cover: "images/threshold.svg",         // 主人公選択画面の絵（このファイル基準の相対パス）
  coverAlt: "画像の説明",
  prologue: ["段落1", "段落2"],           // 主人公選択画面の本文
  protagonists: [
    { id: "doorway", name: "戸口の人", summary: "一行の紹介" },
  ],
});
```

### 主人公の物語（`stories/<version>/<protagonist>/story.js`）

```js
LIMEN.registerStory("v1", "doorway", {
  start: "threshold",                    // 最初の場面 ID
  scenes: {
    threshold: {
      image: "../images/threshold.svg",  // このファイル基準の相対パス
      alt: "画像の説明",
      text: ["段落1", "段落2", "段落3"],  // 段落ごとに順にふわっと表示される
      choices: [
        { label: "選択肢の文言", next: "次の場面 ID" },
        { label: "別の誰かの夢へ", next: "@select" },  // 主人公選択に戻る
      ],
    },
  },
});
```

## 追加の手順

- **主人公を足す**：`stories/<version>/<id>/story.js` を作り、`version.js` の `protagonists` に登録する。
- **バージョンを足す**：`stories/<version>/` に `version.js`・`world.md`・主人公ディレクトリを作り、`stories/index.js` の `versions` に加える。最新にするなら `latest` も更新する。

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
- ヘッダーの `limen` を押すと、最新バージョンの主人公選択に戻る。
