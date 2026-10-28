// 竜魔神バランの画面確認：node tools/dragon-god-baran-check.js [リポジトリ] [出力フォルダ]（幅360・390・430。390は画像と録画も）
// 隠しダンジョンの34階から階段で35階へ → 登場ムービー（着くたびに毎回）→ ボス部屋で戦う。
// 確かめること：絵（待機・ドルオーラの構え・剣を頭上に・突進）と技の演出の絵が読める／技の予告と発動／演出の秒数でターンが増えない／エラーなし
// 画像（shot_*）は見やすいよう、演出の時間だけを一時的に長くして撮る（slow）。録画（rec）はふだんの速さ
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
// 確認用のブラウザ（Chromium）は H.264 を再生できないので、動画は確認のときだけ webm に変えて渡す（ほかのムービーの確認と同じ。ゲームの動画はそのまま）
const WEBM = path.join(os.tmpdir(), 'dragon-god-baran-intro.webm');
if (!fs.existsSync(WEBM)) cp.execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(__dirname, '..', 'assets/movies/dragon-god-baran-intro.mp4'), '-vf', 'scale=360:-2', '-c:v', 'libvpx-vp9', '-b:v', '600k', '-deadline', 'realtime', '-c:a', 'libopus', WEBM]);
const ROOT = process.argv[2] || path.join(__dirname, '..'), OUT = process.argv[3] || path.join(ROOT, 'tests', 'screenshots', 'dragon-god-baran'); fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp4': 'video/mp4' };
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(8812);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
    const main = w === 390;
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, recordVideo: main ? { dir: path.join(OUT, 'rec'), size: { width: w, height: h } } : undefined });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.route('**/assets/movies/dragon-god-baran-intro.mp4', (route) => route.fulfill({ status: 200, contentType: 'video/webm', body: fs.readFileSync(WEBM) }));
    const closeAll = () => p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); TS.UI.lockUntil = 0; });
    const shot = (n) => main ? p.screenshot({ path: path.join(OUT, `shot_${n}.png`) }) : null;
    await p.goto('http://localhost:8812/'); await p.waitForTimeout(400);
    // 隠しダンジョンの34階（階段の上）から
    await p.evaluate(() => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village, st = V.story; st.introDone = true; V.seenIntro = true; st.chapter = 6;
      for (const k of ['croc', 'flame', 'kill', 'baran', 'mist', 'vearn', 'truevearn']) st.defeated[k] = true; st.endingDone = true; st.finalStage = 'won';
      G.takeReturnScroll(S); G.depart(S, 5353); while (S.run.floor < 30) { const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      const r = S.run; r.player.x = r.crack.x; r.player.y = r.crack.y; G.act(S, { type: 'descend' });
      while (S.run.floor < 34) { const q = S.run; q.player.x = q.stairs.x; q.player.y = q.stairs.y; G.act(S, { type: 'descend' }); }
      const q = S.run; q.player.hp = q.player.maxhp = 5000; q.player.lvl = 40; q.enemies = []; q.player.x = q.stairs.x; q.player.y = q.stairs.y; G.updateVision(q); TS.Save.save(S); });
    await p.reload(); await p.waitForTimeout(600); await p.tap('#btn-continue'); await p.waitForTimeout(900); await closeAll(); await p.waitForTimeout(300);
    chk(await p.evaluate(() => TS.UI.S.run.hidden && TS.UI.S.run.floor === 34), `${w} 隠しダンジョン34階`);
    // 35階へ：着いたら登場ムービー（毎回）。2回試す（34階のセーブに戻して、もう一度降りる。見たことがあっても流れる）
    const save34 = await p.evaluate(() => JSON.stringify(Object.assign({}, localStorage)));
    for (let k = 0; k < 2; k++) {
      if (k) { await p.evaluate((sv) => { localStorage.clear(); for (const [a, v] of Object.entries(JSON.parse(sv))) localStorage.setItem(a, v); }, save34);
        await p.evaluate(() => { const S = TS.UI.S; }); await p.reload(); await p.waitForTimeout(600); await p.tap('#btn-continue'); await p.waitForTimeout(900); await closeAll(); }
      await p.evaluate(() => { const r = TS.UI.S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; TS.UI.lockUntil = 0; TS.UI.doAct({ type: 'descend' }); });
      await p.waitForTimeout(1500);
      const m = await p.evaluate(() => ({ floor: TS.UI.S.run.floor, movie: TS.UI.movie && TS.UI.movie.id, video: !!document.querySelector('.movie video'), src: (document.querySelector('.movie video') || {}).src || '', seen: !!(TS.UI.S.village.story.moviesSeen || {}).dragonGodIntro }));
      chk(m.floor === 35 && m.movie === 'dragonGodIntro' && m.video && m.src.includes('dragon-god-baran-intro'), `${w} 35階に着くと登場ムービー（${k + 1}回目） ${JSON.stringify(m)}`);
      if (main && !k) { await p.waitForTimeout(2500); await shot('0_movie'); }
      await p.evaluate(() => { const s = document.querySelector('.movie-skip'); if (s) s.click(); }); await p.waitForTimeout(1600);
      chk(await p.evaluate(() => !TS.UI.movie && !document.querySelector('.movie') && !TS.UI.S.run.bossFight.engaged), `${w} スキップで戻る・戦いはまだ（${k + 1}回目）`);
    }
    await closeAll();
    // ボス部屋に入って戦いを始める
    await p.evaluate(() => { const S = TS.UI.S, r = S.run, G = TS.Game, A = r.bossFight; r.player.x = A.x + (A.w >> 1); r.player.y = A.y + A.h - 2; G.updateVision(r); G.checkBossRoom(S, []); TS.UI.lockUntil = 0; });
    await p.waitForTimeout(500); await closeAll();
    chk(await p.evaluate(() => !!TS.UI.S.run.bossFight.engaged), `${w} 戦いが始まる（ムービーはボス部屋では流れない）`);
    const art = await p.evaluate(() => { const SP = TS.Sprites, P = SP.art.bossPoses.dragonbaran || {}, F = SP.art.fx; const fx = Object.keys(F).filter((k) => k.startsWith('db_') && F[k]); return { idle: !!(SP.art.bosses.dragonbaran && SP.art.bosses.dragonbaran.logical === 96), poses: ['doruora', 'sword', 'dash', 'dashL'].filter((k) => P[k]).join(), fx: fx.length }; });
    chk(art.idle && art.poses === 'doruora,sword,dash,dashL' && art.fx === 12, `${w} 絵と演出の絵 ${JSON.stringify(art)}`);
    // 場面の用意：バランを広間の中央に、たけを決めた所に。mode：doruora・giga・gigaPush・dora
    const setup = (mode, slow) => p.evaluate(([mode, slow]) => { const S = TS.UI.S, r = S.run, G = TS.Game, b = r.enemies.find((e) => e.boss), A = r.bossFight;
      const DB = TS.FX.DB; if (!window.__db0) window.__db0 = Object.assign({}, DB); Object.assign(DB, window.__db0); if (slow) for (const k of Object.keys(DB)) DB[k] *= slow;
      r.hazards = []; b.charge = null; b.rest = 0; b.hold = 0; b.sleep = 0; b.slow = 0; b.dora = 0; if (b.doraDef != null) { b.def = b.doraDef; b.doraDef = null; }
      b.x = A.x + 7; b.y = A.y + 5; b.hp = mode === 'dora' ? Math.floor(b.maxhp * 0.7) : b.maxhp; b.cds = { giga: mode.startsWith('giga') ? 0 : 9, sweep: mode === 'sweep' ? 0 : 9, doruora: mode === 'doruora' ? 0 : 9, dora: mode === 'dora' ? 0 : 99 }; TS.Data.DRAGON_KING.sweep.chance = mode === 'sweep' ? 1 : 0.75;   // 画像を撮る場面では必ずなぎ払い
      r.player.x = b.x + (mode === 'doruora' ? 0 : mode === 'gigaPush' ? 0 : 0); r.player.y = b.y + (mode === 'doruora' ? 3 : mode === 'gigaPush' ? 5 : mode === 'dora' ? 4 : mode === 'sweep' ? 1 : 3);
      r.player.hp = r.player.maxhp; G.updateVision(r); TS.Render.clearFx(); TS.UI.lockUntil = 0; }, [mode, slow || 0]);
    const press = async () => { await p.evaluate(() => { TS.UI.lockUntil = 0; }); await p.keyboard.press('Space'); };
    const state = () => p.evaluate(() => { const r = TS.UI.S.run, b = r.enemies.find((e) => e.boss); return { b: b.x + ',' + b.y, p: r.player.x + ',' + r.player.y, hp: r.player.hp, turn: r.turn, charge: b.charge && b.charge.fx, rest: b.rest, dora: b.dora || 0, def: b.def }; });
    // ドルオーラ：予告（構え・渦・赤いマス）→ 竜の頭が飛ぶ → 爆発
    await setup('doruora', main ? 5 : 0); await p.waitForTimeout(250); await press(); await p.waitForTimeout(500);
    let s = await state(); chk(s.charge === 'doruora', `${w} ドルオーラの予告 ${JSON.stringify(s)}`);
    await shot('1_doruora_telegraph'); await closeAll();
    let s0 = s; await press(); await p.waitForTimeout(main ? 1500 : 300); await shot('2_doruora_fly'); await p.waitForTimeout(main ? 900 : 200); await shot('3_doruora_burst');
    await p.waitForTimeout(main ? 1200 : 600); s = await state();
    chk(s.hp < s0.hp && s.b === s0.b && s.rest === 1 && s.turn === s0.turn + 1, `${w} ドルオーラ：命中・バランは動かない・1ターン動けない ${JSON.stringify(s)}`);
    // ギガブレイク：予告（剣を頭上に・雷）→ 突進（途中のたけに1回）→ 斬撃の残像
    await closeAll(); await setup('giga', main ? 8 : 0); await p.waitForTimeout(250); await press(); await p.waitForTimeout(500);
    s = await state(); chk(s.charge === 'giga', `${w} ギガブレイクの予告 ${JSON.stringify(s)}`);
    if (main) { await p.waitForFunction(() => performance.now() % 700 < 60); await p.waitForTimeout(60); }
    await shot('4_giga_telegraph'); await closeAll();
    s0 = s; await press(); await p.waitForTimeout(main ? 560 : 60); await shot('5_giga_dash'); await p.waitForTimeout(main ? 1200 : 200); await shot('6_giga_slash');
    await p.waitForTimeout(main ? 2400 : 600); s = await state();
    const [bx, by] = s0.b.split(',').map(Number);
    chk(s.hp < s0.hp && s.b === bx + ',' + (by + 5) && s.p === s0.p && s.rest === 0 && s.turn === s0.turn + 1, `${w} ギガブレイク：通り抜けて5マス先・1回命中・隙なし ${JSON.stringify(s)}`);
    // ギガブレイク（なぎ払い）：隣でまわり1マスを予告 → 当たると1マス後ろへ押される
    await closeAll(); await setup('sweep', main ? 5 : 0); await p.waitForTimeout(250); await press(); await p.waitForTimeout(500);
    s = await state(); chk(s.charge === 'giga', `${w} なぎ払いの予告 ${JSON.stringify(s)}`);
    await shot('6b_sweep_telegraph'); await closeAll();
    s0 = await state(); await press(); await p.waitForTimeout(main ? 900 : 100); await shot('6c_sweep');
    await p.waitForTimeout(main ? 2000 : 600); s = await state();
    { const [qx, qy] = s0.p.split(',').map(Number); chk(s.hp < s0.hp && s.p === qx + ',' + (qy + 1) && s.b === s0.b && s.rest === 0, `${w} なぎ払い：命中・1マス押される・隙なし ${JSON.stringify(s)}`); }
    // 5マス目：押す
    await closeAll(); await setup('gigaPush'); await p.waitForTimeout(200); await press(); await p.waitForTimeout(400); await closeAll(); s0 = await state(); await press(); await p.waitForTimeout(900); s = await state();
    const [px, py] = s0.p.split(',').map(Number);
    chk(s.b === s0.p && s.p === px + ',' + (py + 1), `${w} ギガブレイク：5マス目のたけを1マス押す ${JSON.stringify(s)}`);
    // 竜闘気：始まり（輪）→ 炎をまとって2回行動 → 終わりにはじける → 1ターン動けない
    await closeAll(); await setup('dora', main ? 4 : 0); await p.waitForTimeout(250); s0 = await state(); await press(); await p.waitForTimeout(main ? 700 : 300); await shot('7_dora_start');
    s = await state(); chk(s.dora === 3 && s.def > s0.def, `${w} 竜闘気：防御が上がる ${JSON.stringify(s)}`);
    await closeAll(); await press(); await p.waitForTimeout(main ? 1500 : 400); await shot('8_dora_aura');
    s = await state(); chk(s.dora === 2, `${w} 竜闘気：2回行動 ${JSON.stringify(s)}`);
    await closeAll(); await press(); await p.waitForTimeout(500); await closeAll(); await press(); await p.waitForTimeout(main ? 900 : 300); await shot('9_dora_end');
    s = await state(); chk(s.dora === 0 && s.def === s0.def && s.rest === 1, `${w} 竜闘気の終わり：防御が戻る・1ターン動けない ${JSON.stringify(s)}`);
    await p.waitForTimeout(800);
    chk(!errs.length, `${w} エラーなし ${errs.join(' / ')}`);
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log('合計 OK', ok, 'NG', ng);
})();
