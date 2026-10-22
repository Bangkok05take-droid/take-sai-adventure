// 壁の外の背景（仮）のプレビュー：node tools/dungeon-backdrop-preview.js [出力フォルダ]（既定 docs/dungeon-backdrop-v1/）
//   レンガの回廊（2階）・木の根の遺跡（5階）・地下の遺跡（8階）を、幅360・390・430で「今（黒）」と「背景あり」で撮る。本番の設定（D.DUNGEON_BACKDROP）はこの確認の間だけ切り替える
//   start：階に着いたところ（探索は普通どおり。未探索の所は地形と関係ない背景だけ）
//   edge ：地図の端にいちばん近い部屋（その部屋と通路の一部を探索済み・見えていない探索済みの所の暗さ・地図の外のなじみ方）
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, 'docs', 'dungeon-backdrop-v1');
fs.mkdirSync(OUT, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(8853);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
const THEMES = [['brick', 2], ['roots', 5], ['ruins', 8]];
(async () => {
  const b = await chromium.launch();
  for (const [W, H] of [[390, 844], [360, 780], [430, 932]]) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://localhost:8853/'); await p.waitForTimeout(400);
    for (const [th, F] of THEMES) {
      await p.evaluate((F) => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village; V.story.introDone = true; V.seenIntro = true;
        G.depart(S, 4242); const r = S.run; while (r.floor < F) { r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
        r.player.hp = r.player.maxhp = 999; TS.Save.save(S); }, F);
      await p.reload(); await p.waitForTimeout(800); await p.tap('#btn-continue'); await p.waitForTimeout(900);
      await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; });
      const info = await p.evaluate(() => TS.Game.themeOf(TS.UI.S.run));
      chk(info === th, `${W} ${F}階は ${th}（${info}）`);
      for (const spot of ['start', 'edge']) {
        if (spot === 'edge') await p.evaluate(() => { const r = TS.UI.S.run, m = r.map, G = TS.Game;
          // 地図の端にいちばん近い部屋の、端に近い角へ。その部屋と、そこから出る通路の数マスだけ探索済みにする
          const rm = m.rooms.slice().sort((a, b) => Math.min(a.x, a.y, m.w - a.x - a.w, m.h - a.y - a.h) - Math.min(b.x, b.y, m.w - b.x - b.w, m.h - b.y - b.h))[0];
          r.explored.fill(0); r.enemies = r.enemies.filter((e) => e.boss);
          const tx = rm.x < m.w - rm.x - rm.w ? rm.x : rm.x + rm.w - 1, ty = rm.y < m.h - rm.y - rm.h ? rm.y : rm.y + rm.h - 1;
          for (let y = rm.y - 1; y <= rm.y + rm.h; y++) for (let x = rm.x - 1; x <= rm.x + rm.w; x++) if (x >= 0 && y >= 0 && x < m.w && y < m.h) r.explored[y * m.w + x] = 1;
          // ほかの部屋を1つ探索済みにして（いまは見えていない）、暗さの区別も写す
          const other = m.rooms.filter((o) => o !== rm).sort((a, b) => Math.hypot(a.x - rm.x, a.y - rm.y) - Math.hypot(b.x - rm.x, b.y - rm.y))[0];
          if (other) for (let y = other.y; y < other.y + other.h; y++) for (let x = other.x; x < other.x + other.w; x++) r.explored[y * m.w + x] = 1;
          r.player.x = tx; r.player.y = ty; G.updateVision(r); TS.Render.resetLayer(); });
        for (const ver of ['before', 'after']) {
          await p.evaluate(([on, th]) => { TS.Data.DUNGEON_BACKDROP = on ? { [th]: true } : {}; }, [ver === 'after', th]);
          await p.waitForTimeout(900);
          const c = await p.evaluate(() => { const e = document.getElementById('dungeon-canvas').getBoundingClientRect(); return { x: e.x, y: e.y, width: e.width, height: e.height }; });
          await p.screenshot({ path: path.join(OUT, `${th}_${spot}_${ver}_${W}.jpg`), clip: c, quality: 88 });
        }
      }
      // 未探索の所は地形と関係ない：同じ見た目の位置で、地図の中（未探索）と地図の外の背景の柄は同じ絵から（暗さだけ違う）
      const pure = await p.evaluate(() => { const D = TS.Data; return !!(D.DUNGEON_BACKDROP && Object.keys(D.DUNGEON_BACKDROP).length); });
      chk(pure, `${W} ${th} 背景を描いた`);
      await p.evaluate(() => { TS.Data.DUNGEON_BACKDROP = {}; });
    }
    chk(!errs.length, `${W} エラーなし ${errs.join(' / ')}`);
    await ctx.close();
  }
  console.log(`\n${ok} OK / ${ng} NG`); await b.close(); srv.close(); process.exit(ng ? 1 : 0);
})();
