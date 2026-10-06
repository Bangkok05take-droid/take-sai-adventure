# 画像素材

- `title-characters.png`：見本イラスト（人物・人物名・題字・ドット絵一覧を含む元画像。変更しない）。
- `title-chars.webp`：タイトル画面の主役の人物。元画像から `node tests/make-title-art.js` で作る。
  - 紙の色の部分を外周から塗りつぶして透明にする（人物の輪郭線で止まる）。題字・名札・飾りは消し、たけとサイだけを残す。
  - 縦横比を保って表示し、引き伸ばさない。後ろの夕暮れの遺跡・水辺・石のテラスは `js/ui.js` がキャンバスに描く。
- `title-art.jpg`：紙の背景つきの切り出し（透過画像を表示できないときの予備。同じスクリプトで作る）。
- `logo.png`：タイトルロゴ「たけとサイの／大冒険」と紋章（剣・宝珠・アユタヤの塔）。`node tests/make-logo.js` でSVGから作る。
  - 文字は Google Fonts の「Dela Gothic One」（SIL Open Font License）。作るときだけ取得し、ゲームはPNGだけを使う。
- ダンジョンの地形・村・キャラクター・道具のドット絵は、画像ファイルではなく `js/tiles.js`・`js/village.js`・`js/sprites.js` がコードで描く。
