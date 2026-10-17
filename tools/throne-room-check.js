// 30階・玉座の間の画面確認：node tools/throne-room-check.js [リポジトリ] [出力フォルダ]（幅360・390・430）
// 入口（下の通路）→ 上へ歩いて入室 → 戦闘前（登場ムービーは見た扱い）→ 戦闘中（予告の範囲）→ 撃破 → 撃破後ムービー（読み込み失敗で先へ）→ 亀裂が残る → 救援 → 亀裂へ歩く
// 確かめること：背景の絵が出る（タイルではない）・玉座や柱に入れない・亀裂は戦闘前に無く、ムービーのあとに出る・亀裂のまわりに黒い四角が出ない・読み込み直しで消えない
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..'), OUT = process.argv[3] || path.join(ROOT, 'tests', 'screenshots', 'throne-room'); fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type': {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.mp4':'video/mp4'}[path.extname(f)]||'application/octet-stream'}); r.end(d); }); }).listen(8808);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[360, 780], [390, 844], [430, 932]].filter(([w]) => !process.env.ONLY || +process.env.ONLY === w)) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); if (process.env.DBG) p.on('framenavigated', (f) => console.log('nav', f.url(), new Error().stack.split('\n')[2]));
    await p.route('**/vearn-taken.mp4', (route) => route.fulfill({ status: 404, body: '' }));   // このPCは H.264 を流せないので、ムービーは読み込み失敗で先へ（失敗でも同じ状態に進むことの確認を兼ねる）
    const closeTalk = async () => { for (let i = 0; i < 40 && await p.$('.talk'); i++) { await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(60); } };
    const shot = (n) => p.screenshot({ path: path.join(OUT, `${n}_${w}.png`) });
    const st = () => p.evaluate(() => { const r = TS.UI.S.run; return { floor: r.floor, pos: [r.player.x, r.player.y], turn: r.turn, crack: r.crack, pm: r.postMovie || null, vearn: r.enemies.some((e) => e.type === 'vearn'),
      engaged: !!(r.bossFight && r.bossFight.engaged), rescue: r.final && r.final.rescue, bg: !!TS.Sprites.art.rooms.throneBg, crackImg: !!TS.Sprites.art.rooms.crack, modal: TS.UI.modals.length }; });
    await p.goto('http://localhost:8808/'); await p.waitForTimeout(400);
    await p.evaluate(() => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village; V.story.introDone = true; V.seenIntro = true; V.story.chapter = 6;
      for (const k of ['croc', 'flame', 'kill', 'baran', 'mist']) V.story.defeated[k] = true;
      V.story.introSeen = { vearn: true };   // 登場ムービーは intro-titled-check.js で確かめる
      G.depart(S, 4242); while (S.run.floor < 30) { const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      S.run.player.hp = S.run.player.maxhp = 900; S.run.player.lvl = 30; TS.Save.save(S); });
    await p.reload(); await p.waitForTimeout(600); await p.tap('#btn-continue'); await p.waitForTimeout(900); await closeTalk();
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); });
    await p.waitForTimeout(400);
    let s = await st();
    chk(s.floor === 30 && s.bg && s.crackImg && !s.crack && !s.engaged, `${w} 30階の入口：背景の絵・亀裂の絵を読み込み済み・亀裂はまだ無い ${JSON.stringify(s)}`);
    await shot('1_entrance');
    // 上へ歩いて入室（通路をまっすぐ）
    for (let i = 0; i < 8 && !(await st()).engaged; i++) { await p.tap('#dpad [data-dir="up"]'); await p.waitForTimeout(220); await closeTalk(); }
    s = await st();
    chk(s.engaged && s.vearn, `${w} 下の通路から上へ歩いて入室し、戦いが始まる ${JSON.stringify(s)}`);
    await p.waitForTimeout(500); await closeTalk(); await p.waitForTimeout(300);
    await shot('2_before_fight');
    // 玉座・柱に入れない：広間のいちばん上の列から上へは動けない
    const blocked = await p.evaluate(() => { const r = TS.UI.S.run, G = TS.Game, T = TS.Data.THRONE_ROOM; const out = [];
      for (let x = T.hall.x; x < T.hall.x + T.hall.w; x++) out.push(G.canStep(r.map, x, T.hall.y, 0, -1));
      for (let y = T.hall.y; y < T.hall.y + T.hall.h; y++) out.push(G.canStep(r.map, T.hall.x, y, -1, 0), G.canStep(r.map, T.hall.x + T.hall.w - 1, y, 1, 0));
      return out.some(Boolean); });
    chk(!blocked, `${w} 玉座の段・左右の柱と炎の台へは入れない`);
    // 戦闘中：ボスの攻撃の予告（範囲）が見える位置で撮る
    const tele = await p.evaluate(() => { const S = TS.UI.S, r = S.run, b = r.enemies.find((e) => e.boss); r.player.x = b.x; r.player.y = b.y + 3; TS.Game.updateVision(r); b.cds = {}; return true; });
    for (let i = 0; i < 12; i++) { const has = await p.evaluate(() => TS.UI.S.run.enemies.some((e) => e.charge)); if (has) break; await p.tap('#dpad [data-dir="down"]').catch(() => {}); await p.waitForTimeout(160); await p.evaluate(() => { const r = TS.UI.S.run; r.player.hp = r.player.maxhp; }); }
    await shot('3_fight');
    // 撃破：HPを1にして隣から攻撃
    const dir = await p.evaluate(() => { const r = TS.UI.S.run, G = TS.Game, b = r.enemies.find((e) => e.boss); b.hp = 1; b.sleep = 99; b.charge = null; r.hazards = []; r.enemies = r.enemies.filter((e) => e === b);
      for (const [d, [dx, dy]] of Object.entries(G.DIRS)) { if (!['up', 'down', 'left', 'right'].includes(d)) continue; const x = b.x - dx, y = b.y - dy; if (G.canStep(r.map, x, y, dx, dy) && !G.enemyAt(r, x, y)) { r.player.x = x; r.player.y = y; G.updateVision(r); return d; } } });
    await p.waitForTimeout(250);
    await p.tap(`#dpad [data-dir="${dir}"]`); await p.waitForTimeout(300);
    s = await st();
    chk(!s.vearn && s.pm === 'vearnTaken' && s.crack && s.crack.kind === 'throne30', `${w} 撃破：亀裂は決まって保存済み・ムービーの予約 ${JSON.stringify(s)}`);
    await shot('4_defeat_effect');
    // ムービー（読み込み失敗）→ 救援
    for (let i = 0; i < 60 && !(await p.evaluate(() => !!document.querySelector('.modal h2') && document.querySelector('.modal h2').textContent.includes('ティウの救援'))); i++) { await closeTalk(); await p.waitForTimeout(100); }
    s = await st();
    chk(!s.pm && s.rescue === 'pending' && s.crack, `${w} ムービーのあと：同じ部屋で救援へ・亀裂は残る ${JSON.stringify(s)}`);
    await shot('5_after_movie_rescue');
    // 救援を終える（何も選ばずに確定）
    await p.evaluate(() => { TS.Game.commitRescue(TS.UI.S); TS.Save.save(TS.UI.S); while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; });
    await p.waitForTimeout(500); await closeTalk(); await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; });
    // 読み込み直しても亀裂は消えない
    await p.reload(); await p.waitForTimeout(600); await p.tap('#btn-continue'); await p.waitForTimeout(900); await closeTalk();
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; });
    s = await st();
    chk(s.crack && s.crack.kind === 'throne30' && s.rescue === 'done' && !s.modal, `${w} 読み込み直し：亀裂はそのまま・救援は重ならない ${JSON.stringify(s)}`);
    await p.waitForTimeout(300);
    await shot('6_after_defeat');
    // 亀裂のまわりに黒い四角が出ない：亀裂の絵の枠の四隅の少し内側（透明な余白）の色を、亀裂を描いたとき・描かないときで比べる（暗くならない）
    await p.evaluate(() => { const r = TS.UI.S.run; r.player.x = r.crack.x; r.player.y = r.crack.y + 2; TS.Game.updateVision(r); });
    await p.waitForTimeout(400);
    const sample = (c) => p.evaluate((c) => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const cv = document.getElementById('dungeon-canvas') || document.querySelector('canvas'), g = cv.getContext('2d'), r = TS.UI.S.run;
      const ts = Math.max(32, Math.floor(Math.min(cv.width / 9.5, cv.height / 7.5) / 16) * 16), ox = Math.round(cv.width / 2 - (r.player.x + 0.5) * ts), oy = Math.round(cv.height / 2 - (r.player.y + 0.5) * ts);
      const img = TS.Sprites.art.rooms.crack, hh = ts * 2.4, ww = hh * img.width / img.height, cx = ox + (c.x + 0.5) * ts, by = oy + (c.y + 1) * ts + ts * 0.12;
      const pts = [[cx - ww / 2 + 3, by - hh + 3], [cx + ww / 2 - 4, by - hh + 3], [cx - ww / 2 + 3, by - 4], [cx + ww / 2 - 4, by - 4]];
      res(pts.map(([x, y]) => { const d = g.getImageData(Math.round(x), Math.round(y), 1, 1).data; return d[0] + d[1] + d[2]; }));
    }))), c);
    const c0 = await p.evaluate(() => TS.UI.S.run.crack);
    const withC = await sample(c0);
    await shot('6b_crack_close');
    const keep = await p.evaluate(() => { const c = TS.UI.S.run.crack; TS.UI.S.run.crack = null; return c; });
    const without = await sample(c0);
    await p.evaluate((c) => { TS.UI.S.run.crack = c; }, keep);
    const dark = withC.map((v, i) => v - without[i]);
    chk(dark.every((v) => v > -30), `${w} 亀裂の絵の四隅（透明な余白）に黒い四角が出ない（亀裂あり ${withC.join(',')} ／なし ${without.join(',')}）`);
    // 亀裂へ歩いて行ける（地図上で到達できる）→ 乗ると確認が出る
    const reach = await p.evaluate(() => { const r = TS.UI.S.run, DG = TS.Dungeon; return DG.distances(r.map, r.player.x, r.player.y)[r.crack.y * r.map.w + r.crack.x]; });
    chk(reach >= 0, `${w} 亀裂へ歩いて行ける（${reach}歩）`);
    await p.evaluate(() => { const r = TS.UI.S.run; r.player.x = r.crack.x; r.player.y = r.crack.y + 1; TS.Game.updateVision(r); });
    await p.waitForTimeout(200); await p.tap('#dpad [data-dir="up"]'); await p.waitForTimeout(500);
    const prompt = await p.evaluate(() => { const m = document.querySelector('.modal'); return m ? m.textContent : ''; });
    chk(prompt.includes('時空の亀裂') && prompt.includes('地下31階'), `${w} 亀裂に乗ると確認が出る`);
    await shot('7_on_crack');
    // 真大魔王バーンを倒したあと：同じ亀裂が隠しダンジョンの入口になる（まだ無いので「準備中」。入れない）
    await p.tap('.modal-buttons button >> text=まだ探索する'); await p.waitForTimeout(300);
    await p.evaluate(() => { TS.UI.S.village.story.defeated.truevearn = true; const r = TS.UI.S.run; r.player.y = r.crack.y + 1; TS.Game.updateVision(r); TS.UI.lockUntil = 0; });
    await p.waitForTimeout(200); await p.tap('#dpad [data-dir="up"]'); await p.waitForTimeout(500);
    const hid = await p.evaluate(() => { const m = document.querySelector('.modal'); return { text: m ? m.textContent : '', state: TS.Game.crackState(TS.UI.S) }; });
    chk(hid.state === 'hiddenNotReady' && hid.text.includes('隠しダンジョンは準備中'), `${w} 真大魔王バーン撃破後：同じ亀裂は隠しダンジョンの入口（準備中で入れない） ${JSON.stringify(hid.state)}`);
    if (w === 390) await shot('8_crack_after_truevearn');
    await p.tap('.modal-buttons button:last-child'); await p.waitForTimeout(300);
    await p.evaluate(() => { TS.UI.S.village.story.defeated.truevearn = false; const r = TS.UI.S.run; r.player.y = r.crack.y + 1; TS.Game.updateVision(r); TS.UI.lockUntil = 0; });
    await p.waitForTimeout(200); await p.tap('#dpad [data-dir="up"]'); await p.waitForTimeout(500);
    await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(700);
    chk((await st()).floor === 31, `${w} 真大魔王バーンを倒す前：亀裂から31階へ`);
    chk(!errs.length, `${w} エラーなし ${errs.join(' / ')}`);
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log('合計 OK', ok, 'NG', ng);
})();
