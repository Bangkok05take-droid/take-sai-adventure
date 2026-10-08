// 噴水の動きの録画と、マスターヤナイの像の建設前後：node tools/fountain-statue-shots.js [リポジトリ] [出力フォルダ]（幅390・360・430）
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..'), OUT = process.argv[3] || path.join(ROOT, 'tests', 'screenshots', 'fountain-statue'), PORT = +(process.argv[4] || 8801); fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type': {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'}[path.extname(f)]||'application/octet-stream'}); r.end(d); }); }).listen(PORT);
(async () => {
  const b = await chromium.launch();
  const setup = async (w, h, built, video) => {
    const ctx = await b.newContext(Object.assign({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }, video ? { recordVideo: { dir: OUT, size: { width: w, height: h } } } : {}));
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
    await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(400);
    await p.evaluate((built) => { localStorage.clear(); const G = TS.Game, S = G.newState(); const V = S.village; V.story.introDone = true; V.seenIntro = true; V.story.chapter = 4; V.stage = 3;
      for (const f of TS.Data.FACILITIES) V.built[f.id] = f.id === 'yanai_statue' ? built : true; G.applyFacilities(V); TS.Save.save(S); }, built);
    await p.reload(); await p.waitForTimeout(500); await p.tap('#btn-continue'); await p.waitForTimeout(900);
    await p.evaluate(() => { for (const b of document.querySelectorAll('#modal-root .back')) b.remove(); TS.UI.modals.length = 0; });
    return { ctx, p };
  };
  const clip = (p) => p.evaluate(() => { const r = document.getElementById('village-canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  const at = (p, x, y) => p.evaluate(([x, y]) => { const w = TS.UI.walker; w.x = x; w.y = y; w.dir = 'up'; w.moving = false; w.path = []; }, [x, y]);
  // 1. 噴水の録画（約6秒）
  { const { ctx, p } = await setup(390, 844, true, true); await at(p, 10, 19); await p.waitForTimeout(6500);
    for (let i = 0; i < 4; i++) { await p.screenshot({ path: path.join(OUT, `fountain_frame${i}.png`), clip: await clip(p) }); await p.waitForTimeout(170); }
    const v = p.video(); await ctx.close(); fs.renameSync(await v.path(), path.join(OUT, 'fountain_raw.webm')); console.log('errors', p.errs); }
  // 2. 像：建設前・後（同じ位置）、3つの幅
  for (const [w, h] of [[390, 844], [360, 780], [430, 932]]) for (const built of [false, true]) {
    const { ctx, p } = await setup(w, h, built, false); await at(p, 10, 15); await p.waitForTimeout(500);
    const info = await p.evaluate(() => ({ hit: TS.UI.vview.hits.some((x) => x.kind === 'statue'), solid: [9, 10].map((x) => TS.UI.vview.solid[11 * TS.Village.MW + x]) }));
    console.log(w, built ? 'built' : 'before', JSON.stringify(info));
    await p.screenshot({ path: path.join(OUT, `statue_${built ? 'after' : 'before'}_${w}.png`), clip: await clip(p) });
    if (p.errs.length) console.log('errors', p.errs); await ctx.close(); }
  await b.close(); srv.close();
})();
