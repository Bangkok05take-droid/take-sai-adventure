/* 描画（ダンジョンと村）。ゲームの状態は読むだけで変更しない。
 * 地形は「探索済みになったマスだけ」を1枚のキャンバスに描きためて使い回し、
 * 毎フレームは見える範囲を1回転送＋キャラ・動くものだけを描く（スマホで軽く）。 */
(function (TS) {
  'use strict';
  const D = TS.Data, G = TS.Game, DG = TS.Dungeon, SP = TS.Sprites;
  const RD = { fx: [], lastMove: 0 };
  const TILE = 32;

  RD.addFx = function (f) { f.t0 = performance.now(); RD.fx.push(f); };
  RD.stepDur = 110; // 1マス分の移動を見せる時間（UIが歩き・ダッシュに合わせて設定）

  // ---- 移動の補間（描画だけ。ターン処理とは独立） ----
  const anims = {};
  let animKey = '';
  function lerpPos(id, x, y, now) {
    let a = anims[id];
    if (!a) a = anims[id] = { x, y, fx: x, fy: y, t0: 0, dur: 1 };
    if (a.x !== x || a.y !== y) {
      const c = interp(a, now);
      const jump = Math.max(Math.abs(x - c.x), Math.abs(y - c.y)) > 1.6; // 階段・ワープなどは一瞬で
      a.fx = jump ? x : c.x; a.fy = jump ? y : c.y; a.x = x; a.y = y; a.t0 = now; a.dur = RD.stepDur;
    }
    return interp(a, now);
  }
  function interp(a, now) {
    const t = Math.max(0, Math.min(1, (now - a.t0) / a.dur));
    return { x: a.fx + (a.x - a.fx) * t, y: a.fy + (a.y - a.fy) * t };
  }
  RD.moving = (now) => { const a = anims.p; return !!a && now - a.t0 < a.dur; };
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
      const m = run.map, c = document.createElement('canvas');
      c.width = m.w * TILE; c.height = m.h * TILE;
      // 部屋の番号（見せ場を決める）と、水面にする壁の岸からの距離（1〜2）
      const roomGrid = new Int16Array(m.w * m.h).fill(-1), ring = new Uint8Array(m.w * m.h);
      (m.rooms || []).forEach((r, i) => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) roomGrid[y * m.w + x] = i; });
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
        if (m.tiles[y * m.w + x] !== DG.WALL) continue;
        let d = 0;
        for (let r = 1; r <= 2 && !d; r++) for (let dy = -r; dy <= r && !d; dy++) for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < m.w && ny < m.h && m.tiles[ny * m.w + nx] !== DG.WALL) { d = r; break; }
        }
        ring[y * m.w + x] = d;
      }
      layer = { key, map: m, canvas: c, g: c.getContext('2d'), drawn: new Uint8Array(m.w * m.h), torches: [], water: [], glows: [], roomGrid, ring };
      layer.g.imageSmoothingEnabled = false;
    }
    return layer;
  }
  RD.resetLayer = () => { layer = null; };
  // 探索済みの床と、そのまわりの壁（水の地域は岸から2マスまでの水面）を描く
  function known(run, L, x, y, reach) {
    const m = run.map, i = y * m.w + x;
    if (run.explored[i]) return true;
    if (m.tiles[i] !== DG.WALL) return false;
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < m.w && ny < m.h && run.explored[ny * m.w + nx] && m.tiles[ny * m.w + nx] !== DG.WALL) return true;
    }
    return false;
  }
  function paintTile(run, L, x, y) {
    const theme = G.F(run).theme;
    const r = TS.Tiles.paint(run, L, x, y, theme);
    if (r.torch) L.torches.push({ x, y });
    if (r.water) L.water.push({ x, y });
    if (r.glow) L.glows.push({ x, y });
    L.drawn[y * run.map.w + x] = 1;
  }

  // ---------------- ダンジョン ----------------
  RD.drawDungeon = function (canvas, S, now) {
    const run = S.run;
    const { g, W, H, dpr } = fit(canvas);
    const theme = G.F(run).theme;
    const TH = SP.themeColors[theme];
    g.fillStyle = TH.bg; g.fillRect(0, 0, W, H);
    // 1マスの大きさ：横9.5マス・縦7.5マス程度が見えるように。16px刻みにしてドットの乱れを抑える
    const ts = Math.max(TILE, Math.floor(Math.min(W / 9.5, H / 7.5) / 16) * 16);
    const k = ts / TILE;
    const m = run.map, p = run.player;
    const key = run.seed + ':' + run.floor;
    if (key !== animKey) { for (const k of Object.keys(anims)) delete anims[k]; animKey = key; }
    const pp = lerpPos('p', p.x, p.y, now);
    const ox = Math.round(W / 2 - (pp.x + 0.5) * ts), oy = Math.round(H / 2 - (pp.y + 0.5) * ts);
    const x0 = Math.max(0, Math.floor(-ox / ts)), x1 = Math.min(m.w - 1, Math.ceil((W - ox) / ts));
    const y0 = Math.max(0, Math.floor(-oy / ts)), y1 = Math.min(m.h - 1, Math.ceil((H - oy) / ts));
    const L = getLayer(run);
    const reach = TS.Tiles.isWaterTheme(theme) ? 2 : 1;
    // 新しく見えたマスを描く。重くならないよう1フレームの時間に上限を設け、たけに近いマスから描く
    const todo = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!L.drawn[y * m.w + x] && known(run, L, x, y, reach)) todo.push([x, y]);
    if (todo.length) {
      todo.sort((a, b) => Math.max(Math.abs(a[0] - p.x), Math.abs(a[1] - p.y)) - Math.max(Math.abs(b[0] - p.x), Math.abs(b[1] - p.y)));
      const t0 = performance.now();
      for (let i = 0; i < todo.length; i++) { if (i >= 12 && performance.now() - t0 > 7) break; paintTile(run, L, todo[i][0], todo[i][1]); }
    }
    // 見える範囲を1回で転送
    g.drawImage(L.canvas, x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE, ox + x0 * ts, oy + y0 * ts, (x1 - x0 + 1) * ts, (y1 - y0 + 1) * ts);
    // 動く地形：たいまつ・階段・帰還の碑・帰還口
    const fr = (ms, n) => Math.floor(now / ms) % n;
    const inView = (t) => t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1;
    // 水面のきらめき（ゆっくり動く短い光の線）
    g.fillStyle = 'rgba(220,250,255,0.55)';
    for (const t of L.water) {
      if (!inView(t)) continue;
      for (let j = 0; j < 2; j++) {
        const h = SP.hash(t.x, t.y, j + 3), ph = ((now / 2600 + (h & 255) / 255) % 1);
        const lx = (h >> 8) % 20 + 4 + ph * 6, ly = (h >> 16) % 22 + 5;
        g.globalAlpha = Math.sin(ph * Math.PI) * 0.8;
        g.fillRect(Math.round(ox + t.x * ts + lx * k), Math.round(oy + t.y * ts + ly * k), Math.round(5 * k), Math.max(1, Math.round(k)));
      }
    }
    g.globalAlpha = 1;
    for (const t of L.torches) if (inView(t)) g.drawImage(SP.tiles[theme].torch[(fr(160, 3) + t.x) % 3], ox + t.x * ts, oy + t.y * ts, ts, ts);
    // たいまつ・結晶のほのかな明かり
    g.globalCompositeOperation = 'lighter';
    for (const t of L.torches.concat(L.glows)) {
      if (!inView(t)) continue;
      const cx = ox + (t.x + 0.5) * ts, cy = oy + (t.y + 0.4) * ts, r = ts * (1.5 + 0.06 * Math.sin(now / 230 + t.x));
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, TH.light + '30'); gr.addColorStop(1, TH.light + '00');
      g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    g.globalCompositeOperation = 'source-over';
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
      const sz = Math.round(ts * 0.68), pad = Math.round((ts - sz) / 2);
      // 置かれた道具：明るい台座の円と影で床から浮かせ、種類の形が分かる大きさで描く
      g.fillStyle = 'rgba(255,246,210,0.22)';
      g.beginPath(); g.ellipse(sx + ts / 2, sy + ts * 0.74, ts * 0.36, ts * 0.17, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.beginPath(); g.ellipse(sx + ts / 2, sy + ts * 0.8, ts * 0.24, ts * 0.075, 0, 0, Math.PI * 2); g.fill();
      g.drawImage(img, sx + pad, sy + pad - Math.round(k * (1 + fr(500, 2))), sz, sz);
    }
    // 見えていない探索済みの場所は暗く
    g.fillStyle = 'rgba(4,2,10,0.52)';
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (L.drawn[y * m.w + x] && !G.isVisible(run, x, y)) g.fillRect(ox + x * ts, oy + y * ts, ts, ts);
    }
    // 霧（まわり2マスだけ見える）。この上に予告・床の印を描くので、霧の中でも危険は分かる
    if (run.fog > 0) {
      const cx = ox + (pp.x + 0.5) * ts, cy = oy + (pp.y + 0.5) * ts;
      const fg = g.createRadialGradient(cx, cy, ts * 1.6, cx, cy, ts * 3.2);
      fg.addColorStop(0, 'rgba(200,190,230,0)'); fg.addColorStop(1, 'rgba(120,110,150,0.88)');
      g.fillStyle = fg; g.fillRect(0, 0, W, H);
    }
    // 予告攻撃の範囲（赤く点滅）。ボスの予告は霧の中でも見える
    const pulse = 0.32 + 0.25 * Math.sin(now / 120);
    for (const e of run.enemies) {
      if (!e.charge || (!e.boss && !G.isVisible(run, e.x, e.y))) continue;
      g.fillStyle = `rgba(255,40,40,${pulse})`;
      for (const t of e.charge.tiles) g.fillRect(ox + t.x * ts + k, oy + t.y * ts + k, ts - 2 * k, ts - 2 * k);
      g.strokeStyle = 'rgba(255,220,220,0.9)'; g.lineWidth = k;
      for (const t of e.charge.tiles) g.strokeRect(ox + t.x * ts + 1.5 * k, oy + t.y * ts + 1.5 * k, ts - 3 * k, ts - 3 * k);
    }
    // 床の危険（炎・氷・罠・雷）：色つきの印と、発動までにたけが動ける回数の数字。霧の中でも見える
    if (run.hazards && run.hazards.length) {
      const HC = { fire: [255, 110, 40], ice: [110, 210, 255], trap: [200, 90, 255], bolt: [255, 230, 80] };
      g.textAlign = 'center'; g.font = `bold ${Math.round(ts * 0.42)}px sans-serif`;
      for (const h of run.hazards) {
        const c = HC[h.kind] || HC.fire, x = ox + h.x * ts, y = oy + h.y * ts, n = h.t - 1;
        g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${(n <= 0 ? 0.55 : 0.28) + 0.12 * Math.sin(now / 140)})`;
        g.fillRect(x + k, y + k, ts - 2 * k, ts - 2 * k);
        g.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},0.95)`; g.lineWidth = k;
        g.strokeRect(x + 1.5 * k, y + 1.5 * k, ts - 3 * k, ts - 3 * k);
        if (h.kind === 'trap') { g.strokeStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.moveTo(x + ts * 0.3, y + ts * 0.3); g.lineTo(x + ts * 0.7, y + ts * 0.7); g.moveTo(x + ts * 0.7, y + ts * 0.3); g.lineTo(x + ts * 0.3, y + ts * 0.7); g.stroke(); }
        g.lineWidth = k * 2.5; g.strokeStyle = '#1a0a10'; g.strokeText(String(Math.max(0, n)), x + ts / 2, y + ts * 0.66);
        g.fillStyle = '#ffffff'; g.fillText(String(Math.max(0, n)), x + ts / 2, y + ts * 0.66);
      }
      g.textAlign = 'left';
    }
    const shadow = (cx, cy, rw) => { g.fillStyle = 'rgba(0,0,0,0.38)'; g.beginPath(); g.ellipse(cx, cy, rw, rw * 0.32, 0, 0, Math.PI * 2); g.fill(); };
    // 敵
    for (const e of run.enemies) {
      if (!G.isVisible(run, e.x, e.y)) continue;
      const ep = lerpPos('e' + e.id, e.x, e.y, now);
      let sx = Math.round(ox + ep.x * ts), sy = Math.round(oy + ep.y * ts);
      const l = lungeOffset(e.id, now, ts);
      sx += l[0]; sy += l[1];
      const frames = SP.enemyFrames(D.ENEMIES[e.type].sprite);
      const img = frames[e.sleep ? 0 : (Math.floor(now / (D.ENEMIES[e.type].ai === 'fast' ? 160 : 420) + e.id) % frames.length)];
      const hit = hitFx(e.x, e.y, 'enemy', now);
      const big = img.width / TILE;
      const dw = ts * big;
      const isClone = !!D.ENEMIES[e.type].clone;
      // ボスの立っているマス（当たり判定）を足元の円で示す
      if (e.boss || isClone) {
        g.strokeStyle = e.boss ? 'rgba(255,214,90,0.85)' : 'rgba(255,214,90,0.5)'; g.lineWidth = k * 1.5;
        g.beginPath(); g.ellipse(sx + ts / 2, sy + ts * 0.82, ts * 0.46, ts * 0.17, 0, 0, Math.PI * 2); g.stroke();
      }
      // 分身には影がない（観察すると本体が分かる手がかり）。ゆらゆらと透ける
      if (!isClone) shadow(sx + ts / 2, sy + ts * 0.9, ts * 0.32 * Math.min(big, 1.4));
      const shake = hit ? Math.round(Math.sin(now / 20) * k * 2) : 0;
      if (isClone) g.globalAlpha = 0.78 + 0.18 * Math.sin(now / 160 + e.id);
      g.drawImage(img, sx + (ts - dw) / 2 + shake, sy + ts - dw, dw, dw);
      g.globalAlpha = 1;
      if (isClone && G.hasCharm(run, 'truesight')) badge(g, '幻', sx + ts / 2, sy + ts - dw * 0.55, ts, k, '#c8f0ff', '#102040');
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
      const walking = now - RD.lastMove < Math.max(260, RD.stepDur * 2.2);
      const img = attacking ? set.atk : set.walk[walking ? (Math.floor(now / 85) % 4) : (Math.floor(now / 600) % 2 ? 0 : 2)];
      const hurt = hitFx(p.x, p.y, 'player', now);
      const sx = Math.round(ox + pp.x * ts + l[0] + (hurt ? Math.sin(now / 18) * k * 2 : 0)), sy = Math.round(oy + pp.y * ts + l[1]);
      shadow(sx + ts / 2, sy + ts * 0.92, ts * 0.3);
      g.drawImage(img, sx, sy, ts, ts);
      if (hurt) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.55; g.drawImage(img, sx, sy, ts, ts); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
      if (p.poison) { g.fillStyle = '#c070ff'; g.fillRect(sx + ts * 0.8, sy + ts * 0.1 + (fr(300, 2) ? k : 0), 3 * k, 3 * k); }
      if (p.bound > 0) { // 拘束：闇の糸
        g.strokeStyle = 'rgba(190,150,255,0.9)'; g.lineWidth = k * 1.5;
        for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(sx + ts / 2, sy + ts * (0.45 + i * 0.16), ts * 0.36, ts * 0.08, 0.2 * Math.sin(now / 200 + i), 0, Math.PI * 2); g.stroke(); }
      }
      // 向きのマーカー（向き変更中は目の前のマスも光らせる）
      const [ddx, ddy] = G.DIRS[p.dir];
      if (RD.facingMode) {
        g.strokeStyle = `rgba(150,210,255,${0.6 + 0.3 * Math.sin(now / 150)})`; g.lineWidth = 2 * k;
        g.strokeRect(sx + ddx * ts + 2 * k, sy + ddy * ts + 2 * k, ts - 4 * k, ts - 4 * k);
      }
      let dx = ddx, dy = ddy;
      const len = Math.hypot(dx, dy); dx /= len; dy /= len;
      const cx = sx + ts / 2 + dx * ts * 0.58, cy = sy + ts / 2 + dy * ts * 0.58, a = RD.facingMode ? 4.5 : 3.4;
      g.beginPath();
      g.moveTo(cx + dx * a * k, cy + dy * a * k);
      g.lineTo(cx - dy * a * 0.85 * k - dx * a * 0.6 * k, cy + dx * a * 0.85 * k - dy * a * 0.6 * k);
      g.lineTo(cx + dy * a * 0.85 * k - dx * a * 0.6 * k, cy - dx * a * 0.85 * k - dy * a * 0.6 * k);
      g.closePath();
      g.lineWidth = k; g.strokeStyle = '#1a1030'; g.fillStyle = RD.facingMode ? '#9ad0ff' : '#fff6dc';
      g.fill(); g.stroke();
    }
    drawFx(g, now, ox, oy, ts, k);
    // ボスのHP
    const boss = run.enemies.find((e) => e.boss && (G.isVisible(run, e.x, e.y) || (run.fog > 0 && e.awake)));
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
  const VL = () => TS.Village;
  let vcache = null;
  RD.villageLevels = function (V) {
    return {
      stage: V.stage,
      storage: V.storageLv || (V.stage >= 2 ? 2 : 1),
      smith: V.smithLv !== undefined ? V.smithLv : (V.stage >= 3 ? 1 : 0),
      diner: !!V.diner, museum: !!V.museum, decor: Object.assign({}, V.decor || {}),
      donated: Object.keys(V.donated || {}).length, cleared: !!V.cleared, legacy: !!V.legacyClear10,
      chapter: (V.story && V.story.chapter) || 1, ending: !!(V.story && V.story.endingDone), legacy30: !!V.legacyClear30,
    };
  };

  /* 村の絵を描き、施設のタップ範囲を返す。
   * 横幅いっぱいに拡大し、縦は「建物の並ぶ通り」が見えるように合わせる（縦長なら空と水路まで、横長なら上下を切る）。 */
  RD.drawVillage = function (canvas, V, now) {
    const { g, W, H } = fit(canvas);
    const lv = RD.villageLevels(V), Vv = VL(), VW = Vv.VW, VH = Vv.VH, FR = Vv.FRONT, BK = Vv.BACK;
    const key = JSON.stringify(lv);
    if (!vcache || vcache.key !== key) vcache = Object.assign({ key }, Vv.paint(lv));
    const s = Math.min(W / VW * 1.06, Math.max(W / VW, H / VH));     // 横幅に合わせる（縦長なら左右をほんの少し切って大きく）
    const ox = Math.round((W - VW * s) / 2);
    // 広場が画面の中ほどに来るように。絵が画面より低いときは下にそろえ、上は空の色でつなぐ
    const oy = VH * s >= H ? Math.round(Math.min(0, Math.max(H - VH * s, H * 0.55 - Vv.FOCUS * s))) : Math.round(H - VH * s);
    // 絵の外（上下）は空と岸の色でつなぐ
    g.fillStyle = vcache.night ? '#1a2350' : '#3d7cc8'; g.fillRect(0, 0, W, oy + 2);
    g.fillStyle = vcache.night ? '#4e7a3e' : '#6a9e40'; g.fillRect(0, oy + VH * s - 2, W, H);
    if (oy > 0) { g.fillStyle = '#ffffff'; for (let i = 0; i < 24; i++) { g.globalAlpha = 0.25 + (i % 3) * 0.2; g.fillRect((SP.hash(i, 1, 3) % W), (SP.hash(i, 2, 3) % Math.max(1, oy)), 2, 2); } g.globalAlpha = 1; }
    g.drawImage(vcache.canvas, ox, oy, VW * s, VH * s);
    g.save(); g.translate(ox, oy); g.scale(s, s);
    // 窓・灯りのほのかな光（夜は強め）
    g.globalCompositeOperation = 'lighter';
    for (const [lx, ly, r] of vcache.lights) {
      const fl = 0.85 + 0.15 * Math.sin(now / 300 + lx);
      const gr = g.createRadialGradient(lx, ly, 0, lx, ly, r * 1.6);
      gr.addColorStop(0, `rgba(255,200,110,${(vcache.night ? 0.42 : 0.16) * fl})`); gr.addColorStop(1, 'rgba(255,200,110,0)');
      g.fillStyle = gr; g.fillRect(lx - r * 1.6, ly - r * 1.6, r * 3.2, r * 3.2);
    }
    g.globalCompositeOperation = 'source-over';
    // 水面のきらめき・小舟
    g.fillStyle = 'rgba(220,245,255,0.75)';
    for (let i = 0; i < 16; i++) g.fillRect((i * 53 + Math.floor(now / 90)) % VW, Vv.WATER[0] + 4 + (i * 17) % 30, 5, 1);
    const bx = 60 + Math.sin(now / 2200) * 40, by = Vv.WATER[0] + 20;
    g.fillStyle = '#6a4228'; g.fillRect(bx, by, 30, 4); g.fillStyle = '#4a2e18'; g.fillRect(bx + 3, by + 4, 24, 2);
    g.fillStyle = '#e8c070'; g.beginPath(); g.moveTo(bx + 8, by); g.lineTo(bx + 15, by - 8); g.lineTo(bx + 22, by); g.fill();
    // 湯気・煙・噴水
    for (const [x, y, kind] of vcache.steam) {
      for (let i = 0; i < 3; i++) {
        const t = ((now / (kind === 'fountain' ? 500 : 1400)) + i / 3) % 1;
        if (kind === 'fountain') { g.fillStyle = 'rgba(200,240,255,0.85)'; g.fillRect(x - 1 + (i - 1) * 3 * t, y + t * 8 - Math.sin(t * Math.PI) * 6, 2, 2); continue; }
        g.fillStyle = kind === 'smoke' ? `rgba(200,200,210,${0.55 * (1 - t)})` : `rgba(255,255,255,${0.6 * (1 - t)})`;
        const r = (kind === 'smoke' ? 3 : 2) + t * 4;
        g.beginPath(); g.arc(x + Math.sin(t * 6 + i) * 2, y - t * 16, r, 0, Math.PI * 2); g.fill();
      }
    }
    // 灯り（発展・灯籠で増える）
    const lamps = [[110, FR + 14], [140, BK + 14]];
    if (lv.stage >= 2) lamps.push([4, FR + 14], [222, BK + 14]);
    if (lv.stage >= 3) lamps.push([196, FR + 14], [326, BK + 14]);
    if (lv.decor.lanterns) for (let x = 20; x < VW; x += 44) lamps.push([x, FR + 26]);
    for (const [lx, ly] of lamps) {
      g.fillStyle = '#3a2418'; g.fillRect(lx, ly - 16, 2, 17);
      const fl = 0.75 + 0.25 * Math.sin(now / 280 + lx);
      g.globalAlpha = (vcache.night ? 0.4 : 0.2) * fl; g.fillStyle = '#ffd070'; g.beginPath(); g.arc(lx + 1, ly - 18, 9, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      g.fillStyle = '#1e1218'; g.fillRect(lx - 3, ly - 22, 8, 7); g.fillStyle = '#ff8a3a'; g.fillRect(lx - 2, ly - 21, 6, 5); g.fillStyle = '#ffe08a'; g.fillRect(lx - 1, ly - 20, 4, 3);
    }
    if (lv.stage >= 2 || lv.decor.lanterns) { // 通りに渡した吊り提灯
      g.strokeStyle = 'rgba(40,24,16,0.7)'; g.lineWidth = 0.6; g.beginPath();
      const ly0 = BK + 24;
      for (let x = 0; x <= VW; x += 8) g.lineTo(x, ly0 + Math.abs(Math.sin(x / 48 * Math.PI)) * 6);
      g.stroke();
      for (let i = 0; i < 12; i++) { const x = 14 + i * 31, y = ly0 + Math.abs(Math.sin(x / 48 * Math.PI)) * 6; g.fillStyle = '#1e1218'; g.fillRect(x - 1, y, 6, 7); g.fillStyle = i % 2 ? '#ff6a6a' : '#ffd070'; g.fillRect(x, y + 1, 4, 5); }
    }
    // 宝珠の光
    if (lv.cleared) {
      const gl = 0.6 + 0.4 * Math.sin(now / 400);
      g.globalAlpha = gl * 0.5; g.fillStyle = '#e8c8ff'; g.beginPath(); g.arc(250, 162, 12, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      g.drawImage(SP.s.icon.orb, 242, 152, 16, 16);
    }
    // 村の人（章が進むと増える。名前や姿を決めた人物は js/assets.js・js/story.js で差し替え）
    const nV = Math.min(7, lv.chapter + (lv.ending ? 2 : 0));
    const spots = [[150, FR - 10], [228, BK + 44], [300, BK + 34], [262, FR - 18], [348, FR - 20], [190, BK + 30], [120, FR + 2]];
    for (let i = 0; i < nV; i++) {
      const [vx, vy] = spots[i], img = SP.s.villagers[i % SP.s.villagers.length];
      const bob = Math.floor((now / 500 + i) % 2), sway = Math.round(Math.sin(now / 1500 + i * 2) * 3);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(vx + sway, vy + 1, 6, 1.8, 0, 0, Math.PI * 2); g.fill();
      g.drawImage(img, vx - 12 + sway, vy - 24 - bob, 24, 24);
    }
    // たけとサイ（店の前）
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(44, FR + 6, 9, 2.5, 0, 0, Math.PI * 2); g.ellipse(76, FR + 9, 9, 2.5, 0, 0, Math.PI * 2); g.fill();
    g.drawImage(SP.s.sai[Math.floor(now / 1700) % 6 === 0 ? 1 : 0], 28, FR - 25, 32, 32);
    g.drawImage(SP.s.take.down.walk[Math.floor(now / 600) % 2 ? 0 : 2], 60, FR - 22, 32, 32);
    // 名札
    g.font = 'bold 9px sans-serif'; g.textAlign = 'center';
    for (const [t, x, y] of vcache.label) {
      const w = g.measureText(t).width + 8;
      g.fillStyle = 'rgba(8,26,34,0.82)'; g.fillRect(Math.round(x - w / 2), y - 9, Math.round(w), 12);
      g.fillStyle = 'rgba(214,170,82,0.8)'; g.fillRect(Math.round(x - w / 2), y + 3, Math.round(w), 1);
      g.fillStyle = '#fff4dc'; g.fillText(t, x, y);
    }
    g.textAlign = 'left';
    g.restore();
    // タップ範囲（絵の座標）
    const hits = [
      { id: 'depart', x: 56, y: FR - 26, w: 36, h: 40 },
      { id: 'shop', x: 2, y: FR - 92, w: 104, h: 110 },
      { id: lv.diner ? 'diner' : 'develop', x: 112, y: FR - 66, w: 80, h: 84 },
      { id: 'storage', x: 130, y: BK - 80, w: 94, h: 96 },
      { id: lv.smith ? 'smith' : 'develop', x: 228, y: BK - 76, w: 92, h: 92 },
      { id: lv.museum ? 'museum' : 'develop', x: 322, y: BK - 62, w: 62, h: 78 },
    ];
    const cw = W / canvas.clientWidth;
    return hits.map((h) => ({ id: h.id, x: (ox + h.x * s) / cw, y: (oy + h.y * s) / cw, w: h.w * s / cw, h: h.h * s / cw }));
  };

  TS.Render = RD;
})(globalThis.TS = globalThis.TS || {});
