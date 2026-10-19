// 旅商人の買い取りの画面の確認：node tools/merchant-sell-check.js [リポジトリ] [出力フォルダ]（幅360・390・430）
// お宝だけが買い取り額つきで並ぶ（売れないお宝は「買い取れない」）・装備や素材は並ばない・売ると探索中のお金と持ち物が正しく変わる・ターンは進まない
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..'), OUT = process.argv[3] || path.join(ROOT, 'tests', 'screenshots', 'merchant-sell'); fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type': {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'}[path.extname(f)]||'application/octet-stream'}); r.end(d); }); }).listen(8810);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://localhost:8810/'); await p.waitForTimeout(400);
    await p.evaluate(() => { const UI = TS.UI, G = TS.Game; let S = null;
      for (let s = 7700; s < 8200 && !S; s++) { const T = G.newState(); T.village.story.chapter = 3; T.village.story.introDone = true; G.depart(T, s);
        while (T.run.floor < 24 && !(T.run.merchant && T.run.floor >= 13)) { T.run.player.x = T.run.stairs.x; T.run.player.y = T.run.stairs.y; G.act(T, { type: 'descend' }); }
        if (T.run.merchant && T.run.floor >= 13) S = T; }
      const r = S.run; r.enemies = []; r.runGold = 50;
      r.bag = [G.makeItem(S, 'golden_lotus'), G.makeItem(S, 'dream_crown'), G.makeItem(S, 'croc_tear'), G.makeItem(S, 'hero_sword'), G.makeItem(S, 'amber_shard'), G.makeItem(S, 'herb'), G.makeItem(S, 'poison_ring')];
      UI.S = S; UI.started = true; TS.Save.save(S); });
    await p.reload(); await p.waitForTimeout(500); await p.tap('#btn-continue'); await p.waitForTimeout(700);
    for (let i = 0; i < 10 && await p.$('.talk'); i++) { await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(60); }
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.openMerchant(); });
    await p.waitForTimeout(300);
    const st = () => p.evaluate(() => ({ rows: [...document.querySelectorAll('.row.sellrow')].map((r) => ({ t: r.querySelector('.nm').childNodes[0].textContent, pr: r.querySelector('.pr').textContent, dis: r.classList.contains('disabled') })),
      note: document.querySelector('#modal-root').textContent.includes('町の半額'), sw: document.documentElement.scrollWidth, gold: TS.UI.S.run.runGold, bag: TS.UI.S.run.bag.length, turn: TS.UI.S.run.turn }));
    let s = await st();
    const names = s.rows.map((x) => x.t).join();
    chk(s.note && names === '黄金の蓮,夢見の宝冠,クロコダインの涙' && s.rows[0].pr === '130G' && s.rows[1].pr === '1000G' && s.rows[2].dis && s.rows[2].pr === '買い取れない' && s.sw <= w,
      `${w} お宝だけが並ぶ（半額・売れないお宝は買い取れない）。武器・素材・薬・アクセサリーは並ばない ${JSON.stringify(s.rows)}`);
    await p.evaluate(() => { const b = document.querySelector('.modal-body'); b.scrollTop = b.scrollHeight; });
    await p.screenshot({ path: path.join(OUT, `merchant_sell_${w}.png`) });
    // 黄金の蓮を売る（確認画面：品物・個数・額）→ 連打しても1回
    await p.tap('.row.sellrow:has-text("黄金の蓮")'); await p.waitForTimeout(250);
    const conf = await p.evaluate(() => document.querySelectorAll('.modal')[1].textContent);
    chk(conf.includes('個数1個') && conf.includes('130G（町の半額）'), `${w} 確認画面：品物・個数・買い取り額`);
    if (w === 390) await p.screenshot({ path: path.join(OUT, `merchant_sell_confirm_${w}.png`) });
    await p.evaluate(() => { const b = [...document.querySelectorAll('.modal-buttons button.primary')].pop(); b.click(); b.click(); b.click(); });
    await p.waitForTimeout(300);
    const s2 = await st();
    chk(s2.gold === s.gold + 130 && s2.bag === s.bag - 1 && s2.turn === s.turn && !s2.rows.some((x) => x.t === '黄金の蓮'), `${w} 売る：探索中のお金 +130G・持ち物 -1・ターンは進まない・1回だけ ${JSON.stringify([s.gold, s2.gold, s.bag, s2.bag])}`);
    // 売れないお宝は押しても売れない
    await p.tap('.row.sellrow:has-text("クロコダインの涙")'); await p.waitForTimeout(250);
    chk(await p.evaluate(() => [...document.querySelectorAll('.modal-buttons button.primary')].pop().disabled), `${w} 売れないお宝は「売る」が押せない`);
    chk(!errs.length, `${w} エラーなし ${errs.join(' / ')}`);
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log('合計 OK', ok, 'NG', ng);
})();
