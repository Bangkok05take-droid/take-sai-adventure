// 隠しダンジョンの画面確認：node tools/hidden-dungeon-check.js [リポジトリ] [出力フォルダ]（幅360・390・430）
// 真大魔王バーン撃破後の30階 → 亀裂から入る → 31階（部屋が広い）→ 33階（強敵）→ 35階（竜人王バラン）
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..'), OUT = process.argv[3] || path.join(ROOT, 'tests', 'screenshots', 'hidden-dungeon'); fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type': {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'}[path.extname(f)]||'application/octet-stream'}); r.end(d); }); }).listen(8810);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    const closeAll = () => p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; });
    const shot = (n) => p.screenshot({ path: path.join(OUT, `${n}_${w}.png`) });
    await p.goto('http://localhost:8810/'); await p.waitForTimeout(400);
    // クリア後の探索：30階の亀裂の手前から
    await p.evaluate(() => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village, st = V.story; st.introDone = true; V.seenIntro = true; st.chapter = 6;
      for (const k of ['croc', 'flame', 'kill', 'baran', 'mist', 'vearn', 'truevearn']) st.defeated[k] = true; st.endingDone = true; st.finalStage = 'won';
      G.takeReturnScroll(S); G.depart(S, 5353); while (S.run.floor < 30) { const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      const r = S.run; r.player.hp = r.player.maxhp = 2000; r.player.lvl = 35; r.player.x = r.crack.x; r.player.y = r.crack.y + 1; G.updateVision(r); TS.Save.save(S); });
    await p.reload(); await p.waitForTimeout(600); await p.tap('#btn-continue'); await p.waitForTimeout(900); await closeAll(); await p.waitForTimeout(300);
    await p.tap('#dpad [data-dir="up"]'); await p.waitForTimeout(500);
    const txt = await p.evaluate(() => document.querySelector('.modal') ? document.querySelector('.modal').textContent : '');
    chk(txt.includes('時空の狭間') && txt.includes('地下31階から'), `${w} 30階の亀裂：隠しダンジョンへの確認`);
    if (w === 390) await shot('1_crack_prompt');
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(800); await closeAll(); await p.waitForTimeout(300);
    let s = await p.evaluate(() => { const r = TS.UI.S.run, F = TS.Game.F(r); return { floor: r.floor, hidden: !!r.hidden, w: r.map.w, h: r.map.h, rp: !!r.returnPoint, area: TS.Game.areaName(F), rooms: r.map.rooms.map((m) => m.w * m.h) }; });
    chk(s.floor === 31 && s.hidden && s.w === 45 && !s.rp && s.area === '時空の狭間', `${w} 31階：隠しダンジョン（広い地図・帰還の祠なし） ${JSON.stringify(s)}`);
    await shot('2_floor31');
    // 33階（強敵）：敵を見える所に置いて撮る
    await p.evaluate(() => { const S = TS.UI.S, G = TS.Game; while (S.run.floor < 33) { const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      const r = S.run, room = TS.Dungeon.roomAt(r.map, r.player.x, r.player.y); const e = r.enemies[0]; if (e && room) { e.x = Math.min(room.x + room.w - 1, r.player.x + 2); e.y = r.player.y; e.sleep = 99; } G.updateVision(r); TS.UI.lockUntil = 0; });
    await p.waitForTimeout(500);
    s = await p.evaluate(() => { const r = TS.UI.S.run, F = TS.Game.F(r); return { floor: r.floor, mul: F.enemyMul, log: r.log.slice(-3).join('/'), rp: !!r.returnPoint }; });
    chk(s.floor === 33 && s.mul > 1 && s.log.includes('強敵の気配') && !s.rp, `${w} 33階：強敵の階 ${JSON.stringify(s)}`);
    await shot('3_floor33_strong');
    // 35階：竜人王バラン
    await p.evaluate(() => { const S = TS.UI.S, G = TS.Game; while (S.run.floor < 35) { const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      const r = S.run, A = r.bossFight; r.player.x = A.x + 2; r.player.y = A.y + (A.h >> 1); G.updateVision(r); G.checkBossRoom(S, []); TS.UI.lockUntil = 0; });
    await p.waitForTimeout(600); await closeAll(); await p.waitForTimeout(300);
    s = await p.evaluate(() => { const r = TS.UI.S.run, b = r.enemies.find((e) => e.boss); return { floor: r.floor, boss: b && b.type, name: b && TS.Data.ENEMIES[b.type].name, arena: r.bossFight.w + 'x' + r.bossFight.h, rp: !!r.returnPoint }; });
    chk(s.floor === 35 && s.boss === 'dragonbaran' && s.arena === '21x21' && !s.rp, `${w} 35階：竜人王バラン（広いボス部屋） ${JSON.stringify(s)}`);
    await shot('4_floor35_dragonking');
    chk(!errs.length, `${w} エラーなし ${errs.join(' / ')}`);
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log('合計 OK', ok, 'NG', ng);
})();
