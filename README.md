# たけとサイの大冒険 〜アユタヤの夢見る遺跡〜

スマホのブラウザで遊べる、見下ろし型・ターン制のダンジョン探索ゲームです（静的な HTML/CSS/JavaScript のみ。サーバー・ログイン不要）。

- たけが遺跡（地下10階）を探索し、サイが村のお店で帰りを待ちます。
- 毎回変わる地形と道具、限られた道具での危機回避、「帰るか進むか」の判断、持ち帰った成果で村と装備を育てる流れを遊べます。
- 10階の守護者を倒して「願いの宝珠」を持ち帰ると初回クリア。その後も探索と村の発展を続けられます。

## 遊び方
- 十字ボタン（PCは矢印キー / WASD）で移動。敵の方向へ動くと攻撃。
- 待つ（スペース）／足元（Enter：階段・拾う・帰還）／道具（I）／メニュー（Esc）。
- ゲーム内の「遊び方」からいつでも説明を見返せます。

## ファイル構成
| ファイル | 役割 |
|---|---|
| `js/data.js` | 敵・道具・階層・村の発展などの**調整用数値** |
| `js/rng.js` | セーブ可能なシード付き乱数 |
| `js/dungeon.js` | ダンジョン生成 |
| `js/game.js` | ゲーム処理（ターン・戦闘・道具・村）。表示と独立 |
| `js/save.js` | localStorage 保存（バージョン付き・移行処理あり） |
| `js/sprites.js` | オリジナルのドット絵（コードで定義） |
| `js/render.js` | ダンジョン・村の描画 |
| `js/audio.js` | 効果音・BGM（WebAudioで合成） |
| `js/ui.js` | 画面・入力・メニュー |

## テスト
```sh
node tests/logic.test.js          # ゲーム処理の自動テスト（生成3000フロア、ターン、道具、村、保存など）
node tests/e2e.test.js [保存先]   # Playwright でスマホ画面を操作するテスト（/take-sai-adventure/ サブパスで配信）
node tests/serve.js 8080          # http://localhost:8080/take-sai-adventure/ で確認
```

## GitHub Pages で公開
リポジトリの Settings → Pages → 「Deploy from a branch」で公開したいブランチと `/ (root)` を選んで保存すると、
`https://<ユーザー名>.github.io/take-sai-adventure/` で遊べます（相対パスのみ使用、`.nojekyll` 同梱）。
