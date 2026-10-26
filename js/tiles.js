/* ダンジョンの地形の絵（地域ごとの景観）。
 * 1マス32×32を、探索で見えたときに一度だけ画素バッファに描いて地形キャンバスへ転送する（毎フレームは描かない）。
 * ・床の石は「マップ全体の座標」で敷き詰めるので、石の継ぎ目がマスの境目と一致せず、大きさの違う石・欠け・ひびが自然に並ぶ。
 * ・壁は「上面・正面・根元の影」を描き分け、床には壁の影を落として高さの違いを出す。
 * ・水の地域では、正面の見えない壁を水面として描く（通れないことは変わらない。地形や当たり判定は変更しない）。
 * ・部屋ごとに見せ場（柱・壁画・仏像のくぼみ・床のモザイク・金の縁取り・結晶・根と苔）を1つ選ぶ。
 * 光は左上から。輪郭ははっきり、点模様のノイズではなく形で見せる。 */
(function (TS) {
  'use strict';
  const SP = TS.Sprites;
  const TL = {};
  const WALL = 0, FLOOR = 1, CORR = 2;
  const hash = (x, y, s) => SP.hash(x | 0, y | 0, s | 0);

  // ---------------- 色 ----------------
  const rgb = (h) => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
  const LIGHT = [255, 246, 220], SHADOW = [29, 16, 51];
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const sh = (c, t) => (t >= 0 ? mixc(c, LIGHT, Math.min(1, t)) : mixc(c, SHADOW, Math.min(1, -t)));

  // ---------------- なめらかなノイズ（模様の大きなむら用） ----------------
  const hf = (x, y, s) => (hash(x, y, s) & 1023) / 1023;
  function noise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hf(xi, yi, s), b = hf(xi + 1, yi, s), c = hf(xi, yi + 1, s), d = hf(xi + 1, yi + 1, s);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  // ---------------- 地域ごとの材質 ----------------
  const M = {
    brick: {   // 1〜3階：赤レンガの回廊（アユタヤの遺跡）
      floor: ['#b88c62', '#ac8058', '#c29a6e', '#a47a52'], grout: '#5a3a26', slab: 'mixed',
      corr: ['#8c6c4e', '#7e6046', '#967454'], dirt: '#3e2a1e',
      wall: ['#ae542e', '#b8603a', '#9c4a28', '#c06a40'], mortar: '#5e3020', brickW: 14, brickH: 6,
      top: 'bricktop', topC: ['#4a2c20', '#563424', '#3e241a'], topGap: '#24140e', rim: '#8a5a40', brickRuin: true, cap: '#c8a878',
      pillar: '#d8c4a0', accent: '#e8b84a', mural: '#c89a5a', moss: '#6a8a3a', root: '#5a3a1e', leaf: '#6aaa48',
      feats: ['plain', 'pillars', 'mural', 'statue', 'mosaic', 'overgrown', 'pillars'],
    },
    roots: {   // 4〜6階：根に覆われた神殿
      floor: ['#b0855e', '#a47a56', '#ba9068', '#9a7050'], grout: '#4a3020', slab: 'flag',
      corr: ['#86684a', '#7a5e42', '#927252'], dirt: '#2c2016',
      wall: ['#a2502e', '#ac5a36', '#924628', '#b8643e'], mortar: '#4e2a1a', brickW: 14, brickH: 6,
      top: 'earth', topC: ['#33281a', '#3c3020', '#2a2014'], topGap: '#1a140c', rim: '#6a5236',
      pillar: '#b8a888', accent: '#d8b860', mural: '#a8905a', moss: '#4f8a38', root: '#5a3a1e', leaf: '#6aaa48',
      feats: ['overgrown', 'overgrown', 'statue', 'plain', 'pillars'],
    },
    water: {   // 7〜9階：水に沈んだ回廊
      floor: ['#aab8b2', '#9eaea8', '#b4c2ba', '#94a49e'], grout: '#4a5e62', slab: 'tile',
      corr: ['#8a9a96', '#7e8e8a', '#96a6a0'], dirt: '#2e3e42',
      wall: ['#5a7e8c', '#668a98', '#4e7280', '#6e92a0'], mortar: '#2a4048', brickW: 16, brickH: 8,
      top: 'rubble', topC: ['#1c3440', '#22404c', '#182c36'], topGap: '#0c1c24', rim: '#5a7a84',
      water: '#2a86a6', deep: '#145a78', ledge: '#c4ccc0',
      pillar: '#d4dcd4', accent: '#e8c050', inlay: '#2aa8a8', mural: '#8ab0b0', moss: '#4a8a6a', lotus: true, crystal: '#8af4ff', crystal2: '#4ad0e8',
      feats: ['inlay', 'mosaic', 'braziers', 'statue', 'inlay'],
    },
    orb: {     // 10階：宝珠の間（守護獅子）
      floor: ['#c8a272', '#be986a', '#d0aa7a', '#b48e62'], grout: '#7a5a22', slab: 'temple',
      corr: ['#a4845c', '#9a7a54', '#ae8e64'], dirt: '#4a3418',
      wall: ['#b07c3c', '#bc8846', '#a47034', '#c4904e'], mortar: '#5a3a14', brickW: 22, brickH: 8,
      top: 'temple', topC: ['#3a2610', '#442e14', '#30200c'], topGap: '#1e1406', rim: '#c89a4a',
      pillar: '#e8d4a8', accent: '#ffd84a', mural: '#c8963a',
      feats: ['goldtrim'],
    },
    garden: {  // 11〜15階：苔むした庭園
      floor: ['#aa8a62', '#9e805a', '#b4946c', '#927452'], grout: '#463424', slab: 'flag',
      corr: ['#82704e', '#766648', '#8e7a56'], dirt: '#2a2416',
      wall: ['#9a5232', '#a45c3a', '#8a482c', '#b06842'], mortar: '#4a2a1a', brickW: 14, brickH: 6,
      top: 'hedge', topC: ['#2e5a2a', '#3a6c32', '#24481f'], topGap: '#14280f', rim: '#4f8a3a',
      pillar: '#c8c4a8', accent: '#f0c850', mural: '#a8a46a', moss: '#5a9a3a', leaf: '#6aaa48', root: '#4a3018', flower: ['#e05a8a', '#ffd84a', '#ffffff'],
      feats: ['overgrown', 'mosaic', 'plain', 'statue', 'overgrown'],
    },
    // 7〜15階：地下の遺跡（2026年10月21日）。砂岩の柱と古い石畳。7〜10階は灯り多め（ruins）、11〜15階は暗く荘厳（ruins_deep）
    ruins: {
      floor: ['#b8a07a', '#ac9470', '#c2aa84', '#a28a66'], grout: '#54442e', slab: 'temple',
      corr: ['#948062', '#8a765a', '#9e8a6a'], dirt: '#3a2e1e',
      wall: ['#9a7a52', '#a6865c', '#8e6e48', '#b08e64'], mortar: '#4a3820', brickW: 20, brickH: 8,
      top: 'temple', topC: ['#30261a', '#3a2e1e', '#282014'], topGap: '#16100a', rim: '#b8945a',
      pillar: '#dccaa4', accent: '#e8c050', mural: '#b0905a', moss: '#5a8a3a',
      feats: ['braziers', 'pillars', 'mural', 'statue', 'mosaic', 'braziers'],
    },
    ruins_deep: {
      floor: ['#8a7a68', '#80705e', '#948472', '#766656'], grout: '#2e2418', slab: 'temple',
      corr: ['#6e6252', '#665a4a', '#76695a'], dirt: '#1e1810',
      wall: ['#6e5a48', '#786452', '#645040', '#826e5a'], mortar: '#2a1e14', brickW: 22, brickH: 8,
      top: 'temple', topC: ['#1e1810', '#241e14', '#18120c'], topGap: '#0c0804', rim: '#a8844a',
      pillar: '#b8a88a', accent: '#d8b048', mural: '#8a7050', moss: '#4a7a3a',
      feats: ['statue', 'pillars', 'mural', 'goldtrim', 'pillars'],
    },
    sunken: {  // 16〜20階：沈んだ都
      floor: ['#84a0a6', '#7a969c', '#8eaab0', '#708c92'], grout: '#2c4850', slab: 'tile',
      corr: ['#6a8288', '#60787e', '#748c92'], dirt: '#1e3036',
      wall: ['#40687a', '#4a7486', '#385e70', '#527c8e'], mortar: '#1c3440', brickW: 18, brickH: 8,
      top: 'rubble', topC: ['#12303c', '#163846', '#0e2832'], topGap: '#081820', rim: '#3e6a78',
      water: '#1e6c8c', deep: '#0e3c56', ledge: '#9ab4b4',
      pillar: '#a8c4c4', accent: '#ffd84a', inlay: '#2a9aa8', mural: '#6a9aa0', moss: '#4a8a6a', lotus: true, crystal: '#8af4ff', crystal2: '#4ad0e8',
      feats: ['inlay', 'braziers', 'mural', 'statue', 'pillars'],
    },
    crystal: { // 21〜25階：結晶の洞窟
      floor: ['#7890a0', '#6e8696', '#829aaa', '#647c8c'], grout: '#2a3a48', slab: 'tile',
      corr: ['#5e7280', '#566a78', '#687c8a'], dirt: '#1a2630',
      wall: ['#4e6a80', '#58748a', '#466276', '#607c92'], mortar: '#1e2c38', brickW: 18, brickH: 8,
      top: 'rubble', topC: ['#142430', '#1a2c3a', '#101e28'], topGap: '#08121a', rim: '#4a7a90',
      water: '#2a90b0', deep: '#145a78', ledge: '#a8c0c8', lotus: true,
      pillar: '#b4ccd8', accent: '#e8c050', inlay: '#30b8c0', crystal: '#7af0ff', crystal2: '#4ad0e8', mural: '#5a8aa0',
      feats: ['crystals', 'inlay', 'braziers', 'crystals', 'statue'],
    },
    gold: {    // 26〜29階：金の神殿
      floor: ['#6a5a74', '#625268', '#72627c', '#5a4c64'], grout: '#2a1e30', slab: 'temple', carpet: '#9a1e2e',
      corr: ['#54485e', '#4c4056', '#5c5066'], dirt: '#1e1624',
      wall: ['#4e3e5e', '#584668', '#463656', '#625070'], mortar: '#1e1428', brickW: 22, brickH: 8,
      top: 'temple', topC: ['#1c1226', '#22162e', '#160e1e'], topGap: '#0c0812', rim: '#c8a040',
      pillar: '#d8c8a0', accent: '#ffd84a', mural: '#8a5a8a',
      feats: ['goldtrim', 'seal', 'pillars', 'mural', 'goldtrim', 'statue'],
    },
    shrine: {  // 30階：願いの宝珠の間
      floor: ['#c8b4dc', '#bea8d2', '#d2bee6', '#b49ec8'], grout: '#6e5094', slab: 'temple',
      corr: ['#a490bc', '#9a86b2', '#ae9ac6'], dirt: '#3a2a50',
      wall: ['#8a6ab0', '#9676bc', '#7e60a4', '#a282c8'], mortar: '#3e2a5a', brickW: 22, brickH: 8,
      top: 'temple', topC: ['#26183a', '#2e1e44', '#201430'], topGap: '#120a1e', rim: '#c8a0f0',
      pillar: '#efe4ff', accent: '#ffd84a', mural: '#9a7ac0',
      feats: ['goldtrim', 'mosaic', 'pillars'],
    },
    // ---- 最終章：大魔王の城（暗い大理石と金の装飾） ----
    demon: {
      floor: ['#4a3a5a', '#42344f', '#524264', '#3c2f4a'], grout: '#1a1020', slab: 'temple',
      corr: ['#3a2e46', '#34283e', '#42354e'], dirt: '#140c1a',
      wall: ['#3a2a48', '#443252', '#322440', '#4c3a5a'], mortar: '#160e1e', brickW: 22, brickH: 8,
      top: 'temple', topC: ['#140c1c', '#1a1024', '#100816'], topGap: '#08040c', rim: '#8a6ab0',
      pillar: '#8a7aa8', accent: '#e8c040', mural: '#6a4a8a', carpet: '#8a1626',
      feats: ['goldtrim', 'seal', 'pillars', 'mural', 'seal'],
    },
    // 35階：封印の玉座（赤い絨毯）
    throne: {
      floor: ['#5a4a6a', '#52445f', '#62526f', '#4c3e5c'], grout: '#1e1228', slab: 'temple', carpet: '#9a1a2a',
      corr: ['#4a3e5a', '#443852', '#524662'], dirt: '#180e20',
      wall: ['#4a3a5a', '#544366', '#40324e', '#5c4a6e'], mortar: '#1a1024', brickW: 22, brickH: 8,
      top: 'temple', topC: ['#180e24', '#1e142c', '#140a1e'], topGap: '#0a0612', rim: '#c8a0f0',
      pillar: '#c8b8e0', accent: '#ffd84a', mural: '#7a5a9a',
      feats: ['seal', 'pillars'],
    },
    // ---- 章のボス部屋 ----
    arena_croc: {  // 獣王の沼の広間：苔むした石と沼の水
      floor: ['#8a9468', '#7e885e', '#96a070', '#747e56'], grout: '#3a4024', slab: 'flag',
      corr: ['#6e6a4c', '#646046', '#787452'], dirt: '#2a2a18',
      wall: ['#5a6a48', '#647452', '#526040', '#6c7c58'], mortar: '#2a3018', brickW: 18, brickH: 8,
      top: 'earth', topC: ['#1e2a18', '#24321c', '#182414'], topGap: '#0e160a', rim: '#5a7a48',
      water: '#3a7a5a', deep: '#1e4a3a', ledge: '#b0b890', lotus: true,
      pillar: '#a8b090', accent: '#c8a040', mural: '#7a8a5a', moss: '#4f8a38', root: '#4a3018', leaf: '#6aaa48',
      feats: ['overgrown'],
    },
    arena_flame: { // 炎と氷の祭壇：左が熱く、右が冷たい床
      floor: ['#6a5a5a', '#625252', '#726262', '#5a4c4c'], grout: '#20141a', slab: 'temple', split: true, warm: '#a8482a', cold: '#3a78a8',
      corr: ['#5a4a4a', '#524444', '#625050'], dirt: '#1a1014',
      wall: ['#5a3a40', '#64444a', '#523438', '#6c4c52'], mortar: '#1c1014', brickW: 20, brickH: 8,
      top: 'rock', topC: ['#1c1014', '#22141a', '#160c10'], topGap: '#0a0608', rim: '#8a5a5a',
      pillar: '#a89090', accent: '#ff8a3a', mural: '#8a5a50',
      feats: ['pillars'],
    },
    arena_kill: {  // 死神の遊技場：黒と赤の市松模様
      floor: ['#3a2a34', '#342630', '#40303a', '#30222c'], grout: '#120810', slab: 'tile', checker: ['#2a1c26', '#7a2434'],
      corr: ['#3a2a34', '#342630', '#40303a'], dirt: '#120810',
      wall: ['#4a2a40', '#54344a', '#422438', '#5c3c52'], mortar: '#160a12', brickW: 16, brickH: 8,
      top: 'temple', topC: ['#14080e', '#1a0c14', '#10060a'], topGap: '#08030a', rim: '#8a4a6a',
      pillar: '#a88aa0', accent: '#e8c040', mural: '#6a3a5a',
      feats: ['mural'],
    },
    arena_baran: { // 竜の騎士の神殿：白い石と青い壁、金の縁
      floor: ['#c8c0a8', '#bcb49c', '#d2caB2', '#b2aa92'], grout: '#6a6250', slab: 'temple',
      corr: ['#a8a088', '#9e9680', '#b2aa92'], dirt: '#3a3628',
      wall: ['#8a9ab8', '#94a4c2', '#8090ae', '#9eaecc'], mortar: '#3a4258', brickW: 22, brickH: 8,
      top: 'temple', topC: ['#1e2434', '#242a3c', '#181e2c'], topGap: '#0a0e18', rim: '#a0b8e0',
      pillar: '#e8ecf4', accent: '#e8c040', mural: '#6a7a9a',
      feats: ['goldtrim'],
    },
    void: {        // 33階・白い異空間（ふだんは js/render.js の drawVoidBg が描くので使わない。予備の白い大理石）
      floor: ['#eceef4', '#e4e7ee', '#f2f3f7', '#dde1ea'], grout: '#b8c0d0', slab: 'temple',
      corr: ['#e2e5ec', '#dadee8', '#e8eaf0'], dirt: '#a8b0c0',
      wall: ['#d8dce6', '#e0e4ec', '#d0d5e0', '#e6e9f0'], mortar: '#b0b8c8', brickW: 22, brickH: 8,
      top: 'temple', topC: ['#c8cedb', '#d0d5e0', '#c0c6d4'], topGap: '#a8b0c2', rim: '#a8d8ff',
      pillar: '#f4f6fa', accent: '#a8d8ff', mural: '#c0c8d8',
      feats: ['plain'],
    },
    arena_mist: {  // 影の霧の間：紫の岩と淡い光の筋
      floor: ['#4a3e6a', '#443860', '#504474', '#3e3458'], grout: '#1c1630', slab: 'cave', crystal: '#b090ff',
      corr: ['#3e3458', '#382e50', '#463c62'], dirt: '#140f22',
      wall: ['#3a3058', '#443a64', '#342a50', '#4c4270'], mortar: '#140f22', brickW: 0, brickH: 0,
      top: 'rock', topC: ['#100c1e', '#161226', '#0c0818'], topGap: '#060410', rim: '#6a5a9a',
      pillar: '#8a7ab8', accent: '#b090ff', mural: '#5a4a8a', crystal2: '#e8d8ff',
      feats: ['statue'],
    },
  };
  // 色を配列に変換しておく
  // 見せ場の絵で使う色の既定値（地域に無い色でも描けるように。水の色は水の地域だけ）
  const DEF = { moss: '#5a8a3a', root: '#5a3a1e', leaf: '#6aaa48', crystal: '#7af0ff', crystal2: '#4ad0e8', mural: '#8a7a6a', flower: ['#e05a8a', '#ffd84a', '#ffffff'] };
  for (const k of Object.keys(M)) {
    const t = M[k];
    t.isWater = !!t.water;
    for (const [f, v] of Object.entries(DEF)) if (!t[f]) Object.defineProperty(t, f, { value: v, writable: true, enumerable: false, configurable: true });
    for (const f of ['floor', 'corr', 'wall', 'topC', 'flower']) if (t[f]) t[f] = t[f].map(rgb);
    for (const f of ['grout', 'dirt', 'mortar', 'topGap', 'rim', 'pillar', 'accent', 'mural', 'moss', 'root', 'leaf', 'water', 'deep', 'ledge', 'crystal', 'crystal2', 'warm', 'cold', 'carpet', 'inlay', 'cap']) if (t[f]) t[f] = rgb(t[f]);
    if (t.checker) t.checker = t.checker.map(rgb);
  }
  TL.isWaterTheme = (theme) => !!(M[theme] && M[theme].isWater);

  // ---------------- 画素バッファ ----------------
  const img = typeof ImageData !== 'undefined' ? new ImageData(32, 32) : { data: new Uint8ClampedArray(4096) };
  const buf = img.data;
  const put = (x, y, c) => { if (x < 0 || y < 0 || x > 31 || y > 31) return; const i = (y * 32 + x) * 4; buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255; };
  const get = (x, y) => { const i = (y * 32 + x) * 4; return [buf[i], buf[i + 1], buf[i + 2]]; };
  const dark = (x, y, f) => { if (x < 0 || y < 0 || x > 31 || y > 31) return; const i = (y * 32 + x) * 4; buf[i] *= f; buf[i + 1] *= f; buf[i + 2] *= f * 1.04; };
  const rect = (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(i, j, c); };
  const disc = (cx, cy, rx, ry, fn) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, q = nx * nx + ny * ny;
      if (q <= 1) put(x, y, fn(nx, ny, q));
    }
  };

  // ---------------- 床の石（マップ座標で敷く） ----------------
  const ROWS = {
    mixed: [[0, 16, 32, 48, 64], [0, 20, 40, 64], [0, 12, 28, 44, 64], [0, 24, 44, 64]],
    flag: [[0, 22, 42, 64], [0, 18, 40, 64], [0, 26, 46, 64]],
    tile: [[0, 16, 32, 48, 64]],
    temple: [[0, 32, 64], [0, 21, 42, 64]],
  };
  const COLS = {
    mixed: [[0, 18, 40, 64], [0, 26, 44, 64], [0, 14, 32, 50, 64], [0, 22, 64], [0, 30, 48, 64]],
    flag: [[0, 24, 44, 64], [0, 30, 64], [0, 16, 38, 64], [0, 20, 46, 64]],
    tile: [[0, 16, 32, 48, 64]],
    temple: [[0, 32, 64], [0, 21, 42, 64]],
  };
  function seg(list, v) { for (let i = 0; i < list.length - 1; i++) if (v < list[i + 1]) return i; return list.length - 2; }
  function slabAt(style, wx, wy, seed) {
    const rows = ROWS[style], cols = COLS[style];
    const by = Math.floor(wy / 64), ly = wy - by * 64;
    const rp = rows[hash(by, 1, seed) % rows.length], ri = seg(rp, ly), rowId = by * 8 + ri;
    const off = style === 'tile' ? (ri % 2) * 8 : style === 'temple' ? 0 : hash(rowId, 2, seed) % 40;
    const sx = wx + off, bx = Math.floor(sx / 64), lx = sx - bx * 64;
    const cp = cols[hash(bx, rowId, seed) % cols.length], ci = seg(cp, lx);
    return { id: hash(bx * 8 + ci, rowId, seed + 5), lx: lx - cp[ci], ly: ly - rp[ri], w: cp[ci + 1] - cp[ci], h: rp[ri + 1] - rp[ri] };
  }
  // 石畳の床
  function slabPixel(T, wx, wy, seed) {
    const s = slabAt(T.slab, wx, wy, seed);
    if (s.lx === 0 || s.ly === 0) return T.grout;
    const tone = T.floor[s.id % T.floor.length];
    // 欠け：角が欠けて下の土が見える
    if (s.id % 7 === 1 && s.lx + s.ly < 6) return s.lx + s.ly >= 5 ? sh(tone, 0.22) : sh(T.grout, 0.08);
    if (s.id % 13 === 4 && (s.w - s.lx) + (s.h - s.ly) < 7) return (s.w - s.lx) + (s.h - s.ly) >= 6 ? sh(tone, -0.3) : sh(T.grout, 0.08);
    // ひび：石を斜めに走る細い線
    if (s.id % 9 === 2) {
      const t = s.lx / s.w, cy = s.h * (0.25 + 0.5 * t) + ((hash(s.lx >> 1, s.id, 3) & 3) - 1.5) * 0.6;
      if (t > 0.15 && t < 0.85) { if (Math.abs(s.ly - cy) < 0.6) return sh(tone, -0.42); if (Math.abs(s.ly - 1 - cy) < 0.6) return sh(tone, 0.2); }
    }
    let k = 0;
    if (s.lx === 1 || s.ly === 1) k = 0.15; else if (s.lx === s.w - 1 || s.ly === s.h - 1) k = -0.2;
    k += (noise(wx / 26, wy / 26, seed) - 0.5) * 0.16;                       // すり減り・汚れの大きなむら
    if (T.slab === 'temple' && s.lx > 2 && s.ly > 2 && s.lx - s.ly === 2) k += 0.1; // 磨いた石の映り込み
    return sh(tone, k);
  }
  // 通路：小石を踏み固めた道
  function cobblePixel(cols, gap, wx, wy, seed, cell) {
    const cx = Math.floor(wx / cell), cy = Math.floor(wy / cell);
    let b1 = 1e9, b2 = 1e9, id = 0, px = 0, py = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const gx = cx + dx, gy = cy + dy, h = hash(gx, gy, seed);
      const ox = (gx + 0.2 + (h & 255) / 255 * 0.6) * cell, oy = (gy + 0.2 + ((h >>> 8) & 255) / 255 * 0.6) * cell;
      const d = (wx + 0.5 - ox) ** 2 + (wy + 0.5 - oy) ** 2;
      if (d < b1) { b2 = b1; b1 = d; id = h; px = ox; py = oy; } else if (d < b2) b2 = d;
    }
    const edge = Math.sqrt(b2) - Math.sqrt(b1);
    if (edge < 1.3) return gap;
    const tone = cols[id % cols.length];
    const k = -((wx + 0.5 - px) + (wy + 0.5 - py)) / cell * 0.35 + (edge < 2.3 ? -0.12 : 0);
    return sh(tone, k);
  }

  // ---------------- 部屋の見せ場 ----------------
  function roomFeature(T, room, floor, seed) {
    if (!room) return 'none';
    if (room.feat) return room.feat;
    const f = T.feats[hash(room.id || 0, floor, seed + 31) % T.feats.length];
    Object.defineProperty(room, 'feat', { value: f, enumerable: false, configurable: true, writable: true });
    return f;
  }
  // モザイク（部屋の中央の飾り床）：蓮の花の形
  function mosaicClass(room, wx, wy) {
    const cx = (room.x + room.w / 2) * 32, cy = (room.y + room.h / 2) * 32;
    const R = Math.min(52, Math.min(room.w, room.h) * 32 * 0.4);
    const dx = wx + 0.5 - cx, dy = wy + 0.5 - cy, r = Math.hypot(dx, dy);
    if (r > R) return 0;
    if (r > R - 3) return 1;                                     // 外の輪
    const a = Math.atan2(dy, dx);
    if (r < R * 0.2) return 4;                                   // 中央の宝石
    if (r < (R - 4) * (0.42 + 0.5 * Math.abs(Math.cos(a * 4)))) return 3; // 花びら
    return 2;                                                    // 地
  }

  /* 1マスを描く。戻り値 { torch, water, glow } */
  TL.paint = function (run, L, x, y, theme) {
    const T = M[theme] || M.brick, m = run.map, W = m.w, H = m.h, seed = (run.seed ^ (run.floor * 7919)) >>> 0;
    const tiles = m.tiles;
    const at = (xx, yy) => (xx < 0 || yy < 0 || xx >= W || yy >= H ? WALL : tiles[yy * W + xx]);
    const walk = (xx, yy) => at(xx, yy) !== WALL;
    const room = (xx, yy) => { const id = L.roomGrid[yy * W + xx]; return id >= 0 ? m.rooms[id] : null; };
    const k = at(x, y), x0 = x * 32, y0 = y * 32;
    const out = { torch: false, water: false };
    // 水の地域：正面の見えない壁は水面（岸から2マスまで）
    const isFace = (xx, yy) => at(xx, yy) === WALL && walk(xx, yy + 1);
    const waterAt = (xx, yy) => T.isWater && at(xx, yy) === WALL && !isFace(xx, yy) && L.ring[yy * W + xx] > 0;

    if (k !== WALL) {
      // ---------- 床 ----------
      const rm = k === FLOOR ? room(x, y) : null;
      const feat = rm ? roomFeature(T, rm, run.floor, seed) : 'none';
      let near = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!walk(x + dx, y + dy)) near++;
      for (let ly = 0; ly < 32; ly++) for (let lx = 0; lx < 32; lx++) {
        const wx = x0 + lx, wy = y0 + ly;
        let c;
        if (k === CORR) c = cobblePixel(T.corr, T.dirt, wx, wy, seed, 9);
        else if (T.slab === 'cave') {
          c = cobblePixel(T.floor, T.grout, wx, wy, seed, 15);
          const v = Math.abs(noise(wx / 20, wy / 20, seed + 9) - 0.5);
          const vein = noise(wx / 40, wy / 40, seed + 10) > 0.55;   // 結晶の筋は床の一部だけ
          if (vein && v < 0.011) c = mixc(T.crystal, c, 0.35); else if (vein && v < 0.026) c = mixc(c, T.crystal, 0.2);
        } else c = slabPixel(T, wx, wy, seed);
        // ボス部屋の特別な床：炎と氷の左右、市松模様、玉座への絨毯
        if (k === FLOOR && T.split) c = mixc(c, wx < (rm ? (rm.x + rm.w / 2) * 32 : W * 16) ? T.warm : T.cold, 0.5);
        if (k === FLOOR && T.checker && c !== T.grout) c = mixc(c, T.checker[((wx >> 4) + (wy >> 4)) & 1], 0.7);
        if (k === FLOOR && T.carpet && rm && rm.w >= 5) {
          const dx = Math.abs(wx + 0.5 - (rm.x + rm.w / 2) * 32);
          if (dx < 30) c = dx > 26 ? T.accent : dx > 24 ? sh(T.accent, -0.4) : sh(T.carpet, ((wy >> 3) % 2 ? 0.05 : -0.05) + (noise(wx / 14, wy / 14, seed) - 0.5) * 0.15);
        }
        // 苔・草（庭園・根の地域、草むらの部屋）
        if (T.moss && (feat === 'overgrown' || theme === 'garden' || theme === 'roots')) {
          // 壁ぎわ・継ぎ目に寄せて生える（床全体を埋めない）
          const amt = noise(wx / 11, wy / 11, seed + 3) * 0.75 + near * 0.06 + (feat === 'overgrown' ? 0.08 : 0) + (theme === 'garden' ? 0.04 : 0);
          if (amt > 0.8) c = mixc(sh(T.moss, ((wx * 7 + wy * 3) % 5 === 0) ? 0.25 : -0.1 - (amt - 0.8)), c, 0.12);
          else if (amt > 0.74 && (wx + wy) % 2 === 0 && (c === T.grout || (wx * 3 + wy) % 3 === 0)) c = mixc(c, T.moss, 0.55);
        }
        // 見せ場の床
        if (feat === 'mosaic' && rm) {
          const cl = mosaicClass(rm, wx, wy);
          if (cl) {
            const edge = mosaicClass(rm, wx + 1, wy) !== cl || mosaicClass(rm, wx, wy + 1) !== cl;
            // 石に埋め込んだ象眼：床の色になじませた落ち着いた色
            const fl = T.floor[0];
            const pal = [null, mixc(sh(T.accent, -0.4), fl, 0.3), mixc(sh(T.mural, -0.35), fl, 0.35), mixc(T.accent, fl, 0.42), theme === 'brick' || theme === 'gold' ? [70, 150, 140] : mixc(sh(T.accent, 0.4), fl, 0.3)];
            c = edge ? sh(T.grout, -0.15) : sh(pal[cl], (cl === 3 && (wx + wy) % 9 === 0 ? 0.15 : 0) + (noise(wx / 20, wy / 20, seed) - 0.5) * 0.12);
          }
        }
        // 象眼の床（水晶の地下神殿）：1マスおきに、青緑のひし形と金のふち
        if (feat === 'inlay' && rm && T.inlay) {
          const tx = (wx >> 5) - rm.x, ty = (wy >> 5) - rm.y;
          if (((tx + ty) & 1) === 0 && tx > 0 && ty > 0 && tx < rm.w - 1 && ty < rm.h - 1) {
            const d = Math.abs((wx & 31) - 15.5) + Math.abs((wy & 31) - 15.5);
            if (d < 2.5) c = sh(T.accent, 0.2);
            else if (d < 9) c = mixc(sh(T.inlay, (wx & 31) < 16 ? 0.12 : -0.12), c, 0.25);
            else if (d < 10.5) c = mixc(T.accent, c, 0.35);
          }
        }
        if (feat === 'goldtrim' && rm) {
          const dx = Math.min(wx - rm.x * 32, (rm.x + rm.w) * 32 - 1 - wx), dy = Math.min(wy - rm.y * 32, (rm.y + rm.h) * 32 - 1 - wy), d = Math.min(dx, dy);
          if (d === 4 || d === 10) c = T.accent; else if (d === 5 || d === 11) c = sh(T.accent, -0.45);
          else if (d > 5 && d < 10) { const along = dx === d ? wy : wx; c = (Math.abs((along % 12) - 6) + (d - 6) < 3) ? sh(T.accent, -0.1) : sh(T.grout, 0.1); }
        }
        put(lx, ly, c);
      }
      // 壁の影（光は左上から：上と左の壁が床に影を落とす）
      const wallN = at(x, y - 1) === WALL && !waterAt(x, y - 1), wallW = at(x - 1, y) === WALL && !waterAt(x - 1, y), wallNW = at(x - 1, y - 1) === WALL && !waterAt(x - 1, y - 1);
      if (wallN) for (let ly = 0; ly < 7; ly++) for (let lx = 0; lx < 32; lx++) dark(lx, ly, 0.5 + ly * 0.072);
      if (wallW) for (let lx = 0; lx < 5; lx++) for (let ly = 0; ly < 32; ly++) dark(lx, ly, 0.62 + lx * 0.076);
      if (wallNW && !wallN && !wallW) for (let ly = 0; ly < 6; ly++) for (let lx = 0; lx < 6 - ly; lx++) dark(lx, ly, 0.6 + (lx + ly) * 0.06);
      // レンガの遺跡：床のふちに縁石（右・下が壁のとき）。歩ける範囲の境目をはっきりさせる
      if (T.brickRuin) {
        if (!walk(x, y + 1)) for (let lx = 0; lx < 32; lx++) { put(lx, 31, sh(T.grout, -0.3)); put(lx, 30, sh(get(lx, 30), 0.12)); }
        if (!walk(x + 1, y)) for (let ly = 0; ly < 32; ly++) { put(31, ly, sh(T.grout, -0.3)); dark(30, ly, 0.85); }
      }
      // 水辺の床は少し濡れて暗い
      if (T.isWater) for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) if (waterAt(x + dx, y + dy)) {
        for (let i = 0; i < 32; i++) for (let j = 0; j < 3; j++) { const px = dx === 1 ? 31 - j : dx === -1 ? j : i, py = dy === 1 ? 31 - j : dy === -1 ? j : i; dark(px, py, 0.82 + j * 0.05); }
      }
    } else if (waterAt(x, y)) {
      // ---------- 水面 ----------
      out.water = true;
      const deepT = L.ring[y * W + x] >= 2;
      const base = deepT ? T.deep : T.water;
      for (let ly = 0; ly < 32; ly++) for (let lx = 0; lx < 32; lx++) {
        const wx = x0 + lx, wy = y0 + ly;
        const n = noise(wx / 22, wy / 14, seed + 4);
        const w = Math.sin(wx * 0.32 + wy * 0.85 + n * 7);
        let c = sh(base, (n - 0.5) * 0.18);
        if (!deepT && ((wx * 5 + wy * 3) % 23 === 0 || noise(wx / 7, wy / 7, seed + 8) > 0.82)) c = mixc(c, T.ledge, 0.18); // 浅瀬の底の石
        if (w > 0.94) c = sh(c, 0.28); else if (w < -0.96) c = sh(c, -0.2);
        put(lx, ly, c);
      }
      // 岸の石の縁（通れる床に接する辺）
      const ledge = (side) => {
        for (let i = 0; i < 32; i++) for (let j = 0; j < 6; j++) {
          const px = side === 'w' ? j : side === 'e' ? 31 - j : i, py = side === 'n' ? j : side === 's' ? 31 - j : i;
          if (j < 3) put(px, py, sh(T.ledge, side === 's' ? (j === 2 ? 0.2 : -0.25 - j * 0.05) : j === 0 ? 0.12 : j === 2 ? -0.3 : 0));
          else if (j === 3) put(px, py, sh(T.deep, -0.5));
          else dark(px, py, 0.7 + (j - 4) * 0.12);
        }
      };
      if (walk(x, y - 1)) ledge('n'); if (walk(x - 1, y)) ledge('w'); if (walk(x + 1, y)) ledge('e'); if (walk(x, y + 1)) ledge('s');
      for (const [dx, dy, cx, cy] of [[-1, -1, 0, 0], [1, -1, 29, 0], [-1, 1, 0, 29], [1, 1, 29, 29]]) {
        if (walk(x + dx, y + dy) && !walk(x + dx, y) && !walk(x, y + dy)) rect(cx, cy, 3, 3, sh(T.ledge, -0.1));
      }
      // 蓮の葉と花
      if (T.lotus && hash(x, y, seed + 21) % 5 === 0) {
        const cx = 8 + hash(x, y, 1) % 16, cy = 9 + hash(x, y, 2) % 14, pad = [52, 128, 70];
        disc(cx, cy, 5.5, 3.2, (nx, ny) => (nx > 0.1 && Math.abs(ny) < 0.18 ? sh(base, -0.1) : sh(pad, -ny * 0.3 - nx * 0.15)));
        if (hash(x, y, 3) % 2) { disc(cx - 1, cy - 2, 2.2, 2.4, (nx, ny) => sh([244, 150, 184], -ny * 0.4)); put(cx - 1, cy - 3, [255, 230, 240]); }
      }
    } else if (walk(x, y + 1)) {
      // ---------- 壁の正面（下が床） ----------
      const below = room(x, y + 1);
      const feat = below ? roomFeature(T, below, run.floor, seed) : 'none';
      const rx = below ? x - below.x : -1;
      for (let ly = 0; ly < 32; ly++) for (let lx = 0; lx < 32; lx++) {
        const wx = x0 + lx;
        let c;
        if (ly < 5) { // 壁の上面のふち
          c = ly === 4 ? sh(T.rim, 0.25) : ly === 3 ? T.rim : sh(T.topC[0], 0.1 - (3 - ly) * 0.05);
        } else if (T.brickRuin && ly < 10) { // 砂岩の笠石（壁の一番上の段。張り出して影を落とす）
          const sx = Math.floor((wx + (y & 1) * 6) / 12), slx = (wx + (y & 1) * 6) % 12;
          c = ly === 9 ? sh(T.mortar, -0.3) : slx === 0 ? sh(T.cap, -0.45) : sh(T.cap, (ly === 5 ? 0.3 : ly === 8 ? -0.25 : 0.05) + ((hash(sx, y, seed + 5) & 3) - 1.5) * 0.05);
        } else if (T.brickRuin && ly < 12) { // 笠石の下の影
          c = sh(T.wall[0], -0.5 + (ly - 10) * 0.12);
        } else if (ly >= 28) { // 根元：暗く湿った帯
          c = sh(T.wall[0], -0.45 - (ly - 28) * 0.07);
        } else if (!T.brickW) { // 岩肌（結晶の洞窟）
          const n = noise(wx / 9, ly / 7, seed + y);
          c = sh(T.wall[Math.min(3, (n * 4) | 0)], (n - 0.5) * 0.5 - (ly - 5) / 23 * 0.25);
          if (Math.abs(noise(wx / 6, ly / 5, seed + 2) - 0.5) < 0.03) c = sh(c, -0.35);
        } else {
          const bh = T.brickH, row = Math.floor((ly - 5) / bh), ry = (ly - 5) % bh, off = (row + y) % 2 ? T.brickW >> 1 : 0;
          const bx = Math.floor((wx + off) / T.brickW), bl = (wx + off) % T.brickW;
          if (ry === bh - 1 || bl === 0) c = T.mortar;
          else {
            const id = hash(bx, row + y * 8, seed + 11);
            c = sh(T.wall[id % T.wall.length], (ry === 0 ? 0.18 : ry === bh - 2 ? -0.16 : 0) + (bl === 1 ? 0.08 : 0) - (ly - 5) / 23 * 0.2);
            if (id % 17 === 0 && ry > 0 && bl > 1) c = sh(T.mortar, -0.1);       // 抜け落ちたレンガ
          }
        }
        put(lx, ly, c);
      }
      // 角の陰影
      if (walk(x - 1, y)) for (let ly = 3; ly < 32; ly++) { put(0, ly, sh(get(0, ly), 0.18)); }
      else if (at(x - 1, y) === WALL && !isFace(x - 1, y)) for (let ly = 5; ly < 32; ly++) for (let lx = 0; lx < 3; lx++) dark(lx, ly, 0.6 + lx * 0.13);
      if (walk(x + 1, y)) for (let ly = 3; ly < 32; ly++) { dark(31, ly, 0.55); dark(30, ly, 0.8); }
      // 通路の入口の両わき：砂岩の柱（壁の端が床に接するとき）。出入り口がはっきり分かるように
      if (T.brickRuin) {
        const jamb = (x0j, light) => { for (let ly = 5; ly < 31; ly++) for (let i = 0; i < 4; i++) { const xx = x0j + i; const t = light ? i : 3 - i; put(xx, ly, (ly - 5) % 7 === 6 ? sh(T.cap, -0.5) : sh(T.cap, 0.25 - t * 0.18 - (ly > 27 ? 0.3 : 0))); } };
        if (walk(x - 1, y)) jamb(0, true);
        if (walk(x + 1, y)) jamb(28, false);
        // ところどころ、上から垂れる細い根（床にはみ出さない）
        const hr = hash(x, y, seed + 71);
        if (hr % 5 === 0 && !walk(x - 1, y) && !walk(x + 1, y)) {
          const rx0 = 6 + hr % 18, len = 8 + (hr >> 4) % 12;
          for (let ly = 5; ly < 5 + len; ly++) { const xx = rx0 + Math.round(Math.sin(ly / 3 + hr) * 1.2); put(xx, ly, sh(T.root || [90, 58, 30], 0.12)); put(xx + 1, ly, sh(T.root || [90, 58, 30], -0.3)); }
          if (T.leaf) { put(rx0 - 1, 9, T.leaf); put(rx0 + 2, 12, sh(T.leaf, -0.2)); }
        }
      }
      // 苔・水あと
      if (T.moss && (feat === 'overgrown' || T.isWater || theme === 'garden')) for (let lx = 0; lx < 32; lx++) {
        const h = Math.floor(noise((x0 + lx) / 6, y, seed + 6) * 9);
        for (let ly = 28 - h; ly < 28; ly++) if ((lx + ly) % 3) put(lx, ly, sh(T.moss, -0.2 + (ly - 20) * 0.02));
      }
      // 見せ場
      const center = below ? Math.floor(below.w / 2) : -9;
      if (feat === 'pillars' && rx >= 0 && rx % 3 === 1) drawPillar(T);
      else if (feat === 'goldtrim' && rx >= 0 && rx % 4 === 1) drawPillar(T, true);
      else if (feat === 'mural' && (rx === center || (below.w >= 8 && rx === center - 3))) drawMural(T, hash(x, y, seed) % 3);
      else if (feat === 'statue' && rx === center) drawStatue(T, theme, hash(x, y, seed) % 2 === 0);
      else if (feat === 'overgrown' && hash(x, y, seed + 2) % 2 === 0) drawRoots(T, hash(x, y, seed));
      else if (feat === 'crystals' && hash(x, y, seed + 2) % 3 === 0) drawCrystals(T, hash(x, y, seed), 30);
      else if (feat === 'braziers' && rx >= 0 && rx % 3 === 1) drawBrazier(T);
      else if (feat === 'seal' && rx === center) drawSeal(T);
      else if (feat === 'seal' && rx >= 0 && Math.abs(rx - center) === 2) drawBanner(T);
      else if (!below || hash(x, y, seed + 7) % 6 === 0) out.torch = hash(x, y, seed + 1) % 3 === 0;
      if (feat === 'goldtrim') { for (let lx = 0; lx < 32; lx++) { put(lx, 9, sh(T.accent, 0.2)); put(lx, 10, T.accent); put(lx, 11, sh(T.accent, -0.4)); if ((x0 + lx) % 8 < 2) put(lx, 10, sh(T.accent, 0.5)); } }
    } else {
      // ---------- 壁の上面（通れない塊） ----------
      drawTop(T, theme, x0, y0, seed);
      // 床に接する辺のふち（高さが分かるように）
      if (walk(x, y - 1)) { for (let lx = 0; lx < 32; lx++) { put(lx, 0, sh(T.rim, 0.3)); put(lx, 1, T.rim); put(lx, 2, sh(T.rim, -0.35)); } }
      if (walk(x - 1, y)) { for (let ly = 0; ly < 32; ly++) { put(0, ly, sh(T.rim, 0.3)); put(1, ly, T.rim); put(2, ly, sh(T.rim, -0.35)); } }
      if (walk(x + 1, y)) { for (let ly = 0; ly < 32; ly++) { put(31, ly, sh(T.rim, -0.45)); put(30, ly, sh(T.rim, -0.2)); } }
      // 上面の飾り（床に接する塊だけ）
      let edge = false; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (walk(x + dx, y + dy)) edge = true;
      if (edge) {
        const nb = room(x, Math.min(H - 1, y + 1)) || room(x, Math.max(0, y - 1)) || room(Math.max(0, x - 1), y) || room(Math.min(W - 1, x + 1), y);
        const feat = nb ? roomFeature(T, nb, run.floor, seed) : 'none';
        const h = hash(x, y, seed + 13);
        if (theme === 'crystal' && (feat === 'crystals' ? h % 2 === 0 : h % 5 === 0)) { drawCrystals(T, h, 22); out.glow = true; }
        else if ((theme === 'brick' || theme === 'roots') && h % 11 === 0) drawRubble(T, h);
        else if (theme === 'garden' && h % 4 === 0) drawFlowers(T, h);
      }
    }
    L.g.putImageData(img, x0, y0);
    artOverlay(run, L, x, y, theme, at, walk, out);
    return out;
  };

  /* 地域の背景の絵（ZIP dungeon_7themes_art_v1。D.DUNGEON_ART で使う地域だけ）。上のコードの絵を描いたあとに重ねる（地図・当たり判定は変えない）。
   *  床：64×64（2×2マス）の絵を、マップ全体の座標の偶数マスにそろえて敷く（柄は2×2マスごとに選ぶ）。通路は少し暗く。上・左が壁なら影
   *  壁の正面（下が床）：64×64（2マス幅・2マス高）の壁の絵の下半分。その上のマス（壁）には上半分（上の透明な所は今の壁の上面が見える）
   *  壁の上面（正面以外の壁）：64×64（2×2マス）の上面の絵。床に面した辺には縁（左・右・上＝部屋の下の壁）、縁どうしが出会う外角と、
   *  斜めだけ床に触れる内角には目地の角（10×10）。縁・角の絵が無い地域は今のコードの絵のまま。正面の壁のたいまつは絵に描かれているので、動くたいまつは出さない
   *  飾り（2026年10月22日）：正面の壁の2マス分にときどき柱・灯り・アーチ、部屋から離れた壁の上面にときどきがれき。どちらも壁のマスの中だけ */
  function artOverlay(run, L, x, y, theme, at, walk, out) {
    const D = TS.Data, A = SP.art.dungeon && SP.art.dungeon[theme];
    if (D.DUNGEON_ART && D.DUNGEON_ART[theme] === 'v2') return artOverlayV2(run, L, x, y, SP.art.dungeon[theme + '_v2'], at, walk, out, !!(D.DUNGEON_EDGE_V4 && D.DUNGEON_EDGE_V4[theme]));
    const ready = (l) => l && l.length && l.every(Boolean);
    if (!D.DUNGEON_ART || !D.DUNGEON_ART[theme] || !A || !ready(A.floor) || !ready(A.wall) || !ready(A.narrow)) return;
    const g = L.g, x0 = x * 32, y0 = y * 32, seed = (run.seed ^ (run.floor * 7919)) >>> 0, k = at(x, y);
    const isFace = (xx, yy) => at(xx, yy) === WALL && walk(xx, yy + 1);
    // 壁の正面の並び（左の端から数える）：2マスずつ横長の絵。奇数マスで終わる最後の1マスと、1マスだけの壁は細い絵
    const wallPart = (yy) => {
      let s0 = x; while (isFace(s0 - 1, yy)) s0--;
      let s1 = x; while (isFace(s1 + 1, yy)) s1++;
      const idx = x - s0, len = s1 - s0 + 1;
      if (len % 2 === 1 && idx === len - 1) return { img: A.narrow[hash(x, yy, seed + 93) % A.narrow.length], sx: 0 };
      // 飾り（案1）：2マス分の壁のうち、ときどき（約6分の1）柱・灯り・アーチを重ねる。壁のマスの中だけ（床・敵は隠さない）
      const pair = s0 + (idx >> 1), dh = hash(pair, yy, seed + 95);
      const deco = D.DUNGEON_DECO && ready(A.decoWall) && dh % 6 === 0 ? A.decoWall[(dh >> 4) % A.decoWall.length] : null;
      return { img: A.wall[hash(pair, yy, seed + 92) % A.wall.length], sx: (idx & 1) * 32, deco };
    };
    const dark = D.DUNGEON_WALL_DARK && D.DUNGEON_WALL_DARK[theme];
    const darkWall = () => { if (dark) { g.fillStyle = 'rgba(6,4,10,' + dark + ')'; g.fillRect(x0, y0, 32, 32); } };
    const drawWall = (w, sy) => { g.drawImage(w.img, w.sx, sy, 32, 32, x0, y0, 32, 32); if (w.deco) g.drawImage(w.deco, w.sx, sy, 32, 32, x0, y0, 32, 32); };
    if (k !== WALL) {
      g.drawImage(A.floor[hash(x >> 1, y >> 1, seed + 91) % A.floor.length], (x & 1) * 32, (y & 1) * 32, 32, 32, x0, y0, 32, 32);
      // 通路も部屋と同じ床（以前は通路だけ少し暗くしていたが、部屋とのつなぎ目が四角く見えたのでやめた）
      const shade = (gx0, gy0, gx1, gy1, rx, ry, rw, rh) => { const gr = g.createLinearGradient(gx0, gy0, gx1, gy1); gr.addColorStop(0, 'rgba(22,10,4,0.6)'); gr.addColorStop(1, 'rgba(22,10,4,0)'); g.fillStyle = gr; g.fillRect(rx, ry, rw, rh); };
      if (at(x, y - 1) === WALL) shade(0, y0, 0, y0 + 9, x0, y0, 32, 9);
      if (at(x - 1, y) === WALL) shade(x0, 0, x0 + 6, 0, x0, y0, 6, 32);
    } else if (walk(x, y + 1)) {
      // 下地に上面の絵（壁の絵の形が四角でない所＝柱のわき・下のすき間に、今のコードの壁が透けないように）
      if (ready(A.top)) g.drawImage(A.top[hash(x >> 1, y >> 1, seed + 94) % A.top.length], (x & 1) * 32, (y & 1) * 32, 32, 32, x0, y0, 32, 32);
      drawWall(wallPart(y), 32);
      out.torch = false;
      darkWall();
    } else {
      // 角の絵：向きごとの絵（jOutNE など。第1回の追加原画）があればそれ、無ければ共通の目地の四角（joint。レンガの回廊）
      const J = (k) => (A[k] && ready(A[k]) ? A[k][0] : A.joint && ready(A.joint) ? A.joint[0] : null);
      const top = ready(A.top) && ready(A.rimW) && ready(A.rimE) && ready(A.rimN) && !!J('jOutNE');
      if (top) g.drawImage(A.top[hash(x >> 1, y >> 1, seed + 94) % A.top.length], (x & 1) * 32, (y & 1) * 32, 32, 32, x0, y0, 32, 32);
      const face = isFace(x, y + 1);
      if (face) drawWall(wallPart(y + 1), 0);
      if (!top) { darkWall(); return; }
      // 飾り（案2）：床から2マス以上離れた壁の上面に、ときどき（約19分の1）がれき
      if (D.DUNGEON_DECO && !face && ready(A.decoTop) && hash(x, y, seed + 96) % 19 === 0) {
        let far = true; for (let dy = -2; dy <= 2 && far; dy++) for (let dx = -2; dx <= 2; dx++) if (walk(x + dx, y + dy)) { far = false; break; }
        if (far) g.drawImage(A.decoTop[0], x0, y0);
      }
      // 縁：床に面した辺（下は壁の正面の絵が受け持つ）。2マス分の縁の絵を、マスの偶奇で上下（左右）半分ずつ使う。幅は絵の幅（地域ごと）
      const fW = walk(x - 1, y), fE = walk(x + 1, y), fN = walk(x, y - 1), rw = A.rimW[0].width, rh = A.rimN[0].height;
      if (fW) g.drawImage(A.rimW[0], 0, (y & 1) * 32, rw, 32, x0, y0, rw, 32);
      if (fE) g.drawImage(A.rimE[0], 0, (y & 1) * 32, rw, 32, x0 + 32 - rw, y0, rw, 32);
      if (fN) g.drawImage(A.rimN[0], (x & 1) * 32, 0, 32, rh, x0, y0, 32, rh);
      // 角：外角（縁が2本出会う）と内角（そのマスの縦横は壁で、斜めだけ床）。下側は下のマスが正面の壁なら描かない（正面の絵が受け持つ）
      const corner = (dx, dy, a, b) => { const v = (dy < 0 ? 'N' : 'S') + (dx > 0 ? 'E' : 'W');
        const img = a && b ? J('jOut' + v) : !a && !b && walk(x + dx, y + dy) ? J('jIn' + v) : null;
        if (img) g.drawImage(img, x0 + (dx > 0 ? 32 - img.width : 0), y0 + (dy > 0 ? 32 - img.height : 0)); };
      corner(-1, -1, fW, fN); corner(1, -1, fE, fN);
      if (!face) { corner(-1, 1, fW, false); corner(1, 1, fE, false); }
      darkWall();
    }
  }

  /* v2（レンガの回廊。ZIP brick_match_v2 の承認図に合わせる。2026年10月23日・プレビュー）
   *  床：4×4マス（128×128）の1枚を、マップ全体の座標で4マスごとにそろえて敷く（部屋も通路も同じ）
   *  正面の壁：3マスの高さ。いちばん下を床との境目（壁の正面のマス）にそろえ、その上の2マスに上の段を描く。各マスは自分のマスの中だけ
   *    （上の段のマスが床なら描かない＝床・通路・隣の部屋は覆わない）。壁の並びは左の端から アーチ4・旗2・アーチ4…、残りは旗2か細い1
   *  それ以外の壁：暗い単色（部屋の外と同じ）。床に面した辺と、正面の壁のとなりに縁（左右16px・下24px）。部屋の左下・右下の角に角の絵 */
  function artOverlayV2(run, L, x, y, A, at, walk, out, e4) {
    const ready = (l) => l && l.length && l.every(Boolean);
    if (!A || !A.seq || ![...A.seq, ...A.fill, 'floor', 'rimW', 'rimE', 'rimN', 'jInNE', 'jInNW'].every((k) => ready(A[k]))) return;
    const g = L.g, x0 = x * 32, y0 = y * 32, k = at(x, y);
    if (k !== WALL) {
      const F = A.floor[0], n = F.width / 32;
      g.drawImage(F, (x % n) * 32, (y % n) * 32, 32, 32, x0, y0, 32, 32);
      return;
    }
    const isFace = (xx, yy) => at(xx, yy) === WALL && walk(xx, yy + 1);
    // 壁の正面の並びの中の、x の列に当たる絵と列（左の端から数える）
    const part = (xx, yf) => {
      let s0 = xx; while (isFace(s0 - 1, yf)) s0--;
      let s1 = xx; while (isFace(s1 + 1, yf)) s1++;
      // 左の端から A.seq をくり返す。入らない残りは A.fill のうち入る最大のもの（どの絵も幅は 32 の倍数）
      const W = (n) => A[n][0].width / 32;
      let i = s0, turn = 0;
      for (;;) {
        const rest = s1 - i + 1, want = A.seq[turn % A.seq.length], n = W(want) <= rest ? want : A.fill.find((f) => W(f) <= rest) || A.fill[A.fill.length - 1], w = W(n);
        if (xx < i + w) return { img: A[n][0], col: xx - i };
        i += w; turn++;
      }
    };
    // このマスが正面の壁の絵の何段目か（2＝いちばん下＝壁の正面、1・0＝その上）。間に床があれば描かない
    const row = (xx, yy) => { if (at(xx, yy) !== WALL) return -1; for (let d = 0; d <= 2; d++) { if (d > 0 && at(xx, yy + d) !== WALL) return -1; if (isFace(xx, yy + d)) return 2 - d; } return -1; };
    const r = row(x, y);
    g.fillStyle = '#140a08'; g.fillRect(x0, y0, 32, 32);
    if (r >= 0) {
      const p = part(x, y + 2 - r); g.drawImage(p.img, p.col * 32, r * 32, 32, 32, x0, y0, 32, 32);
      out.torch = false;
    }
    // 縁：床に面した辺。正面の壁の絵のとなり（その絵を描かないマス）にも左右の縁を続ける。下は壁の正面の絵が受け持つ
    const art = (xx, yy) => row(xx, yy) >= 0;
    const fW = walk(x - 1, y) || (r < 0 && art(x - 1, y)), fE = walk(x + 1, y) || (r < 0 && art(x + 1, y)), fN = walk(x, y - 1);
    const vW = A.rimW[0], vE = A.rimE[0], hN = A.rimN[0];
    // 補修 v4：帯の位相（下の帯 x%4・左の帯 y%4・右の帯 y%2）に合う部品。出っ張った角は帯2本の代わりに置く
    const E4 = (n) => (e4 && A['e4_' + n] && A['e4_' + n][0]) || null;
    const hp = x % (hN.width / 32), vpE = y % (vE.height / 32), vpW = y % (vW.height / 32);
    const oNW = r < 0 && fN && walk(x - 1, y) && E4(`outer_floor_nw_h${hp}_v${vpW}`), oNE = r < 0 && fN && walk(x + 1, y) && !oNW && E4(`outer_floor_ne_h${hp}_v${vpE}`);
    if (oNW || oNE) g.drawImage(oNW || oNE, x0, y0);
    if (fW && !oNW) g.drawImage(vW, 0, vpW * 32, vW.width, 32, x0, y0, vW.width, 32);
    if (fE && !oNE) g.drawImage(vE, 0, vpE * 32, vE.width, 32, x0 + 32 - vE.width, y0, vE.width, 32);
    if (fN && !oNW && !oNE) g.drawImage(hN, hp * 32, 0, 32, hN.height, x0, y0, 32, hN.height);
    if (e4 && r < 0) {
      const top = (xx, yy) => row(xx, yy) === 0, put4 = (n, dx, dy) => { const c = E4(n); if (c) g.drawImage(c, x0 + dx, y0 + dy); };
      // 左右の帯の上端（となりが正面の壁のいちばん上の段）・下の終わり（下のマスが正面の壁のいちばん上の段）
      if (fE && !fN && top(x + 1, y)) put4(`upper_left_v${vpE}`, 32 - vE.width, 0);
      if (fW && !fN && top(x - 1, y)) put4(`upper_right_v${vpW}`, 0, 0);
      // 帯の終わり（end_vertical・end_bottom）：2026年10月26日の確認で、正面の壁の上端の縁取りと重なって暗い切れ目に見えたり、
      // 色が帯より暗く浮いたりしたので使わない（D.DUNGEON_EDGE_V4_ENDS が true のときだけ）
      if (TS.Data.DUNGEON_EDGE_V4_ENDS) {
        if (fE && !oNE && top(x, y + 1)) put4(`end_vertical_left_v${vpE}`, 32 - vE.width, 8);
        if (fW && !oNW && top(x, y + 1)) put4(`end_vertical_right_v${vpW}`, 0, 8);
        if (fN && !oNW && !walk(x - 1, y) && art(x - 1, y)) put4(`end_bottom_left_h${hp}`, 0, 0);
        if (fN && !oNE && !walk(x + 1, y) && art(x + 1, y)) put4(`end_bottom_right_h${hp}`, 8, 0);
      }
    }
    // 角：斜め上だけ床（部屋の左下・右下の角）
    if (!fN && walk(x + 1, y - 1) && !fE && at(x + 1, y) === WALL && at(x, y - 1) === WALL) { const c = E4(`corner_bottom_left_h${hp}_v${vpE}`) || A.jInNE[0]; g.drawImage(c, x0 + 32 - c.width, y0); }
    if (!fN && walk(x - 1, y - 1) && !fW && at(x - 1, y) === WALL && at(x, y - 1) === WALL) g.drawImage(E4(`corner_bottom_right_h${hp}_v${vpW}`) || A.jInNW[0], x0, y0);
    // 補修素材 v3 の角（無ければ描かない）。どれも自分のマスの中だけ
    const P = (n) => (ready(A[n]) ? A[n][0] : null), put = (n, right, bottom) => { const c = P(n); if (c) g.drawImage(c, right ? x0 + 32 - c.width : x0, bottom ? y0 + 32 - c.height : y0); };
    // 左右の縁が正面の壁の上端に届く所（木の根の遺跡の corner_upper_left/right。となりが正面の壁のいちばん上の段）
    if (!e4 && r < 0 && !fN && A.upper_left && row(x + 1, y) === 0) put('upper_left', true, false);
    if (!e4 && r < 0 && !fN && A.upper_right && row(x - 1, y) === 0) put('upper_right', false, false);
    if (r < 0 && TS.Data.DUNGEON_V2_CORNERS) {
      const wF = walk(x - 1, y), eF = walk(x + 1, y), row0 = (xx, yy) => row(xx, yy) === 0;
      // 出っ張った角：上と左（右）が床
      if (fN && wF) put('outer_nw', false, false);
      if (fN && eF) put('outer_ne', true, false);
      // 下の縁が、となりの正面の壁（隣の部屋や通路の口の上の壁）で終わる所
      if (fN && !wF && art(x - 1, y)) put('end_bl', false, false);
      if (fN && !eF && art(x + 1, y)) put('end_br', true, false);
      // 左右の縁が、下の正面の壁（通路の口の上の壁）で終わる所
      if (eF && row0(x, y + 1)) put('end_left', true, true);
      if (wF && row0(x, y + 1)) put('end_right', false, true);
    }
  }

  // ---------------- 部品 ----------------
  function drawTop(T, theme, x0, y0, seed) {
    for (let ly = 0; ly < 32; ly++) for (let lx = 0; lx < 32; lx++) {
      const wx = x0 + lx, wy = y0 + ly;
      let c;
      if (T.top === 'hedge') { // 生け垣：丸い葉の茂み
        c = cobblePixel(T.topC, T.topGap, wx, wy, seed + 40, 10);
        if ((wx * 3 + wy * 5) % 7 === 0) c = sh(c, 0.22);
      } else if (T.top === 'earth') { // 土と根
        c = sh(T.topC[0], (noise(wx / 10, wy / 10, seed + 41) - 0.5) * 0.5);
        const r = Math.abs(noise(wx / 16, wy / 16, seed + 42) - 0.5);
        if (r < 0.025) c = sh(T.root, 0.15); else if (r < 0.045) c = T.root;
      } else if (T.top === 'temple') { // 暗い石組み
        const s = slabAt('temple', wx, wy, seed + 43);
        c = s.lx === 0 || s.ly === 0 ? T.topGap : sh(T.topC[s.id % T.topC.length], s.lx === 1 || s.ly === 1 ? 0.12 : 0);
      } else if (T.top === 'rock') {
        c = cobblePixel(T.topC, T.topGap, wx, wy, seed + 44, 13);
      } else if (T.top === 'bricktop') { // レンガを上から見た積み面（16×8のレンガを互い違い。上の段ほど明るく）
        const row = wy >> 3, off = (row & 1) * 8, bx = (wx + off) >> 4, lxb = (wx + off) & 15, lyb = wy & 7;
        if (lxb === 0 || lyb === 0) c = T.topGap;
        else c = sh(T.topC[hash(bx, row, seed + 46) % T.topC.length], (lyb === 1 ? 0.14 : lyb === 7 ? -0.12 : 0) + (lxb === 1 ? 0.06 : 0) + (noise(wx / 24, wy / 24, seed + 47) - 0.5) * 0.25);
      } else c = cobblePixel(T.topC, T.topGap, wx, wy, seed + 45, 8); // がれき
      put(lx, ly, c);
    }
  }
  function drawPillar(T, gold) {
    const P = T.pillar, A = T.accent;
    for (let ly = 2; ly < 32; ly++) for (let lx = 8; lx < 24; lx++) {
      const cap = ly < 7, base = ly > 26;
      if (!cap && !base && (lx < 10 || lx > 21)) continue;
      const x0 = cap || base ? 8 : 10, x1 = cap || base ? 23 : 21;
      const t = (lx - x0) / (x1 - x0);
      let c = sh(P, 0.28 - t * 0.6);
      if (lx === x0 || lx === x1 || ly === 2 || ly === 31) c = sh(P, -0.6);
      else if (cap && (ly === 6)) c = sh(P, -0.35);
      else if (base && ly === 27) c = sh(P, 0.3);
      else if (!cap && !base && (lx - 10) % 4 === 3) c = sh(c, -0.12);       // 縦の溝
      if (gold && (ly === 4 || ly === 29)) c = sh(A, 0.1 - t * 0.4);
      put(lx, ly, c);
    }
  }
  // 水晶の燭台（金の台に青い結晶）
  function drawBrazier(T) {
    const G = T.accent;
    rect(13, 22, 6, 8, sh(G, -0.35)); rect(14, 22, 2, 8, sh(G, 0.1));
    disc(16, 21, 7, 2.6, (nx, ny) => sh(G, 0.2 - nx * 0.4 - ny * 0.2));
    rect(11, 29, 10, 2, sh(G, -0.5));
    for (let i = 0; i < 3; i++) { const cx = 12 + i * 4, h = 9 + (i === 1 ? 4 : 0); for (let ly = 0; ly < h; ly++) { const w = Math.max(0, 1.6 - ly / h * 1.6); for (let lx = Math.round(cx - w); lx <= Math.round(cx + w); lx++) put(lx, 20 - ly, mixc(T.crystal, [255, 255, 255], lx < cx ? 0.35 : 0)); } }
  }
  // 封印の扉（深紅と金の円い封印、中央に赤い宝石）
  function drawSeal(T) {
    const G = T.accent, dk = [24, 14, 30];
    for (let ly = 6; ly < 32; ly++) for (let lx = 6; lx < 26; lx++) {
      const arch = ly >= 12 || Math.hypot(lx + 0.5 - 16, ly + 0.5 - 12) <= 10;
      if (!arch) continue;
      const rim = lx === 6 || lx === 25 || (ly < 12 && Math.hypot(lx + 0.5 - 16, ly + 0.5 - 12) > 9);
      put(lx, ly, rim ? sh(G, -0.25) : lx === 16 ? [10, 6, 14] : sh(dk, (lx < 16 ? 0.12 : 0) + ((ly >> 2) & 1 ? 0.04 : 0)));
    }
    disc(16, 19, 6.5, 6.5, (nx, ny) => { const r = Math.hypot(nx, ny); return r > 0.82 ? sh(G, 0.15 - nx * 0.3) : r > 0.66 ? [120, 20, 36] : sh(G, -0.2 - ny * 0.2); });
    for (let a = 0; a < 8; a++) put(16 + Math.round(Math.cos(a * 0.785) * 4), 19 + Math.round(Math.sin(a * 0.785) * 4), sh(G, 0.4));
    disc(16, 19, 1.8, 1.8, (nx, ny) => sh([220, 40, 60], 0.3 - nx * 0.4 - ny * 0.3));
  }
  // 深紅の旗（金の紋）
  function drawBanner(T) {
    const red = T.carpet || [150, 30, 46], G = T.accent;
    rect(10, 5, 12, 1, sh(G, -0.3));
    for (let ly = 6; ly < 26; ly++) { const cut = ly > 22 ? ly - 22 : 0; for (let lx = 11 + cut; lx < 21 - cut; lx++) put(lx, ly, sh(red, (lx < 13 ? 0.15 : lx > 18 ? -0.25 : 0))); }
    disc(16, 13, 3, 3, (nx) => sh(G, 0.15 - nx * 0.35)); rect(15, 17, 2, 4, sh(G, -0.2));
  }
  function drawMural(T, kind) {
    const fr = sh(T.accent, -0.2), bg = T.mural;
    for (let ly = 7; ly < 25; ly++) for (let lx = 4; lx < 28; lx++) {
      const edge = lx === 4 || lx === 27 || ly === 7 || ly === 24, frame = lx === 5 || lx === 26 || ly === 8 || ly === 23;
      put(lx, ly, edge ? [40, 24, 18] : frame ? fr : sh(bg, (noise(lx / 5, ly / 5, kind) - 0.5) * 0.25 - 0.05));
    }
    const ink = [92, 36, 26], hi = [240, 220, 170];
    if (kind === 0) { // 象
      disc(17, 16.5, 6.5, 3.6, () => ink); disc(10.5, 14.5, 3, 3, () => ink);
      for (let i = 0; i < 6; i++) put(8 - (i > 3 ? 1 : 0), 15 + i, ink);
      rect(12, 19, 2, 3, ink); rect(16, 19, 2, 3, ink); rect(20, 19, 2, 3, ink);
      put(10, 13, hi); rect(13, 11, 7, 2, [180, 60, 50]); put(16, 10, T.accent);
    } else if (kind === 1) { // 蓮
      disc(16, 17, 3, 5.5, (nx, ny) => sh([230, 120, 150], -ny * 0.3));
      disc(11.5, 18, 2.6, 4.2, (nx, ny) => sh([210, 100, 140], -ny * 0.3)); disc(20.5, 18, 2.6, 4.2, (nx, ny) => sh([210, 100, 140], -ny * 0.3));
      rect(9, 21, 14, 1, [60, 120, 70]); put(16, 13, hi);
    } else { // 太陽と塔
      disc(16, 13, 3.4, 3.4, () => T.accent); for (let a = 0; a < 8; a++) put(16 + Math.round(Math.cos(a * 0.785) * 5.4), 13 + Math.round(Math.sin(a * 0.785) * 5.4), T.accent);
      for (let ly = 16; ly < 23; ly++) { const w = Math.max(1, (ly - 15) * 0.9); for (let lx = Math.round(16 - w); lx <= Math.round(16 + w); lx++) put(lx, ly, ink); }
    }
  }
  function drawStatue(T, theme, broken) {
    const niche = sh(T.topC[0], -0.1), stone = theme === 'gold' || theme === 'orb' ? T.accent : [200, 186, 156];
    for (let ly = 5; ly < 31; ly++) for (let lx = 7; lx < 25; lx++) {
      const inArch = ly >= 13 ? true : Math.hypot(lx + 0.5 - 16, ly + 0.5 - 13) <= 9;
      if (!inArch) continue;
      const rim = (lx === 7 || lx === 24) || (ly < 13 && Math.hypot(lx + 0.5 - 16, ly + 0.5 - 13) > 8);
      put(lx, ly, rim ? sh(T.wall[0], 0.25) : sh(niche, -(lx - 7) / 18 * 0.4));
    }
    const S = (t) => sh(stone, t);
    rect(10, 27, 12, 3, S(-0.25)); rect(10, 27, 12, 1, S(0.15));                  // 台座
    disc(16, 25, 6.5, 2.6, (nx) => S(0.1 - nx * 0.35));                          // ひざ
    for (let ly = 17; ly < 25; ly++) { const w = 3 + (ly - 17) * 0.45; for (let lx = Math.round(16 - w); lx <= Math.round(16 + w); lx++) put(lx, ly, S(0.12 - (lx - 16 + w) / (2 * w) * 0.45)); }
    if (!broken) { disc(16, 14, 3, 3.2, (nx, ny) => S(0.2 - nx * 0.35 - ny * 0.1)); put(16, 10, S(0.25)); put(16, 9, S(0)); rect(14, 14, 1, 1, S(-0.4)); rect(17, 14, 1, 1, S(-0.4)); }
    else { rect(14, 16, 5, 1, S(-0.4)); put(13, 26, S(-0.5)); put(20, 22, S(-0.45)); put(21, 23, S(-0.45)); disc(22, 29, 1.8, 1.4, (nx) => S(0.1 - nx * 0.4)); } // 頭が落ちた像
    for (let ly = 18; ly < 26; ly++) { put(Math.round(16 - 3 - (ly - 17) * 0.45) - 1, ly, sh(niche, -0.3)); }
  }
  function drawRoots(T, h) {
    const n = 2 + h % 2;
    for (let r = 0; r < n; r++) {
      let x = 4 + ((h >>> (r * 4)) % 24), len = 14 + ((h >>> (r * 3 + 1)) % 16);
      for (let ly = 0; ly < len && ly < 32; ly++) {
        x += Math.sin((ly + r * 5) / 3.2) * 0.7;
        const xi = Math.round(x);
        put(xi, ly, sh(T.root, 0.18)); put(xi + 1, ly, T.root); put(xi + 2, ly, sh(T.root, -0.45));
        if (ly % 6 === 3 && T.leaf) { put(xi - 2, ly, T.leaf); put(xi - 1, ly - 1, sh(T.leaf, 0.25)); put(xi + 3, ly + 1, sh(T.leaf, -0.2)); }
      }
    }
  }
  function drawCrystals(T, h, base) {
    const n = 2 + h % 2;
    for (let i = 0; i < n; i++) {
      const cx = 6 + ((h >>> (i * 5)) % 20), ht = 10 + ((h >>> (i * 3 + 2)) % 10), w = 2 + ((h >>> i) % 2);
      const col = (h >>> (i + 7)) % 3 === 0 ? T.crystal2 : T.crystal;
      for (let ly = 0; ly < ht; ly++) {
        const yy = base - ly, half = ly > ht - w - 1 ? Math.max(0, ht - ly - 1) : w;
        for (let dx = -half; dx <= half; dx++) put(cx + dx, yy, dx < 0 ? sh(col, 0.45) : dx === 0 ? sh(col, 0.15) : sh(col, -0.3));
        put(cx - half - 1, yy, sh(col, -0.7)); put(cx + half + 1, yy, sh(col, -0.7));
      }
      put(cx, base - ht, [255, 255, 255]);
    }
  }
  function drawRubble(T, h) {
    const st = [180, 150, 120];
    for (let i = 0; i < 3; i++) {
      const cx = 6 + ((h >>> (i * 4)) % 20), cy = 8 + ((h >>> (i * 4 + 2)) % 16), r = 2.5 + (h >>> i) % 3;
      disc(cx, cy, r, r * 0.75, (nx, ny) => sh(st, 0.2 - (nx + ny) * 0.35));
    }
  }
  function drawFlowers(T, h) {
    for (let i = 0; i < 4; i++) {
      const cx = 4 + ((h >>> (i * 4)) % 24), cy = 4 + ((h >>> (i * 4 + 2)) % 24), col = T.flower[(h >>> i) % T.flower.length];
      put(cx, cy, col); put(cx - 1, cy, sh(col, -0.2)); put(cx + 1, cy, sh(col, -0.2)); put(cx, cy - 1, sh(col, 0.3)); put(cx, cy + 1, sh(col, -0.35)); put(cx, cy, [255, 230, 120]);
    }
  }

  TS.Tiles = TL;
})(globalThis.TS = globalThis.TS || {});
