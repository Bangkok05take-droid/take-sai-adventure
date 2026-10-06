// 見本イラスト assets/title-characters.png から、タイトル画面用の人物イラスト assets/title-art.jpg を作る：
//   node tests/make-title-art.js
// ・上段の人物イラストだけを切り出す（下段のドット絵一覧と外枠は含めない）
// ・人物名の札・題字・四隅の飾りは、周りの紙の色で塗りつぶして消す（題字はHTML側で表示するので二重にしない）
// ・拡大縮小はしない（元画像の画素のまま）。縦横比は表示側で保つ
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'assets', 'title-characters.png');
const OUT = path.join(__dirname, '..', 'assets', 'title-art.jpg');

// 元画像（1254×1254）上の座標
const CROP = [70, 28, 1162, 910];          // x, y, 幅, 高さ：人物の頭から足元の影まで
const MASKS = [                            // 消す範囲 [x, y, 幅, 高さ]
  [70, 28, 140, 82],                       // 左上の飾り
  [1060, 28, 176, 96], [1204, 112, 32, 120], // 右上の飾り
  [52, 104, 150, 156], [198, 102, 36, 86],  // 「たけ TAKE」の札
  [1010, 110, 188, 142], [1078, 244, 56, 22], // 「サイ SAI」の札
  [434, 28, 380, 152], [590, 176, 70, 32], // 題字と星飾り
  [1206, 392, 30, 548], [1170, 862, 66, 76], // 右の縦線・菱形・右下の飾り
];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const data = fs.readFileSync(SRC).toString('base64');
  const res = await p.evaluate(async ([d, CROP, MASKS]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + d; await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const src = document.createElement('canvas'); src.width = W; src.height = H;
    const sg = src.getContext('2d'); sg.drawImage(img, 0, 0);
    const px = sg.getImageData(0, 0, W, H).data;
    // 紙の色：周りの明るく彩度の低い画素の平均
    const paper = (x, y, w, h, pad) => {
      let r = 0, g = 0, bl = 0, n = 0;
      for (let yy = Math.max(0, y - pad); yy < Math.min(H, y + h + pad); yy++)
        for (let xx = Math.max(0, x - pad); xx < Math.min(W, x + w + pad); xx++) {
          if (xx >= x && xx < x + w && yy >= y && yy < y + h) continue;
          const i = (yy * W + xx) * 4, R = px[i], G = px[i + 1], B = px[i + 2];
          const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
          if (mx < 200 || mx - mn > 50) continue;
          r += R; g += G; bl += B; n++;
        }
      return n ? [r / n, g / n, bl / n] : [240, 228, 205];
    };
    // 塗りつぶし層（紙の色＋細かいむら）を、ぼかした形で重ねる
    for (const [x, y, w, h] of MASKS) {
      const col = paper(x, y, w, h, 14);
      const pad = 10;
      const L = document.createElement('canvas'); L.width = w + pad * 2; L.height = h + pad * 2;
      const lg = L.getContext('2d');
      const id = lg.createImageData(L.width, L.height);
      for (let i = 0; i < L.width * L.height; i++) {
        const n = (Math.random() - 0.5) * 7;
        id.data[i * 4] = col[0] + n; id.data[i * 4 + 1] = col[1] + n; id.data[i * 4 + 2] = col[2] + n; id.data[i * 4 + 3] = 255;
      }
      lg.putImageData(id, 0, 0);
      const M = document.createElement('canvas'); M.width = L.width; M.height = L.height;
      const mg = M.getContext('2d'); mg.filter = 'blur(3px)'; mg.fillStyle = '#fff'; mg.fillRect(pad - 2, pad - 2, w + 4, h + 4);
      lg.globalCompositeOperation = 'destination-in'; lg.drawImage(M, 0, 0);
      sg.drawImage(L, x - pad, y - pad);
    }
    // 切り出し＋外周を紙の色へなじませる
    const [cx, cy, cw, ch] = CROP;
    const out = document.createElement('canvas'); out.width = cw; out.height = ch;
    const og = out.getContext('2d'); og.drawImage(src, cx, cy, cw, ch, 0, 0, cw, ch);
    const edge = paper(250, 40, 50, 50, 0);
    const hex = '#' + edge.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    const F = 26;
    const fade = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const gr = og.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, `rgba(${edge.map(Math.round).join(',')},1)`); gr.addColorStop(1, `rgba(${edge.map(Math.round).join(',')},0)`);
      og.fillStyle = gr; og.fillRect(rx, ry, rw, rh);
    };
    fade(0, 0, 0, F, 0, 0, cw, F); fade(0, ch, 0, ch - F, 0, ch - F, cw, F);
    fade(0, 0, F, 0, 0, 0, F, ch); fade(cw, 0, cw - F, 0, cw - F, 0, F, ch);
    return { url: out.toDataURL('image/jpeg', 0.86), paper: hex };
  }, [data, CROP, MASKS]);
  fs.writeFileSync(OUT, Buffer.from(res.url.split(',')[1], 'base64'));
  await b.close();
  console.log('assets/title-art.jpg written', fs.statSync(OUT).size, 'bytes; paper color', res.paper);
})();
