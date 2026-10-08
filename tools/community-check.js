// こもれびの家の確認：node tools/community-check.js [リポジトリ] [出力フォルダ]。幅360・390・430で、既存のセーブの購入状態を引き継ぎ、家ともっちゃんをタップすると階段の前 (2,20) まで歩いて村の発展が開くこと。
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..'), OUT = process.argv[3] || path.join(ROOT, 'tests', 'screenshots', 'community'); fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type': {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp'}[path.extname(f)]||'application/octet-stream'}); r.end(d); }); }).listen(8796);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://localhost:8796/'); await p.waitForTimeout(400);
    // 既存のセーブ（v6・飾りを一部購入済み）
    await p.evaluate(() => { localStorage.clear(); const S = TS.Game.newState(); const V = S.village; V.story.introDone = true; V.seenIntro = true; V.funds = 4321;
      V.built.lanterns = true; V.built.bridge = true; V.built.garden = true; V.built.storage2 = true; TS.Game.applyFacilities(V); TS.Save.save(S); });
    await p.reload(); await p.waitForTimeout(500); await p.tap('#btn-continue'); await p.waitForTimeout(900);
    const clear = () => p.evaluate(() => { for (const b of document.querySelectorAll('#modal-root .back')) b.remove(); TS.UI.modals.length = 0; });
    await clear();
    const st = await p.evaluate(() => ({ funds: TS.UI.S.village.funds, decor: TS.UI.S.village.decor, built: Object.keys(TS.UI.S.village.built).filter((k) => TS.UI.S.village.built[k]).sort().join() }));
    chk(st.funds === 4321 && st.decor.lanterns && st.decor.bridge && st.decor.garden, w + ' 購入状態を引き継ぐ ' + JSON.stringify(st));
    for (const [kind, id] of [['fac', 'develop'], ['npc', 'develop']]) {
      await p.evaluate(() => { const W = TS.UI.walker; W.x = 5; W.y = 21; W.path = []; W.moving = false; }); await p.waitForTimeout(250);
      const pt = await p.evaluate(([kind, id]) => { const hs = TS.UI.vview.hits.filter((h) => h.kind === kind && (h.id === id || h.who === id || h.fac === id)); const r = document.getElementById('village-canvas').getBoundingClientRect();
        const h = hs[0]; if (!h) return { none: TS.UI.vview.hits.filter((x) => x.kind === kind).map((x) => x.id + '/' + (x.who || '')).join() };
        const x0 = Math.max(0, h.x), x1 = Math.min(r.width, h.x + h.w), y0 = Math.max(0, h.y), y1 = Math.min(r.height - 160, h.y + h.h); return { x: r.left + (x0 + x1) / 2, y: r.top + (y0 + y1) / 2 }; }, [kind, id]);
      if (pt.none !== undefined) { chk(false, w + ' hit not found ' + kind + ' ' + pt.none); continue; }
      await p.touchscreen.tap(pt.x, pt.y);
      for (let i = 0; i < 60 && !(await p.evaluate(() => TS.UI.modals.length)); i++) await p.waitForTimeout(80);
      const r = await p.evaluate(() => ({ w: [TS.UI.walker.x, TS.UI.walker.y], dir: TS.UI.walker.dir, title: (document.querySelector('#modal-root h2') || {}).textContent }));
      chk(r.w.join() === '2,20' && /村の発展/.test(r.title || ''), `${w} ${kind}:${id} → 階段の前で村の発展が開く ${JSON.stringify(r)}`);
      if (kind === 'fac') await p.screenshot({ path: path.join(OUT, `develop_open_${w}.png`) });
      await clear(); await p.waitForTimeout(150);
    }
    chk(!errs.length, w + ' エラーなし ' + errs.join('|'));
    await ctx.close();
  }
  console.log('合計 OK', ok, 'NG', ng); await b.close(); srv.close();
})();
