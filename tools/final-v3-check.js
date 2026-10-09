// 最終章（版3）の画面確認：node tools/final-v3-check.js [リポジトリ] [出力フォルダ]（幅360・390・430）
// 30階：大魔王バーン撃破 → 仮の会話（連れ去る場面）→ ティウの救援の画面（はみ出さない・決定と終わるが押せる）／3点セットの「飛ぶ」見た目／35階：体が戻る場面（仮の会話）→ 祈り
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..'), OUT = process.argv[3] || path.join(ROOT, 'tests', 'screenshots', 'final-v3'); fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type': {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'}[path.extname(f)]||'application/octet-stream'}); r.end(d); }); }).listen(8804);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    const closeTalk = async () => { for (let i = 0; i < 40 && await p.$('.talk'); i++) { await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(60); } };
    await p.goto('http://localhost:8804/'); await p.waitForTimeout(400);
    await p.evaluate(() => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village; V.story.introDone = true; V.seenIntro = true; V.story.chapter = 6;
      for (let i = 0; i < 8; i++) V.storage.push(G.makeItem(S, i % 2 ? 'herb' : 'banana'));
      V.materials = { amber_shard: 3, crystal_shard: 1 };
      G.depart(S, 4242); while (S.run.floor < 30) { const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      for (const id of ['shinma_sword', 'dragonic_shield', 'dragon_crest']) { const it = G.makeItem(S, id); S.run.bag.push(it); G.act(S, { type: 'equip', uid: it.uid }); }
      S.run.player.half = 0; TS.Save.save(S); });
    await p.reload(); await p.waitForTimeout(500); await p.tap('#btn-continue'); await p.waitForTimeout(700); await closeTalk();
    await p.evaluate(() => { const S = TS.UI.S, r = S.run, G = TS.Game, b = r.enemies.find((e) => e.boss); b.hp = 3; b.cds = { circle: 9, bird: 9, summon: 9 };
      r.player.x = b.x - 1; r.player.y = b.y; r.player.hp = r.player.maxhp = 900; G.updateVision(r); G.checkBossRoom(S, []); b.hold = 0; });
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(OUT, `flying_${w}.png`) });
    chk(await p.evaluate(() => TS.Game.sets(TS.UI.S.run).all3), `${w} 3点セット`);
    for (let i = 0; i < 20 && await p.evaluate(() => TS.UI.S.run.enemies.some((e) => e.boss)); i++) { await p.tap('#dpad [data-dir="right"]'); await p.waitForTimeout(160); }
    await p.waitForTimeout(700);
    const talks = [];
    for (let i = 0; i < 8 && !(await p.$('.modal h2:has-text("ティウの救援")')); i++) { const t = await p.evaluate(() => { const e = document.querySelector('.talk'); return e ? e.textContent.slice(0, 40) : ''; }); if (t) talks.push(t); if (w === 390 && i === 1) await p.screenshot({ path: path.join(OUT, `vearn_taken_${w}.png`) }); await closeTalk(); await p.waitForTimeout(400); }
    const rs = await p.evaluate(() => { const m = document.querySelector('.modal'); const btns = [...document.querySelectorAll('.modal-buttons button')].map((x) => { const r = x.getBoundingClientRect(); return { t: x.textContent, vis: r.width > 0 && r.bottom <= innerHeight + 1 }; });
      return { ok: !!m && m.textContent.includes('ティウの救援'), sw: document.documentElement.scrollWidth, btns }; });
    chk(rs.ok && rs.sw <= w && rs.btns.every((x) => x.vis), `${w} 救援の画面（はみ出さない・ボタンが画面内） ${JSON.stringify(rs)} talks=${JSON.stringify(talks)}`);
    await p.screenshot({ path: path.join(OUT, `rescue_${w}.png`) });
    await p.evaluate(() => { const l = document.querySelector('label.row[data-side="in"] input'); l.click(); });
    await p.waitForTimeout(100);
    await p.tap('.row.mat[data-mat="amber_shard"] button[data-d="1"]'); await p.waitForTimeout(100);
    await p.tap('.row.mat[data-mat="amber_shard"] button[data-d="1"]'); await p.waitForTimeout(100);
    const mt = await p.evaluate(() => ({ plan: TS.UI.S.run.final.rescuePlan, sw: document.documentElement.scrollWidth, box: document.querySelector('.modal .okbox').textContent,
      btn: (() => { const r = document.querySelector('.row.mat button').getBoundingClientRect(); return [r.width, r.height, r.right <= innerWidth]; })() }));
    chk(mt.plan.mats.amber_shard === 2 && mt.plan.in.length === 1 && mt.sw <= w && mt.btn[0] >= 44 && mt.btn[2], `${w} 選ぶ（素材の個数・はみ出さない・押しやすい） ${JSON.stringify(mt)}`);
    await p.evaluate(() => { const b = document.querySelector('.modal-body'); b.scrollTop = b.scrollHeight; });
    await p.screenshot({ path: path.join(OUT, `rescue_mats_${w}.png`) });
    await p.tap('.modal-buttons button >> text=交換を終える'); await p.waitForTimeout(250);
    await p.screenshot({ path: path.join(OUT, `confirm_${w}.png`) });
    const before = await p.evaluate(() => TS.UI.S.run.bag.length);
    await p.tap('.modal-buttons button.primary >> text=OK'); await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(OUT, `wolf_${w}.png`) });
    const af = await p.evaluate(() => ({ bag: TS.UI.S.run.bag.length, amber: TS.UI.S.village.materials.amber_shard }));
    chk(af.bag === before + 3 && af.amber === 1, `${w} 確定で一括交換（倉庫1個＋素材2個） ${JSON.stringify(af)} before=${before}`);
    await p.tap('.modal-buttons button >> text=進む'); await p.waitForTimeout(200);
    chk(await p.evaluate(() => TS.UI.S.run.final.rescue === 'done' && !TS.UI.modals.length), `${w} 救援を終える`);
    await p.evaluate(() => { const S = TS.UI.S, G = TS.Game; while (S.run.floor < 35) { const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      const r = S.run, b = r.enemies.find((e) => e.boss); r.player.x = b.x - 2; r.player.y = b.y; r.player.hp = 50; G.updateVision(r); const ev = []; G.checkBossRoom(S, ev); TS.UI.playBossIntro('truevearn'); });
    await p.waitForTimeout(300);
    if (w === 390) await p.screenshot({ path: path.join(OUT, `body_return_${w}.png`) });
    await closeTalk(); await p.waitForTimeout(600);
    await p.screenshot({ path: path.join(OUT, `prayer_${w}.png`) });
    await closeTalk();
    const pr = await p.evaluate(() => { const r = TS.UI.S.run; return { hp: r.player.hp, max: r.player.maxhp, stage: r.final.stage }; });
    chk(pr.hp === pr.max && pr.stage === 'battle2', `${w} 35階：体が戻る場面→祈り ${JSON.stringify(pr)}`);
    await p.evaluate(() => { const r = TS.UI.S.run, G = TS.Game, b = r.enemies.find((e) => e.boss); b.hp = 1; b.hold = 3; r.player.x = b.x - 1; r.player.y = b.y; G.updateVision(r); });
    for (let i = 0; i < 20 && await p.evaluate(() => TS.UI.S.run.enemies.some((e) => e.boss)); i++) { await p.tap('#dpad [data-dir="right"]'); await p.waitForTimeout(160); }
    await p.waitForTimeout(700); await closeTalk();
    const ck = await p.evaluate(() => { const r = TS.UI.S.run, G = TS.Game; r.explored.fill(1); r.enemies = []; r.player.x = r.crack.x; r.player.y = r.crack.y + 1; G.updateVision(r); return { crack: r.crack, portal: r.portal, state: G.crackState(TS.UI.S) }; });
    await p.waitForTimeout(300);
    if (w === 390) await p.screenshot({ path: path.join(OUT, `crack_${w}.png`) });
    await p.tap('#dpad [data-dir="up"]'); await p.waitForTimeout(400);
    const cm = await p.evaluate(() => document.querySelector('#modal-root').textContent);
    chk(ck.state === 'unstable' && cm.includes('時空の亀裂') && (await p.evaluate(() => TS.UI.S.run.floor)) === 35, `${w} 35階：時空の亀裂（エンディング前は入れない） ${JSON.stringify(ck)}`);
    if (w === 390) await p.screenshot({ path: path.join(OUT, `crack_msg_${w}.png`) });
    chk(!errs.length, `${w} エラーなし ${errs.join(' / ')}`);
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log('合計 OK', ok, 'NG', ng);
})();
