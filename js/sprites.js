/* オリジナルのドット絵（16x16）。左右対称のものは左半分だけ書いて反転する。 */
(function (TS) {
  'use strict';
  const SP = {};
  const half = (rows) => rows.map((r) => r + r.split('').reverse().join(''));

  const PAL_TAKE = { o: '#3b2414', s: '#f6c79a', h: '#fff1dc', e: '#2b1a10', r: '#f39a8b', m: '#a2452f',
    y: '#f4c430', b: '#2e8b88', l: '#7a4a24', p: '#5b4636', k: '#3a2a20', g: '#6b8e3a', S: '#e0a878' };

  const TAKE_FRONT = half([
    '........',
    '.....ooo',
    '...oohss',
    '..ohssss',
    '..osssss',
    '.ossssss',
    '.ossesss',
    '.ossesss',
    '.osrrssm',
    '..osssss',
    '...oyyyy',
    '..obbbby',
    '.osbbbbb',
    '..obbbll',
    '...oppo.',
    '...okko.',
  ]);
  const TAKE_BACK = half([
    '........',
    '.....ooo',
    '...oohss',
    '..ohssss',
    '..osssss',
    '.ossssss',
    '.ossssss',
    '.ossssss',
    '.oSsssss',
    '..oSssss',
    '...oyyyy',
    '..obgggg',
    '.osbgggg',
    '..obgggl',
    '...oppo.',
    '...okko.',
  ]);
  const TAKE_SIDE = TAKE_FRONT.slice();
  TAKE_SIDE[6] = '.osssssssssesso.';
  TAKE_SIDE[7] = '.osssssssssesso.';
  TAKE_SIDE[8] = '.ossssssssrsmso.';
  TAKE_SIDE[11] = '..obbbbbyybbo...';
  TAKE_SIDE[12] = '..obbbbbbbbbso..';
  TAKE_SIDE[14] = '...oppo.oppo....';
  TAKE_SIDE[15] = '...okko.okko....';
  const TAKE_WALK = TAKE_FRONT.slice();
  TAKE_WALK[14] = '...oppo..oppo...';
  TAKE_WALK[15] = '....okko.okko...';

  const PAL_SAI = { k: '#1d1a24', s: '#e9b48a', e: '#1d1a24', r: '#ef8f86', m: '#b04a3c', c: '#f2a65a',
    n: '#3d6fa8', o: '#3b2414', w: '#ffffff', f: '#ff6f91' };
  const SAI = half([
    '........',
    '.....kkk',
    '...kkkkk',
    '..kkkkkk',
    '..kkkkks',
    '..kkssss',
    '..kksess',
    '..kksess',
    '..kksrsm',
    '.kkkksss',
    '.kkkcccc',
    '.kkkcccw',
    '..kscccc',
    '...onnnn',
    '...onnnn',
    '....oss.',
  ]);
  SAI[3] = '..kkkkkkkkkkkfk.'; // 髪かざり（プルメリア）

  // ---- 敵 ----
  const ENEMIES = {
    frog: { pal: { o: '#1f3b1a', w: '#ffffff', k: '#111111', g: '#6cc04a', r: '#ff9fb0', m: '#2c5a22', y: '#f2e6a0' }, rows: half([
      '........', '........', '...ooo..', '..owwko.', '..owkko.', '.ogggggg', 'oggggggg', 'ogrrgggg',
      'oggmmmmm', 'oggggggg', '.oyyyyyy', '.ogyyyyy', '..oggyyy', '.ogggooo', '.oooo...', '........']) },
    turtle: { pal: { o: '#2a2a2a', H: '#8fae7a', e: '#111111', t: '#9b958a', T: '#6f685d' }, rows: half([
      '........', '........', '.....ooo', '....oHHH', '....oHeH', '...ooHHH', '..oottTT', '.otTTttt',
      'otTttTTt', 'otttTTtt', 'oTTttttT', 'otttTTtt', '.ooooooo', '.oHHo...', '.ooo....', '........']) },
    monkey: { pal: { o: '#2e1a0e', b: '#9a5b2e', f: '#f0c49a', e: '#111111', m: '#a33', p: '#c8a040' }, rows: half([
      '........', '....oooo', '...obbbb', '.oobbbbb', 'offobfff', 'offobfef', '.oobffff', '...offfm',
      '....offf', '...obbbb', '..obbbbb', '.obfbbbb', '.ooobbbb', '...obbbo', '...oooo.', '........']) },
    root: { pal: { o: '#24170c', w: '#7b5233', d: '#3b2716', y: '#c8ff6a', l: '#5aa040' }, rows: half([
      '........', '..l.....', '..olo..o', '...owoow', '...owwww', '..owwwww', '.owwdwww', '.owyydww',
      '.owddwww', '.owwwwdd', '.owwwwww', '..owwwww', '.owowwww', 'ow.owoww', 'o..ow.ow', '....o..o']) },
    jelly: { pal: { o: '#1b3f6b', J: '#c9f1ff', j: '#6cc8f0', k: '#14304f', p: '#ff9ad5' }, rows: half([
      '........', '........', '.....ooo', '...ooJJJ', '..oJJjjj', '.oJjjjjj', '.ojjjjjj', '.ojjkjjj',
      '.ojjjjpj', '.oojjjjj', '..oooooo', '..j.j..j', '..j..j.j', '.j..j..j', '.j...j..', '........']) },
    lion: { pal: { m: '#d0602a', G: '#f2c84b', g: '#a77b1c', k: '#2b1a10', r: '#b33a2a', o: '#5a3b10', w: '#fff' }, rows: half([
      '...mm...', '..mmmmmm', '.mmmmmmm', 'mmmGGGGG', 'mmGGGGGG', 'mmGGkGGG', 'mmGGkGGG', 'mmGGGGgg',
      'mmGGGrrw', '.mmGGGGG', '..mmmmmm', '..oGGGGG', '.oGGgGGG', '.oGGgGGG', '.oGGoGGo', '.ooo.ooo']) },
  };

  // ---- 道具アイコン ----
  const SWORD = [
    '................', '............ooo.', '...........owwo.', '..........owwo..', '.........owwo...', '........owwo....',
    '.......owwo.....', '..o...owwo......', '..oo.owwo.......', '...oowwo........', '...ohho.........', '..ohhooo........',
    '.ohho...........', '.oo.............', '................', '................'];
  const SWORD_TINT = { wood: '#b07a45', bronze: '#d79a4a', iron: '#cfd8e0', ivory: '#fff6dc' };
  const SHIELD = half([
    '........', '..oooooo', '.oaaaaaa', '.oabbbbb', '.oabbbbb', '.oabbbbc', '.oabbbcc', '.oabbbbc',
    '.oabbbbb', '..oabbbb', '..oabbbb', '...oabbb', '....oabb', '.....oaa', '......oo', '........']);
  const SHIELD_TINT = { bamboo: ['#d8c27a', '#a8904a'], bronze: ['#e0a050', '#b8742a'], turtle: ['#9bb08a', '#5f7550'] };
  const ICONS = {
    herb: { pal: { o: '#1f4a1a', g: '#4caf50', G: '#9be36a', s: '#6b4a2a' }, rows: half([
      '........', '........', '.....oo.', '....ogGo', '...ogGGo', '..ogGGgo', '..ogGgo.', '...ogo.o',
      '....oo.o', '......os', '......os', '.....oso', '......os', '......oo', '........', '........']) },
    potion: { pal: { o: '#30204a', w: '#e8e0ff', p: '#c24bd8', P: '#f0a0ff', c: '#9b6b3a' }, rows: half([
      '........', '......cc', '......cc', '.....oww', '.....oww', '....owww', '...oPppp', '..oPpppp',
      '..oPpppp', '..oppppp', '..oppppp', '...ooppp', '.....ooo', '........', '........', '........']) },
    banana: { pal: { o: '#5a4010', y: '#ffe04a', Y: '#e8b820', b: '#4a3010' }, rows: [
      '................', '..........bb....', '..........oyo...', '..........oyyo..', '..........oyyo..', '.........oyyYo..',
      '........oyyYo...', '......ooyyYo....', '...oooyyyYo.....', '..oyyyyYYo......', '..oYYYYoo.......', '...oooo.........',
      '................', '................', '................', '................'] },
    rice: { pal: { o: '#4a2e14', b: '#c8943c', B: '#a0702a', w: '#ffffff', W: '#e8e8e0' }, rows: half([
      '........', '........', '....oooo', '...owwww', '..owwWww', '..oooooo', '..obBbBb', '..oBbBbB',
      '..obBbBb', '..oBbBbB', '...obBbB', '...ooooo', '....o...', '........', '........', '........']) },
    onigiri: { pal: { o: '#333333', w: '#ffffff', n: '#1f3a2a' }, rows: half([
      '........', '........', '.......o', '......ow', '.....oww', '....owww', '...owwww', '...owwww',
      '..owwwww', '..owwwnn', '.owwwwnn', '.owwwwnn', '..oooooo', '........', '........', '........']) },
    incense: { pal: { o: '#3a2a1a', s: '#d8d8f0', r: '#c0392b', g: '#d4a017', G: '#8a6a10' }, rows: half([
      '......s.', '.......s', '......s.', '.......s', '......s.', '.......r', '.......r', '.......r',
      '.......r', '....oooo', '...ogggg', '...oGgGg', '...ogggg', '....oooo', '........', '........']) },
    staff: { pal: { o: '#2a1a0a', w: '#8a5a2a', y: '#fff36a', Y: '#ffb000' }, rows: half([
      '........', '......oo', '.....oyY', '.....oYy', '......oo', '.......w', '.......w', '.......w',
      '.......w', '.......w', '.......w', '.......w', '.......w', '.......w', '.......o', '........']) },
    scroll: { pal: { o: '#4a3020', p: '#f5e6c0', P: '#d8c090', r: '#c0392b' }, rows: half([
      '........', '........', '........', '..oooooo', '.oPppppp', '.oPppppp', '..oppppp', '..oppppp',
      '..oprrrr', '..oppppp', '..oppppp', '.oPppppp', '.oPppppp', '..oooooo', '........', '........']) },
    coin: { pal: { o: '#7a5a10', y: '#ffd84a', Y: '#e0a820', w: '#fff6b0' }, rows: half([
      '........', '........', '........', '.....ooo', '....oyyy', '...oywyy', '...oyyYY', '...oyyYy',
      '...oyyYY', '...oyyyy', '....oyyy', '.....ooo', '........', '........', '........', '........']) },
    elephant: { pal: { o: '#1a4a30', j: '#4fc08a', J: '#9ef0c0', k: '#0a2a18' }, rows: half([
      '........', '........', '........', '..ooo.oo', '.ojjjojj', '.oJjjojj', '.ojjjjkj', '.ojjjjjj',
      '..ojjjjj', '...oojjj', '.....ojj', '.....ojj', '.....oj.', '.....oo.', '........', '........']) },
    lotus: { pal: { o: '#7a5010', y: '#ffd84a', Y: '#f0a820', w: '#fff6b0', g: '#3a8a40' }, rows: half([
      '........', '........', '.......o', '......oy', '..o..oyw', '.oyo.oyw', '.oywooyy', '..oywoyy',
      '..oyyoyy', '...oyyYY', '....oYYY', '.....ooo', '...ggggg', '....gggg', '........', '........']) },
    gem: { pal: { o: '#203060', c: '#7ad7ff', C: '#d8f6ff', b: '#3a8ad0' }, rows: half([
      '........', '........', '........', '.....ooo', '....oCcc', '...oCccc', '..obbbbb', '...obccc',
      '....obcc', '.....obc', '......ob', '.......o', '........', '........', '........', '........']) },
    orb: { pal: { o: '#4a2a6a', p: '#b06ae0', P: '#e8c8ff', w: '#ffffff', y: '#ffd84a' }, rows: half([
      '........', '........', '.....ooo', '....oPPp', '...oPwPp', '...oPPpp', '..oPpppp', '..oppppp',
      '..oppppp', '...opppp', '...ooppp', '....oooo', '...oyyyy', '..oyyyyy', '..oooooo', '........']) },
    gold: { pal: { o: '#7a5a10', y: '#ffd84a', Y: '#e0a820', w: '#fff6b0' }, rows: half([
      '........', '........', '........', '........', '........', '........', '.....ooo', '....oywy',
      '...ooyyy', '..oywooo', '..oyyyyy', '.ooyyooo', 'oywyyywy', 'oyyyyyyy', '.ooooooo', '........']) },
  };

  function toCanvas(rows, pal) {
    const c = document.createElement('canvas');
    c.width = 16; c.height = rows.length;
    const g = c.getContext('2d');
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < 16; x++) {
        const ch = rows[y][x];
        if (!ch || ch === '.' || !pal[ch]) continue;
        g.fillStyle = pal[ch];
        g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }
  function flip(src) {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0);
    return c;
  }

  SP.build = function () {
    const s = {};
    s.take = {
      down: [toCanvas(TAKE_FRONT, PAL_TAKE), toCanvas(TAKE_WALK, PAL_TAKE)],
      up: [toCanvas(TAKE_BACK, PAL_TAKE)],
      right: [toCanvas(TAKE_SIDE, PAL_TAKE)],
    };
    s.take.left = [flip(s.take.right[0])];
    s.sai = toCanvas(SAI, PAL_SAI);
    s.enemy = {};
    for (const [k, v] of Object.entries(ENEMIES)) s.enemy[k] = toCanvas(v.rows, v.pal);
    s.icon = {};
    for (const [k, v] of Object.entries(ICONS)) s.icon[k] = toCanvas(v.rows, v.pal);
    for (const [t, col] of Object.entries(SWORD_TINT)) s.icon['sword_' + t] = toCanvas(SWORD, { o: '#2a2a2a', w: col, h: '#7a4a24' });
    for (const [t, col] of Object.entries(SHIELD_TINT)) s.icon['shield_' + t] = toCanvas(SHIELD, { o: '#2a2a2a', a: col[1], b: col[0], c: '#ffffff' });
    s.icon.scroll_red = s.icon.scroll;
    s.icon.scroll_blue = toCanvas(ICONS.scroll.rows, Object.assign({}, ICONS.scroll.pal, { r: '#2f6fd0' }));
    SP.s = s;
    return s;
  };
  SP.iconFor = function (def) {
    const key = def.tint ? def.icon + '_' + def.tint : def.icon;
    return SP.s.icon[key] || SP.s.icon[def.icon];
  };
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
  SP.portraitURL = function (who, size) {
    const src = who === 'sai' ? SP.s.sai : SP.s.take.down[0];
    const c = document.createElement('canvas');
    c.width = c.height = size || 64;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL();
  };

  /* ---- 地形タイル（テーマごとに描画して用意） ---- */
  const THEME_COL = {
    brick: { floor: '#c98b5a', floor2: '#b57848', line: '#8f5a34', wallTop: '#5a2e1c', wall: '#a8502e', wall2: '#8a3e22', mortar: '#e6b98a', deco: '#6a9a3a', bg: '#1a0f0a' },
    roots: { floor: '#8f8a5a', floor2: '#7d784c', line: '#5f5a38', wallTop: '#3a2a18', wall: '#8a5a3a', wall2: '#6a4228', mortar: '#b89a6a', deco: '#4a8a2a', root: '#5a3a1e', bg: '#0f0c06' },
    water: { floor: '#7fa6b0', floor2: '#6a929c', line: '#4f7680', wallTop: '#1e3a4a', wall: '#3f7f96', wall2: '#2f6378', mortar: '#a8d0d8', deco: '#ff8fb8', water: '#3a8fc0', bg: '#06121a' },
    orb: { floor: '#b8a0d0', floor2: '#a088bc', line: '#7a6098', wallTop: '#2a1a3a', wall: '#7a5aa0', wall2: '#5a3e80', mortar: '#e0c8f0', deco: '#ffd84a', bg: '#0c0614' },
  };
  SP.themeColors = THEME_COL;

  function hash(x, y) { let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; }

  // 床タイル（variant 0..3）
  function drawFloor(g, C, v, theme) {
    g.fillStyle = C.floor; g.fillRect(0, 0, 16, 16);
    g.fillStyle = C.floor2;
    if (v % 2) { g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8); } else { g.fillRect(8, 0, 8, 8); g.fillRect(0, 8, 8, 8); }
    g.fillStyle = C.line;
    g.fillRect(0, 0, 16, 1); g.fillRect(0, 8, 16, 1); g.fillRect(0, 0, 1, 16); g.fillRect(8, 0, 1, 16);
    if (theme === 'roots' && v === 3) { g.fillStyle = C.deco; g.fillRect(3, 11, 2, 1); g.fillRect(4, 10, 1, 1); g.fillRect(11, 4, 2, 1); }
    if (theme === 'water' && v === 2) { g.fillStyle = C.water; g.fillRect(2, 3, 12, 10); g.fillStyle = '#7ac8e8'; g.fillRect(4, 6, 3, 1); g.fillRect(9, 9, 3, 1);
      g.fillStyle = '#3a8a40'; g.fillRect(9, 4, 4, 3); g.fillStyle = C.deco; g.fillRect(10, 3, 2, 2); }
    if (theme === 'brick' && v === 3) { g.fillStyle = C.deco; g.fillRect(12, 13, 1, 2); g.fillRect(13, 12, 1, 2); }
    if (theme === 'orb' && v === 1) { g.fillStyle = C.deco; g.fillRect(7, 7, 2, 2); }
  }
  // 壁の正面（下が床のとき）
  function drawWallFace(g, C, v, theme) {
    g.fillStyle = C.mortar; g.fillRect(0, 0, 16, 16);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 4 : 0;
      for (let bx = -8; bx < 16; bx += 8) {
        g.fillStyle = ((row + bx / 8 + v) % 3 === 0) ? C.wall2 : C.wall;
        g.fillRect(bx + off + 1, row * 4 + 1, 7, 3);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 14, 16, 2);
    if (theme === 'roots' && v % 2 === 0) {
      g.fillStyle = C.root;
      g.fillRect(5, 0, 2, 9); g.fillRect(7, 8, 2, 6); g.fillRect(3, 6, 2, 2); g.fillRect(9, 13, 3, 2);
      g.fillStyle = C.deco; g.fillRect(4, 4, 2, 2); g.fillRect(10, 2, 2, 2);
    }
    if (theme === 'water' && v === 1) { g.fillStyle = 'rgba(120,220,255,0.5)'; g.fillRect(7, 0, 2, 16); }
    if (theme === 'orb' && v === 2) { g.fillStyle = C.deco; g.fillRect(6, 5, 4, 4); g.fillStyle = '#fff'; g.fillRect(7, 6, 1, 1); }
  }
  function drawWallTop(g, C, v, theme) {
    g.fillStyle = C.wallTop; g.fillRect(0, 0, 16, 16);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    if (v % 2) g.fillRect(2, 3, 5, 2); else g.fillRect(9, 10, 5, 2);
    if (theme === 'roots' && v === 2) { g.fillStyle = C.root; g.fillRect(0, 7, 16, 2); g.fillRect(7, 0, 2, 7); }
    if (theme === 'roots' && v === 3) { g.fillStyle = C.deco; g.fillRect(5, 5, 3, 3); g.fillRect(9, 9, 2, 2); }
  }

  SP.buildTiles = function () {
    const out = {};
    for (const [theme, C] of Object.entries(THEME_COL)) {
      const mk = (fn, v) => { const c = document.createElement('canvas'); c.width = c.height = 16; fn(c.getContext('2d'), C, v, theme); return c; };
      out[theme] = {
        floor: [0, 1, 2, 3].map((v) => mk(drawFloor, v)),
        face: [0, 1, 2].map((v) => mk(drawWallFace, v)),
        top: [0, 1, 2, 3].map((v) => mk(drawWallTop, v)),
      };
    }
    // 階段・帰還の碑・帰還口
    const mk = (fn) => { const c = document.createElement('canvas'); c.width = c.height = 16; fn(c.getContext('2d')); return c; };
    out.stairs = mk((g) => {
      g.fillStyle = '#2a1a10'; g.fillRect(1, 1, 14, 14);
      const cols = ['#e8d0a0', '#c8a878', '#a88858', '#886838', '#584020'];
      for (let i = 0; i < 5; i++) { g.fillStyle = cols[i]; g.fillRect(2 + i, 2 + i * 2.6, 12 - i * 2, 2.4); }
    });
    out.returnPoint = mk((g) => {
      g.fillStyle = 'rgba(120,220,255,0.35)'; g.fillRect(1, 12, 14, 3);
      g.fillStyle = '#556070'; g.fillRect(4, 2, 8, 12);
      g.fillStyle = '#7a8898'; g.fillRect(5, 3, 6, 10); g.fillRect(4, 1, 8, 2);
      g.fillStyle = '#6ae0ff'; g.fillRect(7, 5, 2, 5); g.fillRect(6, 6, 4, 1);
    });
    out.portal = mk((g) => {
      g.fillStyle = '#ffd84a'; g.fillRect(3, 1, 10, 14); g.fillRect(1, 3, 14, 10);
      g.fillStyle = '#fff6b0'; g.fillRect(4, 3, 8, 10); g.fillRect(3, 4, 10, 8);
      g.fillStyle = '#ffffff'; g.fillRect(6, 5, 4, 6);
    });
    out.hash = hash;
    SP.tiles = out;
    return out;
  };

  TS.Sprites = SP;
})(globalThis.TS = globalThis.TS || {});
