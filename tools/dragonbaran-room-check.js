// 竜魔神バランの部屋（1枚絵。2026年11月17日）の確認：node tools/dragonbaran-room-check.js [出力フォルダ]（既定 docs/dragonbaran-room/）。幅360・390・430
// 35階に着く（入口）→ 部屋に入る（ムービーはスキップ）→ 戦い → 倒す → 帰還口。地図の通れるマスに薄い枠を重ねた確認用の画像も撮る
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, 'docs', 'dragonbaran-room');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(8862);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
(async () => {
  const b = await chromium.launch();
  for (const w of [360, 390, 430]) {
    const p = await (await b.newContext({ viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://localhost:8862/'); await p.waitForTimeout(300);
    await p.evaluate(() => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village, st = V.story; st.introDone = true; V.seenIntro = true; st.chapter = 6;
      for (const k of ['croc', 'flame', 'kill', 'baran', 'mist', 'vearn', 'truevearn']) st.defeated[k] = true; st.endingDone = true; st.finalStage = 'won';
      G.takeReturnScroll(S); G.depart(S, 5353); while (S.run.floor < 30) { const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      const r = S.run; r.player.x = r.crack.x; r.player.y = r.crack.y; G.act(S, { type: 'descend' });
      while (S.run.floor < 35) { const q = S.run; q.player.x = q.stairs.x; q.player.y = q.stairs.y; G.act(S, { type: 'descend' }); }
      const q = S.run; q.player.hp = q.player.maxhp = 9999; q.player.lvl = 50; TS.Save.save(S); });
    await p.reload(); await p.waitForTimeout(700); await p.tap('#btn-continue'); await p.waitForTimeout(1500);
    const closeAll = () => p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; });
    await closeAll();
    const st = await p.evaluate(() => { const r = TS.UI.S.run; return { floor: r.floor, bg: r.map.bg, img: !!TS.Sprites.art.rooms.dragonbaranBg, start: [r.player.x, r.player.y] }; });
    chk(st.floor === 35 && st.bg === 'DRAGONBARAN_ROOM' && st.img, `${w} 35階は1枚絵の部屋 ${JSON.stringify(st)}`);
    await p.waitForTimeout(500);
    if (w === 390) await p.screenshot({ path: path.join(OUT, '1_entrance.jpg'), quality: 85 });
    // 上へ歩いて部屋に入る（ムービーはスキップ）
    for (let i = 0; i < 8; i++) { await p.evaluate(() => { TS.UI.lockUntil = 0; }); await p.keyboard.press('ArrowUp'); await p.waitForTimeout(160);
      await p.evaluate(() => { const s = document.querySelector('.movie-skip'); if (s) s.click(); }); }
    await p.waitForTimeout(1500); await p.evaluate(() => { const s = document.querySelector('.movie-skip'); if (s) s.click(); }); await p.waitForTimeout(1200); await closeAll();
    const f = await p.evaluate(() => { const r = TS.UI.S.run; return { engaged: !!r.bossFight.engaged, pos: [r.player.x, r.player.y] }; });
    chk(f.engaged, `${w} 部屋に入って戦いが始まる ${JSON.stringify(f)}`);
    await p.waitForTimeout(400);
    if (w === 390) {
      await p.screenshot({ path: path.join(OUT, '2_battle.jpg'), quality: 85 });
    }
    // 倒す → 帰還口
    await p.evaluate(() => { const r = TS.UI.S.run, b = r.enemies.find((e) => e.boss); b.hp = 1; b.def = 0; b.charge = null; b.x = r.player.x; b.y = r.player.y - 1; b.sleep = 9; TS.UI.lockUntil = 0; });
    for (let i = 0; i < 20 && await p.evaluate(() => TS.UI.S.run.enemies.some((e) => e.boss)); i++) { await p.evaluate(() => { TS.UI.lockUntil = 0; }); await p.keyboard.press('ArrowUp'); await p.waitForTimeout(300); await closeAll(); }
    await p.waitForTimeout(2500); await closeAll();
    chk(await p.evaluate(() => !TS.UI.S.run.enemies.some((e) => e.boss) && !!TS.UI.S.run.portal), `${w} 倒すと帰還口`);
    if (w === 390) await p.screenshot({ path: path.join(OUT, '3_after.jpg'), quality: 85 });
    chk(!errs.length, `${w} エラーなし ${errs.join(' / ')}`);
    await p.context().close();
  }
  await b.close(); srv.close(); console.log(`\n${ok} OK / ${ng} NG`);
})();
