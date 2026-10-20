// 真大魔王バーン（33階）の技（2026年10月21日）：予告1ターン → 次の行動で発動、の見え方と動きの確認（PCのブラウザ、幅360・390・430）
//   node tools/truevearn-moves-check.js [出力フォルダ]（既定 docs/truevearn-moves-v1/）
//   カラミティエンド（隣・まわり1マス）・カラミティウォール（まわり3マス）・カイザーフェニックス（隣でも3列）を、実際のゲームの処理（TS.UI.doAct の足踏み）で出させる。
//   天地魔闘の構え（構える・攻撃するとはね返る・離れるとカイザーフェニックス）も確かめる。
//   技の演出は ZIP truevearn_effects_v1 のコマ（assets/fx/truevearn/）。コードで描く仮の演出と二重にならないこと、画面の表示は技名だけ、
//   構えの間は専用のポーズ（「構」の文字は出さない）で、構えが終わる・読み込み直す と正しいポーズになることも確かめる
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(ROOT, 'docs', 'truevearn-moves-v1');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8839;
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' }[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(PORT);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
// 1回だけ描かせて、使った絵と文字を調べる（構えのポーズ・演出のコマ・「構」の文字）
const probe = (p) => p.evaluate(() => { const SP = TS.Sprites, pose = SP.bossPose('truevearn', 'stance'), idle = SP.art.bosses.truevearn, fr = SP.art.fxFrames;
  const all = new Map(); for (const [k, l] of Object.entries(fr)) l.forEach((im, i) => all.set(im, k + i));
  const seq = { pose: 0, idle: 0, frames: [], text: [] };
  const o = CanvasRenderingContext2D.prototype.drawImage, ot = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.drawImage = function (im, ...a) { if (im === pose) seq.pose++; else if (im === idle) seq.idle++; else if (all.has(im)) seq.frames.push(all.get(im)); return o.call(this, im, ...a); };
  CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { seq.text.push(String(t)); return ot.call(this, t, ...a); };
  try { TS.Render.drawDungeon(document.getElementById('dungeon-canvas'), TS.UI.S, performance.now()); } finally { CanvasRenderingContext2D.prototype.drawImage = o; CanvasRenderingContext2D.prototype.fillText = ot; }
  seq.kan = seq.text.includes('構'); seq.fx = TS.Render.fx.map((f) => f.t).filter((t) => /vfxFrames|cslash|cwall|ccounter|impact/.test(t)); delete seq.text; return seq; });
