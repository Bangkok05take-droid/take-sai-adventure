# 画像素材

- `title-characters.png` を置き、`js/ui.js` の `TITLE_ART.src` を `'assets/title-characters.png'` にすると、タイトル画面の人物イラストとして使われます（縦横比を保って表示、引き伸ばしなし）。
  元画像に人物名やドット絵一覧が含まれる場合は、`js/ui.js` の `TITLE_ART.crop` に `[x, y, 幅, 高さ]` を指定して人物部分だけを使います。
- ファイルがない場合は、ゲーム用のドット絵（全身絵）でタイトルを描きます。
