// 33階・真大魔王バーンの白い異空間：白い床の上で、攻撃の予告・たけとボス・撃破後の金の帰還魔法陣が見えるかの確認（PCのブラウザ、幅360・390・430）
//   node tools/truevearn-white-check.js [出力フォルダ]（既定 docs/truevearn-room-v1/）。覚醒ムービーは見た扱い（着くと、下の入口の列で広間の下の端から3マス上）
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
// PREVIEW=parts：パーツ方式のプレビュー（D.TRUEVEARN_ROOM_PREVIEW。絵は docs/truevearn-room-v1/preview/composite.png。本番では使わない）で同じことを確かめる（既定の出力 docs/truevearn-room-v1/preview/）
const PV = process.env.PREVIEW === 'parts', PV_IMG = 'docs/truevearn-room-v1/preview/composite.png';
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, 'docs', 'truevearn-room-v1', PV ? 'preview' : '');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8837;
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' }[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
const closeAll = (p) => p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; });
(async () => {
  const b = await chromium.launch();
  for (const [W, H] of [[360, 780], [390, 844], [430, 932]]) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.route('**/*.mp4', (route) => route.fulfill({ status: 404, body: '' }));
    await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(400);
    await p.evaluate((PV) => { localStorage.clear(); if (PV) TS.Data.TRUEVEARN_ROOM_LAYOUT = 'TRUEVEARN_ROOM_PREVIEW'; const G = TS.Game, S = G.newState(), V = S.village, st = V.story; st.introDone = true; V.seenIntro = true; st.chapter = 6;
      for (const k of ['croc', 'flame', 'kill', 'baran', 'mist', 'vearn']) st.defeated[k] = true;
      st.introSeen = { truevearn: true, truevearnAwaken: true };
      G.depart(S, 6161); const r = S.run; r.final.skip.vearn = true;
      while (r.floor < 33) { const t = r.stairs || r.crack; r.enemies = r.enemies.filter((e) => e.boss); r.player.x = t.x; r.player.y = t.y; G.act(S, { type: 'descend' }); }
      r.player.hp = r.player.maxhp = 9999; r.player.lvl = 30; TS.Save.save(S); }, PV);
    await p.reload(); await p.waitForTimeout(700);
    if (PV) await p.evaluate(async (src) => { const im = new Image(); im.src = src; await im.decode(); TS.Sprites.art.rooms.truevearnPreview = im; }, PV_IMG);
    await p.tap('#btn-continue'); await p.waitForTimeout(900); await closeAll(p);
    const a = await p.evaluate(() => { const r = TS.UI.S.run, A = r.bossFight; return { floor: r.floor, theme: TS.Game.F(r).theme, bg: r.map.bg || null, p: [r.player.x, r.player.y], A }; });
    chk(PV ? a.bg === 'TRUEVEARN_ROOM_PREVIEW' : !a.bg, `${W} ${PV ? 'パーツ方式のプレビュー' : '本番（コードで描く白い異空間）'} ${a.bg}`);
    chk(a.floor === 33 && a.theme === 'void' && a.p[1] === a.A.y + a.A.h - 4 && a.p[0] === a.A.x + (a.A.w >> 1), `${W} 33階の白い異空間に着くと、広間の下の端から3マス上（下の入口の列） ${JSON.stringify(a)}`);
    await p.screenshot({ path: path.join(OUT, `white-arrive_${W}.jpg`), quality: 85 });
    if (PV) {   // 上（玉座・上部の絵との境目）と下（通路・前室）の見え方
      for (const [n, dy] of [['top', 1], ['ante', 20]]) {
        await p.evaluate((dy) => { const r = TS.UI.S.run, A = r.bossFight, bo = r.enemies.find((e) => e.boss); bo.hold = 99; r.player.x = A.x + (A.w >> 1) - 2; r.player.y = A.y + dy - 1; r.explored.fill(1); TS.Game.updateVision(r); }, dy);
        await p.waitForTimeout(500);
        await p.screenshot({ path: path.join(OUT, `white-${n}_${W}.jpg`), quality: 85 });
      }
      await p.evaluate(() => { const r = TS.UI.S.run, A = r.bossFight; r.player.x = A.x + (A.w >> 1); r.player.y = A.y + A.h - 4; TS.Game.updateVision(r); });
    }
    // 戦闘中：ボスの前で、3×3の予告（見た目だけ。ターンは進めない）
    await p.evaluate(() => { const r = TS.UI.S.run, A = r.bossFight, bo = r.enemies.find((e) => e.boss); A.engaged = true; A.intro = 'done';
      bo.x = A.x + 7; bo.y = A.y + 6; bo.hold = 99; r.player.x = A.x + 7; r.player.y = A.y + 10; r.player.dir = 'up';
      bo.charge = { tiles: [], kind: null }; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) bo.charge.tiles.push({ x: bo.x + dx, y: bo.y + 2 + dy });
      TS.Game.updateVision(r); });
    await p.waitForTimeout(600);
    await p.screenshot({ path: path.join(OUT, `white-battle_${W}.jpg`), quality: 85 });
    // 撃破：帰還口（金の魔法陣）
    await p.evaluate(() => { const r = TS.UI.S.run, bo = r.enemies.find((e) => e.boss); bo.charge = null; bo.hp = 1; bo.hold = 0; bo.sleep = 50; r.player.x = bo.x; r.player.y = bo.y + 1; TS.Game.updateVision(r); });
    for (let i = 0; i < 15 && await p.evaluate(() => TS.UI.S.run.enemies.some((e) => e.boss)); i++) { await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; TS.UI.doAct({ type: 'move', dir: 'up' }); }); await p.waitForTimeout(200); }
    for (let i = 0; i < 40 && !(await p.evaluate(() => !!TS.UI.S.run.portal)); i++) { await p.waitForTimeout(150); await closeAll(p); }
    for (let i = 0; i < 8; i++) { await p.waitForTimeout(150); await closeAll(p); }   // 撃破の会話
    const th = await p.evaluate(() => TS.Game.themeOf(TS.UI.S.run));
    chk(th === 'void', `${W} 倒したあとも白い異空間のまま（${th}）`);
    const P = await p.evaluate(() => { const r = TS.UI.S.run, P = r.portal; if (P) { r.player.x = P.x - 1; r.player.y = P.y + 1; TS.Game.updateVision(r); } return P && TS.Game.inArena(r, P.x, P.y); });
    await p.waitForTimeout(1200);
    chk(P, `${W} 撃破後：帰還口は広間の床`);
    await p.screenshot({ path: path.join(OUT, `white-portal_${W}.jpg`), quality: 85 });
    chk(!errs.length, `${W} エラーなし ${errs.join(' / ')}`);
    await ctx.close();
  }
  console.log(`\n${ok} OK / ${ng} NG`);
  await b.close(); srv.close(); process.exit(ng ? 1 : 0);
})();
