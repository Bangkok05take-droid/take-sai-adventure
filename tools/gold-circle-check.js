// ボス撃破後の帰還口：金の魔法陣（ZIP gold_return_circle_v1）の確認と録画：node tools/gold-circle-check.js [出力フォルダ]（既定 docs/gold-return-circle/）
// 確かめること（PCのブラウザ、幅360・390・430。390は録画）：
//  第1章のクロコダインを倒す → 帰還口に金の魔法陣（古い渦巻きは描かない・床の上・たけは魔法陣より手前）・待機の明滅と金の粒
//  帰還口に乗って「村へ帰る」→ 光の柱 → 暗転 → 村で明るくなる。演出の間はターン・HP・満腹度が進まず、入力も受けない
//  帰還の処理は1回だけ：章クリア・報酬（拾わなかった涙と斧は倉庫へ1個ずつ）・お金は今までどおり
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, 'docs', 'gold-return-circle');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8831;
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp4': 'video/mp4' }[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };

async function boot(p) {
  await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(400);
  await p.evaluate(() => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village; V.story.introDone = true; V.seenIntro = true;
    G.depart(S, 4242); const r = S.run; r.player.hp = r.player.maxhp = 9999;
    while (S.run.floor < G.maxFloor(S.run)) { const q = S.run; q.player.x = q.stairs.x; q.player.y = q.stairs.y; G.act(S, { type: 'descend' }); }
    TS.Save.save(S); });
  await p.reload(); await p.waitForTimeout(700); await p.tap('#btn-continue'); await p.waitForTimeout(900);
  await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; });
}
const closeTalk = async (p) => { for (let i = 0; i < 30 && await p.$('.talk'); i++) { await p.tap('.talk').catch(() => {}); await p.waitForTimeout(120); } };

