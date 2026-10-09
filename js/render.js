/* 描画（ダンジョンと村）。ゲームの状態は読むだけで変更しない。
 * 地形は「探索済みになったマスだけ」を1枚のキャンバスに描きためて使い回し、
 * 毎フレームは見える範囲を1回転送＋キャラ・動くものだけを描く（スマホで軽く）。 */
(function (TS) {
  'use strict';
  const D = TS.Data, G = TS.Game, DG = TS.Dungeon, SP = TS.Sprites;
  const RD = { fx: [], lastMove: 0 };
  const TILE = 32;

  RD.addFx = function (f) { return TS.FX ? TS.FX.add(RD, f) : (f.t0 = performance.now(), RD.fx.push(f), f); };
  RD.clearFx = function () { RD.fx = []; };
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
  RD.noteMove = function () { RD.lastMove = performance.now(); RD.stepCount = (RD.stepCount || 0) + 1; };
  /* 歩行のコマ：1マスの移動を前半・後半に分け、「左足→通過→右足→通過」をくり返す（2マスで1周）。
   * 止まったら待機。向きだけ変えたときは歩かない（移動していないので待機のまま）。
   * prog：このマスの移動の進み具合（0〜1）、steps：これまでの歩数。戻り値は idle / w1 / w2 のどれか */
  RD.walkFrame = function (set, moving, prog, steps) {
    if (!moving) return set.idle;
    const half = (steps * 2 + (prog >= 0.5 ? 1 : 0)) % 4;
    return half === 0 ? set.w1 : half === 2 ? set.w2 : set.idle;
  };
  /* 攻撃のコマ：構え（0〜25%）→ 振り抜き（25〜80%。命中の点滅・数字はこの間に出る）→ 待機 */
  RD.attackFrame = function (set, a) { return a < 0.25 ? set.a1 : a < 0.8 ? set.a2 : set.idle; };

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
    // 強いボスの攻撃だけ、画面を少し揺らす（「演出：控えめ」では揺らさない）
    const shk = TS.FX ? TS.FX.shakeOffset(RD, now, k) : [0, 0];
    const ox = Math.round(W / 2 - (pp.x + 0.5) * ts) + shk[0], oy = Math.round(H / 2 - (pp.y + 0.5) * ts) + shk[1];
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
    // 動く地形：たいまつ・階段・帰還の祠・帰還口
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
      if (f.item && G.def(f.item).type === 'treasure') {
        const shine = (fr(450, 4) + f.x) % 4 === 0, ci = SP.chestIcon(ts);
        if (!ci) { g.drawImage(SP.tiles.chest[shine ? 1 : 0], sx, sy, ts, ts); continue; }
        // 宝箱：影で床に置き、1マスいっぱいに描く（ときどき金具がきらっと光る）
        g.fillStyle = 'rgba(0,0,0,0.45)';
        g.beginPath(); g.ellipse(sx + ts / 2, sy + ts * 0.82, ts * 0.42, ts * 0.09, 0, 0, Math.PI * 2); g.fill();
        g.drawImage(ci, sx, sy + Math.round(ts * 0.06), ts, ts);
        if (shine) {
          const u = Math.max(1, Math.round(ts / 24)), x = sx + Math.round(ts * 0.74), y = sy + Math.round(ts * 0.24);
          g.fillStyle = '#fff6b0'; g.fillRect(x - u * 2, y, u * 5, u); g.fillRect(x, y - u * 2, u, u * 5);
          g.fillStyle = '#ffffff'; g.fillRect(x, y, u, u);
        }
        continue;
      }
      const sz = Math.round(ts * 0.68), pad = Math.round((ts - sz) / 2);
      const img = f.gold ? SP.goldIcon(sz) : SP.iconFor(G.def(f.item));
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
        if (!run.explored[h.y * run.map.w + h.x]) continue;   // まだ見ていない場所の印は描かない（暗い所に数字だけ並ぶのを防ぐ）
        const c = HC[h.kind] || HC.fire, x = ox + h.x * ts, y = oy + h.y * ts, n = h.t - 1;
        g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${(n <= 0 ? 0.55 : 0.28) + 0.12 * Math.sin(now / 140)})`;
        g.fillRect(x + k, y + k, ts - 2 * k, ts - 2 * k);
        g.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},0.95)`; g.lineWidth = k;
        g.strokeRect(x + 1.5 * k, y + 1.5 * k, ts - 3 * k, ts - 3 * k);
        if (h.name === '魔法陣の炎') { // 大魔王バーンの魔法陣（マスの中だけに描く）
          g.strokeStyle = `rgba(255,200,120,${0.75 + 0.2 * Math.sin(now / 160)})`; g.lineWidth = k;
          g.beginPath(); g.arc(x + ts / 2, y + ts / 2, ts * 0.36, 0, Math.PI * 2); g.stroke();
          g.beginPath(); for (let i = 0; i <= 5; i++) { const t = i * 4 * Math.PI / 5 - Math.PI / 2 + now / 2000; const px = x + ts / 2 + Math.cos(t) * ts * 0.32, py = y + ts / 2 + Math.sin(t) * ts * 0.32; if (i) g.lineTo(px, py); else g.moveTo(px, py); } g.stroke();
        }
        if (h.kind === 'trap') { g.strokeStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.moveTo(x + ts * 0.3, y + ts * 0.3); g.lineTo(x + ts * 0.7, y + ts * 0.7); g.moveTo(x + ts * 0.7, y + ts * 0.3); g.lineTo(x + ts * 0.3, y + ts * 0.7); g.stroke(); }
        // 発動までの数字は、人物やボスの絵の上に描く（あとで1回だけ）
      }
      g.textAlign = 'left';
    }
    const shadow = (cx, cy, rw) => { g.fillStyle = 'rgba(0,0,0,0.38)'; g.beginPath(); g.ellipse(cx, cy, rw, rw * 0.32, 0, 0, Math.PI * 2); g.fill(); };
    // 謎の旅商人（たけの方を向く。見本に無い向きは左右反転で作った横向きだけ）
    const mc = run.merchant;
    if (mc && G.isVisible(run, mc.x, mc.y) && SP.art && SP.art.chars && SP.art.chars.merchant && SP.art.chars.merchant.front) {
      const a = SP.art.chars.merchant, dx = p.x - mc.x, dy = p.y - mc.y;
      const img = dy < 0 && Math.abs(dy) >= Math.abs(dx) ? a.back : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? a.sideR : a.side) : a.front;
      const sx = ox + mc.x * ts, sy = oy + mc.y * ts;
      shadow(sx + ts / 2, sy + ts * 0.9, ts * 0.32);
      RD.drawChar(g, img || a.front, sx + ts / 2, sy + ts - k, k, Math.floor(now / 700) % 2);
      // 話しかけられる印（金の袋のふきだし）
      const bx = sx + ts * 0.5, by = sy - ts * 0.72 + Math.sin(now / 300) * k;
      g.fillStyle = 'rgba(20,12,30,0.85)'; g.beginPath(); g.arc(bx, by, ts * 0.2, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#e2b23c'; g.lineWidth = k; g.stroke();
      g.fillStyle = '#ffe08a'; g.font = `bold ${Math.round(ts * 0.24)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('商', bx, by + k * 0.5); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    }
    // 敵（奥の行から順に描く。大きなボスの絵が手前の敵を隠さない）
    for (const e of run.enemies.slice().sort((a, b) => a.y - b.y)) {
      if (!G.isVisible(run, e.x, e.y)) continue;
      const ep = lerpPos('e' + e.id, e.x, e.y, now);
      let sx = Math.round(ox + ep.x * ts), sy = Math.round(oy + ep.y * ts);
      const l = lungeOffset(e.id, now, ts);
      sx += l[0]; sy += l[1];
      // 生き物ごとの動き（実際にマスを移動している間だけ。待機中は動かない＝ターンも進まない）
      const ea = anims['e' + e.id], emov = ea && now - ea.t0 < ea.dur, et = emov ? (now - ea.t0) / ea.dur : 0;
      const kind = D.ENEMIES[e.type].sprite;
      if (emov && kind === 'frog') sy -= Math.round(Math.sin(et * Math.PI) * ts * 0.28);              // 蛙：短い跳躍
      else if (emov && kind === 'turtle') { sx += Math.round(Math.sin(et * Math.PI * 4) * k); sy -= (Math.floor(et * 4) % 2) * Math.round(k); }   // 亀：のそのそ足運び
      else if (emov && (kind === 'monkey' || kind === 'thief')) sy -= (Math.floor(et * 4) % 2) * Math.round(k * 2);  // 猿：軽い足運び
      const aim = RD.fx.find((f) => f.t === 'aim' && f.id === e.id && now - f.t0 < f.dur);
      if (aim) { const a = (now - aim.t0) / aim.dur, s = a < 0.6 ? -a / 0.6 : -(1 - a) / 0.4; sx += Math.round(aim.dx * s * ts * 0.12); sy += Math.round(aim.dy * s * ts * 0.12) - Math.round(k * 2 * (a < 0.6 ? 1 : 0)); }   // 吹き矢の構え：のけぞって狙う
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
      let shake = hit ? Math.round(Math.sin(now / 20) * k * 2) : 0;
      // 見本のボスの絵：待機は1ドットの上下動、攻撃予告は小刻みに震えて赤く点滅
      let lift = 0;
      if (img.art) {
        if (e.charge) shake += Math.round(Math.sin(now / 35) * k);
        else if (!hit && !e.sleep) lift = (Math.floor(now / 520 + e.id) % 2) * Math.round(k);
      }
      if (isClone) g.globalAlpha = 0.78 + 0.18 * Math.sin(now / 160 + e.id);
      g.drawImage(img, sx + (ts - dw) / 2 + shake, sy + ts - dw - lift, dw, dw);
      g.globalAlpha = 1;
      if (img.art && e.charge) { g.globalAlpha = 0.25 + 0.25 * Math.sin(now / 120); g.drawImage(SP.tinted(img, '#ff2a2a'), sx + (ts - dw) / 2 + shake, sy + ts - dw - lift, dw, dw); g.globalAlpha = 1; }
      if (isClone && G.hasCharm(run, 'truesight')) badge(g, '幻', sx + ts / 2, sy + ts - dw * 0.55, ts, k, '#c8f0ff', '#102040');
      if (hit) { g.globalAlpha = img.art ? 0.65 : 0.6; if (img.art) g.drawImage(SP.tinted(img, '#ffffff'), sx + (ts - dw) / 2 + shake, sy + ts - dw, dw, dw); else { g.globalCompositeOperation = 'lighter'; g.drawImage(img, sx + (ts - dw) / 2 + shake, sy + ts - dw, dw, dw); g.globalCompositeOperation = 'source-over'; } g.globalAlpha = 1; }
      if (e.charge) badge(g, '！', sx + ts / 2, sy + ts - dw - ts * 0.05, ts, k, '#ff5050', '#400');
      else if (e.rest > 0) { g.font = `bold ${Math.round(ts * 0.3)}px sans-serif`; g.fillStyle = '#bde0ff'; g.fillText('…', sx + ts * 0.65, sy + ts * 0.2); }
      // 状態異常のしるし（眠り＝月、鈍足＝砂時計）。頭の上に横に並べ、重ならないようにする
      const st = [];
      if (e.sleep > 0) st.push('sleep');
      if (e.slow > 0) st.push('slow');
      if (st.length) RD.drawStatus(g, st, sx + ts / 2, sy + ts - dw * (img.art ? 0.78 : 0.95) - ts * 0.18, k, now);
      if (e.hp < e.maxhp && !e.boss) {
        g.fillStyle = '#000'; g.fillRect(sx + 2 * k, sy + ts - 3 * k, ts - 4 * k, 3 * k);
        g.fillStyle = '#ff5050'; g.fillRect(sx + 2 * k, sy + ts - 3 * k, Math.max(1, (ts - 4 * k) * e.hp / e.maxhp), 2 * k);
      }
    }
    // 大きなボスの絵に隠れた床の予告・危険の印は、枠と数字をもう一度上から描く（絵の上でも分かるように）
    if (run.enemies.some((e) => e.boss)) {
      g.lineWidth = k * 1.5;
      for (const e of run.enemies) {
        if (!e.charge || !e.boss) continue;
        g.strokeStyle = `rgba(255,90,90,${0.55 + 0.3 * Math.sin(now / 120)})`;
        for (const t of e.charge.tiles) g.strokeRect(ox + t.x * ts + 2 * k, oy + t.y * ts + 2 * k, ts - 4 * k, ts - 4 * k);
      }
      if (run.hazards && run.hazards.length) for (const h of run.hazards) { if (!run.explored[h.y * run.map.w + h.x]) continue; g.strokeStyle = 'rgba(255,240,200,0.7)'; g.strokeRect(ox + h.x * ts + 2 * k, oy + h.y * ts + 2 * k, ts - 4 * k, ts - 4 * k); }
    }
    // 床の危険の数字（発動までにたけが動ける回数）：マスの中央に1回だけ、絵の上に描く
    if (run.hazards && run.hazards.length) {
      g.textAlign = 'center'; g.font = `bold ${Math.round(ts * 0.38)}px sans-serif`;
      for (const h of run.hazards) {
        if (!run.explored[h.y * run.map.w + h.x]) continue;
        const x = ox + h.x * ts + ts / 2, y = oy + h.y * ts + ts * 0.66, n = String(Math.max(0, h.t - 1));
        g.lineWidth = k * 2.5; g.strokeStyle = '#1a0a10'; g.strokeText(n, x, y); g.fillStyle = '#ffffff'; g.fillText(n, x, y);
      }
      g.textAlign = 'left';
    }
    // たけ（歩くと足踏み、攻撃でポーズ、ダメージで揺れる）
    {
      const l = lungeOffset('p', now, ts);
      // 8方向：ななめは左右の横向きの絵を使う（ななめ専用の絵は無い）
      const set0 = SP.s.take[G.faceOf(p.dir)] || SP.s.take.down;
      const set = set0.art && set0.nw && !G.equipped(run.bag, 'weapon') ? set0.nw : set0;   // 武器なしは剣のない絵
      const atkFx = RD.fx.find((f) => f.t === 'patk' && now - f.t0 < f.dur);
      const attacking = !!atkFx || RD.fx.some((f) => f.t === 'lunge' && f.id === 'p' && now - f.t0 < 180);
      const pa = anims.p, moving = !!pa && now - pa.t0 < pa.dur;
      const walking = moving;
      let img;
      if (set.art && set.idle) img = atkFx ? RD.attackFrame(set, (now - atkFx.t0) / atkFx.dur) : RD.walkFrame(set, moving, moving ? (now - pa.t0) / pa.dur : 0, RD.stepCount || 0);
      else img = attacking ? set.atk : set.walk[walking ? (Math.floor(now / 85) % 4) : (Math.floor(now / 600) % 2 ? 0 : 2)];
      const hurt = hitFx(p.x, p.y, 'player', now);
      // 3点セット：飛ぶ見た目（仮。絵はChatGPT側で用意する予定）。影は床に残し、体を少し浮かせてゆっくり上下させる
      const fly = G.sets(run).all3 ? Math.round((5 + Math.sin(now / 420) * 1.5) * k) : 0;
      const sx = Math.round(ox + pp.x * ts + l[0] + (hurt ? Math.sin(now / 18) * k * 2 : 0)), sy = Math.round(oy + pp.y * ts + l[1]) - fly;
      shadow(sx + ts / 2, sy + fly + ts * 0.92, ts * (fly ? 0.24 : 0.3));
      // 見本から作った絵（52×64、足元そろえ）は1マスより背が高いので、足元をマスの下端に合わせて描く
      const drawP = () => set.art ? RD.drawChar(g, img, sx + ts / 2, sy + ts - k, k, 0) : g.drawImage(img, sx, sy, ts, ts);
      drawP();
      if (hurt) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.55; drawP(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
      // たけの状態異常のしるし（毒＝しずく、拘束＝鎖）
      { const st = []; if (p.poison) st.push('poison'); if (p.bound > 0) st.push('bound'); if (st.length) RD.drawStatus(g, st, sx + ts / 2, sy + ts - (set.art ? 66 : 34) * k, k, now); }
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
    // ボス戦が始まってから（部屋に入るまでは出さない）
    const boss = (!run.bossFight || run.bossFight.engaged) && run.enemies.find((e) => e.boss && (G.isVisible(run, e.x, e.y) || (run.fog > 0 && e.awake) || (run.bossFight && run.bossFight.engaged)));
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

  /* 状態異常のしるし：色だけでなく形で区別する小さなアイコン（9×9ドットの丸い台の上）。
   * sleep：三日月　slow：砂時計　poison：しずく　bound：鎖の輪。複数は横に並べる */
  RD.drawStatus = function (g, list, cx, cy, k, now) {
    const S = 10 * k, x0 = cx - (list.length * S) / 2 + S / 2;
    list.forEach((kind, i) => {
      const x = Math.round(x0 + i * S), y = Math.round(cy + (kind === 'sleep' ? Math.sin(now / 400) * k : 0));
      g.fillStyle = 'rgba(16,10,28,0.85)'; g.beginPath(); g.arc(x, y, 4.6 * k, 0, Math.PI * 2); g.fill();
      g.lineWidth = Math.max(1, k * 0.8);
      if (kind === 'sleep') {
        g.fillStyle = '#ffe9a0'; g.beginPath(); g.arc(x, y, 3 * k, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(16,10,28,1)'; g.beginPath(); g.arc(x + 1.4 * k, y - 0.9 * k, 2.5 * k, 0, Math.PI * 2); g.fill();
      } else if (kind === 'slow') {
        g.strokeStyle = '#d8c0ff'; g.beginPath(); g.moveTo(x - 2.4 * k, y - 3 * k); g.lineTo(x + 2.4 * k, y - 3 * k); g.lineTo(x - 2.4 * k, y + 3 * k); g.lineTo(x + 2.4 * k, y + 3 * k); g.closePath(); g.stroke();
        g.fillStyle = '#ffd890'; g.fillRect(x - 1.4 * k, y + 1.4 * k, 2.8 * k, 1.2 * k);
      } else if (kind === 'poison') {
        g.fillStyle = '#a8f070'; g.beginPath(); g.moveTo(x, y - 3.2 * k); g.quadraticCurveTo(x + 3 * k, y + 0.5 * k, x, y + 3 * k); g.quadraticCurveTo(x - 3 * k, y + 0.5 * k, x, y - 3.2 * k); g.fill();
        g.fillStyle = '#5a2a8a'; g.fillRect(x - 0.6 * k, y - 0.2 * k, 1.2 * k, 1.6 * k);
      } else if (kind === 'bound') {
        g.strokeStyle = '#c8a8ff'; g.beginPath(); g.ellipse(x - 1.4 * k, y, 1.8 * k, 1.2 * k, 0, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.ellipse(x + 1.4 * k, y, 1.8 * k, 1.2 * k, 0, 0, Math.PI * 2); g.stroke();
      }
    });
  };
  function badge(g, text, x, y, ts, k, col, stroke) {
    g.font = `bold ${Math.round(ts * 0.5)}px sans-serif`; g.textAlign = 'center';
    g.lineWidth = k * 2; g.strokeStyle = stroke; g.strokeText(text, x, y);
    g.fillStyle = col; g.fillText(text, x, y); g.textAlign = 'left';
  }
  function hitFx(x, y, target, now) {
    return RD.fx.some((f) => { const age = now - f.t0 - (f.delay || 0); return f.t === 'flash' && f.target === target && (target === 'player' || (f.x === x && f.y === y)) && age >= 0 && age < (f.dur || 200); });
  }
  function lungeOffset(id, now, ts) {
    for (const f of RD.fx) {
      // たけの通常攻撃：構え（少し引く）→ 踏み込み → 元の位置へ。見た目だけでマスは動かない
      if (f.t === 'patk' && id === 'p') {
        const a = (now - f.t0) / f.dur;
        if (a < 0 || a >= 1) continue;
        const s = a < 0.25 ? -0.08 * (a / 0.25) : a < 0.5 ? -0.08 + 0.43 * ((a - 0.25) / 0.25) : 0.35 * (1 - (a - 0.5) / 0.5) * (1 - (a - 0.5) / 0.5);
        return [f.dx * s * ts, f.dy * s * ts];
      }
      if (f.t !== 'lunge' || f.id !== id) continue;
      const a = (now - f.t0) / 140;
      if (a >= 1) continue;
      const s = Math.sin(a * Math.PI) * ts * 0.3;
      return [f.dx * s, f.dy * s];
    }
    return [0, 0];
  }

  function drawFx(g, now, ox, oy, ts, k) {
    RD.fx = RD.fx.filter((f) => now - f.t0 - (f.delay || 0) < (f.dur || 800));
    const view = { ox, oy, ts, k, now };
    for (const f of RD.fx) {
      const age = now - f.t0 - (f.delay || 0);
      if (age < 0) continue;                       // 遅れて始まる演出（斬撃のあとに出る数字など）
      const a = age / (f.dur || 800);
      if (TS.FX && TS.FX.draw[f.t]) { TS.FX.draw[f.t](g, f, a, view); continue; }
      if (f.t === 'num') {
        // ダメージなどの数字：小さめで、敵の頭の上へ短く浮かぶ（敵の姿や予告を長く隠さない）
        g.font = `bold ${Math.round(ts * (f.small ? 0.26 : 0.36))}px sans-serif`;
        g.textAlign = 'center';
        const x = ox + (f.x + 0.5) * ts + (f.dx || 0) * ts, y = oy + f.y * ts - ts * 0.1 - a * ts * 0.45;
        g.globalAlpha = a < 0.7 ? 1 : (1 - a) / 0.3;
        g.lineWidth = k * 3; g.strokeStyle = '#000'; g.strokeText(f.text, x, y);
        g.fillStyle = f.color || '#fff'; g.fillText(f.text, x, y);
        g.textAlign = 'left'; g.globalAlpha = 1;
      } else if (f.t === 'thrown') {
        // 投げた道具：絵が直線に飛び、少し回りながら弧を描く
        const d = D.ITEMS[f.id]; if (!d) continue;
        const img = SP.iconFor(d), sz = Math.round(ts * 0.6);
        const x = ox + (f.from.x + (f.to.x - f.from.x) * a + 0.5) * ts, y = oy + (f.from.y + (f.to.y - f.from.y) * a + 0.5) * ts - Math.sin(a * Math.PI) * ts * 0.35;
        g.save(); g.imageSmoothingEnabled = false; g.translate(Math.round(x), Math.round(y)); g.rotate(a * Math.PI * 2);
        g.drawImage(img, -sz / 2, -sz / 2, sz, sz); g.restore();
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
      } else if (f.t === 'burst') { // 攻撃が発動したマス
        const col = f.kind === 'ice' ? '170,230,255' : f.kind === 'bolt' ? '255,240,120' : f.kind === 'trap' ? '220,150,255' : '255,200,120';
        g.fillStyle = `rgba(${col},${0.75 * (1 - a)})`;
        const pad = ts * 0.15 * a;
        for (const t of f.tiles) g.fillRect(ox + t.x * ts + pad, oy + t.y * ts + pad, ts - pad * 2, ts - pad * 2);
      } else if (f.t === 'bossdie') { // ボスの撃破：白く光りながら床へ沈んで消え、光の粒が立ちのぼる
        const fr = SP.s.enemy[f.sprite]; if (!fr) continue;
        const img = fr[0], dw = ts * img.width / TILE, x = ox + (f.x + 0.5) * ts - dw / 2, foot = oy + (f.y + 1) * ts, top = foot - dw;
        g.save(); g.beginPath(); g.rect(x - ts, top - ts, dw + 2 * ts, foot - top + ts); g.clip();
        const sink = a * a * dw * 0.55;
        g.globalAlpha = Math.max(0, 1 - a * 1.1); g.drawImage(img, x, top + sink, dw, dw);
        g.globalAlpha = Math.max(0, 1 - a) * (0.5 + 0.5 * Math.abs(Math.sin(a * 18))); g.drawImage(SP.tinted(img, '#ffffff'), x, top + sink, dw, dw);
        g.restore(); g.globalAlpha = 1;
        g.fillStyle = '#ffe8a0';
        for (let i = 0; i < 14; i++) { const h = (i * 97) % 100 / 100, px = x + dw * (0.2 + 0.6 * h), py = foot - ts * 0.3 - a * ts * (1 + h * 1.5); g.globalAlpha = Math.max(0, 1 - a); g.fillRect(px, py, 3 * k, 3 * k); }
        g.globalAlpha = 1;
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
    // 気配察知：この階の生きている敵すべてに印（未探索の場所でも印だけ。地形は明かさない）
    if (run.sense === run.floor) for (const e of run.enemies) if (!G.isVisible(run, e.x, e.y)) {
      const x = x0 + e.x * c + c / 2, y = y0 + e.y * c + c / 2, r = Math.max(2, c * 0.8);
      g.strokeStyle = '#ff8a6a'; g.lineWidth = Math.max(1, c * 0.35); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#ff5a4a'; g.fillRect(x - c * 0.4, y - c * 0.4, c * 0.8, c * 0.8);
    }
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
      pickups: TS.Game.villagePickups ? TS.Game.villagePickups(V) : [],   // 村で拾える品（拾うと消える）
    };
  };

  /* 人物の絵（見本から作った 52×64 の絵）を、足元 (fx, fy) にそろえて描く。k：1ドットの大きさ */
  RD.drawChar = function (g, img, fx, fy, k, bob) {
    const B = (TS.ASSETS && TS.ASSETS.charBox) || { w: 52, h: 64, foot: 62 };
    g.drawImage(img, Math.round(fx - B.w / 2 * k), Math.round(fy - (B.foot + (bob || 0)) * k), Math.round(img.width * k), Math.round(img.height * k));
  };

  /* 村（歩ける1画面）。地面の1枚の上に、建物・木・小物・人物を足元の高さ順に重ねる。
   * W：たけの位置と向き（UI が動かす）。戻り値：タップ判定用の範囲と、画面の座標→マスの変換 */
  let rmq = null;
  /* 噴水の水流と波紋（ZIP take-sai-fountain-endgame-v1 の fountain-overlay.js の描き方と数値をそのまま移したもの）。
   * 世界の座標で描く（カメラの位置 ox・oy と倍率 k は、ここで1回だけかける）。時間は描画ループの now（新しいタイマーは作らない）。
   * 波紋：外側の水盤の楕円で切り抜き、さらに噴水の絵の「外側の水面」の点だけに残す（段の石・前の石縁には出ない＝石縁が手前）。
   * 動きを減らす設定では、水流の伸び縮みと波紋を止める（水流の絵は出す） */
  let fountainMask = null;
  function fountainWaterMask(img, seed) {
    if (fountainMask && fountainMask.img === img) return fountainMask.cv;
    const W = img.width, H = img.height, d = img.getContext('2d').getImageData(0, 0, W, H).data;
    const isWater = (i) => d[i * 4 + 3] > 0 && d[i * 4 + 1] > d[i * 4] + 25 && d[i * 4 + 2] > d[i * 4] + 15;
    const on = new Uint8Array(W * H), st = [seed[1] * W + seed[0]];
    while (st.length) { const i = st.pop(); if (on[i] || !isWater(i)) continue; on[i] = 1; const x = i % W, y = (i / W) | 0;
      if (x > 0) st.push(i - 1); if (x < W - 1) st.push(i + 1); if (y > 0) st.push(i - W); if (y < H - 1) st.push(i + W); }
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), m = g.createImageData(W, H);
    for (let i = 0; i < W * H; i++) if (on[i]) m.data[i * 4 + 3] = 255;
    g.putImageData(m, 0, 0);
    fountainMask = { img, cv };
    return cv;
  }
  let rippleCv = null;
  function drawFountainFx(g, o, ox, oy, k, now) {
    const F = TS.ASSETS.village.decor.fountainFx, spray = SP.art.village.deco_fountain_spray;
    if (!F || !spray) return;
    const t = REDUCED() ? 0 : now / 1000, still = REDUCED();
    // 波紋（水盤の水面だけ）
    if (!still) {
      const S = k * 2, W = o.w, H = o.h;
      if (!rippleCv) rippleCv = document.createElement('canvas');
      if (rippleCv.width !== W * S || rippleCv.height !== H * S) { rippleCv.width = W * S; rippleCv.height = H * S; }
      const r = rippleCv.getContext('2d');
      r.setTransform(1, 0, 0, 1, 0, 0); r.globalCompositeOperation = 'source-over'; r.globalAlpha = 1; r.clearRect(0, 0, W * S, H * S);
      r.setTransform(S, 0, 0, S, 0, 0);
      const [cx, cy, rx, ry] = F.basin;
      r.save(); r.beginPath(); r.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); r.clip();
      r.strokeStyle = '#d4fbff'; r.lineWidth = Math.max(0.5, rx * 0.018);
      for (let i = 0; i < 3; i++) {
        const p = ((t * 0.55 + i / 3) % 1 + 1) % 1;
        r.globalAlpha = 0.24 * (1 - p);
        r.beginPath(); r.ellipse(cx, cy, rx * (0.18 + 0.8 * p), ry * (0.18 + 0.8 * p), 0, 0, Math.PI * 2); r.stroke();
      }
      r.restore();
      r.setTransform(1, 0, 0, 1, 0, 0); r.globalAlpha = 1; r.globalCompositeOperation = 'destination-in'; r.imageSmoothingEnabled = false;
      r.drawImage(fountainWaterMask(o.img, F.basinSeed), 0, 0, W * S, H * S);
      r.globalCompositeOperation = 'source-over';
      g.drawImage(rippleCv, Math.round(ox + o.x * k), Math.round(oy + o.y * k), W * k, H * k);
    }
    // 水流：下端中央を吹き出し口に。幅は水盤の幅×0.46、不透明度0.82、縦にだけ小さく伸び縮み
    const w = o.w * F.width, h = w * spray.height / spray.width, sy = 1 + (still ? 0 : 0.025 * Math.sin(t * 4));
    g.save();
    g.translate(ox, oy); g.scale(k, k);
    g.globalAlpha *= F.alpha; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.translate(o.x + F.nozzle[0], o.y + F.nozzle[1]); g.scale(1, sy);
    g.drawImage(spray, -w / 2, -h, w, h);
    g.restore();
  }
  const REDUCED = () => { try { if (!rmq) rmq = window.matchMedia('(prefers-reduced-motion: reduce)'); return rmq.matches; } catch (e) { return false; } };
  RD.drawVillage = function (canvas, V, now, W8) {
    const { g, W, H } = fit(canvas);
    const VLm = VL(), T = VLm.T;
    const lv = RD.villageLevels(V);
    const key = JSON.stringify(lv) + (SP.art && SP.art.ready ? '/art' : '');   // 素材の絵が読み込めたら作り直す
    if (!vcache || vcache.key !== key) vcache = Object.assign({ key }, VLm.build(lv));
    const vc = vcache;
    // 1ドットの大きさは整数倍（にじませない）。横11マス・縦9マスほどが見える大きさ
    const k = Math.max(1, Math.floor(Math.min(W / 11, H / 9) / T));
    const wp = W8 ? RD.walkerPos(W8, now) : { x: VLm.START.x, y: VLm.START.y };
    const mapW = vc.W * k, mapH = vc.H * k;
    const cxw = (wp.x + 0.5) * T * k, cyw = (wp.y + 0.5) * T * k;
    const ox = mapW <= W ? Math.round((W - mapW) / 2) : Math.round(Math.min(0, Math.max(W - mapW, W / 2 - cxw)));
    const oy = mapH <= H ? Math.round((H - mapH) / 2) : Math.round(Math.min(0, Math.max(H - mapH, H * 0.55 - cyw)));
    g.fillStyle = '#4a7a34'; g.fillRect(0, 0, W, H);
    g.drawImage(vc.ground, ox, oy, mapW, mapH);
    // 水面のきらめき
    g.fillStyle = 'rgba(230,250,255,0.7)';
    for (let i = 0; i < 26; i++) {
      const x = ((i * 97 + now / 40) % vc.W), y = 22 * T + 12 + (i * 37) % 80;
      g.globalAlpha = 0.35 + 0.35 * Math.sin(now / 500 + i);
      g.fillRect(ox + Math.round(x) * k, oy + y * k, 5 * k, k);
    }
    g.globalAlpha = 1;
    // 重ねる物を集める
    const list = [];
    for (const o of vc.objs) list.push({ y: o.sortY, o });
    const pal = SP.art && SP.art.chars ? SP.art.chars : {};
    const bob2 = (i) => (Math.floor(now / 520 + i) % 2);
    for (const n of vc.npcs) {
      const a = pal[n.who];
      let img = a && a.front;
      // たけが近くにいれば、そちらを向く（背面の絵があるときは上を向く）
      if (a && W8 && Math.abs(W8.x - n.x) + Math.abs(W8.y - n.y) <= 2 && W8.y < n.y && a.back) img = a.back;
      list.push({ y: (n.y + 1) * T - 1, char: img, fx: n.x, fy: n.y, bob: bob2(n.x), who: n.who });
    }
    // 子供（素材の絵は向きの静止画。たけが近くに来たらそちらを向く）と猫（座る・眠る。黒猫は2マスを行き来する）
    const VA = TS.ASSETS && TS.ASSETS.village, VART = (SP.art && SP.art.village) || {};
    const near = [];
    for (const kd of vc.kids) {
      if (kd.cv) { list.push({ y: (kd.y + 1) * T - 1, small: kd.cv, fx: kd.x, fy: kd.y, bob: bob2(kd.y) }); near.push({ kind: 'kid', id: kd.id, x: kd.x, y: kd.y, w: 22, h: 38 }); continue; }
      let face = kd.face;
      if (W8) { const dx = wp.x - kd.x, dy = wp.y - kd.y; if (Math.abs(dx) + Math.abs(dy) <= 2) face = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy < 0 ? 'back' : 'front'); }
      const img = VART[VA.kids[kd.id] + '_' + face] || VART[VA.kids[kd.id] + '_front'];
      list.push({ y: (kd.y + 1) * T - 1, sprite: img, anchor: VA.kidAnchor, fx: kd.x, fy: kd.y, shadow: 8 });
      near.push({ kind: 'kid', id: kd.id, x: kd.x, y: kd.y, w: 22, h: 38 });
    }
    for (const ct of vc.cats) {
      const p = RD.catPose(ct, now);
      if (ct.cv) list.push({ y: (ct.y + 1) * T - 2, small: ct.cv, fx: p.x, fy: ct.y, bob: 0 });
      else list.push({ y: (ct.y + 1) * T - 2, sprite: VART[VA.cats[ct.id] + '_' + p.pose], anchor: VA.catAnchor, fx: p.x, fy: ct.y, shadow: 6 });
      near.push({ kind: 'cat', id: ct.id, x: p.x, y: ct.y, w: 24, h: 22 });
    }
    // たけ
    {
      // 村でも同じ歩行コマ（左足・通過・右足・通過）。止まると待機。武器を装備していなければ剣のない絵
      const dir = W8 ? W8.dir : 'up';
      const set0 = SP.s.take[dir === 'up' ? 'up' : dir === 'left' ? 'left' : dir === 'right' ? 'right' : 'down'];
      const set = set0 && set0.nw && !G.equipped(V.bag, 'weapon') ? set0.nw : set0;
      const moving = !!(W8 && W8.moving && now - W8.t0 < W8.dur);
      let img = null;
      if (set && set.art && set.idle) img = RD.walkFrame(set, moving, moving ? (now - W8.t0) / W8.dur : 0, W8 ? (W8.steps || 0) : 0);
      else { const t = pal.take; img = t && (dir === 'up' ? t.back : dir === 'left' ? t.side : dir === 'right' ? t.sideR : t.front); }
      list.push({ y: (wp.y + 1) * T - 0.5, char: img, fx: wp.x, fy: wp.y, bob: 0, take: true, dir });
    }
    // ヤナイの記念像（青銅の像）：台座と同じ重なり順
    if (SP.art && SP.art.statue && vc.statue) list.push({ y: 13 * T - 0.9, statue: true });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) {
      if (it.statue) { const s = SP.art.statue, B = TS.ASSETS.charBox; g.drawImage(s, Math.round(ox + vc.statue[0] * k - B.w / 2 * k), Math.round(oy + vc.statue[1] * k - B.foot * k), s.width * k, s.height * k); continue; }
      if (it.o) {
        const o = it.o;
        if (o.img) {
          // 舟だけ、ゆっくり上下（描く位置だけ。動きを減らす設定では止める）
          const bob = o.bob && !REDUCED() ? Math.round(Math.sin(now / o.bob.period * Math.PI * 2) * o.bob.amp * k) : 0;
          const x = Math.round(ox + o.x * k), y = Math.round(oy + o.y * k) + bob, w = Math.round(ox + (o.x + o.w) * k) - x, h = Math.round(oy + (o.y + o.h) * k) - (y - bob);
          if (o.src) g.drawImage(o.img, o.src[0], o.src[1], o.src[2], o.src[3], x, y, w, h); else g.drawImage(o.img, x, y, w, h);
          if (o.fountainFx) drawFountainFx(g, o, ox, oy, k, now);
          continue;
        }
        if (o.crop) g.drawImage(o.cv, o.crop[0], o.crop[1], o.crop[2], o.crop[3], ox + o.x * k, oy + o.y * k, o.crop[2] * k, o.crop[3] * k);
        else g.drawImage(o.cv, ox + o.x * k, oy + o.y * k, o.cv.width * k, o.cv.height * k);
        continue;
      }
      const fx = ox + (it.fx + 0.5) * T * k, fy = oy + (it.fy + 1) * T * k - 2 * k;
      g.fillStyle = 'rgba(20,14,30,0.28)'; g.beginPath(); g.ellipse(fx, fy, (it.shadow || 11) * k, (it.shadow ? it.shadow * 0.32 : 3.5) * k, 0, 0, Math.PI * 2); g.fill();
      if (it.anchor) { if (it.sprite) g.drawImage(it.sprite, Math.round(fx - it.anchor[0] * k), Math.round(fy + 2 * k - it.anchor[1] * k), it.sprite.width * k, it.sprite.height * k); continue; }
      if (it.small) { g.drawImage(it.small, Math.round(fx - it.small.width / 2 * k), Math.round(fy - (it.small.height - 1 + it.bob) * k), it.small.width * k, it.small.height * k); continue; }
      if (it.char) RD.drawChar(g, it.char, fx, fy + 2 * k, k, it.bob);
      else if (it.take) g.drawImage(SP.s.take[it.dir === 'up' ? 'up' : it.dir] ? SP.s.take[it.dir].walk[0] : SP.s.take.down.walk[0], Math.round(fx - 16 * k), Math.round(fy - 30 * k), 32 * k, 32 * k);
    }
    // 灯り・湯気・煙
    g.globalCompositeOperation = 'lighter';
    for (const [lx, ly, r] of vc.lights) {
      const fl = 0.8 + 0.2 * Math.sin(now / 300 + lx), x = ox + lx * k, y = oy + ly * k, rr = r * k * 1.4;
      const gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, `rgba(255,200,110,${0.22 * fl})`); gr.addColorStop(1, 'rgba(255,200,110,0)');
      g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    g.globalCompositeOperation = 'source-over';
    for (const [x0, y0, kind] of vc.smoke.map((s) => [s[0], s[1], 'smoke']).concat(vc.steam.map((s) => [s[0], s[1], s[2] || 'steam']))) {
      for (let i = 0; i < 3; i++) {
        const t = ((now / (kind === 'fountain' ? 600 : 1500)) + i / 3) % 1;
        if (kind === 'fountain') { g.fillStyle = 'rgba(210,245,255,0.9)'; g.fillRect(ox + (x0 + (i - 1) * 8 * t) * k, oy + (y0 - Math.sin(t * Math.PI) * 14) * k, 2 * k, 2 * k); continue; }
        g.fillStyle = kind === 'smoke' ? `rgba(210,210,220,${0.6 * (1 - t)})` : `rgba(255,255,255,${0.6 * (1 - t)})`;
        g.beginPath(); g.arc(ox + (x0 + Math.sin(t * 6 + i) * 3) * k, oy + (y0 - t * 24) * k, (3 + t * 5) * k, 0, Math.PI * 2); g.fill();
      }
    }
    // 名札（文字は絵に焼き込まず、画面の文字として描く）
    const dpr = W / Math.max(1, canvas.clientWidth);
    g.font = `bold ${Math.round(11 * dpr)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [t, x, y] of vc.labels) {
      const tw = g.measureText(t).width + 10 * dpr, px = ox + x * k, py = oy + y * k, hh = Math.round(16 * dpr);
      g.fillStyle = 'rgba(10,32,40,0.86)'; g.fillRect(Math.round(px - tw / 2), Math.round(py - hh / 2), Math.round(tw), hh);
      g.fillStyle = 'rgba(226,178,60,0.95)'; g.fillRect(Math.round(px - tw / 2), Math.round(py + hh / 2) - dpr, Math.round(tw), dpr);
      g.fillStyle = '#fff4dc'; g.fillText(t, px, py);
    }
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    // 行き先の印
    if (W8 && W8.goal) { const gx = ox + (W8.goal.x + 0.5) * T * k, gy = oy + (W8.goal.y + 0.7) * T * k; g.strokeStyle = `rgba(255,240,160,${0.5 + 0.4 * Math.sin(now / 150)})`; g.lineWidth = k; g.beginPath(); g.ellipse(gx, gy, 9 * k, 4 * k, 0, 0, Math.PI * 2); g.stroke(); }
    // タップ判定（画面のCSSピクセル）
    const cw = W / canvas.clientWidth;
    const hits = [];
    const rect = (id, x, y, w, h, kind) => hits.push({ id, kind, x: (ox + x * k) / cw, y: (oy + y * k) / cw, w: w * k / cw, h: h * k / cw });
    for (const n of vc.npcs) rect(n.fac, n.x * T - 4, (n.y + 1) * T - 56, T + 8, 56, 'npc');
    // 子供・猫：絵の大きさに合わせた小さめの範囲（施設の建物より先に調べる。大人の人より後）
    for (const n of near) rect(n.id, (n.x + 0.5) * T - n.w / 2, (n.y + 1) * T - n.h, n.w, n.h, n.kind);
    for (const f of vc.fac) { const up = f.dock ? 0 : 30; rect(f.id, f.fp[0] * T, f.fp[1] * T - up, f.fp[2] * T, f.fp[3] * T + up, 'fac'); }   // 船着き場は桟橋と舟だけ（岸の道は含めない）
    if (vc.yanai) rect('statue', 9 * T, 11 * T - 60, 2 * T, 2 * T + 60, 'statue');   // マスターヤナイの像は、建てたあとだけ話しかけられる
    rect('site', 1 * T, 1 * T - 10, 5 * T, 3 * T + 10, 'site'); rect('site', 14 * T, 1 * T - 10, 5 * T, 3 * T + 10, 'site');
    return { hits, tile: (cx, cy) => ({ x: Math.floor((cx * cw - ox) / (T * k)), y: Math.floor((cy * cw - oy) / (T * k)) }), fac: vc.fac, solid: vc.solid, pickups: vc.pickups || [] };
  };
  /* 猫の今の姿勢と位置（時間だけで決める。タイマーを使わないので、村の画面を離れたり裏に回ったりすると止まる）。
   * 黒猫：座る（4秒）→ 右へ歩く（1.6秒）→ 座る（4秒）→ 左へ歩く。茶白：ふだんは座り、ときどき丸くなって眠る。三毛：眠る */
  RD.catPose = function (ct, now) {
    if (ct.walk) {
      const [a, b] = ct.walk, cyc = 11200, t = (now + ct.x * 997) % cyc;
      if (t < 4000) return { x: a, pose: 'sit' };
      if (t < 5600) return { x: a + (b - a) * (t - 4000) / 1600, pose: 'right' };
      if (t < 9600) return { x: b, pose: 'sit' };
      return { x: b - (b - a) * (t - 9600) / 1600, pose: 'left' };
    }
    if (ct.pose === 'sit') return { x: ct.x, pose: (now % 26000) > 19000 ? 'sleep' : 'sit' };
    return { x: ct.x, pose: ct.pose };
  };
  // 歩いている途中の位置（マスの間をなめらかに）
  RD.walkerPos = function (w, now) {
    if (!w.moving || !w.from) return { x: w.x, y: w.y };
    const t = Math.min(1, (now - w.t0) / w.dur);
    return { x: w.from.x + (w.x - w.from.x) * t, y: w.from.y + (w.y - w.from.y) * t };
  };

  TS.Render = RD;
})(globalThis.TS = globalThis.TS || {});
