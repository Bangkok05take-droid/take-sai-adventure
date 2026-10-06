/* 村の景観（動かない部分）。村の状態が変わったときだけ1枚に描く。
 * 縦長のスマホでも画面が埋まるよう、奥から「空と遠くの遺跡 → 奥の通りの建物（倉庫・鍛冶屋・展示室・民家）
 * → 石畳の広場（噴水・屋台などの飾り）→ 手前の建物（サイの店・食堂）→ 水路と向こう岸」の縦長の1枚（384×400）。
 * 建物は屋根・壁・窓・入口・看板を描き分け、施設ごとに外見で区別できるようにする。光は左上から。 */
(function (TS) {
  'use strict';
  const SP = TS.Sprites;
  const VL = { VW: 384, VH: 560 };
  const HZ = 96;             // 地平線
  const BACK = 290;          // 奥の列の建物の足元
  const FRONT = 400;         // 手前の列の建物の足元
  const BANK = 424, WATER = [430, 474];
  VL.BACK = BACK; VL.FRONT = FRONT; VL.WATER = WATER; VL.HZ = HZ;
  VL.FOCUS = 340;            // 画面の中心に置きたい高さ（広場）

  VL.paint = function (lv) {
    const P = new SP.Pix(VL.VW, VL.VH), R = SP.ramp, sh = SP.shade, mix = SP.mix, hash = SP.hash;
    const night = lv.stage >= 3 || !!lv.decor.lanterns;
    const label = [], lights = [], steam = [];
    const ol = '#1e1218';                                   // 輪郭の色
    const outlineRect = (x, y, w, h) => { P.rect(x, y, w, 1, ol); P.rect(x, y + h - 1, w, 1, ol); P.rect(x, y, 1, h, ol); P.rect(x + w - 1, y, 1, h, ol); };

    // ---------------- 空 ----------------
    const skyA = night ? '#1a2350' : '#3d7cc8', skyB = night ? '#6a4a80' : '#86b6e6', skyC = night ? '#ffa060' : '#ffe2b4';
    for (let y = 0; y < HZ + 6; y++) {
      const t = y / HZ;
      for (let x = 0; x < VL.VW; x++) {
        const d = ((SP.hash(x & 3, y & 3, 0) & 15) / 16 - 0.5) * 0.04;
        const u = Math.max(0, Math.min(1, t + d));
        P.set(x, y, u < 0.6 ? mix(skyA, skyB, u / 0.6) : mix(skyB, skyC, (u - 0.6) / 0.4));
      }
    }
    if (night) for (let i = 0; i < 40; i++) { const x = hash(i, 5, 2) % VL.VW, y = hash(i, 6, 2) % 54; P.set(x, y, i % 7 ? '#c8d0ff' : '#ffffff'); }
    if (night) { P.ball(312, 82, 17, 17, R('#ffb060'), { dither: false }); P.ball(312, 82, 11, 11, R('#ffd890'), { dither: false }); }
    else P.ball(320, 30, 11, 11, R('#fff4c8'), { dither: false });
    const cloud = (cx, cy, s) => {
      const C = night ? R('#c88aa0') : R('#ffffff');
      for (const [dx, dy, r] of [[-12, 2, 7], [-4, -2, 9], [6, -1, 8], [14, 3, 6], [0, 4, 9]]) P.ball(cx + dx * s, cy + dy * s, r * s, r * s * 0.7, C, { bias: 0.4 });
    };
    cloud(70, 26, 0.85); cloud(200, 16, 0.65); cloud(140, 56, 0.55); cloud(356, 60, 0.6);
    // ---------------- 遠くの丘と遺跡 ----------------
    const haze = night ? '#6a5080' : '#7a9cc4', haze2 = night ? '#58466e' : '#6688b0';
    const prang = (cx, base, w, h, col) => {
      const lit = sh(col, 0.18);
      P.poly([[cx - w, base], [cx - w, base - h * 0.14], [cx - w * 0.75, base - h * 0.14], [cx - w * 0.75, base - h * 0.28], [cx - w * 0.55, base - h * 0.28],
        [cx - w * 0.5, base - h * 0.6], [cx - w * 0.25, base - h * 0.85], [cx, base - h], [cx + w * 0.25, base - h * 0.85], [cx + w * 0.5, base - h * 0.6],
        [cx + w * 0.55, base - h * 0.28], [cx + w * 0.75, base - h * 0.28], [cx + w * 0.75, base - h * 0.14], [cx + w, base - h * 0.14], [cx + w, base]], (x) => (x < cx ? lit : col));
      for (let yy = Math.round(base - h * 0.62); yy < base - h * 0.28; yy += 3) P.rect(Math.round(cx - w * 0.48), yy, Math.round(w * 0.96), 1, sh(col, -0.12));
    };
    prang(40, HZ + 2, 8, 30, haze2); prang(66, HZ, 12, 46, haze2); prang(92, HZ + 2, 7, 26, haze2);
    prang(232, HZ + 2, 7, 24, haze2); prang(262, HZ, 11, 40, haze2);
    for (let x = 0; x < VL.VW; x++) {
      const h = HZ - 4 + Math.round(Math.sin(x / 37) * 4 + Math.sin(x / 13 + 1) * 2);
      for (let y = h; y < HZ + 12; y++) P.set(x, y, mix(haze, skyC, Math.max(0, 0.3 - (y - h) / 40)));
    }
    // 遠くの木々（村の裏）
    for (let i = 0; i < 44; i++) { const x = hash(i, 1, 7) % VL.VW, r = 4 + hash(i, 2, 7) % 5; P.ball(x, HZ + 10 - r * 0.3, r * 1.25, r, R(night ? '#2e4a40' : '#3f7048'), { dither: false, bias: 0.25 }); }
    // ---------------- 地面 ----------------
    const grass = night ? '#5e8a48' : '#78b048';
    for (let y = HZ + 8; y < VL.VH; y++) for (let x = 0; x < VL.VW; x++) {
      let c = sh(grass, -0.04 + (y - HZ) / 1400);
      if ((hash(x >> 1, y >> 1, 11) & 31) === 0) c = sh(grass, 0.22);
      else if ((hash(x, y, 13) & 63) === 0) c = sh(grass, -0.18);
      P.set(x, y, c);
    }
    // ---------------- 丘の上の遺跡と田んぼ（村の裏手） ----------------
    const hill = night ? '#5a8a4a' : '#82b852';
    for (let x = 0; x < VL.VW; x++) {                          // なだらかな丘
      const top = 150 - Math.round(Math.max(0, 40 - Math.abs(x - 196) * 0.42)) + Math.round(Math.sin(x / 23) * 2);
      for (let y = top; y < 236; y++) P.set(x, y, sh(hill, 0.08 - (y - top) / 300 + ((hash(x >> 2, y >> 2, 15) & 7) === 0 ? 0.12 : 0)));
    }
    // 棚田（空を映す水面と、稲の列）
    const paddy = (x0, y0, w, h) => {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
        const ly = y - y0, edge = ly === 0 || ly === h - 1 || x === x0 || x === x0 + w - 1;
        P.set(x, y, edge ? '#8a6a3a' : (x + ly * 2) % 6 < 2 ? sh(hill, 0.2) : mix(skyB, '#5a8ab0', 0.4 + ly / h * 0.3));
      }
      P.rect(x0, y0 + h, w, 1, '#5a4224');
    };
    for (let i = 0; i < 3; i++) { paddy(6 + i * 6, 172 + i * 16, 104 - i * 12, 12); paddy(278 - i * 2, 168 + i * 16, 100 - i * 6, 12); }
    // 丘の上の寺院跡（基壇・中央の塔・左右の仏塔・石段）
    {
      const cx = 196, base = 206;
      for (let i = 0; i < 4; i++) { const w = 70 - i * 10, y = base - i * 5; P.rect(cx - w, y - 5, w * 2, 5, i % 2 ? '#a85a38' : '#b8643e'); P.rect(cx - w, y - 5, w * 2, 1, '#d8885a'); P.rect(cx - w, y - 1, w * 2, 1, '#6a3020'); }
      const brick = (x, y) => (((y >> 2) + ((x + ((y >> 2) % 2) * 3) / 6 | 0)) % 2 ? '#b0603a' : '#a45634');
      const pr = (px, pbase, w, h) => {
        P.poly([[px - w, pbase], [px - w, pbase - h * 0.18], [px - w * 0.8, pbase - h * 0.18], [px - w * 0.7, pbase - h * 0.32], [px - w * 0.55, pbase - h * 0.32],
          [px - w * 0.5, pbase - h * 0.62], [px - w * 0.26, pbase - h * 0.86], [px, pbase - h], [px + w * 0.26, pbase - h * 0.86], [px + w * 0.5, pbase - h * 0.62],
          [px + w * 0.55, pbase - h * 0.32], [px + w * 0.7, pbase - h * 0.32], [px + w * 0.8, pbase - h * 0.18], [px + w, pbase - h * 0.18], [px + w, pbase]],
          (x, y) => (x < px - w * 0.15 ? sh(brick(x, y), 0.12) : x > px + w * 0.3 ? sh(brick(x, y), -0.18) : brick(x, y)));
        for (let yy = Math.round(pbase - h * 0.62); yy < pbase - h * 0.32; yy += 4) P.rect(Math.round(px - w * 0.5), yy, Math.round(w), 1, '#6a3020');
        P.rect(px - 3, Math.round(pbase - h * 0.3), 6, Math.round(h * 0.12), '#3a1a10');      // 入口のくぼみ
      };
      pr(cx - 44, base - 18, 9, 30); pr(cx + 44, base - 18, 9, 30);
      // 章が進むと寺院が直っていく：第1章は崩れた塔、第2〜3章は足場をかけて修理中、第4章以降は金の尖塔
      const ch = lv.chapter || 1;
      if (ch <= 1) {
        pr(cx, base - 20, 16, 44);
        P.poly([[cx - 9, base - 46], [cx - 4, base - 54], [cx, base - 49], [cx + 5, base - 56], [cx + 9, base - 46]], '#a45634');   // 崩れた頂
        for (const [x, y] of [[cx - 22, base - 22], [cx + 20, base - 21], [cx - 12, base - 21]]) P.ball(x, y, 2.5, 1.6, R('#b0603a'));
      } else {
        pr(cx, base - 20, 16, 66);
        if (ch <= 3) { // 竹の足場
          for (let x = cx - 14; x <= cx + 14; x += 7) P.line(x, base - 20, x, base - 62 + Math.abs(x - cx), '#c8a060');
          for (let y = base - 26; y > base - 62; y -= 9) P.line(cx - 14, y, cx + 14, y, '#a88040');
        } else { P.rect(cx - 1, base - 92, 2, 8, '#ffd84a'); P.set(cx, base - 93, '#ffffff'); }
      }
      // 石段
      for (let i = 0; i < 6; i++) P.rect(cx - 10 + i, base + i * 3, 20 - i * 2 + i * 2, 3, i % 2 ? '#c8b088' : '#d8c098');
      for (let y = base + 18; y < BACK - 34; y++) P.rect(cx - 4, y, 8, 1, (y % 4) ? '#c4a274' : '#a88660');  // 寺への小道
    }
    // 丘の木々
    for (const [x, y, r] of [[120, 200, 9], [270, 196, 8], [96, 226, 10], [300, 228, 9], [12, 236, 8], [374, 232, 9]]) { P.box(x - 1, y, 3, 8, R('#6a4228')); P.ball(x, y - 2, r, r * 0.8, R('#3f8a3a'), { bias: 0.2 }); }
    // 奥の通り（土の道）
    for (let y = BACK + 1; y < BACK + 14; y++) for (let x = 0; x < VL.VW; x++) {
      const e = y === BACK + 1 || y === BACK + 13;
      P.set(x, y, e ? '#8a6a46' : ((hash(x >> 1, y, 21) & 15) === 0 ? '#a88660' : sh('#c4a274', (y - BACK) / 60)));
    }
    // 広場（大きな敷石）
    for (let y = BACK + 14; y < FRONT + 18; y++) for (let x = 0; x < VL.VW; x++) {
      const row = Math.floor((y - BACK - 14) / 9), off = row % 2 ? 9 : 0, lx = (x + off) % 18, ly = (y - BACK - 14) % 9;
      const tone = ['#d8c0a0', '#ccb494', '#e0caa8', '#c4ac8c'][hash((x + off) / 18 | 0, row, 31) % 4];
      P.set(x, y, lx === 0 || ly === 8 ? '#9a8064' : sh(tone, ly === 0 ? 0.12 : lx === 17 ? -0.1 : 0));
    }
    P.rect(0, BACK + 14, VL.VW, 1, '#f0dcb8');
    // 手前の縁と草・花
    for (let y = FRONT + 18; y < BANK; y++) for (let x = 0; x < VL.VW; x++) {
      let c = sh(grass, 0.04 - (y - FRONT) / 160);
      if ((hash(x, y, 12) & 31) === 0) c = sh(grass, 0.25);
      P.set(x, y, c);
    }
    P.rect(0, FRONT + 18, VL.VW, 1, '#7a5e44');
    // 岸のレンガと水路
    for (let y = BANK; y < WATER[0]; y++) for (let x = 0; x < VL.VW; x++) {
      const row = y - BANK, off = row % 2 ? 4 : 0;
      P.set(x, y, (x + off) % 8 === 0 || row === 2 || row === 5 ? '#5a3020' : sh('#b0603a', row === 0 ? 0.2 : -row * 0.05));
    }
    for (let y = WATER[0]; y < WATER[1]; y++) for (let x = 0; x < VL.VW; x++) {
      const t = (y - WATER[0]) / (WATER[1] - WATER[0]);
      let c = mix(night ? '#3a5a8a' : '#4aa0c8', night ? '#1e3a62' : '#2a78a8', t);
      if (Math.sin(x * 0.35 + y * 1.3 + Math.sin(x / 9) * 2) > 0.93) c = sh(c, 0.25);
      if (y < WATER[0] + 2) c = sh(c, -0.28);
      P.set(x, y, c);
    }
    // 向こう岸：草と小道、ヤシ
    for (let y = WATER[1]; y < VL.VH; y++) for (let x = 0; x < VL.VW; x++) P.set(x, y, y === WATER[1] ? sh(grass, 0.2) : sh(grass, -0.1 + ((hash(x, y, 14) & 31) === 0 ? 0.2 : 0)));
    for (let x = 0; x < VL.VW; x++) P.rect(x, 496 + Math.round(Math.sin(x / 40) * 2), 1, 5, x % 7 === 0 ? '#a07e56' : '#c4a274');
    // 向こう岸の畑と小屋
    for (let i = 0; i < 2; i++) { const x0 = 30 + i * 200, y0 = 510; for (let y = y0; y < y0 + 36; y++) for (let x = x0; x < x0 + 120; x++) P.set(x, y, (y - y0) % 6 < 2 ? '#7a5634' : ((x + y) % 5 === 0 ? '#5aa040' : '#4a8a36')); outlineRect(x0 - 1, y0 - 1, 122, 38); }
    { const x = 172, y = 532; wall(x, y - 18, 28, 18, '#c8a070', 'plank'); roof(x, y - 30, 28, 12, '#9a7a40', { overhang: 3 }); door(x + 10, y - 12, 8, 12, '#6a3a1e'); }
    const palm = (x, y) => {
      for (let i = 0; i < 20; i++) P.rect(x + Math.round(Math.sin(i / 7) * 2), y - i, 3, 1, R('#8a5a30')[i % 3 === 0 ? 3 : 2]);
      for (let a = 0; a < 7; a++) { const ang = a / 7 * Math.PI * 2; for (let r = 0; r < 10; r++) P.set(x + 1 + Math.cos(ang) * r, y - 20 + Math.sin(ang) * r * 0.55 + r * r * 0.05, R('#3fa040')[r < 4 ? 1 : 2]); }
    };
    palm(14, 506); palm(160, 492); palm(212, 500); palm(372, 504); palm(300, 556); palm(70, 558);
    const lotus = (x, y) => { P.ball(x, y + 2, 6, 2.2, R('#3a8a40'), { dither: false }); P.set(x + 3, y + 2, '#2a6a30'); P.ball(x, y, 2.4, 2.8, R('#ff8fb8'), { dither: false }); P.set(x, y - 2, '#ffe0ec'); };
    lotus(30, 444); lotus(110, 458); lotus(286, 442); lotus(350, 456);

    // ---------------- 建物の部品 ----------------
    function wall(x, y, w, h, base, style) {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
        const lx = xx - x, ly = yy - y;
        const k = (lx < 2 ? 0.14 : lx >= w - 2 ? -0.22 : 0) - ly / h * 0.08;
        let c;
        if (style === 'plank') c = lx % 6 === 0 ? sh(base, -0.35) : sh(base, k + ((hash(Math.floor(lx / 6), x, 3) & 3) - 1.5) * 0.04);
        else if (style === 'brick') { const row = Math.floor(ly / 4), off = row % 2 ? 4 : 0; c = (ly % 4 === 3 || (lx + off) % 8 === 0) ? sh(base, -0.3) : sh(base, k + ((hash((lx + off) >> 3, row, x) & 3) - 1.5) * 0.05); }
        else if (style === 'stone') { const row = Math.floor(ly / 6), off = row % 2 ? 6 : 0; c = (ly % 6 === 5 || (lx + off) % 12 === 0) ? sh(base, -0.35) : sh(base, k + (ly % 6 === 0 ? 0.12 : 0) + ((hash((lx + off) / 12 | 0, row, x) & 3) - 1.5) * 0.06); }
        else c = sh(base, k + (ly > h - 4 ? -0.12 : 0));
        P.set(xx, yy, c);
      }
      outlineRect(x, y, w, h);
    }
    // 屋根（瓦の段・軒の影・縁取り・タイ風の破風飾り）
    function roof(x, y, w, h, col, o) {
      o = o || {};
      const ov = o.overhang == null ? 4 : o.overhang;
      const pts = o.flat ? [[x - ov, y + h], [x - ov + 4, y], [x + w + ov - 4, y], [x + w + ov, y + h]] : [[x - ov, y + h], [x + w / 2, y], [x + w + ov, y + h]];
      const Rc = R(col);
      P.poly(pts, (xx, yy) => ((yy - y) % 3 === 2 ? Rc[3] : Rc[P.idx(1.3 + (xx - x) / (w + ov * 2) * 1.2 + (Math.floor((yy - y) / 3) % 2 ? 0.25 : 0), xx, yy, false)]));
      for (let i = 0; i < pts.length - 1; i++) P.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], o.trim || ol);
      P.rect(Math.round(x - ov), y + h, Math.round(w + ov * 2), 1, ol);
      for (let xx = x; xx < x + w; xx++) for (let yy = y + h + 1; yy < y + h + 4; yy++) { const c = P.get(xx, yy); if (c) P.set(xx, yy, sh(c, -0.35 + (yy - y - h - 1) * 0.08)); }
      if (o.finial) {
        const G = '#f2c84b';
        if (!o.flat) { P.set(x + w / 2, y - 1, G); P.set(x + w / 2, y - 2, G); P.set(x + w / 2 + 1, y - 3, G); }
        for (const [ex, d] of [[x - ov, -1], [x + w + ov, 1]]) { P.set(ex, y + h - 1, G); P.set(ex + d, y + h - 2, G); P.set(ex + d, y + h - 3, G); }
      }
    }
    function win(x, y, w, h, lit) {
      P.rect(x - 1, y - 1, w + 2, h + 2, '#4a2a18');
      P.rect(x, y, w, h, lit ? '#ffd880' : '#5a7a9a');
      if (lit) { P.rect(x, y + h - 2, w, 2, '#ffb850'); lights.push([x + w / 2, y + h / 2, Math.max(w, h)]); } else P.rect(x, y, w, 1, '#8ab0d0');
      P.rect(x + (w >> 1), y, 1, h, '#4a2a18'); P.rect(x, y + (h >> 1), w, 1, '#4a2a18');
      P.rect(x - 1, y + h + 1, w + 2, 1, '#c8a070');
    }
    function door(x, y, w, h, col) {
      P.rect(x - 1, y - 1, w + 2, h + 1, ol);
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) P.set(xx, yy, (xx - x) % 4 === 0 ? sh(col, -0.3) : sh(col, xx - x < 2 ? 0.1 : 0));
      P.set(x + w - 3, y + (h >> 1), '#f2c84b');
    }
    function sign(cx, y, icon) {
      P.line(cx - 6, y - 4, cx - 6, y, '#5a3a22'); P.line(cx + 6, y - 4, cx + 6, y, '#5a3a22');
      P.rect(cx - 9, y, 19, 11, ol); P.rect(cx - 8, y + 1, 17, 9, '#d8aa6a'); P.rect(cx - 8, y + 1, 17, 1, '#f0cc90'); P.rect(cx - 8, y + 9, 17, 1, '#a07040');
      if (icon === 'shop') { P.ball(cx, y + 6, 3.4, 3, R('#c8402a'), { dither: false }); P.set(cx - 1, y + 2, '#5a2010'); P.set(cx + 1, y + 2, '#5a2010'); P.set(cx, y + 1, '#5a2010'); P.set(cx - 1, y + 5, '#ffd84a'); }
      else if (icon === 'food') { P.ball(cx, y + 6, 4, 2.4, R('#f4f0e8'), { dither: false, clip: (xx, yy) => yy >= y + 5 }); P.set(cx - 2, y + 3, '#c0c0c0'); P.set(cx + 1, y + 2, '#e0e0e0'); P.set(cx + 2, y + 3, '#c0c0c0'); P.rect(cx - 4, y + 5, 9, 1, '#c8402a'); }
      else if (icon === 'box') { P.rect(cx - 4, y + 3, 8, 6, '#8a5a30'); P.rect(cx - 4, y + 3, 8, 1, '#c08a50'); P.rect(cx - 1, y + 3, 2, 6, '#5a3a20'); }
      else if (icon === 'smith') { P.rect(cx - 4, y + 3, 6, 3, '#6a6a7a'); P.rect(cx - 4, y + 3, 6, 1, '#b8b8c8'); P.line(cx + 1, y + 5, cx + 4, y + 8, '#7a4a24'); }
      else if (icon === 'museum') { P.poly([[cx - 4, y + 4], [cx, y + 2], [cx + 4, y + 4]], '#ffd84a'); for (let i = -3; i <= 3; i += 3) P.rect(cx + i, y + 5, 1, 4, '#ffffff'); P.rect(cx - 4, y + 9, 9, 1, '#ffffff'); }
    }
    const shadowUnder = (x, w, gy) => { for (let xx = x - 2; xx < x + w + 3; xx++) for (let yy = gy + 1; yy < gy + 4; yy++) { const c = P.get(xx, yy); if (c) P.set(xx, yy, sh(c, -0.3 + (yy - gy) * 0.07)); } };
    const crate = (x, y) => { P.rect(x, y, 8, 7, '#8a5a30'); P.rect(x, y, 8, 1, '#c08a50'); P.line(x, y, x + 7, y + 6, '#5a3a20'); outlineRect(x, y, 8, 7); };
    const barrel = (x, y) => { P.box(x, y, 7, 9, R('#9a6a3a'), { round: true }); P.rect(x, y + 2, 7, 1, '#4a4a52'); P.rect(x, y + 6, 7, 1, '#4a4a52'); };
    const tree = (x, y, s) => { P.box(x - 2, y - 14 * s, 5, 14 * s, R('#6a4228')); P.ball(x, y - 18 * s, 12 * s, 10 * s, R('#3f8a3a')); P.ball(x - 5 * s, y - 22 * s, 6 * s, 5 * s, R('#56a446')); P.ball(x + 6 * s, y - 15 * s, 5 * s, 4 * s, R('#357a32')); };
    function lot(cx, gy) {
      for (let i = -14; i <= 14; i += 7) { P.rect(cx + i, gy - 8, 2, 8, '#7a5a34'); P.set(cx + i, gy - 8, '#a88050'); }
      P.line(cx - 14, gy - 6, cx + 15, gy - 6, '#d8c090');
      P.rect(cx - 1, gy - 22, 3, 16, '#6a4228'); P.rect(cx - 9, gy - 28, 19, 9, ol); P.rect(cx - 8, gy - 27, 17, 7, '#d8b080'); P.rect(cx - 6, gy - 25, 13, 1, '#7a5a34'); P.rect(cx - 6, gy - 23, 9, 1, '#7a5a34');
      label.push(['空き地', cx, gy + 12]);
    }
    // 村人の家（奥の列の左。押せない背景）
    function house(x, w, h, wallC, roofC) {
      const y = BACK - h;
      wall(x, y, w, h, wallC, 'plaster'); roof(x, y - 14, w, 14, roofC, { finial: true });
      win(x + 5, y + 6, 7, 7, night); door(x + w - 13, BACK - 14, 8, 14, '#7a4a28');
      shadowUnder(x, w, BACK);
    }

    // ---------------- 奥の列 ----------------
    house(8, 40, 26, '#e8d2a8', '#b8582e'); house(56, 34, 22, '#d8c0a0', '#8a5a3a');
    tree(104, BACK, 0.9);
    // 倉庫：板張り・大きな両開きの扉・石の土台（段階で大きく）
    {
      const sizes = [null, [44, 30], [52, 38], [60, 46], [70, 54]];
      const [w, h] = sizes[lv.storage];
      const x = Math.round(176 - w / 2), y = BACK - h;
      P.rect(x - 1, BACK - 4, w + 2, 4, '#8a8a90'); P.rect(x - 1, BACK - 4, w + 2, 1, '#c0c0c8'); outlineRect(x - 1, BACK - 4, w + 2, 4);
      wall(x, y, w, h - 4, '#9a6638', 'plank');
      const rh = 15 + (lv.storage >= 3 ? 4 : 0);
      roof(x, y - rh, w, rh, '#4a5a6a', { trim: lv.storage >= 4 ? '#ffd84a' : ol });
      const dw = Math.min(22, w - 16), dx = Math.round(x + w / 2 - dw / 2), dh = Math.min(h - 8, 24);
      door(dx, BACK - 4 - dh, dw, dh, '#6a3a1e'); P.line(dx, BACK - 4 - dh, dx + dw - 1, BACK - 5, '#4a2410'); P.line(dx + dw - 1, BACK - 4 - dh, dx, BACK - 5, '#4a2410');
      if (lv.storage >= 3) { win(x + 5, y + 6, 7, 7, night); win(x + w - 12, y + 6, 7, 7, night); }
      crate(x - 10, BACK - 7); barrel(x + w + 2, BACK - 9); if (lv.storage >= 2) crate(x - 10, BACK - 14);
      sign(x + w / 2, y - rh + 6, 'box');
      shadowUnder(x, w, BACK);
      label.push(['倉庫', x + w / 2, BACK + 11]);
    }
    // 鍛冶屋：石造り・煙突・赤く光る炉・金床
    if (lv.smith > 0) {
      const x = 236, w = 50 + lv.smith * 4, h = 34 + lv.smith * 3, y = BACK - h;
      wall(x, y, w, h, '#8a8a92', 'stone');
      roof(x, y - 11, w, 11, '#3a3a48', { flat: true, trim: lv.smith >= 3 ? '#ffd84a' : ol });
      P.rect(x + w - 15, y - 28, 9, 20, '#6a4a3a'); for (let yy = y - 28; yy < y - 8; yy += 3) P.rect(x + w - 15, yy, 9, 1, '#4a2a20'); outlineRect(x + w - 15, y - 28, 9, 20);
      steam.push([x + w - 11, y - 32, 'smoke']);
      P.rect(x + 5, BACK - 24, 19, 24, ol);
      for (let yy = BACK - 23; yy < BACK; yy++) for (let xx = x + 6; xx < x + 23; xx++) P.set(xx, yy, mix('#2a1410', '#ff7a20', Math.max(0, 1 - Math.hypot(xx - x - 14, yy - BACK + 7) / 11)));
      lights.push([x + 14, BACK - 7, 13]);
      win(x + 30, y + 8, 10, 8, night);
      P.rect(x + w + 2, BACK - 6, 10, 3, '#3a3a44'); P.rect(x + w + 4, BACK - 3, 6, 3, '#2a2a34'); P.rect(x + w + 2, BACK - 6, 10, 1, '#9a9aa8');
      if (lv.smith >= 2) barrel(x - 9, BACK - 9);
      sign(x + 35, y - 2, 'smith');
      shadowUnder(x, w, BACK);
      label.push(['鍛冶屋', x + w / 2, BACK + 11]);
    } else lot(266, BACK);
    // 展示室：白い柱の神殿風・二段の屋根・金の飾り
    if (lv.museum) {
      const x = 330, w = 46, h = 34, y = BACK - h;
      for (let i = 0; i < 3; i++) P.rect(x - 4 + i * 2, BACK - 3 + i - 2, w + 8 - i * 4, 1, '#f0ece0');
      wall(x, y, w, h - 4, '#f2ece0', 'plaster');
      for (let i = 0; i < 4; i++) P.box(x + 3 + i * 12, y, 5, h - 4, R('#ffffff'));
      P.rect(x + 10, y + 10, 26, 12, '#2a2040'); outlineRect(x + 10, y + 10, 26, 12);
      const n = Math.min(5, lv.donated);
      for (let i = 0; i < n; i++) P.ball(x + 15 + i * 4, y + 16, 1.6, 1.6, R(['#ffd84a', '#4fc08a', '#e8902a', '#9ae8ff', '#c8a0ff'][i]), { dither: false });
      roof(x, y - 10, w, 10, '#2f8a6a', { finial: true, trim: '#ffd84a' });
      roof(x + 8, y - 20, w - 16, 10, '#c0452e', { finial: true, trim: '#ffd84a', overhang: 3 });
      sign(x + w / 2, BACK - 12, 'museum');
      shadowUnder(x, w, BACK);
      label.push(['展示室', x + w / 2, BACK + 11]);
    } else lot(354, BACK);

    // ---------------- 広場の飾り ----------------
    const PZ = BACK + 16;      // 広場の奥の縁
    tree(366, FRONT + 6, 1.05);
    // 広場のベンチと鉢植え
    for (const bxp of [212, 346]) { P.rect(bxp, BACK + 30, 16, 3, '#8a5a30'); P.rect(bxp, BACK + 30, 16, 1, '#c08a50'); P.rect(bxp + 1, BACK + 33, 2, 4, '#4a2a18'); P.rect(bxp + 13, BACK + 33, 2, 4, '#4a2a18'); }
    for (const pxp of [204, 232, 340, 368]) { P.rect(pxp - 3, BACK + 32, 7, 5, '#b0603a'); outlineRect(pxp - 3, BACK + 32, 7, 5); P.ball(pxp, BACK + 29, 4, 3.5, R('#4f9a3a'), { bias: 0.1 }); P.set(pxp - 1, BACK + 27, '#ff8fb8'); }
    { // 広場の小さな仏塔（いつもある目印）
      const x = 330, y = FRONT - 6;
      P.rect(x - 12, y - 6, 24, 6, '#c8b090'); P.rect(x - 12, y - 6, 24, 1, '#e8d8b8'); outlineRect(x - 12, y - 6, 24, 6);
      P.ball(x, y - 16, 9, 10, R('#f0e8d8'), { clip: (xx, yy) => yy <= y - 8 });
      P.poly([[x - 3, y - 24], [x, y - 40], [x + 3, y - 24]], (xx) => (xx < x ? '#ffe68a' : '#d8a830'));
      P.rect(x - 4, y - 26, 8, 2, '#d8a830');
    }
    if (lv.decor.stalls) {
      for (let i = 0; i < 3; i++) {
        const x = 214 + i * 36, y = PZ + 4;
        P.rect(x + 1, y + 5, 2, 14, '#5a3a22'); P.rect(x + 25, y + 5, 2, 14, '#5a3a22');
        for (let j = 0; j < 4; j++) P.rect(x - 2 + j * 8, y, 8, 6, (i + j) % 2 ? '#ffffff' : ['#2e8b88', '#e24a4a', '#f2c230'][i]);
        P.rect(x - 2, y, 32, 1, ol);
        P.rect(x, y + 13, 28, 6, '#b07a45'); P.rect(x, y + 13, 28, 1, '#e0aa70'); outlineRect(x, y + 13, 28, 6);
        P.ball(x + 8, y + 11, 2.5, 2, R('#ffffff'), { dither: false }); P.ball(x + 18, y + 11, 2.5, 2, R('#e8902a'), { dither: false });
      }
    }
    if (lv.decor.fountain) {
      const x = 268, y = FRONT - 18;
      P.ball(x, y + 6, 18, 6.5, R('#c8c0b0'), { dither: false }); P.ball(x, y + 5, 14, 4.5, R('#5ab0e0'), { dither: false });
      P.box(x - 2, y - 8, 5, 13, R('#e8e0d0')); P.ball(x, y - 9, 4, 2, R('#e8e0d0'), { dither: false });
      steam.push([x, y - 12, 'fountain']);
    }
    if (lv.decor.statue) { // 白い象の像
      const x = 206, y = FRONT - 30;
      P.rect(x - 1, y + 14, 24, 6, '#a8a090'); P.rect(x - 1, y + 14, 24, 1, '#d8d0c0'); outlineRect(x - 1, y + 14, 24, 6);
      P.ball(x + 13, y + 7, 9, 6, R('#f0ece0')); P.ball(x + 4, y + 5, 4.5, 5, R('#f0ece0'));
      P.line(x + 1, y + 7, x + 1, y + 13, '#d0c8b8'); P.box(x + 7, y + 10, 3, 5, R('#e8e4d8')); P.box(x + 17, y + 10, 3, 5, R('#e8e4d8'));
      P.set(x + 3, y + 4, '#2a1a10'); P.rect(x + 10, y + 1, 8, 2, '#c0402a'); P.set(x + 14, y, '#ffd84a');
    }
    if (lv.legacy) { // 旧記録：10階踏破の記念の獅子像
      const x = 284, y = FRONT - 24;
      P.rect(x, y + 16, 16, 6, '#a8a090'); outlineRect(x, y + 16, 16, 6);
      P.ball(x + 8, y + 9, 6, 7, R('#f2c84b')); P.ball(x + 8, y + 6, 4.5, 4.5, R('#d0602a')); P.ball(x + 8, y + 7, 3, 3, R('#f2c84b'));
    }
    if (lv.decor.garden) { // 花壇
      for (let i = 0; i < 18; i++) { const x = 200 + i * 10, y = FRONT + 24 + (i % 2) * 2; P.ball(x, y, 4, 2.4, R('#3a8a40'), { dither: false }); P.ball(x, y - 2, 1.8, 1.8, R(['#ff8fb8', '#ffe04a', '#ffffff'][i % 3]), { dither: false }); }
      lotus(160, 446); lotus(230, 460); lotus(320, 464);
    }
    // ---- 章による復興の様子（購入した施設は変えない。背景の飾りで表す） ----
    const ch = lv.chapter || 1;
    if (ch <= 2) { // 魔王軍に壊された跡（がれき）。章が進むと片づく
      for (const [x, y, r] of (ch === 1 ? [[224, BACK + 40, 6], [300, BACK + 58, 5], [352, BACK + 44, 4], [250, FRONT - 6, 5]] : [[300, BACK + 58, 4], [250, FRONT - 6, 3]])) {
        P.ball(x, y, r * 1.4, r * 0.8, R('#8a7a6a')); P.ball(x - r * 0.6, y - r * 0.5, r * 0.6, r * 0.5, R('#a8987a')); P.set(x + r, y - 1, '#5a4a3a');
      }
    }
    if (ch >= 3) { // 広場に渡した旗（市場が戻ってきた）
      const fy = BACK + 22;
      for (let x = 196; x < 384; x += 2) P.set(x, fy + Math.round(Math.abs(Math.sin((x - 196) / 30 * Math.PI)) * 3), '#5a3a22');
      const cols = ['#e24a4a', '#ffd84a', '#2e8b88', '#ffffff', '#8a4ac0'];
      for (let i = 0; i < 12; i++) { const x = 200 + i * 15, y = fy + Math.round(Math.abs(Math.sin((x - 196) / 30 * Math.PI)) * 3) + 1; P.poly([[x, y], [x + 6, y], [x + 3, y + 6]], cols[i % cols.length]); }
    }
    if (ch >= 5 || lv.ending) { // 祭りの花飾り
      for (let i = 0; i < 8; i++) { const x = 206 + i * 22, y = FRONT + 12; P.ball(x, y, 2.5, 2.5, R(['#ff8fb8', '#ffe04a', '#ffffff'][i % 3]), { dither: false }); P.set(x, y, '#ffb040'); }
    }
    if (lv.decor.gate) { // 遺跡へ続く黄金の門（丘の上）
      const x = 182, y = BACK - 62, G2 = R('#ffd84a');
      P.box(x, y + 8, 4, 20, G2); P.box(x + 24, y + 8, 4, 20, G2);
      P.poly([[x - 3, y + 9], [x + 14, y - 6], [x + 31, y + 9]], (xx, yy) => G2[P.idx(0.8 + (yy - y + 6) / 16, xx, yy)]);
      P.rect(x + 4, y + 10, 20, 2, G2[3]);
    }
    if (lv.cleared) { // 宝珠の祠（丘の上）
      const x = 250, y = 168;
      P.rect(x - 10, y + 12, 20, 14, '#e8e0d0'); outlineRect(x - 10, y + 12, 20, 14);
      P.poly([[x - 14, y + 13], [x, y + 2], [x + 14, y + 13]], '#c0402a'); P.set(x, y + 1, '#ffd84a');
    }

    // ---------------- 手前の列 ----------------
    // サイの店：段階で大きくなる（屋台 → 瓦屋根の店 → 2階建て）
    {
      const x = 8, w = lv.stage >= 3 ? 90 : lv.stage >= 2 ? 82 : 72, h = 40, y = FRONT - h;
      wall(x, y, w, h, lv.stage >= 2 ? '#e8cfa2' : '#c89a64', lv.stage >= 2 ? 'plaster' : 'plank');
      if (lv.stage >= 3) {
        wall(x + 8, y - 26, w - 16, 26, '#e8cfa2', 'plaster');
        win(x + 14, y - 19, 9, 9, night); win(x + w - 23, y - 19, 9, 9, night); win(Math.round(x + w / 2 - 4), y - 19, 8, 9, night);
        roof(x + 8, y - 44, w - 16, 18, '#c0452e', { finial: true, trim: '#7a2a18' });
        roof(x, y - 6, w, 6, '#c8582e', { flat: true, trim: '#7a2a18' });
      } else if (lv.stage >= 2) roof(x, y - 18, w, 18, '#c8582e', { finial: true, trim: '#7a2a18' });
      else { P.rect(x, y - 6, w, 6, '#8a5a30'); outlineRect(x, y - 6, w, 6); }
      // しまのひさし
      for (let i = 0; i < Math.ceil((w + 6) / 8); i++) { const xx = x - 3 + i * 8; P.rect(xx, y + 2, 8, 9, i % 2 ? '#f6f0e6' : '#d8402e'); P.rect(xx + 1, y + 11, 6, 1, i % 2 ? '#f6f0e6' : '#d8402e'); }
      P.rect(x - 3, y + 2, w + 6, 1, ol);
      for (let xx = x - 3; xx < x + w + 3; xx++) { const c = P.get(xx, y + 13); if (c) P.set(xx, y + 13, sh(c, -0.4)); }
      // 店先：棚と品物、カウンター
      P.rect(x + 4, y + 15, w - 8, 14, '#5a3a24'); P.rect(x + 5, y + 16, w - 10, 12, '#7a5236');
      const goods = ['#ffd84a', '#4caf50', '#c8943c', '#e24a4a', '#9ae8ff', '#c890ff'];
      for (let i = 0; i < Math.min(goods.length, lv.stage + 3); i++) { P.ball(x + 11 + i * 11, y + 21, 3, 3, R(goods[i]), { dither: false }); P.rect(x + 8 + i * 11, y + 24, 7, 1, '#4a2a18'); }
      P.rect(x + 2, y + 29, w - 4, 6, '#a06a3a'); P.rect(x + 2, y + 29, w - 4, 1, '#d09a60'); outlineRect(x + 2, y + 29, w - 4, 6);
      sign(Math.round(x + w / 2), lv.stage >= 3 ? y - 4 : lv.stage >= 2 ? y - 30 : y - 16, 'shop');
      lights.push([x + w / 2, y + 22, 16]);
      shadowUnder(x, w, FRONT);
      label.push(['サイの店', x + w / 2, FRONT + 13]);
    }
    // 食堂：赤い急な屋根のタイ風の家、湯気の立つ鍋
    if (lv.diner) {
      const x = 122, w = 62, h = 36, y = FRONT - h;
      wall(x, y, w, h, '#f0dcb0', 'plaster');
      roof(x, y - 24, w, 24, '#b8302a', { finial: true, trim: '#ffd84a' });
      P.rect(x + 6, y + 6, 26, 24, '#3a2014'); P.rect(x + 7, y + 7, 24, 22, '#6a3a20');
      P.rect(x + 9, y + 20, 20, 3, '#a87040'); P.box(x + 13, y + 13, 9, 7, R('#5a5a64'), { round: true }); steam.push([x + 17, y + 10]);
      win(x + 40, y + 9, 14, 10, true);
      P.rect(x + 2, y - 4, 2, 6, '#5a3a22'); P.ball(x + 3, y + 3, 2.4, 3, R('#e8402a'), { dither: false }); lights.push([x + 3, y + 3, 6]);
      sign(x + 47, y + 22, 'food');
      shadowUnder(x, w, FRONT);
      P.rect(x + 66, FRONT + 4, 14, 2, '#8a5a30'); P.rect(x + 72, FRONT + 6, 2, 6, '#5a3a22');
      label.push(['サイの食堂', x + w / 2, FRONT + 13]);
    } else lot(152, FRONT);
    // 船着き場と橋
    P.rect(186, BANK - 1, 28, 3, '#8a6040'); for (let x = 188; x < 214; x += 6) P.rect(x, BANK + 2, 2, 10, '#5a3a22');
    if (lv.decor.bridge) {
      const x = 236, w = 70;
      for (let xx = x; xx < x + w; xx++) {
        const a = Math.sin((xx - x) / w * Math.PI) * 10;
        for (let yy = 0; yy < 6; yy++) P.set(xx, Math.round(WATER[0] + 8 - a + yy), yy === 0 ? '#ff7a5a' : yy === 5 ? '#6a1a10' : '#c0402a');
        if ((xx - x) % 8 === 4) P.rect(xx, Math.round(WATER[0] + 1 - a), 2, 8, '#8a2a1a');
      }
      for (let xx = x; xx < x + w; xx++) { const a = Math.sin((xx - x) / w * Math.PI) * 10; P.set(xx, Math.round(WATER[0] + 1 - a), '#ffd84a'); }
    }
    return { canvas: P.canvas(), label, lights, steam, night };
  };

  TS.Village = VL;
})(globalThis.TS = globalThis.TS || {});
