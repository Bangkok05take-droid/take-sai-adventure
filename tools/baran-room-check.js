// 通常バラン戦の部屋（D.BARAN_ROOM、2026年10月20日）の確認：node tools/baran-room-check.js [出力フォルダ]（既定 docs/baran-room-v1/）
// 確かめること（PCのブラウザ、幅360・390・430）：
//  第4章30階に着く → 下の通路（前室）に立つ。背景の絵を敷く（タイルは描かない）・玉座を壇の上に描く
//  上へ歩いて広間へ入る1歩で登場ムービー（このブラウザは動画を再生できないので、読み込み失敗から戦いへ）。開始は1回だけ
//  バランは広間の中央。たけと並べた画面。倒すと帰還口（金の魔法陣）が広間の床に
//  あわせて地図を書き出し、全体図（tools/baran-room-overview.py）を作る
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, 'docs', 'baran-room-v1');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8835;
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' }[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
const closeTalk = async (p) => { for (let i = 0; i < 40 && await p.$('.talk'); i++) { await p.tap('.modal-buttons button.primary', { timeout: 500 }).catch(() => {}); await p.waitForTimeout(120); } };

(async () => {
  const b = await chromium.launch();
  for (const [W, H] of (process.env.ONLYW ? [[390, 844]] : [[360, 780], [390, 844], [430, 932]])) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.route('**/*.mp4', (route) => route.fulfill({ status: 404, body: '' }));   // このブラウザは動画を再生できない：読み込み失敗から戦いへ
    await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(400);
    await p.evaluate(() => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village, st = V.story; st.introDone = true; V.seenIntro = true; st.chapter = 4;
      for (const k of ['croc', 'flame', 'kill']) st.defeated[k] = true;
      G.depart(S, 4040); const r = S.run; r.player.hp = r.player.maxhp = 9999; r.player.lvl = 30;
      while (r.floor < G.maxFloor(r) - 1) { r.enemies = []; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      r.enemies = []; r.player.x = r.stairs.x; r.player.y = r.stairs.y; TS.Save.save(S); });
    await p.reload(); await p.waitForTimeout(700); await p.tap('#btn-continue'); await p.waitForTimeout(900);
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; });
    await p.tap('#b-foot'); await p.waitForTimeout(200); await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(1200);
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; });
    const a = await p.evaluate((W) => { const r = TS.UI.S.run, m = r.map, A = r.bossFight; return { floor: r.floor, bg: m.bg, w: m.w, h: m.h, p: [r.player.x, r.player.y], A,
      boss: (r.enemies.find((e) => e.boss) || {}).type, art: !!(TS.Sprites.art.rooms.baranBg && TS.Sprites.art.rooms.baranThrone),
      json: W === 390 ? { B: TS.Data.BARAN_ROOM, w: m.w, h: m.h, pass: m.tiles.map((t, i) => TS.Dungeon.passable(m, i % m.w, (i / m.w) | 0) ? 1 : 0), start: { x: r.player.x, y: r.player.y }, boss: (() => { const e = r.enemies.find((q) => q.boss); return { x: e.x, y: e.y }; })() } : null }; }, W);
    chk(a.floor === 30 && a.bg === 'BARAN_ROOM' && a.w === 19 && a.h === 34 && a.boss === 'baran' && a.art && a.p.join() === '9,32', `${W} 第4章30階：バランの部屋（背景の絵・玉座）・下の通路の入口 ${JSON.stringify({ ...a, json: undefined })}`);
    if (a.json) fs.writeFileSync(path.join(OUT, '_map.json'), JSON.stringify(a.json));
    // 背景の絵を敷いて、タイルの層は描かない
    const draws = await p.evaluate(() => { const R = TS.Sprites.art.rooms, seq = []; const o = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (im, ...x) { seq.push(im === R.baranBg ? 'bg' : im === R.baranThrone ? 'throne' : 'x'); return o.call(this, im, ...x); };
      TS.Render.drawDungeon(document.getElementById('dungeon-canvas'), TS.UI.S, performance.now()); CanvasRenderingContext2D.prototype.drawImage = o;
      return { bg: seq.filter((s) => s === 'bg').length, throne: seq.filter((s) => s === 'throne').length }; });
    chk(draws.bg === 1, `${W} 背景の絵を1回で敷く ${JSON.stringify(draws)}`);
    await p.screenshot({ path: path.join(OUT, `phone-entry_${W}.jpg`), quality: 85 });
    // 上へ歩く：5歩で通路の上の端、6歩目で広間（登場ムービー）
    for (let i = 0; i < 5; i++) { await p.evaluate(() => { TS.UI.lockUntil = 0; }); await p.tap('#dpad [data-dir="up"]'); await p.waitForTimeout(260); }
    const b5 = await p.evaluate(() => { const r = TS.UI.S.run; return { p: [r.player.x, r.player.y], intro: r.bossFight.intro || null, engaged: r.bossFight.engaged }; });
    chk(b5.p.join() === '9,27' && !b5.intro && !b5.engaged, `${W} 通路の上の端（まだ始まらない） ${JSON.stringify(b5)}`);
    await p.screenshot({ path: path.join(OUT, `phone-door_${W}.jpg`), quality: 85 });
    await p.evaluate(() => { TS.UI.lockUntil = 0; }); await p.tap('#dpad [data-dir="up"]');
    for (let i = 0; i < 40 && !(await p.evaluate(() => TS.UI.S.run.bossFight.engaged)); i++) { await p.waitForTimeout(150); await closeTalk(p); await p.tap('.movie-skip', { timeout: 200 }).catch(() => {}); }
    for (let i = 0; i < 15 && !(await p.$('.talk')); i++) await p.waitForTimeout(100);   // 戦いの前の会話が開くまで
    await closeTalk(p);
    const st = await p.evaluate(() => { const r = TS.UI.S.run, bo = r.enemies.find((e) => e.boss); return { p: [r.player.x, r.player.y], engaged: r.bossFight.engaged, starts: r.log.filter((l) => l.includes('との戦いが始まった')).length, boss: [bo.x, bo.y] }; });
    chk(st.engaged && st.starts === 1 && st.p.join() === '9,26' && st.boss.join() === '9,18', `${W} 広間に入る1歩で登場 → 戦いの開始は1回・バランは中央 ${JSON.stringify(st)}`);
    // たけとバランを並べた画面（2マス離す。ボスは動かさない）
    await p.evaluate(() => { const r = TS.UI.S.run, bo = r.enemies.find((e) => e.boss); bo.hold = 99; r.player.x = bo.x - 2; r.player.y = bo.y; r.player.dir = 'right'; TS.Game.updateVision(r); TS.UI.lockUntil = 0; });
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(OUT, `phone-battle_${W}.jpg`), quality: 85 });
    // 玉座の近く（広間のいちばん上の列）：玉座・壇と、たけ・バランの大きさ
    await p.evaluate(() => { const r = TS.UI.S.run, bo = r.enemies.find((e) => e.boss), A = r.bossFight; bo.x = 10; bo.y = A.y; r.player.x = 8; r.player.y = A.y; r.player.dir = 'up'; TS.Game.updateVision(r); });
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(OUT, `phone-throne_${W}.jpg`), quality: 85 });
    // 倒す → 帰還口は広間の床
    await p.evaluate(() => { const r = TS.UI.S.run, bo = r.enemies.find((e) => e.boss); bo.x = 9; bo.y = 18; bo.hp = 1; bo.hold = 0; bo.sleep = 50; bo.charge = null; r.player.x = 8; r.player.y = 18; TS.Game.updateVision(r); TS.UI.lockUntil = 0; });
    for (let i = 0; i < 15 && await p.evaluate(() => TS.UI.S.run.enemies.some((e) => e.boss)); i++) { await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; TS.UI.doAct({ type: 'move', dir: 'right' }); }); await p.waitForTimeout(200); }
    // 撃破後ムービー（読み込み失敗で閉じる）・会話が終わるのを待つ
    for (let i = 0; i < 60 && !(await p.evaluate(() => !!TS.UI.S.run.portal)); i++) { await p.waitForTimeout(150); await closeTalk(p); await p.tap('.movie-skip', { timeout: 200 }).catch(() => {}); }
    await closeTalk(p);
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); });
    const after = await p.evaluate(() => { const r = TS.UI.S.run, P = r.portal; return { portal: P, ok: !!P && TS.Game.inArena(r, P.x, P.y) && TS.Dungeon.passable(r.map, P.x, P.y),
      rewards: r.floorItems.filter((f) => f.item && f.item.bossReward).map((f) => [f.item.id, f.x, f.y, TS.Game.inArena(r, f.x, f.y)]) }; });
    chk(after.ok && after.rewards.every((x) => x[3]), `${W} 撃破：帰還口と報酬は広間の床 ${JSON.stringify(after)}`);
    await p.waitForTimeout(800);
    await p.screenshot({ path: path.join(OUT, `phone-portal_${W}.jpg`), quality: 85 });
    chk(!errs.length, `${W} エラーなし ${errs.join(' / ')}`);
    await ctx.close();
  }
  try { execFileSync('python3', ['-I', path.join(__dirname, 'baran-room-overview.py'), path.join(OUT, '_map.json')]); fs.rmSync(path.join(OUT, '_map.json')); } catch (e) { chk(false, '全体図：' + e.message); }
  console.log(`\n${ok} OK / ${ng} NG`);
  await b.close(); srv.close();
  process.exit(ng ? 1 : 0);
})();
