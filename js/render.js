/* 描画（ダンジョンと村）。ゲームの状態は読むだけで変更しない。
 * 地形は「探索済みになったマスだけ」を1枚のキャンバスに描きためて使い回し、
 * 毎フレームは見える範囲を1回転送＋キャラ・動くものだけを描く（スマホで軽く）。 */
(function (TS) {
  'use strict';
  const D = TS.Data, G = TS.Game, DG = TS.Dungeon, SP = TS.Sprites;
  const RD = { fx: [], lastMove: 0 };
  const TILE = 32;

  RD.addFx = function (f) { f.t0 = performance.now(); RD.fx.push(f); };
  RD.noteMove = function () { RD.lastMove = performance.now(); };

  function fit(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    return { g, W: w, H: h, dpr };
  }

  // ---------------- 地形のキャッシュ ----------------
  let layer = null;
  function getLayer(run) {
    const key = run.seed + ':' + run.floor + ':' + run.map.w + 'x' + run.map.h;
    if (!layer || layer.key !== key || layer.map !== run.map) {
      const c = document.createElement('canvas');
      c.width = run.map.w * TILE; c.height = run.map.h * TILE;
      layer = { key, map: run.map, canvas: c, g: c.getContext('2d'), drawn: new Uint8Array(run.map.w * run.map.h), torches: [] };
      layer.g.imageSmoothingEnabled = false;
    }
    return layer;
  }
  RD.resetLayer = () => { layer = null; };
  function known(run, x, y) {
    const m = run.map, i = y * m.w + x;
    if (run.explored[i]) return true;
    if (m.tiles[i] !== DG.WALL) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < m.w && ny < m.h && run.explored[ny * m.w + nx] && m.tiles[ny * m.w + nx] !== DG.WALL) return true;
    }
    return false;
  }
  function paintTile(run, L, x, y) {
    const m = run.map, i = y * m.w + x, theme = D.FLOORS[run.floor].theme, T = SP.tiles[theme], h = SP.hash(x, y, run.floor);
    let img;
    if (m.tiles[i] === DG.WALL) {
      const below = y + 1 < m.h && m.tiles[i + m.w] !== DG.WALL;
      img = below ? T.face[h % 4] : T.top[h % 4];
      if (below && h % 9 === 0 && ['brick', 'roots', 'orb', 'gold', 'shrine', 'garden'].includes(theme)) L.torches.push({ x, y });
    } else img = T.floor[h % 6];
    L.g.drawImage(img, x * TILE, y * TILE);
    L.drawn[i] = 1;
  }

  // ---------------- ダンジョン ----------------
  RD.drawDungeon = function (canvas, S, now) {
    const run = S.run;
    const { g, W, H, dpr } = fit(canvas);
    const theme = D.FLOORS[run.floor].theme;
    const TH = SP.themeColors[theme];
    g.fillStyle = TH.bg; g.fillRect(0, 0, W, H);
    const k = Math.max(1, Math.floor(Math.min(W / 9.5, H / 9) / TILE));
    const ts = TILE * k;
    const m = run.map, p = run.player;
    const ox = Math.round(W / 2 - (p.x + 0.5) * ts), oy = Math.round(H / 2 - (p.y + 0.5) * ts);
    const x0 = Math.max(0, Math.floor(-ox / ts)), x1 = Math.min(m.w - 1, Math.ceil((W - ox) / ts));
    const y0 = Math.max(0, Math.floor(-oy / ts)), y1 = Math.min(m.h - 1, Math.ceil((H - oy) / ts));
    const L = getLayer(run);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!L.drawn[y * m.w + x] && known(run, x, y)) paintTile(run, L, x, y);
    // 見える範囲を1回で転送
    g.drawImage(L.canvas, x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE, ox + x0 * ts, oy + y0 * ts, (x1 - x0 + 1) * ts, (y1 - y0 + 1) * ts);
    // 動く地形：たいまつ・階段・帰還の碑・帰還口
    const fr = (ms, n) => Math.floor(now / ms) % n;
    for (const t of L.torches) if (t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1) g.drawImage(SP.tiles[theme].torch[(fr(160, 3) + t.x) % 3], ox + t.x * ts, oy + t.y * ts, ts, ts);
    const special = (pos, img) => { if (pos && run.explored[pos.y * m.w + pos.x]) g.drawImage(img, ox + pos.x * ts, oy + pos.y * ts, ts, ts); };
    special(run.stairs, SP.tiles.stairs);
    special(run.returnPoint, SP.tiles.returnPoint[fr(600, 2)]);
    if (run.portal) special(run.portal, SP.tiles.portal[fr(180, 3)]);
    // 道具（お宝は宝箱、ほかはアイコン。少し浮かせて背景から目立たせる）
    for (const f of run.floorItems) {
      if (!run.explored[f.y * m.w + f.x]) continue;
      const sx = ox + f.x * ts, sy = oy + f.y * ts;
      if (f.item && G.def(f.item).type === 'treasure') { g.drawImage(SP.tiles.chest[(fr(450, 4) + f.x) % 4 === 0 ? 1 : 0], sx, sy, ts, ts); continue; }
      const img = f.gold ? SP.s.icon.gold : SP.iconFor(G.def(f.item));
      const sz = Math.round(ts * 0.62), pad = Math.round((ts - sz) / 2);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath(); g.ellipse(sx + ts / 2, sy + ts * 0.82, ts * 0.26, ts * 0.08, 0, 0, Math.PI * 2); g.fill();
      g.drawImage(img, sx + pad, sy + pad - Math.round(k * fr(500, 2)), sz, sz);
    }
    // 見えていない探索済みの場所は暗く
    g.fillStyle = 'rgba(4,2,10,0.52)';
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (L.drawn[y * m.w + x] && !G.isVisible(run, x, y)) g.fillRect(ox + x * ts, oy + y * ts, ts, ts);
    }
    // 予告攻撃の範囲（赤く点滅）
    const pulse = 0.32 + 0.25 * Math.sin(now / 120);
    for (const e of run.enemies) {
      if (!e.charge || !G.isVisible(run, e.x, e.y)) continue;
      g.fillStyle = `rgba(255,40,40,${pulse})`;
      for (const t of e.charge.tiles) g.fillRect(ox + t.x * ts + k, oy + t.y * ts + k, ts - 2 * k, ts - 2 * k);
      g.strokeStyle = 'rgba(255,220,220,0.9)'; g.lineWidth = k;
      for (const t of e.charge.tiles) g.strokeRect(ox + t.x * ts + 1.5 * k, oy + t.y * ts + 1.5 * k, ts - 3 * k, ts - 3 * k);
    }
    const shadow = (cx, cy, rw) => { g.fillStyle = 'rgba(0,0,0,0.38)'; g.beginPath(); g.ellipse(cx, cy, rw, rw * 0.32, 0, 0, Math.PI * 2); g.fill(); };
    // 敵
    for (const e of run.enemies) {
      if (!G.isVisible(run, e.x, e.y)) continue;
      let sx = ox + e.x * ts, sy = oy + e.y * ts;
      const l = lungeOffset(e.id, now, ts);
      sx += l[0]; sy += l[1];
      const frames = SP.enemyFrames(D.ENEMIES[e.type].sprite);
      const img = frames[e.sleep ? 0 : (Math.floor(now / (D.ENEMIES[e.type].ai === 'fast' ? 160 : 420) + e.id) % frames.length)];
      const hit = hitFx(e.x, e.y, 'enemy', now);
      const big = img.width / TILE;
      const dw = ts * big;
      shadow(sx + ts / 2, sy + ts * 0.9, ts * 0.32 * big);
      const shake = hit ? Math.round(Math.sin(now / 20) * k * 2) : 0;
      g.drawImage(img, sx + (ts - dw) / 2 + shake, sy + ts - dw, dw, dw);
      if (hit) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.6; g.drawImage(img, sx + (ts - dw) / 2 + shake, sy + ts - dw, dw, dw); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
      if (e.charge) badge(g, '！', sx + ts / 2, sy + ts - dw - ts * 0.05, ts, k, '#ff5050', '#400');
      else if (e.rest > 0) { g.font = `bold ${Math.round(ts * 0.3)}px sans-serif`; g.fillStyle = '#bde0ff'; g.fillText('…', sx + ts * 0.65, sy + ts * 0.2); }
      if (e.slow > 0) { g.fillStyle = '#c8b8ff'; g.font = `bold ${Math.round(ts * 0.26)}px sans-serif`; g.fillText('鈍', sx + k, sy + ts * 0.3); }
      if (e.sleep > 0) {
        g.fillStyle = '#ffffff'; g.font = `bold ${Math.round(ts * 0.35)}px sans-serif`;
        g.fillText('z', sx + ts * 0.72, sy + ts * 0.25 - (Math.floor(now / 500) % 2) * k * 2);
      }
      if (e.hp < e.maxhp && !e.boss) {
        g.fillStyle = '#000'; g.fillRect(sx + 2 * k, sy + ts - 3 * k, ts - 4 * k, 3 * k);
        g.fillStyle = '#ff5050'; g.fillRect(sx + 2 * k, sy + ts - 3 * k, Math.max(1, (ts - 4 * k) * e.hp / e.maxhp), 2 * k);
      }
    }
    // たけ（歩くと足踏み、攻撃でポーズ、ダメージで揺れる）
    {
      const l = lungeOffset('p', now, ts);
      const set = SP.s.take[G.faceOf(p.dir)] || SP.s.take.down;
      const attacking = RD.fx.some((f) => f.t === 'lunge' && f.id === 'p' && now - f.t0 < 180);
      const walking = now - RD.lastMove < 260;
      const img = attacking ? set.atk : set.walk[walking ? (Math.floor(now / 85) % 4) : (Math.floor(now / 600) % 2 ? 0 : 2)];
      const hurt = hitFx(p.x, p.y, 'player', now);
      const sx = ox + p.x * ts + l[0] + (hurt ? Math.round(Math.sin(now / 18) * k * 2) : 0), sy = oy + p.y * ts + l[1];
      shadow(sx + ts / 2, sy + ts * 0.92, ts * 0.3);
      g.drawImage(img, sx, sy, ts, ts);
      if (hurt) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.55; g.drawImage(img, sx, sy, ts, ts); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
      if (p.poison) { g.fillStyle = '#c070ff'; g.fillRect(sx + ts * 0.8, sy + ts * 0.1 + (fr(300, 2) ? k : 0), 3 * k, 3 * k); }
      // 向きの小さな矢印
      let [dx, dy] = G.DIRS[p.dir];
      const len = Math.hypot(dx, dy); dx /= len; dy /= len;
      g.fillStyle = 'rgba(255,255,255,0.85)';
      const cx = ox + p.x * ts + ts / 2 + dx * ts * 0.56, cy = oy + p.y * ts + ts / 2 + dy * ts * 0.56;
      g.beginPath();
      g.moveTo(cx + dx * 3 * k, cy + dy * 3 * k);
      g.lineTo(cx - dy * 2.5 * k - dx * 1.5 * k, cy + dx * 2.5 * k - dy * 1.5 * k);
      g.lineTo(cx + dy * 2.5 * k - dx * 1.5 * k, cy - dx * 2.5 * k - dy * 1.5 * k);
      g.fill();
    }
    drawFx(g, now, ox, oy, ts, k);
    // ボスのHP
    const boss = run.enemies.find((e) => e.boss && G.isVisible(run, e.x, e.y));
    if (boss) {
      const bw = W * 0.6, bx = (W - bw) / 2, by = H - 14 * dpr;
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(bx - 2 * dpr, by - 16 * dpr, bw + 4 * dpr, 26 * dpr);
      g.fillStyle = '#fff'; g.font = `bold ${11 * dpr}px sans-serif`; g.textAlign = 'center';
      g.fillText(D.ENEMIES[boss.type].name, W / 2, by - 4 * dpr); g.textAlign = 'left';
      g.fillStyle = '#400'; g.fillRect(bx, by, bw, 6 * dpr);
      g.fillStyle = '#ff6a3a'; g.fillRect(bx, by, bw * Math.max(0, boss.hp) / boss.maxhp, 6 * dpr);
    }
    if (S.settings.minimap) drawMinimap(g, run, W, H, dpr, S.settings.minimap === 2);
  };

  function badge(g, text, x, y, ts, k, col, stroke) {
    g.font = `bold ${Math.round(ts * 0.5)}px sans-serif`; g.textAlign = 'center';
    g.lineWidth = k * 2; g.strokeStyle = stroke; g.strokeText(text, x, y);
    g.fillStyle = col; g.fillText(text, x, y); g.textAlign = 'left';
  }
  function hitFx(x, y, target, now) {
    return RD.fx.some((f) => f.t === 'flash' && f.target === target && (target === 'player' || (f.x === x && f.y === y)) && now - f.t0 < 220);
  }
  function lungeOffset(id, now, ts) {
    for (const f of RD.fx) {
      if (f.t !== 'lunge' || f.id !== id) continue;
      const a = (now - f.t0) / 140;
      if (a >= 1) continue;
      const s = Math.sin(a * Math.PI) * ts * 0.3;
      return [f.dx * s, f.dy * s];
    }
    return [0, 0];
  }

  function drawFx(g, now, ox, oy, ts, k) {
    RD.fx = RD.fx.filter((f) => now - f.t0 < (f.dur || 800));
    for (const f of RD.fx) {
      const a = (now - f.t0) / (f.dur || 800);
      if (f.t === 'num') {
        g.font = `bold ${Math.round(ts * 0.42)}px sans-serif`;
        g.textAlign = 'center';
        const x = ox + (f.x + 0.5) * ts, y = oy + f.y * ts + ts * 0.2 - a * ts * 0.5;
        g.lineWidth = k * 3; g.strokeStyle = '#000'; g.strokeText(f.text, x, y);
        g.fillStyle = f.color || '#fff'; g.fillText(f.text, x, y);
        g.textAlign = 'left';
      } else if (f.t === 'bolt') {
        g.globalAlpha = 1 - a;
        g.strokeStyle = '#fff36a'; g.lineWidth = k * 4;
        g.beginPath();
        g.moveTo(ox + (f.from.x + 0.5) * ts, oy + (f.from.y + 0.5) * ts);
        const n = 6;
        for (let i = 1; i <= n; i++) {
          const tx = f.from.x + (f.to.x - f.from.x) * i / n, ty = f.from.y + (f.to.y - f.from.y) * i / n;
          const j = (i < n) ? (Math.random() - 0.5) * ts * 0.4 : 0;
          g.lineTo(ox + (tx + 0.5) * ts + j, oy + (ty + 0.5) * ts + j);
        }
        g.stroke(); g.globalAlpha = 1;
      } else if (f.t === 'dart') {
        const x = f.from.x + (f.to.x - f.from.x) * Math.min(1, a * 2), y = f.from.y + (f.to.y - f.from.y) * Math.min(1, a * 2);
        if (a < 0.5) { g.fillStyle = f.color || '#f0e0b0'; g.fillRect(ox + (x + 0.5) * ts - 3 * k, oy + (y + 0.5) * ts - k, 6 * k, 3 * k); }
      } else if (f.t === 'sparkle') {
        g.fillStyle = f.color || '#9effa0';
        for (let i = 0; i < 8; i++) {
          const ang = i / 8 * Math.PI * 2 + a * 3;
          const r = ts * (0.2 + a * 0.4);
          g.globalAlpha = 1 - a;
          g.fillRect(ox + (f.x + 0.5) * ts + Math.cos(ang) * r - k, oy + (f.y + 0.5) * ts + Math.sin(ang) * r - a * ts * 0.3 - k, 3 * k, 3 * k);
        }
        g.globalAlpha = 1;
      } else if (f.t === 'blast') {
        g.globalAlpha = Math.max(0, 0.8 - a);
        g.fillStyle = '#ffd0a0';
        for (const t of f.tiles) g.fillRect(ox + t.x * ts, oy + t.y * ts, ts, ts);
        g.globalAlpha = 1;
      } else if (f.t === 'banner') {
        g.font = `bold ${Math.round(ts * 0.5)}px sans-serif`;
        g.textAlign = 'center';
        const x = ox + (f.x + 0.5) * ts, y = oy + f.y * ts - ts * 0.2 - a * ts * 0.4;
        g.globalAlpha = Math.min(1, 2 - a * 2);
        g.lineWidth = k * 3; g.strokeStyle = '#3a2000'; g.strokeText(f.text, x, y);
        g.fillStyle = f.color || '#ffe04a'; g.fillText(f.text, x, y);
        g.globalAlpha = 1; g.textAlign = 'left';
      }
    }
  }

  function drawMinimap(g, run, W, H, dpr, large) {
    const m = run.map;
    const c = large ? Math.floor(Math.min((W - 16 * dpr) / m.w, (H - 16 * dpr) / m.h)) : Math.max(2, Math.floor(Math.min(W * 0.4 / m.w, H * 0.3 / m.h)));
    const mw = m.w * c, mh = m.h * c;
    const x0 = large ? Math.round((W - mw) / 2) : 6 * dpr, y0 = large ? Math.round((H - mh) / 2) : 6 * dpr;
    g.fillStyle = large ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.35)';
    g.fillRect(x0 - 3 * dpr, y0 - 3 * dpr, mw + 6 * dpr, mh + 6 * dpr);
    g.fillStyle = 'rgba(160,220,255,0.55)';
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const i = y * m.w + x;
      if (run.explored[i] && m.tiles[i] !== DG.WALL) g.fillRect(x0 + x * c, y0 + y * c, c, c);
    }
    const dot = (pos, col, s) => { if (!pos) return; g.fillStyle = col; g.fillRect(x0 + pos.x * c - (s - 1) * c / 2, y0 + pos.y * c - (s - 1) * c / 2, c * s, c * s); };
    if (run.stairs && run.explored[run.stairs.y * m.w + run.stairs.x]) dot(run.stairs, '#ffffff', 1.6);
    if (run.returnPoint && run.explored[run.returnPoint.y * m.w + run.returnPoint.x]) dot(run.returnPoint, '#6ae0ff', 1.6);
    if (run.portal) dot(run.portal, '#ffd84a', 1.8);
    for (const f of run.floorItems) if (run.explored[f.y * m.w + f.x]) dot(f, '#7cff7c', 1);
    for (const e of run.enemies) if (G.isVisible(run, e.x, e.y)) dot(e, '#ff4a4a', 1.2);
    dot(run.player, '#ffd84a', 1.6);
  }

  // ---------------- 村 ----------------
  RD.VW = 384; RD.VH = 256;
  let vcache = null;
  RD.villageLevels = function (V) {
    return {
      stage: V.stage,
      storage: V.storageLv || (V.stage >= 2 ? 2 : 1),
      smith: V.smithLv !== undefined ? V.smithLv : (V.stage >= 3 ? 1 : 0),
      diner: !!V.diner, museum: !!V.museum, decor: Object.assign({}, V.decor || {}),
      donated: Object.keys(V.donated || {}).length, cleared: !!V.cleared, legacy: !!V.legacyClear10,
    };
  };
  // 村の動かない部分を1枚に描く（村の状態が変わったときだけ）
  function paintVillage(lv) {
    const P = new SP.Pix(RD.VW, RD.VH), R = SP.ramp;
    const night = lv.stage >= 3 || lv.decor.lanterns;
    // 空（発展すると夕暮れが深まり灯りが映える）
    const top = night ? '#3a3070' : '#6a9ae0', bottom = night ? '#ff9a5a' : '#ffd8a0';
    for (let y = 0; y < 76; y++) for (let x = 0; x < RD.VW; x++) {
      const t = y / 76 + ((SP.hash(x >> 1, y >> 1, 1) & 3) - 1.5) * 0.012;
      P.set(x, y, SP.mix(top, bottom, Math.max(0, Math.min(1, t))));
    }
    P.ball(300, 26, 13, 13, R(night ? '#ffb060' : '#fff0c0'), { dither: false });
    // 遠くの遺跡（プラーン塔のシルエット）
    const prang = (x, h, c) => {
      const col = (xx, yy) => SP.mix(c, top, 0.15 + (yy % 3 === 0 ? 0.05 : 0));
      P.poly([[x, 76], [x + 3, 76 - h], [x + 9, 76 - h - 14], [x + 12, 76 - h - 26], [x + 15, 76 - h - 14], [x + 21, 76 - h], [x + 24, 76]], col);
      for (let yy = 76 - h; yy < 76; yy += 4) for (let xx = x + 3; xx < x + 21; xx++) P.set(xx, yy, SP.shade(c, -0.25));
    };
    prang(20, 22, '#a86a5a'); prang(52, 34, '#9a5a4a'); prang(84, 18, '#a86a5a'); prang(214, 16, '#b47a66'); prang(250, 26, '#a86a5a');
    // 木々
    const tree = (x, y, s) => { P.box(x - 2, y, 5, 12 * s, R('#6a4228')); P.ball(x, y - 4, 11 * s, 9 * s, R('#3f8a3a')); P.ball(x - 5, y - 8, 6 * s, 5 * s, R('#4fa046')); };
    tree(130, 66, 1); tree(196, 70, 0.9); tree(372, 66, 1.1);
    // 地面（草）
    for (let y = 76; y < 200; y++) for (let x = 0; x < RD.VW; x++) {
      const n = SP.hash(x >> 2, y >> 2, 3) & 7;
      P.set(x, y, R('#8cbc5a')[P.idx(1.6 + n * 0.12 + (y - 76) / 260, x, y)]);
    }
    for (let i = 0; i < 70; i++) { const x = SP.hash(i, 1, 9) % RD.VW, y = 80 + SP.hash(i, 2, 9) % 110; P.set(x, y, '#6a9a3a'); P.set(x + 1, y - 1, '#7aac48'); }
    // 道（レンガ）
    for (let y = 152; y < 174; y++) for (let x = 0; x < RD.VW; x++) {
      const row = Math.floor((y - 152) / 5), off = row % 2 ? 6 : 0;
      const edge = (y - 152) % 5 === 0 || (x + off) % 12 === 0;
      P.set(x, y, edge ? '#a87850' : R('#d8a878')[P.idx(1.4 + (SP.hash((x + off) / 12 | 0, row, 4) & 3) * 0.25, x, y)]);
    }
    // 水路
    P.rect(0, 198, RD.VW, 4, '#7a5a3a');
    for (let y = 202; y < RD.VH; y++) for (let x = 0; x < RD.VW; x++) P.set(x, y, R('#3a8fc0')[P.idx(1.8 + (y - 202) / 50, x, y)]);
    const lotus = (x, y) => { P.ball(x, y + 3, 6, 2.5, R('#3a8a40')); P.ball(x, y, 2.5, 3, R('#ff8fb8')); };
    lotus(30, 226); lotus(80, 240); lotus(270, 222); lotus(340, 238);

    // ---- 施設 ----
    const label = [];
    // サイの店（村の段階で大きくなる）
    {
      const x = 10, y = lv.stage >= 2 ? 84 : 96, w = lv.stage >= 3 ? 84 : lv.stage >= 2 ? 76 : 64, h = 150 - y;
      P.box(x, y + 12, w, h - 12, R('#c88a5a'));
      P.rect(x + 3, y + 16, w - 6, h - 20, R('#e8b88a')[2]);
      for (let i = 0; i < Math.ceil(w / 10) + 1; i++) P.rect(x - 3 + i * 10, y, 10, 12, i % 2 ? '#f6f0e6' : '#e24a4a');
      P.rect(x - 3, y + 11, w + 6, 2, '#8a3a2a');
      P.rect(x + 6, y + h - 20, w - 12, 6, R('#8a5a3a')[2]);
      [['#ffe04a', 10], ['#4caf50', 20], ['#c8943c', 30], ['#e24a4a', 42], ['#9ae8ff', 52]].slice(0, lv.stage + 2).forEach(([c, dx]) => P.ball(x + dx, y + h - 24, 3, 3, R(c)));
      if (lv.stage >= 2) P.box(x + w / 2 - 16, y - 12, 32, 11, R('#7a4a24'));
      label.push(['サイの店', x + w / 2, 156]);
    }
    // サイの食堂
    if (lv.diner) {
      const x = 104, y = 98;
      P.box(x, y + 10, 64, 42, R('#d8b080'));
      P.poly([[x - 4, y + 12], [x + 32, y - 4], [x + 68, y + 12]], (xx, yy) => R('#b8402a')[P.idx(1 + (yy - y + 4) / 14, xx, yy)]);
      P.rect(x + 8, y + 22, 14, 12, '#ffe8a0'); P.rect(x + 42, y + 22, 14, 12, '#ffe8a0');
      P.rect(x + 26, y + 30, 12, 22, R('#6a3a1a')[2]);
      label.push(['サイの食堂', x + 32, 156]);
    } else lot(P, 136, 126, label);
    // 倉庫（段階で大きく）
    {
      const sizes = [null, [40, 34], [52, 44], [60, 56], [70, 66]];
      const [w, h] = sizes[lv.storage];
      const x = 214 - w / 2 + 6, y = 150 - h - 8;
      P.box(x + 3, y + h - 2, 4, 10, R('#5a3a20')); P.box(x + w - 7, y + h - 2, 4, 10, R('#5a3a20'));
      for (let yy = y + 10; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) P.set(xx, yy, (xx - x) % 6 === 0 ? '#6a4020' : R('#a0683a')[P.idx(1.6 + (xx - x) / w * 1.2, xx, yy)]);
      P.poly([[x - 5, y + 11], [x + w / 2, y - 6], [x + w + 5, y + 11]], (xx, yy) => R('#6a3a1a')[P.idx(1 + (yy - y + 6) / 18, xx, yy)]);
      P.rect(x + w / 2 - 5, y + h - 16, 10, 16, '#3a2010');
      if (lv.storage >= 3) { P.rect(x + 6, y + 16, 10, 8, '#ffe8a0'); P.rect(x + w - 16, y + 16, 10, 8, '#ffe8a0'); }
      if (lv.storage >= 4) P.rect(x + 8, y - 2, w - 16, 2, '#ffd84a');
      label.push(['倉庫', x + w / 2, 156]);
    }
    // 鍛冶屋
    if (lv.smith > 0) {
      const x = 262, w = 52 + lv.smith * 6, y = 104 - lv.smith * 4;
      P.box(x, y + 10, w, 150 - y - 10, R('#7a7a84'));
      P.rect(x - 3, y + 4, w + 6, 8, R('#3a3a44')[2]);
      P.rect(x + 6, y + 22, 16, 150 - y - 22, '#2a1a10'); P.ball(x + 14, y + 36, 5, 5, R('#ff7a20'));
      P.box(x + w - 18, y - 14, 8, 20, R('#4a4a52'));
      P.box(x + 28, 140, 14, 5, R('#3a3a3a')); P.box(x + 31, 145, 8, 5, R('#3a3a3a'));
      if (lv.smith >= 3) { P.box(x + w - 30, y - 10, 7, 16, R('#4a4a52')); P.rect(x + 26, y + 14, 20, 6, '#ffd84a'); }
      label.push(['鍛冶屋', x + w / 2, 156]);
    } else lot(P, 290, 126, label);
    // お宝展示室
    if (lv.museum) {
      const x = 334, y = 88;
      P.rect(x - 4, y + 54, 50, 8, R('#e8e0d0')[2]);
      P.poly([[x - 4, y + 12], [x + 21, y - 4], [x + 46, y + 12]], (xx, yy) => R('#d8c8b0')[P.idx(0.8 + (yy - y + 4) / 16, xx, yy)]);
      for (let i = 0; i < 4; i++) P.box(x + i * 12, y + 12, 5, 42, R('#f4efe6'));
      P.rect(x + 6, y + 26, 30, 14, '#3a2a40');
      const n = Math.min(5, lv.donated);
      for (let i = 0; i < n; i++) P.ball(x + 10 + i * 5.5, y + 33, 2, 2, R(['#ffd84a', '#4fc08a', '#e8902a', '#9ae8ff', '#c8a0ff'][i]));
      label.push(['展示室', x + 21, 156]);
    } else lot(P, 354, 126, label);
    // ---- 飾り ----
    if (lv.decor.garden) {
      for (let i = 0; i < 9; i++) { const x = 8 + i * 11, y = 184 + (i % 2) * 4; P.ball(x, y, 4, 3, R('#3a8a40')); P.ball(x, y - 2, 2, 2, R(['#ff8fb8', '#ffe04a', '#ffffff'][i % 3])); }
      lotus(110, 230); lotus(150, 246); lotus(200, 216);
    }
    if (lv.decor.stalls) {
      for (let i = 0; i < 4; i++) {
        const x = 236 + i * 36, y = 176;
        P.box(x, y + 6, 28, 14, R('#b07a45'));
        for (let j = 0; j < 4; j++) P.rect(x - 2 + j * 8, y, 8, 7, (i + j) % 2 ? '#ffffff' : ['#2e8b88', '#e24a4a', '#f2c230', '#8a4ac0'][i]);
        P.ball(x + 8, y + 10, 2.5, 2, R('#ffffff')); P.ball(x + 18, y + 10, 2.5, 2, R('#e8902a'));
      }
    }
    if (lv.decor.bridge) {
      const x = 170, w = 56;
      for (let xx = x; xx < x + w; xx++) { const a = Math.sin((xx - x) / w * Math.PI) * 8; for (let yy = 0; yy < 7; yy++) P.set(xx, Math.round(212 - a + yy), R('#c0402a')[P.idx(1.2 + yy / 4, xx, yy)]); }
      for (let xx = x + 4; xx < x + w; xx += 8) { const a = Math.sin((xx - x) / w * Math.PI) * 8; P.rect(xx, Math.round(204 - a), 2, 9, '#8a2a1a'); }
    }
    if (lv.decor.statue) {
      const x = 120, y = 176; P.box(x, y + 12, 22, 8, R('#c8c0b0'));
      P.ball(x + 11, y + 6, 9, 7, R('#e8e0d0')); P.ball(x + 3, y + 4, 4, 5, R('#e8e0d0')); P.line(x + 1, y + 6, x + 1, y + 13, '#c8c0b0');
    }
    if (lv.decor.fountain) {
      const x = 196, y = 182; P.ball(x, y + 6, 16, 6, R('#c8c0b0')); P.ball(x, y + 5, 12, 4, R('#5ab0e0')); P.box(x - 2, y - 8, 5, 12, R('#e8e0d0'));
    }
    if (lv.decor.gate) { // 遺跡へ続く黄金の門（地平線の近く）
      const x = 104, y = 50; const G2 = R('#ffd84a');
      P.box(x, y + 8, 5, 22, G2); P.box(x + 26, y + 8, 5, 22, G2);
      P.poly([[x - 3, y + 9], [x + 15, y - 6], [x + 34, y + 9]], (xx, yy) => G2[P.idx(0.8 + (yy - y + 6) / 16, xx, yy)]);
      P.rect(x + 5, y + 10, 21, 2, G2[3]);
    }
    if (lv.legacy) { // 旧記録：10階踏破の記念の獅子像
      const x = 148, y = 172; P.box(x, y + 16, 14, 6, R('#c8c0b0')); P.ball(x + 7, y + 9, 6, 7, R('#f2c84b')); P.ball(x + 7, y + 6, 4, 4, R('#d0602a'));
    }
    if (lv.cleared) { // 宝珠の祠
      const x = 160, y = 40; P.box(x - 10, y + 16, 20, 14, R('#e8e0d0')); P.poly([[x - 14, y + 17], [x, y + 6], [x + 14, y + 17]], R('#c0402a')[2]);
    }
    P.outline(0.7);
    return { canvas: P.canvas(), label };
  }
  function lot(P, x, y, label) {
    const R = SP.ramp;
    P.box(x - 1, y, 3, 18, R('#6a4228')); P.box(x - 12, y - 6, 24, 10, R('#d8b080'));
    P.rect(x - 9, y - 3, 18, 1, '#6a4228'); P.rect(x - 9, y, 12, 1, '#6a4228');
    label.push(['空き地', x, 156]);
  }

  /* 村の絵を描き、施設のタップ範囲を返す */
  RD.drawVillage = function (canvas, V, now) {
    const { g, W, H } = fit(canvas);
    const lv = RD.villageLevels(V);
    const key = JSON.stringify(lv);
    if (!vcache || vcache.key !== key) vcache = Object.assign({ key }, paintVillage(lv));
    const sc = Math.min(W / RD.VW, H / RD.VH);
    const s = sc;
    const ox = Math.round((W - RD.VW * s) / 2), oy = Math.round((H - RD.VH * s) / 2);
    const night = lv.stage >= 3 || lv.decor.lanterns;
    g.fillStyle = night ? '#3a3070' : '#6a9ae0'; g.fillRect(0, 0, W, oy + 1);
    g.fillStyle = '#2f80b4'; g.fillRect(0, oy + RD.VH * s - 1, W, H);
    g.fillStyle = '#8cbc5a';
    if (ox > 0) { g.fillRect(0, oy, ox + 1, RD.VH * s); g.fillRect(ox + RD.VW * s - 1, oy, W, RD.VH * s); }
    g.drawImage(vcache.canvas, ox, oy, RD.VW * s, RD.VH * s);
    g.save(); g.translate(ox, oy); g.scale(s, s);
    // 水面のきらめき
    g.fillStyle = 'rgba(200,240,255,0.7)';
    for (let i = 0; i < 18; i++) g.fillRect((i * 53 + Math.floor(now / 90)) % RD.VW, 206 + (i * 17) % 46, 6, 1);
    // 小舟
    const bx = 120 + Math.sin(now / 1800) * 30;
    g.fillStyle = '#6a4228'; g.fillRect(bx, 228, 30, 5); g.fillStyle = '#4a2e18'; g.fillRect(bx + 3, 233, 24, 2);
    g.fillStyle = '#f2c84b'; g.fillRect(bx + 10, 218, 10, 6);
    // 灯り（発展・灯籠で増える）
    const lamps = [[56, 150]];
    if (lv.stage >= 2) lamps.push([100, 150], [250, 150]);
    if (lv.stage >= 3) lamps.push([4, 150], [330, 150], [380, 150]);
    if (lv.decor.lanterns) for (let x = 20; x < RD.VW; x += 44) lamps.push([x, 176]);
    for (const [lx, ly] of lamps) {
      g.fillStyle = '#4a3020'; g.fillRect(lx, ly - 14, 2, 16);
      const fl = 0.75 + 0.25 * Math.sin(now / 280 + lx);
      g.globalAlpha = (night ? 0.4 : 0.22) * fl; g.fillStyle = '#ffd070'; g.beginPath(); g.arc(lx + 1, ly - 16, 10, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      g.fillStyle = '#ff8a3a'; g.fillRect(lx - 2, ly - 19, 6, 6); g.fillStyle = '#ffe08a'; g.fillRect(lx - 1, ly - 18, 4, 4);
    }
    if (lv.stage >= 2 || lv.decor.lanterns) { // 吊り提灯
      g.fillStyle = 'rgba(60,40,20,0.6)'; g.fillRect(8, 80, 368, 1);
      for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#ff6a6a' : '#ffd070'; g.fillRect(14 + i * 31, 81 + (i % 2), 4, 5); }
    }
    // 鍛冶屋の煙
    if (lv.smith > 0) { const sm = (now / 60) % 30; g.fillStyle = 'rgba(220,220,230,0.5)'; g.fillRect(262 + 52 + lv.smith * 6 - 16, 100 - lv.smith * 4 - 16 - sm, 6, 6); }
    if (lv.decor.fountain) { g.fillStyle = 'rgba(200,240,255,0.8)'; const jy = Math.floor(now / 120) % 4; g.fillRect(195, 168 + jy, 2, 4); g.fillRect(191, 172 - jy, 2, 3); g.fillRect(199, 171 + jy % 2, 2, 3); }
    // 宝珠の光
    if (lv.cleared) {
      const gl = 0.6 + 0.4 * Math.sin(now / 400);
      g.globalAlpha = gl * 0.5; g.fillStyle = '#e8c8ff'; g.beginPath(); g.arc(160, 48, 12, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      g.drawImage(SP.s.icon.orb, 152, 38, 16, 16);
    }
    // たけとサイ
    g.drawImage(SP.s.sai[Math.floor(now / 1700) % 6 === 0 ? 1 : 0], 54, 120, 32, 32);
    g.drawImage(SP.s.take.down.walk[Math.floor(now / 600) % 2 ? 0 : 2], 84, 126, 32, 32);
    // 名札
    g.font = 'bold 10px sans-serif'; g.textAlign = 'center';
    for (const [t, x, y] of vcache.label) {
      const w = g.measureText(t).width + 8;
      g.fillStyle = 'rgba(40,20,10,0.78)'; g.fillRect(Math.round(x - w / 2), y - 10, Math.round(w), 13);
      g.fillStyle = '#fff6dc'; g.fillText(t, x, y);
    }
    g.textAlign = 'left';
    g.restore();
    // タップ範囲
    const hits = [
      { id: 'shop', x: 6, y: 80, w: 90, h: 78 },
      { id: lv.diner ? 'diner' : 'develop', x: 100, y: 92, w: 70, h: 64 },
      { id: 'storage', x: 172, y: 60, w: 84, h: 98 },
      { id: lv.smith ? 'smith' : 'develop', x: 258, y: 80, w: 70, h: 78 },
      { id: lv.museum ? 'museum' : 'develop', x: 328, y: 80, w: 56, h: 78 },
      { id: 'depart', x: 80, y: 120, w: 36, h: 40 },
    ];
    const cw = W / canvas.clientWidth;
    return hits.map((h) => ({ id: h.id, x: (ox + h.x * s) / cw, y: (oy + h.y * s) / cw, w: h.w * s / cw, h: h.h * s / cw }));
  };

  TS.Render = RD;
})(globalThis.TS = globalThis.TS || {});
