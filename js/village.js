/* 村（歩ける1画面）。デザイン見本 assets/reference/village.png の「発展後の村の広場」をもとにした、見下ろし型のマス目の村。
 * 1マス32ドット、横20×縦26マス。上から「丘の上の寺院と建設予定地 → 鍛冶屋・展示室 → ヤナイの記念像のある石畳の広場
 * → サイの店・倉庫 → 復興本部（モッ）・食堂 → 水路ぞいの道と船着き場（ティウ）」。
 * 施設の建物は解放されるまで空き地のまま（解放条件は js/data.js のとおり。学校・図書館は外観だけの建設予定地）。
 * 描画は「地面（動かない1枚）」と「建物・木・人物（足元の高さ順に重ねる）」に分ける。
 * 足元より上に出る屋根や木の葉は、その奥（上の行）にいる人物の手前に描かれる。 */
(function (TS) {
  'use strict';
  const SP = TS.Sprites;
  const T = 32, MW = 20, MH = 26;
  const VL = { T, MW, MH };

  // ---------------- 色 ----------------
  const C = {
    ol: '#2a1610',
    roof: '#c4532e', roofTeal: '#2f7f78',
    wood: '#8b5a32', woodD: '#5e3a1e', woodL: '#b8834e',
    stucco: '#efe0c0', stone: '#d9ccae', stoneD: '#a89a7c',
    gold: '#e2b23c', goldD: '#a2741c', goldL: '#ffe28c',
    teal: '#1f8f8a', brick: '#b8583a', grass: '#6aa83e', leaf: '#3f8f3a', water: '#2aa2c0',
    pink: '#f08cb0', cream: '#f4ead2', red: '#c8402c',
  };
  const R = (c) => SP.ramp(c);
  const sh = (c, t) => SP.shade(c, t);
  const mix = (a, b, t) => SP.mix(a, b, t);
  const hash = (x, y, s) => SP.hash(x, y, s);

  // ---------------- 配置 ----------------
  /* 施設：fp=建物の足元（マス）、npc=担当の人、at=話しかける/入るときに立つマス、face=そのときの向き */
  function layout(lv) {
    const L = { objs: [], npcs: [], fac: [], deco: [] };
    L.fac.push({ id: 'smith', name: lv.smith ? '鍛冶屋' : '鍛冶屋（空き地）', fp: [1, 6, 5, 3], at: [3, 9], face: 'up', npc: 'koi', npcAt: [5, 9], built: lv.smith > 0 });
    L.fac.push({ id: 'museum', name: lv.museum ? '展示室' : '展示室（空き地）', fp: [14, 6, 5, 3], at: [16, 9], face: 'up', built: lv.museum });
    // サイの店（2026年10月の素材）：左の入口の前にサイ、その下が店に入る位置。足元は左端の草地まで5マス
    L.fac.push({ id: 'shop', name: 'サイの店', fp: [0, 11, 5, 3], at: [1, 15], face: 'up', npc: 'sai', npcAt: [1, 14], built: true });
    // 倉庫：v2の絵は扉が中央。扉を入る位置 (16,14) の真上に置くので、絵の左端（麻袋）は足元の外の (14,…) に少しかかる。
    // 足元（通れないマス）は15〜18のまま：x13〜14 の通路（広場の下半分と上半分をつなぐ）を2マスあけておく
    L.fac.push({ id: 'storage', name: '倉庫', fp: [15, 11, 4, 3], at: [16, 14], face: 'up', built: true });
    /* 村の発展（こもれびの家、2026年10月）：敷地は今までの4×3マス。入口の階段は x2 の下（20行の道）から上を向いて入る。
     * もっちゃんは階段の左わきの縁側 (1,19)。港への道（20行）はあけておく。機能・名前（下のボタン・メニュー）は「村の発展」のまま。地図の名札は家の名前 */
    L.fac.push({ id: 'develop', name: '村の発展', fp: [1, 17, 4, 3], at: [2, 20], face: 'up', npc: 'mot', npcAt: [1, 19], built: true });
    // 食堂：v2の絵は入口が左寄り。入口の前の道 (15,20) から上を向いて入る。ワーンは入口の左わき (14,19)
    L.fac.push({ id: 'diner', name: lv.diner ? '食堂' : '食堂（空き地）', fp: [15, 17, 4, 3], at: [15, 20], face: 'up', npc: 'waan', npcAt: [14, 19], built: lv.diner });
    /* 船着き場（港 v1）：桟橋は x10 の1列（板の上の (10,22)・(10,23) だけ歩ける）。小舟は桟橋の先の右に横付け。
     * 出発は桟橋の先 (10,23) で舟（右）を向いて。案内人ティウは入口わきの陸 (12,21)。fp は桟橋と舟のタップ範囲 */
    L.fac.push({ id: 'depart', name: '出発（船着き場）', fp: [10, 22, 6, 3], at: [10, 23], face: 'right', npc: 'tiw', npcAt: [12, 21], built: true, dock: true });
    return L;
  }

  // 地面の種類：g 草 / p 石畳 / b レンガの道 / w 水 / d 桟橋 / s 石段 / t 寺院の基壇 / r 赤い橋 / f 向こう岸
  function groundMap(lv) {
    const G = [];
    for (let y = 0; y < MH; y++) {
      const row = [];
      for (let x = 0; x < MW; x++) {
        let c = 'g';
        if (y <= 3 && x >= 7 && x <= 12) c = 't';
        if (y === 4 && (x === 9 || x === 10)) c = 's';
        if (y === 5 && x >= 1 && x <= 18) c = 'b';
        if (y >= 6 && y <= 20 && x >= 5 && x <= 14) c = 'p';
        if ((y === 9 || y === 10) && x >= 1 && x <= 18) c = 'p';
        if (y >= 14 && y <= 16 && x >= 1 && x <= 18) c = 'p';
        if (y === 11 && x >= 5 && x <= 8) c = 'g';      // 広場の左の木陰（木・ベンチ・本を読む子）
        if (y >= 20 && y <= 21) c = 'b';
        if (y >= 22 && y <= 24) c = 'w';
        if (y >= 22 && y <= 23 && x === 10) c = 'd';   // 桟橋の板（欄干・水面は通れない）
        if (y === 25) c = 'f';
        // 赤い橋（村の発展「橋」）：素材の絵があるときは x3 の1列（橋の板の真ん中を歩く。欄干は通れない）。無ければ以前の2列
        if (lv.decor.bridge && y >= 22 && y <= 24 && (x === 3 || (x === 4 && !lv.bridgeArt))) c = 'r';
        row.push(c);
      }
      G.push(row);
    }
    return G;
  }
  const WALK = { g: 0, p: 1, b: 1, w: 0, d: 1, s: 1, t: 0, r: 1, f: 1 };

  // ---------------- 地面を描く ----------------
  /* 街の床の模様（assets/village/ground/）：128×128 の画像を色の表にして、地図のドット座標で写す（世界に固定）。
   * 明暗は contrast の割合で平均の色へ寄せて控えめにする（人物・建物・猫を引き立てる）。読み込めなければ null（今までの床） */
  const texCache = {};
  function texTable(name, night) {
    const key = name + (night ? ':n' : '');
    if (texCache[key] !== undefined) return texCache[key];
    const GA = TS.ASSETS && TS.ASSETS.village && TS.ASSETS.village.ground, cv = SP.art && SP.art.ground && SP.art.ground[name];
    if (!GA || !cv) return null;
    const n = cv.width, d = cv.getContext('2d').getImageData(0, 0, n, n).data, k = GA.textures[name], dim = night ? 0.82 : 1;
    let mr = 0, mg = 0, mb = 0;
    for (let i = 0; i < n * n; i++) { mr += d[i * 4]; mg += d[i * 4 + 1]; mb += d[i * 4 + 2]; }
    mr /= n * n; mg /= n * n; mb /= n * n;
    const hex = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    const t = new Array(n * n);
    for (let i = 0; i < n * n; i++) t[i] = '#' + hex((mr + (d[i * 4] - mr) * k) * dim) + hex((mg + (d[i * 4 + 1] - mg) * k) * dim) + hex((mb + (d[i * 4 + 2] - mb) * k) * dim);
    return (texCache[key] = t);
  }
  // 地図のドット (gx, gy) の色（128で割った余り＝4×4マスで1周）
  const texAt = (t, gx, gy) => t[(((gy % 128) + 128) % 128) * 128 + (((gx % 128) + 128) % 128)];
  /* 水面（assets/village/ground/water.png、256×256）：世界の座標で、256ごとに左右・上下を交互に反転して並べる（512で1周）。
   * 反転した2枚は同じ縁どうしで接するので、継ぎ目が出ない（同梱の river-renderer.js と同じ並べ方） */
  const WATER_N = 256;
  const waterAt = (t, gx, gy) => {
    let u = ((gx % 512) + 512) % 512, v = ((gy % 512) + 512) % 512;
    if (u >= WATER_N) u = 2 * WATER_N - 1 - u;
    if (v >= WATER_N) v = 2 * WATER_N - 1 - v;
    return t[v * WATER_N + u];
  };

  function paintGround(lv, G, treeSpots) {
    const P = new SP.Pix(MW * T, MH * T);
    const night = lv.night;
    const TX = { sandstone: texTable('sandstone', night), brick: texTable('brick', night), grass: texTable('grass', night), earth: texTable('earth', night) };
    const WT0 = texTable('water', night), WT = WT0 && WT0.length === WATER_N * WATER_N ? WT0 : null;   // 水面（読み込めなければ今までの水）
    const fillTex = (t, X, Y) => { for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) P.set(X + x, Y + y, texAt(t, X + x, Y + y)); };
    const gb = night ? '#5a8a44' : C.grass;
    const at = (x, y) => (y >= 0 && y < MH && x >= 0 && x < MW ? G[y][x] : 'g');
    for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) {
      const k = G[ty][tx], X = tx * T, Y = ty * T;
      if ((k === 'g' || k === 'f') && TX.grass) {
        fillTex(TX.grass, X, Y);   // 草地（素材の模様。葉や花は模様に含まれる）
      } else if ((k === 'p') && TX.sandstone) {
        fillTex(TX.sandstone, X, Y);   // 中央広場・主な歩く道：砂岩の石畳
      } else if ((k === 'b' || k === 's') && TX.brick) {
        fillTex(TX.brick, X, Y);   // 寺院への道・港沿いの道：赤茶のレンガ
        if (k === 's') for (let y = 0; y < T; y += 8) { P.rect(X, Y + y, T, 2, sh(C.stone, 0.15)); P.rect(X, Y + y + 6, T, 2, C.stoneD); }
      } else if (k === 'g' || k === 'f') {
        for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
          const h = hash(X + x, Y + y, 3);
          let c = sh(gb, ((hash((X + x) >> 2, (Y + y) >> 2, 5) & 7) - 3.5) * 0.018);
          if ((h & 31) === 0) c = sh(gb, 0.2); else if ((h & 63) === 1) c = sh(gb, -0.2);
          P.set(X + x, Y + y, c);
        }
        // 草の葉の束
        for (let i = 0; i < 3; i++) {
          const h = hash(tx, ty, 20 + i), x = X + 3 + (h % 25), y = Y + 5 + ((h >> 6) % 22);
          P.set(x, y, sh(gb, -0.3)); P.set(x + 1, y - 1, sh(gb, 0.25)); P.set(x - 1, y - 1, sh(gb, 0.1)); P.set(x, y - 2, sh(gb, 0.3));
        }
        // ときどき小さな花
        const fh = hash(tx, ty, 31);
        if ((fh & 7) === 0) { const x = X + 6 + (fh >> 4) % 20, y = Y + 6 + (fh >> 9) % 20, col = ['#ffe070', '#ffffff', '#ff9ac0'][fh % 3]; P.set(x, y, col); P.set(x + 1, y, col); P.set(x, y + 1, sh(col, -0.3)); }
      } else if (k === 'p') {
        // 石畳：16ドット角の石を半分ずらして敷く。石ごとに色を少し変え、左上を明るく、右下に目地の影
        for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
          const gx = X + x, gy = Y + y, row = gy >> 4, off = (row & 1) * 8, sx = (gx + off) >> 4, lx = (gx + off) & 15, ly = gy & 15;
          const v = ((hash(sx, row, 7) & 15) - 7) * 0.012;
          let c = sh(night ? '#c8bca2' : C.stone, v);
          if (lx === 0 || ly === 0) c = sh(c, 0.12);
          if (lx === 15 || ly === 15) c = night ? '#8a7e66' : C.stoneD;
          else if (lx === 14 || ly === 14) c = sh(c, -0.1);
          if ((hash(gx, gy, 9) & 63) === 0) c = sh(c, -0.12);
          P.set(gx, gy, c);
        }
      } else if (k === 'b' || k === 's') {
        // レンガの道（赤茶）：8×4のレンガを互い違いに
        for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
          const gx = X + x, gy = Y + y, row = gy >> 2, off = (row & 1) * 4, bx = (gx + off) >> 3;
          let c = sh('#c08460', ((hash(bx, row, 11) & 7) - 3.5) * 0.03);
          if (((gx + off) & 7) === 7 || (gy & 3) === 3) c = '#8a5a3e';
          P.set(gx, gy, c);
        }
        if (k === 's') for (let y = 0; y < T; y += 8) { P.rect(X, Y + y, T, 2, sh(C.stone, 0.15)); P.rect(X, Y + y + 6, T, 2, C.stoneD); }
      } else if (k === 't' && TX.sandstone && lv.ruinArt) {
        // 寺院の段（遺跡の床）：砂岩の石畳を古びた色に（少し暗く、赤みを足す）
        for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) P.set(X + x, Y + y, mix(texAt(TX.sandstone, X + x, Y + y), '#7a4a34', 0.32));
      } else if (k === 't') {
        for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) P.set(X + x, Y + y, sh('#9a5a3a', ((hash(X + x >> 3, Y + y >> 2, 4) & 7) - 3.5) * 0.03));
      } else if ((k === 'w' || k === 'd' || k === 'r') && WT) {
        // 水面の素材（川の中だけに描く）。手前の岸ぎわほど少しだけ深い色に、上の岸壁の下に薄い影
        for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
          const gx = X + x, gy = Y + y, depth = (gy - 22 * T) / (3 * T), top = gy - 22 * T;
          let c = mix(waterAt(WT, gx, gy), night ? '#0e2a44' : '#0e5a78', depth * 0.18);
          if (top < 14) c = mix(c, '#0a3a50', (14 - top) / 14 * 0.3);
          P.set(gx, gy, c);
        }
      }
      if (k === 'w' || k === 'd' || k === 'r') {
        if (!WT) for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
          const gx = X + x, gy = Y + y, depth = (gy - 22 * T) / (3 * T);
          let c = mix(night ? '#2a7090' : '#3cc0d8', night ? '#163a5a' : '#1a78a8', Math.min(1, depth * 1.2));
          if ((hash(gx >> 1, gy, 6) & 31) === 0) c = sh(c, 0.25);
          P.set(gx, gy, c);
        }
        if (k === 'd' && !lv.pierArt) { // 桟橋（素材の絵があるときは水面だけ描き、桟橋は絵で重ねる）
          for (let y = 0; y < T; y++) for (let x = 2; x < T - 2; x++) {
            const py = (Y + y) % 8;
            P.set(X + x, Y + y, py === 7 ? C.woodD : py === 0 ? C.woodL : sh(C.wood, ((hash(X + x >> 4, Y + y >> 3, 2) & 3) - 1.5) * 0.05));
          }
          P.rect(X + 2, Y, 1, T, C.woodD); P.rect(X + T - 3, Y, 1, T, C.woodD);
          if (ty === 23) { P.rect(X + 3, Y + T - 3, 4, 3, C.woodD); P.rect(X + T - 7, Y + T - 3, 4, 3, C.woodD); }
        }
        if (k === 'r' && !lv.bridgeArt) { // 赤い橋（板と欄干。素材の絵があるときは水面だけ描き、橋は絵で重ねる）
          for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const py = (Y + y) % 6; P.set(X + x, Y + y, py === 5 ? '#7a2a1c' : py === 0 ? '#e0744a' : '#c4482e'); }
          const edge = tx === 3 ? 0 : T - 3;
          P.rect(X + edge, Y, 3, T, '#8a2a1a'); P.rect(X + edge + 1, Y, 1, T, '#e86a3a');
        }
      }
      // 地面のさかい目：石畳・道のふちに縁石、水路の岸に石の護岸
      if (k === 'p' || k === 'b') {
        if (at(tx, ty - 1) === 'g') P.rect(X, Y, T, 2, sh(C.stone, -0.25));
        if (at(tx - 1, ty) === 'g') P.rect(X, Y, 2, T, sh(C.stone, -0.18));
        if (at(tx + 1, ty) === 'g') P.rect(X + T - 2, Y, 2, T, sh(C.stone, -0.3));
      }
      if (k === 'g' && (at(tx, ty - 1) === 'p' || at(tx, ty - 1) === 'b')) for (let x = 0; x < T; x++) P.set(X + x, Y, sh(gb, -0.35));
    }
    // 木の根元の土（草地の上だけ。ふちは市松に散らして、草と土を平らな境目にする）
    if (TX.earth && treeSpots) for (const [, tx, ty] of treeSpots) {
      if (!G[ty] || (G[ty][tx] !== 'g' && G[ty][tx] !== 'f')) continue;
      const cx = tx * T + 16, cy = (ty + 1) * T - 7, rx = 15, ry = 8;
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const gt = G[Math.floor(y / T)] && G[Math.floor(y / T)][Math.floor(x / T)];
        if (gt !== 'g' && gt !== 'f') continue;
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d > 1 || (d > 0.62 && ((x + y) & 1)) || (d > 0.82 && (hash(x, y, 77) & 1))) continue;
        P.set(x, y, texAt(TX.earth, x, y));
      }
    }
    // 水路の護岸（上の岸：石積みの壁、下の岸：石のふち）
    for (let x = 0; x < MW * T; x++) {
      const tx = x >> 5;
      if (G[22][tx] === 'w') for (let y = 0; y < 10; y++) {
        const yy = 22 * T + y, bw = ((Math.floor(y / 5) & 1) * 5 + x) % 10;
        P.set(x, yy, y < 2 ? sh(C.stone, 0.12) : bw === 0 || y % 5 === 4 ? C.stoneD : sh(C.stone, -0.05 - y * 0.02));
      }
      if (G[24][tx] === 'w') for (let y = 0; y < 4; y++) P.set(x, 25 * T - 4 + y, y === 0 ? '#1a5a78' : sh(C.stone, -0.1 + y * 0.05));
    }
    // 水面の蓮の葉と花
    for (let i = 0; i < (WT ? 8 : 26); i++) {   // 素材の水面のときは蓮を少しだけ残す
      const h = hash(i, 7, 41), x = (h % (MW * T)), y = 22 * T + 14 + ((h >> 10) % 70), tx = x >> 5, ty = y >> 5;
      if (G[ty] && G[ty][tx] !== 'w') continue;
      const r = 4 + (h >> 20) % 3;
      P.ball(x, y, r + 1, r * 0.6, R(night ? '#3a7a40' : '#4aa048'), { dither: false });
      P.set(x, y - 1, sh('#4aa048', -0.4)); P.set(x + 1, y - 1, sh('#4aa048', -0.4));
      if (i % 3 === 0) { P.ball(x - 1, y - 2, 2.5, 2, R(C.pink), { dither: false }); P.set(x - 1, y - 4, '#ffd8e8'); }
    }
    // 寺院の基壇のまわりの石段の影
    P.rect(7 * T, 4 * T - 2, 6 * T, 2, '#5a2a1a');
    // 広場の床の飾り：コンパスの紋（噴水がないとき）
    // 船着き場から像へまっすぐ続く参道（明るい石と金茶のふち）
    for (let y = 13 * T; y < 20 * T; y++) for (let x = 9 * T - 4; x < 11 * T + 4; x++) {
      if (x < 9 * T - 2 || x >= 11 * T + 2) P.set(x, y, '#b89a62');
      else if (x < 9 * T || x >= 11 * T) P.set(x, y, '#d8b874');
      else { const c = P.get(x, y); if (c) P.set(x, y, sh(c, 0.1)); }
    }
    if (!lv.decor.fountain) {
      const cx = 10 * T, cy = 17 * T + 16;
      for (let y = -22; y <= 22; y++) for (let x = -22; x <= 22; x++) {
        const d = Math.hypot(x, y * 1.15), a = Math.atan2(y, x);
        if (d > 22) continue;
        if (d > 19) P.set(cx + x, cy + y, sh(C.stoneD, -0.1));
        else if (Math.abs(Math.cos(a * 4)) * (20 - d) > 15 - d * 0.1 && d < 18) P.set(cx + x, cy + y, d < 6 ? C.goldL : (Math.abs(Math.cos(a * 2)) > 0.9 ? C.gold : '#b8a0d0'));
        else if (d > 16) P.set(cx + x, cy + y, sh(C.stone, 0.18));
      }
    }
    return P;
  }

  // ---------------- 部品を描く小さな道具 ----------------
  const outlineBox = (P, x, y, w, h, col) => { P.rect(x, y, w, 1, col); P.rect(x, y + h - 1, w, 1, col); P.rect(x, y, 1, h, col); P.rect(x + w - 1, y, 1, h, col); };

  /* タイの屋根（正面から少し見下ろした形）。瓦を段ごとに塗り、上の段ほど明るい。両端は金の破風、棟の端に反り返った飾り（チョーファー）。
   * x,y：屋根の左上、w,h：大きさ、col：瓦の色。tiers：重ね屋根の段数 */
  function roofThai(P, x, y, w, h, col, o) {
    o = o || {};
    const Rr = R(col), inset = o.inset !== undefined ? o.inset : Math.round(w * 0.16);
    const top = y, bot = y + h;
    for (let yy = top; yy < bot; yy++) {
      const t = (yy - top) / Math.max(1, h - 1);
      const xl = Math.round(x + inset * (1 - t)), xr = Math.round(x + w - inset * (1 - t));
      const row = Math.floor((yy - top) / 4), ly = (yy - top) % 4;
      for (let xx = xl; xx < xr; xx++) {
        const seam = ((xx - x) + (row & 1) * 3) % 6 === 0;
        let k = t < 0.25 ? 1 : t < 0.7 ? 2 : 3;
        if (ly === 3) k = Math.min(4, k + 1);
        if (ly === 0) k = Math.max(0, k - 1);
        if (seam && ly !== 0) k = Math.min(4, k + 1);
        if (xx - xl < 3) k = Math.max(0, k - 1);           // 左（光）側
        if (xr - xx <= 3) k = Math.min(4, k + 1);          // 右（影）側
        P.set(xx, yy, Rr[k]);
      }
      // 破風（金のふち）
      P.set(xl, yy, C.goldD); P.set(xl + 1, yy, C.gold); P.set(xr - 1, yy, C.goldD); P.set(xr - 2, yy, C.gold);
    }
    // 棟
    P.rect(x + inset, top - 2, w - inset * 2, 2, C.goldD); P.rect(x + inset, top - 3, w - inset * 2, 1, C.goldL);
    // 軒先の飾りと影
    P.rect(x - 1, bot, w + 2, 2, o.trim || C.teal); P.rect(x - 1, bot + 2, w + 2, 1, C.ol);
    for (let xx = x + 2; xx < x + w - 1; xx += 5) P.set(xx, bot + 1, C.goldL);
    // チョーファー（棟の両端の反り飾り）
    const cho = (cx, dir) => { P.set(cx, top - 3, C.gold); P.set(cx + dir, top - 4, C.gold); P.set(cx + dir * 2, top - 6, C.goldL); P.set(cx + dir * 2, top - 5, C.gold); P.set(cx + dir, top - 7, C.goldL); };
    cho(x + inset, -1); cho(x + w - inset - 1, 1);
    // 軒の端の小さな反り
    P.set(x - 2, bot - 1, C.gold); P.set(x - 3, bot - 3, C.goldL); P.set(x + w + 1, bot - 1, C.gold); P.set(x + w + 2, bot - 3, C.goldL);
    if (o.tiers > 1) roofThai(P, x + Math.round(w * 0.22), top - Math.round(h * 0.55), Math.round(w * 0.56), Math.round(h * 0.6), o.col2 || col, { trim: o.trim, inset: Math.round(w * 0.1) });
  }
  // 壁（しっくい＋木の柱、または板張り）。x,y：左上
  function wallFront(P, x, y, w, h, kind, col) {
    const base = col || (kind === 'plank' ? C.wood : C.stucco), Rw = R(base);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      let k = 2;
      if (kind === 'plank') { const px = (xx - x) % 7; k = px === 6 ? 3 : px === 0 ? 1 : 2; if ((hash(xx, yy >> 3, 3) & 15) === 0) k = 3; }
      else if ((hash(xx, yy, 8) & 15) === 0) k = 3;
      if (yy < y + 3) k = Math.min(4, k + 1);              // 軒下の影
      if (xx > x + w - 4) k = Math.min(4, k + 1);
      P.set(xx, yy, Rw[k]);
    }
    if (kind !== 'plank') for (let xx = x; xx < x + w; xx += 24) { P.rect(xx, y, 3, h, C.woodD); P.rect(xx + 1, y, 1, h, C.wood); }
    P.rect(x, y + h - 4, w, 4, C.stoneD); P.rect(x, y + h - 4, w, 1, sh(C.stone, 0.1));   // 石の土台
    P.rect(x - 1, y, 1, h, C.ol); P.rect(x + w, y, 1, h, C.ol);
  }
  function door(P, x, y, w, h, col) {
    P.rect(x - 2, y - 2, w + 4, h + 2, C.goldD); P.rect(x - 1, y - 1, w + 2, h + 1, C.gold);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) P.set(xx, yy, (xx - x) % 5 === 4 ? sh(col || C.woodD, -0.3) : sh(col || C.woodD, (yy - y) < 2 ? -0.35 : 0));
    P.rect(x + (w >> 1), y, 1, h, C.ol);
    P.set(x + (w >> 1) - 2, y + (h >> 1), C.goldL); P.set(x + (w >> 1) + 2, y + (h >> 1), C.goldL);
  }
  function windowLit(P, x, y, w, h, night) {
    outlineBox(P, x - 1, y - 1, w + 2, h + 2, C.woodD);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) P.set(xx, yy, night ? (yy < y + 2 ? '#ffb850' : '#ffd890') : (yy - y + xx - x) % 7 === 0 ? '#bfe8ff' : '#4a6a8a');
    P.rect(x + (w >> 1), y, 1, h, C.woodD);
    P.rect(x - 2, y + h + 1, w + 4, 2, C.woodL);
  }
  function awning(P, x, y, w, h, c1, c2) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const stripe = Math.floor((xx - x) / 6) & 1;
      P.set(xx, yy, sh(stripe ? c1 : c2, (yy - y) / h * -0.2 + (yy === y ? 0.2 : 0)));
    }
    for (let xx = x; xx < x + w; xx += 6) { P.set(xx + 2, y + h, sh(c1, -0.2)); P.set(xx + 3, y + h, sh(c1, -0.2)); P.set(xx + 2, y + h + 1, sh(c1, -0.35)); }
    P.rect(x, y + h - 1, w, 1, C.goldD);
  }
  function pot(P, x, y, flowers) {
    P.box(x - 4, y - 7, 9, 7, R('#b0603a'), { round: true });
    P.rect(x - 5, y - 8, 11, 2, '#d8804a');
    P.ball(x, y - 12, 6, 5, R(C.leaf), { bias: 0.1 });
    if (flowers) for (let i = 0; i < 4; i++) { const h = hash(x, y, i); P.set(x - 4 + (h % 9), y - 15 + ((h >> 4) % 6), flowers[i % flowers.length]); }
  }
  function barrel(P, x, y) { P.box(x - 5, y - 13, 11, 13, R('#9a6438'), { round: true }); P.rect(x - 5, y - 10, 11, 1, '#4a3020'); P.rect(x - 5, y - 4, 11, 1, '#4a3020'); }
  function crate(P, x, y, s) { s = s || 12; P.rect(x, y - s, s, s, '#b88850'); outlineBox(P, x, y - s, s, s, '#6a4424'); P.line(x, y - s, x + s - 1, y - 1, '#7a5430'); P.rect(x, y - s, s, 2, '#d8a868'); }
  function lantern(P, x, y) { P.rect(x - 1, y - 22, 2, 22, '#3a2418'); P.rect(x - 3, y - 28, 7, 7, C.ol); P.rect(x - 2, y - 27, 5, 5, '#ff9a3a'); P.rect(x - 1, y - 26, 3, 3, '#ffe08a'); P.rect(x - 4, y - 29, 9, 1, C.goldD); P.rect(x - 3, y - 1, 7, 2, '#5a4030'); }
  function banner(P, x, y, col) {
    P.rect(x, y - 44, 2, 44, '#5a3a20'); P.set(x, y - 45, C.goldL); P.set(x + 1, y - 45, C.goldL);
    for (let yy = 0; yy < 22; yy++) for (let xx = 0; xx < 10; xx++) { if (yy > 18 && Math.abs(xx - 4.5) < yy - 18) continue; P.set(x + 2 + xx, y - 42 + yy, sh(col, xx < 2 ? 0.15 : xx > 7 ? -0.2 : 0)); }
    P.ball(x + 7, y - 33, 2.5, 2.5, R(C.gold), { dither: false });
  }

  // ---------------- 建物 ----------------
  /* 1つの建物の絵を作る。戻り値 { cv, x, y }：x,y は地図上の左上（ドット） */
  function building(kind, fp, lv) {
    const [fx, fy, fw, fd] = fp, W = fw * T + 16, H = fd * T + 40, P = new SP.Pix(W, H);
    const ox = 8, base = H - 2;            // 足元（地図の fp の下端）が base
    const night = lv.night;
    if (kind === 'lot') {
      // 空き地：杭と縄で囲った土の区画と立て札（まだ建っていない施設）
      for (let y = base - fd * T + 8; y < base - 2; y++) for (let x = ox + 4; x < ox + fw * T - 4; x++) P.set(x, y, sh('#b48e60', ((hash(x >> 1, y >> 1, 4) & 7) - 3.5) * 0.03));
      for (let i = 0; i < 9; i++) { const h = hash(fx, fy, i); P.ball(ox + 10 + (h % (fw * T - 24)), base - 12 - ((h >> 8) % (fd * T - 26)), 2, 1.5, R('#9a8a70'), { dither: false }); }
      for (let x = ox + 4; x <= ox + fw * T - 6; x += 16) { P.rect(x, base - fd * T + 4, 2, 8, '#7a5030'); P.rect(x, base - 10, 2, 8, '#7a5030'); }
      for (let x = ox + 4; x < ox + fw * T - 4; x++) { P.set(x, base - fd * T + 6 + ((x >> 3) & 1), '#d8c090'); P.set(x, base - 8 + ((x >> 3) & 1), '#d8c090'); }
      const sx = ox + (fw * T >> 1) - 10; P.rect(sx + 9, base - 34, 2, 24, '#6a4424'); P.rect(sx, base - 44, 20, 13, '#d8b070'); outlineBox(P, sx, base - 44, 20, 13, '#6a4424');
      for (let i = 0; i < 3; i++) P.rect(sx + 3, base - 41 + i * 3, 14 - i * 3, 1, '#7a5030');
      return { cv: P.canvas(), x: fx * T - ox, y: (fy + fd) * T - H + 2 };
    }
    if (kind === 'shop') return shopBuilding(P, fp, lv, W, H, ox, base);
    if (kind === 'storage') {
      // 倉庫：板張りの大きな戸と木箱。段階で大きく（2階・金の飾り）
      const sl = lv.storage, wh = 40 + (sl >= 3 ? 8 : 0), wy = base - wh;
      wallFront(P, ox + 4, wy, fw * T - 8, wh, 'plank', '#9a6a40');
      roofThai(P, ox + 2, base - fd * T - 16 - (sl >= 3 ? 8 : 0), fw * T - 4, fd * T + 16 - wh + (sl >= 3 ? 8 : 0) - 2, sl >= 4 ? '#3a6a8a' : '#5a6a7a', { trim: sl >= 4 ? C.gold : C.woodD });
      door(P, ox + (fw * T >> 1) - 13, base - 30, 26, 26, '#6a4024');
      if (sl >= 3) { windowLit(P, ox + 14, wy + 6, 10, 8, night); windowLit(P, ox + fw * T - 24, wy + 6, 10, 8, night); }
      crate(P, ox + 6, base, 12); barrel(P, ox + fw * T - 10, base);
      if (sl >= 2) crate(P, ox + 8, base - 12, 10);
      return { cv: P.canvas(), x: fx * T - ox, y: (fy + fd) * T - H + 2 };
    }
    if (kind === 'smith') {
      // 鍛冶屋：石造りの炉と煙突、開いた作業場（炉の火）、金床と武器の棚。炉の段階で煙突・飾りが立派に
      const sm = lv.smith, wy = base - 46;
      for (let y = wy; y < base; y++) for (let x = ox + 2; x < ox + fw * T - 2; x++) {
        const row = (y - wy) >> 3, bx = (x + (row & 1) * 6) % 12;
        P.set(x, y, bx === 0 || (y - wy) % 8 === 7 ? '#5a4a40' : sh('#8a7a6a', ((hash(x / 12 | 0, row, 3) & 7) - 3.5) * 0.04 - (x > ox + fw * T - 10 ? 0.15 : 0)));
      }
      P.rect(ox + 1, wy, 1, 46, C.ol); P.rect(ox + fw * T - 2, wy, 1, 46, C.ol);
      roofThai(P, ox, base - fd * T - 14, fw * T, fd * T + 14 - 46 - 2, sm >= 3 ? '#8a3a2a' : '#5a4a4a', { trim: sm >= 3 ? C.gold : '#3a2a2a' });
      // 煙突
      const chx = ox + fw * T - 34, chh = 30 + sm * 6;
      P.box(chx, base - fd * T - 14 - chh + 20, 14, chh, R('#7a6a5a'));
      P.rect(chx - 1, base - fd * T - 14 - chh + 18, 16, 3, '#4a3a30');
      // 作業場の口と炉の火
      const mx = ox + 20, mw = 54;
      P.rect(mx, base - 34, mw, 30, '#2a1a14');
      P.ball(mx + 27, base - 14, 12, 8, R('#ff8a2a'), { dither: true }); P.ball(mx + 27, base - 15, 7, 5, R('#ffe070'), { dither: false });
      P.rect(mx - 2, base - 36, mw + 4, 3, C.woodD);
      // 金床
      const ax = ox + fw * T - 44; P.rect(ax, base - 12, 18, 4, '#3a3a44'); P.rect(ax + 4, base - 8, 10, 6, '#2a2a30'); P.rect(ax - 2, base - 13, 6, 2, '#4a4a54'); P.rect(ax, base - 13, 18, 1, '#8a8a9a');
      // 武器の立てかけ
      for (let i = 0; i < 3; i++) { const sx = ox + fw * T - 16 + i * 4; P.rect(sx, base - 30, 1, 22, '#c8d0e0'); P.rect(sx - 1, base - 10, 3, 2, C.goldD); }
      return { cv: P.canvas(), x: fx * T - ox, y: (fy + fd) * T - H + 2, smoke: [[fx * T - ox + chx + 7, (fy + fd) * T - H + 2 + base - fd * T - 14 - chh + 16]], lights: [[fx * T - ox + mx + 27, (fy + fd) * T - 14, 22]] };
    }
    if (kind === 'museum') {
      // 展示室：白いしっくいの殿堂、金の柱と二重のタイ屋根、石段
      const wy = base - 48;
      wallFront(P, ox + 4, wy, fw * T - 8, 44, 'plaster', '#f4ead6');
      roofThai(P, ox, base - fd * T - 24, fw * T, fd * T + 24 - 48 - 2, C.roof, { tiers: 2, trim: C.teal });
      for (let i = 0; i < 4; i++) { const cx = ox + 14 + i * ((fw * T - 28) / 3); P.box(Math.round(cx) - 3, wy + 4, 7, 38, R('#f8f0e0')); P.rect(Math.round(cx) - 4, wy + 3, 9, 2, C.gold); P.rect(Math.round(cx) - 4, wy + 40, 9, 2, C.gold); }
      door(P, ox + (fw * T >> 1) - 10, base - 30, 20, 24, '#7a2a20');
      P.rect(ox + (fw * T >> 1) - 18, base - 5, 36, 3, sh(C.stone, 0.1)); P.rect(ox + (fw * T >> 1) - 22, base - 2, 44, 2, C.stoneD);
      return { cv: P.canvas(), x: fx * T - ox, y: (fy + fd) * T - H + 2 };
    }
    if (kind === 'diner') {
      // 食堂：布の屋根の屋台風の台所、湯気の立つ鍋、外の卓と腰かけ
      const wy = base - 40;
      wallFront(P, ox + 4, wy, fw * T - 8, 40, 'plank', '#a8743e');
      roofThai(P, ox + 2, base - fd * T - 10, fw * T - 4, fd * T + 10 - 40 - 2, '#d07a3a', { trim: C.red });
      awning(P, ox, wy + 1, fw * T, 10, '#f4ead2', '#d84a3a');
      // かまどと鍋
      const kx = ox + 24; P.rect(kx - 10, base - 16, 22, 14, '#6a5a50'); P.rect(kx - 8, base - 6, 18, 3, '#ff8a2a');
      P.box(kx - 8, base - 24, 18, 9, R('#4a4a52'), { round: true }); P.rect(kx - 9, base - 25, 20, 2, '#8a8a92');
      // 卓と腰かけ
      for (let i = 0; i < 2; i++) { const tx = ox + 60 + i * 34; P.rect(tx, base - 14, 22, 3, '#c8904a'); P.rect(tx + 2, base - 11, 2, 9, C.woodD); P.rect(tx + 18, base - 11, 2, 9, C.woodD); P.ball(tx + 6, base - 16, 3, 2, R('#f4f0e0'), { dither: false }); P.ball(tx + 15, base - 16, 3, 2, R('#f4f0e0'), { dither: false }); }
      // 吊るした野菜
      for (let i = 0; i < 5; i++) P.ball(ox + 50 + i * 12, wy + 16, 2.5, 3.5, R(['#e85a3a', '#f0c040', '#7ac050'][i % 3]), { dither: false });
      return { cv: P.canvas(), x: fx * T - ox, y: (fy + fd) * T - H + 2, steam: [[fx * T + 24, (fy + fd) * T - 28]], lights: [[fx * T + 24, (fy + fd) * T - 8, 16]] };
    }
    if (kind === 'develop') {
      // 復興本部：帆布の天幕、掲示板（図面と張り紙）、資材
      const wy = base - 36;
      for (let y = base - fd * T + 2; y < base - 4; y++) {
        const t = (y - (base - fd * T + 2)) / (fd * T - 6), half = 10 + t * (fw * T / 2 - 14);
        for (let x = Math.round(ox + fw * T / 2 - half); x < ox + fw * T / 2 + half; x++) { const st = Math.floor((x - (ox + fw * T / 2)) / (6 + t * 8)) & 1; P.set(x, y, sh(st ? '#f2e6c8' : '#2f9a90', (x < ox + fw * T / 2 ? 0.08 : -0.14) - t * 0.08)); }
      }
      P.rect(ox + (fw * T >> 1) - 1, base - fd * T, 2, 6, C.woodD); banner(P, ox + (fw * T >> 1) - 1, base - fd * T + 6, C.teal);
      P.rect(ox + (fw * T >> 1) - 8, wy + 8, 16, 28, '#5a4030');
      // 掲示板
      const bx = ox + 6; P.rect(bx, base - 34, 34, 22, '#8a5a32'); outlineBox(P, bx, base - 34, 34, 22, C.woodD); P.rect(bx + 3, base - 12, 2, 10, C.woodD); P.rect(bx + 29, base - 12, 2, 10, C.woodD);
      P.rect(bx + 3, base - 31, 13, 10, '#e8f0ff'); for (let i = 0; i < 3; i++) P.rect(bx + 4, base - 29 + i * 3, 10, 1, '#3a5a9a');
      P.rect(bx + 18, base - 31, 12, 14, '#f4e8c8'); P.rect(bx + 20, base - 28, 8, 1, '#7a5030'); P.rect(bx + 20, base - 25, 6, 1, '#7a5030');
      // 資材
      for (let i = 0; i < 4; i++) P.rect(ox + fw * T - 40, base - 6 - i * 3, 30, 3, i & 1 ? '#c8945a' : '#a87440');
      crate(P, ox + fw * T - 20, base - 12, 10);
      return { cv: P.canvas(), x: fx * T - ox, y: (fy + fd) * T - H + 2 };
    }
    return { cv: P.canvas(), x: fx * T - ox, y: (fy + fd) * T - H + 2 };
  }

  /* サイの店（4×3マス）。光は左上から。
   * 屋根：瓦の段・棟・反りのある両端、厚みのある鼻隠し（板と金の縁）と、その下の壁に落ちる軒の影。
   * 壁：しっくいと木の柱（柱頭つき）。左の間は格子窓と壺の棚、中央は奥行きのある入口（暗い店内・のれん・敷居の段）、
   * 右の間は日よけの下の売り台（かご・びん・布）。足元は石の土台。店先の角に木箱・樽・鉢植え（建物のマスの中だけ）。 */
  function shopBuilding(P, fp, lv, W, H, ox, base) {
    const [fx, fy, fw, fd] = fp, bw = fw * T, night = lv.night, stage = lv.stage;
    const roofTop = 8, eave = 62, fasciaH = 7, wy = eave + fasciaH, plinth = base - 4;
    const L = ox, Rt = ox + bw;                                   // 壁の左右
    // ---- 壁（しっくい。上ほど軒の影で暗い） ----
    const plaster = stage >= 2 ? '#efe2c4' : '#d8b98a';
    for (let y = wy; y < plinth; y++) for (let x = L + 2; x < Rt - 2; x++) {
      let c = sh(plaster, ((hash(x >> 1, y >> 1, 21) & 7) - 3.5) * 0.012 - (x > Rt - 14 ? 0.06 : 0));
      const shade = y - wy;
      if (shade < 9) c = mix(c, '#3a2430', 0.55 - shade * 0.055);   // 軒の影
      P.set(x, y, c);
    }
    // 石の土台と、前の敷石
    for (let x = L; x < Rt; x++) { P.set(x, plinth, sh(C.stone, 0.2)); for (let y = plinth + 1; y < base + 1; y++) P.set(x, y, ((x + (y > plinth + 2 ? 4 : 0)) % 9 === 0) ? C.stoneD : sh(C.stone, -0.08 - (y - plinth) * 0.03)); }
    // ---- 柱（4本。左が明るく右が暗い円柱、上に金の柱頭、下に礎石） ----
    const posts = [L + 1, L + 40, Rt - 44, Rt - 5];
    for (const px of posts) {
      for (let y = wy - 1; y < plinth; y++) for (let i = 0; i < 4; i++) P.set(px + i, y, [C.woodL, C.wood, C.wood, C.woodD][i]);
      P.rect(px - 1, wy, 6, 2, C.gold); P.rect(px - 1, wy + 2, 6, 1, C.goldD);
      P.rect(px - 1, plinth - 2, 6, 2, sh(C.stone, -0.1));
      P.rect(px + 4, wy + 3, 1, plinth - wy - 5, mix(plaster, '#2a1a20', 0.35));   // 柱の右に落ちる影
    }
    // ---- 左の間：格子窓（窓台・雨戸）と、窓の下の壺の棚 ----
    { const x0 = L + 10, y0 = wy + 12, w = 24, h = 18;
      P.rect(x0 - 3, y0 - 2, w + 6, h + 5, C.woodD); P.rect(x0 - 2, y0 - 1, w + 4, h + 3, C.wood);
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) P.set(x, y, night ? mix('#ffcf70', '#ff9a40', (y - y0) / h) : mix('#2a3a52', '#4a6a8a', (x - x0 + y0 - y + h) / (w + h)));
      for (let x = x0 + 5; x < x0 + w; x += 6) P.rect(x, y0, 1, h, C.woodD);
      P.rect(x0, y0 + (h >> 1), w, 1, C.woodD);
      if (!night) { P.set(x0 + 2, y0 + 2, '#bfe8ff'); P.set(x0 + 3, y0 + 2, '#bfe8ff'); P.set(x0 + 2, y0 + 3, '#bfe8ff'); }
      P.rect(x0 - 4, y0 + h + 2, w + 8, 2, C.woodL); P.rect(x0 - 4, y0 + h + 4, w + 8, 1, C.woodD);   // 窓台
      const jars = ['#3a7ac0', '#c89a3a', '#2f9a88'];
      for (let i = 0; i < 3; i++) { const jx = x0 + 1 + i * 8, jy = y0 + h + 4; P.box(jx, jy - 7, 6, 7, R(jars[i]), { round: true }); P.rect(jx + 1, jy - 8, 4, 1, sh(jars[i], -0.3)); }
    }
    // ---- 中央：入口（店の奥は暗く、のれんと敷居の段） ----
    const dx0 = L + 46, dx1 = Rt - 46, dy0 = wy + 8;
    for (let y = dy0; y < plinth; y++) for (let x = dx0; x < dx1; x++) {
      const t = (y - dy0) / (plinth - dy0);
      P.set(x, y, mix('#120a10', '#3a2618', t * 0.8) );
    }
    // 店の奥：棚の影と小さな灯り
    P.rect(dx0 + 3, dy0 + 10, dx1 - dx0 - 6, 1, '#4a3020'); P.rect(dx0 + 3, dy0 + 18, dx1 - dx0 - 6, 1, '#4a3020');
    for (let i = 0; i < 4; i++) P.rect(dx0 + 5 + i * 8, dy0 + 6, 4, 4, ['#5a7aa0', '#a08040', '#6a9a70', '#a05a7a'][i]);
    P.rect(dx0 + 2, dy0 + 22, dx1 - dx0 - 4, 2, '#2a1a12');
    // 入口の枠（左は明るい、右と上は影）
    P.rect(dx0 - 2, dy0 - 2, 2, plinth - dy0 + 2, C.woodL); P.rect(dx1, dy0 - 2, 2, plinth - dy0 + 2, C.woodD);
    P.rect(dx0 - 2, dy0 - 3, dx1 - dx0 + 4, 3, C.wood); P.rect(dx0 - 2, dy0 - 3, dx1 - dx0 + 4, 1, C.goldD);
    // のれん（青緑の布を3枚。すそが波打つ）
    for (let i = 0; i < 3; i++) {
      const nx = dx0 + i * ((dx1 - dx0) / 3) | 0, nw = ((dx1 - dx0) / 3 | 0) - 1;
      for (let y = 0; y < 13; y++) for (let x = 0; x < nw; x++) { if (y > 10 && (x + i) % 3 === 0) continue; P.set(nx + x, dy0 + y, sh(C.teal, (x < 2 ? 0.18 : x > nw - 3 ? -0.2 : 0) - y * 0.01)); }
      P.rect(nx + 2, dy0 + 4, nw - 4, 1, C.goldL);
    }
    // 敷居の段（2段）
    P.rect(dx0 - 4, plinth - 1, dx1 - dx0 + 8, 2, sh(C.stone, 0.25)); P.rect(dx0 - 6, plinth + 1, dx1 - dx0 + 12, 2, sh(C.stone, 0.05)); P.rect(dx0 - 6, plinth + 3, dx1 - dx0 + 12, 1, C.stoneD);
    // ---- 右の間：日よけの下の売り台（かご・びん・たたんだ布） ----
    { const x0 = Rt - 40, x1 = Rt - 6, ty = plinth - 14;
      // 日よけ（青緑と白の縞。すそに房）
      for (let y = wy + 2; y < wy + 11; y++) for (let x = x0 - 2; x < x1 + 2; x++) { const st = Math.floor((x - x0) / 5) & 1; P.set(x, y, sh(st ? C.teal : '#f2ead8', (y - wy) * -0.02 + (y === wy + 2 ? 0.15 : 0))); }
      for (let x = x0 - 2; x < x1 + 2; x += 5) { P.set(x + 2, wy + 11, C.goldD); P.set(x + 2, wy + 12, C.gold); }
      P.rect(x0 - 2, wy + 11, x1 - x0 + 4, 1, sh(C.teal, -0.4));
      // 台（木の天板と前板）
      P.rect(x0, ty, x1 - x0, 3, C.woodL); P.rect(x0, ty, x1 - x0, 1, '#f0c890'); P.rect(x0, ty + 3, x1 - x0, 10, C.wood); P.rect(x0, ty + 3, x1 - x0, 1, C.woodD);
      for (let x = x0 + 3; x < x1; x += 7) P.rect(x, ty + 5, 1, 7, C.woodD);
      // 果物かご・びん・布
      P.ball(x0 + 6, ty - 3, 5, 3, R('#b8823e'), { dither: false }); P.ball(x0 + 4, ty - 5, 2, 2, R('#e84a3a'), { dither: false }); P.ball(x0 + 8, ty - 5, 2, 2, R('#f0c040'), { dither: false });
      for (let i = 0; i < 3; i++) { const bx = x0 + 15 + i * 4; P.rect(bx, ty - 7, 3, 7, ['#3ab0d0', '#9ad05a', '#e07ab0'][i]); P.rect(bx + 1, ty - 9, 1, 2, '#e8e0d0'); P.set(bx, ty - 6, '#ffffff'); }
      P.rect(x1 - 9, ty - 4, 8, 4, '#c04a6a'); P.rect(x1 - 9, ty - 4, 8, 1, '#e87a9a'); P.rect(x1 - 9, ty - 2, 8, 1, C.goldD);
    }
    // ---- 屋根：鼻隠し（厚み）と、瓦の段 ----
    const ins = 14;
    for (let y = roofTop; y < eave; y++) {
      const t = (y - roofTop) / (eave - roofTop), xl = Math.round(L - 4 + ins * (1 - t)), xr = Math.round(Rt + 4 - ins * (1 - t));
      const row = Math.floor((y - roofTop) / 5), ly = (y - roofTop) % 5;
      for (let x = xl; x < xr; x++) {
        const seam = ((x - xl) + (row & 1) * 4) % 8 === 0;
        let c = sh(C.roof, 0.12 - t * 0.22 + ((hash(x >> 3, row, 5) & 3) - 1.5) * 0.03);
        if (ly === 4) c = sh(C.roof, -0.45); else if (ly === 0) c = sh(C.roof, 0.28 - t * 0.2);
        if (seam && ly) c = sh(c, -0.25);
        if (x - xl < 3) c = sh(c, 0.12); if (xr - x <= 4) c = sh(c, -0.25);
        P.set(x, y, c);
      }
      P.set(xl, y, C.goldD); P.set(xl + 1, y, C.gold); P.set(xr - 1, y, C.goldD); P.set(xr - 2, y, C.gold);
    }
    // 棟（屋根のてっぺん）と両端の反り飾り
    P.rect(L - 4 + ins, roofTop - 3, bw + 8 - ins * 2, 3, C.goldD); P.rect(L - 4 + ins, roofTop - 3, bw + 8 - ins * 2, 1, C.goldL);
    const cho = (x, d) => { P.set(x, roofTop - 4, C.gold); P.set(x + d, roofTop - 5, C.gold); P.set(x + d * 2, roofTop - 7, C.goldL); P.set(x + d * 2, roofTop - 6, C.gold); P.set(x + d, roofTop - 8, C.goldL); };
    cho(L - 4 + ins, -1); cho(Rt + 3 - ins, 1);
    // 鼻隠し（屋根の厚み：板の帯、金の縁、小さな飾り）
    for (let y = eave; y < eave + fasciaH; y++) for (let x = L - 6; x < Rt + 6; x++) {
      const t = y - eave;
      P.set(x, y, t === 0 ? C.goldL : t === 1 ? C.gold : t === fasciaH - 1 ? '#2a1610' : sh(C.woodD, (x < L ? 0.1 : x > Rt ? -0.15 : 0) - t * 0.04));
    }
    for (let x = L - 2; x < Rt + 4; x += 6) P.set(x, eave + 3, C.goldL);
    // 軒の両端の反り
    P.set(L - 7, eave - 1, C.gold); P.set(L - 8, eave - 3, C.goldL); P.set(Rt + 6, eave - 1, C.gold); P.set(Rt + 7, eave - 3, C.goldL);
    // 看板（入口の上の鼻隠しに、金の縁の小さな札。文字は焼き込まず、びんと袋の印）
    { const sx = ((dx0 + dx1) >> 1) - 9, sy = eave - 1;
      P.rect(sx, sy, 18, 9, C.goldD); P.rect(sx + 1, sy + 1, 16, 7, '#7a2a1e');
      P.rect(sx + 4, sy + 3, 3, 4, '#5ad0e0'); P.set(sx + 5, sy + 2, '#e8e0d0');
      P.ball(sx + 12, sy + 5, 2.5, 2, R(C.gold), { dither: false }); }
    // 吊り灯籠（左右の柱の前、鼻隠しから下がる）
    const lights = [];
    for (const lx of [L + 42, Rt - 42]) {
      P.rect(lx, wy, 1, 3, C.ol); P.rect(lx - 2, wy + 3, 5, 7, C.ol); P.rect(lx - 1, wy + 4, 3, 5, night ? '#ffd070' : '#ff9a4a'); P.set(lx, wy + 10, C.gold);
      lights.push([fx * T - ox + lx, (fy + fd) * T - H + 2 + wy + 6, 14]);
    }
    // ---- 店先の小物（建物のマスの中だけ。左右の角） ----
    // 左角：木箱の山と布袋
    crate(P, L + 2, base, 11); crate(P, L + 13, base, 9); crate(P, L + 5, base - 11, 9);
    P.ball(L + 26, base - 4, 4, 4, R('#d8c49a')); P.rect(L + 25, base - 9, 2, 2, '#8a6a3a');
    // 右角：樽と鉢植え
    barrel(P, Rt - 10, base); pot(P, Rt - 21, base, [C.pink, '#ffffff']);
    P.outline(0.6);
    return { cv: P.canvas(), x: fx * T - ox, y: (fy + fd) * T - H + 2, lights };
  }

  // 丘の上の寺院（アユタヤの仏塔）。章が進むと修復される：1章は崩れたまま、2〜3章は足場、4章から金の先端
  function temple(lv) {
    const W = 6 * T + 24, H = 4 * T + 2, P = new SP.Pix(W, H), base = H - 2, ox = 12;
    const ch = lv.chapter;
    // 基壇
    for (let y = base - 34; y < base; y++) for (let x = ox; x < ox + 6 * T; x++) {
      const row = (y - base) >> 2, bx = (x + (row & 1) * 4) % 8;
      P.set(x, y, bx === 0 || (y & 3) === 3 ? '#6a3424' : sh(C.brick, ((hash(x >> 3, row, 2) & 7) - 3.5) * 0.04 - (y > base - 6 ? 0.15 : 0)));
    }
    P.rect(ox, base - 35, 6 * T, 2, '#e09a6a');
    // 中央の仏塔（プラーン）
    const cx = ox + 3 * T, pb = base - 34;
    const prang = (cx, pb, w, h, broken) => {
      for (let y = 0; y < h; y++) {
        const t = y / h, half = Math.max(2, w * (1 - Math.pow(t, 1.6) * 0.92));
        if (broken && t > 0.62) break;
        for (let x = Math.round(cx - half); x < cx + half; x++) {
          const ring = (y % 10) < 2;
          P.set(x, pb - y, ring ? '#7a3a28' : sh(C.brick, (x < cx ? 0.12 : -0.18) + (((x >> 2) + (y >> 2)) & 1 ? 0 : -0.04)));
        }
      }
      // 入口のくぼみ
      P.rect(cx - 6, pb - 26, 12, 22, '#3a1a14'); P.rect(cx - 7, pb - 28, 14, 2, C.gold);
      if (!broken && ch >= 4) { P.rect(cx - 1, pb - h - 8, 2, 10, C.goldL); P.ball(cx, pb - h + 2, 4, 4, R(C.gold), { dither: false }); }
    };
    prang(cx, pb, 30, 90, ch <= 1);
    prang(ox + 34, pb, 15, 56, ch <= 2); prang(ox + 6 * T - 34, pb, 15, 56, ch <= 2);
    if (ch <= 1) for (let i = 0; i < 10; i++) { const h = hash(i, 3, 9); P.ball(ox + 20 + (h % (6 * T - 40)), base - 36 - ((h >> 8) % 6), 4, 3, R('#a8583a'), {}); }
    if (ch === 2 || ch === 3) { // 足場
      for (let x = cx - 30; x <= cx + 30; x += 15) P.rect(x, pb - 80, 2, 80, '#a87a48');
      for (let y = pb - 78; y < pb; y += 20) P.rect(cx - 31, y, 63, 2, '#c89a60');
    }
    if (ch >= 3) { banner(P, ox + 8, base - 34, C.teal); banner(P, ox + 6 * T - 18, base - 34, C.red); }
    if (lv.cleared) { P.ball(cx, pb - 100, 5, 5, R('#c8f0ff'), { dither: false }); }
    return { cv: P.canvas(), x: 7 * T - ox, y: 4 * T - H + 2 };
  }

  // 建設予定地（学校・図書館）：基礎と足場と材木。外観だけ（施設としてはまだ使えない）
  function site(kind, fp) {
    const [fx, fy, fw, fd] = fp, W = fw * T + 8, H = fd * T + 30, P = new SP.Pix(W, H), base = H - 2, ox = 4;
    for (let y = base - 16; y < base; y++) for (let x = ox + 4; x < ox + fw * T - 4; x++) P.set(x, y, (x % 12 === 0 || y === base - 16) ? '#8a7a6a' : sh('#c8b898', (y - base) / 60));
    for (let x = ox + 8; x < ox + fw * T - 8; x += 22) P.rect(x, base - fd * T - 10, 3, fd * T - 6, '#a87a48');
    for (let y = base - fd * T - 6; y < base - 16; y += 18) P.rect(ox + 6, y, fw * T - 12, 3, '#c89a60');
    // 骨組みの屋根の線
    P.line(ox + 8, base - fd * T - 8, ox + (fw * T >> 1), base - fd * T - 26, '#a87a48'); P.line(ox + (fw * T >> 1), base - fd * T - 26, ox + fw * T - 8, base - fd * T - 8, '#a87a48');
    for (let i = 0; i < 4; i++) P.rect(ox + fw * T - 46, base - 3 - i * 3, 34, 3, i & 1 ? '#c8945a' : '#a87440');
    if (kind === 'school') { P.rect(ox + 12, base - 28, 18, 12, '#2a4a3a'); outlineBox(P, ox + 12, base - 28, 18, 12, '#8a5a32'); }
    else for (let i = 0; i < 3; i++) P.rect(ox + 12 + i * 5, base - 26, 4, 10, ['#c84a3a', '#3a7ab0', '#e0b040'][i]);
    return { cv: P.canvas(), x: fx * T - ox, y: (fy + fd) * T - H + 2 };
  }

  // 木（ヤシ・丸い木）。足元のマスに立つ
  function tree(kind, tx, ty, night) {
    const W = 56, H = 80, P = new SP.Pix(W, H), cx = 28, base = H - 4;
    if (kind === 'palm') {
      for (let y = 0; y < 46; y++) { const x = cx + Math.round(Math.sin(y / 14) * 3); P.rect(x - 2, base - y, 5, 1, (y % 5 === 0) ? '#6a4a2a' : '#9a7044'); P.set(x - 2, base - y, '#b88a5a'); }
      const fr = [[-22, -4], [-16, -14], [0, -18], [16, -14], [22, -4], [-10, 6], [10, 6]];
      for (const [dx, dy] of fr) {
        const n = 14;
        for (let i = 0; i < n; i++) {
          const t = i / n, x = cx + dx * t, y = base - 48 + dy * t + t * t * 10;
          P.set(Math.round(x), Math.round(y), sh(night ? '#2e6a3a' : '#3f9a44', 0.15 - t * 0.3));
          P.set(Math.round(x), Math.round(y) + 1, sh(night ? '#2e6a3a' : '#3f9a44', -0.15 - t * 0.2));
          if (i % 2) { P.set(Math.round(x), Math.round(y) + 2, sh('#3f9a44', -0.35)); P.set(Math.round(x - Math.sign(dx)), Math.round(y) + 2, sh('#3f9a44', -0.2)); }
        }
      }
      P.ball(cx - 2, base - 46, 3, 3, R('#7a5a2a'), { dither: false }); P.ball(cx + 3, base - 45, 3, 3, R('#7a5a2a'), { dither: false });
    } else {
      P.box(cx - 3, base - 20, 7, 20, R('#7a5230'));
      const lc = night ? '#2e6a3a' : C.leaf;
      P.ball(cx, base - 36, 20, 16, R(lc), { bias: 0.15 });
      P.ball(cx - 10, base - 30, 11, 9, R(lc), { bias: 0.3 }); P.ball(cx + 11, base - 31, 10, 9, R(lc), { bias: 0.4 });
      P.ball(cx - 4, base - 44, 10, 7, R(sh(lc, 0.1)), { bias: -0.1 });
      if (kind === 'flower') for (let i = 0; i < 14; i++) { const h = hash(tx, ty, i); P.set(cx - 16 + (h % 32), base - 48 + ((h >> 6) % 26), i % 2 ? '#ff9ac8' : '#ffe0ee'); }
    }
    P.outline(0.7);
    return { cv: P.canvas(), x: tx * T + 16 - cx, y: (ty + 1) * T - H + 2, sortY: (ty + 1) * T - 1 };
  }

  // ヤナイの記念像：青銅の像（見本のヤナイのドット絵を青銅色にしたもの）と台座・花・ろうそく
  function statue(lv) {
    const W = 2 * T + 16, H = 2 * T + 30, P = new SP.Pix(W, H), base = H - 2, ox = 8;
    // 台座（3段の石。上の段に像が立つ）
    const step = (y0, h, inset, col) => { for (let y = y0; y < y0 + h; y++) for (let x = ox + inset; x < ox + 2 * T - inset; x++) P.set(x, y, sh(col, (x < ox + inset + 5 ? 0.16 : x > ox + 2 * T - inset - 6 ? -0.22 : 0) + (y === y0 ? 0.22 : y === y0 + h - 1 ? -0.25 : 0))); };
    step(base - 14, 14, 0, C.stone); step(base - 26, 12, 6, '#e6dcc4'); step(base - 36, 10, 12, '#efe6d2');
    P.rect(ox + 22, base - 22, 20, 8, C.goldD); P.rect(ox + 23, base - 21, 18, 6, C.gold); P.rect(ox + 26, base - 19, 12, 1, C.goldD); P.rect(ox + 26, base - 17, 9, 1, C.goldD);
    // 金の燭台と花
    for (const x of [ox + 3, ox + 2 * T - 6]) { P.rect(x, base - 20, 3, 8, C.gold); P.rect(x - 1, base - 13, 5, 2, C.goldD); P.rect(x, base - 24, 3, 4, '#f4ead2'); P.set(x + 1, base - 25, '#ffd060'); P.set(x + 1, base - 26, '#fff4b0'); }
    for (let i = 0; i < 14; i++) { const h = hash(i, 2, 77); P.ball(ox + 4 + (h % (2 * T - 8)), base - 2 - (h >> 5) % 4, 2.2, 2, R([C.pink, '#ffe070', '#ffffff', '#ff7a6a'][i % 4]), { dither: false }); }
    P.outline(0.6);
    return { cv: P.canvas(), x: 9 * T - ox, y: 13 * T - H + 2, statueAt: [9 * T - ox + (W >> 1), 13 * T - H + 2 + base - 36] };
  }

  // 子ども（章が進むと遊びに来る）。見本の人物と同じ密度で、背丈は小さめ
  function kid(v) {
    const P = new SP.Pix(20, 30), hair = ['#2a1a14', '#3a2418', '#1a1418'][v % 3], shirt = ['#f4f4f0', '#e8c060', '#7ac0e0'][v % 3], pants = ['#2a3a7a', '#3a5a3a', '#7a3a3a'][v % 3];
    P.ball(10, 9, 6, 6, R('#e0a878'));
    P.ball(10, 6, 6, 4, R(hair), { bias: 0.4 });
    P.set(8, 10, '#2a1a14'); P.set(12, 10, '#2a1a14');
    P.box(5, 15, 10, 7, R(shirt)); P.box(6, 22, 8, 5, R(pants));
    P.rect(6, 27, 3, 2, '#3a2a20'); P.rect(11, 27, 3, 2, '#3a2a20');
    P.outline(0.8);
    return P.canvas();
  }
  function cat(v) {
    const P = new SP.Pix(18, 12), c = v ? '#e89a4a' : '#f0f0ec';
    P.ball(8, 7, 6, 4, R(c)); P.ball(14, 5, 3.5, 3.5, R(c)); P.set(12, 1, c); P.set(16, 1, c); P.set(13, 5, '#2a2a2a'); P.set(15, 5, '#2a2a2a');
    P.rect(1, 4, 2, 4, sh(c, -0.2));
    P.outline(0.75);
    return P.canvas();
  }

  // ---------------- 村の素材の絵（assets/village/） ----------------
  /* 建物・小物の絵を、足元 (fx, fy)（地図のドット）にそろえて置く。絵が読み込めていなければ null */
  function artProp(name, fx, fy, sortY) {
    const VA = TS.ASSETS && TS.ASSETS.village, img = SP.art && SP.art.village && SP.art.village[name];
    if (!VA || !img) return null;
    const sc = VA.propScale, [ax, ay] = VA.props[name];
    return { img, x: fx - ax * sc, y: fy - ay * sc, w: img.width * sc, h: img.height * sc, sortY: sortY !== undefined ? sortY : fy - 1 };
  }
  const hasArt = (name) => !!(SP.art && SP.art.village && SP.art.village[name]);
  const ART_OF = { shop: 'sai_shop', smith: 'blacksmith', diner: 'eatery', storage: 'warehouse', museum: 'exhibition' };
  /* 施設の絵：入口の中心（doors）がマス doorTx の中央に来るように置く。炉の光・煙・湯気は絵の中の位置から */
  function facilityArt(name, doorTx, baseY) {
    const VA = TS.ASSETS.village, sc = VA.propScale, ax = VA.props[name][0];
    const o = artProp(name, doorTx * T + 16 + (ax - VA.doors[name]) * sc, baseY, baseY - 2);
    if (!o) return null;
    const fx = VA.fx && VA.fx[name], at = (p) => [o.x + p[0] * sc, o.y + p[1] * sc];
    if (fx && fx.light) o.lights = [at(fx.light).concat([fx.light[2]])];
    if (fx && fx.smoke) o.smoke = [at(fx.smoke)];
    if (fx && fx.steam) o.steam = [at(fx.steam)];
    return o;
  }
  /* 子供と猫（いつも同じ3人・3匹。決まった番号で作るので、村を出入りしても増えない）。
   * 立つマスは通れない（大人と同じ）。入口・通り道は2マス以上あける。猫の黒は花壇の前の2マスを行き来する */
  /* 2026年10月：3人とも、こもれびの家（村の発展）の前と、もっちゃんのまわりへ（人数・絵・会話はそのまま）。
   * 入口の階段の前 (2,20)、港への道（20〜21行）、赤い橋 (3,21)、広場の通り道はあけておく（3人とも家の敷地か、広場の端に立つ） */
  VL.KIDS = [
    { id: 'book', x: 3, y: 19, face: 'front' },      // 階段の右の縁側（ベンチのそば）
    { id: 'cat', x: 4, y: 19, face: 'left' },        // 家の右の鉢植えのわき（もっちゃんのほうを向く）
    { id: 'play', x: 5, y: 18, face: 'left' },       // 家の右の広場の端（家のほうを向く）
  ];
  VL.COMMUNITY_NAME = 'こもれびの家';   // 村の発展の建物の名前（地図の名札）
  VL.CATS = [
    { id: 'ginger', x: 2, y: 14, pose: 'sit' },      // サイの店先
    { id: 'calico', x: 5, y: 13, pose: 'sleep' },    // 店の横で眠る
    { id: 'black', x: 7, y: 14, pose: 'sit', walk: [7, 8] },   // 花壇の前を左右に短く歩く
  ];

  // ---------------- 港（素材の絵） ----------------
  let pierCv = null;
  function pierCanvas() {
    // 桟橋を短くする：上（陸とつながる所〜2区間）と、先端（最後の杭）をつなぐ。どちらも綱の所で切るので継ぎ目が目立たない
    if (pierCv) return pierCv;
    const img = SP.art.village.pier, [a, b] = TS.ASSETS.village.harbor.pierCut;
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height - (b - a);
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, img.width, a, 0, 0, img.width, a); g.drawImage(img, 0, b, img.width, img.height - b, 0, a, img.width, img.height - b);
    return (pierCv = c);
  }
  /* 岸壁・桟橋・小舟・係留杭・荷物を置く。足元（通れないマス）は地図で決める（絵の四角では決めない） */
  function harborObjects(lv, add, solid) {
    const VA = TS.ASSETS.village, H = VA.harbor, sc = VA.propScale, A = SP.art.village;
    if (!A.pier || !A.boat || !A.quay || !A.bollard || !A.supplies) return false;
    // 岸壁：上面の石を道の下の縁（21行の下）に、前面の石積みを水へ。左右の余白を除いた部分を並べる。赤い橋の所は空ける
    const [qx, qy, qw, qh] = H.quayRect, segW = qw * sc, top = 22 * T - H.quayTop * sc;
    // 古い描き方の赤い橋の所は岸壁を空ける。素材の橋は岸壁を切らずに、その上へ重ねる（橋の親柱が岸壁の上に立つ）
    const ranges = lv.decor.bridge && !lv.bridgeArt ? [[0, 3 * T], [5 * T, MW * T]] : [[0, MW * T]];
    for (const [x0, x1] of ranges) for (let x = x0; x < x1; x += segW) {
      const w = Math.min(segW, x1 - x);
      add({ img: A.quay, src: [qx, qy, w / sc, qh], x, y: top, w, h: qh * sc, sortY: 21 * T });
    }
    // 赤い橋（縦向き）：x3 の列の中央。床板の上端（deckTop）を岸壁の上面に重ねて陸と、下端は向こう岸（25行の草地）につなぐ。
    // 人物は橋の中央（欄干の内側）を歩くので、橋は人物より奥に描く
    if (lv.decor.bridge && lv.bridgeArt) {
      const bi = A.deco_bridge, bx = 3 * T + 16 - Math.round(bi.width / 2), by = 22 * T - 6 - VA.decor.bridgeDeck;
      add({ img: bi, x: bx, y: by, w: bi.width, h: bi.height, sortY: 21 * T + 1 });
      // 欄干（左右の親柱と手すり）は横に細く切って重ね直し、足元より下の欄干は人物の手前に来るようにする（盾やマントが欄干に重なる時）
      const rw = VA.decor.bridgeRail;
      for (let sy = VA.decor.bridgeDeck; sy < bi.height; sy += 8) {
        const sh = Math.min(8, bi.height - sy), sortY = by + sy + sh;
        for (const sx of [0, bi.width - rw]) add({ img: bi, src: [sx, sy, rw, sh], x: bx + sx, y: by + sy, w: rw, h: sh, sortY });
      }
    }
    // 桟橋：x10 の列の中央。上端は岸壁の上面に少し重ねて陸とつなぐ
    const pc = pierCanvas(), pw = pc.width * sc, ph = pc.height * sc;
    add({ img: pc, x: 10 * T + 16 - pw / 2, y: 22 * T - 8, w: pw, h: ph, sortY: 21 * T + 1 });
    // 小舟：桟橋の先の右に横付け（舟の上は歩かない）。描く位置だけ上下に揺れる
    const bw = A.boat.width * sc, bx = 10 * T + 16 + 26 - 2 * sc, by = 25 * T - 5 - VA.props.boat[1] * sc;
    add({ img: A.boat, x: bx, y: by, w: bw, h: A.boat.height * sc, sortY: 24 * T + 20, bob: H.boatBob });
    // 係留杭（陸の縁 (8,21)・(13,21)）と荷物（右の岸 (16〜17,21)）：21行の通れないマス。20行の道はいつも通れる
    for (const x of [8, 13]) { add(artProp('bollard', x * T + 16, 22 * T - 1)); solid[21 * MW + x] = 1; }
    add(artProp('supplies', 17 * T, 22 * T - 1)); solid[21 * MW + 16] = solid[21 * MW + 17] = 1;
    return true;
  }

  // ---------------- アユタヤの遺跡（素材の絵） ----------------
  /* 丘の上の寺院の段（x7〜12・y0〜3、通れない）の上に、2本の赤レンガの塔と、石段の上に立つ古い門を置く。
   * 門の開口は石段 (9,4)・(10,4) の真上：石段に立つと門の中に立つ（たけは門より手前に描く）。石段の両わきは木の根が絡む壁と崩れた壁。
   * 当たり（通れるマス）は今までの地図のまま。寺院の修復の段階（章）は、塔の上に重ねて見せる：
   *   第1章：塔の先が崩れたまま・がれき／第2〜3章：足場／第3章〜：門の旗／第4章〜：塔の先の金の飾り／全章クリア：門の上の光
   *   村の発展「黄金の門」：門の頂の金の飾りと、敷居の金の帯 */
  function ruinsObjects(lv, add) {
    const A = SP.art.village, tw = A.ruin_tower, gt = A.ruin_gate, by = A.ruin_banyan_wall, bw = A.ruin_broken_wall;
    if (!tw || !gt || !by || !bw) return false;
    const ch = lv.chapter, base = 5 * T - 2;                 // 門・壁の足元（石段の行の下）
    const gx = 10 * T - TS.ASSETS.village.ruins.gateOpen;    // 開口の中心を石段の真ん中（x=320）に
    // 塔：門の左右の低い壁の奥（寺院の段の上）。第1章は先が崩れたまま（上を切る）
    const cut = ch <= 1 && !lv.ending ? Math.round(tw.height * 0.34) : 0;
    const towers = [[gx + 20, 3 * T + 20], [gx + gt.width - 22, 3 * T + 20]];
    for (const [cx, foot] of towers) add({ img: tw, src: [0, cut, tw.width, tw.height - cut], x: cx - tw.width / 2, y: foot - tw.height + cut, w: tw.width, h: tw.height - cut, sortY: foot });
    // 塔の上の重ね絵（足場・金の飾り・がれき）
    const P = new SP.Pix(MW * T, 5 * T);
    for (const [cx, foot] of towers) {
      const top = foot - tw.height + cut;
      if (ch <= 1 && !lv.ending) for (let i = 0; i < 6; i++) { const h = hash(cx, i, 9); P.ball(cx - 26 + (h % 52), foot - 2 - ((h >> 8) % 5), 4, 3, R('#b0603a'), {}); }
      if ((ch === 2 || ch === 3) && !lv.ending) {   // 足場（木の柱と横木）
        for (let x = cx - 24; x <= cx + 24; x += 16) P.rect(x, top + 18, 2, foot - top - 22, '#a87a48');
        for (let y = top + 22; y < foot - 6; y += 18) { P.rect(cx - 25, y, 52, 2, '#c89a60'); P.rect(cx - 25, y + 2, 52, 1, '#7a5430'); }
      }
      if (ch >= 4 || lv.ending) { P.rect(cx - 1, top - 7, 3, 9, C.goldL); P.rect(cx, top - 7, 1, 9, C.gold); P.ball(cx + 0.5, top - 9, 2.5, 2.5, R(C.gold), { dither: false }); }
    }
    P.outline(0.6);
    add({ cv: P.canvas(), x: 0, y: 0, sortY: 3 * T + 21 });
    // 門（石段の上）
    add({ img: gt, x: gx, y: base - gt.height + 1, w: gt.width, h: gt.height, sortY: base - 1 });
    // 門の上の重ね絵（旗・全章クリアの光）。以前の「黄金の門」の金の飾りは、発展項目を「マスターヤナイの像」に変えたので描かない
    const Q = new SP.Pix(MW * T, 5 * T), gTop = base - gt.height + 1, ox = gx + TS.ASSETS.village.ruins.gateOpen;
    if (ch >= 3 || lv.ending) { banner(Q, gx + 34, base - 22, C.teal); banner(Q, gx + gt.width - 46, base - 22, C.red); }
    if (lv.cleared) Q.ball(ox, gTop - 22, 5, 5, R('#c8f0ff'), { dither: false });
    add({ cv: Q.canvas(), x: 0, y: 0, sortY: base });
    // 石段の両わき：左に木の根が絡む壁、右に崩れた壁（足元は石段の行。人物は手前の道を歩く）
    add({ img: by, x: gx - by.width + 6, y: base - by.height + 1, w: by.width, h: by.height, sortY: base - 1 });
    add({ img: bw, x: gx + gt.width - 6, y: base - bw.height + 1, w: bw.width, h: bw.height, sortY: base - 1 });
    return true;
  }

  // ---------------- まとめ ----------------
  /* 村の絵と当たり判定を作る（村の状態が変わったときだけ） */
  VL.build = function (lv) {
    lv = Object.assign({}, lv, { pierArt: hasArt('pier') && hasArt('boat') && hasArt('quay'),   // 港の素材の絵が使えるか
      ruinArt: ['tower', 'gate', 'banyan_wall', 'broken_wall'].every((n) => hasArt('ruin_' + n)),   // 遺跡の素材の絵が使えるか
      bridgeArt: hasArt('deco_bridge') });   // 赤い橋の素材の絵が使えるか
    const G = groundMap(lv), Lo = layout(lv);
    const solid = new Uint8Array(MW * MH);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) solid[y * MW + x] = WALK[G[y][x]] ? 0 : 1;
    const block = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < MW && j < MH) solid[j * MW + i] = 1; };
    const objs = [], lights = [], smoke = [], steam = [], labels = [];
    const add = (o, sortY) => { objs.push(Object.assign(o, { sortY: sortY !== undefined ? sortY : o.sortY !== undefined ? o.sortY : o.y + o.cv.height - 3 })); if (o.lights) lights.push(...o.lights); if (o.smoke) smoke.push(...o.smoke); if (o.steam) steam.push(...o.steam); };
    // 寺院と建設予定地
    // 寺院（丘の上の遺跡）：素材の絵があれば、石段の上の古い門と、その奥の2本の赤レンガの塔。読み込めなければ今までの寺院
    if (!(lv.ruinArt && ruinsObjects(lv, add))) add(temple(lv));
    block(7, 0, 6, 4);
    add(site('school', [1, 1, 5, 3])); block(1, 1, 5, 3); labels.push(['学校（建設予定地）', 3.5 * T, 1 * T - 12]);
    add(site('library', [14, 1, 5, 3])); block(14, 1, 5, 3); labels.push(['図書館（建設予定地）', 16.5 * T, 1 * T - 12]);
    // 施設
    const kindOf = { smith: 'smith', museum: 'museum', shop: 'shop', storage: 'storage', develop: 'develop', diner: 'diner' };
    for (const f of Lo.fac) {
      if (f.dock) { labels.push([f.name, lv.pierArt ? 14 * T : 10 * T, lv.pierArt ? 23 * T + 2 : 21 * T + 4]); continue; }
      const [x, y, w, h] = f.fp;
      // 素材の絵の施設（サイの店・鍛冶屋・食堂・倉庫・展示室）：絵の入口の中心を、入る位置のマスの真上に置く。
      // 建っていない施設は今までの空き地の絵。読み込めなければコードで描いた建物（二重には描かない）
      const artName = f.built && ART_OF[f.id];
      const house = f.id === 'develop' && SP.art.village.com_house;
      // こもれびの家：階段の中心を、入る位置のマス（at）の中央に。階段の下の端が敷地の下の端。名札は屋根の上に家の名前
      const o = house ? { img: house, x: f.at[0] * T + 16 - Math.round(house.width / 2), y: (y + h) * T - house.height, w: house.width, h: house.height, sortY: (y + h) * T - 2 }
        : artName && facilityArt(artName, f.id === 'shop' ? f.npcAt[0] : f.at[0], (y + h) * T);
      if (o) add(o); else add(building(f.built ? kindOf[f.id] : 'lot', f.fp, lv));
      block(x, y, w, h);
      if (house) { labels.push([VL.COMMUNITY_NAME, f.at[0] * T + 16, (y + h) * T - house.height - 8]); continue; }
      labels.push([f.name, (x + w / 2) * T, y * T - (f.id === 'shop' || f.id === 'museum' ? 22 : 12)]);
    }
    // ヤナイの記念像
    // 素材の像は台座・灯籠ごと1枚（今までの台座と青銅の像は描かない＝二重にしない）。当たりは台座の2×2マスだけ
    // 村の発展「マスターヤナイの像」を建てたときだけ（建てる前は像・台座・名札・当たり・話しかけ、どれも無い。広場の床のまま）
    let st = { statueAt: null };
    if (lv.decor.yanai_statue) {
      const stArt = artProp('yanai_statue', 10 * T, 13 * T, 13 * T - 1);
      st = stArt ? Object.assign(stArt, { statueAt: null }) : statue(lv);
      add(st); block(9, 11, 2, 2); labels.push(['マスターヤナイの像', 10 * T, 11 * T - (stArt ? 52 : 70)]);
    }
    // 木・ヤシ（道や入口をふさがない場所だけ）
    // (0,17) のヤシは、こもれびの家の左の軒に重なるので、家の絵があるときは置かない
    const trees = [['palm', 0, 4]].concat(lv.ruinArt ? [] : [['round', 6, 4], ['round', 13, 4]], [['palm', 19, 4]],   // 石段の両わきの木は、遺跡の壁（木の根が絡む壁・崩れた壁）に置きかえ
      [ ['palm', 0, 8], ['palm', 19, 8], ['round', 5, 11], ['flower', 19, 12],
      ...(hasArt('com_house') ? [] : [['palm', 0, 17]]), ['palm', 19, 17], ['round', 0, 19], ['palm', 19, 19], ['palm', 1, 25], ['palm', 7, 25], ['palm', 5, 25], ['palm', 18, 25], ['round', 6, 0], ['round', 13, 0], ['palm', 0, 0], ['palm', 19, 0]]);
    // 丸い木は素材の木（当たりは幹のマスだけ。樹冠は奥を歩く人の手前に重なる）
    // ヤシは白い花の広葉樹の絵に（幹の根元をマスの足元に。2マス幅の樹冠は左右に半マスずつはみ出す）
    const comTree = SP.art.village.com_tree;
    const palmArt = (x, y) => comTree && { img: comTree, x: x * T + 16 - comTree.width / 2, y: (y + 1) * T - 1 - comTree.height, w: comTree.width, h: comTree.height, sortY: (y + 1) * T - 1 };
    for (const [k, x, y] of trees) { if (!WALK[G[y][x]] || G[y][x] === 'f') { add((k === 'round' && artProp('tree', x * T + 16, (y + 1) * T - 1)) || (k === 'palm' && palmArt(x, y)) || tree(k, x, y, lv.night)); solid[y * MW + x] = 1; } }
    // 小物：植木鉢・樽・灯り（道のわき）
    const props = new SP.Pix(MW * T, MH * T);
    const propAt = [];
    const putPot = (x, y, fl) => { pot(props, x * T + 16, y * T + 30, fl); propAt.push([x, y]); };
    putPot(6, 6, [C.pink, '#ffffff']); putPot(13, 6, ['#ffe070', C.pink]);   // 鍛冶屋・展示室の絵と重ならないよう1マス内側へ（以前は (5,6)・(14,6)）   // 像の両わきの鉢は、素材の像の灯籠と花壇に置きかえた
    putPot(0, 16, [C.pink]);   // 店の入口 (1,15) の前をあけるため、左の草地へ（以前は (1,16)）
    putPot(19, 16, ['#ffe070']);   // 食堂の屋根に隠れないよう右の草地へ（以前は (18,16)） putPot(5, 20, [C.pink, '#ffffff']); putPot(14, 20, ['#ffe070', C.pink]);
    // 庭の鉢：(5,13) は三毛猫の場所なので、像の左わき (8,12) へ
    // 庭の鉢：(14,13) は倉庫の足元、(14,19) はワーンの場所になったので、像の右わき (11,12) と (14,17) へ
    if (lv.decor.garden) { putPot(8, 12, [C.pink]); putPot(11, 12, ['#ffe070']); putPot(5, 19, [C.pink, '#ffffff']); putPot(14, 17, [C.pink]); }
    // 長いす・木箱・花壇（入口と通り道はあける）
    const bench = (x, y) => { const X = x * T + 3, Y = y * T + 26; props.rect(X, Y - 10, 26, 4, '#b8834e'); props.rect(X, Y - 10, 26, 1, '#e0b07a'); props.rect(X, Y - 15, 26, 3, '#9a6a3a'); props.rect(X + 2, Y - 6, 2, 6, C.woodD); props.rect(X + 22, Y - 6, 2, 6, C.woodD); propAt.push([x, y]); };
    // 長いす：素材の絵は2マス幅（寺院の前の2つと、広場の左の木陰の1つ）。読み込めなければ1マスの長いす
    for (const [x, y] of [[7, 6], [11, 6], [6, 11]]) {
      const o = artProp('bench', (x + 1) * T, (y + 1) * T - 2);
      if (o) { add(o); block(x, y, 2, 1); } else bench(x, y);
    }
    // 花壇：石のふちの中に丸い茂みと花
    const bed = (x, y, cols) => {
      const X = x * T, Y = y * T;
      props.rect(X + 2, Y + 14, 28, 16, C.stoneD); props.rect(X + 3, Y + 14, 26, 2, sh(C.stone, 0.2)); props.rect(X + 4, Y + 17, 24, 10, '#6a4a30');
      for (const [dx, dy, r] of [[9, 15, 6], [22, 15, 6], [15, 11, 7]]) props.ball(X + dx, Y + dy, r, r * 0.8, R(C.leaf), { bias: 0.1 });
      for (let i = 0; i < 12; i++) { const h = hash(x, y, i + 30), fx = X + 5 + (h % 22), fy = Y + 7 + ((h >> 6) % 12); props.set(fx, fy, cols[i % cols.length]); props.set(fx + 1, fy, cols[i % cols.length]); props.set(fx, fy + 1, sh(cols[i % cols.length], -0.3)); }
      propAt.push([x, y]);
    };
    // 花壇：像へ続く参道の両わき（素材の絵は2マス幅）。読み込めなければ1マスずつの花壇
    for (const [x, cols] of [[7, [C.pink, '#ffffff']], [11, ['#ffe070', C.pink]]]) {
      const o = artProp('flowerbed', (x + 1) * T, 14 * T - 2);
      if (o) { add(o); block(x, 13, 2, 1); } else { bed(x, 13, cols); bed(x + 1, 13, cols); }
    }
    // （以前の (15,10)・(18,10)・(1,10) の木箱と樽は、倉庫と店の絵に木箱・樽があり、屋根の陰に隠れて重なるのでやめた）
    const lamps = [[6, 8], [13, 8]];   // 鍛冶屋・展示室の絵の角に重ならないよう1マス内側へ（以前は (5,8)・(14,8)）
    if (lv.stage >= 2 || lv.decor.lanterns) lamps.push([5, 16], [14, 16]);
    // 岸の灯り（「灯り」を建てたとき）：ティウ (12,21)・係留杭・荷物と重ならない所へ（以前は (7,21)・(12,21)・(17,21)）
    if (lv.decor.lanterns) lamps.push([2, 21], [6, 21], [15, 21], [18, 21]);
    // 街灯：素材の絵があれば絵の街灯（足元はマスの下の方。灯りの光は絵の灯りの位置に）。無ければ今までの灯り
    const lampArt = SP.art.village.deco_lamp;
    for (const [x, y] of lamps) {
      if (lampArt) { add({ img: lampArt, x: x * T + 16 - lampArt.width / 2, y: y * T + 30 - lampArt.height, w: lampArt.width, h: lampArt.height, sortY: (y + 1) * T - 2 }); solid[y * MW + x] = 1; lights.push([x * T + 16, y * T + 30 - TS.ASSETS.village.decor.lampHead, 18]); }
      else { lantern(props, x * T + 16, y * T + 30); propAt.push([x, y]); lights.push([x * T + 16, y * T + 6, 18]); }
    }
    if (lv.chapter >= 3 || lv.ending) for (const [x, y, c] of [[6, 7, C.teal], [13, 7, C.red]]) { banner(props, x * T + 14, y * T + 30, c); propAt.push([x, y]); }
    // 屋台（村の発展「屋台」を建てたときだけ）：素材の絵は2マス幅で、参道の両わき。読み込めなければ今までの1マスの屋台
    if (lv.decor.stalls && hasArt('market_stall')) for (const x of [7, 11]) { add(artProp('market_stall', (x + 1) * T, 20 * T - 2)); block(x, 19, 2, 1); }
    else if (lv.decor.stalls) for (const [x, c] of [[6, '#e05a4a'], [13, '#3a9ad0']]) { awning(props, x * T + 2, 19 * T + 2, 28, 8, c, '#f4ead2'); props.rect(x * T + 4, 19 * T + 18, 24, 8, C.woodL); props.ball(x * T + 10, 19 * T + 16, 3, 3, R('#f0c040'), { dither: false }); props.ball(x * T + 20, 19 * T + 16, 3, 3, R('#7ac050'), { dither: false }); propAt.push([x, 19]); }
    if (lv.chapter <= 2 && !lv.ending) for (const [x, y] of [[7, 12], [12, 17]]) { for (let i = 0; i < 6; i++) { const h = hash(x, y, i); props.ball(x * T + 8 + h % 16, y * T + 24 - (h >> 6) % 10, 4, 3, R('#a89070'), {}); } propAt.push([x, y]); }
    const eleArt = SP.art.village.deco_elephant;
    if (lv.decor.statue && eleArt) { // 白いゾウの像（素材の絵）：(6,12) の足元に台座。当たりは今までどおり (6,12) の1マス
      add({ img: eleArt, x: 6 * T + 16 - eleArt.width / 2, y: 12 * T + 30 - eleArt.height, w: eleArt.width, h: eleArt.height, sortY: 13 * T - 2 }); solid[12 * MW + 6] = 1;
    } else if (lv.decor.statue) { // 白い象の像
      const x = 6 * T + 16, y = 12 * T + 28;
      props.rect(x - 12, y - 6, 26, 6, C.stoneD); props.ball(x, y - 16, 12, 9, R('#f4f0e8')); props.ball(x + 10, y - 20, 6, 6, R('#f4f0e8')); props.rect(x + 14, y - 18, 2, 12, '#e8e0d0');
      props.rect(x - 8, y - 10, 3, 6, '#e0d8c8'); props.rect(x + 4, y - 10, 3, 6, '#e0d8c8'); propAt.push([6, 12]);
    }
    if (lv.legacy || lv.legacy30) { // 旧版の記録の記念碑
      const x = 12 * T + 16, y = 12 * T + 30; props.rect(x - 8, y - 22, 16, 22, sh(C.stone, -0.05)); props.rect(x - 9, y - 23, 18, 2, C.gold); props.ball(x, y - 28, 5, 5, R(lv.legacy30 ? C.gold : '#c0c8d0'), { dither: false }); propAt.push([12, 12]);
    }
    props.outline(0.75);
    // 小物は1マスずつの切り抜きにして、人物と足元の高さ順に重ねる（灯りの柱の奥を通ると、柱が手前に見える）
    const pcv = props.canvas();
    for (const [x, y, w] of propAt) {
      const ww = (w || 1) * T + 16;
      objs.push({ cv: pcv, crop: [x * T - 8, y * T - 48, ww, T + 48], x: x * T - 8, y: y * T - 48, sortY: (y + 1) * T - 2 });
      if (!w) solid[y * MW + x] = 1;
    }
    // 噴水
    const fntArt = SP.art.village.deco_fountain;
    if (lv.decor.fountain && fntArt) { // 噴水（素材の絵）：参道の (9〜10,17) に。石の部分は動かさず、吹き出し口の水しぶきだけ控えめに動く
      const fx = 10 * T - fntArt.width / 2, fy = 18 * T - 2 - fntArt.height;
      // 水流の素材があれば、上の小さな水しぶきの代わりに水流と水盤の波紋（描画は render.js の drawFountainFx。石の本体は動かさない）
      const spray = SP.art.village.deco_fountain_spray;
      add({ img: fntArt, x: fx, y: fy, w: fntArt.width, h: fntArt.height, sortY: 18 * T - 2, fountainFx: !!spray }); block(9, 17, 2, 1);
      if (!spray) steam.push([10 * T, fy + TS.ASSETS.village.decor.fountainSpout, 'fountain']);
    } else if (lv.decor.fountain) {
      const P = new SP.Pix(2 * T, 2 * T), cx = T, cy = T + 8;
      P.ball(cx, cy, 28, 14, R(C.stone)); P.ball(cx, cy - 1, 23, 10, R('#3ab0d0'), { dither: false }); P.box(cx - 4, cy - 26, 8, 24, R(C.stone)); P.ball(cx, cy - 26, 10, 4, R(C.stone));
      P.outline(0.7);
      add({ cv: P.canvas(), x: 9 * T, y: 16 * T + 8 }); block(9, 17, 2, 1);
      steam.push([10 * T, 16 * T + 12, 'fountain']);
    }
    // 小舟（水の上）
    // ---- 港（素材の絵）：岸壁・桟橋・小舟・係留杭・荷物。読み込めなければ今までの舟（コード）----
    if (lv.pierArt && harborObjects(lv, add, solid)) { /* 素材の港 */ } else {
    const boat = new SP.Pix(64, 26);
    boat.poly([[2, 10], [62, 10], [54, 22], [10, 22]], (x, y) => (y < 13 ? '#b07a48' : '#7a4a28'));
    boat.rect(6, 9, 52, 2, '#d8a868'); boat.rect(14, 2, 34, 8, '#e8dcc0'); boat.rect(14, 2, 34, 1, '#c84a3a'); boat.rect(16, 4, 30, 1, '#c84a3a');
    boat.outline(0.7);
    add({ cv: boat.canvas(), x: 8 * T + 32, y: 24 * T - 2, boat: true });
    }
    // 村で拾える品（竜の紋章：赤い橋の向こう岸）。床の絵（道具の床用の絵）を、地面に少し光らせて置く。拾うマスは通れる（踏むと拾う）
    const pickups = [];
    for (const key of lv.pickups || []) {
      const P = TS.Data.VILLAGE_PICKUPS[key], def = TS.Data.ITEMS[P.item], img = SP.iconFor(def), [px, py] = P.at, s = 20;
      add({ img, x: px * T + 16 - s / 2, y: py * T + 26 - s, w: s, h: s, sortY: (py + 1) * T + 1, pickup: key });   // となりの木の葉より手前に
      lights.push([px * T + 16, py * T + 18, 10]);
      pickups.push({ key, x: px, y: py });
    }
    // 人
    const npcs = [];
    for (const f of Lo.fac) if (f.npc) { npcs.push({ who: f.npc, x: f.npcAt[0], y: f.npcAt[1], fac: f.id }); solid[f.npcAt[1] * MW + f.npcAt[0]] = 1; }
    // 子供と猫（村だけの人。戦わない）。素材の絵が無いときは今までのコードの絵で同じ場所に出す
    const kids = VL.KIDS.map((k, i) => Object.assign({}, k, { cv: hasArt('child_' + k.id + '_front') ? null : kid(i) }));
    const cats = VL.CATS.map((c, i) => Object.assign({}, c, { cv: hasArt('cat_' + c.id + '_sit') ? null : cat(i % 2) }));
    for (const k of kids) solid[k.y * MW + k.x] = 1;
    for (const c of cats) for (let x = c.x; x <= (c.walk ? c.walk[1] : c.x); x++) solid[c.y * MW + x] = 1;
    const ground = paintGround(lv, G, trees);
    // 建物の足元の影（地面に描く）
    const gcv = ground.canvas(), gg = gcv.getContext('2d');
    gg.fillStyle = 'rgba(30,20,40,0.22)';
    for (const f of Lo.fac) if (!f.dock) { const [x, y, w, h] = f.fp; gg.fillRect(x * T + 6, (y + h) * T - 2, w * T, 6); gg.fillRect((x + w) * T, y * T + 10, 6, h * T - 8); }
    // 素材の木・像・ベンチの足元に、控えめな影（光は左上から。影は右下へ少しずらす）
    gg.fillStyle = 'rgba(30,20,40,0.2)';
    for (const o of objs) if (o.img) { const cx = o.x + o.w / 2 + 3, cy = o.sortY + 1; gg.beginPath(); gg.ellipse(cx, cy, o.w * 0.36, 4, 0, 0, Math.PI * 2); gg.fill(); }
    return { ground: gcv, objs, solid, fac: Lo.fac, npcs, kids, cats, lights, smoke, steam, labels, statue: st.statueAt, yanai: !!lv.decor.yanai_statue, pickups, W: MW * T, H: MH * T };
  };

  /* 歩ける道をさがす（8方向。壁の角をななめに抜けない）。戻り値はマスの並び（出発点は含まない）。行けなければ null */
  VL.path = function (solid, sx, sy, gx, gy) {
    if (sx === gx && sy === gy) return [];
    const free = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH && !solid[y * MW + x];
    const prev = new Int32Array(MW * MH).fill(-1), q = [sy * MW + sx];
    prev[sy * MW + sx] = sy * MW + sx;
    const D8 = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi], cx = c % MW, cy = (c / MW) | 0;
      if (cx === gx && cy === gy) break;
      for (const [dx, dy] of D8) {
        const nx = cx + dx, ny = cy + dy;
        if (!free(nx, ny) || prev[ny * MW + nx] >= 0) continue;
        if (dx && dy && (!free(cx + dx, cy) || !free(cx, cy + dy))) continue;
        prev[ny * MW + nx] = c; q.push(ny * MW + nx);
      }
    }
    if (prev[gy * MW + gx] < 0) return null;
    const out = [];
    for (let c = gy * MW + gx; c !== sy * MW + sx; c = prev[c]) out.push({ x: c % MW, y: (c / MW) | 0 });
    return out.reverse();
  };
  VL.START = { x: 9, y: 20, dir: 'up' };

  TS.Village = VL;
})(globalThis.TS = globalThis.TS || {});
