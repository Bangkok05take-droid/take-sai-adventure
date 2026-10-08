/* オリジナルのドット絵（スーパーファミコン風）。
 * 外部の画像を使わず、小さな「ドット絵ペインター」で陰影・ディザ・輪郭線つきの絵をコードで描く。
 * キャラクターと敵は32×32（ボスは48×48）、タイル32×32、道具アイコン16×16。
 * 起動時に一度だけ描いてキャンバスを使い回す（毎フレーム描き直さない）。 */
(function (TS) {
  'use strict';
  const SP = {};

  // ---------------- 色 ----------------
  // 色の変換と混色は同じ組み合わせが何度も出るので覚えておく（大きな絵を描くときに速くするため）
  const rgbCache = new Map(), mixCache = new Map();
  const hex2rgb = (h) => {
    let v = rgbCache.get(h);
    if (!v) { const s = h.replace('#', ''); v = [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]; if (rgbCache.size < 40000) rgbCache.set(h, v); }
    return v;
  };
  const rgb2hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => {
    const q = Math.round(t * 256), k = a + b + q;
    let v = mixCache.get(k);
    if (v === undefined) { const A = hex2rgb(a), B = hex2rgb(b), u = q / 256; v = rgb2hex(A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, A[2] + (B[2] - A[2]) * u); if (mixCache.size < 60000) mixCache.set(k, v); }
    return v;
  };
  // 影は青紫寄り、光は暖色寄りにする（統一した色使い）
  const SHADOW = '#1d1033', LIGHT = '#fff6dc', INK = '#160c1e';
  const shade = (c, t) => (t >= 0 ? mix(c, LIGHT, t) : mix(c, SHADOW, -t));
  // ランプ：0=ハイライト 1=明 2=基本 3=影 4=濃い影
  const ramp = (c) => [shade(c, 0.55), shade(c, 0.25), c, shade(c, -0.32), shade(c, -0.58)];
  SP.ramp = ramp; SP.mix = mix; SP.shade = shade;

  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const L = (() => { const v = [-0.5, -0.68, 0.53]; const n = Math.hypot(...v); return v.map((x) => x / n); })();

  // ---------------- ドット絵ペインター ----------------
  function Pix(w, h) { this.w = w; this.h = h; this.c = new Array(w * h).fill(null); }
  Pix.prototype.set = function (x, y, col) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h && col) this.c[y * this.w + x] = col; };
  Pix.prototype.get = function (x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.c[y * this.w + x] : null; };
  Pix.prototype.rect = function (x, y, w, h, col) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, col); return this; };
  Pix.prototype.idx = (f, x, y, dither) => {
    const d = dither === false ? 0 : (BAYER[y & 3][x & 3] / 16 - 0.47) * 0.9;
    return Math.max(0, Math.min(4, Math.round(f + d)));
  };
  // 球（楕円）を立体的に塗る
  Pix.prototype.ball = function (cx, cy, rx, ry, R, o) {
    o = o || {};
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, q = nx * nx + ny * ny;
        if (q > 1) continue;
        if (o.clip && !o.clip(x, y)) continue;
        const nz = Math.sqrt(1 - q);
        const d = nx * L[0] + ny * L[1] + nz * L[2];
        this.set(x, y, R[this.idx((0.88 - d) * 2.1 + (o.bias || 0), x, y, o.dither)]);
      }
    }
    return this;
  };
  // 縦長の円柱（胴体・足など）
  Pix.prototype.box = function (x0, y0, w, h, R, o) {
    o = o || {};
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (o.round && ((y === y0 || y === y0 + h - 1) && (x === x0 || x === x0 + w - 1))) continue;
        const nx = ((x + 0.5 - x0) / w) * 2 - 1, nz = Math.sqrt(Math.max(0, 1 - nx * nx));
        const top = (y - y0) / Math.max(1, h - 1);
        const d = nx * L[0] + nz * L[2] * 0.9 - (top - 0.3) * 0.25;
        this.set(x, y, R[this.idx((0.85 - d) * 2.1 + (o.bias || 0), x, y, o.dither)]);
      }
    }
    return this;
  };
  // 多角形（col は色、または (x,y)→色 の関数）
  Pix.prototype.poly = function (pts, col) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= y + 0.5 && b[1] > y + 0.5) || (b[1] <= y + 0.5 && a[1] > y + 0.5)) xs.push(a[0] + (y + 0.5 - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, typeof col === 'function' ? col(x, y) : col);
    }
    return this;
  };
  Pix.prototype.line = function (x0, y0, x1, y1, col) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), col);
    return this;
  };
  // 外側の輪郭（隣の色を暗くした色 = セレクティブアウトライン）
  Pix.prototype.outline = function (strength) {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y)) continue;
      let n = null;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) { const v = this.get(x + dx, y + dy); if (v) { n = v; break; } }
      if (n) add.push([x, y, mix(n, INK, strength || 0.78)]);
    }
    for (const [x, y, c] of add) this.set(x, y, c);
    return this;
  };
  Pix.prototype.canvas = function () {
    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    const g = cv.getContext('2d');
    const img = g.createImageData(this.w, this.h);
    for (let i = 0; i < this.c.length; i++) {
      const v = this.c[i];
      if (!v) continue;
      const [r, gg, b] = hex2rgb(v);
      img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return cv;
  };
  SP.Pix = Pix;

  function flipCanvas(src) {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0);
    return c;
  }

  // ---------------- 共通の色 ----------------
  const SKIN = ramp('#f2b582'), SKIN_T = ramp('#de9a68');
  const C = {
    blue: ramp('#3a6fd8'), navy: ramp('#2a3f8a'), steel: ramp('#c9d3e2'), gold: ramp('#f2c440'), cape: ramp('#f08a2a'),
    brown: ramp('#7a4c2a'), boot: ramp('#5a4a6a'), hair: ramp('#2a2238'), white: ramp('#f8f4ee'), pink: ramp('#f6b8cc'),
    teal: ramp('#22c0b0'), blade: ramp('#e4ecf4'), shieldB: ramp('#2f5fc0'),
  };
  const EYE = '#2a1a12', BROW = '#6a3a1a', MOUTH = '#b8483a', CHEEK = '#f59a8e';

  /* ---------------- たけ・サイ（見本のドット絵に合わせた32×32の1マス用） ----------------
   * 見本 assets/title-characters.png 下段のドット絵に近づけた：濃い輪郭線、ディザを抑えたはっきりした塗り、
   * 日焼けした肌、たけ＝坊主頭・オレンジのスカーフマント・金縁の青い服・白いズボン・茶色のブーツ・
   * 銀の剣・金の十字の丸い青盾、サイ＝長い黒髪・青緑の宝石のティアラ・白と淡いピンクの衣装・金の縁・白いブーツ・宝珠の杖。 */
  const CH = {
    skin: ramp('#f0ae78'), blue: ramp('#2f63d6'), gold: ramp('#f4c638'), scarf: ramp('#f2701e'),
    pants: ramp('#f2ecdc'), boot: ramp('#8e5428'), glove: ramp('#7a4424'), belt: ramp('#6c3e20'),
    blade: ramp('#e2ebf6'), hair: ramp('#24203a'), white: ramp('#fbf6ee'), pink: ramp('#f4949c'),
    teal: ramp('#1ec4c0'), sSkin: ramp('#f4c09a'),
  };
  const DARK = '#1a1020';
  const clamp4 = (v) => Math.max(0, Math.min(4, Math.round(v)));
  // 左上から光が当たる、ディザなしの塗り（左が明るく右が暗い）
  const lit = (R, x0, w, base, dy) => (x, y) => R[clamp4((base == null ? 1 : base) + (x - x0) / Math.max(1, w) * 2 + (dy ? (y - dy[0]) / dy[1] : 0))];
  const solid = (P, x, y, w, h, R, base) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) P.set(x + i, y + j, lit(R, x, w, base)(x + i, y + j)); };
  const flat = (o) => Object.assign({ dither: false }, o || {});

  // 丸い青い盾（金の縁・金の十字・中央に青緑の宝石）。rx が小さいと横から見た形になる
  function roundShield(P, cx, cy, rx, ry) {
    P.ball(cx, cy, rx, ry, CH.gold, flat({ bias: -0.2 }));
    P.ball(cx, cy, rx - 1.1, ry - 1.1, CH.blue, flat({ bias: 0.7 }));
    const x = Math.round(cx - 0.5), y = Math.round(cy - 0.5);
    for (let j = Math.ceil(cy - ry + 1.5); j <= Math.floor(cy + ry - 1.5); j++) P.set(x, j, CH.gold[1]);
    for (let i = Math.ceil(cx - rx + 1.5); i <= Math.floor(cx + rx - 1.5); i++) P.set(i, y, CH.gold[1]);
    P.set(x, y, CH.teal[1]);
  }
  // 剣（上向き・下向き）。x は刃の左の列、y0..y1 が刃
  function swordV(P, x, y0, y1, up) {
    for (let y = y0; y <= y1; y++) { P.set(x, y, CH.blade[1]); P.set(x + 1, y, CH.blade[3]); }
    P.set(x, up ? y0 - 1 : y1 + 1, CH.blade[0]);
    const g = up ? y1 + 1 : y0 - 1;               // つば
    P.rect(x - 2, g, 6, 1, CH.gold[1]); P.set(x + 3, g, CH.gold[3]);
    P.rect(x, up ? g + 1 : g - 2, 2, 2, CH.glove[2]); // にぎった手（茶色の手袋）
    P.set(x, up ? g + 3 : g - 3, CH.gold[2]);     // 柄頭
  }
  function swordH(P, x0, x1, y) {
    for (let x = x0; x <= x1; x++) { P.set(x, y, CH.blade[1]); P.set(x, y + 1, CH.blade[3]); }
    P.set(x1 + 1, y, CH.blade[0]);
    P.rect(x0 - 1, y - 2, 1, 6, CH.gold[1]);
    P.rect(x0 - 3, y, 2, 2, CH.glove[2]);
  }

  /* たけ：face = down/up/right、f = 歩行コマ 0..3、atk = 攻撃ポーズ */
  function drawTake(face, f, atk) {
    const P = new Pix(32, 32);
    const b = f === 1 || f === 3 ? -1 : 0;          // 上下の揺れ
    const st = f === 1 ? 1 : f === 3 ? -1 : 0;      // どちらの足が前か
    const skinL = (cx, w) => lit(CH.skin, cx, w, 1);
    // ---- 足（白いズボン・茶色のブーツ・金の折り返し） ----
    const leg = (x, lift) => {
      const y = 24 + b;
      solid(P, x, y, 4, 3 - lift, CH.pants, 0.6);
      const by = 27 + b - lift;
      solid(P, x - (x < 16 ? 1 : 0), by, 5, 4, CH.boot, 1);
      P.rect(x - (x < 16 ? 1 : 0), by, 5, 1, CH.gold[1]);
      P.rect(x - (x < 16 ? 1 : 0), by + 3, 5, 1, CH.boot[4]);
    };
    const legSide = (x, dx) => {
      solid(P, x + dx, 24 + b, 4, 3, CH.pants, 0.6);
      solid(P, x + dx, 27 + b, 5, 4, CH.boot, 1);
      P.rect(x + dx, 27 + b, 5, 1, CH.gold[1]); P.rect(x + dx, 30 + b, 5, 1, CH.boot[4]);
    };
    // ---- 胴（金の縁の青い服・ベルト・金のバックル） ----
    const tunic = (x0, x1, center) => {
      P.poly([[x0, 16 + b], [x1, 16 + b], [x1 + 1, 24 + b], [x0 - 1, 24 + b]], lit(CH.blue, x0 - 1, x1 - x0 + 2, 1.3));
      P.rect(x0 - 1, 23 + b, x1 - x0 + 2, 1, CH.gold[1]);
      P.rect(x0, 20 + b, x1 - x0, 1, CH.belt[2]);
      if (center != null) { P.rect(center - 1, 19 + b, 3, 3, CH.gold[1]); P.set(center, 20 + b, CH.gold[3]); P.rect(center, 22 + b, 1, 2, CH.gold[2]); }
    };
    // ---- 頭（坊主頭） ----
    const head = (cx, profile) => {
      const hy = 9.5 + b;
      P.ball(cx, hy, 6.6, 6.3, CH.skin, flat({ bias: -0.15 }));
      // 頭のつや
      P.rect(Math.round(cx) - 4, Math.round(hy) - 5, 2, 1, CH.skin[0]); P.set(Math.round(cx) - 5, Math.round(hy) - 4, CH.skin[0]);
      return Math.round(hy);
    };
    if (face === 'down') {
      // スカーフの後ろ側（マントとして左右に見える）
      P.poly([[9, 17 + b], [12, 17 + b], [11, 26 + b], [7, 26 + b]], lit(CH.scarf, 7, 5, 2));
      leg(11, st > 0 ? 1 : 0); leg(17, st < 0 ? 1 : 0);
      tunic(11, 21, 16);
      // 肩当て
      P.ball(9.6, 17.6 + b, 2.6, 2.1, CH.blue, flat({ bias: 0.1 })); P.ball(22.4, 17.6 + b, 2.6, 2.1, CH.blue, flat({ bias: 0.4 }));
      P.rect(8, 19 + b, 4, 1, CH.gold[1]); P.rect(21, 19 + b, 4, 1, CH.gold[2]);
      // スカーフ（首に巻いたオレンジの布）と、左に流れる端
      P.poly([[10, 14 + b], [22, 14 + b], [22, 16 + b], [10, 17 + b]], lit(CH.scarf, 9, 14, 1.1));
      P.rect(10, 17 + b, 3, 1, CH.scarf[3]);
      P.poly([[8, 17 + b], [11, 17 + b], [9, 25 + b], [6, 24 + b]], lit(CH.scarf, 6, 5, 1.4));
      P.set(19, 15 + b, CH.teal[1]); P.set(19, 16 + b, CH.gold[2]); // 留め具の宝石
      // 盾（左手＝画面の右）
      roundShield(P, 24.5, 21.5 + b, 4.6, 5.4);
      // 剣（右手＝画面の左）
      if (atk) { P.rect(7, 19 + b, 2, 3, CH.blue[2]); swordV(P, 7, 25 + b, 31, false); }
      else swordV(P, 6, 6 + b, 19 + b, true);
      // 頭と顔
      const hy = head(16);
      P.ball(9.4, hy + 1, 1.2, 1.6, CH.skin, flat({ bias: 0.4 })); P.ball(22.6, hy + 1, 1.2, 1.6, CH.skin, flat({ bias: 0.6 }));
      P.rect(12, hy - 2, 3, 1, DARK); P.rect(17, hy - 2, 3, 1, DARK);         // 太い眉
      P.rect(13, hy, 2, 2, DARK); P.rect(17, hy, 2, 2, DARK);                 // 目
      P.set(13, hy, '#ffffff'); P.set(17, hy, '#ffffff');
      P.set(16, hy + 2, CH.skin[3]);                                          // 鼻
      P.rect(15, hy + 4, 2, 1, '#a8402c');                                    // 口
      P.set(11, hy + 3, CH.skin[3]); P.set(20, hy + 3, CH.skin[3]);          // ほお・あご
    } else if (face === 'up') {
      // 盾（画面の左）と剣（画面の右）は背中より奥
      roundShield(P, 7.5, 20.5 + b, 3.6, 5.2);
      if (atk) swordV(P, 24, 1 + b, 13 + b, true); else swordV(P, 24, 7 + b, 18 + b, true);
      legSide(11, 0); legSide(17, -1);
      if (st > 0) P.rect(10, 30 + b, 5, 1, null);
      tunic(11, 21, null);
      // 背中の大きなマント（オレンジ）＋たたみじわ
      P.poly([[9, 15 + b], [23, 15 + b], [25 + st, 27 + b], [7 + st, 27 + b]], lit(CH.scarf, 7, 18, 1.2));
      for (const x of [12, 16, 20]) for (let y = 18 + b; y < 27 + b; y++) if ((y + x) % 3) P.set(x + (y > 22 + b ? st : 0), y, CH.scarf[3]);
      P.rect(7 + st, 26 + b, 19, 1, CH.scarf[4]);
      P.ball(9.6, 16.8 + b, 2.4, 2, CH.blue, flat({ bias: 0.1 })); P.ball(22.4, 16.8 + b, 2.4, 2, CH.blue, flat({ bias: 0.3 }));
      const hy = head(16);
      P.ball(9.4, hy + 1, 1.2, 1.6, CH.skin, flat({ bias: 0.4 })); P.ball(22.6, hy + 1, 1.2, 1.6, CH.skin, flat({ bias: 0.6 }));
      P.rect(12, hy + 5, 8, 1, CH.skin[3]);                                   // 首すじの影
    } else { // 右向き（左向きは左右反転）
      // 後ろに流れるマント
      P.poly([[11, 16 + b], [17, 16 + b], [13 - st, 27 + b], [4 - st, 25 + b]], lit(CH.scarf, 4, 13, 1.2));
      // 剣（奥の手で後ろに構える）
      if (!atk) {
        for (let i = 0; i < 12; i++) { P.set(9 - Math.floor(i / 4), 18 + b - i, CH.blade[1]); P.set(10 - Math.floor(i / 4), 18 + b - i, CH.blade[3]); }
        P.set(6, 6 + b, CH.blade[0]); P.rect(7, 19 + b, 5, 1, CH.gold[1]); P.rect(9, 20 + b, 2, 2, CH.glove[2]);
      }
      legSide(12, st * 2); legSide(16, -st * 2);
      tunic(12, 21, 19);
      P.ball(14.5, 17.6 + b, 2.6, 2.2, CH.blue, flat({ bias: 0.1 })); P.rect(12, 19 + b, 5, 1, CH.gold[1]);
      P.poly([[11, 14 + b], [21, 14 + b], [22, 17 + b], [11, 17 + b]], lit(CH.scarf, 11, 11, 1.1));
      P.poly([[11, 16 + b], [14, 16 + b], [11, 22 + b], [8, 21 + b]], lit(CH.scarf, 8, 6, 1.4));
      P.set(20, 15 + b, CH.teal[1]);
      if (atk) { P.rect(18, 18 + b, 6, 2, CH.blue[2]); swordH(P, 26, 31, 18 + b); roundShield(P, 21, 22 + b, 2.6, 4.6); }
      else roundShield(P, 23, 21 + b, 2.8, 5);
      const hy = head(16.5);
      P.ball(13, hy + 1, 1.3, 1.7, CH.skin, flat({ bias: 0.5 })); P.set(13, hy + 1, CH.skin[3]); // 耳
      P.rect(19, hy - 2, 3, 1, DARK); P.rect(20, hy, 1, 2, DARK); P.set(21, hy, DARK); P.set(21, hy + 1, '#ffffff');
      P.set(23, hy + 1, CH.skin[2]); P.set(23, hy + 2, CH.skin[3]);           // 鼻
      P.rect(21, hy + 4, 2, 1, '#a8402c');
    }
    return P.outline(0.92);
  }

  /* サイ：frame 0/1（1はまばたき＋髪とすそが揺れる） */
  function drawSai(frame) {
    const P = new Pix(32, 32);
    const blink = frame === 1, sw = frame === 1 ? 1 : 0;
    // 長い黒髪（後ろ）
    P.poly([[9, 5], [23, 5], [26 + sw, 21], [24 + sw, 26], [21, 22], [11, 22], [8 - sw, 26], [6 - sw, 21]], lit(CH.hair, 6, 20, 1.2, [5, 30]));
    // 淡いピンクのマント（両脇）と白いスカート
    P.poly([[10, 15], [14, 15], [13, 28], [5 - sw, 28]], lit(CH.pink, 5, 8, 0.7));
    P.poly([[18, 15], [22, 15], [27 + sw, 28], [19, 28]], lit(CH.pink, 18, 8, 1.1));
    P.poly([[13, 18], [19, 18], [21, 28], [11, 28]], lit(CH.white, 11, 10, 0.5));
    P.line(13, 18, 11, 28, CH.gold[1]); P.line(19, 18, 21, 28, CH.gold[2]);
    P.rect(5 - sw, 28, 23 + sw * 2, 1, CH.gold[1]); P.rect(5 - sw, 27, 3, 1, CH.gold[2]); P.rect(25 + sw, 27, 3, 1, CH.gold[3]);
    P.line(16, 21, 15, 27, CH.pink[2]); P.set(16, 24, CH.gold[0]);          // 前の切れ込み
    // 白いブーツ（金の縁）
    for (const x of [12, 18]) { solid(P, x, 29, 3, 2, CH.white, 0.6); P.set(x, 29, CH.gold[1]); P.rect(x, 30, 3, 1, CH.gold[3]); }
    // 胴（白）・金のえり・ピンクの帯・青緑の宝石
    solid(P, 13, 14, 7, 5, CH.white, 0.4);
    P.rect(13, 14, 7, 1, CH.gold[1]); P.set(16, 15, CH.teal[1]);
    P.rect(12, 18, 9, 1, CH.pink[2]); P.rect(15, 18, 3, 1, CH.gold[1]); P.set(16, 18, CH.teal[1]);
    // 肩のふくらみ（白に金の縁）
    P.ball(11.6, 15.4, 2, 1.8, CH.white, flat({ bias: -0.4 })); P.ball(21.4, 15.4, 2, 1.8, CH.white, flat({ bias: -0.2 }));
    P.set(10, 16, CH.gold[1]); P.set(23, 16, CH.gold[2]);
    // 腕（金の腕輪）
    solid(P, 10, 17, 2, 4, CH.sSkin, 0.8); P.rect(10, 19, 2, 1, CH.gold[1]);
    solid(P, 21, 17, 2, 4, CH.sSkin, 1.2); P.rect(21, 19, 2, 1, CH.gold[1]);
    // 宝珠の杖（画面の左）
    for (let y = 9; y <= 30; y++) P.set(7, y, y % 4 === 0 ? CH.gold[0] : CH.gold[2]);
    P.ball(7, 6.2, 2.7, 3, CH.gold, flat({ bias: -0.2 }));
    P.ball(7, 6.2, 1.6, 1.7, CH.teal, flat({ bias: -0.4 })); P.set(6, 5, '#e8fffa');
    P.rect(8, 20, 3, 2, CH.sSkin[1]);                                        // 杖をにぎる手
    // 顔
    P.ball(16, 9.2, 5.8, 5.8, CH.sSkin, flat({ bias: -0.2 }));
    // 前髪（まん中で分けた黒髪）と顔の横に流れる髪
    P.poly([[9, 10], [10, 4], [13, 2], [19, 2], [22, 4], [23, 10], [21, 7], [17, 5], [16, 6], [15, 5], [11, 7]], lit(CH.hair, 9, 14, 0.8, [2, 10]));
    P.rect(9, 8, 2, 13, CH.hair[2]); P.rect(22, 8, 2, 13, CH.hair[3]);
    P.set(12, 4, CH.hair[0]); P.set(13, 3, CH.hair[0]);
    // ティアラ（金に青緑の宝石）
    P.rect(12, 3, 9, 1, CH.gold[1]); P.rect(15, 2, 3, 1, CH.gold[2]); P.set(16, 1, CH.gold[0]); P.set(16, 2, CH.teal[1]);
    // 目・口・耳飾り
    if (blink) { P.rect(13, 10, 2, 1, DARK); P.rect(17, 10, 2, 1, DARK); }
    else { P.rect(13, 9, 2, 2, DARK); P.rect(17, 9, 2, 2, DARK); P.set(13, 9, '#ffffff'); P.set(17, 9, '#ffffff'); }
    P.rect(13, 8, 2, 1, CH.hair[2]); P.rect(17, 8, 2, 1, CH.hair[2]);
    P.set(12, 11, '#f59a8e'); P.set(20, 11, '#f59a8e');
    P.rect(15, 12, 2, 1, '#c8485a');
    P.set(10, 12, CH.teal[1]); P.set(22, 12, CH.teal[1]);
    return P.outline(0.92);
  }

  /* ---------------- タイトル用の全身絵（64×96、画像素材がないときに使う） ---------------- */
  function bigTake() {
    const P = new Pix(64, 96);
    const capeR = (x, y) => CH.scarf[P.idx(1.0 + (y - 40) / 50 + (x > 32 ? 0.7 : 0), x, y)];
    P.poly([[14, 40], [50, 40], [58, 92], [6, 92]], capeR); // マント
    // 足とブーツ
    P.box(22, 70, 8, 18, CH.pants); P.box(34, 70, 8, 18, CH.pants);
    P.box(20, 84, 11, 8, CH.boot, { round: true }); P.box(33, 84, 11, 8, CH.boot, { round: true }); P.rect(20, 84, 11, 1, CH.gold[1]); P.rect(33, 84, 11, 1, CH.gold[1]);
    // 青い服（金の縁取り）
    P.poly([[20, 40], [44, 40], [48, 74], [16, 74]], (x, y) => CH.blue[P.idx(1.0 + (x - 16) / 32 + (y - 40) / 60, x, y)]);
    P.rect(16, 72, 32, 2, CH.gold[1]); P.rect(31, 42, 2, 30, CH.gold[2]); P.rect(24, 42, 1, 10, CH.gold[1]); P.rect(39, 42, 1, 10, CH.gold[1]);
    P.box(19, 56, 26, 4, C.brown); P.box(29, 55, 6, 6, CH.gold); P.ball(32, 58, 1.5, 1.5, CH.teal);
    // 肩当て
    P.ball(18, 43, 6, 5, CH.blue, { bias: -0.4 }); P.ball(46, 43, 6, 5, CH.blue, { bias: -0.4 }); P.rect(12, 46, 12, 2, CH.gold[1]); P.rect(40, 46, 12, 2, CH.gold[1]);
    // 右手の剣
    P.box(10, 46, 6, 14, CH.blue); P.ball(13, 62, 3, 3, SKIN);
    for (let i = 0; i < 30; i++) { P.set(12, 59 - i, CH.blade[1]); P.set(13, 59 - i, CH.blade[2]); P.set(14, 59 - i, CH.blade[3]); }
    P.rect(11, 30, 4, 1, CH.blade[0]); P.rect(8, 60, 10, 2, CH.gold[1]); P.box(11, 62, 4, 6, C.brown);
    // 左手の盾
    P.box(48, 46, 6, 12, CH.blue);
    roundShield(P, 52, 63, 10, 12); P.ball(52, 63, 2.2, 2.2, CH.teal, flat());
    // えりと頭
    P.box(20, 36, 24, 6, CH.scarf, { round: true }); P.poly([[18, 40], [24, 40], [20, 62], [12, 60]], lit(CH.scarf, 12, 12, 1.2)); P.ball(32, 39, 2, 2, CH.gold);
    P.ball(32, 22, 14, 14, SKIN); P.ball(17.5, 24, 2.6, 3.6, SKIN_T); P.ball(46.5, 24, 2.6, 3.6, SKIN_T);
    P.ball(26, 14, 4, 2.5, ramp(SKIN[0]), { dither: false }); P.rect(24, 12, 3, 1, LIGHT);
    P.rect(22, 20, 6, 2, BROW); P.rect(36, 20, 6, 2, BROW);
    P.rect(23, 23, 4, 5, EYE); P.rect(37, 23, 4, 5, EYE); P.rect(23, 23, 2, 2, '#ffffff'); P.rect(37, 23, 2, 2, '#ffffff');
    P.rect(19, 29, 4, 2, CHEEK); P.rect(41, 29, 4, 2, CHEEK);
    P.rect(29, 31, 6, 2, MOUTH); P.set(28, 30, MOUTH); P.set(35, 30, MOUTH);
    return P.outline(0.92);
  }
  function bigSai() {
    const P = new Pix(64, 96);
    P.poly([[16, 14], [48, 14], [52, 66], [42, 72], [22, 72], [12, 66]], (x, y) => CH.hair[P.idx(1.4 + (x > 32 ? 0.7 : 0) + (y - 14) / 70, x, y)]); // 長い黒髪
    // ドレス
    P.poly([[24, 40], [40, 40], [56, 92], [8, 92]], (x, y) => CH.white[P.idx(0.8 + (x - 8) / 48 + (y - 40) / 80, x, y)]);
    P.poly([[28, 50], [36, 50], [44, 92], [20, 92]], (x, y) => CH.pink[P.idx(0.9 + (x - 20) / 24, x, y)]);
    P.line(24, 40, 8, 92, CH.gold[2]); P.line(40, 40, 56, 92, CH.gold[3]); P.line(28, 50, 20, 92, CH.gold[1]); P.line(36, 50, 44, 92, CH.gold[2]);
    P.rect(8, 91, 49, 2, CH.gold[2]); for (let x = 12; x < 54; x += 5) P.ball(x, 88, 1.2, 1.2, CH.gold);
    // 胴・帯
    P.box(24, 36, 16, 14, CH.white, { round: true }); P.rect(24, 48, 16, 3, CH.gold[1]); P.ball(32, 49.5, 2, 1.8, CH.teal);
    // 袖と腕
    P.ball(21, 39, 5, 4.5, CH.pink); P.ball(43, 39, 5, 4.5, CH.pink);
    P.box(18, 43, 5, 14, SKIN); P.box(41, 43, 5, 14, SKIN); P.rect(18, 50, 5, 2, CH.gold[1]); P.rect(41, 50, 5, 2, CH.gold[1]);
    // 首飾り
    P.box(29, 32, 6, 5, SKIN); P.line(26, 36, 32, 41, CH.gold[1]); P.line(38, 36, 32, 41, CH.gold[1]); P.ball(32, 42, 2.4, 2.4, CH.teal); P.set(31, 41, '#e8fffa');
    // 顔
    P.ball(32, 22, 12, 12, SKIN);
    P.poly([[19, 24], [20, 13], [26, 8], [32, 7], [40, 9], [45, 15], [45, 24], [41, 17], [36, 13], [33, 17], [28, 12], [23, 18]], (x, y) => CH.hair[P.idx(1.0 + (y - 7) / 18 + (x > 32 ? 0.5 : 0), x, y)]);
    P.rect(19, 22, 3, 22, CH.hair[2]); P.rect(42, 22, 3, 22, CH.hair[3]);
    P.line(25, 11, 30, 9, CH.hair[0]);
    // ティアラ
    P.poly([[24, 9], [27, 4], [30, 7], [32, 2], [34, 7], [37, 4], [40, 9]], (x, y) => CH.gold[P.idx(0.6 + y / 8, x, y)]); P.ball(32, 6, 1.6, 1.6, CH.teal);
    P.rect(25, 19, 5, 1, '#3a2a30'); P.rect(35, 19, 5, 1, '#3a2a30');
    P.rect(25, 22, 5, 5, '#2a1a20'); P.rect(35, 22, 5, 5, '#2a1a20'); P.rect(25, 21, 6, 1, '#1a0a10'); P.rect(34, 21, 6, 1, '#1a0a10');
    P.rect(26, 23, 2, 2, '#ffffff'); P.rect(36, 23, 2, 2, '#ffffff');
    P.rect(22, 28, 4, 2, CHEEK); P.rect(39, 28, 4, 2, CHEEK); P.rect(30, 31, 4, 1, MOUTH);
    P.ball(44, 12, 2.6, 2.6, ramp('#fff4f4')); P.set(44, 12, '#ffd84a');
    return P.outline(0.92);
  }

  /* マスターヤナイ（会話の顔絵 64×64）：赤い衣に金の縁、白い髪とひげ、太い眉とやさしい目。温かさと威厳のある師匠。 */
  function portraitYanai() {
    const P = new Pix(64, 64), Rr = ramp('#c0302a'), Mg = ramp('#e8c040'), Hh = ramp('#f0ece4'), Sk = ramp('#dca880');
    P.poly([[2, 64], [8, 44], [22, 38], [42, 38], [56, 44], [62, 64]], (x, y) => Rr[P.idx(1.1 + (x - 2) / 60 * 1.6 + (y - 38) / 60, x, y, false)]);
    P.line(22, 40, 32, 56, Mg[1]); P.line(42, 40, 32, 56, Mg[2]); P.line(32, 56, 32, 64, Mg[2]);       // 合わせの金の縁
    P.rect(8, 60, 48, 2, Mg[2]);
    P.box(26, 34, 12, 8, Sk);
    P.ball(32, 22, 16, 17, Sk);
    P.poly([[14, 18], [18, 6], [32, 2], [46, 6], [50, 18], [44, 12], [32, 9], [20, 12]], (x) => Hh[x < 32 ? 1 : 2]);   // 白い髪
    P.ball(32, 4, 5, 3.5, Hh, { bias: -0.2 });                                                                         // まげ
    P.rect(19, 18, 9, 3, Hh[2]); P.rect(36, 18, 9, 3, Hh[2]);                                                           // 太い眉
    P.rect(21, 23, 6, 2, '#3a2418'); P.rect(37, 23, 6, 2, '#3a2418'); P.set(22, 23, '#7a5a40'); P.set(38, 23, '#7a5a40');
    P.rect(18, 27, 4, 2, '#f09a88'); P.rect(42, 27, 4, 2, '#f09a88');
    P.poly([[20, 30], [44, 30], [42, 46], [32, 52], [22, 46]], (x, y) => Hh[P.idx(0.6 + (x - 20) / 24 + (y - 30) / 30, x, y, false)]);   // ひげ
    P.rect(28, 31, 8, 2, '#a85040');
    return P.outline(0.85);
  }
  // 村の人（32×32）：服の色と頭の形を変えて数種類。名前や姿を決めた人物は後から差し替える
  function villager(v) {
    const P = new Pix(32, 32), cols = ['#3a8a6a', '#c8603a', '#6a5ab0', '#d8a030', '#4a7ac8'], hairs = ['#2a2238', '#6a3a1a', '#1a1a2a', '#8a6a3a', '#2a2238'];
    const C = ramp(cols[v % cols.length]), Sk = ramp(v % 2 ? '#e2a678' : '#f2c09a'), Hh = ramp(hairs[v % hairs.length]);
    const kid = v === 3;
    const top = kid ? 12 : 8, s = kid ? 0.8 : 1;
    P.poly([[16 - 6 * s, top + 9], [16 + 6 * s, top + 9], [16 + 7 * s, 29], [16 - 7 * s, 29]], (x, y) => C[P.idx(0.8 + (x - 9) / 14 * 1.4, x, y, false)]);
    P.rect(12, 29, 3, 2, '#5a3a22'); P.rect(17, 29, 3, 2, '#5a3a22');
    P.ball(16, top + 4, 5 * s, 5 * s, Sk);
    P.ball(16, top + 1, 5.2 * s, 3.2 * s, Hh, { clip: (x, y) => y <= top + 2 });
    if (v === 0) { P.poly([[7, top + 1], [16, top - 5], [25, top + 1]], '#d8c080'); P.rect(7, top + 1, 18, 1, '#a89050'); }   // 編み笠
    if (v === 1) { P.ball(24, 22, 3.5, 2.5, ramp('#b07a45')); P.set(24, 20, '#ff8a6a'); }                                   // かご
    if (v === 4) { P.rect(11, top - 1, 10, 2, '#ffffff'); }
    P.set(14, top + 4, '#2a1a10'); P.set(18, top + 4, '#2a1a10');
    return P.outline();
  }

  // ---------------- 会話用の顔絵（64×64） ----------------
  function portraitTake() {
    const P = new Pix(64, 64);
    // マントと肩
    P.poly([[4, 64], [8, 46], [20, 40], [44, 40], [56, 46], [60, 64]], (x, y) => CH.scarf[P.idx(1.2 + (y - 40) / 30 + (x > 32 ? 0.6 : 0), x, y)]);
    P.box(18, 46, 28, 18, CH.blue, { round: true });
    P.rect(31, 46, 2, 18, CH.gold[2]); P.rect(24, 47, 1, 8, CH.gold[1]); P.rect(39, 47, 1, 8, CH.gold[1]);
    P.ball(14, 49, 8, 6, CH.blue, { bias: -0.4 }); P.ball(50, 49, 8, 6, CH.blue, { bias: -0.4 });
    P.rect(6, 52, 16, 2, CH.gold[1]); P.rect(42, 52, 16, 2, CH.gold[1]); P.ball(32, 44, 2.5, 2.5, CH.gold);
    P.box(18, 39, 28, 7, CH.scarf, { round: true }); P.poly([[18, 44], [26, 44], [22, 64], [12, 64]], lit(CH.scarf, 12, 14, 1.2)); P.ball(40, 43, 2, 2, CH.teal, flat());
    // 頭
    P.ball(11, 27, 3.5, 5, SKIN_T); P.ball(53, 27, 3.5, 5, SKIN_T);
    P.ball(32, 24, 20, 19, SKIN);
    // 坊主頭のつやと剃り跡
    P.ball(22, 10, 5, 3, ramp(SKIN[0]), { dither: false }); P.rect(19, 9, 3, 1, LIGHT);
    for (let i = 0; i < 40; i++) { const x = 16 + (SP.hash ? (i * 7) % 32 : i), y = 8 + (i * 5) % 8; P.set(x, y, SKIN[1]); }
    // 眉・目・ほお・口
    P.rect(19, 21, 7, 2, BROW); P.rect(38, 21, 7, 2, BROW);
    P.rect(20, 25, 5, 6, EYE); P.rect(39, 25, 5, 6, EYE);
    P.rect(20, 25, 2, 2, '#ffffff'); P.rect(39, 25, 2, 2, '#ffffff'); P.set(23, 29, '#5a4a6a'); P.set(42, 29, '#5a4a6a');
    P.rect(15, 33, 5, 2, CHEEK); P.rect(44, 33, 5, 2, CHEEK);
    P.rect(30, 30, 4, 2, SKIN[3]);
    P.rect(28, 36, 8, 2, MOUTH); P.set(27, 35, MOUTH); P.set(36, 35, MOUTH); P.rect(29, 38, 6, 1, '#e86a5a');
    return P.outline(0.92);
  }
  function portraitSai() {
    const P = new Pix(64, 64);
    // 長い黒髪（後ろ）
    P.poly([[10, 18], [54, 18], [58, 64], [6, 64]], (x, y) => CH.hair[P.idx(1.6 + (x > 32 ? 0.6 : 0) + (y - 18) / 60, x, y)]);
    // ドレスの肩（白・金・ピンク）
    P.poly([[14, 64], [18, 48], [46, 48], [50, 64]], (x, y) => CH.white[P.idx(0.9 + (x - 14) / 40, x, y)]);
    P.ball(18, 50, 7, 5, CH.pink); P.ball(46, 50, 7, 5, CH.pink);
    P.rect(24, 48, 16, 2, CH.gold[1]); P.line(24, 48, 32, 56, CH.gold[2]); P.line(40, 48, 32, 56, CH.gold[2]);
    P.ball(32, 57, 3, 3, CH.teal); P.set(31, 56, '#e8fffa');
    P.box(28, 42, 8, 7, SKIN);
    // 顔
    P.ball(32, 26, 17, 17, SKIN);
    // 前髪
    P.poly([[14, 26], [16, 10], [24, 4], [32, 3], [42, 5], [49, 12], [50, 26], [45, 16], [38, 12], [33, 16], [26, 11], [19, 18]], (x, y) => CH.hair[P.idx(1.0 + (y - 3) / 22 + (x > 32 ? 0.5 : 0), x, y)]);
    P.rect(14, 24, 4, 20, CH.hair[2]); P.rect(46, 24, 4, 20, CH.hair[3]);
    P.line(22, 8, 28, 6, CH.hair[0]); P.line(23, 9, 27, 8, CH.hair[1]);
    // ティアラ
    P.poly([[22, 6], [26, 1], [29, 4], [32, 0], [35, 4], [38, 1], [42, 6]], (x, y) => CH.gold[P.idx(0.6 + y / 6, x, y)]);
    P.ball(32, 3.5, 2, 2, CH.teal);
    // 目（まつげ）・眉・口
    P.rect(22, 21, 6, 1, '#3a2a30'); P.rect(37, 21, 6, 1, '#3a2a30');
    P.rect(22, 25, 6, 6, '#2a1a20'); P.rect(37, 25, 6, 6, '#2a1a20');
    P.rect(22, 24, 7, 1, '#1a0a10'); P.rect(36, 24, 7, 1, '#1a0a10');
    P.rect(23, 26, 2, 2, '#ffffff'); P.rect(38, 26, 2, 2, '#ffffff'); P.rect(25, 29, 2, 1, '#6a5a7a'); P.rect(40, 29, 2, 1, '#6a5a7a');
    P.rect(18, 33, 5, 2, CHEEK); P.rect(42, 33, 5, 2, CHEEK);
    P.rect(30, 37, 5, 1, MOUTH); P.rect(31, 38, 3, 1, '#e86a7a');
    // 髪かざり（プルメリア）
    P.ball(47, 12, 3.5, 3.5, ramp('#fff4f4')); P.set(47, 12, '#ffd84a'); P.set(46, 12, '#ffd84a');
    P.ball(15.5, 36, 1.3, 1.8, CH.teal, flat()); P.ball(48.5, 36, 1.3, 1.8, CH.teal, flat()); // 耳飾り
    return P.outline(0.92);
  }

  // ---------------- 敵 ----------------
  const E = {};
  E.frog = (f) => {
    const P = new Pix(32, 32); const g = ramp('#5cb84a'), y = ramp('#f0e08a');
    const s = f ? 1 : 0;
    P.ball(9, 27, 4, 2.5, g); P.ball(23, 27, 4, 2.5, g);
    P.ball(16, 21 + s, 11, 8.5 - s, g);
    P.ball(16, 24 + s, 7, 4.5, y);
    P.ball(10, 12 + s, 4, 4, g); P.ball(22, 12 + s, 4, 4, g);
    P.ball(10, 12 + s, 2.5, 2.6, ramp('#ffffff')); P.ball(22, 12 + s, 2.5, 2.6, ramp('#ffffff'));
    P.rect(10, 12 + s, 2, 2, '#1a1a1a'); P.rect(22, 12 + s, 2, 2, '#1a1a1a');
    P.set(11, 13 + s, '#ffffff'); P.set(23, 13 + s, '#ffffff');
    P.line(6, 8 + s, 11, 9 + s, g[4]); P.line(26, 8 + s, 21, 9 + s, g[4]); // 怒り眉
    P.poly([[10, 19 + s], [22, 19 + s], [19, 23 + s], [13, 23 + s]], '#7a1a2a'); P.rect(14, 21 + s, 4, 2, '#ff6a8a');
    P.rect(7, 17 + s, 2, 1, '#ff9fb0'); P.rect(23, 17 + s, 2, 1, '#ff9fb0');
    return P.outline();
  };
  E.turtle = (f) => {
    const P = new Pix(32, 32); const sh = ramp('#9b927f'), sk = ramp('#8fae7a');
    const hy = 9 + (f ? 1 : 0);
    P.ball(16, hy, 5, 4.2, sk); P.rect(13, hy - 1, 2, 2, '#ffffff'); P.rect(18, hy - 1, 2, 2, '#ffffff'); P.set(14, hy, '#111'); P.set(18, hy, '#111');
    P.line(12, hy - 2, 15, hy - 1, sk[4]); P.line(20, hy - 2, 17, hy - 1, sk[4]); P.rect(15, hy + 2, 3, 1, sk[4]);
    P.ball(7, 25, 3, 2.5, sk); P.ball(25, 25, 3, 2.5, sk);
    P.ball(16, 19, 12, 9, sh);
    for (const [cx, cy] of [[16, 17], [10, 20], [22, 20], [16, 23], [11, 14], [21, 14]]) {
      P.poly([[cx - 3, cy], [cx - 1, cy - 2], [cx + 1, cy - 2], [cx + 3, cy], [cx + 1, cy + 2], [cx - 1, cy + 2]], (x, y) => sh[P.idx(1.6 + (y - cy) / 4, x, y)]);
      P.line(cx - 3, cy, cx - 1, cy - 2, sh[4]); P.line(cx + 1, cy + 2, cx + 3, cy, sh[4]);
    }
    P.rect(5, 26, 22, 2, sh[4]);
    return P.outline();
  };
  E.monkey = (f) => {
    const P = new Pix(32, 32); const b = ramp('#9a5b2e'), fc = ramp('#f0c49a');
    P.line(23, 14, 30, 8 + f, '#c8a040'); P.line(23, 15, 30, 9 + f, '#8a6a20');
    P.ball(16, 24, 7, 6, b); P.ball(11, 30, 2.5, 1.5, b); P.ball(21, 30, 2.5, 1.5, b);
    P.ball(6, 12, 3, 3, fc); P.ball(26, 12, 3, 3, fc);
    P.ball(16, 12, 9, 8, b);
    P.ball(16, 14, 6.5, 5.5, fc);
    P.rect(12, 12, 2, 2, '#1a1010'); P.rect(18, 12, 2, 2, '#1a1010'); P.set(12, 12, '#fff'); P.set(18, 12, '#fff');
    P.rect(13, 17, 7, 1, '#7a1a1a'); P.rect(14, 18, 5, 1, '#ffffff'); P.set(13, 16, '#7a1a1a'); P.set(19, 16, '#7a1a1a'); // にやり
    P.line(11, 10, 14, 11, b[4]); P.line(21, 10, 18, 11, b[4]);
    P.ball(23, 18, 2, 2, fc);
    return P.outline();
  };
  E.root = (f) => {
    const P = new Pix(32, 32); const w = ramp('#7b5233'), l = ramp('#5aa040');
    for (let i = 0; i < 5; i++) { const x = 6 + i * 5; P.line(x, 24, x - 2 + (i % 2) * 4, 31, w[3]); P.line(x + 1, 24, x - 1 + (i % 2) * 4, 31, w[2]); }
    P.box(7, 8, 18, 18, w, { round: true });
    for (let y = 9; y < 25; y += 3) P.line(9 + (y % 2), y, 12 + (y % 2), y + 2, w[4]);
    P.ball(12, 15, 2.5, 2, ramp(f ? '#e8ff8a' : '#c8ff6a')); P.ball(20, 15, 2.5, 2, ramp(f ? '#e8ff8a' : '#c8ff6a'));
    P.line(9, 11, 14, 13, w[4]); P.line(23, 11, 18, 13, w[4]);
    for (let x = 12; x < 20; x++) P.set(x, 20 + (x % 2), '#2a1408'); P.rect(12, 21, 8, 1, '#2a1408');
    P.ball(10, 6, 4, 3, l); P.ball(20, 5, 5, 3.5, l); P.ball(15, 3, 3, 2.5, l);
    return P.outline();
  };
  E.jelly = (f) => {
    const P = new Pix(32, 32); const j = ramp('#6cc8f0');
    for (let i = 0; i < 5; i++) { const x = 8 + i * 4; for (let y = 19; y < 30; y++) P.set(x + Math.round(Math.sin((y + f * 2 + i) / 2)), y, j[(y % 3) + 1]); }
    P.ball(16, 14, 11, 9, j, { clip: (x, y) => y < 20 });
    P.ball(11, 10, 2, 1.5, ramp('#ffffff')); P.set(20, 9, '#e8faff');
    P.rect(12, 13, 2, 3, '#14304f'); P.rect(19, 13, 2, 3, '#14304f'); P.set(12, 13, '#ffffff'); P.set(19, 13, '#ffffff');
    P.rect(9, 16, 2, 1, '#ff9ad5'); P.rect(22, 16, 2, 1, '#ff9ad5'); P.rect(15, 17, 3, 1, '#2a4a7a');
    P.rect(6, 19, 21, 1, j[3]);
    return P.outline(0.6);
  };
  E.statue = (f) => {
    const P = new Pix(32, 32); const st = ramp('#a89f90'), moss = ramp('#6a9a4a');
    P.box(11, 24, 4, 7, st); P.box(17, 24, 4, 7, st);
    P.box(9, 13, 14, 12, st, { round: true });
    P.rect(9, 22, 14, 2, st[4]);
    P.ball(16, 8, 6, 6, st); P.rect(10, 4, 12, 3, st[3]); P.rect(15, 1, 2, 3, st[2]);
    P.rect(13, 8, 2, 1, f ? '#ff7a4a' : '#ffb04a'); P.rect(18, 8, 2, 1, f ? '#ff7a4a' : '#ffb04a');
    const R = ramp('#c8ccd4');
    P.box(24, 14, 3, 4, st); for (let i = 0; i < 12; i++) { P.set(25, 13 - i + (f ? 1 : 0), R[1]); P.set(26, 13 - i + (f ? 1 : 0), R[3]); }
    P.rect(23, 13 + (f ? 1 : 0), 5, 1, '#8a6a30');
    P.box(5, 14, 4, 8, st);
    P.set(12, 17, moss[2]); P.set(13, 18, moss[1]); P.set(19, 21, moss[2]); P.set(11, 26, moss[2]);
    return P.outline();
  };
  E.bat = (f) => {
    const P = new Pix(32, 32); const b = ramp('#5a3a7a');
    const up = f ? -4 : 0;
    P.poly([[15, 14], [2, 8 + up], [4, 14 + up / 2], [1, 19], [7, 17], [10, 21], [14, 18]], (x, y) => b[P.idx(2.2 + (y - 10) / 12, x, y)]);
    P.poly([[17, 14], [30, 8 + up], [28, 14 + up / 2], [31, 19], [25, 17], [22, 21], [18, 18]], (x, y) => b[P.idx(2.6 + (y - 10) / 12, x, y)]);
    P.ball(16, 16, 5, 5.5, b);
    P.poly([[12, 12], [13, 6], [15, 11]], b[2]); P.poly([[17, 11], [19, 6], [20, 12]], b[3]);
    P.rect(13, 14, 2, 2, '#ff4a4a'); P.rect(18, 14, 2, 2, '#ff4a4a'); P.set(13, 14, '#ffd0d0'); P.set(18, 14, '#ffd0d0');
    P.line(12, 13, 15, 14, b[4]); P.line(20, 13, 17, 14, b[4]);
    P.rect(14, 18, 5, 1, '#2a1030'); P.set(15, 19, '#ffffff'); P.set(17, 19, '#ffffff');
    return P.outline();
  };
  E.shaman = (f) => {
    const P = new Pix(32, 32); const robe = ramp('#4f7a3a'), mask = ramp('#e8d8b0');
    P.line(25, 6, 25, 30, '#7a5a30'); P.line(26, 6, 26, 30, '#5a3a20');
    P.ball(25.5, 5, 3 + f * 0.5, 3 + f * 0.5, ramp('#9effa0'));
    P.poly([[16, 6], [24, 28], [8, 28]], (x, y) => robe[P.idx(1.2 + (x - 8) / 9, x, y)]);
    P.ball(16, 10, 6, 6, robe);
    P.ball(16, 12, 4, 4, mask); P.rect(14, 12, 1, 1, '#1a1a1a'); P.rect(17, 12, 1, 1, '#1a1a1a'); P.rect(15, 14, 2, 1, '#a33');
    for (let x = 9; x < 24; x += 3) P.set(x, 26, '#d8c060');
    return P.outline();
  };
  E.lizard = (f) => {
    const P = new Pix(32, 32); const g = ramp('#6aa05a'), sp = ramp('#a05ac0');
    P.poly([[2, 25], [10, 20], [10, 24]], g[3]);
    P.ball(16, 21, 10, 5.5, g);
    P.ball(25, 15, 5, 4.5, g);
    P.ball(11, 26, 2, 2, g); P.ball(21, 26, 2, 2, g);
    for (const [x, y] of [[12, 19], [16, 18], [20, 20], [14, 22]]) P.ball(x, y, 1.4, 1.2, sp);
    P.rect(25, 12, 3, 3, '#ffe04a'); P.rect(26, 12, 1, 3, '#111'); P.line(24, 11, 28, 12, g[4]); P.line(26, 17, 30, 17, '#3a2a1a');
    if (f) { P.set(30, 17, '#ff4a6a'); P.set(31, 18, '#ff4a6a'); P.set(31, 16, '#ff4a6a'); }
    return P.outline();
  };
  E.thief = (f) => {
    const P = new Pix(32, 32); const b = ramp('#d8a030'), fc = ramp('#f8dcb0');
    P.ball(24, 24, 5, 5, ramp('#8a5a30')); P.rect(22, 19, 4, 2, '#5a3a20'); P.set(24, 23, '#ffe04a'); P.set(23, 25, '#ffe04a');
    P.ball(14, 24, 7, 6, b);
    P.ball(5, 12, 3, 3, fc); P.ball(23, 12, 3, 3, fc);
    P.ball(14, 12, 9, 8, b);
    P.ball(14, 14, 6, 5, fc);
    P.rect(9, 11, 10, 2, '#3a2a40'); P.set(11, 12, '#fff'); P.set(17, 12, '#fff');
    P.rect(13, 17, 3, 1, '#a33');
    if (f) P.set(28, 18, '#fff6b0');
    return P.outline();
  };
  E.golem = (f) => {
    const P = new Pix(32, 32); const r = ramp('#6a6a90'), cr = ramp('#7af0ff');
    P.box(8, 23, 6, 8, r); P.box(18, 23, 6, 8, r);
    P.box(4, 11, 24, 14, r, { round: true });
    P.ball(16, 8, 6, 5, r);
    P.poly([[4, 11], [6, 3], [9, 11]], (x, y) => cr[P.idx(0.8 + (y - 3) / 6, x, y)]);
    P.poly([[23, 11], [26, 2], [28, 11]], (x, y) => cr[P.idx(1.2 + (y - 2) / 6, x, y)]);
    P.ball(16, 17, 3, 3, ramp(f ? '#c8ffff' : '#7af0ff'));
    P.rect(12, 7, 3, 2, '#ffdf6a'); P.rect(18, 7, 3, 2, '#ffdf6a'); P.line(11, 6, 15, 7, r[4]); P.line(22, 6, 18, 7, r[4]); P.rect(14, 10, 5, 1, r[4]);
    return P.outline();
  };
  E.wisp = (f) => {
    const P = new Pix(32, 32); const w = ramp(f ? '#fff6b0' : '#ffe880');
    P.ball(16, 16, 8 + f, 8 + f, w);
    P.ball(16, 16, 4, 4, ramp('#ffffff'));
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + f * 0.5; P.set(16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12, '#fff6b0'); }
    P.rect(13, 14, 2, 3, '#8a6a10'); P.rect(18, 14, 2, 3, '#8a6a10'); P.set(13, 14, '#ffffff'); P.set(18, 14, '#ffffff'); P.rect(15, 18, 3, 1, '#c08a20');
    return P.outline(0.5);
  };
  E.guard = (f) => {
    const P = new Pix(32, 32); const gd = ramp('#d8a838'), cl = ramp('#8a2a3a');
    P.box(11, 24, 4, 7, gd); P.box(17, 24, 4, 7, gd);
    P.poly([[9, 14], [23, 14], [25, 26], [7, 26]], (x, y) => cl[P.idx(1.4 + (x - 7) / 18, x, y)]);
    P.box(9, 12, 14, 9, gd, { round: true });
    P.ball(16, 8, 6, 6, gd); P.rect(11, 8, 10, 2, '#2a1a10'); P.rect(13, 8, 2, 1, '#ff8a4a'); P.rect(18, 8, 2, 1, '#ff8a4a');
    P.poly([[14, 3], [18, 3], [20, 0], [12, 0]], ramp('#c83a3a')[2]);
    const R = ramp('#e8ecf0');
    for (let i = 0; i < 16; i++) { P.set(4, 28 - i - (f ? 2 : 0), R[1]); P.set(5, 28 - i - (f ? 2 : 0), R[3]); }
    P.rect(2, 13 - (f ? 2 : 0), 6, 2, gd[2]);
    return P.outline();
  };
  // ボス（48×48）
  E.lion = (f) => {
    const P = new Pix(48, 48); const g = ramp('#f2c84b'), m = ramp('#d0602a');
    P.box(10, 34, 7, 12, g); P.box(31, 34, 7, 12, g);
    P.ball(24, 32, 15, 10, g);
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; P.ball(24 + Math.cos(a) * 12, 17 + Math.sin(a) * 11, 4.5, 4.5, m); }
    P.ball(24, 18, 10, 9.5, g);
    P.rect(18, 15, 3, 3, '#2a1a10'); P.rect(27, 15, 3, 3, '#2a1a10'); P.set(18, 15, '#fff'); P.set(27, 15, '#fff');
    P.line(16, 12, 21, 14, g[4]); P.line(32, 12, 27, 14, g[4]);
    P.ball(24, 21, 3, 2, g, { bias: 0.8 });
    P.rect(19, 24 + f, 10, 3, '#8a2a20'); P.rect(20, 24 + f, 2, 2, '#fff'); P.rect(26, 24 + f, 2, 2, '#fff');
    P.rect(14, 41, 4, 1, g[4]); P.rect(32, 41, 4, 1, g[4]);
    return P.outline();
  };
  E.catfish = (f) => {
    const P = new Pix(48, 48); const b = ramp('#5a7a8a'), be = ramp('#c8d8c0');
    P.poly([[40, 26], [47, 18 + f * 2], [47, 36 - f * 2]], b[3]);
    P.ball(23, 28, 19, 13, b);
    P.ball(21, 33, 13, 6, be);
    P.rect(6, 28, 12, 2, '#2a3a40');
    P.line(7, 26, 0, 20 + f, '#2a3a40'); P.line(7, 30, 0, 38 - f, '#2a3a40'); P.line(9, 25, 3, 16 + f, '#2a3a40');
    P.ball(13, 21, 3, 3, ramp('#ffe04a')); P.rect(13, 21, 2, 2, '#111');
    const cr = ramp('#ffd84a');
    P.poly([[16, 15], [18, 7], [21, 12], [24, 5], [27, 12], [30, 7], [32, 15]], (x, y) => cr[P.idx(0.8 + (y - 5) / 10, x, y)]);
    P.set(24, 9, '#ff4a6a'); P.set(19, 11, '#4ac0ff'); P.set(29, 11, '#4ac0ff');
    return P.outline();
  };
  E.elephant = (f) => {
    const P = new Pix(48, 48); const g = ramp('#e8c050'), o = ramp('#c03a5a');
    P.box(10, 34, 8, 13, g); P.box(30, 34, 8, 13, g);
    P.ball(24, 30, 18, 12, g);
    P.ball(9, 19, 8, 10, g); P.ball(39, 19, 8, 10, g);
    P.ball(24, 18, 11, 10, g);
    for (let i = 0; i < 16; i++) P.ball(24 + Math.sin(i / 4 + f) * 2, 24 + i, 3.2 - i * 0.08, 2.2, g);
    P.rect(17, 15, 3, 3, '#2a1a10'); P.rect(28, 15, 3, 3, '#2a1a10'); P.set(17, 15, '#fff'); P.set(28, 15, '#fff');
    P.poly([[16, 8], [24, 3], [32, 8], [24, 11]], (x, y) => o[P.idx(1.2 + (y - 3) / 8, x, y)]);
    P.ball(24, 6, 2, 2, ramp('#b06ae0'));
    P.rect(12, 27, 24, 2, o[2]); for (let x = 13; x < 36; x += 3) P.set(x, 29, '#ffe880');
    P.poly([[18, 26], [14, 32], [17, 32]], '#fff6e0'); P.poly([[30, 26], [34, 32], [31, 32]], '#fff6e0');
    return P.outline();
  };

  /* ---------------- 章のボスと最終章（64×64。マスより大きく描き、立っているマスには足元の円で当たり判定を示す） ----------------
   * どれもこのゲームのためのオリジナルのドット絵（既存作品の画像は使わない）。光は左上から。f は2コマのアニメ。 */
  const litPoly = (P, R, x0, w, base) => (x, y) => R[P.idx((base == null ? 1 : base) + (x - x0) / w * 2, x, y, false)];
  // クロコダイン：大斧をかついだワニの獣王。緑のうろこ、金の肩当て、赤い鉢巻き
  E.croc = (f) => {
    const P = new Pix(64, 64), G1 = ramp('#4f9a4a'), B = ramp('#e8d8a0'), M = ramp('#c8a040'), S = ramp('#c8d4e0'), W = ramp('#7a4a24');
    P.poly([[34, 46], [52, 50], [62, 58], [58, 62], [40, 56]], litPoly(P, G1, 34, 28, 1.6));                   // しっぽ
    P.box(19, 44, 10, 16, G1); P.box(35, 44, 10, 16, G1);                                                      // 脚
    P.rect(17, 59, 13, 3, G1[3]); P.rect(34, 59, 13, 3, G1[3]); for (const x of [18, 22, 26, 35, 39, 43]) P.set(x, 61, '#f8f0d8');
    P.ball(32, 34, 16, 15, G1);                                                                              // 胴
    P.ball(32, 38, 9, 10, B, { bias: -0.2 }); for (let y = 31; y < 47; y += 3) P.rect(25, y, 14, 1, B[3]);    // 腹のうろこ
    P.line(18, 22, 44, 44, M[1]); P.line(19, 22, 45, 44, M[3]);                                               // たすき
    P.box(8, 26, 8, 17, G1); P.box(48, 26 - f, 8, 17, G1);                                                    // 腕
    P.ball(12, 44, 4.5, 4, G1); P.ball(52, 43 - f, 4.5, 4, G1);
    P.ball(16, 24, 7, 6, M, { bias: -0.3 }); P.ball(48, 24, 7, 6, M, { bias: -0.1 });                         // 肩当て
    for (const [x, y] of [[13, 21], [16, 20], [45, 20], [49, 21]]) P.set(x, y, '#fff6c0');
    // 大斧（右手）
    P.line(53, 8 - f, 53, 50 - f, W[2]); P.line(54, 8 - f, 54, 50 - f, W[3]);
    P.poly([[55, 4 - f], [63, 8 - f], [63, 22 - f], [55, 26 - f], [58, 15 - f]], litPoly(P, S, 55, 8, 0.6));
    P.line(55, 4 - f, 63, 8 - f, M[1]); P.line(63, 22 - f, 55, 26 - f, M[2]);
    // 頭：長い口、黄色い目、赤い鉢巻き
    P.ball(32, 12, 11, 9, G1);
    P.box(25, 14, 14, 10, G1, { round: true });
    P.rect(25, 21 + f, 14, 2, '#5a1a14'); for (let x = 26; x < 39; x += 2) { P.set(x, 20 + f, '#ffffff'); P.set(x + 1, 23 + f, '#ffffff'); }
    P.set(29, 15, G1[4]); P.set(34, 15, G1[4]);
    P.rect(23, 6, 18, 2, '#d03a2a'); P.rect(40, 7, 4, 2, '#d03a2a'); P.rect(42, 9, 3, 3, '#a02418');
    P.rect(26, 9, 3, 2, '#ffd84a'); P.rect(35, 9, 3, 2, '#ffd84a'); P.set(27, 9, '#2a1a10'); P.set(36, 9, '#2a1a10');
    return P.outline(0.9);
  };
  // フレイザード：左半身が炎、右半身が氷の岩の将。胸に核の宝石
  E.flame = (f) => {
    const P = new Pix(64, 64), F = ramp('#ff6a2a'), I2 = ramp('#7ad8ff'), K = ramp('#5a3a4a');
    const body = (x, y) => (x < 32 ? F[P.idx(1.2 + ((SP.hash(x >> 1, (y + f * 3) >> 2, 5) & 3) * 0.35) + (y - 20) / 50, x, y, false)]
      : I2[P.idx(1.0 + (((x - 32) + (y >> 1)) % 6 < 2 ? 0 : 1) + (x - 32) / 30, x, y, false)]);
    P.poly([[12, 22], [52, 22], [56, 42], [46, 58], [18, 58], [8, 42]], body);
    P.box(18, 50, 9, 12, K); P.box(37, 50, 9, 12, K);                                                        // 脚（岩）
    // 炎の舌（左）と氷のとげ（右）
    for (const [x, h] of [[12, 12], [18, 16], [24, 10]]) P.poly([[x - 4, 24], [x + (f ? 1 : -1), 24 - h], [x + 4, 24]], (xx, yy) => F[P.idx(0.4 + (24 - yy) / 12, xx, yy, false)]);
    for (const [x, h] of [[42, 12], [48, 16], [54, 10]]) P.poly([[x - 3, 24], [x, 24 - h], [x + 3, 24]], (xx) => I2[xx < x ? 0 : 2]);
    // 腕
    P.ball(7, 36, 6, 8, F); P.ball(57, 36, 6, 8, I2);
    for (let i = 0; i < 3; i++) P.ball(5 + i * 2, 46 + i * 4 - f, 2, 2, ramp('#ffd060'));
    P.poly([[54, 44], [62, 48], [58, 56]], I2[0]);
    // 頭
    P.ball(32, 14, 10, 10, ramp('#8a6a7a'));
    P.ball(28, 14, 6, 9, F, { clip: (x) => x < 32 }); P.ball(36, 14, 6, 9, I2, { clip: (x) => x >= 32 });
    P.rect(26, 13, 4, 3, '#ffe060'); P.rect(34, 13, 4, 3, '#e8ffff'); P.set(27, 14, '#5a1a00'); P.set(35, 14, '#0a3a5a');
    P.rect(28, 19, 8, 2, '#2a1018');
    // 胸の核
    P.ball(32, 34, 5, 5, ramp(f ? '#ff5aa0' : '#e04a8a')); P.set(30, 32, '#ffffff');
    return P.outline(0.85);
  };
  // キルバーン：黒いマントの死神道化。仮面、二又の帽子と鈴、大鎌
  E.kill = (f) => {
    const P = new Pix(64, 64), C = ramp('#2a2440'), R = ramp('#c03040'), W = ramp('#f0ece8'), S = ramp('#c8d0e0');
    // 大鎌（後ろ）
    P.line(46, 6, 38, 60, '#3a2a30'); P.line(47, 6, 39, 60, '#5a4a50');
    P.poly([[46, 6], [30, 2], [18, 8], [32, 7], [44, 12]], litPoly(P, S, 18, 28, 0.4)); P.line(18, 8, 30, 2, '#ffffff');
    // マント
    P.poly([[18, 22], [46, 22], [56, 62], [8, 62]], (x, y) => C[P.idx(1.2 + (x - 8) / 48 * 1.6 + ((x + y) % 9 === 0 ? 0.6 : 0), x, y, false)]);
    P.line(32, 26, 32, 62, C[4]);
    // えりのひだ
    for (let x = 18; x < 47; x += 4) P.poly([[x, 21], [x + 2, 26], [x + 4, 21]], W[1]);
    // 手（骨ばった）
    P.ball(14, 42, 3, 3, ramp('#c8c0d0')); P.ball(44, 38, 3, 3, ramp('#c8c0d0'));
    // 仮面と帽子
    P.ball(32, 15, 8, 9, W);
    P.rect(27, 13, 4, 3, '#1a1018'); P.rect(34, 13, 4, 3, '#1a1018'); P.set(35, 14, f ? '#ff3030' : '#c02020');
    P.line(28, 20, 36, 19, '#7a2a3a'); P.set(37, 18, '#7a2a3a');
    P.poly([[23, 9], [32, 4], [41, 9], [52, 18 - f], [44, 6], [32, 0], [20, 6], [12, 18 + f]], (x) => (x < 32 ? R[2] : C[1]));
    P.ball(12, 19 + f, 2, 2, ramp('#ffd84a')); P.ball(52, 19 - f, 2, 2, ramp('#ffd84a'));
    return P.outline(0.8);
  };
  // バラン：銀と青の鎧の竜の騎士。赤いマント、額の竜の紋章、大剣
  E.baran = (f) => {
    const P = new Pix(64, 64), A = ramp('#a8bcd8'), B = ramp('#3a62b0'), M = ramp('#e8c040'), Rc = ramp('#a8282a');
    P.poly([[14, 22], [50, 22], [58, 62], [6, 62]], litPoly(P, Rc, 6, 52, 1.4));                            // マント
    P.box(22, 44, 9, 16, A); P.box(34, 44, 9, 16, A); P.rect(21, 58, 11, 4, B[3]); P.rect(33, 58, 11, 4, B[3]);
    P.box(19, 23, 26, 23, A, { round: true });                                                                // 胴の鎧
    P.poly([[24, 26], [40, 26], [36, 40], [28, 40]], B[1]); P.rect(31, 27, 2, 12, M[1]);
    P.rect(19, 42, 26, 3, M[2]);                                                                               // 腰帯
    P.ball(15, 25, 8, 7, A, { bias: -0.2 }); P.ball(49, 25, 8, 7, A); P.rect(8, 28, 15, 2, M[1]); P.rect(42, 28, 15, 2, M[2]);
    P.box(9, 30, 7, 14, A); P.box(48, 30, 7, 14, A); P.ball(12, 45, 3.5, 3.5, ramp('#e2a678')); P.ball(51, 44, 3.5, 3.5, ramp('#e2a678'));
    // 大剣
    P.rect(51, 6, 3, 34, ramp('#e8eef8')[1]); P.rect(54, 6, 1, 34, ramp('#e8eef8')[3]); P.set(52, 5, '#ffffff');
    P.rect(46, 40, 13, 2, M[1]); P.rect(51, 42, 3, 6, '#5a3a20');
    if (f) for (const [x, y] of [[48, 10], [57, 16], [49, 22], [58, 4]]) { P.set(x, y, '#fff36a'); P.set(x + 1, y + 1, '#ffe040'); }
    // 兜と顔
    P.ball(32, 13, 9, 9, A);
    P.poly([[23, 10], [16, 2], [25, 7]], M[1]); P.poly([[41, 10], [48, 2], [39, 7]], M[2]);                 // 竜のひれ
    P.ball(32, 17, 5.5, 4.5, ramp('#e2a678'));
    P.rect(28, 16, 3, 1, '#2a1a10'); P.rect(34, 16, 3, 1, '#2a1a10');
    P.poly([[30, 9], [32, 6], [34, 9], [32, 12]], ramp('#ff4a4a')[f ? 0 : 1]);                              // 竜の紋章
    return P.outline(0.85);
  };
  // ミストバーン：白い頭巾の衣に包まれた影。顔は闇、光る目、影の手
  E.mist = (f) => {
    const P = new Pix(64, 64), W = ramp('#e8e4f0'), V = ramp('#5a3a8a');
    for (let i = 0; i < 6; i++) P.ball(12 + i * 8, 58 + ((i + f) % 2) * 2, 6, 4, V, { dither: true });       // 足元の闇の霧
    P.poly([[16, 18], [48, 18], [58, 60], [6, 60]], (x, y) => W[P.idx(1.0 + (x - 6) / 52 * 1.8 + ((x * 3 + y) % 11 === 0 ? 0.5 : 0), x, y, false)]);
    P.line(32, 30, 32, 60, W[3]); P.line(22, 30, 16, 60, W[3]); P.line(42, 30, 48, 60, W[3]);
    P.rect(18, 34, 28, 3, ramp('#c8a040')[2]);                                                                // 帯
    // 影の手と糸
    P.ball(10, 38, 4, 4, ramp('#2a1a3a')); P.ball(54, 38, 4, 4, ramp('#2a1a3a'));
    for (let i = 0; i < 6; i++) { P.set(6 - (i % 2), 42 + i * 3, '#8a6ac8'); P.set(58 + (i % 2), 42 + i * 3, '#8a6ac8'); }
    // 頭巾と闇の顔
    P.ball(32, 15, 13, 13, W, { bias: 0.1 });
    P.ball(32, 17, 8, 8, ramp('#140c20'), { dither: false });
    P.rect(28, 16, 2, 2, f ? '#ffffff' : '#c8f8ff'); P.rect(34, 16, 2, 2, f ? '#ffffff' : '#c8f8ff');
    return P.outline(0.7);
  };
  // 大魔王バーン：紫と金の衣の老いた魔王。額の第三の目、長い白髪、宝珠の杖
  E.vearn = (f) => {
    const P = new Pix(64, 64), Vt = ramp('#5a2a8a'), M = ramp('#e8c040'), H = ramp('#f0ece8'), Sk = ramp('#d8a888');
    P.poly([[14, 20], [50, 20], [60, 62], [4, 62]], (x, y) => Vt[P.idx(1.0 + (x - 4) / 56 * 1.8, x, y, false)]);
    P.line(14, 20, 4, 62, M[1]); P.line(50, 20, 60, 62, M[2]); P.rect(4, 60, 57, 2, M[2]);
    for (let y = 26; y < 60; y += 6) { P.set(32, y, M[0]); P.set(31, y + 1, M[1]); P.set(33, y + 1, M[1]); }
    P.poly([[22, 20], [42, 20], [38, 36], [26, 36]], M[2]);                                                  // 胸の飾り
    P.ball(32, 28, 3, 3, ramp('#c03060'));
    // 杖
    P.line(54, 8, 54, 60, M[2]); P.line(55, 8, 55, 60, M[3]);
    P.ball(54.5, 7, 5, 5, ramp(f ? '#ff70c0' : '#c84ab0')); P.set(53, 5, '#ffffff');
    P.ball(52, 32, 3.5, 3.5, Sk); P.ball(12, 34, 3.5, 3.5, Sk);
    // 白髪と顔
    P.poly([[20, 10], [44, 10], [48, 34], [16, 34]], (x) => H[x < 32 ? 1 : 2]);
    P.ball(32, 15, 8, 9, Sk);
    P.poly([[24, 8], [28, 0], [32, 6], [36, 0], [40, 8]], M[1]);                                             // 冠の角
    P.rect(28, 14, 3, 1, '#2a1018'); P.rect(34, 14, 3, 1, '#2a1018');
    P.ball(32, 10, 1.6, 2, ramp('#ff3060'));                                                                 // 第三の目
    P.poly([[27, 20], [37, 20], [35, 30], [32, 32], [29, 30]], H[0]);                                        // ひげ
    return P.outline(0.85);
  };
  // 真大魔王バーン：若い姿の大魔王。紫の気をまとい、黒と金の鎧、角、第三の目
  E.truevearn = (f) => {
    const P = new Pix(64, 64), A = ramp('#2a2040'), M = ramp('#e8c040'), Sk = ramp('#e0b090'), Hh = ramp('#3a2a5a'), Au = ramp('#b070ff');
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + f * 0.3; P.ball(32 + Math.cos(a) * 26, 34 + Math.sin(a) * 26, 3, 3, Au, { dither: true }); }
    P.poly([[12, 22], [52, 22], [62, 62], [2, 62]], (x, y) => ramp('#4a1a6a')[P.idx(1.4 + (x - 2) / 60 * 1.6, x, y, false)]);  // マント
    P.box(22, 44, 9, 16, A); P.box(34, 44, 9, 16, A);
    P.box(18, 22, 28, 24, A, { round: true }); P.rect(18, 42, 28, 3, M[1]);
    P.poly([[24, 24], [40, 24], [32, 40]], M[2]); P.ball(32, 30, 3, 3, ramp('#ff3060'));
    P.ball(14, 25, 8, 7, A); P.ball(50, 25, 8, 7, A); P.rect(7, 22, 14, 2, M[1]); P.rect(43, 22, 14, 2, M[1]);
    P.ball(9, 40, 4, 4, Sk); P.ball(55, 40, 4, 4, Sk);
    P.ball(9, 40 - f, 3, 3, Au, { dither: false }); P.ball(55, 40 + f, 3, 3, Au, { dither: false });        // 手の気
    // 長い黒紫の髪と顔、角
    P.poly([[20, 8], [44, 8], [50, 34], [14, 34]], (x) => Hh[x < 32 ? 1 : 3]);
    P.ball(32, 14, 7.5, 8.5, Sk);
    P.poly([[24, 8], [16, 0], [27, 6]], M[0]); P.poly([[40, 8], [48, 0], [37, 6]], M[1]);
    P.rect(28, 13, 3, 2, '#ff4060'); P.rect(34, 13, 3, 2, '#ff4060');
    P.ball(32, 8.5, 1.6, 2, ramp('#ff3060'));
    return P.outline(0.85);
  };
  // 最終章の敵（32×32）
  E.darkknight = (f) => {
    const P = new Pix(32, 32), A = ramp('#3a3448'), Rc = ramp('#8a1a2a');
    P.poly([[9, 12], [23, 12], [26, 30], [6, 30]], Rc[2]);
    P.box(11, 23, 4, 8, A); P.box(17, 23, 4, 8, A);
    P.box(9, 12, 14, 12, A, { round: true }); P.rect(9, 21, 14, 2, ramp('#c8a040')[2]);
    P.ball(16, 8, 6, 6, A); P.rect(12, 8, 8, 2, '#140c18'); P.rect(13, 8, 2, 1, f ? '#ff3030' : '#c02020'); P.rect(17, 8, 2, 1, f ? '#ff3030' : '#c02020');
    P.poly([[12, 3], [16, 0], [20, 3]], Rc[1]);
    for (let i = 0; i < 16; i++) { P.set(27, 26 - i - f, '#c8d0e0'); P.set(28, 26 - i - f, '#7a8090'); }
    P.rect(25, 26 - f, 5, 2, ramp('#c8a040')[2]);
    return P.outline();
  };
  E.imp = (f) => {
    const P = new Pix(32, 32), Rr = ramp('#c8403a');
    P.poly([[6, 10], [14, 14], [10, 20]], ramp('#5a2a3a')[2 + f % 2]); P.poly([[26, 10], [18, 14], [22, 20]], ramp('#5a2a3a')[2 + f % 2]);   // 羽
    P.ball(16, 20, 6, 7, Rr); P.box(12, 25, 3, 5, Rr); P.box(17, 25, 3, 5, Rr);
    P.ball(16, 11, 6, 5.5, Rr);
    P.poly([[11, 8], [9, 2], [13, 6]], '#f0e0c0'); P.poly([[21, 8], [23, 2], [19, 6]], '#f0e0c0');
    P.rect(13, 10, 2, 2, '#ffe060'); P.rect(18, 10, 2, 2, '#ffe060'); P.rect(14, 14, 4, 1, '#3a0a0a');
    P.ball(25, 19 - f, 3, 3, ramp('#ffa030'));
    return P.outline();
  };

  // ---------------- 道具アイコン（16×16）：色だけでなく形と小さな印で見分ける ----------------
  const TINT = {
    wood: '#b07a45', copper: '#d98a4a', iron: '#aab4c0', steel: '#dfe8f2', jade: '#4fd08a', crystal: '#9ae8ff', gold: '#ffd84a',
    dragon: '#3ac8a0', frost: '#8ad8ff', moon: '#c8b8ff', hero: '#7ab0ff',
  };
  const I = {};
  // 剣：材質で刃の色、強さで刃の長さ・つばの形が変わる
  I.sword = (t) => {
    const P = new Pix(16, 16); const R = ramp(TINT[t] || '#cfd8e0');
    const len = { wood: 7, copper: 8, iron: 9, steel: 10, jade: 10, crystal: 11, gold: 11, frost: 11, dragon: 12, hero: 12 }[t] || 9;
    for (let i = 0; i < len; i++) { P.set(5 + i, 10 - i, R[1]); P.set(6 + i, 10 - i, R[2]); P.set(6 + i, 11 - i, R[3]); }
    P.set(5 + len, 10 - len + 1, R[0]);
    const guard = t === 'gold' || t === 'crystal' || t === 'hero' || t === 'dragon' ? ramp('#ffd84a') : t === 'wood' ? ramp('#7a4a24') : t === 'frost' ? ramp('#ff7a3a') : ramp('#8a6a40');
    P.line(2, 9, 6, 13, guard[2]); P.line(3, 9, 7, 13, guard[1]);
    if (t === 'steel' || t === 'gold' || t === 'jade' || t === 'crystal') { P.set(1, 8, guard[1]); P.set(8, 14, guard[1]); }
    P.rect(2, 12, 2, 2, '#5a3a20'); P.set(1, 14, guard[2]);
    if (t === 'jade') P.set(4, 11, '#2aff9a'); if (t === 'crystal') P.set(4, 11, '#ffffff'); if (t === 'gold') P.set(4, 11, '#ff4a6a');
    return P.outline();
  };
  // 盾：木は丸盾、鉄は紋章入り、はがねは鋲つきのカイト型、宝石の盾は中央に宝石
  I.shield = (t) => {
    const P = new Pix(16, 16); const R = ramp(TINT[t] || '#aab4c0');
    if (t === 'wood') {
      P.ball(8, 8, 6.5, 6.5, R); for (let x = 4; x < 13; x += 3) P.line(x, 3, x, 13, R[3]); P.ball(8, 8, 1.8, 1.8, ramp('#aab4c0'));
    } else if (t === 'iron') {
      P.poly([[2, 2], [14, 2], [14, 8], [8, 15], [2, 8]], (x, y) => R[P.idx(0.6 + (x - 2) / 8 + (y - 2) / 14, x, y)]);
      P.ball(8, 7, 2.5, 2.2, ramp('#f2c440')); P.set(6, 9, '#f2c440');
    } else if (t === 'iceflame') {   // 氷炎の盾：左が氷・右が炎
      const Ri = ramp('#8ad8ff'), Rf = ramp('#ff7a3a');
      P.poly([[2, 2], [14, 2], [13, 9], [8, 15], [3, 9]], (x, y) => (x < 8 ? Ri : Rf)[P.idx(0.4 + (y - 2) / 16, x, y)]);
      P.rect(3, 3, 10, 1, '#ffffff'); P.line(8, 2, 8, 14, '#e8e8f0');
    } else {
      P.poly([[2, 2], [14, 2], [13, 9], [8, 15], [3, 9]], (x, y) => R[P.idx(0.4 + (x - 2) / 9 + (y - 2) / 16, x, y)]);
      P.rect(3, 3, 10, 1, R[0]);
      if (t === 'steel') for (const [x, y] of [[4, 4], [11, 4], [4, 8], [11, 8], [8, 12]]) P.set(x, y, '#ffffff');
      else { const G = ramp({ gold: '#ff4a6a', jade: '#2aff9a', dragon: '#ff5a4a', moon: '#fff6b0', hero: '#ffd84a' }[t] || '#ffffff'); P.ball(8, 7, 2.2, 2.6, G); P.rect(3, 2, 10, 1, ramp('#ffd84a')[1]); }
    }
    return P.outline();
  };
  // やくそう：葉1枚。上やくそう：葉3枚と光。どくけしそう：白い十字の印
  I.herb = (t) => {
    const P = new Pix(16, 16); const R = ramp(t === 'cure' ? '#9ad040' : '#4cb84a');
    P.line(8, 15, 8, 7, '#6a4a2a');
    if (t === 'big') { P.ball(4, 8, 3.5, 2.2, R); P.ball(12, 7, 3.5, 2.2, R); P.ball(8, 4, 2.4, 3.4, R); P.set(13, 2, '#ffffff'); P.set(12, 1, '#fff6b0'); P.set(14, 1, '#fff6b0'); }
    else if (t === 'cure') { P.ball(8, 6, 4.5, 4.5, R); P.rect(7, 4, 2, 5, '#ffffff'); P.rect(6, 5, 4, 2, '#ffffff'); }
    else { P.ball(6, 7, 4, 2.5, R); P.ball(10, 5, 3, 2.5, R); }
    return P.outline();
  };
  I.potion = () => { const P = new Pix(16, 16); const R = ramp('#e04a8a');
    P.rect(6, 1, 4, 2, '#9b6b3a'); P.box(6, 3, 4, 3, ramp('#e8e0ff')); P.ball(8, 10, 5, 5, R);
    P.set(7, 9, '#ffffff'); P.set(9, 9, '#ffffff'); P.rect(6, 10, 5, 1, '#ffffff'); P.rect(7, 11, 3, 1, '#ffffff'); P.set(8, 12, '#ffffff'); // ハートの印
    return P.outline(); };
  I.banana = () => { const P = new Pix(16, 16); const R = ramp('#ffe04a');
    for (let i = 0; i < 11; i++) { const a = i / 10 * Math.PI * 0.9 + 0.3; P.ball(8 - Math.cos(a) * 6, 4 + Math.sin(a) * 8, 1.8, 1.8, R); }
    P.rect(13, 1, 2, 2, '#5a4010'); return P.outline(); };
  I.onigiri = () => { const P = new Pix(16, 16); P.poly([[8, 1], [15, 13], [1, 13]], (x, y) => ramp('#ffffff')[P.idx(0.5 + (x - 1) / 12, x, y)]);
    P.rect(5, 9, 6, 5, '#1f3a2a'); P.set(7, 6, '#e05a5a'); return P.outline(); };
  I.bento = () => { const P = new Pix(16, 16);
    P.box(1, 5, 14, 9, ramp('#c0402a'), { round: true }); P.rect(2, 6, 12, 7, '#2a1a10');
    P.ball(5, 9, 2.6, 2.2, ramp('#ffffff')); P.ball(11, 8, 2.4, 1.6, ramp('#e8902a')); P.ball(10, 11, 1.6, 1.4, ramp('#4caf50')); P.set(13, 10, '#e05a5a');
    P.rect(1, 3, 14, 2, ramp('#f2c440')[2]); return P.outline(); };
  I.sleepgrass = () => { const P = new Pix(16, 16); const F = ramp('#a070e0');
    P.line(6, 15, 6, 7, '#3a7a3a'); P.line(10, 15, 10, 9, '#3a7a3a'); P.ball(4, 12, 2, 1.2, ramp('#4caf50'));
    P.ball(6, 6, 2.6, 2.6, F); P.ball(10, 8, 2.2, 2.2, F); P.set(6, 6, '#ffe04a'); P.set(10, 8, '#ffe04a');
    P.rect(11, 1, 4, 1, '#ffffff'); P.set(13, 2, '#ffffff'); P.set(12, 3, '#ffffff'); P.rect(11, 4, 4, 1, '#ffffff'); // Z
    return P.outline(); };
  // 杖：いかずちの杖は木の柄に青い宝珠。雷帝の杖は金の柄・王冠の飾り・紫の宝珠に雷をまとう
  I.staff = (t) => {
    const P = new Pix(16, 16);
    if (t === 'king') {
      P.line(2, 15, 9, 7, '#e8b830'); P.line(3, 15, 10, 7, '#9a6a10'); P.set(5, 12, '#ffffff'); P.set(7, 10, '#c0402a');
      P.ball(11.5, 4.5, 3.4, 3.4, ramp('#b070ff'));
      P.set(9, 1, '#ffe04a'); P.set(11, 0, '#ffe04a'); P.set(13, 1, '#ffe04a'); P.line(9, 2, 13, 2, '#e8b830');   // 王冠
      P.set(10, 3, '#ffffff');
      P.outline();
      P.line(15, 3, 14, 6, '#fff36a'); P.line(14, 6, 15, 8, '#fff36a'); P.set(8, 6, '#fff36a'); P.set(7, 5, '#fff8b0'); // 雷
      return P;
    }
    P.line(3, 15, 10, 6, '#8a5a2a'); P.line(4, 15, 11, 6, '#5a3a20');
    P.ball(12, 4, 3, 3, ramp('#7ac8ff')); P.line(11, 2, 13, 4, '#ffe04a'); P.line(13, 4, 12, 6, '#ffe04a'); return P.outline(); };
  // 巻物：帰還＝赤いひもと家の印、みとおし＝青いひもと目の印、雷鳴＝黄色いひもと稲妻の印
  I.scroll = (t) => {
    const P = new Pix(16, 16); const R = ramp('#f5e6c0');
    P.box(2, 3, 12, 10, R); P.box(1, 2, 2, 12, ramp('#c8a070')); P.box(13, 2, 2, 12, ramp('#c8a070'));
    const rib = t === 'sight' ? '#2f6fd0' : t === 'thunder' ? '#e8b020' : '#c0392b';
    P.rect(3, 12, 10, 1, rib);
    if (t === 'sight') { P.ball(8, 7, 3.5, 2, ramp('#ffffff')); P.ball(8, 7, 1.4, 1.4, ramp('#2f6fd0')); }
    else if (t === 'thunder') { P.line(9, 4, 6, 8, '#e8a010'); P.line(6, 8, 10, 8, '#e8a010'); P.line(10, 8, 7, 11, '#e8a010'); }
    else { P.poly([[8, 4], [12, 8], [4, 8]], '#c0392b'); P.rect(5, 8, 6, 3, '#c0392b'); P.rect(7, 9, 2, 2, '#f5e6c0'); }
    return P.outline();
  };
  // 護符（持っているだけで効く）：水＝青い雫、雷＝黄色い稲妻
  I.charm = (t) => { const P = new Pix(16, 16); const R = ramp(t === 'bolt' ? '#e8c040' : '#3a9ad8');
    P.line(4, 1, 8, 5, '#c8a060'); P.line(12, 1, 8, 5, '#c8a060');
    P.poly([[3, 6], [13, 6], [13, 12], [8, 15], [3, 12]], (x, y) => R[P.idx(0.6 + (x - 3) / 10 + (y - 6) / 12, x, y)]);
    if (t === 'bolt') { P.line(9, 7, 6, 10, '#fff6c0'); P.line(6, 10, 10, 10, '#fff6c0'); P.line(10, 10, 7, 13, '#fff6c0'); }
    else { P.ball(8, 10.5, 2, 2.6, ramp('#bff0ff')); P.set(8, 7, '#bff0ff'); }
    return P.outline(); };
  I.mirror = () => { const P = new Pix(16, 16); P.rect(7, 11, 2, 5, '#8a5a2a'); P.ball(8, 6.5, 5.5, 5.5, ramp('#e8c040')); P.ball(8, 6.5, 4, 4, ramp('#cfe8ff'));
    P.line(6, 4, 9, 3, '#ffffff'); P.set(10, 8, '#ffffff'); return P.outline(); };
  I.incense = () => { const P = new Pix(16, 16); P.box(4, 10, 8, 5, ramp('#b0603a'), { round: true }); P.rect(4, 10, 8, 1, '#e8a060');
    P.line(8, 9, 8, 6, '#6a4a2a'); for (let i = 0; i < 5; i++) P.set(7 + Math.round(Math.sin(i) * 2), 5 - i, '#dfe8f0'); P.set(11, 2, '#c8d8e8'); P.set(5, 3, '#c8d8e8'); return P.outline(); };
  I.coin = () => { const P = new Pix(16, 16); P.ball(8, 8, 6, 6, ramp('#ffd84a')); P.ball(8, 8, 3.2, 3.2, ramp('#e0a820')); P.rect(7, 6, 2, 4, '#fff6b0'); return P.outline(); };
  I.elephant = (t) => { const P = new Pix(16, 16); const R = ramp(t === 'gold' ? '#ffd84a' : '#4fc08a');
    P.ball(9, 9, 5, 4, R); P.ball(4, 7, 3, 3, R); P.line(2, 8, 2, 13, R[2]); P.box(6, 12, 2, 3, R); P.box(10, 12, 2, 3, R); P.set(4, 6, '#111'); P.ball(6, 6, 1.6, 2.4, R); return P.outline(); };
  I.lotus = (t) => { const P = new Pix(16, 16); const R = ramp(t === 'prism' ? '#c8a0ff' : '#ffd84a');
    P.ball(8, 6, 2.5, 5, R); P.ball(4, 8, 2.5, 4, R); P.ball(12, 8, 2.5, 4, R); P.rect(3, 12, 10, 2, '#3a8a40');
    if (t === 'prism') { P.set(6, 6, '#7af0ff'); P.set(10, 7, '#ff9ad5'); P.set(8, 3, '#fff6b0'); }
    return P.outline(); };
  I.gem = (t) => { const P = new Pix(16, 16); const R = ramp(t === 'crystal' ? '#9ae8ff' : '#ff7a5a');
    P.poly([[4, 5], [8, 2], [12, 5], [8, 14]], (x, y) => R[P.idx(0.4 + (x - 4) / 5, x, y)]); P.line(4, 5, 12, 5, R[0]); P.set(7, 4, '#ffffff'); return P.outline(); };
  I.orb = () => { const P = new Pix(16, 16); P.ball(8, 7, 5.5, 5.5, ramp('#b06ae0')); P.set(6, 5, '#fff'); P.box(4, 12, 8, 3, ramp('#ffd84a')); return P.outline(); };
  I.gold = () => { const P = new Pix(16, 16); const R = ramp('#ffd84a');
    for (const [x, y] of [[5, 12], [10, 12], [8, 10], [6, 8], [11, 9], [8, 6]]) P.ball(x, y, 3, 1.6, R); return P.outline(); };
  I.pendant = () => { const P = new Pix(16, 16); P.line(3, 1, 8, 7, '#c8a040'); P.line(13, 1, 8, 7, '#c8a040'); P.ball(8, 10, 4, 4.5, ramp('#e8902a')); P.set(7, 8, '#fff2c0'); return P.outline(); };
  I.bell = () => { const P = new Pix(16, 16); const R = ramp('#c08a40'); P.rect(7, 1, 2, 2, '#6a4a20'); P.ball(8, 8, 5, 6, R, { clip: (x, y) => y < 13 }); P.rect(2, 12, 12, 2, R[3]); P.ball(8, 14, 1.5, 1.5, R); return P.outline(); };
  I.crown = (t) => { const P = new Pix(16, 16); const R = ramp(t === 'blue' ? '#7ac0d0' : '#ffd84a');
    P.poly([[2, 13], [2, 5], [5, 9], [8, 3], [11, 9], [14, 5], [14, 13]], (x, y) => R[P.idx(0.5 + (y - 3) / 10, x, y)]);
    P.set(8, 9, '#ff4a6a'); P.set(4, 11, '#4ac0ff'); P.set(12, 11, '#4ac0ff'); return P.outline(); };
  I.pearl = () => { const P = new Pix(16, 16); P.ball(8, 9, 6, 6, ramp('#f0f0ff')); P.set(6, 6, '#ffffff'); P.set(10, 12, '#c8c8f0'); return P.outline(); };
  // 素材：かけらの形に、地域の印（琥珀=しずく、青銅=歯車、すいしょう=ひし形、金ぱく=薄い板）
  I.shard = (t) => { const P = new Pix(16, 16); const R = ramp({ amber: '#e8902a', bronze: '#c08a40', crystal: '#9ae8ff', gold: '#ffd84a' }[t] || '#cccccc');
    if (t === 'gold') { P.poly([[2, 6], [12, 3], [14, 10], [4, 13]], (x, y) => R[P.idx(0.4 + (x - 2) / 10, x, y)]); P.line(4, 7, 11, 5, R[0]); }
    else if (t === 'bronze') { P.ball(8, 8, 5.5, 5.5, R); P.ball(8, 8, 2, 2, ramp('#5a3a20')); for (let a = 0; a < 8; a++) P.set(8 + Math.cos(a * Math.PI / 4) * 6.5, 8 + Math.sin(a * Math.PI / 4) * 6.5, R[3]); }
    else if (t === 'amber') { P.ball(8, 10, 4.5, 4.5, R); P.poly([[8, 1], [12, 8], [4, 8]], R[2]); P.set(7, 9, '#fff2c0'); P.set(9, 11, '#7a4a10'); }
    else { P.poly([[8, 1], [13, 8], [8, 15], [3, 8]], (x, y) => R[P.idx(0.4 + (x - 3) / 6, x, y)]); P.line(8, 1, 8, 15, R[0]); }
    return P.outline(); };
  /* アクセサリー（仮のアイコン。見本の絵ができたら js/assets.js の items.byId で差し替える）。形と色で4種類を見分ける */
  // 毒よけの指輪：銀の輪に緑の石
  I.ring = () => { const P = new Pix(16, 16); const M = ramp('#c8ccd8');
    for (let a = 0; a < 40; a++) { const t = a / 40 * Math.PI * 2; P.set(Math.round(8 + Math.cos(t) * 5), Math.round(10 + Math.sin(t) * 4), M[a % 3 === 0 ? 1 : 2]); }
    for (let a = 0; a < 40; a++) { const t = a / 40 * Math.PI * 2; P.set(Math.round(8 + Math.cos(t) * 4), Math.round(10 + Math.sin(t) * 3), M[3]); }
    P.ball(8, 5, 3, 3, ramp('#5ad06a')); P.set(7, 4, '#e8ffe0'); return P.outline(); };
  // がまぐちの守り：赤い布の口金つき小袋（金の口金と玉）
  I.purse = () => { const P = new Pix(16, 16); P.ball(8, 10, 6, 5, ramp('#c8403a')); P.rect(3, 6, 10, 2, ramp('#e8c040')[2]); P.rect(3, 6, 10, 1, '#fff0a0');
    P.ball(6, 4.5, 1.5, 1.5, ramp('#e8c040')); P.ball(10, 4.5, 1.5, 1.5, ramp('#e8c040')); P.rect(6, 10, 4, 1, '#ffd0a0'); return P.outline(); };
  // 満腹の腕輪：太い金の輪に、おにぎり形の白い飾り
  I.bangle = () => { const P = new Pix(16, 16); const G = ramp('#e8b030');
    for (let a = 0; a < 60; a++) { const t = a / 60 * Math.PI * 2; for (let r = 4; r <= 6; r++) P.set(Math.round(8 + Math.cos(t) * r), Math.round(8 + Math.sin(t) * (r - 1)), G[r === 6 ? 3 : r === 4 ? 1 : 2]); }
    P.poly([[8, 1], [12, 7], [4, 7]], '#ffffff'); P.rect(6, 5, 4, 2, '#2a3a2a'); return P.outline(); };
  // ボスの報酬（仮の絵。新しい絵が届いたら差し替える）
  // クロコダインの斧：木の柄に大きな刃
  I.axe = (t) => { const P = new Pix(16, 16); const R = ramp(TINT[t] || '#aab4c0');
    P.line(3, 14, 11, 4, '#7a4a24'); P.line(4, 14, 12, 4, '#5a3a20');
    P.poly([[9, 1], [15, 4], [14, 9], [10, 6]], (x, y) => R[P.idx(0.3 + (x - 9) / 8, x, y)]); P.line(10, 2, 14, 4, R[0]); return P.outline(); };
  // ファントムマスク：白い仮面に紫の目
  I.mask = () => { const P = new Pix(16, 16); P.ball(8, 8, 6, 6.5, ramp('#e8e4f0')); P.rect(4, 6, 3, 2, '#5a2a8a'); P.rect(9, 6, 3, 2, '#5a2a8a');
    P.line(6, 12, 10, 12, '#8a6aa8'); P.set(8, 3, '#c8a0ff'); return P.outline(); };
  // 竜の紋章：赤い宝石を囲む金の紋
  I.crest = () => { const P = new Pix(16, 16); P.poly([[8, 1], [15, 8], [8, 15], [1, 8]], ramp('#ffd84a')[2]); P.poly([[8, 3], [13, 8], [8, 13], [3, 8]], ramp('#e8b030')[1]);
    P.ball(8, 8, 2.5, 2.5, ramp('#ff3a3a')); P.set(7, 7, '#ffe0e0'); return P.outline(); };
  // 大魔王のローブ：黒紫の衣に金の縁
  I.robe = () => { const P = new Pix(16, 16); const R = ramp('#5a3a8a');
    P.poly([[5, 1], [11, 1], [14, 15], [2, 15]], (x, y) => R[P.idx(0.5 + (x - 2) / 14, x, y)]); P.line(8, 2, 8, 15, '#ffd84a'); P.rect(5, 1, 6, 1, '#ffd84a'); P.rect(2, 14, 13, 1, '#ffd84a'); return P.outline(); };
  // 命つなぎの首飾り：金の鎖に赤いハートの石
  I.lifeneck = () => { const P = new Pix(16, 16); P.line(2, 1, 8, 7, '#e8c040'); P.line(14, 1, 8, 7, '#e8c040');
    const H = ramp('#ff3a5a'); P.ball(6, 9, 2.5, 2.5, H); P.ball(10, 9, 2.5, 2.5, H); P.poly([[3, 10], [13, 10], [8, 15]], H[2]); P.set(5, 8, '#ffe0e8'); return P.outline(); };
  I.smoke = () => { const P = new Pix(16, 16); P.ball(8, 10, 5, 5, ramp('#5a5a6a')); P.ball(7, 4, 3, 2.5, ramp('#d8d8e0')); P.ball(11, 3, 2, 2, ramp('#e8e8f0')); P.line(10, 6, 12, 4, '#c0392b'); return P.outline(); };
  I.powder = () => { const P = new Pix(16, 16); P.ball(8, 10, 5.5, 4.5, ramp('#d8c8f0')); P.rect(6, 3, 4, 3, '#8a6aa8'); P.set(4, 6, '#c8b8ff'); P.set(12, 7, '#c8b8ff'); P.rect(6, 10, 4, 1, '#6a4a8a'); return P.outline(); };

  // ---------------- 地形タイル（32×32） ----------------
  const THEME = {
    brick:   { floor: '#c4875a', floor2: '#b07448', wall: '#a8502e', top: '#4a2418', deco: '#6a9a3a', bg: '#140a08', light: '#ffb060' },
    roots:   { floor: '#b0855e', floor2: '#9a7050', wall: '#a2502e', top: '#2e2214', deco: '#5aa040', root: '#5a3a1e', bg: '#0c0a04', light: '#ffcf70' },
    water:   { floor: '#8ab4c0', floor2: '#76a0ae', wall: '#3f7f96', top: '#16303e', deco: '#ff8fb8', bg: '#04101a', light: '#9ae8ff' },
    orb:     { floor: '#c8a070', floor2: '#b48c5e', wall: '#b07a3a', top: '#3a2410', deco: '#ffd84a', bg: '#100804', light: '#ffd070' },
    garden:  { floor: '#aa8a62', floor2: '#927452', wall: '#9a5232', top: '#1e2a16', deco: '#e05a8a', root: '#4a3018', bg: '#060a04', light: '#c8ff8a' },
    sunken:  { floor: '#78a0ae', floor2: '#68909e', wall: '#4a6f80', top: '#0e2430', deco: '#ffd84a', bg: '#030c12', light: '#7ad0ff' },
    crystal: { floor: '#7890a0', floor2: '#647c8c', wall: '#4e6a80', top: '#142430', deco: '#7af0ff', bg: '#030a10', light: '#7af0ff' },
    gold:    { floor: '#6a5a74', floor2: '#5a4c64', wall: '#4e3e5e', top: '#1c1226', deco: '#ffe060', bg: '#06030a', light: '#c070ff' },
    shrine:  { floor: '#c4a6dc', floor2: '#b094c8', wall: '#8a6ab0', top: '#26183a', deco: '#ffd84a', bg: '#0a0614', light: '#ffd8ff' },
    // 最終章とボス部屋
    demon:       { floor: '#4a3a5a', floor2: '#40324e', wall: '#3a2a48', top: '#140c1c', deco: '#e8c040', bg: '#06030a', light: '#c070ff' },
    throne:      { floor: '#5a4a6a', floor2: '#4e405e', wall: '#4a3a5a', top: '#180e24', deco: '#ffd84a', bg: '#08040e', light: '#ffb0f0' },
    arena_croc:  { floor: '#8a9468', floor2: '#7a845c', wall: '#5a6a48', top: '#1a2414', deco: '#6aaa48', bg: '#040a04', light: '#c8ff9a' },
    arena_flame: { floor: '#7a6060', floor2: '#6a5454', wall: '#5a3a40', top: '#1c1014', deco: '#ff8a3a', bg: '#0a0406', light: '#ffa060' },
    arena_kill:  { floor: '#5a2a3a', floor2: '#3a2030', wall: '#4a2a40', top: '#14080e', deco: '#e8c040', bg: '#080206', light: '#ff7090' },
    arena_baran: { floor: '#c8c0a8', floor2: '#b8b098', wall: '#8a9ab8', top: '#1e2434', deco: '#e8c040', bg: '#04060c', light: '#a0c8ff' },
    arena_mist:  { floor: '#4a3e6a', floor2: '#40365e', wall: '#3a3058', top: '#100c1e', deco: '#b090ff', bg: '#04030a', light: '#c8b0ff' },
  };
  SP.themeColors = THEME;
  const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + (s || 0) * 2246822519) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
  SP.hash = hash;

  function floorTile(theme, v) {
    const T = THEME[theme], P = new Pix(32, 32);
    const A = ramp(T.floor), B = ramp(T.floor2);
    const style = { brick: 'stone', roots: 'flag', water: 'tile', orb: 'tile', garden: 'flag', sunken: 'tile', crystal: 'tile', gold: 'tile', shrine: 'tile' }[theme] || 'tile';
    if (style === 'cave') {
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const n = (hash(x >> 2, y >> 2, v) & 15) / 15;
        P.set(x, y, A[P.idx(1.6 + n * 1.2, x, y)]);
      }
    } else {
      // 石畳：大小の石を並べ、1つずつ明るさを変える
      const cells = style === 'stone' ? [[0, 0, 16, 10], [16, 0, 16, 10], [0, 10, 10, 11], [10, 10, 12, 11], [22, 10, 10, 11], [0, 21, 18, 11], [18, 21, 14, 11]]
        : style === 'flag' ? [[0, 0, 20, 14], [20, 0, 12, 14], [0, 14, 12, 18], [12, 14, 20, 18]]
          : [[0, 0, 16, 16], [16, 0, 16, 16], [0, 16, 16, 16], [16, 16, 16, 16]];
      cells.forEach(([x0, y0, w, h], i) => {
        const R = (hash(i, v, 7) & 1) ? A : B;
        const b = ((hash(i, v, 3) & 7) - 3) * 0.12;
        for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
          let f = 1.7 + b + (y - y0) / h * 0.4;
          if (y === y0 || x === x0) f = 0.8 + b;
          if (y === y0 + h - 1 || x === x0 + w - 1) f = 3.4;
          P.set(x, y, R[P.idx(f, x, y)]);
        }
      });
    }
    const r = hash(v, 99, 5) % 6;
    if (theme === 'brick' && r < 2) { P.set(6 + v, 24, T.deco); P.set(7 + v, 23, T.deco); P.set(8 + v, 24, ramp(T.deco)[1]); }
    if ((theme === 'roots' || theme === 'garden') && r < 3) for (let i = 0; i < 6; i++) P.set((hash(i, v, 2) % 30) + 1, (hash(v, i, 4) % 30) + 1, ramp(T.deco)[(i % 3) + 1]);
    if (theme === 'garden' && r === 0) { P.ball(22, 22, 3, 2, ramp('#3a8a40')); P.ball(22, 20, 1.5, 1.5, ramp(T.deco)); }
    if (theme === 'crystal' && r < 2) P.poly([[10, 26], [13, 18], [16, 26]], (x, y) => ramp(T.deco)[P.idx(0.6 + (x - 10) / 5, x, y)]);
    if ((theme === 'gold' || theme === 'shrine') && r === 1) { P.rect(14, 14, 4, 4, ramp(T.deco)[2]); P.set(15, 15, '#fff'); }
    if ((theme === 'water' || theme === 'sunken') && r === 2) for (let i = 0; i < 4; i++) P.set(8 + i * 5, 26 - i, ramp('#9ad0e0')[1]);
    return P.canvas();
  }
  function wallFace(theme, v) {
    const T = THEME[theme], P = new Pix(32, 32), W = ramp(T.wall);
    P.rect(0, 0, 32, 32, shade(T.wall, 0.45));
    if (theme === 'crystal') {
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) P.set(x, y, W[P.idx(1.8 + ((hash(x >> 3, y >> 2, v) & 7) / 7) * 1.4 + y / 40, x, y)]);
      const cr = ramp(T.deco);
      if (v !== 1) P.poly([[6 + v * 4, 30], [10 + v * 4, 12], [14 + v * 4, 30]], (x, y) => cr[P.idx(0.4 + (x - 6 - v * 4) / 5, x, y)]);
    } else {
      for (let row = 0; row < 5; row++) {
        const off = row % 2 ? 8 : 0, h = 6;
        for (let bx = -16; bx < 32; bx += 16) {
          const b = ((hash(bx + 20, row, v) & 7) - 3) * 0.15;
          for (let y = row * h + 1; y < row * h + h; y++) for (let x = bx + off + 1; x < bx + off + 16; x++) {
            let f = 1.8 + b + (y - row * h) / h * 0.6;
            if (y === row * h + 1) f = 1.0 + b;
            if (x === bx + off + 15) f = 3.2;
            P.set(x, y, W[P.idx(f, x, y)]);
          }
        }
      }
    }
    P.rect(0, 30, 32, 2, W[4]);
    if ((theme === 'roots' || theme === 'garden') && v % 2 === 0) {
      const R = ramp(T.root);
      for (let y = 0; y < 30; y++) { P.set(9 + Math.round(Math.sin(y / 4) * 2), y, R[2]); P.set(10 + Math.round(Math.sin(y / 4) * 2), y, R[3]); }
      P.ball(8, 6, 3, 2, ramp(T.deco)); P.ball(22, 14, 2.5, 2, ramp('#5aa040'));
    }
    if (theme === 'garden' && v === 1) for (let i = 0; i < 5; i++) P.ball(4 + i * 6, 2 + (i % 2) * 2, 2.5, 2, ramp('#4a8a3a'));
    if (theme === 'sunken' && v === 1) { P.rect(0, 20, 32, 10, ramp('#2a6a90')[2]); for (let x = 2; x < 32; x += 6) P.set(x, 21, '#9ad8f0'); }
    if ((theme === 'gold' || theme === 'shrine' || theme === 'orb') && v === 2) {
      const G = ramp('#ffd84a'); P.rect(0, 12, 32, 3, G[2]); for (let x = 1; x < 32; x += 4) P.set(x, 13, G[0]);
    }
    if (theme === 'water' && v === 2) { P.ball(16, 12, 5, 6, ramp('#3a7a96')); P.rect(14, 11, 4, 2, '#1e4050'); }
    return P.canvas();
  }
  function wallTop(theme, v) {
    const T = THEME[theme], P = new Pix(32, 32), R = ramp(T.top);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) P.set(x, y, R[P.idx(2.4 + ((hash(x >> 2, y >> 2, v + 11) & 3) / 3) * 0.9, x, y)]);
    if ((theme === 'roots' || theme === 'garden') && v === 2) P.box(0, 13, 32, 5, ramp(T.root));
    if (theme === 'garden' && v === 3) P.ball(16, 16, 6, 5, ramp('#3a6a2a'));
    if (theme === 'crystal' && v === 1) P.ball(10, 20, 2, 2, ramp(T.deco));
    return P.canvas();
  }

  // 動くもの：壁のたいまつ・帰還の祠・帰還口・宝箱
  // 壁のたいまつ：鉄の受け金（壁に打った留め金と腕木）、木の柄、3コマでゆらぐ炎（芯は白、外は地域の灯りの色）
  function torch(theme, f) {
    const P = new Pix(32, 32), T = THEME[theme];
    const iron = ramp('#5a5660');
    P.rect(13, 20, 6, 3, iron[3]); P.rect(13, 20, 6, 1, iron[1]);          // 留め金
    P.rect(15, 23, 2, 2, iron[4]);
    P.line(16, 20, 16, 16, iron[2]); P.rect(12, 15, 8, 2, iron[2]); P.rect(12, 15, 8, 1, iron[1]);   // 腕木と受け皿
    P.box(14, 11, 4, 5, ramp('#6a4424'));                                   // 柄
    P.rect(13, 10, 6, 2, ramp('#3a2a20')[2]);                               // 布を巻いた先
    const sway = [0, 1, -1][f % 3], tall = [0, 1, 0][f % 3];
    P.ball(16 + sway * 0.5, 7 - tall, 4, 5.5 + tall * 0.5, ramp(T.light));
    P.ball(16 + sway, 4 - tall, 2, 3, ramp(T.light), { bias: -0.6 });
    P.ball(16, 8, 1.6, 2.4, ramp('#ffffff'));
    P.outline(0.55);
    return P.canvas();
  }
  // 下り階段：石の枠の中に、奥（暗がり）へ下っていく段
  function stairsTile() {
    const P = new Pix(32, 32), F = ramp('#c8b48c'), S = ramp('#a8987c');
    P.rect(2, 2, 28, 28, '#0c0808');
    for (let i = 0; i < 6; i++) {
      const y = 4 + i * 4, inset = 4 + i, t = i / 6;
      const top = shade('#d8c8a4', -t * 0.9), front = shade('#9a8a6c', -t * 0.95);
      P.rect(inset, y, 32 - inset * 2, 2, top);
      P.rect(inset, y + 2, 32 - inset * 2, 2, front);
      P.set(inset, y, shade('#d8c8a4', 0.2 - t)); P.set(31 - inset, y + 1, shade('#5a4a3a', -t));
    }
    // 左右の側壁と、手前の縁
    P.poly([[2, 2], [4, 4], [10, 28], [2, 30]], (x, y) => S[P.idx(2.4 + y / 30, x, y, false)]);
    P.poly([[30, 2], [28, 4], [22, 28], [30, 30]], (x, y) => S[P.idx(3.2 + y / 40, x, y, false)]);
    P.rect(0, 0, 32, 2, F[1]); P.rect(0, 0, 2, 32, F[1]); P.rect(30, 0, 2, 32, F[3]); P.rect(0, 30, 32, 2, F[3]);
    P.rect(1, 1, 30, 1, F[0]);
    P.set(0, 0, F[2]); P.set(31, 31, F[4]);
    return P.canvas();
  }
  function returnStone(f) {
    const P = new Pix(32, 32), S = ramp('#7a8898');
    P.ball(16, 28, 12, 3, ramp(f ? '#8af0ff' : '#5ac8e8'));
    P.box(9, 6, 14, 22, S, { round: true });
    P.poly([[9, 6], [16, 1], [23, 6]], (x, y) => S[P.idx(1 + (x - 9) / 10, x, y)]);
    const g = ramp(f ? '#c8ffff' : '#6ae0ff');
    P.rect(15, 10, 2, 12, g[1]); P.rect(12, 14, 8, 2, g[1]); P.set(15, 10, '#ffffff');
    return P.outline().canvas();
  }
  function portalTile(f) {
    const P = new Pix(32, 32);
    for (let r = 13; r > 2; r -= 2) P.ball(16, 16, r, r, ramp(r % 4 === 1 ? '#ffd84a' : '#fff6b0'), { dither: false });
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + f * 0.4; P.set(16 + Math.cos(a) * 14, 16 + Math.sin(a) * 14, '#ffffff'); }
    return P.canvas();
  }
  function chestTile(f) {
    const P = new Pix(32, 32), W = ramp('#a0602a'), G = ramp('#ffd84a');
    P.box(6, 14, 20, 12, W, { round: true });
    P.ball(16, 14, 10, 5, W, { clip: (x, y) => y <= 14 });
    P.rect(6, 15, 20, 2, G[2]); P.rect(6, 23, 20, 2, G[3]); P.rect(14, 16, 4, 5, G[1]); P.set(15, 18, '#3a2010');
    P.outline();
    if (f) { P.set(24, 7, '#ffffff'); P.set(23, 8, '#fff6b0'); P.set(25, 8, '#fff6b0'); P.set(24, 9, '#ffffff'); }
    return P.canvas();
  }

  // ---------------- まとめて作る ----------------
  SP.build = function () {
    const s = {};
    s.take = {};
    for (const face of ['down', 'up', 'right']) {
      s.take[face] = { walk: [0, 1, 2, 3].map((f) => drawTake(face, f, false).canvas()), atk: drawTake(face, 0, true).canvas() };
    }
    s.take.left = { walk: s.take.right.walk.map(flipCanvas), atk: flipCanvas(s.take.right.atk) };
    s.sai = [drawSai(0).canvas(), drawSai(1).canvas()];
    s.portrait = { take: portraitTake().canvas(), sai: portraitSai().canvas(), yanai: portraitYanai().canvas() };
    s.villagers = [0, 1, 2, 3, 4].map((v) => villager(v).canvas());
    s.portrait.villager = s.villagers[2];
    s.big = { take: bigTake().canvas(), sai: bigSai().canvas() };
    s.enemy = {};
    for (const k of Object.keys(E)) s.enemy[k] = [E[k](0).canvas(), E[k](1).canvas()];
    s.icon = {};
    for (const k of Object.keys(I)) s.icon[k] = I[k]().canvas();
    s.iconT = {};
    SP.s = s;
    return s;
  };
  // 道具の定義 → 内部ID（内部IDごとの絵 TS.ASSETS.items.byId を探すため）
  let defIds = null;
  const idOf = (def) => {
    if (!defIds) { defIds = new Map(); for (const [id, d] of Object.entries(TS.Data.ITEMS)) defIds.set(d, id); }
    return defIds.get(def);
  };
  // 見本の絵：内部IDごとの絵を優先し、無ければ「アイコン名:色分け」の絵
  const artIcon = (def, kind) => {
    const b = SP.art.itemsById[idOf(def)];
    if (b && b[kind]) return b[kind];
    const e = SP.art.items[def.icon + ':' + (def.tint || '')]; return e && e[kind] ? e[kind] : null;
  };
  SP.iconFor = function (def) {
    const key = def.icon + ':' + (def.tint || '');
    const a = artIcon(def, 'floor');
    if (a) return a;
    const s = SP.s;
    if (!s.iconT[key]) s.iconT[key] = I[def.icon] ? I[def.icon](def.tint).canvas() : s.icon.coin;
    return s.iconT[key];
  };
  /* 床に落ちているお金の絵。描く大きさ（px）以上で一番小さい絵（無ければ一番大きい絵）を選ぶ＝縮めて点が欠けるのを避ける。
   * 絵が無ければコードで描いたお金の山 */
  SP.goldIcon = function (px) {
    const sizes = Object.keys(SP.art.gold).map(Number).sort((a, b) => a - b);
    if (!sizes.length) return SP.s.icon.gold;
    const s = sizes.find((n) => n >= px) || sizes[sizes.length - 1];
    return SP.art.gold[s];
  };
  /* 床のお宝の宝箱（assets/chest/）。選び方はお金と同じ。絵が無ければ null（コードで描いた宝箱を使う） */
  SP.chestIcon = function (px) {
    const sizes = Object.keys(SP.art.chest).map(Number).sort((a, b) => a - b);
    if (!sizes.length) return null;
    return SP.art.chest[sizes.find((n) => n >= px) || sizes[sizes.length - 1]];
  };
  SP.enemyFrames = (sprite) => SP.s.enemy[sprite] || SP.s.enemy.frog;

  const urlCache = {};
  SP.iconURL = function (def) {
    const a = artIcon(def, 'list');
    const byId = SP.art.itemsById[idOf(def)];
    const key = def.icon + (def.tint || '') + (a ? (byId && byId.list === a ? '@id:' + idOf(def) : '@art') : '');
    if (!urlCache[key]) {
      // 一覧用は96×96（見本の絵48×48は2倍、コードで描いた32×32は3倍。どちらも整数倍で拡大）
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(a || SP.iconFor(def), 0, 0, 96, 96);
      urlCache[key] = c.toDataURL();
    }
    return urlCache[key];
  };
  // 会話の顔絵（顔のあたりを拡大）
  // who：顔絵の種類（take / sai / yanai / villager / friend1 …）か、'boss:敵ID'（ボスの絵をそのまま使う）
  SP.portraitURL = function (who, size) {
    let src;
    if (String(who).startsWith('boss:')) {
      const E = TS.Data.ENEMIES[who.slice(5)]; src = E && SP.s.enemy[E.sprite] ? SP.s.enemy[E.sprite][0] : SP.s.portrait.villager;
      if (src && src.art) { // 見本のボスの絵は、頭から胸までを切り出す
        const t = topRow(src), c0 = document.createElement('canvas'); c0.width = c0.height = 56;
        const g0 = c0.getContext('2d'); g0.fillStyle = '#2a2236'; g0.fillRect(0, 0, 56, 56); g0.drawImage(src, 20, Math.max(0, t - 2), 56, 56, 0, 0, 56, 56);
        src = c0;
      }
    } else src = SP.s.portrait[who] || SP.s.portrait.villager;
    const c = document.createElement('canvas');
    c.width = c.height = size || 64;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL();
  };

  /* 完成画像への差し替え（js/assets.js の TS.ASSETS に画像のパスを書くと、コードで描いた絵の代わりに使う）。
   * 読み込めなかったときは、いつものドット絵のまま。 */
  SP.loadOverrides = function (onDone) {
    const A = TS.ASSETS || {}, jobs = [];
    const load = (src, cb) => { const img = new Image(); jobs.push(1); img.onload = () => { cb(img); done(); }; img.onerror = done; img.src = src; };
    let left = 0;
    function done() { left--; if (left <= 0 && onDone) onDone(); }
    for (const [k, src] of Object.entries(A.portraits || {})) if (src) { left++; load(src, (img) => { SP.s.portrait[k] = img; }); }
    for (const [k, src] of Object.entries(A.bosses || {})) if (src) {
      left++;
      load(src, (img) => { // 横に2コマ並べた画像（1コマは正方形）
        const n = Math.max(1, Math.round(img.width / img.height)), w = img.width / n;
        SP.s.enemy[k] = [0, 1].map((i) => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.drawImage(img, Math.min(i, n - 1) * w, 0, w, img.height, 0, 0, 64, 64); return c; });
      });
    }
    if (!left && onDone) onDone();
  };

  /* デザイン見本から作った画像（js/assets.js）を読み込む。読み込めたものから、コードで描いた絵と入れかえる。
   * SP.art.chars[名前] = { front, back, side, sideR }（キャンバス 52×64、足の裏 y=62）
   * SP.art.items[キー] = { list(48×48), floor(32×32) } */
  SP.art = { chars: {}, items: {}, itemsById: {}, gold: {}, chest: {}, village: {}, ground: {}, bosses: {}, enemies: {}, take: {}, ready: false };
  SP.loadArt = function (onDone) {
    const A = TS.ASSETS || {};
    let left = 0, finished = false;
    const end = () => { if (finished) return; finished = true; SP.art.ready = true; buildFromArt(); if (onDone) onDone(); };
    const load = (src, cb) => { left++; const img = new Image(); img.onload = () => { cb(img); if (--left === 0) end(); }; img.onerror = () => { if (--left === 0) end(); }; img.src = src; };
    for (const [who, v] of Object.entries(A.chars || {})) {
      const c = SP.art.chars[who] = {};
      for (const view of ['front', 'back', 'side']) if (v[view]) load(v[view], (img) => { c[view] = toCanvas(img); if (view === 'side') c.sideR = flipCanvas(c.side); });
    }
    const IT = A.items || {};
    for (const [key, name] of Object.entries(IT.map || {})) {
      const e = SP.art.items[key] = {};
      load(IT.dir + 'list/' + name + '.png', (img) => { e.list = toCanvas(img); });
      load(IT.dir + 'floor/' + name + '.png', (img) => { e.floor = toCanvas(img); });
    }
    for (const [id, name] of Object.entries(IT.byId || {})) {
      const e = SP.art.itemsById[id] = {};
      // 値がフォルダ付きのパスならそのフォルダ、名前だけなら byIdDir。床用は同じフォルダの floor/
      const cut = name.lastIndexOf('/'), dir = cut >= 0 ? name.slice(0, cut + 1) : IT.byIdDir, base = name.slice(cut + 1);
      load(dir + base + '.png', (img) => { e.list = toCanvas(img); });
      load(dir + 'floor/' + base + '.png', (img) => { e.floor = toCanvas(img); });
    }
    for (const [size, src] of Object.entries(A.gold || {})) if (src) load(src, (img) => { SP.art.gold[size] = toCanvas(img); });
    for (const [size, src] of Object.entries(A.chest || {})) if (src) load(src, (img) => { SP.art.chest[size] = toCanvas(img); });
    // 村の素材：建物・小物、子供（正面・右・背面）、猫（座る・右向き・眠る）。右向きは反転して左向きも作る
    const VA = A.village;
    if (VA && VA.community) for (const n of VA.community.names) load(VA.community.dir + n + '.png', (img) => { SP.art.village['com_' + n] = toCanvas(img); });
    if (VA && VA.decor) for (const n of VA.decor.names) load(VA.decor.dir + n + '.png', (img) => { SP.art.village['deco_' + n] = toCanvas(img); });
    if (VA && VA.ruins) for (const n of VA.ruins.names) load(VA.ruins.dir + n + '.png', (img) => { SP.art.village['ruin_' + n] = toCanvas(img); });
    if (VA && VA.ground) for (const n of Object.keys(VA.ground.textures)) load(VA.ground.dir + n + '.png', (img) => { SP.art.ground[n] = toCanvas(img); });
    if (VA) {
      const names = Object.keys(VA.props || {});
      for (const v of Object.values(VA.kids || {})) names.push(v + '_front', v + '_right', v + '_back');
      for (const v of Object.values(VA.cats || {})) names.push(v + '_sit', v + '_right', v + '_sleep');
      for (const n of names) load(VA.dir + n + '.png', (img) => { const c = toCanvas(img); SP.art.village[n] = c; if (/_right$/.test(n)) SP.art.village[n.replace(/_right$/, '_left')] = flipCanvas(c); });
    }
    for (const [k, src] of Object.entries(A.takeFrames || {})) load(src, (img) => { SP.art.take[k] = toCanvas(img); });
    for (const [k, src] of Object.entries(A.bosses || {})) if (src) load(src, (img) => { const c = toCanvas(img); c.art = true; SP.art.bosses[k] = c; });
    // 通常の敵：横に並んだコマ（正方形）を分ける。1コマなら同じ絵を2回使う
    for (const [k, src] of Object.entries(A.enemies || {})) if (src) load(src, (img) => {
      const n = Math.max(1, Math.round(img.width / img.height)), w = img.width / n;
      const fr = [0, 1].map((i) => { const c = document.createElement('canvas'); c.width = w; c.height = img.height; c.getContext('2d').drawImage(img, Math.min(i, n - 1) * w, 0, w, img.height, 0, 0, w, img.height); c.art = true; return c; });
      SP.art.enemies[k] = fr;
    });
    if (!left) end();
  };
  function toCanvas(img) { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); return c; }
  // 人物のいちばん上の不透明な行（頭のてっぺん）
  function topRow(cv) {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3]) return y;
    return 0;
  }
  // 顔絵：正面の絵の頭から肩までを切り出す（36×36 → 会話では2倍で表示）
  function headCrop(cv) {
    const t = topRow(cv), c = document.createElement('canvas'); c.width = c.height = 36;
    const g = c.getContext('2d'); g.fillStyle = '#e9dcc0'; g.fillRect(0, 0, 36, 36);
    g.drawImage(cv, 26 - 18, Math.max(0, t - 2), 36, 36, 0, 0, 36, 36);
    return c;
  }
  // 記念像：ヤナイの正面の絵を青銅の色に置きかえる（明るさで5段階の青銅色）
  function bronze(cv) {
    const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
    const g = c.getContext('2d'); g.drawImage(cv, 0, 0);
    const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
    const R = [[58, 40, 30], [98, 68, 44], [140, 100, 60], [184, 140, 84], [226, 190, 120]];
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const l = (d[i] * 0.3 + d[i + 1] * 0.55 + d[i + 2] * 0.15) / 255;
      const k = Math.max(0, Math.min(4, Math.round(l * 5.2 - 0.6))), q = R[k];
      d[i] = q[0]; d[i + 1] = q[1]; d[i + 2] = q[2];
    }
    g.putImageData(im, 0, 0);
    return c;
  }
  function buildFromArt() {
    const ch = SP.art.chars, s = SP.s;
    // ダンジョンのたけ：正面・背面・横（右は反転）。歩きは上下動で表す
    const t = ch.take, F = SP.art.take;
    if (t && t.front && t.back && t.side) {
      // 向きごとのコマの組：idle 待機、w1／w2 左足・右足、a1 構え、a2 振り抜き。nw は武器なしの組（無ければ同じ組）
      const pack = (v) => {
        const one = (suf) => F[v + suf] || F[v] || null;
        const set = { idle: one(''), w1: one('_w1'), w2: one('_w2'), a1: one('_a1'), a2: one('_a2'), art: true };
        const fin = (o) => { o.art = true; o.walk = [o.idle, o.w1, o.idle, o.w2]; o.atk = o.a2; return o; };   // 以前の呼び方にも合わせる
        fin(set);
        set.nw = F[v + '_nw'] ? fin({ idle: F[v + '_nw'], w1: F[v + '_nw_w1'] || F[v + '_nw'], w2: F[v + '_nw_w2'] || F[v + '_nw'], a1: F[v + '_nw_a1'] || F[v + '_nw'], a2: F[v + '_nw_a2'] || F[v + '_nw'] }) : set;
        return set;
      };
      const down = pack('front'), up = pack('back'), left = pack('side');
      let right = pack('right');
      if (!right.idle) right = { idle: t.sideR, w1: t.sideR, w2: t.sideR, a1: t.sideR, a2: t.sideR, art: true, walk: [t.sideR, t.sideR, t.sideR, t.sideR], atk: t.sideR };
      if (!right.nw) right.nw = right;
      if (down.idle && up.idle && left.idle) s.take = { down, up, left, right };
    }
    for (const who of Object.keys(ch)) if (ch[who].front) s.portrait[who] = headCrop(ch[who].front);
    if (ch.yanai && ch.yanai.front) SP.art.statue = bronze(ch.yanai.front);
    // 村の子供の顔絵（会話用）：正面の絵の頭から肩まで
    const VA = TS.ASSETS && TS.ASSETS.village;
    if (VA) for (const [id, v] of Object.entries(VA.kids || {})) {
      const cv = SP.art.village[v + '_front'];
      if (!cv) continue;
      const t = topRow(cv), c = document.createElement('canvas'); c.width = c.height = 36;
      const g = c.getContext('2d'); g.fillStyle = '#e9dcc0'; g.fillRect(0, 0, 36, 36);
      g.drawImage(cv, VA.kidAnchor[0] - 18, Math.max(0, t - 3), 36, 36, 0, 0, 36, 36);
      s.portrait['kid_' + id] = c;
    }
    // ボス：見本の絵（1枚）。待機・予告・被弾などの違いは描画側の動き・点滅で出す
    for (const [k, cv] of Object.entries(SP.art.bosses)) s.enemy[k] = [cv, cv];
    for (const [k, fr] of Object.entries(SP.art.enemies)) s.enemy[k] = fr;
  }
  // 絵の形のまま1色に塗った影絵（攻撃予告の赤い点滅・撃破の白い光に使う）。一度作って使い回す
  const tintCache = new Map();
  SP.tinted = function (img, col) {
    const key = col; let m = tintCache.get(img);
    if (!m) { m = {}; tintCache.set(img, m); }
    if (!m[key]) {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
      m[key] = c;
    }
    return m[key];
  };
  SP.charArt = (who) => SP.art.chars[who] && SP.art.chars[who].front ? SP.art.chars[who] : null;

  SP.buildTiles = function () {
    const out = {};
    for (const theme of Object.keys(THEME)) {
      out[theme] = {
        floor: [0, 1, 2, 3, 4, 5].map((v) => floorTile(theme, v)),
        face: [0, 1, 2, 3].map((v) => wallFace(theme, v)),
        top: [0, 1, 2, 3].map((v) => wallTop(theme, v)),
        torch: [0, 1, 2].map((f) => torch(theme, f)),
      };
    }
    out.stairs = stairsTile();
    out.returnPoint = [returnStone(0), returnStone(1)];
    out.portal = [portalTile(0), portalTile(1), portalTile(2)];
    out.chest = [chestTile(0), chestTile(1)];
    out.hash = hash;
    SP.tiles = out;
    return out;
  };

  TS.Sprites = SP;
})(globalThis.TS = globalThis.TS || {});
