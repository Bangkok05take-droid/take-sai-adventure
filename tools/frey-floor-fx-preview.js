// フレイザードの床の技の演出 v2（ZIP frey_floor_fx_v1）の試写：node tools/frey-floor-fx-preview.js [出力フォルダ]（既定 docs/frey-floor-fx-v1/）
// 20階のフレイザードの部屋で、この確認の間だけ D.HAZARD_FX_V2 を true にして、炎の床・氷の床を1回ずつ出す（幅390）。
// 撮るもの：印（あと1・あと0）、発動の途中（コマの時間を4倍にして数枚）、ふだんの速さの録画（rec/）。
// 判定は変えない：たけを印の上に立たせ、ダメージが1回だけ・命中の表示が噴き出しに合うか・その間に入力が進まないかも確かめる
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, 'docs', 'frey-floor-fx-v1');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(8852);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
(async () => {
  const b = await chromium.launch();
  const W = 390, H = 844;
  const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, recordVideo: { dir: path.join(OUT, 'rec'), size: { width: W, height: H } } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8852/'); await p.waitForTimeout(400);
  await p.evaluate(() => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village, st = V.story; st.introDone = true; V.seenIntro = true; st.chapter = 2; st.defeated.croc = true; st.introSeen = { flame: true };
    G.depart(S, 2024); while (S.run.floor < 20) { const r = S.run; r.enemies = r.enemies.filter((e) => e.boss); r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
    const r = S.run; r.player.hp = r.player.maxhp = 9999; r.explored.fill(1); TS.Save.save(S); });
  await p.reload(); await p.waitForTimeout(700); await p.tap('#btn-continue'); await p.waitForTimeout(900);
  const closeAll = () => p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; });
  await closeAll();
  await p.evaluate(() => { const S = TS.UI.S, r = S.run, G = TS.Game, A = r.bossFight, b = r.enemies.find((e) => e.boss);
    TS.Data.HAZARD_FX_V2 = true;
    r.player.x = A.x + (A.w >> 1); r.player.y = A.y + A.h - 3; G.updateVision(r); G.checkBossRoom(S, []); G.finishBossIntro(S);
    b.x = A.x + (A.w >> 1); b.y = A.y + 3; b.hold = 0; b.sleep = 0; b.cds = { floor: 0, ball: 99 }; b.phase = 3;   // 次は炎
    TS.UI.lockUntil = 0; });
  await p.waitForTimeout(600); await closeAll();
  chk(await p.evaluate(() => !!(TS.Sprites.fxFrames('freyIce') && TS.Sprites.fxFrames('freyFire'))), '素材のコマを読み込んだ');
  const shot = (n) => p.screenshot({ path: path.join(OUT, n + '.jpg'), quality: 88 });
  const slow = (m) => p.evaluate((m) => { const F = TS.FX.FREY; F.__0 = F.__0 || { frames: F.frames.slice(), fireStep: F.fireStep }; F.frames = F.__0.frames.map((x) => x * m); F.fireStep = F.__0.fireStep * m; }, m);
  const space = async () => { await p.evaluate(() => { TS.UI.lockUntil = 0; }); await p.keyboard.press('Space'); };
  for (const kind of ['fire', 'ice']) {
    await space(); await p.waitForTimeout(400); await closeAll();
    const hz = await p.evaluate(() => { const r = TS.UI.S.run, h = r.hazards; if (!h.length) return null;
      const t = h.reduce((a, c) => (Math.abs(c.y - r.player.y) + Math.abs(c.x - r.player.x) < Math.abs(a.y - r.player.y) + Math.abs(a.x - r.player.x) ? c : a)); r.player.x = t.x; r.player.y = t.y; TS.Game.updateVision(r);
      return { n: h.length, kind: h[0].kind, shown: h[0].t - 1 }; });
    chk(hz && hz.kind === kind && hz.shown === 1, `${kind}：印（あと1） ${JSON.stringify(hz)}`);
    await p.waitForTimeout(400); await shot(`${kind}_1_marked`);
    await space(); await p.waitForTimeout(500); await closeAll(); await shot(`${kind}_2_last`);
    // 発動：コマの時間を4倍にして撮る。命中の表示までの連打でターンが進まないことも
    await slow(4);
    const s0 = await p.evaluate(() => ({ hp: TS.UI.S.run.player.hp, turn: TS.UI.S.run.turn }));
    await space();
    const T = kind === 'fire' ? [300, 900, 1700, 2600] : [150, 450, 900, 1600];
    let t0 = 0;
    for (const [i, t] of T.entries()) { await p.waitForTimeout(t - t0); t0 = t; await shot(`${kind}_3_burst_${i}`); if (i === 0) await p.keyboard.press('ArrowLeft'); }
    await p.waitForTimeout(3000); await slow(1); await closeAll();
    const s1 = await p.evaluate(() => ({ hp: TS.UI.S.run.player.hp, turn: TS.UI.S.run.turn }));
    chk(s1.hp < s0.hp && s1.turn === s0.turn + 1, `${kind}：印の上なら1回だけ当たる・演出中の入力でターンが進まない ${JSON.stringify([s0, s1])}`);
    await p.evaluate(() => { const r = TS.UI.S.run, b = r.enemies.find((e) => e.boss); r.hazards = []; b.cds.floor = 0; b.cds.ball = 99; r.player.hp = r.player.maxhp; TS.UI.lockUntil = 0; });
  }
  // ふだんの速さ（録画用）でもう1回ずつ
  for (let i = 0; i < 2; i++) {
    await space(); await p.waitForTimeout(500); await closeAll();
    await space(); await p.waitForTimeout(500); await closeAll();
    await space(); await p.waitForTimeout(2000); await closeAll();
    await p.evaluate(() => { const r = TS.UI.S.run, b = r.enemies.find((e) => e.boss); r.hazards = []; b.cds.floor = 0; b.cds.ball = 99; r.player.hp = r.player.maxhp; TS.UI.lockUntil = 0; });
  }
  chk(!errs.length, 'エラーなし ' + errs.join(' / '));
  await ctx.close(); await b.close(); srv.close();
  console.log(`\n${ok} OK / ${ng} NG`);
})();
