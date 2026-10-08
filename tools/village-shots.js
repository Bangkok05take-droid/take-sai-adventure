// 村の撮影（改修前後の比較用）：node tools/village-shots.js 出力フォルダ
// 同じ村の状態・同じたけの位置・同じ画面の大きさで撮る。はじめの村（第1章・施設なし）と、発展した村（第4章・施設と飾りすべて）
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, 'tests', 'screenshots', 'village');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
}).listen(8781);
const STATES = {
  ch3: (S) => { const V = S.village; V.story.chapter = 3; V.stage = 2; },
  early: (S) => { S.village.story.chapter = 1; },
  developed: (S) => {
    const V = S.village; V.story.chapter = 4; V.stage = 3; V.funds = 9999;
    for (const f of TS.Data.FACILITIES) V.built[f.id] = true;
    TS.Game.applyFacilities(V);
  },
};
const SPOTS = [['shop', 3, 15], ['plaza', 7, 13], ['statue', 9, 14], ['smith', 3, 10], ['museum', 16, 10], ['storage', 16, 15], ['diner', 14, 21], ['harbor', 10, 21], ['harborL', 4, 21], ['temple', 9, 5], ['templeL', 4, 5], ['templeR', 15, 5], ['stairs', 10, 4], ['bridge', 3, 22], ['fountain', 10, 18], ['elephant', 6, 13], ['community', 2, 21]];
(async () => {
  const b = await chromium.launch();
  for (const [vw, vh] of [[390, 844], [360, 780], [430, 932]]) {
    const ctx = await b.newContext({ viewport: { width: vw, height: vh }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    const p = await ctx.newPage();
    await p.goto('http://localhost:8781/'); await p.waitForTimeout(400);
    for (const [name, fn] of Object.entries(STATES)) {
      await p.evaluate((src) => {
        localStorage.clear();
        const S = TS.Game.newState(); S.village.story.introDone = true; S.village.seenIntro = true;
        (new Function('S', 'TS', src))(S, TS);
        TS.Save.save(S);
      }, `(${fn.toString()})(S)`);
      await p.reload(); await p.waitForTimeout(500);
      await p.tap('#btn-continue'); await p.waitForTimeout(700);
      await p.evaluate(() => { for (const b of document.querySelectorAll('#modal-root .back')) b.remove(); TS.UI.modals.length = 0; });
      for (const [spot, x, y] of SPOTS) {
        if (vw !== 390 && !['shop', 'plaza', 'smith', 'storage', 'diner', 'harbor', 'temple', 'bridge', 'fountain', 'community'].includes(spot)) continue;
        await p.evaluate(([x, y]) => { const w = TS.UI.walker; w.x = x; w.y = y; w.dir = 'up'; w.moving = false; w.path = []; }, [x, y]);
        await p.waitForTimeout(350);
        const c = await p.evaluate(() => { const r = document.getElementById('village-canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
        await p.screenshot({ path: path.join(OUT, `${name}_${spot}_${vw}.png`), clip: c });
      }
    }
    await ctx.close();
  }
  b.close(); srv.close();
})();
