// 見本イラスト assets/title-characters.png から、タイトル画面用の人物イラストを作る：
//   node tests/make-title-art.js
// ① assets/title-chars.webp：人物だけを切り抜いた透過画像（タイトルの冒険イラストの主役。背景は画面側で描く）
//    紙の色の部分を外周から塗りつぶして透明にし（人物の輪郭線で止まる）、面積の大きい2つ（たけ・サイ）だけ残す。
// ② assets/title-art.jpg：紙の背景つきの切り出し（透過画像を表示できないときの予備）
// ・上段の人物イラストだけを切り出す（下段のドット絵一覧と外枠は含めない）
// ・人物名の札・題字・四隅の飾りは、周りの紙の色で塗りつぶして消す（題字はHTML側で表示するので二重にしない）
// ・拡大縮小はしない（元画像の画素のまま）。縦横比は表示側で保つ
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'assets', 'title-characters.png');
const OUT = path.join(__dirname, '..', 'assets', 'title-art.jpg');
const OUT2 = path.join(__dirname, '..', 'assets', 'title-chars.webp');

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

  // ---- ② 人物の切り抜き ----
  const cut = await p.evaluate(async ([d, CROP, MASKS]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + d; await img.decode();
    const [cx, cy, cw, ch] = CROP;
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d'); g.drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);
    const id = g.getImageData(0, 0, cw, ch), px = id.data, N = cw * ch;
    // 紙らしい色：紙の色に近い、または明るく彩度の低い暖色（地面の淡い影も含む）
    const paper = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const R = px[i * 4], G = px[i * 4 + 1], B = px[i * 4 + 2];
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B), lum = 0.3 * R + 0.59 * G + 0.11 * B;
      const dist = Math.hypot(R - 240, G - 228, B - 205);
      paper[i] = dist < 38 || (lum > 150 && lum < 236 && mx - mn < 70 && R >= G && G >= B - 4 && R - B < 75) ? 1 : 0;
    }
    // 題字・名札・飾りの範囲は背景として扱う
    for (const [x, y, w, h] of MASKS) for (let yy = Math.max(0, y - cy); yy < Math.min(ch, y - cy + h); yy++) for (let xx = Math.max(0, x - cx); xx < Math.min(cw, x - cx + w); xx++) paper[yy * cw + xx] = 1;
    // 外周から塗りつぶす（人物の輪郭線で止まる）
    const bg = new Uint8Array(N), st = [];
    for (let x = 0; x < cw; x++) st.push(x, (ch - 1) * cw + x);
    for (let y = 0; y < ch; y++) st.push(y * cw, y * cw + cw - 1);
    while (st.length) {
      const i = st.pop(); if (bg[i] || !paper[i]) continue; bg[i] = 1; const x = i % cw;
      if (x > 0) st.push(i - 1); if (x < cw - 1) st.push(i + 1); if (i >= cw) st.push(i - cw); if (i < N - cw) st.push(i + cw);
    }
    // 残った部分を連結成分に分け、大きい2つ（たけ・サイ）だけ残す（題字・名札・飾りは消える）
    const lab = new Int32Array(N).fill(-1), sizes = [];
    for (let s0 = 0; s0 < N; s0++) {
      if (bg[s0] || lab[s0] >= 0) continue;
      const id2 = sizes.length; let n = 0; const q = [s0]; lab[s0] = id2;
      while (q.length) { const i = q.pop(); n++; const x = i % cw;
        for (const j of [x > 0 ? i - 1 : -1, x < cw - 1 ? i + 1 : -1, i - cw, i + cw]) if (j >= 0 && j < N && !bg[j] && lab[j] < 0) { lab[j] = id2; q.push(j); } }
      sizes.push(n);
    }
    const keep = sizes.map((n, i) => [n, i]).sort((a, b) => b[0] - a[0]).slice(0, 2).map((a) => a[1]);
    let minX = cw, minY = ch, maxX = 0, maxY = 0;
    for (let i = 0; i < N; i++) {
      const on = !bg[i] && keep.includes(lab[i]);
      if (!on) { px[i * 4 + 3] = 0; continue; }
      const x = i % cw, y = (i / cw) | 0;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    // 縁の1画素は半透明にしてなじませる
    for (let i = 0; i < N; i++) {
      if (!px[i * 4 + 3]) continue; const x = i % cw;
      const edge = (x > 0 && !px[(i - 1) * 4 + 3]) || (x < cw - 1 && !px[(i + 1) * 4 + 3]) || (i >= cw && !px[(i - cw) * 4 + 3]) || (i < N - cw && !px[(i + cw) * 4 + 3]);
      if (edge) px[i * 4 + 3] = 170;
    }
    g.putImageData(id, 0, 0);
    // 余白を詰めて、表示に十分な大きさ（横900）に縮める
    const pad = 4, bw = maxX - minX + 1 + pad * 2, bh = maxY - minY + 1 + pad * 2, sc = Math.min(1, 900 / bw);
    const o = document.createElement('canvas'); o.width = Math.round(bw * sc); o.height = Math.round(bh * sc);
    const og = o.getContext('2d'); og.imageSmoothingQuality = 'high';
    og.drawImage(c, minX - pad, minY - pad, bw, bh, 0, 0, o.width, o.height);
    return { url: o.toDataURL('image/webp', 0.9), w: o.width, h: o.height };
  }, [data, CROP, MASKS]);
  fs.writeFileSync(OUT2, Buffer.from(cut.url.split(',')[1], 'base64'));
  console.log('assets/title-chars.webp written', fs.statSync(OUT2).size, 'bytes', cut.w + 'x' + cut.h);
  await b.close();
  console.log('assets/title-art.jpg written', fs.statSync(OUT).size, 'bytes; paper color', res.paper);
})();
