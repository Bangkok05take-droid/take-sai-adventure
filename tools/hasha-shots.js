// 覇者の剣・覇者の盾の表示の確認：node tools/hasha-shots.js [リポジトリ] [出力フォルダ]（幅360・390・430）
// 村の持ち物（装備中）・品の説明・倉庫・ダンジョンの道具。絵が覇者の絵で、縦横比を保って枠に収まるか。お宝の勇者の剣・盾は別の品として出るか（確認のために持たせる）
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..'), OUT = process.argv[3] || path.join(ROOT, 'tests', 'screenshots', 'hasha'); fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type': {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'}[path.extname(f)]||'application/octet-stream'}); r.end(d); }); }).listen(8809);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://localhost:8809/'); await p.waitForTimeout(400);
    // 前のセーブの形：勇者の剣+5（装備中）・勇者の盾+3（装備中）は ID hero_sword・hero_shield のまま。倉庫にも+8の剣
    await p.evaluate(() => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village; V.story.introDone = true; V.seenIntro = true; V.story.chapter = 6;
      const sw = G.makeItem(S, 'hero_sword', { plus: 5 }); sw.eq = true; const sh = G.makeItem(S, 'hero_shield', { plus: 3 }); sh.eq = true;
      V.bag.push(sw, sh, G.makeItem(S, 'shinma_sword'), G.makeItem(S, 'hero_sword_relic'), G.makeItem(S, 'hero_shield_relic'), G.makeItem(S, 'herb'));
      V.storage.push(G.makeItem(S, 'hero_sword', { plus: 8 })); TS.Save.save(S); });
    await p.reload(); await p.waitForTimeout(500); await p.tap('#btn-continue'); await p.waitForTimeout(900);
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); });
    await p.waitForFunction(() => TS.Sprites.art.ready, null, { timeout: 5000 });
    await p.tap('.fac[data-fac="bag"]'); await p.waitForTimeout(400);
    const list = await p.evaluate(() => [...document.querySelectorAll('.modal .row')].map((r) => { const img = r.querySelector('img'); const ir = img ? img.getBoundingClientRect() : null;
      return { t: r.textContent.replace(/\s+/g, ' ').trim().slice(0, 40), src: img ? img.src.slice(0, 30) : null, nat: img ? [img.naturalWidth, img.naturalHeight] : null, box: ir ? [Math.round(ir.width), Math.round(ir.height)] : null, fit: img ? getComputedStyle(img).objectFit : null }; }));
    const sword = list.find((x) => x.t.includes('覇者の剣')), shield = list.find((x) => x.t.includes('覇者の盾'));
    chk(sword && shield && sword.t.includes('+5') && shield.t.includes('+3') && /装備/.test(sword.t + shield.t), `${w} 持ち物：覇者の剣+5・覇者の盾+3（装備中のまま） ${JSON.stringify([sword, shield])}`);
    const relics = list.filter((x) => /勇者の(剣|盾)/.test(x.t));
    chk(relics.length === 2 && !list.some((x) => /勇者の(剣|盾)\+/.test(x.t)), `${w} お宝の勇者の剣・盾は別の品（強化値なし） ${JSON.stringify(relics)}`);
    chk(list.every((x) => !x.box || x.fit === 'contain'), `${w} 絵は縦横比を保つ（contain）`);
    await p.screenshot({ path: path.join(OUT, `bag_${w}.png`) });
    // 品の説明（大きな絵）
    await p.tap('.modal .row:has-text("覇者の剣")'); await p.waitForTimeout(300);
    const det = await p.evaluate(() => { const img = document.querySelector('.modal:last-of-type .detail-head img') || [...document.querySelectorAll('.modal img')].pop(); const r = img.getBoundingClientRect();
      return { nat: [img.naturalWidth, img.naturalHeight], box: [Math.round(r.width), Math.round(r.height)], fit: getComputedStyle(img).objectFit, txt: document.querySelector('#modal-root').textContent.includes('攻撃') }; });
    chk(det.nat[0] === 128 && det.box[0] === det.box[1], `${w} 説明の絵は128の絵・正方形の枠 ${JSON.stringify(det)}`);
    if (w === 390) await p.screenshot({ path: path.join(OUT, `detail_sword_${w}.png`) });
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); });
    // ダンジョンの道具（装備画面）
    await p.evaluate(() => { const UI = TS.UI, G = TS.Game, S = UI.S; G.takeReturnScroll(S); G.depart(S, 5); S.run.enemies = [];
      document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-dungeon')); UI.screen = 'dungeon'; });
    await p.waitForTimeout(400); for (let i = 0; i < 10 && await p.$('.talk'); i++) { await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(60); }
    await p.tap('#b-items'); await p.waitForTimeout(400);
    const dl = await p.evaluate(() => [...document.querySelectorAll('.modal .row')].map((r) => r.textContent.replace(/\s+/g, ' ').trim().slice(0, 30)));
    const atk = await p.evaluate(() => TS.Game.playerAtk(TS.UI.S.run));
    chk(dl.some((t) => t.includes('覇者の剣+5')) && dl.some((t) => t.includes('覇者の盾+3')) && atk === await p.evaluate(() => TS.Data.PLAYER.baseAtk + 27 + 5), `${w} ダンジョンの道具：覇者の剣+5・盾+3（攻撃 ${atk}） ${JSON.stringify(dl)}`);
    await p.screenshot({ path: path.join(OUT, `dungeon_items_${w}.png`) });
    chk(!errs.length, `${w} エラーなし ${errs.join(' / ')}`);
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log('合計 OK', ok, 'NG', ng);
})();
