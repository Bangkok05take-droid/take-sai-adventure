// レア敵メタルキング（2026年11月17日）の画面確認：node tools/metal-king-check.js [出力フォルダ]（既定 docs/metal-king/）。幅360・390・430
// 約2×2マスの絵・足元の輪（当たり判定のマス）・予告（魔力が膨れ上がる）→ イオナズン（画面全体の爆発・ダメージ1回）→ 逃走（光に包まれて消える）。
// 爆発の間の描画の重さ（1フレームの時間）も測る
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, 'docs', 'metal-king');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(8861);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
(async () => {
  const b = await chromium.launch();
  for (const w of [360, 390, 430]) {
    const p = await (await b.newContext({ viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://localhost:8861/'); await p.waitForTimeout(300);
    await p.evaluate(() => { localStorage.clear(); const G = TS.Game, S = G.newState(); S.village.story.introDone = true; S.village.seenIntro = true; S.village.story.chapter = 6;
      G.takeReturnScroll(S); G.depart(S, 424242); while (S.run.floor < 22) { const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      const r = S.run; r.player.hp = r.player.maxhp = 400; r.player.lvl = 25; TS.Save.save(S); });
    await p.reload(); await p.waitForTimeout(700); await p.tap('#btn-continue'); await p.waitForTimeout(1200);
    const closeAll = () => p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; });
    await closeAll();
    // 部屋の中で、たけから4マス右（見える所）にメタルキングを置く
    const placed = await p.evaluate(() => { const S = TS.UI.S, r = S.run, G = TS.Game, DG = TS.Dungeon, pl = r.player;
      r.enemies = []; const room = r.map.rooms.find((m) => m.w >= 7 && m.h >= 3) || r.map.rooms[0];
      pl.x = room.x + 1; pl.y = room.y + (room.h >> 1); const k = G.makeEnemy(r, 'mking', pl.x + 4, pl.y); r.enemies.push(k); G.updateVision(r); TS.UI.lockUntil = 0;
      return { vis: G.isVisible(r, k.x, k.y), art: !!(TS.Sprites.art.enemies.mking) }; });
    chk(placed.vis && placed.art, `${w} メタルキングの絵が読めて、見える所にいる ${JSON.stringify(placed)}`);
    await p.waitForTimeout(400);
    if (w === 390) await p.screenshot({ path: path.join(OUT, '1_king.jpg'), quality: 85 });
    const space = async () => { await p.evaluate(() => { TS.UI.lockUntil = 0; }); await p.tap('#b-wait'); await p.waitForTimeout(350); await closeAll(); };
    await space(); await space();
    const ch = await p.evaluate(() => { const k = TS.UI.S.run.enemies[0]; return { charge: !!(k && k.charge), toast: document.getElementById('toast').textContent }; });
    chk(ch.charge, `${w} 予告（魔力が膨れ上がる） ${JSON.stringify(ch)}`);
    if (w === 390) { await p.waitForTimeout(300); await p.screenshot({ path: path.join(OUT, '2_charge.jpg'), quality: 85 }); }
    await space();
    const hp0 = await p.evaluate(() => TS.UI.S.run.player.hp);
    // 発動：フレームの時間を測りながら
    await p.evaluate(() => { window.__ft = []; let last = performance.now(); const tick = (t) => { window.__ft.push(t - last); last = t; if (window.__ft.length < 120) requestAnimationFrame(tick); }; requestAnimationFrame(tick); TS.UI.lockUntil = 0; });
    await p.tap('#b-wait');
    if (w === 390) { for (const [i, t] of [[0, 180], [1, 420], [2, 800]]) { await p.waitForTimeout(t - (i ? [180, 420][i - 1] : 0)); await p.screenshot({ path: path.join(OUT, `3_iona_${i}.jpg`), quality: 80 }); } }
    await p.waitForTimeout(1600); await closeAll();
    const af = await p.evaluate((hp0) => { const r = TS.UI.S.run; const ft = window.__ft.slice(2).sort((a, b) => a - b); return { dmg: hp0 - r.player.hp, cd: r.enemies[0] && r.enemies[0].cd, ionaLog: r.log.filter((l) => l.includes('イオナズン')).length, p90: Math.round(ft[Math.floor(ft.length * 0.9)]) }; }, hp0);
    chk(af.dmg >= 30 && af.dmg <= 40 && af.cd === 5, `${w} イオナズン：ダメージ1回 ${JSON.stringify(af)}`);
    chk(af.p90 < 60, `${w} 爆発の間も重くない（フレームの90%が ${af.p90}ms 以内）`);
    // 近づいて逃走：近い所に置き直して、逃げるまで足踏み
    await p.evaluate(() => { const r = TS.UI.S.run, k = r.enemies[0]; k.x = r.player.x + 2; k.charge = null; k.cd = 3; TS.Game.updateVision(r); });
    let warped = false;
    for (let i = 0; i < 40 && !warped; i++) { await p.evaluate(() => { TS.UI.lockUntil = 0; }); await p.tap('#b-wait'); await p.waitForTimeout(120);
      warped = await p.evaluate(() => !TS.UI.S.run.enemies.some((e) => e.type === 'mking')); }
    chk(warped, `${w} 近づくと光に包まれて消える`);
    if (w === 390) { await p.waitForTimeout(250); await p.screenshot({ path: path.join(OUT, '4_warp.jpg'), quality: 85 }); }
    await p.waitForTimeout(1300); await closeAll();
    chk(!errs.length, `${w} エラーなし ${errs.join(' / ')}`);
    await p.context().close();
  }
  await b.close(); srv.close(); console.log(`\n${ok} OK / ${ng} NG`);
})();
