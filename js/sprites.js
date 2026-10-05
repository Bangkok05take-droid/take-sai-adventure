/* オリジナルのドット絵（スーパーファミコン風）。
 * 外部の画像を使わず、小さな「ドット絵ペインター」で陰影・ディザ・輪郭線つきの絵をコードで描く。
 * キャラクターと敵は32×32（ボスは48×48）、タイル32×32、道具アイコン16×16。
 * 起動時に一度だけ描いてキャンバスを使い回す（毎フレーム描き直さない）。 */
(function (TS) {
  'use strict';
  const SP = {};

  // ---------------- 色 ----------------
  const hex2rgb = (h) => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
  const rgb2hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
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
  const SKIN = ramp('#f4c193'), SKIN_T = ramp('#e2a678');
  const C = {
    blue: ramp('#3a6fd8'), navy: ramp('#2a3f8a'), steel: ramp('#c9d3e2'), gold: ramp('#f2c440'), cape: ramp('#f08a2a'),
    brown: ramp('#7a4c2a'), boot: ramp('#5a4a6a'), hair: ramp('#2a2238'), white: ramp('#f8f4ee'), pink: ramp('#f6b8cc'),
    teal: ramp('#22c0b0'), blade: ramp('#e4ecf4'), shieldB: ramp('#2f5fc0'),
  };
  const EYE = '#2a1a12', BROW = '#6a3a1a', MOUTH = '#b8483a', CHEEK = '#f59a8e';

  /* ---------------- たけ（坊主頭・金の縁取りの青い服・オレンジのマント・剣と盾） ----------------
   * 32×32の1マスに収まる2.5頭身。頭を小さめにして、服・マント・装備の形が分かるようにした。
   * face: down/up/right, f: 歩行コマ 0..3, atk: 攻撃ポーズ */
  function drawTake(face, f, atk) {
    const P = new Pix(32, 32);
    const bob = f === 1 || f === 3 ? -1 : 0;
    const legA = f === 1 ? -1 : f === 3 ? 1 : 0;
    const sway = f === 1 ? 1 : f === 3 ? -1 : 0;
    const ty = 14 + bob; // 胴の上端
    const capeR = (x, y) => C.cape[P.idx(1.2 + (y - ty) / 16 + (x > 16 ? 0.6 : 0), x, y)];
    // マント（体の後ろ）
    if (face === 'down') P.poly([[9, ty], [23, ty], [25 + sway, ty + 14], [7 + sway, ty + 14]], capeR);
    if (face === 'right') P.poly([[10, ty], [16, ty], [13 - sway, ty + 15], [4 - sway * 2, ty + 14]], capeR);
    // 足：紺のズボンと茶色のブーツ
    const leg = (x, y, h) => { P.box(x, y, 3, h, C.navy); P.box(x - (face === 'right' ? 0 : 0), y + h - 2, 4, 3, C.boot); P.set(x, y + h - 2, C.gold[2]); };
    if (face === 'right') { leg(13 + legA * 2, ty + 11, 5); leg(16 - legA * 2, ty + 11, 5); }
    else { leg(12, ty + 11 + Math.min(0, legA), 5 - Math.min(0, legA)); leg(17, ty + 11 - Math.max(0, legA), 5 + Math.max(0, legA)); }
    // 胴：青い服（すそ広がり）＋金の縁取り
    const tunic = face === 'right' ? [[12, ty], [20, ty], [21, ty + 12], [11, ty + 12]] : [[11, ty], [21, ty], [23, ty + 12], [9, ty + 12]];
    P.poly(tunic, (x, y) => C.blue[P.idx(1.2 + (x - 9) / 14 + (y - ty) / 30, x, y)]);
    const hemL = face === 'right' ? 11 : 9, hemR = face === 'right' ? 21 : 23;
    P.rect(hemL, ty + 11, hemR - hemL, 1, C.gold[1]); // すその金
    if (face !== 'up') {
      if (face === 'down') { P.rect(16, ty + 1, 1, 10, C.gold[2]); P.rect(13, ty + 1, 1, 3, C.gold[1]); P.rect(19, ty + 1, 1, 3, C.gold[1]); }
      else { P.rect(19, ty + 1, 1, 10, C.gold[2]); }
      P.rect(face === 'right' ? 12 : 11, ty + 6, face === 'right' ? 9 : 11, 2, C.brown[2]); P.set(face === 'right' ? 18 : 16, ty + 6, C.gold[0]); P.set(face === 'right' ? 18 : 16, ty + 7, C.gold[2]);
    } else {
      P.poly([[8, ty - 1], [24, ty - 1], [26 + sway, ty + 15], [6 + sway, ty + 15]], capeR); // 背中は大きなマント
      for (let y = ty + 3; y < ty + 15; y += 3) P.set(16 + sway, y, C.cape[3]);
      P.rect(8 + sway, ty + 14, 18, 1, C.cape[4]);
    }
    // 肩当て（金の縁）
    const pauldron = (cx) => { P.ball(cx, ty + 1, 2.6, 2.1, C.blue, { bias: -0.4 }); P.rect(cx - 2, ty + 2, 5, 1, C.gold[1]); };
    if (face !== 'right') { pauldron(10); pauldron(22); } else pauldron(17);
    // 剣と盾
    const shield = (cx, cy, r) => {
      P.poly([[cx - r, cy - r], [cx + r, cy - r], [cx + r, cy + 1], [cx, cy + r + 1], [cx - r, cy + 1]], (x, y) => C.shieldB[P.idx(0.9 + (x - cx + r) / (2 * r) + (y - cy + r) / 14, x, y)]);
      for (let x = cx - r; x <= cx + r; x++) P.set(x, cy - r, C.gold[1]);
      P.line(cx - r, cy - r, cx - r, cy + 1, C.gold[2]); P.line(cx + r, cy - r, cx + r, cy + 1, C.gold[3]);
      P.line(cx - r, cy + 1, cx, cy + r + 1, C.gold[2]); P.line(cx + r, cy + 1, cx, cy + r + 1, C.gold[3]);
      P.rect(cx, cy - r + 2, 1, r + 1, C.gold[0]); P.rect(cx - 1, cy - 1, 3, 1, C.gold[1]);
    };
    const sword = (x, y, len, dx, dy) => { for (let i = 0; i < len; i++) { P.set(x + dx * i, y + dy * i, C.blade[1]); P.set(x + dx * i + (dy ? 1 : 0), y + dy * i + (dx ? 1 : 0), C.blade[3]); } P.set(x + dx * (len - 1), y + dy * (len - 1), C.blade[0]); };
    const hilt = (x, y, horiz) => { if (horiz) { P.rect(x, y - 1, 1, 4, C.gold[1]); P.rect(x - 2, y, 2, 2, C.brown[2]); } else { P.rect(x - 1, y, 4, 1, C.gold[1]); P.rect(x, y + 1, 2, 2, C.brown[2]); } };
    const hand = (x, y) => P.ball(x, y, 1.5, 1.5, SKIN);
    if (face === 'down') {
      P.box(6, ty + 2 + sway, 3, 5, C.blue); P.rect(6, ty + 6 + sway, 3, 1, C.gold[1]);
      if (atk) { hand(7.5, ty + 8); sword(7, ty + 10, 8, 0, 1); hilt(7, ty + 8, false); }
      else { hand(7.5, ty + 8 + sway); sword(7, ty - 3 + sway, 9, 0, 1); hilt(7, ty + 6 + sway, false); }
      P.box(23, ty + 2 - sway, 3, 4, C.blue);
      shield(25, ty + 7 - sway, 3);
    } else if (face === 'up') {
      P.box(6, ty + 2 - sway, 3, 5, C.blue); P.box(23, ty + 2 + sway, 3, 5, C.blue);
      if (atk) { sword(24, ty - 9, 10, 0, 1); hilt(24, ty, false); }
      else { sword(24, ty - 3 + sway, 8, 0, 1); hilt(24, ty + 5 + sway, false); }
      shield(7, ty + 6 - sway, 3);
    } else { // 右向き：手前の手に剣、盾は前に構える
      if (atk) { P.box(19, ty + 3, 6, 3, C.blue); hand(25.5, ty + 4.5); sword(27, ty + 4, 5, 1, 0); hilt(27, ty + 4, true); }
      else { P.box(14 + sway, ty + 2, 3, 6, C.blue); hand(15.5 + sway, ty + 8); sword(16 + sway, ty - 3, 9, 0, 1); hilt(16 + sway, ty + 6, false); }
      shield(22, ty + 6, 3);
    }
    // マントのえり（オレンジ）と金の留め具
    P.box(11, ty - 1, 10, 2, C.cape, { round: true }); P.set(face === 'right' ? 18 : 16, ty, C.gold[0]);
    // 頭（坊主頭・頭身を小さめに）
    const hy = 7.5 + bob;
    if (face === 'right') {
      P.ball(16.5, hy, 7.6, 7.2, SKIN);
      P.ball(13, hy + 1.2, 1.5, 2, SKIN_T); P.set(13, hy + 1, SKIN_T[3]);
      P.rect(20, hy, 2, 2, EYE); P.set(20, hy, '#ffffff');
      P.rect(19, hy - 2, 3, 1, BROW);
      P.rect(21, hy + 4, 2, 1, MOUTH); P.rect(18, hy + 3, 2, 1, CHEEK);
      P.set(24, hy + 1, SKIN[3]);
    } else {
      P.ball(16, hy, 8, 7.2, SKIN);
      P.ball(8.2, hy + 1.5, 1.4, 2, SKIN_T); P.ball(23.8, hy + 1.5, 1.4, 2, SKIN_T);
      if (face === 'down') {
        P.rect(12, hy, 2, 2, EYE); P.rect(18, hy, 2, 2, EYE);
        P.set(12, hy, '#ffffff'); P.set(18, hy, '#ffffff');
        P.rect(11, hy - 2, 3, 1, BROW); P.rect(18, hy - 2, 3, 1, BROW);
        P.rect(10, hy + 3, 2, 1, CHEEK); P.rect(20, hy + 3, 2, 1, CHEEK);
        P.rect(15, hy + 4, 2, 1, MOUTH);
      } else P.rect(12, hy + 4, 8, 2, SKIN[3]);
    }
    // 坊主頭のつや
    const sx = face === 'right' ? 13 : 11;
    P.rect(sx, hy - 5, 3, 1, SKIN[0]); P.rect(sx - 1, hy - 4, 2, 2, SKIN[0]); P.set(sx + 3, hy - 6, LIGHT);
    return P.outline();
  }

  /* ---------------- サイ（黒髪ロング・白と淡いピンクの衣装・金の装飾・青緑の宝石） ---------------- */
  function drawSai(frame) {
    const P = new Pix(32, 32);
    const blink = frame === 1;
    const sway = frame === 1 ? 1 : 0;
    // 後ろ髪（腰までの黒髪）
    P.poly([[9, 6], [23, 6], [24 + sway, 23], [20, 25], [12, 25], [8 + sway, 23]], (x, y) => C.hair[P.idx(1.5 + (x < 16 ? 0.2 : 0.8) + (y - 6) / 24, x, y)]);
    // ドレス：白い外衣（金の縁）、淡いピンクの前身ごろ
    P.poly([[12, 14], [20, 14], [25, 30], [7, 30]], (x, y) => C.white[P.idx(0.9 + (x - 7) / 18 + (y - 14) / 30, x, y)]);
    P.poly([[14, 17], [18, 17], [21, 30], [11, 30]], (x, y) => C.pink[P.idx(1.0 + (x - 11) / 12, x, y)]);
    P.line(12, 14, 7, 30, C.gold[2]); P.line(20, 14, 25, 30, C.gold[3]);
    P.rect(7, 30, 19, 1, C.gold[2]); for (let x = 9; x < 25; x += 3) P.set(x, 29, C.gold[0]);
    P.line(14, 17, 11, 30, C.gold[1]); P.line(18, 17, 21, 30, C.gold[2]);
    // 胴と金の帯（青緑の宝石）
    P.box(12, 13, 8, 5, C.white, { round: true });
    P.rect(12, 17, 8, 1, C.gold[1]); P.set(16, 17, C.teal[1]); P.set(15, 17, C.teal[2]);
    // ふくらんだピンクの袖と腕
    P.ball(10.5, 14.5, 2, 2, C.pink); P.ball(21.5, 14.5, 2, 2, C.pink);
    P.box(10, 16, 2, 4, SKIN); P.box(20, 16, 2, 4, SKIN);
    P.set(10, 16, C.gold[1]); P.set(21, 16, C.gold[1]); // 腕輪
    // 首飾り（青緑の宝石）
    P.rect(14, 13, 4, 1, C.gold[1]); P.ball(16, 14.3, 1.1, 1.1, C.teal);
    // 顔（頭身を小さめに）
    P.ball(16, 7.5, 6.2, 6, SKIN);
    // 前髪と横の髪
    P.poly([[9, 8], [10, 3], [16, 1], [22, 3], [23, 8], [21, 6], [18, 4], [16, 6], [13, 4], [11, 7]], (x, y) => C.hair[P.idx(1.1 + (y - 1) / 8 + (x > 16 ? 0.5 : 0), x, y)]);
    P.rect(9, 7, 2, 9, C.hair[2]); P.rect(21, 7, 2, 9, C.hair[3]);
    P.set(13, 2, C.hair[0]); P.set(12, 3, C.hair[1]);
    // ティアラ（金と青緑の宝石）
    P.rect(12, 1, 8, 1, C.gold[1]); P.set(13, 0, C.gold[0]); P.set(18, 0, C.gold[0]); P.rect(15, 0, 2, 1, C.teal[1]);
    // 顔
    if (blink) { P.rect(12, 8, 2, 1, '#2a1a20'); P.rect(18, 8, 2, 1, '#2a1a20'); }
    else { P.rect(12, 7, 2, 2, '#2a1a20'); P.rect(18, 7, 2, 2, '#2a1a20'); P.set(12, 7, '#ffffff'); P.set(18, 7, '#ffffff'); }
    P.rect(11, 10, 2, 1, CHEEK); P.rect(19, 10, 2, 1, CHEEK);
    P.rect(15, 11, 2, 1, MOUTH);
    // 髪かざり
    P.set(22, 3, '#ffffff'); P.set(23, 4, '#ffd84a');
    return P.outline();
  }

  /* ---------------- タイトル用の全身絵（64×96、画像素材がないときに使う） ---------------- */
  function bigTake() {
    const P = new Pix(64, 96);
    const capeR = (x, y) => C.cape[P.idx(1.0 + (y - 40) / 50 + (x > 32 ? 0.7 : 0), x, y)];
    P.poly([[14, 40], [50, 40], [58, 92], [6, 92]], capeR); // マント
    // 足とブーツ
    P.box(22, 70, 8, 18, C.navy); P.box(34, 70, 8, 18, C.navy);
    P.box(20, 84, 11, 8, C.boot, { round: true }); P.box(33, 84, 11, 8, C.boot, { round: true }); P.rect(20, 84, 11, 1, C.gold[1]); P.rect(33, 84, 11, 1, C.gold[1]);
    // 青い服（金の縁取り）
    P.poly([[20, 40], [44, 40], [48, 74], [16, 74]], (x, y) => C.blue[P.idx(1.0 + (x - 16) / 32 + (y - 40) / 60, x, y)]);
    P.rect(16, 72, 32, 2, C.gold[1]); P.rect(31, 42, 2, 30, C.gold[2]); P.rect(24, 42, 1, 10, C.gold[1]); P.rect(39, 42, 1, 10, C.gold[1]);
    P.box(19, 56, 26, 4, C.brown); P.box(29, 55, 6, 6, C.gold); P.ball(32, 58, 1.5, 1.5, C.teal);
    // 肩当て
    P.ball(18, 43, 6, 5, C.blue, { bias: -0.4 }); P.ball(46, 43, 6, 5, C.blue, { bias: -0.4 }); P.rect(12, 46, 12, 2, C.gold[1]); P.rect(40, 46, 12, 2, C.gold[1]);
    // 右手の剣
    P.box(10, 46, 6, 14, C.blue); P.ball(13, 62, 3, 3, SKIN);
    for (let i = 0; i < 30; i++) { P.set(12, 59 - i, C.blade[1]); P.set(13, 59 - i, C.blade[2]); P.set(14, 59 - i, C.blade[3]); }
    P.rect(11, 30, 4, 1, C.blade[0]); P.rect(8, 60, 10, 2, C.gold[1]); P.box(11, 62, 4, 6, C.brown);
    // 左手の盾
    P.box(48, 46, 6, 12, C.blue);
    P.poly([[42, 52], [62, 52], [62, 66], [52, 78], [42, 66]], (x, y) => C.shieldB[P.idx(0.8 + (x - 42) / 20 + (y - 52) / 30, x, y)]);
    P.line(42, 52, 62, 52, C.gold[1]); P.line(42, 52, 42, 66, C.gold[1]); P.line(62, 52, 62, 66, C.gold[3]); P.line(42, 66, 52, 78, C.gold[2]); P.line(62, 66, 52, 78, C.gold[3]);
    P.rect(51, 55, 2, 18, C.gold[1]); P.rect(46, 61, 12, 2, C.gold[1]); P.ball(52, 62, 2, 2, C.teal);
    // えりと頭
    P.box(22, 37, 20, 5, C.cape, { round: true }); P.ball(32, 39, 2, 2, C.gold);
    P.ball(32, 22, 14, 14, SKIN); P.ball(17.5, 24, 2.6, 3.6, SKIN_T); P.ball(46.5, 24, 2.6, 3.6, SKIN_T);
    P.ball(26, 14, 4, 2.5, ramp(SKIN[0]), { dither: false }); P.rect(24, 12, 3, 1, LIGHT);
    P.rect(22, 20, 6, 2, BROW); P.rect(36, 20, 6, 2, BROW);
    P.rect(23, 23, 4, 5, EYE); P.rect(37, 23, 4, 5, EYE); P.rect(23, 23, 2, 2, '#ffffff'); P.rect(37, 23, 2, 2, '#ffffff');
    P.rect(19, 29, 4, 2, CHEEK); P.rect(41, 29, 4, 2, CHEEK);
    P.rect(29, 31, 6, 2, MOUTH); P.set(28, 30, MOUTH); P.set(35, 30, MOUTH);
    return P.outline();
  }
  function bigSai() {
    const P = new Pix(64, 96);
    P.poly([[16, 14], [48, 14], [52, 66], [42, 72], [22, 72], [12, 66]], (x, y) => C.hair[P.idx(1.4 + (x > 32 ? 0.7 : 0) + (y - 14) / 70, x, y)]); // 長い黒髪
    // ドレス
    P.poly([[24, 40], [40, 40], [56, 92], [8, 92]], (x, y) => C.white[P.idx(0.8 + (x - 8) / 48 + (y - 40) / 80, x, y)]);
    P.poly([[28, 50], [36, 50], [44, 92], [20, 92]], (x, y) => C.pink[P.idx(0.9 + (x - 20) / 24, x, y)]);
    P.line(24, 40, 8, 92, C.gold[2]); P.line(40, 40, 56, 92, C.gold[3]); P.line(28, 50, 20, 92, C.gold[1]); P.line(36, 50, 44, 92, C.gold[2]);
    P.rect(8, 91, 49, 2, C.gold[2]); for (let x = 12; x < 54; x += 5) P.ball(x, 88, 1.2, 1.2, C.gold);
    // 胴・帯
    P.box(24, 36, 16, 14, C.white, { round: true }); P.rect(24, 48, 16, 3, C.gold[1]); P.ball(32, 49.5, 2, 1.8, C.teal);
    // 袖と腕
    P.ball(21, 39, 5, 4.5, C.pink); P.ball(43, 39, 5, 4.5, C.pink);
    P.box(18, 43, 5, 14, SKIN); P.box(41, 43, 5, 14, SKIN); P.rect(18, 50, 5, 2, C.gold[1]); P.rect(41, 50, 5, 2, C.gold[1]);
    // 首飾り
    P.box(29, 32, 6, 5, SKIN); P.line(26, 36, 32, 41, C.gold[1]); P.line(38, 36, 32, 41, C.gold[1]); P.ball(32, 42, 2.4, 2.4, C.teal); P.set(31, 41, '#e8fffa');
    // 顔
    P.ball(32, 22, 12, 12, SKIN);
    P.poly([[19, 24], [20, 13], [26, 8], [32, 7], [40, 9], [45, 15], [45, 24], [41, 17], [36, 13], [33, 17], [28, 12], [23, 18]], (x, y) => C.hair[P.idx(1.0 + (y - 7) / 18 + (x > 32 ? 0.5 : 0), x, y)]);
    P.rect(19, 22, 3, 22, C.hair[2]); P.rect(42, 22, 3, 22, C.hair[3]);
    P.line(25, 11, 30, 9, C.hair[0]);
    // ティアラ
    P.poly([[24, 9], [27, 4], [30, 7], [32, 2], [34, 7], [37, 4], [40, 9]], (x, y) => C.gold[P.idx(0.6 + y / 8, x, y)]); P.ball(32, 6, 1.6, 1.6, C.teal);
    P.rect(25, 19, 5, 1, '#3a2a30'); P.rect(35, 19, 5, 1, '#3a2a30');
    P.rect(25, 22, 5, 5, '#2a1a20'); P.rect(35, 22, 5, 5, '#2a1a20'); P.rect(25, 21, 6, 1, '#1a0a10'); P.rect(34, 21, 6, 1, '#1a0a10');
    P.rect(26, 23, 2, 2, '#ffffff'); P.rect(36, 23, 2, 2, '#ffffff');
    P.rect(22, 28, 4, 2, CHEEK); P.rect(39, 28, 4, 2, CHEEK); P.rect(30, 31, 4, 1, MOUTH);
    P.ball(44, 12, 2.6, 2.6, ramp('#fff4f4')); P.set(44, 12, '#ffd84a');
    return P.outline();
  }

  // ---------------- 会話用の顔絵（64×64） ----------------
  function portraitTake() {
    const P = new Pix(64, 64);
    // マントと肩
    P.poly([[4, 64], [8, 46], [20, 40], [44, 40], [56, 46], [60, 64]], (x, y) => C.cape[P.idx(1.2 + (y - 40) / 30 + (x > 32 ? 0.6 : 0), x, y)]);
    P.box(18, 46, 28, 18, C.blue, { round: true });
    P.rect(31, 46, 2, 18, C.gold[2]); P.rect(24, 47, 1, 8, C.gold[1]); P.rect(39, 47, 1, 8, C.gold[1]);
    P.ball(14, 49, 8, 6, C.blue, { bias: -0.4 }); P.ball(50, 49, 8, 6, C.blue, { bias: -0.4 });
    P.rect(6, 52, 16, 2, C.gold[1]); P.rect(42, 52, 16, 2, C.gold[1]); P.ball(32, 44, 2.5, 2.5, C.gold);
    P.box(22, 41, 20, 5, C.cape, { round: true });
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
    return P.outline();
  }
  function portraitSai() {
    const P = new Pix(64, 64);
    // 長い黒髪（後ろ）
    P.poly([[10, 18], [54, 18], [58, 64], [6, 64]], (x, y) => C.hair[P.idx(1.6 + (x > 32 ? 0.6 : 0) + (y - 18) / 60, x, y)]);
    // ドレスの肩（白・金・ピンク）
    P.poly([[14, 64], [18, 48], [46, 48], [50, 64]], (x, y) => C.white[P.idx(0.9 + (x - 14) / 40, x, y)]);
    P.ball(18, 50, 7, 5, C.pink); P.ball(46, 50, 7, 5, C.pink);
    P.rect(24, 48, 16, 2, C.gold[1]); P.line(24, 48, 32, 56, C.gold[2]); P.line(40, 48, 32, 56, C.gold[2]);
    P.ball(32, 57, 3, 3, C.teal); P.set(31, 56, '#e8fffa');
    P.box(28, 42, 8, 7, SKIN);
    // 顔
    P.ball(32, 26, 17, 17, SKIN);
    // 前髪
    P.poly([[14, 26], [16, 10], [24, 4], [32, 3], [42, 5], [49, 12], [50, 26], [45, 16], [38, 12], [33, 16], [26, 11], [19, 18]], (x, y) => C.hair[P.idx(1.0 + (y - 3) / 22 + (x > 32 ? 0.5 : 0), x, y)]);
    P.rect(14, 24, 4, 20, C.hair[2]); P.rect(46, 24, 4, 20, C.hair[3]);
    P.line(22, 8, 28, 6, C.hair[0]); P.line(23, 9, 27, 8, C.hair[1]);
    // ティアラ
    P.poly([[22, 6], [26, 1], [29, 4], [32, 0], [35, 4], [38, 1], [42, 6]], (x, y) => C.gold[P.idx(0.6 + y / 6, x, y)]);
    P.ball(32, 3.5, 2, 2, C.teal);
    // 目（まつげ）・眉・口
    P.rect(22, 21, 6, 1, '#3a2a30'); P.rect(37, 21, 6, 1, '#3a2a30');
    P.rect(22, 25, 6, 6, '#2a1a20'); P.rect(37, 25, 6, 6, '#2a1a20');
    P.rect(22, 24, 7, 1, '#1a0a10'); P.rect(36, 24, 7, 1, '#1a0a10');
    P.rect(23, 26, 2, 2, '#ffffff'); P.rect(38, 26, 2, 2, '#ffffff'); P.rect(25, 29, 2, 1, '#6a5a7a'); P.rect(40, 29, 2, 1, '#6a5a7a');
    P.rect(18, 33, 5, 2, CHEEK); P.rect(42, 33, 5, 2, CHEEK);
    P.rect(30, 37, 5, 1, MOUTH); P.rect(31, 38, 3, 1, '#e86a7a');
    // 髪かざり（プルメリア）
    P.ball(47, 12, 3.5, 3.5, ramp('#fff4f4')); P.set(47, 12, '#ffd84a'); P.set(46, 12, '#ffd84a');
    return P.outline();
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

  // ---------------- 道具アイコン（16×16）：色だけでなく形と小さな印で見分ける ----------------
  const TINT = {
    wood: '#b07a45', copper: '#d98a4a', iron: '#aab4c0', steel: '#dfe8f2', jade: '#4fd08a', crystal: '#9ae8ff', gold: '#ffd84a',
  };
  const I = {};
  // 剣：材質で刃の色、強さで刃の長さ・つばの形が変わる
  I.sword = (t) => {
    const P = new Pix(16, 16); const R = ramp(TINT[t] || '#cfd8e0');
    const len = { wood: 7, copper: 8, iron: 9, steel: 10, jade: 10, crystal: 11, gold: 11 }[t] || 9;
    for (let i = 0; i < len; i++) { P.set(5 + i, 10 - i, R[1]); P.set(6 + i, 10 - i, R[2]); P.set(6 + i, 11 - i, R[3]); }
    P.set(5 + len, 10 - len + 1, R[0]);
    const guard = t === 'gold' || t === 'crystal' ? ramp('#ffd84a') : t === 'wood' ? ramp('#7a4a24') : ramp('#8a6a40');
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
    } else {
      P.poly([[2, 2], [14, 2], [13, 9], [8, 15], [3, 9]], (x, y) => R[P.idx(0.4 + (x - 2) / 9 + (y - 2) / 16, x, y)]);
      P.rect(3, 3, 10, 1, R[0]);
      if (t === 'steel') for (const [x, y] of [[4, 4], [11, 4], [4, 8], [11, 8], [8, 12]]) P.set(x, y, '#ffffff');
      else { const G = ramp(t === 'gold' ? '#ff4a6a' : t === 'jade' ? '#2aff9a' : '#ffffff'); P.ball(8, 7, 2.2, 2.6, G); P.rect(3, 2, 10, 1, ramp('#ffd84a')[1]); }
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
  I.staff = () => { const P = new Pix(16, 16); P.line(3, 15, 10, 6, '#8a5a2a'); P.line(4, 15, 11, 6, '#5a3a20');
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
  I.smoke = () => { const P = new Pix(16, 16); P.ball(8, 10, 5, 5, ramp('#5a5a6a')); P.ball(7, 4, 3, 2.5, ramp('#d8d8e0')); P.ball(11, 3, 2, 2, ramp('#e8e8f0')); P.line(10, 6, 12, 4, '#c0392b'); return P.outline(); };
  I.powder = () => { const P = new Pix(16, 16); P.ball(8, 10, 5.5, 4.5, ramp('#d8c8f0')); P.rect(6, 3, 4, 3, '#8a6aa8'); P.set(4, 6, '#c8b8ff'); P.set(12, 7, '#c8b8ff'); P.rect(6, 10, 4, 1, '#6a4a8a'); return P.outline(); };

  // ---------------- 地形タイル（32×32） ----------------
  const THEME = {
    brick:   { floor: '#c4875a', floor2: '#b07448', wall: '#a8502e', top: '#4a2418', deco: '#6a9a3a', bg: '#140a08', light: '#ffb060' },
    roots:   { floor: '#a09a64', floor2: '#8c8656', wall: '#8a5a3a', top: '#2e2214', deco: '#5aa040', root: '#5a3a1e', bg: '#0c0a04', light: '#ffcf70' },
    water:   { floor: '#8ab4c0', floor2: '#76a0ae', wall: '#3f7f96', top: '#16303e', deco: '#ff8fb8', bg: '#04101a', light: '#9ae8ff' },
    orb:     { floor: '#c8a070', floor2: '#b48c5e', wall: '#b07a3a', top: '#3a2410', deco: '#ffd84a', bg: '#100804', light: '#ffd070' },
    garden:  { floor: '#84a862', floor2: '#749656', wall: '#6a7a4a', top: '#1e2a16', deco: '#e05a8a', root: '#4a3018', bg: '#060a04', light: '#c8ff8a' },
    sunken:  { floor: '#78a0ae', floor2: '#68909e', wall: '#4a6f80', top: '#0e2430', deco: '#ffd84a', bg: '#030c12', light: '#7ad0ff' },
    crystal: { floor: '#6c6c98', floor2: '#5e5e88', wall: '#4a4a78', top: '#12122a', deco: '#7af0ff', bg: '#04040c', light: '#7af0ff' },
    gold:    { floor: '#b89a5a', floor2: '#a4884c', wall: '#a07a30', top: '#34260c', deco: '#ffe060', bg: '#0c0802', light: '#ffe080' },
    shrine:  { floor: '#c4a6dc', floor2: '#b094c8', wall: '#8a6ab0', top: '#26183a', deco: '#ffd84a', bg: '#0a0614', light: '#ffd8ff' },
  };
  SP.themeColors = THEME;
  const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + (s || 0) * 2246822519) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
  SP.hash = hash;

  function floorTile(theme, v) {
    const T = THEME[theme], P = new Pix(32, 32);
    const A = ramp(T.floor), B = ramp(T.floor2);
    const style = { brick: 'stone', roots: 'flag', water: 'tile', orb: 'tile', garden: 'flag', sunken: 'tile', crystal: 'cave', gold: 'tile', shrine: 'tile' }[theme];
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

  // 動くもの：壁のたいまつ・帰還の碑・帰還口・宝箱
  function torch(theme, f) {
    const P = new Pix(32, 32), T = THEME[theme];
    P.box(14, 12, 4, 10, ramp('#5a3a20'));
    P.rect(12, 11, 8, 2, ramp('#8a8a90')[2]);
    P.ball(16, 7 - (f % 2), 3.5 + (f === 1 ? 0.5 : 0), 5, ramp(T.light));
    P.ball(16, 8, 1.8, 2.5, ramp('#ffffff'));
    return P.canvas();
  }
  function stairsTile() {
    const P = new Pix(32, 32);
    P.rect(1, 1, 30, 30, '#140a08');
    const R = ramp('#e8d0a0');
    for (let i = 0; i < 6; i++) {
      for (let y = Math.round(3 + i * 4.5); y < Math.round(3 + i * 4.5) + 4; y++) for (let x = 3 + i * 2; x < 29 - i * 2; x++) P.set(x, y, R[Math.min(4, Math.floor(i * 0.7 + (y - (3 + i * 4.5)) / 3))]);
    }
    P.rect(0, 0, 32, 1, '#ffe8a0'); P.rect(0, 31, 32, 1, '#2a1a10'); P.rect(0, 0, 1, 32, '#ffe8a0'); P.rect(31, 0, 1, 32, '#2a1a10');
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
    s.portrait = { take: portraitTake().canvas(), sai: portraitSai().canvas() };
    s.big = { take: bigTake().canvas(), sai: bigSai().canvas() };
    s.enemy = {};
    for (const k of Object.keys(E)) s.enemy[k] = [E[k](0).canvas(), E[k](1).canvas()];
    s.icon = {};
    for (const k of Object.keys(I)) s.icon[k] = I[k]().canvas();
    s.iconT = {};
    SP.s = s;
    return s;
  };
  SP.iconFor = function (def) {
    const key = def.icon + ':' + (def.tint || '');
    const s = SP.s;
    if (!s.iconT[key]) s.iconT[key] = I[def.icon] ? I[def.icon](def.tint).canvas() : s.icon.coin;
    return s.iconT[key];
  };
  SP.enemyFrames = (sprite) => SP.s.enemy[sprite] || SP.s.enemy.frog;

  const urlCache = {};
  SP.iconURL = function (def) {
    const key = def.icon + (def.tint || '');
    if (!urlCache[key]) {
      const c = document.createElement('canvas');
      c.width = c.height = 32;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(SP.iconFor(def), 0, 0, 32, 32);
      urlCache[key] = c.toDataURL();
    }
    return urlCache[key];
  };
  // 会話の顔絵（顔のあたりを拡大）
  SP.portraitURL = function (who, size) {
    const src = who === 'sai' ? SP.s.portrait.sai : SP.s.portrait.take;
    const c = document.createElement('canvas');
    c.width = c.height = size || 64;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL();
  };

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
