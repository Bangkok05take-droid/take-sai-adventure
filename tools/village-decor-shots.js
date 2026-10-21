// 村の飾り（灯籠の並木・蓮の庭・屋台通り）の確認の写真：node tools/village-decor-shots.js [出力フォルダ]（既定 docs/village-decor/）
// 発展した村（第4章・施設すべて）で、その飾りだけ「なし」と「あり」を、同じたけの位置・同じ画面の大きさで撮る（幅360・390・430）
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, 'docs', 'village-decor');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.jpg': 'image/jpeg' };
const srv = http.createServer((q, r) => {
  let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
}).listen(8783);
// 飾りごとの撮る場所（たけの立つマス。画面はたけが中心）
//  灯籠の並木：岸の灯り (2,21)・(6,21)・(15,21)・(18,21)（街灯 (5,16)・(14,16) は第2段階の村なら飾りが無くても立つ）
//  蓮の庭：植木鉢をやめたので今は見た目が変わらない。以前の鉢の場所 (8,12)・(11,12)・(5,19)・(14,17) のあたり
//  屋台通り：参道の両わき (7〜8,19)・(11〜12,19)
const DECOR = { lanterns: [[10, 21], [4, 20], [16, 20]], garden: [[9, 14], [9, 18]], stalls: [[10, 21]] };
(async () => {
  const b = await chromium.launch();
  for (const [vw, vh] of [[390, 844], [360, 780], [430, 932]]) {
    const ctx = await b.newContext({ viewport: { width: vw, height: vh }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://localhost:8783/'); await p.waitForTimeout(400);
    for (const [id, spots] of Object.entries(DECOR)) for (const on of [false, true]) {
      await p.evaluate(([id, on]) => {
        localStorage.clear();
        const S = TS.Game.newState(), V = S.village; V.story.introDone = true; V.seenIntro = true;
        V.story.chapter = 4; V.stage = 3; V.funds = 9999;
        for (const f of TS.Data.FACILITIES) V.built[f.id] = true;
        V.built[id] = on;
        TS.Game.applyFacilities(V);
        TS.Save.save(S);
      }, [id, on]);
      await p.reload(); await p.waitForTimeout(500);
      await p.tap('#btn-continue'); await p.waitForTimeout(700);
      await p.evaluate(() => { for (const b of document.querySelectorAll('#modal-root .back')) b.remove(); TS.UI.modals.length = 0; });
      for (const [i, [x, y]] of spots.entries()) {
        if (vw !== 390 && i > 0) continue;   // 360・430 は1か所目だけ
        await p.evaluate(([x, y]) => { const w = TS.UI.walker; w.x = x; w.y = y; w.dir = 'up'; w.moving = false; w.path = []; }, [x, y]);
        await p.waitForTimeout(400);
        const c = await p.evaluate(() => { const r = document.getElementById('village-canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
        await p.screenshot({ path: path.join(OUT, `${id}-${i + 1}_${on ? 'on' : 'off'}_${vw}.jpg`), clip: c, quality: 88 });
      }
    }
    if (errs.length) console.log('エラー', vw, errs.join(' / '));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log('done');
})();
