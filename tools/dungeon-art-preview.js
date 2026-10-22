// 通常ダンジョンの地域の背景（ZIP dungeon_7themes_art_v1）の組み込みプレビュー：node tools/dungeon-art-preview.js [地域] [出力フォルダ]
//   既定は brick（レンガの回廊、2階）。出力は docs/dungeon-art-v1/<地域>/。before＝コードの絵・after＝素材の絵に、この確認の間だけ切り替える（本番の設定 D.DUNGEON_ART はファイルのまま）
//   PCのブラウザ、幅360・390・430。同じ階・同じ場所を「今の絵」と「素材の絵」で撮る：部屋の中・細い通路・部屋の四隅・床の道具・攻撃の予告
//   階全体の絵（地形だけ）も1枚：overview_<before|after>.png
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const THEME = process.argv[2] || 'brick';
const FLOOR = { brick: 2, roots: 5, ruins: 8, ruins_deep: 12, sunken: 17, temple: 22, sealed: 27, demon: 31 }[THEME] || 2;
const ROOT = path.join(__dirname, '..'), OUT = process.argv[3] || path.join(ROOT, 'docs', 'dungeon-art-v1', THEME);
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8849;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json' };
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };

(async () => {
  const b = await chromium.launch();
  for (const [W, H] of [[390, 844], [360, 780], [430, 932]]) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(400);
    await p.evaluate((F) => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village; V.story.introDone = true; V.seenIntro = true;
      G.depart(S, 2024); const r = S.run;
      while (r.floor < F) { r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      r.player.hp = r.player.maxhp = 999; r.explored.fill(1); TS.Save.save(S); }, FLOOR);
    await p.reload(); await p.waitForTimeout(700); await p.tap('#btn-continue'); await p.waitForTimeout(900);
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; });
    const info = await p.evaluate((TH) => { const r = TS.UI.S.run, m = r.map; return { theme: TS.Game.themeOf(r), art: !!(TS.Sprites.art.dungeon[TH] && TS.Sprites.art.dungeon[TH].floor.every(Boolean)), rooms: m.rooms.length }; }, THEME);
    chk(info.art, `${W} 素材の絵を読み込んだ（${THEME}・地域 ${info.theme}）`);
    // 撮る場所：いちばん大きい部屋の中央・左上の角・右下の角、細い通路のマス、床の道具の隣
    const spots = await p.evaluate(() => { const r = TS.UI.S.run, m = r.map, DG = TS.Dungeon;
      const big = m.rooms.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];
      let corr = null; for (let i = 0; i < m.tiles.length && !corr; i++) if (m.tiles[i] === 2) { const x = i % m.w, y = Math.floor(i / m.w); if (!DG.roomAt(m, x, y)) corr = { x, y }; }
      const it = r.floorItems.find((f) => f.item) || r.floorItems[0];
      return { center: { x: big.x + (big.w >> 1), y: big.y + (big.h >> 1) }, cornerTL: { x: big.x, y: big.y }, cornerBR: { x: big.x + big.w - 1, y: big.y + big.h - 1 }, corridor: corr, item: it ? { x: it.x, y: it.y } : null }; });
    for (const ver of ['before', 'after']) {
      await p.evaluate(([on, TH]) => { TS.Data.DUNGEON_ART = on ? { [TH]: true } : {}; TS.Render.resetLayer(); }, [ver === 'after', THEME]);
      for (const [name, s] of Object.entries(spots)) {
        if (!s) continue;
        await p.evaluate(([s, name]) => { const r = TS.UI.S.run; r.player.x = s.x; r.player.y = s.y; r.enemies = r.enemies.filter((e) => e.boss);
          // 部屋の中央：となりに攻撃の予告（3×3）を出す敵を置いて、予告と敵の見え方を確かめる
          if (name === 'center') { const e = TS.Game.makeEnemy(r, 'statue', s.x + 2, s.y); e.charge = { tiles: [], mult: 1 }; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) e.charge.tiles.push({ x: s.x + 1 + dx, y: s.y + dy }); r.enemies.push(e); }
          TS.Game.updateVision(r); }, [s, name]);
        // 地形は1フレームの時間で少しずつ描くので、何フレームか待つ
        await p.waitForTimeout(900);
        const c = await p.evaluate(() => { const e = document.getElementById('dungeon-canvas').getBoundingClientRect(); return { x: e.x, y: e.y, width: e.width, height: e.height }; });
        await p.screenshot({ path: path.join(OUT, `${name}_${ver}_${W}.jpg`), clip: c, quality: 88 });
      }
      // 階全体の地形（幅390のときだけ）：今の描き方で全マスを描いた地形の絵
      if (W === 390) {
        const url = await p.evaluate(() => { const r = TS.UI.S.run, m = r.map, DG = TS.Dungeon, c = document.createElement('canvas'); c.width = m.w * 32; c.height = m.h * 32;
          const roomGrid = new Int16Array(m.w * m.h).fill(-1), ring = new Uint8Array(m.w * m.h);
          (m.rooms || []).forEach((rm, i) => { for (let y = rm.y; y < rm.y + rm.h; y++) for (let x = rm.x; x < rm.x + rm.w; x++) roomGrid[y * m.w + x] = i; });
          const L = { map: m, canvas: c, g: c.getContext('2d'), drawn: new Uint8Array(m.w * m.h), torches: [], water: [], glows: [], roomGrid, ring };
          const th = TS.Game.themeOf(r);
          for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) TS.Tiles.paint(r, L, x, y, th);
          return c.toDataURL('image/png'); });
        fs.writeFileSync(path.join(OUT, `overview_${ver}.png`), Buffer.from(url.split(',')[1], 'base64'));
        if (ver === 'after') fs.writeFileSync(path.join(OUT, 'map.json'), JSON.stringify(await p.evaluate(() => { const m = TS.UI.S.run.map; return { w: m.w, h: m.h, tiles: Array.from(m.tiles) }; })));
      }
    }
    // 当たり判定・通れる所は変わらない（描き方だけ）
    const same = await p.evaluate(() => { const r = TS.UI.S.run; return TS.Dungeon.passable(r.map, r.player.x, r.player.y); });
    chk(same, `${W} 通れる所は今までどおり`);
    chk(!errs.length, `${W} エラーなし ${errs.join(' / ')}`);
    await ctx.close();
  }
  console.log(`\n${ok} OK / ${ng} NG`);
  await b.close(); srv.close();
  process.exit(ng ? 1 : 0);
})();
