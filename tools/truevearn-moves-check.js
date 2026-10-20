// 真大魔王バーン（33階）の技（2026年10月21日）：予告1ターン → 次の行動で発動、の見え方と動きの確認（PCのブラウザ、幅360・390・430）
//   node tools/truevearn-moves-check.js [出力フォルダ]（既定 docs/truevearn-moves-v1/）
//   カラミティエンド（隣・まわり1マス）・カラミティウォール（まわり3マス）・カイザーフェニックス（隣でも3列）を、実際のゲームの処理（TS.UI.doAct の足踏み）で出させる。
//   天地魔闘の構え（構える・攻撃するとはね返る・離れるとカイザーフェニックス）も確かめる。
//   技の絵（エフェクト）は ChatGPT の素材が届くまで仮（ui.js の blast 'calamityEnd'・'calamityWall'、フェニックスは今の炎の鳥）
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, 'docs', 'truevearn-moves-v1');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8839;
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' }[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
const closeAll = (p) => p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; });
// 技ごとの置き方：たけとボスの位置（広間の左上からのずれ）・使えない技の待ち
const MOVES = [
  { key: 'end', label: 'カラミティエンド', b: [7, 6], p: [7, 7], cds: { wall: 9, phoenix: 9, stance: 99 }, n: 8 },
  { key: 'wall', label: 'カラミティウォール', b: [7, 6], p: [9, 9], cds: { end: 9, phoenix: 9, stance: 99 }, n: 48 },
  { key: 'phoenix', label: 'カイザーフェニックス', b: [7, 6], p: [7, 7], cds: { end: 9, wall: 9, stance: 99 } },
];
(async () => {
  const b = await chromium.launch();
  for (const [W, H] of [[360, 780], [390, 844], [430, 932]]) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.route('**/*.mp4', (route) => route.fulfill({ status: 404, body: '' }));
    await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(400);
    await p.evaluate(() => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village, st = V.story; st.introDone = true; V.seenIntro = true; st.chapter = 6;
      for (const k of ['croc', 'flame', 'kill', 'baran', 'mist', 'vearn']) st.defeated[k] = true;
      st.introSeen = { truevearn: true, truevearnAwaken: true };
      G.depart(S, 6161); const r = S.run; r.final.skip.vearn = true;
      while (r.floor < 33) { const t = r.stairs || r.crack; r.enemies = r.enemies.filter((e) => e.boss); r.player.x = t.x; r.player.y = t.y; G.act(S, { type: 'descend' }); }
      r.player.hp = r.player.maxhp = 9999; TS.Save.save(S); });
    await p.reload(); await p.waitForTimeout(700);
    await p.tap('#btn-continue'); await p.waitForTimeout(900); await closeAll(p);
    for (const M of MOVES) {
      await p.evaluate((M) => { const r = TS.UI.S.run, A = r.bossFight, bo = r.enemies.find((e) => e.boss); A.engaged = true; A.intro = 'done';
        bo.x = A.x + M.b[0]; bo.y = A.y + M.b[1]; bo.charge = null; bo.hold = 0; bo.rest = 0; bo.cds = Object.assign({}, M.cds); bo.aware = true;
        r.player.x = A.x + M.p[0]; r.player.y = A.y + M.p[1]; r.player.dir = 'up'; r.player.hp = 9999; TS.Game.updateVision(r); }, M);
      // 1回目の足踏み：範囲が光る（予告）
      await p.evaluate(() => TS.UI.doAct({ type: 'wait' })); await p.waitForTimeout(700); await closeAll(p);
      const t = await p.evaluate(() => { const r = TS.UI.S.run, bo = r.enemies.find((e) => e.boss), c = bo.charge; return c && { n: c.tiles.length, kind: c.kind, label: c.label, fx: c.fx, hit: c.tiles.some((t) => t.x === r.player.x && t.y === r.player.y), lines: new Set(c.tiles.map((t) => t.x)).size }; });
      const want = M.key === 'phoenix' ? t && t.fx === 'firebird' && t.lines === 3 : t && t.label === M.label && t.kind === 'fixedDmg' && t.n === M.n;
      chk(want && t.hit, `${W} ${M.label}：範囲が光る（予告） ${JSON.stringify(t)}`);
      await p.screenshot({ path: path.join(OUT, `${M.key}-telegraph_${W}.jpg`), quality: 85 });
      // 2回目の足踏み：発動（範囲の中にいるので当たる）
      const hp0 = await p.evaluate(() => TS.UI.S.run.player.hp);
      await p.evaluate(() => TS.UI.doAct({ type: 'wait' })); await p.waitForTimeout(160);
      await p.screenshot({ path: path.join(OUT, `${M.key}-hit_${W}.jpg`), quality: 85 });
      await p.waitForTimeout(600); await closeAll(p);
      const after = await p.evaluate(() => { const r = TS.UI.S.run, bo = r.enemies.find((e) => e.boss); return { hp: r.player.hp, rest: bo.rest || 0 }; });
      const dmg = hp0 - after.hp, rng = M.key === 'end' ? [120, 150] : M.key === 'wall' ? [80, 100] : [1, 999];
      chk(dmg >= rng[0] && dmg <= rng[1] && !after.rest, `${W} ${M.label}：次の行動で発動・ダメージ ${dmg}（隙なし）`);
    }
    // 天地魔闘の構え：隣で構える → 攻撃するとはね返る（3倍）→ 3マス離れると構えを解いてカイザーフェニックスの予告
    await p.evaluate(() => { const r = TS.UI.S.run, A = r.bossFight, bo = r.enemies.find((e) => e.boss); bo.x = A.x + 7; bo.y = A.y + 6; bo.charge = null; bo.stance = 0; bo.cds = {};
      r.player.x = bo.x; r.player.y = bo.y + 1; r.player.dir = 'up'; r.player.hp = 9999; TS.Game.updateVision(r); });
    await p.evaluate(() => TS.UI.doAct({ type: 'wait' })); await p.waitForTimeout(600); await closeAll(p);
    const st = await p.evaluate(() => { const bo = TS.UI.S.run.enemies.find((e) => e.boss); return { stance: bo.stance, charge: !!bo.charge }; });
    chk(st.stance === 4 && !st.charge, `${W} 天地魔闘の構え（攻撃も予告もしない） ${JSON.stringify(st)}`);
    await p.screenshot({ path: path.join(OUT, `stance_${W}.jpg`), quality: 85 });
    let ctr = null;
    for (let i = 0; i < 6 && !ctr; i++) {
      const h0 = await p.evaluate(() => ({ p: TS.UI.S.run.player.hp, b: TS.UI.S.run.enemies.find((e) => e.boss).hp }));
      await p.evaluate(() => TS.UI.doAct({ type: 'move', dir: 'up' })); await p.waitForTimeout(140);
      const h1 = await p.evaluate(() => ({ p: TS.UI.S.run.player.hp, b: TS.UI.S.run.enemies.find((e) => e.boss).hp, log: TS.UI.S.run.log.slice(-3).join(' ') }));
      if (h1.log.includes('はね返した')) { ctr = { lost: +(/反撃！ たけは(\d+)のダメージ/.exec(h1.log) || [0, 0])[1], boss: h0.b - h1.b }; await p.screenshot({ path: path.join(OUT, `stance-counter_${W}.jpg`), quality: 85 }); }
      await p.waitForTimeout(500); await closeAll(p);
    }
    chk(ctr && ctr.lost > 0 && ctr.lost % 3 === 0 && ctr.boss === 0, `${W} 構えに攻撃：3倍のダメージが返る・バーンは無傷 ${JSON.stringify(ctr)}`);
    await p.evaluate(() => { const r = TS.UI.S.run, bo = r.enemies.find((e) => e.boss); bo.stance = 4; r.player.x = bo.x; r.player.y = bo.y + 3; r.player.hp = 9999; TS.Game.updateVision(r); });
    await p.evaluate(() => TS.UI.doAct({ type: 'wait' })); await p.waitForTimeout(700); await closeAll(p);
    const lv = await p.evaluate(() => { const r = TS.UI.S.run, bo = r.enemies.find((e) => e.boss), c = bo.charge; return { stance: bo.stance, fx: c && c.fx, hit: !!c && c.tiles.some((t) => t.x === r.player.x && t.y === r.player.y) }; });
    chk(lv.stance === 0 && lv.fx === 'firebird' && lv.hit, `${W} 3マス離れると構えを解いてカイザーフェニックスの予告 ${JSON.stringify(lv)}`);
    await p.screenshot({ path: path.join(OUT, `stance-leave_${W}.jpg`), quality: 85 });
    chk(!errs.length, `${W} エラーなし ${errs.join(' / ')}`);
    await ctx.close();
  }
  console.log(`\n${ok} OK / ${ng} NG`);
  await b.close(); srv.close();
  process.exit(ng ? 1 : 0);
})();
