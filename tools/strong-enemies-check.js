// 隠しダンジョンの強敵6種の画面確認：node tools/strong-enemies-check.js [リポジトリ] [出力フォルダ]（幅360・390・430、390は録画）
// 見た目（仮）の一覧、ドラゴンの炎が間の敵で止まる（たけには届かない）／たけに当たる、爆弾岩の自爆、マドハンドの拘束、ミミックの正体
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..'), OUT = process.argv[3] || path.join(ROOT, 'tests', 'screenshots', 'strong-enemies'); fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type': {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'}[path.extname(f)]||'application/octet-stream'}); r.end(d); }); }).listen(8812);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
    const rec = w === 390 ? path.join(OUT, 'rec') : null;
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, recordVideo: rec ? { dir: rec, size: { width: w, height: h } } : undefined });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    const closeAll = () => p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; });
    const shot = (n) => p.screenshot({ path: path.join(OUT, `${n}_${w}.png`) });
    await p.goto('http://localhost:8812/'); await p.waitForTimeout(400);
    // 隠しダンジョン33階（強敵の階）。たけを大きな部屋の中に置き、ほかの敵は消す
    await p.evaluate(() => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village, st = V.story; st.introDone = true; V.seenIntro = true; st.chapter = 6;
      for (const k of ['croc', 'flame', 'kill', 'baran', 'mist', 'vearn', 'truevearn']) st.defeated[k] = true; st.endingDone = true;
      G.depart(S, 6060); const r = S.run; r.hidden = true; r.floor = 32; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' });
      const R2 = S.run; R2.player.hp = R2.player.maxhp = 3000; R2.player.lvl = 35; TS.Save.save(S); });
    await p.reload(); await p.waitForTimeout(600); await p.tap('#btn-continue'); await p.waitForTimeout(900); await closeAll();
    const setup = (spec) => p.evaluate((spec) => { const S = TS.UI.S, r = S.run, G = TS.Game;
      const room = r.map.rooms.slice().sort((a, b2) => b2.w * b2.h - a.w * a.h)[0];
      r.enemies = []; r.floorItems = []; r.hazards = []; r.player.bound = 0; r.player.boundBy = null; r.player.bindGuard = 0;
      r.player.x = room.x + 1; r.player.y = room.y + Math.min(2, room.h - 1); r.player.hp = r.player.maxhp;
      const out = {};
      for (const s of spec) { const e = G.makeEnemy(r, s.type, r.player.x + s.dx, r.player.y + s.dy); e.awake = true; if (s.sleep) e.sleep = 99; if (s.disguised) e.disguised = true; if (s.hp) e.hp = s.hp; e.cds = {}; r.enemies.push(e); out[s.key || s.type] = e.id; }
      G.updateVision(r); r.explored.fill(1); TS.UI.lockUntil = 0; return { room: [room.w, room.h], ids: out }; }, spec);
    // 1. 見た目の一覧（仮）：6種（ミミックは化けた姿と正体）
    const L = await setup([{ type: 'dragon', dx: 2, dy: 0, sleep: 1 }, { type: 'silverdevil', dx: 3, dy: 0, sleep: 1 }, { type: 'gigantes', dx: 4, dy: 0, sleep: 1 },
      { type: 'bombrock', dx: 2, dy: 1, sleep: 1 }, { type: 'madhand', dx: 3, dy: 1, sleep: 1 }, { type: 'mimic', dx: 4, dy: 1, sleep: 1 }, { type: 'mimic', key: 'mimic2', dx: 5, dy: 1, sleep: 1, disguised: 1 }]);
    await p.waitForTimeout(400);
    chk(L.room[0] >= 6, `${w} 大きい部屋 ${JSON.stringify(L.room)}`);
    await shot('1_lineup');
    // 2. ドラゴンの炎：間の敵（ギガンテス）で止まる。たけには届かない
    await setup([{ type: 'dragon', dx: 4, dy: 0 }, { type: 'gigantes', key: 'shield', dx: 2, dy: 0, sleep: 1 }]);
    await p.waitForTimeout(300);
    let hp0 = await p.evaluate(() => TS.UI.S.run.player.hp);
    await p.keyboard.press('Space'); await p.waitForTimeout(170);
    await shot('2_breath_shield');
    await p.waitForTimeout(500);
    let s = await p.evaluate(() => { const r = TS.UI.S.run, g = r.enemies.find((e) => e.type === 'gigantes'); return { hp: r.player.hp, g: g && g.hp, gmax: g && g.maxhp, log: r.log.slice(-3).join('/') }; });
    chk(s.hp >= hp0 && s.g < s.gmax && s.log.includes('当たって止まった'), `${w} ドラゴンの炎：間の敵に当たって止まり、たけには届かない ${JSON.stringify(s)}`);
    // 3. ドラゴンの炎：たけが最初ならたけに当たる
    await setup([{ type: 'dragon', dx: 4, dy: 0 }]); await p.waitForTimeout(300);
    hp0 = await p.evaluate(() => TS.UI.S.run.player.hp);
    await p.keyboard.press('Space'); await p.waitForTimeout(170); await shot('3_breath_player'); await p.waitForTimeout(500);
    s = await p.evaluate(() => ({ hp: TS.UI.S.run.player.hp }));
    chk(s.hp < hp0, `${w} ドラゴンの炎：たけが最初なら当たる（${hp0}→${s.hp}）`);
    // 4. 爆弾岩の自爆（隣で、残りが10%以下になる攻撃）
    await setup([{ type: 'bombrock', dx: 1, dy: 0, sleep: 1 }]);
    await p.evaluate(() => { const b2 = TS.UI.S.run.enemies[0]; b2.hp = Math.floor(b2.maxhp * 0.2); b2.def = 0; });
    await p.waitForTimeout(200);
    for (let i = 0; i < 10 && await p.evaluate(() => TS.UI.S.run.enemies.length); i++) { await p.evaluate(() => { const b2 = TS.UI.S.run.enemies[0]; if (b2 && b2.hp > b2.maxhp * 0.1 + 40) b2.hp = Math.floor(b2.maxhp * 0.1) + 30; TS.UI.lockUntil = 0; }); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(140); }
    await shot('4_bomb_explode'); await p.waitForTimeout(500);
    s = await p.evaluate(() => ({ left: TS.UI.S.run.enemies.length, log: TS.UI.S.run.log.slice(-4).join('/') }));
    chk(!s.left && (s.log.includes('自爆') || s.log.includes('たおした')), `${w} 爆弾岩：自爆または一撃で倒れる ${JSON.stringify(s)}`);
    // 5. マドハンド：つかまれる（拘束）
    await setup([{ type: 'madhand', dx: 1, dy: 0 }]); await p.waitForTimeout(200);
    for (let i = 0; i < 6 && !(await p.evaluate(() => TS.UI.S.run.player.bound)); i++) { await p.evaluate(() => { TS.UI.lockUntil = 0; TS.UI.S.run.player.hp = TS.UI.S.run.player.maxhp; }); await p.keyboard.press('Space'); await p.waitForTimeout(250); }
    await p.waitForTimeout(300); await shot('5_madhand_grab');
    s = await p.evaluate(() => ({ bound: TS.UI.S.run.player.bound, by: TS.UI.S.run.player.boundBy }));
    chk(s.bound > 0 && s.by, `${w} マドハンド：つかまれる ${JSON.stringify(s)}`);
    // 6. ミミック：お宝に化けている → 隣で正体
    await setup([{ type: 'mimic', dx: 2, dy: 0, disguised: 1 }]); await p.waitForTimeout(300);
    await shot('6_mimic_disguised');
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(250); await p.evaluate(() => { TS.UI.lockUntil = 0; }); await p.keyboard.press('Space'); await p.waitForTimeout(500);
    s = await p.evaluate(() => ({ disguised: TS.UI.S.run.enemies[0] && TS.UI.S.run.enemies[0].disguised }));
    chk(s.disguised === false, `${w} ミミック：隣に来ると正体を現す`);
    await closeAll(); await p.waitForTimeout(200); await shot('7_mimic_revealed');
    chk(!errs.length, `${w} エラーなし ${errs.join(' / ')}`);
    await ctx.close();
    if (rec) { const f = fs.readdirSync(rec).find((n) => n.endsWith('.webm')); if (f) fs.renameSync(path.join(rec, f), path.join(OUT, 'recording-390.webm')); }
  }
  await b.close(); srv.close();
  console.log('合計 OK', ok, 'NG', ng);
})();
