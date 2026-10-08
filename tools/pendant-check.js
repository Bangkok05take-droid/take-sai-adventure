// 竜の紋章（アクセサリー）を赤い橋の向こう岸で拾う確認：node tools/pendant-check.js [リポジトリ] [出力フォルダ]（幅360・390・430）
// 橋が無いと見えず・行けない／橋があると見えて、タップで歩いて拾える（持ち物へ・いっぱいなら倉庫へ）。読み込み直しても戻らない。ティウのヒント。絵
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..'), OUT = process.argv[3] || path.join(ROOT, 'tests', 'screenshots', 'pendant'); fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type': {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'}[path.extname(f)]||'application/octet-stream'}); r.end(d); }); }).listen(8803);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
    for (const mode of ['nobridge', 'bridge', 'full']) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
      const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
      await p.goto('http://localhost:8803/'); await p.waitForTimeout(400);
      await p.evaluate((mode) => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village; V.story.introDone = true; V.seenIntro = true; V.story.chapter = 3;
        if (mode !== 'nobridge') V.built.bridge = true;
        if (mode === 'full') while (V.bag.length < TS.Data.BAG_SIZE) V.bag.push(G.makeItem(S, 'herb'));
        G.applyFacilities(V); TS.Save.save(S); }, mode);
      await p.reload(); await p.waitForTimeout(500); await p.tap('#btn-continue'); await p.waitForTimeout(900);
      await p.evaluate(() => { for (const b of document.querySelectorAll('#modal-root .back')) b.remove(); TS.UI.modals.length = 0; const W = TS.UI.walker; W.x = 6; W.y = 21; W.path = []; W.moving = false; });
      await p.waitForTimeout(400);
      const st = await p.evaluate(() => { const v = TS.UI.vview, VL = TS.Village; return { pickups: v.pickups.map((x) => x.key + '@' + x.x + ',' + x.y), reach: !!VL.path(v.solid, 6, 21, 4, 25) }; });
      // ティウのヒント（出発の画面）
      await p.tap('.fac[data-fac="depart"]'); await p.waitForTimeout(300);
      const hint = await p.evaluate(() => document.querySelector('#modal-root').textContent.includes('そういえば昔、マスターヤナイが川の向こうで何かなくしたらしいよ。'));
      if (w === 390 && mode === 'bridge') await p.screenshot({ path: path.join(OUT, `tiw_hint_${w}.png`) });
      await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); });
      if (mode === 'nobridge') { chk(!st.pickups.length && !st.reach && !hint, `${w} 橋なし：紋章は無く、向こう岸へ行けず、ヒントも無い ${JSON.stringify(st)}`); if (w === 390) await p.screenshot({ path: path.join(OUT, `nobridge_${w}.png`) }); await ctx.close(); continue; }
      chk(st.pickups.join() === 'dragon_crest@4,25' && st.reach && hint, `${w} ${mode}：向こう岸 (4,25) に紋章・橋を渡って行ける・ティウのヒント ${JSON.stringify(st)} hint=${hint}`);
      // 向こう岸へ：橋を渡って、紋章のマスをタップ
      await p.evaluate(() => { const W = TS.UI.walker; W.x = 3; W.y = 24; W.path = []; W.moving = false; }); await p.waitForTimeout(400);
      if (w === 390 && mode === 'bridge') { const c = await p.evaluate(() => { const r = document.getElementById('village-canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }); await p.screenshot({ path: path.join(OUT, `pendant_on_bank_${w}.png`), clip: c }); }
      await p.evaluate(() => { const W = TS.UI.walker; W.x = 4; W.y = 21; W.path = []; W.moving = false; }); await p.waitForTimeout(300);
      // 実際にタップで歩く：まず橋を渡って向こう岸 (3,25) へ、次に紋章のマスへ
      for (const [tx, ty] of [[3, 25], [4, 25]]) {
        const pt = await p.evaluate(([tx, ty]) => { const v = TS.UI.vview, r = document.getElementById('village-canvas').getBoundingClientRect(); let sx = 0, sy = 0, n = 0;
          for (let y = 0; y < r.height; y += 3) for (let x = 0; x < r.width; x += 3) { const t = v.tile(x, y); if (t.x === tx && t.y === ty) { sx += x; sy += y; n++; } } return n ? { x: r.left + sx / n, y: r.top + sy / n } : null; }, [tx, ty]);
        if (!pt) { chk(false, `${w} ${tx},${ty} offscreen`); break; }
        await p.touchscreen.tap(pt.x, pt.y);
        for (let i = 0; i < 80 && !(await p.evaluate(() => TS.UI.modals.length)) && await p.evaluate(() => TS.UI.walker.moving || TS.UI.walker.path.length); i++) await p.waitForTimeout(80);
        await p.waitForTimeout(300);
      }
      const got = await p.evaluate(() => { const V = TS.UI.S.village; return { title: (document.querySelector('#modal-root h2') || {}).textContent, txt: (document.querySelector('#modal-root') || {}).textContent, bag: V.bag.filter((i) => i.id === 'dragon_crest').length, st: V.storage.filter((i) => i.id === 'dragon_crest').length, found: !!V.story.found.dragon_crest, saved: !!TS.Save.load().village.story.found.dragon_crest, w: [TS.UI.walker.x, TS.UI.walker.y] }; });
      const want = mode === 'full' ? [0, 1] : [1, 0];
      chk(/見つけた/.test(got.title || '') && got.bag === want[0] && got.st === want[1] && got.found && got.saved, `${w} ${mode}：タップで歩いて拾う（${mode === 'full' ? '倉庫へ' : '持ち物へ'}）・保存 ${JSON.stringify(got)}`);
      if (w === 390) await p.screenshot({ path: path.join(OUT, `picked_${mode}_${w}.png`) });
      await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); });
      // 読み込み直し：もう無い・ヒントも出ない
      await p.reload(); await p.waitForTimeout(500); await p.tap('#btn-continue'); await p.waitForTimeout(900);
      await p.evaluate(() => { for (const b of document.querySelectorAll('#modal-root .back')) b.remove(); TS.UI.modals.length = 0; }); await p.waitForTimeout(300);
      const after = await p.evaluate(() => ({ pickups: TS.UI.vview.pickups.length, n: TS.UI.S.village.bag.concat(TS.UI.S.village.storage).filter((i) => i.id === 'dragon_crest').length }));
      chk(after.pickups === 0 && after.n === 1, `${w} ${mode}：読み込み直しても復活しない・1つだけ ${JSON.stringify(after)}`);
      if (mode === 'bridge') {
        // 詳細の絵（ペンダント、128）
        await p.tap('.fac[data-fac="bag"]'); await p.waitForTimeout(300);
        await p.evaluate(() => { const rows = [...document.querySelectorAll('#modal-root .row')]; rows.find((r) => r.textContent.includes('竜の紋章')).click(); }); await p.waitForTimeout(300);
        const img = await p.evaluate(() => { const i = TS.UI.modals[TS.UI.modals.length - 1].el.querySelector('.detail-head img'); const pic = new Image(); pic.src = i.src; return [pic.naturalWidth, pic.naturalHeight]; });
        chk(img[0] === 128, `${w} 詳細はペンダントの絵（128×128）${img}`);
        if (w === 390) await p.screenshot({ path: path.join(OUT, `detail_${w}.png`) });
      }
      chk(!errs.length, `${w} ${mode} エラーなし ${errs.join('|')}`);
      await ctx.close();
    }
  }
  console.log('合計 OK', ok, 'NG', ng); await b.close(); srv.close();
})();
