// ボスの報酬の装備7種の確認：node tools/boss-equipment-check.js [リポジトリ] [出力フォルダ]。幅360・390・430で、持ち物の絵（128）・名前・種類・能力値、強化値と装備中の保持、章クリアの報酬画面、倉庫へ届けたお知らせ、キルバーン撃破で2点が現れること。
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..'), OUT = process.argv[3] || path.join(ROOT, 'tests', 'screenshots', 'boss-equipment'); fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type': {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'}[path.extname(f)]||'application/octet-stream'}); r.end(d); }); }).listen(8799);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
const IDS = ['croc_axe', 'iceflame_shield', 'phantom_shield', 'phantom_mask', 'shinma_sword', 'dragon_crest', 'demon_robe'];
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('requestfailed', (r) => errs.push('fail ' + r.url()));
    await p.goto('http://localhost:8799/'); await p.waitForTimeout(400);
    // 既存セーブ風：7種を持ち、一部は強化・装備中
    await p.evaluate((IDS) => { localStorage.clear(); const G = TS.Game, S = G.newState(); const V = S.village; V.story.introDone = true; V.seenIntro = true; V.story.chapter = 6;
      for (const id of IDS) { const it = G.makeItem(S, id); V.bag.push(it); }
      V.bag.find((i) => i.id === 'shinma_sword').plus = 3; V.bag.find((i) => i.id === 'phantom_shield').plus = 2;
      for (const id of ['shinma_sword', 'phantom_shield', 'dragon_crest']) G.toggleEquipInBag(V.bag, V.bag.find((i) => i.id === id).uid);
      TS.Save.save(S); }, IDS);
    await p.reload(); await p.waitForTimeout(600); await p.tap('#btn-continue'); await p.waitForTimeout(900);
    await p.evaluate(() => { for (const b of document.querySelectorAll('#modal-root .back')) b.remove(); TS.UI.modals.length = 0; });
    const kept = await p.evaluate(() => TS.UI.S.village.bag.map((i) => [i.id, i.plus || 0, !!i.eq]));
    chk(JSON.stringify(kept).includes('["shinma_sword",3,true]') && JSON.stringify(kept).includes('["phantom_shield",2,true]') && JSON.stringify(kept).includes('["dragon_crest",0,true]'), `${w} 強化値・装備中を保持 ${JSON.stringify(kept)}`);
    await p.tap('.fac[data-fac="bag"]'); await p.waitForTimeout(500);
    const rows = await p.evaluate(() => [...document.querySelectorAll('#modal-root .row')].map((r) => { const img = r.querySelector('img'), b = img.getBoundingClientRect(); const pic = new Image(); pic.src = img.src;
      return { t: r.textContent.trim().slice(0, 30), nat: [pic.naturalWidth, pic.naturalHeight], box: [Math.round(b.width), Math.round(b.height)], fit: getComputedStyle(img).objectFit }; }));
    await p.waitForTimeout(200);
    const rows2 = await p.evaluate(() => [...document.querySelectorAll('#modal-root .row img')].map((img) => { const pic = new Image(); pic.src = img.src; return [pic.naturalWidth, pic.naturalHeight]; }));
    chk(rows.length === 7 && rows2.every(([a, c]) => a === 128 && c === 128) && rows.every((r) => r.fit === 'contain'), `${w} 持ち物：7種の絵（128×128・contain）${JSON.stringify(rows.map((r) => r.t))}`);
    await p.screenshot({ path: path.join(OUT, `bag_${w}.png`) });
    // 詳細（種類・能力値）
    const details = [];
    for (let i = 0; i < 7; i++) {
      await p.evaluate((i) => document.querySelectorAll('#modal-root .row')[i].click(), i); await p.waitForTimeout(250);
      details.push(await p.evaluate(() => { const m = TS.UI.modals[TS.UI.modals.length - 1].el; return m.querySelector('.detail-head b').textContent + '|' + [...m.querySelectorAll('.kv span')].map((s) => s.textContent).slice(0, 6).join(','); }));
      if (w === 390 && [5, 6].includes(i)) await p.screenshot({ path: path.join(OUT, `detail_${i}_${w}.png`) });
      await p.evaluate(() => TS.UI.modals[TS.UI.modals.length - 1].close()); await p.waitForTimeout(100);
    }
    console.log(details.join('\n'));
    chk(details.length === 7 && /クロコダインの斧\|種類,武器,攻撃力,\+16/.test(details[0]) && /氷炎の盾\|種類,盾,防御力,\+15/.test(details[1]) && /漆黒の盾\+2\|種類,盾,防御力,\+19/.test(details[2]) && /ファントムマスク\|種類,アクセサリー.*防御力,\+5/.test(details[3])
      && /真魔剛竜剣\+3\|種類,武器,攻撃力,\+27/.test(details[4]) && /竜の紋章\|種類,アクセサリー.*攻撃力,\+5/.test(details[5]) && /大魔王のローブ\|種類,アクセサリー/.test(details[6]), `${w} 名前・種類・能力値`);
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); });
    // 章クリアの報酬画面（第4章）と、倉庫へ届けたお知らせ
    await p.evaluate(() => { const V = TS.UI.S.village; V.story.pending = { type: 'chapterClear', chapter: 4, funds: 2500 }; V.story.seen = Object.assign(V.story.seen || {}, {}); });
    await p.evaluate(() => TS.UI.debug.showStoryPending());
    for (let i = 0; i < 40 && await p.$('.talk'); i++) { await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(60); }
    await p.waitForTimeout(300);
    const rw = await p.evaluate(() => [...document.querySelectorAll('.reward')].map((r) => r.dataset.id + ':' + r.textContent));
    chk(rw.length === 2 && rw[0].startsWith('shinma_sword:真魔剛竜剣武器') && rw[1].startsWith('dragon_crest:竜の紋章アクセサリー'), `${w} 第4章クリア：報酬2点の絵と名前 ${JSON.stringify(rw)}`);
    await p.screenshot({ path: path.join(OUT, `chapter4_rewards_${w}.png`) });
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.S.village.story.pending = null; TS.UI.S.village.rewardNotice = ['phantom_shield', 'phantom_mask']; });
    await p.waitForTimeout(400); await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.S.village.rewardNotice = ['phantom_shield', 'phantom_mask']; TS.UI.debug.showStoryPending(); });
    await p.waitForTimeout(300);
    const nt = await p.evaluate(() => document.querySelector('#modal-root').textContent);
    chk(/漆黒の盾とファントムマスクを、倉庫に届けました/.test(nt), `${w} 倉庫へ届けたお知らせ`);
    if (w === 390) await p.screenshot({ path: path.join(OUT, `notice_${w}.png`) });
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); });
    // ダンジョン：キルバーン（第3章）を倒して、床に現れた2点
    const floor = await p.evaluate(() => { const S = TS.UI.S, G = TS.Game; S.village.story.chapter = 3; S.village.bag = []; G.depart(S, 909);
      while (S.run.floor < 25) { const r = S.run; r.enemies = r.enemies.filter((e) => e.boss); r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      const run = S.run, A = run.bossFight, b = run.enemies.find((e) => e.boss); const c = G.arenaCenter(run, run.enemies); run.player.x = c.x; run.player.y = c.y; G.checkBossRoom(S, []);
      run.player.x = b.x - 1; run.player.y = b.y; run.player.hp = run.player.maxhp = 9999; b.hp = 1; run.enemies = [b]; b.hold = 0; G.updateVision(run); TS.UI.save && 0;
      document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-dungeon')); TS.UI.screen = 'dungeon'; return true; });
    await p.waitForTimeout(300);
    for (let i = 0; i < 12 && await p.evaluate(() => TS.UI.S.run.enemies.some((e) => e.boss)); i++) { await p.tap('#dpad [data-dir="right"]'); await p.waitForTimeout(250); }
    await p.waitForTimeout(800); await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); for (const b of document.querySelectorAll('#modal-root .back, .talk')) b.remove(); });
    const fl = await p.evaluate(() => TS.UI.S.run.floorItems.filter((f) => f.item && f.item.bossReward).map((f) => f.item.id).sort());
    chk(JSON.stringify(fl) === JSON.stringify(['phantom_mask', 'phantom_shield']), `${w} キルバーン撃破で2点とも現れる ${JSON.stringify(fl)}`);
    await p.waitForTimeout(500);
    if (w === 390) await p.screenshot({ path: path.join(OUT, `floor_kill_${w}.png`) });
    // 拾う（2点）→ 持ち物に入る
    await p.evaluate(() => { const run = TS.UI.S.run, G = TS.Game; for (const f of run.floorItems.slice()) if (f.item && f.item.bossReward) { run.player.x = f.x; run.player.y = f.y; G.act(TS.UI.S, { type: 'pickup' }); } });
    chk(await p.evaluate(() => ['phantom_mask', 'phantom_shield'].every((id) => TS.UI.S.run.bag.some((i) => i.id === id))), `${w} 拾って持ち物へ`);
    chk(!errs.length, `${w} エラーなし ${errs.join('|')}`);
    await ctx.close();
  }
  console.log('合計 OK', ok, 'NG', ng); await b.close(); srv.close();
})();
