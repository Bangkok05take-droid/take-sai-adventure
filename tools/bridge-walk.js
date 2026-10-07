// 赤い橋の往復の確認：node tools/bridge-walk.js [リポジトリ] [出力フォルダ]。(3,21)→(3,25)→(3,21) をタップ移動で、幅360・390・430で確認。
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..'), OUT = process.argv[3] || path.join(ROOT, 'tests', 'screenshots', 'bridge'); fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type': {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp'}[path.extname(f)]||'application/octet-stream'}); r.end(d); }); }).listen(8792);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://localhost:8792/'); await p.waitForTimeout(500);
    await p.evaluate(() => { localStorage.clear(); const S = TS.Game.newState(); S.village.story.introDone = true; S.village.seenIntro = true;
      const V = S.village; V.story.chapter = 4; V.stage = 3; V.funds = 9999; for (const f of TS.Data.FACILITIES) V.built[f.id] = true; TS.Game.applyFacilities(V); TS.Save.save(S); });
    await p.reload(); await p.waitForTimeout(500); await p.tap('#btn-continue'); await p.waitForTimeout(900);
    const clear = () => p.evaluate(() => { for (const b of document.querySelectorAll('#modal-root .back')) b.remove(); TS.UI.modals.length = 0; });
    await clear();
    await p.evaluate(() => { const W = TS.UI.walker; W.x = 3; W.y = 21; W.path = []; W.moving = false; });
    await p.waitForTimeout(300);
    const clip = async () => p.evaluate(() => { const r = document.getElementById('village-canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    const go = async (tx, ty, shots) => {
      const pt = await p.evaluate(([tx, ty]) => { const v = TS.UI.vview, r = document.getElementById('village-canvas').getBoundingClientRect();
        let sx = 0, sy = 0, n = 0; for (let y = 0; y < r.height; y += 3) for (let x = 0; x < r.width; x += 3) { const t = v.tile(x, y); if (t.x === tx && t.y === ty) { sx += x; sy += y; n++; } }
        return n ? { x: r.left + sx / n, y: r.top + sy / n } : null; }, [tx, ty]);
      if (!pt) return 'offscreen';
      await p.touchscreen.tap(pt.x, pt.y);
      const seen = new Set();
      for (let i = 0; i < 60 && await p.evaluate(() => TS.UI.walker.moving || TS.UI.walker.path.length); i++) {
        const pos = await p.evaluate(() => [TS.UI.walker.x, TS.UI.walker.y]); seen.add(pos.join(','));
        if (shots && i % 4 === 2) await p.screenshot({ path: path.join(OUT, `${shots}_${w}_${i}.png`), clip: await clip() });
        await p.waitForTimeout(60);
      }
      await p.waitForTimeout(200); await clear();
      const a = await p.evaluate(() => [TS.UI.walker.x, TS.UI.walker.y]); seen.add(a.join(','));
      return { at: a.join(','), seen: [...seen] };
    };
    let r = await go(3, 25, 'down'); chk(r.at === '3,25', `${w} 対岸へ ${r.at}`); chk(r.seen.every((s) => !/^[24],2[234]$/.test(s)), `${w} 往路は橋の中央 ${r.seen.join(' ')}`);
    r = await go(3, 21, 'up'); chk(r.at === '3,21', `${w} 帰り ${r.at}`); chk(r.seen.every((s) => !/^[24],2[234]$/.test(s)), `${w} 復路は橋の中央 ${r.seen.join(' ')}`);
    for (const [tx, ty] of [[2, 23], [4, 23], [2, 22], [4, 24]]) {
      await p.evaluate(() => { const W = TS.UI.walker; W.x = 3; W.y = 21; W.path = []; W.moving = false; }); await p.waitForTimeout(150);
      r = await go(tx, ty); chk(r.at !== `${tx},${ty}`, `${w} 欄干の外 ${tx},${ty} は通れない (${r.at})`);
    }
    chk(!errs.length, `${w} エラーなし ${errs.join('|')}`);
    await ctx.close();
  }
  console.log('合計 OK', ok, 'NG', ng); await b.close(); srv.close();
})();
