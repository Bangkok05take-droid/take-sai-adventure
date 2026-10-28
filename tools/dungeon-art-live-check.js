// 本番に反映した地域の背景の確認：node tools/dungeon-art-live-check.js [出力フォルダ]。普段の遊び方（つづきから）で1・4・8・12・14階を開き、反映した地域（レンガの回廊・木の根の遺跡・地下の遺跡）だけ素材の絵（D.DUNGEON_ART）・エラーなしを確かめて撮る（幅360・390・430）
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, 'docs', 'dungeon-art-v1', 'brick-live'); fs.mkdirSync(OUT, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(8851);
(async () => {
  const b = await chromium.launch(); let ng = 0;
  for (const [W, H] of [[390, 844], [360, 780], [430, 932]]) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://localhost:8851/'); await p.waitForTimeout(400);
    for (const F of [1, 4, 8, 12, 14, 17, 22]) {
      await p.evaluate((F) => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village; V.story.introDone = true; V.seenIntro = true;
        if (F >= 15) { const st = V.story; st.chapter = 6; for (const k of ['croc', 'flame', 'kill', 'baran', 'mist']) st.defeated[k] = true; }
        G.depart(S, 77); const r = S.run; while (r.floor < F) { r.enemies = r.enemies.filter((e) => e.boss); r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); } TS.Save.save(S); }, F);
      await p.reload(); await p.waitForTimeout(800); await p.tap('#btn-continue'); await p.waitForTimeout(1200);
      await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; });
      await p.waitForTimeout(600);
      const info = await p.evaluate(() => ({ th: TS.Game.themeOf(TS.UI.S.run), on: !!TS.Data.DUNGEON_ART[TS.Game.themeOf(TS.UI.S.run)] }));
      const want = ['brick', 'roots', 'ruins', 'ruins_deep', 'sunken', 'crystal'].includes(info.th);
      console.log(W, F, info.th, info.on === want ? 'OK' : 'NG', errs.length ? errs.join('/') : 'エラーなし'); if (info.on !== want || errs.length) ng++;
      const c = await p.evaluate(() => { const e = document.getElementById('dungeon-canvas').getBoundingClientRect(); return { x: e.x, y: e.y, width: e.width, height: e.height }; });
      await p.screenshot({ path: path.join(OUT, `live_f${F}_${W}.jpg`), clip: c, quality: 88 });
    }
    await ctx.close();
  }
  await b.close(); srv.close(); console.log(ng ? 'NG ' + ng : 'ALL OK');
})();