const toastText = (p) => p.evaluate(() => document.getElementById('toast').textContent);
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
    const rec = W === 390, rdir = path.join(OUT, '_rec');   // 幅390は動画にも残す（技の予告・発動・反撃のプレビュー）
    const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, recordVideo: rec ? { dir: rdir, size: { width: W, height: H } } : undefined });
    const tStart = Date.now();
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
    const t0 = Date.now();
    // 33階：正方形の決戦場だけ（前室・通路・最初に置く道具なし）。たけは広間の下の端から3マス上・ボスは中央
    const room = await p.evaluate(() => { const r = TS.UI.S.run, m = r.map, A = r.bossFight, bo = r.enemies.find((e) => e.boss); let n = 0;
      for (let i = 0; i < m.tiles.length; i++) if (TS.Dungeon.passable(m, i % m.w, Math.floor(i / m.w))) n++;
      return { arenaOnly: !!m.arenaOnly, floor: n, items: r.floorItems.filter((f) => f.item).length, p: [r.player.x - A.x, r.player.y - A.y], b: [bo.x - A.x, bo.y - A.y], theme: TS.Game.themeOf(r) }; });
    chk(room.arenaOnly && room.floor === 225 && room.items === 0 && room.p.join() === '7,11' && room.b.join() === '7,7' && room.theme === 'void', `${W} 33階は15×15の決戦場だけ・道具なし・位置は今までどおり ${JSON.stringify(room)}`);
    await p.screenshot({ path: path.join(OUT, `room-arrive_${W}.jpg`), quality: 85 });
    for (const M of MOVES) {
      await p.evaluate((M) => { const r = TS.UI.S.run, A = r.bossFight, bo = r.enemies.find((e) => e.boss); A.engaged = true; A.intro = 'done';
        bo.x = A.x + M.b[0]; bo.y = A.y + M.b[1]; bo.charge = null; bo.hold = 0; bo.rest = 0; bo.cds = Object.assign({}, M.cds); bo.aware = true;
        r.player.x = A.x + M.p[0]; r.player.y = A.y + M.p[1]; r.player.dir = 'up'; r.player.hp = 9999; TS.Game.updateVision(r); }, M);
      // 1回目の足踏み：範囲が光る（予告）
      await p.evaluate(() => TS.UI.doAct({ type: 'wait' })); await p.waitForTimeout(150);
      const tt = await toastText(p);
      chk(tt === M.label, `${W} ${M.label}：画面の表示は技名だけ「${tt}」`);
      await p.waitForTimeout(550); await closeAll(p);
      const t = await p.evaluate(() => { const r = TS.UI.S.run, bo = r.enemies.find((e) => e.boss), c = bo.charge; return c && { n: c.tiles.length, kind: c.kind, label: c.label, fx: c.fx, hit: c.tiles.some((t) => t.x === r.player.x && t.y === r.player.y), lines: new Set(c.tiles.map((t) => t.x)).size }; });
      const want = M.key === 'phoenix' ? t && t.fx === 'firebird' && t.lines === 3 : t && t.label === M.label && t.kind === 'fixedDmg' && t.n === M.n;
      chk(want && t.hit, `${W} ${M.label}：範囲が光る（予告） ${JSON.stringify(t)}`);
      await p.screenshot({ path: path.join(OUT, `${M.key}-telegraph_${W}.jpg`), quality: 85 });
      // 2回目の足踏み：発動（範囲の中にいるので当たる）
      const hp0 = await p.evaluate(() => TS.UI.S.run.player.hp);
      await p.evaluate(() => TS.UI.doAct({ type: 'wait' })); await p.waitForTimeout(60);
      await p.screenshot({ path: path.join(OUT, `${M.key}-hit0_${W}.jpg`), quality: 85 }); await p.waitForTimeout(80);
      if (M.key !== 'phoenix') {
        const pr = await probe(p), want = M.key === 'end' ? 'calamityEnd' : 'calamityWall';
        chk(pr.frames.length === 1 && pr.frames[0].startsWith(want) && pr.fx.join() === 'vfxFrames', `${W} ${M.label}：演出のコマ（${pr.frames.join()}）だけを描く・仮の演出と二重にならない ${JSON.stringify(pr.fx)}`);
      }
      await p.screenshot({ path: path.join(OUT, `${M.key}-hit_${W}.jpg`), quality: 85 });
      await p.waitForTimeout(170);
      await p.screenshot({ path: path.join(OUT, `${M.key}-hit2_${W}.jpg`), quality: 85 });
      await p.waitForTimeout(700); await closeAll(p);
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
    { const tt = await toastText(p), pr = await probe(p);
      chk(tt === '天地魔闘の構え', `${W} 構え：画面の表示は技名だけ「${tt}」`);
      chk(pr.pose === 1 && pr.idle === 0 && !pr.kan && pr.frames.join() === 'tenchiMato0', `${W} 構えの間は専用のポーズと控えめな光（00）・「構」の文字なし ${JSON.stringify(pr)}`); }
    await p.screenshot({ path: path.join(OUT, `stance_${W}.jpg`), quality: 85 });
    let ctr = null;
    for (let i = 0; i < 6 && !ctr; i++) {
      const h0 = await p.evaluate(() => ({ p: TS.UI.S.run.player.hp, b: TS.UI.S.run.enemies.find((e) => e.boss).hp }));
      await p.evaluate(() => TS.UI.doAct({ type: 'move', dir: 'up' })); await p.waitForTimeout(60);
      await p.screenshot({ path: path.join(OUT, `stance-counter0_${W}.jpg`), quality: 85 }); await p.waitForTimeout(40);
      const h1 = await p.evaluate(() => ({ p: TS.UI.S.run.player.hp, b: TS.UI.S.run.enemies.find((e) => e.boss).hp, log: TS.UI.S.run.log.slice(-3).join(' ') }));
      if (h1.log.includes('天地魔闘の構え！')) { const pr = await probe(p);
        chk(pr.frames.some((f) => /tenchiMato[123]/.test(f)) && pr.fx.join() === 'vfxFrames', `${W} 反撃：01→02→03 のコマ（今 ${pr.frames.join()}）・仮の演出と二重にならない`);
        await p.waitForTimeout(120); await p.screenshot({ path: path.join(OUT, `stance-counter2_${W}.jpg`), quality: 85 }); ctr = { lost: +(/反撃！ たけは(\d+)のダメージ/.exec(h1.log) || [0, 0])[1], boss: h0.b - h1.b }; await p.screenshot({ path: path.join(OUT, `stance-counter_${W}.jpg`), quality: 85 }); }
      await p.waitForTimeout(500); await closeAll(p);
    }
    chk(ctr && ctr.lost > 0 && ctr.lost % 3 === 0 && ctr.boss === 0, `${W} 構えに攻撃：3倍のダメージが返る・バーンは無傷 ${JSON.stringify(ctr)}`);
    await p.evaluate(() => { const r = TS.UI.S.run, bo = r.enemies.find((e) => e.boss); bo.stance = 4; r.player.x = bo.x; r.player.y = bo.y + 3; r.player.hp = 9999; TS.Game.updateVision(r); });
    await p.evaluate(() => TS.UI.doAct({ type: 'wait' })); await p.waitForTimeout(700); await closeAll(p);
    const lv = await p.evaluate(() => { const r = TS.UI.S.run, bo = r.enemies.find((e) => e.boss), c = bo.charge; return { stance: bo.stance, fx: c && c.fx, hit: !!c && c.tiles.some((t) => t.x === r.player.x && t.y === r.player.y) }; });
    chk(lv.stance === 0 && lv.fx === 'firebird' && lv.hit, `${W} 3マス離れると構えを解いてカイザーフェニックスの予告 ${JSON.stringify(lv)}`);
    { const pr = await probe(p); chk(pr.idle === 1 && pr.pose === 0, `${W} 構えを解くと待機の絵に戻る ${JSON.stringify(pr)}`); }
    // 構えている所で読み込み直す → 構えのポーズのまま。構えが終われば戻る
    await p.evaluate(() => { const r = TS.UI.S.run, bo = r.enemies.find((e) => e.boss); bo.charge = null; bo.stance = 3; TS.Save.save(TS.UI.S); });
    await p.reload(); await p.waitForTimeout(900); await p.tap('#btn-continue'); await p.waitForTimeout(900); await closeAll(p);
    { const pr = await probe(p); chk(pr.pose === 1 && pr.idle === 0 && !pr.kan, `${W} 読み込み直しても構えのポーズ ${JSON.stringify(pr)}`); }
    await p.screenshot({ path: path.join(OUT, `stance-reload_${W}.jpg`), quality: 85 });
    await p.screenshot({ path: path.join(OUT, `stance-leave_${W}.jpg`), quality: 85 });
    chk(!errs.length, `${W} エラーなし ${errs.join(' / ')}`);
    await ctx.close();
    if (rec) {
      const f = fs.readdirSync(rdir).find((n) => n.endsWith('.webm')), ss = Math.max(0, (t0 - tStart) / 1000);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', ss.toFixed(2), '-i', path.join(rdir, f), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', path.join(OUT, 'moves_390.mp4')]);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', ss.toFixed(2), '-i', path.join(rdir, f), '-vf', 'setpts=2.5*PTS', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', path.join(OUT, 'moves_390_slow.mp4')]);
      fs.rmSync(rdir, { recursive: true, force: true });
    }
  }
  console.log(`\n${ok} OK / ${ng} NG`);
  await b.close(); srv.close();
  process.exit(ng ? 1 : 0);
})();
