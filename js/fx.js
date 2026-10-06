/* 戦闘・道具・ボスの演出（見た目だけ。ゲームの数値や判定には一切さわらない）。
 * 演出は RD.fx に { t: 種類, t0: 開始時刻, dur: 長さms, delay: 遅れms, ... } で積み、毎フレーム時刻から描く。
 * ・時刻だけで描くので、描画のフレーム数や処理速度で結果は変わらない（敵の行動回数にも影響しない）。
 * ・演出は入力を止めない・ためない（演出中に押しても、その場でふつうに1回だけ処理される）。
 * ・「演出：控えめ」では画面の揺れ・強い点滅をやめ、粒の数を半分にする。粒の数には上限がある。
 * 光は左上から。色だけでなく形でも区別できるようにする。 */
(function (TS) {
  'use strict';
  const FX = { draw: {} };
  const MAX_FX = 48;                       // 同時に描く演出の上限（スマホ向け）
  FX.calm = () => !!(TS.UI && TS.UI.S && TS.UI.S.settings && TS.UI.S.settings.fx === 'calm');
  FX.n = (n) => (FX.calm() ? Math.max(2, Math.ceil(n / 2)) : n);   // 粒の数
  // 決まった並びの疑似乱数（毎フレーム同じ形を描く。Math.random で毎回ちらつかせない）
  const rnd = (seed, i) => { let t = (seed * 374761393 + i * 668265263) >>> 0; t = Math.imul(t ^ (t >>> 13), 1274126177); return ((t ^ (t >>> 16)) >>> 0) / 4294967296; };
  let seedN = 1;
  FX.add = function (RD, f) {
    f.t0 = performance.now();
    if (f.seed === undefined) f.seed = seedN++;
    if (RD.fx.length >= MAX_FX) RD.fx.splice(0, RD.fx.length - MAX_FX + 1);   // 古いものから捨てる
    RD.fx.push(f);
    return f;
  };
  /* 画面の揺れ（強いボスの攻撃だけ。控えめでは揺らさない） */
  FX.shake = function (RD, amp, dur) { if (FX.calm()) return; FX.add(RD, { t: 'shake', amp, dur: dur || 260 }); };
  FX.shakeOffset = function (RD, now, k) {
    let x = 0, y = 0;
    for (const f of RD.fx) {
      if (f.t !== 'shake') continue;
      const a = (now - f.t0) / f.dur;
      if (a < 0 || a >= 1) continue;
      const m = f.amp * k * (1 - a);
      x += Math.round(Math.sin(now / 23 + f.seed) * m); y += Math.round(Math.cos(now / 29 + f.seed) * m * 0.6);
    }
    return [x, y];
  };

  // 便利：マスの中心
  const cx = (v, x) => v.ox + (x + 0.5) * v.ts, cy = (v, y) => v.oy + (y + 0.5) * v.ts;
  const ease = (a) => 1 - (1 - a) * (1 - a);

  /* ---------- たけの通常攻撃 ---------- */
  // 剣の斬撃：攻撃の向き（8方向）に沿った三日月の弧。敵のマスの上に短く出る
  FX.draw.slash = function (g, f, a, v) {
    const ang = Math.atan2(f.dy, f.dx), x = cx(v, f.x) - f.dx * v.ts * 0.15, y = cy(v, f.y) - f.dy * v.ts * 0.15 - v.ts * 0.1;
    const r = v.ts * 0.6, sweep = Math.PI * 0.95, start = ang - sweep / 2;
    const head = start + sweep * Math.min(1, a * 1.6);           // 弧が振り抜かれる
    const tail = start + sweep * Math.max(0, a * 1.6 - 0.55);
    if (head <= tail) return;
    g.lineCap = 'round';
    g.globalAlpha = Math.max(0, 1 - a) * 0.55; g.strokeStyle = '#9fd8ff'; g.lineWidth = v.k * 7;
    g.beginPath(); g.arc(x, y, r, tail, head); g.stroke();
    g.globalAlpha = Math.max(0, 1 - a); g.strokeStyle = '#ffffff'; g.lineWidth = v.k * 3;
    g.beginPath(); g.arc(x, y, r, tail, head); g.stroke();
    g.globalAlpha = 1; g.lineCap = 'butt';
  };
  // 素手の打撃：小さな衝撃の星と輪
  FX.draw.punch = function (g, f, a, v) {
    const x = cx(v, f.x) - f.dx * v.ts * 0.2, y = cy(v, f.y) - f.dy * v.ts * 0.2 - v.ts * 0.1, r = v.ts * (0.12 + 0.3 * ease(a));
    g.globalAlpha = 1 - a; g.strokeStyle = '#fff2c0'; g.lineWidth = v.k * 1.5;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) { const t = i / 6 * Math.PI * 2 + 0.3, l = r * 1.25; g.fillRect(x + Math.cos(t) * l - v.k, y + Math.sin(t) * l - v.k, 2 * v.k, 2 * v.k); }
    g.globalAlpha = 1;
  };
  // 通常の敵の撃破：縦につぶれながら白く消える（短く）
  FX.draw.die = function (g, f, a, v) {
    const SP = TS.Sprites, fr = SP.s.enemy[f.sprite]; if (!fr) return;
    const img = fr[0], dw = v.ts * img.width / 32, x = cx(v, f.x) - dw / 2, foot = v.oy + (f.y + 1) * v.ts;
    const h = dw * (1 - a * 0.8);
    g.globalAlpha = 1 - a; g.drawImage(SP.tinted(img, '#ffffff'), x + dw * a * 0.15, foot - h, dw * (1 - a * 0.3), h);
    g.globalAlpha = 1;
  };
  // 回復：やわらかい緑の光が足元から上へ
  FX.draw.healrise = function (g, f, a, v) {
    const x = cx(v, f.x), foot = v.oy + (f.y + 0.95) * v.ts, n = FX.n(10);
    const gr = g.createLinearGradient(0, foot, 0, foot - v.ts * 1.6);
    gr.addColorStop(0, `rgba(140,255,150,${0.35 * (1 - a)})`); gr.addColorStop(1, 'rgba(140,255,150,0)');
    g.fillStyle = gr; g.fillRect(x - v.ts * 0.35, foot - v.ts * 1.6, v.ts * 0.7, v.ts * 1.6);
    g.fillStyle = f.color || '#b8ffb0';
    for (let i = 0; i < n; i++) {
      const p = (a + rnd(f.seed, i)) % 1, px = x + (rnd(f.seed, i + 50) - 0.5) * v.ts * 0.6, py = foot - p * v.ts * 1.5;
      g.globalAlpha = Math.sin(p * Math.PI) * (1 - a * 0.5); g.fillRect(px, py, 2 * v.k, 3 * v.k);
    }
    g.globalAlpha = 1;
  };
  // 杖の稲妻。staff：細い青白、king：太い金と青白。命中したときだけ先端に小さな電撃
  FX.draw.bolt2 = function (g, f, a, v) {
    const king = f.kind === 'king';
    const x0 = cx(v, f.from.x), y0 = cy(v, f.from.y) - v.ts * 0.2, x1 = cx(v, f.to.x), y1 = cy(v, f.to.y) - v.ts * 0.2;
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(3, Math.round(len / (v.ts * 0.35)));
    const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
    const flick = Math.floor(a * 6);                               // 時間で3段階に形を変える（ちらつきは控えめ）
    const pts = [[x0, y0]];
    for (let i = 1; i < n; i++) { const j = (rnd(f.seed + flick, i) - 0.5) * v.ts * (king ? 0.45 : 0.3); pts.push([x0 + (x1 - x0) * i / n + nx * j, y0 + (y1 - y0) * i / n + ny * j]); }
    pts.push([x1, y1]);
    const line = (w, col, al) => { g.globalAlpha = al; g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts) g.lineTo(p[0], p[1]); g.stroke(); };
    const fade = 1 - a;
    g.lineJoin = 'round';
    if (king) { line(v.k * 9, '#ffcf40', 0.35 * fade); line(v.k * 5, '#8fdcff', 0.7 * fade); line(v.k * 2.2, '#fffbe0', fade); }
    else { line(v.k * 5, '#6ad0ff', 0.3 * fade); line(v.k * 1.6, '#e8f8ff', fade); }
    g.globalAlpha = 1;
    if (f.hit) { // 命中地点の電撃
      g.strokeStyle = king ? '#ffe680' : '#bff0ff'; g.lineWidth = v.k * (king ? 2 : 1.5);
      for (let i = 0; i < (king ? 7 : 5); i++) {
        const t = rnd(f.seed, 90 + i) * Math.PI * 2, l = v.ts * (0.2 + 0.25 * rnd(f.seed, 120 + i)) * (0.6 + a);
        g.globalAlpha = fade; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 + Math.cos(t) * l * 0.5 + 2 * v.k, y1 + Math.sin(t) * l * 0.5); g.lineTo(x1 + Math.cos(t) * l, y1 + Math.sin(t) * l); g.stroke();
      }
      g.globalAlpha = 1;
    }
  };

  /* ---------- 道具 ---------- */
  // 鈍足の粉：粉が対象へ飛び、着いたら紫の粉が広がる
  FX.draw.powder = function (g, f, a, v) {
    const n = FX.n(10), x0 = cx(v, f.from.x), y0 = cy(v, f.from.y) - v.ts * 0.2;
    const fly = Math.min(1, a / 0.45), spread = Math.max(0, (a - 0.45) / 0.55);
    for (const t of f.targets) {
      const x1 = cx(v, t.x), y1 = cy(v, t.y) - v.ts * 0.2;
      if (fly < 1) {
        g.fillStyle = '#c9a0ff';
        for (let i = 0; i < 5; i++) { const q = Math.max(0, fly - i * 0.06); g.globalAlpha = 0.9; g.fillRect(x0 + (x1 - x0) * q - v.k, y0 + (y1 - y0) * q - Math.sin(q * Math.PI) * v.ts * 0.4 - v.k, 2 * v.k, 2 * v.k); }
      } else {
        for (let i = 0; i < n; i++) {
          const ang = rnd(f.seed, i) * Math.PI * 2, r = v.ts * (0.15 + 0.45 * rnd(f.seed, i + 30)) * ease(spread);
          g.globalAlpha = 1 - spread; g.fillStyle = i % 3 ? '#a070e0' : '#e0c8ff';
          g.fillRect(x1 + Math.cos(ang) * r - v.k, y1 + Math.sin(ang) * r * 0.7 - spread * v.ts * 0.2 - v.k, 2 * v.k, 2 * v.k);
        }
      }
    }
    if (!f.targets.length) { // だれにも届かない：足元で散るだけ
      for (let i = 0; i < n; i++) { const ang = rnd(f.seed, i) * Math.PI * 2, r = v.ts * 0.5 * ease(a); g.globalAlpha = 1 - a; g.fillStyle = '#b090e0'; g.fillRect(x0 + Math.cos(ang) * r, y0 + Math.sin(ang) * r * 0.6, 2 * v.k, 2 * v.k); }
    }
    g.globalAlpha = 1;
  };
  // 眠り：淡い紫の粒と「Zzz」
  FX.draw.zzz = function (g, f, a, v) {
    for (const t of f.targets) {
      const x = cx(v, t.x), y = v.oy + t.y * v.ts;
      g.fillStyle = '#d8c8ff';
      for (let i = 0; i < FX.n(6); i++) { const p = (a + rnd(f.seed, i)) % 1; g.globalAlpha = (1 - a) * Math.sin(p * Math.PI); g.fillRect(x + (rnd(f.seed, i + 9) - 0.5) * v.ts * 0.8, y + v.ts * 0.8 - p * v.ts, 2 * v.k, 2 * v.k); }
      g.globalAlpha = 1 - a; g.font = `bold ${Math.round(v.ts * 0.3)}px sans-serif`; g.textAlign = 'center';
      g.lineWidth = v.k * 2; g.strokeStyle = '#201040'; g.strokeText('Zzz', x + v.ts * 0.2, y - a * v.ts * 0.4); g.fillStyle = '#e8dcff'; g.fillText('Zzz', x + v.ts * 0.2, y - a * v.ts * 0.4);
      g.textAlign = 'left';
    }
    g.globalAlpha = 1;
  };
  // 食事：小さな湯気と、あたたかい光
  FX.draw.steam = function (g, f, a, v) {
    const x = cx(v, f.x), y = cy(v, f.y);
    const gr = g.createRadialGradient(x, y, 0, x, y, v.ts * 0.7);
    gr.addColorStop(0, `rgba(255,210,140,${0.35 * (1 - a)})`); gr.addColorStop(1, 'rgba(255,210,140,0)');
    g.fillStyle = gr; g.fillRect(x - v.ts, y - v.ts, v.ts * 2, v.ts * 2);
    for (let i = 0; i < 3; i++) {
      const p = Math.min(1, a * 1.3 + i * 0.12);
      g.globalAlpha = 0.6 * (1 - p); g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(x + (i - 1) * v.ts * 0.18 + Math.sin(p * 6 + i) * v.k * 2, y - v.ts * 0.4 - p * v.ts * 0.6, v.k * (2 + p * 3), 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  };
  // 帰還の巻物：足元に青緑の魔法陣 → 光の柱（帰還が成立したときだけ）
  FX.draw.circle = function (g, f, a, v) {
    const x = cx(v, f.x), y = v.oy + (f.y + 0.85) * v.ts, r = v.ts * 0.75 * Math.min(1, a * 2.5);
    g.save(); g.translate(x, y); g.scale(1, 0.45);
    g.strokeStyle = '#5ff0d8'; g.lineWidth = v.k * 1.5; g.globalAlpha = 0.9;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(0, 0, r * 0.72, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 6; i++) { const t = i / 6 * Math.PI * 2 + a * 2; g.beginPath(); g.moveTo(Math.cos(t) * r * 0.72, Math.sin(t) * r * 0.72); g.lineTo(Math.cos(t + Math.PI * 2 / 3) * r * 0.72, Math.sin(t + Math.PI * 2 / 3) * r * 0.72); g.stroke(); }
    g.restore();
    if (a > 0.35) { // 光の柱
      const b = (a - 0.35) / 0.65, w = v.ts * 0.5 * (1 - b * 0.5);
      const gr = g.createLinearGradient(0, y, 0, y - v.ts * 2.4);
      gr.addColorStop(0, `rgba(160,255,240,${0.6 * Math.sin(b * Math.PI)})`); gr.addColorStop(1, 'rgba(160,255,240,0)');
      g.fillStyle = gr; g.fillRect(x - w / 2, y - v.ts * 2.4, w, v.ts * 2.4);
    }
    g.globalAlpha = 1;
  };
  // 雷鳴の巻物：見えている敵それぞれに空から雷
  FX.draw.thunder = function (g, f, a, v) {
    for (const [i, t] of f.targets.entries()) {
      const x = cx(v, t.x), y1 = cy(v, t.y), y0 = y1 - v.ts * 3;
      const al = a < 0.5 ? 1 : 1 - (a - 0.5) * 2;
      g.globalAlpha = al; g.strokeStyle = '#fff36a'; g.lineWidth = v.k * 3; g.beginPath(); g.moveTo(x, y0);
      for (let s = 1; s <= 5; s++) g.lineTo(x + (rnd(f.seed + i, s) - 0.5) * v.ts * 0.5 * (s < 5 ? 1 : 0), y0 + (y1 - y0) * s / 5);
      g.stroke();
      g.fillStyle = '#fffbe0'; g.globalAlpha = al * 0.6; g.beginPath(); g.arc(x, y1, v.ts * 0.3 * (1 + a), 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  };
  // けむり玉：灰色の煙
  FX.draw.smoke = function (g, f, a, v) {
    const x = cx(v, f.x), y = cy(v, f.y);
    for (let i = 0; i < FX.n(7); i++) {
      const t = rnd(f.seed, i) * Math.PI * 2, r = v.ts * 0.5 * ease(a) * (0.5 + rnd(f.seed, i + 7));
      g.globalAlpha = 0.55 * (1 - a); g.fillStyle = i % 2 ? '#d8d8e0' : '#a8a8b8';
      g.beginPath(); g.arc(x + Math.cos(t) * r, y + Math.sin(t) * r * 0.6 - a * v.ts * 0.3, v.ts * (0.15 + 0.15 * a), 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  };
  // みとおしの巻物：たけから広がる青い輪
  FX.draw.reveal = function (g, f, a, v) {
    const x = cx(v, f.x), y = cy(v, f.y);
    g.globalAlpha = 1 - a; g.strokeStyle = f.color || '#8fd8ff'; g.lineWidth = v.k * 2;
    g.beginPath(); g.arc(x, y, v.ts * 4 * ease(a), 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 1;
  };
  // どくけし・きりばらい：白と水色の粒が渦を巻いて消える
  FX.draw.cleanse = function (g, f, a, v) {
    const x = cx(v, f.x), y = cy(v, f.y);
    for (let i = 0; i < FX.n(10); i++) {
      const t = i / 10 * Math.PI * 2 + a * 5, r = v.ts * (0.45 - 0.25 * a);
      g.globalAlpha = 1 - a; g.fillStyle = i % 2 ? '#ffffff' : '#9ff0ff';
      g.fillRect(x + Math.cos(t) * r - v.k, y + Math.sin(t) * r * 0.7 - a * v.ts * 0.4 - v.k, 2 * v.k, 2 * v.k);
    }
    g.globalAlpha = 1;
  };
  // ドロップ：落ちた道具の位置に小さな光
  FX.draw.loot = function (g, f, a, v) {
    const x = cx(v, f.x), y = cy(v, f.y);
    g.globalAlpha = 1 - a; g.strokeStyle = '#ffe58a'; g.lineWidth = v.k * 1.5;
    const r = v.ts * 0.35 * ease(a);
    g.beginPath(); g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r); g.stroke();
    g.globalAlpha = 1;
  };

  /* ---------- ボスの技（予告と同じマスの上だけに出す） ---------- */
  const tileFill = (g, v, tiles, col, al) => { g.globalAlpha = al; g.fillStyle = col; for (const t of tiles) g.fillRect(v.ox + t.x * v.ts, v.oy + t.y * v.ts, v.ts, v.ts); g.globalAlpha = 1; };
  // 土煙（クロコダインの斧・突進）
  FX.draw.dust = function (g, f, a, v) {
    for (const [j, t] of f.tiles.entries()) {
      const x = cx(v, t.x), y = v.oy + (t.y + 0.85) * v.ts;
      for (let i = 0; i < FX.n(4); i++) {
        const s = rnd(f.seed + j, i), r = v.ts * (0.15 + 0.4 * ease(a)) * (0.6 + s);
        g.globalAlpha = 0.5 * (1 - a); g.fillStyle = i % 2 ? '#b89a70' : '#8a7050';
        g.beginPath(); g.arc(x + (s - 0.5) * v.ts * 0.8, y - a * v.ts * 0.4 * s, r * 0.45, 0, Math.PI * 2); g.fill();
      }
    }
    g.globalAlpha = 1;
  };
  // 重い衝撃：ひび割れの光と輪
  FX.draw.impact = function (g, f, a, v) {
    tileFill(g, v, f.tiles, '#fff0c8', 0.55 * (1 - a));
    const t = f.center || f.tiles[0]; if (!t) return;
    const x = cx(v, t.x), y = cy(v, t.y);
    g.globalAlpha = 1 - a; g.strokeStyle = f.color || '#ffd890'; g.lineWidth = v.k * 3;
    g.beginPath(); g.ellipse(x, y + v.ts * 0.3, v.ts * (0.4 + 1.2 * ease(a)), v.ts * (0.2 + 0.5 * ease(a)), 0, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 1;
  };
  // 炎の粒（上へ）と氷のかけら（下へ・ひし形）
  FX.draw.embers = function (g, f, a, v) {
    for (const [j, t] of f.tiles.entries()) {
      const x = v.ox + t.x * v.ts, y = v.oy + t.y * v.ts;
      g.globalAlpha = 0.5 * (1 - a); g.fillStyle = '#ff7a30'; g.fillRect(x + 2 * v.k, y + 2 * v.k, v.ts - 4 * v.k, v.ts - 4 * v.k);
      for (let i = 0; i < FX.n(3); i++) {
        const s = rnd(f.seed + j, i), p = (a + s * 0.5) % 1;
        g.globalAlpha = 1 - a; g.fillStyle = i % 2 ? '#ffd040' : '#ff5020';
        g.beginPath(); g.moveTo(x + v.ts * s, y + v.ts * (1 - p)); g.lineTo(x + v.ts * s + 3 * v.k, y + v.ts * (1 - p) + 6 * v.k); g.lineTo(x + v.ts * s - 3 * v.k, y + v.ts * (1 - p) + 6 * v.k); g.fill();
      }
    }
    g.globalAlpha = 1;
  };
  FX.draw.shards = function (g, f, a, v) {
    for (const [j, t] of f.tiles.entries()) {
      const x = v.ox + t.x * v.ts, y = v.oy + t.y * v.ts;
      g.globalAlpha = 0.45 * (1 - a); g.fillStyle = '#a8e8ff'; g.fillRect(x + 2 * v.k, y + 2 * v.k, v.ts - 4 * v.k, v.ts - 4 * v.k);
      for (let i = 0; i < FX.n(3); i++) {
        const s = rnd(f.seed + j, i), px = x + v.ts * (0.15 + 0.7 * s), py = y + v.ts * (0.2 + 0.6 * a * (0.5 + s)), r = 3 * v.k;
        g.globalAlpha = 1 - a; g.fillStyle = '#e8faff'; g.beginPath(); g.moveTo(px, py - r * 1.6); g.lineTo(px + r, py); g.lineTo(px, py + r * 1.6); g.lineTo(px - r, py); g.fill();
      }
    }
    g.globalAlpha = 1;
  };
  // 罠の発動（キルバーン）：紫の破裂と×印
  FX.draw.trapburst = function (g, f, a, v) {
    for (const t of f.tiles) {
      const x = cx(v, t.x), y = cy(v, t.y), r = v.ts * 0.45 * ease(a);
      g.globalAlpha = 1 - a; g.strokeStyle = '#e0a0ff'; g.lineWidth = v.k * 2;
      g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke();
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    }
    g.globalAlpha = 1;
  };
  // 鎌の弧（キルバーン）
  FX.draw.scythe = function (g, f, a, v) {
    const x = cx(v, f.x), y = cy(v, f.y) - v.ts * 0.3, ang = Math.atan2(f.dy, f.dx);
    g.globalAlpha = 1 - a; g.strokeStyle = '#c8b8ff'; g.lineWidth = v.k * 3; g.lineCap = 'round';
    g.beginPath(); g.arc(x, y, v.ts * 0.8, ang - 1.4 + a * 0.6, ang + 0.2 + a * 1.2); g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = v.k; g.beginPath(); g.arc(x, y, v.ts * 0.8, ang - 0.6 + a * 0.6, ang + 0.2 + a * 1.2); g.stroke();
    g.globalAlpha = 1; g.lineCap = 'butt';
  };
  // 残像（キルバーンの分身の入れ替わり）
  FX.draw.afterimage = function (g, f, a, v) {
    const SP = TS.Sprites, fr = SP.s.enemy[f.sprite]; if (!fr) return;
    const img = fr[0], dw = v.ts * img.width / 32;
    g.globalAlpha = 0.45 * (1 - a); g.drawImage(SP.tinted(img, '#b8a0ff'), cx(v, f.x) - dw / 2, v.oy + (f.y + 1) * v.ts - dw, dw, dw); g.globalAlpha = 1;
  };
  // 剣閃（バラン）：予告の列にそって鋭い光の線
  FX.draw.swordflash = function (g, f, a, v) {
    if (!f.tiles.length) return;
    const t0 = f.tiles[0], t1 = f.tiles[f.tiles.length - 1];
    const x0 = cx(v, t0.x), y0 = cy(v, t0.y), x1 = cx(v, t1.x), y1 = cy(v, t1.y);
    const p = Math.min(1, a * 2.5);
    g.globalAlpha = 1 - a; g.strokeStyle = '#d8f0ff'; g.lineWidth = v.k * 6; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + (x1 - x0) * p, y0 + (y1 - y0) * p); g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = v.k * 2; g.stroke();
    g.globalAlpha = 1;
  };
  // 落雷（バランの雷・雷の床）
  FX.draw.boltstrike = function (g, f, a, v) {
    tileFill(g, v, f.tiles, '#fff6a0', 0.45 * (1 - a));
    for (const [i, t] of f.tiles.entries()) {
      if (i % 2 && FX.calm()) continue;
      const x = cx(v, t.x), y1 = cy(v, t.y), y0 = y1 - v.ts * 1.6;
      g.globalAlpha = 1 - a; g.strokeStyle = '#fff36a'; g.lineWidth = v.k * 2; g.beginPath(); g.moveTo(x, y0);
      for (let s = 1; s <= 4; s++) g.lineTo(x + (rnd(f.seed + i, s) - 0.5) * v.ts * 0.4 * (s < 4 ? 1 : 0), y0 + (y1 - y0) * s / 4);
      g.stroke();
    }
    g.globalAlpha = 1;
  };
  // 闇の糸（ミストバーンの拘束）：たけに巻きつく紫の糸
  FX.draw.chains = function (g, f, a, v) {
    const x = cx(v, f.x), y = cy(v, f.y);
    g.globalAlpha = 1 - a * 0.5; g.strokeStyle = '#9a70e0'; g.lineWidth = v.k * 2;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(x, y - v.ts * 0.2 + i * v.ts * 0.18, v.ts * (0.5 - a * 0.1), v.ts * 0.1, 0.3 * Math.sin(a * 6 + i), 0, Math.PI * 2); g.stroke(); }
    g.globalAlpha = 1;
  };
  // 暗い霧（ミストバーン）
  FX.draw.darkfog = function (g, f, a, v) {
    const x = cx(v, f.x), y = cy(v, f.y);
    for (let i = 0; i < FX.n(8); i++) {
      const t = rnd(f.seed, i) * Math.PI * 2, r = v.ts * 1.6 * ease(a) * (0.4 + rnd(f.seed, i + 3));
      g.globalAlpha = 0.35 * (1 - a); g.fillStyle = '#3a2a5a';
      g.beginPath(); g.arc(x + Math.cos(t) * r, y + Math.sin(t) * r * 0.6, v.ts * 0.4, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  };
  // 炎の帯（バーンの火の鳥・滅びの炎）：予告の列にそって炎が走る
  FX.draw.flamewave = function (g, f, a, v) {
    const n = f.tiles.length;
    for (const [i, t] of f.tiles.entries()) {
      const on = Math.min(1, Math.max(0, a * 2.2 - i / Math.max(1, n) * 0.8));
      if (!on) continue;
      const x = v.ox + t.x * v.ts, y = v.oy + t.y * v.ts;
      g.globalAlpha = 0.6 * on * (1 - a); g.fillStyle = f.color || '#ff6a20'; g.fillRect(x + v.k, y + v.k, v.ts - 2 * v.k, v.ts - 2 * v.k);
      g.globalAlpha = (1 - a); g.fillStyle = '#ffd860';
      g.beginPath(); g.moveTo(x + v.ts * 0.5, y + v.ts * (0.1 + 0.2 * rnd(f.seed, i))); g.lineTo(x + v.ts * 0.8, y + v.ts * 0.85); g.lineTo(x + v.ts * 0.2, y + v.ts * 0.85); g.fill();
    }
    g.globalAlpha = 1;
  };

  TS.FX = FX;
})(globalThis.TS = globalThis.TS || {});