(async () => {
  const b = await chromium.launch();
  for (const [W, H] of [[360, 780], [390, 844], [430, 932]]) {
    const rec = W === 390, dir = path.join(OUT, '_rec');
    const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, recordVideo: rec ? { dir, size: { width: W, height: H } } : undefined });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    const t0 = Date.now();
    await boot(p);
    // ボスとの戦いを始めたことにして（登場ムービー・会話はとばす）、HP1のボスの隣へ
    await p.evaluate(() => { const r = TS.UI.S.run, G = TS.Game, A = r.bossFight, bo = r.enemies.find((e) => e.boss);
      A.engaged = true; A.intro = 'done'; bo.hp = 1; bo.cds = { rush: 9, axe: 9 }; r.player.x = bo.x - 1; r.player.y = bo.y; G.updateVision(r); TS.UI.lockUntil = 0; });
    const mark = Date.now();
    for (let i = 0; i < 10 && await p.evaluate(() => TS.UI.S.run.enemies.some((e) => e.boss)); i++) { await p.tap('#dpad [data-dir="right"]'); await p.waitForTimeout(200); }
    await p.waitForTimeout(300);
    // 開いた直後（出現：0.45秒で透明→表示）
    const appear = await p.evaluate(() => { const s = TS.Render.portalShown, r = TS.UI.S.run; return { shown: !!s && s.key.endsWith(r.portal.x + ',' + r.portal.y), portal: r.portal }; });
    chk(appear.shown, `${W} 帰還口が開くと、金の魔法陣の出現の動き ${JSON.stringify(appear)}`);
    await p.waitForTimeout(500); await closeTalk(p);
    // 帰還口の隣へ（同じ部屋の床）。魔法陣の待機の様子
    const stepDir = await p.evaluate(() => { const r = TS.UI.S.run, G = TS.Game;
      for (const [d, [dx, dy]] of Object.entries(G.DIRS)) { if (dx === 0 || dy !== 0) continue; const x = r.portal.x - dx, y = r.portal.y - dy;
        if (G.canStep(r.map, x, y, dx, dy) && !G.enemyAt(r, x, y) && !G.itemAt(r, x, y)) { r.player.x = x; r.player.y = y; G.updateVision(r); return d; } } });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: path.join(OUT, `idle_${W}.jpg`), quality: 88 });
    // 古い渦巻きは描かない・魔法陣の絵を床の層で描く（たけより先）
    const order = await p.evaluate(() => { const SP = TS.Sprites, img = SP.art.rooms.goldCircle, old = new Set(SP.tiles.portal); const seq = [];
      const o = CanvasRenderingContext2D.prototype.drawImage; CanvasRenderingContext2D.prototype.drawImage = function (im, ...a) { seq.push(im === img ? 'circle' : old.has(im) ? 'swirl' : im && im.width ? 'x' : '?'); return o.call(this, im, ...a); };
      const c = document.getElementById('dungeon-canvas'); TS.Render.drawDungeon(c, TS.UI.S, performance.now()); CanvasRenderingContext2D.prototype.drawImage = o;
      return { circle: seq.filter((x) => x === 'circle').length, swirl: seq.filter((x) => x === 'swirl').length, w: img.width, h: img.height }; });
    chk(order.circle === 1 && order.swirl === 0 && order.w === 128, `${W} 金の魔法陣を1回だけ描く・古い渦巻きは描かない ${JSON.stringify(order)}`);
    await p.tap(`#dpad [data-dir="${stepDir}"]`); await p.waitForTimeout(300);
    chk(await p.isVisible('.modal h2:has-text("帰還口")'), `${W} 帰還口の確認はそのまま`);
    await p.screenshot({ path: path.join(OUT, `on-circle_${W}.jpg`), quality: 88 });
    // 帰る直前（帰還口の上・確認の画面）の状態
    const before = await p.evaluate(() => { const S = TS.UI.S, r = S.run, V = S.village; return { turn: r.turn, hp: r.player.hp, full: r.player.hunger, funds: V.funds, gold: r.runGold, st: V.storage.map((i) => i.id).sort().join(), floor: r.floorItems.filter((f) => f.item && f.item.bossReward).map((f) => f.item.id).sort().join() }; });
    await p.tap('.modal-buttons button.primary');
    // 演出の途中：ターン・HP・満腹度は進まない。入力（足踏み・足元）は受けない
    await p.waitForTimeout(150);
    await p.keyboard.press('Space');
    { const bb = await p.locator('#b-foot').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }   // 足元のボタンの位置を押す（覆いが受け止める）
    await p.waitForTimeout(120);
    const mid = await p.evaluate(() => { const r = TS.UI.S.run; return { turn: r.turn, hp: r.player.hp, full: r.player.hunger, go: TS.Render.fx.some((f) => f.t === 'portalgo'), modals: TS.UI.modals.length, over: r.over }; });
    chk(mid.go && mid.turn === before.turn && mid.hp === before.hp && mid.full === before.full && !mid.modals && !mid.over, `${W} 演出の間はゲームが進まず、入力を受けない ${JSON.stringify(mid)}`);
    if (rec) await p.screenshot({ path: path.join(OUT, `pillar_${W}.jpg`), quality: 88 });
    await p.waitForTimeout(560);   // 0.65秒から0.3秒で暗くなる
    const dark = await p.evaluate(() => { const c = document.querySelector('.scene-cover'); return c && +getComputedStyle(c).opacity; });
    chk(dark > 0.3, `${W} 暗転 ${dark}`);
    for (let i = 0; i < 30 && !(await p.evaluate(() => TS.UI.screen === 'village')); i++) await p.waitForTimeout(100);
    await p.waitForTimeout(450);
    const after = await p.evaluate(() => { const S = TS.UI.S, V = S.village; return { screen: TS.UI.screen, run: !!S.run, cover: !!document.querySelector('.scene-cover'), ret: !!(V.story.returnDone || {}).croc,
      st: V.storage.map((i) => i.id).sort().join(), funds: V.funds, going: !!TS.UI.portalGoing }; });
    const want = before.st.split(',').filter(Boolean).concat(before.floor.split(',').filter(Boolean)).sort().join();
    chk(after.screen === 'village' && !after.run && !after.cover && !after.going, `${W} 村へフェードイン（黒が外れる） ${JSON.stringify(after)}`);
    chk(after.ret && after.st === want, `${W} 帰還の処理は1回：章クリア・拾わなかった報酬は倉庫へ1個ずつ（${after.st}）`);
    await p.screenshot({ path: path.join(OUT, `village_${W}.jpg`), quality: 88 });
    await closeTalk(p);
    chk(!errs.length, `${W} エラーなし ${errs.join(' / ')}`);
    await ctx.close();
    if (rec) {
      const f = fs.readdirSync(dir).find((n) => n.endsWith('.webm')), src = path.join(dir, f), ss = Math.max(0, (mark - t0) / 1000 - 0.3);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', ss.toFixed(2), '-i', src, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', path.join(OUT, 'return_390.mp4')]);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', ss.toFixed(2), '-i', src, '-vf', 'setpts=2*PTS', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', path.join(OUT, 'return_390_slow.mp4')]);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  console.log(`\n${ok} OK / ${ng} NG`);
  await b.close(); srv.close();
  process.exit(ng ? 1 : 0);
})();
