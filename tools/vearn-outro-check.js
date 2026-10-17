// 大魔王バーン（版3の30階）の撃破後ムービー（ミストバーンが時の裂け目へ連れ去る）の確認：node tools/vearn-outro-check.js [リポジトリ] [出力フォルダ] [VP9のwebm]
// このPCの Chromium（Playwright）は H.264 を再生できないので、同じ動画を VP9 にした webm を差し替えて流す（実際のスマホは mp4 をそのまま再生する）。
// webm の作り方：ffmpeg -i assets/movies/vearn-taken.mp4 -c:v libvpx-vp9 -b:v 1M -deadline realtime -cpu-used 8 -c:a libopus /tmp/vearn-taken.webm
// 確かめること：HP0 → 撃破の演出 → ムービー（操作・ターン・曲は止まる）→ 最後まで／スキップ／読み込み失敗のどれでも同じ30階のボス部屋に戻り、ティウの救援へ。
// 村へは戻らない。バーンは戻らない。ローブは1回だけ。二重に流れない。途中で読み込み直すと流し直す。ムービーのあとに読み込み直したら流さずに救援へ
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..'), OUT = process.argv[3] || path.join(ROOT, 'tests', 'screenshots', 'vearn-outro'), WEBM = process.argv[4]; fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type': {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.mp4':'video/mp4','.jpg':'image/jpeg'}[path.extname(f)]||'application/octet-stream'}); r.end(d); }); }).listen(8806);
let ok = 0, ng = 0; const chk = (c, m) => { if (c) ok++; else ng++; console.log(c ? 'OK' : 'NG', m); };
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const closeTalk = async (p) => { for (let i = 0; i < 40 && await p.$('.talk'); i++) { await p.tap('.modal-buttons button.primary'); await p.waitForTimeout(50); } };
  async function setup(w, h, opts = {}) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
    p.reqs = []; p.on('request', (q) => { if (q.url().endsWith('.mp4')) p.reqs.push(q.url().split('/').pop()); });
    await p.route('**/vearn-taken.mp4', async (route) => {
      if (opts.route === '404') return route.fulfill({ status: 404, body: '' });
      route.fulfill({ status: 200, contentType: 'video/webm', body: fs.readFileSync(WEBM) });
    });
    await p.goto('http://localhost:8806/'); await p.waitForTimeout(400);
    await p.evaluate(() => { localStorage.clear(); const G = TS.Game, S = G.newState(), V = S.village; V.story.introDone = true; V.seenIntro = true; V.story.chapter = 6;
      V.story.introSeen = { vearn: true };   // 登場ムービーは見た扱い（intro-titled-check.js で確かめる。ここでは撃破後だけを見る）
      G.depart(S, 4242); while (S.run.floor < 30) { const r = S.run; r.player.x = r.stairs.x; r.player.y = r.stairs.y; G.act(S, { type: 'descend' }); }
      const r = S.run; r.enemies = r.enemies.filter((e) => e.boss); r.player.hp = r.player.maxhp = 9999; r.player.half = 0;
      const bo = r.enemies[0]; bo.hp = 1; bo.sleep = 99; bo.cds = { circle: 9, bird: 9, summon: 9 };
      for (const [d, [dx, dy]] of Object.entries(G.DIRS)) { const x = bo.x - dx, y = bo.y - dy;
        if (['up', 'down', 'left', 'right'].includes(d) && G.canStep(r.map, x, y, dx, dy) && !G.enemyAt(r, x, y)) { r.player.x = x; r.player.y = y; r.dirToBoss = d; break; } }
      G.updateVision(r); G.checkBossRoom(S, []); bo.hold = 0; TS.Save.save(S); });
    await p.reload(); await p.waitForTimeout(500); await p.tap('#btn-continue'); await p.waitForTimeout(900);
    await closeTalk(p);
    await p.evaluate(() => { while (TS.UI.modals.length) TS.UI.modals[TS.UI.modals.length - 1].close(); });
    await p.waitForTimeout(200);
    return { ctx, p };
  }
  const st = (p) => p.evaluate(() => { const S = TS.UI.S, r = S.run, v = document.querySelector('.movie video');
    return { screen: TS.UI.screen, floor: r ? r.floor : null, movie: !!document.querySelector('.movie'), videoSrc: v ? v.src.split('/').pop() : null, pm: r.postMovie || null, turn: r.turn, pos: [r.player.x, r.player.y],
      vearn: r.enemies.some((e) => e.type === 'vearn'), hold: TS.Audio.bgmHold, rescue: r.final && r.final.rescue,
      rescueOpen: !!document.querySelector('.modal h2') && document.querySelector('.modal h2').textContent.includes('ティウの救援'),
      talk: (() => { const t = document.querySelector('.talk'); return t ? t.textContent.slice(0, 30) : null; })(),
      robes: r.floorItems.filter((f) => f.item && f.item.id === 'demon_robe').length, seen: !!(S.village.story.moviesSeen || {}).vearnTaken,
      saved: (() => { const d = TS.Save.load(); return d && d.run ? d.run.postMovie || null : 'x'; })(), msg: (() => { const e = document.querySelector('.movie-msg'); return e && !e.hidden ? e.textContent : null; })(),
      t: v ? v.currentTime : null, muted: v ? v.muted : null }; });
  const kill = async (p) => { const d = await p.evaluate(() => TS.UI.S.run.dirToBoss); await p.tap(`#dpad [data-dir="${d}"]`); };
  const waitMovie = async (p, ms) => { for (let i = 0; i < ms / 100 && !(await p.$('.movie')); i++) await p.waitForTimeout(100); };
  const waitGone = async (p, ms) => { for (let i = 0; i < ms / 100 && await p.$('.movie'); i++) await p.waitForTimeout(100); };
  const waitRescue = async (p, ms) => { for (let i = 0; i < ms / 100 && !(await st(p)).rescueOpen; i++) { await closeTalk(p); await p.waitForTimeout(100); } };
  // ムービーのあと：同じ30階のボス部屋のまま、ティウの救援の画面が開く（村へは戻らない）
  const after = async (p, w, label, s0) => {
    await waitRescue(p, 4000);
    const s = await st(p);
    chk(!s.movie && !s.pm && s.saved === null && s.seen, `${w} ${label}：ムービーは終わり・保存も済み ${JSON.stringify(s)}`);
    chk(s.screen === 'dungeon' && s.floor === 30 && s.pos.join() === s0.pos.join() && !s.vearn && s.rescueOpen && s.rescue === 'pending', `${w} ${label}：同じ30階のボス部屋に戻り、バーンはいない・ティウの救援へ（村へは戻らない）`);
    chk(s.robes === 1, `${w} ${label}：大魔王のローブは1つだけ（${s.robes}）`);
    chk(!p.errs.length, `${w} ${label}：エラーなし ${p.errs.join(' / ')}`);
    return s;
  };

  // 1. 最後まで見る（3つの幅）
  for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
    const { ctx, p } = await setup(w, h);
    chk(await p.evaluate(() => TS.Data.BOSS_INTROS.vearn === 'vearn' && !!TS.ASSETS.movies.vearn && !!TS.ASSETS.movies.vearnTaken), `${w} 登場ムービー（vearn）は残したまま、撃破後ムービー（vearnTaken）を追加`);
    const pos0 = await p.evaluate(() => [TS.UI.S.run.player.x, TS.UI.S.run.player.y]);
    await kill(p); await p.waitForTimeout(250);
    const s0 = await st(p);
    chk(!s0.vearn && s0.pm === 'vearnTaken' && s0.saved === 'vearnTaken' && !s0.movie && s0.hold && s0.robes === 1 && !s0.rescueOpen, `${w} HP0：まず撃破の演出（ムービーの予約は保存済み・曲は止める・ローブは撃破のときに1つ） ${JSON.stringify(s0)}`);
    chk(s0.pos.join() === pos0.join(), `${w} 撃破の1手でたけの位置は変わらない`);
    if (w === 390) await p.screenshot({ path: path.join(OUT, `defeat_effect_${w}.png`) });
    await p.tap('#dpad [data-dir="up"]'); await p.keyboard.press('Space'); await p.waitForTimeout(200);
    chk((await st(p)).turn === s0.turn, `${w} 演出からムービーまでの間：操作できない`);
    await waitMovie(p, 4000); await p.waitForTimeout(1500);
    const s1 = await st(p);
    const box = await p.evaluate(() => { const v = document.querySelector('.movie video'), r = v.getBoundingClientRect(); return { r: [r.width, r.height], fit: getComputedStyle(v).objectFit, vw: innerWidth, vh: innerHeight, vid: [v.videoWidth, v.videoHeight] }; });
    chk(s1.movie && s1.videoSrc === 'vearn-taken.mp4' && s1.t > 0.3 && !s1.muted && s1.hold && !s1.rescueOpen, `${w} ムービーが流れる（動画の音あり・ゲームの曲は止める・救援はまだ） ${JSON.stringify(s1)}`);
    chk(box.fit === 'contain' && box.r[0] === box.vw && box.r[1] === box.vh, `${w} 縦横比を保って全体を見せる（contain） ${JSON.stringify(box)}`);
    if (w !== 360) await p.screenshot({ path: path.join(OUT, `movie_${w}.png`) });
    for (const k of ['ArrowUp', 'ArrowLeft', 'Space', 'ArrowDown']) await p.keyboard.press(k);
    await p.dispatchEvent('#dpad [data-dir="up"]', 'pointerdown', { pointerId: 3 }); await p.waitForTimeout(500); await p.dispatchEvent('#dpad [data-dir="up"]', 'pointerup', { pointerId: 3 });
    const s2 = await st(p);
    chk(s2.turn === s0.turn && s2.pos.join() === s0.pos.join() && s2.movie, `${w} ムービー中：キー・方向ボタンでターンも位置も変わらない`);
    await waitGone(p, 14000);
    await after(p, w, '最後まで', s0);
    chk(p.reqs.filter((u) => u === 'vearn-taken.mp4').length === 1, `${w} 1回だけ流れる（読み込み ${p.reqs.join()}）`);
    if (w === 390) await p.screenshot({ path: path.join(OUT, `after_${w}.png`) });
    await ctx.close();
  }
  // 2. スキップ（連打しても1回）
  { const { ctx, p } = await setup(390, 844); await kill(p); await p.waitForTimeout(250); const s0 = await st(p); await waitMovie(p, 4000); await p.waitForTimeout(800);
    await p.evaluate(() => { const s = document.querySelector('.movie-skip'); s.click(); s.click(); s.click(); });
    await p.waitForTimeout(1000);
    chk(await p.evaluate(() => !document.querySelector('.movie') && !document.querySelector('video')), '390 スキップ連打：1回だけ終わり、動画も残らない');
    await after(p, 390, 'スキップ', s0);
    chk(await p.evaluate(() => document.querySelectorAll('.modal h2').length === 1), '390 スキップ連打：救援の画面は1つだけ');
    await ctx.close(); }
  // 3. 読み込み失敗（404）
  { const { ctx, p } = await setup(390, 844, { route: '404' }); await kill(p); await p.waitForTimeout(250); const s0 = await st(p); await waitMovie(p, 4000); await p.waitForTimeout(400);
    const s = await st(p); chk(s.msg && s.msg.includes('続きへ進みます'), `390 読み込み失敗：案内 ${s.msg}`);
    await waitGone(p, 3000); await after(p, 390, '読み込み失敗', s0); await ctx.close(); }
  // 4. ムービーの途中で読み込み直す → 「つづきから」で最初から流し直す → スキップ → 救援。ローブは増えない・二重に流れない
  { const { ctx, p } = await setup(390, 844); await kill(p); await p.waitForTimeout(250); const s0 = await st(p); await waitMovie(p, 4000); await p.waitForTimeout(1000);
    await p.reload(); await p.waitForTimeout(500); p.reqs.length = 0; await p.tap('#btn-continue'); await waitMovie(p, 3000); await p.waitForTimeout(800);
    const s = await st(p); chk(s.movie && s.pm === 'vearnTaken' && !s.vearn && !s.rescueOpen, `390 読み込み直し：ムービーを流し直す ${JSON.stringify(s)}`);
    await p.tap('.movie-skip'); await p.waitForTimeout(800);
    await after(p, 390, '読み込み直し', s0);
    chk(await p.evaluate(() => !document.querySelector('.movie') && document.querySelectorAll('.modal h2').length === 1) && p.reqs.filter((u) => u === 'vearn-taken.mp4').length === 1, `390 読み込み直し：二重に流れない・救援の画面は1つ（${p.reqs.join()}）`);
    // 5. 救援の画面のまま読み込み直す → ムービーは流さず、救援の画面だけ開き直す
    await p.reload(); await p.waitForTimeout(500); p.reqs.length = 0; await p.tap('#btn-continue'); await p.waitForTimeout(1500); await closeTalk(p); await p.waitForTimeout(300);
    const s5 = await st(p); chk(!s5.movie && s5.rescueOpen && !p.reqs.includes('vearn-taken.mp4'), `390 ムービーのあとで読み込み直し：流さずに救援の画面へ ${JSON.stringify(s5)}`);
    await ctx.close(); }
  await b.close(); srv.close();
  console.log('合計 OK', ok, 'NG', ng);
})();
