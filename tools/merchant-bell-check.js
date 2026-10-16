// なくしたボスの報酬の買い戻し・商人の呼鈴・ティウのうわさの確認：node tools/merchant-bell-check.js [リポジトリ] [出力フォルダ]（幅390）
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..'), OUT = process.argv[3] || path.join(ROOT, 'tests', 'screenshots', 'merchant-bell'); fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type': {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'}[path.extname(f)]||'application/octet-stream'}); r.end(d); }); }).listen(8811);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://localhost:8811/'); await p.waitForTimeout(400);
    // 13階以降で商人がいる探索。真魔剛竜剣・大魔王のローブは入手履歴あり（今は持っていない）、覇者の剣は持ち物にある、クロコダインの斧は未入手
    await p.evaluate(() => { const UI = TS.UI, G = TS.Game; let S = null;
      for (let s = 7700; s < 8200 && !S; s++) { const T = G.newState(); T.village.story.chapter = 3; T.village.story.introDone = true; G.depart(T, s);
        while (T.run.floor < 24 && !(T.run.merchant && T.run.floor >= 13)) { T.run.player.x = T.run.stairs.x; T.run.player.y = T.run.stairs.y; G.act(T, { type: 'descend' }); }
        if (T.run.merchant && T.run.floor >= 13) S = T; }
      const r = S.run, V = S.village; r.enemies = []; r.runGold = 1000; V.funds = 4000;
      V.bossObtained = { shinma_sword: true, demon_robe: true, hero_sword: true };
      r.bag = [G.makeItem(S, 'hero_sword'), G.makeItem(S, 'herb')];
      UI.S = S; UI.started = true; TS.Save.save(S); });
    await p.reload(); await p.waitForTimeout(500); await p.tap('#btn-continue'); await p.waitForTimeout(700);
    for (let i = 0; i < 10 && await p.$('.talk'); i++) { await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(60); }
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.openMerchant(); }); await p.waitForTimeout(300);
    const list = () => p.evaluate(() => [...document.querySelectorAll('.row.buyback')].map((r) => r.querySelector('.nm').childNodes[0].textContent + ':' + r.querySelector('.pr').textContent));
    let L = await list();
    chk(L.join() === '真魔剛竜剣:4000G,大魔王のローブ:6000G', `${w} なくした品：入手履歴あり・持っていない品だけ（覇者の剣は持ち物・斧は未入手なので出ない） ${JSON.stringify(L)}`);
    if (w === 390) await p.screenshot({ path: path.join(OUT, `buyback_${w}.png`) });
    // 大魔王のローブ：お金が足りない（1000＋4000＜6000）→ 買い戻すが押せない
    await p.tap('.row.buyback:has-text("大魔王のローブ")'); await p.waitForTimeout(250);
    chk(await p.evaluate(() => [...document.querySelectorAll('.modal-buttons button.primary')].pop().disabled && document.querySelector('#modal-root').textContent.includes('お金が足りません')), `${w} お金が足りないと押せない`);
    await p.tap('.modal-buttons button:has-text("やめる")'); await p.waitForTimeout(150);
    // 真魔剛竜剣：連打しても1本・4000G
    const before = await p.evaluate(() => ({ g: TS.UI.S.run.runGold + TS.UI.S.village.funds, n: TS.UI.S.run.bag.length }));
    await p.tap('.row.buyback:has-text("真魔剛竜剣")'); await p.waitForTimeout(250);
    if (w === 390) await p.screenshot({ path: path.join(OUT, `buyback_confirm_${w}.png`) });
    await p.evaluate(() => { const b = [...document.querySelectorAll('.modal-buttons button.primary')].pop(); b.click(); b.click(); b.click(); }); await p.waitForTimeout(300);
    const after = await p.evaluate(() => ({ g: TS.UI.S.run.runGold + TS.UI.S.village.funds, n: TS.UI.S.run.bag.length, sw: TS.UI.S.run.bag.filter((i) => i.id === 'shinma_sword').map((i) => i.plus || 0) }));
    L = await list();
    chk(after.g === before.g - 4000 && after.n === before.n + 1 && after.sw.join() === '0' && L.join() === '大魔王のローブ:6000G', `${w} 買い戻す：4000G・1本だけ（+0）・一覧から外れる ${JSON.stringify([before, after, L])}`);
    // 商人の呼鈴：商人のいない階で使う → この階に商人が現れる（取引画面は開かない）
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); const S = TS.UI.S, r = S.run; r.merchant = null; r.bag.push(TS.Game.makeItem(S, 'merchant_bell')); TS.Game.updateVision(r); });
    await p.tap('#b-items'); await p.waitForTimeout(300);
    await p.tap('.modal .row:has-text("商人の呼鈴")'); await p.waitForTimeout(250);
    await p.tap('.modal-buttons button:has-text("鳴らす")'); await p.waitForTimeout(500);
    const bs = await p.evaluate(() => ({ m: !!TS.UI.S.run.merchant, called: TS.UI.S.run.merchant && TS.UI.S.run.merchant.called, bell: TS.UI.S.run.bag.some((i) => i.id === 'merchant_bell'), modal: TS.UI.modals.length, toast: document.getElementById('toast').textContent }));
    chk(bs.m && bs.called && !bs.bell && bs.modal === 0 && bs.toast.includes('旅商人が現れた'), `${w} 呼鈴：商人が現れ、呼鈴は1個減る・取引画面は開かない ${JSON.stringify(bs)}`);
    if (w === 390) { await p.evaluate(() => { const r = TS.UI.S.run; r.explored.fill(1); }); await p.waitForTimeout(200); await p.screenshot({ path: path.join(OUT, `bell_used_${w}.png`) }); }
    chk(!errs.length, `${w} エラーなし ${errs.join(' / ')}`);
    await ctx.close();
  }
  // ティウのうわさ
  { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); const p = await ctx.newPage();
    await p.goto('http://localhost:8811/'); await p.waitForTimeout(400);
    await p.evaluate(() => { localStorage.clear(); const S = TS.Game.newState(); S.village.story.introDone = true; S.village.seenIntro = true; TS.Save.save(S); });
    await p.reload(); await p.waitForTimeout(500); await p.tap('#btn-continue'); await p.waitForTimeout(800);
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.openTiwGuide(); });
    await p.tap('.tg-choice:has-text("町のうわさ")'); await p.waitForTimeout(150); await p.tap('.tg-choice:has-text("なくした品のこと")'); await p.waitForTimeout(150);
    chk(await p.evaluate(() => document.querySelector('.modal-body').textContent.includes('拾い集めてる商人もいるんだって')), 'ティウのうわさ：なくした品のこと');
    await p.screenshot({ path: path.join(OUT, 'tiw_rumor_390.png') }); await ctx.close(); }
  await b.close(); srv.close();
  console.log('合計 OK', ok, 'NG', ng);
})();
