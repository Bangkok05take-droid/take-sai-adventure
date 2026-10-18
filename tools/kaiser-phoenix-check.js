// カイザーフェニックス（大魔王バーンの火の鳥）の確認と画面録画：node tools/kaiser-phoenix-check.js [リポジトリ] [出力フォルダ]
// 30階の玉座の間で実際にボス戦をする。バーンが予告（赤いマス）→ 次の行動で火の鳥が飛ぶ。たけは「足踏み」で待つ／横へよける。
// 確かめること：
//  ・絵が読み込めて、向き（下・右・左上の斜め・上）に合わせて回る。全体の長さは約0.8〜1.2秒
//  ・ダメージの数字・点滅・HPゲージは火の鳥が届いた時に出る。ダメージの処理は1回だけ（HPは1回分だけ減る）
//  ・当たり判定は今までのまま（予告の列の上だけ。横へよければ「ミス」で、HPは減らない）
//  ・届くまでの連打で動かない（ターンが進まない）
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..'), OUT = process.argv[3] || path.join(ROOT, 'tests', 'screenshots', 'kaiser-phoenix'); fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type': {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'}[path.extname(f)]||'application/octet-stream'}); r.end(d); }); }).listen(8811);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
(async () => {
  const b = await chromium.launch();
  // 場面：dx, dy＝バーンから見たたけの向き。dodge：予告のあと横へよける
  const CASES = [{ name: 'down', dx: 0, dy: 4 }, { name: 'right', dx: 4, dy: 0 }, { name: 'diag', dx: -3, dy: -3 }, { name: 'up', dx: 0, dy: -4 }, { name: 'dodge', dx: 0, dy: 4, dodge: true }];
  for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
    const rec = w === 390 ? path.join(OUT, 'rec') : null;
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, recordVideo: rec ? { dir: rec, size: { width: w, height: h } } : undefined });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://localhost:8811/'); await p.waitForTimeout(400);
    await p.evaluate(() => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village; V.story.introDone = true; V.seenIntro = true; V.story.chapter = 6;
      for (const k of ['croc', 'flame', 'kill', 'baran', 'mist']) V.story.defeated[k] = true; V.story.introSeen = { vearn: true };
      G.depart(S, 4242); while (S.run.floor < 30) { const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      const r = S.run; r.player.hp = r.player.maxhp = 3000; r.player.lvl = 35; r.floorItems = []; TS.Save.save(S); });
    await p.reload(); await p.waitForTimeout(600); await p.tap('#btn-continue'); await p.waitForTimeout(900);
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; });
    chk(await p.evaluate(() => !!(TS.Sprites.art.fx && TS.Sprites.art.fx.kaiserPhoenix)), `${w} カイザーフェニックスの絵を読み込んだ`);
    for (const C of CASES) {
      if (w !== 390 && C.name !== 'down' && C.name !== 'dodge') continue;
      // バーンを広間の真ん中に、たけを決めた向きに置く。手下・魔法陣は出さない。火の鳥だけ使える状態に
      await p.evaluate((C) => { const S = TS.UI.S, r = S.run, G = TS.Game, T = TS.Data.THRONE_ROOM, b = r.enemies.find((e) => e.boss);
        r.enemies = r.enemies.filter((e) => e === b); r.hazards = []; b.charge = null; b.rest = 0; b.sleep = 0; b.hold = 0;
        b.x = T.hall.x + 6; b.y = T.hall.y + 6; b.cds = { circle: 99, bird: 0, summon: 99 };
        r.player.x = b.x + C.dx; r.player.y = b.y + C.dy; r.player.hp = r.player.maxhp; G.updateVision(r);
        if (!r.bossFight.engaged) G.checkBossRoom(S, []); b.hold = 0; TS.UI.lockUntil = 0; TS.UI.debug && TS.UI.debug.save && TS.UI.debug.save(); }, C);
      await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); });
      await p.waitForTimeout(500);
      // 1手目：待つ → バーンが予告
      await p.keyboard.press('Space'); await p.waitForTimeout(500);
      const tel = await p.evaluate(() => { const b = TS.UI.S.run.enemies.find((e) => e.boss); return b && b.charge ? b.charge.tiles.length : 0; });
      chk(tel > 0, `${w} ${C.name}：バーンが予告（赤いマス ${tel}）`);
      if (C.name === 'down' && w === 390) await p.screenshot({ path: path.join(OUT, `telegraph_${w}.png`) });
      await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; });
      // 2手目：待つ（よける場面は横へ1歩）→ 火の鳥。毎コマ記録する
      const before = await p.evaluate(() => { const r = TS.UI.S.run; window.__ph = []; const t0 = performance.now();
        const tick = () => { const f = TS.Render.fx.find((x) => x.t === 'kphoenix'), nums = TS.Render.fx.filter((x) => x.t === 'num' && x.color === '#ff6a6a');
          window.__ph.push({ t: performance.now() - t0, ph: f ? { t0: f.t0 - t0, dur: f.dur, gather: f.gather, fly: f.fly, to: f.to, dx: f.dx, dy: f.dy } : null, num: nums.map((n) => n.t0 + (n.delay || 0) - t0), hud: document.getElementById('h-hp').textContent, hp: r.player.hp, turn: r.turn });
          if (performance.now() - t0 < 2200) requestAnimationFrame(tick); };
        requestAnimationFrame(tick); return { hp: r.player.hp, turn: r.turn, big: r.log.filter((l) => l.includes('大技')).length }; });
      if (C.dodge) await p.keyboard.press('ArrowRight'); else await p.keyboard.press('Space');
      // 届くまでの連打（動かないこと）
      for (let i = 0; i < 5; i++) { await p.waitForTimeout(90); await p.keyboard.press('ArrowLeft'); }
      await p.waitForTimeout(150);
      if (w === 390) await p.screenshot({ path: path.join(OUT, `flying_${C.name}_${w}.png`) });
      await p.waitForTimeout(1600);
      const T = await p.evaluate(() => window.__ph), after = await p.evaluate(() => { const r = TS.UI.S.run; return { hp: r.player.hp, turn: r.turn, log: r.log.slice(-4).join('/'), big: r.log.filter((l) => l.includes('大技')).length }; });
      const fr = T.find((x) => x.ph);
      chk(!!fr, `${w} ${C.name}：火の鳥の演出が出る`);
      if (!fr) continue;
      const P = fr.ph, impact = P.t0 + P.gather + P.fly, total = P.dur;
      chk(total >= 750 && total <= 1250, `${w} ${C.name}：全体の長さ ${Math.round(total)}ms（集まる${P.gather}・飛ぶ${Math.round(P.fly)}・閃光${Math.round(P.dur - P.gather - P.fly)}）`);
      chk(Math.sign(P.dx) === Math.sign(C.dx) && Math.sign(P.dy) === Math.sign(C.dy), `${w} ${C.name}：向き（${P.dx},${P.dy}）`);
      const hurt = before.hp - after.hp;
      if (C.dodge) {
        chk(hurt === 0 && after.log.includes('かわした'), `${w} よける：予告の列の外ならダメージなし・「ミス」（見た目で当たりを広げない） hp ${before.hp}→${after.hp}`);
        chk(!(P.to.x === undefined) , `${w} よける：火の鳥は列の端まで飛ぶ (${P.to.x},${P.to.y})`);
      } else {
        const numAt = (T.find((x) => x.num.length) || {}).num;
        chk(hurt > 0 && after.big - before.big === 1, `${w} ${C.name}：予告の列の上なら命中（${hurt}ダメージ・大技の記録1回）`);
        chk(numAt && Math.abs(numAt[0] - impact) <= 40, `${w} ${C.name}：ダメージの数字は届いた時（数字 ${numAt && Math.round(numAt[0])}ms・命中 ${Math.round(impact)}ms）`);
        const hudBefore = T.filter((x) => x.t < impact - 40 && x.t > P.t0 + 20).map((x) => x.hud), hudAfter = T.filter((x) => x.t > impact + 60).map((x) => x.hud);
        chk(hudBefore.length && hudBefore.every((x) => x.startsWith(before.hp + '/')) && hudAfter.length && hudAfter[hudAfter.length - 1].startsWith(after.hp + '/'), `${w} ${C.name}：HPゲージは届いた時に減る（前 ${hudBefore[0]}・後 ${hudAfter[hudAfter.length - 1]}）`);
        chk(T.filter((x) => x.t > P.t0).every((x) => x.hp === after.hp), `${w} ${C.name}：ダメージの処理は1回だけ（HPは1回分だけ減る）`);
      }
      chk(after.turn === before.turn + 1, `${w} ${C.name}：届くまでの連打でターンが進まない（${before.turn}→${after.turn}）`);
    }
    chk(!errs.length, `${w} エラーなし ${errs.join(' / ')}`);
    await ctx.close();
    if (rec) { const f = fs.readdirSync(rec).find((n) => n.endsWith('.webm')); if (f) fs.renameSync(path.join(rec, f), path.join(OUT, 'recording-390.webm')); }
  }
  await b.close(); srv.close();
  console.log('合計 OK', ok, 'NG', ng);
})();
