/* 描画（ダンジョンと村）。ゲームの状態は読むだけで変更しない。 */
(function (TS) {
  'use strict';
  const D = TS.Data, G = TS.Game, DG = TS.Dungeon, SP = TS.Sprites;
  const RD = { fx: [] };

  RD.addFx = function (f) { f.t0 = performance.now(); RD.fx.push(f); };

  function fit(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    return { g, W: w, H: h, dpr };
  }

  // ---------------- ダンジョン ----------------
  RD.drawDungeon = function (canvas, S, now) {
    const run = S.run;
    const { g, W, H, dpr } = fit(canvas);
    const theme = D.FLOORS[run.floor].theme;
    const TL = SP.tiles[theme], C = SP.themeColors[theme];
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    const k = Math.max(2, Math.floor(Math.min(W / 9, H / 9) / 16));
    const ts = 16 * k;
    const m = run.map, p = run.player;
    const ox = Math.round(W / 2 - (p.x + 0.5) * ts), oy = Math.round(H / 2 - (p.y + 0.5) * ts);
    const x0 = Math.max(0, Math.floor(-ox / ts)), x1 = Math.min(m.w - 1, Math.ceil((W - ox) / ts));
    const y0 = Math.max(0, Math.floor(-oy / ts)), y1 = Math.min(m.h - 1, Math.ceil((H - oy) / ts));
    const hash = SP.tiles.hash;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * m.w + x;
        if (!run.explored[i] && !nearExplored(run, x, y)) continue;
        const sx = ox + x * ts, sy = oy + y * ts;
        const t = m.tiles[i];
        let img;
        if (t === DG.WALL) {
          const below = y + 1 < m.h && m.tiles[i + m.w] !== DG.WALL;
          img = below ? TL.face[hash(x, y) % 3] : TL.top[hash(x, y) % 4];
        } else img = TL.floor[hash(x, y) % 4];
        g.drawImage(img, sx, sy, ts, ts);
      }
    }
    const special = (pos, img) => {
      if (pos && run.explored[pos.y * m.w + pos.x]) g.drawImage(img, ox + pos.x * ts, oy + pos.y * ts, ts, ts);
    };
    special(run.stairs, SP.tiles.stairs);
    special(run.returnPoint, SP.tiles.returnPoint);
    if (run.portal) {
      const pulse = 0.75 + 0.25 * Math.sin(now / 200);
      g.globalAlpha = pulse; special(run.portal, SP.tiles.portal); g.globalAlpha = 1;
    }
    // 道具
    for (const f of run.floorItems) {
      if (!run.explored[f.y * m.w + f.x]) continue;
      const img = f.gold ? SP.s.icon.gold : SP.iconFor(G.def(f.item));
      const pad = Math.round(ts * 0.12);
      g.drawImage(img, ox + f.x * ts + pad, oy + f.y * ts + pad, ts - pad * 2, ts - pad * 2);
    }
    // 見えていない探索済みの場所は暗く
    g.fillStyle = 'rgba(0,0,0,0.5)';
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * m.w + x;
      if (run.explored[i] && !G.isVisible(run, x, y)) g.fillRect(ox + x * ts, oy + y * ts, ts, ts);
    }
    // 敵
    const bob = (id) => (Math.floor(now / 400 + id) % 2) * k;
    for (const e of run.enemies) {
      if (!G.isVisible(run, e.x, e.y)) continue;
      let sx = ox + e.x * ts, sy = oy + e.y * ts;
      const l = lungeOffset(e.id, now, ts);
      sx += l[0]; sy += l[1];
      const img = SP.s.enemy[D.ENEMIES[e.type].sprite] || SP.s.enemy.lion;
      const flash = RD.fx.some((f) => f.t === 'flash' && f.x === e.x && f.y === e.y && now - f.t0 < 160);
      const big = e.boss ? Math.round(ts * 0.25) : 0;
      g.globalAlpha = flash ? 0.4 : 1;
      g.drawImage(img, sx - big, sy - big * 2 + (e.sleep ? 0 : bob(e.id)), ts + big * 2, ts + big * 2);
      g.globalAlpha = 1;
      if (e.sleep > 0) {
        g.fillStyle = '#ffffff'; g.font = `bold ${Math.round(ts * 0.35)}px sans-serif`;
        g.fillText('z', sx + ts * 0.72, sy + ts * 0.25 - (Math.floor(now / 500) % 2) * k * 2);
      }
      if (e.hp < e.maxhp && !e.boss) {
        g.fillStyle = '#000'; g.fillRect(sx + k, sy + ts - 3 * k, ts - 2 * k, 2 * k);
        g.fillStyle = '#ff5050'; g.fillRect(sx + k, sy + ts - 3 * k, Math.max(1, (ts - 2 * k) * e.hp / e.maxhp), 2 * k);
      }
    }
    // たけ
    {
      const l = lungeOffset('p', now, ts);
      const frames = SP.s.take[G.faceOf(p.dir)] || SP.s.take.down;
      const img = frames[Math.floor(now / 450) % frames.length];
      const hurt = RD.fx.some((f) => f.t === 'flash' && f.target === 'player' && now - f.t0 < 160);
      g.globalAlpha = hurt ? 0.45 : 1;
      g.drawImage(img, ox + p.x * ts + l[0], oy + p.y * ts + l[1], ts, ts);
      g.globalAlpha = 1;
      // 向きの小さな矢印
      let [dx, dy] = G.DIRS[p.dir];
      const len = Math.hypot(dx, dy); dx /= len; dy /= len;
      g.fillStyle = 'rgba(255,255,255,0.8)';
      const cx = ox + p.x * ts + ts / 2 + dx * ts * 0.55, cy = oy + p.y * ts + ts / 2 + dy * ts * 0.55;
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
      g.fillText('守護獅子', W / 2, by - 4 * dpr); g.textAlign = 'left';
      g.fillStyle = '#400'; g.fillRect(bx, by, bw, 6 * dpr);
      g.fillStyle = '#ff6a3a'; g.fillRect(bx, by, bw * Math.max(0, boss.hp) / boss.maxhp, 6 * dpr);
    }
    if (S.settings.minimap) drawMinimap(g, run, W, H, dpr, S.settings.minimap === 2);
  };

  function nearExplored(run, x, y) {
    // 探索済みの床に隣接する壁も描く
    const m = run.map;
    if (m.tiles[y * m.w + x] !== DG.WALL) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < m.w && ny < m.h && run.explored[ny * m.w + nx] && m.tiles[ny * m.w + nx] !== DG.WALL) return true;
    }
    return false;
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
        g.lineWidth = k * 1.5; g.strokeStyle = '#000'; g.strokeText(f.text, x, y);
        g.fillStyle = f.color || '#fff'; g.fillText(f.text, x, y);
        g.textAlign = 'left';
      } else if (f.t === 'bolt') {
        g.globalAlpha = 1 - a;
        g.strokeStyle = '#fff36a'; g.lineWidth = k * 3;
        g.beginPath();
        g.moveTo(ox + (f.from.x + 0.5) * ts, oy + (f.from.y + 0.5) * ts);
        const n = 6;
        for (let i = 1; i <= n; i++) {
          const tx = f.from.x + (f.to.x - f.from.x) * i / n, ty = f.from.y + (f.to.y - f.from.y) * i / n;
          const j = (i < n) ? (Math.random() - 0.5) * ts * 0.4 : 0;
          g.lineTo(ox + (tx + 0.5) * ts + (f.to.y !== f.from.y ? j : 0), oy + (ty + 0.5) * ts + (f.to.x !== f.from.x ? j : 0));
        }
        g.stroke(); g.globalAlpha = 1;
      } else if (f.t === 'dart') {
        const x = f.from.x + (f.to.x - f.from.x) * Math.min(1, a * 2), y = f.from.y + (f.to.y - f.from.y) * Math.min(1, a * 2);
        if (a < 0.5) { g.fillStyle = '#f0e0b0'; g.fillRect(ox + (x + 0.5) * ts - 2 * k, oy + (y + 0.5) * ts - k, 4 * k, 2 * k); }
      } else if (f.t === 'sparkle') {
        g.fillStyle = f.color || '#9effa0';
        for (let i = 0; i < 6; i++) {
          const ang = i / 6 * Math.PI * 2 + a * 3;
          const r = ts * (0.2 + a * 0.4);
          g.globalAlpha = 1 - a;
          g.fillRect(ox + (f.x + 0.5) * ts + Math.cos(ang) * r - k, oy + (f.y + 0.5) * ts + Math.sin(ang) * r - a * ts * 0.3 - k, 2 * k, 2 * k);
        }
        g.globalAlpha = 1;
      } else if (f.t === 'banner') {
        g.font = `bold ${Math.round(ts * 0.5)}px sans-serif`;
        g.textAlign = 'center';
        const x = ox + (f.x + 0.5) * ts, y = oy + f.y * ts - ts * 0.2 - a * ts * 0.4;
        g.globalAlpha = Math.min(1, 2 - a * 2);
        g.lineWidth = k * 2; g.strokeStyle = '#3a2000'; g.strokeText(f.text, x, y);
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
  /* 192x144（12x9タイル）の村の絵を描き、施設のタップ範囲を返す */
  RD.VW = 192; RD.VH = 144;
  RD.drawVillage = function (canvas, V, now) {
    const { g, W, H } = fit(canvas);
    const sc = Math.min(W / RD.VW, H / RD.VH);
    const ox = Math.round((W - RD.VW * sc) / 2), oy = Math.round((H - RD.VH * sc) / 2);
    // 絵の外側も空と水路の色で埋める
    g.fillStyle = V.stage >= 3 ? '#4a3a7a' : '#7aa8e0'; g.fillRect(0, 0, W, oy + 1);
    g.fillStyle = '#3a8fc0'; g.fillRect(0, oy + RD.VH * sc - 1, W, H);
    g.save();
    g.translate(ox, oy); g.scale(sc, sc);
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const st = V.stage;
    // 空（発展すると夕暮れが深まり灯りが映える）
    const sky = g.createLinearGradient(0, 0, 0, 48);
    sky.addColorStop(0, st >= 3 ? '#4a3a7a' : '#7aa8e0');
    sky.addColorStop(1, st >= 3 ? '#ff9a5a' : st >= 2 ? '#ffc890' : '#ffe0b0');
    g.fillStyle = sky; g.fillRect(0, 0, 192, 48);
    R(150, 10, 14, 14, st >= 3 ? '#ffb060' : '#fff0c0'); // 太陽
    // 遠くの遺跡（プラーン塔のシルエット）
    const prang = (x, h, c) => { R(x, 48 - h, 12, h, c); R(x + 2, 48 - h - 6, 8, 6, c); R(x + 4, 48 - h - 12, 4, 6, c); R(x + 5, 48 - h - 16, 2, 4, c); };
    prang(14, 16, '#a86a5a'); prang(34, 22, '#9a5a4a'); prang(54, 14, '#a86a5a');
    prang(110, 12, '#b47a66');
    // 木
    const tree = (x, y) => { R(x + 6, y + 10, 4, 8, '#6a4228'); R(x, y, 16, 12, '#3f8a3a'); R(x + 2, y - 3, 12, 4, '#4fa046'); R(x + 3, y + 2, 4, 3, '#6cc060'); };
    tree(78, 32); tree(172, 34);
    // 地面
    R(0, 48, 192, 64, '#9cc46a');
    for (let i = 0; i < 40; i++) R((i * 47) % 192, 50 + (i * 29) % 60, 2, 1, '#86b058');
    // 道（レンガ）
    R(0, 84, 192, 14, '#d8a878');
    for (let x = 0; x < 192; x += 8) { R(x, 84, 1, 14, '#b88858'); R(x + 4, 91, 1, 7, '#b88858'); }
    R(0, 91, 192, 1, '#b88858');
    // 水路
    R(0, 112, 192, 32, '#3a8fc0');
    for (let i = 0; i < 12; i++) R((i * 37 + Math.floor(now / 120)) % 192, 116 + (i * 13) % 24, 6, 1, '#7ac8e8');
    R(0, 110, 192, 3, '#8a6a4a');
    // 蓮
    const lotus = (x, y) => { R(x, y + 2, 8, 3, '#3a8a40'); R(x + 2, y, 4, 3, '#ff8fb8'); R(x + 3, y - 1, 2, 2, '#ffc0d8'); };
    lotus(20, 126); lotus(60, 132); lotus(140, 124); lotus(170, 134);
    // 小舟
    const bx = 95 + Math.sin(now / 1500) * 6;
    R(bx, 122, 22, 4, '#6a4228'); R(bx + 2, 126, 18, 2, '#4a2e18'); R(bx + 8, 114, 2, 8, '#6a4228'); R(bx + 4, 115, 8, 4, '#f2c84b');

    const hit = [];
    // サイのお店（屋根の張り出し付き）
    {
      const x = 8, y = 54;
      R(x, y + 8, 40, 24, '#c88a5a'); R(x + 2, y + 10, 36, 20, '#e8b88a');
      for (let i = 0; i < 5; i++) R(x - 2 + i * 9, y, 9, 8, i % 2 ? '#ffffff' : '#e24a4a');
      R(x - 2, y + 7, 44, 2, '#8a3a2a');
      R(x + 4, y + 22, 32, 4, '#8a5a3a'); // カウンター
      R(x + 6, y + 18, 4, 4, '#ffe04a'); R(x + 12, y + 19, 4, 3, '#4caf50'); R(x + 28, y + 18, 5, 4, '#c8943c');
      R(x + 10, y + 2, 20, 0, '#000');
      label(g, 'サイの店', x + 20, y + 40);
      hit.push({ id: 'shop', x, y, w: 40, h: 34 });
    }
    // 倉庫（高床の木の家）
    {
      const x = 104, y = 50, big = st >= 2;
      const w = big ? 40 : 30;
      R(x + 2, y + 26, 3, 10, '#5a3a20'); R(x + w - 5, y + 26, 3, 10, '#5a3a20');
      R(x, y + 10, w, 18, '#a0683a'); for (let i = 0; i < w; i += 4) R(x + i, y + 10, 1, 18, '#7a4a24');
      R(x - 3, y + 4, w + 6, 7, '#6a3a1a'); R(x + w / 2 - 6, y, 12, 5, '#6a3a1a');
      R(x + w / 2 - 4, y + 16, 8, 12, '#4a2a14');
      if (big) R(x + w - 10, y + 14, 6, 6, '#ffe8a0');
      label(g, '倉庫', x + w / 2, y + 44);
      hit.push({ id: 'storage', x: x - 3, y, w: w + 6, h: 38 });
    }
    // 鍛冶屋と屋台（発展3）
    if (st >= 3) {
      const x = 152, y = 56;
      R(x, y + 8, 32, 22, '#6a6a72'); R(x - 2, y + 4, 36, 6, '#3a3a42');
      R(x + 4, y + 18, 10, 12, '#2a1a10'); R(x + 6, y + 22, 6, 6, '#ff7a20');
      R(x + 20, y + 22, 9, 4, '#3a3a3a'); R(x + 22, y + 26, 5, 4, '#3a3a3a');
      const sm = Math.floor(now / 300) % 3; R(x + 26, y - 2 - sm * 2, 4, 4, 'rgba(200,200,200,0.6)');
      R(x + 26, y - 4, 4, 10, '#4a4a52');
      label(g, '鍛冶屋', x + 16, y + 38);
      hit.push({ id: 'smith', x: x - 2, y, w: 36, h: 32 });
      // 屋台
      const fx = 56, fy = 56;
      R(fx, fy + 6, 22, 14, '#b07a45'); R(fx - 2, fy, 26, 7, '#2e8b88'); R(fx - 2, fy + 6, 26, 1, '#1e5a58');
      R(fx + 3, fy + 9, 4, 3, '#fff'); R(fx + 10, fy + 9, 4, 3, '#c8943c'); R(fx + 16, fy + 9, 3, 3, '#e24a4a');
      label(g, '屋台', fx + 11, fy + 28);
      hit.push({ id: 'shop', x: fx - 2, y: fy, w: 26, h: 22 });
    } else {
      // 空き地の看板
      const x = 158, y = 70;
      R(x + 6, y + 6, 2, 10, '#6a4228'); R(x, y, 16, 8, '#c8a070'); R(x + 2, y + 3, 12, 1, '#6a4228');
      hit.push({ id: 'develop', x, y, w: 16, h: 16 });
    }
    // 灯り（発展すると増える）
    const lamps = st === 1 ? [[50, 80]] : st === 2 ? [[50, 80], [96, 80], [150, 80]] : [[4, 80], [50, 80], [96, 80], [146, 80], [188, 80], [92, 108], [150, 108]];
    for (const [lx, ly] of lamps) {
      R(lx, ly - 10, 1, 12, '#4a3020');
      const fl = 0.75 + 0.25 * Math.sin(now / 300 + lx);
      g.globalAlpha = st >= 3 ? 0.35 * fl : 0.2 * fl;
      g.fillStyle = '#ffd070'; g.beginPath(); g.arc(lx + 0.5, ly - 12, 7, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      R(lx - 2, ly - 15, 5, 5, '#ff8a3a'); R(lx - 1, ly - 14, 3, 3, '#ffd070');
    }
    if (st >= 2) { // 吊り提灯の列
      for (let i = 0; i < 8; i++) { const lx = 10 + i * 22; R(lx, 72 + (i % 2), 3, 4, i % 2 ? '#ff6a6a' : '#ffd070'); }
      R(6, 71, 180, 1, 'rgba(60,40,20,0.5)');
    }
    // 宝珠の祠
    if (V.cleared) {
      const x = 86, y = 60;
      R(x, y + 14, 14, 8, '#d8c8a8'); R(x + 2, y + 12, 10, 3, '#b8a888');
      const gl = 0.6 + 0.4 * Math.sin(now / 400);
      g.globalAlpha = gl * 0.5; g.fillStyle = '#e8c8ff'; g.beginPath(); g.arc(x + 7, y + 7, 8, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      g.drawImage(SP.s.icon.orb, x - 1, y - 2, 16, 16);
    }
    // たけとサイ
    const bobT = Math.floor(now / 500) % 2;
    g.drawImage(SP.s.sai, 36, 70 + bobT, 16, 16);
    g.drawImage(SP.s.take.down[Math.floor(now / 450) % 2], 66, 82, 16, 16);
    // 出発口（遺跡への道）
    R(0, 86, 6, 10, 'rgba(255,255,255,0.15)');
    hit.push({ id: 'depart', x: 60, y: 78, w: 30, h: 26 });
    g.restore();
    return hit.map((h) => ({ id: h.id, x: (ox + h.x * sc) / (W / canvas.clientWidth), y: (oy + h.y * sc) / (H / canvas.clientHeight), w: h.w * sc / (W / canvas.clientWidth), h: h.h * sc / (H / canvas.clientHeight) }));
  };

  function label(g, text, cx, y) {
    g.font = 'bold 7px sans-serif';
    g.textAlign = 'center';
    const w = g.measureText(text).width + 6;
    g.fillStyle = 'rgba(40,20,10,0.75)';
    g.fillRect(Math.round(cx - w / 2), y - 7, Math.round(w), 9);
    g.fillStyle = '#fff6dc';
    g.fillText(text, cx, y);
    g.textAlign = 'left';
  }

  TS.Render = RD;
})(globalThis.TS = globalThis.TS || {});
