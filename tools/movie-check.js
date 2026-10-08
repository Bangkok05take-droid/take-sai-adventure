// クロコダインの登場ムービーの確認：node tools/movie-check.js [リポジトリ] [出力フォルダ] [VP9のwebm] [full|cases|land]
// このPCの Chromium（Playwright）は H.264 を再生できないので、同じ動画を VP9 にした webm を差し替えて流す（実際のスマホは mp4 をそのまま再生する）。
// webm の作り方：ffmpeg -i assets/movies/crocodine-intro.mp4 -c:v libvpx-vp9 -b:v 1M -deadline realtime -cpu-used 8 -c:a libopus /tmp/croc-test.webm
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2], OUT = process.argv[3], WEBM = process.argv[4]; fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type': {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.mp4':'video/mp4','.jpg':'image/jpeg'}[path.extname(f)]||'application/octet-stream'}); r.end(d); }); }).listen(8797);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
const only = process.argv[5];
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  async function setup(w, h, opts = {}) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
    if (opts.route !== 'real') await p.route('**/crocodine-intro.mp4', async (route) => {
      if (opts.route === '404') return route.fulfill({ status: 404, body: '' });
      if (opts.route === 'slow') await new Promise((r) => setTimeout(r, 9000));
      route.fulfill({ status: 200, contentType: 'video/webm', body: fs.readFileSync(WEBM) });
    });
    await p.goto('http://localhost:8797/'); await p.waitForTimeout(400);
    await p.evaluate(([sound, pre]) => { localStorage.clear(); const G = TS.Game, S = G.newState(); S.village.story.introDone = true; S.village.seenIntro = true; S.village.story.chapter = 1; S.settings.sound = sound;
      if (pre) (new Function('S', pre))(S);
      G.depart(S, 4242);
      while (S.run.floor < 15) { const r = S.run; r.enemies = r.enemies.filter((e) => e.boss); r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      S.run.player.hp = S.run.player.maxhp = 999; S.run.enemies = S.run.enemies.filter((e) => e.boss);
      TS.Save.save(S); }, [opts.sound !== false, opts.pre || null]);
    await p.reload(); await p.waitForTimeout(500); await p.tap('#btn-continue'); await p.waitForTimeout(900);
    await p.evaluate(() => { for (const b of document.querySelectorAll('#modal-root .back')) b.remove(); TS.UI.modals.length = 0; });
    if (opts.rejectFirst) await p.evaluate(() => { const real = HTMLMediaElement.prototype.play; let n = 0; HTMLMediaElement.prototype.play = function () { if (n++ === 0) return Promise.reject(new DOMException('no', 'NotAllowedError')); return real.call(this); }; });
    return { ctx, p };
  }
  // 入口の外の通路へ置き、部屋へ入る向きを返す
  const toDoor = (p) => p.evaluate(() => { const run = TS.UI.S.run, A = run.bossFight, DG = TS.Dungeon, ds = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    for (let y = A.y - 1; y <= A.y + A.h; y++) for (let x = A.x - 1; x <= A.x + A.w; x++) { if (TS.Game.inArena(run, x, y) || !DG.passable(run.map, x, y)) continue;
      for (const [d, [dx, dy]] of Object.entries(ds)) if (TS.Game.inArena(run, x + dx, y + dy) && DG.passable(run.map, x + dx, y + dy) && !TS.Game.enemyAt(run, x + dx, y + dy)) { run.player.x = x; run.player.y = y; TS.Game.updateVision(run); return d; } }
    return null; });
  const key = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  const state = (p) => p.evaluate(() => { const run = TS.UI.S.run, A = run.bossFight, b = run.enemies.find((e) => e.boss), v = document.querySelector('.movie video');
    return { movie: !!document.querySelector('.movie'), intro: A.intro || null, engaged: A.engaged, turn: run.turn, pos: [run.player.x, run.player.y], boss: b && [b.x, b.y, b.hp], hold: TS.Audio.bgmHold, bgm: TS.Audio.bgmName,
      seen: !!TS.UI.S.village.story.introSeen.croc, starts: run.log.filter((l) => l.includes('との戦いが始まった')).length, t: v ? v.currentTime : null, muted: v ? v.muted : null,
      play: (() => { const e = document.querySelector('.movie-play'); return e && !e.hidden ? e.textContent : null; })(), msg: (() => { const e = document.querySelector('.movie-msg'); return e && !e.hidden ? e.textContent : null; })(),
      saved: (() => { const d = TS.Save.load(); return d && d.run && d.run.bossFight ? (d.run.bossFight.intro || null) + '/' + d.run.bossFight.engaged : null; })() }; });
  const enter = async (p) => { const d = await toDoor(p); await p.waitForTimeout(200); const s0 = await state(p); await p.keyboard.press(key[d]); await p.waitForTimeout(400); return { d, s0 }; };
  const waitGone = async (p, ms) => { for (let i = 0; i < ms / 100 && await p.evaluate(() => !!document.querySelector('.movie')); i++) await p.waitForTimeout(100); };

  // 1. 初回入室（3つの幅）：階段で降りた時点・通路では流れない → 入室で流れる → 動画中は止まる → 最後まで → 一度だけ開始・ボス曲・保存 → 再入室で流れない
  for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
    if (only && only !== 'full') break;
    const { ctx, p } = await setup(w, h);
    let s = await state(p); chk(!s.movie && !s.intro && !s.engaged, `${w} ボスの階に着いただけでは流れない`);
    const d = await toDoor(p); for (let i = 0; i < 3; i++) await p.keyboard.press('Space'); await p.waitForTimeout(300);
    s = await state(p); chk(!s.movie && !s.intro, `${w} 通路で待っても流れない`);
    await p.keyboard.press(key[d]); await p.waitForTimeout(500);
    const s1 = await state(p);
    chk(s1.movie && s1.intro === 'pending' && !s1.engaged && s1.hold && s1.saved === 'pending/false', `${w} 入室でムービー（戦いはまだ・曲は止める・保存は pending）${JSON.stringify(s1)}`);
    const box = await p.evaluate(() => { const v = document.querySelector('.movie video'), r = v.getBoundingClientRect(); return { r: [r.width, r.height], fit: getComputedStyle(v).objectFit, vw: innerWidth, vh: innerHeight, skip: (() => { const s = document.querySelector('.movie-skip').getBoundingClientRect(); return [s.right <= innerWidth, s.bottom <= innerHeight, s.width >= 100, s.height >= 44]; })() }; });
    chk(box.fit === 'contain' && box.r[0] === box.vw && box.r[1] === box.vh && box.skip.every(Boolean), `${w} 動画は画面いっぱいの枠に contain・スキップは画面内で大きい ${JSON.stringify(box)}`);
    // 動画中の入力：キー・方向ボタン（重なっているのでタップは動画が受ける）
    for (const k of ['ArrowUp', 'ArrowLeft', 'Space', 'ArrowDown']) await p.keyboard.press(k);
    const dp = await p.evaluate(() => { const e = document.querySelector('#dpad [data-dir="up"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    if (dp) { await p.touchscreen.tap(dp.x, dp.y); await p.touchscreen.tap(dp.x, dp.y); }
    await p.waitForTimeout(2500);
    const s2 = await state(p);
    chk(s2.movie && s2.turn === s1.turn && s2.pos.join() === s1.pos.join() && s2.boss.join() === s1.boss.join() && !s2.engaged, `${w} 動画中はターン・たけ・ボス（位置とHP）が止まる ${JSON.stringify([s1.turn, s2.turn, s1.boss, s2.boss])}`);
    chk(s2.t > 1, `${w} 動画が進んでいる t=${s2.t}`);
    await p.screenshot({ path: path.join(OUT, `movie_${w}.png`) });
    await waitGone(p, 12000);
    const s3 = await state(p);
    chk(!s3.movie && s3.intro === 'done' && s3.engaged && s3.starts === 1 && !s3.hold && s3.bgm === 'boss' && s3.seen && s3.saved === 'done/true' && s3.turn === s1.turn, `${w} 最後まで見ると一度だけ戦い開始・ボス曲・保存 ${JSON.stringify(s3)}`);
    await p.waitForTimeout(400); await p.evaluate(() => { for (const b of document.querySelectorAll('#modal-root .back')) b.remove(); TS.UI.modals.length = 0; });
    await p.screenshot({ path: path.join(OUT, `after_${w}.png`) });
    // 操作が戻る：1歩動ける（ターンが進む）
    const t0 = (await state(p)).turn; await p.keyboard.press('Space'); await p.waitForTimeout(300);
    chk((await state(p)).turn === t0 + 1, `${w} 操作が戻る（足踏みで1ターン）`);
    // 再入室：部屋の外へ出て戻っても流れない（戦い中は部屋の外へ出られないので、位置を直接動かして確認）
    await p.evaluate(() => { const run = TS.UI.S.run; run.bossFight.engaged = true; });
    const d2 = await toDoor(p); await p.keyboard.press(key[d2]); await p.waitForTimeout(500);
    const s4 = await state(p); chk(!s4.movie && s4.starts === 1, `${w} 再入室で流れない`);
    // 次の探索でも流れない（introSeen）
    const again = await p.evaluate(() => { const S = TS.UI.S, G = TS.Game; S.run = null; G.depart(S, 777); while (S.run.floor < 15) { const r = S.run; r.enemies = r.enemies.filter((e) => e.boss); r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      const run = S.run, A = run.bossFight; const c = G.arenaCenter(run, run.enemies); run.player.x = c.x; run.player.y = c.y; const r = G.act(S, { type: 'wait' }); return { ev: r.events.map((e) => e.t), engaged: A.engaged, intro: A.intro || null }; });
    chk(!again.ev.includes('bossIntro') && again.engaged, `${w} 次の探索の入室でも流れない ${JSON.stringify(again)}`);
    chk(!p.errs.length, `${w} エラーなし ${p.errs.join('|')}`);
    await ctx.close();
  }
  if (only === 'land') { const { ctx, p } = await setup(844, 390); await enter(p); await p.waitForTimeout(1500);
    const box = await p.evaluate(() => { const v = document.querySelector('.movie video'), r = v.getBoundingClientRect(); return [r.width, r.height, getComputedStyle(v).objectFit, innerWidth, innerHeight]; });
    chk(box[0] === 844 && box[1] === 390 && box[2] === 'contain', 'landscape contain ' + JSON.stringify(box)); await p.screenshot({ path: path.join(OUT, 'landscape.png') }); await ctx.close(); }
  if (!only || only === 'cases') {
    // 2. スキップ連打
    { const { ctx, p } = await setup(390, 844); await enter(p); await p.waitForTimeout(600);
      const sk = await p.evaluate(() => { const r = document.querySelector('.movie-skip').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      for (let i = 0; i < 6; i++) await p.touchscreen.tap(sk.x, sk.y);
      await p.waitForTimeout(500); const s = await state(p);
      chk(!s.movie && s.engaged && s.starts === 1 && s.bgm === 'boss' && s.seen && !s.hold, `スキップ連打で一度だけ開始 ${JSON.stringify(s)}`);
      chk(await p.evaluate(() => !document.querySelector('video')), 'video要素が残らない（音の残りなし）');
      await ctx.close(); }
    // 3. 終了直前のスキップ
    { const { ctx, p } = await setup(390, 844); await enter(p); await p.waitForTimeout(800);
      await p.evaluate(() => { const v = document.querySelector('.movie video'); v.currentTime = Math.max(0, v.duration - 0.25); });
      await p.waitForTimeout(120); await p.click('.movie-skip').catch(() => {}); await p.waitForTimeout(900);
      const s = await state(p); chk(!s.movie && s.starts === 1 && s.engaged, `終了直前のスキップでも一度だけ ${JSON.stringify(s)}`); await ctx.close(); }
    // 4. Escキー＝スキップ
    { const { ctx, p } = await setup(390, 844); await enter(p); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
      const s = await state(p); chk(!s.movie && s.starts === 1, 'Escキーでスキップ'); await ctx.close(); }
    // 5. 音付き自動再生の拒否 → 「タップして再生」→ タップで再生
    { const { ctx, p } = await setup(390, 844, { rejectFirst: true }); await enter(p); await p.waitForTimeout(500);
      let s = await state(p); chk(s.movie && s.play && s.play.includes('タップして再生') && !s.muted && !s.engaged, `拒否されたら「タップして再生」（消音にしない）${JSON.stringify(s)}`);
      await p.screenshot({ path: path.join(OUT, 'tap_to_play_390.png') });
      await p.click('.movie-play'); await p.waitForTimeout(1500); s = await state(p);
      chk(s.movie && !s.play && s.t > 0.5, `タップで再生が始まる t=${s.t}`); await ctx.close(); }
    // 6. 音オフ（ミュート）のとき：消音で流れる
    { const { ctx, p } = await setup(390, 844, { sound: false }); await enter(p); await p.waitForTimeout(600);
      const s = await state(p); chk(s.movie && s.muted === true, '音オフでは消音'); await ctx.close(); }
    // 7. 404：短く知らせて戦いへ
    { const { ctx, p } = await setup(390, 844, { route: '404' }); await enter(p); await p.waitForTimeout(300);
      let s = await state(p); chk(s.movie && s.msg && s.msg.includes('読み込めません'), `404：案内 ${s.msg}`);
      await waitGone(p, 3000); s = await state(p); chk(!s.movie && s.engaged && s.starts === 1 && s.bgm === 'boss', `404：そのまま一度だけ戦い開始 ${JSON.stringify(s)}`); await ctx.close(); }
    // 8. 形式が再生できない（このPCの Chromium に元の mp4 を渡す＝H.264 が無い環境）
    { const { ctx, p } = await setup(390, 844, { route: 'real' }); await enter(p); await waitGone(p, 4000);
      const s = await state(p); chk(!s.movie && s.engaged && s.starts === 1, `再生できない形式でも固まらず戦いへ ${JSON.stringify(s)}`); await ctx.close(); }
    // 9. 低速回線：待っている間もスキップでき、長いと案内
    { const { ctx, p } = await setup(390, 844, { route: 'slow' }); await enter(p); await p.waitForTimeout(7000);
      let s = await state(p); chk(s.movie && !s.engaged, `低速：待っている間は止まったまま ${JSON.stringify({ msg: s.msg, play: s.play })}`);
      await p.click('.movie-skip'); await p.waitForTimeout(400); s = await state(p); chk(!s.movie && s.starts === 1, '低速：スキップできる'); await ctx.close(); }
    // 10. アプリを裏へ → 一時停止・戦いは進まない → 戻ると「タップして再開」
    { const { ctx, p } = await setup(390, 844); await enter(p); await p.waitForTimeout(1200);
      await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
      const t1 = (await state(p)).t; await p.waitForTimeout(1500); let s = await state(p);
      chk(s.movie && Math.abs(s.t - t1) < 0.05 && !s.engaged, `裏にすると一時停止 ${t1}→${s.t}`);
      await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
      await p.waitForTimeout(200); s = await state(p); chk(s.play && s.play.includes('再開'), '戻ると「タップして再開」');
      await p.click('.movie-play'); await p.waitForTimeout(800); s = await state(p); chk(s.t > t1 + 0.3, '再開できる'); await ctx.close(); }
    // 11. ムービー中に読み込み直し → つづきから：ボスのHP・位置そのままで、ムービーを流し直す（スキップできる）
    { const { ctx, p } = await setup(390, 844); await enter(p); await p.waitForTimeout(800);
      const s0 = await state(p);
      await p.reload(); await p.waitForTimeout(500); await p.tap('#btn-continue'); await p.waitForTimeout(1200);
      let s = await state(p); chk(s.movie && s.intro === 'pending' && s.boss.join() === s0.boss.join() && !s.engaged, `読み込み直し：ムービーから再開 ${JSON.stringify(s)}`);
      await p.click('.movie-skip'); await p.waitForTimeout(400); s = await state(p); chk(!s.movie && s.starts === 1 && s.engaged, '読み込み直し後：スキップで戦いへ'); await ctx.close(); }
    // 12. 以前のセーブ：すでに戦い中（intro なし・engaged）→ 流さない。HPそのまま
    { const { ctx, p } = await setup(390, 844, { pre: '' }); 
      const r = await p.evaluate(() => { const S = TS.UI.S, run = S.run, A = run.bossFight, b = run.enemies.find((e) => e.boss); const c = TS.Game.arenaCenter(run, run.enemies); run.player.x = c.x; run.player.y = c.y; A.engaged = true; delete A.intro; b.hp = 123; TS.Save.save(S); return b.hp; });
      await p.reload(); await p.waitForTimeout(500); await p.tap('#btn-continue'); await p.waitForTimeout(1000);
      await p.evaluate(() => { for (const b of document.querySelectorAll('#modal-root .back')) b.remove(); TS.UI.modals.length = 0; });
      await p.keyboard.press('Space'); await p.waitForTimeout(400);
      const s = await state(p); chk(!s.movie && !s.intro && s.engaged && s.boss[2] <= 123, `戦い中のセーブ：流さず続き（HP ${s.boss[2]}）`); await ctx.close(); }
    // 13. ムービーを見たことがある（introSeen）セーブ：流さず、今までどおり入室で戦い開始
    { const { ctx, p } = await setup(390, 844, { pre: 'S.village.story.introSeen = { croc: true };' }); await enter(p);
      const s = await state(p); chk(!s.movie && s.engaged && s.starts === 1 && s.bgm === 'boss', `見たことがあれば入室ですぐ戦い ${JSON.stringify(s)}`); await ctx.close(); }
  }
  console.log('合計 OK', ok, 'NG', ng); await b.close(); srv.close();
})();
